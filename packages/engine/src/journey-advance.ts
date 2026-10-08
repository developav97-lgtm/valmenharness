/**
 * El avance de la jornada: hoy solo la preparación manual de planes (R-JORN-003).
 *
 * La ejecución desatendida (el despacho con `claude --print` que un disparador periódico
 * invocaba) se retiró: la jornada se ejecuta desde una sesión orquestadora. Se conserva la
 * identidad estable —la jornada— para que correr la preparación dos veces seguidas no duplique
 * el trabajo, la jornada vigente y los avisos de parada.
 */
import { parseTicket } from "@valmen/core";

import { appendApproval } from "./approval.js";
import { type AutonomousStopReceipt } from "./autonomous-stops.js";
import { findTicket } from "./discovery.js";
import { type EjecutorDePreparacion, despacharPreparacion } from "./journey-preparation.js";
import { type EntregaDeAviso } from "./journey-plan.js";
import { type Journey, readJourneys } from "./journeys.js";
import { type AuthorizedProject } from "./project-resolution.js";

export type EstadoDeAvance = "sin-jornada" | "despachado" | "ya-despachado" | "sin-candidato";

/** Lo que hizo una fase del avance. */
export interface AvanceDeFase {
  /** `ejecucion` queda solo para leer pasadas antiguas: ya nada la produce. */
  readonly fase: "ejecucion" | "preparacion";
  readonly estado: EstadoDeAvance;
  readonly ticketId: string | null;
  readonly detalle: string;
}

export interface AvanceDeJornada {
  /** El de la fase que corrió. */
  readonly estado: EstadoDeAvance;
  readonly journeyId: string;
  readonly ticketId: string | null;
  readonly detalle: string;
  /** Una entrada por fase que corrió: hoy solo la preparación. */
  readonly fases: readonly AvanceDeFase[];
}

export interface AvanzarJornadaRequest {
  readonly project: AuthorizedProject;
  readonly home: string;
  /** La jornada a avanzar; sin ella, la vigente (`jornadaVigente`). */
  readonly journeyId?: string | undefined;
  readonly ahora?: (() => Date) | undefined;
  /** La única fase viva es la preparación; se acepta nombrarla. */
  readonly fase?: "preparacion" | undefined;
  /** Borde del ejecutor con su entorno, y el envío del aviso de decisión. */
  readonly ejecutarPreparacion?: EjecutorDePreparacion | undefined;
  readonly notificar?: ((texto: string) => EntregaDeAviso) | undefined;
}

/** El aviso de una parada, en formato de opciones y efecto (R-JORN-007). */
export function avisoDeParada(parada: AutonomousStopReceipt): string {
  const detalle = parada.detail.replace(/\s+/g, " ").trim();
  return [
    `Decisión: ${parada.ticketId} — la jornada se detuvo por ${parada.reason}: ${detalle.length > 200 ? `${detalle.slice(0, 197)}...` : detalle}`,
    `A) Liberar y reintentar (valmen journey clear-stop --id ${parada.ticketId} --actor <tú>) → la preparación vuelve a elegirlo`,
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

/**
 * Los tickets de una jornada que existen en el registro y no están cerrados.
 *
 * Un ticket que ya no existe no cuenta como pendiente: no hay nada que avanzar en él.
 */
export function ticketsPendientesDeJornada(project: AuthorizedProject, jornada: Journey): string[] {
  const pendientes: string[] = [];
  for (const entrada of jornada.tickets) {
    const ubicado = findTicket(project.paths, entrada.ticketId);
    if (ubicado === undefined) continue;
    if (parseTicket(ubicado.text).fields.workflow_status !== "closed") pendientes.push(entrada.ticketId);
  }
  return pendientes;
}

/**
 * La jornada que el avance debe usar: la del día si existe; si no, la más reciente (por orden de
 * creación) que todavía tenga tickets sin cerrar; si no hay ninguna, `null`.
 */
export function jornadaVigente(project: AuthorizedProject, ahora: Date): string | null {
  const jornadas = readJourneys(project);
  const delDia = jornadaDelDia(ahora);
  if (jornadas.some((jornada) => jornada.journeyId === delDia)) return delDia;
  const vigente = [...jornadas].reverse().find((jornada) => ticketsPendientesDeJornada(project, jornada).length > 0);
  return vigente?.journeyId ?? null;
}

/** El identificador del intento: uno por jornada, para que el segundo avance reconozca al primero. */
const INTENTO_DE_AVANCE = "avance-1";

/** Avanza la jornada una vez: prepara los planes (de `intake` a `planned`, sin aprobar nada). */
export async function avanzarJornada(request: AvanzarJornadaRequest): Promise<AvanceDeJornada> {
  const ahora = request.ahora?.() ?? new Date();
  // Un `journeyId` explícito se respeta tal cual, sin búsqueda.
  const journeyId = request.journeyId ?? jornadaVigente(request.project, ahora) ?? jornadaDelDia(ahora);

  if (!readJourneys(request.project).some((jornada) => jornada.journeyId === journeyId)) {
    const ultima = readJourneys(request.project).at(-1);
    const terminada =
      request.journeyId === undefined && ultima !== undefined
        ? ` La jornada más reciente, ${ultima.journeyId}, no tiene tickets pendientes: está terminada.`
        : "";
    const detalle =
      `No hay una jornada ${journeyId} en el proyecto ${request.project.projectId}: ` +
      `se arma con \`valmen journey plan\`.${terminada} No se hizo nada.`;
    return { estado: "sin-jornada", journeyId, ticketId: null, detalle, fases: [] };
  }

  const fase = avanzarPreparacion(request, journeyId, ahora);
  return { estado: fase.estado, journeyId, ticketId: fase.ticketId, detalle: fase.detalle, fases: [fase] };
}

function avanzarPreparacion(request: AvanzarJornadaRequest, journeyId: string, ahora: Date): AvanceDeFase {
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
    fase: "preparacion",
    estado:
      despacho.estado === "preparado"
        ? "despachado"
        : despacho.estado === "ya-despachado"
          ? "ya-despachado"
          : "sin-candidato",
    ticketId: despacho.ticketId,
    detalle:
      (despacho.resultado === null ? despacho.detalle : `${despacho.resultado.estado}: ${despacho.detalle}`) +
      (despacho.omitidos.length === 0
        ? ""
        : ` Omitidos: ${despacho.omitidos.map((o) => `${o.ticketId} (${o.motivo})`).join("; ")}.`),
  };
}
