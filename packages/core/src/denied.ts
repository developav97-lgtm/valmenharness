/**
 * La lista única de lo que el harness niega: rutas sensibles y banderas de git.
 *
 * Es la lista de la decisión D5 de la feature guardas-verificacion-harness: una sola en código,
 * la misma que lee el motor. Hasta ahora lo prohibido estaba repartido en cinco declaraciones del
 * motor (un juego de rutas y cuatro de banderas que no coincidían entre sí); aquí queda lo que
 * todas comparten, y cada módulo del motor conserva solo su extra: `--force-with-lease` en las
 * jornadas, `-D` en los worktrees. Sumar el extra a todos cambiaría lo que cada lista cerrada
 * admite, y eso es autoridad del agente: esta lista no la amplía ni la reduce.
 *
 * Además lleva las dos listas que `valmen sync` proyecta a los agentes: `SENSITIVE_PATH_GLOBS` y
 * `DENIED_GIT_COMMANDS`. Van **sin la sintaxis de ningún cliente**: globs y formas de comando en
 * texto plano, para que cada adaptador las traduzca a la suya (hoy el de Claude Code las lee en
 * `claude-code.ts`; Codex y OpenCode las leerán igual). Core no toca la red ni el disco, así que
 * el módulo no depende de ningún otro.
 */

/**
 * Rutas de credenciales: nada de lo que coincida se commitea ni se lee. Sin banderas de expresión
 * regular a propósito: con `g` o `y`, `test` guarda estado en `lastIndex` y daría resultados
 * alternos al compartir el mismo objeto entre módulos.
 */
export const SENSITIVE_PATH_PATTERNS: readonly RegExp[] = Object.freeze([
  /(^|\/)\.env(\.|$)/,
  /(^|\/)\.credentials(\.|$)/,
  /(^|\/)(id_rsa|id_ed25519)(\.pub)?$/,
  /\.(pem|key|p12)$/,
]);

/** Banderas de git de fuerza o de reescritura que ninguna lista cerrada del motor admite. */
export const DENIED_GIT_FLAGS: readonly string[] = Object.freeze([
  "--force",
  "-f",
  "--hard",
  "--no-verify",
  "--amend",
]);

/**
 * Las mismas rutas de credenciales como globs, para los clientes que filtran por patrón de ruta
 * en vez de por expresión regular. Dan el mismo veredicto que `SENSITIVE_PATH_PATTERNS` sobre
 * una ruta relativa (una prueba lo comprueba), y suman `~/.ssh/**`, que el motor no consume
 * porque no commitea fuera del proyecto pero los agentes sí pueden leer.
 */
export const SENSITIVE_PATH_GLOBS: readonly string[] = Object.freeze([
  "**/.env",
  "**/.env.*",
  "**/.credentials",
  "**/.credentials.*",
  "**/id_rsa",
  "**/id_rsa.pub",
  "**/id_ed25519",
  "**/id_ed25519.pub",
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "~/.ssh/**",
]);

/**
 * Las formas de git que nunca se automatizan, como `git <operación> <bandera>`. Distinta de
 * `DENIED_GIT_FLAGS`, que niega la bandera en cualquier operación de las listas cerradas del
 * motor: aquí la bandera solo se niega con su operación (`-d` borra una etiqueta o una rama
 * remota, pero en `git branch -d` lo admiten los worktrees). `git push +` es el push forzado por
 * refspec (`git push origin +main`).
 */
export const DENIED_GIT_COMMANDS: readonly string[] = Object.freeze([
  "git push --force",
  "git push -f",
  "git push +",
  "git push --delete",
  "git push -d",
  "git reset --hard",
  "git clean -f",
  "git clean --force",
  "git tag -d",
  "git tag --delete",
]);
