/**
 * La puesta en marcha de un perfil de Hermes, atada al código.
 *
 * La guía explica cómo declarar un proyecto en su propio perfil, y esa
 * explicación se queda vieja el día que el comando cambia de forma o la ayuda
 * deja de declarar la bandera. Lo que estas pruebas protegen es esa atadura: el
 * bloque se contrasta contra la fuente que ya es la verdad —el `USAGE` del CLI—
 * y no contra una lista escrita a mano acá, que sería una tercera copia del
 * mismo dato esperando a discrepar de las otras dos.
 *
 * Las comprobaciones son por fragmentos cortos y no por párrafos enteros: un
 * texto reescrito no tiene que romper la suite, sólo cuando deja de nombrar un
 * comando o una bandera.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { USAGE } from "../packages/cli/src/main.js";

const REPO = process.cwd();
const DOCUMENTO = "docs/15-PUESTA-EN-MARCHA.md";

const documento = readFileSync(join(REPO, DOCUMENTO), "utf8");

/**
 * El bloque «Un perfil por proyecto» del documento.
 *
 * Se corta en el próximo título de sección o regla horizontal, para que la
 * comprobación de orden no mire comandos de otras secciones que aparezcan más
 * abajo.
 */
function bloqueDePerfil(): string {
  const inicio = documento.indexOf("Un perfil por proyecto");
  if (inicio === -1) return "";
  const resto = documento.slice(inicio);
  const fin = resto.search(/\n## |\n---/);
  return fin === -1 ? resto : resto.slice(0, fin);
}

/** El bloque de ayuda de `hermes`, desde su comando hasta el siguiente. */
function ayudaDeHermes(): string {
  const inicio = USAGE.indexOf("hermes [status|connect");
  if (inicio === -1) return "";
  const resto = USAGE.slice(inicio);
  const fin = resto.indexOf("\n  serve ");
  return fin === -1 ? resto : resto.slice(0, fin);
}

describe("la puesta en marcha de un perfil de Hermes", () => {
  it("nombra los tres pasos, en orden", () => {
    const bloque = bloqueDePerfil();
    const crear = bloque.indexOf("hermes profile create <proyecto>");
    const conectar = bloque.indexOf("valmen hermes connect --profile <proyecto>");
    const comprobar = bloque.indexOf("hermes -p <proyecto> mcp list");

    expect(crear, "el bloque no nombra `hermes profile create`").toBeGreaterThanOrEqual(0);
    expect(
      conectar,
      "el bloque no nombra `valmen hermes connect --profile`",
    ).toBeGreaterThan(crear);
    expect(
      comprobar,
      "el bloque no nombra la comprobación `hermes -p <proyecto> mcp list`",
    ).toBeGreaterThan(conectar);
  });
});

describe("la ayuda del CLI declara el perfil", () => {
  it("nombra `--profile` con el archivo del perfil y el nombre por defecto", () => {
    const bloque = ayudaDeHermes();
    expect(bloque, "la ayuda no tiene el bloque de hermes").not.toBe("");
    expect(bloque, "la ayuda no declara `--profile`").toContain("--profile");
    expect(bloque, "la ayuda no dice a qué archivo apunta").toContain("profiles/");
    expect(bloque, "la ayuda no declara el nombre por defecto").toContain(
      "valmen-<perfil>",
    );
  });
});
