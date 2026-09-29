/**
 * El verbo `playwright` de los criterios, y la evidencia de la corrida.
 *
 * Un criterio de interfaz declara su spec con el verbo —`<!-- test: playwright
 * tests/pos/creacion-manual.spec.ts -->`— y la compuerta lo resuelve contra el
 * prefijo que el proyecto declara en `test-commands`: del criterio solo viaja la
 * ruta del spec y el programa sale de la configuración. Lo que se afirma acá es
 * eso, que sin un prefijo de Playwright el criterio se rechaza sin correr nada, y
 * que el recibo guarda el resultado de cada comando con la evidencia que dejó.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runGate } from "../packages/engine/src/gate.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import { commandChecksFor, extractCriteriaSpecs } from "../packages/gate/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "FEATURE-POS-PANTALLA-20260926";

let lab: string;

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

const correr = () => runGate(PATHS(), { gateId: "qa-mechanical", ticketId: TICKET });

/** Escribe el ticket en `in_progress`, con los criterios que pida el test. */
function ticket(criterios: string): void {
  writeFixtureTicket(lab, {
    id: TICKET,
    workflowStatus: "in_progress",
    criterios,
  });
}

/** Declara en el proyecto qué comandos se pueden correr como verificación. */
function comandos(prefixes: readonly string[]): void {
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(
    join(lab, ".valmen", "config.yaml"),
    `name: Laboratorio\ntest-commands:\n${prefixes.map((p) => `  - ${p}`).join("\n")}\n`,
    "utf8",
  );
}

/** El criterio del verbo: solo su ruta viaja, el programa sale de la config. */
const CRITERIO_VERBO =
  "- [ ] La pantalla de creación manual guarda la orden.\n" +
  "      <!-- test: playwright tests/pos/creacion-manual.spec.ts -->";

/** Un runner de mentira que escribe la traza y sale 0, como Playwright. */
function runnerPlaywright(): void {
  writeFileSync(
    join(lab, "playwright"),
    [
      "const { mkdirSync, writeFileSync } = require('node:fs');",
      "mkdirSync('test-results/creacion-manual', { recursive: true });",
      "writeFileSync('test-results/creacion-manual/trace.zip', 'traza');",
    ].join("\n"),
    "utf8",
  );
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-playwright-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("el verbo se resuelve contra el comando declarado", () => {
  it("corre el comando de la configuración con la ruta del spec y aprueba", async () => {
    comandos(["node playwright"]);
    ticket(CRITERIO_VERBO);
    runnerPlaywright();

    const criterios = extractCriteriaSpecs(CRITERIO_VERBO);
    const { checks, refused } = commandChecksFor(criterios, ["node playwright"]);

    expect(refused).toEqual([]);
    expect(checks[0]?.command).toBe("node");
    expect(checks[0]?.args).toEqual(["playwright", "tests/pos/creacion-manual.spec.ts"]);
    expect(checks[0]?.artifactDirs).toEqual(["test-results", "playwright-report"]);

    const resultado = await correr();

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("APPROVE");
  });

  it("sin un prefijo de Playwright declarado rechaza el criterio sin correr nada", async () => {
    // La decisión es rechazo: el verbo no inventa el programa. Sin un prefijo
    // declarado que lo contenga, el criterio nombra algo que el proyecto no
    // autorizó y la compuerta lo dice sin ejecutar nada.
    comandos(["node"]);
    ticket(CRITERIO_VERBO);
    runnerPlaywright();

    const resultado = await correr();

    expect(resultado.exitCode).toBe(3);
    expect(resultado.stderr).toContain("no autoriza");
    expect(resultado.stderr).toContain("playwright");
    expect(resultado.stderr).toContain("test-commands");
    expect(readReceipts(PATHS(), TICKET)).toEqual([]);
  });
});

describe("el prefijo completo no se toca", () => {
  it("un criterio con el prefijo completo se arma tal cual, sin resolución", () => {
    // Es la regresión que la resolución del verbo podría romper: un criterio que
    // ya empieza con el prefijo declarado se ejecuta como está escrito.
    const criterios = extractCriteriaSpecs(
      "- [ ] La pantalla de creación manual guarda la orden.\n" +
        "      <!-- test: npx playwright test tests/x.spec.ts -->",
    );

    const { checks } = commandChecksFor(criterios, ["npx playwright test"]);

    expect(checks[0]?.command).toBe("npx");
    expect(checks[0]?.args).toEqual(["playwright", "test", "tests/x.spec.ts"]);
    expect(checks[0]?.artifactDirs).toBeUndefined();
  });
});

describe("el recibo guarda lo que la corrida dejó", () => {
  it("guarda la invocación, el código obtenido, la duración y la salida capturada", async () => {
    comandos(["node"]);
    writeFileSync(
      join(lab, "falla.js"),
      "console.log('hola desde el comando');\nprocess.exitCode = 1;\n",
      "utf8",
    );
    ticket(
      "- [ ] Un criterio que falla y explica por qué.\n      <!-- test: node falla.js -->",
    );

    const resultado = await correr();

    expect(resultado.exitCode).toBe(3);
    // La salida de la compuerta muestra el comando, no solo el veredicto.
    expect(resultado.stdout).toContain("node falla.js");
    expect(resultado.stdout).toContain("salida 1");
    const comando = readReceipts(PATHS(), TICKET)[0]?.commandResults?.[0];
    expect(comando?.invocation).toBe("node falla.js");
    expect(comando?.exitCode).toBe(1);
    expect(comando?.expectedExitCode).toBe(0);
    expect(comando?.passed).toBe(false);
    expect(comando?.durationMs).toBeGreaterThanOrEqual(0);
    expect(comando?.stdout).toContain("hola desde el comando");
  });

  it("referencia la evidencia que la corrida dejó en el directorio del check", async () => {
    comandos(["node playwright"]);
    ticket(CRITERIO_VERBO);
    runnerPlaywright();

    await correr();

    const artifacts = readReceipts(PATHS(), TICKET)[0]?.commandResults?.[0]?.artifacts;
    expect(artifacts).toContainEqual({
      path: "test-results/creacion-manual/trace.zip",
      bytes: 5,
    });
  });

  it("un archivo de evidencia anterior al arranque queda fuera del recibo", async () => {
    // Listar el directorio entero atribuiría al recibo la traza de una corrida
    // anterior: una afirmación falsa con forma de prueba.
    comandos(["node playwright"]);
    ticket(CRITERIO_VERBO);
    runnerPlaywright();

    const viejo = join(lab, "test-results", "viejo");
    mkdirSync(viejo, { recursive: true });
    const viejoPath = join(viejo, "trace.zip");
    writeFileSync(viejoPath, "vieja", "utf8");
    // Se envejece a propósito: sin esto caería dentro del margen de un segundo.
    utimesSync(viejoPath, 1, 1);

    await correr();

    const rutas =
      readReceipts(PATHS(), TICKET)[0]?.commandResults?.[0]?.artifacts?.map(
        (artifact) => artifact.path,
      ) ?? [];
    expect(rutas).toContain("test-results/creacion-manual/trace.zip");
    expect(rutas).not.toContain("test-results/viejo/trace.zip");
  });
});

describe("la documentación", () => {
  it("nombra el verbo playwright entre las formas de verificar un criterio", () => {
    const texto = readFileSync(new URL("../docs/03-GATES.md", import.meta.url), "utf8");
    expect(texto).toContain("playwright");
  });
});
