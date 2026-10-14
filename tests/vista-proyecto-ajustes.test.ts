/**
 * La vista Ajustes › Proyecto rediseñada (FEATURE-WEB-AJUSTES-PROYECTO-20261014: R-AJU-006 y la
 * parte de Proyecto de R-MARCO-006).
 *
 * Se ejecuta la interfaz con el DOM mínimo de `scripts/verificar-interfaz.mjs` y respuestas
 * simuladas con la forma real de `/api/config` (con `checkConfig` de verdad),
 * `/api/approval/authorizations`, `/api/qa/authorizations` y `/api/authorizations/options`, y se
 * registran las llamadas: ninguna prueba guarda, revoca ni crea nada fuera de la simulación.
 * Boceto de referencia: `.valmen/features/rediseno-mission-control/assets/proyecto.html`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { checkConfig } from "../packages/server/src/config.js";
import { buscarNodos, disparar, ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";
import type { NodoFalso } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");

const TEXTO =
  "name: Demo\ntest-commands:\n  - npx vitest run\n  - npx tsc\n  - node\ntest-timeout: 420\n";

const OPCIONES = {
  source: "registry",
  modules: [{ module: "WEB", tickets: 2 }],
  approval: {
    types: ["BUGFIX", "FEATURE"],
    stages: ["analysis", "plan"],
    modes: ["on-approve", "reviewer"],
    impacts: ["sync_impact"],
  },
  qa: { types: ["BUGFIX", "FEATURE"] },
};

interface Llamada {
  readonly ruta: string;
  readonly metodo: string;
  readonly cuerpo: Record<string, unknown> | null;
}

type EstadoPorDefecto = "vigente" | "revocada" | "ausente";

async function pintar(opciones: { porDefecto?: EstadoPorDefecto; texto?: string } = {}) {
  const texto = opciones.texto ?? TEXTO;
  const estado = opciones.porDefecto ?? "vigente";
  const llamadas: Llamada[] = [];
  const vista = await ejecutarInterfaz(HTML, {
    hash: "#/proyecto",
    respuesta: (ruta: string, init?: { method?: string; body?: unknown }) => {
      const url = new URL(ruta, "http://localhost");
      const metodo = init?.method ?? "GET";
      const cuerpo =
        init?.body === undefined ? null : (JSON.parse(String(init.body)) as Record<string, unknown>);
      llamadas.push({ ruta: url.pathname, metodo, cuerpo });
      if (url.pathname === "/api/health") return { root: RAIZ };
      if (url.pathname === "/api/config/check") {
        return { config: checkConfig(RAIZ, String(cuerpo?.["text"] ?? "")), impact: null };
      }
      if (url.pathname === "/api/config") {
        return { config: { ...checkConfig(RAIZ, texto), text: texto, diff: [] }, impact: null };
      }
      if (url.pathname === "/api/authorizations/options") return OPCIONES;
      if (url.pathname === "/api/qa/authorizations" && metodo === "GET") return { authorizations: [] };
      if (url.pathname === "/api/approval/authorizations" && metodo === "GET") {
        return estado === "ausente"
          ? { authorizations: [] }
          : {
              authorizations: [],
              porDefecto: { id: "POLITICA-POR-DEFECTO", estado, revocacion: null },
            };
      }
      if (url.pathname.endsWith("/revoke")) return { ok: true };
      return {};
    },
  });
  return { vista, llamadas };
}

type Vista = Awaited<ReturnType<typeof pintar>>["vista"];
const todos = (v: Vista, p: (n: NodoFalso) => boolean): NodoFalso[] => buscarNodos(v.contenido, p);
const textoDe = (n: NodoFalso): string => String(n._texto ?? "");
const clase = (n: NodoFalso, nombre: string): boolean =>
  String(n.className ?? "").split(" ").includes(nombre);
const conClase = (v: Vista, nombre: string): NodoFalso =>
  todos(v, (n) => clase(n, nombre))[0] as NodoFalso;
const interruptor = (raiz: NodoFalso | undefined, etiqueta: string): NodoFalso =>
  buscarNodos(
    raiz,
    (n) => n.tagName === "BUTTON" && n.attrs?.["role"] === "switch" && n.attrs?.["aria-label"] === etiqueta,
  )[0] as NodoFalso;
const boton = (raiz: NodoFalso | undefined, texto: string): NodoFalso =>
  buscarNodos(raiz, (n) => n.tagName === "BUTTON" && textoDe(n) === texto)[0] as NodoFalso;
const conPlaceholder = (v: Vista, texto: string): NodoFalso[] =>
  todos(v, (n) => n.tagName === "INPUT" && String(n.placeholder ?? "") === texto);
const escrituras = (llamadas: Llamada[]): Llamada[] =>
  llamadas.filter((l) => l.metodo !== "GET" && l.ruta !== "/api/config/check");
const editor = (v: Vista): NodoFalso => todos(v, (n) => n.tagName === "TEXTAREA")[0] as NodoFalso;

describe("R-AJU-006: Proyecto como bloques con interruptores y el YAML en «Avanzado»", () => {
  it("C1, C2: encabezado, título con el nombre y los bloques en el orden del boceto", async () => {
    const { vista } = await pintar();
    expect(vista.fallos).toEqual([]);
    expect(vista.texto).toContain("Ajustes");
    expect(vista.texto).toContain("Cómo trabaja el harness en Demo");
    const orden = [
      "Quién aprueba el análisis y el plan",
      "QA por agente",
      "Avisos",
      "Pruebas",
      "Avanzado: editar config.yaml a mano",
      "Avanzado: autorizaciones explícitas de aprobación",
    ].map((t) => vista.texto.indexOf(t));
    expect(orden.every((i) => i >= 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
  });

  it.each([
    { porDefecto: "vigente" as const, aria: "true", rotulo: "activa", deshabilitado: false },
    { porDefecto: "revocada" as const, aria: "false", rotulo: "apagada", deshabilitado: false },
    { porDefecto: "ausente" as const, aria: "false", rotulo: "sin dato", deshabilitado: true },
  ])("C3: con la política $porDefecto el interruptor marca $aria y dice «$rotulo»", async (caso) => {
    const { vista } = await pintar({ porDefecto: caso.porDefecto });
    const bloque = conClase(vista, "bloque-aprobacion");
    const sw = interruptor(bloque, "Aprobación por defecto");
    expect(sw.attrs["aria-checked"]).toBe(caso.aria);
    expect(Boolean(sw.disabled)).toBe(caso.deshabilitado);
    expect(buscarNodos(bloque, (n) => textoDe(n) === caso.rotulo)).not.toHaveLength(0);
  });

  it("C4: las tres tarjetas de quién decide y el candado", async () => {
    const { vista } = await pintar();
    for (const t of [
      "El agente decide",
      "Tú ratificas",
      "Siempre tuyo",
      "Crear o ampliar esta autorización lo hace una persona; el agente no puede.",
    ]) {
      expect(vista.texto).toContain(t);
    }
  });

  it("C5, C6: apagar pide nombre y frase, y solo al confirmar revoca POLITICA-POR-DEFECTO", async () => {
    const { vista, llamadas } = await pintar();
    const bloque = conClase(vista, "bloque-aprobacion");
    expect(conPlaceholder(vista, "Tu nombre")).toHaveLength(0);
    await disparar(interruptor(bloque, "Aprobación por defecto"), "click");
    expect(conPlaceholder(vista, "Tu nombre")).toHaveLength(1);
    expect(conPlaceholder(vista, "Tu frase literal de revocación")).toHaveLength(1);
    expect(escrituras(llamadas)).toEqual([]);

    (conPlaceholder(vista, "Tu nombre")[0] as NodoFalso).value = "Ana Prueba";
    (conPlaceholder(vista, "Tu frase literal de revocación")[0] as NodoFalso).value = "vuelvo a aprobar yo";
    await disparar(boton(bloque, "Confirmar revocación"), "click");
    expect(escrituras(llamadas)).toEqual([
      {
        ruta: "/api/approval/authorizations/revoke",
        metodo: "POST",
        cuerpo: { id: "POLITICA-POR-DEFECTO", actor: "Ana Prueba", quote: "vuelvo a aprobar yo" },
      },
    ]);
  });

  it.each([
    { caso: "sin nombre", actor: "", frase: "una frase" },
    { caso: "sin frase", actor: "Ana Prueba", frase: "" },
  ])("C7: $caso no manda ninguna escritura", async ({ actor, frase }) => {
    const { vista, llamadas } = await pintar();
    const bloque = conClase(vista, "bloque-aprobacion");
    await disparar(interruptor(bloque, "Aprobación por defecto"), "click");
    (conPlaceholder(vista, "Tu nombre")[0] as NodoFalso).value = actor;
    (conPlaceholder(vista, "Tu frase literal de revocación")[0] as NodoFalso).value = frase;
    await disparar(boton(bloque, "Confirmar revocación"), "click");
    expect(escrituras(llamadas)).toEqual([]);
  });

  it("C8: encender una política revocada no escribe y abre las autorizaciones explícitas", async () => {
    const { vista, llamadas } = await pintar({ porDefecto: "revocada" });
    const explicitas = conClase(vista, "avanzado-autorizaciones");
    expect(explicitas.open).toBe(false);
    await disparar(interruptor(conClase(vista, "bloque-aprobacion"), "Aprobación por defecto"), "click");
    expect(escrituras(llamadas)).toEqual([]);
    expect(conPlaceholder(vista, "Tu nombre")).toHaveLength(0);
    expect(explicitas.open).toBe(true);
  });

  it("C11: «Crear autorización» despliega el formulario de QA sin llamar al servidor", async () => {
    const { vista, llamadas } = await pintar();
    const bloque = conClase(vista, "bloque-qa");
    expect(buscarNodos(bloque, (n) => textoDe(n) === "sin autorización")).not.toHaveLength(0);
    const formulario = buscarNodos(bloque, (n) => clase(n, "formulario-qa"))[0] as NodoFalso;
    expect(formulario.hidden).toBe(true);
    await disparar(boton(bloque, "Crear autorización"), "click");
    expect(formulario.hidden).toBe(false);
    const rotulos = buscarNodos(formulario, (n) => n.tagName === "LABEL").map(textoDe);
    expect(rotulos).toContain("Responsable");
    expect(rotulos).toContain("Frase literal de quien autoriza");
    expect(escrituras(llamadas)).toEqual([]);
  });

  it("C12: sin bloque hermes: los dos interruptores de Avisos están apagados", async () => {
    const { vista } = await pintar();
    const bloque = conClase(vista, "bloque-avisos");
    expect(interruptor(bloque, "Avisos por Telegram").attrs["aria-checked"]).toBe("false");
    expect(interruptor(bloque, "Avisos por Slack").attrs["aria-checked"]).toBe("false");
  });

  it.each([
    {
      caso: "sin bloque hermes",
      texto: TEXTO,
      esperado: `${TEXTO}\nhermes:\n  enabled: true\n  notify:\n    gate: telegram\n`,
    },
    {
      caso: "con hermes apagado y destino slack",
      texto: "name: Demo\nhermes:\n  enabled: false\n  notify:\n    gate: slack\n# fin\n",
      esperado: "name: Demo\nhermes:\n  enabled: true\n  notify:\n    gate: telegram\n# fin\n",
    },
  ])("C13: encender Telegram $caso prepara el texto y no guarda", async ({ texto, esperado }) => {
    const { vista, llamadas } = await pintar({ texto });
    const avanzado = conClase(vista, "avanzado-proyecto");
    await disparar(interruptor(conClase(vista, "bloque-avisos"), "Avisos por Telegram"), "click");
    expect(String(editor(vista).value)).toBe(esperado);
    expect(llamadas.some((l) => l.ruta === "/api/config/check" && l.cuerpo?.["text"] === esperado)).toBe(true);
    expect(avanzado.open).toBe(true);
    expect(escrituras(llamadas)).toEqual([]);
  });

  it("C14: un chip por comando de test-commands y el tiempo máximo de test-timeout", async () => {
    const { vista } = await pintar();
    const bloque = conClase(vista, "bloque-pruebas");
    const chips = buscarNodos(bloque, (n) => clase(n, "chip-prueba")).map(textoDe);
    expect(chips).toEqual(["npx vitest run", "npx tsc", "node"]);
    const tiempo = buscarNodos(bloque, (n) => n.tagName === "INPUT" && n.type === "number")[0] as NodoFalso;
    expect(String(tiempo.value)).toBe("420");
  });

  it("C15: «+ añadir» agrega la línea a test-commands y el tiempo máximo cambia test-timeout, sin guardar", async () => {
    const { vista, llamadas } = await pintar();
    const bloque = conClase(vista, "bloque-pruebas");
    await disparar(boton(bloque, "+ añadir"), "click");
    const campo = buscarNodos(bloque, (n) => n.tagName === "INPUT" && n.type === "text")[0] as NodoFalso;
    campo.value = "npx eslint";
    await disparar(boton(bloque, "Añadir"), "click");
    expect(String(editor(vista).value)).toBe(
      "name: Demo\ntest-commands:\n  - npx vitest run\n  - npx tsc\n  - node\n  - npx eslint\ntest-timeout: 420\n",
    );
    const tiempo = buscarNodos(bloque, (n) => n.tagName === "INPUT" && n.type === "number")[0] as NodoFalso;
    tiempo.value = "600";
    await disparar(tiempo, "change");
    expect(String(editor(vista).value)).toContain("test-timeout: 600\n");
    expect(escrituras(llamadas)).toEqual([]);
  });

  it("C16: «Avanzado: editar config.yaml a mano» está plegado con el único editor dentro", async () => {
    const { vista } = await pintar();
    const avanzado = conClase(vista, "avanzado-proyecto");
    expect(avanzado.tagName).toBe("DETAILS");
    expect(avanzado.open).toBe(false);
    expect(todos(vista, (n) => n.tagName === "TEXTAREA")).toHaveLength(1);
    expect(buscarNodos(avanzado, (n) => n.tagName === "TEXTAREA")).toHaveLength(1);
  });
});

describe("R-MARCO-006: Proyecto en el celular", () => {
  const css = readFileSync(HTML, "utf8")
    .split("/* proyecto-ajustes:inicio */")[1]
    ?.split("/* proyecto-ajustes:fin */")[0] ?? "";

  it("C17: por debajo de 768 px los bloques pasan a una sola columna", () => {
    const movil = css.split("@media (max-width: 767px)")[1] ?? "";
    expect(movil).toMatch(/\.proyecto-tarjetas[^{]*\{[^}]*grid-template-columns:\s*1fr/);
    expect(movil).toMatch(/\.proyecto-rejilla[^{]*\{[^}]*grid-template-columns:\s*1fr/);
  });

  it("los estilos del bloque no traen colores a mano", () => {
    expect(css).not.toBe("");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
