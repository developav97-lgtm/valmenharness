/**
 * Los comandos de manuales.
 *
 * Viven aparte de `commands.ts` por la misma razón que los de procesos: son un
 * registro distinto —los manuales de usuario final, no el de tickets— y así cada
 * archivo lee solo lo suyo.
 *
 * `manuales pendientes` es de solo lectura salvo por `--escribir`, que deja el
 * listado en el directorio de manuales. Sin esa bandera no escribe nada: el
 * comando existe para **mirar** qué quedó viejo antes de tocar un manual.
 */
import { EXIT_SCHEMA } from "@valmen/core";

import type { CommandResult } from "./commands.js";
import { manualesPendientesCommand } from "./commands.js";

/** Falla con el mensaje y el código que corresponde. */
function error(stderr: string, exitCode: number): CommandResult {
  return { stdout: "", stderr, exitCode };
}

/** `manuales <subcomando>`: el despachador. */
export function runManuales(
  root: string,
  args: readonly string[],
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const [sub] = args;
  switch (sub) {
    case "pendientes":
      return manualesPendientesCommand(root, flags);
    case undefined:
      return error("manuales requiere un subcomando: pendientes.", EXIT_SCHEMA);
    default:
      return error(
        `Subcomando de manuales desconocido: ${sub}. Use pendientes.`,
        EXIT_SCHEMA,
      );
  }
}
