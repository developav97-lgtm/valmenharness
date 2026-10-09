/**
 * Opciones de la pantalla de autorizaciones: solo lectura.
 * Los módulos son los del proyecto activo (el que resolvió `X-Valmen-Project`).
 */
import { opcionesDeAutorizacion, type RegistryPaths } from "@valmen/engine";
import { toFailure } from "@valmen/core";

export interface RespuestaOpciones {
  readonly status: number;
  readonly body: unknown;
}

/** Las opciones de autorización de la raíz dada. */
export function listarOpcionesDeAutorizacion(root: string, paths: RegistryPaths): RespuestaOpciones {
  try {
    return { status: 200, body: opcionesDeAutorizacion(root, paths) };
  } catch (error) {
    const f = toFailure(error);
    return { status: 400, body: { error: f.message } };
  }
}
