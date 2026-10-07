/**
 * Los topes y las paradas de la jornada (R-JORN-007).
 *
 * Lo que se afirma: la jornada se frena sola —por día, por concurrencia y por tiempo—, un
 * fallo del ejecutor o de la verificación deja una parada que se avisa en formato de decisión,
 * y una parada no se reintenta sola: solo una persona la libera.
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { journeyClearStopCommand } from "../packages/cli/src/commands.js";
import { parseConfig, readAutonomousConfig } from "../packages/adapter/src/index.js";
import { parseTicket } from "../packages/core/src/index.js";
import {
  armarJornada,
  avanzarJornada,
  paradasActivas,
  readApprovalLog,
  readAutonomousStops,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const projectId = "topes-lab";
const A = "FEATURE-TOPES-UNO-20261005";
const B = "FEATURE-TOPES-DOS-20261005";
const AHORA = new Date("2026-10-06T08:00:00.000Z");
const CRITERIO = '- [ ] El laboratorio termina correctamente.\n      <!-- test: node -e "process.exit(0)" -->';
const PRUEBAS = "Contrato de entrega: ejecutar `node -e \"process.exit(0)\"`; esperado: código 0.";

let home: string;
let root: string;
const proyecto = () => resolveAuthorizedProject({ projectId, home });

function politica(limites: { perDay?: number; concurrent?: number; minutes?: string } = {}): void {
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    [
      `project-id: ${projectId}`,
      "test-commands:",
      "  - node",
      "execution:",
      "  dispatch-executors:",
      "    - codex",
      "autonomous:",
      "  enabled: true",
      "  executor:",
      "    id: codex",
      "    model: gpt-6-sol",
      "    effort: high",
      "  eligible:",
      "    types:",
      "      - FEATURE",
      "    max-risk: normal",
      "    require:",
      "      - tests-declared",
      "    excluded-modules:",
      "      - auth",
      "  limits:",
      `    max-concurrent: ${limites.concurrent ?? 1}`,
      "    collision-policy: serialize",
      `    max-per-day: ${limites.perDay ?? 5}`,
      "    budget-per-ticket: 1",
      ...(limites.minutes === undefined ? [] : [`    max-minutes: ${limites.minutes}`]),
      "    stop-on:",
      "      - test-failure",
      "",
    ].join("\n"),
    "utf8",
  );
}

function estado(id: string): string {
  return parseTicket(readFileSync(join(root, "tickets", "2026", id, "ticket.md"), "utf8")).fields.workflow_status;
}

function implementador(opciones: { contrato?: boolean } = {}) {
  return () => {
    for (const id of [A, B]) {
      if (estado(id) !== "in_progress") continue;
      writeFixtureTicket(root, {
        id,
        workflowStatus: "in_progress",
        type: "FEATURE",
        module: "TOPES",
        criterios: CRITERIO,
        ...(opciones.contrato === false ? {} : { pruebas: PRUEBAS }),
      });
    }
    return { status: 0, stdout: "hecho", stderr: "" };
  };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "valmen-topes-"));
  root = join(home, "proyecto");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(
    join(home, ".valmen", "bindings.local.yaml"),
    `schema-version: 1\nmachine-id: topes\nmanaged-execution-capacity: 3\nprojects:\n  ${projectId}:\n    root: ${root}\n`,
  );
  politica();
  for (const id of [A, B]) {
    writeFixtureTicket(root, { id, workflowStatus: "approved", type: "FEATURE", module: "TOPES", criterios: CRITERIO, pruebas: PRUEBAS });
  }
  armarJornada({ project: proyecto(), tickets: [A, B], ahora: () => AHORA });
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const avanzar = (extra: Partial<Parameters<typeof avanzarJornada>[0]> = {}) =>
  avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, ...extra });

describe("los topes", () => {
  it("el máximo por día impide iniciar otra sesión y lo dice", async () => {
    politica({ perDay: 1 });
    const primero = await avanzar({ execute: implementador() });
    expect(primero.estado).toBe("despachado");
    const segundo = await avanzar({ execute: implementador() });
    expect(segundo.estado).toBe("sin-candidato");
    expect(segundo.detalle).toContain("Tope diario alcanzado");
    expect(estado(B)).toBe("approved");
  });

  it("el máximo concurrente impide iniciar mientras otra sesión está activa y lo dice", async () => {
    let interno: Awaited<ReturnType<typeof avanzar>> | null = null;
    const ejecutor = () => {
      // Mientras la primera sesión corre, otro avance (capacidad de la máquina: 3) choca con el tope de la política (1).
      void avanzarJornada({
        project: proyecto(), home, ahora: () => AHORA, execute: () => ({ status: 0, stdout: "no debe correr", stderr: "" }),
      }).then((r) => { interno = r; });
      return implementador()();
    };
    await avanzar({ execute: ejecutor });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((interno as Awaited<ReturnType<typeof avanzar>> | null)?.detalle ?? "").toContain("Tope concurrente alcanzado");
  });
});

describe("el tiempo máximo y los fallos", () => {
  it("un ejecutor que supera el tiempo máximo se corta y deja la parada con el motivo", async () => {
    politica({ minutes: "0.01" });
    // Un ejecutor de verdad, que no termina: `codex` falso que duerme más que el máximo.
    const bin = join(home, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "codex"), "#!/bin/sh\nsleep 8\n", "utf8");
    chmodSync(join(bin, "codex"), 0o755);
    const path = process.env["PATH"];
    process.env["PATH"] = `${bin}:${path ?? ""}`;
    try {
      const avisos: string[] = [];
      const avance = await avanzar({ notificar: (t) => { avisos.push(t); return { delivered: true, detail: "ok" }; } });
      expect(avance.estado).toBe("despachado");
      const parada = readAutonomousStops({ root, ticketsDir: "tickets" })[0];
      expect(parada?.reason).toBe("executor-timeout");
      expect(parada?.detail).toContain("tiempo máximo");
      expect(avisos).toHaveLength(1);
    } finally {
      process.env["PATH"] = path;
    }
  }, 30_000);

  it("un fallo del ejecutor registra la parada y la avisa en formato de opciones y efecto", async () => {
    const avisos: string[] = [];
    await avanzar({
      execute: () => ({ status: 3, stdout: "", stderr: "se cayó" }),
      notificar: (t) => { avisos.push(t); return { delivered: true, detail: "ok" }; },
    });
    const parada = readAutonomousStops({ root, ticketsDir: "tickets" })[0];
    expect(parada?.reason).toBe("executor-failed");
    const lineas = (avisos[0] ?? "").split("\n");
    expect(lineas[0]).toMatch(/^Decisión: FEATURE-TOPES-UNO-20261005 — la jornada se detuvo por executor-failed/);
    expect(lineas.some((l) => /^A\) .* → /.test(l))).toBe(true);
    expect(lineas.some((l) => /^B\) .* → /.test(l))).toBe(true);
    expect(lineas.some((l) => l.startsWith("Recomiendo"))).toBe(true);
    // Y deja constancia para que el vigilante no repita el aviso.
    expect(readApprovalLog({ root, ticketsDir: "tickets" }).some((e) => e.kind === "autonomous-stop-notice")).toBe(true);
  });

  it("una verificación fallida (sin contrato de pruebas) deja una parada de verificación", async () => {
    await avanzar({ execute: implementador({ contrato: false }) });
    expect(readAutonomousStops({ root, ticketsDir: "tickets" })[0]?.reason).toBe("verification-failed");
  });
});

describe("una parada no se reintenta sola", () => {
  it("en preparación, un ticket parado no se vuelve a elegir hasta que una persona lo libera", async () => {
    writeFixtureTicket(root, { id: A, workflowStatus: "intake", type: "FEATURE", module: "TOPES" });
    writeFixtureTicket(root, { id: B, workflowStatus: "planned", type: "FEATURE", module: "TOPES" });
    const falla = vi.fn(() => ({ status: 2, stdout: "", stderr: "falló" }));
    const primero = await avanzar({ fase: "preparacion", ejecutarPreparacion: falla });
    expect(primero.ticketId).toBe(A);
    expect(paradasActivas({ root, ticketsDir: "tickets" })).toHaveLength(1);

    const segundo = await avanzar({ fase: "preparacion", ejecutarPreparacion: falla });
    expect(segundo.estado).toBe("sin-candidato");
    expect(falla).toHaveBeenCalledTimes(1);

    // Una persona la libera: queda un renglón más y el despacho puede volver a elegirlo.
    const liberada = journeyClearStopCommand({ project: projectId, id: A, actor: "Juan Andrade" }, { home });
    expect(liberada.exitCode).toBe(0);
    expect(paradasActivas({ root, ticketsDir: "tickets" })).toHaveLength(0);
    expect(readAutonomousStops({ root, ticketsDir: "tickets" })).toHaveLength(1);
    const tercero = await avanzar({ fase: "preparacion", ejecutarPreparacion: falla });
    expect(tercero.ticketId).toBe(A);
  });

  it("liberar sin responsable o un ticket sin parada se rechaza", () => {
    expect(journeyClearStopCommand({ project: projectId, id: A, actor: "x" }, { home }).exitCode).not.toBe(0);
    expect(journeyClearStopCommand({ project: projectId, id: A, actor: "" }, { home }).exitCode).not.toBe(0);
  });
});

describe("el tiempo máximo en la política", () => {
  it("sin max-minutes usa 60 y un valor inválido se rechaza con el mensaje de la clave", () => {
    const base = readFileSync(join(root, ".valmen", "config.yaml"), "utf8");
    expect(readAutonomousConfig(parseConfig(base)).limits.maxMinutes).toBe(60);
    politica({ minutes: "5" });
    expect(readAutonomousConfig(parseConfig(readFileSync(join(root, ".valmen", "config.yaml"), "utf8"))).limits.maxMinutes).toBe(5);
    politica({ minutes: "0" });
    expect(() => readAutonomousConfig(parseConfig(readFileSync(join(root, ".valmen", "config.yaml"), "utf8")))).toThrow(/max-minutes/);
  });
});
