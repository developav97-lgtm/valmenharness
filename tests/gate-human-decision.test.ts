/**
 * La decisión humana sobre un gate escalado.
 *
 * El defecto que estas pruebas fijan tiene dos mitades. La primera es la
 * identidad: la decisión debe anexarse al recibo **de su corrida**, con el mismo
 * identificador, sin reescribir la línea del veredicto del modelo, y
 * `gate-decide --receipt` debe encontrar ese recibo tanto con el identificador
 * nuevo —`GR-<fecha>-<ticket>-<compuerta>-<n>`— como con uno viejo sin ticket ni
 * intento. La segunda es que la decisión cambia el actor: un gate escalado y
 * aprobado por el PO seguía contando como decisión del modelo, y el recibo tiene
 * que poder decir quién decidió.
 *
 * Y sigue valiendo lo de antes: un recibo que ya tiene una decisión humana se
 * rechaza en vez de anexar una segunda. Esa línea no se toca —el diseño la ordena
 * exactamente una vez— y el rechazo es la garantía de que no se anexa dos veces.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_POLICY,
  buildReceipt,
  decide,
  type GateReceipt,
  type Proposition,
  type PropositionAnswer,
} from "../packages/gate/src/index.js";
import {
  appendReceipt,
  currentReceipts,
  readReceipts,
  type RegistryPaths,
} from "../packages/engine/src/index.js";
import { recordHumanDecision } from "../packages/server/src/gates.js";

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";

const PROPOSICIONES: Proposition[] = [
  { id: "cubre_todos_los_criterios", kind: "noul", instructions: "cubre", weight: 3 },
];

const RESPUESTAS: PropositionAnswer[] = [
  { id: "cubre_todos_los_criterios", kind: "noul", value: 0.72 },
];

let lab: string;

const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-gate-humano-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Un recibo en banda de revisión: el que espera una persona. */
function reciboEscalado(id: string, revision = "1"): GateReceipt {
  const decision = decide(PROPOSICIONES, RESPUESTAS, DEFAULT_POLICY);
  return buildReceipt({
    id,
    gate: "plan",
    propositions: PROPOSICIONES,
    policy: DEFAULT_POLICY,
    subject: { type: "ticket", id: TICKET, revision },
    decision,
    state: { ticket: TICKET },
    answers: RESPUESTAS,
    mechanicalChecks: [],
    model: null,
    usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.00042 },
    latencyMs: 500,
    decidedAt: "2026-10-04T10:00:00Z",
  });
}

function decidir(receiptId: string, actor = "Juan Andrade") {
  return recordHumanDecision(PATHS(), TICKET, receiptId, {
    decision: "approve",
    actor,
    reason: "el criterio faltante es de otro sprint",
  });
}

describe("R-4a: la decisión se anexa al recibo de su corrida", () => {
  it("usa el mismo identificador y no reescribe el veredicto del modelo", () => {
    const id = `GR-20261004-${TICKET}-plan-1`;
    appendReceipt(PATHS(), TICKET, reciboEscalado(id));

    const resultado = decidir(id);
    expect(resultado.ok).toBe(true);

    // Dos líneas con el mismo id: el veredicto del modelo y la decisión humana.
    const historia = readReceipts(PATHS(), TICKET);
    expect(historia).toHaveLength(2);
    expect(historia[0]?.id).toBe(id);
    expect(historia[1]?.id).toBe(id);
    // La línea del veredicto conserva su actor de modelo y su veredicto de
    // revisión: la decisión de la persona no lo borra.
    expect(historia[0]?.actor).toBe("model");
    expect(historia[0]?.outcome).toBe("review");
    expect(historia[0]?.humanDecision).toBeNull();
    // La línea anexada trae la decisión y el veredicto del modelo intacto.
    expect(historia[1]?.actor).toBe("human");
    expect(historia[1]?.outcome).toBe("review");
    expect(historia[1]?.humanDecision?.decision).toBe("approve");
    expect(historia[1]?.humanDecision?.actor).toBe("Juan Andrade");
  });

  it("el colapso deja como vigente la corrida con su decisión", () => {
    const id = `GR-20261004-${TICKET}-plan-1`;
    appendReceipt(PATHS(), TICKET, reciboEscalado(id));
    decidir(id);

    const vigentes = currentReceipts(readReceipts(PATHS(), TICKET));
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0]?.id).toBe(id);
    expect(vigentes[0]?.humanDecision?.actor).toBe("Juan Andrade");
  });
});

describe("R-4b: gate-decide --receipt encuentra el recibo vigente", () => {
  it("encuentra un recibo con el identificador nuevo", () => {
    const id = `GR-20261004-${TICKET}-plan-1`;
    appendReceipt(PATHS(), TICKET, reciboEscalado(id));

    expect(decidir(id).ok).toBe(true);
    expect(currentReceipts(readReceipts(PATHS(), TICKET))[0]?.humanDecision).not.toBeNull();
  });

  it("encuentra un recibo viejo sin ticket ni intento", () => {
    // Compatibilidad: los recibos ya escritos con `GR-<fecha>-<compuerta>` siguen
    // encontrándose por su id.
    appendReceipt(PATHS(), TICKET, reciboEscalado("GR-20261004-plan"));

    expect(decidir("GR-20261004-plan").ok).toBe(true);
    expect(currentReceipts(readReceipts(PATHS(), TICKET))[0]?.humanDecision?.actor).toBe(
      "Juan Andrade",
    );
  });

  it("no encuentra un recibo que no es de su corrida", () => {
    appendReceipt(PATHS(), TICKET, reciboEscalado(`GR-20261004-${TICKET}-plan-1`));

    const resultado = decidir(`GR-20261004-${TICKET}-plan-2`);
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toContain("No existe el recibo");
  });
});

describe("R-4c: rechazo de una segunda decisión humana", () => {
  it("un recibo que ya tiene decisión humana se rechaza", () => {
    const id = `GR-20261004-${TICKET}-plan-1`;
    appendReceipt(PATHS(), TICKET, reciboEscalado(id));
    expect(decidir(id, "Juan Andrade").ok).toBe(true);

    const segunda = decidir(id, "Otra Persona");
    expect(segunda.ok).toBe(false);
    expect(segunda.error).toContain("ya tiene una decisión humana");

    // La negativa no dejó una tercera línea: el registro sigue con dos.
    expect(readReceipts(PATHS(), TICKET)).toHaveLength(2);
  });
});

describe("la decisión cambia el actor del recibo vigente", () => {
  it("el vigente dice human, no model", () => {
    // Antes de decidir, el recibo escalado cuenta como decisión del modelo.
    const id = `GR-20261004-${TICKET}-plan-1`;
    appendReceipt(PATHS(), TICKET, reciboEscalado(id));
    expect(currentReceipts(readReceipts(PATHS(), TICKET))[0]?.actor).toBe("model");

    decidir(id);

    expect(currentReceipts(readReceipts(PATHS(), TICKET))[0]?.actor).toBe("human");
  });
});
