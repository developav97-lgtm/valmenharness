/**
 * Proponer umbrales a partir de las decisiones humanas registradas (R-CPRE-010).
 *
 * Cada vez que una persona aprueba o rechaza una banda de revisión, el recibo guarda su
 * decisión junto a los valores que dio el evaluador: es la etiqueta contra la que
 * calibrar. Esta función simula qué habría pasado con cada `approve-at` candidato y
 * propone el más laxo que **no aprueba nada que una persona haya rechazado**.
 *
 * Tres reglas, todas sobre el riesgo de aflojar:
 *
 * 1. **No aplica nada.** Devuelve una propuesta y la entrada de configuración sin firma:
 *    aplicar un umbral lo decide una persona, y el motor no escribe `approved-by`.
 * 2. **Sin evidencia no hay propuesta.** Con pocas decisiones, o con pocos rechazos,
 *    «cero falsos aprobados» no significa nada: no hubo ocasión de equivocarse. Se dice
 *    que la evidencia es insuficiente en vez de inventar un número.
 * 3. **No cuesta una llamada.** Lee el registro; no simula con un modelo.
 */
import { type GateReceipt } from "@valmen/gate";

import { esDelegada, inferEvaluator } from "./precision.js";

/** Cuántas decisiones humanas hacen falta para proponer. */
export const MIN_DECISIONES = 20;
/** Cuántos rechazos humanos hacen falta: sin ellos no se puede medir un falso aprobado. */
export const MIN_RECHAZOS = 5;

export interface ThresholdProposal {
  readonly gate: string;
  readonly evaluator: string | null;
  readonly decisions: number;
  readonly approvals: number;
  readonly rejections: number;
  readonly status: "propuesta" | "insuficiente";
  readonly reason: string;
  /** Presente solo con `status: "propuesta"`. */
  readonly proposal?: {
    readonly approveAt: number;
    readonly blockAt: number;
    readonly simulatedAgreement: number;
    readonly falseApproves: number;
    readonly currentApproveAt: number;
    readonly currentAgreement: number;
    readonly currentFalseApproves: number;
  };
}

/** ¿Una proposición vota con un valor? */
function votaConValor(p: GateReceipt["propositions"][number]): boolean {
  return p.verdict && p.kind === "noul";
}

/** Qué decidiría el recibo con un `approve-at` dado: aprueba, revisa o bloquea. */
function simular(recibo: GateReceipt, approveAt: number): "approve" | "review" | "block" {
  const blockAt = recibo.policy.blockAt;
  const votan = recibo.propositions.filter((p) => p.verdict);
  const bloqueaPorValor = votan.some((p) => votaConValor(p) && p.value <= blockAt);
  const bloqueaPorEleccion = votan.some((p) => p.kind !== "noul" && p.effect?.outcome === "block");
  if (bloqueaPorValor || bloqueaPorEleccion) return "block";
  const todoClaro =
    votan.every((p) => (votaConValor(p) ? p.value >= approveAt : p.effect?.outcome === "approve"));
  return todoClaro ? "approve" : "review";
}

/** Acierto y falsos aprobados de un `approve-at` contra las decisiones humanas. */
function medir(
  decididos: readonly GateReceipt[],
  approveAt: number,
): { agreement: number; falseApproves: number } {
  let aciertos = 0;
  let falsos = 0;
  for (const r of decididos) {
    const humanoAprueba = r.humanDecision?.decision === "approve";
    const aprueba = simular(r, approveAt) === "approve";
    if (humanoAprueba === aprueba) aciertos += 1;
    if (aprueba && !humanoAprueba) falsos += 1;
  }
  return { agreement: aciertos / decididos.length, falseApproves: falsos };
}

/** Propone un `approve-at` para una compuerta (y un evaluador) desde las decisiones humanas. */
export function proposeThresholds(
  receipts: readonly GateReceipt[],
  gate: string,
  evaluator?: string,
): ThresholdProposal {
  const decididos = receipts.filter(
    (r) =>
      r.gate === gate &&
      r.humanDecision !== null &&
      // Una decisión del agente por delegación no es una etiqueta humana: calibrar contra
      // las aprobaciones del propio agente sería contarse a sí mismo.
      !esDelegada(r) &&
      r.propositions.some(votaConValor) &&
      (evaluator === undefined || inferEvaluator(r) === evaluator),
  );
  const aprobaciones = decididos.filter((r) => r.humanDecision?.decision === "approve").length;
  const rechazos = decididos.length - aprobaciones;
  const base = {
    gate,
    evaluator: evaluator ?? null,
    decisions: decididos.length,
    approvals: aprobaciones,
    rejections: rechazos,
  };

  if (decididos.length < MIN_DECISIONES || rechazos < MIN_RECHAZOS) {
    return {
      ...base,
      status: "insuficiente",
      reason:
        `evidencia insuficiente: hay ${decididos.length} decisión(es) humana(s) y ${rechazos} ` +
        `rechazo(s); hacen falta ${MIN_DECISIONES} y ${MIN_RECHAZOS}. Con menos rechazos «cero ` +
        "falsos aprobados» no mide nada, y no se propone aflojar un umbral sin poder equivocarse.",
    };
  }

  const actual = decididos[0]?.policy.approveAt ?? 0.9;
  const actualMedida = medir(decididos, actual);
  let mejor: { approveAt: number; agreement: number; falseApproves: number } | null = null;
  for (let centesimas = 50; centesimas <= 99; centesimas++) {
    const approveAt = centesimas / 100;
    const m = medir(decididos, approveAt);
    // El más laxo sin falsos aprobados; entre iguales, el de mayor acierto.
    if (m.falseApproves === 0 && (mejor === null || m.agreement > mejor.agreement)) {
      mejor = { approveAt, ...m };
    }
  }
  if (mejor === null) {
    return {
      ...base,
      status: "insuficiente",
      reason: "ningún umbral entre 0,50 y 0,99 evita aprobar lo que una persona rechazó.",
    };
  }
  return {
    ...base,
    status: "propuesta",
    reason: "el valor más laxo que no aprueba nada de lo que una persona rechazó",
    proposal: {
      approveAt: mejor.approveAt,
      blockAt: decididos[0]?.policy.blockAt ?? 0.1,
      simulatedAgreement: mejor.agreement,
      falseApproves: mejor.falseApproves,
      currentApproveAt: actual,
      currentAgreement: actualMedida.agreement,
      currentFalseApproves: actualMedida.falseApproves,
    },
  };
}

/** La propuesta, para quien decide, con la entrada de configuración **sin firma**. */
export function renderProposal(p: ThresholdProposal): string {
  const lineas = [
    `Propuesta de umbrales — compuerta ${p.gate}${p.evaluator === null ? "" : ` · evaluador ${p.evaluator}`}`,
    `  decisiones humanas: ${p.decisions} (${p.approvals} aprobadas, ${p.rejections} rechazadas)`,
  ];
  if (p.status === "insuficiente" || p.proposal === undefined) {
    lineas.push(`  No se propone ningún valor: ${p.reason}`);
    return `${lineas.join("\n")}\n`;
  }
  const x = p.proposal;
  lineas.push(
    `  propone approve-at ${x.approveAt}: acierto simulado ${(x.simulatedAgreement * 100).toFixed(0)} %, ` +
      `${x.falseApproves} falso(s) aprobado(s)`,
    `  con el actual (${x.currentApproveAt}): acierto ${(x.currentAgreement * 100).toFixed(0)} %, ` +
      `${x.currentFalseApproves} falso(s) aprobado(s)`,
    "",
    "  Es una propuesta: NO se aplicó. Si una persona la acepta, la firma en .valmen/config.yaml:",
    "",
    "    gate-thresholds:",
    `      - gate: ${p.gate}`,
    ...(p.evaluator === null ? [] : [`        evaluator: ${p.evaluator}`]),
    `        approve-at: ${x.approveAt}`,
    `        block-at: ${x.blockAt}`,
    "        # approved-by: <la persona que lo decide>",
    "        # reason: <por qué lo decide, con esta muestra>",
    "",
    "  Sin approved-by y reason, el motor no lo aplica.",
  );
  return `${lineas.join("\n")}\n`;
}
