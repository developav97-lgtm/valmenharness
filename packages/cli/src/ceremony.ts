/**
 * Las ceremonias de aprobar y cerrar, con la frase literal del PO.
 *
 * La cadena de resolver una compuerta, aprobar el plan y cerrar con QA del PO vivía atada a una
 * delegación (`delegation.ts`). Acá está sin esa atadura: recibe la frase, el actor, el canal y un
 * sumidero de eventos, y la usan los dos caminos —`delegation advance|close` y los comandos
 * `valmen approve` y `valmen close`— sin duplicarla.
 *
 * Lo que **no** hace: decidir un BLOCK, aprobar un ticket SECURITY ni inventar la frase del PO.
 * Cada atajo se detiene en el primer paso que falla y dice cuál fue y en qué estado quedó el
 * ticket; repetido, retoma desde ahí.
 */
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
import {
  type RegistryPaths,
  addAiUsage,
  addEvidence,
  addPoint,
  addRetest,
  aprobacionDePlanVigente,
  closeAttempt,
  markManualCriteria,
  qaClose,
  qaStart,
  readReceipts,
  registrarAprobacionDePlan,
  ticketPathFor,
  transition,
  unmarkedCriteria,
  unmarkedMessage,
  veredictoDeCompuerta,
} from "@valmen/engine";
import type { recordHumanDecision } from "@valmen/server";

import { type CommandResult, guardarConsumoDeSesiones, validateOne } from "./commands.js";

type Flags = Readonly<Record<string, string | true>>;

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

/** Edita el texto del ticket bajo el lock del registro. */
export function editarTicket(
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

export function leer(paths: RegistryPaths, ticketId: string): string {
  return readFileSync(ticketPathFor(paths, ticketId), "utf8");
}

/** Lo que una ceremonia necesita de fuera: se inyecta para probarla sin red ni git. */
export interface CeremonyDeps {
  readonly runGate: (gateId: string, ticketId: string) => Promise<CommandResult>;
  readonly decide: typeof recordHumanDecision;
  /** El HEAD vigente: es lo que `qa-start` compara. */
  readonly head: (root: string) => string;
  /** Carpeta personal donde viven las sesiones del cliente; se inyecta para probar sin tocar la real. */
  readonly home?: string;
}

/** Quién decide una compuerta y con qué palabras: lo que cambia entre la delegación y el atajo. */
export interface OrigenDeDecision {
  /** Cómo se nombra el canal en los mensajes: «delegación», «el atajo approve». */
  readonly via: string;
  /** Quien queda como autor de la decisión en el recibo. */
  readonly actor: string;
  readonly canal: string;
  /** El prefijo de la razón: «por delegación DEL-… del PO …». */
  readonly descripcion: string;
  /** Las palabras del PO, tal como las dijo. */
  readonly frase: string;
  /** Anota una decisión tomada (en la delegación, un evento `decision`). */
  readonly anotar: (detalle: string) => void;
}

/**
 * Deja una compuerta aprobada, o dice por qué no se puede.
 *
 * APPROVE sigue. REVIEW se decide **solo con un motivo**, que viaja al recibo junto con las
 * palabras del PO. BLOCK nunca se decide: es de una persona.
 */
export async function resolverCompuerta(
  paths: RegistryPaths,
  ticketId: string,
  gateId: string,
  motivo: string | undefined,
  deps: Pick<CeremonyDeps, "runGate" | "decide">,
  origen: OrigenDeDecision,
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
      `${origen.via}: se corrige el artefacto y se vuelve a correr, o se consulta al PO.`
    );
  }

  const recibo = veredicto.recibo;
  if (recibo.outcome === "review" && motivo === undefined) {
    return (
      `la compuerta ${gateId} cayó en REVIEW (${recibo.reason}). Si el criterio dice que no debe ` +
      `bloquear, repetí con --reason «por qué» y se aprueba por ${origen.via}; si no, es del PO.`
    );
  }
  const razon =
    `${origen.descripcion}: ` +
    (motivo ?? `el evaluador aprobó (${recibo.reason}) y la política lo escala a una persona`) +
    ` — palabras del PO: «${origen.frase}»`;
  const resultado = deps.decide(paths, ticketId, recibo.id, {
    decision: "approve",
    actor: origen.actor,
    reason: razon,
    channel: origen.canal,
  });
  if (!resultado.ok) return `no se pudo registrar la decisión de ${gateId}: ${resultado.error}`;
  origen.anotar(`${gateId} ${recibo.outcome} → approve (${recibo.id}): ${motivo ?? "escalado por política"}`);
  return null;
}

/** Cómo se registra la aprobación del plan y cómo se escribe su línea. */
export interface AprobacionDePlan {
  readonly actor: string;
  readonly source: string;
  readonly quote: string;
  readonly viaDelegacion: boolean;
  /** La línea «Gate de plan y aprobación: …» que se deja en `## Plan`. */
  readonly linea: string;
}

/**
 * Registra la aprobación del plan vigente y deja la línea del gate en `## Plan`.
 *
 * Cada parte se salta si ya está hecha: repetida tras una parada, retoma donde quedó.
 */
export function aprobarPlanConFrase(
  paths: RegistryPaths,
  ticketId: string,
  a: AprobacionDePlan,
): void {
  if (aprobacionDePlanVigente(parseTicket(leer(paths, ticketId))).estado !== "vigente") {
    registrarAprobacionDePlan({
      paths,
      ticketId,
      actor: a.actor,
      source: a.source,
      quote: a.quote.replaceAll("\n", " "),
      ...(a.viaDelegacion ? { viaDelegacion: true } : {}),
    });
  }
  if (!hasPlanGate(parseTicket(leer(paths, ticketId)))) {
    editarTicket(paths, ticketId, (t) =>
      /^- Gate de plan y aprobación:.*$/m.test(t)
        ? t.replace(/^- Gate de plan y aprobación:.*$/m, () => a.linea)
        : t.replace(/^## Plan\n/m, () => `## Plan\n\n${a.linea}\n`),
    );
  }
}

/** Lo que `cerrarConQaDelPo` necesita para llevar un ticket de la espera del PO a `closed`. */
export interface CierreConQaDelPo {
  /** Las palabras del PO, tal como las dijo: van al ticket sin cambiarse. */
  readonly palabrasDelPo: string;
  readonly files: readonly string[];
  readonly environment: string;
  /** Qué se ejecutó y qué dio; la primera línea es la descripción de la evidencia. */
  readonly tests: string;
  readonly technicalSummary: string;
  readonly functionalSummary: string;
  readonly releaseImpact: string;
  readonly head: (root: string) => string;
  /** El consumo de IA si el ticket no tiene entrada; `undefined` detiene el cierre. */
  readonly usageSource: string | undefined;
  readonly confidence: string;
  readonly model: string | undefined;
  readonly notes: string;
}

export type ResultadoDeCierre =
  | { readonly cerrado: true }
  | {
      readonly cerrado: false;
      /** El paso en que se detuvo. */
      readonly paso: string;
      readonly mensaje: string;
      /** Si el paso ya tiene su propio resultado de CLI (validación, bandera que falta). */
      readonly resultado: CommandResult | null;
    };

/**
 * La cadena de QA y cierre con las palabras del PO: resultado en `## Pruebas`, `in_qa`, punto con
 * archivos, evidencia, ciclo de QA con el HEAD, retest, `qa_approved`, consumo y `closed`.
 *
 * Retoma por estado: cada bloque se anexa solo si falta, así una repetición no duplica nada.
 */
export function cerrarConQaDelPo(
  paths: RegistryPaths,
  ticketId: string,
  o: CierreConQaDelPo,
): ResultadoDeCierre {
  let paso = "resultado del PO en ## Pruebas";
  const actual = (): ReturnType<typeof parseTicket> => parseTicket(leer(paths, ticketId));
  const parar = (mensaje: string, resultado: CommandResult | null = null): ResultadoDeCierre => ({
    cerrado: false,
    paso,
    mensaje,
    resultado,
  });
  try {
    if (!hasRecordedUserTestOutcome(actual())) {
      editarTicket(paths, ticketId, (t) =>
        t.replace(
          /\n## QA\n/,
          () =>
            `\n- Resultado del PO: ${o.palabrasDelPo}. Las pruebas del ticket las ejecutó el agente y ` +
            `dieron el resultado esperado: ${o.tests}\n\n## QA\n`,
        ),
      );
    }
    if (actual().fields.workflow_status === "awaiting_user_tests") {
      paso = "paso a in_qa";
      const v = validateOne(paths, ticketId);
      if (v.exitCode !== 0) return parar(v.stderr, v);
      transition({ paths, ticketId, entity: "ticket", to: "in_qa" });
    }
    if (actual().blocks.Puntos.length === 0) {
      paso = "punto de QA";
      if (o.files.length === 0) {
        const r = error("close requiere --files para anotar el punto de QA.", EXIT_SCHEMA);
        return parar(r.stderr, r);
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
    // El ciclo de QA con `commit:` exige una evidencia con referencia de árbol: una evidencia
    // previa sin ella (p. ej. una prueba anotada a mano) no la sustituye.
    const conArbol = (actual().blocks.Evidencia as readonly { reference?: unknown }[]).some(
      (e) => typeof e.reference === "string" && e.reference.startsWith("worktree:sha256:"),
    );
    if (!conArbol) {
      paso = "evidencia";
      addEvidence({
        paths,
        ticketId,
        kind: "automated-test",
        pointId: "POINT-001",
        reference: "worktree",
        description: o.tests.split("\n")[0] as string,
      });
    }
    if (actual().blocks.QA.length === 0) {
      paso = "inicio del ciclo de QA";
      qaStart({
        paths,
        ticketId,
        environment: o.environment,
        buildReference: `commit:${o.head(paths.root)}`,
      });
    }
    if (actual().fields.workflow_status === "in_qa") {
      paso = "retest del punto";
      if (actual().blocks.Retests.length === 0) {
        addRetest({
          paths,
          ticketId,
          pointId: "POINT-001",
          result: "approved",
          poConfirmation: o.palabrasDelPo,
        });
      }
      paso = "cierre del punto";
      if (String(actual().blocks.Puntos.find((p) => p.id === "POINT-001")?.status) !== "closed") {
        transition({ paths, ticketId, entity: "point", pointId: "POINT-001", to: "closed" });
      }
      paso = "cierre del ciclo de QA";
      const qa = actual().blocks.QA;
      if (qa[qa.length - 1]?.result === "pending") {
        qaClose({ paths, ticketId, result: "approved", poConfirmation: o.palabrasDelPo });
      }
      paso = "paso a qa_approved";
      transition({ paths, ticketId, entity: "ticket", to: "qa_approved" });
    }
    if (actual().fields.workflow_status === "qa_approved") {
      paso = "consumo de IA";
      if (actual().blocks["Consumo de IA"].length === 0) {
        if (o.usageSource === undefined) {
          return parar("el ticket no tiene consumo de IA y falta --source con su fuente.");
        }
        addAiUsage({
          paths,
          ticketId,
          source: o.usageSource,
          confidence: o.confidence,
          ...(o.model === undefined ? {} : { model: o.model }),
          notes: o.notes,
        });
      }
      paso = "preparación del cierre";
      if (actual().blocks.Cierre.length === 0) {
        closeAttempt({
          paths,
          ticketId,
          technicalSummary: o.technicalSummary,
          functionalSummary: o.functionalSummary,
          qaStatus: "approved",
          releaseImpact: o.releaseImpact,
        });
      }
      paso = "paso a closed";
      transition({ paths, ticketId, entity: "ticket", to: "closed" });
    }
    paso = "validación final";
    const v = validateOne(paths, ticketId);
    if (v.exitCode !== 0) return parar(v.stderr, v);
  } catch (caught) {
    return parar(toFailure(caught).message);
  }
  return { cerrado: true };
}

// ── Los comandos ─────────────────────────────────────────────────────────────

function estadoDe(paths: RegistryPaths, ticketId: string): string {
  return parseTicket(leer(paths, ticketId)).fields.workflow_status;
}

/** Una parada del atajo: el paso, el motivo y el estado en que quedó el ticket. */
function detenido(paths: RegistryPaths, comando: string, ticketId: string, paso: string, motivo: string): CommandResult {
  return error(
    `DETENIDO en ${ticketId}, paso «${paso}»: ${motivo.trim()}\n` +
      `El ticket quedó en ${estadoDe(paths, ticketId)}. Corregí eso y repetí \`valmen ${comando}\`: retoma desde ahí.`,
    EXIT_INVARIANT,
  );
}

const ACTOR_AGENTE = "Claude Code por orden del PO";

/**
 * `valmen approve --id <ID> --actor <PO> --quote "<frase>" [--reason "<motivo>"]`.
 *
 * Resuelve la compuerta `plan`, registra la aprobación con la frase literal del PO, escribe la
 * línea del gate en `## Plan` y mueve el ticket a `approved`.
 */
export async function approveCommand(
  paths: RegistryPaths,
  flags: Flags,
  deps: Pick<CeremonyDeps, "runGate" | "decide">,
): Promise<CommandResult> {
  const id = texto(flags, "id");
  if (id === undefined) return error("approve requiere --id <TICKET-ID>.", EXIT_SCHEMA);
  const actor = texto(flags, "actor");
  if (actor === undefined) return error("approve requiere --actor <PO>: quien aprueba.", EXIT_SCHEMA);
  const frase = texto(flags, "quote");
  if (frase === undefined) {
    return error("approve requiere --quote con las palabras literales del PO: el agente no las inventa.", EXIT_SCHEMA);
  }
  try {
    const documento = parseTicket(leer(paths, id));
    if (documento.fields.type === "SECURITY") {
      return error(
        `${id} es de seguridad: approve no lo cubre. Siguen los pasos manuales (gate-decide, approve-plan, transition).`,
        EXIT_INVARIANT,
      );
    }
    const estado = documento.fields.workflow_status;
    if (estado !== "planned") {
      return error(
        `${id} está en ${estado}: approve parte de planned (el plan escrito y la compuerta por resolver).`,
        EXIT_INVARIANT,
      );
    }
    const stop = await resolverCompuerta(paths, id, "plan", texto(flags, "reason"), deps, {
      via: "el atajo approve",
      actor,
      canal: "cli",
      descripcion: `por el PO ${actor} (valmen approve)`,
      frase,
      anotar: () => undefined,
    });
    if (stop !== null) return detenido(paths, "approve", id, "compuerta plan", stop);

    let paso = "aprobación del plan";
    try {
      aprobarPlanConFrase(paths, id, {
        actor,
        source: "cli",
        quote: frase,
        viaDelegacion: false,
        linea:
          `- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), ` +
          `por ${actor} con valmen approve («${frase.replaceAll("\n", " ")}»); ` +
          "compuerta `plan` decidida y registrada en su recibo.",
      });
      paso = "paso a approved";
      const v = validateOne(paths, id);
      if (v.exitCode !== 0) return detenido(paths, "approve", id, paso, v.stderr);
      transition({ paths, ticketId: id, entity: "ticket", to: "approved" });
    } catch (caught) {
      return detenido(paths, "approve", id, paso, toFailure(caught).message);
    }
    return ok(`${id}: approved. Plan aprobado por ${actor} con sus palabras en el evento y en ## Plan.\n`);
  } catch (caught) {
    const f = toFailure(caught);
    return error(f.message, f.exitCode);
  }
}

/**
 * `valmen close --id <ID> --po-confirmation "<frase>" …`: de `awaiting_user_tests` a `closed`.
 *
 * Lleva el ticket validado por el PO por resultado en `## Pruebas`, QA y cierre. Parte de
 * `awaiting_user_tests` o de un cierre a medias (`in_qa`, `qa_approved`).
 */
export function closeCommand(
  paths: RegistryPaths,
  flags: Flags,
  deps: Pick<CeremonyDeps, "head" | "home">,
): CommandResult {
  const id = texto(flags, "id");
  if (id === undefined) return error("close requiere --id <TICKET-ID>.", EXIT_SCHEMA);
  const frase = texto(flags, "po-confirmation");
  if (frase === undefined) {
    return error(
      "close requiere --po-confirmation con las palabras literales con que el PO confirmó. " +
        "El agente no confirma por él lo que solo el PO puede verificar.",
      EXIT_SCHEMA,
    );
  }
  try {
    const documento = parseTicket(leer(paths, id));
    if (documento.fields.type === "SECURITY") {
      return error(
        `${id} es de seguridad: close no lo cubre. Siguen los pasos manuales de QA y cierre.`,
        EXIT_INVARIANT,
      );
    }
    const estado = documento.fields.workflow_status;
    if (estado !== "awaiting_user_tests" && estado !== "in_qa" && estado !== "qa_approved") {
      return error(
        `${id} está en ${estado}: close parte de awaiting_user_tests, in_qa o qa_approved.`,
        EXIT_INVARIANT,
      );
    }
    const faltan = [
      ["--environment", texto(flags, "environment")],
      ["--tests", texto(flags, "tests")],
      ["--technical-summary", texto(flags, "technical-summary")],
      ["--functional-summary", texto(flags, "functional-summary")],
      ["--release-impact", texto(flags, "release-impact")],
    ].filter(([, v]) => v === undefined);
    if (faltan.length > 0) {
      return error(`close requiere ${faltan.map(([n]) => n).join(", ")}.`, EXIT_SCHEMA);
    }
    const files = (texto(flags, "files") ?? "").split(",").map((f) => f.trim()).filter((f) => f !== "");
    if (documento.blocks.Puntos.length === 0 && files.length === 0) {
      return error("close requiere --files con los archivos del punto de QA: no se infieren.", EXIT_SCHEMA);
    }
    // El consumo real de las sesiones se guarda antes de cerrar, igual que en `close-attempt` y en
    // la transición a closed (idempotente): sin esto el ticket quedaba solo con el `manual:`.
    guardarConsumoDeSesiones(paths, id, deps.home === undefined ? {} : { home: deps.home });
    const source = texto(flags, "source");
    if (parseTicket(leer(paths, id)).blocks["Consumo de IA"].length === 0 && source === undefined) {
      return error(
        "close requiere --source con la fuente del consumo de IA (`manual:` sin números o la fuente con " +
          "números): el ticket no tiene entrada y no se inventa una.",
        EXIT_SCHEMA,
      );
    }

    // Los criterios manuales los verificó el PO: se marcan con sus palabras literales. Si queda
    // alguno sin marcar ni «no aplica», no se anexa nada del QA.
    try {
      markManualCriteria(paths, id, frase);
    } catch (caught) {
      return detenido(paths, "close", id, "criterios manuales", toFailure(caught).message);
    }
    const sin = unmarkedCriteria(leer(paths, id));
    if (sin.length > 0) return detenido(paths, "close", id, "criterios sin marcar", unmarkedMessage(sin));

    const r = cerrarConQaDelPo(paths, id, {
      palabrasDelPo: frase,
      files,
      environment: texto(flags, "environment") as string,
      tests: (texto(flags, "tests") as string).replace(/`/g, ""),
      technicalSummary: texto(flags, "technical-summary") as string,
      functionalSummary: texto(flags, "functional-summary") as string,
      releaseImpact: texto(flags, "release-impact") as string,
      head: deps.head,
      usageSource: source,
      confidence: texto(flags, "confidence") ?? "medium",
      model: texto(flags, "model"),
      notes: texto(flags, "notes") ?? `Cierre con la confirmación del PO; ${ACTOR_AGENTE}.`,
    });
    if (!r.cerrado) return detenido(paths, "close", id, r.paso, r.mensaje);
    return ok(
      `${id}: closed. Falta, de tu lado: valmen secrets y el commit local del cierre (el push solo cuando el PO lo ordene).\n`,
    );
  } catch (caught) {
    const f = toFailure(caught);
    return error(f.message, f.exitCode);
  }
}
