/**
 * El routing de modelos, visto desde la app.
 *
 * Un preset que no cambia nada es peor que no tener preset: el usuario cree
 * haber cambiado el perfil de coste y sigue pagando lo mismo. Lo que estos
 * tests protegen:
 *
 * 1. **La resolución dice de dónde salió cada modelo.** Proyecto, preset o
 *    sistema. Es la columna que distingue "el preset no hace nada" de "hay un
 *    override olvidado en el proyecto".
 * 2. **Los roles sin consumidor se declaran como tales.** Prometer que un modelo
 *    se usa para algo que el harness todavía no ejecuta sería una mentira
 *    cómoda.
 * 3. **El modelo del rol llega a la llamada real.** Si `gate-evaluator` apunta a
 *    un modelo de chat, el evaluador semántico pasa a ser un juez y el recibo lo
 *    registra; si apunta a Jev, el gate sigue emitiendo probabilidades.
 * 4. **El orden "el código primero" no se rompe por configuración.** Un gate que
 *    se resuelve con comandos se sigue resolviendo con comandos.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  EFFORTS,
  PRESETS,
  ROLES,
  parseRouting,
  parseRoutingTolerante,
  renderRouting,
  resolveRouting,
} from "../packages/adapter/src/index.js";
import { listGateCards, runTicketGate } from "../packages/server/src/gates.js";
import {
  checkRouting,
  fetchCatalog,
  gateRouting,
  presetModels,
  readRouting,
  routingFromForm,
  routingPath,
  writeRouting,
} from "../packages/server/src/routing.js";
import { resetCatalogCache } from "../packages/server/src/routing.js";
import { handleApi } from "../packages/server/src/server.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";

let lab: string;

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

/** El contexto de la API, con el catálogo inyectado para no salir a la red. */
function context() {
  return {
    root: lab,
    paths: PATHS(),
    credentialsFile: join(lab, ".valmen", ".credentials.yaml"),
    env: {},
    fetchImpl: (async () => new Response("{}", { status: 500 })) as typeof fetch,
  };
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-routing-"));
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  mkdirSync(join(lab, "tickets"), { recursive: true });
  writeFixtureTicket(lab, { id: TICKET });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

// ── El catálogo de roles y presets ──────────────────────────────────────────

describe("el catálogo de roles", () => {
  it("todos los roles declarados tienen quién los ejecute", () => {
    // La regla que se aprendió a golpes: un rol declarado sin consumidor es peor
    // que un rol ausente. La pantalla lo mostraba con selectores y botón de
    // probar, y el trabajo real lo ejecutaba el agente con su propio modelo.
    //
    // Los nueve que estaban en esa situación —`spec-author`, `architect`,
    // `critic`, `explorer`, `implementer`, `test-author`, `doc-writer`,
    // `verifier`, `classifier` y `summarizer`— se retiraron del contrato y de los
    // presets. Este test impide que vuelvan por descuido.
    //
    // `architect` volvió, y con consumidor: `valmen feature decompose` lo ejecuta
    // de verdad —y la pantalla de una feature ofrece el botón—, así que el rol
    // tenía que estar acá y en los presets. Estaba en el formato del archivo y en
    // ninguna otra parte, y el resultado era que descomponer fallaba con «no hay
    // modelo para el rol architect» en un proyecto recién adoptado.
    expect(ROLES.every((rol) => rol.consumer !== null && rol.consumer !== "")).toBe(true);
    expect(ROLES.map((rol) => rol.id)).toEqual([
      "gate-evaluator",
      "gate-judge",
      "orchestrator",
      "architect",
    ]);
    expect(ROLES.every((rol) => rol.description !== "")).toBe(true);
  });

  it("los presets solo asignan modelos a los roles que se ejecutan", () => {
    const declarados = new Set(ROLES.map((rol) => rol.id));
    for (const preset of PRESETS) {
      for (const rol of Object.keys(preset.roles)) {
        expect(declarados.has(rol)).toBe(true);
      }
    }
  });

  it("los presets cubren todos los roles y usan esfuerzos válidos", () => {
    expect(PRESETS.map((preset) => preset.id)).toEqual([
      "quality",
      "balanced",
      "economy",
      "suscripcion",
    ]);
    for (const preset of PRESETS) {
      for (const rol of ROLES) {
        const ruta = preset.roles[rol.id];
        expect(ruta, `${preset.id}/${rol.id}`).toBeDefined();
        expect(EFFORTS).toContain(ruta?.effort);
        expect(ruta?.model).not.toBe("");
      }
    }
  });

  it("los presets con claves de API usan Jev como evaluador de gates", () => {
    // Cambiarlo es posible, pero no es lo que propone el harness: Jev es el único
    // que emite probabilidades calibradas. La excepción es `suscripcion`, que
    // existe justamente para un equipo **sin claves de API**: ahí el evaluador es
    // Claude, el gate pasa a juicio de un modelo y `routing show` lo advierte.
    for (const preset of PRESETS) {
      if (preset.id === "suscripcion") continue;
      expect(preset.roles["gate-evaluator"]?.model).toBe("typesafe/jev-1.13");
    }

    const sinClaves = PRESETS.find((preset) => preset.id === "suscripcion");
    expect(sinClaves?.roles["gate-evaluator"]?.provider).toBe("claude-code");
    // Y los cuatro roles resuelven a un proveedor que no pide clave de API.
    for (const ruta of Object.values(sinClaves?.roles ?? {})) {
      expect(ruta.provider).toBe("claude-code");
      expect(ruta.model).not.toBe("");
    }
  });

  it("no repite el mismo modelo caro en los roles de ejecución del preset económico", () => {
    const economico = PRESETS.find((preset) => preset.id === "economy");
    const caros = ["anthropic/claude-opus-4.6", "openai/gpt-5.6-luna-pro"];
    for (const [rol, ruta] of Object.entries(economico?.roles ?? {})) {
      expect(caros, rol).not.toContain(ruta.model);
    }
  });
});

// ── Resolución ──────────────────────────────────────────────────────────────

describe("cada rol que el harness ejecuta tiene modelo", () => {
  it("en los tres presets, sin que nadie configure nada", () => {
    // La propiedad que estaba rota: ningún preset daba modelo al `architect`, y
    // la pantalla tampoco lo mostraba para asignarlo a mano, así que el botón de
    // descomponer no podía funcionar en un proyecto recién adoptado.
    for (const preset of PRESETS.map((p) => p.id)) {
      const sinModelo = resolveRouting({ preset, roles: {} })
        .filter((ruta) => ruta.model === "")
        .map((ruta) => ruta.role);
      expect(sinModelo, `el preset ${preset} deja roles sin modelo`).toEqual([]);
    }
  });

  it("el arquitecto no es el juez ni el evaluador de la compuerta", () => {
    // La descomposición la escribe el arquitecto y la revisa una compuerta: un
    // modelo revisándose a sí mismo no revisa nada. Hoy la cobertura se comprueba
    // en código, y la separación se afirma igual para que no se pierda el día que
    // esa comprobación la haga un modelo.
    for (const preset of PRESETS.map((p) => p.id)) {
      const rutas = resolveRouting({ preset, roles: {} });
      const modelo = (rol: string) => rutas.find((r) => r.role === rol)?.model;
      expect(modelo("architect")).toBeTruthy();
      expect(modelo("architect")).not.toBe(modelo("gate-judge"));
      expect(modelo("architect")).not.toBe(modelo("gate-evaluator"));
    }
  });
});

describe("la resolución de un rol", () => {
  it("sin override, el modelo viene del preset", () => {
    const rutas = resolveRouting({ preset: "economy", roles: {} });
    const orquestador = rutas.find((ruta) => ruta.role === "orchestrator");
    expect(orquestador?.source).toBe("preset");
    expect(orquestador?.model).toBe("z-ai/glm-5.3-flash");
  });

  it("el override del proyecto gana sobre el preset, y lo dice", () => {
    const rutas = resolveRouting({
      preset: "economy",
      roles: {
        orchestrator: {
          provider: "openrouter",
          model: "anthropic/claude-opus-4.6",
          effort: "high",
        },
      },
    });
    const orquestador = rutas.find((ruta) => ruta.role === "orchestrator");
    expect(orquestador?.source).toBe("proyecto");
    expect(orquestador?.model).toBe("anthropic/claude-opus-4.6");
    expect(orquestador?.effort).toBe("high");
  });

  it("marca el rol del evaluador según emita probabilidades o texto", () => {
    const conJev = resolveRouting({ preset: "balanced", roles: {} });
    expect(conJev.find((ruta) => ruta.role === "gate-evaluator")?.probabilistic).toBe(true);

    const conJuez = resolveRouting({
      preset: "balanced",
      roles: {
        "gate-evaluator": {
          provider: "openrouter",
          model: "deepseek/deepseek-v4-flash",
          effort: "auto",
        },
      },
    });
    expect(conJuez.find((ruta) => ruta.role === "gate-evaluator")?.probabilistic).toBe(
      false,
    );
  });
});

// ── Análisis del archivo ────────────────────────────────────────────────────

describe("el archivo de routing", () => {
  it("acepta la forma corta y la larga", () => {
    const routing = parseRouting(
      "preset: economy\nroles:\n  orchestrator: anthropic/claude-opus-4.6\n  gate-judge:\n    model: moonshotai/kimi-k3\n    effort: high\n",
    );
    expect(routing.preset).toBe("economy");
    expect(routing.roles.orchestrator?.model).toBe("anthropic/claude-opus-4.6");
    expect(routing.roles["gate-judge"]?.effort).toBe("high");
  });

  it("rechaza un rol que no existe en vez de guardarlo en silencio", () => {
    // El rechazo es deliberado: guardar una clave que nadie lee haría creer que
    // el proyecto configuró algo. Pero el mensaje tiene que decir qué hacer,
    // porque este error detiene todas las compuertas del proyecto: un
    // `routing.yaml` de una versión anterior —cuando el harness declaraba doce
    // roles— dejaba el CLI sin poder evaluar nada, con un texto que enumeraba los
    // roles vigentes y nada más.
    let mensaje = "";
    try {
      parseRouting("preset: balanced\nroles:\n  orquestador:\n    model: x\n");
    } catch (caught) {
      mensaje = caught instanceof Error ? caught.message : String(caught);
    }
    expect(mensaje).toMatch(/no es un rol del harness/);
    // Nombra el rol culpable, no solo el archivo.
    expect(mensaje).toContain("orquestador");
    // Y dice la salida: borrar la clave.
    expect(mensaje).toContain("bórralo de .valmen/routing.yaml");
  });

  it("la lectura tolerante devuelve los retirados aparte, sin relajar el rechazo", () => {
    // Las dos lecturas conviven a propósito y hacen cosas distintas. La estricta
    // es la que usa el harness para trabajar: sigue rechazando. La tolerante
    // existe porque **el error que se quiere corregir es el que impide leer el
    // archivo**: una migración no podría ni abrirlo con la estricta.
    const texto =
      "preset: balanced\nroles:\n  explorer:\n    model: x\n  gate-judge:\n    model: y\n";

    expect(() => parseRouting(texto)).toThrow(/no es un rol del harness/);

    const { routing, retirados } = parseRoutingTolerante(texto);
    expect(retirados).toEqual(["explorer"]);
    expect(routing.roles["gate-judge"]?.model).toBe("y");
    expect(routing.roles["explorer"]).toBeUndefined();
  });

  it("la lectura tolerante tampoco se traga un preset inexistente", () => {
    // Tolerar un rol retirado es posible porque sobra; tolerar un preset
    // inexistente no, porque sin preset no hay de dónde resolver los roles y
    // adivinar uno sería peor que decirlo.
    expect(() => parseRoutingTolerante("preset: carisimo\nroles: {}\n")).toThrow(
      /Preset desconocido/,
    );
  });

  it("rechaza un preset inexistente", () => {
    expect(() => parseRouting("preset: carisimo\n")).toThrow(/Preset desconocido/);
  });

  it("rechaza un esfuerzo inválido", () => {
    expect(() =>
      parseRouting(
        "preset: balanced\nroles:\n  gate-judge:\n    model: x\n    effort: muchísimo\n",
      ),
    ).toThrow(/esfuerzo/);
  });

  it("un proyecto sin archivo usa el preset por defecto sin marcar error", () => {
    const estado = readRouting(lab);
    expect(estado.ok).toBe(true);
    expect(estado.text).toBe("");
    expect(estado.roles.find((ruta) => ruta.role === "orchestrator")?.source).toBe(
      "preset",
    );
  });

  it("lo que escribe el formulario es lo que lee el parser", () => {
    // Un rol con modelo se escribe; uno sin modelo no, porque escribir un rol
    // vacío lo dejaría configurado en nada y el preset dejaría de aportar su
    // valor. Se usa `gate-evaluator` para el rol con modelo porque es el que más
    // importa que llegue bien: es el que decide las compuertas.
    const texto = routingFromForm({
      preset: "quality",
      roles: {
        "gate-evaluator": { model: "anthropic/claude-opus-4.6", effort: "high" },
        "gate-judge": { model: "" }, // sin modelo: no se escribe
      },
    });
    expect(texto).toContain("preset: quality");
    expect(texto).toContain("gate-evaluator");
    expect(texto).not.toContain("gate-judge:");

    const routing = parseRouting(texto);
    expect(routing.roles["gate-evaluator"]?.effort).toBe("high");
    expect(routing.roles["gate-judge"]).toBeUndefined();
  });

  it("el render y el parser son inversos", () => {
    const routing = {
      preset: "balanced",
      roles: {
        "gate-judge": {
          provider: "openrouter",
          model: "moonshotai/kimi-k3",
          effort: "high" as const,
        },
      },
    };
    expect(parseRouting(renderRouting(routing))).toEqual(routing);
  });

  it("no escribe un texto que no parsea, y no toca el archivo", () => {
    const resultado = writeRouting(lab, "preset: inventado\n");
    expect(resultado.written).toBe(false);
    expect(resultado.ok).toBe(false);
    expect(() => readFileSync(routingPath(lab), "utf8")).toThrow();
  });

  it("guarda y relee el routing del proyecto", () => {
    const texto = routingFromForm({
      preset: "economy",
      roles: { orchestrator: { model: "anthropic/claude-opus-4.6", effort: "high" } },
    });
    expect(writeRouting(lab, texto).written).toBe(true);

    const estado = checkRouting(lab, readFileSync(routingPath(lab), "utf8"));
    expect(estado.ok).toBe(true);
    expect(estado.preset).toBe("economy");
    const orquestador = estado.roles.find((ruta) => ruta.role === "orchestrator");
    expect(orquestador?.source).toBe("proyecto");
    expect(orquestador?.model).toBe("anthropic/claude-opus-4.6");
  });
});

// ── El catálogo de modelos ──────────────────────────────────────────────────

describe("el catálogo de modelos", () => {
  it("cae a los modelos de los presets si no hay red, y lo dice", async () => {
    const catalogo = await fetchCatalog((async () => {
      throw new Error("sin red");
    }) as unknown as typeof fetch);
    expect(catalogo.source).toBe("presets");
    expect(catalogo.detail).toContain("sin red");
    expect(catalogo.models.length).toBeGreaterThan(0);
  });

  it("añade Jev, que no está en el catálogo de chat", async () => {
    const catalogo = await fetchCatalog(
      (async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "deepseek/deepseek-v4-flash",
                name: "DeepSeek V4 Flash",
                pricing: { prompt: "0.00000004" },
              },
              {
                id: "anthropic/claude-opus-4.6",
                name: "Claude Opus 4.6",
                pricing: { prompt: "0.00001" },
              },
            ],
          }),
          { status: 200 },
        )) as unknown as typeof fetch,
    );

    expect(catalogo.source).toBe("openrouter");
    const jev = catalogo.models.find((modelo) => modelo.id === "typesafe/jev-1.13");
    expect(jev?.probabilistic).toBe(true);
    // Y va primero: es lo que alguien viene a buscar al abrir esta pantalla.
    expect(catalogo.models[0]?.id).toBe("typesafe/jev-1.13");
    expect(
      catalogo.models.find((m) => m.id === "deepseek/deepseek-v4-flash")?.promptUsd,
    ).toBeCloseTo(0.00000004, 12);
  });

  it("la lista local incluye todos los modelos de los presets", () => {
    const ids = new Set(presetModels().map((modelo) => modelo.id));
    for (const preset of PRESETS) {
      for (const ruta of Object.values(preset.roles)) {
        expect(ids.has(ruta.model), ruta.model).toBe(true);
      }
    }
  });
});

// ── El modelo llega al gate ─────────────────────────────────────────────────

describe("el routing llega a la ejecución del gate", () => {
  it("sin archivo, el gate usa Jev", () => {
    const routing = gateRouting(lab);
    expect(routing.evaluatorModel).toBe("typesafe/jev-1.13");
    expect(routing.probabilistic).toBe(true);
    expect(routing.source).toBe("preset");
  });

  it("cambiar el rol del evaluador cambia lo que el gate va a usar", () => {
    writeRouting(
      lab,
      routingFromForm({
        preset: "balanced",
        roles: {
          "gate-evaluator": { model: "deepseek/deepseek-v4-flash", effort: "medium" },
        },
      }),
    );
    const routing = gateRouting(lab);
    expect(routing.evaluatorModel).toBe("deepseek/deepseek-v4-flash");
    expect(routing.probabilistic).toBe(false);
    expect(routing.source).toBe("proyecto");
    expect(routing.evaluatorEffort).toBe("medium");
  });

  it("la tarjeta del gate dice qué modelo se usará y de dónde sale", () => {
    writeRouting(
      lab,
      routingFromForm({
        preset: "quality",
        roles: { "gate-evaluator": { model: "typesafe/jev-1.13", effort: "auto" } },
      }),
    );
    const plan = listGateCards(PATHS(), TICKET)?.find((gate) => gate.id === "plan");
    expect(plan?.routing.model).toBe("typesafe/jev-1.13");
    expect(plan?.routing.source).toBe("proyecto");
    expect(plan?.routing.probabilistic).toBe(true);
  });

  it("con un modelo de chat, el evaluador semántico pasa a ser un juez", async () => {
    writeRouting(
      lab,
      routingFromForm({
        preset: "balanced",
        roles: {
          "gate-evaluator": { model: "deepseek/deepseek-v4-flash", effort: "auto" },
        },
      }),
    );

    // Con `jev` inyectado se comprueba que **no** se usa: el routing dice que el
    // rol apunta a un modelo de chat, así que el evaluador es un juez.
    let jevLlamado = false;
    const espiaJev = (async () => {
      jevLlamado = true;
      throw new Error("no debería usarse Jev");
    }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;

    let juezLlamado = false;
    const espiaJuez = (async (options: {
      propositions: readonly {
        id: string;
        kind?: string;
        criteria?: Readonly<Record<string, string>>;
      }[];
    }) => {
      juezLlamado = true;
      // El mock respeta el tipo de cada proposición: una de elección exige una
      // opción, y responderla como probabilidad haría fallar el gate por
      // contrato, midiendo el mock en vez del flujo.
      return {
        answers: options.propositions.map((proposicion) =>
          proposicion.kind === "choice"
            ? {
                id: proposicion.id,
                kind: "choice" as const,
                choice: Object.keys(proposicion.criteria ?? {})[0] as string,
                confidence: 0.95,
              }
            : { id: proposicion.id, kind: "noul" as const, value: 0.95 },
        ),
        model: {
          provider: "openrouter",
          model: "deepseek/deepseek-v4-flash",
          resolvedVersion: "deepseek/deepseek-v4-flash",
        },
        usage: { inputTokens: 10, outputTokens: 10, costUsd: 0.000001 },
        latencyMs: 5,
      };
    }) as unknown as typeof import("../packages/gate-llm-judge/src/index.js").evaluateWithJudge;

    const resultado = await runTicketGate(PATHS(), TICKET, "plan", {
      jev: espiaJev,
      judge: espiaJuez,
    });

    expect(jevLlamado).toBe(false);
    expect(juezLlamado).toBe(true);
    // El recibo registra que se usó un juez de chat y con qué modelo.
    expect(resultado.receipt?.outcome).toBe("approve");
    expect(resultado.report).toContain("modelo de chat con salida estructurada");
    expect(resultado.receipt?.model?.model).toBe("deepseek/deepseek-v4-flash");
  });

  it("el evaluador determinista sigue ganando aunque el routing diga otra cosa", async () => {
    writeRouting(
      lab,
      routingFromForm({
        preset: "balanced",
        roles: {
          "gate-evaluator": { model: "deepseek/deepseek-v4-flash", effort: "auto" },
        },
      }),
    );

    let jevLlamado = false;
    const espiaJev = (async () => {
      jevLlamado = true;
      throw new Error("no debería usarse un modelo");
    }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;

    // El evaluador se pide explícitamente determinista: la configuración no
    // puede saltarse la regla "lo decidible en código se decide en código".
    const resultado = await runTicketGate(PATHS(), TICKET, "plan", {
      evaluator: "command",
      jev: espiaJev,
    });
    expect(jevLlamado).toBe(false);
    expect(resultado.error).toContain("no se declaró ningún check");
  });
});

// ── API ─────────────────────────────────────────────────────────────────────

describe("la API de routing", () => {
  it("devuelve el estado, la adopción y el catálogo", async () => {
    // La caché del catálogo es del proceso y las pruebas lo comparten: sin
    // tirarla, el resultado dependería del orden de ejecución.
    resetCatalogCache();
    const respuesta = await handleApi("GET", "/api/routing", {}, context());
    expect(respuesta.status).toBe(200);
    const cuerpo = respuesta.body as {
      routing: { ok: boolean; preset: string; roles: unknown[] };
      adopted: boolean;
      catalog: { source: string; models: unknown[] };
    };
    expect(cuerpo.routing.ok).toBe(true);
    expect(cuerpo.adopted).toBe(false);
    expect(cuerpo.routing.roles).toHaveLength(ROLES.length);
    // Sin red, el catálogo viene de los presets y lo dice.
    expect(cuerpo.catalog.source).toBe("presets");
  });

  it("previsualiza el texto del formulario sin escribir", async () => {
    const respuesta = await handleApi(
      "POST",
      "/api/routing/preview",
      {
        preset: "economy",
        roles: { orchestrator: { model: "anthropic/claude-opus-4.6", effort: "high" } },
      },
      context(),
    );
    expect(respuesta.status).toBe(200);
    const cuerpo = respuesta.body as {
      text: string;
      routing: { preset: string; diff: { kind: string }[] };
    };
    expect(cuerpo.text).toContain("preset: economy");
    expect(cuerpo.routing.preset).toBe("economy");
    expect(cuerpo.routing.diff.some((linea) => linea.kind === "add")).toBe(true);
    expect(() => readFileSync(routingPath(lab), "utf8")).toThrow();
  });

  it("guarda el routing que manda el formulario", async () => {
    const respuesta = await handleApi(
      "PUT",
      "/api/routing",
      {
        preset: "quality",
        roles: { "gate-judge": { model: "anthropic/claude-opus-4.6", effort: "high" } },
      },
      context(),
    );
    expect(respuesta.status).toBe(200);
    const cuerpo = respuesta.body as { routing: { written: boolean; preset: string } };
    expect(cuerpo.routing.written).toBe(true);
    expect(readFileSync(routingPath(lab), "utf8")).toContain("preset: quality");
  });

  it("no guarda un routing inválido", async () => {
    const respuesta = await handleApi(
      "PUT",
      "/api/routing",
      { text: "preset: carisimo\n" },
      context(),
    );
    expect(respuesta.status).toBe(200);
    expect((respuesta.body as { routing: { written: boolean } }).routing.written).toBe(
      false,
    );
  });

  it("rechaza un formulario sin preset", async () => {
    expect((await handleApi("PUT", "/api/routing", { roles: {} }, context())).status).toBe(
      400,
    );
    expect((await handleApi("POST", "/api/routing/preview", {}, context())).status).toBe(
      400,
    );
  });

  it("rechaza un rol desconocido en el formulario en vez de ignorarlo", async () => {
    const respuesta = await handleApi(
      "PUT",
      "/api/routing",
      { preset: "balanced", roles: { orquestador: { model: "x" } } },
      context(),
    );
    // El rol desconocido se ignora al construir el texto —solo se escriben los
    // roles del contrato—, así que la respuesta es un texto sin ese rol.
    expect(respuesta.status).toBe(200);
    const escrito = readFileSync(routingPath(lab), "utf8");
    expect(escrito).not.toContain("orquestador");
  });
});

describe("el proveedor viaja con el modelo", () => {
  /**
   * Lo que hace posible elegir un modelo de otro proveedor desde la pantalla.
   *
   * Antes la lista que se ofrecía era la de OpenRouter y el proveedor no se
   * enviaba, así que un modelo de DeepSeek elegido en la interfaz se guardaba con
   * `provider: openrouter` y fallaba al usarse. El mismo identificador puede
   * existir en dos proveedores y no ser el mismo modelo, así que los dos van
   * juntos o no va ninguno.
   */
  it("guarda el proveedor y el modelo", () => {
    const texto = routingFromForm({
      preset: "balanced",
      roles: {
        orchestrator: { provider: "deepseek", model: "deepseek-v4-pro", effort: "high" },
      },
    });
    expect(texto).toContain("provider: deepseek");
    expect(texto).toContain("model: deepseek-v4-pro");
  });

  it("sin modelo no escribe nada, aunque haya proveedor", () => {
    // Aplicar el proveedor solo reusaría el modelo del preset con otro
    // proveedor, que es peor que no hacer nada: el registro afirmaría una
    // combinación que nadie eligió. La pantalla enseña la diferencia antes de
    // guardar, así que el usuario ve que no se aplicó.
    const texto = routingFromForm({
      preset: "balanced",
      roles: { orchestrator: { provider: "deepseek", model: "" } },
    });
    expect(texto).not.toContain("deepseek");
  });

  it("sin proveedor usa el de por defecto", () => {
    const texto = routingFromForm({
      preset: "balanced",
      roles: { orchestrator: { model: "anthropic/claude-opus-4.6" } },
    });
    expect(texto).toContain("provider: openrouter");
  });
});
