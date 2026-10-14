/**
 * Integrar la rama del worktree de un ticket al checkout principal (corrida orquestada).
 *
 * `integrarWorktree` lleva `valmen/ticket-<slug>` a la rama base del proyecto (`execution.base-branch`,
 * `main` si no se declara) con avance directo si la base no se movió, o con `merge --no-ff` si avanzó, tras una comprobación previa por `merge-tree`. Une los
 * registros append-only (`worktree-registros.ts`), regenera `tickets/index.md` y recompila. Un
 * conflicto de código no se resuelve: se lista y no se toca nada. Nunca hace push ni fuerza, y todo
 * el git y los procesos salen de las listas cerradas del módulo.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { EXIT_INVARIANT, atomicWrite, fail } from "@valmen/core";

import {
  findAllTickets,
  findTicket,
  indexPath,
  toRelative,
  type RegistryPaths,
} from "./discovery.js";
import { renderIndex } from "./index-file.js";
import { estadoDelArbolDeTrabajo, ramaActual } from "./integration-commit.js";
import { ramaBaseDelProyecto } from "./rama-base.js";
import { type EjecutorDeGit, motivoDeArchivoProhibido } from "./integration-rules.js";
import { appendEvent } from "./mutate.js";
import { cambiosDeRuta, rutasQueCuentan } from "./rutas-tocadas.js";
import {
  type EntregaRegistrada,
  registrarEntrega,
  textoDelAviso,
  textoDelEvento,
} from "./tamano-entrega.js";
import { ejecutarGitDeIntegracion } from "./worktree-integracion-git.js";
import {
  type EjecutorDeProceso,
  ejecutarProcesoDeWorktree,
  exigirCheckoutPrincipal,
  nombresDeWorktree,
} from "./worktree-git.js";
import { esRegistroUnible, unirRegistro } from "./worktree-registros.js";

export interface IntegrarRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly home?: string | undefined;
  readonly git?: EjecutorDeGit | undefined;
  readonly proceso?: EjecutorDeProceso | undefined;
}

export interface WorktreeIntegrado {
  readonly rama: string;
  readonly modo: "nada-que-integrar" | "avance-directo" | "merge";
  /** La rama base en la que se integró (`execution.base-branch`). */
  readonly ramaBase: string;
  /** El commit de la rama base tras integrar. */
  readonly commit: string;
  readonly registrosUnidos: readonly string[];
  readonly indiceRegenerado: boolean;
  /** El tamaño de la entrega, o `null` si no se pudo medir (o no había nada que integrar). */
  readonly entrega: EntregaRegistrada | null;
  /** Lo que la integración dejó pasar sin detenerse: el tope superado, una medición fallida. */
  readonly avisos: readonly string[];
}

/** Las rutas del `status --porcelain` crudo: sin quitar el estado del harness. */
function rutasConCambios(salida: string): string[] {
  return salida
    .split("\n")
    .filter((linea) => linea.trim() !== "")
    .map((linea) => linea.slice(3).trim())
    .map((ruta) => (ruta.includes(" -> ") ? (ruta.split(" -> ")[1] as string) : ruta))
    .map((ruta) => ruta.replace(/^"|"$/g, ""));
}

export function integrarWorktree(request: IntegrarRequest): WorktreeIntegrado {
  const { paths, git } = request;
  const root = paths.root;
  const { carpeta, rama } = nombresDeWorktree(request.ticketId);
  const absoluta = join(root, carpeta);
  const ejecutor: EjecutorDeGit = (argumentos, cwd) =>
    ejecutarGitDeIntegracion(cwd, argumentos, git);
  const g = (cwd: string, ...argumentos: string[]) =>
    ejecutarGitDeIntegracion(cwd, argumentos, git);
  const indiceRelativo = toRelative(paths, indexPath(paths));

  exigirCheckoutPrincipal(root, git);
  const ramaBase = ramaBaseDelProyecto(root);

  const listada = g(root, "branch", "--list", rama);
  if (listada.status !== 0)
    fail(`git branch falló: ${listada.stderr.trim()}`, EXIT_INVARIANT);
  if (listada.stdout.trim() === "")
    fail(
      `La rama ${rama} no existe: no hay nada que integrar (¿se creó el worktree con \`journey worktree create\`?).`,
      EXIT_INVARIANT,
    );
  if (!existsSync(absoluta))
    fail(`El worktree ${carpeta} no existe: no hay nada que integrar.`, EXIT_INVARIANT);

  const actual = ramaActual(root, ejecutor);
  if (actual !== ramaBase) {
    fail(
      `El checkout principal está en "${actual}", no en ${ramaBase}: integrar solo avanza ${ramaBase}.`,
      EXIT_INVARIANT,
    );
  }

  const cabeza = (): string => g(root, "rev-parse", "HEAD").stdout.trim();

  if (g(root, "merge-base", "--is-ancestor", rama, ramaBase).status === 0) {
    return Object.freeze({
      rama,
      modo: "nada-que-integrar" as const,
      ramaBase,
      commit: cabeza(),
      registrosUnidos: Object.freeze([]),
      indiceRegenerado: false,
      entrega: null,
      avisos: Object.freeze([]),
    });
  }

  const sucioElWorktree = estadoDelArbolDeTrabajo(absoluta, ejecutor);
  if (sucioElWorktree.length > 0) {
    fail(
      `El worktree ${carpeta} tiene cambios sin commit (${sucioElWorktree.slice(0, 5).join(", ")}): commitéalos antes de integrar.`,
      EXIT_INVARIANT,
    );
  }

  let archivosDeLaRama: string[];
  try {
    archivosDeLaRama = rutasQueCuentan(
      cambiosDeRuta((argumentos) => g(root, ...argumentos), `${ramaBase}...${rama}`),
    );
  } catch (error) {
    fail((error as Error).message, EXIT_INVARIANT);
  }
  // Medir no bloquea: un fallo deja `entrega: null` y un aviso.
  const avisos: string[] = [];
  let entrega: EntregaRegistrada | null = null;
  try {
    const medida = g(root, "diff", "--numstat", "-z", `${ramaBase}...${rama}`);
    if (medida.status !== 0) throw new Error(medida.stderr.trim() || "git diff falló");
    entrega = registrarEntrega(medida.stdout, root);
  } catch (error) {
    avisos.push(
      `no se pudo medir el tamaño de la entrega de ${request.ticketId} (${(error as Error).message}): la integración sigue.`,
    );
  }
  const prohibidos = archivosDeLaRama
    .map(motivoDeArchivoProhibido)
    .filter((m): m is string => m !== null);
  if (prohibidos.length > 0)
    fail(
      `La rama ${rama} cambia archivos que no se integran: ${prohibidos.join("; ")}.`,
      EXIT_INVARIANT,
    );

  const sucioElPrincipal = estadoDelArbolDeTrabajo(root, ejecutor);
  if (sucioElPrincipal.length > 0) {
    fail(
      `El checkout principal tiene cambios sin commit (${sucioElPrincipal.slice(0, 5).join(", ")}): limpia antes de integrar.`,
      EXIT_INVARIANT,
    );
  }
  const crudo = g(root, "status", "--porcelain", "-uall");
  if (crudo.status !== 0) fail(`git status falló: ${crudo.stderr.trim()}`, EXIT_INVARIANT);
  const delRama = new Set(archivosDeLaRama);
  const solape = rutasConCambios(crudo.stdout).filter((ruta) => delRama.has(ruta));
  if (solape.length > 0) {
    fail(
      `El checkout principal tiene cambios sin commit en archivos que también cambia la rama (${solape.slice(0, 5).join(", ")}): no se integra.`,
      EXIT_INVARIANT,
    );
  }

  const regenerarIndice = (): boolean => {
    const destino = indexPath(paths);
    const contenido = renderIndex(paths, findAllTickets(paths));
    if (existsSync(destino) && readFileSync(destino, "utf8") === contenido) return false;
    atomicWrite(destino, contenido);
    return true;
  };

  /** Anota `delivery-size` en el ticket ya integrado; devuelve la ruta a commitear o `null`. */
  const anotarEntrega = (): string | null => {
    if (entrega === null) return null;
    if (entrega.pasaElTope) avisos.push(textoDelAviso(request.ticketId, entrega));
    try {
      appendEvent(
        paths,
        request.ticketId,
        "delivery-size",
        textoDelEvento(entrega, "worktree"),
      );
    } catch (error) {
      avisos.push(
        `no se pudo registrar el tamaño de la entrega (${(error as Error).message}): la integración sigue.`,
      );
      return null;
    }
    return findTicket(paths, request.ticketId)?.relativePath ?? null;
  };

  let modo: "avance-directo" | "merge";
  const registrosUnidos: string[] = [];
  let indiceRegenerado = false;

  if (g(root, "merge-base", "--is-ancestor", ramaBase, rama).status === 0) {
    modo = "avance-directo";
    const ff = g(root, "merge", "--ff-only", rama);
    if (ff.status !== 0) fail(`merge --ff-only falló: ${ff.stderr.trim()}`, EXIT_INVARIANT);
    const regenerado = regenerarIndice();
    const rutaDelTicket = anotarEntrega();
    if (regenerado || rutaDelTicket !== null) {
      indiceRegenerado = regenerado;
      const a = g(
        root,
        "add",
        "--",
        ...(rutaDelTicket === null ? [] : [rutaDelTicket]),
        indiceRelativo,
      );
      if (a.status !== 0) fail(`git add falló: ${a.stderr.trim()}`, EXIT_INVARIANT);
      const c = g(
        root,
        "commit",
        "-m",
        `Regenera tickets/index.md tras integrar ${request.ticketId}${rutaDelTicket === null ? "" : " y registra el tamaño de la entrega"}`,
      );
      if (c.status !== 0) fail(`git commit falló: ${c.stderr.trim()}`, EXIT_INVARIANT);
    }
  } else {
    modo = "merge";
    const previa = g(
      root,
      "merge-tree",
      "--write-tree",
      "--name-only",
      "--no-messages",
      ramaBase,
      rama,
    );
    if (previa.status !== 0 && previa.status !== 1)
      fail(`git merge-tree falló: ${previa.stderr.trim()}`, EXIT_INVARIANT);
    const conflictos =
      previa.status === 0
        ? []
        : previa.stdout
            .split("\n")
            .slice(1)
            .map((l) => l.trim())
            .filter((l) => l !== "");
    const sinResolver = conflictos.filter(
      (ruta) => !esRegistroUnible(ruta) && ruta !== indiceRelativo,
    );
    if (sinResolver.length > 0) {
      fail(
        `Conflicto de código entre ${ramaBase} y ${rama} en: ${sinResolver.join(", ")}. No se tocó ${ramaBase}: resuélvelo en el worktree y vuelve a integrar.`,
        EXIT_INVARIANT,
      );
    }

    const base = g(root, "merge-base", ramaBase, rama).stdout.trim();
    const m = g(root, "merge", "--no-ff", "--no-commit", rama);
    const abortar = (motivo: string): never => {
      const a = g(root, "merge", "--abort");
      return fail(
        a.status === 0
          ? `${motivo} Se ejecutó merge --abort: ${ramaBase} quedó como estaba.`
          : `${motivo} Además \`merge --abort\` falló (${a.stderr.trim()}): revisa el checkout principal a mano.`,
        EXIT_INVARIANT,
      );
    };
    try {
      if (m.status !== 0 && conflictos.length === 0)
        abortar(`merge --no-ff falló: ${m.stderr.trim() || m.stdout.trim()}`);
      for (const ruta of conflictos.filter(esRegistroUnible)) {
        const leerVersion = (revision: string): string | null => {
          const r = g(root, "show", `${revision}:${ruta}`);
          return r.status === 0 ? r.stdout : null;
        };
        const ours = leerVersion(ramaBase);
        const theirs = leerVersion(rama);
        if (ours === null || theirs === null)
          abortar(
            `No se puede unir ${ruta}: falta en ${ours === null ? ramaBase : rama}.`,
          );
        const union = unirRegistro({
          ruta,
          base: leerVersion(base) ?? "",
          ours: ours as string,
          theirs: theirs as string,
        });
        if (!union.ok) abortar(`No se puede unir el registro: ${union.motivo}`);
        else {
          atomicWrite(join(root, ...ruta.split("/")), union.contenido);
          const a = g(root, "add", "--", ruta);
          if (a.status !== 0) abortar(`git add ${ruta} falló: ${a.stderr.trim()}`);
          registrosUnidos.push(ruta);
        }
      }
      const rutaDelTicket = anotarEntrega();
      if (rutaDelTicket !== null) {
        const a = g(root, "add", "--", rutaDelTicket);
        if (a.status !== 0) abortar(`git add ${rutaDelTicket} falló: ${a.stderr.trim()}`);
      }
      if (
        regenerarIndice() ||
        rutaDelTicket !== null ||
        conflictos.includes(indiceRelativo)
      ) {
        indiceRegenerado = true;
        const a = g(root, "add", "--", indiceRelativo);
        if (a.status !== 0) abortar(`git add ${indiceRelativo} falló: ${a.stderr.trim()}`);
      }
      const c = g(root, "commit", "-m", `Integra ${request.ticketId} desde su worktree`);
      if (c.status !== 0)
        abortar(`git commit falló: ${c.stderr.trim() || c.stdout.trim()}`);
    } catch (caught) {
      // Un fallo inesperado a mitad del merge también deja la rama base como estaba.
      if (existsSync(join(root, ".git", "MERGE_HEAD"))) g(root, "merge", "--abort");
      throw caught;
    }
  }

  const commit = cabeza();
  for (const [comando, argumentos] of [
    ["npx", ["tsc", "--build", "tsconfig.build.json"]],
    ["node", ["scripts/copy-web.mjs"]],
  ] as const) {
    const r = ejecutarProcesoDeWorktree(comando, argumentos, root, request.proceso);
    if (r.status !== 0) {
      fail(
        `La rama ${rama} quedó integrada en ${ramaBase} (${commit.slice(0, 12)}), pero la recompilación falló (${comando} ${argumentos.join(" ")}): ${(r.stderr || r.stdout).trim().slice(0, 500)}. La integración se conserva: recompila a mano con \`npm run build\`.`,
        EXIT_INVARIANT,
      );
    }
  }
  return Object.freeze({
    rama,
    modo,
    ramaBase,
    commit,
    registrosUnidos: Object.freeze(registrosUnidos),
    indiceRegenerado,
    entrega,
    avisos: Object.freeze(avisos),
  });
}
