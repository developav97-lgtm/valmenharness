/**
 * El lector del estado público de un ticket (R-EPU-001).
 *
 * Solo reúne del registro los dos hechos que `estadoPublico` recibe; la decisión es de la
 * función de `@valmen/core`.
 */
import { type PublicStateResult, estadoPublico, parseTicket } from "@valmen/core";
import type { GateReceipt } from "@valmen/gate";

import { elegibilidadDeAprobacion } from "./approval-eligibility.js";
import { type RegistryPaths, findTicket } from "./discovery.js";
import { currentReceipts, readReceipts } from "./receipts.js";

/** El último recibo de cada compuerta: `currentReceipts` va del más nuevo al más viejo. */
function ultimoPorCompuerta(recibos: readonly GateReceipt[]): GateReceipt[] {
  const porCompuerta = new Map<string, GateReceipt>();
  for (const recibo of recibos) {
    if (!porCompuerta.has(recibo.gate)) porCompuerta.set(recibo.gate, recibo);
  }
  return [...porCompuerta.values()];
}

/** Deriva el estado público de un ticket del registro. */
export function estadoPublicoDelTicket(
  paths: RegistryPaths,
  ticketId: string,
  ahora?: Date,
): PublicStateResult {
  const ubicado = findTicket(paths, ticketId);
  if (ubicado === undefined) throw new Error(`No existe el ticket ${ticketId}.`);
  const state = parseTicket(ubicado.text).fields.workflow_status;
  const ultimos = ultimoPorCompuerta(currentReceipts(readReceipts(paths, ticketId)));
  const escalatedGatePending = ultimos.some(
    (r) => r.escalatedTo === "human" && r.humanDecision === null,
  );
  const planWaitsForPerson =
    state === "planned" &&
    !elegibilidadDeAprobacion({
      paths,
      ticketId,
      etapa: "plan",
      ...(ahora === undefined ? {} : { ahora }),
    }).elegible;
  return estadoPublico({ state, planWaitsForPerson, escalatedGatePending });
}
