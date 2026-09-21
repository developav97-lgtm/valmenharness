/**
 * El registro de features en disco y sus tres comandos.
 *
 * Lo que se prueba aquí no es el formateo de una tabla: es que el registro no
 * pueda quedar en un estado que después nadie vea. Una feature con el
 * frontmatter roto, una carpeta que dice llamarse distinto que su id, un slug
 * que se sale del esquema — todo eso tiene que aparecer, no desaparecer.
 */
import { existsSync, mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { EXIT_HISTORY, EXIT_SCHEMA } from "../packages/core/src/errors.js";
import {
  createFeature,
  featurePath,
  listFeatures,
  parseFeatureFrontmatter,
  readFeature,
} from "../packages/engine/src/features.js";
import {
  featureList,
  featureNew,
  featureShow,
} from "../packages/cli/src/features.js";

const temporales: string[] = [];

/** Un proyecto vacío, que es donde vive una feature nueva. */
function proyecto(): string {
  const root = mkdtempSync(join(tmpdir(), "valmen-features-"));
  temporales.push(root);
  return root;
}

afterEach(() => {
  temporales.length = 0;
});

describe("createFeature", () => {
  it("crea el brief en draft y lo deja válido", () => {
    const root = proyecto();
    createFeature({ root, id: "modulo-inventario", title: "Módulo de inventario" });

    expect(existsSync(featurePath(root, "modulo-inventario"))).toBe(true);

    const leida = readFeature(root, "modulo-inventario");
    expect(leida).not.toBeNull();
    expect(leida!.row.invalid).toBeNull();
    expect(leida!.row.state).toBe("draft");
    expect(leida!.row.title).toBe("Módulo de inventario");
    // Nace sin spec: crear una carpeta vacía prometería trabajo que no se hizo.
    expect(leida!.row.artifacts).toEqual({
      hasSpec: false,
      hasDesign: false,
      hasDecomposition: false,
      hasVerify: false,
    });
  });

  it("escribe el título también como encabezado", () => {
    const root = proyecto();
    createFeature({ root, id: "modulo-inventario", title: "Módulo de inventario" });
    const { text } = readFeature(root, "modulo-inventario")!;
    expect(text).toContain("# Módulo de inventario\n");
    expect(text).toContain("title: Módulo de inventario\n");
  });

  it("no sobrescribe una feature existente", () => {
    const root = proyecto();
    createFeature({ root, id: "modulo-inventario", title: "Primera" });

    expect(() =>
      createFeature({ root, id: "modulo-inventario", title: "Segunda" }),
    ).toThrowError(/ya existe/);

    // Y el título de la primera sigue ahí: el rechazo no dejó nada a medias.
    expect(readFeature(root, "modulo-inventario")!.row.title).toBe("Primera");
  });

  it("rechaza un slug fuera del esquema sin dejar carpeta", () => {
    const root = proyecto();
    expect(() =>
      createFeature({ root, id: "Modulo_Inventario", title: "Módulo" }),
    ).toThrowError(/slug/);
    // Ni la carpeta de la feature ni la de features: no se creó nada.
    expect(existsSync(join(root, ".valmen", "features"))).toBe(false);
  });

  it("rechaza un título vacío sin dejar carpeta", () => {
    const root = proyecto();
    expect(() =>
      createFeature({ root, id: "modulo-inventario", title: "   " }),
    ).toThrowError(/título/);
    expect(existsSync(join(root, ".valmen", "features"))).toBe(false);
  });

  it("usa la fecha que se le pasa, para que el registro sea reproducible", () => {
    const root = proyecto();
    createFeature({
      root,
      id: "modulo-inventario",
      title: "Módulo de inventario",
      now: () => new Date("2026-09-21T12:00:00Z"),
    });
    const { row } = readFeature(root, "modulo-inventario")!;
    expect(row.created).toBe("2026-09-21");
    expect(row.updated).toBe("2026-09-21");
  });
});

describe("listFeatures", () => {
  it("devuelve vacío en un proyecto sin features", () => {
    expect(listFeatures(proyecto())).toEqual([]);
  });

  it("lista los artefactos que ya existen", () => {
    const root = proyecto();
    createFeature({ root, id: "modulo-inventario", title: "Módulo de inventario" });
    const carpeta = join(root, ".valmen", "features", "modulo-inventario");
    mkdirSync(join(carpeta, "spec", "inventario"), { recursive: true });
    writeFileSync(join(carpeta, "spec", "inventario", "spec.md"), "# Spec\n");
    writeFileSync(join(carpeta, "tickets.yaml"), "sprints: []\n");

    const [fila] = listFeatures(root);
    expect(fila!.artifacts).toEqual({
      hasSpec: true,
      hasDesign: false,
      hasDecomposition: true,
      hasVerify: false,
    });
  });

  it("no esconde una feature inválida: la lista con su error", () => {
    const root = proyecto();
    createFeature({ root, id: "modulo-inventario", title: "Módulo de inventario" });
    // Un estado que no pertenece al esquema: la feature existe y está rota.
    const documento = featurePath(root, "modulo-inventario");
    writeFileSync(
      documento,
      "---\nschema_version: 2\nid: modulo-inventario\ntitle: Módulo\nstate: en-progreso\ncreated: 2026-09-21\nupdated: 2026-09-21\n---\n\n# Módulo\n",
    );

    const filas = listFeatures(root);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.invalid).toMatch(/en-progreso/);
    expect(filas[0]!.state).toBe("?");
  });

  it("marca la feature cuyo id no coincide con su carpeta", () => {
    const root = proyecto();
    createFeature({ root, id: "modulo-inventario", title: "Módulo de inventario" });
    // Renombrar la carpeta a mano cambiaría de feature en silencio si el motor
    // no lo comprobara.
    const base = join(root, ".valmen", "features");
    renameSync(join(base, "modulo-inventario"), join(base, "otra-cosa"));

    const [fila] = listFeatures(root);
    expect(fila!.id).toBe("otra-cosa");
    expect(fila!.invalid).toMatch(/no coincide con la carpeta/);
  });

  it("ignora archivos sueltos en el directorio de features", () => {
    const root = proyecto();
    createFeature({ root, id: "modulo-inventario", title: "Módulo de inventario" });
    writeFileSync(join(root, ".valmen", "features", "LEEME.md"), "notas\n");
    expect(listFeatures(root).map((fila) => fila.id)).toEqual(["modulo-inventario"]);
  });
});

describe("parseFeatureFrontmatter", () => {
  it("rechaza un campo que no pertenece a la feature", () => {
    expect(() =>
      parseFeatureFrontmatter(
        "---\nid: x\ntitle: X\nstate: draft\ncreated: 2026-01-01\nupdated: 2026-01-01\nworkflow_status: intake\n---\n",
      ),
    ).toThrowError(/workflow_status/);
  });

  it("nombra los campos que faltan", () => {
    expect(() =>
      parseFeatureFrontmatter("---\nid: x\ntitle: X\nstate: draft\n---\n"),
    ).toThrowError(/created, updated/);
  });

  it("rechaza un campo duplicado", () => {
    expect(() =>
      parseFeatureFrontmatter(
        "---\nid: x\nid: y\ntitle: X\nstate: draft\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n",
      ),
    ).toThrowError(/duplicado/);
  });
});

describe("valmen feature", () => {
  it("new crea y list muestra la fila", () => {
    const root = proyecto();
    const alta = featureNew(root, "modulo-inventario", "Módulo de inventario");
    expect(alta.exitCode).toBe(0);
    expect(alta.stdout).toContain("modulo-inventario (draft)");

    const lista = featureList(root);
    expect(lista.exitCode).toBe(0);
    expect(lista.stdout).toBe(
      "modulo-inventario | draft | — | Módulo de inventario\n",
    );
  });

  it("new exige slug y título", () => {
    const root = proyecto();
    expect(featureNew(root, undefined, "Módulo").exitCode).toBe(EXIT_SCHEMA);
    expect(featureNew(root, "modulo-inventario", undefined).exitCode).toBe(
      EXIT_SCHEMA,
    );
    expect(featureNew(root, "modulo-inventario", "  ").exitCode).toBe(EXIT_SCHEMA);
  });

  it("new sobre una feature existente sale con el código de historia", () => {
    const root = proyecto();
    featureNew(root, "modulo-inventario", "Módulo de inventario");
    const repetido = featureNew(root, "modulo-inventario", "Otra vez");
    expect(repetido.exitCode).toBe(EXIT_HISTORY);
    expect(repetido.stderr).toMatch(/ya existe/);
  });

  it("list dice qué hacer cuando no hay ninguna", () => {
    const root = proyecto();
    const lista = featureList(root);
    expect(lista.exitCode).toBe(0);
    expect(lista.stdout).toMatch(/valmen feature new/);
  });

  it("list nombra los artefactos ya escritos", () => {
    const root = proyecto();
    featureNew(root, "modulo-inventario", "Módulo de inventario");
    writeFileSync(
      join(root, ".valmen", "features", "modulo-inventario", "design.md"),
      "# Diseño\n",
    );
    expect(featureList(root).stdout).toBe(
      "modulo-inventario | draft | diseño | Módulo de inventario\n",
    );
  });

  it("show imprime el brief y el estado de cada artefacto", () => {
    const root = proyecto();
    featureNew(root, "modulo-inventario", "Módulo de inventario");
    const visto = featureShow(root, "modulo-inventario");
    expect(visto.exitCode).toBe(0);
    expect(visto.stdout).toContain("modulo-inventario — Módulo de inventario");
    expect(visto.stdout).toContain("estado: draft");
    expect(visto.stdout).toContain("✓ .valmen/features/modulo-inventario/feature.md");
    expect(visto.stdout).toContain("## Problema");
  });

  it("show falla si la feature no existe", () => {
    const root = proyecto();
    const visto = featureShow(root, "no-existe");
    expect(visto.exitCode).toBe(EXIT_SCHEMA);
    expect(visto.stderr).toMatch(/No existe la feature/);
  });

  it("show exige el slug", () => {
    expect(featureShow(proyecto(), undefined).exitCode).toBe(EXIT_SCHEMA);
  });

  it("show reporta una feature inválida en vez de imprimirla como buena", () => {
    const root = proyecto();
    featureNew(root, "modulo-inventario", "Módulo de inventario");
    writeFileSync(
      featurePath(root, "modulo-inventario"),
      "---\nschema_version: 2\nid: modulo-inventario\ntitle: Módulo\nstate: inventado\ncreated: 2026-09-21\nupdated: 2026-09-21\n---\n",
    );
    const visto = featureShow(root, "modulo-inventario");
    expect(visto.exitCode).toBe(EXIT_SCHEMA);
    expect(visto.stderr).toMatch(/inventado/);
    expect(visto.stdout).toBe("");
  });
});
