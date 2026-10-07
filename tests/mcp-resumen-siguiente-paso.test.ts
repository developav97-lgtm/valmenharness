/**
 * El resumen de la compuerta y el siguiente paso en el dato estructurado
 * (R-RESP-006).
 *
 * Hay clientes que solo le pasan al modelo el `structuredContent`. Para ellos, un
 * recibo entero en cada compuerta es contexto que se paga y casi no se lee, y un
 * siguiente paso que solo vive en el texto no existe. Las pruebas afirman las dos
 * cosas sobre lo que el cliente recibe: el tamaño del dato y la presencia del paso.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pathsFor } from "../packages/mcp/src/main.js";
import { TOOLS, callTool } from "../packages/mcp/src/tools.js";
import type { ToolContext } from "../packages/mcp/src/tools.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const ID = "BUGFIX-POS-FILTRO-PARCIAL-20260922";

let lab: string;
let contexto: ToolContext;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-resumen-"));
  contexto = { paths: pathsFor(lab), credentialsFile: undefined };
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(join(lab, ".valmen", "config.yaml"), "name: Laboratorio\n", "utf8");
  writeFixtureTicket(lab, { id: ID, workflowStatus: "analyzed" });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Un evaluador que responde `valor` a todo, con la clasificación completa. */
function evaluador(valor: number): NonNullable<ToolContext["jev"]> {
  return async (options: { propositions?: readonly { id: string }[] }) => ({
    answers: (options.propositions ?? []).map((proposition) =>
      proposition.id === "clasificacion"
        ? { id: proposition.id, kind: "choice" as const, choice: "completa", rationale: "falso" }
        : { id: proposition.id, kind: "noul" as const, value: valor, rationale: "x".repeat(400) },
    ),
    model: { provider: "falso", model: "para-pruebas", resolvedVersion: "falso/para-pruebas@0" },
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    latencyMs: 1,
  });
}

function con(valor: number): ToolContext {
  return { ...contexto, jev: evaluador(valor), now: () => new Date("2026-09-22T12:00:00Z") };
}

describe("R-RESP-006: el resumen de evaluar_compuerta", () => {
  it("en revisión, el dato ocupa menos de un kilobyte y trae lo necesario", async () => {
    const resultado = await callTool(con(0.5), "evaluar_compuerta", { gate: "analysis", id: ID });
    expect(resultado.isError).toBe(false);

    const dato = resultado.data as Record<string, unknown>;
    expect(Buffer.byteLength(JSON.stringify(dato), "utf8")).toBeLessThan(1024);
    expect(dato["resultado"]).toBe("review");
    expect(typeof dato["motivo"]).toBe("string");
    expect(Array.isArray(dato["en_banda"])).toBe(true);
    expect((dato["en_banda"] as unknown[]).length).toBeGreaterThan(0);
    expect((dato["en_banda"] as unknown[]).length).toBeLessThanOrEqual(5);
    expect(String(dato["siguiente_paso"])).toContain("persona");
    expect(String(dato["recibo_id"])).toMatch(/^GR-/);
    expect(dato["recibo"]).toBeUndefined();
  });

  it("el siguiente paso depende del veredicto", async () => {
    const aprobada = await callTool(con(0.99), "evaluar_compuerta", { gate: "analysis", id: ID });
    expect(aprobada.data?.["resultado"]).toBe("approve");
    expect(String(aprobada.data?.["siguiente_paso"])).toContain("mover_ticket");

    const bloqueada = await callTool(
      con(0.01),
      "evaluar_compuerta",
      { gate: "analysis", id: ID, forzar: "otra corrida para comprobar el bloqueo" },
    );
    expect(bloqueada.data?.["resultado"]).toBe("block");
    expect(String(bloqueada.data?.["siguiente_paso"])).toContain("Corrige");
  });
});

describe("R-RESP-006: ver_recibo", () => {
  it("devuelve el recibo completo por id y el último del ticket sin id", async () => {
    const resumen = (
      await callTool(con(0.5), "evaluar_compuerta", { gate: "analysis", id: ID })
    ).data as Record<string, unknown>;

    const porId = await callTool(contexto, "ver_recibo", { id: ID, recibo: resumen["recibo_id"] });
    const ultimo = await callTool(contexto, "ver_recibo", { id: ID });
    const recibo = porId.data?.["recibo"] as Record<string, unknown>;
    expect(recibo["id"]).toBe(resumen["recibo_id"]);
    expect(recibo["propositions"]).toBeDefined();
    expect(ultimo.data?.["recibo"]).toEqual(recibo);
    expect(Buffer.byteLength(JSON.stringify(recibo), "utf8")).toBeGreaterThan(1024);
  });

  it("un id que no existe devuelve recibo nulo y lo dice", async () => {
    const resultado = await callTool(contexto, "ver_recibo", { id: ID, recibo: "GR-inexistente" });
    expect(resultado.data?.["recibo"]).toBeNull();
    expect(resultado.text).toContain("GR-inexistente");
  });
});

describe("R-RESP-006: toda herramienta con dato lleva siguiente_paso", () => {
  it("las que se pueden invocar sin servicios externos lo traen", async () => {
    const invocaciones: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      ["ver_ticket", { id: ID }],
      ["listar_tickets", {}],
      ["reanudar_ticket", { id: ID }],
      ["ver_recibo", { id: ID }],
      ["reporte_consumo", {}],
      ["ver_estandares", {}],
    ];
    for (const [nombre, args] of invocaciones) {
      const resultado = await callTool(contexto, nombre, args);
      if (resultado.data === undefined) continue;
      expect(typeof resultado.data["siguiente_paso"], nombre).toBe("string");
      expect(String(resultado.data["siguiente_paso"]).length, nombre).toBeGreaterThan(0);
    }
  });

  it("todo outputSchema declara siguiente_paso, para que su propia respuesta lo cumpla", () => {
    for (const tool of TOOLS) {
      if (tool.outputSchema === undefined) continue;
      const propiedades = tool.outputSchema["properties"] as Record<string, unknown>;
      expect(propiedades["siguiente_paso"], tool.name).toBeDefined();
    }
  });
});
