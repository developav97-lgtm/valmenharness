/**
 * El menú por grupos de Mission Control (FEATURE-WEB-MENU-GRUPOS-20261014: R-MARCO-002,
 * R-MARCO-003, R-MARCO-004 y la parte del menú de R-MARCO-006).
 *
 * Dos lecturas: el HTML como texto, para la estructura del menú, el contraste de sus
 * reglas y el corte de 768 px; y la interfaz ejecutada con el DOM mínimo de
 * `scripts/verificar-interfaz.mjs`, para lo que solo existe al correr —la cuenta de
 * agentes vivos, el perfil activo, el panel «Pedir un cambio», su atajo y las rutas
 * `#/configurar` y `#/configuracion`—. Boceto de referencia:
 * `.valmen/features/rediseno-mission-control/assets/menu.html`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { checkConfig } from "../packages/server/src/config.js";
import { buscarNodos, disparar, ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";
import type { NodoFalso } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");
const html = readFileSync(HTML, "utf8");

const inicioAside = html.indexOf('<aside class="lateral"');
const aside = html.slice(inicioAside, html.indexOf("</aside>", inicioAside));

/** El texto visible de un fragmento de marcado: sin iconos, sin cuentas y sin etiquetas. */
function rotulo(marcado: string): string {
  return marcado
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<span class="cuenta[^"]*"[^>]*>[\s\S]*?<\/span>/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/** Los grupos del menú en orden, cada uno con sus entradas [rótulo, ruta]. */
function gruposDelMenu(): Array<[string, Array<[string, string]>]> {
  return aside
    .split('<div class="grupo">')
    .slice(1)
    .map((trozo) => {
      const nombre = trozo.slice(0, trozo.indexOf("</div>")).trim();
      const entradas = [
        ...trozo.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g),
      ].map((m) => [rotulo(m[2] as string), m[1] as string] as [string, string]);
      return [nombre, entradas];
    });
}

describe("los grupos del menú (lectura de index.html)", () => {
  it("C1: el menú muestra los cinco grupos del boceto en su orden", () => {
    expect(gruposDelMenu().map(([nombre]) => nombre)).toEqual([
      "Hoy",
      "Trabajo",
      "En vivo",
      "Reglas",
      "Ajustes",
    ]);
  });

  it.each([
    ["Hoy", [["Inicio", "#/inicio"]]],
    [
      "Trabajo",
      [
        ["Tickets", "#/tickets"],
        ["Features", "#/features"],
        ["Portafolio", "#/portafolio"],
      ],
    ],
    [
      "En vivo",
      [
        ["Agentes", "#/agentes"],
        ["Procesos", "#/procesos"],
      ],
    ],
    ["Reglas", [["Estándares", "#/estandares"]]],
    [
      "Ajustes",
      [
        ["Modelos", "#/modelos"],
        ["Proveedores", "#/proveedores"],
        ["Proyecto", "#/proyecto"],
      ],
    ],
  ])(
    "C2: el grupo %s lista sus entradas del boceto en orden con su ruta",
    (grupo, entradas) => {
      const encontrado = gruposDelMenu().find(([nombre]) => nombre === grupo);
      expect(encontrado?.[1]).toEqual(entradas);
    },
  );

  it("C3: el menú no tiene ninguna de las entradas retiradas («Configurar», «Configuración»)", () => {
    const rotulos = [...aside.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) =>
      rotulo(m[2] as string),
    );
    expect(rotulos.length).toBeGreaterThan(0);
    expect(rotulos.filter((r) => /^Configura(r|ción)$/.test(r))).toEqual([]);
    expect(aside).not.toMatch(/data-vista="configura(r|cion)"/);
  });

  it("C5: la caja del proyecto activo va antes del primer grupo del menú", () => {
    const caja = aside.indexOf('id="proyecto-activo"');
    const selector = aside.indexOf('id="selector-proyectos"');
    const primerGrupo = aside.indexOf('<div class="grupo">');
    expect(caja).toBeGreaterThan(-1);
    expect(selector).toBeGreaterThan(caja);
    expect(primerGrupo).toBeGreaterThan(selector);
  });

  it("C7: la línea del perfil lleva a #/modelos", () => {
    const enlace = /<a\b[^>]*id="perfil-activo"[^>]*>/.exec(aside)?.[0] ?? "";
    expect(enlace).toContain('href="#/modelos"');
    expect(aside.indexOf('id="perfil-activo"')).toBeLessThan(
      aside.indexOf('<div class="grupo">'),
    );
  });
});

// ── Contraste de la barra (C16) ─────────────────────────────────────────────

function declaraciones(bloque: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const m of bloque.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    mapa.set(m[1] as string, (m[2] as string).replace(/\s+/g, " ").trim().toLowerCase());
  return mapa;
}
const oscuro = declaraciones(/\n\s*:root\s*\{([^}]*)\}/.exec(html)?.[1] ?? "");
const claro = declaraciones(
  /@media\s*\(prefers-color-scheme:\s*light\)\s*\{([\s\S]*?)\n\s*\}/.exec(html)?.[1] ?? "",
);

type Rgb = [number, number, number];
function rgb(valor: string, base: Rgb): Rgb {
  if (valor.startsWith("#"))
    return [1, 3, 5].map((i) => Number.parseInt(valor.slice(i, i + 2), 16)) as Rgb;
  const m = /rgba?\(([^)]+)\)/.exec(valor);
  if (m === null) throw new Error(`color no reconocido: ${valor}`);
  const [r, g, b, a = "1"] = (m[1] as string).split(",").map((p) => p.trim());
  const alfa = Number(a);
  return [r, g, b].map(
    (c, i) => Number(c) * alfa + (base[i] as number) * (1 - alfa),
  ) as Rgb;
}
function luminancia([r, g, b]: Rgb): number {
  const [x, y, z] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (x as number) + 0.7152 * (y as number) + 0.0722 * (z as number);
}
function contraste(a: Rgb, b: Rgb): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return ((x as number) + 0.05) / ((y as number) + 0.05);
}

/** El cuerpo de la primera regla cuyo selector es exactamente `selector`. */
function regla(selector: string): string {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\n\\s*${escapado}\\s*\\{([^}]*)\\}`).exec(html)?.[1] ?? "";
}

/**
 * Cada par texto-fondo de la barra: selector, token del texto y token del fondo. Un
 * fondo `-suave` se mezcla sobre `--fondo-2`, que es el fondo de la barra; cuando la
 * regla no declara fondo, el par dice sobre qué se pinta (`null` = no se comprueba la
 * declaración del fondo, se hereda).
 */
const PARES: ReadonlyArray<readonly [string, string, string, boolean]> = [
  [".lateral", "--texto", "--fondo-2", true],
  [".lateral .grupo", "--tenue", "--fondo-2", false],
  [".lateral nav a", "--tenue", "--fondo-2", false],
  [".lateral nav a:hover", "--texto", "--panel-hover", true],
  ['.lateral nav a[aria-current="page"]', "--texto", "--acento-suave", true],
  [".lateral nav a .cuenta", "--sobre-acento", "--acento", true],
  [".lateral nav a .cuenta.alerta", "--sobre-acento", "--alerta", true],
  [".lateral nav a .cuenta.vivos", "--modelo", "--fondo-2", false],
  [".lateral .proyecto-activo", "--texto", "--panel", true],
  [".lateral .proyecto-activo .rotulo", "--tenue", "--panel", false],
  [".lateral .perfil-activo", "--tenue", "--modelo-suave", true],
  [".lateral .perfil-activo .id", "--modelo", "--modelo-suave", false],
  [".lateral .pedir-cambio", "--texto", "--fondo-2", false],
  [".lateral .pedir-cambio .atajo", "--tenue", "--fondo-2", false],
];

describe("el contraste de la barra", () => {
  it.each(PARES)(
    "C16: %s pinta var(%s) sobre var(%s) con 4.5:1 en los dos modos del sistema",
    (selector, texto, fondo, declaraFondo) => {
      const cuerpo = regla(selector);
      expect(cuerpo, `regla ${selector}`).not.toBe("");
      expect(cuerpo).toMatch(new RegExp(`(^|[;\\s])color:\\s*var\\(${texto}\\)`));
      if (declaraFondo)
        expect(cuerpo).toMatch(new RegExp(`background:\\s*var\\(${fondo}\\)`));
      for (const [modo, tema] of [
        ["oscuro", oscuro],
        ["claro", claro],
      ] as const) {
        const base = rgb(tema.get("--fondo-2") ?? "", [0, 0, 0]);
        const razon = contraste(
          rgb(tema.get(texto) ?? "", base),
          rgb(tema.get(fondo) ?? "", base),
        );
        expect(
          razon,
          `${selector} en modo ${modo}: ${razon.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});

describe("el menú en el celular", () => {
  it("C17: por debajo de 768 px el armazón pone la barra sobre el contenido en una sola columna", () => {
    const i = html.indexOf("@media (max-width: 767px) {");
    expect(i).toBeGreaterThan(-1);
    // El bloque entero, contando llaves.
    let profundidad = 0;
    let fin = i;
    for (let j = html.indexOf("{", i); j < html.length; j += 1) {
      if (html[j] === "{") profundidad += 1;
      if (html[j] === "}") profundidad -= 1;
      if (profundidad === 0) {
        fin = j;
        break;
      }
    }
    const bloque = html.slice(i, fin);
    expect(bloque).toMatch(
      /body\.armazon\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(bloque).toMatch(/\.lateral\s*\{[^}]*position:\s*static/);
    expect(bloque).toMatch(/\.lateral\s*\{[^}]*height:\s*auto/);
  });
});

// ── La interfaz ejecutada ───────────────────────────────────────────────────

interface Llamada {
  readonly ruta: string;
  readonly metodo: string;
  readonly cuerpo: Record<string, unknown> | null;
}

type Respuestas = Record<string, unknown>;

const BASE: Respuestas = {
  "/api/health": { root: RAIZ },
  "/api/tickets": { tickets: [] },
  "/api/standards": { proposals: [] },
  "/api/perfiles": { perfiles: [], seleccion: { proyecto: null, ejecutores: {} } },
};

/**
 * Ejecuta la interfaz en `hash`. Con `respuestas === null` responde el arnés con sus
 * datos de siempre, que pintan cualquier vista; si no, cada ruta con lo que se pase.
 */
async function pintar(
  hash: string,
  respuestas: Respuestas | null = {},
  almacen: Record<string, string> = {},
) {
  const llamadas: Llamada[] = [];
  const todas = { ...BASE, ...respuestas };
  const vista = await ejecutarInterfaz(HTML, {
    hash,
    localStorage: almacen,
    ...(respuestas === null
      ? {}
      : {
          respuesta: (ruta: string, init?: RequestInit) => {
            const url = new URL(ruta, "http://localhost");
            const cuerpo =
              init?.body === undefined
                ? null
                : (JSON.parse(String(init.body)) as Record<string, unknown>);
            llamadas.push({ ruta: url.pathname, metodo: init?.method ?? "GET", cuerpo });
            const r = todas[url.pathname];
            return typeof r === "function"
              ? (r as (c: unknown) => unknown)(cuerpo)
              : (r ?? {});
          },
        }),
  });
  const nodo = (id: string): NodoFalso => {
    const encontrado = vista.nodo(id);
    if (encontrado === undefined) throw new Error(`el arnés no expone el nodo #${id}`);
    return encontrado;
  };
  return { vista, llamadas, nodo };
}

function textoDe(n: NodoFalso | undefined, acumulado: string[] = []): string {
  if (n === undefined) return "";
  if (n._texto) acumulado.push(String(n._texto));
  for (const hijo of n.children ?? []) textoDe(hijo, acumulado);
  return acumulado.join(" ");
}

const campoDelChat = (raiz: NodoFalso): NodoFalso | undefined =>
  buscarNodos(
    raiz,
    (n) => n.tagName === "TEXTAREA" && n.attrs?.["aria-label"] === "Qué quieres configurar",
  )[0];

const boton = (raiz: NodoFalso, texto: string): NodoFalso | undefined =>
  buscarNodos(raiz, (n) => n.tagName === "BUTTON" && String(n._texto) === texto)[0];

/** El `window` y el `document` que el arnés deja en `globalThis` (sin la librería DOM). */
const entorno = globalThis as unknown as {
  window: { dispatchEvent: (e: unknown) => void };
  document: { activeElement: unknown };
};

function teclear(evento: Record<string, unknown>): void {
  entorno.window.dispatchEvent({ type: "keydown", preventDefault: () => {}, ...evento });
}

describe("la cuenta de agentes vivos", () => {
  it("C4: la entrada Agentes muestra la cuenta de agentes vivos", async () => {
    const { nodo } = await pintar(
      "#/tickets",
      {
        "/api/corrida/agentes": {
          agentes: [
            { id: "a", estado: "trabajando", ticket: "T-1" },
            { id: "b", estado: "esperando", ticket: "T-2" },
            { id: "c", estado: "trabajando", principal: true },
            { id: "d", estado: "terminado", ticket: "T-3" },
          ],
        },
      },
      { "valmen.project": "laboratorio" },
    );
    const cuenta = nodo("cuenta-agentes");
    expect(String(cuenta._texto)).toBe("2");
    expect((cuenta as { hidden?: boolean }).hidden).toBe(false);
  });
});

describe("el perfil activo", () => {
  it.each([
    ["claude-code-completo", ["Perfil", "claude-code-completo"]],
    [null, ["sin perfil"]],
  ] as const)(
    "C6: con la elección %s la línea del perfil dice %j",
    async (elegido, esperado) => {
      const { nodo } = await pintar("#/tickets", {
        "/api/perfiles": { perfiles: [], seleccion: { proyecto: elegido, ejecutores: {} } },
      });
      const texto = textoDe(nodo("perfil-activo"));
      for (const parte of esperado) expect(texto).toContain(parte);
      if (elegido === null) expect(texto).not.toMatch(/Perfil\s/);
    },
  );
});

describe("el panel «Pedir un cambio»", () => {
  it("C8: el botón «Pedir un cambio» abre el panel con el chat de configuración", async () => {
    const { nodo } = await pintar("#/tickets");
    expect(nodo("pedir-cambio").open).toBe(false);
    await disparar(nodo("pedir-cambio-boton"), "click");
    expect(nodo("pedir-cambio").open).toBe(true);
    expect(campoDelChat(nodo("pedir-cambio-cuerpo"))).toBeDefined();
  });

  it.each([
    ["⌘K sin foco", { key: "k", metaKey: true }, null, true],
    ["Ctrl+K sin foco", { key: "k", ctrlKey: true }, null, true],
    ["⌘K con foco en un campo", { key: "k", metaKey: true }, "INPUT", false],
    ["Ctrl+K con foco en un área de texto", { key: "k", ctrlKey: true }, "TEXTAREA", false],
    ["K sin modificador", { key: "k" }, null, false],
  ] as const)("C9: el atajo — %s", async (_caso, evento, foco, abre) => {
    const { nodo } = await pintar("#/tickets");
    entorno.document.activeElement = foco === null ? null : { tagName: foco };
    teclear(evento);
    await new Promise((r) => setImmediate(r));
    expect(nodo("pedir-cambio").open).toBe(abre);
  });

  it("C10: al abrirse el panel, el foco queda en su campo de texto", async () => {
    const { nodo } = await pintar("#/tickets");
    await disparar(nodo("pedir-cambio-boton"), "click");
    const campo = campoDelChat(nodo("pedir-cambio-cuerpo"));
    expect(campo).toBeDefined();
    expect(entorno.document.activeElement).toBe(campo);
  });

  it("C12: el chat del panel usa las mismas llamadas /api/chat/config de la vista anterior", async () => {
    const { nodo, llamadas } = await pintar("#/tickets", {
      "/api/chat/config": {
        ok: true,
        summary: "Declara el gate de plan.",
        model: "modelo-de-prueba",
        usage: { costUsd: 0 },
        latencyMs: 1,
        changes: [
          {
            file: "config",
            label: ".valmen/config.yaml",
            reason: "pedido",
            ok: true,
            unchanged: false,
            sensitive: false,
            diff: [{ kind: "add", text: "gates: [plan]" }],
            text: "name: Demo\ngates: [plan]\n",
          },
        ],
      },
      "/api/chat/config/apply": { ok: true },
    });
    await disparar(nodo("pedir-cambio-boton"), "click");
    const cuerpo = nodo("pedir-cambio-cuerpo");
    const campo = campoDelChat(cuerpo) as NodoFalso;
    campo.value = "Declara el gate de plan.";
    await disparar(boton(cuerpo, "Proponer cambios") as NodoFalso, "click");
    expect(llamadas).toContainEqual({
      ruta: "/api/chat/config",
      metodo: "POST",
      cuerpo: { message: "Declara el gate de plan." },
    });
    await disparar(boton(cuerpo, "Aplicar") as NodoFalso, "click");
    expect(llamadas).toContainEqual({
      ruta: "/api/chat/config/apply",
      metodo: "POST",
      cuerpo: { changes: [{ file: "config", text: "name: Demo\ngates: [plan]\n" }] },
    });
  });
});

describe("las rutas viejas (regresión)", () => {
  it("C13: #/configurar abre el panel «Pedir un cambio»", async () => {
    const { vista, nodo } = await pintar("#/configurar", null);
    expect(vista.fallos).toEqual([]);
    expect(nodo("pedir-cambio").open).toBe(true);
    expect(campoDelChat(nodo("pedir-cambio-cuerpo"))).toBeDefined();
    expect(vista.texto).not.toContain("No se pudo cargar la vista");
  });

  it("C14: #/configuracion muestra el editor de la configuración del proyecto con el título «Proyecto»", async () => {
    const texto = "name: Demo\n";
    const { vista, nodo } = await pintar("#/configuracion", {
      "/api/config": {
        config: { ...checkConfig(RAIZ, texto), text: texto, diff: [] },
        impact: null,
      },
      "/api/config/check": { config: checkConfig(RAIZ, texto), impact: null },
      "/api/authorizations/options": {
        source: "registry",
        modules: [{ module: "WEB", tickets: 2 }],
        approval: {
          types: ["BUGFIX", "FEATURE"],
          stages: ["analysis", "plan"],
          modes: ["on-approve", "reviewer"],
          impacts: ["sync_impact"],
        },
        qa: { types: ["BUGFIX", "FEATURE"] },
      },
    });
    expect(vista.fallos).toEqual([]);
    expect(vista.texto).toContain("Configuración del proyecto");
    expect(buscarNodos(vista.contenido, (n) => n.tagName === "TEXTAREA")).toHaveLength(1);
    expect(String(nodo("titulo-vista")._texto)).toBe("Proyecto");
  });
});
