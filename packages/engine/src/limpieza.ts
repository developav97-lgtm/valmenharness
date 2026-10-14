/**
 * `valmen cleanup`: la vista previa y el quitado de lo ya integrado (FEATURE-CLI-LIMPIEZA-INTEGRADOS-20261010).
 *
 * `vistaDeLimpieza` no escribe nada: clasifica cada worktree de `.claude/worktrees/` y cada
 * respaldo de `.valmen/backups/sync/` como «quitar» o «conservar» con su motivo. `aplicarLimpieza`
 * recalcula esa vista, deja el recibo de recuperación en `.valmen/backups/cleanup/` antes del
 * primer borrado y quita exactamente lo quitable: nunca usa `--force` ni `-D`, nunca toca el registro
 * y solo borra con `rmSync` dentro de `.valmen/backups/sync/<marca>`. El git sale de la lista
 * cerrada de `limpieza-git.ts`.
 */
import { lstatSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, sep } from "node:path";

import {
  EXIT_INVARIANT,
  type YamlMap,
  type YamlValue,
  atomicWrite,
  createExecutionIdentity,
  fail,
  parseTicket,
  parseYamlSubset,
} from "@valmen/core";

import { type RegistryPaths, findAllTickets } from "./discovery.js";
import { type EjecutorDeGit } from "./integration-rules.js";
import { ejecutarGitDeLimpieza } from "./limpieza-git.js";
import { readMachineCapacity, releaseMachineCapacity } from "./machine-capacity.js";
import { ramaBaseDelProyecto } from "./rama-base.js";
import { INTENTO_DE_WORKTREE, proyectoDeLaMaquina } from "./worktree.js";
import { exigirCheckoutPrincipal, nombresDeWorktree } from "./worktree-git.js";

/** Los días de retención de los respaldos de `sync` cuando la configuración no los declara. */
const RETENCION_DE_RESPALDOS_POR_DEFECTO = 30;

const CARPETA_DE_WORKTREES = ".claude/worktrees";
const CARPETA_DE_RESPALDOS = ".valmen/backups/sync";
const CARPETA_DE_RECIBOS = ".valmen/backups/cleanup";
const MARCA_DE_RESPALDO = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z(?:-\d+)?$/;
const DIA_EN_MS = 86_400_000;

export interface ElementoDeLimpieza {
  /** Relativa a la raíz del checkout principal. */
  readonly ruta: string;
  /** Solo los worktrees: la rama que tenían, o `null` si estaban desacoplados. */
  readonly rama: string | null;
  /** Solo los worktrees: el commit en el que estaban. */
  readonly commit: string | null;
  /** Tamaño aparente: suma de `lstat().size` sin seguir enlaces. */
  readonly bytes: number;
  readonly accion: "quitar" | "conservar";
  readonly motivo: string;
}

export interface VistaDeLimpieza {
  readonly worktrees: readonly ElementoDeLimpieza[];
  readonly respaldos: readonly ElementoDeLimpieza[];
}

export interface ElementoQuitado extends ElementoDeLimpieza {
  readonly resultado?: "quitado" | "error";
  readonly error?: string;
  readonly avisos?: readonly string[];
}

export interface LimpiezaAplicada {
  readonly worktrees: readonly ElementoQuitado[];
  readonly respaldos: readonly ElementoQuitado[];
  /** Ruta relativa del recibo de recuperación, o `null` si no había nada que quitar. */
  readonly recibo: string | null;
  readonly fallos: number;
}

export interface LimpiezaRequest {
  readonly paths: RegistryPaths;
  readonly home?: string | undefined;
  readonly git?: EjecutorDeGit | undefined;
  readonly ahora?: Date | undefined;
}

/** `backup-retention-days` de `.valmen/config.yaml`; 30 sin la clave o con un valor que no es un entero positivo. */
function retencionDeRespaldos(root: string): number {
  try {
    const documento: YamlValue = parseYamlSubset(
      readFileSync(join(root, ".valmen", "config.yaml"), "utf8"),
      { fileName: ".valmen/config.yaml" },
    );
    if (typeof documento !== "object" || Array.isArray(documento))
      return RETENCION_DE_RESPALDOS_POR_DEFECTO;
    const bruto = (documento as YamlMap)["backup-retention-days"];
    const dias = typeof bruto === "number" ? bruto : Number(String(bruto));
    return Number.isInteger(dias) && dias > 0 ? dias : RETENCION_DE_RESPALDOS_POR_DEFECTO;
  } catch {
    return RETENCION_DE_RESPALDOS_POR_DEFECTO;
  }
}

const quitarLaBarraFinal = (texto: string): string => texto.replace(/[/\\]+$/, "");

function realpathOrSame(ruta: string): string {
  try {
    return realpathSync(ruta);
  } catch {
    return ruta;
  }
}

/** Suma de tamaños de una carpeta sin seguir enlaces; 0 si no se puede leer. */
function tamanoAparente(ruta: string): number {
  try {
    const info = lstatSync(ruta);
    if (!info.isDirectory()) return info.size;
    let total = info.size;
    for (const nombre of readdirSync(ruta)) total += tamanoAparente(join(ruta, nombre));
    return total;
  } catch {
    return 0;
  }
}

interface WorktreeDeGit {
  readonly absoluta: string;
  readonly commit: string;
  readonly rama: string | null;
}

/** Los worktrees que git conoce y que cuelgan de `.claude/worktrees/` del checkout principal. */
function worktreesDeLaCarpeta(
  root: string,
  git: EjecutorDeGit | undefined,
): WorktreeDeGit[] {
  const r = ejecutarGitDeLimpieza(root, ["worktree", "list", "--porcelain"], git);
  if (r.status !== 0) fail(`git worktree list falló: ${r.stderr.trim()}`, EXIT_INVARIANT);
  const prefijo = join(realpathOrSame(root), CARPETA_DE_WORKTREES) + sep;
  const encontrados: WorktreeDeGit[] = [];
  for (const bloque of r.stdout.split(/\n\s*\n/)) {
    const lineas = bloque.split("\n");
    const carpeta = lineas.find((l) => l.startsWith("worktree "));
    if (carpeta === undefined) continue;
    const absoluta = quitarLaBarraFinal(carpeta.slice("worktree ".length));
    if (!absoluta.startsWith(prefijo) || absoluta.slice(prefijo.length).includes(sep))
      continue;
    const commit = lineas.find((l) => l.startsWith("HEAD "))?.slice("HEAD ".length) ?? "";
    const rama =
      lineas.find((l) => l.startsWith("branch "))?.slice("branch ".length) ?? null;
    encontrados.push({
      absoluta,
      commit,
      rama: rama === null ? null : rama.replace(/^refs\/heads\//, ""),
    });
  }
  return encontrados.sort((a, b) => a.absoluta.localeCompare(b.absoluta));
}

/** El slug de cada ticket del registro que no está `closed`; el registro de la rama base manda. */
function slugsDeTicketsSinCerrar(paths: RegistryPaths): Set<string> {
  const abiertos = new Set<string>();
  let tickets: ReturnType<typeof findAllTickets> = [];
  try {
    tickets = findAllTickets(paths);
  } catch {
    return abiertos;
  }
  for (const ticket of tickets) {
    try {
      if (parseTicket(ticket.text).fields.workflow_status !== "closed")
        abiertos.add(nombresDeWorktree(ticket.id).slug);
    } catch {
      // un ticket ilegible o con un identificador ajeno al formato no decide nada aquí
    }
  }
  return abiertos;
}

function exigirRamaBase(root: string, git: EjecutorDeGit | undefined, ramaBase: string): void {
  exigirCheckoutPrincipal(root, git);
  const actual = ejecutarGitDeLimpieza(
    root,
    ["rev-parse", "--abbrev-ref", "HEAD"],
    git,
  ).stdout.trim();
  if (actual !== ramaBase) {
    fail(
      `El checkout principal está en "${actual}", no en ${ramaBase}: la limpieza solo corre desde ${ramaBase}.`,
      EXIT_INVARIANT,
    );
  }
}

function clasificarWorktree(
  paths: RegistryPaths,
  w: WorktreeDeGit,
  sinCerrar: Set<string>,
  git: EjecutorDeGit | undefined,
  ramaBase: string,
): ElementoDeLimpieza {
  const raiz = realpathOrSame(paths.root);
  const base = {
    ruta: relative(raiz, w.absoluta).split(sep).join("/"),
    rama: w.rama,
    commit: w.commit === "" ? null : w.commit,
    bytes: tamanoAparente(w.absoluta),
  };
  const conservar = (motivo: string): ElementoDeLimpieza => ({
    ...base,
    accion: "conservar",
    motivo,
  });
  // Sin el filtro del estado del harness: un `.valmen/journeys/` modificado también es trabajo sin commitear.
  const estado = ejecutarGitDeLimpieza(w.absoluta, ["status", "--porcelain", "-uall"], git);
  if (estado.status !== 0 || estado.stdout.trim() !== "") return conservar("árbol sucio");
  const integrado = ejecutarGitDeLimpieza(
    paths.root,
    ["merge-base", "--is-ancestor", w.commit, ramaBase],
    git,
    ramaBase,
  );
  if (integrado.status !== 0) return conservar("commits sin integrar");
  const nombre = basename(w.absoluta);
  if (nombre.startsWith("ticket-") && sinCerrar.has(nombre.slice("ticket-".length)))
    return conservar("ticket sin cerrar");
  return { ...base, accion: "quitar", motivo: `integrado en ${ramaBase} y limpio` };
}

function marcaDeRespaldo(nombre: string): number | null {
  const m = MARCA_DE_RESPALDO.exec(nombre);
  if (m === null) return null;
  const [, a, mes, d, h, mi, s] = m.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return Date.UTC(a, mes - 1, d, h, mi, s);
}

function respaldosDeSync(root: string, ahora: Date): ElementoDeLimpieza[] {
  const carpeta = join(root, CARPETA_DE_RESPALDOS);
  let nombres: string[];
  try {
    nombres = readdirSync(carpeta);
  } catch {
    return [];
  }
  const retencion = retencionDeRespaldos(root);
  const elementos: ElementoDeLimpieza[] = [];
  for (const nombre of nombres.sort()) {
    const creado = marcaDeRespaldo(nombre);
    if (creado === null) continue;
    const ruta = join(carpeta, nombre);
    let info;
    try {
      info = lstatSync(ruta);
    } catch {
      continue;
    }
    if (!info.isDirectory() || info.isSymbolicLink()) continue;
    const dias = Math.floor((ahora.getTime() - creado) / DIA_EN_MS);
    const vencido = ahora.getTime() - creado > retencion * DIA_EN_MS;
    elementos.push({
      ruta: `${CARPETA_DE_RESPALDOS}/${nombre}`,
      rama: null,
      commit: null,
      bytes: tamanoAparente(ruta),
      accion: vencido ? "quitar" : "conservar",
      motivo: vencido
        ? `más viejo que la retención (${dias} días, retención ${retencion})`
        : "dentro de la retención",
    });
  }
  return elementos;
}

/** Lo que la limpieza quitaría y lo que conserva, sin escribir ni quitar nada. */
export function vistaDeLimpieza(request: LimpiezaRequest): VistaDeLimpieza {
  const { paths, git } = request;
  const ramaBase = ramaBaseDelProyecto(paths.root);
  exigirRamaBase(paths.root, git, ramaBase);
  const sinCerrar = slugsDeTicketsSinCerrar(paths);
  const worktrees = worktreesDeLaCarpeta(paths.root, git).map((w) =>
    clasificarWorktree(paths, w, sinCerrar, git, ramaBase),
  );
  return Object.freeze({
    worktrees: Object.freeze(worktrees),
    respaldos: Object.freeze(respaldosDeSync(paths.root, request.ahora ?? new Date())),
  });
}

function marcaDeTiempo(fecha: Date): string {
  return fecha
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replace(/[-:]/g, "");
}

function manifiestoDe(carpeta: string): unknown {
  try {
    return JSON.parse(readFileSync(join(carpeta, "manifiesto.json"), "utf8")) as unknown;
  } catch {
    return null;
  }
}

function liberarCupo(request: LimpiezaRequest, carpeta: string): string | null {
  const nombre = basename(carpeta);
  if (!nombre.startsWith("ticket-")) return null;
  const home = request.home ?? homedir();
  const project = proyectoDeLaMaquina(request.paths, home);
  if (project === null) return null;
  const executionId = `worktree-${nombre.slice("ticket-".length)}`;
  const encontrada = readMachineCapacity({ home, project }).reservations.find(
    (r) =>
      r.projectId === project.projectId &&
      r.executionId === executionId &&
      r.attemptId === INTENTO_DE_WORKTREE,
  );
  if (encontrada === undefined) return null;
  releaseMachineCapacity({
    home,
    project,
    identity: createExecutionIdentity({
      projectId: project.projectId,
      ticketId: encontrada.ticketId,
      executionId: encontrada.executionId,
    }),
    attemptId: INTENTO_DE_WORKTREE,
  });
  return `Cupo de la máquina liberado (${executionId}).`;
}

/** Borra la carpeta de un respaldo de `sync` y nada más: comprueba nombre, tipo y padre real. */
function quitarRespaldo(root: string, ruta: string): void {
  const nombre = basename(ruta);
  const absoluta = join(root, ruta);
  if (marcaDeRespaldo(nombre) === null || ruta !== `${CARPETA_DE_RESPALDOS}/${nombre}`)
    fail(`${ruta} no es un respaldo de sync: no se toca.`, EXIT_INVARIANT);
  const info = lstatSync(absoluta);
  if (info.isSymbolicLink() || !info.isDirectory())
    fail(`${ruta} no es una carpeta de respaldo: no se toca.`, EXIT_INVARIANT);
  const padre = realpathSync(join(root, CARPETA_DE_RESPALDOS));
  if (realpathSync(join(absoluta, "..")) !== padre)
    fail(`${ruta} no cuelga de ${CARPETA_DE_RESPALDOS}: no se toca.`, EXIT_INVARIANT);
  rmSync(absoluta, { recursive: true });
}

/** Quita lo quitable de la vista, tras dejar el recibo de recuperación. */
export function aplicarLimpieza(request: LimpiezaRequest): LimpiezaAplicada {
  const { paths, git } = request;
  const root = paths.root;
  const ahora = request.ahora ?? new Date();
  const vista = vistaDeLimpieza(request);
  const quitablesW = vista.worktrees.filter((w) => w.accion === "quitar");
  const quitablesR = vista.respaldos.filter((r) => r.accion === "quitar");

  let recibo: string | null = null;
  if (quitablesW.length + quitablesR.length > 0) {
    let marca = marcaDeTiempo(ahora);
    let n = 1;
    const existe = (m: string): boolean => {
      try {
        lstatSync(join(root, CARPETA_DE_RECIBOS, `${m}.json`));
        return true;
      } catch {
        return false;
      }
    };
    const base = marca;
    while (existe(marca)) marca = `${base}-${++n}`;
    recibo = `${CARPETA_DE_RECIBOS}/${marca}.json`;
    atomicWrite(
      join(root, recibo),
      `${JSON.stringify(
        {
          creado: ahora.toISOString(),
          worktrees: quitablesW.map((w) => ({
            carpeta: w.ruta,
            rama: w.rama,
            commit: w.commit,
          })),
          respaldos: quitablesR.map((r) => ({
            carpeta: r.ruta,
            manifiesto: manifiestoDe(join(root, r.ruta)),
          })),
        },
        null,
        2,
      )}\n`,
    );
  }

  let fallos = 0;
  const worktrees: ElementoQuitado[] = vista.worktrees.map((w) => {
    if (w.accion !== "quitar") return w;
    const quitado = ejecutarGitDeLimpieza(root, ["worktree", "remove", w.ruta], git);
    if (quitado.status !== 0) {
      fallos += 1;
      return {
        ...w,
        resultado: "error",
        error: `git worktree remove falló: ${quitado.stderr.trim()}`,
      };
    }
    const avisos: string[] = [];
    let error: string | undefined;
    if (w.rama !== null) {
      const borrada = ejecutarGitDeLimpieza(
        root,
        ["branch", "-d", w.rama],
        git,
        ramaBaseDelProyecto(root),
      );
      if (borrada.status !== 0)
        error = `git branch -d falló (el worktree ya se quitó): ${borrada.stderr.trim()}`;
    }
    try {
      const cupo = liberarCupo(request, w.ruta);
      if (cupo !== null) avisos.push(cupo);
    } catch (caught) {
      avisos.push(
        `No se pudo liberar el cupo: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    }
    if (error !== undefined) {
      fallos += 1;
      return { ...w, resultado: "error", error, avisos };
    }
    return { ...w, resultado: "quitado", avisos };
  });

  const respaldos: ElementoQuitado[] = vista.respaldos.map((r) => {
    if (r.accion !== "quitar") return r;
    try {
      quitarRespaldo(root, r.ruta);
      return { ...r, resultado: "quitado" };
    } catch (caught) {
      fallos += 1;
      return {
        ...r,
        resultado: "error",
        error: caught instanceof Error ? caught.message : String(caught),
      };
    }
  });

  return Object.freeze({ worktrees, respaldos, recibo, fallos });
}
