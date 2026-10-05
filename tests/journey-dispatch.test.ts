import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createExecutionIdentity, parseTicket } from "../packages/core/src/index.js";
import {
  claimMachineCapacity,
  createJourney,
  dispatchJourney,
  readExecutionActivity,
  readMachineCapacity,
  reconcileMachineCapacity,
  recordExecutionActivity,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const projectId = "dispatch-lab";
const waiting = "FEATURE-DISPATCH-WAITING-20261005";
const dependent = "FEATURE-DISPATCH-DEPENDENT-20261005";
const independent = "FEATURE-DISPATCH-INDEPENDENT-20261005";
const criteria = '- [ ] El laboratorio termina correctamente.\n      <!-- test: node -e "process.exit(0)" -->';

let home: string;
let root: string;

beforeEach(() => {
  home = join(tmpdir(), `valmen-journey-dispatch-${Date.now()}-${Math.random()}`);
  root = join(home, "project");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeBindings();
  writePolicy();
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

function writeBindings(capacity = 1): void {
  writeFileSync(
    join(home, ".valmen", "bindings.local.yaml"),
    [
      "schema-version: 1",
      "machine-id: dispatch-machine",
      `managed-execution-capacity: ${capacity}`,
      "projects:",
      `  ${projectId}:`,
      `    root: ${root}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

function writePolicy(options: { readonly enabled?: boolean; readonly dispatch?: readonly string[] } = {}): void {
  const dispatch = options.dispatch ?? ["codex"];
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    [
      `project-id: ${projectId}`,
      "test-commands:",
      "  - node",
      "execution:",
      ...(dispatch.length === 0
        ? ["  dispatch-executors: []"]
        : ["  dispatch-executors:", ...dispatch.map((executor) => `    - ${executor}`)]),
      "autonomous:",
      `  enabled: ${options.enabled ?? true}`,
      "  executor:",
      "    id: codex",
      "    model: gpt-6-sol",
      "    effort: high",
      "  eligible:",
      "    types:",
      "      - FEATURE",
      "    max-risk: normal",
      "    require:",
      "      - plan-approved",
      "      - tests-declared",
      "      - no-critical-impacts",
      "    excluded-modules:",
      "      - auth",
      "  limits:",
      "    max-concurrent: 1",
      "    collision-policy: serialize",
      "    max-per-day: 1",
      "    budget-per-ticket: 1",
      "    stop-on:",
      "      - test-failure",
      "",
    ].join("\n"),
    "utf8",
  );
}

function project() {
  return resolveAuthorizedProject({ projectId, home });
}

function writeTicket(id: string, workflowStatus: string, ticketCriteria = criteria): void {
  writeFixtureTicket(root, {
    id,
    workflowStatus,
    type: "FEATURE",
    module: "DISPATCH",
    criterios: ticketCriteria,
  });
}

function workflow(id: string): string {
  return parseTicket(readFileSync(join(root, "tickets", "2026", id, "ticket.md"), "utf8"))
    .fields.workflow_status;
}

function createDispatchJourney(options: { readonly endsAt?: string; readonly includeWaiting?: boolean } = {}): void {
  createJourney(project(), {
    revisionId: "dispatch-revision-01",
    journeyId: "dispatch-morning",
    occurredAt: "2026-10-05T12:00:00.000Z",
    windows: [{
      windowId: "morning",
      startsAt: "2026-10-05T12:00:00.000Z",
      endsAt: options.endsAt ?? "2026-10-05T16:00:00.000Z",
      timeZone: "America/Bogota",
    }],
    tickets: [
      ...(options.includeWaiting === false
        ? []
        : [{
            ticketId: waiting,
            order: 1,
            priority: 1,
            dependsOn: [],
            start: { condition: "manual" as const },
            authorizationIds: ["codex"],
          }]),
      {
        ticketId: dependent,
        order: 2,
        priority: 2,
        dependsOn: options.includeWaiting === false ? [] : [waiting],
        start: { condition: "dependencies-and-window" as const },
        windowId: "morning",
        authorizationIds: ["codex"],
      },
      {
        ticketId: independent,
        order: 3,
        priority: 3,
        dependsOn: [],
        start: { condition: "window" as const },
        windowId: "morning",
        authorizationIds: ["codex"],
      },
    ],
  });
}

function request(overrides: Partial<Parameters<typeof dispatchJourney>[0]> = {}) {
  return {
    project: project(),
    home,
    journeyId: "dispatch-morning",
    at: "2026-10-05T13:00:00.000Z",
    executionId: "dispatch-01",
    attemptId: "attempt-01",
    execute: () => ({ status: 0, stdout: "hecho", stderr: "" }),
    ...overrides,
  };
}

describe("despacho de jornadas", () => {
  it("inicia el ticket independiente autorizado y conserva el dependiente bloqueado", async () => {
    writeTicket(waiting, "awaiting_user_tests");
    writeTicket(dependent, "approved");
    writeTicket(independent, "approved");
    createDispatchJourney();
    const execute = vi.fn(() => ({ status: 0, stdout: "hecho", stderr: "" }));

    const result = await dispatchJourney(request({ execute }));

    expect(result).toMatchObject({
      status: "dispatched",
      ticketId: independent,
      selection: { dispatchCandidate: { ticketId: independent } },
    });
    expect(result.selection.blocked).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticketId: dependent, reasons: ["dependency"] }),
    ]));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(workflow(independent)).toBe("awaiting_user_tests");
    const identity = createExecutionIdentity({ projectId, ticketId: independent, executionId: "dispatch-01" });
    expect(readExecutionActivity(project(), identity, "attempt-01").map((event) => event.state))
      .toEqual(["started", "finished"]);
  });

  it("reconcilia un final persistido y habilita el siguiente ticket sin horario nuevo", async () => {
    writeTicket(waiting, "approved");
    writeTicket(dependent, "approved");
    writeTicket(independent, "planned");
    createDispatchJourney({ includeWaiting: false });
    const prior = createExecutionIdentity({ projectId, ticketId: waiting, executionId: "old-dispatch" });
    claimMachineCapacity({ home, project: project(), identity: prior, attemptId: "old-attempt" });
    recordExecutionActivity(project(), {
      eventId: "old-dispatch-finished",
      identity: prior,
      attemptId: "old-attempt",
      state: "finished",
      source: "test",
      occurredAt: "2026-10-05T12:30:00.000Z",
    });

    const result = await dispatchJourney(request());

    expect(result).toMatchObject({ status: "dispatched", ticketId: dependent });
    expect(workflow(dependent)).toBe("awaiting_user_tests");
  });

  it("no inicia ni reserva cuando la ventana cerró", async () => {
    writeTicket(waiting, "awaiting_user_tests");
    writeTicket(dependent, "approved");
    writeTicket(independent, "approved");
    createDispatchJourney({ endsAt: "2026-10-05T13:00:00.000Z" });
    const execute = vi.fn(() => ({ status: 0, stdout: "hecho", stderr: "" }));

    const result = await dispatchJourney(request({ execute }));

    expect(result.status).toBe("not-dispatched");
    expect(execute).not.toHaveBeenCalled();
    expect(workflow(independent)).toBe("approved");
    expect(readMachineCapacity({ home, project: project() }).reservations).toEqual([]);
  });

  it("respeta la autorización explícita y una autonomía apagada sin mutar tickets", async () => {
    writeTicket(waiting, "awaiting_user_tests");
    writeTicket(dependent, "approved");
    writeTicket(independent, "approved");
    createDispatchJourney();
    const execute = vi.fn(() => ({ status: 0, stdout: "hecho", stderr: "" }));
    writePolicy({ dispatch: [] });

    expect((await dispatchJourney(request({ execute }))).status).toBe("not-dispatched");
    writePolicy({ enabled: false });
    expect((await dispatchJourney(request({ execute }))).status).toBe("not-dispatched");
    expect(execute).not.toHaveBeenCalled();
    expect(workflow(independent)).toBe("approved");
  });

  it("no vuelve a invocar un ejecutor para la misma identidad reservada", async () => {
    writeTicket(waiting, "awaiting_user_tests");
    writeTicket(dependent, "approved");
    writeTicket(independent, "approved");
    createDispatchJourney();
    const identity = createExecutionIdentity({ projectId, ticketId: independent, executionId: "dispatch-01" });
    claimMachineCapacity({ home, project: project(), identity, attemptId: "attempt-01" });
    const execute = vi.fn(() => ({ status: 0, stdout: "hecho", stderr: "" }));

    const result = await dispatchJourney(request({ execute }));

    expect(result).toMatchObject({ status: "already-dispatched", ticketId: independent });
    expect(execute).not.toHaveBeenCalled();
    expect(workflow(independent)).toBe("approved");
  });

  it("conserva una parada segura hasta reconciliar su actividad terminal", async () => {
    const failing = '- [ ] El laboratorio falla.\n      <!-- test: node -e "process.exit(1)" -->';
    writeTicket(waiting, "awaiting_user_tests");
    writeTicket(dependent, "approved");
    writeTicket(independent, "approved", failing);
    createDispatchJourney();

    const result = await dispatchJourney(request());

    expect(result).toMatchObject({
      status: "dispatched",
      ticketId: independent,
      autonomous: { status: "stopped", stop: { reason: "test-failure" } },
    });
    const identity = createExecutionIdentity({ projectId, ticketId: independent, executionId: "dispatch-01" });
    expect(readExecutionActivity(project(), identity, "attempt-01").map((event) => event.state))
      .toEqual(["started", "failed"]);
    expect(readMachineCapacity({ home, project: project() }).availableSlots).toBe(0);
    expect(reconcileMachineCapacity({ home })).toMatchObject({
      recovered: [expect.objectContaining({ executionId: "dispatch-01" })],
      availableSlots: 1,
    });
  });
});
