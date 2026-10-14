/**
 * Inicio con lo que espera una decisión de la persona (FEATURE-WEB-INICIO-DECISIONES-20261014:
 * R-MARCO-005 y la parte de Inicio de R-MARCO-006).
 *
 * Tres lecturas: `leerInicio` sobre un registro temporal real (tickets, eventos y recibos
 * escritos con el motor), para lo que el servidor cuenta; la interfaz ejecutada con el DOM
 * mínimo de `scripts/verificar-interfaz.mjs`, para lo que la vista pinta; y el HTML como
 * texto, para el corte de 768 px. Boceto de referencia:
 * `.valmen/features/rediseno-mission-control/assets/inicio.html`.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findTicket } from "../packages/engine/src/discovery.js";
import { appendReceipt, registrarDecisionDelAgente } from "../packages/engine/src/index.js";
import type { GateReceipt } from "../packages/gate/src/index.js";
import { leerInicio } from "../packages/server/src/inicio.js";
import { buscarNodos, ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";
import type { NodoFalso } from "../scripts/verificar-interfaz.mjs";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");

// ── El servidor: `leerInicio` sobre un registro real ─────────────────────────

/** El día de los fixtures (`created: 2026-09-21`), a media mañana en hora local. */
const HOY = new Date(2026, 8, 21, 10, 0, 0);

let lab: string;
const paths = () => ({ root: lab, ticketsDir: "tickets" });

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-inicio-"));
});
afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Cambia el texto del ticket ya escrito: fecha de creación o un cierre registrado. */
function reescribir(id: string, cambio: (texto: string) => string): void {
  const ubicado = findTicket(paths(), id);
  if (ubicado === undefined) throw new Error(`no existe ${id}`);
  writeFileSync(ubicado.absolutePath, cambio(ubicado.text), "utf8");
}

function decision(id: string, pregunta: string): void {
  registrarDecisionDelAgente({
    paths: paths(),
    ticketId: id,
    pregunta,
    eleccion: "la conservadora",
    alternativas: ["otra"],
    criterio: "se puede revertir",
    fuente: "recomendación del agente",
    reversion: "volver atrás el cambio",
  });
}

function reciboReview(id: string, revisor: boolean): GateReceipt {
  return {
    kind: "gate-receipt",
    receiptVersion: 1,
    schemaVersion: "2",
    id: `GR-20260921-${id}-plan-1`,
    gate: "plan",
    gateHash: "sha256:test",
    subject: { type: "ticket", id, revision: "1" },
    outcome: "review",
    reason: "una proposición en la banda media",
    actor: "model",
    decidedAt: "2026-09-21T09:00:00.000Z",
    stateHash: "sha256:estado",
    policy: { approveAt: 0.9, blockAt: 0.1 },
    mechanicalChecks: [],
    modelAnswers: [],
    propositions: [
      {
        id: "criterios_verificables",
        kind: "noul",
        weight: 1,
        value: 0.62,
        label: "p",
        inBand: true,
        effect: { outcome: "review" },
        reason: "dos criterios compuestos",
        verdict: true,
      },
    ] as GateReceipt["propositions"],
    model: null,
    usage: null,
    latencyMs: null,
    escalatedTo: "human",
    humanDecision: null,
    ...(revisor ? { reviewerDecision: { decision: "approve" } } : {}),
  } as GateReceipt;
}

const PRUEBAS = "FEATURE-WEB-PRUEBAS-PERSONA-20260921";
const RATIFICAR = "FEATURE-WEB-RATIFICAR-PERSONA-20260921";
const REVIEW = "FEATURE-GATE-REVIEW-ABIERTO-20260921";
const REVISADO = "FEATURE-GATE-REVIEW-REVISADO-20260921";
const INTAKE = "FEATURE-WEB-SIN-EMPEZAR-20260921";
const CERRADO = "FEATURE-WEB-CERRADO-HOY-20260921";
const CERRADO_ANTES = "FEATURE-WEB-CERRADO-ANTES-20260921";

/** Un ticket FEATURE del fixture, con el módulo que nombra su id. */
function ticket(id: string, workflowStatus: string, extra: { qaStatus?: string } = {}): void {
  writeFixtureTicket(lab, { id, type: "FEATURE", module: id.split("-")[1] as string, workflowStatus, ...extra });
}

function cerrar(id: string, fecha: string): void {
  ticket(id, "closed", { qaStatus: "approved" });
  reescribir(id, (t) =>
    t.replace(
      "## Cierre\n\n```json\n[]\n```",
      "## Cierre\n\n```json\n" +
        JSON.stringify([{ kind: "closure", id: "CLOSE-001", date: fecha, qa_status: "approved" }], null, 2) +
        "\n```",
    ),
  );
}

/** Un registro con un caso de cada cosa que Inicio cuenta. */
function registroCompleto(): void {
  ticket(PRUEBAS, "awaiting_user_tests");
  ticket(RATIFICAR, "in_progress");
  decision(RATIFICAR, "¿Qué texto lleva el aviso?");
  decision(RATIFICAR, "¿Por qué canal sale?");
  ticket(REVIEW, "planned");
  appendReceipt(paths(), REVIEW, reciboReview(REVIEW, false));
  ticket(REVISADO, "planned");
  appendReceipt(paths(), REVISADO, reciboReview(REVISADO, true));
  ticket(INTAKE, "intake");
  reescribir(INTAKE, (t) => t.replace("created: 2026-09-21", "created: 2026-09-20"));
  cerrar(CERRADO, "2026-09-21");
  cerrar(CERRADO_ANTES, "2026-03-02");
  reescribir(CERRADO_ANTES, (t) => t.replace("created: 2026-09-21", "created: 2026-03-01"));
  // Los demás se crearon «hoy» por la plantilla; solo se quiere uno registrado hoy.
  for (const id of [PRUEBAS, RATIFICAR, REVIEW, REVISADO, CERRADO]) {
    reescribir(id, (t) => t.replace("created: 2026-09-21", "created: 2026-09-01"));
  }
  ticket("FEATURE-WEB-NUEVO-HOY-20260921", "intake");
}

describe("GET /api/inicio (leerInicio sobre el registro)", () => {
  it.each([
    ["C1", PRUEBAS, "pruebas"],
    ["C2", RATIFICAR, "ratificar"],
    ["C3", REVIEW, "review"],
  ])("%s: lista %s como pendiente «%s»", (_c, id, tipo) => {
    registroCompleto();
    const inicio = leerInicio(paths(), HOY);
    expect(inicio.pendientes.filter((p) => p.ticket === id).map((p) => p.tipo)).toEqual([tipo]);
  });

  it("C2: el pendiente «ratificar» dice cuántas decisiones esperan", () => {
    registroCompleto();
    const pendiente = leerInicio(paths(), HOY).pendientes.find((p) => p.tipo === "ratificar");
    expect(pendiente?.cuantas).toBe(2);
  });

  it("C3: la compuerta en REVIEW que ya decidió el revisor no espera a la persona", () => {
    registroCompleto();
    const inicio = leerInicio(paths(), HOY);
    expect(inicio.pendientes.some((p) => p.ticket === REVISADO)).toBe(false);
    expect(inicio.pendientes.find((p) => p.ticket === REVIEW)?.gate).toBe("plan");
  });

  it("C4: cuenta los tickets en intake", () => {
    registroCompleto();
    expect(leerInicio(paths(), HOY).cifras.intake).toBe(2);
  });

  it("C5: cuenta los tickets cerrados en el año en curso", () => {
    registroCompleto();
    const { cifras } = leerInicio(paths(), HOY);
    expect(cifras.cerradosAnio).toBe(2);
    expect(cifras.anio).toBe(2026);
    expect(leerInicio(paths(), new Date(2027, 0, 5)).cifras.cerradosAnio).toBe(0);
  });

  it.each([
    ["C6", "cerrado", CERRADO],
    ["C7", "registrado", "FEATURE-WEB-NUEVO-HOY-20260921"],
  ])("%s: «Hecho hoy» trae el ticket %s hoy", (_c, tipo, id) => {
    registroCompleto();
    const hecho = leerInicio(paths(), HOY).hechoHoy.filter((h) => h.tipo === tipo);
    expect(hecho.map((h) => h.ticket)).toEqual([id]);
  });
});

// ── La interfaz ejecutada ───────────────────────────────────────────────────

const INICIO_CON_PENDIENTES = {
  fecha: "2026-10-14",
  pendientes: [
    {
      tipo: "ratificar",
      ticket: "FEATURE-CLI-AVISO-DECISION-20261010",
      titulo: "Aviso de decisión",
      estado: "awaiting_user_tests",
      cuantas: 4,
      resumenes: ["D-001: ¿canal? → Telegram"],
    },
    {
      tipo: "pruebas",
      ticket: "FEATURE-WEB-ESTADO-PUBLICO-20261010",
      titulo: "Estado público",
      estado: "awaiting_user_tests",
    },
    {
      tipo: "review",
      ticket: "FEATURE-GATE-POLITICA-BANDA-REVIEW-20261010",
      titulo: "Política de banda",
      estado: "planned",
      gate: "plan",
      receiptId: "GR-1",
      dudas: ["criterios_verificables"],
    },
  ],
  cifras: { esperan: 3, intake: 1, cerradosAnio: 218, anio: 2026 },
  hechoHoy: [{ tipo: "cerrado", ticket: "FEATURE-CLI-AVISO-DECISION-20261010", titulo: "Aviso" }],
};

const AGENTES = {
  agentes: [
    {
      agente: "a1",
      principal: false,
      ticket: "BUGFIX-ENGINE-WORKTREE-RAMA-BASE-20261014",
      modelo: "claude-opus-5-5",
      estado: "trabajando",
      ticketEstado: "intake",
      faseConfirmada: "análisis",
      faseInferida: null,
    },
    {
      agente: "orquestador",
      principal: true,
      ticket: null,
      modelo: "claude-opus-5-5",
      estado: "trabajando",
      ticketEstado: null,
      faseConfirmada: null,
      faseInferida: null,
    },
  ],
};

async function pintar(hash: string, inicio: unknown) {
  const rutas: string[] = [];
  const respuestas: Record<string, unknown> = {
    "/api/health": { root: RAIZ },
    "/api/tickets": { tickets: [] },
    "/api/standards": { proposals: [] },
    "/api/perfiles": { perfiles: [], seleccion: { proyecto: null, ejecutores: {} } },
    "/api/inicio": inicio,
    "/api/corrida/agentes": AGENTES,
  };
  const vista = await ejecutarInterfaz(HTML, {
    hash,
    localStorage: { "valmen.project": "laboratorio" },
    respuesta: (ruta: string) => {
      const camino = new URL(ruta, "http://localhost").pathname;
      rutas.push(camino);
      return respuestas[camino] ?? {};
    },
  });
  return { vista, rutas };
}

function texto(n: NodoFalso | undefined, acumulado: string[] = []): string {
  if (n === undefined) return "";
  if (n._texto) acumulado.push(String(n._texto));
  for (const hijo of n.children ?? []) texto(hijo, acumulado);
  return acumulado.join(" | ");
}

const conClase = (clase: string) => (n: NodoFalso) =>
  String(n.className ?? "").split(" ").includes(clase);

describe("la vista Inicio (interfaz ejecutada)", () => {
  it("C8: sin ruta en la dirección abre Inicio y pide /api/inicio", async () => {
    const { vista, rutas } = await pintar("", INICIO_CON_PENDIENTES);
    expect(vista.fallos).toEqual([]);
    expect(vista.nodo("titulo-vista")?._texto).toBe("Inicio");
    expect(rutas).toContain("/api/inicio");
  });

  it("C9: el título dice cuántas cosas esperan la decisión de la persona", async () => {
    const { vista } = await pintar("#/inicio", INICIO_CON_PENDIENTES);
    const h1 = buscarNodos(vista.contenido, (n: NodoFalso) => n.tagName === "H1");
    expect(h1.map((n: NodoFalso) => n._texto)).toEqual(["3 cosas esperan tu decisión"]);
  });

  it("C10-C12: cada pendiente es una tarjeta con su id y un botón ámbar que abre su ticket", async () => {
    const { vista } = await pintar("#/inicio", INICIO_CON_PENDIENTES);
    const tarjetas = buscarNodos(vista.contenido, conClase("inicio-tarjeta"));
    expect(tarjetas).toHaveLength(3);
    for (const [i, tarjeta] of tarjetas.entries()) {
      const id = INICIO_CON_PENDIENTES.pendientes[i]?.ticket as string;
      expect(texto(tarjeta)).toContain(id);
      const [principal] = buscarNodos(tarjeta, conClase("inicio-accion"));
      expect(String(principal?.className)).toContain("persona");
      expect(principal?.attrs?.href).toBe(`#/ticket/${encodeURIComponent(id)}`);
    }
  });

  it("C13: la cuenta del menú en Inicio es la misma del título", async () => {
    const { vista } = await pintar("#/inicio", INICIO_CON_PENDIENTES);
    expect(vista.nodo("cuenta-inicio")?._texto).toBe("3");
    expect(vista.nodo("cuenta-inicio")?.hidden).toBe(false);
  });

  it("C14: sin pendientes dice que no hay nada parado por la persona", async () => {
    const { vista } = await pintar("#/inicio", {
      ...INICIO_CON_PENDIENTES,
      pendientes: [],
      cifras: { ...INICIO_CON_PENDIENTES.cifras, esperan: 0 },
    });
    expect(vista.texto).toContain("No hay nada parado por ti");
    expect(vista.texto).not.toContain("Espera tu decisión");
    expect(vista.texto).toContain("Ahora mismo");
    expect(vista.texto).toContain("Hecho hoy");
  });

  it("C15: «Ahora mismo» muestra cada agente vivo con su modelo", async () => {
    const { vista } = await pintar("#/inicio", INICIO_CON_PENDIENTES);
    const [ahora] = buscarNodos(vista.contenido, conClase("inicio-ahora"));
    const t = texto(ahora);
    expect(t).toContain("BUGFIX-ENGINE-WORKTREE-RAMA-BASE-20261014");
    expect(t).toContain("claude-opus-5-5");
    expect(buscarNodos(ahora, conClase("inicio-agente"))).toHaveLength(1);
  });

  it("C16: la fila de cifras muestra las cuatro cifras del boceto", async () => {
    const { vista } = await pintar("#/inicio", INICIO_CON_PENDIENTES);
    const [fila] = buscarNodos(vista.contenido, conClase("inicio-cifras"));
    const valores = buscarNodos(fila, conClase("inicio-cifra-valor")).map(
      (n: NodoFalso) => n._texto,
    );
    expect(valores).toEqual(["3", "1", "1", "218"]);
    const t = texto(fila);
    for (const rotulo of ["esperan tu decisión", "agente trabajando", "intake", "cerrados en 2026"]) {
      expect(t).toContain(rotulo);
    }
  });
});

// ── El HTML como texto ──────────────────────────────────────────────────────

describe("el corte de 768 px de Inicio", () => {
  it("C17: por debajo de 768 px las columnas de Inicio se apilan en una sola", () => {
    const html = readFileSync(HTML, "utf8");
    const bloques = [...html.matchAll(/@media \(max-width: 767px\) \{([\s\S]*?)\n {6}\}/g)].map(
      (m) => m[1] as string,
    );
    expect(bloques.some((b) => /\.inicio-columnas\s*\{[^}]*flex-direction:\s*column/.test(b))).toBe(
      true,
    );
  });
});
