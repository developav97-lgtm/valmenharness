/**
 * La cascada verificada, de punta a punta.
 *
 * El patrón que pide R-S1-002 tiene tres pasos y una condición: el modelo barato
 * produce, el verificador comprueba **cada respuesta contra el mismo contexto**, y
 * sólo lo que no queda respaldado se escala a un modelo superior —con el motivo
 * escrito en el recibo, que es lo que hace auditable el gasto—.
 *
 * Lo que estos tests protegen, en orden de importancia:
 *
 * 1. **No se escala lo que ya está respaldado.** Si la verificación pasa, el
 *    modelo caro no se llama: toda la reducción de costo del patrón depende de
 *    eso.
 * 2. **Se escala sólo lo no respaldado**, y lo responde el modelo del rol de
 *    escalado —no el productor otra vez—.
 * 3. **El motivo queda en el recibo**: las proposiciones escaladas, la
 *    probabilidad que emitió el verificador y el umbral. Sin eso el recibo dice
 *    que se pagó el modelo caro y no por qué.
 *
 * Los dos evaluadores entran inyectados, así que ninguna prueba sale a la red.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type GateDefinition,
  type Proposition,
  type PropositionAnswer,
  type GateReceipt,
} from "../packages/gate/src/index.js";
import {
  type CascadeOptions,
  chooseEvaluator,
  evaluateGate,
} from "../packages/engine/src/evaluators.js";
import { runGate } from "../packages/engine/src/gate.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";

const PRODUCTOR = "deepseek/deepseek-v4-flash";
const ESCALADO = "moonshotai/kimi-k3";
const VERIFICADOR = "typesafe/jev-1.13";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-cascada-"));
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  mkdirSync(join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** La cadena, tal como la resolvería el routing. */
function cadena(): CascadeOptions {
  return {
    producer: { provider: "openrouter", model: PRODUCTOR, effort: "auto" },
    verifier: { provider: "openrouter", model: VERIFICADOR, effort: "auto" },
    escalation: { provider: "openrouter", model: ESCALADO, effort: "medium" },
    reason: null,
  };
}

/** Un gate mínimo: dos proposiciones booleanas y la política por defecto. */
function gateDePrueba(): GateDefinition {
  return {
    id: "prueba",
    title: "Gate de prueba",
    transition: "planned → approved",
    mode: "hybrid",
    appliesTo: ["planned"],
    policy: { approveAt: 0.9, blockAt: 0.1 },
    mechanicalChecks: [],
    propositions: [
      {
        id: "a",
        kind: "noul",
        description: "La primera proposición",
        instructions: "El estado cumple la primera proposición.",
      },
      {
        id: "b",
        kind: "noul",
        description: "La segunda proposición",
        instructions: "El estado cumple la segunda proposición.",
      },
    ],
  };
}

/**
 * Un juez de chat simulado.
 *
 * Responde por modelo, que es lo que permite distinguir al productor del
 * escalado dentro del mismo evaluador, y anota a quién se llamó: la prueba de que
 * **no** se escaló es que el modelo del escalado no aparece en el registro.
 */
function juezFalso(porModelo: Record<string, number>, llamadas: string[]) {
  return (async (options: {
    readonly propositions: readonly Proposition[];
    readonly model?: string;
  }) => {
    const modelo = options.model ?? "";
    llamadas.push(modelo);
    const valor = porModelo[modelo] ?? 0.95;
    return {
      // La respuesta se arma por tipo de proposición: el motor rechaza —con
      // razón— una respuesta cuyo tipo no coincide con el declarado, así que un
      // doble que conteste siempre un booleano no prueba nada de una elección.
      answers: options.propositions.map(
        (proposicion): PropositionAnswer =>
          proposicion.kind === "choice"
            ? {
                id: proposicion.id,
                kind: "choice",
                choice: Object.keys(proposicion.criteria)[0] as string,
                confidence: valor,
              }
            : {
                id: proposicion.id,
                kind: proposicion.kind,
                value: valor,
                confidence: valor,
              },
      ),
      model: { provider: "openrouter", model: modelo, resolvedVersion: `${modelo}-v1` },
      usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.0001 },
      latencyMs: 30,
    };
  }) as unknown as NonNullable<Parameters<typeof evaluateGate>[0]["judge"]>;
}

/** Un verificador simulado: responde con la probabilidad que el test declare. */
function verificadorFalso(porProposicion: Record<string, number>, vistas: string[][]) {
  return (async (options: {
    readonly propositions: readonly Proposition[];
    readonly model?: string;
  }) => {
    vistas.push(options.propositions.map((proposicion) => proposicion.id));
    return {
      answers: options.propositions.map(
        (proposicion): PropositionAnswer => ({
          id: proposicion.id,
          kind: "noul",
          value: porProposicion[proposicion.id] ?? 0.97,
        }),
      ),
      model: {
        provider: "openrouter",
        model: options.model ?? VERIFICADOR,
        resolvedVersion: "jev-1.13-20260917",
      },
      usage: { inputTokens: 300, outputTokens: 0, costUsd: 0.00001 },
      latencyMs: 700,
    };
  }) as unknown as NonNullable<Parameters<typeof evaluateGate>[0]["jev"]>;
}

describe("la cascada verificada", () => {
  it("responde todo con el productor cuando la verificación respalda", async () => {
    const llamadas: string[] = [];
    const vistas: string[][] = [];

    const resultado = await evaluateGate({
      gate: gateDePrueba(),
      state: { solicitud: "algo" },
      root: lab,
      evaluator: "cascade",
      cascade: cadena(),
      judge: juezFalso({ [PRODUCTOR]: 0.95, [ESCALADO]: 0.99 }, llamadas),
      jev: verificadorFalso({}, vistas),
    });

    expect(resultado.evaluator).toBe("cascade");
    expect(resultado.answers.map((respuesta) => respuesta.value)).toEqual([0.95, 0.95]);
    expect(resultado.escalations ?? []).toEqual([]);
    // El modelo caro no se llamó: es todo el punto del patrón.
    expect(llamadas).toEqual([PRODUCTOR]);
    // Y el verificador vio una proposición por respuesta producida.
    expect(vistas[0]).toEqual(["respaldada_a", "respaldada_b"]);
  });

  it("escala sólo lo que la verificación no respaldó y lo responde el escalado", async () => {
    const llamadas: string[] = [];
    const vistas: string[][] = [];

    const resultado = await evaluateGate({
      gate: gateDePrueba(),
      state: { solicitud: "algo" },
      root: lab,
      evaluator: "cascade",
      cascade: cadena(),
      judge: juezFalso({ [PRODUCTOR]: 0.95, [ESCALADO]: 0.99 }, llamadas),
      jev: verificadorFalso({ respaldada_b: 0.2 }, vistas),
    });

    // La respaldada queda como la respondió el productor; la otra, no.
    const porId = new Map(
      resultado.answers.map((respuesta) => [respuesta.id, respuesta.value ?? 0]),
    );
    expect(porId.get("a")).toBe(0.95);
    expect(porId.get("b")).toBe(0.99);
    // El escalado se llamó una sola vez, y sólo con la proposición dudosa.
    expect(llamadas).toEqual([PRODUCTOR, ESCALADO]);
    expect(resultado.escalations?.map((escalamiento) => escalamiento.proposition)).toEqual([
      "b",
    ]);
  });

  it("el escalamiento lleva su motivo, su probabilidad y su umbral", async () => {
    const resultado = await evaluateGate({
      gate: gateDePrueba(),
      state: { solicitud: "algo" },
      root: lab,
      evaluator: "cascade",
      cascade: cadena(),
      judge: juezFalso({ [PRODUCTOR]: 0.95, [ESCALADO]: 0.99 }, []),
      jev: verificadorFalso({ respaldada_b: 0.2 }, []),
    });

    const escalamiento = resultado.escalations?.[0];
    expect(escalamiento?.role).toBe("escalation");
    expect(escalamiento?.proposition).toBe("b");
    expect(escalamiento?.from.model).toBe(PRODUCTOR);
    expect(escalamiento?.to.model).toBe(ESCALADO);
    expect(escalamiento?.verified).toBeCloseTo(0.2);
    // El umbral es el del gate: la misma banda con la que decide si una respuesta
    // está clara.
    expect(escalamiento?.threshold).toBe(0.9);
    expect(escalamiento?.reason).toContain("verificado");
    expect(escalamiento?.reason).toContain("b");
  });

  it("el consumo del recibo suma los tres pasos", async () => {
    const resultado = await evaluateGate({
      gate: gateDePrueba(),
      state: { solicitud: "algo" },
      root: lab,
      evaluator: "cascade",
      cascade: cadena(),
      judge: juezFalso({ [PRODUCTOR]: 0.95, [ESCALADO]: 0.99 }, []),
      jev: verificadorFalso({ respaldada_b: 0.2 }, []),
    });

    // Dos llamadas al juez y una al verificador: el costo de la cascada tiene que
    // ser el de sus tres pasos, no el del último.
    expect(resultado.model?.model).toBe(ESCALADO);
    expect(resultado.usage?.costUsd).toBeCloseTo(0.0001 + 0.0001 + 0.00001, 6);
    expect(resultado.latencyMs).toBe(30 + 30 + 700);
  });
});

describe("el recibo del gate en cascada", () => {
  it("registra el escalamiento con su motivo", async () => {
    writeFixtureTicket(lab, { id: TICKET, workflowStatus: "analyzed" });

    const resultado = await runGate(
      { root: lab, ticketsDir: "tickets" },
      {
        gateId: "analysis",
        ticketId: TICKET,
        evaluator: "cascade",
        cascade: cadena(),
        // Sin `apiKey`: los dos evaluadores entran inyectados, así que la
        // credencial del motor no participa, y un literal con forma de clave en
        // una prueba es un falso positivo que el escáner de secretos marca en
        // cada corrida.
        judge: juezFalso({ [PRODUCTOR]: 0.95, [ESCALADO]: 0.99 }, []),
        jev: verificadorFalso({ respaldada_causa_especifica: 0.3 }, []),
        now: () => new Date("2026-09-27T10:00:00.000Z"),
        receiptId: "GR-20260927-analysis",
      },
    );

    expect(resultado.exitCode, resultado.stderr).toBe(0);

    const recibos = readFileSync(
      join(lab, ".valmen", "receipts", `${TICKET}.jsonl`),
      "utf8",
    )
      .split("\n")
      .filter((linea) => linea.trim() !== "")
      .map((linea) => JSON.parse(linea) as GateReceipt);
    const recibo = recibos[recibos.length - 1];
    const escalamiento = recibo?.escalations?.[0];
    expect(recibo?.escalations?.map((uno) => uno.proposition)).toEqual(["causa_especifica"]);
    expect(escalamiento?.verified).toBeCloseTo(0.3);
    expect(escalamiento?.threshold).toBe(0.9);
    expect(escalamiento?.reason).toContain("causa_especifica");
    // El informe dice lo mismo que el recibo: el escalamiento no puede quedar
    // sólo en el JSON.
    expect(resultado.stdout).toContain("Escalamiento");
  });
});

describe("la cascada que no se puede ejecutar", () => {
  it("no se elige sola: con el evaluador automático el gate sigue yendo a Jev", () => {
    // La cascada gasta tres llamadas donde los otros gastan una, así que entra
    // por nombre y no por capacidad: `auto` tiene que seguir eligiendo lo mismo
    // que antes, incluso en un proyecto que ya declaró los tres roles.
    expect(chooseEvaluator({ gate: gateDePrueba(), checks: [] })).toBe("jev");
  });

  it("se rechaza sin cadena y no llama a ningún modelo", async () => {
    // `auto` nunca elige la cascada —gasta tres llamadas donde los otros una—,
    // así que pedirla es explícito. Sin la cadena resuelta por el routing no hay
    // modelos que usar, y adivinarlos sería cobrar como cascada algo que no lo es.
    const llamadas: string[] = [];
    await expect(
      evaluateGate({
        gate: gateDePrueba(),
        state: { solicitud: "algo" },
        root: lab,
        evaluator: "cascade",
        judge: juezFalso({}, llamadas),
        jev: verificadorFalso({}, []),
      }),
    ).rejects.toThrow(/cascade/);
    expect(llamadas).toEqual([]);
  });

  it("se rechaza con el motivo que resolvió el routing, sin gastar la corrida", async () => {
    const llamadas: string[] = [];
    await expect(
      evaluateGate({
        gate: gateDePrueba(),
        state: { solicitud: "algo" },
        root: lab,
        evaluator: "cascade",
        cascade: {
          ...cadena(),
          reason: "el rol producer y el rol escalation son el mismo modelo",
        },
        judge: juezFalso({}, llamadas),
        jev: verificadorFalso({}, []),
      }),
    ).rejects.toThrow(/mismo modelo/);
    expect(llamadas).toEqual([]);
  });
});
