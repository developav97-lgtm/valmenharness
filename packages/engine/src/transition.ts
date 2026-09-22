/**
 * `transition`: el único comando que mueve el estado de algo.
 *
 * Está transcrito de `cmd_transition` de la implementación de referencia
 * (`ticket.py` L1371-1533), incluido el **orden** de las comprobaciones: la
 * legalidad de la tabla va antes que las precondiciones del destino, y en un
 * punto la existencia del punto va antes que la legalidad. El orden importa
 * porque decide qué error ve quien se equivoca cuando se equivoca en dos cosas.
 *
 * Dos reglas que no son obvias y que se conservan a propósito:
 *
 * 1. **`--reason` no es un campo libre.** Solo vale para reabrir un ticket
 *    cerrado sin publicar, o para declarar terminal un punto. En cualquier otro
 *    caso es un error, no una bandera ignorada: quien la escribe cree que está
 *    dejando un motivo, y perderlo en silencio es peor que rechazarlo.
 * 2. **`qa_approved` tiene dos caminos, y el segundo escribe.** Con un ciclo QA
 *    aprobado el estado ya está en el frontmatter y no se toca; con una exención
 *    válida, el comando escribe `qa_status: waived` él mismo. Es el único punto
 *    donde una transición de ticket modifica otro campo además del suyo.
 *
 * La escritura la cierra `finalizeMutation`, así que el revalidado previo y la
 * atomicidad son los mismos para todos los comandos.
 */
import {
  BLOCKING_POINT_STATES,
  type JsonObject,
  type ParsedTicket,
  SEMVER_RE,
  TERMINAL_POINT_STATES,
  EXIT_INVARIANT,
  EXIT_SCHEMA,
  MutationLock,
  assertTransition,
  fail,
  hasApprovedQaCycle,
  hasPlanGate,
  hasRecordedUserTestOutcome,
  hasStructuredPlan,
  hasSubstantivePlan,
  hasValidQaWaiver,
  replaceBlock,
  replaceFrontmatterField,
  validateText,
} from "@valmen/core";

import { type RegistryPaths, findTicket } from "./discovery.js";
import { finalizeMutation, readAndValidate } from "./mutate.js";

/** Las entidades que se pueden mover. */
export type Entity = "ticket" | "point" | "release";

/** Lo que pide una transición. */
export interface TransitionRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly entity: Entity;
  readonly to: string;
  readonly pointId?: string | undefined;
  readonly reason?: string | undefined;
  readonly version?: string | undefined;
  readonly now?: (() => Date) | undefined;
}

/** Lo que devuelve: la línea que informa del movimiento. */
export interface TransitionOutcome {
  readonly details: string;
}

/** Una entrada del bloque `QA`, con las claves del contrato. */
function qaEntry(id: string, date: string, values: Partial<JsonObject>): JsonObject {
  return {
    id,
    date,
    build_reference: null,
    environment: null,
    result: "pending",
    findings: [],
    correction: null,
    po_confirmation: null,
    ...values,
  };
}

/** El siguiente identificador de una serie, por longitud. */
function nextId(entries: readonly JsonObject[], prefix: string): string {
  return `${prefix}-${String(entries.length + 1).padStart(3, "0")}`;
}

/**
 * Aplica una transición.
 *
 * Todo ocurre bajo el lock del registro, incluida la lectura: sin eso, dos
 * comandos concurrentes podrían leer el mismo estado y escribir dos historias
 * distintas.
 */
export function transition(request: TransitionRequest): TransitionOutcome {
  const { paths, ticketId, entity } = request;

  return MutationLock.run(paths.root, () => {
    const located = findTicket(paths, ticketId);
    if (located === undefined) {
      fail("La ruta canónica solicitada no existe.", EXIT_SCHEMA);
    }

    const document = readAndValidate(paths, located);
    const date = new Date(request.now?.() ?? new Date()).toISOString().slice(0, 10);

    const plan =
      entity === "ticket"
        ? applyTicket(document, request, date)
        : entity === "release"
          ? applyRelease(document, request)
          : applyPoint(document, request);

    finalizeMutation({
      paths,
      located,
      document,
      text: plan.text,
      action: `${entity}-transition`,
      details: plan.details,
      ...(request.now === undefined ? {} : { now: request.now }),
    });

    return { details: plan.details };
  });
}

/** El texto nuevo y la línea informativa de una transición. */
interface Plan {
  readonly text: string;
  readonly details: string;
}

/** Las banderas que no aplican a una entidad son un error, no un olvido. */
function assertNoExtraFlags(request: TransitionRequest): void {
  if (request.entity === "ticket") {
    if (request.pointId !== undefined || request.version !== undefined) {
      fail("--point-id y --version no aplican a una transición de ticket.");
    }
    return;
  }
  if (request.entity === "release") {
    if (request.pointId !== undefined) {
      fail("--point-id solo se usa con --entity point.");
    }
    return;
  }
  if (request.version !== undefined) {
    fail("--version solo se usa con --entity release.");
  }
}

// ── Ticket ──────────────────────────────────────────────────────────────────

function applyTicket(
  document: ParsedTicket,
  request: TransitionRequest,
  date: string,
): Plan {
  assertNoExtraFlags(request);
  const { to, reason } = request;
  const current = document.fields.workflow_status;

  assertTransition("ticket", current, to);

  // Reabrir un ticket cerrado es la única arista hacia atrás, y solo vale
  // mientras el trabajo no se haya publicado: una release publicada no se
  // despublica, y un ticket dentro de ella tampoco.
  const reopening = current === "closed" && to === "changes_requested";
  let motivo = "";
  if (reopening) {
    if (document.fields.release_status !== "unreleased") {
      fail(
        "Solo se puede reabrir un ticket cerrado que permanezca unreleased.",
        EXIT_INVARIANT,
      );
    }
    motivo = validateText(reason ?? null, "reason");
  } else if (reason !== undefined) {
    fail("--reason solo aplica al reabrir un ticket cerrado no publicado.", EXIT_INVARIANT);
  }

  // Las precondiciones del destino, en el orden de la referencia.
  if (to === "planned" && !hasSubstantivePlan(document.sections.Plan ?? "")) {
    fail("No se puede marcar planned con placeholders o un plan vacío.", EXIT_INVARIANT);
  }
  if (to === "approved" && !hasPlanGate(document)) {
    fail(
      "approved requiere aprobación explícita del PO o razón de gate no exigible.",
      EXIT_INVARIANT,
    );
  }
  if (to === "approved" && !hasStructuredPlan(document.sections.Plan ?? "")) {
    fail(
      "approved requiere un plan proporcional estructurado con al menos dos pasos reales.",
      EXIT_INVARIANT,
    );
  }
  if (to === "in_qa" && !hasRecordedUserTestOutcome(document)) {
    fail(
      "in_qa requiere resultado del PO u omisión explícita documentada en Pruebas.",
      EXIT_INVARIANT,
    );
  }

  if (to === "changes_requested" && !reopening) {
    const qa = document.blocks.QA ?? [];
    const ultimo = qa[qa.length - 1];
    if (
      qa.length === 0 ||
      (ultimo?.result !== "changes_requested" && ultimo?.result !== "failed")
    ) {
      fail("changes_requested requiere un ciclo QA cerrado con hallazgos.", EXIT_INVARIANT);
    }
  }

  let text = document.text;

  if (to === "qa_approved") {
    if (hasApprovedQaCycle(document.blocks.QA ?? [])) {
      if (document.fields.qa_status !== "approved") {
        fail("El historial QA aprobado no coincide con qa_status.", EXIT_INVARIANT);
      }
    } else if (hasValidQaWaiver(document)) {
      // Camino de exención: aquí el comando sí escribe el estado de QA.
      text = replaceFrontmatterField(text, "qa_status", "waived");
    } else {
      fail(
        "qa_approved requiere ciclo QA confirmado o exención confirmada por el PO.",
        EXIT_INVARIANT,
      );
    }
    const bloqueante = (document.blocks.Puntos ?? []).some((punto) =>
      BLOCKING_POINT_STATES.includes(
        punto.status as (typeof BLOCKING_POINT_STATES)[number],
      ),
    );
    if (bloqueante) {
      fail("qa_approved está bloqueado por puntos pendientes.", EXIT_INVARIANT);
    }
  }

  if (to === "closed") {
    const qaStatus = document.fields.qa_status;
    if (qaStatus !== "approved" && qaStatus !== "waived") {
      fail("closed requiere QA aprobada o eximida.", EXIT_INVARIANT);
    }
    if (qaStatus === "approved" && !hasApprovedQaCycle(document.blocks.QA ?? [])) {
      fail("closed requiere un ciclo QA aprobado y confirmado.", EXIT_INVARIANT);
    }
    const cierreCoherente = (document.blocks.Cierre ?? []).some(
      (entrada) => entrada.qa_status === qaStatus,
    );
    if (!cierreCoherente) {
      fail("closed requiere un intento de cierre coherente con QA.", EXIT_INVARIANT);
    }
  }

  if (reopening) {
    // La reapertura anexa un ciclo QA completo: uno de arranque, que hereda el
    // build y el ambiente del ciclo anterior, y uno de cierre con el hallazgo
    // como único `findings`. Sin las dos entradas, el bloque quedaría impar y el
    // ciclo siguiente no podría cerrarse.
    const qa = (document.blocks.QA ?? []).map((entrada) => ({ ...entrada }));
    const anterior = qa[qa.length - 2];
    if (anterior === undefined) {
      // La referencia indexa `qa_entries[-2]` sin comprobarlo y revienta con un
      // `IndexError` que nadie captura. Aquí se dice qué pasa.
      fail(
        "No se puede reabrir: el historial QA no tiene un ciclo anterior del que heredar el build.",
        EXIT_INVARIANT,
      );
    }
    qa.push(
      qaEntry(nextId(qa, "QA"), date, {
        build_reference: anterior.build_reference,
        environment: anterior.environment,
        result: "pending",
      }),
    );
    qa.push(
      qaEntry(nextId(qa, "QA"), date, {
        result: "changes_requested",
        findings: [motivo],
      }),
    );
    text = replaceBlock(text, "QA", qa);
    text = replaceFrontmatterField(text, "qa_status", "pending");
  }

  text = replaceFrontmatterField(text, "workflow_status", to);

  let details = `Workflow: ${current} -> ${to}.`;
  if (reopening) details += ` Reapertura por hallazgo: ${motivo}`;
  return { text, details };
}

// ── Release ─────────────────────────────────────────────────────────────────

function applyRelease(document: ParsedTicket, request: TransitionRequest): Plan {
  assertNoExtraFlags(request);
  const { to, version } = request;
  const current = document.fields.release_status;

  assertTransition("release", current, to);

  let text = document.text;

  if (to === "planned") {
    if (version === undefined || !SEMVER_RE.test(version)) {
      fail("release planned requiere --version SemVer sin prefijo v.", EXIT_INVARIANT);
    }
    text = replaceFrontmatterField(text, "target_release", version);
  } else if (to === "released") {
    const target = document.fields.target_release;
    const elegida =
      version !== undefined && version !== ""
        ? version
        : target !== "null"
          ? target
          : undefined;
    if (elegida === undefined || !SEMVER_RE.test(elegida)) {
      fail("release released requiere una versión SemVer objetivo.", EXIT_INVARIANT);
    }
    if (target === "null" || elegida !== target) {
      fail("released_in debe coincidir con target_release.", EXIT_INVARIANT);
    }
    text = replaceFrontmatterField(text, "released_in", elegida);
  } else if (version !== undefined) {
    // Ojo: la referencia sale aquí con **2**, no con 3 como el resto de los
    // errores de esta rama. Es una incoherencia suya, y se conserva a propósito:
    // un script que hoy distinga «error de uso» de «transición ilegal» por el
    // código seguiría funcionando. Corregirlo sería una divergencia observable
    // disfrazada de mejora.
    fail("--version no aplica a release not_applicable.", EXIT_SCHEMA);
  }

  if (
    to === "not_applicable" &&
    (document.fields.target_release !== "null" || document.fields.released_in !== "null")
  ) {
    fail("not_applicable exige target_release y released_in null.", EXIT_INVARIANT);
  }

  text = replaceFrontmatterField(text, "release_status", to);
  return { text, details: `Release: ${current} -> ${to}.` };
}

// ── Punto ───────────────────────────────────────────────────────────────────

function applyPoint(document: ParsedTicket, request: TransitionRequest): Plan {
  assertNoExtraFlags(request);
  const { to, pointId, reason } = request;

  if (pointId === undefined || pointId === "") {
    fail("--entity point requiere --point-id.");
  }

  const puntos = (document.blocks.Puntos ?? []).map((punto) => ({ ...punto }));
  const punto = puntos.find((candidato) => candidato.id === pointId);
  if (punto === undefined) {
    fail("El punto indicado no existe.", EXIT_INVARIANT);
  }

  const current = String(punto.status);
  assertTransition("point", current, to);

  const esTerminal = TERMINAL_POINT_STATES.includes(
    to as (typeof TERMINAL_POINT_STATES)[number],
  );

  if (esTerminal) {
    const motivo = reason === undefined ? "" : validateText(reason, "reason");
    if (motivo === "") {
      fail("Los estados terminales del punto requieren --reason.", EXIT_INVARIANT);
    }
    punto.terminal_reason = motivo;
  } else if (reason !== undefined) {
    fail("--reason solo aplica a estados terminales de punto.", EXIT_INVARIANT);
  }

  if (to === "verified") {
    const retests = (document.blocks.Retests ?? []).filter(
      (entrada) => entrada.point_id === pointId,
    );
    const ultimo = retests[retests.length - 1];
    if (retests.length === 0 || ultimo?.result !== "approved" || !ultimo?.po_confirmation) {
      fail("verified requiere un retest aprobado y confirmado por el PO.", EXIT_INVARIANT);
    }
  }

  punto.status = to;
  const text = replaceBlock(document.text, "Puntos", puntos);
  return { text, details: `${pointId}: ${current} -> ${to}.` };
}
