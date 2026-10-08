/**
 * El vigilante avisa lo que llega a las pruebas del responsable y el parte cuenta la jornada
 * (R-JORN-008).
 *
 * Lo que se afirma: el aviso trae el contrato de pruebas, no se repite en el mismo ciclo, un
 * canal caído no lo da por avisado, y el parte muestra la actividad por fase diciendo cuando el
 * costo no se reportó, sin cambiar su texto cuando no hay jornada.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  leerPasadasDeArbol,
  registrarPasadaDeArbol,
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

describe("una jornada detenida por árbol sucio", () => {
  const JORNADA = "JOR-20261007";
  const sucia = (at: string, archivos = ["src/suelto.ts", "src/otro.ts"]) =>
    registrarPasadaDeArbol(raiz, { journeyId: JORNADA, at, archivos });
  const limpia = (at: string) => registrarPasadaDeArbol(raiz, { journeyId: JORNADA, at, limpio: true });
  const arbolSucio = () => pendientesDeAvisar(paths, AHORA).filter((p) => p.kind === "arbol-sucio");

  it("cada pasada deja una línea en el registro, con sus archivos o marcada como limpia", () => {
    sucia("2026-10-07T08:00:00.000Z");
    limpia("2026-10-07T08:15:00.000Z");
    const lineas = readFileSync(join(raiz, ".valmen", "journeys", "arbol-sucio.jsonl"), "utf8").trim().split("\n");
    expect(lineas).toHaveLength(2);
    expect(JSON.parse(lineas[0] as string)).toEqual({ journeyId: JORNADA, at: "2026-10-07T08:00:00.000Z", archivos: ["src/suelto.ts", "src/otro.ts"] });
    expect(JSON.parse(lineas[1] as string)).toEqual({ journeyId: JORNADA, at: "2026-10-07T08:15:00.000Z", limpio: true });
    expect(leerPasadasDeArbol(raiz)).toHaveLength(2);
  });

  it("no avisa tras una sola pasada sucia", () => {
    sucia("2026-10-07T08:00:00.000Z");
    const { runner: r, cuerpos } = runner();
    expect(arbolSucio()).toEqual([]);
    avisar(r);
    expect(cuerpos).toHaveLength(0);
  });

  it("tras dos pasadas sucias consecutivas avisa con los archivos que causan la parada", () => {
    sucia("2026-10-07T08:00:00.000Z", ["a.ts"]);
    sucia("2026-10-07T08:15:00.000Z", ["src/suelto.ts", "src/otro.ts"]);
    const { runner: r, cuerpos } = runner();
    avisar(r);
    expect(cuerpos).toHaveLength(1);
    expect(cuerpos[0]).toContain(JORNADA);
    expect(cuerpos[0]).toContain("src/suelto.ts");
    expect(cuerpos[0]).toContain("src/otro.ts");
    expect(cuerpos[0]).not.toContain("a.ts\n");
  });

  it("nombra hasta diez archivos y dice cuántos más hay", () => {
    const muchos = Array.from({ length: 13 }, (_, i) => `src/f${String(i).padStart(2, "0")}.ts`);
    sucia("2026-10-07T08:00:00.000Z", muchos);
    sucia("2026-10-07T08:15:00.000Z", muchos);
    const { runner: r, cuerpos } = runner();
    avisar(r);
    expect(cuerpos[0]).toContain("src/f09.ts");
    expect(cuerpos[0]).not.toContain("src/f10.ts");
    expect(cuerpos[0]).toContain("y 3 más");
  });

  it("el mismo episodio no se avisa dos veces, ni aunque sigan pasando pasadas sucias", () => {
    sucia("2026-10-07T08:00:00.000Z");
    sucia("2026-10-07T08:15:00.000Z");
    const { runner: r, cuerpos } = runner();
    avisar(r);
    sucia("2026-10-07T08:30:00.000Z");
    avisar(r);
    expect(cuerpos).toHaveLength(1);
    expect(arbolSucio()).toEqual([]);
  });

  it("un árbol que se limpia y se vuelve a ensuciar es otro episodio", () => {
    sucia("2026-10-07T08:00:00.000Z");
    sucia("2026-10-07T08:15:00.000Z");
    const { runner: r, cuerpos } = runner();
    avisar(r);
    limpia("2026-10-07T08:30:00.000Z");
    expect(arbolSucio()).toEqual([]);
    sucia("2026-10-07T08:45:00.000Z");
    expect(arbolSucio()).toEqual([]);
    sucia("2026-10-07T09:00:00.000Z");
    avisar(r);
    expect(cuerpos).toHaveLength(2);
  });

  it("si el canal falla no se anota y se reintenta en la siguiente corrida", () => {
    sucia("2026-10-07T08:00:00.000Z");
    sucia("2026-10-07T08:15:00.000Z");
    avisar(runner(true).runner);
    expect(arbolSucio()).toHaveLength(1);
    const sano = runner();
    avisar(sano.runner);
    expect(sano.cuerpos).toHaveLength(1);
    expect(arbolSucio()).toEqual([]);
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

describe("una jornada terminada", () => {
  const escribirJornada = (journeyId: string, tickets: string[]) => {
    mkdirSync(join(raiz, ".valmen", "journeys"), { recursive: true });
    const linea = {
      kind: "journey.created", revisionId: `${journeyId}-alta`, journeyId, occurredAt: AHORA.toISOString(),
      tickets: tickets.map((ticketId, i) => ({ ticketId, order: i + 1, priority: i + 1, dependsOn: [] })),
      windows: [], projectId: "vig-lab", receivedAt: AHORA.toISOString(), cursor: 1,
    };
    writeFileSync(join(raiz, ".valmen", "journeys", "events.jsonl"), `${JSON.stringify(linea)}\n`, "utf8");
  };
  const terminadas = () => pendientesDeAvisar(paths, AHORA).filter((p) => p.kind === "jornada-terminada");

  it("se avisa una vez cuando todos sus tickets están cerrados, y no se repite", () => {
    writeFixtureTicket(raiz, { id: A, workflowStatus: "closed" });
    writeFixtureTicket(raiz, { id: B, workflowStatus: "closed" });
    escribirJornada("JOR-20261006", [A, B]);
    const { runner: r, cuerpos } = runner();

    avisar(r);
    expect(cuerpos).toHaveLength(1);
    expect(cuerpos[0]).toContain("JORNADA TERMINADA");
    expect(cuerpos[0]).toContain("JOR-20261006");

    avisar(r);
    expect(cuerpos).toHaveLength(1);
    expect(terminadas()).toEqual([]);
  });

  it("con un ticket sin cerrar no se avisa", () => {
    writeFixtureTicket(raiz, { id: A, workflowStatus: "closed" });
    writeFixtureTicket(raiz, { id: B, workflowStatus: "in_progress" });
    escribirJornada("JOR-20261006", [A, B]);
    expect(terminadas()).toEqual([]);
  });

  it("si el canal falla no se anota y vuelve a salir en la pasada siguiente", () => {
    writeFixtureTicket(raiz, { id: A, workflowStatus: "closed" });
    escribirJornada("JOR-20261006", [A]);
    avisar(runner(true).runner);
    expect(terminadas()).toHaveLength(1);

    const sano = runner();
    avisar(sano.runner);
    expect(sano.cuerpos).toHaveLength(1);
    expect(terminadas()).toEqual([]);
  });
});
