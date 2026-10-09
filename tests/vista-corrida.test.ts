import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { disparar, ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");
const PROYECTO = "valmen-harness";

type Nodo = {
  tagName?: string;
  _texto?: string;
  className?: string;
  value?: string;
  children: Nodo[];
};

const temporales: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const t of temporales.splice(0)) rmSync(t, { recursive: true, force: true });
});

function esperarTurnos(turnos = 10) {
  return Promise.all(Array.from({ length: turnos }, () => new Promise<void>((resolve) => setImmediate(resolve))));
}

function textoDe(nodo: Nodo | undefined): string {
  if (nodo === undefined) return "";
  return [nodo._texto ?? "", ...nodo.children.map(textoDe)].filter((p) => p !== "").join(" | ");
}

function buscar(nodo: Nodo | undefined, prueba: (n: Nodo) => boolean): Nodo[] {
  if (nodo === undefined) return [];
  return [...(prueba(nodo) ? [nodo] : []), ...nodo.children.flatMap((hijo) => buscar(hijo, prueba))];
}

const AHORA = new Date().toISOString();

function agente(id: string, ticket: string | null, estado: string, extra: Record<string, unknown> = {}) {
  return {
    agente: id, ticket, descripcion: `Trabajo de ${ticket}`, modelo: "claude-sonnet-5-5", esfuerzo: "high",
    rama: null, carpeta: null, ultimaHerramienta: "Edit", ultimaHerramientaEn: AHORA, estado,
    ticketEstado: null, faseConfirmada: null, faseInferida: "implementando", ...extra,
  };
}

function fila(ticketId: string, order: number, dependsOn: string[] = [], phase = "waiting") {
  return {
    order, ticketId, actualAt: null, scheduledAt: null, condition: "manual", activity: "unknown",
    phase, stopReason: null, durationMs: null, waitingFor: [], dependsOn, window: null, lastReceivedAt: null,
  };
}

function registro(id: string, workflowStatus: string) {
  return { id, title: id, workflowStatus, qaStatus: "pending", releaseStatus: "unreleased" };
}

const AGENTES = {
  agentes: [
    agente("a1", "FEATURE-UNO-20261008", "trabajando", { faseConfirmada: "implementing" }),
    agente("a2", "FEATURE-DOS-20261008", "esperando"),
    agente("a3", "FEATURE-FIN-20261008", "termino"),
  ],
};
const JORNADAS = {
  authorization: { observationSources: [], dispatchExecutors: [] },
  journeys: [{
    journeyId: "JOR-1", revisionId: "rev-01", receivedAt: "2026-10-08T08:00:00.000Z",
    passes: { last: null, cadenceMs: null, next: null },
    tickets: [
      fila("FEATURE-UNO-20261008", 1), fila("FEATURE-DOS-20261008", 2),
      fila("FEATURE-TRES-20261008", 3, ["FEATURE-UNO-20261008"]),
      fila("FEATURE-CUATRO-20261008", 4, ["FEATURE-TRES-20261008"]),
      fila("FEATURE-CINCO-20261008", 5),
      fila("FEATURE-FIN-20261008", 6, [], "delivered"),
    ],
  }],
};
const TICKETS = {
  tickets: [
    registro("FEATURE-UNO-20261008", "in_progress"), registro("FEATURE-DOS-20261008", "in_progress"),
    registro("FEATURE-TRES-20261008", "approved"), registro("FEATURE-CUATRO-20261008", "planned"),
    registro("FEATURE-CINCO-20261008", "approved"), registro("FEATURE-FIN-20261008", "awaiting_user_tests"),
    registro("FEATURE-LISTO-20261008", "closed"),
  ],
};

interface Opciones {
  hash?: string;
  agentes?: unknown;
  jornadas?: unknown;
  tickets?: unknown;
  localStorage?: Record<string, string>;
}

async function abrir(o: Opciones = {}, llamadas: { metodo: string; ruta: string }[] = []) {
  const resultado = await ejecutarInterfaz(HTML, {
    hash: o.hash ?? "#/corrida",
    localStorage: { "valmen.project": PROYECTO, ...(o.localStorage ?? {}) },
    respuesta: (ruta: string, init?: RequestInit) => {
      llamadas.push({ metodo: init?.method ?? "GET", ruta });
      const url = new URL(ruta, "http://localhost");
      if (url.pathname === "/api/health") return { root: RAIZ };
      if (url.pathname === "/api/portafolio") return { projects: [{ projectId: PROYECTO, name: "Harness", available: true }] };
      if (url.pathname === "/api/corrida/agentes") {
        const valor = o.agentes ?? AGENTES;
        if (valor instanceof Error) throw valor;
        return valor;
      }
      if (url.pathname === "/api/journeys") return o.jornadas ?? JORNADAS;
      if (url.pathname === "/api/tickets") return o.tickets ?? TICKETS;
      return {};
    },
  });
  expect(resultado.fallos).toEqual([]);
  return resultado;
}

describe("la vista Agentes", () => {
  it("el menú lleva «Agentes» a #/agentes y ya no «Corrida» ni «Jornadas» (C1)", () => {
    const html = readFileSync(HTML, "utf8");
    expect(html).toMatch(/<a href="#\/agentes" data-vista="agentes">.*Agentes<\/a>/);
    expect(html).not.toContain('data-vista="corrida"');
    expect(html).not.toContain('data-vista="jornadas"');
  });

  it("#/agentes y los alias #/corrida y #/jornadas pintan la misma vista, con el enlace marcado (C2-C7)", async () => {
    for (const hash of ["#/agentes", "#/corrida", "#/jornadas"]) {
      const dir = mkdtempSync(join(tmpdir(), "valmen-agentes-"));
      temporales.push(dir);
      const html = join(dir, "index.html");
      writeFileSync(
        html,
        readFileSync(HTML, "utf8").replace(
          '<script type="module">',
          `<script type="module">
          globalThis.__enlaces = ["tickets", "agentes", "features"].map((v) => { const a = document.createElement("a"); a.dataset.vista = v; return a; });
          document.querySelectorAll = (s) => (s === "nav a" ? globalThis.__enlaces : []);
`,
        ),
      );
      const { contenido } = await ejecutarInterfaz(html, {
        hash,
        localStorage: { "valmen.project": PROYECTO },
        respuesta: (ruta: string) => {
          const url = new URL(ruta, "http://localhost");
          if (url.pathname === "/api/health") return { root: RAIZ };
          if (url.pathname === "/api/portafolio") return { projects: [{ projectId: PROYECTO, name: "Harness", available: true }] };
          if (url.pathname === "/api/corrida/agentes") return AGENTES;
          if (url.pathname === "/api/journeys") return JORNADAS;
          if (url.pathname === "/api/tickets") return TICKETS;
          return {};
        },
      });
      const g = globalThis as typeof globalThis & {
        __enlaces: { dataset: { vista: string }; getAttribute: (k: string) => string | null }[];
        document: { getElementById: (id: string) => Nodo };
      };
      const h2 = buscar(contenido as Nodo, (n) => n.tagName === "H2").map(textoDe);
      expect(h2).toContain("Agentes");
      expect(textoDe(contenido as Nodo)).toContain("Agentes vivos");
      expect(textoDe(g.document.getElementById("titulo-vista"))).toBe("Agentes");
      const marcados = g.__enlaces.filter((e) => e.getAttribute("aria-current") === "page");
      expect(marcados.map((e) => e.dataset.vista)).toEqual(["agentes"]);
    }
  });

  it("consulta agentes, jornada y tickets (C4)", async () => {
    const llamadas: { metodo: string; ruta: string }[] = [];
    await abrir({}, llamadas);
    const rutas = llamadas.map((l) => l.ruta);
    expect(rutas).toContain("/api/corrida/agentes");
    expect(rutas).toContain("/api/journeys");
    expect(rutas).toContain("/api/tickets");
  });

  it("muestra los seis KPI con su rótulo y su valor (C5, C6)", async () => {
    const { contenido } = await abrir();
    const tarjetas = buscar(contenido as Nodo, (n) => n.className === "tarjeta");
    const kpi = Object.fromEntries(tarjetas.map((t) => [t.children[1]!._texto, t.children[0]!._texto]));
    expect(kpi).toEqual({
      entregados: "1",
      cerrados: "0",
      "esperan al PO": "2",
      trabajando: "1",
      "en cola": "3",
      "aprobaciones pendientes": "1",
    });
  });

  it("una fila por agente vivo, sin el que terminó (C7, C8)", async () => {
    const { contenido } = await abrir();
    const filas = buscar(contenido as Nodo, (n) => n.tagName === "TR" && n.children.some((c) => c.tagName === "TD"))
      .filter((tr) => textoDe(tr).includes("claude-sonnet-5-5"));
    expect(filas).toHaveLength(2);
    const primera = textoDe(filas[0]);
    expect(primera).toContain("FEATURE-UNO-20261008");
    expect(primera).toContain("Edit");
    expect(primera).toContain("claude-sonnet-5-5 · high");
    expect(primera).toContain("hace");
    const texto = textoDe(contenido as Nodo);
    expect(texto).not.toContain("Trabajo de FEATURE-FIN-20261008");
  });

  it("la fase inferida se rotula y la confirmada no (C9)", async () => {
    const { contenido } = await abrir();
    const filas = buscar(contenido as Nodo, (n) => n.tagName === "TR" && textoDe(n).includes("claude-sonnet-5-5"));
    expect(textoDe(filas[0])).toContain("implementing");
    expect(textoDe(filas[0])).not.toContain("inferida");
    expect(textoDe(filas[1])).toContain("implementando | inferida");
  });

  it("la cola se agrupa por ola y dice a qué espera cada ticket (C10)", async () => {
    const { contenido } = await abrir();
    const olas = buscar(contenido as Nodo, (n) => n.className === "corrida-ola").map(textoDe);
    expect(olas).toHaveLength(3);
    expect(olas[0]).toContain("Ola 1");
    expect(olas[0]).toContain("FEATURE-CINCO-20261008");
    expect(olas[0]).toContain("sin espera");
    expect(olas[1]).toContain("Ola 2");
    expect(olas[1]).toContain("FEATURE-TRES-20261008 | espera a FEATURE-UNO-20261008");
    expect(olas[2]).toContain("Ola 3");
    expect(olas[2]).toContain("FEATURE-CUATRO-20261008 | espera a FEATURE-TRES-20261008");
  });

  it("los entregados llevan su estado del registro (C11)", async () => {
    const { contenido } = await abrir();
    const texto = textoDe(contenido as Nodo);
    expect(texto).toContain("Entregados");
    expect(texto).toContain("FEATURE-FIN-20261008 | awaiting_user_tests");
  });

  it("el selector arranca en 3, guarda la preferencia y no escribe en el servidor (C12, C13, C14)", async () => {
    const llamadas: { metodo: string; ruta: string }[] = [];
    const { contenido } = await abrir({}, llamadas);
    const selector = buscar(contenido as Nodo, (n) => n.tagName === "SELECT")[0]!;
    expect(selector.value).toBe("3");
    expect(textoDe(contenido as Nodo)).toContain("2 de 3 agentes");
    const antes = llamadas.length;
    selector.value = "5";
    await disparar(selector as never, "change");
    expect(globalThis.localStorage.getItem("valmen.corrida.simultaneos")).toBe("5");
    expect(textoDe(contenido as Nodo)).toContain("2 de 5 agentes");
    expect(llamadas.slice(antes)).toEqual([]);
    expect(llamadas.filter((l) => l.metodo !== "GET")).toEqual([]);
  });

  it("respeta la preferencia guardada (C12)", async () => {
    const { contenido } = await abrir({ localStorage: { "valmen.corrida.simultaneos": "6" } });
    expect(textoDe(contenido as Nodo)).toContain("2 de 6 agentes");
  });

  it("una descripción con marcado HTML se pinta como texto (C15)", async () => {
    const marcado = '<img src=x onerror="alert(1)"><b>negrita</b>';
    const { contenido } = await abrir({
      agentes: { agentes: [agente("a1", "FEATURE-UNO-20261008", "trabajando", { descripcion: marcado })] },
    });
    expect(textoDe(contenido as Nodo)).toContain(marcado);
    expect(buscar(contenido as Nodo, (n) => n.tagName === "IMG" || n.tagName === "B")).toEqual([]);
  });

  it("si falla /api/corrida/agentes, pinta cola y entregados con un aviso (C16)", async () => {
    const { contenido } = await abrir({ agentes: new Error("sin transcripts") });
    const texto = textoDe(contenido as Nodo);
    expect(texto).toContain("No se pudo leer la actividad de los agentes");
    expect(texto).toContain("Ola 1");
    expect(texto).toContain("FEATURE-FIN-20261008 | awaiting_user_tests");
    expect(texto).not.toContain("No se pudo cargar la vista");
  });

  it("una respuesta tardía tras salir de la vista no pinta nada (C17)", async () => {
    let resolver: ((valor: unknown) => void) | undefined;
    const pendiente = new Promise((resolve) => {
      resolver = resolve;
    });
    const resultado = await ejecutarInterfaz(HTML, {
      hash: "#/corrida",
      localStorage: { "valmen.project": PROYECTO },
      respuesta: (ruta: string) => {
        const url = new URL(ruta, "http://localhost");
        if (url.pathname === "/api/health") return { root: RAIZ };
        if (url.pathname === "/api/portafolio") return { projects: [{ projectId: PROYECTO, name: "Harness", available: true }] };
        if (url.pathname === "/api/corrida/agentes") return pendiente;
        if (url.pathname === "/api/journeys") return JORNADAS;
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
    resolver!({ agentes: [agente("tarde", "FEATURE-TARDE-20261008", "trabajando")] });
    await esperarTurnos();
    expect(textoDe(resultado.contenido as Nodo)).not.toContain("FEATURE-TARDE-20261008");
  });

  it("sin jornada ni agentes dice que no hay corrida (C18)", async () => {
    const { contenido } = await abrir({
      agentes: { agentes: [] },
      jornadas: { authorization: { observationSources: [], dispatchExecutors: [] }, journeys: [] },
      tickets: { tickets: [] },
    });
    const texto = textoDe(contenido as Nodo);
    expect(texto).toContain("No hay corrida en marcha");
    expect(buscar(contenido as Nodo, (n) => n.className === "tarjetas")).toEqual([]);
  });

  it("repinta cada 5 s mientras está abierta —también en #/agentes— y deja de hacerlo al salir (C8, C19, C20)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "valmen-corrida-"));
    temporales.push(dir);
    const html = join(dir, "index.html");
    writeFileSync(
      html,
      readFileSync(HTML, "utf8").replace('<script type="module">', '<script type="module">\n          document.visibilityState = "visible"; document.activeElement = null;\n'),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const llamadas: string[] = [];
    const resultado = await ejecutarInterfaz(html, {
      hash: "#/agentes",
      localStorage: { "valmen.project": PROYECTO },
      respuesta: (ruta: string) => {
        llamadas.push(ruta);
        const url = new URL(ruta, "http://localhost");
        if (url.pathname === "/api/health") return { root: RAIZ };
        if (url.pathname === "/api/portafolio") return { projects: [{ projectId: PROYECTO, name: "Harness", available: true }] };
        if (url.pathname === "/api/corrida/agentes") return AGENTES;
        if (url.pathname === "/api/journeys") return JORNADAS;
        if (url.pathname === "/api/tickets") return TICKETS;
        return {};
      },
    });
    const cuenta = () => llamadas.filter((r) => r === "/api/corrida/agentes").length;
    expect(cuenta()).toBe(1);
    await vi.advanceTimersByTimeAsync(4_900);
    await esperarTurnos();
    expect(cuenta()).toBe(1);
    await vi.advanceTimersByTimeAsync(200);
    await esperarTurnos(30);
    expect(cuenta()).toBe(2);

    const navegador = globalThis as typeof globalThis & {
      location: { hash: string };
      window: { dispatchEvent: (evento: { type: string }) => void };
    };
    navegador.location.hash = "#/tickets";
    navegador.window.dispatchEvent({ type: "hashchange" });
    await esperarTurnos(30);
    await vi.advanceTimersByTimeAsync(20_000);
    await esperarTurnos(30);
    expect(cuenta()).toBe(2);
    expect(resultado.fallos).toEqual([]);
  });
});
