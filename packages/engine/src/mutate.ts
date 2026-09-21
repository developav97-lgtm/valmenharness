/**
 * Mutaciones del registro: el único camino por el que un ticket cambia.
 *
 * El orden de `finalizeMutation` es la garantía entera, y está transcrito de la
 * implementación de referencia (`ticket.py` L1220-1236) porque cada paso evita
 * una forma distinta de corromper el registro:
 *
 * ```
 * 1. allDocuments        valida TODOS los tickets antes de escribir nada
 * 2. anexa el evento     la historia crece en uno, nunca se reescribe
 * 3. updated = hoy
 * 4. revalida el texto   el estado nuevo se valida ANTES de tocar el disco
 * 5. atomicWrite         el archivo cambia entero o no cambia
 * 6. refreshIndex        el índice derivado se regenera
 * ```
 *
 * Los pasos 1 y 4 son los que hacen que un registro roto no empeore: sin el 1,
 * una mutación podría escribir un ticket válido en una colección inválida y
 * dejar el índice sin poder generarse; sin el 4, el comando podría producir un
 * estado que el propio validador rechaza.
 *
 * Lo que **no** se garantiza, y conviene saberlo: si el paso 6 falla, el ticket
 * ya quedó escrito y el índice desactualizado. No hay rollback, y no lo hay a
 * propósito: deshacer una escritura ya confirmada es más peligroso que un índice
 * desactualizado, que se regenera con un comando.
 */
import {
  type JsonObject,
  type ParsedTicket,
  SCHEMA_VERSION,
  atomicWrite,
  fail,
  newEvent,
  parseTicket,
  replaceBlock,
  replaceFrontmatterField,
  today,
  validateDocument,
} from "@valmen/core";

import { type LocatedTicket, type RegistryPaths, findAllTickets, indexPath } from "./discovery.js";
import { renderIndex } from "./index-file.js";

/** Un ticket del registro, ya leído y validado. */
export interface RegistryDocument {
  readonly ticket: LocatedTicket;
  readonly document: ParsedTicket;
}

/**
 * Lee y valida **todos** los tickets del registro.
 *
 * Falla en el primero que no valide, con su error. Es lo que impide que una
 * mutación deje el registro en un estado del que no se pueda regenerar el
 * índice: si un ticket hermano está roto, no se escribe nada.
 */
export function allDocuments(paths: RegistryPaths): RegistryDocument[] {
  return findAllTickets(paths).map((ticket) => ({
    ticket,
    document: readAndValidate(paths, ticket),
  }));
}

/** Parsea y valida un ticket ya localizado. */
export function readAndValidate(
  paths: RegistryPaths,
  ticket: LocatedTicket,
): ParsedTicket {
  const document = parseTicket(ticket.text);
  validateDocument(document, {
    expectedId: ticket.id,
    ticketExists: (id) => findTicketSilently(paths, id),
  });
  return document;
}

/**
 * Comprueba si un ticket referenciado existe.
 *
 * Una referencia a un ticket inexistente es un error de esquema, así que la
 * comprobación no puede lanzar: devuelve un booleano.
 */
function findTicketSilently(paths: RegistryPaths, id: string): boolean {
  try {
    return findAllTickets(paths).some((ticket) => ticket.id === id);
  } catch {
    return false;
  }
}

/**
 * Quién figura como autor de un evento.
 *
 * La referencia escribe siempre `cli` (L1215). El harness conserva el valor
 * porque es parte del formato del bloque: cambiarlo reescribiría los recibos de
 * todo el historial. Distinguir persona de agente necesita un campo nuevo, no
 * otro valor en este.
 */
export const ACTOR = "cli";

/** Contexto de una mutación. */
export interface MutationRequest {
  readonly paths: RegistryPaths;
  /** El ticket tal como está en disco, ya validado. */
  readonly located: LocatedTicket;
  /** El documento actual, para leer los bloques que se van a anexar. */
  readonly document: ParsedTicket;
  /**
   * El texto nuevo, con los cambios del comando ya aplicados **salvo** el evento
   * y la fecha, que los pone `finalizeMutation`.
   */
  readonly text: string;
  /** Acción del evento, en el vocabulario del contrato. */
  readonly action: string;
  readonly details: string;
  readonly now?: () => Date;
}

/** Lo que devuelve una mutación: el documento nuevo y su ruta. */
export interface MutationResult {
  readonly text: string;
  readonly document: ParsedTicket;
  readonly date: string;
}

/**
 * Cierra una mutación: anexa el evento, revalida y escribe.
 *
 * Devuelve el documento nuevo para que el comando pueda informar de lo que
 * quedó, en vez de reconstruirlo por su cuenta.
 */
export function finalizeMutation(request: MutationRequest): MutationResult {
  const { paths, located, document, text, action, details } = request;
  const date = today(request.now?.() ?? new Date());

  // 1. El registro entero tiene que estar sano antes de escribir nada.
  allDocuments(paths);

  // 2. El evento se anexa al final. `newEvent` numera por longitud, así que el
  //    identificador es el siguiente de la serie sin tener que buscarlo.
  const eventos = [...(document.blocks.Eventos ?? [])] as JsonObject[];
  eventos.push(newEvent(eventos, action, details, ACTOR, date));

  // 3 y 4. El bloque y la fecha, y la revalidación completa del resultado.
  let nuevo = replaceBlock(text, "Eventos", eventos);
  nuevo = replaceFrontmatterField(nuevo, "updated", date);

  const nuevoDocumento = parseTicket(nuevo);
  validateDocument(nuevoDocumento, {
    expectedId: located.id,
    ticketExists: (id) => findTicketSilently(paths, id),
  });

  // 5. Escritura atómica: el archivo cambia entero o no cambia.
  atomicWrite(located.absolutePath, nuevo);

  // 6. El índice derivado. Si esto falla, el ticket ya está escrito: es el único
  //    punto de la secuencia sin vuelta atrás, y se dice en la documentación.
  refreshIndex(paths);

  return { text: nuevo, document: nuevoDocumento, date };
}

/**
 * Regenera el índice a partir del registro.
 *
 * Revalida todos los tickets: un índice construido sobre un ticket inválido
 * anunciaría un estado que no existe.
 */
export function refreshIndex(paths: RegistryPaths): void {
  const tickets = findAllTickets(paths).map((ticket) => {
    readAndValidate(paths, ticket);
    return ticket;
  });
  atomicWrite(indexPath(paths), renderIndex(paths, tickets));
}

/** La versión del esquema con la que se escriben los tickets nuevos. */
export const WRITE_SCHEMA_VERSION = SCHEMA_VERSION;

/** Falla con un mensaje del contrato, para no repetir el import en cada comando. */
export { fail };
