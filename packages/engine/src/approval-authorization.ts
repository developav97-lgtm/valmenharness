/**
 * La autorización persistida de aprobación automática (R-APRO-001).
 *
 * Delegar la aprobación de un plan en el código es una autoridad permanente, y lo que la hace
 * segura no es una frase ni una clave que el agente pueda editar: es **quién puede escribir este
 * registro**. Solo se crea o revoca por un canal que el agente no controla (el CLI de una persona o
 * Mission Control autenticado), nunca por una herramienta MCP, y una sesión desatendida no puede.
 * Es append-only: ampliar es crear otra autorización con su propia frase, y revocar es otro renglón
 * que vale desde ese instante.
 *
 * Tiene su propio registro, separado del de QA por agente: una autorización de QA nunca se lee como
 * una de aprobación ni al revés. Este módulo solo guarda y consulta; aplicarla a un ticket es de los
 * módulos que la consumen.
 */
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { EXIT_INVARIANT, EXIT_SCHEMA, fail } from "@valmen/core";

import { approvalAuthorizationSources } from "./discovery.js";
import { UNATTENDED_ENV } from "./plan-approval.js";

/** Los tipos que una autorización de aprobación puede cubrir: nunca SECURITY. */
export const TIPOS_APROBABLES = ["BUGFIX", "IMPROVEMENT", "CHORE", "FEATURE", "SYNC", "INTEGRATION", "AGENT"] as const;

/** El riesgo máximo que una autorización puede cubrir. */
export const RIESGOS_APROBABLES = ["low", "normal"] as const;

/** Los impactos que un ticket puede declarar y que solo se admiten si la autorización los lista. */
export const IMPACTOS_ADMISIBLES = ["sync_impact", "migration_impact", "docker_impact"] as const;

/** Las etapas cuya compuerta una autorización puede cubrir. */
export const ETAPAS_APROBABLES = ["analysis", "plan"] as const;

/** Cómo se decide un `review`: solo con `approve` vigente, o con un agente revisor. */
export const MODOS_DE_APROBACION = ["on-approve", "reviewer"] as const;

export interface ApprovalAuthorization {
  readonly kind: "approval-authorization-created";
  readonly version: 1;
  readonly id: string;
  readonly types: readonly string[];
  readonly modules: readonly string[];
  readonly maxRisk: string;
  /** Impactos que el ticket puede declarar y aun así aprobarse; vacío = ninguno. */
  readonly impacts: readonly string[];
  readonly stages: readonly string[];
  readonly mode: string;
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

export interface ApprovalAuthorizationRevoked {
  readonly kind: "approval-authorization-revoked";
  readonly version: 1;
  readonly id: string;
  readonly actor: string;
  readonly reason: string;
  readonly source: string;
  readonly revokedAt: string;
}

export type EstadoDeAutorizacionDeAprobacion = "vigente" | "revocada" | "vencida" | "futura";

export interface AutorizacionDeAprobacionConEstado extends ApprovalAuthorization {
  readonly estado: EstadoDeAutorizacionDeAprobacion;
  readonly revocacion: ApprovalAuthorizationRevoked | null;
}

type Entrada = ApprovalAuthorization | ApprovalAuthorizationRevoked;

export function approvalAuthorizationsPath(root: string): string {
  return join(root, ".valmen", "approval", "authorizations.jsonl");
}

export function approvalQuotaUsesPath(root: string): string {
  return join(root, ".valmen", "approval", "uses.jsonl");
}

/** El hash de una autorización: sobre sus campos en un orden fijo, sin el propio hash. */
export function hashDeAutorizacionDeAprobacion(a: Omit<ApprovalAuthorization, "hash">): string {
  const canonico = JSON.stringify([
    a.id, a.types, a.modules, a.maxRisk, a.impacts, a.stages, a.mode, a.dailyQuota, a.validFrom, a.validUntil, a.actor, a.quote, a.source, a.createdAt,
  ]);
  return `sha256:${createHash("sha256").update(canonico, "utf8").digest("hex")}`;
}

function leerRegistro(root: string): Entrada[] {
  const ruta = approvalAuthorizationsPath(root);
  if (!existsSync(ruta)) return [];
  const entradas: Entrada[] = [];
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    if (linea.trim() === "") continue;
    try {
      const v = JSON.parse(linea) as Entrada;
      if (v.kind === "approval-authorization-created" || v.kind === "approval-authorization-revoked") entradas.push(v);
    } catch {
      // Un renglón truncado no borra los anteriores: el registro es un diario.
    }
  }
  return entradas;
}

function anexar(root: string, entrada: Entrada): void {
  const ruta = approvalAuthorizationsPath(root);
  mkdirSync(dirname(ruta), { recursive: true });
  appendFileSync(ruta, `${JSON.stringify(entrada)}\n`, "utf8");
}

/** Falla si el canal no es uno aceptado o la sesión es desatendida. */
function exigirCanalHumano(root: string, source: string, accion: string, env: Readonly<Record<string, string | undefined>>): void {
  const marca = env[UNATTENDED_ENV];
  if (marca !== undefined && marca !== "") {
    fail(`Una sesión desatendida no puede ${accion}: esa autoridad es de una persona.`, EXIT_INVARIANT);
  }
  const fuentes = approvalAuthorizationSources(root);
  if (!fuentes.includes(source)) {
    fail(
      `La fuente «${source}» no está entre las que el proyecto acepta para ${accion}: ${fuentes.join(", ")}. ` +
        "Se declaran con `approval-authorization-sources` en .valmen/config.yaml.",
      EXIT_INVARIANT,
    );
  }
}

export interface CrearAutorizacionDeAprobacionRequest {
  readonly root: string;
  readonly actor: string;
  readonly quote: string;
  readonly types: readonly string[];
  readonly modules: readonly string[];
  readonly maxRisk: string;
  readonly impacts?: readonly string[];
  readonly stages?: readonly string[];
  readonly mode?: string;
  readonly dailyQuota: number;
  readonly validDays: number;
  readonly source: string;
  readonly ahora?: Date;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/** Crea una autorización: anexa un renglón con la frase literal de quien autoriza. */
export function crearAutorizacionDeAprobacion(request: CrearAutorizacionDeAprobacionRequest): ApprovalAuthorization {
  exigirCanalHumano(request.root, request.source, "crear una autorización de aprobación", request.env ?? process.env);
  const actor = request.actor.trim();
  const quote = request.quote.trim();
  if (actor === "") fail("Crear una autorización necesita un responsable: falta --actor.", EXIT_SCHEMA);
  if (quote === "") fail("Crear una autorización necesita la frase literal de quien autoriza: falta --quote.", EXIT_SCHEMA);

  const types = [...new Set(request.types.map((t) => t.trim().toUpperCase()).filter((t) => t !== ""))];
  if (types.length === 0) fail("Una autorización declara al menos un tipo de ticket.", EXIT_SCHEMA);
  const prohibidos = types.filter((t) => !(TIPOS_APROBABLES as readonly string[]).includes(t));
  if (prohibidos.length > 0) {
    fail(
      `Los tipos ${prohibidos.join(", ")} no se pueden autorizar: solo ${TIPOS_APROBABLES.join(", ")} (nunca SECURITY).`,
      EXIT_INVARIANT,
    );
  }
  const modules = [...new Set(request.modules.map((m) => m.trim().toLowerCase()).filter((m) => m !== ""))];
  if (modules.length === 0 || modules.includes("*")) {
    fail("Una autorización declara módulos concretos: ni vacía ni con comodín.", EXIT_SCHEMA);
  }
  if (!(RIESGOS_APROBABLES as readonly string[]).includes(request.maxRisk)) {
    fail(`El riesgo máximo autorizable es ${RIESGOS_APROBABLES.join(" o ")}; recibí «${request.maxRisk}».`, EXIT_INVARIANT);
  }
  const impacts = [...new Set((request.impacts ?? []).map((i) => i.trim()).filter((i) => i !== ""))];
  const impactosInvalidos = impacts.filter((i) => !(IMPACTOS_ADMISIBLES as readonly string[]).includes(i));
  if (impactosInvalidos.length > 0) {
    fail(`Los impactos ${impactosInvalidos.join(", ")} no existen: solo ${IMPACTOS_ADMISIBLES.join(", ")}.`, EXIT_SCHEMA);
  }
  const stages = [...new Set((request.stages ?? ["analysis", "plan"]).map((e) => e.trim()).filter((e) => e !== ""))];
  if (stages.length === 0 || !stages.every((e) => (ETAPAS_APROBABLES as readonly string[]).includes(e))) {
    fail(`Las etapas son ${ETAPAS_APROBABLES.join(" y/o ")}.`, EXIT_SCHEMA);
  }
  const mode = request.mode ?? "on-approve";
  if (!(MODOS_DE_APROBACION as readonly string[]).includes(mode)) {
    fail(`El modo es ${MODOS_DE_APROBACION.join(" o ")}; recibí «${mode}».`, EXIT_SCHEMA);
  }
  if (!Number.isSafeInteger(request.dailyQuota) || request.dailyQuota < 1) {
    fail("El cupo diario debe ser un entero de al menos 1.", EXIT_SCHEMA);
  }
  if (!Number.isFinite(request.validDays) || request.validDays < 1 || request.validDays > 365) {
    fail("La vigencia debe ser de 1 a 365 días.", EXIT_SCHEMA);
  }

  const ahora = request.ahora ?? new Date();
  const base = {
    kind: "approval-authorization-created" as const,
    version: 1 as const,
    id: `APA-${ahora.toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex")}`,
    types,
    modules,
    maxRisk: request.maxRisk,
    impacts,
    stages,
    mode,
    dailyQuota: request.dailyQuota,
    validFrom: ahora.toISOString(),
    validUntil: new Date(ahora.getTime() + request.validDays * 86_400_000).toISOString(),
    actor,
    quote,
    source: request.source,
    createdAt: ahora.toISOString(),
  };
  const autorizacion: ApprovalAuthorization = { ...base, hash: hashDeAutorizacionDeAprobacion(base) };
  anexar(request.root, autorizacion);
  return autorizacion;
}

export interface RevocarAutorizacionDeAprobacionRequest {
  readonly root: string;
  readonly id: string;
  readonly actor: string;
  readonly reason: string;
  readonly source: string;
  readonly ahora?: Date;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/** Revoca una autorización: vale desde este instante. Mismo canal y misma barrera que crearla. */
export function revocarAutorizacionDeAprobacion(request: RevocarAutorizacionDeAprobacionRequest): ApprovalAuthorizationRevoked {
  exigirCanalHumano(request.root, request.source, "revocar una autorización de aprobación", request.env ?? process.env);
  if (request.actor.trim() === "") fail("Revocar necesita un responsable: falta --actor.", EXIT_SCHEMA);
  if (request.reason.trim() === "") fail("Revocar necesita un motivo: falta --reason.", EXIT_SCHEMA);
  const existe = leerRegistro(request.root).some((e) => e.kind === "approval-authorization-created" && e.id === request.id);
  if (!existe) fail(`No existe la autorización ${request.id}.`, EXIT_SCHEMA);
  const revocacion: ApprovalAuthorizationRevoked = {
    kind: "approval-authorization-revoked",
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
export function leerAutorizacionesDeAprobacion(root: string, ahora: Date = new Date()): AutorizacionDeAprobacionConEstado[] {
  const registro = leerRegistro(root);
  return registro
    .filter((e): e is ApprovalAuthorization => e.kind === "approval-authorization-created")
    .map((a) => {
      const { hash, ...resto } = a;
      const integra = hashDeAutorizacionDeAprobacion(resto) === hash;
      const revocacion =
        registro.find(
          (e): e is ApprovalAuthorizationRevoked =>
            e.kind === "approval-authorization-revoked" && e.id === a.id && new Date(e.revokedAt).getTime() <= ahora.getTime(),
        ) ?? null;
      const estado: EstadoDeAutorizacionDeAprobacion =
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
export function autorizacionesDeAprobacionVigentes(root: string, ahora: Date = new Date()): AutorizacionDeAprobacionConEstado[] {
  return leerAutorizacionesDeAprobacion(root, ahora).filter((a) => a.estado === "vigente");
}

const ORDEN_DE_RIESGO = ["low", "normal", "high", "critical"];

/**
 * La autorización vigente que cubre este ticket (tipo, módulo, riesgo, impactos y etapa), o `null`.
 * Solo consulta: aplicarla a un ticket es de quien la consume.
 */
export function autorizacionDeAprobacionQueCubre(
  root: string,
  ticket: {
    readonly type: string;
    readonly module: string;
    readonly riskLevel: string;
    readonly impacts?: readonly string[];
    readonly stage?: string;
  },
  ahora: Date = new Date(),
): AutorizacionDeAprobacionConEstado | null {
  return (
    autorizacionesDeAprobacionVigentes(root, ahora).find(
      (a) =>
        a.types.includes(ticket.type.toUpperCase()) &&
        a.modules.includes(ticket.module.toLowerCase()) &&
        ORDEN_DE_RIESGO.indexOf(ticket.riskLevel) <= ORDEN_DE_RIESGO.indexOf(a.maxRisk) &&
        (ticket.impacts ?? []).every((i) => a.impacts.includes(i)) &&
        (ticket.stage === undefined || a.stages.includes(ticket.stage)),
    ) ?? null
  );
}

// ── El cupo diario ───────────────────────────────────────────────────────────

export interface UsoDeCupoDeAprobacion {
  readonly kind: "approval-quota-use";
  readonly authorizationId: string;
  readonly ticketId: string;
  readonly stage: string;
  readonly usedAt: string;
}

function leerUsos(root: string): UsoDeCupoDeAprobacion[] {
  const ruta = approvalQuotaUsesPath(root);
  if (!existsSync(ruta)) return [];
  const usos: UsoDeCupoDeAprobacion[] = [];
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    if (linea.trim() === "") continue;
    try {
      const v = JSON.parse(linea) as UsoDeCupoDeAprobacion;
      if (v.kind === "approval-quota-use") usos.push(v);
    } catch {
      // Un renglón truncado no borra los anteriores.
    }
  }
  return usos;
}

/** Anota que una aprobación usó un cupo de la autorización. */
export function registrarUsoDeCupoDeAprobacion(request: {
  readonly root: string;
  readonly authorizationId: string;
  readonly ticketId: string;
  readonly stage: string;
  readonly ahora?: Date;
}): UsoDeCupoDeAprobacion {
  const uso: UsoDeCupoDeAprobacion = {
    kind: "approval-quota-use",
    authorizationId: request.authorizationId,
    ticketId: request.ticketId,
    stage: request.stage,
    usedAt: (request.ahora ?? new Date()).toISOString(),
  };
  const ruta = approvalQuotaUsesPath(request.root);
  mkdirSync(dirname(ruta), { recursive: true });
  appendFileSync(ruta, `${JSON.stringify(uso)}\n`, "utf8");
  return uso;
}

/** Cuántas aprobaciones le quedan hoy (UTC) a la autorización. */
export function cupoRestanteDeAprobacion(root: string, autorizacion: ApprovalAuthorization, ahora: Date = new Date()): number {
  const dia = ahora.toISOString().slice(0, 10);
  const usados = leerUsos(root).filter((u) => u.authorizationId === autorizacion.id && u.usedAt.startsWith(dia)).length;
  return Math.max(0, autorizacion.dailyQuota - usados);
}
