/**
 * Evaluador de gates con TypeSafe Jev.
 *
 * Jev no es un modelo de chat: no genera texto. Recibe un estado y preguntas
 * tipadas, y devuelve una probabilidad por pregunta. Eso es exactamente lo que
 * un gate necesita, porque convierte la evaluación en unas pocas comparaciones
 * numéricas que controla el código en vez de otro prompt que hay que parsear.
 *
 * Dos detalles del endpoint que rompen una implementación ingenua:
 *
 * 1. **No se invoca por `/chat/completions`.** Vive en `/api/alpha/decisions`,
 *    separado de la API de chat, y por eso no aparece en el catálogo de modelos.
 * 2. **Todo va en una sola llamada.** Las preguntas se evalúan en paralelo y en
 *    aislamiento contra el mismo estado, así que siete proposiciones cuestan
 *    casi lo mismo que una. La estrategia correcta son muchas proposiciones
 *    atómicas, no una pregunta compuesta.
 *
 * Ver docs/03-GATES.md y docs/99-REFERENCIAS.md §1.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Proposition, PropositionAnswer } from "@valmen/gate";
import { GateDefinitionError } from "@valmen/gate";

/** Endpoint de la API de Decisions. No es la API de chat. */
export const DECISIONS_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";

/** Modelo por defecto. El alias resuelve a una versión concreta en la respuesta. */
export const DEFAULT_JEV_MODEL = "typesafe/jev-1.13";

/** Lo que devuelve una evaluación, con todo lo necesario para el recibo. */
export interface JevEvaluation {
  readonly answers: readonly PropositionAnswer[];
  readonly model: {
    readonly provider: string;
    readonly model: string;
    readonly resolvedVersion: string;
  };
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly costUsd: number;
  };
  readonly latencyMs: number;
}

/** Error de comunicación con el evaluador. */
export class EvaluatorError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "EvaluatorError";
    this.code = code;
  }
}

/**
 * Resuelve la API key de OpenRouter.
 *
 * Orden: la variable de entorno primero, y si no está, el archivo de
 * credenciales. La variable gana porque permite una prueba puntual sin escribir
 * el secreto en disco.
 *
 * El valor **nunca** se registra, se imprime ni se incluye en un mensaje de
 * error. Un diagnóstico que filtra la credencial que intentaba leer es peor que
 * no tener diagnóstico.
 */
export function resolveApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env["OPENROUTER_API_KEY"];
  if (typeof fromEnv === "string" && fromEnv.trim() !== "")
    return fromEnv.trim();

  const credentialsPath = join(homedir(), ".valmen", ".credentials.yaml");
  let text: string;
  try {
    text = readFileSync(credentialsPath, "utf8");
  } catch {
    throw new EvaluatorError(
      "No hay API key de OpenRouter. Exporte OPENROUTER_API_KEY o ponga la clave " +
        `en ${credentialsPath}.`,
      "CREDENTIAL_MISSING",
    );
  }

  // Análisis deliberadamente simple: se busca el bloque del proveedor y su
  // campo `api-key`. No se usa el parser de configuración porque este archivo
  // contiene secretos y no debe pasar por estructuras que puedan acabar en un
  // mensaje de error.
  const openrouter = /openrouter:\s*\n((?:[ \t]+.*\n)*)/.exec(text);
  if (openrouter === null) {
    throw new EvaluatorError(
      "El archivo de credenciales no tiene un bloque `openrouter`.",
      "CREDENTIAL_MISSING",
    );
  }

  // Se aceptan los dos nombres de campo. `api-key` es el correcto, pero una
  // versión anterior de la plantilla se llamaba `api-key-env` y sugería una
  // indirección que no existía; hay archivos en uso con ese nombre y con el
  // valor literal dentro, así que rechazarlos sería romper una configuración
  // válida por un detalle de nomenclatura ya corregido.
  const block = openrouter[1] as string;
  const key = /^[ \t]+api-key(?:-env)?:[ \t]*["']?([^"'\n]+)["']?[ \t]*$/m.exec(
    block,
  );
  const value = key?.[1]?.trim();

  if (value === undefined || value === "") {
    const tieneCampo = /^[ \t]+api-key(?:-env)?:/m.test(block);
    throw new EvaluatorError(
      tieneCampo
        ? "El bloque `openrouter` del archivo de credenciales tiene el campo de clave vacío."
        : "El bloque `openrouter` del archivo de credenciales no declara `api-key`.",
      "CREDENTIAL_MISSING",
    );
  }

  // Un nombre de variable de entorno pegado por descuido no es una clave: si el
  // valor parece un identificador en mayúsculas, se avisa en vez de enviarlo y
  // recibir un 401 confuso.
  if (/^[A-Z][A-Z0-9_]{6,}$/.test(value)) {
    throw new EvaluatorError(
      `El campo de clave del bloque \`openrouter\` contiene "${value}", que parece el ` +
        "NOMBRE de una variable de entorno y no una clave. Ponga el valor literal " +
        "(empieza por sk-or-v1-) o exporte esa variable.",
      "CREDENTIAL_MISSING",
    );
  }

  return value;
}

/** Traduce una proposición al formato de pregunta de la API. */
function toQuestion(proposition: Proposition): Record<string, unknown> {
  if (proposition.kind === "noul") {
    const question: Record<string, unknown> = {
      type: "noul",
      instructions: proposition.instructions,
    };
    // Describir los dos polos desambigua una proposición que de otro modo
    // quedaría en la banda media por vaguedad, no por duda real.
    if (proposition.criteria !== undefined) {
      question["criteria"] = {
        true: proposition.criteria.yes,
        false: proposition.criteria.no,
      };
    }
    return question;
  }

  if (proposition.kind === "choice") {
    // `criteria` de una elección es un MAPA: clave = opción, valor = descripción.
    return {
      type: "choice",
      instructions: proposition.instructions,
      criteria: { ...proposition.criteria },
    };
  }

  // `criteria` de una escala es un ARRAY ORDENADO de menor a mayor. El nivel es
  // la posición, empezando en 0.
  if (proposition.criteria.length === 0) {
    throw new GateDefinitionError(
      `La proposición de escala "${proposition.id}" no declara niveles.`,
    );
  }
  return {
    type: "score",
    instructions: proposition.instructions,
    criteria: [...proposition.criteria],
  };
}

/** Normaliza la respuesta de la API al contrato interno. */
function toAnswer(proposition: Proposition, raw: unknown): PropositionAnswer {
  if (typeof raw !== "object" || raw === null) {
    throw new EvaluatorError(
      `El evaluador no devolvió una respuesta válida para "${proposition.id}".`,
      "MALFORMED_RESPONSE",
    );
  }
  const answer = raw as Record<string, unknown>;
  const probabilities =
    typeof answer["probabilities"] === "object" &&
    answer["probabilities"] !== null
      ? (answer["probabilities"] as Record<string, number>)
      : undefined;

  if (proposition.kind === "noul") {
    const value = answer["noul"];
    if (typeof value !== "number" || value < 0 || value > 1) {
      throw new EvaluatorError(
        `La proposición "${proposition.id}" esperaba una probabilidad entre 0 y 1 y ` +
          `recibió ${JSON.stringify(value)}.`,
        "MALFORMED_RESPONSE",
      );
    }
    return { id: proposition.id, kind: "noul", value };
  }

  if (proposition.kind === "choice") {
    const choice = answer["choice"];
    if (typeof choice !== "string") {
      throw new EvaluatorError(
        `La proposición "${proposition.id}" esperaba una opción y recibió ` +
          `${JSON.stringify(choice)}.`,
        "MALFORMED_RESPONSE",
      );
    }
    const confidence = answer["confidence"];
    return {
      id: proposition.id,
      kind: "choice",
      choice,
      ...(typeof confidence === "number" ? { confidence } : {}),
      ...(probabilities === undefined ? {} : { probabilities }),
    };
  }

  const score = answer["score"];
  if (typeof score !== "number" || !Number.isFinite(score)) {
    throw new EvaluatorError(
      `La proposición "${proposition.id}" esperaba una posición y recibió ` +
        `${JSON.stringify(score)}.`,
      "MALFORMED_RESPONSE",
    );
  }
  const confidence = answer["confidence"];
  return {
    id: proposition.id,
    kind: "score",
    score,
    ...(typeof confidence === "number" ? { confidence } : {}),
    ...(probabilities === undefined ? {} : { probabilities }),
  };
}

/** Opciones de una evaluación. */
export interface EvaluateOptions {
  readonly propositions: readonly Proposition[];
  /** El contexto congelado. Se envía tal cual y se hashea para el recibo. */
  readonly state: unknown;
  readonly model?: string;
  /** Agrupa peticiones relacionadas para observabilidad. */
  readonly sessionId?: string;
  readonly apiKey?: string;
  readonly signal?: AbortSignal;
  /** Inyectable para pruebas: sustituye `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Evalúa proposiciones contra un estado.
 *
 * Falla de forma ruidosa ante cualquier respuesta que no cumpla el contrato.
 * Ese comportamiento es deliberado: un gate no puede degradarse a "sin
 * respuesta" y seguir, porque una respuesta ausente tratada como aprobación es
 * exactamente el fallo que el sistema existe para evitar.
 */
export async function evaluateWithJev(
  options: EvaluateOptions,
): Promise<JevEvaluation> {
  const apiKey = options.apiKey ?? resolveApiKey();
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model ?? DEFAULT_JEV_MODEL;

  if (options.propositions.length === 0) {
    throw new GateDefinitionError(
      "Un gate debe declarar al menos una proposición.",
    );
  }

  const questions: Record<string, unknown> = {};
  for (const proposition of options.propositions) {
    questions[proposition.id] = toQuestion(proposition);
  }

  const body: Record<string, unknown> = {
    model,
    state: options.state,
    questions,
  };
  if (options.sessionId !== undefined) body["session_id"] = options.sessionId;

  const started = Date.now();
  let response: Response;
  try {
    response = await fetchImpl(DECISIONS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch (caught) {
    // El mensaje de error nunca incluye las cabeceras: llevan la credencial.
    const detail = caught instanceof Error ? caught.message : String(caught);
    throw new EvaluatorError(`Fallo de transporte: ${detail}`, "TRANSPORT");
  }

  const latencyMs = Date.now() - started;
  const text = await response.text();

  if (!response.ok) {
    const code =
      response.status === 401 || response.status === 403
        ? "AUTH"
        : response.status === 429
          ? "RATE_LIMIT"
          : response.status >= 500
            ? "SERVER"
            : "INVALID_REQUEST";
    throw new EvaluatorError(
      `El evaluador respondió HTTP ${response.status}: ${text.slice(0, 300)}`,
      code,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new EvaluatorError(
      "La respuesta del evaluador no es JSON.",
      "MALFORMED_RESPONSE",
    );
  }

  if (typeof payload !== "object" || payload === null) {
    throw new EvaluatorError(
      "La respuesta del evaluador no es un objeto.",
      "MALFORMED_RESPONSE",
    );
  }

  const data = payload as Record<string, unknown>;
  const rawAnswers = data["answers"];
  if (typeof rawAnswers !== "object" || rawAnswers === null) {
    throw new EvaluatorError(
      "La respuesta del evaluador no trae `answers`.",
      "MALFORMED_RESPONSE",
    );
  }

  const answersById = rawAnswers as Record<string, unknown>;
  const missing = options.propositions
    .map((proposition) => proposition.id)
    .filter((id) => answersById[id] === undefined);
  if (missing.length > 0) {
    throw new EvaluatorError(
      `El evaluador no respondió: ${missing.join(", ")}`,
      "MISSING_ANSWER",
    );
  }

  const answers = options.propositions.map((proposition) =>
    toAnswer(proposition, answersById[proposition.id]),
  );

  const usage = data["usage"] as Record<string, unknown> | undefined;
  return {
    answers,
    model: {
      provider: String(data["provider"] ?? "unknown"),
      model,
      // La versión concreta que sirvió la petición. Guardar el alias en su lugar
      // haría imposible saber si un cambio de resultados se debe al modelo.
      resolvedVersion: String(data["model"] ?? model),
    },
    usage: {
      inputTokens: Number(usage?.["input_tokens"] ?? 0),
      outputTokens: Number(usage?.["output_tokens"] ?? 0),
      costUsd: Number(usage?.["cost"] ?? 0),
    },
    latencyMs,
  };
}

/** Filtra las proposiciones que no aplican al sujeto. */
export function applicablePropositions(
  propositions: readonly Proposition[],
): Proposition[] {
  return propositions.filter((proposition) => proposition.when === undefined);
}
