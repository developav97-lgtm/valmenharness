/**
 * La vista de features de Mission Control.
 *
 * Lo que estos tests protegen, y es lo que hace útil la pantalla:
 *
 * 1. **El hueco se ve.** Una descomposición que no cubre un requisito no se
 *    esconde detrás de un «inválido»: aparecen los requisitos sin cubrir con su
 *    enunciado. Es la diferencia entre enterarse antes de empezar y descubrirlo
 *    en el sprint tres.
 * 2. **El grafo se contrasta con el registro.** Un ticket del sprint que todavía
 *    no está escrito se marca como tal. `tickets.yaml` dice lo que se planeó, y
 *    el registro lo que hay.
 * 3. **Una feature que no valida no se oculta**, igual que un ticket.
 * 4. **La proyección no inventa**: todo sale del brief, de la spec o del grafo.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  listFeatureRows,
  readFeatureDetail,
  summarizeFeatures,
} from "../packages/server/src/features.js";
import { handleApi } from "../packages/server/src/server.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-features-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** La carpeta de una feature. */
function carpeta(slug: string): string {
  return join(lab, ".valmen", "features", slug);
}

/** El brief de una feature en el estado pedido. */
function escribirFeature(slug: string, state = "specified"): void {
  mkdirSync(carpeta(slug), { recursive: true });
  writeFileSync(
    join(carpeta(slug), "feature.md"),
    [
      "---",
      "schema_version: 2",
      `id: ${slug}`,
      `title: Módulo de ${slug}`,
      `state: ${state}`,
      "created: 2026-09-21",
      "updated: 2026-09-21",
      "---",
      "",
      `# Módulo de ${slug}`,
      "",
      "## Problema",
      "",
      "Nadie sabe cuánto queda.",
      "",
    ].join("\n"),
  );
}

/** Una spec con los requisitos pedidos. */
function escribirSpec(slug: string, dominio: string, texto: string): void {
  mkdirSync(join(carpeta(slug), "spec", dominio), { recursive: true });
  writeFileSync(join(carpeta(slug), "spec", dominio, "spec.md"), texto);
}

/**
 * Un `tickets.yaml` completo.
 *
 * Se pasan los tres bloques por separado y no un texto con todo dentro: la
 * primera versión concatenaba y el resultado tenía `coverage:` dentro de
 * `sprints:`, así que los tests comprobaban la proyección de un archivo mal
 * formado sin que se notara.
 */
function escribirGrafo(
  slug: string,
  bloques: {
    sprints: string[];
    coverage: string[];
    gaps?: string[];
  },
): void {
  const lineas = [`feature: ${slug}`, "sprints:", ...bloques.sprints];
  // Una lista vacía se escribe `coverage: []`, no `coverage:` con un `[]`
  // indentado debajo: lo segundo es un elemento de lista que dice «[]», y el
  // parser lo rechaza con razón.
  lineas.push(
    ...(bloques.coverage.length === 0
      ? ["coverage: []"]
      : ["coverage:", ...bloques.coverage]),
  );
  lineas.push(
    ...(bloques.gaps === undefined || bloques.gaps.length === 0
      ? ["gaps: []"]
      : ["gaps:", ...bloques.gaps.map((h) => `  - ${h}`)]),
  );
  writeFileSync(join(carpeta(slug), "tickets.yaml"), lineas.join("\n") + "\n");
}

/** Un sprint con sus tickets. */
function sprint(id: string, goal: string, tickets: string[]): string[] {
  return [`  - id: ${id}`, `    goal: ${goal}`, "    tickets:", ...tickets];
}

/** Un ticket del grafo. */
function ticket(id: string, title: string, dependsOn: string[] = []): string[] {
  const lineas = [`      - id: ${id}`, `        title: ${title}`];
  lineas.push(
    ...(dependsOn.length === 0
      ? ["        depends_on: []"]
      : ["        depends_on:", ...dependsOn.map((d) => `          - ${d}`)]),
  );
  return lineas;
}

/** Una entrada de cobertura. */
function cobertura(requirement: string, coveredBy: string[]): string[] {
  return [
    `  - requirement: ${requirement}`,
    "    covered_by:",
    ...coveredBy.map((id) => `      - ${id}`),
  ];
}

/** Un ticket en el registro, con su estado. */
function escribirTicket(id: string, workflow = "in_progress"): void {
  const ruta = join(lab, "tickets", "2026", id);
  mkdirSync(ruta, { recursive: true });
  writeFileSync(
    join(ruta, "ticket.md"),
    ["---", `workflow_status: ${workflow}`, "---", ""].join("\n"),
  );
}

const SPEC_DOS_REQUISITOS = [
  "# Spec — inventario",
  "",
  "### Requirement: R-INV-001 — El sistema DEBE registrar cada movimiento",
  "El sistema DEBE registrar cada movimiento.",
  "",
  "### Requirement: R-INV-002 — El sistema DEBE consultar el saldo",
  "El sistema DEBE mostrar el saldo actual.",
  "",
].join("\n");

describe("listFeatureRows", () => {
  it("devuelve vacío en un proyecto sin features", () => {
    expect(listFeatureRows(lab)).toEqual([]);
  });

  it("cuenta los requisitos de la spec y los tickets del grafo", () => {
    escribirFeature("modulo-inventario");
    escribirSpec("modulo-inventario", "inventario", SPEC_DOS_REQUISITOS);
    escribirGrafo("modulo-inventario", {
      sprints: sprint("S1", "Modelo", [
        ...ticket("FEATURE-INV-MODELO-20260921", "Modelo"),
        ...ticket("FEATURE-INV-SALDO-20260921", "Saldo", ["FEATURE-INV-MODELO-20260921"]),
      ]),
      coverage: [
        ...cobertura("R-INV-001", ["FEATURE-INV-MODELO-20260921"]),
        ...cobertura("R-INV-002", ["FEATURE-INV-SALDO-20260921"]),
      ],
    });

    const [fila] = listFeatureRows(lab);
    expect(fila!.id).toBe("modulo-inventario");
    expect(fila!.state).toBe("specified");
    expect(fila!.requirements).toBe(2);
    expect(fila!.tickets).toBe(2);
    expect(fila!.hasSpec).toBe(true);
    expect(fila!.hasDecomposition).toBe(true);
    expect(fila!.hasDesign).toBe(false);
  });

  it("cuenta los huecos de cobertura", () => {
    // La cobertura no declara R-INV-002: hay un hueco, y la lista tiene que
    // decirlo sin que haya que abrir la feature.
    escribirFeature("modulo-inventario");
    escribirSpec("modulo-inventario", "inventario", SPEC_DOS_REQUISITOS);
    escribirGrafo("modulo-inventario", {
      sprints: sprint("S1", "Modelo", ["      - FEATURE-INV-MODELO-20260921"]),
      coverage: cobertura("R-INV-001", ["FEATURE-INV-MODELO-20260921"]),
    });

    const [fila] = listFeatureRows(lab);
    expect(fila!.gaps).toBe(1);
  });

  it("no esconde una feature que no valida: la lista con su error", () => {
    escribirFeature("modulo-inventario");
    const documento = join(carpeta("modulo-inventario"), "feature.md");
    writeFileSync(
      documento,
      "---\nschema_version: 2\nid: modulo-inventario\ntitle: M\nstate: en-progreso\ncreated: 2026-09-21\nupdated: 2026-09-21\n---\n",
    );

    const [fila] = listFeatureRows(lab);
    expect(fila!.invalid).toMatch(/en-progreso/);
    expect(summarizeFeatures(listFeatureRows(lab)).invalid).toBe(1);
  });
});

describe("readFeatureDetail", () => {
  it("devuelve el brief y las specs con sus requisitos", () => {
    escribirFeature("modulo-inventario");
    escribirSpec("modulo-inventario", "inventario", SPEC_DOS_REQUISITOS);

    const detalle = readFeatureDetail(lab, "modulo-inventario");
    expect(detalle).not.toBeNull();
    expect(detalle!.brief).toContain("Nadie sabe cuánto queda.");
    expect(detalle!.specs).toHaveLength(1);
    expect(detalle!.specs[0]!.domain).toBe("inventario");
    expect(detalle!.specs[0]!.requirements.map((r) => r.id)).toEqual([
      "R-INV-001",
      "R-INV-002",
    ]);
  });

  it("devuelve null si la feature no existe", () => {
    expect(readFeatureDetail(lab, "no-existe")).toBeNull();
  });

  it("pone el hueco a la vista con el enunciado del requisito", () => {
    escribirFeature("modulo-inventario");
    escribirSpec("modulo-inventario", "inventario", SPEC_DOS_REQUISITOS);
    escribirGrafo("modulo-inventario", {
      sprints: sprint("S1", "Modelo", ["      - FEATURE-INV-MODELO-20260921"]),
      coverage: cobertura("R-INV-001", ["FEATURE-INV-MODELO-20260921"]),
    });

    const detalle = readFeatureDetail(lab, "modulo-inventario")!;
    expect(detalle.decomposition!.gaps).toHaveLength(1);
    expect(detalle.decomposition!.gaps[0]!.requirement).toBe("R-INV-002");
    // El enunciado y no solo el identificador: `R-INV-002` no dice qué falta.
    expect(detalle.decomposition!.gaps[0]!.statement).toContain("consultar el saldo");
  });

  it("marca el ticket del grafo que todavía no está en el registro", () => {
    escribirFeature("modulo-inventario");
    escribirSpec("modulo-inventario", "inventario", SPEC_DOS_REQUISITOS);
    escribirGrafo("modulo-inventario", {
      sprints: sprint("S1", "Modelo", [
        ...ticket("FEATURE-INV-MODELO-20260921", "Modelo"),
        ...ticket("FEATURE-INV-SALDO-20260921", "Saldo", ["FEATURE-INV-MODELO-20260921"]),
      ]),
      coverage: [
        ...cobertura("R-INV-001", ["FEATURE-INV-MODELO-20260921"]),
        ...cobertura("R-INV-002", ["FEATURE-INV-SALDO-20260921"]),
      ],
    });
    // Solo el primero existe, y está en curso.
    escribirTicket("FEATURE-INV-MODELO-20260921");

    const detalle = readFeatureDetail(lab, "modulo-inventario")!;
    const tickets = detalle.decomposition!.sprints[0]!.tickets;
    expect(tickets[0]!.exists).toBe(true);
    expect(tickets[0]!.state).toBe("in_progress");
    expect(tickets[1]!.exists).toBe(false);
    expect(tickets[1]!.state).toBeNull();
    expect(tickets[1]!.dependsOn).toEqual(["FEATURE-INV-MODELO-20260921"]);
  });

  it("reporta un ciclo del grafo", () => {
    escribirFeature("modulo-inventario");
    escribirSpec("modulo-inventario", "inventario", SPEC_DOS_REQUISITOS);
    escribirGrafo("modulo-inventario", {
      sprints: sprint("S1", "Modelo", [
        ...ticket("FEATURE-INV-A-20260921", "A", ["FEATURE-INV-B-20260921"]),
        ...ticket("FEATURE-INV-B-20260921", "B", ["FEATURE-INV-A-20260921"]),
      ]),
      coverage: [
        ...cobertura("R-INV-001", ["FEATURE-INV-A-20260921"]),
        ...cobertura("R-INV-002", ["FEATURE-INV-B-20260921"]),
      ],
    });

    const detalle = readFeatureDetail(lab, "modulo-inventario")!;
    expect(detalle.cycles).toHaveLength(1);
  });

  it("dice qué le pasa a un tickets.yaml que no se puede leer", () => {
    // Un archivo con la forma rota es un error que hay que decir, no una lista
    // vacía que parece «no hay nada».
    escribirFeature("modulo-inventario");
    escribirSpec("modulo-inventario", "inventario", SPEC_DOS_REQUISITOS);
    writeFileSync(
      join(carpeta("modulo-inventario"), "tickets.yaml"),
      "feature: modulo-inventario\n",
    );

    const detalle = readFeatureDetail(lab, "modulo-inventario")!;
    expect(detalle.decomposition).toBeNull();
    expect(detalle.decompositionError).toMatch(/sprints/);
  });

  it("con un grafo incompleto sigue mostrando la cobertura, sin romperse", () => {
    // El caso real: el modelo propuso un grafo que no cubre todo. La pantalla
    // tiene que mostrarlo; el parser estricto lo rechazaría, y por eso la
    // proyección usa la vista de solo lectura.
    escribirFeature("modulo-inventario");
    escribirSpec("modulo-inventario", "inventario", SPEC_DOS_REQUISITOS);
    escribirGrafo("modulo-inventario", {
      sprints: sprint("S1", "Modelo", ["      - FEATURE-INV-MODELO-20260921"]),
      coverage: [],
    });

    const detalle = readFeatureDetail(lab, "modulo-inventario")!;
    expect(detalle.decompositionError).toBeNull();
    expect(detalle.decomposition).not.toBeNull();
    expect(detalle.decomposition!.gaps).toHaveLength(2);
    const requisitos = detalle.decomposition!.requirements;
    expect(requisitos[0]!.coveredBy).toEqual([]);
    expect(requisitos[1]!.coveredBy).toEqual([]);
  });

  it("sin descomposición no hay grafo ni error", () => {
    escribirFeature("modulo-inventario", "draft");
    const detalle = readFeatureDetail(lab, "modulo-inventario")!;
    expect(detalle.decomposition).toBeNull();
    expect(detalle.decompositionError).toBeNull();
    expect(detalle.ticketsYaml).toBeNull();
  });

  it("lee el diseño cuando existe", () => {
    escribirFeature("modulo-inventario");
    writeFileSync(join(carpeta("modulo-inventario"), "design.md"), "# Diseño\n");
    expect(readFeatureDetail(lab, "modulo-inventario")!.design).toBe("# Diseño\n");
  });
});

describe("endpoints de features", () => {
  const contexto = () => ({
    root: lab,
    credentialsFile: join(lab, "credenciales.yaml"),
    env: {},
  });

  it("GET /api/features devuelve el resumen y la lista", async () => {
    escribirFeature("modulo-inventario");
    escribirSpec("modulo-inventario", "inventario", SPEC_DOS_REQUISITOS);

    const r = await handleApi("GET", "/api/features", {}, contexto());
    expect(r.status).toBe(200);
    const cuerpo = r.body as { summary: { total: number }; features: unknown[] };
    expect(cuerpo.summary.total).toBe(1);
    expect(cuerpo.features).toHaveLength(1);
  });

  it("GET /api/features/:slug devuelve el detalle", async () => {
    escribirFeature("modulo-inventario");
    escribirSpec("modulo-inventario", "inventario", SPEC_DOS_REQUISITOS);

    const r = await handleApi("GET", "/api/features/modulo-inventario", {}, contexto());
    expect(r.status).toBe(200);
    expect((r.body as { id: string }).id).toBe("modulo-inventario");
  });

  it("GET /api/features/:slug devuelve 404 si no existe", async () => {
    const r = await handleApi("GET", "/api/features/no-existe", {}, contexto());
    expect(r.status).toBe(404);
    expect((r.body as { error: string }).error).toMatch(/No existe la feature/);
  });

  it("la lista vacía no es un error", async () => {
    const r = await handleApi("GET", "/api/features", {}, contexto());
    expect(r.status).toBe(200);
    expect((r.body as { features: unknown[] }).features).toEqual([]);
  });
});
