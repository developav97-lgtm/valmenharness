/**
 * Crear y quitar el worktree de un ticket (corrida orquestada).
 *
 * `crearWorktree` deja `.claude/worktrees/ticket-<slug>` con la rama `valmen/ticket-<slug>` desde
 * la rama base del proyecto (`execution.base-branch`, `main` si no se declara), con `node_modules` clonado y compilado, y reserva un cupo de la capacidad de la máquina.
 * Es atómico: un fallo después de la primera escritura deshace en orden inverso. `quitarWorktree`
 * solo borra lo ya integrado: no integra, no fuerza y no publica. Todo el git y los procesos salen
 * de las listas cerradas de `worktree-git.ts`.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  rmdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, sep } from "node:path";

import { EXIT_INVARIANT, atomicWrite, createExecutionIdentity, fail } from "@valmen/core";
import {
  CLAUDE_SETTINGS_PATH,
  missingClaudeDenyRules,
  parseConfig,
  projectFiles,
  readSharedProjectPolicy,
} from "@valmen/adapter";

import { findTicket, type RegistryPaths } from "./discovery.js";
import { estadoDelArbolDeTrabajo } from "./integration-commit.js";
import { type EjecutorDeGit } from "./integration-rules.js";
import {
  claimMachineCapacity,
  readMachineCapacity,
  releaseMachineCapacity,
} from "./machine-capacity.js";
import { resolveAuthorizedProject, type AuthorizedProject } from "./project-resolution.js";
import { ramaBaseDelProyecto } from "./rama-base.js";
import {
  type EjecutorDeProceso,
  ejecutarGitDeWorktree,
  ejecutarProcesoDeWorktree,
  exigirCheckoutPrincipal,
  nombresDeWorktree,
  tieneRecetaDeCompilacion,
} from "./worktree-git.js";

/** El intento con el que el worktree de un ticket reserva y libera su cupo. */
export const INTENTO_DE_WORKTREE = "worktree";

export interface WorktreeRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly home?: string | undefined;
  readonly git?: EjecutorDeGit | undefined;
  readonly proceso?: EjecutorDeProceso | undefined;
}

export interface WorktreeCreado {
  readonly carpeta: string;
  readonly rama: string;
  /** La rama base de la que salió (`execution.base-branch`). */
  readonly ramaBase: string;
  readonly commit: string;
  readonly reserva: "reservada" | "no-declarada";
  readonly avisos: readonly string[];
}

export interface WorktreeQuitado {
  readonly carpeta: string;
  readonly rama: string;
  /** La rama base contra la que se comprobó la integración. */
  readonly ramaBase: string;
  readonly reserva: "liberada" | "sin-reserva" | "no-declarada";
  readonly avisos: readonly string[];
}

/** El proyecto autorizado de esta raíz, o `null` si la máquina no lo declara. */
export function proyectoDeLaMaquina(
  paths: RegistryPaths,
  home: string,
): AuthorizedProject | null {
  try {
    const config = readFileSync(join(paths.root, ".valmen", "config.yaml"), "utf8");
    const projectId = readSharedProjectPolicy(parseConfig(config)).projectId;
    if (projectId === null) return null;
    const project = resolveAuthorizedProject({ projectId, home });
    return realpathSync(project.root) === realpathSync(paths.root) ? project : null;
  } catch {
    return null;
  }
}

const quitarLaBarraFinal = (texto: string): string => texto.replace(/[/\\]+$/, "");

/** Las carpetas de worktree que git conoce, con su ruta real. */
function worktreesRegistrados(root: string, git?: EjecutorDeGit): string[] {
  const r = ejecutarGitDeWorktree(root, ["worktree", "list", "--porcelain"], git);
  if (r.status !== 0) fail(`git worktree list falló: ${r.stderr.trim()}`, EXIT_INVARIANT);
  return r.stdout
    .split("\n")
    .filter((linea) => linea.startsWith("worktree "))
    .map((linea) => quitarLaBarraFinal(linea.slice("worktree ".length)));
}

function ramaExiste(root: string, rama: string, git?: EjecutorDeGit): boolean {
  const r = ejecutarGitDeWorktree(root, ["branch", "--list", rama], git);
  if (r.status !== 0) fail(`git branch falló: ${r.stderr.trim()}`, EXIT_INVARIANT);
  return r.stdout.trim() !== "";
}

/** Los enlaces de `node_modules/@valmen` que no resuelven dentro del worktree. */
function enlacesFueraDelWorktree(carpetaAbsoluta: string): string[] {
  const alcance = join(carpetaAbsoluta, "node_modules", "@valmen");
  if (!existsSync(alcance)) return [];
  const dentro = realpathSync(carpetaAbsoluta) + sep;
  const fuera: string[] = [];
  for (const nombre of readdirSync(alcance)) {
    try {
      if (!(realpathSync(join(alcance, nombre)) + sep).startsWith(dentro))
        fuera.push(nombre);
    } catch {
      fuera.push(nombre);
    }
  }
  return fuera;
}

/**
 * Lleva las denegaciones del harness al worktree que acaba de nacer.
 *
 * `.claude/` no se versiona en muchos proyectos —en este mismo repositorio está ignorado—, así
 * que un worktree nace sin `.claude/settings.json` y un agente que trabaje ahí correría sin
 * ninguna denegación: Claude Code no hereda las reglas del checkout padre. Si el proyecto proyecta
 * a `claude` y el worktree no trae el archivo de git, se escribe el que proyecta `valmen sync` para
 * la raíz (las reglas de la persona más las del harness) y se comprueba que git lo ignora: un
 * archivo sin rastrear se borra y se avisa, para no colarlo en el commit del ticket. Si el worktree
 * lo trae versionado no se toca: solo se avisa de las denegaciones que le falten.
 *
 * Devuelve los avisos. Un fallo (config inválida, `settings.json` que no parsea) lo lanza quien
 * llama para deshacer el worktree: crear uno sin denegaciones y con un aviso las deja sin ellas.
 */
function dejarDenegacionesEnElWorktree(
  root: string,
  absoluta: string,
  git?: EjecutorDeGit,
): string[] {
  const proyectado = projectFiles(root, basename(root)).files.find(
    (f) => f.path === CLAUDE_SETTINGS_PATH,
  );
  if (proyectado === undefined) return [];

  const destino = join(absoluta, CLAUDE_SETTINGS_PATH);
  if (existsSync(destino)) {
    const faltan = missingClaudeDenyRules(readFileSync(destino, "utf8"));
    return faltan.length === 0
      ? []
      : [
          `${CLAUDE_SETTINGS_PATH} del worktree viene de git y le faltan ${faltan.length} denegación(es) del harness: ` +
            "no se tocó; corre `valmen sync` en el checkout principal y versiona el resultado.",
        ];
  }

  const carpetaPropia = !existsSync(dirname(destino));
  atomicWrite(destino, proyectado.content);
  const estado = ejecutarGitDeWorktree(absoluta, ["status", "--porcelain", "-uall"], git);
  if (estado.status !== 0)
    fail(`git status falló en el worktree: ${estado.stderr.trim()}`, EXIT_INVARIANT);
  const sinRastrear = estado.stdout
    .split("\n")
    .some((linea) => linea.startsWith("??") && linea.endsWith(CLAUDE_SETTINGS_PATH));
  if (!sinRastrear) return [];

  rmSync(destino);
  if (carpetaPropia) rmdirSync(dirname(destino));
  return [
    `No se dejó ${CLAUDE_SETTINGS_PATH} en el worktree: git no lo ignora y entraría al commit del ticket. ` +
      "Los agentes de ese worktree correrán sin las denegaciones del harness: ignora `.claude/` en el `.gitignore` o versiona el archivo.",
  ];
}

export function crearWorktree(request: WorktreeRequest): WorktreeCreado {
  const { paths, git } = request;
  const home = request.home ?? homedir();
  const root = paths.root;
  const { slug, carpeta, rama } = nombresDeWorktree(request.ticketId);
  const absoluta = join(root, carpeta);

  exigirCheckoutPrincipal(root, git);
  const ramaBase = ramaBaseDelProyecto(root);

  const ticket = findTicket(paths, request.ticketId);
  if (ticket === undefined)
    fail(`El ticket ${request.ticketId} no está registrado.`, EXIT_INVARIANT);
  const enBase = ejecutarGitDeWorktree(
    root,
    ["cat-file", "-e", `${ramaBase}:${ticket.relativePath}`],
    git,
  );
  if (enBase.status !== 0) {
    fail(
      `El ticket ${request.ticketId} no está registrado en ${ramaBase} (${ticket.relativePath}): commitéalo antes de crear su worktree ` +
        `(\`git add ${dirname(ticket.relativePath)} && git commit -m "docs(ticket): registra ${request.ticketId}"\`), ` +
        `porque el worktree sale de ${ramaBase} y la rama del ticket chocaría con el archivo sin commitear al integrarla.`,
      EXIT_INVARIANT,
    );
  }

  if (
    existsSync(absoluta) ||
    worktreesRegistrados(root, git).some(
      (w) => w === absoluta || w === quitarLaBarraFinal(realpathOrSame(absoluta)),
    )
  ) {
    fail(`El worktree ${carpeta} ya existe: no se toca.`, EXIT_INVARIANT);
  }
  if (ramaExiste(root, rama, git))
    fail(`La rama ${rama} ya existe: no se toca.`, EXIT_INVARIANT);

  const avisos: string[] = [];
  const project = proyectoDeLaMaquina(paths, home);
  const identity =
    project === null
      ? null
      : createExecutionIdentity({
          projectId: project.projectId,
          ticketId: request.ticketId,
          executionId: `worktree-${slug}`,
        });
  let reservada = false;
  if (project !== null && identity !== null) {
    const reserva = claimMachineCapacity({
      home,
      project,
      identity,
      attemptId: INTENTO_DE_WORKTREE,
    });
    if (!reserva.granted) {
      fail(
        `La capacidad de la máquina no tiene cupo (${reserva.capacity} en uso): no se crea el worktree de ${request.ticketId}.`,
        EXIT_INVARIANT,
      );
    }
    reservada = true;
  } else {
    avisos.push(
      "El proyecto no está declarado en la máquina: no se reservó cupo de capacidad.",
    );
  }

  let worktreeCreado = false;
  let ramaCreada = false;
  const deshacer = (): string[] => {
    const problemas: string[] = [];
    if (worktreeCreado) {
      const r = ejecutarGitDeWorktree(root, ["worktree", "remove", carpeta], git);
      if (r.status !== 0)
        problemas.push(`no se pudo quitar el worktree: ${r.stderr.trim()}`);
      else worktreeCreado = false;
    }
    if (ramaCreada && !worktreeCreado) {
      const r = ejecutarGitDeWorktree(root, ["branch", "-d", rama], git);
      if (r.status !== 0) problemas.push(`no se pudo borrar la rama: ${r.stderr.trim()}`);
    }
    if (reservada && project !== null && identity !== null) {
      try {
        releaseMachineCapacity({ home, project, identity, attemptId: INTENTO_DE_WORKTREE });
      } catch (caught) {
        problemas.push(`no se pudo liberar el cupo: ${String(caught)}`);
      }
    }
    return problemas;
  };
  const abortar = (motivo: string): never => {
    const problemas = deshacer();
    return fail(
      problemas.length === 0
        ? motivo
        : `${motivo} Además quedó a medias: ${problemas.join("; ")}. Revisa con \`git worktree list\`.`,
      EXIT_INVARIANT,
    );
  };

  try {
    const alta = ejecutarGitDeWorktree(
      root,
      ["worktree", "add", "-b", rama, carpeta, ramaBase],
      git,
      ramaBase,
    );
    if (alta.status !== 0) {
      // Puede haber creado la rama antes de fallar: se limpia solo lo que existe.
      ramaCreada = ramaExiste(root, rama, git);
      worktreeCreado = existsSync(absoluta);
      return abortar(`git worktree add falló: ${alta.stderr.trim()}`);
    }
    worktreeCreado = true;
    ramaCreada = true;

    // La receta de compilación es la del monorepo del harness: en un proyecto que no la tiene
    // (sin `tsconfig.build.json` ni `node_modules/@valmen`) no se clona ni se compila nada.
    if (tieneRecetaDeCompilacion(root)) {
      const origen = join(root, "node_modules");
      if (!existsSync(origen))
        abortar(
          `No hay ${origen} que clonar: instala las dependencias en el checkout principal.`,
        );
      const destino = join(absoluta, "node_modules");
      let copia = ejecutarProcesoDeWorktree(
        "cp",
        ["-Rc", origen, destino],
        root,
        request.proceso,
      );
      if (copia.status !== 0) {
        // Fuera de APFS no hay clon: cae a la copia normal, solo si el intento no dejó nada a medias.
        if (existsSync(destino))
          abortar(
            `El clon de node_modules falló y dejó una copia parcial: ${copia.stderr.trim()}`,
          );
        copia = ejecutarProcesoDeWorktree(
          "cp",
          ["-R", origen, destino],
          root,
          request.proceso,
        );
        if (copia.status !== 0)
          abortar(`No se pudo clonar node_modules: ${copia.stderr.trim()}`);
      }
      const fuera = enlacesFueraDelWorktree(absoluta);
      if (fuera.length > 0) {
        abortar(
          `El clon de node_modules no quedó contenido en el worktree: @valmen/${fuera.join(", @valmen/")} resuelve fuera de ${carpeta}.`,
        );
      }

      for (const [comando, argumentos] of [
        ["npx", ["tsc", "--build", "tsconfig.build.json"]],
        ["node", ["scripts/copy-web.mjs"]],
      ] as const) {
        const r = ejecutarProcesoDeWorktree(comando, argumentos, absoluta, request.proceso);
        if (r.status !== 0) {
          abortar(
            `La compilación falló (${comando} ${argumentos.join(" ")}): ${(r.stderr || r.stdout).trim().slice(0, 500)}`,
          );
        }
      }
    } else {
      avisos.push(
        "El proyecto no tiene la receta de compilación del harness (tsconfig.build.json o node_modules/@valmen en la raíz): no se compiló el worktree ni se clonó node_modules.",
      );
    }

    try {
      avisos.push(...dejarDenegacionesEnElWorktree(root, absoluta, git));
    } catch (caught) {
      abortar(
        `No se pudieron llevar las denegaciones del harness al worktree: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    }

    const commit = ejecutarGitDeWorktree(root, ["rev-parse", rama], git).stdout.trim();
    return Object.freeze({
      carpeta,
      rama,
      ramaBase,
      commit,
      reserva: reservada ? ("reservada" as const) : ("no-declarada" as const),
      avisos: Object.freeze(avisos),
    });
  } catch (caught) {
    // Un fallo inesperado (no uno de `abortar`, que ya deshizo) también deja la repo como estaba.
    if (worktreeCreado || ramaCreada || reservada) {
      const problemas = deshacer();
      if (problemas.length > 0) {
        fail(
          `${caught instanceof Error ? caught.message : String(caught)} Además quedó a medias: ${problemas.join("; ")}.`,
          EXIT_INVARIANT,
        );
      }
    }
    throw caught;
  }
}

function realpathOrSame(ruta: string): string {
  try {
    return realpathSync(ruta);
  } catch {
    return ruta;
  }
}

export function quitarWorktree(request: WorktreeRequest): WorktreeQuitado {
  const { paths, git } = request;
  const home = request.home ?? homedir();
  const root = paths.root;
  const { carpeta, rama } = nombresDeWorktree(request.ticketId);
  const absoluta = join(root, carpeta);

  exigirCheckoutPrincipal(root, git);
  const ramaBase = ramaBaseDelProyecto(root);

  const actual = ejecutarGitDeWorktree(
    root,
    ["rev-parse", "--abbrev-ref", "HEAD"],
    git,
  ).stdout.trim();
  if (actual !== ramaBase) {
    fail(
      `El checkout principal está en "${actual}", no en ${ramaBase}: quitar el worktree borra la rama y debe comprobarse contra ${ramaBase}.`,
      EXIT_INVARIANT,
    );
  }
  if (!ramaExiste(root, rama, git))
    fail(`La rama ${rama} no existe: no hay nada que quitar.`, EXIT_INVARIANT);
  const ancestro = ejecutarGitDeWorktree(
    root,
    ["merge-base", "--is-ancestor", rama, ramaBase],
    git,
  );
  if (ancestro.status !== 0) {
    fail(
      `La rama ${rama} no está integrada en ${ramaBase}: se conservan el worktree y la rama. Integra primero.`,
      EXIT_INVARIANT,
    );
  }

  const hayCarpeta = existsSync(absoluta);
  if (hayCarpeta) {
    const real = quitarLaBarraFinal(realpathOrSame(absoluta));
    if (!worktreesRegistrados(root, git).includes(real)) {
      fail(
        `${carpeta} existe pero no es un worktree registrado: no se toca.`,
        EXIT_INVARIANT,
      );
    }
    const sucios = estadoDelArbolDeTrabajo(absoluta, (argumentos, cwd) =>
      ejecutarGitDeWorktree(cwd, argumentos, git),
    );
    if (sucios.length > 0) {
      fail(
        `El worktree ${carpeta} tiene cambios sin commit (${sucios.slice(0, 5).join(", ")}): se conservan el worktree y la rama.`,
        EXIT_INVARIANT,
      );
    }
    const quitado = ejecutarGitDeWorktree(root, ["worktree", "remove", carpeta], git);
    if (quitado.status !== 0)
      fail(`git worktree remove falló: ${quitado.stderr.trim()}`, EXIT_INVARIANT);
  }
  const borrada = ejecutarGitDeWorktree(root, ["branch", "-d", rama], git);
  if (borrada.status !== 0)
    fail(`git branch -d falló: ${borrada.stderr.trim()}`, EXIT_INVARIANT);

  const avisos: string[] = [];
  if (!hayCarpeta)
    avisos.push(`La carpeta ${carpeta} ya no existía: solo se borró la rama.`);
  const project = proyectoDeLaMaquina(paths, home);
  let reserva: WorktreeQuitado["reserva"] = "no-declarada";
  if (project === null) {
    avisos.push("El proyecto no está declarado en la máquina: no había cupo que liberar.");
  } else {
    const encontrada = readMachineCapacity({ home, project }).reservations.find(
      (r) =>
        r.projectId === project.projectId &&
        r.ticketId === request.ticketId &&
        r.attemptId === INTENTO_DE_WORKTREE,
    );
    if (encontrada === undefined) {
      reserva = "sin-reserva";
      avisos.push("El ticket no tenía un cupo reservado por el worktree.");
    } else {
      const identity = createExecutionIdentity({
        projectId: project.projectId,
        ticketId: request.ticketId,
        executionId: encontrada.executionId,
      });
      releaseMachineCapacity({ home, project, identity, attemptId: INTENTO_DE_WORKTREE });
      reserva = "liberada";
    }
  }
  return Object.freeze({ carpeta, rama, ramaBase, reserva, avisos: Object.freeze(avisos) });
}
