/**
 * El estado público del ticket (R-EPU-001): una función pura en core y un lector en engine.
 *
 * C01–C12 llaman a la función pura; C13–C17 arman un registro temporal y leen el estado con el
 * lector; C18 es la compilación (`npx tsc --build tsconfig.build.json`).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { estadoPublico as estadoPublicoDelIndice } from "../packages/core/src/index.js";
import { estadoPublico } from "../packages/core/src/public-state.js";
import {
  DEFAULT_POLICY,
  type GateReceipt,
  type Proposition,
  type PropositionAnswer,
  buildReceipt,
  decide,
  withHumanDecision,
} from "../packages/gate/src/index.js";
import {
  appendReceipt,
  crearAutorizacionDeAprobacion,
  estadoPublicoDelTicket,
  type RegistryPaths,
} from "../packages/engine/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const AHORA = new Date("2026-10-07T08:00:00.000Z");
const ID = "BUGFIX-POS-ESTADO-PUB-20261007";

let root: string;
const paths = (): RegistryPaths => ({ root, ticketsDir: "tickets" });

const sinHechos = { planWaitsForPerson: false, escalatedGatePending: false };
const derivar = (
  state: string,
  extra: Partial<{ planWaitsForPerson: boolean; escalatedGatePending: boolean }> = {},
) => estadoPublico({ state, ...sinHechos, ...extra });

const PROPOSICIONES: Proposition[] = [
  { id: "cubre_todos_los_criterios", kind: "noul", instructions: "cubre", weight: 3 },
];

function recibo(gate: string, valor: number, intento = 1): GateReceipt {
  const respuestas: PropositionAnswer[] = [
    { id: "cubre_todos_los_criterios", kind: "noul", value: valor },
  ];
  return buildReceipt({
    id: `GR-20261007-${ID}-${gate}-${intento}`,
    gate,
    propositions: PROPOSICIONES,
    policy: DEFAULT_POLICY,
    subject: { type: "ticket", id: ID, revision: String(intento) },
    decision: decide(PROPOSICIONES, respuestas, DEFAULT_POLICY),
    state: { ticket: ID },
    answers: respuestas,
    mechanicalChecks: [],
    model: null,
    usage: null,
    latencyMs: 1,
    decidedAt: `2026-10-07T0${intento}:00:00.000Z`,
  });
}

const guardar = (gate: string, valor: number, intento = 1): GateReceipt => {
  const r = recibo(gate, valor, intento);
  appendReceipt(paths(), ID, r);
  return r;
};

const ticket = (workflowStatus: string): void => {
  writeFixtureTicket(root, { id: ID, workflowStatus, module: "POS" });
};

const autorizar = () =>
  crearAutorizacionDeAprobacion({
    root,
    actor: "Juan Andrade",
    quote: "Autorizo aprobar solos los planes de bajo riesgo de pos",
    types: ["BUGFIX"],
    modules: ["pos"],
    maxRisk: "normal",
    dailyQuota: 2,
    validDays: 30,
    source: "cli",
    ahora: AHORA,
    env: {},
  });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-estado-pub-"));
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(root, ".valmen", "config.yaml"), "name: Demo\n", "utf8");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("la función pura estadoPublico", () => {
  it("C01 awaiting_user_tests necesita tu decisión por user-tests", () => {
    expect(derivar("awaiting_user_tests")).toEqual({
      state: "needs-decision",
      label: "Necesita tu decisión",
      reason: "user-tests",
    });
  });

  it("C02 blocked necesita tu decisión por blocked", () => {
    const r = derivar("blocked");
    expect([r.state, r.reason]).toEqual(["needs-decision", "blocked"]);
  });

  it("C03 changes_requested necesita tu decisión por changes-requested", () => {
    const r = derivar("changes_requested");
    expect([r.state, r.reason]).toEqual(["needs-decision", "changes-requested"]);
  });

  it("C04 planned con la aprobación esperando a una persona necesita tu decisión por plan-approval", () => {
    const r = derivar("planned", { planWaitsForPerson: true });
    expect([r.state, r.reason]).toEqual(["needs-decision", "plan-approval"]);
  });

  it("C05 in_progress con una compuerta escalada necesita tu decisión por escalated-gate", () => {
    const r = derivar("in_progress", { escalatedGatePending: true });
    expect([r.state, r.label, r.reason]).toEqual([
      "needs-decision",
      "Necesita tu decisión",
      "escalated-gate",
    ]);
  });

  it("C06 in_qa sin compuerta escalada es Verificando", () => {
    expect(derivar("in_qa")).toEqual({
      state: "verifying",
      label: "Verificando",
      reason: null,
    });
  });

  it("C07 qa_approved es Listo, aunque haya un escalado viejo", () => {
    expect(derivar("qa_approved")).toEqual({ state: "done", label: "Listo", reason: null });
    expect(derivar("qa_approved", { escalatedGatePending: true }).state).toBe("done");
  });

  it("C08 closed es Listo, aunque haya un escalado viejo", () => {
    expect(derivar("closed").label).toBe("Listo");
    expect(derivar("closed", { escalatedGatePending: true }).state).toBe("done");
  });

  it("C09 intake, analyzed, approved e in_progress sin escalado son Trabajando", () => {
    for (const estado of ["intake", "analyzed", "approved", "in_progress"]) {
      expect(derivar(estado)).toEqual({
        state: "working",
        label: "Trabajando",
        reason: null,
      });
    }
  });

  it("C10 planned cuyo plan aprueba una autorización es Trabajando", () => {
    expect(derivar("planned", { planWaitsForPerson: false }).state).toBe("working");
  });

  it("C11 el módulo no importa node:fs ni otro módulo de disco", () => {
    const fuente = readFileSync("packages/core/src/public-state.ts", "utf8");
    const imports =
      fuente.match(/^\s*(?:import|export)\b[^;]*\bfrom\s+["'][^"']+["']/gm) ?? [];
    expect(imports.filter((i) => /node:|\.\/fs\.js|fs"/.test(i))).toEqual([]);
  });

  it("C12 estadoPublico se importa desde el índice de core", () => {
    expect(estadoPublicoDelIndice).toBe(estadoPublico);
  });
});

describe("el lector estadoPublicoDelTicket", () => {
  const leer = () => estadoPublicoDelTicket(paths(), ID, AHORA);

  it("C13 planned sin autorización vigente necesita tu decisión por plan-approval", () => {
    ticket("planned");
    guardar("plan", 0.99);
    const r = leer();
    expect([r.state, r.reason]).toEqual(["needs-decision", "plan-approval"]);
  });

  it("C14 planned cubierto por una autorización vigente es Trabajando", () => {
    ticket("planned");
    guardar("plan", 0.99);
    autorizar();
    expect(leer().state).toBe("working");
  });

  it("C15 in_progress con un recibo escalado sin decisión necesita tu decisión por escalated-gate", () => {
    ticket("in_progress");
    guardar("plan", 0.5);
    const r = leer();
    expect([r.state, r.reason]).toEqual(["needs-decision", "escalated-gate"]);
  });

  it("C16 un recibo escalado con decisión humana no cuenta", () => {
    ticket("in_progress");
    appendReceipt(
      paths(),
      ID,
      withHumanDecision(recibo("plan", 0.5), {
        actor: "Juan Andrade",
        decision: "approve",
        reason: "sigo",
        channel: "cli",
        decidedAt: AHORA.toISOString(),
      }),
    );
    expect(leer().state).toBe("working");
  });

  it("C17 un escalado superado por un approve posterior de la misma compuerta no cuenta", () => {
    ticket("in_progress");
    guardar("plan", 0.5, 1);
    guardar("plan", 0.99, 2);
    const r = leer();
    expect(r.reason).not.toBe("escalated-gate");
    expect(r.state).toBe("working");
  });
});
