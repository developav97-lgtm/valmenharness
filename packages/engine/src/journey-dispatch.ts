/**
 * Frontera única que inicia trabajo desde una jornada.
 *
 * La selección, la capacidad y la autonomía permanecen en módulos separados:
 * este módulo las compone en el único orden seguro. No acepta un ejecutor ni
 * una ruta libres; ambos nacen del proyecto ya autorizado y de su política.
 */
import { createHash } from "node:crypto";

import { createExecutionIdentity } from "@valmen/core";

import {
  runAutonomous,
  type AutonomousExecutorResult,
  type AutonomousRunResult,
} from "./autonomous-run.js";
import { autonomousConfig } from "./discovery.js";
import { motivoDeTope } from "./journey-limits.js";
import { resolverModeloDeFase } from "./journey-phases.js";
import { recordExecutionActivity } from "./execution-activity.js";
import {
  claimMachineCapacity,
  reconcileMachineCapacity,
  releaseMachineCapacity,
} from "./machine-capacity.js";
import { type AuthorizedProject } from "./project-resolution.js";
import { selectJourneyTickets, type JourneySelection } from "./journey-selection.js";

export type JourneyDispatchStatus = "dispatched" | "not-dispatched" | "already-dispatched";

export interface JourneyDispatchRequest {
  /** El proyecto se resuelve antes de llegar a la frontera de despacho. */
  readonly project: AuthorizedProject;
  /** Hogar de la máquina donde vive la reserva compartida; es inyectable para pruebas. */
  readonly home: string;
  readonly journeyId: string;
  readonly at: string;
  /** Identidad aportada por la puerta autorizada, nunca una ruta o un proceso. */
  readonly executionId: string;
  readonly attemptId: string;
  /** Borde del proceso externo, inyectable para no lanzar agentes durante pruebas. */
  readonly execute?: ((command: { readonly command: string; readonly args: readonly string[] }) => AutonomousExecutorResult) | undefined;
  readonly now?: (() => Date) | undefined;
}

export interface JourneyDispatchResult {
  readonly status: JourneyDispatchStatus;
  readonly selection: JourneySelection;
  readonly ticketId: string | null;
  readonly detail: string;
  readonly autonomous?: AutonomousRunResult | undefined;
}

/**
 * Inicia como máximo una ejecución de la jornada.
 *
 * La reserva ocurre antes del ejecutor. La transición de `runAutonomous()` es
 * todavía quien resuelve de forma definitiva la carrera por el ticket: si otra
 * solicitud llegó primero, esta llamada libera exclusivamente la reserva que
 * acababa de crear y nunca llega a invocar un segundo ejecutor.
 */
export async function dispatchJourney(request: JourneyDispatchRequest): Promise<JourneyDispatchResult> {
  const policy = autonomousConfig(request.project.root);
  const capacity = reconcileMachineCapacity({ home: request.home });
  const executor = policy.enabled && policy.executor !== null ? policy.executor.id : undefined;
  const selection = selectJourneyTickets({
    project: request.project,
    journeyId: request.journeyId,
    at: request.at,
    ...(executor === undefined ? {} : { executor }),
    availableSlots: capacity.availableSlots,
  });

  if (!policy.enabled) {
    return withoutStart(selection, "La autonomía está apagada en la política del proyecto.");
  }
  if (policy.executor === null) {
    return withoutStart(selection, "La autonomía no declara un ejecutor seguro.");
  }
  // Los topes de la política se aplican antes de reservar nada (R-JORN-007).
  const tope = motivoDeTope({ project: request.project, home: request.home, politica: policy, en: request.at });
  if (tope !== null && selection.dispatchCandidate !== null) {
    const ya = capacity.reservations.some(
      (reservation) =>
        reservation.projectId === request.project.projectId &&
        reservation.ticketId === selection.dispatchCandidate?.ticketId &&
        reservation.executionId === request.executionId &&
        reservation.attemptId === request.attemptId,
    );
    if (!ya) return withoutStart(selection, tope);
  }
  const candidate = selection.dispatchCandidate;
  if (candidate === null) {
    const manual = selection.manualCandidate;
    const sameReservation = manual !== null && capacity.reservations.some(
      (reservation) =>
        reservation.projectId === request.project.projectId &&
        reservation.ticketId === manual.ticketId &&
        reservation.executionId === request.executionId &&
        reservation.attemptId === request.attemptId,
    );
    if (sameReservation) {
      return Object.freeze({
        status: "already-dispatched",
        selection,
        ticketId: manual.ticketId,
        detail: "La misma identidad ya conserva una reserva; no se inicia un segundo ejecutor.",
      });
    }
    return withoutStart(selection, "La jornada no tiene un candidato autorizado con capacidad disponible.");
  }

  const identity = createExecutionIdentity({
    projectId: request.project.projectId,
    ticketId: candidate.ticketId,
    executionId: request.executionId,
  });
  const reservation = claimMachineCapacity({
    home: request.home,
    project: request.project,
    identity,
    attemptId: request.attemptId,
  });
  if (!reservation.granted) {
    return withoutStart(selection, "La capacidad compartida se agotó antes de iniciar el despacho.");
  }
  if (!reservation.created) {
    return Object.freeze({
      status: "already-dispatched",
      selection,
      ticketId: candidate.ticketId,
      detail: "La misma identidad ya conserva una reserva; no se inicia un segundo ejecutor.",
    });
  }

  recordActivity(request, identity, "started");
  try {
    const modelo = resolverModeloDeFase(request.project.root, "implementation");
    const autonomous = await runAutonomous({
      paths: request.project.paths,
      ticketId: candidate.ticketId,
      fase: "implementation",
      ...(modelo === null ? {} : { modelo }),
      ...(request.execute === undefined ? {} : { execute: request.execute }),
      ...(request.now === undefined ? {} : { now: request.now }),
    });
    recordActivity(request, identity, autonomous.status === "delivered" ? "finished" : "failed");
    return Object.freeze({
      status: "dispatched",
      selection,
      ticketId: candidate.ticketId,
      detail: autonomous.detail,
      autonomous,
    });
  } catch (error) {
    // No hubo una corrida que conservar: la carrera perdió antes de invocar al
    // ejecutor. Solo esta identidad recién creada puede liberar su reserva.
    recordActivity(request, identity, "failed");
    releaseMachineCapacity({
      home: request.home,
      project: request.project,
      identity,
      attemptId: request.attemptId,
    });
    throw error;
  }
}

function withoutStart(selection: JourneySelection, detail: string): JourneyDispatchResult {
  return Object.freeze({ status: "not-dispatched", selection, ticketId: null, detail });
}

function recordActivity(
  request: JourneyDispatchRequest,
  identity: ReturnType<typeof createExecutionIdentity>,
  state: "started" | "finished" | "failed",
): void {
  recordExecutionActivity(request.project, {
    eventId: dispatchEventId(identity.ticketId, identity.executionId, request.attemptId, state),
    identity,
    attemptId: request.attemptId,
    state,
    source: "journey-dispatch",
    occurredAt: request.now?.().toISOString() ?? request.at,
  });
}

/** Mantiene los IDs portables y acotados aunque la puerta aporte IDs largos. */
export function dispatchEventId(ticketId: string, executionId: string, attemptId: string, state: string): string {
  // El ticket entra al digest: una jornada despacha varios tickets con la misma ejecución e
  // intento, y sin él el segundo ticket chocaba con el evento del primero.
  const digest = createHash("sha256")
    .update(`${ticketId}\u0000${executionId}\u0000${attemptId}\u0000${state}`)
    .digest("hex")
    .slice(0, 32);
  return `journey-dispatch-${state}-${digest}`;
}
