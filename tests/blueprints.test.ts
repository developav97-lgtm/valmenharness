/**
 * Las plantillas por stack.
 *
 * Lo que se afirma acá es lo que las hace usables: que escriban lo que prometen,
 * que **no pisen** lo que ya existe —las reglas del proyecto son del proyecto— y
 * que se puedan leer antes de aplicarlas.
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
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyBlueprint,
  blueprintsDir,
  listBlueprints,
  readBlueprint,
  renderBlueprintOutcome,
} from "../packages/adapter/src/blueprints.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-plantilla-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/**
 * Escribe una plantilla en un directorio de plantillas de laboratorio.
 *
 * Devuelve el **contenedor**, no la plantilla: el catálogo espera un directorio por
 * plantilla, que es lo que permite tener varias.
 */
function plantilla(nombre: string, archivos: Record<string, string>): string {
  const contenedor = mkdtempSync(join(tmpdir(), "valmen-plantillas-"));
  const directorio = join(contenedor, nombre);
  mkdirSync(directorio, { recursive: true });
  writeFileSync(
    join(directorio, "blueprint.yaml"),
    `name: ${nombre}\ntitle: Una plantilla\ndescription: Para probar.\n` +
      `detects:\n  - BackEnd/manage.py\nfiles:\n` +
      Object.keys(archivos)
        .map((archivo) => `  - ${archivo}`)
        .join("\n") +
      "\n",
    "utf8",
  );
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const destino = join(directorio, ruta);
    mkdirSync(join(destino, ".."), { recursive: true });
    writeFileSync(destino, contenido, "utf8");
  }
  return contenedor;
}

describe("el catálogo", () => {
  it("encuentra las plantillas del harness", () => {
    const directorio = blueprintsDir();
    expect(directorio).not.toBeNull();

    const plantillas = listBlueprints(directorio as string);
    expect(plantillas.map((una) => una.name)).toContain("django-angular-multitenant");
  });

  it("una plantilla rota se salta, no rompe el listado", () => {
    // Descartarla en silencio escondería un archivo roto en el repositorio del
    // harness, que es donde sí se ve; romper el comando dejaría sin plantillas a
    // quien no tiene nada que ver.
    const directorio = plantilla("buena", { "rules/a.md": "# A\n" });
    mkdirSync(join(directorio, "rota"), { recursive: true });
    writeFileSync(
      join(directorio, "rota", "blueprint.yaml"),
      "esto: [no, cierra\n",
      "utf8",
    );

    const nombres = listBlueprints(directorio).map((una) => una.name);
    expect(nombres).toContain("buena");
    expect(nombres).not.toContain("rota");
  });

  it("lee el contenido y la configuración que aporta", () => {
    const directorio = plantilla("con-config", { "rules/a.md": "# Regla\n" });
    const base = join(directorio, "con-config");
    writeFileSync(join(base, "config.yaml"), "test-commands:\n  - pytest\n", "utf8");
    writeFileSync(
      join(base, "blueprint.yaml"),
      `${readFileSync(join(base, "blueprint.yaml"), "utf8")}config: config.yaml\n`,
      "utf8",
    );

    const leida = readBlueprint(directorio, "con-config");
    expect(leida.files[0]?.content).toContain("# Regla");
    expect(leida.configFragment).toContain("test-commands");
  });
});

describe("aplicar", () => {
  it("escribe sus archivos en `.valmen/`", () => {
    const directorio = plantilla("una", {
      "rules/stack.md": "# Stack\n",
      "rules/invariantes.md": "# Invariantes\n",
    });
    const resultado = applyBlueprint(lab, readBlueprint(directorio, "una"));

    expect(resultado.written).toEqual([
      ".valmen/rules/stack.md",
      ".valmen/rules/invariantes.md",
    ]);
    expect(readFileSync(join(lab, ".valmen", "rules", "stack.md"), "utf8")).toBe(
      "# Stack\n",
    );
  });

  it("no pisa un archivo que ya existe, y lo dice", () => {
    // Las reglas del proyecto son del proyecto. Una plantilla que pisa lo que
    // alguien escribió es una plantilla que nadie vuelve a usar.
    const directorio = plantilla("una", {
      "rules/stack.md": "# De la plantilla\n",
      "rules/invariantes.md": "# Invariantes\n",
    });
    mkdirSync(join(lab, ".valmen", "rules"), { recursive: true });
    writeFileSync(join(lab, ".valmen", "rules", "stack.md"), "# Lo mío\n", "utf8");

    const resultado = applyBlueprint(lab, readBlueprint(directorio, "una"));

    expect(resultado.written).toEqual([".valmen/rules/invariantes.md"]);
    expect(resultado.skipped).toEqual([".valmen/rules/stack.md"]);
    expect(readFileSync(join(lab, ".valmen", "rules", "stack.md"), "utf8")).toBe(
      "# Lo mío\n",
    );
  });

  it("con `dry-run` no escribe nada", () => {
    const directorio = plantilla("una", { "rules/stack.md": "# Stack\n" });
    const resultado = applyBlueprint(lab, readBlueprint(directorio, "una"), {
      dryRun: true,
    });

    expect(resultado.written).toEqual([".valmen/rules/stack.md"]);
    expect(existsSync(join(lab, ".valmen"))).toBe(false);
  });

  it("el informe separa lo escrito de lo respetado", () => {
    const directorio = plantilla("una", { "rules/stack.md": "# Stack\n" });
    mkdirSync(join(lab, ".valmen", "rules"), { recursive: true });
    writeFileSync(join(lab, ".valmen", "rules", "stack.md"), "# Mío\n", "utf8");

    const texto = renderBlueprintOutcome(
      readBlueprint(directorio, "una"),
      applyBlueprint(lab, readBlueprint(directorio, "una")),
      false,
    );
    expect(texto).toContain("Ya existía, y no se toca");
    expect(texto).toContain(".valmen/rules/stack.md");
  });
});

describe("la plantilla que se entrega", () => {
  const cargar = () =>
    readBlueprint(blueprintsDir() as string, "django-angular-multitenant");

  it("trae reglas de verdad, no un esqueleto vacío", () => {
    const blueprint = cargar();
    expect(blueprint.title).toContain("Django");
    for (const archivo of blueprint.files) {
      expect(archivo.content.length, archivo.path).toBeGreaterThan(800);
    }
  });

  it("declara los comandos de prueba, que es lo que hace operable el gate mecánico", () => {
    // Una plantilla que deja el proyecto sin `test-commands` deja sus criterios sin
    // poder verificarse solos, y el gate mecánico detiene la primera entrega.
    const blueprint = cargar();
    expect(blueprint.configFragment).toContain("test-commands");
    expect(blueprint.configFragment).toContain("memory-sources");
  });
});
