/**
 * La elegibilidad para la aprobación automática de un análisis o un plan, decidida en código
 * (R-APRO-004 y R-APRO-005).
 *
 * Delegar una aprobación en el código solo es seguro si cada condición se **comprueba** y es
 * auditable. Esta función reúne las condiciones en una sola decisión: no consulta a ningún modelo,
 * no escribe nada, devuelve **todas** las reglas que no se cumplen con su motivo —no solo la
 * primera— y, si el ticket es elegible, cita la autorización que lo respalda.
 *
 * Hay cuatro barreras que ninguna autorización levanta: un ticket SECURITY, un recibo `block` (o
 * un rechazo humano) de la compuerta de la etapa, un `block` de `qa-mechanical` y un diagnóstico
 * que declara despliegue. El resto lo decide la autorización que la persona declaró: tipo (SYNC,
 * INTEGRATION y AGENT incluidos solo si los lista), módulo, riesgo, impactos de sincronización,
 * migración o contenedores solo si los lista de forma explícita, etapa y cupo del día.
 *
 * Decidir que un ticket es elegible no lo aprueba, no consume cupo ni mueve su estado: solo dice
 * que se puede intentar. `elegibilidadDeAprobacion` no escribe nada; la única función de este
 * módulo que escribe es `aprobarPorAutorizacion` (R-APRO-002), que registra la aprobación atribuida
 * a la autorización y consume un cupo, y `motivoDeAprobacionPorAutorizacionInvalida` la re-verifica
 * contra el registro al entrar a `approved`.
 */
import {
  EXIT_INVARIANT,
  type ParsedTicket,
  declaredImpactIds,
  diagnosedImpacts,
  fail,
  parseTicket,
} from "@valmen/core";
import { hashState } from "@valmen/gate";

import {
  type AutorizacionDeAprobacionConEstado,
  ETAPAS_APROBABLES,
  RIESGOS_APROBABLES,
  TIPOS_APROBABLES,
  autorizacionDeAprobacionQueCubre,
  autorizacionesDeAprobacionVigentes,
  cupoRestanteDeAprobacion,
  hayUsoDeCupoDeAprobacion,
  leerAutorizacionesDeAprobacion,
  registrarUsoDeCupoDeAprobacion,
} from "./approval-authorization.js";
import { type RegistryPaths, findAllTickets, findTicket } from "./discovery.js";
import { appendEvent } from "./mutate.js";
import {
  type AprobacionDePlan,
  FUENTE_AUTORIZACION,
  PLAN_APPROVED_ACTION,
  assertSesionAtendida,
  hashDelPlan,
} from "./plan-approval.js";
import { readReceipts, veredictoDeCompuerta } from "./receipts.js";
import { buildGateState } from "./state.js";

/** Una condición de la elegibilidad: si se cumple y por qué. */
export interface ReglaDeElegibilidadDeAprobacion {
  readonly regla: string;
  readonly cumple: boolean;
  readonly detalle: string;
}

export interface ResultadoDeElegibilidadDeAprobacion {
  readonly ticketId: string;
  readonly etapa: string;
  readonly elegible: boolean;
  /** Todas las reglas, en orden, cumplan o no. */
  readonly reglas: readonly ReglaDeElegibilidadDeAprobacion[];
  /** La autorización que respalda al ticket; solo si es elegible. */
  readonly autorizacion: { readonly id: string; readonly hash: string } | null;
  /**
   * `true` si todo se cumple salvo que la compuerta quedó en `review` y la autorización que cubre
   * al ticket es de modo `reviewer`: el revisor puede decidirlo, aunque el código no lo apruebe.
   */
  readonly derivableAlRevisor: boolean;
}

export interface ElegibilidadDeAprobacionRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  /** La etapa cuya compuerta se quiere aprobar: `analysis` o `plan`. */
  readonly etapa: string;
  readonly ahora?: Date;
}

/** El orden de los riesgos, de menor a mayor: un riesgo desconocido no se asume cubierto. */
const RIESGOS_CONOCIDOS = ["low", "normal", "high", "critical"];

/** Las palabras con las que el diagnóstico nombra un despliegue. */
const DESPLIEGUE_RE = /\bdespliegue|\bdesplegar|\bdesplegad|\bdeploy/i;

/** Decide si el análisis o el plan de un ticket puede aprobarse por una autorización. No consulta a ningún modelo. */
export function elegibilidadDeAprobacion(request: ElegibilidadDeAprobacionRequest): ResultadoDeElegibilidadDeAprobacion {
  const { paths, ticketId, etapa } = request;
  const ahora = request.ahora ?? new Date();
  const ubicado = findTicket(paths, ticketId);
  if (ubicado === undefined) throw new Error(`No existe el ticket ${ticketId}.`);
  const ticket = parseTicket(ubicado.text);
  const { type: tipo, module: modulo, risk_level: riesgo } = ticket.fields;
  const reglas: ReglaDeElegibilidadDeAprobacion[] = [];
  const regla = (nombre: string, cumple: boolean, detalle: string): void => {
    reglas.push({ regla: nombre, cumple, detalle });
  };

  // 1. La etapa es una de las que una autorización puede cubrir.
  const etapaValida = (ETAPAS_APROBABLES as readonly string[]).includes(etapa);
  regla(
    "etapa",
    etapaValida,
    etapaValida
      ? `la etapa ${etapa} se puede aprobar por autorización`
      : `la etapa «${etapa}» no se aprueba por autorización: solo ${ETAPAS_APROBABLES.join(" o ")}`,
  );

  // 2. Un ticket SECURITY no es elegible nunca, aunque una autorización lo listara (C1).
  const esSecurity = tipo.toUpperCase() === "SECURITY";
  regla(
    "tipo",
    !esSecurity,
    esSecurity
      ? "el tipo SECURITY nunca se aprueba sin una persona, aunque una autorización lo listara"
      : `el tipo ${tipo} no está excluido de plano; lo decide la autorización`,
  );

  // 3. Un diagnóstico que declara despliegue es de una persona (C4).
  const impactos = diagnosedImpacts(ticket.sections["Diagnóstico"] ?? "");
  const declaraDespliegue = impactos.found && !impactos.saysNone && DESPLIEGUE_RE.test(impactos.value);
  regla(
    "despliegue",
    !declaraDespliegue,
    declaraDespliegue
      ? `el diagnóstico declara despliegue («${impactos.value}»): el despliegue es de una persona`
      : "el diagnóstico no declara despliegue",
  );

  // 4. Un `block` vigente de `qa-mechanical` es un hecho, no una opinión (C3).
  const recibos = readReceipts(paths, ticketId);
  const mecanica = veredictoDeCompuerta(recibos, "qa-mechanical");
  regla(
    "qa-mechanical",
    mecanica.tipo !== "bloqueada",
    mecanica.tipo === "bloqueada"
      ? `el último recibo de qa-mechanical (${mecanica.recibo.id}) bloqueó: un comando falló y no se aprueba por autorización`
      : mecanica.tipo === "sin-recibo"
        ? "qa-mechanical no tiene recibo todavía"
        : `el último recibo de qa-mechanical (${mecanica.recibo.id}) no bloquea`,
  );

  // 5. La compuerta de la etapa está en `approve` (C2, C8).
  let compuertaEnReview = false;
  if (!etapaValida) {
    regla("compuerta", false, `sin una etapa válida no hay compuerta que mirar (${ETAPAS_APROBABLES.join(" o ")})`);
  } else {
    const veredicto = veredictoDeCompuerta(recibos, etapa);
    switch (veredicto.tipo) {
      case "sin-recibo":
        regla("compuerta", false, `la compuerta ${etapa} no tiene recibo: hay que correrla antes de aprobar`);
        break;
      case "bloqueada": {
        const rechazo = veredicto.recibo.humanDecision !== null;
        regla(
          "compuerta",
          false,
          rechazo
            ? `una persona rechazó el recibo ${veredicto.recibo.id} de la compuerta ${etapa}: no se aprueba por autorización`
            : `el recibo ${veredicto.recibo.id} de la compuerta ${etapa} está en block: un block no se aprueba sin una persona`,
        );
        break;
      }
      case "espera-persona":
        compuertaEnReview = veredicto.recibo.outcome === "review";
        regla(
          "compuerta",
          false,
          `el recibo ${veredicto.recibo.id} de la compuerta ${etapa} está en ${compuertaEnReview ? "review" : "espera de una persona"}: no es elegible`,
        );
        break;
      case "aprobada": {
        const decision = veredicto.recibo.humanDecision;
        regla(
          "compuerta",
          true,
          decision === null
            ? `el recibo ${veredicto.recibo.id} de la compuerta ${etapa} está en approve`
            : `una persona (${decision.actor}) ya aprobó el recibo ${veredicto.recibo.id} de la compuerta ${etapa}; no necesita la autorización`,
        );
        break;
      }
    }
  }

  // 6. Una autorización vigente cubre tipo, módulo, riesgo, impactos y etapa (C5, C6, C7).
  const impactosDelTicket = declaredImpactIds(ticket);
  const riesgoConocido = RIESGOS_CONOCIDOS.includes(riesgo);
  const cubre: AutorizacionDeAprobacionConEstado | null =
    esSecurity || !riesgoConocido
      ? null
      : autorizacionDeAprobacionQueCubre(
          paths.root,
          {
            type: tipo,
            module: modulo,
            riskLevel: riesgo,
            impacts: impactosDelTicket,
            ...(etapaValida ? { stage: etapa } : {}),
          },
          ahora,
        );
  if (cubre !== null) {
    regla(
      "autorizacion",
      true,
      `la autorización ${cubre.id} (modo ${cubre.mode}) cubre ${tipo}/${modulo}, riesgo ${riesgo}, ` +
        `impactos ${impactosDelTicket.length === 0 ? "ninguno" : impactosDelTicket.join(", ")} y etapa ${etapa}`,
    );
  } else {
    const vigentes = autorizacionesDeAprobacionVigentes(paths.root, ahora);
    if (esSecurity) {
      regla("autorizacion", false, "un ticket SECURITY no admite autorización");
    } else if (!riesgoConocido) {
      regla("autorizacion", false, `el riesgo «${riesgo}» no es uno que una autorización pueda cubrir (${RIESGOS_APROBABLES.join(" o ")})`);
    } else if (vigentes.length === 0) {
      regla("autorizacion", false, "no hay ninguna autorización de aprobación vigente");
    } else {
      const motivos = vigentes.map(
        (a) =>
          `${a.id}: ${primeraDimensionQueFalla(a, { tipo, modulo, riesgo, impactos: impactosDelTicket, etapa: etapaValida ? etapa : null })}`,
      );
      regla("autorizacion", false, `ninguna autorización vigente cubre al ticket; ${motivos.join("; ")}`);
    }
  }

  // 7. Queda cupo hoy en la autorización que lo cubre (C9).
  if (cubre === null) {
    regla("cupo", false, "sin una autorización que lo cubra no hay cupo que consultar");
  } else {
    const cupo = cupoRestanteDeAprobacion(paths.root, cubre, ahora);
    regla(
      "cupo",
      cupo > 0,
      cupo > 0
        ? `la autorización ${cubre.id} tiene ${cupo} de ${cubre.dailyQuota} cupo(s) hoy`
        : `la autorización ${cubre.id} agotó su cupo diario (${cubre.dailyQuota})`,
    );
  }

  const elegible = reglas.every((r) => r.cumple);
  const soloFallaLaCompuerta = reglas.filter((r) => !r.cumple).every((r) => r.regla === "compuerta");
  return {
    ticketId,
    etapa,
    elegible,
    reglas,
    autorizacion: elegible && cubre !== null ? { id: cubre.id, hash: cubre.hash } : null,
    derivableAlRevisor: compuertaEnReview && soloFallaLaCompuerta && cubre !== null && cubre.mode === "reviewer",
  };
}

/** La primera dimensión en la que una autorización no cubre al ticket, con el motivo. */
function primeraDimensionQueFalla(
  a: AutorizacionDeAprobacionConEstado,
  t: { tipo: string; modulo: string; riesgo: string; impactos: readonly string[]; etapa: string | null },
): string {
  if (!a.types.includes(t.tipo.toUpperCase())) {
    return `no lista el tipo ${t.tipo} (lista ${a.types.join(", ")}; los tipos que una autorización puede cubrir son ${TIPOS_APROBABLES.join(", ")})`;
  }
  if (!a.modules.includes(t.modulo.toLowerCase())) {
    return `no lista el módulo ${t.modulo} (lista ${a.modules.join(", ")})`;
  }
  if (RIESGOS_CONOCIDOS.indexOf(t.riesgo) > RIESGOS_CONOCIDOS.indexOf(a.maxRisk)) {
    return `su riesgo máximo es ${a.maxRisk} y el ticket es ${t.riesgo}`;
  }
  const noListados = t.impactos.filter((i) => !a.impacts.includes(i));
  if (noListados.length > 0) {
    return `no lista el impacto ${noListados.join(", ")} que el ticket declara (lista ${a.impacts.length === 0 ? "ninguno" : a.impacts.join(", ")})`;
  }
  if (t.etapa !== null && !a.stages.includes(t.etapa)) {
    return `no cubre la etapa ${t.etapa} (cubre ${a.stages.join(", ")})`;
  }
  return "no lo cubre por una razón que esta lectura no identifica";
}

// ── Registrar la aprobación atribuida a la autorización (R-APRO-002) ─────────

/** La acción del evento de una etapa; `plan` es la que `transition --to approved` lee. */
const ACCION_DE_ETAPA: Readonly<Record<string, string>> = { plan: PLAN_APPROVED_ACTION, analysis: "analysis-approved" };

export interface AprobarPorAutorizacionRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  /** `analysis` o `plan`. */
  readonly etapa: string;
  readonly ahora?: Date;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface ResultadoDeAprobarPorAutorizacion {
  readonly ticketId: string;
  readonly etapa: string;
  /** `false` si ya había una aprobación vigente para este estado y no se escribió nada. */
  readonly registrada: boolean;
  readonly autorizacion: { readonly id: string; readonly hash: string };
  /** Cupos que le quedan hoy a la autorización tras esta aprobación. */
  readonly cupoRestante: number;
  readonly accion: string;
  readonly receiptId: string;
}

interface DatosDeEvento {
  readonly source?: unknown;
  readonly stage?: unknown;
  readonly planHash?: unknown;
  readonly receiptStateHash?: unknown;
  readonly authorizationId?: unknown;
}

/** Los eventos de la acción, del más viejo al más nuevo, con sus detalles ya leídos. */
function eventosDe(doc: ParsedTicket, accion: string): DatosDeEvento[] {
  const salida: DatosDeEvento[] = [];
  for (const e of doc.blocks.Eventos ?? []) {
    if (e["action"] !== accion) continue;
    try {
      salida.push(JSON.parse(String(e["details"])) as DatosDeEvento);
    } catch {
      // Un evento sin la forma esperada no cuenta.
    }
  }
  return salida;
}

/**
 * Registra la aprobación del análisis o del plan atribuida a la autorización vigente que cubre al
 * ticket, y consume un cupo. Si cualquier barrera falla no escribe nada ni consume cupo.
 *
 * Orden: la sesión atendida primero (nada se lee antes); la elegibilidad completa, con todas las
 * reglas que fallan; el recibo `approve` vigente respecto al ticket; y solo entonces el cupo y el
 * evento. El cupo va antes que el evento a propósito: si la escritura del evento falla se pierde un
 * cupo, pero no se aprueba nada.
 */
export function aprobarPorAutorizacion(request: AprobarPorAutorizacionRequest): ResultadoDeAprobarPorAutorizacion {
  const { paths, ticketId, etapa } = request;
  const ahora = request.ahora ?? new Date();
  assertSesionAtendida("aprobar por autorización", request.env ?? process.env);

  const elegibilidad = elegibilidadDeAprobacion({ paths, ticketId, etapa, ahora });
  if (!elegibilidad.elegible || elegibilidad.autorizacion === null) {
    const fallas = elegibilidad.reglas.filter((r) => !r.cumple).map((r) => `  ✗ ${r.regla}: ${r.detalle}`);
    fail(
      `${ticketId} no se aprueba por autorización en ${etapa}; no se registró nada ni se consumió cupo:\n${fallas.join("\n")}`,
      EXIT_INVARIANT,
    );
  }
  const { id: authorizationId, hash: authorizationHash } = elegibilidad.autorizacion;

  const ubicado = findTicket(paths, ticketId);
  if (ubicado === undefined) throw new Error(`No existe el ticket ${ticketId}.`);
  const documento = parseTicket(ubicado.text);
  const accion = ACCION_DE_ETAPA[etapa] as string;

  // El recibo `approve` tiene que haber evaluado el texto que hay ahora (AP-007).
  const veredicto = veredictoDeCompuerta(readReceipts(paths, ticketId), etapa);
  if (veredicto.tipo !== "aprobada") throw new Error("La elegibilidad dejó pasar una compuerta que no está aprobada.");
  const recibo = veredicto.recibo;
  const estadoActual = hashState(buildGateState(documento.text));
  if (recibo.stateHash !== estadoActual) {
    fail(
      `El recibo ${recibo.id} de la compuerta ${etapa} evaluó otro texto del ticket (cambió después de la compuerta): ` +
        `no se registró nada. Vuelve a correr la compuerta:\n  valmen gate ${etapa} --id ${ticketId}`,
      EXIT_INVARIANT,
    );
  }

  const planHash = hashDelPlan(documento);
  const autorizacionVigente = leerAutorizacionesDeAprobacion(paths.root, ahora).find(
    (a) => a.id === authorizationId && a.hash === authorizationHash,
  );
  const cupoDe = (): number =>
    autorizacionVigente === undefined ? 0 : cupoRestanteDeAprobacion(paths.root, autorizacionVigente, ahora);

  // Repetir con la aprobación todavía vigente no escribe otro evento ni consume otro cupo (C13).
  const ultimo = eventosDe(documento, accion).at(-1);
  const sigueVigente =
    ultimo?.source === FUENTE_AUTORIZACION &&
    ultimo.authorizationId === authorizationId &&
    ultimo.planHash === planHash &&
    ultimo.receiptStateHash === estadoActual &&
    ultimo.stage === etapa;
  if (sigueVigente) {
    return { ticketId, etapa, registrada: false, autorizacion: elegibilidad.autorizacion, cupoRestante: cupoDe(), accion, receiptId: recibo.id };
  }

  const cubre = autorizacionVigente;
  if (cubre === undefined) throw new Error("La autorización que cubre al ticket dejó de existir.");
  registrarUsoDeCupoDeAprobacion({ root: paths.root, authorizationId, ticketId, stage: etapa, ahora });
  const detalles = {
    actor: `autorización ${authorizationId}`,
    source: FUENTE_AUTORIZACION,
    quote: cubre.quote,
    planHash,
    authorizationId,
    authorizationHash,
    stage: etapa,
    receiptId: recibo.id,
    receiptStateHash: estadoActual,
  };
  appendEvent(paths, ticketId, accion, JSON.stringify(detalles), () => ahora);
  return { ticketId, etapa, registrada: true, autorizacion: elegibilidad.autorizacion, cupoRestante: cupoDe(), accion, receiptId: recibo.id };
}

/**
 * Re-verifica, al entrar a `approved`, una aprobación de fuente `autorizacion` contra el registro:
 * lo que el evento dice no basta, porque cualquiera puede escribir un evento. Devuelve el motivo si
 * no vale, o `null`. La autorización tiene que existir con el mismo hash y estar vigente **ahora**
 * —una revocación posterior al registro anula la aprobación—, el ticket no puede ser SECURITY y
 * tiene que haber un uso de cupo de esa autorización para este ticket y la etapa `plan`.
 */
export function motivoDeAprobacionPorAutorizacionInvalida(
  root: string,
  documento: ParsedTicket,
  aprobacion: AprobacionDePlan,
  ahora: Date = new Date(),
): string | null {
  const regla = "Una persona la registra con `valmen approve-plan`.";
  if (documento.fields.type.toUpperCase() === "SECURITY") {
    return `Un ticket SECURITY no se aprueba por autorización. ${regla}`;
  }
  const { authorizationId, authorizationHash } = aprobacion;
  if (authorizationId === undefined || authorizationHash === undefined) {
    return `La aprobación dice que es de una autorización pero no cita su id y su hash. ${regla}`;
  }
  const autorizacion = leerAutorizacionesDeAprobacion(root, ahora).find(
    (a) => a.id === authorizationId && a.hash === authorizationHash,
  );
  if (autorizacion === undefined) {
    return `La autorización ${authorizationId} (${authorizationHash.slice(0, 19)}…) no existe en el registro con ese hash. ${regla}`;
  }
  if (autorizacion.estado !== "vigente") {
    return `La autorización ${authorizationId} ya no está vigente (${autorizacion.estado}): su aprobación pendiente quedó anulada. ${regla}`;
  }
  if (!hayUsoDeCupoDeAprobacion(root, authorizationId, documento.fields.id, "plan")) {
    return `La autorización ${authorizationId} no tiene un cupo registrado para aprobar el plan de este ticket. ${regla}`;
  }
  return null;
}

// ── Visibilidad de las aprobaciones automáticas (R-APRO-007) ─────────────────

/** Una aprobación automática registrada en un ticket, unida a su autorización. */
export interface AprobacionAutomaticaListada {
  readonly ticket: string;
  readonly etapa: string;
  readonly autorizacion: string;
  readonly hash: string;
  readonly recibo: string;
  /** Modo de la autorización; `desconocido` si ya no existe en el registro con ese id. */
  readonly modo: string;
  /** Estado actual de la autorización; `desconocida` si no existe con ese id. */
  readonly estado: string;
  /** Instante del evento. */
  readonly en: string;
  /** Día (YYYY-MM-DD) del evento. */
  readonly dia: string;
}

export interface ListaDeAprobacionesAutomaticas {
  readonly aprobaciones: readonly AprobacionAutomaticaListada[];
  /** Tickets ilegibles que se omitieron. */
  readonly omitidos: readonly string[];
}

const texto = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Lista las aprobaciones de análisis o plan hechas por autorización, de todos los tickets. Solo
 * lee. Un ticket ilegible se omite y se cuenta en `omitidos`: la lista no debe caerse por uno.
 */
export function listarAprobacionesAutomaticas(
  paths: RegistryPaths,
  opciones: { readonly dia?: string; readonly ahora?: Date } = {},
): ListaDeAprobacionesAutomaticas {
  const autorizaciones = leerAutorizacionesDeAprobacion(paths.root, opciones.ahora ?? new Date());
  const aprobaciones: AprobacionAutomaticaListada[] = [];
  const omitidos: string[] = [];
  for (const t of findAllTickets(paths)) {
    let documento: ParsedTicket;
    try {
      documento = parseTicket(t.text);
    } catch {
      omitidos.push(t.id);
      continue;
    }
    for (const accion of Object.values(ACCION_DE_ETAPA)) {
      for (const e of documento.blocks.Eventos ?? []) {
        if (e["action"] !== accion) continue;
        let d: Record<string, unknown>;
        try {
          d = JSON.parse(String(e["details"])) as Record<string, unknown>;
        } catch {
          continue;
        }
        if (d["source"] !== FUENTE_AUTORIZACION) continue;
        const en = texto(e["at"]);
        const dia = texto(e["date"]) || en.slice(0, 10);
        if (opciones.dia !== undefined && dia !== opciones.dia) continue;
        const id = texto(d["authorizationId"]);
        const hash = texto(d["authorizationHash"]);
        const a = autorizaciones.find((x) => x.id === id && x.hash === hash) ?? autorizaciones.find((x) => x.id === id);
        aprobaciones.push({
          ticket: t.id,
          etapa: texto(d["stage"]) || (accion === PLAN_APPROVED_ACTION ? "plan" : "analysis"),
          autorizacion: id,
          hash,
          recibo: texto(d["receiptId"]),
          modo: a?.mode ?? "desconocido",
          estado: a === undefined ? "desconocida" : a.hash === hash ? a.estado : "hash-no-coincide",
          en,
          dia,
        });
      }
    }
  }
  aprobaciones.sort((x, y) => (x.en < y.en ? -1 : x.en > y.en ? 1 : 0));
  return { aprobaciones, omitidos };
}

/**
 * Cuenta las aprobaciones de plan de un día: las de fuente `autorizacion` son automáticas; todas
 * las demás (cli, delegacion, ...) son de una persona. Un ticket ilegible se omite.
 */
export function contarAprobacionesDelDia(paths: RegistryPaths, dia: string): { automaticas: number; humanas: number } {
  const { aprobaciones } = listarAprobacionesAutomaticas(paths, { dia });
  let humanas = 0;
  for (const t of findAllTickets(paths)) {
    let documento: ParsedTicket;
    try {
      documento = parseTicket(t.text);
    } catch {
      continue;
    }
    for (const e of documento.blocks.Eventos ?? []) {
      if (e["action"] !== PLAN_APPROVED_ACTION) continue;
      if ((texto(e["date"]) || texto(e["at"]).slice(0, 10)) !== dia) continue;
      let fuente: unknown;
      try {
        fuente = (JSON.parse(String(e["details"])) as Record<string, unknown>)["source"];
      } catch {
        fuente = undefined;
      }
      if (fuente !== FUENTE_AUTORIZACION) humanas += 1;
    }
  }
  return { automaticas: aprobaciones.length, humanas };
}
