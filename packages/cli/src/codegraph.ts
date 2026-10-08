/**
 * El sondeo de CodeGraph en la máquina.
 *
 * Se comprueba **ejecutando** `codegraph status --json`, el mismo patrón que
 * `hermesBinaryWorks`: buscar el binario en el `PATH` no dice si arranca ni si el
 * proyecto tiene índice. Solo `status`, que es de solo lectura: este sondeo nunca
 * lanza `init`, `index` ni `sync`, porque el diagnóstico no escribe nada.
 *
 * Indexar (`runCodegraphIndex`) es aparte y solo lo llama `valmen adopt
 * --codegraph`, es decir, con la confirmación explícita de la persona.
 */
import { spawnSync } from "node:child_process";

import { type CodegraphState, readCodegraphStatus } from "@valmen/adapter";

export type { CodegraphState };

/** El tope de `codegraph init`/`sync`: holgado, porque indexar un proyecto grande tarda. */
export const CODEGRAPH_INDEX_TIMEOUT_MS = 600_000;

/** Lo que pasó al lanzar `codegraph init` o `codegraph sync`. */
export interface CodegraphIndexResult {
  /** El comando que se lanzó, tal como se lo escribiría una persona. */
  readonly comando: string;
  /** El código de salida; `null` si el proceso no terminó por sí solo (tope de tiempo, señal). */
  readonly exitCode: number | null;
  /**
   * Por qué falló, o `null` si indexó. Una salida distinta de 0 siempre trae un
   * motivo; el código va aparte, en `exitCode`.
   */
  readonly error: string | null;
}

/** Un argumento con espacios se muestra entre comillas; el que no, tal cual. */
export function mostrarArgumento(valor: string): string {
  return /\s/.test(valor) ? JSON.stringify(valor) : valor;
}

/**
 * El comando que indexa el proyecto de `root` según el estado, o `null` si no
 * hay nada que indexar: sin índice se crea (`init`), desactualizado se actualiza
 * (`sync`) y en cualquier otro estado no se lanza nada —no instalado no tiene
 * binario, ilegible no se sabe qué hay y al día no hace falta—.
 */
export function codegraphIndexArgs(root: string, estado: CodegraphState): string[] | null {
  if (estado.estado === "sin-indice") return ["init", root];
  if (estado.estado === "desactualizado") return ["sync", root];
  return null;
}

/** El comando de `codegraphIndexArgs` como texto, o `null` si no hay nada que lanzar. */
export function codegraphIndexCommand(root: string, estado: CodegraphState): string | null {
  const args = codegraphIndexArgs(root, estado);
  return args === null ? null : `codegraph ${args.map(mostrarArgumento).join(" ")}`;
}

/**
 * Indexa el proyecto de `root`: `codegraph init` si no hay índice, `codegraph
 * sync` si está desactualizado.
 *
 * Es lo único del harness que lanza CodeGraph con efectos —el resto es
 * `status`— y solo se llama con la confirmación de la persona. Devuelve `null`
 * cuando el estado no pide indexar. Un fallo o un tope vencido no lanza: queda
 * en el resultado, para que quien llama lo informe sin deshacer nada.
 */
export function runCodegraphIndex(
  root: string,
  estado: CodegraphState,
  env: NodeJS.ProcessEnv = process.env,
): CodegraphIndexResult | null {
  const args = codegraphIndexArgs(root, estado);
  const comando = codegraphIndexCommand(root, estado);
  if (args === null || comando === null) return null;

  try {
    const r = spawnSync("codegraph", args, {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: CODEGRAPH_INDEX_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (r.error !== undefined) {
      const code = (r.error as NodeJS.ErrnoException).code ?? "ERROR";
      return {
        comando,
        exitCode: null,
        error:
          code === "ETIMEDOUT"
            ? `no terminó en ${CODEGRAPH_INDEX_TIMEOUT_MS / 1000} s y se detuvo`
            : `no se pudo lanzar codegraph (${code})`,
      };
    }
    if (r.status === 0) return { comando, exitCode: 0, error: null };

    // El código de salida va en `exitCode`: quien informa lo muestra, y aquí solo
    // queda el motivo (la última línea que codegraph escribió, si escribió algo).
    const detalle = (r.stderr || r.stdout || "").trim().split("\n").filter(Boolean).pop();
    return {
      comando,
      exitCode: r.status,
      error: r.status === null ? "el proceso no terminó" : (detalle ?? "sin detalle"),
    };
  } catch {
    return { comando, exitCode: null, error: "no se pudo lanzar codegraph" };
  }
}

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
