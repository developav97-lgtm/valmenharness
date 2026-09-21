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

import { runGate, readReceipts } from "../packages/cli/src/gate.js";
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
): typeof import("../packages/gate-jev/src/index.js").evaluateWithJev {
  return (async () => {
    const answers = Object.entries(values).map(([id, value]) =>
      typeof value === "string"
        ? { id, kind: "choice" as const, choice: value, confidence: 0.95 }
        : { id, kind: "noul" as const, value },
    );
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

/** Las ocho proposiciones del gate de plan resueltas a un valor. */
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
      evaluate: evaluator(allPropositions(0.95)),
      dryRun: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("RESULTADO: APPROVE");
  });

  it("va a revisión cuando alguna queda en la banda media", async () => {
    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      evaluate: evaluator(allPropositions(0.95, "falta_evidencia")),
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
      evaluate: evaluator({
        ...allPropositions(0.95),
        cubre_todos_los_criterios: 0.04,
      }),
      dryRun: true,
    });
    expect(result.stdout).toContain("RESULTADO: BLOCK");
    expect(result.stdout).toContain("cubre_todos_los_criterios=0.04");
    expect(result.exitCode).not.toBe(0);
  });

  it("no aprueba aunque la media ponderada sea alta", async () => {
    // Una proposición con peso 3 en 0.04 hunde la media, pero el caso que
    // importa es el contrario: que una media alta no rescate un criterio
    // incumplido.
    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      evaluate: evaluator({
        ...allPropositions(1.0),
        rollback_suficiente: 0.0,
      }),
      dryRun: true,
    });
    expect(result.stdout).toContain("RESULTADO: BLOCK");
  });
});

describe("checks mecánicos", () => {
  it("se ejecutan e informan antes de la evaluación", async () => {
    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      evaluate: evaluator(allPropositions(0.95)),
      dryRun: true,
    });
    expect(result.stdout).toContain("Checks mecánicos");
    expect(result.stdout).toContain("criterios_presentes");
    expect(result.stdout).toContain("rollback_si_critico");
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
    const sinRollback = text.replace(
      /rollback|revertir/gi,
      "deshacer-sin-plan",
    );
    writeFileSync(ticketPath, sinRollback, "utf8");

    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      evaluate: espia,
      dryRun: true,
    });

    expect(llamado).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Checks mecánicos fallidos");
    expect(result.stderr).toContain("rollback_si_critico");
    expect(result.stderr).toContain("No se llamó al evaluador");
  });
});

describe("el recibo", () => {
  it("se anexa como JSONL y es auditable", async () => {
    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      evaluate: evaluator(allPropositions(0.95)),
      now: () => new Date("2026-09-21T15:04:22Z"),
    });
    expect(result.exitCode).toBe(0);

    const receipts = readReceipts(lab, TICKET);
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
      evaluate: evaluator(allPropositions(0.95)),
    });
    const receipt = readReceipts(lab, TICKET)[0];
    expect(receipt?.stateHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(receipt?.gateHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("registra la versión concreta del modelo y el coste medido", async () => {
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      evaluate: evaluator(allPropositions(0.95)),
    });
    const receipt = readReceipts(lab, TICKET)[0];
    // El alias no sirve: un cambio de resultados tiene que poder atribuirse al
    // modelo o al artefacto.
    expect(receipt?.model?.resolvedVersion).toBe("typesafe/jev-1.13-20260917");
    expect(receipt?.usage?.costUsd).toBe(0.000031542);
    expect(receipt?.latencyMs).toBe(777);
  });

  it("es append-only: dos evaluaciones dejan dos recibos", async () => {
    const evaluar = evaluator(allPropositions(0.95));
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      evaluate: evaluar,
    });
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      evaluate: evaluator(allPropositions(0.3)),
      receiptId: "GR-0002",
    });

    const receipts = readReceipts(lab, TICKET);
    expect(receipts).toHaveLength(2);
    expect(receipts[0]?.outcome).toBe("approve");
    expect(receipts[1]?.outcome).toBe("review");
  });

  it("marca el escalado a humano en revisión", async () => {
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      evaluate: evaluator(allPropositions(0.95, "falta_evidencia")),
    });
    const receipt = readReceipts(lab, TICKET)[0];
    expect(receipt?.escalatedTo).toBe("human");
    expect(receipt?.humanDecision).toBeNull();
  });

  it("con --dry-run no escribe nada", async () => {
    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      evaluate: evaluator(allPropositions(0.95)),
      dryRun: true,
    });
    expect(existsSync(join(lab, ".valmen", "receipts"))).toBe(false);
    expect(readReceipts(lab, TICKET)).toEqual([]);
  });
});

describe("errores", () => {
  it("rechaza un gate desconocido sin llamar al evaluador", async () => {
    const result = await runGate(PATHS(), {
      gateId: "inventado",
      ticketId: TICKET,
      evaluate: evaluator(allPropositions(0.95)),
      dryRun: true,
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Gate desconocido");
  });

  it("rechaza un ticket inexistente", async () => {
    const result = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: "BUGFIX-POS-NO-EXISTE-20260101",
      evaluate: evaluator(allPropositions(0.95)),
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
      evaluate: falla,
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
      evaluate: espia,
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
      evaluate: evaluator(allPropositions(0.95)),
      dryRun: true,
    });
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("solo aplica a un ticket en `analyzed`");
  });
});
