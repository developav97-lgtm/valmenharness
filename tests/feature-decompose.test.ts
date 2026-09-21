/**
 * La descomposición de una feature: del grafo escrito a mano a la propuesta de un
 * modelo.
 *
 * Lo que se prueba aquí es la parte que **no** depende de un proveedor, que es
 * casi toda. El modelo entra por una función, así que estos tests comprueban lo
 * que de verdad decide si una descomposición sirve: que un requisito sin cubrir
 * no pase, que un ciclo no pase, que un ticket en dos sprints no pase, y que lo
 * que se escribe sea lo que el motor entendió y no lo que el modelo redactó.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  EXIT_INVARIANT,
  EXIT_SCHEMA,
  dependencyCycles,
  parseTicketsYaml,
  renderTicketsYaml,
} from "../packages/core/src/index.js";
import {
  advanceFeature,
  createFeature,
  decomposeFeature,
  parseRequirements,
  readRequirements,
} from "../packages/engine/src/index.js";

const temporales: string[] = [];

function proyecto(): string {
  const root = mkdtempSync(join(tmpdir(), "valmen-decompose-"));
  temporales.push(root);
  return root;
}

afterEach(() => {
  temporales.length = 0;
});

/** Una spec con dos requisitos, escrita como la escribiría una persona. */
const SPEC = `# Spec — inventario

## ADDED Requirements

### Requirement: R-INV-001 — El sistema DEBE registrar cada movimiento

El sistema DEBE registrar cada movimiento con su saldo resultante.

#### Scenario: Entrada por compra
- **GIVEN** una orden de compra recibida
- **WHEN** se confirma la recepción
- **THEN** el saldo del producto aumenta

### Requirement: R-INV-002 — El sistema DEBE permitir consultar el saldo

El sistema DEBE mostrar el saldo actual de un producto.
`;

/** Una feature con spec, lista para descomponer. */
function featureConSpec(root: string, spec = SPEC): string {
  createFeature({ root, id: "modulo-inventario", title: "Módulo de inventario" });
  const carpeta = join(root, ".valmen", "features", "modulo-inventario");
  mkdirSync(join(carpeta, "spec", "inventario"), { recursive: true });
  writeFileSync(join(carpeta, "spec", "inventario", "spec.md"), spec);
  // `specified` es el estado del que se descompone.
  advanceFeature({ root, slug: "modulo-inventario", to: "specified" });
  return root;
}

/** Una propuesta válida: dos sprints, los dos requisitos cubiertos. */
const PROPUESTA = {
  sprints: [
    {
      id: "S1",
      goal: "Modelo de datos",
      tickets: [
        {
          id: "FEATURE-INVENTARIO-MODELO-20260921",
          title: "Modelo de movimientos",
          depends_on: [],
        },
      ],
    },
    {
      id: "S2",
      goal: "Consulta de saldos",
      tickets: [
        {
          id: "FEATURE-INVENTARIO-SALDOS-20260921",
          title: "Pantalla de saldos",
          depends_on: ["FEATURE-INVENTARIO-MODELO-20260921"],
        },
      ],
    },
  ],
  coverage: [
    { requirement: "R-INV-001", covered_by: ["FEATURE-INVENTARIO-MODELO-20260921"] },
    { requirement: "R-INV-002", covered_by: ["FEATURE-INVENTARIO-SALDOS-20260921"] },
  ],
};

describe("parseRequirements", () => {
  it("extrae identificador y enunciado de cada requisito", () => {
    const requisitos = parseRequirements(SPEC, "inventario", "spec/inventario/spec.md");
    expect(requisitos.map((r) => r.id)).toEqual(["R-INV-001", "R-INV-002"]);
    expect(requisitos[0]!.statement).toContain("DEBE registrar cada movimiento");
    expect(requisitos[0]!.domain).toBe("inventario");
  });

  it("rechaza un enunciado sin palabra normativa", () => {
    // «El listado muestra los saldos» es una descripción, no un requisito: la
    // compuerta no puede exigir un ticket por una descripción.
    const spec = "### Requirement: R-INV-001 — El listado muestra los saldos\n";
    expect(() => parseRequirements(spec, "inventario", "spec.md")).toThrowError(
      /palabra normativa/,
    );
  });

  it("rechaza un requisito repetido", () => {
    const spec = [
      "### Requirement: R-INV-001 — El sistema DEBE registrar",
      "### Requirement: R-INV-001 — El sistema DEBE consultar",
    ].join("\n");
    expect(() => parseRequirements(spec, "inventario", "spec.md")).toThrowError(
      /repetido/,
    );
  });

  it("rechaza un requisito sin enunciado", () => {
    expect(() =>
      parseRequirements("### Requirement: R-INV-001\n", "inventario", "spec.md"),
    ).toThrowError(/no tiene enunciado/);
  });

  it("lee todos los dominios y los ordena", () => {
    const root = proyecto();
    createFeature({ root, id: "modulo-inventario", title: "Módulo" });
    const spec = join(root, ".valmen", "features", "modulo-inventario", "spec");
    for (const [dominio, id] of [
      ["reportes", "R-REP-001"],
      ["inventario", "R-INV-001"],
    ] as const) {
      mkdirSync(join(spec, dominio), { recursive: true });
      writeFileSync(
        join(spec, dominio, "spec.md"),
        `### Requirement: ${id} — El sistema DEBE hacer algo\n`,
      );
    }
    const requisitos = readRequirements(
      spec,
      ".valmen/features/modulo-inventario",
    );
    expect(requisitos.map((r) => r.id)).toEqual(["R-INV-001", "R-REP-001"]);
    expect(requisitos[0]!.source).toBe(
      ".valmen/features/modulo-inventario/spec/inventario/spec.md",
    );
  });

  it("ignora una carpeta de dominio sin spec.md", () => {
    const root = proyecto();
    const spec = join(root, "spec");
    mkdirSync(join(spec, "vacia"), { recursive: true });
    expect(readRequirements(spec, "spec")).toEqual([]);
  });
});

describe("dependencyCycles", () => {
  const conDependencias = (dependsOn: string[]) => ({
    sprints: [
      {
        id: "S1",
        goal: "uno",
        tickets: [
          { id: "FEATURE-INVENTARIO-A-20260921", dependsOn },
          { id: "FEATURE-INVENTARIO-B-20260921", dependsOn: [] },
        ],
      },
    ],
    coverage: [],
    gaps: [],
  });

  it("no encuentra ciclos en un grafo lineal", () => {
    const grafo = conDependencias([]);
    expect(dependencyCycles(grafo)).toEqual([]);
  });

  it("encuentra un ciclo de dos", () => {
    const grafo = {
      sprints: [
        {
          id: "S1",
          goal: "uno",
          tickets: [
            { id: "FEATURE-INVENTARIO-A-20260921", dependsOn: ["FEATURE-INVENTARIO-B-20260921"] },
            { id: "FEATURE-INVENTARIO-B-20260921", dependsOn: ["FEATURE-INVENTARIO-A-20260921"] },
          ],
        },
      ],
      coverage: [],
      gaps: [],
    };
    const ciclos = dependencyCycles(grafo);
    expect(ciclos).toHaveLength(1);
    expect(ciclos[0]![0]).toBe(ciclos[0]![ciclos[0]!.length - 1]);
    expect(ciclos[0]).toContain("FEATURE-INVENTARIO-A-20260921");
  });

  it("reporta una dependencia que no existe", () => {
    // No es una dependencia pendiente: es un error de escritura que produciría un
    // sprint que nunca arranca.
    const grafo = conDependencias(["FEATURE-INVENTARIO-FANTASMA-20260921"]);
    expect(dependencyCycles(grafo)).toEqual([
      ["FEATURE-INVENTARIO-FANTASMA-20260921", "FEATURE-INVENTARIO-FANTASMA-20260921"],
    ]);
  });
});

describe("parseTicketsYaml", () => {
  const requisitos = [
    { id: "R-INV-001", statement: "El sistema DEBE registrar" },
    { id: "R-INV-002", statement: "El sistema DEBE consultar" },
  ];

  /** El YAML de una propuesta válida. */
  const valido = renderTicketsYaml({
    feature: "modulo-inventario",
    origin: { provider: "opencode-go", model: "kimi-k3" },
    decomposition: {
      sprints: [
        {
          id: "S1",
          goal: "Modelo de datos",
          tickets: [{ id: "FEATURE-INVENTARIO-MODELO-20260921", title: "Modelo" }],
        },
      ],
      coverage: [
        { requirement: "R-INV-001", coveredBy: ["FEATURE-INVENTARIO-MODELO-20260921"] },
        { requirement: "R-INV-002", coveredBy: ["FEATURE-INVENTARIO-MODELO-20260921"] },
      ],
      gaps: [],
    },
  });

  it("lee el documento que él mismo escribe", () => {
    const documento = parseTicketsYaml(valido, requisitos);
    expect(documento.feature).toBe("modulo-inventario");
    expect(documento.origin?.model).toBe("kimi-k3");
    expect(documento.decomposition.sprints).toHaveLength(1);
    expect(documento.decomposition.coverage).toHaveLength(2);
  });

  it("la ida y vuelta no cambia un byte", () => {
    const documento = parseTicketsYaml(valido, requisitos);
    expect(renderTicketsYaml(documento)).toBe(valido);
  });

  it("la ida y vuelta aguanta valores que YAML leería mal sin comillas", () => {
    // La propiedad que importa: lo que se escribe tiene que releerse **igual**.
    // Un `goal` con dos puntos, un `#`, un guion inicial o comillas dentro es
    // donde un escritor descuidado produce un archivo que dice otra cosa.
    const difficiles = [
      "Núcleo: modelo y API",
      "#1 del backlog",
      "- algo que parece una lista",
      'Con "comillas" dentro',
      "Termina en dos puntos:",
      "  espacios al principio",
      "espacios al final  ",
      "una sola ' comilla",
      "vacío después de esto: # comentario",
      "100% de cobertura",
      "@mención",
    ];
    for (const goal of difficiles) {
      const documento = {
        feature: "modulo-inventario",
        origin: null,
        decomposition: {
          sprints: [
            {
              id: "S1",
              goal,
              tickets: [{ id: "FEATURE-INVENTARIO-MODELO-20260921", title: goal }],
            },
          ],
          coverage: [
            { requirement: "R-INV-001", coveredBy: ["FEATURE-INVENTARIO-MODELO-20260921"] },
            { requirement: "R-INV-002", coveredBy: ["FEATURE-INVENTARIO-MODELO-20260921"] },
          ],
          gaps: [],
        },
      };
      const yaml = renderTicketsYaml(documento);
      const releido = parseTicketsYaml(yaml, requisitos);
      expect(releido.decomposition.sprints[0]!.goal).toBe(goal);
      expect(renderTicketsYaml(releido)).toBe(yaml);
    }
  });

  it("rechaza un requisito que no está en la spec", () => {
    const malo = valido.replace("R-INV-002", "R-INV-999");
    expect(() => parseTicketsYaml(malo, requisitos)).toThrowError(/no está en la spec/);
  });

  it("rechaza un requisito sin cobertura", () => {
    // La regla dura. Se comprueba al leer y no solo en la compuerta, porque un
    // `tickets.yaml` que no cubre la spec no es un documento a medias.
    const sinCobertura = valido.replace(
      "  - requirement: R-INV-002\n    covered_by:\n      - FEATURE-INVENTARIO-MODELO-20260921\n",
      "",
    );
    expect(sinCobertura).not.toBe(valido);
    expect(() => parseTicketsYaml(sinCobertura, requisitos)).toThrowError(
      /R-INV-002.*sin ticket que los cubra|sin ticket que los cubra/,
    );
  });

  it("rechaza un ticket en dos sprints", () => {
    const doble = `feature: modulo-inventario
sprints:
  - id: S1
    goal: uno
    tickets:
      - FEATURE-INVENTARIO-MODELO-20260921
  - id: S2
    goal: dos
    tickets:
      - FEATURE-INVENTARIO-MODELO-20260921
coverage:
  - requirement: R-INV-001
    covered_by:
      - FEATURE-INVENTARIO-MODELO-20260921
  - requirement: R-INV-002
    covered_by:
      - FEATURE-INVENTARIO-MODELO-20260921
gaps: []
`;
    expect(() => parseTicketsYaml(doble, requisitos)).toThrowError(
      /está en los sprints S1 y S2/,
    );
  });

  it("rechaza un identificador de ticket inventado", () => {
    const malo = valido.replace(
      "- FEATURE-INVENTARIO-MODELO-20260921",
      "- modelo de datos",
    );
    expect(() => parseTicketsYaml(malo, requisitos)).toThrowError(
      /no es un identificador de ticket/,
    );
  });

  it("rechaza un sprint sin tickets", () => {
    const malo = valido.replace(
      "  - id: S1\n    goal: Modelo de datos\n    tickets:\n      - id: FEATURE-INVENTARIO-MODELO-20260921\n        title: Modelo\n        depends_on: []\n",
      "  - id: S1\n    goal: Modelo de datos\n    tickets: []\n",
    );
    expect(() => parseTicketsYaml(malo, requisitos)).toThrowError(/no tiene tickets/);
  });

});

describe("decomposeFeature", () => {
  const decomposer = { provider: "opencode-go", model: "kimi-k3" };

  /** Un `callModel` que devuelve la propuesta pedida. */
  const modelo = (proposal: unknown) =>
    async () => ({ proposal, decomposer });

  it("escribe el grafo y pasa la feature a decomposed", async () => {
    const root = featureConSpec(proyecto());
    const resultado = await decomposeFeature({
      root,
      slug: "modulo-inventario",
      callModel: modelo(PROPUESTA),
    });

    expect(resultado.written).toBe(true);
    expect(resultado.path).toBe(".valmen/features/modulo-inventario/tickets.yaml");
    const escrito = readFileSync(
      join(root, ".valmen", "features", "modulo-inventario", "tickets.yaml"),
      "utf8",
    );
    expect(escrito).toBe(resultado.yaml);
    expect(escrito).toContain("model: kimi-k3");
  });

  it("el YAML escrito se relee con el mismo parser que un archivo a mano", async () => {
    const root = featureConSpec(proyecto());
    const resultado = await decomposeFeature({
      root,
      slug: "modulo-inventario",
      callModel: modelo(PROPUESTA),
    });
    const requisitos = readRequirements(
      join(root, ".valmen", "features", "modulo-inventario", "spec"),
      ".valmen/features/modulo-inventario",
    );
    const releido = parseTicketsYaml(resultado.yaml, requisitos);
    expect(releido.decomposition.coverage).toHaveLength(2);
  });

  it("no escribe nada si el modelo deja un requisito sin cubrir", async () => {
    const root = featureConSpec(proyecto());
    const incompleta = {
      ...PROPUESTA,
      coverage: [PROPUESTA.coverage[0]],
    };
    await expect(
      decomposeFeature({ root, slug: "modulo-inventario", callModel: modelo(incompleta) }),
    ).rejects.toThrowError(/sin ticket que los cubra/);

    expect(
      existsSync(join(root, ".valmen", "features", "modulo-inventario", "tickets.yaml")),
    ).toBe(false);
  });

  it("no escribe nada si el grafo tiene un ciclo", async () => {
    const root = featureConSpec(proyecto());
    const conCiclo = {
      ...PROPUESTA,
      sprints: [
        {
          id: "S1",
          goal: "uno",
          tickets: [
            {
              id: "FEATURE-INVENTARIO-MODELO-20260921",
              title: "Modelo",
              depends_on: ["FEATURE-INVENTARIO-SALDOS-20260921"],
            },
            {
              id: "FEATURE-INVENTARIO-SALDOS-20260921",
              title: "Saldos",
              depends_on: ["FEATURE-INVENTARIO-MODELO-20260921"],
            },
          ],
        },
      ],
    };
    await expect(
      decomposeFeature({ root, slug: "modulo-inventario", callModel: modelo(conCiclo) }),
    ).rejects.toThrowError(/ciclo/);
    expect(
      existsSync(join(root, ".valmen", "features", "modulo-inventario", "tickets.yaml")),
    ).toBe(false);
  });

  it("rechaza una feature sin requisitos sin llamar al modelo", async () => {
    const root = proyecto();
    createFeature({ root, id: "modulo-inventario", title: "Módulo" });
    advanceFeature({ root, slug: "modulo-inventario", to: "specified" });

    let llamadas = 0;
    await expect(
      decomposeFeature({
        root,
        slug: "modulo-inventario",
        callModel: async () => {
          llamadas += 1;
          return { proposal: PROPUESTA, decomposer };
        },
      }),
    ).rejects.toThrowError(/no tiene requisitos/);
    // Lo comprobable sin gastar se comprueba sin gastar.
    expect(llamadas).toBe(0);
  });

  it("rechaza una feature en draft sin llamar al modelo", async () => {
    const root = proyecto();
    createFeature({ root, id: "modulo-inventario", title: "Módulo" });
    let llamadas = 0;
    await expect(
      decomposeFeature({
        root,
        slug: "modulo-inventario",
        callModel: async () => {
          llamadas += 1;
          return { proposal: PROPUESTA, decomposer };
        },
      }),
    ).rejects.toThrowError(/está en draft/);
    expect(llamadas).toBe(0);
  });

  it("con --dry-run no escribe pero devuelve el YAML", async () => {
    const root = featureConSpec(proyecto());
    const resultado = await decomposeFeature({
      root,
      slug: "modulo-inventario",
      write: false,
      callModel: modelo(PROPUESTA),
    });
    expect(resultado.written).toBe(false);
    expect(resultado.yaml).toContain("feature: modulo-inventario");
    expect(
      existsSync(join(root, ".valmen", "features", "modulo-inventario", "tickets.yaml")),
    ).toBe(false);
  });

  it("rechaza una propuesta que no es un objeto", async () => {
    const root = featureConSpec(proyecto());
    await expect(
      decomposeFeature({ root, slug: "modulo-inventario", callModel: modelo("hola") }),
    ).rejects.toThrowError(/no devolvió un objeto/);
  });

  it("rechaza una propuesta sin sprints", async () => {
    const root = featureConSpec(proyecto());
    await expect(
      decomposeFeature({
        root,
        slug: "modulo-inventario",
        callModel: modelo({ coverage: [] }),
      }),
    ).rejects.toThrowError(/no devolvió sprints/);
  });
});

describe("advanceFeature", () => {
  it("actualiza el estado y la fecha", () => {
    const root = proyecto();
    createFeature({
      root,
      id: "modulo-inventario",
      title: "Módulo",
      now: () => new Date("2026-09-01T12:00:00Z"),
    });
    const fila = advanceFeature({
      root,
      slug: "modulo-inventario",
      to: "specified",
      now: () => new Date("2026-09-21T12:00:00Z"),
    });
    expect(fila.state).toBe("specified");
    expect(fila.created).toBe("2026-09-01");
    expect(fila.updated).toBe("2026-09-21");
  });

  it("recorre el camino legal y lo declara", () => {
    const root = proyecto();
    createFeature({ root, id: "modulo-inventario", title: "Módulo" });
    advanceFeature({ root, slug: "modulo-inventario", to: "specified" });
    // `specified -> decomposed` se salta el diseño, así que la máquina lo
    // prohíbe. El camino pasa por `planned`, y quien llama puede decirlo.
    const fila = advanceFeature({ root, slug: "modulo-inventario", to: "decomposed" });
    expect(fila.state).toBe("decomposed");
    expect(fila.via).toEqual(["planned"]);
  });

  it("no escribe los estados intermedios: una sola escritura", () => {
    const root = proyecto();
    createFeature({ root, id: "modulo-inventario", title: "Módulo" });
    advanceFeature({ root, slug: "modulo-inventario", to: "specified" });
    const antes = readFileSync(
      join(root, ".valmen", "features", "modulo-inventario", "feature.md"),
      "utf8",
    );
    advanceFeature({ root, slug: "modulo-inventario", to: "decomposed" });
    const despues = readFileSync(
      join(root, ".valmen", "features", "modulo-inventario", "feature.md"),
      "utf8",
    );
    // Las dos escrituras son el mismo día, así que `updated` no cambia y lo
    // único distinto es el estado. Nada de `planned` a la vista: la feature
    // nunca estuvo ahí.
    const cambiadas = antes
      .split("\n")
      .filter((linea, indice) => linea !== despues.split("\n")[indice]);
    expect(cambiadas).toEqual(["state: specified"]);
    expect(despues).not.toContain("planned");
  });

  it("rechaza un destino inalcanzable", () => {
    const root = proyecto();
    createFeature({ root, id: "modulo-inventario", title: "Módulo" });
    for (const estado of ["specified", "planned", "decomposed", "in_progress", "complete", "archived"]) {
      advanceFeature({ root, slug: "modulo-inventario", to: estado });
    }
    // `archived` es terminal: no hay camino de vuelta.
    expect(() =>
      advanceFeature({ root, slug: "modulo-inventario", to: "draft" }),
    ).toThrowError(/no permitida/);
  });

  it("rechaza una feature que no existe", () => {
    expect(() =>
      advanceFeature({ root: proyecto(), slug: "no-existe", to: "specified" }),
    ).toThrowError(/No existe la feature/);
  });
});

describe("códigos de salida", () => {
  it("una feature sin spec sale con invariante, no con esquema", async () => {
    const root = proyecto();
    createFeature({ root, id: "modulo-inventario", title: "Módulo" });
    const error = await decomposeFeature({
      root,
      slug: "modulo-inventario",
      callModel: async () => ({ proposal: PROPUESTA, decomposer: {} as never }),
    }).catch((caught: unknown) => caught as { exitCode: number });
    expect(error.exitCode).toBe(EXIT_INVARIANT);
  });

  it("un tickets.yaml mal formado sale con esquema", () => {
    const error = (() => {
      try {
        parseTicketsYaml("feature: x\n", []);
        return null;
      } catch (caught) {
        return caught as { exitCode: number };
      }
    })();
    expect(error?.exitCode).toBe(EXIT_SCHEMA);
  });
});
