/**
 * Publicación del registro como corpus derivado para índices sustituibles.
 *
 * El contrato es un documento por manual, entrada de memoria o ticket cerrado:
 * {coleccion, id, origen, fecha, titulo, hash, texto}. No trocea ni embebe: esas
 * decisiones pertenecen al destino, no al motor determinista.
 *
 * 1. Las colecciones se separan para que el consumidor elija qué conocimiento
 *    recuperar. El origen es relativo (ruta:línea en memoria) y la fecha es la
 *    declarada por la fuente; una ausencia queda vacía, nunca se inventa.
 * 2. El indexador se inyecta. El de fábrica anexa documentos y bajas a JSONL;
 *    ninguna base vectorial ni conexión entra como dependencia del motor.
 * 3. El delta compara SHA-256 del texto con estado.json, no mtime: clonar o
 *    restaurar archivos no cambia su contenido. Los ids incluyen la colección
 *    para evitar colisiones; los de memoria incluyen su ubicación de origen.
 * 4. Se reusan loadMemory y listTickets. Solo el recorrido de manuales es propio:
 *    los recorridos existentes son privados y no entregan el texto con fecha.
 * 5. El corpus es derivado, fuera del registro: borrar el estado republica todo.
 *    El estado avanza solo cuando el destino acepta el lote. Un reintento puede
 *    repetir documentos; el consumidor conserva la última versión por id.
 * 6. El proceso publica al final de actualizar-manuales, después de auditarlos,
 *    para que una release no deje el índice viejo; no cambia el gate del deploy.
 */
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { configList, type RegistryPaths } from "./discovery.js";
import { loadMemory } from "./memory.js";
import { MANUALES_POR_DEFECTO } from "./manuales.js";
import { listTickets } from "./tickets.js";

export const COLECCIONES = ["manuales", "memoria", "tickets"] as const;
export type ColeccionCorpus = (typeof COLECCIONES)[number];

export interface DocumentoCorpus {
  readonly coleccion: ColeccionCorpus;
  /** Identidad global, con el prefijo de colección. */
  readonly id: string;
  readonly origen: string;
  readonly fecha: string;
  readonly titulo: string;
  readonly hash: string;
  readonly texto: string;
}

/** Una baja no borra historia: se anexa y el consumidor retira el id del índice. */
export interface EliminadoCorpus {
  readonly coleccion: ColeccionCorpus;
  readonly id: string;
}

export interface LoteCorpus {
  readonly documentos: readonly DocumentoCorpus[];
  readonly eliminados: readonly EliminadoCorpus[];
}

/** Destino síncrono: si falla, lanza y el publicador no confirma el estado. */
export type IndexadorCorpus = (lote: LoteCorpus, corpusDir: string) => void;

export interface CorpusPublicado extends LoteCorpus {
  readonly corpusDir: string;
  readonly total: number;
  readonly sinCambios: number;
}

export interface OpcionesCorpus {
  readonly corpusDir?: string;
  readonly manualesDir?: string;
  readonly completo?: boolean;
  readonly indexador?: IndexadorCorpus;
}

/** El destino de fábrica solo escribe el delta; nunca reemplaza lo publicado. */
export const INDEXADORES_CORPUS: Readonly<Record<string, IndexadorCorpus>> = {
  archivos(lote, corpusDir) {
    mkdirSync(corpusDir, { recursive: true });
    for (const documento of lote.documentos) {
      appendFileSync(
        join(corpusDir, `${documento.coleccion}.jsonl`),
        `${JSON.stringify(documento)}\n`,
        "utf8",
      );
    }
    for (const eliminado of lote.eliminados) {
      appendFileSync(
        join(corpusDir, `${eliminado.coleccion}.jsonl`),
        `${JSON.stringify({ ...eliminado, eliminado: true })}\n`,
        "utf8",
      );
    }
  },
};

/** Recorrido mínimo, estable y sin seguir enlaces simbólicos. */
function recorrerManuales(base: string): string[] {
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((hijo) => {
      const ruta = join(base, hijo.name);
      if (hijo.isDirectory()) return recorrerManuales(ruta);
      return hijo.isFile() && hijo.name.endsWith(".md") ? [ruta] : [];
    });
}

function documento(
  coleccion: ColeccionCorpus,
  clave: string,
  origen: string,
  fecha: string,
  titulo: string,
  texto: string,
): DocumentoCorpus {
  return {
    coleccion,
    id: `${coleccion}:${clave}`,
    origen,
    fecha,
    titulo,
    hash: createHash("sha256").update(texto, "utf8").digest("hex"),
    texto,
  };
}

/** Lee las tres fuentes sin escribir ni consultar el estado de publicación. */
export function construirCorpus(
  paths: RegistryPaths,
  opciones: Pick<OpcionesCorpus, "manualesDir"> = {},
): DocumentoCorpus[] {
  const documentos = recorrerManuales(
    resolve(paths.root, opciones.manualesDir ?? MANUALES_POR_DEFECTO),
  ).map((ruta) => {
    const origen = relative(paths.root, ruta).split(sep).join("/");
    const texto = readFileSync(ruta, "utf8");
    const fecha =
      /^\*\*Última actualización:\*\*[^\S\r\n]*([^\r\n]*)/m.exec(texto)?.[1]?.trim() ?? "";
    const titulo = /^#[ \t]+([^\r\n]+)/m.exec(texto)?.[1]?.trim() ?? "";
    return documento("manuales", origen, origen, fecha, titulo, texto);
  });

  for (const entry of loadMemory(paths)) {
    const origen = `${entry.source.path.split(sep).join("/")}:${entry.source.line}`;
    // Incluye el título en el texto para que cambiarlo también cambie el hash.
    const texto = `${entry.id === null ? "" : `[${entry.id}] `}${entry.title}\n\n${entry.body}`;
    documentos.push(
      documento("memoria", origen, origen, entry.date ?? "", entry.title, texto),
    );
  }
  for (const ticket of listTickets(paths)) {
    if (ticket.workflowStatus !== "closed") continue;
    documentos.push(
      documento(
        "tickets",
        ticket.id,
        ticket.path,
        ticket.closedOn ?? ticket.updated,
        ticket.title,
        readFileSync(resolve(paths.root, ticket.path), "utf8"),
      ),
    );
  }
  return documentos;
}

/** Un estado ilegible no se silencia: solo la ausencia significa primera pasada. */
function leerEstado(ruta: string): Record<string, string> {
  if (!existsSync(ruta)) return {};
  let estado: unknown;
  try {
    estado = JSON.parse(readFileSync(ruta, "utf8"));
  } catch {
    throw new Error(`No se pudo leer el estado del corpus: ${ruta}.`);
  }
  if (
    estado === null ||
    typeof estado !== "object" ||
    Array.isArray(estado) ||
    Object.entries(estado).some(
      ([id, hash]) =>
        !COLECCIONES.some((coleccion) => id.startsWith(`${coleccion}:`)) ||
        typeof hash !== "string" ||
        !/^[a-f0-9]{64}$/.test(hash),
    )
  ) {
    throw new Error(`El estado del corpus no es un mapa de ids a SHA-256: ${ruta}.`);
  }
  return estado as Record<string, string>;
}

/** Publica altas, cambios y bajas, y confirma el estado después del destino. */
export function publicarCorpus(
  paths: RegistryPaths,
  opciones: OpcionesCorpus = {},
): CorpusPublicado {
  const corpusDir = resolve(paths.root, opciones.corpusDir ?? ".valmen/corpus");
  const nombre = configList(paths.root, "corpus-indexer")[0] ?? "archivos";
  const indexador =
    opciones.indexador ??
    (Object.hasOwn(INDEXADORES_CORPUS, nombre) ? INDEXADORES_CORPUS[nombre] : undefined);
  if (indexador === undefined) {
    throw new Error(
      `Indexador de corpus desconocido: ${nombre}. Válidos: ${Object.keys(INDEXADORES_CORPUS).join(", ")}.`,
    );
  }
  const todos = construirCorpus(paths, opciones);
  const rutaEstado = join(corpusDir, "estado.json");
  const anterior = leerEstado(rutaEstado);
  const estado = Object.fromEntries(todos.map((doc) => [doc.id, doc.hash]));
  const documentos = todos.filter(
    (doc) => opciones.completo === true || anterior[doc.id] !== doc.hash,
  );
  const eliminados = Object.keys(anterior)
    .filter((id) => !Object.hasOwn(estado, id))
    .sort()
    .map((id): EliminadoCorpus => ({
      id,
      coleccion: id.slice(0, id.indexOf(":")) as ColeccionCorpus,
    }));
  const lote: LoteCorpus = { documentos, eliminados };
  indexador(lote, corpusDir);
  mkdirSync(corpusDir, { recursive: true });
  // El estado es reemplazable, a diferencia de los JSONL: el rename evita un
  // archivo a medio escribir si el proceso se interrumpe durante la confirmación.
  const temporal = `${rutaEstado}.tmp`;
  writeFileSync(temporal, `${JSON.stringify(estado, null, 2)}\n`, "utf8");
  renameSync(temporal, rutaEstado);
  return {
    ...lote,
    corpusDir,
    total: todos.length,
    sinCambios: todos.length - documentos.length,
  };
}

export function renderCorpus(resultado: CorpusPublicado): string {
  const lineas = [`Corpus publicado en ${resultado.corpusDir}`];
  for (const coleccion of COLECCIONES) {
    lineas.push(
      `  ${coleccion}: ${resultado.documentos.filter((doc) => doc.coleccion === coleccion).length} publicado(s), ${resultado.eliminados.filter((doc) => doc.coleccion === coleccion).length} eliminado(s)`,
    );
  }
  lineas.push(
    `Total: ${resultado.total} documento(s); ${resultado.sinCambios} sin cambios.`,
  );
  return `${lineas.join("\n")}\n`;
}
