/**
 * `valmen delegation`: el modo de corrida delegada.
 *
 * El PO delega en un mensaje una feature o una lista de tickets; el agente los
 * trabaja uno tras otro. Esto es lo que antes se reescribía con scripts en cada
 * corrida (`docs/referencia-corrida-autonoma/`): los pasos mecánicos que se
 * repiten por ticket, con las cinco fricciones medidas resueltas en código.
 *
 * Lo que **no** hace: escribir el análisis, el plan o el código —eso es del
 * agente—, decidir un BLOCK ni un gate humano duro, ni commitear o publicar.
 *
 * Vive en el CLI y no en el motor porque necesita la decisión humana sobre un
 * recibo (`recordHumanDecision`, del servidor) y el routing de modelos del
 * proyecto; el motor guarda el registro y las reglas puras (`engine/delegation`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  EXIT_INVARIANT,
  EXIT_SCHEMA,
  MutationLock,
  atomicWrite,
  hasPlanGate,
  hasRecordedUserTestOutcome,
  parseTicket,
  toFailure,
} from "@valmen/core";
import { extractCriteriaSpecs } from "@valmen/gate";
import {
  type Delegation,
  type RegistryPaths,
  addAiUsage,
  addEvidence,
  addPoint,
  addRetest,
  appendDelegationEvent,
  assertInScope,
  closeAttempt,
  delegationEvents,
  delegationProgress,
  grantDelegation,
  hardGateStop,
  qaClose,
  qaStart,
  readReceipts,
  resolveDelegation,
  ticketPathFor,
  transition,
  veredictoDeCompuerta,
} from "@valmen/engine";
import { recordHumanDecision } from "@valmen/server";

import { type CommandResult, validateOne } from "./commands.js";

type Flags = Readonly<Record<string, string | true>>;

const ACTOR = "Claude Code por delegación del PO";

function ok(stdout: string): CommandResult {
  return { stdout, stderr: "", exitCode: 0 };
}
function error(stderr: string, exitCode: number): CommandResult {
  return { stdout: "", stderr: stderr.endsWith("\n") ? stderr : `${stderr}\n`, exitCode };
}
function texto(flags: Flags, nombre: string): string | undefined {
  const v = flags[nombre];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/** Lo que el orquestador necesita de fuera: se inyecta para poder probarlo sin red ni git. */
export interface DelegationDeps {
  readonly runGate: (gateId: string, ticketId: string) => Promise<CommandResult>;
  readonly decide: typeof recordHumanDecision;
  /** El HEAD vigente: es lo que `qa-start` compara, no el commit de la implementación. */
  readonly head: (root: string) => string;
  /** Los archivos con cambios sin commitear entre los dados. */
  readonly dirty: (root: string, files: readonly string[]) => string[];
}

export const REAL_GIT: Pick<DelegationDeps, "head" | "dirty"> = {
  head: (root) =>
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  dirty: (root, files) =>
    execFileSync("git", ["status", "--porcelain", "--", ...files], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => l.slice(3)),
};

/** Las dependencias de siempre: la decisión humana del servidor y git de verdad. */
export function delegationDeps(runGate: DelegationDeps["runGate"]): DelegationDeps {
  return { runGate, decide: recordHumanDecision, ...REAL_GIT };
}

/** Edita el texto del ticket bajo el lock del registro. */
function editarTicket(
  paths: RegistryPaths,
  ticketId: string,
  cambio: (texto: string) => string,
): void {
  MutationLock.run(paths.root, () => {
    const ruta = ticketPathFor(paths, ticketId);
    const antes = readFileSync(ruta, "utf8");
    const despues = cambio(antes);
    if (despues !== antes) atomicWrite(ruta, despues);
  });
}

function leer(paths: RegistryPaths, ticketId: string): string {
  return readFileSync(ticketPathFor(paths, ticketId), "utf8");
}

/** Una parada: lo que se dice, y a quién le toca. Queda anotada en la delegación. */
function parada(
  paths: RegistryPaths,
  delegation: Delegation,
  ticketId: string,
  motivo: string,
): CommandResult {
  appendDelegationEvent(paths.root, delegation.id, {
    kind: "stop",
    ticketId,
    detail: motivo,
  });
  return error(`DETENIDO en ${ticketId}: ${motivo}`, EXIT_INVARIANT);
}

/**
 * Deja una compuerta aprobada, o dice por qué no se puede.
 *
 * APPROVE sigue. REVIEW se decide por delegación **solo con un motivo**, que viaja
 * al recibo junto con las palabras del PO. BLOCK nunca se decide: es de una persona.
 */
async function resolverCompuerta(
  paths: RegistryPaths,
  delegation: Delegation,
  ticketId: string,
  gateId: string,
  motivo: string | undefined,
  deps: DelegationDeps,
  /** Correrla aunque haya un recibo aprobado: el recibo ata su veredicto al estado del ticket. */
  siempre = false,
): Promise<string | null> {
  let veredicto = veredictoDeCompuerta(readReceipts(paths, ticketId), gateId);
  if (siempre || veredicto.tipo !== "aprobada") {
    const corrida = await deps.runGate(gateId, ticketId);
    veredicto = veredictoDeCompuerta(readReceipts(paths, ticketId), gateId);
    if (veredicto.tipo === "sin-recibo") {
      return `la compuerta ${gateId} no dejó recibo: ${(corrida.stderr || corrida.stdout).trim().slice(-300)}`;
    }
  }
  if (veredicto.tipo === "aprobada") return null;
  if (veredicto.tipo === "bloqueada") {
    return (
      `la compuerta ${gateId} dio BLOCK (${veredicto.recibo.reason}). Un BLOCK no se aprueba por ` +
      "delegación: se corrige el artefacto y se vuelve a correr, o se consulta al PO."
    );
  }

  const recibo = veredicto.recibo;
  if (recibo.outcome === "review" && motivo === undefined) {
    return (
      `la compuerta ${gateId} cayó en REVIEW (${recibo.reason}). Si el criterio dice que no debe ` +
      "bloquear, repetí con --reason «por qué» y se aprueba por delegación; si no, es del PO."
    );
  }
  const razon =
    `por delegación ${delegation.id} del PO ${delegation.actor}: ` +
    (motivo ?? `el evaluador aprobó (${recibo.reason}) y la política lo escala a una persona`) +
    ` — palabras del PO: «${delegation.quote}»`;
  const resultado = deps.decide(paths, ticketId, recibo.id, {
    decision: "approve",
    actor: ACTOR,
    reason: razon,
    channel: "delegation",
  });
  if (!resultado.ok) return `no se pudo registrar la decisión de ${gateId}: ${resultado.error}`;
  appendDelegationEvent(paths.root, delegation.id, {
    kind: "decision",
    ticketId,
    detail: `${gateId} ${recibo.outcome} → approve (${recibo.id}): ${motivo ?? "escalado por política"}`,
  });
  return null;
}

export interface AdvanceOptions {
  readonly reason?: string | undefined;
}

/**
 * `delegation advance`: de la fase de análisis a `in_progress`.
 *
 * Se llama con el análisis y el plan **ya escritos** en el ticket. Retoma donde
 * esté el ticket: `intake`, `analyzed`, `planned` o `approved`.
 */
export async function advanceDelegated(
  paths: RegistryPaths,
  delegation: Delegation,
  ticketId: string,
  options: AdvanceOptions,
  deps: DelegationDeps,
): Promise<CommandResult> {
  assertInScope(paths, delegation, ticketId);
  const dura = hardGateStop(leer(paths, ticketId));
  if (dura !== null) return parada(paths, delegation, ticketId, dura);

  const pasos: string[] = [];
  const mover = (to: string): CommandResult | null => {
    const v = validateOne(paths, ticketId);
    if (v.exitCode !== 0) return v;
    transition({ paths, ticketId, entity: "ticket", to });
    pasos.push(to);
    return null;
  };
  const estado = (): string => parseTicket(leer(paths, ticketId)).fields.workflow_status;

  try {
    if (estado() === "intake") {
      const fallo = mover("analyzed");
      if (fallo !== null) return fallo;
    }
    if (estado() === "analyzed") {
      const stop = await resolverCompuerta(paths, delegation, ticketId, "analysis", options.reason, deps);
      if (stop !== null) return parada(paths, delegation, ticketId, stop);
      const fallo = mover("planned");
      if (fallo !== null) return fallo;
    }
    if (estado() === "planned") {
      const stop = await resolverCompuerta(paths, delegation, ticketId, "plan", options.reason, deps);
      if (stop !== null) return parada(paths, delegation, ticketId, stop);
      // La aprobación del plan se atribuye a la política humana —la delegación— y
      // cita sus palabras: nunca al modelo.
      if (!hasPlanGate(parseTicket(leer(paths, ticketId)))) {
        const linea =
          `- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por ` +
          `delegación ${delegation.id} del ${delegation.at.slice(0, 10)} («${delegation.quote.replaceAll("\n", " ")}»); ` +
          "compuerta `plan` decidida y registrada en su recibo.";
        editarTicket(paths, ticketId, (t) =>
          /^- Gate de plan y aprobación:.*$/m.test(t)
            ? t.replace(/^- Gate de plan y aprobación:.*$/m, () => linea)
            : t.replace(/^## Plan\n/m, () => `## Plan\n\n${linea}\n`),
        );
      }
      const fallo = mover("approved");
      if (fallo !== null) return fallo;
    }
    if (estado() === "approved") {
      const fallo = mover("in_progress");
      if (fallo !== null) return fallo;
    }
  } catch (caught) {
    const f = toFailure(caught);
    return error(f.message, f.exitCode);
  }

  appendDelegationEvent(paths.root, delegation.id, {
    kind: "note",
    ticketId,
    detail: `avanzó a ${estado()}${pasos.length > 0 ? ` (${pasos.join(" → ")})` : ""}`,
  });
  return ok(
    `${ticketId}: ${estado()}${pasos.length > 0 ? ` (pasó por ${pasos.join(" → ")})` : ""}. ` +
      "Listo para implementar.\n",
  );
}

export interface CloseOptions {
  readonly files: readonly string[];
  readonly environment: string | undefined;
  /** Qué se ejecutó y qué dio, en una línea: es la descripción de la evidencia. */
  readonly tests: string | undefined;
  readonly testsPassed: boolean;
  readonly technicalSummary: string | undefined;
  readonly functionalSummary: string | undefined;
  readonly releaseImpact: string | undefined;
  readonly visual: boolean;
  /** Las palabras del PO al confirmar un ticket que esperaba su validación. */
  readonly poConfirmation: string | undefined;
  readonly usageSource: string | undefined;
  readonly confidence: string | undefined;
  readonly model: string | undefined;
  readonly notes: string | undefined;
}

/** Criterios que solo puede verificar una persona y siguen sin marcar. */
function criteriosDelPo(textoTicket: string): string[] {
  const seccion = parseTicket(textoTicket).sections["Criterios de aceptación"];
  const abiertos = seccion.split("\n").filter((l) => /^\s*-\s+\[ \]/.test(l));
  return extractCriteriaSpecs(seccion)
    .filter((c) => c.manual)
    .map((c) => c.text)
    .filter((t) => abiertos.some((l) => l.includes(t.slice(0, 40))));
}

/**
 * `delegation close`: de `in_progress` a `closed`, o a `awaiting_user_tests`.
 *
 * Las cinco fricciones de la corrida real, en código: el punto lleva `--files`
 * (1), el QA arranca con el HEAD vigente (2 y 3), la feature se avanza con
 * `feature advance` (4) y el consumo se declara `manual:` sin números (5).
 */
export async function closeDelegated(
  paths: RegistryPaths,
  delegation: Delegation,
  ticketId: string,
  o: CloseOptions,
  deps: DelegationDeps,
): Promise<CommandResult> {
  assertInScope(paths, delegation, ticketId);
  const inicial = leer(paths, ticketId);
  const dura = hardGateStop(inicial);
  if (dura !== null) return parada(paths, delegation, ticketId, dura);

  const estado = parseTicket(inicial).fields.workflow_status;
  if (estado !== "in_progress" && estado !== "awaiting_user_tests") {
    return error(
      `${ticketId} está en ${estado}: el cierre delegado parte de in_progress o de awaiting_user_tests.`,
      EXIT_INVARIANT,
    );
  }
  const faltan = [
    ["--environment", o.environment],
    ["--tests", o.tests],
    ["--technical-summary", o.technicalSummary],
    ["--functional-summary", o.functionalSummary],
    ["--release-impact", o.releaseImpact],
  ].filter(([, v]) => v === undefined);
  if (faltan.length > 0) {
    return error(`delegation close requiere ${faltan.map(([n]) => n).join(", ")}.`, EXIT_SCHEMA);
  }
  const environment = o.environment as string;
  const tests = (o.tests as string).replace(/`/g, "");

  try {
    let palabrasDelPo: string;
    if (estado === "in_progress") {
      if (!o.testsPassed) {
        return error(
          "delegation close requiere --tests-passed: el agente declara que ejecutó las pruebas del " +
            "ticket y dieron el resultado esperado. Sin eso no se cierra nada.",
          EXIT_SCHEMA,
        );
      }
      if (o.files.length === 0) {
        return error("delegation close requiere --files con los archivos de la implementación.", EXIT_SCHEMA);
      }
      const sucios = deps.dirty(paths.root, o.files);
      if (sucios.length > 0) {
        return parada(
          paths,
          delegation,
          ticketId,
          `hay cambios sin commitear en ${sucios.join(", ")}. El QA se ancla al HEAD: commiteá la ` +
            "implementación (tras valmen secrets) y repetí.",
        );
      }
      // Los criterios con comando declarado se marcan: las pruebas ya corrieron.
      editarTicket(paths, ticketId, (t) =>
        t.replace(/^- \[ \] (.*)(?=\n\s+<!-- test:)/gm, "- [x] $1"),
      );
      const v = validateOne(paths, ticketId);
      if (v.exitCode !== 0) return v;
      const stop = await resolverCompuerta(
        paths,
        delegation,
        ticketId,
        "qa-mechanical",
        undefined,
        deps,
        true,
      );
      if (stop !== null) return parada(paths, delegation, ticketId, stop);
      transition({ paths, ticketId, entity: "ticket", to: "awaiting_user_tests" });

      const delPo = criteriosDelPo(leer(paths, ticketId));
      if (o.visual || delPo.length > 0) {
        appendDelegationEvent(paths.root, delegation.id, {
          kind: "note",
          ticketId,
          detail: `queda en awaiting_user_tests: ${o.visual ? "revisión visual" : "criterios manuales del PO"}`,
        });
        return ok(
          `${ticketId} queda en awaiting_user_tests: ${o.visual ? "es una revisión visual" : "tiene criterios que solo verifica el PO"}.` +
            (delPo.length > 0 ? `\nSuyos:\n${delPo.map((c) => `  · ${c}`).join("\n")}` : "") +
            "\nSigue con el siguiente ticket de la delegación.\n",
        );
      }
      palabrasDelPo = `«${delegation.quote.replaceAll("\n", " ")}» — delegación ${delegation.id} del PO ${delegation.actor}`;
    } else {
      if (o.poConfirmation === undefined) {
        return error(
          `${ticketId} espera al PO: delegation close pide --po-confirmation con las palabras literales ` +
            "con que confirmó. El agente no confirma por él lo que solo el PO puede verificar.",
          EXIT_SCHEMA,
        );
      }
      palabrasDelPo = o.poConfirmation;
    }

    // ── QA ────────────────────────────────────────────────────────────────
    const actual = (): ReturnType<typeof parseTicket> => parseTicket(leer(paths, ticketId));
    if (!hasRecordedUserTestOutcome(actual())) {
      editarTicket(paths, ticketId, (t) =>
        t.replace(
          /\n## QA\n/,
          () =>
            `\n- Resultado del PO: ${palabrasDelPo}. Las pruebas del ticket las ejecutó el agente y ` +
            `dieron el resultado esperado: ${tests}\n\n## QA\n`,
        ),
      );
    }
    if (actual().fields.workflow_status === "awaiting_user_tests") {
      const v = validateOne(paths, ticketId);
      if (v.exitCode !== 0) return v;
      transition({ paths, ticketId, entity: "ticket", to: "in_qa" });
    }
    if (actual().blocks.Puntos.length === 0) {
      if (o.files.length === 0) {
        return error("delegation close requiere --files para anotar el punto de QA.", EXIT_SCHEMA);
      }
      addPoint({
        paths,
        ticketId,
        title: `Verificación delegada de ${ticketId}`,
        severity: "normal",
        actual: "La implementación está entregada y falta verificar sus criterios.",
        expected: "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
        affectedFiles: o.files,
      });
      for (const to of ["analyzed", "in_progress", "awaiting_retest"]) {
        transition({ paths, ticketId, entity: "point", pointId: "POINT-001", to });
      }
    }
    if (actual().blocks.Evidencia.length === 0) {
      addEvidence({
        paths,
        ticketId,
        kind: "automated-test",
        pointId: "POINT-001",
        reference: "worktree",
        description: tests.split("\n")[0] as string,
      });
    }
    if (actual().blocks.QA.length === 0) {
      qaStart({
        paths,
        ticketId,
        environment,
        buildReference: `commit:${deps.head(paths.root)}`,
      });
    }
    addRetest({ paths, ticketId, pointId: "POINT-001", result: "approved", poConfirmation: palabrasDelPo });
    transition({ paths, ticketId, entity: "point", pointId: "POINT-001", to: "closed" });
    qaClose({ paths, ticketId, result: "approved", poConfirmation: palabrasDelPo });
    transition({ paths, ticketId, entity: "ticket", to: "qa_approved" });
    if (actual().blocks["Consumo de IA"].length === 0) {
      addAiUsage({
        paths,
        ticketId,
        source: o.usageSource ?? `manual:sesión de Claude Code por delegación ${delegation.id}`,
        confidence: o.confidence ?? "medium",
        ...(o.model === undefined ? {} : { model: o.model }),
        notes:
          o.notes ??
          "Sesión que atendió varios tickets de la delegación; sin números por ticket para no " +
            "repartir a ojo un costo que no se midió por ticket.",
      });
    }
    closeAttempt({
      paths,
      ticketId,
      technicalSummary: o.technicalSummary as string,
      functionalSummary: o.functionalSummary as string,
      qaStatus: "approved",
      releaseImpact: o.releaseImpact as string,
    });
    transition({ paths, ticketId, entity: "ticket", to: "closed" });
    const v = validateOne(paths, ticketId);
    if (v.exitCode !== 0) return v;
  } catch (caught) {
    const f = toFailure(caught);
    return parada(paths, delegation, ticketId, f.message);
  }

  appendDelegationEvent(paths.root, delegation.id, {
    kind: "close",
    ticketId,
    detail: "QA aprobado y ticket cerrado",
  });
  return ok(
    `${ticketId} cerrado por delegación ${delegation.id}. Falta, de tu lado: valmen secrets y el ` +
      "commit local del cierre (el push solo cuando el PO lo ordene).\n",
  );
}

/** `delegation status` / `next`: dónde va la delegación. */
export function statusDelegated(
  paths: RegistryPaths,
  delegation: Delegation,
  soloSiguiente: boolean,
): CommandResult {
  const p = delegationProgress(paths, delegation);
  if (soloSiguiente) {
    if (p.next !== null) return ok(`${p.next.id} (${p.next.state})\n`);
    return ok(
      p.done
        ? "Nada pendiente: todos los tickets del alcance están cerrados o esperan al PO.\n"
        : `Ningún ticket se puede trabajar ahora:\n${p.stopped.map((s) => `  · ${s.id}: ${s.reason}`).join("\n")}\n`,
    );
  }
  const alcance =
    delegation.scope.feature === null
      ? `tickets ${delegation.scope.tickets.join(", ")}`
      : `feature ${delegation.scope.feature}`;
  const lineas = [
    `${delegation.id} — ${alcance}`,
    `PO ${delegation.actor}, ${delegation.at.slice(0, 10)}: «${delegation.quote}»`,
    `Cerrados (${p.closed.length}): ${p.closed.join(", ") || "—"}`,
    `Esperan al PO (${p.waitingPo.length}): ${p.waitingPo.join(", ") || "—"}`,
    `Sigue: ${p.next === null ? "—" : `${p.next.id} (${p.next.state})`}`,
  ];
  if (p.stopped.length > 0) {
    lineas.push("Detenidos:", ...p.stopped.map((s) => `  · ${s.id}: ${s.reason}`));
  }
  const eventos = delegationEvents(paths.root, delegation.id);
  lineas.push(`Eventos registrados: ${eventos.length}`);
  return ok(`${lineas.join("\n")}\n`);
}

/** El despachador de `valmen delegation <sub>`. */
export async function runDelegation(
  paths: RegistryPaths,
  args: readonly string[],
  flags: Flags,
  deps: DelegationDeps,
): Promise<CommandResult> {
  const [sub] = args;
  try {
    if (sub === "grant") {
      const tickets = texto(flags, "tickets");
      const d = grantDelegation({
        paths,
        feature: texto(flags, "feature"),
        tickets: tickets === undefined ? undefined : tickets.split(","),
        quote: texto(flags, "quote") ?? "",
        actor: texto(flags, "actor"),
      });
      return ok(`Delegación ${d.id} registrada en .valmen/delegations/${d.id}.jsonl.\n`);
    }
    const delegation = resolveDelegation(paths.root, texto(flags, "delegation"));
    if (sub === "status") return statusDelegated(paths, delegation, false);
    if (sub === "next") return statusDelegated(paths, delegation, true);

    const id = texto(flags, "id");
    if ((sub === "advance" || sub === "close") && id === undefined) {
      return error(`delegation ${sub} requiere --id <TICKET-ID>.`, EXIT_SCHEMA);
    }
    if (sub === "advance") {
      return await advanceDelegated(paths, delegation, id as string, { reason: texto(flags, "reason") }, deps);
    }
    if (sub === "close") {
      return await closeDelegated(
        paths,
        delegation,
        id as string,
        {
          files: (texto(flags, "files") ?? "").split(",").map((f) => f.trim()).filter((f) => f !== ""),
          environment: texto(flags, "environment"),
          tests: texto(flags, "tests"),
          testsPassed: flags["tests-passed"] === true,
          technicalSummary: texto(flags, "technical-summary"),
          functionalSummary: texto(flags, "functional-summary"),
          releaseImpact: texto(flags, "release-impact"),
          visual: flags["visual"] === true,
          poConfirmation: texto(flags, "po-confirmation"),
          usageSource: texto(flags, "source"),
          confidence: texto(flags, "confidence"),
          model: texto(flags, "model"),
          notes: texto(flags, "notes"),
        },
        deps,
      );
    }
    return error("delegation requiere un subcomando: grant, status, next, advance o close.", EXIT_SCHEMA);
  } catch (caught) {
    const f = toFailure(caught);
    return error(f.message, f.exitCode);
  }
}
