/**
 * Comandos de solo lectura y de índice.
 *
 * Los mensajes y los códigos de salida replican los del CLI de referencia
 * porque son parte del contrato: un script que hoy hace
 * `ticket.py validate --all` debe seguir funcionando con `valmen validate --all`
 * sin cambios. Ver docs/09-MIGRACION-SAICLOUD.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  EXIT_SCHEMA,
  TicketError,
  parseTicket,
  toFailure,
  validateDocument,
} from "@valmen/core";

import {
  type LocatedTicket,
  type RegistryPaths,
  findAllTickets,
  findTicket,
  indexPath,
} from "./discovery.js";
import { isIndexCurrent, renderIndex } from "./index-file.js";

/** Resultado de un comando: qué escribir y con qué código salir. */
export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Escribe en stdout y termina con éxito. */
function ok(stdout: string): CommandResult {
  return { stdout, stderr: "", exitCode: 0 };
}

/** Escribe en stderr y termina con el código dado. */
function error(stderr: string, exitCode: number = EXIT_SCHEMA): CommandResult {
  return { stdout: "", stderr, exitCode };
}

/**
 * Valida un ticket y devuelve su error, o `undefined` si es válido.
 *
 * `expectedId` solo se pasa cuando el ticket se localizó por identificador: al
 * recorrer el registro completo el nombre del directorio no es autoridad, lo
 * es el `id` del frontmatter.
 */
function validationError(
  ticket: LocatedTicket,
  expectedId?: string,
): TicketError | undefined {
  try {
    const parsed = parseTicket(ticket.text);
    validateDocument(parsed, expectedId === undefined ? {} : { expectedId });
    return undefined;
  } catch (caught) {
    if (caught instanceof TicketError) return caught;
    throw caught;
  }
}

/**
 * `validate --all`: recorre el registro y acumula **todos** los errores.
 *
 * Acumular en vez de abortar en el primero es deliberado: al arreglar un
 * registro migrado conviene ver todo lo que falta de una vez.
 */
export function validateAll(paths: RegistryPaths): CommandResult {
  let tickets: LocatedTicket[];
  try {
    tickets = findAllTickets(paths);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }

  const failures: string[] = [];
  for (const ticket of tickets) {
    const failure = validationError(ticket);
    if (failure !== undefined) {
      failures.push(`${ticket.relativePath}: ${failure.message}`);
    }
  }

  if (failures.length > 0) {
    const count = failures.length;
    return error(
      `Se encontraron ${count} ticket(s) inválidos: ${failures.join("; ")}`,
    );
  }

  return ok(`Tickets válidos: ${tickets.length}\n`);
}

/** `validate --id <ID>`: valida un ticket concreto. */
export function validateOne(paths: RegistryPaths, id: string): CommandResult {
  const ticket = findTicket(paths, id);
  if (ticket === undefined) {
    return error("La ruta canónica solicitada no existe.");
  }
  const failure = validationError(ticket, id);
  if (failure !== undefined) {
    return error(failure.message, failure.exitCode);
  }
  return ok(`Ticket válido: ${id}\n`);
}

/** `list`: imprime los tickets no cerrados, ordenados por fecha e id. */
export function listActive(paths: RegistryPaths): CommandResult {
  let tickets: LocatedTicket[];
  try {
    tickets = findAllTickets(paths);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }

  const rows = tickets
    .map((ticket) => {
      const parsed = parseTicket(ticket.text);
      return {
        created: parsed.fields.created,
        id: parsed.fields.id,
        workflow: parsed.fields.workflow_status,
        module: parsed.fields.module,
        title: parsed.fields.title,
      };
    })
    .filter((row) => row.workflow !== "closed")
    .sort((a, b) => {
      if (a.created !== b.created) return a.created < b.created ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  if (rows.length === 0) return ok("No hay tickets activos.\n");

  const lines = rows.map(
    (row) => `${row.id} | ${row.workflow} | ${row.module} | ${row.title}`,
  );
  return ok(lines.join("\n") + "\n");
}

/** `show`: imprime un resumen legible de un ticket. */
export function showTicket(paths: RegistryPaths, id: string): CommandResult {
  const ticket = findTicket(paths, id);
  if (ticket === undefined) {
    return error("La ruta canónica solicitada no existe.");
  }
  const failure = validationError(ticket, id);
  if (failure !== undefined) {
    return error(failure.message, failure.exitCode);
  }

  const parsed = parseTicket(ticket.text);
  const { fields } = parsed;
  const blocking = parsed.blocks.Puntos.filter(
    (point: Record<string, unknown>) =>
      ["open", "analyzed", "in_progress", "awaiting_retest"].includes(
        String(point["status"]),
      ),
  );

  const lines = [
    `Ticket:   ${fields.id}`,
    `Título:   ${fields.title}`,
    `Tipo:     ${fields.type} · Módulo: ${fields.module}`,
    `Workflow: ${fields.workflow_status}`,
    `QA:       ${fields.qa_status}`,
    `Release:  ${fields.release_status}`,
    `Riesgo:   ${fields.risk_level}`,
    `Creado:   ${fields.created} · Actualizado: ${fields.updated}`,
    `Puntos:   ${parsed.blocks.Puntos.length} (${blocking.length} bloqueantes)`,
    `Ruta:     ${ticket.relativePath}`,
  ];
  return ok(lines.join("\n") + "\n");
}

/**
 * `index`: regenera el índice derivado, o comprueba que esté al día.
 *
 * Con `--check` no escribe: es el modo que conviene usar en integración
 * continua, porque detecta un índice que alguien olvidó regenerar sin
 * modificar el repositorio.
 */
export function buildIndex(
  paths: RegistryPaths,
  check: boolean,
): CommandResult {
  let tickets: LocatedTicket[];
  try {
    tickets = findAllTickets(paths);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }

  const target = indexPath(paths);
  const onDisk = existsSync(target) ? readFileSync(target, "utf8") : null;

  if (check) {
    if (onDisk === null) {
      return error("No se pudo leer el índice de tickets.");
    }
    if (!isIndexCurrent(paths, tickets, onDisk)) {
      return error("El índice está desactualizado; ejecute el comando index.");
    }
    return ok("Índice actualizado.\n");
  }

  const content = renderIndex(paths, tickets);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
  return ok("Índice reconstruido.\n");
}
