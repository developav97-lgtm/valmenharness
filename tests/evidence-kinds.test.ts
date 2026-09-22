/**
 * Cobertura de la normalización de tipos de evidencia.
 *
 * El esquema 1 dejaba `evidence.kind` como texto libre y derivó a 30 valores en
 * 177 entradas. El esquema 2 lo cierra con un enum, pero **no reescribe los
 * valores históricos**: los normaliza al agregar, con la tabla
 * `LEGACY_EVIDENCE_KINDS`.
 *
 * El riesgo real es que la tabla quede incompleta: un valor histórico que no
 * figure en ella se reportaría como "desconocido" y volvería a contar mal, que
 * es exactamente el problema que la tabla existe para resolver. Este test lo
 * impide: recorre los 57 tickets reales y exige que **todos** sus valores
 * normalicen.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseTicket } from "../packages/core/src/parser.js";
import { EVIDENCE_KINDS, normalizeEvidenceKind } from "../packages/core/src/contract.js";

const FIXTURE_ROOT = join(import.meta.dirname, "fixtures", "saicloud", "tickets", "2026");

/** Recolecta todos los `kind` de evidencia del fixture, con su frecuencia. */
function observedKinds(): Map<string, number> {
  const counts = new Map<string, number>();
  const dirs = readdirSync(FIXTURE_ROOT).sort();

  for (const dir of dirs) {
    const text = readFileSync(join(FIXTURE_ROOT, dir, "ticket.md"), "utf8");
    const { blocks } = parseTicket(text);
    for (const entry of blocks.Evidencia) {
      const kind = String(entry["kind"] ?? "");
      if (kind === "") continue;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }

  return counts;
}

describe("normalización de tipos de evidencia", () => {
  const observed = observedKinds();

  it("el fixture contiene los 30 valores históricos documentados", () => {
    // Cifra verificada sobre los tickets de producción. Si cambia, es que el
    // fixture cambió y hay que revisar el análisis.
    expect(observed.size).toBe(30);
  });

  it("todos los valores históricos normalizan a un tipo canónico", () => {
    const unmapped = [...observed.keys()]
      .filter((kind) => normalizeEvidenceKind(kind) === undefined)
      .sort();

    expect(
      unmapped,
      unmapped.length === 0
        ? ""
        : `\n${unmapped.length} valores sin normalizar. Añádalos a ` +
            `LEGACY_EVIDENCE_KINDS en contract.ts:\n  ${unmapped.join("\n  ")}\n`,
    ).toEqual([]);
  });

  it("el enum canónico normaliza a sí mismo", () => {
    for (const kind of EVIDENCE_KINDS) {
      expect(normalizeEvidenceKind(kind), kind).toBe(kind);
    }
  });

  it("un valor inventado no normaliza", () => {
    // La normalización es cerrada: un valor nuevo tiene que ser una decisión
    // explícita, no colarse como si fuera histórico.
    expect(normalizeEvidenceKind("pepito_el_kind")).toBeUndefined();
    expect(normalizeEvidenceKind("")).toBeUndefined();
  });

  it("colapsa las variantes que el esquema 1 dejó dispersas", () => {
    // Los cuatro nombres de "prueba automatizada" que convivían en producción.
    const variants = ["automated", "automated_test", "automated-test", "test"];
    const normalized = new Set(variants.map((variant) => normalizeEvidenceKind(variant)));
    expect([...normalized]).toEqual(["automated-test"]);

    // Y las variantes de revisión de código.
    const reviews = ["code", "code-inspection", "source_review", "source-review", "review"];
    expect(new Set(reviews.map((kind) => normalizeEvidenceKind(kind))).size).toBe(1);
  });

  it("cubre todos los valores que aparecen en los tickets reales", () => {
    // El caso que descubrió que la tabla estaba incompleta: un valor con guion
    // que no figuraba porque el análisis inicial lo contó con guion bajo.
    expect(normalizeEvidenceKind("infrastructure-readonly")).toBe("deployment");
    expect(observed.has("infrastructure-readonly")).toBe(true);
  });
});
