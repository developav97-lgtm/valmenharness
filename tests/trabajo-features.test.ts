/**
 * Trabajo › Features con su tablero (FEATURE-WEB-TRABAJO-FEATURES-20261014, boceto
 * `.valmen/features/rediseno-mission-control/assets/features.html`).
 *
 * La interfaz se ejecuta de verdad con `ejecutarInterfaz` y respuestas simuladas de
 * `GET /api/features` y `GET /api/features/:slug`; la proyección de adjuntos se
 * prueba sobre un laboratorio en `tmpdir`, como `features-view.test.ts`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listFeatureRows, readFeatureDetail } from "../packages/server/src/features.js";
import {
  buscarNodos,
  disparar,
  ejecutarInterfaz,
  type NodoFalso,
} from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");

// ── Datos simulados ─────────────────────────────────────────────────────────

type Fila = Record<string, unknown>;

function fila(id: string, extras: Fila): Fila {
  return {
    id,
    title: `Feature ${id}`,
    state: "decomposed",
    created: "2026-10-01",
    updated: "2026-10-07",
    hasSpec: true,
    hasDesign: true,
    hasDecomposition: true,
    hasVerify: false,
    hasAssets: false,
    requirements: 2,
    tickets: 0,
    closedTickets: 0,
    gaps: 0,
    invalid: null,
    path: `.valmen/features/${id}/feature.md`,
    ...extras,
  };
}

function tk(id: string, title: string, extras: Fila = {}): Fila {
  return { id, title, dependsOn: [], exists: true, state: "closed", ...extras };
}

const FILAS: Fila[] = [
  fila("vista-agentes", {
    title: "Vista Agentes: escenas animadas",
    updated: "2026-10-08",
    tickets: 3,
    closedTickets: 3,
    hasAssets: true,
  }),
  fila("perfiles", { hasDesign: false, tickets: 5, closedTickets: 1 }),
  fila("rediseno", { tickets: 2, closedTickets: 0 }),
  fila("borrador", {
    state: "draft",
    hasSpec: false,
    hasDesign: false,
    hasDecomposition: false,
    requirements: 0,
  }),
  fila("especificada", { state: "specified", hasDesign: false, hasDecomposition: false }),
  fila("verificada", { state: "in_progress", hasVerify: true, tickets: 2, closedTickets: 2 }),
  fila("encurso", { state: "in_progress", tickets: 2, closedTickets: 1 }),
  fila("autonomia", { state: "complete", hasVerify: true, tickets: 1, closedTickets: 1 }),
];

const SPRINTS: Record<string, unknown[]> = {
  "vista-agentes": [
    {
      id: "S1",
      goal: "Servidor",
      tickets: [tk("VA-1", "Lector de sesión"), tk("VA-2", "Pregunta pendiente")],
    },
    { id: "S2", goal: "Vista", tickets: [tk("VA-3", "Lienzo y selector")] },
  ],
  perfiles: [
    {
      id: "S1",
      goal: "Perfiles",
      tickets: [
        tk("PF-1", "Modelo de perfiles"),
        tk("PF-2", "Ruta de perfiles", { state: "in_progress" }),
        tk("PF-3", "Pantalla de perfiles", { state: "planned", dependsOn: ["PF-1"] }),
        tk("PF-4", "Cambiar de perfil", { state: "approved", dependsOn: ["PF-2"] }),
        tk("PF-5", "Ayuda de perfiles", { exists: false, state: null }),
      ],
    },
  ],
  rediseno: [
    {
      id: "S1",
      goal: "Marco",
      tickets: [
        tk("RD-1", "Menú", { state: "intake" }),
        tk("RD-2", "Tema", { exists: false, state: null }),
      ],
    },
  ],
  verificada: [{ id: "S1", goal: "Todo", tickets: [tk("VF-1", "Uno"), tk("VF-2", "Dos")] }],
  encurso: [
    {
      id: "S1",
      goal: "Todo",
      tickets: [tk("EC-1", "Uno"), tk("EC-2", "Dos", { state: "in_progress" })],
    },
  ],
  autonomia: [{ id: "S1", goal: "Todo", tickets: [tk("AU-1", "Uno")] }],
};

function detalle(id: string): Fila {
  const base = FILAS.find((f) => f.id === id) ?? fila(id, {});
  const sprints = SPRINTS[id];
  return {
    ...base,
    transitions: [],
    brief: `# ${id}\n`,
    specs: [],
    design: null,
    ticketsYaml: sprints === undefined ? null : `feature: ${id}\n`,
    decomposition:
      sprints === undefined ? null : { origin: null, sprints, requirements: [], gaps: [] },
    decompositionError: null,
    cycles: [],
    assets:
      id === "vista-agentes"
        ? [{ path: "assets/vista.html", kind: "prototipo", description: "Boceto" }]
        : [],
  };
}

function respuestas(ruta: string): unknown {
  const url = new URL(ruta, "http://localhost");
  const partes = url.pathname.split("/").filter(Boolean);
  if (partes[0] === "api" && partes[1] === "features" && partes.length === 3) {
    return detalle(decodeURIComponent(partes[2] as string));
  }
  if (url.pathname === "/api/features") {
    return {
      summary: { total: FILAS.length, decomposed: 4, withGaps: 0, invalid: 0, byState: {} },
      features: FILAS,
    };
  }
  if (url.pathname === "/api/health") return { root: RAIZ };
  if (url.pathname === "/api/tickets") return { tickets: [] };
  return {};
}

async function pintar(hash = "#/features") {
  return ejecutarInterfaz(HTML, { hash, respuesta: respuestas });
}

// ── Lectura de lo pintado ───────────────────────────────────────────────────

const clases = (n: NodoFalso): string[] => String(n.className ?? "").split(/\s+/);
const conClase = (raiz: NodoFalso | undefined, clase: string): NodoFalso[] =>
  buscarNodos(raiz, (n) => clases(n).includes(clase));
const atributo = (n: NodoFalso, clave: string): string | undefined =>
  (n as unknown as { attrs: Record<string, string> }).attrs[clave];

function textoDe(n: NodoFalso | undefined, acumulado: string[] = []): string {
  if (n === undefined) return "";
  if (n._texto) acumulado.push(String(n._texto));
  for (const hijo of n.children ?? []) textoDe(hijo, acumulado);
  return acumulado.join(" ");
}

/** Las tarjetas de feature: un enlace por feature. */
const tarjetas = (raiz: NodoFalso | undefined): NodoFalso[] => conClase(raiz, "feat-tarjeta");
const hrefDe = (n: NodoFalso): string => String((n as unknown as { href: string }).href);
const tarjeta = (raiz: NodoFalso | undefined, slug: string): NodoFalso => {
  const t = tarjetas(raiz).find((n) => hrefDe(n) === `#/feature/${slug}`);
  if (t === undefined) throw new Error(`no hay tarjeta de ${slug}`);
  return t;
};
const tablero = (raiz: NodoFalso | undefined): NodoFalso => {
  const t = conClase(raiz, "feat-tablero")[0];
  if (t === undefined) throw new Error("no hay tablero");
  return t;
};
const boton = (raiz: NodoFalso | undefined, texto: string): NodoFalso => {
  const b = buscarNodos(raiz, (n) => n.tagName === "BUTTON" && textoDe(n).includes(texto))[0];
  if (b === undefined) throw new Error(`no hay botón «${texto}»`);
  return b;
};

// ── Lista ───────────────────────────────────────────────────────────────────

describe("Features: la lista de tarjetas", () => {
  it("C1: pinta una tarjeta por feature visible, con su título y su slug", async () => {
    const vista = await pintar();
    expect(vista.fallos).toEqual([]);
    const hrefs = tarjetas(vista.contenido).map(hrefDe);
    expect(hrefs).toEqual([
      "#/feature/vista-agentes",
      "#/feature/perfiles",
      "#/feature/rediseno",
      "#/feature/borrador",
      "#/feature/especificada",
      "#/feature/verificada",
      "#/feature/encurso",
    ]);
    const texto = textoDe(tarjeta(vista.contenido, "vista-agentes"));
    expect(texto).toContain("Vista Agentes: escenas animadas");
    expect(texto).toContain("vista-agentes");
    expect(texto).toContain("08 oct");
  });

  it("C2: la marca de cada tarjeta dice el estado en palabras según su paso actual", async () => {
    const vista = await pintar();
    const casos: [string, string][] = [
      ["vista-agentes", "falta verificar"],
      ["perfiles", "descompuesta"],
      ["borrador", "borrador"],
      ["especificada", "especificada"],
      ["verificada", "por completar"],
    ];
    for (const [slug, marca] of casos) {
      const chip = conClase(tarjeta(vista.contenido, slug), "feat-marca")[0];
      expect(String(chip?._texto), slug).toBe(marca);
    }
  });

  it("C3: el interruptor «Mostrar completas» decide si se ven las features completas", async () => {
    const vista = await pintar();
    const interruptor = buscarNodos(
      vista.contenido,
      (n) => atributo(n, "role") === "switch",
    )[0] as NodoFalso;
    expect(atributo(interruptor, "aria-checked")).toBe("false");
    expect(tarjetas(vista.contenido).map(hrefDe)).not.toContain("#/feature/autonomia");

    await disparar(interruptor, "click");
    expect(tarjetas(vista.contenido).map(hrefDe)).toContain("#/feature/autonomia");
    const chip = conClase(tarjeta(vista.contenido, "autonomia"), "feat-marca")[0];
    expect(String(chip?._texto)).toBe("completa");
  });

  it("C4: la tarjeta de la feature abierta queda marcada como la elegida", async () => {
    const vista = await pintar("#/feature/perfiles");
    expect(atributo(tarjeta(vista.contenido, "perfiles"), "aria-current")).toBe("true");
    expect(atributo(tarjeta(vista.contenido, "vista-agentes"), "aria-current")).toBeUndefined();
  });

  it("C5: al elegir una feature se abre su tablero en la misma página", async () => {
    const casos: [string, string][] = [
      ["#/features", "Vista Agentes: escenas animadas"],
      ["#/feature/perfiles", "Feature perfiles"],
    ];
    for (const [hash, titulo] of casos) {
      const vista = await pintar(hash);
      expect(tarjetas(vista.contenido).length, hash).toBeGreaterThan(1);
      const h2 = buscarNodos(tablero(vista.contenido), (n) => n.tagName === "H2")[0];
      expect(String(h2?._texto), hash).toBe(titulo);
    }
  });
});

// ── Tablero ─────────────────────────────────────────────────────────────────

describe("Features: el tablero de la feature elegida", () => {
  it("C6: dice cuántos tickets del grafo están cerrados", async () => {
    const vista = await pintar();
    const texto = textoDe(tablero(vista.contenido));
    expect(texto).toContain("3/3");
    expect(texto).toContain("tickets cerrados");
  });

  it("C7: el recorrido muestra los seis pasos con su marca", async () => {
    const casos: [string, string[]][] = [
      [
        "vista-agentes",
        ["✓ hecho Brief", "✓ hecho Spec", "✓ hecho Diseño", "✓ hecho Grafo", "✓ 3 de 3 Tickets", "falta Verificación"],
      ],
      [
        "perfiles",
        ["✓ hecho Brief", "✓ hecho Spec", "opcional Diseño", "✓ hecho Grafo", "1 de 5 Tickets", "falta Verificación"],
      ],
    ];
    for (const [slug, pasos] of casos) {
      const vista = await pintar(`#/feature/${slug}`);
      const ol = buscarNodos(tablero(vista.contenido), (n) => n.tagName === "OL")[0];
      const items = (ol?.children ?? []).map((li) => textoDe(li));
      expect(items, slug).toEqual(pasos);
    }
  });

  it("C8: el recorrido resalta el paso en que está la feature", async () => {
    const casos: [string, string | null][] = [
      ["vista-agentes", "Verificación"],
      ["borrador", "Spec"],
      ["especificada", "Grafo"],
      ["rediseno", "Tickets"],
      ["perfiles", "Tickets"],
      ["verificada", null],
    ];
    for (const [slug, paso] of casos) {
      const vista = await pintar(`#/feature/${slug}`);
      const actuales = buscarNodos(
        tablero(vista.contenido),
        (n) => n.tagName === "LI" && atributo(n, "aria-current") === "step",
      );
      expect(actuales.map((li) => textoDe(li).split(" ").pop()), slug).toEqual(
        paso === null ? [] : [paso],
      );
    }
  });

  it("C9: la franja del siguiente paso dice qué falta según el paso actual", async () => {
    const casos: [string, string, string | null][] = [
      ["vista-agentes", "Todos los tickets están cerrados.", "Verificar la feature"],
      ["borrador", "Falta la spec.", null],
      ["especificada", "Falta el grafo de tickets.", "Descomponer"],
      ["rediseno", "1 ticket(s) del grafo sin escribir en el registro.", "Escribir los 1 que faltan"],
      ["encurso", "1 de 2 tickets cerrados.", null],
      ["verificada", "La verificación está escrita.", "Completar la feature"],
    ];
    for (const [slug, fuerte, accion] of casos) {
      const vista = await pintar(`#/feature/${slug}`);
      const franja = conClase(tablero(vista.contenido), "feat-siguiente")[0];
      expect(textoDe(franja), slug).toContain(fuerte);
      const botones = buscarNodos(franja, (n) => n.tagName === "BUTTON").map((b) => textoDe(b));
      expect(botones, slug).toEqual(accion === null ? [] : [accion]);
    }
  });

  it("C10: «Verificar la feature» muestra el comando valmen feature verify de esa feature", async () => {
    const vista = await pintar();
    await disparar(boton(tablero(vista.contenido), "Verificar la feature"), "click");
    const codigos = buscarNodos(vista.contenido, (n) => n.tagName === "CODE").map((c) =>
      textoDe(c),
    );
    expect(codigos).toContain("valmen feature verify vista-agentes");
  });

  it("C11: «Nueva feature» muestra el comando valmen feature new", async () => {
    const vista = await pintar();
    await disparar(boton(vista.contenido, "Nueva feature"), "click");
    const codigos = buscarNodos(vista.contenido, (n) => n.tagName === "CODE").map((c) =>
      textoDe(c),
    );
    expect(codigos.some((c) => c.startsWith("valmen feature new "))).toBe(true);
  });

  it("C12: los tickets se agrupan por sprint con su cuenta de cerrados", async () => {
    const vista = await pintar();
    const sprints = conClase(tablero(vista.contenido), "feat-sprint");
    const cabeceras = sprints.map((s) => textoDe(conClase(s, "feat-sprint-cabecera")[0]));
    expect(cabeceras).toEqual(["S1 · Servidor 2/2", "S2 · Vista 1/1"]);
    expect(textoDe(sprints[0])).toContain("Lector de sesión");
  });

  it("C13: cada ticket muestra un rótulo con su estado de trabajo", async () => {
    const vista = await pintar("#/feature/perfiles");
    const filas = conClase(tablero(vista.contenido), "feat-tk");
    const rotulos = Object.fromEntries(
      filas.map((f) => [
        textoDe(f).replace(/^\S+\s/, ""),
        atributo(conClase(f, "feat-tk-icono")[0] as NodoFalso, "aria-label"),
      ]),
    );
    expect(rotulos).toEqual({
      "Modelo de perfiles": "cerrado",
      "Ruta de perfiles": "en curso",
      "Pantalla de perfiles": "listo para empezar",
      "Cambiar de perfil": "esperando a otro",
      "Ayuda de perfiles": "sin crear",
    });
  });

  it("C14: el pie cuenta los adjuntos de la feature por tipo", async () => {
    const conAdjunto = await pintar();
    expect(textoDe(conClase(tablero(conAdjunto.contenido), "feat-pie")[0])).toContain(
      "Adjuntos: 1 prototipo.",
    );
    const sinAdjunto = await pintar("#/feature/perfiles");
    expect(textoDe(conClase(tablero(sinAdjunto.contenido), "feat-pie")[0])).toContain(
      "Sin adjuntos.",
    );
  });
});

// ── Proyección de adjuntos ──────────────────────────────────────────────────

describe("Features: los adjuntos en la proyección", () => {
  let lab: string;
  beforeEach(() => {
    lab = mkdtempSync(join(tmpdir(), "valmen-trabajo-features-"));
    const carpeta = join(lab, ".valmen", "features", "kardex");
    mkdirSync(join(carpeta, "assets"), { recursive: true });
    writeFileSync(
      join(carpeta, "feature.md"),
      [
        "---",
        "schema_version: 2",
        "id: kardex",
        "title: Kardex",
        "state: draft",
        "created: 2026-10-01",
        "updated: 2026-10-01",
        "---",
        "",
        "# Kardex",
        "",
      ].join("\n"),
    );
  });
  afterEach(() => rmSync(lab, { recursive: true, force: true }));

  const manifiesto = (texto: string): void =>
    writeFileSync(join(lab, ".valmen", "features", "kardex", "assets", "manifest.json"), texto);

  it("C15: el detalle entrega los adjuntos de su manifiesto", () => {
    manifiesto(
      JSON.stringify({
        schema: 1,
        assets: [
          {
            path: "assets/kardex.html",
            sha256: "0".repeat(64),
            bytes: 10,
            kind: "prototipo",
            description: "Boceto del kardex",
            origin_url: null,
            added: "2026-10-01",
          },
        ],
      }),
    );
    const detalle = readFeatureDetail(lab, "kardex") as unknown as {
      assets: { path: string; kind: string; description: string }[];
    };
    expect(detalle.assets).toEqual([
      { path: "assets/kardex.html", kind: "prototipo", description: "Boceto del kardex" },
    ]);
    expect((listFeatureRows(lab)[0] as unknown as { hasAssets: boolean }).hasAssets).toBe(true);
  });

  it("C16: un manifiesto ilegible no impide abrir la feature", () => {
    manifiesto("{ no es json");
    const detalle = readFeatureDetail(lab, "kardex") as unknown as { assets: unknown[] } | null;
    expect(detalle).not.toBeNull();
    expect(detalle?.assets).toEqual([]);
  });
});

// ── Celular ─────────────────────────────────────────────────────────────────

describe("Features: en el celular", () => {
  const fuente = readFileSync(HTML, "utf8");
  const regla = (selector: string): string => {
    const i = fuente.indexOf(`${selector} {`);
    expect(i, `regla ${selector}`).toBeGreaterThan(-1);
    return fuente.slice(i, fuente.indexOf("}", i));
  };

  it("C17: las rejillas del tablero pasan a una columna cuando el ancho no da para dos", () => {
    for (const selector of [".feat-tarjetas", ".feat-recorrido", ".feat-sprints"]) {
      expect(regla(selector), selector).toMatch(
        /grid-template-columns:\s*repeat\(auto-fi(ll|t),\s*minmax\(min\(100%,\s*\d+px\),\s*1fr\)\)/,
      );
    }
  });
});
