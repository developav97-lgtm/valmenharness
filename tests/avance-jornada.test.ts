/**
 * El avance de la jornada tras el retiro del disparador (R-JORN-002).
 *
 * Solo queda viva la preparación manual de planes: sin jornada no hace nada, no llama a ningún
 * modelo por su cuenta, deja su pasada y respeta la jornada vigente al cambiar el día UTC. La
 * ejecución desatendida y el disparador de launchd se retiraron (tests/retiro-disparador.test.ts).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { journeyAdvanceCommand } from "../packages/cli/src/commands.js";
import {
  armarJornada,
  avanzarJornada,
  jornadaDelDia,
  jornadaVigente,
  leerPasadas,
  pasadasPath,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";
import { parseTicket } from "../packages/core/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const projectId = "avance-lab";
const A = "FEATURE-AVANCE-UNO-20261005";
const B = "FEATURE-AVANCE-DOS-20261005";
const AHORA = new Date("2026-10-06T08:00:00.000Z");
const PRUEBAS = "Contrato de entrega: ejecutar `node -e \"process.exit(0)\"` desde la raíz; esperado: código de salida 0.";
const CRITERIO = '- [ ] El laboratorio termina correctamente.\n      <!-- test: node -e "process.exit(0)" -->';

function fijarEstado(id: string, estadoNuevo: string): void {
  const ruta = join(root, "tickets", "2026", id, "ticket.md");
  writeFileSync(ruta, readFileSync(ruta, "utf8").replace(/^workflow_status: .*$/m, `workflow_status: ${estadoNuevo}`), "utf8");
}

let home: string;
let root: string;

function politica(autorizada = true): void {
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    [
      `project-id: ${projectId}`,
      "test-commands:",
      "  - node",
      "execution:",
      ...(autorizada ? ["  dispatch-executors:", "    - codex"] : ["  dispatch-executors: []"]),
      "autonomous:",
      `  enabled: ${autorizada}`,
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
      "    max-per-day: 3",
      "    budget-per-ticket: 1",
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

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "valmen-avance-"));
  root = join(home, "proyecto");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(
    join(home, ".valmen", "bindings.local.yaml"),
    `schema-version: 1\nmachine-id: avance\nmanaged-execution-capacity: 1\nprojects:\n  ${projectId}:\n    root: ${root}\n`,
  );
  politica(true);
  for (const id of [A, B]) {
    writeFixtureTicket(root, { id, workflowStatus: "intake", type: "FEATURE", module: "AVANCE", criterios: CRITERIO , pruebas: PRUEBAS});
  }
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const proyecto = () => resolveAuthorizedProject({ projectId, home });
const armar = () => armarJornada({ project: proyecto(), tickets: [A, B], ahora: () => AHORA });

const preparador = () => vi.fn(() => ({ status: 0, stdout: "preparado", stderr: "" }));

describe("el avance (preparación)", () => {
  it("prepara el ticket en intake de la jornada e informa qué hizo", async () => {
    armar();
    const ejecutarPreparacion = preparador();
    const avance = await avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, ejecutarPreparacion });

    expect(avance.estado).toBe("despachado");
    expect(avance.journeyId).toBe(jornadaDelDia(AHORA));
    expect(avance.ticketId).toBe(A);
    expect(avance.fases.map((f) => f.fase)).toEqual(["preparacion"]);
    expect(ejecutarPreparacion).toHaveBeenCalledTimes(1);
  });

  it("sin jornada del día lo dice, explica cómo armarla y no hace nada", async () => {
    const ejecutarPreparacion = vi.fn();
    const avance = await avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, ejecutarPreparacion });
    expect(avance.estado).toBe("sin-jornada");
    expect(avance.detalle).toContain("valmen journey plan");
    expect(ejecutarPreparacion).not.toHaveBeenCalled();
  });

  it("sin ejecutor autorizado no inicia nada", async () => {
    armar();
    politica(false);
    const ejecutarPreparacion = vi.fn();
    const avance = await avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, ejecutarPreparacion });
    expect(avance.estado).toBe("sin-candidato");
    expect(ejecutarPreparacion).not.toHaveBeenCalled();
    expect(estado(A)).toBe("intake");
  });

  it("el comando con --fase preparacion sale bien sin jornada y reporta el estado", async () => {
    const resultado = await journeyAdvanceCommand({ project: projectId, fase: "preparacion" }, { home, ahora: () => AHORA });
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("sin-jornada");
  });

  it("la salida del comando trae una línea con la fase, su estado y su ticket", async () => {
    armar();
    const resultado = await journeyAdvanceCommand(
      { project: projectId, fase: "preparacion" },
      { home, ahora: () => AHORA, ejecutarPreparacion: preparador() },
    );
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout.trim().split("\n")).toHaveLength(1);
    expect(resultado.stdout).toMatch(/despachado \(FEATURE-AVANCE-UNO-20261005\)/);
  });
});

describe("el registro de pasadas", () => {
  it("cada avance deja una pasada con su hora, estado, ticket y detalle", async () => {
    armar();
    const opciones = { home, ahora: () => AHORA, ejecutarPreparacion: preparador() };
    const resultado = await journeyAdvanceCommand({ project: projectId, fase: "preparacion" }, opciones);
    expect(resultado.exitCode).toBe(0);
    const pasadas = leerPasadas(root);
    expect(pasadas).toHaveLength(1);
    expect(pasadas[0]).toMatchObject({ journeyId: jornadaDelDia(AHORA), estado: "despachado", ticketId: A });
    expect(pasadas[0]?.detalle).not.toBe("");
    expect(Number.isFinite(Date.parse(pasadas[0]?.at ?? ""))).toBe(true);
    await journeyAdvanceCommand({ project: projectId, fase: "preparacion" }, opciones);
    expect(leerPasadas(root)).toHaveLength(2);
  });

  it("sin jornada también deja su pasada, con el estado sin-jornada", async () => {
    await journeyAdvanceCommand({ project: projectId, fase: "preparacion" }, { home, ahora: () => AHORA });
    expect(leerPasadas(root)[0]).toMatchObject({ estado: "sin-jornada", ticketId: null });
  });

  it("un avance que falla deja una pasada con estado error y su mensaje", async () => {
    armar();
    const resultado = await journeyAdvanceCommand(
      { project: projectId, fase: "preparacion" },
      {
        home,
        ahora: () => AHORA,
        ejecutarPreparacion: () => {
          throw new Error("se cayó el preparador");
        },
      },
    );
    expect(resultado.exitCode).not.toBe(0);
    const pasadas = leerPasadas(root);
    expect(pasadas.at(-1)).toMatchObject({ estado: "error" });
    expect(pasadas.at(-1)?.detalle).toContain("se cayó el preparador");
  });

  it("un fallo al anexar la pasada se informa en stderr sin cambiar el código de salida", async () => {
    mkdirSync(pasadasPath(root), { recursive: true });
    const resultado = await journeyAdvanceCommand({ project: projectId, fase: "preparacion" }, { home, ahora: () => AHORA });
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("sin-jornada");
    expect(resultado.stderr).toContain("No se pudo registrar la pasada");
  });
});

describe("la jornada vigente cuando cambia el día UTC", () => {
  const AYER = new Date("2026-10-06T22:00:00.000Z");
  const HOY = new Date("2026-10-07T01:00:00.000Z");
  const armarAyer = () => armarJornada({ project: proyecto(), tickets: [A, B], ahora: () => AYER });

  it("sin jornada del día, prepara el ticket de la jornada más reciente con pendientes", async () => {
    armarAyer();
    const ejecutarPreparacion = preparador();
    const avance = await avanzarJornada({ project: proyecto(), home, ahora: () => HOY, ejecutarPreparacion });

    expect(avance.journeyId).toBe(jornadaDelDia(AYER));
    expect(avance.estado).toBe("despachado");
    expect(avance.ticketId).toBe(A);
    expect(ejecutarPreparacion).toHaveBeenCalledTimes(1);
    expect(jornadaVigente(proyecto(), HOY)).toBe(jornadaDelDia(AYER));
  });

  it("con jornada del día la usa aunque una anterior tenga pendientes", () => {
    armarAyer();
    armarJornada({ project: proyecto(), tickets: [B], ahora: () => HOY });
    expect(jornadaVigente(proyecto(), HOY)).toBe(jornadaDelDia(HOY));
  });

  it("sin ninguna jornada con pendientes devuelve sin-jornada sin invocar al ejecutor", async () => {
    armarAyer();
    fijarEstado(A, "closed");
    fijarEstado(B, "closed");
    const ejecutarPreparacion = vi.fn();
    const avance = await avanzarJornada({ project: proyecto(), home, ahora: () => HOY, ejecutarPreparacion });

    expect(avance.estado).toBe("sin-jornada");
    expect(avance.detalle).toContain(`${jornadaDelDia(AYER)}, no tiene tickets pendientes`);
    expect(jornadaVigente(proyecto(), HOY)).toBeNull();
    expect(ejecutarPreparacion).not.toHaveBeenCalled();
  });

  it("un ticket en in_progress heredado de la jornada anterior no se vuelve a preparar", async () => {
    armarAyer();
    fijarEstado(A, "in_progress");
    const nueva = armarJornada({ project: proyecto(), tickets: [B], ahora: () => HOY });
    expect(nueva.heredados?.tickets).toEqual([A]);

    const ejecutarPreparacion = preparador();
    const avance = await avanzarJornada({ project: proyecto(), home, ahora: () => HOY, ejecutarPreparacion });

    expect(avance.journeyId).toBe(jornadaDelDia(HOY));
    expect(avance.ticketId).toBe(B);
    expect(ejecutarPreparacion).toHaveBeenCalledTimes(1);
    expect(estado(A)).toBe("in_progress");
  });
});
