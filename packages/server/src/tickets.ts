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
import { type RegistryPaths, ticketsPath } from "@valmen/engine";

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
  /**
   * La fecha del último cierre, o `null` si el ticket no está cerrado.
   *
   * Es la del bloque `## Cierre`, no la de `updated`. Filtrar los cierres de la
   * semana por «última edición» deja fuera un ticket cerrado el lunes al que
   * alguien le corrigió una tilde el jueves, y el reporte semanal lo perdería. El
   * reporte de cierres ya usaba esta fecha; ahora la lista puede usarla también.
   */
  readonly closedOn: string | null;
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
const IMPACTOS_CRITICOS = ["sync_impact", "migration_impact", "docker_impact"] as const;

/**
 * Recorre el registro y devuelve la ruta de cada `ticket.md`, ordenada.
 *
 * El directorio no está fijo: un proyecto adoptado tiene el registro en
 * `docs/tickets`. Con `tickets/` hardcodeado, la interfaz mostraba el registro
 * vacío sobre el proyecto real, que es la peor forma de fallar —parece que no
 * hay nada que hacer.
 */
function ticketFiles(
  paths: RegistryPaths,
): { id: string; path: string; relativePath: string }[] {
  const base = ticketsPath(paths);
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
        relativePath: relative(paths.root, ruta).split(sep).join("/"),
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
    closedOn: ultimaFechaDeCierre(parsed),
    openPoints: abiertos,
    totalPoints: puntos.length,
    criticalImpacts: criticos,
    path: relativePath,
    invalid: null,
  };
}

/** La fecha del último cierre registrado, o `null` si no hay ninguno. */
function ultimaFechaDeCierre(parsed: ParsedTicket): string | null {
  const cierres = parsed.blocks.Cierre;
  const ultimo = cierres[cierres.length - 1];
  if (ultimo === undefined) return null;
  const fecha = ultimo["date"];
  return typeof fecha === "string" && fecha.trim() !== "" ? fecha.trim() : null;
}

/**
 * Lista los tickets del registro.
 *
 * Un ticket que no valida **no se oculta**: se incluye con su error. Un registro
 * con un ticket roto es precisamente lo que hay que ver, y esconderlo dejaría
 * al usuario con la lista aparentemente completa.
 */
export function listTickets(paths: RegistryPaths): TicketRow[] {
  return ticketFiles(paths).map(({ id, path, relativePath }) => {
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
        closedOn: parcial.closedOn ?? null,
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
export function readTicket(paths: RegistryPaths, id: string): TicketDetail | null {
  const encontrado = ticketFiles(paths).find((ticket) => ticket.id === id);
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
  /**
   * Solo los que declaran algún impacto crítico.
   *
   * Es lo que hace que la tarjeta «Impacto crítico» del resumen sirva para algo:
   * sin filtro, muestra un número que obliga a buscarlos a mano en la tabla.
   */
  readonly onlyCritical?: boolean;
  /** Solo los que tienen puntos abiertos. Igual que el anterior, para su tarjeta. */
  readonly onlyWithOpenPoints?: boolean;
  /**
   * Desde qué fecha y hasta cuál, en `YYYY-MM-DD`, ambas incluidas.
   *
   * Los dos extremos se comparan como texto: el formato del contrato los ordena
   * igual que las fechas, así que no hace falta convertirlos y una fecha mal
   * formada se compara como lo que es —texto— en vez de producir un `NaN` que
   * silenciosamente no filtraría nada.
   */
  readonly desde?: string;
  readonly hasta?: string;
  /**
   * Qué fecha se compara contra el rango.
   *
   * `updated` por defecto —«lo que se tocó en el rango»—, y `closedOn` para el
   * reporte de cierres, que cuenta lo que se cerró y no lo que se editó. La
   * diferencia importa: un ticket cerrado el lunes y retocado el jueves aparece en
   * el rango del jueves por `updated` y en el del lunes por `closedOn`, y ninguno
   * de los dos es «el correcto» sin saber qué se está contando.
   */
  readonly dateField?: "updated" | "created" | "closedOn";
  /**
   * Por qué columna ordenar.
   *
   * `updated` por defecto —lo que se tocó hace menos va primero—, que es lo que se
   * espera de una lista de trabajo. El resto existe para poder mirar la misma lista
   * por otro criterio sin exportarla.
   */
  readonly sortBy?:
    | "updated"
    | "created"
    | "closedOn"
    | "id"
    | "type"
    | "module"
    | "workflowStatus"
    | "qaStatus"
    | "releaseStatus"
    | "openPoints"
    | "riskLevel";
  /** `desc` por defecto en las fechas y los números, `asc` en el texto. */
  readonly sortDir?: "asc" | "desc";
  readonly limit?: number;
}

/** Las columnas por las que se puede ordenar, para no aceptar cualquiera. */
export const CAMPOS_ORDENABLES = [
  "updated",
  "created",
  "closedOn",
  "id",
  "type",
  "module",
  "workflowStatus",
  "qaStatus",
  "releaseStatus",
  "openPoints",
  "riskLevel",
] as const;

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
    if (
      filters.workflowStatus !== undefined &&
      row.workflowStatus !== filters.workflowStatus
    ) {
      return false;
    }
    if (filters.type !== undefined && row.type !== filters.type) return false;
    if (filters.module !== undefined && row.module !== filters.module) return false;
    if (filters.onlyOpen === true && row.workflowStatus === "closed") return false;
    if (filters.onlyInvalid === true && row.invalid === null) return false;
    if (filters.onlyCritical === true && row.criticalImpacts.length === 0) return false;
    if (filters.onlyWithOpenPoints === true && row.openPoints === 0) return false;

    // El rango de fechas. `closedOn` es `null` en un ticket abierto, y un ticket
    // abierto no está «dentro» de ningún rango de cierres: se excluye en vez de
    // tratarlo como si su fecha fuera la cadena vacía, que sería menor que
    // cualquier `desde` y lo colaría en todos los rangos.
    const campo = filters.dateField ?? "updated";
    if (filters.desde !== undefined || filters.hasta !== undefined) {
      const fecha = campo === "closedOn" ? row.closedOn : row[campo];
      if (fecha === null || fecha === "") return false;
      if (filters.desde !== undefined && fecha < filters.desde) return false;
      if (filters.hasta !== undefined && fecha > filters.hasta) return false;
    }
    if (consulta !== "") {
      const texto = `${row.id} ${row.title} ${row.module} ${row.type}`.toLowerCase();
      if (!texto.includes(consulta)) return false;
    }
    return true;
  });

  // El orden por defecto es del más reciente al más antiguo: lo que se está
  // trabajando ahora es lo que primero se quiere ver. Se puede cambiar por
  // columna, y el desempate es siempre el identificador —descendente, para que lo
  // nuevo quede arriba— porque sin un desempate estable dos tickets con la misma
  // fecha cambian de sitio entre recargas y la lista parece moverse sola.
  const campo = filters.sortBy ?? "updated";
  // El sentido por defecto depende del campo: en una fecha o un conteo se espera
  // lo mayor primero; en un texto, el orden alfabético.
  const porDefecto = ["updated", "created", "closedOn", "openPoints"].includes(campo)
    ? "desc"
    : "asc";
  const sentido = filters.sortDir ?? porDefecto;
  const signo = sentido === "asc" ? 1 : -1;

  filtradas.sort((a, b) => {
    const uno = a[campo];
    const otro = b[campo];
    // Una fecha de cierre ausente —un ticket abierto— va al final en los dos
    // sentidos: no es «la más antigua», es que no aplica.
    if (campo === "closedOn") {
      if (uno === null && otro !== null) return 1;
      if (uno !== null && otro === null) return -1;
    }
    if (uno !== otro) return (uno ?? "") < (otro ?? "") ? -signo : signo;
    return a.id < b.id ? 1 : -1;
  });

  return filters.limit === undefined ? filtradas : filtradas.slice(0, filters.limit);
}
