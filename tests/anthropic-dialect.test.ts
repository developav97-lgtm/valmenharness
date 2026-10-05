/**
 * El dialecto `anthropic-messages` y la credencial de Claude Code.
 *
 * Existen porque el catálogo **declaraba** este dialecto y no lo implementaba: los
 * `claude-*` de opencode Zen ya estaban mapeados a `/messages`, así que elegir un
 * Claude en el selector terminaba en «el harness todavía no lo implementa». Un
 * catálogo que promete un camino que no tiene manda al usuario a buscar el
 * problema en su clave.
 *
 * Lo que se protege aquí:
 *
 * 1. **El cuerpo es el de este dialecto.** El sistema viaja en `system` —no como un
 *    mensaje más—, `max_tokens` va siempre porque el proveedor lo exige, y la
 *    salida estructurada se pide con una **herramienta forzada**, que es la única
 *    forma de garantizar la forma en este dialecto.
 * 2. **La cabecera depende de qué sea el token.** Una clave de API va en
 *    `x-api-key`; un token de suscripción, en `Authorization` con su
 *    `anthropic-beta`. Confundirlas responde `invalid x-api-key`, que no dice nada
 *    del problema real.
 * 3. **La credencial se lee de donde está.** En macOS el token de Claude Code vive
 *    en el llavero y no en un archivo: un lector que solo mirara el archivo diría
 *    «no está autenticado» con la sesión viva.
 * 4. **Un token caducado se dice.** El harness no renueva el `refresh_token` de
 *    otro —dos clientes renovando a la vez rompen la sesión—, así que avisa con el
 *    comando que lo arregla en vez de dejar que el proveedor conteste un 401 que
 *    habla de otra cosa.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ANTHROPIC_DEFAULT_MAX_TOKENS,
  anthropicAuthHeaders,
  anthropicContent,
  callAnthropic,
} from "../packages/credentials/src/anthropic.js";
import {
  CLAUDE_KEYCHAIN_SERVICE,
  ClaudeCodeCredentialError,
  EXPLICACION_429_CLAUDE_CODE,
  type EjecutarSecurity,
  claudeCodeCredentialsPath,
  desdeLlavero,
  hayCredencialDeClaudeCode,
  readClaudeCodeCredential,
} from "../packages/credentials/src/claude-code.js";
import {
  resolveChatEndpoint,
  structuredOutputOf,
} from "../packages/credentials/src/endpoints.js";
import { ChatError, callChat } from "../packages/credentials/src/chat.js";
import type { ClaudeCliRun } from "../packages/credentials/src/claude-cli.js";

let lab: string;

/**
 * Un llavero vacío.
 *
 * La lectura real consulta el llavero de macOS, y una prueba no puede depender de
 * la sesión de la máquina que la corre: el resultado cambiaría según quién esté
 * autenticado. Se inyecta uno vacío y el camino del llavero se prueba aparte, con
 * lo que devuelve inyectado.
 */
const SIN_LLAVERO = (): string | null => null;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-anthropic-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Una respuesta de este dialecto, con el texto que se le pida. */
function respuestaConTexto(texto: string): Response {
  return new Response(
    JSON.stringify({
      id: "msg_1",
      model: "claude-sonnet-5",
      content: [{ type: "text", text: texto }],
      stop_reason: "end_turn",
      usage: { input_tokens: 120, output_tokens: 34 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** Un `fetch` que guarda la petición y responde lo que se le diga. */
function fetchQueCaptura(respuesta: Response): {
  readonly llamadas: { url: string; init: RequestInit }[];
  readonly fetch: typeof fetch;
} {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const falso = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    return respuesta;
  }) as unknown as typeof fetch;
  return { llamadas, fetch: falso };
}

/** El cuerpo JSON de la llamada capturada. */
function cuerpoDe(init: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

/** Las cabeceras de la llamada capturada. */
function cabecerasDe(init: RequestInit): Record<string, string> {
  return init.headers as Record<string, string>;
}

describe("el dialecto de Anthropic", () => {
  it("va a `/messages`, no a `/chat/completions`", () => {
    expect(resolveChatEndpoint("anthropic", "claude-sonnet-5").url).toBe(
      "https://api.anthropic.com/v1/messages",
    );
    // Y los Claude de la pasarela de opencode, que estaban declarados desde el
    // principio y no tenían camino.
    expect(resolveChatEndpoint("opencode-zen", "claude-sonnet-4-6").url).toBe(
      "https://opencode.ai/zen/v1/messages",
    );
  });

  it("`claude-code` no tiene endpoint HTTP: se habla por el CLI oficial", () => {
    // Medido el 2026-10-05: la API directa con el token de la suscripción solo dejaba
    // pasar a Haiku. Devolver aquí la URL de la API sería decir que se llama por ahí.
    expect(() => resolveChatEndpoint("claude-code", "claude-opus-4-8")).toThrowError(
      /CLI oficial/,
    );
  });

  it("pide la salida estructurada con una herramienta forzada", () => {
    // No hay `response_format` en este dialecto: la forma se garantiza forzando la
    // herramienta, y sin forzarla el modelo puede contestar en prosa.
    expect(structuredOutputOf("anthropic")).toBe("tool-call");
    expect(structuredOutputOf("claude-code")).toBe("tool-call");
    expect(structuredOutputOf("openrouter")).toBe("json-schema");
  });

  it("manda el sistema aparte y `max_tokens` siempre", async () => {
    const { llamadas, fetch: falso } = fetchQueCaptura(respuestaConTexto("hola"));
    await callAnthropic(
      {
        url: "https://api.anthropic.com/v1/messages",
        headers: anthropicAuthHeaders("sk-ant-api03-abc"),
        model: "claude-sonnet-5",
        messages: [
          { role: "system", content: "Sos un evaluador." },
          { role: "user", content: "¿Vale?" },
        ],
      },
      falso,
    );

    const cuerpo = cuerpoDe(llamadas[0]?.init as RequestInit);
    expect(cuerpo["system"]).toBe("Sos un evaluador.");
    // El sistema **no** viaja como un mensaje más: este dialecto lo rechaza.
    expect(cuerpo["messages"]).toEqual([{ role: "user", content: "¿Vale?" }]);
    // Obligatorio: sin `max_tokens` responde 400.
    expect(cuerpo["max_tokens"]).toBe(ANTHROPIC_DEFAULT_MAX_TOKENS);
  });

  it("devuelve el objeto de la herramienta cuando el modelo la usa", async () => {
    const respuesta = new Response(
      JSON.stringify({
        model: "claude-sonnet-5",
        content: [
          { type: "text", text: "Pensé esto." },
          { type: "tool_use", name: "gate_judgement", input: { holds: true } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
      { status: 200 },
    );
    const { llamadas, fetch: falso } = fetchQueCaptura(respuesta);

    const resultado = await callAnthropic(
      {
        url: "https://api.anthropic.com/v1/messages",
        headers: anthropicAuthHeaders("sk-ant-api03-abc"),
        model: "claude-sonnet-5",
        messages: [{ role: "user", content: "juzgá" }],
        structured: {
          name: "gate_judgement",
          schema: { type: "object", properties: { holds: { type: "boolean" } } },
        },
      },
      falso,
    );

    const cuerpo = cuerpoDe(llamadas[0]?.init as RequestInit);
    expect(cuerpo["tool_choice"]).toEqual({ type: "tool", name: "gate_judgement" });
    expect(resultado.content).toBe('{"holds":true}');
    expect(resultado.dialect).toBe("tool-call");
    expect(resultado.usage).toEqual({ inputTokens: 10, outputTokens: 5, costUsd: null });
  });

  it("junta los bloques de texto y prefiere la herramienta", () => {
    // Una respuesta larga llega en varios bloques: quedarse con el primero
    // devolvería media respuesta sin decirlo.
    expect(
      anthropicContent([
        { type: "text", text: "pri" },
        { type: "text", text: "mera" },
      ]),
    ).toBe("primera");
    expect(
      anthropicContent([
        { type: "text", text: "prosa" },
        { type: "tool_use", input: { a: 1 } },
      ]),
    ).toBe('{"a":1}');
    expect(anthropicContent([{ type: "thinking" }])).toBeNull();
  });

  it("un error del proveedor viaja tal cual, sin parafrasear", async () => {
    const respuesta = new Response(
      JSON.stringify({
        type: "error",
        error: { type: "invalid_request_error", message: "credit balance is too low" },
      }),
      { status: 400 },
    );
    const { fetch: falso } = fetchQueCaptura(respuesta);

    await expect(
      callAnthropic(
        {
          url: "https://api.anthropic.com/v1/messages",
          headers: anthropicAuthHeaders("sk-ant-api03-abc"),
          model: "claude-sonnet-5",
          messages: [{ role: "user", content: "hola" }],
        },
        falso,
      ),
    ).rejects.toThrowError(/credit balance is too low/);
  });

  it("un 429 con token de suscripción explica que no suele ser cuota", async () => {
    // Medido el 2026-10-05: con una sesión Max vigente, las llamadas directas solo
    // pasan con Haiku; con los modelos grandes responde 429 «Error» en ~270 ms,
    // y el CLI oficial responde bien con la misma cuenta. El mensaje del
    // proveedor viaja tal cual y la explicación se añade detrás.
    const cuerpoReal = JSON.stringify({
      type: "error",
      error: { type: "rate_limit_error", message: "Error" },
    });
    const { fetch: falso } = fetchQueCaptura(new Response(cuerpoReal, { status: 429 }));

    const error = await callAnthropic(
      {
        url: "https://api.anthropic.com/v1/messages",
        // valmen:allow-secret — token inventado del test, no una credencial real
        headers: anthropicAuthHeaders("sk-ant-oat01-abc"),
        model: "claude-sonnet-5-5",
        messages: [{ role: "user", content: "hola" }],
      },
      falso,
    ).catch((caught: unknown) => caught as ChatError);

    expect(error).toBeInstanceOf(ChatError);
    expect((error as ChatError).code).toBe("RATE_LIMIT");
    expect((error as ChatError).message).toContain(cuerpoReal);
    expect((error as ChatError).message).toContain(EXPLICACION_429_CLAUDE_CODE);
    expect((error as ChatError).message).toContain("`anthropic`");
    // Nunca el token.
    expect((error as ChatError).message).not.toContain("sk-ant-oat01-abc");
  });

  it("un 429 con clave de API no lleva la nota de la suscripción", async () => {
    // Con una clave de API un 429 sí puede ser cuota, y decir lo contrario
    // mandaría a buscar el problema donde no está.
    const { fetch: falso } = fetchQueCaptura(
      new Response('{"type":"error","error":{"type":"rate_limit_error"}}', { status: 429 }),
    );

    const error = await callAnthropic(
      {
        url: "https://api.anthropic.com/v1/messages",
        // valmen:allow-secret — clave inventada del test
        headers: anthropicAuthHeaders("sk-ant-api03-abc"),
        model: "claude-sonnet-5",
        messages: [{ role: "user", content: "hola" }],
      },
      falso,
    ).catch((caught: unknown) => caught as ChatError);

    expect((error as ChatError).code).toBe("RATE_LIMIT");
    expect((error as ChatError).message).not.toContain("CLI oficial");
  });

  it("una respuesta sin contenido dice qué bloques traía", async () => {
    const respuesta = new Response(
      JSON.stringify({ content: [], stop_reason: "max_tokens", usage: {} }),
      { status: 200 },
    );
    const { fetch: falso } = fetchQueCaptura(respuesta);
    await expect(
      callAnthropic(
        {
          url: "https://api.anthropic.com/v1/messages",
          headers: anthropicAuthHeaders("sk-ant-api03-abc"),
          model: "claude-sonnet-5",
          messages: [{ role: "user", content: "hola" }],
        },
        falso,
      ),
    ).rejects.toThrowError(/max_tokens/);
  });
});

describe("la cabecera según qué sea el token", () => {
  it("una clave de API va en `x-api-key`", () => {
    const cabeceras = anthropicAuthHeaders("sk-ant-api03-abc");
    expect(cabeceras["x-api-key"]).toBe("sk-ant-api03-abc");
    expect(cabeceras["Authorization"]).toBeUndefined();
    expect(cabeceras["anthropic-version"]).toBe("2023-06-01");
  });

  it("un token de suscripción va en `Authorization` con su beta", () => {
    const cabeceras = anthropicAuthHeaders("sk-ant-oat01-xyz");
    expect(cabeceras["Authorization"]).toBe("Bearer sk-ant-oat01-xyz");
    expect(cabeceras["anthropic-beta"]).toBe("oauth-2025-04-20");
    expect(cabeceras["x-api-key"]).toBeUndefined();
  });
});

describe("la credencial de Claude Code", () => {
  /** Escribe el archivo de credenciales como lo deja su CLI. */
  function escribirCredencial(contenido: unknown): void {
    const ruta = claudeCodeCredentialsPath(lab);
    mkdirSync(join(ruta, ".."), { recursive: true });
    writeFileSync(ruta, JSON.stringify(contenido), "utf8");
  }

  it("lee el token del archivo, con su plan y su caducidad", () => {
    escribirCredencial({
      claudeAiOauth: {
        // valmen:allow-secret — token inventado del test, no una credencial real
        accessToken: "sk-ant-oat01-abc",
        refreshToken: "sk-ant-ort01-xyz",
        expiresAt: Date.now() + 3_600_000,
        subscriptionType: "pro",
      },
    });

    const credencial = readClaudeCodeCredential(lab, Date.now(), SIN_LLAVERO);
    expect(credencial.accessToken).toBe("sk-ant-oat01-abc");
    expect(credencial.kind).toBe("oauth");
    expect(credencial.source).toBe("archivo");
    expect(credencial.subscriptionType).toBe("pro");
    expect(hayCredencialDeClaudeCode(lab, SIN_LLAVERO)).toBe(true);
  });

  it("distingue una clave de API de un token de sesión", () => {
    // La diferencia decide la cabecera, así que se deduce del valor y no se
    // supone por el proveedor.
    // valmen:allow-secret — clave inventada del test
    escribirCredencial({ claudeAiOauth: { accessToken: "sk-ant-api03-abc" } });
    expect(readClaudeCodeCredential(lab, Date.now(), SIN_LLAVERO).kind).toBe("api-key");

    // valmen:allow-secret — clave inventada del test
    escribirCredencial({ primaryApiKey: "sk-ant-api03-otra" });
    const credencial = readClaudeCodeCredential(lab, Date.now(), SIN_LLAVERO);
    expect(credencial.kind).toBe("api-key");
    expect(credencial.expiresAt).toBeNull();
  });

  it("un token caducado se dice con el comando que lo arregla", () => {
    // El harness no renueva el `refresh_token` de otro: dos clientes renovando a
    // la vez rompen la sesión. Se avisa en vez de dejar que el proveedor conteste
    // un 401 que habla de una clave inválida.
    escribirCredencial({
      claudeAiOauth: {
        // valmen:allow-secret — token inventado del test, no una credencial real
        accessToken: "sk-ant-oat01-abc",
        expiresAt: Date.parse("2026-04-29T05:06:00Z"),
      },
    });

    expect(() =>
      readClaudeCodeCredential(lab, Date.parse("2026-09-25T00:00:00Z"), SIN_LLAVERO),
    ).toThrowError(ClaudeCodeCredentialError);
    expect(() =>
      readClaudeCodeCredential(lab, Date.parse("2026-09-25T00:00:00Z"), SIN_LLAVERO),
    ).toThrowError(/`claude` una vez/);
    // Un token sin fecha no se puede considerar caducado: se intenta.
    // valmen:allow-secret — token inventado del test
    escribirCredencial({ claudeAiOauth: { accessToken: "sk-ant-oat01-abc" } });
    expect(readClaudeCodeCredential(lab, Date.now(), SIN_LLAVERO).expiresAt).toBeNull();
  });

  it("sin credencial explica dónde vive en cada sistema", () => {
    expect(() => readClaudeCodeCredential(lab, Date.now(), SIN_LLAVERO)).toThrowError(
      /llavero/,
    );
    expect(() => readClaudeCodeCredential(lab, Date.now(), SIN_LLAVERO)).toThrowError(
      /\.claude\/\.credentials\.json/,
    );
    expect(hayCredencialDeClaudeCode(lab, SIN_LLAVERO)).toBe(false);
  });

  it("unas credenciales ilegibles no se confunden con una sesión viva", () => {
    const ruta = claudeCodeCredentialsPath(lab);
    mkdirSync(join(ruta, ".."), { recursive: true });
    writeFileSync(ruta, "{ esto no es json", "utf8");
    expect(() => readClaudeCodeCredential(lab, Date.now(), SIN_LLAVERO)).toThrowError(
      /no son JSON válido/,
    );
  });
});

describe("el llavero de macOS", () => {
  const USUARIO = "juan";
  const AHORA = Date.parse("2026-10-05T12:00:00Z");

  /**
   * Lo que guarda cada entrada del llavero, como lo deja el CLI.
   *
   * Son las dos de la máquina donde se vio el fallo: la vieja, de la cuenta
   * `root`, con un token Pro caducado el 2026-04-29, y la vigente, de la cuenta
   * del usuario, con el plan max.
   */
  const ENTRADA_VIEJA = JSON.stringify({
    claudeAiOauth: {
      // valmen:allow-secret — token inventado del test, no una credencial real
      accessToken: "sk-ant-oat01-vieja",
      expiresAt: Date.parse("2026-04-29T00:00:00Z"),
      subscriptionType: "pro",
    },
  });
  const ENTRADA_VIGENTE = JSON.stringify({
    claudeAiOauth: {
      // valmen:allow-secret — token inventado del test, no una credencial real
      accessToken: "sk-ant-oat01-vigente",
      expiresAt: AHORA + 3_600_000,
      subscriptionType: "max",
    },
  });

  /** El valor de `-a` en los argumentos, o `null` si no lo traen. */
  function cuentaDe(argumentos: readonly string[]): string | null {
    const indice = argumentos.indexOf("-a");
    return indice === -1 ? null : (argumentos[indice + 1] ?? null);
  }

  /**
   * Un `security` con varias entradas del mismo servicio.
   *
   * Imita lo que hace el real: con `-a` devuelve la entrada de esa cuenta, y sin
   * `-a` devuelve **la primera que encuentra**, que es la vieja. Guarda los
   * argumentos de cada llamada para poder comprobar en qué orden se buscó.
   */
  function llaveroConDosEntradas(entradas: Readonly<Record<string, string>>): {
    readonly ejecutar: EjecutarSecurity;
    readonly llamadas: (readonly string[])[];
  } {
    const llamadas: (readonly string[])[] = [];
    const ejecutar: EjecutarSecurity = (argumentos) => {
      llamadas.push(argumentos);
      if (argumentos[0] !== "find-generic-password") return null;
      if (argumentos[argumentos.indexOf("-s") + 1] !== CLAUDE_KEYCHAIN_SERVICE) return null;
      const cuenta = cuentaDe(argumentos);
      if (cuenta === null) return Object.values(entradas)[0] ?? null;
      return entradas[cuenta] ?? null;
    };
    return { ejecutar, llamadas };
  }

  it("con dos entradas del mismo servicio gana la del usuario", () => {
    const { ejecutar, llamadas } = llaveroConDosEntradas({
      root: ENTRADA_VIEJA,
      [USUARIO]: ENTRADA_VIGENTE,
    });

    expect(desdeLlavero(USUARIO, ejecutar, "darwin")).toBe(ENTRADA_VIGENTE);
    // Se buscó primero la cuenta del usuario y no hizo falta nada más.
    expect(llamadas).toHaveLength(1);
    expect(cuentaDe(llamadas[0] as readonly string[])).toBe(USUARIO);
  });

  it("la sesión vigente no se confunde con la caducada de otra cuenta", () => {
    // El síntoma original: `claude auth status` dice loggedIn y el harness decía
    // «La sesión de Claude Code caducó el 2026-04-29».
    const { ejecutar } = llaveroConDosEntradas({
      root: ENTRADA_VIEJA,
      [USUARIO]: ENTRADA_VIGENTE,
    });

    const credencial = readClaudeCodeCredential(lab, AHORA, () =>
      desdeLlavero(USUARIO, ejecutar, "darwin"),
    );
    expect(credencial.accessToken).toBe("sk-ant-oat01-vigente");
    expect(credencial.subscriptionType).toBe("max");
    expect(credencial.source).toBe("llavero");

    // Y el caso control: la búsqueda sin cuenta, que era la de antes, devuelve la
    // caducada y reproduce el mensaje equivocado.
    expect(() =>
      readClaudeCodeCredential(lab, AHORA, () =>
        ejecutar(["find-generic-password", "-s", CLAUDE_KEYCHAIN_SERVICE, "-w"]),
      ),
    ).toThrowError(/caducó el 2026-04-29/);
  });

  it("sin entrada del usuario cae a la búsqueda sin cuenta", () => {
    // Una instalación que guardó su sesión con otra cuenta no puede quedar rota.
    const { ejecutar, llamadas } = llaveroConDosEntradas({ otra: ENTRADA_VIGENTE });

    expect(desdeLlavero(USUARIO, ejecutar, "darwin")).toBe(ENTRADA_VIGENTE);
    expect(llamadas.map(cuentaDe)).toEqual([USUARIO, null]);
  });

  it("sin nombre de usuario busca sin cuenta, como antes", () => {
    const { ejecutar, llamadas } = llaveroConDosEntradas({ otra: ENTRADA_VIGENTE });

    expect(desdeLlavero(null, ejecutar, "darwin")).toBe(ENTRADA_VIGENTE);
    expect(llamadas.map(cuentaDe)).toEqual([null]);
  });

  it("una entrada del usuario vacía no tapa a la que sí tiene contenido", () => {
    // `otra` va primero porque es la que `security` encuentra sin `-a`.
    const { ejecutar } = llaveroConDosEntradas({
      otra: ENTRADA_VIGENTE,
      [USUARIO]: "  \n",
    });

    expect(desdeLlavero(USUARIO, ejecutar, "darwin")).toBe(ENTRADA_VIGENTE);
  });

  it("sin ninguna entrada devuelve null", () => {
    const { ejecutar } = llaveroConDosEntradas({});

    expect(desdeLlavero(USUARIO, ejecutar, "darwin")).toBeNull();
  });

  it("fuera de macOS no ejecuta nada", () => {
    const { ejecutar, llamadas } = llaveroConDosEntradas({ [USUARIO]: ENTRADA_VIGENTE });

    expect(desdeLlavero(USUARIO, ejecutar, "linux")).toBeNull();
    expect(desdeLlavero(USUARIO, ejecutar, "win32")).toBeNull();
    expect(llamadas).toHaveLength(0);
  });
});

describe("la llamada completa por Claude", () => {
  it("`claude-code` va por el CLI oficial: ni HTTP ni credencial que leer", async () => {
    // El camino real: `callChat` con el proveedor `claude-code` invoca `claude -p` y no
    // busca ninguna credencial —ni en el archivo del harness ni en el llavero—, porque
    // la sesión es del CLI. Antes leía el token OAuth y llamaba a la API directa, que
    // rechazaba con 429 a Sonnet, Opus y Fable.
    //
    // El `$HOME` se mueve al laboratorio, vacío, para que si algo intentara leer una
    // credencial no encontrara la real de quien corre la prueba.
    const hogar = process.env["HOME"];
    process.env["HOME"] = lab;

    try {
      const { llamadas, fetch: falso } = fetchQueCaptura(
        respuestaConTexto("no debe usarse"),
      );
      const ejecuciones: ClaudeCliRun[] = [];
      const resultado = await callChat({
        provider: "claude-code",
        model: "claude-sonnet-5-5",
        messages: [{ role: "user", content: "hola" }],
        fetchImpl: falso,
        cliRunner: async (run) => {
          ejecuciones.push(run);
          return {
            status: 0,
            stdout: JSON.stringify({
              is_error: false,
              result: "listo",
              usage: { input_tokens: 2, output_tokens: 1 },
              modelUsage: { "claude-sonnet-5-5": {} },
            }),
            stderr: "",
            timedOut: false,
            spawnError: null,
          };
        },
      });

      expect(resultado.content).toBe("listo");
      expect(resultado.model).toBe("claude-sonnet-5-5");
      expect(llamadas).toHaveLength(0);
      expect(ejecuciones).toHaveLength(1);
      expect(ejecuciones[0]?.args).toContain("claude-sonnet-5-5");
      expect(ejecuciones[0]?.stdin).toBe("hola");
    } finally {
      if (hogar === undefined) delete process.env["HOME"];
      else process.env["HOME"] = hogar;
    }
  });

  it("`anthropic` con una clave sigue yendo por HTTP a `/messages`", async () => {
    const { llamadas, fetch: falso } = fetchQueCaptura(respuestaConTexto("listo"));
    const resultado = await callChat({
      provider: "anthropic",
      model: "claude-sonnet-5",
      messages: [{ role: "user", content: "hola" }],
      // valmen:allow-secret — clave inventada del test, no una credencial real
      apiKey: "sk-ant-api03-de-prueba",
      fetchImpl: falso,
    });

    expect(resultado.content).toBe("listo");
    expect(llamadas[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    const cabeceras = cabecerasDe(llamadas[0]?.init as RequestInit);
    expect(cabeceras["x-api-key"]).toBe("sk-ant-api03-de-prueba");
    expect(cabeceras["anthropic-version"]).toBe("2023-06-01");
  });
});
