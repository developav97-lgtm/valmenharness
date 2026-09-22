/**
 * El dialecto `openai-responses`.
 *
 * El harness hablaba solo `openai-chat`, y eso dejaba fuera a la mitad de los
 * modelos que el usuario tiene contratados: los `gpt-*` de la suscripción de
 * codex no exponen `/chat/completions`, exponen `/responses`, con otro cuerpo,
 * otra respuesta y **streaming obligatorio** —`stream: false` responde 400 con
 * «Stream must be set to true»—.
 *
 * Está aquí, y no en un paquete de gate, porque es vocabulario de transporte: el
 * mismo dialecto lo usan los `gpt-*` de opencode Zen y los de codex, y quien
 * hable con ellos no debería tener que saberlo.
 *
 * Las tres diferencias que importan, medidas contra el endpoint real:
 *
 * | | `openai-chat` | `openai-responses` |
 * |---|---|---|
 * | Cuerpo | `messages` | `instructions` + `input` |
 * | Respuesta | `choices[0].message.content` | eventos SSE `response.output_text.delta` |
 * | Uso | `usage.prompt_tokens` | `usage.input_tokens` dentro de un evento |
 *
 * No se intenta traducir un dialecto al otro. Traducir `messages` a `input` parece
 * trivial y no lo es —el papel `system` se convierte en `instructions`, las
 * herramientas cambian de forma y el historial tiene otro esquema—, y una
 * traducción a medias produce peticiones que el proveedor acepta y responde mal.
 */
import { ChatError, type ChatMessage, type ChatResult } from "./chat.js";

/** Un evento del stream, ya parseado. */
interface SseEvent {
  readonly event: string;
  readonly data: unknown;
}

/**
 * Parte un cuerpo SSE en eventos.
 *
 * El formato es de líneas: `event: <nombre>`, `data: <json>` y una línea vacía
 * que cierra. Se ignoran las líneas que no son ni una cosa ni la otra —hay
 * comentarios y campos que no se usan— y un `data` que no sea JSON se descarta en
 * vez de romper la lectura: lo que importa es el texto, y perder un evento que no
 * se entiende es mejor que perder la respuesta entera.
 */
export function parseSse(texto: string): SseEvent[] {
  const eventos: SseEvent[] = [];
  for (const bloque of texto.split(/\r?\n\r?\n/)) {
    let nombre = "";
    const datos: string[] = [];
    for (const linea of bloque.split(/\r?\n/)) {
      if (linea.startsWith("event:")) nombre = linea.slice(6).trim();
      else if (linea.startsWith("data:")) datos.push(linea.slice(5).trim());
    }
    if (nombre === "" || datos.length === 0) continue;
    try {
      eventos.push({ event: nombre, data: JSON.parse(datos.join("\n")) as unknown });
    } catch {
      continue;
    }
  }
  return eventos;
}

/**
 * El texto que produjo el stream.
 *
 * Se concatenan los deltas y **no** se toma `response.output_text.done`: los dos
 * traen el texto, y en una respuesta larga el evento final es el mismo contenido
 * otra vez. Sumar los dos duplicaría la respuesta.
 */
export function textFromEvents(eventos: readonly SseEvent[]): string {
  let texto = "";
  for (const { event, data } of eventos) {
    if (event !== "response.output_text.delta") continue;
    const delta = (data as { delta?: unknown }).delta;
    if (typeof delta === "string") texto += delta;
  }
  return texto;
}

/** El uso de tokens, si el stream lo informa. */
export function usageFromEvents(eventos: readonly SseEvent[]): {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
} {
  const vacio = { inputTokens: 0, outputTokens: 0, costUsd: null };
  const completado = eventos.find(({ event }) => event === "response.completed");
  if (completado === undefined) return vacio;

  const usage = (completado.data as { response?: { usage?: unknown } }).response?.usage;
  if (typeof usage !== "object" || usage === null) return vacio;
  const u = usage as { input_tokens?: unknown; output_tokens?: unknown };
  return {
    inputTokens: typeof u.input_tokens === "number" ? u.input_tokens : 0,
    outputTokens: typeof u.output_tokens === "number" ? u.output_tokens : 0,
    costUsd: null,
  };
}

/**
 * El error que trajo el stream, si lo trajo.
 *
 * Un `response.failed` llega con 200: el fallo viene **dentro** del stream, así
 * que mirar solo el código HTTP daría por buena una respuesta que no lo es.
 */
export function errorFromEvents(eventos: readonly SseEvent[]): string | null {
  for (const { event, data } of eventos) {
    if (event !== "response.failed" && event !== "error") continue;
    const detalle = data as {
      response?: { error?: { message?: unknown } };
      message?: unknown;
    };
    const mensaje = detalle.response?.error?.message ?? detalle.message;
    if (typeof mensaje === "string" && mensaje.trim() !== "") return mensaje;
    return "El proveedor reportó un fallo sin detalle.";
  }
  return null;
}

/** Cómo se pide una respuesta en este dialecto. */
export interface ResponsesRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly maxTokens?: number | undefined;
  readonly effort?: "auto" | "low" | "medium" | "high" | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Pide una respuesta y devuelve el texto.
 *
 * El cuerpo se arma con las reglas del dialecto: el mensaje de sistema viaja en
 * `instructions` —no como un mensaje más— y el resto en `input`, cada uno con su
 * tipo. Mandar `messages` aquí responde 400, y mandar `input` como texto suelto
 * también.
 */
export async function callResponses(
  request: ResponsesRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatResult> {
  const sistema = request.messages
    .filter((mensaje) => mensaje.role === "system")
    .map((mensaje) => mensaje.content)
    .join("\n\n");
  const conversacion = request.messages.filter((mensaje) => mensaje.role !== "system");

  const cuerpo: Record<string, unknown> = {
    model: request.model,
    input: conversacion.map((mensaje) => ({
      type: "message",
      role: mensaje.role,
      content: [{ type: "input_text", text: mensaje.content }],
    })),
    // Streaming obligatorio: `stream: false` responde 400.
    stream: true,
    // `store: false` porque son peticiones puntuales de un harness, no una
    // conversación que alguien vaya a retomar con un `previous_response_id`.
    store: false,
  };
  if (sistema !== "") cuerpo["instructions"] = sistema;
  // **`max_output_tokens` no se manda**, y no es un olvido: medido contra el
  // backend de codex, responde `400 Unsupported parameter: max_output_tokens`.
  // `instructions`, `reasoning`, `input`, `stream` y `store` sí los acepta.
  //
  // El tope de salida se pierde, y conviene saber qué implica: el gasto lo acota
  // el propio modelo y el tiempo máximo de la llamada, no un número. Un
  // presupuesto que el proveedor rechaza no protege de nada.
  void request.maxTokens;
  if (request.effort !== undefined && request.effort !== "auto") {
    cuerpo["reasoning"] = { effort: request.effort };
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

  // La latencia se mide después de leer el cuerpo entero: en un modelo que razona
  // el stream puede tardar mucho más que las cabeceras.
  let texto: string;
  try {
    texto = await respuesta.text();
  } catch (caught) {
    const detalle = caught instanceof Error ? caught.message : String(caught);
    throw new ChatError(`Fallo al leer la respuesta: ${detalle}`, "TRANSPORT");
  }
  const latencyMs = Date.now() - inicio;

  const eventos = parseSse(texto);

  if (!respuesta.ok) {
    const code =
      respuesta.status === 401 || respuesta.status === 403
        ? "AUTH"
        : respuesta.status === 429
          ? "RATE_LIMIT"
          : respuesta.status >= 500
            ? "SERVER"
            : "INVALID_REQUEST";
    // El cuerpo del proveedor, recortado: un 400 de este dialecto trae el motivo
    // —«Stream must be set to true»— y parafrasearlo lo escondería.
    throw new ChatError(
      `El proveedor respondió HTTP ${respuesta.status}: ${texto.slice(0, 300)}`,
      code,
    );
  }

  // Y un fallo puede venir **dentro** del stream, con 200.
  const dentro = errorFromEvents(eventos);
  if (dentro !== null) throw new ChatError(dentro, "SERVER");

  const contenido = textFromEvents(eventos);
  if (contenido.trim() === "") {
    throw new ChatError(
      "El proveedor no devolvió texto. Los eventos que llegaron fueron: " +
        `${[...new Set(eventos.map((evento) => evento.event))].join(", ") || "(ninguno)"}.`,
      "MALFORMED_RESPONSE",
    );
  }

  return {
    content: contenido,
    model: request.model,
    usage: usageFromEvents(eventos),
    latencyMs,
    dialect: "openai-responses",
  };
}
