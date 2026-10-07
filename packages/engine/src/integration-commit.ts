/**
 * El commit por ticket de la jornada (R-JORN-009, mitad de integración).
 *
 * Cada ticket que termina su ejecución queda en su **propio commit**, en la rama de trabajo, solo
 * con lo que le es atribuible y con el árbol que se probó. Las reglas (`reglasDeIntegracion`) y la
 * lista cerrada de operaciones de git (`ejecutarGitPermitido`) vienen del módulo de reglas: aquí
 * se las usa. Nada de este camino publica: no hay push, `--force` ni tags, y el commit de un
 * ticket no incluye los archivos de otro.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { EXIT_INVARIANT, fail } from "@valmen/core";

import { type EjecutorDeGit, ejecutarGitPermitido, reglasDeIntegracion } from "./integration-rules.js";
import { type RegistryPaths } from "./discovery.js";
import { scanPendingChanges } from "./secrets.js";

/** El estado del propio harness que cambia al despachar: no es del ticket y no se commitea. */
const ESTADO_DEL_HARNESS = [
  ".valmen/journeys/",
  ".valmen/executions/",
  ".valmen/approvals.jsonl",
  ".valmen/autonomous-stops.jsonl",
  ".valmen/gates/approvals.json",
  ".valmen/processes/runs/",
];

const esDelHarness = (ruta: string): boolean => ESTADO_DEL_HARNESS.some((p) => ruta === p || ruta.startsWith(p));

/** ¿Es este proyecto un repositorio git? */
export function esRepositorioGit(root: string): boolean {
  return existsSync(join(root, ".git"));
}

/** Los archivos cambiados del árbol de trabajo, sin el estado del harness. */
export function estadoDelArbolDeTrabajo(root: string, ejecutor?: EjecutorDeGit): string[] {
  const salida = ejecutarGitPermitido(root, ["status", "--porcelain", "-uall"], ejecutor);
  if (salida.status !== 0) fail(`git status falló: ${salida.stderr.trim()}`, EXIT_INVARIANT);
  return salida.stdout
    .split("\n")
    .filter((linea) => linea.trim() !== "")
    .map((linea) => linea.slice(3).trim())
    .map((ruta) => (ruta.includes(" -> ") ? (ruta.split(" -> ")[1] as string) : ruta))
    .map((ruta) => ruta.replace(/^"|"$/g, ""))
    .filter((ruta) => !esDelHarness(ruta))
    .sort();
}

/** La rama en la que está el árbol. */
export function ramaActual(root: string, ejecutor?: EjecutorDeGit): string {
  const salida = ejecutarGitPermitido(root, ["rev-parse", "--abbrev-ref", "HEAD"], ejecutor);
  if (salida.status !== 0) fail(`git rev-parse falló: ${salida.stderr.trim()}`, EXIT_INVARIANT);
  return salida.stdout.trim();
}

/** El hash del contenido de los archivos, con el mismo encuadre que la evidencia de QA. */
function encuadrar(archivos: readonly string[], leer: (ruta: string) => Buffer | null): string | null {
  const hash = createHash("sha256");
  for (const relativa of [...archivos].sort()) {
    const contenido = leer(relativa);
    if (contenido === null) return null;
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
  return hash.digest("hex");
}

/** El hash del contenido que hay hoy en disco; un archivo que no existe cuenta como contenido vacío. */
export function hashDeArchivos(root: string, archivos: readonly string[]): string {
  return (
    encuadrar(archivos, (ruta) => {
      try {
        return readFileSync(join(root, ...ruta.split("/")));
      } catch {
        return Buffer.alloc(0);
      }
    }) ?? ""
  );
}

/**
 * El hash del contenido que quedó en un commit; `null` si algún archivo no está en él.
 *
 * Lee los blobs con `git show`, que es de solo lectura: no pasa por la lista cerrada de
 * operaciones porque esa lista existe para lo que sí puede escribir o publicar.
 */
export function hashDeArchivosEnCommit(root: string, commit: string, archivos: readonly string[]): string | null {
  return encuadrar(archivos, (ruta) => {
    const r = spawnSync("git", ["show", `${commit}:${ruta}`], { cwd: root, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
    return r.status === 0 ? Buffer.from(r.stdout) : null;
  });
}

/**
 * Se asegura de estar en la rama de trabajo antes de despachar un ticket.
 *
 * Cambia o crea la rama solo con el árbol limpio: mover una rama con cambios del ticket anterior
 * los mezclaría con el siguiente.
 */
export function asegurarRamaDeTrabajo(request: {
  readonly root: string;
  readonly ramaDeTrabajo: string;
  readonly ramasProtegidas: readonly string[];
  readonly ejecutor?: EjecutorDeGit;
}): { readonly rama: string; readonly cambiada: boolean } {
  if (request.ramasProtegidas.includes(request.ramaDeTrabajo)) {
    fail(`La rama de trabajo (${request.ramaDeTrabajo}) es una rama protegida.`, EXIT_INVARIANT);
  }
  const actual = ramaActual(request.root, request.ejecutor);
  if (actual === request.ramaDeTrabajo) return { rama: actual, cambiada: false };
  const sucios = estadoDelArbolDeTrabajo(request.root, request.ejecutor);
  if (sucios.length > 0) {
    fail(
      `No se puede pasar a la rama de trabajo ${request.ramaDeTrabajo}: el árbol no está limpio ` +
        `(${sucios.slice(0, 5).join(", ")}${sucios.length > 5 ? "…" : ""}).`,
      EXIT_INVARIANT,
    );
  }
  const existe = ejecutarGitPermitido(request.root, ["rev-parse", "--verify", "--quiet", `refs/heads/${request.ramaDeTrabajo}`], request.ejecutor).status === 0;
  const cambio = ejecutarGitPermitido(
    request.root,
    existe ? ["switch", request.ramaDeTrabajo] : ["switch", "-c", request.ramaDeTrabajo],
    request.ejecutor,
  );
  if (cambio.status !== 0) fail(`No se pudo pasar a la rama de trabajo: ${cambio.stderr.trim()}`, EXIT_INVARIANT);
  return { rama: request.ramaDeTrabajo, cambiada: true };
}

export interface IntegrarTicketRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly titulo: string;
  readonly ramaDeTrabajo: string;
  readonly ramasProtegidas: readonly string[];
  /** `true` si el árbol estaba limpio al empezar el ticket. */
  readonly arbolLimpioAlEmpezar: boolean;
  /** El hash del contenido de los archivos funcionales, calculado **antes** de correr `qa-mechanical`. */
  readonly hashProbado: string;
  readonly recibo: string;
  readonly ejecutor?: EjecutorDeGit;
  /** Cuántos secretos hay en el cambio; por defecto lo mide el escáner del harness. */
  readonly secretos?: () => number;
}

export type ResultadoDeIntegracion =
  | { readonly estado: "commiteado"; readonly commit: string; readonly archivos: readonly string[] }
  | { readonly estado: "rechazado"; readonly motivos: readonly string[] };

/** Los archivos del cambio, separados en los funcionales y los del registro de este ticket. */
export function repartirCambios(
  cambiados: readonly string[],
  paths: RegistryPaths,
  ticketId: string,
): { funcionales: string[]; delRegistro: string[]; ajenos: string[] } {
  const delTicket = (ruta: string): boolean =>
    (ruta.startsWith(`${paths.ticketsDir}/`) && ruta.includes(`/${ticketId}/`)) ||
    ruta === `${paths.ticketsDir}/index.md` ||
    ruta === `.valmen/receipts/${ticketId}.jsonl`;
  const funcionales: string[] = [];
  const delRegistro: string[] = [];
  const ajenos: string[] = [];
  for (const ruta of cambiados) {
    if (delTicket(ruta)) delRegistro.push(ruta);
    else if (ruta.startsWith(`${paths.ticketsDir}/`) || ruta.startsWith(".valmen/")) ajenos.push(ruta);
    else funcionales.push(ruta);
  }
  return { funcionales, delRegistro, ajenos };
}

/** Commitea un ticket terminado si las reglas lo permiten y el árbol es el que se probó. */
export function integrarTicket(request: IntegrarTicketRequest): ResultadoDeIntegracion {
  const { paths } = request;
  const cambiados = estadoDelArbolDeTrabajo(paths.root, request.ejecutor);
  const { funcionales, delRegistro, ajenos } = repartirCambios(cambiados, paths, request.ticketId);
  const atribuibles = [...funcionales, ...delRegistro];

  const motivos: string[] = [];
  const veredicto = reglasDeIntegracion({
    ramaActual: ramaActual(paths.root, request.ejecutor),
    ramaDeTrabajo: request.ramaDeTrabajo,
    ramasProtegidas: request.ramasProtegidas,
    arbolLimpioAlEmpezar: request.arbolLimpioAlEmpezar,
    archivosCambiados: atribuibles,
    hallazgosDeSecretos: (request.secretos ?? (() => scanPendingChanges(paths.root).findings.length))(),
  });
  motivos.push(...veredicto.violaciones);
  for (const ajeno of ajenos) {
    motivos.push(`${ajeno} cambió y no es atribuible a ${request.ticketId}: es de otro ticket o del harness.`);
  }
  if (hashDeArchivos(paths.root, funcionales) !== request.hashProbado) {
    motivos.push(
      "El contenido de los archivos cambió después de la prueba: el commit no correspondería al árbol que se verificó.",
    );
  }
  if (motivos.length > 0) return { estado: "rechazado", motivos };

  const agregar = ejecutarGitPermitido(paths.root, ["add", "--", ...atribuibles], request.ejecutor);
  if (agregar.status !== 0) return { estado: "rechazado", motivos: [`git add falló: ${agregar.stderr.trim()}`] };
  const mensaje =
    `${request.ticketId}: ${request.titulo}\n\n` +
    `Commit de la jornada tras qa-mechanical en verde (recibo ${request.recibo}). ` +
    "Sin push: la publicación la decide una persona.";
  const commit = ejecutarGitPermitido(paths.root, ["commit", "-m", mensaje], request.ejecutor);
  if (commit.status !== 0) return { estado: "rechazado", motivos: [`git commit falló: ${commit.stderr.trim() || commit.stdout.trim()}`] };

  const sha = ejecutarGitPermitido(paths.root, ["rev-parse", "HEAD"], request.ejecutor).stdout.trim();
  // El commit tiene que contener exactamente lo que se probó.
  const enCommit = hashDeArchivosEnCommit(paths.root, sha, funcionales);
  if (enCommit !== request.hashProbado) {
    return {
      estado: "rechazado",
      motivos: [`El commit ${sha.slice(0, 12)} no contiene el árbol que se probó; revisa el historial antes de seguir.`],
    };
  }
  return { estado: "commiteado", commit: sha, archivos: atribuibles };
}
