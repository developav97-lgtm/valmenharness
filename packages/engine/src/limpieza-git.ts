/**
 * El git de `valmen cleanup`: lista cerrada y propia, con el precedente de `worktree-git.ts`.
 *
 * La limpieza masiva necesita quitar worktrees que no son `ticket-<slug>` (desacoplados, de una
 * sesión ajena), algo que la lista de `journey worktree` no admite a propósito y que aquí no se
 * amplía. Esta lista solo deja `worktree remove` de una carpeta directa de `.claude/worktrees/` y
 * `branch -d` de una rama que no sea `main`; el resto es lectura. Lo demás se rechaza antes de
 * lanzar nada: ni push, reset, clean, tag, ni banderas de fuerza (`--force`, `-f`, `-D`, `--hard`).
 */
import { spawnSync } from "node:child_process";

import { DENIED_GIT_FLAGS, EXIT_INVARIANT, fail } from "@valmen/core";

import { type EjecutorDeGit } from "./integration-rules.js";

const REFERENCIA = /^[A-Za-z0-9_][A-Za-z0-9_./:^~@-]*$/;
const CARPETA_DE_WORKTREE =
  /^(?:[^\s]*\/)?\.claude\/worktrees\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const BANDERAS_DE_FUERZA = [...DENIED_GIT_FLAGS, "-D"];

function esCarpetaDeWorktree(carpeta: string): boolean {
  return !carpeta.split("/").includes("..") && CARPETA_DE_WORKTREE.test(carpeta);
}

/** Por qué una invocación de git no se admite en la limpieza, o `null` si se admite. */
export function motivoDeGitDeLimpieza(argumentos: readonly string[]): string | null {
  const [operacion, ...resto] = argumentos;
  if (operacion === undefined) return "No se indicó ninguna operación de git.";
  const prohibida = resto.find((a) => BANDERAS_DE_FUERZA.includes(a));
  if (prohibida !== undefined)
    return `La bandera ${prohibida} no está permitida en la limpieza.`;
  switch (operacion) {
    case "status":
      return resto.length === 2 && resto[0] === "--porcelain" && resto[1] === "-uall"
        ? null
        : "git status solo se admite como `--porcelain -uall`.";
    case "rev-parse":
      if (
        resto.length === 1 &&
        (resto[0] === "--git-dir" || resto[0] === "--git-common-dir" || resto[0] === "HEAD")
      )
        return null;
      return resto.length === 2 && resto[0] === "--abbrev-ref" && REFERENCIA.test(resto[1]!)
        ? null
        : "git rev-parse admite `--git-dir`, `--git-common-dir`, `HEAD` o `--abbrev-ref <ref>`.";
    case "merge-base":
      return resto.length === 3 &&
        resto[0] === "--is-ancestor" &&
        REFERENCIA.test(resto[1]!) &&
        resto[2] === "main"
        ? null
        : "git merge-base solo se admite como `--is-ancestor <ref> main`.";
    case "branch":
      return resto.length === 2 &&
        resto[0] === "-d" &&
        resto[1] !== "main" &&
        REFERENCIA.test(resto[1]!)
        ? null
        : "git branch solo se admite como `-d <rama distinta de main>`.";
    case "worktree":
      if (resto.length === 2 && resto[0] === "list" && resto[1] === "--porcelain")
        return null;
      if (resto.length === 2 && resto[0] === "remove" && esCarpetaDeWorktree(resto[1]!))
        return null;
      return "git worktree solo se admite como `list --porcelain` o `remove <carpeta de .claude/worktrees/>` (sin --force).";
    default:
      return `La operación git ${operacion} no está permitida en la limpieza (solo status, rev-parse, merge-base, branch -d y worktree).`;
  }
}

const ejecutarGitDeVerdad: EjecutorDeGit = (argumentos, cwd) => {
  const r = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...argumentos], {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

/** El único git de la limpieza: rechaza antes de lanzar nada y dice el motivo. */
export function ejecutarGitDeLimpieza(
  cwd: string,
  argumentos: readonly string[],
  ejecutor: EjecutorDeGit = ejecutarGitDeVerdad,
): { readonly status: number; readonly stdout: string; readonly stderr: string } {
  const motivo = motivoDeGitDeLimpieza(argumentos);
  if (motivo !== null) fail(motivo, EXIT_INVARIANT);
  return ejecutor(argumentos, cwd);
}
