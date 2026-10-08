/**
 * El sondeo de CodeGraph en la máquina.
 *
 * Se comprueba **ejecutando** `codegraph status --json`, el mismo patrón que
 * `hermesBinaryWorks`: buscar el binario en el `PATH` no dice si arranca ni si el
 * proyecto tiene índice. Solo `status`, que es de solo lectura: este sondeo nunca
 * lanza `init`, `index` ni `sync`, porque el diagnóstico no escribe nada.
 */
import { spawnSync } from "node:child_process";

import { type CodegraphState, readCodegraphStatus } from "@valmen/adapter";

export type { CodegraphState };

/** El estado de CodeGraph para el proyecto de `root`, con el entorno `env` (su `PATH`). */
export function probeCodegraph(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): CodegraphState {
  try {
    const r = spawnSync("codegraph", ["status", "--json"], {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 10_000,
    });
    const code = (r.error as NodeJS.ErrnoException | undefined)?.code;
    return readCodegraphStatus({
      errorCode: r.error === undefined ? undefined : (code ?? "ERROR"),
      status: r.status,
      stdout: r.stdout ?? "",
    });
  } catch {
    return { estado: "ilegible", motivo: "no se pudo lanzar codegraph" };
  }
}
