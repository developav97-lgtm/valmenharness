#!/usr/bin/env node
/**
 * Guarda de exportaciones sin consumidor (R-MUE-001 a R-MUE-003).
 *
 * Corre `knip` sobre el repositorio, se queda con lo que reporta en `packages/*\/src` y lo
 * compara con una **línea base versionada** (`scripts/exports-sin-uso.linea-base.json`: una
 * lista ordenada de «ruta#símbolo», o «ruta» para un archivo entero que nadie importa).
 *
 * - Una exportación sin consumidor que **no** está en la línea base falla: es código muerto
 *   nuevo, y se arregla borrándolo (o quitándole el `export`), no agregándolo a la lista.
 * - Una entrada de la línea base que **ya no aplica** —el símbolo se borró o ganó un
 *   consumidor— también falla, hasta que se quita: así la línea base solo se achica.
 *
 * Cuenta como consumidor un import desde otro módulo, una prueba (`tests/`), un guion
 * (`scripts/`) o una entrada `bin`; la configuración vive en `knip.json`. Los guiones
 * importan el `dist` de los paquetes, y `knip` solo lo reconoce **construido**: en el CI el
 * `typecheck` ya lo construyó, y en local hace falta `npm run build`.
 *
 * Uso:
 *   node scripts/exports-sin-uso.mjs                       comprueba contra la línea base
 *   node scripts/exports-sin-uso.mjs --crear-linea-base    la crea; se niega si ya existe
 *   node scripts/exports-sin-uso.mjs --directory <ruta>    comprueba otro árbol (pruebas)
 *
 * Salida: 0 sin hallazgos, 1 con exportaciones nuevas o entradas sobrantes, 2 por mal uso o
 * línea base ausente o ilegible, 3 si `knip` no corre.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** La raíz del repositorio al que pertenece este guion: de ahí sale el binario de `knip`. */
const RAIZ_DEL_REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Dónde vive la línea base, relativa a la raíz que se comprueba. */
const LINEA_BASE = "scripts/exports-sin-uso.linea-base.json";

/** Solo importa lo que se exporta desde el código de los paquetes. */
const CODIGO_DE_PAQUETE = /^packages\/[^/]+\/src\//;

/** Normaliza la ruta que informa `knip` a barras normales. */
const normalizar = (ruta) => ruta.replaceAll("\\", "/");

/** Recorre lo que `knip` reporta como `[clave, ruta, línea]`, ya limitado a `packages/*\/src`. */
function* recorrer(json) {
  for (const issue of json.issues ?? []) {
    const archivo = normalizar(issue.file);
    if (!CODIGO_DE_PAQUETE.test(archivo)) continue;
    for (const campo of ["exports", "types"]) {
      for (const simbolo of issue[campo] ?? []) {
        yield {
          clave: `${archivo}#${simbolo.name}`,
          archivo,
          simbolo: simbolo.name,
          linea: simbolo.line,
        };
      }
    }
    if ((issue.files ?? []).length > 0)
      yield { clave: archivo, archivo, simbolo: null, linea: null };
  }
}

/**
 * Lo que `knip` reporta sin consumidor en `packages/*\/src`, como lista ordenada y sin
 * repetidos de «ruta#símbolo» (y «ruta» para un archivo entero).
 */
export function hallazgosDeKnip(json) {
  return [...new Set([...recorrer(json)].map((h) => h.clave))].sort();
}

/** Compara lo medido con la línea base: lo nuevo y lo que la base nombra de más. */
export function compararConLineaBase(actual, base) {
  const enBase = new Set(base);
  const enActual = new Set(actual);
  return {
    nuevas: actual.filter((clave) => !enBase.has(clave)),
    sobrantes: base.filter((clave) => !enActual.has(clave)),
  };
}

/** Corre el `knip` del repositorio sobre `directorio` y devuelve su JSON. */
export function ejecutarKnip(directorio) {
  const binario = join(RAIZ_DEL_REPO, "node_modules", ".bin", "knip");
  // `knip` compara rutas reales: un directorio detrás de un enlace simbólico (en macOS, el
  // temporal `/var` es `/private/var`) deja las entradas sin reconocer y todo sale «sin uso».
  const resultado = spawnSync(
    binario,
    [
      "--directory",
      realpathSync(directorio),
      "--include",
      "exports,types,files",
      "--reporter",
      "json",
      "--no-exit-code",
    ],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  if (resultado.error || resultado.status !== 0) {
    const motivo = resultado.error?.message ?? resultado.stderr ?? "";
    throw new Error(`knip no corrió (salida ${resultado.status ?? "?"}): ${motivo.trim()}`);
  }
  try {
    return JSON.parse(resultado.stdout);
  } catch {
    throw new Error(`knip no devolvió JSON: ${resultado.stdout.slice(0, 200).trim()}`);
  }
}

/** Lee la línea base de `directorio`; lanza si falta o no es una lista de textos. */
function leerLineaBase(directorio) {
  const ruta = join(directorio, LINEA_BASE);
  if (!existsSync(ruta)) {
    throw new Error(
      `No existe ${LINEA_BASE}: créala una sola vez con --crear-linea-base y revísala antes de commitear.`,
    );
  }
  const base = JSON.parse(readFileSync(ruta, "utf8"));
  if (!Array.isArray(base) || base.some((entrada) => typeof entrada !== "string")) {
    throw new Error(`${LINEA_BASE} tiene que ser una lista de textos «ruta#símbolo».`);
  }
  return base;
}

/** Los paquetes con código fuente pero sin `dist`: los guiones que lo importan no se reconocen. */
function paquetesSinConstruir(directorio) {
  const base = join(directorio, "packages");
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter(
      (nombre) =>
        existsSync(join(base, nombre, "src")) && !existsSync(join(base, nombre, "dist")),
    )
    .map((nombre) => `packages/${nombre}/dist`);
}

const pluralEntradas = (n) => (n === 1 ? "1 entrada" : `${n} entradas`);

/**
 * Comprueba `directorio` contra su línea base y devuelve `{ exitCode, texto }`.
 *
 * `ejecutar(directorio)` es inyectable para probar sin correr `knip`.
 */
export function comprobar(directorio, ejecutar = ejecutarKnip) {
  let base;
  try {
    base = leerLineaBase(directorio);
  } catch (error) {
    return { exitCode: 2, texto: error.message };
  }
  const json = ejecutar(directorio);
  const { nuevas, sobrantes } = compararConLineaBase(hallazgosDeKnip(json), base);
  if (nuevas.length === 0 && sobrantes.length === 0) {
    return {
      exitCode: 0,
      texto: `Sin exportaciones nuevas sin consumidor; la línea base tiene ${pluralEntradas(base.length)}`,
    };
  }
  const detalle = new Map([...recorrer(json)].map((h) => [h.clave, h]));
  const lineas = [];
  for (const clave of nuevas) {
    const h = detalle.get(clave);
    lineas.push(
      h.simbolo === null
        ? `Archivo sin consumidor: \`${h.archivo}\``
        : `Exportación sin consumidor: \`${h.simbolo}\` en \`${h.archivo}${h.linea ? `:${h.linea}` : ""}\``,
    );
  }
  for (const clave of sobrantes) {
    lineas.push(
      `La línea base nombra \`${clave}\`, que ya tiene consumidor o ya no existe: quitala de ${LINEA_BASE}`,
    );
  }
  const sinConstruir = nuevas.length > 0 ? paquetesSinConstruir(directorio) : [];
  if (sinConstruir.length > 0) {
    lineas.push(
      `Nota: falta ${sinConstruir.join(", ")}. Si el símbolo lo importa un guion de scripts/, corré \`npm run build\` y probá de nuevo.`,
    );
  }
  return { exitCode: 1, texto: lineas.join("\n") };
}

/** Crea la línea base con lo que hay hoy; se niega a tocar una que ya existe. */
function crearLineaBase(directorio, ejecutar = ejecutarKnip) {
  const ruta = join(directorio, LINEA_BASE);
  if (existsSync(ruta)) {
    return {
      exitCode: 2,
      texto: `${LINEA_BASE} ya existe y no se sobrescribe: la línea base solo se achica, quitando a mano las entradas que ya no aplican.`,
    };
  }
  const lista = hallazgosDeKnip(ejecutar(directorio));
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, `${JSON.stringify(lista, null, 2)}\n`);
  return {
    exitCode: 0,
    texto: `Línea base creada en ${LINEA_BASE} con ${pluralEntradas(lista.length)}`,
  };
}

/** Interpreta los argumentos y corre; devuelve `{ exitCode, texto }`. */
function ejecutarCli(argumentos) {
  let directorio = RAIZ_DEL_REPO;
  let crear = false;
  for (let i = 0; i < argumentos.length; i += 1) {
    const argumento = argumentos[i];
    if (argumento === "--crear-linea-base") {
      crear = true;
    } else if (argumento === "--directory" && argumentos[i + 1] !== undefined) {
      directorio = resolve(argumentos[i + 1]);
      i += 1;
    } else {
      return {
        exitCode: 2,
        texto: `Argumento no reconocido: ${argumento}. Uso: node scripts/exports-sin-uso.mjs [--crear-linea-base] [--directory <ruta>]`,
      };
    }
  }
  try {
    return crear ? crearLineaBase(directorio) : comprobar(directorio);
  } catch (error) {
    return { exitCode: 3, texto: error.message };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { exitCode, texto } = ejecutarCli(process.argv.slice(2));
  (exitCode === 0 ? process.stdout : process.stderr).write(`${texto}\n`);
  process.exit(exitCode);
}
