/**
 * Las políticas autónomas en la pantalla de Configuración.
 *
 * Se ejecuta la interfaz de verdad (el HTML con un DOM mínimo) contra el estado que
 * produce `checkConfig`, que es lo que el servidor devuelve: un test sobre el HTML como
 * texto no vería una tarjeta que solo se pinta con ciertos datos. Lo que importa de
 * «Editar» es lo que **no** hace: no guarda nada y no activa nada.
 */
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { checkConfig } from "../packages/server/src/config.js";
import { buscarNodos, disparar, ejecutarInterfaz } from "../scripts/verificar-interfaz.mjs";
import type { NodoFalso } from "../scripts/verificar-interfaz.mjs";

const RAIZ = join(import.meta.dirname, "..");
const HTML = join(RAIZ, "packages", "server", "web", "index.html");

const SIN_POLITICAS = "name: Demo\n";
const CON_UMBRALES = `name: Demo
gate-thresholds:
  - gate: analysis
    approve-at: 0.8
    block-at: 0.1
    approved-by: Juan Andrade
    reason: medido en 40 recibos
`;

interface Llamada {
  readonly ruta: string;
  readonly metodo: string;
}

async function pintar(texto: string) {
  const llamadas: Llamada[] = [];
  const vista = await ejecutarInterfaz(HTML, {
    hash: "#/configuracion",
    respuesta: (ruta, init) => {
      const url = new URL(ruta, "http://localhost");
      llamadas.push({ ruta: url.pathname, metodo: init?.method ?? "GET" });
      if (url.pathname === "/api/config/check") {
        const cuerpo = JSON.parse(String(init?.body ?? "{}")) as { text: string };
        return { config: checkConfig(RAIZ, cuerpo.text), impact: null };
      }
      if (url.pathname === "/api/config") {
        return { config: { ...checkConfig(RAIZ, texto), text: texto, diff: [] }, impact: null };
      }
      if (url.pathname === "/api/health") return { root: RAIZ };
      return {};
    },
  });
  return { vista, llamadas };
}

type Vista = { contenido: NodoFalso | undefined };
const botones = (v: Vista): NodoFalso[] =>
  buscarNodos(v.contenido, (n) => n.tagName === "BUTTON");
const textoDe = (n: NodoFalso): string => String(n._texto);
const editorDe = (v: Vista): NodoFalso =>
  buscarNodos(v.contenido, (n) => n.tagName === "TEXTAREA")[0] as NodoFalso;
const tarjetas = (v: Vista): NodoFalso[] =>
  buscarNodos(v.contenido, (n) => String(n.className ?? "").split(" ").includes("politica"));

describe("las tarjetas de políticas", () => {
  it("hay una por política, con su estado y su resumen", async () => {
    const { vista } = await pintar(SIN_POLITICAS);

    expect(vista.fallos).toEqual([]);
    expect(vista.texto).toContain("Políticas autónomas");
    expect(tarjetas(vista)).toHaveLength(4);
    for (const titulo of [
      "Autonomía acotada",
      "Proposiciones adicionales por etapa",
      "Preparación de pruebas",
      "Umbrales firmados",
    ]) {
      expect(vista.texto).toContain(titulo);
    }
    expect(vista.texto).toContain("apagada");
  });

  it("una sección que no se entiende muestra el error exacto en su tarjeta", async () => {
    const { vista } = await pintar("name: Demo\ntest-setup:\n  commands:\n    - echo hola\n");

    expect(vista.texto).toContain("test-setup.schema");
    expect(tarjetas(vista).some((t) => String(t.className).includes("error"))).toBe(true);
  });
});

describe("«Editar»", () => {
  it("agrega un ejemplo comentado cuando la clave no existe y no guarda nada", async () => {
    const { vista, llamadas } = await pintar(SIN_POLITICAS);
    const editor = editorDe(vista);
    const antes = String(editor.value);

    const agregar = botones(vista).filter((b) => textoDe(b) === "Agregar un ejemplo")[0] as NodoFalso;
    await disparar(agregar, "click");

    const despues = String(editor.value);
    expect(despues.startsWith(antes)).toBe(true);
    expect(despues.length).toBeGreaterThan(antes.length);
    const agregado = despues.slice(antes.length).split("\n").filter((l) => l.trim() !== "");
    expect(agregado.length).toBeGreaterThan(0);
    for (const linea of agregado) expect(linea.startsWith("#"), linea).toBe(true);
    // Analizar sí; guardar nunca.
    expect(llamadas.some((l) => l.metodo === "PUT")).toBe(false);
  });

  it("con la clave presente el botón dice «Editar en el archivo» y no altera el texto", async () => {
    const texto = `${SIN_POLITICAS}allowed-schemas:\n  - test\ntest-setup:\n  schema: test\n  commands:\n    - echo hola\n`;
    const { vista } = await pintar(texto);
    const editor = editorDe(vista);

    const editar = botones(vista).filter((b) => textoDe(b) === "Editar en el archivo");
    expect(editar.length).toBeGreaterThan(0);
    await disparar(editar[0] as NodoFalso, "click");
    expect(String(editor.value)).toBe(texto);
  });
});

describe("los umbrales firmados", () => {
  it("se muestran con quién los firmó y sin acción de editar", async () => {
    const { vista } = await pintar(CON_UMBRALES);

    expect(vista.texto).toContain("firmado por Juan Andrade");
    expect(vista.texto).toContain("Solo lectura");
    // Es la cuarta tarjeta, y la única sin botón: no se ofrece escribir una firma.
    const tarjeta = tarjetas(vista)[3] as NodoFalso;
    expect(String(tarjeta.className)).toContain("activa");
    expect(buscarNodos(tarjeta, (n) => n.tagName === "BUTTON")).toHaveLength(0);
    expect(tarjetas(vista).slice(0, 3).every((t) => buscarNodos(t, (n) => n.tagName === "BUTTON").length === 1)).toBe(true);
  });
});
