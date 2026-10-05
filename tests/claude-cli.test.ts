/**
 * El transporte por el CLI oficial de Claude Code (`claude -p`).
 *
 * Por qué existe: medido el 2026-10-05 con un plan Max vigente, la API directa con el
 * token de la suscripción solo dejaba pasar a Haiku —Sonnet, Opus y Fable, HTTP 429
 * «Error»—, mientras que `claude -p` con la misma cuenta respondía en todos. Estas
 * pruebas fijan lo que ese camino tiene que cuidar, porque `claude -p` es un **agente**
 * y no un modelo desnudo:
 *
 * - se invoca **sin herramientas, sin configuración heredada, sin MCP** y desde un
 *   directorio neutro, para que responda el modelo y no un agente con el contexto
 *   de quien lo lanzó;
 * - el entorno del proceso hijo **no lleva `ANTHROPIC_API_KEY`**: con ella el CLI
 *   facturaría por token en vez de usar la suscripción, sin que nadie lo decidiera;
 * - los errores del CLI se traducen a los mismos códigos que el resto de proveedores;
 * - un proceso que se cuelga no deja la llamada colgada.
 *
 * Los ejecutores son falsos salvo en el grupo «ejecutor real», que lanza un script
 * de laboratorio en lugar del CLI: así se prueba el `spawn` de verdad sin tocar la
 * sesión de quien corre la prueba.
 */
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ChatError } from "../packages/credentials/src/chat.js";
import {
  type ClaudeCliOutput,
  type ClaudeCliRun,
  type ClaudeCliRunner,
  callClaudeCli,
  claudeBinary,
  claudeCliArgs,
  claudeCliEnv,
  claudeCliPrompt,
  readClaudeCliAuth,
  runClaudeCli,
} from "../packages/credentials/src/claude-cli.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-claude-cli-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Una salida correcta del CLI, con lo que se le diga encima. */
function salida(cuerpo: Record<string, unknown>, status = 0): ClaudeCliOutput {
  return {
    status,
    stdout: JSON.stringify(cuerpo),
    stderr: "",
    timedOut: false,
    spawnError: null,
  };
}

/** Un ejecutor que guarda lo que se le pidió y responde lo que se le diga. */
function ejecutor(respuesta: ClaudeCliOutput): {
  readonly ejecuciones: ClaudeCliRun[];
  readonly runner: ClaudeCliRunner;
} {
  const ejecuciones: ClaudeCliRun[] = [];
  return {
    ejecuciones,
    runner: async (run) => {
      ejecuciones.push(run);
      return respuesta;
    },
  };
}

/** El valor que sigue a una bandera en la lista de argumentos. */
function valorDe(args: readonly string[], bandera: string): string | undefined {
  const i = args.indexOf(bandera);
  return i === -1 ? undefined : args[i + 1];
}

const USUARIO = [{ role: "user", content: "clasifica esto" }] as const;

describe("los argumentos: el modelo, no un agente", () => {
  const base = { model: "claude-sonnet-5-5", system: "Eres un clasificador." };

  it("el prompt va por la entrada estándar: no hay ningún argumento con el prompt", () => {
    const args = claudeCliArgs(base);

    expect(args).toContain("-p");
    // `-p` sin texto: el CLI lee el prompt de stdin, que no tiene tope de tamaño.
    expect(args).not.toContain("clasifica esto");
    expect(valorDe(args, "--output-format")).toBe("json");
    expect(valorDe(args, "--model")).toBe("claude-sonnet-5-5");
  });

  it("sin herramientas, sin fuentes de configuración, sin MCP y sin rastro en disco", () => {
    const args = claudeCliArgs(base);

    // Cadena vacía: es lo que desactiva todas, y se comprueba que sea ese argumento.
    expect(valorDe(args, "--tools")).toBe("");
    expect(valorDe(args, "--setting-sources")).toBe("");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--no-session-persistence");
  });

  it("nunca usa --bare: ese modo no lee la sesión de la suscripción", () => {
    expect(claudeCliArgs(base)).not.toContain("--bare");
  });

  it("lleva su propio prompt de sistema", () => {
    expect(valorDe(claudeCliArgs(base), "--system-prompt")).toBe("Eres un clasificador.");
  });

  it("un turno para texto y más para la salida estructurada, que gasta uno en la herramienta", () => {
    const esquema = { type: "object", properties: { tipo: { type: "string" } } };

    expect(valorDe(claudeCliArgs(base), "--max-turns")).toBe("1");
    expect(
      valorDe(
        claudeCliArgs({ ...base, structured: { name: "clasificacion", schema: esquema } }),
        "--max-turns",
      ),
    ).toBe("3");
  });

  it("la salida estructurada viaja como --json-schema, con el esquema intacto", () => {
    const esquema = {
      type: "object",
      properties: { tipo: { type: "string", enum: ["BUGFIX", "FEATURE"] } },
      required: ["tipo"],
      additionalProperties: false,
    };

    const args = claudeCliArgs({ ...base, structured: { name: "x", schema: esquema } });

    expect(JSON.parse(valorDe(args, "--json-schema") as string)).toEqual(esquema);
  });

  it("el esfuerzo viaja cuando se pide —en el dialecto HTTP no se podía—, y `auto` no manda nada", () => {
    expect(valorDe(claudeCliArgs({ ...base, effort: "high" }), "--effort")).toBe("high");
    expect(valorDe(claudeCliArgs({ ...base, effort: "low" }), "--effort")).toBe("low");
    expect(claudeCliArgs({ ...base, effort: "auto" })).not.toContain("--effort");
    expect(claudeCliArgs(base)).not.toContain("--effort");
  });
});

describe("el entorno: la suscripción, no la factura por token", () => {
  it("retira las variables que harían que el CLI facture por token", () => {
    const entorno = claudeCliEnv({
      PATH: "/usr/bin",
      ANTHROPIC_API_KEY: "clave-inventada", // valmen:allow-secret
      ANTHROPIC_AUTH_TOKEN: "token-inventado", // valmen:allow-secret
      CLAUDE_CODE_USE_BEDROCK: "1",
      CLAUDE_CODE_USE_VERTEX: "1",
    });

    expect(entorno["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(entorno["ANTHROPIC_AUTH_TOKEN"]).toBeUndefined();
    expect(entorno["CLAUDE_CODE_USE_BEDROCK"]).toBeUndefined();
    expect(entorno["CLAUDE_CODE_USE_VERTEX"]).toBeUndefined();
    expect(entorno["PATH"]).toBe("/usr/bin");
  });

  it("conserva el token de larga duración de la suscripción", () => {
    const entorno = claudeCliEnv({ CLAUDE_CODE_OAUTH_TOKEN: "token-de-suscripcion" }); // valmen:allow-secret

    expect(entorno["CLAUDE_CODE_OAUTH_TOKEN"]).toBe("token-de-suscripcion");
  });

  it("no modifica el entorno que recibe", () => {
    const base = { ANTHROPIC_API_KEY: "clave-inventada" }; // valmen:allow-secret

    claudeCliEnv(base, 500);

    expect(base).toEqual({ ANTHROPIC_API_KEY: "clave-inventada" }); // valmen:allow-secret
  });

  it("el tope de salida viaja por la variable que el CLI lee", () => {
    expect(claudeCliEnv({}, 800)["CLAUDE_CODE_MAX_OUTPUT_TOKENS"]).toBe("800");
    expect(claudeCliEnv({})["CLAUDE_CODE_MAX_OUTPUT_TOKENS"]).toBeUndefined();
    expect(claudeCliEnv({}, 0)["CLAUDE_CODE_MAX_OUTPUT_TOKENS"]).toBeUndefined();
  });

  it("el ejecutable puede apuntarse con VALMEN_CLAUDE_BIN", () => {
    expect(claudeBinary({})).toBe("claude");
    expect(claudeBinary({ VALMEN_CLAUDE_BIN: "/opt/claude/bin/claude" })).toBe(
      "/opt/claude/bin/claude",
    );
    expect(claudeBinary({ VALMEN_CLAUDE_BIN: "   " })).toBe("claude");
  });
});

describe("el prompt a partir del historial", () => {
  it("un solo mensaje de usuario va tal cual", () => {
    expect(claudeCliPrompt([{ role: "user", content: "hola" }])).toBe("hola");
  });

  it("los mensajes de sistema no entran: van por --system-prompt", () => {
    expect(
      claudeCliPrompt([
        { role: "system", content: "reglas" },
        { role: "user", content: "hola" },
      ]),
    ).toBe("hola");
  });

  it("un historial se escribe como una conversación rotulada", () => {
    const prompt = claudeCliPrompt([
      { role: "user", content: "uno" },
      { role: "assistant", content: "dos" },
      { role: "user", content: "tres" },
    ]);

    expect(prompt).toBe("Usuario:\nuno\n\nAsistente:\ndos\n\nUsuario:\ntres");
  });
});

describe("callClaudeCli: lo que devuelve", () => {
  it("una respuesta en texto, con el modelo que se pidió y los tokens sumados", async () => {
    const { runner } = ejecutor(
      salida({
        is_error: false,
        result: "  BUGFIX  ",
        usage: {
          input_tokens: 2,
          output_tokens: 7,
          cache_creation_input_tokens: 4000,
          cache_read_input_tokens: 100,
        },
        // El CLI puede usar otro modelo para tareas internas: el que importa es el pedido.
        modelUsage: { "claude-haiku-4-5-20251001": {}, "claude-sonnet-5-5": {} },
      }),
    );

    const r = await callClaudeCli({
      model: "claude-sonnet-5-5",
      messages: USUARIO,
      runner,
    });

    expect(r.content).toBe("BUGFIX");
    expect(r.model).toBe("claude-sonnet-5-5");
    // La entrada completa: sin sumar la caché, un prompt cacheado parece de dos tokens.
    expect(r.usage.inputTokens).toBe(4102);
    expect(r.usage.outputTokens).toBe(7);
    expect(r.dialect).toBe("text");
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("el coste no se informa: el del CLI es la tarifa de la API y el plan no la cobra", async () => {
    const { runner } = ejecutor(
      salida({ is_error: false, result: "ok", total_cost_usd: 0.0188, usage: {} }),
    );

    const r = await callClaudeCli({ model: "claude-opus-5-5", messages: USUARIO, runner });

    expect(r.usage.costUsd).toBeNull();
  });

  it("la salida estructurada se devuelve como JSON, y el dialecto lo dice", async () => {
    const { runner } = ejecutor(
      salida({
        is_error: false,
        result: "",
        structured_output: { tipo: "IMPROVEMENT", motivo: "cambia un texto" },
        modelUsage: { "claude-opus-5-5": {} },
      }),
    );

    const r = await callClaudeCli({
      model: "claude-opus-5-5",
      messages: USUARIO,
      structured: { name: "clasificacion", schema: { type: "object" } },
      runner,
    });

    expect(JSON.parse(r.content)).toEqual({
      tipo: "IMPROVEMENT",
      motivo: "cambia un texto",
    });
    expect(r.dialect).toBe("tool-call");
  });

  it("entiende la salida como lista de mensajes: vale el último `result`", async () => {
    const { runner } = ejecutor({
      status: 0,
      stdout: JSON.stringify([
        { type: "system" },
        { type: "result", is_error: false, result: "listo" },
      ]),
      stderr: "",
      timedOut: false,
      spawnError: null,
    });

    const r = await callClaudeCli({ model: "m", messages: USUARIO, runner });

    expect(r.content).toBe("listo");
  });

  it("si el CLI no informa el modelo, se devuelve el pedido", async () => {
    const { runner } = ejecutor(salida({ is_error: false, result: "ok" }));

    const r = await callClaudeCli({ model: "claude-fable-5-1", messages: USUARIO, runner });

    expect(r.model).toBe("claude-fable-5-1");
  });
});

describe("callClaudeCli: lo que le pide al ejecutor", () => {
  it("el prompt va por stdin, el sistema por argumento y el directorio es neutro", async () => {
    const { ejecuciones, runner } = ejecutor(salida({ is_error: false, result: "ok" }));

    await callClaudeCli({
      model: "claude-sonnet-5-5",
      messages: [
        { role: "system", content: "Eres un juez." },
        { role: "user", content: "¿cumple?" },
      ],
      runner,
    });

    const run = ejecuciones[0] as ClaudeCliRun;
    expect(run.stdin).toBe("¿cumple?");
    expect(valorDe(run.args, "--system-prompt")).toBe("Eres un juez.");
    // El CLI descubre `CLAUDE.md` y `.mcp.json` por donde se lo lance: el directorio de
    // trabajo no puede ser el del proyecto.
    expect(run.cwd).toBe(tmpdir());
  });

  it("sin prompt de sistema se manda uno mínimo, no el del agente de código", async () => {
    const { ejecuciones, runner } = ejecutor(salida({ is_error: false, result: "ok" }));

    await callClaudeCli({ model: "m", messages: USUARIO, runner });

    const sistema = valorDe((ejecuciones[0] as ClaudeCliRun).args, "--system-prompt");
    expect(sistema).toBeDefined();
    expect(sistema).not.toBe("");
  });

  it("el entorno del hijo no lleva ANTHROPIC_API_KEY aunque el del proceso la tenga", async () => {
    const { ejecuciones, runner } = ejecutor(salida({ is_error: false, result: "ok" }));

    await callClaudeCli({
      model: "m",
      messages: USUARIO,
      runner,
      env: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "clave-inventada" }, // valmen:allow-secret
    });

    const env = (ejecuciones[0] as ClaudeCliRun).env;
    expect(env["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(env["PATH"]).toBe("/usr/bin");
  });

  it("un prompt de sistema enorme pasa al prompt en vez de romper el argumento", async () => {
    // Un argumento tiene tope (128 KB por cadena en Linux) y `E2BIG` no dice de qué.
    const enorme = "x".repeat(100_001);
    const { ejecuciones, runner } = ejecutor(salida({ is_error: false, result: "ok" }));

    await callClaudeCli({
      model: "m",
      messages: [
        { role: "system", content: enorme },
        { role: "user", content: "pregunta" },
      ],
      runner,
    });

    const run = ejecuciones[0] as ClaudeCliRun;
    expect(run.args).not.toContain(enorme);
    expect(run.stdin.endsWith("pregunta")).toBe(true);
    expect(run.stdin.startsWith("xxx")).toBe(true);
  });

  it("el esfuerzo y el tope de salida llegan al ejecutor", async () => {
    const { ejecuciones, runner } = ejecutor(salida({ is_error: false, result: "ok" }));

    await callClaudeCli({
      model: "m",
      messages: USUARIO,
      effort: "high",
      maxTokens: 900,
      runner,
    });

    const run = ejecuciones[0] as ClaudeCliRun;
    expect(valorDe(run.args, "--effort")).toBe("high");
    expect(run.env["CLAUDE_CODE_MAX_OUTPUT_TOKENS"]).toBe("900");
  });

  it("el tiempo máximo por defecto es holgado, y el de quien llama manda", async () => {
    const a = ejecutor(salida({ is_error: false, result: "ok" }));
    const b = ejecutor(salida({ is_error: false, result: "ok" }));

    await callClaudeCli({ model: "m", messages: USUARIO, runner: a.runner });
    await callClaudeCli({
      model: "m",
      messages: USUARIO,
      runner: b.runner,
      timeoutMs: 1234,
    });

    expect((a.ejecuciones[0] as ClaudeCliRun).timeoutMs).toBeGreaterThanOrEqual(180_000);
    expect((b.ejecuciones[0] as ClaudeCliRun).timeoutMs).toBe(1234);
  });
});

describe("callClaudeCli: los errores, con los mismos códigos que los demás proveedores", () => {
  async function fallo(respuesta: ClaudeCliOutput): Promise<ChatError> {
    const { runner } = ejecutor(respuesta);
    try {
      await callClaudeCli({ model: "claude-sonnet-5-5", messages: USUARIO, runner });
    } catch (caught) {
      expect(caught).toBeInstanceOf(ChatError);
      return caught as ChatError;
    }
    throw new Error("se esperaba un ChatError");
  }

  it("sin sesión: AUTH, con el comando que lo arregla", async () => {
    const error = await fallo(
      salida({ is_error: true, result: "Not logged in · Please run /login" }, 1),
    );

    expect(error.code).toBe("AUTH");
    expect(error.message).toContain("Not logged in");
    expect(error.message).toContain("claude auth login");
  });

  it("un 401 o un 403 también es AUTH", async () => {
    expect(
      (await fallo(salida({ is_error: true, api_error_status: 401, result: "x" }, 1))).code,
    ).toBe("AUTH");
    expect(
      (await fallo(salida({ is_error: true, api_error_status: 403, result: "x" }, 1))).code,
    ).toBe("AUTH");
  });

  it("un modelo inexistente: INVALID_REQUEST, con el HTTP y el texto del CLI", async () => {
    const error = await fallo(
      salida(
        {
          is_error: true,
          api_error_status: 404,
          result: "There's an issue with the selected model (claude-no-existe).",
        },
        1,
      ),
    );

    expect(error.code).toBe("INVALID_REQUEST");
    expect(error.message).toContain("HTTP 404");
    expect(error.message).toContain("selected model");
  });

  it("un 429 del CLI oficial es RATE_LIMIT: aquí sí es el límite del plan", async () => {
    const error = await fallo(
      salida({ is_error: true, api_error_status: 429, result: "limit" }, 1),
    );

    expect(error.code).toBe("RATE_LIMIT");
    expect(error.message).toContain("límite de uso");
  });

  it("un 5xx es SERVER", async () => {
    expect(
      (
        await fallo(
          salida({ is_error: true, api_error_status: 529, result: "overloaded" }, 1),
        )
      ).code,
    ).toBe("SERVER");
  });

  it("el CLI no instalado: CREDENTIAL_MISSING, con cómo apuntarlo", async () => {
    const error = await fallo({
      status: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      spawnError: "spawn claude ENOENT",
    });

    expect(error.code).toBe("CREDENTIAL_MISSING");
    expect(error.message).toContain("PATH");
    expect(error.message).toContain("VALMEN_CLAUDE_BIN");
  });

  it("un fallo al lanzarlo que no es ENOENT: TRANSPORT", async () => {
    const error = await fallo({
      status: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      spawnError: "spawn EACCES",
    });

    expect(error.code).toBe("TRANSPORT");
    expect(error.message).toContain("EACCES");
  });

  it("pasarse del tiempo: TIMEOUT, con el límite", async () => {
    const error = await fallo({
      status: null,
      stdout: "",
      stderr: "",
      timedOut: true,
      spawnError: null,
    });

    expect(error.code).toBe("TIMEOUT");
    expect(error.message).toContain("tiempo máximo");
  });

  it("sin JSON legible: TRANSPORT, con lo que el proceso escribió", async () => {
    const error = await fallo({
      status: 2,
      stdout: "no es json",
      stderr: "algo se rompió dentro",
      timedOut: false,
      spawnError: null,
    });

    expect(error.code).toBe("TRANSPORT");
    expect(error.message).toContain("código 2");
    expect(error.message).toContain("algo se rompió dentro");
  });

  it("sin contenido: MALFORMED_RESPONSE, que distingue un tope de turnos de una respuesta vacía", async () => {
    const error = await fallo(
      salida({ is_error: false, subtype: "error_max_turns", num_turns: 3, result: "" }),
    );

    expect(error.code).toBe("MALFORMED_RESPONSE");
    expect(error.message).toContain("error_max_turns");
    expect(error.message).toContain("3 turno(s)");
  });
});

describe("la sesión del CLI (`claude auth status`)", () => {
  const ok = (cuerpo: unknown) => () => ({
    status: 0,
    stdout: JSON.stringify(cuerpo),
    error: null as string | null,
  });

  it("con sesión dice el plan y la cuenta, sin ningún token", () => {
    const sesion = readClaudeCliAuth({
      runner: ok({
        loggedIn: true,
        authMethod: "claude.ai",
        email: "dev@ejemplo.test",
        subscriptionType: "max",
      }),
    });

    expect(sesion.loggedIn).toBe(true);
    expect(sesion.subscriptionType).toBe("max");
    expect(sesion.detail).toContain("plan max");
    expect(sesion.detail).toContain("dev@ejemplo.test");
  });

  it("sin sesión dice el comando que lo arregla", () => {
    const sesion = readClaudeCliAuth({
      runner: ok({ loggedIn: false, authMethod: "none" }),
    });

    expect(sesion.loggedIn).toBe(false);
    expect(sesion.detail).toContain("claude auth login");
  });

  it("una salida ilegible cuenta como sin sesión, sin lanzar", () => {
    const sesion = readClaudeCliAuth({
      runner: () => ({ status: 0, stdout: "esto no es json", error: null }),
    });

    expect(sesion.loggedIn).toBe(false);
  });

  it("el CLI ausente se dice como tal", () => {
    const sesion = readClaudeCliAuth({
      runner: () => ({ status: null, stdout: "", error: "spawn claude ENOENT" }),
    });

    expect(sesion.loggedIn).toBe(false);
    expect(sesion.detail).toContain("No se encontró el CLI");
    expect(sesion.detail).toContain("PATH");
  });

  it("también se consulta con el entorno sin ANTHROPIC_API_KEY", () => {
    let visto: NodeJS.ProcessEnv = {};
    readClaudeCliAuth({
      env: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "clave-inventada" }, // valmen:allow-secret
      runner: (env) => {
        visto = env;
        return { status: 0, stdout: JSON.stringify({ loggedIn: true }), error: null };
      },
    });

    // Con esa variable, `auth status` hablaría de una clave de API y no de la suscripción.
    expect(visto["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(visto["PATH"]).toBe("/usr/bin");
  });
});

describe("el ejecutor real, contra un «CLI» de laboratorio", () => {
  /** Un script que hace de `claude`: guarda lo que recibe y responde un JSON. */
  function cliFalso(cuerpoSh: string): string {
    const ruta = join(lab, "claude-falso.sh");
    writeFileSync(ruta, `#!/bin/sh\n${cuerpoSh}\n`, "utf8");
    chmodSync(ruta, 0o755);
    return ruta;
  }

  const RESPUESTA =
    'printf \'%s\' \'{"is_error":false,"result":"hecho","modelUsage":{"claude-haiku-4-5-20251001":{}},"usage":{"input_tokens":1,"output_tokens":1}}\'';

  it("lanza el proceso, le pasa el prompt por stdin y lee su respuesta", async () => {
    const bin = cliFalso(
      `cat > "$VALMEN_TEST_DIR/stdin.txt"\nprintf '%s\\n' "$@" > "$VALMEN_TEST_DIR/args.txt"\n${RESPUESTA}`,
    );

    const r = await callClaudeCli({
      model: "claude-haiku-4-5-20251001",
      messages: [{ role: "user", content: "una pregunta con\nvarias líneas y acentos: ñ" }],
      env: { PATH: process.env["PATH"], VALMEN_CLAUDE_BIN: bin, VALMEN_TEST_DIR: lab },
    });

    expect(r.content).toBe("hecho");
    expect(readFileSync(join(lab, "stdin.txt"), "utf8")).toBe(
      "una pregunta con\nvarias líneas y acentos: ñ",
    );
    const args = readFileSync(join(lab, "args.txt"), "utf8").split("\n");
    expect(args).toContain("--model");
    expect(args).toContain("claude-haiku-4-5-20251001");
    // El argumento vacío de `--tools ""` llega como una línea vacía: es lo que lo desactiva.
    expect(args[args.indexOf("--tools") + 1]).toBe("");
  });

  it("corre desde un directorio neutro y sin ANTHROPIC_API_KEY, con el tope de salida", async () => {
    const bin = cliFalso(
      `cat > /dev/null\npwd > "$VALMEN_TEST_DIR/cwd.txt"\nenv > "$VALMEN_TEST_DIR/env.txt"\n${RESPUESTA}`,
    );

    await callClaudeCli({
      model: "claude-haiku-4-5-20251001",
      messages: USUARIO,
      maxTokens: 321,
      env: {
        PATH: process.env["PATH"],
        VALMEN_CLAUDE_BIN: bin,
        VALMEN_TEST_DIR: lab,
        ANTHROPIC_API_KEY: "clave-inventada", // valmen:allow-secret
      },
    });

    expect(readFileSync(join(lab, "cwd.txt"), "utf8").trim()).toBe(realpathSync(tmpdir()));
    const entorno = readFileSync(join(lab, "env.txt"), "utf8");
    expect(entorno).not.toContain("ANTHROPIC_API_KEY");
    expect(entorno).toContain("CLAUDE_CODE_MAX_OUTPUT_TOKENS=321");
  });

  it("un código de salida distinto de cero con el error en JSON se traduce, no se pierde", async () => {
    const bin = cliFalso(
      `cat > /dev/null\nprintf '%s' '{"is_error":true,"result":"Not logged in · Please run /login"}'\nexit 1`,
    );

    await expect(
      callClaudeCli({
        model: "m",
        messages: USUARIO,
        env: { PATH: process.env["PATH"], VALMEN_CLAUDE_BIN: bin },
      }),
    ).rejects.toMatchObject({ code: "AUTH" });
  });

  it("un CLI que no existe da CREDENTIAL_MISSING y no cuelga", async () => {
    await expect(
      callClaudeCli({
        model: "m",
        messages: USUARIO,
        env: { PATH: process.env["PATH"], VALMEN_CLAUDE_BIN: join(lab, "no-existe") },
      }),
    ).rejects.toMatchObject({ code: "CREDENTIAL_MISSING" });
  });

  it("un proceso que se cuelga se corta al pasar el tiempo máximo", async () => {
    const bin = cliFalso("exec sleep 30");
    const inicio = Date.now();

    await expect(
      callClaudeCli({
        model: "m",
        messages: USUARIO,
        timeoutMs: 300,
        env: { PATH: process.env["PATH"], VALMEN_CLAUDE_BIN: bin },
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });

    expect(Date.now() - inicio).toBeLessThan(10_000);
  });

  it("un proceso con hijos que retienen las tuberías tampoco deja la llamada colgada", async () => {
    // El CLI real puede dejar procesos hijos. `sleep 30 &` sigue vivo con la salida
    // abierta tras `exit`, y sin matar el grupo `close` no llegaría nunca.
    const bin = cliFalso("cat > /dev/null\nsleep 30 &\nsleep 30");
    const inicio = Date.now();

    await expect(
      callClaudeCli({
        model: "m",
        messages: USUARIO,
        timeoutMs: 300,
        env: { PATH: process.env["PATH"], VALMEN_CLAUDE_BIN: bin },
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });

    expect(Date.now() - inicio).toBeLessThan(10_000);
  });

  it("una señal de aborto corta la llamada", async () => {
    const bin = cliFalso("exec sleep 30");
    const control = new AbortController();
    setTimeout(() => control.abort(), 200);

    const salidaReal = await runClaudeCli({
      args: ["-p"],
      stdin: "",
      cwd: tmpdir(),
      env: { PATH: process.env["PATH"], VALMEN_CLAUDE_BIN: bin },
      timeoutMs: 60_000,
      signal: control.signal,
    });

    expect(salidaReal.timedOut).toBe(true);
  });
});
