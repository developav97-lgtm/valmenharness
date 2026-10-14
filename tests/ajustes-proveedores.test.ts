/**
 * Ajustes › Proveedores (FEATURE-WEB-AJUSTES-PROVEEDORES-20261014: R-AJU-005 y la parte de
 * R-MARCO-006 de esta pantalla).
 *
 * La vista se ejecuta con el DOM mínimo de `scripts/verificar-interfaz.mjs` y respuestas
 * simuladas de `GET /api/providers` y `GET /api/perfiles`: una tarjeta por proveedor con
 * su estado (configurado, detectado, sin configurar), si la usa el perfil activo y
 * cuántos trabajos del perfil dependen de él. Boceto de referencia:
 * `.valmen/features/rediseno-mission-control/assets/proveedores.html`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buscarNodos, disparar, ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";
import type { NodoFalso } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");
const html = readFileSync(HTML, "utf8");

/** Un valor que haría las veces de clave: no debe aparecer nunca en la pantalla. */
const MARCADOR = "MARCADOR-DE-CLAVE-NO-MOSTRAR";

const base = {
  envVar: "",
  keyLength: null,
  legacyFieldName: false,
  probeHost: null,
  listable: false,
  testable: false,
};

/** En el orden en que los devuelve `listProviders`. */
const PROVEEDORES = [
  {
    ...base,
    id: "openrouter",
    name: "OpenRouter",
    auth: "api-key",
    configured: true,
    source: "credentials-file",
    keyLength: 35,
    probeable: true,
    probeHost: "openrouter.ai",
    apiKey: MARCADOR,
  },
  {
    ...base,
    id: "deepseek",
    name: "DeepSeek",
    auth: "api-key",
    configured: false,
    source: "none",
    probeable: true,
    probeHost: "api.deepseek.com",
  },
  {
    ...base,
    id: "claude-code",
    name: "Claude Code",
    auth: "subscription",
    configured: true,
    source: "cli",
    cli: "claude",
    probeable: true,
  },
  {
    ...base,
    id: "codex",
    name: "Codex",
    auth: "subscription",
    configured: true,
    source: "cli",
    tokenSource: "~/.codex/auth.json",
    probeable: false,
  },
  {
    ...base,
    id: "opencode-go",
    name: "OpenCode Go",
    auth: "api-key",
    configured: true,
    source: "environment",
    keyLength: 40,
    probeable: true,
    probeHost: "opencode.ai",
  },
  {
    ...base,
    id: "ollama",
    name: "Ollama",
    auth: "none",
    configured: true,
    source: "none",
    probeable: true,
    probeHost: "localhost:11434",
  },
];

const FASES = [
  "orchestrator",
  "architect",
  "ui-specs",
  "agent-analysis",
  "agent-plan",
  "agent-implementation",
  "agent-verification",
];
const EVALUADORES = [
  "gate-evaluator",
  "gate-judge",
  "producer",
  "verifier",
  "escalation",
  "reviewer",
];

function perfil(id: string, proveedor: string) {
  const roles: Record<string, { provider: string; model: string; effort: string }> = {};
  for (const rol of EVALUADORES)
    roles[rol] = { provider: "openrouter", model: "m", effort: "auto" };
  for (const rol of FASES) roles[rol] = { provider: proveedor, model: "m", effort: "auto" };
  return { id, description: id, origen: "incorporado", roles };
}

const PERFILES = [
  perfil("claude-code-completo", "claude-code"),
  perfil("codex-completo", "codex"),
  perfil("opencode-go", "opencode-go"),
];

function perfiles(proyecto: string | null) {
  return { perfiles: PERFILES, seleccion: { proyecto, ejecutores: {} } };
}

interface Llamada {
  readonly ruta: string;
  readonly metodo: string;
  readonly cuerpo: Record<string, unknown> | null;
}

async function pintar(respuestas: Record<string, unknown> = {}) {
  const llamadas: Llamada[] = [];
  const todas: Record<string, unknown> = {
    "/api/health": { root: RAIZ },
    "/api/tickets": { tickets: [] },
    "/api/standards": { proposals: [] },
    "/api/providers": { providers: PROVEEDORES },
    "/api/perfiles": perfiles("claude-code-completo"),
    ...respuestas,
  };
  const vista = await ejecutarInterfaz(HTML, {
    hash: "#/proveedores",
    respuesta: (ruta: string, init?: RequestInit) => {
      const url = new URL(ruta, "http://localhost");
      const cuerpo =
        init?.body === undefined
          ? null
          : (JSON.parse(String(init.body)) as Record<string, unknown>);
      const metodo = init?.method ?? "GET";
      llamadas.push({ ruta: url.pathname, metodo, cuerpo });
      const r = todas[`${metodo} ${url.pathname}`] ?? todas[url.pathname];
      return typeof r === "function" ? (r as (c: unknown) => unknown)(cuerpo) : (r ?? {});
    },
  });
  return { vista, llamadas };
}

function textoDe(n: NodoFalso | undefined, acumulado: string[] = []): string {
  if (n === undefined) return "";
  if (n._texto) acumulado.push(String(n._texto));
  for (const hijo of n.children ?? []) textoDe(hijo, acumulado);
  return acumulado.join(" ");
}

const clases = (n: NodoFalso): string[] => String(n.className ?? "").split(/\s+/);

/** Las tarjetas de proveedor, en el orden en que se pintaron. */
function tarjetas(raiz: NodoFalso | undefined): NodoFalso[] {
  return buscarNodos(
    raiz,
    (n) => n.tagName === "ARTICLE" && clases(n).includes("proveedor"),
  );
}

/** La tarjeta cuyo título es `nombre`. */
function tarjeta(raiz: NodoFalso | undefined, nombre: string): NodoFalso {
  const encontrada = tarjetas(raiz).find(
    (t) =>
      buscarNodos(t, (n) => n.tagName === "H2" && String(n._texto) === nombre).length > 0,
  );
  if (encontrada === undefined) throw new Error(`no hay tarjeta de ${nombre}`);
  return encontrada;
}

/** El valor de un campo `<dt>` de la tarjeta (el `<dd>` que lo sigue). */
function campo(t: NodoFalso, rotulo: string): string {
  const dl = buscarNodos(t, (n) => n.tagName === "DL")[0];
  const hijos = dl?.children ?? [];
  const i = hijos.findIndex((n) => n.tagName === "DT" && String(n._texto) === rotulo);
  return i === -1 ? "" : textoDe(hijos[i + 1]);
}

/** La marca de uso de la cabecera de la tarjeta. */
const marcaDeUso = (t: NodoFalso): string =>
  String(buscarNodos(t, (n) => clases(n).includes("proveedor-uso"))[0]?._texto ?? "");

const botones = (t: NodoFalso): string[] =>
  buscarNodos(t, (n) => n.tagName === "BUTTON").map((n) => String(n._texto));

const boton = (t: NodoFalso, texto: string): NodoFalso => {
  const b = buscarNodos(t, (n) => n.tagName === "BUTTON" && String(n._texto) === texto)[0];
  if (b === undefined) throw new Error(`no hay botón «${texto}»`);
  return b;
};

describe("Proveedores: estado de cada proveedor", () => {
  it("C1: la leyenda de arriba explica los tres estados", async () => {
    const { vista } = await pintar();
    const leyenda = buscarNodos(vista.contenido, (n) =>
      clases(n).includes("leyenda-proveedores"),
    )[0];
    const texto = textoDe(leyenda);
    expect(texto).toContain("Configurado");
    expect(texto).toContain("guardaste la clave aquí");
    expect(texto).toContain("Detectado");
    expect(texto).toContain("la CLI ya tenía sesión");
    expect(texto).toContain("Sin configurar");
  });

  it.each([
    ["OpenRouter", "configurado", "configurado · clave guardada · 35 caracteres"],
    ["OpenCode Go", "configurado", "configurado · variable de entorno · 40 caracteres"],
    ["Ollama", "configurado", "configurado · local, sin clave"],
    ["Claude Code", "detectado", "detectado · sesión de la CLI"],
    ["Codex", "detectado", "detectado · sesión de la CLI"],
    ["DeepSeek", "sin-configurar", "sin configurar"],
  ])("C2: %s se marca %s con el estado «%s»", async (nombre, marca, estado) => {
    const { vista } = await pintar();
    const t = tarjeta(vista.contenido, nombre);
    expect(campo(t, "Estado")).toBe(estado);
    const punto = buscarNodos(t, (n) => clases(n).includes("proveedor-punto"))[0];
    expect(punto && clases(punto)).toContain(marca);
  });

  it("C3: un proveedor con clave guardada muestra cuántos caracteres tiene la clave", async () => {
    const { vista } = await pintar();
    expect(campo(tarjeta(vista.contenido, "OpenRouter"), "Estado")).toContain(
      "35 caracteres",
    );
  });

  it("C4: ningún valor de clave aparece en la pantalla", async () => {
    const { vista } = await pintar();
    expect(tarjetas(vista.contenido).length).toBe(PROVEEDORES.length);
    expect(vista.texto).not.toContain(MARCADOR);
  });
});

describe("Proveedores: uso por el perfil activo", () => {
  it("C5: la tarjeta de un proveedor que usa el perfil activo dice «lo usa el perfil»", async () => {
    const { vista } = await pintar();
    expect(marcaDeUso(tarjeta(vista.contenido, "Claude Code"))).toBe("lo usa el perfil");
    expect(marcaDeUso(tarjeta(vista.contenido, "OpenRouter"))).toBe("lo usa el perfil");
  });

  it.each([
    ["Claude Code", "7 del perfil activo"],
    ["OpenRouter", "6 del perfil activo"],
  ])("C6: %s dice «%s»", async (nombre, trabajos) => {
    const { vista } = await pintar();
    expect(campo(tarjeta(vista.contenido, nombre), "Trabajos")).toBe(trabajos);
  });

  it("C7: la tarjeta de un proveedor que el perfil activo no usa dice «sin uso hoy»", async () => {
    const { vista } = await pintar();
    for (const nombre of ["Codex", "DeepSeek", "Ollama"]) {
      expect(marcaDeUso(tarjeta(vista.contenido, nombre)), nombre).toBe("sin uso hoy");
    }
  });

  it.each([
    ["Codex", "0 · lo usa el perfil codex-completo"],
    ["OpenCode Go", "0 · lo usa el perfil opencode-go"],
    ["DeepSeek", "0 · ningún perfil lo usa"],
  ])("C8: %s, sin uso en el perfil activo, dice «%s»", async (nombre, trabajos) => {
    const { vista } = await pintar();
    expect(campo(tarjeta(vista.contenido, nombre), "Trabajos")).toBe(trabajos);
  });

  it("C9: sin perfil elegido, las tarjetas dicen «sin perfil activo»", async () => {
    const { vista } = await pintar({ "/api/perfiles": perfiles(null) });
    expect(tarjetas(vista.contenido).length).toBe(PROVEEDORES.length);
    for (const t of tarjetas(vista.contenido)) {
      expect(campo(t, "Trabajos")).toBe("sin perfil activo");
      expect(marcaDeUso(t)).toBe("sin perfil activo");
    }
  });

  it("C10: si GET /api/perfiles falla, la pantalla sigue mostrando los proveedores", async () => {
    const { vista } = await pintar({
      "/api/perfiles": () => {
        throw new Error("perfiles ilegibles");
      },
    });
    expect(vista.texto).not.toContain("No se pudo cargar la vista");
    expect(tarjetas(vista.contenido).length).toBe(PROVEEDORES.length);
    expect(campo(tarjeta(vista.contenido, "Claude Code"), "Trabajos")).toBe(
      "sin perfil activo",
    );
  });

  it("C11: las tarjetas siguen el orden: las del perfil, las demás con credencial, las sin configurar", async () => {
    const { vista } = await pintar();
    const nombres = tarjetas(vista.contenido).map((t) =>
      String(buscarNodos(t, (n) => n.tagName === "H2")[0]?._texto),
    );
    expect(nombres).toEqual([
      "OpenRouter",
      "Claude Code",
      "Codex",
      "OpenCode Go",
      "Ollama",
      "DeepSeek",
    ]);
  });
});

describe("Proveedores: las acciones de siempre", () => {
  it("C12: «Probar conexión» pinta en la tarjeta el resultado de la prueba del proveedor", async () => {
    const { vista, llamadas } = await pintar({
      "POST /api/providers/openrouter/probe": {
        ok: true,
        detail: "Responde bien",
        latencyMs: 87,
      },
    });
    const t = tarjeta(vista.contenido, "OpenRouter");
    await disparar(boton(t, "Probar conexión"), "click");
    expect(llamadas).toContainEqual(
      expect.objectContaining({ ruta: "/api/providers/openrouter/probe", metodo: "POST" }),
    );
    expect(textoDe(t)).toContain("Responde bien · 87 ms");
  });

  it.each([
    ["OpenRouter", "Reemplazar clave"],
    ["OpenCode Go", "Reemplazar clave"],
    ["DeepSeek", "Configurar clave"],
  ])("C13: %s ofrece «%s», que abre el diálogo de la clave", async (nombre, rotulo) => {
    const { vista } = await pintar();
    const t = tarjeta(vista.contenido, nombre);
    await disparar(boton(t, rotulo), "click");
    expect(vista.nodo("dialogo")?.open).toBe(true);
    expect(String(vista.nodo("titulo")?._texto)).toBe(`Configurar ${nombre}`);
  });

  it("C14: un proveedor de suscripción no ofrece acción de clave", async () => {
    const { vista } = await pintar();
    for (const nombre of ["Claude Code", "Codex"]) {
      const rotulos = botones(tarjeta(vista.contenido, nombre));
      expect(rotulos, nombre).not.toContain("Configurar clave");
      expect(rotulos, nombre).not.toContain("Reemplazar clave");
    }
    expect(textoDe(tarjeta(vista.contenido, "Codex"))).toContain("~/.codex/auth.json");
  });

  it("C15: «Borrar clave» sigue llamando a DELETE /api/providers/:id/credential", async () => {
    const { vista, llamadas } = await pintar();
    const global = globalThis as { confirm?: (m: string) => boolean };
    const anterior = global.confirm;
    global.confirm = () => true;
    try {
      await disparar(
        boton(tarjeta(vista.contenido, "OpenRouter"), "Borrar clave"),
        "click",
      );
    } finally {
      global.confirm = anterior;
    }
    expect(llamadas).toContainEqual(
      expect.objectContaining({
        ruta: "/api/providers/openrouter/credential",
        metodo: "DELETE",
      }),
    );
  });

  it("C16: guardar una clave en el diálogo pinta el resultado de su prueba en la tarjeta del proveedor", async () => {
    const { vista, llamadas } = await pintar({
      "PUT /api/providers/deepseek/credential": {
        probe: { ok: true, detail: "Clave aceptada", latencyMs: 12 },
      },
    });
    await disparar(
      boton(tarjeta(vista.contenido, "DeepSeek"), "Configurar clave"),
      "click",
    );
    const clave = vista.nodo("clave");
    const guardar = vista.nodo("guardar");
    if (clave === undefined || guardar === undefined) throw new Error("sin diálogo");
    clave.value = "valor-de-prueba";
    await disparar(guardar, "click");
    expect(llamadas).toContainEqual({
      ruta: "/api/providers/deepseek/credential",
      metodo: "PUT",
      cuerpo: { apiKey: "valor-de-prueba" }, // valmen:allow-secret: valor ficticio de la prueba
    });
    expect(textoDe(tarjeta(vista.contenido, "DeepSeek"))).toContain(
      "Clave aceptada · 12 ms",
    );
  });
});

describe("Proveedores en el celular", () => {
  it("C17: la rejilla de tarjetas pasa a una columna cuando el ancho no da para dos", () => {
    const i = html.indexOf(".proveedores {");
    expect(i).toBeGreaterThan(-1);
    const regla = html.slice(i, html.indexOf("}", i));
    expect(regla).toMatch(
      /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*280px\),\s*1fr\)\)/,
    );
  });
});
