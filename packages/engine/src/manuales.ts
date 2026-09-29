/**
 * Detección de manuales que una release dejó desactualizados.
 *
 * Una release publica los tickets que trabajó, y esos tickets declaran en sus
 * puntos qué archivos tocaron. Los manuales de usuario final declaran, en su
 * línea `<!-- rutas-fuente: … -->`, de qué archivos hablan. Este módulo **cruza
 * las dos listas** y devuelve lo que quedó viejo, que es la pieza que hoy no
 * existe: el cálculo del hash de la evidencia
 * (`declaredFunctionalFiles`, `references.ts`) lee la misma lista, pero para
 * describir un estado de trabajo, no para preguntarse qué manual envejeció.
 *
 * Tres decisiones gobiernan la detección, y las tres están escritas en el plan
 * del ticket:
 *
 * 1. **Se cruzan archivos declarados, no fechas de commit.** «El código cambió
 *    después del manual» no dice que **esta** release lo cambió, y atar la
 *    detección al último commit de cada archivo la haría dependiente de git.
 * 2. **Nada se cruza a ciegas.** Una fuente que no es una ruta de archivo del
 *    repositorio —una ruta de aplicación como `/admin/plantillas`, o cualquier
 *    otro texto— no se resuelve: se declara en `sinResolver` para que quien lea
 *    sepa que ese manual no se pudo evaluar del todo.
 * 3. **La marca vive en el listado, no dentro del manual.** Marcar es escribir
 *    una fila con el ticket y la fuente; el `.md` queda intacto. Editar manuales
 *    es del paso de generación y auditarlos, del gate que los audita.
 *
 * La comparación de `pantallas` es deliberadamente mínima y sin dependencias
 * —el motor no tiene ninguna y no se le agrega una para comparar dos globs—:
 * un patrón que empieza con el prefijo de doble asterisco matchea por sufijo de
 * ruta (el `*` del resto no cruza separadores) y cualquier otro matchea por
 * igualdad exacta.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { type ParsedTicket, parseTicket } from "@valmen/core";

import { type RegistryPaths, findTicket } from "./discovery.js";
import { declaredFunctionalFiles } from "./references.js";

/** Dónde viven los manuales de usuario final, por defecto. */
export const MANUALES_POR_DEFECTO = "docs/manuales/usuario-final";

/** Qué archivos son una pantalla, por defecto: el patrón de este stack. */
export const PANTALLAS_POR_DEFECTO = ["**/*.component.ts", "**/*.component.html"];

/** Un manual que la release dejó desactualizado. */
export interface ManualDesactualizado {
  /** Ruta del manual relativa a la raíz. */
  readonly manual: string;
  /** El `# Título` del manual, si lo tiene. */
  readonly titulo: string | null;
  /** El ticket de la release que lo desactualiza. */
  readonly ticket: string;
  /** El archivo tocado que lo desactualiza. */
  readonly fuente: string;
  /** Por qué quedó desactualizado. */
  readonly motivo: "manual-tocado" | "fuente-tocada";
}

/** Una pantalla tocada por la release que ningún manual declara. */
export interface PantallaSinManual {
  readonly ticket: string;
  readonly archivo: string;
}

/** Una fuente declarada por un manual que no se pudo resolver a un archivo. */
export interface FuenteSinResolver {
  readonly manual: string;
  readonly fuente: string;
}

/** Un ticket válido que no declara ningún archivo en sus puntos. */
export interface SinArchivosDeclarados {
  readonly ticket: string;
}

/** El resultado completo de la detección. */
export interface ManualesPendientes {
  /** ISO-8601 de la corrida. */
  readonly fecha: string;
  /** Los tickets que se pidieron, en ese orden. */
  readonly tickets: readonly string[];
  /** Ids pedidos que no están en el registro. */
  readonly ausentes: readonly string[];
  /** Tickets de la release que no declaran archivos. */
  readonly sinArchivos: readonly string[];
  /** Los manuales que quedaron viejos. */
  readonly desactualizados: readonly ManualDesactualizado[];
  /** Pantallas tocadas que ningún manual declara. */
  readonly sinManual: readonly PantallaSinManual[];
  /** Fuentes declaradas que no se pudieron resolver. */
  readonly sinResolver: readonly FuenteSinResolver[];
}

/** Opciones de la detección. */
export interface OpcionesManuales {
  readonly tickets: readonly string[];
  readonly manualesDir?: string;
  readonly pantallas?: readonly string[];
  /** Inyectable para las pruebas. */
  readonly ahora?: Date;
}

/** Un manual leído de disco, con lo que declara. */
interface ManualLeido {
  readonly relativa: string;
  readonly titulo: string | null;
  /** Los tokens crudos de su línea `rutas-fuente`. */
  readonly fuentes: readonly string[];
}

/** Convierte una ruta absoluta en relativa a la raíz y con separadores POSIX. */
function aRelativa(root: string, absoluta: string): string {
  return relative(root, absoluta).split(sep).join("/");
}

/** El `# Título` del manual: la primera línea que es un encabezado de nivel 1. */
function tituloDe(texto: string): string | null {
  const coincidencia = /^#\s+(.+?)\s*$/m.exec(texto);
  return coincidencia === null ? null : (coincidencia[1] as string).trim();
}

/**
 * Los tokens de la línea `<!-- rutas-fuente: … -->`.
 *
 * Es la misma forma que usa el proyecto adoptado: tokens separados por coma,
 * que admiten espacios y backticks alrededor. Sin línea, la lista es vacía: un
 * manual que no declara fuentes no se puede cruzar, y eso se ve en el listado.
 */
function fuentesDe(texto: string): string[] {
  const coincidencia = /<!--\s*rutas-fuente:\s*([\s\S]*?)-->/.exec(texto);
  if (coincidencia === null) return [];
  return (coincidencia[1] as string)
    .split(",")
    .map((token) => token.trim().replace(/^`+/, "").replace(/`+$/, "").trim())
    .filter((token) => token !== "");
}

/** `true` si el token parece una ruta de archivo del repositorio. */
function esRutaDeArchivo(token: string): boolean {
  // Una ruta de aplicación —`/admin/plantillas`— empieza con `/` y una fuente en
  // prosa no tiene punto: las dos se declaran sin resolver, nunca se cruzan.
  return !token.startsWith("/") && token.includes(".");
}

/** Recorre un directorio y devuelve los `.md`, en orden estable por ruta. */
function recorrerManuales(entradas: string[], base: string): void {
  let hijos;
  try {
    hijos = readdirSync(base, { withFileTypes: true });
  } catch {
    // Un directorio que no existe o no se puede leer no es un error: el listado
    // dirá que no encontró manuales.
    return;
  }
  hijos.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const hijo of hijos) {
    const ruta = join(base, hijo.name);
    if (hijo.isDirectory()) recorrerManuales(entradas, ruta);
    else if (hijo.isFile() && hijo.name.endsWith(".md")) entradas.push(ruta);
  }
}

/** Los manuales de un proyecto, ya leídos, en orden estable por ruta. */
function leerManuales(root: string, manualesDir: string): ManualLeido[] {
  const base = join(root, ...manualesDir.split("/"));
  if (!existsSync(base)) return [];

  const rutas: string[] = [];
  recorrerManuales(rutas, base);
  rutas.sort((a, b) => {
    const ra = aRelativa(root, a);
    const rb = aRelativa(root, b);
    return ra < rb ? -1 : ra > rb ? 1 : 0;
  });

  return rutas.map((ruta) => {
    const texto = readFileSync(ruta, "utf8");
    return {
      relativa: aRelativa(root, ruta),
      titulo: tituloDe(texto),
      fuentes: fuentesDe(texto),
    };
  });
}

/** Escapa los caracteres que en una expresión regular tienen significado. */
function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `true` si el archivo coincide con algún patrón de pantalla.
 *
 * La regla mínima está en el encabezado: el prefijo de doble asterisco matchea
 * por sufijo de ruta y cualquier otro patrón por igualdad exacta.
 */
function esPantalla(archivo: string, patrones: readonly string[]): boolean {
  for (const patron of patrones) {
    if (patron.startsWith("**/")) {
      const sufijo = patron.slice(3);
      const cuerpo = sufijo.split("*").map(escaparRegex).join("[^/]*");
      if (new RegExp(`(?:^|/)${cuerpo}$`).test(archivo)) return true;
      continue;
    }
    if (archivo === patron) return true;
  }
  return false;
}

/**
 * Detecta qué manuales desactualizó una release de tickets.
 *
 * Nunca falla por un ticket ausente: se declara en `ausentes` y la corrida
 * sigue, porque el listado existe para que alguien lo lea, no para abortar por
 * un id mal escrito.
 */
export function manualesPendientes(
  paths: RegistryPaths,
  opciones: OpcionesManuales,
): ManualesPendientes {
  const manualesDir = opciones.manualesDir ?? MANUALES_POR_DEFECTO;
  const pantallas = opciones.pantallas ?? PANTALLAS_POR_DEFECTO;
  const ahora = opciones.ahora ?? new Date();

  const ausentes: string[] = [];
  const sinArchivos: string[] = [];
  // Archivo tocado -> tickets que lo declararon, en el orden en que se pidieron.
  const tocados = new Map<string, string[]>();

  for (const id of opciones.tickets) {
    const localizado = findTicket(paths, id);
    if (localizado === undefined) {
      ausentes.push(id);
      continue;
    }
    const documento: ParsedTicket = parseTicket(localizado.text);
    const archivos = declaredFunctionalFiles(
      documento,
      localizado.absolutePath,
      paths.root,
    );
    if (archivos.length === 0) {
      sinArchivos.push(id);
      continue;
    }
    for (const archivo of archivos) {
      const lista = tocados.get(archivo) ?? [];
      if (!lista.includes(id)) lista.push(id);
      tocados.set(archivo, lista);
    }
  }

  const manuales = leerManuales(paths.root, manualesDir);

  const desactualizados: ManualDesactualizado[] = [];
  const sinResolver: FuenteSinResolver[] = [];
  const resueltosVistos = new Set<string>();
  // Todo lo que algún manual declara: sus propias rutas y sus fuentes que son
  // rutas de archivo. Es lo que decide si una pantalla quedó sin manual.
  const declarados = new Set<string>();

  for (const manual of manuales) {
    declarados.add(manual.relativa);

    // Un manual aparece una sola vez: primero si lo tocaron a él, después si
    // alguna de sus fuentes es un archivo tocado. Las fuentes se recorren
    // igual —para declarar lo que el manual nombra y lo que no se resuelve—,
    // aunque la marca ya esté puesta.
    let marcado = false;
    const tocadoPorManual = tocados.get(manual.relativa);
    if (tocadoPorManual !== undefined) {
      desactualizados.push({
        manual: manual.relativa,
        titulo: manual.titulo,
        ticket: tocadoPorManual[0] as string,
        fuente: manual.relativa,
        motivo: "manual-tocado",
      });
      marcado = true;
    }

    for (const fuente of manual.fuentes) {
      if (!esRutaDeArchivo(fuente)) {
        const clave = `${manual.relativa}\u0000${fuente}`;
        if (!resueltosVistos.has(clave)) {
          resueltosVistos.add(clave);
          sinResolver.push({ manual: manual.relativa, fuente });
        }
        continue;
      }
      declarados.add(fuente);
      if (marcado) continue;
      const tocadoPorFuente = tocados.get(fuente);
      if (tocadoPorFuente !== undefined) {
        desactualizados.push({
          manual: manual.relativa,
          titulo: manual.titulo,
          ticket: tocadoPorFuente[0] as string,
          fuente,
          motivo: "fuente-tocada",
        });
        marcado = true;
      }
    }
  }

  const sinManual: PantallaSinManual[] = [];
  for (const [archivo, tickets] of [...tocados.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  )) {
    if (declarados.has(archivo)) continue;
    if (!esPantalla(archivo, pantallas)) continue;
    sinManual.push({ ticket: tickets[0] as string, archivo });
  }

  return {
    fecha: ahora.toISOString(),
    tickets: [...opciones.tickets],
    ausentes,
    sinArchivos,
    desactualizados,
    sinManual,
    sinResolver,
  };
}

/** Una lista del listado, o «(ninguno)» para que la ausencia se vea. */
function bloque(titulo: string, lineas: readonly string[]): string[] {
  return [titulo, ...(lineas.length === 0 ? ["  (ninguno)"] : lineas)];
}

/**
 * El listado, en texto.
 *
 * Cada encabezado se imprime siempre, incluso vacío: un listado que no dice
 * «ninguno» deja dudando de si la corrida miró esa lista o no.
 */
export function renderPendientes(resultado: ManualesPendientes): string {
  const lineas: string[] = [
    `Manuales pendientes — corrida del ${resultado.fecha}`,
    `Tickets cubiertos: ${resultado.tickets.length === 0 ? "(ninguno)" : resultado.tickets.join(", ")}`,
    "",
  ];

  lineas.push(
    ...bloque(
      "Manuales desactualizados:",
      resultado.desactualizados.map((entrada) => {
        const titulo = entrada.titulo === null ? "" : ` (${entrada.titulo})`;
        return `  - ${entrada.manual}${titulo} — ticket ${entrada.ticket}, fuente ${entrada.fuente}, motivo ${entrada.motivo}`;
      }),
    ),
  );
  lineas.push("");
  lineas.push(
    ...bloque(
      "Pantallas sin manual:",
      resultado.sinManual.map(
        (entrada) => `  - ${entrada.archivo} — ticket ${entrada.ticket}`,
      ),
    ),
  );
  lineas.push("");
  lineas.push(
    ...bloque(
      "Fuentes sin resolver:",
      resultado.sinResolver.map((entrada) => `  - ${entrada.manual}: ${entrada.fuente}`),
    ),
  );
  lineas.push("");
  lineas.push(
    ...bloque(
      "Tickets sin archivos declarados:",
      resultado.sinArchivos.map((ticket) => `  - ${ticket}`),
    ),
  );
  lineas.push("");
  lineas.push(
    ...bloque(
      "Tickets ausentes del registro:",
      resultado.ausentes.map((ticket) => `  - ${ticket}`),
    ),
  );

  const total =
    resultado.desactualizados.length +
    resultado.sinManual.length +
    resultado.sinResolver.length +
    resultado.sinArchivos.length +
    resultado.ausentes.length;
  lineas.push("", `Total: ${total} hallazgo(s)`);

  return lineas.join("\n") + "\n";
}
