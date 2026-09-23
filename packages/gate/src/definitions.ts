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
import type { GateDefinition } from "./decide.js";
import { DEFAULT_POLICY } from "./decide.js";

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
  // Este gate evalúa el plan, y el plan es lo que tiene que cubrir los criterios
  // de aceptación: una proposición por criterio es exactamente la pregunta que
  // hay que hacer. El de análisis no las despliega porque protege el estado
  // anterior, donde el plan todavía no existe.
  criteriaPropositions: true,
  // Y una por impacto declarado: el plan de un ticket que toca la migración tiene
  // que decir cómo se revierte, y el de uno que no, no.
  impactPropositions: true,
  // Solo tiene sentido antes de que la transición ocurra. Un ticket ya aprobado
  // o cerrado pasó por aquí, y volver a evaluarlo mide otra cosa.
  appliesTo: ["planned"],
  policy: DEFAULT_POLICY,
  mechanicalChecks: [
    {
      id: "criterios_presentes",
      description: "El ticket tiene criterios de aceptación.",
      result: "skip",
    },
    {
      id: "rollback_si_critico",
      description: "Un ticket de riesgo alto declara rollback.",
      result: "skip",
    },
  ],
  propositions: [
    {
      id: "cubre_todos_los_criterios",
      kind: "noul",
      description: "El plan cubre todos los criterios de aceptación",
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
      description: "El plan responde a lo que dice el diagnóstico",
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
      // La cláusula de falsedad vive en `criteria.false`, no dentro de
      // `instructions`. Ponerla en el enunciado mete el vocabulario del
      // incumplimiento en la pregunta y arrastra la probabilidad hacia abajo:
      // se midió un 0.37 sobre un plan cuyos pasos sí nombran archivo y acción.
      id: "pasos_ejecutables",
      kind: "noul",
      // Lo que se lee en el recibo: sin esto, la proposición aparece
      // solo por su identificador y hay que ir al gate para saber qué pregunta.
      description: "Los pasos son ejecutables tal como están escritos",
      instructions:
        "Cada paso de `plan` nombra un archivo, un comando o una acción concreta.",
      criteria: {
        yes: "Todos los pasos nombran un archivo, un comando o una acción concreta.",
        no: "Al menos un paso dice solo 'ajustar', 'revisar' o 'mejorar' sin objeto concreto.",
      },
    },
    {
      id: "criterios_verificables",
      kind: "noul",
      // Lo que se lee en el recibo: sin esto, la proposición aparece
      // solo por su identificador y hay que ir al gate para saber qué pregunta.
      description: "Los criterios se pueden comprobar sin interpretarlos",
      instructions:
        "Cada criterio de `criterios` puede comprobarse con una observación o una prueba.",
      criteria: {
        yes: "Todos los criterios son observables o ejecutables.",
        no: "Al menos un criterio es subjetivo, como 'funciona bien' o 'queda mejor'.",
      },
    },
    {
      id: "compatibilidad_hacia_atras",
      kind: "noul",
      // Lo que se lee en el recibo: sin esto, la proposición aparece
      // solo por su identificador y hay que ir al gate para saber qué pregunta.
      description: "El cambio no rompe lo que ya funcionaba",
      instructions:
        "`plan` preserva el comportamiento para los datos y clientes ya existentes.",
      criteria: {
        yes: "El plan mantiene el comportamiento actual para los consumidores existentes.",
        no: "El plan cambia el comportamiento de un consumidor existente sin declararlo.",
      },
    },
    {
      id: "rollback_suficiente",
      kind: "noul",
      // Lo que se lee en el recibo: sin esto, la proposición aparece
      // solo por su identificador y hay que ir al gate para saber qué pregunta.
      description: "El rollback deshace el cambio por completo",
      instructions:
        "`plan` describe cómo revertir el cambio si falla, de forma proporcional al riesgo.",
      criteria: {
        yes: "El plan describe un procedimiento concreto para revertir el cambio.",
        no: "El plan no describe cómo revertir, o el procedimiento no es aplicable.",
      },
    },
    {
      id: "clasificacion",
      kind: "choice",
      description: "Qué le falta al plan para poder aprobarse",
      instructions: "El plan, ¿qué le falta para poder aprobarse?",
      criteria: {
        completo: "Cubre alcance, pasos, criterios y rollback.",
        falta_analisis:
          "Propone pasos sin haber identificado la causa o el punto de cambio.",
        falta_alcance: "No cubre todo lo que la solicitud pide.",
        falta_evidencia: "No define cómo se va a probar el resultado.",
      },
      effects: {
        completo: { outcome: "approve", reason: "el plan está completo" },
        falta_analisis: {
          outcome: "block",
          reason: "el plan no parte de un diagnóstico",
        },
        falta_alcance: {
          outcome: "block",
          reason: "el plan no cubre el alcance pedido",
        },
        falta_evidencia: {
          outcome: "review",
          reason: "el plan no define cómo se prueba",
        },
      },
    },
    {
      // Descriptiva: informa el recibo, no veta.
      id: "hay_archivos_afectados",
      kind: "noul",
      description: "El plan nombra los archivos que va a tocar",
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
  // **No** despliega los criterios como proposiciones, y es deliberado. La
  // proposición por criterio pregunta por pasos en `## Plan`, y este gate protege
  // `analyzed → planned`: el plan es justo lo que ese estado precede, así que las
  // cuatro criterios puntuaban 0,03 y bloqueaban un diagnóstico que puntuaba 0,94
  // en sus propias dimensiones. Lo que este gate evalúa es el diagnóstico, y eso
  // es lo que preguntan sus proposiciones fijas.
  criteriaPropositions: false,
  appliesTo: ["analyzed"],
  policy: DEFAULT_POLICY,
  mechanicalChecks: [
    {
      id: "solicitud_preservada",
      description: "La solicitud original se conservó.",
      result: "skip",
    },
    {
      id: "archivos_existen",
      description: "Los archivos citados existen.",
      result: "skip",
    },
  ],
  propositions: [
    {
      id: "diagnostico_explica_el_sintoma",
      kind: "noul",
      description: "El diagnóstico explica por qué ocurre el síntoma",
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
      // Lo que se lee en el recibo: sin esto, la proposición aparece
      // solo por su identificador y hay que ir al gate para saber qué pregunta.
      description: "La causa es concreta y verificable, no una hipótesis vaga",
      instructions: "`investigacion` nombra una causa concreta y verificable.",
      criteria: {
        yes: "La causa está identificada y es comprobable en el código.",
        no: "Solo hay una hipótesis vaga, sin causa identificada.",
      },
    },
    {
      id: "nombra_archivos_reales",
      kind: "noul",
      // Lo que se lee en el recibo: sin esto, la proposición aparece
      // solo por su identificador y hay que ir al gate para saber qué pregunta.
      description: "Los archivos que nombra son los del síntoma",
      instructions:
        "Los archivos que `investigacion` cita son los que contendrían el comportamiento " +
        "descrito, según lo que el propio texto explica del sistema.",
    },
    {
      id: "riesgos_cubren_impactos",
      kind: "noul",
      // Lo que se lee en el recibo: sin esto, la proposición aparece
      // solo por su identificador y hay que ir al gate para saber qué pregunta.
      description: "Los riesgos cubren los impactos declarados",
      instructions:
        "`investigacion` declara el efecto del cambio sobre otros consumidores del mismo " +
        "componente o endpoint.",
    },
    {
      id: "clasificacion",
      kind: "choice",
      description: "En qué estado está la investigación",
      instructions: "¿Cuál es el estado de la investigación?",
      criteria: {
        completa: "Identifica causa, archivos, flujo y riesgos.",
        falta_causa: "Describe el síntoma sin identificar la causa.",
        falta_archivos: "No nombra los archivos concretos afectados.",
        falta_impacto: "No analiza el efecto sobre otros consumidores.",
      },
      effects: {
        completa: {
          outcome: "approve",
          reason: "la investigación está completa",
        },
        falta_causa: { outcome: "block", reason: "no hay causa identificada" },
        falta_archivos: {
          outcome: "block",
          reason: "no se sabe dónde intervenir",
        },
        falta_impacto: { outcome: "review", reason: "no se evaluó el impacto" },
      },
    },
  ],
};

/** Todos los gates declarados, por identificador. */
/**
 * El gate mecánico: lo que ya está escrito no se pregunta.
 *
 * Protege el paso de «implementado» a «listo para que lo pruebe el PO», y su
 * único trabajo es correr los criterios que declaran su test. Es el gate más
 * barato del harness —no gasta una llamada— y el que evita el desperdicio más
 * caro: que alguien se siente a probar algo que ya falla.
 *
 * Los criterios que declaran `verify: manual` no entran: los verifica una persona,
 * y el estado al que este gate da paso es exactamente donde lo hace. Un criterio
 * que no declara ninguna de las dos cosas detiene el gate antes de correr nada,
 * porque la ambigüedad se resuelve sola a favor de «seguramente está bien».
 */
export const QA_MECHANICAL_GATE: GateDefinition = {
  id: "qa-mechanical",
  title: "Verificación mecánica antes de entregar",
  transition: "in_progress → awaiting_user_tests",
  mode: "auto",
  criteriaPropositions: false,
  // Sus proposiciones son los criterios con test, y las contesta el comando.
  commandPropositions: true,
  appliesTo: ["in_progress"],
  policy: DEFAULT_POLICY,
  mechanicalChecks: [
    {
      id: "criterios_presentes",
      description: "El ticket tiene criterios de aceptación.",
      result: "skip",
    },
    {
      id: "sin_secretos",
      description: "El ticket no expone credenciales.",
      result: "skip",
    },
  ],
  // Sin proposiciones fijas: todo lo que este gate decide sale de correr algo.
  propositions: [],
};

export const GATES: Readonly<Record<string, GateDefinition>> = {
  analysis: ANALYSIS_GATE,
  plan: PLAN_GATE,
  "qa-mechanical": QA_MECHANICAL_GATE,
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
