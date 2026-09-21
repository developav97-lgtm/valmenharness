/**
 * @valmen/adapter — proyección del modelo del proyecto a los archivos que leen
 * los agentes de código.
 *
 * La función central es pura y determinista: el mismo modelo produce siempre el
 * mismo texto. Esa propiedad es la que permite que `sync --check` detecte una
 * edición a mano sin falsos positivos.
 */

export * from "./config.js";
export * from "./templates.js";
export * from "./project.js";
export * from "./adopt.js";
