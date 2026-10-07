/**
 * La proposición de Playwright en el gate de plan: el agente propone, la persona
 * decide.
 *
 * R-S4-002 pide que cuando un plan toca una pantalla y el proyecto declara la
 * capacidad de interfaz, el gate de plan despliegue **una** proposición atómica
 * que pide la declaración —recomendar o no recomendar cubrir los criterios de
 * interfaz con Playwright, y por qué—, y que **las dos respuestas valgan**: un
 * plan que declara que no lo recomienda es un plan completo, no un hallazgo.
 * Sin la capacidad declarada, o sin pantallas entre los archivos que el ticket
 * cita, la proposición no aparece: la ausencia de Playwright no se pregunta ni
 * se penaliza.
 *
 * Lo que se protege acá es el disparador en código —el cruce de las rutas citadas
 * contra el matcher de pantalla y del verbo contra `test-commands`—, la unicidad
 * de la pregunta, y la propiedad que sostiene el requisito: la recomendación no
 * escribe nada, y una corrida real sobre el ticket no toca el archivo.
 *
 * Nada sale a la red: el evaluador entra inyectado, y la capacidad se resuelve
 * contra los prefijos que el laboratorio declara en su `.valmen/config.yaml`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const REPO = process.cwd();
const REFERENCIA = "docs/03-GATES.md";

import { interfazDelTicket } from "../packages/engine/src/interfaz.js";
import { esPantalla } from "../packages/engine/src/manuales.js";
import { runGate } from "../packages/engine/src/gate.js";
import { readReceipts } from "../packages/engine/src/receipts.js";import {
  ANALYSIS_GATE,
  PLAN_GATE,
  PROPOSICION_PLAYWRIGHT,
  expandGate,
  gateFor,
  type CriterionSpec,
  type Proposition,
} from "../packages/gate/src/index.js";
import { renderFixtureTicket, writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "AGENT-ENGINE-CONSULTA-CAPACIDAD-UI-20260926";

/** El patrón de pantalla propio que un proyecto puede declarar. */
const PANTALLAS_PY = ["**/*.ui.py"] as const;

/** Los comandos de un proyecto que declara la capacidad de interfaz. */
const CON_PLAYWRIGHT = ["npx vitest run"] as const;

/** Los comandos de un proyecto sin la capacidad declarada. */
const SIN_PLAYWRIGHT = ["npx vitest run"] as const;

/** La declaración de la sección `playwright:` del laboratorio. */
const SECCION_PLAYWRIGHT = {
  command: "npx playwright test",
  project: "chromium",
  timeoutMs: 30_000,
  provider: "openrouter",
  model: "moonshotai/kimi-k3",
} as const;

/** Los comandos de un proyecto que no declara la capacidad: sin sección. */
const SIN_SECCION = null;

/** Un plan que toca una pantalla y declara su recomendación —el `no` vale. */
const PLAN_CON_DECLARACION = [
  "- Pasos ordenados:",
  "  1. Ajustar el modo oscuro en `FrontEnd/src/pos/PantallaOrdenes.component.html`.",
  "  2. Declarar en `FrontEnd/src/pos/PantallaOrdenes.component.ts` los colores del tema.",
  "- Declaración de interfaz: este plan **no recomienda** cubrir los criterios de",
  "  interfaz con Playwright, porque el cambio es de estilo declarativo y la",
  "  validación queda como `verify: manual` en los criterios.",
].join("\n");

/** El diagnóstico que cita una pantalla, con una referencia `:línea`. */
const DIAGNOSTICO_CON_PANTALLA = [
  "- Archivos y flujo investigados: los colores del tema están escritos a mano en",
  "  `FrontEnd/src/pos/PantallaOrdenes.component.ts:140-160`.",
  "- Causa raíz o hipótesis: el contraste se rompe en modo oscuro.",
  "- Riesgos y compatibilidad: ninguno relevante.",
  "- Impactos de sync, migración, Docker o despliegue: ninguno.",
].join("\n");

/** Un criterio manual, como los que se verifican mirando la pantalla. */
function criterion(text: string): CriterionSpec {
  return { text, command: null, manual: true };
}

/** El texto completo de un ticket de laboratorio, con el diagnóstico y el plan pedidos. */
function textoTicket(options: { readonly diagnostico?: string; readonly plan?: string }): string {
  return renderFixtureTicket({
    id: TICKET,
    workflowStatus: "planned",
    ...(options.diagnostico === undefined ? {} : { diagnostico: options.diagnostico }),
    ...(options.plan === undefined ? {} : { plan: options.plan }),
  });
}

/** El gate de plan expandido con el sujeto que se le pase. */
function planExpandido(options: {
  readonly criteria?: readonly CriterionSpec[];
  readonly impacts?: readonly string[];
  readonly interfaz: Parameters<typeof gateFor>[1]["interfaz"];
}) {
  return gateFor(PLAN_GATE, {
    criteria: options.criteria ?? [],
    impacts: options.impacts ?? [],
    interfaz: options.interfaz,
  });
}

let lab: string;

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

/**
 * Un evaluador que responde siempre lo mismo.
 *
 * Los números vienen de afuera: esta batería mide **qué pregunta** el gate, no
 * qué contesta un modelo. Con todos los valores en banda de aprobación, el
 * veredicto depende solo de las proposiciones que se desplieguen.
 */
function jevFijo(): NonNullable<Parameters<typeof runGate>[1]["jev"]> {
  return (async ({ propositions }: { propositions: readonly Proposition[] }) => ({
    answers: propositions.map((proposicion) =>
      proposicion.kind === "choice"
        ? { id: proposicion.id, kind: "choice" as const, choice: "completo" }
        : proposicion.kind === "score"
          ? { id: proposicion.id, kind: "score" as const, score: 1 }
          : { id: proposicion.id, kind: "noul" as const, value: 0.99 },
    ),
    model: { provider: "laboratorio", model: "jev-fijo", resolvedVersion: "jev-fijo" },
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    latencyMs: 1,
  })) as NonNullable<Parameters<typeof runGate>[1]["jev"]>;
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-playwright-plan-"));
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  // La capacidad de interfaz se declara en la configuración del proyecto, igual
  // que en uno adoptado: el verbo se resuelve contra este prefijo.
  writeFileSync(
    join(lab, ".valmen", "config.yaml"),
    "test-commands:\n  - npx vitest run\nplaywright:\n  command: npx playwright test\n  project: chromium\n",
    "utf8",
  );
  mkdirSync(join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("el disparador se decide en código", () => {
  it("reconoce la pantalla citada con su :línea y la normaliza", () => {
    const interfaz = interfazDelTicket({
      texto: textoTicket({
        diagnostico: DIAGNOSTICO_CON_PANTALLA,
        plan: "1. Tocar `FrontEnd/src/pos/PantallaOrdenes.component.html`.",
      }),
      comandos: CON_PLAYWRIGHT,
      playwright: SECCION_PLAYWRIGHT,
    });

    expect(interfaz.tocaPantalla).toBe(true);
    // La referencia de línea no es parte de la ruta: dos citas del mismo archivo
    // son una pantalla, y la lista sale en orden alfabético.
    expect(interfaz.pantallas).toEqual([
      "FrontEnd/src/pos/PantallaOrdenes.component.html",
      "FrontEnd/src/pos/PantallaOrdenes.component.ts",
    ]);
    expect(interfaz.capacidadDisponible).toBe(true);
    expect(interfaz.requiereDeclaracion).toBe(true);
  });

  it("ignora una ruta que el patrón de pantalla no reconoce", () => {
    const interfaz = interfazDelTicket({
      texto: textoTicket({
        plan: "1. Cambiar `BackEnd/pos/filters.py`.\n2. Actualizar `BackEnd/pos/tests/test_filters.py`.",
      }),
      comandos: CON_PLAYWRIGHT,
      playwright: SECCION_PLAYWRIGHT,
    });

    expect(interfaz.tocaPantalla).toBe(false);
    expect(interfaz.pantallas).toEqual([]);
    expect(interfaz.requiereDeclaracion).toBe(false);
  });

  it("solo lee las secciones Diagnóstico y Plan, y da las rutas en orden alfabético", () => {
    const interfaz = interfazDelTicket({
      texto: textoTicket({
        diagnostico: [
          "- Archivos y flujo investigados: `FrontEnd/src/pos/Beta.component.html`.",
          "- Causa raíz o hipótesis: el contraste.",
          "- Riesgos y compatibilidad: ninguno.",
          "- Impactos de sync, migración, Docker o despliegue: ninguno.",
        ].join("\n"),
        plan: "1. Tocar `FrontEnd/src/pos/Alfa.component.html`.",
      }),
      comandos: CON_PLAYWRIGHT,
      playwright: SECCION_PLAYWRIGHT,
    });
    // La misma pantalla citada en los criterios no cuenta: la cita vive en
    // Diagnóstico y Plan, que es donde el ticket nombra archivos.
    const conCitaEnCriterios = interfazDelTicket({
      texto: renderFixtureTicket({
        id: TICKET,
        workflowStatus: "planned",
        criterios: "- [ ] `FrontEnd/src/pos/Zeta.component.html` queda legible.\n      <!-- verify: manual -->",
        plan: "1. Tocar `FrontEnd/src/pos/Alfa.component.html`.",
      }),
      comandos: CON_PLAYWRIGHT,
      playwright: SECCION_PLAYWRIGHT,
    });

    expect(interfaz.pantallas).toEqual([
      "FrontEnd/src/pos/Alfa.component.html",
      "FrontEnd/src/pos/Beta.component.html",
    ]);
    expect(conCitaEnCriterios.pantallas).toEqual(["FrontEnd/src/pos/Alfa.component.html"]);
  });

  it("acepta un patrón de pantalla propio del proyecto", () => {
    const interfaz = interfazDelTicket({
      texto: textoTicket({ plan: "1. Tocar `FrontEnd/pos/pantalla_ordenes.ui.py`." }),
      comandos: CON_PLAYWRIGHT,
      playwright: SECCION_PLAYWRIGHT,
      pantallas: PANTALLAS_PY,
    });

    expect(interfaz.tocaPantalla).toBe(true);
    expect(interfaz.pantallas).toEqual(["FrontEnd/pos/pantalla_ordenes.ui.py"]);
    expect(interfaz.requiereDeclaracion).toBe(true);
  });

  it("esPantalla sigue siendo la misma regla para la auditoría de manuales", () => {
    // El matcher exportado es el de la auditoría: su comportamiento no cambió.
    expect(esPantalla("a/b/Pantalla.component.ts", ["**/*.component.ts"])).toBe(true);
    expect(esPantalla("a/b/globals.css", ["**/*.component.ts"])).toBe(false);
    expect(esPantalla("docs/manual.md", ["docs/manual.md"])).toBe(true);
  });
});

describe("el despliegue de la proposición en el gate de plan", () => {
  it("despliega exactamente una proposición de declaración con pantalla y capacidad", () => {
    const interfaz = interfazDelTicket({
      texto: textoTicket({
        diagnostico: DIAGNOSTICO_CON_PANTALLA,
        plan: "1. Tocar `FrontEnd/src/pos/PantallaOrdenes.component.html`.",
      }),
      comandos: CON_PLAYWRIGHT,
      playwright: SECCION_PLAYWRIGHT,
    });
    const expandido = planExpandido({
      criteria: [criterion("La pantalla es legible en modo oscuro")],
      impacts: ["migration_impact"],
      interfaz,
    });

    const deInterfaz = expandido.propositions.filter((p) => p.id === PROPOSICION_PLAYWRIGHT);
    // Una sola, aunque el ticket cite dos pantallas.
    expect(deInterfaz).toHaveLength(1);
    expect(expandido.id).toBe("plan+criterios+impactos+interfaz");

    // Cada expansión aporta lo suyo, en el orden del ensamblado, y las fijas
    // quedan detrás.
    const ids = expandido.propositions.map((p) => p.id);
    expect(ids.indexOf("criterio_01")).toBeLessThan(ids.indexOf("migration_impact_orden"));
    expect(ids.indexOf("migration_impact_reversion")).toBeLessThan(ids.indexOf(PROPOSICION_PLAYWRIGHT));
    expect(ids).toContain("clasificacion");
  });

  it("sin capacidad declarada no despliega la proposición", () => {
    const interfaz = interfazDelTicket({
      texto: textoTicket({
        diagnostico: DIAGNOSTICO_CON_PANTALLA,
        plan: "1. Tocar `FrontEnd/src/pos/PantallaOrdenes.component.html`.",
      }),
      comandos: SIN_PLAYWRIGHT,
      playwright: SIN_SECCION,
    });

    expect(interfaz.capacidadDisponible).toBe(false);
    expect(interfaz.requiereDeclaracion).toBe(false);

    const expandido = planExpandido({ interfaz });
    expect(expandido.propositions.map((p) => p.id)).not.toContain(PROPOSICION_PLAYWRIGHT);
    expect(expandido.id).toBe("plan");
  });

  it("sin pantalla citada no despliega la proposición, aunque haya capacidad", () => {
    const interfaz = interfazDelTicket({
      texto: textoTicket({ plan: "1. Cambiar `BackEnd/pos/filters.py`." }),
      comandos: CON_PLAYWRIGHT,
      playwright: SECCION_PLAYWRIGHT,
    });

    expect(interfaz.tocaPantalla).toBe(false);
    expect(interfaz.requiereDeclaracion).toBe(false);

    const expandido = planExpandido({ interfaz });
    expect(expandido.propositions.map((p) => p.id)).not.toContain(PROPOSICION_PLAYWRIGHT);
    expect(expandido.id).toBe("plan");
  });

  it("la compuerta de análisis no la despliega: protege el estado anterior al plan", () => {
    const expandido = expandGate(ANALYSIS_GATE, {
      criteria: [],
      impacts: [],
      interfaz: { requiereDeclaracion: true, pantallas: ["a/Pantalla.component.html"] },
    });
    expect(expandido.propositions.map((p) => p.id)).toEqual(
      ANALYSIS_GATE.propositions.map((p) => p.id),
    );
    expect(expandido.propositions.map((p) => p.id)).not.toContain(PROPOSICION_PLAYWRIGHT);
  });
});

describe("el enunciado de la proposición", () => {
  it("declara válidas las dos respuestas: recomendar y no recomendar", () => {
    const proposicion = planExpandido({
      interfaz: { requiereDeclaracion: true, pantallas: ["a/Pantalla.component.html"] },
    }).propositions.find((p) => p.id === PROPOSICION_PLAYWRIGHT) as Extract<
      Proposition,
      { kind: "noul" }
    >;

    // El `yes` cubre las dos respuestas y el `no` describe la ausencia de la
    // **declaración**, no la ausencia de la herramienta: un plan que decide no
    // usar Playwright es un plan completo.
    expect(proposicion.criteria?.yes).toContain("recomendar o no recomendar");
    expect(proposicion.criteria?.no).toContain("no dice nada sobre Playwright");
    // Y el enunciado pide la declaración con el porqué, para las pantallas citadas.
    expect(proposicion.instructions).toContain("Pantalla.component.html");
    expect(proposicion.instructions).toContain("por qué");
  });

  it("no agrega ninguna proposición que exija un criterio con el verbo playwright", () => {
    const expandido = planExpandido({
      interfaz: { requiereDeclaracion: true, pantallas: ["a/Pantalla.component.html"] },
    });

    const ids = expandido.propositions.map((p) => p.id);
    expect(ids).toEqual([PROPOSICION_PLAYWRIGHT, ...PLAN_GATE.propositions.map((p) => p.id)]);
    // Ninguna otra proposición menciona el verbo: el gate no convierte la
    // recomendación en un criterio exigido por la puerta de atrás.
    for (const proposicion of expandido.propositions) {
      if (proposicion.id === PROPOSICION_PLAYWRIGHT) continue;
      expect(JSON.stringify(proposicion).toLowerCase()).not.toContain("playwright");
    }
  });
});

describe("la documentación declara la regla: el agente propone, la persona decide", () => {
  const doc = (): string => readFileSync(join(REPO, REFERENCIA), "utf8");

  it("la sección existe y nombra la proposición por su identificador", () => {
    expect(doc()).toContain("### 5.1septies");
    expect(doc()).toContain("recomendacion_playwright");
  });

  it("declara las dos mitades del disparador, en código", () => {
    const texto = doc();
    expect(texto).toContain("El disparador se decide **en código**");
    expect(texto).toContain("playwright:");
  });

  it("declara que las dos respuestas valen y que la ausencia no se penaliza", () => {
    const texto = doc();
    expect(texto).toContain("**Las dos respuestas valen**");
    expect(texto).toContain("no se pregunta ni se penaliza");
  });

  it("declara que la prueba no la escribe el harness: la confirma la persona", () => {
    const texto = doc();
    expect(texto).toContain("**la prueba no la escribe el harness**");
    expect(texto).toContain("la confirma la persona al aprobar el plan");
  });
});

describe("la corrida del gate sobre un ticket con pantalla", () => {
  it("despliega la proposición en el recibo y no modifica el archivo del ticket", async () => {
    writeFixtureTicket(lab, {
      id: TICKET,
      workflowStatus: "planned",
      diagnostico: DIAGNOSTICO_CON_PANTALLA,
      plan: PLAN_CON_DECLARACION,
      criterios: [
        "- [ ] La pantalla de órdenes es legible en modo oscuro.",
        "      <!-- verify: manual -->",
        "- [ ] El modo claro no cambia.",
        "      <!-- verify: manual -->",
      ].join("\n"),
    });
    const archivo = join(lab, "tickets", "2026", TICKET, "ticket.md");
    const antes = readFileSync(archivo, "utf8");

    const resultado = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      evaluator: "jev",
      jev: jevFijo(),
    });

    expect(resultado.exitCode).toBe(0);

    const recibos = readReceipts(PATHS(), TICKET);
    const recibo = recibos[recibos.length - 1] as unknown as Record<string, unknown>;
    // La proposición viajó al evaluador y quedó en el recibo, evaluada.
    const respuestas = recibo["modelAnswers"] as readonly { id: string; value?: number }[];
    expect(respuestas.map((r) => r.id)).toContain(PROPOSICION_PLAYWRIGHT);
    expect(respuestas.find((r) => r.id === PROPOSICION_PLAYWRIGHT)?.value).toBe(0.99);
    const evaluadas = recibo["propositions"] as readonly { id: string }[];
    expect(evaluadas.map((p) => p.id)).toContain(PROPOSICION_PLAYWRIGHT);

    // La propiedad que sostiene el requisito: la recomendación no escribe nada.
    expect(readFileSync(archivo, "utf8")).toBe(antes);
  });
});
