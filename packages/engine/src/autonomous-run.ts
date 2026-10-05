/**
 * Orquestación mínima y secuencial de un ticket autónomo.
 *
 * El motor decide qué ticket puede despachar y conserva las transiciones; el
 * ejecutor externo recibe instrucciones y escribe código. Esta frontera evita
 * que el harness se convierta en otro runtime de agentes y permite cambiar de
 * Codex a otro adaptador sin que la política de elegibilidad cambie.
 */
import { spawnSync } from "node:child_process";

import {
  EXIT_INVARIANT,
  EXIT_SCHEMA,
  hasPlanGate,
  impactIdsInFields,
  parseTicket,
} from "@valmen/core";
import { extractCriteriaSpecs } from "@valmen/gate";
import { type AutonomousExecutorConfig } from "@valmen/adapter";

import { autonomousConfig, type RegistryPaths } from "./discovery.js";
import { budgetForTicket, readBudgetPolicy } from "./budget.js";
import { scanPendingChanges } from "./secrets.js";
import { currentReceipts, readReceipts } from "./receipts.js";
import {
  recordAutonomousStop,
  type AutonomousStopReason,
  type AutonomousStopReceipt,
} from "./autonomous-stops.js";
import { allDocuments } from "./mutate.js";
import { runGate } from "./gate.js";
import { transition } from "./transition.js";

/** Resultado portable de invocar un ejecutor, inyectable en las pruebas. */
export interface AutonomousExecutorResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Invocación sin shell: el adaptador decide el binario y cada argumento. */
export interface AutonomousExecutorCommand {
  readonly command: string;
  readonly args: readonly string[];
}

export interface AutonomousRunRequest {
  readonly paths: RegistryPaths;
  /** Un ticket concreto o la siguiente entrada elegible de la cola. */
  readonly ticketId?: string;
  readonly queue?: boolean;
  readonly execute?: (command: AutonomousExecutorCommand) => AutonomousExecutorResult;
  /** Reloj inyectable para que el recibo de parada sea reproducible en pruebas. */
  readonly now?: (() => Date) | undefined;
}

export interface AutonomousRunResult {
  readonly ticketId: string;
  readonly status: "delivered" | "executor-failed" | "verification-failed" | "stopped";
  readonly detail: string;
  readonly executor: AutonomousExecutorCommand;
  readonly stop?: AutonomousStopReceipt | undefined;
}

interface Candidate {
  readonly id: string;
  readonly text: string;
  readonly reasons: readonly string[];
}

const RISK_ORDER = ["low", "normal", "high", "critical"] as const;

function riskAtMost(actual: string, maximum: string): boolean {
  return RISK_ORDER.indexOf(actual as (typeof RISK_ORDER)[number]) <=
    RISK_ORDER.indexOf(maximum as (typeof RISK_ORDER)[number]);
}

/** Razones mecánicas por las que un ticket no pertenece a la cola. */
function ineligibility(text: string, policy: ReturnType<typeof autonomousConfig>): string[] {
  const ticket = parseTicket(text);
  const reasons: string[] = [];
  if (ticket.fields.workflow_status !== "approved") reasons.push("no está en approved");
  if (!policy.eligible.types.includes(ticket.fields.type)) reasons.push("su tipo no está habilitado");
  if (!riskAtMost(ticket.fields.risk_level, policy.eligible.maxRisk)) {
    reasons.push("supera el riesgo máximo");
  }
  if (policy.eligible.excludedModules.includes(ticket.fields.module.toLowerCase())) {
    reasons.push("su módulo está excluido");
  }
  for (const requirement of policy.eligible.require) {
    if (requirement === "plan-approved" && !hasPlanGate(ticket)) {
      reasons.push("no tiene plan aprobado");
    }
    if (requirement === "tests-declared") {
      const criteria = extractCriteriaSpecs(ticket.sections["Criterios de aceptación"]);
      if (criteria.length === 0 || criteria.some((criterion) => criterion.command === null && !criterion.manual)) {
        reasons.push("no declara cómo verificar todos los criterios");
      }
    }
    if (requirement === "no-critical-impacts" && impactIdsInFields(ticket.fields).length > 0) {
      reasons.push("declara un impacto crítico");
    }
  }
  return reasons;
}

/** Construye el comando de cada adaptador conocido; ninguna parte viene del ticket. */
export function autonomousExecutorCommand(
  executor: AutonomousExecutorConfig,
  root: string,
  prompt: string,
): AutonomousExecutorCommand {
  if (executor.id === "codex") {
    return {
      command: "codex",
      args: ["-c", `model_reasoning_effort=\"${executor.effort}\"`, "exec", "--cd", root, "--model", executor.model, "--sandbox", "workspace-write", "--ask-for-approval", "never", prompt],
    };
  }
  if (executor.id === "opencode") {
    return {
      command: "opencode",
      args: ["run", "--standalone", "--auto", "--model", executor.model, "--prompt", prompt, root],
    };
  }
  return {
    command: "claude",
    args: ["--model", executor.model, "--permission-mode", "bypassPermissions", "--print", prompt],
  };
}

function promptFor(ticketId: string): string {
  return [
    `Continúa exclusivamente el ticket ${ticketId} en el registro del proyecto.`,
    "Lee el ticket, AGENTS.md y las skills aplicables antes de modificar código.",
    "Implementa solo su plan, agrega y ejecuta pruebas, y documenta el contrato de entrega.",
    "No hagas commit, push, cierre, QA, migraciones, despliegues ni cambios fuera de alcance.",
    "Al terminar, deja el ticket y el árbol listos para que el harness corra qa-mechanical.",
  ].join("\n");
}

function execute(command: AutonomousExecutorCommand, root: string): AutonomousExecutorResult {
  const result = spawnSync(command.command, command.args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function permitsStop(
  policy: ReturnType<typeof autonomousConfig>,
  reason: AutonomousStopReason,
): boolean {
  return policy.limits.stopOn.includes(reason);
}

function budgetStop(
  paths: RegistryPaths,
  ticketId: string,
  policy: ReturnType<typeof autonomousConfig>,
): string | null {
  if (!permitsStop(policy, "budget-exceeded")) return null;
  const budget = budgetForTicket(paths, ticketId, readBudgetPolicy(paths.root));
  if (budget.costUsd >= policy.limits.budgetPerTicket) {
    return (
      `El costo acumulado ($${budget.costUsd.toFixed(4)}) alcanzó el límite ` +
      `por ticket ($${policy.limits.budgetPerTicket.toFixed(4)}).`
    );
  }
  if (budget.enabled && budget.tier === "pause") {
    return `El presupuesto adaptativo alcanzó el corte de pausa: ${budget.reason}.`;
  }
  return null;
}

function preflightStop(
  paths: RegistryPaths,
  ticketId: string,
  policy: ReturnType<typeof autonomousConfig>,
): { readonly reason: AutonomousStopReason; readonly detail: string } | null {
  if (permitsStop(policy, "gate-blocked-twice")) {
    const blocked = currentReceipts(readReceipts(paths, ticketId)).filter(
      (receipt) => receipt.outcome === "block",
    );
    if (blocked.length >= 2) {
      return {
        reason: "gate-blocked-twice",
        detail: `El ticket conserva ${blocked.length} bloqueos vigentes de compuerta; no se reintenta solo.`,
      };
    }
  }

  const budget = budgetStop(paths, ticketId, policy);
  return budget === null ? null : { reason: "budget-exceeded", detail: budget };
}

function stopResult(
  paths: RegistryPaths,
  ticketId: string,
  executor: AutonomousExecutorCommand,
  reason: AutonomousStopReason,
  detail: string,
  now: Date,
): AutonomousRunResult {
  const stop = recordAutonomousStop(paths, {
    ticketId,
    reason,
    detail,
    workflowStatus: "in_progress",
    now,
  });
  return { ticketId, status: "stopped", detail, executor, stop };
}

/** Selecciona y ejecuta una única entrada, sin paralelismo ni reintentos. */
export async function runAutonomous(request: AutonomousRunRequest): Promise<AutonomousRunResult> {
  if (request.ticketId === undefined && request.queue !== true) {
    throw Object.assign(new Error("run requiere --ticket o --queue."), { exitCode: EXIT_SCHEMA });
  }
  if (request.ticketId !== undefined && request.queue === true) {
    throw Object.assign(new Error("run acepta --ticket o --queue, no ambos."), { exitCode: EXIT_SCHEMA });
  }

  const policy = autonomousConfig(request.paths.root);
  if (!policy.enabled) {
    throw Object.assign(new Error("La autonomía está apagada en .valmen/config.yaml."), { exitCode: EXIT_INVARIANT });
  }
  if (policy.executor === null) {
    throw Object.assign(new Error("La autonomía no declara un ejecutor seguro."), { exitCode: EXIT_INVARIANT });
  }

  const candidates = allDocuments(request.paths)
    .map(({ ticket }) => ({ id: ticket.id, text: ticket.text, reasons: ineligibility(ticket.text, policy) }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const selected = request.ticketId === undefined
    ? candidates.find((candidate) => candidate.reasons.length === 0)
    : candidates.find((candidate) => candidate.id === request.ticketId);
  if (selected === undefined) {
    throw Object.assign(new Error(request.ticketId === undefined ? "No hay tickets elegibles en la cola." : "La ruta canónica solicitada no existe."), { exitCode: EXIT_SCHEMA });
  }
  if (selected.reasons.length > 0) {
    throw Object.assign(new Error(`El ticket ${selected.id} no es elegible: ${selected.reasons.join(", ")}.`), { exitCode: EXIT_INVARIANT });
  }

  const command = autonomousExecutorCommand(policy.executor, request.paths.root, promptFor(selected.id));
  transition({ paths: request.paths, ticketId: selected.id, entity: "ticket", to: "in_progress" });

  const before = preflightStop(request.paths, selected.id, policy);
  if (before !== null) {
    return stopResult(
      request.paths,
      selected.id,
      command,
      before.reason,
      before.detail,
      request.now?.() ?? new Date(),
    );
  }

  const result = (request.execute ?? ((item) => execute(item, request.paths.root)))(command);
  if (result.status !== 0) {
    return { ticketId: selected.id, status: "executor-failed", detail: result.stderr || "El ejecutor terminó con error.", executor: command };
  }

  if (permitsStop(policy, "secret-detected")) {
    const secrets = scanPendingChanges(request.paths.root);
    if (secrets.findings.length > 0) {
      return stopResult(
        request.paths,
        selected.id,
        command,
        "secret-detected",
        `Se detectó al menos un secreto en ${secrets.scanned} cambio(s) pendiente(s); el valor no se registró.`,
        request.now?.() ?? new Date(),
      );
    }
  }

  const afterBudget = budgetStop(request.paths, selected.id, policy);
  if (afterBudget !== null) {
    return stopResult(
      request.paths,
      selected.id,
      command,
      "budget-exceeded",
      afterBudget,
      request.now?.() ?? new Date(),
    );
  }

  const gate = await runGate(request.paths, { gateId: "qa-mechanical", ticketId: selected.id });
  if (gate.exitCode !== 0) {
    if (permitsStop(policy, "test-failure")) {
      return stopResult(
        request.paths,
        selected.id,
        command,
        "test-failure",
        "La verificación mecánica falló; revise el recibo qa-mechanical antes de corregir o reintentar.",
        request.now?.() ?? new Date(),
      );
    }
    return { ticketId: selected.id, status: "verification-failed", detail: gate.stderr, executor: command };
  }
  transition({ paths: request.paths, ticketId: selected.id, entity: "ticket", to: "awaiting_user_tests" });
  return { ticketId: selected.id, status: "delivered", detail: gate.stdout, executor: command };
}
