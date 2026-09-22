/**
 * El chat de configuración.
 *
 * Es la parte del harness donde un modelo **propone** cambios de configuración,
 * así que es donde más fácil sería que se ampliara su propia autoridad. Lo que
 * estos tests protegen:
 *
 * 1. **El modelo no escribe.** Ni un byte. Devuelve textos candidatos y el que
 *    escribe es el usuario, con un clic y —si el cambio es sensible— con una
 *    frase.
 * 2. **Lo que el modelo afirma se recalcula.** El diff lo calcula el código
 *    comparando textos, y la validez la decide el parser real. Un modelo que
 *    describa mal su propio cambio no puede colar la descripción.
 * 3. **La sensibilidad la decide el código.** No se le pregunta al modelo si su
 *    cambio es peligroso: tiene un incentivo estructural a decir que no.
 * 4. **Una confirmación es una frase, no un booleano.** Un `confirm: true` es un
 *    clic, y un clic no es una decisión deliberada.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ConfigChatError,
  applyChanges,
  proposeConfigChange,
} from "../packages/server/src/chat.js";
import { configPath, readConfigText } from "../packages/server/src/config.js";
import { routingPath } from "../packages/server/src/routing.js";
import { handleApi } from "../packages/server/src/server.js";

const CONFIG = `# Configuración del harness en este proyecto.
name: SaiOpenCloud
tickets-dir: tickets

gates: []
`;

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-chat-"));
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(join(lab, ".valmen", "config.yaml"), CONFIG, "utf8");
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** El contexto de la API. */
function context() {
  return {
    root: lab,
    credentialsFile: join(lab, ".valmen", ".credentials.yaml"),
    env: {},
  };
}

/**
 * Deja una credencial en el archivo del laboratorio.
 *
 * Los tests inyectan un `fetch` falso, así que la clave no se usa para nada —
 * pero **se resuelve antes de llamar**, y sin ninguna el chat falla con «no hay
 * API key». Eso hacía que estos tests dependieran de que la máquina tuviera
 * `~/.valmen/.credentials.yaml`: pasaban en la del desarrollador y fallaban en
 * el CI, que es la peor forma de tener un test verde.
 *
 * El valor es inventado a propósito: si alguna vez llegara a usarse de verdad, se
 * quiere un 401 y no una llamada real a la API de nadie.
 */
function conCredencial(): void {
  const ruta = join(lab, ".valmen", ".credentials.yaml");
  writeFileSync(
    ruta,
    ["version: 1", "providers:", "  openrouter:", '    api-key: "sk-or-v1-de-prueba"', ""].join("\n"),
    { encoding: "utf8", mode: 0o600 },
  );
}

/**
 * Un configurador simulado.
 *
 * Devuelve la respuesta de chat con la propuesta que el test decida, envuelta
 * igual que la devolvería el proveedor: el módulo tiene que parsear el sobre.
 */
function proveedor(propuesta: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(propuesta) } }],
        usage: { prompt_tokens: 900, completion_tokens: 120, cost: 0.00031 },
      }),
      { status, headers: { "Content-Type": "application/json" } },
    )) as unknown as typeof fetch;
}

/** Propone con el configurador simulado. */
async function proponer(propuesta: unknown, mensaje = "cambia algo") {
  return proposeConfigChange(lab, {
    message: mensaje,
    apiKey: "sk-de-prueba",
    fetchImpl: proveedor(propuesta),
  });
}

// ── Propuesta ───────────────────────────────────────────────────────────────

describe("una propuesta de cambio", () => {
  it("valida el texto con el parser real y calcula el diff", async () => {
    const resultado = await proponer({
      summary: "Añadir el gate de plan al proyecto.",
      changes: [
        {
          file: "config",
          text: CONFIG.replace("gates: []", "gates:\n  - plan"),
          reason: "El proyecto quiere evaluar el plan automáticamente.",
        },
      ],
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.summary).toContain("gate de plan");
    expect(resultado.changes).toHaveLength(1);

    const cambio = resultado.changes[0];
    expect(cambio?.ok).toBe(true);
    expect(cambio?.unchanged).toBe(false);
    expect(cambio?.diff.filter((linea) => linea.kind !== "same")).toHaveLength(3);
    expect(cambio?.label).toBe(".valmen/config.yaml");
  });

  it("no escribe nada: el archivo queda igual", async () => {
    await proponer({
      summary: "Cambiar el nombre.",
      changes: [{ file: "config", text: CONFIG.replace("SaiOpenCloud", "Otro"), reason: "…" }],
    });
    expect(readFileSync(configPath(lab), "utf8")).toBe(CONFIG);
  });

  it("marca como inválida una propuesta que no parsea", async () => {
    const resultado = await proponer({
      summary: "Romper el archivo.",
      // Una colección en línea que no cierra: el archivo no parsea, y el error
      // dice dónde. Antes bastaba con `[a, b]`, que ahora se interpreta.
      changes: [{ file: "config", text: "name: [a, 'b\n", reason: "…" }],
    });
    expect(resultado.changes[0]?.ok).toBe(false);
    expect(resultado.changes[0]?.error).toContain("abre una colección y no la cierra");
    // Y sigue siendo visible: se muestra el error, no se descarta en silencio.
    expect(resultado.changes).toHaveLength(1);
  });

  it("ignora un archivo que no se puede editar", async () => {
    const resultado = await proponer({
      summary: "Tocar otra cosa.",
      changes: [{ file: "secrets", text: "x", reason: "…" }],
    });
    expect(resultado.changes).toEqual([]);
  });

  it("detecta que la propuesta no cambia nada", async () => {
    const resultado = await proponer({
      summary: "Nada.",
      changes: [{ file: "config", text: CONFIG, reason: "…" }],
    });
    expect(resultado.changes[0]?.unchanged).toBe(true);
  });

  it("informa del modelo, el coste y la latencia", async () => {
    const resultado = await proponer({ summary: "x", changes: [] });
    expect(resultado.usage?.costUsd).toBeCloseTo(0.00031, 6);
    expect(resultado.model).not.toBe("");
    expect(resultado.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("un fallo del proveedor se reporta con su causa", async () => {
    await expect(
      proposeConfigChange(lab, {
        message: "x",
        apiKey: "sk-de-prueba",
        fetchImpl: (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/HTTP 401/);
  });

  it("una respuesta sin propuesta no se convierte en una propuesta vacía", async () => {
    await expect(
      proposeConfigChange(lab, {
        message: "x",
        apiKey: "sk-de-prueba",
        fetchImpl: (async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
            status: 200,
          })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(ConfigChatError);
  });
});

// ── Sensibilidad ────────────────────────────────────────────────────────────

describe("los cambios sensibles", () => {
  it("cambiar el evaluador de gates exige confirmación, y explica por qué", async () => {
    const routing = "preset: balanced\nroles:\n  gate-evaluator:\n    provider: openrouter\n    model: deepseek/deepseek-v4-flash\n    effort: auto\n";
    const resultado = await proponer({
      summary: "Usar un juez de chat.",
      changes: [{ file: "routing", text: routing, reason: "…" }],
    });

    const cambio = resultado.changes[0];
    expect(cambio?.ok).toBe(true);
    expect(cambio?.sensitive).toBe(true);
    expect(cambio?.sensitiveReason).toContain("probabilidades calibradas");
    expect(cambio?.confirmation).toBe("CONFIRMO CAMBIAR EL EVALUADOR DE GATES");
  });

  it("cambiar el preset también es sensible: mueve los trece roles", async () => {
    const resultado = await proponer({
      summary: "Pasar a económico.",
      changes: [{ file: "routing", text: "preset: economy\nroles: {}\n", reason: "…" }],
    });
    expect(resultado.changes[0]?.sensitive).toBe(true);
    expect(resultado.changes[0]?.confirmation).toContain("PRESUPUESTO");
  });

  it("un cambio de formato en el routing no es sensible", async () => {
    writeFileSync(
      routingPath(lab),
      "preset: balanced\nroles:\n  architect:\n    provider: openrouter\n    model: anthropic/claude-opus-4.6\n    effort: high\n",
      "utf8",
    );
    const resultado = await proponer({
      summary: "Añadir un comentario.",
      changes: [
        {
          file: "routing",
          text: "# Routing del proyecto.\npreset: balanced\nroles:\n  architect:\n    provider: openrouter\n    model: anthropic/claude-opus-4.6\n    effort: high\n",
          reason: "Documentar el archivo.",
        },
      ],
    });
    expect(resultado.changes[0]?.sensitive).toBe(false);
  });

  it("añadir gates a la configuración es sensible", async () => {
    const resultado = await proponer({
      summary: "Declarar gates.",
      changes: [
        { file: "config", text: CONFIG.replace("gates: []", "gates:\n  - plan"), reason: "…" },
      ],
    });
    expect(resultado.changes[0]?.sensitive).toBe(true);
    expect(resultado.changes[0]?.confirmation).toContain("GATE");
  });

  it("cambiar el nombre del proyecto no es sensible", async () => {
    const resultado = await proponer({
      summary: "Renombrar.",
      changes: [{ file: "config", text: CONFIG.replace("SaiOpenCloud", "Otro"), reason: "…" }],
    });
    expect(resultado.changes[0]?.sensitive).toBe(false);
  });
});

// ── Aplicar ─────────────────────────────────────────────────────────────────

describe("aplicar una propuesta", () => {
  it("escribe el cambio aprobado", () => {
    const texto = CONFIG.replace("name: SaiOpenCloud", "name: Otro");
    const resultado = applyChanges(lab, [{ file: "config", text: texto }]);
    expect(resultado.ok).toBe(true);
    expect(resultado.written).toEqual([".valmen/config.yaml"]);
    expect(readConfigText(lab)).toContain("name: Otro");
  });

  it("sin la frase exacta, un cambio sensible no se aplica", () => {
    const texto = CONFIG.replace("gates: []", "gates:\n  - plan");
    const resultado = applyChanges(lab, [{ file: "config", text: texto }]);

    expect(resultado.ok).toBe(false);
    expect(resultado.written).toEqual([]);
    expect(resultado.pending).toHaveLength(1);
    expect(resultado.pending[0]?.confirmation).toContain("GATE");
    // El archivo no se tocó.
    expect(readConfigText(lab)).toBe(CONFIG);
  });

  it("un booleano no es una confirmación", () => {
    const texto = CONFIG.replace("gates: []", "gates:\n  - plan");
    const resultado = applyChanges(lab, [
      { file: "config", text: texto, confirm: "true" },
    ]);
    expect(resultado.ok).toBe(false);
    expect(readConfigText(lab)).toBe(CONFIG);
  });

  it("con la frase exacta, se aplica", () => {
    const texto = CONFIG.replace("gates: []", "gates:\n  - plan");
    const resultado = applyChanges(lab, [
      { file: "config", text: texto, confirm: "CONFIRMO CAMBIAR EL MODO DE UN GATE" },
    ]);
    expect(resultado.ok).toBe(true);
    expect(resultado.written).toEqual([".valmen/config.yaml"]);
    expect(readConfigText(lab)).toContain("- plan");
  });

  it("no aplica un texto que no parsea, ni siquiera con confirmación", () => {
    const resultado = applyChanges(lab, [
      { file: "config", text: "\tmal\n", confirm: "CONFIRMO CAMBIAR EL MODO DE UN GATE" },
    ]);
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toContain("config.yaml línea 1");
    expect(readConfigText(lab)).toBe(CONFIG);
  });

  it("aplica varios archivos y deja pendiente el que no se confirmó", () => {
    const config = CONFIG.replace("name: SaiOpenCloud", "name: Otro");
    const routing =
      "preset: balanced\nroles:\n  gate-evaluator:\n    provider: openrouter\n    model: deepseek/deepseek-v4-flash\n    effort: auto\n";

    const resultado = applyChanges(lab, [
      { file: "config", text: config },
      { file: "routing", text: routing },
    ]);

    // El cambio de nombre se aplica; el del evaluador queda esperando su frase.
    expect(resultado.written).toEqual([".valmen/config.yaml"]);
    expect(resultado.pending).toHaveLength(1);
    expect(resultado.pending[0]?.file).toBe("routing");
    expect(readConfigText(lab)).toContain("name: Otro");
    expect(() => readFileSync(routingPath(lab), "utf8")).toThrow();
  });

  it("un cambio que no cambia nada no se escribe", () => {
    const resultado = applyChanges(lab, [{ file: "config", text: CONFIG }]);
    expect(resultado.ok).toBe(true);
    expect(resultado.written).toEqual([]);
  });
});

// ── API ─────────────────────────────────────────────────────────────────────

describe("la API del chat", () => {
  it("propone sin escribir", async () => {
    conCredencial();
    const respuesta = await handleApi(
      "POST",
      "/api/chat/config",
      { message: "quiero declarar el gate de plan" },
      { ...context(), fetchImpl: proveedor({
        summary: "Declarar el gate de plan.",
        changes: [{ file: "config", text: CONFIG.replace("gates: []", "gates:\n  - plan"), reason: "…" }],
      }) },
    );
    expect(respuesta.status).toBe(200);
    const cuerpo = respuesta.body as { ok: boolean; changes: { sensitive: boolean }[] };
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.changes[0]?.sensitive).toBe(true);
    expect(readConfigText(lab)).toBe(CONFIG);
  });

  it("un fallo del configurador se devuelve como propuesta fallida, no como error 500", async () => {
    conCredencial();
    const respuesta = await handleApi(
      "POST",
      "/api/chat/config",
      { message: "x" },
      {
        ...context(),
        fetchImpl: (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch,
      },
    );
    expect(respuesta.status).toBe(200);
    const cuerpo = respuesta.body as { ok: boolean; error: string };
    expect(cuerpo.ok).toBe(false);
    expect(cuerpo.error).toContain("500");
  });

  it("rechaza un mensaje vacío", async () => {
    expect((await handleApi("POST", "/api/chat/config", {}, context())).status).toBe(400);
    expect(
      (await handleApi("POST", "/api/chat/config", { message: "   " }, context())).status,
    ).toBe(400);
  });

  it("aplica solo lo confirmado", async () => {
    const texto = CONFIG.replace("gates: []", "gates:\n  - plan");

    const sinFrase = await handleApi(
      "POST",
      "/api/chat/config/apply",
      { changes: [{ file: "config", text: texto }] },
      context(),
    );
    expect(sinFrase.status).toBe(200);
    expect((sinFrase.body as { ok: boolean }).ok).toBe(false);
    expect(readConfigText(lab)).toBe(CONFIG);

    const conFrase = await handleApi(
      "POST",
      "/api/chat/config/apply",
      {
        changes: [
          { file: "config", text: texto, confirm: "CONFIRMO CAMBIAR EL MODO DE UN GATE" },
        ],
      },
      context(),
    );
    expect((conFrase.body as { ok: boolean }).ok).toBe(true);
    expect(readConfigText(lab)).toContain("- plan");
  });

  it("rechaza un cambio sin archivo o sin texto", async () => {
    expect(
      (await handleApi("POST", "/api/chat/config/apply", { changes: [{}] }, context())).status,
    ).toBe(400);
    expect(
      (
        await handleApi(
          "POST",
          "/api/chat/config/apply",
          { changes: [{ file: "config" }] },
          context(),
        )
      ).status,
    ).toBe(400);
    expect((await handleApi("POST", "/api/chat/config/apply", {}, context())).status).toBe(400);
  });
});
