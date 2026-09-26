/**
 * Anexar un ticket que ya existe al grafo de una feature.
 *
 * Existe por un caso real: una pantalla nueva, probada por el responsable varias
 * veces, acumula hallazgos hasta pasarse del tope de puntos de su ticket. El
 * trabajo de esos hallazgos sigue siendo de la misma funcionalidad, así que se
 * abre un ticket nuevo —y ese ticket quedaba **fuera de la feature**: sin grafo,
 * sin dependencias, sin la spec que le da los requisitos, y sin aparecer en el
 * tablero del conjunto. El trabajo partido en dos registros que no se conocen.
 *
 * Lo que se protege acá:
 *
 * 1. **No toca el ticket.** El grafo dice qué tickets son de la feature; el
 *    registro dice en qué estado está cada uno.
 * 2. **El grafo que se escribe se puede releer.** Pasa por el mismo parser que lo
 *    leería después, así que un archivo a medias no llega al disco —y un sprint
 *    que se queda sin tickets se va con su último ticket, porque `tickets:` vacío
 *    es un archivo ilegible—.
 * 3. **Las dependencias apuntan a algo.** Un ticket que depende de uno que no está
 *    en el grafo deja el tablero sin poder leer la relación.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RegistryPaths } from "../packages/engine/src/discovery.js";
import {
  attachTicketToFeature,
  detachTicketFromFeature,
} from "../packages/engine/src/features.js";
import { renderFixtureTicket } from "./helpers/fixtures.js";

let lab: string;

const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });

const SPEC = `### Requirement: R-INV-001 — El sistema DEBE registrar cada movimiento

El kardex lista entradas y salidas con su saldo.
`;

const GRAFO = [
  "feature: kardex",
  "sprints:",
  "  - id: S1",
  "    goal: Modelo y API del kardex",
  "    tickets:",
  "      - id: FEATURE-INVENTARIO-MODELO-20260924",
  "        title: Modelo de datos",
  "        depends_on: []",
  "      - id: FEATURE-INVENTARIO-API-20260924",
  "        title: API de consulta",
  "        depends_on:",
  "          - FEATURE-INVENTARIO-MODELO-20260924",
  "coverage:",
  "  - requirement: R-INV-001",
  "    covered_by:",
  "      - FEATURE-INVENTARIO-MODELO-20260924",
  "gaps: []",
  "",
].join("\n");

/** El grafo tal como quedó en disco. */
function grafoEnDisco(): string {
  return readFileSync(join(lab, ".valmen", "features", "kardex", "tickets.yaml"), "utf8");
}

/** Un ticket en el registro, con su título. */
function ticketEnElRegistro(id: string, title: string): void {
  const ruta = join(lab, "tickets", "2026", id);
  mkdirSync(ruta, { recursive: true });
  writeFileSync(
    join(ruta, "ticket.md"),
    renderFixtureTicket({ id, title, workflowStatus: "in_progress" }),
    "utf8",
  );
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-anexar-"));
  mkdirSync(join(lab, ".valmen", "features", "kardex", "spec", "inventario"), {
    recursive: true,
  });
  writeFileSync(
    join(lab, ".valmen", "features", "kardex", "feature.md"),
    [
      "---",
      "schema_version: 2",
      "id: kardex",
      "title: Kardex de inventario",
      "state: in_progress",
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
  writeFileSync(join(lab, ".valmen", "features", "kardex", "tickets.yaml"), GRAFO, "utf8");
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

const NUEVO = "IMPROVEMENT-INVENTARIO-AJUSTES-20260925";

describe("anexar un ticket al grafo", () => {
  it("lo mete en el sprint que se le pide, con su título del registro", () => {
    ticketEnElRegistro(NUEVO, "Ajustes del kardex que devolvió el responsable");

    const resultado = attachTicketToFeature({
      paths: PATHS(),
      slug: "kardex",
      ticketId: NUEVO,
      sprint: "S2",
      goal: "Correcciones del responsable",
      dependsOn: ["FEATURE-INVENTARIO-MODELO-20260924"],
    });

    expect(resultado.sprint).toBe("S2");
    expect(resultado.sprintCreated).toBe(true);
    expect(resultado.existed).toBe(true);

    const escrito = grafoEnDisco();
    expect(escrito).toContain("  - id: S2");
    expect(escrito).toContain(`      - id: ${NUEVO}`);
    // El título sale del registro: sin él, el tablero muestra un identificador
    // pelado y el grafo deja de decir qué es cada cosa.
    expect(escrito).toContain("Ajustes del kardex que devolvió el responsable");
    expect(escrito).toContain("- FEATURE-INVENTARIO-MODELO-20260924");
  });

  it("sin sprint, va al último del grafo", () => {
    ticketEnElRegistro(NUEVO, "Ajustes");
    const resultado = attachTicketToFeature({
      paths: PATHS(),
      slug: "kardex",
      ticketId: NUEVO,
    });
    expect(resultado.sprint).toBe("S1");
    expect(resultado.sprintCreated).toBe(false);
    expect(grafoEnDisco()).toContain(`      - id: ${NUEVO}`);
  });

  it("un sprint nuevo sin objetivo se rechaza: sería una fila vacía", () => {
    ticketEnElRegistro(NUEVO, "Ajustes");
    expect(() =>
      attachTicketToFeature({
        paths: PATHS(),
        slug: "kardex",
        ticketId: NUEVO,
        sprint: "S9",
      }),
    ).toThrowError(/--goal/);
    // Y no escribió nada.
    expect(grafoEnDisco()).not.toContain("S9");
  });

  it("no deja el mismo ticket en dos sprints", () => {
    ticketEnElRegistro(NUEVO, "Ajustes");
    attachTicketToFeature({ paths: PATHS(), slug: "kardex", ticketId: NUEVO });
    expect(() =>
      attachTicketToFeature({
        paths: PATHS(),
        slug: "kardex",
        ticketId: NUEVO,
        sprint: "S2",
        goal: "Otro",
      }),
    ).toThrowError(/ya está en el grafo/);
  });

  it("una dependencia que no está en el grafo se rechaza con el motivo", () => {
    ticketEnElRegistro(NUEVO, "Ajustes");
    expect(() =>
      attachTicketToFeature({
        paths: PATHS(),
        slug: "kardex",
        ticketId: NUEVO,
        dependsOn: ["FEATURE-INVENTARIO-FANTASMA-20260924"],
      }),
    ).toThrowError(/no está en el grafo/);
  });

  it("un ticket que todavía no existe se puede planificar", () => {
    // Es la otra mitad: el grafo dice qué se va a hacer. Si el ticket no existe,
    // queda planificado y `materialize` lo crea.
    const resultado = attachTicketToFeature({
      paths: PATHS(),
      slug: "kardex",
      ticketId: "FEATURE-INVENTARIO-EXPORTAR-20260924",
      title: "Exportar el kardex",
    });
    expect(resultado.existed).toBe(false);
    expect(grafoEnDisco()).toContain("Exportar el kardex");
  });

  it("una feature sin tickets.yaml lo dice, en vez de inventar el grafo", () => {
    rmSync(join(lab, ".valmen", "features", "kardex", "tickets.yaml"));
    expect(() =>
      attachTicketToFeature({ paths: PATHS(), slug: "kardex", ticketId: NUEVO }),
    ).toThrowError(/descomponerla/);
  });
});

describe("sacar un ticket del grafo", () => {
  it("lo saca, y el sprint vacío se va con él", () => {
    ticketEnElRegistro(NUEVO, "Ajustes");
    attachTicketToFeature({
      paths: PATHS(),
      slug: "kardex",
      ticketId: NUEVO,
      sprint: "S2",
      goal: "Correcciones",
    });
    expect(grafoEnDisco()).toContain("  - id: S2");

    const fuera = detachTicketFromFeature({
      paths: PATHS(),
      slug: "kardex",
      ticketId: NUEVO,
    });
    expect(fuera.sprint).toBe("S2");
    const escrito = grafoEnDisco();
    expect(escrito).not.toContain(NUEVO);
    // `tickets:` sin elementos es un archivo que el parser no puede releer: el
    // sprint se va con su último ticket.
    expect(escrito).not.toContain("S2");
    // Y el ticket sigue en el registro: esto no lo toca.
    expect(readFileSync(join(lab, "tickets", "2026", NUEVO, "ticket.md"), "utf8")).toContain(
      NUEVO,
    );
  });

  it("no se puede sacar uno del que otro depende", () => {
    expect(() =>
      detachTicketFromFeature({
        paths: PATHS(),
        slug: "kardex",
        ticketId: "FEATURE-INVENTARIO-MODELO-20260924",
      }),
    ).toThrowError(/no está en el grafo|depende/);
  });

  it("un ticket que no está en el grafo se dice, sin tocar el archivo", () => {
    const antes = grafoEnDisco();
    expect(() =>
      detachTicketFromFeature({ paths: PATHS(), slug: "kardex", ticketId: NUEVO }),
    ).toThrowError(/no está en el grafo/);
    expect(grafoEnDisco()).toBe(antes);
  });
});
