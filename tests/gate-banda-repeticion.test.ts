/**
 * Repetición determinista de recibos con la banda (FEATURE-GATE-POLITICA-BANDA-REVIEW-20261010).
 *
 * La muestra `tests/fixtures/recibos-banda.jsonl` se copió con shell de `.valmen/receipts`:
 * los recibos que la banda cambia, los que tienen una proposición bajo 0,80 y los de
 * control. No prueba que la política no apruebe un plan malo —con cero rechazos humanos
 * no hay medida de eso—: prueba qué decisiones históricas cambian y cuáles no.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { thresholdsCommand } from "../packages/cli/src/commands.js";
import {
  informeDesdeEventos,
  repetirConBanda,
} from "../packages/engine/src/banda-revision.js";
import { currentReceipts } from "../packages/engine/src/receipts.js";
import type { GateReceipt } from "../packages/gate/src/index.js";

const MUESTRA = join(import.meta.dirname, "fixtures", "recibos-banda.jsonl");
const BANDA = { floor: 0.8, maxInBand: 3 };

function recibos(): GateReceipt[] {
  const lineas = readFileSync(MUESTRA, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as GateReceipt);
  return currentReceipts(lineas);
}

const CONTROL_012 = "GR-20261009-FEATURE-WEB-VISTA-LIENZO-20261008-plan-1";
const BLOQUEOS_00 = [
  "GR-20261011-SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010-plan-1",
  "GR-20261011-SECURITY-ADAPTER-DENEGADOS-CODEX-OPENCODE-20261010-plan-2",
];

describe("repetición de la muestra fija", () => {
  const r = repetirConBanda(recibos(), BANDA);

  it("C15 el conteo antes y el conteo después suman lo mismo y difieren en lo que cambió", () => {
    const suma = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(suma(r.antes)).toBe(suma(r.despues));
    expect(r.despues.approve).toBe((r.antes.approve ?? 0) + r.cambios.length);
    expect(r.despues.review).toBe((r.antes.review ?? 0) - r.cambios.length);
  });

  it("C16 ningún recibo cambia desde ni hacia block", () => {
    expect(r.cambios.every((c) => c.de === "review" && c.a === "approve")).toBe(true);
    expect(r.despues.block).toBe(r.antes.block);
    for (const id of BLOQUEOS_00) {
      expect(r.cambios.map((c) => c.id)).not.toContain(id);
    }
  });

  it("C17 lista los recibos que pasan de review a approve, y los 16 con una proposición bajo 0,80 no están", () => {
    const ids = r.cambios.map((c) => c.id);
    expect(ids).toContain(
      "GR-20261009-IMPROVEMENT-ENGINE-CONTEXTO-ORQUESTADOR-20261009-plan-1",
    );
    expect(ids).toContain("GR-20261008-FEATURE-MC-VISTA-MODELOS-EFECTIVOS-20261007-plan-1");
    // El motor no aplica la banda a un SECURITY: la repetición tampoco, y lo cuenta aparte.
    expect(ids).not.toContain(
      "GR-20261011-SECURITY-CLI-PROYECCION-DENEGADOS-20261010-analysis-1",
    );
    expect(r.excluidos).toBeGreaterThanOrEqual(1);
    expect(ids.length).toBeGreaterThanOrEqual(13);
    const bajoPiso = recibos().filter(
      (x) =>
        x.outcome === "review" &&
        x.propositions.some((p) => p.verdict && p.inBand && p.value < 0.8),
    );
    expect(bajoPiso.length).toBeGreaterThanOrEqual(16);
    for (const x of bajoPiso) expect(ids).not.toContain(x.id);
  });

  it("C18 el control con una proposición en 0,12 sigue en review", () => {
    const control = recibos().find((x) => x.id === CONTROL_012);
    expect(control?.propositions.some((p) => p.inBand && p.value === 0.12)).toBe(true);
    expect(r.cambios.map((c) => c.id)).not.toContain(CONTROL_012);
    expect(r.despuesPorId[CONTROL_012]).toBe("review");
  });
});

describe("informe de revisión posterior", () => {
  const aprobado = (ticket: string, tolera: string[]) =>
    ({
      id: `GR-${ticket}-plan-1`,
      gate: "plan",
      outcome: "approve",
      subject: { type: "ticket", id: ticket },
      reviewBand: {
        floor: 0.8,
        maxInBand: 3,
        approvedBy: "P",
        reason: "r",
        tolerated: tolera,
      },
    }) as unknown as GateReceipt;

  it("C19 cuenta los tickets aprobados por banda que volvieron a changes_requested", () => {
    const eventos: Record<string, string[]> = {
      "T-1": ["Workflow: in_progress -> awaiting_user_tests."],
      "T-2": [
        "Workflow: in_progress -> awaiting_user_tests.",
        "Workflow: awaiting_user_tests -> changes_requested.",
      ],
      "T-3": ["Workflow: planned -> approved."],
    };
    const informe = informeDesdeEventos(
      [
        aprobado("T-1", ["x"]),
        aprobado("T-2", ["x"]),
        aprobado("T-3", ["x"]),
        aprobado("T-4", []),
      ],
      (id) => eventos[id] ?? [],
    );
    expect(informe).toMatchObject({ aprobadosPorBanda: 3, entregados: 2, devueltos: 1 });
    expect(informe.suficiente).toBe(false);
  });
});

describe("valmen thresholds --band", () => {
  let lab: string;
  beforeEach(() => {
    lab = mkdtempSync(join(tmpdir(), "valmen-banda-cli-"));
    mkdirSync(join(lab, ".valmen", "receipts"), { recursive: true });
    writeFileSync(
      join(lab, ".valmen", "receipts", "MUESTRA.jsonl"),
      readFileSync(MUESTRA, "utf8"),
      "utf8",
    );
  });
  afterEach(() => rmSync(lab, { recursive: true, force: true }));

  it("C15 muestra el conteo antes junto al conteo después y la lista de cambios", () => {
    const r = thresholdsCommand({ root: lab, ticketsDir: "tickets" }, "plan", {
      band: true,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Antes:.*approve \d+.*review \d+.*block \d+/);
    expect(r.stdout).toMatch(/Después:.*approve \d+.*review \d+.*block \d+/);
    expect(r.stdout).toContain("pasa de review a approve");
  });

  it("regresión: sin --band el comando sigue proponiendo umbrales", () => {
    const r = thresholdsCommand({ root: lab, ticketsDir: "tickets" }, "plan", {});
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain("Después:");
  });
});
