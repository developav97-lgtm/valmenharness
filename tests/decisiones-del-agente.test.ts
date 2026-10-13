/**
 * Las decisiones del agente y su ratificación antes de cerrar.
 *
 * Pedido del PO del 2026-10-13: el agente decide lo que puede validar con la documentación, el
 * código o su recomendación, deja escrito qué decidió y por qué, y el PO lo ratifica en lote antes
 * de cerrar el ticket, en vez de que el ticket se detenga en cada punto. Lo que se afirma acá:
 *
 * 1. Una decisión se anexa como evento `agent-decision` con su número (D-001, D-002…), la
 *    pregunta, la elección, las alternativas, el criterio, la fuente y cómo se revierte; sin
 *    criterio o sin fuente se rechaza sin escribir.
 * 2. Por ratificar quedan las decisiones del agente y las aprobaciones de la política por
 *    defecto; las de una persona no.
 * 3. `closed` se rechaza mientras quede algo por ratificar, nombrándolo, y pasa tras ratificar con
 *    las palabras de la persona.
 * 4. Ratificar exige responsable y frase, y una sesión atendida.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  POLITICA_POR_DEFECTO,
  appendEvent,
  decisionesPorRatificar,
  findTicket,
  ratificarDecisiones,
  registrarDecisionDelAgente,
  transition,
} from "../packages/engine/src/index.js";
import { parseTicket } from "../packages/core/src/index.js";

const BASE = readFileSync(
  new URL("./fixtures/ticket-cerrado-con-criterios.md", import.meta.url),
  "utf8",
);
const ID = "BUGFIX-GATE-CONTRADICCION-DESCRIPTIVA-20261005";

let lab: string;
const PATHS = (): { root: string; ticketsDir: string } => ({ root: lab, ticketsDir: "tickets" });

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-decisiones-"));
  mkdirSync(join(lab, "tickets", "2026", ID), { recursive: true });
  writeFileSync(
    join(lab, "tickets", "2026", ID, "ticket.md"),
    BASE.replace(/^workflow_status: closed/m, "workflow_status: qa_approved"),
    "utf8",
  );
});
afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

const DECISION = {
  pregunta: "¿Las devoluciones (DV) entran en la corrección?",
  eleccion: "Solo FV",
  alternativas: ["Solo FV", "FV y DV"],
  criterio: "el inventario documenta que las DV no llevan pago bonificado",
  fuente: "docs/inventario-pedidos-logistica/pagos.md:42",
  reversion: "agregar `type_order='DV'` al filtro y volver a correr el comando",
};

const decidir = (extra: Partial<typeof DECISION> = {}) =>
  registrarDecisionDelAgente({ paths: PATHS(), ticketId: ID, ...DECISION, ...extra });

const eventos = (accion: string) => {
  const u = findTicket(PATHS(), ID);
  return (parseTicket(u!.text).blocks.Eventos ?? []).filter((e) => e["action"] === accion);
};

const cerrar = () => transition({ paths: PATHS(), ticketId: ID, entity: "ticket", to: "closed" });

describe("registrar una decisión del agente", () => {
  it("anexa un evento agent-decision numerado con todos sus campos", () => {
    expect(decidir().id).toBe("D-001");
    expect(decidir({ pregunta: "¿Rango de fechas?" }).id).toBe("D-002");
    const [primero] = eventos("agent-decision");
    const d = JSON.parse(String(primero?.["details"])) as Record<string, unknown>;
    expect(d).toMatchObject({ id: "D-001", ...DECISION });
  });

  it.each(["criterio", "fuente", "pregunta", "eleccion"] as const)(
    "sin %s se rechaza sin escribir",
    (campo) => {
      expect(() => decidir({ [campo]: " " })).toThrow();
      expect(eventos("agent-decision")).toHaveLength(0);
    },
  );
});

describe("lo que queda por ratificar", () => {
  it("lista las decisiones del agente y las aprobaciones de la política, no las de una persona", () => {
    decidir();
    appendEvent(
      PATHS(),
      ID,
      "plan-approved",
      JSON.stringify({
        actor: `autorización ${POLITICA_POR_DEFECTO.id}`,
        source: "autorizacion",
        authorizationId: POLITICA_POR_DEFECTO.id,
        authorizationHash: POLITICA_POR_DEFECTO.hash,
        stage: "plan",
      }),
    );
    appendEvent(PATHS(), ID, "plan-approved", JSON.stringify({ actor: "Juan Andrade", source: "cli" }));
    const u = findTicket(PATHS(), ID);
    const pendientes = decisionesPorRatificar(parseTicket(u!.text));
    expect(pendientes.map((p) => p.tipo)).toEqual(["decision", "aprobacion"]);
    expect(pendientes[0]?.resumen).toContain("D-001");
  });
});

describe("el cierre exige ratificar", () => {
  it("sin decisiones del agente, cierra como siempre", () => {
    expect(() => cerrar()).not.toThrow();
  });

  it("con una decisión sin ratificar, closed se rechaza y la nombra", () => {
    decidir();
    expect(cerrar).toThrow(/D-001[\s\S]*valmen ratify/);
  });

  it("tras ratificar con las palabras de la persona, cierra", () => {
    decidir();
    const r = ratificarDecisiones({
      paths: PATHS(),
      ticketId: ID,
      actor: "Juan Andrade",
      quote: "ratifico las decisiones del agente",
      source: "cli",
      env: {},
    });
    expect(r.ratificadas).toEqual(["D-001"]);
    expect(eventos("agent-decisions-ratified")).toHaveLength(1);
    expect(() => cerrar()).not.toThrow();
  });

  it("una decisión posterior a la ratificación vuelve a exigirla", () => {
    decidir();
    ratificarDecisiones({ paths: PATHS(), ticketId: ID, actor: "Juan Andrade", quote: "ok", source: "cli", env: {} });
    decidir({ pregunta: "¿Otra?" });
    expect(cerrar).toThrow(/D-002/);
  });
});

describe("ratificar", () => {
  it("exige responsable y frase", () => {
    decidir();
    const base = { paths: PATHS(), ticketId: ID, source: "cli", env: {} };
    expect(() => ratificarDecisiones({ ...base, actor: "", quote: "ok" })).toThrow();
    expect(() => ratificarDecisiones({ ...base, actor: "Juan", quote: " " })).toThrow();
  });

  it("no la hace una sesión desatendida", () => {
    decidir();
    expect(() =>
      ratificarDecisiones({
        paths: PATHS(),
        ticketId: ID,
        actor: "Juan Andrade",
        quote: "ok",
        source: "cli",
        env: { VALMEN_UNATTENDED: "1" },
      }),
    ).toThrow();
  });

  it("sin nada por ratificar falla", () => {
    expect(() =>
      ratificarDecisiones({ paths: PATHS(), ticketId: ID, actor: "Juan", quote: "ok", source: "cli", env: {} }),
    ).toThrow(/nada por ratificar/);
  });
});

describe("los comandos agent-decision y ratify", () => {
  it("agent-decision registra y ratify lista y luego ratifica", async () => {
    const { agentDecisionCommand, ratifyCommand } = await import("../packages/cli/src/commands.js");
    const d = agentDecisionCommand(PATHS(), {
      id: ID,
      question: DECISION.pregunta,
      choice: DECISION.eleccion,
      alternatives: DECISION.alternativas.join("|"),
      criterion: DECISION.criterio,
      source: DECISION.fuente,
      rollback: DECISION.reversion,
    });
    expect(d.exitCode).toBe(0);
    expect(d.stdout).toContain("D-001");

    const lista = ratifyCommand(PATHS(), { id: ID });
    expect(lista.stdout).toContain("1 por ratificar");
    expect(lista.stdout).toContain(DECISION.pregunta);

    const r = ratifyCommand(PATHS(), { id: ID, actor: "Juan Andrade", quote: "ratifico" }, { env: {} });
    expect(r.exitCode).toBe(0);
    expect(ratifyCommand(PATHS(), { id: ID }).stdout).toContain("no tiene decisiones");
  });
});
