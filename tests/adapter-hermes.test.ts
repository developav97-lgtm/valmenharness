/**
 * El lector incremental y estrictamente de solo lectura de Hermes.
 *
 * No usa una base personal: cada caso planta el mínimo del esquema observado en
 * un directorio temporal. Así se prueban cursores, perfiles y columnas visibles
 * sin abrir ni modificar la instalación real de Hermes.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createHermesReadSource,
  hermesAdapterCapabilities,
  hermesBoardDbPath,
  hermesSessionReference,
  hermesStateDbPath,
  readHermesChanges,
  readHermesVisibleMessages,
} from "../packages/adapter/src/hermes.js";

const PROFILE = "valmen-harness";
const T0 = 1_791_000_000;

interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...values: unknown[]): void;
  };
  close(): void;
}

const require = createRequire(import.meta.url);

function sqlite(): { DatabaseSync: new (path: string) => SqliteDb } | null {
  try {
    return require("node:sqlite") as { DatabaseSync: new (path: string) => SqliteDb };
  } catch {
    return null;
  }
}

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-adapter-hermes-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

function source() {
  return createHermesReadSource({ home: lab, profile: PROFILE });
}

function hash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function plantState(options: { readonly messages?: boolean } = {}): SqliteDb {
  const module = sqlite();
  if (module === null) throw new Error("node:sqlite no está disponible.");
  const path = hermesStateDbPath(source());
  mkdirSync(join(lab, ".hermes", "profiles", PROFILE), { recursive: true });
  const db = new module.DatabaseSync(path);
  db.exec(`
    CREATE TABLE sessions (
      id text primary key,
      model text,
      billing_provider text,
      last_activity_at real,
      started_at real
    );
  `);
  if (options.messages === true) {
    // Deliberadamente no existen columnas de razonamiento ni de herramientas.
    // El lector de cambios debe funcionar sin ellas y el de mensajes no puede
    // depender de datos privados que el contrato excluye.
    db.exec(`
      CREATE TABLE messages (
        id integer primary key,
        session_id text,
        role text,
        content text,
        timestamp real
      );
    `);
  }
  return db;
}

function plantBoard(): SqliteDb {
  const module = sqlite();
  if (module === null) throw new Error("node:sqlite no está disponible.");
  const path = hermesBoardDbPath(source());
  mkdirSync(join(lab, ".hermes", "kanban", "boards", PROFILE), { recursive: true });
  const db = new module.DatabaseSync(path);
  db.exec(`
    CREATE TABLE tasks (id text primary key, session_id text);
    CREATE TABLE task_runs (id integer primary key, status text);
    CREATE TABLE task_events (
      id integer primary key,
      task_id text,
      run_id integer,
      kind text,
      created_at real
    );
  `);
  return db;
}

describe("adaptador Hermes", () => {
  it("declara sus capacidades de solo lectura y nunca despacho", () => {
    const capabilities = hermesAdapterCapabilities();

    expect(capabilities).toEqual({
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
    expect(Object.isFrozen(capabilities)).toBe(true);
    expect(Object.isFrozen(capabilities.capabilities)).toBe(true);
  });

  it("lee solo lo posterior a cada cursor y conserva los empates de sesión", () => {
    const board = plantBoard();
    board
      .prepare("INSERT INTO tasks (id, session_id) VALUES (?, ?)")
      .run("task-1", "origin-1");
    board.prepare("INSERT INTO task_runs (id, status) VALUES (?, ?)").run(10, "running");
    const insertEvent = board.prepare(
      "INSERT INTO task_events (id, task_id, run_id, kind, created_at) VALUES (?, ?, ?, ?, ?)",
    );
    insertEvent.run(1, "task-1", 10, "claimed", T0);
    insertEvent.run(2, "task-1", 10, "heartbeat", T0 + 1);
    insertEvent.run(3, "task-1", 10, "completed", T0 + 2);
    board.close();

    const state = plantState();
    const insertSession = state.prepare(
      "INSERT INTO sessions (id, model, billing_provider, last_activity_at, started_at) VALUES (?, ?, ?, ?, ?)",
    );
    insertSession.run("worker-a", "gpt-6.1-sol", "codex", T0, T0);
    insertSession.run("worker-b", "gpt-6.1-sol", "codex", T0, T0);
    insertSession.run("worker-c", "gpt-6.1-sol", "codex", T0 + 1, T0);
    state.close();

    const beforeBoard = hash(hermesBoardDbPath(source()));
    const beforeState = hash(hermesStateDbPath(source()));
    const first = readHermesChanges(source(), { limit: 2 });

    expect(first.board.status).toBe("available");
    expect(
      first.board.events.map((event) => [event.id, event.kind, event.runStatus]),
    ).toEqual([
      [1, "claimed", "running"],
      [2, "heartbeat", "running"],
    ]);
    expect(first.board.events[0]?.originSessionId).toBe("origin-1");
    expect(first.board.events[0]).not.toHaveProperty("executorSessionId");
    expect(first.sessions.status).toBe("available");
    expect(first.sessions.sessions.map((session) => session.reference)).toEqual([
      { adapter: "hermes", scope: PROFILE, sessionId: "worker-a" },
      { adapter: "hermes", scope: PROFILE, sessionId: "worker-b" },
    ]);
    expect(hash(hermesBoardDbPath(source()))).toBe(beforeBoard);
    expect(hash(hermesStateDbPath(source()))).toBe(beforeState);

    const second = readHermesChanges(source(), { cursor: first.cursor, limit: 2 });
    expect(second.board.events.map((event) => event.id)).toEqual([3]);
    expect(second.sessions.sessions.map((session) => session.reference.sessionId)).toEqual([
      "worker-c",
    ]);
  });

  it("no abre messages al refrescar y los pagina solo por una referencia del mismo perfil", () => {
    const state = plantState();
    state
      .prepare(
        "INSERT INTO sessions (id, model, billing_provider, last_activity_at, started_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("worker-1", "gpt-6.1-sol", "codex", T0, T0);
    state.close();

    // La tabla messages no existe: el refresco sigue siendo válido porque no la
    // consulta. Una base ausente de board se declara por separado, no como cero.
    const changes = readHermesChanges(source());
    expect(changes.sessions.status).toBe("available");
    expect(changes.sessions.sessions).toHaveLength(1);
    expect(changes.board.status).toBe("unavailable");

    // Se recrea el laboratorio para sembrar la página completa en un caso aislado.
    rmSync(lab, { recursive: true, force: true });
    lab = mkdtempSync(join(tmpdir(), "valmen-adapter-hermes-"));
    const pageState = plantState({ messages: true });
    pageState
      .prepare(
        "INSERT INTO sessions (id, model, billing_provider, last_activity_at, started_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("worker-1", "gpt-6.1-sol", "codex", T0, T0);
    const insertMessage = pageState.prepare(
      "INSERT INTO messages (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)",
    );
    insertMessage.run(1, "worker-1", "user", "Solicitud visible", T0);
    insertMessage.run(2, "worker-1", "tool", "Resultado interno", T0 + 1);
    insertMessage.run(3, "worker-1", "assistant", "Respuesta visible", T0 + 2);
    pageState.close();

    const reference = hermesSessionReference(source(), "worker-1");
    const first = readHermesVisibleMessages(source(), reference, { limit: 1 });
    expect(first.messages).toEqual([
      { id: 1, role: "user", content: "Solicitud visible", timestamp: T0 },
    ]);
    const second = readHermesVisibleMessages(source(), reference, {
      afterId: first.nextCursor,
      limit: 10,
    });
    expect(second.messages).toEqual([
      { id: 3, role: "assistant", content: "Respuesta visible", timestamp: T0 + 2 },
    ]);
    expect(() =>
      readHermesVisibleMessages(source(), {
        adapter: "hermes",
        scope: "otro",
        sessionId: "worker-1",
      }),
    ).toThrow("perfil");
    expect(() =>
      readHermesVisibleMessages(source(), {
        adapter: "hermes",
        scope: PROFILE,
        sessionId: "../worker-1",
      }),
    ).toThrow("sessionId");
  });

  it("declara esquema incompatible y exige un perfil portable explícito", () => {
    expect(createHermesReadSource({ home: lab, profile: "Perfil_1" }).profile).toBe(
      "Perfil_1",
    );
    expect(() =>
      createHermesReadSource({ home: lab, profile: "Perfil con espacio" }),
    ).toThrow("perfil");

    const board = plantBoard();
    board.exec("DROP TABLE task_events;");
    board.close();
    const state = plantState();
    state.exec("DROP TABLE sessions;");
    state.close();

    const changes = readHermesChanges(source());
    expect(changes.board.status).toBe("incompatible");
    expect(changes.sessions.status).toBe("incompatible");
  });
});
