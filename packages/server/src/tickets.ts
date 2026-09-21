/**
 * Proyección de tickets para la interfaz.
 *
 * El visor que reemplaza mostraba solo los tickets cerrados. Mission Control
 * necesita **todo el ciclo**: qué está en curso, qué espera una decisión y qué
 * está bloqueado son las preguntas que importan durante el trabajo, no después.
 *
 * Igual que el resto de Mission Control, esto no tiene lógica de negocio: lee el
 * registro con el mismo motor que el CLI, proyecta y devuelve. No calcula
 * estados, no valida reglas y no muta nada.
 *
 * Ver docs/06-CONTROL-APP.md §2.2.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { type ParsedTicket, parseTicket, validateDocument } from "@valmen/core";

/** Una fila de la lista de tickets. */
export interface TicketRow {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly module: string;
  readonly workflowStatus: string;
  readonly qaStatus: string;
  readonly releaseStatus: string;
  readonly riskLevel: string;
  readonly created: string;
  readonly updated: string;
  /** Puntos abiertos o en curso. */
  readonly openPoints: number;
  readonly totalPoints: number;
  /** `true` si declara algún impacto crítico. */
  readonly criticalImpacts: readonly string[];
  /** Ruta relativa del ticket, para el enlace al archivo. */
  readonly path: string;
  /** `null` si el ticket es válido; el mensaje si no lo es. */
  readonly invalid: string | null;
}

/** El detalle de un ticket, con sus secciones y bloques. */
export interface TicketDetail extends TicketRow {
  readonly request: string;
  readonly sections: Readonly<Record<string, string>>;
  readonly points: readonly Record<string, unknown>[];
  readonly qa: readonly Record<string, unknown>[];
  readonly evidence: readonly Record<string, unknown>[];
  readonly retests: readonly Record<string, unknown>[];
  readonly closures: readonly Record<string, unknown>[];
  readonly events: readonly Record<string, unknown>[];
  readonly usage: readonly Record<string, unknown>[];
}

/** Estados que impiden cerrar un punto. */
const ESTADOS_PUNTO_ABIERTOS = ["open", "analyzed", "in_progress", "awaiting_retest"];

/** Impactos que elevan el gate, según el contrato del ticket. */
const IMPACTOS_CRITICOS = [
  "sync_impact",
  "migration_impact",
  "docker_impact",
] as const;

/** Recorre el registro y devuelve la ruta de cada `ticket.md`, ordenada. */
function ticketFiles(root: string): { id: string; path: string; relativePath: string }[] {
  const base = join(root, "tickets");
  const encontrados: { id: string; path: string; relativePath: string }[] = [];

  let anios: string[];
  try {
    anios = readdirSync(base);
  } catch {
    return encontrados;
  }

  for (const anio of anios) {
    let ids: string[];
    try {
      ids = readdirSync(join(base, anio));
    } catch {
      continue;
    }
    for (const id of ids) {
      const ruta = join(base, anio, id, "ticket.md");
      try {
        readFileSync(ruta, "utf8");
      } catch {
        continue;
      }
      encontrados.push({
        id,
        path: ruta,
        relativePath: relative(root, ruta).split(sep).join("/"),
      });
    }
  }

  return encontrados.sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));
}

/** Proyecta un ticket analizado a una fila de la lista. */
function toRow(id: string, parsed: ParsedTicket, relativePath: string): TicketRow {
  const { fields, blocks } = parsed;

  const puntos = blocks.Puntos;
  const abiertos = puntos.filter((punto) =>
    ESTADOS_PUNTO_ABIERTOS.includes(String(punto["status"])),
  ).length;

  const criticos = IMPACTOS_CRITICOS.filter((impacto) => fields[impacto] === "true");

  return {
    id: fields.id,
    title: fields.title,
    type: fields.type,
    module: fields.module,
    workflowStatus: fields.workflow_status,
    qaStatus: fields.qa_status,
    releaseStatus: fields.release_status,
    riskLevel: fields.risk_level,
    created: fields.created,
    updated: fields.updated,
    openPoints: abiertos,
    totalPoints: puntos.length,
    criticalImpacts: criticos,
    path: relativePath,
    invalid: null,
  };
}

/**
 * Lista los tickets del registro.
 *
 * Un ticket que no valida **no se oculta**: se incluye con su error. Un registro
 * con un ticket roto es precisamente lo que hay que ver, y esconderlo dejaría
 * al usuario con la lista aparentemente completa.
 */
export function listTickets(root: string): TicketRow[] {
  return ticketFiles(root).map(({ id, path, relativePath }) => {
    const text = readFileSync(path, "utf8");
    try {
      const parsed = parseTicket(text);
      validateDocument(parsed, { expectedId: id });
      return toRow(id, parsed, relativePath);
    } catch (caught) {
      const mensaje = caught instanceof Error ? caught.message : String(caught);
      // Se intenta leer lo poco que se pueda para no devolver una fila vacía.
      let parcial: Partial<TicketRow> = {};
      try {
        const parsed = parseTicket(text);
        parcial = toRow(id, parsed, relativePath);
      } catch {
        parcial = {};
      }
      return {
        id,
        title: parcial.title ?? "(no se pudo leer el título)",
        type: parcial.type ?? "?",
        module: parcial.module ?? "?",
        workflowStatus: parcial.workflowStatus ?? "?",
        qaStatus: parcial.qaStatus ?? "?",
        releaseStatus: parcial.releaseStatus ?? "?",
        riskLevel: parcial.riskLevel ?? "?",
        created: parcial.created ?? "",
        updated: parcial.updated ?? "",
        openPoints: parcial.openPoints ?? 0,
        totalPoints: parcial.totalPoints ?? 0,
        criticalImpacts: parcial.criticalImpacts ?? [],
        path: relativePath,
        invalid: mensaje,
      } satisfies TicketRow;
    }
  });
}

/** Lee el detalle de un ticket. Devuelve `null` si no existe. */
export function readTicket(root: string, id: string): TicketDetail | null {
  const encontrado = ticketFiles(root).find((ticket) => ticket.id === id);
  if (encontrado === undefined) return null;

  const text = readFileSync(encontrado.path, "utf8");
  let invalid: string | null = null;
  let parsed: ParsedTicket;
  try {
    parsed = parseTicket(text);
    validateDocument(parsed, { expectedId: id });
  } catch (caught) {
    invalid = caught instanceof Error ? caught.message : String(caught);
    // Un ticket inválido igual se muestra: el usuario necesita ver qué tiene.
    parsed = parseTicket(text);
  }

  const fila = toRow(id, parsed, encontrado.relativePath);

  // Las secciones se devuelven en crudo. La interfaz las renderiza como texto:
  // interpretar Markdown en el servidor añadiría una dependencia y una
  // superficie de error sin ganar nada.
  return {
    ...fila,
    invalid,
    request: parsed.sections["Solicitud original"].trim(),
    sections: parsed.sections,
    points: [...parsed.blocks.Puntos],
    qa: [...parsed.blocks.QA],
    evidence: [...parsed.blocks.Evidencia],
    retests: [...parsed.blocks.Retests],
    closures: [...parsed.blocks.Cierre],
    events: [...parsed.blocks.Eventos],
    usage: [...parsed.blocks["Consumo de IA"]],
  };
}

/** Resumen del registro, para la cabecera del Mission Control. */
export interface RegistrySummary {
  readonly total: number;
  readonly byWorkflow: Readonly<Record<string, number>>;
  readonly byType: Readonly<Record<string, number>>;
  readonly invalid: number;
  readonly withOpenPoints: number;
  readonly criticalImpacts: number;
}

/** Calcula el resumen a partir de las filas. */
export function summarize(rows: readonly TicketRow[]): RegistrySummary {
  const byWorkflow: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const row of rows) {
    byWorkflow[row.workflowStatus] = (byWorkflow[row.workflowStatus] ?? 0) + 1;
    byType[row.type] = (byType[row.type] ?? 0) + 1;
  }

  return {
    total: rows.length,
    byWorkflow,
    byType,
    invalid: rows.filter((row) => row.invalid !== null).length,
    withOpenPoints: rows.filter((row) => row.openPoints > 0).length,
    criticalImpacts: rows.filter((row) => row.criticalImpacts.length > 0).length,
  };
}

/** Filtros de la lista, aplicados en el servidor. */
export interface TicketFilters {
  readonly workflowStatus?: string;
  readonly type?: string;
  readonly module?: string;
  readonly query?: string;
  readonly onlyOpen?: boolean;
  readonly onlyInvalid?: boolean;
  readonly limit?: number;
}

/**
 * Aplica los filtros.
 *
 * La búsqueda es sobre texto funcional —título, módulo, identificador— y no
 * sobre el contenido completo: buscar dentro de los bloques JSON daría
 * resultados que el usuario no puede interpretar en la lista.
 */
export function filterTickets(
  rows: readonly TicketRow[],
  filters: TicketFilters,
): TicketRow[] {
  const consulta = (filters.query ?? "").trim().toLowerCase();

  const filtradas = rows.filter((row) => {
    if (filters.workflowStatus !== undefined && row.workflowStatus !== filters.workflowStatus) {
      return false;
    }
    if (filters.type !== undefined && row.type !== filters.type) return false;
    if (filters.module !== undefined && row.module !== filters.module) return false;
    if (filters.onlyOpen === true && row.workflowStatus === "closed") return false;
    if (filters.onlyInvalid === true && row.invalid === null) return false;
    if (consulta !== "") {
      const texto = `${row.id} ${row.title} ${row.module} ${row.type}`.toLowerCase();
      if (!texto.includes(consulta)) return false;
    }
    return true;
  });

  // El orden es del más reciente al más antiguo: lo que se está trabajando
  // ahora es lo que primero se quiere ver.
  filtradas.sort((a, b) => {
    if (a.updated !== b.updated) return a.updated < b.updated ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });

  return filters.limit === undefined ? filtradas : filtradas.slice(0, filters.limit);
}
