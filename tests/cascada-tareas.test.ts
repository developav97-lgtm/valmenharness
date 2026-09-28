/**
 * La cascada verificada como corrida: las dos tareas que R-S1-002 nombra.
 *
 * El patrón ya existía **dentro de una compuerta** —produce el modelo barato,
 * verifica el verificador, escala lo no respaldado— y lo que este ticket habilita
 * es correrlo fuera de ella, en las dos actividades que el requisito nombra: la
 * clasificación de un ticket y la exploración del registro.
 *
 * Lo que estas pruebas protegen, en orden de importancia:
 *
 * 1. **El código decide antes de gastar.** Un módulo que el registro no declara, o
 *    un ticket que no existe, se escalan aunque el verificador semántico los
 *    respalde —y esas proposiciones no se le mandan al verificador, que es lo que
 *    hace que la corrida sea más barata que la de la compuerta—.
 * 2. **No se escala lo que ya está respaldado.** Si la verificación pasa, el modelo
 *    caro no se llama: de eso depende toda la reducción de costo del patrón.
 * 3. **El motivo queda escrito**: la proposición, los dos modelos, el valor que dio
 *    la verificación y la frase que explica por qué se pagó el modelo superior.
 *
 * Los dos evaluadores entran inyectados, así que ninguna prueba sale a la red.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_SCHEMA } from "../packages/core/src/errors.js";
import type { Proposition, PropositionAnswer } from "../packages/gate/src/index.js";
import {
  CASCADE_TASK_IDS,
  type CascadeOptions,
  cascadeTask,
  renderCascadeTask,
  runCascadeTask,
  verifiedCascade,
} from "../packages/engine/src/cascade.js";
import { run } from "../packages/cli/src/main.js";
import { TOOLS, callTool } from "../packages/mcp/src/tools.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const PRODUCTOR = "deepseek/deepseek-v4-flash";
const ESCALADO = "moonshotai/kimi-k3";
const VERIFICADOR = "typesafe/jev-1.13";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-cascada-tarea-"));
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  mkdirSync(join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** La cadena, tal como la resolvería el routing del proyecto. */
function cadena(): CascadeOptions {
  return {
    producer: { provider: "openrouter", model: PRODUCTOR, effort: "auto" },
    verifier: { provider: "openrouter", model: VERIFICADOR, effort: "auto" },
    escalation: { provider: "openrouter", model: ESCALADO, effort: "medium" },
    reason: null,
  };
}

/** Un registro mínimo: un ticket de un módulo, para que la clasificación tenga
 * contra qué contrastar el módulo que proponga el productor. */
function registro(): void {
  writeFixtureTicket(lab, {
    id: "FEATURE-ENGINE-CASCADA-UNO-20260901",
    type: "FEATURE",
    module: "ENGINE",
    workflowStatus: "closed",
    qaStatus: "approved",
  });
}

/**
 * Un juez de chat simulado.
 *
 * Responde por modelo, que es lo que permite distinguir al productor del escalado
 * dentro de la misma corrida, y anota a quién se llamó: la prueba de que **no** se
 * escaló es que el modelo del escalado no aparece en el registro.
 */
function juezFalso(
  opciones: { readonly choices?: Record<string, string>; readonly llamadas: string[] },
) {
  return (async (o: { readonly propositions: readonly Proposition[]; readonly model?: string }) => {
    const modelo = o.model ?? "";
    opciones.llamadas.push(modelo);
    return {
      answers: o.propositions.map(
        (proposicion): PropositionAnswer =>
          proposicion.kind === "choice"
            ? {
                id: proposicion.id,
                kind: "choice",
                choice:
                  opciones.choices?.[proposicion.id] ??
                  (Object.keys(proposicion.criteria)[0] as string),
                confidence: 0.9,
              }
            : { id: proposicion.id, kind: proposicion.kind, value: 0.95, confidence: 0.9 },
      ),
      model: { provider: "openrouter", model: modelo, resolvedVersion: `${modelo}-v1` },
      usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.0001 },
      latencyMs: 30,
    };
  }) as unknown as NonNullable<Parameters<typeof runCascadeTask>[0]["judge"]>;
}

/** Un verificador simulado: respalda todo con la probabilidad que el test pida. */
function verificadorFalso(opciones: {
  readonly porProposicion?: Record<string, number>;
  readonly vistas: string[][];
}) {
  return (async (o: { readonly propositions: readonly Proposition[] }) => {
    opciones.vistas.push(o.propositions.map((proposicion) => proposicion.id));
    return {
      answers: o.propositions.map(
        (proposicion): PropositionAnswer => ({
          id: proposicion.id,
          kind: "noul",
          value: opciones.porProposicion?.[proposicion.id] ?? 0.97,
        }),
      ),
      model: { provider: "openrouter", model: VERIFICADOR, resolvedVersion: "jev-1.13-20260917" },
      usage: { inputTokens: 300, outputTokens: 0, costUsd: 0.00001 },
      latencyMs: 700,
    };
  }) as unknown as NonNullable<Parameters<typeof runCascadeTask>[0]["jev"]>;
}

/** Una corrida de clasificación, con los dos dobles inyectados. */
async function clasificar(opciones: {
  readonly choices?: Record<string, string>;
  readonly porProposicion?: Record<string, number>;
}) {
  registro();
  const llamadas: string[] = [];
  const vistas: string[][] = [];
  const resultado = await runCascadeTask({
    paths: { root: lab, ticketsDir: "tickets" },
    task: "clasificacion",
    entrada: { solicitud: "El reporte de consumos no suma las notas de crédito." },
    chain: cadena(),
    judge: juezFalso({
      ...(opciones.choices === undefined ? {} : { choices: opciones.choices }),
      llamadas,
    }),
    jev: verificadorFalso({
      ...(opciones.porProposicion === undefined
        ? {}
        : { porProposicion: opciones.porProposicion }),
      vistas,
    }),
    now: () => new Date("2026-09-27T20:00:00.000Z"),
  });
  return { resultado, llamadas, vistas };
}

describe("la corrida de una tarea", () => {
  it("responde con el productor y no llama al escalado cuando todo queda respaldado", async () => {
    const { resultado, llamadas } = await clasificar({});

    expect(resultado.task).toBe("clasificacion");
    expect(resultado.answers).toHaveLength(3);
    expect(resultado.escalations).toEqual([]);
    // El modelo caro no se llamó: es todo el punto del patrón.
    expect(llamadas).toEqual([PRODUCTOR]);
    // Y la respuesta queda atribuida al productor, que es el modelo que el routing
    // le asigna a ese rol.
    expect(resultado.model?.model).toBe(PRODUCTOR);
  });

  it("el código decide primero y no manda al verificador lo que ya decidió", async () => {
    const { vistas } = await clasificar({});
    const verificadas = vistas[0] ?? [];

    // El módulo lo decidió el código contra el registro; el tipo y el riesgo son
    // semánticos y sí van al verificador.
    expect(verificadas).not.toContain("respaldada_modulo");
    expect(verificadas).toContain("respaldada_tipo");
    expect(verificadas).toContain("respaldada_riesgo");
  });

  it("un módulo que el registro no declara se escala aunque el verificador lo respalde", async () => {
    const { resultado, llamadas } = await clasificar({
      choices: { modulo: "MODULO-QUE-NO-EXISTE" },
      porProposicion: { respaldada_tipo: 0.99, respaldada_riesgo: 0.99 },
    });

    const escalamiento = resultado.escalations.find(
      (uno) => uno.proposition === "modulo",
    );
    expect(escalamiento, "el módulo inventado tiene que escalarse").toBeDefined();
    expect(escalamiento?.verified).toBe(0);
    expect(escalamiento?.reason).toContain("MODULO-QUE-NO-EXISTE");
    expect(escalamiento?.reason).toContain("registro");
    // El módulo lo refutó el código, y aun así se vuelve a preguntar al superior:
    // el escalado es el que decide qué módulo se propone, no el productor.
    expect(llamadas).toEqual([PRODUCTOR, ESCALADO]);
    expect(resultado.verificaciones.get("modulo")?.por).toBe("codigo");
  });

  it("el escalamiento declara la proposición, los dos modelos, el valor y el motivo", async () => {
    const { resultado } = await clasificar({
      porProposicion: { respaldada_tipo: 0.2, respaldada_riesgo: 0.2 },
    });

    const escalamiento = resultado.escalations[0];
    expect(escalamiento?.role).toBe("escalation");
    expect(["tipo", "riesgo"]).toContain(escalamiento?.proposition);
    expect(escalamiento?.from.model).toBe(PRODUCTOR);
    expect(escalamiento?.to.model).toBe(ESCALADO);
    expect(escalamiento?.verified).toBeCloseTo(0.2);
    expect(escalamiento?.threshold).toBe(0.9);
    expect(escalamiento?.reason).toContain("verificado");
  });

  it("se rechaza sin la cadena resuelta y no llama a ningún modelo", async () => {
    const llamadas: string[] = [];
    await expect(
      runCascadeTask({
        paths: { root: lab, ticketsDir: "tickets" },
        task: "clasificacion",
        entrada: { solicitud: "algo" },
        chain: { ...cadena(), reason: "el rol producer y el rol escalation son el mismo modelo" },
        judge: juezFalso({ llamadas }),
        jev: verificadorFalso({ vistas: [] }),
      }),
    ).rejects.toThrow(/mismo modelo/);
    expect(llamadas).toEqual([]);
  });

  it("deja su archivo en .valmen/cascada con los escalamientos", async () => {
    const { resultado } = await clasificar({
      choices: { modulo: "MODULO-QUE-NO-EXISTE" },
      porProposicion: { respaldada_tipo: 0.2, respaldada_riesgo: 0.2 },
    });

    const archivos = readdirSync(join(lab, ".valmen", "cascada"));
    expect(archivos).toHaveLength(1);
    const recibo = JSON.parse(
      readFileSync(join(lab, ".valmen", "cascada", archivos[0] as string), "utf8"),
    ) as {
      task: string;
      escalations: readonly { proposition: string; reason: string }[];
    };
    expect(recibo.task).toBe("clasificacion");
    expect(recibo.escalations.map((uno) => uno.proposition)).toEqual([
      "tipo",
      "modulo",
      "riesgo",
    ]);
    expect(resultado.recibo).toBe(join(".valmen", "cascada", archivos[0] as string));
  });

  it("el informe que imprimen el comando y la herramienta sale con la propuesta, la verificación y los escalamientos", async () => {
    const { resultado } = await clasificar({
      choices: { modulo: "MODULO-QUE-NO-EXISTE" },
      porProposicion: { respaldada_tipo: 0.2, respaldada_riesgo: 0.2 },
    });

    const salida = renderCascadeTask(resultado);
    expect(salida).toContain("modulo");
    expect(salida).toContain("MODULO-QUE-NO-EXISTE");
    expect(salida).toContain("Escalamiento");
    expect(salida).toContain(ESCALADO);
    expect(salida).toContain(".valmen/cascada/");
  });
});

describe("la tarea de exploración", () => {
  it("escala el ticket que el registro no conoce y deja pasar el que sí declara", async () => {
    registro();
    writeFixtureTicket(lab, {
      id: "BUGFIX-POS-FILTRO-ORDENES-20260921",
      type: "BUGFIX",
      module: "POS",
      workflowStatus: "in_progress",
    });

    const llamadas: string[] = [];
    const resultado = await runCascadeTask({
      paths: { root: lab, ticketsDir: "tickets" },
      task: "exploracion",
      entrada: { pregunta: "¿por qué el filtro de órdenes no encuentra por número parcial?" },
      chain: cadena(),
      judge: juezFalso({
        choices: {
          ticket_relacionado: "BUGFIX-QUE-NO-EXISTE-20260101",
          modulo_afectado: "POS",
        },
        llamadas,
      }),
      jev: verificadorFalso({ vistas: [] }),
      now: () => new Date("2026-09-27T20:05:00.000Z"),
    });

    expect(resultado.answers).toHaveLength(3);
    expect(resultado.escalations.map((uno) => uno.proposition)).toEqual(["ticket_relacionado"]);
    expect(resultado.verificaciones.get("ticket_relacionado")?.respaldada).toBe(0);
    expect(resultado.verificaciones.get("modulo_afectado")?.respaldada).toBe(1);
  });
});

describe("la corrida compartida", () => {
  it("escala sólo lo que la verificación no respaldó, con el motivo del verificador", async () => {
    const llamadas: string[] = [];
    const corrida = await verifiedCascade({
      propositions: [
        {
          id: "a",
          kind: "noul",
          description: "La primera",
          instructions: "El estado cumple la primera.",
        },
        {
          id: "b",
          kind: "noul",
          description: "La segunda",
          instructions: "El estado cumple la segunda.",
        },
      ],
      state: { solicitud: "algo" },
      chain: cadena(),
      threshold: 0.9,
      judge: juezFalso({ llamadas }),
      jev: verificadorFalso({ porProposicion: { respaldada_b: 0.2 }, vistas: [] }),
    });

    expect(corrida.escalations.map((uno) => uno.proposition)).toEqual(["b"]);
    expect(llamadas).toEqual([PRODUCTOR, ESCALADO]);
    // El consumo es el de los tres pasos, no el del último.
    expect(corrida.usage.costUsd).toBeCloseTo(0.0001 + 0.0001 + 0.00001, 6);
  });
});

describe("los bordes de la corrida", () => {
  it("rechaza una tarea que no está declarada, nombrando las declaradas", async () => {
    // La lista de tareas vive en el motor y la usan el CLI y el MCP: el mensaje de
    // rechazo es la prueba de que este borde no tiene la suya escrita a mano, que
    // es como una tarea queda admitida por un camino y rechazada por el otro. El
    // rechazo ocurre antes de resolver rutas, cadena y credenciales, así que esta
    // prueba no toca el registro ni sale a la red.
    const escrituras: string[] = [];
    const escribir = (chunk: unknown): boolean => {
      escrituras.push(String(chunk));
      return true;
    };
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(escribir);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(escribir);
    let codigo = 0;
    try {
      codigo = await run(["cascada", "--tarea", "pepe"]);
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }

    expect(codigo).toBe(EXIT_SCHEMA);
    for (const tarea of CASCADE_TASK_IDS) {
      expect(escrituras.join("")).toContain(tarea);
    }
  });

  it("la herramienta del MCP corre la tarea y devuelve su recibo", async () => {
    // El esquema dice qué acepta; esta prueba dice que el camino que lo ejecuta
    // está conectado: la tarea entra por el argumento, la corrida sale con el
    // recibo que el motor escribió, y los evaluadores entran inyectados, así que
    // no sale a la red.
    registro();
    const llamadas: string[] = [];
    const resultado = await callTool(
      {
        paths: { root: lab, ticketsDir: "tickets" },
        judge: juezFalso({ llamadas }),
        jev: verificadorFalso({ vistas: [] }),
        now: () => new Date("2026-09-27T20:10:00.000Z"),
      },
      "cascada_verificada",
      { tarea: "clasificacion", solicitud: "El reporte de consumos no suma las notas de crédito." },
    );

    expect(resultado.isError).toBe(false);
    expect(resultado.text).toContain("clasificacion");
    expect(resultado.text).toContain("Recibo: .valmen/cascada/");
    expect(readdirSync(join(lab, ".valmen", "cascada"))).toHaveLength(1);
    expect(llamadas).toEqual([PRODUCTOR]);

    // Y una tarea sin su entrada se rechaza sin gastar ninguna llamada.
    const sinEntrada = await callTool(
      { paths: { root: lab, ticketsDir: "tickets" }, judge: juezFalso({ llamadas: [] }) },
      "cascada_verificada",
      { tarea: "exploracion" },
    );
    expect(sinEntrada.isError).toBe(true);
    expect(sinEntrada.text).toContain("pregunta");
  });

  it("la lista de tareas del motor es la que publica la herramienta del MCP", () => {
    const herramienta = TOOLS.find((tool) => tool.name === "cascada_verificada");
    expect(herramienta, "el MCP tiene que declarar la corrida").toBeDefined();

    const esquema = herramienta?.inputSchema as {
      properties?: { tarea?: { enum?: readonly string[] } };
    };
    expect(esquema.properties?.tarea?.enum).toEqual([...CASCADE_TASK_IDS]);
  });

  it("el estado de la exploración declara los módulos y los tickets del registro", () => {
    registro();
    const estado = cascadeTask("exploracion").estado(
      { root: lab, ticketsDir: "tickets" },
      { pregunta: "el reporte de consumos" },
    );
    expect(estado.modulos).toEqual(["ENGINE"]);
    expect(String(estado.pregunta)).toContain("consumos");

    const clasificacion = cascadeTask("clasificacion").estado(
      { root: lab, ticketsDir: "tickets" },
      { solicitud: "algo" },
    );
    expect(clasificacion.solicitud).toBe("algo");
    expect(clasificacion.modulos).toEqual(["ENGINE"]);
  });
});
