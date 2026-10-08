import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");
const PROYECTO = "valmen-harness";

type Nodo = { _texto?: string; className?: string; children: readonly unknown[] };

function textoActual(nodo: Nodo | undefined): string {
  if (nodo === undefined) return "";
  return [nodo._texto ?? "", ...nodo.children.map((hijo) => textoActual(hijo as Nodo))]
    .filter((parte) => parte !== "")
    .join(" | ");
}

function ticket(ticketId: string, order: number, phase: string, stopReason: string | null = null) {
  return {
    order, ticketId, actualAt: null, scheduledAt: null, condition: "manual", activity: "unknown",
    phase, stopReason, durationMs: null, waitingFor: [], dependsOn: [], window: null, lastReceivedAt: null,
  };
}

function jornada(passes: unknown, observationSources: string[] = []) {
  return {
    authorization: { observationSources, dispatchExecutors: [] },
    journeys: [{
      journeyId: "JOR-20261007", revisionId: "rev-01", receivedAt: "2026-10-07T08:00:00.000Z", passes,
      tickets: [
        ticket("FEATURE-UNO-20261007", 1, "implementing"),
        ticket("FEATURE-DOS-20261007", 2, "stopped", "El ejecutor salió con código 2."),
        ticket("FEATURE-TRES-20261007", 3, "plan-ready"),
      ],
    }],
  };
}

async function abrir(datos: unknown) {
  const resultado = await ejecutarInterfaz(HTML, {
    hash: "#/jornadas",
    localStorage: { "valmen.project": PROYECTO },
    respuesta: (ruta) => {
      const url = new URL(ruta, "http://localhost");
      if (url.pathname === "/api/health") return { root: RAIZ };
      if (url.pathname === "/api/portafolio") return { projects: [{ projectId: PROYECTO, name: "Harness", available: true }] };
      if (url.pathname === "/api/journeys") return datos;
      return {};
    },
  });
  expect(resultado.fallos).toEqual([]);
  return textoActual(resultado.contenido as Nodo);
}

describe("la vista Jornadas muestra el avance", () => {
  const conPasadas = {
    last: { at: "2026-10-07T08:15:00.000Z", estado: "despachado", detalle: "Se despachó FEATURE-UNO-20261007." },
    cadenceMs: 900_000,
    next: "2026-10-07T08:30:00.000Z",
  };

  it("la hora y el resultado de la última pasada", async () => {
    const texto = await abrir(jornada(conPasadas));
    expect(texto).toContain("Última pasada: 2026-10-07T08:15:00.000Z · despachado — Se despachó FEATURE-UNO-20261007.");
  });

  it("la próxima pasada rotulada como estimada, o que no hay cadencia conocida", async () => {
    expect(await abrir(jornada(conPasadas))).toContain("Próxima pasada (estimada): 2026-10-07T08:30:00.000Z");
    const sinCadencia = await abrir(jornada({ last: conPasadas.last, cadenceMs: null, next: null }));
    expect(sinCadencia).toContain("Próxima pasada: sin cadencia conocida todavía");
    expect(await abrir(jornada({ last: null, cadenceMs: null, next: null }))).toContain("Sin pasadas registradas");
  });

  it("la columna Fase en español y el motivo de un ticket detenido", async () => {
    const texto = await abrir(jornada(conPasadas));
    expect(texto).toContain("Fase");
    expect(texto).toContain("Implementando");
    expect(texto).toContain("Plan listo para aprobar");
    expect(texto).toContain("Detenido | El ejecutor salió con código 2.");
    expect(texto).toContain("Actividad");
  });

  it("sin fuentes de observación, la nota dice que la actividad la registra el despacho", async () => {
    const texto = await abrir(jornada(conPasadas));
    expect(texto).toContain("Observación externa: ninguna fuente declarada; la actividad mostrada la registra el propio despacho de la jornada");
    expect(texto).not.toContain("sin fuentes");
    expect(await abrir(jornada(conPasadas, ["hermes"]))).toContain("Observación: hermes");
  });
});
