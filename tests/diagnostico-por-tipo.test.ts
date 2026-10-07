/**
 * El diagnóstico se evalúa según el tipo de ticket (R-CPRE-002, R-CPRE-003).
 *
 * Exigirle un síntoma a una funcionalidad nueva la bloqueaba por algo que no puede
 * cumplir —`FEATURE-ADAPTER-CAPACIDADES-20261001` bloqueó cuatro veces—. Lo que se
 * afirma:
 *
 * 1. Una corrección se evalúa con la pregunta del síntoma; todo lo demás, con la que
 *    pide nombrar dónde falta el comportamiento esperado.
 * 2. Una funcionalidad con diagnóstico completo no bloquea por falta de síntoma.
 * 3. El evaluador ve la «Descripción funcional», y su hash cambia si cambia.
 * 4. El bloqueo aislado de la pregunta nueva se degrada a revisión como el del síntoma,
 *    y el caso de control sigue bloqueando.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runGate } from "../packages/engine/src/gate.js";
import { buildGateState } from "../packages/engine/src/state.js";
import { renderFixtureTicket, writeFixtureTicket } from "./helpers/fixtures.js";
import type { JevEvaluation } from "../packages/gate-jev/src/index.js";
import {
  ANALYSIS_GATE,
  DEFAULT_POLICY,
  decide,
  hashState,
  partitionByApplicability,
  type PropositionAnswer,
} from "../packages/gate/src/index.js";

const FEATURE = "FEATURE-POS-FILTRO-ORDENES-20260921";
const BUGFIX = "BUGFIX-POS-FILTRO-ORDENES-20260921";

let lab: string;
const PATHS = (): { root: string; ticketsDir: string } => ({ root: lab, ticketsDir: "tickets" });

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-diag-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});
afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Un evaluador simulado: anota qué proposiciones recibió y responde con el valor dado. */
function espia(valor = 0.95): {
  jev: typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
  recibidas: () => string[];
} {
  let ids: string[] = [];
  const jev = (async (options: { propositions?: readonly { id: string }[] }) => {
    ids = (options?.propositions ?? []).map((p) => p.id);
    const answers = (options?.propositions ?? []).map((p) =>
      p.id === "clasificacion"
        ? { id: p.id, kind: "choice" as const, choice: "completa", confidence: 0.95 }
        : { id: p.id, kind: "noul" as const, value: valor },
    );
    return {
      answers,
      model: { provider: "openrouter", model: "jev", resolvedVersion: "jev-1" },
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      latencyMs: 1,
    } as JevEvaluation;
  }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
  return { jev, recibidas: () => ids };
}

describe("la pregunta del diagnóstico por tipo", () => {
  it("sobre un FEATURE no recibe la del síntoma y sí la que pide nombrar dónde falta el comportamiento", async () => {
    writeFixtureTicket(lab, { id: FEATURE, type: "FEATURE", workflowStatus: "analyzed" });
    const e = espia();

    const r = await runGate(PATHS(), { gateId: "analysis", ticketId: FEATURE, jev: e.jev });

    expect(r.exitCode, r.stderr).toBe(0);
    expect(e.recibidas()).not.toContain("diagnostico_explica_el_sintoma");
    expect(e.recibidas()).toContain("diagnostico_ubica_el_cambio");
  });

  it("sobre un BUGFIX recibe la del síntoma y no la de funcionalidad nueva", async () => {
    writeFixtureTicket(lab, { id: BUGFIX, type: "BUGFIX", workflowStatus: "analyzed" });
    const e = espia();

    const r = await runGate(PATHS(), { gateId: "analysis", ticketId: BUGFIX, jev: e.jev });

    expect(r.exitCode, r.stderr).toBe(0);
    expect(e.recibidas()).toContain("diagnostico_explica_el_sintoma");
    expect(e.recibidas()).not.toContain("diagnostico_ubica_el_cambio");
  });

  it("un FEATURE con diagnóstico completo no bloquea por falta de síntoma", async () => {
    writeFixtureTicket(lab, { id: FEATURE, type: "FEATURE", workflowStatus: "analyzed" });

    const r = await runGate(PATHS(), { gateId: "analysis", ticketId: FEATURE, jev: espia(0.95).jev });

    expect(r.stdout).toContain("APPROVE");
    expect(r.stdout).not.toContain("BLOCK");
  });
});

describe("el estado que ve el evaluador", () => {
  const texto = (funcional: string): string =>
    renderFixtureTicket({ id: FEATURE, type: "FEATURE", workflowStatus: "analyzed" }).replace(
      "- Comportamiento esperado: encuentra por número parcial.",
      `- Comportamiento esperado: ${funcional}`,
    );

  it("incluye la descripción funcional del ticket", () => {
    const estado = buildGateState(texto("encuentra por número parcial"));
    expect(estado["descripcion_funcional"]).toContain("Comportamiento actual: solo encuentra con el número exacto.");
    expect(estado["descripcion_funcional"]).toContain("Comportamiento esperado: encuentra por número parcial");
  });

  it("su hash cambia si cambia la sección", () => {
    const a = hashState(buildGateState(texto("encuentra por número parcial")));
    const b = hashState(buildGateState(texto("encuentra por número parcial y por cliente")));
    expect(a).not.toBe(b);
  });
});

describe("el bloqueo aislado de la pregunta nueva", () => {
  const proposiciones = partitionByApplicability(ANALYSIS_GATE.propositions, "FEATURE").applicable;
  const respuestas = (ajustes: Record<string, number> = {}): PropositionAnswer[] =>
    proposiciones.map((p) =>
      p.id === "clasificacion"
        ? { id: p.id, kind: "choice", choice: "completa", confidence: 0.99 }
        : { id: p.id, kind: "noul", value: ajustes[p.id] ?? 0.97 },
    );

  it("se degrada a revisión, igual que el del síntoma", () => {
    const decision = decide(
      proposiciones,
      respuestas({ diagnostico_ubica_el_cambio: 0.04 }),
      ANALYSIS_GATE.policy ?? DEFAULT_POLICY,
      ANALYSIS_GATE.isolatedBlockReview,
    );
    expect(decision.outcome).toBe("review");
    expect(decision.blocking).toEqual(["diagnostico_ubica_el_cambio"]);
  });

  it("el caso de control con la causa baja sigue bloqueando", () => {
    const decision = decide(
      proposiciones,
      respuestas({ diagnostico_ubica_el_cambio: 0.04, causa_especifica: 0.04 }),
      ANALYSIS_GATE.policy ?? DEFAULT_POLICY,
      ANALYSIS_GATE.isolatedBlockReview,
    );
    expect(decision.outcome).toBe("block");
  });
});
