/**
 * Actividad observable de una ejecución, separada del workflow del ticket.
 *
 * Esta fachada normaliza los hechos que pueden emitir CLI, MCP o adaptadores.
 * Solo conoce el registro append-only de ejecución: no importa transiciones,
 * gates, QA ni el documento del ticket, por lo que terminar una actividad no
 * puede conceder una aprobación ni cerrar trabajo.
 */
import { type ExecutionIdentity } from "@valmen/core";

import {
  appendExecutionEvent,
  readExecutionEvents,
  type AppendExecutionEventResult,
  type ExecutionEvent,
} from "./execution-events.js";
import { type AuthorizedProject } from "./project-resolution.js";

/** Estados publicables de un intento, distintos de los estados del ticket. */
export const EXECUTION_ACTIVITY_STATES = [
  "started",
  "active",
  "waiting",
  "finished",
  "failed",
] as const;

export type ExecutionActivityState = (typeof EXECUTION_ACTIVITY_STATES)[number];

/** Hecho de actividad que un cliente declara para un intento concreto. */
export interface ExecutionActivityInput {
  readonly eventId: string;
  readonly identity: ExecutionIdentity;
  readonly attemptId: string;
  readonly state: ExecutionActivityState;
  readonly source: string;
  readonly occurredAt: string;
}

/** Actividad persistida con su cursor de recepción. */
export interface ExecutionActivity extends Readonly<ExecutionActivityInput> {
  readonly receivedAt: string;
  readonly cursor: number;
}

/** Registra actividad sin tocar el workflow, QA, release ni gates del ticket. */
export function recordExecutionActivity(
  project: AuthorizedProject,
  input: ExecutionActivityInput,
  options: { readonly receivedAt?: string | undefined } = {},
): AppendExecutionEventResult {
  assertActivityState(input.state);
  return appendExecutionEvent(project, {
    eventId: input.eventId,
    identity: input.identity,
    attemptId: input.attemptId,
    kind: `activity.${input.state}`,
    source: input.source,
    occurredAt: input.occurredAt,
  }, options);
}

/** Lee la actividad de una ejecución y, opcionalmente, de un único intento. */
export function readExecutionActivity(
  project: AuthorizedProject,
  identity: ExecutionIdentity,
  attemptId?: string,
): readonly ExecutionActivity[] {
  if (identity.projectId !== project.projectId) {
    throw new Error("La identidad de actividad no pertenece al proyecto autorizado.");
  }
  return readExecutionEvents(project)
    .filter((event) => sameIdentity(event.identity, identity))
    .filter((event) => attemptId === undefined || event.attemptId === attemptId)
    .flatMap((event) => toActivity(event));
}

function toActivity(event: ExecutionEvent): ExecutionActivity[] {
  if (!event.kind.startsWith("activity.")) return [];
  const state = event.kind.slice("activity.".length);
  if (!EXECUTION_ACTIVITY_STATES.includes(state as ExecutionActivityState)) return [];
  return [Object.freeze({
    eventId: event.eventId,
    identity: event.identity,
    attemptId: event.attemptId,
    state: state as ExecutionActivityState,
    source: event.source,
    occurredAt: event.occurredAt,
    receivedAt: event.receivedAt,
    cursor: event.cursor,
  })];
}

function assertActivityState(state: string): asserts state is ExecutionActivityState {
  if (!EXECUTION_ACTIVITY_STATES.includes(state as ExecutionActivityState)) {
    throw new Error(`state debe ser uno de: ${EXECUTION_ACTIVITY_STATES.join(", ")}.`);
  }
}

function sameIdentity(left: ExecutionIdentity, right: ExecutionIdentity): boolean {
  return left.projectId === right.projectId
    && left.ticketId === right.ticketId
    && left.executionId === right.executionId;
}
