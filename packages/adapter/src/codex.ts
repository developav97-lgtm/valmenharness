/**
 * Lector incremental de sesiones Codex por proyecto autorizado.
 *
 * Codex guarda conversaciones JSONL que pueden contener instrucciones y datos
 * privados. Para actividad basta con el `stat` del archivo y su encabezado: no
 * se parsea el historial ni se publica texto de conversación.
 */
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";

import { createSessionReference, PROJECT_ID_RE, type SessionReference } from "@valmen/core";

import { createAdapterCapabilities, type AdapterCapabilities } from "./capabilities.js";

const DEFAULT_DAYS = 60;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;
const HEADER_BYTES = 4096;

export interface CodexReadSource {
  readonly projectId: string;
  readonly root: string;
  readonly home: string;
}

export interface CodexReadCursor {
  readonly modifiedAt: number;
  readonly relativePath: string;
}

export type CodexReadStatus = "available" | "unavailable" | "incompatible";

export interface CodexObservedActivity {
  readonly reference: SessionReference;
  readonly activityAt: number;
  readonly relativePath: string;
  readonly startedAt: number;
}

export interface CodexChanges {
  readonly status: CodexReadStatus;
  readonly cursor: CodexReadCursor;
  readonly activities: readonly CodexObservedActivity[];
}

export function createCodexReadSource(input: {
  readonly projectId: string;
  readonly root: string;
  readonly home?: string;
}): CodexReadSource {
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

export function codexSessionsPath(source: CodexReadSource): string {
  return join(source.home, ".codex", "sessions");
}

export function codexSessionReference(
  source: CodexReadSource,
  sessionId: string,
): SessionReference {
  return createSessionReference({ adapter: "codex", scope: source.projectId, sessionId });
}

export function codexAdapterCapabilities(): AdapterCapabilities {
  return createAdapterCapabilities({
    adapter: "codex",
    capabilities: [
      {
        capability: "observe-states",
        available: false,
        limitation: "Codex no publica estados validados de tickets para este adaptador.",
      },
      {
        capability: "read-activity",
        available: true,
        limitation:
          "Solo marca de modificación y metadatos del encabezado de sesiones recientes.",
      },
      {
        capability: "read-messages",
        available: false,
        limitation:
          "El JSONL puede contener instrucciones y razonamiento que este lector no expone.",
      },
      {
        capability: "dispatch",
        available: false,
        limitation: "Este adaptador es de solo lectura y no despacha trabajo.",
      },
    ],
  });
}

/** Lee solo candidatos posteriores al cursor, por metadatos y encabezado fijo. */
export function readCodexChanges(
  source: CodexReadSource,
  options: {
    readonly cursor?: CodexReadCursor;
    readonly limit?: number;
    readonly days?: number;
    readonly now?: Date;
  } = {},
): CodexChanges {
  const cursor = normalizeCursor(options.cursor);
  const limit = pageLimit(options.limit);
  const base = codexSessionsPath(source);
  if (!existsSync(base)) return emptyChanges("unavailable", cursor);

  let incompatible = false;
  const candidates = recentFiles(base, options.days ?? DEFAULT_DAYS, options.now)
    .flatMap((path) => {
      try {
        const modifiedAt = statSync(path).mtimeMs;
        const relativePath = relative(base, path);
        if (!afterCursor(modifiedAt, relativePath, cursor)) return [];
        return [{ path, modifiedAt, relativePath }];
      } catch {
        incompatible = true;
        return [];
      }
    })
    .sort(
      (left, right) =>
        left.modifiedAt - right.modifiedAt ||
        left.relativePath.localeCompare(right.relativePath),
    )
    .slice(0, limit);

  const activities = candidates.flatMap((candidate) => {
    const header = sessionHeader(candidate.path);
    if (header === null) {
      incompatible = true;
      return [];
    }
    if (header.cwd !== source.root) return [];
    try {
      return [
        Object.freeze({
          reference: codexSessionReference(source, header.id),
          activityAt: candidate.modifiedAt,
          relativePath: candidate.relativePath,
          startedAt: header.startedAt,
        }),
      ];
    } catch {
      incompatible = true;
      return [];
    }
  });
  // La frontera avanza sobre todo candidato ya inspeccionado, incluso si era de
  // otro proyecto o tenía un encabezado incompatible. De lo contrario, un JSONL
  // ajeno ordenado antes que el propio se releería en cada refresco y podría
  // impedir llegar a los siguientes dentro de la página acotada.
  const last = candidates.at(-1);
  return Object.freeze({
    status: incompatible && activities.length === 0 ? "incompatible" : "available",
    cursor: Object.freeze({
      modifiedAt: last?.modifiedAt ?? cursor.modifiedAt,
      relativePath: last?.relativePath ?? cursor.relativePath,
    }),
    activities: Object.freeze(activities),
  });
}

interface SessionHeader {
  readonly id: string;
  readonly cwd: string;
  readonly startedAt: number;
}

function recentFiles(base: string, days: number, now: Date = new Date()): string[] {
  if (!Number.isInteger(days) || days < 0 || days > 366) {
    throw new Error("days debe ser un entero entre 0 y 366.");
  }
  const paths: string[] = [];
  for (let ago = -1; ago <= days; ago += 1) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - ago);
    const directory = join(
      base,
      String(date.getUTCFullYear()),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0"),
    );
    let names: string[];
    try {
      names = readdirSync(directory);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name.endsWith(".jsonl")) paths.push(join(directory, name));
    }
  }
  return paths;
}

function sessionHeader(path: string): SessionHeader | null {
  let descriptor: number;
  try {
    descriptor = openSync(path, "r");
  } catch {
    return null;
  }
  let text: string;
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    const read = readSync(descriptor, buffer, 0, buffer.length, 0);
    text = buffer.subarray(0, read).toString("utf8");
  } catch {
    return null;
  } finally {
    closeSync(descriptor);
  }
  const id = /"id"\s*:\s*"([^"\\]+)"/.exec(text)?.[1];
  const cwd = /"cwd"\s*:\s*"([^"\\]+)"/.exec(text)?.[1];
  const timestamp = /"timestamp"\s*:\s*"([^"\\]+)"/.exec(text)?.[1];
  if (id === undefined || cwd === undefined) return null;
  return { id, cwd, startedAt: timestamp === undefined ? 0 : Date.parse(timestamp) || 0 };
}

function afterCursor(
  modifiedAt: number,
  relativePath: string,
  cursor: CodexReadCursor,
): boolean {
  return (
    modifiedAt > cursor.modifiedAt ||
    (modifiedAt === cursor.modifiedAt && relativePath > cursor.relativePath)
  );
}

function normalizeCursor(cursor: CodexReadCursor | undefined): CodexReadCursor {
  if (cursor === undefined) return Object.freeze({ modifiedAt: 0, relativePath: "" });
  if (!Number.isFinite(cursor.modifiedAt) || cursor.modifiedAt < 0) {
    throw new Error("modifiedAt debe ser un número mayor o igual que cero.");
  }
  if (typeof cursor.relativePath !== "string") {
    throw new Error("relativePath debe ser texto.");
  }
  return Object.freeze({
    modifiedAt: cursor.modifiedAt,
    relativePath: cursor.relativePath,
  });
}

function pageLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new Error(`limit debe ser un entero entre 1 y ${MAX_PAGE_SIZE}.`);
  }
  return value;
}

function emptyChanges(status: CodexReadStatus, cursor: CodexReadCursor): CodexChanges {
  return Object.freeze({ status, cursor, activities: Object.freeze([]) });
}
