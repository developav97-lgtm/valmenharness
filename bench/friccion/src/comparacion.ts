/**
 * La comparación de dos archivos de resultados: funciones puras, sin disco ni procesos.
 *
 * `compare` muestra; no decide si la fricción empeoró. Recalcula los totales desde los
 * recorridos de cada archivo en vez de leer `totales`, así que lee también los que escribió una
 * versión anterior de la medición, que no traían `totales.no_soportados`.
 */
import { totalizar } from "./clasificador.js";
import type { ArchivoDeResultados, ResultadoDeRecorrido, Totales } from "./tipos.js";

/** El texto no es un archivo de resultados que esta medición sepa leer. */
export class ErrorDeResultados extends Error {}

const ESTADOS = ["medido", "fallido", "no_soportado"];
const CLASES = ["en_banda", "fuera_de_banda", "callejon_sin_salida"];

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Lo mínimo que `compare` necesita de un recorrido; lo demás del archivo no se mira. */
function esResultadoDeRecorrido(valor: unknown): valor is ResultadoDeRecorrido {
  if (!esObjeto(valor)) return false;
  if (typeof valor["id"] !== "string") return false;
  if (typeof valor["estado"] !== "string" || !ESTADOS.includes(valor["estado"]))
    return false;
  const bloqueo = valor["bloqueo"];
  if (bloqueo === null) return true;
  return (
    esObjeto(bloqueo) &&
    typeof bloqueo["clase"] === "string" &&
    CLASES.includes(bloqueo["clase"]) &&
    (bloqueo["rechazoCorrecto"] === null || esObjeto(bloqueo["rechazoCorrecto"]))
  );
}

/** Lee un archivo de resultados: `version: 1` y la forma mínima. Si no lo es, lanza. */
export function leerResultados(texto: string): ArchivoDeResultados {
  let contenido: unknown;
  try {
    contenido = JSON.parse(texto);
  } catch {
    throw new ErrorDeResultados("no es un archivo de resultados: no es JSON.");
  }
  if (!esObjeto(contenido) || contenido["version"] !== 1) {
    throw new ErrorDeResultados(
      'no es un archivo de resultados con "version": 1, el único que esta medición lee.',
    );
  }
  const corpus = contenido["corpus"];
  const recorridos = contenido["recorridos"];
  if (
    !esObjeto(corpus) ||
    typeof corpus["sha256"] !== "string" ||
    !Array.isArray(recorridos) ||
    !recorridos.every(esResultadoDeRecorrido)
  ) {
    throw new ErrorDeResultados(
      "no es un archivo de resultados: le falta el hash del corpus o la lista de recorridos con su estado.",
    );
  }
  return contenido as unknown as ArchivoDeResultados;
}

/** Lo que se muestra de un recorrido: su clase, o su estado si no hay bloqueo que clasificar. */
function etiquetaDe(resultado: ResultadoDeRecorrido | undefined): string {
  if (resultado === undefined) return "ausente";
  if (resultado.estado !== "medido") return resultado.estado;
  if (resultado.bloqueo === null) return "sin_bloqueo";
  if (resultado.bloqueo.rechazoCorrecto !== null) return "rechazo_correcto";
  return resultado.bloqueo.clase;
}

export interface FilaDeComparacion {
  id: string;
  antes: string;
  despues: string;
}

export interface TotalComparado {
  total: keyof Totales;
  antes: number;
  despues: number;
  diferencia: number;
}

export interface Comparacion {
  antes: ArchivoDeResultados;
  despues: ArchivoDeResultados;
  filas: FilaDeComparacion[];
  totales: TotalComparado[];
  avisos: string[];
}

const NOMBRES_DE_TOTALES: (keyof Totales)[] = [
  "en_banda",
  "fuera_de_banda",
  "callejon_sin_salida",
  "rechazos_correctos",
  "fallidos",
  "no_soportados",
];

/**
 * Una fila por recorrido sobre la unión de los ids —primero los de `antes`, en su orden, y
 * después los que solo trae `despues`—, y los totales de cada lado recalculados.
 */
export function comparar(
  antes: ArchivoDeResultados,
  despues: ArchivoDeResultados,
): Comparacion {
  const deAntes = new Map(antes.recorridos.map((resultado) => [resultado.id, resultado]));
  const deDespues = new Map(
    despues.recorridos.map((resultado) => [resultado.id, resultado]),
  );
  const ids = [...new Set([...deAntes.keys(), ...deDespues.keys()])];

  const totalesAntes = totalizar(antes.recorridos);
  const totalesDespues = totalizar(despues.recorridos);

  const avisos: string[] = [];
  if (antes.corpus.sha256 !== despues.corpus.sha256) {
    avisos.push(
      `los corpus difieren (sha256 ${antes.corpus.sha256} contra ${despues.corpus.sha256}): las dos corridas pueden no haber medido los mismos recorridos.`,
    );
  }

  return {
    antes,
    despues,
    filas: ids.map((id) => ({
      id,
      antes: etiquetaDe(deAntes.get(id)),
      despues: etiquetaDe(deDespues.get(id)),
    })),
    totales: NOMBRES_DE_TOTALES.map((total) => ({
      total,
      antes: totalesAntes[total],
      despues: totalesDespues[total],
      diferencia: totalesDespues[total] - totalesAntes[total],
    })),
    avisos,
  };
}

function conSigno(numero: number): string {
  return numero > 0 ? `+${String(numero)}` : String(numero);
}

function describir(nombre: string, archivo: ArchivoDeResultados): string {
  const etiqueta = archivo.binario.etiqueta === null ? "" : `, ${archivo.binario.etiqueta}`;
  return `${nombre} ${archivo.binario.ruta} (sha256 ${archivo.binario.sha256}${etiqueta}, ${archivo.fecha})`;
}

/** La comparación como texto: encabezado, avisos, una línea por recorrido y los totales. */
export function formatear(comparacion: Comparacion): string {
  const anchoDelId = Math.max(
    "Recorrido".length,
    ...comparacion.filas.map((f) => f.id.length),
  );
  const anchoDeAntes = Math.max(
    "Antes".length,
    ...comparacion.filas.map((f) => f.antes.length),
  );
  const anchoDelTotal = Math.max(
    "Total".length,
    ...comparacion.totales.map((t) => t.total.length),
  );
  const columna = (texto: string, ancho: number): string => texto.padEnd(ancho + 2);

  return [
    describir("Antes:  ", comparacion.antes),
    describir("Después:", comparacion.despues),
    ...comparacion.avisos.map((aviso) => `Aviso: ${aviso}`),
    "",
    `${columna("Recorrido", anchoDelId)}${columna("Antes", anchoDeAntes)}Después`,
    ...comparacion.filas.map(
      (fila) =>
        `${columna(fila.id, anchoDelId)}${columna(fila.antes, anchoDeAntes)}${fila.despues}`,
    ),
    "",
    `${columna("Total", anchoDelTotal)}${columna("Antes", 7)}${columna("Después", 9)}Diferencia`,
    ...comparacion.totales.map(
      (t) =>
        `${columna(t.total, anchoDelTotal)}${columna(String(t.antes), 7)}${columna(String(t.despues), 9)}${conSigno(t.diferencia)}`,
    ),
    "",
  ].join("\n");
}
