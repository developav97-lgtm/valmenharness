/**
 * El identificador de un recibo nombra **la corrida**, no el día.
 *
 * El defecto que estas pruebas fijan: `GR-<fecha>-<compuerta>` era un
 * identificador de día donde hacía falta uno de corrida. Dos corridas del mismo
 * gate del mismo ticket el mismo día —un reintento tras un bloqueo— o dos
 * tickets distintos que corrían el mismo gate el mismo día compartían
 * identificador, y `currentReceipts` —que existe para que la decisión humana no
 * borre el veredicto del modelo— terminaba borrando corridas enteras y cruzando
 * tickets. Un recuento que pierde corridas no es un recuento: es una lectura de
 * un conjunto que ya no es el que ocurrió.
 *
 * El identificador nuevo es `GR-<fecha>-<ticket>-<compuerta>-<intento>`, con el
 * ticket porque dos tickets distintos que corren el mismo gate el mismo día no
 * pueden compartirlo, y el viejo se sigue leyendo.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runGate } from "../packages/engine/src/gate.js";
import {
  appendReceipt,
  currentReceipts,
  readReceipts,
} from "../packages/engine/src/receipts.js";
import type { JevEvaluation } from "../packages/gate-jev/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const UNO = "BUGFIX-POS-FILTRO-ORDENES-20260921";
const DOS = "BUGFIX-POS-FILTRO-ALMACEN-20260921";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-recibo-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
  // El fixture nace en `planned`, que es el estado que el gate de plan exige.
  writeFixtureTicket(lab, { id: UNO });
  writeFixtureTicket(lab, { id: DOS });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

/** Un evaluador simulado que responde todas las proposiciones del gate. */
function evaluator(
  value: number,
): typeof import("../packages/gate-jev/src/index.js").evaluateWithJev {
  return (async (options: { propositions?: readonly { id: string }[] }) => {
    const answers = (options?.propositions ?? []).map((proposition) =>
      proposition.id === "clasificacion"
        ? {
            id: proposition.id,
            kind: "choice" as const,
            choice: "completo",
            confidence: 0.95,
          }
        : { id: proposition.id, kind: "noul" as const, value },
    );
    return {
      answers,
      model: {
        provider: "openrouter",
        model: "typesafe/jev-1.13",
        resolvedVersion: "typesafe/jev-1.13-20260917",
      },
      usage: { inputTokens: 100, outputTokens: 10, costUsd: 0.00001 },
      latencyMs: 100,
    } as JevEvaluation;
  }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
}

/** Una fecha fija, para que las corridas caigan el mismo día. */
const EL_MISMO_DIA = (): Date => new Date("2026-10-04T10:00:00Z");

/** Un recibo mínimo y válido, para sembrar el registro. */
function reciboViejo(id: string, ticketId: string): Record<string, unknown> {
  return {
    kind: "gate-receipt",
    receiptVersion: 1,
    schemaVersion: "2",
    id,
    gate: "plan",
    gateHash: "sha256:aaaa",
    subject: { type: "ticket", id: ticketId, revision: "10" },
    outcome: "review",
    reason: "viejo",
    actor: "model",
    decidedAt: "2026-10-04T09:00:00.000Z",
    stateHash: "sha256:bbbb",
    policy: { approveAt: 0.9, blockAt: 0.1 },
    mechanicalChecks: [],
    modelAnswers: [],
    propositions: [],
    model: null,
    usage: null,
    latencyMs: null,
    escalatedTo: "human",
    humanDecision: null,
  };
}

describe("R-1: dos corridas del mismo gate del mismo ticket el mismo día", () => {
  it("tienen identificadores distintos y ambas sobreviven al colapso", async () => {
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: UNO,
      jev: evaluator(0.95),
      now: EL_MISMO_DIA,
    });
    // Repetir el mismo estado con el mismo evaluador se rechaza (R-CDEF-008); acá lo que
    // se prueba es la identidad de los recibos de un reintento, así que se fuerza.
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: UNO,
      jev: evaluator(0.95),
      now: EL_MISMO_DIA,
      forceReason: "reintento deliberado para probar la identidad de los recibos",
    });

    const historia = readReceipts(PATHS(), UNO);
    expect(historia).toHaveLength(2);
    expect(historia[0]?.id).not.toBe(historia[1]?.id);

    // El colapso conserva las dos corridas: antes el segundo id (idéntico al
    // primero) pisaba al primero y el informe veía una sola evaluación donde
    // hubo dos reintentos.
    expect(currentReceipts(historia)).toHaveLength(2);
  });

  it("numera el intento de forma creciente", async () => {
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: UNO,
      jev: evaluator(0.95),
      now: EL_MISMO_DIA,
    });
    // Repetir el mismo estado con el mismo evaluador se rechaza (R-CDEF-008); acá lo que
    // se prueba es la identidad de los recibos de un reintento, así que se fuerza.
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: UNO,
      jev: evaluator(0.95),
      now: EL_MISMO_DIA,
      forceReason: "reintento deliberado para probar la identidad de los recibos",
    });

    const ids = readReceipts(PATHS(), UNO).map((recibo) => recibo.id);
    expect(ids).toEqual([`GR-20261004-${UNO}-plan-1`, `GR-20261004-${UNO}-plan-2`]);
  });
});

describe("R-2: dos tickets distintos que corren el mismo gate el mismo día", () => {
  it("no comparten el identificador de sus recibos", async () => {
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: UNO,
      jev: evaluator(0.95),
      now: EL_MISMO_DIA,
    });
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: DOS,
      jev: evaluator(0.95),
      now: EL_MISMO_DIA,
    });

    const uno = readReceipts(PATHS(), UNO);
    const dos = readReceipts(PATHS(), DOS);
    expect(uno).toHaveLength(1);
    expect(dos).toHaveLength(1);
    expect(uno[0]?.id).toBe(`GR-20261004-${UNO}-plan-1`);
    expect(dos[0]?.id).toBe(`GR-20261004-${DOS}-plan-1`);
    expect(uno[0]?.id).not.toBe(dos[0]?.id);
  });

  it("el colapso de todo el registro no cruza los dos tickets", async () => {
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: UNO,
      jev: evaluator(0.95),
      now: EL_MISMO_DIA,
    });
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: DOS,
      jev: evaluator(0.95),
      now: EL_MISMO_DIA,
    });

    const todos = [...readReceipts(PATHS(), UNO), ...readReceipts(PATHS(), DOS)];
    expect(currentReceipts(todos)).toHaveLength(2);
  });
});

describe("compatibilidad con el identificador viejo", () => {
  it("un id viejo y uno nuevo del mismo gate del mismo día no se pisan", async () => {
    // Un recibo viejo con `GR-<fecha>-<compuerta>` ya está en el registro; la
    // corrida nueva no reutiliza su lugar porque el patrón solo reconoce el
    // sufijo numérico. Las dos líneas sobreviven.
    appendReceipt(PATHS(), UNO, reciboViejo("GR-20261004-plan", UNO) as never);

    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: UNO,
      jev: evaluator(0.95),
      now: EL_MISMO_DIA,
    });

    const ids = readReceipts(PATHS(), UNO).map((recibo) => recibo.id);
    expect(ids).toContain("GR-20261004-plan");
    expect(ids).toContain(`GR-20261004-${UNO}-plan-1`);
    expect(new Set(ids).size).toBe(2);
  });
});
