/**
 * La calibración de un gate: cuánto coincide con la decisión humana.
 *
 * Es el criterio de aceptación de la Fase 3 —«sobre los últimos 30 tickets
 * cerrados, el veredicto automático coincide con el humano en ≥90% y hay cero
 * falsos aprobados en impacto crítico»— y hasta ahora **no se podía medir**: el
 * simulador informaba la distribución de cada proposición y el coste, y no había
 * forma de compararlo con nada.
 *
 * De dónde sale el veredicto humano, y por qué **no** del estado:
 *
 * Un ticket `closed` dice que terminó, no que su plan fuera bueno. Los 57 tickets
 * del registro están cerrados, así que usarlos como «aprobados» mediría con un
 * sesgo optimista: solo se ven los planes que llegaron al final. Lo que sí es un
 * veredicto humano registrado es el **ciclo de QA**: un `changes_requested` es
 * alguien diciendo «esto no está bien» con su fecha, su entorno y su corrección.
 * Un `approved` es alguien diciendo lo contrario.
 *
 * De ahí la referencia que se usa aquí:
 *
 * | Señal en el registro | Referencia | Qué significa |
 * |---|---|---|
 * | Algún ciclo `changes_requested` o `failed` | `rejected` | El trabajo se devolvió al menos una vez |
 * | Ciclos solo `approved` | `approved` | Pasó la revisión sin devoluciones |
 * | Sin ciclos cerrados | `unknown` | No hay veredicto, y no se inventa |
 *
 * Los `unknown` **no cuentan** en la coincidencia. Contarlos como acierto inflaría
 * el número, y contarlos como fallo lo hundiría por casos que el registro no
 * cubre. Se informan aparte, que es lo honesto.
 *
 * Limitación que se declara: un ticket rechazado y después aprobado sale
 * `rejected`, porque el registro conserva la devolución. Es deliberado —mide si el
 * gate habría detectado el problema **antes** de la devolución, que es justo para
 * lo que sirve un gate— pero significa que un gate perfecto tampoco sacaría 100%.
 */
import { type ParsedTicket, fail } from "@valmen/core";

import { type RegistryPaths } from "./discovery.js";
import { documentsForReport } from "./mutate.js";

/** Lo que dijo una persona sobre un ticket, leído de su registro. */
export type HumanVerdict = "approved" | "rejected" | "unknown";

/** El veredicto humano de un ticket, con la evidencia de dónde salió. */
export interface HumanReference {
  readonly ticketId: string;
  readonly verdict: HumanVerdict;
  /** Los resultados de sus ciclos de QA, en orden, para poder auditarlo. */
  readonly cycles: readonly string[];
  /** `true` si el ticket declara algún impacto crítico. */
  readonly critical: boolean;
}

/** Los impactos que elevan la exigencia del gate. */
const IMPACTOS_CRITICOS = ["sync_impact", "migration_impact", "docker_impact"] as const;

/**
 * El veredicto humano de un ticket.
 *
 * El ciclo `pending` es el que abre, y no dice nada: la pareja que importa es la
 * que cierra con `approved`, `changes_requested` o `failed`.
 */
export function humanVerdictOf(document: ParsedTicket): HumanReference {
  const resultados = document.blocks.QA.map((ciclo) => String(ciclo["result"] ?? ""));

  const devoluciones = resultados.filter(
    (resultado) => resultado === "changes_requested" || resultado === "failed",
  ).length;
  const aprobaciones = resultados.filter((resultado) => resultado === "approved").length;

  const verdict: HumanVerdict =
    devoluciones > 0 ? "rejected" : aprobaciones > 0 ? "approved" : "unknown";

  return {
    ticketId: document.fields.id,
    verdict,
    cycles: resultados,
    critical: IMPACTOS_CRITICOS.some((impacto) => document.fields[impacto] === "true"),
  };
}

/** Las referencias de todo el registro, indexadas por identificador. */
export function humanReferences(paths: RegistryPaths): Map<string, HumanReference> {
  const mapa = new Map<string, HumanReference>();
  for (const registro of documentsForReport(paths)) {
    // Un ticket que no se pudo leer no tiene veredicto humano que comparar. Se
    // saltea en vez de tumbar la calibración entera: el informe mide la precisión
    // del gate sobre lo que sí se puede leer, y negarse por un ticket roto deja
    // sin el número a quien lo estaba mirando.
    if (registro.document === null) continue;
    const referencia = humanVerdictOf(registro.document);
    mapa.set(referencia.ticketId, referencia);
  }
  return mapa;
}

/** El veredicto automático de un ticket, en los términos del gate. */
export type AutomaticVerdict = "approve" | "block" | "review";

/** Una fila de la comparación. */
export interface CalibrationRow {
  readonly ticketId: string;
  readonly human: HumanVerdict;
  readonly automatic: AutomaticVerdict;
  readonly critical: boolean;
  /** `true` si los dos veredictos coinciden, ignorando la banda de revisión. */
  readonly agrees: boolean;
  /** `true` si el gate aprobó lo que una persona devolvió. El fallo caro. */
  readonly falseApprove: boolean;
  /** `true` si el gate bloqueó lo que una persona aprobó. */
  readonly falseBlock: boolean;
}

/** El resultado de calibrar un gate. */
export interface CalibrationReport {
  readonly gate: string;
  /** Los sujetos que se pudieron comparar: los que tienen veredicto humano. */
  readonly compared: number;
  /** Los que no lo tienen, y por eso no cuentan. */
  readonly unknown: number;
  /** `compared` menos los que cayeron en la banda de revisión. */
  readonly decided: number;
  readonly agree: number;
  /** Fracción de coincidencia sobre los decididos. `null` si no hubo ninguno. */
  readonly rate: number | null;
  /**
   * Aprobaciones del gate sobre tickets que una persona devolvió.
   *
   * **Es el número que importa.** Un gate que bloquea de más cuesta trabajo; uno
   * que aprueba lo que estaba mal cuesta credibilidad, y es el que no se puede
   * permitir en un ticket de impacto crítico.
   */
  readonly falseApproves: number;
  /** Y ese mismo número contando solo los tickets de impacto crítico. */
  readonly criticalFalseApproves: number;
  readonly falseBlocks: number;
  readonly rows: readonly CalibrationRow[];
}

/** Lo que el simulador decidió sobre un sujeto. */
export interface SimulatedSubject {
  readonly id: string;
  readonly outcome: string;
}

/**
 * Compara lo que decidió el gate con lo que decidió una persona.
 *
 * La banda de revisión **no cuenta como acierto ni como fallo**: no es una
 * decisión, es una pregunta, y contarla como acierto inflaría el número justo en
 * los casos donde el gate no se atrevió. Se informa aparte en `decided`.
 */
export function calibrate(
  gate: string,
  subjects: readonly SimulatedSubject[],
  references: ReadonlyMap<string, HumanReference>,
): CalibrationReport {
  const rows: CalibrationRow[] = [];
  let unknown = 0;

  for (const sujeto of subjects) {
    const referencia = references.get(sujeto.id);
    if (referencia === undefined || referencia.verdict === "unknown") {
      unknown += 1;
      continue;
    }
    const automatic = sujeto.outcome as AutomaticVerdict;
    const human = referencia.verdict;
    const decidido = automatic !== "review";
    rows.push({
      ticketId: sujeto.id,
      human,
      automatic,
      critical: referencia.critical,
      agrees: decidido && (automatic === "approve") === (human === "approved"),
      falseApprove: automatic === "approve" && human === "rejected",
      falseBlock: automatic === "block" && human === "approved",
    });
  }

  const decididos = rows.filter((fila) => fila.automatic !== "review");
  const aciertos = decididos.filter((fila) => fila.agrees).length;

  return {
    gate,
    compared: rows.length,
    unknown,
    decided: decididos.length,
    agree: aciertos,
    rate: decididos.length === 0 ? null : aciertos / decididos.length,
    falseApproves: rows.filter((fila) => fila.falseApprove).length,
    criticalFalseApproves: rows.filter((fila) => fila.falseApprove && fila.critical).length,
    falseBlocks: rows.filter((fila) => fila.falseBlock).length,
    rows,
  };
}

/** El informe, en texto. */
export function renderCalibration(report: CalibrationReport): string {
  const porcentaje =
    report.rate === null ? "sin decisiones" : `${(report.rate * 100).toFixed(1)}%`;

  const lineas = [
    `Calibración del gate ${report.gate}`,
    `  comparables:  ${report.compared} (con veredicto humano)`,
    `  decididos:    ${report.decided} (el resto cayó en banda de revisión)`,
    `  coincidencia: ${report.agree}/${report.decided} — ${porcentaje}`,
    `  sin veredicto humano: ${report.unknown} (no cuentan)`,
    "",
    `  falsos aprobados: ${report.falseApproves} (críticos: ${report.criticalFalseApproves})`,
    `  falsos bloqueados: ${report.falseBlocks}`,
  ];

  // Las dos metas del criterio de aceptación, dichas explícitamente: un número sin
  // su umbral obliga a recordarlo.
  lineas.push(
    "",
    report.rate === null
      ? "  Sin decisiones no se puede afirmar nada sobre la coincidencia."
      : report.rate >= 0.9
        ? "  ✓ Cumple el umbral de coincidencia (≥90%)."
        : `  ✗ Por debajo del umbral de coincidencia (≥90%). Faltan ${
            Math.ceil(0.9 * report.decided) - report.agree
          } acierto(s).`,
    report.criticalFalseApproves === 0
      ? "  ✓ Cero falsos aprobados en impacto crítico."
      : `  ✗ ${report.criticalFalseApproves} falso(s) aprobado(s) en impacto crítico.`,
  );

  if (report.rows.length > 0) {
    lineas.push("", "  Detalle:");
    for (const fila of report.rows) {
      const marca = fila.automatic === "review" ? "?" : fila.agrees ? "✓" : "✗";
      const aviso = fila.falseApprove ? "  ← aprobó lo que se devolvió" : "";
      lineas.push(
        `    ${marca} ${fila.ticketId} — humano ${fila.human}, gate ${fila.automatic}${aviso}`,
      );
    }
  }

  return lineas.join("\n") + "\n";
}

/** Un veredicto que no se reconoce: el simulador cambió y esto se quedó atrás. */
export function assertKnownOutcome(outcome: string): AutomaticVerdict {
  if (outcome === "approve" || outcome === "block" || outcome === "review") return outcome;
  fail(
    `El simulador devolvió el veredicto "${outcome}", que no es approve, block ni review.`,
  );
}
