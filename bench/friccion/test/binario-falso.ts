/**
 * Un binario `valmen` falso para probar la medición sin depender del producto.
 *
 * Es un `.mjs` guionado: cada vez que lo invocan anota en un registro **con ruta
 * absoluta fija** (fuera del escenario, que se borra) con qué `argv`, `cwd`, `HOME` y
 * entorno corrió, y después responde según el guion. El estado entre invocaciones vive
 * en archivos del `cwd`, que es dentro del escenario: así una prueba puede comprobar
 * que cada salida candidata arrancó en un escenario limpio.
 *
 * Una invocación que ninguna regla reconoce responde como el binario real ante un
 * comando que no existe: «Comando desconocido» y código 2.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Regla {
  /** Expresión regular, como texto, que se prueba contra `argv.join(" ")`. */
  cuando: string;
  /** La regla solo vale si este archivo existe en el `cwd`. */
  conArchivo?: string;
  /** La regla solo vale si este archivo no existe en el `cwd`. */
  sinArchivo?: string;
  /** Archivos vacíos que crea en el `cwd`: el estado que dejan las invocaciones. */
  crear?: string[];
  stdout?: string;
  stderr?: string;
  salida?: number;
  /** Se queda dormido este tiempo antes de responder: para probar el tiempo máximo. */
  esperarMs?: number;
  /** Invoca este programa desde el `PATH`, como haría un binario que llama a un modelo. */
  llamar?: string;
}

export interface LlamadaRegistrada {
  argv: string[];
  cwd: string;
  home: string | null;
  entorno: string[];
  valmenClaudeBin: string | null;
  claudeBinExiste: boolean;
  archivos: string[];
}

export interface BinarioFalso {
  ruta: string;
  llamadas(): LlamadaRegistrada[];
  limpiar(): void;
}

export function crearBinarioFalso(reglas: Regla[]): BinarioFalso {
  const carpeta = realpathSync(mkdtempSync(join(tmpdir(), "valmen-falso-")));
  const ruta = join(carpeta, "main.mjs");
  const registro = join(carpeta, "registro.jsonl");
  writeFileSync(registro, "");

  const guion = `
import { appendFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const REGISTRO = ${JSON.stringify(registro)};
const REGLAS = ${JSON.stringify(reglas)};

const argv = process.argv.slice(2);
const claudeBin = process.env.VALMEN_CLAUDE_BIN ?? null;
appendFileSync(
  REGISTRO,
  JSON.stringify({
    argv,
    cwd: process.cwd(),
    home: process.env.HOME ?? null,
    entorno: Object.keys(process.env),
    valmenClaudeBin: claudeBin,
    claudeBinExiste: claudeBin !== null && existsSync(claudeBin),
    archivos: readdirSync(process.cwd()),
  }) + "\\n",
);

const linea = argv.join(" ");
const regla = REGLAS.find(
  (r) =>
    new RegExp(r.cuando).test(linea) &&
    (r.conArchivo === undefined || existsSync(r.conArchivo)) &&
    (r.sinArchivo === undefined || !existsSync(r.sinArchivo)),
);

if (regla === undefined) {
  process.stderr.write("Error: Comando desconocido: " + (argv[0] ?? "") + ". Use --help para ver los disponibles.\\n");
  process.exitCode = 2;
} else {
  for (const archivo of regla.crear ?? []) writeFileSync(archivo, "");
  if (regla.llamar !== undefined) spawnSync(regla.llamar, ["--print"], { encoding: "utf8" });
  if (regla.esperarMs !== undefined) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, regla.esperarMs);
  if (regla.stdout !== undefined) process.stdout.write(regla.stdout);
  if (regla.stderr !== undefined) process.stderr.write(regla.stderr);
  process.exitCode = regla.salida ?? 0;
}
`;
  writeFileSync(ruta, guion);

  return {
    ruta,
    llamadas: () =>
      readFileSync(registro, "utf8")
        .split("\n")
        .filter((linea) => linea !== "")
        .map((linea) => JSON.parse(linea) as LlamadaRegistrada),
    limpiar: () => rmSync(carpeta, { recursive: true, force: true }),
  };
}
