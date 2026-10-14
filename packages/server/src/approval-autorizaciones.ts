/**
 * Mission Control como canal humano de la autorización de aprobación automática (R-APRO-001).
 *
 * Cada escritura llama a `crearAutorizacion` / `revocarAutorizacion` del motor con la fuente
 * `mission-control`: las barreras (canal declarado, sesión atendida, tipos y riesgos permitidos)
 * son las del motor y no se repiten aquí. El token de escritura lo exige el despacho del servidor
 * antes de llegar a este módulo; esta capa agrega la frase literal, que nunca puede ir vacía.
 */
import { existsSync, readFileSync } from "node:fs";

import {
  POLITICA_POR_DEFECTO,
  POLITICA_POR_DEFECTO_ID,
  approvalAuthorizationsPath,
  autorizacionQueRespalda,
  crearAutorizacionDeAprobacion,
  leerAutorizacionesDeAprobacion,
  revocarAutorizacionDeAprobacion,
} from "@valmen/engine";
import { toFailure } from "@valmen/core";

export interface RespuestaAprobacion {
  readonly status: number;
  readonly body: unknown;
}

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const lista = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map((x) => texto(x)).filter((x) => x !== "")
    : texto(v)
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x !== "");

/** El estado de la aprobación por defecto, que no vive en el registro (FEATURE-WEB-AJUSTES-PROYECTO, D-001). */
export interface EstadoPorDefecto {
  readonly id: string;
  readonly estado: "vigente" | "revocada" | "vencida" | "futura" | "desconocida";
  readonly revocacion: unknown;
}

function estadoPorDefecto(root: string, ahora: Date): EstadoPorDefecto {
  const a = autorizacionQueRespalda(root, POLITICA_POR_DEFECTO_ID, POLITICA_POR_DEFECTO.hash, ahora);
  if (a !== undefined) {
    return { id: POLITICA_POR_DEFECTO_ID, estado: a.estado, revocacion: a.revocacion };
  }
  // Solo pasa si el registro trae una entrada con el mismo id y otro contenido: se dice
  // «revocada» si hay una revocación de ese id, y si no, que no se sabe.
  const ruta = approvalAuthorizationsPath(root);
  const revocada =
    existsSync(ruta) &&
    readFileSync(ruta, "utf8")
      .split("\n")
      .some((l) => l.includes('"approval-authorization-revoked"') && l.includes(`"${POLITICA_POR_DEFECTO_ID}"`));
  return { id: POLITICA_POR_DEFECTO_ID, estado: revocada ? "revocada" : "desconocida", revocacion: null };
}

/** Las autorizaciones con su estado y el de la aprobación por defecto. Solo lee. */
export function listarAutorizacionesDeAprobacion(
  root: string,
  ahora: Date = new Date(),
): RespuestaAprobacion {
  return {
    status: 200,
    body: {
      authorizations: leerAutorizacionesDeAprobacion(root, ahora),
      porDefecto: estadoPorDefecto(root, ahora),
    },
  };
}

/** Crea una autorización desde Mission Control. */
export function crearAutorizacionDeAprobacionMc(
  root: string,
  cuerpo: unknown,
  env: Readonly<Record<string, string | undefined>>,
  ahora?: Date,
): RespuestaAprobacion {
  const d = (cuerpo ?? {}) as Record<string, unknown>;
  if (texto(d["actor"]) === "")
    return { status: 400, body: { error: "Falta el responsable (`actor`)." } };
  if (texto(d["quote"]) === "")
    return {
      status: 400,
      body: { error: "Falta la frase literal de quien autoriza (`quote`)." },
    };
  try {
    const a = crearAutorizacionDeAprobacion({
      root,
      actor: texto(d["actor"]),
      quote: texto(d["quote"]),
      types: lista(d["types"]),
      modules: lista(d["modules"]),
      maxRisk: texto(d["maxRisk"]) === "" ? "normal" : texto(d["maxRisk"]),
      impacts: lista(d["impacts"]),
      stages: lista(d["stages"]).length === 0 ? ["analysis", "plan"] : lista(d["stages"]),
      mode: texto(d["mode"]) === "" ? "on-approve" : texto(d["mode"]),
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
export function revocarAutorizacionDeAprobacionMc(
  root: string,
  cuerpo: unknown,
  env: Readonly<Record<string, string | undefined>>,
  ahora?: Date,
): RespuestaAprobacion {
  const d = (cuerpo ?? {}) as Record<string, unknown>;
  if (texto(d["id"]) === "")
    return { status: 400, body: { error: "Falta la autorización (`id`)." } };
  if (texto(d["actor"]) === "")
    return { status: 400, body: { error: "Falta el responsable (`actor`)." } };
  if (texto(d["quote"]) === "")
    return {
      status: 400,
      body: { error: "Falta la frase literal de quien revoca (`quote`)." },
    };
  try {
    const r = revocarAutorizacionDeAprobacion({
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
