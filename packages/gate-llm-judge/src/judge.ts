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
  CredentialError,
  DEFAULT_PROVIDER,
  extraHeaders,
  resolveApiKey,
  resolveChatEndpoint,
  structuredOutputOf,
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
function buildSchema(
  propositions: readonly Proposition[],
): Record<string, unknown> {
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
/**
 * La forma exacta de la respuesta, escrita para el modelo.
 *
 * Cuando el proveedor no acepta un `json_schema`, el esquema viaja en el prompt.
 * Y ahí **volcar el JSON Schema no funciona**: medido contra DeepSeek, el modelo
 * devuelve algo con otra forma y el juez no puede leer ni una respuesta. Lo que
 * sí funciona es decirle la forma concreta —una clave por proposición, qué lleva
 * dentro, y que no lo envuelva en nada— porque es lo que el modelo tiene que
 * escribir, no la definición de lo que es válido.
 */
function formaExplicita(schema: unknown): string[] {
  const propiedades = (schema as { properties?: Record<string, unknown> })
    .properties;
  if (propiedades === undefined) return ["Responde solo con el JSON del esquema."];

  const lineas = [
    "Responde con **un solo objeto JSON**, sin envolverlo en otra clave, cuyas",
    "claves sean exactamente estos identificadores y ninguna más:",
    "",
    "{",
  ];
  const ids = Object.keys(propiedades);
  ids.forEach((id, indice) => {
    const cuerpo = propiedades[id] as {
      properties?: Record<string, unknown>;
    };
    const esEleccion = cuerpo.properties?.["choice"] !== undefined;
    const coma = indice === ids.length - 1 ? "" : ",";
    lineas.push(
      esEleccion
        ? `  ${JSON.stringify(id)}: { "choice": "<una de las opciones>", "confidence": 0.0, "reason": "una frase" }${coma}`
        : `  ${JSON.stringify(id)}: { "holds": true, "confidence": 0.0, "reason": "una frase" }${coma}`,
    );
  });
  lineas.push(
    "}",
    "",
    "Cada clave lleva `confidence` entre 0 y 1, y `reason` en una frase.",
    "",
    // Medido: DeepSeek tradujo `holds` a `cumple` porque la conversación está en",
    // español. El nombre de la clave es parte del contrato, no una descripción,
    // así que hay que decir que es literal.
    // Y un ejemplo relleno, porque un modelo copia lo que ve mejor de lo que
    // obedece lo que lee: pedirle `holds` en español produjo `cumple` tres veces
    // seguidas, con la instrucción explícita de no traducirlo delante.
    "",
    "Así se ve una respuesta correcta, con el primer identificador:",
    "",
    "{",
    `  ${JSON.stringify(ids[0])}: { "holds": true, "confidence": 0.9, "reason": "el plan lo cubre en el paso 2" }`,
    "}",
    "",
    "Fíjate en que la clave es `holds`, en inglés. No la traduzcas.",
  );
  return lineas;
}

function systemPrompt(schemaEnPrompt?: unknown): string {
  const esquema =
    schemaEnPrompt === undefined ? [] : ["", ...formaExplicita(schemaEnPrompt)];

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
    "5. Responde solo con el JSON del esquema.",
    ...esquema,
  ].join("\n");
}

/** Construye el mensaje de usuario con el estado y las proposiciones. */
function userPrompt(
  state: unknown,
  propositions: readonly Proposition[],
): string {
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
      for (const [opcion, descripcion] of Object.entries(
        proposition.criteria,
      )) {
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
export function confidenceToProbability(
  holds: boolean,
  confidence: number,
): number {
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
export async function evaluateWithJudge(
  options: JudgeOptions,
): Promise<JudgeEvaluation> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model ?? DEFAULT_JUDGE_MODEL;
  const proveedor = options.provider ?? DEFAULT_PROVIDER;

  // El endpoint y las cabeceras salen del catálogo. Un modelo cuyo dialecto no
  // esté implementado falla aquí, antes de gastar una llamada.
  const endpoint = resolveChatEndpoint(proveedor, model);
  const extra = extraHeaders(proveedor);
  // Pedir la salida estructurada como el proveedor sepa: OpenRouter acepta un
  // `json_schema` y lo hace cumplir; DeepSeek lo rechaza con un 400 y solo
  // admite `json_object`, así que el esquema viaja en el prompt. Verificado con
  // una llamada real a cada uno.
  const dialecto = structuredOutputOf(proveedor);

  if (options.propositions.length === 0) {
    throw new GateDefinitionError(
      "Un gate debe declarar al menos una proposición.",
    );
  }

  // La credencial se resuelve con el mismo código que usa Jev, para que una
  // clave configurada funcione igual con cualquier evaluador.
  let apiKey = options.apiKey;
  if (apiKey === undefined) {
    try {
      apiKey = resolveApiKey(proveedor);
    } catch (caught) {
      if (caught instanceof CredentialError) {
        throw new JudgeError(caught.message, "CREDENTIAL_MISSING");
      }
      throw caught;
    }
  }

  const schema = buildSchema(options.propositions);
  const esquemaEnPrompt = dialecto === "json-schema" ? undefined : schema;
  const started = Date.now();
  let response: Response;

  try {
    response = await fetchImpl(endpoint.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...extra,
      },
      body: JSON.stringify({
        model,
        temperature: options.temperature ?? 0,
        ...(options.effort === undefined || options.effort === "auto"
          ? {}
          : { reasoning: { effort: options.effort } }),
        messages: [
          { role: "system", content: systemPrompt() },
          {
            role: "user",
            content: userPrompt(options.state, options.propositions),
          },
        ],
        response_format:
          dialecto === "json-schema"
            ? {
                type: "json_schema",
                json_schema: { name: "gate_judgement", strict: true, schema },
              }
            : { type: "json_object" },
      }),
      signal:
        options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 90_000),
    });
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : String(caught);
    // Un timeout se reporta como tal: el código dice si hay que reintentar o si
    // el evaluador no sirve para este gate.
    const esTimeout = /abort|timeout/i.test(detail);
    // El mensaje nunca incluye cabeceras: llevan la credencial.
    throw new JudgeError(
      esTimeout
        ? `El juez superó el tiempo máximo de ${options.timeoutMs ?? 90_000} ms.`
        : `Fallo de transporte: ${detail}`,
      esTimeout ? "TIMEOUT" : "TRANSPORT",
    );
  }

  // La latencia se mide después de leer el cuerpo: `fetch` resuelve al recibir
  // las cabeceras, y en un modelo que razona el cuerpo puede tardar treinta veces
  // más. Medir antes registraba en el recibo una duración que no era la real.
  let text: string;
  try {
    text = await response.text();
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : String(caught);
    const esTimeout = /abort|timeout/i.test(detail);
    throw new JudgeError(
      esTimeout
        ? `El juez superó el tiempo máximo de ${options.timeoutMs ?? 90_000} ms mientras se leía la respuesta.`
        : `Fallo al leer la respuesta: ${detail}`,
      esTimeout ? "TIMEOUT" : "TRANSPORT",
    );
  }
  const latencyMs = Date.now() - started;

  if (!response.ok) {
    const code =
      response.status === 401 || response.status === 403
        ? "AUTH"
        : response.status === 429
          ? "RATE_LIMIT"
          : response.status >= 500
            ? "SERVER"
            : "INVALID_REQUEST";
    throw new JudgeError(
      `El juez respondió HTTP ${response.status}: ${text.slice(0, 300)}`,
      code,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new JudgeError(
      "La respuesta del juez no es JSON.",
      "MALFORMED_RESPONSE",
    );
  }

  const data = payload as {
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      cost?: number;
    };
  };

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new JudgeError(
      "La respuesta del juez no trae contenido.",
      "MALFORMED_RESPONSE",
    );
  }

  let juicio: Record<
    string,
    { holds?: unknown; confidence?: unknown; reason?: unknown }
  >;
  try {
    juicio = JSON.parse(content) as typeof juicio;
  } catch {
    throw new JudgeError(
      "El juez no respetó el esquema: el contenido no es JSON. " +
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
        `Devolvió las claves [${primeras}]: ${content.slice(0, 300)}`,
      "MISSING_ANSWER",
    );
  }

  const answers = options.propositions.map((proposition): PropositionAnswer => {
    const respuesta = juicio[proposition.id] as {
      holds?: boolean;
      choice?: string;
      confidence?: number;
    };
    const confianza =
      typeof respuesta.confidence === "number" ? respuesta.confidence : 0.5;

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
      provider: "openrouter",
      model,
      resolvedVersion: data.model ?? model,
    },
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      costUsd: data.usage?.cost ?? 0,
    },
    latencyMs,
  };
}
