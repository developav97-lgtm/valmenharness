/**
 * Una jornada no aprueba nada por instrucción del prompt (R-JORN-010).
 *
 * Dos garantías y una red: lo que se pide en las plantillas (nunca aprobar ni saltar estados), lo
 * que el código rechaza en una sesión desatendida (decidir una compuerta, aprobar un QA o un
 * retest) y que el run autónomo solo da por aprobado un plan con la aprobación **registrada**.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addRetest, qaClose } from "../packages/engine/src/append.js";
import { promptFor, runAutonomous } from "../packages/engine/src/autonomous-run.js";
import { promptDePreparacion } from "../packages/engine/src/journey-preparation.js";
import { recordHumanDecision } from "../packages/server/src/gates.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const RAIZ = join(import.meta.dirname, "..");
const PLANTILLA = readFileSync(join(RAIZ, "templates", "programar", "prompt-eslabon.md"), "utf8");
const ID = "BUGFIX-POS-AUTOAPROB-20261005";

/** Lo que una plantilla de jornada no puede pedir, ni afirmativa ni disfrazada de delegación. */
const PROHIBIDO: readonly [string, RegExp][] = [
  ["decidir una compuerta con gate-decide", /gate-decide/i],
  ["--decision approve", /--decision\s+approve/i],
  ["cerrar el QA", /qa-close/i],
  ["abrir un ciclo de QA", /qa-start/i],
  ["delegación como permiso", /delegad[oa]/i],
  ["la orden de aprobar", /\b(aprob[aá]|aprueba|aprobar la compuerta|apruebe)\b/i],
  ["pasar a in_qa", /\bin_qa\b/],
  ["pasar a qa_approved o closed", /\b(qa_approved|a `closed`)\b/],
];

describe("las plantillas de prompt de la jornada", () => {
  const plantillas: [string, string][] = [
    ["templates/programar/prompt-eslabon.md", PLANTILLA],
    ["promptFor (ejecución)", promptFor(ID)],
    ["promptDePreparacion", promptDePreparacion(ID)],
  ];

  it.each(plantillas)("%s no ordena aprobar ni pide un estado ilegal", (_nombre, texto) => {
    for (const [que, patron] of PROHIBIDO) {
      expect(patron.test(texto), `${_nombre}: ${que}`).toBe(false);
    }
  });

  it("la plantilla de eslabón dice que decidir es de una persona y que la sesión es desatendida", () => {
    expect(PLANTILLA).toContain("VALMEN_UNATTENDED");
    expect(PLANTILLA).toContain("Nunca decide");
    expect(PLANTILLA).toContain("DETENETE en `planned`");
    expect(PLANTILLA).toContain("awaiting_user_tests");
  });

  it("la plantilla sigue teniendo los marcadores que el script rellena", () => {
    for (const marcador of ["PROYECTO", "TICKET_ID", "RUTA_TICKET", "COMANDOS_PRUEBA", "IMPLEMENTADOR", "OTROS_ESLABONES"]) {
      expect(PLANTILLA).toContain(`{{${marcador}}}`);
    }
  });
});

describe("una sesión desatendida no decide", () => {
  let lab: string;
  const antes = process.env["VALMEN_UNATTENDED"];
  beforeEach(() => {
    lab = mkdtempSync(join(tmpdir(), "valmen-autoaprob-"));
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(join(lab, ".valmen", "config.yaml"), "name: Demo\n", "utf8");
    writeFixtureTicket(lab, { id: ID, workflowStatus: "in_qa", qaStatus: "pending" });
  });
  afterEach(() => {
    if (antes === undefined) delete process.env["VALMEN_UNATTENDED"];
    else process.env["VALMEN_UNATTENDED"] = antes;
    rmSync(lab, { recursive: true, force: true });
  });
  const paths = () => ({ root: lab, ticketsDir: "tickets" });

  it("no puede registrar la decisión de una compuerta", () => {
    process.env["VALMEN_UNATTENDED"] = "1";
    expect(() => recordHumanDecision(paths(), ID, "GR-x", { decision: "approve", actor: "agente", reason: "x" })).toThrow(/desatendida.*decidir una compuerta/);
    delete process.env["VALMEN_UNATTENDED"];
    // Una persona sí llega a la validación del recibo (que no existe): no la frena la barrera.
    const r = recordHumanDecision(paths(), ID, "GR-x", { decision: "approve", actor: "Juan", reason: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("No existe el recibo");
  });

  it("no puede aprobar un ciclo de QA ni un retest, y sí puede registrar un resultado no aprobado", () => {
    process.env["VALMEN_UNATTENDED"] = "1";
    expect(() => qaClose({ paths: paths(), ticketId: ID, result: "approved", poConfirmation: "ok" })).toThrow(/desatendida.*ciclo de QA/);
    expect(() => addRetest({ paths: paths(), ticketId: ID, pointId: "POINT-001", result: "approved", poConfirmation: "ok" })).toThrow(/desatendida.*retest/);
    // Un hallazgo no es una aprobación: llega al motor y falla por sus propias reglas, no por la barrera.
    expect(() => qaClose({ paths: paths(), ticketId: ID, result: "changes_requested" })).not.toThrow(/desatendida/);
  });

  it("sin la marca, la aprobación de QA llega a las reglas del motor", () => {
    expect(() => qaClose({ paths: paths(), ticketId: ID, result: "approved", poConfirmation: "ok" })).not.toThrow(/desatendida/);
  });
});

describe("el run autónomo exige la aprobación registrada", () => {
  let lab: string;
  beforeEach(() => {
    lab = mkdtempSync(join(tmpdir(), "valmen-autoaprob-run-"));
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(
      join(lab, ".valmen", "config.yaml"),
      [
        "name: Demo",
        "test-commands:",
        "  - node",
        "autonomous:",
        "  enabled: true",
        "  executor:",
        "    id: codex",
        "    model: gpt-6-sol",
        "    effort: high",
        "  eligible:",
        "    types:",
        "      - BUGFIX",
        "    max-risk: normal",
        "    require:",
        "      - plan-approved",
        "    excluded-modules:",
        "      - auth",
        "  limits:",
        "    max-concurrent: 1",
        "    collision-policy: serialize",
        "    max-per-day: 3",
        "    budget-per-ticket: 1",
        "    stop-on:",
        "      - test-failure",
        "",
      ].join("\n"),
      "utf8",
    );
  });
  afterEach(() => rmSync(lab, { recursive: true, force: true }));

  it("un plan con la línea escrita pero sin la aprobación registrada no es elegible", async () => {
    writeFixtureTicket(lab, { id: ID, workflowStatus: "approved", aprobacionRegistrada: false });
    await expect(
      runAutonomous({ paths: { root: lab, ticketsDir: "tickets" }, ticketId: ID, execute: () => ({ status: 0, stdout: "", stderr: "" }) }),
    ).rejects.toThrow(/no tiene la aprobación del plan registrada/);
  });

  it("con la aprobación registrada vigente sí es elegible", async () => {
    writeFixtureTicket(lab, { id: ID, workflowStatus: "approved" });
    const r = await runAutonomous({ paths: { root: lab, ticketsDir: "tickets" }, ticketId: ID, execute: () => ({ status: 0, stdout: "", stderr: "" }) });
    expect(r.ticketId).toBe(ID);
  });
});
