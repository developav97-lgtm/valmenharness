/**
 * El contexto de una consulta: `valmen ask`.
 *
 * Una consulta no muta nada, y por eso el contexto se arma sin modelo y sin red:
 * el registro activo, el ticket si se pidió uno, y lo que la memoria del proyecto
 * ya sabe del tema. Lo que no se hace —y es la decisión del ticket— es contestar
 * la pregunta desde acá: el CLI no lanza agentes, y una respuesta producida por un
 * modelo no sería comprobable por una prueba.
 *
 * Lo que sí declara este contexto es el permiso con el que corre: en modo pregunta
 * el motor no concede escritura, y el bloque lo dice para que quien responde sepa
 * —y para que quede en la salida— que crear un ticket, mover un estado o escribir
 * un archivo no es algo que la sesión pueda hacer.
 */
import { type AgentCapabilities, capabilitiesFor, fail, parseTicket } from "@valmen/core";

import { type RegistryPaths, findTicket } from "./discovery.js";
import { type MemoryHit, loadMemory, searchMemory } from "./memory.js";
import { type ResumeContext, buildResumeContext, renderResumeContext } from "./resume.js";
import { type TicketRow, listTickets } from "./tickets.js";

/** Una fila del registro activo, con lo justo para citar un ticket. */
export interface AskTicket {
  readonly id: string;
  readonly title: string;
  readonly workflowStatus: string;
  readonly module: string;
}

/** Un acierto de la memoria del proyecto, con dónde vive. */
export interface AskMemoryHit {
  readonly id: string | null;
  readonly title: string;
  readonly score: number;
  readonly path: string;
  readonly line: number;
}

/** El contexto de una consulta. */
export interface AskContext {
  readonly modo: "ask";
  readonly question: string;
  /** Lo que el motor le concede al agente que responde. */
  readonly capabilities: AgentCapabilities;
  /** Los tickets que no están cerrados, en orden de creación. */
  readonly active: readonly AskTicket[];
  /** El ticket reanudado, cuando la consulta nombra uno. */
  readonly ticket: ResumeContext | null;
  /** Lo que la memoria del proyecto tiene sobre la pregunta. */
  readonly memory: readonly AskMemoryHit[];
}

/** Lo que pide una consulta. */
export interface AskRequest {
  readonly paths: RegistryPaths;
  readonly question: string;
  /** El ticket sobre el que se pregunta, si la consulta nombra uno. */
  readonly ticketId?: string;
  /** Cuántos aciertos de memoria incluir. Por defecto, cinco. */
  readonly limit?: number;
}

/** Los tickets activos, en el orden en que el registro los presenta. */
function activeTickets(paths: RegistryPaths): readonly AskTicket[] {
  return listTickets(paths)
    .filter((row: TicketRow) => row.workflowStatus !== "closed")
    .sort((a, b) => (a.created === b.created ? a.id.localeCompare(b.id) : a.created < b.created ? -1 : 1))
    .map((row) => ({
      id: row.id,
      title: row.title,
      workflowStatus: row.workflowStatus,
      module: row.module,
    }));
}

/** El ticket reanudado, o falla si la consulta nombra uno que no existe. */
function resumedTicket(paths: RegistryPaths, id: string): ResumeContext {
  const located = findTicket(paths, id);
  if (located === undefined) {
    fail("La ruta canónica solicitada no existe.");
  }
  return buildResumeContext(paths, parseTicket(located.text));
}

/** Arma el contexto de una consulta. No escribe nada y no sale a la red. */
export function buildAskContext(request: AskRequest): AskContext {
  const pregunta = request.question.trim();
  if (pregunta === "") {
    fail("La consulta necesita una pregunta.");
  }

  const aciertos: readonly MemoryHit[] = searchMemory(
    loadMemory(request.paths),
    pregunta,
    request.limit ?? 5,
  );

  return {
    modo: "ask",
    question: pregunta,
    capabilities: capabilitiesFor("ask"),
    active: activeTickets(request.paths),
    ticket:
      request.ticketId === undefined
        ? null
        : resumedTicket(request.paths, request.ticketId),
    memory: aciertos.map((hit) => ({
      id: hit.entry.id,
      title: hit.entry.title,
      score: hit.score,
      path: hit.entry.source.path,
      line: hit.entry.source.line,
    })),
  };
}

/** El contexto de una consulta, en texto, en orden estable. */
export function renderAskContext(context: AskContext): string {
  const lineas = [
    "Modo pregunta — el motor no concede permisos de escritura",
    `  pregunta      ${context.question}`,
    "  escritura     no concedida: crear tickets, mover estados y escribir archivos fallan con invariante",
    `  ejecución     ${context.capabilities.execute ? "concedida" : "no concedida"}`,
    `  agente        write: ${String(context.capabilities.write)} · execute: ${String(context.capabilities.execute)}`,
    "  refuerzo      el guardia vive en las dos puertas de escritura del motor: `atomicWrite` y el lock de mutación",
    "",
  ];

  lineas.push(`Registro activo (${context.active.length})`);
  if (context.active.length === 0) {
    lineas.push("- Ninguno");
  } else {
    for (const ticket of context.active) {
      lineas.push(
        `- ${ticket.id} [${ticket.workflowStatus}] ${ticket.module} — ${ticket.title}`,
      );
    }
  }

  if (context.ticket !== null) {
    lineas.push("", renderResumeContext(context.ticket).trimEnd());
  }

  lineas.push("", `Memoria del proyecto (${context.memory.length} acierto(s))`);
  if (context.memory.length === 0) {
    lineas.push("- Ninguno");
  } else {
    for (const hit of context.memory) {
      lineas.push(
        `- ${hit.id === null ? "(sin id)" : hit.id} ${hit.title} → ${hit.path}:${String(hit.line)}`,
      );
    }
  }

  lineas.push(
    "",
    "Responda la pregunta sin escribir el registro: lo que haya que escribir se pide",
    "a una sesión de trabajo, que es la que tiene el permiso.",
    "",
  );

  return lineas.join("\n");
}
