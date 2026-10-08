/**
 * Orquestación mínima y secuencial de un ticket autónomo.
 *
 * El motor decide qué ticket puede despachar y conserva las transiciones; el
 * ejecutor externo recibe instrucciones y escribe código. Esta frontera evita
 * que el harness se convierta en otro runtime de agentes y permite cambiar de
 * Codex a otro adaptador sin que la política de elegibilidad cambie.
 */
import { spawnSync } from "node:child_process";

import { type DespachoDeFase, type FaseDelAgente, type ModeloDeFase } from "@valmen/adapter";

import {
  EXIT_INVARIANT,
  EXIT_SCHEMA,
  impactIdsInFields,
  parseTicket,
} from "@valmen/core";
import { criterioDeclarado, extractCriteriaSpecs } from "@valmen/gate";
import { AUTONOMOUS_DEFAULT_MAX_MINUTES, type AutonomousExecutorConfig } from "@valmen/adapter";

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
import {
  asegurarRamaDeTrabajo,
  estadoDelArbolDeTrabajo,
  hashDeArchivos,
  integrarTicket,
  type RutasPropias,
  repartirCambios,
} from "./integration-commit.js";
import { registrarFase, resolverDespachoDeFase } from "./journey-phases.js";
import { UNATTENDED_ENV, aprobacionDePlanVigente } from "./plan-approval.js";
import { runGate } from "./gate.js";
import { transition } from "./transition.js";

/** Resultado portable de invocar un ejecutor, inyectable en las pruebas. */
export interface AutonomousExecutorResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
  /** `true` si el ejecutor superó el tiempo máximo y se cortó (R-JORN-007). */
  readonly timedOut?: boolean;
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
  /** Borde del ejecutor; recibe también el entorno con que se lanza (`VALMEN_UNATTENDED`). */
  readonly execute?: (
    command: AutonomousExecutorCommand,
    entorno?: Readonly<Record<string, string>>,
  ) => AutonomousExecutorResult;
  /**
   * Obsoleto desde R-PERF-004: el ejecutor y el modelo se resuelven siempre desde el perfil en
   * el momento de lanzar, y una resolución externa no puede saltarse la autorización.
   */
  readonly modelo?: ModeloDeFase | undefined;
  /** La fase que se ejecuta; por defecto `implementation`. */
  readonly fase?: FaseDelAgente | undefined;
  /**
   * Con el contexto de integración, cada ticket que termina queda en su propio commit sobre la
   * rama de trabajo (R-JORN-009). Sin él se entrega como siempre, sin commitear.
   */
  readonly integracion?: {
    readonly ramaDeTrabajo: string;
    readonly ramasProtegidas: readonly string[];
    /** Rutas que la propia jornada deja sin commitear: no detienen ni se commitean. */
    readonly propias?: RutasPropias | undefined;
  } | undefined;
  /** Reloj inyectable para que el recibo de parada sea reproducible en pruebas. */
  readonly now?: (() => Date) | undefined;
}

export interface AutonomousRunResult {
  readonly ticketId: string;
  readonly status: "delivered" | "executor-failed" | "verification-failed" | "stopped";
  readonly detail: string;
  readonly executor: AutonomousExecutorCommand;
  readonly stop?: AutonomousStopReceipt | undefined;
  /** El commit del ticket, si se integró (R-JORN-009). */
  readonly commit?: string | undefined;
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

/**
 * Las razones de política que no dependen de la fase: tipo, riesgo y módulo. La preparación, la
 * selección de la jornada y la cola autónoma comparten esta única lectura de la política.
 */
export function razonesDePolitica(
  fields: { readonly type: string; readonly risk_level: string; readonly module: string },
  policy: ReturnType<typeof autonomousConfig>,
): string[] {
  const reasons: string[] = [];
  if (!policy.eligible.types.includes(fields.type)) reasons.push("su tipo no está habilitado");
  if (!riskAtMost(fields.risk_level, policy.eligible.maxRisk)) {
    reasons.push("supera el riesgo máximo");
  }
  if (policy.eligible.excludedModules.includes(fields.module.toLowerCase())) {
    reasons.push("su módulo está excluido");
  }
  return reasons;
}

/** Razones mecánicas por las que un ticket no pertenece a la cola. */
function ineligibility(text: string, policy: ReturnType<typeof autonomousConfig>): string[] {
  const ticket = parseTicket(text);
  const reasons: string[] = [];
  if (ticket.fields.workflow_status !== "approved") reasons.push("no está en approved");
  reasons.push(...razonesDePolitica(ticket.fields, policy));
  for (const requirement of policy.eligible.require) {
    // La aprobación es un evento registrado con actor, fuente y hash (R-CTRL-001): la línea
    // escrita en el plan no la reemplaza.
    if (requirement === "plan-approved" && aprobacionDePlanVigente(ticket).estado !== "vigente") {
      reasons.push("no tiene la aprobación del plan registrada");
    }
    if (requirement === "tests-declared") {
      const criteria = extractCriteriaSpecs(ticket.sections["Criterios de aceptación"]);
      if (criteria.length === 0 || criteria.some((criterion) => !criterioDeclarado(criterion))) {
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

/** El prompt de la fase de ejecución: no ordena aprobar nada ni mover a un estado ilegal. */
export function promptFor(ticketId: string): string {
  return [
    `Continúa exclusivamente el ticket ${ticketId} en el registro del proyecto.`,
    "Lee el ticket, AGENTS.md y las skills aplicables antes de modificar código.",
    "Implementa solo su plan, agrega y ejecuta pruebas, y documenta el contrato de entrega.",
    "No hagas commit, push, cierre, QA, migraciones, despliegues ni cambios fuera de alcance.",
    "Al terminar, deja el ticket y el árbol listos para que el harness corra qa-mechanical.",
  ].join("\n");
}

function execute(
  command: AutonomousExecutorCommand,
  root: string,
  entorno: Readonly<Record<string, string>> = {},
  maxMinutes: number = AUTONOMOUS_DEFAULT_MAX_MINUTES,
): AutonomousExecutorResult {
  const result = spawnSync(command.command, command.args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...entorno },
    // El tiempo máximo de la política: un ejecutor que no termina no puede dejar la jornada colgada.
    timeout: Math.round(maxMinutes * 60_000),
    killSignal: "SIGKILL",
  });
  const agotado = (result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
  return {
    status: agotado ? 124 : (result.status ?? 1),
    stdout: result.stdout ?? "",
    stderr: agotado ? `El ejecutor superó el tiempo máximo de ${maxMinutes} minutos y se cortó.` : (result.stderr ?? ""),
    ...(agotado ? { timedOut: true } : {}),
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

/** ¿El ticket trae el contrato de pruebas escrito en `## Pruebas`? */
export function contratoDePruebasEscrito(ticketText: string): boolean {
  const seccion = parseTicket(ticketText).sections["Pruebas"] ?? "";
  const limpia = seccion.replace(/<!--[\s\S]*?-->/g, "").trim();
  if (limpia === "" || /^pendiente\.?$/i.test(limpia)) return false;
  // El contrato son comandos exactos: al menos uno entre comillas invertidas.
  return /`[^`\n]+`/.test(limpia);
}

/** Los comandos del contrato de pruebas: lo que va entre comillas invertidas en `## Pruebas`. */
export function comandosDelContrato(ticketText: string): string[] {
  const seccion = (parseTicket(ticketText).sections["Pruebas"] ?? "").replace(/<!--[\s\S]*?-->/g, "");
  return [...seccion.matchAll(/`([^`\n]+)`/g)].map((m) => (m[1] as string).trim()).filter((c) => c !== "");
}

/**
 * Selecciona y ejecuta una única entrada, sin paralelismo ni reintentos, y deja el registro
 * de la sesión por fase (R-JORN-006).
 */
export async function runAutonomous(request: AutonomousRunRequest): Promise<AutonomousRunResult> {
  const inicio = Date.now();
  const contexto: { despacho?: DespachoDeFase } = {};
  const resultado = await runAutonomousInner(request, contexto);
  const politica = autonomousConfig(request.paths.root);
  if (politica.executor !== null) {
    const despacho = contexto.despacho;
    registrarFase(request.paths.root, {
      ticketId: resultado.ticketId,
      fase: request.fase ?? "implementation",
      // El ejecutor que realmente se lanzó; si el despacho se detuvo, ninguno.
      ejecutor: despacho?.ok === true && resultado.stop?.reason !== "executor-unauthorized" ? despacho.ejecutor : "ninguno",
      modelo: despacho?.ok === true ? despacho.model : politica.executor.model,
      esfuerzo: despacho?.ok === true ? despacho.effort : politica.executor.effort,
      origenDelModelo:
        despacho === undefined
          ? "política (sin despacho resuelto)"
          : despacho.ok
            ? `${despacho.origen}: ${despacho.motivo}`
            : `sin despacho: ${despacho.motivo}`,
      duracionMs: Date.now() - inicio,
      resultado: resultado.status,
    });
  }
  return resultado;
}

async function runAutonomousInner(
  request: AutonomousRunRequest,
  contexto: { despacho?: DespachoDeFase },
): Promise<AutonomousRunResult> {
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

  // R-PERF-004: el ejecutor y el modelo salen del proveedor del perfil, y el ejecutor tiene que
  // estar autorizado en `execution.dispatch-executors` justo al lanzar. Si no, no se lanza nada.
  const fase = request.fase ?? "implementation";
  const despacho = resolverDespachoDeFase(request.paths.root, fase);
  if (despacho !== null) contexto.despacho = despacho;
  if (despacho === null || !despacho.ok) {
    const detalle = despacho === null ? "La autonomía no declara un ejecutor seguro." : `El despacho de la fase ${fase} se detuvo: ${despacho.motivo}.`;
    const stop = recordAutonomousStop(request.paths, {
      ticketId: selected.id,
      reason: "executor-unauthorized",
      detail: detalle,
      workflowStatus: "approved",
      now: request.now?.() ?? new Date(),
    });
    return { ticketId: selected.id, status: "stopped", detail: detalle, executor: { command: "", args: [] }, stop };
  }
  const executorDeFase: AutonomousExecutorConfig = {
    id: despacho.ejecutor as AutonomousExecutorConfig["id"],
    model: despacho.model,
    effort: despacho.effort as AutonomousExecutorConfig["effort"],
  };
  const command = autonomousExecutorCommand(executorDeFase, request.paths.root, promptFor(selected.id));
  // La integración parte de un árbol limpio en la rama de trabajo: lo comprueba antes de mover el
  // ticket, porque la propia transición edita el ticket y lo ensuciaría.
  let arbolLimpioAlEmpezar = true;
  if (request.integracion !== undefined) {
    asegurarRamaDeTrabajo({
      root: request.paths.root,
      ramaDeTrabajo: request.integracion.ramaDeTrabajo,
      ramasProtegidas: request.integracion.ramasProtegidas,
      ...(request.integracion.propias === undefined ? {} : { propias: request.integracion.propias }),
    });
    arbolLimpioAlEmpezar = estadoDelArbolDeTrabajo(request.paths.root, undefined, request.integracion.propias).length === 0;
    if (!arbolLimpioAlEmpezar) {
      throw Object.assign(
        new Error("El árbol de trabajo no está limpio: la jornada no despacha un ticket sobre cambios de otro."),
        { exitCode: EXIT_INVARIANT },
      );
    }
  }

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

  // El ejecutor hereda la marca de sesión desatendida: no puede registrar aprobaciones.
  const entorno = { [UNATTENDED_ENV]: "1" };
  const result = (request.execute ?? ((item, env) => execute(item, request.paths.root, env, policy.limits.maxMinutes)))(command, entorno);
  if (result.timedOut === true) {
    return stopResult(
      request.paths,
      selected.id,
      command,
      "executor-timeout",
      `El ejecutor superó el tiempo máximo de ${policy.limits.maxMinutes} minutos y se cortó.`,
      request.now?.() ?? new Date(),
    );
  }
  if (result.status !== 0) {
    return stopResult(
      request.paths,
      selected.id,
      command,
      "executor-failed",
      `El ejecutor terminó con error (código ${result.status}): ${(result.stderr || "sin salida de error").slice(0, 200)}`,
      request.now?.() ?? new Date(),
    );
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

  // El árbol que se va a probar: el contenido de los archivos funcionales justo antes de
  // `qa-mechanical`. El commit tiene que contener exactamente esto.
  // Al commitear, el índice del registro sí viaja con el ticket (lo regenera su transición).
  const propiasAlCommitear: RutasPropias | undefined =
    request.integracion?.propias === undefined
      ? undefined
      : (ruta) => ruta !== `${request.paths.ticketsDir}/index.md` && (request.integracion?.propias?.(ruta) ?? false);
  const archivosFuncionales =
    request.integracion === undefined
      ? []
      : repartirCambios(estadoDelArbolDeTrabajo(request.paths.root, undefined, propiasAlCommitear), request.paths, selected.id).funcionales;
  const hashProbado = hashDeArchivos(request.paths.root, archivosFuncionales);

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
    return stopResult(
      request.paths,
      selected.id,
      command,
      "verification-failed",
      `La verificación mecánica falló: ${(gate.stderr || gate.stdout || "sin detalle").slice(0, 200)}`,
      request.now?.() ?? new Date(),
    );
  }
  // El contrato de pruebas se comprueba en código: sin él, el responsable no sabe qué correr.
  const despues = allDocuments(request.paths).find(({ ticket }) => ticket.id === selected.id);
  if (despues !== undefined && !contratoDePruebasEscrito(despues.ticket.text)) {
    return stopResult(
      request.paths,
      selected.id,
      command,
      "verification-failed",
      "El ticket no trae el contrato de pruebas en `## Pruebas` (comandos exactos entre comillas invertidas); no pasa a awaiting_user_tests.",
      request.now?.() ?? new Date(),
    );
  }
  transition({ paths: request.paths, ticketId: selected.id, entity: "ticket", to: "awaiting_user_tests" });

  // El commit por ticket (R-JORN-009): solo con el contexto de integración y tras las pruebas.
  if (request.integracion !== undefined) {
    const recibos = currentReceipts(readReceipts(request.paths, selected.id)).filter((r) => r.gate === "qa-mechanical");
    const integrado = integrarTicket({
      paths: request.paths,
      ticketId: selected.id,
      titulo: parseTicket(selected.text).fields.title,
      ramaDeTrabajo: request.integracion.ramaDeTrabajo,
      ramasProtegidas: request.integracion.ramasProtegidas,
      arbolLimpioAlEmpezar,
      ...(propiasAlCommitear === undefined ? {} : { propias: propiasAlCommitear }),
      hashProbado,
      recibo: recibos[0]?.id ?? "sin recibo",
    });
    if (integrado.estado === "rechazado") {
      return stopResult(
        request.paths,
        selected.id,
        command,
        "verification-failed",
        `No se commiteó el ticket: ${integrado.motivos.join(" ")}`,
        request.now?.() ?? new Date(),
      );
    }
    return { ticketId: selected.id, status: "delivered", detail: gate.stdout, executor: command, commit: integrado.commit };
  }
  return { ticketId: selected.id, status: "delivered", detail: gate.stdout, executor: command };
}
