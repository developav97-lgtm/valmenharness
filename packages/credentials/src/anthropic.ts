/**
 * El dialecto `anthropic-messages`.
 *
 * Es el que hablan los modelos de Claude, y estaba **declarado en el catálogo sin
 * implementar**: `opencode-zen` ya mapeaba sus `claude-*` a este dialecto, así que
 * elegir un Claude en el selector terminaba en «el harness todavía no lo
 * implementa». Un catálogo que promete un camino y no lo tiene es peor que uno que
 * no lo nombra: manda al usuario a buscar el problema en su clave.
 *
 * Las diferencias con `openai-chat` que importan, y que son la razón de que esto
 * sea un archivo y no una traducción:
 *
 * | | `openai-chat` | `anthropic-messages` |
 * |---|---|---|
 * | Autenticación | `Authorization: Bearer` | `x-api-key`, o `Bearer` + `anthropic-beta` si es OAuth |
 * | Sistema | un mensaje más, con `role: system` | campo `system`, aparte de los mensajes |
 * | Salida estructurada | `response_format` con `json_schema` | **herramienta forzada**, que devuelve un objeto |
 * | Respuesta | `choices[0].message.content` | `content[]`, una lista de bloques |
 * | Uso | `usage.prompt_tokens` | `usage.input_tokens` |
 *
 * `max_tokens` es **obligatorio** en este dialecto: sin él responde 400. Se manda
 * siempre, con un valor por defecto sensato, en vez de dejar que la petición falle
 * por un campo que el proveedor exige.
 *
 * Lo que **no** se implementa, y se dice en vez de fingirlo: el razonamiento
 * extendido (`thinking`). La salida estructurada va por herramienta forzada y las
 * dos cosas son incompatibles en este dialecto —`tool_choice` forzado con
 * `thinking` activo se rechaza—, así que el `effort` del routing no se traduce
 * aquí. Los modelos de Claude deciden su esfuerzo sin que se lo pidan.
 */
import {
  ChatError,
  type ChatMessage,
  type ChatResult,
  type StructuredRequest,
} from "./chat.js";

/** Cómo se pide una respuesta en este dialecto. */
export interface AnthropicRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  /**
   * Tope de salida. En este dialecto es obligatorio, así que el llamador recibe
   * uno por defecto cuando no lo pide.
   */
  readonly maxTokens?: number | undefined;
  readonly temperature?: number | undefined;
  readonly structured?: StructuredRequest | undefined;
  readonly signal?: AbortSignal | undefined;
}

/** El tope por defecto, cuando nadie pide otro. */
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 4096;

/**
 * Las cabeceras de autenticación de este dialecto.
 *
 * La clave de API va en `x-api-key`; el token de suscripción, en `Authorization`
 * con la cabecera `anthropic-beta` que su OAuth exige. Se decide por el valor del
 * token —`sk-ant-oat` es de suscripción y `sk-ant-api` es una clave— porque el
 * error de confundirlas no dice nada del problema: `invalid x-api-key` no menciona
 * que lo que había era un token de sesión.
 */
export function anthropicAuthHeaders(credencial: string): Readonly<Record<string, string>> {
  const base = { "anthropic-version": "2023-06-01" };
  if (credencial.trim() === "") return base;
  if (credencial.startsWith("sk-ant-oat")) {
    return {
      ...base,
      Authorization: `Bearer ${credencial}`,
      "anthropic-beta": "oauth-2025-04-20",
    };
  }
  return { ...base, "x-api-key": credencial };
}

/** Un bloque de la respuesta, de los que este dialecto devuelve. */
interface Bloque {
  readonly type?: string;
  readonly text?: string;
  readonly name?: string;
  readonly input?: unknown;
}

/**
 * El contenido de la respuesta.
 *
 * Preferir el bloque de herramienta cuando está: es el que el proveedor eligió
 * para responder, y su `input` ya es el objeto pedido. El texto libre se concatena
 * porque una respuesta larga llega en varios bloques, y quedarse con el primero
 * devolvería media respuesta sin decirlo.
 */
export function anthropicContent(bloques: readonly Bloque[]): string | null {
  const herramienta = bloques.find((bloque) => bloque.type === "tool_use");
  if (herramienta !== undefined && herramienta.input !== undefined) {
    return JSON.stringify(herramienta.input);
  }

  const texto = bloques
    .filter((bloque) => bloque.type === "text" && typeof bloque.text === "string")
    .map((bloque) => bloque.text as string)
    .join("")
    .trim();
  return texto === "" ? null : texto;
}

/** Pide una respuesta y devuelve su contenido. */
export async function callAnthropic(
  request: AnthropicRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatResult> {
  const sistema = request.messages
    .filter((mensaje) => mensaje.role === "system")
    .map((mensaje) => mensaje.content)
    .join("\n\n");
  const conversacion = request.messages.filter((mensaje) => mensaje.role !== "system");

  const cuerpo: Record<string, unknown> = {
    model: request.model,
    // Obligatorio en este dialecto: sin él, HTTP 400.
    max_tokens: request.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
    temperature: request.temperature ?? 0,
    messages: conversacion.map((mensaje) => ({
      role: mensaje.role,
      content: mensaje.content,
    })),
  };
  if (sistema !== "") cuerpo["system"] = sistema;

  if (request.structured !== undefined) {
    cuerpo["tools"] = [
      {
        name: request.structured.name,
        description: request.structured.description ?? "La respuesta, con la forma pedida.",
        input_schema: request.structured.schema,
      },
    ];
    // Forzada: sin `tool_choice` el modelo puede contestar en prosa, y el
    // consumidor —el juez de un gate, el descomponedor— espera un objeto.
    cuerpo["tool_choice"] = { type: "tool", name: request.structured.name };
  }

  const inicio = Date.now();
  let respuesta: Response;
  try {
    respuesta = await fetchImpl(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...request.headers },
      body: JSON.stringify(cuerpo),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
  } catch (caught) {
    const detalle = caught instanceof Error ? caught.message : String(caught);
    const esTimeout = /abort|timeout/i.test(detalle);
    throw new ChatError(
      esTimeout ? "La llamada superó el tiempo máximo." : `Fallo de transporte: ${detalle}`,
      esTimeout ? "TIMEOUT" : "TRANSPORT",
    );
  }

  // La latencia se mide después de leer el cuerpo: `fetch` resuelve con las
  // cabeceras, y en un modelo que razona el cuerpo tarda bastante más.
  let texto: string;
  try {
    texto = await respuesta.text();
  } catch (caught) {
    const detalle = caught instanceof Error ? caught.message : String(caught);
    throw new ChatError(`Fallo al leer la respuesta: ${detalle}`, "TRANSPORT");
  }
  const latencyMs = Date.now() - inicio;

  if (!respuesta.ok) {
    const code =
      respuesta.status === 401 || respuesta.status === 403
        ? "AUTH"
        : respuesta.status === 429
          ? "RATE_LIMIT"
          : respuesta.status >= 500
            ? "SERVER"
            : "INVALID_REQUEST";
    // El cuerpo del proveedor, recortado y tal cual: «credit balance is too low»
    // no es «invalid x-api-key», y parafrasearlo esconde lo que hace falta para
    // arreglarlo.
    throw new ChatError(
      `El proveedor respondió HTTP ${respuesta.status}: ${texto.slice(0, 300)}`,
      code,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(texto) as unknown;
  } catch {
    throw new ChatError("La respuesta no es JSON.", "MALFORMED_RESPONSE");
  }

  const datos = payload as {
    model?: string;
    content?: readonly Bloque[];
    stop_reason?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };

  const contenido = anthropicContent(datos.content ?? []);
  if (contenido === null) {
    // La forma de lo que llegó, para poder distinguir una respuesta vacía de un
    // bloque que el lector no supo encontrar. Es el mismo diagnóstico que se pagó
    // una vez en el dialecto de chat.
    const tipos = (datos.content ?? []).map((bloque) => bloque.type ?? "?").join(", ");
    throw new ChatError(
      "El proveedor no devolvió contenido. Los bloques traían los tipos " +
        `[${tipos === "" ? "ninguno" : tipos}]` +
        (datos.stop_reason === undefined ? "." : ` y paró por "${datos.stop_reason}".`),
      "MALFORMED_RESPONSE",
    );
  }

  return {
    content: contenido,
    model: datos.model ?? request.model,
    usage: {
      inputTokens: datos.usage?.input_tokens ?? 0,
      outputTokens: datos.usage?.output_tokens ?? 0,
      // Este dialecto no informa coste: lo que se paga depende del plan, y
      // estimarlo con la tarifa de otro proveedor sería un número inventado con
      // forma de medición. Los tokens sí se registran, que esos son un dato.
      costUsd: null,
    },
    latencyMs,
    dialect: request.structured === undefined ? "text" : "tool-call",
  };
}
