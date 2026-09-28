/**
 * Extracción de las reglas que un proyecto ya tiene escritas en su `AGENTS.md`.
 *
 * `valmen adopt` deja `.valmen/rules/` vacío a propósito —el harness no puede
 * separar solo lo que es regla de dominio de lo que es flujo de trabajo—, pero
 * `AGENTS.md` deja de ser una fuente en el primer `valmen sync`: el documento se
 * recompone desde `.valmen/`. Sin esta extracción, las reglas que el proyecto ya
 * tenía escritas desaparecen del archivo que leen los agentes en cuanto corra el
 * sync que el propio `adopt` indica como paso siguiente, y pedirle a la persona
 * que las copie a mano es exactamente lo que el requisito prohíbe: lo que existe
 * se respeta y se dice.
 *
 * Tres reglas gobiernan lo que esta función hace:
 *
 * 1. **No clasifica nada.** Cada sección de nivel 2 se preserva entera, con su
 *    título y su cuerpo, en su propio archivo. Qué es regla del proyecto y qué es
 *    flujo de trabajo lo decide quien lee, y el archivo lo dice en su cabecera.
 *    Separarlo automáticamente pediría un modelo, y el módulo declara que ninguna
 *    detección llama a uno (ver `adopt.ts`).
 * 2. **No pisa nada.** Un archivo de reglas que ya existe se saltea y se informa:
 *    las reglas del proyecto son del proyecto.
 * 3. **Es determinista.** El mismo `AGENTS.md` produce siempre los mismos
 *    archivos, que es lo que permite que `valmen sync --check` siga sirviendo.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** El marcador con el que el harness encabeza los documentos que genera. */
const MARCADOR_GENERADO = "GENERADO POR valmen";

/** Las líneas que abren y cierran un bloque de código. */
const CERCA = /^\s*(```|~~~)/;

/** El nombre del archivo de reglas cuando el `AGENTS.md` no tiene título. */
const SIN_TITULO = "reglas-iniciales";

/** Una sección del documento previo, ya cortada. */
interface Seccion {
  /** El título sin los `#`, o el del documento cuando es el preámbulo. */
  readonly title: string;
  /** El cuerpo, sin el encabezado y sin líneas vacías en los bordes. */
  readonly body: string;
}

/** Un archivo de reglas a escribir, con lo que hizo falta para armarlo. */
export interface ExtractedRule {
  /** Ruta relativa a la raíz del proyecto, con separadores POSIX. */
  readonly path: string;
  /** El contenido completo del archivo, con su cabecera y su título. */
  readonly content: string;
  /** El título de la sección de la que salió, sin los `#`. */
  readonly heading: string;
}

/** Un archivo de reglas que no se toca porque ya existe. */
export interface SkippedRule {
  readonly path: string;
  readonly heading: string;
}

/** Lo que la extracción encontró y lo que haría con eso. */
export interface RuleExtraction {
  /** El archivo del que salieron las reglas, o `null` si no había ninguno. */
  readonly source: string | null;
  readonly files: readonly ExtractedRule[];
  readonly skipped: readonly SkippedRule[];
  /** Por qué no hay nada que extraer, cuando no lo hay. */
  readonly note: string | null;
}

/** Lee un archivo de texto, o `null` si no se puede. */
function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Quita las líneas vacías de los bordes y el espacio sobrante del final. */
function recortar(lines: readonly string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] as string).trim() === "") start += 1;
  while (end > start && (lines[end - 1] as string).trim() === "") end -= 1;
  return lines.slice(start, end).join("\n").trimEnd();
}

/**
 * Corta el documento en secciones de nivel 2, respetando los cercos de código.
 *
 * Un `## ` dentro de un bloque cercado es un ejemplo, no una sección: sin mirar
 * los cercos, el `AGENTS.md` de un proyecto que documenta su propio formato se
 * partiría en un lugar arbitrario y el bloque quedaría repartido entre dos
 * archivos de reglas.
 *
 * Lo que va antes de la primera sección —el título del documento y su
 * introducción— se preserva como su propia sección, con el título del documento
 * como encabezado: es lo primero que se lee y perderlo sería perder el contexto
 * de todo lo demás.
 */
function cortarEnSecciones(texto: string): { sections: Seccion[]; title: string | null } {
  const sections: Seccion[] = [];
  const preambulo: string[] = [];
  let title: string | null = null;
  let cercado = false;
  let abierta: { title: string; lines: string[] } | null = null;

  const cerrar = (): void => {
    if (abierta === null) return;
    sections.push({ title: abierta.title, body: recortar(abierta.lines) });
    abierta = null;
  };

  for (const line of texto.split(/\r?\n/)) {
    if (CERCA.test(line)) cercado = !cercado;

    if (!cercado) {
      const nivel2 = /^##\s+(.+?)\s*$/.exec(line);
      if (nivel2 !== null) {
        cerrar();
        abierta = { title: nivel2[1] as string, lines: [] };
        continue;
      }

      // El título del documento es el primer encabezado de nivel 1, y sólo si no
      // hay nada antes que no sean líneas vacías: un `#` en medio del texto es
      // parte del texto.
      if (title === null && abierta === null && preambulo.every((una) => una.trim() === "")) {
        const nivel1 = /^#\s+(.+?)\s*$/.exec(line);
        if (nivel1 !== null) {
          title = nivel1[1] as string;
          continue;
        }
      }
    }

    if (abierta === null) preambulo.push(line);
    else abierta.lines.push(line);
  }
  cerrar();

  const intro = recortar(preambulo);
  if (intro !== "") {
    sections.unshift({ title: title ?? SIN_TITULO, body: intro });
  }

  return { sections, title };
}

/** El nombre de archivo que corresponde a un título. */
export function slugDeTitulo(title: string): string {
  const limpio = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return limpio === "" ? SIN_TITULO : limpio;
}

/** El contenido de un archivo de reglas: título, procedencia y cuerpo. */
function archivoDeRegla(source: string, section: Seccion): ExtractedRule["content"] {
  // La cabecera va **después** del título: `valmen sync` degrada el primer `#`
  // de cada archivo de reglas a `##` para incluirlo en el documento compuesto, y
  // un comentario delante le escondería ese título.
  return (
    `# ${section.title}\n\n` +
    `<!-- Extraído de \`${source}\` por \`valmen adopt\`, sin clasificar: revise qué es\n` +
    "     regla de este proyecto y qué es flujo de trabajo del harness. -->\n\n" +
    `${section.body}\n`
  );
}

/**
 * Recupera las reglas del `AGENTS.md` que el proyecto ya tiene.
 *
 * No escribe nada: devuelve los archivos a escribir y los que ya existen. Quien
 * llama decide si escribe —`--dry-run` no lo hace— y lo informa.
 */
export function extractRules(root: string): RuleExtraction {
  const source = "AGENTS.md";
  const path = join(root, source);
  const texto = existsSync(path) ? readOrNull(path) : null;

  if (texto === null) {
    return {
      source: null,
      files: [],
      skipped: [],
      note: `No hay ${source}: el proyecto arranca sin reglas propias que preservar.`,
    };
  }

  if (texto.includes(MARCADOR_GENERADO)) {
    return {
      source: null,
      files: [],
      skipped: [],
      note:
        `${source} lo generó el harness: sus reglas ya viven en .valmen/rules/ y el ` +
        "próximo `valmen sync` lo recompone igual.",
    };
  }

  const { sections } = cortarEnSecciones(texto);
  const files: ExtractedRule[] = [];
  const skipped: SkippedRule[] = [];
  const usados = new Set<string>();

  for (const section of sections) {
    if (section.body === "") continue;

    // Dos títulos distintos pueden dar el mismo nombre de archivo. El primero
    // se queda con el nombre limpio y los demás llevan sufijo, en vez de pisarse
    // o de desaparecer sin que nadie lo note.
    const base = slugDeTitulo(section.title);
    let nombre = base;
    for (let n = 2; usados.has(nombre); n += 1) nombre = `${base}-${n}`;
    usados.add(nombre);

    const destino = `.valmen/rules/${nombre}.md`;
    if (existsSync(join(root, destino))) {
      skipped.push({ path: destino, heading: section.title });
      continue;
    }

    files.push({
      path: destino,
      content: archivoDeRegla(source, section),
      heading: section.title,
    });
  }

  return {
    source,
    files,
    skipped,
    note:
      files.length === 0 && skipped.length === 0
        ? `${source} no tiene secciones con contenido que extraer.`
        : null,
  };
}

/**
 * El informe de la extracción, en líneas.
 *
 * Va aparte de la escritura porque el informe es el mismo con `--dry-run` —que
 * no escribe— y cuando el destino ya existe: quien adopta tiene que ver qué se
 * preservó y qué no, sin correr nada.
 */
export function renderRuleExtraction(extraction: RuleExtraction): string[] {
  if (extraction.source === null) {
    return extraction.note === null ? [] : [`  ${extraction.note}`];
  }

  const lines: string[] = [];
  if (extraction.files.length > 0) {
    lines.push(
      `Reglas del ${extraction.source} previo, una por sección (${extraction.files.length}):`,
    );
    for (const file of extraction.files) lines.push(`  ${file.path}`);
    lines.push(
      "",
      `  Cada sección de \`${extraction.source}\` quedó en su archivo, sin clasificar: revise`,
      "  qué es regla de este proyecto y qué es flujo de trabajo del harness. El próximo",
      "  `valmen sync` las incluye en el AGENTS.md generado.",
    );
  }

  if (extraction.skipped.length > 0) {
    lines.push("", `  Ya existía, y no se toca (${extraction.skipped.length}):`);
    for (const skipped of extraction.skipped) {
      lines.push(`    ${skipped.path}  — ${skipped.heading}`);
    }
  }

  if (extraction.note !== null) lines.push("", `  ${extraction.note}`);

  return lines;
}
