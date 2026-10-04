/**
 * El informe de consumo cuenta **una evaluación por corrida**.
 *
 * El defecto que estas pruebas fijan: `vigentes()` colapsaba por identificador, y
 * el identificador viejo no nombraba ticket ni intento. Dos consecuencias, las
 * dos caras del mismo dato mal formado: varios reintentos del mismo gate del
 * mismo ticket el mismo día contaban como uno —`GR-20260929-analysis` aparecía
 * con seis corridas el 3 de octubre y el informe veía una sola—, y recibos de
 * tickets distintos con el mismo id se pisaban entre sí. El informe de consumo
 * del 2 al 4 de octubre contaba 9 evaluaciones en 4 tickets donde había 193
 * líneas en 36.
 *
 * Un reintento es una corrida: pagó un modelo, dejó un veredicto y tiene que
 * contarse. Lo único que no se cuenta dos veces es la decisión humana anexada al
 * mismo recibo, que es la misma corrida con un estado nuevo.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderUsage, usageReport } from "../packages/engine/src/usage.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const UNO = "BUGFIX-POS-UNO-20260921";
const DOS = "BUGFIX-POS-DOS-20260921";

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
    id: "GR-20261004-BUGFIX-POS-UNO-20260921-plan-1",
    gate: "plan",
    gateHash: "sha256:aaaa",
    subject: { type: "ticket", id: UNO, revision: "100" },
    outcome: "approve",
    reason: "todo claro",
    actor: "model",
    decidedAt: "2026-10-04T10:00:00.000Z",
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

/** Un ticket con los resultados de QA que pida el test. */
function conQa(id: string, resultados: readonly string[]): void {
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
  lab = mkdtempSync(join(tmpdir(), "valmen-uso-recibo-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("R-3: una evaluación por corrida", () => {
  it("cuenta los reintentos del mismo gate del mismo ticket el mismo día", () => {
    // Dos corridas del gate de plan el mismo día: un bloqueo y su reintento.
    // Antes compartían id y contaban una sola.
    recibos(UNO, [
      recibo({
        id: `GR-20261004-${UNO}-plan-1`,
        outcome: "block",
        decidedAt: "2026-10-04T10:00:00.000Z",
      }),
      recibo({
        id: `GR-20261004-${UNO}-plan-2`,
        outcome: "approve",
        decidedAt: "2026-10-04T10:30:00.000Z",
      }),
    ]);

    const informe = usageReport(PATHS());

    expect(informe.evaluations).toBe(2);
    expect(informe.tickets).toBe(1);
    expect(informe.byGate[0]).toMatchObject({
      gate: "plan",
      evaluations: 2,
      block: 1,
      approve: 1,
    });
  });

  it("no cuenta recibos de otro ticket que comparten identificador viejo", () => {
    // Dos tickets corrieron `analysis` el mismo día con el id viejo
    // `GR-20260929-analysis`. Colapsar solo por id perdía el de uno de los dos.
    recibos(UNO, [
      recibo({
        id: "GR-20260929-analysis",
        gate: "analysis",
        subject: { type: "ticket", id: UNO, revision: "100" },
        decidedAt: "2026-09-29T10:00:00.000Z",
      }),
    ]);
    recibos(DOS, [
      recibo({
        id: "GR-20260929-analysis",
        gate: "analysis",
        subject: { type: "ticket", id: DOS, revision: "100" },
        decidedAt: "2026-09-29T11:00:00.000Z",
      }),
    ]);

    const informe = usageReport(PATHS());

    expect(informe.evaluations).toBe(2);
    expect(informe.tickets).toBe(2);
    expect(informe.byGate[0]).toMatchObject({ gate: "analysis", evaluations: 2 });
  });

  it("la decisión humana anexada al mismo recibo sigue contando una sola vez", () => {
    // La razón por la que el colapso existe: la segunda línea es la misma
    // corrida con la decisión de la persona, no una evaluación nueva.
    recibos(UNO, [
      recibo({ id: `GR-20261004-${UNO}-plan-1`, outcome: "review", escalatedTo: "human" }),
      recibo({
        id: `GR-20261004-${UNO}-plan-1`,
        outcome: "review",
        escalatedTo: "human",
        actor: "human",
        humanDecision: {
          actor: "Juan",
          decision: "approve",
          reason: "conforme",
          channel: "mission-control",
          decidedAt: "2026-10-04T10:10:00.000Z",
        },
      }),
    ]);

    const informe = usageReport(PATHS());

    expect(informe.evaluations).toBe(1);
    expect(informe.escalated).toBe(1);
  });

  it("el informe del rango ve todas las corridas, no una por día y compuerta", () => {
    recibos(UNO, [
      recibo({
        id: `GR-20261004-${UNO}-analysis-1`,
        gate: "analysis",
        decidedAt: "2026-10-04T06:13:00.000Z",
      }),
      recibo({
        id: `GR-20261004-${UNO}-analysis-2`,
        gate: "analysis",
        decidedAt: "2026-10-04T06:30:00.000Z",
      }),
      recibo({
        id: `GR-20261004-${UNO}-analysis-3`,
        gate: "analysis",
        decidedAt: "2026-10-04T07:17:00.000Z",
      }),
    ]);

    const informe = usageReport(PATHS(), { desde: "2026-10-04", hasta: "2026-10-04" });

    expect(informe.evaluations).toBe(3);
    expect(renderUsage(informe)).toContain("3 en 1 ticket(s)");
  });
});

describe("R-3: la calibración lee lo mismo que el informe", () => {
  it("un reintento del mismo día no colapsa en la calibración", () => {
    // El veredicto humano del ticket es un rechazo (tuvo una devolución). Las
    // dos corridas cuentan: la que bloqueó coincide, la que aprobó no. Antes el
    // reintento no aparecía y la calibración comparaba una sola corrida.
    conQa(UNO, ["pending", "changes_requested"]);
    recibos(UNO, [
      recibo({
        id: `GR-20261004-${UNO}-plan-1`,
        outcome: "block",
        decidedAt: "2026-10-04T10:00:00.000Z",
      }),
      recibo({
        id: `GR-20261004-${UNO}-plan-2`,
        outcome: "approve",
        decidedAt: "2026-10-04T10:30:00.000Z",
      }),
    ]);

    const informe = usageReport(PATHS());
    const plan = informe.calibration[0];

    expect(plan?.compared).toBe(2);
    expect(plan?.falseApproves).toBe(1);
  });
});
