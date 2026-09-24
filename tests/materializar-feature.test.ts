/**
 * Escribir los tickets de una feature en el registro.
 *
 * Descomponer deja un plan; esto lo convierte en trabajo. Lo que se afirma acá es
 * lo que hace que se pueda correr sin miedo:
 *
 * 1. **Un ticket que ya existe no se toca.** Volver a correrlo después de trabajar
 *    un rato no puede pisar lo trabajado, y es lo que permite usarlo como
 *    «escribí los que falten» en vez de «escribí todo».
 * 2. **Un grafo con huecos no se escribe.** Escribirlo dejaría tickets que nacen
 *    con la cobertura a medias, y el hueco tiene que resolverse en el grafo.
 * 3. **Nada se crea si un identificador está mal.** Se comprueba todo antes de
 *    escribir el primero: tres creados y un fallo deja el registro a medio hacer.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RegistryPaths } from "../packages/engine/src/discovery.js";
import {
  materializeFeature,
  renderMaterialization,
} from "../packages/engine/src/materialize.js";
import { listTickets } from "../packages/engine/src/tickets.js";
import { advanceFeature } from "../packages/engine/src/features.js";

let lab: string;

const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });

/** La spec de la feature, con dos requisitos. */
const SPEC = `### Requirement: R-INV-001 — El sistema DEBE registrar cada movimiento

El kardex lista entradas y salidas con su saldo.

### Requirement: R-INV-002 — El sistema DEBE permitir exportar

La pantalla ofrece exportar a PDF.
`;

/** El grafo: dos tickets en un sprint, uno depende del otro. */
function grafo(
  opciones: { readonly gaps?: string; readonly tituloVacio?: boolean } = {},
): string {
  return [
    "feature: kardex",
    "sprints:",
    "  - id: S1",
    "    goal: Modelo y API del kardex",
    "    tickets:",
    "      - id: FEATURE-INVENTARIO-MODELO-20260924",
    opciones.tituloVacio === true ? '        title: ""' : "        title: Modelo de datos",
    "        depends_on: []",
    "      - id: FEATURE-INVENTARIO-API-20260924",
    "        title: API de consulta",
    "        depends_on:",
    "          - FEATURE-INVENTARIO-MODELO-20260924",
    "coverage:",
    "  - requirement: R-INV-001",
    "    covered_by:",
    "      - FEATURE-INVENTARIO-MODELO-20260924",
    "      - FEATURE-INVENTARIO-API-20260924",
    "  - requirement: R-INV-002",
    "    covered_by:",
    "      - FEATURE-INVENTARIO-API-20260924",
    `gaps: [${opciones.gaps ?? ""}]`,
    "",
  ].join("\n");
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-feature-"));
  mkdirSync(join(lab, ".valmen", "features", "kardex", "spec", "inventario"), {
    recursive: true,
  });
  writeFileSync(
    join(lab, ".valmen", "features", "kardex", "feature.md"),
    // Con el frontmatter completo: la feature se valida contra su contrato, y una
    // a la que le falten campos no es un caso de este módulo.
    [
      "---",
      "schema_version: 2",
      "id: kardex",
      "title: Kardex de inventario",
      "state: decomposed",
      "created: 2026-09-24",
      "updated: 2026-09-24",
      "---",
      "",
      "# Kardex de inventario",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(lab, ".valmen", "features", "kardex", "spec", "inventario", "spec.md"),
    SPEC,
    "utf8",
  );
  writeFileSync(
    join(lab, ".valmen", "features", "kardex", "tickets.yaml"),
    grafo(),
    "utf8",
  );
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("materializar una feature", () => {
  it("escribe los tickets del grafo en intake, en el orden del plan", () => {
    const resultado = materializeFeature(PATHS(), "kardex");
    expect(resultado.created).toEqual([
      "FEATURE-INVENTARIO-MODELO-20260924",
      "FEATURE-INVENTARIO-API-20260924",
    ]);

    const filas = listTickets(PATHS());
    expect(filas.map((f) => f.id).sort()).toEqual([...resultado.created].sort());
    expect(filas.every((f) => f.workflowStatus === "intake")).toBe(true);
    // El tipo y el módulo salen del identificador, que es lo que el contrato del
    // ticket exige que coincida.
    expect(filas[0]?.type).toBe("FEATURE");
    expect(filas[0]?.module).toBe("INVENTARIO");
  });

  it("la solicitud sale de la spec y del sprint, no de un resumen inventado", () => {
    materializeFeature(PATHS(), "kardex");
    const texto = readFileSync(
      join(lab, "tickets", "2026", "FEATURE-INVENTARIO-API-20260924", "ticket.md"),
      "utf8",
    );
    // Las palabras de la spec, con su identificador de requisito.
    expect(texto).toContain("R-INV-001: El sistema DEBE registrar cada movimiento");
    // Y de dónde viene: el objetivo del sprint y la dependencia declarada.
    expect(texto).toContain("Parte del sprint: Modelo y API del kardex");
    expect(texto).toContain("Depende de: FEATURE-INVENTARIO-MODELO-20260924");
  });

  it("correrlo otra vez no toca lo que ya existe", () => {
    materializeFeature(PATHS(), "kardex");
    const antes = readFileSync(
      join(lab, "tickets", "2026", "FEATURE-INVENTARIO-MODELO-20260924", "ticket.md"),
      "utf8",
    );
    // Se simula trabajo ya hecho sobre el ticket.
    writeFileSync(
      join(lab, "tickets", "2026", "FEATURE-INVENTARIO-MODELO-20260924", "ticket.md"),
      `${antes}\n<!-- trabajado -->\n`,
      "utf8",
    );

    const segunda = materializeFeature(PATHS(), "kardex");
    expect(segunda.created).toEqual([]);
    expect(segunda.skipped).toHaveLength(2);
    expect(
      readFileSync(
        join(lab, "tickets", "2026", "FEATURE-INVENTARIO-MODELO-20260924", "ticket.md"),
        "utf8",
      ),
    ).toContain("<!-- trabajado -->");
  });

  it("sin escribir nada dice qué crearía", () => {
    const resultado = materializeFeature(PATHS(), "kardex", { write: false });
    expect(resultado.created).toHaveLength(2);
    expect(listTickets(PATHS())).toEqual([]);
    const texto = renderMaterialization("kardex", resultado, { dryRun: true });
    expect(texto).toContain("Se crearían 2 ticket(s)");
    expect(texto).toContain("cubre R-INV-001");
  });

  it("un grafo con huecos se rechaza: la cobertura quedaría a medias", () => {
    writeFileSync(
      join(lab, ".valmen", "features", "kardex", "tickets.yaml"),
      grafo({ gaps: '"falta el reporte"' }),
      "utf8",
    );
    expect(() => materializeFeature(PATHS(), "kardex")).toThrow(
      /huecos|sin cubrir|no está terminada/,
    );
    expect(listTickets(PATHS())).toEqual([]);
  });

  it("un título que el frontmatter no acepta detiene todo, y lo dice", () => {
    // Pasó con el primer feature real: el modelo escribió un título con «: », que
    // el frontmatter de un ticket no acepta porque se lee sin una librería YAML.
    // La comprobación miraba solo el título vacío, así que los tickets anteriores
    // quedaron escritos y el registro a medio hacer.
    writeFileSync(
      join(lab, ".valmen", "features", "kardex", "tickets.yaml"),
      grafo().replace(
        "        title: API de consulta",
        '        title: "API de consulta: con dos puntos"',
      ),
      "utf8",
    );

    expect(() => materializeFeature(PATHS(), "kardex")).toThrow(/no se creó ninguno/);
    expect(() => materializeFeature(PATHS(), "kardex")).toThrow(
      /FEATURE-INVENTARIO-API-20260924/,
    );
    expect(() => materializeFeature(PATHS(), "kardex")).toThrow(/dos puntos/);
    // Y nada quedó escrito: el que estaba bien tampoco.
    expect(listTickets(PATHS())).toEqual([]);
  });

  it("los problemas se informan todos de una vez, no de a uno por corrida", () => {
    // Corregir el grafo de a uno es descubrir el siguiente error después de
    // arreglar el anterior. Los dos que se pueden dar a la vez: uno sin título y
    // otro con un título que el frontmatter no acepta.
    writeFileSync(
      join(lab, ".valmen", "features", "kardex", "tickets.yaml"),
      grafo()
        .replace("        title: Modelo de datos", '        title: ""')
        .replace("        title: API de consulta", '        title: "API: con dos puntos"'),
      "utf8",
    );
    const error = (() => {
      try {
        materializeFeature(PATHS(), "kardex");
        return "";
      } catch (caught) {
        return caught instanceof Error ? caught.message : String(caught);
      }
    })();
    expect(error).toContain("2 problema(s)");
    expect(error).toContain("FEATURE-INVENTARIO-MODELO-20260924");
    expect(error).toContain("FEATURE-INVENTARIO-API-20260924");
    expect(error).toContain("no tiene título");
  });

  it("un identificador que no valida lo detiene el propio grafo", () => {
    // La forma del identificador se comprueba al leer el tickets.yaml, así que un
    // id mal escrito no llega hasta acá: el grafo ni se puede leer.
    writeFileSync(
      join(lab, ".valmen", "features", "kardex", "tickets.yaml"),
      grafo().replace("FEATURE-INVENTARIO-API-20260924", "FEATURE-api-MALA-20260924"),
      "utf8",
    );
    expect(() => materializeFeature(PATHS(), "kardex")).toThrow(/no se puede leer/);
  });

  it("un ticket sin título en el grafo detiene todo antes de escribir", () => {
    writeFileSync(
      join(lab, ".valmen", "features", "kardex", "tickets.yaml"),
      grafo({ tituloVacio: true }),
      "utf8",
    );
    expect(() => materializeFeature(PATHS(), "kardex")).toThrow(/no tiene título/);
    // Y no quedó nada a medio hacer: el segundo ticket tampoco se creó.
    expect(listTickets(PATHS())).toEqual([]);
  });

  it("una feature sin grafo lo dice, en vez de crear cero y callarse", () => {
    rmSync(join(lab, ".valmen", "features", "kardex", "tickets.yaml"));
    expect(() => materializeFeature(PATHS(), "kardex")).toThrow(/no tiene tickets.yaml/);
  });

  it("los criterios de aceptación salen de la spec, sin anotación de verificación", () => {
    // Los criterios de un ticket de feature ya están escritos: son los requisitos
    // que el grafo dice que cubre. Dejarlos vacíos invita a que se los inventen, y
    // la anotación de cómo se verifican la decide quien planifica.
    materializeFeature(PATHS(), "kardex");
    const texto = readFileSync(
      join(lab, "tickets", "2026", "FEATURE-INVENTARIO-API-20260924", "ticket.md"),
      "utf8",
    );
    const criterios =
      /## Criterios de aceptación\n\n([\s\S]*?)\n\n## /.exec(texto)?.[1] ?? "";
    expect(criterios).toContain(
      "- [ ] R-INV-001: El sistema DEBE registrar cada movimiento",
    );
    expect(criterios).toContain("- [ ] R-INV-002: El sistema DEBE permitir exportar");
    // Sin anotación: el gate mecánico detiene el ticket hasta que se declare cómo
    // se comprueba cada uno.
    expect(criterios).not.toContain("<!--");
    expect(criterios.split("\n")).toHaveLength(2);
  });

  it("la solicitud no repite el punto del objetivo del sprint", () => {
    // El objetivo termina en punto casi siempre: agregar otro dejaba «documentos..»
    // en la solicitud de cada ticket del feature real.
    materializeFeature(PATHS(), "kardex");
    const texto = readFileSync(
      join(lab, "tickets", "2026", "FEATURE-INVENTARIO-MODELO-20260924", "ticket.md"),
      "utf8",
    );
    expect(texto).toContain("Parte del sprint: Modelo y API del kardex.");
    expect(texto).not.toContain("..");
  });

  it("informa los requisitos que cubre cada ticket", () => {
    const resultado = materializeFeature(PATHS(), "kardex");
    expect(resultado.coverage["FEATURE-INVENTARIO-MODELO-20260924"]).toEqual(["R-INV-001"]);
    expect(resultado.coverage["FEATURE-INVENTARIO-API-20260924"]).toEqual([
      "R-INV-001",
      "R-INV-002",
    ]);
  });
});

describe("el estado de la feature", () => {
  it("materializar no la mueve de estado: eso lo decide la persona", () => {
    // Escribir los tickets deja el trabajo listo para empezar, no empezado. La
    // feature pasa a `in_progress` cuando alguien lo decide, con su transición.
    materializeFeature(PATHS(), "kardex");
    const texto = readFileSync(
      join(lab, ".valmen", "features", "kardex", "feature.md"),
      "utf8",
    );
    expect(texto).toContain("state: decomposed");
  });

  it("la transición a in_progress sigue estando disponible después", () => {
    materializeFeature(PATHS(), "kardex");
    const fila = advanceFeature({ root: lab, slug: "kardex", to: "in_progress" });
    expect(fila.state).toBe("in_progress");
  });
});
