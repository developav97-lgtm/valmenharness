/**
 * El dialecto `openai-responses` y la credencial de la suscripción de codex.
 *
 * Existen porque el harness hablaba solo `openai-chat`, y eso dejaba fuera a los
 * modelos que el usuario tiene contratados: los de codex no exponen
 * `/chat/completions`. Lo que se protege aquí:
 *
 * 1. **El stream se lee bien.** El texto llega troceado en deltas, y un fallo
 *    puede venir **dentro** del stream con un 200: mirar solo el código HTTP daría
 *    por buena una respuesta que no lo es.
 * 2. **La credencial se lee de donde está.** El token de codex vive en su propio
 *    archivo, caduca, y su CLI lo refresca; una copia en memoria quedaría obsoleta.
 * 3. **La cuenta viaja en una cabecera** y se saca del propio token.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CodexCredentialError,
  accountIdFromToken,
  readCodexCredential,
} from "../packages/credentials/src/codex.js";
import {
  callResponses,
  errorFromEvents,
  parseSse,
  textFromEvents,
  usageFromEvents,
} from "../packages/credentials/src/responses.js";
import { resolveChatEndpoint } from "../packages/credentials/src/endpoints.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-codex-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Un JWT sin firma válida: aquí solo se lee un dato que él mismo afirma. */
function tokenFalso(accountId: string | null): string {
  const cabecera = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url");
  const cuerpo = Buffer.from(
    JSON.stringify({
      iss: "https://auth.openai.com",
      ...(accountId === null
        ? {}
        : { "https://api.openai.com/auth": { chatgpt_account_id: accountId } }),
    }),
  ).toString("base64url");
  return `${cabecera}.${cuerpo}.firma`;
}

/** Un `auth.json` como el que deja el CLI de codex. */
function escribirAuth(contenido: unknown): string {
  const casa = join(lab, "casa");
  mkdirSync(join(casa, ".codex"), { recursive: true });
  writeFileSync(join(casa, ".codex", "auth.json"), JSON.stringify(contenido));
  return casa;
}

// ── El dialecto ─────────────────────────────────────────────────────────────

/** Un stream como el que devuelve el proveedor. */
function sse(eventos: readonly { event: string; data: unknown }[]): string {
  return eventos
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
}

describe("parseSse", () => {
  it("lee los eventos con su nombre y sus datos", () => {
    const eventos = parseSse(
      sse([
        { event: "response.created", data: { type: "response.created" } },
        { event: "response.completed", data: { type: "response.completed" } },
      ]),
    );
    expect(eventos.map((evento) => evento.event)).toEqual([
      "response.created",
      "response.completed",
    ]);
  });

  it("ignora un evento cuyo data no es JSON en vez de romper la lectura", () => {
    // Perder un evento que no se entiende es mejor que perder la respuesta.
    const texto =
      "event: response.output_text.delta\ndata: {roto\n\n" +
      sse([{ event: "response.output_text.delta", data: { delta: "hola" } }]);
    const eventos = parseSse(texto);
    expect(eventos).toHaveLength(1);
    expect(textFromEvents(eventos)).toBe("hola");
  });

  it("ignora las líneas que no son evento ni dato", () => {
    const texto = ': un comentario\nevent: x\ndata: {"a":1}\n\n';
    expect(parseSse(texto)).toHaveLength(1);
  });
});

describe("textFromEvents", () => {
  it("concatena los deltas", () => {
    const eventos = parseSse(
      sse([
        { event: "response.output_text.delta", data: { delta: "fun" } },
        { event: "response.output_text.delta", data: { delta: "ciona" } },
      ]),
    );
    expect(textFromEvents(eventos)).toBe("funciona");
  });

  it("no duplica el texto cuando llega el evento final", () => {
    // `response.output_text.done` trae el texto entero otra vez: sumarlo daría la
    // respuesta duplicada, que es un fallo que se lee como una alucinación.
    const eventos = parseSse(
      sse([
        { event: "response.output_text.delta", data: { delta: "funciona" } },
        { event: "response.output_text.done", data: { text: "funciona" } },
      ]),
    );
    expect(textFromEvents(eventos)).toBe("funciona");
  });

  it("devuelve vacío si no hubo texto", () => {
    expect(textFromEvents(parseSse(""))).toBe("");
  });
});

describe("usageFromEvents", () => {
  it("lee el uso del evento de cierre", () => {
    const eventos = parseSse(
      sse([
        {
          event: "response.completed",
          data: { response: { usage: { input_tokens: 25, output_tokens: 6 } } },
        },
      ]),
    );
    expect(usageFromEvents(eventos)).toEqual({
      inputTokens: 25,
      outputTokens: 6,
      costUsd: null,
    });
  });

  it("sin evento de cierre devuelve ceros, no falla", () => {
    expect(usageFromEvents(parseSse(""))).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      costUsd: null,
    });
  });
});

describe("errorFromEvents", () => {
  it("encuentra el fallo que viene dentro del stream", () => {
    // Un `response.failed` llega con HTTP 200: el fallo está dentro.
    const eventos = parseSse(
      sse([
        {
          event: "response.failed",
          data: { response: { error: { message: "se agotó el contexto" } } },
        },
      ]),
    );
    expect(errorFromEvents(eventos)).toBe("se agotó el contexto");
  });

  it("un stream correcto no reporta error", () => {
    const eventos = parseSse(
      sse([{ event: "response.completed", data: { response: {} } }]),
    );
    expect(errorFromEvents(eventos)).toBeNull();
  });
});

describe("callResponses", () => {
  const exito = sse([
    { event: "response.output_text.delta", data: { delta: "funciona" } },
    {
      event: "response.completed",
      data: { response: { usage: { input_tokens: 10, output_tokens: 2 } } },
    },
  ]);

  it("arma el cuerpo del dialecto y devuelve el texto", async () => {
    let visto: { url: string; cuerpo: Record<string, unknown> } | null = null;
    const fetchFalso = (async (url: string, init: { body: string }) => {
      visto = {
        url: String(url),
        cuerpo: JSON.parse(init.body) as Record<string, unknown>,
      };
      return new Response(exito, { status: 200 });
    }) as unknown as typeof fetch;

    const r = await callResponses(
      {
        url: "https://ejemplo/responses",
        headers: {},
        model: "gpt-x",
        messages: [
          { role: "system", content: "sé breve" },
          { role: "user", content: "di ok" },
        ],
      },
      fetchFalso,
    );

    expect(r.content).toBe("funciona");
    expect(r.dialect).toBe("openai-responses");
    // El sistema va en `instructions`, no como un mensaje más, y el resto en
    // `input` con su tipo. Mandarlo de otra forma responde 400.
    expect(visto!.cuerpo["instructions"]).toBe("sé breve");
    expect(visto!.cuerpo["input"]).toEqual([
      { type: "message", role: "user", content: [{ type: "input_text", text: "di ok" }] },
    ]);
    // Streaming obligatorio.
    expect(visto!.cuerpo["stream"]).toBe(true);
    expect(visto!.cuerpo["store"]).toBe(false);
  });

  it("no manda `max_output_tokens`, que el proveedor rechaza", async () => {
    // Medido: el backend de codex responde
    // `400 Unsupported parameter: max_output_tokens`.
    let cuerpo: Record<string, unknown> = {};
    const fetchFalso = (async (_url: string, init: { body: string }) => {
      cuerpo = JSON.parse(init.body) as Record<string, unknown>;
      return new Response(exito, { status: 200 });
    }) as unknown as typeof fetch;

    await callResponses(
      {
        url: "https://ejemplo/responses",
        headers: {},
        model: "gpt-x",
        messages: [{ role: "user", content: "ok" }],
        maxTokens: 500,
      },
      fetchFalso,
    );
    expect(cuerpo["max_output_tokens"]).toBeUndefined();
  });

  it("un error del proveedor sale con su cuerpo", async () => {
    const fetchFalso = (async () =>
      new Response('{"detail":"The model is not supported"}', {
        status: 400,
      })) as unknown as typeof fetch;

    await expect(
      callResponses(
        {
          url: "https://ejemplo/responses",
          headers: {},
          model: "malo",
          messages: [{ role: "user", content: "ok" }],
        },
        fetchFalso,
      ),
    ).rejects.toThrowError(/not supported/);
  });

  it("un fallo dentro del stream no se da por bueno", async () => {
    const fetchFalso = (async () =>
      new Response(
        sse([
          {
            event: "response.failed",
            data: { response: { error: { message: "sin cuota" } } },
          },
        ]),
        { status: 200 },
      )) as unknown as typeof fetch;

    await expect(
      callResponses(
        {
          url: "https://ejemplo/responses",
          headers: {},
          model: "x",
          messages: [{ role: "user", content: "ok" }],
        },
        fetchFalso,
      ),
    ).rejects.toThrowError(/sin cuota/);
  });

  it("un stream sin texto dice qué eventos llegaron", async () => {
    const fetchFalso = (async () =>
      new Response(sse([{ event: "response.created", data: {} }]), {
        status: 200,
      })) as unknown as typeof fetch;

    await expect(
      callResponses(
        {
          url: "https://ejemplo/responses",
          headers: {},
          model: "x",
          messages: [{ role: "user", content: "ok" }],
        },
        fetchFalso,
      ),
    ).rejects.toThrowError(/response\.created/);
  });
});

describe("resolveChatEndpoint", () => {
  it("manda codex a `/responses` y no a `/chat/completions`", () => {
    const endpoint = resolveChatEndpoint("codex", "gpt-5.6-terra");
    expect(endpoint.protocol).toBe("openai-responses");
    expect(endpoint.url).toContain("/responses");
    expect(endpoint.url).not.toContain("chat/completions");
  });

  it("todos los modelos de codex van por el mismo dialecto", () => {
    // Se declara en el proveedor y no por prefijo: un modelo que no encajara en
    // ninguna regla acabaría mandado a la ruta de chat.
    for (const modelo of [
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-6-astra",
      "raro",
    ]) {
      expect(resolveChatEndpoint("codex", modelo).protocol, modelo).toBe(
        "openai-responses",
      );
    }
  });

  it("los `gpt-*` de otros proveedores siguen por chat", () => {
    // El prefijo engaña: el mismo `gpt-*` habla distinto según quién lo sirva.
    expect(resolveChatEndpoint("openrouter", "openai/gpt-5.4").protocol).toBe(
      "openai-chat",
    );
    expect(resolveChatEndpoint("opencode-go", "gpt-5.6-luna").protocol).toBe(
      "openai-responses",
    );
  });
});

// ── La credencial ───────────────────────────────────────────────────────────

describe("accountIdFromToken", () => {
  it("lo saca del token", () => {
    expect(accountIdFromToken(tokenFalso("a6d31d2b-2523"))).toBe("a6d31d2b-2523");
  });

  it("devuelve null si el token no lo declara", () => {
    expect(accountIdFromToken(tokenFalso(null))).toBeNull();
  });

  it("devuelve null si el token no es un JWT", () => {
    expect(accountIdFromToken("no-es-un-token")).toBeNull();
  });
});

describe("readCodexCredential", () => {
  it("lee el token y la cuenta", () => {
    const casa = escribirAuth({
      auth_mode: "chatgpt",
      tokens: { access_token: tokenFalso("cuenta-1") },
    });
    const credencial = readCodexCredential(casa);
    expect(credencial.accessToken).toBe(tokenFalso("cuenta-1"));
    expect(credencial.accountId).toBe("cuenta-1");
  });

  it("lo lee del disco en cada llamada, porque el CLI lo refresca", () => {
    // Una copia en memoria sobreviviría al refresco del CLI y empezaría a dar 401
    // sin que nada hubiera cambiado.
    const casa = escribirAuth({
      auth_mode: "chatgpt",
      tokens: { access_token: tokenFalso("vieja") },
    });
    expect(readCodexCredential(casa).accountId).toBe("vieja");

    writeFileSync(
      join(casa, ".codex", "auth.json"),
      JSON.stringify({
        auth_mode: "chatgpt",
        tokens: { access_token: tokenFalso("nueva") },
      }),
    );
    expect(readCodexCredential(casa).accountId).toBe("nueva");
  });

  it("dice qué hacer cuando no hay archivo", () => {
    expect(() => readCodexCredential(join(lab, "sin-casa"))).toThrowError(
      /Inicia sesión con su CLI/,
    );
  });

  it("dice qué pasa cuando el archivo no es JSON", () => {
    const casa = join(lab, "casa");
    mkdirSync(join(casa, ".codex"), { recursive: true });
    writeFileSync(join(casa, ".codex", "auth.json"), "esto no es json");
    expect(() => readCodexCredential(casa)).toThrowError(CodexCredentialError);
    expect(() => readCodexCredential(casa)).toThrowError(/no es JSON/);
  });

  it("sin token de sesión lo explica, en vez de mandar una cadena vacía", () => {
    const casa = escribirAuth({ auth_mode: "chatgpt", tokens: {} });
    expect(() => readCodexCredential(casa)).toThrowError(/no tiene un token de sesión/);
  });

  it("sin la cuenta en el token lo explica", () => {
    // El backend pide la cuenta en una cabecera: sin ella la petición falla, y un
    // fallo del proveedor no diría que hay que volver a iniciar sesión.
    const casa = escribirAuth({
      auth_mode: "chatgpt",
      tokens: { access_token: tokenFalso(null) },
    });
    expect(() => readCodexCredential(casa)).toThrowError(/no declara la cuenta/);
  });

  it("acepta el modo de clave de API, que no usa tokens", () => {
    const casa = escribirAuth({ auth_mode: "apikey", OPENAI_API_KEY: "sk-de-prueba" });
    const credencial = readCodexCredential(casa);
    expect(credencial.accessToken).toBe("sk-de-prueba");
    expect(credencial.accountId).toBe("");
  });
});
