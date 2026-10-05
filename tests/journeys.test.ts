import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createExecutionIdentity } from "../packages/core/src/execution-identity.js";
import {
  appendExecutionEvent,
  createJourney,
  readExecutionEvents,
  journeyRevisionsPath,
  readJourneys,
  readJourneyRevisions,
  reviseJourney,
  resolveAuthorizedProject,
  type JourneyRevisionInput,
} from "../packages/engine/src/index.js";

let home: string;
let root: string;

beforeEach(() => {
  home = join(tmpdir(), `valmen-journeys-${Date.now()}-${Math.random()}`);
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

function ticket(number: number) {
  return `FEATURE-JOURNEY-TICKET-${number}-20261003`;
}

function revision(revisionId: string, overrides: Partial<JourneyRevisionInput> = {}): JourneyRevisionInput {
  return {
    revisionId,
    journeyId: "morning-20261003",
    occurredAt: "2026-10-03T12:00:00.000Z",
    tickets: [
      {
        ticketId: ticket(1), order: 1, priority: 10, dependsOn: [],
        start: { condition: "window", scheduledAt: "2026-10-03T13:00:00.000Z" },
        windowId: "morning-window", authorizationIds: ["approval-01"],
      },
      {
        ticketId: ticket(2), order: 2, priority: 20, dependsOn: [ticket(1)],
        start: { condition: "dependencies" },
        windowId: "morning-window", authorizationIds: ["approval-01"],
      },
      {
        ticketId: ticket(3), order: 3, priority: 30, dependsOn: [ticket(1)],
        start: { condition: "dependencies-and-window" },
        windowId: "morning-window", authorizationIds: ["approval-02"],
      },
      {
        ticketId: ticket(4), order: 4, priority: 40, dependsOn: [],
        start: { condition: "manual" }, authorizationIds: [],
      },
      {
        ticketId: ticket(5), order: 5, priority: 50, dependsOn: [],
        start: { condition: "window", scheduledAt: "2026-10-03T13:00:00.000Z" },
        windowId: "morning-window", authorizationIds: ["approval-01"],
      },
    ],
    ...overrides,
  };
}

describe("jornadas persistidas", () => {
  it("conserva cinco tickets ordenados con sus condiciones antes de iniciar una ventana", () => {
    const created = createJourney(project(), revision("rev-01"), { receivedAt: "2026-10-03T12:01:00.000Z" });

    expect(created).toMatchObject({ appended: true, revision: { cursor: 1, projectId: "valmen-harness" } });
    const current = readJourneys(project());
    expect(current).toHaveLength(1);
    expect(current[0]?.tickets.map((entry) => entry.ticketId)).toEqual([ticket(1), ticket(2), ticket(3), ticket(4), ticket(5)]);
    expect(current[0]?.tickets[0]).toMatchObject({ priority: 10, windowId: "morning-window", authorizationIds: ["approval-01"] });
    expect(current[0]?.tickets[1]?.start).toEqual({ condition: "dependencies" });
    expect(current[0]?.tickets[1]?.start.actualAt).toBeUndefined();
    expect(journeyRevisionsPath(project())).toContain(".valmen/journeys/events.jsonl");
  });

  it("anexa revisiones sin sustituir la foto anterior y reconcilia reenvíos", () => {
    const first = createJourney(project(), revision("rev-01"));
    const resent = createJourney(project(), revision("rev-01"));
    const second = reviseJourney(project(), revision("rev-02", {
      occurredAt: "2026-10-03T12:30:00.000Z",
      tickets: [
        { ticketId: ticket(1), order: 1, priority: 1, dependsOn: [], start: { condition: "manual" }, authorizationIds: [] },
      ],
    }));

    expect(resent).toEqual({ appended: false, revision: first.revision });
    expect(second.revision.cursor).toBe(2);
    expect(readJourneyRevisions(project(), "morning-20261003").map((item) => item.revisionId)).toEqual(["rev-01", "rev-02"]);
    expect(readJourneys(project())[0]?.tickets).toHaveLength(1);
  });

  it("permite reutilizar un ticket en otra jornada sin modificar las revisiones existentes", () => {
    appendExecutionEvent(project(), {
      eventId: "execution-event-01",
      identity: createExecutionIdentity({ projectId: "valmen-harness", ticketId: ticket(1), executionId: "execution-01" }),
      attemptId: "attempt-01", kind: "activity.started", source: "test", occurredAt: "2026-10-03T12:00:00.000Z",
    });
    createJourney(project(), revision("rev-01"));
    createJourney(project(), revision("evening-rev-01", {
      journeyId: "evening-20261003",
      tickets: [
        { ticketId: ticket(1), order: 1, priority: 1, dependsOn: [], start: { condition: "manual", actualAt: "2026-10-03T14:00:00.000Z" }, authorizationIds: [] },
      ],
    }));

    expect(readJourneys(project()).map((item) => item.journeyId)).toEqual(["morning-20261003", "evening-20261003"]);
    expect(readJourneyRevisions(project(), "morning-20261003")).toHaveLength(1);
    expect(readJourneys(project())[1]?.tickets[0]?.start.actualAt).toBe("2026-10-03T14:00:00.000Z");
    expect(readExecutionEvents(project()).map((event) => event.eventId)).toEqual(["execution-event-01"]);
  });

  it("rechaza revisiones inconsistentes y no escribe otro hecho", () => {
    createJourney(project(), revision("rev-01"));
    expect(() => reviseJourney(project(), revision("rev-01", { occurredAt: "2026-10-03T12:30:00.000Z" }))).toThrow("contenido distinto");
    expect(() => createJourney(project(), revision("rev-02"))).toThrow("ya existe");
    expect(() => createJourney(project(), revision("bad-order", {
      journeyId: "invalid-journey",
      tickets: [
        { ticketId: ticket(1), order: 1, priority: 1, dependsOn: [], start: { condition: "manual" }, authorizationIds: [] },
        { ticketId: ticket(2), order: 1, priority: 2, dependsOn: [], start: { condition: "manual" }, authorizationIds: [] },
      ],
    }))).toThrow("orden");
    expect(readJourneyRevisions(project())).toHaveLength(1);
  });
});
