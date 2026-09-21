/**
 * Lectura de `.valmen/config.yaml`.
 *
 * El parser es deliberadamente pequeño y estricto: admite un subconjunto de
 * YAML —comentarios, escalares, listas de bloques y mapas anidados por
 * indentación— y **falla de forma ruidosa** ante cualquier otra construcción.
 *
 * La razón es la misma que la del frontmatter de los tickets: un archivo de
 * configuración que se interpreta "casi bien" produce un comportamiento sutil y
 * equivocado. Es preferible que el harness no arranque a que arranque con una
 * configuración distinta de la que el usuario escribió.
 */
import { fail } from "@valmen/core";

/** Valor admitido en la configuración. */
export type ConfigValue = string | string[] | ConfigMap;

/** Mapa anidado de configuración. */
export interface ConfigMap {
  readonly [key: string]: ConfigValue;
}

/**
 * Comprueba si una clave tiene el formato admitido.
 *
 * Se restringe a minúsculas, dígitos y guiones para que un error de tipeo se
 * detecte en vez de crear una clave silenciosamente distinta.
 */
const KEY_RE = /^[a-z][a-z0-9-]*$/;

/** Interpreta un escalar: `null` no es un valor, es la ausencia de valor. */
function parseScalar(raw: string): string {
  const value = raw.trim();
  if (value === "null" || value === "~") return "";
  // Las comillas son opcionales y se retiran si envuelven todo el valor.
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

/** Una línea con contenido, ya sin comentario. */
interface Line {
  readonly indent: number;
  readonly text: string;
  readonly number: number;
}

/** Elimina el comentario de una línea, respetando las comillas. */
function stripComment(raw: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === "'" && !inDouble) inSingle = !inSingle;
    else if (character === '"' && !inSingle) inDouble = !inDouble;
    else if (character === "#" && !inSingle && !inDouble) {
      // Un `#` solo abre comentario si empieza la línea o va tras un espacio:
      // dentro de un valor, `a#b` es texto.
      if (index === 0 || /\s/.test(raw[index - 1] as string)) {
        return raw.slice(0, index);
      }
    }
  }
  return raw;
}

/** Convierte el texto en líneas significativas con su indentación. */
function significantLines(text: string): Line[] {
  const lines: Line[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const withoutComment = stripComment(raw);
    if (withoutComment.trim() === "") return;
    const indent = withoutComment.length - withoutComment.trimStart().length;
    if (withoutComment.trimStart().startsWith("\t")) {
      fail(
        `config.yaml línea ${index + 1}: la indentación debe usar espacios.`,
      );
    }
    lines.push({ indent, text: withoutComment.trim(), number: index + 1 });
  });
  return lines;
}

/**
 * Analiza un bloque de líneas al mismo nivel de indentación.
 *
 * Devuelve el valor y el índice de la primera línea que ya no pertenece al
 * bloque, para que quien llama pueda continuar.
 */
function parseBlock(
  lines: readonly Line[],
  start: number,
  indent: number,
): { value: ConfigValue; next: number } {
  const first = lines[start];
  if (first === undefined) return { value: {}, next: start };

  // Una lista de bloques: cada elemento empieza por `- `.
  if (first.text.startsWith("- ")) {
    const items: string[] = [];
    let index = start;
    while (index < lines.length) {
      const line = lines[index] as Line;
      if (line.indent !== indent || !line.text.startsWith("- ")) break;
      items.push(parseScalar(line.text.slice(2)));
      index += 1;
    }
    return { value: items, next: index };
  }

  // Un mapa: cada entrada es `clave:` o `clave: valor`.
  const map: Record<string, ConfigValue> = {};
  let index = start;
  while (index < lines.length) {
    const line = lines[index] as Line;
    if (line.indent < indent) break;
    if (line.indent > indent) {
      fail(`config.yaml línea ${line.number}: indentación inesperada.`);
    }

    const colon = line.text.indexOf(":");
    if (colon <= 0) {
      fail(`config.yaml línea ${line.number}: se esperaba "clave: valor".`);
    }
    const key = line.text.slice(0, colon).trim();
    if (!KEY_RE.test(key)) {
      fail(
        `config.yaml línea ${line.number}: la clave "${key}" no es válida ` +
          "(minúsculas, dígitos y guiones).",
      );
    }
    if (Object.hasOwn(map, key)) {
      fail(
        `config.yaml línea ${line.number}: la clave "${key}" está duplicada.`,
      );
    }

    const rest = line.text.slice(colon + 1).trim();
    if (rest !== "") {
      map[key] = parseScalar(rest);
      index += 1;
      continue;
    }

    // Sin valor en la línea: el valor es un bloque hijo, si lo hay.
    const child = lines[index + 1];
    if (child === undefined || child.indent <= indent) {
      map[key] = "";
      index += 1;
      continue;
    }
    const parsed = parseBlock(lines, index + 1, child.indent);
    map[key] = parsed.value;
    index = parsed.next;
  }

  return { value: map, next: index };
}

/** Analiza el contenido de un `config.yaml`. */
export function parseConfig(text: string): ConfigMap {
  const lines = significantLines(text);
  if (lines.length === 0) return {};
  const parsed = parseBlock(lines, 0, (lines[0] as Line).indent);
  if (typeof parsed.value === "string" || Array.isArray(parsed.value)) {
    fail("config.yaml debe tener un mapa en la raíz.");
  }
  return parsed.value;
}

/** Lee un valor de texto de la configuración, o el valor por defecto. */
export function readString(
  config: ConfigMap,
  key: string,
  fallback: string,
): string {
  const value = config[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string") {
    fail(`config.yaml: "${key}" debe ser un texto.`);
  }
  return value === "" ? fallback : value;
}

/** Lee una lista de textos de la configuración, o la lista por defecto. */
export function readList(
  config: ConfigMap,
  key: string,
  fallback: readonly string[],
): string[] {
  const value = config[key];
  if (value === undefined) return [...fallback];
  if (typeof value === "string") return value === "" ? [] : [value];
  if (!Array.isArray(value)) {
    fail(`config.yaml: "${key}" debe ser una lista de textos.`);
  }
  return value;
}

/** Lee un submapa de la configuración. */
export function readMap(config: ConfigMap, key: string): ConfigMap {
  const value = config[key];
  if (value === undefined) return {};
  if (typeof value === "string" || Array.isArray(value)) {
    fail(`config.yaml: "${key}" debe ser un mapa.`);
  }
  return value;
}
