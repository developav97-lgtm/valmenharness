/**
 * El brief toma el estado del ticket del registro de su worktree cuando el worktree existe.
 */
import { mkdirSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  armarBriefDeSubagente,
  renderBriefDeSubagente,
  worktreeDelTicket,
} from "../packages/engine/src/index.js";
import { crearEntornoOla, ticketEn, type EntornoOla } from "./helpers/ola.js";

const ID = "FEATURE-JOURNEY-ALFA-20261008";

let entorno: EntornoOla;

beforeEach(() => {
  entorno = crearEntornoOla();
  ticketEn(entorno.root, ID, "intake");
});
afterEach(() => entorno.limpiar());

function armar() {
  const brief = armarBriefDeSubagente({ project: entorno.project(), ticketId: ID });
  return { brief, texto: renderBriefDeSubagente(brief) };
}

function ticketEnElWorktree(estado: string): string {
  const ruta = worktreeDelTicket(entorno.root, ID).ruta;
  mkdirSync(ruta, { recursive: true });
  ticketEn(ruta, ID, estado);
  return ruta;
}

describe("brief con el registro del worktree", () => {
  it("un ticket que avanzó en su worktree se ve en el estado y el paso del worktree", () => {
    const ruta = ticketEnElWorktree("approved");
    const { brief, texto } = armar();
    expect(brief.estado).toBe("approved");
    expect(brief.resume.nextStep.fase).toMatch(/implementaci/i);
    expect(texto).toContain("Estado: approved");
    expect(texto).toContain(`Registro: worktree (${ruta})`);
  });

  it("sin worktree el brief sigue leyendo el registro principal", () => {
    const { brief, texto } = armar();
    expect(brief.estado).toBe("intake");
    expect(brief.resume.nextStep.fase).toMatch(/an[aá]lisis/i);
    expect(texto).toContain("Estado: intake");
    expect(texto).toContain("Registro: principal");
    expect(texto).not.toContain("Registro: worktree");
  });

  it("una carpeta de worktree sin el ticket no cambia el estado", () => {
    mkdirSync(worktreeDelTicket(entorno.root, ID).ruta, { recursive: true });
    const { brief, texto } = armar();
    expect(brief.estado).toBe("intake");
    expect(texto).toContain("Registro: principal");
  });
});
