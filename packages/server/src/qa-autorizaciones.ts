/**
 * Mission Control como canal humano de la autorización de QA por agente (R-QAAG-001).
 *
 * Cada escritura llama a `crearAutorizacion` / `revocarAutorizacion` del motor con la fuente
 * `mission-control`: las barreras (canal declarado, sesión atendida, tipos y riesgos permitidos)
 * son las del motor y no se repiten aquí. El token de escritura lo exige el despacho del servidor
 * antes de llegar a este módulo; esta capa agrega la frase literal, que nunca puede ir vacía.
 */
import { crearAutorizacion, leerAutorizaciones, revocarAutorizacion } from "@valmen/engine";
import { toFailure } from "@valmen/core";

export interface RespuestaQa {
  readonly status: number;
  readonly body: unknown;
}

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const lista = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => texto(x)).filter((x) => x !== "") : texto(v).split(",").map((x) => x.trim()).filter((x) => x !== "");

/** Las autorizaciones con su estado. Solo lee. */
export function listarAutorizacionesQa(root: string, ahora: Date = new Date()): RespuestaQa {
  return { status: 200, body: { authorizations: leerAutorizaciones(root, ahora) } };
}

/** Crea una autorización desde Mission Control. */
export function crearAutorizacionQa(root: string, cuerpo: unknown, env: Readonly<Record<string, string | undefined>>, ahora?: Date): RespuestaQa {
  const d = (cuerpo ?? {}) as Record<string, unknown>;
  if (texto(d["actor"]) === "") return { status: 400, body: { error: "Falta el responsable (`actor`)." } };
  if (texto(d["quote"]) === "") return { status: 400, body: { error: "Falta la frase literal de quien autoriza (`quote`)." } };
  try {
    const a = crearAutorizacion({
      root,
      actor: texto(d["actor"]),
      quote: texto(d["quote"]),
      types: lista(d["types"]),
      modules: lista(d["modules"]),
      maxRisk: texto(d["maxRisk"]) === "" ? "normal" : texto(d["maxRisk"]),
      dailyQuota: Number(d["dailyQuota"] ?? 1),
      validDays: Number(d["validDays"] ?? 30),
      source: "mission-control",
      env,
      ...(ahora === undefined ? {} : { ahora }),
    });
    return { status: 200, body: { authorization: a } };
  } catch (caught) {
    return { status: 400, body: { error: toFailure(caught).message } };
  }
}

/** Revoca una autorización desde Mission Control; la frase literal es el motivo. */
export function revocarAutorizacionQa(root: string, cuerpo: unknown, env: Readonly<Record<string, string | undefined>>, ahora?: Date): RespuestaQa {
  const d = (cuerpo ?? {}) as Record<string, unknown>;
  if (texto(d["id"]) === "") return { status: 400, body: { error: "Falta la autorización (`id`)." } };
  if (texto(d["actor"]) === "") return { status: 400, body: { error: "Falta el responsable (`actor`)." } };
  if (texto(d["quote"]) === "") return { status: 400, body: { error: "Falta la frase literal de quien revoca (`quote`)." } };
  try {
    const r = revocarAutorizacion({
      root,
      id: texto(d["id"]),
      actor: texto(d["actor"]),
      reason: texto(d["quote"]),
      source: "mission-control",
      env,
      ...(ahora === undefined ? {} : { ahora }),
    });
    return { status: 200, body: { revocation: r } };
  } catch (caught) {
    return { status: 400, body: { error: toFailure(caught).message } };
  }
}
