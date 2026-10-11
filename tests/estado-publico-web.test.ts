/**
 * La vista web usa la función de estado público (R-EPU-002).
 *
 * C01–C04 llaman a `handleApi` sobre un registro temporal y comparan contra `estadoPublicoDelTicket`;
 * C06–C14 ejecutan `index.html` con respuestas simuladas cuyas filas traen `publicState`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  estadoPublicoDelTicket,
  type RegistryPaths,
} from "../packages/engine/src/index.js";
import { handleApi } from "../packages/server/src/server.js";
import { ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");
const PROYECTO = "valmen-harness";

// ── La API ──────────────────────────────────────────────────────────────────

const BLOQUEADO = "BUGFIX-POS-BLOQUEADO-20261011";
const PLAN = "BUGFIX-POS-PLAN-SIN-AUT-20261011";
const CERRADO = "BUGFIX-POS-CERRADO-20261011";
const ROTO = "BUGFIX-POS-ROTO-20261011";

let root: string;
const paths = (): RegistryPaths => ({ root, ticketsDir: "tickets" });
const contexto = () => ({
  root,
  credentialsFile: join(root, ".valmen", ".credentials.yaml"),
  env: {},
});

interface Fila {
  id: string;
  publicState: unknown;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-estado-web-"));
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(root, ".valmen", "config.yaml"), "name: Demo\n", "utf8");
  writeFixtureTicket(root, { id: BLOQUEADO, workflowStatus: "blocked", module: "POS" });
  writeFixtureTicket(root, { id: PLAN, workflowStatus: "planned", module: "POS" });
  writeFixtureTicket(root, { id: CERRADO, workflowStatus: "closed", module: "POS" });
  const roto = join(root, "tickets", "2026", ROTO);
  mkdirSync(roto, { recursive: true });
  writeFileSync(join(roto, "ticket.md"), "---\nid: [sin cerrar\n---\n", "utf8");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

async function lista(): Promise<Fila[]> {
  const r = await handleApi("GET", "/api/tickets", {}, contexto());
  expect(r.status).toBe(200);
  return (r.body as { tickets: Fila[] }).tickets;
}

describe("el servidor agrega publicState", () => {
  it("C01 cada fila de la lista trae el estado de estadoPublicoDelTicket", async () => {
    const filas = await lista();
    for (const id of [BLOQUEADO, PLAN, CERRADO]) {
      expect(filas.find((f) => f.id === id)?.publicState).toEqual(
        estadoPublicoDelTicket(paths(), id),
      );
    }
  });

  it("C02 un ticket en planned sin autorización trae la razón plan-approval", async () => {
    const fila = (await lista()).find((f) => f.id === PLAN);
    expect((fila?.publicState as { reason: string }).reason).toBe("plan-approval");
  });

  it("C03 el detalle trae el estado de estadoPublicoDelTicket", async () => {
    const r = await handleApi("GET", `/api/tickets/${BLOQUEADO}`, {}, contexto());
    expect(r.status).toBe(200);
    expect((r.body as Fila).publicState).toEqual(
      estadoPublicoDelTicket(paths(), BLOQUEADO),
    );
  });

  it("C04 un ticket ilegible sale con publicState null y la lista sigue en 200", async () => {
    const filas = await lista();
    const roto = filas.find((f) => f.id === ROTO);
    expect(roto).toBeDefined();
    expect(roto?.publicState).toBeNull();
  });
});

// ── La pantalla ─────────────────────────────────────────────────────────────

type Nodo = {
  tagName?: string;
  _texto?: string;
  className?: string;
  children: Nodo[];
};

const textoDe = (n: Nodo | undefined): string =>
  n === undefined
    ? ""
    : [n._texto ?? "", ...(n.children ?? []).map(textoDe)]
        .filter((p) => p !== "")
        .join(" | ");

const buscar = (n: Nodo | undefined, f: (n: Nodo) => boolean): Nodo[] =>
  n === undefined
    ? []
    : [...(f(n) ? [n] : []), ...(n.children ?? []).flatMap((h) => buscar(h, f))];

const DECIDE = (reason: string) => ({
  state: "needs-decision",
  label: "Necesita tu decisión",
  reason,
});
const TRABAJANDO = { state: "working", label: "Trabajando", reason: null };
const LISTO = { state: "done", label: "Listo", reason: null };

function fila(id: string, workflowStatus: string, publicState: unknown) {
  return {
    id,
    title: `Título de ${id}`,
    type: "FEATURE",
    module: "WEB",
    workflowStatus,
    qaStatus: "pending",
    releaseStatus: "unreleased",
    riskLevel: "normal",
    created: "2026-10-10",
    updated: "2026-10-11",
    closedOn: null,
    openPoints: 0,
    totalPoints: 0,
    criticalImpacts: [],
    path: `tickets/2026/${id}/ticket.md`,
    invalid: null,
    publicState,
  };
}

const SUMMARY = {
  total: 3,
  byWorkflow: {},
  byType: {},
  invalid: 0,
  withOpenPoints: 0,
  criticalImpacts: 0,
};

const A = fila("FEATURE-A-20261011", "blocked", DECIDE("blocked"));
const B = fila("FEATURE-B-20261011", "in_progress", TRABAJANDO);
const C = fila("FEATURE-C-20261011", "closed", null);
const D = fila("FEATURE-D-20261011", "planned", DECIDE("plan-approval"));
const E = fila("FEATURE-E-20261011", "awaiting_user_tests", DECIDE("user-tests"));
const F = fila("FEATURE-F-20261011", "closed", LISTO);

function agente(id: string, ticket: string) {
  return {
    agente: id,
    ticket,
    descripcion: `Trabajo de ${ticket}`,
    modelo: "claude-sonnet-5-5",
    esfuerzo: "high",
    rama: null,
    carpeta: null,
    ultimaHerramienta: "Edit",
    ultimaHerramientaEn: new Date().toISOString(),
    estado: "trabajando",
    ticketEstado: null,
    faseConfirmada: null,
    faseInferida: "implementando",
  };
}

function jornada(ticketId: string, orden: number, dependsOn: string[] = []) {
  return {
    ticketId,
    order: orden,
    phase: "implementation",
    dependsOn,
    waitingFor: [],
    stopReason: null,
    durationMs: null,
    window: null,
    lastReceivedAt: null,
  };
}

async function abrir(hash: string, tickets: unknown[], detalle?: unknown) {
  const resultado = await ejecutarInterfaz(HTML, {
    hash,
    localStorage: { "valmen.project": PROYECTO },
    respuesta: (ruta: string) => {
      const url = new URL(ruta, "http://localhost");
      if (url.pathname === "/api/health") return { root: RAIZ };
      if (url.pathname === "/api/portafolio")
        return { projects: [{ projectId: PROYECTO, name: "Harness", available: true }] };
      if (url.pathname === "/api/corrida/agentes")
        return { agentes: [agente("a1", B.id), agente("a2", A.id)] };
      if (url.pathname === "/api/journeys")
        return {
          authorization: { observationSources: [], dispatchExecutors: [] },
          journeys: [
            {
              journeyId: "JOR-1",
              revisionId: "rev-01",
              receivedAt: "2026-10-11T08:00:00.000Z",
              passes: { last: null, cadenceMs: null, next: null },
              tickets: [
                jornada(B.id, 1),
                jornada(A.id, 2),
                jornada(D.id, 3),
                { ...jornada(E.id, 4), phase: "delivered" },
              ],
            },
          ],
        };
      if (url.pathname === "/api/tickets") return { summary: SUMMARY, tickets };
      if (url.pathname.endsWith("/gates")) return { gates: [], transitions: null };
      if (detalle !== undefined && url.pathname === `/api/tickets/${(detalle as Fila).id}`)
        return detalle;
      return {};
    },
  });
  expect(resultado.fallos).toEqual([]);
  return resultado.contenido as Nodo;
}

const TODAS = [A, B, C, D, E, F];

describe("la lista de tickets", () => {
  it("C06 muestra la etiqueta del estado público en la celda de estado", async () => {
    const c = await abrir("#/tickets", TODAS);
    const filas = buscar(c, (n) => n.tagName === "TR").filter((n) =>
      textoDe(n).includes("FEATURE-A-20261011"),
    );
    expect(textoDe(filas[0])).toContain("Necesita tu decisión");
    const trabajando = buscar(c, (n) => n.tagName === "TR").find((n) =>
      textoDe(n).includes("FEATURE-B-20261011"),
    );
    expect(textoDe(trabajando)).toContain("Trabajando");
  });

  it("C07 una fila con publicState null muestra «—»", async () => {
    const c = await abrir("#/tickets", TODAS);
    const fc = buscar(c, (n) => n.tagName === "TR").find((n) =>
      textoDe(n).includes("FEATURE-C-20261011"),
    );
    const etiquetas = buscar(fc, (n) => (n.className ?? "").includes("corrida-estado"));
    expect(etiquetas.map(textoDe)).toEqual(["—"]);
  });
});

describe("la vista del ticket", () => {
  it("C08 la tira trae el chip «estado público» con la etiqueta del detalle", async () => {
    const detalle = {
      ...D,
      request: "",
      sections: {},
      points: [],
      qa: [],
      evidence: [],
      retests: [],
      closures: [],
      events: [],
      usage: [],
    };
    const c = await abrir(`#/ticket/${D.id}`, TODAS, detalle);
    const chips = buscar(c, (n) => (n.className ?? "").split(" ").includes("chip")).map(
      textoDe,
    );
    expect(chips).toContain("estado público | Necesita tu decisión");
  });
});

describe("la vista Agentes", () => {
  it("C09 el KPI «esperan al PO» cuenta un ticket en planned que necesita decisión", async () => {
    const c = await abrir("#/agentes", TODAS);
    const tarjetas = buscar(c, (n) => n.className === "tarjeta");
    const kpi = Object.fromEntries(
      tarjetas.map((t) => [t.children[1]!._texto, t.children[0]!._texto]),
    );
    // A (blocked), D (planned) y E (awaiting_user_tests) necesitan decisión.
    expect(kpi["esperan al PO"]).toBe("3");
  });

  it("C10 index.html ya no contiene ESTADOS_QUE_ESPERAN_AL_PO", () => {
    expect(readFileSync(HTML, "utf8")).not.toContain("ESTADOS_QUE_ESPERAN_AL_PO");
  });

  it("C11 el panel de entregados muestra el estado público después del del motor", async () => {
    const c = await abrir("#/agentes", TODAS);
    const linea = buscar(c, (n) => n.className === "corrida-item").find((n) =>
      textoDe(n).includes(E.id),
    );
    expect(textoDe(linea)).toBe(`${E.id} | awaiting_user_tests | Necesita tu decisión`);
  });

  it("C12 cada ticket de la cola muestra su estado público", async () => {
    const c = await abrir("#/agentes", TODAS);
    const linea = buscar(c, (n) => n.className === "corrida-item").find((n) =>
      textoDe(n).includes(D.id),
    );
    expect(textoDe(linea)).toContain("Necesita tu decisión");
  });

  it("C13 la fila de un agente vivo muestra el estado público de su ticket", async () => {
    const c = await abrir("#/agentes", TODAS);
    const tabla = buscar(c, (n) => n.className === "corrida-agente")[0];
    const filaB = buscar(tabla, (n) => n.tagName === "TR").find((n) =>
      textoDe(n).includes(B.id),
    );
    expect(textoDe(filaB)).toContain("Trabajando");
  });

  it("C14 un ticket en blocked dice «Necesita tu decisión» en la lista y en Agentes", async () => {
    const enLista = await abrir("#/tickets", TODAS);
    const enAgentes = await abrir("#/agentes", TODAS);
    const deLista = buscar(enLista, (n) => n.tagName === "TR").find((n) =>
      textoDe(n).includes(A.id),
    );
    const deAgentes = buscar(enAgentes, (n) => n.tagName === "TR").find((n) =>
      textoDe(n).includes(A.id),
    );
    expect(textoDe(deLista)).toContain("Necesita tu decisión");
    expect(textoDe(deAgentes)).toContain("Necesita tu decisión");
  });
});
