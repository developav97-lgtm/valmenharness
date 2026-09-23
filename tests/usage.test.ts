/**
 * El consumo del harness.
 *
 * Lo que se afirma acá es que las cuentas salen de los recibos y no de una
 * estimación: cada cifra tiene que poder rastrearse hasta una línea escrita por
 * una evaluación. Y la que importa de verdad es la última —**cuánto se decidió en
 * código y cuánto preguntándole a un modelo**—, porque es la que dice si el
 * harness está cumpliendo lo que promete.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderUsage, usageReport } from "../packages/engine/src/usage.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

let lab: string;

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

/** Un recibo con lo mínimo que el informe lee. */
function recibo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "gate-receipt",
    receiptVersion: 1,
    schemaVersion: "2",
    id: "GR-20260921-analysis",
    gate: "analysis",
    gateHash: "sha256:aaaa",
    subject: { type: "ticket", id: "BUGFIX-POS-UNO-20260921", revision: "100" },
    outcome: "approve",
    reason: "todo claro",
    actor: "model",
    decidedAt: "2026-09-21T10:00:00.000Z",
    stateHash: "sha256:bbbb",
    policy: { approveAt: 0.9, blockAt: 0.1 },
    mechanicalChecks: [],
    modelAnswers: [],
    propositions: [],
    model: { provider: "openrouter", model: "jev-1.13", resolvedVersion: "jev@1" },
    usage: { inputTokens: 1000, outputTokens: 100, costUsd: 0.0002 },
    latencyMs: 500,
    escalatedTo: null,
    humanDecision: null,
    ...overrides,
  };
}

/** Escribe un registro de recibos para un ticket. */
function recibos(ticketId: string, entradas: readonly Record<string, unknown>[]): void {
  mkdirSync(join(lab, ".valmen", "receipts"), { recursive: true });
  writeFileSync(
    join(lab, ".valmen", "receipts", `${ticketId}.jsonl`),
    `${entradas.map((entrada) => JSON.stringify(entrada)).join("\n")}\n`,
    "utf8",
  );
}

/** Un ticket cerrado con los resultados de QA que pida el test. */
function conQa(id: string, resultados: readonly string[]): void {
  // El veredicto humano sale de los ciclos de QA, y para que el ticket valide el
  // estado tiene que ser coherente con ellos: aprobado si el último aprobó, y
  // todavía en QA si devolvió.
  const aprobado = resultados[resultados.length - 1] === "approved";
  writeFixtureTicket(lab, {
    id,
    workflowStatus: aprobado ? "qa_approved" : "in_qa",
    ...(aprobado ? { qaStatus: "approved" } : {}),
  });
  const ruta = join(lab, "tickets", "2026", id, "ticket.md");
  const ciclos = resultados.map((resultado, indice) => ({
    id: `QA-00${indice + 1}`,
    date: "2026-09-20",
    build_reference: `commit:${"a".repeat(40)}`,
    environment: "local",
    result: resultado,
    findings: [],
    correction: null,
    po_confirmation: resultado === "approved" ? "conforme" : null,
  }));
  const texto = readFileSync(ruta, "utf8");
  writeFileSync(
    ruta,
    texto
      .replace(
        /(## QA\n\n```json\n)\[\]([\s\S]*?```)/,
        `$1${JSON.stringify(ciclos, null, 2)}$2`,
      )
      .replace(
        "## Pruebas\n\nPendiente de ejecución.",
        "## Pruebas\n\n- Resultado del PO: probado y conforme.",
      ),
    "utf8",
  );
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-uso-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("lo que cuenta", () => {
  it("sin recibos lo dice, en vez de inventar ceros con forma de informe", () => {
    const texto = renderUsage(usageReport(PATHS()));
    expect(texto).toContain("No hay evaluaciones");
  });

  it("cuenta evaluaciones, coste, latencia y modelos", () => {
    recibos("BUGFIX-POS-UNO-20260921", [
      recibo(),
      recibo({
        id: "GR-20260921-plan",
        gate: "plan",
        outcome: "review",
        usage: { inputTokens: 2000, outputTokens: 200, costUsd: 0.0004 },
        latencyMs: 700,
      }),
    ]);

    const informe = usageReport(PATHS());

    expect(informe.evaluations).toBe(2);
    expect(informe.tickets).toBe(1);
    expect(informe.costUsd).toBeCloseTo(0.0006, 8);
    expect(informe.meanLatencyMs).toBe(600);
    expect(informe.byGate.map((fila) => fila.gate)).toEqual(["analysis", "plan"]);
    expect(informe.byGate[1]).toMatchObject({ evaluations: 1, review: 1, approve: 0 });
    expect(informe.byModel[0]).toMatchObject({
      provider: "openrouter",
      model: "jev-1.13",
      evaluations: 2,
    });
  });

  it("separa lo que decidió el código de lo que se le preguntó a un modelo", () => {
    // La cifra que dice si el harness cumple lo que promete: lo decidible en
    // código se decide en código, y preguntarlo igual es pagar por lo que ya se
    // podía computar.
    recibos("BUGFIX-POS-UNO-20260921", [
      recibo({ id: "GR-1", model: null, usage: null, latencyMs: 40 }),
      recibo({ id: "GR-2" }),
      recibo({ id: "GR-3" }),
    ]);

    const informe = usageReport(PATHS());

    expect(informe.byCode).toBe(1);
    expect(informe.costUsd).toBeCloseTo(0.0004, 8);
    expect(informe.byGate[0]?.byCode).toBe(1);
  });

  it("un recibo escalado se cuenta una vez, con su decisión humana", () => {
    // El recibo se anexa dos veces: la segunda trae la decisión de la persona.
    // Contar las dos inflaría el consumo y contaría dos veces la misma evaluación.
    recibos("BUGFIX-POS-UNO-20260921", [
      recibo({ outcome: "review", escalatedTo: "human" }),
      recibo({
        outcome: "approve",
        escalatedTo: "human",
        humanDecision: { actor: "Juan", decision: "approve", reason: "está bien" },
      }),
    ]);

    const informe = usageReport(PATHS());

    expect(informe.evaluations).toBe(1);
    expect(informe.escalated).toBe(1);
    expect(informe.byGate[0]).toMatchObject({ approve: 1, review: 0 });
  });

  it("filtra por rango de fechas", () => {
    recibos("BUGFIX-POS-UNO-20260921", [
      recibo({ id: "GR-1", decidedAt: "2026-09-01T10:00:00.000Z" }),
      recibo({ id: "GR-2", decidedAt: "2026-09-21T10:00:00.000Z" }),
      recibo({ id: "GR-3", decidedAt: "2026-09-30T10:00:00.000Z" }),
    ]);

    const informe = usageReport(PATHS(), { desde: "2026-09-15", hasta: "2026-09-25" });

    expect(informe.evaluations).toBe(1);
    expect(informe.desde).toBe("2026-09-15");
  });

  it("un recibo ilegible se cuenta y se dice, no se descarta en silencio", () => {
    // Descartarlo dejaría el informe con aspecto completo y un dato falso.
    mkdirSync(join(lab, ".valmen", "receipts"), { recursive: true });
    writeFileSync(
      join(lab, ".valmen", "receipts", "BUGFIX-POS-UNO-20260921.jsonl"),
      `${JSON.stringify(recibo())}\n{ esto no es json\n`,
      "utf8",
    );

    const informe = usageReport(PATHS());

    expect(informe.evaluations).toBe(1);
    expect(informe.unreadable).toBe(1);
    expect(renderUsage(informe)).toContain("ilegible");
  });

  it("lee los recibos de todos los tickets, no solo del primero", () => {
    recibos("BUGFIX-POS-UNO-20260921", [recibo({ id: "GR-1" })]);
    recibos("BUGFIX-POS-DOS-20260921", [
      recibo({ id: "GR-2", subject: { type: "ticket", id: "BUGFIX-POS-DOS-20260921" } }),
    ]);

    expect(usageReport(PATHS()).tickets).toBe(2);
  });
});

describe("la calibración con datos reales", () => {
  it("compara lo que dijo el gate con lo que terminó diciendo la persona", () => {
    conQa("BUGFIX-POS-UNO-20260921", ["pending", "approved"]);
    conQa("BUGFIX-POS-DOS-20260921", ["pending", "changes_requested"]);
    recibos("BUGFIX-POS-UNO-20260921", [
      recibo({ id: "GR-1", subject: { type: "ticket", id: "BUGFIX-POS-UNO-20260921" } }),
    ]);
    recibos("BUGFIX-POS-DOS-20260921", [
      recibo({
        id: "GR-2",
        subject: { type: "ticket", id: "BUGFIX-POS-DOS-20260921" },
        outcome: "approve",
      }),
    ]);

    const informe = usageReport(PATHS());
    const plan = informe.calibration[0];

    expect(plan?.compared).toBe(2);
    expect(plan?.decided).toBe(2);
    // Uno coincidió y el otro fue un falso aprobado: el gate aprobó algo que la
    // persona devolvió.
    expect(plan?.agree).toBe(1);
    expect(plan?.falseApproves).toBe(1);
  });

  it("no inventa calibración donde no hay veredicto humano", () => {
    // Un ticket sin ciclos de QA no dice si estaba bien, y contarlo como acierto
    // inflaría la coincidencia justo donde no hay información.
    writeFixtureTicket(lab, {
      id: "BUGFIX-POS-UNO-20260921",
      workflowStatus: "in_progress",
    });
    recibos("BUGFIX-POS-UNO-20260921", [recibo()]);

    const informe = usageReport(PATHS());

    expect(informe.calibration).toEqual([]);
    expect(renderUsage(informe)).not.toContain("Calibración");
  });
});
