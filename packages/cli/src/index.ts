/**
 * @valmen/cli — superficie de comandos del harness.
 *
 * Los comandos devuelven un `CommandResult` en vez de escribir en la salida, de
 * modo que son testeables en aislamiento y reutilizables desde el servidor web
 * sin duplicar lógica.
 */

export * from "./discovery.js";
export * from "./index-file.js";
export * from "./commands.js";
export { parseArgs, dispatch, resolvePaths, run } from "./main.js";
export type { CommandResult } from "./commands.js";
