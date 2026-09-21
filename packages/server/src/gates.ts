/**
 * Vista de gates para la interfaz.
 *
 * Un gate es la frontera donde el harness deja de ser un registro y pasa a
 * decidir. La pantalla tiene que mostrar tres cosas, en este orden:
 *
 * 1. **Qué se puede decidir sin gastar nada.** Los checks mecánicos se ejecutan
 *    en código; si uno falla, el gate va a bloquear y no tiene sentido llamar a
 *    un modelo. Mostrarlos antes de evaluar convierte un gasto inútil en una
 *    explicación.
 * 2. **Qué respondió el evaluador, proposición por proposición**, con la
 *    probabilidad que se comparó contra los umbrales y si cayó en la banda
 *    media. Un veredicto sin las probabilidades que lo produjeron no es
 *    auditable.
 * 3. **Si el estado congelado sigue siendo el estado actual.** El recibo guarda
 *    el hash de lo que vio el evaluador. Si el ticket cambió después, la
 *    aprobación es de otro artefacto, y presentarla como vigente sería la
 *    mentira más cara que puede decir esta pantalla.
 *
 * No hay lógica de negocio aquí: se llama al mismo `runGate` que usa el CLI y se
 * proyecta el recibo.
 *
 * Ver docs/06-CONTROL-APP.md §2.3 y docs/03-GATES.md §7.
 */
import {
  type EvaluatedProposition,
  type GateDefinition,
  type GateReceipt,
  type MechanicalCheck,
  GATES,
  extractCriteria,
  gateFor,
  hashState,
  weightedMean,
  withHumanDecision,
} from "@valmen/gate";
import { parseTicket } from "@valmen/core";
import { gateRouting } from "./routing.js";
import {
  type EvaluatorId,
  type RegistryPaths,
  appendEvent,
  appendReceipt,
  buildGateState,
  currentReceipts,
  findTicket,
  readReceipts,
  runGate,
  runMechanicalChecks,
} from "@valmen/engine";

/** Un gate disponible para un ticket, con lo que el código ya sabe de él. */
export interface GateCard {
  readonly id: string;
  readonly title: string;
  readonly transition: string;
  readonly mode: GateDefinition["mode"];
  readonly appliesTo: readonly string[];
  /** `true` si el ticket está en un estado donde este gate tiene sentido. */
  readonly applies: boolean;
  /** El estado actual del ticket, para explicar por qué no aplica. */
  readonly workflowStatus: string;
  /** Lo que el código puede decidir sin llamar a ningún modelo. */
  readonly mechanicalChecks: readonly MechanicalCheck[];
  /** `true` si algún check falla: el gate bloqueará sin gastar una llamada. */
  readonly blockedByCode: boolean;
  /** Cuántas proposiciones se enviarán, contando la expansión por criterio. */
  readonly propositionCount: number;
  /**
   * `true` si el gate declara comandos para resolver proposiciones en código.
   *
   * Sin comandos, el evaluador determinista no tiene con qué decidir y falla.
   * Ofrecerlo en la interfaz sería ofrecer un botón que siempre da error.
   */
  readonly hasCommandChecks: boolean;
  /** Umbrales vigentes. */
  readonly policy: { readonly approveAt: number; readonly blockAt: number };
  /**
   * El modelo que se usará y de dónde salió.
   *
   * Sin esto, cambiar el preset y no ver efecto es indistinguible de un override
   * olvidado en `.valmen/routing.yaml`.
   */
  readonly routing: {
    readonly model: string;
    readonly effort: string;
    readonly source: string;
    readonly probabilistic: boolean;
  };
}

/** Una proposición evaluada, tal como se muestra. */
export interface PropositionView extends EvaluatedProposition {
  /** Etiqueta legible del veredicto, para no repetir la regla en la interfaz. */
  readonly mark: "approve" | "block" | "review" | "descriptive";
}

/** Una decisión de gate, proyectada para la pantalla. */
export interface GateDecisionView {
  readonly receiptId: string;
  readonly gate: string;
  readonly outcome: GateReceipt["outcome"];
  readonly reason: string;
  readonly actor: GateReceipt["actor"];
  readonly decidedAt: string;
  readonly escalatedTo: GateReceipt["escalatedTo"];
  readonly humanDecision: GateReceipt["humanDecision"];
  /** Hash del contexto que vio el evaluador. */
  readonly stateHash: string;
  readonly gateHash: string;
  /**
   * `true` si el ticket cambió desde que se emitió el recibo.
   *
   * Una aprobación de un estado que ya no existe no es una aprobación. La
   * pantalla la muestra, pero marcada.
   */
  readonly stale: boolean;
  readonly model: GateReceipt["model"];
  readonly usage: GateReceipt["usage"];
  readonly latencyMs: number | null;
  readonly mechanicalChecks: readonly MechanicalCheck[];
  readonly propositions: readonly PropositionView[];
  /** Media ponderada. Es informativa: la decisión no la usa. */
  readonly weightedMean: number;
  readonly inBand: readonly string[];
  readonly blocking: readonly string[];
  readonly report: string;
}

/** La marca de una proposición: cómo se lee su resultado. */
function markOf(proposicion: EvaluatedProposition): PropositionView["mark"] {
  if (!proposicion.verdict) return "descriptive";
  if (proposicion.inBand) return "review";
  return proposicion.effect?.outcome === "approve" ? "approve" : "block";
}

/** Proyecta un recibo a la vista, calculando si quedó obsoleto. */
export function projectReceipt(
  receipt: GateReceipt,
  currentStateHash: string | null,
): GateDecisionView {
  const { mean } = weightedMean({
    outcome: receipt.outcome,
    reason: receipt.reason,
    actor: receipt.actor,
    propositions: receipt.propositions,
    blocking: [],
    inBand: [],
  });

  return {
    receiptId: receipt.id,
    gate: receipt.gate,
    outcome: receipt.outcome,
    reason: receipt.reason,
    actor: receipt.actor,
    decidedAt: receipt.decidedAt,
    escalatedTo: receipt.escalatedTo,
    humanDecision: receipt.humanDecision,
    stateHash: receipt.stateHash,
    gateHash: receipt.gateHash,
    // Sin hash actual no se puede afirmar que siga vigente, así que se marca.
    stale: currentStateHash === null || currentStateHash !== receipt.stateHash,
    model: receipt.model,
    usage: receipt.usage,
    latencyMs: receipt.latencyMs,
    mechanicalChecks: receipt.mechanicalChecks,
    propositions: receipt.propositions.map((proposicion) => ({
      ...proposicion,
      mark: markOf(proposicion),
    })),
    weightedMean: mean,
    inBand: receipt.propositions
      .filter((proposicion) => proposicion.inBand)
      .map((proposicion) => proposicion.id),
    blocking: receipt.propositions
      .filter(
        (proposicion) =>
          proposicion.verdict &&
          !proposicion.inBand &&
          proposicion.effect?.outcome === "block",
      )
      .map((proposicion) => proposicion.id),
    report: "",
  };
}

/** El hash del estado actual del ticket, o `null` si no se puede leer o parsear. */
async function currentStateHash(
  paths: RegistryPaths,
  ticketId: string,
): Promise<string | null> {
  const ticket = findTicket(paths, ticketId);
  if (ticket === undefined) return null;
  try {
    return hashState(buildGateState(ticket.text));
  } catch {
    return null;
  }
}

/**
 * Los gates que existen y si aplican al ticket.
 *
 * Devuelve `null` si el ticket no existe. Un ticket que no parsea no impide
 * listar los gates: se devuelven sin checks, y la pantalla ya muestra que el
 * ticket es inválido.
 */
export function listGateCards(
  paths: RegistryPaths,
  ticketId: string,
): GateCard[] | null {
  const ticket = findTicket(paths, ticketId);
  if (ticket === undefined) return null;

  let workflow = "";
  let checks: MechanicalCheck[] = [];
  let propositionCounts = new Map<string, number>();
  try {
    const parsed = parseTicket(ticket.text);
    workflow = parsed.fields.workflow_status;
    checks = runMechanicalChecks(ticket.text);
    const criteria = extractCriteria(parsed.sections["Criterios de aceptación"]);
    propositionCounts = new Map(
      Object.values(GATES).map((definicion) => [
        definicion.id,
        gateFor(definicion, { criteria }).propositions.length,
      ]),
    );
  } catch {
    // Un ticket inválido no tiene estado del que hablar. Las tarjetas se
    // devuelven igual, sin precondición cumplida, para que la pantalla pueda
    // decir que el problema es el ticket y no el gate.
    workflow = "";
  }

  const routing = gateRouting(paths.root);

  return Object.values(GATES).map((definicion) => ({
    id: definicion.id,
    title: definicion.title,
    transition: definicion.transition,
    mode: definicion.mode,
    appliesTo: definicion.appliesTo,
    applies: workflow !== "" && definicion.appliesTo.includes(workflow),
    workflowStatus: workflow,
    mechanicalChecks: checks,
    blockedByCode: checks.some((check) => check.result === "fail"),
    propositionCount: propositionCounts.get(definicion.id) ?? 0,
    hasCommandChecks: (definicion.commandChecks?.length ?? 0) > 0,
    policy: definicion.policy,
    routing: {
      model: routing.evaluatorModel,
      effort: routing.evaluatorEffort,
      source: routing.source,
      probabilistic: routing.probabilistic,
    },
  }));
}

/** El resultado de ejecutar un gate desde la interfaz. */
export interface GateRunOutcome {
  readonly ok: boolean;
  /** La misma salida que imprime el CLI. Es la prueba de que no hay dos caminos. */
  readonly report: string;
  readonly error: string;
  readonly exitCode: number;
  readonly receipt: GateDecisionView | null;
  readonly tickets: readonly GateCard[] | null;
}

/** Opciones de una ejecución desde la interfaz. */
export interface GateRunRequest {
  readonly evaluator?: EvaluatorId;
  /** Inyectables para que las pruebas no salgan a la red. */
  readonly jev?: Parameters<typeof runGate>[1]["jev"];
  readonly judge?: Parameters<typeof runGate>[1]["judge"];
  readonly now?: () => Date;
  readonly receiptId?: string;
}

/**
 * Ejecuta un gate y devuelve el recibo proyectado.
 *
 * Se conserva el informe en texto del CLI además de la estructura: si el botón
 * produjera algo distinto de lo que produce el comando, la pantalla sería una
 * comodidad y no una interfaz sobre el harness.
 */
export async function runTicketGate(
  paths: RegistryPaths,
  ticketId: string,
  gateId: string,
  request: GateRunRequest = {},
): Promise<GateRunOutcome> {
  // El modelo lo decide el routing del proyecto. Si el rol `gate-evaluator`
  // apunta a un modelo de chat, el evaluador semántico pasa a ser un juez —y el
  // recibo lo dirá—; si apunta a Jev, se mantienen las probabilidades.
  const routing = gateRouting(paths.root);

  // Se cuentan las líneas antes de evaluar. Sin esto, una evaluación que falla
  // devolvería **el recibo anterior** como si fuera el resultado: el identificador
  // de un recibo es determinista por día y gate, así que "el último recibo del
  // gate" puede ser de hace una hora. Mostrar una decisión vieja como recién
  // tomada es la mentira más cara que puede decir esta pantalla.
  const lineasAntes = readReceipts(paths, ticketId).length;

  const result = await runGate(paths, {
    gateId,
    ticketId,
    ...(request.evaluator === undefined ? {} : { evaluator: request.evaluator }),
    ...(request.jev === undefined ? {} : { jev: request.jev }),
    ...(request.judge === undefined ? {} : { judge: request.judge }),
    ...(request.now === undefined ? {} : { now: request.now }),
    ...(request.receiptId === undefined ? {} : { receiptId: request.receiptId }),
    ...(routing.evaluatorModel === ""
      ? {}
      : { model: routing.evaluatorModel }),
    ...(routing.probabilistic ? {} : { semantic: "llm-judge" as const }),
    ...(routing.evaluatorEffort === "auto"
      ? {}
      : { effort: routing.evaluatorEffort }),
    ...(routing.judgeModel === "" ? {} : { judgeModel: routing.judgeModel }),
  });

  const actual = await currentStateHash(paths, ticketId);
  const todas = readReceipts(paths, ticketId);
  const seAnexo = todas.length > lineasAntes;

  // El recibo de esta ejecución es el último del gate, y solo vale si se acaba
  // de anexar. Si no se anexó nada, la evaluación no llegó a decidir.
  const ultimo = currentReceipts(todas).find((recibo) => recibo.gate === gateId);

  if (!seAnexo || ultimo === undefined) {
    // Bloqueo por checks mecánicos, precondición incumplida o fallo del
    // evaluador: no hay decisión nueva, y el motivo viene del motor tal cual.
    return {
      ok: false,
      report: result.stdout,
      error: result.stderr,
      exitCode: result.exitCode,
      receipt: null,
      tickets: listGateCards(paths, ticketId),
    };
  }

  return {
    ok: true,
    report: result.stdout,
    error: result.stderr,
    exitCode: result.exitCode,
    receipt: { ...projectReceipt(ultimo, actual), report: result.stdout },
    tickets: listGateCards(paths, ticketId),
  };
}

/**
 * Una corrección pendiente: un gate que una persona rechazó.
 *
 * El rechazo es un encargo, y hasta ahora vivía en el recibo y en el historial
 * del ticket, donde solo lo encontraba quien supiera buscarlo. Esto lo saca a la
 * superficie: qué se rechazó, quién, cuándo y por qué.
 */
export interface PendingCorrection {
  readonly gate: string;
  readonly receiptId: string;
  readonly actor: string;
  readonly reason: string;
  readonly decidedAt: string;
  /** Cuántas veces se ha rechazado este gate, contando esta. */
  readonly rejections: number;
  /**
   * `true` cuando ya se gastó el reintento correctivo.
   *
   * El diseño pide **exactamente un** reintento: el autor corrige una vez y
   * vuelve a evaluarse. Si el segundo intento también se rechaza, insistir es un
   * bucle, y un bucle con una persona esperando es peor que parar y pedirle que
   * decida.
   */
  readonly retryExhausted: boolean;
}

/** Las correcciones pendientes de un ticket, por gate. */
export function pendingCorrections(
  paths: RegistryPaths,
  ticketId: string,
): PendingCorrection[] {
  const historial = readReceipts(paths, ticketId);

  return currentReceipts(historial)
    .filter((recibo) => recibo.humanDecision?.decision === "reject")
    .map((recibo) => {
      const rechazos = historial.filter(
        (linea) =>
          linea.gate === recibo.gate &&
          linea.humanDecision?.decision === "reject",
      );
      const humana = recibo.humanDecision as NonNullable<
        GateReceipt["humanDecision"]
      >;
      return {
        gate: recibo.gate,
        receiptId: recibo.id,
        actor: humana.actor,
        reason: humana.reason,
        decidedAt: humana.decidedAt,
        rejections: rechazos.length,
        retryExhausted: rechazos.length >= 2,
      };
    });
}

/** Los recibos vigentes de un ticket, del más nuevo al más viejo. */
export function listGateDecisions(
  paths: RegistryPaths,
  ticketId: string,
): GateDecisionView[] {
  const ticket = findTicket(paths, ticketId);
  const actual =
    ticket === undefined
      ? null
      : (() => {
          try {
            return hashState(buildGateState(ticket.text));
          } catch {
            return null;
          }
        })();

  return currentReceipts(readReceipts(paths, ticketId)).map((recibo) =>
    projectReceipt(recibo, actual),
  );
}

/** Lo que una persona decide sobre un gate escalado. */
export interface HumanDecisionInput {
  readonly decision: "approve" | "reject";
  readonly actor: string;
  readonly reason: string;
  readonly channel?: string;
}

/** El resultado de registrar una decisión humana. */
export interface HumanDecisionOutcome {
  readonly ok: boolean;
  readonly error: string;
  readonly receipt: GateDecisionView | null;
}

/**
 * Registra la decisión de una persona sobre un gate escalado.
 *
 * Se anexa como una línea nueva con el mismo identificador. El veredicto del
 * evaluador no se reescribe: que el modelo dudara y una persona aprobara es
 * información sobre el gate, y perderla eliminaría justamente el dato que
 * permite calibrarlo.
 *
 * Aprobar **no avanza el ticket**. Un gate no cambia estados: la transición es
 * otra operación, con su propia autorización.
 */
export function recordHumanDecision(
  paths: RegistryPaths,
  ticketId: string,
  receiptId: string,
  input: HumanDecisionInput,
): HumanDecisionOutcome {
  const recibos = readReceipts(paths, ticketId);
  const vigente = currentReceipts(recibos).find(
    (recibo) => recibo.id === receiptId,
  );

  if (vigente === undefined) {
    return {
      ok: false,
      error: `No existe el recibo ${receiptId} para el ticket ${ticketId}.`,
      receipt: null,
    };
  }

  if (input.actor.trim() === "") {
    return {
      ok: false,
      error: "Una decisión humana necesita un responsable: falta `actor`.",
      receipt: null,
    };
  }

  let conDecision: GateReceipt;
  try {
    conDecision = withHumanDecision(vigente, {
      actor: input.actor.trim(),
      decision: input.decision,
      reason: input.reason,
      channel: input.channel ?? "mission-control",
      decidedAt: new Date().toISOString(),
    });
  } catch (caught) {
    // El motor explica por qué no admite la decisión —no fue escalado, o ya
    // tiene una— y ese mensaje es el que hay que mostrar.
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : String(caught),
      receipt: null,
    };
  }

  appendReceipt(paths, ticketId, conDecision);

  // La decisión se anexa también **al ticket**, no solo al recibo.
  //
  // Un rechazo es una petición de corrección, y quien la va a ejecutar lee el
  // ticket: si el motivo viviera únicamente en `.valmen/receipts/`, el bucle
  // quedaría abierto a medias —la decisión registrada y la corrección sin
  // encargo—. Aprobar se anota por la misma razón: el historial del ticket cuenta
  // lo que pasó con su plan, y una aprobación también es parte de eso.
  try {
    appendEvent(
      paths,
      ticketId,
      input.decision === "approve" ? "gate-approved" : "gate-rejected",
      input.decision === "approve"
        ? `Gate ${vigente.gate} aprobado por ${input.actor.trim()}${input.reason.trim() === "" ? "." : `: ${input.reason.trim()}`}`
        : `Gate ${vigente.gate} rechazado por ${input.actor.trim()}${input.reason.trim() === "" ? "." : `: ${input.reason.trim()}`}`,
    );
  } catch (caught) {
    // La decisión ya está en el recibo, que es donde no se puede perder. Si el
    // ticket no se pudo anotar —porque el registro cambió debajo—, se dice, en
    // vez de devolver un éxito que no lo es del todo.
    return {
      ok: true,
      error: `La decisión quedó registrada, pero no se pudo anotar en el ticket: ${
        caught instanceof Error ? caught.message : String(caught)
      }`,
      receipt: null,
    };
  }

  const ticket = findTicket(paths, ticketId);
  let actual: string | null = null;
  if (ticket !== undefined) {
    try {
      actual = hashState(buildGateState(ticket.text));
    } catch {
      actual = null;
    }
  }

  return { ok: true, error: "", receipt: projectReceipt(conDecision, actual) };
}
