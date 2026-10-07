/**
 * Firmar un bloqueo desde la pantalla (R-CDEF-004, la pantalla que faltaba).
 *
 * El motor ya admite que una persona autorice seguir pese a un bloqueo, con su frase
 * literal; la pantalla solo ofrecía decidir sobre un `review`. Se ejecuta la interfaz de
 * verdad (el HTML con un DOM mínimo) y se usa: se busca el botón, se escribe la frase y se
 * pulsa, y se comprueba lo que la pantalla envía al endpoint. Un test sobre el HTML como
 * texto no vería una rama que se recorre solo con ciertos datos.
 */
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readTicket } from "../packages/engine/src/index.js";
import { buscarNodos, disparar, ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";
import type { NodoFalso } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");
const ID = "FEATURE-UI-BANDA-FASES-20260929";

const ticket = readTicket({ root: RAIZ, ticketsDir: "tickets" }, ID);
if (ticket === null) throw new Error(`Falta el ticket de prueba ${ID}`);

/** La definición de una compuerta, como la lista la API. */
function compuerta(id: string): Record<string, unknown> {
  return {
    id,
    title: `Compuerta ${id}`,
    transition: "planned → approved",
    mode: "hybrid",
    appliesTo: ["planned"],
    applies: true,
    workflowStatus: "planned",
    mechanicalChecks: [],
    blockedByCode: false,
    propositionCount: 1,
    hasCommandChecks: false,
    needsModel: true,
    policy: { approveAt: 0.9, blockAt: 0.1 },
    routing: { model: "typesafe/jev-1.13", effort: "high", source: "preset", probabilistic: true },
  };
}

/** Un recibo vigente con el resultado dado y sin decisión humana. */
function recibo(opciones: {
  readonly gate: string;
  readonly outcome: "block" | "review" | "approve";
  readonly stale?: boolean;
  readonly receiptId?: string;
  readonly humana?: boolean;
}): Record<string, unknown> {
  return {
    gate: opciones.gate,
    outcome: opciones.outcome,
    receiptId: opciones.receiptId ?? `GR-${opciones.gate}-1`,
    actor: "model",
    decidedAt: "2026-10-06T10:00:00Z",
    stale: opciones.stale ?? false,
    humanDecision: opciones.humana
      ? { actor: "Juan Andrade", decision: "approve", reason: "Sigo.", channel: "mission-control", decidedAt: "2026-10-06T11:00:00Z" }
      : null,
    reason: opciones.outcome === "block" ? "falló criterio_02=0.02" : "queda en banda media.",
    escalatedTo: opciones.outcome === "review" ? "human" : null,
    weightedMean: 0.4,
    model: { resolvedVersion: "typesafe/jev-1.13-20260917" },
    usage: { costUsd: 0.000012 },
    latencyMs: 420,
    stateHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    propositions: [
      { id: "criterio_02", label: "criterio_02", description: "El rollback se declara.", value: 0.02, mark: opciones.outcome === "block" ? "block" : "review", reason: "" },
    ],
    mechanicalChecks: [],
    report: `RESULTADO: ${opciones.outcome.toUpperCase()}`,
  };
}

interface Llamada {
  readonly ruta: string;
  readonly metodo: string;
  readonly cuerpo: unknown;
}

/** Pinta el ticket con las compuertas y los recibos dados, y registra lo que la pantalla envía. */
async function pintar(compuertas: readonly string[], recibos: readonly Record<string, unknown>[]) {
  const llamadas: Llamada[] = [];
  const vista = await ejecutarInterfaz(HTML, {
    hash: `#/ticket/${ID}`,
    localStorage: { "valmen.actor": "Juan Andrade" },
    respuesta: (ruta, init) => {
      const url = new URL(ruta, "http://localhost");
      if (init?.method === "POST") {
        llamadas.push({
          ruta: url.pathname,
          metodo: "POST",
          cuerpo: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
        });
        return { ok: true, error: "" };
      }
      if (url.pathname === `/api/tickets/${ID}/gates`) {
        return {
          gates: compuertas.map(compuerta),
          decisions: recibos,
          corrections: [],
          transitions: null,
        };
      }
      if (url.pathname === "/api/ticket/fases") {
        return { ticket: ID, fases: [], timeline: { disponible: false }, sesionesPorFase: [], kanban: null };
      }
      if (url.pathname === "/api/timeline") return { available: false, compuertas: [] };
      if (url.pathname === `/api/tickets/${ID}`) return ticket;
      if (url.pathname === "/api/health") return { root: RAIZ };
      return {};
    },
  });
  return { vista, llamadas };
}

const botones = (v: { contenido: NodoFalso | undefined }): string[] =>
  buscarNodos(v.contenido, (n) => n.tagName === "BUTTON").map((n) => String(n._texto));
const campoDeFrase = (v: { contenido: NodoFalso | undefined }): NodoFalso | undefined =>
  buscarNodos(v.contenido, (n) => n.tagName === "INPUT" && String(n.placeholder ?? "").includes("Frase literal"))[0];
const botonDeAutorizar = (v: { contenido: NodoFalso | undefined }): NodoFalso | undefined =>
  buscarNodos(v.contenido, (n) => n.tagName === "BUTTON" && String(n._texto) === "Autorizar seguir pese al bloqueo")[0];

describe("un recibo que bloqueó", () => {
  it("ofrece el campo de la frase literal y el botón de autorizar seguir", async () => {
    const { vista } = await pintar(["plan"], [recibo({ gate: "plan", outcome: "block" })]);

    expect(vista.fallos).toEqual([]);
    expect(vista.texto).toContain("El evaluador bloqueó");
    expect(vista.texto).toContain("Autorizar no avanza el ticket");
    expect(campoDeFrase(vista)).toBeDefined();
    expect(botones(vista)).toContain("Autorizar seguir pese al bloqueo");
  });

  it("no ofrece «Rechazar»: rechazar un bloqueo no cambia nada", async () => {
    const { vista } = await pintar(["plan"], [recibo({ gate: "plan", outcome: "block" })]);

    expect(botones(vista)).not.toContain("Rechazar");
    expect(botones(vista)).not.toContain("Aprobar");
  });

  it("el botón no se habilita sin la frase y se habilita al escribirla", async () => {
    const { vista } = await pintar(["plan"], [recibo({ gate: "plan", outcome: "block" })]);
    const frase = campoDeFrase(vista) as NodoFalso;
    const boton = botonDeAutorizar(vista) as NodoFalso;

    expect(boton.disabled).toBe(true);
    frase.value = "   ";
    await disparar(frase, "input");
    expect(boton.disabled).toBe(true);
    frase.value = "Autorizo seguir: el plan ya corrige lo que faltaba";
    await disparar(frase, "input");
    expect(boton.disabled).toBe(false);
  });

  it("al pulsar envía la decisión approve con el responsable y la frase literal", async () => {
    const { vista, llamadas } = await pintar(["plan"], [recibo({ gate: "plan", outcome: "block", receiptId: "GR-plan-7" })]);
    const frase = campoDeFrase(vista) as NodoFalso;
    frase.value = "Autorizo seguir: el plan ya corrige lo que faltaba";
    await disparar(frase, "input");

    await disparar(botonDeAutorizar(vista) as NodoFalso, "click");

    const decision = llamadas.find((l) => l.ruta.endsWith("/decision"));
    expect(decision?.ruta).toBe(`/api/tickets/${ID}/gates/GR-plan-7/decision`);
    expect(decision?.cuerpo).toEqual({
      decision: "approve",
      actor: "Juan Andrade",
      reason: "Autorizo seguir: el plan ya corrige lo que faltaba",
    });
  });

  it("un bloqueo obsoleto también se puede autorizar", async () => {
    const { vista } = await pintar(["plan"], [recibo({ gate: "plan", outcome: "block", stale: true })]);

    expect(vista.texto).toContain("El ticket cambió desde que se emitió este recibo");
    expect(botones(vista)).toContain("Autorizar seguir pese al bloqueo");
  });

  it("uno de análisis se ofrece igual que uno de plan", async () => {
    const { vista } = await pintar(["analysis"], [recibo({ gate: "analysis", outcome: "block" })]);
    expect(botones(vista)).toContain("Autorizar seguir pese al bloqueo");
  });
});

describe("lo que no se ofrece", () => {
  it("sobre el bloqueo de qa-mechanical no hay ninguna acción y la pantalla dice por qué", async () => {
    const { vista } = await pintar(["qa-mechanical"], [recibo({ gate: "qa-mechanical", outcome: "block" })]);

    expect(vista.texto).toContain("un comando falló, y eso es un hecho y no una opinión");
    expect(campoDeFrase(vista)).toBeUndefined();
    expect(botones(vista)).not.toContain("Autorizar seguir pese al bloqueo");
  });

  it("un bloqueo que una persona ya autorizó no ofrece firmar otra vez", async () => {
    const { vista } = await pintar(["plan"], [recibo({ gate: "plan", outcome: "block", humana: true })]);

    expect(vista.texto).toContain("Juan Andrade");
    expect(campoDeFrase(vista)).toBeUndefined();
    expect(botones(vista)).not.toContain("Autorizar seguir pese al bloqueo");
  });

  it("un recibo aprobado no ofrece decidir", async () => {
    const { vista } = await pintar(["plan"], [recibo({ gate: "plan", outcome: "approve" })]);
    expect(campoDeFrase(vista)).toBeUndefined();
    expect(botones(vista)).not.toContain("Autorizar seguir pese al bloqueo");
  });
});

describe("el review de siempre", () => {
  it("conserva «Aprobar» y «Rechazar» y no ofrece autorizar un bloqueo", async () => {
    const { vista } = await pintar(["plan"], [recibo({ gate: "plan", outcome: "review" })]);

    expect(botones(vista)).toContain("Aprobar");
    expect(botones(vista)).toContain("Rechazar");
    expect(botones(vista)).not.toContain("Autorizar seguir pese al bloqueo");
  });
});
