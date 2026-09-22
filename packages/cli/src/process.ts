/**
 * Los comandos de procesos.
 *
 * Viven aparte de `commands.ts` por la misma razón que los de features: son un
 * registro distinto —`.valmen/processes/`, no el de tickets— y así cada archivo
 * lee solo lo suyo.
 *
 * `process run` es el único comando del CLI que ejecuta comandos del proyecto, y
 * eso tiene una consecuencia que conviene decir: **lo que corre es lo que declara
 * el YAML**, ya sustituido y sin interpretación. El motor no construye comandos
 * por su cuenta ni decide argumentos; si el proceso dice `git tag v{version}`, eso
 * es lo que se ejecuta.
 */
import { EXIT_SCHEMA } from "@valmen/core";

import type { CommandResult } from "./commands.js";
import { listProcesses, runProcessCommand, showProcess } from "./commands.js";

/** Falla con el mensaje y el código que corresponde. */
function error(stderr: string, exitCode: number): CommandResult {
  return { stdout: "", stderr, exitCode };
}

/** `process <subcomando>`: el despachador. */
export function runProcess(
  root: string,
  args: readonly string[],
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const [sub, ...resto] = args;
  switch (sub) {
    case "list":
      return listProcesses(root);
    case "show":
      return showProcess(root, resto[0]);
    case "run":
      return runProcessCommand(root, resto[0], flags);
    case undefined:
      return error("process requiere un subcomando: list, show o run.", EXIT_SCHEMA);
    default:
      return error(
        `Subcomando de process desconocido: ${sub}. Use list, show o run.`,
        EXIT_SCHEMA,
      );
  }
}
