/**
 * El esqueleto del manual de usuario final.
 *
 * Lo que se prueba aquí no es que un texto se imprima, sino que **la forma del
 * manual sea una sola**: la que declara la skill publicada y la que emite
 * `valmen manuales plantilla` tienen que ser la misma, y la prueba lee las dos
 * —el `SKILL.md` publicado y el renderizador— para que ninguna cambie sola. Si
 * la plantilla de la skill se edita sin tocar el código, o al revés, esta suite
 * se pone roja.
 *
 * El laboratorio es temporal —`mkdtemp` y se borra en `afterEach`— y nunca
 * escribe en el registro vivo; la copia real `.valmen/skills/` solo se lee.
 *
 * Cada `it` cubre un criterio de aceptación del ticket que declara este archivo.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { instalarPublicadas, publicadas } from "@valmen/adapter";
import { renderPlantilla, requireProcess } from "@valmen/engine";

import { USAGE, dispatch, parseArgs } from "../packages/cli/src/main.js";

const REPO = process.cwd();
const ID_SKILL = "manuales-usuario-final";
const RUTA_SKILL = join(REPO, "skills", ID_SKILL, "SKILL.md");
const RUTA_INSTALADA = join(REPO, ".valmen", "skills", ID_SKILL, "SKILL.md");
const MANUAL = "docs/manuales/usuario-final/ordenes.md";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-plantilla-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Corre el comando como lo haría el CLI, sin salir del laboratorio. */
function correr(...args: string[]) {
  return dispatch(parseArgs(["--root", lab, "manuales", ...args]));
}

/** Escribe un archivo del laboratorio, creando los directorios que falten. */
function escribir(ruta: string, contenido: string): void {
  const absoluta = join(lab, ...ruta.split("/"));
  mkdirSync(dirname(absoluta), { recursive: true });
  writeFileSync(absoluta, contenido, "utf8");
}

/** Lee un archivo del laboratorio por su ruta relativa POSIX. */
function leer(ruta: string): string {
  return readFileSync(join(lab, ...ruta.split("/")), "utf8");
}

/** La ruta absoluta de un archivo del laboratorio. */
function enLab(ruta: string): string {
  return join(lab, ...ruta.split("/"));
}

/**
 * El bloque de plantilla declarado dentro de `SKILL.md`.
 *
 * Se quitan las líneas de cerca —la plantilla va en un bloque de código para que
 * se lea como forma y no como un manual suelto—: lo que queda es el esqueleto.
 */
function bloqueDeclarado(texto: string): string {
  const match = /<!--\s*plantilla:inicio\s*-->([\s\S]*?)<!--\s*plantilla:fin\s*-->/.exec(
    texto,
  );
  if (match === null) return "";
  return (match[1] as string)
    .split("\n")
    .filter((linea) => !/^\s*```/.test(linea))
    .join("\n")
    .trim();
}

/** Las secciones `## …` de un bloque. */
function secciones(texto: string): string[] {
  return texto
    .split("\n")
    .filter((linea) => linea.startsWith("## "))
    .map((linea) => linea.trim());
}

/** Las etiquetas `**…:**` de un bloque, sin repetir. */
function etiquetas(texto: string): string[] {
  const encontradas = [...texto.matchAll(/^\*\*(.+?):\*\*/gm)].map(
    (match) => match[1] as string,
  );
  return [...new Set(encontradas)];
}

describe("la skill publicada", () => {
  it("el catálogo la publica con version y origen: valmen, y con las reglas duras", () => {
    const skill = publicadas().find((publicada) => publicada.id === ID_SKILL);

    expect(skill).toBeDefined();
    expect(skill?.version).toBe("1.0.0");
    expect(skill?.origen).toBe("valmen");

    const reglas = skill?.instructions ?? "";
    // Las reglas duras del proceso, una por una.
    expect(reglas).toContain("componente y su template completos");
    expect(reglas).toContain("sujeto es el sistema o la pantalla");
    expect(reglas).toContain("infinitivo impersonal");
    expect(reglas).toContain("literales del código");
    expect(reglas).toContain("Pendiente de validación con el equipo");
    expect(reglas).toContain("Cero rutas técnicas");
    expect(reglas).toContain("código ISO sale de la fuente oficial");
  });
});

describe("el esqueleto y la skill declaran la misma forma", () => {
  it("lo que emite renderPlantilla coincide con el bloque declarado en SKILL.md", () => {
    const publicado = readFileSync(RUTA_SKILL, "utf8");
    const bloque = bloqueDeclarado(publicado);
    expect(bloque).not.toBe("");

    // El nombre de pantalla del bloque es el marcador que el comando reemplaza:
    // renderizarlo con ese nombre tiene que devolver el bloque tal cual.
    const encabezado = /^#\s+(.+?)\s*$/m.exec(bloque)?.[1];
    expect(encabezado).toBeDefined();

    expect(renderPlantilla({ pantalla: encabezado as string }).trim()).toBe(bloque);
  });

  it("el esqueleto impreso trae el bloque de metadata, rutas-fuente y las seis secciones", () => {
    const bloque = bloqueDeclarado(readFileSync(RUTA_SKILL, "utf8"));
    const salida = correr("plantilla", "--pantalla", "Órdenes de venta");

    expect(salida.exitCode).toBe(0);

    // Las etiquetas y las secciones salen del bloque declarado, no de una lista
    // escrita aquí: si la skill cambia, lo que se espera cambia con ella.
    for (const etiqueta of etiquetas(bloque)) {
      expect(salida.stdout).toContain(`**${etiqueta}:**`);
    }
    expect(etiquetas(bloque)).toHaveLength(5);
    expect(salida.stdout).toContain("<!-- rutas-fuente: … -->");

    const declaradas = secciones(bloque);
    expect(declaradas).toHaveLength(6);
    expect(secciones(salida.stdout)).toEqual(declaradas);
  });

  it("no contiene ninguna ruta técnica fuera de la línea rutas-fuente", () => {
    const salida = correr("plantilla", "--pantalla", "Órdenes de venta");
    const sinFuente = salida.stdout
      .split("\n")
      .filter((linea) => !linea.includes("<!-- rutas-fuente:"))
      .join("\n");

    expect(sinFuente).not.toMatch(/\.(ts|html|css|scss|js)\b/);
    expect(sinFuente).not.toMatch(/\bcomponent\b/);
    expect(sinFuente).not.toMatch(/(^|\s)\/[A-Za-z]/);
    expect(sinFuente).not.toMatch(/\bsrc\b/);
  });
});

describe("manuales plantilla: el nombre de pantalla", () => {
  it("--pantalla pone el nombre en el encabezado", () => {
    const salida = correr("plantilla", "--pantalla", "Órdenes de venta");

    expect(salida.exitCode).toBe(0);
    expect(salida.stdout.split("\n")[0]).toBe("# Órdenes de venta");
  });

  it("la ayuda documenta el subcomando y sus banderas", () => {
    expect(USAGE).toContain("manuales plantilla");
    expect(USAGE).toContain("--pantalla <nombre>");
    expect(USAGE).toContain("--escribir");
    expect(USAGE).toContain("--destino <ruta>");
    expect(USAGE).toContain("--forzar");
  });
});

describe("manuales plantilla: la escritura", () => {
  it("sin --escribir no escribe ningún archivo, ni con --destino", () => {
    const salida = correr("plantilla", "--pantalla", "Órdenes", "--destino", MANUAL);

    expect(salida.exitCode).toBe(0);
    expect(existsSync(enLab(MANUAL))).toBe(false);
    expect(salida.stdout).toContain("# Órdenes");
  });

  it("--escribir --destino deja el manual en esa ruta relativa a la raíz", () => {
    const salida = correr(
      "plantilla",
      "--pantalla",
      "Órdenes",
      "--escribir",
      "--destino",
      MANUAL,
    );

    expect(salida.exitCode).toBe(0);
    expect(existsSync(enLab(MANUAL))).toBe(true);
    expect(leer(MANUAL)).toBe(renderPlantilla({ pantalla: "Órdenes" }));
  });

  it("--escribir sin --destino falla con error de esquema y no inventa una ruta", () => {
    const salida = correr("plantilla", "--pantalla", "Órdenes", "--escribir");

    expect(salida.exitCode).not.toBe(0);
    expect(salida.stderr).toMatch(/--destino/);
    expect(salida.stdout).toBe("");
  });

  it("rechaza una ruta absoluta y una que se sale de la raíz", () => {
    const absoluta = correr("plantilla", "--escribir", "--destino", join(lab, "manual.md"));
    expect(absoluta.exitCode).not.toBe(0);
    expect(absoluta.stderr).toMatch(/absoluta/i);

    const afuera = correr("plantilla", "--escribir", "--destino", "../manual.md");
    expect(afuera.exitCode).not.toBe(0);
    expect(afuera.stderr).toMatch(/se sale de la raíz/i);

    expect(existsSync(join(lab, "manual.md"))).toBe(false);
    expect(existsSync(join(dirname(lab), "manual.md"))).toBe(false);
  });

  it("sobre un manual existente falla y no lo modifica", () => {
    escribir(MANUAL, "# Manual previo de una persona\n");
    const antes = leer(MANUAL);

    const salida = correr("plantilla", "--escribir", "--destino", MANUAL);

    expect(salida.exitCode).not.toBe(0);
    expect(salida.stderr).toMatch(/ya existe/i);
    expect(leer(MANUAL)).toBe(antes);
  });

  it("--forzar reescribe el archivo con el esqueleto nuevo", () => {
    escribir(MANUAL, "# Manual previo de una persona\n");

    const salida = correr(
      "plantilla",
      "--pantalla",
      "Órdenes nuevas",
      "--escribir",
      "--forzar",
      "--destino",
      MANUAL,
    );

    expect(salida.exitCode).toBe(0);
    expect(leer(MANUAL)).toBe(renderPlantilla({ pantalla: "Órdenes nuevas" }));
  });
});

describe("el proceso actualizar-manuales declara el paso de agente", () => {
  it("carga con el paso escribir, de tipo agent, con runtime e instructions", () => {
    const manuales = requireProcess(REPO, "actualizar-manuales");
    const escribir = manuales.definition.steps.find((step) => step.id === "escribir");

    expect(escribir).toBeDefined();
    expect(escribir?.kind).toBe("agent");
    expect(escribir?.runtime).toBeTruthy();
    expect(escribir?.modelRole).toBe("implementation");

    const instrucciones = escribir?.instructions ?? "";
    expect(instrucciones).toContain(".valmen/skills/manuales-usuario-final/SKILL.md");
    expect(instrucciones).toContain("valmen manuales plantilla");
    expect(instrucciones).toMatch(/no commitear/i);

    // Va entre la detección y la auditoría: el agente escribe lo que la detección
    // marcó y la auditoría revisa el resultado.
    const ids = manuales.definition.steps.map((step) => step.id);
    expect(ids.indexOf("escribir")).toBeGreaterThan(ids.indexOf("detectar-pantallas"));
    expect(ids.indexOf("escribir")).toBeLessThan(ids.indexOf("auditar-manuales"));
  });

  it("el deploy lo sigue encadenando con continue_on_failure", () => {
    const deploy = requireProcess(REPO, "deploy");
    const paso = deploy.definition.steps.find((step) => step.id === "manuales");

    expect(paso?.kind).toBe("process");
    expect(paso?.target).toBe("actualizar-manuales");
    expect(paso?.continueOnFailure).toBe(true);
  });
});

describe("la copia instalada de la skill", () => {
  it("instalarPublicadas deja el laboratorio idéntico a la publicada", () => {
    const escrito = instalarPublicadas(lab);
    expect(escrito).toContain(ID_SKILL);

    const publicado = publicadas().find((skill) => skill.id === ID_SKILL);
    expect(publicado).toBeDefined();
    expect(readFileSync(join(lab, ".valmen", "skills", ID_SKILL, "SKILL.md"), "utf8")).toBe(
      publicado?.texto,
    );
  });

  it("la copia real del repositorio es idéntica a la publicada", () => {
    const publicado = publicadas().find((skill) => skill.id === ID_SKILL);
    expect(existsSync(RUTA_INSTALADA)).toBe(true);
    expect(readFileSync(RUTA_INSTALADA, "utf8")).toBe(publicado?.texto);
  });
});
