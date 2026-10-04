/**
 * Los recibos ya escritos se siguen leyendo.
 *
 * El registro es append-only: los recibos emitidos antes del cambio tienen un
 * identificador que no nombra ticket ni intento, y no se reescriben. El lector
 * tiene que aceptarlos —`currentReceipts`, `readReceipts` y el informe de
 * consumo— y la calibración no puede cambiar de resultado por el formato nuevo.
 *
 * La compatibilidad es la prueba de que el arreglo no rompió la historia: si los
 * recibos viejos dejaran de leerse, el arreglo habría ganado identidad por
 * corrida perdiendo el registro que existía.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { currentReceipts, readReceipts } from "../packages/engine/src/receipts.js";
import { usageReport } from "../packages/engine/src/usage.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const UNO = "BUGFIX-POS-UNO-20260921";
const DOS = "BUGFIX-POS-DOS-20260921";

let lab: string;

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

/** Un recibo con el formato viejo: `GR-<fecha>-<compuerta>`, sin ticket ni intento. */
function reciboViejo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "gate-receipt",
    receiptVersion: 1,
    schemaVersion: "2",
    id: "GR-20260929-analysis",
    gate: "analysis",
    gateHash: "sha256:aaaa",
    subject: { type: "ticket", id: UNO, revision: "100" },
    outcome: "approve",
    reason: "todo claro",
    actor: "model",
    decidedAt: "2026-09-29T10:00:00.000Z",
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

function escribir(ticketId: string, entradas: readonly Record<string, unknown>[]): void {
  mkdirSync(join(lab, ".valmen", "receipts"), { recursive: true });
  writeFileSync(
    join(lab, ".valmen", "receipts", `${ticketId}.jsonl`),
    `${entradas.map((entrada) => JSON.stringify(entrada)).join("\n")}\n`,
    "utf8",
  );
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-recibo-compat-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("R-5: los recibos de formato viejo se siguen leyendo", () => {
  it("readReceipts los devuelve tal cual", () => {
    escribir(UNO, [reciboViejo()]);
    const historia = readReceipts(PATHS(), UNO);
    expect(historia).toHaveLength(1);
    expect(historia[0]?.id).toBe("GR-20260929-analysis");
  });

  it("la decisión humana anexada con el id viejo colapsa a su vigente", () => {
    // El formato viejo se anexaba dos veces con el mismo id: veredicto y
    // decisión. El colapso tiene que seguir dejando una sola corrida vigente.
    escribir(UNO, [
      reciboViejo({ outcome: "review", escalatedTo: "human" }),
      reciboViejo({
        outcome: "review",
        escalatedTo: "human",
        actor: "human",
        humanDecision: {
          actor: "PO",
          decision: "approve",
          reason: "conforme",
          channel: "mission-control",
          decidedAt: "2026-09-29T10:10:00.000Z",
        },
      }),
    ]);

    const vigentes = currentReceipts(readReceipts(PATHS(), UNO));
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0]?.humanDecision?.decision).toBe("approve");
  });

  it("el informe cuenta los recibos viejos de tickets distintos sin cruzarlos", () => {
    escribir(UNO, [reciboViejo()]);
    escribir(DOS, [reciboViejo({ subject: { type: "ticket", id: DOS, revision: "100" } })]);

    const informe = usageReport(PATHS());

    expect(informe.evaluations).toBe(2);
    expect(informe.tickets).toBe(2);
  });

  it("mezclar formatos viejos y nuevos no pierde ninguno", () => {
    escribir(UNO, [
      reciboViejo({ id: "GR-20260929-analysis" }),
      reciboViejo({
        id: `GR-20261004-${UNO}-analysis-1`,
        decidedAt: "2026-10-04T10:00:00.000Z",
      }),
      reciboViejo({
        id: `GR-20261004-${UNO}-analysis-2`,
        decidedAt: "2026-10-04T10:30:00.000Z",
      }),
    ]);

    const informe = usageReport(PATHS());

    expect(informe.evaluations).toBe(3);
    expect(currentReceipts(readReceipts(PATHS(), UNO))).toHaveLength(3);
  });
});

describe("R-5: la calibración no cambia de resultado por el formato nuevo", () => {
  it("un recibo viejo y uno nuevo del mismo gate calibran igual", () => {
    // El veredicto humano del ticket es un rechazo. Con una sola corrida —daría
    // igual el formato— la calibración compara una evaluación y la coincide.
    writeFixtureTicket(lab, { id: UNO, workflowStatus: "in_qa" });
    const ruta = join(lab, "tickets", "2026", UNO, "ticket.md");
    const ciclos = [
      {
        id: "QA-001",
        date: "2026-09-20",
        build_reference: `commit:${"a".repeat(40)}`,
        environment: "local",
        result: "pending",
        findings: [],
        correction: null,
        po_confirmation: null,
      },
      {
        id: "QA-002",
        date: "2026-09-21",
        build_reference: `commit:${"b".repeat(40)}`,
        environment: "local",
        result: "changes_requested",
        findings: [],
        correction: null,
        po_confirmation: null,
      },
    ];
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

    // Formato viejo: `GR-<fecha>-<compuerta>`.
    escribir(UNO, [reciboViejo({ outcome: "block" })]);
    const conViejo = usageReport(PATHS()).calibration[0];

    // Formato nuevo: `GR-<fecha>-<ticket>-<compuerta>-<n>`, misma corrida.
    escribir(UNO, [reciboViejo({ id: `GR-20261004-${UNO}-analysis-1`, outcome: "block" })]);
    const conNuevo = usageReport(PATHS()).calibration[0];

    expect(conViejo?.compared).toBe(1);
    expect(conNuevo?.compared).toBe(1);
    expect(conNuevo?.agree).toBe(conViejo?.agree);
    expect(conNuevo?.falseApproves).toBe(conViejo?.falseApproves);
  });
});
