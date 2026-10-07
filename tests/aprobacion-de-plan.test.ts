/**
 * La aprobación del plan como evento con autor (R-CTRL-001, mitad de registro).
 *
 * Lo que se afirma es lo que cambia de confianza: que la frase escrita en `## Plan` no
 * cuenta, que la aprobación deja de valer si el plan cambia, que una sesión desatendida
 * no puede registrarla y que los tickets que ya pasaron por `approved` siguen validando.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseTicket } from "../packages/core/src/index.js";
import {
  aprobacionDePlanVigente,
  hashDelPlan,
  registrarAprobacionDePlan,
} from "../packages/engine/src/plan-approval.js";
import { findTicket } from "../packages/engine/src/discovery.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const ID = "SECURITY-ENGINE-APROBACION-PLAN-20261005";
const FRASE = "Apruebo este plan: «Escojo la A aprobar los 3 planes»";

let lab: string;
const PATHS = (): { root: string; ticketsDir: string } => ({ root: lab, ticketsDir: "tickets" });

function ticket(): ReturnType<typeof parseTicket> {
  const ubicado = findTicket(PATHS(), ID);
  if (ubicado === undefined) throw new Error("falta el ticket");
  return parseTicket(ubicado.text);
}

function editarPlan(reemplazo: (plan: string) => string): void {
  const ruta = join(lab, "tickets", "2026", ID, "ticket.md");
  const texto = readFileSync(ruta, "utf8");
  const a = texto.indexOf("## Plan");
  const b = texto.indexOf("## Criterios de aceptación");
  writeFileSync(ruta, texto.slice(0, a) + reemplazo(texto.slice(a, b)) + texto.slice(b), "utf8");
}

function aprobar(extra: Partial<Parameters<typeof registrarAprobacionDePlan>[0]> = {}): void {
  registrarAprobacionDePlan({
    paths: PATHS(),
    ticketId: ID,
    actor: "Juan Andrade",
    source: "cli",
    quote: FRASE,
    env: {},
    ...extra,
  });
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-aprobplan-"));
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(join(lab, ".valmen", "config.yaml"), "name: Demo\n", "utf8");
  writeFixtureTicket(lab, { id: ID, workflowStatus: "planned", type: "SECURITY", module: "ENGINE" });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("registrar la aprobación", () => {
  it("anexa un evento con actor, fuente, frase literal y el hash del plan", () => {
    aprobar();
    const eventos = ticket().blocks.Eventos ?? [];
    const evento = eventos.find((e) => e["action"] === "plan-approved");
    expect(evento).toBeDefined();
    const datos = JSON.parse(String(evento?.["details"])) as Record<string, string>;
    expect(datos["actor"]).toBe("Juan Andrade");
    expect(datos["source"]).toBe("cli");
    expect(datos["quote"]).toBe(FRASE);
    expect(datos["planHash"]).toBe(hashDelPlan(ticket()));
    expect(datos["planHash"]).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("exige responsable y frase", () => {
    expect(() => aprobar({ actor: "  " })).toThrow(/responsable/);
    expect(() => aprobar({ quote: "" })).toThrow(/frase literal/);
  });
});

describe("las fuentes aceptadas", () => {
  it("sin declaración rigen mission-control y cli; otra se rechaza", () => {
    expect(() => aprobar({ source: "mission-control" })).not.toThrow();
    expect(() => aprobar({ source: "hermes" })).toThrow(/no está entre las que el proyecto acepta/);
  });

  it("el proyecto las declara y la lista manda", () => {
    writeFileSync(
      join(lab, ".valmen", "config.yaml"),
      "name: Demo\nplan-approval-sources:\n  - hermes\n",
      "utf8",
    );
    expect(() => aprobar({ source: "hermes" })).not.toThrow();
    expect(() => aprobar({ source: "cli" })).toThrow(/hermes/);
  });

  it("una lista vacía o con un nombre inválido falla en vez de aceptar cualquiera", () => {
    writeFileSync(join(lab, ".valmen", "config.yaml"), "name: Demo\nplan-approval-sources: []\n", "utf8");
    expect(() => aprobar()).toThrow(/plan-approval-sources/);
    writeFileSync(
      join(lab, ".valmen", "config.yaml"),
      "name: Demo\nplan-approval-sources:\n  - Hermes Móvil\n",
      "utf8",
    );
    expect(() => aprobar()).toThrow(/inválida/);
  });
});

describe("una sesión desatendida", () => {
  it("no puede registrar la aprobación y no deja nada escrito", () => {
    expect(() => aprobar({ env: { VALMEN_UNATTENDED: "1" } })).toThrow(/desatendida/);
    expect((ticket().blocks.Eventos ?? []).some((e) => e["action"] === "plan-approved")).toBe(false);
  });
});

describe("la vigencia", () => {
  it("sin evento no hay aprobación, aunque el plan diga «aprobado explícitamente por el PO»", () => {
    editarPlan((plan) =>
      plan.replace(
        /- Gate de plan y aprobación:.*/,
        "- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).",
      ),
    );
    const estado = aprobacionDePlanVigente(ticket());
    expect(estado.estado).toBe("sin-aprobacion");
    if (estado.estado === "sin-aprobacion") expect(estado.motivo).toContain("approve-plan");
  });

  it("tras aprobar vale; si el plan cambia, deja de valer y el motivo lo dice", () => {
    aprobar();
    expect(aprobacionDePlanVigente(ticket()).estado).toBe("vigente");

    editarPlan((plan) => `${plan.trimEnd()}\n  3. Un paso nuevo que nadie aprobó.\n\n`);
    const estado = aprobacionDePlanVigente(ticket());
    expect(estado.estado).toBe("plan-cambiado");
    if (estado.estado === "plan-cambiado") expect(estado.motivo).toContain("cambió");
  });

  it("escribir la línea de gate después de aprobar no invalida la aprobación", () => {
    aprobar();
    editarPlan((plan) =>
      plan.replace(
        /- Gate de plan y aprobación:.*/,
        "- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), con la frase del evento.",
      ),
    );
    expect(aprobacionDePlanVigente(ticket()).estado).toBe("vigente");
  });

  it("una segunda aprobación reemplaza a la primera tras un cambio de plan", () => {
    aprobar();
    editarPlan((plan) => `${plan.trimEnd()}\n  3. Otro paso.\n\n`);
    expect(aprobacionDePlanVigente(ticket()).estado).toBe("plan-cambiado");
    aprobar({ quote: "Apruebo la versión nueva del plan" });
    expect(aprobacionDePlanVigente(ticket()).estado).toBe("vigente");
  });
});

describe("compatibilidad", () => {
  it("un ticket que ya pasó por approved sigue validando y sigue sin aprobación registrada", () => {
    writeFixtureTicket(lab, { id: "BUGFIX-POS-VIEJO-20260921", workflowStatus: "approved" });
    const viejo = findTicket(PATHS(), "BUGFIX-POS-VIEJO-20260921");
    expect(viejo).toBeDefined();
    const documento = parseTicket(viejo?.text ?? "");
    expect(documento.fields.workflow_status).toBe("approved");
    expect(aprobacionDePlanVigente(documento).estado).toBe("sin-aprobacion");
  });
});
