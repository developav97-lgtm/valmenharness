/**
 * La línea de comandos de la medición de fricción.
 *
 * `run` mide un binario `valmen` contra el corpus y escribe un archivo de resultados. Trata al
 * binario como caja negra —solo conoce su ruta, su código de salida y su texto—, así que sirve
 * igual para el de este árbol que para el de un commit anterior. `list` muestra el corpus y
 * `compare` contrasta dos archivos de resultados.
 */
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { comparar, ErrorDeResultados, formatear, leerResultados } from "./comparacion.js";
import { medir } from "./medicion.js";
import { RECORRIDOS } from "./recorridos.js";
import type { ArchivoDeResultados, Recorrido } from "./tipos.js";

const TIEMPO_MAXIMO_POR_DEFECTO_MS = 30_000;

const AYUDA = `Medición de fricción del CLI de valmen

Uso:
  friccion run --binary <ruta> --out <archivo> [--timeout-ms <n>] [--etiqueta <texto>]
  friccion list
  friccion compare <antes.json> <despues.json>

Comandos:
  run      Recorre el corpus contra el binario, sin modelo, y escribe en <archivo> la clase
           de cada bloqueo: en banda, fuera de banda o callejón sin salida.
  list     Muestra el corpus: un recorrido por línea, con su nombre y lo que bloquea.
  compare  Contrasta dos archivos de resultados: la clase de cada recorrido y los totales de
           cada corrida, con su diferencia. Muestra; no decide si la fricción empeoró.

Opciones:
  --binary <ruta>      El binario valmen que se mide (su main.js, por ejemplo).
  --out <archivo>      Dónde se escribe el archivo de resultados (JSON).
  --timeout-ms <n>     Tiempo máximo de cada subproceso. Por defecto, ${String(TIEMPO_MAXIMO_POR_DEFECTO_MS)}.
  --etiqueta <texto>   Texto libre que queda en el archivo, por ejemplo el commit del binario:
                       --version dice siempre lo mismo y no identifica lo que se midió.
  --help               Esta ayuda.

Cada recorrido corre en una carpeta temporal con su propio HOME y su repositorio git. El
entorno de los subprocesos se arma desde cero, sin claves de proveedores, y una trampa en
VALMEN_CLAUDE_BIN y en el PATH anota cualquier llamada a un CLI de modelo: esa llamada deja
el recorrido fallido. Además, npm_config_offline=true hace que npx no descargue nada.
Lo que NO se hace es aislar la red del sistema operativo: un binario que abra la red sin
credenciales no se detecta.

Un recorrido queda fallido si no se pudo armar o medir, y no_soportado si el binario no
tiene un comando o una bandera que necesita: el no soportado no falla la corrida.

Códigos de salida:
  0  El comando terminó: en run, ningún recorrido quedó fallido.
  1  Solo run: escribió el archivo, pero algún recorrido quedó fallido.
  2  Los argumentos no sirven, o un archivo de compare no existe o no es de resultados.
`;

interface Argumentos {
  binario: string | undefined;
  salida: string | undefined;
  timeoutMs: number;
  etiqueta: string | undefined;
  ayuda: boolean;
}

class ErrorDeUso extends Error {}

function analizar(argv: string[]): Argumentos {
  const argumentos: Argumentos = {
    binario: undefined,
    salida: undefined,
    timeoutMs: TIEMPO_MAXIMO_POR_DEFECTO_MS,
    etiqueta: undefined,
    ayuda: false,
  };
  for (let indice = 0; indice < argv.length; indice += 1) {
    const opcion = argv[indice] as string;
    if (opcion === "--help" || opcion === "-h") {
      argumentos.ayuda = true;
      continue;
    }
    if (!["--binary", "--out", "--timeout-ms", "--etiqueta"].includes(opcion)) {
      throw new ErrorDeUso(
        `Opción desconocida: ${opcion}. Use --help para ver las disponibles.`,
      );
    }
    const valor = argv[indice + 1];
    if (valor === undefined || valor.startsWith("--")) {
      throw new ErrorDeUso(`La opción ${opcion} requiere un valor.`);
    }
    indice += 1;
    if (opcion === "--binary") argumentos.binario = valor;
    else if (opcion === "--out") argumentos.salida = valor;
    else if (opcion === "--etiqueta") argumentos.etiqueta = valor;
    else {
      const milisegundos = Number(valor);
      if (!Number.isInteger(milisegundos) || milisegundos <= 0) {
        throw new ErrorDeUso("--timeout-ms debe ser un entero positivo.");
      }
      argumentos.timeoutMs = milisegundos;
    }
  }
  return argumentos;
}

function esArchivo(ruta: string): boolean {
  try {
    return statSync(ruta).isFile();
  } catch {
    return false;
  }
}

function fallar(mensaje: string): number {
  process.stderr.write(`Error: ${mensaje}\n`);
  return 2;
}

function listar(recorridos: Recorrido[]): number {
  process.stdout.write(
    recorridos
      .map(
        (recorrido) =>
          `${recorrido.id}  ${recorrido.nombre} — bloquea: ${recorrido.bloquea}\n`,
      )
      .join(""),
  );
  return 0;
}

function leerArchivo(ruta: string): ArchivoDeResultados {
  const absoluta = resolve(ruta);
  if (!esArchivo(absoluta)) throw new ErrorDeUso(`el archivo no existe: ${absoluta}`);
  try {
    return leerResultados(readFileSync(absoluta, "utf8"));
  } catch (error) {
    if (error instanceof ErrorDeResultados) {
      throw new ErrorDeUso(`${absoluta}: ${error.message}`);
    }
    throw error;
  }
}

function contrastar(argumentos: string[]): number {
  const [antes, despues, ...sobrantes] = argumentos;
  if (antes === undefined || despues === undefined || sobrantes.length > 0) {
    return fallar("compare requiere dos archivos: compare <antes.json> <despues.json>.");
  }
  try {
    process.stdout.write(formatear(comparar(leerArchivo(antes), leerArchivo(despues))));
  } catch (error) {
    if (error instanceof ErrorDeUso) return fallar(error.message);
    throw error;
  }
  return 0;
}

/**
 * El punto de entrada. Devuelve el código de salida; no llama a `process.exit`. El corpus
 * que recorren `run` y `list` es `RECORRIDOS`: el segundo parámetro solo lo usan las pruebas.
 */
export function main(argv: string[], recorridos: Recorrido[] = RECORRIDOS): number {
  const [comando, ...resto] = argv;
  if (comando === undefined || comando === "--help" || comando === "-h") {
    process.stdout.write(AYUDA);
    return 0;
  }
  if (comando === "list") return listar(recorridos);
  if (comando === "compare") return contrastar(resto);
  if (comando !== "run") {
    return fallar(`Comando desconocido: ${comando}. Use --help para ver los disponibles.`);
  }

  let argumentos: Argumentos;
  try {
    argumentos = analizar(resto);
  } catch (error) {
    return fallar(error instanceof Error ? error.message : String(error));
  }
  if (argumentos.ayuda) {
    process.stdout.write(AYUDA);
    return 0;
  }
  if (argumentos.binario === undefined) return fallar("falta --binary <ruta>.");
  if (argumentos.salida === undefined) return fallar("falta --out <archivo>.");
  const binario = resolve(argumentos.binario);
  if (!esArchivo(binario)) return fallar(`el binario no existe: ${binario}`);

  const archivo = medir({
    binario,
    recorridos,
    timeoutMs: argumentos.timeoutMs,
    etiqueta: argumentos.etiqueta,
  });
  const salida = resolve(argumentos.salida);
  mkdirSync(dirname(salida), { recursive: true });
  writeFileSync(salida, `${JSON.stringify(archivo, null, 2)}\n`);

  const { totales } = archivo;
  process.stdout.write(
    [
      `Binario: ${archivo.binario.ruta} (sha256 ${archivo.binario.sha256})`,
      `Recorridos: ${String(archivo.recorridos.length)} · en banda: ${String(totales.en_banda)} · fuera de banda: ${String(totales.fuera_de_banda)} · callejones sin salida: ${String(totales.callejon_sin_salida)} · rechazos correctos: ${String(totales.rechazos_correctos)} · no soportados: ${String(totales.no_soportados)} · fallidos: ${String(totales.fallidos)}`,
      `Resultados: ${salida}`,
      "",
    ].join("\n"),
  );
  return totales.fallidos > 0 ? 1 : 0;
}

/**
 * `true` si este módulo corre como programa principal y no importado. Se compara por rutas
 * reales: un binario alcanzado por un enlace simbólico no coincide en crudo.
 */
function esProgramaPrincipal(): boolean {
  const entrada = process.argv[1];
  if (entrada === undefined) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entrada);
  } catch {
    return false;
  }
}

if (esProgramaPrincipal()) {
  process.exitCode = main(process.argv.slice(2));
}
