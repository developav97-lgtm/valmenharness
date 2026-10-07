/**
 * Cerrar una feature: avanzar su estado y escribir su verify.md.
 *
 * 1. **Avanzar** recorre el camino más corto y dice por dónde pasó.
 * 2. **verify.md sale del registro**, una fila por ticket del grafo, y no se pisa.
 * 3. **complete exige verdad**: verify.md escrito y todos los tickets cerrados.
 *    Los que esperan al PO solo se aceptan si se pide expresamente, y quedan
 *    anotados como pendientes suyos.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runFeature } from "../packages/cli/src/features.js";
import type { RegistryPaths } from "../packages/engine/src/discovery.js";
import {
  completeFeature,
  featureTicketStatuses,
  writeFeatureVerify,
} from "../packages/engine/src/feature-verify.js";
import { advanceFeature, readFeature } from "../packages/engine/src/features.js";
import { materializeFeature } from "../packages/engine/src/materialize.js";

let lab: string;
const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });
const FEATURE = join(".valmen", "features", "kardex");
const A = "FEATURE-INVENTARIO-MODELO-20260924";
const B = "FEATURE-INVENTARIO-API-20260924";

const GRAFO = [
  "feature: kardex",
  "sprints:",
  "  - id: S1",
  "    goal: Modelo y API",
  "    tickets:",
  `      - id: ${A}`,
  "        title: Modelo de datos",
  "        depends_on: []",
  `      - id: ${B}`,
  "        title: API de consulta",
  "        depends_on:",
  `          - ${A}`,
  "coverage:",
  "  - requirement: R-INV-001",
  "    covered_by:",
  `      - ${A}`,
  `      - ${B}`,
  "gaps: []",
  "",
].join("\n");

function ponerEstado(id: string, estado: string): void {
  const ruta = join(lab, "tickets", "2026", id, "ticket.md");
  const texto = readFileSync(ruta, "utf8").replace(
    /^workflow_status: .*$/m,
    `workflow_status: ${estado}`,
  );
  writeFileSync(ruta, texto, "utf8");
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-verify-"));
  mkdirSync(join(lab, FEATURE, "spec", "inventario"), { recursive: true });
  writeFileSync(
    join(lab, FEATURE, "feature.md"),
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
    join(lab, FEATURE, "spec", "inventario", "spec.md"),
    "### Requirement: R-INV-001 — El sistema DEBE registrar cada movimiento\n\nEl kardex lista entradas y salidas.\n",
    "utf8",
  );
  writeFileSync(join(lab, FEATURE, "tickets.yaml"), GRAFO, "utf8");
  materializeFeature(PATHS(), "kardex");
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("avanzar una feature", () => {
  it("mueve el estado por el camino más corto e informa los intermedios", () => {
    const fila = advanceFeature({ root: lab, slug: "kardex", to: "complete" });
    expect(fila.state).toBe("complete");
    expect(fila.via).toEqual(["in_progress"]);
    expect(readFeature(lab, "kardex")?.row.state).toBe("complete");
  });

  it("el comando lo expone: feature advance --to in_progress", async () => {
    const resultado = await runFeature(lab, ["advance", "kardex"], { to: "in_progress" });
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("in_progress");
    expect(readFeature(lab, "kardex")?.row.state).toBe("in_progress");
  });
});

describe("verify.md", () => {
  it("tiene una fila por ticket del grafo, con su estado", () => {
    ponerEstado(A, "closed");
    const ruta = writeFeatureVerify({ paths: PATHS(), slug: "kardex" });
    const texto = readFileSync(ruta, "utf8");
    expect(texto).toContain(`### ${A} — Modelo de datos`);
    expect(texto).toContain(`### ${B} — API de consulta`);
    expect(texto).toContain("Estado: closed");
    expect(texto).toContain("Estado: intake");
    expect(featureTicketStatuses(PATHS(), "kardex").map((e) => e.id)).toEqual([A, B]);
  });

  it("incluye como anexos los salida-*.md de la carpeta de la feature y sin ellos no cambia", () => {
    const sin = readFileSync(writeFeatureVerify({ paths: PATHS(), slug: "kardex" }), "utf8");
    expect(sin).not.toContain("## Anexos");

    writeFileSync(join(lab, FEATURE, "salida-s1.md"), "# Salida de S1\n\nMedido y conforme.\n", "utf8");
    const con = readFileSync(
      writeFeatureVerify({ paths: PATHS(), slug: "kardex", rewrite: true }),
      "utf8",
    );
    expect(con).toContain("## Anexos");
    expect(con).toContain("### salida-s1.md");
    expect(con).toContain("Medido y conforme.");
  });

  it("no pisa uno existente salvo con rewrite", () => {
    writeFeatureVerify({ paths: PATHS(), slug: "kardex" });
    expect(() => writeFeatureVerify({ paths: PATHS(), slug: "kardex" })).toThrow(/rewrite/);
    expect(() =>
      writeFeatureVerify({ paths: PATHS(), slug: "kardex", rewrite: true }),
    ).not.toThrow();
  });
});

describe("completar una feature", () => {
  it("se rechaza si falta verify.md", () => {
    ponerEstado(A, "closed");
    ponerEstado(B, "closed");
    expect(() => completeFeature({ paths: PATHS(), slug: "kardex" })).toThrow(/verify\.md/);
  });

  it("se rechaza si algún ticket no está cerrado, y nombra cuál", () => {
    ponerEstado(A, "closed");
    writeFeatureVerify({ paths: PATHS(), slug: "kardex" });
    expect(() => completeFeature({ paths: PATHS(), slug: "kardex" })).toThrow(new RegExp(B));
    expect(readFeature(lab, "kardex")?.row.state).toBe("decomposed");
  });

  it("con todos cerrados, completa la feature", () => {
    ponerEstado(A, "closed");
    ponerEstado(B, "closed");
    writeFeatureVerify({ paths: PATHS(), slug: "kardex" });
    const fila = completeFeature({ paths: PATHS(), slug: "kardex" });
    expect(fila.state).toBe("complete");
  });

  it("con pendientes-del-po acepta awaiting_user_tests y los deja anotados como del PO", () => {
    ponerEstado(A, "closed");
    ponerEstado(B, "awaiting_user_tests");
    const ruta = writeFeatureVerify({ paths: PATHS(), slug: "kardex" });
    expect(() => completeFeature({ paths: PATHS(), slug: "kardex" })).toThrow();
    const fila = completeFeature({ paths: PATHS(), slug: "kardex", allowPendingPo: true });
    expect(fila.state).toBe("complete");
    const texto = readFileSync(ruta, "utf8");
    expect(texto).toContain("## Pendiente del PO");
    expect(texto).toContain(`${B}: en awaiting_user_tests`);
  });

  it("un ticket en otro estado no se acepta ni con pendientes-del-po", () => {
    ponerEstado(A, "closed");
    writeFeatureVerify({ paths: PATHS(), slug: "kardex" });
    expect(() =>
      completeFeature({ paths: PATHS(), slug: "kardex", allowPendingPo: true }),
    ).toThrow(new RegExp(B));
  });
});
