/**
 * Aprobar los planes de una jornada en lote con códigos firmados (R-JORN-004).
 *
 * Lo que sostiene la confianza: el código está atado al hash del plan de ese momento, es de un
 * solo uso, no lo emite el agente ni se emite para lo que el techo de riesgo excluye, la
 * aprobación se registra por el camino de siempre con fuente `token`, y esa fuente es opt-in.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { journeyApproveEligibleCommand, planApproveCommand } from "../packages/cli/src/commands.js";
import { USAGE } from "../packages/cli/src/main.js";
import { decideByCode } from "../packages/cli/src/hermes.js";
import { parseTicket } from "../packages/core/src/index.js";
import {
  DEFAULT_POLICY,
  buildReceipt,
  decide,
  type Proposition,
  type PropositionAnswer,
} from "../packages/gate/src/index.js";
import {
  aprobacionDePlanVigente,
  aprobarPlanesElegiblesDeJornada,
  approvalQuotaUsesPath,
  appendReceipt,
  crearAutorizacionDeAprobacion,
  aprobarPorCodigo,
  createJourney,
  emitirAprobacionesDeJornada,
  readApprovalLog,
  readReceipts,
  resolveAuthorizedProject,
  type RegistryPaths,
} from "../packages/engine/src/index.js";
import { buildGateState } from "../packages/engine/src/state.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const projectId = "lote-lab";
const SECRETO = "secreto-de-prueba-del-lote-largo";
const AHORA = new Date("2026-10-06T08:00:00.000Z");
const IDS = ["FEATURE-LOTE-UNO-20261005", "FEATURE-LOTE-DOS-20261005", "FEATURE-LOTE-TRES-20261005"];
const JORNADA = "JOR-20261006";

let home: string;
let root: string;
let paths: RegistryPaths;
const proyecto = () => resolveAuthorizedProject({ projectId, home });

function configuracion(fuentes: string[] | null): void {
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    [
      `project-id: ${projectId}`,
      ...(fuentes === null ? [] : ["plan-approval-sources:", ...fuentes.map((f) => `  - ${f}`)]),
      "",
    ].join("\n"),
    "utf8",
  );
}

function reciboPlan(id: string) {
  const proposiciones: Proposition[] = [{ id: "cubre_todos_los_criterios", kind: "noul", instructions: "cubre", weight: 3 }];
  const respuestas: PropositionAnswer[] = [{ id: "cubre_todos_los_criterios", kind: "noul", value: 0.99 }];
  return buildReceipt({
    id: `GR-20261006-${id}-plan-1`,
    gate: "plan",
    propositions: proposiciones,
    policy: DEFAULT_POLICY,
    subject: { type: "ticket", id, revision: "1" },
    decision: decide(proposiciones, respuestas, DEFAULT_POLICY),
    state: buildGateState(readFileSync(join(root, "tickets", "2026", id, "ticket.md"), "utf8")),
    answers: respuestas,
    mechanicalChecks: [],
    model: null,
    usage: null,
    latencyMs: 1,
    decidedAt: AHORA.toISOString(),
  });
}

function planeado(id: string, opciones: { riesgo?: string; tipo?: string } = {}): void {
  writeFixtureTicket(root, {
    id,
    workflowStatus: "planned",
    type: opciones.tipo ?? "FEATURE",
    module: "LOTE",
    ...(opciones.riesgo === undefined ? {} : { riskLevel: opciones.riesgo }),
  });
  appendReceipt(paths, id, reciboPlan(id));
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "valmen-lote-"));
  root = join(home, "proyecto");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(home, ".valmen", "bindings.local.yaml"), `schema-version: 1\nmachine-id: lote\nprojects:\n  ${projectId}:\n    root: ${root}\n`);
  paths = { root, ticketsDir: "tickets" };
  configuracion(["cli", "token"]);
  for (const id of IDS) planeado(id);
  createJourney(proyecto(), {
    revisionId: "lote-01",
    journeyId: JORNADA,
    occurredAt: AHORA.toISOString(),
    tickets: IDS.map((id, i) => ({
      ticketId: id, order: i + 1, priority: i + 1, dependsOn: [], start: { condition: "dependencies" as const }, authorizationIds: ["codex"],
    })),
  });
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const emitir = () => emitirAprobacionesDeJornada({ project: proyecto(), journeyId: JORNADA, secret: SECRETO, ahora: AHORA });
const aprobar = (codigo: string, extra: Partial<Parameters<typeof aprobarPorCodigo>[0]> = {}) =>
  aprobarPorCodigo({ paths, secret: SECRETO, codigo, actor: "Juan Andrade", quote: "Apruebo estos planes", ahora: AHORA, env: {}, ...extra });
const documento = (id: string) => parseTicket(readFileSync(join(root, "tickets", "2026", id, "ticket.md"), "utf8"));

describe("emitir", () => {
  it("tres planes listos emiten un código por plan y uno de lote en un solo mensaje", () => {
    const emision = emitir();
    expect(emision.planes).toHaveLength(3);
    expect(emision.lote).not.toBeNull();
    for (const id of IDS) expect(emision.mensaje).toContain(id);
    expect(emision.mensaje).toContain(`código ${emision.lote?.code}`);
    expect(emision.mensaje).toContain("plan-approve");
    expect(new Set([...emision.planes.map((p) => p.code), emision.lote?.code]).size).toBe(4);
  });

  it("un ticket de riesgo alto, de tipo SECURITY o con la compuerta sin aprobar no recibe código y se dice por qué", () => {
    planeado("FEATURE-LOTE-ALTO-20261005", { riesgo: "high" });
    planeado("SECURITY-LOTE-SEG-20261005", { tipo: "SECURITY" });
    writeFixtureTicket(root, { id: "FEATURE-LOTE-SINREC-20261005", workflowStatus: "planned", type: "FEATURE", module: "LOTE" });
    createJourney(proyecto(), {
      revisionId: "lote-02",
      journeyId: "JOR-20261007",
      occurredAt: AHORA.toISOString(),
      tickets: ["FEATURE-LOTE-ALTO-20261005", "SECURITY-LOTE-SEG-20261005", "FEATURE-LOTE-SINREC-20261005"].map((id, i) => ({
        ticketId: id, order: i + 1, priority: i + 1, dependsOn: [], start: { condition: "dependencies" as const }, authorizationIds: ["codex"],
      })),
    });
    const emision = emitirAprobacionesDeJornada({ project: proyecto(), journeyId: "JOR-20261007", secret: SECRETO, ahora: AHORA });
    expect(emision.planes).toEqual([]);
    expect(emision.lote).toBeNull();
    expect(emision.sinCodigo.map((s) => s.ticket)).toEqual([
      "FEATURE-LOTE-ALTO-20261005",
      "SECURITY-LOTE-SEG-20261005",
      "FEATURE-LOTE-SINREC-20261005",
    ]);
    expect(emision.sinCodigo[1]?.motivo).toContain("seguridad");
  });
});

describe("aprobar", () => {
  it("el lote registra una aprobación por ticket con fuente token y la frase de quien aprueba", () => {
    const { lote } = emitir();
    const resultados = aprobar(lote?.code ?? "");
    expect(resultados.every((r) => r.ok)).toBe(true);
    for (const id of IDS) {
      const estado = aprobacionDePlanVigente(documento(id));
      expect(estado.estado).toBe("vigente");
      if (estado.estado === "vigente") {
        expect(estado.aprobacion.source).toBe("token");
        expect(estado.aprobacion.quote).toBe("Apruebo estos planes");
        expect(estado.aprobacion.actor).toBe("Juan Andrade");
      }
    }
  });

  it("el código de un plan aprueba solo ese plan", () => {
    const { planes } = emitir();
    expect(aprobar(planes[0]?.code ?? "").every((r) => r.ok)).toBe(true);
    expect(aprobacionDePlanVigente(documento(IDS[0] as string)).estado).toBe("vigente");
    expect(aprobacionDePlanVigente(documento(IDS[1] as string)).estado).toBe("sin-aprobacion");
  });

  it("un plan editado después de emitir el código no se aprueba con él, y el código queda sin usar", () => {
    const { planes } = emitir();
    const ruta = join(root, "tickets", "2026", IDS[0] as string, "ticket.md");
    writeFileSync(ruta, readFileSync(ruta, "utf8").replace("- Rollback:", "- Paso nuevo que nadie aprobó.\n- Rollback:"), "utf8");
    const r = aprobar(planes[0]?.code ?? "");
    expect(r[0]?.ok).toBe(false);
    expect(r[0]?.detalle).toContain("el plan cambió");
    expect(readApprovalLog(paths).some((e) => e.kind === "approval-consumed")).toBe(false);
  });

  it("un código se usa una sola vez", () => {
    const { planes } = emitir();
    expect(aprobar(planes[0]?.code ?? "").every((r) => r.ok)).toBe(true);
    const otra = aprobar(planes[0]?.code ?? "");
    expect(otra[0]?.ok).toBe(false);
    expect(otra[0]?.detalle).toContain("ya se usó");
  });

  it("un código vencido no sirve", () => {
    const { planes } = emitir();
    const r = aprobar(planes[0]?.code ?? "", { ahora: new Date("2026-10-08T08:00:00.000Z") });
    expect(r[0]?.ok).toBe(false);
    expect(r[0]?.detalle).toContain("venció");
  });

  it("un código con otro secreto o inexistente se rechaza", () => {
    const { planes } = emitir();
    // valmen:allow-secret — valor de prueba inventado.
    expect(aprobar(planes[0]?.code ?? "", { secret: "otro-secreto-largo-de-prueba-x" })[0]?.ok).toBe(false);
    expect(aprobar("ZZZZ-ZZZZ")[0]?.detalle).toContain("ninguna aprobación emitida");
  });

  it("sin `token` en plan-approval-sources la aprobación se rechaza y no consume nada", () => {
    const { planes } = emitir();
    configuracion(["cli"]);
    const r = aprobar(planes[0]?.code ?? "");
    expect(r[0]?.ok).toBe(false);
    expect(r[0]?.detalle).toContain("plan-approval-sources");
    expect(readApprovalLog(paths).some((e) => e.kind === "approval-consumed")).toBe(false);
  });

  it("una sesión desatendida no puede aprobar por código", () => {
    const { planes } = emitir();
    const r = aprobar(planes[0]?.code ?? "", { env: { VALMEN_UNATTENDED: "1" } });
    expect(r[0]?.ok).toBe(false);
    expect(r[0]?.detalle).toContain("desatendida");
  });
});

describe("un código de compuerta y uno de plan no se confunden", () => {
  it("el código de un plan no decide una compuerta con gate-decide --code", () => {
    const { planes } = emitir();
    const r = decideByCode({
      paths, code: planes[0]?.code ?? "", decision: "approve", actor: "Juan", reason: "x", secret: SECRETO, now: AHORA,
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("aprueba un plan");
  });

  it("el comando plan-approve aprueba y sale con error si algo falla", () => {
    const { planes } = emitir();
    const bien = planApproveCommand(paths, { code: planes[0]?.code ?? "", actor: "Juan Andrade", quote: "ok" }, { secret: SECRETO, ahora: () => AHORA, env: {} });
    expect(bien.exitCode).toBe(0);
    const mal = planApproveCommand(paths, { code: planes[0]?.code ?? "", actor: "Juan Andrade", quote: "ok" }, { secret: SECRETO, ahora: () => AHORA, env: {} });
    expect(mal.exitCode).not.toBe(0);
    expect(readReceipts(paths, IDS[0] as string).length).toBeGreaterThan(0);
  });
});

describe("aprobar los elegibles de la jornada (R-APRO-006)", () => {
  const JOR = "JOR-20261008";
  const idDe = (n: string) => `FEATURE-${n === "CINCO" ? "OTRO" : "LOTE"}-ELEG${n}-20261008`;
  const sufijos = ["UNO", "DOS", "TRES", "CUATRO", "CINCO"];

  /** Un plan en `planned` con su recibo de plan en el valor que se pide (approve 0.99, review 0.5, block 0.01). */
  function plan(id: string, o: { tipo?: string; diagnostico?: string; valor?: number } = {}): void {
    writeFixtureTicket(root, {
      id,
      workflowStatus: "planned",
      type: o.tipo ?? "FEATURE",
      module: id.split("-")[1] as string,
      ...(o.diagnostico === undefined ? {} : { diagnostico: o.diagnostico }),
    });
    const proposiciones: Proposition[] = [{ id: "cubre_todos_los_criterios", kind: "noul", instructions: "cubre", weight: 3 }];
    const respuestas: PropositionAnswer[] = [{ id: "cubre_todos_los_criterios", kind: "noul", value: o.valor ?? 0.99 }];
    appendReceipt(
      paths,
      id,
      buildReceipt({
        id: `GR-20261008-${id}-plan-1`,
        gate: "plan",
        propositions: proposiciones,
        policy: DEFAULT_POLICY,
        subject: { type: "ticket", id, revision: "1" },
        decision: decide(proposiciones, respuestas, DEFAULT_POLICY),
        state: buildGateState(readFileSync(join(root, "tickets", "2026", id, "ticket.md"), "utf8")),
        answers: respuestas,
        mechanicalChecks: [],
        model: null,
        usage: null,
        latencyMs: 1,
        decidedAt: AHORA.toISOString(),
      }),
    );
  }

  function jornada(ids: string[]): void {
    createJourney(proyecto(), {
      revisionId: "eleg-01",
      journeyId: JOR,
      occurredAt: AHORA.toISOString(),
      tickets: ids.map((id, i) => ({
        ticketId: id, order: i + 1, priority: i + 1, dependsOn: [], start: { condition: "dependencies" as const }, authorizationIds: ["codex"],
      })),
    });
  }

  const autorizar = (cupo = 10) =>
    crearAutorizacionDeAprobacion({
      root,
      actor: "Juan Andrade",
      quote: "Autorizo aprobar solos los planes de bajo riesgo de lote",
      types: ["FEATURE", "BUGFIX"],
      modules: ["lote"],
      maxRisk: "normal",
      dailyQuota: cupo,
      validDays: 30,
      source: "cli",
      ahora: AHORA,
      env: {},
    });
  const correr = (env: Record<string, string | undefined> = {}) =>
    aprobarPlanesElegiblesDeJornada({ project: proyecto(), journeyId: JOR, ahora: AHORA, env });
  const estado = (id: string): string => documento(id).fields.workflow_status;
  const usos = (): number => {
    try {
      return readFileSync(approvalQuotaUsesPath(root), "utf8").split("\n").filter((l) => l.trim() !== "").length;
    } catch {
      return 0;
    }
  };

  /** Cinco tickets: cuatro del módulo que la autorización cubre y el quinto de otro módulo. */
  function cinco(): string[] {
    const ids = sufijos.map(idDe);
    ids.forEach((id) => plan(id));
    jornada(ids);
    return ids;
  }

  it("C1 C2 C3 C4 C11 C12 C13: cuatro de cinco quedan approved por la autorización y el quinto pendiente con sus opciones", () => {
    const ids = cinco();
    const a = autorizar();
    const r = correr();
    expect(r.aprobados.map((x) => x.ticket)).toEqual(ids.slice(0, 4));
    for (const id of ids.slice(0, 4)) {
      expect(estado(id)).toBe("approved");
      const v = aprobacionDePlanVigente(documento(id));
      expect(v.estado).toBe("vigente");
      if (v.estado === "vigente") {
        expect(v.aprobacion.source).toBe("autorizacion");
        expect(v.aprobacion.actor).toBe(`autorización ${a.id}`);
        expect(v.aprobacion.authorizationId).toBe(a.id);
      }
    }
    expect(usos()).toBe(4);
    expect(estado(ids[4] as string)).toBe("planned");
    expect(r.pendientes.map((x) => x.ticket)).toEqual([ids[4]]);
    expect(r.pendientes[0]?.motivos.join("\n")).toContain("autorizacion:");
    expect(r.mensaje).toContain(`Decisión: aprobar el plan de ${ids[4]}`);
    expect(r.mensaje).toContain(`A) lo apruebas con valmen approve-plan --id ${ids[4]}`);
    expect(r.mensaje).toContain("→ pasa a approved");
    expect(r.mensaje).toContain("B) no lo apruebas → queda en planned");
  });

  it("C11: un pendiente lista todas las reglas que no cumple", () => {
    plan(idDe("CINCO"), { valor: 0.01 });
    jornada([idDe("CINCO")]);
    autorizar();
    const motivos = correr().pendientes[0]?.motivos.join("\n") ?? "";
    expect(motivos).toContain("compuerta:");
    expect(motivos).toContain("autorizacion:");
    expect(motivos).toContain("cupo:");
  });

  it("C17: tras la orden, notify-plans solo emite código para el pendiente", () => {
    const ids = cinco();
    autorizar();
    correr();
    const emision = emitirAprobacionesDeJornada({ project: proyecto(), journeyId: JOR, secret: SECRETO, ahora: AHORA });
    expect(emision.planes.map((p) => p.ticket)).toEqual([ids[4]]);
  });

  it("C5: un SECURITY no se aprueba aunque haya autorización y su control FEATURE del mismo módulo sí", () => {
    const SEC = "SECURITY-LOTE-ELEGUNO-20261008";
    plan(SEC, { tipo: "SECURITY" });
    plan(idDe("DOS"));
    jornada([SEC, idDe("DOS")]);
    autorizar();
    const r = correr();
    expect(estado(SEC)).toBe("planned");
    expect(r.pendientes.map((p) => p.ticket)).toEqual([SEC]);
    expect(r.pendientes[0]?.motivos.join("\n")).toContain("SECURITY");
    expect(estado(idDe("DOS"))).toBe("approved");
  });

  it("C6: con la sesión desatendida la orden falla y no aprueba nada", () => {
    cinco();
    autorizar();
    expect(() => correr({ VALMEN_UNATTENDED: "1" })).toThrow(/desatendida/);
    expect(usos()).toBe(0);
    for (const s of sufijos) expect(estado(idDe(s))).toBe("planned");
  });

  it("C7: un block en la compuerta de plan queda pendiente y el control sin block se aprueba", () => {
    plan(idDe("UNO"), { valor: 0.01 });
    plan(idDe("DOS"));
    jornada([idDe("UNO"), idDe("DOS")]);
    autorizar();
    const r = correr();
    expect(estado(idDe("UNO"))).toBe("planned");
    expect(r.pendientes[0]?.motivos.join("\n")).toContain("block");
    expect(estado(idDe("DOS"))).toBe("approved");
  });

  it("C8: un diagnóstico que declara despliegue queda pendiente y el control sin despliegue se aprueba", () => {
    plan(idDe("UNO"), {
      diagnostico: [
        "- Archivos y flujo investigados: `packages/engine/src/x.ts:1` hace lo suyo.",
        "- Causa raíz o hipótesis: falta la pieza.",
        "- Riesgos y compatibilidad: ninguno.",
        "- Impactos de sync, migración, Docker o despliegue: requiere despliegue a producción.",
      ].join("\n"),
    });
    plan(idDe("DOS"));
    jornada([idDe("UNO"), idDe("DOS")]);
    autorizar();
    const r = correr();
    expect(estado(idDe("UNO"))).toBe("planned");
    expect(r.pendientes[0]?.motivos.join("\n")).toContain("despliegue:");
    expect(estado(idDe("DOS"))).toBe("approved");
  });

  it("C9: un recibo que evaluó otro texto queda pendiente con el motivo y los demás se aprueban", () => {
    const ids = [idDe("UNO"), idDe("DOS"), idDe("TRES")];
    ids.forEach((id) => plan(id));
    const ruta = join(root, "tickets", "2026", ids[0] as string, "ticket.md");
    writeFileSync(ruta, readFileSync(ruta, "utf8").replace("- Rollback:", "- Paso nuevo después de la compuerta.\n- Rollback:"), "utf8");
    jornada(ids);
    autorizar();
    const r = correr();
    expect(estado(ids[0] as string)).toBe("planned");
    expect(r.pendientes[0]?.motivos.join("\n")).toContain("evaluó otro texto");
    expect(estado(ids[1] as string)).toBe("approved");
    expect(estado(ids[2] as string)).toBe("approved");
    expect(usos()).toBe(2);
  });

  it("C3: sin cupo suficiente se aprueban los que caben y el resto queda pendiente por cupo", () => {
    const ids = [idDe("UNO"), idDe("DOS"), idDe("TRES")];
    ids.forEach((id) => plan(id));
    jornada(ids);
    autorizar(2);
    const r = correr();
    expect(r.aprobados).toHaveLength(2);
    expect(r.pendientes.map((p) => p.ticket)).toEqual([ids[2]]);
    expect(r.pendientes[0]?.motivos.join("\n")).toContain("cupo:");
    expect(usos()).toBe(2);
  });

  it("C10: correrla dos veces no consume más cupo", () => {
    cinco();
    autorizar();
    correr();
    const antes = usos();
    const otra = correr();
    expect(usos()).toBe(antes);
    expect(otra.aprobados).toEqual([]);
  });

  it("C14: la orden con --journey imprime aprobados y pendientes y sale con 0", () => {
    const ids = cinco();
    autorizar();
    const r = journeyApproveEligibleCommand({ project: projectId, journey: JOR }, { home, ahora: () => AHORA, env: {} });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("aprobados por autorización");
    expect(r.stdout).toContain(`✓ ${ids[0]}`);
    expect(r.stdout).toContain(`Decisión: aprobar el plan de ${ids[4]}`);
  });

  it("C15: sin --journey sale con el código de esquema", () => {
    const r = journeyApproveEligibleCommand({ project: projectId }, { home, env: {} });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("--journey");
  });

  it("C16: USAGE documenta journey approve-eligible", () => {
    expect(USAGE).toContain("journey approve-eligible --journey <id>");
  });
});
