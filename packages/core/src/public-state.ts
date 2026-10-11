/**
 * El estado público del ticket (R-EPU-001): la proyección que lee el PO.
 *
 * Los estados del motor (`WORKFLOW_STATES`) no cambian: este módulo los agrupa en cuatro y,
 * cuando el ticket espera a una persona, dice por qué. Es una función pura: los dos hechos que
 * salen del registro (si el plan espera aprobación y si hay una compuerta escalada sin
 * decisión) llegan ya calculados, porque `@valmen/core` no toca el disco.
 */

/** Los cuatro estados públicos. */
type PublicState = "needs-decision" | "verifying" | "done" | "working";

/** Cómo se llama cada estado público ante el PO. */
const PUBLIC_STATE_LABELS: Readonly<Record<PublicState, string>> = {
  "needs-decision": "Necesita tu decisión",
  verifying: "Verificando",
  done: "Listo",
  working: "Trabajando",
};

/** Por qué un ticket necesita la decisión de una persona. */
type DecisionReason =
  "user-tests" | "blocked" | "changes-requested" | "plan-approval" | "escalated-gate";

export interface PublicStateInput {
  /** El estado del motor (`workflow_status`). */
  readonly state: string;
  /** El ticket está en `planned` y ninguna autorización vigente aprueba su plan. */
  readonly planWaitsForPerson: boolean;
  /** Alguna compuerta, en su último recibo, quedó escalada a una persona sin decisión. */
  readonly escalatedGatePending: boolean;
}

export interface PublicStateResult {
  readonly state: PublicState;
  readonly label: string;
  /** El motivo cuando el estado es «Necesita tu decisión»; `null` en los demás. */
  readonly reason: DecisionReason | null;
}

const MOTIVO_PROPIO: Readonly<Record<string, DecisionReason>> = {
  blocked: "blocked",
  changes_requested: "changes-requested",
  awaiting_user_tests: "user-tests",
};

function resultado(state: PublicState, reason: DecisionReason | null): PublicStateResult {
  return { state, label: PUBLIC_STATE_LABELS[state], reason };
}

/** Deriva el estado público de un ticket. */
export function estadoPublico(input: PublicStateInput): PublicStateResult {
  const { state } = input;
  const propio = MOTIVO_PROPIO[state];
  if (propio !== undefined) return resultado("needs-decision", propio);
  if (state === "planned" && input.planWaitsForPerson) {
    return resultado("needs-decision", "plan-approval");
  }
  const terminado = state === "qa_approved" || state === "closed";
  if (input.escalatedGatePending && !terminado) {
    return resultado("needs-decision", "escalated-gate");
  }
  if (state === "in_qa") return resultado("verifying", null);
  if (terminado) return resultado("done", null);
  return resultado("working", null);
}
