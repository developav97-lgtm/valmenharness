import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createExecutionIdentity } from "../packages/core/src/execution-identity.js";
import {
  createJourney,
  createJourneyWindow,
  evaluateJourneyWindow,
  readExecutionActivity,
  readJourneys,
  recordExecutionActivity,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";

let home: string;
let root: string;

beforeEach(() => {
  home = join(tmpdir(), `valmen-window-${Date.now()}-${Math.random()}`);
  root = join(home, "harness");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(root, ".valmen", "config.yaml"), "project-id: valmen-harness\n", "utf8");
  writeFileSync(join(home, ".valmen", "bindings.local.yaml"), ["schema-version: 1", "machine-id: qa-mac", "projects:", "  valmen-harness:", `    root: ${root}`].join("\n"), "utf8");
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function project() { return resolveAuthorizedProject({ projectId: "valmen-harness", home }); }
const window = { windowId: "night-window", startsAt: "2026-10-04T04:00:00.000Z", endsAt: "2026-10-04T08:00:00.000Z", timeZone: "America/Bogota" };

describe("ventanas de jornada", () => {
  it("permite iniciar solo durante la ventana, incluso cuando cruza medianoche local", () => {
    expect(evaluateJourneyWindow(window, "2026-10-04T03:59:59.000Z")).toMatchObject({ state: "upcoming", allowsNewDispatch: false });
    expect(evaluateJourneyWindow(window, "2026-10-04T06:00:00.000Z")).toMatchObject({ state: "open", allowsNewDispatch: true });
    expect(evaluateJourneyWindow(window, "2026-10-04T08:00:00.000Z")).toMatchObject({ state: "closed", allowsNewDispatch: false });
  });

  it("al cerrar no ordena detener el intento activo", () => {
    const identity = createExecutionIdentity({ projectId: "valmen-harness", ticketId: "FEATURE-WINDOW-ACTIVE-20261003", executionId: "execution-01" });
    recordExecutionActivity(project(), { eventId: "active-01", identity, attemptId: "attempt-01", state: "active", source: "test", occurredAt: "2026-10-04T07:59:00.000Z" });

    expect(evaluateJourneyWindow(window, "2026-10-04T08:00:00.000Z")).toEqual({ state: "closed", allowsNewDispatch: false, interruptsActiveWork: false });
    expect(readExecutionActivity(project(), identity).map((item) => item.state)).toEqual(["active"]);
  });

  it("conserva la compatibilidad de una revisión previa sin ventanas", () => {
    createJourney(project(), {
      revisionId: "revision-01", journeyId: "old-journey", occurredAt: "2026-10-03T12:00:00.000Z",
      tickets: [{ ticketId: "FEATURE-WINDOW-OLD-20261003", order: 1, priority: 1, dependsOn: [], start: { condition: "manual" }, authorizationIds: [] }],
    });
    expect(readJourneys(project())[0]?.windows).toEqual([]);
  });

  it("rechaza límites y zonas inválidas", () => {
    expect(() => createJourneyWindow({ ...window, endsAt: window.startsAt })).toThrow("posterior");
    expect(() => createJourneyWindow({ ...window, timeZone: "No/Existe" })).toThrow("IANA");
  });
});
