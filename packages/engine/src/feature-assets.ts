/**
 * Adjuntos de una feature: lo que nace al crearla y los agentes tienen que poder leer.
 *
 * Un diseño aprobado en un artefacto privado deja en la feature solo un enlace, y
 * un enlace no es evidencia: el agente que implementa no lo puede abrir y construye
 * desde el texto de la spec. Los adjuntos viven en el repositorio, en
 * `.valmen/features/<slug>/assets/`, con un `manifest.json` que dice qué es cada
 * archivo, de dónde salió y su huella.
 *
 * Tres decisiones que se repiten en todo el módulo:
 *
 * 1. **Los bytes los mueve el sistema de archivos, no un modelo.** La copia se
 *    verifica leyendo el destino y comparando el sha256 con el del origen.
 * 2. **El manifiesto solo recibe entradas.** Un adjunto no se reemplaza ni se borra
 *    por este camino: un nombre repetido con otro contenido falla.
 * 3. **No se descarga nada.** `core` no toca la red y un enlace privado no se
 *    puede leer; el archivo lo trae quien lo tiene y `origin_url` solo registra de
 *    dónde salió.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { basename, extname, join } from "node:path";

import {
  EXIT_HISTORY,
  EXIT_INVARIANT,
  EXIT_SCHEMA,
  MutationLock,
  assertWriteAllowed,
  atomicWrite,
  fail,
  today,
} from "@valmen/core";

import { featuresDir, readFeature } from "./features.js";

/** Un adjunto anotado en el manifiesto. */
export interface FeatureAsset {
  /** Ruta relativa a la carpeta de la feature, como `assets/pantalla.html`. */
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly kind: string;
  readonly description: string;
  /** El enlace del que salió, o `null` si nació como archivo. */
  readonly originUrl: string | null;
  readonly added: string;
}

const NOMBRE_VALIDO = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const TIPOS: Readonly<Record<string, string>> = {
  ".png": "imagen",
  ".jpg": "imagen",
  ".jpeg": "imagen",
  ".gif": "imagen",
  ".webp": "imagen",
  ".svg": "imagen",
  ".html": "prototipo",
  ".htm": "prototipo",
  ".pdf": "documento",
  ".md": "documento",
  ".txt": "documento",
  ".docx": "documento",
  ".xlsx": "hoja",
  ".csv": "hoja",
  ".json": "datos",
};

/** La carpeta de adjuntos de una feature. */
export function featureAssetsDir(root: string, slug: string): string {
  return join(featuresDir(root), slug, "assets");
}

/** La ruta del manifiesto de adjuntos. */
export function assetManifestPath(root: string, slug: string): string {
  return join(featureAssetsDir(root, slug), "manifest.json");
}

function sha256De(contenido: Buffer): string {
  return createHash("sha256").update(contenido).digest("hex");
}

/**
 * Lee los adjuntos anotados. Sin manifiesto, la feature no tiene adjuntos: no es
 * un error. Un manifiesto ilegible sí lo es, porque ignorarlo dejaría a los agentes
 * sin las referencias sin avisar a nadie.
 */
export function listFeatureAssets(root: string, slug: string): FeatureAsset[] {
  const ruta = assetManifestPath(root, slug);
  if (!existsSync(ruta)) return [];
  let crudo: unknown;
  try {
    crudo = JSON.parse(readFileSync(ruta, "utf8"));
  } catch {
    fail(`El manifiesto de adjuntos de ${slug} no es un JSON legible: ${ruta}.`, EXIT_SCHEMA);
  }
  const lista = (crudo as { assets?: unknown } | null)?.assets;
  if (!Array.isArray(lista)) {
    fail(`El manifiesto de adjuntos de ${slug} no tiene la lista «assets».`, EXIT_SCHEMA);
  }
  return lista.map((entrada: Record<string, unknown>) => ({
    path: String(entrada["path"]),
    sha256: String(entrada["sha256"]),
    bytes: Number(entrada["bytes"]),
    kind: String(entrada["kind"]),
    description: String(entrada["description"]),
    originUrl: entrada["origin_url"] === null ? null : String(entrada["origin_url"]),
    added: String(entrada["added"]),
  }));
}

function serializar(assets: readonly FeatureAsset[]): string {
  return (
    JSON.stringify(
      {
        schema: 1,
        assets: assets.map((a) => ({
          path: a.path,
          sha256: a.sha256,
          bytes: a.bytes,
          kind: a.kind,
          description: a.description,
          origin_url: a.originUrl,
          added: a.added,
        })),
      },
      null,
      2,
    ) + "\n"
  );
}

/** Lo que hace falta para anexar un archivo a una feature. */
export interface AttachFeatureAssetRequest {
  readonly root: string;
  readonly slug: string;
  /** El archivo local que se copia. */
  readonly source: string;
  /** El nombre dentro de `assets/`; por defecto, el del archivo de origen. */
  readonly name?: string | undefined;
  readonly description: string;
  readonly originUrl?: string | undefined;
  readonly now?: (() => Date) | undefined;
}

export interface AttachedAsset {
  readonly asset: FeatureAsset;
  /** `true` si ya estaba con el mismo contenido y no se escribió nada. */
  readonly alreadyPresent: boolean;
}

/**
 * Copia un archivo a la feature y lo anota en el manifiesto.
 *
 * Repetir el mismo archivo con el mismo nombre es un no-op: se puede correr dos
 * veces sin miedo. El mismo nombre con otro contenido falla sin tocar nada.
 */
export function attachFeatureAsset(request: AttachFeatureAssetRequest): AttachedAsset {
  assertWriteAllowed("anexar un adjunto a una feature");
  const { root, slug } = request;

  const leida = readFeature(root, slug);
  if (leida === null) fail(`No existe la feature "${slug}" en .valmen/features/.`);
  if (leida.row.invalid !== null) {
    fail(`La feature "${slug}" no es válida: ${leida.row.invalid}`);
  }

  const descripcion = request.description.trim();
  if (descripcion === "") {
    fail("Un adjunto necesita una descripción: qué es y para qué lo usa el agente.", EXIT_SCHEMA);
  }

  let datos;
  try {
    datos = statSync(request.source);
  } catch {
    fail(
      `No existe el archivo ${request.source}. Un enlace no se anexa: hay que traer una ` +
        "copia local (exportar el prototipo o guardar las capturas) y anexar el archivo.",
      EXIT_SCHEMA,
    );
  }
  if (!datos.isFile()) fail(`${request.source} no es un archivo.`, EXIT_SCHEMA);

  const nombre = request.name ?? basename(request.source);
  if (!NOMBRE_VALIDO.test(nombre) || nombre === "manifest.json") {
    fail(
      `El nombre «${nombre}» no sirve para un adjunto: letras, números, punto, guion y ` +
        "guion bajo, sin carpetas, y distinto de manifest.json.",
      EXIT_SCHEMA,
    );
  }
  const origen = request.originUrl?.trim();
  if (origen !== undefined && !/^https?:\/\/\S+$/.test(origen)) {
    fail("origin-url debe ser un enlace http o https.", EXIT_SCHEMA);
  }

  const contenido = readFileSync(request.source);
  const huella = sha256De(contenido);
  const ruta = `assets/${nombre}`;
  const destino = join(featureAssetsDir(root, slug), nombre);

  const lock = MutationLock.acquire(featuresDir(root));
  try {
    const actuales = listFeatureAssets(root, slug);
    const previo = actuales.find((a) => a.path === ruta);
    if (previo !== undefined) {
      if (previo.sha256 === huella) return { asset: previo, alreadyPresent: true };
      fail(
        `Ya existe ${ruta} en ${slug} con otro contenido (sha256 ${previo.sha256.slice(0, 12)}…). ` +
          "Un adjunto no se reemplaza: usá otro nombre.",
        EXIT_HISTORY,
      );
    }
    if (existsSync(destino)) {
      fail(
        `${ruta} existe en disco pero no está en el manifiesto: no se pisa. Revisá la carpeta.`,
        EXIT_HISTORY,
      );
    }

    mkdirSync(featureAssetsDir(root, slug), { recursive: true });
    copyFileSync(request.source, destino);
    // La copia se verifica: un destino con otra huella es una copia corrupta y se
    // dice, en vez de anotarla en el manifiesto como buena.
    if (sha256De(readFileSync(destino)) !== huella) {
      fail(`La copia de ${nombre} no coincide con el original: se interrumpe.`, EXIT_INVARIANT);
    }

    const asset: FeatureAsset = {
      path: ruta,
      sha256: huella,
      bytes: contenido.length,
      kind: TIPOS[extname(nombre).toLowerCase()] ?? "otro",
      description: descripcion,
      originUrl: origen ?? null,
      added: today(request.now?.() ?? new Date()),
    };
    atomicWrite(assetManifestPath(root, slug), serializar([...actuales, asset]));
    return { asset, alreadyPresent: false };
  } finally {
    lock.release();
  }
}

/** Los archivos de texto de la feature donde puede aparecer un enlace de diseño. */
function textosDeLaFeature(root: string, slug: string): { ruta: string; texto: string }[] {
  const base = join(featuresDir(root), slug);
  const candidatos = [join(base, "feature.md"), join(base, "design.md")];
  const specDir = join(base, "spec");
  if (existsSync(specDir)) {
    for (const dominio of readdirSync(specDir)) {
      candidatos.push(join(specDir, dominio, "spec.md"));
    }
  }
  return candidatos
    .filter((ruta) => existsSync(ruta))
    .map((ruta) => ({
      ruta: `.valmen/features/${slug}/${ruta.slice(base.length + 1)}`,
      texto: readFileSync(ruta, "utf8"),
    }));
}

/**
 * Avisos por cada enlace externo de la feature que no tiene copia local.
 *
 * Un enlace está cubierto cuando algún adjunto lo declara como `origin_url`. El
 * aviso no bloquea: hay enlaces que son simple bibliografía; lo que se señala es
 * que, si el enlace era el diseño, los agentes no lo pueden abrir.
 */
export function externalLinkWarnings(root: string, slug: string): string[] {
  const cubiertos = listFeatureAssets(root, slug)
    .map((a) => a.originUrl)
    .filter((u): u is string => u !== null);
  const avisos: string[] = [];
  for (const { ruta, texto } of textosDeLaFeature(root, slug)) {
    const lineas = texto.split("\n");
    lineas.forEach((linea, indice) => {
      for (const hallado of linea.match(/https?:\/\/[^\s)>\]"'`]+/g) ?? []) {
        const enlace = hallado.replace(/[.,;:]+$/, "");
        if (cubiertos.some((c) => c === enlace || enlace.startsWith(c))) continue;
        avisos.push(
          `${ruta}:${indice + 1}: enlace externo sin copia local (${enlace}). Los agentes ` +
            `no lo pueden abrir: anexá el archivo con «valmen feature asset add ${slug} ` +
            `--file <ruta> --origin-url ${enlace}».`,
        );
      }
    });
  }
  return avisos;
}

/**
 * Los adjuntos que citan los requisitos de un ticket.
 *
 * Una spec cita un adjunto escribiendo su ruta (`assets/pantalla.html`) en
 * cualquier parte del archivo del dominio. Si ningún archivo de los requisitos
 * cubiertos cita alguno, el ticket recibe todos: sobrar referencias es mejor que
 * dejar al agente construyendo desde el texto.
 */
export function assetsForRequirements(
  root: string,
  assets: readonly FeatureAsset[],
  sources: readonly string[],
): { assets: FeatureAsset[]; cited: boolean } {
  if (assets.length === 0) return { assets: [], cited: false };
  const textos = [...new Set(sources)].map((fuente) => {
    try {
      return readFileSync(join(root, fuente), "utf8");
    } catch {
      return "";
    }
  });
  const citados = assets.filter((a) => textos.some((t) => t.includes(a.path)));
  return citados.length > 0
    ? { assets: citados, cited: true }
    : { assets: [...assets], cited: false };
}
