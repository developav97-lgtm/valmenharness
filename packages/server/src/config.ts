/**
 * Configuración editable desde la interfaz.
 *
 * `.valmen/config.yaml` es la configuración del harness en el proyecto, y hasta
 * ahora solo se podía tocar con un editor. Mission Control la edita sin
 * convertirse en una segunda implementación del formato:
 *
 * - El texto es la fuente. Se edita en crudo, así que **los comentarios
 *   sobreviven**: son la mitad del valor de ese archivo, porque explican por qué
 *   cada valor es el que es.
 * - El análisis sintáctico lo hace el mismo parser que usa el CLI
 *   (`@valmen/adapter`). Si el texto no parsea, **no se guarda** y se muestra el
 *   error con su número de línea.
 * - El efecto se muestra antes de guardar: qué entendió el harness y cómo cambia
 *   `AGENTS.md`. Un campo mal escrito que se guarda en silencio es peor que un
 *   error de sintaxis, que al menos se ve.
 * - La escritura es atómica y bajo el lock del registro: la app es un escritor
 *   más, no uno con privilegios.
 *
 * Ver docs/06-CONTROL-APP.md §2.6.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import {
  type ConfigMap,
  type ProjectedFile,
  parseConfig,
  projectFiles,
  readList,
  readString,
} from "@valmen/adapter";
import { atomicWrite, fail, toFailure } from "@valmen/core";

/** Ruta del archivo de configuración del proyecto. */
export function configPath(root: string): string {
  return join(root, ".valmen", "config.yaml");
}

/** Lo que el harness entendió del texto. */
export interface ConfigSummary {
  readonly name: string;
  readonly description: string;
  readonly ticketsDir: string;
  readonly gates: readonly string[];
  /** Claves de primer nivel presentes, en orden de aparición. */
  readonly keys: readonly string[];
  /** `true` si el proyecto ya está adoptado: hay configuración escrita. */
  readonly adopted: boolean;
}

/** El estado de la configuración, tras leerla o tras analizar un texto. */
export interface ConfigState {
  readonly path: string;
  readonly text: string;
  /** `true` si el texto analizado es válido. */
  readonly ok: boolean;
  /** El error del parser, con su línea, si no lo es. */
  readonly error: string;
  /** `null` si el texto no parsea: no hay interpretación que mostrar. */
  readonly summary: ConfigSummary | null;
  /**
   * Diferencias contra el archivo en disco, línea por línea.
   *
   * Vacío si el texto es idéntico al que ya está guardado. Se calcula aquí y no
   * en el navegador para que la misma comparación valga para el CLI.
   */
  readonly diff: readonly ConfigDiffLine[];
}

/** Una línea del diff. */
export interface ConfigDiffLine {
  readonly kind: "same" | "add" | "remove";
  readonly text: string;
}

/** Resume un texto de configuración ya analizado. */
function summarize(
  config: ConfigMap,
  root: string,
  adopted: boolean,
): ConfigSummary {
  return {
    name: readString(config, "name", basename(root)),
    description: readString(config, "description", ""),
    ticketsDir: readString(config, "tickets-dir", ""),
    gates: readList(config, "gates", []),
    keys: Object.keys(config),
    adopted,
  };
}

/**
 * Compara dos textos línea por línea.
 *
 * Es un diff por subsecuencia común: sin él, intercambiar dos líneas aparecería
 * como dos cambios en vez de como un movimiento, y una lista reordenada se
 * leería como si se hubiera reescrito entera. Sobre un archivo de este tamaño el
 * coste es despreciable.
 */
export function diffLines(
  before: string,
  after: string,
): ConfigDiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");

  // Matriz de longitudes de la subsecuencia común más larga.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      (lcs[i] as number[])[j] =
        a[i] === b[j]
          ? ((lcs[i + 1] as number[])[j + 1] as number) + 1
          : Math.max(
              (lcs[i + 1] as number[])[j] as number,
              (lcs[i] as number[])[j + 1] as number,
            );
    }
  }

  const salida: ConfigDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      salida.push({ kind: "same", text: a[i] as string });
      i += 1;
      j += 1;
    } else if (
      ((lcs[i + 1] as number[])[j] as number) >=
      ((lcs[i] as number[])[j + 1] as number)
    ) {
      salida.push({ kind: "remove", text: a[i] as string });
      i += 1;
    } else {
      salida.push({ kind: "add", text: b[j] as string });
      j += 1;
    }
  }
  while (i < a.length) {
    salida.push({ kind: "remove", text: a[i] as string });
    i += 1;
  }
  while (j < b.length) {
    salida.push({ kind: "add", text: b[j] as string });
    j += 1;
  }
  return salida;
}

/** El texto guardado, o `""` si el proyecto no tiene configuración todavía. */
export function readConfigText(root: string): string {
  try {
    return readFileSync(configPath(root), "utf8");
  } catch {
    return "";
  }
}

/**
 * La configuración guardada, ya analizada.
 *
 * Un archivo que no parsea devuelve un mapa vacío en vez de fallar: quien pregunta
 * es el listado de modelos, y un `config.yaml` roto ya tiene su error donde se
 * edita. Convertirlo en un fallo del listado escondería el problema real detrás
 * de otro.
 */
export function readConfig(root: string): ConfigMap {
  const texto = readConfigText(root);
  if (texto.trim() === "") return {};
  try {
    return parseConfig(texto);
  } catch {
    return {};
  }
}

/** Analiza un texto sin escribir nada. */
export function checkConfig(root: string, text: string): ConfigState {
  const guardado = readConfigText(root);
  let summary: ConfigSummary | null = null;
  let error = "";

  try {
    summary = summarize(
      parseConfig(text),
      root,
      existsSync(configPath(root)),
    );
  } catch (caught) {
    error = toFailure(caught).message;
  }

  return {
    path: configPath(root),
    text,
    ok: summary !== null,
    error,
    summary,
    diff: diffLines(guardado, text),
  };
}

/**
 * Guarda la configuración, si parsea.
 *
 * Nunca escribe un archivo que el harness no pueda leer: un `config.yaml` roto
 * dejaría el proyecto sin proyección y sin índice, y el error aparecería más
 * tarde y en otro sitio.
 */
export function writeConfig(
  root: string,
  text: string,
): ConfigState & { readonly written: boolean } {
  const estado = checkConfig(root, text);
  if (!estado.ok) {
    return { ...estado, written: false };
  }
  atomicWrite(configPath(root), text);
  return { ...estado, written: true, diff: [] };
}

/** El estado de un archivo generado respecto de lo que el harness proyecta. */
export interface ProjectedFileState {
  readonly path: string;
  /** `true` si falta o si su contenido no es el proyectado. */
  readonly stale: boolean;
}

/** Qué archivos generados quedarían desactualizados con este texto. */
export interface ProjectionImpact {
  /** `true` si algún archivo generado no coincide con la proyección. */
  readonly changesAgentsMd: boolean;
  readonly files: readonly ProjectedFileState[];
  /** Cuántos archivos habría que regenerar. */
  readonly stale: number;
}

/**
 * Calcula el efecto del texto sobre los archivos generados.
 *
 * No escribe: muestra la consecuencia de guardar. Sin esto, el usuario tendría
 * que saber que `AGENTS.md` es un archivo generado y que su edición lo deja
 * obsoleto —que es exactamente el conocimiento que la app debe evitar exigir—.
 *
 * Se proyectan **todos** los archivos, no solo `AGENTS.md`: si el proyecto tiene
 * agentes en `.valmen/agents/`, la configuración afecta también a los archivos
 * de cada runtime, y avisar solo del primero dejaría los otros obsoletos en
 * silencio.
 */
export function projectionImpact(
  root: string,
  text: string,
): ProjectionImpact | null {
  let proyectados: readonly ProjectedFile[];
  try {
    proyectados = projectFiles(root, basename(root), text).files;
  } catch {
    // Un texto que no parsea no tiene efecto que mostrar. El error de sintaxis
    // ya se muestra aparte.
    return null;
  }

  const files = proyectados.map((archivo) => {
    let enDisco: string | null = null;
    try {
      enDisco = readFileSync(join(root, archivo.path), "utf8");
    } catch {
      enDisco = null;
    }
    return { path: archivo.path, stale: enDisco !== archivo.content };
  });

  return {
    changesAgentsMd: files.some((archivo) => archivo.stale),
    files,
    stale: files.filter((archivo) => archivo.stale).length,
  };
}

/** El resultado de regenerar los archivos proyectados. */
export interface SyncOutcome {
  readonly ok: boolean;
  readonly error: string;
  /** Archivos escritos, en orden. */
  readonly written: readonly string[];
  /** Los que ya estaban al día: reescribirlos no cambiaría nada. */
  readonly unchanged: readonly string[];
}

/**
 * Regenera los archivos proyectados.
 *
 * Es la misma proyección que ejecuta `valmen sync`, calculada por la misma
 * función: el botón y el comando no pueden producir archivos distintos. Se
 * escribe solo lo que cambió, para no tocar la fecha de modificación de archivos
 * que ya estaban bien.
 */
export function syncProjections(root: string): SyncOutcome {
  let proyectados: readonly ProjectedFile[];
  try {
    proyectados = projectFiles(root, basename(root)).files;
  } catch (caught) {
    return {
      ok: false,
      error: toFailure(caught).message,
      written: [],
      unchanged: [],
    };
  }

  const written: string[] = [];
  const unchanged: string[] = [];
  for (const archivo of proyectados) {
    const ruta = join(root, archivo.path);
    let enDisco: string | null = null;
    try {
      enDisco = readFileSync(ruta, "utf8");
    } catch {
      enDisco = null;
    }
    if (enDisco === archivo.content) {
      unchanged.push(archivo.path);
      continue;
    }
    // Escritura atómica y por archivo: si algo falla a mitad, los anteriores ya
    // escritos siguen siendo proyecciones válidas del mismo modelo, así que el
    // estado intermedio es coherente y volver a ejecutarlo lo completa.
    atomicWrite(ruta, archivo.content);
    written.push(archivo.path);
  }

  return { ok: true, error: "", written, unchanged };
}

/** Un valor de la configuración como mapa, o `null` si no lo es. */
function comoMapa(valor: unknown): ConfigMap | null {
  if (valor === undefined) return null;
  if (typeof valor === "string" || Array.isArray(valor)) return null;
  return valor as ConfigMap;
}

/**
 * Los modelos que el usuario declara para un proveedor.
 *
 * Existe porque algunos proveedores **no publican su catálogo** —codex es el
 * caso— y sin esto el selector solo ofrece escribir el identificador a mano, que
 * es donde se cometen los errores de tipeo que después fallan en mitad de un
 * gate. Declararlos aquí los convierte en una lista de la que elegir.
 *
 * ```yaml
 * providers:
 *   codex:
 *     candidates: [gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-6-astra]
 * ```
 *
 * Es del proyecto y no del harness a propósito: qué modelos usa alguien depende
 * de su suscripción, y una lista curada dentro del código estaría desactualizada
 * el mes siguiente. Ver `.valmen/config.yaml`.
 */
export function readProviderCandidates(
  config: ConfigMap,
  provider: string,
): string[] {
  const providers = comoMapa(config["providers"]);
  if (providers === null) return [];
  const entrada = providers[provider];
  if (entrada === undefined) return [];
  if (typeof entrada === "string" || Array.isArray(entrada)) {
    fail(`config.yaml: "providers.${provider}" debe ser un mapa.`);
  }
  const candidatos = entrada["candidates"];
  if (candidatos === undefined) return [];
  return readList({ candidates: candidatos }, "candidates", []).filter(
    (modelo) => modelo.trim() !== "",
  );
}

/** Los modelos declarados para cada proveedor, con su nombre. */
export function allProviderCandidates(
  config: ConfigMap,
): { readonly provider: string; readonly models: readonly string[] }[] {
  const providers = comoMapa(config["providers"]);
  if (providers === null) return [];
  return Object.keys(providers)
    .sort()
    .map((provider) => ({ provider, models: readProviderCandidates(config, provider) }))
    .filter((entrada) => entrada.models.length > 0);
}
