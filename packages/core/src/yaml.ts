/**
 * Un subconjunto estricto de YAML.
 *
 * Admite exactamente lo que el harness escribe: escalares, listas de bloque,
 * mapas anidados por indentación y comentarios. **Todo lo demás falla.**
 *
 * El motivo es el mismo que el del frontmatter de los tickets, y conviene
 * repetirlo porque es la decisión de diseño de este archivo: un documento que se
 * interpreta «casi bien» produce un comportamiento sutil y equivocado.
 * `gates: [plan, analysis]` leído como el texto `"[plan, analysis]"` hace que el
 * sistema anuncie un gate que no existe; el error se descubre tres días después,
 * cuando ese gate no corre. Es preferible no arrancar.
 *
 * Vive en `core` y no en el adaptador porque lo usan tres documentos distintos
 * —`config.yaml`, el `tickets.yaml` de una feature y los procesos— y porque la
 * alternativa sería que cada uno trajera su propio parser. Una garantía con dos
 * implementaciones es una garantía que se pierde en la que nadie prueba.
 */
import { fail } from "./errors.js";

/** Un valor del subconjunto: escalar, lista o mapa. */
export type YamlValue = string | YamlValue[] | YamlMap;

/** Un mapa anidado. */
export interface YamlMap {
  readonly [key: string]: YamlValue;
}

/** Cómo se llama el archivo, para que el error diga dónde mirar. */
export interface YamlOptions {
  /** El nombre que aparece en los mensajes: `config.yaml`, `tickets.yaml`. */
  readonly fileName?: string;
  /** Qué claves se admiten. Por defecto, letras, dígitos, guiones y guiones bajos. */
  readonly key?: RegExp;
  /**
   * Qué decir cuando una clave no se admite.
   *
   * Sin esto, el mensaje incluiría el patrón —`(^[a-z][a-z0-9-]*$)`—, que es
   * exacto y también ilegible para quien escribió `generated_by` por costumbre.
   */
  readonly keyMessage?: string;
}

const DEFAULT_KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
/** El inicio de una entrada: `clave:` o `clave: valor`. */
const ENTRY_RE = /^([A-Za-z_][A-Za-z0-9_-]*):(\s|$)/;

/** Una línea con contenido, ya sin comentario. */
interface Line {
  readonly indent: number;
  readonly text: string;
  readonly number: number;
}

/** Interpreta un escalar. `null` y `~` son la ausencia de valor, no texto. */
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
function significantLines(text: string, nombre: string): Line[] {
  const lines: Line[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const withoutComment = stripComment(raw);
    const contenido = withoutComment.trim();
    if (contenido === "") return;
    // La comprobación va sobre el texto sin recortar: `trimStart` se lleva los
    // tabuladores, así que después ya no hay forma de saber que estaban.
    if (/^[ ]*\t/.test(withoutComment)) {
      fail(`${nombre} línea ${index + 1}: la indentación debe usar espacios.`);
    }
    const indent = withoutComment.length - withoutComment.trimStart().length;
    lines.push({ indent, text: contenido, number: index + 1 });
  });
  return lines;
}

/** Analiza un bloque y devuelve su valor y la primera línea que ya no es suya. */
function parseBlock(
  lines: readonly Line[],
  start: number,
  indent: number,
  nombre: string,
  clave: RegExp,
  mensaje: string,
): { value: YamlValue; next: number } {
  const first = lines[start];
  if (first === undefined) return { value: {}, next: start };
  if (first.text.startsWith("- ")) {
    return parseSequence(lines, start, indent, nombre, clave, mensaje);
  }
  return parseMapping(lines, start, indent, nombre, clave, mensaje);
}

/**
 * Analiza un mapa: líneas `clave:` o `clave: valor` al mismo nivel.
 *
 * La indentación es un valor fijo y no «la de la primera línea». La diferencia
 * importa: con la primera línea como referencia, un renglón corrido un espacio de
 * más se interpretaría como un mapa anidado de una sola clave, y el documento
 * quedaría leído como algo que nadie escribió. Un mapa mal indentado es un error.
 *
 * La excepción es el mapa que empieza en la línea de un guion —`- id: S1`—: ahí
 * la primera clave está en la columna del contenido y las siguientes dos espacios
 * más adentro, así que se permite esa primera línea corrida y ninguna más.
 */
function parseMapping(
  lines: readonly Line[],
  start: number,
  indent: number,
  nombre: string,
  clave: RegExp,
  mensaje: string,
): { value: YamlValue; next: number } {
  const map: Record<string, YamlValue> = {};
  let index = start;
  let esperada = indent;
  while (index < lines.length) {
    const line = lines[index] as Line;
    if (line.indent < indent) break;
    if (index > start && line.indent !== esperada) {
      fail(`${nombre} línea ${line.number}: indentación inesperada.`);
    }
    // Tras la primera entrada el mapa ya tiene su columna, y una entrada no puede
    // correrse de ella.
    esperada = indent;

    const parsed = parseEntry(lines, index, indent, nombre, clave, mensaje);
    if (Object.hasOwn(map, parsed.key)) {
      fail(`${nombre} línea ${line.number}: la clave "${parsed.key}" está duplicada.`);
    }
    map[parsed.key] = parsed.value;
    index = parsed.next;
  }
  return { value: map, next: index };
}

/** Una entrada `clave:` o `clave: valor`, ya consumida. */
interface Entry {
  readonly key: string;
  readonly value: YamlValue;
  readonly next: number;
}

/**
 * Analiza una línea `clave: valor` y su bloque hijo, si lo tiene.
 *
 * Se separa de `parseMapping` porque una lista de mapas necesita analizar
 * entradas sin que exista un mapa contenedor: en `- id: S1` la clave vive en la
 * línea del guion, no en una línea propia.
 */
function parseEntry(
  lines: readonly Line[],
  index: number,
  indent: number,
  nombre: string,
  clave: RegExp,
  mensaje: string,
): Entry {
  const line = lines[index] as Line;
  const colon = line.text.indexOf(":");
  if (colon <= 0) {
    fail(`${nombre} línea ${line.number}: se esperaba "clave: valor".`);
  }
  const key = line.text.slice(0, colon).trim();
  if (!clave.test(key)) {
    fail(`${nombre} línea ${line.number}: la clave "${key}" ${mensaje}`);
  }

  const rest = line.text.slice(colon + 1).trim();

  // Colecciones vacías en línea: `gates: []` y `budgets: {}`.
  //
  // Sin este caso, `[]` se interpretaría como el texto "[]", que es un valor con
  // contenido: el documento generado anunciaría gates configurados que no
  // existen.
  if (rest === "[]" || rest === "{}") {
    return { key, value: rest === "[]" ? [] : {}, next: index + 1 };
  }

  // Cualquier otra colección en línea se **rechaza**.
  //
  // Es el mismo fallo silencioso que el caso de arriba, y la razón de que este
  // parser prefiera no arrancar a arrancar con algo distinto de lo escrito.
  if (
    rest.length >= 2 &&
    ((rest.startsWith("[") && rest.endsWith("]")) ||
      (rest.startsWith("{") && rest.endsWith("}")))
  ) {
    fail(
      `${nombre} línea ${line.number}: "${rest}" es una colección en línea y ` +
        "no se admite. Escríbela como lista de bloques:\n" +
        `  ${key}:\n    - elemento`,
    );
  }

  if (rest !== "") return { key, value: parseScalar(rest), next: index + 1 };

  // Sin valor en la línea: el valor es un bloque hijo, si lo hay.
  //
  // La comparación es contra la indentación **de esta entrada** y no contra la
  // del bloque que la contiene: en `- id:` el hijo va dos columnas más adentro
  // que el guion, no más adentro que el mapa.
  const child = lines[index + 1];
  if (child === undefined || child.indent <= line.indent) {
    return { key, value: "", next: index + 1 };
  }
  const parsed = parseBlock(lines, index + 1, child.indent, nombre, clave, mensaje);
  return { key, value: parsed.value, next: parsed.next };
}

/**
 * Analiza una lista de bloque.
 *
 * Dos formas, y ninguna mezcla:
 *
 * ```yaml
 * tickets:                     coverage:
 *   - FEATURE-...-20260921       - requirement: R-INV-001
 *   - FEATURE-...-20260922         covered_by: [FEATURE-...]
 * ```
 *
 * La lista de mapas se admite porque es como la gente escribe una lista de
 * registros, y rechazarla obligaría a inventar una sintaxis propia que nadie
 * reconocería. Que sea **una u otra** y no una mezcla es lo que permite que un
 * `- ` mal indentado sea un error en vez de un elemento raro.
 */
function parseSequence(
  lines: readonly Line[],
  start: number,
  indent: number,
  nombre: string,
  clave: RegExp,
  mensaje: string,
): { value: YamlValue; next: number } {
  const conMapas = ENTRY_RE.test((lines[start] as Line).text.slice(2).trim());
  const items: YamlValue[] = [];
  let index = start;

  while (index < lines.length) {
    const line = lines[index] as Line;
    if (line.indent !== indent || !line.text.startsWith("- ")) break;

    const contenido = line.text.slice(2).trim();
    if (ENTRY_RE.test(contenido) !== conMapas) {
      fail(
        `${nombre} línea ${line.number}: una lista no puede mezclar elementos ` +
          "con y sin clave.",
      );
    }

    if (!conMapas) {
      items.push(parseScalar(contenido));
      index += 1;
      continue;
    }

    // El elemento es un mapa. Su primera clave viene en la línea del guion y las
    // siguientes van indentadas bajo ella, así que empieza en una línea con la
    // indentación del contenido y termina cuando la indentación vuelve al nivel
    // del guion.
    const comoMapa: Line = { ...line, indent: indent + 2, text: contenido };
    const elemento = parseMapping(
      [comoMapa, ...lines.slice(index + 1)],
      0,
      indent + 2,
      nombre,
      clave,
      mensaje,
    );
    items.push(elemento.value);
    // El elemento ocupa su línea de guion más las líneas que consumió el mapa,
    // que son las posteriores: `elemento.next` cuenta desde la línea del guion
    // tratada como índice 0.
    index += 1 + (elemento.next - 1);
  }

  return { value: items, next: index };
}

/**
 * Analiza el documento completo.
 *
 * La raíz puede ser un mapa —`config.yaml`, `tickets.yaml`— o una lista, que es
 * como se escribe un proceso hecho de pasos.
 */
export function parseYamlSubset(text: string, options: YamlOptions = {}): YamlValue {
  const nombre = options.fileName ?? "el documento";
  const clave = options.key ?? DEFAULT_KEY_RE;
  const lines = significantLines(text, nombre);
  if (lines.length === 0) return {};
  const mensaje =
    options.keyMessage ?? `no es válida (${(options.key ?? DEFAULT_KEY_RE).source}).`;
  return parseBlock(lines, 0, (lines[0] as Line).indent, nombre, clave, mensaje)
    .value;
}

/**
 * El bloque de una clave de primer nivel, como texto.
 *
 * Devuelve las líneas indentadas que siguen a `clave:` y nada más: ni la propia
 * clave, ni las claves hermanas. Es lo que hace falta para leer un archivo del
 * que no se quiere una estructura sino **el texto de una sección**, y para el que
 * un parser completo sería la respuesta equivocada —el archivo de credenciales
 * contiene secretos y no debe pasar por estructuras que puedan acabar en un
 * mensaje de error—.
 *
 * Existe por un fallo concreto: con una expresión regular y el ancla `^[ \t]*`,
 * buscar `opencode-go` encontraba el bloque de `opencode`, porque la `o` final
 * encajaba como un `[ \t]*` vacío y `-go:` como el resto del nombre. Y sin fijar
 * la indentación, el bloque seguía leyendo las claves hermanas de después. Las
 * dos cosas se arreglan contando columnas, que es lo que hace esto.
 *
 * Un archivo indentado por completo —con `providers:` en la columna cero— se lee
 * buscando en cualquier profundidad: el primer nivel que aparezca es el que manda.
 */
export function yamlBlockOf(text: string, key: string): string | null {
  const lineas = text.split(/\r?\n/);
  const clave = new RegExp(`^([ \\t]*)${key}:[ \\t]*(?:#.*)?$`);
  for (let index = 0; index < lineas.length; index += 1) {
    const match = clave.exec(lineas[index] as string);
    if (match === null) continue;

    const indent = (match[1] as string).length;
    const cuerpo: string[] = [];
    for (let otra = index + 1; otra < lineas.length; otra += 1) {
      const linea = lineas[otra] as string;
      if (linea.trim() === "") break;
      const sangria = linea.length - linea.trimStart().length;
      if (sangria <= indent) break;
      cuerpo.push(linea);
    }
    return cuerpo.length === 0 ? null : cuerpo.join("\n");
  }
  return null;
}

/**
 * El valor de un campo dentro de un bloque.
 *
 * Acepta `clave: valor`, con comillas opcionales. Devuelve `null` si el campo no
 * está o está vacío, que para quien lee una credencial son el mismo caso: no hay
 * valor.
 *
 * `patron` es una expresión regular y no un nombre literal porque hay campos que
 * se aceptan con dos nombres: `api-key` es el correcto y `api-key-env` es el de
 * una versión anterior de la plantilla, con el valor literal dentro. Rechazar el
 * segundo rompería configuraciones válidas por un detalle de nomenclatura ya
 * corregido.
 */
export function yamlFieldOf(block: string, patron: string): string | null {
  const match = new RegExp(
    `^[ \\t]+(?:${patron}):[ \\t]*["']?([^"'\\n]*)["']?[ \\t]*$`,
    "m",
  ).exec(block);
  const valor = match?.[1]?.trim();
  return valor === undefined || valor === "" ? null : valor;
}
