/**
 * La preparación del ambiente de pruebas corre antes de los criterios (R-CDEF-007).
 *
 * Lo que se afirma es la frontera de una migración y el orden de lo que corre:
 *
 * 1. La preparación declarada corre **antes** de los criterios y queda en el recibo con
 *    comando, resultado y duración.
 * 2. Dos corridas seguidas no fallan por el ambiente ya preparado.
 * 3. Un esquema fuera de `allowed-schemas` no ejecuta nada y el recibo dice por qué.
 * 4. Si la preparación falla, los criterios no corren y es una falla del entorno
 *    (revisión), no una prueba fallida.
 * 5. Sin `test-setup`, nada cambia.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runGate } from "../packages/engine/src/gate.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import { runTestSetup } from "../packages/engine/src/test-setup.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";

let lab: string;
const PATHS = (): { root: string; ticketsDir: string } => ({ root: lab, ticketsDir: "tickets" });

/** Un comando de verdad que anota en `orden.log` quién corrió. */
const anota = (quien: string): string =>
  `node -e "require('fs').appendFileSync('orden.log','${quien}\\n')"`;
const falla = 'node -e "process.exit(1)"';

function configuracion(setup: string, permitidos: string[] = ["test_x"]): void {
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(
    join(lab, ".valmen", "config.yaml"),
    [
      "name: Laboratorio",
      "test-commands:",
      "  - node",
      setup,
      ...(permitidos.length === 0 ? [] : ["allowed-schemas:", ...permitidos.map((p) => `  - ${p}`)]),
      "",
    ].join("\n"),
    "utf8",
  );
}

function setupCon(...comandos: string[]): string {
  return ["test-setup:", "  schema: test_x", "  commands:", ...comandos.map((c) => `    - ${c}`)].join("\n");
}

function ticket(): void {
  writeFixtureTicket(lab, {
    id: TICKET,
    workflowStatus: "in_progress",
    criterios: `- [ ] El criterio se cumple.\n      <!-- test: ${anota("criterio")} -->`,
  });
}

const correr = () => runGate(PATHS(), { gateId: "qa-mechanical", ticketId: TICKET });
const log = (): string[] =>
  existsSync(join(lab, "orden.log"))
    ? readFileSync(join(lab, "orden.log"), "utf8").split("\n").filter(Boolean)
    : [];

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-preparacion-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("la preparación corre antes de los criterios", () => {
  it("en ese orden, y el recibo la registra con comando, resultado y duración", async () => {
    configuracion(setupCon(anota("preparacion-1"), anota("preparacion-2")));
    ticket();

    const resultado = await correr();

    expect(resultado.stdout).toContain("APPROVE");
    expect(log()).toEqual(["preparacion-1", "preparacion-2", "criterio"]);

    const recibo = readReceipts(PATHS(), TICKET)[0];
    expect(recibo?.setup?.schema).toBe("test_x");
    expect(recibo?.setup?.failure).toBeNull();
    expect(recibo?.setup?.steps).toHaveLength(2);
    for (const paso of recibo?.setup?.steps ?? []) {
      expect(paso.outcome).toBe("ok");
      expect(paso.exitCode).toBe(0);
      expect(typeof paso.durationMs).toBe("number");
    }
    expect(resultado.stdout).toContain("Preparación del ambiente (esquema test_x)");
  });

  it("dos corridas seguidas no fallan por el ambiente ya preparado", async () => {
    configuracion(setupCon(anota("preparacion")));
    ticket();

    expect((await correr()).stdout).toContain("APPROVE");
    expect((await correr()).stdout).toContain("APPROVE");
    expect(log().filter((linea) => linea === "preparacion")).toHaveLength(2);
  });

  it("sin test-setup no cambia nada y el recibo no trae preparación", async () => {
    configuracion("");
    ticket();

    const resultado = await correr();

    expect(resultado.stdout).toContain("APPROVE");
    expect(log()).toEqual(["criterio"]);
    expect(readReceipts(PATHS(), TICKET)[0]?.setup).toBeUndefined();
    expect(runTestSetup(lab)).toBeNull();
  });
});

describe("el esquema de la preparación", () => {
  it("fuera de allowed-schemas no ejecuta nada y el recibo dice por qué", async () => {
    configuracion(setupCon(anota("preparacion")), ["otro_esquema"]);
    ticket();

    const resultado = await correr();

    // Ni la preparación ni los criterios: no hay ambiente preparado donde probar.
    expect(log()).toEqual([]);
    expect(resultado.stdout).toContain("REVIEW");
    expect(resultado.stdout).toContain("falla del entorno");
    const recibo = readReceipts(PATHS(), TICKET)[0];
    expect(recibo?.outcome).toBe("review");
    expect(recibo?.setup?.steps[0]?.outcome).toBe("refused");
    expect(recibo?.setup?.steps[0]?.detail).toContain("allowed-schemas");
  });

  it("sin allowed-schemas tampoco se ejecuta: la ausencia no habilita", async () => {
    configuracion(setupCon(anota("preparacion")), []);
    ticket();

    await correr();

    expect(log()).toEqual([]);
    expect(readReceipts(PATHS(), TICKET)[0]?.setup?.failure).toContain("no declara allowed-schemas");
  });
});

describe("si la preparación falla", () => {
  it("los criterios no corren y es una falla del entorno, no una prueba fallida", async () => {
    configuracion(setupCon(anota("preparacion-1"), falla, anota("preparacion-3")));
    ticket();

    const resultado = await correr();

    // Se detiene en el primer paso que falla: el tercero no corre, ni el criterio.
    expect(log()).toEqual(["preparacion-1"]);
    expect(resultado.stdout).toContain("REVIEW");
    expect(resultado.stdout).toContain("falla del entorno");
    expect(resultado.stdout).not.toContain("BLOCK");
    const recibo = readReceipts(PATHS(), TICKET)[0];
    expect(recibo?.outcome).toBe("review");
    expect(recibo?.setup?.steps.map((p) => p.outcome)).toEqual(["ok", "failed"]);
    expect(recibo?.setup?.failure).toContain("salió con 1");
  });

  it("un comando de preparación que no existe también es falla del entorno", async () => {
    configuracion(setupCon("comando-que-no-existe-xyz --migrate"));
    ticket();

    const resultado = await correr();

    expect(log()).toEqual([]);
    expect(resultado.stdout).toContain("falla del entorno");
    expect(readReceipts(PATHS(), TICKET)[0]?.setup?.steps[0]?.outcome).toBe("failed");
  });
});
