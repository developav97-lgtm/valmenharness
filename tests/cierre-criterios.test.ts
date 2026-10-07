/**
 * El cierre exige criterios marcados (R-CTRL-004).
 *
 * Un ticket cerrado con un criterio sin marcar afirma dos cosas a la vez: que está
 * aprobado y que hay un criterio que nadie miró. Lo que se afirma:
 *
 * 1. `closed` se rechaza nombrando el criterio sin marcar, salvo «no aplica» con motivo.
 * 2. Un criterio con `test:` que el último recibo de `qa-mechanical` pasó se marca solo, y
 *    uno cuyo texto cambió después del recibo no.
 * 3. Un criterio manual no lo marca el agente: solo con las palabras de quien lo probó.
 * 4. Un ticket de la plantilla anterior, sin casillas, se cierra como siempre.
 *
 * La base es un ticket real ya cerrado (`tests/fixtures/ticket-cerrado-con-criterios.md`),
 * devuelto a `qa_approved` para probar el movimiento a `closed`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  criterionBoxes,
  declaresNotApplicable,
  markFromReceipt,
  markManualCriteria,
  unmarkedCriteria,
} from "../packages/engine/src/criteria-marks.js";
import { transition } from "../packages/engine/src/transition.js";
import type { GateReceipt } from "../packages/gate/src/index.js";
import { renderFixtureTicket } from "./helpers/fixtures.js";

const BASE = readFileSync(new URL("./fixtures/ticket-cerrado-con-criterios.md", import.meta.url), "utf8");
const ID = "BUGFIX-GATE-CONTRADICCION-DESCRIPTIVA-20261005";

let lab: string;
const PATHS = (): { root: string; ticketsDir: string } => ({ root: lab, ticketsDir: "tickets" });
const RUTA = (id = ID): string => join(lab, "tickets", "2026", id, "ticket.md");

/** El ticket base en `qa_approved`, con el texto de sus criterios transformado. */
function preparar(transformar: (criterios: string) => string): void {
  const texto = BASE.replace(/^workflow_status: closed/m, "workflow_status: qa_approved").replace(
    /(## Criterios de aceptación\n\n)([\s\S]*?)(?=\n## )/,
    (_todo, cabecera: string, cuerpo: string) => `${cabecera}${transformar(cuerpo)}`,
  );
  mkdirSync(join(lab, "tickets", "2026", ID), { recursive: true });
  writeFileSync(RUTA(), texto, "utf8");
}

const cerrar = () => transition({ paths: PATHS(), ticketId: ID, entity: "ticket", to: "closed" });

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-cierre-"));
});
afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("cerrar con criterios", () => {
  it("un criterio sin marcar impide cerrar y el error lo nombra", () => {
    preparar((c) => c.replace("- [x]", "- [ ]"));
    expect(cerrar).toThrow(/Falta marcar «Con clasificación completa/);
  });

  it("dice cuántos más faltan", () => {
    preparar((c) => c.replace(/- \[x\]/g, "- [ ]"));
    expect(cerrar).toThrow(/y 2 más/);
  });

  it("con todos marcados cierra", () => {
    preparar((c) => c);
    expect(() => cerrar()).not.toThrow();
  });

  it("un criterio sin marcar que declara «no aplica» con su motivo no impide cerrar", () => {
    preparar((c) =>
      c.replace("- [x] Una proposición requerida", "- [ ] (no aplica: el alcance pasó a otro ticket) Una proposición requerida"),
    );
    expect(() => cerrar()).not.toThrow();
  });

  it("un «no aplica» sin motivo suficiente no basta", () => {
    preparar((c) => c.replace("- [x] Una proposición requerida", "- [ ] (no aplica: x) Una proposición requerida"));
    expect(cerrar).toThrow(/Falta marcar «\(no aplica: x\)/);
  });

  it("un ticket de la plantilla anterior, sin casillas, se cierra como antes", () => {
    preparar(() => "- Un criterio escrito como viñeta, sin casilla.\n- Otro más, también sin casilla.\n");
    expect(unmarkedCriteria(readFileSync(RUTA(), "utf8"))).toEqual([]);
    expect(() => cerrar()).not.toThrow();
  });
});

describe("las casillas", () => {
  it("lee el texto y el estado de cada criterio, con sus líneas de continuación", () => {
    const cajas = criterionBoxes(
      "## Criterios de aceptación\n\n- [x] Uno cumplido\n      <!-- verify: manual -->\n- [ ] Dos que sigue\n      en otra línea\n\n## Puntos\n",
    );
    expect(cajas.map((c) => [c.checked, c.text])).toEqual([
      [true, "Uno cumplido"],
      [false, "Dos que sigue"],
    ]);
    expect(cajas[1]?.full).toBe("Dos que sigue en otra línea");
  });

  it("«no aplica» pide un motivo de al menos ocho caracteres", () => {
    const caja = (texto: string) => criterionBoxes(`## Criterios de aceptación\n\n- [ ] ${texto}\n`)[0]!;
    expect(declaresNotApplicable(caja("Algo. No aplica: cambió el alcance del ticket"))).toBe(true);
    expect(declaresNotApplicable(caja("Algo. No aplica: x"))).toBe(false);
    expect(declaresNotApplicable(caja("Algo sin la declaración"))).toBe(false);
  });
});

describe("marcar desde el recibo de qa-mechanical", () => {
  const TEXTO = renderFixtureTicket({
    id: ID,
    module: "GATE",
    workflowStatus: "in_progress",
    criterios: [
      "- [ ] El filtro encuentra la orden por número parcial.",
      "      <!-- test: node -e 0 -->",
      "- [ ] La pantalla se ve igual que el prototipo aprobado.",
      "      <!-- verify: manual -->",
      "- [ ] El filtro ignora las mayúsculas del número.",
      "      <!-- test: node -e 0 -->",
    ].join("\n"),
  });
  const recibo = (aprobados: Record<string, string>, fallan: string[] = []): GateReceipt =>
    ({
      id: "GR-20261006-X-qa-mechanical-1",
      gate: "qa-mechanical",
      propositions: Object.entries(aprobados).map(([id, description]) => ({
        id,
        kind: "noul",
        description,
        effect: { outcome: fallan.includes(id) ? "block" : "approve", reason: "" },
      })),
    }) as unknown as GateReceipt;

  it("marca el criterio con test: que el recibo pasó y deja el manual sin marcar", () => {
    const r = markFromReceipt(
      TEXTO,
      recibo({
        criterio_01: "El filtro encuentra la orden por número parcial.",
        criterio_03: "El filtro ignora las mayúsculas del número.",
      }),
    );
    expect(r.marked.map((m) => m.index)).toEqual([1, 3]);
    expect(r.text).toContain("- [x] El filtro encuentra la orden por número parcial.");
    expect(r.text).toContain("- [x] El filtro ignora las mayúsculas del número.");
    // El manual no lo marca el agente.
    expect(r.text).toContain("- [ ] La pantalla se ve igual que el prototipo aprobado.");
  });

  it("no marca el criterio que el recibo no pasó", () => {
    const r = markFromReceipt(
      TEXTO,
      recibo(
        { criterio_01: "El filtro encuentra la orden por número parcial.", criterio_03: "El filtro ignora las mayúsculas del número." },
        ["criterio_03"],
      ),
    );
    expect(r.marked.map((m) => m.index)).toEqual([1]);
  });

  it("no marca un criterio cuyo texto cambió después del recibo", () => {
    const r = markFromReceipt(TEXTO, recibo({ criterio_01: "El filtro encuentra la orden por cualquier parte del número." }));
    expect(r.marked).toEqual([]);
    expect(r.text).toBe(TEXTO);
  });

  it("sin recibo no marca nada", () => {
    expect(markFromReceipt(TEXTO, undefined)).toEqual({ text: TEXTO, marked: [] });
  });
});

describe("marcar un criterio manual", () => {
  beforeEach(() => {
    mkdirSync(join(lab, "tickets", "2026", ID), { recursive: true });
    writeFileSync(
      RUTA(),
      renderFixtureTicket({
        id: ID,
        module: "GATE",
        workflowStatus: "in_progress",
        criterios: "- [ ] La pantalla se ve igual que el prototipo aprobado.\n      <!-- verify: manual -->",
      }),
      "utf8",
    );
  });

  it("sin las palabras de quien lo probó no se marca", () => {
    expect(() => markManualCriteria(PATHS(), ID, "   ")).toThrow("palabras literales");
    expect(readFileSync(RUTA(), "utf8")).toContain("- [ ] La pantalla se ve igual");
  });

  it("con las palabras literales queda marcado y el evento las guarda", () => {
    const n = markManualCriteria(PATHS(), ID, "«Lo vi en la sucursal y es igual» — Juan");
    expect(n).toBe(1);
    const texto = readFileSync(RUTA(), "utf8");
    expect(texto).toContain("- [x] La pantalla se ve igual que el prototipo aprobado.");
    expect(texto).toContain("criteria-marked");
    expect(texto).toContain("«Lo vi en la sucursal y es igual» — Juan");
  });

  it("si no hay criterios manuales por marcar no escribe nada", () => {
    markManualCriteria(PATHS(), ID, "ok, conforme");
    expect(markManualCriteria(PATHS(), ID, "ok, conforme")).toBe(0);
  });
});
