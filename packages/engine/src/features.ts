/**
 * El registro de features en disco.
 *
 * Vive en `.valmen/features/<slug>/`, junto a las reglas y los agentes: es lo que
 * el harness ya escribe y proyecta, y el proyecto no tiene que hacer sitio para
 * una carpeta nueva en su raíz. Y no en `docs/` porque una feature no es
 * documentación para leer: es el contrato del trabajo, con su estado, su
 * cobertura y sus tickets.
 *
 * Los artefactos de una feature son archivos:
 *
 * ```
 * .valmen/features/<slug>/
 *   feature.md                el brief y el frontmatter con el estado
 *   spec/<dominio>/spec.md    requisitos RFC 2119 y escenarios
 *   design.md                 alternativas y decisión
 *   tickets.yaml              sprints, cobertura y huecos
 *   verify.md                 evidencia, al completar
 * ```
 *
 * Igual que el registro de tickets, una feature que no valida **no se oculta**:
 * se lista con su error, porque una feature rota es justo lo que hay que ver.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  EXIT_HISTORY,
  FEATURE_FRONTMATTER_FIELDS,
  FEATURE_TEMPLATE,
  SCHEMA_VERSION,
  atomicWrite,
  fail,
  today,
  validateFeatureFields,
} from "@valmen/core";

/** El directorio de features, relativo a la raíz del proyecto. */
export function featuresDir(root: string): string {
  return join(root, ".valmen", "features");
}

/** La ruta del brief de una feature. */
export function featurePath(root: string, slug: string): string {
  return join(featuresDir(root), slug, "feature.md");
}

/** Los artefactos que puede tener una feature, además del brief. */
export interface FeatureArtifacts {
  readonly hasSpec: boolean;
  readonly hasDesign: boolean;
  readonly hasDecomposition: boolean;
  readonly hasVerify: boolean;
}

/** Una fila de la lista de features. */
export interface FeatureRow {
  readonly id: string;
  readonly title: string;
  readonly state: string;
  readonly created: string;
  readonly updated: string;
  readonly artifacts: FeatureArtifacts;
  /** `null` si la feature es válida; el mensaje de error si no lo es. */
  readonly invalid: string | null;
}

/** Una feature leída: su fila y el texto completo del brief. */
export interface ReadFeature {
  readonly row: FeatureRow;
  readonly text: string;
}

/** El frontmatter de una feature, que no es el del ticket. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const LINEA_RE = /^([a-z_]+): ?(.*)$/;

/**
 * Lee el frontmatter de una feature.
 *
 * No reutiliza `parseFrontmatter` de `core`: aquel valida las 18 claves del
 * ticket **y su orden**, y una feature tiene seis. Compartir el parser obligaría
 * a relajarlo para los dos, que es como se pierden las garantías del ticket.
 */
export function parseFeatureFrontmatter(text: string): Record<string, string> {
  const bloque = FRONTMATTER_RE.exec(text);
  if (bloque === null) {
    fail("feature.md debe empezar con frontmatter delimitado por ---.");
  }

  const campos: Record<string, string> = {};
  for (const linea of (bloque[1] ?? "").split(/\r?\n/)) {
    const match = LINEA_RE.exec(linea);
    if (match === null) {
      fail("El frontmatter de la feature solo admite líneas clave: valor.");
    }
    const clave = match[1] as string;
    if (!(FEATURE_FRONTMATTER_FIELDS as readonly string[]).includes(clave)) {
      fail(
        `El campo de frontmatter "${clave}" no pertenece a la feature. ` +
          `Los válidos son: ${FEATURE_FRONTMATTER_FIELDS.join(", ")}.`,
      );
    }
    if (Object.hasOwn(campos, clave)) {
      fail(`El campo de frontmatter "${clave}" está duplicado.`);
    }
    campos[clave] = match[2] as string;
  }

  const faltan = FEATURE_FRONTMATTER_FIELDS.filter((clave) => !Object.hasOwn(campos, clave));
  if (faltan.length > 0) {
    fail(`A la feature le faltan campos: ${faltan.join(", ")}.`);
  }
  return campos;
}

/** Los directorios de features, ordenados por nombre. */
function featureDirs(root: string): string[] {
  const base = featuresDir(root);
  let nombres: string[];
  try {
    nombres = readdirSync(base);
  } catch {
    // Un proyecto sin features no es un error: es un proyecto sin features.
    return [];
  }
  return nombres
    .filter((nombre) => {
      try {
        return statSync(join(base, nombre)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

/** Qué artefactos existen ya, para saber en qué punto está la feature. */
function leerArtefactos(carpeta: string): FeatureArtifacts {
  return {
    hasSpec: existsSync(join(carpeta, "spec")),
    hasDesign: existsSync(join(carpeta, "design.md")),
    hasDecomposition: existsSync(join(carpeta, "tickets.yaml")),
    hasVerify: existsSync(join(carpeta, "verify.md")),
  };
}

/**
 * Lee una feature del disco.
 *
 * Devuelve `null` solo si no existe el archivo. Si existe y no valida, devuelve
 * la fila con `invalid`: quien lista tiene que ver el problema, no un hueco.
 */
export function readFeature(root: string, slug: string): ReadFeature | null {
  const documento = featurePath(root, slug);
  let text: string;
  try {
    text = readFileSync(documento, "utf8");
  } catch {
    return null;
  }

  const artifacts = leerArtefactos(join(featuresDir(root), slug));
  try {
    const campos = parseFeatureFrontmatter(text);
    const feature = {
      id: campos["id"] as string,
      title: campos["title"] as string,
      state: campos["state"] as string,
      created: campos["created"] as string,
      updated: campos["updated"] as string,
    };
    validateFeatureFields(feature);
    // El identificador tiene que coincidir con la carpeta: sin esta comprobación,
    // renombrar un directorio cambiaría de feature en silencio.
    if (feature.id !== slug) {
      fail(
        `El id del frontmatter ("${feature.id}") no coincide con la carpeta ("${slug}").`,
      );
    }
    return { row: { ...feature, artifacts, invalid: null }, text };
  } catch (caught) {
    return {
      row: {
        id: slug,
        title: "(no se pudo leer)",
        state: "?",
        created: "",
        updated: "",
        artifacts,
        invalid: caught instanceof Error ? caught.message : String(caught),
      },
      text,
    };
  }
}

/**
 * Lista las features.
 *
 * Las inválidas van al final: la lista se lee para trabajar, y lo que hay que
 * arreglar antes de poder trabajar no compite por el primer renglón.
 */
export function listFeatures(root: string): FeatureRow[] {
  const filas = featureDirs(root)
    .map((slug) => readFeature(root, slug)?.row)
    .filter((fila): fila is FeatureRow => fila !== undefined);

  return filas.sort((a, b) => {
    if ((a.invalid === null) !== (b.invalid === null)) return a.invalid === null ? -1 : 1;
    return b.updated.localeCompare(a.updated) || a.id.localeCompare(b.id);
  });
}

/** Lo que hace falta para crear una feature. */
export interface CreateFeatureRequest {
  readonly root: string;
  readonly id: string;
  readonly title: string;
  readonly now?: (() => Date) | undefined;
}

/**
 * Crea una feature en `draft`.
 *
 * Nace **sin spec**: el brief es lo que se escribe primero y la spec es el paso
 * siguiente, así que crear la carpeta de `spec/` vacía sería prometer un trabajo
 * que todavía no se hizo. El frontmatter se valida antes de tocar el disco, de
 * modo que un identificador inválido falla sin dejar carpeta ni a medias.
 */
export function createFeature(request: CreateFeatureRequest): string {
  const { root, id } = request;
  const date = today(request.now?.() ?? new Date());
  const title = request.title.trim();

  validateFeatureFields({ id, title, state: "draft", created: date, updated: date });

  const carpeta = join(featuresDir(root), id);
  if (existsSync(carpeta)) {
    fail(
      `La feature "${id}" ya existe en .valmen/features/ y no se sobrescribe.`,
      EXIT_HISTORY,
    );
  }

  let texto = FEATURE_TEMPLATE;
  for (const [clave, valor] of [
    ["schema_version", SCHEMA_VERSION],
    ["id", id],
    ["title", title],
    ["state", "draft"],
    ["created", date],
    ["updated", date],
  ] as const) {
    texto = reemplazarCampo(texto, clave, valor);
  }
  // El título aparece dos veces: en el frontmatter y como encabezado, que es lo
  // que lee una persona.
  texto = texto.replace("# Título de la feature", `# ${title}`);

  mkdirSync(carpeta, { recursive: true });
  atomicWrite(featurePath(root, id), texto);

  return `Feature creada: ${id} (draft) → .valmen/features/${id}/feature.md`;
}

/** Sustituye una línea del frontmatter. Falla si no está exactamente una vez. */
function reemplazarCampo(text: string, clave: string, valor: string): string {
  const patron = new RegExp(`^${clave}: .*$`, "gm");
  const veces = text.match(patron)?.length ?? 0;
  if (veces !== 1) {
    fail(`La plantilla de feature no tiene el campo ${clave} exactamente una vez.`);
  }
  return text.replace(patron, `${clave}: ${valor}`);
}
