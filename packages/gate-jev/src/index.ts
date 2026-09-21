/**
 * @valmen/gate-jev — evaluador de gates con TypeSafe Jev.
 *
 * Implementa el mismo contrato que cualquier otro evaluador, detrás del seam de
 * `@valmen/gate`. Eso es lo que permite sustituirlo por un modelo de chat, un
 * comando o un servidor MCP sin tocar un solo gate.
 */

export * from "./jev.js";
