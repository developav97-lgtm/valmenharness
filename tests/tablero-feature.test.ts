/**
 * El tablero de una feature.
 *
 * Se ejecuta la **interfaz de verdad** —el módulo que va al navegador— con la
 * vista de una feature y un grafo de mentira, y se afirma lo que queda pintado.
 * Es la misma razón por la que existe `interfaz-ejecutable.test.ts`: un tablero
 * que compila y no se ejecuta puede llegar al navegador de quien lo usa sin que
 * ninguna prueba se entere.
 *
 * Lo que se afirma es lo que el tablero tiene que decir y una cosa más que no es
 * de la pantalla sino del trabajo: **cuál se puede empezar**. Un ticket que espera
 * a otro que no está cerrado lo dice, y el que no espera a nadie también: es la
 * pregunta que se hace alguien antes de ponerse a trabajar.
 */
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ejecutarInterfaz, type NodoFalso } from "../scripts/verificar-interfaz.mjs";

const HTML = join(import.meta.dirname, "..", "packages", "server", "web", "index.html");

/** Un ticket del grafo, con lo que la vista necesita. */
function enElGrafo(
  id: string,
  title: string,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return { id, title, dependsOn: [], exists: false, state: null, ...extras };
}

/** El grafo de trabajo: uno escrito y en curso, otro esperando, y uno sin crear. */
const GRAFO = [
  {
    id: "S1",
    goal: "Modelo y API",
    tickets: [
      enElGrafo("FEATURE-INVENTARIO-MODELO-20260924", "Modelo de datos", {
        exists: true,
        state: "closed",
      }),
      enElGrafo("FEATURE-INVENTARIO-API-20260924", "API de consulta", {
        exists: true,
        state: "in_progress",
        dependsOn: ["FEATURE-INVENTARIO-MODELO-20260924"],
      }),
    ],
  },
  {
    id: "S2",
    goal: "Exportación",
    tickets: [
      enElGrafo("FEATURE-INVENTARIO-EXPORT-20260924", "Exportar a PDF", {
        dependsOn: ["FEATURE-INVENTARIO-API-20260924"],
      }),
    ],
  },
];

/** La feature que la vista va a pedir. */
const FEATURE = {
  id: "kardex",
  title: "Kardex de inventario",
  state: "decomposed",
  created: "2026-09-24",
  updated: "2026-09-24",
  path: ".valmen/features/kardex/feature.md",
  invalid: null,
  hasSpec: true,
  hasDesign: true,
  hasDecomposition: true,
  hasVerify: false,
  requirements: 2,
  tickets: 3,
  closedTickets: 1,
  gaps: 0,
  transitions: ["in_progress"],
  brief: "# Kardex\n",
  specs: [],
  design: null,
  ticketsYaml: "feature: kardex\n",
  decomposition: { origin: null, sprints: GRAFO, requirements: [], gaps: [] },
  decompositionError: null,
  cycles: [],
};

/** Las respuestas que la vista de una feature necesita. */
function respuestas(ruta: string): unknown {
  if (ruta.includes("/api/features/")) return FEATURE;
  if (ruta.includes("/api/features")) {
    return {
      summary: { total: 1, decomposed: 1, withGaps: 0, invalid: 0 },
      features: [FEATURE],
    };
  }
  if (ruta.includes("/api/health")) return { root: "/proyecto" };
  return {};
}

/** Ejecuta la vista de la feature y devuelve el texto pintado. */
async function tablero(): Promise<{
  texto: string;
  fallos: readonly string[];
  nodos: NodoFalso | undefined;
}> {
  const resultado = await ejecutarInterfaz(HTML, {
    hash: "#/feature/kardex",
    respuesta: respuestas,
  });
  return { texto: resultado.texto, fallos: resultado.fallos, nodos: resultado.contenido };
}

describe("el tablero de una feature", () => {
  it("se ejecuta sin errores y pinta el tablero", async () => {
    const { texto, fallos } = await tablero();
    expect(fallos).toEqual([]);
    expect(texto).toContain("tablero");
  });

  it("agrupa los tickets por dónde están, con su cuenta", async () => {
    const { texto } = await tablero();
    // Un ticket sin escribir tiene su propia columna: es el estado en que queda
    // una feature descompuesta y todavía sin tickets en el registro.
    expect(texto).toContain("Sin crear · 1");
    expect(texto).toContain("En curso · 1");
    expect(texto).toContain("Cerrado · 1");
    // Y las que no tienen tarjetas no ocupan una columna: con ocho etapas y seis
    // vacías había que desplazarse para ver las dos que tienen trabajo. Se nombran
    // al pie, así que la forma del tablero no se pierde.
    expect(texto).not.toContain("Aprobado · 0");
    expect(texto).toContain("Sin tarjetas: Por analizar, Planeado, Aprobado, Por probar");
  });

  it("dice cuál se puede empezar y cuál espera", async () => {
    const { texto } = await tablero();
    // El que espera a un ticket que no está cerrado.
    expect(texto).toContain("espera a FEATURE-INVENTARIO-API-20260924");
    // Y el que no espera a nadie: la pregunta que se hace antes de trabajar.
    expect(texto).toContain("listo para empezar");
    // El que ya está cerrado no dice nada de eso: no hay nada que empezar.
    expect(texto).not.toContain("listo para empezar | FEATURE-INVENTARIO-MODELO");
  });

  it("un ticket que existe enlaza a su vista y uno sin crear no", async () => {
    // El texto pintado no lleva los `href`, así que se camina el árbol: lo que se
    // afirma es que el identificador de un ticket que existe es un enlace —es lo
    // que se hace después de mirar el tablero— y que el de uno sin crear no lo es.
    const { nodos } = await tablero();
    const enlaces: string[] = [];
    const recorrer = (nodo: NodoFalso | undefined): void => {
      if (nodo === undefined || typeof nodo !== "object") return;
      const enlace = nodo as unknown as { nodeName: string; href: string };
      if (enlace.nodeName === "A" && enlace.href) enlaces.push(enlace.href);
      for (const hijo of (nodo.children ?? []) as NodoFalso[]) recorrer(hijo);
    };
    recorrer(nodos);

    expect(enlaces).toContain("#/ticket/FEATURE-INVENTARIO-API-20260924");
    expect(enlaces).toContain("#/ticket/FEATURE-INVENTARIO-MODELO-20260924");
    // El que todavía no está escrito no tiene a dónde llevar.
    expect(enlaces.some((u) => u.includes("EXPORT"))).toBe(false);
  });

  it("dice cuántos faltan y ofrece escribirlos", async () => {
    const { texto } = await tablero();
    expect(texto).toContain("1 de 3 ticket(s) del grafo todavía no están");
    expect(texto).toContain("Escribir los 1 que faltan en el registro");
  });
});
