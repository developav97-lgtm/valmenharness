/**
 * Los topes de la jornada (R-JORN-007): el máximo por día y el máximo concurrente.
 *
 * La política los declara (`autonomous.limits`) y el despacho los aplica **antes** de reservar
 * capacidad. El conteo del día sale de la actividad `started` de las sesiones del proyecto,
 * que ya es la fuente de verdad: no se lleva un contador aparte que pueda desincronizarse.
 */
import { type AutonomousConfig } from "@valmen/adapter";

import { readExecutionEvents } from "./execution-events.js";
import { readMachineCapacity } from "./machine-capacity.js";
import { type AuthorizedProject } from "./project-resolution.js";

/** Las fuentes de actividad que cuentan como una sesión de la jornada. */
const FUENTES_DE_SESION = ["journey-dispatch", "journey-preparation"];

/** Cuántas sesiones inició el proyecto en el día (UTC) de `en`. */
export function sesionesDelDia(project: AuthorizedProject, en: string): number {
  const dia = en.slice(0, 10);
  return readExecutionEvents(project).filter(
    (evento) =>
      evento.kind === "activity.started" &&
      FUENTES_DE_SESION.includes(evento.source) &&
      evento.occurredAt.startsWith(dia),
  ).length;
}

/** Por qué no se puede iniciar otra sesión ahora, o `null` si se puede. */
export function motivoDeTope(request: {
  readonly project: AuthorizedProject;
  readonly home: string;
  readonly politica: AutonomousConfig;
  readonly en: string;
}): string | null {
  const { project, politica } = request;
  const hoy = sesionesDelDia(project, request.en);
  if (hoy >= politica.limits.maxPerDay) {
    return `Tope diario alcanzado: ${hoy} sesión(es) iniciadas hoy y el máximo por día es ${politica.limits.maxPerDay}.`;
  }
  const activas = readMachineCapacity({ home: request.home, project }).reservations.filter(
    (reserva) => reserva.projectId === project.projectId,
  ).length;
  if (activas >= politica.limits.maxConcurrent) {
    return `Tope concurrente alcanzado: ${activas} sesión(es) activas y el máximo concurrente es ${politica.limits.maxConcurrent}.`;
  }
  return null;
}
