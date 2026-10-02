import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createExecutionIdentity } from "../packages/core/src/execution-identity.js";
import {
  appendExecutionEvent,
  executionEventsPath,
  readExecutionEvents,
  replayExecutionEvents,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";

const ticketId = "FEATURE-ENGINE-EVENTOS-PERSISTIDOS-20261001";
let home: string;
let root: string;

beforeEach(() => {
  home = join(tmpdir(), `valmen-events-${Date.now()}-${Math.random()}`);
  root = join(home, "harness");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(root, ".valmen", "config.yaml"), "project-id: valmen-harness\n", "utf8");
  writeFileSync(join(home, ".valmen", "bindings.local.yaml"), [
    "schema-version: 1",
    "machine-id: qa-mac",
    "projects:",
    `  valmen-harness:`,
    `    root: ${root}`,
  ].join("\n"), "utf8");
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function project() {
  return resolveAuthorizedProject({ projectId: "valmen-harness", home });
}
function event(eventId: string, overrides: Partial<Parameters<typeof appendExecutionEvent>[1]> = {}) {
  return {
    eventId,
    identity: createExecutionIdentity({ projectId: "valmen-harness", ticketId, executionId: "exec-01" }),
    attemptId: "attempt-01",
    kind: "phase.changed",
    source: "hermes",
    occurredAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("eventos persistidos de ejecución", () => {
  it("reconcilia un reenvío sin duplicarlo y conserva el cursor recibido", () => {
    const first = appendExecutionEvent(project(), event("evt-01"), { receivedAt: "2026-10-01T10:01:00.000Z" });
    const resent = appendExecutionEvent(project(), event("evt-01"), { receivedAt: "2026-10-01T10:05:00.000Z" });

    expect(first).toMatchObject({ appended: true, event: { cursor: 1, receivedAt: "2026-10-01T10:01:00.000Z" } });
    expect(resent).toEqual({ appended: false, event: first.event });
    expect(readExecutionEvents(project())).toEqual([first.event]);
  });

  it("rechaza un identificador repetido cuyo contenido cambió sin escribir otra línea", () => {
    appendExecutionEvent(project(), event("evt-01"));
    expect(() => appendExecutionEvent(project(), event("evt-01", { kind: "phase.failed" }))).toThrow("contenido distinto");
    expect(readExecutionEvents(project())).toHaveLength(1);
  });

  it("preserva el orden de recepción cuando un evento ocurrió antes pero llegó después", () => {
    appendExecutionEvent(project(), event("evt-new", { occurredAt: "2026-10-01T11:00:00.000Z" }));
    appendExecutionEvent(project(), event("evt-late", { occurredAt: "2026-10-01T09:00:00.000Z" }));

    expect(readExecutionEvents(project()).map(({ eventId, cursor }) => [eventId, cursor])).toEqual([
      ["evt-new", 1], ["evt-late", 2],
    ]);
  });

  it("reconstruye por ejecución desde disco sin confundir tickets ni ejecuciones", () => {
    appendExecutionEvent(project(), event("evt-01"));
    appendExecutionEvent(project(), event("evt-02", {
      identity: createExecutionIdentity({ projectId: "valmen-harness", ticketId: "FEATURE-ENGINE-RESOLUCION-PROYECTO-20261001", executionId: "exec-02" }),
      attemptId: "attempt-02",
    }));

    const replay = replayExecutionEvents(project());
    expect(replay).toHaveLength(2);
    expect(replay.map((group) => [group.identity.executionId, group.events.map((item) => item.eventId)])).toEqual([
      ["exec-01", ["evt-01"]], ["exec-02", ["evt-02"]],
    ]);
    expect(executionEventsPath(project())).toContain(".valmen/executions/events.jsonl");
  });

  it("no acepta una identidad que no pertenezca al proyecto autorizado", () => {
    expect(() => appendExecutionEvent(project(), event("evt-01", {
      identity: createExecutionIdentity({ projectId: "saiopencloud", ticketId, executionId: "exec-01" }),
    }))).toThrow("no pertenece al proyecto autorizado");
  });
});
