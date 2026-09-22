/**
 * Referencias inmutables a un artefacto probado.
 *
 * Una evidencia o un ciclo de QA no se refieren a "lo que hay ahora": se
 * refieren a un commit concreto o al contenido exacto de unos archivos. Es la
 * diferencia entre poder afirmar "esto se probó" y poder demostrarlo.
 *
 * Dos formas, y las dos se validan por forma:
 *
 * - `commit:<sha40>` — un commit. Se comprueba la forma, no que exista: quien
 *   escribe la referencia ya lo sabe, y consultar git en cada validación haría
 *   que validar un registro dependiera del repositorio que lo contiene.
 * - `worktree:sha256:<sha256>` — un hash del **contenido** de los archivos
 *   funcionales que el ticket declara. Es lo que permite referirse a un estado
 *   de trabajo que todavía no es un commit.
 *
 * El hash se calcula sobre pares (longitud, bytes) en orden ordenado, con la
 * longitud en 8 bytes big-endian delante de cada parte. Ese encuadre existe para
 * que dos archivos no puedan producir el mismo flujo de bytes que otros dos
 * distintos: sin él, `ab` + `c` y `a` + `bc` darían el mismo hash.
 *
 * Transcrito de `ticket.py` L355-432. Verificado contra la referencia.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";

import {
  BUILD_REFERENCE_RE,
  type ParsedTicket,
  ensureSecurePath,
  fail,
  validateReference,
} from "@valmen/core";
import { EXIT_REFERENCE } from "@valmen/core";

/**
 * Pregunta a git si conoce una ruta del proyecto.
 *
 * La única pregunta que se le hace a git en este módulo es «¿está versionado?»,
 * así que no se captura su salida: interesa el código, no el texto. Se descarta
 * en lugar de guardarla para que un repositorio grande no llene la memoria con
 * listados que nadie va a leer.
 */
function isTracked(root: string, relativePath: string): boolean {
  const resultado = spawnSync("git", ["ls-files", "--error-unmatch", "--", relativePath], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return resultado.status === 0;
}

/**
 * Los archivos funcionales que un ticket declara como afectados.
 *
 * Solo estos entran en el hash: incluir el propio `ticket.md` haría que el hash
 * dependiera del ticket que lo contiene, y el hash existe para describir el
 * trabajo, no el registro. Incluir el historial de tickets tendría el mismo
 * problema un nivel más arriba.
 */
export function declaredFunctionalFiles(
  document: ParsedTicket,
  ticketPath: string,
  root: string,
): string[] {
  const declarados = new Set<string>();

  for (const punto of document.blocks.Puntos ?? []) {
    const archivos = punto.affected_files;
    if (!Array.isArray(archivos)) {
      fail("affected_files solo admite rutas relativas.", EXIT_REFERENCE);
    }
    for (const crudo of archivos) {
      if (typeof crudo !== "string") {
        fail("affected_files solo admite rutas relativas.", EXIT_REFERENCE);
      }
      const partes = crudo.split("/");
      if (
        isAbsolute(crudo) ||
        crudo === "" ||
        partes.includes("..") ||
        partes.includes(".") ||
        partes.includes(".git") ||
        crudo.includes("\\")
      ) {
        fail("affected_files contiene una ruta no canónica.", EXIT_REFERENCE);
      }
      if (join(root, ...partes) === ticketPath) {
        fail(
          "affected_files no puede incluir ticket.md; el hash solo cubre archivos funcionales.",
          EXIT_REFERENCE,
        );
      }
      if (partes[0] === "docs" && partes[1] === "tickets") {
        fail("affected_files no puede incluir el historial de tickets.", EXIT_REFERENCE);
      }
      declarados.add(partes.join("/"));
    }
  }

  return [...declarados].sort();
}

/**
 * El hash del contenido de los archivos declarados.
 *
 * Devuelve `worktree:sha256:<64 hex>`. Falla con código 5 —referencia— si algún
 * archivo declarado no existe, no es un archivo regular o no está versionado:
 * un hash sobre archivos que git no conoce describiría un estado que nadie puede
 * reproducir.
 */
export function calculateWorktreeReference(
  document: ParsedTicket,
  ticketPath: string,
  root: string,
): string {
  const archivos = declaredFunctionalFiles(document, ticketPath, root);
  if (archivos.length === 0) {
    fail("No hay archivos funcionales declarados para calcular el hash.", EXIT_REFERENCE);
  }

  const hash = createHash("sha256");
  for (const relativa of archivos) {
    const absoluta = join(root, ...relativa.split("/"));
    ensureSecurePath(root, absoluta);

    let contenido: Buffer;
    try {
      contenido = readFileSync(absoluta);
    } catch {
      fail("Un archivo funcional declarado no existe o no es regular.", EXIT_REFERENCE);
    }

    // `ls-files --error-unmatch` pregunta exactamente una cosa: si git conoce
    // esta ruta. Un archivo sin versionar no forma parte de ningún estado
    // reproducible.
    if (!isTracked(root, relativa)) {
      fail("Un archivo funcional declarado no está versionado.", EXIT_REFERENCE);
    }

    const ruta = Buffer.from(relativa, "utf8");
    const largoRuta = Buffer.alloc(8);
    largoRuta.writeBigUInt64BE(BigInt(ruta.length));
    const largoContenido = Buffer.alloc(8);
    largoContenido.writeBigUInt64BE(BigInt(contenido.length));

    hash.update(largoRuta);
    hash.update(ruta);
    hash.update(largoContenido);
    hash.update(contenido);
  }

  return `worktree:sha256:${hash.digest("hex")}`;
}

/**
 * Resuelve el valor de una bandera de referencia.
 *
 * La cadena literal `worktree` es la única que se expande. Cualquier otra cosa
 * se valida por forma y se devuelve tal cual, incluido `null`: la ausencia de
 * referencia es un valor legítimo, no un error.
 */
export function resolveReference(
  value: string | null | undefined,
  document: ParsedTicket,
  ticketPath: string,
  root: string,
  label: string,
): string | null {
  if (value === null || value === undefined) return null;
  if (value === "worktree") {
    return calculateWorktreeReference(document, ticketPath, root);
  }
  validateReference(value, label);
  if (!BUILD_REFERENCE_RE.test(value)) {
    // `validateReference` ya habría fallado; esto deja el tipo estrecho sin un
    // `as` que mentiría si la expresión regular cambiara.
    fail(
      `${label} debe ser commit:<sha40> o worktree:sha256:<sha256> en minúsculas.`,
      EXIT_REFERENCE,
    );
  }
  return value;
}

/** La ruta de un ticket relativa a la raíz, con separadores POSIX. */
export function relativeTicketPath(root: string, ticketPath: string): string {
  return relative(root, ticketPath).split(sep).join("/");
}
