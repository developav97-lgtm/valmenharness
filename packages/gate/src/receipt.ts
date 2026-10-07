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

import type { NotApplicableRecord } from "./dynamic.js";

import type {
  GateDecision,
  GatePolicy,
  MechanicalCheck,
  Proposition,
  PropositionAnswer,
} from "./decide.js";

/** Versión del formato del recibo. */
export const RECEIPT_VERSION = 1;

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

/**
 * Un archivo que una corrida de comando dejó como evidencia.
 *
 * Se define acá y no importando el tipo de `@valmen/gate-command` porque la
 * dependencia sería circular —`gate-command` depende de `gate`—. Es una copia
 * estructural: el campo que llega desde el evaluador es compatible.
 */
export interface CommandArtifactRecord {
  /** Ruta relativa a la raíz del proyecto, con separadores POSIX. */
  readonly path: string;
  readonly bytes: number;
}

/**
 * El resultado de un comando que respondió una proposición, tal como queda en el
 * recibo.
 *
 * Es la evidencia que un criterio verificable por comando necesita: sin ella, el
 * recibo guarda un `1.00` y descarta por qué. Estructuralmente compatible con
 * `CommandCheckResult` de `@valmen/gate-command`, sin importarlo.
 */
export interface CommandResultRecord {
  readonly propositionId: string;
  readonly description: string;
  /** Línea de comando tal como se ejecutó, para reproducirla. */
  readonly invocation: string;
  readonly exitCode: number;
  readonly expectedExitCode: number;
  readonly passed: boolean;
  readonly durationMs: number;
  /** La cola de la salida, donde está el resumen del runner. */
  readonly stdout: string;
  readonly stderr: string;
  /** El sha256 de la salida completa, antes de recortar. */
  readonly stdoutSha256?: string;
  readonly stderrSha256?: string;
  readonly stdoutBytes?: number;
  readonly stderrBytes?: number;
  /** Por qué el comando no llegó a probar nada, si ese fue el caso. */
  readonly environmentFailure?: string;
  /** La evidencia que la corrida dejó, si el check declaró sus directorios. */
  readonly artifacts?: readonly CommandArtifactRecord[];
}

/**
 * Un paso de la preparación del ambiente de pruebas, tal como queda en el recibo.
 *
 * La preparación corre **antes** de los criterios (R-CDEF-007). Se guarda cada paso con
 * su comando, su resultado y su duración, para que el recibo diga en qué estado se
 * encontró el ambiente cuando se probó.
 */
export interface SetupStepRecord {
  readonly command: string;
  /** `refused`: no se ejecutó, y `detail` dice por qué (esquema no permitido). */
  readonly outcome: "ok" | "failed" | "refused";
  readonly exitCode: number | null;
  readonly durationMs: number;
  /** La cola de la salida, donde está lo que falló. */
  readonly tail: string;
  readonly outputSha256?: string;
  readonly detail?: string;
}

/** La preparación del ambiente que corrió antes de los criterios. */
export interface SetupRecord {
  readonly schema: string;
  readonly steps: readonly SetupStepRecord[];
  /** El motivo por el que la compuerta terminó como falla del entorno, si fue por esto. */
  readonly failure: string | null;
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
  /**
   * Lo que la lectura mecánica del artefacto agrega a la decisión.
   *
   * No es una proposición y no puede cambiar el veredicto: es la causa probable de
   * una banda de revisión cuando el artefacto está completo. Sin esto, un recibo
   * que dice `criterio_04 en banda de revisión` manda a mirar el contenido del
   * plan, y el problema está en la forma del criterio.
   */
  readonly notes?: readonly string[];
  /**
   * Los escalamientos entre modelos de la cascada verificada, si los hubo.
   *
   * Opcional a propósito: los recibos emitidos antes de que la cascada existiera
   * siguen siendo válidos y no se reescriben —el registro es append-only—, así
   * que un recibo sin este campo no dice «no se escaló» sino «esto se evaluó sin
   * cascada».
   */
  readonly escalations?: readonly EscalationRecord[];
  /**
   * El resultado de cada comando que respondió una proposición, con su evidencia.
   *
   * Opcional y aditivo, con el mismo criterio que `notes` y `escalations`: un
   * recibo emitido antes de que este campo existiera sigue siendo válido y no se
   * reescribe —el registro es append-only—, y por eso `receiptVersion` no sube.
   * Un recibo sin este campo no dice «no corrió comandos» sino «se emitió antes
   * de que este campo existiera».
   */
  readonly commandResults?: readonly CommandResultRecord[];
  /** La preparación del ambiente de pruebas que corrió antes de los criterios, si el proyecto la declara. */
  readonly setup?: SetupRecord;
  /** Con qué evaluador se produjo (`command`, `jev`, `llm-judge`, `cascade`). */
  readonly evaluator?: string;
  /** Las proposiciones que no aplican al tipo del ticket: no se enviaron al evaluador (`no_aplica`). */
  readonly notApplicable?: readonly NotApplicableRecord[];
  /**
   * La huella de la configuración del evaluador de esta corrida.
   *
   * Junto con `stateHash` dice si dos corridas son la misma pregunta: mismo estado del
   * ticket y mismo evaluador. Sin ella no se puede reconocer una repetición.
   */
  readonly evaluatorKey?: string;
  /** Si la corrida repite una anterior a propósito: el motivo y el recibo que repite. */
  readonly forced?: { readonly reason: string; readonly receiptId: string };
}

/** Los dos extremos de un escalamiento, en lo que el recibo necesita. */
export interface EscalationModel {
  readonly provider: string;
  readonly model: string;
}

/**
 * Un escalamiento de la cascada verificada, con su motivo.
 *
 * Es una entrada por proposición y no una por corrida: el motivo de escalar «b» no
 * es el de escalar «a», y una lista con las dos juntas deja el recibo afirmando
 * que se pagó el modelo caro por algo sin poder decir por cuál. El número que lo
 * decidió —la probabilidad que emitió el verificador— va al lado del umbral, para
 * que el motivo se pueda volver a juzgar sin recalcular nada.
 */
export interface EscalationRecord {
  /** El rol que recibió el trabajo: el eslabón de escalado. */
  readonly role: string;
  /** La proposición que se volvió a preguntar. */
  readonly proposition: string;
  readonly from: EscalationModel;
  readonly to: EscalationModel;
  /** La probabilidad que emitió el verificador sobre la respuesta del productor. */
  readonly verified: number;
  /** El umbral que esa probabilidad no alcanzó. */
  readonly threshold: number;
  /** El motivo, en una frase, con su número. */
  readonly reason: string;
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
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
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

/**
 * La huella de la configuración con la que se evalúa: sha256 de un JSON estable.
 *
 * Dos corridas con el mismo `stateHash` y la misma huella hacen la misma pregunta al
 * mismo evaluador; repetir la segunda solo busca otra respuesta (R-CDEF-008).
 */
export function hashEvaluatorConfig(config: unknown): string {
  return `sha256:${createHash("sha256").update(stableStringify(config)).digest("hex")}`;
}

/** Calcula el hash de la definición de un gate. */
export function hashGate(propositions: readonly Proposition[], policy: GatePolicy): string {
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
  /** El aviso de forma, si la lectura mecánica produjo alguno. */
  readonly notes?: readonly string[];
  /** Los escalamientos entre modelos, si el evaluador fue la cascada. */
  readonly escalations?: readonly EscalationRecord[];
  /** El resultado de cada comando corrido, si el evaluador fue determinista. */
  readonly commandResults?: readonly CommandResultRecord[];
  /** La preparación del ambiente que corrió antes de los criterios. */
  readonly setup?: SetupRecord;
  readonly evaluator?: string;
  readonly notApplicable?: readonly NotApplicableRecord[];
  readonly evaluatorKey?: string;
  readonly forced?: { readonly reason: string; readonly receiptId: string };
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
    // El motivo va explícito: `null` quiere decir que el evaluador no lo dio.
    modelAnswers: input.answers.map((answer) => ({ ...answer, reason: answer.reason ?? null })),
    propositions: input.decision.propositions,
    model: input.model ?? null,
    usage: input.usage ?? null,
    latencyMs: input.latencyMs ?? null,
    escalatedTo: escalates ? "human" : null,
    humanDecision: null,
    ...(input.notes === undefined || input.notes.length === 0
      ? {}
      : { notes: input.notes }),
    ...(input.escalations === undefined || input.escalations.length === 0
      ? {}
      : { escalations: input.escalations }),
    ...(input.commandResults === undefined || input.commandResults.length === 0
      ? {}
      : { commandResults: input.commandResults }),
    ...(input.setup === undefined ? {} : { setup: input.setup }),
    ...(input.evaluator === undefined ? {} : { evaluator: input.evaluator }),
    ...(input.notApplicable === undefined || input.notApplicable.length === 0
      ? {}
      : { notApplicable: input.notApplicable }),
    ...(input.evaluatorKey === undefined ? {} : { evaluatorKey: input.evaluatorKey }),
    ...(input.forced === undefined ? {} : { forced: input.forced }),
  };
}

/**
 * Anexa la decisión de una persona a un recibo escalado o bloqueado.
 *
 * Devuelve un recibo nuevo: los recibos son inmutables una vez emitidos. La
 * decisión humana se añade, nunca reemplaza el veredicto del evaluador, porque
 * saber que el modelo dudó y una persona aprobó es información, no ruido.
 *
 * Y **el actor de la decisión es la persona**, no el modelo. Antes se copiaba
 * `actor` del veredicto —`model`— y un gate escalado y aprobado por el PO seguía
 * contando como decisión del modelo; el recibo tiene que poder decir quién
 * decidió de verdad. El veredicto del evaluador queda en `outcome`, `reason` y
 * `propositions`: eso no se toca.
 *
 * **Un recibo `block` también admite la decisión.** Solo `review` escala, así que
 * antes un bloqueo que el PO autorizó seguir no tenía dónde dejar su frase, y el
 * ticket avanzaba sin rastro: es lo que pasó 9 veces en el registro real
 * (R-CDEF-004). El recibo conserva `outcome` y `escalatedTo`: la persona anula el
 * veredicto, no lo borra. Aprobar un `block` exige la **frase literal** de quien
 * autoriza, porque es lo único que dice después por qué se siguió pese al bloqueo.
 *
 * El `block` de `qa-mechanical` queda fuera: es un comando que falló, un hecho y no
 * una opinión, y aprobarlo entregaría trabajo que no pasa sus pruebas.
 */
export function withHumanDecision(receipt: GateReceipt, human: HumanDecision): GateReceipt {
  const bloqueo = receipt.outcome === "block";
  if (bloqueo && receipt.gate === "qa-mechanical") {
    throw new Error(
      `El recibo ${receipt.id} es de la compuerta mecánica y bloqueó: un comando que falló ` +
        "es un hecho y no una opinión, así que no admite una decisión humana. Corrige lo que " +
        "falla y vuelve a correrla.",
    );
  }
  if (receipt.escalatedTo !== "human" && !bloqueo) {
    throw new Error(
      `El recibo ${receipt.id} no fue escalado a una persona y no admite una decisión humana.`,
    );
  }
  if (receipt.humanDecision !== null) {
    throw new Error(`El recibo ${receipt.id} ya tiene una decisión humana registrada.`);
  }
  if (bloqueo && human.decision === "approve" && human.reason.trim() === "") {
    throw new Error(
      `Aprobar el recibo ${receipt.id}, que bloqueó, exige la frase literal de quien ` +
        "autoriza (`--reason`): sin ella el registro no dice por qué se siguió pese al bloqueo.",
    );
  }
  return { ...receipt, actor: "human", humanDecision: human };
}

/** Línea compacta del recibo, para el registro de actividad. */
export function summarizeReceipt(receipt: GateReceipt): string {
  const partes = [receipt.gate.padEnd(12), receipt.outcome.padEnd(8), receipt.subject.id];
  if (receipt.model !== null) partes.push(receipt.model.resolvedVersion);
  if (receipt.usage !== null) partes.push(`$${receipt.usage.costUsd.toFixed(6)}`);
  if (receipt.escalations !== undefined && receipt.escalations.length > 0) {
    // El escalamiento entre modelos se marca aparte de la escalada a una persona:
    // son dos cosas distintas —una sube el modelo, la otra sube la decisión— y
    // confundirlas en la línea haría creer que el gate pidió una persona cuando
    // lo que hizo fue pagar el modelo caro.
    partes.push(`→ ${receipt.escalations.length} escalado(s)`);
  }
  if (receipt.escalatedTo !== null) partes.push("→ humano");
  return partes.join("  ");
}
