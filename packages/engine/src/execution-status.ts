/** Proyección conservadora de la actividad de una ejecución. */
import { parseTicket, type ExecutionIdentity } from "@valmen/core";

import { findTicket } from "./discovery.js";
import { readExecutionActivity, type ExecutionActivity, type ExecutionActivityState } from "./execution-activity.js";
import { type AuthorizedProject } from "./project-resolution.js";

export type ExecutionLiveness = "active" | "waiting" | "finished" | "failed" | "unknown";
export interface ExecutionStatus extends Readonly<ExecutionIdentity> {
  readonly validatedStatus: string | null;
  readonly currentActivity: ExecutionActivity | null;
  readonly liveness: ExecutionLiveness;
}

/**
 * Separa el workflow validado de la última señal de trabajo y su liveness.
 * La ausencia de señal final no es un fallo: conserva el último estado abierto
 * o devuelve unknown si nunca llegó actividad.
 */
export function readExecutionStatus(project: AuthorizedProject, identity: ExecutionIdentity): ExecutionStatus {
  if (identity.projectId !== project.projectId) throw new Error("La identidad no pertenece al proyecto autorizado.");
  const located = findTicket(project.paths, identity.ticketId);
  const validatedStatus = located === undefined ? null : String(parseTicket(located.text).fields.workflow_status);
  const activity = readExecutionActivity(project, identity);
  const currentActivity = activity.at(-1) ?? null;
  return Object.freeze({ ...identity, validatedStatus, currentActivity, liveness: livenessOf(currentActivity?.state) });
}

function livenessOf(state: ExecutionActivityState | undefined): ExecutionLiveness {
  if (state === "started" || state === "active") return "active";
  if (state === "waiting") return "waiting";
  if (state === "finished") return "finished";
  if (state === "failed") return "failed";
  return "unknown";
}
