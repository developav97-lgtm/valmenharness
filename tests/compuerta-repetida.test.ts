/**
 * Una compuerta no se vuelve a evaluar sobre el mismo estado (R-CDEF-008).
 *
 * Repetir lo mismo «a ver si sale otro número» cuesta una llamada por intento y
 * convierte el resultado en una ruleta. Lo que se afirma:
 *
 * 1. La repetición idéntica —mismo estado del ticket, mismo evaluador, con modelo— se
 *    rechaza **antes de llamar al modelo**, cita el recibo y no escribe nada.
 * 2. Cambiar el ticket o la configuración del evaluador es otra pregunta: se evalúa.
 * 3. Con un motivo explícito se puede forzar, y el motivo queda en el recibo nuevo.
 * 4. Lo que decide el código (la compuerta mecánica) y los recibos anteriores a este
 *    cambio no se bloquean.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runGate } from "../packages/engine/src/gate.js";
import { appendReceipt, readReceipts } from "../packages/engine/src/receipts.js";
import type { JevEvaluation } from "../packages/gate-jev/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";

let lab: string;
const PATHS = (): { root: string; ticketsDir: string } => ({ root: lab, ticketsDir: "tickets" });

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-repetida-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
  writeFixtureTicket(lab, { id: TICKET });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Un evaluador simulado que cuenta cuántas veces lo llaman. */
function evaluador(): {
  jev: typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
  llamadas: () => number;
} {
  let n = 0;
  const jev = (async (options: { propositions?: readonly { id: string }[] }) => {
    n += 1;
    const answers = (options?.propositions ?? []).map((p) =>
      p.id === "clasificacion"
        ? { id: p.id, kind: "choice" as const, choice: "completo", confidence: 0.95 }
        : { id: p.id, kind: "noul" as const, value: 0.95 },
    );
    return {
      answers,
      model: { provider: "openrouter", model: "jev", resolvedVersion: "jev-1" },
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      latencyMs: 1,
    } as JevEvaluation;
  }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
  return { jev, llamadas: () => n };
}

describe("la repetición idéntica", () => {
  it("se rechaza sin llamar al modelo, cita el recibo y no escribe recibo", async () => {
    const e = evaluador();
    const primera = await runGate(PATHS(), { gateId: "plan", ticketId: TICKET, jev: e.jev });
    expect(primera.exitCode).toBe(0);
    const [recibo] = readReceipts(PATHS(), TICKET);

    const segunda = await runGate(PATHS(), { gateId: "plan", ticketId: TICKET, jev: e.jev });

    expect(segunda.exitCode).toBe(3);
    expect(segunda.stderr).toContain(recibo?.id as string);
    expect(segunda.stderr).toContain("--force-reason");
    expect(e.llamadas()).toBe(1);
    expect(readReceipts(PATHS(), TICKET)).toHaveLength(1);
  });

  it("cambiar el ticket permite evaluar de nuevo", async () => {
    const e = evaluador();
    await runGate(PATHS(), { gateId: "plan", ticketId: TICKET, jev: e.jev });

    const ruta = join(lab, "tickets", "2026", TICKET, "ticket.md");
    writeFileSync(ruta, readFileSync(ruta, "utf8").replace("Rollback:", "Rollback (revisado):"), "utf8");

    const otra = await runGate(PATHS(), { gateId: "plan", ticketId: TICKET, jev: e.jev });
    expect(otra.exitCode).toBe(0);
    expect(e.llamadas()).toBe(2);
    expect(readReceipts(PATHS(), TICKET)).toHaveLength(2);
  });

  it("cambiar la configuración del evaluador permite evaluar de nuevo", async () => {
    const e = evaluador();
    await runGate(PATHS(), { gateId: "plan", ticketId: TICKET, jev: e.jev });

    const otra = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: e.jev,
      model: "otro/modelo",
    });
    expect(otra.exitCode).toBe(0);
    expect(e.llamadas()).toBe(2);
  });
});

describe("forzar la repetición", () => {
  it("con un motivo explícito evalúa y deja el motivo y el recibo repetido en el recibo nuevo", async () => {
    const e = evaluador();
    await runGate(PATHS(), { gateId: "plan", ticketId: TICKET, jev: e.jev });
    const [primero] = readReceipts(PATHS(), TICKET);

    const forzada = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      jev: e.jev,
      forceReason: "el proveedor devolvió un error de red en la primera corrida",
    });

    expect(forzada.exitCode).toBe(0);
    expect(forzada.stdout).toContain("Repetición forzada");
    expect(e.llamadas()).toBe(2);
    const recibos = readReceipts(PATHS(), TICKET);
    expect(recibos).toHaveLength(2);
    expect(recibos[1]?.forced).toEqual({
      reason: "el proveedor devolvió un error de red en la primera corrida",
      receiptId: primero?.id,
    });
    // El primero no se toca: el registro solo agrega.
    expect(recibos[0]?.forced).toBeUndefined();
  });

  it("un motivo vacío o de solo espacios no fuerza", async () => {
    const e = evaluador();
    await runGate(PATHS(), { gateId: "plan", ticketId: TICKET, jev: e.jev });

    const vacio = await runGate(PATHS(), { gateId: "plan", ticketId: TICKET, jev: e.jev, forceReason: "   " });

    expect(vacio.exitCode).toBe(3);
    expect(e.llamadas()).toBe(1);
  });
});

describe("lo que no se bloquea", () => {
  it("la compuerta mecánica, que decide el código, puede correrse otra vez sobre el mismo estado", async () => {
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(join(lab, ".valmen", "config.yaml"), "name: Lab\ntest-commands:\n  - node\n", "utf8");
    writeFixtureTicket(lab, {
      id: TICKET,
      workflowStatus: "in_progress",
      criterios: '- [ ] El comando de verificación del criterio sale con código cero.\n      <!-- test: node -e "process.exit(0)" -->',
    });

    const a = await runGate(PATHS(), { gateId: "qa-mechanical", ticketId: TICKET });
    const b = await runGate(PATHS(), { gateId: "qa-mechanical", ticketId: TICKET });

    expect(a.exitCode).toBe(0);
    expect(b.exitCode).toBe(0);
    expect(readReceipts(PATHS(), TICKET)).toHaveLength(2);
  });

  it("un recibo anterior sin huella de evaluador no bloquea una evaluación nueva", async () => {
    const e = evaluador();
    // Un recibo de antes de este cambio: sin evaluator ni evaluatorKey.
    await runGate(PATHS(), { gateId: "plan", ticketId: TICKET, jev: e.jev });
    const [recibo] = readReceipts(PATHS(), TICKET);
    const viejo = { ...recibo } as Record<string, unknown>;
    delete viejo["evaluator"];
    delete viejo["evaluatorKey"];
    rmSync(join(lab, ".valmen", "receipts"), { recursive: true, force: true });
    appendReceipt(PATHS(), TICKET, viejo as never);

    const otra = await runGate(PATHS(), { gateId: "plan", ticketId: TICKET, jev: e.jev });

    expect(otra.exitCode).toBe(0);
    expect(e.llamadas()).toBe(2);
  });
});
