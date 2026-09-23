/**
 * @valmen/cli — superficie de comandos del harness.
 *
 * Los comandos devuelven un `CommandResult` en vez de escribir en la salida, de
 * modo que son testeables en aislamiento y reutilizables desde el servidor web
 * sin duplicar lógica.
 *
 * El descubrimiento de tickets y la ejecución de gates no viven aquí: están en
 * `@valmen/engine`, porque Mission Control ejecuta los mismos gates y dos
 * implementaciones podrían dar dos veredictos sobre el mismo ticket. El CLI se
 * reexporta lo que necesita para que `@valmen/cli` siga siendo una sola puerta.
 */

export * from "./commands.js";
export * from "./features.js";
export { parseArgs, dispatch, resolvePaths, run } from "./main.js";
export type { CommandResult } from "./commands.js";
export type { LocatedTicket, RegistryPaths, RunnerResult } from "@valmen/engine";
