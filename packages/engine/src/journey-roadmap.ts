/** Proyección de solo lectura de una jornada para CLI, MCP y Mission Control. */
import { createExecutionContract } from "./execution-contract.js";
import { readJourneyAuthorization, type JourneyAuthorization } from "./journey-authorization.js";
import { readJourneys, type Journey, type JourneyTicketInput } from "./journeys.js";
import { evaluateJourneyWindow, type JourneyWindowStatus } from "./journey-windows.js";
import { type AuthorizedProject } from "./project-resolution.js";
import { readExecutionStatus, type ExecutionStatus } from "./execution-status.js";

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
  const contract = createExecutionContract(project);
  const replays = contract.replay();
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
      tickets: Object.freeze([...journey.tickets]
        .sort((left, right) => left.order - right.order)
        .map((ticket) => projectTicket(project, journey, ticket, replays, at))),
    }))),
  });
}

function projectTicket(
  project: AuthorizedProject,
  journey: Journey,
  ticket: JourneyTicketInput,
  replays: ReturnType<ReturnType<typeof createExecutionContract>["replay"]>,
  at: string,
): JourneyRoadmapTicket {
  const replay = replays
    .filter((entry) => entry.identity.ticketId === ticket.ticketId)
    .sort((left, right) => (right.events.at(-1)?.cursor ?? 0) - (left.events.at(-1)?.cursor ?? 0))[0];
  const status = replay === undefined ? null : readExecutionStatus(project, replay.identity);
  const activity = status?.currentActivity ?? null;
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
    lastReceivedAt: activity?.receivedAt ?? null,
    window: window === null ? null : Object.freeze({ windowId: window.windowId, status: evaluateJourneyWindow(window, at) }),
    authorizationIds: ticket.authorizationIds,
  });
}
