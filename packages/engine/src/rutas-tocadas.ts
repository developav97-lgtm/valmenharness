/**
 * Las rutas que toca un diff, leídas de una sola manera.
 *
 * Varias decisiones de seguridad parten de «qué archivos tocó este cambio»: la elegibilidad de la
 * QA por agente, el cierre por política, la integración de un worktree y el escaneo de secretos.
 * `git diff --name-only` no sirve para eso: de un renombre informa solo el destino (el origen
 * —una migración, un archivo del harness— se pierde) y entrecomilla con escapes octales las rutas
 * no ASCII. Aquí se lee `--name-status -z`, que entrega el origen del renombre y las rutas crudas, y
 * todos los consumidores la llaman con su propio ejecutor de git (cada uno conserva su lista cerrada).
 */

/** Los argumentos fijos de la lectura; `-M`/`-C` explícitos no dependen de `diff.renames` del usuario. */
export const ARGUMENTOS_DE_RUTAS_TOCADAS: readonly string[] = [
  "diff",
  "--name-status",
  "-z",
  "-M",
  "-C",
];

/** Un archivo que el diff toca. `ruta` es el destino; `origen` solo existe en un renombre o una copia. */
export interface CambioDeRuta {
  readonly estado: "A" | "M" | "D" | "R" | "C" | "T";
  readonly ruta: string;
  readonly origen: string | null;
}

/** Lo mínimo que se pide a un ejecutor de git: cada consumidor aporta el suyo, con su lista cerrada. */
export type EjecutorDeRutas = (argumentos: readonly string[]) => {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
};

const ESTADOS = new Set(["A", "M", "D", "R", "C", "T"]);

/** Parte la salida de `--name-status -z`: `R<n>` y `C<n>` consumen dos rutas, el resto una. */
function parsearCambiosDeRuta(salidaZ: string): CambioDeRuta[] {
  const campos = salidaZ.split("\0");
  const cambios: CambioDeRuta[] = [];
  for (let i = 0; i < campos.length;) {
    const codigo = campos[i++]!;
    if (codigo === "") continue;
    const letra = codigo[0]!;
    const estado = (ESTADOS.has(letra) ? letra : "M") as CambioDeRuta["estado"];
    if (letra === "R" || letra === "C") {
      const origen = campos[i++] ?? "";
      const ruta = campos[i++] ?? "";
      if (ruta !== "") cambios.push({ estado, ruta, origen });
    } else {
      const ruta = campos[i++] ?? "";
      if (ruta !== "") cambios.push({ estado, ruta, origen: null });
    }
  }
  return cambios;
}

/**
 * Los cambios de un rango. `antes` son banderas que van entre los argumentos fijos y el rango
 * (por ejemplo `--cached`). Un estado distinto de 0 lanza.
 */
export function cambiosDeRuta(
  ejecutar: EjecutorDeRutas,
  rango: string,
  antes: readonly string[] = [],
): CambioDeRuta[] {
  const salida = ejecutar([...ARGUMENTOS_DE_RUTAS_TOCADAS, ...antes, rango]);
  if (salida.status !== 0) throw new Error(`git diff falló: ${salida.stderr.trim()}`);
  return parsearCambiosDeRuta(salida.stdout);
}

/**
 * Las rutas que el cambio toca: el destino de cada cambio, más el origen de cada renombre.
 * El origen de una copia no cuenta: una copia no lo modifica (si cambió, git lo informa aparte).
 */
export function rutasQueCuentan(cambios: readonly CambioDeRuta[]): string[] {
  const rutas = new Set<string>();
  for (const c of cambios) {
    rutas.add(c.ruta);
    if (c.estado === "R" && c.origen !== null) rutas.add(c.origen);
  }
  return [...rutas].sort();
}

const ESCAPES: Readonly<Record<string, number>> = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  "\\": 92,
};

/** El formato C de git (`"…"` con `\nnn`, `\"`, `\\`, `\t`, `\n`) a la ruta real en UTF-8. */
export function desentrecomillarRutaDeGit(texto: string): string {
  if (!(texto.length >= 2 && texto.startsWith('"') && texto.endsWith('"'))) return texto;
  const interior = texto.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < interior.length; i++) {
    const c = interior[i]!;
    if (c !== "\\") {
      bytes.push(...Buffer.from(c, "utf8"));
      continue;
    }
    const octal = /^[0-7]{1,3}/.exec(interior.slice(i + 1));
    if (octal !== null) {
      bytes.push(Number.parseInt(octal[0], 8));
      i += octal[0].length;
      continue;
    }
    const siguiente = interior[i + 1] ?? "";
    const byte = ESCAPES[siguiente];
    if (byte !== undefined) {
      bytes.push(byte);
      i++;
    } else {
      bytes.push(92);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}
