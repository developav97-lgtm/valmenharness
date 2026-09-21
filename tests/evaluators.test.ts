/**
 * Los tres evaluadores y el orquestador que los elige.
 *
 * El `command` y el `llm-judge` se prueban con procesos y `fetch` inyectados, así
 * que la suite sigue sin necesitar red. Lo que verifican es el contrato de cada
 * evaluador y, sobre todo, que la selección automática respete el orden que
 * ahorra dinero: primero el código, después el modelo.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GateDefinition, Proposition } from "@valmen/gate";
import { PLAN_GATE } from "@valmen/gate";
import {
  type CommandCheck,
  CommandError,
  evaluateWithCommands,
  isFullyMechanical,
  runCommandCheck,
} from "../packages/gate-command/src/index.js";
import {
  confidenceToProbability,
  evaluateWithJudge,
} from "../packages/gate-llm-judge/src/index.js";
import {
  NoEvaluatorError,
  chooseEvaluator,
  evaluateGate,
  explainChoice,
} from "../packages/gate-run/src/evaluators.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-eval-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Un gate mínimo con una proposición booleana y una de elección. */
function gate(propositions: Proposition[]): GateDefinition {
  return {
    id: "prueba",
    title: "Gate de prueba",
    transition: "planned → approved",
    mode: "hybrid",
    appliesTo: ["planned"],
    propositions,
    policy: { approveAt: 0.9, blockAt: 0.1 },
    mechanicalChecks: [],
  };
}

const NOUL: Proposition = { id: "p1", kind: "noul", instructions: "se cumple" };
const ELECCION: Proposition = {
  id: "p2",
  kind: "choice",
  instructions: "¿qué falta?",
  criteria: { completo: "nada", falta: "algo" },
};

// ── Evaluador por comando ───────────────────────────────────────────────────

describe("evaluador por comando", () => {
  it("responde verdadero cuando el comando sale con el código esperado", () => {
    const resultado = runCommandCheck(
      {
        propositionId: "p1",
        command: "true",
        args: [],
        description: "siempre pasa",
      },
      { root: lab },
    );
    expect(resultado.passed).toBe(true);
    expect(resultado.exitCode).toBe(0);
    expect(resultado.expectedExitCode).toBe(0);
  });

  it("responde falso cuando el comando sale con otro código", () => {
    const resultado = runCommandCheck(
      {
        propositionId: "p1",
        command: "false",
        args: [],
        description: "siempre falla",
      },
      { root: lab },
    );
    expect(resultado.passed).toBe(false);
    expect(resultado.exitCode).toBe(1);
  });

  it("admite un código de salida esperado distinto de cero", () => {
    // Un check del tipo "el archivo NO existe" espera un código distinto de 0.
    // Declararlo es más honesto que envolver el comando en un shell con `!`.
    const resultado = runCommandCheck(
      {
        propositionId: "p1",
        command: "test",
        args: ["-f", "/ruta/que/no/existe"],
        description: "el archivo no existe",
        expectExitCode: 1,
      },
      { root: lab },
    );
    expect(resultado.passed).toBe(true);
  });

  it("captura la salida como evidencia", () => {
    const resultado = runCommandCheck(
      {
        propositionId: "p1",
        command: "echo",
        args: ["hola"],
        description: "imprime",
      },
      { root: lab },
    );
    expect(resultado.stdout.trim()).toBe("hola");
    expect(resultado.invocation).toBe("echo hola");
  });

  it("distingue un comando que no existe de un check que falla", () => {
    // Un comando mal escrito no debe contarse como una proposición falsa: es un
    // check que no se pudo ejecutar, y eso el motor tiene que saberlo.
    expect(() =>
      runCommandCheck(
        {
          propositionId: "p1",
          command: "comando-que-no-existe-xyz",
          args: [],
          description: "no existe",
        },
        { root: lab },
      ),
    ).toThrow(CommandError);
  });

  it("falla con un motivo claro si el comando supera el tiempo máximo", () => {
    const error = (() => {
      try {
        runCommandCheck(
          {
            propositionId: "p1",
            command: "sleep",
            args: ["5"],
            description: "duerme",
            timeoutMs: 200,
          },
          { root: lab },
        );
        return null;
      } catch (caught) {
        return caught as CommandError;
      }
    })();
    expect(error?.code).toBe("COMMAND_TIMEOUT");
  });

  it("traduce el resultado a los extremos del rango", () => {
    const { answers } = evaluateWithCommands(
      [NOUL],
      [{ propositionId: "p1", command: "true", args: [], description: "pasa" }],
      { root: lab },
    );
    // Un comando produce certeza, no probabilidad: 1 o 0, nunca banda media.
    expect(answers[0]?.value).toBe(1);
  });

  it("responde una elección con la opción declarada", () => {
    const { answers } = evaluateWithCommands(
      [ELECCION],
      [
        {
          propositionId: "p2",
          command: "true",
          args: [],
          description: "sin hallazgos",
          as: "choice",
          onSuccess: "completo",
          onFailure: "falta",
        },
      ],
      { root: lab },
    );
    expect(answers[0]?.kind).toBe("choice");
    expect(answers[0]?.choice).toBe("completo");
  });

  it("rechaza una elección sin opciones declaradas", () => {
    // Una elección no se puede responder con una probabilidad: sin opciones, el
    // check está mal escrito y hay que verlo.
    expect(() =>
      evaluateWithCommands(
        [ELECCION],
        [
          {
            propositionId: "p2",
            command: "true",
            args: [],
            description: "x",
            as: "choice",
          },
        ],
        { root: lab },
      ),
    ).toThrow("no declara");
  });

  it("rechaza un check que apunta a una proposición inexistente", () => {
    // Un check sobre una proposición que el gate no declara nunca correría, y
    // nadie lo notaría.
    expect(() =>
      evaluateWithCommands(
        [NOUL],
        [
          {
            propositionId: "fantasma",
            command: "true",
            args: [],
            description: "x",
          },
        ],
        { root: lab },
      ),
    ).toThrow("que el gate no declara");
  });

  it("informa los checks que no se pudieron ejecutar en vez de contarlos como falsos", () => {
    const { answers, failures } = evaluateWithCommands(
      [NOUL, { id: "p3", kind: "noul", instructions: "otra" }],
      [
        { propositionId: "p1", command: "true", args: [], description: "pasa" },
        {
          propositionId: "p3",
          command: "no-existe-xyz",
          args: [],
          description: "no corre",
        },
      ],
      { root: lab },
    );
    expect(answers).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.propositionId).toBe("p3");
  });

  it("detecta si un gate se puede resolver solo con comandos", () => {
    const completo: CommandCheck[] = [
      { propositionId: "p1", command: "true", args: [], description: "a" },
      { propositionId: "p2", command: "true", args: [], description: "b" },
    ];
    expect(isFullyMechanical([NOUL, ELECCION], completo)).toBe(true);
    expect(isFullyMechanical([NOUL, ELECCION], completo.slice(0, 1))).toBe(
      false,
    );
  });
});

// ── Evaluador con juez de chat ──────────────────────────────────────────────

/** Respuesta del endpoint de chat con el contenido indicado. */
function chatResponse(
  content: unknown,
  model = "proveedor/modelo-v1",
): Response {
  return new Response(
    JSON.stringify({
      model,
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 800, completion_tokens: 60, cost: 0.000875 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("evaluador con juez de chat", () => {
  it("mapea la confianza declarada a una probabilidad", () => {
    // Es el punto delicado del evaluador: el motor decide con umbrales sobre
    // probabilidad y aquí no hay probabilidad. Un modelo que responde "sí" con
    // confianza alta aprueba; con confianza baja cae en banda.
    expect(confidenceToProbability(true, 1)).toBeCloseTo(1, 5);
    expect(confidenceToProbability(true, 0.5)).toBeCloseTo(0.65, 5);
    expect(confidenceToProbability(false, 1)).toBeCloseTo(0, 5);
    expect(confidenceToProbability(false, 0)).toBeCloseTo(0.3, 5);
  });

  it("parsea una respuesta conforme al esquema", async () => {
    const fetchImpl = (async () =>
      chatResponse({
        p1: { holds: true, confidence: 0.95, reason: "el plan lo nombra" },
        p2: { choice: "completo", confidence: 0.9, reason: "cubre todo" },
      })) as unknown as typeof fetch;

    const resultado = await evaluateWithJudge({
      propositions: [NOUL, ELECCION],
      state: { plan: "…" },
      apiKey: "k",
      fetchImpl,
    });

    expect(resultado.answers).toHaveLength(2);
    expect(resultado.answers[0]?.value).toBeGreaterThan(0.9);
    expect(resultado.answers[1]?.kind).toBe("choice");
    expect(resultado.answers[1]?.choice).toBe("completo");
    expect(resultado.model.resolvedVersion).toBe("proveedor/modelo-v1");
    expect(resultado.usage.costUsd).toBe(0.000875);
  });

  it("rechaza una respuesta que no respeta el esquema", async () => {
    // Un juez que no respeta el formato no puede decidir un gate.
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          model: "m",
          choices: [{ message: { content: "Claro, el plan está muy bien." } }],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    await expect(
      evaluateWithJudge({
        propositions: [NOUL],
        state: {},
        apiKey: "k",
        fetchImpl,
      }),
    ).rejects.toThrow("no respetó el esquema");
  });

  it("rechaza una respuesta a la que le falta una proposición", async () => {
    const fetchImpl = (async () =>
      chatResponse({
        p1: { holds: true, confidence: 1, reason: "x" },
      })) as unknown as typeof fetch;

    await expect(
      evaluateWithJudge({
        propositions: [NOUL, ELECCION],
        state: {},
        apiKey: "k",
        fetchImpl,
      }),
    ).rejects.toThrow("no respondió correctamente");
  });

  it("clasifica un timeout como tal", async () => {
    const fetchImpl = (async () => {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "TimeoutError";
      throw error;
    }) as unknown as typeof fetch;

    const error = (await evaluateWithJudge({
      propositions: [NOUL],
      state: {},
      apiKey: "k",
      fetchImpl,
    }).catch((caught: unknown) => caught)) as { code?: string };
    expect(error.code).toBe("TIMEOUT");
  });

  it("nunca filtra la credencial en un error", async () => {
    const clave = "sk-or-v1-secreta-de-prueba-0123456789";
    const fetchImpl = (async () =>
      new Response("no autorizado", {
        status: 401,
      })) as unknown as typeof fetch;

    const error = (await evaluateWithJudge({
      propositions: [NOUL],
      state: {},
      apiKey: clave,
      fetchImpl,
    }).catch((caught: unknown) => caught)) as Error;
    expect(error.message).not.toContain(clave);
  });
});

// ── Selección del evaluador ─────────────────────────────────────────────────

describe("selección del evaluador", () => {
  it("elige el comando cuando cubre todas las proposiciones fijas", () => {
    // Lo decidible en código se decide en código: sin llamada, sin coste.
    const checks: CommandCheck[] = [
      { propositionId: "p1", command: "true", args: [], description: "a" },
      { propositionId: "p2", command: "true", args: [], description: "b" },
    ];
    expect(chooseEvaluator({ gate: gate([NOUL, ELECCION]), checks })).toBe(
      "command",
    );
  });

  it("elige Jev cuando hay proposiciones sin comando", () => {
    expect(chooseEvaluator({ gate: gate([NOUL, ELECCION]), checks: [] })).toBe(
      "jev",
    );
  });

  it("no deja que las proposiciones por criterio impidan elegir el comando", () => {
    // Las proposiciones por criterio se generan del sujeto, así que no pueden
    // tener un check estático: son distintas en cada ticket.
    const conCriterios = gate([
      { id: "criterio_01", kind: "noul", instructions: "x" },
      { id: "criterio_02", kind: "noul", instructions: "y" },
      NOUL,
    ]);
    const checks: CommandCheck[] = [
      { propositionId: "p1", command: "true", args: [], description: "a" },
    ];
    expect(chooseEvaluator({ gate: conCriterios, checks })).toBe("command");
  });

  it("falla si se pide el evaluador por comando sin ningún check", () => {
    expect(() =>
      chooseEvaluator({ gate: gate([NOUL]), checks: [], evaluator: "command" }),
    ).toThrow(NoEvaluatorError);
  });

  it("respeta el evaluador pedido explícitamente", () => {
    expect(
      chooseEvaluator({
        gate: gate([NOUL]),
        checks: [],
        evaluator: "llm-judge",
      }),
    ).toBe("llm-judge");
  });

  it("explica por qué eligió lo que eligió", () => {
    expect(explainChoice({ gate: gate([NOUL]), checks: [] })).toContain("jev");
    expect(
      explainChoice({
        gate: gate([NOUL]),
        checks: [
          { propositionId: "p1", command: "true", args: [], description: "a" },
        ],
      }),
    ).toContain("command");
    expect(
      explainChoice({ gate: gate([NOUL]), checks: [], evaluator: "llm-judge" }),
    ).toContain("menos");
  });
});

describe("orquestador", () => {
  it("no llama a ningún modelo si los comandos cubren el gate", async () => {
    const props: Proposition[] = [
      { id: "p1", kind: "noul", instructions: "x" },
    ];
    let llamado = false;
    const jevFalso = (async () => {
      llamado = true;
      throw new Error("no se debe llamar al modelo");
    }) as never;

    const resultado = await evaluateGate({
      gate: gate(props),
      state: {},
      root: lab,
      checks: [
        { propositionId: "p1", command: "true", args: [], description: "pasa" },
      ],
      evaluator: "command",
      jev: jevFalso,
    });

    expect(llamado).toBe(false);
    expect(resultado.evaluator).toBe("command");
    expect(resultado.usage?.costUsd).toBe(0);
    expect(resultado.model).toBeNull();
  });

  it("divide el trabajo: comandos para unas proposiciones y Jev para el resto", async () => {
    // Un gate mixto gasta una sola llamada, con las proposiciones que de verdad
    // necesitan juicio.
    const props: Proposition[] = [
      { id: "p1", kind: "noul", instructions: "mecánica" },
      { id: "p2", kind: "noul", instructions: "semántica" },
    ];
    let recibidas: string[] = [];
    const jevFalso = (async (o: {
      propositions: readonly { id: string }[];
    }) => {
      recibidas = o.propositions.map((p) => p.id);
      return {
        answers: [{ id: "p2", kind: "noul" as const, value: 0.95 }],
        model: { provider: "x", model: "m", resolvedVersion: "r" },
        usage: { inputTokens: 10, outputTokens: 2, costUsd: 0.0001 },
        latencyMs: 100,
      };
    }) as never;

    const resultado = await evaluateGate({
      gate: gate(props),
      state: {},
      root: lab,
      checks: [
        {
          propositionId: "p1",
          command: "true",
          args: [],
          description: "mecánica",
        },
      ],
      jev: jevFalso,
    });

    // Solo la proposición sin comando se envió al modelo.
    expect(recibidas).toEqual(["p2"]);
    expect(resultado.answers.map((a) => a.id).sort()).toEqual(["p1", "p2"]);
    expect(resultado.commandResults).toHaveLength(1);
  });

  it("degrada de Jev a juez solo cuando Jev no está disponible", async () => {
    const props: Proposition[] = [
      { id: "p1", kind: "noul", instructions: "x" },
    ];
    const jevCaido = (async () => {
      throw Object.assign(new Error("HTTP 503"), { code: "SERVER" });
    }) as never;
    const juezFalso = (async () => ({
      answers: [{ id: "p1", kind: "noul" as const, value: 0.5 }],
      model: { provider: "x", model: "juez", resolvedVersion: "j1" },
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0.001 },
      latencyMs: 500,
    })) as never;

    const resultado = await evaluateGate({
      gate: gate(props),
      state: {},
      root: lab,
      jev: jevCaido,
      judge: juezFalso,
    });
    expect(resultado.evaluator).toBe("llm-judge");
  });

  it("NO degrada si Jev falla por credencial: eso hay que verlo", async () => {
    // Degradar taparía un problema de configuración con un evaluador más débil.
    const props: Proposition[] = [
      { id: "p1", kind: "noul", instructions: "x" },
    ];
    const jevSinClave = (async () => {
      throw Object.assign(new Error("falta la clave"), {
        code: "CREDENTIAL_MISSING",
      });
    }) as never;

    await expect(
      evaluateGate({
        gate: gate(props),
        state: {},
        root: lab,
        jev: jevSinClave,
        judge: (async () => {
          throw new Error("no se debe llegar aquí");
        }) as never,
      }),
    ).rejects.toThrow("falta la clave");
  });

  it("falla si un check no se puede ejecutar en vez de contar la proposición como falsa", async () => {
    const props: Proposition[] = [
      { id: "p1", kind: "noul", instructions: "x" },
    ];
    await expect(
      evaluateGate({
        gate: gate(props),
        state: {},
        root: lab,
        checks: [
          {
            propositionId: "p1",
            command: "no-existe-xyz",
            args: [],
            description: "no corre",
          },
        ],
      }),
    ).rejects.toThrow("no se pudieron ejecutar");
  });
});

describe("el gate real de plan declara sus checks", () => {
  it("permite elegir el evaluador sin ambigüedad", () => {
    // El gate de plan no declara checks propios: sus proposiciones necesitan
    // juicio. La elección automática debe decir `jev`.
    expect(chooseEvaluator({ gate: PLAN_GATE, checks: [] })).toBe("jev");
  });

  it("informa que el evaluador por comando no puede resolverlo solo", () => {
    expect(isFullyMechanical(PLAN_GATE.propositions, [])).toBe(false);
  });
});

describe("el comando escribe y lee dentro de la raíz", () => {
  it("ejecuta con el directorio de trabajo indicado", () => {
    writeFileSync(join(lab, "marca.txt"), "hola", "utf8");
    const resultado = runCommandCheck(
      {
        propositionId: "p1",
        command: "cat",
        args: ["marca.txt"],
        description: "lee el archivo relativo a la raíz",
      },
      { root: lab },
    );
    expect(resultado.stdout.trim()).toBe("hola");
  });
});
