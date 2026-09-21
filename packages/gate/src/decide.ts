/**
 * Motor de decisión de gates.
 *
 * Este archivo es el corazón del diseño de gates automáticos, y su regla
 * central es una sola:
 *
 * > **El modelo responde proposiciones. El código decide.**
 *
 * Un gate nunca le pregunta a un modelo si aprueba algo. Le pide hechos
 * verificables —"¿el plan cubre el requisito R3?"— y devuelve una probabilidad.
 * La conversión de esa probabilidad en `approve`, `block` o `review` ocurre
 * aquí, en código determinista con umbrales explícitos.
 *
 * La consecuencia práctica es que cada decisión es explicable y reproducible:
 * "se bloqueó porque `cubre_R3 = 0.08`", no "el modelo dijo que no".
 *
 * Nada de este archivo toca la red. Es lógica pura, y por eso se puede probar
 * sin claves ni conexión.
 *
 * Ver docs/03-GATES.md.
 */

/** Tipos de proposición que un evaluador puede responder. */
export type PropositionKind = "noul" | "choice" | "score";

/** Resultado posible de un gate. */
export type GateOutcome = "approve" | "block" | "review";

/** Quién tomó la decisión. */
export type GateActor = "engine" | "model" | "human";

/** Una proposición booleana: "¿es cierto esto del estado?". */
export interface NoulProposition {
  readonly id: string;
  readonly kind: "noul";
  /** La proposición, completa y autocontenida. */
  readonly instructions: string;
  /** Descripción de los dos polos, para desambiguar. */
  readonly criteria?: { readonly yes: string; readonly no: string };
  /** Peso relativo en la decisión. Por defecto 1. */
  readonly weight?: number;
  /** Solo se evalúa si la condición se cumple sobre el sujeto. */
  readonly when?: string;
  /**
   * `false` si la proposición **solo describe** algo y no emite veredicto.
   *
   * Por defecto `true`. La distinción es necesaria y se descubrió con una
   * llamada real: una proposición como "¿el plan menciona Kubernetes?" es una
   * observación legítima sobre el estado, y si el plan no lo menciona la
   * respuesta correcta es "no". Tratarla como criterio de aprobación haría que
   * un hecho verdadero bloqueara el gate.
   *
   * Una proposición descriptiva se evalúa, se registra en el recibo y se puede
   * combinar en código; simplemente no veta.
   */
  readonly verdict?: boolean;
}

/** Una elección entre opciones, cada una con su efecto sobre la decisión. */
export interface ChoiceProposition {
  readonly id: string;
  readonly kind: "choice";
  readonly instructions: string;
  /** Nombre de la opción → descripción que la separa de las demás. */
  readonly criteria: Readonly<Record<string, string>>;
  /**
   * Efecto de cada opción elegida.
   *
   * Es un mapa explícito y no una convención por nombre: una opción sin efecto
   * declarado fuerza revisión humana en vez de asumir que aprueba.
   */
  readonly effects?: Readonly<Record<string, GateEffect>>;
  readonly when?: string;
  /** `false` si solo describe y no emite veredicto. Ver `NoulProposition`. */
  readonly verdict?: boolean;
}

/** Una posición en una escala ordinal. */
export interface ScoreProposition {
  readonly id: string;
  readonly kind: "score";
  readonly instructions: string;
  /** Niveles ordenados de menor a mayor. El índice es la posición. */
  readonly criteria: readonly string[];
  /**
   * Umbrales por nivel.
   *
   * Se declaran explícitamente porque "un score de 2" no significa nada por sí
   * solo: depende de qué mida la escala. En una escala de riesgo, 2 puede ser
   * aceptable; en una de cobertura, inaceptable.
   */
  readonly levels: Readonly<Record<number, GateEffect>>;
  readonly when?: string;
  /** `false` si solo describe y no emite veredicto. Ver `NoulProposition`. */
  readonly verdict?: boolean;
}

/** Cualquier proposición de un gate. */
export type Proposition =
  NoulProposition | ChoiceProposition | ScoreProposition;

/** Un check que decide el código, sin llamar a ningún modelo. */
export interface MechanicalCheck {
  readonly id: string;
  readonly description: string;
  readonly result: "pass" | "fail" | "warn" | "skip";
  readonly detail?: string;
}

/**
 * Un gate declarado.
 *
 * `appliesTo` es la precondición de estado. Existe porque un gate no debe dar
 * una respuesta plausible a una pregunta que no aplica: se descubrió evaluando
 * el gate de plan sobre un ticket ya cerrado y publicado, donde el resultado
 * parecía una señal sobre el ticket y era una señal sobre el uso.
 */
export interface GateDefinition {
  readonly id: string;
  readonly title: string;
  /** Transición del pipeline que protege. */
  readonly transition: string;
  /** Humano, automático, o híbrido: automático primero y humano si duda. */
  readonly mode: "human" | "auto" | "hybrid";
  /** Estados del ticket en los que este gate tiene sentido. */
  readonly appliesTo: readonly string[];
  readonly propositions: readonly Proposition[];
  readonly policy: GatePolicy;
  readonly mechanicalChecks: readonly MechanicalCheck[];
}

/** Efecto declarado de una respuesta. */
export interface GateEffect {
  readonly outcome: GateOutcome;
  readonly reason?: string;
}

/** Los umbrales que convierten probabilidades en decisiones. */
export interface GatePolicy {
  /** A o por encima de esto, una proposición aprueba. */
  readonly approveAt: number;
  /** A o por debajo de esto, una proposición bloquea. */
  readonly blockAt: number;
}

/**
 * Umbrales por defecto.
 *
 * Deliberadamente separados: la banda intermedia es ancha para que un caso
 * ambiguo llegue a una persona en vez de resolverse por un margen estrecho.
 * La documentación de TypeSafe recomienda exactamente esto.
 */
export const DEFAULT_POLICY: GatePolicy = { approveAt: 0.9, blockAt: 0.1 };

/** Lo que respondió el evaluador para una proposición. */
export interface PropositionAnswer {
  readonly id: string;
  readonly kind: PropositionKind;
  /** Probabilidad, para `noul`. */
  readonly value?: number;
  /** Opción elegida, para `choice`. */
  readonly choice?: string;
  /** Posición, para `score`. Puede caer entre dos niveles. */
  readonly score?: number;
  readonly confidence?: number;
  readonly probabilities?: Readonly<Record<string, number>>;
}

/** Una proposición evaluada, con el detalle que explica la decisión. */
export interface EvaluatedProposition {
  readonly id: string;
  readonly kind: PropositionKind;
  readonly weight: number;
  /** El valor que se comparó contra los umbrales. */
  readonly value: number;
  /** Cómo se llamaba ese valor, para el recibo. */
  readonly label: string;
  readonly inBand: boolean;
  readonly effect: GateEffect | null;
  readonly reason: string;
  /** `false` si la proposición solo describe y no emite veredicto. */
  readonly verdict: boolean;
}

/** La decisión de un gate, con todo lo necesario para auditarla. */
export interface GateDecision {
  readonly outcome: GateOutcome;
  readonly reason: string;
  readonly actor: GateActor;
  readonly propositions: readonly EvaluatedProposition[];
  /** Las proposiciones que impidieron aprobar, si las hay. */
  readonly blocking: readonly string[];
  /** Las que quedaron en la banda media, si las hay. */
  readonly inBand: readonly string[];
}

/** Error de contrato: una proposición mal definida es un gate roto. */
export class GateDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GateDefinitionError";
  }
}

/** Valida los umbrales de una política. */
export function validatePolicy(policy: GatePolicy): void {
  const { approveAt, blockAt } = policy;
  for (const [nombre, valor] of [
    ["approveAt", approveAt],
    ["blockAt", blockAt],
  ] as const) {
    if (
      typeof valor !== "number" ||
      !Number.isFinite(valor) ||
      valor < 0 ||
      valor > 1
    ) {
      throw new GateDefinitionError(
        `${nombre} debe ser un número entre 0 y 1.`,
      );
    }
  }
  if (blockAt >= approveAt) {
    // Sin separación no hay banda media, y sin banda media todo caso ambiguo se
    // resuelve por un margen arbitrario en vez de llegar a una persona.
    throw new GateDefinitionError(
      `blockAt (${blockAt}) debe ser menor que approveAt (${approveAt}): ` +
        "sin separación no hay banda de revisión.",
    );
  }
}

/** `true` si el efecto aprueba. */
function isApprove(effect: GateEffect): boolean {
  return effect.outcome === "approve";
}

/**
 * Decide el resultado de un gate a partir de las respuestas.
 *
 * El algoritmo, en orden:
 *
 * 1. **Un bloqueo tiene veto absoluto.** Cualquier proposición bloqueada —por
 *    efecto explícito de una elección, o por caer bajo el umbral de bloqueo—
 *    decide el gate, sin importar lo que digan las demás. Un solo criterio
 *    incumplido es suficiente para no aprobar.
 * 2. **Si todas las proposiciones con efecto aprueban, el gate aprueba.**
 * 3. **Cualquier otro caso va a revisión humana**, con las proposiciones
 *    responsables identificadas.
 *
 * La asimetría es deliberada: aprobar exige que todo esté claro; bloquear basta
 * con que una cosa esté clara en contra. Es la única forma de que un gate
 * automático sea seguro por defecto.
 */
export function decide(
  propositions: readonly Proposition[],
  answers: readonly PropositionAnswer[],
  policy: GatePolicy = DEFAULT_POLICY,
): GateDecision {
  validatePolicy(policy);

  const byId = new Map(answers.map((answer) => [answer.id, answer]));
  const evaluated: EvaluatedProposition[] = [];

  for (const proposition of propositions) {
    const answer = byId.get(proposition.id);
    if (answer === undefined) {
      throw new GateDefinitionError(
        `El evaluador no respondió la proposición "${proposition.id}". ` +
          "Un gate no puede decidir con información incompleta.",
      );
    }

    if (proposition.kind === "noul") {
      evaluated.push(evaluateNoul(proposition, answer, policy));
    } else if (proposition.kind === "choice") {
      evaluated.push(evaluateChoice(proposition, answer));
    } else {
      evaluated.push(evaluateScore(proposition, answer));
    }
  }

  // Las proposiciones descriptivas se evalúan y se registran, pero no deciden.
  const decides = (item: EvaluatedProposition): boolean => item.verdict;

  const blocking = evaluated.filter(
    (item) => decides(item) && item.effect?.outcome === "block" && !item.inBand,
  );
  if (blocking.length > 0) {
    return {
      outcome: "block",
      reason: blocking.map((item) => item.reason).join("; "),
      actor: "model",
      propositions: evaluated,
      blocking: blocking.map((item) => item.id),
      inBand: [],
    };
  }

  const inBand = evaluated.filter((item) => decides(item) && item.inBand);
  if (inBand.length > 0) {
    return {
      outcome: "review",
      reason: inBand.map((item) => item.reason).join("; "),
      actor: "model",
      propositions: evaluated,
      blocking: [],
      inBand: inBand.map((item) => item.id),
    };
  }

  const notApproving = evaluated.filter(
    (item) => decides(item) && item.effect !== null && !isApprove(item.effect),
  );
  if (notApproving.length > 0) {
    return {
      outcome: "review",
      reason: notApproving.map((item) => item.reason).join("; "),
      actor: "model",
      propositions: evaluated,
      blocking: [],
      inBand: [],
    };
  }

  return {
    outcome: "approve",
    reason: "todas las proposiciones claras",
    actor: "model",
    propositions: evaluated,
    blocking: [],
    inBand: [],
  };
}

/** Evalúa una proposición booleana contra los umbrales. */
function evaluateNoul(
  proposition: NoulProposition,
  answer: PropositionAnswer,
  policy: GatePolicy,
): EvaluatedProposition {
  const value = answer.value;
  if (typeof value !== "number" || value < 0 || value > 1) {
    throw new GateDefinitionError(
      `La proposición "${proposition.id}" esperaba una probabilidad entre 0 y 1 ` +
        `y recibió ${JSON.stringify(value)}.`,
    );
  }

  const weight = proposition.weight ?? 1;
  const formatted = value.toFixed(2);

  if (value <= policy.blockAt) {
    return {
      id: proposition.id,
      kind: "noul",
      weight,
      value,
      label: `${proposition.id}=${formatted}`,
      inBand: false,
      effect: { outcome: "block" },
      reason: `falló ${proposition.id}=${formatted}`,
      verdict: proposition.verdict !== false,
    };
  }

  if (value >= policy.approveAt) {
    return {
      id: proposition.id,
      kind: "noul",
      weight,
      value,
      label: `${proposition.id}=${formatted}`,
      inBand: false,
      effect: { outcome: "approve" },
      reason: `${proposition.id}=${formatted} ✓`,
      verdict: proposition.verdict !== false,
    };
  }

  return {
    id: proposition.id,
    kind: "noul",
    weight,
    value,
    label: `${proposition.id}=${formatted}`,
    inBand: true,
    effect: { outcome: "review" },
    reason:
      `${proposition.id}=${formatted} en banda de revisión ` +
      `(${policy.blockAt}–${policy.approveAt})`,
    verdict: proposition.verdict !== false,
  };
}

/** Evalúa una elección según el efecto declarado de la opción elegida. */
function evaluateChoice(
  proposition: ChoiceProposition,
  answer: PropositionAnswer,
): EvaluatedProposition {
  const choice = answer.choice;
  if (typeof choice !== "string") {
    throw new GateDefinitionError(
      `La proposición "${proposition.id}" esperaba una opción y recibió ` +
        `${JSON.stringify(choice)}.`,
    );
  }
  if (!Object.hasOwn(proposition.criteria, choice)) {
    throw new GateDefinitionError(
      `La proposición "${proposition.id}" recibió la opción "${choice}", ` +
        `que no está entre las declaradas: ${Object.keys(proposition.criteria).join(", ")}.`,
    );
  }

  const effect = proposition.effects?.[choice];
  if (effect === undefined) {
    // Una opción sin efecto declarado no aprueba por omisión: eso convertiría
    // un olvido en el archivo del gate en una aprobación silenciosa.
    return {
      id: proposition.id,
      kind: "choice",
      weight: 1,
      value: answer.confidence ?? 0,
      label: `${proposition.id}=${choice}`,
      inBand: false,
      effect: { outcome: "review" },
      reason: `la opción "${choice}" no declara efecto; requiere revisión`,
      verdict: proposition.verdict !== false,
    };
  }

  return {
    id: proposition.id,
    kind: "choice",
    weight: 1,
    value: answer.confidence ?? 0,
    label: `${proposition.id}=${choice}`,
    inBand: false,
    effect,
    reason: effect.reason ?? `${proposition.id}=${choice}`,
    verdict: proposition.verdict !== false,
  };
}

/**
 * Evalúa una posición en una escala.
 *
 * El `score` puede caer **entre** dos niveles —el modelo devuelve un número, no
 * un índice— así que se compara contra el nivel inmediatamente inferior: una
 * posición de 2.4 se juzga con las reglas del nivel 2. Es la lectura
 * conservadora, porque el nivel 3 sería más permisivo en una escala de
 * cobertura y más grave en una de riesgo.
 */
function evaluateScore(
  proposition: ScoreProposition,
  answer: PropositionAnswer,
): EvaluatedProposition {
  const score = answer.score;
  if (typeof score !== "number" || !Number.isFinite(score)) {
    throw new GateDefinitionError(
      `La proposición "${proposition.id}" esperaba una posición y recibió ` +
        `${JSON.stringify(score)}.`,
    );
  }

  const level = Math.floor(score);
  const effect = proposition.levels[level];

  if (effect === undefined) {
    return {
      id: proposition.id,
      kind: "score",
      weight: 1,
      value: score,
      label: `${proposition.id}=${score}`,
      inBand: false,
      effect: { outcome: "review" },
      reason: `el nivel ${level} no declara efecto; requiere revisión`,
      verdict: proposition.verdict !== false,
    };
  }

  return {
    id: proposition.id,
    kind: "score",
    weight: 1,
    value: score,
    label: `${proposition.id}=${score}`,
    inBand: false,
    effect,
    reason: effect.reason ?? `${proposition.id}=${score} → nivel ${level}`,
    verdict: proposition.verdict !== false,
  };
}

/**
 * Media ponderada de las proposiciones booleanas.
 *
 * Es informativa, para el recibo y para calibrar: la decisión **no** se toma con
 * este número, porque promediar permite que una proposición claramente
 * incumplida quede compensada por otras que van bien. Un gate no debe poder
 * aprobar con un criterio en contra.
 */
export function weightedMean(decision: GateDecision): {
  mean: number;
  totalWeight: number;
} {
  const nouls = decision.propositions.filter((item) => item.kind === "noul");
  const totalWeight = nouls.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return { mean: 0, totalWeight: 0 };
  const weighted = nouls.reduce(
    (sum, item) => sum + item.value * item.weight,
    0,
  );
  return { mean: weighted / totalWeight, totalWeight };
}
