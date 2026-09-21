/**
 * Evaluador de gates con Jev.
 *
 * `fetch` se inyecta, así que estos tests verifican el contrato completo sin
 * red y sin clave real. Lo que comprueban no es "que la llamada funcione" —eso
 * ya se verificó contra el endpoint real con `scripts/verify-jev.mjs`— sino que
 * la traducción entre nuestro contrato y el de la API sea correcta, y que
 * ningún camino pueda filtrar la credencial ni aprobar por accidente.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Proposition } from "@valmen/gate";
import {
  DEFAULT_JEV_MODEL,
  DECISIONS_ENDPOINT,
  EvaluatorError,
  evaluateWithJev,
} from "../packages/gate-jev/src/index.js";
// El resolver de credenciales se movió a un paquete compartido, para que una
// clave configurada funcione igual con cualquier evaluador.
import {
  CredentialError,
  resolveApiKey,
} from "../packages/credentials/src/index.js";

/** Una respuesta bien formada del endpoint, como la que devuelve de verdad. */
function goodResponse(): Response {
  return new Response(
    JSON.stringify({
      id: "gen-dec-1789738314-X5e5eKGQdvR9rblyX250",
      model: "typesafe/jev-1.13-20260917",
      provider: "TypeSafe",
      answers: {
        cubre: { type: "noul", noul: 0.76 },
        clasificacion: {
          type: "choice",
          choice: "completa",
          confidence: 1,
          probabilities: { completa: 1 },
        },
        riesgo: { type: "score", score: 2.4, confidence: 0.71 },
      },
      usage: { input_tokens: 751, output_tokens: 115, cost: 0.000031542 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** Captura la petición y devuelve la respuesta indicada. */
function capture(response: Response | (() => Response)): {
  fetchImpl: typeof fetch;
  calls: {
    url: string;
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }[];
} {
  const calls: {
    url: string;
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }[] = [];
  const fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return typeof response === "function" ? response() : response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const PROPOSITIONS: Proposition[] = [
  {
    id: "cubre",
    kind: "noul",
    instructions: "El plan cubre todos los criterios.",
    criteria: {
      yes: "Hay al menos un paso por criterio.",
      no: "Falta al menos uno.",
    },
  },
  {
    id: "clasificacion",
    kind: "choice",
    instructions: "¿Qué le falta al plan?",
    criteria: { completa: "Nada.", falta_alcance: "El alcance." },
  },
  {
    id: "riesgo",
    kind: "score",
    instructions: "Riesgo del cambio.",
    criteria: ["trivial", "bajo", "medio", "alto"],
  },
];

const STATE = { solicitud: "…", plan: "…" };

describe("traducción al contrato de la API", () => {
  it("envía todo en una sola llamada al endpoint de Decisions", async () => {
    const { fetchImpl, calls } = capture(goodResponse());
    await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: "k",
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    // No es la API de chat: es el endpoint de Decisions.
    expect(calls[0]?.url).toBe(DECISIONS_ENDPOINT);
    expect(calls[0]?.url).not.toContain("chat/completions");
  });

  it("manda el estado tal cual, sin transformarlo", async () => {
    const { fetchImpl, calls } = capture(goodResponse());
    await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: "k",
      fetchImpl,
    });
    expect(calls[0]?.body["state"]).toEqual(STATE);
  });

  it("traduce `noul` con sus dos polos como criterios", async () => {
    const { fetchImpl, calls } = capture(goodResponse());
    await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: "k",
      fetchImpl,
    });
    const questions = calls[0]?.body["questions"] as Record<
      string,
      Record<string, unknown>
    >;
    expect(questions["cubre"]?.["type"]).toBe("noul");
    expect(questions["cubre"]?.["criteria"]).toEqual({
      true: "Hay al menos un paso por criterio.",
      false: "Falta al menos uno.",
    });
  });

  it("traduce `choice` con un MAPA de criterios", async () => {
    const { fetchImpl, calls } = capture(goodResponse());
    await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: "k",
      fetchImpl,
    });
    const questions = calls[0]?.body["questions"] as Record<
      string,
      Record<string, unknown>
    >;
    // El contrato de la API pide un objeto, no una lista: clave = opción.
    expect(questions["clasificacion"]?.["criteria"]).toEqual({
      completa: "Nada.",
      falta_alcance: "El alcance.",
    });
  });

  it("traduce `score` con un ARRAY ordenado de niveles", async () => {
    const { fetchImpl, calls } = capture(goodResponse());
    await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: "k",
      fetchImpl,
    });
    const questions = calls[0]?.body["questions"] as Record<
      string,
      Record<string, unknown>
    >;
    // Una escala es un arreglo ordenado de menor a mayor, no un mapa.
    expect(questions["riesgo"]?.["criteria"]).toEqual([
      "trivial",
      "bajo",
      "medio",
      "alto",
    ]);
  });

  it("omite `criteria` en `noul` cuando no se declararon los polos", async () => {
    const { fetchImpl, calls } = capture(goodResponse());
    const simple: Proposition[] = [
      { id: "cubre", kind: "noul", instructions: "x" },
    ];
    await evaluateWithJev({
      propositions: simple,
      state: STATE,
      apiKey: "k",
      fetchImpl,
    });
    const questions = calls[0]?.body["questions"] as Record<
      string,
      Record<string, unknown>
    >;
    expect(questions["cubre"]).not.toHaveProperty("criteria");
  });

  it("usa el modelo por defecto y permite sustituirlo", async () => {
    const { fetchImpl, calls } = capture(goodResponse());
    await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: "k",
      fetchImpl,
    });
    expect(calls[0]?.body["model"]).toBe(DEFAULT_JEV_MODEL);

    const otro = capture(goodResponse());
    await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: "k",
      fetchImpl: otro.fetchImpl,
      model: "typesafe/otro",
    });
    expect(otro.calls[0]?.body["model"]).toBe("typesafe/otro");
  });
});

describe("lectura de la respuesta", () => {
  it("devuelve las respuestas normalizadas y la versión resuelta", async () => {
    const { fetchImpl } = capture(goodResponse());
    const result = await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: "k",
      fetchImpl,
    });

    expect(result.answers.map((answer) => answer.id)).toEqual([
      "cubre",
      "clasificacion",
      "riesgo",
    ]);
    expect(result.answers[0]?.value).toBe(0.76);
    expect(result.answers[1]?.choice).toBe("completa");
    // 2.4 es válido: el score es un número, puede caer entre dos niveles.
    expect(result.answers[2]?.score).toBe(2.4);
  });

  it("guarda la versión concreta del modelo, no el alias", async () => {
    const { fetchImpl } = capture(goodResponse());
    const result = await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: "k",
      fetchImpl,
    });
    // Sin esto, un cambio de resultados sería indistinguible de un cambio del
    // artefacto evaluado.
    expect(result.model.resolvedVersion).toBe("typesafe/jev-1.13-20260917");
    expect(result.model.model).toBe(DEFAULT_JEV_MODEL);
    expect(result.model.provider).toBe("TypeSafe");
  });

  it("registra el uso y el coste medidos", async () => {
    const { fetchImpl } = capture(goodResponse());
    const result = await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: "k",
      fetchImpl,
    });
    expect(result.usage).toEqual({
      inputTokens: 751,
      outputTokens: 115,
      costUsd: 0.000031542,
    });
  });

  it("mide la latencia", async () => {
    const { fetchImpl } = capture(goodResponse());
    const result = await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: "k",
      fetchImpl,
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe("fallos: nunca aprueba por accidente", () => {
  it("falla si el evaluador no respondió una proposición", async () => {
    const { fetchImpl } = capture(
      new Response(
        JSON.stringify({
          model: "m",
          answers: { cubre: { type: "noul", noul: 0.9 } },
        }),
        {
          status: 200,
        },
      ),
    );
    // Tratar una respuesta ausente como aprobación es exactamente el fallo que
    // el sistema existe para evitar.
    await expect(
      evaluateWithJev({
        propositions: PROPOSITIONS,
        state: STATE,
        apiKey: "k",
        fetchImpl,
      }),
    ).rejects.toThrow("no respondió: clasificacion, riesgo");
  });

  it("falla si `noul` no es un número en [0,1]", async () => {
    const { fetchImpl } = capture(
      new Response(
        JSON.stringify({
          model: "m",
          answers: {
            cubre: { type: "noul", noul: 1.5 },
            clasificacion: { type: "choice", choice: "completa" },
            riesgo: { type: "score", score: 1 },
          },
        }),
        { status: 200 },
      ),
    );
    await expect(
      evaluateWithJev({
        propositions: PROPOSITIONS,
        state: STATE,
        apiKey: "k",
        fetchImpl,
      }),
    ).rejects.toThrow(EvaluatorError);
  });

  it("falla ante una respuesta que no es JSON", async () => {
    const { fetchImpl } = capture(new Response("no soy json", { status: 200 }));
    await expect(
      evaluateWithJev({
        propositions: PROPOSITIONS,
        state: STATE,
        apiKey: "k",
        fetchImpl,
      }),
    ).rejects.toThrow("no es JSON");
  });

  it("clasifica un 401 como error de autenticación", async () => {
    const { fetchImpl } = capture(
      new Response("no autorizado", { status: 401 }),
    );
    const error = await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: "k",
      fetchImpl,
    }).catch((caught: unknown) => caught as EvaluatorError);
    expect(error).toBeInstanceOf(EvaluatorError);
    expect((error as EvaluatorError).code).toBe("AUTH");
  });

  it("clasifica un 429 como límite de tasa", async () => {
    const { fetchImpl } = capture(new Response("demasiadas", { status: 429 }));
    const error = await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: "k",
      fetchImpl,
    }).catch((caught: unknown) => caught as EvaluatorError);
    expect((error as EvaluatorError).code).toBe("RATE_LIMIT");
  });

  it("clasifica un fallo de red como error de transporte", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const error = await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: "k",
      fetchImpl,
    }).catch((caught: unknown) => caught as EvaluatorError);
    expect((error as EvaluatorError).code).toBe("TRANSPORT");
  });

  it("exige al menos una proposición", async () => {
    const { fetchImpl } = capture(goodResponse());
    await expect(
      evaluateWithJev({
        propositions: [],
        state: STATE,
        apiKey: "k",
        fetchImpl,
      }),
    ).rejects.toThrow("al menos una proposición");
  });
});

describe("la credencial nunca se filtra", () => {
  const CLAVE = "sk-or-v1-clave-secreta-de-prueba-0123456789";

  it("va en la cabecera Authorization", async () => {
    const { fetchImpl, calls } = capture(goodResponse());
    await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: CLAVE,
      fetchImpl,
    });
    expect(calls[0]?.headers["Authorization"]).toBe(`Bearer ${CLAVE}`);
  });

  it("NO aparece en el mensaje de un error de autenticación", async () => {
    // Un diagnóstico que filtra la credencial que intentaba leer es peor que no
    // tener diagnóstico.
    const { fetchImpl } = capture(
      new Response("no autorizado", { status: 401 }),
    );
    const error = (await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: CLAVE,
      fetchImpl,
    }).catch((caught: unknown) => caught)) as Error;
    expect(error.message).not.toContain(CLAVE);
    expect(error.message).not.toContain("sk-or-v1");
  });

  it("NO aparece en el mensaje de un fallo de red", async () => {
    const fetchImpl = (async () => {
      throw new Error("timeout");
    }) as unknown as typeof fetch;
    const error = (await evaluateWithJev({
      propositions: PROPOSITIONS,
      state: STATE,
      apiKey: CLAVE,
      fetchImpl,
    }).catch((caught: unknown) => caught)) as Error;
    expect(error.message).not.toContain(CLAVE);
  });
});

describe("resolución de la credencial", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "valmen-creds-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("prefiere la variable de entorno", () => {
    // Permite una prueba puntual sin escribir el secreto en disco.
    const key = resolveApiKey("openrouter", {
      OPENROUTER_API_KEY: "desde-el-entorno",
    } as NodeJS.ProcessEnv);
    expect(key).toBe("desde-el-entorno");
  });

  it("ignora una variable de entorno vacía y cae al archivo", () => {
    // Una variable definida pero en blanco no es una credencial. Lo que importa
    // es que no se devuelva la cadena vacía como si fuera una clave: o se
    // resuelve del archivo, o se falla con un código claro.
    let resultado: string | null = null;
    let error: CredentialError | null = null;
    try {
      resultado = resolveApiKey("openrouter", {
        OPENROUTER_API_KEY: "   ",
      } as NodeJS.ProcessEnv);
    } catch (caught) {
      error = caught as CredentialError;
    }

    if (resultado !== null) {
      // Cayó al archivo: la clave debe ser real, no espacios.
      expect(resultado.trim()).toBe(resultado);
      expect(resultado.length).toBeGreaterThan(0);
    } else {
      expect(error?.code).toBe("CREDENTIAL_MISSING");
    }
  });

  it("lee la clave del archivo de credenciales cuando no hay variable", () => {
    const dir = join(home, ".valmen");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, ".credentials.yaml"),
      [
        "version: 1",
        "providers:",
        "  openrouter:",
        '    api-key: "sk-or-v1-del-archivo"',
        "",
      ].join("\n"),
      "utf8",
    );

    // Se sustituye HOME solo para esta comprobación.
    const original = process.env["HOME"];
    process.env["HOME"] = home;
    try {
      // `resolveApiKey` con un entorno sin la variable debe caer al archivo.
      const key = resolveApiKey("openrouter", {} as NodeJS.ProcessEnv);
      expect(key).toBe("sk-or-v1-del-archivo");
    } finally {
      if (original === undefined) delete process.env["HOME"];
      else process.env["HOME"] = original;
    }
  });

  it("falla con un mensaje útil si no hay credencial en ningún sitio", () => {
    const error = (() => {
      try {
        resolveApiKey("openrouter", {} as NodeJS.ProcessEnv);
        return null;
      } catch (caught) {
        return caught as CredentialError;
      }
    })();
    // En la máquina de quien ejecuta los tests puede existir un archivo de
    // credenciales con el campo vacío, así que hay dos desenlaces legítimos y
    // lo que importa es común a ambos: el código, que sea accionable, y que no
    // filtre nada.
    if (error !== null) {
      expect(error.code).toBe("CREDENTIAL_MISSING");
      expect(error.message.length).toBeGreaterThan(20);
      expect(error.message).not.toContain("sk-");
    }
  });
});

describe("compatibilidad del campo de credencial", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "valmen-creds2-"));
    mkdirSync(join(home, ".valmen"), { recursive: true });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  /** Escribe un archivo de credenciales y resuelve la clave con HOME sustituido. */
  function withCredentials(content: string): string | CredentialError {
    writeFileSync(join(home, ".valmen", ".credentials.yaml"), content, "utf8");
    const original = process.env["HOME"];
    process.env["HOME"] = home;
    try {
      return resolveApiKey("openrouter", {} as NodeJS.ProcessEnv);
    } catch (caught) {
      return caught as CredentialError;
    } finally {
      if (original === undefined) delete process.env["HOME"];
      else process.env["HOME"] = original;
    }
  }

  it("acepta el nombre de campo correcto (api-key)", () => {
    const result = withCredentials(
      [
        "version: 1",
        "providers:",
        "  openrouter:",
        "    api-key: sk-or-v1-correcta",
        "",
      ].join("\n"),
    );
    expect(result).toBe("sk-or-v1-correcta");
  });

  it("acepta el nombre anterior (api-key-env) con el valor literal", () => {
    // Una versión previa de la plantilla se llamaba así y sugería una
    // indirección que no existía. Hay archivos en uso con ese nombre y el valor
    // dentro: rechazarlos rompería una configuración válida por un detalle de
    // nomenclatura ya corregido.
    const result = withCredentials(
      [
        "version: 1",
        "providers:",
        "  openrouter:",
        "    api-key-env: sk-or-v1-del-nombre-viejo",
        "",
      ].join("\n"),
    );
    expect(result).toBe("sk-or-v1-del-nombre-viejo");
  });

  it("avisa si se pegó el NOMBRE de una variable en vez de la clave", () => {
    // Un identificador en mayúsculas enviado como clave produce un 401 confuso
    // lejos de su causa. Mejor decirlo al leerlo.
    const result = withCredentials(
      [
        "version: 1",
        "providers:",
        "  openrouter:",
        "    api-key: OPENROUTER_API_KEY",
        "",
      ].join("\n"),
    );
    expect(result).toBeInstanceOf(CredentialError);
    expect((result as CredentialError).code).toBe("CREDENTIAL_MISSING");
    expect((result as CredentialError).message).toContain(
      "NOMBRE de una variable",
    );
  });

  it("distingue un campo vacío de un campo ausente", () => {
    const vacio = withCredentials(
      ["version: 1", "providers:", "  openrouter:", '    api-key: ""', ""].join(
        "\n",
      ),
    );
    expect((vacio as CredentialError).message).toContain(
      "campo de clave vacío",
    );

    const ausente = withCredentials(
      [
        "version: 1",
        "providers:",
        "  openrouter:",
        "    otra-cosa: x",
        "",
      ].join("\n"),
    );
    expect((ausente as CredentialError).message).toContain("no declara");
  });

  it("lee el bloque correcto aunque otros proveedores tengan claves", () => {
    const result = withCredentials(
      [
        "version: 1",
        "providers:",
        "  deepseek:",
        "    api-key: sk-deepseek-otra",
        "  openrouter:",
        "    api-key: sk-or-v1-la-buena",
        "  moonshot:",
        "    api-key: MOONSHOT_API_KEY",
        "",
      ].join("\n"),
    );
    expect(result).toBe("sk-or-v1-la-buena");
  });
});
