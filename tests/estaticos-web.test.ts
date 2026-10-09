/**
 * Los estáticos de la interfaz local (FEATURE-WEB-VISTA-LIENZO-20261008).
 * El servidor solo sirve lo declarado en el mapa: un archivo nuevo de la vista
 * Agentes que no esté en `ARCHIVOS_WEB` daría 404 en el navegador del PO.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ARCHIVOS_WEB, loadStatics } from "../packages/server/src/server.js";

const WEB = join(import.meta.dirname, "..", "packages", "server", "web");

describe("los estáticos de la interfaz", () => {
  it("ARCHIVOS_WEB lista index.html, el motor, el montaje, los cuatro archivos de mundos y los sprites (C27)", () => {
    expect([...ARCHIVOS_WEB].sort()).toEqual(
      [
        "index.html",
        "agentes/motor.js",
        "agentes/montaje.js",
        "agentes/mundos/index.js",
        "agentes/mundos/pasteleria.js",
        "agentes/mundos/sprites.js",
        "agentes/mundos/control.js",
        "agentes/mundos/invernadero.js",
      ].sort(),
    );
  });

  it("loadStatics carga cada archivo declarado sin lanzar (C28)", () => {
    for (const archivo of ARCHIVOS_WEB) expect(existsSync(join(WEB, archivo))).toBe(true);
    const mapa = loadStatics(WEB, ARCHIVOS_WEB);
    expect(Object.keys(mapa).sort()).toEqual([...ARCHIVOS_WEB].sort());
    expect(mapa["agentes/montaje.js"]?.type).toContain("text/javascript");
    expect(mapa["index.html"]?.type).toContain("text/html");
  });

  it("el módulo inline de index.html no tiene un import estático relativo (C29)", () => {
    const html = readFileSync(join(WEB, "index.html"), "utf8");
    const modulo = /<script type="module">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    expect(modulo.length).toBeGreaterThan(1000);
    expect(modulo).not.toMatch(/^\s*import\s[^(][^\n]*from\s+["']\.{1,2}\//m);
    expect(modulo).not.toMatch(/^\s*import\s+["']\./m);
  });
});
