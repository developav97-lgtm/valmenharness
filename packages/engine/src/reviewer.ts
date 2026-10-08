/**
 * El agente revisor de un `review` (R-APRO-003): prepararlo y ejecutarlo.
 *
 * Un recibo de análisis o de plan en `review` hoy espera a una persona. Este módulo es
 * la mitad que lee ese recibo y le pregunta a **otro modelo** si el artefacto respalda
 * las proposiciones que quedaron en duda. Es de solo lectura, y eso es una decisión,
 * no una carencia:
 *
 * 1. **`prepararRevision` y `ejecutarRevisor` no escriben nada.** Ni recibo, ni evento, ni
 *    estado, ni cupo. La única función de este módulo que escribe es
 *    `registrarDecisionDelRevisor` (SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007), que
 *    guarda la decisión como **del revisor** —nunca de una persona ni de la autorización
 *    sola— detrás de las barreras del motor: otro modelo que el productor, un recibo que
 *    sigue siendo el del ticket, ningún `block`, y la autorización de modo `reviewer`.
 * 2. **No decide la elegibilidad.** Que un ticket pueda aprobarse sin una persona —tipo,
 *    impactos, cupo, modo `reviewer` de la autorización— es de
 *    FEATURE-ENGINE-ELEGIBILIDAD-APROBACION-20261007. Esto no lee autorizaciones.
 * 3. **Del lado seguro cuando no puede garantizar la separación.** El revisor tiene que
 *    ser un modelo distinto de todos los que produjeron el análisis y el plan. Si el
 *    productor no se conoce o coincide, no se llama al modelo y se dice por qué.
 *
 * Y `prepararRevision` hace todo lo que no cuesta una llamada —leer el ticket y los
 * recibos, armar el artefacto, elegir al revisor— para que `--dry-run` muestre lo que se
 * enviaría sin gastar nada.
 */
import {
  type ResolvedRoute,
  modeloDelRevisor,
  normalizarModelo,
  rutasDelProyecto,
} from "@valmen/adapter";
import {
  EXIT_INVARIANT,
  EXIT_SCHEMA,
  type ParsedTicket,
  declaredImpactIds,
  fail,
  parseTicket,
} from "@valmen/core";
import { type GateReceipt, hashState } from "@valmen/gate";
import {
  type EtapaRevisable,
  type ProposicionEnDuda,
  type ReviewEvaluation,
  reviewWithModel,
} from "@valmen/gate-llm-judge";

import {
  autorizacionDeAprobacionQueCubre,
  leerAutorizacionesDeAprobacion,
  cupoRestanteDeAprobacion,
  registrarUsoDeCupoDeAprobacion,
} from "./approval-authorization.js";
import {
  elegibilidadDeAprobacion,
  motivoDeAprobacionPorAutorizacionInvalida,
} from "./approval-eligibility.js";
import { type RegistryPaths, findTicket } from "./discovery.js";
import { leerFases } from "./journey-phases.js";
import { appendEvent } from "./mutate.js";
import {
  FUENTE_REVISOR,
  PLAN_APPROVED_ACTION,
  assertSesionAtendida,
  hashDelPlan,
} from "./plan-approval.js";
import { appendReceipt, readReceipts, veredictoDeCompuerta } from "./receipts.js";
import { scanSecrets } from "./secrets.js";
import { buildGateState } from "./state.js";
import { readTicket } from "./tickets.js";

export type { EtapaRevisable } from "@valmen/gate-llm-judge";

/** Las etapas cuyo `review` puede revisar un modelo. */
export const ETAPAS_REVISABLES: readonly EtapaRevisable[] = ["analysis", "plan"];

/** Las secciones del ticket que forman el artefacto de cada etapa. */
const SECCIONES_DEL_ARTEFACTO: Readonly<Record<EtapaRevisable, readonly string[]>> = {
  analysis: ["Descripción funcional", "Diagnóstico"],
  plan: ["Plan", "Criterios de aceptación"],
};

/** Un modelo que produjo el análisis o el plan, tal como lo registró la jornada. */
export interface ProductorRegistrado {
  readonly fase: "analysis" | "plan";
  readonly ejecutor: string;
  readonly modelo: string;
}

/** El revisor elegido, tal como lo resolvió el enrutado. */
export interface RevisorElegido {
  readonly provider: string;
  readonly model: string;
  readonly effort: "auto" | "low" | "medium" | "high";
  /** De dónde salió el modelo del rol: proyecto, perfil, preset o sistema. */
  readonly source: string;
}

/** Lo que `prepararRevision` sabe aunque no pueda ejecutar al revisor. */
interface RevisionBase {
  readonly ticketId: string;
  readonly etapa: EtapaRevisable;
  /** El recibo sobre el que se revisa, o `null` si no llegó a haber uno revisable. */
  readonly reciboId: string | null;
  readonly proposiciones: readonly ProposicionEnDuda[];
  readonly productores: readonly ProductorRegistrado[];
}

/** Una revisión lista para ejecutar. */
export interface RevisionPreparada extends RevisionBase {
  readonly ok: true;
  readonly reciboId: string;
  /** El artefacto, tal como se le enviará al revisor. */
  readonly artefacto: string;
  readonly revisor: RevisorElegido;
}

/** Una revisión que no se ejecuta, con el motivo y lo que se alcanzó a reunir. */
export interface RevisionRechazada extends RevisionBase {
  readonly ok: false;
  readonly motivo: string;
  /** El revisor que el enrutado habría elegido, si se llegó a resolver. */
  readonly revisor: RevisorElegido | null;
}

export type PreparacionDeRevision = RevisionPreparada | RevisionRechazada;

function rechazo(
  base: Pick<RevisionBase, "ticketId" | "etapa"> & Partial<RevisionBase>,
  motivo: string,
  revisor: RevisorElegido | null = null,
): RevisionRechazada {
  return {
    ok: false,
    ticketId: base.ticketId,
    etapa: base.etapa,
    reciboId: base.reciboId ?? null,
    proposiciones: base.proposiciones ?? [],
    productores: base.productores ?? [],
    motivo,
    revisor,
  };
}

function revisorDe(ruta: ResolvedRoute): RevisorElegido {
  return { provider: ruta.provider, model: ruta.model, effort: ruta.effort, source: ruta.source };
}

/**
 * Los modelos que registró la jornada para el análisis y el plan de un ticket.
 *
 * Se leen **las dos** fases para las dos etapas, porque la preparación de la jornada es
 * una sola sesión que deja el ticket de `intake` en `planned` y la registra como `analysis`:
 * el plan de un ticket preparado así figura con esa fase, y su modelo es el que lo produjo.
 */
export function productoresDelTicket(root: string, ticketId: string): ProductorRegistrado[] {
  const productores: ProductorRegistrado[] = [];
  for (const registro of leerFases(root)) {
    if (registro.ticketId !== ticketId) continue;
    if (registro.fase !== "analysis" && registro.fase !== "plan") continue;
    // El que el cliente reportó haber usado manda sobre el pedido: es quien produjo el artefacto.
    const modelo = typeof registro.modeloUsado === "string" && registro.modeloUsado.trim() !== "" ? registro.modeloUsado : registro.modelo;
    if (typeof modelo !== "string" || modelo.trim() === "") continue;
    productores.push({ fase: registro.fase, ejecutor: registro.ejecutor, modelo });
  }
  return productores;
}

/**
 * Prepara la revisión de un recibo en `review`: no llama a ningún modelo.
 *
 * Rechaza —con su motivo— todo lo que no sea el último recibo vigente de la compuerta de
 * la etapa, en `review` y sin decisión humana: un `block`, un `approve`, un recibo que ya
 * decidió una persona o la ausencia de recibo no llegan al revisor.
 */
export function prepararRevision(input: {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly etapa: EtapaRevisable;
}): PreparacionDeRevision {
  const { paths, ticketId, etapa } = input;
  if (!ETAPAS_REVISABLES.includes(etapa)) {
    fail(
      `La etapa "${String(etapa)}" no se revisa con un modelo: las que sí son ${ETAPAS_REVISABLES.join(" y ")}.`,
      EXIT_SCHEMA,
    );
  }
  const ticket = readTicket(paths, ticketId);
  if (ticket === null) fail(`No existe el ticket ${ticketId}.`, EXIT_SCHEMA);
  const base = { ticketId, etapa };

  // 1. El recibo: el último vigente de la compuerta de la etapa, en review y sin decisión.
  const veredicto = veredictoDeCompuerta(readReceipts(paths, ticketId), etapa);
  if (veredicto.tipo === "sin-recibo") {
    return rechazo(
      base,
      `el ticket no tiene ningún recibo de la compuerta ${etapa}: corré el gate antes de revisarlo`,
    );
  }
  const recibo = veredicto.recibo;
  const conRecibo = { ...base, reciboId: recibo.id };
  if (recibo.humanDecision !== null) {
    return rechazo(
      conRecibo,
      `el recibo ${recibo.id} ya tiene una decisión humana (${recibo.humanDecision.decision}): no hay nada que revisar`,
    );
  }
  if (veredicto.tipo === "bloqueada") {
    return rechazo(
      conRecibo,
      `el recibo ${recibo.id} está en block: un bloqueo lo decide una persona y no llega al revisor`,
    );
  }
  if (recibo.outcome !== "review") {
    return rechazo(
      conRecibo,
      `el recibo ${recibo.id} está en ${recibo.outcome} y no en review: no hay nada que revisar`,
    );
  }

  // Un recibo que evaluó otro texto del ticket no se revisa: no se paga un modelo sobre algo
  // que ya no es lo que hay (AP-007, C11).
  const ubicado = findTicket(paths, ticketId);
  if (ubicado !== undefined && recibo.stateHash !== hashState(buildGateState(ubicado.text))) {
    return rechazo(
      conRecibo,
      `el recibo ${recibo.id} evaluó otro texto del ticket (cambió después de la compuerta): ` +
        `vuelve a correr la compuerta antes de revisarlo (valmen gate ${etapa} --id ${ticketId})`,
    );
  }

  // 2. Las proposiciones en duda: solo las que quedaron en la banda media del recibo.
  const proposiciones: ProposicionEnDuda[] = recibo.propositions
    .filter((proposicion) => proposicion.inBand)
    .map((proposicion) => ({
      id: proposicion.id,
      ...(proposicion.description === undefined ? {} : { descripcion: proposicion.description }),
      valor: proposicion.value,
      motivo: proposicion.reason === "" ? null : proposicion.reason,
    }));
  const productores = productoresDelTicket(paths.root, ticketId);
  const conDatos = { ...conRecibo, proposiciones, productores };
  if (proposiciones.length === 0) {
    const sinAprobar = recibo.propositions
      .filter((p) => p.verdict && p.effect !== null && p.effect.outcome !== "approve")
      .map((p) => p.id);
    return rechazo(
      conDatos,
      `el recibo ${recibo.id} está en review pero ninguna proposición quedó en banda media` +
        (sinAprobar.length === 0 ? "" : ` (no aprobaron: ${sinAprobar.join(", ")})`) +
        ": el revisor solo decide sobre las que cayeron en esa banda",
    );
  }

  // 3. El artefacto, y que no lleve una credencial a un proveedor externo.
  const secciones = SECCIONES_DEL_ARTEFACTO[etapa];
  const artefacto = [
    `TICKET: ${ticketId} — ${ticket.title}`,
    ...secciones.map((nombre) => `\n## ${nombre}\n${(ticket.sections[nombre] ?? "").trim()}`),
  ].join("\n");
  const hallazgos = scanSecrets(artefacto);
  if (hallazgos.length > 0) {
    return rechazo(
      conDatos,
      "el artefacto expone una credencial y no se envía a un modelo: " +
        hallazgos.map((h) => `${h.kind} en la línea ${h.line}`).join(", "),
    );
  }

  // 4. El revisor: el del rol `reviewer`, solo si es distinto de todos los productores.
  const eleccion = modeloDelRevisor(
    rutasDelProyecto(paths.root),
    productores.map((p) => p.modelo),
  );
  if (!eleccion.ok) return rechazo(conDatos, eleccion.motivo);

  return { ok: true, ...conDatos, reciboId: recibo.id, artefacto, revisor: revisorDe(eleccion.route) };
}

/** Lo que `ejecutarRevisor` necesita de afuera: sobre todo, simular la red en las pruebas. */
export interface OpcionesDeRevision {
  readonly apiKey?: string;
  readonly fetchImpl?: typeof fetch;
  readonly cliRunner?: Parameters<typeof reviewWithModel>[0]["cliRunner"];
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

/** La decisión del revisor, con todo lo necesario para auditarla. */
export interface ResultadoDeRevision {
  readonly ticketId: string;
  readonly etapa: EtapaRevisable;
  readonly reciboId: string;
  readonly decision: ReviewEvaluation["decision"];
  readonly reason: string;
  readonly porProposicion: ReviewEvaluation["porProposicion"];
  /** El modelo que decidió, con la versión que el proveedor dice haber servido. */
  readonly revisor: ReviewEvaluation["model"] & { readonly effort: RevisorElegido["effort"] };
  /** Los modelos que produjeron el artefacto, contra los que se comprobó la separación. */
  readonly productores: readonly ProductorRegistrado[];
  readonly proposiciones: readonly ProposicionEnDuda[];
  readonly usage: ReviewEvaluation["usage"];
  readonly latencyMs: number;
}

/**
 * Ejecuta al revisor sobre una revisión ya preparada y devuelve su decisión.
 *
 * No escribe en el registro: la decisión no se guarda ni mueve el ticket. Una respuesta
 * del modelo fuera del esquema lanza `JudgeError`.
 */
export async function ejecutarRevisor(
  preparacion: RevisionPreparada,
  opciones: OpcionesDeRevision = {},
): Promise<ResultadoDeRevision> {
  const evaluacion = await reviewWithModel({
    provider: preparacion.revisor.provider,
    model: preparacion.revisor.model,
    effort: preparacion.revisor.effort,
    etapa: preparacion.etapa,
    artefacto: preparacion.artefacto,
    proposiciones: preparacion.proposiciones,
    ...(opciones.apiKey === undefined ? {} : { apiKey: opciones.apiKey }),
    ...(opciones.fetchImpl === undefined ? {} : { fetchImpl: opciones.fetchImpl }),
    ...(opciones.cliRunner === undefined ? {} : { cliRunner: opciones.cliRunner }),
    ...(opciones.timeoutMs === undefined ? {} : { timeoutMs: opciones.timeoutMs }),
    ...(opciones.signal === undefined ? {} : { signal: opciones.signal }),
  });
  return {
    ticketId: preparacion.ticketId,
    etapa: preparacion.etapa,
    reciboId: preparacion.reciboId,
    decision: evaluacion.decision,
    reason: evaluacion.reason,
    porProposicion: evaluacion.porProposicion,
    revisor: { ...evaluacion.model, effort: preparacion.revisor.effort },
    productores: preparacion.productores,
    proposiciones: preparacion.proposiciones,
    usage: evaluacion.usage,
    latencyMs: evaluacion.latencyMs,
  };
}

// ── Registrar la decisión del revisor como suya ─────────────────────────────

/** La decisión del revisor, tal como queda en una versión nueva del recibo. */
export interface DecisionDelRevisorRegistrada {
  readonly decision: ReviewEvaluation["decision"];
  readonly reason: string;
  readonly porProposicion: ReviewEvaluation["porProposicion"];
  readonly revisor: ResultadoDeRevision["revisor"];
  /** Los modelos que produjeron el artefacto, contra los que se comprobó la separación. */
  readonly productores: readonly ProductorRegistrado[];
  readonly authorizationId: string;
  readonly authorizationHash: string;
  /** El `stateHash` del recibo sobre el que se decidió. */
  readonly receiptStateHash: string;
  readonly usage: ReviewEvaluation["usage"];
  readonly decidedAt: string;
}

/**
 * Un recibo con la decisión del revisor. Es una extensión opcional del motor: el recibo del paquete
 * de compuertas no cambia, y uno sin este campo se lee igual que antes. `humanDecision` sigue en
 * `null`: la decisión del revisor no es la de una persona.
 */
export type ReciboConRevisor = GateReceipt & { readonly reviewerDecision?: DecisionDelRevisorRegistrada };

const MODO_REVISOR = "reviewer";

function documentoDe(paths: RegistryPaths, ticketId: string): ParsedTicket {
  const ubicado = findTicket(paths, ticketId);
  if (ubicado === undefined) fail(`No existe el ticket ${ticketId}.`, EXIT_SCHEMA);
  return parseTicket(ubicado.text);
}

/** ¿El modelo coincide con alguno de los productores? Compara normalizado, sin proveedor. */
function esProductor(modelo: string, productores: readonly ProductorRegistrado[]): boolean {
  const normal = normalizarModelo(modelo);
  return normal !== "" && productores.some((p) => normalizarModelo(p.modelo) === normal);
}

export interface BarrerasDelRegistroInput {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly etapa: string;
  readonly reciboId: string;
  readonly decision: ReviewEvaluation["decision"];
  readonly porProposicion: ReviewEvaluation["porProposicion"];
  readonly revisor: Pick<ResultadoDeRevision["revisor"], "model" | "resolvedVersion">;
  readonly ahora: Date;
}

/**
 * Las barreras del motor para registrar la decisión del revisor: devuelve **todas** las que
 * fallan, con su motivo; vacía si se puede registrar. No escribe nada.
 *
 * Es del motor y no del enrutado a propósito: quien llama a `registrarDecisionDelRevisor` puede
 * traer un resultado armado a mano, y un enrutado puede haber cambiado entre la elección y el
 * registro.
 */
export function barrerasDelRegistro(input: BarrerasDelRegistroInput): string[] {
  const { paths, ticketId, etapa, reciboId, ahora } = input;
  const motivos: string[] = [];
  const documento = documentoDe(paths, ticketId);

  // 1. Un SECURITY no se aprueba por revisor (C15).
  if (documento.fields.type.toUpperCase() === "SECURITY") {
    motivos.push("tipo: un ticket SECURITY no se aprueba por revisor; lo decide una persona");
  }

  // 2. El recibo: el último vigente de la etapa, en review, sin decisión humana ni del revisor (C12, C21).
  if (!(ETAPAS_REVISABLES as readonly string[]).includes(etapa)) {
    motivos.push(`etapa: «${etapa}» no se revisa con un modelo (${ETAPAS_REVISABLES.join(" o ")})`);
    return motivos;
  }
  const veredicto = veredictoDeCompuerta(readReceipts(paths, ticketId), etapa);
  if (veredicto.tipo === "sin-recibo") {
    motivos.push(`recibo: el ticket no tiene ningún recibo de la compuerta ${etapa}`);
    return motivos;
  }
  const recibo = veredicto.recibo as ReciboConRevisor;
  if (recibo.id !== reciboId) {
    motivos.push(`recibo: ${reciboId} ya no es el último de la compuerta ${etapa} (ahora es ${recibo.id})`);
  }
  if (veredicto.tipo === "bloqueada" || recibo.outcome === "block") {
    motivos.push(`recibo: ${recibo.id} está en block (o una persona lo rechazó): un block es de una persona`);
  } else if (recibo.humanDecision !== null) {
    motivos.push(`recibo: ${recibo.id} ya tiene una decisión humana (${recibo.humanDecision.decision})`);
  } else if (recibo.outcome !== "review") {
    motivos.push(`recibo: ${recibo.id} está en ${recibo.outcome} y no en review`);
  }
  if (recibo.reviewerDecision !== undefined) {
    motivos.push(`recibo: ${recibo.id} ya tiene la decisión del revisor (${recibo.reviewerDecision.decision}); no se registra otra`);
  }

  // 3. El recibo evaluó el texto que hay ahora (C10, AP-007).
  if (recibo.stateHash !== hashState(buildGateState(documento.text))) {
    motivos.push(`estado: el recibo ${recibo.id} evaluó otro texto del ticket (cambió después de la compuerta)`);
  }

  // 4. Las proposiciones: solo las de la banda media, todas respaldadas, y nada fuera de banda sin aprobar (C13, C14).
  const enBanda = recibo.propositions.filter((p) => p.inBand).map((p) => p.id);
  if (enBanda.length === 0) {
    motivos.push("proposiciones: ninguna quedó en banda media; no hay nada que el revisor pueda resolver");
  }
  const fueraSinAprobar = recibo.propositions
    .filter((p) => !p.inBand && (p.effect === null || p.effect === undefined || p.effect.outcome !== "approve"))
    .map((p) => p.id);
  if (fueraSinAprobar.length > 0) {
    motivos.push(`proposiciones: ${fueraSinAprobar.join(", ")} no aprobó y no es de la banda media: el revisor no lo cubre`);
  }
  const decididas = input.porProposicion.map((p) => p.id);
  const mismas =
    decididas.length === enBanda.length &&
    new Set(decididas).size === decididas.length &&
    enBanda.every((id) => decididas.includes(id));
  if (!mismas) {
    motivos.push(
      `proposiciones: la decisión cubre [${decididas.join(", ")}] y la banda media del recibo es [${enBanda.join(", ")}]`,
    );
  }
  if (input.decision === "approve" && !input.porProposicion.every((p) => p.respaldada)) {
    motivos.push("proposiciones: un approve exige que cada proposición esté respaldada");
  }

  // 5. Otro modelo que todo productor registrado (C8, C9).
  const productores = productoresDelTicket(paths.root, ticketId);
  if (productores.length === 0) {
    motivos.push("modelo: el ticket no tiene productor registrado; sin saberlo no se garantiza que el revisor sea otro");
  } else {
    for (const modelo of [input.revisor.model, input.revisor.resolvedVersion]) {
      if (modelo.trim() !== "" && esProductor(modelo, productores)) {
        motivos.push(`modelo: el revisor (${modelo}) es el mismo modelo que produjo el artefacto`);
        break;
      }
    }
  }

  // 6. Elegibilidad con los tipos, impactos, cupo y modo de la autorización (C15–C17).
  const elegibilidad = elegibilidadDeAprobacion({ paths, ticketId, etapa, ahora });
  if (!elegibilidad.derivableAlRevisor) {
    const fallas = elegibilidad.reglas.filter((r) => !r.cumple && r.regla !== "compuerta").map((r) => `${r.regla}: ${r.detalle}`);
    motivos.push(
      `autorización: ${fallas.length > 0 ? fallas.join("; ") : "la autorización que cubre al ticket no es de modo reviewer"}`,
    );
  }
  return motivos;
}

export interface RegistrarDecisionDelRevisorRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly resultado: ResultadoDeRevision;
  readonly ahora?: Date;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface DecisionDelRevisorGuardada {
  readonly ticketId: string;
  readonly etapa: EtapaRevisable;
  readonly decision: ReviewEvaluation["decision"];
  readonly receiptId: string;
  readonly authorizationId: string;
  /** Cupos que le quedan hoy a la autorización. */
  readonly cupoRestante: number;
  /** La acción del evento que quedó en el ticket. */
  readonly accion: string;
}

/**
 * Guarda la decisión del revisor como **suya**: en una versión nueva del recibo (`reviewerDecision`,
 * con `humanDecision` en `null`) y en un evento de etapa de fuente `revisor`.
 *
 * Es la única función de este módulo que escribe. Orden: sesión atendida antes de leer nada; todas
 * las barreras (si alguna falla no escribe ni consume cupo); con `approve`, el cupo y luego recibo y
 * evento —el cupo va antes a propósito: si la escritura falla se pierde un cupo, pero no se
 * aprueba nada—; con `reject`, solo el recibo y un evento `reviewer-rejected`, sin cupo: el recibo
 * sigue esperando a una persona.
 */
export function registrarDecisionDelRevisor(request: RegistrarDecisionDelRevisorRequest): DecisionDelRevisorGuardada {
  const { paths, ticketId, resultado } = request;
  const ahora = request.ahora ?? new Date();
  assertSesionAtendida("registrar la decisión del revisor", request.env ?? process.env);

  const etapa = resultado.etapa;
  const motivos = barrerasDelRegistro({
    paths,
    ticketId,
    etapa,
    reciboId: resultado.reciboId,
    decision: resultado.decision,
    porProposicion: resultado.porProposicion,
    revisor: resultado.revisor,
    ahora,
  });
  if (motivos.length > 0) {
    fail(
      `La decisión del revisor sobre ${ticketId} (${etapa}) no se registra; no se escribió nada ni se consumió cupo:\n` +
        motivos.map((m) => `  ✗ ${m}`).join("\n"),
      EXIT_INVARIANT,
    );
  }

  const documento = documentoDe(paths, ticketId);
  const cubre = autorizacionDeAprobacionQueCubre(
    paths.root,
    {
      type: documento.fields.type,
      module: documento.fields.module,
      riskLevel: documento.fields.risk_level,
      impacts: declaredImpactIds(documento),
      stage: etapa,
    },
    ahora,
  );
  if (cubre === null || cubre.mode !== MODO_REVISOR) {
    throw new Error("Las barreras dejaron pasar un ticket sin una autorización de modo reviewer que lo cubra.");
  }
  const veredicto = veredictoDeCompuerta(readReceipts(paths, ticketId), etapa);
  if (veredicto.tipo === "sin-recibo") throw new Error("Las barreras dejaron pasar un ticket sin recibo.");
  const recibo = veredicto.recibo;
  const productores = productoresDelTicket(paths.root, ticketId);
  const decidida: DecisionDelRevisorRegistrada = {
    decision: resultado.decision,
    reason: resultado.reason,
    porProposicion: resultado.porProposicion,
    revisor: resultado.revisor,
    productores,
    authorizationId: cubre.id,
    authorizationHash: cubre.hash,
    receiptStateHash: recibo.stateHash,
    usage: resultado.usage,
    decidedAt: ahora.toISOString(),
  };
  const actor = `revisor ${resultado.revisor.provider}/${resultado.revisor.model} (autorización ${cubre.id})`;
  const cupoDe = (): number => cupoRestanteDeAprobacion(paths.root, cubre, ahora);

  if (resultado.decision === "reject") {
    appendReceipt(paths, ticketId, { ...recibo, reviewerDecision: decidida } as ReciboConRevisor);
    appendEvent(
      paths,
      ticketId,
      "reviewer-rejected",
      JSON.stringify({
        actor,
        source: FUENTE_REVISOR,
        stage: etapa,
        receiptId: recibo.id,
        authorizationId: cubre.id,
        reviewerModel: resultado.revisor.model,
        reason: resultado.reason,
      }),
      () => ahora,
    );
    return { ticketId, etapa, decision: "reject", receiptId: recibo.id, authorizationId: cubre.id, cupoRestante: cupoDe(), accion: "reviewer-rejected" };
  }

  registrarUsoDeCupoDeAprobacion({ root: paths.root, authorizationId: cubre.id, ticketId, stage: etapa, ahora });
  appendReceipt(paths, ticketId, { ...recibo, reviewerDecision: decidida } as ReciboConRevisor);
  const accion = etapa === "plan" ? PLAN_APPROVED_ACTION : "analysis-approved";
  appendEvent(
    paths,
    ticketId,
    accion,
    JSON.stringify({
      actor,
      source: FUENTE_REVISOR,
      quote: resultado.reason,
      planHash: hashDelPlan(documento),
      authorizationId: cubre.id,
      authorizationHash: cubre.hash,
      reviewerModel: resultado.revisor.model,
      stage: etapa,
      receiptId: recibo.id,
      receiptStateHash: recibo.stateHash,
    }),
    () => ahora,
  );
  return { ticketId, etapa, decision: "approve", receiptId: recibo.id, authorizationId: cubre.id, cupoRestante: cupoDe(), accion };
}

/**
 * Re-verifica, al avanzar, la decisión `approve` del revisor guardada en un recibo: lo que el recibo
 * dice no basta, porque cualquiera puede escribir una línea. Devuelve el motivo si no vale, o `null`.
 * El ticket no puede ser SECURITY, el recibo no puede ser `block`, la decisión tiene que ser sobre
 * el estado del propio recibo, el revisor no puede ser un productor registrado **ahora**, y la
 * autorización —de modo `reviewer`— tiene que existir con el mismo hash, estar vigente ahora y
 * tener el uso de cupo de este ticket y de la etapa.
 */
export function motivoDeDecisionDelRevisorInvalida(
  root: string,
  documento: ParsedTicket,
  recibo: ReciboConRevisor,
  etapa: string,
  ahora: Date = new Date(),
): string | null {
  const regla = "Una persona la registra con `valmen gate-decide`.";
  const dr = recibo.reviewerDecision;
  if (dr === undefined || dr.decision !== "approve") {
    return `El recibo ${recibo.id} no tiene un approve del revisor. ${regla}`;
  }
  if (documento.fields.type.toUpperCase() === "SECURITY") {
    return `Un ticket SECURITY no se aprueba por revisor. ${regla}`;
  }
  if (recibo.outcome === "block") return `El recibo ${recibo.id} está en block: lo decide una persona. ${regla}`;
  if (dr.receiptStateHash !== recibo.stateHash) {
    return `La decisión del revisor no es sobre el estado del recibo ${recibo.id}. ${regla}`;
  }
  const productores = productoresDelTicket(root, documento.fields.id);
  if (productores.length === 0) {
    return `El ticket no tiene productor registrado: no se garantiza que el revisor sea otro modelo. ${regla}`;
  }
  for (const modelo of [dr.revisor.model, dr.revisor.resolvedVersion]) {
    if (modelo.trim() !== "" && esProductor(modelo, productores)) {
      return `El revisor (${modelo}) es el mismo modelo que produjo el artefacto. ${regla}`;
    }
  }
  const autorizacion = leerAutorizacionesDeAprobacion(root, ahora).find(
    (a) => a.id === dr.authorizationId && a.hash === dr.authorizationHash,
  );
  if (autorizacion !== undefined && autorizacion.mode !== MODO_REVISOR) {
    return `La autorización ${dr.authorizationId} no es de modo reviewer. ${regla}`;
  }
  return motivoDeAprobacionPorAutorizacionInvalida(
    root,
    documento,
    {
      actor: "revisor",
      source: FUENTE_REVISOR,
      quote: "",
      planHash: "",
      authorizationId: dr.authorizationId,
      authorizationHash: dr.authorizationHash,
    },
    ahora,
    etapa,
  )?.replace("Una persona la registra con `valmen approve-plan`.", regla) ?? null;
}
