/**
 * La aplicabilidad de una proposición por tipo de ticket (R-CPRE-001).
 *
 * Preguntarle a una funcionalidad nueva por el síntoma de un error no mide calidad:
 * mide la ausencia de algo que nunca se pidió, y se paga como una pregunta más. Lo que
 * se afirma es que **el código** decide la aplicabilidad, antes de llamar a nadie:
 *
 * 1. Una proposición que no aplica no llega al evaluador y queda `no_aplica` en el
 *    recibo.
 * 2. Sin `appliesTo` aplica a todos; uno mal declarado falla en voz alta.
 * 3. Si el filtro no deja ninguna, no se aprueba por vacuidad.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runGate } from "../packages/engine/src/gate.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import type { JevEvaluation } from "../packages/gate-jev/src/index.js";
import {
  ANALYSIS_GATE,
  GateDefinitionError,
  partitionByApplicability,
  type Proposition,
} from "../packages/gate/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const SOLO_BUGFIX: Proposition = {
  id: "solo_correcciones",
  kind: "noul",
  instructions: "¿La causa explica el comportamiento actual?",
  appliesTo: ["BUGFIX"],
};
const LIBRE: Proposition = { id: "para_todos", kind: "noul", instructions: "¿Se cumple?" };

describe("separar por aplicabilidad", () => {
  it("una proposición solo de BUGFIX no aplica a un FEATURE y queda como no_aplica", () => {
    const { applicable, notApplicable } = partitionByApplicability([SOLO_BUGFIX, LIBRE], "FEATURE");
    expect(applicable.map((p) => p.id)).toEqual(["para_todos"]);
    expect(notApplicable).toEqual([
      { id: "solo_correcciones", status: "no_aplica", appliesTo: ["BUGFIX"], ticketType: "FEATURE" },
    ]);
  });

  it("la misma proposición aplica a un BUGFIX", () => {
    const { applicable, notApplicable } = partitionByApplicability([SOLO_BUGFIX, LIBRE], "BUGFIX");
    expect(applicable.map((p) => p.id)).toEqual(["solo_correcciones", "para_todos"]);
    expect(notApplicable).toEqual([]);
  });

  it("sin appliesTo aplica a todos los tipos", () => {
    for (const tipo of ["BUGFIX", "FEATURE", "SECURITY", "CHORE"]) {
      expect(partitionByApplicability([LIBRE], tipo).applicable).toHaveLength(1);
    }
  });

  it("un tipo que no existe o una lista vacía es un error de definición", () => {
    expect(() =>
      partitionByApplicability([{ ...LIBRE, appliesTo: ["CORRECCION"] }], "BUGFIX"),
    ).toThrow(GateDefinitionError);
    expect(() => partitionByApplicability([{ ...LIBRE, appliesTo: [] }], "BUGFIX")).toThrow(
      "appliesTo vacío",
    );
  });
});

describe("en la compuerta real", () => {
  let lab: string;
  const PATHS = (): { root: string; ticketsDir: string } => ({ root: lab, ticketsDir: "tickets" });
  const originales = [...ANALYSIS_GATE.propositions];

  /** Un evaluador simulado que anota qué proposiciones recibió. */
  function espia(): {
    jev: typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
    recibidas: () => string[];
  } {
    let ids: string[] = [];
    const jev = (async (options: { propositions?: readonly { id: string }[] }) => {
      ids = (options?.propositions ?? []).map((p) => p.id);
      const answers = (options?.propositions ?? []).map((p) =>
        p.id === "clasificacion"
          ? { id: p.id, kind: "choice" as const, choice: "completa", confidence: 0.95 }
          : { id: p.id, kind: "noul" as const, value: 0.95 },
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

  beforeEach(() => {
    lab = mkdtempSync(join(tmpdir(), "valmen-aplica-"));
    mkdirSync(join(lab, "tickets"), { recursive: true });
    // Se agrega una proposición solo de BUGFIX a la compuerta de análisis, y se
    // restaura al terminar: declarar `appliesTo` en proposiciones reales es de otro ticket.
    (ANALYSIS_GATE.propositions as Proposition[]).push(SOLO_BUGFIX);
  });

  afterEach(() => {
    (ANALYSIS_GATE.propositions as Proposition[]).splice(0, ANALYSIS_GATE.propositions.length, ...originales);
    rmSync(lab, { recursive: true, force: true });
  });

  it("sobre un FEATURE no se envía al evaluador y el recibo la registra como no_aplica", async () => {
    writeFixtureTicket(lab, { id: "FEATURE-POS-FILTRO-ORDENES-20260921", type: "FEATURE", workflowStatus: "analyzed" });
    const e = espia();

    const resultado = await runGate(PATHS(), {
      gateId: "analysis",
      ticketId: "FEATURE-POS-FILTRO-ORDENES-20260921",
      jev: e.jev,
    });

    expect(resultado.exitCode, resultado.stderr).toBe(0);
    expect(e.recibidas()).not.toContain("solo_correcciones");
    expect(e.recibidas().length).toBeGreaterThan(0);
    const recibo = readReceipts(PATHS(), "FEATURE-POS-FILTRO-ORDENES-20260921")[0];
    expect(recibo?.notApplicable).toContainEqual({
      id: "solo_correcciones",
      status: "no_aplica",
      appliesTo: ["BUGFIX"],
      ticketType: "FEATURE",
    });
    expect(resultado.stdout).toContain("No aplican a un ticket FEATURE");
  });

  it("sobre un BUGFIX sí se evalúa y el recibo no la registra como no_aplica", async () => {
    writeFixtureTicket(lab, { id: "BUGFIX-POS-FILTRO-ORDENES-20260921", type: "BUGFIX", workflowStatus: "analyzed" });
    const e = espia();

    const resultado = await runGate(PATHS(), {
      gateId: "analysis",
      ticketId: "BUGFIX-POS-FILTRO-ORDENES-20260921",
      jev: e.jev,
    });

    expect(resultado.exitCode, resultado.stderr).toBe(0);
    expect(e.recibidas()).toContain("solo_correcciones");
    const noAplican = readReceipts(PATHS(), "BUGFIX-POS-FILTRO-ORDENES-20260921")[0]?.notApplicable ?? [];
    expect(noAplican.map((registro) => registro.id)).not.toContain("solo_correcciones");
  });

  it("si el filtro no deja ninguna proposición, no se aprueba por vacuidad", async () => {
    writeFixtureTicket(lab, { id: "FEATURE-POS-FILTRO-ORDENES-20260921", type: "FEATURE", workflowStatus: "analyzed" });
    // Todas las proposiciones de la compuerta quedan solo para BUGFIX.
    (ANALYSIS_GATE.propositions as Proposition[]).splice(
      0,
      ANALYSIS_GATE.propositions.length,
      ...originales.map((p) => ({ ...p, appliesTo: ["BUGFIX"] }) as Proposition),
    );
    const e = espia();

    const resultado = await runGate(PATHS(), {
      gateId: "analysis",
      ticketId: "FEATURE-POS-FILTRO-ORDENES-20260921",
      jev: e.jev,
    });

    expect(resultado.exitCode).toBe(3);
    expect(resultado.stderr).toContain("aprobaría por vacuidad");
    expect(e.recibidas()).toEqual([]);
    expect(readReceipts(PATHS(), "FEATURE-POS-FILTRO-ORDENES-20260921")).toHaveLength(0);
  });
});
