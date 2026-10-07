/**
 * El recibo guarda el motivo de cada respuesta del evaluador (R-CDEF-005).
 *
 * El juez de chat ya pedía un `reason` por proposición y lo descartaba al armar la
 * respuesta: un valor bajo en un recibo no decía por qué. Lo que se afirma acá:
 *
 * 1. El motivo del modelo llega a `modelAnswers`, para proposiciones booleanas y de
 *    elección.
 * 2. Cuando el evaluador no lo da, el campo es `null` —no falta—, para distinguir
 *    «no lo dio» de «se perdió».
 * 3. Un motivo largo se recorta: es texto del modelo.
 * 4. Guardar el motivo no cambia la decisión.
 */
import { describe, expect, it } from "vitest";

import { evaluateWithJudge, MOTIVO_MAX } from "../packages/gate-llm-judge/src/index.js";
import {
  DEFAULT_POLICY,
  buildReceipt,
  decide,
  type Proposition,
  type PropositionAnswer,
} from "../packages/gate/src/index.js";

const BOOLEANA: Proposition = {
  id: "p1",
  kind: "noul",
  instructions: "¿se cumple?",
  weight: 1,
};
const ELECCION: Proposition = {
  id: "p2",
  kind: "choice",
  instructions: "¿qué falta?",
  criteria: { completo: "nada", falta_alcance: "el alcance" },
  effects: {
    completo: { outcome: "approve" },
    falta_alcance: { outcome: "review" },
  },
};

function respuestaDelModelo(contenido: unknown): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({
        model: "proveedor/modelo-v1",
        choices: [{ message: { content: JSON.stringify(contenido) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as unknown as typeof fetch;
}

function reciboCon(answers: readonly PropositionAnswer[]) {
  const proposiciones = [BOOLEANA, ELECCION];
  return buildReceipt({
    id: "GR-20261006-X-analysis-1",
    gate: "analysis",
    propositions: proposiciones,
    policy: DEFAULT_POLICY,
    subject: { type: "ticket", id: "X", revision: "1" },
    decision: decide(proposiciones, answers, DEFAULT_POLICY),
    state: { ticket: "X" },
    answers,
    mechanicalChecks: [],
    decidedAt: "2026-10-06T10:00:00.000Z",
  });
}

describe("el motivo de cada respuesta", () => {
  it("llega a modelAnswers desde el juez de chat, en booleanas y en elecciones", async () => {
    const evaluacion = await evaluateWithJudge({
      propositions: [BOOLEANA, ELECCION],
      state: {},
      apiKey: "k",
      fetchImpl: respuestaDelModelo({
        p1: { holds: true, confidence: 0.95, reason: "el plan lo nombra" },
        p2: { choice: "completo", confidence: 0.9, reason: "cubre todo" },
      }),
    });
    const recibo = reciboCon(evaluacion.answers);

    expect(recibo.modelAnswers.map((a) => a.reason)).toEqual(["el plan lo nombra", "cubre todo"]);
  });

  it("queda en null cuando el evaluador no lo da, y no falta el campo", () => {
    const recibo = reciboCon([
      { id: "p1", kind: "noul", value: 0.97 },
      { id: "p2", kind: "choice", choice: "completo", confidence: 0.99, reason: null },
    ]);

    for (const respuesta of recibo.modelAnswers) {
      expect(Object.hasOwn(respuesta, "reason")).toBe(true);
      expect(respuesta.reason).toBeNull();
    }
  });

  it("un motivo ausente, vacío o que no es texto se guarda como null", async () => {
    const evaluacion = await evaluateWithJudge({
      propositions: [BOOLEANA, ELECCION],
      state: {},
      apiKey: "k",
      fetchImpl: respuestaDelModelo({
        p1: { holds: true, confidence: 0.95, reason: "   " },
        p2: { choice: "completo", confidence: 0.9, reason: 42 },
      }),
    });

    expect(evaluacion.answers.map((a) => a.reason)).toEqual([null, null]);
  });

  it("se recorta a 500 caracteres", async () => {
    const evaluacion = await evaluateWithJudge({
      propositions: [BOOLEANA],
      state: {},
      apiKey: "k",
      fetchImpl: respuestaDelModelo({
        p1: { holds: true, confidence: 0.95, reason: "x".repeat(2000) },
      }),
    });

    expect(MOTIVO_MAX).toBe(500);
    expect(evaluacion.answers[0]?.reason).toHaveLength(500);
  });

  it("guardar el motivo no cambia la decisión", () => {
    const sinMotivo: PropositionAnswer[] = [
      { id: "p1", kind: "noul", value: 0.97 },
      { id: "p2", kind: "choice", choice: "completo", confidence: 0.99 },
    ];
    const conMotivo = sinMotivo.map((a) => ({ ...a, reason: "porque sí" }));
    const proposiciones = [BOOLEANA, ELECCION];

    const a = decide(proposiciones, sinMotivo, DEFAULT_POLICY);
    const b = decide(proposiciones, conMotivo, DEFAULT_POLICY);
    expect(b.outcome).toBe(a.outcome);
    expect(b.reason).toBe(a.reason);
  });
});
