/**
 * El lector del estado público de un ticket (R-EPU-001).
 *
 * Solo reúne del registro los dos hechos que `estadoPublico` recibe; la decisión es de la
 * función de `@valmen/core`.
 */
import {
  type JsonObject,
  type PublicStateResult,
  estadoPublico,
  parseTicket,
} from "@valmen/core";
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

/** `Workflow: in_progress -> blocked.` → `blocked`. */
const TRANSICION_RE = /^Workflow: [a-z_]+ -> ([a-z_]+)\.$/;

/**
 * El id del último evento de transición cuyo destino es `estado`, o `null` si no hay ninguno.
 *
 * Es la identidad de una entrada al estado (R-EPU-003): un ticket que sale y vuelve a entrar
 * deja otro evento, y por eso es otro aviso.
 */
export function entradaAlEstado(
  eventos: readonly JsonObject[],
  estado: string,
): string | null {
  let entrada: string | null = null;
  for (const evento of eventos) {
    if (evento["action"] !== "ticket-transition") continue;
    const details = typeof evento["details"] === "string" ? evento["details"] : "";
    const match = TRANSICION_RE.exec(details);
    if (match?.[1] === estado && typeof evento["id"] === "string") entrada = evento["id"];
  }
  return entrada;
}
