/**
 * El código firmado de un solo uso para autorizar QA por agente (R-QAAG-001).
 *
 * Es el segundo canal humano, además de Mission Control: una persona emite un código con los
 * términos **congelados** y otra sesión suya lo canjea con su frase. El código vive en su propio
 * registro (`.valmen/qa/links.jsonl`, append-only) y no en el de aprobaciones de planes, para que
 * ningún vigilante de avisos lo trate como una aprobación pendiente. Canjear llama a
 * `crearAutorizacion`: las barreras (canal declarado, sesión atendida, tipos permitidos) son las de
 * siempre y no se duplican aquí.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { EXIT_INVARIANT, EXIT_SCHEMA, fail } from "@valmen/core";

import { mintApproval, normalizarCodigo, verifyApproval } from "./approval.js";
import { type QaAuthorization, crearAutorizacion } from "./qa-authorization.js";

export const SUJETO_AUTORIZACION_QA = "qa-authorization";
export const FUENTE_ENLACE_FIRMADO = "enlace-firmado";
const HORAS_DE_VIGENCIA = 24;

export interface TerminosDeAutorizacion {
  readonly types: readonly string[];
  readonly modules: readonly string[];
  readonly maxRisk: string;
  readonly dailyQuota: number;
  readonly validDays: number;
}

type EntradaDeCodigo =
  | { readonly kind: "qa-link-issued"; readonly code: string; readonly token: string; readonly expiresAt: string; readonly issuedAt: string }
  | { readonly kind: "qa-link-consumed"; readonly code: string; readonly at: string; readonly actor: string; readonly decision: "redeemed" | "revoked" };

export function qaLinksPath(root: string): string {
  return join(root, ".valmen", "qa", "links.jsonl");
}

function leer(root: string): EntradaDeCodigo[] {
  const ruta = qaLinksPath(root);
  if (!existsSync(ruta)) return [];
  const entradas: EntradaDeCodigo[] = [];
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    if (linea.trim() === "") continue;
    try {
      const v = JSON.parse(linea) as EntradaDeCodigo;
      if (v.kind === "qa-link-issued" || v.kind === "qa-link-consumed") entradas.push(v);
    } catch {
      // Un renglón truncado no borra los anteriores.
    }
  }
  return entradas;
}

function anexar(root: string, entrada: EntradaDeCodigo): void {
  const ruta = qaLinksPath(root);
  mkdirSync(dirname(ruta), { recursive: true });
  appendFileSync(ruta, `${JSON.stringify(entrada)}\n`, "utf8");
}

function canonicos(t: TerminosDeAutorizacion): TerminosDeAutorizacion {
  const limpiar = (xs: readonly string[], f: (s: string) => string): string[] =>
    [...new Set(xs.map((x) => f(x.trim())).filter((x) => x !== ""))].sort();
  return {
    types: limpiar(t.types, (s) => s.toUpperCase()),
    modules: limpiar(t.modules, (s) => s.toLowerCase()),
    maxRisk: t.maxRisk,
    dailyQuota: t.dailyQuota,
    validDays: t.validDays,
  };
}

/** El hash de los términos en su forma canónica: cambiar uno cambia el hash. */
export function hashDeTerminos(terminos: TerminosDeAutorizacion): string {
  return createHash("sha256").update(JSON.stringify(canonicos(terminos)), "utf8").digest("hex");
}

export interface CodigoEmitido {
  readonly code: string;
  readonly terminos: TerminosDeAutorizacion;
  readonly expiresAt: string;
}

/** Emite un código de un solo uso que vale 24 horas y lleva los términos firmados. */
export function emitirCodigoDeAutorizacion(request: {
  readonly root: string;
  readonly secret: string;
  readonly terminos: TerminosDeAutorizacion;
  readonly ahora?: Date;
}): CodigoEmitido {
  const terminos = canonicos(request.terminos);
  if (terminos.types.length === 0 || terminos.modules.length === 0) {
    fail("El código necesita al menos un tipo y un módulo.", EXIT_SCHEMA);
  }
  const hash = hashDeTerminos(terminos);
  const emision = mintApproval({
    secret: request.secret,
    gate: SUJETO_AUTORIZACION_QA,
    ticket: "QA-AUTORIZACION",
    receipt: `qa-auth:${JSON.stringify(terminos)}`,
    stateHash: hash,
    revision: "1",
    ceiling: { subjectType: "ticket", riskLevel: "normal", impacts: [] },
    now: request.ahora ?? new Date(),
    ttlHours: HORAS_DE_VIGENCIA,
  });
  if (!emision.ok) fail(emision.refusal, EXIT_INVARIANT);
  anexar(request.root, {
    kind: "qa-link-issued",
    code: emision.issued.code,
    token: emision.issued.token,
    issuedAt: emision.issued.issuedAt,
    expiresAt: emision.issued.expiresAt,
  });
  return { code: emision.issued.code, terminos, expiresAt: emision.issued.expiresAt };
}

function buscar(root: string, codigo: string): { emitido: Extract<EntradaDeCodigo, { kind: "qa-link-issued" }>; usado: Extract<EntradaDeCodigo, { kind: "qa-link-consumed" }> | null } {
  const normal = normalizarCodigo(codigo);
  const entradas = leer(root);
  const emitido = [...entradas].reverse().find((e): e is Extract<EntradaDeCodigo, { kind: "qa-link-issued" }> => e.kind === "qa-link-issued" && normalizarCodigo(e.code) === normal);
  if (emitido === undefined) fail("Ese código no corresponde a ninguna autorización emitida para este proyecto.", EXIT_INVARIANT);
  const usado = entradas.find((e): e is Extract<EntradaDeCodigo, { kind: "qa-link-consumed" }> => e.kind === "qa-link-consumed" && normalizarCodigo(e.code) === normal) ?? null;
  return { emitido, usado };
}

/**
 * Canjea un código: crea la autorización con los términos firmados y la frase de quien canjea.
 * El código se consume **después** de crearla; si la creación falla, queda sin usar.
 */
export function canjearCodigoDeAutorizacion(request: {
  readonly root: string;
  readonly secret: string;
  readonly codigo: string;
  readonly actor: string;
  readonly quote: string;
  readonly ahora?: Date;
  readonly env?: Readonly<Record<string, string | undefined>>;
}): QaAuthorization {
  const ahora = request.ahora ?? new Date();
  const { emitido, usado } = buscar(request.root, request.codigo);
  if (usado !== null) {
    fail(usado.decision === "revoked" ? `El código ${emitido.code} fue revocado.` : `El código ${emitido.code} ya se usó.`, EXIT_INVARIANT);
  }
  const verificado = verifyApproval(request.secret, emitido.token, ahora);
  if (!verificado.ok) fail(`El código ${emitido.code} no sirve: ${verificado.detail}.`, EXIT_INVARIANT);
  const claims = verificado.claims;
  if (claims.gate !== SUJETO_AUTORIZACION_QA) {
    fail(`El código ${emitido.code} no es de una autorización de QA (es de ${claims.gate}).`, EXIT_INVARIANT);
  }
  let terminos: TerminosDeAutorizacion;
  try {
    terminos = JSON.parse(claims.receipt.replace(/^qa-auth:/, "")) as TerminosDeAutorizacion;
  } catch {
    fail(`El código ${emitido.code} no trae términos legibles.`, EXIT_INVARIANT);
  }
  if (hashDeTerminos(terminos) !== claims.stateHash) {
    fail(`Los términos del código ${emitido.code} no corresponden a su firma.`, EXIT_INVARIANT);
  }
  const autorizacion = crearAutorizacion({
    root: request.root,
    actor: request.actor,
    quote: request.quote,
    types: terminos.types,
    modules: terminos.modules,
    maxRisk: terminos.maxRisk,
    dailyQuota: terminos.dailyQuota,
    validDays: terminos.validDays,
    source: FUENTE_ENLACE_FIRMADO,
    ahora,
    ...(request.env === undefined ? {} : { env: request.env }),
  });
  anexar(request.root, { kind: "qa-link-consumed", code: emitido.code, at: ahora.toISOString(), actor: request.actor.trim(), decision: "redeemed" });
  return autorizacion;
}

/** Revoca un código emitido y no canjeado: deja de servir desde ese momento. */
export function revocarCodigoDeAutorizacion(request: {
  readonly root: string;
  readonly codigo: string;
  readonly actor: string;
  readonly ahora?: Date;
  readonly env?: Readonly<Record<string, string | undefined>>;
}): void {
  if ((request.env ?? process.env)["VALMEN_UNATTENDED"] === "1") {
    fail("Una sesión desatendida no puede revocar un código de autorización de QA: esa autoridad es de una persona.", EXIT_INVARIANT);
  }
  if (request.actor.trim() === "") fail("Revocar un código necesita un responsable: falta --actor.", EXIT_SCHEMA);
  const { emitido, usado } = buscar(request.root, request.codigo);
  if (usado !== null) fail(`El código ${emitido.code} ya no está pendiente.`, EXIT_INVARIANT);
  anexar(request.root, { kind: "qa-link-consumed", code: emitido.code, at: (request.ahora ?? new Date()).toISOString(), actor: request.actor.trim(), decision: "revoked" });
}
