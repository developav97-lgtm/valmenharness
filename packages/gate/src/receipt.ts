/**
 * Recibos de gate.
 *
 * Un recibo es la diferencia entre "el agente revisó y aprobó" y una decisión
 * auditable. Guarda **qué vio el evaluador**, qué respondió y cuánto costó.
 *
 * El campo que más importa es `stateHash`. Congela el contexto exacto que se
 * envió al modelo, así que meses después se puede distinguir entre "el artefacto
 * cambió" y "el modelo cambió": se recalcula el hash del artefacto actual y se
 * compara. Sin él, un cambio de versión del evaluador es indistinguible de un
 * cambio en el ticket.
 *
 * Ver docs/03-GATES.md §7.
 */
import { createHash } from "node:crypto";

import { SCHEMA_VERSION } from "@valmen/core";

import type {
  GateDecision,
  GatePolicy,
  PropositionAnswer,
  Proposition,
} from "./decide.js";

/** Versión del formato del recibo. */
export const RECEIPT_VERSION = 1;

/** Un check mecánico y su resultado. */
export interface MechanicalCheck {
  readonly id: string;
  readonly description: string;
  readonly result: "pass" | "fail" | "warn" | "skip";
  readonly detail?: string;
}

/** Qué modelo evaluó, con su versión concreta resuelta. */
export interface ModelIdentity {
  readonly provider: string;
  readonly model: string;
  /**
   * La versión concreta que sirvió la petición.
   *
   * Un alias como `jev-latest` puede resolver a otra versión mañana. Guardar la
   * resolución real es lo que permite saber si un cambio de resultados se debe
   * al modelo o al artefacto.
   */
  readonly resolvedVersion: string;
}

/** Consumo de la evaluación. */
export interface EvaluationUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

/** El sujeto evaluado, con su revisión. */
export interface GateSubject {
  readonly type: "ticket" | "feature" | "release" | "process";
  readonly id: string;
  /**
   * Revisión del sujeto en el momento de evaluar.
   *
   * Sin este dato, una aprobación vieja podría confundirse con una aprobación
   * del artefacto actual.
   */
  readonly revision: string;
}

/** Un recibo de gate, append-only y completo. */
export interface GateReceipt {
  readonly kind: "gate-receipt";
  readonly receiptVersion: number;
  readonly schemaVersion: string;
  readonly id: string;
  readonly gate: string;
  /** Hash del archivo del gate: detecta que el gate cambió, no el artefacto. */
  readonly gateHash: string;
  readonly subject: GateSubject;
  readonly outcome: GateDecision["outcome"];
  readonly reason: string;
  readonly actor: GateDecision["actor"];
  readonly decidedAt: string;
  /** Hash del contexto congelado que vio el evaluador. */
  readonly stateHash: string;
  readonly policy: GatePolicy;
  readonly mechanicalChecks: readonly MechanicalCheck[];
  readonly modelAnswers: readonly PropositionAnswer[];
  /** La evaluación completa, para explicar la decisión sin recalcularla. */
  readonly propositions: GateDecision["propositions"];
  readonly model: ModelIdentity | null;
  readonly usage: EvaluationUsage | null;
  readonly latencyMs: number | null;
  /** A quién se escaló, si se escaló. */
  readonly escalatedTo: "human" | null;
  /** La decisión humana, si hubo. Se anexa después, sin tocar el resto. */
  readonly humanDecision: HumanDecision | null;
}

/** La decisión de una persona sobre un gate escalado. */
export interface HumanDecision {
  readonly actor: string;
  readonly decision: "approve" | "reject";
  readonly reason: string;
  readonly channel: string;
  readonly decidedAt: string;
}

/**
 * Serializa un valor de forma estable.
 *
 * `JSON.stringify` respeta el orden de inserción de las claves, así que dos
 * objetos con el mismo contenido pero construidos en distinto orden producen
 * textos distintos y, por tanto, hashes distintos. Para un hash que debe
 * compararse entre máquinas y entre ejecuciones, las claves se ordenan.
 *
 * Los arreglos conservan su orden a propósito: el orden de las proposiciones y
 * de las respuestas es parte del contrato del gate.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

/** Calcula el hash del contexto congelado. */
export function hashState(state: unknown): string {
  return `sha256:${createHash("sha256").update(stableStringify(state)).digest("hex")}`;
}

/** Calcula el hash de la definición de un gate. */
export function hashGate(
  propositions: readonly Proposition[],
  policy: GatePolicy,
): string {
  return `sha256:${createHash("sha256")
    .update(stableStringify({ propositions, policy }))
    .digest("hex")}`;
}

/** Todo lo que hace falta para construir un recibo. */
export interface ReceiptInput {
  readonly id: string;
  readonly gate: string;
  readonly propositions: readonly Proposition[];
  readonly policy: GatePolicy;
  readonly subject: GateSubject;
  readonly decision: GateDecision;
  /** El contexto exacto que se envió al evaluador. */
  readonly state: unknown;
  readonly answers: readonly PropositionAnswer[];
  readonly mechanicalChecks: readonly MechanicalCheck[];
  readonly model?: ModelIdentity | null;
  readonly usage?: EvaluationUsage | null;
  readonly latencyMs?: number | null;
  readonly decidedAt: string;
}

/** Construye un recibo a partir de una decisión. */
export function buildReceipt(input: ReceiptInput): GateReceipt {
  const escalates = input.decision.outcome === "review";

  return {
    kind: "gate-receipt",
    receiptVersion: RECEIPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    id: input.id,
    gate: input.gate,
    gateHash: hashGate(input.propositions, input.policy),
    subject: input.subject,
    outcome: input.decision.outcome,
    reason: input.decision.reason,
    actor: input.decision.actor,
    decidedAt: input.decidedAt,
    stateHash: hashState(input.state),
    policy: input.policy,
    mechanicalChecks: input.mechanicalChecks,
    modelAnswers: input.answers,
    propositions: input.decision.propositions,
    model: input.model ?? null,
    usage: input.usage ?? null,
    latencyMs: input.latencyMs ?? null,
    escalatedTo: escalates ? "human" : null,
    humanDecision: null,
  };
}

/**
 * Anexa la decisión de una persona a un recibo escalado.
 *
 * Devuelve un recibo nuevo: los recibos son inmutables una vez emitidos. La
 * decisión humana se añade, nunca reemplaza el veredicto del evaluador, porque
 * saber que el modelo dudó y una persona aprobó es información, no ruido.
 */
export function withHumanDecision(
  receipt: GateReceipt,
  human: HumanDecision,
): GateReceipt {
  if (receipt.escalatedTo !== "human") {
    throw new Error(
      `El recibo ${receipt.id} no fue escalado a una persona y no admite una decisión humana.`,
    );
  }
  if (receipt.humanDecision !== null) {
    throw new Error(
      `El recibo ${receipt.id} ya tiene una decisión humana registrada.`,
    );
  }
  return { ...receipt, humanDecision: human };
}

/** Línea compacta del recibo, para el registro de actividad. */
export function summarizeReceipt(receipt: GateReceipt): string {
  const partes = [
    receipt.gate.padEnd(12),
    receipt.outcome.padEnd(8),
    receipt.subject.id,
  ];
  if (receipt.model !== null) partes.push(receipt.model.resolvedVersion);
  if (receipt.usage !== null)
    partes.push(`$${receipt.usage.costUsd.toFixed(6)}`);
  if (receipt.escalatedTo !== null) partes.push("→ humano");
  return partes.join("  ");
}
