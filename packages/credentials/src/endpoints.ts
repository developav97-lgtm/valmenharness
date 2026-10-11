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
  readonly code: "TRANSPORT_UNSUPPORTED" | "TEST_URL_REJECTED" | "TEST_URL_INCOMPLETE";

  /**
   * `TRANSPORT_UNSUPPORTED` por defecto, que es lo que lanza el catálogo; `TEST_URL_REJECTED` es
   * el de una URL de prueba que no es local (`testBaseUrlFor`) y `TEST_URL_INCOMPLETE` el de una
   * cadena a la que le falta la variable de algún eslabón mientras hay una URL de prueba activa
   * (`requireTestRoutes`). La cascada no degrada ninguno de los dos últimos.
   */
  constructor(
    message: string,
    code:
      | "TRANSPORT_UNSUPPORTED"
      | "TEST_URL_REJECTED"
      | "TEST_URL_INCOMPLETE" = "TRANSPORT_UNSUPPORTED",
  ) {
    super(message);
    this.name = "TransportError";
    this.code = code;
  }
}

/** Falla con el error de este módulo. */
function fail(message: string): never {
  throw new TransportError(message);
}

/** Los dialectos que el harness sabe —o sabrá— hablar. */
export type Protocol =
  "openai-chat" | "anthropic-messages" | "openai-responses" | "opencode-models";

/** Un destino concreto al que mandar una petición. */
export interface HttpEndpoint {
  readonly provider: string;
  readonly protocol: Protocol;
  readonly url: string;
  /**
   * La URL salió de `VALMEN_BASE_URL_<ID>` y no del catálogo. Quien llama no manda ninguna
   * credencial ni sigue redirecciones a este destino. Ausente cuando la URL es la del catálogo.
   */
  readonly testUrl?: true;
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
   * escondida en el código. (`claude-code` ya no lee credencial: ver `cli`.)
   */
  readonly credential?: "codex";
  /**
   * El proveedor se habla por el CLI oficial de su dueño y no por HTTP.
   *
   * Existe por `claude-code`: medido el 2026-10-05, la API directa con el token de la
   * suscripción solo dejaba pasar a Haiku (los demás, HTTP 429 «Error»), mientras que
   * `claude -p` con la misma cuenta respondía en todos. El CLI es además dueño de su
   * sesión, así que el harness no lee ninguna credencial de este proveedor. Ver
   * `claude-cli.ts`.
   */
  readonly cli?: "claude";
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
    id: "anthropic",
    name: "Anthropic (clave de API)",
    baseUrl: "https://api.anthropic.com/v1",
    defaultProtocol: "anthropic-messages",
  },
  {
    // La suscripción de Claude Code, por el **CLI oficial** (`claude -p`) y no por
    // HTTP. La API directa con el token OAuth rechazaba con 429 a Sonnet, Opus y
    // Fable (ver `claude-cli.ts`); el CLI, con la misma cuenta, responde en todos.
    // `baseUrl` y `defaultProtocol` se conservan porque describen el dialecto de lo
    // que el CLI habla por dentro —y de ahí que la salida estructurada sea
    // `tool-call`—, pero `callChat` no los usa para este proveedor.
    id: "claude-code",
    name: "Claude Code (suscripción)",
    baseUrl: "https://api.anthropic.com/v1",
    defaultProtocol: "anthropic-messages",
    cli: "claude",
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
    // Zen Go rechaza el esquema JSON estricto; la salida se pide como
    // herramienta forzada, que conserva el contrato del juez.
    structuredOutput: "json-object",
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

/** El prefijo de toda variable de URL de prueba. */
const PREFIJO_DE_URL_BASE = "VALMEN_BASE_URL_";

/** `VALMEN_BASE_URL_<ID>`, con el identificador en mayúsculas y `-` → `_`. */
function nombreDeUrlBase(id: string): string {
  return `${PREFIJO_DE_URL_BASE}${id.toUpperCase().replace(/-/g, "_")}`;
}

/** Los únicos hosts que admite una URL de prueba: el `hostname` ya normalizado por `URL`. */
const HOSTS_DE_PRUEBA: ReadonlySet<string> = new Set(["127.0.0.1", "localhost"]);

/**
 * La URL base de prueba de un transporte, si su variable de entorno la define.
 *
 * `VALMEN_BASE_URL_<ID>`, con el identificador en mayúsculas y `-` → `_` (la misma convención que
 * `<ID>_API_KEY`); jev usa `VALMEN_BASE_URL_JEV`. Sirve para que `valmen gate` hable con un
 * servidor local sin claves ni red.
 *
 * **Es una vía para desviar claves de API, así que solo admite `http:` con host exacto
 * `127.0.0.1` o `localhost`**, comparado sobre el `hostname` que `URL` ya normalizó y nunca por
 * prefijo de texto —`http://127.0.0.1@evil.example` tiene host `evil.example`—. Se rechazan el
 * usuario, la contraseña, la consulta y el fragmento. Una variable ausente, vacía o de solo
 * espacios devuelve `null`. El mensaje del rechazo no repite el valor, que podría traer una
 * contraseña embebida.
 *
 * Devuelve la base sin barras finales: el llamador le agrega la ruta de su dialecto.
 */
export function testBaseUrlFor(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const nombre = nombreDeUrlBase(id);
  const valor = env[nombre]?.trim() ?? "";
  if (valor === "") return null;

  const rechazar = (): never => {
    throw new TransportError(
      `${nombre}: la URL de prueba solo admite localhost (http://127.0.0.1 o http://localhost, ` +
        "con puerto y ruta opcionales, sin usuario, consulta ni fragmento).",
      "TEST_URL_REJECTED",
    );
  };

  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return rechazar();
  }
  if (
    url.protocol !== "http:" ||
    !HOSTS_DE_PRUEBA.has(url.hostname) ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return rechazar();
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * Con una URL de prueba activa, la cadena del evaluador va completa o no corre.
 *
 * Una `VALMEN_BASE_URL_*` desvía **un** transporte hacia un servidor local; los demás eslabones
 * de la cadena seguirían hablando con su proveedor de siempre, con la clave del entorno, y un
 * fallo del servidor local los degradaría hacia ese proveedor. Quien decide el modo prueba es
 * esta función, dueña de los nombres de variable, y no cada borde (CLI, Mission Control, MCP).
 *
 * Devuelve `false`, sin leer nada más, si ninguna `VALMEN_BASE_URL_*` tiene valor: no cambia
 * nada. Con alguna, comprueba cada eslabón de `ids` —`jev` con `VALMEN_BASE_URL_JEV`, un
 * transporte por CLI (`claude-code`) con `VALMEN_CLAUDE_BIN`, el resto con su
 * `VALMEN_BASE_URL_<ID>`— y devuelve `true`, o lanza `TEST_URL_INCOMPLETE` nombrando las
 * variables activas y las que faltan, nunca sus valores. Un valor que no es local lanza
 * `TEST_URL_REJECTED` (`testBaseUrlFor`): el rechazo gana sobre la falta.
 */
export function requireTestRoutes(
  ids: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const activas = Object.keys(env).filter(
    (nombre) =>
      nombre.startsWith(PREFIJO_DE_URL_BASE) && (env[nombre]?.trim() ?? "") !== "",
  );
  if (activas.length === 0) return false;

  const faltan: string[] = [];
  for (const id of new Set(ids)) {
    if (id !== "jev" && transportById(id).cli !== undefined) {
      if ((env["VALMEN_CLAUDE_BIN"]?.trim() ?? "") === "") faltan.push("VALMEN_CLAUDE_BIN");
    } else if (testBaseUrlFor(id, env) === null) {
      faltan.push(nombreDeUrlBase(id));
    }
  }
  if (faltan.length > 0) {
    throw new TransportError(
      `Hay una URL de prueba activa (${activas.join(", ")}) y a la cadena le falta ` +
        `${faltan.join(", ")}: con una URL de prueba, todos los eslabones hablan con el ` +
        "servidor local o la compuerta no corre.",
      "TEST_URL_INCOMPLETE",
    );
  }
  return true;
}

/**
 * El endpoint de chat de un modelo.
 *
 * Es el único dialecto implementado hoy, así que pedir un modelo que hable otro
 * **falla aquí**, con el dialecto en el mensaje, en vez de mandar una petición
 * con la forma equivocada.
 *
 * Con `VALMEN_BASE_URL_<ID>` definida (`testBaseUrlFor`) la base es esa y el endpoint se marca
 * `testUrl`; una variable inválida lanza `TEST_URL_REJECTED` antes de armar nada. `env` existe
 * para que las pruebas no dependan del entorno del proceso.
 */
export function resolveChatEndpoint(
  providerId: string,
  model: string,
  env: NodeJS.ProcessEnv = process.env,
): HttpEndpoint {
  const transport = transportById(providerId);
  // Sin URL que devolver: devolver la de la API sería decir que se llama por ahí.
  if (transport.cli !== undefined) {
    fail(
      `${transport.name} se habla por el CLI oficial (\`claude -p\`) y no tiene un ` +
        "endpoint HTTP. Quien llama debe usar `callChat`, que lo resuelve.",
    );
  }
  const urlDePrueba = testBaseUrlFor(transport.id, env);
  const base = urlDePrueba ?? transport.baseUrl;
  const marca = urlDePrueba === null ? {} : { testUrl: true as const };
  const protocol = protocolFor(transport, model);

  // Tres dialectos, y cada uno tiene su ruta. Los demás siguen sin implementarse, y
  // decirlo es mejor que mandar la petición a la ruta equivocada: el proveedor
  // respondería un error que no habla del dialecto.
  if (protocol === "openai-responses") {
    return { provider: transport.id, protocol, url: `${base}/responses`, ...marca };
  }
  if (protocol === "anthropic-messages") {
    return { provider: transport.id, protocol, url: `${base}/messages`, ...marca };
  }
  if (protocol !== "openai-chat") {
    fail(
      `El modelo "${model}" de ${transport.name} habla el dialecto "${protocol}", ` +
        "y el harness todavía no lo implementa. Elige un modelo que hable " +
        '"openai-chat", "openai-responses" o "anthropic-messages".',
    );
  }

  return {
    provider: transport.id,
    protocol,
    url: `${base}/chat/completions`,
    ...marca,
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
 * prompt; el dialecto de Anthropic lo pide con una **herramienta forzada**, que es
 * su manera de garantizar la forma.
 */
export function structuredOutputOf(
  providerId: string,
): "json-schema" | "json-object" | "tool-call" {
  const transport = transportById(providerId);
  if (transport.defaultProtocol === "anthropic-messages") return "tool-call";
  return transport.structuredOutput ?? "json-schema";
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
