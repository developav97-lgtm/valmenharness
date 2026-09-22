/**
 * Simulación de un gate sobre el registro histórico.
 *
 * Es la herramienta de calibración, y existe porque un gate automático sin
 * calibrar es peor que ninguno: si manda todo a revisión humana, es un cuello
 * de botella disfrazado de control.
 *
 * La simulación evalúa tickets **ya pasados** y compara el veredicto del gate
 * con la decisión que una persona tomó en su momento. Esos tickets se aprobaron
 * y cerraron, así que hay una respuesta correcta conocida contra la que medir.
 *
 * Por eso el modo simulación **no aplica la precondición de estado**: evaluar
 * el pasado no es evaluar el presente, y exigir que un ticket histórico esté en
 * `planned` haría imposible medir nada.
 *
 * Ver docs/03-GATES.md §5.1ter y §9.
 */
import { EXIT_INVARIANT, parseTicket, toFailure } from "@valmen/core";
import {
  type GateDecision,
  type GatePolicy,
  type MechanicalCheck,
  type PropositionAnswer,
  type ReceiptInput,
  type GateDefinition,
  buildReceipt,
  decide,
  extractCriteria,
  gateFor,
  weightedMean,
} from "@valmen/gate";
import { evaluateWithJev } from "@valmen/gate-jev";

import { type LocatedTicket, type RegistryPaths, findAllTickets } from "./discovery.js";
import { buildGateState } from "./state.js";

/** Lo que se midió para un ticket. */
export interface SimulatedTicket {
  readonly id: string;
  /** Estado real del ticket, para contexto. */
  readonly workflow: string;
  readonly decision: GateDecision;
  readonly mean: number;
  readonly costUsd: number;
  readonly latencyMs: number;
}

/** Estadística de una proposición a lo largo de la simulación. */
export interface PropositionStats {
  readonly id: string;
  readonly samples: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  /** Veces que quedó en la banda media. */
  readonly inBand: number;
  /** Veces que aprobó con margen. */
  readonly approved: number;
  /** Veces que bloqueó con margen. */
  readonly blocked: number;
  /**
   * Cuánto separa esta proposición.
   *
   * Una proposición que nunca sale de la banda no discrimina nada: no aporta
   * información a la decisión y solo añade coste.
   */
  readonly discrimination: number;
}

/** Informe completo de una simulación. */
export interface SimulationReport {
  readonly gate: string;
  readonly evaluated: number;
  readonly failed: number;
  readonly outcomes: Record<string, number>;
  readonly totalCostUsd: number;
  readonly meanLatencyMs: number;
  readonly propositions: readonly PropositionStats[];
  readonly tickets: readonly SimulatedTicket[];
  readonly errors: readonly { id: string; message: string }[];
}

/** Calcula la estadística de cada proposición a lo largo de la simulación. */
export function summarizePropositions(
  tickets: readonly SimulatedTicket[],
): PropositionStats[] {
  const byId = new Map<
    string,
    { values: number[]; inBand: number; approved: number; blocked: number }
  >();

  for (const ticket of tickets) {
    for (const item of ticket.decision.propositions) {
      const entry = byId.get(item.id) ?? {
        values: [],
        inBand: 0,
        approved: 0,
        blocked: 0,
      };
      entry.values.push(item.value);
      if (item.inBand) entry.inBand += 1;
      else if (item.effect?.outcome === "approve") entry.approved += 1;
      else if (item.effect?.outcome === "block") entry.blocked += 1;
      byId.set(item.id, entry);
    }
  }

  return [...byId.entries()]
    .map(([id, entry]) => {
      const values = entry.values;
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      // La discriminación es la dispersión: una proposición cuyos valores están
      // todos pegados al mismo número no distingue un caso bueno de uno malo.
      const min = Math.min(...values);
      const max = Math.max(...values);
      return {
        id,
        samples: values.length,
        min,
        max,
        mean,
        inBand: entry.inBand,
        approved: entry.approved,
        blocked: entry.blocked,
        discrimination: max - min,
      };
    })
    .sort((a, b) => a.discrimination - b.discrimination);
}

/** Opciones de una simulación. */
export interface SimulateOptions {
  readonly gate: GateDefinition;
  readonly limit?: number;
  readonly evaluate?: typeof evaluateWithJev;
  readonly now?: () => Date;
  /** Recibe el progreso, para informar mientras corre. */
  readonly onProgress?: (done: number, total: number) => void;
}

/**
 * Simula un gate sobre todos los tickets del registro.
 *
 * Evalúa de uno en uno en vez de en paralelo: el coste es el mismo y así el
 * informe de progreso es útil y un fallo no pierde el trabajo ya hecho.
 */
export async function simulateGate(
  paths: RegistryPaths,
  options: SimulateOptions,
): Promise<SimulationReport> {
  const evaluate = options.evaluate ?? evaluateWithJev;
  const { gate } = options;

  let todos: LocatedTicket[];
  try {
    todos = findAllTickets(paths);
  } catch {
    todos = [];
  }
  const selected = options.limit === undefined ? todos : todos.slice(0, options.limit);

  const tickets: SimulatedTicket[] = [];
  const errors: { id: string; message: string }[] = [];
  const outcomes: Record<string, number> = { approve: 0, block: 0, review: 0 };
  let totalCostUsd = 0;
  let totalLatency = 0;

  for (const [index, ticket] of selected.entries()) {
    options.onProgress?.(index, selected.length);
    let state: Record<string, string>;
    let workflow: string;
    try {
      state = buildGateState(ticket.text);
      workflow = parseTicket(ticket.text).fields.workflow_status;
    } catch (caught) {
      errors.push({ id: ticket.id, message: toFailure(caught).message });
      continue;
    }

    // Se expande igual que en una evaluación real: una proposición por
    // criterio. Simular el gate sin expandir mediría algo distinto de lo que
    // corre en producción.
    const expanded = gateFor(gate, {
      criteria: extractCriteria(state["criterios"] ?? ""),
    });

    let evaluation;
    try {
      evaluation = await evaluate({
        propositions: expanded.propositions,
        state,
        sessionId: `simulate:${ticket.id}:${gate.id}`,
      });
    } catch (caught) {
      errors.push({ id: ticket.id, message: toFailure(caught).message });
      continue;
    }

    let decision: GateDecision;
    try {
      decision = decide(expanded.propositions, evaluation.answers, expanded.policy);
    } catch (caught) {
      errors.push({ id: ticket.id, message: toFailure(caught).message });
      continue;
    }

    outcomes[decision.outcome] = (outcomes[decision.outcome] ?? 0) + 1;
    totalCostUsd += evaluation.usage.costUsd;
    totalLatency += evaluation.latencyMs;

    tickets.push({
      id: ticket.id,
      workflow,
      decision,
      mean: weightedMean(decision).mean,
      costUsd: evaluation.usage.costUsd,
      latencyMs: evaluation.latencyMs,
    });
  }

  return {
    gate: gate.id,
    evaluated: tickets.length,
    failed: errors.length,
    outcomes,
    totalCostUsd,
    meanLatencyMs: tickets.length === 0 ? 0 : totalLatency / tickets.length,
    propositions: summarizePropositions(tickets),
    tickets,
    errors,
  };
}

/** Formatea el informe de una simulación. */
export function renderSimulation(report: SimulationReport, policy: GatePolicy): string {
  const lines: string[] = [
    `Simulación del gate ${report.gate}`,
    "",
    `  sujetos evaluados   ${report.evaluated}` +
      (report.failed > 0 ? `   (${report.failed} con error)` : ""),
    `  coste total         $${report.totalCostUsd.toFixed(6)}`,
    `  latencia media      ${Math.round(report.meanLatencyMs)} ms`,
    "",
    `  Umbrales: aprueba ≥${policy.approveAt} · bloquea ≤${policy.blockAt}`,
    "",
    "  Resultados",
  ];

  const total = Math.max(1, report.evaluated);
  for (const outcome of ["approve", "block", "review"] as const) {
    const count = report.outcomes[outcome] ?? 0;
    const pct = ((count / total) * 100).toFixed(0).padStart(3);
    const barra = "█".repeat(Math.round((count / total) * 30));
    lines.push(`    ${outcome.padEnd(8)} ${String(count).padStart(3)}  ${pct}%  ${barra}`);
  }

  lines.push("", "  Discriminación por proposición (menor = menos útil)");
  lines.push(
    "    proposición                            mín    máx   media  banda  discrim",
  );
  for (const stat of report.propositions) {
    lines.push(
      `    ${stat.id.padEnd(36)} ${stat.min.toFixed(2)}  ${stat.max.toFixed(2)}  ` +
        `${stat.mean.toFixed(2)}  ${String(stat.inBand).padStart(4)}  ${stat.discrimination.toFixed(2)}`,
    );
  }

  // Diagnóstico: qué hacer con lo medido.
  const planas = report.propositions.filter((stat) => stat.discrimination < 0.2);
  const siempreEnBanda = report.propositions.filter(
    (stat) => stat.samples > 0 && stat.inBand / stat.samples > 0.8,
  );

  lines.push("", "  Diagnóstico");
  if (report.evaluated === 0) {
    lines.push("    No se evaluó ningún sujeto. Revise los errores de abajo.");
  } else if (planas.length > 0) {
    lines.push(
      `    ⚠ ${planas.length} proposición(es) casi no discriminan (dispersión < 0.20):`,
      ...planas.map((stat) => `        ${stat.id}  (${stat.discrimination.toFixed(2)})`),
      "      Una proposición que da el mismo valor en todos los casos no aporta",
      "      información a la decisión y solo añade coste.",
    );
  }
  if (siempreEnBanda.length > 0) {
    lines.push(
      `    ⚠ ${siempreEnBanda.length} proposición(es) caen en banda en casi todos los casos:`,
      ...siempreEnBanda.map(
        (stat) => `        ${stat.id}  (${stat.inBand}/${stat.samples})`,
      ),
      "      Eso es ambigüedad en el enunciado, no duda real del evaluador.",
    );
  }

  const revision = (report.outcomes["review"] ?? 0) / total;
  if (revision > 0.8) {
    lines.push(
      `    ⚠ El ${(revision * 100).toFixed(0)}% va a revisión humana: el gate es un cuello de`,
      "      botella, no un control. Hay que recalibrar antes de confiar en él.",
    );
  } else if (revision < 0.2 && report.evaluated > 5) {
    lines.push(
      `    ✓ Solo el ${(revision * 100).toFixed(0)}% va a revisión: el gate discrimina.`,
    );
  }

  if (report.errors.length > 0) {
    lines.push("", `  Errores (${report.errors.length})`);
    for (const error of report.errors.slice(0, 5)) {
      lines.push(`    ${error.id}: ${error.message}`);
    }
    if (report.errors.length > 5) {
      lines.push(`    … y ${report.errors.length - 5} más`);
    }
  }

  return lines.join("\n") + "\n";
}

/** Construye un recibo para una evaluación simulada, sin escribirlo. */
export function receiptForSimulation(
  gate: GateDefinition,
  ticket: SimulatedTicket,
  index: number,
  decidedAt: string,
): ReceiptInput {
  return {
    id: `SIM-${String(index + 1).padStart(4, "0")}`,
    gate: gate.id,
    propositions: gate.propositions,
    policy: gate.policy,
    subject: { type: "ticket", id: ticket.id, revision: ticket.workflow },
    decision: ticket.decision,
    state: { simulated: true },
    answers: ticket.decision.propositions.map((item): PropositionAnswer => ({
      id: item.id,
      kind: item.kind,
      value: item.value,
    })),
    mechanicalChecks: [] as MechanicalCheck[],
    model: null,
    usage: { inputTokens: 0, outputTokens: 0, costUsd: ticket.costUsd },
    latencyMs: ticket.latencyMs,
    decidedAt,
  };
}

export { buildReceipt, EXIT_INVARIANT };
