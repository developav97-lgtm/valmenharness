/**
 * Extracción, clasificación y totales de los bloqueos: funciones puras, sin disco ni procesos.
 *
 * Un bloqueo es una operación que el binario rechazó. Se clasifica por lo que su mensaje
 * le ofrece a quien lo lee:
 *
 * - **en banda**: cita un comando que existe y, al correrlo, la operación deja de estar
 *   bloqueada;
 * - **fuera de banda**: bloquea sin citar una salida;
 * - **callejón sin salida**: cita una salida que no existe o que no saca del bloqueo.
 *
 * Una salida es un comando citado entre comillas invertidas que empieza por `valmen `,
 * la forma que fija la spec s1, o una línea sangrada con dos espacios o más que empieza
 * por `valmen `, la forma en que el motor cita la entrega. Una salida escrita en prosa o
 * en una línea sin sangría no cuenta: quien lee el mensaje no puede copiarla sin
 * interpretarla.
 */
import { resolve, sep } from "node:path";

import type { Clase, IntentoDeSalida, ResultadoDeRecorrido, Totales } from "./tipos.js";

export interface SalidaCitada {
  /** El comando como lo citó el mensaje, con el `valmen` inicial. */
  comando: string;
  /** Sus argumentos, sin el `valmen` y sin las comillas. */
  argv: string[];
}

/** Parte un comando en palabras respetando las comillas simples y dobles. */
function tokenizar(comando: string): string[] {
  const palabras: string[] = [];
  let actual = "";
  let abierta = false;
  let comilla: string | null = null;
  for (const caracter of comando) {
    if (comilla !== null) {
      if (caracter === comilla) comilla = null;
      else actual += caracter;
    } else if (caracter === '"' || caracter === "'") {
      comilla = caracter;
      abierta = true;
    } else if (/\s/.test(caracter)) {
      if (abierta || actual !== "") palabras.push(actual);
      actual = "";
      abierta = false;
    } else {
      actual += caracter;
      abierta = true;
    }
  }
  if (abierta || actual !== "") palabras.push(actual);
  return palabras;
}

/**
 * Cada comando citado entre comillas invertidas que empieza por `valmen `, y cada línea
 * sangrada que empieza por `valmen `. Se devuelven en el orden en que aparecen en el mensaje
 * y un comando citado en las dos formas se devuelve una vez.
 */
export function extraerSalidas(mensaje: string): SalidaCitada[] {
  const encontradas: { posicion: number; comando: string }[] = [];
  for (const coincidencia of mensaje.matchAll(/`([^`\n]+)`/g)) {
    encontradas.push({
      posicion: coincidencia.index,
      comando: (coincidencia[1] ?? "").trim(),
    });
  }
  for (const coincidencia of mensaje.matchAll(/^[ \t]{2,}(valmen\s.*)$/gm)) {
    encontradas.push({
      posicion: coincidencia.index,
      comando: (coincidencia[1] ?? "").trim(),
    });
  }
  const salidas: SalidaCitada[] = [];
  for (const { comando } of encontradas.sort((a, b) => a.posicion - b.posicion)) {
    if (!comando.startsWith("valmen ")) continue;
    if (salidas.some((salida) => salida.comando === comando)) continue;
    salidas.push({ comando, argv: tokenizar(comando).slice(1) });
  }
  return salidas;
}

/**
 * Reemplaza cada marcador `<X>` por `variables.X`. Un marcador sin variable queda como
 * está y se devuelve en `sinResolver`: la salida que lo lleva no se puede correr.
 */
export function resolverMarcadores(
  argv: string[],
  variables: Record<string, string> = {},
): { argv: string[]; sinResolver: string[] } {
  const sinResolver: string[] = [];
  const resuelto = argv.map((token) =>
    token.replace(/<([A-Za-z_][A-Za-z0-9_-]*)>/g, (marcador, nombre: string) => {
      if (Object.hasOwn(variables, nombre)) return variables[nombre] ?? marcador;
      if (!sinResolver.includes(nombre)) sinResolver.push(nombre);
      return marcador;
    }),
  );
  return { argv: resuelto, sinResolver };
}

/**
 * El primer token que es una ruta absoluta fuera de la raíz del escenario, o `null`.
 * También mira el valor de una bandera `--nombre=/ruta`. Correr esa salida podría tocar
 * lo que no es del escenario, y eso es lo que el aislamiento promete no hacer.
 */
export function fueraDelEscenario(argv: string[], raiz: string): string | null {
  for (const token of argv) {
    const candidato =
      token.startsWith("--") && token.includes("=")
        ? token.slice(token.indexOf("=") + 1)
        : token;
    if (!candidato.startsWith("/")) continue;
    const ruta = resolve(candidato);
    if (ruta !== raiz && !ruta.startsWith(raiz + sep)) return candidato;
  }
  return null;
}

/** El binario rechazó el comando por no existir: lo dicen los dos textos del CLI. */
export function esComandoDesconocido(stderr: string): boolean {
  return /Comando (?:de escritura )?desconocido/.test(stderr);
}

/** El binario rechazó una bandera que no declara para el comando: «La bandera X no existe para». */
export function esBanderaDesconocida(stderr: string): boolean {
  return /La bandera \S+ no existe para/.test(stderr);
}

function motivoDelIntento(intento: IntentoDeSalida): string {
  if (!intento.ejecutada) return "la salida no se ejecutó";
  if (intento.codigoSalida !== 0)
    return `la salida falla con ${String(intento.codigoSalida)}`;
  return `tras la salida la operación sigue bloqueada con ${String(intento.codigoReintento)}`;
}

/**
 * La clase de un bloqueo según los intentos de sus salidas. Basta una salida que destrabe
 * para que sea en banda. Si ninguna lo hace, el motivo es el del primer intento.
 */
export function clasificar(intentos: IntentoDeSalida[]): { clase: Clase; motivo: string } {
  if (intentos.length === 0) {
    return { clase: "fuera_de_banda", motivo: "el mensaje no cita ninguna salida" };
  }
  const destraba = intentos.find(
    (intento) =>
      intento.ejecutada && intento.codigoSalida === 0 && intento.codigoReintento === 0,
  );
  if (destraba !== undefined) {
    return { clase: "en_banda", motivo: `\`${destraba.comando}\` destraba la operación` };
  }
  const primero = intentos[0] as IntentoDeSalida;
  return {
    clase: "callejon_sin_salida",
    motivo: primero.motivo ?? motivoDelIntento(primero),
  };
}

/**
 * Cuenta los resultados. Un rechazo que el diseño declara correcto suma solo en
 * `rechazos_correctos`: no es fricción, aunque su clase diga lo contrario.
 */
export function totalizar(resultados: ResultadoDeRecorrido[]): Totales {
  const totales: Totales = {
    en_banda: 0,
    fuera_de_banda: 0,
    callejon_sin_salida: 0,
    rechazos_correctos: 0,
    fallidos: 0,
    no_soportados: 0,
  };
  for (const resultado of resultados) {
    if (resultado.estado === "fallido") totales.fallidos += 1;
    else if (resultado.estado === "no_soportado") totales.no_soportados += 1;
    else if (resultado.bloqueo === null) continue;
    else if (resultado.bloqueo.rechazoCorrecto !== null) totales.rechazos_correctos += 1;
    else totales[resultado.bloqueo.clase] += 1;
  }
  return totales;
}
