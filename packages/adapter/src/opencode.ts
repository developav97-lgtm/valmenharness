/**
 * Lector incremental de sesiones OpenCode, limitado al proyecto autorizado.
 *
 * La línea de tiempo del servidor calcula consumo y, para eso, lee el contenido
 * de mensajes. Este módulo tiene otro contrato: durante un refresco solo observa
 * índices y metadatos de actividad. No interpreta títulos ni texto para enlazar
 * tickets, intentos o sesiones ejecutoras.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

import { createSessionReference, PROJECT_ID_RE, type SessionReference } from "@valmen/core";

import { createAdapterCapabilities, type AdapterCapabilities } from "./capabilities.js";

type Database = import("node:sqlite").DatabaseSync;
type DatabaseConstructor = typeof import("node:sqlite").DatabaseSync;

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

/** Contexto local autorizado; la ruta nunca se copia a la referencia portable. */
export interface OpenCodeReadSource {
  readonly projectId: string;
  readonly root: string;
  readonly home: string;
}

/** Frontera total ordenada por hora e identificador de la actividad observada. */
export interface OpenCodeReadCursor {
  readonly activityAt: number;
  readonly activityId: string;
}

export type OpenCodeReadStatus = "available" | "unavailable" | "incompatible";

/** Actividad de una sesión sin contenido de conversación ni inferencia de ticket. */
export interface OpenCodeObservedActivity {
  readonly reference: SessionReference;
  readonly activityAt: number;
  readonly activityId: string;
  readonly agent: string;
  readonly model: string;
  readonly schema: "legacy" | "v2";
}

export interface OpenCodeChanges {
  readonly status: OpenCodeReadStatus;
  readonly cursor: OpenCodeReadCursor;
  readonly activities: readonly OpenCodeObservedActivity[];
}

/** Construye una fuente solo desde el contexto que ya autorizó el proyecto. */
export function createOpenCodeReadSource(input: {
  readonly projectId: string;
  readonly root: string;
  readonly home?: string;
}): OpenCodeReadSource {
  if (!PROJECT_ID_RE.test(input.projectId)) {
    throw new Error(
      "projectId debe ser un identificador lógico portable, sin rutas ni espacios.",
    );
  }
  if (typeof input.root !== "string" || input.root.trim() === "") {
    throw new Error("root debe ser una ruta local no vacía del proyecto autorizado.");
  }
  return Object.freeze({
    projectId: input.projectId,
    root: input.root,
    home: input.home ?? homedir(),
  });
}

/** Ruta local de la base OpenCode; no forma parte de la identidad persistida. */
export function openCodeDbPath(source: OpenCodeReadSource): string {
  return join(source.home, ".local", "share", "opencode", "opencode.db");
}

/** La identidad portable de una sesión observada en el proyecto autorizado. */
export function openCodeSessionReference(
  source: OpenCodeReadSource,
  sessionId: string,
): SessionReference {
  return createSessionReference({
    adapter: "opencode",
    scope: source.projectId,
    sessionId,
  });
}

/** Capacidades del lector, no la salud de una instalación concreta. */
export function openCodeAdapterCapabilities(): AdapterCapabilities {
  return createAdapterCapabilities({
    adapter: "opencode",
    capabilities: [
      {
        capability: "observe-states",
        available: false,
        limitation: "OpenCode no publica estados validados de tickets para este adaptador.",
      },
      {
        capability: "read-activity",
        available: true,
        limitation:
          "Solo metadatos incrementales de session/message o session_v2/session_message.",
      },
      {
        capability: "read-messages",
        available: false,
        limitation:
          "El formato de contenido no garantiza excluir pensamiento, herramientas y secretos.",
      },
      {
        capability: "dispatch",
        available: false,
        limitation: "Este adaptador es de solo lectura y no despacha trabajo.",
      },
    ],
  });
}

/**
 * Lee actividad posterior al cursor sin seleccionar `data`, `part` ni mensajes.
 *
 * Las dos variantes de esquema se consultan de forma independiente: una
 * instalación que conserva ambas no duplica la identidad de sesión, pero sí
 * puede reportar sus filas de actividad como hechos distintos y ordenables.
 */
export function readOpenCodeChanges(
  source: OpenCodeReadSource,
  options: { readonly cursor?: OpenCodeReadCursor; readonly limit?: number } = {},
): OpenCodeChanges {
  const cursor = normalizeCursor(options.cursor);
  const limit = pageLimit(options.limit);
  const path = openCodeDbPath(source);
  if (!existsSync(path)) return emptyChanges("unavailable", cursor);

  const DatabaseSync = loadSqlite();
  if (DatabaseSync === null) return emptyChanges("unavailable", cursor);

  let db: Database | null = null;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    const legacy = readSchema(db, source, cursor, limit, "legacy");
    const v2 = readSchema(db, source, cursor, limit, "v2");
    if (legacy === null && v2 === null) return emptyChanges("incompatible", cursor);

    const activities = [...(legacy ?? []), ...(v2 ?? [])]
      .sort(compareActivity)
      .slice(0, limit);
    const last = activities.at(-1);
    return Object.freeze({
      status: "available",
      cursor: Object.freeze({
        activityAt: last?.activityAt ?? cursor.activityAt,
        activityId: last?.activityId ?? cursor.activityId,
      }),
      activities: Object.freeze(activities),
    });
  } catch {
    return emptyChanges("incompatible", cursor);
  } finally {
    db?.close();
  }
}

interface ActivityRow {
  readonly activity_id: string;
  readonly activity_at: number | null;
  readonly session_id: string;
  readonly agent: string | null;
  readonly model: string | null;
}

function readSchema(
  db: Database,
  source: OpenCodeReadSource,
  cursor: OpenCodeReadCursor,
  limit: number,
  schema: OpenCodeObservedActivity["schema"],
): OpenCodeObservedActivity[] | null {
  const tables =
    schema === "legacy"
      ? { session: "session", message: "message", prefix: "legacy" }
      : { session: "session_v2", message: "session_message", prefix: "v2" };
  try {
    const rows = db
      .prepare(
        "SELECT * FROM (" +
          `SELECT s.time_created AS activity_at, '${tables.prefix}:session:' || s.id AS activity_id, ` +
          "s.id AS session_id, s.agent AS agent, s.model AS model " +
          `FROM ${tables.session} s WHERE ${directoryCondition("s.directory")} ` +
          "UNION ALL " +
          `SELECT m.time_created AS activity_at, '${tables.prefix}:message:' || m.id AS activity_id, ` +
          "s.id AS session_id, s.agent AS agent, s.model AS model " +
          `FROM ${tables.message} m JOIN ${tables.session} s ON s.id = m.session_id ` +
          `WHERE ${directoryCondition("s.directory")}` +
          ") WHERE activity_at > ? OR (activity_at = ? AND activity_id > ?) " +
          "ORDER BY activity_at ASC, activity_id ASC LIMIT ?",
      )
      .all(
        source.root,
        source.root,
        childDirectoryPrefix(source.root),
        source.root,
        source.root,
        childDirectoryPrefix(source.root),
        cursor.activityAt,
        cursor.activityAt,
        cursor.activityId,
        limit,
      ) as unknown as ActivityRow[];
    return rows.flatMap((row) => toObservedActivity(source, row, schema));
  } catch {
    return null;
  }
}

/** Igualdad de raíz o descendiente, sin que `/proyecto-a` incluya `/proyecto-ab`. */
function directoryCondition(column: string): string {
  return `(${column} = ? OR substr(${column}, 1, length(?)) = ?)`;
}

function childDirectoryPrefix(root: string): string {
  return root.endsWith("/") ? root : `${root}/`;
}

function toObservedActivity(
  source: OpenCodeReadSource,
  row: ActivityRow,
  schema: OpenCodeObservedActivity["schema"],
): OpenCodeObservedActivity[] {
  if (typeof row.activity_id !== "string" || typeof row.session_id !== "string") return [];
  try {
    return [
      Object.freeze({
        reference: openCodeSessionReference(source, row.session_id),
        activityAt: finite(row.activity_at),
        activityId: row.activity_id,
        agent: typeof row.agent === "string" ? row.agent : "",
        model: typeof row.model === "string" ? row.model : "",
        schema,
      }),
    ];
  } catch {
    return [];
  }
}

function emptyChanges(
  status: OpenCodeReadStatus,
  cursor: OpenCodeReadCursor,
): OpenCodeChanges {
  return Object.freeze({ status, cursor, activities: Object.freeze([]) });
}

function normalizeCursor(cursor: OpenCodeReadCursor | undefined): OpenCodeReadCursor {
  if (cursor === undefined) return Object.freeze({ activityAt: 0, activityId: "" });
  if (!Number.isFinite(cursor.activityAt) || cursor.activityAt < 0) {
    throw new Error("activityAt debe ser un número mayor o igual que cero.");
  }
  if (typeof cursor.activityId !== "string") {
    throw new Error("activityId debe ser texto.");
  }
  return Object.freeze({ activityAt: cursor.activityAt, activityId: cursor.activityId });
}

function pageLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new Error(`limit debe ser un entero entre 1 y ${MAX_PAGE_SIZE}.`);
  }
  return value;
}

function compareActivity(
  left: OpenCodeObservedActivity,
  right: OpenCodeObservedActivity,
): number {
  return (
    left.activityAt - right.activityAt || left.activityId.localeCompare(right.activityId)
  );
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
