/**
 * Contrato común de ejecución para las puertas del harness.
 *
 * CLI, MCP y Mission Control no deben recomponer identidad, actividad y replay
 * cada uno por su cuenta. Esta fábrica recibe una única vez el proyecto ya
 * autorizado y entrega operaciones puras respecto a la puerta que las consume.
 */
import { type ExecutionIdentity } from "@valmen/core";

import {
  readExecutionActivity,
  recordExecutionActivity,
  type ExecutionActivity,
  type ExecutionActivityInput,
} from "./execution-activity.js";
import { replayExecutionEvents, type AppendExecutionEventResult, type ExecutionReplay } from "./execution-events.js";
import { type AuthorizedProject } from "./project-resolution.js";

/** Operaciones de ejecución que comparten todas las puertas. */
export interface ExecutionContract {
  readonly projectId: string;
  recordActivity(
    input: ExecutionActivityInput,
    options?: { readonly receivedAt?: string | undefined },
  ): AppendExecutionEventResult;
  readActivity(identity: ExecutionIdentity, attemptId?: string): readonly ExecutionActivity[];
  replay(): readonly ExecutionReplay[];
}

/**
 * Construye la fachada del proyecto autorizado.
 *
 * No resuelve rutas, perfiles ni credenciales: esa decisión ya ocurrió antes
 * en `resolveAuthorizedProject`. De esta forma cada puerta recibe exactamente
 * el mismo aislamiento, validaciones e historial persistido.
 */
export function createExecutionContract(project: AuthorizedProject): ExecutionContract {
  return Object.freeze({
    projectId: project.projectId,
    recordActivity: (
      input: ExecutionActivityInput,
      options: { readonly receivedAt?: string | undefined } = {},
    ) => recordExecutionActivity(project, input, options),
    readActivity: (identity: ExecutionIdentity, attemptId?: string) =>
      readExecutionActivity(project, identity, attemptId),
    replay: () => replayExecutionEvents(project),
  });
}
