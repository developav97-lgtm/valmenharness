/**
 * Una llamada de chat, completa.
 *
 * Existe porque el harness habla con modelos desde tres sitios —el juez de un
 * gate, el descomponedor de una feature y, más adelante, el chat de Mission
 * Control— y las tres tienen que comportarse igual en lo que no se ve: resolver
 * el endpoint por proveedor, mandar la credencial, medir la latencia **después de
 * leer el cuerpo**, no incluir nunca la cabecera en un mensaje de error y
 * reportar el dialecto de salida estructurada que el proveedor acepta.
 *
 * Esa última parte no es teoría: contra DeepSeek, `json_schema` devuelve HTTP
 * 400 y `json_object` no impone nada —el modelo contestó `cumple` en vez de
 * `holds`—. Escribir eso una vez y que lo usen los tres es la diferencia entre
 * arreglarlo en un sitio y arreglarlo en tres. Ver `scripts/probe-deepseek-tools.md`.
 */
import { CodexCredentialError, readCodexCredential } from "./codex.js";
import { CredentialError, resolveApiKey } from "./credentials.js";
import { callResponses } from "./responses.js";
import {
  DEFAULT_PROVIDER,
  extraHeaders,
  resolveChatEndpoint,
  structuredOutputOf,
  transportById,
} from "./endpoints.js";

/** Un mensaje del historial. */
export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

/** Qué pedirle al proveedor sobre la forma de la respuesta. */
export type OutputDialect = "json-schema" | "tool-call" | "text" | "openai-responses";

/** Cómo se pide la salida estructurada, según lo que el proveedor sepa imponer. */
export interface StructuredRequest {
  /** El nombre de la forma: `gate_judgement`, `feature_decomposition`. */
  readonly name: string;
  /** El esquema JSON de la respuesta. */
  readonly schema: Record<string, unknown>;
  readonly description?: string;
}

/** Lo que devuelve una llamada. */
export interface ChatResult {
  /** El contenido, ya sea de `content` o de los argumentos de la herramienta. */
  readonly content: string;
  /** El modelo que el proveedor dice haber usado, que puede diferir del pedido. */
  readonly model: string;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    /** `null` si el proveedor no informa el coste. */
    readonly costUsd: number | null;
  };
  /** Medida tras leer el cuerpo, no al recibir las cabeceras. */
  readonly latencyMs: number;
  /** Por dónde se pidió la salida, para poder explicar un fallo de formato. */
  readonly dialect: OutputDialect;
}

/** Opciones de la llamada. */
export interface ChatOptions {
  readonly provider?: string;
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  /** Salida estructurada. Sin esto, el proveedor responde en texto libre. */
  readonly structured?: StructuredRequest;
  /** Instrucción de razonamiento. `auto` no envía preferencia. */
  readonly effort?: "auto" | "low" | "medium" | "high";
  /**
   * Tope de tokens de salida, razonamiento incluido.
   *
   * Importa más de lo que parece en los modelos que razonan: gastan el
   * presupuesto pensando **antes** de escribir, así que un tope bajo devuelve
   * HTTP 200 con el contenido vacío. Medido con K3: 40 tokens se fueron enteros
   * en razonar y `content` llegó como cadena vacía.
   */
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly timeoutMs?: number;
  readonly apiKey?: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}

/**
 * La credencial del proveedor, con sus dos formas.
 *
 * Casi todos leen una clave del archivo del harness o de una variable de entorno.
 * `codex` no: usa tokens OAuth de su propio CLI, en su propio archivo, y se leen
 * en cada llamada porque su CLI los refresca por su cuenta.
 *
 * Aquí se lee del `$HOME` a propósito: quien llama es el CLI, que corre en la
 * máquina del usuario. El servidor no pasa por aquí —tiene su propio archivo en el
 * contexto y lo resuelve en el borde—, así que no hay un segundo camino que pueda
 * discrepar.
 */
function resolveCredentialFor(proveedor: string): string {
  if (transportById(proveedor).credential === "codex") {
    try {
      return readCodexCredential().accessToken;
    } catch (caught) {
      if (caught instanceof CodexCredentialError) {
        throw new ChatError(caught.message, "CREDENTIAL_MISSING");
      }
      throw caught;
    }
  }

  try {
    return resolveApiKey(proveedor);
  } catch (caught) {
    if (caught instanceof CredentialError) {
      throw new ChatError(caught.message, "CREDENTIAL_MISSING");
    }
    throw caught;
  }
}

/** Un fallo de la llamada. El mensaje nunca lleva la credencial. */
export class ChatError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ChatError";
    this.code = code;
  }
}

/**
 * Llama a un modelo de chat y devuelve su respuesta.
 *
 * No valida la forma del contenido: cada consumidor sabe qué espera —el juez un
 * objeto por proposición, el descomponedor un grafo— y un validador genérico
 * aquí solo añadiría una capa que hay que leer para entender los dos.
 */
export async function callChat(options: ChatOptions): Promise<ChatResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const proveedor = options.provider ?? DEFAULT_PROVIDER;

  // El endpoint y las cabeceras salen del catálogo. Un modelo cuyo dialecto no
  // esté implementado falla aquí, antes de gastar una llamada.
  const endpoint = resolveChatEndpoint(proveedor, options.model);
  const extra = extraHeaders(proveedor);

  // La credencial se resuelve **antes** que el dialecto, y no dentro de cada
  // camino: un proveedor de suscripción no tiene clave en el archivo del harness,
  // así que resolverla después hacía que codex fallara buscando una que nunca iba
  // a estar.
  const apiKey = options.apiKey ?? resolveCredentialFor(proveedor);

  // El dialecto no lo elige quien llama: lo dice el endpoint, que lo saca del
  // catálogo de transporte. Un `gpt-*` de codex va por `/responses` con streaming
  // obligatorio, y mandarlo por `/chat/completions` responde 404.
  if (endpoint.protocol === "openai-responses") {
    return callResponses(
      {
        url: endpoint.url,
        headers: {
          ...extra,
          ...(apiKey === null || apiKey === ""
            ? {}
            : { Authorization: `Bearer ${apiKey}` }),
        },
        model: options.model,
        messages: options.messages,
        maxTokens: options.maxTokens,
        effort: options.effort,
        signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 90_000),
      },
      fetchImpl,
    );
  }

  const dialect: OutputDialect =
    options.structured === undefined
      ? "text"
      : structuredOutputOf(proveedor) === "json-schema"
        ? "json-schema"
        : "tool-call";

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
        model: options.model,
        temperature: options.temperature ?? 0,
        ...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
        ...(options.effort === undefined || options.effort === "auto"
          ? {}
          : { reasoning: { effort: options.effort } }),
        messages: options.messages,
        ...(options.structured === undefined
          ? {}
          : dialect === "json-schema"
            ? {
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: options.structured.name,
                    strict: true,
                    schema: options.structured.schema,
                  },
                },
              }
            : {
                tools: [
                  {
                    type: "function",
                    function: {
                      name: options.structured.name,
                      description:
                        options.structured.description ??
                        "La respuesta, con la forma pedida.",
                      parameters: options.structured.schema,
                    },
                  },
                ],
                tool_choice: {
                  type: "function",
                  function: { name: options.structured.name },
                },
              }),
      }),
      signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 90_000),
    });
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : String(caught);
    const esTimeout = /abort|timeout/i.test(detail);
    throw new ChatError(
      esTimeout
        ? `La llamada a ${proveedor} superó el tiempo máximo de ${options.timeoutMs ?? 90_000} ms.`
        : `Fallo de transporte al llamar a ${proveedor}: ${detail}`,
      esTimeout ? "TIMEOUT" : "TRANSPORT",
    );
  }

  // La latencia se mide después de leer el cuerpo: `fetch` resuelve al recibir
  // las cabeceras, y en un modelo que razona el cuerpo puede tardar treinta veces
  // más. Medir antes registraba una duración que no era la real.
  let text: string;
  try {
    text = await response.text();
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : String(caught);
    const esTimeout = /abort|timeout/i.test(detail);
    throw new ChatError(
      esTimeout
        ? `La llamada a ${proveedor} superó el tiempo máximo mientras se leía la respuesta.`
        : `Fallo al leer la respuesta de ${proveedor}: ${detail}`,
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
    // El cuerpo del proveedor viaja tal cual, recortado: parafrasearlo esconde
    // justo lo que hace falta para arreglarlo —«Insufficient balance» no es «clave
    // inválida»—. Ver docs y `scripts/probe-deepseek-tools.md`.
    throw new ChatError(
      `${proveedor} respondió HTTP ${response.status}: ${text.slice(0, 300)}`,
      code,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new ChatError(`La respuesta de ${proveedor} no es JSON.`, "MALFORMED_RESPONSE");
  }

  const data = payload as {
    model?: string;
    choices?: {
      message?: {
        content?: string;
        tool_calls?: { function?: { name?: string; arguments?: string } }[];
      };
    }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      cost?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };

  // El contenido llega en `content` por la vía del esquema y en
  // `tool_calls[0].function.arguments` por la de herramienta. Se aceptan las dos
  // y se prefiere la herramienta cuando está, porque es la que el proveedor
  // eligió para responder.
  const mensaje = data.choices?.[0]?.message;
  const contenido = mensaje?.tool_calls?.[0]?.function?.arguments ?? mensaje?.content;
  if (typeof contenido !== "string" || contenido.trim() === "") {
    // Se incluye la forma de lo que llegó. Sin esto, «no trae contenido» no
    // distingue una respuesta vacía, una en prosa y un `tool_calls` que el lector
    // no supo encontrar —que fue exactamente el caso al cambiar de vía—. Y una
    // respuesta vacía es lo que se ve cuando el presupuesto de tokens se fue
    // entero en razonar.
    throw new ChatError(
      `${proveedor} no devolvió contenido. El mensaje traía las claves ` +
        `[${Object.keys(mensaje ?? {}).join(", ")}]` +
        (data.usage?.completion_tokens === undefined
          ? "."
          : ` y ${data.usage.completion_tokens} token(s) de salida.`),
      "MALFORMED_RESPONSE",
    );
  }

  return {
    content: contenido,
    model: data.model ?? options.model,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      costUsd: data.usage?.cost ?? null,
    },
    latencyMs,
    dialect,
  };
}
