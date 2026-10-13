/**
 * Las decisiones que toma el agente y su ratificación por una persona antes de cerrar.
 *
 * Pedido del PO del 2026-10-13: lo que el agente puede validar con la documentación del proyecto,
 * el código o su propia recomendación lo decide y sigue, en vez de detener el ticket esperando una
 * respuesta; deja escrito qué decidió, por qué y cómo se revierte. Antes de cerrar, la persona lo
 * revisa en lote y lo ratifica con sus palabras —o pide el cambio—. Lo que no se puede deshacer, o
 * lo que el agente no tiene cómo validar, se sigue preguntando antes.
 *
 * Todo vive en el bloque append-only de eventos: `agent-decision` por decisión y
 * `agent-decisions-ratified` por ratificación. Entran a la ratificación también las aprobaciones
 * de análisis y plan que respaldó la política por defecto, porque nadie las miró al darlas.
 */
import { EXIT_INVARIANT, EXIT_SCHEMA, type ParsedTicket, fail } from "@valmen/core";

import { POLITICA_POR_DEFECTO_ID } from "./approval-authorization.js";
import { type RegistryPaths, findTicket } from "./discovery.js";
import { appendEvent, readAndValidate } from "./mutate.js";
import { assertSesionAtendida } from "./plan-approval.js";

export const AGENT_DECISION_ACTION = "agent-decision";
export const AGENT_DECISIONS_RATIFIED_ACTION = "agent-decisions-ratified";

const ACCIONES_DE_APROBACION = new Set(["plan-approved", "analysis-approved"]);

export interface DecisionDelAgente {
  readonly pregunta: string;
  readonly eleccion: string;
  readonly alternativas: readonly string[];
  /** Por qué esa opción: la regla, el dato o la recomendación que la sostiene. */
  readonly criterio: string;
  /** De dónde sale: `ruta:línea` de la documentación o del código, o «recomendación del agente». */
  readonly fuente: string;
  /** Cómo se deshace si la persona no la ratifica. */
  readonly reversion: string;
}

export interface RegistrarDecisionRequest extends DecisionDelAgente {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly now?: () => Date;
}

/** Algo que la persona tiene que ratificar antes de cerrar. */
export interface PorRatificar {
  readonly evento: string;
  readonly tipo: "decision" | "aprobacion";
  readonly resumen: string;
}

type Evento = Record<string, unknown>;

function eventosDe(documento: ParsedTicket): Evento[] {
  return (documento.blocks.Eventos ?? []) as unknown as Evento[];
}

function detalles(evento: Evento): Record<string, unknown> {
  try {
    const d = JSON.parse(String(evento["details"] ?? "")) as unknown;
    return typeof d === "object" && d !== null ? (d as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function ubicar(paths: RegistryPaths, ticketId: string): ParsedTicket {
  const ubicado = findTicket(paths, ticketId);
  if (ubicado === undefined) fail(`No existe el ticket ${ticketId}.`, EXIT_SCHEMA);
  return readAndValidate(paths, ubicado);
}

/** Anexa una decisión del agente al ticket y devuelve su número (D-001, D-002…). */
export function registrarDecisionDelAgente(request: RegistrarDecisionRequest): { id: string } {
  const campos: [keyof DecisionDelAgente, string][] = [
    ["pregunta", request.pregunta],
    ["eleccion", request.eleccion],
    ["criterio", request.criterio],
    ["fuente", request.fuente],
    ["reversion", request.reversion],
  ];
  const vacios = campos.filter(([, valor]) => valor.trim() === "").map(([campo]) => campo);
  if (vacios.length > 0) {
    fail(
      `Una decisión del agente necesita ${vacios.join(", ")}: sin eso la persona no puede ratificarla.`,
      EXIT_SCHEMA,
    );
  }
  const documento = ubicar(request.paths, request.ticketId);
  const previas = eventosDe(documento).filter((e) => e["action"] === AGENT_DECISION_ACTION);
  const id = `D-${String(previas.length + 1).padStart(3, "0")}`;
  const decision = {
    id,
    pregunta: request.pregunta.trim(),
    eleccion: request.eleccion.trim(),
    alternativas: request.alternativas.map((a) => a.trim()).filter((a) => a !== ""),
    criterio: request.criterio.trim(),
    fuente: request.fuente.trim(),
    reversion: request.reversion.trim(),
  };
  appendEvent(
    request.paths,
    request.ticketId,
    AGENT_DECISION_ACTION,
    JSON.stringify(decision),
    request.now,
  );
  return { id };
}

/** `true` si la aprobación la respaldó la política por defecto, directa o por el revisor. */
function esDeLaPolitica(evento: Evento): boolean {
  if (!ACCIONES_DE_APROBACION.has(String(evento["action"]))) return false;
  return detalles(evento)["authorizationId"] === POLITICA_POR_DEFECTO_ID;
}

/** Lo que el agente decidió o aprobó después de la última ratificación. */
export function decisionesPorRatificar(documento: ParsedTicket): PorRatificar[] {
  const eventos = eventosDe(documento);
  let desde = 0;
  eventos.forEach((e, i) => {
    if (e["action"] === AGENT_DECISIONS_RATIFIED_ACTION) desde = i + 1;
  });
  const pendientes: PorRatificar[] = [];
  for (const e of eventos.slice(desde)) {
    const id = String(e["id"] ?? "");
    if (e["action"] === AGENT_DECISION_ACTION) {
      const d = detalles(e);
      pendientes.push({
        evento: id,
        tipo: "decision",
        resumen: `${String(d["id"])}: ${String(d["pregunta"])} → ${String(d["eleccion"])} (${String(d["criterio"])}; fuente: ${String(d["fuente"])})`,
      });
    } else if (esDeLaPolitica(e)) {
      const etapa = e["action"] === "plan-approved" ? "el plan" : "el análisis";
      const d = detalles(e);
      const quien = d["source"] === "revisor" ? "el revisor" : "la política por defecto";
      pendientes.push({
        evento: id,
        tipo: "aprobacion",
        resumen: `${id}: ${quien} aprobó ${etapa} (recibo ${String(d["receiptId"] ?? "sin recibo")})`,
      });
    }
  }
  return pendientes;
}

/** El mensaje con el que se rechaza un cierre que tiene decisiones del agente sin ratificar. */
export function mensajeDeRatificacionPendiente(
  ticketId: string,
  pendientes: readonly PorRatificar[],
): string {
  return (
    `closed requiere que una persona ratifique lo que decidió el agente (${pendientes.length}):\n` +
    pendientes.map((p) => `  - ${p.resumen}`).join("\n") +
    `\nSe ratifica con \`valmen ratify --id ${ticketId} --actor <tú> --quote "<tus palabras>"\`; ` +
    "si alguna no te parece, pide el cambio y el ticket vuelve a changes_requested."
  );
}

export interface RatificarRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly actor: string;
  readonly quote: string;
  readonly source: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly now?: () => Date;
}

/** Registra que una persona ratificó, con sus palabras, todo lo pendiente del agente. */
export function ratificarDecisiones(request: RatificarRequest): { ratificadas: string[] } {
  assertSesionAtendida("ratificar las decisiones del agente", request.env ?? process.env);
  if (request.actor.trim() === "")
    fail("Ratificar necesita a la persona que ratifica: falta --actor.", EXIT_SCHEMA);
  if (request.quote.trim() === "")
    fail("Ratificar necesita las palabras de la persona: falta --quote.", EXIT_SCHEMA);
  const documento = ubicar(request.paths, request.ticketId);
  const pendientes = decisionesPorRatificar(documento);
  if (pendientes.length === 0) {
    fail(`El ticket ${request.ticketId} no tiene nada por ratificar.`, EXIT_INVARIANT);
  }
  const ratificadas = pendientes.map((p) =>
    p.tipo === "decision" ? (p.resumen.split(":")[0] ?? p.evento) : p.evento,
  );
  appendEvent(
    request.paths,
    request.ticketId,
    AGENT_DECISIONS_RATIFIED_ACTION,
    JSON.stringify({
      actor: request.actor.trim(),
      quote: request.quote.trim(),
      source: request.source,
      ratifica: ratificadas,
    }),
    request.now,
  );
  return { ratificadas };
}
