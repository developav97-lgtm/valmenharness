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
 * que se puede intentar. Registrar la aprobación es de quien consume esta decisión.
 */
import { declaredImpactIds, diagnosedImpacts, parseTicket } from "@valmen/core";

import {
  type AutorizacionDeAprobacionConEstado,
  ETAPAS_APROBABLES,
  RIESGOS_APROBABLES,
  TIPOS_APROBABLES,
  autorizacionDeAprobacionQueCubre,
  autorizacionesDeAprobacionVigentes,
  cupoRestanteDeAprobacion,
} from "./approval-authorization.js";
import { type RegistryPaths, findTicket } from "./discovery.js";
import { readReceipts, veredictoDeCompuerta } from "./receipts.js";

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
