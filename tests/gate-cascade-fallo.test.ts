/**
 * Un fallo de la cascada no es un fallo mudo: queda en el recibo y se degrada.
 *
 * Medido el 2026-10-09: la cascada con productor `claude-haiku-4-5-20251001` terminaba con
 * `error_max_structured_output_retries`, la compuerta imprimía «sin detalle», no escribía recibo
 * y el agente repetía la corrida a mano con otro evaluador sin dejar rastro. Lo que se afirma:
 *
 * 1. La cascada se llama una vez —el fallo es determinista, no se reintenta— y el evaluador por
 *    defecto responde en su lugar.
 * 2. El recibo declara el evaluador pedido y el error real, en campos que no entran en el hash
 *    del estado.
 * 3. Un fallo de credencial no se tapa con otro evaluador, y una cascada que responde no deja
 *    rastro de degradación.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ChatError } from "../packages/credentials/src/chat.js";
import { type CascadeOptions } from "../packages/engine/src/evaluators.js";
import { runGate } from "../packages/engine/src/gate.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import type { PropositionAnswer, Proposition } from "../packages/gate/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";
const ERROR_REAL =
  "Claude Code respondió un error: subtype error_max_structured_output_retries; " +
  "terminal_reason structured_output_retry_exhausted; código de salida 1.";

let labs: string[] = [];

function nuevoLab(): string {
  const lab = mkdtempSync(join(tmpdir(), "valmen-cascada-fallo-"));
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  mkdirSync(join(lab, "tickets"), { recursive: true });
  writeFixtureTicket(lab, { id: TICKET, workflowStatus: "analyzed" });
  labs.push(lab);
  return lab;
}

beforeEach(() => {
  labs = [];
});
afterEach(() => {
  for (const lab of labs) rmSync(lab, { recursive: true, force: true });
});

const cadena = (): CascadeOptions => ({
  producer: { provider: "openrouter", model: "productor/uno", effort: "auto" },
  verifier: { provider: "openrouter", model: "typesafe/jev-1.13", effort: "auto" },
  escalation: { provider: "openrouter", model: "escalado/dos", effort: "medium" },
  reason: null,
});

type Opciones = Parameters<typeof runGate>[1];

function responder(propositions: readonly Proposition[], valor: number): PropositionAnswer[] {
  return propositions.map(
    (p): PropositionAnswer =>
      p.kind === "choice"
        ? { id: p.id, kind: "choice", choice: Object.keys(p.criteria)[0] as string, confidence: valor }
        : { id: p.id, kind: p.kind, value: valor, confidence: valor },
  );
}

/** Un productor (juez) que falla con el error real, o responde; y un jev que cuenta. */
function dobles(productor: "falla" | "responde", codigo = "MALFORMED_RESPONSE") {
  const cuenta = { productor: 0, jev: 0 };
  const judge = (async (o: { propositions: readonly Proposition[]; model?: string }) => {
    cuenta.productor += 1;
    if (productor === "falla") throw new ChatError(ERROR_REAL, codigo as never);
    return {
      answers: responder(o.propositions, 0.95),
      model: { provider: "openrouter", model: o.model ?? "p", resolvedVersion: "v1" },
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      latencyMs: 1,
    };
  }) as unknown as NonNullable<Opciones["judge"]>;
  const jev = (async (o: { propositions: readonly Proposition[]; model?: string }) => {
    cuenta.jev += 1;
    return {
      answers: o.propositions.map(
        (p): PropositionAnswer =>
          p.kind === "choice"
            ? { id: p.id, kind: "choice", choice: Object.keys(p.criteria)[0] as string, confidence: 0.95 }
            : { id: p.id, kind: p.kind, value: 0.95, confidence: 0.95 },
      ),
      model: { provider: "openrouter", model: "jev", resolvedVersion: "jev-1" },
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      latencyMs: 1,
    };
  }) as unknown as NonNullable<Opciones["jev"]>;
  return { cuenta, judge, jev };
}

async function pedirCascada(lab: string, d: ReturnType<typeof dobles>) {
  const resultado = await runGate(
    { root: lab, ticketsDir: "tickets" },
    {
      gateId: "analysis",
      ticketId: TICKET,
      evaluator: "cascade",
      cascade: cadena(),
      judge: d.judge,
      jev: d.jev,
      now: () => new Date("2026-10-09T10:00:00.000Z"),
    },
  );
  const recibos = readReceipts({ root: lab, ticketsDir: "tickets" }, TICKET);
  return { resultado, recibo: recibos[recibos.length - 1] };
}

describe("la cascada falla: se degrada y el recibo lo cuenta", () => {
  it("C18. escribe un recibo con evaluator jev", async () => {
    const { resultado, recibo } = await pedirCascada(nuevoLab(), dobles("falla"));
    expect(resultado.exitCode, resultado.stderr).toBe(0);
    expect(recibo?.evaluator).toBe("jev");
  });

  it("C19. la cascada se llama exactamente una vez", async () => {
    const d = dobles("falla");
    await pedirCascada(nuevoLab(), d);
    expect(d.cuenta.productor).toBe(1);
  });

  it("C20. el evaluador por defecto se llama exactamente una vez", async () => {
    const d = dobles("falla");
    await pedirCascada(nuevoLab(), d);
    expect(d.cuenta.jev).toBe(1);
  });

  it("C21. el recibo declara requestedEvaluator cascade", async () => {
    const { recibo } = await pedirCascada(nuevoLab(), dobles("falla"));
    expect(recibo?.requestedEvaluator).toBe("cascade");
  });

  it("C22. evaluatorFailure.message contiene el error real", async () => {
    const { recibo, resultado } = await pedirCascada(nuevoLab(), dobles("falla"));
    expect(recibo?.evaluatorFailure?.message).toContain("error_max_structured_output_retries");
    expect(recibo?.evaluatorFailure?.code).toBe("MALFORMED_RESPONSE");
    expect(resultado.stdout).toContain("Evaluador pedido cascade · efectivo jev");
  });

  it("C23. control: un fallo AUTH no llama al evaluador por defecto", async () => {
    const d = dobles("falla", "AUTH");
    const { resultado, recibo } = await pedirCascada(nuevoLab(), d);
    expect(d.cuenta.jev).toBe(0);
    expect(resultado.exitCode).not.toBe(0);
    expect(recibo).toBeUndefined();
  });

  it("C24. control: una cascada que responde no deja requestedEvaluator ni evaluatorFailure", async () => {
    const { recibo } = await pedirCascada(nuevoLab(), dobles("responde"));
    expect(recibo?.evaluator).toBe("cascade");
    expect(recibo?.requestedEvaluator).toBeUndefined();
    expect(recibo?.evaluatorFailure).toBeUndefined();
  });

  it("C25. el stateHash de un recibo degradado es igual al de la misma evaluación sin degradar", async () => {
    const degradado = await pedirCascada(nuevoLab(), dobles("falla"));
    const normal = await pedirCascada(nuevoLab(), dobles("responde"));
    expect(degradado.recibo?.stateHash).toBeDefined();
    expect(degradado.recibo?.stateHash).toBe(normal.recibo?.stateHash);
    expect(degradado.recibo?.gateHash).toBe(normal.recibo?.gateHash);
  });
});
