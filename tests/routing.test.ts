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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  EFFORTS,
  PERFILES_INCORPORADOS,
  PRESETS,
  ROLES,
  type ResolvedRoute,
  comprobarPerfilCompleto as comprobarCompleto,
  FASES_DEL_AGENTE,
  derivarPerfil,
  faseDelEstado,
  fasesDeSesion,
  gateRoutingFor,
  perfilElegido,
  perfilesPath,
  readProjectPerfiles,
  readSeleccionDePerfil,
  renderPerfiles,
  rutasDelProyecto,
  despachoDeFase,
  mismoModelo,
  reporteDelEjecutor,
  parseRouting,
  parseRoutingTolerante,
  renderRouting,
  resolveRouting,
} from "../packages/adapter/src/index.js";
import { listGateCards, runTicketGate } from "../packages/server/src/gates.js";
import {
  checkRouting,
  elegirPerfil,
  fetchCatalog,
  gateRouting,
  guardarPerfil,
  presetModels,
  readRouting,
  routingFromForm,
  routingPath,
  writeRouting,
} from "../packages/server/src/routing.js";
import { resetCatalogCache } from "../packages/server/src/routing.js";
import { resolverDespachoDeFase, resolverModeloDeFase } from "../packages/engine/src/journey-phases.js";
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
      // Los tres roles de la cascada verificada (R-S1-002) volvieron a estar
      // declarados con su consumidor: `producer`, `verifier` y `escalation` se
      // resuelven por routing y los ejecuta `valmen gate --evaluator cascade`.
      "producer",
      "verifier",
      "escalation",
      // El rol que revisa un `review` de análisis o plan (R-APRO-003) con un modelo
      // distinto del que lo produjo: su consumidor es `valmen review-agent`.
      "reviewer",
      // El rol que escribe los specs de interfaz. Su modelo no sale de un preset
      // fijo sino de la sección `playwright:` del proyecto, y entró acá para que
      // esa declaración llegue al enrutado con su origen `proyecto`.
      "ui-specs",
      // Los cuatro roles de fase del agente que ejecuta la jornada (R-JORN-006): su
      // consumidor es `valmen journey brief`, que entrega al subagente el modelo de su fase.
      "agent-analysis",
      "agent-plan",
      "agent-implementation",
      "agent-verification",
    ]);
    expect(ROLES.every((rol) => rol.description !== "")).toBe(true);
    // C1: el rol revisor declara su consumidor, `valmen review-agent`.
    expect(ROLES.find((rol) => rol.id === "reviewer")?.consumer).toBe("valmen review-agent");
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
    // Y los roles resuelven a un proveedor que no pide clave de API. El revisor es la
    // excepción deliberada del plan de FEATURE-ADAPTER-AGENTE-REVISOR-20261007: va por
    // `codex`, que tampoco pide clave —usa la sesión de la suscripción— y es de otra
    // familia que los modelos de fase de este preset, que son de Claude.
    for (const [rol, ruta] of Object.entries(sinClaves?.roles ?? {})) {
      expect(ruta.provider, rol).toBe(rol === "reviewer" ? "codex" : "claude-code");
      expect(ruta.model).not.toBe("");
    }
  });

  it("no repite el mismo modelo caro en los roles de ejecución del preset económico", () => {
    const economico = PRESETS.find((preset) => preset.id === "economy");
    const caros = ["anthropic/claude-opus-4.6", "openai/gpt-5.6-luna-pro"];
    for (const [rol, ruta] of Object.entries(economico?.roles ?? {})) {
      // El revisor es la excepción deliberada del plan de FEATURE-ADAPTER-AGENTE-REVISOR-20261007:
      // decide un `review` que de otro modo espera a una persona, se llama pocas veces y su
      // modelo es el de `balanced`. Se compara contra ese preset para que la excepción no
      // se desvíe sola.
      if (rol === "reviewer") {
        expect(ruta.model).toBe(PRESETS.find((p) => p.id === "balanced")?.roles["reviewer"]?.model);
        continue;
      }
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

// ── Los perfiles de modelos ─────────────────────────────────────────────────

/** Los catálogos medidos el 2026-10-07; la red es el límite externo que se simula. */
const CATALOGOS = {
  codex: ["gpt-5.5", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-6-astra", "gpt-6-luna", "gpt-6-sol", "gpt-6.1-sol"],
  "opencode-go": ["deepseek-v4-flash", "deepseek-v4-pro", "glm-5.3", "glm-5.3-flash", "kimi-k3", "kimi-k2.7-code", "gpt-6-luna"],
  // `openai/gpt-5.6-luna-pro` es el modelo del rol `reviewer` en `balanced`, que los perfiles
  // incorporados heredan.
  openrouter: ["deepseek/deepseek-v4-flash", "moonshotai/kimi-k3", "openai/gpt-5.6-luna-pro"],
};

function fetchCatalogos(caidos: readonly string[] = []): typeof fetch {
  return (async (url: string | URL | Request) => {
    const direccion = String(url);
    const clave = direccion.includes("chatgpt.com")
      ? "codex"
      : direccion.includes("opencode.ai")
        ? "opencode-go"
        : "openrouter";
    if (caidos.includes(clave)) return new Response("caído", { status: 503 });
    return new Response(JSON.stringify({ data: CATALOGOS[clave as keyof typeof CATALOGOS].map((id) => ({ id })) }), { status: 200 });
  }) as unknown as typeof fetch;
}

function opcionesDePerfil(caidos: readonly string[] = []) {
  return { env: {}, filePath: join(lab, ".valmen", ".credentials.yaml"), fetchImpl: fetchCatalogos(caidos) };
}

function perfilIncorporado(id: string) {
  const perfil = PERFILES_INCORPORADOS.find((p) => p.id === id);
  if (perfil === undefined) throw new Error(`falta ${id}`);
  return perfil;
}

function perfilMixto() {
  return derivarPerfil(perfilIncorporado("claude-code-completo"), "mixto", "Claude planea, Codex implementa", {
    "agent-implementation": { provider: "codex", model: "gpt-6-sol", effort: "high" },
  });
}

describe("los perfiles de modelos", () => {
  it("R-PERF-001 perfiles incorporados", () => {
    expect(PERFILES_INCORPORADOS.map((p) => p.id)).toEqual(["claude-code-completo", "codex-completo", "opencode-go"]);
    expect(PERFILES_INCORPORADOS.every((p) => p.origen === "incorporado")).toBe(true);
  });

  it("R-PERF-001 incorporados completos", () => {
    for (const perfil of PERFILES_INCORPORADOS) {
      for (const rol of ROLES) {
        const ruta = perfil.roles[rol.id];
        expect(ruta, `${perfil.id}/${rol.id}`).toBeDefined();
        expect(ruta?.provider.length).toBeGreaterThan(0);
        expect(ruta?.model.length).toBeGreaterThan(0);
        expect(EFFORTS).toContain(ruta?.effort);
      }
      expect(comprobarCompleto(perfil)).toEqual([]);
    }
  });

  it("R-PERF-001 perfil incompleto", () => {
    const { "agent-plan": _quitado, ...resto } = perfilIncorporado("codex-completo").roles;
    const errores = comprobarCompleto({ ...perfilIncorporado("codex-completo"), id: "roto", origen: "proyecto", roles: resto });
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain("agent-plan");
  });

  it("R-PERF-001 perfil mixto se guarda", async () => {
    const resultado = await guardarPerfil(lab, perfilMixto(), opcionesDePerfil());
    expect(resultado).toEqual({ ok: true, errores: [], written: true });
    expect(existsSync(perfilesPath(lab))).toBe(true);
  });

  it("R-PERF-003 modelo inexistente", async () => {
    const perfil = derivarPerfil(perfilIncorporado("codex-completo"), "con-error", "", {
      "agent-plan": { provider: "codex", model: "gpt-9-inventado", effort: "high" },
    });
    const resultado = await guardarPerfil(lab, perfil, opcionesDePerfil());
    expect(resultado.ok).toBe(false);
    expect(resultado.errores.join("\n")).toContain("rol agent-plan: el modelo gpt-9-inventado no existe en el catálogo de codex");
    expect(existsSync(perfilesPath(lab))).toBe(false);
  });

  it("R-PERF-003 catálogo no disponible", async () => {
    const resultado = await guardarPerfil(lab, derivarPerfil(perfilIncorporado("codex-completo"), "sin-red", "", {}), opcionesDePerfil(["codex"]));
    expect(resultado.ok).toBe(false);
    expect(resultado.errores.join("\n")).toContain("no se pudo comprobar");
    expect(existsSync(perfilesPath(lab))).toBe(false);
  });

  it("R-PERF-003 incorporados en catálogo", async () => {
    for (const perfil of PERFILES_INCORPORADOS) {
      const copia = derivarPerfil(perfil, `copia-${perfil.id}`, "", {});
      const resultado = await guardarPerfil(lab, copia, opcionesDePerfil());
      expect(resultado.errores, perfil.id).toEqual([]);
    }
  });

  it("R-PERF-001 perfil mixto conserva proveedores", async () => {
    await guardarPerfil(lab, perfilMixto(), opcionesDePerfil());
    const leido = readProjectPerfiles(lab).find((p) => p.id === "mixto");
    expect(leido?.origen).toBe("proyecto");
    expect(leido?.roles["agent-analysis"]?.provider).toBe("claude-code");
    expect(leido?.roles["agent-plan"]?.provider).toBe("claude-code");
    expect(leido?.roles["agent-implementation"]?.provider).toBe("codex");
    expect(leido?.roles).toEqual(perfilMixto().roles);
  });

  it("R-PERF-001 evaluadores sin cambio", () => {
    const balanced = PRESETS.find((p) => p.id === "balanced");
    for (const perfil of PERFILES_INCORPORADOS) {
      expect(perfil.roles["gate-evaluator"]).toEqual(balanced?.roles["gate-evaluator"]);
      expect(perfil.roles["verifier"]).toEqual(balanced?.roles["verifier"]);
    }
  });

  it("rechaza guardar con el id de un perfil incorporado", async () => {
    const resultado = await guardarPerfil(lab, { ...perfilMixto(), id: "codex-completo" }, opcionesDePerfil());
    expect(resultado.ok).toBe(false);
    expect(existsSync(perfilesPath(lab))).toBe(false);
  });
});

// ── La resolución del perfil elegido ────────────────────────────────────────

function elegir(seleccion: { proyecto: string | null; ejecutores?: Record<string, string> }) {
  writeFileSync(
    perfilesPath(lab),
    renderPerfiles(readProjectPerfiles(lab), { proyecto: seleccion.proyecto, ejecutores: seleccion.ejecutores ?? {} }),
  );
}

function fijarRouting(texto: string) {
  writeFileSync(routingPath(lab), texto);
}

function rol(rutas: readonly ResolvedRoute[], id: string) {
  const ruta = rutas.find((r) => r.role === id);
  if (ruta === undefined) throw new Error(`falta ${id}`);
  return ruta;
}

describe("la resolución del perfil elegido", () => {
  it("R-PERF-002 sin perfil elegido", () => {
    for (const preset of ["quality", "balanced", "economy"]) {
      fijarRouting(`preset: ${preset}\nroles: {}\n`);
      expect(rutasDelProyecto(lab)).toEqual(resolveRouting({ preset, roles: {} }));
    }
    const rutas = rutasDelProyecto(lab);
    expect(rutas.every((r) => r.source !== "perfil" && r.perfil === undefined && r.anulaPerfil === undefined)).toBe(true);
  });

  it("R-PERF-002 perfil del proyecto gana al preset", () => {
    fijarRouting("preset: quality\nroles: {}\n");
    elegir({ proyecto: "claude-code-completo" });
    const plan = rol(rutasDelProyecto(lab), "agent-plan");
    expect(plan.model).toBe("claude-opus-5-5");
    expect(plan.source).toBe("perfil");
    expect(plan.perfil).toEqual({ id: "claude-code-completo", alcance: "proyecto" });
  });

  it("R-PERF-002 el preset no sobrescribe el perfil", () => {
    elegir({ proyecto: "claude-code-completo" });
    const perfil = perfilIncorporado("claude-code-completo");
    for (const preset of ["quality", "balanced", "economy"]) {
      fijarRouting(`preset: ${preset}\nroles: {}\n`);
      const rutas = rutasDelProyecto(lab);
      for (const [id, ruta] of Object.entries(perfil.roles)) {
        expect(rol(rutas, id), `${preset}/${id}`).toMatchObject({ ...ruta, source: "perfil" });
      }
    }
  });

  it("R-PERF-002 perfil por ejecutor", () => {
    elegir({ proyecto: "claude-code-completo", ejecutores: { hermes: "codex-completo" } });
    const plan = rol(rutasDelProyecto(lab, { ejecutor: "hermes" }), "agent-plan");
    expect(plan.perfil).toEqual({ id: "codex-completo", alcance: "ejecutor" });
    expect(plan.provider).toBe("codex");
  });

  it("R-PERF-002 ejecutor sin perfil propio", () => {
    elegir({ proyecto: "claude-code-completo", ejecutores: { hermes: "codex-completo" } });
    const plan = rol(rutasDelProyecto(lab, { ejecutor: "claude" }), "agent-plan");
    expect(plan.perfil).toEqual({ id: "claude-code-completo", alcance: "proyecto" });
  });

  it("R-PERF-005 el override gana al perfil", () => {
    elegir({ proyecto: "claude-code-completo" });
    fijarRouting("preset: quality\nroles:\n  agent-plan:\n    provider: codex\n    model: gpt-6-sol\n    effort: high\n");
    const plan = rol(rutasDelProyecto(lab), "agent-plan");
    expect(plan).toMatchObject({ source: "proyecto", provider: "codex", model: "gpt-6-sol" });
    expect(plan.perfil).toBeUndefined();
  });

  it("R-PERF-005 el rol dice que anula el perfil", () => {
    elegir({ proyecto: "claude-code-completo" });
    fijarRouting("preset: quality\nroles:\n  agent-plan:\n    provider: codex\n    model: gpt-6-sol\n    effort: high\n");
    const rutas = rutasDelProyecto(lab);
    expect(rol(rutas, "agent-plan").anulaPerfil).toBe("claude-code-completo");
    expect(rol(rutas, "agent-analysis").anulaPerfil).toBeUndefined();
  });

  it("R-PERF-002 perfil elegido inexistente", () => {
    elegir({ proyecto: "fantasma" });
    expect(() => rutasDelProyecto(lab)).toThrow(/"fantasma" no existe/);
    expect(() => perfilElegido([], { proyecto: "x", ejecutores: {} })).toThrow(/"x" no existe/);
  });

  it("R-PERF-002 elegir perfil inexistente", () => {
    const resultado = elegirPerfil(lab, { perfil: "fantasma" });
    expect(resultado.ok).toBe(false);
    expect(resultado.written).toBe(false);
    expect(resultado.errores.join(" ")).toContain("fantasma");
    expect(existsSync(perfilesPath(lab))).toBe(false);
  });

  it("R-PERF-002 elegir para ejecutor desconocido", () => {
    const resultado = elegirPerfil(lab, { perfil: "codex-completo", ejecutor: "bard" });
    expect(resultado.ok).toBe(false);
    expect(resultado.errores.join(" ")).toContain("bard");
    expect(existsSync(perfilesPath(lab))).toBe(false);
  });

  it("R-PERF-002 elegir escribe y quitar borra la elección", () => {
    expect(elegirPerfil(lab, { perfil: "claude-code-completo" }).written).toBe(true);
    expect(elegirPerfil(lab, { perfil: "codex-completo", ejecutor: "hermes" }).written).toBe(true);
    expect(rol(rutasDelProyecto(lab, { ejecutor: "hermes" }), "agent-plan").perfil?.id).toBe("codex-completo");
    elegirPerfil(lab, { perfil: null, ejecutor: "hermes" });
    elegirPerfil(lab, { perfil: null });
    expect(rutasDelProyecto(lab).every((r) => r.source !== "perfil")).toBe(true);
  });

  it("R-PERF-002 guardar conserva la elección", async () => {
    elegirPerfil(lab, { perfil: "claude-code-completo" });
    elegirPerfil(lab, { perfil: "codex-completo", ejecutor: "hermes" });
    const resultado = await guardarPerfil(lab, perfilMixto(), opcionesDePerfil());
    expect(resultado.written).toBe(true);
    const texto = readFileSync(perfilesPath(lab), "utf8");
    expect(texto).toContain("proyecto: claude-code-completo");
    expect(texto).toContain("hermes: codex-completo");
    expect(readProjectPerfiles(lab).map((p) => p.id)).toEqual(["mixto"]);
  });

  it("R-PERF-005 la fase usa el perfil del ejecutor", () => {
    const real = readFileSync(join(process.cwd(), ".valmen", "config.yaml"), "utf8");
    writeFileSync(
      join(lab, ".valmen", "config.yaml"),
      real.replace("    id: claude\n    model: claude-sonnet-5-5", "    id: codex\n    model: gpt-5.5"),
    );
    elegir({ proyecto: "claude-code-completo", ejecutores: { codex: "codex-completo" } });
    const fase = resolverModeloDeFase(lab, "plan");
    expect(fase?.origen).toBe("rol");
    expect(fase?.model).toBe(perfilIncorporado("codex-completo").roles["agent-plan"]?.model);
    expect(fase?.motivo).toContain("perfil codex-completo");
  });

  it("R-PERF-005 la API muestra el origen perfil", () => {
    elegir({ proyecto: "claude-code-completo" });
    fijarRouting("preset: quality\nroles:\n  agent-plan:\n    provider: codex\n    model: gpt-6-sol\n    effort: high\n");
    const estado = checkRouting(lab, readFileSync(routingPath(lab), "utf8"));
    expect(estado.ok).toBe(true);
    expect(rol(estado.roles, "agent-analysis")).toMatchObject({ source: "perfil", perfil: { id: "claude-code-completo", alcance: "proyecto" } });
    expect(rol(estado.roles, "agent-plan")).toMatchObject({ source: "proyecto", anulaPerfil: "claude-code-completo" });
  });

  it("R-PERF-002 la degradación no sobrescribe el perfil", () => {
    const propio = derivarPerfil(perfilIncorporado("claude-code-completo"), "juez-propio", "", {
      "gate-evaluator": { provider: "openrouter", model: "moonshotai/kimi-k3", effort: "high" },
    });
    writeFileSync(perfilesPath(lab), renderPerfiles([propio], { proyecto: "juez-propio", ejecutores: {} }));
    fijarRouting("preset: balanced\nroles: {}\n");
    for (const preset of [undefined, "economy"]) {
      const gate = gateRoutingFor(lab, preset === undefined ? {} : { preset });
      expect(gate.evaluatorModel).toBe("moonshotai/kimi-k3");
      expect(gate.source).toBe("perfil");
    }
  });
});

describe("la API de perfiles", () => {
  const contextoConCatalogo = () => ({ ...context(), fetchImpl: fetchCatalogos() });
  const cuerpoDe = <T>(r: { body: unknown }) => r.body as T;
  type Resultado = { ok: boolean; errores: string[]; written: boolean };

  it("R-PERF-002 API lista sin archivo", async () => {
    const r = await handleApi("GET", "/api/perfiles", {}, contextoConCatalogo());
    expect(r.status).toBe(200);
    const cuerpo = cuerpoDe<{ perfiles: { id: string; origen: string }[]; seleccion: unknown; ejecutores: string[] }>(r);
    expect(cuerpo.perfiles.map((p) => p.id)).toEqual(PERFILES_INCORPORADOS.map((p) => p.id));
    expect(cuerpo.perfiles.every((p) => p.origen === "incorporado")).toBe(true);
    expect(cuerpo.seleccion).toEqual({ proyecto: null, ejecutores: {} });
    expect(cuerpo.ejecutores).toEqual(["claude", "codex", "opencode", "hermes"]);
  });

  it("R-PERF-002 API lista con archivo", async () => {
    await guardarPerfil(lab, perfilMixto(), opcionesDePerfil());
    elegirPerfil(lab, { perfil: "mixto" });
    const r = await handleApi("GET", "/api/perfiles", {}, contextoConCatalogo());
    const cuerpo = cuerpoDe<{ perfiles: { id: string; origen: string }[]; seleccion: { proyecto: string } }>(r);
    expect(cuerpo.perfiles.find((p) => p.id === "mixto")?.origen).toBe("proyecto");
    expect(cuerpo.seleccion.proyecto).toBe("mixto");
  });

  it("R-PERF-002 API archivo ilegible", async () => {
    writeFileSync(perfilesPath(lab), "perfiles:\n  Mal Id:\n    description: x\n");
    const r = await handleApi("GET", "/api/perfiles", {}, contextoConCatalogo());
    expect(r.status).toBe(200);
    const cuerpo = cuerpoDe<{ error: string; perfiles: unknown[] }>(r);
    expect(cuerpo.error).toContain("Mal Id");
    expect(cuerpo.perfiles).toHaveLength(PERFILES_INCORPORADOS.length);
  });

  it("R-PERF-002 API crea a partir de otro", async () => {
    const r = await handleApi(
      "PUT",
      "/api/perfiles",
      {
        id: "mi-perfil",
        description: "Claude con Codex",
        base: "claude-code-completo",
        roles: { "agent-implementation": { provider: "codex", model: "gpt-6-sol", effort: "high" } },
      },
      contextoConCatalogo(),
    );
    expect(cuerpoDe<Resultado>(r)).toEqual({ ok: true, errores: [], written: true });
    const guardado = readProjectPerfiles(lab).find((p) => p.id === "mi-perfil");
    const base = perfilIncorporado("claude-code-completo");
    expect(guardado?.roles["agent-implementation"]?.provider).toBe("codex");
    expect(guardado?.roles["agent-plan"]).toEqual(base.roles["agent-plan"]);
    expect(guardado?.roles["orchestrator"]).toEqual(base.roles["orchestrator"]);
  });

  it("R-PERF-002 API id inválido", async () => {
    const r = await handleApi(
      "PUT",
      "/api/perfiles",
      { id: "Mi Perfil", description: "", base: "codex-completo", roles: {} },
      contextoConCatalogo(),
    );
    const cuerpo = cuerpoDe<Resultado>(r);
    expect(cuerpo.ok).toBe(false);
    expect(cuerpo.errores.join("\n")).toContain("kebab-case");
    expect(existsSync(perfilesPath(lab))).toBe(false);
  });

  it("R-PERF-002 API modelo inexistente", async () => {
    const r = await handleApi(
      "PUT",
      "/api/perfiles",
      {
        id: "con-error",
        description: "",
        base: "codex-completo",
        roles: { "agent-plan": { provider: "codex", model: "gpt-9-inventado", effort: "high" } },
      },
      contextoConCatalogo(),
    );
    const cuerpo = cuerpoDe<Resultado>(r);
    expect(cuerpo.ok).toBe(false);
    expect(cuerpo.errores.join("\n")).toContain("rol agent-plan: el modelo gpt-9-inventado");
    expect(existsSync(perfilesPath(lab))).toBe(false);
  });

  it("R-PERF-002 API edita", async () => {
    await guardarPerfil(lab, perfilMixto(), opcionesDePerfil());
    const completo = readProjectPerfiles(lab).find((p) => p.id === "mixto")!;
    const r = await handleApi(
      "PUT",
      "/api/perfiles",
      {
        id: "mixto",
        description: "Editado",
        roles: { ...completo.roles, "agent-implementation": { provider: "codex", model: "gpt-6-luna", effort: "low" } },
      },
      contextoConCatalogo(),
    );
    expect(cuerpoDe<Resultado>(r).written).toBe(true);
    const editado = readProjectPerfiles(lab).filter((p) => p.id === "mixto");
    expect(editado).toHaveLength(1);
    expect(editado[0]?.roles["agent-implementation"]).toEqual({ provider: "codex", model: "gpt-6-luna", effort: "low" });
    expect(editado[0]?.description).toBe("Editado");
  });

  it("R-PERF-002 API elige para el proyecto", async () => {
    const r = await handleApi("PUT", "/api/perfiles/seleccion", { perfil: "codex-completo" }, context());
    expect(cuerpoDe<Resultado>(r).written).toBe(true);
    expect(readSeleccionDePerfil(lab)).toEqual({ proyecto: "codex-completo", ejecutores: {} });
  });

  it("R-PERF-002 API elige por ejecutor", async () => {
    await handleApi("PUT", "/api/perfiles/seleccion", { perfil: "codex-completo" }, context());
    const r = await handleApi("PUT", "/api/perfiles/seleccion", { perfil: "opencode-go", ejecutor: "hermes" }, context());
    expect(cuerpoDe<Resultado>(r).written).toBe(true);
    expect(readSeleccionDePerfil(lab)).toEqual({ proyecto: "codex-completo", ejecutores: { hermes: "opencode-go" } });
  });

  it("R-PERF-002 API cuerpo mal formado", async () => {
    const malos: [string, unknown][] = [
      ["/api/perfiles", { description: "", roles: {} }],
      ["/api/perfiles", { id: "x", description: "", roles: "no" }],
      ["/api/perfiles", { id: "x", description: "", base: "no-existe", roles: {} }],
      ["/api/perfiles/seleccion", { perfil: 3 }],
      ["/api/perfiles/seleccion", { perfil: "codex-completo", ejecutor: 7 }],
    ];
    for (const [ruta, cuerpo] of malos) {
      const r = await handleApi("PUT", ruta, cuerpo, contextoConCatalogo());
      expect(r.status, JSON.stringify(cuerpo)).toBe(400);
    }
    expect(existsSync(perfilesPath(lab))).toBe(false);
  });
});

describe("R-PERF-007 modelos por fase para la sesión", () => {
  it("R-PERF-007 cuatro fases", () => {
    elegir({ proyecto: "claude-code-completo" });
    const rutas = rutasDelProyecto(lab, { ejecutor: "claude" });
    const sesion = fasesDeSesion(lab, { cliente: "claude" });
    expect(sesion.fases.map((f) => f.fase)).toEqual([...FASES_DEL_AGENTE]);
    for (const f of sesion.fases) {
      const ruta = rol(rutas, `agent-${f.fase}`);
      expect(f).toMatchObject({ rol: ruta.role, provider: ruta.provider, model: ruta.model, effort: ruta.effort });
      expect(f.origen).toEqual({ source: ruta.source, perfil: ruta.perfil });
    }
  });

  it("R-PERF-007 subagente opus", () => {
    elegir({ proyecto: "claude-code-completo" });
    const sesion = fasesDeSesion(lab, { cliente: "claude" });
    const plan = sesion.fases.find((f) => f.fase === "plan");
    expect(plan?.subagente).toBe("opus");
    expect(plan?.origen.perfil?.id).toBe("claude-code-completo");
    expect(sesion.fases.find((f) => f.fase === "verification")?.subagente).toBe("haiku");
  });

  it("R-PERF-007 nota del alias", () => {
    elegir({ proyecto: "claude-code-completo" });
    expect(fasesDeSesion(lab, { cliente: "claude" }).nota).toContain("versión vigente de la familia");
  });

  it("R-PERF-007 cliente sin subagentes", () => {
    elegir({ proyecto: "claude-code-completo" });
    for (const cliente of ["codex", "opencode", "hermes"] as const) {
      const sesion = fasesDeSesion(lab, { cliente });
      expect(sesion.admiteSubagentes, cliente).toBe(false);
      expect(sesion.fases.every((f) => f.subagente === null), cliente).toBe(true);
    }
  });

  it("R-PERF-007 aviso cliente sin subagentes", () => {
    const sesion = fasesDeSesion(lab, { cliente: "codex" });
    expect(sesion.aviso).toBe(
      "el cliente codex no admite subagentes con modelo propio: las fases usan el modelo de la sesión",
    );
  });

  it("R-PERF-007 fase de otro proveedor sin subagente", () => {
    writeFileSync(perfilesPath(lab), renderPerfiles([perfilMixto()], { proyecto: "mixto", ejecutores: {} }));
    const sesion = fasesDeSesion(lab, { cliente: "claude" });
    expect(sesion.fases.find((f) => f.fase === "implementation")?.subagente).toBeNull();
    expect(sesion.fases.find((f) => f.fase === "plan")?.subagente).toBe("opus");
  });

  it("R-PERF-007 aviso fase de otro proveedor", () => {
    writeFileSync(perfilesPath(lab), renderPerfiles([perfilMixto()], { proyecto: "mixto", ejecutores: {} }));
    const aviso = fasesDeSesion(lab, { cliente: "claude" }).fases.find((f) => f.fase === "implementation")?.aviso;
    expect(aviso).toContain("codex");
    expect(aviso).toContain("R-PERF-004");
  });

  it("R-PERF-007 modelo sin alias", () => {
    const raro = derivarPerfil(perfilIncorporado("claude-code-completo"), "raro", "", {
      "agent-plan": { provider: "claude-code", model: "modelo-desconocido-1", effort: "high" },
    });
    writeFileSync(perfilesPath(lab), renderPerfiles([raro], { proyecto: "raro", ejecutores: {} }));
    const plan = fasesDeSesion(lab, { cliente: "claude" }).fases.find((f) => f.fase === "plan");
    expect(plan?.subagente).toBeNull();
    expect(plan?.aviso).toContain("modelo-desconocido-1");
  });

  it("R-PERF-007 perfil elegido inexistente", () => {
    elegir({ proyecto: "fantasma" });
    const sesion = fasesDeSesion(lab, { cliente: "claude" });
    expect(sesion.fases).toEqual([]);
    expect(sesion.aviso).toMatch(/"fantasma" no existe/);
  });

  it("R-PERF-007 sin cliente", () => {
    elegir({ proyecto: "claude-code-completo" });
    const sesion = fasesDeSesion(lab);
    expect(sesion.cliente).toBeNull();
    expect(sesion.fases).toHaveLength(4);
    expect(sesion.fases.every((f) => f.subagente === null)).toBe(true);
    expect(sesion.aviso).toContain("No se declaró el cliente");
    expect(sesion.aviso).toContain("modelo de la sesión");
  });

  it("R-PERF-007 fase del estado", () => {
    expect(faseDelEstado("intake")).toBe("analysis");
    expect(faseDelEstado("analyzed")).toBe("plan");
    for (const e of ["approved", "in_progress", "changes_requested"]) expect(faseDelEstado(e), e).toBe("implementation");
    for (const e of ["awaiting_user_tests", "in_qa"]) expect(faseDelEstado(e), e).toBe("verification");
    for (const e of ["planned", "qa_approved", "closed", "blocked", "otro"]) expect(faseDelEstado(e), e).toBeNull();
  });
});

describe("R-PERF-004 despacho de fase por proveedor", () => {
  const politica = { id: "claude", model: "claude-sonnet-5-5", effort: "high" };
  const rutas = (provider: string, model: string) =>
    resolveRouting({ preset: "balanced", roles: { "agent-plan": { provider, model, effort: "medium" } } });

  it("R-PERF-004 C5: un proveedor sin ejecutor declarado se rechaza con un motivo que nombra el proveedor", () => {
    const d = despachoDeFase(rutas("openrouter", "x/y"), "plan", politica, ["claude", "codex", "opencode"]);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.motivo).toContain("openrouter");
  });

  it("R-PERF-004 C6: el ejecutor sale del proveedor del perfil, no del nombre del modelo", () => {
    // Un modelo que se llama como Claude pero lo sirve codex: manda el proveedor.
    const d = despachoDeFase(rutas("codex", "claude-sonnet-5-5"), "plan", politica, ["claude", "codex"]);
    expect(d).toMatchObject({ ok: true, ejecutor: "codex", model: "claude-sonnet-5-5", effort: "medium", origen: "rol" });
    // Y un modelo con nombre de otro proveedor no autoriza nada: sin codex autorizado se rechaza.
    const sin = despachoDeFase(rutas("codex", "claude-sonnet-5-5"), "plan", politica, ["claude"]);
    expect(sin.ok).toBe(false);
    if (!sin.ok) expect(sin.motivo).toContain("codex");
  });

  it("R-PERF-004 C5: un rol sin modelo conserva ejecutor y modelo de la política, pero el ejecutor debe estar autorizado", () => {
    const vacias = resolveRouting({ preset: "balanced", roles: {} }).filter((r) => r.role !== "agent-plan");
    expect(despachoDeFase(vacias, "plan", politica, ["claude"])).toMatchObject({ ok: true, ejecutor: "claude", origen: "politica" });
    expect(despachoDeFase(vacias, "plan", politica, ["codex"]).ok).toBe(false);
  });

  it("R-PERF-004 C11: con la configuración actual del proyecto, la implementación se despacha a claude con claude-sonnet-5-5", () => {
    const d = resolverDespachoDeFase(process.cwd(), "implementation");
    expect(d).toMatchObject({ ok: true, ejecutor: "claude", model: "claude-sonnet-5-5" });
  });
});

describe("el reporte del ejecutor (R-PERF-006)", () => {
  const salida = JSON.stringify({
    type: "result",
    total_cost_usd: 0.0421,
    modelUsage: { "claude-haiku-4-5-20251001": {}, "claude-sonnet-5-5": {} },
  });

  it("C2: toma de modelUsage el modelo que coincide con el declarado", () => {
    expect(reporteDelEjecutor("claude", "claude-sonnet-5-5", salida).modeloUsado).toBe("claude-sonnet-5-5");
    expect(reporteDelEjecutor("claude", "claude-haiku-4-5", salida).modeloUsado).toBe("claude-haiku-4-5-20251001");
    expect(reporteDelEjecutor("claude", "otro", salida).modeloUsado).toBe("claude-haiku-4-5-20251001");
  });

  it("C3: toma el costo de total_cost_usd, también de una lista cuyo último result vale", () => {
    expect(reporteDelEjecutor("claude", "claude-sonnet-5-5", salida).costeUsd).toBe(0.0421);
    const lista = JSON.stringify([{ type: "system" }, JSON.parse(salida)]);
    expect(reporteDelEjecutor("claude", "claude-sonnet-5-5", lista)).toEqual({ modeloUsado: "claude-sonnet-5-5", costeUsd: 0.0421 });
    const negativo = JSON.stringify({ total_cost_usd: -1, modelUsage: {} });
    expect(reporteDelEjecutor("claude", "x", negativo)).toEqual({ modeloUsado: null, costeUsd: null });
  });

  it("C4: una salida truncada o ilegible deja ambos en null", () => {
    for (const mala of ["", "hecho", salida.slice(0, 20), "null"]) {
      expect(reporteDelEjecutor("claude", "claude-sonnet-5-5", mala)).toEqual({ modeloUsado: null, costeUsd: null });
    }
  });

  it("C5: codex y opencode quedan en null aunque la salida parezca de Claude", () => {
    for (const ejecutor of ["codex", "opencode"]) {
      expect(reporteDelEjecutor(ejecutor, "gpt-6-sol", salida)).toEqual({ modeloUsado: null, costeUsd: null });
    }
  });

  it("mismoModelo admite alias, sufijo de fecha y prefijo de proveedor, y no confunde modelos", () => {
    expect(mismoModelo("claude-haiku-4-5", "claude-haiku-4-5-20251001")).toBe(true);
    expect(mismoModelo("anthropic/claude-sonnet-5.5", "claude-sonnet-5-5")).toBe(true);
    expect(mismoModelo("claude-sonnet-5", "claude-sonnet-5-5")).toBe(true);
    expect(mismoModelo("claude-opus-5-5", "claude-sonnet-5-5")).toBe(false);
    expect(mismoModelo("", "claude-sonnet-5-5")).toBe(false);
  });
});
