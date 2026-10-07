/**
 * El vigilante avisa lo que llega a las pruebas del responsable y el parte cuenta la jornada
 * (R-JORN-008).
 *
 * Lo que se afirma: el aviso trae el contrato de pruebas, no se repite en el mismo ciclo, un
 * canal caído no lo da por avisado, y el parte muestra la actividad por fase diciendo cuando el
 * costo no se reportó, sin cambiar su texto cuando no hay jornada.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  armarParte,
  hermesNotifyPendientes,
  pendientesDeAvisar,
} from "../packages/cli/src/hermes.js";
import {
  type CommandRunner,
  type RegistryPaths,
  recordAutonomousStop,
  registrarFase,
  renderBrief,
} from "../packages/engine/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const AHORA = new Date("2026-10-06T14:00:00.000Z");
const A = "FEATURE-VIG-UNO-20261005";
const B = "FEATURE-VIG-DOS-20261005";
const CONTRATO = "Contrato de entrega:\n- Ejecutar `npx vitest run tests/uno.test.ts` desde la raíz; esperado: pasa.\n- Ejecutar `npx tsc --noEmit -p tsconfig.json`; esperado: sin salida.";
const CONFIG = { enabled: true, gateTarget: "telegram", budgetTarget: "", tokenHours: 24, allowedRisk: ["low", "normal"] };
const SECRETO = "secreto-de-prueba-para-el-vigilante";

let raiz: string;
let paths: RegistryPaths;

function runner(falla = false): { runner: CommandRunner; cuerpos: string[] } {
  const cuerpos: string[] = [];
  const r: CommandRunner = (_c, _a, input) => {
    cuerpos.push(input);
    return falla
      ? { status: 1, stdout: "", stderr: "canal caído", failed: false }
      : { status: 0, stdout: "{}", stderr: "", failed: false };
  };
  return { runner: r, cuerpos };
}

const avisar = (r: CommandRunner) =>
  hermesNotifyPendientes({ paths, config: CONFIG, secret: SECRETO, now: AHORA, runner: r });

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), "valmen-vigilante-"));
  mkdirSync(join(raiz, "tickets"), { recursive: true });
  mkdirSync(join(raiz, ".valmen"), { recursive: true });
  writeFileSync(join(raiz, ".valmen", "config.yaml"), "name: Laboratorio\n", "utf8");
  paths = { root: raiz, ticketsDir: "tickets" };
});

afterEach(() => rmSync(raiz, { recursive: true, force: true }));

describe("un ticket que llega a las pruebas del responsable", () => {
  it("se avisa con su título, los comandos del contrato y la ruta del contrato, y no se repite", () => {
    writeFixtureTicket(raiz, { id: A, workflowStatus: "awaiting_user_tests", pruebas: CONTRATO });
    const { runner: r, cuerpos } = runner();

    const primero = avisar(r);
    expect(primero.exitCode).toBe(0);
    expect(cuerpos).toHaveLength(1);
    expect(cuerpos[0]).toContain("LISTO PARA TUS PRUEBAS");
    expect(cuerpos[0]).toContain(A);
    expect(cuerpos[0]).toContain("npx vitest run tests/uno.test.ts");
    expect(cuerpos[0]).toContain("npx tsc --noEmit -p tsconfig.json");
    expect(cuerpos[0]).toContain(`tickets/2026/${A}/ticket.md`);
    expect(cuerpos[0]).toContain("no aprueba nada");

    avisar(r);
    expect(cuerpos).toHaveLength(1);
    expect(pendientesDeAvisar(paths, AHORA).filter((p) => p.kind === "pruebas-listas")).toEqual([]);
  });

  it("si el canal falla no se anota como avisado y se reintenta en la siguiente corrida", () => {
    writeFixtureTicket(raiz, { id: A, workflowStatus: "awaiting_user_tests", pruebas: CONTRATO });
    const caido = runner(true);
    avisar(caido.runner);
    expect(pendientesDeAvisar(paths, AHORA).filter((p) => p.kind === "pruebas-listas")).toHaveLength(1);

    const sano = runner();
    avisar(sano.runner);
    expect(sano.cuerpos).toHaveLength(1);
    expect(pendientesDeAvisar(paths, AHORA).filter((p) => p.kind === "pruebas-listas")).toEqual([]);
  });

  it("un ticket que no está en las pruebas no genera aviso", () => {
    writeFixtureTicket(raiz, { id: A, workflowStatus: "in_progress" });
    expect(pendientesDeAvisar(paths, AHORA).filter((p) => p.kind === "pruebas-listas")).toEqual([]);
  });
});

describe("el parte diario de la jornada", () => {
  const parte = () => armarParte({ paths, config: CONFIG, now: AHORA });

  it("muestra las sesiones del día por fase con modelo y duración, y dice que el costo no se reportó", () => {
    registrarFase(raiz, {
      ticketId: A, fase: "analysis", ejecutor: "codex", modelo: "gpt-6-luna", esfuerzo: "medium",
      origenDelModelo: "rol", duracionMs: 5 * 60_000, resultado: "plan-listo", registradoEn: "2026-10-06T09:00:00.000Z",
    });
    registrarFase(raiz, {
      ticketId: A, fase: "implementation", ejecutor: "codex", modelo: "gpt-6-sol", esfuerzo: "high",
      origenDelModelo: "rol", duracionMs: 20 * 60_000, resultado: "delivered", registradoEn: "2026-10-06T10:00:00.000Z",
    });
    // Una sesión de otro día no cuenta en el parte de hoy.
    registrarFase(raiz, {
      ticketId: B, fase: "analysis", ejecutor: "codex", modelo: "gpt-6-luna", esfuerzo: "medium",
      origenDelModelo: "rol", duracionMs: 60_000, resultado: "plan-listo", registradoEn: "2026-10-05T09:00:00.000Z",
    });
    const texto = renderBrief(parte()).body;
    expect(texto).toContain("Jornada de hoy — 2 sesión(es)");
    expect(texto).toContain("analysis: 1 sesión(es), gpt-6-luna, 5 min, costo sin reportar por el cliente");
    expect(texto).toContain("implementation: 1 sesión(es), gpt-6-sol, 20 min, costo sin reportar por el cliente");
  });

  it("lista los planes que esperan aprobación, los tickets que esperan pruebas y las paradas activas", () => {
    mkdirSync(join(raiz, ".valmen", "journeys"), { recursive: true });
    writeFileSync(join(raiz, ".valmen", "journeys", "events.jsonl"), "", "utf8");
    writeFixtureTicket(raiz, { id: A, workflowStatus: "awaiting_user_tests", pruebas: CONTRATO });
    writeFixtureTicket(raiz, { id: B, workflowStatus: "planned" });
    recordAutonomousStop(paths, {
      ticketId: "FEATURE-VIG-TRES-20261005", reason: "executor-failed", detail: "se cayó", workflowStatus: "in_progress", now: AHORA,
    });
    const texto = renderBrief(parte()).body;
    expect(texto).toContain("1 esperan tus pruebas");
    expect(texto).toContain(A);
    expect(texto).toContain("1 plan(es) esperan tu aprobación");
    expect(texto).toContain(B);
    expect(texto).toContain("1 parada(s) activa(s)");
    expect(texto).toContain("FEATURE-VIG-TRES-20261005 · executor-failed");
  });

  it("sin actividad de jornada el parte conserva su texto de siempre", () => {
    writeFixtureTicket(raiz, { id: B, workflowStatus: "planned" });
    const conTodo = parte();
    expect(conTodo.jornada).toBeUndefined();
    const texto = renderBrief(conTodo).body;
    expect(texto).not.toContain("Jornada de hoy");
    expect(texto).not.toContain("esperan tu aprobación");
  });
});
