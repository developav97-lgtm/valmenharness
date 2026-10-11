/**
 * Qué cambió, según git.
 *
 * Existe porque dos chequeos distintos —el de secretos y el de colores fijos—
 * necesitan exactamente lo mismo: **las líneas que este cambio agrega**, con su
 * archivo y su número de línea. Escribir el recorrido del diff dos veces sería
 * tener dos definiciones de «lo que se está por commitear», y el día que una
 * cambiara, los dos chequeos mirarían cosas distintas sin que nadie lo note.
 *
 * La unidad es el **bloque**: un tramo contiguo de líneas agregadas. No es un
 * detalle de implementación: un detector que perdona una línea mira la de al
 * lado, y trocear el texto línea por línea rompería esa mirada. Un archivo nuevo
 * —que no tiene contra qué diferenciarse— entra entero como un solo bloque.
 *
 * Nada de esto toca el índice ni el árbol de trabajo: `git diff` es de solo
 * lectura, y un chequeo que corre antes de commitear no puede modificar lo que
 * está revisando.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { esRegistroDelTicket } from "./review-risk.js";

/** Un tramo contiguo de líneas agregadas dentro de un archivo. */
export interface AddedBlock {
  readonly path: string;
  /** La línea del archivo donde arranca el bloque, contando desde 1. */
  readonly startLine: number;
  readonly lines: readonly string[];
}

/** Lo que git dice que cambió. */
export interface PendingChanges {
  readonly blocks: readonly AddedBlock[];
  /** Los archivos que el cambio toca, para poder decir cuántos se miraron. */
  readonly files: readonly string[];
}

/** Corre git y devuelve su salida, o `null` si no se pudo. */
export function git(root: string, args: readonly string[]): string | null {
  const resultado = spawnSync("git", [...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
  return resultado.status === 0 ? (resultado.stdout ?? "") : null;
}

/**
 * Los archivos que git reporta como cambiados o nuevos.
 *
 * Es la lista de lo que se va a commitear, no el árbol entero: revisar todo el
 * repositorio marcaría hallazgos históricos que este cambio no introduce, y el
 * trabajo se detendría por algo que no es de quien está trabajando.
 */
export function pendingFiles(root: string, staged = false): string[] {
  const rango = staged ? ["--cached"] : [];
  const modificados = git(root, ["diff", "--name-only", ...rango, "HEAD"]) ?? "";
  const nuevos = staged
    ? []
    : (git(root, ["ls-files", "--others", "--exclude-standard"]) ?? "").split("\n");

  return [...new Set([...modificados.split("\n"), ...nuevos])]
    .map((linea) => linea.trim())
    .filter((linea) => linea !== "")
    .sort();
}

/**
 * Las líneas agregadas por el cambio pendiente.
 *
 * Solo las **agregadas**: marcar una línea que ya estaba convertiría cualquier
 * chequeo en un obstáculo para tocar archivos viejos, y lo que se revisa es lo
 * que **entra**, no lo que ya estaba.
 */
export function pendingChanges(root: string, staged = false): PendingChanges {
  const rango = staged ? ["--cached"] : [];
  const diff = git(root, ["diff", "--unified=0", "--no-color", ...rango, "HEAD"]);
  const bloques: AddedBlock[] = [];
  const archivos = new Set<string>();

  if (diff !== null) {
    let path = "";
    let enBloque = false;
    let inicio = 0;
    let lineas: string[] = [];

    const cerrar = (): void => {
      if (enBloque && path !== "" && lineas.length > 0) {
        bloques.push({ path, startLine: inicio, lines: lineas });
      }
      enBloque = false;
      lineas = [];
    };

    for (const renglon of diff.split("\n")) {
      if (renglon.startsWith("+++ b/")) {
        cerrar();
        path = renglon.slice(6);
        archivos.add(path);
        continue;
      }
      const encabezado = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(renglon);
      if (encabezado !== null) {
        cerrar();
        inicio = Number.parseInt(encabezado[1] as string, 10);
        enBloque = true;
        continue;
      }
      if (renglon.startsWith("+") && !renglon.startsWith("+++")) {
        if (!enBloque) {
          // Un `git diff` sin encabezado previo no debería pasar; si pasa, el
          // bloque empieza donde git diga o, en el peor caso, en la línea 1.
          enBloque = true;
          inicio = 1;
        }
        lineas.push(renglon.slice(1));
        continue;
      }
      cerrar();
    }
    cerrar();
  }

  // Un archivo nuevo no aparece en el diff como líneas agregadas —no tiene contra
  // qué diferenciarse—, así que se lee entero. Es donde más probable es que haya
  // algo: nadie revisa lo que acaba de escribir.
  if (!staged) {
    for (const path of (git(root, ["ls-files", "--others", "--exclude-standard"]) ?? "")
      .split("\n")
      .map((linea) => linea.trim())
      .filter((linea) => linea !== "")) {
      archivos.add(path);
      let contenido: string;
      try {
        contenido = readFileSync(join(root, path), "utf8");
      } catch {
        continue;
      }
      bloques.push({ path, startLine: 1, lines: contenido.split("\n") });
    }
  }

  return { blocks: bloques, files: [...archivos].sort() };
}

/** Un tramo de líneas del archivo de ahora, contando desde 1, ambos extremos incluidos. */
interface TramoCambiado {
  readonly desde: number;
  readonly hasta: number;
}

/** Un archivo del diff contra la base, con su parche y las líneas que el cambio toca. */
export interface ArchivoDelDiff {
  readonly ruta: string;
  readonly estado: "A" | "M" | "D";
  /** La sección de este archivo en el parche. */
  readonly parche: string;
  /** Las líneas que el cambio agrega o modifica; en un borrado, las dos del corte. */
  readonly tramos: readonly TramoCambiado[];
  readonly binario: boolean;
}

/** Lo que cambia el árbol de trabajo respecto de la base, sin el registro del propio ticket. */
interface CambiosContraBase {
  /** El commit de `git merge-base <base> HEAD`. */
  readonly commit: string;
  readonly archivos: readonly ArchivoDelDiff[];
  /** Los tramos de líneas agregadas, para los escáneres de secretos y de colores. */
  readonly bloques: readonly AddedBlock[];
}

/** Lee un parche de git con `--unified=5`: los tramos cambiados y los bloques agregados de un archivo. */
function leerParche(
  ruta: string,
  seccion: string,
): { tramos: TramoCambiado[]; bloques: AddedBlock[] } {
  const tramos: TramoCambiado[] = [];
  const bloques: AddedBlock[] = [];
  let nuevo = 0;
  let enHunk = false;
  let agregadas: number[] = [];
  let eliminadas = 0;
  let corte = 0;
  let bloque: { startLine: number; lines: string[] } | null = null;

  const cerrarBloque = (): void => {
    if (bloque !== null)
      bloques.push({ path: ruta, startLine: bloque.startLine, lines: bloque.lines });
    bloque = null;
  };
  const cerrarGrupo = (): void => {
    if (agregadas.length > 0) {
      tramos.push({
        desde: agregadas[0] as number,
        hasta: agregadas[agregadas.length - 1] as number,
      });
    } else if (eliminadas > 0) {
      tramos.push({ desde: Math.max(1, corte - 1), hasta: Math.max(1, corte) });
    }
    agregadas = [];
    eliminadas = 0;
  };

  for (const renglon of seccion.split("\n")) {
    const encabezado = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(renglon);
    if (encabezado !== null) {
      cerrarBloque();
      cerrarGrupo();
      nuevo = Number.parseInt(encabezado[1] as string, 10);
      enHunk = true;
      continue;
    }
    if (!enHunk) continue;
    const marca = renglon[0];
    if (marca === "+") {
      agregadas.push(nuevo);
      if (bloque === null) bloque = { startLine: nuevo, lines: [] };
      bloque.lines.push(renglon.slice(1));
      nuevo += 1;
    } else if (marca === "-") {
      cerrarBloque();
      eliminadas += 1;
      corte = nuevo;
    } else if (marca === "\\") {
      continue;
    } else {
      cerrarBloque();
      cerrarGrupo();
      nuevo += 1;
    }
  }
  cerrarBloque();
  cerrarGrupo();
  return { tramos, bloques };
}

/** El archivo nuevo sin versionar como un alta completa, con la forma de un parche de git. */
function altaCompleta(
  ruta: string,
  contenido: Buffer,
): { archivo: ArchivoDelDiff; bloque: AddedBlock | null } {
  if (contenido.subarray(0, 8000).some((byte) => byte === 0)) {
    const parche = `diff --git a/${ruta} b/${ruta}\nnew file mode 100644\nBinary files /dev/null and b/${ruta} differ\n`;
    return {
      archivo: { ruta, estado: "A", parche, tramos: [], binario: true },
      bloque: null,
    };
  }
  const texto = contenido.toString("utf8");
  const lineas = texto.split("\n");
  const terminaEnSalto = texto.endsWith("\n");
  if (terminaEnSalto) lineas.pop();
  const cabecera = `diff --git a/${ruta} b/${ruta}\nnew file mode 100644\n`;
  const parche =
    lineas.length === 0
      ? cabecera
      : `${cabecera}--- /dev/null\n+++ b/${ruta}\n@@ -0,0 +1,${lineas.length} @@\n` +
        `${lineas.map((l) => `+${l}`).join("\n")}\n${terminaEnSalto ? "" : "\\ No newline at end of file\n"}`;
  return {
    archivo: {
      ruta,
      estado: "A",
      parche,
      tramos: lineas.length === 0 ? [] : [{ desde: 1, hasta: lineas.length }],
      binario: false,
    },
    bloque: lineas.length === 0 ? null : { path: ruta, startLine: 1, lines: lineas },
  };
}

/**
 * Lo que cambia el árbol de trabajo respecto de la base, tanto lo commiteado desde ella como lo que
 * falta por commitear, más los archivos nuevos sin versionar.
 *
 * Git solo se **lee**. La base se resuelve a `git merge-base <base> HEAD` y el parche se pide contra
 * ese commit: es lo mismo que `--merge-base <base>` sin exigir git 2.30, y la referencia que llega
 * de fuera nunca viaja como opción de git. Falla con un mensaje si la base no existe.
 */
export function cambiosContraBase(
  root: string,
  base: string,
  ticketId: string,
  ticketsDir: string,
): CambiosContraBase {
  if (base === "" || base.startsWith("-") || /[\s\0]/.test(base)) {
    throw new Error(`La base "${base}" no es una referencia de git válida.`);
  }
  const commit = (git(root, ["merge-base", base, "HEAD"]) ?? "").trim();
  if (commit === "") {
    throw new Error(
      `No se pudo resolver la base "${base}": git merge-base ${base} HEAD no devolvió un commit.`,
    );
  }

  const estados = git(root, ["diff", "--name-status", "--no-renames", "-z", commit, "--"]);
  const parche = git(root, [
    "-c",
    "core.quotePath=false",
    "diff",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    "--no-renames",
    "--unified=5",
    commit,
    "--",
  ]);
  const sinVersionar = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (estados === null || parche === null || sinVersionar === null) {
    throw new Error(
      "git no pudo leer el diff contra la base (¿el proyecto es un repositorio git?).",
    );
  }

  const partes = estados.split("\0");
  const rutas: { estado: "A" | "M" | "D"; ruta: string }[] = [];
  for (let i = 0; i + 1 < partes.length; i += 2) {
    const letra = partes[i];
    const ruta = partes[i + 1];
    if (letra === undefined || ruta === undefined || ruta === "") continue;
    rutas.push({ estado: letra === "A" || letra === "D" ? letra : "M", ruta });
  }
  const secciones = parche
    .split(/^(?=diff --git )/m)
    .filter((seccion) => seccion.trim() !== "");
  if (secciones.length !== rutas.length) {
    throw new Error(
      `git informó ${rutas.length} archivo(s) cambiado(s) y ${secciones.length} parche(s): no se puede emparejar el diff.`,
    );
  }

  const archivos: ArchivoDelDiff[] = [];
  const bloques: AddedBlock[] = [];
  const propio = (estado: string, ruta: string): boolean =>
    estado !== "D" && esRegistroDelTicket(ruta, ticketId, ticketsDir);
  for (const [i, { estado, ruta }] of rutas.entries()) {
    if (propio(estado, ruta)) continue;
    const seccion = secciones[i] as string;
    const leido = leerParche(ruta, seccion);
    archivos.push({
      ruta,
      estado,
      parche: seccion,
      tramos: estado === "D" ? [{ desde: 1, hasta: 1 }] : leido.tramos,
      binario: /^(Binary files .* differ|GIT binary patch)/m.test(seccion),
    });
    bloques.push(...leido.bloques);
  }

  for (const ruta of sinVersionar.split("\0").filter((r) => r !== "")) {
    if (ruta === ".valmen.lock" || propio("A", ruta)) continue;
    let contenido: Buffer;
    try {
      contenido = readFileSync(join(root, ...ruta.split("/")));
    } catch {
      continue;
    }
    const { archivo, bloque } = altaCompleta(ruta, contenido);
    archivos.push(archivo);
    if (bloque !== null) bloques.push(bloque);
  }

  archivos.sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : 0));
  return { commit, archivos, bloques };
}
