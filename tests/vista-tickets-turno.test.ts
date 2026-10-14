/**
 * Tickets y su detalle rediseñados (FEATURE-WEB-TRABAJO-TICKETS-20261014: R-TRA-001, R-TRA-002 y la
 * parte de estas dos vistas de R-MARCO-006).
 *
 * Se ejecuta la interfaz con el DOM mínimo de `scripts/verificar-interfaz.mjs` y respuestas
 * simuladas con la forma real de `GET /api/tickets` (filas con `turno` y `summary.porTurno`) y de
 * `GET /api/tickets/:id` (con `turno` y `contratoDePruebas`), registrando las llamadas. Bocetos de
 * referencia: `.valmen/features/rediseno-mission-control/assets/tickets.html` y `ticket.html`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buscarNodos, disparar, ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";
import type { NodoFalso } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");

type Nodo = NodoFalso & { attrs: Record<string, string>; className: string; hidden?: boolean };

function textoDe(nodo: Nodo | undefined): string {
  if (nodo === undefined) return "";
  const partes: string[] = [];
  const recorrer = (n: Nodo) => {
    if (n._texto) partes.push(String(n._texto));
    for (const h of (n.children ?? []) as Nodo[]) recorrer(h);
  };
  recorrer(nodo);
  return partes.join(" ");
}
const conClase = (raiz: Nodo, clase: string) =>
  buscarNodos(raiz, (n: Nodo) => (n.className ?? "").split(" ").includes(clase)) as Nodo[];
const conRol = (raiz: Nodo, rol: string) =>
  buscarNodos(raiz, (n: Nodo) => n.attrs?.role === rol) as Nodo[];
const botonQueDice = (raiz: Nodo, texto: string) =>
  (buscarNodos(raiz, (n: Nodo) => n.tagName === "BUTTON" && textoDe(n).trim() === texto) as Nodo[])[0];

const HOY = new Date();
const hace = (dias: number) => {
  const f = new Date(HOY);
  f.setDate(f.getDate() - dias);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
};

function fila(
  id: string,
  estado: string,
  turno: { quien: string; paso: number; rotulo: string; motivo?: string },
  extra = {},
) {
  return {
    id,
    title: `Título de ${id}`,
    type: "FEATURE",
    module: id.split("-")[1],
    workflowStatus: estado,
    qaStatus: "pending",
    releaseStatus: "unreleased",
    riskLevel: "normal",
    created: hace(3),
    updated: hace(1),
    closedOn: null,
    openPoints: 0,
    totalPoints: 0,
    criticalImpacts: [],
    path: `tickets/2026/${id}/ticket.md`,
    invalid: null,
    publicState: null,
    turno: { motivo: null, compuerta: null, ...turno },
    ...extra,
  };
}

const PRUEBAS = fila("FEATURE-WEB-PRUEBAS-20261010", "awaiting_user_tests", { quien: "persona", paso: 6, rotulo: "awaiting_user_tests", motivo: "pruebas" }, { created: hace(0) });
const CURSO = fila("FEATURE-ENGINE-CURSO-20261010", "in_progress", { quien: "agente", paso: 5, rotulo: "in_progress" });
const ANALISIS = fila("BUGFIX-ENGINE-ANALISIS-20261010", "analyzed", { quien: "agente", paso: 3, rotulo: "analyzed" });
const CERRADO = fila("FEATURE-CLI-CERRADO-20261010", "closed", { quien: "nadie", paso: 9, rotulo: "closed" }, { closedOn: hace(2) });
const FILAS = [CURSO, PRUEBAS, ANALISIS, CERRADO];

interface Llamada {
  ruta: string;
  query: URLSearchParams;
  metodo: string;
  cuerpo: Record<string, unknown> | null;
}

async function pintar(hash: string, detalle?: Record<string, unknown>) {
  const llamadas: Llamada[] = [];
  const vista = await ejecutarInterfaz(HTML, {
    hash,
    respuesta: (ruta: string, init?: { method?: string; body?: unknown }) => {
      const url = new URL(ruta, "http://localhost");
      const metodo = init?.method ?? "GET";
      llamadas.push({
        ruta: url.pathname,
        query: url.searchParams,
        metodo,
        cuerpo: init?.body === undefined ? null : (JSON.parse(String(init.body)) as Record<string, unknown>),
      });
      if (url.pathname === "/api/health") return { root: RAIZ };
      if (url.pathname === "/api/tickets") {
        const turno = url.searchParams.get("turno") ?? "activos";
        const tickets = FILAS.filter((f) =>
          turno === "persona"
            ? f.turno.quien === "persona"
            : turno === "agente"
              ? f.turno.quien === "agente"
              : turno === "cerrados"
                ? f.workflowStatus === "closed"
                : f.workflowStatus !== "closed",
        );
        return {
          summary: {
            total: 4,
            byWorkflow: { awaiting_user_tests: 1, in_progress: 1, analyzed: 1, closed: 1 },
            byType: { FEATURE: 3, BUGFIX: 1 },
            invalid: 0,
            withOpenPoints: 0,
            criticalImpacts: 0,
            porTurno: { activos: 3, persona: 1, agente: 2, cerrados: 1 },
          },
          tickets,
        };
      }
      if (detalle !== undefined && url.pathname === `/api/tickets/${detalle.id as string}/pruebas-del-responsable`)
        return { ok: true, details: "Workflow: awaiting_user_tests -> in_qa." };
      if (detalle !== undefined && url.pathname.endsWith("/gates"))
        return { gates: [], decisions: [], corrections: [], transitions: null };
      if (detalle !== undefined && url.pathname === `/api/tickets/${detalle.id as string}`) return detalle;
      return {};
    },
  });
  expect(vista.fallos).toEqual([]);
  return { contenido: vista.contenido as Nodo, llamadas };
}

function detalleDe(f: ReturnType<typeof fila>, extra: Record<string, unknown> = {}) {
  return {
    ...f,
    request: "pedido",
    sections: {
      "Criterios de aceptación":
        "- [x] C1: la etiqueta sale del estado público\n      <!-- test: npx vitest run tests/a.test.ts -->\n- [ ] C2: comprobación visual\n      <!-- verify: manual -->",
    },
    points: [],
    qa: [],
    evidence: [],
    retests: [],
    closures: [],
    events: [],
    usage: [],
    porRatificar: [],
    contratoDePruebas: {
      directorio: "la raíz del repositorio",
      ambiente: "Node 24",
      comandos: [
        { comando: "npx vitest run packages/server", esperado: "verde" },
        { comando: "npx tsc -p packages/server", esperado: "sin errores" },
        { comando: "node scripts/verificar-interfaz.mjs", esperado: "Interfaz verificada." },
      ],
      manuales: ["Abrir un ticket en la vista y comprobar la etiqueta"],
    },
    ...extra,
  };
}

// ── La lista ─────────────────────────────────────────────────────────────────

describe("Tickets: pestañas por turno", () => {
  it("C3: pinta Activos, Esperan por mí, Con el agente y Cerrados con la cuenta de summary.porTurno", async () => {
    const { contenido } = await pintar("#/tickets");
    const pestanas = conRol(contenido, "tab").map((n) => textoDe(n).replace(/\s+/g, " ").trim());
    expect(pestanas).toEqual(["Activos 3", "Esperan por mí 1", "Con el agente 2", "Cerrados 1"]);
  });

  it("C4: «Esperan por mí» pide ?turno=persona y muestra solo el ticket en pruebas, con «Tú» en ámbar", async () => {
    const { contenido, llamadas } = await pintar("#/tickets");
    await disparar(conRol(contenido, "tab")[1]!, "click");
    expect(llamadas.filter((l) => l.ruta === "/api/tickets").at(-1)?.query.get("turno")).toBe("persona");
    const filas = buscarNodos(contenido, (n: Nodo) => n.tagName === "TR" && n.attrs["data-ticket"] !== undefined) as Nodo[];
    expect(filas.map((f) => f.attrs["data-ticket"])).toEqual([PRUEBAS.id]);
    const turno = conClase(filas[0]!, "turno-quien")[0]!;
    expect(textoDe(turno)).toContain("Tú");
    expect(turno.className.split(" ")).toContain("persona");
  });

  it("C5: la barra colorea sus ocho segmentos según el turno", async () => {
    const { contenido } = await pintar("#/tickets");
    const segmentos = (id: string) => {
      const tr = (buscarNodos(contenido, (n: Nodo) => n.attrs?.["data-ticket"] === id) as Nodo[])[0]!;
      return conClase(tr, "segmento").map((s) => s.className.replace("segmento", "").trim());
    };
    expect(segmentos(PRUEBAS.id)).toEqual(["hecho", "hecho", "hecho", "hecho", "hecho", "actual persona", "", ""]);
    expect(segmentos(ANALISIS.id)).toEqual(["hecho", "hecho", "actual agente", "", "", "", "", ""]);
    const { contenido: cerrados } = await pintar("#/tickets");
    await disparar(conRol(cerrados, "tab")[3]!, "click");
    const tr = (buscarNodos(cerrados, (n: Nodo) => n.attrs?.["data-ticket"] === CERRADO.id) as Nodo[])[0]!;
    expect(conClase(tr, "segmento").map((s) => s.className.replace("segmento", "").trim())).toEqual(
      Array(8).fill("cerrado"),
    );
  });

  it("C6: pulsar una fila abre el detalle", async () => {
    const { contenido } = await pintar("#/tickets");
    const tr = (buscarNodos(contenido, (n: Nodo) => n.attrs?.["data-ticket"] === CURSO.id) as Nodo[])[0]!;
    await disparar(tr, "click");
    expect(globalThis.location.hash).toBe(`#/ticket/${CURSO.id}`);
  });

  it("muestra el módulo y la edad de cada fila", async () => {
    const { contenido } = await pintar("#/tickets");
    const tr = (id: string) => (buscarNodos(contenido, (n: Nodo) => n.attrs?.["data-ticket"] === id) as Nodo[])[0]!;
    expect(textoDe(conClase(tr(PRUEBAS.id), "celda-edad")[0])).toBe("hoy");
    expect(textoDe(conClase(tr(CURSO.id), "celda-edad")[0])).toBe("3 d");
    expect(textoDe(conClase(tr(CURSO.id), "celda-modulo")[0])).toBe("ENGINE");
  });

  it("C7: «Más filtros» conserva estado, tipo, fechas, las casillas, el orden y el reporte de cierres", async () => {
    const { contenido } = await pintar("#/tickets");
    const mas = conClase(contenido, "mas-filtros")[0]!;
    expect(mas.tagName).toBe("DETAILS");
    expect(mas.open).toBe(false);
    const texto = textoDe(mas);
    for (const pieza of ["Todos los estados", "Todos los tipos", "Solo lo empezado", "Solo abiertos", "Solo inválidos", "Reporte de cierres", "Última edición", "Ordenar por"]) {
      expect(texto).toContain(pieza);
    }
    expect(buscarNodos(mas, (n: Nodo) => n.tagName === "INPUT" && n.type === "date")).toHaveLength(2);
  });

  it("el buscador sigue mandando q", async () => {
    const { contenido, llamadas } = await pintar("#/tickets");
    const busqueda = (buscarNodos(contenido, (n: Nodo) => n.tagName === "INPUT" && n.type === "search") as Nodo[])[0]!;
    busqueda.value = "WEB";
    await disparar(busqueda, "input");
    await new Promise((r) => setTimeout(r, 300));
    await disparar(busqueda, "noop");
    expect(llamadas.filter((l) => l.ruta === "/api/tickets").at(-1)?.query.get("q")).toBe("WEB");
  });

  it("C17: la tabla va dentro de una caja con desplazamiento horizontal propio", async () => {
    const { contenido } = await pintar("#/tickets");
    const caja = conClase(contenido, "tabla-caja")[0]!;
    expect(buscarNodos(caja, (n: Nodo) => n.tagName === "TABLE")).toHaveLength(1);
    const html = readFileSync(HTML, "utf8");
    expect(html).toMatch(/\.tabla-caja\s*\{[^}]*overflow-x:\s*auto/);
  });
});

// ── El detalle ───────────────────────────────────────────────────────────────

describe("Detalle: el ciclo de ocho pasos y «Te toca»", () => {
  it("C8: pinta los ocho pasos con quién decide cada uno", async () => {
    const d = detalleDe(PRUEBAS);
    const { contenido } = await pintar(`#/ticket/${PRUEBAS.id}`, d);
    const ciclo = buscarNodos(contenido, (n: Nodo) => n.attrs?.["aria-label"] === "Ciclo del ticket")[0] as Nodo;
    const pasos = (ciclo.children as Nodo[]).map((li) => [
      textoDe(conClase(li, "paso-nombre")[0]),
      textoDe(conClase(li, "paso-quien")[0]),
    ]);
    expect(pasos).toEqual([
      ["Pedido", "persona"],
      ["Análisis", "modelo"],
      ["Plan", "modelo"],
      ["Aprobación", "política"],
      ["Desarrollo", "modelo"],
      ["Tus pruebas", "persona"],
      ["QA", "persona"],
      ["Cierre", "código"],
    ]);
    const actual = (ciclo.children as Nodo[])[5]!;
    expect(actual.attrs["aria-current"]).toBe("step");
    expect(actual.className.split(" ")).toContain("persona");
  });

  it("C9: en awaiting_user_tests «Te toca» lista los tres comandos, cada uno con «copiar»", async () => {
    const { contenido } = await pintar(`#/ticket/${PRUEBAS.id}`, detalleDe(PRUEBAS));
    const bloque = conClase(contenido, "te-toca")[0]!;
    expect(textoDe(bloque)).toContain("Te toca: prueba la entrega");
    const comandos = conClase(bloque, "comando-copiable");
    expect(comandos.map((c) => textoDe(conClase(c, "comando-texto")[0]))).toEqual([
      "npx vitest run packages/server",
      "npx tsc -p packages/server",
      "node scripts/verificar-interfaz.mjs",
    ]);
    expect(comandos.every((c) => botonQueDice(c, "copiar") !== undefined)).toBe(true);
    for (const accion of ["Pasaron las pruebas", "Algo falló", "Omitir con motivo"]) {
      expect(botonQueDice(bloque, accion)).toBeDefined();
    }
  });

  it("C10: en analyzed no hay «Te toca» y el paso actual va en lila", async () => {
    const { contenido } = await pintar(`#/ticket/${ANALISIS.id}`, detalleDe(ANALISIS));
    expect(conClase(contenido, "te-toca")).toHaveLength(0);
    const ciclo = buscarNodos(contenido, (n: Nodo) => n.attrs?.["aria-label"] === "Ciclo del ticket")[0] as Nodo;
    const actual = (ciclo.children as Nodo[]).find((li) => li.attrs["aria-current"] === "step")!;
    expect(textoDe(conClase(actual, "paso-nombre")[0])).toBe("Plan");
    expect(actual.className.split(" ")).toContain("agente");
  });

  it("C11: sin frase literal, «Confirmar» no manda ninguna petición", async () => {
    const d = detalleDe(PRUEBAS);
    const { contenido, llamadas } = await pintar(`#/ticket/${PRUEBAS.id}`, d);
    await disparar(botonQueDice(contenido, "Pasaron las pruebas")!, "click");
    const formulario = conClase(contenido, "formulario-resultado")[0]!;
    conClase(formulario, "campo-actor")[0]!.value = "Ana Pérez";
    conClase(formulario, "campo-frase")[0]!.value = "  ";
    await disparar(botonQueDice(formulario, "Confirmar")!, "click");
    expect(llamadas.filter((l) => l.metodo === "POST")).toEqual([]);
  });

  it("C12: «Pasaron las pruebas» confirmado manda el resultado con la frase literal de la persona", async () => {
    const d = detalleDe(PRUEBAS);
    const { contenido, llamadas } = await pintar(`#/ticket/${PRUEBAS.id}`, d);
    await disparar(botonQueDice(contenido, "Pasaron las pruebas")!, "click");
    const formulario = conClase(contenido, "formulario-resultado")[0]!;
    conClase(formulario, "campo-actor")[0]!.value = "Ana Pérez";
    conClase(formulario, "campo-frase")[0]!.value = "Probé los tres comandos, todo bien";
    await disparar(botonQueDice(formulario, "Confirmar")!, "click");
    const post = llamadas.filter((l) => l.metodo === "POST");
    expect(post.map((l) => [l.ruta, l.cuerpo])).toEqual([
      [
        `/api/tickets/${PRUEBAS.id}/pruebas-del-responsable`,
        { resultado: "pasaron", actor: "Ana Pérez", frase: "Probé los tres comandos, todo bien" },
      ],
    ]);
  });

  it("con una compuerta en REVIEW, «Te toca» la nombra y lleva a la pestaña Compuertas", async () => {
    const planned = fila("FEATURE-GATE-REVIEW-20261010", "planned", { quien: "persona", paso: 4, rotulo: "planned · REVIEW" });
    const d = detalleDe(planned, { turno: { ...planned.turno, motivo: "compuerta", compuerta: "plan" } });
    const { contenido } = await pintar(`#/ticket/${planned.id}`, d);
    const bloque = conClase(contenido, "te-toca")[0]!;
    expect(textoDe(bloque)).toContain("plan");
    await disparar(botonQueDice(bloque, "Ir a Compuertas")!, "click");
    const panel = conRol(contenido, "tabpanel").find((p) => p.attrs["data-pestana"] === "Compuertas")!;
    expect(panel.hidden).toBe(false);
  });
});

describe("Detalle: pestañas", () => {
  it("C16: tiene Resumen, Análisis, Plan, Compuertas, Decisiones del agente, Evidencia y Consumo de IA", async () => {
    const { contenido } = await pintar(`#/ticket/${CURSO.id}`, detalleDe(CURSO));
    const lista = conRol(contenido, "tablist").find((n) => n.attrs["aria-label"] === "Secciones del ticket")!;
    expect(conRol(lista, "tab").map((t) => textoDe(conClase(t, "pestana-nombre")[0]))).toEqual([
      "Resumen",
      "Análisis",
      "Plan",
      "Compuertas",
      "Decisiones del agente",
      "Evidencia",
      "Consumo de IA",
    ]);
    const visibles = conRol(contenido, "tabpanel").filter((p) => p.hidden !== true);
    expect(visibles.map((p) => p.attrs["data-pestana"])).toEqual(["Resumen"]);
  });
});
