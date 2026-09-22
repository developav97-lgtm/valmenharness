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
 */
export function currentReceipts(receipts: readonly GateReceipt[]): GateReceipt[] {
  const porId = new Map<string, GateReceipt>();
  for (const recibo of receipts) porId.set(recibo.id, recibo);
  return [...porId.values()].reverse();
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
