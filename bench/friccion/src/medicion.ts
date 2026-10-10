/**
 * La medición: arma cada recorrido en un escenario aislado, corre la operación que bloquea,
 * prueba cada salida que el mensaje cita y clasifica el bloqueo.
 *
 * Cada recorrido termina en uno de dos estados. `medido`: la operación corrió y, si
 * bloqueó, el bloqueo está clasificado. `fallido`: no se pudo medir —un paso del armado
 * salió distinto de 0, un subproceso agotó su tiempo o el binario llamó a un modelo—, y el
 * motivo dice cuál. Un recorrido fallido no oculta un bloqueo: no tiene ninguno que contar.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

import {
  correrBinario,
  correrGit,
  crearEscenario,
  limpiarEscenario,
  llamadasAModelo,
} from "./aislamiento.js";
import type { Escenario, Salida } from "./aislamiento.js";
import {
  clasificar,
  esComandoDesconocido,
  extraerSalidas,
  fueraDelEscenario,
  resolverMarcadores,
  totalizar,
} from "./clasificador.js";
import type { SalidaCitada } from "./clasificador.js";
import type {
  ArchivoDeResultados,
  Bloqueo,
  IntentoDeSalida,
  PasoDeArmado,
  Recorrido,
  ResultadoDeRecorrido,
} from "./tipos.js";

/** Un recorrido que no se pudo medir. Su mensaje es el motivo que queda en el resultado. */
class FalloDeRecorrido extends Error {}

function sha256(contenido: string | Buffer): string {
  return createHash("sha256").update(contenido).digest("hex");
}

function describirPaso(paso: PasoDeArmado): string {
  if ("binario" in paso) return `binario ${paso.binario.join(" ")}`;
  if ("git" in paso) return `git ${paso.git.join(" ")}`;
  return `archivo ${paso.archivo.ruta}`;
}

/** Lo que deja un recorrido fallido, venga de donde venga la salida de un subproceso. */
function verificar(
  escenario: Escenario,
  salida: Salida,
  timeoutMs: number,
  contexto: string,
): void {
  const llamadas = llamadasAModelo(escenario);
  if (llamadas.length > 0) {
    throw new FalloDeRecorrido(
      `llamó a un CLI de modelo en ${contexto}: ${llamadas[0] ?? ""}`,
    );
  }
  if (salida.agotado) {
    throw new FalloDeRecorrido(`tiempo agotado (${String(timeoutMs)} ms) en ${contexto}`);
  }
  if (salida.status === null) {
    throw new FalloDeRecorrido(
      `el proceso no terminó con un código en ${contexto}: ${salida.error ?? "lo terminó una señal"}`,
    );
  }
}

function correr(
  escenario: Escenario,
  binario: string,
  argumentos: string[],
  timeoutMs: number,
  contexto: string,
): Salida {
  const salida = correrBinario(escenario, binario, argumentos, timeoutMs);
  verificar(escenario, salida, timeoutMs, contexto);
  return salida;
}

function primeraLinea(texto: string): string {
  return texto.trim().split("\n")[0] ?? "";
}

/** Deja el escenario en el estado donde la operación bloquea. */
function armar(
  escenario: Escenario,
  binario: string,
  recorrido: Recorrido,
  timeoutMs: number,
): void {
  recorrido.armado.forEach((paso, indice) => {
    const descripcion = `paso ${String(indice + 1)} (${describirPaso(paso)})`;
    if ("archivo" in paso) {
      const destino = resolve(escenario.proyecto, paso.archivo.ruta);
      if (!destino.startsWith(escenario.proyecto + sep)) {
        throw new FalloDeRecorrido(
          `el armado falló en el ${descripcion}: la ruta sale del escenario`,
        );
      }
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, paso.archivo.contenido);
      return;
    }
    const contexto = `el armado, ${descripcion}`;
    let salida: Salida;
    if ("git" in paso) {
      salida = correrGit(escenario, paso.git, timeoutMs);
      verificar(escenario, salida, timeoutMs, contexto);
    } else {
      salida = correr(escenario, binario, paso.binario, timeoutMs, contexto);
    }
    if (salida.status !== 0) {
      throw new FalloDeRecorrido(
        `el armado falló en el ${descripcion}: código ${String(salida.status)}: ${primeraLinea(
          salida.stderr || salida.stdout,
        )}`,
      );
    }
  });
}

/**
 * Mide un recorrido contra el binario. Nunca lanza: lo que impida medir queda como un
 * recorrido `fallido` con su motivo.
 */
export function medirRecorrido(
  binario: string,
  recorrido: Recorrido,
  timeoutMs: number,
): ResultadoDeRecorrido {
  const identidad = { id: recorrido.id, nombre: recorrido.nombre };
  let escenario: Escenario | undefined;

  /** Cada salida se prueba en un escenario nuevo, en la misma ruta: ninguna ve lo que dejó otra. */
  const reconstruir = (): Escenario => {
    const raiz = (escenario as Escenario).raiz;
    limpiarEscenario(escenario as Escenario);
    escenario = crearEscenario(raiz);
    return escenario;
  };

  const probar = (salida: SalidaCitada): IntentoDeSalida => {
    const sinCorrer = (motivo: string): IntentoDeSalida => ({
      comando: salida.comando,
      ejecutada: false,
      motivo,
      codigoSalida: null,
      codigoReintento: null,
    });

    const { argv, sinResolver } = resolverMarcadores(salida.argv, recorrido.variables);
    if (sinResolver.length > 0) {
      return sinCorrer(
        `marcador sin resolver: ${sinResolver.map((n) => `<${n}>`).join(", ")}`,
      );
    }
    const fuera = fueraDelEscenario(argv, (escenario as Escenario).raiz);
    if (fuera !== null) return sinCorrer(`fuera del escenario: ${fuera}`);

    const limpio = reconstruir();
    armar(limpio, binario, recorrido, timeoutMs);
    correr(limpio, binario, recorrido.operacion, timeoutMs, "la operación");
    const corrida = correr(
      limpio,
      binario,
      argv,
      timeoutMs,
      `la salida \`${salida.comando}\``,
    );

    const intento = (motivo: string | null, reintento: number | null): IntentoDeSalida => ({
      comando: salida.comando,
      ejecutada: true,
      motivo,
      codigoSalida: corrida.status,
      codigoReintento: reintento,
    });
    if (esComandoDesconocido(corrida.stderr)) return intento("no existe", null);
    if (corrida.status !== 0) {
      return intento(`la salida falla con ${String(corrida.status)}`, null);
    }
    const reintento = correr(
      limpio,
      binario,
      recorrido.reintento ?? recorrido.operacion,
      timeoutMs,
      "el reintento",
    );
    return intento(
      reintento.status === 0
        ? null
        : `tras la salida la operación sigue bloqueada con ${String(reintento.status)}`,
      reintento.status,
    );
  };

  try {
    escenario = crearEscenario();
    armar(escenario, binario, recorrido, timeoutMs);
    const operacion = correr(
      escenario,
      binario,
      recorrido.operacion,
      timeoutMs,
      "la operación",
    );
    if (operacion.status === 0) {
      return { ...identidad, estado: "medido", motivo: null, bloqueo: null };
    }

    const mensaje = (
      operacion.stderr.trim() !== "" ? operacion.stderr : operacion.stdout
    ).trim();
    const salidas = extraerSalidas(mensaje).map(probar);
    const { clase, motivo } = clasificar(salidas);
    const bloqueo: Bloqueo = {
      codigo: operacion.status as number,
      mensaje,
      salidas,
      clase,
      motivo,
      rechazoCorrecto: recorrido.rechazoCorrecto ?? null,
    };
    return { ...identidad, estado: "medido", motivo: null, bloqueo };
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    return { ...identidad, estado: "fallido", motivo, bloqueo: null };
  } finally {
    if (escenario !== undefined) limpiarEscenario(escenario);
  }
}

export interface OpcionesDeMedicion {
  /** Ruta del binario `valmen` que se mide. */
  binario: string;
  recorridos: Recorrido[];
  /** Tiempo máximo de cada subproceso. */
  timeoutMs: number;
  etiqueta?: string | null | undefined;
  ahora?: Date | undefined;
}

/** Mide todos los recorridos y arma el archivo de resultados. */
export function medir(opciones: OpcionesDeMedicion): ArchivoDeResultados {
  const ruta = realpathSync(opciones.binario);
  const resultados = opciones.recorridos.map((recorrido) =>
    medirRecorrido(ruta, recorrido, opciones.timeoutMs),
  );
  return {
    version: 1,
    fecha: (opciones.ahora ?? new Date()).toISOString(),
    binario: {
      ruta,
      sha256: sha256(readFileSync(ruta)),
      etiqueta: opciones.etiqueta ?? null,
    },
    corpus: {
      sha256: sha256(JSON.stringify(opciones.recorridos)),
      recorridos: opciones.recorridos.map((recorrido) => recorrido.id),
    },
    recorridos: resultados,
    totales: totalizar(resultados),
  };
}
