import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createExecutionIdentity } from "@valmen/core";
import {
  createExecutionContract,
  createJourney,
  readJourneyRoadmap,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";

let home: string;
let root: string;
const projectId = "valmen-harness";

beforeEach(() => {
  home = join(tmpdir(), `valmen-roadmap-${Date.now()}-${Math.random()}`);
  root = join(home, "harness");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(home, ".valmen", "bindings.local.yaml"), `schema-version: 1\nmachine-id: qa\nprojects:\n  ${projectId}:\n    root: ${root}\n`);
  writeFileSync(join(root, ".valmen", "config.yaml"), `project-id: ${projectId}\nexecution:\n  observation-sources:\n    - hermes\n  dispatch-executors:\n    - hermes\n`);
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function project() {
  return resolveAuthorizedProject({ projectId, home });
}

it("proyecta orden, espera, ventana y último hecho sin conceder despacho", () => {
  const authorized = project();
  createJourney(authorized, {
    revisionId: "rev-01", journeyId: "morning", occurredAt: "2026-10-03T08:00:00.000Z",
    windows: [{ windowId: "am", startsAt: "2026-10-03T08:00:00.000Z", endsAt: "2026-10-03T10:00:00.000Z", timeZone: "America/Bogota" }],
    tickets: [
      { ticketId: "FEATURE-UNO-PRUEBA-20261003", order: 2, priority: 2, dependsOn: ["FEATURE-CERO-PRUEBA-20261003"], start: { condition: "dependencies", scheduledAt: "2026-10-03T08:30:00.000Z" }, windowId: "am", authorizationIds: ["hermes"] },
      { ticketId: "FEATURE-CERO-PRUEBA-20261003", order: 1, priority: 1, dependsOn: [], start: { condition: "manual" }, authorizationIds: [] },
    ],
  }, { receivedAt: "2026-10-03T08:00:01.000Z" });
  createExecutionContract(authorized).recordActivity({
    eventId: "waiting-01", identity: createExecutionIdentity({ projectId, ticketId: "FEATURE-UNO-PRUEBA-20261003", executionId: "run-01" }),
    attemptId: "attempt-01", state: "waiting", source: "test", occurredAt: "2026-10-03T08:31:00.000Z",
  }, { receivedAt: "2026-10-03T08:31:01.000Z" });

  const roadmap = readJourneyRoadmap(authorized, { at: "2026-10-03T09:00:00.000Z" });
  expect(roadmap.authorization).toEqual({ observationSources: ["hermes"], dispatchExecutors: ["hermes"] });
  expect(roadmap.journeys[0]?.tickets.map((ticket) => ticket.ticketId)).toEqual(["FEATURE-CERO-PRUEBA-20261003", "FEATURE-UNO-PRUEBA-20261003"]);
  expect(roadmap.journeys[0]?.tickets[1]).toMatchObject({
    activity: "waiting", waitingFor: ["FEATURE-CERO-PRUEBA-20261003"], lastReceivedAt: "2026-10-03T08:31:01.000Z",
    window: { windowId: "am", status: { state: "open", interruptsActiveWork: false } },
  });
});

it("declara una hoja de ruta vacía sin leer otro proyecto", () => {
  expect(readJourneyRoadmap(project()).journeys).toEqual([]);
});
