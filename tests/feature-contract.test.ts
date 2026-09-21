/**
 * El contrato de una feature.
 *
 * Lo que estos tests protegen es **la regla que hace útil a la feature**: que no
 * se pueda declarar descompuesta una spec con requisitos sin cubrir. Sin esa
 * compuerta, una feature es una carpeta de documentos y la promesa de la spec se
 * pierde al partirla en tickets — que es exactamente el problema que el
 * Spec-Driven Development existe para resolver.
 */
import { describe, expect, it } from "vitest";

import { EXIT_INVARIANT } from "../packages/core/src/errors.js";
import {
  type FeatureDecomposition,
  type FeatureRequirement,
  FEATURE_STATES,
  FEATURE_TRANSITIONS,
  assertDecompositionComplete,
  assertFeatureTransition,
  canTransitionFeature,
  coverageGaps,
  nextFeatureStates,
  validateFeatureFields,
} from "../packages/core/src/feature.js";

const REQUISITOS: FeatureRequirement[] = [
  { id: "R-INV-001", statement: "El sistema DEBE registrar cada movimiento." },
  { id: "R-INV-002", statement: "El ajuste DEBE requerir aprobación." },
  { id: "R-INV-003", statement: "El reporte DEBE exportarse a CSV." },
];

/** Una descomposición completa: los tres requisitos cubiertos por tickets reales. */
function completa(): FeatureDecomposition {
  return {
    sprints: [
      {
        id: "S1",
        goal: "Modelo y API",
        tickets: ["FEATURE-INVENTARIO-MODELO-20260921", "FEATURE-INVENTARIO-API-20260921"],
      },
      {
        id: "S2",
        goal: "Reportes",
        tickets: ["FEATURE-INVENTARIO-REPORTES-20260921"],
      },
    ],
    coverage: [
      { requirement: "R-INV-001", coveredBy: ["FEATURE-INVENTARIO-MODELO-20260921"] },
      { requirement: "R-INV-002", coveredBy: ["FEATURE-INVENTARIO-API-20260921"] },
      { requirement: "R-INV-003", coveredBy: ["FEATURE-INVENTARIO-REPORTES-20260921"] },
    ],
    gaps: [],
  };
}

// ── Máquina de estados ──────────────────────────────────────────────────────

describe("la máquina de estados de una feature", () => {
  it("avanza por la cadena del diseño", () => {
    const cadena = [
      ["draft", "specified"],
      ["specified", "planned"],
      ["planned", "decomposed"],
      ["decomposed", "in_progress"],
      ["in_progress", "complete"],
      ["complete", "archived"],
    ] as const;
    for (const [desde, hacia] of cadena) {
      expect(canTransitionFeature(desde, hacia), `${desde} → ${hacia}`).toBe(true);
    }
  });

  it("no se salta pasos", () => {
    expect(canTransitionFeature("draft", "planned")).toBe(false);
    expect(canTransitionFeature("draft", "decomposed")).toBe(false);
    expect(canTransitionFeature("specified", "in_progress")).toBe(false);
    expect(canTransitionFeature("planned", "complete")).toBe(false);
  });

  it("`archived` es terminal: no tiene salida", () => {
    expect(nextFeatureStates("archived")).toEqual([]);
    expect(canTransitionFeature("archived", "in_progress")).toBe(false);
    expect(canTransitionFeature("archived", "blocked")).toBe(false);
  });

  it("se puede bloquear desde cualquier estado no terminal, y volver", () => {
    for (const estado of FEATURE_STATES) {
      if (estado === "archived" || estado === "blocked") continue;
      expect(canTransitionFeature(estado, "blocked"), estado).toBe(true);
    }
    // Y `blocked` devuelve a los estados de trabajo, no a uno cualquiera.
    expect(nextFeatureStates("blocked")).toContain("decomposed");
    expect(nextFeatureStates("blocked")).toContain("in_progress");
    expect(nextFeatureStates("blocked")).not.toContain("archived");
  });

  it("se puede volver de `decomposed` a `planned` al cambiar el alcance", () => {
    // Sin esta arista, cambiar el alcance obligaría a editar el frontmatter a
    // mano, que es lo que el contrato existe para impedir.
    expect(canTransitionFeature("decomposed", "planned")).toBe(true);
  });

  it("el error dice el estado actual y el pedido, y sale con 3", () => {
    let capturado: unknown;
    try {
      assertFeatureTransition("draft", "in_progress");
    } catch (error) {
      capturado = error;
    }
    expect((capturado as Error).message).toBe(
      "Transición de feature draft -> in_progress no permitida.",
    );
    expect((capturado as { exitCode: number }).exitCode).toBe(EXIT_INVARIANT);
  });
});

// ── La compuerta de cobertura ───────────────────────────────────────────────

describe("la compuerta de descomposición", () => {
  it("una descomposición completa pasa", () => {
    expect(() => assertDecompositionComplete(REQUISITOS, completa())).not.toThrow();
    expect(coverageGaps(REQUISITOS, completa())).toEqual([]);
  });

  it("un requisito sin cobertura la bloquea, y dice cuál y qué pide", () => {
    const incompleta = completa();
    incompleta.coverage.pop();

    const huecos = coverageGaps(REQUISITOS, incompleta);
    expect(huecos).toHaveLength(1);
    expect(huecos[0]?.requirement).toBe("R-INV-003");
    // El enunciado viaja con el identificador: `R-INV-003` no dice nada solo.
    expect(huecos[0]?.statement).toContain("CSV");

    expect(() => assertDecompositionComplete(REQUISITOS, incompleta)).toThrow(
      /R-INV-003/,
    );
  });

  it("un ticket fantasma no cubre nada", () => {
    // La cobertura dice que lo cubre, pero ese ticket no está en ningún sprint:
    // cubre lo mismo que ninguno, y el motor lo detecta.
    const fantasma = completa();
    (fantasma.coverage[2] as { coveredBy: string[] }).coveredBy = [
      "FEATURE-INVENTARIO-INVENTADO-20260921",
    ];

    const huecos = coverageGaps(REQUISITOS, fantasma);
    expect(huecos).toHaveLength(1);
    expect(huecos[0]?.statement).toContain("no está en ningún sprint");
  });

  it("declarar un hueco no es cubrirlo", () => {
    const conHueco = completa();
    (conHueco as { gaps: string[] }).gaps = ["Falta el exportable a PDF"];
    expect(() => assertDecompositionComplete(REQUISITOS, conHueco)).toThrow(
      /huecos declarados: Falta el exportable a PDF/,
    );
  });

  it("una spec sin requisitos pasa: no hay nada que cubrir", () => {
    expect(() => assertDecompositionComplete([], completa())).not.toThrow();
  });

  it("el error explica la regla, no solo que falló", () => {
    const incompleta = completa();
    incompleta.coverage.pop();
    let mensaje = "";
    try {
      assertDecompositionComplete(REQUISITOS, incompleta);
    } catch (error) {
      mensaje = (error as Error).message;
    }
    expect(mensaje).toContain("No se puede pasar a decomposed");
    expect(mensaje).toContain("al menos un ticket en un sprint");
  });
});

// ── Validación del documento ────────────────────────────────────────────────

describe("los campos de una feature", () => {
  const base = {
    id: "modulo-inventario",
    title: "Módulo de inventario",
    state: "draft",
    created: "2026-09-21",
    updated: "2026-09-21",
  };

  it("acepta un slug en minúsculas con guiones", () => {
    expect(() => validateFeatureFields(base)).not.toThrow();
  });

  it("rechaza un identificador que no es slug", () => {
    for (const id of ["Modulo-Inventario", "modulo_inventario", "-modulo", "modulo-"]) {
      expect(() => validateFeatureFields({ ...base, id }), id).toThrow(/slug/);
    }
  });

  it("rechaza un estado que no existe", () => {
    expect(() => validateFeatureFields({ ...base, state: "terminado" })).toThrow(
      /no pertenece al esquema/,
    );
  });

  it("rechaza un título vacío", () => {
    expect(() => validateFeatureFields({ ...base, title: "   " })).toThrow(
      /necesita un título/,
    );
  });

  it("rechaza una fecha que no es ISO", () => {
    expect(() => validateFeatureFields({ ...base, created: "21/09/2026" })).toThrow(
      /YYYY-MM-DD/,
    );
  });

  it("los ocho estados del diseño están declarados", () => {
    expect([...FEATURE_STATES].sort()).toEqual(
      ["archived", "blocked", "complete", "decomposed", "draft", "in_progress", "planned", "specified"],
    );
    for (const estado of FEATURE_STATES) {
      expect(FEATURE_TRANSITIONS[estado], estado).toBeDefined();
    }
  });
});
