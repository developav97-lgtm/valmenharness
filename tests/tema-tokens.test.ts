/**
 * El tema «sala de control» de Mission Control (FEATURE-WEB-TEMA-TOKENS-20261014,
 * R-MARCO-001).
 *
 * Los colores, el fondo y las tipografías salen de variables en `:root` y su
 * versión clara, con los valores de `.valmen/features/rediseno-mission-control/
 * design.md`. Los nombres viejos (`--panel`, `--acento`, `--alerta`…) se
 * conservan con valores nuevos (D-001) porque otras pruebas y todas las vistas
 * los consumen; `--tenue` toma el valor «atenuado» porque el «tenue» de la tabla
 * no llega a AA como texto (D-002).
 *
 * Las fuentes viajan con el servidor: un `woff2` leído como UTF-8 llega
 * corrupto, así que el servidor tiene que entregarlo byte a byte.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { scanFixedColors } from "../packages/engine/src/presentation.js";
import * as servidor from "../packages/server/src/server.js";

const WEB = join(import.meta.dirname, "..", "packages", "server", "web");
const HTML = join(WEB, "index.html");
const html = readFileSync(HTML, "utf8");

/** Las declaraciones `--x: valor;` de un bloque, con el valor normalizado. */
function declaraciones(bloque: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const m of bloque.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    mapa.set(m[1] as string, (m[2] as string).replace(/\s+/g, " ").trim().toLowerCase());
  return mapa;
}

const bloqueOscuro = /\n\s*:root\s*\{([^}]*)\}/.exec(html)?.[1] ?? "";
const bloqueClaro =
  /@media\s*\(prefers-color-scheme:\s*light\)\s*\{([\s\S]*?)\n\s*\}/.exec(html)?.[1] ?? "";
const oscuro = declaraciones(bloqueOscuro);
const claro = declaraciones(bloqueClaro);

/** Token → valor oscuro → valor claro, de la tabla de `design.md` y D-001/D-002. */
const TOKENS: ReadonlyArray<readonly [string, string, string]> = [
  ["--fondo", "#0a1114", "#f2f6f7"],
  ["--fondo-2", "#0e181c", "#e8eef0"],
  ["--panel", "#122027", "#ffffff"],
  ["--panel-alto", "#172a32", "#f4f8f9"],
  ["--borde", "#24383f", "#c9d6da"],
  ["--texto", "#e8f0f2", "#0d1a1f"],
  ["--tenue", "#9aaeb4", "#4a5f66"],
  ["--tenue-deco", "#5f767d", "#7d9198"],
  ["--acento", "#4cc8e6", "#0a7898"],
  ["--codigo", "#4cc8e6", "#0a7898"],
  ["--alerta", "#f2b43f", "#9a6100"],
  ["--persona", "#f2b43f", "#9a6100"],
  ["--acento-2", "#ad9ff4", "#5a45c4"],
  ["--modelo", "#ad9ff4", "#5a45c4"],
  ["--ok", "#62d69e", "#1b7f4d"],
  ["--hecho", "#62d69e", "#1b7f4d"],
  ["--error", "#f36a5d", "#bf3326"],
  ["--negado", "#f36a5d", "#bf3326"],
  ["--cuadricula", "rgba(120, 170, 185, 0.07)", "rgba(20, 70, 90, 0.06)"],
  ["--sobre-acento", "#0a1114", "#ffffff"],
];

/** Luminancia relativa WCAG 2.x de un hexadecimal de seis cifras. */
function luminancia(hex: string): number {
  const canales = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canales.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
}

function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return ((x as number) + 0.05) / ((y as number) + 0.05);
}

/** El cuerpo de la primera regla cuyo selector es exactamente `selector`. */
function regla(selector: string): string {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/,\s*/g, ",\\s*");
  return new RegExp(`\\n\\s*${escapado}\\s*\\{([^}]*)\\}`).exec(html)?.[1] ?? "";
}

describe("los tokens del tema", () => {
  it.each(TOKENS)("C1: :root declara %s con su valor oscuro %s", (token, valorOscuro) => {
    expect(oscuro.get(token)).toBe(valorOscuro);
  });

  it.each(TOKENS.map(([token, , valorClaro]) => [token, valorClaro] as const))(
    "C2: el bloque claro redefine %s con su valor claro %s",
    (token, valorClaro) => {
      expect(claro.get(token)).toBe(valorClaro);
    },
  );

  const TEXTOS = ["--texto", "--tenue", "--acento", "--alerta", "--acento-2", "--ok", "--error"];
  const SUPERFICIES = ["--fondo", "--panel", "--panel-alto"];
  it.each([
    ["oscuro", oscuro],
    ["claro", claro],
  ] as const)("C3: cada token de texto llega a 4.5:1 sobre las superficies en modo %s", (_modo, tema) => {
    const fallos: string[] = [];
    for (const texto of TEXTOS)
      for (const superficie of SUPERFICIES) {
        const razon = contraste(tema.get(texto) ?? "#000000", tema.get(superficie) ?? "#000000");
        if (razon < 4.5) fallos.push(`${texto} sobre ${superficie}: ${razon.toFixed(2)}`);
      }
    expect(fallos).toEqual([]);
  });
});

describe("el fondo y las tipografías", () => {
  it("C4: el fondo de body es la cuadrícula de 40 px de var(--cuadricula) sobre var(--fondo)", () => {
    const cuerpo = regla("body");
    expect(cuerpo).toContain("var(--cuadricula)");
    expect(cuerpo).toMatch(/40px 40px/);
    expect(cuerpo).toContain("var(--fondo)");
  });

  it("C5: el texto de body usa var(--fuente-texto), que empieza por IBM Plex Sans", () => {
    expect(regla("body")).toContain("var(--fuente-texto)");
    expect(oscuro.get("--fuente-texto")).toMatch(/^"ibm plex sans",.*sans-serif$/);
  });

  it("C6: los títulos de nivel 1 a 3 usan var(--fuente-titulo), que empieza por Chakra Petch", () => {
    expect(regla("h1, h2, h3")).toContain("var(--fuente-titulo)");
    expect(oscuro.get("--fuente-titulo")).toMatch(/^"chakra petch",.*sans-serif$/);
  });

  it("C7: --mono empieza por IBM Plex Mono y conserva la pila del sistema", () => {
    expect(oscuro.get("--mono")).toMatch(/^"ibm plex mono", ui-monospace,.*monospace$/);
  });

  it("C8: index.html no tiene colores a mano fuera de las variables del tema", () => {
    expect(scanFixedColors(html).map((h) => `${h.line}: ${h.preview}`)).toEqual([]);
  });

  it("C9: cada @font-face apunta a un archivo de fuentes/ que existe", () => {
    const urls = [...html.matchAll(/@font-face\s*\{[^}]*url\("([^"]+)"\)/g)].map((m) => m[1] as string);
    expect(urls).toHaveLength(9);
    for (const url of urls) {
      expect(url).toMatch(/^fuentes\/[\w-]+\.woff2$/);
      expect(existsSync(join(WEB, url))).toBe(true);
    }
  });

  it("C13: fuentes/OFL.txt acompaña a las fuentes con la licencia SIL OFL 1.1", () => {
    const licencia = join(WEB, "fuentes", "OFL.txt");
    expect(existsSync(licencia)).toBe(true);
    expect(readFileSync(licencia, "utf8")).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });
});

describe("el servidor entrega las fuentes", () => {
  const fuentes = (servidor as { ARCHIVOS_FUENTES?: readonly string[] }).ARCHIVOS_FUENTES ?? [];
  let root = "";
  let base = "";
  let cerrar: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "valmen-tema-"));
    mkdirSync(join(root, ".valmen"), { recursive: true });
    const app = servidor.createMissionControl({
      ...servidor.defaultContext(root),
      statics: servidor.loadStatics(WEB, [...servidor.ARCHIVOS_WEB, ...fuentes]),
    });
    await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
    cerrar = () => new Promise((resolve) => app.close(() => resolve()));
    base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (cerrar !== null) await cerrar();
    rmSync(root, { recursive: true, force: true });
  });

  it("ARCHIVOS_FUENTES declara los nueve woff2 de fuentes/", () => {
    expect(fuentes).toHaveLength(9);
    for (const archivo of fuentes) expect(archivo).toMatch(/^fuentes\/[\w-]+\.woff2$/);
  });

  it("C10: cada woff2 llega idéntico byte a byte al archivo en disco", async () => {
    expect(fuentes.length).toBeGreaterThan(0);
    for (const archivo of fuentes) {
      const respuesta = await fetch(`${base}/${archivo}`);
      expect(respuesta.status).toBe(200);
      const recibido = Buffer.from(await respuesta.arrayBuffer());
      expect(recibido.equals(readFileSync(join(WEB, archivo)))).toBe(true);
    }
  });

  it("C11: cada woff2 llega con Content-Type font/woff2", async () => {
    expect(fuentes.length).toBeGreaterThan(0);
    for (const archivo of fuentes) {
      const respuesta = await fetch(`${base}/${archivo}`);
      expect(respuesta.headers.get("content-type")).toBe("font/woff2");
      expect(respuesta.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });

  it("C12: index.html sigue llegando como text/html con el mismo cuerpo que el archivo", async () => {
    const respuesta = await fetch(`${base}/`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await respuesta.text()).toBe(html);
  });
});
