/**
 * El permiso de escritura del motor, y el modo pregunta.
 *
 * El modo de fallo que esto cierra es el más caro de un agente: editar cuando se
 * le pidió analizar. Hasta ahora la única barrera era la instrucción que el
 * agente recibía —«investigar, explicar, revisar y comparar son operaciones
 * read-only salvo que el pedido autorice un cambio»—, y una instrucción no es un
 * permiso: el motor no tenía noción de «esta sesión no escribe», así que
 * cualquiera de sus caminos de mutación estaba disponible mientras el asistente
 * decía que sólo consultaba.
 *
 * Acá el permiso es un dato del proceso, y se niega **en el motor**: en modo
 * pregunta, `assertWriteAllowed` hace fallar toda escritura con el código de
 * invariante antes de que toque el disco. La instrucción deja de ser la barrera;
 * lo que la reemplaza es código que no se puede convencer.
 *
 * Por qué el modo es estado del proceso y no un parámetro: pasar el permiso por
 * la firma de cada función sería más puro y obligaría a tocar decenas de firmas
 * —y a dejar sin guardia cualquier camino que se agregue después sin el
 * parámetro—, que es justo el modo de fallo que se quiere cerrar. El estado
 * compartido se acota a dos cosas: los comandos lo piden con `withAccessMode`,
 * que restaura el modo anterior aunque la acción lance, y una prueba afirma esa
 * restauración.
 */

import { EXIT_INVARIANT, fail } from "./errors.js";

/**
 * Los dos modos del motor frente a la escritura.
 *
 * - **`write`** — el de siempre, y el que vale por defecto: el motor escribe
 *   cuando un comando lo pide.
 * - **`ask`** — el modo pregunta: el motor **no concede** permiso de escritura, y
 *   todo camino que intente escribir falla con invariante.
 */
export type AccessMode = "write" | "ask";

/** Las capacidades que el motor le concede a un agente en un modo. */
export interface AgentCapabilities {
  /** `true` si puede escribir el registro y sus archivos. */
  readonly write: boolean;
  /** `true` si puede ejecutar comandos que mutan el sistema. */
  readonly execute: boolean;
}

/** El modo vigente. Por defecto se escribe: el modo pregunta se pide. */
let modo: AccessMode = "write";

/** El modo vigente del proceso. */
export function accessMode(): AccessMode {
  return modo;
}

/** Cambia el modo del proceso. */
export function setAccessMode(mode: AccessMode): void {
  modo = mode;
}

/**
 * Corre una acción en un modo y restaura el anterior.
 *
 * La restauración va en `finally` a propósito: una consulta que falla no puede
 * dejar al proceso sin permiso de escritura para todo lo que venga después.
 */
export function withAccessMode<T>(mode: AccessMode, action: () => T): T {
  const previo = modo;
  modo = mode;
  try {
    return action();
  } finally {
    modo = previo;
  }
}

/** `true` si el modo vigente concede escritura. */
export function writesAllowed(): boolean {
  return modo === "write";
}

/**
 * Falla si el modo vigente no concede escritura.
 *
 * `acto` es lo que se estaba intentando —«crear un ticket», «escribir
 * `tickets/…/ticket.md`»—, y va en el mensaje porque quien lo lee necesita saber
 * qué no se pudo hacer, no sólo que no se pudo.
 */
export function assertWriteAllowed(acto: string): void {
  if (modo === "write") return;
  fail(
    `Modo pregunta: el motor no concede permisos de escritura, así que no puede ${acto}. ` +
      "Ejecute el comando fuera del modo pregunta, o pida la escritura a una sesión de trabajo.",
    EXIT_INVARIANT,
  );
}

/**
 * Las capacidades que se le declaran a un agente en un modo.
 *
 * Es la misma declaración que `packages/adapter` proyecta a cada runtime
 * —`sandbox_mode = "read-only"`, `permission.edit: deny`—, derivada del modo en
 * vez de escrita dos veces.
 */
export function capabilitiesFor(mode: AccessMode = modo): AgentCapabilities {
  return mode === "write"
    ? { write: true, execute: true }
    : { write: false, execute: false };
}
