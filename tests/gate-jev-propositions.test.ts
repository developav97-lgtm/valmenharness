/** Expansión y decisión segura de `jev-propositions` en el motor. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildIntegrationValidation, runGate } from "../packages/engine/src/index.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import {
  ANALYSIS_GATE,
  DEFAULT_POLICY,
  decide,
  gateFor,
  SIN_INTERFAZ,
  type NoulProposition,
} from "../packages/gate/src/index.js";
import type { JevEvaluation } from "../packages/gate-jev/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "FEATURE-JEV-PROPOSICIONES-LAB-20261006";
let lab: string;

const paths = () => ({ root: lab, ticketsDir: "tickets" });

function configured(stage: "analysis" | "plan" | "integration", verdict = "required"): string {
  return [
    "name: Laboratorio",
    "jev-propositions:",
    `  ${stage}:`,
    "    - id: custom-alcance-aprobado",
    "      description: El cambio respeta el alcance aprobado.",
    "      instructions: Comprueba que el cambio coincide con la solicitud y el plan.",
    "      criteria:",
    "        yes: El cambio corresponde al plan aprobado.",
    "        no: El cambio agrega trabajo fuera del alcance declarado.",
    "      weight: 2",
    "      approve-at: 0.80",
    "      block-at: 0.20",
    `      verdict: ${verdict}`,
  ].join("\n");
}

function evaluator(values: Record<string, number>): typeof import("../packages/gate-jev/src/index.js").evaluateWithJev {
  return (async ({ propositions }: { propositions: readonly { id: string; kind: string }[] }) => {
    const analysis = propositions.some((proposition) => proposition.id === "diagnostico_explica_el_sintoma");
    return {
    answers: propositions.map((proposition) =>
      proposition.kind === "choice"
        ? { id: proposition.id, kind: "choice" as const, choice: analysis ? "completa" : "completo" }
        : { id: proposition.id, kind: "noul" as const, value: values[proposition.id] ?? 0.99 },
    ),
    model: { provider: "laboratorio", model: "jev-fijo", resolvedVersion: "jev-fijo@1" },
    usage: { inputTokens: 12, outputTokens: 3, costUsd: 0.02 },
    latencyMs: 1,
  };
  }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-jev-props-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
  writeFixtureTicket(lab, { id: TICKET, workflowStatus: "analyzed" });
});

afterEach(() => rmSync(lab, { recursive: true, force: true }));

describe("jev-propositions", () => {
  it("conserva el gate sin configuración y añade una required solo a analysis", async () => {
    const sinConfiguracion = await runGate(paths(), {
      gateId: "analysis",
      ticketId: TICKET,
      jev: evaluator({}),
      dryRun: true,
    });
    expect(sinConfiguracion.stdout).not.toContain("custom-alcance-aprobado");

    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(join(lab, ".valmen", "config.yaml"), configured("analysis"), "utf8");
    const conConfiguracion = await runGate(paths(), {
      gateId: "analysis",
      ticketId: TICKET,
      jev: evaluator({ "custom-alcance-aprobado": 0.81 }),
    });

    expect(conConfiguracion.stdout).toContain("custom-alcance-aprobado=0.81");
    const receipt = readReceipts(paths(), TICKET).at(-1);
    expect(receipt?.propositions.find((item) => item.id === "custom-alcance-aprobado")?.policy).toEqual({
      approveAt: 0.8,
      blockAt: 0.2,
    });
    expect(receipt?.usage).toEqual({ inputTokens: 12, outputTokens: 3, costUsd: 0.02 });

    writeFixtureTicket(lab, { id: TICKET, workflowStatus: "planned" });
    writeFileSync(join(lab, ".valmen", "config.yaml"), configured("plan"), "utf8");
    const plan = await runGate(paths(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluator({ "custom-alcance-aprobado": 0.81 }),
      dryRun: true,
    });
    expect(plan.stdout).toContain("custom-alcance-aprobado=0.81");
  });

  it("una required usa sus umbrales y no puede relajar un bloqueo base", () => {
    const additional: NoulProposition = {
      id: "custom-umbral",
      kind: "noul",
      instructions: "x",
      policy: { approveAt: 0.8, blockAt: 0.2 },
    };
    const result = decide(
      [{ id: "base", kind: "noul", instructions: "x" }, additional],
      [
        { id: "base", kind: "noul", value: 0.05 },
        { id: "custom-umbral", kind: "noul", value: 0.81 },
      ],
      DEFAULT_POLICY,
    );
    expect(result.outcome).toBe("block");
    expect(result.propositions.find((item) => item.id === "custom-umbral")?.policy).toEqual({
      approveAt: 0.8,
      blockAt: 0.2,
    });
  });

  it("una inform queda en el recibo sin decidir", () => {
    const expanded = gateFor(ANALYSIS_GATE, {
      criteria: [],
      impacts: [],
      interfaz: SIN_INTERFAZ,
      additional: [
        {
          id: "custom-contexto",
          kind: "noul",
          instructions: "x",
          policy: { approveAt: 0.8, blockAt: 0.2 },
          verdict: false,
        },
      ],
    });
    const result = decide(
      expanded.propositions,
      expanded.propositions.map((proposition) =>
        proposition.kind === "choice"
          ? { id: proposition.id, kind: "choice" as const, choice: "completa" }
          : {
              id: proposition.id,
              kind: "noul" as const,
              value: proposition.id === "custom-contexto" ? 0.01 : 0.99,
            },
      ),
      expanded.policy,
    );
    expect(result.propositions.find((item) => item.id === "custom-contexto")?.verdict).toBe(false);
    expect(result.outcome).toBe("approve");
  });

  it("prepara integración con solicitud, plan, alcance y veto previo a Git", () => {
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(join(lab, ".valmen", "config.yaml"), configured("integration"), "utf8");

    const validation = buildIntegrationValidation(paths(), TICKET);
    expect(validation.state.solicitudOriginal).not.toBe("");
    expect(validation.state.planAprobado).not.toBe("");
    expect(validation.state.alcanceDeclarado).not.toBe("");
    expect(validation.propositions.map((item) => item.id)).toEqual(["custom-alcance-aprobado"]);

    const result = decide(
      validation.propositions,
      [{ id: "custom-alcance-aprobado", kind: "noul", value: 0.2 }],
    );
    expect(result.outcome).toBe("block");
  });
});
