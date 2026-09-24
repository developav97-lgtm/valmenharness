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
import type { CommandCheckSpec, GateDefinition, Proposition } from "./decide.js";
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
  return extractCriteriaSpecs(section).map((spec) => spec.text);
}

/**
 * Un criterio de aceptación, con lo que declara sobre cómo se verifica.
 *
 * La anotación es un comentario HTML, que es la forma de escribir metadatos en
 * markdown sin que se vean al leerlo:
 *
 * ```markdown
 * - [ ] El endpoint rechaza cantidades negativas con HTTP 400
 *       <!-- test: npx vitest run tests/api.test.ts -->
 * - [ ] La pantalla muestra el saldo actualizado
 *       <!-- verify: manual -->
 * ```
 *
 * Sin la segunda anotación, un criterio que nadie puede automatizar queda
 * ambiguo, y la ambigüedad se resuelve sola a favor de «seguramente está bien».
 * Declararlo manual no lo hace verificable: lo hace **explícito**.
 */
export interface CriterionSpec {
  /** El texto del criterio, sin la anotación. */
  readonly text: string;
  /** Lo que hay que correr para verificarlo, o `null` si no lo declara. */
  readonly command: string | null;
  /** `true` si declara que se verifica a mano. */
  readonly manual: boolean;
}

/** Las anotaciones que puede llevar un criterio. */
const ANOTACION_RE = /<!--\s*(test|verify)\s*:\s*([\s\S]*?)\s*-->/gi;

/**
 * Los criterios de una sección, con sus anotaciones.
 *
 * La anotación va en la línea del criterio o en la de abajo —como en el ejemplo—
 * porque un criterio con su texto y su comando en el mismo renglón se vuelve
 * ilegible, y lo que se lee es el criterio.
 */
export function extractCriteriaSpecs(section: string): CriterionSpec[] {
  const specs: CriterionSpec[] = [];

  for (const line of section.split("\n")) {
    const sinVineta = line
      .replace(/^\s*(?:[-*+]\s+\[[ xX]\]|\d+[.)]|[-*+]\s+)\s*/, "")
      .trim();
    if (sinVineta === "") continue;

    let command: string | null = null;
    let manual = false;
    const text = sinVineta
      .replace(ANOTACION_RE, (_todo, tipo: string, valor: string) => {
        if (tipo.toLowerCase() === "test") command = valor.trim();
        else manual = true;
        return "";
      })
      .trim();

    // Una línea que solo lleva anotaciones pertenece al criterio de arriba: es la
    // forma en que se escribe, y sin esto la anotación se perdería por corta.
    if (text === "") {
      const anterior = specs[specs.length - 1];
      if (anterior === undefined) continue;
      specs[specs.length - 1] = {
        ...anterior,
        command: command ?? anterior.command,
        manual: manual || anterior.manual,
      };
      continue;
    }

    if (text.length < 12) continue;
    specs.push({ text, command, manual });
  }

  return specs.slice(0, MAX_CRITERIA_PROPOSITIONS);
}

/**
 * Construye la proposición atómica de un criterio.
 *
 * El enunciado pregunta por **ese** criterio y nada más. Incluir el texto del
 * criterio entre comillas evita que el modelo tenga que inferir a cuál se
 * refiere entre todos los del ticket.
 */
export function criterionProposition(index: number, criterion: CriterionSpec): Proposition {
  return {
    id: `criterio_${String(index + 1).padStart(2, "0")}`,
    kind: "noul",
    // Cada criterio pesa igual: el gate exige que todos se cumplan, así que un
    // peso mayor en uno daría a entender que hay criterios opcionales.
    weight: 1,
    // El texto del criterio viaja al recibo: es lo que la pantalla muestra para
    // que un `criterio_03` en banda de revisión se pueda leer sin abrir el ticket.
    description: criterion.text,
    instructions: `Existe en \`plan\` al menos un paso que satisface este criterio: "${criterion.text}"`,
    criteria: {
      yes: "Hay al menos un paso del plan que lo satisface.",
      no: "Ningún paso del plan lo satisface.",
    },
  };
}

/**
 * Los comandos que responden las proposiciones de un gate mecánico.
 *
 * Cada criterio que declara un `test:` se convierte en un comando, y el código de
 * salida decide. Es la aplicación literal de la regla del harness: **lo decidible
 * en código se decide en código**, y un test que ya está escrito no necesita que
 * un modelo opine sobre si pasa.
 *
 * El comando sale del ticket, así que se comprueba contra los prefijos que el
 * proyecto autoriza. Sin eso, escribir un criterio sería escribir una orden
 * arbitraria que el gate ejecuta después, y el agente podría ampliar su propia
 * autoridad a través del artefacto que el gate evalúa —que es justo lo que el
 * harness no permite—.
 */
export function commandChecksFor(
  criteria: readonly CriterionSpec[],
  allowed: readonly string[],
  /**
   * Cuánto se espera a cada comando. Sin esto, una suite dentro de `docker
   * compose` se corta a los 30 segundos y el gate informa un timeout que parece
   * un fallo del comando.
   */
  timeoutMs?: number,
): { readonly checks: readonly CommandCheckSpec[]; readonly refused: readonly string[] } {
  const checks: CommandCheckSpec[] = [];
  const refused: string[] = [];

  criteria.forEach((criterion, index) => {
    if (criterion.command === null) return;
    const proposicion = `criterio_${String(index + 1).padStart(2, "0")}`;
    const partes = partirComando(criterion.command);

    if (partes.length === 0 || !autorizado(partes, allowed)) {
      refused.push(`criterio ${index + 1}: ${criterion.command}`);
      return;
    }

    checks.push({
      propositionId: proposicion,
      command: partes[0] as string,
      args: partes.slice(1),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      description: criterion.text,
    });
  });

  return { checks, refused };
}

/**
 * Parte una línea de comando en programa y argumentos.
 *
 * Se respetan las comillas simples y dobles para que una ruta con espacios sea una
 * sola pieza. **No se interpreta nada más**: no hay shell, así que no hay
 * redirecciones, ni tuberías, ni sustitución de variables. Un comando que las
 * necesite se envuelve en un script del proyecto, que es donde eso se revisa.
 */
function partirComando(linea: string): string[] {
  const partes: string[] = [];
  let actual = "";
  let comilla: string | null = null;

  for (const caracter of linea.trim()) {
    if (comilla !== null) {
      if (caracter === comilla) comilla = null;
      else actual += caracter;
      continue;
    }
    if (caracter === '"' || caracter === "'") {
      comilla = caracter;
      continue;
    }
    if (/\s/.test(caracter)) {
      if (actual !== "") partes.push(actual);
      actual = "";
      continue;
    }
    actual += caracter;
  }
  if (actual !== "") partes.push(actual);
  return partes;
}

/** `true` si el comando empieza con alguno de los prefijos autorizados. */
function autorizado(partes: readonly string[], allowed: readonly string[]): boolean {
  return allowed.some((prefijo) => {
    const esperado = partirComando(prefijo);
    if (esperado.length === 0 || esperado.length > partes.length) return false;
    return esperado.every((pieza, indice) => pieza === partes[indice]);
  });
}

/**
 * Lo que un impacto declarado obliga a responder en el plan.
 *
 * Un ticket que declara impacto de migración y un plan que no dice cómo se
 * revierte no son el mismo riesgo que un bugfix de una línea, y el gate los
 * evaluaba igual: los impactos vivían en el frontmatter y **nunca llegaban al
 * evaluador**. La consecuencia práctica era la peor posible —el registro decía
 * «migración» y la compuerta preguntaba por criterios genéricos—, así que un plan
 * que ignoraba la migración podía aprobarse sin que nadie lo notara.
 *
 * Cada pregunta es atómica y nombra el artefacto que falta, como las de criterio:
 * una proposición compuesta acierta el 7% de las veces y una atómica el 62%. Y no
 * se le pregunta al modelo si el impacto «está bien considerado» —eso no se puede
 * computar— sino por un hecho del plan que sí se puede leer.
 */
const PREGUNTAS_DE_IMPACTO: Readonly<
  Record<
    string,
    {
      readonly description: string;
      readonly instructions: string;
      readonly yes: string;
      readonly no: string;
    }
  >
> = {
  sync_impact: {
    description: "El plan contempla la sincronización",
    instructions:
      "`plan` dice qué pasa con los datos que ya están sincronizados y con los clientes " +
      "que todavía no se actualizaron, dado que el ticket declara impacto de sincronización.",
    yes: "El plan nombra el efecto sobre lo ya sincronizado y sobre los clientes desactualizados.",
    no: "El plan no dice qué pasa con lo ya sincronizado ni con los clientes viejos.",
  },
  migration_impact: {
    description: "El plan contempla la migración",
    instructions:
      "`plan` declara cómo se aplica la migración, en qué orden respecto del despliegue, y " +
      "cómo se revierte, dado que el ticket declara impacto de migración.",
    yes: "El plan dice en qué orden se aplica la migración y cómo se revierte.",
    no: "El plan no dice en qué orden se aplica ni cómo se revierte.",
  },
  docker_impact: {
    description: "El plan contempla los contenedores",
    instructions:
      "`plan` declara qué imagen o contenedor cambia y cómo llega al entorno donde corre, " +
      "dado que el ticket declara impacto sobre los contenedores.",
    yes: "El plan nombra la imagen o el contenedor y cómo se publica.",
    no: "El plan no dice qué imagen cambia ni cómo llega al entorno.",
  },
};

/** El orden canónico de las preguntas: el mismo del contrato. */
const ORDEN_DE_IMPACTOS = ["sync_impact", "migration_impact", "docker_impact"] as const;

/** La proposición atómica de un impacto declarado. */
export function impactProposition(impacto: string): Proposition | null {
  const pregunta = PREGUNTAS_DE_IMPACTO[impacto];
  if (pregunta === undefined) return null;

  return {
    id: impacto,
    kind: "noul",
    weight: 1,
    description: pregunta.description,
    instructions: pregunta.instructions,
    criteria: { yes: pregunta.yes, no: pregunta.no },
  };
}

/**
 * Expande un gate con las proposiciones derivadas del sujeto.
 *
 * Sustituye la proposición compuesta de criterios por una por criterio, **en los
 * gates que lo declaran**. Si el ticket no declara criterios, el gate se devuelve
 * sin cambios: es preferible que falle el check mecánico de criterios presentes a
 * que el gate evalúe una lista vacía y apruebe por vacuidad.
 */
export function expandGate(gate: GateDefinition, context: GateContext): GateDefinition {
  // Las dos expansiones existen por la misma razón —una pregunta compuesta no se
  // puede contestar y una atómica sí—, pero las declara el gate por separado. Un
  // gate que evalúa un artefacto que todavía no existe —el de análisis, que
  // protege `analyzed → planned`— no puede preguntar por pasos del plan, porque el
  // plan es justo lo que ese estado precede. Ver `GateDefinition`.
  const atomicas =
    gate.criteriaPropositions === true
      ? context.criteria.map((criterion, index) => criterionProposition(index, criterion))
      : [];

  // Un gate mecánico no pregunta por los criterios manuales: esos los verifica
  // una persona, y el estado al que este gate da paso es justamente donde lo hace.
  const porComando =
    gate.commandPropositions === true
      ? context.criteria
          .map((criterion, index) => ({ criterion, index }))
          .filter(({ criterion }) => criterion.command !== null)
          .map(({ criterion, index }) => criterionProposition(index, criterion))
      : [];

  // Los impactos se despliegan en el orden del contrato y no en el que lleguen:
  // dos tickets con los mismos impactos tienen que producir el mismo recibo.
  const porImpacto =
    gate.impactPropositions === true
      ? ORDEN_DE_IMPACTOS.filter((impacto) => context.impacts.includes(impacto))
          .map((impacto) => impactProposition(impacto))
          .filter((proposition): proposition is Proposition => proposition !== null)
      : [];

  if (atomicas.length === 0 && porImpacto.length === 0 && porComando.length === 0)
    return gate;

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
    atomicas.length > 0 && proposition.verdict !== false
      ? { ...proposition, verdict: false }
      : proposition,
  );

  const sufijo = [
    atomicas.length > 0 ? "criterios" : "",
    porImpacto.length > 0 ? "impactos" : "",
    porComando.length > 0 ? "mecanico" : "",
  ]
    .filter((parte) => parte !== "")
    .join("+");

  return {
    ...gate,
    id: `${gate.id}+${sufijo}`,
    propositions: [...atomicas, ...porImpacto, ...porComando, ...propositions],
  };
}

/**
 * Contexto del sujeto que un gate puede necesitar para expandirse.
 *
 * Los dos campos son obligatorios a propósito: quien expande un gate tiene que
 * decir qué criterios **y** qué impactos declara el ticket. Dejarlos opcionales
 * haría que un sitio nuevo los omitiera sin que nada lo dijera, y el gate
 * preguntaría de menos en silencio —que es exactamente el defecto que esta
 * expansión existe para cerrar—.
 */
export interface GateContext {
  readonly criteria: readonly CriterionSpec[];
  /** Identificadores del contrato: `sync_impact`, `migration_impact`, `docker_impact`. */
  readonly impacts: readonly string[];
}

/** Obtiene un gate expandido con el contexto del sujeto. */
export function gateFor(gate: GateDefinition, context: GateContext): GateDefinition {
  return expandGate(gate, context);
}

/** Resumen legible de qué proposiciones aporta la expansión. */
export function describeExpansion(base: GateDefinition, expanded: GateDefinition): string {
  const nuevas = expanded.propositions.filter(
    (proposition) => !base.propositions.some((item) => item.id === proposition.id),
  );
  if (nuevas.length === 0)
    return "sin expansión: el sujeto no declara criterios ni impactos";
  return `${nuevas.length} proposición(es) del sujeto, más ${base.propositions.length} fijas`;
}

export { ANALYSIS_GATE, PLAN_GATE, DEFAULT_POLICY };
