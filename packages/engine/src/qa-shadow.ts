/**
 * El periodo en sombra de la QA por agente (R-QAAG-008).
 *
 * En sombra `qa-agent` corre y deja su veredicto en el recibo sin cerrar nada; el responsable sigue
 * aprobando. Este módulo compara cada veredicto con lo que el responsable decidió y solo deja
 * promover la política a cerrar tickets tras 20 tickets con concordancia del 100 %. La promoción la
 * registra una persona y queda con su evidencia; volver a sombra es un cambio de configuración.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { parseConfig, readQaAgentConfig } from "@valmen/adapter";
import { EXIT_INVARIANT, EXIT_SCHEMA, fail, parsePolicyConfirmation, parseTicket } from "@valmen/core";

import { type RegistryPaths, findTicket } from "./discovery.js";
import { assertSesionAtendida } from "./plan-approval.js";
import { leerRecibosQaAgent } from "./qa-agent-receipt.js";

/** Cuántos tickets en sombra con concordancia total hacen falta para promover. */
export const TICKETS_PARA_PROMOVER = 20;

export interface ComparacionEnSombra {
  readonly ticketId: string;
  readonly agente: "approve" | "block";
  readonly responsable: "approved" | "changes_requested";
  readonly concordante: boolean;
  readonly recibo: string;
}

export interface ConcordanciaEnSombra {
  readonly comparaciones: readonly ComparacionEnSombra[];
  readonly discordantes: readonly ComparacionEnSombra[];
}

/** Compara, por ticket, el último recibo de qa-agent con la última decisión de una persona. */
export function concordanciaEnSombra(paths: RegistryPaths): ConcordanciaEnSombra {
  const ultimoPorTicket = new Map<string, ReturnType<typeof leerRecibosQaAgent>[number]>();
  for (const r of leerRecibosQaAgent(paths.root)) ultimoPorTicket.set(r.ticketId, r);
  const comparaciones: ComparacionEnSombra[] = [];
  for (const [ticketId, recibo] of ultimoPorTicket) {
    const ubicado = findTicket(paths, ticketId);
    if (ubicado === undefined) continue;
    const qa = parseTicket(ubicado.text).blocks.QA ?? [];
    // La última decisión de una persona: un ciclo cerrado cuya confirmación no es «por política».
    let decision: "approved" | "changes_requested" | null = null;
    for (let i = 1; i < qa.length; i += 2) {
      const fin = qa[i];
      if (fin === undefined) continue;
      if (parsePolicyConfirmation(fin["po_confirmation"] as string | null) !== null) continue;
      if (fin["result"] === "approved") decision = "approved";
      else if (fin["result"] === "changes_requested" || fin["result"] === "failed") decision = "changes_requested";
    }
    if (decision === null) continue;
    const agente = recibo.verdict;
    comparaciones.push({
      ticketId,
      agente,
      responsable: decision,
      concordante: (agente === "approve") === (decision === "approved"),
      recibo: `${recibo.delivered.slice(0, 12)}@${recibo.at}`,
    });
  }
  return { comparaciones, discordantes: comparaciones.filter((c) => !c.concordante) };
}

export interface PromocionDeQaAgent {
  readonly kind: "qa-agent-promotion";
  readonly actor: string;
  readonly quote: string;
  readonly at: string;
  readonly evidence: { readonly total: number; readonly tickets: readonly string[] };
}

export function qaPromotionsPath(root: string): string {
  return join(root, ".valmen", "qa", "promotions.jsonl");
}

/** Las promociones registradas, de la más antigua a la más reciente. */
export function leerPromociones(root: string): PromocionDeQaAgent[] {
  const ruta = qaPromotionsPath(root);
  if (!existsSync(ruta)) return [];
  const lista: PromocionDeQaAgent[] = [];
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    if (linea.trim() === "") continue;
    try {
      const v = JSON.parse(linea) as PromocionDeQaAgent;
      if (v.kind === "qa-agent-promotion") lista.push(v);
    } catch {
      // Un renglón truncado no borra los anteriores.
    }
  }
  return lista;
}

/**
 * Promueve la política a cerrar tickets. La decide una persona: sesión atendida, con su nombre y su
 * frase. Se rechaza con el motivo exacto si faltan tickets o hay una discrepancia.
 */
export function promoverQaAgent(request: {
  readonly paths: RegistryPaths;
  readonly actor: string;
  readonly quote: string;
  readonly ahora?: Date;
  readonly env?: Readonly<Record<string, string | undefined>>;
}): PromocionDeQaAgent {
  assertSesionAtendida("promover la QA por agente a cerrar tickets", request.env ?? process.env);
  if (request.actor.trim() === "") fail("Promover necesita un responsable: falta --actor.", EXIT_SCHEMA);
  if (request.quote.trim() === "") fail("Promover necesita la frase literal de quien decide: falta --quote.", EXIT_SCHEMA);
  const { comparaciones, discordantes } = concordanciaEnSombra(request.paths);
  if (discordantes.length > 0) {
    fail(
      `No se puede promover: ${discordantes.length} ticket(s) discordante(s): ` +
        discordantes.map((d) => `${d.ticketId} (agente ${d.agente}, responsable ${d.responsable})`).join("; ") + ".",
      EXIT_INVARIANT,
    );
  }
  if (comparaciones.length < TICKETS_PARA_PROMOVER) {
    fail(
      `No se puede promover: hay ${comparaciones.length} ticket(s) comparados y hacen falta ${TICKETS_PARA_PROMOVER} ` +
        `(faltan ${TICKETS_PARA_PROMOVER - comparaciones.length}).`,
      EXIT_INVARIANT,
    );
  }
  const promocion: PromocionDeQaAgent = {
    kind: "qa-agent-promotion",
    actor: request.actor.trim(),
    quote: request.quote.trim(),
    at: (request.ahora ?? new Date()).toISOString(),
    evidence: { total: comparaciones.length, tickets: comparaciones.map((c) => c.ticketId) },
  };
  const ruta = qaPromotionsPath(request.paths.root);
  mkdirSync(dirname(ruta), { recursive: true });
  appendFileSync(ruta, `${JSON.stringify(promocion)}\n`, "utf8");
  return promocion;
}

export interface ModoEfectivo {
  readonly modo: "shadow" | "close";
  /** Por qué sigue en sombra, o `null` si puede cerrar. */
  readonly motivo: string | null;
}

/** `close` solo si la configuración lo declara **y** hay una promoción registrada. */
export function modoEfectivoDeQaAgent(paths: RegistryPaths): ModoEfectivo {
  let declarado: "shadow" | "close" = "shadow";
  try {
    declarado = readQaAgentConfig(parseConfig(readFileSync(join(paths.root, ".valmen", "config.yaml"), "utf8"))).mode;
  } catch {
    declarado = "shadow";
  }
  const promovida = leerPromociones(paths.root).length > 0;
  if (declarado === "close" && promovida) return { modo: "close", motivo: null };
  const faltas = [declarado !== "close" ? "qa-agent.mode no es close" : null, !promovida ? "no hay una promoción registrada" : null].filter((x) => x !== null);
  return { modo: "shadow", motivo: faltas.join(" y ") };
}
