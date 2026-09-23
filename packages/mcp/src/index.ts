/**
 * @valmen/mcp — el harness al alcance de un agente.
 *
 * Existe porque el flujo de trabajo no puede empezar en una terminal. Quien
 * reporta un problema habla con su agente —opencode, codex, Claude Code—, y el
 * agente necesita poder dar de alta el ticket, validarlo, evaluar la compuerta y
 * mover el estado. Este paquete expone esas operaciones como herramientas MCP.
 *
 * Lo que **no** expone es igual de importante: no hay herramienta para aprobar
 * una compuerta. La aprobación es una decisión humana y vive en Mission Control y
 * en `gate-decide`. Un agente que pudiera aprobarse a sí mismo convertiría el
 * control en un trámite.
 *
 * El servidor habla JSON-RPC 2.0 por stdio y no tiene dependencias: el camino
 * crítico del harness —el que tiene que funcionar dentro del agente de otra
 * persona— no debería poder romperse porque cambió una dependencia transitiva.
 */

export { TOOLS, callTool } from "./tools.js";
export type { ToolContext } from "./tools.js";
export { getPromptFor, promptsFor } from "./prompts.js";
export {
  PROTOCOL_VERSION,
  serveStdio,
  type PromptDefinition,
  type PromptResult,
  type ServerCatalog,
  type ToolDefinition,
  type ToolResult,
} from "./protocol.js";
export {
  SERVER_NAME,
  SERVER_VERSION,
  credentialsFor,
  describe,
  main,
  parseOptions,
  pathsFor,
  type Options,
} from "./main.js";
