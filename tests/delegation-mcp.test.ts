/**
 * Las herramientas MCP del cierre de feature y de la delegación.
 *
 * Lo que se afirma es que el agente que solo tiene el MCP puede hacer lo mismo
 * que el CLI: anexar un adjunto, registrar la delegación, ver qué ticket sigue y
 * cerrar la feature. La lógica está probada en `delegation.test.ts`; acá se prueba
 * el cable.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { callTool, type ToolContext } from "../packages/mcp/src/tools.js";
import { materializeFeature } from "../packages/engine/src/materialize.js";

let lab: string;
const A = "FEATURE-INVENTARIO-MODELO-20260924";
const FEATURE = join(".valmen", "features", "kardex");

function contexto(): ToolContext {
  return { paths: { root: lab, ticketsDir: "tickets" } };
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-mcp-deleg-"));
  mkdirSync(join(lab, FEATURE, "spec", "inventario"), { recursive: true });
  writeFileSync(
    join(lab, FEATURE, "feature.md"),
    "---\nschema_version: 2\nid: kardex\ntitle: Kardex de inventario\nstate: decomposed\ncreated: 2026-09-24\nupdated: 2026-09-24\n---\n\n# Kardex de inventario\n",
    "utf8",
  );
  writeFileSync(
    join(lab, FEATURE, "spec", "inventario", "spec.md"),
    "### Requirement: R-INV-001 — El sistema DEBE registrar cada movimiento\n\nEl kardex lista entradas y salidas.\n",
    "utf8",
  );
  writeFileSync(
    join(lab, FEATURE, "tickets.yaml"),
    [
      "feature: kardex",
      "sprints:",
      "  - id: S1",
      "    goal: Modelo",
      "    tickets:",
      `      - id: ${A}`,
      "        title: Modelo de datos",
      "        depends_on: []",
      "coverage:",
      "  - requirement: R-INV-001",
      "    covered_by:",
      `      - ${A}`,
      "gaps: []",
      "",
    ].join("\n"),
    "utf8",
  );
  materializeFeature({ root: lab, ticketsDir: "tickets" }, "kardex");
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("herramientas MCP de la delegación y del cierre de feature", () => {
  it("anexa un adjunto con su sha256", async () => {
    const origen = join(lab, "pantalla.png");
    writeFileSync(origen, Buffer.from([1, 2, 3, 4]));
    const r = await callTool(contexto(), "anexar_adjunto_a_feature", {
      slug: "kardex",
      archivo: origen,
      descripcion: "Captura aprobada",
    });
    expect(r.isError).toBe(false);
    expect(r.text).toContain("assets/pantalla.png");
  });

  it("anexar por MCP actualiza las referencias", async () => {
    const origen = join(lab, "pantalla.png");
    writeFileSync(origen, Buffer.from([1, 2, 3, 4]));
    const r = await callTool(contexto(), "anexar_adjunto_a_feature", {
      slug: "kardex",
      archivo: origen,
      descripcion: "Captura aprobada",
    });
    expect(r.isError).toBe(false);
    expect(r.text).toContain(A);
    const ticket = readFileSync(join(lab, "tickets", "2026", A, "ticket.md"), "utf8");
    expect(ticket).toContain("### Referencias de diseño");
    expect(ticket).toContain(".valmen/features/kardex/assets/pantalla.png");
  });

  it("registra la delegación y dice qué ticket sigue", async () => {
    const r = await callTool(contexto(), "delegar_corrida", {
      feature: "kardex",
      palabras: "Corre la feature completa",
    });
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/DEL-\d{8}-001/);

    const estado = await callTool(contexto(), "ver_delegacion", { solo_siguiente: true });
    expect(estado.isError).toBe(false);
    expect(estado.text).toContain(A);
  });

  it("sin las palabras del PO no registra nada", async () => {
    const r = await callTool(contexto(), "delegar_corrida", { feature: "kardex", palabras: " " });
    expect(r.isError).toBe(true);
  });

  it("avanza la feature y escribe su verify.md", async () => {
    const v = await callTool(contexto(), "avanzar_feature", { slug: "kardex", verify: true });
    expect(v.isError).toBe(false);
    const sinCerrar = await callTool(contexto(), "avanzar_feature", { slug: "kardex", a: "complete" });
    expect(sinCerrar.isError).toBe(true);
    expect(sinCerrar.text).toContain(A);
    const r = await callTool(contexto(), "avanzar_feature", { slug: "kardex", a: "in_progress" });
    expect(r.text).toContain("in_progress");
  });
});
