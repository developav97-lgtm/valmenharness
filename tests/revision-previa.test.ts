/**
 * La revisión previa en código (R-CPRE-008) y las comprobaciones que votan (R-CPRE-009).
 *
 * Un plan con el Rollback vacío no necesita un modelo para saber que le falta algo.
 * Lo que se afirma:
 *
 * 1. Cada hallazgo corta **antes** de llamar al evaluador, dice qué falta y no escribe
 *    recibo; un ticket completo pasa y el evaluador se llama una vez.
 * 2. La misma revisión se corre a mano y dice lo mismo que la compuerta.
 * 3. `rollback_suficiente`, `hay_archivos_afectados`, `pasos_ejecutables` y
 *    `criterios_verificables` se deciden en código y votan aunque el ticket tenga
 *    criterios: un plan sin archivos afectados no aprueba.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { precheckCommand } from "../packages/cli/src/commands.js";
import { runGate } from "../packages/engine/src/gate.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import {
  TOPE_DE_CRITERIOS,
  decideInCode,
  renderPreReview,
  reviewBeforeGate,
} from "../packages/engine/src/revision-previa.js";
import type { JevEvaluation } from "../packages/gate-jev/src/index.js";
import { renderFixtureTicket, writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";

let lab: string;
const PATHS = (): { root: string; ticketsDir: string } => ({ root: lab, ticketsDir: "tickets" });

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-previa-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});
afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Un evaluador simulado que cuenta llamadas y anota qué proposiciones recibió. */
function espia(): {
  jev: typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
  llamadas: () => number;
  recibidas: () => string[];
} {
  let n = 0;
  let ids: string[] = [];
  const jev = (async (options: { propositions?: readonly { id: string }[] }) => {
    n += 1;
    ids = (options?.propositions ?? []).map((p) => p.id);
    const answers = (options?.propositions ?? []).map((p) =>
      p.id === "clasificacion"
        ? { id: p.id, kind: "choice" as const, choice: p.id === "clasificacion" ? "completo" : "completa", confidence: 0.95 }
        : { id: p.id, kind: "noul" as const, value: 0.95 },
    );
    return {
      answers,
      model: { provider: "openrouter", model: "jev", resolvedVersion: "jev-1" },
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      latencyMs: 1,
    } as JevEvaluation;
  }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
  return { jev, llamadas: () => n, recibidas: () => ids };
}

const PLAN_OK = [
  "- Gate de plan y aprobación: pendiente",
  "- Pasos ordenados:",
  "  1. Cambiar en `BackEnd/pos/filters.py` el `lookup_expr` de `number`.",
  "  2. Añadir en `BackEnd/pos/tests/test_filters.py` una prueba de búsqueda parcial.",
  "- Rollback: revertir el cambio de una línea y retirar las pruebas añadidas.",
].join("\n");

const pedirPlan = (e: ReturnType<typeof espia>) =>
  runGate(PATHS(), { gateId: "plan", ticketId: TICKET, jev: e.jev });

describe("cada hallazgo corta antes del evaluador", () => {
  it("un plan con la línea Rollback vacía no llama al evaluador y nombra la línea", async () => {
    writeFixtureTicket(lab, { id: TICKET, workflowStatus: "planned", plan: PLAN_OK.replace(/- Rollback:.*/, "- Rollback:") });
    const e = espia();

    const r = await pedirPlan(e);

    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("la línea «Rollback:» está vacía");
    expect(r.stderr).toContain("No se llamó al evaluador");
    expect(e.llamadas()).toBe(0);
    expect(readReceipts(PATHS(), TICKET)).toHaveLength(0);
  });

  it("un diagnóstico que cita un archivo inexistente falla nombrándolo, dentro de un repositorio", async () => {
    mkdirSync(join(lab, ".git"));
    writeFixtureTicket(lab, {
      id: TICKET,
      workflowStatus: "planned",
      plan: PLAN_OK,
      diagnostico: [
        "- Archivos y flujo investigados: `packages/engine/src/no-existe.ts` define el filtro.",
        "- Causa raíz o hipótesis: el lookup es exacto.",
        "- Riesgos y compatibilidad: ninguno.",
        "- Impactos de sync, migración, Docker o despliegue: ninguno.",
      ].join("\n"),
    });
    const e = espia();

    const r = await pedirPlan(e);

    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("`packages/engine/src/no-existe.ts`, que no existe");
    expect(e.llamadas()).toBe(0);
  });

  it("fuera de un repositorio no comprueba archivos y lo dice", () => {
    const texto = renderFixtureTicket({
      id: TICKET,
      workflowStatus: "planned",
      diagnostico: "- Archivos y flujo investigados: `packages/x/no-existe.ts`.\n- Causa raíz o hipótesis: x.\n- Riesgos y compatibilidad: x.\n- Impactos de sync, migración, Docker o despliegue: ninguno.",
    });
    const r = reviewBeforeGate({ root: lab, ticketText: texto, gateId: "plan" });
    expect(r.findings.map((h) => h.id)).not.toContain("archivo_inexistente");
    expect(r.skipped.join(" ")).toContain("no es un repositorio git");
  });

  it("un marcador de plantilla vacío en el diagnóstico corta antes del evaluador", async () => {
    writeFixtureTicket(lab, {
      id: TICKET,
      workflowStatus: "planned",
      plan: PLAN_OK,
      diagnostico: [
        "- Causa comprobada (con `ruta:línea`):",
        "- Consumidores afectados: ninguno.",
        "- Impactos de sync, migración, Docker o despliegue: ninguno.",
      ].join("\n"),
    });
    const e = espia();

    const r = await pedirPlan(e);

    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("«- Causa comprobada (con `ruta:línea`):» sigue vacía");
    expect(e.llamadas()).toBe(0);
  });

  it("un criterio sin anotación de verificación corta antes del evaluador", async () => {
    writeFixtureTicket(lab, { id: TICKET, workflowStatus: "planned", plan: PLAN_OK, criterios: "- [ ] El filtro encuentra la orden por número parcial." });
    const e = espia();

    const r = await pedirPlan(e);

    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("no declara cómo se verifica");
    expect(e.llamadas()).toBe(0);
  });

  it("un paso sin ruta, símbolo ni comando corta antes del evaluador", async () => {
    writeFixtureTicket(lab, {
      id: TICKET,
      workflowStatus: "planned",
      plan: PLAN_OK.replace("  2. Añadir en `BackEnd/pos/tests/test_filters.py` una prueba de búsqueda parcial.", "  2. Mejorar el filtro."),
    });
    const e = espia();

    const r = await pedirPlan(e);

    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("el paso 2 no nombra un archivo, un símbolo ni un comando");
    expect(e.llamadas()).toBe(0);
  });

  it("un ticket con más criterios que el tope se rechaza antes del evaluador", async () => {
    const muchos = Array.from(
      { length: TOPE_DE_CRITERIOS + 1 },
      (_, i) => `- [ ] El criterio número ${i + 1} se cumple en la pantalla.\n      <!-- verify: manual -->`,
    ).join("\n");
    writeFixtureTicket(lab, { id: TICKET, workflowStatus: "planned", plan: PLAN_OK, criterios: muchos });
    const e = espia();

    const r = await pedirPlan(e);

    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain(`más que el tope de ${TOPE_DE_CRITERIOS}`);
    expect(e.llamadas()).toBe(0);
  });

  it("un ticket completo pasa la revisión y el evaluador se llama una vez", async () => {
    writeFixtureTicket(lab, { id: TICKET, workflowStatus: "planned", plan: PLAN_OK });
    const e = espia();

    const r = await pedirPlan(e);

    expect(r.exitCode, r.stderr).toBe(0);
    expect(e.llamadas()).toBe(1);
  });
});

describe("la revisión a mano", () => {
  it("dice lo mismo que la compuerta y sale con 3 si falta algo", async () => {
    writeFixtureTicket(lab, { id: TICKET, workflowStatus: "planned", plan: PLAN_OK.replace(/- Rollback:.*/, "- Rollback:") });

    const mano = precheckCommand(PATHS(), "plan", TICKET);
    const compuerta = await pedirPlan(espia());

    expect(mano.exitCode).toBe(3);
    expect(mano.stdout).toContain("la línea «Rollback:» está vacía");
    // Es la misma función: el informe de la compuerta es el de la revisión a mano.
    expect(compuerta.stderr).toContain(mano.stdout.trim());
  });

  it("sin hallazgos dice que se puede evaluar y sale con 0", () => {
    writeFixtureTicket(lab, { id: TICKET, workflowStatus: "planned", plan: PLAN_OK });
    const mano = precheckCommand(PATHS(), "plan", TICKET);
    expect(mano.exitCode).toBe(0);
    expect(mano.stdout).toContain("el ticket se puede evaluar");
  });

  it("pide la compuerta y el ticket", () => {
    expect(precheckCommand(PATHS(), "qa-mechanical", TICKET).exitCode).toBe(2);
    expect(precheckCommand(PATHS(), "plan", undefined).exitCode).toBe(2);
    expect(renderPreReview("plan", TICKET, { findings: [], skipped: [] })).toContain("Sin hallazgos");
  });
});

describe("las cuatro comprobaciones que decide el código", () => {
  it("votan aunque el ticket tenga criterios y el evaluador no las recibe", async () => {
    writeFixtureTicket(lab, { id: TICKET, workflowStatus: "planned", plan: PLAN_OK });
    const e = espia();

    const r = await pedirPlan(e);

    expect(r.exitCode, r.stderr).toBe(0);
    const codigo = ["rollback_suficiente", "hay_archivos_afectados", "pasos_ejecutables", "criterios_verificables"];
    for (const id of codigo) expect(e.recibidas()).not.toContain(id);
    const recibo = readReceipts(PATHS(), TICKET)[0];
    for (const id of codigo) {
      expect(recibo?.modelAnswers.map((a) => a.id)).toContain(id);
      expect(recibo?.propositions.find((p) => p.id === id)?.verdict, `${id} no vota`).toBe(true);
    }
  });

  it("un plan sin archivos afectados no aprueba", async () => {
    writeFixtureTicket(lab, {
      id: TICKET,
      workflowStatus: "planned",
      plan: [
        "- Pasos ordenados:",
        "  1. Llamar a `buscarOrdenes()` con el término parcial.",
        "  2. Correr `npx vitest run` para comprobarlo.",
        "- Rollback: revertir el cambio de una línea y retirar las pruebas añadidas.",
      ].join("\n"),
    });

    const r = await pedirPlan(espia());

    expect(r.exitCode).toBe(3);
    expect(r.stdout).toContain("BLOCK");
    const recibo = readReceipts(PATHS(), TICKET)[0];
    expect(recibo?.outcome).toBe("block");
    expect(recibo?.modelAnswers.find((a) => a.id === "hay_archivos_afectados")?.value).toBe(0);
  });

  it("decideInCode decide cada una por separado y no inventa respuestas para otras", () => {
    const texto = renderFixtureTicket({ id: TICKET, workflowStatus: "planned", plan: PLAN_OK });
    for (const id of ["rollback_suficiente", "hay_archivos_afectados", "pasos_ejecutables", "criterios_verificables"]) {
      expect(decideInCode(id, texto)).toBe(0.99);
    }
    expect(decideInCode("cubre_todos_los_criterios", texto)).toBeNull();
    const sinRollback = renderFixtureTicket({ id: TICKET, workflowStatus: "planned", plan: PLAN_OK.replace(/- Rollback:.*/, "- Rollback:") });
    expect(decideInCode("rollback_suficiente", sinRollback)).toBe(0);
  });
});
