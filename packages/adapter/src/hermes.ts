/**
 * Lector incremental de Hermes, aislado por perfil y estrictamente de solo lectura.
 *
 * El board y el ledger de conversaciones son dos SQLite distintos. Este módulo
 * no explora instalaciones completas ni intenta unirlos por título, tiempo o
 * `tasks.session_id`: ese campo es la conversación que originó la tarjeta, no
 * una prueba de qué worker la ejecutó. Una puerta autorizada puede enlazar una
 * sesión observada al intento mediante el contrato del engine, pero el lector no
 * escribe ese hecho ni inventa la relación.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

import { createSessionReference, type SessionReference } from "@valmen/core";

import { createAdapterCapabilities, type AdapterCapabilities } from "./capabilities.js";

type Database = import("node:sqlite").DatabaseSync;
type DatabaseConstructor = typeof import("node:sqlite").DatabaseSync;

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;
// Debe aceptar exactamente los perfiles que el binding de máquina puede declarar;
// `SessionReference.scope` admite esta misma forma portable.
const PROFILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Un perfil Hermes explícitamente asociado por una capa autorizada. */
export interface HermesReadSource {
  readonly profile: string;
  /** Solo se permite para la resolución local de rutas; nunca llega del navegador. */
  readonly home: string;
}

/** Fronteras independientes de los dos archivos SQLite que observa Hermes. */
export interface HermesReadCursor {
  readonly taskEventId: number;
  readonly sessionActivityAt: number;
  readonly sessionId: string;
}

export type HermesReadStatus = "available" | "unavailable" | "incompatible";

/** Un cambio del board, sin payload arbitrario ni identidad ejecutora deducida. */
export interface HermesTaskEvent {
  readonly id: number;
  readonly taskId: string;
  readonly runId: number | null;
  readonly kind: string;
  readonly occurredAt: number;
  readonly runStatus: string | null;
  /** `tasks.session_id`: conversación que originó la tarjeta, no worker. */
  readonly originSessionId: string | null;
}

/** Una sesión que Hermes expone para que otra capa pueda enlazarla explícitamente. */
export interface HermesObservedSession {
  readonly reference: SessionReference;
  readonly model: string;
  readonly provider: string;
  readonly activityAt: number;
}

/** Resultado acotado de consultar el board del perfil. */
export interface HermesBoardChanges {
  readonly status: HermesReadStatus;
  readonly events: readonly HermesTaskEvent[];
}

/** Resultado acotado de consultar el ledger de sesiones del perfil. */
export interface HermesSessionChanges {
  readonly status: HermesReadStatus;
  readonly sessions: readonly HermesObservedSession[];
}

/** Foto incremental de Hermes y la frontera que continuará el siguiente lector. */
export interface HermesChanges {
  readonly cursor: HermesReadCursor;
  readonly board: HermesBoardChanges;
  readonly sessions: HermesSessionChanges;
}

/** Texto visible de una conversación, sin razonamiento ni resultado de herramienta. */
export interface HermesVisibleMessage {
  readonly id: number;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly timestamp: number;
}

/** Una página de mensajes de una sola sesión. */
export interface HermesVisibleMessagePage {
  readonly messages: readonly HermesVisibleMessage[];
  readonly nextCursor: number;
}

/** Valida un perfil local que también puede ser el ámbito portable de la sesión. */
export function createHermesReadSource(input: {
  readonly profile: string;
  readonly home?: string;
}): HermesReadSource {
  if (!PROFILE_RE.test(input.profile)) {
    throw new Error("perfil debe ser un identificador portable, sin rutas ni espacios.");
  }
  return Object.freeze({ profile: input.profile, home: input.home ?? homedir() });
}

/** Ruta del ledger `state.db` del perfil, sin buscar perfiles vecinos. */
export function hermesStateDbPath(source: HermesReadSource): string {
  if (source.profile === "default") return join(source.home, ".hermes", "state.db");
  return join(source.home, ".hermes", "profiles", source.profile, "state.db");
}

/** Ruta del board del perfil, sin abrir el board de otro proyecto. */
export function hermesBoardDbPath(source: HermesReadSource): string {
  if (source.profile === "default") return join(source.home, ".hermes", "kanban.db");
  return join(source.home, ".hermes", "kanban", "boards", source.profile, "kanban.db");
}

/** La referencia portable que una sesión del perfil puede presentar al engine. */
export function hermesSessionReference(
  source: HermesReadSource,
  sessionId: string,
): SessionReference {
  return createSessionReference({ adapter: "hermes", scope: source.profile, sessionId });
}

/** Compatibilidad de Hermes: describe el lector, no una instalación concreta. */
export function hermesAdapterCapabilities(): AdapterCapabilities {
  return createAdapterCapabilities({
    adapter: "hermes",
    capabilities: [
      {
        capability: "observe-states",
        available: true,
        limitation: "Solo lectura incremental de task_events por perfil.",
      },
      {
        capability: "read-activity",
        available: true,
        limitation: "Solo lectura de sesiones; no infiere la identidad del worker.",
      },
      {
        capability: "read-messages",
        available: true,
        limitation: "Solo mensajes visibles paginados, sin razonamiento ni herramientas.",
      },
      {
        capability: "dispatch",
        available: false,
        limitation: "El despacho requiere la integración Hermes de jornadas autorizada.",
      },
    ],
  });
}

/** Lee los cambios posteriores a las dos fronteras, sin tocar la tabla messages. */
export function readHermesChanges(
  source: HermesReadSource,
  options: { readonly cursor?: HermesReadCursor; readonly limit?: number } = {},
): HermesChanges {
  const cursor = normalizeCursor(options.cursor);
  const limit = pageLimit(options.limit);
  const board = readBoardChanges(source, cursor.taskEventId, limit);
  const sessions = readSessionChanges(source, cursor, limit);
  const lastEvent = board.events.at(-1);
  const lastSession = sessions.sessions.at(-1);

  return Object.freeze({
    cursor: Object.freeze({
      taskEventId: lastEvent?.id ?? cursor.taskEventId,
      sessionActivityAt: lastSession?.activityAt ?? cursor.sessionActivityAt,
      sessionId: lastSession?.reference.sessionId ?? cursor.sessionId,
    }),
    board: Object.freeze({ ...board, events: Object.freeze([...board.events]) }),
    sessions: Object.freeze({
      ...sessions,
      sessions: Object.freeze([...sessions.sessions]),
    }),
  });
}

/** Lee una página de una sesión conocida, sin abrir ni recorrer las demás. */
export function readHermesVisibleMessages(
  source: HermesReadSource,
  reference: SessionReference,
  options: { readonly afterId?: number; readonly limit?: number } = {},
): HermesVisibleMessagePage {
  const validReference = createSessionReference(reference);
  if (validReference.adapter !== "hermes" || validReference.scope !== source.profile) {
    throw new Error("La referencia de sesión no pertenece al perfil Hermes solicitado.");
  }
  const afterId = optionalCursor(options.afterId);
  const limit = pageLimit(options.limit);
  const path = hermesStateDbPath(source);
  if (!existsSync(path))
    return Object.freeze({ messages: Object.freeze([]), nextCursor: afterId });

  const DatabaseSync = loadSqlite();
  if (DatabaseSync === null)
    return Object.freeze({ messages: Object.freeze([]), nextCursor: afterId });

  let db: Database | null = null;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    const rows = db
      .prepare(
        "SELECT id, role, content, timestamp FROM messages " +
          "WHERE session_id = ? AND id > ? AND role IN ('user', 'assistant') " +
          "AND content IS NOT NULL ORDER BY id ASC LIMIT ?",
      )
      .all(validReference.sessionId, afterId, limit) as unknown as VisibleMessageRow[];
    const messages: HermesVisibleMessage[] = rows.flatMap((row) => {
      if (!isPositiveInteger(row.id) || !isVisibleRole(row.role)) return [];
      if (typeof row.content !== "string") return [];
      return [
        {
          id: row.id,
          role: row.role,
          content: row.content,
          timestamp: finite(row.timestamp),
        },
      ];
    });
    return Object.freeze({
      messages: Object.freeze(messages),
      nextCursor: messages.at(-1)?.id ?? afterId,
    });
  } catch {
    // Una versión sin tabla compatible no se transforma en una conversación vacía
    // de otra sesión; la fuente simplemente no expone mensajes en esta lectura.
    return Object.freeze({ messages: Object.freeze([]), nextCursor: afterId });
  } finally {
    db?.close();
  }
}

interface TaskEventRow {
  readonly id: number;
  readonly task_id: string;
  readonly run_id: number | null;
  readonly kind: string;
  readonly created_at: number | null;
  readonly run_status: string | null;
  readonly origin_session_id: string | null;
}

interface SessionRow {
  readonly id: string;
  readonly model: string | null;
  readonly billing_provider: string | null;
  readonly activity_at: number | null;
}

interface VisibleMessageRow {
  readonly id: number;
  readonly role: string;
  readonly content: string | null;
  readonly timestamp: number | null;
}

function readBoardChanges(
  source: HermesReadSource,
  afterId: number,
  limit: number,
): HermesBoardChanges {
  const path = hermesBoardDbPath(source);
  if (!existsSync(path)) return { status: "unavailable", events: [] };
  const DatabaseSync = loadSqlite();
  if (DatabaseSync === null) return { status: "unavailable", events: [] };

  let db: Database | null = null;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    const rows = db
      .prepare(
        "SELECT e.id, e.task_id, e.run_id, e.kind, e.created_at, " +
          "r.status AS run_status, t.session_id AS origin_session_id " +
          "FROM task_events e JOIN tasks t ON t.id = e.task_id " +
          "LEFT JOIN task_runs r ON r.id = e.run_id " +
          "WHERE e.id > ? ORDER BY e.id ASC LIMIT ?",
      )
      .all(afterId, limit) as unknown as TaskEventRow[];
    const events = rows.flatMap((row) => {
      if (
        !isPositiveInteger(row.id) ||
        typeof row.task_id !== "string" ||
        typeof row.kind !== "string"
      ) {
        return [];
      }
      return [
        {
          id: row.id,
          taskId: row.task_id,
          runId: isPositiveInteger(row.run_id) ? row.run_id : null,
          kind: row.kind,
          occurredAt: finite(row.created_at),
          runStatus: typeof row.run_status === "string" ? row.run_status : null,
          originSessionId:
            typeof row.origin_session_id === "string" && row.origin_session_id !== ""
              ? row.origin_session_id
              : null,
        },
      ];
    });
    return { status: "available", events };
  } catch {
    return { status: "incompatible", events: [] };
  } finally {
    db?.close();
  }
}

function readSessionChanges(
  source: HermesReadSource,
  cursor: HermesReadCursor,
  limit: number,
): HermesSessionChanges {
  const path = hermesStateDbPath(source);
  if (!existsSync(path)) return { status: "unavailable", sessions: [] };
  const DatabaseSync = loadSqlite();
  if (DatabaseSync === null) return { status: "unavailable", sessions: [] };

  let db: Database | null = null;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    const rows = db
      .prepare(
        "SELECT id, model, billing_provider, COALESCE(last_activity_at, started_at, 0) AS activity_at " +
          "FROM sessions WHERE COALESCE(last_activity_at, started_at, 0) > ? " +
          "OR (COALESCE(last_activity_at, started_at, 0) = ? AND id > ?) " +
          "ORDER BY COALESCE(last_activity_at, started_at, 0) ASC, id ASC LIMIT ?",
      )
      .all(
        cursor.sessionActivityAt,
        cursor.sessionActivityAt,
        cursor.sessionId,
        limit,
      ) as unknown as SessionRow[];
    const sessions = rows.flatMap((row) => {
      if (typeof row.id !== "string" || row.id === "") return [];
      try {
        return [
          {
            reference: hermesSessionReference(source, row.id),
            model: typeof row.model === "string" ? row.model : "",
            provider: typeof row.billing_provider === "string" ? row.billing_provider : "",
            activityAt: finite(row.activity_at),
          },
        ];
      } catch {
        // Una ID de una versión ajena que no cabe en el contrato portable no se
        // asocia a otro ámbito ni invalida los demás cambios de la fuente.
        return [];
      }
    });
    return { status: "available", sessions };
  } catch {
    return { status: "incompatible", sessions: [] };
  } finally {
    db?.close();
  }
}

function normalizeCursor(cursor: HermesReadCursor | undefined): HermesReadCursor {
  if (cursor === undefined)
    return Object.freeze({ taskEventId: 0, sessionActivityAt: 0, sessionId: "" });
  return Object.freeze({
    taskEventId: optionalCursor(cursor.taskEventId),
    sessionActivityAt: nonNegativeFinite(cursor.sessionActivityAt, "sessionActivityAt"),
    sessionId: typeof cursor.sessionId === "string" ? cursor.sessionId : "",
  });
}

function optionalCursor(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0)
    throw new Error("afterId debe ser un entero mayor o igual que cero.");
  return value;
}

function nonNegativeFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${name} debe ser un número mayor o igual que cero.`);
  return value;
}

function pageLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new Error(`limit debe ser un entero entre 1 y ${MAX_PAGE_SIZE}.`);
  }
  return value;
}

function isPositiveInteger(value: number | null): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isVisibleRole(value: string): value is HermesVisibleMessage["role"] {
  return value === "user" || value === "assistant";
}

function finite(value: number | null): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function loadSqlite(): DatabaseConstructor | null {
  try {
    const require = createRequire(import.meta.url);
    return (require("node:sqlite") as { DatabaseSync: DatabaseConstructor }).DatabaseSync;
  } catch {
    return null;
  }
}
