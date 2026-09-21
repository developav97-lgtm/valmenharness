/**
 * Índice derivado del registro de tickets.
 *
 * El índice **nunca** es fuente de verdad: se regenera desde los tickets y se
 * compara con el que está en disco para detectar desfases. Ver
 * docs/01-ARQUITECTURA.md §2.3.
 */
import { TICKET_TYPES } from "@valmen/core";

import type { LocatedTicket, RegistryPaths } from "@valmen/gate-run";
import { toRelative } from "@valmen/gate-run";

/** Una fila del índice, con lo mínimo para localizar y clasificar el ticket. */
interface IndexRow {
  readonly created: string;
  readonly id: string;
  readonly type: string;
  readonly module: string;
  readonly workflow: string;
  readonly qa: string;
  readonly release: string;
  readonly path: string;
}

/**
 * Cabecera del índice.
 *
 * Se conserva el formato de tabla y el orden de columnas del CLI de referencia
 * para que un proyecto adoptado no vea su índice reescrito sin motivo. El
 * comando de generación es el del harness, no el de Python.
 */
const HEADER = `# Índice de tickets

> Archivo generado por \`valmen index\`.
> No se edita a mano. La fuente de verdad es cada
> \`<registro>/YYYY/<TICKET-ID>/ticket.md\`.

| Fecha | Ticket | Tipo | Módulo | Workflow | QA | Release |
|---|---|---|---|---|---|---|
`;

const EMPTY = "_No hay tickets indexados todavía._\n";

/** Extrae una fila del índice de un ticket ya validado. */
function toRow(paths: RegistryPaths, ticket: LocatedTicket): IndexRow {
  // El campo se busca por línea: el frontmatter ya pasó el validador, así que
  // el formato está garantizado y no hace falta volver a analizarlo entero.
  const field = (key: string): string => {
    const match = new RegExp(`^${key}: (.*)$`, "m").exec(ticket.text);
    return match?.[1] ?? "";
  };

  const year = ticket.id.slice(-8, -4);
  return {
    created: field("created"),
    id: ticket.id,
    type: field("type"),
    module: field("module"),
    workflow: field("workflow_status"),
    qa: field("qa_status"),
    release: field("release_status"),
    path: `${year}/${ticket.id}/ticket.md`,
  };
}

/**
 * Genera el contenido del índice.
 *
 * El orden es por `created` y luego por `id`, ambos como texto, para que el
 * resultado sea estable entre ejecuciones y entre máquinas.
 */
export function renderIndex(
  paths: RegistryPaths,
  tickets: readonly LocatedTicket[],
): string {
  if (tickets.length === 0) return HEADER + "\n" + EMPTY;

  const rows = tickets.map((ticket) => toRow(paths, ticket));
  rows.sort((a, b) => {
    if (a.created !== b.created) return a.created < b.created ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const lines = rows.map(
    (row) =>
      `| ${row.created} | [${row.id}](${row.path}) | ${row.type} | ${row.module} | ` +
      `${row.workflow} | ${row.qa} | ${row.release} |`,
  );

  return HEADER + lines.join("\n") + "\n";
}

/**
 * Comprueba si el índice en disco coincide con el regenerado.
 *
 * Devuelve `true` si está al día. Un índice ausente (`null`) cuenta como
 * desactualizado, porque no se puede verificar su frescura.
 */
export function isIndexCurrent(
  paths: RegistryPaths,
  tickets: readonly LocatedTicket[],
  onDisk: string | null,
): boolean {
  if (onDisk === null) return false;
  return onDisk === renderIndex(paths, tickets);
}

/** Tipos válidos, reexportados para la ayuda del CLI. */
export { TICKET_TYPES };
export type { IndexRow };
export { toRelative };
