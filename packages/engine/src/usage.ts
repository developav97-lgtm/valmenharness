/**
 * El consumo del harness, leído de sus propios recibos.
 *
 * Un harness sin observabilidad es un harness en el que no se puede confiar, y la
 * observabilidad no empieza por un tablero: empieza por **el dato que ya está en
 * disco**. Cada evaluación de compuerta dejó un recibo con su veredicto, su coste,
 * su modelo, su latencia y —cuando la decidió una persona— su decisión. Esto no
 * mide nada nuevo: junta lo que el harness ya escribió y lo cuenta.
 *
 * Y cuenta lo que ninguna otra pieza cuenta: **cuánto de la decisión la tomó el
 * código y cuánto un modelo**. Es el número que dice si el harness está haciendo
 * lo que promete —lo decidible en código se decide en código— o si está pagando
 * por preguntar lo que podía computar.
 *
 * La calibración sale del mismo sitio y con la misma matemática que la simulación
 * (`calibrate`): lo que dijo el gate contra lo que dijo una persona. La diferencia
 * es que acá los sujetos son evaluaciones **reales**, así que el número que
 * promueve un gate de híbrido a automático se puede calcular con lo que pasó de
 * verdad en vez de con lo que se midió sobre el histórico.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type GateReceipt } from "@valmen/gate";

import { type CalibrationReport, calibrate, humanReferences } from "./calibration.js";
import { type RegistryPaths } from "./discovery.js";

/** Los recibos de todo el registro, en orden de escritura. */
export function readAllReceipts(paths: RegistryPaths): GateReceipt[] {
  const directorio = join(paths.root, ".valmen", "receipts");
  let archivos: string[];
  try {
    archivos = readdirSync(directorio);
  } catch {
    return [];
  }

  const recibos: GateReceipt[] = [];
  for (const archivo of archivos.filter((nombre) => nombre.endsWith(".jsonl")).sort()) {
    let texto: string;
    try {
      texto = readFileSync(join(directorio, archivo), "utf8");
    } catch {
      continue;
    }
    for (const linea of texto.split("\n")) {
      if (linea.trim() === "") continue;
      // Un recibo corrupto se salta y se cuenta aparte: descartarlo en silencio
      // dejaría el informe con aspecto completo y un dato falso.
      try {
        recibos.push(JSON.parse(linea) as GateReceipt);
      } catch {
        recibos.push({ ...({} as GateReceipt), kind: "gate-receipt", gate: "(ilegible)" });
      }
    }
  }
  return recibos;
}

/** El consumo de una compuerta. */
export interface GateUsage {
  readonly gate: string;
  readonly evaluations: number;
  readonly approve: number;
  readonly review: number;
  readonly block: number;
  readonly costUsd: number;
  /** Las que decidió el código, sin preguntarle a un modelo. */
  readonly byCode: number;
}

/** El consumo de un modelo. */
export interface ModelUsage {
  readonly provider: string;
  readonly model: string;
  readonly evaluations: number;
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** Lo que el harness hizo en un rango, contado de sus recibos. */
export interface UsageReport {
  readonly desde: string | null;
  readonly hasta: string | null;
  /** Evaluaciones vigentes: la última versión de cada recibo. */
  readonly evaluations: number;
  readonly tickets: number;
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly meanLatencyMs: number | null;
  readonly byGate: readonly GateUsage[];
  readonly byModel: readonly ModelUsage[];
  /** Decididas por código: sin modelo, sin coste. */
  readonly byCode: number;
  /** Escaladas a una persona. */
  readonly escalated: number;
  /** Recibos que no se pudieron leer. */
  readonly unreadable: number;
  readonly calibration: readonly CalibrationReport[];
}

/** La fecha de un recibo, en `YYYY-MM-DD`. */
function fechaDe(recibo: GateReceipt): string {
  return String(recibo.decidedAt ?? "").slice(0, 10);
}

/**
 * Colapsa el registro a la versión vigente de cada recibo.
 *
 * Un recibo se anexa dos veces cuando una persona decide sobre un gate escalado:
 * la segunda línea trae la decisión humana. Contar las dos inflaría el consumo y
 * contaría dos veces la misma evaluación.
 */
function vigentes(recibos: readonly GateReceipt[]): GateReceipt[] {
  const porId = new Map<string, GateReceipt>();
  for (const recibo of recibos) porId.set(recibo.id, recibo);
  return [...porId.values()];
}

/** Cuenta el consumo del harness en un rango de fechas, ambas incluidas. */
export function usageReport(
  paths: RegistryPaths,
  range: { readonly desde?: string; readonly hasta?: string } = {},
): UsageReport {
  const todos = readAllReceipts(paths);
  const unreadable = todos.filter((recibo) => recibo.gate === "(ilegible)").length;

  const enRango = vigentes(todos).filter((recibo) => {
    if (recibo.gate === "(ilegible)") return false;
    const fecha = fechaDe(recibo);
    if (range.desde !== undefined && fecha < range.desde) return false;
    if (range.hasta !== undefined && fecha > range.hasta) return false;
    return true;
  });

  const porCompuerta = new Map<string, GateUsage>();
  const porModelo = new Map<string, ModelUsage>();
  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let latencias = 0;
  let conLatencia = 0;

  for (const recibo of enRango) {
    const coste = recibo.usage?.costUsd ?? 0;
    costUsd += coste;
    inputTokens += recibo.usage?.inputTokens ?? 0;
    outputTokens += recibo.usage?.outputTokens ?? 0;
    if (typeof recibo.latencyMs === "number") {
      latencias += recibo.latencyMs;
      conLatencia += 1;
    }

    const actual = porCompuerta.get(recibo.gate) ?? {
      gate: recibo.gate,
      evaluations: 0,
      approve: 0,
      review: 0,
      block: 0,
      costUsd: 0,
      byCode: 0,
    };
    porCompuerta.set(recibo.gate, {
      ...actual,
      evaluations: actual.evaluations + 1,
      approve: actual.approve + (recibo.outcome === "approve" ? 1 : 0),
      review: actual.review + (recibo.outcome === "review" ? 1 : 0),
      block: actual.block + (recibo.outcome === "block" ? 1 : 0),
      costUsd: actual.costUsd + coste,
      byCode: actual.byCode + (recibo.model === null ? 1 : 0),
    });

    if (recibo.model !== null) {
      const clave = `${recibo.model.provider}/${recibo.model.model}`;
      const suyo = porModelo.get(clave) ?? {
        provider: recibo.model.provider,
        model: recibo.model.model,
        evaluations: 0,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      porModelo.set(clave, {
        ...suyo,
        evaluations: suyo.evaluations + 1,
        costUsd: suyo.costUsd + coste,
        inputTokens: suyo.inputTokens + (recibo.usage?.inputTokens ?? 0),
        outputTokens: suyo.outputTokens + (recibo.usage?.outputTokens ?? 0),
      });
    }
  }

  // La calibración se calcula **por compuerta** y solo con las evaluaciones que
  // caen en el rango: mezclar compuertas compararía preguntas distintas contra el
  // mismo veredicto humano.
  const referencias = humanReferences(paths);
  const sujetosPorCompuerta = new Map<string, { id: string; outcome: string }[]>();
  for (const recibo of enRango) {
    const lista = sujetosPorCompuerta.get(recibo.gate) ?? [];
    // Una compuerta puede haberse evaluado varias veces sobre el mismo ticket: la
    // última es la que decidió, y las anteriores son historia.
    const indice = lista.findIndex((sujeto) => sujeto.id === recibo.subject.id);
    const sujeto = { id: recibo.subject.id, outcome: recibo.outcome };
    if (indice === -1) lista.push(sujeto);
    else lista[indice] = sujeto;
    sujetosPorCompuerta.set(recibo.gate, lista);
  }

  const calibration = [...sujetosPorCompuerta.entries()]
    .map(([gate, sujetos]) => calibrate(gate, sujetos, referencias))
    .filter((informe) => informe.compared > 0)
    .sort((a, b) => (a.gate < b.gate ? -1 : 1));

  return {
    desde: range.desde ?? null,
    hasta: range.hasta ?? null,
    evaluations: enRango.length,
    tickets: new Set(enRango.map((recibo) => recibo.subject.id)).size,
    costUsd,
    inputTokens,
    outputTokens,
    meanLatencyMs: conLatencia === 0 ? null : Math.round(latencias / conLatencia),
    byGate: [...porCompuerta.values()].sort((a, b) => (a.gate < b.gate ? -1 : 1)),
    byModel: [...porModelo.values()].sort((a, b) => b.costUsd - a.costUsd),
    byCode: enRango.filter((recibo) => recibo.model === null).length,
    escalated: enRango.filter((recibo) => recibo.escalatedTo !== null).length,
    unreadable,
    calibration,
  };
}

/** El informe, en texto. */
export function renderUsage(report: UsageReport): string {
  const rango =
    report.desde === null && report.hasta === null
      ? "todo el registro"
      : `${report.desde ?? "el principio"} al ${report.hasta ?? "hoy"}`;

  if (report.evaluations === 0) {
    return (
      `Consumo del harness — ${rango}\n\n` +
      "_No hay evaluaciones de compuerta registradas en este rango._\n"
    );
  }

  const lineas: string[] = [
    `Consumo del harness — ${rango}`,
    "",
    `  Evaluaciones      ${report.evaluations} en ${report.tickets} ticket(s)`,
    `  Coste             $${report.costUsd.toFixed(6)}`,
    `  Latencia media    ${report.meanLatencyMs ?? "—"} ms`,
    `  Decidido por      código ${report.byCode} · modelo ${report.evaluations - report.byCode}` +
      (report.escalated > 0 ? ` · escaladas a una persona ${report.escalated}` : ""),
    "",
    "  Por compuerta",
  ];

  for (const compuerta of report.byGate) {
    lineas.push(
      `    ${compuerta.gate.padEnd(16)} ${String(compuerta.evaluations).padStart(3)}  ·  ` +
        `${compuerta.approve} aprueba · ${compuerta.review} revisión · ${compuerta.block} bloqueo  ·  ` +
        `$${compuerta.costUsd.toFixed(6)}` +
        (compuerta.byCode > 0 ? `  ·  ${compuerta.byCode} sin modelo` : ""),
    );
  }

  if (report.byModel.length > 0) {
    lineas.push("", "  Por modelo");
    for (const modelo of report.byModel) {
      lineas.push(
        `    ${`${modelo.provider}/${modelo.model}`.padEnd(40)} ${String(modelo.evaluations).padStart(3)}  ·  ` +
          `$${modelo.costUsd.toFixed(6)}  ·  ` +
          `${modelo.inputTokens} entrada / ${modelo.outputTokens} salida`,
      );
    }
  }

  for (const calibracion of report.calibration) {
    const porcentaje =
      calibracion.rate === null
        ? "sin decisiones"
        : `${(calibracion.rate * 100).toFixed(1)}%`;
    lineas.push(
      "",
      `  Calibración de ${calibracion.gate} (contra el veredicto humano del ticket)`,
      `    comparables        ${calibracion.compared}`,
      `    coincidencia       ${porcentaje} sobre ${calibracion.decided} decidida(s)`,
      `    falsos aprobados   ${calibracion.falseApproves}` +
        (calibracion.criticalFalseApproves > 0
          ? ` (${calibracion.criticalFalseApproves} crítico(s))`
          : ""),
      `    falsos bloqueos    ${calibracion.falseBlocks}`,
    );
  }

  if (report.unreadable > 0) {
    lineas.push(
      "",
      `  ${report.unreadable} recibo(s) ilegible(s): están en el registro y no se contaron.`,
    );
  }

  return `${lineas.join("\n")}\n`;
}
