/**
 * La precisión de las compuertas y los umbrales propuestos (R-CPRE-010, R-CPRE-011).
 *
 * Lo que se afirma:
 *
 * 1. **El informe** lee los recibos y dice, por compuerta y evaluador, la tasa de banda,
 *    las revisiones aprobadas sin cambios por una persona y los bloqueos por tipo. Una
 *    suite de regresión con vectores de recibos reales (`tests/fixtures/recibos-reales.jsonl`)
 *    fija sus cuentas: si la lectura cambia, estas pruebas lo dicen.
 * 2. **La propuesta de umbrales** sale de las decisiones humanas, sin llamar a un modelo ni
 *    aplicar nada, y con poca evidencia dice que no alcanza.
 * 3. Lo que decide el agente por delegación **no es una decisión humana**.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { precisionCommand, thresholdsCommand } from "../packages/cli/src/commands.js";
import {
  inferEvaluator,
  precisionReport,
  readCurrentReceipts,
  renderPrecision,
} from "../packages/engine/src/precision.js";
import {
  MIN_DECISIONES,
  MIN_RECHAZOS,
  proposeThresholds,
  renderProposal,
} from "../packages/engine/src/umbrales-propuestos.js";
import type { GateReceipt } from "../packages/gate/src/index.js";

const REALES = readFileSync(new URL("./fixtures/recibos-reales.jsonl", import.meta.url), "utf8")
  .trim()
  .split("\n")
  .map((linea) => JSON.parse(linea) as GateReceipt);

/** Un recibo mínimo con decisión humana, para armar muestras sintéticas. */
function recibo(opciones: {
  readonly id: string;
  readonly valores: readonly number[];
  readonly humano: "approve" | "reject" | null;
  readonly canal?: string;
  readonly gate?: string;
  readonly evaluator?: string;
  readonly outcome?: "approve" | "review" | "block";
  readonly ticket?: string;
}): GateReceipt {
  return {
    kind: "gate-receipt",
    receiptVersion: 1,
    schemaVersion: "2",
    id: opciones.id,
    gate: opciones.gate ?? "plan",
    subject: { type: "ticket", id: opciones.ticket ?? "BUGFIX-X-Y-20261001", revision: "1" },
    outcome: opciones.outcome ?? "review",
    reason: "x",
    actor: "model",
    decidedAt: "2026-10-05T10:00:00.000Z",
    policy: { approveAt: 0.9, blockAt: 0.1 },
    propositions: opciones.valores.map((valor, i) => ({
      id: `p${i}`,
      kind: "noul",
      weight: 1,
      value: valor,
      label: `p${i}=${valor}`,
      inBand: valor < 0.9 && valor > 0.1,
      effect: null,
      reason: "",
      verdict: true,
    })),
    model: { provider: "openrouter", model: "jev", resolvedVersion: "jev-1" },
    evaluator: opciones.evaluator ?? "jev",
    escalatedTo: "human",
    humanDecision:
      opciones.humano === null
        ? null
        : {
            actor: "Juan",
            decision: opciones.humano,
            reason: "x",
            channel: opciones.canal ?? "mission-control",
            decidedAt: "2026-10-05T11:00:00.000Z",
          },
  } as unknown as GateReceipt;
}

describe("la suite de regresión con vectores de recibos reales", () => {
  const filas = precisionReport(REALES);
  const fila = (gate: string, evaluator: string) => filas.find((f) => f.gate === gate && f.evaluator === evaluator);

  it("agrupa por compuerta y evaluador, y las cuentas de los 39 vectores no cambian", () => {
    expect(REALES).toHaveLength(39);
    expect(filas.map((f) => `${f.gate}·${f.evaluator}`)).toEqual([
      "analysis·cascade",
      "analysis·jev",
      "plan·cascade",
      "plan·jev",
      "qa-mechanical·command",
    ]);
    expect(filas.reduce((n, f) => n + f.runs, 0)).toBe(39);
    expect(fila("analysis", "cascade")).toMatchObject({ runs: 15, approve: 3, review: 9, block: 3, bandRate: 0.6 });
    expect(fila("plan", "cascade")).toMatchObject({ runs: 10, approve: 3, review: 3, block: 4, bandRate: 0.3 });
    expect(fila("plan", "jev")).toMatchObject({ runs: 6, approve: 3, review: 3, block: 0, bandRate: 0.5 });
    expect(fila("qa-mechanical", "command")).toMatchObject({ runs: 3, bandRate: 0, approvedUnchangedRate: null });
  });

  it("la tasa de revisiones aprobadas sin cambios cuenta solo las decididas por una persona", () => {
    // En analysis·cascade hay 3 revisiones que decidió una persona y 3 que decidió el agente
    // por delegación: estas últimas se informan aparte y no cuentan.
    expect(fila("analysis", "cascade")).toMatchObject({
      reviewsDecided: 3,
      reviewsDelegated: 3,
      reviewsApproved: 3,
      approvedUnchangedRate: 1,
    });
    expect(fila("plan", "cascade")).toMatchObject({ reviewsDecided: 2, reviewsDelegated: 1 });
  });

  it("los bloqueos se cuentan por tipo de ticket", () => {
    expect(fila("analysis", "cascade")?.blocksByType).toEqual({ FEATURE: 3 });
    expect(fila("plan", "cascade")?.blocksByType).toEqual({ BUGFIX: 1, FEATURE: 3 });
  });

  it("el informe muestra las tres cuentas", () => {
    const texto = renderPrecision(filas);
    expect(texto).toContain("analysis · cascade: 15 corrida(s) — aprueba 3, revisa 9, bloquea 3");
    expect(texto).toContain("tasa de banda: 60 %");
    expect(texto).toContain("revisiones aprobadas sin cambios: 100 % (3 de 3 decididas por una persona; 3 decidida(s) por el agente por delegación, que no cuentan)");
    expect(texto).toContain("bloqueos por tipo de ticket: BUGFIX 1, FEATURE 3");
  });

  it("acota por fechas", () => {
    expect(precisionReport(REALES, { desde: "2099-01-01" })).toEqual([]);
    expect(renderPrecision([], { desde: "2099-01-01" })).toContain("No hay recibos en ese período");
  });
});

describe("el evaluador de un recibo", () => {
  it("lo toma del campo, y en un recibo anterior lo infiere de su forma", () => {
    const base = recibo({ id: "a", valores: [0.9], humano: null });
    expect(inferEvaluator(base)).toBe("jev");
    const viejo = (extra: Record<string, unknown>) => ({ ...base, evaluator: undefined, ...extra }) as unknown as GateReceipt;
    expect(inferEvaluator(viejo({ escalations: [{}] }))).toBe("cascade");
    expect(inferEvaluator(viejo({ model: null }))).toBe("command");
    expect(inferEvaluator(viejo({ commandResults: [{}] }))).toBe("command");
    expect(inferEvaluator(viejo({ model: { provider: "openrouter", model: "typesafe/jev-1.13" } }))).toBe("jev");
    expect(inferEvaluator(viejo({ model: { provider: "codex", model: "gpt-6" } }))).toBe("llm-judge");
  });
});

describe("proponer umbrales desde las decisiones humanas", () => {
  /** 15 aprobaciones con valores 0.80–0.88 y 6 rechazos con valores 0.50–0.70. */
  function muestra(): GateReceipt[] {
    const aprobadas = Array.from({ length: 15 }, (_, i) =>
      recibo({ id: `ok${i}`, valores: [0.8 + (i % 9) / 100, 0.95], humano: "approve" }),
    );
    const rechazadas = Array.from({ length: 6 }, (_, i) =>
      recibo({ id: `no${i}`, valores: [0.5 + i / 25, 0.95], humano: "reject" }),
    );
    return [...aprobadas, ...rechazadas];
  }

  it("propone el valor más laxo sin falsos aprobados, con su acierto simulado, y no lo aplica", () => {
    const p = proposeThresholds(muestra(), "plan", "jev");

    expect(p.status).toBe("propuesta");
    expect(p.decisions).toBe(21);
    expect(p.proposal?.falseApproves).toBe(0);
    expect(p.proposal?.simulatedAgreement).toBe(1);
    // Los rechazos llegan hasta 0.70 y las aprobaciones empiezan en 0.80.
    expect(p.proposal?.approveAt).toBe(0.71);
    // Con el umbral actual (0.9) ninguna aprobación humana se habría aprobado sola.
    expect(p.proposal?.currentApproveAt).toBe(0.9);
    expect(p.proposal?.currentAgreement).toBeLessThan(1);

    const texto = renderProposal(p);
    expect(texto).toContain("NO se aplicó");
    expect(texto).toContain("approve-at: 0.71");
    // La entrada sale sin firma: `approved-by` y `reason` son de una persona.
    expect(texto).toContain("# approved-by: <la persona que lo decide>");
    expect(texto).not.toMatch(/^\s+approved-by:/m);
  });

  it("con pocas decisiones o pocos rechazos dice que la evidencia es insuficiente", () => {
    const pocas = proposeThresholds(muestra().slice(0, 10), "plan", "jev");
    expect(pocas.status).toBe("insuficiente");
    expect(pocas.reason).toContain("evidencia insuficiente");

    const sinRechazos = Array.from({ length: 30 }, (_, i) => recibo({ id: `ok${i}`, valores: [0.85], humano: "approve" }));
    const p = proposeThresholds(sinRechazos, "plan");
    expect(p.status).toBe("insuficiente");
    expect(p.rejections).toBe(0);
    expect(MIN_DECISIONES).toBe(20);
    expect(MIN_RECHAZOS).toBe(5);
    expect(renderProposal(p)).toContain("No se propone ningún valor");
  });

  it("lo que decide el agente por delegación no es una decisión humana", () => {
    const delegadas = Array.from({ length: 40 }, (_, i) =>
      recibo({ id: `d${i}`, valores: [0.6], humano: "approve", canal: "delegation" }),
    );
    const p = proposeThresholds([...muestra(), ...delegadas], "plan", "jev");
    expect(p.decisions).toBe(21);
    expect(p.proposal?.approveAt).toBe(0.71);
  });

  it("filtra por compuerta y por evaluador", () => {
    const otraCompuerta = proposeThresholds(muestra(), "analysis", "jev");
    expect(otraCompuerta.decisions).toBe(0);
    const otroEvaluador = proposeThresholds(muestra(), "plan", "cascade");
    expect(otroEvaluador.decisions).toBe(0);
  });
});

describe("los comandos", () => {
  let lab: string;
  const PATHS = (): { root: string; ticketsDir: string } => ({ root: lab, ticketsDir: "tickets" });

  beforeEach(() => {
    lab = mkdtempSync(join(tmpdir(), "valmen-precision-"));
    mkdirSync(join(lab, ".valmen", "receipts"), { recursive: true });
    // Los vectores reales, repartidos por ticket como los guarda el registro.
    const porTicket = new Map<string, string[]>();
    for (const r of REALES) {
      const id = r.subject.id;
      porTicket.set(id, [...(porTicket.get(id) ?? []), JSON.stringify(r)]);
    }
    for (const [id, lineas] of porTicket) {
      writeFileSync(join(lab, ".valmen", "receipts", `${id}.jsonl`), `${lineas.join("\n")}\n`, "utf8");
    }
  });
  afterEach(() => {
    rmSync(lab, { recursive: true, force: true });
  });

  it("precision lee los recibos del registro, sin modelo, y dice las tres cuentas", () => {
    expect(readCurrentReceipts(PATHS()).length).toBeGreaterThan(0);
    const r = precisionCommand(PATHS(), {});
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Precisión de las compuertas — todo el registro");
    expect(r.stdout).toContain("tasa de banda:");
    expect(r.stdout).toContain("revisiones aprobadas sin cambios:");
    expect(r.stdout).toContain("bloqueos por tipo de ticket:");
  });

  it("precision rechaza una fecha mal escrita", () => {
    expect(precisionCommand(PATHS(), { desde: "ayer" }).exitCode).toBe(2);
  });

  it("thresholds propone sin aplicar y pide la compuerta", () => {
    const r = thresholdsCommand(PATHS(), "plan", {});
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Propuesta de umbrales — compuerta plan");
    expect(thresholdsCommand(PATHS(), "qa-mechanical", {}).exitCode).toBe(2);
  });

  it("sin recibos los informes salen vacíos y no fallan", () => {
    rmSync(join(lab, ".valmen", "receipts"), { recursive: true, force: true });
    expect(precisionCommand(PATHS(), {}).stdout).toContain("No hay recibos");
    expect(thresholdsCommand(PATHS(), "plan", {}).stdout).toContain("evidencia insuficiente");
  });
});
