/**
 * La vista del ticket muestra lo no cubierto de cada ciclo de QA (R-QAC-003).
 *
 * Se ejecuta el HTML real con un DOM mínimo y se lee lo que pinta cada tarjeta de la
 * sección QA: la lista de elementos, «Todo cubierto» para `[]` y «Sin cubrir: sin declarar»
 * para un cierre sin el campo. Un test sobre el HTML como texto no vería la rama que solo se
 * recorre con ciertos datos.
 */
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readTicket } from "../packages/engine/src/index.js";
import { buscarNodos, ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";
import type { NodoFalso } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");
const ID = "FEATURE-UI-BANDA-FASES-20260929";

const ticket = readTicket({ root: RAIZ, ticketsDir: "tickets" }, ID);
if (ticket === null) throw new Error(`Falta el ticket de prueba ${ID}`);

type Registro = Record<string, unknown>;

function apertura(n: number): Registro {
  return {
    id: `QA-00${n}`,
    date: "2026-10-11",
    build_reference: "commit:abc1234",
    environment: "local",
    result: "pending",
    findings: [],
    correction: null,
    po_confirmation: null,
  };
}

function cierre(n: number, extra: Registro = {}): Registro {
  return {
    id: `QA-00${n}`,
    date: "2026-10-11",
    build_reference: null,
    environment: null,
    result: "changes_requested",
    findings: [],
    correction: null,
    po_confirmation: null,
    ...extra,
  };
}

async function pintar(qa: Registro[], evidencia: Registro[] = []) {
  return ejecutarInterfaz(HTML, {
    hash: `#/ticket/${ID}`,
    respuesta: (ruta) => {
      const url = new URL(ruta, "http://localhost");
      if (url.pathname === `/api/tickets/${ID}`)
        return { ...ticket, qa, evidence: evidencia };
      if (url.pathname === `/api/tickets/${ID}/gates`) {
        return { gates: [], decisions: [], corrections: [], transitions: null };
      }
      if (url.pathname === "/api/ticket/fases") {
        return {
          ticket: ID,
          fases: [],
          timeline: { disponible: false },
          sesionesPorFase: [],
          kanban: null,
        };
      }
      if (url.pathname === "/api/timeline") return { available: false, compuertas: [] };
      if (url.pathname === "/api/health") return { root: RAIZ };
      return {};
    },
  });
}

function textoDe(nodo: NodoFalso): string {
  const propios = String(nodo._texto ?? "");
  return [propios, ...(nodo.children ?? []).map(textoDe)].join("\n");
}

/** La tarjeta de un registro, por su identificador; el texto y los nodos `li` que contiene. */
function tarjeta(vista: { contenido: NodoFalso | undefined }, id: string) {
  const caja = buscarNodos(
    vista.contenido,
    (n) =>
      String(n.className ?? "")
        .split(" ")
        .includes("tarjeta-dato") &&
      buscarNodos(n, (h) => String(h._texto) === id && String(h.className).includes("id"))
        .length > 0,
  )[0];
  if (caja === undefined) throw new Error(`No hay tarjeta para ${id}`);
  return {
    texto: textoDe(caja),
    items: buscarNodos(caja, (n) => n.tagName === "LI").map((n) => String(n._texto)),
    nodos: buscarNodos(caja, () => true).length,
  };
}

describe("lo no cubierto de cada ciclo, en la vista del ticket (R-QAC-003)", () => {
  const casos: {
    nombre: string;
    qa: Registro[];
    tarjeta: string;
    items: string[];
    contiene: string[];
    noContiene: string[];
  }[] = [
    {
      nombre: "dos elementos sin cubrir: un ítem por elemento y sin el resumen por conteo",
      qa: [
        apertura(1),
        cierre(2, { not_covered: ["modo oscuro en iPad", "teclado en Safari"] }),
      ],
      tarjeta: "QA-002",
      items: ["modo oscuro en iPad", "teclado en Safari"],
      contiene: ["Sin cubrir"],
      noContiene: ["not_covered:", "elemento(s)"],
    },
    {
      nombre: "lista vacía: «Todo cubierto»",
      qa: [apertura(1), cierre(2, { not_covered: [] })],
      tarjeta: "QA-002",
      items: [],
      contiene: ["Todo cubierto"],
      noContiene: ["sin declarar"],
    },
    {
      nombre: "sin la clave: «Sin cubrir: sin declarar»",
      qa: [apertura(1), cierre(2)],
      tarjeta: "QA-002",
      items: [],
      contiene: ["Sin cubrir: sin declarar"],
      noContiene: ["Todo cubierto"],
    },
    {
      nombre: "la entrada que abre el ciclo no pinta cobertura",
      qa: [apertura(1), cierre(2, { not_covered: ["algo"] })],
      tarjeta: "QA-001",
      items: [],
      contiene: [],
      noContiene: ["Sin cubrir", "Todo cubierto", "sin declarar"],
    },
    {
      nombre: "dos ciclos: cada lista queda en su propio cierre",
      qa: [
        apertura(1),
        cierre(2, { not_covered: ["uno"] }),
        apertura(3),
        cierre(4, { not_covered: ["dos", "tres"] }),
      ],
      tarjeta: "QA-004",
      items: ["dos", "tres"],
      contiene: ["Sin cubrir"],
      noContiene: ["uno"],
    },
    {
      nombre: "un elemento con marcado HTML se pinta como texto literal",
      qa: [apertura(1), cierre(2, { not_covered: ["<b>negrita</b> & <img src=x>"] })],
      tarjeta: "QA-002",
      items: ["<b>negrita</b> & <img src=x>"],
      contiene: [],
      noContiene: [],
    },
  ];

  it.each(casos)("$nombre", async (caso) => {
    const vista = await pintar(caso.qa);
    expect(vista.fallos).toEqual([]);
    const t = tarjeta(vista, caso.tarjeta);
    expect(t.items).toEqual(caso.items);
    for (const texto of caso.contiene) expect(t.texto).toContain(texto);
    for (const texto of caso.noContiene) expect(t.texto).not.toContain(texto);
    if (caso.nombre.includes("HTML")) {
      expect(
        buscarNodos(vista.contenido, (n) => n.tagName === "B" || n.tagName === "IMG"),
      ).toEqual([]);
    }
  });
});

describe("regresión de la tarjeta genérica", () => {
  it("un arreglo no vacío de Evidencia sigue resumido como «N elemento(s)»", async () => {
    const vista = await pintar(
      [],
      [{ id: "EV-001", date: "2026-10-11", archivos: ["a.png", "b.png"] }],
    );
    expect(tarjeta(vista, "EV-001").texto).toContain("archivos: 2 elemento(s)");
  });
});
