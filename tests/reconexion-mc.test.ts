import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");
const PROYECTO = "valmen-harness";
let temporal: string | undefined;

afterEach(() => {
  vi.useRealTimers();
  if (temporal !== undefined) rmSync(temporal, { recursive: true, force: true });
  temporal = undefined;
});

function esperarTurnos(turnos = 10) {
  return Promise.all(Array.from({ length: turnos }, () => new Promise<void>((resolve) => setImmediate(resolve))));
}

function jornada(actividad: string) {
  return {
    authorization: { observationSources: [], dispatchExecutors: [] },
    journeys: [{
      journeyId: "jornada-01",
      revisionId: "rev-01",
      receivedAt: "2026-10-03T10:00:00.000Z",
      tickets: [{
        order: 1,
        ticketId: "FEATURE-MC-RECONEXION-RECONCILIACION-20261001",
        actualAt: null,
        scheduledAt: null,
        condition: "manual",
        activity: actividad,
        durationMs: null,
        waitingFor: [],
        dependsOn: [],
        window: null,
        lastReceivedAt: null,
      }],
    }],
  };
}

function textoActual(nodo: { _texto?: string; className?: string; children: readonly unknown[] } | undefined): string {
  if (nodo === undefined) return "";
  return [nodo._texto ?? "", nodo.className ?? "", ...nodo.children.map((hijo) => textoActual(hijo as typeof nodo))]
    .filter((parte) => parte !== "")
    .join(" | ");
}

describe("reconexión de Mission Control", () => {
  it("pagina eventos del proyecto, evita reenvíos y actualiza jornadas antes de cinco segundos", async () => {
    temporal = mkdtempSync(join(tmpdir(), "valmen-reconexion-mc-"));
    const html = join(temporal, "index.html");
    writeFileSync(
      html,
      readFileSync(HTML, "utf8").replace(
        '<script type="module">',
        `<script type="module">
          document.activeElement = null;
          globalThis.pruebaReconexion = {};
          const TransporteDePrueba = globalThis.EventSource;
          globalThis.EventSource = class extends TransporteDePrueba {
            constructor(...args) {
              super(...args);
              globalThis.pruebaReconexion.eventos = this;
            }
          };
        `,
      ),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    let actividad = "pendiente";
    let fronteraInvalida = false;
    const llamadas: string[] = [];
    const inicio = Date.now();
    const resultado = await ejecutarInterfaz(html, {
      hash: "#/jornadas",
      localStorage: { "valmen.project": PROYECTO },
      respuesta: (ruta) => {
        llamadas.push(ruta);
        const url = new URL(ruta, "http://localhost");
        if (url.pathname === "/api/health") return { root: RAIZ };
        if (url.pathname === "/api/portafolio") {
          return { projects: [{ projectId: PROYECTO, name: "Harness", available: true }] };
        }
        if (url.pathname === "/api/journeys") return jornada(actividad);
        if (url.pathname === "/api/execution-events") {
          const after = url.searchParams.get("after");
          if (after === "0") {
            return {
              cursorValid: true,
              events: [{ eventId: "evt-01", cursor: 1 }],
              nextCursor: 1,
              latestCursor: 2,
              hasMore: true,
            };
          }
          if (after === "1") {
            return {
              cursorValid: true,
              events: [{ eventId: "evt-02", cursor: 2 }],
              nextCursor: 2,
              latestCursor: 2,
              hasMore: false,
            };
          }
          if (after === "2" && fronteraInvalida) {
            return {
              cursorValid: false,
              events: [],
              nextCursor: 0,
              latestCursor: 0,
              hasMore: false,
            };
          }
        }
        return {};
      },
    });
    const entorno = globalThis as typeof globalThis & {
      pruebaReconexion: { eventos: { oyentes: Map<string, (mensaje: { data: string; lastEventId?: string }) => void> } };
    };
    expect(resultado.texto).toContain("pendiente");

    actividad = "active";
    entorno.pruebaReconexion.eventos.oyentes.get("reconcile")!({ data: "{}" });
    await esperarTurnos(20);
    await vi.runAllTimersAsync();
    await esperarTurnos();

    expect(llamadas.filter((ruta) => ruta.includes("/api/execution-events?after=0&limit=100"))).toHaveLength(1);
    expect(llamadas.filter((ruta) => ruta.includes("/api/execution-events?after=1&limit=100"))).toHaveLength(1);
    expect(llamadas.filter((ruta) => ruta === "/api/journeys")).toHaveLength(2);
    expect(textoActual(resultado.contenido)).toContain("active");
    expect(Date.now() - inicio).toBeLessThan(5_000);

    // El mismo evento puede aparecer en el reenvío SSE y en la página de
    // reconciliación; después del cursor 2 no vuelve a repintar la jornada.
    const jornadasAntes = llamadas.filter((ruta) => ruta === "/api/journeys").length;
    entorno.pruebaReconexion.eventos.oyentes.get("execution")!({
      data: JSON.stringify({ cursor: 2 }), lastEventId: "2",
    });
    await vi.advanceTimersByTimeAsync(300);
    await esperarTurnos();
    expect(llamadas.filter((ruta) => ruta === "/api/journeys")).toHaveLength(jornadasAntes);

    // Si el servidor rotó su registro, el cursor que el navegador conservaba
    // deja de ser válido: se toma la foto vigente y se ancla en la frontera que
    // el servidor declara, sin intentar interpretar ni reescribir eventos.
    fronteraInvalida = true;
    entorno.pruebaReconexion.eventos.oyentes.get("reconcile")!({ data: "{}" });
    await esperarTurnos(20);
    await vi.runAllTimersAsync();
    await esperarTurnos();
    expect(llamadas.filter((ruta) => ruta.includes("/api/execution-events?after=2&limit=100"))).toHaveLength(1);
    expect(llamadas.filter((ruta) => ruta === "/api/journeys")).toHaveLength(jornadasAntes + 1);
    expect(resultado.fallos).toEqual([]);
  });

  it("descarta una foto de jornadas que llega después de abandonar la vista", async () => {
    let resolverJornadas: ((valor: ReturnType<typeof jornada>) => void) | undefined;
    const pendiente = new Promise<ReturnType<typeof jornada>>((resolve) => {
      resolverJornadas = resolve;
    });
    const resultado = await ejecutarInterfaz(HTML, {
      hash: "#/jornadas",
      localStorage: { "valmen.project": PROYECTO },
      respuesta: (ruta) => {
        const url = new URL(ruta, "http://localhost");
        if (url.pathname === "/api/health") return { root: RAIZ };
        if (url.pathname === "/api/portafolio") {
          return { projects: [{ projectId: PROYECTO, name: "Harness", available: true }] };
        }
        if (url.pathname === "/api/journeys") return pendiente;
        if (url.pathname === "/api/tickets") return { tickets: [], summary: {} };
        return {};
      },
    });
    const navegador = globalThis as typeof globalThis & {
      location: { hash: string };
      window: { dispatchEvent: (evento: { type: string }) => void };
    };
    navegador.location.hash = "#/tickets";
    navegador.window.dispatchEvent({ type: "hashchange" });
    await esperarTurnos();
    resolverJornadas!(jornada("respuesta tardía"));
    await esperarTurnos();

    expect(textoActual(resultado.contenido)).not.toContain("respuesta tardía");
    expect(resultado.fallos).toEqual([]);
  });
});
