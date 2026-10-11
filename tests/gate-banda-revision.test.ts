/**
 * Política de banda de revisión (FEATURE-GATE-POLITICA-BANDA-REVIEW-20261010).
 *
 * Una compuerta pide revisión por cada proposición entre `blockAt` y `approveAt`. Con una
 * banda **firmada por una persona**, solo la pide si alguna cae bajo un piso, si una crítica
 * queda en banda o si hay `review-band-max` o más en banda. Sin firma, nada cambia.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseConfig, readGateThresholds } from "../packages/adapter/src/index.js";
import { runGate } from "../packages/engine/src/gate.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import type { JevEvaluation } from "../packages/gate-jev/src/index.js";
import {
  DEFAULT_POLICY,
  decide,
  type Proposition,
  type PropositionAnswer,
} from "../packages/gate/src/index.js";
import { CRITERIOS_QUE_EVALUA_EL_MODELO, writeFixtureTicket } from "./helpers/fixtures.js";

// ── Configuración (C1, C2, C3) ───────────────────────────────────────────────

const leer = (texto: string) =>
  readGateThresholds(parseConfig(texto), ["analysis", "plan", "qa-mechanical"]);
const BASE = "gate-thresholds:\n  - gate: plan\n    approve-at: 0.9\n    block-at: 0.1\n";

describe("configuración de la banda", () => {
  it.each([
    {
      caso: "C1 acepta piso y máximo en una entrada de compuerta",
      texto: `${BASE}    review-floor: 0.8\n    review-band-max: 4\n`,
      esperado: { reviewFloor: 0.8, reviewBandMax: 4 },
    },
    {
      caso: "C1 el máximo por defecto es 3",
      texto: `${BASE}    review-floor: 0.8\n`,
      esperado: { reviewFloor: 0.8, reviewBandMax: 3 },
    },
    {
      caso: "regresión: una entrada sin banda sigue leyéndose igual",
      texto: BASE,
      esperado: { reviewFloor: null, reviewBandMax: null },
    },
  ])("$caso", ({ texto, esperado }) => {
    expect(leer(texto)[0]).toMatchObject({ approveAt: 0.9, blockAt: 0.1, ...esperado });
  });

  it.each([
    {
      caso: "C2 rechaza el piso en una entrada que nombra una proposición",
      texto: `${BASE}    proposition: cubre_todos_los_criterios\n    review-floor: 0.8\n`,
      campo: "review-floor",
    },
    {
      caso: "C3 piso igual a block-at",
      texto: `${BASE}    review-floor: 0.1\n`,
      campo: "review-floor",
    },
    {
      caso: "C3 piso igual a approve-at",
      texto: `${BASE}    review-floor: 0.9\n`,
      campo: "review-floor",
    },
    {
      caso: "C3 piso sobre approve-at",
      texto: `${BASE}    review-floor: 0.95\n`,
      campo: "review-floor",
    },
    {
      caso: "C3 máximo menor que 2",
      texto: `${BASE}    review-floor: 0.8\n    review-band-max: 1\n`,
      campo: "review-band-max",
    },
    {
      caso: "C3 máximo no entero",
      texto: `${BASE}    review-floor: 0.8\n    review-band-max: 2.5\n`,
      campo: "review-band-max",
    },
    {
      caso: "C3 máximo sin piso",
      texto: `${BASE}    review-band-max: 3\n`,
      campo: "review-band-max",
    },
  ])("$caso", ({ texto, campo }) => {
    expect(() => leer(texto)).toThrow(`gate-thresholds[0].${campo}`);
  });
});

// ── decide() con banda (C5–C9, C4 a nivel de decisión) ───────────────────────

const PROPS: Proposition[] = ["a", "b", "c", "crit"].map((id) => ({
  id,
  kind: "noul",
  instructions: `Proposición ${id}.`,
}));
const BANDA = { floor: 0.8, maxInBand: 3, critical: ["crit"] };

function respuestas(valores: Record<string, number>): PropositionAnswer[] {
  return PROPS.map((p) => ({ id: p.id, kind: "noul", value: valores[p.id] ?? 0.95 }));
}

describe("decide con la banda firmada", () => {
  it.each([
    { caso: "C5 una en 0,85 aprueba", v: { a: 0.85 }, esperado: "approve", tolera: ["a"] },
    {
      caso: "C5 dos en banda sobre el piso aprueban",
      v: { a: 0.85, b: 0.82 },
      esperado: "approve",
      tolera: ["a", "b"],
    },
    {
      caso: "C6 una bajo el piso va a review",
      v: { a: 0.79 },
      esperado: "review",
      tolera: [],
    },
    {
      caso: "C6 una bajo el piso con otra sobre él va a review",
      v: { a: 0.5, b: 0.85 },
      esperado: "review",
      tolera: [],
    },
    {
      caso: "C7 tres sobre el piso van a review",
      v: { a: 0.85, b: 0.85, c: 0.85 },
      esperado: "review",
      tolera: [],
    },
    {
      caso: "C8 una crítica en banda va a review",
      v: { crit: 0.85 },
      esperado: "review",
      tolera: [],
    },
    {
      caso: "C9 una en blockAt sigue en block",
      v: { a: 0.05, b: 0.85 },
      esperado: "block",
      tolera: [],
    },
    {
      caso: "nada en banda aprueba sin tolerar nada",
      v: {},
      esperado: "approve",
      tolera: [],
    },
  ])("$caso", ({ v, esperado, tolera }) => {
    const d = decide(PROPS, respuestas(v), DEFAULT_POLICY, undefined, BANDA);
    expect(d.outcome).toBe(esperado);
    expect(d.toleratedInBand ?? []).toEqual(tolera);
    if (tolera.length > 0) expect(d.reason).toContain("banda firmada");
  });

  it("C4 sin banda la decisión es la de hoy: una en 0,85 va a review", () => {
    const d = decide(PROPS, respuestas({ a: 0.85 }), DEFAULT_POLICY);
    expect(d.outcome).toBe("review");
    expect(d.inBand).toEqual(["a"]);
    expect(d.toleratedInBand).toBeUndefined();
  });
});

// ── Con el motor: firma, exclusiones, recibo y salida (C4, C10–C13) ──────────

const TICKET = "FEATURE-POS-FILTRO-ORDENES-20260921";
const PLAN = [
  "- Pasos ordenados:",
  "  1. Cambiar en `BackEnd/pos/filters.py` el `lookup_expr` de `number`.",
  "  2. Añadir en `BackEnd/pos/tests/test_filters.py` una prueba de búsqueda parcial.",
  "- Rollback: revertir el cambio de una línea y retirar las pruebas añadidas.",
].join("\n");
const FIRMA =
  '    approved-by: Juan Andrade\n    reason: "medido en 263 recibos del registro"\n';
const BANDA_YAML = `gate-thresholds:\n  - gate: plan\n    approve-at: 0.9\n    block-at: 0.1\n    review-floor: 0.8\n`;

let lab: string;
const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

const DIAGNOSTICO = (impacto: string): string =>
  [
    "- Archivos y flujo investigados: `BackEnd/pos/filters.py` define `OrderFilter.number` con `lookup_expr='exact'`; `OrderFilter` se aplica desde el ViewSet de órdenes.",
    "- Causa raíz o hipótesis: el `lookup_expr` es exacto cuando la pantalla documenta búsqueda parcial, así que el backend descarta las coincidencias parciales.",
    "- Riesgos y compatibilidad: cambiar el lookup a `icontains` amplía el conjunto de resultados.",
    `- Impactos de sync, migración, Docker o despliegue: ${impacto}.`,
  ].join("\n");
const DECLARA: Record<string, string> = {
  sync_impact: "afecta la sincronización de órdenes",
  migration_impact: "requiere una migración de la columna",
  docker_impact: "cambia el contenedor del servicio",
};

function ticket(opciones: { type?: string; impacts?: string[] } = {}): void {
  const impacto = opciones.impacts?.[0];
  writeFixtureTicket(lab, {
    ...(impacto === undefined
      ? {}
      : { diagnostico: DIAGNOSTICO(DECLARA[impacto] ?? "ninguno") }),
    id: TICKET,
    workflowStatus: "planned",
    plan: PLAN,
    criterios: CRITERIOS_QUE_EVALUA_EL_MODELO,
    ...opciones,
  });
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-banda-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
  mkdirSync(join(lab, ".valmen"), { recursive: true });
});
afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

function configurar(texto: string): void {
  writeFileSync(join(lab, ".valmen", "config.yaml"), `name: Lab\n${texto}`, "utf8");
}

/** Un evaluador que responde 0,95 y deja criterio_01 en el valor pedido. */
function evaluador(compatibilidad: number) {
  return (async (options: { propositions?: readonly { id: string }[] }) => {
    const answers = (options?.propositions ?? []).map((p) =>
      p.id === "clasificacion"
        ? { id: p.id, kind: "choice" as const, choice: "completo", confidence: 0.95 }
        : {
            id: p.id,
            kind: "noul" as const,
            value: p.id === "criterio_01" ? compatibilidad : 0.95,
          },
    );
    return {
      answers,
      model: { provider: "openrouter", model: "jev", resolvedVersion: "jev-1" },
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      latencyMs: 1,
    } as JevEvaluation;
  }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
}

const correr = (compatibilidad = 0.85) =>
  runGate(PATHS(), { gateId: "plan", ticketId: TICKET, jev: evaluador(compatibilidad) });

describe("la banda con el motor", () => {
  it("C4 una entrada de banda sin firma no se aplica: sigue en REVIEW y el informe lo dice", async () => {
    ticket();
    configurar(BANDA_YAML);
    const r = await correr();
    expect(r.stdout).toContain("REVIEW");
    expect(readReceipts(PATHS(), TICKET)[0]?.reviewBand).toBeUndefined();
  });

  it("C12 y C13 firmada aprueba, el recibo guarda la banda con su firma y la salida nombra a quien firmó", async () => {
    ticket();
    configurar(BANDA_YAML + FIRMA);
    const r = await correr();
    expect(r.stdout).toContain("APPROVE");
    expect(r.stdout).toContain("Banda de revisión");
    expect(r.stdout).toContain("Juan Andrade");
    const recibo = readReceipts(PATHS(), TICKET)[0];
    expect(recibo?.outcome).toBe("approve");
    expect(recibo?.reviewBand).toMatchObject({
      floor: 0.8,
      maxInBand: 3,
      approvedBy: "Juan Andrade",
      tolerated: ["criterio_01"],
    });
    expect(recibo?.reviewBand?.reason).toContain("263 recibos");
  });

  it("firmada pero con una proposición bajo el piso sigue en REVIEW y sin campo de banda", async () => {
    ticket();
    configurar(BANDA_YAML + FIRMA);
    const r = await correr(0.7);
    expect(r.stdout).toContain("REVIEW");
    expect(readReceipts(PATHS(), TICKET)[0]?.reviewBand).toBeUndefined();
  });

  it.each([
    { caso: "C10 un ticket SECURITY", opciones: { type: "SECURITY" } },
    { caso: "C11 un ticket con sync_impact", opciones: { impacts: ["sync_impact"] } },
    {
      caso: "C11 un ticket con migration_impact",
      opciones: { impacts: ["migration_impact"] },
    },
    { caso: "C11 un ticket con docker_impact", opciones: { impacts: ["docker_impact"] } },
  ])("$caso no recibe la banda", async ({ opciones }) => {
    ticket(opciones);
    configurar(BANDA_YAML + FIRMA);
    const r = await correr();
    expect(r.stderr).toBe("");
    expect(r.stdout).toContain("REVIEW");
    const recibo = readReceipts(PATHS(), TICKET)[0];
    expect(recibo?.reviewBand).toBeUndefined();
    expect((recibo?.notes ?? []).join(" ")).toContain("banda de revisión no se aplicó");
  });
});
