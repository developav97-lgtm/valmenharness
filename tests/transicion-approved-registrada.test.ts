/**
 * Entrar a `approved` exige la aprobación del plan registrada (R-CTRL-001, mitad de exigencia).
 *
 * Una frase en `## Plan` la puede escribir quien escribe el plan; el evento `plan-approved`
 * lleva actor, fuente, frase y el hash del plan aprobado. Lo que se afirma es lo que cambia
 * de confianza: la frase sola no abre la puerta, un plan cambiado después de aprobarse
 * tampoco, y los tickets que ya pasaron por `approved` siguen validando.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseTicket } from "../packages/core/src/index.js";
import { findTicket } from "../packages/engine/src/discovery.js";
import { registrarAprobacionDePlan } from "../packages/engine/src/plan-approval.js";
import { transition } from "../packages/engine/src/transition.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const ID = "SECURITY-CORE-TRANSICION-APPROVED-20261005";

let lab: string;
const PATHS = (): { root: string; ticketsDir: string } => ({ root: lab, ticketsDir: "tickets" });
const RUTA = (id = ID): string => join(lab, "tickets", "2026", id, "ticket.md");

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-transapp-"));
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(join(lab, ".valmen", "config.yaml"), "name: Demo\n", "utf8");
  // El fixture ya trae la línea «aprobado explícitamente por el PO»: lo que se prueba es
  // que esa frase, sola, no alcanza.
  writeFixtureTicket(lab, { id: ID, workflowStatus: "planned", type: "SECURITY", module: "CORE" });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

function aprobar(env: Record<string, string> = {}): void {
  registrarAprobacionDePlan({
    paths: PATHS(),
    ticketId: ID,
    actor: "Juan Andrade",
    source: "cli",
    quote: "Apruebo el plan",
    env,
  });
}

function aApproved(): void {
  transition({ paths: PATHS(), ticketId: ID, entity: "ticket", to: "approved" });
}

function editarPlan(extra: string): void {
  const texto = readFileSync(RUTA(), "utf8");
  const i = texto.indexOf("## Criterios de aceptación");
  writeFileSync(RUTA(), `${texto.slice(0, i).trimEnd()}\n${extra}\n\n${texto.slice(i)}`, "utf8");
}

describe("sin aprobación registrada", () => {
  it("la frase en `## Plan` no basta y el mensaje dice cómo registrarla", () => {
    expect(readFileSync(RUTA(), "utf8")).toContain("aprobado explícitamente por el PO");
    expect(aApproved).toThrow(/approved requiere la aprobación del plan registrada/);
    expect(aApproved).toThrow(/valmen approve-plan --id SECURITY-CORE-TRANSICION-APPROVED-20261005/);
    expect(readFileSync(RUTA(), "utf8")).toContain("workflow_status: planned");
  });

  it("una sesión desatendida no puede registrarla, y entonces tampoco entra a approved", () => {
    expect(() => aprobar({ VALMEN_UNATTENDED: "1" })).toThrow(/desatendida/);
    expect(aApproved).toThrow(/approved requiere la aprobación/);
  });
});

describe("con la aprobación registrada", () => {
  it("procede y deja un evento que cita al aprobador y el hash", () => {
    aprobar();
    aApproved();
    const ticket = parseTicket(readFileSync(RUTA(), "utf8"));
    expect(ticket.fields.workflow_status).toBe("approved");
    const verificado = (ticket.blocks.Eventos ?? []).find((e) => e["action"] === "plan-approval-verified");
    expect(String(verificado?.["details"])).toContain("Juan Andrade");
    expect(String(verificado?.["details"])).toMatch(/sha256:[0-9a-f]{64}/);
  });

  it("si el plan cambia después de aprobarse, se rechaza porque el hash no coincide", () => {
    aprobar();
    editarPlan("  3. Un paso que nadie aprobó.");
    expect(aApproved).toThrow(/cambió después de que Juan Andrade lo aprobó/);
    expect(readFileSync(RUTA(), "utf8")).toContain("workflow_status: planned");
  });

  it("una aprobación nueva tras el cambio vuelve a abrir la puerta", () => {
    aprobar();
    editarPlan("  3. Un paso nuevo.");
    expect(aApproved).toThrow();
    aprobar();
    expect(aApproved).not.toThrow();
  });
});

describe("compatibilidad", () => {
  it("un ticket que ya pasó por approved sigue validando y avanza sin otra aprobación", () => {
    const viejo = "SECURITY-CORE-VIEJO-20260921";
    writeFixtureTicket(lab, { id: viejo, workflowStatus: "approved", type: "SECURITY", module: "CORE" });
    expect(findTicket(PATHS(), viejo)).toBeDefined();
    transition({ paths: PATHS(), ticketId: viejo, entity: "ticket", to: "in_progress" });
    expect(readFileSync(RUTA(viejo), "utf8")).toContain("workflow_status: in_progress");
  });
});
