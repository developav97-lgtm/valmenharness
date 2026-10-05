import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createExecutionIdentity } from "../packages/core/src/execution-identity.js";
import {
  claimMachineCapacity,
  readMachineCapacity,
  reconcileMachineCapacity,
  recordExecutionActivity,
  releaseMachineCapacity,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";

let home: string;
let firstRoot: string;
let secondRoot: string;

beforeEach(() => {
  home = join(tmpdir(), `valmen-capacity-${Date.now()}-${Math.random()}`);
  firstRoot = join(home, "first");
  secondRoot = join(home, "second");
  for (const root of [firstRoot, secondRoot]) {
    mkdirSync(join(root, ".valmen"), { recursive: true });
  }
  mkdirSync(join(home, ".valmen"), { recursive: true });
  writeFileSync(join(firstRoot, ".valmen", "config.yaml"), "project-id: first\n", "utf8");
  writeFileSync(join(secondRoot, ".valmen", "config.yaml"), "project-id: second\n", "utf8");
  writeFileSync(join(home, ".valmen", "bindings.local.yaml"), [
    "schema-version: 1",
    "machine-id: qa-machine",
    "managed-execution-capacity: 1",
    "projects:",
    "  first:",
    `    root: ${firstRoot}`,
    "  second:",
    `    root: ${secondRoot}`,
    "",
  ].join("\n"), "utf8");
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

function project(id: "first" | "second") {
  return resolveAuthorizedProject({ projectId: id, home });
}

function identity(projectId: "first" | "second", executionId: string) {
  return createExecutionIdentity({
    projectId,
    ticketId: "FEATURE-MACHINE-CAPACITY-20261005",
    executionId,
  });
}

describe("capacidad compartida por máquina", () => {
  it("otorga el último cupo a una sola reserva entre proyectos", () => {
    const first = identity("first", "exec-01");
    const second = identity("second", "exec-02");

    const reserved = claimMachineCapacity({ home, project: project("first"), identity: first, attemptId: "attempt-01" });
    const unavailable = claimMachineCapacity({ home, project: project("second"), identity: second, attemptId: "attempt-01" });

    expect(reserved).toMatchObject({ granted: true, created: true, availableSlots: 0 });
    expect(unavailable).toMatchObject({ granted: false, created: false, availableSlots: 0 });
    expect(readMachineCapacity({ home, project: project("first") })).toMatchObject({
      capacity: 1,
      availableSlots: 0,
      reservations: [expect.objectContaining({ projectId: "first", executionId: "exec-01" })],
    });
  });

  it("hace idempotente la reclamación y libera solo su identidad", () => {
    const first = identity("first", "exec-01");
    const second = identity("second", "exec-02");

    claimMachineCapacity({ home, project: project("first"), identity: first, attemptId: "attempt-01" });
    expect(claimMachineCapacity({ home, project: project("first"), identity: first, attemptId: "attempt-01" }))
      .toMatchObject({ granted: true, created: false, availableSlots: 0 });
    expect(releaseMachineCapacity({ home, project: project("first"), identity: first, attemptId: "attempt-01" }))
      .toMatchObject({ released: true, availableSlots: 1 });
    expect(claimMachineCapacity({ home, project: project("second"), identity: second, attemptId: "attempt-01" }))
      .toMatchObject({ granted: true, created: true, availableSlots: 0 });
  });

  it("recupera solo una reserva cuya actividad terminó", () => {
    const first = identity("first", "exec-01");
    const second = identity("second", "exec-02");
    claimMachineCapacity({ home, project: project("first"), identity: first, attemptId: "attempt-01" });
    recordExecutionActivity(project("first"), {
      eventId: "activity-finished",
      identity: first,
      attemptId: "attempt-01",
      state: "finished",
      source: "test",
      occurredAt: "2026-10-05T12:00:00.000Z",
    });

    expect(reconcileMachineCapacity({ home })).toMatchObject({ recovered: [expect.objectContaining({ executionId: "exec-01" })] });
    expect(claimMachineCapacity({ home, project: project("second"), identity: second, attemptId: "attempt-01" }))
      .toMatchObject({ granted: true, created: true });
  });

  it("conserva actividad activa y una reserva sin historial verificable", () => {
    writeFileSync(join(home, ".valmen", "bindings.local.yaml"), [
      "schema-version: 1",
      "machine-id: qa-machine",
      "managed-execution-capacity: 2",
      "projects:",
      "  first:",
      `    root: ${firstRoot}`,
      "  second:",
      `    root: ${secondRoot}`,
      "",
    ].join("\n"), "utf8");
    const active = identity("first", "exec-active");
    const unknown = identity("second", "exec-unknown");
    claimMachineCapacity({ home, project: project("first"), identity: active, attemptId: "attempt-01" });
    claimMachineCapacity({ home, project: project("second"), identity: unknown, attemptId: "attempt-01" });
    recordExecutionActivity(project("first"), {
      eventId: "activity-active",
      identity: active,
      attemptId: "attempt-01",
      state: "active",
      source: "test",
      occurredAt: "2026-10-05T12:00:00.000Z",
    });

    expect(reconcileMachineCapacity({ home })).toMatchObject({ recovered: [], availableSlots: 0 });
    expect(readMachineCapacity({ home, project: project("first") }).reservations).toHaveLength(2);
  });

  it("rechaza un proyecto que no coincide con el binding de la máquina", () => {
    const first = project("first");
    expect(() => claimMachineCapacity({
      home,
      project: { ...first, root: secondRoot },
      identity: identity("first", "exec-01"),
      attemptId: "attempt-01",
    })).toThrow("binding local");
  });
});
