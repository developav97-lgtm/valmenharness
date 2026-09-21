/**
 * Gates dinámicos: proposiciones generadas a partir del sujeto.
 *
 * Un gate de plan no puede tener una proposición fija del tipo "¿el plan cubre
 * todos los criterios?", porque "todos los criterios" es distinto en cada
 * ticket. Y medido, una proposición compuesta acierta el 7% de las veces
 * mientras que las atómicas aciertan el 62%.
 *
 * Lo que se genera, entonces, es **una proposición por criterio**. El motor las
 * combina en código: como el gate exige que todas aprueben, basta con que una
 * quede por debajo del umbral para que el plan no pase. La síntesis ocurre en el
 * código, nunca en el prompt.
 *
 * Ver docs/03-GATES.md §5.1quater.
 */
import type { GateDefinition, Proposition } from "./decide.js";
import { DEFAULT_POLICY } from "./decide.js";
import { ANALYSIS_GATE, PLAN_GATE } from "./definitions.js";

/** Máximo de criterios que se despliegan como proposiciones individuales. */
export const MAX_CRITERIA_PROPOSITIONS = 12;

/**
 * Extrae los criterios de aceptación como ítems individuales.
 *
 * Reconoce las viñetas con casilla —el formato que usa el contrato— y también
 * las numeradas, porque un ticket escrito a mano puede usar cualquiera de las
 * dos. Descarta lo que sea demasiado corto para ser un criterio real.
 */
export function extractCriteria(section: string): string[] {
  return section
    .split("\n")
    .map((line) =>
      line.replace(/^\s*(?:[-*+]\s+\[[ xX]\]|\d+[.)]|[-*+]\s+)\s*/, "").trim(),
    )
    .filter((line) => line.length >= 12)
    .slice(0, MAX_CRITERIA_PROPOSITIONS);
}

/**
 * Construye la proposición atómica de un criterio.
 *
 * El enunciado pregunta por **ese** criterio y nada más. Incluir el texto del
 * criterio entre comillas evita que el modelo tenga que inferir a cuál se
 * refiere entre todos los del ticket.
 */
export function criterionProposition(
  index: number,
  criterion: string,
): Proposition {
  return {
    id: `criterio_${String(index + 1).padStart(2, "0")}`,
    kind: "noul",
    // Cada criterio pesa igual: el gate exige que todos se cumplan, así que un
    // peso mayor en uno daría a entender que hay criterios opcionales.
    weight: 1,
    // El texto del criterio viaja al recibo: es lo que la pantalla muestra para
    // que un `criterio_03` en banda de revisión se pueda leer sin abrir el ticket.
    description: criterion,
    instructions: `Existe en \`plan\` al menos un paso que satisface este criterio: "${criterion}"`,
    criteria: {
      yes: "Hay al menos un paso del plan que lo satisface.",
      no: "Ningún paso del plan lo satisface.",
    },
  };
}

/**
 * Expande un gate con las proposiciones derivadas del sujeto.
 *
 * Sustituye la proposición compuesta de criterios por una por criterio. Si el
 * ticket no declara criterios, el gate se devuelve sin cambios: es preferible
 * que falle el check mecánico de criterios presentes a que el gate evalúe una
 * lista vacía y apruebe por vacuidad.
 */
export function expandGate(
  gate: GateDefinition,
  context: { readonly criteria: readonly string[] },
): GateDefinition {
  if (context.criteria.length === 0) return gate;

  const atomicas = context.criteria.map((criterion, index) =>
    criterionProposition(index, criterion),
  );

  // Cuando el sujeto declara criterios, el veredicto lo dan **las proposiciones
  // atómicas** y las dimensiones fijas pasan a ser descriptivas.
  //
  // Medido sobre 57 tickets reales, después de implementar la descomposición:
  //
  //   atómicas por criterio:  322 observaciones · 27% en banda
  //   fijas con veredicto:    342 observaciones · 62% en banda
  //
  // Y cuatro fijas impedían aprobar en 29 a 57 de los 57 tickets. La razón es
  // que preguntan dimensiones que no aplican a todos los sujetos: un bugfix de
  // una línea no tiene impacto de compatibilidad que analizar, y su plan
  // histórico no nombra archivos porque el contrato no lo exigía entonces.
  //
  // Una proposición que pregunta algo inaplicable no mide calidad: mide la
  // ausencia de una respuesta que nunca se pidió. Se conservan como
  // descriptivas porque su valor es informativo y queda en el recibo.
  const propositions = gate.propositions.map((proposition) =>
    proposition.verdict === false
      ? proposition
      : { ...proposition, verdict: false },
  );

  return {
    ...gate,
    id: `${gate.id}+criterios`,
    propositions: [...atomicas, ...propositions],
  };
}

/** Contexto del sujeto que un gate puede necesitar para expandirse. */
export interface GateContext {
  readonly criteria: readonly string[];
}

/** Obtiene un gate expandido con el contexto del sujeto. */
export function gateFor(
  gate: GateDefinition,
  context: GateContext,
): GateDefinition {
  return expandGate(gate, context);
}

/** Resumen legible de qué proposiciones aporta la expansión. */
export function describeExpansion(
  base: GateDefinition,
  expanded: GateDefinition,
): string {
  const nuevas = expanded.propositions.filter(
    (proposition) =>
      !base.propositions.some((item) => item.id === proposition.id),
  );
  if (nuevas.length === 0)
    return "sin expansión: el sujeto no declara criterios";
  return `${nuevas.length} proposición(es) por criterio, más ${base.propositions.length} fijas`;
}

export { ANALYSIS_GATE, PLAN_GATE, DEFAULT_POLICY };
