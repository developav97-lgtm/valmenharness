/**
 * La vista Estándares por estado (FEATURE-WEB-REGLAS-ESTANDARES-20261014: R-VIVO-004 y la
 * parte de Estándares de R-MARCO-006). Se ejecuta la interfaz con el DOM mínimo de
 * `scripts/verificar-interfaz.mjs`. Boceto de referencia:
 * `.valmen/features/rediseno-mission-control/assets/estandares.html`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buscarNodos, disparar, ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";
import type { NodoFalso } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");
const fuente = readFileSync(HTML, "utf8");

/** Un archivo de reglas con la forma que escribe `decideProposal`. */
const ARCHIVO = {
  area: "proceso",
  path: ".valmen/rules/estandares-proceso.md",
  content: [
    "# Estándares de proceso",
    "",
    "Reglas que este proyecto ya decidió.",
    "",
    "## Gateway y avisos por Telegram",
    "",
    "Regla del archivo, ampliada después de aceptarla.",
    "",
    "**Por qué:** Motivo escrito en el archivo.",
    "",
    "## Preguntar al PO con AskUserQuestion por defecto",
    "",
    "Se pregunta con AskUserQuestion.",
    "",
    "**Por qué:** El PO tuvo que pedirlo.",
    "**Visto en:** FEATURE-WEB-VISTA-TEXTO-PREGUNTA-20261008 (2026-10-09)",
    "",
    "## Regla escrita a mano",
    "",
    "Una regla que no pasó por una propuesta.",
    "",
  ].join("\n"),
};

const propuesta = (campos: Record<string, unknown>) => ({
  area: "proceso",
  why: "",
  tickets: [],
  decidedOn: "",
  instruction: "",
  source: { path: ".valmen/estandares-propuestos.md", line: 1 },
  ...campos,
});

const DECIDIDAS = [
  propuesta({
    id: "EST-002",
    title: "Gateway y avisos por Telegram",
    rule: "Regla de la propuesta.",
    why: "Motivo de la propuesta.",
    date: "2026-10-01",
    decidedOn: "2026-10-01",
    instruction: "Slack apagado y avisos por Telegram",
    state: "aceptado",
  }),
  propuesta({
    id: "EST-005",
    title: "Dos bloqueos semánticos iguales no justifican una tercera corrida",
    rule: "No se corre una tercera vez.",
    why: "Gasta llamadas.",
    date: "2026-10-03",
    decidedOn: "2026-10-03",
    instruction: "no la queremos así",
    state: "descartado",
  }),
  propuesta({
    id: "EST-007",
    title: "Preguntar al PO con AskUserQuestion por defecto",
    rule: "Se pregunta con AskUserQuestion.",
    why: "El PO tuvo que pedirlo.",
    date: "2026-10-09",
    decidedOn: "2026-10-09",
    state: "aceptado",
  }),
];

const PENDIENTE = propuesta({
  id: "EST-012",
  title: "Una propuesta nueva",
  rule: "Regla propuesta.",
  why: "Motivo propuesto.",
  tickets: ["FEATURE-WEB-REGLAS-ESTANDARES-20261014"],
  date: "2026-10-14",
  state: "propuesto",
});

/** Todo el texto de un nodo, en orden. */
function texto(nodo: NodoFalso | undefined): string {
  const partes: string[] = [];
  const recorrer = (n: NodoFalso): void => {
    if (n._texto) partes.push(String(n._texto));
    for (const hijo of n.children ?? []) recorrer(hijo);
  };
  if (nodo) recorrer(nodo);
  return partes.join(" ");
}

const conClase = (raiz: NodoFalso | undefined, clase: string): NodoFalso[] =>
  buscarNodos(raiz, (n: NodoFalso) => String(n.className ?? "").split(" ").includes(clase));

/** Abre Estándares con la respuesta dada y registra cada pedido. */
async function abrir(respuesta: unknown) {
  const pedidos: Array<{ ruta: string; metodo: string; cuerpo: string | undefined }> = [];
  const resultado = await ejecutarInterfaz(HTML, {
    hash: "#/estandares",
    respuesta: (ruta: string, init?: RequestInit) => {
      pedidos.push({
        ruta,
        metodo: init?.method ?? "GET",
        cuerpo: typeof init?.body === "string" ? init.body : undefined,
      });
      const url = new URL(ruta, "http://localhost");
      if (url.pathname === "/api/standards") return respuesta;
      if (url.pathname.endsWith("/decision")) return { ok: true, details: "EST-012 aceptado." };
      if (url.pathname === "/api/health") return { root: "/equipo/ValmenHarness" };
      return {};
    },
  });
  const pagina = () => conClase(resultado.contenido, "est")[0];
  const pestanas = () => conClase(pagina(), "est-pestana");
  const filas = () => conClase(pagina(), "est-item");
  const boton = (fila: NodoFalso) => conClase(fila, "est-fila")[0] as NodoFalso;
  const pedidosDe = (pathname: string) =>
    pedidos.filter((p) => new URL(p.ruta, "http://localhost").pathname === pathname);
  return { ...resultado, pedidos, pedidosDe, pagina, pestanas, filas, boton };
}

const sinPendientes = () => abrir({ standards: [ARCHIVO], proposals: DECIDIDAS });
const conPendiente = () => abrir({ standards: [ARCHIVO], proposals: [...DECIDIDAS, PENDIENTE] });

describe("Estándares por estado (R-VIVO-004)", () => {
  it("C1, C2, C4: cabecera, pestañas con cuenta y filas con id, título y fecha", async () => {
    const { fallos, pagina, pestanas, filas } = await sinPendientes();
    expect(fallos).toEqual([]);
    const todo = texto(pagina());
    // C1
    expect(texto(conClase(pagina(), "est-migas")[0])).toMatch(/Reglas\s+· Estándares/);
    expect(texto(conClase(pagina(), "est-titulo")[0])).toBe("Lo que este proyecto ya decidió");
    expect(todo).toContain("Cada regla salió de una corrección.");
    // C2
    expect(conClase(pagina(), "est-pestanas")[0]?.attrs?.role).toBe("tablist");
    expect(pestanas().map((p) => texto(p))).toEqual([
      "En vigor 3",
      "Propuestos 0",
      "Descartados 1",
    ]);
    expect(pestanas().every((p) => p.attrs?.role === "tab")).toBe(true);
    expect(pestanas()[0]?.attrs?.["aria-selected"]).toBe("true");
    // C4: de mayor a menor id, y la sección sin propuesta al final
    const cabeceras = filas().map((f) => texto(conClase(f, "est-fila")[0]));
    expect(cabeceras[0]).toMatch(/^EST-007\s+Preguntar al PO con AskUserQuestion por defecto\s+09 oct/);
    expect(cabeceras[1]).toMatch(/^EST-002\s+Gateway y avisos por Telegram\s+01 oct/);
    expect(cabeceras[2]).toMatch(/^—\s+Regla escrita a mano\s+—/);
    expect(todo).toMatch(/Área:\s+proceso\s+·\s+\.valmen\/rules\/estandares-proceso\.md/);
  });

  it("C5, C6, C7, C10: abrir una fila muestra la regla del archivo, el porqué y la frase literal", async () => {
    const { filas, boton } = await sinPendientes();
    // La primera fila abre al entrar (D-007) y la segunda está cerrada.
    expect(boton(filas()[0] as NodoFalso).attrs?.["aria-expanded"]).toBe("true");
    expect(boton(filas()[1] as NodoFalso).attrs?.["aria-expanded"]).toBe("false");
    await disparar(boton(filas()[1] as NodoFalso), "click");
    const [primera, segunda] = filas() as [NodoFalso, NodoFalso];
    // C5: se abre una sola a la vez
    expect(boton(segunda).attrs?.["aria-expanded"]).toBe("true");
    expect(boton(primera).attrs?.["aria-expanded"]).toBe("false");
    const cuerpo = texto(conClase(segunda, "est-cuerpo")[0]);
    // C6 y C10: la regla en vigor es la del archivo, no la de la propuesta
    expect(cuerpo).toContain("Regla del archivo, ampliada después de aceptarla.");
    expect(cuerpo).not.toContain("Regla de la propuesta.");
    expect(cuerpo).toContain("Motivo escrito en el archivo.");
    // C7
    const cita = conClase(segunda, "est-cita")[0];
    expect(texto(cita)).toContain("Lo aceptaste con estas palabras");
    expect(texto(cita)).toContain("«Slack apagado y avisos por Telegram»");
    // Pulsar la fila abierta la cierra
    await disparar(boton(filas()[1] as NodoFalso), "click");
    expect(boton(filas()[1] as NodoFalso).attrs?.["aria-expanded"]).toBe("false");
    expect(conClase(filas()[1], "est-cuerpo")).toHaveLength(0);
  });

  it("C9: un estándar decidido sin frase lo dice y no cita nada", async () => {
    const { filas } = await sinPendientes();
    const cita = texto(conClase(filas()[0], "est-cita")[0]);
    expect(cita).toContain("Decidido el 09 oct, sin frase registrada.");
    expect(cita).not.toMatch(/[«»]/);
  });

  it("C10: una sección del archivo sin propuesta se lista en vigor con su aviso", async () => {
    const { filas, boton } = await sinPendientes();
    await disparar(boton(filas()[2] as NodoFalso), "click");
    const cuerpo = texto(conClase(filas()[2], "est-cuerpo")[0]);
    expect(cuerpo).toContain("Una regla que no pasó por una propuesta.");
    expect(cuerpo).toContain("Sin decisión registrada en .valmen/estandares-propuestos.md.");
  });

  it("C3, C8: «Descartados» lista solo los descartados con la frase de quien lo decidió", async () => {
    const { pestanas, filas, pagina } = await sinPendientes();
    await disparar(pestanas()[2] as NodoFalso, "click");
    expect(pestanas()[2]?.attrs?.["aria-selected"]).toBe("true");
    expect(pestanas()[0]?.attrs?.["aria-selected"]).toBe("false");
    expect(filas().map((f) => texto(conClase(f, "est-id")[0]))).toEqual(["EST-005"]);
    const cita = texto(conClase(filas()[0], "est-cita")[0]);
    expect(cita).toContain("Lo descartaste con estas palabras");
    expect(cita).toContain("«no la queremos así»");
    expect(texto(pagina())).toContain(".valmen/estandares-propuestos.md");
  });

  it("D-009: «Más detalle» conserva el archivo de reglas completo y el historial de decisiones", async () => {
    const { pagina } = await sinPendientes();
    const mas = conClase(pagina(), "est-mas")[0];
    expect(mas?.tagName).toBe("DETAILS");
    expect(mas?.open).toBe(false);
    const contenido = texto(mas);
    expect(contenido).toContain("Más detalle");
    expect(contenido).toContain("Reglas que este proyecto ya decidió.");
    expect(contenido).toMatch(/EST-005.*descartado.*2026-10-03.*«no la queremos así»/);
    expect(contenido).toMatch(/EST-007.*aceptado.*2026-10-09/);
  });

  it("C11, C12, C13: con una propuesta pendiente abre en «Propuestos» y la decide una persona", async () => {
    const { pestanas, filas, pedidosDe } = await conPendiente();
    // C11
    expect(pestanas()[1]?.attrs?.["aria-selected"]).toBe("true");
    expect(texto(pestanas()[1])).toBe("Propuestos 1");
    expect(conClase(pestanas()[1], "est-cuenta-persona")).toHaveLength(1);
    // C12
    const fila = filas()[0] as NodoFalso;
    expect(texto(conClase(fila, "est-id")[0])).toBe("EST-012");
    const cuerpo = conClase(fila, "est-cuerpo")[0];
    expect(texto(cuerpo)).toContain("Regla propuesta.");
    expect(texto(cuerpo)).toContain("FEATURE-WEB-REGLAS-ESTANDARES-20261014");
    expect(texto(cuerpo)).toContain("También se decide hablando");
    expect(conClase(fila, "est-cita")).toHaveLength(0);
    const botones = buscarNodos(cuerpo, (n: NodoFalso) => n.tagName === "BUTTON");
    expect(botones.map((b) => texto(b))).toEqual(["Aceptar y poner en vigor", "Descartar"]);
    // C13
    await disparar(botones[0] as NodoFalso, "click");
    const escrituras = pedidosDe("/api/standards/EST-012/decision");
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0]?.metodo).toBe("POST");
    expect(JSON.parse(escrituras[0]?.cuerpo ?? "null")).toEqual({ decision: "aceptado" });
  });

  it("C14: recorrer pestañas y filas solo hace GET", async () => {
    const { pestanas, filas, boton, pedidos } = await conPendiente();
    for (let i = 0; i < 3; i += 1) {
      await disparar(pestanas()[i] as NodoFalso, "click");
      for (let j = 0; j < filas().length; j += 1) await disparar(boton(filas()[j] as NodoFalso), "click");
    }
    expect(pedidos.length).toBeGreaterThan(0);
    expect(pedidos.every((p) => p.metodo === "GET")).toBe(true);
  });

  it("C15: una respuesta sin `standards` se pinta sin fallos", async () => {
    const { fallos, pagina, pestanas } = await abrir({ proposals: [] });
    expect(fallos).toEqual([]);
    expect(texto(pagina())).toContain("Lo que este proyecto ya decidió");
    expect(pestanas().map((p) => texto(p))).toEqual(["En vigor 0", "Propuestos 0", "Descartados 0"]);
    expect(texto(pagina())).toContain("Todavía no hay estándares escritos.");
  });
});

describe("Estándares en el celular (R-MARCO-006)", () => {
  it("C18: la fila tiene una regla @media (max-width: 640px) que la reacomoda", () => {
    const i = fuente.indexOf("@media (max-width: 640px) {\n        .est-fila");
    expect(i).toBeGreaterThan(-1);
    expect(fuente.slice(i, fuente.indexOf("}", i))).toMatch(/grid-template-columns/);
  });
});
