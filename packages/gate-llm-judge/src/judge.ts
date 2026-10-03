/**
 * Evaluador de gates con un modelo de chat.
 *
 * Es la alternativa a Jev, y existe por una razón concreta: la API de Decisions
 * está en `/api/alpha/`. Una dependencia alpha no puede ser un punto único de
 * fallo de todo el sistema de gates, así que este evaluador implementa el mismo
 * contrato sobre la API de chat estándar.
 *
 * **No es equivalente.** Jev devuelve probabilidades calibradas y este devuelve
 * una decisión booleana con una confianza autoinformada, que es una señal mucho
 * más débil. El motor lo trata igual porque el contrato es el mismo, pero la
 * pérdida de calidad es real y se declara:
 *
 * | | Jev | llm-judge |
 * |---|---|---|
 * | Salida | probabilidad 0..1 calibrada | booleano + confianza declarada |
 * | Bandas | umbrales sobre probabilidad | solo aprobar o bloquear |
 * | Coste | $0.000008 por proposición | ~$0.0001–0.001 por proposición |
 * | Fundamento | modelo entrenado para decidir | instrucción en el prompt |
 *
 * Consecuencia práctica: con `llm-judge` **la banda de revisión casi no se usa**,
 * porque el modelo no expresa duda con un número. Se compensa de dos formas: se
 * pide un booleano explícito por proposición, y la confianza declarada se mapea
 * a probabilidad para que un modelo inseguro sí caiga en la banda.
 *
 * Ver docs/03-GATES.md §4.
 */
import type { Proposition, PropositionAnswer } from "@valmen/gate";
import { GateDefinitionError } from "@valmen/gate";
import {
  callChat,
  ChatError,
  DEFAULT_PROVIDER,
} from "@valmen/credentials";

/**
 * Endpoint de chat por defecto.
 *
 * Se conserva el nombre y el valor por compatibilidad, pero ya no es el único:
 * el endpoint real sale del catálogo de transporte, según el proveedor que diga
 * el routing. Ver `@valmen/credentials/endpoints`.
 */
export const CHAT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Modelo por defecto para el juicio.
 *
 * Se elige uno con salida estructurada estricta y coste bajo: el juicio se
 * ejecuta en cada gate, así que el precio importa. No es un modelo de
 * razonamiento profundo a propósito; para eso está el rol `architect`.
 */
export const DEFAULT_JUDGE_MODEL = "deepseek/deepseek-v4-flash";

/**
 * Lo que se espera a que el juez conteste, en milisegundos.
 *
 * Eran 90 s, y con un artefacto grande no alcanzan: una cascada con trece
 * proposiciones murió dos veces en ese tope y el gate cayó al evaluador barato,
 * que devolvió `REVIEW` sobre un plan que estaba bien. Un juicio que razona
 * sobre el estado entero tarda, y el tope no está para acelerarlo sino para no
 * quedarse colgado: tres minutos siguen siendo una espera acotada, y el tope
 * real de una corrida lo sigue poniendo quien la dispara —`timeoutMs` manda
 * cuando viene—. El caso medido está en
 * `docs/parte-diario-20260927.md`.
 */
export const TIMEOUT_JUEZ_MS = 180_000;

/** Error de comunicación con el evaluador. */
export class JudgeError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "JudgeError";
    this.code = code;
  }
}

/** Lo que devuelve una evaluación con juicio. */
export interface JudgeEvaluation {
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

/**
 * Esquema de la respuesta.
 *
 * Se pide un objeto con un campo por proposición, y cada campo lleva `holds`
 * (la proposición se cumple) y `confidence` (cuánto confía). Pedir la confianza
 * por separado es lo que permite recuperar algo de la banda de revisión: un
 * modelo que responde "se cumple" con 0.4 de confianza está dudando, y eso debe
 * llegar al gate como duda.
 *
 * `strict: true` obliga al proveedor a respetar el esquema. Sin eso, un modelo
 * puede devolver prosa alrededor del JSON y el parseo falla en el peor momento.
 */
function buildSchema(propositions: readonly Proposition[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const proposition of propositions) {
    // Una elección no se puede responder con un booleano: el motor rechaza una
    // respuesta cuyo tipo no coincide con lo declarado, y con razón. El esquema
    // se construye según el tipo de cada proposición.
    if (proposition.kind === "choice") {
      properties[proposition.id] = {
        type: "object",
        properties: {
          choice: {
            type: "string",
            enum: Object.keys(proposition.criteria),
            description: "La opción que describe el estado.",
          },
          confidence: { type: "number", description: "Confianza, de 0 a 1." },
          reason: { type: "string", description: "Por qué, en una frase." },
        },
        required: ["choice", "confidence", "reason"],
        additionalProperties: false,
      };
      continue;
    }

    properties[proposition.id] = {
      type: "object",
      properties: {
        holds: {
          type: "boolean",
          description: "La proposición se cumple según el estado.",
        },
        confidence: {
          type: "number",
          description:
            "Confianza en la respuesta, de 0 a 1. Use valores bajos cuando dude.",
        },
        reason: {
          type: "string",
          description: "Por qué, en una frase. Se registra como evidencia.",
        },
      },
      required: ["holds", "confidence", "reason"],
      additionalProperties: false,
    };
  }

  return {
    type: "object",
    properties,
    required: propositions.map((proposition) => proposition.id),
    additionalProperties: false,
  };
}

/**
 * Construye el mensaje de sistema.
 *
 * Insiste en dos cosas que son la diferencia entre un juez útil y uno inútil:
 * evaluar cada proposición por separado, y no inventar. Un modelo al que se le
 * pide un juicio sin instrucciones explícitas tiende a responder que todo está
 * bien.
 */
function systemPrompt(porHerramienta = false): string {
  // El cierre del prompt tiene que coincidir con la vía que se use: pedir «solo
  // el JSON» mientras el cuerpo fuerza una llamada a herramienta deja al modelo
  // eligiendo, y contestó en prosa.
  const esquema = porHerramienta
    ? [
        "",
        "Responde **llamando a la herramienta `gate_judgement`**, con un objeto",
        "que tenga una clave por cada proposición. No contestes con texto.",
      ]
    : ["", "Responde solo con el JSON del esquema."];

  return [
    "Eres un evaluador de artefactos de ingeniería. Recibes un estado en JSON y una",
    "lista de proposiciones. Para cada proposición respondes si se cumple en ese estado.",
    "",
    "Reglas:",
    "1. Evalúa cada proposición por separado, solo contra el estado. No las combines.",
    "2. Responde `false` si el estado no contiene lo que la proposición pide. La",
    "   ausencia de evidencia no es evidencia de cumplimiento.",
    "3. Usa `confidence` baja cuando el estado sea ambiguo o incompleto. No infles",
    "   la confianza para parecer útil.",
    "4. No propongas mejoras ni comentes fuera de lo que la proposición pregunta.",
    ...esquema,
  ].join("\n");
}

/** Construye el mensaje de usuario con el estado y las proposiciones. */
function userPrompt(state: unknown, propositions: readonly Proposition[]): string {
  const preguntas = propositions.map((proposition) => {
    const partes = [
      `- id: ${proposition.id}`,
      `  proposición: ${proposition.instructions}`,
    ];
    if (proposition.kind === "noul" && proposition.criteria) {
      partes.push(`  se cumple si: ${proposition.criteria.yes}`);
      partes.push(`  no se cumple si: ${proposition.criteria.no}`);
    }
    if (proposition.kind === "choice") {
      partes.push("  responde con una de estas opciones:");
      for (const [opcion, descripcion] of Object.entries(proposition.criteria)) {
        partes.push(`    ${opcion}: ${descripcion}`);
      }
    }
    return partes.join("\n");
  });

  return [
    "ESTADO:",
    "```json",
    JSON.stringify(state, null, 2),
    "```",
    "",
    "PROPOSICIONES:",
    preguntas.join("\n"),
  ].join("\n");
}

/**
 * Traduce la respuesta del juez a una probabilidad.
 *
 * El mapeo es el punto delicado de este evaluador, porque el motor decide con
 * umbrales sobre probabilidad y aquí no hay probabilidad.
 *
 * - Se cumple con confianza alta → 1.0, aprueba.
 * - Se cumple con confianza baja → 0.7, cae en banda si el umbral es 0.9.
 * - No se cumple con confianza baja → 0.3, banda.
 * - No se cumple con confianza alta → 0.0, bloquea.
 *
 * La confianza se escala sobre una banda de 0.7 para que un modelo que responde
 * "sí, pero no estoy seguro" no apruebe por accidente.
 */
export function confidenceToProbability(holds: boolean, confidence: number): number {
  const acotada = Math.min(1, Math.max(0, confidence));
  if (holds) return 0.3 + 0.7 * acotada;
  return 0.3 * (1 - acotada);
}

/** Opciones de una evaluación con juicio. */
export interface JudgeOptions {
  readonly propositions: readonly Proposition[];
  readonly state: unknown;
  readonly model?: string;
  /**
   * Esfuerzo de razonamiento, tal como lo define el proveedor.
   *
   * `auto` no envía el campo: es la ausencia de preferencia, no una preferencia
   * por el valor medio. Verificado contra el endpoint real: un modelo que no
   * razona ignora el campo, y uno que sí lo gasta en razonar antes de responder.
   */
  readonly effort?: "auto" | "low" | "medium" | "high";
  /**
   * Proveedor por el que hablar.
   *
   * Sin él se usa OpenRouter, que es lo que hacía antes de que el routing
   * pudiera elegir. Con él, la clave y el endpoint salen del catálogo: es lo que
   * hace que una suscripción o una clave directa sirvan de algo.
   */
  readonly provider?: string;
  readonly apiKey?: string;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
  /** Temperatura. Por defecto 0: un juez no debe ser creativo. */
  readonly temperature?: number;
  /**
   * Tiempo máximo. Por defecto 90 segundos.
   *
   * Medido, este evaluador puede tardar 28 s en responder, contra menos de 1 s
   * de Jev. Sin un límite, un proveedor lento deja el comando colgado en vez de
   * fallar, y un gate que no responde es peor que un gate que falla.
   */
  readonly timeoutMs?: number;
}

/** Evalúa proposiciones con un modelo de chat. */
export async function evaluateWithJudge(options: JudgeOptions): Promise<JudgeEvaluation> {
  const model = options.model ?? DEFAULT_JUDGE_MODEL;
  const proveedor = options.provider ?? DEFAULT_PROVIDER;

  if (options.propositions.length === 0) {
    throw new GateDefinitionError("Un gate debe declarar al menos una proposición.");
  }

  const schema = buildSchema(options.propositions);
  let respuesta;
  try {
    // El adaptador común resuelve credencial, endpoint y dialecto. Así el juez
    // recibe siempre el mismo contenido, venga de OpenRouter, Codex, Claude o
    // un proveedor compatible, sin reconstruir aquí cada protocolo.
    respuesta = await callChat({
      provider: proveedor,
      model,
      temperature: options.temperature ?? 0,
      timeoutMs: options.timeoutMs ?? TIMEOUT_JUEZ_MS,
      ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      ...(options.effort === undefined ? {} : { effort: options.effort }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt(options.state, options.propositions) },
      ],
      structured: {
        name: "gate_judgement",
        description: "El juicio de cada proposición.",
        schema,
      },
    });
  } catch (caught) {
    if (caught instanceof ChatError) {
      throw new JudgeError(caught.message, caught.code);
    }
    throw caught;
  }

  let juicio: Record<string, { holds?: unknown; confidence?: unknown; reason?: unknown }>;
  try {
    juicio = JSON.parse(respuesta.content) as typeof juicio;
  } catch {
    throw new JudgeError(
      `El juez no respetó el esquema: el contenido no es JSON y era ` +
        `${JSON.stringify(respuesta.content).slice(0, 120)}. ` +
        "Un juez que no respeta el formato no puede decidir un gate.",
      "MALFORMED_RESPONSE",
    );
  }

  const faltantes = options.propositions
    .map((proposition) => proposition.id)
    .filter((id) => {
      const respuesta = juicio[id];
      if (respuesta === undefined) return true;
      // Cada tipo tiene su campo obligatorio. Un `noul` sin `holds` o una
      // elección sin `choice` es una respuesta que no se puede usar.
      return (
        typeof (respuesta as { holds?: unknown }).holds !== "boolean" &&
        typeof (respuesta as { choice?: unknown }).choice !== "string"
      );
    });
  if (faltantes.length > 0) {
    // Se incluye lo que el modelo devolvió, recortado: un diagnóstico que dice
    // «no respondió correctamente» y no muestra la respuesta obliga a
    // reproducir la llamada a mano para saber qué pasó. La primera clave suele
    // bastar para ver si envolvió el objeto o cambió los nombres.
    const primeras = Object.keys(juicio).slice(0, 6).join(", ");
    throw new JudgeError(
      `El juez no respondió correctamente: ${faltantes.join(", ")}. ` +
        `Devolvió las claves [${primeras}]: ${respuesta.content.slice(0, 300)}`,
      "MISSING_ANSWER",
    );
  }

  const answers = options.propositions.map((proposition): PropositionAnswer => {
    const respuesta = juicio[proposition.id] as {
      holds?: boolean;
      choice?: string;
      confidence?: number;
    };
    const confianza = typeof respuesta.confidence === "number" ? respuesta.confidence : 0.5;

    if (proposition.kind === "choice" && typeof respuesta.choice === "string") {
      return {
        id: proposition.id,
        kind: "choice",
        choice: respuesta.choice,
        confidence: confianza,
      };
    }

    return {
      id: proposition.id,
      kind: "noul",
      value: confidenceToProbability(respuesta.holds === true, confianza),
      confidence: confianza,
    };
  });

  return {
    answers,
    model: {
      provider: proveedor,
      model,
      resolvedVersion: respuesta.model,
    },
    usage: {
      inputTokens: respuesta.usage.inputTokens,
      outputTokens: respuesta.usage.outputTokens,
      costUsd: respuesta.usage.costUsd ?? 0,
    },
    latencyMs: respuesta.latencyMs,
  };
}
