/**
 * La autorización persistida de QA por agente (R-QAAG-001).
 *
 * Cerrar un ticket sin una persona delante es una autoridad permanente, y lo que la hace segura
 * no es una frase ni una clave de configuración que el agente pueda editar: es **quién puede
 * escribir este registro**. Solo se crea o revoca por un canal que el agente no controla (el CLI
 * de una persona o Mission Control autenticado), nunca por una herramienta MCP, y una sesión
 * desatendida no puede. Es append-only: ampliar es crear otra autorización con su propia frase, y
 * revocar es otro renglón que vale desde ese instante.
 */
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { EXIT_INVARIANT, EXIT_SCHEMA, fail } from "@valmen/core";

import { qaAuthorizationSources } from "./discovery.js";
import { UNATTENDED_ENV } from "./plan-approval.js";

/** Los tipos que una autorización puede cubrir: nunca SECURITY, SYNC, INTEGRATION ni AGENT. */
export const TIPOS_AUTORIZABLES = ["BUGFIX", "IMPROVEMENT", "CHORE", "FEATURE"] as const;

/** El riesgo máximo que una autorización puede cubrir. */
export const RIESGOS_AUTORIZABLES = ["low", "normal"] as const;

export interface QaAuthorization {
  readonly kind: "qa-authorization-created";
  readonly version: 1;
  readonly id: string;
  readonly types: readonly string[];
  readonly modules: readonly string[];
  readonly maxRisk: string;
  readonly dailyQuota: number;
  readonly validFrom: string;
  readonly validUntil: string;
  /** Quién autoriza, con la frase literal con la que lo hizo. */
  readonly actor: string;
  readonly quote: string;
  readonly source: string;
  readonly createdAt: string;
  /** sha256 de los campos de arriba: quien lea el registro detecta una edición a mano. */
  readonly hash: string;
}

export interface QaAuthorizationRevoked {
  readonly kind: "qa-authorization-revoked";
  readonly version: 1;
  readonly id: string;
  readonly actor: string;
  readonly reason: string;
  readonly source: string;
  readonly revokedAt: string;
}

export type EstadoDeAutorizacion = "vigente" | "revocada" | "vencida" | "futura";

export interface AutorizacionConEstado extends QaAuthorization {
  readonly estado: EstadoDeAutorizacion;
  readonly revocacion: QaAuthorizationRevoked | null;
}

export function qaAuthorizationsPath(root: string): string {
  return join(root, ".valmen", "qa", "authorizations.jsonl");
}

/** El hash de una autorización: sobre sus campos en un orden fijo, sin el propio hash. */
export function hashDeAutorizacion(a: Omit<QaAuthorization, "hash">): string {
  const canonico = JSON.stringify([
    a.id, a.types, a.modules, a.maxRisk, a.dailyQuota, a.validFrom, a.validUntil, a.actor, a.quote, a.source, a.createdAt,
  ]);
  return `sha256:${createHash("sha256").update(canonico, "utf8").digest("hex")}`;
}

function leerRegistro(root: string): (QaAuthorization | QaAuthorizationRevoked)[] {
  const ruta = qaAuthorizationsPath(root);
  if (!existsSync(ruta)) return [];
  const entradas: (QaAuthorization | QaAuthorizationRevoked)[] = [];
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    if (linea.trim() === "") continue;
    try {
      const v = JSON.parse(linea) as QaAuthorization | QaAuthorizationRevoked;
      if (v.kind === "qa-authorization-created" || v.kind === "qa-authorization-revoked") entradas.push(v);
    } catch {
      // Un renglón truncado no borra los anteriores: el registro es un diario.
    }
  }
  return entradas;
}

function anexar(root: string, entrada: QaAuthorization | QaAuthorizationRevoked): void {
  const ruta = qaAuthorizationsPath(root);
  mkdirSync(dirname(ruta), { recursive: true });
  appendFileSync(ruta, `${JSON.stringify(entrada)}\n`, "utf8");
}

/** Falla si el canal no es uno aceptado o la sesión es desatendida. */
function exigirCanalHumano(root: string, source: string, accion: string, env: Readonly<Record<string, string | undefined>>): void {
  const marca = env[UNATTENDED_ENV];
  if (marca !== undefined && marca !== "") {
    fail(`Una sesión desatendida no puede ${accion}: esa autoridad es de una persona.`, EXIT_INVARIANT);
  }
  const fuentes = qaAuthorizationSources(root);
  if (!fuentes.includes(source)) {
    fail(
      `La fuente «${source}» no está entre las que el proyecto acepta para ${accion}: ${fuentes.join(", ")}. ` +
        "Se declaran con `qa-authorization-sources` en .valmen/config.yaml.",
      EXIT_INVARIANT,
    );
  }
}

export interface CrearAutorizacionRequest {
  readonly root: string;
  readonly actor: string;
  readonly quote: string;
  readonly types: readonly string[];
  readonly modules: readonly string[];
  readonly maxRisk: string;
  readonly dailyQuota: number;
  readonly validDays: number;
  readonly source: string;
  readonly ahora?: Date;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/** Crea una autorización: anexa un renglón con la frase literal de quien autoriza. */
export function crearAutorizacion(request: CrearAutorizacionRequest): QaAuthorization {
  exigirCanalHumano(request.root, request.source, "crear una autorización de QA", request.env ?? process.env);
  const actor = request.actor.trim();
  const quote = request.quote.trim();
  if (actor === "") fail("Crear una autorización necesita un responsable: falta --actor.", EXIT_SCHEMA);
  if (quote === "") fail("Crear una autorización necesita la frase literal de quien autoriza: falta --quote.", EXIT_SCHEMA);

  const types = [...new Set(request.types.map((t) => t.trim().toUpperCase()).filter((t) => t !== ""))];
  if (types.length === 0) fail("Una autorización declara al menos un tipo de ticket.", EXIT_SCHEMA);
  const prohibidos = types.filter((t) => !(TIPOS_AUTORIZABLES as readonly string[]).includes(t));
  if (prohibidos.length > 0) {
    fail(
      `Los tipos ${prohibidos.join(", ")} no se pueden autorizar: solo ${TIPOS_AUTORIZABLES.join(", ")} ` +
        "(nunca SECURITY, SYNC, INTEGRATION ni AGENT).",
      EXIT_INVARIANT,
    );
  }
  const modules = [...new Set(request.modules.map((m) => m.trim().toLowerCase()).filter((m) => m !== ""))];
  if (modules.length === 0 || modules.includes("*")) {
    fail("Una autorización declara módulos concretos: ni vacía ni con comodín.", EXIT_SCHEMA);
  }
  if (!(RIESGOS_AUTORIZABLES as readonly string[]).includes(request.maxRisk)) {
    fail(`El riesgo máximo autorizable es ${RIESGOS_AUTORIZABLES.join(" o ")}; recibí «${request.maxRisk}».`, EXIT_INVARIANT);
  }
  if (!Number.isSafeInteger(request.dailyQuota) || request.dailyQuota < 1) {
    fail("El cupo diario debe ser un entero de al menos 1.", EXIT_SCHEMA);
  }
  if (!Number.isFinite(request.validDays) || request.validDays < 1 || request.validDays > 365) {
    fail("La vigencia debe ser de 1 a 365 días.", EXIT_SCHEMA);
  }

  const ahora = request.ahora ?? new Date();
  const base = {
    kind: "qa-authorization-created" as const,
    version: 1 as const,
    id: `QAA-${ahora.toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex")}`,
    types,
    modules,
    maxRisk: request.maxRisk,
    dailyQuota: request.dailyQuota,
    validFrom: ahora.toISOString(),
    validUntil: new Date(ahora.getTime() + request.validDays * 86_400_000).toISOString(),
    actor,
    quote,
    source: request.source,
    createdAt: ahora.toISOString(),
  };
  const autorizacion: QaAuthorization = { ...base, hash: hashDeAutorizacion(base) };
  anexar(request.root, autorizacion);
  return autorizacion;
}

export interface RevocarAutorizacionRequest {
  readonly root: string;
  readonly id: string;
  readonly actor: string;
  readonly reason: string;
  readonly source: string;
  readonly ahora?: Date;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/** Revoca una autorización: vale desde este instante. Mismo canal y misma barrera que crearla. */
export function revocarAutorizacion(request: RevocarAutorizacionRequest): QaAuthorizationRevoked {
  exigirCanalHumano(request.root, request.source, "revocar una autorización de QA", request.env ?? process.env);
  if (request.actor.trim() === "") fail("Revocar necesita un responsable: falta --actor.", EXIT_SCHEMA);
  if (request.reason.trim() === "") fail("Revocar necesita un motivo: falta --reason.", EXIT_SCHEMA);
  const existe = leerRegistro(request.root).some((e) => e.kind === "qa-authorization-created" && e.id === request.id);
  if (!existe) fail(`No existe la autorización ${request.id}.`, EXIT_SCHEMA);
  const revocacion: QaAuthorizationRevoked = {
    kind: "qa-authorization-revoked",
    version: 1,
    id: request.id,
    actor: request.actor.trim(),
    reason: request.reason.trim(),
    source: request.source,
    revokedAt: (request.ahora ?? new Date()).toISOString(),
  };
  anexar(request.root, revocacion);
  return revocacion;
}

/** Todas las autorizaciones con su estado a `ahora`; una con el hash roto no se lista como vigente. */
export function leerAutorizaciones(root: string, ahora: Date = new Date()): AutorizacionConEstado[] {
  const registro = leerRegistro(root);
  return registro
    .filter((e): e is QaAuthorization => e.kind === "qa-authorization-created")
    .map((a) => {
      const { hash, ...resto } = a;
      const integra = hashDeAutorizacion(resto) === hash;
      const revocacion =
        registro.find(
          (e): e is QaAuthorizationRevoked =>
            e.kind === "qa-authorization-revoked" && e.id === a.id && new Date(e.revokedAt).getTime() <= ahora.getTime(),
        ) ?? null;
      const estado: EstadoDeAutorizacion =
        !integra || revocacion !== null
          ? "revocada"
          : new Date(a.validUntil).getTime() <= ahora.getTime()
            ? "vencida"
            : new Date(a.validFrom).getTime() > ahora.getTime()
              ? "futura"
              : "vigente";
      return { ...a, estado, revocacion };
    });
}

/** Las autorizaciones vigentes ahora. */
export function autorizacionesVigentes(root: string, ahora: Date = new Date()): AutorizacionConEstado[] {
  return leerAutorizaciones(root, ahora).filter((a) => a.estado === "vigente");
}

const ORDEN_DE_RIESGO = ["low", "normal", "high", "critical"];

/** La autorización vigente que cubre este ticket (tipo, módulo y riesgo), o `null`. */
export function autorizacionQueCubre(
  root: string,
  ticket: { readonly type: string; readonly module: string; readonly riskLevel: string },
  ahora: Date = new Date(),
): AutorizacionConEstado | null {
  return (
    autorizacionesVigentes(root, ahora).find(
      (a) =>
        a.types.includes(ticket.type.toUpperCase()) &&
        a.modules.includes(ticket.module.toLowerCase()) &&
        ORDEN_DE_RIESGO.indexOf(ticket.riskLevel) <= ORDEN_DE_RIESGO.indexOf(a.maxRisk),
    ) ?? null
  );
}
