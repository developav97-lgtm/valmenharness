/**
 * La precisión de las compuertas, medida sobre los recibos (R-CPRE-011).
 *
 * Una compuerta que nadie mide se vuelve una fuente de números sin cara: el registro
 * tiene cientos de recibos, y cada decisión humana sobre una banda de revisión es una
 * etiqueta gratis de si el evaluador acertó. Este informe las lee. No llama a ningún
 * modelo ni cuesta nada: es una lectura del registro.
 *
 * Cuatro cuentas, por compuerta y por evaluador:
 *
 * - **Corridas** y su reparto entre aprobar, revisar y bloquear.
 * - **Tasa de banda**: qué parte de las corridas terminó en revisión. Una compuerta que
 *   casi siempre manda a una persona no está ahorrando nada.
 * - **Revisiones aprobadas sin cambios**: de las corridas que fueron a revisión y una
 *   persona decidió, cuántas aprobó. Si casi todas se aprueban, la banda es demasiado
 *   ancha; si casi todas se rechazan, el evaluador estaba acertando.
 * - **Bloqueos por tipo de ticket**: dónde bloquea la compuerta.
 */
import { readdirSync } from "node:fs";
import { dirname } from "node:path";

import { type GateReceipt } from "@valmen/gate";

import { type RegistryPaths } from "./discovery.js";
import { currentReceipts, readReceipts, receiptsPath } from "./receipts.js";

/**
 * Todos los recibos vigentes del registro, un archivo por ticket.
 *
 * Cada recibo se lee en su versión vigente: la decisión humana se anexa como una línea
 * nueva con el mismo identificador y es la que lleva la etiqueta que se mide.
 */
export function readCurrentReceipts(paths: RegistryPaths): GateReceipt[] {
  let archivos: string[];
  try {
    archivos = readdirSync(dirname(receiptsPath(paths, "x")));
  } catch {
    return [];
  }
  return archivos
    .filter((nombre) => nombre.endsWith(".jsonl"))
    .sort()
    .flatMap((nombre) =>
      currentReceipts(readReceipts(paths, nombre.replace(/\.jsonl$/, ""))).reverse(),
    );
}

/**
 * Con qué evaluador se produjo un recibo.
 *
 * Los recibos nuevos lo traen. Los anteriores no, y se infiere de su forma: sin modelo o
 * con resultados de comandos fue el evaluador por comando; con escalamientos, la cascada;
 * con un modelo de Jev, Jev; con otro modelo, el juez de chat.
 */
export function inferEvaluator(receipt: GateReceipt): string {
  if (receipt.evaluator !== undefined) return receipt.evaluator;
  if ((receipt.escalations?.length ?? 0) > 0) return "cascade";
  if (receipt.model === null || (receipt.commandResults?.length ?? 0) > 0) return "command";
  return /jev/i.test(receipt.model.model) ? "jev" : "llm-judge";
}

/** ¿La decisión sobre este recibo la tomó el agente por delegación y no una persona? */
export function esDelegada(receipt: GateReceipt): boolean {
  return receipt.humanDecision?.channel === "delegation";
}

/** El tipo del ticket de un recibo: el primer tramo de su identificador. */
export function ticketTypeOf(receipt: GateReceipt): string {
  return (receipt.subject?.id ?? "").split("-")[0] || "desconocido";
}

/** Una fila del informe: una compuerta con un evaluador. */
export interface PrecisionRow {
  readonly gate: string;
  readonly evaluator: string;
  readonly runs: number;
  readonly approve: number;
  readonly review: number;
  readonly block: number;
  /** Corridas que terminaron en revisión sobre el total, o `null` sin corridas. */
  readonly bandRate: number | null;
  /** Corridas en revisión que **una persona** decidió. */
  readonly reviewsDecided: number;
  /**
   * Revisiones que el agente decidió por delegación del PO.
   *
   * No cuentan como decisión humana: son del agente, con las palabras del PO, y medir la
   * precisión de una compuerta contra las aprobaciones del propio agente que la usa sería
   * contarse a sí mismo.
   */
  readonly reviewsDelegated: number;
  readonly reviewsApproved: number;
  /** De las revisiones decididas, la proporción que una persona aprobó, o `null`. */
  readonly approvedUnchangedRate: number | null;
  readonly blocksByType: Readonly<Record<string, number>>;
}

export interface PrecisionOptions {
  /** Fecha `YYYY-MM-DD` desde la que se cuenta, inclusive. */
  readonly desde?: string | undefined;
  /** Fecha `YYYY-MM-DD` hasta la que se cuenta, inclusive. */
  readonly hasta?: string | undefined;
}

/** Calcula el informe de precisión sobre una lista de recibos. */
export function precisionReport(
  receipts: readonly GateReceipt[],
  options: PrecisionOptions = {},
): PrecisionRow[] {
  const dentro = receipts.filter((r) => {
    const dia = r.decidedAt.slice(0, 10);
    return (
      (options.desde === undefined || dia >= options.desde) &&
      (options.hasta === undefined || dia <= options.hasta)
    );
  });

  const grupos = new Map<string, GateReceipt[]>();
  for (const recibo of dentro) {
    const clave = `${recibo.gate}\u0000${inferEvaluator(recibo)}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), recibo]);
  }

  return [...grupos.entries()]
    .map(([clave, lista]): PrecisionRow => {
      const [gate, evaluator] = clave.split("\u0000") as [string, string];
      const revisiones = lista.filter((r) => r.outcome === "review");
      const conDecision = revisiones.filter((r) => r.humanDecision !== null);
      const decididas = conDecision.filter((r) => !esDelegada(r));
      const aprobadas = decididas.filter((r) => r.humanDecision?.decision === "approve");
      const bloqueos: Record<string, number> = {};
      for (const r of lista.filter((x) => x.outcome === "block")) {
        const tipo = ticketTypeOf(r);
        bloqueos[tipo] = (bloqueos[tipo] ?? 0) + 1;
      }
      return {
        gate,
        evaluator,
        runs: lista.length,
        approve: lista.filter((r) => r.outcome === "approve").length,
        review: revisiones.length,
        block: lista.filter((r) => r.outcome === "block").length,
        bandRate: lista.length === 0 ? null : revisiones.length / lista.length,
        reviewsDecided: decididas.length,
        reviewsDelegated: conDecision.length - decididas.length,
        reviewsApproved: aprobadas.length,
        approvedUnchangedRate: decididas.length === 0 ? null : aprobadas.length / decididas.length,
        blocksByType: bloqueos,
      };
    })
    .sort((a, b) => a.gate.localeCompare(b.gate) || a.evaluator.localeCompare(b.evaluator));
}

const pct = (valor: number | null): string =>
  valor === null ? "—" : `${(valor * 100).toFixed(0)} %`;

/** El informe, para quien lo lee. */
export function renderPrecision(rows: readonly PrecisionRow[], options: PrecisionOptions = {}): string {
  const periodo =
    options.desde === undefined && options.hasta === undefined
      ? "todo el registro"
      : `${options.desde ?? "el inicio"} a ${options.hasta ?? "hoy"}`;
  const lineas = [`Precisión de las compuertas — ${periodo}`, ""];
  if (rows.length === 0) {
    lineas.push("No hay recibos en ese período.");
    return `${lineas.join("\n")}\n`;
  }
  for (const f of rows) {
    lineas.push(
      `${f.gate} · ${f.evaluator}: ${f.runs} corrida(s) — aprueba ${f.approve}, revisa ${f.review}, bloquea ${f.block}`,
      `  tasa de banda: ${pct(f.bandRate)}`,
      `  revisiones aprobadas sin cambios: ${pct(f.approvedUnchangedRate)} (${f.reviewsApproved} de ${f.reviewsDecided} decididas por una persona` +
        `${f.reviewsDelegated > 0 ? `; ${f.reviewsDelegated} decidida(s) por el agente por delegación, que no cuentan` : ""})`,
      `  bloqueos por tipo de ticket: ${
        Object.keys(f.blocksByType).length === 0
          ? "ninguno"
          : Object.entries(f.blocksByType)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([tipo, n]) => `${tipo} ${n}`)
              .join(", ")
      }`,
      "",
    );
  }
  return `${lineas.join("\n")}`;
}
