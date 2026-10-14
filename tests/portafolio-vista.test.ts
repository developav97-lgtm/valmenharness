/**
 * La vista Portafolio por tarjetas (FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014: R-TRA-004 y la
 * parte de Portafolio de R-MARCO-006). Se ejecuta la interfaz con el DOM mínimo de
 * `scripts/verificar-interfaz.mjs`. Boceto de referencia:
 * `.valmen/features/rediseno-mission-control/assets/portafolio.html`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buscarNodos, disparar, ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";
import type { NodoFalso } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");
const fuente = readFileSync(HTML, "utf8");

const fuentes = (disponible: boolean, motivo: string | null = null) => ({
  machine: { label: "laboratorio", available: disponible, reason: motivo },
  registry: {
    label: "Registro local",
    available: disponible,
    reason: disponible ? null : "No disponible porque la máquina no pudo validar el binding.",
  },
});

const PORTAFOLIO = {
  available: true,
  reason: null,
  range: { desde: "2026-10-08", hasta: "2026-10-14" },
  summary: {
    projects: 3,
    available: 2,
    unavailable: 1,
    gatesPending: 1,
    correctionsPending: 0,
    waiting: 0,
    evaluations: 6,
    costUsd: 4.12,
  },
  projects: [
    {
      projectId: "valmen-harness",
      name: "ValmenHarness",
      root: "/equipo/ValmenHarness",
      current: true,
      available: true,
      reason: null,
      sources: fuentes(true),
      gatesPending: 1,
      correctionsPending: 0,
      waiting: 0,
      usage: { costUsd: 2.87, evaluations: 4, unreadable: 0 },
      decisionsPending: 3,
      agentsWorking: 2,
      profile: "claude-code-completo",
      profileError: null,
    },
    {
      projectId: "saiopencloud",
      name: "SaiOpenCloud",
      root: "/equipo/SaiOpenCloud",
      current: false,
      available: true,
      reason: null,
      sources: fuentes(true),
      gatesPending: 0,
      correctionsPending: 0,
      waiting: 0,
      usage: { costUsd: 1.25, evaluations: 2, unreadable: 0 },
      decisionsPending: 1,
      agentsWorking: 1,
      profile: null,
      profileError: null,
    },
    {
      projectId: "remoto",
      name: "remoto",
      root: "/equipo/remoto",
      current: false,
      available: false,
      reason: "La máquina no responde.",
      sources: fuentes(false, "La máquina no responde."),
      gatesPending: null,
      correctionsPending: null,
      waiting: null,
      usage: null,
      decisionsPending: null,
      agentsWorking: null,
      profile: null,
      profileError: null,
    },
  ],
};

/** Todo el texto de un nodo, en orden. */
function texto(nodo: NodoFalso): string {
  const partes: string[] = [];
  const recorrer = (n: NodoFalso): void => {
    if (n._texto) partes.push(String(n._texto));
    for (const hijo of n.children ?? []) recorrer(hijo);
  };
  recorrer(nodo);
  return partes.join(" ");
}

const conClase = (raiz: NodoFalso, clase: string): NodoFalso[] =>
  buscarNodos(raiz, (n: NodoFalso) => String(n.className ?? "").split(" ").includes(clase));

/** Abre Portafolio y registra cada pedido con su método. */
async function abrir(almacen: Record<string, string> = {}) {
  const pedidos: Array<{ ruta: string; metodo: string }> = [];
  const resultado = await ejecutarInterfaz(HTML, {
    hash: "#/portafolio",
    localStorage: almacen,
    respuesta: (ruta: string, init?: RequestInit) => {
      pedidos.push({ ruta, metodo: init?.method ?? "GET" });
      const url = new URL(ruta, "http://localhost");
      if (url.pathname === "/api/portafolio") return PORTAFOLIO;
      if (url.pathname === "/api/health") return { root: "/equipo/ValmenHarness" };
      return {};
    },
  });
  const pedidosDePortafolio = () =>
    pedidos.filter((p) => new URL(p.ruta, "http://localhost").pathname === "/api/portafolio");
  return { ...resultado, pedidos, pedidosDePortafolio };
}

/** `AAAA-MM-DD` local de hoy menos `dias`. */
function dia(dias = 0): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  const dos = (n: number): string => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

describe("Portafolio por tarjetas (R-TRA-004)", () => {
  it("pinta cabecera, cifras, tarjetas, acciones y el aviso de totales parciales", async () => {
    const { contenido, fallos } = await abrir();
    expect(fallos).toEqual([]);
    const todo = texto(contenido);
    // C6
    expect(todo).toContain("Todos tus proyectos de un vistazo");
    expect(todo).toContain("Solo lectura. Para trabajar en uno, ábrelo: el menú cambia a ese proyecto.");
    // C7
    const cifras = conClase(contenido, "port-cifra").map(texto);
    expect(cifras).toEqual([
      expect.stringMatching(/2\s+de 3.*proyectos disponibles/),
      expect.stringMatching(/4.*esperan tu decisión/),
      expect.stringMatching(/3.*agentes trabajando/),
      expect.stringMatching(/US\$ 4,12.*consumo del rango/),
    ]);
    // C9
    const tarjetas = conClase(contenido, "port-tarjeta");
    expect(tarjetas).toHaveLength(3);
    const [harness, sai, remoto] = tarjetas.map(texto) as [string, string, string];
    for (const parte of [
      "ValmenHarness",
      "valmen-harness · /equipo/ValmenHarness",
      "Máquina",
      "Registro local",
      "perfil claude-code-completo",
      "esperan tu decisión",
      "agentes",
      "US$ 2,87",
      "consumo",
    ])
      expect(harness).toContain(parte);
    expect(sai).toContain("sin perfil");
    // C10 y C11
    expect(harness).toContain("abierto ahora");
    expect(harness).toContain("Ir al inicio del proyecto");
    expect(sai).not.toContain("abierto ahora");
    expect(sai).toContain("Abrir este proyecto");
    // C13
    expect(remoto).toContain("La máquina no responde.");
    expect(remoto).not.toContain("Abrir este proyecto");
    expect(conClase(tarjetas[2] as NodoFalso, "port-caida").length).toBeGreaterThan(0);
    // C14
    expect(todo).toContain("Totales parciales: hay proyectos no disponibles.");
  });

  it("marca como abierto el proyecto elegido en el menú", async () => {
    const { contenido } = await abrir({ "valmen.project": "saiopencloud" });
    const [harness, sai] = conClase(contenido, "port-tarjeta").map(texto) as [string, string];
    expect(sai).toContain("abierto ahora");
    expect(sai).toContain("Ir al inicio del proyecto");
    expect(harness).toContain("Abrir este proyecto");
  });

  it("C12: «Abrir este proyecto» lleva al Inicio de ese proyecto y lo elige en el menú", async () => {
    const { contenido } = await abrir();
    const boton = buscarNodos(
      conClase(contenido, "port-tarjeta")[1] as NodoFalso,
      (n: NodoFalso) => n.tagName === "BUTTON",
    )[0] as NodoFalso;
    expect(texto(boton)).toBe("Abrir este proyecto");
    await disparar(boton, "click");
    expect(globalThis.localStorage.getItem("valmen.project")).toBe("saiopencloud");
    expect(globalThis.location.hash).toBe("#/inicio");
  });

  it("C8 y C19: el rango vuelve a pedir el portafolio con sus fechas, siempre con GET", async () => {
    const { contenido, pedidos, pedidosDePortafolio } = await abrir();
    const primero = new URL(pedidosDePortafolio().at(-1)?.ruta ?? "", "http://localhost");
    expect(primero.searchParams.get("desde")).toBe(dia(6));
    expect(primero.searchParams.get("hasta")).toBe(dia(0));
    const selector = conClase(contenido, "port-rango")[0] as NodoFalso;
    expect(buscarNodos(selector, (n: NodoFalso) => n._texto === "Todo")).toHaveLength(1);
    selector.value = "todo";
    await disparar(selector, "change");
    const ultimo = new URL(pedidosDePortafolio().at(-1)?.ruta ?? "", "http://localhost");
    expect(ultimo.searchParams.get("desde")).toBe("2000-01-01");
    expect(ultimo.searchParams.get("hasta")).toBe(dia(0));
    expect(pedidos.every((p) => p.metodo === "GET")).toBe(true);
  });
});

describe("Portafolio en el celular (R-MARCO-006)", () => {
  it("C16: las rejillas de cifras y de tarjetas acotan sus columnas con min(100%, …)", () => {
    for (const selector of [".port-cifras", ".port-tarjetas"]) {
      const i = fuente.indexOf(`${selector} {`);
      expect(i, selector).toBeGreaterThan(-1);
      expect(fuente.slice(i, fuente.indexOf("}", i))).toMatch(/minmax\(min\(100%, \d+px\), 1fr\)/);
    }
  });
});
