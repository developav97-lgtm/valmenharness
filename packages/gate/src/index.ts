/**
 * @valmen/gate — motor de decisión de gates.
 *
 * Lógica pura y determinista: recibe proposiciones y respuestas, aplica
 * umbrales y devuelve una decisión con su recibo. No toca la red, así que se
 * prueba sin claves ni conexión.
 *
 * El evaluador concreto —un modelo, un comando, un servidor MCP— vive en un
 * paquete aparte, detrás del mismo contrato. Eso es lo que permite cambiar Jev
 * por otra cosa sin tocar un solo gate.
 */

export * from "./decide.js";
export * from "./receipt.js";
export * from "./definitions.js";
