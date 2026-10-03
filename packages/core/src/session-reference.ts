/**
 * Referencia portable a una sesión que un adaptador puede observar.
 *
 * No contiene rutas ni contenido de conversación: el motor necesita una
 * identidad verificable para enlazar un intento, no reconstruir la sesión por
 * título, hora o texto. El adaptador y el ámbito hacen que el identificador no
 * se confunda con el de otra fuente.
 */
import { EXECUTION_ID_RE } from "./execution-identity.js";

/** Etiqueta de adaptador, con la misma forma que las fuentes de eventos. */
export const SESSION_ADAPTER_RE = /^[a-z][a-z0-9._-]{0,63}$/;

/** Identidad que un adaptador declara para una de sus sesiones. */
export interface SessionReference {
  readonly adapter: string;
  readonly scope: string;
  readonly sessionId: string;
}

/** Valida y congela una referencia que puede persistirse en el historial. */
export function createSessionReference(input: SessionReference): SessionReference {
  if (!SESSION_ADAPTER_RE.test(input.adapter)) {
    throw new Error("adapter debe ser una etiqueta de adaptador en minúsculas, sin espacios.");
  }
  if (!EXECUTION_ID_RE.test(input.scope)) {
    throw new Error("scope debe ser un identificador portable no vacío, sin rutas ni espacios.");
  }
  if (!EXECUTION_ID_RE.test(input.sessionId)) {
    throw new Error("sessionId debe ser un identificador portable no vacío, sin rutas ni espacios.");
  }
  return Object.freeze({
    adapter: input.adapter,
    scope: input.scope,
    sessionId: input.sessionId,
  });
}
