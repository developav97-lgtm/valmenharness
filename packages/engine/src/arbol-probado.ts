/**
 * El árbol de trabajo que se probó (R-REV-001).
 *
 * **Por qué existe.** El recibo de `qa-mechanical` decía «los criterios pasaron sobre este texto
 * del ticket» y la entrega solo comparaba ese texto: un archivo funcional editado, creado o
 * borrado después de la compuerta llegaba a la persona como si lo probado fuera lo entregado.
 * Aquí se calcula qué código había cuando se probó, para que el recibo lo guarde y la entrega
 * —y el siguiente paso que se le da al agente— lo comparen con el de ahora.
 *
 * **Qué es el árbol.** El contenido de los archivos funcionales que git ve en el árbol de
 * trabajo —los versionados más los nuevos no ignorados—, sin los del propio registro (`tickets/`
 * y `.valmen/`). El registro queda fuera porque cambia entre la compuerta y la entrega sin ser
 * código: el recibo se anexa en `.valmen/receipts/`, el ticket recibe el consumo de IA, el
 * índice se regenera. Cada archivo entra con su ruta y el sha256 de su contenido, con el mismo
 * encuadre que el resto de los hashes del motor (`encuadrar`).
 *
 * **Por qué no el `tree` de un commit.** El commit va *después* de las pruebas del responsable,
 * así que casi siempre se prueba trabajo sin commitear, y un commit incluye el registro. Se
 * compara el contenido y no el commit: commitear lo probado antes de entregar no rechaza nada.
 * Tampoco se arma un árbol git real con un índice temporal: eso escribe objetos en `.git` y
 * exige `git add -A`, que las reglas de integración prohíben. Aquí git solo se **lee**.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { EXIT_INVARIANT, fail } from "@valmen/core";
import type { GateReceipt, TestedTreeRecord } from "@valmen/gate";

import type { RegistryPaths } from "./discovery.js";
import { encuadrar, esRepositorioGit } from "./integration-commit.js";

/** Salida máxima de git: un `ls-files` de un repositorio grande pasa del tope por defecto (1 MiB). */
const SALIDA_MAXIMA = 256 * 1024 * 1024;

/** El árbol de trabajo de un momento: lo que el recibo guarda y el detalle por archivo. */
export interface ArbolProbado {
  readonly registro: TestedTreeRecord;
  /** Ruta → sha256 del contenido. No se guarda en el recibo: sirve para decir qué cambió. */
  readonly archivos: ReadonlyMap<string, string>;
}

interface SalidaDeGit {
  readonly status: number | null;
  readonly stdout: string;
  readonly detalle: string;
}

/** Corre git sin shell. Un fallo al lanzarlo (sin `git` en el PATH, salida excedida) llega como `status: null`. */
function git(root: string, argumentos: readonly string[]): SalidaDeGit {
  const r = spawnSync("git", [...argumentos], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: SALIDA_MAXIMA,
  });
  const detalle = r.error === undefined ? (r.stderr ?? "").trim() : r.error.message;
  return { status: r.status, stdout: r.stdout ?? "", detalle };
}

/** La salida de git, o un fallo que dice cuál fue el comando. */
function leerGit(root: string, argumentos: readonly string[]): string {
  const salida = git(root, argumentos);
  if (salida.status !== 0) {
    fail(
      `git ${argumentos.join(" ")} falló: ${salida.detalle || `salida ${salida.status}`}`,
      EXIT_INVARIANT,
    );
  }
  return salida.stdout;
}

/**
 * El archivo que el propio motor crea en la raíz mientras muta el registro (`MutationLock`,
 * `packages/core/src/fs.ts`). Existe justo mientras `transition` comprueba la entrega, así que sin
 * excluirlo la entrega vería un archivo nuevo que ella misma acaba de crear.
 */
const ARCHIVO_DE_LOCK = ".valmen.lock";

/** Las rutas del registro no son código: ni el ticket, ni sus recibos, ni el estado del harness. */
function esDelRegistro(ruta: string, paths: RegistryPaths): boolean {
  return (
    ruta === ARCHIVO_DE_LOCK ||
    ruta.startsWith(`${paths.ticketsDir}/`) ||
    ruta.startsWith(".valmen/")
  );
}

/** El contenido de un archivo; `null` si ya no existe o no es un archivo (borrado, submódulo). */
function leerArchivo(ruta: string): Buffer | null {
  try {
    return readFileSync(ruta);
  } catch (caught) {
    const codigo = (caught as NodeJS.ErrnoException).code;
    if (codigo === "ENOENT" || codigo === "ENOTDIR" || codigo === "EISDIR") return null;
    return fail(
      `No se pudo leer ${ruta} para calcular el árbol probado: ${(caught as Error).message}`,
      EXIT_INVARIANT,
    );
  }
}

/**
 * Las rutas que `git status` dice que cambiaron, de `status --porcelain -z`.
 *
 * Cada entrada es `XY <ruta>`; un renombrado o una copia trae a continuación la ruta de origen,
 * sola, en la entrada siguiente.
 */
function rutasConCambios(salida: string): string[] {
  const entradas = salida.split("\0").filter((entrada) => entrada !== "");
  const rutas: string[] = [];
  for (let i = 0; i < entradas.length; i += 1) {
    const entrada = entradas[i] ?? "";
    rutas.push(entrada.slice(3));
    if (/[RC]/.test(entrada.slice(0, 2))) {
      i += 1;
      const origen = entradas[i];
      if (origen !== undefined) rutas.push(origen);
    }
  }
  return rutas;
}

/**
 * El árbol de trabajo de ahora.
 *
 * Devuelve `null` si el proyecto no es un repositorio git: sin repositorio no hay árbol que
 * calcular y el recibo sigue atado solo al texto del ticket. Falla —no devuelve `null`— si hay
 * repositorio y no se pudo leer: un cálculo que se calla y deja pasar es justo lo que este
 * módulo existe para evitar.
 */
export function calcularArbolProbado(paths: RegistryPaths): ArbolProbado | null {
  const { root } = paths;

  const raiz = git(root, ["rev-parse", "--show-toplevel"]);
  if (raiz.status !== 0) {
    // Con `.git` en la raíz y git sin responder no se sabe que no hay repositorio: se falla cerrado.
    if (esRepositorioGit(root)) {
      fail(
        `git no respondió en ${root}: ${raiz.detalle || `salida ${raiz.status}`}`,
        EXIT_INVARIANT,
      );
    }
    return null;
  }

  // `HEAD` no existe en un repositorio sin commits: `-q` lo calla con salida 1.
  const cabeza = git(root, ["rev-parse", "--verify", "-q", "HEAD"]);
  if (cabeza.status !== 0 && cabeza.status !== 1) {
    fail(
      `git rev-parse HEAD falló: ${cabeza.detalle || `salida ${cabeza.status}`}`,
      EXIT_INVARIANT,
    );
  }
  const head = cabeza.status === 0 ? cabeza.stdout.trim() : null;

  const listado = leerGit(root, [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  ]);
  const rutas = [...new Set(listado.split("\0").filter((ruta) => ruta !== ""))]
    .filter((ruta) => !esDelRegistro(ruta, paths))
    .sort();

  // Un archivo listado que ya no existe en disco (borrado) no entra: su ausencia cambia el hash.
  const archivos = new Map<string, string>();
  for (const ruta of rutas) {
    const contenido = leerArchivo(join(root, ...ruta.split("/")));
    if (contenido !== null)
      archivos.set(ruta, createHash("sha256").update(contenido).digest("hex"));
  }
  const hex = encuadrar([...archivos.keys()], (ruta) =>
    Buffer.from(archivos.get(ruta) ?? "", "hex"),
  );
  if (hex === null) fail("No se pudo calcular el hash del árbol probado.", EXIT_INVARIANT);

  // Con el árbol de trabajo igual al commit, `commitTree` es «el tree del commit»; con cambios
  // sin commitear lo probado no es ningún commit y vale solo el hash.
  let commitTree: string | null = null;
  if (head !== null) {
    const estado = leerGit(root, [
      "--no-optional-locks",
      "status",
      "--porcelain",
      "-z",
      "-uall",
    ]);
    const sinCambiosFuncionales = rutasConCambios(estado).every((ruta) =>
      esDelRegistro(ruta, paths),
    );
    if (sinCambiosFuncionales)
      commitTree = leerGit(root, ["rev-parse", `${head}^{tree}`]).trim();
  }

  return {
    registro: { hash: `sha256:${hex}`, head, commitTree, files: archivos.size },
    archivos,
  };
}

/** Las rutas cuyo contenido difiere entre dos árboles —cambiadas, nuevas o borradas—, ordenadas. */
export function rutasQueCambiaron(
  antes: ReadonlyMap<string, string>,
  despues: ReadonlyMap<string, string>,
): string[] {
  const todas = new Set([...antes.keys(), ...despues.keys()]);
  return [...todas].filter((ruta) => antes.get(ruta) !== despues.get(ruta)).sort();
}

/**
 * Por qué el recibo de la verificación mecánica no vale para entregar lo que hay ahora, o `null`.
 *
 * Es lo que comparan la entrega (`transition`) y el siguiente paso (`next-step`): las dos tienen
 * que decir lo mismo, y por eso el motivo sale de una sola función. Devuelve `null` si el árbol
 * actual es el del recibo y también si el proyecto no es un repositorio git y el recibo no trae
 * árbol —ahí solo existe el texto del ticket—. Los demás casos son un motivo, y todos terminan en
 * lo que hay que correr: la compuerta con el evaluador `command` no cuesta nada.
 *
 * Un recibo sin árbol dentro de un repositorio git se rechaza: no prueba qué código se verificó, y
 * aceptarlo dejaría pasar un ticket que vuelve de `changes_requested` con el recibo de antes.
 */
export function motivoDeArbolNoVigente(
  recibo: GateReceipt,
  paths: RegistryPaths,
  ticketId: string,
  compuerta: "qa-mechanical" | "code-review",
): string | null {
  const mecanica = compuerta === "qa-mechanical";
  // La verificación mecánica se repite gratis con el evaluador `command`; la revisión del diff no
  // admite `--evaluator`: su profundidad la decide el riesgo.
  const repetir = mecanica
    ? `Para entregar hay que repetir la compuerta: valmen gate qa-mechanical --id ${ticketId} --evaluator command`
    : `Para entregar hay que repetir la compuerta: valmen gate code-review --id ${ticketId}`;
  const verificacion = mecanica ? "la verificación mecánica" : "la revisión del código";
  const queHizo = mecanica ? "probó" : "revisó";
  const sinComprobar =
    "sin él no se puede comprobar que lo que se probó es lo que se entrega";

  let actual: ArbolProbado | null;
  try {
    actual = calcularArbolProbado(paths);
  } catch (caught) {
    const causa = caught instanceof Error ? caught.message : String(caught);
    return `No se pudo calcular el árbol de trabajo actual (${causa}): ${sinComprobar}. ${repetir}`;
  }

  if (actual === null) {
    if (recibo.testedTree === undefined) return null;
    return (
      `El recibo ${recibo.id} guarda el árbol que ${queHizo}, pero el proyecto ya no es un repositorio ` +
      `git y el de ahora no se puede calcular: ${sinComprobar}. ${repetir}`
    );
  }
  if (recibo.testedTree === undefined) {
    return (
      `${mecanica ? "La verificación mecánica" : "La revisión del código"} (recibo ${recibo.id}) no guarda el árbol de trabajo que ${queHizo}: ` +
      `${sinComprobar}. ${repetir}`
    );
  }
  if (actual.registro.hash === recibo.testedTree.hash) return null;
  return (
    `El árbol de trabajo cambió desde ${verificacion} (recibo ${recibo.id}): lo que se ` +
    `${queHizo} no es lo que se entrega. ${repetir}`
  );
}
