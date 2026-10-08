/** Proyección de solo lectura de una jornada para CLI, MCP y Mission Control. */
import { type ExecutionIdentity } from "@valmen/core";
import { readExecutionEvents, type ExecutionEvent } from "./execution-events.js";
import { readJourneyAuthorization, type JourneyAuthorization } from "./journey-authorization.js";
import { readJourneys, type Journey, type JourneyTicketInput } from "./journeys.js";
import { evaluateJourneyWindow, type JourneyWindowStatus } from "./journey-windows.js";
import { type AuthorizedProject } from "./project-resolution.js";
import { readExecutionStatus, type ExecutionStatus } from "./execution-status.js";
import { type ExecutionActivity } from "./execution-activity.js";
import { paradasActivas, type AutonomousStopReceipt } from "./autonomous-stops.js";
import { findTicket } from "./discovery.js";
import { leerPasadas, resumenDePasadas, type RegistroDePasada } from "./journey-passes.js";
import { parseTicket } from "@valmen/core";

/** En qué punto del recorrido de la jornada está un ticket. */
export type FaseDeJornada = "waiting" | "preparing" | "plan-ready" | "implementing" | "verifying" | "delivered" | "stopped";

export interface JourneyRoadmapTicket {
  readonly ticketId: string;
  readonly order: number;
  readonly priority: number;
  readonly condition: JourneyTicketInput["start"]["condition"];
  readonly scheduledAt: string | null;
  readonly actualAt: string | null;
  readonly durationMs: number | null;
  readonly dependsOn: readonly string[];
  readonly waitingFor: readonly string[];
  readonly activity: ExecutionStatus["liveness"];
  readonly phase: FaseDeJornada;
  readonly stopReason: string | null;
  readonly lastReceivedAt: string | null;
  readonly window: { readonly windowId: string; readonly status: JourneyWindowStatus } | null;
  readonly authorizationIds: readonly string[];
}

export interface JourneyRoadmap {
  readonly projectId: string;
  readonly authorization: Pick<JourneyAuthorization, "observationSources" | "dispatchExecutors">;
  readonly journeys: readonly {
    readonly journeyId: string;
    readonly revisionId: string;
    readonly occurredAt: string;
    readonly receivedAt: string;
    readonly cursor: number;
    readonly passes: {
      readonly last: RegistroDePasada | null;
      readonly cadenceMs: number | null;
      readonly next: string | null;
    };
    readonly tickets: readonly JourneyRoadmapTicket[];
  }[];
}

/** Reúne hechos persistidos; no concede permisos ni cambia el estado de trabajo. */
export function readJourneyRoadmap(
  project: AuthorizedProject,
  options: { readonly at?: string | undefined } = {},
): JourneyRoadmap {
  const at = options.at ?? new Date().toISOString();
  const authorization = readJourneyAuthorization(project);
  // Los eventos de una jornada comparten `executionId`, así que el replay los agrupa bajo la
  // identidad del primer ticket: se busca la identidad más reciente de cada ticket en el log.
  const identities = latestIdentityByTicket(readExecutionEvents(project));
  const paradas = paradasActivas(project.paths);
  const pasadas = leerPasadas(project.root);
  return Object.freeze({
    projectId: project.projectId,
    authorization: Object.freeze({
      observationSources: authorization.observationSources,
      dispatchExecutors: authorization.dispatchExecutors,
    }),
    journeys: Object.freeze(readJourneys(project).map((journey) => Object.freeze({
      journeyId: journey.journeyId,
      revisionId: journey.revisionId,
      occurredAt: journey.occurredAt,
      receivedAt: journey.receivedAt,
      cursor: journey.cursor,
      passes: passesDe(pasadas, journey.journeyId),
      tickets: Object.freeze([...journey.tickets]
        .sort((left, right) => left.order - right.order)
        .map((ticket) => projectTicket(project, journey, ticket, identities, paradas, at))),
    }))),
  });
}

function projectTicket(
  project: AuthorizedProject,
  journey: Journey,
  ticket: JourneyTicketInput,
  identities: ReadonlyMap<string, ExecutionIdentity>,
  paradas: readonly AutonomousStopReceipt[],
  at: string,
): JourneyRoadmapTicket {
  const identity = identities.get(ticket.ticketId);
  const status = identity === undefined ? null : readExecutionStatus(project, identity);
  const activity = status?.currentActivity ?? null;
  const workflowStatus = status?.validatedStatus ?? workflowStatusDe(project, ticket.ticketId);
  const parada = paradas.filter((entry) => entry.ticketId === ticket.ticketId).at(-1) ?? null;
  const { phase, stopReason } = faseDelTicket(workflowStatus, activity, parada);
  const actualAt = ticket.start.actualAt ?? activity?.occurredAt ?? null;
  const elapsed = actualAt === null ? null : Math.max(0, Date.parse(at) - Date.parse(actualAt));
  const window = ticket.windowId === undefined
    ? null
    : (journey.windows ?? []).find((entry) => entry.windowId === ticket.windowId) ?? null;
  return Object.freeze({
    ticketId: ticket.ticketId,
    order: ticket.order,
    priority: ticket.priority,
    condition: ticket.start.condition,
    scheduledAt: ticket.start.scheduledAt ?? null,
    actualAt,
    durationMs: elapsed,
    dependsOn: ticket.dependsOn,
    waitingFor: status?.liveness === "waiting" ? ticket.dependsOn : [],
    activity: status?.liveness ?? "unknown",
    phase,
    stopReason,
    lastReceivedAt: activity?.receivedAt ?? null,
    window: window === null ? null : Object.freeze({ windowId: window.windowId, status: evaluateJourneyWindow(window, at) }),
    authorizationIds: ticket.authorizationIds,
  });
}

function latestIdentityByTicket(events: readonly ExecutionEvent[]): Map<string, ExecutionIdentity> {
  const identities = new Map<string, ExecutionIdentity>();
  for (const event of events) identities.set(event.identity.ticketId, event.identity);
  return identities;
}

function passesDe(pasadas: readonly RegistroDePasada[], journeyId: string): JourneyRoadmap["journeys"][number]["passes"] {
  const resumen = resumenDePasadas(pasadas, journeyId);
  return Object.freeze({ last: resumen.ultima, cadenceMs: resumen.cadenciaMs, next: resumen.proxima });
}

function workflowStatusDe(project: AuthorizedProject, ticketId: string): string | null {
  const located = findTicket(project.paths, ticketId);
  return located === undefined ? null : String(parseTicket(located.text).fields.workflow_status);
}

/**
 * La fase de un ticket a partir de lo que el registro ya sabe: una parada activa o una actividad
 * fallida lo detienen; después manda la actividad abierta y, sin ella, el `workflow_status`.
 */
export function faseDelTicket(
  validatedStatus: string | null,
  currentActivity: Pick<ExecutionActivity, "state" | "source" | "occurredAt"> | null,
  parada: Pick<AutonomousStopReceipt, "detail"> | null,
): { readonly phase: FaseDeJornada; readonly stopReason: string | null } {
  if (parada !== null) return { phase: "stopped", stopReason: parada.detail };
  if (currentActivity?.state === "failed") {
    return { phase: "stopped", stopReason: `Falló ${currentActivity.source} el ${currentActivity.occurredAt}.` };
  }
  if (validatedStatus === "blocked") return { phase: "stopped", stopReason: "El ticket está bloqueado." };
  const abierta = currentActivity?.state === "started" || currentActivity?.state === "active" || currentActivity?.state === "waiting";
  if (abierta && currentActivity?.source === "journey-preparation") return { phase: "preparing", stopReason: null };
  if (abierta && currentActivity?.source === "journey-dispatch") return { phase: "implementing", stopReason: null };
  switch (validatedStatus) {
    case "in_progress": return { phase: "implementing", stopReason: null };
    case "planned": return { phase: "plan-ready", stopReason: null };
    case "awaiting_user_tests":
    case "in_qa":
    case "changes_requested": return { phase: "verifying", stopReason: null };
    case "qa_approved":
    case "closed": return { phase: "delivered", stopReason: null };
    default: return { phase: "waiting", stopReason: null };
  }
}
