/**
 * El git de la compuerta `qa-agent`: una lista cerrada y propia.
 *
 * Crear un worktree desacoplado y leer el commit base es todo lo que la compuerta necesita. No se
 * amplía la lista de las jornadas (`integration-rules.ts`) ni se admite `push`, `fetch`, `reset` ni
 * `tag`: lo que no está en esta lista se rechaza antes de lanzar nada. Los hooks quedan apagados.
 */
import { spawnSync } from "node:child_process";

import { EXIT_INVARIANT, fail } from "@valmen/core";

export type EjecutorGitQa = (
  argumentos: readonly string[],
  cwd: string,
) => { readonly status: number; readonly stdout: string; readonly stderr: string };

/** Por qué una invocación no se admite, o `null` si se admite. */
export function motivoDeGitDeQaAgent(argumentos: readonly string[]): string | null {
  const [operacion, ...resto] = argumentos;
  if (operacion === undefined) return "No se indicó ninguna operación de git.";
  const prohibida = resto.find((a) => ["--force", "-f", "--hard", "--no-verify", "--amend"].includes(a) && !(operacion === "worktree" && a === "--force"));
  if (prohibida !== undefined) return `La bandera ${prohibida} no está permitida a qa-agent.`;
  switch (operacion) {
    case "worktree":
      if (resto[0] === "add" && resto[1] === "--detach" && resto.length === 4) return null;
      if (resto[0] === "remove" && resto[1] === "--force" && resto.length === 3) return null;
      return "git worktree solo se admite como `add --detach <carpeta> <commit>` o `remove --force <carpeta>`.";
    case "rev-parse":
      return resto.length === 1 && !resto[0]!.startsWith("-") ? null : "git rev-parse admite una sola referencia.";
    case "diff":
      return resto[0] === "--name-only" && resto.length >= 2 && resto.length <= 3 ? null : "git diff solo se admite como `--name-only [--diff-filter=A] <rango>`.";
    case "show":
      return resto.length === 1 && /^[0-9a-f]{7,64}:[^\s]+$/.test(resto[0]!) ? null : "git show solo se admite como `<commit>:<ruta>`.";
    default:
      return `La operación git ${operacion} no está permitida a qa-agent (solo worktree, rev-parse, diff y show).`;
  }
}

const ejecutarGitDeVerdad: EjecutorGitQa = (argumentos, cwd) => {
  const r = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...argumentos], { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

/** El único git que `qa-agent` ejecuta: rechaza antes de lanzar nada y dice el motivo. */
export function ejecutarGitDeQaAgent(
  argumentos: readonly string[],
  cwd: string,
  ejecutor: EjecutorGitQa = ejecutarGitDeVerdad,
): { readonly status: number; readonly stdout: string; readonly stderr: string } {
  const motivo = motivoDeGitDeQaAgent(argumentos);
  if (motivo !== null) fail(motivo, EXIT_INVARIANT);
  return ejecutor(argumentos, cwd);
}
