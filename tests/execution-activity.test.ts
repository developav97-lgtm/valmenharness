import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createExecutionIdentity } from "../packages/core/src/execution-identity.js";
import {
  readExecutionActivity,
  recordExecutionActivity,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";

const ticketId = "FEATURE-ENGINE-ACTIVIDAD-SIN-GATES-20261001";
let home: string;
let root: string;

beforeEach(() => {
  home = join(tmpdir(), `valmen-activity-${Date.now()}-${Math.random()}`);
  root = join(home, "harness");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(root, ".valmen", "config.yaml"), "project-id: valmen-harness\n", "utf8");
  writeFileSync(join(home, ".valmen", "bindings.local.yaml"), [
    "schema-version: 1",
    "machine-id: qa-mac",
    "projects:",
    "  valmen-harness:",
    `    root: ${root}`,
  ].join("\n"), "utf8");
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function project() {
  return resolveAuthorizedProject({ projectId: "valmen-harness", home });
}
function identity(executionId = "exec-01") {
  return createExecutionIdentity({ projectId: "valmen-harness", ticketId, executionId });
}
function activity(eventId: string, state: "started" | "active" | "waiting" | "finished" | "failed", attemptId = "attempt-01") {
  return {
    eventId,
    identity: identity(),
    attemptId,
    state,
    source: "cli",
    occurredAt: "2026-10-01T10:00:00.000Z",
  };
}

describe("actividad de ejecución sin gates", () => {
  it("registra inicio, espera y fin de un intento en el historial de actividad", () => {
    recordExecutionActivity(project(), activity("act-01", "started"));
    recordExecutionActivity(project(), activity("act-02", "waiting"));
    recordExecutionActivity(project(), activity("act-03", "finished"));

    expect(readExecutionActivity(project(), identity()).map(({ state, cursor }) => [state, cursor])).toEqual([
      ["started", 1], ["waiting", 2], ["finished", 3],
    ]);
  });

  it("aísla reintentos de una misma ejecución", () => {
    recordExecutionActivity(project(), activity("act-01", "started", "attempt-01"));
    recordExecutionActivity(project(), activity("act-02", "failed", "attempt-02"));

    expect(readExecutionActivity(project(), identity(), "attempt-01").map((event) => event.state)).toEqual(["started"]);
    expect(readExecutionActivity(project(), identity(), "attempt-02").map((event) => event.state)).toEqual(["failed"]);
  });

  it("reconcilia un reenvío sin crear otra actividad", () => {
    const first = recordExecutionActivity(project(), activity("act-01", "active"));
    const resent = recordExecutionActivity(project(), activity("act-01", "active"));

    expect(first.appended).toBe(true);
    expect(resent).toEqual({ appended: false, event: first.event });
    expect(readExecutionActivity(project(), identity())).toHaveLength(1);
  });

  it("no crea recibos ni tickets al registrar actividad", () => {
    recordExecutionActivity(project(), activity("act-01", "started"));

    expect(existsSync(join(root, ".valmen", "receipts"))).toBe(false);
    expect(existsSync(join(root, "tickets"))).toBe(false);
  });

  it("rechaza estados fuera del vocabulario de actividad", () => {
    expect(() => recordExecutionActivity(project(), {
      ...activity("act-01", "started"),
      state: "qa_approved" as "started",
    })).toThrow("state debe ser uno de");
  });
});
