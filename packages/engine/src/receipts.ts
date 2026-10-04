/**
 * Lectura y escritura de recibos en disco.
 *
 * Los recibos viven en `.valmen/receipts/<ticket>.jsonl`, una línea por recibo.
 * Es un registro **append-only**: un recibo emitido no se modifica nunca. La
 * decisión humana sobre un gate escalado se anexa como una línea nueva con el
 * mismo `id`, en vez de reescribir la anterior, porque saber que el modelo dudó
 * y una persona aprobó es información, no ruido.
 *
 * Eso obliga a que leer "el recibo" sea leer el último con ese identificador.
 * `readReceipts` devuelve el registro tal cual —la historia completa— y
 * `currentReceipts` colapsa cada identificador a su última versión. Confundir
 * las dos cosas mostraría en pantalla una aprobación humana como si no
 * existiera.
 *
 * Y "ese identificador" tiene que nombrar **la corrida**, no el día: el formato
 * `GR-<fecha>-<compuerta>` se compartía entre reintentos del mismo gate del mismo
 * ticket y entre tickets distintos que corrían el mismo gate el mismo día, así
 * que el colapso —que existe para que la decisión humana no borre el veredicto
 * del modelo— terminaba borrando corridas enteras y cruzando tickets. El formato
 * nuevo es `GR-<fecha>-<ticket>-<compuerta>-<n>`, con el número de intento, y el viejo se
 * sigue leyendo.
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { type GateReceipt } from "@valmen/gate";

import { type RegistryPaths } from "./discovery.js";

/** Ruta del registro de recibos de un ticket. */
export function receiptsPath(paths: RegistryPaths, ticketId: string): string {
  return join(paths.root, ".valmen", "receipts", `${ticketId}.jsonl`);
}

/**
 * Lee el registro completo, en orden de escritura.
 *
 * Una línea ilegible no se salta en silencio: un recibo corrupto es
 * exactamente lo que hay que ver, y descartarlo dejaría la historia
 * aparentemente completa.
 */
export function readReceipts(paths: RegistryPaths, ticketId: string): GateReceipt[] {
  let text: string;
  try {
    text = readFileSync(receiptsPath(paths, ticketId), "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as GateReceipt);
}

/**
 * Colapsa el registro a la versión vigente de cada recibo, del más nuevo al más
 * viejo.
 *
 * Se conserva la posición de la primera aparición y se queda el último estado:
 * el orden del registro es cronológico y invertirlo no debe depender de en qué
 * línea quedó la decisión humana.
 *
 * La clave es **la corrida** —identificador y sujeto, porque un identificador es
 * único dentro de un ticket—, no solo el identificador. Los recibos viejos, con
 * id sin ticket ni intento, comparten identificador entre tickets distintos, y
 * colapsar solo por él perdía las corridas de todos menos uno. Los que no traen
 * sujeto legible se agrupan por su identificador, que es la única clave que
 * tienen.
 */
export function currentReceipts(receipts: readonly GateReceipt[]): GateReceipt[] {
  const porCorrida = new Map<string, GateReceipt>();
  for (const recibo of receipts) porCorrida.set(claveDeCorrida(recibo), recibo);
  return [...porCorrida.values()].reverse();
}

/**
 * La clave de corrida de un recibo.
 *
 * Incluye el sujeto porque el identificador viejo no lo nombra: dos tickets que
 * corrieron el mismo gate el mismo día comparten `GR-<fecha>-<compuerta>`, y sin
 * el sujeto en la clave el colapso los mezclaría. Se usa el separador nulo, que
 * no puede aparecer en un identificador de ticket ni de recibo.
 */
export function claveDeCorrida(receipt: GateReceipt): string {
  const subject = receipt.subject;
  if (subject === undefined || subject === null) return receipt.id;
  return `${receipt.id}\u0000${subject.type}\u0000${subject.id}`;
}

/**
 * El sujeto de una clave de corrida.
 *
 * Es la inversa de `claveDeCorrida`: la clave se arma para agrupar, y al comparar
 * contra el veredicto humano hay que volver al identificador del ticket, que es
 * como las referencias están indexadas. Una clave sin sujeto —un recibo viejo sin
 * `subject`— se devuelve tal cual.
 */
export function ticketDeClave(clave: string): string {
  const partes = clave.split("\u0000");
  return partes.length >= 3 ? (partes[2] ?? clave) : clave;
}

/**
 * Anexa un recibo.
 *
 * Se usa `appendFileSync` y no una escritura atómica a propósito: el archivo es
 * un log, y reemplazarlo entero para añadir una línea haría que dos escritores
 * concurrentes se pisaran. Una línea corta escrita con `O_APPEND` no se
 * entrelaza.
 */
export function appendReceipt(
  paths: RegistryPaths,
  ticketId: string,
  receipt: GateReceipt,
): string {
  const path = receiptsPath(paths, ticketId);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(receipt)}\n`, "utf8");
  return path;
}
