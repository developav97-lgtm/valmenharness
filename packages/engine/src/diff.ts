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
