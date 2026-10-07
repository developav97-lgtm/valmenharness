/**
 * Las casillas de los criterios de aceptación (R-CTRL-004).
 *
 * Un ticket cerrado con un criterio sin marcar afirma dos cosas a la vez: que está
 * aprobado y que hay un criterio que nadie miró. La skill de entrega pide marcarlos;
 * esto lo hace cumplir y ayuda a cumplirlo:
 *
 * 1. **El cierre exige** que cada criterio esté marcado `[x]` o declare «no aplica» con su
 *    motivo.
 * 2. **El recibo marca**: un criterio con `test:` que el último recibo de `qa-mechanical`
 *    pasó se marca solo al preparar el cierre, y el evento cita el recibo.
 * 3. **Un criterio manual no lo marca el agente.** Solo con las palabras literales de quien
 *    lo probó, que quedan en el evento.
 */
import { MutationLock, fail, parseTicket } from "@valmen/core";
import { type GateReceipt, extractCriteriaSpecs } from "@valmen/gate";

import { type RegistryPaths, findTicket } from "./discovery.js";
import { finalizeMutation, readAndValidate } from "./mutate.js";

/** Un criterio con casilla, tal como está en el texto del ticket. */
export interface CriterionBox {
  /** La línea (0-based) del texto completo del ticket donde está la casilla. */
  readonly line: number;
  readonly checked: boolean;
  /** El texto de la primera línea del criterio, sin la casilla. */
  readonly text: string;
  /** Todo el texto del criterio, con sus líneas de continuación y sin comentarios. */
  readonly full: string;
}

const CASILLA_RE = /^(\s*[-*+]\s+)\[([ xX])\](\s*)(.*)$/;

/** Los criterios con casilla de la sección «Criterios de aceptación». */
export function criterionBoxes(ticketText: string): CriterionBox[] {
  const lineas = ticketText.split("\n");
  const inicio = lineas.findIndex((l) => /^##\s+Criterios de aceptación\s*$/.test(l));
  if (inicio === -1) return [];
  let fin = lineas.length;
  for (let i = inicio + 1; i < lineas.length; i++) {
    if (/^##\s+\S/.test(lineas[i] as string)) {
      fin = i;
      break;
    }
  }
  const cajas: CriterionBox[] = [];
  for (let i = inicio + 1; i < fin; i++) {
    const m = CASILLA_RE.exec(lineas[i] as string);
    if (m === null) continue;
    const partes = [m[4] as string];
    for (let j = i + 1; j < fin; j++) {
      const sig = lineas[j] as string;
      if (sig.trim() === "" || CASILLA_RE.test(sig) || /^\s*[-*+]\s/.test(sig)) break;
      partes.push(sig.trim());
    }
    cajas.push({
      line: i,
      checked: (m[2] as string).toLowerCase() === "x",
      text: (m[4] as string).trim(),
      full: partes
        .join(" ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    });
  }
  return cajas;
}

/** ¿El criterio declara «no aplica» con un motivo de al menos ocho caracteres? */
export function declaresNotApplicable(box: CriterionBox): boolean {
  // El motivo llega hasta el cierre del paréntesis, el punto o el punto y coma: un `x)`
  // seguido de más texto del criterio no es un motivo de ocho caracteres.
  return /no aplica\s*[:—-]\s*[^).;]{8,}/i.test(box.full);
}

/** Los criterios sin marcar que no declaran «no aplica» con su motivo. */
export function unmarkedCriteria(ticketText: string): CriterionBox[] {
  return criterionBoxes(ticketText).filter((c) => !c.checked && !declaresNotApplicable(c));
}

/** El mensaje con el que el cierre rechaza un ticket con criterios sin marcar. */
export function unmarkedMessage(unmarked: readonly CriterionBox[]): string {
  const primero = unmarked[0];
  if (primero === undefined) return "";
  const resto = unmarked.length - 1;
  return (
    `closed requiere que cada criterio esté marcado con [x] o declare «no aplica: <motivo>». ` +
    `Falta marcar «${primero.text.slice(0, 100)}»` +
    (resto > 0 ? ` y ${resto} más` : "") +
    ". Los criterios con `test:` se marcan al preparar el cierre desde el recibo de " +
    "`qa-mechanical`; uno `verify: manual` lo marca quien lo probó, con sus palabras."
  );
}

/** Lo que `markFromReceipt` devuelve: el texto nuevo y qué marcó. */
export interface MarkResult {
  readonly text: string;
  readonly marked: readonly { readonly index: number; readonly text: string }[];
}

const normalizar = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * Marca `[x]` los criterios con `test:` que el recibo de `qa-mechanical` pasó.
 *
 * Un criterio se marca solo si su proposición `criterio_NN` aprobó en el recibo **y** su
 * descripción coincide con el texto del criterio: uno cambiado después del recibo no se
 * marca, porque lo que el recibo comprobó ya no es lo que dice el ticket.
 */
export function markFromReceipt(ticketText: string, receipt: GateReceipt | undefined): MarkResult {
  if (receipt === undefined) return { text: ticketText, marked: [] };
  const seccion = parseTicket(ticketText).sections["Criterios de aceptación"];
  const specs = extractCriteriaSpecs(seccion);
  const cajas = criterionBoxes(ticketText);
  const lineas = ticketText.split("\n");
  const marcados: { index: number; text: string }[] = [];

  specs.forEach((spec, indice) => {
    if (spec.command === null) return;
    const proposicion = receipt.propositions.find(
      (p) => p.id === `criterio_${String(indice + 1).padStart(2, "0")}`,
    );
    if (proposicion === undefined || proposicion.effect?.outcome !== "approve") return;
    if (normalizar(proposicion.description ?? "") !== normalizar(spec.text)) return;
    const caja = cajas.find(
      (c) => !c.checked && normalizar(c.text).startsWith(normalizar(spec.text).slice(0, 40)),
    );
    if (caja === undefined) return;
    lineas[caja.line] = (lineas[caja.line] as string).replace(/\[ \]/, "[x]");
    marcados.push({ index: indice + 1, text: spec.text });
  });
  return { text: lineas.join("\n"), marked: marcados };
}

/**
 * Marca los criterios `verify: manual` con la confirmación literal de quien los probó.
 *
 * Un criterio manual es el que solo una persona puede verificar: el agente no lo marca por
 * su cuenta. Con las palabras de quien confirma —el PO— quedan marcados y el evento las
 * guarda.
 */
export function markManualCriteria(
  paths: RegistryPaths,
  ticketId: string,
  confirmation: string,
  now?: () => Date,
): number {
  const palabras = confirmation.trim();
  if (palabras === "") {
    fail("Marcar un criterio manual exige las palabras literales de quien lo probó.");
  }
  return MutationLock.run(paths.root, () => {
    const located = findTicket(paths, ticketId);
    if (located === undefined) fail("La ruta canónica solicitada no existe.");
    const document = readAndValidate(paths, located);
    const specs = extractCriteriaSpecs(document.sections["Criterios de aceptación"]);
    const cajas = criterionBoxes(document.text);
    const lineas = document.text.split("\n");
    const marcados: string[] = [];
    for (const spec of specs.filter((s) => s.manual)) {
      const caja = cajas.find(
        (c) => !c.checked && normalizar(c.text).startsWith(normalizar(spec.text).slice(0, 40)),
      );
      if (caja === undefined) continue;
      lineas[caja.line] = (lineas[caja.line] as string).replace(/\[ \]/, "[x]");
      marcados.push(spec.text);
    }
    if (marcados.length === 0) return 0;
    finalizeMutation({
      paths,
      located,
      document,
      text: lineas.join("\n"),
      action: "criteria-marked",
      details:
        `Criterio(s) manual(es) marcado(s) por la confirmación de quien los probó (${marcados.length}): ` +
        `${marcados.map((t) => `«${t.slice(0, 60)}»`).join(", ")}. Palabras: «${palabras}»`,
      ...(now === undefined ? {} : { now }),
    });
    return marcados.length;
  });
}
