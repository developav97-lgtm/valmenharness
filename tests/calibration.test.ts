/**
 * La calibración de un gate.
 *
 * Es el criterio de aceptación de la Fase 3 y hasta ahora **no se podía medir**:
 * el simulador informaba la distribución de cada proposición y el coste, y no
 * había con qué compararlo. Lo que se protege aquí:
 *
 * 1. **El veredicto humano sale del registro**, no de una suposición. Un ciclo de
 *    QA con `changes_requested` es alguien diciendo «esto no está bien»; un
 *    `closed` solo dice que terminó.
 * 2. **La banda de revisión no cuenta como acierto.** No es una decisión, es una
 *    pregunta, y contarla inflaría el número justo donde el gate no se atrevió.
 * 3. **El falso aprobado es el número que importa**, y sobre todo el crítico: un
 *    gate que bloquea de más cuesta trabajo, uno que aprueba lo que estaba mal
 *    cuesta credibilidad.
 */
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseTicket } from "@valmen/core";
import {
  calibrate,
  humanReferences,
  humanVerdictOf,
  renderCalibration,
} from "@valmen/engine";

import { renderFixtureTicket } from "./helpers/fixtures.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-cal-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

describe("humanVerdictOf", () => {
  it("un ciclo devuelto es un rechazo", () => {
    const referencia = humanVerdictOf(
      parseTicket(
        renderFixtureTicket({ id: "BUGFIX-POS-UNO-20260910" }).replace(
          /## QA\n\n```json\n\[\]\n```/,
          '## QA\n\n```json\n[\n  {"id":"QA-001","date":"2026-09-10","environment":"dev","build_reference":"b","result":"changes_requested","findings":[],"po_confirmation":null,"correction":null}\n]\n```',
        ),
      ),
    );
    expect(referencia.verdict).toBe("rejected");
    expect(referencia.cycles).toEqual(["changes_requested"]);
  });

  it("un ciclo aprobado es una aprobación", () => {
    const referencia = humanVerdictOf(
      parseTicket(
        renderFixtureTicket({ id: "BUGFIX-POS-UNO-20260910" }).replace(
          /## QA\n\n```json\n\[\]\n```/,
          '## QA\n\n```json\n[\n  {"id":"QA-001","date":"2026-09-10","environment":"dev","build_reference":"b","result":"approved","findings":[],"po_confirmation":"ok","correction":null}\n]\n```',
        ),
      ),
    );
    expect(referencia.verdict).toBe("approved");
  });

  it("sin ciclos cerrados no hay veredicto, y no se inventa", () => {
    // Contarlo como acierto inflaría el número y como fallo lo hundiría por casos
    // que el registro no cubre.
    const referencia = humanVerdictOf(
      parseTicket(renderFixtureTicket({ id: "BUGFIX-POS-UNO-20260910" })),
    );
    expect(referencia.verdict).toBe("unknown");
  });

  it("el ciclo abierto no cuenta: no es una decisión", () => {
    const referencia = humanVerdictOf(
      parseTicket(
        renderFixtureTicket({ id: "BUGFIX-POS-UNO-20260910" }).replace(
          /## QA\n\n```json\n\[\]\n```/,
          '## QA\n\n```json\n[\n  {"id":"QA-001","date":"2026-09-10","environment":"dev","build_reference":"commit:' +
            "b".repeat(40) +
            '","result":"pending","findings":[],"po_confirmation":null,"correction":null}\n]\n```',
        ),
      ),
    );
    expect(referencia.verdict).toBe("unknown");
  });

  it("marca el ticket de impacto crítico", () => {
    const conSync = humanVerdictOf(
      parseTicket(
        renderFixtureTicket({ id: "BUGFIX-POS-UNO-20260910" }).replace(
          /^sync_impact: .*$/m,
          "sync_impact: true",
        ),
      ),
    );
    expect(conSync.critical).toBe(true);
    const normal = humanVerdictOf(
      parseTicket(renderFixtureTicket({ id: "BUGFIX-POS-DOS-20260910" })),
    );
    expect(normal.critical).toBe(false);
  });
});

describe("humanReferences", () => {
  /**
   * Se corre sobre los tickets reales del fixture y no sobre sintéticos.
   *
   * Un ticket cerrado tiene que cumplir el contrato entero —ciclos QA en pareja,
   * `qa_status` coherente con el último, intento de cierre coherente, confirmación
   * del PO—, así que fabricarlo a mano acaba probando el fabricante. El fixture ya
   * trae las combinaciones que hacen falta: hay tickets con `changes_requested` y
   * tickets que pasaron limpios.
   */
  function conFixture(): void {
    cpSync(
      join(import.meta.dirname, "fixtures", "saicloud", "tickets"),
      join(lab, "tickets"),
      {
        recursive: true,
      },
    );
  }

  it("lee el veredicto de todo el registro", () => {
    conFixture();
    const referencias = humanReferences(PATHS());
    expect(referencias.size).toBe(57);

    // Un ticket real con una devolución en su historia.
    const rechazado = referencias.get("BUGFIX-ADMIN-USUARIOS-CAJAS-SUCURSAL-20260828")!;
    expect(rechazado.verdict).toBe("rejected");
    expect(rechazado.cycles).toContain("changes_requested");

    // Y otro que pasó sin devoluciones.
    const aprobado = referencias.get("BUGFIX-FE-CARGA-INFINITA-TIMEOUTS-20260917")!;
    expect(aprobado.verdict).toBe("approved");
    expect(aprobado.cycles).not.toContain("changes_requested");
  });

  it("hay veredictos de los dos tipos en el registro", () => {
    // Sin esto, la calibración no mediría nada: un registro con un solo veredicto
    // hace que cualquier gate parezca acertado o equivocado según el caso.
    conFixture();
    const referencias = [...humanReferences(PATHS()).values()];
    expect(referencias.filter((r) => r.verdict === "rejected").length).toBeGreaterThan(0);
    expect(referencias.filter((r) => r.verdict === "approved").length).toBeGreaterThan(0);
  });
});

describe("calibrate", () => {
  const references = new Map([
    ["A", { ticketId: "A", verdict: "approved" as const, cycles: [], critical: false }],
    ["B", { ticketId: "B", verdict: "rejected" as const, cycles: [], critical: false }],
    ["C", { ticketId: "C", verdict: "approved" as const, cycles: [], critical: true }],
    ["D", { ticketId: "D", verdict: "unknown" as const, cycles: [], critical: false }],
  ]);

  it("cuenta la coincidencia sobre los decididos", () => {
    const informe = calibrate(
      "plan",
      [
        { id: "A", outcome: "approve" },
        { id: "B", outcome: "block" },
      ],
      references,
    );
    expect(informe.compared).toBe(2);
    expect(informe.decided).toBe(2);
    expect(informe.agree).toBe(2);
    expect(informe.rate).toBe(1);
    expect(informe.falseApproves).toBe(0);
  });

  it("la banda de revisión no cuenta ni como acierto ni como fallo", () => {
    // No es una decisión, es una pregunta.
    const informe = calibrate(
      "plan",
      [
        { id: "A", outcome: "review" },
        { id: "B", outcome: "block" },
      ],
      references,
    );
    expect(informe.compared).toBe(2);
    expect(informe.decided).toBe(1);
    expect(informe.agree).toBe(1);
    expect(informe.rate).toBe(1);
  });

  it("un veredicto sin referencia humana no se compara", () => {
    const informe = calibrate("plan", [{ id: "D", outcome: "approve" }], references);
    expect(informe.compared).toBe(0);
    expect(informe.unknown).toBe(1);
    // Y sin decisiones no se afirma nada, en vez de decir «0%» o «100%».
    expect(informe.rate).toBeNull();
  });

  it("un ticket que no está en el registro tampoco", () => {
    const informe = calibrate("plan", [{ id: "FANTASMA", outcome: "approve" }], references);
    expect(informe.unknown).toBe(1);
  });

  it("el falso aprobado se cuenta, y el crítico aparte", () => {
    // Es el fallo caro: aprobar lo que una persona devolvió.
    const informe = calibrate(
      "plan",
      [
        { id: "B", outcome: "approve" },
        { id: "C", outcome: "block" },
      ],
      references,
    );
    expect(informe.falseApproves).toBe(1);
    expect(informe.criticalFalseApproves).toBe(0);
    expect(informe.falseBlocks).toBe(1);
    expect(informe.rate).toBe(0);
  });

  it("cuenta como crítico el falso aprobado de un ticket con impacto", () => {
    const conCritico = new Map([
      ["E", { ticketId: "E", verdict: "rejected" as const, cycles: [], critical: true }],
    ]);
    const informe = calibrate("plan", [{ id: "E", outcome: "approve" }], conCritico);
    expect(informe.criticalFalseApproves).toBe(1);
  });
});

describe("renderCalibration", () => {
  const references = new Map([
    ["A", { ticketId: "A", verdict: "approved" as const, cycles: [], critical: false }],
  ]);

  it("dice si cumple los dos umbrales del criterio", () => {
    const texto = renderCalibration(
      calibrate("plan", [{ id: "A", outcome: "approve" }], references),
    );
    expect(texto).toContain("100.0%");
    expect(texto).toContain("✓ Cumple el umbral de coincidencia");
    expect(texto).toContain("✓ Cero falsos aprobados en impacto crítico");
  });

  it("dice cuántos aciertos faltan, en vez de solo fallar", () => {
    const texto = renderCalibration(
      calibrate("plan", [{ id: "A", outcome: "block" }], references),
    );
    expect(texto).toContain("✗ Por debajo del umbral");
    expect(texto).toContain("Faltan 1 acierto(s)");
  });

  it("sin decisiones no afirma nada sobre la coincidencia", () => {
    const texto = renderCalibration(calibrate("plan", [], references));
    expect(texto).toContain("Sin decisiones no se puede afirmar nada");
  });

  it("el detalle marca el falso aprobado", () => {
    const rechazado = new Map([
      ["B", { ticketId: "B", verdict: "rejected" as const, cycles: [], critical: false }],
    ]);
    const texto = renderCalibration(
      calibrate("plan", [{ id: "B", outcome: "approve" }], rechazado),
    );
    expect(texto).toContain("aprobó lo que se devolvió");
  });
});
