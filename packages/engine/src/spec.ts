/**
 * Los requisitos de una spec.
 *
 * Una spec es un documento por dominio —`spec/inventario/spec.md`— con
 * requisitos en RFC 2119 y escenarios GIVEN/WHEN/THEN. El motor no interpreta la
 * prosa: extrae los requisitos **identificados** y sus enunciados, porque son la
 * unidad contra la que se comprueba la cobertura.
 *
 * ```markdown
 * ### Requirement: R-INV-001 — Registro de movimientos
 *
 * El sistema DEBE registrar cada movimiento con su saldo resultante.
 *
 * #### Scenario: Entrada por compra
 * - **GIVEN** una orden de compra recibida
 * - **WHEN** se confirma la recepción
 * - **THEN** el saldo del producto aumenta
 * ```
 *
 * La regla es estricta a propósito: **un requisito sin palabra normativa no es un
 * requisito**. «El listado muestra los saldos» es una descripción, y la compuerta
 * de cobertura no puede exigir un ticket por una descripción —ni dejar pasar un
 * requisito sin exigirlo—. Quien escribe una spec lo aprende en el primer
 * intento, con el error delante.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { EXIT_SCHEMA, type FeatureRequirement, fail } from "@valmen/core";

/** Un requisito con la spec de la que salió, para poder señalarla. */
export interface LocatedRequirement extends FeatureRequirement {
  /** El dominio: el nombre de la carpeta bajo `spec/`. */
  readonly domain: string;
  /** El archivo, relativo a la raíz del proyecto. */
  readonly source: string;
}

/** Las palabras normativas que convierten un enunciado en requisito. */
export const RFC2119_WORDS = [
  "DEBE",
  "DEBERÁ",
  "DEBEN",
  "DEBERÁN",
  "NO DEBE",
  "NO DEBEN",
  "DEBERÍA",
  "DEBERÍAN",
  "NO DEBERÍA",
  "PUEDE",
  "PUEDEN",
  "NO PUEDE",
] as const;

/**
 * El identificador de un requisito: `R-<DOMINIO>-<NNN>`.
 *
 * Se exige la forma completa —dominio en letras y número al final— y no «lo que
 * haya antes del guion». Con una forma laxa, `### Requirement: R-INV-001 Y algo
 * más` se leía como el requisito `R-INV` con el enunciado «001 Y algo más», que
 * después pasa la comprobación de palabra normativa si el texto la lleva. El
 * número al final es la convención del proyecto, y exigirla convierte un
 * identificador mal escrito en un error en vez de en un requisito con un nombre
 * raro.
 */
const ID_PATTERN = "R-[A-Z]+(?:-[A-Z]+)*-\\d{3}";
/** `### Requirement: R-INV-001 — Registro de movimientos` */
const HEADING_RE = new RegExp(
  `^###\\s+Requirement:\\s*(${ID_PATTERN})\\s*(?:—|-|:)\\s*(.+?)\\s*$`,
);
/** `### Requirement: R-INV-001` sin enunciado. */
const HEADING_SIN_TITULO_RE = new RegExp(`^###\\s+Requirement:\\s*(${ID_PATTERN})\\s*$`);

/**
 * Extrae los requisitos de un texto de spec.
 *
 * El enunciado es el **título del encabezado** y no el primer párrafo: es lo que
 * cabe en un mensaje de error de la compuerta, y quien tiene que arreglar un
 * hueco lo lee ahí. El párrafo completo se lee en la spec, que es donde está.
 */
export function parseRequirements(
  text: string,
  domain: string,
  source: string,
): LocatedRequirement[] {
  const requisitos: LocatedRequirement[] = [];
  const vistos = new Set<string>();

  text.split(/\r?\n/).forEach((linea, indice) => {
    const numero = indice + 1;
    const match = HEADING_RE.exec(linea) ?? HEADING_SIN_TITULO_RE.exec(linea);
    if (match === null) return;

    const id = match[1] as string;
    if (vistos.has(id)) {
      // Dos requisitos con el mismo identificador hacen que la cobertura cubra
      // uno y deje el otro suelto, sin que nada lo diga.
      fail(`${source} línea ${numero}: el requisito ${id} está repetido.`, EXIT_SCHEMA);
    }
    vistos.add(id);

    const titulo = (match[2] ?? "").trim();
    if (titulo === "") {
      fail(
        `${source} línea ${numero}: el requisito ${id} no tiene enunciado. ` +
          "Escríbelo tras el guion: `### Requirement: R-INV-001 — qué se exige`.",
        EXIT_SCHEMA,
      );
    }

    requisitos.push({
      id,
      statement: exigirNormativo(titulo, source, numero, id),
      domain,
      source,
    });
  });

  return requisitos;
}

/**
 * Comprueba que el enunciado diga qué se exige, no qué se hace.
 *
 * Sin palabra normativa no hay forma de saber si el requisito es obligatorio o
 * una idea, y la compuerta trata igual las dos cosas. Se busca la palabra en
 * mayúsculas: mezclada con el texto —«debe»— no se distingue de una descripción,
 * y la convención de RFC 2119 es escribirla así.
 */
function exigirNormativo(
  titulo: string,
  source: string,
  linea: number,
  id: string,
): string {
  const palabras = RFC2119_WORDS.filter((palabra) => titulo.includes(palabra));
  if (palabras.length === 0) {
    fail(
      `${source} línea ${linea}: el enunciado de ${id} no dice qué se exige. ` +
        "Un requisito necesita una palabra normativa en mayúsculas: " +
        `${RFC2119_WORDS.join(", ")}.`,
      EXIT_SCHEMA,
    );
  }
  return titulo;
}

/**
 * Lee las specs de una feature con su texto.
 *
 * La interfaz necesita el texto además de los requisitos: sin él no puede
 * mostrar la spec, y volver a leer el archivo por su cuenta sería una segunda
 * forma de encontrar specs que se rompería en cuanto cambie la disposición de las
 * carpetas.
 */
export function readSpecs(
  specDir: string,
  prefijo: string,
): { domain: string; source: string; text: string; requirements: LocatedRequirement[] }[] {
  const specs = [];
  for (const dominio of specDomains(specDir)) {
    const ruta = join(specDir, dominio, "spec.md");
    let texto: string;
    try {
      texto = readFileSync(ruta, "utf8");
    } catch {
      continue;
    }
    const source = `${prefijo}/spec/${dominio}/spec.md`;
    specs.push({
      domain: dominio,
      source,
      text: texto,
      requirements: parseRequirements(texto, dominio, source),
    });
  }
  return specs;
}

/** Los dominios de una feature: las carpetas bajo `spec/`. */
export function specDomains(specDir: string): string[] {
  let entradas: string[];
  try {
    entradas = readdirSync(specDir);
  } catch {
    return [];
  }
  return entradas
    .filter((entrada) => {
      try {
        return statSync(join(specDir, entrada)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

/**
 * Lee todos los requisitos de una feature, en orden de dominio.
 *
 * Sin specs devuelve una lista vacía, y eso **no es un error aquí**: una feature
 * en `draft` no tiene spec todavía. Quien descompone es quien exige que haya
 * requisitos, porque es ahí donde la ausencia significa algo.
 */
export function readRequirements(specDir: string, prefijo: string): LocatedRequirement[] {
  const requisitos: LocatedRequirement[] = [];
  for (const dominio of specDomains(specDir)) {
    const ruta = join(specDir, dominio, "spec.md");
    let texto: string;
    try {
      texto = readFileSync(ruta, "utf8");
    } catch {
      // Una carpeta sin `spec.md` dentro es un resto, no una spec a medias: se
      // ignora en vez de fallar, que es lo que permite tener `spec/` con trabajo
      // en curso.
      continue;
    }
    requisitos.push(
      ...parseRequirements(texto, dominio, `${prefijo}/spec/${dominio}/spec.md`),
    );
  }
  return requisitos;
}
