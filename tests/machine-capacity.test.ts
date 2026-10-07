import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createExecutionIdentity } from "../packages/core/src/execution-identity.js";
import {
  claimMachineCapacity,
  readMachineCapacity,
  reconcileMachineCapacity,
  readExecutionActivity,
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

describe("reservas huérfanas", () => {
  const INICIO = "2026-10-05T12:00:00.000Z";
  /** El tope por defecto es de 60 minutos más 5 de margen. */
  const dentroDelTope = () => new Date("2026-10-05T13:00:00.000Z");
  const topeVencido = () => new Date("2026-10-05T13:06:00.000Z");
  const muerto = () => false;
  const vivo = () => true;

  function huerfana(state: "started" | "active" = "started") {
    const id = identity("first", "exec-huerfana");
    claimMachineCapacity({ home, project: project("first"), identity: id, attemptId: "attempt-01" });
    recordExecutionActivity(project("first"), {
      eventId: "activity-orphan",
      identity: id,
      attemptId: "attempt-01",
      state,
      source: "test",
      occurredAt: INICIO,
    });
    return id;
  }

  it("la reserva nueva guarda el PID del proceso que la reclamó", () => {
    claimMachineCapacity({ home, project: project("first"), identity: identity("first", "exec-01"), attemptId: "attempt-01" });
    expect(readMachineCapacity({ home, project: project("first") }).reservations[0]).toMatchObject({ pid: process.pid });
    const guardado = JSON.parse(readFileSync(join(home, ".valmen", "machine-capacity.json"), "utf8"));
    expect(guardado.reservations[0].pid).toBe(process.pid);
  });

  it("recupera una reserva started con el proceso inexistente y el tope vencido, y registra failed con su origen", () => {
    const id = huerfana("started");
    const r = reconcileMachineCapacity({ home, ahora: topeVencido, procesoVivo: muerto });
    expect(r.recovered).toEqual([expect.objectContaining({ executionId: "exec-huerfana" })]);
    expect(r.availableSlots).toBe(1);
    const ultima = readExecutionActivity(project("first"), id, "attempt-01").at(-1);
    expect(ultima).toMatchObject({ state: "failed", source: "journey-recovery" });
  });

  it("también recupera una reserva active", () => {
    huerfana("active");
    expect(reconcileMachineCapacity({ home, ahora: topeVencido, procesoVivo: muerto }).recovered).toHaveLength(1);
  });

  it("recupera una reserva sin PID (formato anterior) solo por tope vencido más margen", () => {
    huerfana();
    const ruta = join(home, ".valmen", "machine-capacity.json");
    const guardado = JSON.parse(readFileSync(ruta, "utf8"));
    delete guardado.reservations[0].pid;
    writeFileSync(ruta, JSON.stringify(guardado), "utf8");
    expect(reconcileMachineCapacity({ home, ahora: dentroDelTope }).recovered).toEqual([]);
    expect(reconcileMachineCapacity({ home, ahora: topeVencido }).recovered).toHaveLength(1);
  });

  it("retiene la reserva si el proceso sigue vivo, aunque el tope haya vencido", () => {
    huerfana();
    const r = reconcileMachineCapacity({ home, ahora: topeVencido, procesoVivo: vivo });
    expect(r.recovered).toEqual([]);
    expect(r.availableSlots).toBe(0);
  });

  it("retiene la reserva dentro del tope, aunque el proceso no exista", () => {
    huerfana();
    const r = reconcileMachineCapacity({ home, ahora: dentroDelTope, procesoVivo: muerto });
    expect(r.recovered).toEqual([]);
    expect(r.availableSlots).toBe(0);
  });

  it("una identidad recuperada puede reclamarse otra vez y registrar su propio started", () => {
    const id = huerfana();
    reconcileMachineCapacity({ home, ahora: topeVencido, procesoVivo: muerto });
    expect(claimMachineCapacity({ home, project: project("first"), identity: id, attemptId: "attempt-01" }))
      .toMatchObject({ granted: true, created: true });
  });
});
