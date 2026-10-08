/**
 * La aprobación del plan como un hecho con autor, no como una frase en el plan (R-CTRL-001).
 *
 * Hoy `hasPlanGate` acepta una línea de `## Plan` que diga «aprobado explícitamente por el
 * PO». Es texto libre: no dice quién, desde dónde ni qué plan, y quien escribe el plan
 * —el agente— puede escribirla. Aquí la aprobación es un **evento** del ticket con actor,
 * fuente, frase literal y el hash del plan que se aprobó, y deja de valer si el plan cambia.
 *
 * Este módulo registra y verifica; hacer que `transition --to approved` lo **exija** es del
 * ticket siguiente de la cadena, y por eso nada de lo que ya existe cambia.
 */
import { createHash } from "node:crypto";

import {
  type JsonObject,
  type ParsedTicket,
  EXIT_INVARIANT,
  EXIT_SCHEMA,
  fail,
  parseTicket,
  planLines,
} from "@valmen/core";

import { type RegistryPaths, findTicket, planApprovalSources } from "./discovery.js";
import { appendEvent } from "./mutate.js";

/** La acción del evento que registra la aprobación. */
export const PLAN_APPROVED_ACTION = "plan-approved";

/** La variable que fija un despachador para marcar una sesión sin persona delante. */
export const UNATTENDED_ENV = "VALMEN_UNATTENDED";

/**
 * El hash del `## Plan`, sin la línea de «Gate de plan y aprobación».
 *
 * Esa línea se escribe **después** de aprobar —es la constancia—, así que si entrara en el
 * hash, dejarla invalidaría la aprobación que acaba de registrarse. Se normaliza el
 * espacio en blanco para que un reflujo del texto no cambie el hash; un cambio de palabras sí.
 */
export function hashDelPlan(document: ParsedTicket): string {
  const contenido = planLines(document.sections.Plan)
    .filter((linea) => !/^gate de plan y aprobaci[oó]n\s*:/i.test(linea))
    .map((linea) => linea.replace(/\s+/g, " ").trim())
    .join("\n");
  return `sha256:${createHash("sha256").update(contenido, "utf8").digest("hex")}`;
}

/**
 * La fuente de una aprobación atribuida a una autorización vigente (R-APRO-002). Solo la escribe
 * `aprobarPorAutorizacion`: ningún camino que reciba la fuente de fuera puede declararla.
 */
export const FUENTE_AUTORIZACION = "autorizacion";

/** Lo que dice una aprobación registrada. */
export interface AprobacionDePlan {
  readonly actor: string;
  readonly source: string;
  readonly quote: string;
  readonly planHash: string;
  /** Solo en una aprobación por autorización: la autorización que la respalda. */
  readonly authorizationId?: string;
  readonly authorizationHash?: string;
}

/** Por qué la aprobación vigente no vale, o que vale. */
export type EstadoDeAprobacion =
  | { readonly estado: "vigente"; readonly aprobacion: AprobacionDePlan }
  | { readonly estado: "sin-aprobacion"; readonly motivo: string }
  | {
      readonly estado: "plan-cambiado";
      readonly motivo: string;
      readonly aprobacion: AprobacionDePlan;
    };

function leerAprobacion(evento: JsonObject): AprobacionDePlan | null {
  try {
    const datos = JSON.parse(String(evento["details"])) as Record<string, unknown>;
    const { actor, source, quote, planHash } = datos;
    if (
      typeof actor === "string" &&
      typeof source === "string" &&
      typeof quote === "string" &&
      typeof planHash === "string"
    ) {
      const { authorizationId, authorizationHash } = datos;
      return {
        actor,
        source,
        quote,
        planHash,
        ...(typeof authorizationId === "string" ? { authorizationId } : {}),
        ...(typeof authorizationHash === "string" ? { authorizationHash } : {}),
      };
    }
  } catch {
    // Un evento con ese nombre pero sin la forma esperada no es una aprobación.
  }
  return null;
}

/**
 * ¿Hay una aprobación del plan vigente?
 *
 * Lee **solo los eventos** `plan-approved`, nunca las líneas de `## Plan`: una frase de
 * aprobación escrita en el plan da `sin-aprobacion`. Manda la última aprobación; vale si su
 * hash es el del plan de ahora.
 */
export function aprobacionDePlanVigente(document: ParsedTicket): EstadoDeAprobacion {
  const aprobaciones = (document.blocks.Eventos ?? [])
    .filter((evento) => evento["action"] === PLAN_APPROVED_ACTION)
    .map(leerAprobacion)
    .filter((aprobacion): aprobacion is AprobacionDePlan => aprobacion !== null);
  const ultima = aprobaciones[aprobaciones.length - 1];
  if (ultima === undefined) {
    return {
      estado: "sin-aprobacion",
      motivo:
        "El ticket no tiene una aprobación del plan registrada. Una frase escrita en `## Plan` " +
        "no la reemplaza: se registra con `valmen approve-plan`.",
    };
  }
  if (ultima.planHash !== hashDelPlan(document)) {
    return {
      estado: "plan-cambiado",
      aprobacion: ultima,
      motivo:
        `El plan cambió después de que ${ultima.actor} lo aprobó (${ultima.planHash.slice(0, 19)}…): ` +
        "la aprobación dejó de valer y hay que registrar una nueva.",
    };
  }
  return { estado: "vigente", aprobacion: ultima };
}

/** Lo que pide registrar una aprobación. */
export interface PlanApprovalRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly actor: string;
  readonly source: string;
  readonly quote: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly now?: () => Date;
  /**
   * La registra la corrida delegada, con las palabras del PO que quedaron en su registro.
   *
   * Habilita la fuente `delegacion` aunque el proyecto no la declare; no salta la barrera de
   * sesión desatendida. La corrida delegada es la única que lo pasa: desde la línea de
   * comandos no existe forma de pedirlo.
   */
  readonly viaDelegacion?: boolean;
}

/** La fuente con que la corrida delegada registra la aprobación. */
export const FUENTE_DELEGACION = "delegacion";

/**
 * Registra la aprobación del plan vigente.
 *
 * Rechaza una sesión marcada como desatendida: el ejecutor de una jornada no puede
 * aprobar el plan que va a ejecutar. Es una barrera de proceso y no criptográfica —quien
 * controla el entorno puede quitarla—; la defensa fuerte es que las fuentes aceptadas del
 * proyecto no incluyan al ejecutor.
 */
export function registrarAprobacionDePlan(request: PlanApprovalRequest): void {
  const entorno = request.env ?? process.env;
  if (entorno[UNATTENDED_ENV] !== undefined && entorno[UNATTENDED_ENV] !== "") {
    fail(
      "Una sesión desatendida no puede registrar la aprobación de un plan: la decide una persona.",
      EXIT_INVARIANT,
    );
  }
  const actor = request.actor.trim();
  const quote = request.quote.trim();
  if (actor === "") fail("Aprobar un plan necesita un responsable: falta --actor.", EXIT_SCHEMA);
  if (quote === "") {
    fail("Aprobar un plan necesita la frase literal de quien aprueba: falta --quote.", EXIT_SCHEMA);
  }
  // La fuente `autorizacion` es de `aprobarPorAutorizacion`: por aquí no se puede forjar (C16).
  if (request.source === FUENTE_AUTORIZACION) {
    fail(
      `La fuente «${FUENTE_AUTORIZACION}» no se declara: la escribe solo la aprobación por autorización ` +
        "(`valmen approve-by-authorization`), que comprueba la autorización y consume su cupo.",
      EXIT_INVARIANT,
    );
  }
  const fuentes = planApprovalSources(request.paths.root);
  const porDelegacion = request.viaDelegacion === true && request.source === FUENTE_DELEGACION;
  if (!porDelegacion && !fuentes.includes(request.source)) {
    fail(
      `La fuente «${request.source}» no está entre las que el proyecto acepta para aprobar un plan: ` +
        `${fuentes.join(", ")}. Se declaran con \`plan-approval-sources\` en .valmen/config.yaml.`,
      EXIT_INVARIANT,
    );
  }

  const located = findTicket(request.paths, request.ticketId);
  if (located === undefined) fail("La ruta canónica solicitada no existe.", EXIT_SCHEMA);
  const documento = parseTicket(located.text);

  const aprobacion: AprobacionDePlan = {
    actor,
    source: request.source,
    quote,
    planHash: hashDelPlan(documento),
  };
  appendEvent(
    request.paths,
    request.ticketId,
    PLAN_APPROVED_ACTION,
    JSON.stringify(aprobacion),
    request.now,
  );
}

/**
 * Falla si esta sesión es desatendida: una decisión humana —la de una compuerta, la aprobación de
 * un ciclo de QA o de un retest— no la toma una sesión sin persona delante (R-JORN-010).
 *
 * La barrera es de proceso (la marca la fija quien despacha al ejecutor) y no criptográfica; la
 * respalda la prueba que recorre las plantillas de prompt y el registro de quién decidió.
 */
export function assertSesionAtendida(
  accion: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  const marca = env[UNATTENDED_ENV];
  if (marca !== undefined && marca !== "") {
    fail(
      `Una sesión desatendida no puede ${accion}: esa decisión es de una persona.`,
      EXIT_INVARIANT,
    );
  }
}
