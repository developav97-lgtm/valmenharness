/**
 * A dónde se le habla a cada proveedor, y en qué dialecto.
 *
 * El routing guarda `provider` y `model` desde el principio, pero los
 * evaluadores solo sabían hablar con OpenRouter: la clave se guardaba, se probaba
 * y no servía para nada. Esto cierra esa distancia.
 *
 * **El protocolo no lo elige el usuario: lo declara el catálogo.** Elegir
 * "proveedor + modelo" no basta, porque en las pasarelas de opencode conviven
 * tres dialectos bajo el mismo host:
 *
 * | Dialecto             | Quién lo habla                                    | Ruta                     |
 * | -------------------- | ------------------------------------------------- | ------------------------ |
 * | `openai-chat`        | GLM, Kimi, DeepSeek, MiMo, y casi todos los demás | `/chat/completions`      |
 * | `anthropic-messages` | Claude, Qwen, MiniMax                             | `/messages`              |
 * | `openai-responses`   | GPT, Grok, Muse Spark                             | `/responses`             |
 *
 * Comprobado contra el catálogo real: `/zen/go/v1/models` devuelve solo
 * `{id, object, created, owned_by}`, así que **el protocolo no se puede deducir
 * del dato**: hay que declararlo aquí. Y lo que no se declara no se finge: pedir
 * un modelo cuyo dialecto no está implementado falla con un mensaje que lo dice,
 * en vez de mandar una petición con la forma equivocada y devolver un error del
 * proveedor que parece otra cosa.
 *
 * Ver docs/04-PROVEEDORES.md §4.
 */
/**
 * Error del catálogo de transporte.
 *
 * Propio y no del núcleo a propósito: este paquete trata de secretos y de
 * destinos, y no tiene por qué conocer el contrato de tickets. Quien lo use
 * decide cómo presentarlo.
 */
export class TransportError extends Error {
  readonly code = "TRANSPORT_UNSUPPORTED";

  constructor(message: string) {
    super(message);
    this.name = "TransportError";
  }
}

/** Falla con el error de este módulo. */
function fail(message: string): never {
  throw new TransportError(message);
}

/** Los dialectos que el harness sabe —o sabrá— hablar. */
export type Protocol =
  | "openai-chat"
  | "anthropic-messages"
  | "openai-responses"
  | "opencode-models";

/** Un destino concreto al que mandar una petición. */
export interface HttpEndpoint {
  readonly provider: string;
  readonly protocol: Protocol;
  readonly url: string;
}

/** Cómo es un proveedor por dentro. */
interface Transport {
  readonly id: string;
  readonly name: string;
  /** Base sin barra final. */
  readonly baseUrl: string;
  /**
   * Dialecto por defecto de sus modelos de chat.
   *
   * Es el que se usa salvo que una regla diga otra cosa.
   */
  readonly defaultProtocol: Protocol;
  /**
   * Modelos que **no** hablan el dialecto por defecto, por prefijo.
   *
   * Se declara por prefijo y no por lista completa porque los catálogos cambian:
   * una lista de 75 identificadores se queda vieja en una semana y entonces el
   * harness manda la petición con la forma equivocada.
   */
  readonly notDefault?: readonly {
    readonly prefix: string;
    readonly protocol: Protocol;
  }[];
  /** Cabeceras que el proveedor exige además de la credencial. */
  readonly headers?: Readonly<Record<string, string>>;
  /**
   * De dónde sale la credencial, cuando no es una clave del harness.
   *
   * `codex` no tiene clave: usa tokens OAuth de su CLI, en su propio archivo, y su
   * backend pide además una cabecera con la cuenta. Se declara aquí y no se adivina
   * por el identificador del proveedor, que sería una lista de casos particulares
   * escondida en el código.
   */
  readonly credential?: "codex";
  /**
   * El dialecto del proveedor entero, cuando no es el de chat.
   *
   * Se declara para que **ningún** modelo de este proveedor caiga en el dialecto
   * por defecto: en codex todos van por `/responses`, y un prefijo que no
   * estuviera en `notDefault` acabaría mandado a `/chat/completions`.
   */
  readonly protocol?: Protocol;
  /**
   * Cómo pide este proveedor una salida estructurada.
   *
   * **Medido, no supuesto**: DeepSeek directo responde
   * `400 This response_format type is unavailable now` a un `json_schema`, que es
   * lo que OpenRouter sí acepta. La capacidad es del proveedor, no del dialecto,
   * así que se declara aquí y el evaluador elige. Un proveedor que no la declare
   * se trata como `json-schema`, que es lo que el harness usa hoy.
   */
  readonly structuredOutput?: "json-schema" | "json-object";
}

/**
 * El catálogo de transporte.
 *
 * Los identificadores coinciden con los de `@valmen/credentials` y con los del
 * Mission Control: una clave configurada en la app tiene que servir aquí sin
 * traducción.
 */
export const TRANSPORTS: readonly Transport[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultProtocol: "openai-chat",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultProtocol: "openai-chat",
    // Verificado con una llamada real: rechaza `response_format: json_schema`
    // con «This response_format type is unavailable now», así que usa
    // `json_object` y el esquema va en el prompt.
    structuredOutput: "json-object",
  },
  {
    id: "moonshot",
    name: "Moonshot",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultProtocol: "openai-chat",
  },
  {
    id: "qwen",
    name: "Qwen (DashScope)",
    // DashScope expone un modo compatible con OpenAI, que es distinto del suyo.
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultProtocol: "openai-chat",
  },
  {
    id: "zhipu",
    name: "Zhipu (GLM)",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultProtocol: "openai-chat",
  },
  {
    // Codex es una suscripción de ChatGPT y **sí tiene API**: `/responses` con
    // streaming obligatorio, y su catálogo en `chatgpt.com/backend-api/codex`.
    // Se creía que su token no servía contra la API de OpenAI; era una suposición.
    id: "codex",
    name: "Codex (suscripción)",
    baseUrl: "https://chatgpt.com/backend-api/codex",
    defaultProtocol: "openai-responses",
    protocol: "openai-responses",
    credential: "codex",
    headers: { originator: "codex_cli_rs" },
  },
  {
    id: "opencode-go",
    name: "opencode Go",
    baseUrl: "https://opencode.ai/zen/go/v1",
    defaultProtocol: "openai-chat",
    notDefault: [
      { prefix: "gpt-", protocol: "openai-responses" },
      { prefix: "grok-", protocol: "openai-responses" },
      { prefix: "muse-spark", protocol: "openai-responses" },
      { prefix: "minimax-", protocol: "anthropic-messages" },
      { prefix: "qwen", protocol: "anthropic-messages" },
    ],
    // Go lo pide para poder enrutar y cachear: un identificador estable por
    // conversación. Sin él, el proveedor avisa de que el cliente es problemático.
    headers: { "x-opencode-session": "valmenharness" },
  },
  {
    id: "opencode-zen",
    name: "opencode Zen",
    baseUrl: "https://opencode.ai/zen/v1",
    defaultProtocol: "openai-chat",
    notDefault: [
      { prefix: "claude-", protocol: "anthropic-messages" },
      { prefix: "qwen", protocol: "anthropic-messages" },
      { prefix: "minimax-", protocol: "anthropic-messages" },
      { prefix: "gpt-", protocol: "openai-responses" },
      { prefix: "grok-", protocol: "openai-responses" },
      { prefix: "muse-spark", protocol: "openai-responses" },
      { prefix: "gemini-", protocol: "opencode-models" },
    ],
  },
  {
    id: "ollama",
    name: "Ollama (local)",
    // Ollama expone una capa compatible con OpenAI desde la 0.1.24.
    baseUrl: "http://127.0.0.1:11434/v1",
    defaultProtocol: "openai-chat",
  },
];

/** El proveedor por defecto cuando el routing no dice ninguno. */
export const DEFAULT_PROVIDER = "openrouter";

/** El dialecto de un modelo dentro de un proveedor. */
export function protocolFor(transport: Transport, model: string): Protocol {
  // El dialecto del proveedor manda sobre el del modelo: en codex no hay modelos
  // de chat, así que una regla por prefijo dejaría fuera a los que no encajen.
  if (transport.protocol !== undefined) return transport.protocol;
  for (const regla of transport.notDefault ?? []) {
    if (model.toLowerCase().startsWith(regla.prefix)) return regla.protocol;
  }
  return transport.defaultProtocol;
}

/** Busca un proveedor por identificador, o falla diciendo cuáles hay. */
export function transportById(id: string): Transport {
  const encontrado = TRANSPORTS.find((t) => t.id === id);
  if (encontrado === undefined) {
    fail(
      `Proveedor desconocido: "${id}". Disponibles: ${TRANSPORTS.map((t) => t.id).join(", ")}.`,
    );
  }
  return encontrado;
}

/**
 * El endpoint de chat de un modelo.
 *
 * Es el único dialecto implementado hoy, así que pedir un modelo que hable otro
 * **falla aquí**, con el dialecto en el mensaje, en vez de mandar una petición
 * con la forma equivocada.
 */
export function resolveChatEndpoint(
  providerId: string,
  model: string,
): HttpEndpoint {
  const transport = transportById(providerId);
  const protocol = protocolFor(transport, model);

  // Dos dialectos, y cada uno tiene su ruta. Los demás siguen sin implementarse, y
  // decirlo es mejor que mandar la petición a la ruta equivocada: el proveedor
  // respondería un error que no habla del dialecto.
  if (protocol === "openai-responses") {
    return { provider: transport.id, protocol, url: `${transport.baseUrl}/responses` };
  }
  if (protocol !== "openai-chat") {
    fail(
      `El modelo "${model}" de ${transport.name} habla el dialecto "${protocol}", ` +
        "y el harness todavía no lo implementa. Elige un modelo que hable " +
        '"openai-chat" o "openai-responses".',
    );
  }

  return {
    provider: transport.id,
    protocol,
    url: `${transport.baseUrl}/chat/completions`,
  };
}

/** Cabeceras extra que el proveedor exige, si exige alguna. */
export function extraHeaders(providerId: string): Readonly<Record<string, string>> {
  return transportById(providerId).headers ?? {};
}

/**
 * Cómo pide este proveedor una salida estructurada.
 *
 * Por defecto `json-schema`, que es lo que el harness usa y lo que OpenRouter
 * acepta. Un proveedor que no lo soporte lo declara y recibe el esquema en el
 * prompt.
 */
export function structuredOutputOf(
  providerId: string,
): "json-schema" | "json-object" {
  return transportById(providerId).structuredOutput ?? "json-schema";
}

/** Todos los proveedores con su dialecto por defecto, para la interfaz. */
export function listTransports(): readonly {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly defaultProtocol: Protocol;
}[] {
  return TRANSPORTS.map((t) => ({
    id: t.id,
    name: t.name,
    baseUrl: t.baseUrl,
    defaultProtocol: t.defaultProtocol,
  }));
}
