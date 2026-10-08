/**
 * El agente revisor de un `review` (R-APRO-003): prepararlo y ejecutarlo.
 *
 * Un recibo de análisis o de plan en `review` hoy espera a una persona. Este módulo es
 * la mitad que lee ese recibo y le pregunta a **otro modelo** si el artefacto respalda
 * las proposiciones que quedaron en duda. Es de solo lectura, y eso es una decisión,
 * no una carencia:
 *
 * 1. **No escribe nada.** Ni recibo, ni evento, ni estado, ni cupo. Guardar la decisión
 *    del revisor como suya, la barrera del motor contra el mismo modelo al registrarla y
 *    la reserva de los `block` a una persona son de otro ticket
 *    (SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007): hasta que esté, lo que sale de
 *    acá es una opinión que nadie puede convertir en aprobación.
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
  rutasDelProyecto,
} from "@valmen/adapter";
import { EXIT_SCHEMA, fail } from "@valmen/core";
import {
  type EtapaRevisable,
  type ProposicionEnDuda,
  type ReviewEvaluation,
  reviewWithModel,
} from "@valmen/gate-llm-judge";

import { type RegistryPaths } from "./discovery.js";
import { leerFases } from "./journey-phases.js";
import { readReceipts, veredictoDeCompuerta } from "./receipts.js";
import { scanSecrets } from "./secrets.js";
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
