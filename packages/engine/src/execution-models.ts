/**
 * Modelos declarados y observados por intento de ejecución.
 *
 * La configuración expresa intención; la observación expresa lo que informó
 * una sesión o transporte. Ninguna lectura completa la otra cuando falta.
 */
import {
  createExecutionIdentity,
  createModelReference,
  type ExecutionIdentity,
  type ModelReference,
} from "@valmen/core";

import {
  appendExecutionEvent,
  readExecutionEvents,
  type AppendExecutionEventResult,
  type ExecutionEvent,
} from "./execution-events.js";
import { type AuthorizedProject } from "./project-resolution.js";

/** Dato de modelo que un adaptador declara para un intento. */
export interface ExecutionModelInput {
  readonly eventId: string;
  readonly identity: ExecutionIdentity;
  readonly attemptId: string;
  readonly model: ModelReference;
  readonly source: string;
  readonly occurredAt: string;
}

/** Dato de modelo persistido, con orden estable de recepción. */
export interface ExecutionModel extends Readonly<ExecutionModelInput> {
  readonly receivedAt: string;
  readonly cursor: number;
}

/** Declara el modelo configurado sin afirmar que haya sido usado. */
export function declareConfiguredExecutionModel(
  project: AuthorizedProject,
  input: ExecutionModelInput,
  options: { readonly receivedAt?: string | undefined } = {},
): AppendExecutionEventResult {
  return appendExecutionEvent(
    project,
    {
      ...input,
      identity: createExecutionIdentity(input.identity),
      model: createModelReference(input.model),
      kind: "model.configured",
    },
    options,
  );
}

/** Observa un modelo efectivo sin deducirlo de la configuración. */
export function observeEffectiveExecutionModel(
  project: AuthorizedProject,
  input: ExecutionModelInput,
  options: { readonly receivedAt?: string | undefined } = {},
): AppendExecutionEventResult {
  return appendExecutionEvent(
    project,
    {
      ...input,
      identity: createExecutionIdentity(input.identity),
      model: createModelReference(input.model),
      kind: "model.observed",
    },
    options,
  );
}

/** Lee únicamente las declaraciones de configuración, sin inferencias. */
export function readConfiguredExecutionModels(
  project: AuthorizedProject,
  identity: ExecutionIdentity,
  attemptId?: string,
): readonly ExecutionModel[] {
  return readExecutionModels(project, identity, "model.configured", attemptId);
}

/** Lee únicamente observaciones efectivas, preservando cada tramo recibido. */
export function readEffectiveExecutionModels(
  project: AuthorizedProject,
  identity: ExecutionIdentity,
  attemptId?: string,
): readonly ExecutionModel[] {
  return readExecutionModels(project, identity, "model.observed", attemptId);
}

function readExecutionModels(
  project: AuthorizedProject,
  identity: ExecutionIdentity,
  kind: "model.configured" | "model.observed",
  attemptId?: string,
): readonly ExecutionModel[] {
  const validated = createExecutionIdentity(identity);
  if (validated.projectId !== project.projectId) {
    throw new Error("La identidad de modelo no pertenece al proyecto autorizado.");
  }
  return readExecutionEvents(project)
    .filter((event) => sameIdentity(event.identity, validated))
    .filter((event) => event.kind === kind && event.model !== undefined)
    .filter((event) => attemptId === undefined || event.attemptId === attemptId)
    .flatMap((event) => toExecutionModel(event));
}

function toExecutionModel(event: ExecutionEvent): ExecutionModel[] {
  if (event.model === undefined) return [];
  return [
    Object.freeze({
      eventId: event.eventId,
      identity: event.identity,
      attemptId: event.attemptId,
      model: event.model,
      source: event.source,
      occurredAt: event.occurredAt,
      receivedAt: event.receivedAt,
      cursor: event.cursor,
    }),
  ];
}

function sameIdentity(left: ExecutionIdentity, right: ExecutionIdentity): boolean {
  return (
    left.projectId === right.projectId &&
    left.ticketId === right.ticketId &&
    left.executionId === right.executionId
  );
}
