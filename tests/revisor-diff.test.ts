/**
 * El revisor de diff de la compuerta `code-review` (R-REV-003, FEATURE-GATE-CODE-REVIEW-20261010).
 *
 * Lo que se afirma es lo que cambia de confianza: que el modelo responda proposiciones de hecho y
 * nunca «¿apruebas?», que lo que sale del esquema sea un `JudgeError` y no una respuesta, y que
 * la llamada no le dé al modelo nada más que la entrada congelada. La red y el CLI de Claude son
 * los únicos límites que se simulan (`fetchImpl` y `cliRunner`): ninguna prueba llama a un modelo
 * real ni usa una clave.
 */
import { describe, expect, it } from "vitest";

import {
  JudgeError,
  type ReviewDiffOptions,
  promptDelRevisorDeDiff,
  reviewDiffWithModel,
} from "../packages/gate-llm-judge/src/index.js";

const PROPOSICIONES = [
  {
    id: "sin_hallazgo_severo_riesgo",
    instrucciones: "El cambio no abre un acceso indebido.",
  },
  {
    id: "sin_hallazgo_severo_resiliencia",
    instrucciones: "El cambio no deja un error sin manejar.",
  },
];
const IDS = PROPOSICIONES.map((p) => p.id);

const ENTRADA = "ENTRADA CONGELADA DE PRUEBA\n+export const suma = (a, b) => a + b;";

const BASE: ReviewDiffOptions = {
  provider: "openrouter",
  model: "revisor/modelo-de-prueba",
  effort: "medium",
  entrada: ENTRADA,
  proposiciones: PROPOSICIONES,
  apiKey: "k",
};

interface Llamada {
  readonly url: string;
  readonly body: Record<string, unknown>;
}

/** Una respuesta de chat con el contenido que se diga. */
function respuestaDeChat(contenido: unknown): Response {
  return new Response(
    JSON.stringify({
      model: "revisor/modelo-de-prueba-20261010",
      choices: [
        {
          message: {
            content: typeof contenido === "string" ? contenido : JSON.stringify(contenido),
          },
        },
      ],
      usage: { prompt_tokens: 4200, completion_tokens: 310, cost: 0.0042 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** El `fetch` simulado: guarda lo que se le pidió y responde lo que se le diga. */
function red(responder: () => Response): {
  readonly llamadas: Llamada[];
  readonly fetchImpl: typeof fetch;
} {
  const llamadas: Llamada[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    return responder();
  }) as unknown as typeof fetch;
  return { llamadas, fetchImpl };
}

/** Una respuesta del modelo conforme al esquema: una clave por proposición. */
function conforme(sobrescribir: Record<string, unknown> = {}): Record<string, unknown> {
  const respuesta: Record<string, unknown> = {};
  for (const id of IDS) {
    respuesta[id] = {
      cumple: true,
      confianza: 0.95,
      motivo: `sin hallazgo en ${id}`,
      hallazgos: [],
    };
  }
  return { ...respuesta, ...sobrescribir };
}

describe("el revisor de diff responde proposiciones de hecho", () => {
  it("devuelve una respuesta por proposición con cumple, confianza, motivo y hallazgos citados", async () => {
    const { fetchImpl } = red(() =>
      respuestaDeChat(
        conforme({
          sin_hallazgo_severo_riesgo: {
            cumple: false,
            confianza: 0.9,
            motivo: "La consulta concatena el parámetro.",
            hallazgos: [
              { ruta: "src/consulta.ts", linea: 12, motivo: "Concatena `id` sin escapar." },
            ],
          },
        }),
      ),
    );

    const r = await reviewDiffWithModel({ ...BASE, fetchImpl });

    expect(r.respuestas).toEqual([
      {
        proposicion: "sin_hallazgo_severo_riesgo",
        cumple: false,
        confianza: 0.9,
        motivo: "La consulta concatena el parámetro.",
        hallazgos: [
          { ruta: "src/consulta.ts", linea: 12, motivo: "Concatena `id` sin escapar." },
        ],
      },
      {
        proposicion: "sin_hallazgo_severo_resiliencia",
        cumple: true,
        confianza: 0.95,
        motivo: "sin hallazgo en sin_hallazgo_severo_resiliencia",
        hallazgos: [],
      },
    ]);
    expect(r.model).toEqual({
      provider: "openrouter",
      model: "revisor/modelo-de-prueba",
      resolvedVersion: "revisor/modelo-de-prueba-20261010",
    });
    expect(r.usage).toEqual({ inputTokens: 4200, outputTokens: 310, costUsd: 0.0042 });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("pide una clave por proposición, con tope de salida de 4096 tokens y sin herramientas", async () => {
    const { llamadas, fetchImpl } = red(() => respuestaDeChat(conforme()));

    await reviewDiffWithModel({ ...BASE, fetchImpl });

    expect(llamadas).toHaveLength(1);
    const cuerpo = llamadas[0]?.body ?? {};
    expect(cuerpo["max_tokens"]).toBe(4096);
    expect(cuerpo["tools"]).toBeUndefined();
    const esquema = (
      cuerpo["response_format"] as { json_schema: { schema: Record<string, unknown> } }
    ).json_schema.schema;
    expect(Object.keys(esquema["properties"] as Record<string, unknown>).sort()).toEqual(
      [...IDS].sort(),
    );
    expect(esquema["required"]).toEqual(expect.arrayContaining(IDS));
  });

  it("le dice al modelo que el diff es dato y no instrucciones, y le da solo la entrada congelada", async () => {
    const { llamadas, fetchImpl } = red(() => respuestaDeChat(conforme()));

    await reviewDiffWithModel({ ...BASE, fetchImpl });

    const mensajes = (llamadas[0]?.body["messages"] ?? []) as {
      role: string;
      content: string;
    }[];
    const sistema = mensajes.find((m) => m.role === "system")?.content ?? "";
    const usuario = mensajes.find((m) => m.role === "user")?.content ?? "";
    expect(sistema).toBe(promptDelRevisorDeDiff());
    expect(sistema).toMatch(/dato.*no.*instrucciones/is);
    // Nunca se le pregunta si aprueba: el prompt pide hechos y el veredicto es del código.
    expect(sistema).not.toMatch(/¿apruebas|decide si apruebas|approve/i);
    expect(usuario).toContain(ENTRADA);
    for (const proposicion of PROPOSICIONES) {
      expect(usuario).toContain(proposicion.id);
      expect(usuario).toContain(proposicion.instrucciones);
    }
  });

  it("habla por el CLI de Claude sin herramientas, con el tope de salida y desde un directorio neutro", async () => {
    const ejecuciones: {
      args: readonly string[];
      stdin: string;
      cwd: string;
      env: NodeJS.ProcessEnv;
    }[] = [];
    const cliRunner = async (corrida: {
      args: readonly string[];
      stdin: string;
      cwd: string;
      env: NodeJS.ProcessEnv;
    }) => {
      ejecuciones.push(corrida);
      return {
        status: 0,
        stdout: JSON.stringify({
          type: "result",
          structured_output: conforme(),
          usage: { input_tokens: 700, output_tokens: 60 },
          modelUsage: { "claude-sonnet-5-5": {} },
        }),
        stderr: "",
        timedOut: false,
        spawnError: null,
      };
    };

    const r = await reviewDiffWithModel({
      ...BASE,
      provider: "claude-code",
      model: "claude-sonnet-5-5",
      cliRunner,
    });

    expect(r.respuestas.map((x) => x.proposicion)).toEqual(IDS);
    expect(ejecuciones).toHaveLength(1);
    const args = ejecuciones[0]?.args ?? [];
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain(promptDelRevisorDeDiff());
    expect(ejecuciones[0]?.stdin).toContain(ENTRADA);
    expect(ejecuciones[0]?.cwd).not.toContain("ValmenHarness");
    expect(ejecuciones[0]?.env["CLAUDE_CODE_MAX_OUTPUT_TOKENS"]).toBe("4096");
  });
});

describe("lo que sale del esquema no se lee como una respuesta", () => {
  const FUERA_DEL_ESQUEMA: readonly {
    readonly nombre: string;
    readonly contenido: unknown;
    readonly code: string;
  }[] = [
    {
      nombre: "una respuesta en prosa",
      contenido: "Aprobado: el cambio está bien.",
      code: "MALFORMED_RESPONSE",
    },
    {
      nombre: "un JSON que no es un objeto",
      contenido: "[1, 2]",
      code: "MALFORMED_RESPONSE",
    },
    {
      nombre: "una proposición sin responder",
      contenido: { sin_hallazgo_severo_riesgo: conforme()["sin_hallazgo_severo_riesgo"] },
      code: "MISSING_ANSWER",
    },
    {
      nombre: "cumple que no es booleano",
      contenido: conforme({
        sin_hallazgo_severo_riesgo: {
          cumple: "sí",
          confianza: 0.9,
          motivo: "x",
          hallazgos: [],
        },
      }),
      code: "MALFORMED_RESPONSE",
    },
    {
      nombre: "una confianza fuera de 0 a 1",
      contenido: conforme({
        sin_hallazgo_severo_riesgo: {
          cumple: true,
          confianza: 1.5,
          motivo: "x",
          hallazgos: [],
        },
      }),
      code: "MALFORMED_RESPONSE",
    },
    {
      nombre: "sin hallazgos",
      contenido: conforme({
        sin_hallazgo_severo_riesgo: { cumple: true, confianza: 0.9, motivo: "x" },
      }),
      code: "MALFORMED_RESPONSE",
    },
    {
      nombre: "un hallazgo sin ruta",
      contenido: conforme({
        sin_hallazgo_severo_riesgo: {
          cumple: false,
          confianza: 0.9,
          motivo: "x",
          hallazgos: [{ linea: 3, motivo: "y" }],
        },
      }),
      code: "MALFORMED_RESPONSE",
    },
    {
      nombre: "un hallazgo con una línea que no es un entero positivo",
      contenido: conforme({
        sin_hallazgo_severo_riesgo: {
          cumple: false,
          confianza: 0.9,
          motivo: "x",
          hallazgos: [{ ruta: "src/a.ts", linea: 0, motivo: "y" }],
        },
      }),
      code: "MALFORMED_RESPONSE",
    },
    {
      nombre: "sin motivo",
      contenido: conforme({
        sin_hallazgo_severo_riesgo: {
          cumple: true,
          confianza: 0.9,
          motivo: "  ",
          hallazgos: [],
        },
      }),
      code: "MISSING_REASON",
    },
  ];

  for (const caso of FUERA_DEL_ESQUEMA) {
    it(`${caso.nombre} lanza JudgeError`, async () => {
      const { fetchImpl } = red(() => respuestaDeChat(caso.contenido));

      const intento = reviewDiffWithModel({ ...BASE, fetchImpl });

      await expect(intento).rejects.toBeInstanceOf(JudgeError);
      await expect(intento).rejects.toMatchObject({ code: caso.code });
    });
  }

  it("un fallo del proveedor es un JudgeError, no una respuesta", async () => {
    const { fetchImpl } = red(() => new Response("caído", { status: 503 }));

    await expect(reviewDiffWithModel({ ...BASE, fetchImpl })).rejects.toMatchObject({
      name: "JudgeError",
      code: "SERVER",
    });
  });

  it("sin proposiciones que responder no se llama al modelo", async () => {
    const { llamadas, fetchImpl } = red(() => respuestaDeChat(conforme()));

    await expect(
      reviewDiffWithModel({ ...BASE, proposiciones: [], fetchImpl }),
    ).rejects.toBeInstanceOf(JudgeError);
    expect(llamadas).toHaveLength(0);
  });
});
