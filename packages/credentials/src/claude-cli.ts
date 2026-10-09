/**
 * El transporte por el CLI oficial de Claude Code.
 *
 * El proveedor `claude-code` hablaba directo con `api.anthropic.com/v1/messages`
 * usando el token OAuth de la suscripción. **Medido el 2026-10-05**, con un plan
 * Max vigente: ese camino solo dejaba pasar a Haiku 4.5, y Sonnet, Opus y Fable
 * respondían HTTP 429 `rate_limit_error` con el mensaje «Error» en ~270 ms, mientras
 * que `claude -p --model claude-sonnet-5-5` —el CLI oficial, la misma cuenta, el mismo
 * minuto— respondía bien. No era cuota: era el rechazo a llamadas directas de un
 * cliente que no es el CLI oficial.
 *
 * Sortearlo imitando al CLI —sus cabeceras, su prompt de sistema— sería esquivar
 * una restricción del proveedor. La vía legítima es la que la propia herramienta
 * documenta para uso programático: `claude -p`, el modo sin interfaz. Este módulo
 * lo invoca y trata su salida como la respuesta de un modelo.
 *
 * Qué cambia respecto al camino HTTP, y por qué conviene:
 *
 * - **El harness ya no toca ninguna credencial de Claude.** El CLI es el dueño de
 *   su sesión: la lee, la renueva y la guarda. Desaparecen de este camino el llavero
 *   de macOS, las entradas duplicadas, el token que caduca a las ocho horas y el
 *   riesgo de pelearse por el `refresh_token` con quien lo rota.
 * - **El esfuerzo sí viaja** (`--effort`), que en el dialecto HTTP no se podía
 *   combinar con la salida estructurada.
 * - **La salida estructurada va por `--json-schema`**, que el CLI impone con su
 *   propia herramienta forzada.
 *
 * Qué hay que cuidar, porque `claude -p` es un **agente** y no un modelo desnudo:
 * por defecto carga la configuración del usuario y del proyecto (hooks, permisos,
 * `CLAUDE.md`, servidores MCP) y puede ejecutar herramientas. Aquí se invoca sin
 * nada de eso —sin herramientas, sin fuentes de configuración, sin MCP, desde un
 * directorio neutro y con un prompt de sistema propio—, así que lo que responde es
 * el modelo y no un agente con el contexto de quien lo lanzó.
 *
 * Y una salvaguarda de facturación: si el entorno trae `ANTHROPIC_API_KEY`, el CLI la
 * usaría **en lugar** de la suscripción y la llamada se facturaría por token sin que
 * nadie lo decidiera. Se retira del entorno del proceso hijo.
 */
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

import {
  ChatError,
  type ChatMessage,
  type ChatResult,
  type StructuredRequest,
} from "./chat.js";

/** El nombre del proveedor que habla por este camino, para los mensajes. */
const NOMBRE = "Claude Code (CLI oficial)";

/**
 * Lo que se espera a que el CLI conteste, en milisegundos.
 *
 * Mayor que el de las llamadas HTTP: el CLI arranca un proceso, y un modelo que
 * razona con una salida estructurada puede tardar. Quien dispara la llamada puede
 * poner el suyo con `timeoutMs`.
 */
const TIMEOUT_CLI_MS = 240_000;

/** Techo de lo que se guarda de la salida de un proceso, para no crecer sin límite. */
const MAX_SALIDA_BYTES = 8 * 1024 * 1024;

/**
 * El prompt de sistema a partir de cuyo tamaño ya no viaja como argumento.
 *
 * Un argumento de línea de comandos tiene tope —128 KB por cadena en Linux—, y
 * pasarlo falla con `E2BIG` sin decir de qué. Un prompt de sistema de un gate mide
 * unos pocos KB; esto es solo para que un caso raro degrade en vez de romperse.
 */
const MAX_SISTEMA_ARGUMENTO = 100_000;

/** Variables que harían que el CLI facture por token en vez de usar la suscripción. */
const VARIABLES_DE_FACTURACION = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
] as const;

/** Lo que se pide ejecutar. */
export interface ClaudeCliRun {
  readonly args: readonly string[];
  /** El prompt, por la entrada estándar: un argumento tiene tope de tamaño. */
  readonly stdin: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal | undefined;
}

/** Lo que dejó la ejecución. */
export interface ClaudeCliOutput {
  /** El código de salida, o `null` si el proceso murió por una señal. */
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  /** El motivo si el proceso no llegó a arrancar —típicamente `ENOENT`—. */
  readonly spawnError: string | null;
}

/** Quien ejecuta el CLI. Inyectable: una prueba no debe lanzar el proceso de verdad. */
export type ClaudeCliRunner = (run: ClaudeCliRun) => Promise<ClaudeCliOutput>;

/** El ejecutable. `VALMEN_CLAUDE_BIN` permite apuntar a una instalación fuera del `PATH`. */
export function claudeBinary(env: NodeJS.ProcessEnv = process.env): string {
  const propio = env["VALMEN_CLAUDE_BIN"];
  return typeof propio === "string" && propio.trim() !== "" ? propio.trim() : "claude";
}

/**
 * El entorno con el que se lanza el CLI.
 *
 * Es el del proceso **sin** las variables que cambiarían la facturación (ver arriba).
 * Un tope de salida declarado por quien llama viaja por la variable que el CLI lee
 * para eso, porque no tiene bandera.
 */
export function claudeCliEnv(
  base: NodeJS.ProcessEnv = process.env,
  maxTokens?: number,
): NodeJS.ProcessEnv {
  const entorno: NodeJS.ProcessEnv = { ...base };
  for (const nombre of VARIABLES_DE_FACTURACION) delete entorno[nombre];
  if (maxTokens !== undefined && Number.isInteger(maxTokens) && maxTokens > 0) {
    entorno["CLAUDE_CODE_MAX_OUTPUT_TOKENS"] = String(maxTokens);
  }
  return entorno;
}

/** Los argumentos de una llamada, sin el prompt (ese va por la entrada estándar). */
export function claudeCliArgs(options: {
  readonly model: string;
  readonly system: string;
  readonly effort?: "auto" | "low" | "medium" | "high" | undefined;
  readonly structured?: StructuredRequest | undefined;
}): string[] {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--model",
    options.model,
    // Sin herramientas, sin configuración heredada, sin MCP y sin rastro en disco:
    // lo que responde es el modelo, no un agente con el contexto de quien lo lanzó.
    "--tools",
    "",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
    // La salida estructurada la entrega una herramienta forzada, que gasta un turno
    // más que una respuesta en texto.
    "--max-turns",
    options.structured === undefined ? "1" : "3",
  ];

  if (options.system !== "") args.push("--system-prompt", options.system);
  if (options.effort !== undefined && options.effort !== "auto") {
    args.push("--effort", options.effort);
  }
  if (options.structured !== undefined) {
    args.push("--json-schema", JSON.stringify(options.structured.schema));
  }
  return args;
}

/**
 * El prompt de usuario a partir del historial.
 *
 * El CLI recibe un solo prompt, no una lista de mensajes. Con un único mensaje de
 * usuario —el caso de un gate o de una descomposición— va tal cual; con más, el
 * historial se escribe como una conversación rotulada, que es lo que el chat de
 * Mission Control manda.
 */
export function claudeCliPrompt(messages: readonly ChatMessage[]): string {
  const conversacion = messages.filter((mensaje) => mensaje.role !== "system");
  if (conversacion.length === 1) return (conversacion[0] as ChatMessage).content;
  return conversacion
    .map(
      (mensaje) =>
        `${mensaje.role === "user" ? "Usuario" : "Asistente"}:\n${mensaje.content}`,
    )
    .join("\n\n");
}

/** El prompt de sistema: los mensajes `system` juntos, o uno mínimo si no hay. */
function sistemaDe(messages: readonly ChatMessage[]): string {
  const sistema = messages
    .filter((mensaje) => mensaje.role === "system")
    .map((mensaje) => mensaje.content)
    .join("\n\n");
  // Sin uno propio el CLI usaría el suyo, que describe a un agente de código y
  // empujaría la respuesta hacia ese papel.
  return sistema === "" ? "Responde exactamente lo que se pide, sin preámbulo." : sistema;
}

/**
 * El ejecutor real: lanza el CLI y recoge su salida.
 *
 * El proceso se lanza en **su propio grupo** y, si hay que cortarlo, se mata el grupo
 * entero: el CLI puede dejar procesos hijos, y uno que conserve abiertas las
 * tuberías impide que `close` llegue nunca, con lo que la llamada quedaría colgada
 * más allá de su tiempo máximo. Y aun así no se espera indefinidamente.
 */
export const runClaudeCli: ClaudeCliRunner = (run) =>
  new Promise((resolve) => {
    const enGrupo = process.platform !== "win32";
    let hijo: ReturnType<typeof spawn>;
    try {
      hijo = spawn(claudeBinary(run.env), [...run.args], {
        cwd: run.cwd,
        env: run.env,
        stdio: ["pipe", "pipe", "pipe"],
        detached: enGrupo,
      });
    } catch (caught) {
      resolve({
        status: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        spawnError: caught instanceof Error ? caught.message : String(caught),
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let spawnError: string | null = null;
    let terminado = false;

    const terminar = (status: number | null): void => {
      if (terminado) return;
      terminado = true;
      clearTimeout(temporizador);
      run.signal?.removeEventListener("abort", alAbortar);
      resolve({ status, stdout, stderr, timedOut, spawnError });
    };
    const señalar = (señal: NodeJS.Signals): void => {
      try {
        if (enGrupo && hijo.pid !== undefined) process.kill(-hijo.pid, señal);
        else hijo.kill(señal);
      } catch {
        // Ya había terminado: no hay nada que cortar.
      }
    };
    const matar = (): void => {
      if (terminado) return;
      señalar("SIGTERM");
      // Un proceso que no atiende SIGTERM no puede dejar la llamada colgada.
      setTimeout(() => señalar("SIGKILL"), 2_000).unref();
      // Y si un hijo retiene las tuberías, `close` no llega: no se espera para siempre.
      setTimeout(() => terminar(null), 5_000).unref();
    };
    const temporizador = setTimeout(() => {
      timedOut = true;
      matar();
    }, run.timeoutMs);
    const alAbortar = (): void => {
      timedOut = true;
      matar();
    };
    if (run.signal?.aborted === true) alAbortar();
    run.signal?.addEventListener("abort", alAbortar, { once: true });

    hijo.stdout?.on("data", (trozo: Buffer) => {
      if (stdout.length < MAX_SALIDA_BYTES) stdout += trozo.toString("utf8");
    });
    hijo.stderr?.on("data", (trozo: Buffer) => {
      if (stderr.length < 64 * 1024) stderr += trozo.toString("utf8");
    });
    // Un proceso que termina antes de leer su entrada cierra la tubería: no es un
    // error de este lado, y sin el manejador sería una excepción no capturada.
    hijo.stdin?.on("error", () => undefined);
    // Un proceso que no llega a arrancar —`ENOENT`— no siempre emite `close`.
    hijo.on("error", (error: Error) => {
      spawnError = error.message;
      terminar(null);
    });
    hijo.on("close", (status: number | null) => terminar(status));

    hijo.stdin?.end(run.stdin);
  });

/** Una línea, sin espacios repetidos, de a lo más 300 caracteres. */
function limpiar(texto: string): string {
  return texto.replace(/\s+/g, " ").trim().slice(0, 300);
}

/** La parte del resultado que importa, ya leída. */
interface ResultadoDelCli {
  readonly is_error?: boolean;
  readonly subtype?: string;
  readonly terminal_reason?: string;
  readonly errors?: readonly unknown[];
  readonly api_error_status?: number | null;
  readonly result?: string;
  readonly structured_output?: unknown;
  readonly stop_reason?: string | null;
  readonly num_turns?: number;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly cache_creation_input_tokens?: number;
    readonly cache_read_input_tokens?: number;
  };
  readonly modelUsage?: Record<string, unknown>;
}

/** Lee la salida `--output-format json`, que es un objeto —o una lista cuyo último `result` vale—. */
function leerResultado(stdout: string): ResultadoDelCli | null {
  let datos: unknown;
  try {
    datos = JSON.parse(stdout) as unknown;
  } catch {
    return null;
  }
  if (Array.isArray(datos)) {
    const resultado = [...datos]
      .reverse()
      .find((item) => (item as { type?: string } | null)?.type === "result");
    return (resultado as ResultadoDelCli | undefined) ?? null;
  }
  return typeof datos === "object" && datos !== null ? (datos as ResultadoDelCli) : null;
}

/** La clase de un fallo que el CLI reporta, para que quien llama decida qué hacer. */
function codigoDeError(estado: number | null | undefined, texto: string): string {
  if (
    /not logged in|\/login|please run .*login|invalid api key|authentication/i.test(texto)
  ) {
    return "AUTH";
  }
  if (estado === 401 || estado === 403) return "AUTH";
  if (estado === 429) return "RATE_LIMIT";
  if (typeof estado === "number" && estado >= 500) return "SERVER";
  return "INVALID_REQUEST";
}

/** Lo que se le dice a quien tiene que arreglarlo, según el código. */
const REMEDIO: Readonly<Record<string, string>> = {
  AUTH: " Ejecuta `claude auth login` en una terminal y vuelve a intentar.",
  RATE_LIMIT:
    " El CLI oficial reporta límite de uso: espera a que se renueve la ventana del plan.",
};

/** Qué pide una llamada. */
export interface ClaudeCliRequest {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly structured?: StructuredRequest | undefined;
  readonly effort?: "auto" | "low" | "medium" | "high" | undefined;
  readonly maxTokens?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly runner?: ClaudeCliRunner | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
}

/**
 * Pide una respuesta al modelo por el CLI oficial.
 *
 * Devuelve la misma forma que el resto de transportes, para que el juez de un gate,
 * el descomponedor de una feature y el chat no se enteren de por dónde se habló.
 * El coste no se informa —`costUsd: null`—, igual que en los demás proveedores de
 * suscripción: el CLI da un `total_cost_usd`, pero es el equivalente a la tarifa
 * de la API y el plan no lo cobra, así que registrarlo como gasto sería un número
 * con forma de medición que no lo es.
 */
export async function callClaudeCli(request: ClaudeCliRequest): Promise<ChatResult> {
  const runner = request.runner ?? runClaudeCli;
  const timeoutMs = request.timeoutMs ?? TIMEOUT_CLI_MS;

  let sistema = sistemaDe(request.messages);
  let prompt = claudeCliPrompt(request.messages);
  if (sistema.length > MAX_SISTEMA_ARGUMENTO) {
    prompt = `${sistema}\n\n${prompt}`;
    sistema = "";
  }

  const inicio = Date.now();
  const salida = await runner({
    args: claudeCliArgs({
      model: request.model,
      system: sistema,
      effort: request.effort,
      structured: request.structured,
    }),
    stdin: prompt,
    // Un directorio neutro: el CLI descubre `CLAUDE.md`, `.mcp.json` y la
    // configuración de proyecto por donde se lo lance, y no deben entrar.
    cwd: tmpdir(),
    env: claudeCliEnv(request.env ?? process.env, request.maxTokens),
    timeoutMs,
    signal: request.signal,
  });
  const latencyMs = Date.now() - inicio;

  if (salida.spawnError !== null) {
    const noEncontrado = /ENOENT/.test(salida.spawnError);
    throw new ChatError(
      noEncontrado
        ? `No se encontró el CLI \`${claudeBinary(request.env ?? process.env)}\` en el PATH. ` +
            "Instala Claude Code y ejecuta `claude auth login`, o apunta VALMEN_CLAUDE_BIN a su ruta."
        : `No se pudo lanzar el CLI de Claude Code: ${salida.spawnError}`,
      noEncontrado ? "CREDENTIAL_MISSING" : "TRANSPORT",
    );
  }
  if (salida.timedOut) {
    throw new ChatError(
      `La llamada a ${NOMBRE} superó el tiempo máximo de ${timeoutMs} ms.`,
      "TIMEOUT",
    );
  }

  const resultado = leerResultado(salida.stdout);
  if (resultado === null) {
    // Sin JSON no hay forma de saber qué pasó, salvo lo que el proceso escribió.
    const cola = salida.stderr.trim().slice(0, 300);
    throw new ChatError(
      `${NOMBRE} terminó con código ${salida.status ?? "?"} y sin una respuesta legible` +
        (cola === "" ? "." : `: ${cola}`),
      "TRANSPORT",
    );
  }

  if (resultado.is_error === true) {
    const texto = (resultado.result ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    const codigo = codigoDeError(resultado.api_error_status, texto);
    const estado =
      typeof resultado.api_error_status === "number"
        ? `HTTP ${resultado.api_error_status}`
        : "un error";
    // Cuando el CLI falla sin `result` (un tope de reintentos de salida estructurada, por
    // ejemplo) lo que explica el fallo está en el subtipo, el motivo de término, `errors` y
    // stderr: se conserva en el mensaje, y «sin detalle» queda para cuando de verdad no hay nada.
    const primerError =
      Array.isArray(resultado.errors) && resultado.errors.length > 0
        ? limpiar(typeof resultado.errors[0] === "string" ? resultado.errors[0] : JSON.stringify(resultado.errors[0]))
        : "";
    const cola = limpiar(salida.stderr);
    const partes = [
      texto,
      resultado.subtype === undefined ? "" : `subtype ${resultado.subtype}`,
      resultado.terminal_reason === undefined ? "" : `terminal_reason ${resultado.terminal_reason}`,
      primerError === "" ? "" : `errors[0] ${primerError}`,
      cola === "" ? "" : `stderr ${cola}`,
    ].filter((parte) => parte !== "");
    if (partes.length > 0) partes.push(`código de salida ${salida.status ?? "?"}`);
    throw new ChatError(
      `${NOMBRE} respondió ${estado}: ${partes.length === 0 ? "sin detalle" : partes.join("; ")}.${REMEDIO[codigo] ?? ""}`,
      codigo,
    );
  }

  const estructurado = resultado.structured_output;
  const contenido =
    estructurado !== undefined && estructurado !== null
      ? JSON.stringify(estructurado)
      : (resultado.result ?? "").trim();
  if (contenido === "") {
    // La forma de lo que llegó, para distinguir un tope de turnos de una respuesta
    // vacía: son causas distintas con el mismo síntoma.
    const detalle = [
      resultado.subtype === undefined ? null : `subtype ${resultado.subtype}`,
      resultado.num_turns === undefined ? null : `${resultado.num_turns} turno(s)`,
      resultado.stop_reason ? `paró por "${resultado.stop_reason}"` : null,
    ].filter((parte): parte is string => parte !== null);
    throw new ChatError(
      `${NOMBRE} no devolvió contenido${detalle.length === 0 ? "." : ` (${detalle.join(", ")}).`}`,
      "MALFORMED_RESPONSE",
    );
  }

  const usados = Object.keys(resultado.modelUsage ?? {});
  // El CLI puede usar otro modelo para tareas internas; el que importa es el pedido.
  const modelo =
    usados.find((id) => id === request.model || id.startsWith(request.model)) ??
    usados[0] ??
    request.model;
  const uso = resultado.usage ?? {};

  return {
    content: contenido,
    model: modelo,
    usage: {
      // La entrada completa: la que se pagó normal, la que se escribió en caché y la
      // que se leyó de ella. Sin sumarlas, un prompt cacheado parece de dos tokens.
      inputTokens:
        (uso.input_tokens ?? 0) +
        (uso.cache_creation_input_tokens ?? 0) +
        (uso.cache_read_input_tokens ?? 0),
      outputTokens: uso.output_tokens ?? 0,
      costUsd: null,
    },
    latencyMs,
    dialect: request.structured === undefined ? "text" : "tool-call",
  };
}

/** La sesión del CLI, tal como la reporta `claude auth status`. */
export interface ClaudeCliAuth {
  readonly loggedIn: boolean;
  /** `claude.ai` para una suscripción; otra cosa para una cuenta de Console. */
  readonly authMethod: string | null;
  readonly email: string | null;
  readonly subscriptionType: string | null;
  /** Una frase lista para mostrar, también cuando no hay sesión. */
  readonly detail: string;
}

/** Quien ejecuta `claude auth status`, de forma síncrona. Inyectable por lo mismo. */
export type ClaudeCliStatusRunner = (env: NodeJS.ProcessEnv) => {
  readonly status: number | null;
  readonly stdout: string;
  readonly error: string | null;
};

const statusReal: ClaudeCliStatusRunner = (env) => {
  const resultado = spawnSync(claudeBinary(env), ["auth", "status"], {
    cwd: tmpdir(),
    env,
    encoding: "utf8",
    timeout: 15_000,
  });
  return {
    status: resultado.status,
    stdout: resultado.stdout ?? "",
    error: resultado.error === undefined ? null : resultado.error.message,
  };
};

/**
 * ¿Hay una sesión de Claude en el CLI?
 *
 * Es la única comprobación de credencial que hace falta y **no gasta cuota**: el
 * CLI responde desde su propio estado. Síncrona porque el estado de los
 * proveedores se calcula en un solo paso, y sin lanzar: lo que falla se devuelve
 * dicho, con el comando que lo arregla.
 */
export function readClaudeCliAuth(
  options: {
    readonly env?: NodeJS.ProcessEnv | undefined;
    readonly runner?: ClaudeCliStatusRunner | undefined;
  } = {},
): ClaudeCliAuth {
  const env = claudeCliEnv(options.env ?? process.env);
  const salida = (options.runner ?? statusReal)(env);

  if (salida.error !== null) {
    const noEncontrado = /ENOENT/.test(salida.error);
    return {
      loggedIn: false,
      authMethod: null,
      email: null,
      subscriptionType: null,
      detail: noEncontrado
        ? `No se encontró el CLI \`${claudeBinary(env)}\` en el PATH. Instala Claude Code, o apunta VALMEN_CLAUDE_BIN a su ruta.`
        : `No se pudo consultar la sesión del CLI de Claude Code: ${salida.error}`,
    };
  }

  let datos: Record<string, unknown> | null = null;
  try {
    const leido = JSON.parse(salida.stdout) as unknown;
    if (typeof leido === "object" && leido !== null)
      datos = leido as Record<string, unknown>;
  } catch {
    datos = null;
  }

  const texto = (valor: unknown): string | null =>
    typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;

  if (datos === null || datos["loggedIn"] !== true) {
    return {
      loggedIn: false,
      authMethod: datos === null ? null : texto(datos["authMethod"]),
      email: null,
      subscriptionType: null,
      detail:
        "El CLI de Claude Code no tiene una sesión. Ejecuta `claude auth login` en una terminal.",
    };
  }

  const authMethod = texto(datos["authMethod"]);
  const email = texto(datos["email"]);
  const plan = texto(datos["subscriptionType"]);
  return {
    loggedIn: true,
    authMethod,
    email,
    subscriptionType: plan,
    detail:
      `Sesión de Claude activa${plan === null ? "" : ` (plan ${plan})`}` +
      `${email === null ? "" : ` · ${email}`}.`,
  };
}
