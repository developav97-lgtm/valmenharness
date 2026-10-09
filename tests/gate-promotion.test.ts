import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseConfig, readGatePromotions } from "../packages/adapter/src/index.js";
import { USAGE } from "../packages/cli/src/main.js";
import {
  appendPromotionEvidence,
  evidenceFromCalibration,
  readPromotionEvidence,
  readReceipts,
  resolveGateMode,
} from "../packages/engine/src/index.js";
import { runGate } from "../packages/engine/src/gate.js";
import { listGateCards } from "../packages/server/src/gates.js";
import { CRITERIOS_QUE_EVALUA_EL_MODELO, writeFixtureTicket } from "./helpers/fixtures.js";

let lab: string;

const paths = () => ({ root: lab, ticketsDir: "tickets" });
const gates = ["analysis", "plan", "qa-mechanical"] as const;

function config(text: string): void {
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(join(lab, ".valmen", "config.yaml"), text, "utf8");
}

type Calibration = Parameters<typeof evidenceFromCalibration>[0];

function calibration(overrides: Partial<Calibration> = {}): Calibration {
  return {
    gate: "analysis",
    compared: 30,
    unknown: 0,
    decided: 30,
    agree: 29,
    rate: 29 / 30,
    falseApproves: 0,
    criticalFalseApproves: 0,
    falseBlocks: 1,
    rows: [{ ticketId: "FEATURE-UNO-20261005", human: "approved", automatic: "approve", critical: false, agrees: true, falseApprove: false, falseBlock: false }],
    ...overrides,
  };
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-gate-promotion-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("gate-promotions", () => {
  it("expone un verbo explícito para registrar la calibración solicitada", () => {
    expect(USAGE).toContain("promote-gate <gate>");
  });

  it("solo acepta solicitudes auto con umbrales e identificadores de gate conocidos", () => {
    const valid = readGatePromotions(
      parseConfig([
        "gate-promotions:",
        "  analysis:",
        "    mode: auto",
        "    minimum-sample: 30",
        "    minimum-agreement: 0.9",
      ].join("\n")),
      gates,
    );
    expect(valid.analysis).toEqual({ mode: "auto", minimumSample: 30, minimumAgreement: 0.9 });

    for (const yaml of [
      "gate-promotions:\n  unknown:\n    mode: auto\n    minimum-sample: 1\n    minimum-agreement: 0.9",
      "gate-promotions:\n  analysis:\n    mode: hybrid\n    minimum-sample: 1\n    minimum-agreement: 0.9",
      "gate-promotions:\n  analysis:\n    mode: auto\n    minimum-sample: 0\n    minimum-agreement: 0.9",
      "gate-promotions:\n  analysis:\n    mode: auto\n    minimum-sample: 1\n    minimum-agreement: 1.1",
      "gate-promotions:\n  analysis:\n    mode: auto\n    minimum-sample: 1\n    minimum-agreement: 0.9\n    extra: no",
    ]) {
      expect(() => readGatePromotions(parseConfig(yaml), gates)).toThrow(/gate-promotions/);
    }
  });
});

describe("evidencia de promoción", () => {
  it("anexa una calibración válida y solo entonces resuelve auto", () => {
    config([
      "gate-promotions:",
      "  analysis:",
      "    mode: auto",
      "    minimum-sample: 30",
      "    minimum-agreement: 0.9",
    ].join("\n"));

    expect(resolveGateMode(paths(), "analysis")).toMatchObject({ mode: "hybrid", reason: expect.stringMatching(/evidencia/i) });

    const evidence = evidenceFromCalibration(calibration(), "qa-cycles");
    appendPromotionEvidence(paths(), evidence);

    expect(readPromotionEvidence(paths())).toEqual([evidence]);
    expect(resolveGateMode(paths(), "analysis")).toMatchObject({ mode: "auto", evidence });
  });

  it("convierte una revisión en bloqueo automático y cita la evidencia en el recibo", async () => {
    config([
      "gate-promotions:",
      "  plan:",
      "    mode: auto",
      "    minimum-sample: 1",
      "    minimum-agreement: 0.9",
    ].join("\n"));
    writeFixtureTicket(lab, { id: "FEATURE-PROMOTION-20261005", workflowStatus: "planned", criterios: CRITERIOS_QUE_EVALUA_EL_MODELO });
    const evidence = evidenceFromCalibration(
      calibration({ gate: "plan", compared: 1, decided: 1, agree: 1, rate: 1 }),
      "qa-cycles",
    );
    appendPromotionEvidence(paths(), evidence);

    const result = await runGate(paths(), {
      gateId: "plan",
      ticketId: "FEATURE-PROMOTION-20261005",
      evaluator: "jev",
      jev: (async (options: { propositions?: readonly { id: string; kind?: string; criteria?: Readonly<Record<string, string>> }[] }) => ({
        answers: (options.propositions ?? []).map((proposition) =>
          proposition.kind === "choice"
            ? { id: proposition.id, kind: "choice" as const, choice: "completo", confidence: 0.9 }
            : { id: proposition.id, kind: "noul" as const, value: 0.5 },
        ),
        model: null,
        usage: null,
        latencyMs: 0,
      })) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev,
    });

    expect(result.stdout).toContain("Modo efectivo: auto");
    expect(result.stdout).toContain("RESULTADO: BLOCK");
    expect(readReceipts(paths(), "FEATURE-PROMOTION-20261005")[0]?.notes?.join(" ")).toContain(
      `evidencia ${evidence.id}`,
    );
    expect(readReceipts(paths(), "FEATURE-PROMOTION-20261005")[0]?.notes?.join(" ")).toContain(
      "referencia humana qa-cycles",
    );
  });

  it("expone el motivo y la evidencia del modo efectivo en la tarjeta de Mission Control", () => {
    config([
      "gate-promotions:",
      "  analysis:",
      "    mode: auto",
      "    minimum-sample: 30",
      "    minimum-agreement: 0.9",
    ].join("\n"));
    writeFixtureTicket(lab, { id: "FEATURE-CARD-20261005", workflowStatus: "analyzed" });
    const evidence = evidenceFromCalibration(calibration(), "qa-cycles");
    appendPromotionEvidence(paths(), evidence);

    expect(listGateCards(paths(), "FEATURE-CARD-20261005")?.find((card) => card.id === "analysis"))
      .toMatchObject({ mode: "auto", modeReason: expect.stringMatching(/cumple/), promotionEvidenceId: evidence.id });
  });

  it.each([
    ["muestra insuficiente", calibration({ compared: 29, decided: 29, agree: 29, rate: 1 })],
    ["coincidencia baja", calibration({ agree: 26, rate: 26 / 30 })],
    ["falso aprobado crítico", calibration({ criticalFalseApproves: 1 })],
    ["gate distinto", calibration({ gate: "plan" })],
  ])("conserva hybrid ante %s", (_name, report) => {
    config([
      "gate-promotions:",
      "  analysis:",
      "    mode: auto",
      "    minimum-sample: 30",
      "    minimum-agreement: 0.9",
    ].join("\n"));

    appendPromotionEvidence(paths(), evidenceFromCalibration(report, "qa-cycles"));

    expect(resolveGateMode(paths(), "analysis")).toMatchObject({ mode: "hybrid" });
  });
});
