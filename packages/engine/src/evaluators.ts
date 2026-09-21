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
import type { GateDefinition } from "@valmen/gate";
import {
  evaluateWithCommands,
  type CommandCheck,
  isFullyMechanical,
} from "@valmen/gate-command";
import { evaluateWithJev } from "@valmen/gate-jev";
import { evaluateWithJudge } from "@valmen/gate-llm-judge";

/** Identificadores de evaluador soportados. */
export type EvaluatorId = "auto" | "command" | "jev" | "llm-judge";

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
export async function evaluateGate(
  options: SelectOptions,
): Promise<EvaluationOutcome> {
  const checks = options.checks ?? options.gate.commandChecks ?? [];
  const chosen = chooseEvaluator({
    gate: options.gate,
    checks,
    ...(options.evaluator === undefined
      ? {}
      : { evaluator: options.evaluator }),
    ...(options.semantic === undefined ? {} : { semantic: options.semantic }),
  });

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
    latencyMs:
      parcial.latencyMs + outcome.results.reduce((t, r) => t + r.durationMs, 0),
    commandResults: outcome.results,
  };
}

/** Ejecuta un evaluador semántico, con la degradación de Jev a juez. */
async function runSemantic(
  chosen: "jev" | "llm-judge",
  options: SelectOptions,
): Promise<EvaluationOutcome> {
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
      ...(options.sessionId === undefined
        ? {}
        : { sessionId: options.sessionId }),
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
  }
}
