/**
 * La sección `playwright:` de `.valmen/config.yaml`, y lo que depende de ella.
 *
 * R-S4-003 pide que el proyecto pueda declarar —en una sección propia— el
 * comando exacto, el navegador por defecto, su timeout propio (distinto del de
 * los tests de backend) y el modelo recomendado para escribir los specs. Lo que
 * se protege acá:
 *
 * 1. **La lectura de los cuatro datos**, con la forma estricta del resto del
 *    archivo: una sección mal formada falla al leerla en vez de interpretarse.
 * 2. **La ausencia de la sección apaga el verbo.** Sin `playwright:` el verbo se
 *    rechaza nombrando la sección, no se corre ningún comando, y la compuerta de
 *    plan no despliega la proposición de declaración de interfaz.
 * 3. **El comando y el timeout del check salen de la sección**, y el navegador se
 *    agrega como `--project`: del criterio solo viaja la ruta del spec.
 * 4. **El modelo declarado resuelve el rol `ui-specs`** del enrutado, con origen
 *    `proyecto`.
 *
 * Nada sale a la red: el evaluador del gate de plan entra inyectado.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type ConfigMap,
  parseConfig,
  readPlaywrightConfig,
  resolveRouting,
  uiSpecsRoutingFor,
} from "../packages/adapter/src/index.js";
import { runGate } from "../packages/engine/src/gate.js";
import { playwrightConfig } from "../packages/engine/src/discovery.js";
import { testCommands } from "../packages/engine/src/gate.js";
import { interfazDelTicket } from "../packages/engine/src/interfaz.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import {
  PROPOSICION_PLAYWRIGHT,
  commandChecksFor,
  extractCriteriaSpecs,
} from "../packages/gate/src/index.js";
import { renderFixtureTicket, writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "FEATURE-POS-PANTALLA-20260926";
const TICKET_PLAN = "FEATURE-POS-PANTALLA-20260927";

let lab: string;

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

/** El criterio del verbo: solo su ruta viaja, el programa sale de la sección. */
const CRITERIO_VERBO =
  "- [ ] La pantalla de creación manual guarda la orden.\n" +
  "      <!-- test: playwright tests/pos/creacion-manual.spec.ts -->";

/** Escribe `.valmen/config.yaml` con el contenido exacto que pida cada prueba. */
function configYaml(texto: string): void {
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(join(lab, ".valmen", "config.yaml"), texto, "utf8");
}

/** La sección declarada, tal como la escribiría una persona. */
function seccionDeclarada(options: {
  readonly command?: string;
  readonly project?: string;
  readonly timeout?: number | string;
  readonly provider?: string;
  readonly model?: string;
} = {}): void {
  const lineas = [
    "name: Laboratorio",
    "test-commands:",
    "  - npx vitest run",
    "playwright:",
    `  command: ${options.command ?? "npx playwright test"}`,
    ...(options.project === undefined ? [] : [`  project: ${options.project}`]),
    ...(options.timeout === undefined ? [] : [`  timeout: ${options.timeout}`]),
    ...(options.provider === undefined ? [] : [`  provider: ${options.provider}`]),
    ...(options.model === undefined ? [] : [`  model: ${options.model}`]),
    "",
  ];
  configYaml(lineas.join("\n"));
}

/** Un ticket con el criterio del verbo. */
function ticket(criterios: string): void {
  writeFixtureTicket(lab, {
    id: TICKET,
    workflowStatus: "in_progress",
    criterios,
  });
}

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

/** El conteo de invocaciones del runner, para comprobar que no se corrió nada. */
function marcadorDeCorrida(): string {
  const marcador = join(lab, "corrio.txt");
  writeFileSync(
    join(lab, "playwright"),
    [
      "const { writeFileSync } = require('node:fs');",
      `writeFileSync(${JSON.stringify(marcador)}, 'corrio');`,
    ].join("\n"),
    "utf8",
  );
  return marcador;
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-config-playwright-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
  mkdirSync(join(lab, "tests/pos"), { recursive: true });
  writeFileSync(join(lab, "tests/pos/creacion-manual.spec.ts"), "// Spec del repositorio\n");
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

// ── Lectura de los cuatro datos ─────────────────────────────────────────────

describe("la sección declara los cuatro datos", () => {
  it("lee el comando exacto, el navegador, el timeout y el modelo", () => {
    const config: ConfigMap = parseConfig(
      [
        "name: Laboratorio",
        "playwright:",
        "  command: npx playwright test",
        "  project: firefox",
        "  timeout: 120",
        "  provider: openrouter",
        "  model: moonshotai/kimi-k3",
      ].join("\n"),
    );

    const seccion = readPlaywrightConfig(config);
    expect(seccion).not.toBeNull();
    // El comando es el texto exacto declarado.
    expect(seccion?.command).toBe("npx playwright test");
    // El navegador por defecto declarado.
    expect(seccion?.project).toBe("firefox");
    // El timeout propio, en milisegundos.
    expect(seccion?.timeoutMs).toBe(120_000);
    // El modelo recomendado, con su proveedor.
    expect(seccion?.provider).toBe("openrouter");
    expect(seccion?.model).toBe("moonshotai/kimi-k3");
  });

  it("usa chromium y el proveedor por defecto cuando no se declaran", () => {
    const config = parseConfig(
      ["playwright:", "  command: npx playwright test"].join("\n"),
    );
    const seccion = readPlaywrightConfig(config);
    expect(seccion?.project).toBe("chromium");
    expect(seccion?.provider).toBe("openrouter");
    expect(seccion?.timeoutMs).toBe(30_000);
    expect(seccion?.model).toBe("");
  });

  it("el motor lee la misma sección desde `.valmen/config.yaml`", () => {
    seccionDeclarada({
      command: "pnpm exec playwright test",
      project: "webkit",
      timeout: 200,
    });

    const seccion = playwrightConfig(lab);
    expect(seccion?.command).toBe("pnpm exec playwright test");
    expect(seccion?.project).toBe("webkit");
    expect(seccion?.timeoutMs).toBe(200_000);
  });

  it("un proyecto sin la sección devuelve null: la ausencia es la declaración", () => {
    configYaml("name: Laboratorio\ntest-commands:\n  - npx vitest run\n");
    expect(playwrightConfig(lab)).toBeNull();
    // Y sin archivo tampoco es un error.
    expect(playwrightConfig(join(lab, "otro"))).toBeNull();
  });

  it("el timeout propio no es el mismo que el de backend", () => {
    // El proyecto declara un tope para backend y otro para el navegador: la
    // sección no pisa `test-timeout` ni al revés.
    configYaml(
      [
        "name: Laboratorio",
        "test-timeout: 30",
        "playwright:",
        "  command: npx playwright test",
        "  timeout: 300",
      ].join("\n"),
    );
    expect(playwrightConfig(lab)?.timeoutMs).toBe(300_000);
  });
});

// ── Sección mal formada ─────────────────────────────────────────────────────

describe("una sección mal formada falla al leerla", () => {
  it("rechaza un timeout que no es un número positivo", () => {
    const config = parseConfig(
      [
        "playwright:",
        "  command: npx playwright test",
        "  timeout: cero",
      ].join("\n"),
    );
    expect(() => readPlaywrightConfig(config)).toThrow(/playwright.timeout/);

    const negativo = parseConfig(
      ["playwright:", "  command: npx playwright test", "  timeout: -5"].join("\n"),
    );
    expect(() => readPlaywrightConfig(negativo)).toThrow(/número de segundos mayor que cero/);
  });

  it("rechaza una sección declarada sin comando", () => {
    const config = parseConfig(["playwright:", "  project: chromium"].join("\n"));
    expect(() => readPlaywrightConfig(config)).toThrow(/playwright.command/);
  });

  it("rechaza un valor que no es texto", () => {
    const config = parseConfig(
      ["playwright:", "  command: npx playwright test", "  project:", "    - chromium"].join(
        "\n",
      ),
    );
    // El error nombra la clave y que debe ser un texto.
    expect(() => readPlaywrightConfig(config)).toThrow(/"project"/);
    expect(() => readPlaywrightConfig(config)).toThrow(/debe ser un texto/);
  });

  it("el motor falla en voz alta al leer una sección inválida", () => {
    configYaml(
      ["playwright:", "  command: npx playwright test", "  timeout: no-es-numero"].join("\n"),
    );
    expect(() => playwrightConfig(lab)).toThrow(/playwright.timeout/);
  });
});

// ── Ausencia: verbo apagado y sin proposición ───────────────────────────────

describe("sin la sección el verbo está apagado", () => {
  it("rechaza el criterio nombrando la sección y no corre ningún comando", async () => {
    configYaml("name: Laboratorio\ntest-commands:\n  - npx vitest run\n");
    ticket(CRITERIO_VERBO);
    const marcador = marcadorDeCorrida();

    const resultado = await runGate(PATHS(), {
      gateId: "qa-mechanical",
      ticketId: TICKET,
    });

    expect(resultado.exitCode).toBe(3);
    expect(resultado.stderr).toContain("el comando debe estar autorizado");
    expect(resultado.stderr).toContain("playwright:");
    expect(resultado.stderr).toContain(".valmen/config.yaml");
    // El programa no se corrió: no dejó el marcador.
    expect(() => readFileSync(marcador, "utf8")).toThrow();
    expect(readReceipts(PATHS(), TICKET)).toEqual([]);
  });

  it("la compuerta de plan no despliega la proposición de declaración de interfaz", () => {
    // El proyecto no declara Playwright: la pregunta no aparece, y la ausencia no
    // se penaliza. La misma pantalla citada, con la sección, sí la despliega.
    const texto = renderFixtureTicket({
      id: TICKET,
      workflowStatus: "planned",
      plan: "1. Tocar `FrontEnd/src/pos/PantallaOrdenes.component.html`.",
    });

    const sinSeccion = interfazDelTicket({ texto, comandos: ["npx vitest run"] });
    expect(sinSeccion.capacidadDisponible).toBe(false);
    expect(sinSeccion.requiereDeclaracion).toBe(false);
    expect(sinSeccion.specs).toBeNull();

    const conSeccion = interfazDelTicket({
      texto,
      comandos: ["npx vitest run"],
      playwright: { command: "npx playwright test", project: "chromium", timeoutMs: 30_000, provider: "openrouter", model: "" },
    });
    expect(conSeccion.capacidadDisponible).toBe(true);
    expect(conSeccion.requiereDeclaracion).toBe(true);
  });
});

// ── El comando y el timeout del check ──────────────────────────────────────

describe("el check del verbo sale de la sección", () => {
  it("el comando sale de la sección y del criterio solo viaja la ruta del spec", () => {
    const criterios = extractCriteriaSpecs(CRITERIO_VERBO);
    const { checks, refused } = commandChecksFor(criterios, ["npx vitest run"], undefined, {
      command: "npx playwright test",
      project: "chromium",
      timeoutMs: 120_000,
    }, { root: lab, esArchivo: (ruta) => statSync(ruta).isFile() });

    expect(refused).toEqual([]);
    expect(checks[0]?.command).toBe("npx");
    expect(checks[0]?.args).toEqual([
      "playwright",
      "test",
      "--project",
      "chromium",
      "tests/pos/creacion-manual.spec.ts",
    ]);
  });

  it("el check usa el timeout propio de la sección y no el de backend", () => {
    const criterios = extractCriteriaSpecs(CRITERIO_VERBO);
    const { checks } = commandChecksFor(criterios, ["npx vitest run"], 30_000, {
      command: "npx playwright test",
      project: "chromium",
      timeoutMs: 300_000,
    }, { root: lab, esArchivo: (ruta) => statSync(ruta).isFile() });
    expect(checks[0]?.timeoutMs).toBe(300_000);
  });

  it("agrega el proyecto por defecto de la sección como --project", () => {
    const criterios = extractCriteriaSpecs(CRITERIO_VERBO);
    const { checks } = commandChecksFor(criterios, [], undefined, {
      command: "node playwright",
      project: "firefox",
      timeoutMs: 30_000,
    }, { root: lab, esArchivo: (ruta) => statSync(ruta).isFile() });
    const args = checks[0]?.args ?? [];
    expect(args).toContain("--project");
    expect(args[args.indexOf("--project") + 1]).toBe("firefox");
  });

  it("corre el comando de la sección de punta a punta y aprueba", async () => {
    // El comando de la sección se agrega a los autorizados: sin eso la
    // comprobación previa rechazaría un proyecto cuya única interfaz es el verbo.
    seccionDeclarada({ command: "node playwright" });
    ticket(CRITERIO_VERBO);
    runnerPlaywright();

    expect(testCommands(lab)).toContain("node playwright");

    const resultado = await runGate(PATHS(), {
      gateId: "qa-mechanical",
      ticketId: TICKET,
    });

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("APPROVE");
  });
});

// ── El rol ui-specs ─────────────────────────────────────────────────────────

describe("el rol ui-specs", () => {
  it("resuelve el proveedor y el modelo declarados, con origen proyecto", () => {
    configYaml(
      [
        "playwright:",
        "  command: npx playwright test",
        "  provider: openrouter",
        "  model: moonshotai/kimi-k3",
      ].join("\n"),
    );

    const specs = uiSpecsRoutingFor(lab);
    expect(specs.provider).toBe("openrouter");
    expect(specs.model).toBe("moonshotai/kimi-k3");
    expect(specs.source).toBe("proyecto");
  });

  it("sin la sección cae al preset", () => {
    configYaml("name: Laboratorio\n");
    const specs = uiSpecsRoutingFor(lab);
    expect(specs.model).not.toBe("");
    expect(specs.source).toBe("preset");
  });

  it("el override de routing.yaml sigue ganando sobre la sección", () => {
    configYaml(
      [
        "playwright:",
        "  command: npx playwright test",
        "  provider: openrouter",
        "  model: moonshotai/kimi-k3",
      ].join("\n"),
    );
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(
      join(lab, ".valmen", "routing.yaml"),
      [
        "preset: balanced",
        "roles:",
        "  ui-specs:",
        "    provider: openrouter",
        "    model: anthropic/claude-opus-4.6",
        "    effort: high",
      ].join("\n"),
      "utf8",
    );

    const specs = uiSpecsRoutingFor(lab);
    expect(specs.model).toBe("anthropic/claude-opus-4.6");
    expect(specs.effort).toBe("high");
    expect(specs.source).toBe("proyecto");
  });

  it("la resolución general expone el rol con su origen", () => {
    const rutas = resolveRouting(
      { preset: "balanced", roles: {} },
      { command: "npx playwright test", project: "chromium", timeoutMs: 30_000, provider: "openrouter", model: "moonshotai/kimi-k3" },
    );
    const specs = rutas.find((ruta) => ruta.role === "ui-specs");
    expect(specs?.model).toBe("moonshotai/kimi-k3");
    expect(specs?.source).toBe("proyecto");
  });
});

// ── La proposición de plan con la sección declarada ─────────────────────────

describe("la compuerta de plan con la sección declarada", () => {
  it("despliega la proposición de declaración de interfaz", async () => {
    seccionDeclarada({ command: "node playwright" });
    writeFixtureTicket(lab, {
      id: TICKET_PLAN,
      workflowStatus: "planned",
      diagnostico: [
        "- Archivos y flujo investigados: los colores están en",
        "  `FrontEnd/src/pos/PantallaOrdenes.component.ts:140`.",
        "- Causa raíz o hipótesis: el contraste se rompe.",
        "- Riesgos y compatibilidad: ninguno.",
        "- Impactos de sync, migración, Docker o despliegue: ninguno.",
      ].join("\n"),
      plan: [
        "- Pasos ordenados:",
        "  1. Ajustar `FrontEnd/src/pos/PantallaOrdenes.component.html`.",
        "- Rollback: revertir el cambio.",
      ].join("\n"),
    });

    const interfaz = interfazDelTicket({
      texto: readFileSync(
        join(lab, "tickets", "2026", TICKET_PLAN, "ticket.md"),
        "utf8",
      ),
      comandos: testCommands(lab),
      playwright: playwrightConfig(lab),
    });

    expect(interfaz.requiereDeclaracion).toBe(true);
    expect(interfaz.specs).toEqual({ provider: "openrouter", model: "" });
    // El identificador es el que viaja al recibo del gate de plan.
    expect(PROPOSICION_PLAYWRIGHT).toBe("recomendacion_playwright");
  });
});
