/**
 * La sección «Perfiles» de la vista Modelos de Mission Control.
 *
 * Se ejecuta la interfaz de verdad (el HTML con un DOM mínimo) con respuestas simuladas y
 * se registran las llamadas: lo que importa es qué se pinta y qué se manda al servidor.
 */
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PERFILES_INCORPORADOS, ROLES } from "../packages/adapter/src/index.js";
import { buscarNodos, disparar, ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";
import type { NodoFalso } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");

const EJECUTORES = ["claude", "codex", "opencode", "hermes"];
const DEL_PROYECTO = {
  id: "mi-perfil",
  description: "Del proyecto",
  origen: "proyecto",
  roles: PERFILES_INCORPORADOS[0]!.roles,
};

interface Llamada {
  readonly ruta: string;
  readonly metodo: string;
  readonly cuerpo: Record<string, unknown> | null;
}

interface Escenario {
  readonly perfiles?: readonly unknown[];
  readonly seleccion?: { proyecto: string | null; ejecutores: Record<string, string> };
  readonly error?: string;
  readonly guardado?: unknown;
}

const ROUTING = {
  preset: "balanced",
  text: "",
  ok: true,
  roles: [
    {
      role: "gate-evaluator",
      description: "Responde las proposiciones de un gate",
      consumer: "valmen gate",
      provider: "openrouter",
      model: "typesafe/jev-1.13",
      effort: "auto",
      source: "preset",
    },
  ],
  presets: [{ id: "balanced", description: "equilibrado" }],
};

async function pintar(escenario: Escenario = {}) {
  const llamadas: Llamada[] = [];
  const vista = await ejecutarInterfaz(HTML, {
    hash: "#/modelos",
    respuesta: (ruta, init) => {
      const url = new URL(ruta, "http://localhost");
      const cuerpo = init?.body === undefined ? null : (JSON.parse(String(init.body)) as Record<string, unknown>);
      llamadas.push({ ruta: url.pathname, metodo: init?.method ?? "GET", cuerpo });
      if (url.pathname === "/api/health") return { root: RAIZ };
      if (url.pathname === "/api/providers") {
        return {
          providers: [
            { id: "claude-code", name: "Claude Code", configured: true, listable: false },
            { id: "codex", name: "Codex", configured: true, listable: false },
          ],
        };
      }
      if (url.pathname === "/api/routing") return { routing: ROUTING, adopted: false, catalog: { source: "presets", models: [] } };
      if (url.pathname === "/api/routing/preview") return { text: "", routing: { ...ROUTING, diff: [] } };
      if (url.pathname === "/api/perfiles" && (init?.method ?? "GET") === "GET") {
        return {
          perfiles: escenario.perfiles ?? [...PERFILES_INCORPORADOS, DEL_PROYECTO],
          seleccion: escenario.seleccion ?? { proyecto: null, ejecutores: {} },
          ejecutores: EJECUTORES,
          roles: ROLES,
          ...(escenario.error === undefined ? {} : { error: escenario.error }),
        };
      }
      if (url.pathname === "/api/perfiles") {
        return escenario.guardado ?? { ok: true, errores: [], written: true };
      }
      if (url.pathname === "/api/perfiles/seleccion") return { ok: true, errores: [], written: true };
      return {};
    },
  });
  return { vista, llamadas };
}

type Vista = { contenido: NodoFalso | undefined };
const nodos = (v: Vista, predicado: (n: NodoFalso) => boolean): NodoFalso[] =>
  buscarNodos(v.contenido, predicado);
const clase = (n: NodoFalso, nombre: string): boolean => String(n.className ?? "").split(" ").includes(nombre);
const textoDe = (n: NodoFalso): string => String(n._texto);
const filas = (v: Vista): NodoFalso[] => nodos(v, (n) => clase(n, "fila-perfil"));
const botonesDe = (n: NodoFalso): NodoFalso[] => buscarNodos(n, (x) => x.tagName === "BUTTON");
const fila = (v: Vista, id: string): NodoFalso =>
  filas(v).find((f) => buscarNodos(f, (x) => textoDe(x) === id).length > 0) as NodoFalso;
const boton = (n: NodoFalso, texto: string): NodoFalso | undefined =>
  botonesDe(n).find((b) => textoDe(b) === texto);
const etiqueta = (v: Vista, texto: string): NodoFalso =>
  nodos(v, (n) => n.tagName === "LABEL" && textoDe(n) === texto)[0] as NodoFalso;
const selectDe = (n: NodoFalso): NodoFalso => buscarNodos(n, (x) => x.tagName === "SELECT")[0] as NodoFalso;

describe("la sección Perfiles", () => {
  it("R-PERF-002 pantalla lista", async () => {
    const { vista } = await pintar();
    expect(vista.fallos).toEqual([]);
    expect(vista.texto).toContain("Perfiles");
    expect(filas(vista)).toHaveLength(PERFILES_INCORPORADOS.length + 1);
    expect(textoDe(buscarNodos(fila(vista, "codex-completo"), (n) => clase(n, "origen-perfil"))[0] as NodoFalso)).toBe("incorporado");
    expect(textoDe(buscarNodos(fila(vista, "mi-perfil"), (n) => clase(n, "origen-perfil"))[0] as NodoFalso)).toBe("del proyecto");
  });

  it("R-PERF-002 pantalla marca la elección", async () => {
    const { vista } = await pintar({
      seleccion: { proyecto: "mi-perfil", ejecutores: { hermes: "codex-completo" } },
    });
    const marcas = (id: string) =>
      buscarNodos(fila(vista, id), (n) => clase(n, "marca-perfil")).map(textoDe);
    expect(marcas("mi-perfil")).toEqual(["elegido para el proyecto"]);
    expect(marcas("codex-completo")).toEqual(["elegido para hermes"]);
    expect(marcas("claude-code-completo")).toEqual([]);
  });

  it("R-PERF-002 pantalla elige", async () => {
    const { vista, llamadas } = await pintar();
    const sel = selectDe(etiqueta(vista, "Perfil del proyecto"));
    sel.value = "codex-completo";
    await disparar(sel, "change");
    const put = llamadas.find((l) => l.ruta === "/api/perfiles/seleccion" && l.metodo === "PUT");
    expect(put?.cuerpo).toEqual({ perfil: "codex-completo" });
  });

  it("R-PERF-002 pantalla elige por ejecutor", async () => {
    const { vista, llamadas } = await pintar();
    const sel = selectDe(etiqueta(vista, "Perfil de hermes"));
    sel.value = "codex-completo";
    await disparar(sel, "change");
    const put = llamadas.find((l) => l.ruta === "/api/perfiles/seleccion" && l.metodo === "PUT");
    expect(put?.cuerpo).toEqual({ perfil: "codex-completo", ejecutor: "hermes" });
  });

  it("R-PERF-002 pantalla crea", async () => {
    const { vista, llamadas } = await pintar();
    await disparar(boton(fila(vista, "codex-completo"), "Crear a partir de este") as NodoFalso, "click");
    const campoId = nodos(vista, (n) => n.tagName === "INPUT" && n.placeholder === "mi-perfil")[0] as NodoFalso;
    campoId.value = "copia-codex";
    await disparar(boton(vista.contenido as NodoFalso, "Guardar el perfil") as NodoFalso, "click");
    const put = llamadas.find((l) => l.ruta === "/api/perfiles" && l.metodo === "PUT");
    expect(put?.cuerpo?.["base"]).toBe("codex-completo");
    expect(put?.cuerpo?.["id"]).toBe("copia-codex");
    const base = PERFILES_INCORPORADOS.find((p) => p.id === "codex-completo")!;
    const enviados = put?.cuerpo?.["roles"] as Record<string, { model: string }>;
    expect(enviados["agent-implementation"]?.model).toBe(base.roles["agent-implementation"]?.model);
  });

  it("R-PERF-002 pantalla incorporados", async () => {
    const { vista } = await pintar();
    for (const perfil of PERFILES_INCORPORADOS) {
      expect(boton(fila(vista, perfil.id), "Editar")).toBeUndefined();
      expect(boton(fila(vista, perfil.id), "Crear a partir de este")).toBeDefined();
    }
    expect(boton(fila(vista, "mi-perfil"), "Editar")).toBeDefined();
  });

  it("R-PERF-002 pantalla rechazo", async () => {
    const error = "rol agent-plan: el modelo gpt-9-inventado no existe en el catálogo de codex";
    const { vista } = await pintar({ guardado: { ok: false, errores: [error], written: false } });
    await disparar(boton(fila(vista, "mi-perfil"), "Editar") as NodoFalso, "click");
    await disparar(boton(vista.contenido as NodoFalso, "Guardar el perfil") as NodoFalso, "click");
    const vivo = nodos(vista, () => true).map(textoDe).join("\n");
    expect(vivo).toContain(error);
    expect(boton(vista.contenido as NodoFalso, "Guardar el perfil")).toBeDefined();
  });

  it("R-PERF-002 pantalla archivo ilegible", async () => {
    const { vista } = await pintar({ error: "config.yaml línea 2: la clave \"Mal Id\" no es válida" });
    expect(vista.fallos).toEqual([]);
    expect(vista.texto).toContain("Mal Id");
    expect(vista.texto).toContain("Modelo por rol");
    expect(vista.texto).toContain("gate-evaluator");
  });
});
