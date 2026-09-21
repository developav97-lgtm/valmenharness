/**
 * Descubrimiento de tickets en disco.
 *
 * El core no toca el sistema de archivos: esta capa le entrega el texto y las
 * rutas. Separa la política (dónde viven los tickets) del contrato (qué forma
 * tienen), que es lo que permite mover el registro sin tocar el validador.
 *
 * Las rutas son configurables porque un proyecto adoptado puede tener el
 * registro en `docs/tickets/` y un proyecto nuevo en `tickets/`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { EXIT_SCHEMA, fail } from "@valmen/core";

/** Un ticket leído de disco, con su ruta relativa a la raíz del proyecto. */
export interface LocatedTicket {
  /** Identificador del ticket, tomado del nombre del directorio. */
  readonly id: string;
  /** Ruta absoluta del `ticket.md`. */
  readonly absolutePath: string;
  /** Ruta relativa a la raíz del proyecto, con separadores POSIX. */
  readonly relativePath: string;
  /** Contenido íntegro del archivo. */
  readonly text: string;
}

/**
 * Rutas del registro de tickets.
 *
 * `root` es la raíz del proyecto; `ticketsDir` es relativa a ella.
 */
export interface RegistryPaths {
  readonly root: string;
  readonly ticketsDir: string;
}

/** Rutas por defecto: el proyecto gestionado con el harness. */
export function defaultPaths(root: string): RegistryPaths {
  return { root, ticketsDir: "tickets" };
}

/** Rutas del layout anterior, el que usa un proyecto adoptado sin migrar. */
export function legacyPaths(root: string): RegistryPaths {
  return { root, ticketsDir: "docs/tickets" };
}

/**
 * Elige el directorio del registro mirando el proyecto.
 *
 * Se prefiere `docs/tickets` si ya existe: un proyecto adoptado no debe tener que
 * mover su registro para empezar a usar el harness. Vive aquí, y no en el
 * adaptador, porque es una decisión sobre el registro —el adaptador proyecta
 * configuración a archivos de agentes y no tiene por qué saber dónde viven los
 * tickets—. Mission Control la usa para no hardcodear `tickets/` y mostrar el
 * registro vacío en un proyecto adoptado.
 */
export function chooseTicketsDir(root: string): string {
  const anterior = join(root, "docs", "tickets");
  const nuevo = join(root, "tickets");

  // Primero se busca **dónde hay tickets**, y solo después dónde hay un
  // directorio. La diferencia importa: un `docs/tickets` vacío —creado por error
  // o dejado por una prueba— desviaba el registro al layout anterior en silencio,
  // y el harness mostraba un registro vacío con los tickets a la vista.
  if (contieneTickets(anterior)) return "docs/tickets";
  if (contieneTickets(nuevo)) return "tickets";

  if (existsSync(anterior)) return "docs/tickets";
  if (existsSync(nuevo)) return "tickets";
  return "tickets";
}

/** `true` si el directorio tiene al menos un `ticket.md` en su segundo nivel. */
function contieneTickets(base: string): boolean {
  let anios: string[];
  try {
    anios = readdirSync(base);
  } catch {
    return false;
  }
  for (const anio of anios) {
    let ids: string[];
    try {
      ids = readdirSync(join(base, anio));
    } catch {
      continue;
    }
    for (const id of ids) {
      if (existsSync(join(base, anio, id, "ticket.md"))) return true;
    }
  }
  return false;
}

/**
 * Rutas del registro para un proyecto, detectando el layout.
 *
 * Es lo que permite que `valmen serve` funcione sobre un proyecto adoptado sin
 * que nadie tenga que recordar `--legacy-layout`.
 */
export function choosePaths(root: string): RegistryPaths {
  return { root, ticketsDir: chooseTicketsDir(root) };
}

/** Ruta absoluta del directorio de tickets. */
export function ticketsPath(paths: RegistryPaths): string {
  return join(paths.root, paths.ticketsDir);
}

/** Ruta del índice derivado. */
export function indexPath(paths: RegistryPaths): string {
  return join(ticketsPath(paths), "index.md");
}

/** Convierte una ruta absoluta en relativa a la raíz, con separadores POSIX. */
export function toRelative(paths: RegistryPaths, absolute: string): string {
  return relative(paths.root, absolute).split(sep).join("/");
}

/**
 * Comprueba que una ruta no contenga enlaces simbólicos.
 *
 * El registro de tickets es append-only y auditable: un enlace simbólico
 * permitiría que un ticket apunte fuera del repositorio y rompería esa
 * garantía. El CLI de referencia lo rechaza y el harness conserva la regla.
 */
function assertNoSymlink(paths: RegistryPaths, absolute: string): void {
  try {
    if (statSync(absolute).isSymbolicLink()) {
      fail("La ruta canónica contiene un enlace simbólico.");
    }
  } catch {
    // Si no existe, el error lo reporta quien intenta leerlo.
  }
}

/**
 * Recorre el registro y devuelve todos los `ticket.md` encontrados.
 *
 * El orden es por ruta relativa como texto, para que dos ejecuciones produzcan
 * siempre la misma salida. Sin esa garantía, un índice generado no sería
 * reproducible y el check de frescura daría falsos positivos.
 */
export function findAllTickets(paths: RegistryPaths): LocatedTicket[] {
  const base = ticketsPath(paths);

  let years: string[] = [];
  try {
    years = readdirSync(base);
  } catch {
    fail(`No se encontró el directorio de tickets: ${paths.ticketsDir}`);
  }

  const found: LocatedTicket[] = [];

  for (const year of years) {
    const yearPath = join(base, year);
    if (!statSync(yearPath).isDirectory()) continue;

    for (const id of readdirSync(yearPath)) {
      const ticketDir = join(yearPath, id);
      if (!statSync(ticketDir).isDirectory()) continue;

      const file = join(ticketDir, "ticket.md");
      let text: string;
      try {
        const info = statSync(file);
        if (info.isSymbolicLink()) {
          fail(`El ticket ${id} es un enlace simbólico no permitido.`);
        }
        if (!info.isFile()) continue;
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }

      found.push({
        id,
        absolutePath: file,
        relativePath: toRelative(paths, file),
        text,
      });
    }
  }

  found.sort((a, b) =>
    a.relativePath < b.relativePath
      ? -1
      : a.relativePath > b.relativePath
        ? 1
        : 0,
  );
  return found;
}

/** Localiza un ticket por identificador. */
export function findTicket(
  paths: RegistryPaths,
  id: string,
): LocatedTicket | undefined {
  const year = id.slice(-8, -4);
  const file = join(ticketsPath(paths), year, id, "ticket.md");
  assertNoSymlink(paths, file);
  try {
    if (!statSync(file).isFile()) return undefined;
    return {
      id,
      absolutePath: file,
      relativePath: toRelative(paths, file),
      text: readFileSync(file, "utf8"),
    };
  } catch {
    return undefined;
  }
}

export { EXIT_SCHEMA };
