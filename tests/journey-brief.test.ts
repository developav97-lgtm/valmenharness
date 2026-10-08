/**
 * El brief de un ticket para un subagente de la corrida orquestada (C19–C31).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fasesDeSesion } from "../packages/adapter/src/index.js";
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
});
afterEach(() => entorno.limpiar());

function brief(estado: string, extra: { type?: string; cliente?: "claude" | "codex" } = {}) {
  ticketEn(entorno.root, ID, estado, extra.type === undefined ? {} : { type: extra.type });
  const armado = armarBriefDeSubagente({
    project: entorno.project(),
    ticketId: ID,
    ...(extra.cliente === undefined ? {} : { cliente: extra.cliente }),
  });
  return { armado, texto: renderBriefDeSubagente(armado) };
}

/** Un enrutamiento del proyecto con las cuatro fases del agente en Claude Code. */
function escribirRouting(): void {
  const fase = (nombre: string, modelo: string, esfuerzo: string): string =>
    `  agent-${nombre}:\n    provider: claude-code\n    model: ${modelo}\n    effort: ${esfuerzo}\n`;
  writeFileSync(
    join(entorno.root, ".valmen", "routing.yaml"),
    `roles:\n${fase("analysis", "claude-opus-5-5", "high")}${fase("plan", "claude-opus-5-5", "high")}` +
      `${fase("implementation", "claude-sonnet-5-5", "high")}${fase("verification", "claude-haiku-4-5-20251001", "auto")}`,
  );
}

describe("brief de subagente", () => {
  it("C19: sugiere la ruta del worktree y la rama del ticket, con el comando para crearlos", () => {
    const { armado, texto } = brief("approved");
    const esperado = worktreeDelTicket(entorno.root, ID);
    expect(armado.worktree).toEqual(esperado);
    expect(esperado.rama).toBe("valmen/ticket-alfa");
    expect(texto).toContain(`Worktree: ${esperado.ruta}`);
    expect(texto).toContain(`Rama: ${esperado.rama}`);
    expect(texto).toContain(`worktree add -b ${esperado.rama} ${esperado.ruta}`);
  });

  it("C20: incluye el siguiente paso que valmen resume calcula para el estado", () => {
    const { armado, texto } = brief("approved");
    expect(armado.resume.nextStep.fase).toMatch(/implementaci/i);
    expect(texto).toContain(`Siguiente paso — ${armado.resume.nextStep.fase}:`);
    expect(texto).toContain("in_progress");
    // Control: otro estado trae otro paso.
    const intake = brief("intake");
    expect(intake.armado.resume.nextStep.fase).not.toBe(armado.resume.nextStep.fase);
  });

  it("C21: da el modelo, el esfuerzo y el alias de subagente de la fase del lanzamiento", () => {
    escribirRouting();
    const { armado, texto } = brief("approved", { cliente: "claude" });
    const fase = fasesDeSesion(entorno.root, { cliente: "claude", estado: "approved" }).fases.find((f) => f.fase === "implementation");
    expect(fase).toBeDefined();
    expect(armado.fase).toMatchObject({ fase: "implementation", model: fase?.model, effort: fase?.effort, subagente: fase?.subagente });
    expect(fase).toMatchObject({ model: "claude-sonnet-5-5", effort: "high" });
    expect(fase?.subagente).toBeTruthy();
    expect(texto).toContain(`Modelo de tu fase (implementation): ${fase?.model}, esfuerzo ${fase?.effort}.`);
    expect(texto).toContain(`Alias de subagente: ${fase?.subagente}.`);
    // La fase de un ticket en intake es otra: el brief sigue al estado.
    expect(brief("intake").armado.fase?.fase).toBe("analysis");
  });

  it("C22: si el perfil de la fase es de otro proveedor, lo avisa y no inventa un alias", () => {
    escribirRouting();
    const { armado, texto } = brief("approved", { cliente: "codex" });
    expect(armado.fase?.subagente).toBeNull();
    expect(armado.fase?.aviso).toBeTruthy();
    expect(texto).toContain(`Aviso de la fase: ${armado.fase?.aviso}.`);
    expect(texto).not.toContain("Alias de subagente");
  });

  it("C23: nombra las skills de proceso que la fase carga", () => {
    // Sin skills en el proyecto el brief lo dice; con ellas, nombra las de la fase.
    expect(brief("approved").texto).toContain("Skills a cargar: ninguna de proceso");
    for (const skill of ["pruebas-unitarias", "revision-final"]) {
      mkdirSync(join(entorno.root, ".valmen", "skills", skill), { recursive: true });
      writeFileSync(join(entorno.root, ".valmen", "skills", skill, "SKILL.md"), "---\nname: x\n---\n");
    }
    const { armado, texto } = brief("approved");
    expect(armado.skills).toEqual(["pruebas-unitarias"]);
    expect(texto).toContain("Skills a cargar: pruebas-unitarias.");
  });

  it("C24: nombra las compuertas de la fase con su evaluador: cascade para análisis y plan, command para qa-mechanical", () => {
    const { armado, texto } = brief("approved");
    const comandos = armado.compuertas.flatMap((c) => c.comandos);
    expect(comandos).toEqual(
      expect.arrayContaining([
        { comando: `valmen precheck analysis --id ${ID}`, evaluador: null },
        { comando: `valmen gate analysis --id ${ID} --evaluator cascade`, evaluador: "cascade" },
        { comando: `valmen precheck plan --id ${ID}`, evaluador: null },
        { comando: `valmen gate plan --id ${ID} --evaluator cascade`, evaluador: "cascade" },
        { comando: `valmen gate qa-mechanical --id ${ID} --evaluator command`, evaluador: "command" },
      ]),
    );
    expect(texto).toContain(`valmen gate qa-mechanical --id ${ID} --evaluator command (evaluador command)`);
    expect(texto).toContain(`valmen gate analysis --id ${ID} --evaluator cascade (evaluador cascade)`);
    // Verificación: sin compuertas para el subagente.
    expect(armado.compuertas.find((c) => c.fase === "verificación")?.comandos).toEqual([]);
    expect(texto).toContain("sin compuertas para el subagente");
  });

  it("C25: declara el contrato de entrega", () => {
    const { texto } = brief("approved");
    const contrato = texto.slice(texto.indexOf("Contrato de entrega:"), texto.indexOf("Lo que NO haces:"));
    expect(contrato).toContain("comandos exactos");
    expect(contrato).toContain("directorio de ejecución");
    expect(contrato).toContain("resultado esperado");
    expect(contrato).toContain("validaciones manuales");
    expect(contrato).toContain("`- [x]`");
    expect(contrato).toContain("registrar_consumo_ia");
    expect(contrato).toContain("`valmen secrets`");
    expect(contrato).toContain("Commit solo en la rama del worktree");
    expect(contrato).toContain("`git add` explícito");
    expect(contrato).toContain("Sin push ni merge");
  });

  it("C26: prohíbe aprobar lo que decide una persona", () => {
    const { texto } = brief("approved");
    expect(texto).toContain("No apruebes nada que decida una persona");
  });

  it("C27: prohíbe tocar el checkout principal y nombra su ruta", () => {
    const { armado, texto } = brief("approved");
    expect(armado.raiz).toBe(entorno.root);
    expect(texto).toContain(`No toques el checkout principal (${entorno.root})`);
  });

  it("C28: prohíbe correr la suite completa y manda a correr los archivos de prueba del ticket", () => {
    const { texto } = brief("approved");
    expect(texto).toContain("No corras `npx vitest run` sin archivos");
    expect(texto).toContain("solo los archivos de prueba del ticket");
  });

  it("C29: el brief de un SECURITY lo declara solo de persona, y el de un FEATURE no lleva ese bloque", () => {
    const seguridad = brief("approved", { type: "SECURITY" });
    expect(seguridad.armado.bloqueSecurity.length).toBeGreaterThan(0);
    expect(seguridad.texto).toContain("Ticket SECURITY — solo persona");
    expect(seguridad.texto).toContain("aun con una autorización vigente");

    const feature = brief("approved", { type: "FEATURE" });
    expect(feature.armado.bloqueSecurity).toEqual([]);
    expect(feature.texto).not.toContain("SECURITY");
  });

  it("C30: un ticket que no es lanzable produce un brief marcado con su motivo", () => {
    for (const estado of ["planned", "awaiting_user_tests", "in_qa", "qa_approved", "closed", "blocked"]) {
      const { armado, texto } = brief(estado);
      expect(armado.lanzable, estado).toBe(false);
      expect(armado.motivoNoLanzable, estado).toBeTruthy();
      expect(texto, estado).toContain(`NO LANZABLE: ${armado.motivoNoLanzable}`);
    }
  });

  it("control de C30: los estados de arranque son lanzables y no traen motivo", () => {
    for (const estado of ["intake", "analyzed", "approved", "in_progress", "changes_requested"]) {
      const { armado, texto } = brief(estado);
      expect(armado.lanzable, estado).toBe(true);
      expect(armado.motivoNoLanzable, estado).toBeNull();
      expect(texto, estado).toContain("Lanzable: sí.");
      expect(texto, estado).not.toContain("NO LANZABLE");
    }
  });

  it("un ticket inexistente lanza un error que nombra el id", () => {
    ticketEn(entorno.root, ID, "approved");
    expect(() =>
      armarBriefDeSubagente({ project: entorno.project(), ticketId: "FEATURE-JOURNEY-FANTASMA-20261008" }),
    ).toThrow(/FEATURE-JOURNEY-FANTASMA-20261008/);
  });
});
