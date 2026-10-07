/**
 * Aprobar los planes de una jornada en lote, con códigos firmados (R-JORN-004).
 *
 * Reutiliza el token firmado que ya decide compuertas a distancia —HMAC, un solo uso, techo de
 * riesgo, registro append-only— con otro **sujeto**: el hash del plan. La aprobación no se
 * escribe por un camino nuevo: pasa por `registrarAprobacionDePlan`, con fuente `token`, que es
 * lo que la transición a `approved` exige (R-CTRL-001). Dos caminos para aprobar divergen.
 *
 * Un código de gate no sirve aquí y uno de plan no sirve para decidir una compuerta: el sujeto
 * del token lo separa, y se comprueba al consumirlo.
 */
import { declaredImpactIds, parseTicket } from "@valmen/core";

import {
  type ApprovalBatch,
  SUJETO_LOTE_DE_PLANES,
  SUJETO_PLAN,
  appendApproval,
  mintApproval,
  motivoDeTecho,
  normalizarCodigo,
  readApprovalLog,
  verifyApproval,
  type IssuedApproval,
} from "./approval.js";
import { type RegistryPaths, findTicket, planApprovalSources } from "./discovery.js";
import { readJourneys } from "./journeys.js";
import { aprobacionDePlanVigente, hashDelPlan, registrarAprobacionDePlan } from "./plan-approval.js";
import { type AuthorizedProject } from "./project-resolution.js";
import { readReceipts, veredictoDeCompuerta } from "./receipts.js";

/** La fuente con la que se registra una aprobación por código. */
export const FUENTE_TOKEN = "token";

export interface PlanListo {
  readonly ticket: string;
  readonly title: string;
  readonly code: string;
  readonly planHash: string;
}

export interface EmisionDeJornada {
  readonly planes: readonly PlanListo[];
  /** El código del lote, o `null` si no hay planes que aprobar. */
  readonly lote: { readonly code: string } | null;
  /** Los tickets de la jornada en `planned` a los que **no** se les emitió código, con el motivo. */
  readonly sinCodigo: readonly { readonly ticket: string; readonly motivo: string }[];
  readonly mensaje: string;
}

/** Emite un código por plan listo de la jornada y uno de lote. */
export function emitirAprobacionesDeJornada(request: {
  readonly project: AuthorizedProject;
  readonly journeyId: string;
  readonly secret: string;
  readonly ahora: Date;
  readonly ttlHours?: number;
}): EmisionDeJornada {
  const { project, secret, ahora } = request;
  const jornada = readJourneys(project).find((j) => j.journeyId === request.journeyId);
  if (jornada === undefined) {
    throw new Error(`La jornada "${request.journeyId}" no existe en el proyecto autorizado.`);
  }
  const ttl = request.ttlHours ?? 24;
  const planes: PlanListo[] = [];
  const sinCodigo: { ticket: string; motivo: string }[] = [];

  for (const entrada of [...jornada.tickets].sort((a, b) => a.priority - b.priority || a.order - b.order)) {
    const ubicado = findTicket(project.paths, entrada.ticketId);
    if (ubicado === undefined) continue;
    const documento = parseTicket(ubicado.text);
    if (documento.fields.workflow_status !== "planned") continue;
    if (aprobacionDePlanVigente(documento).estado === "vigente") continue;
    if (veredictoDeCompuerta(readReceipts(project.paths, entrada.ticketId), "plan").tipo !== "aprobada") {
      sinCodigo.push({ ticket: entrada.ticketId, motivo: "la compuerta del plan no está aprobada" });
      continue;
    }
    // Un ticket de seguridad se aprueba con la máquina delante, y los techos de riesgo e impactos
    // son los de siempre.
    const motivo =
      documento.fields.type === "SECURITY"
        ? "es un ticket de seguridad: su plan se aprueba en la máquina"
        : motivoDeTecho({
            subjectType: "ticket",
            riskLevel: documento.fields.risk_level,
            impacts: declaredImpactIds(documento),
          });
    if (motivo !== null) {
      sinCodigo.push({ ticket: entrada.ticketId, motivo });
      continue;
    }
    const planHash = hashDelPlan(documento);
    const emision = mintApproval({
      secret,
      gate: SUJETO_PLAN,
      ticket: entrada.ticketId,
      receipt: `plan:${planHash}`,
      stateHash: planHash,
      revision: "1",
      ceiling: { subjectType: "ticket", riskLevel: documento.fields.risk_level, impacts: declaredImpactIds(documento) },
      now: ahora,
      ttlHours: ttl,
    });
    if (!emision.ok) {
      sinCodigo.push({ ticket: entrada.ticketId, motivo: emision.refusal });
      continue;
    }
    appendApproval(project.paths, emision.issued);
    planes.push({ ticket: entrada.ticketId, title: documento.fields.title, code: emision.issued.code, planHash });
  }

  let lote: { code: string } | null = null;
  if (planes.length > 0) {
    // El código del lote se deriva de los hashes de los planes: cambiar uno cambia el código.
    const resumen = planes.map((p) => `${p.ticket}:${p.planHash}`).join("|");
    const emisionLote = mintApproval({
      secret,
      gate: SUJETO_LOTE_DE_PLANES,
      ticket: `LOTE-${request.journeyId}`,
      receipt: `lote:${resumen}`,
      stateHash: resumen,
      revision: "1",
      ceiling: { subjectType: "ticket", riskLevel: "normal", impacts: [] },
      now: ahora,
      ttlHours: ttl,
    });
    if (emisionLote.ok) {
      const entrada: ApprovalBatch = {
        kind: "approval-batch",
        code: emisionLote.issued.code,
        journeyId: request.journeyId,
        items: planes.map((p) => ({ ticket: p.ticket, code: p.code, planHash: p.planHash })),
        issuedAt: emisionLote.issued.issuedAt,
        expiresAt: emisionLote.issued.expiresAt,
      };
      appendApproval(project.paths, emisionLote.issued);
      appendApproval(project.paths, entrada);
      lote = { code: emisionLote.issued.code };
    }
  }

  const lineas = [
    `Planes listos para aprobar — ${request.journeyId}: ${planes.length}`,
    ...planes.map((p) => `· ${p.ticket} — ${p.title} · código ${p.code}`),
  ];
  if (lote !== null) lineas.push(`Lote (${planes.length} plan(es)): código ${lote.code}`);
  if (planes.length > 0) {
    lineas.push(
      'Para aprobar: valmen plan-approve --code <código> --actor <tú> --quote "<tus palabras>"',
      "El código es de un solo uso y vale para el plan tal como está ahora; si cambia, no aprueba.",
    );
  }
  for (const s of sinCodigo) lineas.push(`✗ ${s.ticket}: ${s.motivo}`);
  return { planes, lote, sinCodigo, mensaje: lineas.join("\n") };
}

export interface ResultadoDeAprobacion {
  readonly ticket: string;
  readonly ok: boolean;
  readonly detalle: string;
}

/** Aprueba el plan de un código ya verificado; consume el código solo si quedó registrado. */
function aprobarPlanDeCodigo(request: {
  readonly paths: RegistryPaths;
  readonly secret: string;
  readonly codigo: string;
  readonly actor: string;
  readonly quote: string;
  readonly ahora: Date;
  readonly env?: Readonly<Record<string, string | undefined>>;
}): ResultadoDeAprobacion {
  const normalizado = normalizarCodigo(request.codigo);
  const emitidos = readApprovalLog(request.paths).filter(
    (e): e is IssuedApproval => e.kind === "approval-issued" && normalizarCodigo(e.code) === normalizado,
  );
  const emitido = emitidos[emitidos.length - 1];
  if (emitido === undefined) {
    return { ticket: "?", ok: false, detalle: "ese código no corresponde a ninguna aprobación emitida para este proyecto" };
  }
  if (readApprovalLog(request.paths).some((e) => e.kind === "approval-consumed" && normalizarCodigo(e.code) === normalizado)) {
    return { ticket: emitido.ticket, ok: false, detalle: `el código ${emitido.code} ya se usó` };
  }
  const verificado = verifyApproval(request.secret, emitido.token, request.ahora);
  if (!verificado.ok) {
    return { ticket: emitido.ticket, ok: false, detalle: `el código ${emitido.code} no sirve: ${verificado.detail}` };
  }
  const claims = verificado.claims;
  if (claims.gate !== SUJETO_PLAN) {
    return {
      ticket: emitido.ticket,
      ok: false,
      detalle: `el código ${emitido.code} no es de aprobación de un plan (es de ${claims.gate}): no sirve aquí`,
    };
  }
  const ubicado = findTicket(request.paths, claims.ticket);
  if (ubicado === undefined) return { ticket: claims.ticket, ok: false, detalle: "el ticket ya no está en el registro" };
  const documento = parseTicket(ubicado.text);
  if (hashDelPlan(documento) !== claims.stateHash) {
    return {
      ticket: claims.ticket,
      ok: false,
      detalle:
        "el plan cambió desde que se emitió este código: aprobarlo sería aprobar otra cosa. " +
        "El código queda sin usar hasta que venza; vuelve a pedir los códigos.",
    };
  }
  try {
    registrarAprobacionDePlan({
      paths: request.paths,
      ticketId: claims.ticket,
      actor: request.actor,
      source: FUENTE_TOKEN,
      quote: request.quote,
      now: () => request.ahora,
      ...(request.env === undefined ? {} : { env: request.env }),
    });
  } catch (error) {
    return { ticket: claims.ticket, ok: false, detalle: error instanceof Error ? error.message : String(error) };
  }
  // Se consume **después** de que la aprobación quedó registrada: al revés, un fallo dejaría el
  // código quemado y el plan sin aprobar.
  appendApproval(request.paths, {
    kind: "approval-consumed",
    code: emitido.code,
    consumedAt: request.ahora.toISOString(),
    actor: request.actor,
    decision: "approve",
  });
  return { ticket: claims.ticket, ok: true, detalle: `plan aprobado con el código ${emitido.code}` };
}

/**
 * Aprueba por código: el de un plan o el de un lote.
 *
 * La fuente `token` solo vale si el proyecto la declara en `plan-approval-sources`: se comprueba
 * **antes** de consumir nada.
 */
export function aprobarPorCodigo(request: {
  readonly paths: RegistryPaths;
  readonly secret: string;
  readonly codigo: string;
  readonly actor: string;
  readonly quote: string;
  readonly ahora: Date;
  readonly env?: Readonly<Record<string, string | undefined>>;
}): readonly ResultadoDeAprobacion[] {
  if (!planApprovalSources(request.paths.root).includes(FUENTE_TOKEN)) {
    return [
      {
        ticket: "?",
        ok: false,
        detalle:
          "la fuente `token` no está entre las que el proyecto acepta para aprobar un plan: se declara con " +
          "`plan-approval-sources` en .valmen/config.yaml.",
      },
    ];
  }
  const normalizado = normalizarCodigo(request.codigo);
  const lote = readApprovalLog(request.paths)
    .filter((e): e is ApprovalBatch => e.kind === "approval-batch" && normalizarCodigo(e.code) === normalizado)
    .at(-1);
  if (lote === undefined) return [aprobarPlanDeCodigo(request)];

  if (new Date(lote.expiresAt).getTime() <= request.ahora.getTime()) {
    return [{ ticket: `LOTE-${lote.journeyId}`, ok: false, detalle: `el código ${lote.code} venció el ${lote.expiresAt}` }];
  }
  if (readApprovalLog(request.paths).some((e) => e.kind === "approval-consumed" && normalizarCodigo(e.code) === normalizado)) {
    return [{ ticket: `LOTE-${lote.journeyId}`, ok: false, detalle: `el código ${lote.code} ya se usó` }];
  }
  const resultados = lote.items.map((item) => aprobarPlanDeCodigo({ ...request, codigo: item.code }));
  if (resultados.every((r) => r.ok)) {
    appendApproval(request.paths, {
      kind: "approval-consumed",
      code: lote.code,
      consumedAt: request.ahora.toISOString(),
      actor: request.actor,
      decision: "approve",
    });
  }
  return resultados;
}

