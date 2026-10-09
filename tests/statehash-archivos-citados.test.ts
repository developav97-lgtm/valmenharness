/**
 * El recibo y sus comparadores hablan del mismo estado: las rutas citadas que el motor comprueba
 * en disco van al evaluador, pero no entran en el `stateHash` (BUGFIX-GATE-STATEHASH-ARCHIVOS-CITADOS).
 *
 * Laboratorio temporal con carpeta `.git` y `packages/x/y.ts` de 3 líneas; reloj fijo.
 */
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hashState } from "../packages/gate/src/index.js";
import { buildGateState, findTicket, readReceipts } from "../packages/engine/src/index.js";
import { aprobarPorAutorizacion } from "../packages/engine/src/approval-eligibility.js";
import { crearAutorizacionDeAprobacion } from "../packages/engine/src/index.js";
import { runGate } from "../packages/engine/src/gate.js";
import { barrerasDelRegistro } from "../packages/engine/src/reviewer.js";
import { listGateDecisions } from "../packages/server/src/gates.js";
import type { JevEvaluation } from "../packages/gate-jev/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const AHORA = new Date("2026-10-09T08:00:00.000Z");
const ID = "BUGFIX-POS-STATEHASH-20261009";

let root: string;
const paths = (): { root: string; ticketsDir: string } => ({ root, ticketsDir: "tickets" });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-statehash-"));
  mkdirSync(join(root, "tickets"), { recursive: true });
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(root, ".valmen", "config.yaml"), "name: Demo\n", "utf8");
  mkdirSync(join(root, "packages", "x"), { recursive: true });
  writeFileSync(join(root, "packages", "x", "y.ts"), "l1\nl2\nl3\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const diag = (cita: string): string =>
  [
    `- Archivos y flujo investigados: ${cita} define el filtro.`,
    "- Causa raíz o hipótesis: el lookup es exacto.",
    "- Riesgos y compatibilidad: ninguno.",
    "- Impactos de sync, migración, Docker o despliegue: ninguno.",
  ].join("\n");

function ticket(cita: string): string {
  return writeFixtureTicket(root, {
    id: ID,
    workflowStatus: "planned",
    type: "BUGFIX",
    module: "POS",
    diagnostico: diag(cita),
  });
}

/** Un evaluador que contesta lo mismo a todo: 0.95 aprueba, 0.5 deja la compuerta en revisión. */
function jevDe(valor: number): typeof import("../packages/gate-jev/src/index.js").evaluateWithJev {
  return (async (o: {
    propositions: readonly { id: string; kind: string; criteria?: Record<string, unknown> }[];
  }) =>
    ({
      answers: o.propositions.map((p) =>
        p.kind === "choice"
          ? { id: p.id, kind: "choice" as const, choice: Object.keys(p.criteria ?? {})[0] as string, confidence: valor }
          : { id: p.id, kind: "noul" as const, value: valor },
      ),
      model: { provider: "openrouter", model: "jev", resolvedVersion: "jev-1" },
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      latencyMs: 1,
    }) as unknown as JevEvaluation) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
}

const correrPlan = (valor = 0.95) =>
  runGate(paths(), { gateId: "plan", ticketId: ID, jev: jevDe(valor), now: () => AHORA });

function autorizar(): void {
  crearAutorizacionDeAprobacion({
    root,
    actor: "Juan Andrade",
    quote: "Autorizo aprobar solos los planes de bajo riesgo de pos",
    types: ["BUGFIX"],
    modules: ["pos"],
    maxRisk: "normal",
    dailyQuota: 5,
    validDays: 30,
    source: "cli",
    ahora: AHORA,
    env: {},
  });
}

const aprobar = () => aprobarPorAutorizacion({ paths: paths(), ticketId: ID, etapa: "plan", ahora: AHORA, env: {} });
const rutaDelTicket = (): string => join(root, "tickets", "2026", ID, "ticket.md");
const editarDiagnostico = (): void => {
  const ruta = rutaDelTicket();
  const texto = readFileSync(ruta, "utf8");
  writeFileSync(ruta, texto.replace("- Riesgos y compatibilidad: ninguno.", "- Riesgos y compatibilidad: ninguno.\n- Riesgo añadido después de la compuerta."), "utf8");
};
const recibosPlan = () => readReceipts(paths(), ID).filter((r) => r.gate === "plan");

describe("el estado que hashea el recibo y el que recalculan sus comparadores", () => {
  it("C1. con una cita existente, tras la compuerta plan en approve, la aprobación por autorización se registra", async () => {
    ticket("`packages/x/y.ts:2`");
    const r = await correrPlan();
    expect(r.exitCode, r.stderr).toBe(0);
    expect(recibosPlan()[0]?.outcome).toBe("approve");
    autorizar();
    expect(aprobar().registrada).toBe(true);
  });

  it("C2. control: sin rutas citadas la aprobación por autorización se registra", async () => {
    ticket("el módulo de filtros");
    const r = await correrPlan();
    expect(r.exitCode, r.stderr).toBe(0);
    autorizar();
    expect(aprobar().registrada).toBe(true);
  });

  it("C3. el stateHash del recibo con citas es el hash del estado sin ellas", async () => {
    const t = ticket("`packages/x/y.ts:2`");
    await correrPlan();
    const texto = readFileSync(rutaDelTicket(), "utf8");
    expect(t).toBeTruthy();
    expect(recibosPlan()[0]?.stateHash).toBe(hashState(buildGateState(texto)));
  });

  it("C5. un cambio del Diagnóstico después de la compuerta impide la aprobación", async () => {
    ticket("`packages/x/y.ts:2`");
    await correrPlan();
    autorizar();
    editarDiagnostico();
    expect(() => aprobar()).toThrow(/evaluó otro texto/);
  });

  it("C6. borrar el archivo citado con el texto intacto no invalida la aprobación", async () => {
    ticket("`packages/x/y.ts:2`");
    await correrPlan();
    autorizar();
    rmSync(join(root, "packages", "x", "y.ts"));
    expect(aprobar().registrada).toBe(true);
  });

  it("C7. sin editar el ticket, listGateDecisions no marca el recibo como obsoleto", async () => {
    ticket("`packages/x/y.ts:2`");
    await correrPlan();
    const vista = listGateDecisions(paths(), ID).find((d) => d.gate === "plan");
    expect(vista?.stale).toBe(false);
  });

  it("C8. tras editar el Diagnóstico, listGateDecisions marca el recibo como obsoleto", async () => {
    ticket("`packages/x/y.ts:2`");
    await correrPlan();
    editarDiagnostico();
    const vista = listGateDecisions(paths(), ID).find((d) => d.gate === "plan");
    expect(vista?.stale).toBe(true);
  });

  it("C9. con un recibo en review y el ticket intacto, barrerasDelRegistro no dice «estado:»", async () => {
    ticket("`packages/x/y.ts:2`");
    await correrPlan(0.5);
    const recibo = recibosPlan()[0];
    expect(recibo?.outcome).toBe("review");
    const motivos = barrerasDelRegistro({
      paths: paths(),
      ticketId: ID,
      etapa: "plan",
      reciboId: recibo?.id as string,
      decision: "approve",
      porProposicion: [],
      revisor: { model: "m", resolvedVersion: "m-1" },
      ahora: AHORA,
    } as unknown as Parameters<typeof barrerasDelRegistro>[0]);
    expect(motivos.filter((m) => m.startsWith("estado:"))).toEqual([]);
  });

  it("C10. una segunda corrida sobre el mismo estado dice que ya se evaluó", async () => {
    ticket("`packages/x/y.ts:2`");
    await correrPlan();
    const segunda = await correrPlan();
    expect(segunda.stderr).toContain("ya se evaluó sobre este mismo estado");
  });

  it("C11. la segunda corrida no escribe un segundo recibo", async () => {
    ticket("`packages/x/y.ts:2`");
    await correrPlan();
    await correrPlan();
    expect(recibosPlan()).toHaveLength(1);
  });

  it("C12. el recibo conserva el check archivos_existen en pass con su detalle", async () => {
    ticket("`packages/x/y.ts:2`");
    await correrPlan();
    const check = recibosPlan()[0]?.mechanicalChecks.find((c) => c.id === "archivos_existen");
    expect(check?.result).toBe("pass");
    expect(check?.detail).toContain("1 ruta(s) citada(s) existen");
  });
});

void appendFileSync;
