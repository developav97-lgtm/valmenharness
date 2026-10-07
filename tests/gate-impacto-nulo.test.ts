/**
 * Un ticket sin impactos técnicos no baja los riesgos en el gate de análisis
 * ni cae en banda por su ausencia.
 *
 * El caso que lo motivó: dos tickets del 2026-09-28 con «ningún impacto»
 * declarado cayeron en banda con riesgos_cubren_impactos a 0.66 y 0.46 — el
 * evaluador lee la ausencia como cobertura débil, pero la ausencia es legítima.
 * Lo que se protege acá:
 *
 * 1. **Con impactos vacíos la proposición no decide.** Queda en el recibo como
 *    descriptiva (verdict false), sin entrar a la media ni a la banda.
 * 2. **Con al menos un impacto, todo igual que hoy.** El cambio solo dispara
 *    con el conjunto vacío: un ticket con impactos reales no puede esconderlos.
 * 3. **El resto del gate no cambia.** Las otras fijas siguen ponderando y las
 *    señales de redacción conservan su peso.
 */
import { describe, expect, it } from "vitest";

import {
  ANALYSIS_GATE,
  expandGate,
  partitionByApplicability,
  SIN_INTERFAZ,
} from "../packages/gate/src/dynamic.js";
import { decide, DEFAULT_POLICY, type PropositionAnswer } from "../packages/gate/src/decide.js";

const RESPUESTAS = (
  valores: Record<string, number>,
  choices: Record<string, string> = {},
): PropositionAnswer[] => [
  ...Object.entries(valores).map(([id, value]) => ({
    id,
    kind: "noul" as const,
    value,
  })),
  ...Object.entries(choices).map(([id, choice]) => ({
    id,
    kind: "choice" as const,
    choice,
  })),
];

describe("expandGate con el conjunto de impactos vacío", () => {
  it("riesgos_cubren_impactos queda descriptiva: en el recibo, sin banda ni media", () => {
    const expandido = expandGate(ANALYSIS_GATE, {
      criteria: [],
      impacts: [],
      interfaz: SIN_INTERFAZ,
    });
    const riesgos = expandido.propositions.find((p) => p.id === "riesgos_cubren_impactos");
    expect(riesgos).toBeDefined();
    expect(riesgos?.verdict).toBe(false);
    // Las demás fijas siguen votando.
    const sintoma = expandido.propositions.find(
      (p) => p.id === "diagnostico_explica_el_sintoma",
    );
    expect(sintoma?.verdict ?? true).toBe(true);

    // El evaluador contesta la proposición como siempre —la marca no la retira
    // del recibo—, pero su valor no decide: ni banda ni media.
    const veredicto = decide(
      // Lo que se evalúa en un ticket BUGFIX: las proposiciones de otros tipos no se envían.
      partitionByApplicability(expandido.propositions, "BUGFIX").applicable,
      RESPUESTAS({
        diagnostico_explica_el_sintoma: 0.95,
        causa_especifica: 0.94,
        nombra_archivos_reales: 0.95,
        // La respuesta de siempre que empujaba a banda: la ausencia leída como
        // cobertura débil.
        riesgos_cubren_impactos: 0.46,
      }, { clasificacion: "completa" }),
      DEFAULT_POLICY,
    );
    expect(veredicto.outcome).toBe("approve");
    expect(veredicto.inBand).toEqual([]);
    expect(veredicto.propositions.find((p) => p.id === "riesgos_cubren_impactos")?.verdict).toBe(false);
  });

  it("con al menos un impacto declarado la proposición sigue ponderada y su banda intacta", () => {
    const expandido = expandGate(ANALYSIS_GATE, {
      criteria: [],
      impacts: ["sync_impact"],
      interfaz: SIN_INTERFAZ,
    });
    const riesgos = expandido.propositions.find((p) => p.id === "riesgos_cubren_impactos");
    expect(riesgos?.verdict ?? true).toBe(true);
    const veredicto = decide(
      // Lo que se evalúa en un ticket BUGFIX: las proposiciones de otros tipos no se envían.
      partitionByApplicability(expandido.propositions, "BUGFIX").applicable,
      RESPUESTAS({
        diagnostico_explica_el_sintoma: 0.95,
        causa_especifica: 0.94,
        nombra_archivos_reales: 0.95,
        riesgos_cubren_impactos: 0.46,
      }, { clasificacion: "completa" }),
      DEFAULT_POLICY,
    );
    // El comportamiento de hoy se conserva: la banda por la señal débil es lo
    // que manda a revisión, que es correcto cuando SÍ hay impactos que cubrir.
    expect(veredicto.outcome).toBe("review");
    expect(veredicto.inBand).toContain("riesgos_cubren_impactos");
  });

  it("la expansión sin criterios ni impactos conserva el resto de las fijas sin cambio", () => {
    const expandido = expandGate(ANALYSIS_GATE, {
      criteria: [],
      impacts: [],
      interfaz: SIN_INTERFAZ,
    });
    const ids = expandido.propositions.map((p) => p.id);
    expect(ids).toContain("diagnostico_explica_el_sintoma");
    expect(ids).toContain("causa_especifica");
    expect(ids).toContain("nombra_archivos_reales");
    expect(ids).toContain("clasificacion");
  });
});
