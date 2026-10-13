/**
 * El plan declara tamaño previsto y estrategia de partición (R-ENT-003).
 *
 * Lo que se afirma: la plantilla trae las dos líneas nuevas; la revisión previa de la
 * compuerta de plan detiene un plan que declara más líneas que `delivery-budget` sin decir si
 * se parte o sigue; un plan sin la línea de tamaño no gana hallazgos; y la skill
 * `planificacion` nombra el tope y las dos salidas.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { precheckCommand } from "../packages/cli/src/commands.js";
import { TICKET_TEMPLATE } from "../packages/core/src/index.js";
import { createTicket } from "../packages/engine/src/create.js";
import { runGate } from "../packages/engine/src/gate.js";
import { reviewBeforeGate } from "../packages/engine/src/revision-previa.js";
import type { JevEvaluation } from "../packages/gate-jev/src/index.js";
import { renderFixtureTicket, writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";
const NUEVO = "FEATURE-POS-TAMANO-PLAN-20261011";

let lab: string;
const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-plan-tamano-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});
afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

function configurar(contenido: string): void {
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(join(lab, ".valmen", "config.yaml"), contenido, "utf8");
}

/** Un plan completo con las líneas de tamaño que se le pasen entre «Pasos» y «Rollback». */
function planCon(tamano: readonly string[]): string {
  return [
    "- Gate de plan y aprobación: pendiente",
    ...tamano,
    "- Pasos ordenados:",
    "  1. Cambiar en `BackEnd/pos/filters.py` el `lookup_expr` de `number`.",
    "  2. Añadir en `BackEnd/pos/tests/test_filters.py` una prueba de búsqueda parcial (C1–C4).",
    "- Rollback: revertir el cambio de una línea y retirar las pruebas añadidas.",
  ].join("\n");
}

function revisar(tamano: readonly string[]) {
  const texto = renderFixtureTicket({
    id: TICKET,
    workflowStatus: "planned",
    plan: planCon(tamano),
  });
  return reviewBeforeGate({ root: lab, ticketText: texto, gateId: "plan" });
}

const ids = (tamano: readonly string[]): string[] =>
  revisar(tamano).findings.map((h) => h.id);

/** Un evaluador simulado que cuenta llamadas. */
function espia(): {
  jev: typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
  llamadas: () => number;
} {
  let n = 0;
  const jev = (async (options: { propositions?: readonly { id: string }[] }) => {
    n += 1;
    const answers = (options?.propositions ?? []).map((p) =>
      p.id === "clasificacion"
        ? { id: p.id, kind: "choice" as const, choice: "completo", confidence: 0.95 }
        : { id: p.id, kind: "noul" as const, value: 0.95 },
    );
    return {
      answers,
      model: { provider: "openrouter", model: "jev", resolvedVersion: "jev-1" },
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      latencyMs: 1,
    } as JevEvaluation;
  }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
  return { jev, llamadas: () => n };
}

const EXCEDE = ["- Tamaño previsto: 1 200 líneas (producción y pruebas), 12 criterios."];

describe("la plantilla pide el tamaño y la decisión (C1, C2, C3)", () => {
  it("C1: trae la línea «- Tamaño previsto:» en «## Plan»", () => {
    const plan = TICKET_TEMPLATE.slice(
      TICKET_TEMPLATE.indexOf("## Plan"),
      TICKET_TEMPLATE.indexOf("## Criterios de aceptación"),
    );
    expect(plan).toContain("- Tamaño previsto:");
  });

  it("C2: trae la línea «- Si excede el tope:» en «## Plan»", () => {
    const plan = TICKET_TEMPLATE.slice(
      TICKET_TEMPLATE.indexOf("## Plan"),
      TICKET_TEMPLATE.indexOf("## Criterios de aceptación"),
    );
    expect(plan).toContain("- Si excede el tope:");
  });

  it("C3: un ticket recién creado da marcador_vacio por «Tamaño previsto» en la revisión del plan", () => {
    createTicket({
      paths: PATHS(),
      id: NUEVO,
      title: "Un ticket nuevo trae las líneas de tamaño",
      type: "FEATURE",
      module: "POS",
      request: "Alta que prueba la plantilla con las líneas de tamaño.",
    });
    const texto = readFileSync(join(lab, "tickets", "2026", NUEVO, "ticket.md"), "utf8");
    const r = reviewBeforeGate({ root: lab, ticketText: texto, gateId: "plan" });
    expect(
      r.findings.some(
        (h) => h.id === "marcador_vacio" && h.message.includes("Tamaño previsto"),
      ),
    ).toBe(true);
  });
});

describe("la revisión pide decisión cuando el plan pasa el tope (C4–C12)", () => {
  it("C4: 1 200 líneas contra 400 sin decisión da excede_el_tope_sin_decision", () => {
    expect(ids([...EXCEDE, "- Si excede el tope: pendiente de decidir"])).toContain(
      "excede_el_tope_sin_decision",
    );
  });

  // El tope por defecto subió de 400 a 600 líneas el 2026-10-13 (decisión del PO por AskUserQuestion).
  it("C5: el mensaje nombra las 1200 líneas junto al tope de 600", () => {
    const h = revisar([
      ...EXCEDE,
      "- Si excede el tope: pendiente de decidir",
    ]).findings.find((x) => x.id === "excede_el_tope_sin_decision");
    expect(h?.message).toContain("1200");
    expect(h?.message).toContain("600");
    expect(h?.message).toContain("delivery-budget");
  });

  it("C6: «se parte en dos tickets dependientes» deja la revisión sin hallazgos", () => {
    expect(
      revisar([...EXCEDE, "- Si excede el tope: se parte en dos tickets dependientes"])
        .findings,
    ).toEqual([]);
  });

  it("C7: «sigue: la migración no admite partirse» deja la revisión sin hallazgos", () => {
    expect(
      revisar([...EXCEDE, "- Si excede el tope: sigue: la migración no admite partirse"])
        .findings,
    ).toEqual([]);
  });

  it("C8: 300 líneas contra 400 no pide decisión de partición", () => {
    expect(
      ids([
        "- Tamaño previsto: 300 líneas, 8 criterios.",
        "- Si excede el tope: no excede",
      ]),
    ).not.toContain("excede_el_tope_sin_decision");
  });

  it("C9: con delivery-budget 1000, 900 líneas sin decisión pasan", () => {
    configurar("delivery-budget: 1000\n");
    expect(
      ids([
        "- Tamaño previsto: 900 líneas, 8 criterios.",
        "- Si excede el tope: no excede",
      ]),
    ).not.toContain("excede_el_tope_sin_decision");
  });

  // El tope por defecto subió de 400 a 600 líneas el 2026-10-13 (decisión del PO por AskUserQuestion).
  it("C10: sin delivery-budget, 700 líneas sin decisión dan excede_el_tope_sin_decision", () => {
    expect(
      ids([
        "- Tamaño previsto: 700 líneas, 8 criterios.",
        "- Si excede el tope: pendiente",
      ]),
    ).toContain("excede_el_tope_sin_decision");
  });

  it("C11: una línea de tamaño sin «N líneas» da tamano_sin_lineas", () => {
    expect(ids(["- Tamaño previsto: bastante grande"])).toContain("tamano_sin_lineas");
  });

  it("C12: un plan sin la línea de tamaño no gana hallazgos nuevos", () => {
    const hallazgos = ids([]);
    expect(hallazgos).not.toContain("tamano_sin_lineas");
    expect(hallazgos).not.toContain("excede_el_tope_sin_decision");
    expect(hallazgos).toEqual([]);
  });
});

describe("las puertas de la revisión (C13, C14)", () => {
  const escribir = (): void => {
    writeFixtureTicket(lab, {
      id: TICKET,
      workflowStatus: "planned",
      plan: planCon([...EXCEDE, "- Si excede el tope: pendiente de decidir"]),
    });
  };

  it("C13: precheckCommand de la compuerta plan sale con 3", () => {
    escribir();
    const r = precheckCommand(PATHS(), "plan", TICKET);
    expect(r.exitCode).toBe(3);
    expect(r.stdout).toContain("delivery-budget");
  });

  it("C14: runGate de la compuerta plan no llama al evaluador", async () => {
    escribir();
    const e = espia();
    const r = await runGate(PATHS(), { gateId: "plan", ticketId: TICKET, jev: e.jev });
    expect(r.exitCode).toBe(3);
    expect(e.llamadas()).toBe(0);
  });
});

describe("la skill planificacion (C15–C17)", () => {
  const skill = readFileSync(
    join(__dirname, "..", ".valmen", "skills", "planificacion", "SKILL.md"),
    "utf8",
  );
  const parrafo = skill.slice(skill.indexOf("**Tamaño del plan**"));

  it("C15: nombra delivery-budget", () => {
    expect(parrafo).toContain("delivery-budget");
  });

  it("C16: nombra la opción de partir en tickets dependientes", () => {
    expect(parrafo).toMatch(/partir|se parte/);
    expect(parrafo).toContain("tickets dependientes");
  });

  it("C17: nombra la opción de seguir con motivo escrito", () => {
    expect(parrafo).toMatch(/seguir|sigue/);
    expect(parrafo).toContain("motivo");
  });
});
