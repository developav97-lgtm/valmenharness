/**
 * El manifiesto de entrega de una release.
 *
 * Reemplaza a `release_notes.py` de SaiOpenCloud **sin copiarlo**. Ese script
 * produce un JSON con la forma exacta que carga el menú principal de su frontend:
 *
 * ```json
 * { "version": "…", "releasedAt": "…", "title": "…",
 *   "changes": [ { "type": "…", "module": "…", "title": "…", "description": "…" } ] }
 * ```
 *
 * Eso es **presentación de un cliente**. Otro proyecto entregará otra cosa —un
 * changelog, una nota en un wiki, un paquete—, así que meter esa ruta en el
 * harness lo ataría a uno. La forma acordada son dos capas:
 *
 * - **El harness produce el manifiesto**: qué versión, cuándo, qué tickets, y por
 *   cada uno el resumen funcional de su último cierre. Es dato, y sirve a
 *   cualquier proyecto.
 * - **El proyecto declara el proceso** que consume ese manifiesto y escribe su
 *   artefacto. En SaiOpenCloud, un paso que lo lee y produce su JSON.
 *
 * Por eso el manifiesto es **un archivo por versión**, en `.valmen/deliveries/`, y
 * no se sobrescribe: un artefacto de entrega es inmutable igual que una release
 * publicada. Si ya existe, se falla; si el proyecto necesita corregirlo, que lo
 * haga a conciencia y no por accidente.
 *
 * Las comprobaciones por ticket son las mismas que hacía `release_notes.py`, y por
 * la misma razón: un ticket que no está cerrado, que no es visible al usuario o
 * que ya se publicó no pertenece a una entrega nueva. La diferencia es que aquí
 * el error dice **cuál de las tres** cosas falla.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  type ParsedTicket,
  EXIT_HISTORY,
  EXIT_INVARIANT,
  EXIT_SCHEMA,
  SEMVER_RE,
  atomicWrite,
  fail,
} from "@valmen/core";

import { type RegistryPaths, findTicket } from "./discovery.js";
import { readAndValidate } from "./mutate.js";

/** Un cambio de la entrega, en términos de quien lo lee. */
export interface DeliveryChange {
  readonly ticket: string;
  readonly type: string;
  readonly module: string;
  readonly title: string;
  /** El `functional_summary` del último cierre. Nunca vacío. */
  readonly description: string;
  /** El rol afectado, si la descripción funcional lo declara. */
  readonly audience: string | null;
}

/** El manifiesto completo. */
export interface DeliveryManifest {
  readonly version: string;
  readonly releasedAt: string;
  readonly changes: readonly DeliveryChange[];
}

/** Dónde vive el manifiesto de una versión. */
export function deliveryPath(root: string, version: string): string {
  return join(root, ".valmen", "deliveries", `${version}.json`);
}

/** Comprueba el SemVer sin prefijo `v`, como la referencia. */
export function assertSemver(version: string): string {
  if (!SEMVER_RE.test(version)) {
    fail("--version debe usar SemVer MAJOR.MINOR.PATCH sin prefijo v.", EXIT_SCHEMA);
  }
  return version;
}

/** Una fecha `YYYY-MM-DD` real del calendario. */
export function assertReleaseDate(valor: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    fail("--released-at debe usar YYYY-MM-DD.", EXIT_SCHEMA);
  }
  const [anio, mes, dia] = valor
    .split("-")
    .map((parte) => Number.parseInt(parte as string, 10));
  const fecha = new Date(Date.UTC(anio as number, (mes as number) - 1, dia as number));
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== (mes as number) - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    fail(`--released-at no es una fecha del calendario: ${valor}.`, EXIT_SCHEMA);
  }
  return valor;
}

/** El resumen funcional del último cierre, o falla diciendo por qué no hay. */
function lastClosure(document: ParsedTicket): string {
  const cierres = document.blocks.Cierre;
  const ultimo = cierres[cierres.length - 1];
  if (ultimo === undefined) {
    fail(
      `${document.fields.id} no tiene un cierre registrado, así que no hay nada ` +
        "que contar en la entrega.",
      EXIT_INVARIANT,
    );
  }
  const resumen = ultimo["functional_summary"];
  if (typeof resumen !== "string" || resumen.trim() === "") {
    fail(
      `${document.fields.id} no tiene \`functional_summary\` en su último cierre.`,
      EXIT_INVARIANT,
    );
  }
  return resumen.trim();
}

/** El rol afectado, si la descripción funcional lo declara. */
function audienceOf(document: ParsedTicket): string | null {
  const seccion = document.sections["Descripción funcional"] ?? "";
  const match = /^-\s+Usuario o rol afectado:\s*(.+)$/m.exec(seccion);
  const valor = match?.[1]?.trim();
  return valor === undefined || valor === "" || valor.startsWith("<!--") ? null : valor;
}

/**
 * Un cambio de la entrega.
 *
 * Las tres condiciones se comprueban aquí y no en `release-publish` porque son
 * distintas: publicar mueve el estado en el registro y exige la verificación de
 * git; entregar **describe** lo que se entrega. Un ticket ya publicado no puede
 * entrar en una entrega nueva, y uno no visible al usuario no tiene nada que
 * contar a quien lee las novedades.
 */
function toChange(paths: RegistryPaths, ticketId: string): DeliveryChange {
  const localizado = findTicket(paths, ticketId);
  if (localizado === undefined) {
    fail(
      `No existe un ticket canónico único para ${ticketId} en este registro.`,
      EXIT_HISTORY,
    );
  }
  const document = readAndValidate(paths, localizado);

  if (document.fields.workflow_status !== "closed") {
    fail(
      `${ticketId} está en ${document.fields.workflow_status} y una entrega exige ` +
        "`closed`: lo que no se terminó no se anuncia.",
      EXIT_INVARIANT,
    );
  }
  if (document.fields.user_visible !== "true") {
    fail(
      `${ticketId} declara \`user_visible: false\` y una entrega cuenta lo que el ` +
        "usuario nota.",
      EXIT_INVARIANT,
    );
  }
  if (document.fields.release_status !== "unreleased") {
    fail(
      `${ticketId} ya está en release_status: ${document.fields.release_status}. ` +
        "Un ticket publicado pertenece a la entrega en la que salió, no a esta.",
      EXIT_INVARIANT,
    );
  }

  return {
    ticket: ticketId,
    type: document.fields.type,
    module: document.fields.module,
    title: document.fields.title,
    description: lastClosure(document),
    audience: audienceOf(document),
  };
}

/** Una lista de identificadores explícita, sin duplicados y con forma. */
export function parseTicketList(valor: string): string[] {
  const ids = valor
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

  if (ids.length === 0) {
    fail("--tickets requiere al menos un ID explícito.", EXIT_SCHEMA);
  }
  const repetidos = [
    ...new Set(ids.filter((id) => ids.indexOf(id) !== ids.lastIndexOf(id))),
  ];
  if (repetidos.length > 0) {
    fail(
      `La lista de tickets contiene ID duplicado: ${repetidos.join(", ")}.`,
      EXIT_SCHEMA,
    );
  }
  for (const id of ids) {
    if (!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+-\d{8}$/.test(id)) {
      fail(`El ID de ticket no tiene un formato permitido: ${id}.`, EXIT_SCHEMA);
    }
  }
  return ids;
}

/** Lo que hace falta para construir el manifiesto. */
export interface ManifestRequest {
  readonly paths: RegistryPaths;
  readonly version: string;
  readonly tickets: readonly string[];
  readonly releasedAt: string;
  /** Escribe el archivo. `false` lo devuelve sin tocar el disco. */
  readonly write?: boolean;
}

/** El manifiesto, y dónde quedó. */
export interface ManifestResult {
  readonly manifest: DeliveryManifest;
  readonly json: string;
  readonly path: string;
  readonly written: boolean;
}

/**
 * Construye el manifiesto de una entrega.
 *
 * Se comprueban **todos** los tickets antes de escribir el archivo: una entrega
 * a medias es peor que ninguna, porque el proceso que la consume no sabría que
 * faltan datos.
 */
export function buildManifest(request: ManifestRequest): ManifestResult {
  const { paths, releasedAt } = request;
  const version = assertSemver(request.version);
  const fecha = assertReleaseDate(releasedAt);
  const escribir = request.write ?? true;

  const cambios = request.tickets.map((id) => toChange(paths, id));
  const manifest: DeliveryManifest = {
    version,
    releasedAt: fecha,
    changes: cambios,
  };

  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  const ruta = deliveryPath(paths.root, version);
  const relativa = `.valmen/deliveries/${version}.json`;

  if (escribir) {
    // No se sobrescribe: un manifiesto de entrega es inmutable, como la release
    // que describe. Si existe, alguien ya lo generó, y pisarlo en silencio
    // cambiaría lo que ese artefacto dice de una versión que ya salió.
    const existente = existsSync(ruta);
    if (existente) {
      fail(
        `El manifiesto de la versión ${version} ya existe en ${relativa} y no se ` +
          "sobrescribe.",
        EXIT_HISTORY,
      );
    }
    mkdirSync(dirname(ruta), { recursive: true });
    atomicWrite(ruta, json);
  }

  return { manifest, json, path: relativa, written: escribir };
}

/** El resumen del manifiesto, para imprimirlo tras generarlo. */
export function renderManifest(result: ManifestResult): string {
  const { manifest } = result;
  const lineas = [
    `Entrega ${manifest.version} — ${manifest.releasedAt}: ${manifest.changes.length} cambio(s).`,
    ...manifest.changes.map(
      (cambio) => `  ${cambio.type} · ${cambio.module} — ${cambio.title}`,
    ),
    result.written
      ? `Escrito en ${result.path}.`
      : `Sin escribir (--dry-run). Habría quedado en ${result.path}.`,
  ];
  return lineas.join("\n") + "\n";
}
