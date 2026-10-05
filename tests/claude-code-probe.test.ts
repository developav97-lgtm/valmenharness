/**
 * La prueba del proveedor `claude-code`: qué manda y cómo explica lo que responde.
 *
 * Tres fallos medidos en una máquina real con una sesión Max vigente, y lo que
 * protege cada grupo de pruebas:
 *
 * 1. **El botón «Probar» no elige modelo.** El cuerpo salía sin `model` y Anthropic
 *    respondía HTTP 400 `model: Field required`, que parece un fallo de credencial
 *    y prueba lo contrario: para validar el cuerpo ya aceptó la credencial.
 * 2. **El mensaje distingue «credencial aceptada» de «error de credencial».** Un 400
 *    no manda a buscar la clave; un 401 sí.
 * 3. **El 429 se explica.** Medido el 2026-10-05, las llamadas directas con el token
 *    de suscripción solo pasan con Haiku; con los modelos grandes el proveedor
 *    responde 429 «Error» en ~270 ms aunque el CLI oficial responda bien con la
 *    misma cuenta. No es cuota, y el mensaje lo dice sin esconder el del proveedor.
 *
 * La credencial es siempre inventada: el `$HOME` se mueve al laboratorio para que
 * una prueba no lea la sesión real de quien la corre ni toque su llavero.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EXPLICACION_429_CLAUDE_CODE } from "../packages/credentials/src/claude-code.js";
import {
  MODELO_DE_PRUEBA_CLAUDE_CODE,
  PROVIDERS,
  probeProvider,
  testProviderModel,
} from "../packages/server/src/providers.js";

// valmen:allow-secret — token inventado del test, no una credencial real
const TOKEN = "sk-ant-oat01-token-de-prueba-0123456789";

let lab: string;
let hogar: string | undefined;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-cc-probe-"));
  hogar = process.env["HOME"];
  process.env["HOME"] = lab;

  mkdirSync(join(lab, ".claude"), { recursive: true });
  writeFileSync(
    join(lab, ".claude", ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: TOKEN,
        expiresAt: Date.now() + 3_600_000,
        subscriptionType: "max",
      },
    }),
    "utf8",
  );
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

/** El cuerpo JSON de la primera llamada capturada. */
function cuerpoEnviado(
  llamadas: readonly { init: RequestInit }[],
): Record<string, unknown> {
  return JSON.parse(String(llamadas[0]?.init.body)) as Record<string, unknown>;
}

const ERROR_400_SIN_MODELO = {
  type: "error",
  error: { type: "invalid_request_error", message: "model: Field required" },
};

const ERROR_429_GENERICO = {
  type: "error",
  error: { type: "rate_limit_error", message: "Error" },
};

describe("la prueba a nivel de proveedor, sin elegir un modelo", () => {
  it("manda un modelo por defecto: sin él Anthropic responde 400", async () => {
    const { llamadas, fetch: falso } = fetchQueCaptura(200, { id: "msg_1" });

    const resultado = await probeProvider("claude-code", { fetchImpl: falso });

    expect(resultado.ok).toBe(true);
    const cuerpo = cuerpoEnviado(llamadas);
    expect(cuerpo["model"]).toBe(MODELO_DE_PRUEBA_CLAUDE_CODE);
    expect(cuerpo["model"]).toBe("claude-haiku-4-5-20251001");
    // Y los otros dos campos que el dialecto exige.
    expect(cuerpo["max_tokens"]).toBe(1);
    expect(cuerpo["messages"]).toEqual([{ role: "user", content: "ok" }]);
  });

  it("dice con qué modelo se verificó, para no prometer los demás", async () => {
    const { fetch: falso } = fetchQueCaptura(200, { id: "msg_1" });

    const resultado = await probeProvider("claude-code", { fetchImpl: falso });

    expect(resultado.detail).toContain("Conexión verificada (HTTP 200)");
    expect(resultado.detail).toContain(MODELO_DE_PRUEBA_CLAUDE_CODE);
    expect(resultado.credentialAccepted).toBe(true);
  });

  it("manda el token como `Bearer` con su beta y nunca lo devuelve", async () => {
    const { llamadas, fetch: falso } = fetchQueCaptura(
      401,
      `tu token ${TOKEN} es inválido`,
    );

    const resultado = await probeProvider("claude-code", { fetchImpl: falso });

    const cabeceras = llamadas[0]?.init.headers as Record<string, string>;
    expect(cabeceras["Authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(cabeceras["anthropic-beta"]).toBe("oauth-2025-04-20");
    expect(resultado.detail).not.toContain(TOKEN);
  });

  it("comprobar un modelo concreto reemplaza el de prueba", async () => {
    const { llamadas, fetch: falso } = fetchQueCaptura(200, { id: "msg_1" });

    const resultado = await testProviderModel("claude-code", "claude-sonnet-5", {
      fetchImpl: falso,
    });

    expect(resultado.ok).toBe(true);
    expect(cuerpoEnviado(llamadas)["model"]).toBe("claude-sonnet-5");
  });

  it("el modelo de prueba está entre los que el proveedor declara conocidos", () => {
    // Si un día se retira de la lista, la prueba sin modelo estaría usando uno que
    // el propio catálogo ya no ofrece.
    const spec = PROVIDERS.find((p) => p.id === "claude-code");
    expect(spec?.knownModels).toContain(MODELO_DE_PRUEBA_CLAUDE_CODE);
  });
});

describe("«credencial aceptada» frente a «error de credencial»", () => {
  it("un 400 del dialecto de Anthropic prueba que la credencial pasó", async () => {
    const { fetch: falso } = fetchQueCaptura(400, ERROR_400_SIN_MODELO);

    const resultado = await probeProvider("claude-code", { fetchImpl: falso });

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
      error: { type: "authentication_error", message: "invalid bearer token" },
    });

    const resultado = await probeProvider("claude-code", { fetchImpl: falso });

    expect(resultado.ok).toBe(false);
    expect(resultado.credentialAccepted).toBe(false);
    expect(resultado.detail).toContain("Error de credencial");
    expect(resultado.detail).not.toContain("Credencial aceptada");
    expect(resultado.detail).toContain("invalid bearer token");
  });

  it("también se distingue al comprobar un modelo concreto", async () => {
    const aceptada = fetchQueCaptura(400, ERROR_400_SIN_MODELO);
    const rechazada = fetchQueCaptura(403, "prohibido");

    const a = await testProviderModel("claude-code", "claude-sonnet-5", {
      fetchImpl: aceptada.fetch,
    });
    const r = await testProviderModel("claude-code", "claude-sonnet-5", {
      fetchImpl: rechazada.fetch,
    });

    expect(a.credentialAccepted).toBe(true);
    expect(a.detail).toContain("Credencial aceptada");
    expect(r.credentialAccepted).toBe(false);
    expect(r.detail).toContain("Error de credencial");
  });

  it("no se afirma nada de la credencial cuando el estado no lo dice", async () => {
    const { fetch: falso } = fetchQueCaptura(500, "caído");

    const resultado = await probeProvider("claude-code", { fetchImpl: falso });

    expect(resultado.credentialAccepted).toBeNull();
    expect(resultado.detail).not.toContain("Credencial aceptada");
    expect(resultado.detail).not.toContain("Error de credencial");
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

describe("el 429 de la suscripción", () => {
  it("la prueba de proveedor explica que no suele ser cuota", async () => {
    const { fetch: falso } = fetchQueCaptura(429, ERROR_429_GENERICO);

    const resultado = await probeProvider("claude-code", { fetchImpl: falso });

    expect(resultado.ok).toBe(false);
    expect(resultado.status).toBe(429);
    // El mensaje del proveedor, sin parafrasear, y detrás la explicación.
    expect(resultado.detail).toContain('"message":"Error"');
    expect(resultado.detail).toContain(EXPLICACION_429_CLAUDE_CODE);
    expect(resultado.detail).toContain("no suele ser cuota agotada");
    expect(resultado.detail).toContain("CLI oficial");
    expect(resultado.detail).toContain("proveedor `anthropic`");
  });

  it("la prueba de un modelo concreto explica lo mismo", async () => {
    const { fetch: falso } = fetchQueCaptura(429, ERROR_429_GENERICO);

    const resultado = await testProviderModel("claude-code", "claude-sonnet-5-5", {
      fetchImpl: falso,
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.status).toBe(429);
    expect(resultado.detail).toContain('"message":"Error"');
    expect(resultado.detail).toContain(EXPLICACION_429_CLAUDE_CODE);
  });

  it("la explicación nombra a Haiku como lo único que se midió que pasa", () => {
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

  it("un 200 no lleva ninguna nota", async () => {
    const { fetch: falso } = fetchQueCaptura(200, { id: "msg_1" });

    const resultado = await testProviderModel("claude-code", MODELO_DE_PRUEBA_CLAUDE_CODE, {
      fetchImpl: falso,
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.detail).not.toContain("CLI oficial");
  });
});
