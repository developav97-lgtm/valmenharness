/**
 * La memoria del proyecto: lo que ya se decidió y lo que ya falló.
 *
 * Un proyecto acumula conocimiento en documentos —decisiones arquitectónicas,
 * errores con su causa raíz, patrones que se repiten— y ese conocimiento se usa
 * mal por una razón que no es de nadie: **está, pero hay que acordarse de
 * buscarlo**. `grep` encuentra lo que ya sabés que buscás; el problema es el que
 * no sabés que ya está resuelto.
 *
 * Esto lo indexa y lo hace consultable, con dos decisiones de diseño:
 *
 * **La memoria no se muda.** Los documentos se leen donde están —`docs/decisions.md`,
 * `docs/errors.md`, los que el proyecto declare— y nunca se reescriben. Mover el
 * conocimiento de un proyecto para poder consultarlo sería pedirle que se adapte
 * a la herramienta; lo que se guarda es el índice, y el índice se reconstruye.
 *
 * **La búsqueda es léxica y el que juzga es el modelo.** Sin embeddings: no hay
 * dependencia, no hay red, y funciona igual sin conexión. La consulta recupera
 * candidatos por sus palabras —con el título y el identificador pesando más que el
 * cuerpo— y quien lee decide si sirven. Es la misma división del resto del harness:
 * el código recupera y ordena, el modelo interpreta. Un buscador que devuelve tres
 * candidatos buenos y uno malo es útil; uno que no devuelve nada porque las
 * palabras no coinciden exactamente no lo es, y por eso la búsqueda **no exige que
 * aparezcan todas** las palabras de la consulta.
 */
import { appendFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { configList, type RegistryPaths } from "./discovery.js";

/** De qué clase es una entrada de la memoria. */
export type MemoryKind = "decision" | "error" | "patron" | "aprendizaje" | "otro";

/** Una entrada de la memoria, ya analizada. */
export interface MemoryEntry {
  readonly kind: MemoryKind;
  /** El identificador si lo declara: `ADR-041`, `E189`. */
  readonly id: string | null;
  readonly title: string;
  /** La fecha declarada en el cuerpo, si la hay. */
  readonly date: string | null;
  /** El estado declarado —`Activa`, `Resuelto`—, si lo hay. */
  readonly status: string | null;
  /** El texto completo de la entrada, sin el encabezado. */
  readonly body: string;
  /** Dónde vive: ruta relativa y línea del encabezado. */
  readonly source: { readonly path: string; readonly line: number };
  /** Los términos del título y del identificador, que pesan más al buscar. */
  readonly strong: readonly string[];
  /** Todos los términos del cuerpo, para la búsqueda. */
  readonly terms: readonly string[];
}

/**
 * Un encabezado que parece una entrada.
 *
 * El formato real de estos documentos tiene tres variantes —`### [E189] …`,
 * `## E-010: …`, `## E031 — …`— porque se escribieron en momentos distintos, y un
 * índice que solo entienda la última deja afuera las dos terceras partes del
 * conocimiento. El identificador es lo que distingue una entrada de un contenedor
 * (`## Patrones Registrados` no lleva id): por eso se exige, con corchetes o sin
 * ellos, con guion o sin él.
 */
const ENTRADA_RE =
  /^(#{2,3})\s+(?:\[([A-Za-z]{1,5}-?\d{1,4})\]\s*|([A-Za-z]{1,5}-?\d{1,4})\s*[:—–-]\s*)(.+)$/;

/**
 * Las secciones que no son conocimiento: explican el formato o guardan la
 * plantilla vacía.
 *
 * Se detectan por el encabezado y no por el contenido porque son secciones
 * completas, y una plantilla indexada aparece en cada búsqueda: el ejemplo del
 * formato —`### [ADR-XXX] Título de la decisión`— compite con las decisiones de
 * verdad y no dice nada.
 */
const PLANTILLA_RE = /^(?:#{1,3})\s+.*(?:formato de entrada|plantilla)/i;

/** Las palabras que no aportan a una búsqueda en este dominio. */
const VACIAS = new Set([
  "de",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "y",
  "o",
  "u",
  "que",
  "en",
  "a",
  "al",
  "del",
  "se",
  "su",
  "sus",
  "por",
  "para",
  "con",
  "sin",
  "no",
  "ni",
  "es",
  "son",
  "fue",
  "ser",
  "como",
  "mas",
  "pero",
  "si",
  "ya",
  "lo",
  "le",
  "les",
  "me",
  "te",
  "nos",
  "the",
  "of",
  "and",
  "to",
  "in",
  "is",
  "it",
  "this",
  "that",
  "for",
  "with",
  "on",
  "at",
  "from",
  "be",
  "are",
  "was",
  "were",
]);

/** Parte un texto en términos: sin tildes, en minúsculas, sin palabras vacías. */
export function tokenize(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9_]+/)
    .filter((termino) => termino.length >= 3 && !VACIAS.has(termino));
}

/** De qué clase es una entrada, por su identificador y por el archivo donde vive. */
function kindOf(id: string | null, path: string, titulo: string): MemoryKind {
  const referencia = `${id ?? ""} ${path} ${titulo}`.toLowerCase();
  if (/(?:^|\W)adr-?\d/.test(referencia) || referencia.includes("decision"))
    return "decision";
  if (/(?:^|\W)e-?\d/.test(referencia) || referencia.includes("error")) return "error";
  if (referencia.includes("patron") || referencia.includes("patrón")) return "patron";
  if (referencia.includes("aprendizaje")) return "aprendizaje";
  return "otro";
}

/** El valor de una etiqueta del cuerpo: `**Fecha:** 2026-08-26`. */
function etiqueta(cuerpo: string, nombre: string): string | null {
  const match = new RegExp(`\\*\\*${nombre}:?\\*\\*\\s*(.+)`, "i").exec(cuerpo);
  return match === null ? null : (match[1] as string).trim();
}

/**
 * Analiza un documento en entradas.
 *
 * Un archivo sin entradas reconocibles devuelve vacío, y eso es un resultado: hay
 * documentos que son prosa y no un registro, y forzarlos a entradas produciría
 * fragmentos sin identificador que después nadie puede citar.
 */
export function parseMemory(texto: string, path: string): MemoryEntry[] {
  const lineas = texto.split("\n");
  const entradas: MemoryEntry[] = [];
  let plantilla = false;
  let actual: { id: string | null; title: string; line: number; cuerpo: string[] } | null =
    null;

  const cerrar = (): void => {
    if (actual === null) return;
    const cuerpo = actual.cuerpo.join("\n").trim();
    const fuerte = tokenize(`${actual.id ?? ""} ${actual.title}`);
    entradas.push({
      kind: kindOf(actual.id, path, actual.title),
      id: actual.id,
      title: actual.title,
      date: etiqueta(cuerpo, "fecha") ?? etiqueta(cuerpo, "primera vez visto"),
      status: etiqueta(cuerpo, "estado"),
      body: cuerpo,
      source: { path, line: actual.line },
      strong: [...new Set(fuerte)],
      terms: [...new Set(tokenize(`${actual.title} ${cuerpo}`))],
    });
    actual = null;
  };

  for (const [indice, linea] of lineas.entries()) {
    if (/^#{1,3}\s+/.test(linea)) {
      if (PLANTILLA_RE.test(linea)) {
        cerrar();
        plantilla = true;
        continue;
      }
      if (/^##\s+/.test(linea) && !ENTRADA_RE.test(linea)) {
        // Un `##` que no es entrada abre otra sección: la plantilla termina.
        plantilla = false;
      }
    }

    const match = ENTRADA_RE.exec(linea);
    if (match !== null) {
      cerrar();
      if (!plantilla) {
        actual = {
          id: (match[2] ?? match[3] ?? "").toUpperCase() || null,
          title: (match[4] as string).trim(),
          line: indice + 1,
          cuerpo: [],
        };
      }
      continue;
    }

    if (actual !== null) actual.cuerpo.push(linea);
  }

  cerrar();
  return entradas;
}

/** Los archivos que son memoria: los declarados y los del propio harness. */
export function memoryFiles(root: string): string[] {
  const declarados = configList(root, "memory-sources");

  // Lo que el harness guarda vive acá, y se indexa siempre: un aprendizaje
  // guardado por `guardar_aprendizaje` que no se pueda volver a encontrar sería
  // una escritura sin lectura.
  let propios: string[] = [];
  try {
    propios = readdirSync(join(root, ".valmen", "memory"))
      .filter((nombre) => nombre.endsWith(".md"))
      .map((nombre) => join(".valmen", "memory", nombre));
  } catch {
    propios = [];
  }

  return [...new Set([...declarados, ...propios])].sort();
}

/** La memoria completa del proyecto, indexada. */
export function loadMemory(paths: RegistryPaths): MemoryEntry[] {
  const entradas: MemoryEntry[] = [];
  for (const relativa of memoryFiles(paths.root)) {
    let texto: string;
    try {
      texto = readFileSync(join(paths.root, relativa), "utf8");
    } catch {
      // Un archivo declarado que no existe no rompe la búsqueda: devuelve lo que
      // sí está, y quien declaró la fuente la corrige cuando lo note.
      continue;
    }
    entradas.push(...parseMemory(texto, relativa));
  }
  return entradas;
}

/** Un resultado de búsqueda, con su puntuación. */
export interface MemoryHit {
  readonly entry: MemoryEntry;
  readonly score: number;
  /** Los términos de la consulta que aparecen, para poder explicar por qué salió. */
  readonly matched: readonly string[];
}

/**
 * Busca en la memoria.
 *
 * La puntuación premia —en este orden— el identificador, el título y el cuerpo, y
 * castiga el cuerpo largo: una entrada de dos mil palabras que menciona el término
 * una vez no es más relevante que una de cien que lo menciona en el título, y sin
 * esa corrección las entradas más largas ganan siempre.
 *
 * **No se exige que aparezcan todas las palabras.** Una consulta es una
 * descripción, no un filtro: `bulk_create register_bulk_sync` tiene que encontrar
 * la entrada que habla de las dos cosas, y también la que habla de una sola si es
 * lo único que hay. Quien lee los candidatos decide.
 */
export function searchMemory(
  entradas: readonly MemoryEntry[],
  consulta: string,
  limite = 5,
): MemoryHit[] {
  const terminos = [...new Set(tokenize(consulta))];
  if (terminos.length === 0 || entradas.length === 0) return [];

  // Frecuencia inversa: un término que aparece en todas las entradas no
  // distingue nada, y uno que aparece en dos es casi una respuesta.
  const apariciones = new Map<string, number>();
  for (const termino of terminos) {
    apariciones.set(
      termino,
      entradas.filter(
        (entrada) => entrada.terms.includes(termino) || entrada.strong.includes(termino),
      ).length,
    );
  }

  const hits: MemoryHit[] = [];
  for (const entrada of entradas) {
    const matched: string[] = [];
    let score = 0;

    for (const termino of terminos) {
      const enFuerte = entrada.strong.includes(termino);
      const enCuerpo = entrada.terms.includes(termino);
      if (!enFuerte && !enCuerpo) continue;
      matched.push(termino);

      const veces = enCuerpo ? 1 : 0;
      const idf = Math.log(1 + entradas.length / (1 + (apariciones.get(termino) ?? 1)));
      score += idf * (enFuerte ? 3 : veces);
    }

    if (matched.length === 0) continue;
    // Normalización por longitud: sin esto, las entradas más largas ganan por
    // tamaño y no por pertinencia.
    const largo = Math.max(1, entrada.terms.length);
    hits.push({ entry: entrada, score: score / (1 + Math.log(1 + largo / 40)), matched });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limite);
}

/** El resultado de una búsqueda, en texto. */
export function renderHits(hits: readonly MemoryHit[], consulta: string): string {
  if (hits.length === 0) {
    return `Sin resultados para «${consulta}» en la memoria del proyecto.\n`;
  }

  const lineas = [
    `Memoria del proyecto — ${hits.length} resultado(s) para «${consulta}»`,
    "",
  ];
  for (const hit of hits) {
    const { entry } = hit;
    // El estado se muestra porque una decisión supersedida sigue siendo
    // conocimiento —y a veces el más útil, porque explica por qué se cambió de
    // rumbo—, pero tiene que verse que lo está al primer renglón. La antigüedad de
    // un documento no lo invalida: lo invalida que su propia entrada lo diga.
    const referencia =
      `${entry.id === null ? "" : `${entry.id} · `}${entry.date ?? "sin fecha"}` +
      (entry.status === null ? "" : ` · ${entry.status}`);
    lineas.push(`  [${entry.kind}] ${referencia}`);
    lineas.push(`  ${entry.title}`);
    // Un extracto, no el cuerpo entero: lo que hay que decidir es si vale la pena
    // abrir el archivo, y para eso alcanza con las primeras líneas con contenido.
    const extracto = entry.body
      .split("\n")
      .map((linea) => linea.trim())
      .filter((linea) => linea !== "")
      .slice(0, 2)
      .join(" ")
      .slice(0, 240);
    if (extracto !== "") lineas.push(`  ${extracto}`);
    lineas.push(`  → ${entry.source.path}:${entry.source.line}`);
    lineas.push("");
  }
  return `${lineas.join("\n").trimEnd()}\n`;
}

/** Lo que se guarda como aprendizaje. */
export interface NewLearning {
  readonly title: string;
  readonly body: string;
  readonly tickets?: readonly string[];
  readonly now?: (() => Date) | undefined;
}

/**
 * Guarda un aprendizaje en la memoria del proyecto.
 *
 * Se **anexa** a `.valmen/memory/aprendizajes.md` con el mismo formato que leen
 * los documentos del proyecto: lo que el harness escribe y lo que las personas
 * escribieron tienen que poder leerse juntos, o el índice tendría dos dialectos.
 */
export function saveLearning(
  paths: RegistryPaths,
  aprendizaje: NewLearning,
): { readonly path: string; readonly id: string } {
  const fecha = (aprendizaje.now?.() ?? new Date()).toISOString().slice(0, 10);
  const directorio = join(paths.root, ".valmen", "memory");
  const archivo = join(directorio, "aprendizajes.md");
  const relativa = join(".valmen", "memory", "aprendizajes.md");

  mkdirSync(directorio, { recursive: true });

  let previos = 0;
  try {
    previos = parseMemory(readFileSync(archivo, "utf8"), relativa).length;
  } catch {
    // El archivo no existe: es el primero, y lleva su título de documento.
    appendFileSync(
      archivo,
      "# Aprendizajes\n\nRegistro de lo que el trabajo enseñó.\n",
      "utf8",
    );
  }

  const id = `AP-${String(previos + 1).padStart(3, "0")}`;
  const tickets = aprendizaje.tickets ?? [];
  const entrada = [
    "",
    `### [${id}] ${aprendizaje.title.trim()}`,
    "",
    // Las etiquetas van con guion, como las de las propuestas de estándar: el
    // mismo formato en los dos archivos hace que una herramienta que lea uno lea
    // el otro, y que una persona no tenga que aprender dos dialectos.
    `- **Fecha:** ${fecha}`,
    // Nace **pendiente**: guardar es del agente —lo descubrió y lo anota—, y
    // decidir qué es eso es de una persona. La cola es lo que hace que la segunda
    // mitad ocurra en vez de quedar en un «algún día lo reviso».
    "- **Estado:** pendiente",
    ...(tickets.length === 0 ? [] : [`- **Tickets:** ${tickets.join(", ")}`]),
    "",
    aprendizaje.body.trim(),
    "",
  ].join("\n");

  appendFileSync(archivo, entrada, "utf8");
  return { path: relativa, id };
}
