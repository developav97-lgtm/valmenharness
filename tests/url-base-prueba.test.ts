/**
 * R-GUI-001: la URL base de un transporte HTTP se reemplaza por una variable de entorno, y solo
 * hacia localhost.
 *
 * Una URL reemplazable por entorno es una vía para desviar claves de API, así que estas pruebas
 * fijan las reglas que la cierran: host exacto `127.0.0.1` o `localhost` sobre el `hostname` ya
 * normalizado (nunca por prefijo de texto), ninguna credencial en las cabeceras mientras la URL
 * de prueba está activa, ninguna redirección seguida, y un rechazo que ni degrada a otro
 * evaluador ni repite el valor de la variable.
 *
 * Ninguna prueba sale a la red ni usa una clave real: los servidores escuchan en `127.0.0.1` con
 * puerto 0, las claves son literales falsos, `HOME` apunta a un directorio temporal, y `fetch`
 * global se sustituye por uno que rechaza cualquier host que no sea local —así, aunque el código
 * ignorara la variable, la llamada moriría antes de salir—.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callChat } from "../packages/credentials/src/chat.js";
import {
  resolveChatEndpoint,
  testBaseUrlFor,
} from "../packages/credentials/src/endpoints.js";
import type { CascadeOptions } from "../packages/engine/src/evaluators.js";
import { runGate } from "../packages/engine/src/gate.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import type { Proposition, PropositionAnswer } from "../packages/gate/src/index.js";
import { evaluateWithJev } from "../packages/gate-jev/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const CLAVE_FALSA = "clave-falsa-de-prueba";
const CONTENIDO = "hola desde el servidor local";

/** Los valores que la variable nunca debe aceptar. */
const VALORES_RECHAZADOS = [
  "https://api.example.com/v1",
  "http://127.0.0.1@evil.example/v1",
  "http://usuario:clave@127.0.0.1:4010", // valmen:allow-secret — valor de prueba, rechazado a propósito
  "https://127.0.0.1:4010",
  "http://[::1]:4010",
  "http://127.0.0.1.nip.io",
  "http://localhost.evil.example",
  "http://127.0.0.1:4010/v1?x=1",
  "http://127.0.0.1:4010/v1#x",
  "127.0.0.1:4010",
] as const;

// ── La red, bloqueada ───────────────────────────────────────────────────────

const fetchReal = globalThis.fetch;

/** `fetch` que solo habla con loopback: cualquier otro destino falla sin salir de la máquina. */
function fetchSoloLocal(
  entrada: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const texto =
    typeof entrada === "string"
      ? entrada
      : entrada instanceof URL
        ? entrada.href
        : entrada.url;
  const { hostname, origin } = new URL(texto);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    return Promise.reject(new TypeError(`La prueba bloquea la red: ${origin}`));
  }
  return fetchReal(entrada, init);
}

// ── Servidores locales ──────────────────────────────────────────────────────

interface Peticion {
  readonly metodo: string;
  readonly ruta: string;
  readonly cabeceras: IncomingHttpHeaders;
  readonly cuerpo: string;
}

interface ServidorLocal {
  /** `http://127.0.0.1:<puerto>`, sin barra final. */
  readonly base: string;
  readonly peticiones: Peticion[];
}

let servidores: Server[] = [];

async function servidorLocal(
  responder: (peticion: IncomingMessage, respuesta: ServerResponse) => void,
): Promise<ServidorLocal> {
  const peticiones: Peticion[] = [];
  const servidor = createServer((peticion, respuesta) => {
    const trozos: Buffer[] = [];
    peticion.on("data", (trozo: Buffer) => trozos.push(trozo));
    peticion.on("end", () => {
      peticiones.push({
        metodo: peticion.method ?? "",
        ruta: peticion.url ?? "",
        cabeceras: peticion.headers,
        cuerpo: Buffer.concat(trozos).toString("utf8"),
      });
      responder(peticion, respuesta);
    });
  });
  servidores.push(servidor);
  await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
  const { port } = servidor.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, peticiones };
}

function json(respuesta: ServerResponse, cuerpo: unknown): void {
  respuesta.writeHead(200, { "Content-Type": "application/json" });
  respuesta.end(JSON.stringify(cuerpo));
}

const RESPUESTA_CHAT = {
  model: "modelo-local",
  choices: [{ message: { content: CONTENIDO } }],
  usage: { prompt_tokens: 3, completion_tokens: 4 },
};

const RESPUESTA_ANTHROPIC = {
  model: "claude-local",
  content: [{ type: "text", text: CONTENIDO }],
  usage: { input_tokens: 3, output_tokens: 4 },
};

const RESPUESTA_RESPONSES =
  `event: response.output_text.delta\ndata: ${JSON.stringify({ delta: CONTENIDO })}\n\n` +
  `event: response.completed\ndata: ${JSON.stringify({ response: { usage: { input_tokens: 3, output_tokens: 4 } } })}\n\n`;

const PROPOSICIONES_JEV: Proposition[] = [
  {
    id: "cubre",
    kind: "noul",
    instructions: "El plan cubre todos los criterios.",
    criteria: { yes: "Hay al menos un paso por criterio.", no: "Falta al menos uno." },
  },
];

const RESPUESTA_JEV = {
  id: "gen-dec-local-1",
  model: "typesafe/jev-local",
  provider: "TypeSafe",
  answers: { cubre: { type: "noul", noul: 0.76 } },
  usage: { input_tokens: 10, output_tokens: 5, cost: 0 },
};

// ── Entorno y directorios temporales ────────────────────────────────────────

const VARIABLES_DE_URL = [
  "VALMEN_BASE_URL_OPENROUTER",
  "VALMEN_BASE_URL_ANTHROPIC",
  "VALMEN_BASE_URL_CODEX",
  "VALMEN_BASE_URL_OPENCODE_GO",
  "VALMEN_BASE_URL_OPENCODE_ZEN",
  "VALMEN_BASE_URL_JEV",
] as const;

/** Fija una variable en el proceso; `null` la deja ausente. `unstubAllEnvs` restaura. */
function fijarEntorno(nombre: string, valor: string | null): void {
  vi.stubEnv(nombre, valor ?? "");
  if (valor === null) delete process.env[nombre];
}

let directorios: string[] = [];

function directorioTemporal(prefijo: string): string {
  const directorio = mkdtempSync(join(tmpdir(), prefijo));
  directorios.push(directorio);
  return directorio;
}

beforeEach(() => {
  servidores = [];
  directorios = [];
  vi.stubGlobal("fetch", fetchSoloLocal);
  // Ninguna clave ni archivo del desarrollador puede colarse en estas pruebas.
  fijarEntorno("HOME", directorioTemporal("valmen-url-base-home-"));
  fijarEntorno("OPENROUTER_API_KEY", null);
  fijarEntorno("ANTHROPIC_API_KEY", null);
  for (const nombre of VARIABLES_DE_URL) fijarEntorno(nombre, null);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const servidor of servidores) {
    servidor.closeAllConnections();
    await new Promise<void>((listo) => servidor.close(() => listo()));
  }
  for (const directorio of directorios)
    rmSync(directorio, { recursive: true, force: true });
});

// ── La función y el resolvedor ──────────────────────────────────────────────

/** Lo que lanza una acción síncrona, o falla la prueba si no lanzó. */
function rechazo(accion: () => unknown): { code: unknown; message: string } {
  try {
    accion();
  } catch (caught) {
    const error = caught as { code?: unknown; message?: unknown };
    return { code: error.code, message: String(error.message) };
  }
  throw new Error("Se esperaba un rechazo y la acción devolvió un valor.");
}

/** Lo que rechaza una promesa, o falla la prueba si se cumplió. */
async function rechazoAsync(
  promesa: Promise<unknown>,
): Promise<{ code: unknown; message: string }> {
  try {
    await promesa;
  } catch (caught) {
    const error = caught as { code?: unknown; message?: unknown };
    return { code: error.code, message: String(error.message) };
  }
  throw new Error("Se esperaba un rechazo y la llamada se cumplió.");
}

describe("resolveChatEndpoint con la URL base de prueba", () => {
  it("C1. con VALMEN_BASE_URL_OPENROUTER local, la URL es la de la variable más /chat/completions", () => {
    const env = { VALMEN_BASE_URL_OPENROUTER: "http://127.0.0.1:4010" };
    expect(resolveChatEndpoint("openrouter", "modelo/uno", env).url).toBe(
      "http://127.0.0.1:4010/chat/completions",
    );
  });

  it("C2. la base con ruta y barra final no deja doble barra", () => {
    const env = { VALMEN_BASE_URL_OPENROUTER: "http://localhost:4010/v1/" };
    expect(resolveChatEndpoint("openrouter", "modelo/uno", env).url).toBe(
      "http://localhost:4010/v1/chat/completions",
    );
  });

  it("C3. el dialecto anthropic-messages conserva la ruta /messages", () => {
    const env = { VALMEN_BASE_URL_ANTHROPIC: "http://127.0.0.1:4010/v1" };
    const endpoint = resolveChatEndpoint("anthropic", "claude-sonnet-5", env);
    expect(endpoint.protocol).toBe("anthropic-messages");
    expect(endpoint.url).toBe("http://127.0.0.1:4010/v1/messages");
  });

  it("C4. el dialecto openai-responses conserva la ruta /responses", () => {
    const env = { VALMEN_BASE_URL_CODEX: "http://127.0.0.1:4010" };
    const endpoint = resolveChatEndpoint("codex", "gpt-5.6-terra", env);
    expect(endpoint.protocol).toBe("openai-responses");
    expect(endpoint.url).toBe("http://127.0.0.1:4010/responses");
  });

  it("C5. el proveedor con guion usa guion bajo en la variable", () => {
    const env = { VALMEN_BASE_URL_OPENCODE_GO: "http://127.0.0.1:4010" };
    expect(resolveChatEndpoint("opencode-go", "kimi-k2.5", env).url).toBe(
      "http://127.0.0.1:4010/chat/completions",
    );
  });

  it("C6. cada valor de la tabla de rechazos lanza TEST_URL_REJECTED, también al resolver", () => {
    for (const valor of VALORES_RECHAZADOS) {
      const env = { VALMEN_BASE_URL_OPENROUTER: valor };
      expect(rechazo(() => testBaseUrlFor("openrouter", env)).code, valor).toBe(
        "TEST_URL_REJECTED",
      );
      expect(
        rechazo(() => resolveChatEndpoint("openrouter", "modelo/uno", env)).code,
        valor,
      ).toBe("TEST_URL_REJECTED");
    }
  });

  it("C7. el mensaje del rechazo nombra la variable y dice que solo admite localhost", () => {
    for (const valor of VALORES_RECHAZADOS) {
      const { message } = rechazo(() =>
        testBaseUrlFor("openrouter", { VALMEN_BASE_URL_OPENROUTER: valor }),
      );
      expect(message, valor).toContain("VALMEN_BASE_URL_OPENROUTER");
      expect(message, valor).toMatch(/solo admite localhost/);
    }
  });

  it("C8. el mensaje del rechazo no repite el valor de la variable", () => {
    for (const valor of VALORES_RECHAZADOS) {
      const { code, message } = rechazo(() =>
        testBaseUrlFor("openrouter", { VALMEN_BASE_URL_OPENROUTER: valor }),
      );
      expect(code, valor).toBe("TEST_URL_REJECTED");
      expect(message.includes(valor), valor).toBe(false);
    }
    // La contraseña embebida es lo que más importa que no se filtre.
    const { code, message } = rechazo(() =>
      testBaseUrlFor("openrouter", {
        VALMEN_BASE_URL_OPENROUTER: "http://usuario:contrasena-secreta@127.0.0.1:4010",
      }),
    );
    expect(code).toBe("TEST_URL_REJECTED");
    expect(message).not.toContain("contrasena-secreta");
  });

  it("C9. la variable vacía o de solo espacios cuenta como ausente", () => {
    for (const valor of ["", "   "]) {
      const env = { VALMEN_BASE_URL_OPENROUTER: valor };
      expect(testBaseUrlFor("openrouter", env), JSON.stringify(valor)).toBeNull();
      expect(resolveChatEndpoint("openrouter", "modelo/uno", env).url).toBe(
        "https://openrouter.ai/api/v1/chat/completions",
      );
    }
  });

  it("C10. sin la variable, las URL de catálogo son las de siempre", () => {
    expect(testBaseUrlFor("openrouter", {})).toBeNull();
    expect(resolveChatEndpoint("openrouter", "modelo/uno", {}).url).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
    expect(resolveChatEndpoint("anthropic", "claude-sonnet-5", {}).url).toBe(
      "https://api.anthropic.com/v1/messages",
    );
    expect(resolveChatEndpoint("codex", "gpt-5.6-terra", {}).url).toBe(
      "https://chatgpt.com/backend-api/codex/responses",
    );
    expect(resolveChatEndpoint("ollama", "llama3", {}).url).toBe(
      "http://127.0.0.1:11434/v1/chat/completions",
    );
    // Y sin pasar el entorno, que es como lo llama el resto del código.
    expect(resolveChatEndpoint("openrouter", "modelo/uno").url).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
  });

  it("C10. un proveedor desconocido sigue fallando con TRANSPORT_UNSUPPORTED", () => {
    const { code, message } = rechazo(() => resolveChatEndpoint("no-existe", "x", {}));
    expect(code).toBe("TRANSPORT_UNSUPPORTED");
    expect(message).toMatch(/Proveedor desconocido/);
  });

  it("C10. claude-code ignora la variable: sigue sin endpoint HTTP", () => {
    const env = { VALMEN_BASE_URL_CLAUDE_CODE: "http://127.0.0.1:4010" };
    const { code, message } = rechazo(() =>
      resolveChatEndpoint("claude-code", "claude-opus-4-8", env),
    );
    expect(code).toBe("TRANSPORT_UNSUPPORTED");
    expect(message).toMatch(/CLI oficial/);
  });

  it("la variable de un transporte que no se usa no se lee", () => {
    const env = { VALMEN_BASE_URL_DEEPSEEK: "https://api.example.com/v1" };
    expect(resolveChatEndpoint("openrouter", "modelo/uno", env).url).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
    expect(testBaseUrlFor("openrouter", env)).toBeNull();
  });

  it("acepta lo que URL normaliza a un host local, recorta espacios y quita barras finales", () => {
    const casos: [string, string][] = [
      ["  http://LOCALHOST:4010/v1/  ", "http://localhost:4010/v1"],
      ["http://127.0.0.1", "http://127.0.0.1"],
      ["http://2130706433:4010", "http://127.0.0.1:4010"],
    ];
    for (const [valor, esperada] of casos) {
      expect(
        testBaseUrlFor("openrouter", { VALMEN_BASE_URL_OPENROUTER: valor }),
        valor,
      ).toBe(esperada);
    }
  });
});

// ── callChat contra un servidor local ───────────────────────────────────────

describe("callChat con la URL base de prueba", () => {
  it("C11. entrega la petición al servidor local y devuelve su contenido", async () => {
    const servidor = await servidorLocal((_p, r) => json(r, RESPUESTA_CHAT));
    fijarEntorno("VALMEN_BASE_URL_OPENROUTER", `${servidor.base}/v1`);

    const resultado = await callChat({
      model: "modelo/uno",
      messages: [{ role: "user", content: "hola" }],
      apiKey: CLAVE_FALSA,
      timeoutMs: 5_000,
    });

    expect(resultado.content).toBe(CONTENIDO);
    expect(servidor.peticiones).toHaveLength(1);
    expect(servidor.peticiones[0]?.metodo).toBe("POST");
    expect(servidor.peticiones[0]?.ruta).toBe("/v1/chat/completions");
  });

  it("C12. el servidor local no recibe la cabecera authorization aunque callChat reciba apiKey", async () => {
    const servidor = await servidorLocal((_p, r) => json(r, RESPUESTA_CHAT));
    fijarEntorno("VALMEN_BASE_URL_OPENROUTER", servidor.base);

    await callChat({
      model: "modelo/uno",
      messages: [{ role: "user", content: "hola" }],
      apiKey: CLAVE_FALSA,
      timeoutMs: 5_000,
    });

    const cabeceras = servidor.peticiones[0]?.cabeceras;
    expect(cabeceras).toBeDefined();
    expect(cabeceras?.["authorization"]).toBeUndefined();
    expect(JSON.stringify(cabeceras)).not.toContain(CLAVE_FALSA);
  });

  it("C13. una petición del dialecto de Anthropic no lleva x-api-key", async () => {
    const servidor = await servidorLocal((_p, r) => json(r, RESPUESTA_ANTHROPIC));
    fijarEntorno("VALMEN_BASE_URL_ANTHROPIC", `${servidor.base}/v1`);

    const resultado = await callChat({
      provider: "anthropic",
      model: "claude-sonnet-5",
      messages: [{ role: "user", content: "hola" }],
      apiKey: CLAVE_FALSA,
      timeoutMs: 5_000,
    });

    expect(resultado.content).toBe(CONTENIDO);
    const cabeceras = servidor.peticiones[0]?.cabeceras;
    expect(servidor.peticiones[0]?.ruta).toBe("/v1/messages");
    expect(cabeceras?.["x-api-key"]).toBeUndefined();
    expect(cabeceras?.["authorization"]).toBeUndefined();
    expect(JSON.stringify(cabeceras)).not.toContain(CLAVE_FALSA);
    // El resto del dialecto no cambia.
    expect(cabeceras?.["anthropic-version"]).toBe("2023-06-01");
  });

  it("el dialecto openai-responses va sin credencial y sin leer la de codex", async () => {
    const servidor = await servidorLocal((_p, r) => {
      r.writeHead(200, { "Content-Type": "text/event-stream" });
      r.end(RESPUESTA_RESPONSES);
    });
    fijarEntorno("VALMEN_BASE_URL_CODEX", servidor.base);

    // Sin `apiKey` y con `HOME` vacío: sin la URL de prueba, buscar la credencial de codex
    // fallaría con CREDENTIAL_MISSING.
    const resultado = await callChat({
      provider: "codex",
      model: "gpt-5.6-terra",
      messages: [{ role: "user", content: "hola" }],
      timeoutMs: 5_000,
    });

    expect(resultado.content).toBe(CONTENIDO);
    expect(servidor.peticiones[0]?.ruta).toBe("/responses");
    expect(servidor.peticiones[0]?.cabeceras["authorization"]).toBeUndefined();
  });

  it("C14. un 307 del servidor local hace fallar callChat con el código TRANSPORT", async () => {
    const destino = await servidorLocal((_p, r) => json(r, RESPUESTA_CHAT));
    const redirector = await servidorLocal((_p, r) => {
      r.writeHead(307, { Location: `${destino.base}/chat/completions` });
      r.end();
    });
    fijarEntorno("VALMEN_BASE_URL_OPENROUTER", redirector.base);

    const { code } = await rechazoAsync(
      callChat({
        model: "modelo/uno",
        messages: [{ role: "user", content: "hola" }],
        apiKey: CLAVE_FALSA,
        timeoutMs: 5_000,
      }),
    );

    expect(code).toBe("TRANSPORT");
    // La petición sí llegó al servidor de prueba: el fallo es de la redirección, no de otra cosa.
    expect(redirector.peticiones).toHaveLength(1);
  });

  it("C15. el destino de ese 307 no recibe ninguna petición", async () => {
    const destino = await servidorLocal((_p, r) => json(r, RESPUESTA_CHAT));
    const redirector = await servidorLocal((_p, r) => {
      r.writeHead(307, { Location: `${destino.base}/chat/completions` });
      r.end();
    });
    fijarEntorno("VALMEN_BASE_URL_OPENROUTER", redirector.base);

    await rechazoAsync(
      callChat({
        model: "modelo/uno",
        messages: [{ role: "user", content: "hola" }],
        apiKey: CLAVE_FALSA,
        timeoutMs: 5_000,
      }),
    );

    expect(redirector.peticiones).toHaveLength(1);
    expect(destino.peticiones).toHaveLength(0);
  });

  it("los dialectos de Anthropic y Responses tampoco siguen un 307", async () => {
    const casos = [
      ["anthropic", "claude-sonnet-5", "VALMEN_BASE_URL_ANTHROPIC", "/messages"],
      ["codex", "gpt-5.6-terra", "VALMEN_BASE_URL_CODEX", "/responses"],
    ] as const;
    for (const [provider, model, variable, ruta] of casos) {
      const destino = await servidorLocal((_p, r) => json(r, RESPUESTA_ANTHROPIC));
      const redirector = await servidorLocal((_p, r) => {
        r.writeHead(307, { Location: `${destino.base}${ruta}` });
        r.end();
      });
      fijarEntorno(variable, redirector.base);

      const { code } = await rechazoAsync(
        callChat({
          provider,
          model,
          messages: [{ role: "user", content: "hola" }],
          apiKey: CLAVE_FALSA,
          timeoutMs: 5_000,
        }),
      );

      expect(code, provider).toBe("TRANSPORT");
      expect(redirector.peticiones, provider).toHaveLength(1);
      expect(destino.peticiones, provider).toHaveLength(0);
    }
  });

  it("un valor rechazado falla antes de salir: no hay credencial ni llamada", async () => {
    const llamadas: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      llamadas.push(String(url));
      return new Response("{}");
    }) as unknown as typeof fetch;
    fijarEntorno("VALMEN_BASE_URL_OPENROUTER", "https://api.example.com/v1");

    const { code, message } = await rechazoAsync(
      callChat({
        model: "modelo/uno",
        messages: [{ role: "user", content: "hola" }],
        apiKey: CLAVE_FALSA,
        fetchImpl,
      }),
    );

    expect(code).toBe("TEST_URL_REJECTED");
    expect(message).toMatch(/solo admite localhost/);
    expect(llamadas).toHaveLength(0);
  });
});

// ── Sin la variable, nada cambia ────────────────────────────────────────────

/** Lo que `fetch` recibió, para comprobar cabeceras y opciones sin servidor. */
function capturaDeFetch(): {
  readonly fetchImpl: typeof fetch;
  readonly llamadas: { url: string; init: RequestInit }[];
} {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    return new Response("{}", { status: 500 });
  }) as unknown as typeof fetch;
  return { fetchImpl, llamadas };
}

describe("callChat sin la variable de URL de prueba", () => {
  it("C16. la petición a OpenRouter lleva Authorization: Bearer con la clave", async () => {
    const { fetchImpl, llamadas } = capturaDeFetch();
    await rechazoAsync(
      callChat({
        model: "modelo/uno",
        messages: [{ role: "user", content: "hola" }],
        apiKey: CLAVE_FALSA,
        fetchImpl,
      }),
    );

    expect(llamadas[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const cabeceras = llamadas[0]?.init.headers as Record<string, string>;
    expect(cabeceras["Authorization"]).toBe(`Bearer ${CLAVE_FALSA}`);
  });

  it("C17. las opciones que recibe fetch no incluyen redirect", async () => {
    const { fetchImpl, llamadas } = capturaDeFetch();
    await rechazoAsync(
      callChat({
        model: "modelo/uno",
        messages: [{ role: "user", content: "hola" }],
        apiKey: CLAVE_FALSA,
        fetchImpl,
      }),
    );

    expect(llamadas).toHaveLength(1);
    expect("redirect" in (llamadas[0]?.init ?? {})).toBe(false);
  });

  it("C16. Anthropic y codex conservan su credencial y no agregan redirect", async () => {
    const anthropic = capturaDeFetch();
    await rechazoAsync(
      callChat({
        provider: "anthropic",
        model: "claude-sonnet-5",
        messages: [{ role: "user", content: "hola" }],
        apiKey: CLAVE_FALSA,
        fetchImpl: anthropic.fetchImpl,
      }),
    );
    const cabecerasAnthropic = anthropic.llamadas[0]?.init.headers as Record<
      string,
      string
    >;
    expect(anthropic.llamadas[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(cabecerasAnthropic["x-api-key"]).toBe(CLAVE_FALSA);
    expect("redirect" in (anthropic.llamadas[0]?.init ?? {})).toBe(false);

    const codex = capturaDeFetch();
    await rechazoAsync(
      callChat({
        provider: "codex",
        model: "gpt-5.6-terra",
        messages: [{ role: "user", content: "hola" }],
        apiKey: CLAVE_FALSA,
        fetchImpl: codex.fetchImpl,
      }),
    );
    const cabecerasCodex = codex.llamadas[0]?.init.headers as Record<string, string>;
    expect(codex.llamadas[0]?.url).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect(cabecerasCodex["Authorization"]).toBe(`Bearer ${CLAVE_FALSA}`);
    expect("redirect" in (codex.llamadas[0]?.init ?? {})).toBe(false);
  });
});

// ── Jev ─────────────────────────────────────────────────────────────────────

describe("evaluateWithJev con la URL base de prueba", () => {
  it("C18. llama a <base>/decisions en el servidor local", async () => {
    const servidor = await servidorLocal((_p, r) => json(r, RESPUESTA_JEV));
    fijarEntorno("VALMEN_BASE_URL_JEV", `${servidor.base}/api/alpha/`);

    const evaluacion = await evaluateWithJev({
      propositions: PROPOSICIONES_JEV,
      state: { plan: "…" },
      apiKey: CLAVE_FALSA,
    });

    expect(servidor.peticiones).toHaveLength(1);
    expect(servidor.peticiones[0]?.metodo).toBe("POST");
    expect(servidor.peticiones[0]?.ruta).toBe("/api/alpha/decisions");
    expect(evaluacion.answers).toHaveLength(1);
  });

  it("C19. la petición de jev no lleva la cabecera authorization", async () => {
    const servidor = await servidorLocal((_p, r) => json(r, RESPUESTA_JEV));
    fijarEntorno("VALMEN_BASE_URL_JEV", servidor.base);

    await evaluateWithJev({
      propositions: PROPOSICIONES_JEV,
      state: { plan: "…" },
      apiKey: CLAVE_FALSA,
    });

    const cabeceras = servidor.peticiones[0]?.cabeceras;
    expect(cabeceras).toBeDefined();
    expect(cabeceras?.["authorization"]).toBeUndefined();
    expect(JSON.stringify(cabeceras)).not.toContain(CLAVE_FALSA);
  });

  it("C20. con la variable externa falla con el código TEST_URL_REJECTED", async () => {
    fijarEntorno("VALMEN_BASE_URL_JEV", "https://api.example.com/api/alpha");

    const { code, message } = await rechazoAsync(
      evaluateWithJev({
        propositions: PROPOSICIONES_JEV,
        state: { plan: "…" },
        apiKey: CLAVE_FALSA,
      }),
    );

    expect(code).toBe("TEST_URL_REJECTED");
    expect(message).toMatch(/solo admite localhost/);
    expect(message).toContain("VALMEN_BASE_URL_JEV");
  });

  it("C21. con la variable externa no llama a fetch", async () => {
    const { fetchImpl, llamadas } = capturaDeFetch();
    fijarEntorno("VALMEN_BASE_URL_JEV", "https://api.example.com/api/alpha");

    await rechazoAsync(
      evaluateWithJev({
        propositions: PROPOSICIONES_JEV,
        state: { plan: "…" },
        apiKey: CLAVE_FALSA,
        fetchImpl,
      }),
    );

    expect(llamadas).toHaveLength(0);
  });

  it("con la variable, jev no sigue un 307: el destino no recibe nada", async () => {
    const destino = await servidorLocal((_p, r) => json(r, RESPUESTA_JEV));
    const redirector = await servidorLocal((_p, r) => {
      r.writeHead(307, { Location: `${destino.base}/decisions` });
      r.end();
    });
    fijarEntorno("VALMEN_BASE_URL_JEV", redirector.base);

    const { code } = await rechazoAsync(
      evaluateWithJev({
        propositions: PROPOSICIONES_JEV,
        state: { plan: "…" },
        apiKey: CLAVE_FALSA,
      }),
    );

    expect(code).toBe("TRANSPORT");
    expect(redirector.peticiones).toHaveLength(1);
    expect(destino.peticiones).toHaveLength(0);
  });

  it("C22. sin la variable, jev conserva Authorization y no agrega redirect", async () => {
    const llamadas: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      llamadas.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(RESPUESTA_JEV), { status: 200 });
    }) as unknown as typeof fetch;

    await evaluateWithJev({
      propositions: PROPOSICIONES_JEV,
      state: { plan: "…" },
      apiKey: CLAVE_FALSA,
      fetchImpl,
    });

    expect(llamadas[0]?.url).toBe("https://openrouter.ai/api/alpha/decisions");
    const cabeceras = llamadas[0]?.init.headers as Record<string, string>;
    expect(cabeceras["Authorization"]).toBe(`Bearer ${CLAVE_FALSA}`);
    expect("redirect" in (llamadas[0]?.init ?? {})).toBe(false);
  });
});

// ── Las compuertas: un rechazo no degrada ───────────────────────────────────

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";

function nuevoLaboratorio(): string {
  const lab = directorioTemporal("valmen-url-base-lab-");
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  mkdirSync(join(lab, "tickets"), { recursive: true });
  writeFixtureTicket(lab, { id: TICKET, workflowStatus: "analyzed" });
  return lab;
}

const cadena = (): CascadeOptions => ({
  producer: { provider: "openrouter", model: "productor/uno", effort: "auto" },
  verifier: { provider: "openrouter", model: "typesafe/jev-1.13", effort: "auto" },
  escalation: { provider: "openrouter", model: "escalado/dos", effort: "medium" },
  reason: null,
});

type OpcionesDeGate = Parameters<typeof runGate>[1];

function respuestasDe(propositions: readonly Proposition[]): PropositionAnswer[] {
  return propositions.map((p): PropositionAnswer =>
    p.kind === "choice"
      ? {
          id: p.id,
          kind: "choice",
          choice: Object.keys(p.criteria)[0] as string,
          confidence: 0.95,
        }
      : { id: p.id, kind: p.kind, value: 0.95, confidence: 0.95 },
  );
}

/** Un doble de jev y uno de juez que cuentan cuántas veces los llaman. */
function dobles() {
  const cuenta = { jev: 0, juez: 0 };
  const jev = (async (o: { propositions: readonly Proposition[] }) => {
    cuenta.jev += 1;
    return {
      answers: respuestasDe(o.propositions),
      model: { provider: "openrouter", model: "jev", resolvedVersion: "jev-1" },
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      latencyMs: 1,
    };
  }) as unknown as NonNullable<OpcionesDeGate["jev"]>;
  const judge = (async (o: { propositions: readonly Proposition[] }) => {
    cuenta.juez += 1;
    return {
      answers: respuestasDe(o.propositions),
      model: { provider: "openrouter", model: "juez", resolvedVersion: "juez-1" },
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      latencyMs: 1,
    };
  }) as unknown as NonNullable<OpcionesDeGate["judge"]>;
  return { cuenta, jev, judge };
}

const AHORA = () => new Date("2026-10-10T10:00:00.000Z");

/** La cascada con el juez real como productor y un doble de jev que cuenta. */
async function cascadaConUrlExterna(lab: string, d: ReturnType<typeof dobles>) {
  fijarEntorno("VALMEN_BASE_URL_OPENROUTER", "https://api.example.com/v1");
  const resultado = await runGate(
    { root: lab, ticketsDir: "tickets" },
    {
      gateId: "analysis",
      ticketId: TICKET,
      evaluator: "cascade",
      cascade: cadena(),
      jev: d.jev,
      apiKey: CLAVE_FALSA,
      now: AHORA,
    },
  );
  return { resultado, recibos: readReceipts({ root: lab, ticketsDir: "tickets" }, TICKET) };
}

describe("el rechazo de la URL de prueba no se tapa con otro evaluador", () => {
  it("C23. la cascada con VALMEN_BASE_URL_OPENROUTER externa falla diciendo que solo admite localhost", async () => {
    const { resultado } = await cascadaConUrlExterna(nuevoLaboratorio(), dobles());
    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stderr).toMatch(/solo admite localhost/);
  });

  it("C24. ante ese rechazo la cascada no degrada: el doble de jev se llama cero veces", async () => {
    const d = dobles();
    await cascadaConUrlExterna(nuevoLaboratorio(), d);
    expect(d.cuenta.jev).toBe(0);
  });

  it("C25. ante ese rechazo la compuerta no escribe recibo", async () => {
    const { recibos } = await cascadaConUrlExterna(nuevoLaboratorio(), dobles());
    expect(recibos).toHaveLength(0);
  });

  it("C26. con el evaluador jev y VALMEN_BASE_URL_JEV externa, el doble del juez se llama cero veces", async () => {
    const lab = nuevoLaboratorio();
    const d = dobles();
    fijarEntorno("VALMEN_BASE_URL_JEV", "https://api.example.com/api/alpha");

    const resultado = await runGate(
      { root: lab, ticketsDir: "tickets" },
      {
        gateId: "analysis",
        ticketId: TICKET,
        evaluator: "jev",
        judge: d.judge,
        apiKey: CLAVE_FALSA,
        now: AHORA,
      },
    );

    expect(d.cuenta.juez).toBe(0);
    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stderr).toMatch(/solo admite localhost/);
  });
});

// ── La documentación ────────────────────────────────────────────────────────

/** El texto de la sección «1.4 URL base de prueba» de la documentación de proveedores. */
function seccionDeUrlBase(): string {
  const documento = readFileSync(
    join(import.meta.dirname, "..", "docs", "04-PROVEEDORES.md"),
    "utf8",
  );
  const inicio = documento.search(/^### 1\.4 URL base de prueba$/m);
  if (inicio === -1) return "";
  const resto = documento.slice(documento.indexOf("\n", inicio));
  const fin = resto.search(/^#{2,3} /m);
  return fin === -1 ? resto : resto.slice(0, fin);
}

describe("docs/04-PROVEEDORES.md", () => {
  it("C27. documenta VALMEN_BASE_URL_<TRANSPORTE> con la regla de localhost", () => {
    const seccion = seccionDeUrlBase();
    expect(seccion).toContain("VALMEN_BASE_URL_<TRANSPORTE>");
    expect(seccion).toContain("127.0.0.1");
    expect(seccion).toContain("localhost");
  });

  it("C28. documenta VALMEN_BASE_URL_JEV", () => {
    expect(seccionDeUrlBase()).toContain("VALMEN_BASE_URL_JEV");
  });
});
