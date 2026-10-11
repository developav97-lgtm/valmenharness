/**
 * Repetición determinista de recibos con la banda de revisión, e informe de revisión posterior.
 *
 * Es la evidencia alternativa cuando `calibrar_compuerta` se niega a proponer por falta de
 * rechazos humanos: no prueba que la política no apruebe un plan malo, prueba **qué
 * decisiones históricas cambiarían**, y cuáles no. No llama a ningún modelo.
 */
import { parseTicket } from "@valmen/core";
import { type GateReceipt, type ReviewBand, aplicarBanda, gateById } from "@valmen/gate";

import { type RegistryPaths, findTicket } from "./discovery.js";
import { inferEvaluator } from "./precision.js";
import { criticas } from "./thresholds.js";

/** Una decisión histórica que la banda cambiaría. */
interface CambioDeBanda {
  readonly id: string;
  readonly de: "review";
  readonly a: "approve";
}

/** El resultado de repetir los recibos con la banda. */
export interface RepeticionConBanda {
  readonly antes: Readonly<Record<string, number>>;
  readonly despues: Readonly<Record<string, number>>;
  readonly cambios: readonly CambioDeBanda[];
  /** Veredicto después de la banda, por id de recibo. */
  readonly despuesPorId: Readonly<Record<string, string>>;
  /** Recibos de tickets SECURITY o con impacto que la banda no toca, aunque cumplan. */
  readonly excluidos: number;
}

function contar(valores: Iterable<string>): Record<string, number> {
  const cuenta: Record<string, number> = {};
  for (const v of valores) cuenta[v] = (cuenta[v] ?? 0) + 1;
  return cuenta;
}

/** ¿La banda cambiaría este recibo de `review` a `approve`? Los demás no cambian nunca. */
function aprobariaConBanda(recibo: GateReceipt, floor: number, maxInBand: number): boolean {
  if (recibo.outcome !== "review") return false;
  const propositions = recibo.propositions;
  // Un bloqueo (aislado o no) lo decide el veto, no la banda.
  if (propositions.some((p) => p.verdict && p.effect?.outcome === "block" && !p.inBand)) {
    return false;
  }
  if (!propositions.some((p) => p.verdict && p.inBand)) return false;
  const definicion = gateById(recibo.gate);
  const band: ReviewBand = {
    floor,
    maxInBand,
    critical: criticas(definicion.propositions, definicion.isolatedBlockReview),
  };
  const tolerada = aplicarBanda(propositions, band);
  if (tolerada === null) return false;
  return !propositions.some(
    (p) =>
      p.verdict &&
      p.effect !== null &&
      p.effect.outcome !== "approve" &&
      !tolerada.tolerated.includes(p.id),
  );
}

/**
 * Repite las decisiones de los recibos `cascade` de `analysis` y `plan` con la banda.
 *
 * Los recibos de tickets SECURITY no entran en los cambios: el motor no les aplica la banda.
 */
export function repetirConBanda(
  recibos: readonly GateReceipt[],
  banda: { readonly floor: number; readonly maxInBand: number },
  gate?: string,
): RepeticionConBanda {
  const muestra = recibos.filter(
    (r) =>
      (r.gate === "analysis" || r.gate === "plan") &&
      (gate === undefined || r.gate === gate) &&
      inferEvaluator(r) === "cascade",
  );
  const cambios: CambioDeBanda[] = [];
  const despuesPorId: Record<string, string> = {};
  // Los identificadores de recibos viejos pueden repetirse entre tickets: se cuenta por
  // recibo, no por identificador.
  const despues: string[] = [];
  let excluidos = 0;
  for (const r of muestra) {
    let nuevo: string = r.outcome;
    if (aprobariaConBanda(r, banda.floor, banda.maxInBand)) {
      if (r.subject.id.startsWith("SECURITY-")) excluidos += 1;
      else {
        nuevo = "approve";
        cambios.push({ id: r.id, de: "review", a: "approve" });
      }
    }
    despuesPorId[r.id] = nuevo;
    despues.push(nuevo);
  }
  return {
    antes: contar(muestra.map((r) => r.outcome)),
    despues: contar(despues),
    cambios,
    despuesPorId,
    excluidos,
  };
}

/** Cuántas entregas bajo la banda hacen falta antes de decir algo del informe. */
const ENTREGAS_MINIMAS = 10;

/** Lo que cuenta el informe de revisión posterior. */
export interface InformeRevisionPosterior {
  readonly aprobadosPorBanda: number;
  readonly entregados: number;
  readonly devueltos: number;
  readonly suficiente: boolean;
}

/**
 * Cuenta, entre los tickets cuya aprobación pasó por la banda, cuántos llegaron a
 * `awaiting_user_tests` y cuántos volvieron a `changes_requested`.
 *
 * `detallesDe` entrega los detalles de los eventos del ticket: las transiciones dicen
 * «Workflow: X -> Y.».
 */
export function informeDesdeEventos(
  recibos: readonly GateReceipt[],
  detallesDe: (ticketId: string) => readonly string[],
): InformeRevisionPosterior {
  const tickets = new Set(
    recibos
      .filter((r) => r.outcome === "approve" && (r.reviewBand?.tolerated.length ?? 0) > 0)
      .map((r) => r.subject.id),
  );
  let entregados = 0;
  let devueltos = 0;
  for (const id of tickets) {
    const detalles = detallesDe(id);
    if (detalles.some((d) => /-> awaiting_user_tests/.test(d))) entregados += 1;
    if (detalles.some((d) => /-> changes_requested/.test(d))) devueltos += 1;
  }
  return {
    aprobadosPorBanda: tickets.size,
    entregados,
    devueltos,
    suficiente: entregados >= ENTREGAS_MINIMAS,
  };
}

/** El informe leyendo los eventos de cada ticket del registro. */
export function informeRevisionPosterior(
  paths: RegistryPaths,
  recibos: readonly GateReceipt[],
): InformeRevisionPosterior {
  return informeDesdeEventos(recibos, (id) => {
    const ticket = findTicket(paths, id);
    if (ticket === undefined) return [];
    return parseTicket(ticket.text).blocks.Eventos.map((e) => String(e["details"] ?? ""));
  });
}

function fila(cuenta: Readonly<Record<string, number>>): string {
  return ["approve", "review", "block"].map((k) => `${k} ${cuenta[k] ?? 0}`).join(", ");
}

/** El informe de la repetición, para `valmen thresholds <gate> --band`. */
export function renderRepeticion(
  gate: string,
  banda: { readonly floor: number; readonly maxInBand: number },
  r: RepeticionConBanda,
  informe: InformeRevisionPosterior,
): string {
  const lineas = [
    `Repetición con banda — compuerta ${gate}, piso ${banda.floor}, máximo ${banda.maxInBand} en banda`,
    "  Sobre los recibos vigentes del evaluador cascade; sin llamar a ningún modelo.",
    `  Antes:   ${fila(r.antes)}`,
    `  Después: ${fila(r.despues)}`,
    `  Cambian ${r.cambios.length} (ninguno desde ni hacia block); ${r.excluidos} más de tickets SECURITY quedan fuera.`,
    ...r.cambios.map((c) => `    ${c.id}: pasa de review a approve`),
    "",
    "  Qué demuestra: qué decisiones históricas cambiarían. Qué NO demuestra: que la política no",
    "  apruebe un plan malo; calibrar_compuerta pide 20 decisiones humanas y 5 rechazos, y sin",
    "  rechazos una aprobación humana no prueba la ausencia de un hueco.",
    "",
    "  Revisión posterior (tickets aprobados por banda):",
    `    aprobados por banda ${informe.aprobadosPorBanda}, entregados ${informe.entregados}, ` +
      `devueltos a changes_requested ${informe.devueltos}`,
    informe.suficiente
      ? informe.devueltos > 0
        ? "    Hubo devoluciones: la persona decide si retira la firma."
        : "    Sin devoluciones en las entregas medidas."
      : `    Evidencia insuficiente: hacen falta ${ENTREGAS_MINIMAS} entregas bajo la banda.`,
  ];
  return `${lineas.join("\n")}\n`;
}
