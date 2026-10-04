import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createExecutionIdentity } from "../packages/core/src/index.js";
import { appendExecutionEvent, resolveAuthorizedProject } from "../packages/engine/src/index.js";
import { readSourceFreshness } from "../packages/server/src/source-freshness.js";

let home: string;
let root: string;
const projectId = "valmen-harness";

beforeEach(() => {
  home = join(tmpdir(), `valmen-frescura-${Date.now()}-${Math.random()}`);
  root = join(home, "harness");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(home, ".valmen", "bindings.local.yaml"), `schema-version: 1\nmachine-id: qa\nprojects:\n  ${projectId}:\n    root: ${root}\n    hermes-profile: qa\n`);
  writeFileSync(join(root, ".valmen", "config.yaml"), `project-id: ${projectId}\nexecution:\n  observation-sources:\n    - hermes\n    - opencode\n`);
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function project() { return resolveAuthorizedProject({ projectId, home }); }
function reader(status: "available" | "unavailable" | "incompatible") {
  return () => ({ cursor: { taskEventId: 0, sessionActivityAt: 0, sessionId: "" }, board: { status, events: [] }, sessions: { status, sessions: [] } });
}

describe("frescura por fuente", () => {
  it("separa una lectura Hermes actualizada de una fuente sin lector integrado", () => {
    const sources = readSourceFreshness(project(), { now: new Date("2026-10-04T10:00:00.000Z"), readHermes: reader("available") });
    expect(sources).toEqual([
      { source: "hermes", state: "fresh", checkedAt: "2026-10-04T10:00:00.000Z", lastReceivedAt: null, reason: null },
      expect.objectContaining({ source: "opencode", state: "unavailable", reason: expect.stringContaining("lector integrado") }),
    ]);
  });

  it("conserva el último dato Hermes al declarar que la fuente quedó inaccesible", () => {
    const identity = createExecutionIdentity({ projectId, ticketId: "FEATURE-MC-FRESCURA-FUENTES-20261001", executionId: "exec-01" });
    appendExecutionEvent(project(), { eventId: "evt-hermes", identity, attemptId: "try-01", kind: "phase.changed", source: "hermes", occurredAt: "2026-10-04T09:00:00.000Z" }, { receivedAt: "2026-10-04T09:01:00.000Z" });
    expect(readSourceFreshness(project(), { now: new Date("2026-10-04T10:00:00.000Z"), readHermes: reader("unavailable") })[0]).toEqual({
      source: "hermes", state: "stale", checkedAt: "2026-10-04T10:00:00.000Z", lastReceivedAt: "2026-10-04T09:01:00.000Z", reason: "Hermes no está disponible para esta lectura.",
    });
  });
});
