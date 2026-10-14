/**
 * Ajustes › Modelos › Cambiar de perfil (FEATURE-WEB-AJUSTES-CAMBIAR-PERFIL-20261014: R-AJU-004
 * y la parte de esta pantalla de R-MARCO-006).
 *
 * Se ejecuta `#/modelos/perfil` con el DOM mínimo de `scripts/verificar-interfaz.mjs` y respuestas
 * simuladas con la forma real de `/api/perfiles`, `/api/routing`, `/api/providers` y
 * `PUT /api/perfiles/seleccion`, y se registran las llamadas. Boceto de referencia:
 * `.valmen/features/rediseno-mission-control/assets/modelos-cambiar-perfil.html`.
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
const ACTIVO = PERFILES_INCORPORADOS.find((p) => p.id === "claude-code-completo")!;

/** Un perfil del proyecto igual al activo salvo el plan: la tabla solo debe listar «Plan». */
const DEL_PROYECTO = {
  id: "mi-perfil",
  description: "Como Claude Code, con otro plan.",
  origen: "proyecto",
  roles: {
    ...ACTIVO.roles,
    "agent-plan": { provider: "claude-code", model: "claude-sonnet-5-5", effort: "medium" },
  },
};
const PERFILES = [...PERFILES_INCORPORADOS, DEL_PROYECTO];

/** `routing.yaml` define en el proyecto la implementación: el aviso debe nombrarla. */
const TEXTO_ROUTING =
  "preset: balanced\nroles:\n  agent-implementation:\n    provider: claude-code\n    model: claude-opus-5-5\n    effort: high\n";
const RUTAS = ROLES.map((spec) => {
  const propio = spec.id === "agent-implementation";
  return {
    role: spec.id,
    description: spec.description,
    consumer: spec.consumer,
    ...(propio
      ? { provider: "claude-code", model: "claude-opus-5-5", effort: "high" }
      : ACTIVO.roles[spec.id]!),
    source: propio ? "proyecto" : "perfil",
    probabilistic: false,
  };
});
const ROUTING = {
  preset: "balanced",
  text: TEXTO_ROUTING,
  ok: true,
  error: "",
  roles: RUTAS,
  presets: [{ id: "balanced", description: "Equilibrado" }],
  diff: [],
};
const VISTA_PREVIA = "preset: balanced\n";
const PROVEEDORES = [
  { id: "claude-code", name: "Claude Code (suscripción)", configured: true, source: "cli" },
  { id: "codex", name: "Codex (suscripción)", configured: true, source: "cli" },
  { id: "opencode-go", name: "opencode Go (suscripción)", configured: true, source: "credentials-file" },
  { id: "openrouter", name: "OpenRouter", configured: true, source: "environment" },
];

interface Llamada {
  readonly ruta: string;
  readonly metodo: string;
  readonly cuerpo: Record<string, unknown> | null;
}

async function pintar(opciones: { rechazo?: boolean } = {}) {
  const llamadas: Llamada[] = [];
  const vista = await ejecutarInterfaz(HTML, {
    hash: "#/modelos/perfil",
    respuesta: (ruta: string, init?: { method?: string; body?: unknown }) => {
      const url = new URL(ruta, "http://localhost");
      const metodo = init?.method ?? "GET";
      const cuerpo =
        init?.body === undefined ? null : (JSON.parse(String(init.body)) as Record<string, unknown>);
      llamadas.push({ ruta: url.pathname, metodo, cuerpo });
      if (url.pathname === "/api/health") return { root: RAIZ };
      if (url.pathname === "/api/providers") return { providers: PROVEEDORES };
      if (url.pathname === "/api/perfiles/seleccion") {
        return opciones.rechazo
          ? { ok: false, errores: ['el perfil "codex-completo" no existe.'], written: false }
          : { ok: true, errores: [], written: true };
      }
      if (url.pathname === "/api/perfiles") {
        return {
          perfiles: PERFILES,
          seleccion: { proyecto: "claude-code-completo", ejecutores: { claude: "claude-code-completo" } },
          ejecutores: EJECUTORES,
          roles: ROLES,
        };
      }
      if (url.pathname === "/api/routing/preview") {
        return { text: VISTA_PREVIA, routing: { ...ROUTING, diff: [{ kind: "remove", text: "  agent-implementation:" }] } };
      }
      if (url.pathname === "/api/routing" && metodo === "PUT") {
        return { text: VISTA_PREVIA, routing: { ...ROUTING, written: true } };
      }
      if (url.pathname === "/api/routing") {
        return { routing: ROUTING, adopted: true, catalog: { source: "presets", models: [] } };
      }
      return {};
    },
  });
  return { vista, llamadas };
}

/** Lo que estas pruebas leen además de `NodoFalso`: enlaces, radios y la ventana simulada. */
type Campo = NodoFalso & { href?: string; type?: string; checked?: boolean };
const ventana = globalThis as unknown as {
  location: { hash: string };
  window: { dispatchEvent(evento: { type: string }): void };
};
const clase = (n: NodoFalso, nombre: string): boolean =>
  String(n.className ?? "").split(" ").includes(nombre);
const conClase = (raiz: NodoFalso | undefined, nombre: string): NodoFalso[] =>
  buscarNodos(raiz, (n) => clase(n, nombre));
const textoTodo = (raiz: NodoFalso | undefined): string =>
  buscarNodos(raiz, () => true)
    .map((n) => String(n._texto ?? ""))
    .join(" | ");
const boton = (raiz: NodoFalso | undefined, texto: string): NodoFalso | undefined =>
  buscarNodos(raiz, (n) => n.tagName === "BUTTON" && String(n._texto) === texto)[0];
const tarjeta = (raiz: NodoFalso | undefined, id: string): NodoFalso =>
  conClase(raiz, "tarjeta-perfil").find((t) => textoTodo(t).includes(id)) as NodoFalso;
const escrituras = (llamadas: Llamada[]): Llamada[] => llamadas.filter((l) => l.metodo !== "GET");
async function esperar(): Promise<void> {
  for (let i = 0; i < 40; i += 1) await new Promise((r) => setImmediate(r));
}
async function elegir(vista: Awaited<ReturnType<typeof pintar>>["vista"], id: string) {
  await disparar(tarjeta(vista.contenido, id), "click");
}

describe("R-AJU-004: cambiar de perfil muestra qué cambia antes de aplicarlo", () => {
  it("C1-C3: título, miga a Modelos y una tarjeta por perfil con su proveedor; la activa marcada", async () => {
    const { vista } = await pintar();
    expect(vista.fallos).toEqual([]);
    expect(buscarNodos(vista.contenido, (n) => n.tagName === "H1")[0]?._texto).toBe(
      "Elige un perfil y mira qué cambia antes de aplicarlo",
    );
    const miga = buscarNodos(vista.contenido, (n) => n.attrs?.["aria-label"] === "Ruta")[0];
    const enlace = buscarNodos(miga, (n) => n.tagName === "A")[0] as Campo;
    expect(enlace.href).toBe("#/modelos");
    expect(enlace._texto).toBe("Ajustes · Modelos");
    expect(textoTodo(miga)).toContain("Cambiar de perfil");

    const tarjetas = conClase(vista.contenido, "tarjeta-perfil");
    expect(tarjetas).toHaveLength(PERFILES.length);
    for (const [id, origen, proveedor] of [
      ["claude-code-completo", "incorporado", "claude-code · detectado"],
      ["codex-completo", "incorporado", "codex · detectado"],
      ["opencode-go", "incorporado", "opencode-go · configurado"],
      ["mi-perfil", "del proyecto", "claude-code · detectado"],
    ] as const) {
      const texto = textoTodo(tarjeta(vista.contenido, id));
      expect(texto).toContain(origen);
      expect(texto).toContain(PERFILES.find((p) => p.id === id)!.description);
      expect(texto).toContain(proveedor);
    }
    expect(conClase(tarjeta(vista.contenido, "claude-code-completo"), "marca-tarjeta")[0]?._texto).toBe(
      "activo",
    );
    expect(conClase(tarjeta(vista.contenido, "codex-completo"), "marca-tarjeta")[0]?._texto ?? "").toBe("");
  });

  it("C5: con el activo seleccionado no hay tabla ni botón de aplicar: dice que ya es el activo", async () => {
    const { vista } = await pintar();
    expect(vista.texto).toContain("Este ya es el perfil activo. Elige otro para ver qué cambiaría.");
    expect(buscarNodos(vista.contenido, (n) => n.tagName === "TABLE")).toHaveLength(0);
    expect(
      buscarNodos(vista.contenido, (n) => n.tagName === "BUTTON" && String(n._texto).startsWith("Aplicar")),
    ).toHaveLength(0);
  });

  it("C6-C10: elegir codex-completo marca la tarjeta sin escribir y muestra la tabla, la nota y el aviso", async () => {
    const { vista, llamadas } = await pintar();
    await elegir(vista, "codex-completo");
    const elegida = tarjeta(vista.contenido, "codex-completo");
    expect(elegida.attrs?.["aria-pressed"]).toBe("true");
    expect(conClase(elegida, "marca-tarjeta")[0]?._texto).toBe("seleccionado");
    expect(escrituras(llamadas)).toEqual([]);

    expect(textoTodo(vista.contenido)).toContain("Qué cambia con");
    const filas = conClase(vista.contenido, "fila-cambio");
    expect(filas.map((f) => conClase(f, "trabajo-cambio")[0]?._texto)).toEqual([
      "Análisis",
      "Plan",
      "Implementación",
      "Verificación",
      "Orquestador",
      "Arquitecto",
      "Especificación de UI",
    ]);
    const [analisis] = filas as [NodoFalso];
    expect(conClase(analisis, "antes")[0]?._texto).toBe("claude-opus-5-5 · alto");
    expect(conClase(analisis, "despues")[0]?._texto).toBe("gpt-6-luna · medio");
    expect(conClase(vista.contenido, "nota-cambio")[0]?._texto).toBe(
      "Las 6 compuertas y revisiones no cambian: siguen en Jev y OpenRouter.",
    );
    const avisos = conClase(vista.contenido, "aviso-fase");
    expect(avisos).toHaveLength(1);
    // El nombre va en negrita, como en el boceto: el texto se lee uniendo los nodos.
    expect(textoTodo(avisos[0]).replaceAll(" | ", "")).toContain(
      "Implementación está cambiada en este proyecto y se queda como está.",
    );
    expect(boton(avisos[0], "Que también siga al perfil")).toBeDefined();
    expect(boton(vista.contenido, "Aplicar codex-completo")).toBeDefined();
  });

  it("C8: la tabla omite los trabajos con la misma ruta en los dos perfiles", async () => {
    const { vista } = await pintar();
    await elegir(vista, "mi-perfil");
    const filas = conClase(vista.contenido, "fila-cambio");
    expect(filas.map((f) => conClase(f, "trabajo-cambio")[0]?._texto)).toEqual(["Plan"]);
  });

  it("C11: «Que también siga al perfil» solo escribe routing.yaml tras «Confirmar» las diferencias", async () => {
    const { vista, llamadas } = await pintar();
    await elegir(vista, "codex-completo");
    const aviso = conClase(vista.contenido, "aviso-fase")[0] as NodoFalso;
    await disparar(boton(aviso, "Que también siga al perfil") as NodoFalso, "click");
    expect(llamadas.some((l) => l.ruta === "/api/routing/preview")).toBe(true);
    expect(textoTodo(aviso)).toContain("agent-implementation:");
    expect(llamadas.some((l) => l.ruta === "/api/routing" && l.metodo === "PUT")).toBe(false);
    await disparar(boton(aviso, "Confirmar") as NodoFalso, "click");
    const put = llamadas.find((l) => l.ruta === "/api/routing" && l.metodo === "PUT");
    expect(put?.cuerpo).toEqual({ text: VISTA_PREVIA });
  });

  it("C12-C15: «Dónde se aplica» recomienda el proyecto; aplicar manda la elección y vuelve a Modelos", async () => {
    const casos = [
      { alcance: "proyecto", cuerpo: { perfil: "codex-completo" } },
      { alcance: "cliente", cuerpo: { perfil: "codex-completo", ejecutor: "codex" } },
    ] as const;
    for (const caso of casos) {
      const { vista, llamadas } = await pintar();
      await elegir(vista, "codex-completo");
      const radios = buscarNodos(vista.contenido, (n) => n.tagName === "INPUT" && (n as Campo).type === "radio") as Campo[];
      expect(radios).toHaveLength(2);
      expect(radios[0]?.checked).toBe(true);
      expect(textoTodo(radios[0]?.parentNode)).toContain("recomendado");
      expect(textoTodo(radios[0]?.parentNode)).toContain("Todo el proyecto");
      if (caso.alcance === "cliente") {
        const radio = radios[1] as Campo;
        radio.checked = true;
        await disparar(radio, "change");
        const etiqueta = buscarNodos(
          vista.contenido,
          (n) => n.tagName === "LABEL" && n._texto === "Cliente",
        )[0] as NodoFalso;
        const selector = buscarNodos(etiqueta, (n) => n.tagName === "SELECT")[0] as NodoFalso;
        selector.value = "codex";
        await disparar(selector, "change");
      } else {
        expect(buscarNodos(vista.contenido, (n) => n.tagName === "LABEL" && n._texto === "Cliente")).toHaveLength(0);
      }
      await disparar(boton(vista.contenido, "Aplicar codex-completo") as NodoFalso, "click");
      const put = llamadas.find((l) => l.ruta === "/api/perfiles/seleccion" && l.metodo === "PUT");
      expect(put?.cuerpo).toEqual(caso.cuerpo);
      expect(ventana.location.hash).toBe("#/modelos");
    }
  });

  it("C16: un rechazo del servidor se muestra sin salir de la pantalla", async () => {
    const { vista } = await pintar({ rechazo: true });
    await elegir(vista, "codex-completo");
    await disparar(boton(vista.contenido, "Aplicar codex-completo") as NodoFalso, "click");
    expect(textoTodo(vista.contenido)).toContain('el perfil "codex-completo" no existe.');
    expect(ventana.location.hash).toBe("#/modelos/perfil");
  });

  it("C4: «Nuevo perfil» abre en Modelos el editor a partir del seleccionado", async () => {
    const { vista } = await pintar();
    await elegir(vista, "codex-completo");
    const tarjetas = buscarNodos(
      buscarNodos(vista.contenido, (n) => clase(n, "rejilla-perfiles"))[0],
      (n) => n.tagName === "BUTTON",
    );
    const nuevo = tarjetas[tarjetas.length - 1] as NodoFalso;
    expect(textoTodo(nuevo)).toContain("Nuevo perfil");
    expect(textoTodo(nuevo)).toContain("a partir del seleccionado");
    await disparar(nuevo, "click");
    expect(ventana.location.hash).toBe("#/modelos");
    ventana.window.dispatchEvent({ type: "hashchange" });
    await esperar();
    expect(textoTodo(vista.contenido)).toContain("Nuevo perfil a partir de codex-completo");
  });
});

describe("R-MARCO-006: Cambiar de perfil en el celular", () => {
  it("C18: por debajo de 768 px las tarjetas de perfil pasan a una columna", () => {
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
    const deLaPantalla = bloquesMovil.find((b) => b.includes(".rejilla-perfiles"));
    expect(deLaPantalla).toMatch(/\.rejilla-perfiles\s*\{[^}]*grid-template-columns:\s*1fr/);
  });
});
