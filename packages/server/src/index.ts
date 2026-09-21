/**
 * @valmen/server — Mission Control, el servidor local.
 *
 * Sin lógica de negocio: cada endpoint llama al mismo motor que usa el CLI. Si
 * un botón de la interfaz y un comando pudieran divergir, lo que se ve en
 * pantalla sería una mentira.
 */

export * from "./providers.js";
export * from "./tickets.js";
export * from "./server.js";
