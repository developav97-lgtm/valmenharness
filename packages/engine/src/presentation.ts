/**
 * El chequeo de colores fijos.
 *
 * Un estándar de presentación dice cómo se ve el sistema: alineación, formato de
 * montos, y —esto— que los colores salgan del tema y no de la cabeza de quien
 * escribe. La razón no es estética: un color escrito a mano es el que rompe el
 * modo oscuro. La tarjeta blanca que se ve perfecta en claro deja un rectángulo
 * cegador en oscuro, y quien la escribió no lo vio porque probó en claro.
 *
 * Una regla escrita en el `AGENTS.md` depende de que alguien se acuerde de
 * aplicarla. Esto la vuelve mecánica: se revisan **las líneas que el cambio
 * agrega** y se avisa. No bloquea: hay colores legítimos —el de una marca, el de
 * una impresión, un `#000` translúcido que es sombra y no paleta— y un chequeo
 * que impide trabajar se desactiva, con lo que deja de proteger.
 *
 * **Precisión antes que cobertura**, igual que el detector de secretos: un aviso
 * falso enseña a ignorar los avisos. Por eso cada patrón está atado a una forma
 * que no aparece por casualidad —un hexadecimal en posición de valor, una
 * función de color con números, una clase de paleta— y hay tres excepciones
 * explícitas: el respaldo de una variable del tema, las sombras, y el negro
 * translúcido.
 *
 * Lo que se reporta es el color y la línea, nunca el archivo entero: quien lo lee
 * tiene que poder ir al renglón y decidir en segundos.
 */
import { pendingChanges } from "./diff.js";
import { standardsFileFor } from "./standards.js";

/**
 * Las extensiones donde un color es un color.
 *
 * Deliberadamente corta. Un `.ts` con un `#fff` adentro puede ser un color de
 * Angular o una constante de otra cosa, y un aviso que hay que ir a verificar es
 * un aviso que se ignora. Los estilos en línea dentro de un `.ts` se revisan
 * cuando el proyecto los tenga; hoy no es el caso, y adivinar cuesta más de lo
 * que aporta.
 */
export const UI_EXTENSIONS = [
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".vue",
  ".svelte",
  ".jsx",
  ".tsx",
  ".astro",
  ".ejs",
  ".hbs",
  ".twig",
  ".jinja",
  ".j2",
  ".pug",
  ".erb",
] as const;

/** `true` si el archivo es de interfaz, por su extensión. */
export function isUiFile(path: string): boolean {
  const minuscula = path.toLowerCase();
  return UI_EXTENSIONS.some((extension) => minuscula.endsWith(extension));
}

/** Un color fijo encontrado en una línea agregada. */
export interface ColorFinding {
  /** Qué forma tenía: `hex`, `funcion`, `nombre`, `paleta`. */
  readonly kind: string;
  /** El valor tal como está escrito. Un color no es un secreto: se muestra. */
  readonly value: string;
  readonly line: number;
  /** La línea, recortada, para ubicarla sin abrir el archivo. */
  readonly preview: string;
}

/** Un hallazgo con el archivo donde está. */
export interface FileColorFinding extends ColorFinding {
  readonly path: string;
}

/** Lo que devuelve una revisión de colores. */
export interface PendingColors {
  readonly findings: readonly FileColorFinding[];
  /** Cuántos archivos se miraron, para poder decir «no hay nada» con fundamento. */
  readonly scanned: number;
}

/**
 * La marca que perdona una línea.
 *
 * Misma idea que `valmen:allow-secret`, y por el mismo motivo: hay colores
 * legítimos —el corporativo en un solo lugar, el de una impresión, el de un
 * gráfico de marca— y sin una salida la única forma de tenerlos sería apagar el
 * chequeo entero.
 */
const PERDONA_RE = /valmen:allow-color/i;

/** Las líneas que están comentadas: un color comentado no está en vigor. */
const COMENTARIO_RE = /^\s*(?:\/\*|\*|\/\/|<!--|{{!--)/;

/** Una propiedad de sombra: su color es profundidad, no paleta. */
const SOMBRA_RE = /\b(?:box-shadow|text-shadow|drop-shadow|filter)\s*:/i;

/**
 * El respaldo de una variable del tema: `var(--principal, #0984E3)`.
 *
 * Es el patrón del tema funcionando, no un color fijo. Marcarlo sería marcar la
 * forma correcta de escribir un valor por defecto.
 */
const RESPALDO_RE = /var\(\s*--[\w-]+\s*,[^)]*$/;

/**
 * Hexadecimales de 6 u 8 dígitos.
 *
 * Los que no tienen ninguna letra —`#123456`— solo cuentan en posición de valor,
 * porque sueltos son un número de incidente o un ancla, no un color.
 */
const HEX_LARGO_RE = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/g;

/**
 * Un hexadecimal corto, en cualquier parte: la posición la decide el contexto.
 *
 * `#abc` suelto también es un selector de id, así que no alcanza con la forma.
 * Y `#123` es un número de incidente o un ancla, así que exige una letra.
 */
const HEX_CORTO_RE = /#([0-9a-fA-F]{3,4})\b/g;

/**
 * Dónde un color puede estar, mirando lo que viene antes.
 *
 * Se salta los espacios y exige un delimitador de valor —`:` de una declaración,
 * `=` de un atributo, comillas, paréntesis, corchete— o una palabra de estilo
 * que precede al color en una propiedad corta (`border: 1px solid #fff`). Es lo
 * que separa `color: #123456` de `el ticket #123456`, que sin esto último se
 * marcaría: en prosa, un almohadilla detrás de un espacio es una referencia.
 */
const CONTEXTO_VALOR_RE =
  /(?:[:=([,'"]|\b(?:solid|dashed|dotted|double|inset|outset|groove|ridge|none))\s*$/i;

/** `true` si el color que empieza en esa posición está en un valor. */
function enPosicionDeValor(previo: string): boolean {
  return CONTEXTO_VALOR_RE.test(previo);
}

/** Las funciones de color, con números adentro. `rgb(var(--x))` no cuenta. */
const FUNCION_RE = /\b(?:rgba?|hsla?)\([^)]*\)/gi;

/** Un negro translúcido: sombra o velo, y funciona igual en claro y en oscuro. */
const NEGRO_TRASLUCIDO_RE = /^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*(?:0?\.\d+|0)\s*\)$/i;

/**
 * Los nombres de color que se escriben sin pensarlo.
 *
 * La lista no son los 148 nombres de CSS: son los que alguien escribe de verdad.
 * `transparent` y `currentColor` no están porque no son colores fijos: son
 * justamente las formas de no fijar uno.
 */
const NOMBRES = [
  "white",
  "black",
  "silver",
  "gray",
  "grey",
  "maroon",
  "red",
  "purple",
  "fuchsia",
  "green",
  "lime",
  "olive",
  "yellow",
  "navy",
  "blue",
  "teal",
  "aqua",
  "orange",
  "aliceblue",
  "beige",
  "brown",
  "coral",
  "crimson",
  "cyan",
  "gold",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "magenta",
  "pink",
  "plum",
  "salmon",
  "tan",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
] as const;

/**
 * Un nombre de color en posición de valor.
 *
 * Dos detalles hacen que esto sirva, y los dos se pagaron con un aviso falso:
 *
 * - El `(?![\w-])` final: sin él, `white` coincide dentro de `white-space` —que
 *   es una propiedad, no un color— y el aviso aparece en cada archivo que use
 *   `white-space: pre-wrap`.
 * - Las comillas **no** cuentan como contexto. `class="kpi gray"` es una lista
 *   de clases, no un color: ahí `gray` viene detrás de una palabra, no de un
 *   `:`. En una declaración el nombre va después de `:` o de `=`, y eso es lo
 *   único que se acepta.
 */
const NOMBRE_RE = new RegExp(
  `(?:[:=(,]|\\b(?:solid|dashed|dotted|double|inset|outset|groove|ridge))\\s*` +
    `(?:\\d+(?:\\.\\d+)?(?:px|rem|em|pt|%)?\\s+` +
    `(?:solid|dashed|dotted|double|inset|outset|groove|ridge)\\s+)?` +
    `(${NOMBRES.join("|")})` +
    `(?![\\w-])`,
  "i",
);

/** La paleta de Tailwind, que es un color fijo con otro nombre. */
const PALETA =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|" +
  "cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const PALETA_RE_GLOBAL = new RegExp(
  `\\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|placeholder|shadow|` +
    `outline|accent|caret|decoration)-(?:white|black|(?:${PALETA})-\\d{2,3})\\b`,
  "g",
);

/** Busca colores fijos en un texto. */
export function scanFixedColors(texto: string): ColorFinding[] {
  const hallazgos: ColorFinding[] = [];

  for (const [indice, linea] of texto.split("\n").entries()) {
    if (PERDONA_RE.test(linea)) continue;
    if (COMENTARIO_RE.test(linea)) continue;

    const vista = linea.length > 160 ? `${linea.slice(0, 157)}...` : linea;
    const sumar = (kind: string, value: string): void => {
      hallazgos.push({ kind, value, line: indice + 1, preview: vista.trim() });
    };

    for (const match of linea.matchAll(HEX_LARGO_RE)) {
      const valor = match[0] as string;
      const at = match.index ?? 0;
      const previo = linea.slice(0, at);
      // Un hexadecimal sin ninguna letra —`#123456`— es indistinguible de un
      // número: solo cuenta donde un color puede estar.
      if (!/[a-fA-F]/.test(valor.slice(1)) && !enPosicionDeValor(previo)) continue;
      if (RESPALDO_RE.test(previo)) continue;
      sumar("hex", valor);
    }

    for (const match of linea.matchAll(HEX_CORTO_RE)) {
      const valor = `#${match[1] as string}`;
      if (!/[a-fA-F]/.test(match[1] as string)) continue;
      const at = match.index ?? 0;
      const previo = linea.slice(0, at);
      if (!enPosicionDeValor(previo)) continue;
      if (RESPALDO_RE.test(previo)) continue;
      sumar("hex", valor);
    }

    const sombra = SOMBRA_RE.test(linea);
    for (const match of linea.matchAll(FUNCION_RE)) {
      const llamada = match[0] as string;
      // `rgb(var(--x))` y compañía son el tema, no un color fijo.
      if (/\bvar\(/.test(llamada)) continue;
      if (!/\(\s*[\d.]/.test(llamada)) continue;
      if (sombra) continue;
      if (NEGRO_TRASLUCIDO_RE.test(llamada.trim())) continue;
      sumar("funcion", llamada.trim());
    }

    const nombre = NOMBRE_RE.exec(linea);
    if (nombre !== null) sumar("nombre", nombre[1] as string);

    // Todas las de la línea, no la primera: una clase de paleta se arregla o no
    // se arregla, y dejar una sin nombrar es dejar el trabajo a medias.
    for (const paleta of linea.matchAll(PALETA_RE_GLOBAL)) sumar("paleta", paleta[0]);
  }

  return hallazgos;
}

/**
 * Revisa los colores fijos que entran con los cambios pendientes.
 *
 * Solo los archivos de interfaz y solo las líneas agregadas, por lo mismo que el
 * detector de secretos: lo que se revisa es lo que entra. Un archivo que ya tenía
 * doscientos hexadecimales no se convierte en un problema por tocarle una línea.
 */
export function scanPendingColors(root: string, staged = false): PendingColors {
  const { blocks, files } = pendingChanges(root, staged);
  const hallazgos: FileColorFinding[] = [];

  for (const bloque of blocks) {
    if (!isUiFile(bloque.path)) continue;
    // El bloque entero, para conservar la marca que perdona la línea de al lado.
    for (const hallazgo of scanFixedColors(bloque.lines.join("\n"))) {
      hallazgos.push({
        ...hallazgo,
        path: bloque.path,
        line: bloque.startLine + hallazgo.line - 1,
      });
    }
  }

  return {
    findings: hallazgos.sort((a, b) =>
      a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1,
    ),
    scanned: files.filter(isUiFile).length,
  };
}

/** El informe, en texto. Es lo que se imprime y lo que devuelve la herramienta. */
export function renderColorReport(
  revision: PendingColors,
  opciones: { readonly limite?: number } = {},
): string {
  const limite = opciones.limite ?? 40;
  const { findings, scanned } = revision;

  if (findings.length === 0) {
    return (
      `Colores fijos — nada que avisar (${scanned} archivo(s) de interfaz revisado(s)).\n\n` +
      "  Los colores salen del tema; si el cambio toca una pantalla, se prueba también\n" +
      "  en modo oscuro.\n"
    );
  }

  const porArchivo = new Map<string, FileColorFinding[]>();
  for (const hallazgo of findings) {
    const lista = porArchivo.get(hallazgo.path) ?? [];
    lista.push(hallazgo);
    porArchivo.set(hallazgo.path, lista);
  }

  const lineas = [
    `Colores fijos — ${findings.length} aviso(s) en ${porArchivo.size} archivo(s)`,
    "",
    "  No bloquea: hay colores legítimos. Pero un color escrito a mano es el que",
    "  rompe el modo oscuro, y esto es lo que hay que mirar antes de entregar.",
    "",
  ];

  let mostrados = 0;
  for (const [path, lista] of porArchivo) {
    lineas.push(`  ${path}`);
    // Una línea minificada puede traer veinte colores. Se muestran los primeros y
    // se dice cuántos más hay: el que lee necesita el archivo, no el inventario.
    const porLinea = new Map<number, FileColorFinding[]>();
    for (const hallazgo of lista) {
      const acumulada = porLinea.get(hallazgo.line) ?? [];
      acumulada.push(hallazgo);
      porLinea.set(hallazgo.line, acumulada);
    }
    for (const [linea, delLinea] of porLinea) {
      if (mostrados >= limite) break;
      const valores = delLinea.slice(0, 4).map((uno) => uno.value);
      const resto = delLinea.length - valores.length;
      lineas.push(
        `    L${linea}  ${valores.join(" ")}${resto > 0 ? ` (+${resto} más)` : ""}`,
      );
      mostrados += 1;
    }
    lineas.push("");
  }

  if (mostrados >= limite) {
    lineas.push(`  (se muestran ${limite} líneas; use --limite para ver más)`, "");
  }

  const archivoDeEstandares = standardsFileFor("presentacion");
  lineas.push(
    "  Qué hacer con cada uno:",
    `    - usar una variable del tema (o crear la que falta en ${archivoDeEstandares})`,
    "    - si es legítimo —marca, impresión, gráfico—, marcar la línea con",
    "      `valmen:allow-color` y escribir por qué",
    "",
  );

  return lineas.join("\n");
}
