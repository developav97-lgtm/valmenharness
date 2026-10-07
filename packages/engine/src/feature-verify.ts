/**
 * El cierre de una feature: su `verify.md` y el paso a `complete`.
 *
 * Una feature se completa cuando todos los tickets de su grafo están cerrados y
 * queda escrita la evidencia de cómo. Hasta ahora no había comando para ninguna
 * de las dos cosas: se llamaba a `advanceFeature` con un script, y el `verify.md`
 * no lo escribía nadie.
 *
 * `verify.md` se arma **desde el registro**, no desde la memoria de quien cierra:
 * cada fila sale del ticket (estado, QA, cierre, evidencia). Es lo que permite
 * auditar la feature meses después sin reconstruir qué pasó.
 *
 * Los criterios que solo puede verificar una persona no se esconden: un ticket que
 * espera al PO cuenta como pendiente suyo, y la feature solo se completa con él
 * si se pide expresamente (`allowPendingPo`).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EXIT_HISTORY,
  EXIT_INVARIANT,
  assertWriteAllowed,
  atomicWrite,
  fail,
  parseTicket,
  today,
} from "@valmen/core";
import { extractCriteriaSpecs } from "@valmen/gate";

import { ticketPathFor } from "./create.js";
import { type RegistryPaths } from "./discovery.js";
import { advanceFeature, featuresDir, readFeature } from "./features.js";
import { readDecomposition } from "./materialize.js";

/** Un ticket del grafo, tal como está hoy en el registro. */
export interface FeatureTicketStatus {
  readonly id: string;
  readonly title: string;
  /** `null` si el ticket del grafo todavía no existe en el registro. */
  readonly state: string | null;
  readonly qaStatus: string | null;
  readonly closure: { readonly technical: string; readonly functional: string } | null;
  readonly evidence: readonly string[];
  /** Criterios `verify: manual` que siguen sin marcarse: son del PO. */
  readonly pendingPo: readonly string[];
}

/** La ruta del `verify.md` de una feature. */
export function verifyPath(root: string, slug: string): string {
  return join(featuresDir(root), slug, "verify.md");
}

/** El estado de cada ticket del grafo, en el orden del plan. */
export function featureTicketStatuses(
  paths: RegistryPaths,
  slug: string,
): FeatureTicketStatus[] {
  const { tickets } = readDecomposition(paths, slug);
  return tickets.map((entrada) => {
    const ruta = ticketPathFor(paths, entrada.id);
    if (!existsSync(ruta)) {
      return {
        id: entrada.id,
        title: entrada.title,
        state: null,
        qaStatus: null,
        closure: null,
        evidence: [],
        pendingPo: [],
      };
    }
    const ticket = parseTicket(readFileSync(ruta, "utf8"));
    const cierres = ticket.blocks.Cierre;
    const cierre = cierres[cierres.length - 1];
    const evidencia = ticket.blocks.Evidencia.map(
      (e) => `${String(e["kind"])}: ${String(e["description"])}`,
    );
    const seccion = ticket.sections["Criterios de aceptación"];
    // Un criterio manual se reconoce por su anotación; si ya está marcado `[x]`
    // alguien lo verificó, y no es pendiente de nadie.
    const casillas = seccion.split("\n").filter((l) => /^\s*-\s+\[ \]/.test(l));
    const manuales = extractCriteriaSpecs(seccion)
      .filter((c) => c.manual)
      .map((c) => c.text)
      .filter((texto) => casillas.some((l) => l.includes(texto.slice(0, 40))));
    return {
      id: entrada.id,
      title: entrada.title,
      state: ticket.fields.workflow_status,
      qaStatus: ticket.fields.qa_status,
      closure:
        cierre === undefined
          ? null
          : {
              technical: String(cierre["technical_summary"]),
              functional: String(cierre["functional_summary"]),
            },
      evidence: evidencia,
      pendingPo: manuales,
    };
  });
}

/** `true` si el ticket ya no necesita trabajo de nadie más que de quien lo publique. */
function estaCerrado(estado: FeatureTicketStatus): boolean {
  return estado.state === "closed";
}

/** Lo que bloquea completar la feature, o `[]` si se puede. */
export function blockersToComplete(
  estados: readonly FeatureTicketStatus[],
  allowPendingPo: boolean,
): string[] {
  const razones: string[] = [];
  for (const e of estados) {
    if (estaCerrado(e)) continue;
    if (allowPendingPo && e.state === "awaiting_user_tests") continue;
    razones.push(`${e.id} está en ${e.state ?? "(no existe en el registro)"}`);
  }
  return razones;
}

function linea(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/** El texto de `verify.md`. */
export function renderFeatureVerify(
  slug: string,
  title: string,
  estados: readonly FeatureTicketStatus[],
  fecha: string,
): string {
  const cerrados = estados.filter(estaCerrado).length;
  const pendientes = estados.filter((e) => !estaCerrado(e));
  const partes = [
    `# Verificación — ${title}`,
    "",
    `Feature: \`${slug}\` · generado el ${fecha} desde el registro de tickets.`,
    "",
    `Tickets del grafo: ${estados.length} · cerrados: ${cerrados} · pendientes: ${pendientes.length}.`,
    "",
    "## Tickets",
    "",
  ];
  for (const e of estados) {
    partes.push(
      `### ${e.id} — ${e.title}`,
      "",
      `- Estado: ${e.state ?? "no existe en el registro"} · QA: ${e.qaStatus ?? "—"}`,
    );
    if (e.closure !== null) {
      partes.push(`- Cierre técnico: ${linea(e.closure.technical)}`);
      partes.push(`- Cierre funcional: ${linea(e.closure.functional)}`);
    }
    if (e.evidence.length > 0) {
      partes.push("- Evidencia:", ...e.evidence.map((x) => `  - ${linea(x)}`));
    }
    partes.push("");
  }
  partes.push("## Pendiente del PO", "");
  const delPo = estados.filter((e) => !estaCerrado(e) || e.pendingPo.length > 0);
  if (delPo.length === 0) {
    partes.push("Nada: todos los tickets están cerrados.", "");
  } else {
    for (const e of delPo) {
      if (!estaCerrado(e)) partes.push(`- ${e.id}: en ${e.state ?? "?"}; espera su validación.`);
      for (const criterio of e.pendingPo) partes.push(`  - criterio manual: ${linea(criterio)}`);
    }
    partes.push("");
  }
  return partes.join("\n");
}

export interface WriteFeatureVerifyRequest {
  readonly paths: RegistryPaths;
  readonly slug: string;
  readonly rewrite?: boolean;
  readonly now?: (() => Date) | undefined;
}

/** Escribe `verify.md`. No pisa uno existente salvo que se pida. */
export function writeFeatureVerify(request: WriteFeatureVerifyRequest): string {
  assertWriteAllowed("escribir el verify.md de una feature");
  const { paths, slug } = request;
  const leida = readFeature(paths.root, slug);
  if (leida === null) fail(`No existe la feature "${slug}" en .valmen/features/.`);
  if (leida.row.invalid !== null) fail(`La feature "${slug}" no es válida: ${leida.row.invalid}`);

  const ruta = verifyPath(paths.root, slug);
  if (existsSync(ruta) && request.rewrite !== true) {
    fail(
      `La feature ${slug} ya tiene verify.md y no se pisa. Con --rewrite se regenera desde el registro.`,
      EXIT_HISTORY,
    );
  }
  const texto = renderFeatureVerify(
    slug,
    leida.row.title,
    featureTicketStatuses(paths, slug),
    today(request.now?.() ?? new Date()),
  );
  atomicWrite(ruta, texto);
  return ruta;
}

export interface CompleteFeatureRequest {
  readonly paths: RegistryPaths;
  readonly slug: string;
  readonly allowPendingPo?: boolean;
  readonly now?: (() => Date) | undefined;
}

/**
 * Avanza la feature a `complete`.
 *
 * Exige `verify.md` y todos los tickets del grafo cerrados. Con `allowPendingPo`
 * acepta los que esperan al PO en `awaiting_user_tests`: es una declaración
 * expresa, y `verify.md` los lista como pendientes suyos.
 */
export function completeFeature(request: CompleteFeatureRequest): ReturnType<typeof advanceFeature> {
  const { paths, slug } = request;
  if (!existsSync(verifyPath(paths.root, slug))) {
    fail(
      `La feature ${slug} no tiene verify.md: escribilo con «valmen feature verify ${slug}» antes de completarla.`,
      EXIT_INVARIANT,
    );
  }
  const razones = blockersToComplete(
    featureTicketStatuses(paths, slug),
    request.allowPendingPo === true,
  );
  if (razones.length > 0) {
    fail(
      `La feature ${slug} no se puede completar:\n` +
        razones.map((r) => `  · ${r}`).join("\n") +
        (request.allowPendingPo === true
          ? ""
          : "\nSi lo que falta son pruebas del PO, --pendientes-del-po las acepta y las deja anotadas."),
      EXIT_INVARIANT,
    );
  }
  return advanceFeature({
    root: paths.root,
    slug,
    to: "complete",
    ...(request.now === undefined ? {} : { now: request.now }),
  });
}
