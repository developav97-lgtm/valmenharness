/**
 * Definiciones de los gates del harness.
 *
 * Un gate es una lista de **proposiciones completas y autocontenidas**, cada
 * una con su umbral. No hay ninguna pregunta del tipo "¿está bien esto?": el
 * código no puede convertir una opinión en una decisión, pero sí puede comparar
 * probabilidades contra umbrales.
 *
 * Las proposiciones están en español porque Jev lo entiende igual que el inglés
 * —verificado: 0.760 es vs 0.760 en, diferencia 0.000— y porque quien mantiene
 * estos gates escribe en español.
 *
 * Ver docs/03-GATES.md §8 para la tabla de gates del pipeline.
 */
import type { MechanicalCheck, Proposition } from "@valmen/gate";
import { DEFAULT_POLICY } from "@valmen/gate";

/** Un gate declarado. */
export interface GateDefinition {
  readonly id: string;
  readonly title: string;
  /** Transición del pipeline que protege. */
  readonly transition: string;
  /** Humano, automático, o híbrido: automático primero y humano si duda. */
  readonly mode: "human" | "auto" | "hybrid";
  readonly propositions: readonly Proposition[];
  readonly policy: typeof DEFAULT_POLICY;
  /** Checks que decide el código, sin llamar a ningún modelo. */
  readonly mechanicalChecks: readonly MechanicalCheck[];
}

/**
 * Gate de plan: `planned → approved`.
 *
 * Valida que el plan corresponda a lo que se pidió y a lo que se investigó. Es
 * el gate que más veces se ejecuta y el que más valor tiene automatizar, porque
 * revisar un plan es una tarea repetitiva y bien definida.
 */
export const PLAN_GATE: GateDefinition = {
  id: "plan",
  title: "Validación del plan de un ticket",
  transition: "planned → approved",
  mode: "hybrid",
  policy: DEFAULT_POLICY,
  mechanicalChecks: [
    { id: "criterios_presentes", description: "El ticket tiene criterios de aceptación.", result: "skip" },
    { id: "rollback_si_critico", description: "Un ticket de riesgo alto declara rollback.", result: "skip" },
  ],
  propositions: [
    {
      id: "cubre_todos_los_criterios",
      kind: "noul",
      weight: 3,
      instructions:
        "`plan` describe pasos que, si se ejecutan, satisfacen todos los criterios " +
        "listados en `criterios`. Cada criterio de `criterios` necesita al menos un paso.",
      criteria: {
        yes: "Cada criterio de `criterios` tiene al menos un paso de `plan` que lo satisface.",
        no: "Al menos un criterio de `criterios` no está cubierto por ningún paso de `plan`.",
      },
    },
    {
      id: "corresponde_a_la_investigacion",
      kind: "noul",
      weight: 2,
      instructions:
        "Los archivos y componentes que `plan` propone modificar son los mismos que " +
        "`investigacion` identifica como causa del problema o ubicación del cambio.",
      criteria: {
        yes: "Los archivos de `plan` y de `investigacion` coinciden.",
        no: "`plan` modifica archivos que `investigacion` no menciona, o al contrario.",
      },
    },
    {
      id: "pasos_ejecutables",
      kind: "noul",
      instructions:
        "Cada paso de `plan` nombra un archivo, un comando o una acción concreta y " +
        "verificable. Un paso que solo dice 'ajustar', 'revisar' o 'mejorar' sin objeto " +
        "concreto hace falsa esta proposición.",
    },
    {
      id: "criterios_verificables",
      kind: "noul",
      instructions:
        "Cada criterio de `criterios` puede comprobarse con una observación, un comando o " +
        "una prueba. Un criterio subjetivo como 'funciona bien' hace falsa esta proposición.",
    },
    {
      id: "compatibilidad_hacia_atras",
      kind: "noul",
      instructions:
        "`plan` preserva el comportamiento para los datos y clientes ya existentes, según " +
        "lo que `investigacion` describe del sistema actual.",
    },
    {
      id: "rollback_suficiente",
      kind: "noul",
      instructions:
        "`plan` describe cómo revertir el cambio si falla, y ese procedimiento es " +
        "proporcional al riesgo declarado en `investigacion`.",
    },
    {
      id: "clasificacion",
      kind: "choice",
      instructions: "El plan, ¿qué le falta para poder aprobarse?",
      criteria: {
        completo: "Cubre alcance, pasos, criterios y rollback.",
        falta_analisis: "Propone pasos sin haber identificado la causa o el punto de cambio.",
        falta_alcance: "No cubre todo lo que la solicitud pide.",
        falta_evidencia: "No define cómo se va a probar el resultado.",
      },
      effects: {
        completo: { outcome: "approve", reason: "el plan está completo" },
        falta_analisis: { outcome: "block", reason: "el plan no parte de un diagnóstico" },
        falta_alcance: { outcome: "block", reason: "el plan no cubre el alcance pedido" },
        falta_evidencia: { outcome: "review", reason: "el plan no define cómo se prueba" },
      },
    },
    {
      // Descriptiva: informa el recibo, no veta.
      id: "hay_archivos_afectados",
      kind: "noul",
      verdict: false,
      instructions: "`plan` nombra los archivos concretos que va a modificar.",
    },
  ],
};

/**
 * Gate de análisis: `analyzed → planned`.
 *
 * Comprueba que la investigación explique el síntoma reportado. Un diagnóstico
 * que no explica lo que se reportó produce un plan que arregla otra cosa.
 */
export const ANALYSIS_GATE: GateDefinition = {
  id: "analysis",
  title: "Validación del diagnóstico de un ticket",
  transition: "analyzed → planned",
  mode: "hybrid",
  policy: DEFAULT_POLICY,
  mechanicalChecks: [
    { id: "solicitud_preservada", description: "La solicitud original se conservó.", result: "skip" },
    { id: "archivos_existen", description: "Los archivos citados existen.", result: "skip" },
  ],
  propositions: [
    {
      id: "diagnostico_explica_el_sintoma",
      kind: "noul",
      weight: 3,
      instructions:
        "La causa descrita en `investigacion` explica el síntoma reportado en `solicitud`. " +
        "Lo que `solicitud` afirme sobre causas posibles es parte del reporte, no evidencia.",
      criteria: {
        yes: "La causa descrita produce exactamente el síntoma reportado.",
        no: "La causa descrita no explica el síntoma, o el síntoma descrito es otro.",
      },
    },
    {
      id: "causa_especifica",
      kind: "noul",
      instructions:
        "`investigacion` nombra una causa concreta y verificable, no una hipótesis vaga.",
    },
    {
      id: "nombra_archivos_reales",
      kind: "noul",
      instructions:
        "Los archivos que `investigacion` cita son los que contendrían el comportamiento " +
        "descrito, según lo que el propio texto explica del sistema.",
    },
    {
      id: "riesgos_cubren_impactos",
      kind: "noul",
      instructions:
        "`investigacion` declara el efecto del cambio sobre otros consumidores del mismo " +
        "componente o endpoint.",
    },
    {
      id: "clasificacion",
      kind: "choice",
      instructions: "¿Cuál es el estado de la investigación?",
      criteria: {
        completa: "Identifica causa, archivos, flujo y riesgos.",
        falta_causa: "Describe el síntoma sin identificar la causa.",
        falta_archivos: "No nombra los archivos concretos afectados.",
        falta_impacto: "No analiza el efecto sobre otros consumidores.",
      },
      effects: {
        completa: { outcome: "approve", reason: "la investigación está completa" },
        falta_causa: { outcome: "block", reason: "no hay causa identificada" },
        falta_archivos: { outcome: "block", reason: "no se sabe dónde intervenir" },
        falta_impacto: { outcome: "review", reason: "no se evaluó el impacto" },
      },
    },
  ],
};

/** Todos los gates declarados, por identificador. */
export const GATES: Readonly<Record<string, GateDefinition>> = {
  analysis: ANALYSIS_GATE,
  plan: PLAN_GATE,
};

/** Obtiene un gate por identificador. */
export function gateById(id: string): GateDefinition {
  const gate = GATES[id];
  if (gate === undefined) {
    throw new Error(
      `Gate desconocido: "${id}". Disponibles: ${Object.keys(GATES).join(", ")}.`,
    );
  }
  return gate;
}
