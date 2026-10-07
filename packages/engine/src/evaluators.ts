/**
 * Selección del evaluador de un gate.
 *
 * El principio que gobierna este archivo:
 *
 * > **Lo decidible en código se decide en código.**
 *
 * Un gate que se puede resolver con un script no debe gastar una llamada a un
 * modelo, y un gate que necesita juicio no debe resolverse con un script
 * fingiendo certeza. La selección automática aplica ese orden:
 *
 *   1. `command` — determinista, sin coste, sin red. Si todas las proposiciones
 *      tienen un comando asociado, no hay nada que preguntar a un modelo.
 *   2. `jev` — probabilidades calibradas sobre el endpoint de Decisions.
 *   3. `llm-judge` — un modelo de chat, cuando Jev no está disponible.
 *
 * El fallback de `jev` a `llm-judge` es explícito y no silencioso: el recibo
 * registra qué evaluador se usó, porque una decisión tomada con un juez de chat
 * es más débil que una tomada con probabilidades calibradas y quien la lea tiene
 * que poder saberlo.
 *
 * Ver docs/03-GATES.md §4.
 */
import {
  MAX_CRITERIA_PROPOSITIONS,
  type GateDefinition,
  type Proposition,
  type PropositionAnswer,
} from "@valmen/gate";
import {
  evaluateWithCommands,
  type CommandCheck,
  isFullyMechanical,
} from "@valmen/gate-command";
import { evaluateWithJev } from "@valmen/gate-jev";
import { evaluateWithJudge } from "@valmen/gate-llm-judge";

import {
  exigirCadena,
  NoEvaluatorError,
  verifiedCascade,
  type CascadeOptions,
} from "./cascade.js";

/**
 * La cadena de la cascada y su error de selección viven en `cascade.ts`, que es
 * también quien corre los tres pasos: la corrida de una compuerta y la de una tarea
 * —clasificar, explorar— son la misma, y dos copias divergen justo en el motivo del
 * escalamiento, que es lo que hace auditable el gasto. Se re-exportan acá porque
 * este archivo es el que describe la selección del evaluador.
 */
export { NoEvaluatorError } from "./cascade.js";
export type { CascadeOptions, CascadeStepOption } from "./cascade.js";

/**
 * Identificadores de evaluador soportados.
 *
 * `cascade` es la cascada verificada (R-S1-002): un modelo barato produce, el
 * verificador comprueba cada respuesta contra el mismo estado y sólo lo que no
 * queda respaldado se vuelve a preguntar a un modelo superior. Es opt-in: `auto`
 * **no** lo elige, porque gasta tres llamadas donde los otros gastan una.
 */
export type EvaluatorId = "auto" | "command" | "jev" | "llm-judge" | "cascade";

/**
 * Todos los evaluadores, en el orden en que se aplican.
 *
 * Existe para que los bordes —el CLI y el servidor MCP— no mantengan cada uno su
 * lista escrita a mano: dos listas que crecen por separado es cómo un evaluador
 * queda admitido en un sitio y rechazado en el otro según por dónde se pidió.
 */
export const EVALUATOR_IDS: readonly EvaluatorId[] = [
  "auto",
  "command",
  "jev",
  "llm-judge",
  "cascade",
];

/** `true` si el valor es un evaluador declarado. */
export function isEvaluatorId(value: unknown): value is EvaluatorId {
  return typeof value === "string" && (EVALUATOR_IDS as readonly string[]).includes(value);
}

/** Resultado uniforme de cualquier evaluador. */
export interface EvaluationOutcome {
  /** El evaluador que se usó realmente, no el que se pidió. */
  readonly evaluator: Exclude<EvaluatorId, "auto">;
  readonly answers: readonly import("@valmen/gate").PropositionAnswer[];
  readonly model: {
    readonly provider: string;
    readonly model: string;
    readonly resolvedVersion: string;
  } | null;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly costUsd: number;
  } | null;
  readonly latencyMs: number;
  /**
   * En cuántas llamadas al evaluador semántico se repartió la evaluación.
   *
   * Es 1 con `MAX_CRITERIA_PROPOSITIONS` criterios o menos. Más de 1 significa que
   * el ticket declara más criterios que una tanda: se evaluaron todos, y el recibo
   * lo dice para que ese reparto no sea invisible. Ausente si no hubo evaluador
   * semántico.
   */
  readonly tandas?: number;
  /** Evidencia de los checks mecánicos, si los hubo. */
  readonly commandResults?: readonly import("@valmen/gate-command").CommandCheckResult[];
  /**
   * Los escalamientos entre modelos, si el evaluador fue la cascada.
   *
   * Solo aparecen las proposiciones que se volvieron a preguntar: una lista vacía
   * significa que la verificación respaldó todo y el modelo caro no se llamó.
   */
  readonly escalations?: readonly import("@valmen/gate").EscalationRecord[];
}

/** Opciones de la evaluación. */
export interface SelectOptions {
  readonly gate: GateDefinition;
  readonly state: unknown;
  /**
   * Respuestas que el código ya calculó (R-CPRE-009).
   *
   * Las proposiciones con respuesta precalculada no se envían al evaluador: lo que se
   * puede leer en el texto no se le pregunta a un modelo. Sus respuestas se suman a las
   * demás y votan igual.
   */
  readonly precomputed?: readonly PropositionAnswer[];
  /** Comandos asociados a proposiciones, si el proyecto los declara. */
  readonly checks?: readonly CommandCheck[];
  readonly root: string;
  /** Evaluador pedido. `auto` decide por las capacidades del gate. */
  readonly evaluator?: EvaluatorId;
  readonly sessionId?: string;
  readonly apiKey?: string;
  /** Resuelve la credencial del proveedor de cada rol de una cascada. */
  readonly credentialForProvider?: (provider: string) => string | undefined;
  /** Modelo del rol `gate-evaluator`, resuelto por el routing del proyecto. */
  readonly model?: string;
  /** Proveedor por el que hablar. Sin él, OpenRouter. */
  readonly provider?: string;
  /** Esfuerzo de razonamiento del rol. `auto` no envía preferencia. */
  readonly effort?: "auto" | "low" | "medium" | "high";
  /** Modelo del rol `gate-judge`, para la degradación desde Jev. */
  readonly judgeModel?: string;
  /**
   * Evaluador semántico preferido, si el gate necesita juicio.
   *
   * Viene del routing: si el rol `gate-evaluator` apunta a un modelo de chat, el
   * evaluador semántico es un juez, no Jev. **No** salta el orden "el código
   * primero": un gate que se resuelve con comandos se sigue resolviendo con
   * comandos, porque esa decisión no es de calidad sino de coste y de
   * confiabilidad.
   */
  readonly semantic?: "jev" | "llm-judge";
  /** Inyectables para pruebas. */
  readonly jev?: typeof evaluateWithJev;
  readonly judge?: typeof evaluateWithJudge;
  /**
   * La cadena de la cascada, resuelta por el routing del proyecto.
   *
   * Sin ella, pedir el evaluador `cascade` se rechaza: la cascada no tiene modelos
   * propios —los declara el proyecto, rol por rol— y adivinarlos sería usar el
   * modelo equivocado con el nombre correcto.
   */
  readonly cascade?: CascadeOptions;
}

/**
 * Elige el evaluador que corresponde sin ejecutarlo.
 *
 * Se expone aparte para poder informarlo antes de gastar nada, y para que la
 * configuración pueda mostrarse en la app sin invocar una evaluación.
 */
export function chooseEvaluator(options: {
  readonly gate: GateDefinition;
  readonly checks?: readonly CommandCheck[];
  readonly evaluator?: EvaluatorId;
  readonly semantic?: "jev" | "llm-judge";
}): Exclude<EvaluatorId, "auto"> {
  const checks = options.checks ?? [];
  const pedido = options.evaluator ?? "auto";

  if (pedido !== "auto") {
    // Pedir `command` sin ningún check es un error de configuración, no una
    // petición que se pueda degradar en silencio a otra cosa.
    if (pedido === "command" && checks.length === 0) {
      throw new NoEvaluatorError(
        "Se pidió el evaluador `command` pero no se declaró ningún check. " +
          "Un evaluador determinista sin comandos no puede decidir nada.",
      );
    }
    return pedido;
  }

  // La cobertura se mide sobre las proposiciones **fijas** del gate. Las
  // proposiciones por criterio se generan del sujeto en tiempo de evaluación
  // —una por criterio de aceptación— así que no pueden tener un check estático:
  // son distintas en cada ticket.
  const fijas = options.gate.propositions.filter(
    (proposition) => !proposition.id.startsWith("criterio_"),
  );
  if (fijas.length > 0 && isFullyMechanical(fijas, checks)) return "command";
  if (fijas.length === 0 && checks.length > 0) return "command";
  return options.semantic ?? "jev";
}

/**
 * Ejecuta la evaluación con el evaluador elegido.
 *
 * Si `jev` falla por indisponibilidad —y solo por eso— se degrada a `llm-judge`
 * y se informa. Un fallo de credencial o de contrato no se degrada: significan
 * que hay algo mal configurado y hay que verlo, no taparlo.
 */
export async function evaluateGate(options: SelectOptions): Promise<EvaluationOutcome> {
  const previas = options.precomputed ?? [];
  if (previas.length === 0) return evaluateGateBase(options);

  const ids = new Set(previas.map((respuesta) => respuesta.id));
  const restantes = options.gate.propositions.filter((proposicion) => !ids.has(proposicion.id));
  // Si el código respondió todo, no hay nada que preguntar: ni una llamada ni un céntimo.
  if (restantes.length === 0) {
    return {
      evaluator: "command",
      answers: [...previas],
      model: null,
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      latencyMs: 0,
    };
  }
  const parcial = await evaluateGateBase({
    ...options,
    gate: { ...options.gate, propositions: restantes },
  });
  return { ...parcial, answers: [...previas, ...parcial.answers] };
}

async function evaluateGateBase(options: SelectOptions): Promise<EvaluationOutcome> {
  const checks = options.checks ?? options.gate.commandChecks ?? [];
  const chosen = chooseEvaluator({
    gate: options.gate,
    checks,
    ...(options.evaluator === undefined ? {} : { evaluator: options.evaluator }),
    ...(options.semantic === undefined ? {} : { semantic: options.semantic }),
  });

  // La cascada se comprueba antes de gastar nada: si la cadena que resolvió el
  // routing no se puede ejecutar —mismo modelo de productor y escalado, o un
  // verificador sin probabilidades—, lo que sigue sería una corrida pagada que
  // no verifica nada.
  if (chosen === "cascade") exigirCadena(options.cascade);

  // Un evaluador semántico necesita al menos una proposición que responder. Si
  // un gate declara que el evaluador es de juicio pero no deja nada para juzgar,
  // es un error de configuración.
  if (chosen !== "command" && checks.length === 0) {
    return runSemanticEnTandas(chosen, options);
  }

  // División del trabajo: los comandos responden sus proposiciones y **solo las
  // restantes** se envían al evaluador semántico. Así un gate mixto gasta una
  // sola llamada, con las proposiciones que de verdad necesitan juicio.
  const cubiertas = new Set(checks.map((check) => check.propositionId));
  const outcome = evaluateWithCommands(options.gate.propositions, checks, {
    root: options.root,
  });
  if (outcome.failures.length > 0) {
    throw new NoEvaluatorError(
      "Los siguientes checks no se pudieron ejecutar: " +
        outcome.failures
          .map((failure) => `${failure.propositionId} (${failure.message})`)
          .join("; "),
    );
  }

  const pendientes = options.gate.propositions.filter(
    (proposition) => !cubiertas.has(proposition.id),
  );

  if (pendientes.length === 0) {
    // Todo el gate se resolvió con comandos: ni una llamada, ni un céntimo.
    const duracion = outcome.results.reduce(
      (total, result) => total + result.durationMs,
      0,
    );
    return {
      evaluator: "command",
      answers: outcome.answers,
      model: null,
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      latencyMs: duracion,
      commandResults: outcome.results,
    };
  }

  const semantico = chosen === "command" ? (options.semantic ?? "jev") : chosen;
  const parcial = await runSemanticEnTandas(semantico, {
    ...options,
    gate: { ...options.gate, propositions: pendientes },
  });

  // Las respuestas de los comandos van primero: su orden es el del gate, y el
  // motor busca por identificador, así que el orden no cambia la decisión.
  return {
    ...parcial,
    answers: [...outcome.answers, ...parcial.answers],
    model: parcial.model,
    usage: parcial.usage,
    latencyMs: parcial.latencyMs + outcome.results.reduce((t, r) => t + r.durationMs, 0),
    commandResults: outcome.results,
    ...(parcial.escalations === undefined ? {} : { escalations: parcial.escalations }),
    ...(parcial.tandas === undefined ? {} : { tandas: parcial.tandas }),
  };
}

/**
 * Comprueba que la cadena de la cascada se pueda ejecutar.
 *
 * Un fallo acá es un error de configuración, no algo que se pueda degradar en
 * silencio a otro evaluador: pedir la cascada y recibir un juez de chat sin
 * decirlo sería cobrar como cascada lo que no lo es.
 */
/**
 * Reparte las proposiciones en tandas de a lo sumo `MAX_CRITERIA_PROPOSITIONS`
 * criterios.
 *
 * Las que no son de criterio viajan en la primera, así que un ticket con 12
 * criterios o menos sigue siendo una sola llamada, la de siempre. El tope existe
 * por el costo y la precisión de **una** llamada; no es una razón para dejar
 * criterios sin preguntar.
 */
function partirEnTandas(propositions: readonly Proposition[]): Proposition[][] {
  const criterios = propositions.filter((proposition) => proposition.id.startsWith("criterio_"));
  if (criterios.length <= MAX_CRITERIA_PROPOSITIONS) return [[...propositions]];

  const otras = propositions.filter((proposition) => !proposition.id.startsWith("criterio_"));
  const tandas: Proposition[][] = [];
  for (let desde = 0; desde < criterios.length; desde += MAX_CRITERIA_PROPOSITIONS) {
    const tanda = criterios.slice(desde, desde + MAX_CRITERIA_PROPOSITIONS);
    tandas.push(desde === 0 ? [...otras, ...tanda] : tanda);
  }
  return tandas;
}

/**
 * Ejecuta el evaluador semántico en tantas llamadas como pidan los criterios.
 *
 * Las tandas corren en orden y se suman: las respuestas, los escalamientos, el
 * consumo y la latencia. El modelo que se informa es el de la primera, porque todas
 * usan el mismo.
 */
async function runSemanticEnTandas(
  chosen: "jev" | "llm-judge" | "cascade",
  options: SelectOptions,
): Promise<EvaluationOutcome> {
  const tandas = partirEnTandas(options.gate.propositions);
  if (tandas.length === 1) return { ...(await runSemantic(chosen, options)), tandas: 1 };

  const partes: EvaluationOutcome[] = [];
  for (const propositions of tandas) {
    partes.push(
      await runSemantic(chosen, { ...options, gate: { ...options.gate, propositions } }),
    );
  }

  const primera = partes[0] as EvaluationOutcome;
  const conUso = partes.flatMap((parte) => (parte.usage === null ? [] : [parte.usage]));
  const escalamientos = partes.flatMap((parte) => parte.escalations ?? []);
  return {
    evaluator: primera.evaluator,
    answers: partes.flatMap((parte) => parte.answers),
    model: primera.model,
    usage:
      conUso.length === 0
        ? null
        : {
            inputTokens: conUso.reduce((total, uso) => total + uso.inputTokens, 0),
            outputTokens: conUso.reduce((total, uso) => total + uso.outputTokens, 0),
            costUsd: conUso.reduce((total, uso) => total + uso.costUsd, 0),
          },
    latencyMs: partes.reduce((total, parte) => total + parte.latencyMs, 0),
    ...(partes.some((parte) => parte.escalations !== undefined)
      ? { escalations: escalamientos }
      : {}),
    tandas: tandas.length,
  };
}

/** Ejecuta un evaluador semántico, con la degradación de Jev a juez. */
async function runSemantic(
  chosen: "jev" | "llm-judge" | "cascade",
  options: SelectOptions,
): Promise<EvaluationOutcome> {
  if (chosen === "cascade") {
    return runCascade(options);
  }

  if (chosen === "llm-judge") {
    const judge = options.judge ?? evaluateWithJudge;
    const evaluation = await judge({
      propositions: options.gate.propositions,
      state: options.state,
      ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.provider === undefined ? {} : { provider: options.provider }),
      ...(options.effort === undefined ? {} : { effort: options.effort }),
    });
    return {
      evaluator: "llm-judge",
      answers: evaluation.answers,
      model: evaluation.model,
      usage: evaluation.usage,
      latencyMs: evaluation.latencyMs,
    };
  }

  const jev = options.jev ?? evaluateWithJev;
  try {
    const evaluation = await jev({
      propositions: options.gate.propositions,
      state: options.state,
      ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
      ...(options.model === undefined ? {} : { model: options.model }),
    });
    return {
      evaluator: "jev",
      answers: evaluation.answers,
      model: evaluation.model,
      usage: evaluation.usage,
      latencyMs: evaluation.latencyMs,
    };
  } catch (caught) {
    const error = caught as { code?: string };
    // Solo se degrada por indisponibilidad del servicio. Un fallo de credencial
    // o de contrato no se tapa con otro evaluador: hay que verlo.
    const indisponible = error.code === "SERVER" || error.code === "TRANSPORT";
    if (!indisponible) throw caught;

    const judge = options.judge ?? evaluateWithJudge;
    const evaluation = await judge({
      propositions: options.gate.propositions,
      state: options.state,
      ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      ...(options.judgeModel === undefined ? {} : { model: options.judgeModel }),
      ...(options.effort === undefined ? {} : { effort: options.effort }),
    });
    return {
      evaluator: "llm-judge",
      answers: evaluation.answers,
      model: evaluation.model,
      usage: evaluation.usage,
      latencyMs: evaluation.latencyMs,
    };
  }
}

/**
 * La cascada verificada (R-S1-002), como evaluador de una compuerta.
 *
 * Los tres pasos —produce el modelo barato, el verificador comprueba cada respuesta
 * contra el mismo estado, y sólo lo no respaldado se vuelve a preguntar al modelo
 * superior— viven en `cascade.ts`, porque la corrida de una compuerta y la de una
 * tarea —clasificar, explorar— son la misma. Acá queda lo propio del evaluador: el
 * umbral sale de la política del gate cuando la cadena no lo trae, la sesión se
 * nombra como la del gate, y el consumo y los escalamientos se devuelven en la forma
 * que espera el recibo.
 */
async function runCascade(options: SelectOptions): Promise<EvaluationOutcome> {
  exigirCadena(options.cascade);
  const cadena = options.cascade;

  const corrida = await verifiedCascade({
    propositions: options.gate.propositions,
    state: options.state,
    chain: cadena,
    threshold: cadena.threshold ?? options.gate.policy.approveAt,
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    ...(options.credentialForProvider === undefined
      ? {}
      : { credentialForProvider: options.credentialForProvider }),
    sessionId: options.sessionId ?? "gate",
    ...(options.judge === undefined ? {} : { judge: options.judge }),
    ...(options.jev === undefined ? {} : { jev: options.jev }),
  });

  return {
    evaluator: "cascade",
    answers: corrida.answers,
    model: corrida.model,
    usage: corrida.usage,
    latencyMs: corrida.latencyMs,
    escalations: corrida.escalations,
  };
}

/**
 * Explica por qué se eligió un evaluador.
 *
 * Se muestra antes de evaluar, para que el coste y la calidad de la decisión no
 * sean una sorpresa.
 */
export function explainChoice(options: {
  readonly gate: GateDefinition;
  readonly checks?: readonly CommandCheck[];
  readonly evaluator?: EvaluatorId;
}): string {
  const chosen = chooseEvaluator(options);
  switch (chosen) {
    case "command":
      return (
        "command — todas las proposiciones tienen un comando asociado. " +
        "Determinista, sin coste y sin red."
      );
    case "jev":
      return (
        "jev — el gate necesita juicio semántico. Devuelve probabilidades " +
        "calibradas; ~$0.000008 por proposición."
      );
    case "llm-judge":
      return (
        "llm-judge — un modelo de chat con salida estructurada. Más caro y menos " +
        "fiable que Jev: no devuelve probabilidades, devuelve un booleano con " +
        "confianza declarada."
      );
    case "cascade":
      return (
        "cascade — el modelo barato produce, el verificador comprueba cada respuesta " +
        "contra el mismo estado y sólo lo no respaldado se vuelve a preguntar a un " +
        "modelo superior. Tres llamadas donde los otros gastan una, y el motivo de " +
        "cada escalamiento queda en el recibo."
      );
  }
}
