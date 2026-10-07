/**
 * La comprobación de un cierre de QA por política contra el registro (R-QAAG-006).
 *
 * El validador del ticket solo ve la forma de `policy:<autorización>:<hash>|recibo:<ruta:línea>`; esta
 * comprobación mira el registro: que la autorización exista con ese hash y que el recibo citado exista,
 * sea de este ticket y esté aprobado. Una confirmación escrita a mano que cite algo inexistente no
 * pasa a `qa_approved`.
 */
import { type ParsedTicket, parsePolicyConfirmation } from "@valmen/core";

import { leerAutorizaciones } from "./qa-authorization.js";
import { reciboEnLinea } from "./qa-agent-receipt.js";

/** Comprueba una confirmación por política contra el registro. */
function motivoDeConfirmacion(root: string, ticketId: string, confirmacion: NonNullable<ReturnType<typeof parsePolicyConfirmation>>): string | null {
  const autorizacion = leerAutorizaciones(root).find((a) => a.id === confirmacion.authorizationId);
  if (autorizacion === undefined || autorizacion.hash !== confirmacion.authorizationHash) {
    return `el cierre por política cita la autorización ${confirmacion.authorizationId}, que no existe con ese hash en el registro`;
  }
  const linea = /:(\d+)$/.exec(confirmacion.receipt)?.[1];
  const recibo = linea === undefined ? null : reciboEnLinea(root, Number(linea));
  if (recibo === null || recibo.ticketId !== ticketId || recibo.verdict !== "approve") {
    return `el cierre por política cita el recibo ${confirmacion.receipt}, que no existe, no es de ${ticketId} o no está aprobado`;
  }
  if (recibo.authorization === null || recibo.authorization.id !== confirmacion.authorizationId || recibo.authorization.hash !== confirmacion.authorizationHash) {
    return "el recibo citado no corresponde a la autorización del cierre";
  }
  return null;
}

/** Por qué el resultado por política de `## Pruebas` no es creíble, o `null` si no hay o es creíble. */
export function motivoDePruebasPorPoliticaInvalido(root: string, ticketId: string, documento: ParsedTicket): string | null {
  for (const linea of (documento.sections.Pruebas ?? "").split("\n")) {
    const m = /^\s*(?:[-*]\s*)?resultado por pol[ií]tica\s*:\s*(\S+)\s*$/i.exec(linea);
    const confirmacion = m === null ? null : parsePolicyConfirmation(m[1]);
    if (confirmacion !== null) return motivoDeConfirmacion(root, ticketId, confirmacion);
  }
  return null;
}

/** Por qué el cierre por política no es creíble, o `null` si lo es (o si el ticket no cerró por política). */
export function motivoDeCierrePorPoliticaInvalido(root: string, ticketId: string, documento: ParsedTicket): string | null {
  const qa = documento.blocks.QA ?? [];
  const fin = qa[qa.length - 1];
  const confirmacion = fin === undefined ? null : parsePolicyConfirmation(fin["po_confirmation"] as string | null);
  if (confirmacion === null) return null;
  return motivoDeConfirmacion(root, ticketId, confirmacion);
}
