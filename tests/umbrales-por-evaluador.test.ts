/**
 * Umbrales por evaluador y por proposición (R-CPRE-010).
 *
 * Un umbral decide qué aprueba una compuerta, así que aplicarlo es una decisión de
 * autoridad. Lo que se afirma:
 *
 * 1. Sin `gate-thresholds` nada cambia.
 * 2. Una entrada **firmada** (`approved-by` y `reason`) se aplica; la más específica gana.
 * 3. Una entrada sin firma no se aplica y el informe lo dice: un agente que edita la
 *    configuración no puede relajar la compuerta que lo evalúa.
 * 4. El recibo guarda cada umbral aplicado, con quién lo decidió y por qué.
 * 5. Una forma inválida o un nombre desconocido fallan nombrando la clave.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseConfig, readGateThresholds } from "../packages/adapter/src/index.js";
import { gateThresholds } from "../packages/engine/src/discovery.js";
import { runGate } from "../packages/engine/src/gate.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import { validateThresholdTargets } from "../packages/engine/src/thresholds.js";
import type { JevEvaluation } from "../packages/gate-jev/src/index.js";
import { ANALYSIS_GATE, PLAN_GATE } from "../packages/gate/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";
const PLAN = [
  "- Pasos ordenados:",
  "  1. Cambiar en `BackEnd/pos/filters.py` el `lookup_expr` de `number`.",
  "  2. Añadir en `BackEnd/pos/tests/test_filters.py` una prueba de búsqueda parcial.",
  "- Rollback: revertir el cambio de una línea y retirar las pruebas añadidas.",
].join("\n");

let lab: string;
const PATHS = (): { root: string; ticketsDir: string } => ({ root: lab, ticketsDir: "tickets" });

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-umbrales-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFixtureTicket(lab, { id: TICKET, workflowStatus: "planned", plan: PLAN });
});
afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

function configurar(texto: string): void {
  writeFileSync(join(lab, ".valmen", "config.yaml"), `name: Lab\n${texto}`, "utf8");
}

/** Un evaluador simulado que responde 0.85 a toda proposición booleana: en banda con 0.9. */
function evaluador(valor = 0.85): typeof import("../packages/gate-jev/src/index.js").evaluateWithJev {
  return (async (options: { propositions?: readonly { id: string }[] }) => {
    const answers = (options?.propositions ?? []).map((p) =>
      p.id === "clasificacion"
        ? { id: p.id, kind: "choice" as const, choice: "completo", confidence: 0.95 }
        : { id: p.id, kind: "noul" as const, value: valor },
    );
    return {
      answers,
      model: { provider: "openrouter", model: "jev", resolvedVersion: "jev-1" },
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      latencyMs: 1,
    } as JevEvaluation;
  }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
}

const correr = () => runGate(PATHS(), { gateId: "plan", ticketId: TICKET, jev: evaluador() });

const FIRMA = '    approved-by: Juan Andrade\n    reason: "calibración del 2026-10-06 sobre 108 decisiones humanas"\n';

describe("aplicar umbrales", () => {
  it("sin gate-thresholds la decisión no cambia: 0.85 queda en banda con los umbrales por defecto", async () => {
    const r = await correr();
    expect(r.stdout).toContain("REVIEW");
    expect(readReceipts(PATHS(), TICKET)[0]?.thresholds).toBeUndefined();
  });

  it("una entrada firmada para un evaluador cambia el umbral, y el recibo la guarda con su firma", async () => {
    configurar(
      `gate-thresholds:\n  - gate: plan\n    evaluator: jev\n    approve-at: 0.8\n    block-at: 0.1\n${FIRMA}`,
    );

    const r = await correr();

    expect(r.stdout).toContain("APPROVE");
    expect(r.stdout).toContain("Umbrales del proyecto");
    expect(r.stdout).toContain("decidido por Juan Andrade");
    const recibo = readReceipts(PATHS(), TICKET)[0];
    expect(recibo?.thresholds?.length).toBeGreaterThan(0);
    expect(recibo?.thresholds?.[0]).toMatchObject({
      evaluator: "jev",
      approveAt: 0.8,
      blockAt: 0.1,
      approvedBy: "Juan Andrade",
    });
    expect(recibo?.thresholds?.[0]?.reason).toContain("108 decisiones humanas");
  });

  it("una entrada para otro evaluador no se aplica", async () => {
    configurar(
      `gate-thresholds:\n  - gate: plan\n    evaluator: llm-judge\n    approve-at: 0.8\n    block-at: 0.1\n${FIRMA}`,
    );
    const r = await correr();
    expect(r.stdout).toContain("REVIEW");
    expect(readReceipts(PATHS(), TICKET)[0]?.thresholds).toBeUndefined();
  });

  it("la proposición gana al evaluador y el evaluador a la compuerta", async () => {
    configurar(
      [
        "gate-thresholds:",
        `  - gate: plan\n    approve-at: 0.95\n    block-at: 0.1\n${FIRMA}`,
        `  - gate: plan\n    evaluator: jev\n    approve-at: 0.8\n    block-at: 0.1\n${FIRMA}`,
        `  - gate: plan\n    evaluator: jev\n    proposition: cubre_todos_los_criterios\n    approve-at: 0.99\n    block-at: 0.1\n${FIRMA}`,
        "",
      ].join("\n"),
    );

    await correr();

    const recibo = readReceipts(PATHS(), TICKET)[0];
    const por = (id: string) => recibo?.propositions.find((p) => p.id === id);
    // La proposición con entrada propia: 0.85 < 0.99 queda en banda.
    expect(por("cubre_todos_los_criterios")?.inBand).toBe(true);
    // Las demás se deciden con la del evaluador (0.8), no con la de la compuerta (0.95).
    expect(por("corresponde_a_la_investigacion")?.inBand).toBe(false);
    expect(recibo?.thresholds?.find((t) => t.proposition === "cubre_todos_los_criterios")?.approveAt).toBe(0.99);
    expect(recibo?.thresholds?.find((t) => t.proposition === "corresponde_a_la_investigacion")?.approveAt).toBe(0.8);
  });
});

describe("la firma de una persona", () => {
  it("una entrada sin approved-by o sin reason no se aplica y el informe lo dice", async () => {
    configurar("gate-thresholds:\n  - gate: plan\n    evaluator: jev\n    approve-at: 0.8\n    block-at: 0.1\n");

    const r = await correr();

    expect(r.stdout).toContain("REVIEW");
    expect(r.stdout).toContain("no se aplica sin `approved-by` y `reason`");
    expect(readReceipts(PATHS(), TICKET)[0]?.thresholds).toBeUndefined();
  });

  it("con approved-by pero sin reason tampoco se aplica", async () => {
    configurar("gate-thresholds:\n  - gate: plan\n    evaluator: jev\n    approve-at: 0.8\n    block-at: 0.1\n    approved-by: Juan Andrade\n");
    const r = await correr();
    expect(r.stdout).toContain("REVIEW");
    expect(r.stdout).toContain("no se aplica");
  });
});

describe("la configuración inválida", () => {
  const leer = (texto: string) => readGateThresholds(parseConfig(texto), ["analysis", "plan", "qa-mechanical"]);

  it("un block-at que no es menor que approve-at falla nombrando la clave", () => {
    expect(() => leer("gate-thresholds:\n  - gate: plan\n    approve-at: 0.5\n    block-at: 0.5\n")).toThrow(
      "gate-thresholds[0].block-at",
    );
  });

  it("un valor fuera de 0 a 1 o que no es número falla nombrando la clave", () => {
    expect(() => leer("gate-thresholds:\n  - gate: plan\n    approve-at: 1.5\n    block-at: 0.1\n")).toThrow(
      "gate-thresholds[0].approve-at",
    );
    expect(() => leer("gate-thresholds:\n  - gate: plan\n    approve-at: alto\n    block-at: 0.1\n")).toThrow(
      "approve-at",
    );
  });

  it("una compuerta, un evaluador o una clave desconocidos fallan nombrando la clave", () => {
    expect(() => leer("gate-thresholds:\n  - gate: otra\n    approve-at: 0.9\n    block-at: 0.1\n")).toThrow(
      "gate-thresholds[0].gate",
    );
    expect(() =>
      leer("gate-thresholds:\n  - gate: plan\n    evaluator: gpt\n    approve-at: 0.9\n    block-at: 0.1\n"),
    ).toThrow("gate-thresholds[0].evaluator");
    expect(() =>
      leer("gate-thresholds:\n  - gate: plan\n    approve-at: 0.9\n    block-at: 0.1\n    extra: x\n"),
    ).toThrow("gate-thresholds[0].extra");
  });

  it("una proposición desconocida falla nombrando la clave y una conocida pasa", () => {
    configurar("gate-thresholds:\n  - gate: plan\n    proposition: no_existe\n    approve-at: 0.9\n    block-at: 0.1\n");
    expect(() => validateThresholdTargets(gateThresholds(lab))).toThrow("gate-thresholds[0].proposition");
    configurar("gate-thresholds:\n  - gate: plan\n    proposition: criterio_03\n    approve-at: 0.9\n    block-at: 0.1\n");
    expect(() => validateThresholdTargets(gateThresholds(lab))).not.toThrow();
  });

  it("sin la sección no hay umbrales declarados", () => {
    expect(gateThresholds(lab)).toEqual([]);
  });
});

describe("los umbrales por defecto", () => {
  it("no cambian: las compuertas siguen aprobando desde 0.9 y bloqueando hasta 0.1", () => {
    for (const gate of [ANALYSIS_GATE, PLAN_GATE]) {
      expect(gate.policy).toEqual({ approveAt: 0.9, blockAt: 0.1 });
    }
  });
});
