/**
 * La plantilla pide lo que las compuertas evalúan, y la materialización acota (R-CPRE-006,
 * R-CPRE-007).
 *
 * 1. La plantilla nueva pide causa comprobada, hipótesis, consumidores, criterios que
 *    cubre cada paso, una línea por impacto y Rollback obligatorio; la sección de
 *    criterios no lleva comentarios.
 * 2. Un ticket con la plantilla anterior sigue validando.
 * 3. Un requisito repartido entre dos tickets se escribe en cada uno acotado a su porción,
 *    con «Fuera de alcance»; uno que cubre un solo ticket, como siempre.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateOne } from "../packages/cli/src/commands.js";
import {
  TEMPLATE_CRITERIOS_VACIOS,
  TICKET_TEMPLATE,
  parseTicketsYaml,
  previewTicketsYaml,
  renderTicketsYaml,
} from "../packages/core/src/index.js";
import type { RegistryPaths } from "../packages/engine/src/discovery.js";
import { createTicket } from "../packages/engine/src/create.js";
import { materializeFeature } from "../packages/engine/src/materialize.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

let lab: string;
const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });
const FEATURE = join(".valmen", "features", "kardex");
const MOTOR = "FEATURE-INVENTARIO-MOTOR-20260924";
const PANTALLA = "FEATURE-INVENTARIO-PANTALLA-20260924";

const SPEC = [
  "### Requirement: R-INV-001 — El sistema DEBE registrar y mostrar cada movimiento",
  "",
  "Comportamiento actual: los movimientos no se registran.",
  "",
  "### Requirement: R-INV-002 — El sistema DEBE permitir exportar a PDF",
  "",
  "La pantalla ofrece exportar.",
  "",
].join("\n");

function grafo(portions: boolean): string {
  return [
    "feature: kardex",
    "sprints:",
    "  - id: S1",
    "    goal: Kardex",
    "    tickets:",
    `      - id: ${MOTOR}`,
    "        title: Motor del kardex",
    "        depends_on: []",
    `      - id: ${PANTALLA}`,
    "        title: Pantalla del kardex",
    "        depends_on:",
    `          - ${MOTOR}`,
    "coverage:",
    "  - requirement: R-INV-001",
    "    covered_by:",
    `      - ${MOTOR}`,
    `      - ${PANTALLA}`,
    ...(portions
      ? [
          "    portions:",
          `      - ticket: ${MOTOR}`,
          "        text: El motor registra cada movimiento con su saldo.",
          `      - ticket: ${PANTALLA}`,
          "        text: La pantalla muestra cada movimiento registrado.",
        ]
      : []),
  "  - requirement: R-INV-002",
    "    covered_by:",
    `      - ${PANTALLA}`,
    "gaps: []",
    "",
  ].join("\n");
}

function preparar(portions: boolean): void {
  writeFileSync(join(lab, FEATURE, "spec", "inventario", "spec.md"), SPEC, "utf8");
  writeFileSync(join(lab, FEATURE, "tickets.yaml"), grafo(portions), "utf8");
}

const leer = (id: string): string =>
  readFileSync(join(lab, "tickets", "2026", id, "ticket.md"), "utf8");

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-plantilla-"));
  mkdirSync(join(lab, FEATURE, "spec", "inventario"), { recursive: true });
  mkdirSync(join(lab, "tickets"), { recursive: true });
  writeFileSync(
    join(lab, FEATURE, "feature.md"),
    "---\nschema_version: 2\nid: kardex\ntitle: Kardex de inventario\nstate: decomposed\ncreated: 2026-09-24\nupdated: 2026-09-24\n---\n\n# Kardex de inventario\n",
    "utf8",
  );
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("la plantilla del ticket", () => {
  const seccion = (desde: string, hasta: string): string => {
    const i = TICKET_TEMPLATE.indexOf(desde);
    return TICKET_TEMPLATE.slice(i, TICKET_TEMPLATE.indexOf(hasta, i));
  };

  it("pide en el diagnóstico la causa comprobada, las hipótesis y los consumidores afectados", () => {
    const diagnostico = seccion("## Diagnóstico", "## Plan");
    expect(diagnostico).toContain("- Causa comprobada (con `ruta:línea`):");
    expect(diagnostico).toContain("- Hipótesis pendientes:");
    expect(diagnostico).toContain("- Consumidores afectados:");
    // La línea de impactos, que el motor lee, se conserva.
    expect(diagnostico).toContain("- Impactos de sync, migración, Docker o despliegue:");
  });

  it("pide en el plan los criterios de cada paso, una línea por impacto y el Rollback obligatorio", () => {
    const plan = seccion("## Plan", "## Criterios de aceptación");
    expect(plan).toContain("los criterios que cubre");
    expect(plan).toContain("Una línea por cada impacto que el ticket declara");
    expect(plan).toContain("- Impactos declarados:");
    expect(plan).toContain("- Rollback (obligatorio):");
  });

  it("la sección de criterios no tiene comentarios y la guía de C1…Cn vive fuera", () => {
    const criterios = seccion("## Criterios de aceptación", "## Puntos");
    expect(criterios).not.toContain("<!--");
    expect(criterios).toContain("- [ ]");
    const antes = TICKET_TEMPLATE.slice(0, TICKET_TEMPLATE.indexOf("## Criterios de aceptación"));
    expect(antes).toContain("C1…Cn");
    expect(antes).toContain("«test:» y el comando");
    // La casilla sigue vacía: un texto en ella contaría como criterio real.
    expect(TEMPLATE_CRITERIOS_VACIOS.test(TICKET_TEMPLATE)).toBe(true);
  });

  it("un ticket creado con ella valida", () => {
    createTicket({
      paths: PATHS(),
      id: "FEATURE-INVENTARIO-NUEVO-20260924",
      title: "Ticket nuevo",
      type: "FEATURE",
      module: "INVENTARIO",
      request: "Pedido de prueba.",
    });
    expect(validateOne(PATHS(), "FEATURE-INVENTARIO-NUEVO-20260924").exitCode).toBe(0);
  });

  it("un ticket escrito con la plantilla anterior sigue validando", () => {
    // El fixture usa las etiquetas anteriores del diagnóstico («Causa raíz o hipótesis»).
    writeFixtureTicket(lab, { id: "BUGFIX-POS-FILTRO-ORDENES-20260921", workflowStatus: "planned" });
    expect(validateOne(PATHS(), "BUGFIX-POS-FILTRO-ORDENES-20260921").exitCode).toBe(0);
  });
});

describe("las porciones del grafo", () => {
  const requisitos = [
    { id: "R-INV-001", statement: "El sistema DEBE registrar y mostrar cada movimiento" },
    { id: "R-INV-002", statement: "El sistema DEBE permitir exportar a PDF" },
  ];

  it("se leen, se validan y sobreviven a reescribir el grafo", () => {
    const documento = parseTicketsYaml(grafo(true), requisitos);
    const entrada = documento.decomposition.coverage[0];
    expect(entrada?.portions).toEqual([
      { ticket: MOTOR, text: "El motor registra cada movimiento con su saldo." },
      { ticket: PANTALLA, text: "La pantalla muestra cada movimiento registrado." },
    ]);

    const reescrito = renderTicketsYaml(documento);
    const otra = parseTicketsYaml(reescrito, requisitos);
    expect(otra.decomposition.coverage[0]?.portions).toEqual(entrada?.portions);
    expect(previewTicketsYaml(reescrito, requisitos)?.document.decomposition.coverage[0]?.portions).toHaveLength(2);
  });

  it("un grafo sin porciones sigue leyéndose igual", () => {
    const documento = parseTicketsYaml(grafo(false), requisitos);
    expect(documento.decomposition.coverage[0]?.portions).toBeUndefined();
    expect(renderTicketsYaml(documento)).not.toContain("portions:");
  });

  it("una porción de un ticket que no cubre el requisito se rechaza", () => {
    const malo = grafo(true).replace(`ticket: ${PANTALLA}\n        text: La pantalla`, "ticket: FEATURE-OTRO-COSA-20260924\n        text: La pantalla");
    expect(() => parseTicketsYaml(malo, requisitos)).toThrow("no está en covered_by");
  });
});

describe("materializar un requisito repartido", () => {
  it("escribe en cada ticket su porción y una sección «Fuera de alcance»", () => {
    preparar(true);
    materializeFeature(PATHS(), "kardex");

    const motor = leer(MOTOR);
    expect(motor).toContain("- [ ] R-INV-001: El motor registra cada movimiento con su saldo.");
    // El criterio del motor no exige lo que la pantalla cubre.
    expect(motor).not.toContain("La pantalla muestra cada movimiento registrado.\n      ");
    expect(motor).toContain("### Fuera de alcance");
    expect(motor).toContain(`- R-INV-001: lo cubre ${PANTALLA} (Pantalla del kardex) — La pantalla muestra cada movimiento registrado.`);

    const pantalla = leer(PANTALLA);
    expect(pantalla).toContain("- [ ] R-INV-001: La pantalla muestra cada movimiento registrado.");
    expect(pantalla).toContain(`- R-INV-001: lo cubre ${MOTOR} (Motor del kardex)`);
  });

  it("sin porciones declaradas anota el enunciado como parte del ticket y nombra a los demás", () => {
    preparar(false);
    materializeFeature(PATHS(), "kardex");

    const motor = leer(MOTOR);
    expect(motor).toContain("solo la parte de «Motor del kardex»");
    expect(motor).toContain(`el resto lo cubre ${PANTALLA}`);
    expect(motor).toContain(`- R-INV-001: lo cubre ${PANTALLA} (Pantalla del kardex)`);
  });

  it("la solicitud lleva el comportamiento esperado y el actual cuando la spec lo declara", () => {
    preparar(true);
    materializeFeature(PATHS(), "kardex");

    const motor = leer(MOTOR);
    expect(motor).toContain("Comportamiento esperado: El motor registra cada movimiento con su saldo.");
    expect(motor).toContain("Comportamiento actual: los movimientos no se registran.");
    // Si la spec no lo declara, no se inventa: se dice que lo establece el análisis.
    expect(leer(PANTALLA)).toContain("Comportamiento actual: los movimientos no se registran.");
  });

  it("un requisito que cubre un solo ticket se escribe como siempre", () => {
    preparar(true);
    materializeFeature(PATHS(), "kardex");

    const pantalla = leer(PANTALLA);
    expect(pantalla).toContain("- [ ] R-INV-002: El sistema DEBE permitir exportar a PDF\n");
    // El único «Fuera de alcance» de la pantalla es el del requisito repartido.
    expect(pantalla.match(/- R-INV-002: lo cubre/g)).toBeNull();
  });
});
