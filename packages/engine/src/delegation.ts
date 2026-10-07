/**
 * Delegación del PO: el registro y las reglas que no dependen de un modelo.
 *
 * Una persona puede pedir, en un solo mensaje, que una feature completa o una
 * lista de tickets se trabajen uno tras otro: el agente revisa las compuertas y las
 * aprueba él mismo, ejecuta las pruebas de consola o Docker y, si dan lo esperado,
 * aprueba el QA y cierra. Eso es una **delegación**, y este módulo guarda lo que la
 * hace auditable:
 *
 * - **Las palabras del PO, literales**, con la fecha y el alcance. Cada decisión que
 *   el agente toma en su nombre las cita: la aprobación queda atribuida a la
 *   política humana y nunca al modelo.
 * - **El alcance**: una feature o una lista de tickets. Fuera de él, nada.
 * - **Las paradas duras**: un BLOCK, o un ticket con impactos de sincronización,
 *   migración, contenedores o riesgo crítico, siguen siendo del PO aunque la
 *   compuerta diera REVIEW. Una delegación no amplía la autoridad del agente sobre
 *   lo que protege datos y clientes.
 *
 * Se llama «delegación» y no «autónomo» porque `autonomous-run.ts` ya es otra
 * cosa: un ejecutor externo que escribe el código. Esto corre dentro de la sesión
 * del agente, que escribe y decide; el harness lleva la cuenta.
 *
 * El archivo de una delegación solo recibe líneas: `grant` abre y los eventos
 * siguientes cuentan lo que pasó, igual que los recibos de compuertas.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";

import {
  EXIT_INVARIANT,
  EXIT_SCHEMA,
  assertWriteAllowed,
  fail,
  impactIdsInFields,
  parseTicket,
  today,
} from "@valmen/core";

import { ticketPathFor } from "./create.js";
import { type RegistryPaths } from "./discovery.js";
import { readDecomposition } from "./materialize.js";

/** El alcance de una delegación: una feature o una lista de tickets. */
export interface DelegationScope {
  readonly feature: string | null;
  readonly tickets: readonly string[];
}

export interface Delegation {
  readonly id: string;
  readonly at: string;
  readonly actor: string;
  /** Las palabras del PO, tal como las dijo. */
  readonly quote: string;
  readonly scope: DelegationScope;
}

/** Un hecho posterior al `grant`: una decisión, una parada o un cierre. */
export interface DelegationEvent {
  readonly kind: "decision" | "stop" | "close" | "note";
  readonly ticketId: string;
  readonly at: string;
  readonly detail: string;
}

/** Dónde viven las delegaciones, relativo a la raíz del proyecto. */
export function delegationsDir(root: string): string {
  return join(root, ".valmen", "delegations");
}

function delegationPath(root: string, id: string): string {
  return join(delegationsDir(root), `${id}.jsonl`);
}

export interface GrantDelegationRequest {
  readonly paths: RegistryPaths;
  readonly feature?: string | undefined;
  readonly tickets?: readonly string[] | undefined;
  readonly quote: string;
  readonly actor?: string | undefined;
  readonly now?: (() => Date) | undefined;
}

/**
 * Registra una delegación.
 *
 * Sin las palabras del PO no hay delegación: un permiso que nadie dijo no se puede
 * citar. El alcance se comprueba contra el registro antes de escribir, porque una
 * delegación sobre una feature que no existe habilitaría a ciegas.
 */
export function grantDelegation(request: GrantDelegationRequest): Delegation {
  assertWriteAllowed("registrar una delegación");
  const { paths } = request;
  const quote = request.quote.trim();
  if (quote === "") {
    fail(
      "Una delegación necesita las palabras del PO (--quote): sin ellas no se puede citar " +
        "quién autorizó qué.",
      EXIT_SCHEMA,
    );
  }
  const feature = request.feature?.trim() ?? "";
  const tickets = (request.tickets ?? []).map((id) => id.trim()).filter((id) => id !== "");
  if ((feature === "") === (tickets.length === 0)) {
    fail("Una delegación lleva --feature <slug> o --tickets A,B, una de las dos.", EXIT_SCHEMA);
  }

  if (feature !== "") {
    // Lee el grafo: falla con el motivo si la feature no existe o está a medias.
    readDecomposition(paths, feature);
  } else {
    for (const id of tickets) {
      if (!existsSync(ticketPathFor(paths, id))) {
        fail(`El ticket ${id} no existe en el registro: no se puede delegar.`, EXIT_SCHEMA);
      }
    }
  }

  const fecha = today(request.now?.() ?? new Date());
  const compacta = fecha.replaceAll("-", "");
  mkdirSync(delegationsDir(paths.root), { recursive: true });
  const previas = readdirSync(delegationsDir(paths.root)).filter((n) =>
    n.startsWith(`DEL-${compacta}-`),
  ).length;
  const id = `DEL-${compacta}-${String(previas + 1).padStart(3, "0")}`;

  const delegation: Delegation = {
    id,
    at: (request.now?.() ?? new Date()).toISOString(),
    actor: request.actor?.trim() || "PO",
    quote,
    scope: { feature: feature === "" ? null : feature, tickets },
  };
  appendFileSync(
    delegationPath(paths.root, id),
    `${JSON.stringify({ kind: "grant", ...delegation })}\n`,
    "utf8",
  );
  return delegation;
}

/** Las líneas de una delegación, o `null` si no existe. */
function lines(root: string, id: string): Record<string, unknown>[] | null {
  const ruta = delegationPath(root, id);
  if (!existsSync(ruta)) return null;
  return readFileSync(ruta, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

/** Lee una delegación por su identificador. */
export function readDelegation(root: string, id: string): Delegation | null {
  const todas = lines(root, id);
  const grant = todas?.[0];
  if (grant === undefined || grant["kind"] !== "grant") return null;
  const scope = grant["scope"] as { feature: string | null; tickets: string[] };
  return {
    id: String(grant["id"]),
    at: String(grant["at"]),
    actor: String(grant["actor"]),
    quote: String(grant["quote"]),
    scope: { feature: scope.feature, tickets: scope.tickets },
  };
}

/** La delegación a usar: la pedida o, sin pedir, la más reciente. */
export function resolveDelegation(root: string, id: string | undefined): Delegation {
  if (id !== undefined) {
    const encontrada = readDelegation(root, id);
    if (encontrada === null) fail(`No existe la delegación ${id} en .valmen/delegations/.`, EXIT_SCHEMA);
    return encontrada;
  }
  const dir = delegationsDir(root);
  const archivos = existsSync(dir)
    ? readdirSync(dir)
        .filter((n) => n.endsWith(".jsonl"))
        .sort()
    : [];
  const ultimo = archivos[archivos.length - 1];
  if (ultimo === undefined) {
    fail(
      "No hay ninguna delegación. La registra el PO con «valmen delegation grant --feature <slug> " +
        '--quote "<sus palabras>"».',
      EXIT_SCHEMA,
    );
  }
  const encontrada = readDelegation(root, ultimo.replace(/\.jsonl$/, ""));
  if (encontrada === null) fail(`La delegación ${ultimo} no se puede leer.`, EXIT_INVARIANT);
  return encontrada;
}

/** Los eventos de una delegación, sin el `grant`. */
export function delegationEvents(root: string, id: string): DelegationEvent[] {
  return (lines(root, id) ?? [])
    .slice(1)
    .map((l) => l as unknown as DelegationEvent);
}

/** Anexa un hecho a la delegación. */
export function appendDelegationEvent(
  root: string,
  id: string,
  event: Omit<DelegationEvent, "at"> & { readonly at?: string },
): void {
  appendFileSync(
    delegationPath(root, id),
    `${JSON.stringify({ ...event, at: event.at ?? new Date().toISOString() })}\n`,
    "utf8",
  );
}

/** Los tickets del alcance, en el orden en que hay que trabajarlos. */
export function delegatedTickets(
  paths: RegistryPaths,
  delegation: Delegation,
): { id: string; dependsOn: readonly string[] }[] {
  if (delegation.scope.feature === null) {
    return delegation.scope.tickets.map((id) => ({ id, dependsOn: [] }));
  }
  return ordenDelGrafo(paths, delegation.scope.feature);
}

/**
 * Los tickets del grafo de una feature, ordenados por dependencias.
 *
 * El grafo ya viene en el orden de los sprints; se ordena por dependencias para que un
 * ticket nunca salga antes de uno del que depende, aunque el plan lo haya declarado así.
 */
export function ordenDelGrafo(
  paths: RegistryPaths,
  feature: string,
): { id: string; dependsOn: readonly string[] }[] {
  const { tickets } = readDecomposition(paths, feature);
  const pendientes = tickets.map((t) => ({ id: t.id, dependsOn: [...t.dependsOn] }));
  const ordenados: { id: string; dependsOn: readonly string[] }[] = [];
  const puestos = new Set<string>();
  const enGrafo = new Set(pendientes.map((t) => t.id));
  while (pendientes.length > 0) {
    const i = pendientes.findIndex((t) =>
      t.dependsOn.every((d) => puestos.has(d) || !enGrafo.has(d)),
    );
    if (i === -1) {
      fail(
        `El grafo de ${feature} tiene dependencias circulares entre: ` +
          pendientes.map((t) => t.id).join(", "),
        EXIT_INVARIANT,
      );
    }
    const [siguiente] = pendientes.splice(i, 1);
    if (siguiente === undefined) break;
    ordenados.push(siguiente);
    puestos.add(siguiente.id);
  }
  return ordenados;
}

/** Falla si el ticket no está en el alcance de la delegación. */
export function assertInScope(
  paths: RegistryPaths,
  delegation: Delegation,
  ticketId: string,
): void {
  if (!delegatedTickets(paths, delegation).some((t) => t.id === ticketId)) {
    fail(
      `El ticket ${ticketId} está fuera del alcance de la delegación ${delegation.id} ` +
        `(${delegation.scope.feature === null ? "tickets " + delegation.scope.tickets.join(", ") : "feature " + delegation.scope.feature}). ` +
        "Una delegación no se extiende a otro trabajo: pedile al PO una nueva.",
      EXIT_INVARIANT,
    );
  }
}

/**
 * La razón por la que este ticket es del PO aunque haya delegación, o `null`.
 *
 * Son los impactos que la regla del proyecto reserva a una persona: sincronización,
 * migración y contenedores, y el riesgo crítico. Se mira el frontmatter, que es lo
 * que el contrato obliga a declarar y lo que el gate compara con el diagnóstico.
 */
export function hardGateStop(ticketText: string): string | null {
  const ticket = parseTicket(ticketText);
  const impactos = impactIdsInFields(ticket.fields);
  const razones: string[] = [];
  if (impactos.length > 0) razones.push(`declara ${impactos.join(", ")}`);
  if (ticket.fields.risk_level === "critical") razones.push("su riesgo es crítico");
  if (ticket.fields.type === "SECURITY") razones.push("es de seguridad");
  return razones.length === 0
    ? null
    : `gate humano duro: ${razones.join(" y ")}. Una delegación no cubre despliegue, migraciones, ` +
        "seguridad ni cambios de sincronización o contenedores: lo decide una persona.";
}

/** Dónde está cada ticket del alcance, para decidir qué sigue. */
export interface DelegationProgress {
  readonly next: { readonly id: string; readonly state: string } | null;
  readonly closed: readonly string[];
  readonly waitingPo: readonly string[];
  /** Tickets que no se pueden trabajar y por qué (bloqueado, dependencia sin cerrar, parada dura). */
  readonly stopped: readonly { readonly id: string; readonly reason: string }[];
  readonly done: boolean;
}

/**
 * Qué ticket sigue.
 *
 * Un ticket cerrado o en `awaiting_user_tests` no se vuelve a tocar. Que uno espere
 * al PO **no** frena a los que dependen de él —así se trabajó la corrida real, con
 * los tickets visuales a la espera—, pero uno bloqueado o con una dependencia en
 * cualquier otro estado sí se salta, y se dice por qué.
 */
export function delegationProgress(
  paths: RegistryPaths,
  delegation: Delegation,
): DelegationProgress {
  const ordenados = delegatedTickets(paths, delegation);
  const estado = new Map<string, string>();
  const textos = new Map<string, string>();
  for (const { id } of ordenados) {
    const ruta = ticketPathFor(paths, id);
    if (!existsSync(ruta)) {
      estado.set(id, "missing");
      continue;
    }
    const texto = readFileSync(ruta, "utf8");
    textos.set(id, texto);
    estado.set(id, parseTicket(texto).fields.workflow_status);
  }

  const closed: string[] = [];
  const waitingPo: string[] = [];
  const stopped: { id: string; reason: string }[] = [];
  let next: { id: string; state: string } | null = null;

  for (const { id, dependsOn } of ordenados) {
    const e = estado.get(id) ?? "missing";
    if (e === "closed") {
      closed.push(id);
      continue;
    }
    if (e === "awaiting_user_tests") {
      waitingPo.push(id);
      continue;
    }
    if (e === "missing") {
      stopped.push({ id, reason: "no existe en el registro (¿falta materializar la feature?)" });
      continue;
    }
    if (e === "blocked") {
      stopped.push({ id, reason: "está bloqueado" });
      continue;
    }
    const sinCerrar = dependsOn.filter((d) => {
      const de = estado.get(d);
      return de !== undefined && de !== "closed" && de !== "awaiting_user_tests";
    });
    if (sinCerrar.length > 0) {
      stopped.push({ id, reason: `depende de ${sinCerrar.join(", ")}, que no está cerrado` });
      continue;
    }
    const dura = hardGateStop(textos.get(id) ?? "");
    if (dura !== null) {
      stopped.push({ id, reason: dura });
      continue;
    }
    if (next === null) next = { id, state: e };
  }

  return {
    next,
    closed,
    waitingPo,
    stopped,
    done: next === null && stopped.length === 0,
  };
}
