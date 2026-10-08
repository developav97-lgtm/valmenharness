/** Selección pura de trabajo de una jornada; no reserva ni inicia ejecuciones. */
import { type ParsedTicket } from "@valmen/core";

import { razonesDePolitica } from "./autonomous-run.js";
import { autonomousConfig } from "./discovery.js";
import { dependenciasEnGrafos } from "./materialize.js";
import { readJourneyAuthorization } from "./journey-authorization.js";
import { evaluateJourneyWindow } from "./journey-windows.js";
import { readJourneys, type JourneyTicketInput } from "./journeys.js";
import { allDocuments } from "./mutate.js";
import { type AuthorizedProject } from "./project-resolution.js";

export const JOURNEY_SELECTION_REASONS = [
  "dependency",
  "eligibility",
  "plan",
  "gate",
  "qa",
  "window",
  "authorization",
  "resource",
  "completed",
  "missing-ticket",
] as const;

export type JourneySelectionReason = (typeof JOURNEY_SELECTION_REASONS)[number];

export interface JourneySelectionRequest {
  readonly project: AuthorizedProject;
  readonly journeyId: string;
  readonly at: string;
  /** Ausente significa que se consulta solo la alternativa manual. */
  readonly executor?: string | undefined;
  /** Disponibilidad ya medida por el futuro gestor de capacidad. */
  readonly availableSlots: number;
}

export interface JourneySelectionCandidate {
  readonly ticketId: string;
  readonly priority: number;
  readonly order: number;
}

export interface JourneySelectionBlocked extends JourneySelectionCandidate {
  readonly reasons: readonly JourneySelectionReason[];
}

export interface JourneySelection {
  readonly projectId: string;
  readonly journeyId: string;
  readonly at: string;
  /** El siguiente ticket que una persona puede ejecutar sin un despachador. */
  readonly manualCandidate: JourneySelectionCandidate | null;
  /** El siguiente ticket que un despachador autorizado podría iniciar. */
  readonly dispatchCandidate: JourneySelectionCandidate | null;
  readonly blocked: readonly JourneySelectionBlocked[];
}

/**
 * Contrasta una foto de jornada con el workflow verificable de sus tickets.
 * No interpreta actividad ni tarjetas externas: el estado del registro manda.
 */
export function selectJourneyTickets(request: JourneySelectionRequest): JourneySelection {
  assertInstant(request.at);
  if (!Number.isSafeInteger(request.availableSlots) || request.availableSlots < 0) {
    throw new Error("availableSlots debe ser un entero no negativo.");
  }
  if (request.executor !== undefined && request.executor.trim() === "") {
    throw new Error("executor no puede ser vacío.");
  }

  const journey = readJourneys(request.project).find((item) => item.journeyId === request.journeyId);
  if (journey === undefined) {
    throw new Error(`La jornada "${request.journeyId}" no existe en el proyecto autorizado.`);
  }

  const tickets = new Map(
    allDocuments(request.project.paths).map(({ ticket, document }) => [ticket.id, document]),
  );
  const authorization = readJourneyAuthorization(request.project);
  const policy = autonomousConfig(request.project.root);
  const ready: JourneySelectionCandidate[] = [];
  const blocked: JourneySelectionBlocked[] = [];

  for (const ticket of [...journey.tickets].sort(compareTicket)) {
    const document = tickets.get(ticket.ticketId);
    const reasons = baseReasons(ticket, document, tickets, journey.windows ?? [], request.at, request.project.paths);
    const candidate = candidateOf(ticket);
    if (reasons.length > 0) {
      blocked.push(Object.freeze({ ...candidate, reasons: Object.freeze(reasons) }));
      continue;
    }
    ready.push(candidate);
  }

  const manualCandidate = ready[0] ?? null;
  let dispatchCandidate: JourneySelectionCandidate | null = null;
  for (const candidate of ready) {
    const ticket = journey.tickets.find((item) => item.ticketId === candidate.ticketId);
    if (ticket === undefined) continue;
    const document = tickets.get(candidate.ticketId);
    const reasons = dispatchReasons(ticket, authorization, request.executor, request.availableSlots);
    // La política de autonomía solo limita al despachador (y solo si está encendida): una persona
    // puede ejecutar el ticket aunque su tipo, riesgo o módulo no estén habilitados.
    if (policy.enabled && document !== undefined && razonesDePolitica(document.fields, policy).length > 0) {
      reasons.unshift("eligibility");
    }
    if (reasons.length === 0) {
      dispatchCandidate = candidate;
      break;
    }
    blocked.push(Object.freeze({ ...candidate, reasons: Object.freeze(reasons) }));
  }

  return Object.freeze({
    projectId: request.project.projectId,
    journeyId: journey.journeyId,
    at: request.at,
    manualCandidate,
    dispatchCandidate,
    blocked: Object.freeze(blocked),
  });
}

export function compareTicket(left: JourneyTicketInput, right: JourneyTicketInput): number {
  return left.priority - right.priority || left.order - right.order;
}

function candidateOf(ticket: JourneyTicketInput): JourneySelectionCandidate {
  return Object.freeze({ ticketId: ticket.ticketId, priority: ticket.priority, order: ticket.order });
}

function baseReasons(
  ticket: JourneyTicketInput,
  document: ParsedTicket | undefined,
  tickets: ReadonlyMap<string, ParsedTicket>,
  windows: readonly { readonly windowId: string; readonly startsAt: string; readonly endsAt: string; readonly timeZone: string }[],
  at: string,
  paths: AuthorizedProject["paths"],
): JourneySelectionReason[] {
  if (document === undefined) return ["missing-ticket"];

  const reasons: JourneySelectionReason[] = [];
  const workflow = workflowReason(document.fields.workflow_status);
  if (workflow !== null) reasons.push(workflow);
  // Una dependencia bloquea esté o no en la jornada: se suman las del grafo de la feature, que
  // armar la jornada descarta cuando no van en ella. Un ticket ausente del registro no está cerrado.
  const dependencies = new Set([...ticket.dependsOn, ...dependenciasEnGrafos(paths, ticket.ticketId)]);
  if ([...dependencies].some((dependency) => tickets.get(dependency)?.fields.workflow_status !== "closed")) {
    reasons.push("dependency");
  }

  reasons.push(...razonesDeVentana(ticket, windows, at));
  return reasons;
}

/**
 * La regla de ventana de un ticket: `["window"]` si exige una ventana que no declara, o si la que
 * declara no existe o no permite despachar ahora; vacío si no hay nada que objetar.
 */
export function razonesDeVentana(
  ticket: JourneyTicketInput,
  windows: readonly { readonly windowId: string; readonly startsAt: string; readonly endsAt: string; readonly timeZone: string }[],
  at: string,
): JourneySelectionReason[] {
  const requiresWindow =
    ticket.start.condition === "window" || ticket.start.condition === "dependencies-and-window";
  if (requiresWindow && ticket.windowId === undefined) return ["window"];
  if (ticket.windowId !== undefined) {
    const window = windows.find((item) => item.windowId === ticket.windowId);
    if (window === undefined || !evaluateJourneyWindow(window, at).allowsNewDispatch) return ["window"];
  }
  return [];
}

function workflowReason(workflow: string): JourneySelectionReason | null {
  if (workflow === "approved") return null;
  if (workflow === "intake" || workflow === "analyzed" || workflow === "planned") return "plan";
  if (workflow === "awaiting_user_tests" || workflow === "in_qa" || workflow === "qa_approved" || workflow === "changes_requested") return "qa";
  if (workflow === "closed") return "completed";
  return "gate";
}

function dispatchReasons(
  ticket: JourneyTicketInput,
  authorization: ReturnType<typeof readJourneyAuthorization>,
  executor: string | undefined,
  availableSlots: number,
): JourneySelectionReason[] {
  const reasons: JourneySelectionReason[] = [];
  if (
    executor === undefined ||
    !authorization.canDispatch(executor) ||
    !ticket.authorizationIds.includes(executor)
  ) {
    reasons.push("authorization");
  }
  if (availableSlots < 1) reasons.push("resource");
  return reasons;
}

function assertInstant(value: string): void {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new Error("at debe ser un instante ISO 8601 canónico.");
  }
}
