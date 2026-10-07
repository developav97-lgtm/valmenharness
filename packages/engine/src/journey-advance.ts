/**
 * El avance de la jornada: el borde que un disparador periódico invoca (R-JORN-002).
 *
 * No tiene lógica propia de despacho. La idempotencia ya vive en la reserva de capacidad y en
 * la selección de `dispatchJourney`; lo que se agrega aquí es una **identidad estable** —la
 * jornada— para que correrlo dos veces seguidas no despache un segundo ticket ni duplique el
 * primero, y un informe de lo que pasó. El avance no llama a ningún modelo: lo único que
 * lanza es el ejecutor que declara la política del proyecto, a través del despacho.
 */
import { appendApproval } from "./approval.js";
import { type AutonomousStopReceipt } from "./autonomous-stops.js";
import { dispatchJourney, type JourneyDispatchRequest } from "./journey-dispatch.js";
import { type EjecutorDePreparacion, despacharPreparacion } from "./journey-preparation.js";
import { type EntregaDeAviso } from "./journey-plan.js";
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
  /**
   * La fase que se avanza: `ejecucion` (la de siempre, tickets `approved`) o `preparacion`
   * (tickets en `intake` hasta `planned`, sin aprobar nada: R-JORN-003).
   */
  readonly fase?: "preparacion" | "ejecucion" | undefined;
  /** Solo preparación: borde del ejecutor con su entorno, y el envío del aviso de decisión. */
  readonly ejecutarPreparacion?: EjecutorDePreparacion | undefined;
  readonly notificar?: ((texto: string) => EntregaDeAviso) | undefined;
}

/** El aviso de una parada, en formato de opciones y efecto (R-JORN-007). */
export function avisoDeParada(parada: AutonomousStopReceipt): string {
  const detalle = parada.detail.replace(/\s+/g, " ").trim();
  return [
    `Decisión: ${parada.ticketId} — la jornada se detuvo por ${parada.reason}: ${detalle.length > 200 ? `${detalle.slice(0, 197)}...` : detalle}`,
    `A) Liberar y reintentar (valmen journey clear-stop --id ${parada.ticketId} --actor <tú>) → el despacho vuelve a elegirlo`,
    "B) Dejarlo parado → queda detenido hasta que lo revises; no se reintenta solo",
    "Recomiendo B: una parada no conviene reintentarla sin haber mirado su motivo.",
  ].join("\n");
}

/** Avisa una parada nueva y deja constancia para que el vigilante no la repita. */
function avisarParada(
  paths: AuthorizedProject["paths"],
  parada: AutonomousStopReceipt,
  notificar: (texto: string) => EntregaDeAviso,
  ahora: Date,
): void {
  const entrega = notificar(avisoDeParada(parada));
  if (entrega.delivered) {
    appendApproval(paths, {
      kind: "autonomous-stop-notice",
      receiptId: parada.id,
      ticketId: parada.ticketId,
      notifiedAt: ahora.toISOString(),
    });
  }
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

  if (request.fase === "preparacion") {
    const despacho = despacharPreparacion({
      project: request.project,
      home: request.home,
      journeyId,
      attemptId: `${INTENTO_DE_AVANCE}-preparacion`,
      ahora,
      ...(request.ejecutarPreparacion === undefined ? {} : { execute: request.ejecutarPreparacion }),
      ...(request.notificar === undefined ? {} : { notificar: request.notificar }),
    });
    if (despacho.resultado?.parada !== undefined && request.notificar !== undefined) {
      avisarParada(request.project.paths, despacho.resultado.parada, request.notificar, ahora);
    }
    return {
      estado:
        despacho.estado === "preparado"
          ? "despachado"
          : despacho.estado === "ya-despachado"
            ? "ya-despachado"
            : "sin-candidato",
      journeyId,
      ticketId: despacho.ticketId,
      detalle: despacho.resultado === null ? despacho.detalle : `${despacho.resultado.estado}: ${despacho.detalle}`,
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

  if (resultado.autonomous?.stop !== undefined && request.notificar !== undefined) {
    avisarParada(request.project.paths, resultado.autonomous.stop, request.notificar, ahora);
  }
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
