/**
 * La línea de tiempo del ticket en pantalla: las compuertas no dependen de las sesiones.
 *
 * Caso real que lo motivó: un ticket trabajado entero desde Claude Code, que el
 * harness todavía no sabía leer. `GET /api/timeline` devolvía cero sesiones y
 * **cinco compuertas** —los recibos existían—, y la pantalla pintaba «Ninguna
 * sesión trabajó este ticket» y salía antes de pintar las compuertas. El dato
 * estaba y la vista lo escondía.
 *
 * Se ejecuta la interfaz de verdad (el módulo del HTML con un DOM mínimo) y se
 * comprueba lo que pinta: un test sobre el HTML como texto no vería una rama que
 * se recorre solo con ciertos datos.
 */
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readTicket } from "../packages/engine/src/index.js";
import { ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");
const ID = "FEATURE-UI-BANDA-FASES-20260929";

const ticket = readTicket({ root: RAIZ, ticketsDir: "tickets" }, ID);
if (ticket === null) throw new Error(`Falta el ticket de prueba ${ID}`);

/** Dos recibos: uno con modelo y coste, y uno mecánico, que es la pareja real. */
const COMPUERTAS = [
  {
    gate: "analysis",
    outcome: "approve",
    actor: "model",
    decidedAt: "2026-10-05T16:00:00Z",
    model: "TypeSafe/typesafe/jev-1.13",
    inputTokens: 3050,
    outputTokens: 148,
    costUsd: 0.0001281,
  },
  {
    gate: "qa-mechanical",
    outcome: "approve",
    actor: "code",
    decidedAt: "2026-10-05T17:00:00Z",
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  },
];

const SIN_TOTALES = {
  intervenciones: [],
  totalCostUsd: 0,
  sesionesSinCoste: 0,
  sesionesCompartidas: 0,
  costeCompartidoUsd: 0,
  totalTokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0 },
  desglose: {
    harnessUsd: 0,
    exploracionUsd: 0,
    harnessMensajes: 0,
    exploracionMensajes: 0,
    costeNoAtribuibleUsd: 0,
  },
};

/** Pinta la vista del ticket con la respuesta que se le dé a `/api/timeline`. */
function pintar(timeline: unknown) {
  return ejecutarInterfaz(HTML, {
    hash: `#/ticket/${ID}`,
    respuesta: (ruta) => {
      const url = new URL(ruta, "http://localhost");
      if (url.pathname === "/api/timeline") return timeline;
      if (url.pathname === "/api/ticket/fases") {
        return { ticket: ID, fases: [], timeline: { disponible: false }, sesionesPorFase: [], kanban: null };
      }
      if (url.pathname === `/api/tickets/${ID}/gates`) {
        return { gates: [], decisions: [], corrections: [], transitions: null };
      }
      if (url.pathname === `/api/tickets/${ID}`) return ticket;
      if (url.pathname === "/api/health") return { root: RAIZ };
      return {};
    },
  });
}

describe("la línea de tiempo del ticket sin sesiones", () => {
  it("pinta las compuertas aunque ninguna sesión haya trabajado el ticket", async () => {
    const vista = await pintar({
      available: true,
      source: "/contabilidad/opencode.db",
      sessions: [],
      ...SIN_TOTALES,
      compuertas: COMPUERTAS,
    });

    expect(vista.fallos).toEqual([]);
    expect(vista.texto).toContain("Ninguna sesión trabajó este ticket");
    // El aviso nombra a Claude Code: el PO trabaja los tickets desde ahí, y un
    // aviso que lista tres agentes y omite el cuarto sugiere que no se lee.
    expect(vista.texto).toContain("Claude Code");
    expect(vista.texto).toContain("El harness sí evaluó 2 compuerta(s)");
    // Y las compuertas están, con su modelo o con el rótulo de «mecánico».
    expect(vista.texto).toContain("analysis");
    expect(vista.texto).toContain("TypeSafe/typesafe/jev-1.13");
    expect(vista.texto).toContain("qa-mechanical");
    expect(vista.texto).toContain("mecánico (sin modelo)");
    expect(vista.texto).toContain("$0.000128");
  });

  it("sin sesiones ni compuertas dice solo lo que falta y no inventa una tabla vacía", async () => {
    const vista = await pintar({
      available: true,
      source: "/contabilidad/opencode.db",
      sessions: [],
      ...SIN_TOTALES,
      compuertas: [],
    });

    expect(vista.texto).toContain("Ninguna sesión trabajó este ticket");
    expect(vista.texto).not.toContain("El harness sí evaluó");
    expect(vista.texto).not.toContain("mecánico (sin modelo)");
  });

  it("sin contabilidad que leer también muestra los recibos, que no dependen de ella", async () => {
    const vista = await pintar({
      available: false,
      reason: "No se encontró la contabilidad de ningún agente.",
      compuertas: COMPUERTAS,
    });

    expect(vista.fallos).toEqual([]);
    expect(vista.texto).toContain("Sin datos de consumo: No se encontró la contabilidad");
    expect(vista.texto).toContain("Las compuertas sí constan: 2");
    expect(vista.texto).toContain("qa-mechanical");
  });

  it("sin contabilidad y sin recibos queda el aviso de siempre", async () => {
    const vista = await pintar({ available: false, compuertas: [] });

    expect(vista.texto).toContain("Sin datos de consumo");
    expect(vista.texto).not.toContain("Las compuertas sí constan");
  });
});
