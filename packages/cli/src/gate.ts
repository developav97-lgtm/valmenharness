/**
 * Comando `gate`: evalúa un gate contra un ticket.
 *
 * Flujo completo de una evaluación:
 *
 * 1. Se lee el ticket y se extrae el contexto que la evaluación necesita.
 * 2. Se **congela** ese contexto y se calcula su hash. Lo que se envió al
 *    evaluador queda determinado y reproducible.
 * 3. Se envían todas las proposiciones en **una sola llamada**.
 * 4. La decisión la toma el código, comparando probabilidades contra umbrales.
 * 5. Se emite un recibo con el estado, las respuestas, la versión exacta del
 *    modelo y el coste.
 *
 * En modo `human` o cuando la decisión es `review`, el comando **no avanza el
 * ticket**: entrega el recibo y deja la decisión pendiente. Un gate no cambia
 * estados por su cuenta.
 */
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  EXIT_INVARIANT,
  TicketError,
  parseTicket,
  toFailure,
} from "@valmen/core";
import {
  type GateDecision,
  type GatePolicy,
  type GateReceipt,
  type MechanicalCheck,
  type PropositionAnswer,
  buildReceipt,
  decide,
  extractCriteria,
  gateById,
  gateFor,
  summarizeReceipt,
  weightedMean,
} from "@valmen/gate";
import { evaluateWithJev } from "@valmen/gate-jev";

import type { CommandResult } from "./commands.js";
import { type RegistryPaths, findTicket } from "./discovery.js";

/** Secciones del ticket que se envían al evaluador, según lo que declare el gate. */
function buildState(text: string): Record<string, string> {
  const { sections, fields } = parseTicket(text);
  return {
    id: fields.id,
    tipo: fields.type,
    modulo: fields.module,
    riesgo: fields.risk_level,
    solicitud: sections["Solicitud original"].trim(),
    investigacion: sections["Diagnóstico"].trim(),
    plan: sections["Plan"].trim(),
    criterios: sections["Criterios de aceptación"].trim(),
  };
}

/**
 * Ejecuta los checks que decide el código.
 *
 * Se ejecutan **antes** de llamar a ningún modelo: lo que un script puede
 * decidir no se le pregunta a un modelo. Es una decisión de coste y de
 * confiabilidad, no de elegancia.
 */
function runMechanicalChecks(text: string): MechanicalCheck[] {
  const { sections, blocks, fields } = parseTicket(text);
  const checks: MechanicalCheck[] = [];

  const criterios = sections["Criterios de aceptación"].trim();
  const items = criterios
    .split("\n")
    .filter((line) => /^\s*[-*]\s+\[/.test(line));
  checks.push({
    id: "criterios_presentes",
    description: "El ticket declara criterios de aceptación verificables.",
    result: items.length > 0 ? "pass" : "fail",
    detail: `${items.length} criterio(s)`,
  });

  const riesgoCritico =
    fields.risk_level === "high" || fields.risk_level === "critical";
  const plan = sections["Plan"].toLowerCase();
  checks.push({
    id: "rollback_si_critico",
    description: "Un ticket de riesgo alto o crítico declara rollback.",
    result: !riesgoCritico
      ? "skip"
      : plan.includes("rollback") || plan.includes("revertir")
        ? "pass"
        : "fail",
    detail: riesgoCritico ? `riesgo ${fields.risk_level}` : "riesgo no crítico",
  });

  checks.push({
    id: "impactos_declarados",
    description:
      "Los impactos de sync, migración y contenedores están declarados.",
    result: "pass",
    detail: `${blocks.Puntos.length} punto(s) registrados`,
  });

  return checks;
}

/** Opciones de una evaluación de gate. */
export interface GateRunOptions {
  readonly gateId: string;
  readonly ticketId: string;
  /** Solo evalúa e informa; no escribe el recibo. */
  readonly dryRun?: boolean;
  /** Inyectable para pruebas. */
  readonly evaluate?: typeof evaluateWithJev;
  readonly now?: () => Date;
  readonly receiptId?: string;
}

/** Ejecuta un gate y devuelve el recibo con el informe. */
export async function runGate(
  paths: RegistryPaths,
  options: GateRunOptions,
): Promise<CommandResult> {
  const evaluate = options.evaluate ?? evaluateWithJev;
  const now = options.now ?? (() => new Date());

  let definition;
  try {
    definition = gateById(options.gateId);
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: failure.message, exitCode: 2 };
  }

  const ticket = findTicket(paths, options.ticketId);
  if (ticket === undefined) {
    return {
      stdout: "",
      stderr: "La ruta canónica solicitada no existe.",
      exitCode: 2,
    };
  }

  // El gate solo aplica a ciertos estados. Comprobarlo antes de gastar una
  // llamada evita dos problemas: pagar por un veredicto sin significado, y
  // presentar ese veredicto como si dijera algo sobre el ticket.
  let workflow: string;
  try {
    workflow = parseTicket(ticket.text).fields.workflow_status;
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: failure.message, exitCode: failure.exitCode };
  }

  if (!definition.appliesTo.includes(workflow)) {
    return {
      stdout: "",
      stderr:
        `El gate ${definition.id} protege la transición ${definition.transition} y solo ` +
        `aplica a un ticket en ${definition.appliesTo.map((estado) => `\`${estado}\``).join(" o ")}. ` +
        `El ticket ${options.ticketId} está en \`${workflow}\`. ` +
        "Evaluarlo aquí produciría un veredicto sin significado.",
      exitCode: EXIT_INVARIANT,
    };
  }

  let state: Record<string, string>;
  let checks: MechanicalCheck[];
  try {
    state = buildState(ticket.text);
    checks = runMechanicalChecks(ticket.text);
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: failure.message, exitCode: failure.exitCode };
  }

  // El gate se expande con el sujeto: una proposición por criterio de
  // aceptación, en vez de una pregunta compuesta que el evaluador no sabe
  // responder. Medido: la compuesta acierta el 7%, las atómicas el 62%.
  const criteria = extractCriteria(state["criterios"] ?? "");
  const gate = gateFor(definition, { criteria });

  // Un check mecánico fallido bloquea sin gastar una llamada al modelo.
  const fallidos = checks.filter((check) => check.result === "fail");
  if (fallidos.length > 0) {
    return {
      stdout: "",
      stderr:
        `Checks mecánicos fallidos: ${fallidos.map((check) => check.id).join(", ")}. ` +
        "No se llamó al evaluador.",
      exitCode: EXIT_INVARIANT,
    };
  }

  let evaluation;
  try {
    evaluation = await evaluate({
      propositions: gate.propositions,
      state,
      sessionId: `${options.ticketId}:${options.gateId}`,
    });
  } catch (caught) {
    const failure = toFailure(caught);
    return {
      stdout: "",
      stderr: `El evaluador no pudo completar la evaluación: ${failure.message}`,
      exitCode: failure.exitCode,
    };
  }

  // `decide` lanza si el evaluador no respondió alguna proposición o si una
  // respuesta no cumple el contrato. Se captura aquí para devolver un error
  // presentable: una excepción sin capturar en la capa de comando revienta el
  // proceso y deja al usuario sin saber qué pasó.
  let decision: GateDecision;
  try {
    decision = decide(
      gate.propositions,
      evaluation.answers,
      gate.policy as GatePolicy,
    );
  } catch (caught) {
    const failure = toFailure(caught);
    return {
      stdout: "",
      stderr: `La evaluación no cumple el contrato del gate: ${failure.message}`,
      exitCode: failure.exitCode,
    };
  }

  const receipt = buildReceipt({
    id:
      options.receiptId ??
      `GR-${now().toISOString().slice(0, 10).replace(/-/g, "")}-${options.gateId}`,
    gate: definition.id,
    propositions: definition.propositions,
    policy: definition.policy,
    subject: {
      type: "ticket",
      id: options.ticketId,
      revision: ticket.text.length.toString(),
    },
    decision,
    state,
    answers: evaluation.answers as PropositionAnswer[],
    mechanicalChecks: checks,
    model: evaluation.model,
    usage: evaluation.usage,
    latencyMs: evaluation.latencyMs,
    decidedAt: now().toISOString(),
  });

  const lines: string[] = [
    `Gate ${definition.id} — ${options.ticketId}`,
    criteria.length > 0
      ? `  ${criteria.length} criterio(s) desplegados como proposiciones atómicas`
      : "  El ticket no declara criterios; el gate se evalúa sin expansión",
    "",
    "  Checks mecánicos (código, sin coste)",
  ];
  for (const check of checks) {
    const marca = { pass: "✓", fail: "✗", warn: "!", skip: "·" }[check.result];
    lines.push(
      `    ${marca}  ${check.id.padEnd(22)} ${check.detail ?? ""}`.trimEnd(),
    );
  }

  lines.push("", "  Evaluación (modelo, una sola llamada)");
  for (const item of decision.propositions) {
    const marca = item.inBand
      ? "⚠"
      : item.verdict
        ? item.effect?.outcome === "approve"
          ? "✓"
          : "✗"
        : "·";
    const peso =
      item.kind === "noul" && item.weight !== 1
        ? `  (peso ${item.weight})`
        : "";
    lines.push(
      `    ${marca}  ${item.label.padEnd(38)} ${item.verdict ? "" : "descriptiva"}${peso}`.trimEnd(),
    );
  }

  const { mean } = weightedMean(decision);
  lines.push(
    "",
    `  Media ponderada:  ${mean.toFixed(3)}  (informativa: la decisión no la usa)`,
  );

  lines.push("", `  RESULTADO: ${decision.outcome.toUpperCase()}`);
  lines.push(`  Motivo:    ${decision.reason}`);

  if (decision.outcome === "review") {
    lines.push(
      "",
      "  Va a revisión humana. El ticket NO avanza: el gate no cambia estados.",
    );
  }

  lines.push(
    "",
    "  Recibo",
    `    estado congelado   ${receipt.stateHash.slice(0, 23)}…`,
    `    gate               ${receipt.gateHash.slice(0, 23)}…`,
    `    modelo             ${evaluation.model.resolvedVersion}`,
    `    coste              $${evaluation.usage.costUsd.toFixed(6)}`,
    `    latencia           ${evaluation.latencyMs} ms`,
  );

  if (options.dryRun !== true) {
    const receiptPath = join(
      paths.root,
      ".valmen",
      "receipts",
      `${options.ticketId}.jsonl`,
    );
    try {
      mkdirSync(dirname(receiptPath), { recursive: true });
      // Append-only: un recibo emitido no se modifica nunca. La decisión humana
      // se anexa como una línea nueva, no reescribiendo la anterior.
      appendFileSync(receiptPath, `${JSON.stringify(receipt)}\n`, "utf8");
      lines.push(
        "",
        `  Recibo anexado: ${receiptPath.replace(`${paths.root}/`, "")}`,
      );
      lines.push(`  ${summarizeReceipt(receipt)}`);
    } catch (caught) {
      const failure = toFailure(caught);
      return {
        stdout: lines.join("\n") + "\n",
        stderr: `No se pudo escribir el recibo: ${failure.message}`,
        exitCode: 2,
      };
    }
  } else {
    lines.push("", "  (simulación: el recibo no se escribió)");
  }

  // El código de salida refleja la decisión, para que un script pueda ramificar:
  // 0 aprueba, 3 bloquea. Revisión es un caso distinto que exige intervención.
  const exitCode = decision.outcome === "approve" ? 0 : EXIT_INVARIANT;

  return { stdout: lines.join("\n") + "\n", stderr: "", exitCode };
}

/** Lee los recibos anexados de un ticket. */
export function readReceipts(root: string, ticketId: string): GateReceipt[] {
  const path = join(root, ".valmen", "receipts", `${ticketId}.jsonl`);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as GateReceipt);
}

export { TicketError };
