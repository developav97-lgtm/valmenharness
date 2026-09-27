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
import type { GateDefinition, Proposition, PropositionAnswer } from "@valmen/gate";
import {
  evaluateWithCommands,
  type CommandCheck,
  isFullyMechanical,
} from "@valmen/gate-command";
import { evaluateWithJev } from "@valmen/gate-jev";
import { evaluateWithJudge } from "@valmen/gate-llm-judge";

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

/** Un eslabón de la cascada, tal como lo resolvió el routing del proyecto. */
export interface CascadeStepOption {
  readonly provider: string;
  readonly model: string;
  readonly effort?: "auto" | "low" | "medium" | "high";
}

/**
 * La cadena de la cascada, resuelta por quien llama.
 *
 * `reason` viaja resuelto desde el routing —que es quien sabe si la cadena sirve—
 * para que el motor no tenga que volver a juzgarla y para que el rechazo diga lo
 * mismo en el CLI, en la pantalla y en el servidor MCP.
 */
export interface CascadeOptions {
  readonly producer: CascadeStepOption;
  readonly verifier: CascadeStepOption;
  readonly escalation: CascadeStepOption;
  /** Por debajo de esto, la respuesta del productor se vuelve a preguntar. */
  readonly threshold?: number;
  /** El motivo por el que la cadena no se puede ejecutar, o `null` si se puede. */
  readonly reason?: string | null;
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
  /** Comandos asociados a proposiciones, si el proyecto los declara. */
  readonly checks?: readonly CommandCheck[];
  readonly root: string;
  /** Evaluador pedido. `auto` decide por las capacidades del gate. */
  readonly evaluator?: EvaluatorId;
  readonly sessionId?: string;
  readonly apiKey?: string;
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

/** Error de selección: no hay ningún evaluador capaz de resolver el gate. */
export class NoEvaluatorError extends Error {
  readonly code = "NO_EVALUATOR";

  constructor(message: string) {
    super(message);
    this.name = "NoEvaluatorError";
  }
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
    return runSemantic(chosen, options);
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
  const parcial = await runSemantic(semantico, {
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
  };
}

/**
 * Comprueba que la cadena de la cascada se pueda ejecutar.
 *
 * Un fallo acá es un error de configuración, no algo que se pueda degradar en
 * silencio a otro evaluador: pedir la cascada y recibir un juez de chat sin
 * decirlo sería cobrar como cascada lo que no lo es.
 */
function exigirCadena(cadena: SelectOptions["cascade"]): asserts cadena is CascadeOptions {
  if (cadena === undefined) {
    throw new NoEvaluatorError(
      "Se pidió el evaluador `cascade` y no se resolvió la cadena. El routing del " +
        "proyecto tiene que declarar los roles producer, verifier y escalation " +
        "—los traen los presets incorporados—, y quien llama tiene que pasarlos.",
    );
  }
  if (cadena.reason !== undefined && cadena.reason !== null) {
    throw new NoEvaluatorError(`La cascada no se puede ejecutar: ${cadena.reason}`);
  }
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
 * La cascada verificada (R-S1-002).
 *
 * Tres pasos y una condición:
 *
 * 1. **El productor responde** todas las proposiciones con su modelo —el barato,
 *    el que el proyecto declara en el rol `producer`—.
 * 2. **El verificador comprueba cada respuesta contra el mismo estado.** No
 *    vuelve a preguntar lo mismo: pregunta, por cada respuesta, si el estado la
 *    respalda. Jev es el único que sirve para esto porque devuelve una
 *    probabilidad calibrada, y por eso el rol `verifier` tiene que apuntar a él.
 * 3. **Se escala lo que no quedó respaldado**, y sólo eso: lo respaldado no se
 *    vuelve a preguntar, así que el modelo caro se paga por lo dudoso y no por el
 *    volumen.
 *
 * El motivo de cada escalamiento —la probabilidad que dio el verificador y el
 * umbral que no alcanzó— vuelve con las respuestas y viaja al recibo: sin él, un
 * recibo de cascada dice que se pagó el modelo caro y no por qué.
 */
async function runCascade(options: SelectOptions): Promise<EvaluationOutcome> {
  exigirCadena(options.cascade);
  const cadena = options.cascade;
  const judge = options.judge ?? evaluateWithJudge;
  const verificar = options.jev ?? evaluateWithJev;
  const umbral = cadena.threshold ?? options.gate.policy.approveAt;

  // Paso 1: producir.
  const produccion = await judge({
    propositions: options.gate.propositions,
    state: options.state,
    model: cadena.producer.model,
    provider: cadena.producer.provider,
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    ...(cadena.producer.effort === undefined || cadena.producer.effort === "auto"
      ? {}
      : { effort: cadena.producer.effort }),
  });

  // Paso 2: verificar. Una proposición por respuesta producida, con el mismo
  // estado congelado que vio el productor: la verificación es sobre si el
  // contexto respalda lo que se respondió, no sobre si la respuesta «suena bien».
  const verificacion = await verificar({
    propositions: options.gate.propositions.map((proposition, indice) =>
      preguntaDeVerificacion(proposition, produccion.answers[indice]),
    ),
    state: options.state,
    model: cadena.verifier.model,
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    sessionId: `${options.sessionId ?? "gate"}:cascada`,
  });

  const respaldadas = new Map(
    verificacion.answers.map((respuesta) => [respuesta.id, respuesta.value ?? 0]),
  );

  // Paso 3: escalar sólo lo que la verificación no respaldó.
  const escaladas = options.gate.propositions.filter(
    (proposition) => (respaldadas.get(verificacionId(proposition.id)) ?? 0) < umbral,
  );

  const escalamiento =
    escaladas.length === 0
      ? null
      : await judge({
          propositions: escaladas,
          state: options.state,
          model: cadena.escalation.model,
          provider: cadena.escalation.provider,
          ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
          ...(cadena.escalation.effort === undefined || cadena.escalation.effort === "auto"
            ? {}
            : { effort: cadena.escalation.effort }),
        });

  // La respuesta final, proposición por proposición: la del productor, salvo las
  // escaladas, que son las que respondió el escalado.
  const respuestasEscaladas = new Map(
    (escalamiento?.answers ?? []).map((respuesta) => [respuesta.id, respuesta]),
  );
  const answers = options.gate.propositions.map((proposition, indice) => {
    const escalada = respuestasEscaladas.get(proposition.id);
    return escalada ?? (produccion.answers[indice] as PropositionAnswer);
  });

  const escalations = escaladas.map((proposition) => {
    const verified = respaldadas.get(verificacionId(proposition.id)) ?? 0;
    return {
      role: "escalation",
      proposition: proposition.id,
      from: { provider: cadena.producer.provider, model: cadena.producer.model },
      to: { provider: cadena.escalation.provider, model: cadena.escalation.model },
      verified,
      threshold: umbral,
      reason:
        `el verificador dio ${verified.toFixed(2)} a la respuesta de «${proposition.id}» ` +
        `y el umbral es ${umbral}: el estado no la respalda, así que se volvió a ` +
        `preguntar a ${cadena.escalation.model}`,
    };
  });

  // El consumo es el de los tres pasos: si se informara sólo el del último, el
  // recibo diría que la cascada cuesta lo que cuesta el escalado, que es
  // exactamente lo contrario de lo que hace.
  const usage = {
    inputTokens:
      produccion.usage.inputTokens +
      verificacion.usage.inputTokens +
      (escalamiento?.usage.inputTokens ?? 0),
    outputTokens:
      produccion.usage.outputTokens +
      verificacion.usage.outputTokens +
      (escalamiento?.usage.outputTokens ?? 0),
    costUsd:
      produccion.usage.costUsd +
      verificacion.usage.costUsd +
      (escalamiento?.usage.costUsd ?? 0),
  };

  return {
    evaluator: "cascade",
    answers,
    // El modelo que se informa es el que respondió lo dudoso: si algo se escaló,
    // el veredicto no lo decidió el modelo barato. El detalle por proposición está
    // en `escalations`, que es donde se puede leer por qué.
    model: escalamiento?.model ?? produccion.model,
    usage,
    latencyMs: produccion.latencyMs + verificacion.latencyMs + (escalamiento?.latencyMs ?? 0),
    escalations,
  };
}

/** El identificador de la proposición con la que se verifica una respuesta. */
function verificacionId(id: string): string {
  return `respaldada_${id}`;
}

/**
 * Traduce una respuesta producida a la proposición que la verifica.
 *
 * Se pregunta por lo que el productor **respondió**, con sus palabras: verificar
 * la proposición original otra vez sería pedir la misma respuesta dos veces y
 * comparar dos opiniones, que es justo lo que la cascada no hace. Lo que se
 * pregunta es si el contexto respalda esa respuesta.
 */
function preguntaDeVerificacion(
  proposition: Proposition,
  respuesta: PropositionAnswer | undefined,
): Proposition {
  const afirmacion =
    respuesta === undefined
      ? "no respondió nada"
      : respuesta.kind === "choice"
        ? `eligió la opción «${respuesta.choice ?? ""}»`
        : respuesta.kind === "score"
          ? `eligió el nivel ${respuesta.score ?? 0}`
          : `respondió que ${(respuesta.value ?? 0) >= 0.5 ? "se cumple" : "no se cumple"}`;

  return {
    id: verificacionId(proposition.id),
    kind: "noul",
    description: `La respuesta del productor para «${proposition.id}» está respaldada por el estado`,
    instructions:
      `La respuesta que se dio a la proposición «${proposition.instructions}» —${afirmacion}— ` +
      "está respaldada por el estado. Lo que el estado no contenga, o contradiga, no la respalda.",
    criteria: {
      yes: "El estado contiene lo que la respuesta afirma.",
      no: "El estado no lo contiene, o lo contradice.",
    },
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
