/**
 * La vista Ajustes › Modelos rediseñada (FEATURE-WEB-AJUSTES-MODELOS-20261014: R-AJU-001,
 * R-AJU-002, R-AJU-003 y la parte de Modelos de R-MARCO-006).
 *
 * Se ejecuta la interfaz con el DOM mínimo de `scripts/verificar-interfaz.mjs` y respuestas
 * simuladas con la forma real de `/api/routing`, `/api/perfiles` y `/api/modelos/fases`, y se
 * registran las llamadas. Boceto de referencia:
 * `.valmen/features/rediseno-mission-control/assets/modelos.html` (captura `modelos.png`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PERFILES_INCORPORADOS, ROLES } from "../packages/adapter/src/index.js";
import { buscarNodos, disparar, ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";
import type { NodoFalso } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");
const EJECUTORES = ["claude", "codex", "opencode", "hermes"];
const PERFIL = PERFILES_INCORPORADOS.find((p) => p.id === "claude-code-completo")!;

/** Los roles que el proyecto define en `routing.yaml`: implementación con otro modelo. */
const DEL_PROYECTO: Record<string, { provider: string; model: string; effort: string }> = {
  "agent-implementation": { provider: "claude-code", model: "claude-opus-5-5", effort: "high" },
  escalation: { provider: "claude-code", model: "claude-sonnet-5-5", effort: "high" },
};
const TEXTO_ROUTING =
  "preset: quality\nroles:\n" +
  Object.entries(DEL_PROYECTO)
    .map(([rol, r]) => `  ${rol}:\n    provider: ${r.provider}\n    model: ${r.model}\n    effort: ${r.effort}\n`)
    .join("");

/** Los trece roles resueltos como los devuelve `checkRouting`. */
const RUTAS = ROLES.map((spec) => {
  const propio = DEL_PROYECTO[spec.id];
  const delPerfil = PERFIL.roles[spec.id]!;
  return {
    role: spec.id,
    description: spec.description,
    consumer: spec.consumer,
    ...(propio ?? delPerfil),
    source: propio === undefined ? "perfil" : "proyecto",
    ...(propio === undefined
      ? { perfil: { id: PERFIL.id, alcance: "proyecto" } }
      : { anulaPerfil: PERFIL.id }),
    probabilistic: false,
  };
});
const ROUTING = {
  preset: "quality",
  text: TEXTO_ROUTING,
  ok: true,
  error: "",
  roles: RUTAS,
  presets: [{ id: "quality", description: "Máxima calidad" }],
  diff: [],
};
const VISTA_PREVIA = "preset: quality\nroles:\n  escalation:\n    provider: claude-code\n";

interface Llamada {
  readonly ruta: string;
  readonly query: string;
  readonly metodo: string;
  readonly cuerpo: Record<string, unknown> | null;
}

async function pintar(opciones: { seleccion?: unknown; localStorage?: Record<string, string> } = {}) {
  const llamadas: Llamada[] = [];
  const vista = await ejecutarInterfaz(HTML, {
    hash: "#/modelos",
    ...(opciones.localStorage === undefined ? {} : { localStorage: opciones.localStorage }),
    respuesta: (ruta: string, init?: { method?: string; body?: unknown }) => {
      const url = new URL(ruta, "http://localhost");
      const metodo = init?.method ?? "GET";
      const cuerpo =
        init?.body === undefined ? null : (JSON.parse(String(init.body)) as Record<string, unknown>);
      llamadas.push({ ruta: url.pathname, query: url.search, metodo, cuerpo });
      if (url.pathname === "/api/health") return { root: RAIZ };
      if (url.pathname === "/api/providers") return { providers: [] };
      if (url.pathname === "/api/routing/preview") {
        return { text: VISTA_PREVIA, routing: { ...ROUTING, diff: [{ kind: "remove", text: "  agent-implementation:" }] } };
      }
      if (url.pathname === "/api/routing" && metodo === "PUT") {
        return { text: VISTA_PREVIA, routing: { ...ROUTING, written: true } };
      }
      if (url.pathname === "/api/routing") {
        return { routing: ROUTING, adopted: true, catalog: { source: "presets", models: [] } };
      }
      if (url.pathname === "/api/perfiles") {
        return {
          perfiles: PERFILES_INCORPORADOS,
          seleccion: opciones.seleccion ?? {
            proyecto: "claude-code-completo",
            ejecutores: { claude: "claude-code-completo" },
          },
          ejecutores: EJECUTORES,
          roles: ROLES,
        };
      }
      if (url.pathname === "/api/modelos/fases") {
        const ejecutor = url.searchParams.get("ejecutor");
        return {
          ejecutor,
          ejecutores: EJECUTORES,
          fases: ["analysis", "plan", "implementation", "verification"].map((fase) => ({
            fase,
            rol: `agent-${fase}`,
            provider: "claude-code",
            model: "claude-opus-5-5",
            effort: "high",
            origen: { source: "perfil", perfil: { id: PERFIL.id, alcance: "proyecto" } },
            usado: null,
          })),
          aviso: null,
        };
      }
      return {};
    },
  });
  return { vista, llamadas };
}

type Vista = Awaited<ReturnType<typeof pintar>>["vista"];
const clase = (n: NodoFalso, nombre: string): boolean =>
  String(n.className ?? "").split(" ").includes(nombre);
const conClase = (raiz: NodoFalso | undefined, nombre: string): NodoFalso[] =>
  buscarNodos(raiz, (n) => clase(n, nombre));
const textoTodo = (raiz: NodoFalso | undefined): string =>
  buscarNodos(raiz, () => true)
    .map((n) => String(n._texto ?? ""))
    .join(" | ");
const boton = (raiz: NodoFalso | undefined, texto: string): NodoFalso =>
  buscarNodos(raiz, (n) => n.tagName === "BUTTON" && String(n._texto) === texto)[0] as NodoFalso;
const bloques = (v: Vista): NodoFalso[] => (v.contenido?.children ?? []) as NodoFalso[];
const indiceDe = (v: Vista, nombre: string): number =>
  bloques(v).findIndex((n) => clase(n, nombre));

describe("R-AJU-001: Modelos abre con el perfil activo como primer bloque", () => {
  it("C1-C2, C5: la primera sección es el perfil activo con su id, descripción, marcas y precedencia", async () => {
    const { vista } = await pintar();
    expect(vista.fallos).toEqual([]);
    const secciones = bloques(vista).filter((n) => n.tagName === "SECTION");
    const perfil = secciones[0] as NodoFalso;
    expect(perfil.attrs["aria-label"]).toBe("Perfil activo");
    expect(textoTodo(conClase(perfil, "perfil-id")[0])).toContain("claude-code-completo");
    expect(textoTodo(perfil)).toContain(PERFIL.description);
    expect(conClase(perfil, "marca-eleccion").map((n) => n._texto)).toEqual([
      "elegido para el proyecto",
      "elegido para Claude Code",
    ]);
    expect(
      conClase(conClase(perfil, "precedencia")[0], "marca-origen").map((n) => n._texto),
    ).toEqual(["cambiado aquí", "del perfil", "preset base"]);
  });

  it("C3: «Duplicar y editar» abre el editor a partir del perfil activo", async () => {
    const { vista } = await pintar();
    await disparar(boton(vista.contenido, "Duplicar y editar"), "click");
    expect(vista.texto).not.toContain("Nuevo perfil a partir de claude-code-completo");
    expect(textoTodo(vista.contenido)).toContain("Nuevo perfil a partir de claude-code-completo");
    expect(conClase(vista.contenido, "avanzado-modelos")[0]?.open).toBe(true);
  });

  it("C4: «Cambiar de perfil» abre «Avanzado» con el foco en «Perfil del proyecto»", async () => {
    const { vista } = await pintar();
    await disparar(boton(vista.contenido, "Cambiar de perfil"), "click");
    expect(conClase(vista.contenido, "avanzado-modelos")[0]?.open).toBe(true);
    const etiqueta = buscarNodos(
      vista.contenido,
      (n) => n.tagName === "LABEL" && n._texto === "Perfil del proyecto",
    )[0] as NodoFalso;
    const selector = buscarNodos(etiqueta, (n) => n.tagName === "SELECT")[0];
    expect(globalThis.document.activeElement).toBe(selector);
  });
});

describe("R-AJU-002: los roles agrupados con el origen de cada modelo", () => {
  it("C6, C14: los grupos van tras el perfil en orden y «Avanzado» queda plegado con lo de hoy dentro", async () => {
    const { vista } = await pintar();
    const grupos = bloques(vista).filter((n) => clase(n, "grupo-roles"));
    expect(grupos.map((g) => buscarNodos(g, (n) => n.tagName === "H2")[0]?._texto)).toEqual([
      "El agente",
      "Coordinación",
      "Compuertas y revisión",
    ]);
    expect(indiceDe(vista, "perfil-activo-modelos")).toBeLessThan(indiceDe(vista, "grupo-roles"));
    const avanzado = conClase(vista.contenido, "avanzado-modelos")[0] as NodoFalso;
    expect(avanzado.tagName).toBe("DETAILS");
    expect(avanzado.open).toBe(false);
    const dentro = textoTodo(avanzado);
    for (const seccion of ["Perfiles", "Modelo por fase", "Preset", "Modelo por rol"]) {
      expect(dentro).toContain(seccion);
    }
  });

  it("C7-C9: una tarjeta por fase; la cambiada dice qué daría el perfil y la del perfil lo dice", async () => {
    const { vista } = await pintar();
    const tarjetas = conClase(vista.contenido, "tarjeta-fase");
    expect(tarjetas.map((t) => conClase(t, "nombre-fase")[0]?._texto)).toEqual([
      "Análisis",
      "Plan",
      "Implementación",
      "Verificación",
    ]);
    const [analisis, , implementacion] = tarjetas as [NodoFalso, NodoFalso, NodoFalso];
    expect(textoTodo(analisis)).toContain("claude-opus-5-5");
    expect(textoTodo(analisis)).toContain("esfuerzo alto");
    expect(conClase(analisis, "marca-origen")[0]?._texto).toBe("del perfil");
    expect(clase(analisis, "cambiada")).toBe(false);
    expect(clase(implementacion, "cambiada")).toBe(true);
    expect(conClase(implementacion, "marca-origen")[0]?._texto).toBe("cambiado aquí");
    expect(textoTodo(implementacion)).toContain("El perfil diría");
    expect(textoTodo(implementacion)).toContain("claude-sonnet-5-5");
    expect(boton(implementacion, "Volver al perfil")).toBeDefined();
  });

  it("C10-C11: «Volver al perfil» muestra las diferencias sin esa fase y solo «Confirmar» escribe", async () => {
    const { vista, llamadas } = await pintar();
    const implementacion = conClase(vista.contenido, "tarjeta-fase")[2] as NodoFalso;
    const antes = llamadas.length;
    await disparar(boton(implementacion, "Volver al perfil"), "click");
    const previa = llamadas.slice(antes).find((l) => l.ruta === "/api/routing/preview");
    const roles = previa?.cuerpo?.["roles"] as Record<string, unknown>;
    expect(Object.keys(roles)).toEqual(["escalation"]);
    expect(textoTodo(implementacion)).toContain("agent-implementation:");
    expect(llamadas.some((l) => l.ruta === "/api/routing" && l.metodo === "PUT")).toBe(false);
    await disparar(boton(implementacion, "Confirmar"), "click");
    const put = llamadas.find((l) => l.ruta === "/api/routing" && l.metodo === "PUT");
    expect(put?.cuerpo).toEqual({ text: VISTA_PREVIA });
  });

  it("C12-C13: Coordinación con su origen y Compuertas y revisión con su proveedor", async () => {
    const { vista } = await pintar();
    const [, coordinacion, compuertas] = bloques(vista).filter((n) => clase(n, "grupo-roles")) as [
      NodoFalso,
      NodoFalso,
      NodoFalso,
    ];
    const filas = (g: NodoFalso) =>
      conClase(g, "fila-rol").filter((f) => !clase(f, "cabecera"));
    expect(filas(coordinacion).map((f) => conClase(f, "trabajo")[0]?._texto)).toEqual([
      "Orquestador",
      "Arquitecto",
      "Especificación de UI",
    ]);
    expect(filas(coordinacion).map((f) => conClase(f, "marca-origen")[0]?._texto)).toEqual([
      "del perfil",
      "del perfil",
      "del perfil",
    ]);
    expect(filas(compuertas).map((f) => conClase(f, "trabajo")[0]?._texto)).toEqual([
      "Evaluador de compuertas",
      "Verificador",
      "Juez de respaldo",
      "Productor",
      "Revisor",
      "Escalada",
    ]);
    expect(textoTodo(filas(compuertas)[0])).toContain("openrouter");
    expect(textoTodo(filas(compuertas)[5])).toContain("claude-code");
  });
});

describe("R-AJU-003: aviso cuando el perfil no se aplica por falta de cliente declarado", () => {
  it("C15-C16: el aviso va bajo el perfil y «Declarar» lo cambia por la corrección de la sesión", async () => {
    const { vista, llamadas } = await pintar();
    const i = indiceDe(vista, "aviso-cliente");
    expect(i).toBeGreaterThan(indiceDe(vista, "perfil-activo-modelos"));
    expect(i).toBeLessThan(indiceDe(vista, "grupo-roles"));
    const aviso = bloques(vista)[i] as NodoFalso;
    expect(textoTodo(aviso)).toContain("Las fases del agente usan el modelo de la sesión");
    const etiqueta = buscarNodos(aviso, (n) => n.tagName === "LABEL")[0] as NodoFalso;
    expect(etiqueta._texto).toBe("Cliente");
    const selector = buscarNodos(etiqueta, (n) => n.tagName === "SELECT")[0] as NodoFalso;
    selector.value = "claude";
    await disparar(boton(aviso, "Declarar"), "click");
    expect(
      llamadas.some((l) => l.ruta === "/api/modelos/fases" && l.query === "?ejecutor=claude"),
    ).toBe(true);
    expect(textoTodo(aviso)).toContain("valmen resume --cliente claude");
    expect(textoTodo(aviso)).not.toContain("Las fases del agente usan el modelo de la sesión");
  });

  it("con un cliente ya declarado en esta pantalla no hay aviso ámbar", async () => {
    const { vista } = await pintar({ localStorage: { "valmen-cliente-modelos": "codex" } });
    const aviso = bloques(vista)[indiceDe(vista, "aviso-cliente")] as NodoFalso;
    expect(textoTodo(aviso)).toContain("valmen resume --cliente codex");
    expect(clase(aviso, "sin-cliente")).toBe(false);
  });
});

describe("R-MARCO-006: Modelos en el celular", () => {
  it("C17: por debajo de 768 px las tarjetas y las tablas de roles pasan a una columna", () => {
    const fuente = readFileSync(HTML, "utf8");
    const bloquesMovil = [...fuente.matchAll(/@media \(max-width: 767px\) \{/g)].map((m) => {
      let profundidad = 0;
      let i = (m.index ?? 0) + m[0].length - 1;
      const inicio = i;
      do {
        if (fuente[i] === "{") profundidad += 1;
        else if (fuente[i] === "}") profundidad -= 1;
        i += 1;
      } while (profundidad > 0);
      return fuente.slice(inicio, i);
    });
    const deModelos = bloquesMovil.find((b) => b.includes(".tarjetas-fase"));
    expect(deModelos).toBeDefined();
    expect(deModelos).toMatch(/\.tarjetas-fase\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(deModelos).toMatch(/\.fila-rol\s*\{[^}]*grid-template-columns:\s*1fr/);
  });
});
