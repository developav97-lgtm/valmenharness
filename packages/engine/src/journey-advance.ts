/**
 * El avance de la jornada: el borde que un disparador periódico invoca (R-JORN-002).
 *
 * No tiene lógica propia de despacho. La idempotencia ya vive en la reserva de capacidad y en
 * la selección de `dispatchJourney`; lo que se agrega aquí es una **identidad estable** —la
 * jornada— para que correrlo dos veces seguidas no despache un segundo ticket ni duplique el
 * primero, y un informe de lo que pasó. El avance no llama a ningún modelo: lo único que
 * lanza es el ejecutor que declara la política del proyecto, a través del despacho.
 */
import { dispatchJourney, type JourneyDispatchRequest } from "./journey-dispatch.js";
import { readJourneys } from "./journeys.js";
import { type AuthorizedProject } from "./project-resolution.js";

export type EstadoDeAvance = "sin-jornada" | "despachado" | "ya-despachado" | "sin-candidato";

export interface AvanceDeJornada {
  readonly estado: EstadoDeAvance;
  readonly journeyId: string;
  readonly ticketId: string | null;
  readonly detalle: string;
}

export interface AvanzarJornadaRequest {
  readonly project: AuthorizedProject;
  readonly home: string;
  /** La jornada a avanzar; sin ella, la del día (`JOR-<AAAAMMDD>`). */
  readonly journeyId?: string | undefined;
  readonly ahora?: (() => Date) | undefined;
  /** Borde del proceso externo: lo único que se invoca, inyectable para no lanzar agentes. */
  readonly execute?: JourneyDispatchRequest["execute"];
}

/** El identificador de la jornada de un día. */
export function jornadaDelDia(fecha: Date): string {
  return `JOR-${fecha.toISOString().slice(0, 10).replaceAll("-", "")}`;
}

/** El identificador del intento: uno por jornada, para que el segundo avance reconozca al primero. */
const INTENTO_DE_AVANCE = "avance-1";

/** Avanza la jornada una vez. */
export async function avanzarJornada(request: AvanzarJornadaRequest): Promise<AvanceDeJornada> {
  const ahora = request.ahora?.() ?? new Date();
  const journeyId = request.journeyId ?? jornadaDelDia(ahora);

  if (!readJourneys(request.project).some((jornada) => jornada.journeyId === journeyId)) {
    return {
      estado: "sin-jornada",
      journeyId,
      ticketId: null,
      detalle:
        `No hay una jornada ${journeyId} en el proyecto ${request.project.projectId}: ` +
        "se arma con `valmen journey plan`. No se hizo nada.",
    };
  }

  const resultado = await dispatchJourney({
    project: request.project,
    home: request.home,
    journeyId,
    at: ahora.toISOString(),
    executionId: journeyId,
    attemptId: INTENTO_DE_AVANCE,
    ...(request.execute === undefined ? {} : { execute: request.execute }),
    now: () => ahora,
  });

  const estado: EstadoDeAvance =
    resultado.status === "dispatched"
      ? "despachado"
      : resultado.status === "already-dispatched"
        ? "ya-despachado"
        : "sin-candidato";
  const bloqueados =
    estado === "sin-candidato" && resultado.selection.blocked.length > 0
      ? ` Bloqueados: ${resultado.selection.blocked
          .map((b) => `${b.ticketId} (${b.reasons.join(", ")})`)
          .join("; ")}.`
      : "";
  return { estado, journeyId, ticketId: resultado.ticketId, detalle: `${resultado.detail}${bloqueados}` };
}
