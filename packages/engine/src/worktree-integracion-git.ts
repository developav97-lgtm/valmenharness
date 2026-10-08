/**
 * El git de la integración de la rama de un worktree: una lista cerrada que se suma a la de los
 * worktrees (`motivoDeGitDeWorktree`).
 *
 * Integrar necesita leer (`show`, `diff --name-only -z`, `merge-base`, `merge-tree`) y escribir en
 * `main` con unas pocas formas de `merge`, `add` y `commit`. No se amplía la lista de las jornadas
 * (`integration-rules.ts`): la autoridad git de la jornada autónoma no crece, y el precedente es
 * `qa-agent-git.ts`. Nunca push, fetch, pull, reset, rebase, clean, tag ni remote, ni banderas de
 * fuerza (`--force`, `-f`, `-D`, `--hard`). Rechaza antes de lanzar nada y dice el motivo.
 */
import { spawnSync } from "node:child_process";

import { EXIT_INVARIANT, fail } from "@valmen/core";

import { type EjecutorDeGit } from "./integration-rules.js";
import { motivoDeGitDeWorktree } from "./worktree-git.js";

const REFERENCIA = /^[A-Za-z0-9_][A-Za-z0-9_./^~@-]*$/;
const RAMA_DE_TICKET = /^valmen\/ticket-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REVISION_Y_RUTA = /^[A-Za-z0-9_][A-Za-z0-9_./^~@-]*:[^\s:-][^\s:]*$/;
const BANDERAS_DE_FUERZA = ["--force", "-f", "-D", "--hard", "--no-verify", "--amend"];

const rutaSegura = (ruta: string): boolean => ruta !== "" && !ruta.startsWith("-") && !ruta.startsWith("/") && !ruta.split("/").includes("..");

/** Por qué una invocación de git no se admite en la integración, o `null` si se admite. */
export function motivoDeGitDeIntegracion(argumentos: readonly string[]): string | null {
  const [operacion, ...resto] = argumentos;
  if (operacion === undefined) return "No se indicó ninguna operación de git.";
  const prohibida = resto.find((a) => BANDERAS_DE_FUERZA.includes(a));
  if (prohibida !== undefined) return `La bandera ${prohibida} no está permitida en la integración.`;
  switch (operacion) {
    case "show":
      return resto.length === 1 && REVISION_Y_RUTA.test(resto[0]!) && rutaSegura(resto[0]!.slice(resto[0]!.indexOf(":") + 1))
        ? null
        : "git show solo se admite como `<revisión>:<ruta>`.";
    case "diff":
      return resto.length === 3 && resto[0] === "--name-only" && resto[1] === "-z" && REFERENCIA.test(resto[2]!)
        ? null
        : "git diff solo se admite como `--name-only -z <rango>`.";
    case "merge-base":
      if (resto.length === 2 && REFERENCIA.test(resto[0]!) && REFERENCIA.test(resto[1]!)) return null;
      return motivoDeGitDeWorktree(argumentos);
    case "merge-tree":
      return resto.length === 5 &&
        resto[0] === "--write-tree" &&
        resto[1] === "--name-only" &&
        resto[2] === "--no-messages" &&
        REFERENCIA.test(resto[3]!) &&
        REFERENCIA.test(resto[4]!)
        ? null
        : "git merge-tree solo se admite como `--write-tree --name-only --no-messages <a> <b>`.";
    case "merge":
      if (resto.length === 1 && resto[0] === "--abort") return null;
      if (resto.length === 2 && resto[0] === "--ff-only" && RAMA_DE_TICKET.test(resto[1]!)) return null;
      if (resto.length === 3 && resto[0] === "--no-ff" && resto[1] === "--no-commit" && RAMA_DE_TICKET.test(resto[2]!)) return null;
      return "git merge solo se admite como `--ff-only <rama>`, `--no-ff --no-commit <rama>` o `--abort`.";
    case "add":
      return resto.length >= 2 && resto[0] === "--" && resto.slice(1).every(rutaSegura) ? null : "git add solo se admite como `-- <archivos>`.";
    case "commit":
      return resto.length === 2 && resto[0] === "-m" && resto[1]!.trim() !== "" ? null : "git commit solo se admite como `-m <mensaje>`.";
    default:
      return motivoDeGitDeWorktree(argumentos);
  }
}

const ejecutarGitDeVerdad: EjecutorDeGit = (argumentos, cwd) => {
  const r = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...argumentos], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

/** El único git de la integración: rechaza antes de lanzar nada y dice el motivo. */
export function ejecutarGitDeIntegracion(
  root: string,
  argumentos: readonly string[],
  ejecutor: EjecutorDeGit = ejecutarGitDeVerdad,
): { readonly status: number; readonly stdout: string; readonly stderr: string } {
  const motivo = motivoDeGitDeIntegracion(argumentos);
  if (motivo !== null) fail(motivo, EXIT_INVARIANT);
  return ejecutor(argumentos, root);
}
