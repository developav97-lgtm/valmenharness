/**
 * La fase de preparación de la jornada (R-JORN-003): de `intake` a `planned`, y se detiene.
 *
 * El despacho de ejecución solo toca tickets ya aprobados. La preparación es otra fase, con
 * otro prompt y otras verificaciones, y con una prohibición que lo define: **no aprueba nada**.
 * El ejecutor corre con `VALMEN_UNATTENDED=1` en su entorno, así que no puede registrar la
 * aprobación del plan (R-CTRL-001); y lo que importa no se toma de su palabra: al terminar se
 * lee del registro y del árbol de trabajo.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { createExecutionIdentity, parseTicket } from "@valmen/core";

import { autonomousExecutorCommand, razonesDePolitica, type AutonomousExecutorCommand } from "./autonomous-run.js";
import { type AutonomousStopReceipt, paradasActivas, recordAutonomousStop } from "./autonomous-stops.js";
import { autonomousConfig, findTicket, type RegistryPaths } from "./discovery.js";
import { recordExecutionActivity } from "./execution-activity.js";
import { motivoDeTope } from "./journey-limits.js";
import { registrarFase, resolverDespachoDeFase } from "./journey-phases.js";
import { readJourneys } from "./journeys.js";
import {
  claimMachineCapacity,
  reconcileMachineCapacity,
  releaseMachineCapacity,
} from "./machine-capacity.js";
import { dependenciasEnGrafos } from "./materialize.js";
import { allDocuments } from "./mutate.js";
import { aprobacionDePlanVigente, UNATTENDED_ENV } from "./plan-approval.js";
import { type EntregaDeAviso } from "./journey-plan.js";
import { type AuthorizedProject } from "./project-resolution.js";
import { readReceipts, veredictoDeCompuerta } from "./receipts.js";

export type EstadoDePreparacion =
  | "plan-listo"
  | "decision-pendiente"
  | "ejecutor-fallo"
  | "verificacion-fallo"
  | "no-autorizado"
  | "no-elegible";

export interface ResultadoDePreparacion {
  readonly ticketId: string;
  readonly estado: EstadoDePreparacion;
  readonly detalle: string;
  /** `true` si el ejecutor superó el tiempo máximo y se cortó. */
  readonly timedOut?: boolean;
  /** La parada que quedó registrada, si el fallo la causó (R-JORN-007). */
  readonly parada?: AutonomousStopReceipt;
}

export type EjecutorDePreparacion = (
  comando: AutonomousExecutorCommand,
  entorno: Readonly<Record<string, string>>,
) => { readonly status: number; readonly stdout: string; readonly stderr: string; readonly timedOut?: boolean };

export interface PrepararTicketRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly execute?: EjecutorDePreparacion | undefined;
  readonly notificar?: ((texto: string) => EntregaDeAviso) | undefined;
  readonly ahora?: (() => Date) | undefined;
}

/**
 * El prompt de la fase de preparación.
 *
 * No ordena aprobar nada —ni una compuerta, ni el plan— ni mover el ticket a `approved`: la
 * aprobación es de una persona (R-JORN-010). Pide solo transiciones legales de la fase.
 */
export function promptDePreparacion(ticketId: string): string {
  return [
    `Prepara exclusivamente el ticket ${ticketId} en el registro del proyecto.`,
    `Empieza con \`valmen resume --id ${ticketId}\` y haz el paso que devuelva.`,
    "Lee el ticket, AGENTS.md y las skills que el paso nombre antes de escribir.",
    "Escribe el diagnóstico, el plan y los criterios en el ticket; valida con `valmen validate`.",
    "Pasa el ticket a `analyzed` y corre la compuerta `analysis` con `--evaluator cascade`; después, a `planned` y corre la compuerta `plan` con `--evaluator cascade`.",
    "Detente cuando el ticket esté en `planned` con los recibos de las dos compuertas.",
    "No modifiques código de la aplicación, no hagas commit ni push, y no dejes ninguna decisión humana escrita por ti.",
  ].join("\n");
}

function ejecutarDeVerdad(
  comando: AutonomousExecutorCommand,
  root: string,
  entorno: Readonly<Record<string, string>>,
  maxMinutes: number,
) {
  const resultado = spawnSync(comando.command, comando.args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...entorno },
    timeout: Math.round(maxMinutes * 60_000),
    killSignal: "SIGKILL",
  });
  const agotado = (resultado.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
  return {
    status: agotado ? 124 : (resultado.status ?? 1),
    stdout: resultado.stdout ?? "",
    stderr: agotado ? `El ejecutor superó el tiempo máximo de ${maxMinutes} minutos y se cortó.` : (resultado.stderr ?? ""),
    ...(agotado ? { timedOut: true } : {}),
  };
}

/** Las líneas de `git status` del árbol, o `null` si no es un repositorio. */
function estadoDelArbol(root: string): Set<string> | null {
  if (!existsSync(join(root, ".git"))) return null;
  const resultado = spawnSync("git", ["-C", root, "status", "--porcelain", "-uall"], { encoding: "utf8" });
  if (resultado.status !== 0) return null;
  return new Set(resultado.stdout.split("\n").filter((linea) => linea.trim() !== ""));
}

function fueraDelRegistro(antes: Set<string> | null, despues: Set<string> | null, ticketsDir: string): string[] {
  if (antes === null || despues === null) return [];
  const permitido = (ruta: string): boolean => ruta.startsWith(`${ticketsDir}/`) || ruta.startsWith(".valmen/");
  return [...despues]
    .filter((linea) => !antes.has(linea))
    .map((linea) => linea.slice(3).trim().replace(/^"|"$/g, ""))
    .filter((ruta) => !permitido(ruta));
}

/** El aviso de una decisión pendiente, en formato de opciones y efecto (R-JORN-003). */
export function avisoDeDecision(ticketId: string, compuerta: string, resultado: string, motivo: string): string {
  const resumen = motivo.replace(/\s+/g, " ").trim();
  const bloqueo = resultado === "block";
  return [
    `Decisión: ${ticketId} — la compuerta ${compuerta} quedó en ${resultado}: ${resumen.length > 200 ? `${resumen.slice(0, 197)}...` : resumen}`,
    bloqueo
      ? "A) Autorizar seguir pese al bloqueo → el ticket continúa y tu frase queda registrada"
      : "A) Aprobar la revisión → el ticket continúa a la siguiente fase y tu decisión queda registrada",
    "B) Pedir corrección → el agente rehace el artefacto y vuelve a correr la compuerta",
    bloqueo
      ? "Recomiendo B: un bloqueo señala algo comprobable que conviene corregir antes de seguir."
      : "Recomiendo A si el motivo es de redacción y no señala un hueco de contenido; si lo señala, B.",
  ].join("\n");
}

/** Prepara un ticket: lanza el ejecutor y verifica en código lo que dejó. */
export function prepararTicket(request: PrepararTicketRequest): ResultadoDePreparacion {
  const inicio = Date.now();
  let resultado = prepararTicketInner(request);
  if (resultado.estado === "no-autorizado") {
    const parada = recordAutonomousStop(request.paths, {
      ticketId: request.ticketId,
      reason: "executor-unauthorized",
      detail: resultado.detalle.replace(/\s+/g, " ").slice(0, 300),
      workflowStatus: "intake",
      now: request.ahora?.() ?? new Date(),
    });
    return { ...resultado, parada };
  }
  // Un fallo del ejecutor o una verificación que no se cumple dejan una parada con su motivo
  // y el ticket no se vuelve a elegir solo (R-JORN-007).
  if (resultado.estado === "ejecutor-fallo" || resultado.estado === "verificacion-fallo") {
    const actual = findTicket(request.paths, request.ticketId);
    const parada = recordAutonomousStop(request.paths, {
      ticketId: request.ticketId,
      reason:
        resultado.timedOut === true
          ? "executor-timeout"
          : resultado.estado === "ejecutor-fallo"
            ? "executor-failed"
            : "verification-failed",
      detail: resultado.detalle.replace(/\s+/g, " ").slice(0, 300),
      workflowStatus: actual === undefined ? "intake" : parseTicket(actual.text).fields.workflow_status,
      now: request.ahora?.() ?? new Date(),
    });
    resultado = { ...resultado, parada };
  }
  // El registro por fase de una sesión que sí se lanzó (R-JORN-006); las no elegibles y las
  // detenidas por el despacho no lanzan nada.
  if (resultado.estado !== "no-elegible" && resultado.estado !== "no-autorizado" && resultado.estado !== "ejecutor-fallo") {
    const despacho = resolverDespachoDeFase(request.paths.root, "analysis");
    if (despacho?.ok === true) {
      registrarFase(request.paths.root, {
        ticketId: request.ticketId,
        fase: "analysis",
        ejecutor: despacho.ejecutor,
        modelo: despacho.model,
        esfuerzo: despacho.effort,
        origenDelModelo: `${despacho.origen}: ${despacho.motivo}`,
        duracionMs: Date.now() - inicio,
        resultado: resultado.estado,
      });
    }
  }
  return resultado;
}

function prepararTicketInner(request: PrepararTicketRequest): ResultadoDePreparacion {
  const { paths, ticketId } = request;
  const politica = autonomousConfig(paths.root);
  const ubicado = findTicket(paths, ticketId);
  const no = (detalle: string): ResultadoDePreparacion => ({ ticketId, estado: "no-elegible", detalle });
  if (!politica.enabled || politica.executor === null) {
    return no("La autonomía está apagada o no declara un ejecutor seguro.");
  }
  if (ubicado === undefined) return no("El ticket no existe en el registro.");
  const ticket = parseTicket(ubicado.text);
  const razones: string[] = [];
  if (ticket.fields.workflow_status !== "intake") razones.push("no está en intake");
  razones.push(...razonesDePolitica(ticket.fields, politica));
  if (razones.length > 0) return no(`El ticket ${ticketId} no es elegible para preparar: ${razones.join(", ")}.`);

  // R-PERF-004: la preparación se lanza con el ejecutor del proveedor del rol agent-analysis y
  // su modelo; si ese ejecutor no está autorizado o el proveedor no es conocido, no se lanza nada.
  const despacho = resolverDespachoDeFase(paths.root, "analysis");
  if (despacho === null || !despacho.ok) {
    return {
      ticketId,
      estado: "no-autorizado",
      detalle: `El despacho de la fase analysis se detuvo: ${despacho === null ? "la autonomía no declara un ejecutor seguro" : despacho.motivo}.`,
    };
  }
  const executorDeFase = {
    id: despacho.ejecutor as typeof politica.executor.id,
    model: despacho.model,
    effort: despacho.effort as typeof politica.executor.effort,
  };
  const comando = autonomousExecutorCommand(executorDeFase, paths.root, promptDePreparacion(ticketId));
  const inicio = Date.now();
  const registrar = (resultado: string): void => {
    registrarFase(paths.root, {
      ticketId,
      fase: "analysis",
      ejecutor: executorDeFase.id,
      modelo: executorDeFase.model,
      esfuerzo: executorDeFase.effort,
      origenDelModelo: `${despacho.origen}: ${despacho.motivo}`,
      duracionMs: Date.now() - inicio,
      resultado,
    });
  };
  // El ejecutor hereda la marca de sesión desatendida: no puede registrar la aprobación del plan.
  const entorno = { [UNATTENDED_ENV]: "1" };
  const antes = estadoDelArbol(paths.root);
  const corrida = (request.execute ?? ((c, e) => ejecutarDeVerdad(c, paths.root, e, politica.limits.maxMinutes)))(comando, entorno);
  if (corrida.status !== 0 || corrida.timedOut === true) {
    registrar("ejecutor-fallo");
    return {
      ticketId,
      estado: "ejecutor-fallo",
      detalle: corrida.stderr || "El ejecutor terminó con error.",
      ...(corrida.timedOut === true ? { timedOut: true } : {}),
    };
  }

  // Lo que importa se lee del registro, no de lo que el ejecutor diga.
  const despues = findTicket(paths, ticketId);
  const actual = despues === undefined ? ticket : parseTicket(despues.text);
  if (aprobacionDePlanVigente(actual).estado === "vigente") {
    return { ticketId, estado: "verificacion-fallo", detalle: "El ejecutor dejó una aprobación del plan registrada: la aprobación es de una persona." };
  }
  const tocados = fueraDelRegistro(antes, estadoDelArbol(paths.root), paths.ticketsDir);
  if (tocados.length > 0) {
    return { ticketId, estado: "verificacion-fallo", detalle: `El ejecutor modificó archivos fuera del registro: ${tocados.join(", ")}.` };
  }

  const recibos = readReceipts(paths, ticketId);
  for (const compuerta of ["analysis", "plan"]) {
    const veredicto = veredictoDeCompuerta(recibos, compuerta);
    if (veredicto.tipo === "bloqueada" || veredicto.tipo === "espera-persona") {
      const aviso = avisoDeDecision(ticketId, compuerta, veredicto.recibo.outcome, veredicto.recibo.reason);
      const entrega = request.notificar?.(aviso);
      return {
        ticketId,
        estado: "decision-pendiente",
        detalle: `${aviso}${entrega === undefined ? "" : entrega.delivered ? "\n(Aviso enviado.)" : `\n(El aviso no se pudo enviar: ${entrega.detail}.)`}`,
      };
    }
    if (veredicto.tipo === "sin-recibo") {
      return { ticketId, estado: "verificacion-fallo", detalle: `Falta el recibo de la compuerta ${compuerta}.` };
    }
  }
  if (actual.fields.workflow_status !== "planned") {
    return { ticketId, estado: "verificacion-fallo", detalle: `El ticket quedó en ${actual.fields.workflow_status} y no en planned.` };
  }
  return { ticketId, estado: "plan-listo", detalle: "El plan está listo para aprobar; nadie lo aprobó." };
}

export interface OmitidoDePreparacion {
  readonly ticketId: string;
  readonly motivo: string;
}

export interface EleccionDePreparacion {
  readonly ticketId: string | null;
  /** Los tickets en `intake` que se saltaron antes de elegir, cada uno con su motivo. */
  readonly omitidos: readonly OmitidoDePreparacion[];
}

/**
 * Elige el primer ticket de la jornada que se puede preparar ahora y deja constancia de por qué
 * se saltó cada uno de los anteriores: una parada, una política que no lo admite o una
 * dependencia —de la jornada o del grafo de su feature— que todavía no está preparada.
 */
export function elegirAPreparar(project: AuthorizedProject, journeyId: string): EleccionDePreparacion {
  const jornada = readJourneys(project).find((j) => j.journeyId === journeyId);
  if (jornada === undefined) return { ticketId: null, omitidos: [] };
  const documentos = new Map(allDocuments(project.paths).map(({ ticket, document }) => [ticket.id, document]));
  const preparado = (id: string): boolean => {
    const estado = documentos.get(id)?.fields.workflow_status;
    return estado !== undefined && estado !== "intake" && estado !== "analyzed";
  };
  const politica = autonomousConfig(project.root);
  const ordenados = [...jornada.tickets].sort((a, b) => a.priority - b.priority || a.order - b.order);
  // Una parada no se reintenta sola: el ticket espera a que una persona la libere.
  const parados = new Set(paradasActivas(project.paths).map((parada) => parada.ticketId));
  const omitidos: OmitidoDePreparacion[] = [];
  for (const ticket of ordenados) {
    const documento = documentos.get(ticket.ticketId);
    if (documento?.fields.workflow_status !== "intake") continue;
    if (parados.has(ticket.ticketId)) {
      omitidos.push({ ticketId: ticket.ticketId, motivo: "tiene una parada activa" });
      continue;
    }
    const politicas = razonesDePolitica(documento.fields, politica);
    if (politicas.length > 0) {
      omitidos.push({ ticketId: ticket.ticketId, motivo: `no es elegible: ${politicas.join(", ")}` });
      continue;
    }
    const dependencias = new Set([...ticket.dependsOn, ...dependenciasEnGrafos(project.paths, ticket.ticketId)]);
    const pendientes = [...dependencias].filter((dependencia) => !preparado(dependencia));
    if (pendientes.length > 0) {
      omitidos.push({ ticketId: ticket.ticketId, motivo: `dependencias sin preparar: ${pendientes.join(", ")}` });
      continue;
    }
    return { ticketId: ticket.ticketId, omitidos };
  }
  return { ticketId: null, omitidos };
}

/** El primer ticket de la jornada que se puede preparar ahora, o `null`. */
export function siguienteAPreparar(project: AuthorizedProject, journeyId: string): string | null {
  return elegirAPreparar(project, journeyId).ticketId;
}

export interface DespachoDePreparacion {
  readonly estado: "preparado" | "ya-despachado" | "sin-candidato";
  readonly ticketId: string | null;
  readonly resultado: ResultadoDePreparacion | null;
  readonly detalle: string;
  /** Los tickets saltados antes de elegir, para que el avance diga por qué. */
  readonly omitidos: readonly OmitidoDePreparacion[];
}

/** Reserva capacidad, registra la actividad y prepara el siguiente ticket de la jornada. */
export function despacharPreparacion(request: {
  readonly project: AuthorizedProject;
  readonly home: string;
  readonly journeyId: string;
  readonly attemptId: string;
  readonly ahora: Date;
  readonly execute?: EjecutorDePreparacion | undefined;
  readonly notificar?: ((texto: string) => EntregaDeAviso) | undefined;
}): DespachoDePreparacion {
  const { project } = request;
  const politica = autonomousConfig(project.root);
  if (!politica.enabled || politica.executor === null) {
    return { estado: "sin-candidato", ticketId: null, resultado: null, detalle: "La autonomía está apagada o no declara un ejecutor seguro.", omitidos: [] };
  }
  const capacidad = reconcileMachineCapacity({ home: request.home, ahora: () => request.ahora });
  const { ticketId, omitidos } = elegirAPreparar(project, request.journeyId);
  if (ticketId === null) {
    return { estado: "sin-candidato", ticketId: null, resultado: null, detalle: "No hay un ticket en intake elegible y con sus dependencias ya preparadas.", omitidos };
  }
  if (capacidad.availableSlots < 1) {
    return { estado: "sin-candidato", ticketId, resultado: null, detalle: "No hay capacidad disponible en la máquina.", omitidos };
  }
  const tope = motivoDeTope({ project, home: request.home, politica, en: request.ahora.toISOString() });
  if (tope !== null) return { estado: "sin-candidato", ticketId, resultado: null, detalle: tope, omitidos };
  const identidad = createExecutionIdentity({ projectId: project.projectId, ticketId, executionId: request.journeyId });
  const reserva = claimMachineCapacity({ home: request.home, project, identity: identidad, attemptId: request.attemptId });
  if (!reserva.granted) {
    return { estado: "sin-candidato", ticketId, resultado: null, detalle: "La capacidad se agotó antes de iniciar.", omitidos };
  }
  if (!reserva.created) {
    return { estado: "ya-despachado", ticketId, resultado: null, detalle: "La misma identidad ya conserva una reserva.", omitidos };
  }
  const registrar = (estado: "started" | "finished" | "failed"): void => {
    recordExecutionActivity(project, {
      eventId: dispatchEventId(
        ticketId,
        identidad.executionId,
        request.attemptId,
        estado,
        estado === "started" ? request.ahora.toISOString() : undefined,
      ),
      identity: identidad,
      attemptId: request.attemptId,
      state: estado,
      source: "journey-preparation",
      occurredAt: request.ahora.toISOString(),
    });
  };
  registrar("started");
  try {
    const resultado = prepararTicket({
      paths: project.paths,
      ticketId,
      ...(request.execute === undefined ? {} : { execute: request.execute }),
      ...(request.notificar === undefined ? {} : { notificar: request.notificar }),
      ahora: () => request.ahora,
    });
    registrar(resultado.estado === "plan-listo" || resultado.estado === "decision-pendiente" ? "finished" : "failed");
    return { estado: "preparado", ticketId, resultado, detalle: resultado.detalle, omitidos };
  } catch (error) {
    registrar("failed");
    releaseMachineCapacity({ home: request.home, project, identity: identidad, attemptId: request.attemptId });
    throw error;
  }
}

/**
 * Mantiene los IDs portables y acotados aunque la puerta aporte IDs largos.
 *
 * Vivía en el despacho de ejecución, ya retirado. Conserva el mismo digest y el prefijo
 * `journey-dispatch-`: los eventos históricos del registro de ejecuciones lo llevan.
 */
export function dispatchEventId(
  ticketId: string,
  executionId: string,
  attemptId: string,
  state: string,
  /**
   * El inicio lleva el momento del avance: una identidad que se recuperó y se vuelve a despachar
   * necesita un `started` nuevo, o su última actividad seguiría siendo el `failed` de la recuperación.
   */
  momento?: string,
): string {
  // El ticket entra al digest: una jornada despacha varios tickets con la misma ejecución e
  // intento, y sin él el segundo ticket chocaba con el evento del primero.
  const digest = createHash("sha256")
    .update(`${ticketId}\u0000${executionId}\u0000${attemptId}\u0000${state}${momento === undefined ? "" : `\u0000${momento}`}`)
    .digest("hex")
    .slice(0, 32);
  return `journey-dispatch-${state}-${digest}`;
}
