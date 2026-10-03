/**
 * Registro append-only de la actividad de una ejecución.
 *
 * Los eventos no viven dentro de `ticket.md`: el ticket conserva el workflow
 * auditable y este log conserva telemetría que puede llegar tarde, repetida o
 * desde otra sesión. Cada proyecto autorizado tiene su propio JSONL, por lo
 * que una reconexión puede leerlo completo y reconstruir exactamente el orden
 * en que el harness recibió los hechos.
 */
import {
  closeSync,
  constants,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";

import {
  EXECUTION_ID_RE,
  MutationLock,
  createModelReference,
  createSessionReference,
  createExecutionIdentity,
  ensureSecurePath,
  executionScopeKey,
  type ExecutionIdentity,
  type ModelReference,
  type SessionReference,
} from "@valmen/core";

import { type AuthorizedProject } from "./project-resolution.js";

/** Identificador opaco y portable de un hecho enviado por un adaptador. */
export const EXECUTION_EVENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Clase y fuente se guardan como etiquetas, nunca como texto libre o rutas. */
export const EXECUTION_EVENT_LABEL_RE = /^[a-z][a-z0-9._-]{0,63}$/;

/** Hecho que un cliente desea incorporar al historial de una ejecución. */
export interface ExecutionEventInput {
  readonly eventId: string;
  readonly identity: ExecutionIdentity;
  readonly attemptId: string;
  readonly kind: string;
  readonly source: string;
  readonly occurredAt: string;
  /** Vínculo explícito de una sesión ejecutora; solo aplica a `session.linked`. */
  readonly session?: {
    readonly executor: SessionReference;
    readonly origin?: SessionReference;
  };
  /** Modelo declarado u observado; solo aplica a los hechos `model.*`. */
  readonly model?: ModelReference;
}

/** Hecho persistido, con el orden que le asignó el harness al recibirlo. */
export interface ExecutionEvent extends Readonly<ExecutionEventInput> {
  readonly receivedAt: string;
  readonly cursor: number;
}

/** Resultado de anexar o reconciliar un evento. */
export interface AppendExecutionEventResult {
  readonly event: ExecutionEvent;
  /** `false` cuando el mismo hecho ya había sido persistido. */
  readonly appended: boolean;
}

/** Una ejecución reconstruida desde el log, en orden de recepción estable. */
export interface ExecutionReplay {
  readonly identity: ExecutionIdentity;
  readonly events: readonly ExecutionEvent[];
}

/** Ruta única del historial de eventos de un proyecto. */
export function executionEventsPath(project: AuthorizedProject): string {
  return join(project.root, ".valmen", "executions", "events.jsonl");
}

/**
 * Anexa un hecho o devuelve el que ya se conocía.
 *
 * El lock comparte la exclusión mutua de todo el registro del proyecto. Así
 * ningún proceso puede leer el último cursor a la vez que otro lo incrementa.
 * El JSONL se escribe en modo `O_APPEND` y se sincroniza antes de liberar el
 * lock: no se reescribe historia para agregar una línea.
 */
export function appendExecutionEvent(
  project: AuthorizedProject,
  input: ExecutionEventInput,
  options: { readonly receivedAt?: string | undefined } = {},
): AppendExecutionEventResult {
  assertInput(project, input);
  const receivedAt = options.receivedAt ?? new Date().toISOString();
  assertIsoInstant(receivedAt, "receivedAt");

  return MutationLock.run(project.root, () => {
    const history = readExecutionEvents(project);
    const known = history.find((event) => event.eventId === input.eventId);
    if (known !== undefined) {
      if (!sameEvent(known, input)) {
        throw new Error(`El eventId "${input.eventId}" ya existe con contenido distinto.`);
      }
      return { event: known, appended: false };
    }

    const event: ExecutionEvent = Object.freeze({
      ...input,
      identity: createExecutionIdentity(input.identity),
      ...(input.session === undefined
        ? {}
        : {
            session: Object.freeze({
              executor: createSessionReference(input.session.executor),
              ...(input.session.origin === undefined
                ? {}
                : { origin: createSessionReference(input.session.origin) }),
            }),
          }),
      ...(input.model === undefined ? {} : { model: createModelReference(input.model) }),
      receivedAt,
      cursor: history.length + 1,
    });
    appendJsonLine(project, event);
    return { event, appended: true };
  });
}

/** Lee el historial íntegro y verifica que conserva su secuencia original. */
export function readExecutionEvents(project: AuthorizedProject): readonly ExecutionEvent[] {
  const path = executionEventsPath(project);
  ensureSecurePath(project.root, path, { allowMissing: true });
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const events = text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, index) => parseStoredEvent(project, line, index + 1));
  for (const [index, event] of events.entries()) {
    if (event.cursor !== index + 1) {
      throw new Error(
        "El historial de eventos tiene cursores no consecutivos o fuera de orden.",
      );
    }
  }
  return events;
}

/**
 * Reconstruye la actividad por ejecución, sin inferir ni alterar workflow.
 *
 * La agrupación usa proyecto y ejecución, no solo ticket: un ticket puede
 * tener reintentos y dos proyectos pueden compartir el mismo identificador.
 */
export function replayExecutionEvents(
  project: AuthorizedProject,
): readonly ExecutionReplay[] {
  const groups = new Map<
    string,
    { identity: ExecutionIdentity; events: ExecutionEvent[] }
  >();
  for (const event of readExecutionEvents(project)) {
    const key = executionScopeKey(event.identity);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { identity: event.identity, events: [event] });
    } else {
      group.events.push(event);
    }
  }
  return [...groups.values()].map((group) =>
    Object.freeze({
      identity: group.identity,
      events: Object.freeze(group.events),
    }),
  );
}

function appendJsonLine(project: AuthorizedProject, event: ExecutionEvent): void {
  const path = executionEventsPath(project);
  ensureSecurePath(project.root, path, { allowMissing: true });
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openSync(
    path,
    constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY,
    0o644,
  );
  try {
    writeSync(descriptor, `${JSON.stringify(event)}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function parseStoredEvent(
  project: AuthorizedProject,
  line: string,
  lineNumber: number,
): ExecutionEvent {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error(
      `El historial de eventos tiene JSON inválido en la línea ${lineNumber}.`,
    );
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `El historial de eventos tiene un evento inválido en la línea ${lineNumber}.`,
    );
  }
  const record = value as Record<string, unknown>;
  const input: ExecutionEventInput = {
    eventId: stringField(record, "eventId", lineNumber),
    identity: createExecutionIdentity(
      objectField(record, "identity", lineNumber) as ExecutionIdentity,
    ),
    attemptId: stringField(record, "attemptId", lineNumber),
    kind: stringField(record, "kind", lineNumber),
    source: stringField(record, "source", lineNumber),
    occurredAt: stringField(record, "occurredAt", lineNumber),
    ...(record["session"] === undefined
      ? {}
      : { session: sessionField(record["session"], lineNumber) }),
    ...(record["model"] === undefined
      ? {}
      : { model: modelField(record["model"], lineNumber) }),
  };
  const event: ExecutionEvent = Object.freeze({
    ...input,
    receivedAt: stringField(record, "receivedAt", lineNumber),
    cursor: numberField(record, "cursor", lineNumber),
  });
  assertInput(project, input);
  assertIsoInstant(event.receivedAt, "receivedAt");
  if (!Number.isSafeInteger(event.cursor) || event.cursor < 1) {
    throw new Error(`El cursor de la línea ${lineNumber} debe ser un entero positivo.`);
  }
  return event;
}

function assertInput(project: AuthorizedProject, input: ExecutionEventInput): void {
  if (!EXECUTION_EVENT_ID_RE.test(input.eventId)) {
    throw new Error(
      "eventId debe ser un identificador portable no vacío, sin rutas ni espacios.",
    );
  }
  const identity = createExecutionIdentity(input.identity);
  if (identity.projectId !== project.projectId) {
    throw new Error("La identidad del evento no pertenece al proyecto autorizado.");
  }
  if (!EXECUTION_ID_RE.test(input.attemptId)) {
    throw new Error(
      "attemptId debe ser un identificador portable no vacío, sin rutas ni espacios.",
    );
  }
  if (!EXECUTION_EVENT_LABEL_RE.test(input.kind)) {
    throw new Error("kind debe ser una etiqueta en minúsculas, sin espacios.");
  }
  if (!EXECUTION_EVENT_LABEL_RE.test(input.source)) {
    throw new Error("source debe ser una etiqueta en minúsculas, sin espacios.");
  }
  if (input.kind === "session.linked" && input.session === undefined) {
    throw new Error("session.linked requiere una referencia de sesión ejecutora.");
  }
  if (input.kind !== "session.linked" && input.session !== undefined) {
    throw new Error("La referencia de sesión solo aplica a eventos session.linked.");
  }
  if (input.session !== undefined) {
    createSessionReference(input.session.executor);
    if (input.session.origin !== undefined) createSessionReference(input.session.origin);
  }
  const isModelEvent = input.kind === "model.configured" || input.kind === "model.observed";
  if (isModelEvent && input.model === undefined) {
    throw new Error(`${input.kind} requiere una referencia de modelo.`);
  }
  if (!isModelEvent && input.model !== undefined) {
    throw new Error(
      "La referencia de modelo solo aplica a eventos model.configured o model.observed.",
    );
  }
  if (input.model !== undefined) createModelReference(input.model);
  assertIsoInstant(input.occurredAt, "occurredAt");
}

function assertIsoInstant(value: string, field: string): void {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${field} debe ser un instante ISO 8601 canónico.`);
  }
}

function sameEvent(event: ExecutionEvent, input: ExecutionEventInput): boolean {
  return (
    event.eventId === input.eventId &&
    event.attemptId === input.attemptId &&
    event.kind === input.kind &&
    event.source === input.source &&
    event.occurredAt === input.occurredAt &&
    event.identity.projectId === input.identity.projectId &&
    event.identity.ticketId === input.identity.ticketId &&
    event.identity.executionId === input.identity.executionId &&
    sameSession(event.session, input.session) &&
    sameModel(event.model, input.model)
  );
}

function sameSession(
  left: ExecutionEventInput["session"],
  right: ExecutionEventInput["session"],
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    sameSessionReference(left.executor, right.executor) &&
    (left.origin === undefined || right.origin === undefined
      ? left.origin === right.origin
      : sameSessionReference(left.origin, right.origin))
  );
}

function sameSessionReference(left: SessionReference, right: SessionReference): boolean {
  return (
    left.adapter === right.adapter &&
    left.scope === right.scope &&
    left.sessionId === right.sessionId
  );
}

function sameModel(
  left: ModelReference | undefined,
  right: ModelReference | undefined,
): boolean {
  return left === undefined || right === undefined
    ? left === right
    : left.provider === right.provider && left.model === right.model;
}

function sessionField(
  value: unknown,
  lineNumber: number,
): NonNullable<ExecutionEventInput["session"]> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`La línea ${lineNumber} declara una sesión inválida.`);
  }
  const record = value as Record<string, unknown>;
  const executor = sessionReferenceField(record["executor"], "executor", lineNumber);
  const origin =
    record["origin"] === undefined
      ? undefined
      : sessionReferenceField(record["origin"], "origin", lineNumber);
  return {
    executor,
    ...(origin === undefined ? {} : { origin }),
  };
}

function sessionReferenceField(
  value: unknown,
  field: string,
  lineNumber: number,
): SessionReference {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`La línea ${lineNumber} declara ${field} inválido.`);
  }
  const record = value as Record<string, unknown>;
  return createSessionReference({
    adapter: stringField(record, "adapter", lineNumber),
    scope: stringField(record, "scope", lineNumber),
    sessionId: stringField(record, "sessionId", lineNumber),
  });
}

function modelField(value: unknown, lineNumber: number): ModelReference {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`La línea ${lineNumber} declara un modelo inválido.`);
  }
  const record = value as Record<string, unknown>;
  return createModelReference({
    provider: stringField(record, "provider", lineNumber),
    model: stringField(record, "model", lineNumber),
  });
}

function stringField(
  record: Record<string, unknown>,
  field: string,
  lineNumber: number,
): string {
  const value = record[field];
  if (typeof value !== "string")
    throw new Error(`La línea ${lineNumber} no declara ${field}.`);
  return value;
}

function numberField(
  record: Record<string, unknown>,
  field: string,
  lineNumber: number,
): number {
  const value = record[field];
  if (typeof value !== "number")
    throw new Error(`La línea ${lineNumber} no declara ${field}.`);
  return value;
}

function objectField(
  record: Record<string, unknown>,
  field: string,
  lineNumber: number,
): Record<string, unknown> {
  const value = record[field];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`La línea ${lineNumber} no declara ${field}.`);
  }
  return value as Record<string, unknown>;
}
