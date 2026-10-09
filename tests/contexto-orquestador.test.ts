/**
 * Menos contexto para la sesión orquestadora (IMPROVEMENT-ENGINE-CONTEXTO-ORQUESTADOR-20261009).
 *
 * Se protege lo que el harness controla: el contrato de entrega con el informe de forma fija,
 * `journey brief --out`, `resume --quiet` y la guía de la skill `corrida-orquestada`. Todo corre
 * sobre una raíz temporal.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { journeyBriefCommand, resumeTicket } from "../packages/cli/src/commands.js";
import {
  armarBriefDeSubagente,
  renderBriefDeSubagente,
  renderResumeContext,
  type ResumeContext,
} from "../packages/engine/src/index.js";
import { crearEntornoOla, ticketEn, type EntornoOla } from "./helpers/ola.js";

const ID = "FEATURE-JOURNEY-ALFA-20261008";
const SKILL = readFileSync(join(process.cwd(), ".valmen", "skills", "corrida-orquestada", "SKILL.md"), "utf8");
const plano = (t: string): string => t.replace(/\s+/g, " ");

let entorno: EntornoOla;
let extra: string;
beforeEach(() => {
  entorno = crearEntornoOla();
  extra = mkdtempSync(join(tmpdir(), "valmen-contexto-"));
  ticketEn(entorno.root, ID, "approved");
});
afterEach(() => {
  entorno.limpiar();
  rmSync(extra, { recursive: true, force: true });
});

function textoDelBrief(): string {
  return renderBriefDeSubagente(armarBriefDeSubagente({ project: entorno.project(), ticketId: ID }));
}

describe("contrato de entrega del brief", () => {
  const contrato = (): string => plano(textoDelBrief());

  it("C1: fija el informe en 8 líneas como máximo", () => {
    expect(contrato()).toMatch(/8 líneas/);
  });
  it("C2: fija el informe en 900 caracteres como máximo", () => {
    expect(contrato()).toMatch(/900 caracteres como máximo/);
  });
  it("C3: nombra los cinco campos del informe", () => {
    const t = contrato();
    for (const campo of ["estado", "commit", "archivos", "pruebas", "decisión"]) expect(t).toContain(campo);
    expect(t).toMatch(/estado, commit \(hash\), archivos tocados, pruebas \(comando y resultado\) y decisión/);
  });
  it("C4: prohíbe pegar salidas de comandos o recibos completos", () => {
    expect(contrato()).toMatch(/No pegues en el informe salidas de comandos ni recibos completos/);
  });
  it("la línea vieja sin forma ni tope ya no está", () => {
    expect(contrato()).not.toContain("Responde en pocas líneas");
  });
});

describe("journey brief --out", () => {
  const flags = (extraFlags: Record<string, string> = {}): Record<string, string> => ({
    project: "ola-lab",
    id: ID,
    ...extraFlags,
  });

  it("C5: el archivo es idéntico a la salida sin --out", () => {
    const sin = journeyBriefCommand(flags(), { home: entorno.home });
    const ruta = join(extra, "briefs", "alfa.txt");
    const con = journeyBriefCommand(flags({ out: ruta }), { home: entorno.home });
    expect(con.exitCode).toBe(0);
    expect(existsSync(ruta)).toBe(true);
    expect(readFileSync(ruta, "utf8")).toBe(sin.stdout);
  });

  it("C6: imprime una sola línea con la ruta escrita", () => {
    const ruta = join(extra, "alfa.txt");
    const con = journeyBriefCommand(flags({ out: ruta }), { home: entorno.home });
    const lineas = con.stdout.split("\n").filter((l) => l !== "");
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toContain(ruta);
  });

  it("C7: sin --out imprime el brief completo, como antes", () => {
    const sin = journeyBriefCommand(flags(), { home: entorno.home });
    expect(sin.stdout).toContain(`Brief de subagente — ${ID}`);
    expect(sin.stdout).toContain("Contrato de entrega:");
    expect(sin.stdout.split("\n").length).toBeGreaterThan(10);
  });

  it("rechaza --out sin ruta", () => {
    const con = journeyBriefCommand({ project: "ola-lab", id: ID, out: true }, { home: entorno.home });
    expect(con.exitCode).not.toBe(0);
  });
});

describe("resume --quiet", () => {
  const ticketActivo = "BUGFIX-JOURNEY-FILTRO-20260922";
  let paths: { root: string; ticketsDir: string };
  beforeEach(() => {
    mkdirSync(join(extra, ".valmen"), { recursive: true });
    writeFileSync(join(extra, ".valmen", "config.yaml"), "name: Laboratorio\n", "utf8");
    ticketEn(extra, ticketActivo, "approved", { type: "BUGFIX" });
    paths = { root: extra, ticketsDir: "tickets" };
  });

  it("C8: imprime tres líneas como máximo", () => {
    const r = resumeTicket(paths, ticketActivo, "compacto", undefined, true);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.split("\n").filter((l) => l !== "").length).toBeLessThanOrEqual(3);
  });
  it("C9: incluye el estado del ticket", () => {
    const r = resumeTicket(paths, ticketActivo, "compacto", undefined, true);
    expect(r.stdout).toContain(`${ticketActivo} — approved`);
  });
  it("C10: incluye el título del siguiente paso", () => {
    const completo = resumeTicket(paths, ticketActivo);
    const fase = (completo.data as unknown as ResumeContext).nextStep.fase;
    expect(fase).not.toBe("");
    const r = resumeTicket(paths, ticketActivo, "compacto", undefined, true);
    expect(r.stdout).toContain(`Siguiente paso: ${fase}`);
  });
  it("C11: no incluye el plan vigente", () => {
    const r = resumeTicket(paths, ticketActivo, "compacto", undefined, true);
    expect(r.stdout).not.toContain("Plan vigente");
    expect(r.stdout).not.toContain("Duración por etapa");
  });
  it("C12: sin --quiet imprime lo mismo que antes", () => {
    const r = resumeTicket(paths, ticketActivo);
    expect(r.stdout).toBe(renderResumeContext(r.data as unknown as ResumeContext));
    expect(r.stdout).toContain("Plan vigente:");
    expect(resumeTicket(paths, ticketActivo, "compacto", undefined, false).stdout).toBe(r.stdout);
  });
});

describe("la skill corrida-orquestada", () => {
  const t = plano(SKILL);
  it("C13: pasa el brief con `journey brief --out` y la ruta", () => {
    expect(t).toContain("`valmen journey brief --id <ID>` con `--out <ruta>`");
    expect(t).toMatch(/dale solo la ruta y la orden de leerlo entero/);
  });
  it("C14: consulta el estado con `valmen resume --id <ID> --quiet`", () => {
    expect(t).toContain("`valmen resume --id <ID> --quiet`");
  });
  it("C15: de la suite muestra solo el resumen de archivos y pruebas", () => {
    expect(t).toMatch(/De la suite muestra solo las líneas `Test Files` y `Tests` y los fallos/);
  });
  it("C16: no pega salidas largas de comandos en la conversación", () => {
    expect(t).toMatch(/No pegues salidas largas de comandos/);
  });
  it("la proyección del catálogo es la misma que la fuente", () => {
    expect(readFileSync(join(process.cwd(), "skills", "corrida-orquestada", "SKILL.md"), "utf8")).toBe(SKILL);
  });
});
