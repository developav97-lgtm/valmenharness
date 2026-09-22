/**
 * `release-publish`: registra la publicación de una release.
 *
 * Es el único comando que **verifica el repositorio** antes de escribir, y el
 * único que mueve dos estados de golpe. Las dos cosas tienen la misma razón: una
 * release es el punto en que el trabajo sale del repositorio, y registrarlo mal
 * deja un historial que afirma algo falso sobre lo que se publicó.
 *
 * Lo que exige, en orden:
 *
 * 1. La versión, SemVer sin prefijo `v`.
 * 2. Una lista **explícita** de tickets, sin duplicados. Nunca se infieren: un
 *    ticket publicado por error es un ticket que nadie puede volver a publicar.
 * 3. Que el tag `v<versión>` exista y sea **anotado** —no ligero—, y que apunte
 *    exactamente al tip de `production`, no a un ancestro.
 * 4. Que cada ticket esté cerrado, sin publicar, y que su sección
 *    `## Implementación` mencione un commit que sea ancestro del tag. Es lo que
 *    ata el ticket al artefacto que se publicó.
 *
 * Si algo falla, **no se escribe ningún ticket**: la comprobación de todo el
 * conjunto corre antes de la primera escritura.
 *
 * Lo que **no** hace, a propósito: no crea tags, no hace push, no despliega y no
 * comprueba que el árbol esté limpio. El harness registra lo que ya pasó; no
 * publica nada por su cuenta. Ver `docs/agentic/rules/delivery.md` del proyecto
 * que se migra.
 *
 * Transcrito de `ticket.py` L1536-1644. Verificado contra la referencia.
 */
import { spawnSync } from "node:child_process";

import {
  type JsonObject,
  type ParsedTicket,
  EXIT_INVARIANT,
  EXIT_REFERENCE,
  EXIT_SCHEMA,
  MutationLock,
  SEMVER_RE,
  atomicWrite,
  fail,
  newEvent,
  parseTicket,
  replaceBlock,
  replaceFrontmatterField,
  today,
  validateDocument,
  validateText,
} from "@valmen/core";

import { type RegistryPaths, findTicket } from "./discovery.js";
import { allDocuments, refreshIndex } from "./mutate.js";

/** Ejecuta git y devuelve su salida, o falla con el código de referencia. */
function git(root: string, args: readonly string[]): string {
  const resultado = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (resultado.status !== 0) {
    fail("No se pudo verificar la referencia Git local de la release.", EXIT_REFERENCE);
  }
  return (resultado.stdout ?? "").trim();
}

/** El commit al que apunta un tag anotado, o falla explicando qué falta. */
export function releaseTagCommit(root: string, version: string): string {
  const referencia = `refs/tags/v${version}`;

  // Un tag ligero y un tag anotado se comportan igual para casi todo, y no para
  // esto: el anotado lleva fecha, autor y mensaje, y es el que deja constancia
  // de quién publicó. Un `cat-file -t` que devuelve `commit` significa que el tag
  // apunta directo al commit, es decir, que es ligero.
  const tipo = git(root, ["cat-file", "-t", referencia]);
  if (tipo !== "tag") {
    fail(`v${version} debe ser un tag anotado.`, EXIT_REFERENCE);
  }
  return git(root, ["rev-parse", "--verify", `${referencia}^{commit}`]);
}

/** El commit del tip de producción. */
export function productionCommit(root: string): string {
  for (const referencia of [
    "refs/remotes/origin/production^{commit}",
    "refs/heads/production^{commit}",
  ]) {
    const resultado = spawnSync("git", ["rev-parse", "--verify", referencia], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (resultado.status === 0) return (resultado.stdout ?? "").trim();
  }
  fail(
    "No existe una referencia local de production para verificar la release.",
    EXIT_REFERENCE,
  );
}

/**
 * Comprueba que algún commit de la implementación pertenece a la release.
 *
 * Los SHA se buscan en la sección `## Implementación`, que es donde el flujo del
 * proyecto los deja. Un SHA que no existe se descarta en silencio: la sección es
 * prosa y puede mencionar hashes de ejemplo o de otro repositorio.
 */
function belongsToRelease(
  root: string,
  document: ParsedTicket,
  releaseCommit: string,
): boolean {
  const seccion = document.sections.Implementación ?? "";
  const candidatos = seccion.match(/(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/g) ?? [];

  for (const sha of candidatos) {
    const existe = spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (existe.status !== 0) continue;

    const ancestro = spawnSync("git", ["merge-base", "--is-ancestor", sha, releaseCommit], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (ancestro.status === 0) return true;
  }
  return false;
}

/** La lista de identificadores de `--tickets`. */
export function releaseTicketIds(value: string | undefined): string[] {
  if (value === undefined) {
    fail("--tickets requiere al menos un ID explícito.", EXIT_SCHEMA);
  }
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
  if (ids.length === 0) {
    fail("--tickets requiere al menos un ID explícito.", EXIT_SCHEMA);
  }

  const vistos = new Set<string>();
  const duplicados: string[] = [];
  for (const id of ids) {
    if (vistos.has(id)) duplicados.push(id);
    vistos.add(id);
  }
  if (duplicados.length > 0) {
    fail(`--tickets contiene IDs duplicados: ${duplicados.join(", ")}`, EXIT_SCHEMA);
  }
  return ids;
}

/** Lo que pide una publicación. */
export interface ReleasePublishRequest {
  readonly paths: RegistryPaths;
  readonly version: string;
  readonly tickets: string;
  readonly now?: (() => Date) | undefined;
}

/** Publica una release y devuelve la línea que lo informa. */
export function releasePublish(request: ReleasePublishRequest): string {
  const { paths } = request;
  const version = validateText(request.version, "version");
  if (!SEMVER_RE.test(version)) {
    fail("--version debe usar SemVer MAJOR.MINOR.PATCH sin prefijo v.", EXIT_SCHEMA);
  }
  const identifiers = releaseTicketIds(request.tickets);
  const date = today(request.now?.() ?? new Date());

  return MutationLock.run(paths.root, () => {
    const releaseCommit = releaseTagCommit(paths.root, version);
    const produccion = productionCommit(paths.root);
    if (releaseCommit !== produccion) {
      fail("El tag de release no apunta al commit actual de production.", EXIT_REFERENCE);
    }

    // Se cargan y validan **todos** los tickets antes de comprobar nada más: el
    // estado del registro es una precondición, no un detalle.
    const documentos = identifiers.map((id) => {
      const located = findTicket(paths, id);
      if (located === undefined) {
        fail("La ruta canónica solicitada no existe.", EXIT_SCHEMA);
      }
      const document = parseTicket(located.text);
      validateDocument(document, { expectedId: id });
      return { id, located, document };
    });

    for (const { id, document } of documentos) {
      if (document.fields.workflow_status !== "closed") {
        fail(`${id} debe estar cerrado para publicarse.`, EXIT_INVARIANT);
      }
      if (document.fields.release_status !== "unreleased") {
        fail(`${id} debe tener release_status unreleased.`, EXIT_INVARIANT);
      }
      if (!belongsToRelease(paths.root, document, releaseCommit)) {
        fail(
          `${id} no tiene un SHA de implementación que pertenezca al tag v${version}.`,
          EXIT_REFERENCE,
        );
      }
    }

    // Nada se ha escrito todavía, y a partir de aquí tampoco puede fallar por una
    // precondición: lo que queda es calcular el texto y revalidarlo.
    allDocuments(paths);

    const textos = documentos.map(({ id, document }) => {
      // Dos eventos y no uno: el registro de la referencia anota las dos
      // transiciones que la publicación implica, aunque el estado `planned`
      // nunca se haya escrito en el frontmatter.
      const eventos = [...(document.blocks.Eventos ?? [])] as JsonObject[];
      eventos.push(
        newEvent(
          eventos,
          "release-transition",
          "Release: unreleased -> planned.",
          "cli",
          date,
        ),
      );
      eventos.push(
        newEvent(
          eventos,
          "release-transition",
          "Release: planned -> released.",
          "cli",
          date,
        ),
      );

      let texto = replaceBlock(document.text, "Eventos", eventos);
      texto = replaceFrontmatterField(texto, "target_release", version);
      texto = replaceFrontmatterField(texto, "released_in", version);
      texto = replaceFrontmatterField(texto, "release_status", "released");
      texto = replaceFrontmatterField(texto, "updated", date);

      const nuevo = parseTicket(texto);
      validateDocument(nuevo, { expectedId: id });
      return { id, texto };
    });

    for (const [indice, { texto }] of textos.entries()) {
      atomicWrite(documentos[indice]!.located.absolutePath, texto);
    }
    refreshIndex(paths);

    return `Tickets publicados en v${version}: ${identifiers.join(", ")}`;
  });
}
