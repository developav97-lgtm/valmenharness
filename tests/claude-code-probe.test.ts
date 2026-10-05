/**
 * Las pruebas de proveedor: `claude-code` por el CLI oficial, y el dialecto de
 * Anthropic por HTTP.
 *
 * Tres fallos medidos en una máquina real con una sesión Max vigente, y lo que
 * protege cada grupo de pruebas:
 *
 * 1. **El botón «Probar» no elige modelo.** El cuerpo salía sin `model` y Anthropic
 *    respondía HTTP 400 `model: Field required`, que parece un fallo de credencial
 *    y prueba lo contrario: para validar el cuerpo ya aceptó la credencial. Con el CLI
 *    la prueba de proveedor lleva su propio modelo.
 * 2. **El mensaje distingue «credencial aceptada» de «error de credencial».** Un 400
 *    no manda a buscar la clave; un 401 sí. Eso sigue valiendo para el proveedor
 *    `anthropic` (HTTP), donde se mide.
 * 3. **El 429 de la suscripción.** Medido el 2026-10-05, las llamadas directas con el
 *    token de la suscripción solo pasaban con Haiku; con los modelos grandes el
 *    proveedor respondía 429 «Error» en ~270 ms aunque el CLI oficial respondiera bien
 *    con la misma cuenta. **Por eso `claude-code` ya no llama a la API: invoca
 *    `claude -p`**, y estas pruebas fijan que no hay HTTP ni credencial que leer.
 *
 * El `$HOME` se mueve al laboratorio y los ejecutores del CLI son falsos: una prueba
 * no puede lanzar el CLI de verdad ni leer la sesión de quien la corre.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EXPLICACION_429_CLAUDE_CODE } from "../packages/credentials/src/claude-code.js";
import type {
  ClaudeCliOutput,
  ClaudeCliRun,
  ClaudeCliRunner,
  ClaudeCliStatusRunner,
} from "../packages/credentials/src/claude-cli.js";
import {
  MODELO_DE_PRUEBA_CLAUDE_CODE,
  PROVIDERS,
  listProviders,
  probeProvider,
  testProviderModel,
} from "../packages/server/src/providers.js";

let lab: string;
let hogar: string | undefined;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-cc-probe-"));
  hogar = process.env["HOME"];
  process.env["HOME"] = lab;
});

afterEach(() => {
  if (hogar === undefined) delete process.env["HOME"];
  else process.env["HOME"] = hogar;
  rmSync(lab, { recursive: true, force: true });
});

/** Un `fetch` que guarda la petición y responde lo que se le diga. */
function fetchQueCaptura(
  estado: number,
  cuerpo: unknown,
): {
  readonly llamadas: { url: string; init: RequestInit }[];
  readonly fetch: typeof fetch;
} {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const falso = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    return new Response(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), {
      status: estado,
    });
  }) as unknown as typeof fetch;
  return { llamadas, fetch: falso };
}

const ERROR_400_SIN_MODELO = {
  type: "error",
  error: { type: "invalid_request_error", message: "model: Field required" },
};

/** Una salida del CLI, tal como `--output-format json` la entrega. */
function salidaDelCli(cuerpo: Record<string, unknown>, status = 0): ClaudeCliOutput {
  return {
    status,
    stdout: JSON.stringify(cuerpo),
    stderr: "",
    timedOut: false,
    spawnError: null,
  };
}

/** Un ejecutor falso que guarda lo que se le pidió y responde lo que se le diga. */
function ejecutorQueCaptura(salida: ClaudeCliOutput): {
  readonly ejecuciones: ClaudeCliRun[];
  readonly runner: ClaudeCliRunner;
} {
  const ejecuciones: ClaudeCliRun[] = [];
  return {
    ejecuciones,
    runner: async (run) => {
      ejecuciones.push(run);
      return salida;
    },
  };
}

const RESPONDE_OK = salidaDelCli({
  is_error: false,
  result: "ok",
  usage: { input_tokens: 2, output_tokens: 1 },
  modelUsage: { "claude-haiku-4-5-20251001": {} },
});

/** `claude auth status` con una sesión viva. */
const CON_SESION: ClaudeCliStatusRunner = () => ({
  status: 0,
  stdout: JSON.stringify({
    loggedIn: true,
    authMethod: "claude.ai",
    email: "dev@ejemplo.test",
    subscriptionType: "max",
  }),
  error: null,
});

/** `claude auth status` sin sesión. */
const SIN_SESION: ClaudeCliStatusRunner = () => ({
  status: 1,
  stdout: JSON.stringify({ loggedIn: false, authMethod: "none" }),
  error: null,
});

describe("claude-code se prueba por el CLI oficial", () => {
  it("el proveedor se declara por CLI, sin endpoint HTTP ni credencial", () => {
    const spec = PROVIDERS.find((p) => p.id === "claude-code");

    expect(spec?.cli).toBe("claude");
    expect(spec?.probe).toBeUndefined();
    expect(spec?.credential).toBeUndefined();
    // Y aun así se ofrecen los dos botones: la sesión y un modelo se pueden probar.
    expect(spec?.probeable).toBe(true);
    expect(spec?.testable).toBe(true);
    expect(spec?.probeHost).toContain("claude");
  });

  it("la prueba de proveedor usa un modelo por defecto y dice cuál", async () => {
    const { ejecuciones, runner } = ejecutorQueCaptura(RESPONDE_OK);

    const resultado = await probeProvider("claude-code", {
      cliRunner: runner,
      cliStatusRunner: CON_SESION,
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.status).toBeNull();
    expect(resultado.credentialAccepted).toBe(true);
    // Qué sesión es y con qué modelo se verificó, para no prometer los demás.
    expect(resultado.detail).toContain("plan max");
    expect(resultado.detail).toContain("dev@ejemplo.test");
    expect(resultado.detail).toContain("CLI oficial");
    expect(resultado.detail).toContain("claude-haiku-4-5-20251001");
    expect(ejecuciones[0]?.args).toContain(MODELO_DE_PRUEBA_CLAUDE_CODE);
    expect(MODELO_DE_PRUEBA_CLAUDE_CODE).toBe("claude-haiku-4-5-20251001");
  });

  it("sin sesión dice el comando que lo arregla y no gasta ninguna llamada", async () => {
    const { ejecuciones, runner } = ejecutorQueCaptura(RESPONDE_OK);

    const resultado = await probeProvider("claude-code", {
      cliRunner: runner,
      cliStatusRunner: SIN_SESION,
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.credentialAccepted).toBe(false);
    expect(resultado.detail).toContain("claude auth login");
    // Comprobar la sesión no cuesta cuota: no se lanza ninguna llamada al modelo.
    expect(ejecuciones).toHaveLength(0);
  });

  it("el CLI ausente se dice como tal, no como un fallo del modelo", async () => {
    const { ejecuciones, runner } = ejecutorQueCaptura(RESPONDE_OK);

    const resultado = await probeProvider("claude-code", {
      cliRunner: runner,
      cliStatusRunner: () => ({ status: null, stdout: "", error: "spawn claude ENOENT" }),
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.detail).toContain("No se encontró el CLI");
    expect(resultado.detail).toContain("PATH");
    expect(ejecuciones).toHaveLength(0);
  });

  it("comprobar un modelo concreto lo manda al CLI y reemplaza el de prueba", async () => {
    const { ejecuciones, runner } = ejecutorQueCaptura(
      salidaDelCli({
        is_error: false,
        result: "ok",
        modelUsage: { "claude-sonnet-5-5": {} },
      }),
    );

    const resultado = await testProviderModel("claude-code", "claude-sonnet-5-5", {
      cliRunner: runner,
      cliStatusRunner: CON_SESION,
    });

    expect(resultado.ok).toBe(true);
    const args = ejecuciones[0]?.args ?? [];
    expect(args[args.indexOf("--model") + 1]).toBe("claude-sonnet-5-5");
    expect(resultado.detail).toContain("claude-sonnet-5-5");
  });

  it("un modelo inexistente falla con el mensaje del CLI y sin culpar a la credencial", async () => {
    const { runner } = ejecutorQueCaptura(
      salidaDelCli(
        {
          is_error: true,
          api_error_status: 404,
          result: "There's an issue with the selected model (claude-no-existe).",
        },
        1,
      ),
    );

    const resultado = await testProviderModel("claude-code", "claude-no-existe", {
      cliRunner: runner,
      cliStatusRunner: CON_SESION,
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.detail).toContain("HTTP 404");
    expect(resultado.detail).toContain("selected model");
    // Un modelo que no existe no dice nada de la credencial.
    expect(resultado.credentialAccepted).toBeNull();
  });

  it("si el CLI reporta que no hay sesión en mitad de la llamada, es un error de credencial", async () => {
    const { runner } = ejecutorQueCaptura(
      salidaDelCli({ is_error: true, result: "Not logged in · Please run /login" }, 1),
    );

    const resultado = await testProviderModel("claude-code", "claude-sonnet-5-5", {
      cliRunner: runner,
      cliStatusRunner: CON_SESION,
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.credentialAccepted).toBe(false);
    expect(resultado.detail).toContain("claude auth login");
  });

  it("falta el modelo: no se lanza nada", async () => {
    const { ejecuciones, runner } = ejecutorQueCaptura(RESPONDE_OK);

    const resultado = await testProviderModel("claude-code", "   ", {
      cliRunner: runner,
      cliStatusRunner: CON_SESION,
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.detail).toContain("Falta el identificador del modelo");
    expect(ejecuciones).toHaveLength(0);
  });

  it("el modelo de prueba está entre los que el proveedor declara conocidos", () => {
    // Si un día se retira de la lista, la prueba sin modelo estaría usando uno que
    // el propio catálogo ya no ofrece.
    const spec = PROVIDERS.find((p) => p.id === "claude-code");
    expect(spec?.knownModels).toContain(MODELO_DE_PRUEBA_CLAUDE_CODE);
  });

  it("los conocidos incluyen los modelos grandes que la API directa rechazaba", () => {
    const conocidos = PROVIDERS.find((p) => p.id === "claude-code")?.knownModels ?? [];
    expect(conocidos).toEqual(
      expect.arrayContaining(["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1"]),
    );
  });
});

describe("el estado de claude-code sale de la sesión del CLI", () => {
  it("sin sesión del CLI no está configurado, aunque haya ANTHROPIC_API_KEY en el entorno", () => {
    // Con esa variable el CLI facturaría por token en vez de usar la suscripción:
    // marcarla como «configurada» sería decir que el plan se está usando cuando no.
    // El entorno inyectado no trae PATH, así que el CLI «no se encuentra»: es
    // determinista y no lanza el de la máquina que corre la prueba.
    const estado = listProviders(join(lab, "no-existe.yaml"), {
      ANTHROPIC_API_KEY: "clave-inventada",
    }).find((p) => p.id === "claude-code");

    expect(estado?.configured).toBe(false);
    expect(estado?.source).toBe("none");
    expect(estado?.cli).toBe("claude");
  });

  it("`anthropic` con clave en el entorno sí queda configurado (ese es el de API)", () => {
    const estado = listProviders(join(lab, "no-existe.yaml"), {
      ANTHROPIC_API_KEY: "clave-inventada",
    }).find((p) => p.id === "anthropic");

    expect(estado?.configured).toBe(true);
    expect(estado?.source).toBe("environment");
  });
});

describe("«credencial aceptada» frente a «error de credencial» (dialecto de Anthropic, por HTTP)", () => {
  // Solo se midió en Anthropic. Se prueba con el proveedor `anthropic` —una clave de
  // API, por HTTP—, que es donde este dialecto sigue yendo por la red.
  const CLAVE = "sk-ant-api03-de-prueba"; // valmen:allow-secret — clave inventada del test

  it("un 400 del dialecto de Anthropic prueba que la credencial pasó", async () => {
    const { fetch: falso } = fetchQueCaptura(400, ERROR_400_SIN_MODELO);

    const resultado = await probeProvider("anthropic", { apiKey: CLAVE, fetchImpl: falso });

    expect(resultado.ok).toBe(false);
    expect(resultado.status).toBe(400);
    expect(resultado.credentialAccepted).toBe(true);
    expect(resultado.detail).toContain("Credencial aceptada");
    expect(resultado.detail).not.toContain("Error de credencial");
    // El mensaje del proveedor viaja tal cual.
    expect(resultado.detail).toContain("model: Field required");
  });

  it("un 401 es un error de credencial", async () => {
    const { fetch: falso } = fetchQueCaptura(401, {
      type: "error",
      error: { type: "authentication_error", message: "invalid x-api-key" },
    });

    const resultado = await probeProvider("anthropic", { apiKey: CLAVE, fetchImpl: falso });

    expect(resultado.ok).toBe(false);
    expect(resultado.credentialAccepted).toBe(false);
    expect(resultado.detail).toContain("Error de credencial");
    expect(resultado.detail).not.toContain("Credencial aceptada");
    expect(resultado.detail).toContain("invalid x-api-key");
  });

  it("no se afirma nada de la credencial cuando el estado no lo dice", async () => {
    const { fetch: falso } = fetchQueCaptura(500, "caído");

    const resultado = await probeProvider("anthropic", { apiKey: CLAVE, fetchImpl: falso });

    expect(resultado.credentialAccepted).toBeNull();
    expect(resultado.detail).not.toContain("Credencial aceptada");
    expect(resultado.detail).not.toContain("Error de credencial");
  });

  it("la clave no se devuelve nunca en el mensaje", async () => {
    const { fetch: falso } = fetchQueCaptura(401, `tu clave ${CLAVE} es inválida`);

    const resultado = await probeProvider("anthropic", { apiKey: CLAVE, fetchImpl: falso });

    expect(resultado.detail).not.toContain(CLAVE);
  });

  it("un 400 de un proveedor sin dialecto de Anthropic no se interpreta", async () => {
    // Solo se midió en Anthropic: en otro, un 400 puede ser un endpoint mal
    // declarado, y decir «credencial aceptada» sería inventarlo.
    const { fetch: falso } = fetchQueCaptura(400, "petición inválida");

    const resultado = await probeProvider("opencode-go", {
      // valmen:allow-secret — clave inventada del test
      apiKey: "clave-de-prueba",
      fetchImpl: falso,
    });

    expect(resultado.credentialAccepted).toBeNull();
    expect(resultado.detail).not.toContain("Credencial aceptada");
  });
});

describe("la explicación del 429 de la API directa con un token de suscripción", () => {
  // `claude-code` ya no llama a la API, pero el dialecto de Anthropic sigue pudiendo
  // recibir un token OAuth (alguien que lo configure como clave), y ahí el 429 sigue
  // necesitando su explicación. Ver `anthropic-dialect.test.ts`.
  it("nombra a Haiku como lo único que se midió que pasa", () => {
    expect(EXPLICACION_429_CLAUDE_CODE).toContain("claude-haiku-4-5-20251001");
    expect(EXPLICACION_429_CLAUDE_CODE).toContain("2026-10-05");
  });

  it("no sugiere imitar al CLI: las salidas son el CLI oficial o una clave", () => {
    expect(EXPLICACION_429_CLAUDE_CODE).not.toMatch(
      /cabecera|prompt de sistema|user-agent/i,
    );
  });

  it("un 429 de otro proveedor no lleva la nota de la suscripción", async () => {
    const { fetch: falso } = fetchQueCaptura(429, "demasiadas peticiones");

    const resultado = await probeProvider("openrouter", {
      // valmen:allow-secret — clave inventada del test
      apiKey: "clave-de-prueba",
      fetchImpl: falso,
    });

    expect(resultado.status).toBe(429);
    expect(resultado.detail).toContain("demasiadas peticiones");
    expect(resultado.detail).not.toContain("CLI oficial");
  });
});
