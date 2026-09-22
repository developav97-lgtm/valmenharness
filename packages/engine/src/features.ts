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
  EXIT_INVARIANT,
  FEATURE_TEMPLATE,
  MutationLock,
  SCHEMA_VERSION,
  atomicWrite,
  fail,
  nextFeatureStates,
  parseFeatureFrontmatter,
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
  /**
   * Los estados por los que se pasó para llegar aquí, si hubo alguno.
   *
   * Lo escribe `advanceFeature` y no el archivo: la feature no estuvo en esos
   * estados —se escribió una sola vez—, pero quien llama tiene que poder decir
   * que el camino pasó por ellos.
   */
  readonly via?: readonly string[];
}

/** Una feature leída: su fila y el texto completo del brief. */
export interface ReadFeature {
  readonly row: FeatureRow;
  readonly text: string;
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

/** Lo que hace falta para mover el estado de una feature. */
export interface AdvanceFeatureRequest {
  readonly root: string;
  readonly slug: string;
  readonly to: string;
  readonly now?: (() => Date) | undefined;
  /** Se ejecuta con el lock tomado, antes de escribir. Para lo que va junto. */
  readonly alongside?: (() => void) | undefined;
}

/**
 * Mueve el estado de una feature y actualiza `updated`.
 *
 * Se toma el lock del registro de features para toda la operación, igual que en
 * los tickets, y por la misma razón: dos comandos solapados —un hook y una
 * ejecución manual— dejarían un estado intermedio que nadie escribió.
 *
 * La transición se comprueba **antes** de tocar el disco, así que un movimiento
 * ilegal no deja el archivo a medio escribir. Y el texto nuevo se revalida antes
 * de guardarlo: si el reemplazo rompiera el frontmatter, el error sale aquí y no
 * en el siguiente comando que lea la feature.
 */
export function advanceFeature(request: AdvanceFeatureRequest): FeatureRow {
  const { root, slug, to } = request;
  const leida = readFeature(root, slug);
  if (leida === null) {
    fail(`No existe la feature "${slug}" en .valmen/features/.`);
  }
  if (leida.row.invalid !== null) {
    fail(`La feature "${slug}" no es válida: ${leida.row.invalid}`);
  }

  const camino = featureTransitionPath(leida.row.state, to);
  const date = today(request.now?.() ?? new Date());

  // Una sola escritura con el estado final. Recorrer los pasos intermedios
  // escribiendo cada uno dejaría el registro con estados por los que la feature
  // nunca estuvo, y un lector que mire a mitad vería algo que nadie pidió.
  let texto = reemplazarCampo(leida.text, "state", to);
  texto = reemplazarCampo(texto, "updated", date);

  const campos = parseFeatureFrontmatter(texto);
  validateFeatureFields({
    id: campos["id"] as string,
    title: campos["title"] as string,
    state: campos["state"] as string,
    created: campos["created"] as string,
    updated: campos["updated"] as string,
  });

  const lock = MutationLock.acquire(featuresDir(root));
  try {
    // Lo que tenga que ir en la misma sección crítica —el `tickets.yaml` de una
    // descomposición, por ejemplo— va aquí: escribirlo antes de tomar el lock
    // dejaría un grafo sin el estado que lo anuncia.
    request.alongside?.();
    atomicWrite(featurePath(root, slug), texto);
  } finally {
    lock.release();
  }

  return {
    ...leida.row,
    state: to,
    updated: date,
    // Para que quien llama pueda decir por dónde pasó, si pasó por algún lado.
    ...(camino.length > 1 ? { via: camino.slice(1, -1) } : {}),
  };
}

/**
 * El camino más corto entre dos estados, o falla si no hay ninguno.
 *
 * Existe porque la máquina prohíbe saltos, y con razón: `specified → decomposed`
 * se saltaría el diseño. Pero un comando que sabe que la descomposición implica
 * haber pasado por `planned` puede recorrer el tramo en nombre del usuario en vez
 * de obligarlo a dos comandos para escribir un estado intermedio del que no va a
 * hacer nada.
 *
 * Es una búsqueda en anchura sobre una máquina de ocho estados: el camino más
 * corto es también el que menos pasos inventa, y no hay nada que optimizar.
 */
export function featureTransitionPath(from: string, to: string): string[] {
  if (from === to) return [from];
  const visitados = new Set<string>([from]);
  const cola: string[][] = [[from]];

  while (cola.length > 0) {
    const camino = cola.shift() as string[];
    const ultimo = camino[camino.length - 1] as string;
    for (const siguiente of nextFeatureStates(ultimo)) {
      if (visitados.has(siguiente)) continue;
      const extendido = [...camino, siguiente];
      if (siguiente === to) return extendido;
      visitados.add(siguiente);
      cola.push(extendido);
    }
  }

  fail(`Transición de feature ${from} -> ${to} no permitida.`, EXIT_INVARIANT);
}
