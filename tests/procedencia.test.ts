/**
 * De qué feature viene un ticket.
 *
 * El vínculo lo declara la feature y no el ticket, así que encontrarlo es una
 * búsqueda en los grafos del proyecto. Lo que se afirma acá es que esa búsqueda
 * devuelva lo que hace falta para trabajar —el sprint, las dependencias y dónde
 * está la spec—, y que un ticket que no viene de ninguna feature no invente una.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  procedenciaDeTicket,
  renderProcedencia,
} from "../packages/engine/src/provenance.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-procedencia-"));
  const feature = join(lab, ".valmen", "features", "kardex");
  mkdirSync(join(feature, "spec", "inventario"), { recursive: true });
  writeFileSync(
    join(feature, "feature.md"),
    "---\nschema_version: 2\nid: kardex\ntitle: Kardex de inventario\nstate: in_progress\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n",
    "utf8",
  );
  writeFileSync(
    join(feature, "spec", "inventario", "spec.md"),
    "### Requirement: R-INV-001 — El sistema DEBE registrar\n\nTexto.\n",
    "utf8",
  );
  writeFileSync(
    join(feature, "tickets.yaml"),
    [
      "feature: kardex",
      "sprints:",
      "  - id: S1",
      "    goal: Modelo y API",
      "    tickets:",
      "      - id: FEATURE-INVENTARIO-API-20260101",
      "        title: API",
      "        depends_on:",
      "          - FEATURE-INVENTARIO-MODELO-20260101",
      "coverage:",
      "  - requirement: R-INV-001",
      "    covered_by:",
      "      - FEATURE-INVENTARIO-API-20260101",
      "gaps: []",
      "",
    ].join("\n"),
    "utf8",
  );
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("la procedencia de un ticket", () => {
  it("encuentra la feature, el sprint, las dependencias y la spec", () => {
    const procedencia = procedenciaDeTicket(lab, "FEATURE-INVENTARIO-API-20260101");
    expect(procedencia).not.toBeNull();
    expect(procedencia?.slug).toBe("kardex");
    expect(procedencia?.title).toBe("Kardex de inventario");
    expect(procedencia?.sprint).toBe("S1");
    expect(procedencia?.sprintGoal).toBe("Modelo y API");
    expect(procedencia?.dependsOn).toEqual(["FEATURE-INVENTARIO-MODELO-20260101"]);
    expect(procedencia?.domains).toEqual(["inventario"]);

    const texto = renderProcedencia(procedencia!);
    expect(texto).toContain("Feature: kardex — Kardex de inventario");
    expect(texto).toContain("Sprint: S1 — Modelo y API");
    expect(texto).toContain("Depende de: FEATURE-INVENTARIO-MODELO-20260101");
    expect(texto).toContain(".valmen/features/kardex/spec/");
  });

  it("un ticket que no viene de una feature no inventa procedencia", () => {
    expect(procedenciaDeTicket(lab, "BUGFIX-POS-OTRO-20260101")).toBeNull();
  });
});
