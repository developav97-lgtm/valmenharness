/**
 * El comando `gate` de punta a punta.
 *
 * El evaluador se inyecta, así que estos tests recorren el flujo completo
 * —leer el ticket, congelar el estado, evaluar, decidir, emitir el recibo— sin
 * red y sin clave. Lo que verifican es que la decisión no pueda aprobar por
 * accidente y que el recibo sea auditable.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runGate } from "../packages/engine/src/gate.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import type { JevEvaluation } from "../packages/gate-jev/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

// El gate de plan tiene precondición de estado y los 57 tickets reales están
// cerrados, así que el sujeto se construye: un ticket válido en `planned`.
const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-gate-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
  writeFixtureTicket(lab, { id: TICKET });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

/** Un evaluador simulado con las probabilidades que se le indiquen. */
function evaluator(
  values: Record<string, number | string>,
  /**
   * Valor para las proposiciones atómicas por criterio.
   *
   * Son las que emiten veredicto desde que las dimensiones fijas pasaron a ser
   * descriptivas, así que un test que quiera provocar una revisión o un bloqueo
   * debe apuntar aquí.
   */
  criteriaValue = 0.95,
): typeof import("../packages/gate-jev/src/index.js").evaluateWithJev {
  return (async (options: { propositions?: readonly { id: string }[] }) => {
    // El gate se expande con una proposición por criterio de aceptación, así que
    // el evaluador debe responderlas también. Se aceptan con el valor por
    // defecto salvo que el test pida otra cosa: el propósito de estos tests es
    // el flujo del comando, no la calibración.
    const extra = (options?.propositions ?? [])
      .map((proposition) => proposition.id)
      .filter((id) => !(id in values))
      .map((id) => ({ id, kind: "noul" as const, value: criteriaValue }));

    const answers = [
      ...Object.entries(values).map(([id, value]) =>
        typeof value === "string"
          ? { id, kind: "choice" as const, choice: value, confidence: 0.95 }
          : { id, kind: "noul" as const, value },
      ),
      ...extra,
    ];
    return {
      answers,
      model: {
        provider: "openrouter",
        model: "typesafe/jev-1.13",
        resolvedVersion: "typesafe/jev-1.13-20260917",
      },
      usage: { inputTokens: 751, outputTokens: 115, costUsd: 0.000031542 },
      latencyMs: 777,
    } as JevEvaluation;
  }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
}

/**
 * Las proposiciones **fijas** del gate de plan resueltas a un valor.
 *
 * Ojo: las proposiciones por criterio se generan aparte y son las que emiten
 * veredicto. Un test que quiera una aprobación debe darles un valor alto con el
 * segundo parámetro de `evaluator`.
 */
function allPropositions(
  value: number,
  clasificacion = "completo",
): Record<string, number | string> {
  return {
    cubre_todos_los_criterios: value,
    corresponde_a_la_investigacion: value,
    pasos_ejecutables: value,
    criterios_verificables: value,
    compatibilidad_hacia_atras: value,
    rollback_suficiente: value,
    clasificacion,
    hay_archivos_afectados: value,
  };
}

describe("los tres resultados", () => {
  it("aprueba cuando todas las proposiciones están claras", async () => {
    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95), 1.0),
      dryRun: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("RESULTADO: APPROVE");
  });

  it("va a revisión cuando alguna queda en la banda media", async () => {
    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95, "completo"), 0.5),
      dryRun: true,
    });
    expect(result.stdout).toContain("RESULTADO: REVIEW");
    expect(result.stdout).toContain("NO avanza");
    // Revisión no es aprobación: el código de salida no puede ser 0.
    expect(result.exitCode).not.toBe(0);
  });

  it("bloquea cuando una proposición está claramente incumplida", async () => {
    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      // Un criterio de aceptación claramente incumplido. Las dimensiones fijas
      // ya no votan: su veredicto lo dan las proposiciones atómicas.
      jev: evaluator(allPropositions(0.95), 0.03),
      dryRun: true,
    });
    expect(result.stdout).toContain("RESULTADO: BLOCK");
    expect(result.stdout).toContain("criterio_01=0.03");
    expect(result.exitCode).not.toBe(0);
  });

  it("un criterio incumplido bloquea, vía proposición atómica", async () => {
    // La expansión por criterio es lo que permite señalar *cuál* falta, en vez
    // de devolver un juicio compuesto ambiguo.
    // El evaluador debe respetar el tipo de cada proposición: una elección no se
    // responde con una probabilidad, y el motor rechaza la respuesta si no
    // coincide con lo declarado.
    const evaluador = (async (options: {
      propositions?: readonly { id: string; kind: string }[];
    }) => ({
      answers: (options?.propositions ?? []).map((proposition) =>
        proposition.kind === "choice"
          ? {
              id: proposition.id,
              kind: "choice" as const,
              choice: "completo",
              confidence: 0.95,
            }
          : proposition.id === "criterio_02"
            ? { id: proposition.id, kind: "noul" as const, value: 0.03 }
            : { id: proposition.id, kind: "noul" as const, value: 0.96 },
      ),
      model: { provider: "openrouter", model: "m", resolvedVersion: "r" },
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      latencyMs: 1,
    })) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;

    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluador,
      dryRun: true,
    });

    expect(result.stdout).toContain(
      "4 criterio(s) desplegados como proposiciones atómicas",
    );
    expect(result.stdout).toContain("RESULTADO: BLOCK");
    expect(result.stdout).toContain("criterio_02=0.03");
  });

  it("no aprueba aunque la media ponderada sea alta", async () => {
    // Tres criterios perfectos y uno incumplido. La media es alta —0.75 solo
    // contando los criterios— y el gate debe bloquear igual: promediar permite
    // que un criterio claramente incumplido quede compensado por otros que van
    // bien, y un gate no debe poder aprobar con un criterio en contra.
    const evaluador = (async (options: {
      propositions?: readonly { id: string; kind: string }[];
    }) => ({
      answers: (options?.propositions ?? []).map((proposition) =>
        proposition.kind === "choice"
          ? {
              id: proposition.id,
              kind: "choice" as const,
              choice: "completo",
              confidence: 0.95,
            }
          : {
              id: proposition.id,
              kind: "noul" as const,
              value: proposition.id === "criterio_04" ? 0.0 : 1.0,
            },
      ),
      model: { provider: "openrouter", model: "m", resolvedVersion: "r" },
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      latencyMs: 1,
    })) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;

    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluador,
      dryRun: true,
    });

    expect(result.stdout).toContain("RESULTADO: BLOCK");
    expect(result.stdout).toContain("criterio_04=0.00");
    // Los otros tres aprobaron, y aun así no alcanza.
    expect(result.stdout).toContain("criterio_01=1.00");
  });
});

describe("checks mecánicos", () => {
  it("se ejecutan e informan antes de la evaluación", async () => {
    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95), 1.0),
      dryRun: true,
    });
    expect(result.stdout).toContain("Checks mecánicos");
    expect(result.stdout).toContain("criterios_presentes");
    expect(result.stdout).toContain("rollback_si_critico");
  });

  it("la casilla vacía de la plantilla no cuenta como criterio", async () => {
    // El fallo real: la plantilla del ticket trae `- [ ]` listo para escribir, y
    // el check contaba como criterio cualquier línea que empezara por `- [`. Un
    // ticket con la sección sin rellenar pasaba con «1 criterio(s)», la compuerta
    // no tenía nada que evaluar y **aprobaba sin evaluar nada**. Ocurrió en el
    // segundo ticket real creado desde opencode: llegó a `analyzed` con el plan y
    // los criterios en blanco.
    writeFixtureTicket(lab, { id: TICKET, workflowStatus: "analyzed", criterios: "- [ ]" });

    const result = await runGate(PATHS(), {
      gateId: "analysis",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95), 1.0),
      dryRun: true,
    });

    // Falla antes de gastar nada: el hueco se ve en el código, no en un modelo.
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("criterios_presentes");
    expect(result.stderr).toContain("Checks mecánicos fallidos");
    expect(result.stderr).toContain("No se llamó al evaluador");
  });

  it("una casilla marcada pero vacía tampoco", async () => {
    writeFixtureTicket(lab, { id: TICKET, workflowStatus: "analyzed", criterios: "- [x]" });
    const result = await runGate(PATHS(), {
      gateId: "analysis",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95), 1.0),
      dryRun: true,
    });
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("Checks mecánicos fallidos");
  });

  it("no llama al evaluador si un check mecánico falla", async () => {
    // Un ticket de riesgo alto sin rollback: el check debe fallar y no se debe
    // gastar una llamada al modelo.
    writeFixtureTicket(lab, { id: TICKET, riskLevel: "high" });
    let llamado = false;
    const espia = (async () => {
      llamado = true;
      throw new Error("no debería haberse llamado");
    }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;

    // Se rompe el único check que puede fallar en este gate: un ticket de
    // riesgo alto sin rollback declarado.
    const ticketPath = join(lab, "tickets", "2026", TICKET, "ticket.md");
    const text = readFileSync(ticketPath, "utf8");
    // Se eliminan las dos palabras que el check reconoce como declaración de
    // rollback, para que el check falle de verdad.
    const sinRollback = text.replace(/rollback|revertir/gi, "deshacer-sin-plan");
    writeFileSync(ticketPath, sinRollback, "utf8");

    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: espia,
      dryRun: true,
    });

    expect(llamado).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Checks mecánicos fallidos");
    expect(result.stderr).toContain("rollback_si_critico");
    expect(result.stderr).toContain("No se llamó al evaluador");
  });
});

describe("un impacto declarado cambia lo que se pregunta", () => {
  it("un plan que ignora la migración no se aprueba, aunque cumpla los criterios", () => {
    // El caso que el harness no veía: el frontmatter dice que el cambio toca la
    // base de datos, el plan no dice cómo se revierte, y el gate aprobaba igual
    // porque la migración nunca llegaba a la pregunta. Se declara el impacto y el
    // evaluador puntúa esa proposición como lo que es —un hueco—.
    writeFixtureTicket(lab, {
      id: TICKET,
      impacts: ["migration_impact"],
      diagnostico: [
        "- Archivos y flujo investigados: `BackEnd/pos/filters.py`, que define el filtro.",
        "- Causa raíz o hipótesis: el lookup compara por igualdad exacta.",
        "- Riesgos y compatibilidad: la tabla cambia de forma.",
        "- Impactos de sync, migración, Docker o despliegue: hay migración de la tabla `orders`.",
      ].join("\n"),
    });

    return runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluator({ ...allPropositions(0.95), migration_impact: 0.05 }, 1.0),
      dryRun: true,
    }).then((result) => {
      // El resto del plan está impecable; lo único que falta es la migración.
      expect(result.stdout).toContain("migration_impact");
      expect(result.stdout).not.toContain("RESULTADO: APPROVE");
      expect(result.exitCode).toBe(3);
    });
  });

  it("el mismo plan con la migración resuelta sí se aprueba", () => {
    // El otro lado, que es lo que hace útil la pregunta: cuando el plan dice cómo
    // se revierte, el impacto declarado no bloquea nada.
    writeFixtureTicket(lab, {
      id: TICKET,
      impacts: ["migration_impact"],
      diagnostico: [
        "- Archivos y flujo investigados: `BackEnd/pos/filters.py`, que define el filtro.",
        "- Causa raíz o hipótesis: el lookup compara por igualdad exacta.",
        "- Riesgos y compatibilidad: la tabla cambia de forma.",
        "- Impactos de sync, migración, Docker o despliegue: hay migración de la tabla `orders`.",
      ].join("\n"),
      plan: [
        "- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).",
        "- Pasos ordenados:",
        "  1. Añadir la migración `0042_orders_lookup` y aplicarla antes del despliegue.",
        "  2. Cambiar en `BackEnd/pos/filters.py` el `lookup_expr` a `icontains`.",
        "- Rollback: revertir la migración con `0042_orders_lookup --reverse`.",
      ].join("\n"),
    });

    return runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95), 1.0),
      dryRun: true,
    }).then((result) => {
      expect(result.stdout).toContain("RESULTADO: APPROVE");
      expect(result.exitCode).toBe(0);
    });
  });

  it("un ticket sin impactos no arrastra la pregunta", () => {
    // La garantía simétrica: el que no declara impactos no recibe proposiciones de
    // impacto, así que esto no volvió más estricto a todo el registro.
    return runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95), 1.0),
      dryRun: true,
    }).then((result) => {
      expect(result.stdout).toContain("RESULTADO: APPROVE");
      expect(result.stdout).not.toContain("migration_impact");
    });
  });

  it("la compuerta no llega al evaluador si el diagnóstico contradice al frontmatter", async () => {
    // Un ticket que declara migración y dice «ninguno» en su diagnóstico no gasta
    // una llamada: el hueco se ve en el código.
    writeFixtureTicket(lab, {
      id: TICKET,
      workflowStatus: "analyzed",
      impacts: ["migration_impact"],
    });

    const result = await runGate(PATHS(), {
      gateId: "analysis",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95), 1.0),
      dryRun: true,
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("impactos_declarados");
    expect(result.stderr).toContain("No se llamó al evaluador");
  });
});

describe("el recibo", () => {
  it("se anexa como JSONL y es auditable", async () => {
    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95), 1.0),
      now: () => new Date("2026-09-21T15:04:22Z"),
    });
    expect(result.exitCode).toBe(0);

    const receipts = readReceipts(PATHS(), TICKET);
    expect(receipts).toHaveLength(1);

    const receipt = receipts[0];
    expect(receipt?.kind).toBe("gate-receipt");
    expect(receipt?.gate).toBe("plan");
    expect(receipt?.outcome).toBe("approve");
    expect(receipt?.subject.id).toBe(TICKET);
    expect(receipt?.decidedAt).toBe("2026-09-21T15:04:22.000Z");
  });

  it("congela el estado con su hash", async () => {
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95), 1.0),
    });
    const receipt = readReceipts(PATHS(), TICKET)[0];
    expect(receipt?.stateHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(receipt?.gateHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("registra la versión concreta del modelo y el coste medido", async () => {
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95), 1.0),
    });
    const receipt = readReceipts(PATHS(), TICKET)[0];
    // El alias no sirve: un cambio de resultados tiene que poder atribuirse al
    // modelo o al artefacto.
    expect(receipt?.model?.resolvedVersion).toBe("typesafe/jev-1.13-20260917");
    expect(receipt?.usage?.costUsd).toBe(0.000031542);
    expect(receipt?.latencyMs).toBe(777);
  });

  it("es append-only: dos evaluaciones dejan dos recibos", async () => {
    // Primera evaluación: criterios fuera de banda, así que aprueba.
    const evaluar = evaluator(allPropositions(0.95), 1.0);
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluar,
    });
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95), 0.5),
      receiptId: "GR-0002",
    });

    const receipts = readReceipts(PATHS(), TICKET);
    expect(receipts).toHaveLength(2);
    expect(receipts[0]?.outcome).toBe("approve");
    expect(receipts[1]?.outcome).toBe("review");
  });

  it("marca el escalado a humano en revisión", async () => {
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95, "completo"), 0.4),
    });
    const receipt = readReceipts(PATHS(), TICKET)[0];
    expect(receipt?.escalatedTo).toBe("human");
    expect(receipt?.humanDecision).toBeNull();
  });

  it("con --dry-run no escribe nada", async () => {
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95), 1.0),
      dryRun: true,
    });
    expect(existsSync(join(lab, ".valmen", "receipts"))).toBe(false);
    expect(readReceipts(PATHS(), TICKET)).toEqual([]);
  });
});

describe("errores", () => {
  it("rechaza un gate desconocido sin llamar al evaluador", async () => {
    const result = await runGate(PATHS(), {
      gateId: "inventado",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95), 1.0),
      dryRun: true,
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Gate desconocido");
  });

  it("rechaza un ticket inexistente", async () => {
    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: "BUGFIX-POS-NO-EXISTE-20260101",
      jev: evaluator(allPropositions(0.95), 1.0),
      dryRun: true,
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("no existe");
  });

  it("informa sin aprobar si el evaluador falla", async () => {
    const falla = (async () => {
      throw new Error("HTTP 503");
    }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;

    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: falla,
      dryRun: true,
    });
    // Fail-closed: un evaluador caído no puede producir una aprobación.
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).not.toContain("APPROVE");
    expect(result.stderr).toContain("no pudo completar");
  });
});

describe("precondición de estado", () => {
  it("rechaza evaluar un gate sobre un ticket que ya pasó la transición", async () => {
    // Se descubrió evaluando el gate de plan sobre un ticket cerrado y
    // publicado: el resultado fue un `review` con todo en banda media, que
    // parece una señal sobre el ticket cuando era una señal sobre el uso.
    // Un gate no debe dar una respuesta plausible a una pregunta que no aplica.
    writeFixtureTicket(lab, {
      id: "BUGFIX-POS-YA-CERRADO-20260921",
      workflowStatus: "closed",
      releaseStatus: "released",
      targetRelease: "1.42.0",
      releasedIn: "1.42.0",
    });

    let llamado = false;
    const espia = (async () => {
      llamado = true;
      throw new Error("no debería haberse llamado");
    }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;

    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: "BUGFIX-POS-YA-CERRADO-20260921",
      jev: espia,
      dryRun: true,
    });

    expect(llamado).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("solo aplica a un ticket en `planned`");
    expect(result.stderr).toContain("está en `closed`");
    expect(result.stderr).toContain("veredicto sin significado");
  });

  it("el gate de análisis solo aplica a un ticket en analyzed", async () => {
    const result = await runGate(PATHS(), {
      gateId: "analysis",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95), 1.0),
      dryRun: true,
    });
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("solo aplica a un ticket en `analyzed`");
  });
});

/**
 * Qué compuerta despliega los criterios de aceptación.
 *
 * La proposición por criterio pregunta «existe en `## Plan` al menos un paso que
 * satisface este criterio». Eso es exactamente lo que hay que preguntar en la
 * compuerta de plan, que evalúa el plan. En la de **análisis** es un sinsentido:
 * protege `analyzed → planned`, así que el plan es justo lo que ese estado
 * precede.
 *
 * Costó tres tickets reales creados desde opencode. En el tercero, un diagnóstico
 * que puntuaba 0,93-0,96 en todas sus dimensiones propias quedaba **bloqueado**
 * por cuatro criterios que puntuaban 0,03 —«ningún paso del plan lo satisface»,
 * literalmente cierto y completamente inútil—. El agente lo detectó, investigó el
 * motor y lo reportó con honestidad.
 */
describe("la expansión por criterios es de la compuerta, no una regla general", () => {
  it("el gate de análisis no despliega criterios y decide por el diagnóstico", async () => {
    writeFixtureTicket(lab, { id: TICKET, workflowStatus: "analyzed" });

    // `clasificacion` se llama distinto en cada gate: «completa» en el de
    // análisis, «completo» en el de plan. Darle la del plan hace fallar el
    // contrato del gate, y el fallo no dice que el problema sea el valor.
    const result = await runGate(PATHS(), {
      gateId: "analysis",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95, "completa"), 1.0),
      dryRun: true,
    });

    // El informe dice la verdad: no se desplegaron aquí.
    expect(result.stdout).not.toContain("criterio(s) desplegados");
    expect(result.stdout).toContain("no se despliegan en esta compuerta");
    // Y no aparece ninguna proposición por criterio.
    expect(result.stdout).not.toContain("criterio_01");
  });

  it("el gate de plan sí los despliega, porque evalúa el artefacto que debe cubrirlos", async () => {
    writeFixtureTicket(lab, { id: TICKET, workflowStatus: "planned" });

    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95), 1.0),
      dryRun: true,
    });

    expect(result.stdout).toContain("criterio(s) desplegados como proposiciones atómicas");
  });

  it("sin criterios declarados ninguna de las dos expande, y el check lo dice", async () => {
    // Un ticket sin criterios no se puede evaluar: el hueco lo ve el check
    // mecánico, que es determinista y no gasta una llamada.
    writeFixtureTicket(lab, { id: TICKET, workflowStatus: "analyzed", criterios: "- [ ]" });

    const result = await runGate(PATHS(), {
      gateId: "analysis",
      ticketId: TICKET,
      jev: evaluator(allPropositions(0.95, "completa"), 1.0),
      dryRun: true,
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("criterios_presentes");
  });
});

/**
 * Que el recibo no afirme más de lo que el gate decidió.
 *
 * Un gate expandido con los criterios del ticket conserva sus dimensiones fijas
 * como descriptivas. Eso es deliberado y está medido, pero el informe las pintaba
 * **igual que las que deciden**: con su valor y con `⚠` cuando caían en la banda
 * media, que es la marca de «esto pide tu revisión».
 *
 * Se leyó un `compatibilidad_hacia_atras` a 0.59 en un ticket de sincronización
 * como un problema de compatibilidad señalado por el gate. No lo era: esa
 * proposición no podía votar, y ninguna de las ocho fijas llegó a votar en los 63
 * tickets del registro. El dato que lo desmiente —`verdict`— estaba desde el
 * principio; lo que faltaba era contarlo.
 */
describe("la procedencia del veredicto", () => {
  const ID = "BUGFIX-POS-FILTRO-ORDENES-20260921";

  /** Un evaluador que aprueba todo, con la opción correcta según el gate. */
  const apruebaTodo = (async (options: { propositions?: readonly { id: string }[] }) => ({
    answers: (options.propositions ?? []).map((proposition) =>
      proposition.id === "clasificacion"
        ? {
            id: proposition.id,
            kind: "choice" as const,
            choice: "completo",
            rationale: "x",
          }
        : { id: proposition.id, kind: "noul" as const, value: 0.95, rationale: "x" },
    ),
    model: { provider: "falso", model: "prueba", resolvedVersion: "falso/prueba@0" },
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    latencyMs: 1,
  })) as never;

  it("el motivo dice cuántas decidieron y cuántas son contexto", async () => {
    writeFixtureTicket(lab, { id: ID, workflowStatus: "planned" });
    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: ID,
      jev: apruebaTodo,
      dryRun: true,
    });

    // El ticket del fixture declara cuatro criterios, y el gate de plan despliega
    // uno por criterio: esos cuatro son los que deciden. Las ocho dimensiones fijas
    // del gate son contexto.
    expect(result.stdout).toContain("decidieron 4 de 12 proposiciones");
    expect(result.stdout).toContain("8 son contexto y no emiten veredicto");
  });

  it("una descriptiva en la banda no se marca como una revisión pendiente", async () => {
    writeFixtureTicket(lab, { id: ID, workflowStatus: "planned" });
    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: ID,
      // Las fijas caen en la banda: sin el arreglo, saldrían con `⚠` y el informe
      // diría que el gate encontró algo que revisar.
      jev: evaluator(allPropositions(0.5), 0.95),
      dryRun: true,
    });

    const lineas = result.stdout.split("\n");
    const fija = lineas.find((linea) => linea.includes("compatibilidad_hacia_atras"));
    expect(fija).toBeDefined();
    expect(fija).toContain("descriptiva");
    expect(fija).not.toContain("⚠");

    // Y el informe avisa de que esas líneas no son señales del gate.
    expect(result.stdout).toContain("no emitieron veredicto");
  });
});
