/**
 * El productor de la cascada agota la salida estructurada: se reintenta una vez con el escalado.
 *
 * Medido el 2026-10-09 (BUGFIX-GATE-CASCADA-SALIDA-ESTRUCTURADA-20261009): haiku como productor
 * agotaba los 5 intentos de `StructuredOutput` en una fracción de las tandas y la compuerta caía
 * a jev. Lo que se afirma, con jueces falsos y sin red:
 *
 * 1. Ante ese error, y solo ante ese, la producción se repite una vez con el modelo de escalado y
 *    la compuerta termina con `evaluator: cascade`.
 * 2. El recibo nombra al productor que falló, a quien produjo y conserva el error real.
 * 3. Si el reintento también falla, degrada a jev; AUTH no reintenta; un productor que responde
 *    no llama al escalado para producir.
 * 4. Un recibo escrito antes del cambio se sigue leyendo.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ChatError } from "../packages/credentials/src/chat.js";
import { type CascadeOptions } from "../packages/engine/src/evaluators.js";
import { runGate } from "../packages/engine/src/gate.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import type { Proposition, PropositionAnswer } from "../packages/gate/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";
const PRODUCTOR = "productor/uno";
const ESCALADO = "escalado/dos";
const ERROR_REAL =
  "Claude Code respondió un error: subtype error_max_structured_output_retries; " +
  "terminal_reason structured_output_retry_exhausted; código de salida 1.";

let labs: string[] = [];

function nuevoLab(): string {
  const lab = mkdtempSync(join(tmpdir(), "valmen-cascada-reintento-"));
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
  producer: { provider: "openrouter", model: PRODUCTOR, effort: "auto" },
  verifier: { provider: "openrouter", model: "typesafe/jev-1.13", effort: "auto" },
  escalation: { provider: "openrouter", model: ESCALADO, effort: "medium" },
  reason: null,
});

type Opciones = Parameters<typeof runGate>[1];
type Falla = { readonly codigo: string; readonly mensaje: string } | null;

function responder(propositions: readonly Proposition[]): PropositionAnswer[] {
  return propositions.map(
    (p): PropositionAnswer =>
      p.kind === "choice"
        ? { id: p.id, kind: "choice", choice: Object.keys(p.criteria)[0] as string, confidence: 0.95 }
        : { id: p.id, kind: p.kind, value: 0.95, confidence: 0.95 },
  );
}

/** Un juez falso que puede fallar por modelo, y cuenta cuántas veces se lo llamó a cada uno. */
function dobles(fallas: { productor?: Falla; escalado?: Falla }) {
  const cuenta = { productor: 0, escalado: 0, jev: 0 };
  const judge = (async (o: { propositions: readonly Proposition[]; model?: string }) => {
    const esProductor = o.model === PRODUCTOR;
    cuenta[esProductor ? "productor" : "escalado"] += 1;
    const falla = esProductor ? fallas.productor : fallas.escalado;
    if (falla) throw new ChatError(falla.mensaje, falla.codigo);
    return {
      answers: responder(o.propositions),
      model: { provider: "openrouter", model: o.model ?? "p", resolvedVersion: "v1" },
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      latencyMs: 1,
    };
  }) as unknown as NonNullable<Opciones["judge"]>;
  const jev = (async (o: { propositions: readonly Proposition[] }) => {
    cuenta.jev += 1;
    return {
      answers: responder(o.propositions),
      model: { provider: "openrouter", model: "jev", resolvedVersion: "jev-1" },
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      latencyMs: 1,
    };
  }) as unknown as NonNullable<Opciones["jev"]>;
  return { cuenta, judge, jev };
}

const INTERMITENTE: Falla = { codigo: "INVALID_REQUEST", mensaje: ERROR_REAL };

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

describe("el productor agota la salida estructurada: reintento único con el escalado", () => {
  it("C1. el escalado produce una vez tras el fallo del productor", async () => {
    const d = dobles({ productor: INTERMITENTE });
    await pedirCascada(nuevoLab(), d);
    expect(d.cuenta.productor).toBe(1);
    expect(d.cuenta.escalado).toBe(1);
  });

  it("C2. el reintento produce todas las proposiciones de la tanda", async () => {
    const { recibo, resultado } = await pedirCascada(
      nuevoLab(),
      dobles({ productor: INTERMITENTE }),
    );
    expect(resultado.exitCode, resultado.stderr).toBe(0);
    const ids = (recibo?.modelAnswers ?? []).map((a) => a.id);
    expect(ids).toContain("diagnostico_explica_el_sintoma");
    expect(ids).toContain("causa_especifica");
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(4);
  });

  it("C3. el recibo queda con evaluator cascade, sin degradación a jev", async () => {
    const d = dobles({ productor: INTERMITENTE });
    const { recibo } = await pedirCascada(nuevoLab(), d);
    expect(recibo?.evaluator).toBe("cascade");
    expect(recibo?.requestedEvaluator).toBeUndefined();
    expect(recibo?.evaluatorFailure).toBeUndefined();
    expect(d.cuenta.jev).toBe(1); // la verificación, no un respaldo
  });

  it("C4. el recibo nombra al productor que falló y al modelo que produjo en su lugar", async () => {
    const { recibo, resultado } = await pedirCascada(
      nuevoLab(),
      dobles({ productor: INTERMITENTE }),
    );
    expect(recibo?.producerRetries).toHaveLength(1);
    expect(recibo?.producerRetries?.[0]?.from).toEqual({ provider: "openrouter", model: PRODUCTOR });
    expect(recibo?.producerRetries?.[0]?.to).toEqual({ provider: "openrouter", model: ESCALADO });
    expect(resultado.stdout).toContain(`Productor ${PRODUCTOR} falló (INVALID_REQUEST)`);
    expect(resultado.stdout).toContain(`la tanda se repitió con ${ESCALADO}`);
  });

  it("C5. el recibo conserva el mensaje real del error del productor", async () => {
    const { recibo } = await pedirCascada(nuevoLab(), dobles({ productor: INTERMITENTE }));
    expect(recibo?.producerRetries?.[0]?.error.code).toBe("INVALID_REQUEST");
    expect(recibo?.producerRetries?.[0]?.error.message).toBe(ERROR_REAL);
  });

  it("C6. si el reintento también falla, degrada a jev con requestedEvaluator y evaluatorFailure", async () => {
    const d = dobles({
      productor: INTERMITENTE,
      escalado: { codigo: "INVALID_REQUEST", mensaje: ERROR_REAL },
    });
    const { recibo } = await pedirCascada(nuevoLab(), d);
    expect(d.cuenta.productor).toBe(1);
    expect(d.cuenta.escalado).toBe(1);
    expect(recibo?.evaluator).toBe("jev");
    expect(recibo?.requestedEvaluator).toBe("cascade");
    expect(recibo?.evaluatorFailure?.message).toContain("error_max_structured_output_retries");
    expect(recibo?.producerRetries).toBeUndefined();
  });

  it("C7. control: un fallo AUTH del productor no dispara el reintento", async () => {
    const d = dobles({ productor: { codigo: "AUTH", mensaje: "sesión vencida" } });
    const { recibo, resultado } = await pedirCascada(nuevoLab(), d);
    expect(d.cuenta.escalado).toBe(0);
    expect(d.cuenta.jev).toBe(0);
    expect(resultado.exitCode).not.toBe(0);
    expect(recibo).toBeUndefined();
  });

  it("C7b. control: un INVALID_REQUEST que no es de salida estructurada no se reintenta", async () => {
    const d = dobles({ productor: { codigo: "INVALID_REQUEST", mensaje: "modelo inexistente" } });
    const { recibo } = await pedirCascada(nuevoLab(), d);
    expect(d.cuenta.escalado).toBe(0);
    expect(recibo?.evaluator).toBe("jev");
    expect(recibo?.producerRetries).toBeUndefined();
  });

  it("C8. control: un productor que responde a la primera no llama al escalado para producir", async () => {
    const d = dobles({});
    const { recibo } = await pedirCascada(nuevoLab(), d);
    expect(d.cuenta.productor).toBe(1);
    expect(d.cuenta.escalado).toBe(0);
    expect(recibo?.evaluator).toBe("cascade");
    expect(recibo?.producerRetries).toBeUndefined();
  });

  it("C11. un recibo anterior al cambio, literal de .valmen/receipts, se lee sin error", () => {
    const aqui = dirname(fileURLToPath(import.meta.url));
    const origen = join(aqui, "..", ".valmen", "receipts", "AGENT-DOCS-GENERAR-MANUAL-MARKDOWN-20260926.jsonl");
    const lab = nuevoLab();
    const id = "AGENT-DOCS-GENERAR-MANUAL-MARKDOWN-20260926";
    mkdirSync(join(lab, ".valmen", "receipts"), { recursive: true });
    const primera = readFileSync(origen, "utf8").split("\n")[0] as string;
    writeFileSync(join(lab, ".valmen", "receipts", `${id}.jsonl`), `${primera}\n`);
    const recibos = readReceipts({ root: lab, ticketsDir: "tickets" }, id);
    expect(recibos).toHaveLength(1);
    expect(recibos[0]?.id).toBe("GR-20260929-analysis");
    expect(recibos[0]?.producerRetries).toBeUndefined();
  });
});
