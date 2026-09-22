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
import {
  abandonProcessRun,
  approveProcessGate,
  listProcessRuns,
  listProcesses,
  resumeProcessRun,
  runProcessCommand,
  showProcess,
  showProcessRun,
} from "./commands.js";

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
    // El ciclo de un proceso que se detiene en un gate: aprobar, ver qué hay
    // detenido, retomar y abandonar. Son cuatro actos distintos a propósito:
    // aprobar no retoma —quien aprueba no tiene por qué continuar— y retomar no
    // aprueba.
    case "approve":
      return approveProcessGate(root, resto[0], flags);
    case "runs":
      return listProcessRuns(root);
    case "show-run":
      return showProcessRun(root, resto[0]);
    case "resume":
      return resumeProcessRun(root, resto[0], flags);
    case "abandon":
      return abandonProcessRun(root, resto[0]);
    case undefined:
      return error(
        "process requiere un subcomando: list, show, run, approve, runs, show-run, resume o abandon.",
        EXIT_SCHEMA,
      );
    default:
      return error(
        `Subcomando de process desconocido: ${sub}. Use list, show, run, approve, ` +
          "runs, show-run, resume o abandon.",
        EXIT_SCHEMA,
      );
  }
}
