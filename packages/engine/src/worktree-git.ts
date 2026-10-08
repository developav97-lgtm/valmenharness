/**
 * El git y los procesos de los worktrees por ticket: listas cerradas y propias.
 *
 * Crear y quitar el worktree de un ticket necesita unas pocas operaciones de git que la lista de
 * las jornadas (`integration-rules.ts`) no admite a propósito: `worktree` y `branch`. No se amplía
 * aquella lista —la autoridad git de la jornada autónoma no crece— sino que esta es la propia
 * de los worktrees, con el precedente de `qa-agent-git.ts`. Lo que no está en ella se rechaza
 * antes de lanzar nada: ni push, fetch, pull, reset, rebase, clean, tag ni remote, ni banderas de
 * fuerza (`--force`, `-f`, `-D`, `--hard`). El ticket que integra la rama suma su propia lista en
 * un módulo suyo y reutiliza `nombresDeWorktree`, `exigirCheckoutPrincipal` y `motivoDeGitDeWorktree`.
 */
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import { EXIT_INVARIANT, fail } from "@valmen/core";

import { type EjecutorDeGit } from "./integration-rules.js";

const FORMATO_DE_TICKET = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+-\d{8}$/;
const RAMA_DE_TICKET = /^valmen\/ticket-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CARPETA_DE_TICKET = /^(?:[^\s]*\/)?\.claude\/worktrees\/ticket-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REFERENCIA = /^[A-Za-z0-9_][A-Za-z0-9_./:^~@-]*$/;
const BANDERAS_DE_FUERZA = ["--force", "-f", "-D", "--hard", "--no-verify", "--amend"];

export interface NombresDeWorktree {
  /** Lo que identifica al ticket en la carpeta y la rama: sin tipo, módulo ni fecha. */
  readonly slug: string;
  /** Relativa a la raíz del checkout principal. */
  readonly carpeta: string;
  readonly rama: string;
}

/**
 * La carpeta y la rama del worktree de un ticket, derivadas solo del identificador.
 * Rechaza lo que no cumple el formato de ticket (barras, `..`, minúsculas, sin fecha).
 */
export function nombresDeWorktree(ticketId: string): NombresDeWorktree {
  if (!FORMATO_DE_TICKET.test(ticketId)) {
    fail(`El identificador "${ticketId}" no cumple el formato de ticket (TIPO-MODULO-NOMBRE-AAAAMMDD).`, EXIT_INVARIANT);
  }
  const partes = ticketId.split("-");
  const medio = partes.slice(2, -1);
  const slug = (medio.length > 0 ? medio : [partes[1] as string]).join("-").toLowerCase();
  return Object.freeze({ slug, carpeta: `.claude/worktrees/ticket-${slug}`, rama: `valmen/ticket-${slug}` });
}

/** Por qué una invocación de git no se admite en los worktrees, o `null` si se admite. */
export function motivoDeGitDeWorktree(argumentos: readonly string[]): string | null {
  const [operacion, ...resto] = argumentos;
  if (operacion === undefined) return "No se indicó ninguna operación de git.";
  const prohibida = resto.find((a) => BANDERAS_DE_FUERZA.includes(a));
  if (prohibida !== undefined) return `La bandera ${prohibida} no está permitida en los worktrees.`;
  switch (operacion) {
    case "status":
      return resto[0] === "--porcelain" && (resto.length === 1 || (resto.length === 2 && resto[1] === "-uall"))
        ? null
        : "git status solo se admite como `--porcelain [-uall]`.";
    case "rev-parse":
      if (resto.length === 1 && (resto[0] === "--git-dir" || resto[0] === "--git-common-dir")) return null;
      if (resto.length === 2 && resto[0] === "--abbrev-ref" && REFERENCIA.test(resto[1]!)) return null;
      return resto.length === 1 && REFERENCIA.test(resto[0]!) ? null : "git rev-parse admite `--git-dir`, `--git-common-dir`, `--abbrev-ref <ref>` o una referencia.";
    case "cat-file":
      return resto.length === 2 && resto[0] === "-e" && REFERENCIA.test(resto[1]!) ? null : "git cat-file solo se admite como `-e <objeto>`.";
    case "merge-base":
      return resto.length === 3 && resto[0] === "--is-ancestor" && REFERENCIA.test(resto[1]!) && REFERENCIA.test(resto[2]!)
        ? null
        : "git merge-base solo se admite como `--is-ancestor <a> <b>`.";
    case "branch":
      if (resto.length === 2 && resto[0] === "--list" && REFERENCIA.test(resto[1]!)) return null;
      if (resto.length === 2 && resto[0] === "-d" && RAMA_DE_TICKET.test(resto[1]!)) return null;
      return "git branch solo se admite como `--list <patrón>` o `-d <rama de ticket>`.";
    case "worktree":
      if (resto.length === 2 && resto[0] === "list" && resto[1] === "--porcelain") return null;
      if (resto.length === 5 && resto[0] === "add" && resto[1] === "-b" && RAMA_DE_TICKET.test(resto[2]!) && esCarpetaDeTicket(resto[3]!) && resto[4] === "main") return null;
      if (resto.length === 2 && resto[0] === "remove" && esCarpetaDeTicket(resto[1]!)) return null;
      return "git worktree solo se admite como `list --porcelain`, `add -b <rama> <carpeta> main` o `remove <carpeta>` (sin --force).";
    default:
      return `La operación git ${operacion} no está permitida en los worktrees (solo status, rev-parse, cat-file, merge-base, branch, worktree).`;
  }
}

function esCarpetaDeTicket(carpeta: string): boolean {
  return !carpeta.split("/").includes("..") && CARPETA_DE_TICKET.test(carpeta);
}

const ejecutarGitDeVerdad: EjecutorDeGit = (argumentos, cwd) => {
  const r = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...argumentos], { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

/** El único git de los worktrees: rechaza antes de lanzar nada y dice el motivo. */
export function ejecutarGitDeWorktree(
  root: string,
  argumentos: readonly string[],
  ejecutor: EjecutorDeGit = ejecutarGitDeVerdad,
): { readonly status: number; readonly stdout: string; readonly stderr: string } {
  const motivo = motivoDeGitDeWorktree(argumentos);
  if (motivo !== null) fail(motivo, EXIT_INVARIANT);
  return ejecutor(argumentos, root);
}

/**
 * Solo el checkout principal puede crear o quitar worktrees: su `--git-dir` es el común. Desde un
 * worktree enlazado los dos difieren y se rechaza señalando el checkout principal.
 */
export function exigirCheckoutPrincipal(root: string, git?: EjecutorDeGit): void {
  const leer = (bandera: string): string => {
    const r = ejecutarGitDeWorktree(root, ["rev-parse", bandera], git);
    if (r.status !== 0) fail(`${root} no es un repositorio git: ${r.stderr.trim()}`, EXIT_INVARIANT);
    const ruta = resolve(root, r.stdout.trim());
    try {
      return realpathSync(ruta);
    } catch {
      return ruta;
    }
  };
  const gitDir = leer("--git-dir");
  const comun = leer("--git-common-dir");
  if (gitDir !== comun) {
    fail(
      `${root} es un worktree enlazado: los worktrees de ticket se crean y se quitan solo desde el checkout principal (${comun.replace(/\/\.git$/, "")}).`,
      EXIT_INVARIANT,
    );
  }
}

export type EjecutorDeProceso = (
  comando: string,
  argumentos: readonly string[],
  cwd: string,
) => { readonly status: number; readonly stdout: string; readonly stderr: string };

/** Por qué un proceso no se admite en la receta del worktree, o `null` si se admite. */
export function motivoDeProcesoDeWorktree(comando: string, argumentos: readonly string[]): string | null {
  const clave = `${comando} ${argumentos.join(" ")}`;
  if (comando === "cp" && argumentos.length === 3 && (argumentos[0] === "-Rc" || argumentos[0] === "-R") && argumentos[1]!.endsWith("node_modules") && argumentos[2]!.endsWith("node_modules")) return null;
  if (clave === "npx tsc --build tsconfig.build.json") return null;
  if (clave === "node scripts/copy-web.mjs") return null;
  return `El proceso "${clave}" no está permitido en los worktrees (solo cp -Rc|-R de node_modules, npx tsc --build tsconfig.build.json y node scripts/copy-web.mjs).`;
}

const ejecutarProcesoDeVerdad: EjecutorDeProceso = (comando, argumentos, cwd) => {
  const r = spawnSync(comando, [...argumentos], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

/** El único proceso que lanza la receta del worktree: lista cerrada, rechaza antes de lanzar. */
export function ejecutarProcesoDeWorktree(
  comando: string,
  argumentos: readonly string[],
  cwd: string,
  ejecutor: EjecutorDeProceso = ejecutarProcesoDeVerdad,
): { readonly status: number; readonly stdout: string; readonly stderr: string } {
  const motivo = motivoDeProcesoDeWorktree(comando, argumentos);
  if (motivo !== null) fail(motivo, EXIT_INVARIANT);
  return ejecutor(comando, argumentos, cwd);
}
