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
  /**
   * Qué caracteres de la línea siguiente puede escribir YAML.
   *
   * Es `null` salvo tras un indicador de escalar de bloque —`>` y `|`—, donde la
   * respuesta es «cualquiera»: ahí vive texto libre, y una línea que empieza por
   * un guion o por `#` es contenido y no una lista ni un comentario.
   */
  readonly continuation: RegExp | null;
  /** El índice de la línea en el texto original, para los escalares de bloque. */
  readonly raw?: number | undefined;
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
function significantLines(
  text: string,
  nombre: string,
  permitir: RegExp | null,
): Line[] {
  const lines: Line[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const permitido = permitir?.test(raw) === true;
    const withoutComment = permitido ? raw : stripComment(raw);
    const contenido = permitido ? withoutComment.trimEnd() : withoutComment.trim();
    if (contenido.trim() === "") return;
    // La comprobación va sobre el texto sin recortar: `trimStart` se lleva los
    // tabuladores, así que después ya no hay forma de saber que estaban.
    if (/^[ ]*\t/.test(withoutComment)) {
      fail(`${nombre} línea ${index + 1}: la indentación debe usar espacios.`);
    }
    const indent = withoutComment.length - withoutComment.trimStart().length;
    lines.push({
      indent,
      // El texto se guarda sin el comentario, y el comentario no se quita dentro
      // de un escalar de bloque: ahí una almohadilla es contenido. Se decide más
      // abajo, cuando ya se sabe si la línea es parte de uno.
      text: contenido,
      number: index + 1,
      continuation: null,
      raw: index,
    });
  });
  return lines;
}

/** Analiza un bloque y devuelve su valor y la primera línea que ya no es suya. */
/** Lo que hace falta para analizar un bloque, junto en un sitio. */
interface BlockContext {
  readonly lines: readonly Line[];
  /** Las líneas del texto original, para los escalares de bloque. */
  readonly raw: readonly string[];
  readonly start: number;
  readonly indent: number;
  readonly nombre: string;
  readonly clave: RegExp;
  readonly mensaje: string;
}

function parseBlock(contexto: BlockContext): { value: YamlValue; next: number } {
  const { lines, start, indent } = contexto;
  const first = lines[start];
  if (first === undefined) return { value: {}, next: start };
  if (first.text.startsWith("- ")) return parseSequence(contexto);
  return parseMapping(contexto);
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
function parseMapping(contexto: BlockContext): { value: YamlValue; next: number } {
  const { lines, indent, nombre } = contexto;
  const map: Record<string, YamlValue> = {};
  let index = contexto.start;
  while (index < lines.length) {
    const line = lines[index] as Line;
    if (line.indent < indent) break;
    if (index > contexto.start && line.indent !== indent) {
      fail(`${nombre} línea ${line.number}: indentación inesperada.`);
    }

    const parsed = parseEntry({ ...contexto, index, indent: line.indent });
    if (Object.hasOwn(map, parsed.key)) {
      fail(`${nombre} línea ${line.number}: la clave "${parsed.key}" está duplicada.`);
    }
    map[parsed.key] = parsed.value;
    index = parsed.next;
  }
  return { value: map, next: index };
}

/**
 * Analiza una colección en línea: `[]`, `{}`, `[a, b]`, `{ clave: valor }`.
 *
 * Es recursivo porque YAML anida: `{ a: [1, 2], b: { c: d } }`. Devuelve `null`
 * si el texto no es una colección bien cerrada, para que quien llama pueda decir
 * qué línea y qué clave.
 *
 * Las comillas se respetan al buscar las comas: `{ patron: '^\d+\.\d+$' }`
 * lleva dos puntos dentro del valor, y cortar por el primero daría una clave
 * llamada `patron` y un valor partido.
 */
function parseFlow(
  texto: string,
  nombre: string,
  linea: number,
): { value: YamlValue } | null {
  let posicion = 0;

  const saltarEspacios = (): void => {
    while (posicion < texto.length && /\s/.test(texto[posicion] as string)) posicion += 1;
  };

  /** El texto hasta el próximo separador de este nivel, respetando comillas. */
  const trozo = (separadores: string): string => {
    let profundidad = 0;
    let comilla: string | null = null;
    const inicio = posicion;
    while (posicion < texto.length) {
      const caracter = texto[posicion] as string;
      if (comilla !== null) {
        if (caracter === comilla) comilla = null;
      } else if (caracter === '"' || caracter === "'") {
        comilla = caracter;
      } else if (caracter === "[" || caracter === "{") {
        profundidad += 1;
      } else if (caracter === "]" || caracter === "}") {
        if (profundidad === 0) break;
        profundidad -= 1;
      } else if (profundidad === 0 && separadores.includes(caracter)) {
        break;
      }
      posicion += 1;
    }
    return texto.slice(inicio, posicion);
  };

  const valor = (): YamlValue | null => {
    saltarEspacios();
    const caracter = texto[posicion];

    if (caracter === "[") {
      posicion += 1;
      const items: YamlValue[] = [];
      saltarEspacios();
      if (texto[posicion] === "]") {
        posicion += 1;
        return items;
      }
      for (;;) {
        const elemento = valor();
        if (elemento === null) return null;
        items.push(elemento);
        saltarEspacios();
        if (texto[posicion] === ",") {
          posicion += 1;
          continue;
        }
        if (texto[posicion] === "]") {
          posicion += 1;
          return items;
        }
        return null;
      }
    }

    if (caracter === "{") {
      posicion += 1;
      const mapa: Record<string, YamlValue> = {};
      saltarEspacios();
      if (texto[posicion] === "}") {
        posicion += 1;
        return mapa;
      }
      for (;;) {
        const clave = trozo(":").trim();
        if (texto[posicion] !== ":") return null;
        posicion += 1;
        const contenido = valor();
        if (contenido === null) return null;
        mapa[clave] = contenido;
        saltarEspacios();
        if (texto[posicion] === ",") {
          posicion += 1;
          continue;
        }
        if (texto[posicion] === "}") {
          posicion += 1;
          return mapa;
        }
        return null;
      }
    }

    const crudo = trozo(",]}:");
    // Si lo que sigue es `}`, el trozo se detuvo en el cierre del contenedor y no
    // hay valor.
    return parseScalar(crudo);
  };

  const resultado = valor();
  if (resultado === null) return null;
  saltarEspacios();
  // Tiene que consumir el texto entero: si sobra algo, no era una colección.
  if (posicion !== texto.length) return null;
  // Y no puede quedar una comilla abierta. `gates: [plan, 'analysis` es un valor
  // que alguien dejó a medias, y leerlo como texto dejaría un valor con contenido
  // donde no lo hay —el mismo fallo que este analizador existe para evitar—.
  const comillas = (texto.match(/["']/g) ?? []).length;
  if (comillas % 2 !== 0) return null;
  void nombre;
  void linea;
  return { value: resultado };
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
  contexto: BlockContext & { index: number; text?: string; indent?: number },
): Entry {
  const { nombre, clave, mensaje, index } = contexto;
  const original = contexto.lines[index] as Line;
  // El texto y la indentación pueden venir de fuera: es lo que permite analizar
  // el `clave: valor` que vive **en la línea de un guion** —`- id: S1`— sin
  // recortar el array de líneas. Recortarlo desalineaba los índices con los del
  // texto original, y un escalar de bloque dentro de un elemento cortaba por
  // donde no era.
  const line: Line =
    contexto.text === undefined
      ? original
      : { ...original, text: contexto.text, indent: contexto.indent ?? original.indent };
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

  // Una colección en línea, si la hay: `[a, b]` o `{ clave: valor }`.
  //
  // Se interpreta de verdad y no se deja como texto. Dejarla pasaba un fallo en
  // silencio: `gates: [plan, analysis]` se leía como el texto `"[plan,
  // analysis]"`, y el documento resultante anunciaba un gate que se llamaba así.
  //
  // La distinción entre una colección y un texto que empieza por corchete es
  // cuál de los dos cierres aparece: `[plan, analysis]` cierra con `]`, y
  // `[beta] es la versión`, que es texto, cierra con una letra. Sin esta
  // comprobación, un texto legítimo se leería como una lista de un elemento.
  //
  // Y si empieza por `[` y no cierra con `]`, es una colección a medias: eso no
  // se lee como texto, se dice. `gates: [plan, 'analysis` es un valor que alguien
  // dejó a medio escribir, y aceptarlo dejaría un valor con contenido donde no lo
  // hay, que es el fallo que este analizador existe para evitar.
  const cierre = rest.startsWith("[") ? "]" : rest.startsWith("{") ? "}" : null;
  if (cierre !== null) {
    if (rest.trimEnd().endsWith(cierre)) {
      const flujo = parseFlow(rest, nombre, line.number);
      if (flujo === null) {
        fail(
          `${nombre} línea ${line.number}: "${rest}" parece una colección en línea ` +
            "y no se puede interpretar. Escríbela completa o como lista de bloques:\n" +
            `  ${key}:\n    - elemento`,
        );
      }
      return { key, value: flujo.value, next: index + 1 };
    }
    // No cierra con el corchete que abrió. Si tampoco lo tiene en ninguna parte,
    // es una colección a medias y hay que decirlo: `gates: [plan, 'analysis` es
    // un valor que alguien dejó a medio escribir, y leerlo como texto dejaría un
    // valor con contenido donde no lo hay.
    if (!rest.includes(cierre)) {
      fail(
        `${nombre} línea ${line.number}: "${rest}" abre una colección y no la ` +
          "cierra. Escríbela completa o como lista de bloques:\n" +
          `  ${key}:\n    - elemento`,
      );
    }
    // Y si lo tiene pero no al final, es texto: `[beta] es la versión`.
  }

  // Un escalar de bloque: `description: >` y debajo el texto.
  const indicador = BLOCK_SCALAR_RE.exec(rest);
  if (indicador !== null) {
    const fin = finDeBloque(contexto, index, line.indent);
    const desde = (line.raw ?? 0) + 1;
    const crudo = contexto.raw.slice(desde, fin.raw);
    return {
      key,
      value: cerrarBloque(blockScalar(crudo, 0, nombre), indicador[1] as string),
      next: fin.next,
    };
  }

  if (rest !== "") return { key, value: parseScalar(rest), next: index + 1 };

  // Sin valor en la línea: el valor es un bloque hijo, si lo hay.
  //
  // La comparación es contra la indentación **de esta entrada** y no contra la
  // del bloque que la contiene: en `- id:` el hijo va dos columnas más adentro
  // que el guion, no más adentro que el mapa.
  const child = contexto.lines[index + 1];
  if (child === undefined || child.indent <= line.indent) {
    return { key, value: "", next: index + 1 };
  }
  const parsed = parseBlock({ ...contexto, start: index + 1, indent: child.indent });
  return { key, value: parsed.value, next: parsed.next };
}

/**
 * Dónde termina un escalar de bloque.
 *
 * Se busca en las líneas **significativas**, que es donde están las que siguen
 * siendo YAML. El final es la primera que no está más adentro que la clave, y el
 * índice crudo de esa línea es el corte del texto.
 */
function finDeBloque(
  contexto: BlockContext,
  index: number,
  indent: number,
): { raw: number; next: number } {
  let siguiente = index + 1;
  while (siguiente < contexto.lines.length) {
    const linea = contexto.lines[siguiente] as Line;
    if (linea.indent <= indent) break;
    siguiente += 1;
  }
  const primera = contexto.lines[index + 1];
  const ultima = contexto.lines[siguiente];
  return {
    // El corte es la línea cruda donde empieza la que cierra el bloque; si el
    // bloque llega al final del archivo, es el final del texto.
    raw: ultima?.raw ?? contexto.raw.length,
    next: primera === undefined ? index + 1 : siguiente,
  };
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
function parseSequence(contexto: BlockContext): { value: YamlValue; next: number } {
  const { lines, indent, nombre } = contexto;
  const conMapas = ENTRY_RE.test((lines[contexto.start] as Line).text.slice(2).trim());
  const items: YamlValue[] = [];
  let index = contexto.start;

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

    // El elemento es un mapa y su primera clave vive en la línea del guion. Se
    // analiza esa entrada con el texto de esa línea, sin tocar el array: así
    // `line.raw` sigue apuntando al texto original y un escalar de bloque dentro
    // del elemento encuentra su final.
    const elemento: Record<string, YamlValue> = {};
    const primera = parseEntry({ ...contexto, index, text: contenido, indent: indent + 2 });
    elemento[primera.key] = primera.value;

    // Y el resto del elemento son las líneas que están más adentro que el guion,
    // que es exactamente lo que `parseMapping` ya sabe leer.
    const hijo = lines[index + 1];
    let siguiente = primera.next;
    if (hijo !== undefined && hijo.indent > indent) {
      const resto = parseMapping({
        ...contexto,
        start: primera.next >= index + 1 ? primera.next : index + 1,
        indent: hijo.indent,
      });
      for (const [clave, valor] of Object.entries(
        resto.value as Record<string, YamlValue>,
      )) {
        if (Object.hasOwn(elemento, clave)) {
          fail(`${nombre} línea ${line.number}: la clave "${clave}" está duplicada.`);
        }
        elemento[clave] = valor;
      }
      siguiente = resto.next;
    }

    items.push(elemento);
    index = siguiente;
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
  const lines = significantLines(text, nombre, null);
  if (lines.length === 0) return {};
  const mensaje =
    options.keyMessage ?? `no es válida (${(options.key ?? DEFAULT_KEY_RE).source}).`;
  return parseBlock({
    lines,
    raw: text.split(/\r?\n/),
    start: 0,
    indent: (lines[0] as Line).indent,
    nombre,
    clave,
    mensaje,
  }).value;
}

/** El indicador de un escalar de bloque: `|`, `>`, `|-`, `>-`, `|+`, `>+`. */
const BLOCK_SCALAR_RE = /^([|>])([-+]?)$/;

/**
 * Las líneas de un escalar de bloque, ya unidas.
 *
 * Está portado con las reglas de YAML que se usan de verdad, que son tres:
 *
 * - **La indentación la fija la primera línea con contenido.** Es lo que permite
 *   escribir texto con sangría propia: `>` a secas no obliga a que todo empiece
 *   en la columna cero, sino a que empiece donde empezó lo primero.
 * - **`>` pliega los saltos y `|` los conserva.** Un párrafo largo se escribe
 *   plegado y se lee como una línea; un bloque de código se escribe literal.
 * - **`-` quita el salto final y `+` lo conserva.** Sin indicador, un solo salto.
 *
 * Una línea con menos indentación que la primera cierra el bloque y sigue siendo
 * YAML normal. Eso es lo que hace que el cuerpo de un escalar no se coma el
 * documento.
 */
function blockScalar(raw: readonly string[], desde: number, nombre: string): string {
  let primera = -1;
  for (let index = desde; index < raw.length; index += 1) {
    const linea = raw[index] as string;
    if (linea.trim() === "") continue;
    primera = linea.length - linea.trimStart().length;
    break;
  }
  if (primera === -1) return "";

  const cuerpo: string[] = [];
  for (let index = desde; index < raw.length; index += 1) {
    const linea = raw[index] as string;
    if (linea.trim() === "") {
      // Una línea vacía dentro del bloque se conserva; el final se recorta
      // después, según el indicador de chomping.
      cuerpo.push("");
      continue;
    }
    const sangria = linea.length - linea.trimStart().length;
    if (sangria < primera) break;
    cuerpo.push(linea.slice(primera));
  }

  // Las líneas vacías del final no son contenido, salvo con `+`.
  while (cuerpo.length > 0 && (cuerpo[cuerpo.length - 1] as string).trim() === "") {
    cuerpo.pop();
  }
  void nombre;
  return cuerpo.join("\n");
}

/** Aplica el plegado y el chomping del indicador. */
function cerrarBloque(contenido: string, indicador: string): string {
  if (indicador.startsWith(">")) {
    // Plegado: una línea vacía separa párrafos y se convierte en un salto; las
    // demás líneas se unen con un espacio.
    return contenido
      .split(/\n/)
      .reduce<string[]>((partes, linea, indice) => {
        if (indice === 0) return [linea];
        const anterior = partes[partes.length - 1] as string;
        if (linea === "") partes.push("");
        else if (anterior === "") partes[partes.length - 1] = linea;
        else partes[partes.length - 1] = `${anterior} ${linea}`;
        return partes;
      }, [])
      .join("\n");
  }
  return contenido;
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
