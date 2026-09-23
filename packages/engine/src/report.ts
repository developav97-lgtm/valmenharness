/**
 * El reporte Markdown de tickets cerrados.
 *
 * Es lo único que el visor de Python ofrecía y Mission Control no cubría, y no es
 * cosmético: es un artefacto que alguien usaba para **comunicar**. El visor
 * mostraba una lista en pantalla; el reporte es lo que se pegaba en un correo o
 * en una minuta.
 *
 * La extracción es la de `ticket_viewer.py`, transcrita con sus reglas exactas,
 * porque el texto que sale de aquí es el que se lee fuera del equipo:
 *
 * | Campo | De dónde sale |
 * |---|---|
 * | Se atendió | `Comportamiento actual`, o `Alcance`, o la solicitud original |
 * | Se realizó | `functional_summary` del **último** cierre |
 * | Fecha | La del último cierre, no la de `updated` ni la de `created` |
 *
 * Las tres caídas del «Se atendió» están en ese orden por una razón: la
 * descripción funcional es la que está escrita en términos del usuario, y la
 * solicitud original es lo que dijo el cliente —útil, pero en sus palabras y a
 * veces con ruido—. `PENDING_INFORMATION` es el mismo texto que usaba el visor,
 * porque un reporte con un hueco tiene que decir que lo tiene.
 *
 * La fecha del cierre y no la del frontmatter: el reporte agrupa por cuándo se
 * terminó el trabajo, que es lo que se comunica. Un ticket creado en marzo y
 * cerrado en septiembre pertenece al informe de septiembre.
 */
import { existsSync } from "node:fs";

import { type ParsedTicket, EXIT_SCHEMA, fail } from "@valmen/core";

import { allDocuments } from "./mutate.js";
import { type RegistryPaths, ticketsPath } from "./discovery.js";

/** El texto que el visor ponía cuando no había nada que contar. */
export const PENDING_INFORMATION = "Información pendiente de documentar.";

/** Un ticket cerrado, proyectado para comunicar. */
export interface ReportEntry {
  readonly ticketId: string;
  readonly title: string;
  readonly type: string;
  readonly module: string;
  /** La fecha del último cierre, en `YYYY-MM-DD`. */
  readonly closedOn: string;
  /** «Se atendió»: el problema, en términos del usuario. */
  readonly problem: string;
  /** «Se realizó»: el resumen funcional del último cierre. */
  readonly solution: string;
  /** El rol afectado, si la descripción funcional lo declara. */
  readonly userRelevance: string | null;
  /**
   * Si el trabajo llegó a una versión publicada.
   *
   * Va en el informe porque «cerrado» y «publicado» son dos cosas distintas —el
   * propio `AGENTS.md` llama a confundirlas el error clásico— y el informe las
   * confundía: quien lo lee entiende «entregado» donde dice «cerrado». Un cierre
   * sin publicar es trabajo terminado que todavía no llegó a nadie.
   */
  readonly releaseStatus: string;
  /** La versión en la que salió, si salió. */
  readonly releasedIn: string | null;
}

/**
 * El valor de una etiqueta de una sección: `- Comportamiento actual: …`.
 *
 * Recoge las líneas de continuación indentadas hasta la siguiente etiqueta. La
 * regla de la continuación es lo que permite que un valor escrito en varias
 * líneas salga entero en vez de cortado en la primera.
 */
function labelValue(section: string, label: string): string | null {
  const prefijo = `- ${label}:`;
  let recogiendo = false;
  const valores: string[] = [];

  for (const linea of section.split("\n")) {
    const limpia = linea.trim();
    if (limpia.startsWith(prefijo)) {
      recogiendo = true;
      const valor = limpia.slice(prefijo.length).trim();
      // Un comentario de plantilla no es contenido: la plantilla del harness deja
      // `<!-- Qué duele … -->` dentro de las secciones, y colarlo en un reporte
      // que se lee fuera del equipo sería el peor sitio para un resto.
      if (valor !== "" && !valor.startsWith("<!--")) valores.push(valor);
      continue;
    }
    if (!recogiendo) continue;
    // Otra etiqueta cierra el valor.
    if (/^-\s+[^:]+:/.test(limpia)) break;
    if (limpia !== "" && !limpia.startsWith("<!--")) valores.push(limpia);
  }

  return valores.length === 0 ? null : valores.join(" ");
}

/** El texto plano de una sección, sin viñetas, comentarios ni cercas. */
function plainSection(section: string): string | null {
  const lineas: string[] = [];
  for (const cruda of section.split("\n")) {
    let linea = cruda.trim();
    if (linea === "" || linea.startsWith("<!--") || linea.startsWith("```")) continue;
    linea = linea.replace(/^[-*]\s*/, "").trim();
    // Una línea que termina en dos puntos es un encabezado de lista —«- Dentro:»—
    // y no contenido.
    if (linea !== "" && !linea.endsWith(":")) lineas.push(linea);
  }
  return lineas.length === 0 ? null : lineas.join(" ");
}

/** El resumen funcional del último cierre, o `null` si no lo hay. */
function lastClosureSummary(document: ParsedTicket): string | null {
  const cierres = document.blocks.Cierre;
  const ultimo = cierres[cierres.length - 1];
  if (ultimo === undefined) return null;
  const resumen = ultimo["functional_summary"];
  if (typeof resumen !== "string" || resumen.trim() === "") return null;
  return resumen.trim();
}

/** La fecha del último cierre, o `null` si no hay. */
function lastClosureDate(document: ParsedTicket): string | null {
  const cierres = document.blocks.Cierre;
  const ultimo = cierres[cierres.length - 1];
  if (ultimo === undefined) return null;
  const fecha = ultimo["date"];
  if (typeof fecha !== "string" || fecha.trim() === "") return null;
  return fecha.trim();
}

/**
 * Proyecta un ticket cerrado, o `null` si sigue abierto.
 *
 * Un ticket sin cierre registrado devuelve `null` aunque su estado diga
 * `closed`: el reporte cuenta lo que se hizo, y sin resumen funcional no hay nada
 * que contar. Inventarlo con la descripción del plan sería afirmar algo que nadie
 * confirmó.
 */
export function toReportEntry(document: ParsedTicket): ReportEntry | null {
  if (document.fields.workflow_status !== "closed") return null;

  const resumen = lastClosureSummary(document);
  const cerrado = lastClosureDate(document);
  if (resumen === null || cerrado === null) return null;

  const funcional = document.sections["Descripción funcional"] ?? "";
  const problema =
    labelValue(funcional, "Comportamiento actual") ??
    labelValue(funcional, "Alcance") ??
    plainSection(document.sections["Solicitud original"] ?? "") ??
    PENDING_INFORMATION;

  // El frontmatter guarda los ausentes como la cadena `null`, que es lo que el
  // contrato escribe: distinguirla de una versión de verdad es lo que evita
  // imprimir «publicado en null».
  const releasedIn = document.fields.released_in;

  return {
    ticketId: document.fields.id,
    title: document.fields.title,
    type: document.fields.type,
    module: document.fields.module,
    closedOn: cerrado,
    problem: problema,
    solution: resumen,
    userRelevance: labelValue(funcional, "Usuario o rol afectado"),
    releaseStatus: document.fields.release_status,
    releasedIn: releasedIn === "" || releasedIn === "null" ? null : releasedIn,
  };
}

/**
 * Todos los tickets cerrados del registro, ordenados por fecha de cierre.
 *
 * Un proyecto sin registro devuelve vacío en vez de fallar. `findAllTickets`
 * falla si el directorio no existe, y eso está bien para una mutación —no se
 * escribe en un registro que no está— pero no para esto: pedir el reporte de un
 * proyecto que no tiene tickets es una pregunta legítima, y su respuesta es «no
 * hubo cierres», no «no se encontró el directorio».
 */
export function closedTickets(paths: RegistryPaths): ReportEntry[] {
  if (!existsSync(ticketsPath(paths))) return [];

  return allDocuments(paths)
    .map((registro) => toReportEntry(registro.document))
    .filter((entrada): entrada is ReportEntry => entrada !== null)
    .sort((a, b) => {
      if (a.closedOn !== b.closedOn) return a.closedOn < b.closedOn ? -1 : 1;
      return a.ticketId < b.ticketId ? -1 : a.ticketId > b.ticketId ? 1 : 0;
    });
}

/** Los meses en español, para el encabezado del reporte. */
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** `2026-09-21` → `21 de septiembre de 2026`. */
function formatDate(iso: string, conAnio = true): string {
  const [anio, mes, dia] = iso.split("-");
  const nombre = MESES[Number.parseInt(mes as string, 10) - 1] ?? mes;
  const base = `${Number.parseInt(dia as string, 10)} de ${nombre}`;
  return conAnio ? `${base} de ${anio}` : base;
}

/** El rango en palabras, con la misma elipsis que usaba el visor. */
function formatRange(desde: string, hasta: string): string {
  if (desde === hasta) return formatDate(desde);
  const [anioA, mesA] = desde.split("-");
  const [anioB, mesB] = hasta.split("-");
  if (anioA === anioB && mesA === mesB) {
    const dia = Number.parseInt((hasta.split("-")[2] as string) ?? "0", 10);
    return `${Number.parseInt((desde.split("-")[2] as string) ?? "0", 10)} al ${dia} de ${MESES[Number.parseInt(mesB as string, 10) - 1]} de ${anioB}`;
  }
  if (anioA === anioB) {
    return `${formatDate(desde, false)} al ${formatDate(hasta)}`;
  }
  return `${formatDate(desde)} al ${formatDate(hasta)}`;
}

/**
 * El reporte en Markdown.
 *
 * El encabezado lleva el rango en palabras y no las fechas ISO: es un documento
 * que se lee, y `2026-09-15 al 2026-09-21` se lee peor que `15 al 21 de
 * septiembre de 2026`. El resto del documento es exactamente el del visor, porque
 * es lo que alguien ya estaba usando.
 */
export function renderReport(
  entradas: readonly ReportEntry[],
  desde: string,
  hasta: string,
): string {
  const cabecera = `# Tickets cerrados — ${formatRange(desde, hasta)}\n`;
  if (entradas.length === 0) {
    return `${cabecera}\n_No hubo tickets cerrados en este rango._\n`;
  }

  // La línea que faltaba. «Seis cerrados» y «seis entregados» no son lo mismo, y
  // el título solo dice lo primero: quien lee el informe tiene que poder saber
  // cuánto de esto llegó a una versión sin abrir los tickets uno por uno.
  const publicados = entradas.filter(
    (entrada) => entrada.releaseStatus === "released",
  ).length;
  const sinPublicar = entradas.length - publicados;
  const resumen =
    `> ${contados(entradas.length, "cerrado", "cerrados")} · ` +
    `${contados(publicados, "publicado", "publicados")} · ` +
    `${sinPublicar} sin publicar\n`;

  const bloques = entradas.map(
    (entrada) =>
      `## ${entrada.title}\n\n` +
      `**Se atendió:** ${entrada.problem}\n\n` +
      `**Se realizó:** ${entrada.solution}\n` +
      // Se marca la excepción y no lo esperado: un informe donde todo salió se lee
      // de corrido, y uno donde algo quedó sin entregar lo dice en cada renglón
      // que importa.
      (entrada.releaseStatus === "released"
        ? ""
        : "\n**Sin entregar:** el trabajo está cerrado y todavía no salió en una versión.\n"),
  );
  return `${cabecera}\n${resumen}\n${bloques.join("\n")}`;
}

/**
 * Un número con su palabra en singular o plural.
 *
 * En un informe que lee gente de afuera, «1 cerrado(s)» se lee como un descuido.
 */
function contados(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Una fecha `YYYY-MM-DD` del argumento, o falla diciendo cuál. */
export function parseReportDate(valor: string, bandera: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    fail(`${bandera} debe usar YYYY-MM-DD.`, EXIT_SCHEMA);
  }
  const [anio, mes, dia] = valor
    .split("-")
    .map((parte) => Number.parseInt(parte as string, 10));
  const fecha = new Date(Date.UTC(anio as number, (mes as number) - 1, dia as number));
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== (mes as number) - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    fail(`${bandera} no es una fecha del calendario: ${valor}.`, EXIT_SCHEMA);
  }
  return valor;
}

/** El rango por defecto del visor: los últimos treinta días, hoy incluido. */
export function defaultReportRange(now: Date = new Date()): {
  desde: string;
  hasta: string;
} {
  const hasta = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const desde = new Date(hasta);
  desde.setUTCDate(desde.getUTCDate() - 29);
  const iso = (fecha: Date): string => fecha.toISOString().slice(0, 10);
  return { desde: iso(desde), hasta: iso(hasta) };
}

/** Filtra por rango de cierre, tipo y texto libre. */
export function filterReport(
  entradas: readonly ReportEntry[],
  filtros: {
    readonly desde: string;
    readonly hasta: string;
    readonly type?: string | undefined;
    readonly query?: string | undefined;
  },
): ReportEntry[] {
  const consulta = (filtros.query ?? "").trim().toLowerCase();
  return entradas.filter((entrada) => {
    if (entrada.closedOn < filtros.desde || entrada.closedOn > filtros.hasta) {
      return false;
    }
    if (filtros.type !== undefined && entrada.type !== filtros.type) return false;
    if (consulta !== "") {
      // Se busca sobre el texto funcional visible —título, problema, solución y
      // rol— y no sobre el ticket entero: un resultado que sale por una línea del
      // plan no es interpretable en un reporte para comunicar.
      const texto = [
        entrada.title,
        entrada.problem,
        entrada.solution,
        entrada.userRelevance ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!texto.includes(consulta)) return false;
    }
    return true;
  });
}
