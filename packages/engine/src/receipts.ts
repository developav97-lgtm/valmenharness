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

import { type JsonObject } from "@valmen/core";
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

/** Qué dice una compuerta sobre el ticket, según su último recibo. */
export type VeredictoDeCompuerta =
  | { readonly tipo: "sin-recibo" }
  | { readonly tipo: "bloqueada"; readonly recibo: GateReceipt }
  | { readonly tipo: "espera-persona"; readonly recibo: GateReceipt }
  | { readonly tipo: "aprobada"; readonly recibo: GateReceipt };

/**
 * Lo que dice el último recibo de una compuerta.
 *
 * La decisión humana manda sobre el veredicto del evaluador, porque el registro es
 * append-only y la decisión se anexa después: una persona que aprobó una banda de
 * revisión o un bloqueo la deja aprobada, y una que rechazó un «approve» la deja
 * bloqueada. Sin decisión humana, un recibo escalado espera a una persona aunque su
 * veredicto sea `approve`: es el modo por defecto de una compuerta.
 *
 * Es la misma lectura que orienta al agente (`next-step`) y la que `transition`
 * impone al entrar a `planned` y `approved` (R-CDEF-004): lo que se le dice al
 * agente y lo que el motor le exige no pueden divergir.
 */
export function veredictoDeCompuerta(
  recibos: readonly GateReceipt[],
  compuerta: string,
): VeredictoDeCompuerta {
  // `currentReceipts` devuelve del más nuevo al más viejo, ya con la decisión humana
  // colapsada sobre su recibo.
  const recibo = currentReceipts(recibos).find((candidato) => candidato.gate === compuerta);
  if (recibo === undefined) return { tipo: "sin-recibo" };
  if (recibo.humanDecision !== null) {
    return recibo.humanDecision.decision === "approve"
      ? { tipo: "aprobada", recibo }
      : { tipo: "bloqueada", recibo };
  }
  if (recibo.outcome === "block") return { tipo: "bloqueada", recibo };
  if (recibo.escalatedTo === "human" || recibo.outcome === "review") {
    return { tipo: "espera-persona", recibo };
  }
  return { tipo: "aprobada", recibo };
}

/** Las acciones con las que el ticket guarda una decisión humana sobre una compuerta. */
const ACCIONES_DE_DECISION = ["gate-approved", "gate-rejected"];

/**
 * El texto del evento que deja una decisión humana en el ticket.
 *
 * Es **uno solo** para quien decide (`recordHumanDecision`) y para quien avanza
 * (`transition`, cuando la decisión estaba solo en el recibo): si fueran dos
 * redacciones, `tieneEventoDeDecision` no podría reconocer la de la otra. Lleva el
 * actor, la frase, el canal y la fecha de la decisión, y cita el recibo con la
 * forma `(recibo <id>,` que esa búsqueda espera. Sin frase lo dice, en vez de
 * dejar un hueco que se lea como una frase vacía.
 */
export function describirDecisionHumana(
  recibo: Pick<GateReceipt, "id" | "gate" | "outcome">,
  decision: NonNullable<GateReceipt["humanDecision"]>,
): string {
  const aprobada = decision.decision === "approve";
  const pese = aprobada && recibo.outcome === "block" ? " pese al bloqueo" : "";
  const frase =
    decision.reason.trim() === "" ? "sin frase registrada" : decision.reason.trim();
  return (
    `Gate ${recibo.gate} ${aprobada ? "aprobado" : "rechazado"} por ${decision.actor}${pese} ` +
    `(recibo ${recibo.id}, canal ${decision.channel}, decidida ${decision.decidedAt}): ${frase}`
  );
}

/** `true` si el ticket ya guarda un evento de decisión humana que cita ese recibo. */
export function tieneEventoDeDecision(
  eventos: readonly JsonObject[],
  recibo: Pick<GateReceipt, "id">,
): boolean {
  const cita = `(recibo ${recibo.id},`;
  return eventos.some(
    (evento) =>
      ACCIONES_DE_DECISION.includes(String(evento["action"])) &&
      String(evento["details"]).includes(cita),
  );
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
