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
 * La proyección de estas listas a los agentes la suma SECURITY-CLI-PROYECCION-DENEGADOS-20261010,
 * con su consumidor. Core no toca la red ni el disco, así que el módulo no depende de ningún otro.
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
