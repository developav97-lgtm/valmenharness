/**
 * @valmen/adapter — proyección del modelo del proyecto a los archivos que leen
 * los agentes de código.
 *
 * La función central es pura y determinista: el mismo modelo produce siempre el
 * mismo texto. Esa propiedad es la que permite que `sync --check` detecte una
 * edición a mano sin falsos positivos.
 */

export * from "./config.js";
export * from "./capabilities.js";
export * from "./machine-bindings.js";
export * from "./templates.js";
export * from "./project.js";
export * from "./rule-projection.js";
export * from "./agents-size.js";
export * from "./claude-code.js";
export * from "./projection.js";
export * from "./adopt.js";
export * from "./adopt-rules.js";
export * from "./routing.js";
export * from "./agents.js";
export * from "./skills.js";
export * from "./mcp.js";
export * from "./hermes-relay.js";
export * from "./blueprints.js";
export * from "./kanban.js";
export * from "./hermes.js";
export * from "./opencode.js";
export * from "./codex.js";
