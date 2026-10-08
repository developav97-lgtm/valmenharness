/**
 * Armar la jornada del día (R-JORN-001).
 *
 * Las piezas existían separadas: el historial de jornadas, la selección de candidatos, la
 * política de autorización y el canal de avisos. Faltaba la que las une al **armar** el día:
 * elegir los tickets, escribirlos como una jornada y avisar el plan. No despacha nada ni
 * reserva capacidad: programar un día no es ejecutarlo, y por eso no crea jobs de cron por
 * ticket.
 *
 * Repetir el armado el mismo día **revisa** la jornada —una foto completa nueva, que es como
 * el historial ya conserva las decisiones anteriores— y nunca la duplica.
 */
import { EXIT_INVARIANT, EXIT_SCHEMA, fail, parseTicket } from "@valmen/core";

import { ordenDelGrafo } from "./delegation.js";
import { autonomousConfig, findTicket } from "./discovery.js";
import { jornadaVigente, ticketsPendientesDeJornada } from "./journey-advance.js";
import { readJourneyAuthorization } from "./journey-authorization.js";
import {
  type JourneyTicketInput,
  createJourney,
  readJourneys,
  reviseJourney,
} from "./journeys.js";
import { type AuthorizedProject } from "./project-resolution.js";

/** El resultado de enviar el aviso: el canal real lo da el CLI, las pruebas lo simulan. */
export interface EntregaDeAviso {
  readonly delivered: boolean;
  readonly detail: string;
}

export interface ArmarJornadaRequest {
  readonly project: AuthorizedProject;
  /** Una feature (sus tickets en orden de dependencias) o una lista de tickets en el orden dado. */
  readonly feature?: string | undefined;
  readonly tickets?: readonly string[] | undefined;
  /** Cuántos tickets entran al día; sin tope entran todos los pendientes. */
  readonly maximo?: number | undefined;
  readonly ahora?: (() => Date) | undefined;
  /** Envía el plan del día; su fallo no deshace la escritura. */
  readonly notificar?: ((texto: string) => EntregaDeAviso) | undefined;
}

export interface JornadaArmada {
  readonly journeyId: string;
  /** `true` si la jornada del día ya existía y se revisó en vez de crearse. */
  readonly revisada: boolean;
  readonly tickets: readonly { readonly ticketId: string; readonly title: string; readonly dependsOn: readonly string[] }[];
  readonly omitidos: readonly string[];
  readonly executor: string;
  readonly plan: string;
  readonly aviso: EntregaDeAviso | null;
  /** Los tickets pendientes que la jornada nueva heredó de la anterior; `null` si no heredó. */
  readonly heredados: { readonly desde: string; readonly tickets: readonly string[] } | null;
}

/** El mensaje cuando la política no autoriza a ningún ejecutor: dice qué declarar. */
const SIN_AUTORIZACION =
  "No se arma la jornada: la política del proyecto no autoriza a ningún ejecutor. Declara " +
  "`execution.dispatch-executors` y `autonomous.executor` (con `autonomous.enabled: true`) en " +
  ".valmen/config.yaml; armar una jornada no concede permisos.";

function fechaCompacta(fecha: Date): string {
  return fecha.toISOString().slice(0, 10).replaceAll("-", "");
}

/** El texto del plan del día. */
export function renderPlanDelDia(
  journeyId: string,
  tickets: JornadaArmada["tickets"],
  executor: string,
  revisada: boolean,
  heredados: JornadaArmada["heredados"] = null,
): string {
  const lineas = tickets.map((ticket, indice) => {
    const deps = ticket.dependsOn.length === 0 ? "" : ` (tras ${ticket.dependsOn.join(", ")})`;
    return `${indice + 1}. ${ticket.ticketId} — ${ticket.title}${deps}`;
  });
  return (
    `Plan del día ${journeyId}${revisada ? " (revisado)" : ""}: ${tickets.length} ticket(s), ` +
    `ejecutor ${executor}.\n${lineas.join("\n")}` +
    (heredados === null ? "" : `\nHeredados de ${heredados.desde}: ${heredados.tickets.join(", ")}`)
  );
}

/** Arma y escribe la jornada del día; devuelve lo escrito y el resultado del aviso. */
export function armarJornada(request: ArmarJornadaRequest): JornadaArmada {
  const { project } = request;
  if ((request.feature === undefined) === (request.tickets === undefined)) {
    fail("Armar una jornada necesita una feature o una lista de tickets, no las dos ni ninguna.", EXIT_SCHEMA);
  }
  if (request.maximo !== undefined && (!Number.isSafeInteger(request.maximo) || request.maximo < 1)) {
    fail("El máximo de tickets de la jornada debe ser un entero de al menos 1.", EXIT_SCHEMA);
  }

  // La política manda: sin ejecutor autorizado no se arma nada.
  const politica = autonomousConfig(project.root);
  const executor = politica.enabled && politica.executor !== null ? politica.executor.id : null;
  if (executor === null || !readJourneyAuthorization(project).canDispatch(executor)) {
    fail(SIN_AUTORIZACION, EXIT_INVARIANT);
  }

  const pedidos =
    request.feature !== undefined
      ? ordenDelGrafo(project.paths, request.feature)
      : (request.tickets ?? []).map((id) => ({ id, dependsOn: [] as readonly string[] }));

  const omitidos: string[] = [];
  const elegidos: { id: string; title: string; dependsOn: readonly string[] }[] = [];
  for (const pedido of pedidos) {
    const ubicado = findTicket(project.paths, pedido.id);
    if (ubicado === undefined) {
      omitidos.push(`${pedido.id} (no existe en el registro)`);
      continue;
    }
    const documento = parseTicket(ubicado.text);
    if (documento.fields.workflow_status === "closed") {
      omitidos.push(`${pedido.id} (ya cerrado)`);
      continue;
    }
    elegidos.push({ id: pedido.id, title: documento.fields.title, dependsOn: pedido.dependsOn });
  }

  // La jornada de un día nuevo hereda los pendientes de la vigente anterior, antes que los pedidos;
  // revisar la del día no hereda nada. El tope aplica a la lista combinada.
  const ahora = request.ahora?.() ?? new Date();
  const journeyId = `JOR-${fechaCompacta(ahora)}`;
  const revisada = readJourneys(project).some((jornada) => jornada.journeyId === journeyId);
  let heredados: JornadaArmada["heredados"] = null;
  if (!revisada) {
    const anteriorId = jornadaVigente(project, ahora);
    const anterior = readJourneys(project).find((jornada) => jornada.journeyId === anteriorId);
    if (anterior !== undefined) {
      const pendientes = new Set(ticketsPendientesDeJornada(project, anterior));
      const pedidosIds = new Set(elegidos.map((ticket) => ticket.id));
      const previos: typeof elegidos = [];
      for (const entrada of [...anterior.tickets].sort((a, b) => a.order - b.order)) {
        if (!pendientes.has(entrada.ticketId) || pedidosIds.has(entrada.ticketId)) continue;
        const ubicado = findTicket(project.paths, entrada.ticketId);
        if (ubicado === undefined) continue;
        previos.push({
          id: entrada.ticketId,
          title: parseTicket(ubicado.text).fields.title,
          dependsOn: entrada.dependsOn,
        });
      }
      if (previos.length > 0) {
        elegidos.unshift(...previos);
        heredados = { desde: anterior.journeyId, tickets: previos.map((ticket) => ticket.id) };
      }
    }
  }
  const delDia = request.maximo === undefined ? elegidos : elegidos.slice(0, request.maximo);
  if (delDia.length === 0) {
    fail("No hay tickets pendientes para armar la jornada.", EXIT_INVARIANT);
  }

  const enLaJornada = new Set(delDia.map((ticket) => ticket.id));
  const entradas: JourneyTicketInput[] = delDia.map((ticket, indice) => ({
    ticketId: ticket.id,
    // El historial exige enteros positivos: la posición del día, desde 1.
    order: indice + 1,
    priority: indice + 1,
    // Solo cuentan las dependencias que van en la jornada: las demás ya las evalúa la
    // selección contra el registro (un ticket con una dependencia sin cerrar no sale).
    dependsOn: ticket.dependsOn.filter((dependencia) => enLaJornada.has(dependencia)),
    start: { condition: "dependencies" },
    authorizationIds: [executor],
  }));

  const ocurrido = ahora.toISOString();
  const entrada = {
    revisionId: `${journeyId}-${revisada ? `rev-${ahora.getTime()}` : "alta"}`,
    journeyId,
    occurredAt: ocurrido,
    tickets: entradas,
  };
  if (revisada) reviseJourney(project, entrada, { receivedAt: ocurrido });
  else createJourney(project, entrada, { receivedAt: ocurrido });

  const tickets = delDia.map((ticket) => ({
    ticketId: ticket.id,
    title: ticket.title,
    dependsOn: ticket.dependsOn.filter((dependencia) => enLaJornada.has(dependencia)),
  }));
  const plan = renderPlanDelDia(journeyId, tickets, executor, revisada, heredados);

  // El aviso va **después** de escribir: si el canal falla, la jornada ya existe y el
  // resultado lo dice; deshacerla por un aviso perdido sería castigar el trabajo hecho.
  const aviso = request.notificar === undefined ? null : request.notificar(plan);
  return { journeyId, revisada, tickets, omitidos, executor, plan, aviso, heredados };
}
