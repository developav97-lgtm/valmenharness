/**
 * Historial append-only de jornadas por proyecto autorizado.
 *
 * Una jornada conserva una intención: tickets y sus condiciones. No es una
 * ejecución ni un scheduler; crearla o revisarla no cambia workflows, reserva
 * capacidad ni inicia trabajo. Las revisiones son fotos completas para que una
 * hoja de ruta pueda mostrar la vigente sin perder las decisiones anteriores.
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

import { ID_RE, MutationLock, ensureSecurePath } from "@valmen/core";

import { type AuthorizedProject } from "./project-resolution.js";

/** IDs de jornada, revisión, ventana y autorización: opacos, portables y sin rutas. */
export const JOURNEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** La condición declarada no decide elegibilidad: los tickets posteriores la interpretan. */
export const JOURNEY_START_CONDITIONS = [
  "manual",
  "dependencies",
  "window",
  "dependencies-and-window",
] as const;

export type JourneyStartCondition = (typeof JOURNEY_START_CONDITIONS)[number];
export type JourneyRevisionKind = "journey.created" | "journey.revised";

/** Inicio declarado para un ticket; `actualAt` solo existe si un emisor lo aporta. */
export interface JourneyTicketStart {
  readonly condition: JourneyStartCondition;
  readonly scheduledAt?: string | undefined;
  readonly actualAt?: string | undefined;
}

/** Foto de un ticket dentro de la jornada, independiente de sus ejecuciones. */
export interface JourneyTicketInput {
  readonly ticketId: string;
  readonly order: number;
  readonly priority: number;
  readonly dependsOn: readonly string[];
  readonly start: JourneyTicketStart;
  readonly windowId?: string | undefined;
  readonly authorizationIds: readonly string[];
}

/** Intervalo absoluto con zona IANA conservada para explicar el horario local. */
export interface JourneyWindowInput {
  readonly windowId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
}

export interface JourneyRevisionInput {
  readonly revisionId: string;
  readonly journeyId: string;
  readonly occurredAt: string;
  readonly tickets: readonly JourneyTicketInput[];
  /** Opcional para que las revisiones previas sigan siendo legibles. */
  readonly windows?: readonly JourneyWindowInput[] | undefined;
}

export interface JourneyRevision extends Readonly<JourneyRevisionInput> {
  readonly kind: JourneyRevisionKind;
  readonly projectId: string;
  readonly receivedAt: string;
  readonly cursor: number;
}

/** Última foto de una jornada, conservando el cursor de la revisión que la produjo. */
export interface Journey extends Readonly<Omit<JourneyRevision, "kind">> {}

export interface AppendJourneyRevisionResult {
  readonly revision: JourneyRevision;
  /** `false` si una llamada reenviada ya estaba persistida sin cambios. */
  readonly appended: boolean;
}

/** Ruta única del historial de intención de un proyecto. */
export function journeyRevisionsPath(project: AuthorizedProject): string {
  return join(project.root, ".valmen", "journeys", "events.jsonl");
}

/** Crea la primera foto de una jornada. */
export function createJourney(
  project: AuthorizedProject,
  input: JourneyRevisionInput,
  options: { readonly receivedAt?: string | undefined } = {},
): AppendJourneyRevisionResult {
  return appendJourneyRevision(project, input, "journey.created", options);
}

/** Anexa una nueva foto completa de una jornada existente. */
export function reviseJourney(
  project: AuthorizedProject,
  input: JourneyRevisionInput,
  options: { readonly receivedAt?: string | undefined } = {},
): AppendJourneyRevisionResult {
  return appendJourneyRevision(project, input, "journey.revised", options);
}

/** Lee y valida todo el historial, sin hacer inferencias de despacho o ejecución. */
export function readJourneyRevisions(
  project: AuthorizedProject,
  journeyId?: string,
): readonly JourneyRevision[] {
  if (journeyId !== undefined) assertPortableId(journeyId, "journeyId");
  const path = journeyRevisionsPath(project);
  ensureSecurePath(project.root, path, { allowMissing: true });
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const revisions = text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, index) => parseStoredRevision(project, line, index + 1));
  for (const [index, revision] of revisions.entries()) {
    if (revision.cursor !== index + 1) {
      throw new Error("El historial de jornadas tiene cursores no consecutivos o fuera de orden.");
    }
  }
  assertRevisionSequence(revisions);
  return journeyId === undefined
    ? revisions
    : revisions.filter((revision) => revision.journeyId === journeyId);
}

/** Proyecta la última foto de cada jornada en el orden en que fue creada. */
export function readJourneys(project: AuthorizedProject): readonly Journey[] {
  const current = new Map<string, Journey>();
  for (const revision of readJourneyRevisions(project)) {
    current.set(revision.journeyId, Object.freeze({
      revisionId: revision.revisionId,
      journeyId: revision.journeyId,
      occurredAt: revision.occurredAt,
      tickets: revision.tickets,
      windows: revision.windows,
      projectId: revision.projectId,
      receivedAt: revision.receivedAt,
      cursor: revision.cursor,
    }));
  }
  return [...current.values()];
}

/**
 * La jornada creada más recientemente, con su última foto, leída solo desde la raíz del registro.
 *
 * Es para el vigilante de avisos, que conoce las rutas y no el proyecto autorizado: no valida el
 * historial (eso es de `readJourneys`) y devuelve `null` si falta o no se puede leer.
 */
export function ultimaJornadaDelRegistro(
  root: string,
): { readonly journeyId: string; readonly tickets: readonly string[] } | null {
  let texto: string;
  try {
    texto = readFileSync(join(root, ".valmen", "journeys", "events.jsonl"), "utf8");
  } catch {
    return null;
  }
  const actual = new Map<string, string[]>();
  for (const linea of texto.split("\n")) {
    if (linea.trim() === "") continue;
    try {
      const valor = JSON.parse(linea) as { journeyId?: unknown; tickets?: unknown };
      if (typeof valor.journeyId !== "string" || !Array.isArray(valor.tickets)) continue;
      const ordenados = (valor.tickets as { ticketId?: unknown; order?: unknown }[])
        .filter((t) => typeof t.ticketId === "string")
        .sort((a, b) => Number(a.order) - Number(b.order))
        .map((t) => t.ticketId as string);
      actual.set(valor.journeyId, ordenados);
    } catch {
      // Una línea ilegible no impide leer el resto.
    }
  }
  const ultima = [...actual.entries()].at(-1);
  return ultima === undefined ? null : { journeyId: ultima[0], tickets: ultima[1] };
}

function appendJourneyRevision(
  project: AuthorizedProject,
  input: JourneyRevisionInput,
  kind: JourneyRevisionKind,
  options: { readonly receivedAt?: string | undefined },
): AppendJourneyRevisionResult {
  assertInput(input);
  const receivedAt = options.receivedAt ?? new Date().toISOString();
  assertIsoInstant(receivedAt, "receivedAt");

  return MutationLock.run(project.root, () => {
    const history = readJourneyRevisions(project);
    const knownRevision = history.find((revision) => revision.revisionId === input.revisionId);
    if (knownRevision !== undefined) {
      if (!sameRevision(knownRevision, input, kind)) {
        throw new Error(`El revisionId "${input.revisionId}" ya existe con contenido distinto.`);
      }
      return { revision: knownRevision, appended: false };
    }
    const hasJourney = history.some((revision) => revision.journeyId === input.journeyId);
    if (kind === "journey.created" && hasJourney) {
      throw new Error(`La jornada "${input.journeyId}" ya existe; use una revisión.`);
    }
    if (kind === "journey.revised" && !hasJourney) {
      throw new Error(`La jornada "${input.journeyId}" no existe para revisar.`);
    }

    const revision: JourneyRevision = Object.freeze({
      revisionId: input.revisionId,
      journeyId: input.journeyId,
      occurredAt: input.occurredAt,
      tickets: freezeTickets(input.tickets),
      windows: freezeWindows(input.windows ?? []),
      kind,
      projectId: project.projectId,
      receivedAt,
      cursor: history.length + 1,
    });
    appendJsonLine(project, revision);
    return { revision, appended: true };
  });
}

function appendJsonLine(project: AuthorizedProject, revision: JourneyRevision): void {
  const path = journeyRevisionsPath(project);
  ensureSecurePath(project.root, path, { allowMissing: true });
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openSync(
    path,
    constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY,
    0o644,
  );
  try {
    writeSync(descriptor, `${JSON.stringify(revision)}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function parseStoredRevision(
  project: AuthorizedProject,
  line: string,
  lineNumber: number,
): JourneyRevision {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error(`El historial de jornadas tiene JSON inválido en la línea ${lineNumber}.`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`El historial de jornadas tiene una revisión inválida en la línea ${lineNumber}.`);
  }
  const record = value as Record<string, unknown>;
  const kind = stringField(record, "kind", lineNumber);
  if (kind !== "journey.created" && kind !== "journey.revised") {
    throw new Error(`La línea ${lineNumber} declara una clase de revisión inválida.`);
  }
  const storedProjectId = stringField(record, "projectId", lineNumber);
  if (storedProjectId !== project.projectId) {
    throw new Error("El historial de jornadas no pertenece al proyecto autorizado.");
  }
  const input: JourneyRevisionInput = {
    revisionId: stringField(record, "revisionId", lineNumber),
    journeyId: stringField(record, "journeyId", lineNumber),
    occurredAt: stringField(record, "occurredAt", lineNumber),
    tickets: ticketsField(record["tickets"], lineNumber),
    windows: record["windows"] === undefined ? [] : windowsField(record["windows"], lineNumber),
  };
  assertInput(input);
  const receivedAt = stringField(record, "receivedAt", lineNumber);
  assertIsoInstant(receivedAt, "receivedAt");
  const cursor = numberField(record, "cursor", lineNumber);
  if (!Number.isSafeInteger(cursor) || cursor < 1) {
    throw new Error(`El cursor de la línea ${lineNumber} debe ser un entero positivo.`);
  }
  return Object.freeze({
    ...input,
    tickets: freezeTickets(input.tickets),
    windows: freezeWindows(input.windows ?? []),
    kind,
    projectId: storedProjectId,
    receivedAt,
    cursor,
  });
}

function assertInput(input: JourneyRevisionInput): void {
  assertPortableId(input.revisionId, "revisionId");
  assertPortableId(input.journeyId, "journeyId");
  assertIsoInstant(input.occurredAt, "occurredAt");
  if (input.tickets.length === 0) throw new Error("Una jornada debe declarar al menos un ticket.");
  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const ticket of input.tickets) {
    assertTicket(ticket);
    if (ids.has(ticket.ticketId)) throw new Error("Una jornada no puede repetir el mismo ticket.");
    if (orders.has(ticket.order)) throw new Error("Una jornada no puede repetir el orden de un ticket.");
    ids.add(ticket.ticketId);
    orders.add(ticket.order);
  }
  assertWindows(input.windows ?? []);
}

function assertWindows(windows: readonly JourneyWindowInput[]): void {
  const ids = new Set<string>();
  for (const window of windows) {
    assertPortableId(window.windowId, "windowId");
    if (ids.has(window.windowId)) throw new Error("Una jornada no puede repetir una ventana.");
    ids.add(window.windowId);
    assertIsoInstant(window.startsAt, "window.startsAt");
    assertIsoInstant(window.endsAt, "window.endsAt");
    if (Date.parse(window.endsAt) <= Date.parse(window.startsAt)) {
      throw new Error("window.endsAt debe ser posterior a window.startsAt.");
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: window.timeZone }).format(0);
    } catch {
      throw new Error("window.timeZone debe ser una zona horaria IANA reconocida.");
    }
  }
}

/** Un JSONL alterado manualmente no puede fingir una revisión sin su creación. */
function assertRevisionSequence(revisions: readonly JourneyRevision[]): void {
  const journeys = new Set<string>();
  const revisionIds = new Set<string>();
  for (const revision of revisions) {
    if (revisionIds.has(revision.revisionId)) {
      throw new Error("El historial de jornadas repite un revisionId.");
    }
    revisionIds.add(revision.revisionId);
    if (revision.kind === "journey.created") {
      if (journeys.has(revision.journeyId)) {
        throw new Error("El historial de jornadas crea una jornada más de una vez.");
      }
      journeys.add(revision.journeyId);
    } else if (!journeys.has(revision.journeyId)) {
      throw new Error("El historial de jornadas revisa una jornada que no existe.");
    }
  }
}

function assertTicket(ticket: JourneyTicketInput): void {
  if (!ID_RE.test(ticket.ticketId)) throw new Error("ticketId debe ser un identificador de ticket válido.");
  if (!Number.isSafeInteger(ticket.order) || ticket.order < 1) {
    throw new Error("order debe ser un entero positivo.");
  }
  if (!Number.isSafeInteger(ticket.priority) || ticket.priority < 0) {
    throw new Error("priority debe ser un entero no negativo.");
  }
  if (!JOURNEY_START_CONDITIONS.includes(ticket.start.condition)) {
    throw new Error(`start.condition debe ser uno de: ${JOURNEY_START_CONDITIONS.join(", ")}.`);
  }
  if (ticket.start.scheduledAt !== undefined) assertIsoInstant(ticket.start.scheduledAt, "start.scheduledAt");
  if (ticket.start.actualAt !== undefined) assertIsoInstant(ticket.start.actualAt, "start.actualAt");
  if (ticket.windowId !== undefined) assertPortableId(ticket.windowId, "windowId");
  assertUniqueIds(ticket.dependsOn, "dependsOn");
  if (ticket.dependsOn.includes(ticket.ticketId)) {
    throw new Error("Un ticket no puede depender de sí mismo dentro de una jornada.");
  }
  assertUniqueIds(ticket.authorizationIds, "authorizationIds");
}

function assertUniqueIds(ids: readonly string[], field: string): void {
  const known = new Set<string>();
  for (const id of ids) {
    if (field === "dependsOn") {
      if (!ID_RE.test(id)) throw new Error("dependsOn debe contener identificadores de ticket válidos.");
    } else {
      assertPortableId(id, field);
    }
    if (known.has(id)) throw new Error(`${field} no puede repetir identificadores.`);
    known.add(id);
  }
}

function freezeTickets(tickets: readonly JourneyTicketInput[]): readonly JourneyTicketInput[] {
  return Object.freeze(tickets
    .map((ticket) => Object.freeze({
      ticketId: ticket.ticketId,
      order: ticket.order,
      priority: ticket.priority,
      dependsOn: Object.freeze([...ticket.dependsOn]),
      start: Object.freeze({
        condition: ticket.start.condition,
        ...(ticket.start.scheduledAt === undefined ? {} : { scheduledAt: ticket.start.scheduledAt }),
        ...(ticket.start.actualAt === undefined ? {} : { actualAt: ticket.start.actualAt }),
      }),
      ...(ticket.windowId === undefined ? {} : { windowId: ticket.windowId }),
      authorizationIds: Object.freeze([...ticket.authorizationIds]),
    }))
    .sort((left, right) => left.order - right.order));
}

function freezeWindows(windows: readonly JourneyWindowInput[]): readonly JourneyWindowInput[] {
  return Object.freeze(windows.map((window) => Object.freeze({
    windowId: window.windowId,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    timeZone: window.timeZone,
  })));
}

function sameRevision(
  revision: JourneyRevision,
  input: JourneyRevisionInput,
  kind: JourneyRevisionKind,
): boolean {
  return revision.kind === kind && revision.journeyId === input.journeyId &&
    revision.occurredAt === input.occurredAt && sameTickets(revision.tickets, input.tickets) &&
    JSON.stringify(freezeWindows(revision.windows ?? [])) === JSON.stringify(freezeWindows(input.windows ?? []));
}

function sameTickets(left: readonly JourneyTicketInput[], right: readonly JourneyTicketInput[]): boolean {
  return JSON.stringify(freezeTickets(left)) === JSON.stringify(freezeTickets(right));
}

function ticketsField(value: unknown, lineNumber: number): readonly JourneyTicketInput[] {
  if (!Array.isArray(value)) throw new Error(`La línea ${lineNumber} no declara tickets.`);
  return value.map((item) => ticketField(item, lineNumber));
}

function windowsField(value: unknown, lineNumber: number): readonly JourneyWindowInput[] {
  if (!Array.isArray(value)) throw new Error(`La línea ${lineNumber} no declara windows.`);
  return value.map((item) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`La línea ${lineNumber} declara una ventana inválida.`);
    }
    const record = item as Record<string, unknown>;
    return {
      windowId: stringField(record, "windowId", lineNumber),
      startsAt: stringField(record, "startsAt", lineNumber),
      endsAt: stringField(record, "endsAt", lineNumber),
      timeZone: stringField(record, "timeZone", lineNumber),
    };
  });
}

function ticketField(value: unknown, lineNumber: number): JourneyTicketInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`La línea ${lineNumber} declara un ticket de jornada inválido.`);
  }
  const record = value as Record<string, unknown>;
  const start = objectField(record, "start", lineNumber);
  return {
    ticketId: stringField(record, "ticketId", lineNumber),
    order: numberField(record, "order", lineNumber),
    priority: numberField(record, "priority", lineNumber),
    dependsOn: stringListField(record["dependsOn"], "dependsOn", lineNumber),
    start: {
      condition: stringField(start, "condition", lineNumber) as JourneyStartCondition,
      ...(start["scheduledAt"] === undefined ? {} : { scheduledAt: stringField(start, "scheduledAt", lineNumber) }),
      ...(start["actualAt"] === undefined ? {} : { actualAt: stringField(start, "actualAt", lineNumber) }),
    },
    ...(record["windowId"] === undefined ? {} : { windowId: stringField(record, "windowId", lineNumber) }),
    authorizationIds: stringListField(record["authorizationIds"], "authorizationIds", lineNumber),
  };
}

function stringListField(value: unknown, field: string, lineNumber: number): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`La línea ${lineNumber} no declara ${field}.`);
  }
  return value as string[];
}

function stringField(record: Record<string, unknown>, field: string, lineNumber: number): string {
  const value = record[field];
  if (typeof value !== "string") throw new Error(`La línea ${lineNumber} no declara ${field}.`);
  return value;
}

function numberField(record: Record<string, unknown>, field: string, lineNumber: number): number {
  const value = record[field];
  if (typeof value !== "number") throw new Error(`La línea ${lineNumber} no declara ${field}.`);
  return value;
}

function objectField(record: Record<string, unknown>, field: string, lineNumber: number): Record<string, unknown> {
  const value = record[field];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`La línea ${lineNumber} no declara ${field}.`);
  }
  return value as Record<string, unknown>;
}

function assertPortableId(value: string, field: string): void {
  if (!JOURNEY_ID_RE.test(value)) {
    throw new Error(`${field} debe ser un identificador portable no vacío, sin rutas ni espacios.`);
  }
}

function assertIsoInstant(value: string, field: string): void {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${field} debe ser un instante ISO 8601 canónico.`);
  }
}
