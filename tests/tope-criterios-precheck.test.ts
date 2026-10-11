/**
 * El tope de criterios del precheck depende de cuándo se creó el ticket.
 *
 * Desde la vigencia (2026-10-12) un ticket admite 20 afirmaciones en sus criterios; los creados
 * antes conservan 40. Un `created` ausente o ilegible cuenta como ticket nuevo. Todo se decide en
 * código: ninguna prueba llama a un evaluador.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { precheckCommand } from "../packages/cli/src/commands.js";
import {
  TOPE_DE_CRITERIOS,
  TOPE_DE_CRITERIOS_HEREDADO,
  VIGENCIA_DEL_TOPE,
  reviewBeforeGate,
  topeDeCriterios,
} from "../packages/engine/src/revision-previa.js";
import { callTool } from "../packages/mcp/src/tools.js";
import { renderFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "IMPROVEMENT-ENGINE-PRUEBA-TOPE-20261012";
const ARCHIVO = "`packages/engine/src/revision-previa.ts`";
const PLAN = [
  "- Gate de plan y aprobación: pendiente",
  "- Pasos ordenados:",
  `  1. Cambiar en ${ARCHIVO} el tope.`,
  "- Rollback: revertir el commit.",
].join("\n");

let lab: string;
beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-tope-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});
afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

const atomico = (n: number): string =>
  `- [ ] El criterio número ${n} se cumple en la pantalla.\n      <!-- verify: manual -->`;
const compuesto = (n: number): string =>
  `- [ ] El criterio número ${n} se cumple en la pantalla y en el informe.\n      <!-- verify: manual -->`;
const lista = (total: number, compuestos = 0): string =>
  Array.from({ length: total }, (_, i) =>
    i < compuestos ? compuesto(i + 1) : atomico(i + 1),
  ).join("\n");

function texto(
  created: string,
  criterios: string,
  extra: { type?: string; impacts?: string[] } = {},
): string {
  return renderFixtureTicket({
    id: TICKET,
    workflowStatus: "planned",
    plan: PLAN,
    criterios,
    ...(extra.type !== undefined ? { type: extra.type } : {}),
    ...(extra.impacts !== undefined ? { impacts: extra.impacts } : {}),
  }).replace("created: 2026-09-21", `created: ${created}`);
}

const hallazgos = (ticketText: string, gateId = "plan") =>
  reviewBeforeGate({ root: lab, ticketText, gateId }).findings.filter(
    (h) => h.id === "mas_criterios_que_el_tope",
  );

describe("topeDeCriterios según la fecha de creación", () => {
  it("las constantes declaran los dos topes y la vigencia", () => {
    // C1, C2
    expect(TOPE_DE_CRITERIOS).toBe(20);
    expect(TOPE_DE_CRITERIOS_HEREDADO).toBe(40);
    expect(VIGENCIA_DEL_TOPE).toBe("2026-10-12");
  });

  it.each([
    ["C3 igual a la vigencia", "2026-10-12", 20],
    ["C4 posterior a la vigencia", "2026-10-13", 20],
    ["C5 anterior a la vigencia", "2026-10-11", 40],
    ["C6 ausente", undefined, 20],
    ["C6 ilegible", "ayer", 20],
    ["C6 con formato inválido", "2026-9-1", 20],
  ])("%s", (_caso, created, esperado) => {
    expect(topeDeCriterios(created)).toBe(esperado);
  });
});

describe("el precheck del plan aplica el tope que corresponde al ticket", () => {
  it.each([
    // [caso, created, gate, tipo, impactos, atómicos, compuestos, hallazgo, tope citado]
    ["C7 nuevo con 21 atómicos", "2026-10-12", "plan", "BUGFIX", [], 21, 0, true, 20],
    ["C8 nuevo con 20 atómicos", "2026-10-12", "plan", "BUGFIX", [], 20, 0, false, 20],
    ["C9 nuevo con 11 compuestos", "2026-10-12", "plan", "BUGFIX", [], 0, 11, true, 20],
    ["C11 anterior con 40 atómicos", "2026-10-11", "plan", "BUGFIX", [], 40, 0, false, 40],
    ["C12 anterior con 41 atómicos", "2026-10-11", "plan", "BUGFIX", [], 41, 0, true, 40],
    ["C13 SECURITY nuevo con 21", "2026-10-12", "plan", "SECURITY", [], 21, 0, true, 20],
    [
      "C14 migración nueva con 21",
      "2026-10-12",
      "plan",
      "BUGFIX",
      ["migration_impact"],
      21,
      0,
      true,
      20,
    ],
    ["C15 análisis nuevo con 25", "2026-10-12", "analysis", "BUGFIX", [], 25, 0, false, 20],
    ["C16 con created ilegible y 21", "ayer", "plan", "BUGFIX", [], 21, 0, true, 20],
  ] as const)(
    "%s",
    (_caso, created, gate, type, impacts, atomicos, compuestos, hallazgo, tope) => {
      const criterios = lista(atomicos + compuestos, compuestos);
      const encontrados = hallazgos(
        texto(created, criterios, { type, impacts: [...impacts] }),
        gate,
      );
      expect(encontrados).toHaveLength(hallazgo ? 1 : 0);
      if (hallazgo) expect(encontrados[0]?.message).toContain(`el tope de ${tope}`);
    },
  );

  it("C10 partir un criterio compuesto en dos atómicos deja igual la suma informada", () => {
    const junto = [compuesto(1), ...Array.from({ length: 20 }, (_, i) => atomico(i + 2))];
    const partido = [
      atomico(1),
      atomico(1).replace("pantalla", "informe"),
      ...Array.from({ length: 20 }, (_, i) => atomico(i + 2)),
    ];
    const antes = hallazgos(texto("2026-10-12", junto.join("\n")));
    const despues = hallazgos(texto("2026-10-12", partido.join("\n")));
    expect(antes[0]?.message).toContain("22 afirmaciones");
    expect(despues[0]?.message).toContain("22 afirmaciones");
  });
});

describe("las dos entradas a mano dicen lo mismo que el precheck", () => {
  function escribir(): void {
    const dir = join(lab, "tickets", "2026", TICKET);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "ticket.md"), texto("2026-10-12", lista(21)), "utf8");
  }

  it("C18 precheckCommand devuelve código 3 con el tope de 20", () => {
    escribir();
    const r = precheckCommand({ root: lab, ticketsDir: "tickets" }, "plan", TICKET);
    expect(r.exitCode).toBe(3);
    expect(r.stdout).toContain("el tope de 20");
  });

  it("C19 la herramienta MCP revision_previa informa mas_criterios_que_el_tope", async () => {
    escribir();
    const r = await callTool(
      { paths: { root: lab, ticketsDir: "tickets" } },
      "revision_previa",
      { gate: "plan", id: TICKET },
    );
    expect(r.isError).toBe(false);
    expect(r.text).toContain("el tope de 20");
  });
});
