/**
 * La política por defecto: el agente aprueba el análisis y el plan sin una autorización creada.
 *
 * Pedido del PO del 2026-10-13, tras BUGFIX-RESTAURANTE-PAGO-BONIFICADO-RETROACTIVO-20261013
 * (SaiOpenCloud): 46 % del ticket fue esperar decisiones que el PO aprobó tal como se
 * recomendaron. Lo que se afirma acá:
 *
 * 1. Sin ninguna autorización, un ticket de riesgo normal con la compuerta en approve es elegible
 *    por `POLITICA-POR-DEFECTO`, la aprobación queda atribuida a ella y el ticket entra a `approved`.
 * 2. Con la compuerta en review, lo decide el revisor (`derivableAlRevisor`).
 * 3. Las barreras siguen siendo de una persona: SECURITY, riesgo alto, migración, despliegue y block.
 * 4. Una autorización creada por una persona manda sobre la política.
 * 5. Revocar la política devuelve la aprobación a una persona.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_POLICY,
  type GateReceipt,
  type Proposition,
  type PropositionAnswer,
  buildReceipt,
  decide,
} from "../packages/gate/src/index.js";
import {
  POLITICA_POR_DEFECTO_ID,
  appendReceipt,
  aprobarPorAutorizacion,
  buildGateState,
  crearAutorizacionDeAprobacion,
  elegibilidadDeAprobacion,
  findTicket,
  revocarAutorizacionDeAprobacion,
  transition,
  type RegistryPaths,
} from "../packages/engine/src/index.js";
import { parseTicket } from "../packages/core/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const AHORA = new Date("2026-10-13T08:00:00.000Z");
const SUFIJO = "POS-POLITICA-DEFECTO-20261013";

let root: string;
const paths = (): RegistryPaths => ({ root, ticketsDir: "tickets" });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-politica-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const PLAN = [
  "- Pasos ordenados:",
  "  1. Cambiar en `BackEnd/pos/filters.py` el `lookup_expr` de `number` de `exact` a `icontains`.",
  "  2. Añadir en `BackEnd/pos/tests/test_filters.py` una prueba de búsqueda parcial.",
  "- Rollback: revertir el cambio de una línea.",
].join("\n");

function planificado(
  opciones: { tipo?: string; riesgo?: string; diagnostico?: string; impactos?: string[] } = {},
): string {
  const tipo = opciones.tipo ?? "BUGFIX";
  const id = `${tipo}-${SUFIJO}`;
  writeFixtureTicket(root, {
    id,
    workflowStatus: "planned",
    type: tipo,
    module: "POS",
    plan: PLAN,
    aprobacionRegistrada: false,
    ...(opciones.riesgo === undefined ? {} : { riskLevel: opciones.riesgo }),
    ...(opciones.diagnostico === undefined ? {} : { diagnostico: opciones.diagnostico }),
    ...(opciones.impactos === undefined ? {} : { impacts: opciones.impactos }),
  });
  return id;
}

const PROPOSICIONES: Proposition[] = [
  { id: "cubre_todos_los_criterios", kind: "noul", instructions: "cubre", weight: 3 },
];

/** Un recibo de la compuerta sobre el ticket de ahora: approve (0.99), review (0.5) o block (0.01). */
function recibo(id: string, gate: string, valor: number): GateReceipt {
  const texto = readFileSync(join(root, "tickets", "2026", id, "ticket.md"), "utf8");
  const respuestas: PropositionAnswer[] = [
    { id: "cubre_todos_los_criterios", kind: "noul", value: valor },
  ];
  const r = buildReceipt({
    id: `GR-20261013-${id}-${gate}-1`,
    gate,
    propositions: PROPOSICIONES,
    policy: DEFAULT_POLICY,
    subject: { type: "ticket", id, revision: "1" },
    decision: decide(PROPOSICIONES, respuestas, DEFAULT_POLICY),
    state: buildGateState(texto),
    answers: respuestas,
    mechanicalChecks: [],
    model: null,
    usage: null,
    latencyMs: 1,
    decidedAt: "2026-10-13T07:00:00.000Z",
  });
  appendReceipt(paths(), id, r);
  return r;
}

const elegibilidad = (id: string, etapa = "plan") =>
  elegibilidadDeAprobacion({ paths: paths(), ticketId: id, etapa, ahora: AHORA });

describe("la política por defecto", () => {
  it("sin autorizaciones, aprueba el plan atribuido a la política y el ticket entra a approved", () => {
    const id = planificado();
    recibo(id, "plan", 0.99);

    const e = elegibilidad(id);
    expect(e.elegible).toBe(true);
    expect(e.autorizacion?.id).toBe(POLITICA_POR_DEFECTO_ID);

    const res = aprobarPorAutorizacion({ paths: paths(), ticketId: id, etapa: "plan", ahora: AHORA, env: {} });
    expect(res.registrada).toBe(true);
    transition({ paths: paths(), ticketId: id, entity: "ticket", to: "approved", now: () => AHORA });
    const u = findTicket(paths(), id);
    expect(parseTicket(u!.text).fields.workflow_status).toBe("approved");
  });

  it("con la compuerta en review, lo deriva al revisor", () => {
    const id = planificado();
    recibo(id, "plan", 0.5);
    const e = elegibilidad(id);
    expect(e.elegible).toBe(false);
    expect(e.derivableAlRevisor).toBe(true);
  });

  it.each([
    ["SECURITY", { tipo: "SECURITY" }],
    ["riesgo alto", { riesgo: "high" }],
    [
      "despliegue",
      {
        diagnostico: [
          "- Archivos y flujo investigados: `BackEnd/pos/filters.py` define `OrderFilter.number`.",
          "- Causa raíz o hipótesis: el `lookup_expr` es exacto.",
          "- Riesgos y compatibilidad: amplía el conjunto de resultados.",
          "- Impactos de sync, migración, Docker o despliegue: requiere despliegue del backend",
        ].join("\n"),
      },
    ],
    ["migración", { impactos: ["migration_impact"] }],
  ])("%s sigue siendo de una persona", (_nombre, opciones) => {
    const id = planificado(opciones);
    recibo(id, "plan", 0.99);
    expect(elegibilidad(id).elegible).toBe(false);
  });

  it("un block no se aprueba ni se deriva", () => {
    const id = planificado();
    recibo(id, "plan", 0.01);
    const e = elegibilidad(id);
    expect(e.elegible).toBe(false);
    expect(e.derivableAlRevisor).toBe(false);
  });

  it("una autorización creada por una persona manda sobre la política", () => {
    const id = planificado();
    recibo(id, "plan", 0.99);
    const a = crearAutorizacionDeAprobacion({
      root,
      actor: "Juan Andrade",
      quote: "autorizo los BUGFIX de POS",
      types: ["BUGFIX"],
      modules: ["pos"],
      maxRisk: "normal",
      impacts: [],
      stages: ["plan"],
      dailyQuota: 5,
      validDays: 30,
      source: "cli",
      ahora: AHORA,
      env: {},
    });
    expect(elegibilidad(id).autorizacion?.id).toBe(a.id);
  });

  it("revocar la política devuelve la aprobación a una persona", () => {
    const id = planificado();
    recibo(id, "plan", 0.99);
    revocarAutorizacionDeAprobacion({
      root,
      id: POLITICA_POR_DEFECTO_ID,
      actor: "Juan Andrade",
      reason: "vuelvo a aprobar yo",
      source: "cli",
      ahora: new Date("2026-10-13T07:30:00.000Z"),
      env: {},
    });
    const e = elegibilidad(id);
    expect(e.elegible).toBe(false);
    expect(e.reglas.find((r) => r.regla === "autorizacion")?.cumple).toBe(false);
  });
});

describe("el siguiente paso con la política por defecto", () => {
  const siguiente = async (id: string) => {
    const { computeNextStep } = await import("../packages/engine/src/next-step.js");
    const { readReceipts } = await import("../packages/engine/src/receipts.js");
    const u = findTicket(paths(), id);
    return computeNextStep(paths(), parseTicket(u!.text), readReceipts(paths(), id));
  };

  it("con el plan en approve, dice que lo apruebe la política y no se detiene", async () => {
    const id = planificado();
    recibo(id, "plan", 0.99);
    const p = await siguiente(id);
    expect(p.alto).toBeNull();
    expect(p.pasos.join(" ")).toContain(`valmen approve-by-authorization --id ${id} --stage plan`);
  });

  it("con el plan en review, lo manda al revisor", async () => {
    const id = planificado();
    recibo(id, "plan", 0.5);
    const p = await siguiente(id);
    expect(p.alto).toBeNull();
    expect(p.pasos.join(" ")).toContain(`valmen review-agent --id ${id} --stage plan`);
  });

  it("un SECURITY sigue deteniéndose en una persona", async () => {
    const id = planificado({ tipo: "SECURITY" });
    recibo(id, "plan", 0.5);
    const p = await siguiente(id);
    expect(p.alto).not.toBeNull();
  });
});
