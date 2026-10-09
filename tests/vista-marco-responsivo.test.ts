/**
 * El marco responsivo de la vista Agentes (IMPROVEMENT-WEB-VISTA-MARCO-RESPONSIVO-20261008):
 * ritmo del bucle con movimiento reducido, reglas CSS del marco y contenedor de paneles.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";
import { INTERVALO_REDUCIDO_MS, crearMontaje } from "../packages/server/web/agentes/montaje.js";
import { MUNDOS } from "../packages/server/web/agentes/mundos/index.js";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");
const fuente = readFileSync(HTML, "utf8");
const PROYECTO = "valmen-harness";

/** El cuerpo de la primera regla CSS cuyo selector contiene `selector` (sin anidar). */
function regla(selector: string, desde = 0): string {
  const i = fuente.indexOf(`${selector} {`, desde);
  expect(i, `regla ${selector}`).toBeGreaterThan(-1);
  return fuente.slice(i, fuente.indexOf("}", i));
}

function banco(reducir: () => boolean) {
  let reloj = 1_000_000;
  let siguiente = 1;
  const pendientes = new Map<number, () => void>();
  let dibujos = 0;
  const mundo = { ...MUNDOS[0], dibujar: () => void (dibujos += 1) };
  const montaje = crearMontaje({
    mundos: [mundo],
    almacen: null,
    visible: () => true,
    ahora: () => reloj,
    reducirMovimiento: reducir,
    pedirCuadro: (f: () => void) => {
      const id = siguiente++;
      pendientes.set(id, f);
      return id;
    },
    cancelarCuadro: (id: number) => void pendientes.delete(id),
  } as never);
  const lienzo = { getContext: () => ({}) };
  montaje.montar(lienzo, [], reloj);
  return {
    montaje,
    dibujos: () => dibujos,
    /** Avanza el reloj `ms` y ejecuta el cuadro pendiente. */
    cuadro(ms: number) {
      reloj += ms;
      const [id, f] = [...pendientes][0] ?? [];
      if (id === undefined || f === undefined) return;
      pendientes.delete(id);
      f();
    },
  };
}

describe("el bucle con movimiento reducido", () => {
  it("C1: dibuja como máximo un cuadro cada 250 ms", () => {
    const b = banco(() => true);
    // Un segundo de cuadros a ~60 por segundo (17 ms cada uno).
    for (let t = 0; t < 1000; t += 17) b.cuadro(17);
    expect(INTERVALO_REDUCIDO_MS).toBe(250);
    expect(b.dibujos()).toBeLessThanOrEqual(4);
    expect(b.dibujos()).toBeGreaterThanOrEqual(3);
  });

  it("C2: un segundo de cuadros avanza un segundo el tiempo de la escena", () => {
    const b = banco(() => true);
    for (let t = 0; t < 1020; t += 17) b.cuadro(17);
    // 60 cuadros de 17 ms = 1020 ms; el último cuadro dibujado queda a ≤ 250 ms del final.
    const t = b.montaje.escena().t;
    expect(t).toBeGreaterThan(0.75);
    expect(t).toBeLessThanOrEqual(1.02);
    // Y nunca un salto mayor que el acotado: cuatro cuadros de 250 ms suman exactamente un segundo.
    const c = banco(() => true);
    for (let i = 0; i < 4; i++) c.cuadro(250);
    expect(c.montaje.escena().t).toBeCloseTo(1, 6);
  });

  it("C3: sin la preferencia dibuja en cada cuadro pedido", () => {
    const b = banco(() => false);
    for (let i = 0; i < 20; i++) b.cuadro(17);
    expect(b.dibujos()).toBe(20);
  });

  it("C1: la preferencia se lee en cada cuadro, sin recargar", () => {
    let reducir = false;
    const b = banco(() => reducir);
    b.cuadro(17);
    b.cuadro(17);
    expect(b.dibujos()).toBe(2);
    reducir = true;
    b.cuadro(17);
    expect(b.dibujos()).toBe(2);
  });
});

describe("el marco de la vista (lectura de index.html)", () => {
  it("C4: la vista pasa a crearMontaje una función que consulta prefers-reduced-motion", () => {
    expect(fuente).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(fuente).toMatch(/reducirMovimiento: \(\) => consulta\?\.matches === true/);
  });

  it("C5: .corrida-lienzo declara image-rendering: pixelated", () => {
    expect(regla(".corrida-lienzo")).toContain("image-rendering: pixelated");
  });

  it("C6: las miniaturas del selector de mundo declaran image-rendering: pixelated", () => {
    expect(regla(".corrida-mundo canvas")).toContain("image-rendering: pixelated");
  });

  it("C7: el aviso de pregunta pendiente usa las variables de alerta del tema", () => {
    const r = regla(".corrida-aviso.pendiente");
    expect(r).toContain("var(--alerta-suave)");
    expect(r).toContain("var(--alerta)");
    expect(r).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it("C8: el aviso «una persona respondió» usa las variables ok del tema", () => {
    const r = regla(".corrida-aviso.respondio");
    expect(r).toContain("var(--ok-suave)");
    expect(r).toContain("var(--ok)");
    expect(r).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it("C10: desde 700 px, .corrida-paneles reparte los paneles en dos columnas", () => {
    const i = fuente.indexOf("@media (min-width: 700px)");
    expect(i).toBeGreaterThan(-1);
    const bloque = fuente.slice(i, i + 200);
    expect(bloque).toContain(".corrida-paneles");
    expect(bloque).toContain("repeat(2, minmax(0, 1fr))");
  });

  it("C11: por debajo de 700 px, .corrida-paneles pone los paneles en una columna", () => {
    const base = regla(".corrida-paneles");
    expect(base).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(base).not.toContain("repeat(2");
    expect(regla(".corrida-panel")).toContain("min-width: 0");
  });
});

describe("el contenedor de paneles (vista ejecutada)", () => {
  type Nodo = { tagName?: string; _texto?: string; className?: string; children: Nodo[] };
  const buscar = (n: Nodo, p: (x: Nodo) => boolean): Nodo[] => [
    ...(p(n) ? [n] : []),
    ...n.children.flatMap((h) => buscar(h, p)),
  ];
  const texto = (n: Nodo): string => [n._texto ?? "", ...n.children.map(texto)].join(" ");

  it("C9: «Agentes vivos», «Cola» y «Entregados» se pintan dentro de .corrida-paneles", async () => {
    const { contenido, fallos } = await ejecutarInterfaz(HTML, {
      hash: "#/agentes",
      localStorage: { "valmen.project": PROYECTO },
      respuesta: (ruta: string) => {
        const url = new URL(ruta, "http://localhost");
        if (url.pathname === "/api/health") return { root: RAIZ };
        if (url.pathname === "/api/portafolio") return { projects: [{ projectId: PROYECTO, name: "Harness", available: true }] };
        if (url.pathname === "/api/corrida/agentes") return { agentes: [{
          agente: "a1", ticket: "FEATURE-UNO-20261008", descripcion: "Trabajo", modelo: "m", esfuerzo: "high",
          rama: null, carpeta: null, ultimaHerramienta: "Edit", ultimaHerramientaEn: new Date().toISOString(),
          estado: "trabajando", ticketEstado: null, faseConfirmada: null, faseInferida: "implementando",
        }] };
        if (url.pathname === "/api/journeys") return { authorization: { observationSources: [], dispatchExecutors: [] }, journeys: [{
          journeyId: "JOR-1", revisionId: "rev-01", receivedAt: "2026-10-08T08:00:00.000Z",
          passes: { last: null, cadenceMs: null, next: null },
          tickets: [{
            order: 1, ticketId: "FEATURE-UNO-20261008", actualAt: null, scheduledAt: null, condition: "manual",
            activity: "unknown", phase: "waiting", stopReason: null, durationMs: null, waitingFor: [],
            dependsOn: [], window: null, lastReceivedAt: null,
          }],
        }] };
        if (url.pathname === "/api/tickets") return { tickets: [] };
        return {};
      },
    });
    expect(fallos).toEqual([]);
    const raiz = contenido as Nodo;
    const contenedores = buscar(raiz, (n) => (n.className ?? "").split(" ").includes("corrida-paneles"));
    expect(contenedores).toHaveLength(1);
    const paneles = contenedores[0]!.children.filter((n) => (n.className ?? "").split(" ").includes("corrida-panel"));
    expect(paneles).toHaveLength(3);
    const encabezados = paneles.map((p) => buscar(p, (n) => n.tagName === "H3").map(texto)[0]);
    expect(encabezados).toEqual(["Agentes vivos", "Cola", "Entregados"]);
  });
});
