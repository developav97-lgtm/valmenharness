import {
  FRONTMATTER_BLOCK_RE,
  FRONTMATTER_FIELDS,
  FRONTMATTER_LINE_RE,
  type FrontmatterField,
  SECTIONS,
  STRUCTURED_SECTIONS,
  type SectionName,
  type StructuredSectionName,
} from "./contract.js";
import { EXIT_SCHEMA, fail } from "./errors.js";

/**
 * Un objeto JSON parseado de una sección estructurada.
 *
 * Los valores son `unknown` a propósito: el shape lo determina cada validador
 * de sección, no el parser.
 */
export type JsonObject = Record<string, unknown>;

/**
 * Resultado del análisis sintáctico de un `ticket.md`.
 *
 * No implica que el ticket sea válido: solo que su forma es la del contrato.
 * La validación de reglas vive en `validate.ts`.
 */
export interface ParsedTicket {
  /** Texto crudo, tal cual está en disco. Nunca se normaliza. */
  readonly text: string;
  /** Los 18 campos de frontmatter, ya en el orden canónico. */
  readonly fields: Readonly<Record<FrontmatterField, string>>;
  /** Cuerpo de cada una de las 15 secciones, sin el encabezado. */
  readonly sections: Readonly<Record<SectionName, string>>;
  /** Arreglo de objetos de cada sección estructurada. */
  readonly blocks: Readonly<
    Record<StructuredSectionName, readonly JsonObject[]>
  >;
}

/**
 * Subconjunto conservador de escalares YAML *plain* de una sola línea.
 *
 * Espeja `is_safe_plain_scalar` del CLI de referencia. Rechaza valores que un
 * parser YAML interpretaría como otra cosa (listas, mapas, anclas, comillas,
 * comentarios), porque el frontmatter se lee sin una librería YAML.
 */
export function isSafePlainScalar(value: string): boolean {
  if (value === "" || value !== value.trim()) return false;
  for (const character of value) {
    if ((character.codePointAt(0) ?? 0) < 32) return false;
  }
  const first = value[0];
  if (first !== undefined && "-?:,[]{}#&*!|>'\"%@`".includes(first))
    return false;
  if (value.includes(": ") || value.includes(" #")) return false;
  return true;
}

/**
 * Analiza el frontmatter restringido.
 *
 * Contrato: apertura `---`, una línea `clave: valor` por campo, cierre `---`.
 * Las claves deben ser **exactamente** las 18 del esquema y estar **en orden**.
 * No se admiten mapas, listas, multilínea, anclas ni etiquetas.
 *
 * Devuelve los campos y el índice donde empieza el cuerpo.
 */
export function parseFrontmatter(text: string): {
  fields: Record<FrontmatterField, string>;
  bodyStart: number;
} {
  const match = FRONTMATTER_BLOCK_RE.exec(text);
  if (match === null) {
    fail(
      "ticket.md debe iniciar con frontmatter restringido delimitado por ---. ",
    );
  }

  const block = match[1] ?? "";
  const lines = block.split(/\r\n|\r|\n/);
  const fields: Record<string, string> = {};
  const keys: string[] = [];

  for (const line of lines) {
    const fieldMatch = FRONTMATTER_LINE_RE.exec(line);
    if (fieldMatch === null) {
      fail("El frontmatter solo admite líneas exactas clave: valor.");
    }
    const key = fieldMatch[1] as string;
    const value = fieldMatch[2] as string;

    if (Object.hasOwn(fields, key)) {
      fail(`El campo de frontmatter ${key} está duplicado.`);
    }
    if (!isSafePlainScalar(value)) {
      fail(
        "El frontmatter contiene un valor que no es un escalar plain seguro.",
      );
    }
    keys.push(key);
    fields[key] = value;
  }

  // Igualdad exacta de la tupla de claves: ni una de más, ni de menos, ni en
  // otro orden. Un cambio de orden en un ticket existente lo invalida.
  if (
    keys.length !== FRONTMATTER_FIELDS.length ||
    keys.some((key, index) => key !== FRONTMATTER_FIELDS[index])
  ) {
    fail(
      "El frontmatter no contiene las claves exactas en el orden del esquema 1.",
    );
  }

  return {
    fields: fields as Record<FrontmatterField, string>,
    bodyStart: match[0].length,
  };
}

/** Extrae el contenido de cada encabezado `## ` con su posición. */
function findHeadings(
  text: string,
): { title: string; start: number; contentStart: number }[] {
  const found: { title: string; start: number; contentStart: number }[] = [];
  const re = /^## ([^\n]+)\n/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    found.push({
      title: match[1] as string,
      start: match.index,
      contentStart: match.index + match[0].length,
    });
  }
  return found;
}

/**
 * Analiza las 15 secciones Markdown.
 *
 * La lógica replica la del CLI de referencia y tiene una particularidad que no
 * es obvia: `Solicitud original` se busca primero, y después se busca una
 * ocurrencia de `Descripción funcional` tal que **todos** los encabezados que
 * siguen sean exactamente `SECTIONS[1:]`. Eso tolera que el texto de la
 * solicitud contenga encabezados `## ` ocasionales, pero rechaza cualquier
 * sección extra, faltante o fuera de orden en el cuerpo canónico.
 */
export function parseSections(
  text: string,
  bodyStart: number,
): Record<SectionName, string> {
  const body = text.slice(bodyStart);

  const requestHeading = /^## Solicitud original\n/m.exec(body);
  if (requestHeading === null) {
    fail("Falta la sección Solicitud original.");
  }

  const before = body.slice(0, requestHeading.index);
  if (/^## [^\n]+\n/m.test(before)) {
    fail("Hay una sección Markdown inesperada antes de Solicitud original.");
  }

  const requestEnd = requestHeading.index + requestHeading[0].length;
  const afterRequest = body.slice(requestEnd);

  const expectedTail = SECTIONS.slice(1) as readonly string[];
  let canonical: ReturnType<typeof findHeadings> | null = null;
  let descriptionStart = -1;

  const descriptionRe = /^## Descripción funcional\n/gm;
  let candidate: RegExpExecArray | null;
  while ((candidate = descriptionRe.exec(afterRequest)) !== null) {
    const candidateStart = requestEnd + candidate.index;
    const suffix = body.slice(candidateStart);
    const headings = findHeadings(suffix);
    if (
      headings.length === expectedTail.length &&
      headings.every((heading, index) => heading.title === expectedTail[index])
    ) {
      canonical = headings;
      descriptionStart = candidateStart;
      break;
    }
  }

  if (canonical === null || descriptionStart < 0) {
    fail(
      "Las secciones Markdown faltan, sobran o no conservan el orden canónico.",
    );
  }

  const sections: Record<string, string> = {};
  sections["Solicitud original"] = body.slice(requestEnd, descriptionStart);

  const suffix = body.slice(descriptionStart);
  canonical.forEach((heading, index) => {
    const next = canonical[index + 1];
    const end = next === undefined ? suffix.length : next.start;
    sections[heading.title] = suffix.slice(heading.contentStart, end);
  });

  return sections as Record<SectionName, string>;
}

/**
 * Error lanzado cuando un bloque JSON no es válido o tiene claves duplicadas.
 *
 * Se distingue de `TicketError` para poder capturarlo y convertirlo al mensaje
 * exacto que espera el contrato.
 */
class JsonParseFailure extends Error {}

/**
 * `JSON.parse` con detección de claves duplicadas.
 *
 * `JSON.parse` acepta la última clave repetida en silencio; el contrato exige
 * rechazar el documento, así que se escanea el texto original antes de parsear.
 *
 * No hace falta rechazar `NaN` ni `Infinity` explícitamente: son sintaxis
 * inválida para JSON y `JSON.parse` ya los rechaza, a diferencia de
 * `json.loads` de Python, que hay que instruir para que no los acepte.
 */
function parseStrictJson(source: string): unknown {
  if (hasDuplicateKeys(source)) {
    throw new JsonParseFailure("clave JSON duplicada");
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new JsonParseFailure("sintaxis");
  }
}

/**
 * Detecta claves duplicadas en un objeto JSON escaneando el texto original.
 *
 * Es necesario porque `JSON.parse` descarta las repeticiones antes de que un
 * `reviver` pueda verlas: la última gana en silencio, y el contrato exige
 * rechazar el documento.
 *
 * La pila distingue objetos de arreglos. Solo los objetos tienen claves; las
 * claves de un objeto dentro de un arreglo pertenecen **a ese objeto**, no al
 * objeto que contiene el arreglo. Confundir ambos casos produce falsos
 * positivos en cualquier estructura como `[{"id": "A"}, {"id": "B"}]`.
 */
function hasDuplicateKeys(source: string): boolean {
  /** Marco de la pila: distingue objeto (con claves) de arreglo (sin claves). */
  type Frame = { kind: "object"; keys: Set<string> } | { kind: "array" };
  const stack: Frame[] = [];
  let index = 0;

  const isWhitespace = (character: string | undefined): boolean =>
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\r";

  while (index < source.length) {
    const character = source[index];

    if (character === '"') {
      const start = index;
      index += 1;
      while (index < source.length) {
        const current = source[index];
        if (current === "\\") {
          index += 2;
          continue;
        }
        index += 1;
        if (current === '"') break;
      }
      const raw = source.slice(start, index);

      // Es una clave solo si el siguiente carácter significativo es ':' y el
      // objeto inmediato es el marco superior de la pila.
      let lookahead = index;
      while (isWhitespace(source[lookahead])) lookahead += 1;

      const top = stack[stack.length - 1];
      if (source[lookahead] === ":" && top?.kind === "object") {
        let key: string;
        try {
          key = JSON.parse(raw) as string;
        } catch {
          key = raw;
        }
        if (top.keys.has(key)) return true;
        top.keys.add(key);
      }
      continue;
    }

    if (character === "{") {
      stack.push({ kind: "object", keys: new Set<string>() });
      index += 1;
      continue;
    }
    if (character === "[") {
      stack.push({ kind: "array" });
      index += 1;
      continue;
    }
    if (character === "}" || character === "]") {
      stack.pop();
      index += 1;
      continue;
    }

    index += 1;
  }

  return false;
}

/**
 * Analiza el bloque JSON de cada sección estructurada.
 *
 * Cada una de las 7 secciones debe contener **exactamente un** bloque `json`
 * delimitado por vallas, y su contenido debe ser un arreglo de objetos.
 */
export function parseBlocks(
  sections: Record<SectionName, string>,
): Record<StructuredSectionName, readonly JsonObject[]> {
  const blocks: Record<string, JsonObject[]> = {};

  for (const name of STRUCTURED_SECTIONS) {
    const matches = [
      ...sections[name].matchAll(/^```json\n([\s\S]*?)\n```[ \t]*$/gm),
    ];
    if (matches.length !== 1) {
      fail(
        `La sección ${name} debe contener exactamente un bloque JSON fenced.`,
      );
    }

    const source = matches[0]?.[1] ?? "";
    let value: unknown;
    try {
      value = parseStrictJson(source);
    } catch (error) {
      if (error instanceof JsonParseFailure) {
        fail(`El bloque JSON de ${name} no es válido.`);
      }
      fail(`El bloque JSON de ${name} no es válido.`);
    }

    if (!Array.isArray(value) || value.some((item) => !isPlainObject(item))) {
      fail(`El bloque JSON de ${name} debe ser un arreglo de objetos.`);
    }

    blocks[name] = value as JsonObject[];
  }

  return blocks as Record<StructuredSectionName, readonly JsonObject[]>;
}

/** `true` si el valor es un objeto JSON y no un arreglo ni `null`. */
export function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Analiza un `ticket.md` completo: frontmatter, secciones y bloques.
 *
 * Solo verifica la **forma**. Las reglas de negocio las aplica `validateTicket`.
 * El texto se lee sin normalizar: un archivo con CRLF no abre el frontmatter,
 * que es el comportamiento del contrato.
 */
export function parseTicket(text: string): ParsedTicket {
  const { fields, bodyStart } = parseFrontmatter(text);
  const sections = parseSections(text, bodyStart);
  const blocks = parseBlocks(sections);
  return { text, fields, sections, blocks };
}

export { EXIT_SCHEMA };
