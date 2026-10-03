/**
 * Enlaces explícitos entre un intento y las sesiones que lo rodean.
 *
 * La sesión que ejecuta no se deduce de una conversación que pidió el trabajo:
 * ambas son datos distintos y el segundo solo aparece cuando un adaptador lo
 * declara. Cada enlace es un hecho append-only, por lo que una compactación o
 * un reintento conserva la cadena de sesiones comprobable.
 */
import {
  createExecutionIdentity,
  createSessionReference,
  type ExecutionIdentity,
  type SessionReference,
} from "@valmen/core";

import {
  appendExecutionEvent,
  readExecutionEvents,
  type AppendExecutionEventResult,
} from "./execution-events.js";
import { type AuthorizedProject } from "./project-resolution.js";

/** Dato que un adaptador puede anexar para enlazar su worker a un intento. */
export interface ExecutionSessionLinkInput {
  readonly eventId: string;
  readonly identity: ExecutionIdentity;
  readonly attemptId: string;
  readonly executor: SessionReference;
  readonly origin?: SessionReference;
  readonly source: string;
  readonly occurredAt: string;
}

/** Enlace persistido, con el cursor que establece el orden verificable. */
export interface ExecutionSessionLink extends Readonly<ExecutionSessionLinkInput> {
  readonly receivedAt: string;
  readonly cursor: number;
}

/** Anexa el vínculo declarado; no actualiza workflow, actividad ni sesiones previas. */
export function linkExecutionSession(
  project: AuthorizedProject,
  input: ExecutionSessionLinkInput,
  options: { readonly receivedAt?: string | undefined } = {},
): AppendExecutionEventResult {
  return appendExecutionEvent(project, {
    eventId: input.eventId,
    identity: input.identity,
    attemptId: input.attemptId,
    kind: "session.linked",
    source: input.source,
    occurredAt: input.occurredAt,
    session: {
      executor: createSessionReference(input.executor),
      ...(input.origin === undefined ? {} : { origin: createSessionReference(input.origin) }),
    },
  }, options);
}

/** Lee enlaces del ámbito autorizado, en orden de recepción y sin inferencias. */
export function readExecutionSessionLinks(
  project: AuthorizedProject,
  identity: ExecutionIdentity,
  attemptId?: string,
): readonly ExecutionSessionLink[] {
  if (identity.projectId !== project.projectId) {
    throw new Error("La identidad de sesión no pertenece al proyecto autorizado.");
  }
  return readExecutionEvents(project)
    .filter((event) => sameIdentity(event.identity, identity))
    .filter((event) => attemptId === undefined || event.attemptId === attemptId)
    .flatMap((event) => {
      if (event.kind !== "session.linked" || event.session === undefined) return [];
      return [Object.freeze({
        eventId: event.eventId,
        identity: event.identity,
        attemptId: event.attemptId,
        executor: event.session.executor,
        ...(event.session.origin === undefined ? {} : { origin: event.session.origin }),
        source: event.source,
        occurredAt: event.occurredAt,
        receivedAt: event.receivedAt,
        cursor: event.cursor,
      })];
    });
}

function sameIdentity(left: ExecutionIdentity, right: ExecutionIdentity): boolean {
  const validated = createExecutionIdentity(right);
  return left.projectId === validated.projectId
    && left.ticketId === validated.ticketId
    && left.executionId === validated.executionId;
}
