/** Lectores OpenCode/Codex: actividad acotada, portable y sin conversación. */
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  codexAdapterCapabilities,
  codexSessionReference,
  createCodexReadSource,
  createOpenCodeReadSource,
  openCodeAdapterCapabilities,
  openCodeDbPath,
  openCodeSessionReference,
  readCodexChanges,
  readOpenCodeChanges,
} from "../packages/adapter/src/index.js";

interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): { run(...values: unknown[]): void };
  close(): void;
}

const require = createRequire(import.meta.url);
const NOW = new Date("2026-10-03T12:00:00.000Z");
const ROOT = "/proyecto-autorizado";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-adapter-sessions-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

function sqlite(): { DatabaseSync: new (path: string) => SqliteDb } {
  return require("node:sqlite") as { DatabaseSync: new (path: string) => SqliteDb };
}

function openCodeSource() {
  return createOpenCodeReadSource({ home: lab, projectId: "proyecto-prueba", root: ROOT });
}

function codexSource() {
  return createCodexReadSource({ home: lab, projectId: "proyecto-prueba", root: ROOT });
}

function hash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function plantOpenCode(schema: "legacy" | "v2"): SqliteDb {
  const path = openCodeDbPath(openCodeSource());
  mkdirSync(join(lab, ".local", "share", "opencode"), { recursive: true });
  const db = new (sqlite().DatabaseSync)(path);
  if (schema === "legacy") {
    db.exec(`
      CREATE TABLE session (id text primary key, directory text, agent text, model text, time_created integer);
      CREATE TABLE message (id text primary key, session_id text, time_created integer, data text);
    `);
  } else {
    db.exec(`
      CREATE TABLE session_v2 (id text primary key, directory text, agent text, model text, time_created integer);
      CREATE TABLE session_message (id text primary key, session_id text, type text, data text, time_created integer);
    `);
  }
  return db;
}

function writeCodexSession(options: {
  readonly file: string;
  readonly id: string;
  readonly cwd: string;
  readonly modifiedAt: Date;
}): void {
  const folder = join(lab, ".codex", "sessions", "2026", "10", "03");
  mkdirSync(folder, { recursive: true });
  const path = join(folder, options.file);
  const header = JSON.stringify({
    type: "session_meta",
    payload: {
      id: options.id,
      cwd: options.cwd,
      timestamp: "2026-10-03T10:00:00.000Z",
      base_instructions: { text: "privado".repeat(20_000) },
    },
  });
  // La segunda línea no es JSON a propósito: el lector solo necesita el
  // encabezado, así que un historial posterior arbitrario no puede afectarlo.
  writeFileSync(path, `${header}\n{esto no se debe parsear como conversación}\n`, "utf8");
  utimesSync(path, options.modifiedAt, options.modifiedAt);
}

describe("adaptadores OpenCode y Codex", () => {
  it("declaran actividad y hacen explícitos estados, mensajes y despacho ausentes", () => {
    expect(openCodeAdapterCapabilities()).toEqual({
      adapter: "opencode",
      capabilities: [
        expect.objectContaining({ capability: "observe-states", available: false }),
        expect.objectContaining({ capability: "read-activity", available: true }),
        expect.objectContaining({ capability: "read-messages", available: false }),
        expect.objectContaining({ capability: "dispatch", available: false }),
      ],
    });
    expect(codexAdapterCapabilities()).toEqual({
      adapter: "codex",
      capabilities: [
        expect.objectContaining({ capability: "observe-states", available: false }),
        expect.objectContaining({ capability: "read-activity", available: true }),
        expect.objectContaining({ capability: "read-messages", available: false }),
        expect.objectContaining({ capability: "dispatch", available: false }),
      ],
    });
    expect(Object.isFrozen(openCodeAdapterCapabilities())).toBe(true);
    expect(Object.isFrozen(codexAdapterCapabilities().capabilities)).toBe(true);
  });

  it("lee OpenCode v2 por cursor sin seleccionar contenido ni escribir la base", () => {
    const db = plantOpenCode("v2");
    db.prepare("INSERT INTO session_v2 VALUES (?, ?, ?, ?, ?)").run(
      "sesion-a",
      ROOT,
      "build",
      "opencode-go/modelo-a",
      100,
    );
    db.prepare("INSERT INTO session_v2 VALUES (?, ?, ?, ?, ?)").run(
      "sesion-ajena",
      `${ROOT}-otro`,
      "build",
      "modelo-ajeno",
      100,
    );
    db.prepare("INSERT INTO session_message VALUES (?, ?, ?, ?, ?)").run(
      "m-a",
      "sesion-a",
      "assistant",
      '{"reasoning":"privado","content":"no debe salir"}',
      101,
    );
    db.prepare("INSERT INTO session_message VALUES (?, ?, ?, ?, ?)").run(
      "m-b",
      "sesion-a",
      "assistant",
      '{"tool":"resultado privado"}',
      101,
    );
    db.close();

    const before = hash(openCodeDbPath(openCodeSource()));
    const first = readOpenCodeChanges(openCodeSource(), { limit: 2 });
    expect(first.status).toBe("available");
    expect(first.activities.map((activity) => activity.activityId)).toEqual([
      "v2:session:sesion-a",
      "v2:message:m-a",
    ]);
    expect(first.activities[0]?.reference).toEqual({
      adapter: "opencode",
      scope: "proyecto-prueba",
      sessionId: "sesion-a",
    });
    expect(first.activities[1]).not.toHaveProperty("data");
    expect(first.activities[1]).not.toHaveProperty("content");
    expect(hash(openCodeDbPath(openCodeSource()))).toBe(before);

    const second = readOpenCodeChanges(openCodeSource(), { cursor: first.cursor });
    expect(second.activities.map((activity) => activity.activityId)).toEqual([
      "v2:message:m-b",
    ]);
  });

  it("reconoce el esquema OpenCode heredado e informa ausencia o incompatibilidad", () => {
    expect(readOpenCodeChanges(openCodeSource()).status).toBe("unavailable");

    const db = plantOpenCode("legacy");
    db.prepare("INSERT INTO session VALUES (?, ?, ?, ?, ?)").run(
      "sesion-legacy",
      ROOT,
      "plan",
      "modelo-legacy",
      10,
    );
    db.prepare("INSERT INTO message VALUES (?, ?, ?, ?)").run(
      "mensaje-legacy",
      "sesion-legacy",
      11,
      '{"texto":"no se publica"}',
    );
    db.close();
    expect(
      readOpenCodeChanges(openCodeSource()).activities.map((item) => item.activityId),
    ).toEqual(["legacy:session:sesion-legacy", "legacy:message:mensaje-legacy"]);

    rmSync(openCodeDbPath(openCodeSource()));
    mkdirSync(join(lab, ".local", "share", "opencode"), { recursive: true });
    writeFileSync(openCodeDbPath(openCodeSource()), "no es sqlite", "utf8");
    expect(readOpenCodeChanges(openCodeSource()).status).toBe("incompatible");
  });

  it("lee Codex por mtime y encabezado sin cargar el JSONL completo", () => {
    expect(readCodexChanges(codexSource(), { now: NOW }).status).toBe("unavailable");

    const firstDate = new Date("2026-10-03T10:01:00.000Z");
    writeCodexSession({
      file: "rollout-a.jsonl",
      id: "codex-a",
      cwd: ROOT,
      modifiedAt: firstDate,
    });
    writeCodexSession({
      file: "rollout-ajena.jsonl",
      id: "codex-ajena",
      cwd: "/otro-proyecto",
      modifiedAt: firstDate,
    });

    const first = readCodexChanges(codexSource(), { limit: 1, now: NOW });
    expect(first.status).toBe("available");
    expect(first.activities).toEqual([
      expect.objectContaining({
        reference: { adapter: "codex", scope: "proyecto-prueba", sessionId: "codex-a" },
        relativePath: "2026/10/03/rollout-a.jsonl",
      }),
    ]);

    writeCodexSession({
      file: "rollout-b.jsonl",
      id: "codex-b",
      cwd: ROOT,
      modifiedAt: new Date("2026-10-03T10:02:00.000Z"),
    });
    const second = readCodexChanges(codexSource(), { cursor: first.cursor, now: NOW });
    expect(second.activities.map((activity) => activity.reference.sessionId)).toEqual([
      "codex-b",
    ]);
    expect(second.activities[0]).not.toHaveProperty("content");
  });

  it("valida fuentes y referencias sin usar rutas como ámbito", () => {
    expect(openCodeSessionReference(openCodeSource(), "sesion-1")).toEqual({
      adapter: "opencode",
      scope: "proyecto-prueba",
      sessionId: "sesion-1",
    });
    expect(codexSessionReference(codexSource(), "sesion-2")).toEqual({
      adapter: "codex",
      scope: "proyecto-prueba",
      sessionId: "sesion-2",
    });
    expect(() =>
      createOpenCodeReadSource({
        home: lab,
        projectId: "Proyecto con espacio",
        root: ROOT,
      }),
    ).toThrow("projectId");
    expect(() =>
      createCodexReadSource({ home: lab, projectId: "proyecto-prueba", root: "" }),
    ).toThrow("root");
  });
});
