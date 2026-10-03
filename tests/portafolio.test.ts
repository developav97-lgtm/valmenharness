/** Portafolio real sobre raíces de laboratorio, sin red ni HOME del usuario. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { machineBindingsPath } from "@valmen/adapter";
import { choosePaths, listAuthorizedProjects, usageReport } from "@valmen/engine";
import {
  listPortfolioRows,
  portfolioRange,
  summarizePortfolio,
} from "../packages/server/src/portafolio.js";
import { handleApi, type ServerContext } from "../packages/server/src/server.js";

let home: string;
let first: string;
let second: string;
let missing: string;
let context: ServerContext;
const range = { desde: "2026-10-01", hasta: "2026-10-31" };
const ticket = "FEATURE-MC-LAB-20261001";

function receipt(id: string, extra: Record<string, unknown> = {}) {
  return {
    kind: "gate-receipt",
    id,
    gate: "plan",
    subject: { type: "ticket", id: ticket },
    decidedAt: "2026-10-02T00:00:00Z",
    outcome: "review",
    model: null,
    usage: { costUsd: 0.25, inputTokens: 100, outputTokens: 20 },
    escalatedTo: "human",
    humanDecision: null,
    ...extra,
  };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "valmen-portafolio-"));
  first = join(home, "uno");
  second = join(home, "dos");
  missing = join(home, "ausente");
  mkdirSync(join(home, ".valmen"));
  for (const [root, id] of [
    [first, "uno"],
    [second, "dos"],
  ] as const) {
    mkdirSync(join(root, ".valmen"), { recursive: true });
    writeFileSync(
      join(root, ".valmen", "config.yaml"),
      `project-id: ${id}\n${id === "uno" ? "name: Proyecto uno\n" : "tickets-dir: docs/tickets\n"}`,
    );
  }
  mkdirSync(join(first, "tickets"));
  mkdirSync(join(second, "docs", "tickets"), { recursive: true });
  writeFileSync(
    machineBindingsPath(home),
    `schema-version: 1\nmachine-id: laboratorio\nprojects:\n  uno:\n    root: ${first}\n  dos:\n    root: ${second}\n  ausente:\n    root: ${missing}\n`,
  );
  mkdirSync(join(first, ".valmen", "receipts"));
  writeFileSync(
    join(first, ".valmen", "receipts", `${ticket}.jsonl`),
    [
      receipt("pendiente"),
      receipt("decidido"),
      receipt("decidido", {
        humanDecision: {
          decision: "approve",
          actor: "PO",
          reason: "Conforme",
          decidedAt: "2026-10-02",
        },
      }),
      receipt("correccion", {
        humanDecision: {
          decision: "reject",
          actor: "PO",
          reason: "Corregir",
          decidedAt: "2026-10-02",
        },
      }),
      receipt("anterior", { decidedAt: "2026-09-30T23:59:59Z", escalatedTo: null }),
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n"),
  );
  mkdirSync(join(first, ".valmen", "processes", "runs"), { recursive: true });
  for (const [id, status] of [
    ["espera", "waiting"],
    ["terminado", "finished"],
  ]) {
    writeFileSync(
      join(first, ".valmen", "processes", "runs", `${id}.json`),
      JSON.stringify({ runId: id, status, updatedAt: "2026-10-02" }),
    );
  }
  context = {
    root: first,
    bindingsFile: machineBindingsPath(home),
    credentialsFile: join(home, "credenciales-inexistentes"),
    env: {},
  };
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function rows() {
  return listPortfolioRows(listAuthorizedProjects({ home }), first, range);
}

describe("portafolio de proyectos", () => {
  it("agrega cada raíz con sus compuertas vigentes, correcciones y corridas detenidas", () => {
    expect(rows()).toMatchObject([
      {
        projectId: "uno",
        name: "Proyecto uno",
        current: true,
        available: true,
        sources: {
          machine: { available: true, reason: null, label: "laboratorio" },
          registry: { available: true, reason: null, label: "Registro local" },
        },
        gatesPending: 1,
        correctionsPending: 1,
        waiting: 1,
      },
      {
        projectId: "dos",
        name: "dos",
        current: false,
        available: true,
        gatesPending: 0,
        waiting: 0,
      },
      {
        projectId: "ausente",
        available: false,
        sources: {
          machine: { available: false, label: "laboratorio" },
          registry: { available: false, reason: "No disponible porque la máquina no pudo validar el binding.", label: "Registro local" },
        },
        gatesPending: null,
        waiting: null,
        usage: null,
      },
    ]);
    expect(rows()[2]?.reason).toContain("no es legible");
    expect(summarizePortfolio(rows())).toEqual({
      projects: 3,
      available: 2,
      unavailable: 1,
      gatesPending: 1,
      correctionsPending: 1,
      waiting: 1,
      evaluations: 3,
      costUsd: 0.75,
    });
  });

  it("usa el consumo del motor, sin duplicar decisiones humanas ni incluir otro mes", () => {
    expect(rows()[0]?.usage).toEqual(usageReport(choosePaths(first), range));
    expect(rows()[0]?.usage).toMatchObject({
      evaluations: 3,
      costUsd: 0.75,
      inputTokens: 300,
      outputTokens: 60,
    });
    expect(rows()[1]?.usage).toMatchObject({ evaluations: 0, costUsd: 0 });
  });

  it("resuelve el registro adoptado de la segunda raíz", () => {
    const secondProject = listAuthorizedProjects({ home }).projects[1];
    expect(secondProject?.available && secondProject.paths.ticketsDir).toBe("docs/tickets");
  });

  it("informa una identidad distinta sin interrumpir los demás proyectos", () => {
    writeFileSync(join(second, ".valmen", "config.yaml"), "project-id: otro\n");
    expect(rows()[1]).toMatchObject({ available: false, usage: null });
    expect(rows()[1]?.reason).toContain("no coincide");
    expect(rows()[0]?.available).toBe(true);
  });

  it("informa una configuración ilegible sin inventar métricas", () => {
    rmSync(join(second, ".valmen", "config.yaml"));
    mkdirSync(join(second, ".valmen", "config.yaml"));
    expect(rows()[1]).toMatchObject({ available: false, gatesPending: null });
    expect(rows()[0]?.available).toBe(true);
  });

  it("devuelve el catálogo por handleApi sin escribir en él ni en los recibos", async () => {
    const bindingBefore = readFileSync(machineBindingsPath(home), "utf8");
    const receiptPath = join(first, ".valmen", "receipts", `${ticket}.jsonl`);
    const receiptsBefore = readFileSync(receiptPath, "utf8");
    const result = await handleApi(
      "GET",
      "/api/portafolio",
      {},
      context,
      new URLSearchParams(range),
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      available: true,
      reason: null,
      range,
      projects: rows(),
      summary: summarizePortfolio(rows()),
    });
    expect(readFileSync(machineBindingsPath(home), "utf8")).toBe(bindingBefore);
    expect(readFileSync(receiptPath, "utf8")).toBe(receiptsBefore);
  });

  it.each(["root", "directory", "home", "bindingsFile", "projectId"])(
    "rechaza %s en la query",
    async (key) => {
      const result = await handleApi(
        "GET",
        "/api/portafolio",
        {},
        context,
        new URLSearchParams({ [key]: missing }),
      );
      expect(result.status).toBe(400);
    },
  );

  it.each(["ausente", "ilegible", "invalido"])(
    "un catálogo %s degrada a 200 con motivo",
    async (kind) => {
      const path = machineBindingsPath(home);
      rmSync(path);
      if (kind === "ilegible") mkdirSync(path);
      if (kind === "invalido") writeFileSync(path, "schema-version: 99\n");
      const result = await handleApi("GET", "/api/portafolio", {}, context);
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({
        available: false,
        projects: [],
        reason: expect.stringContaining("catálogo"),
      });
    },
  );

  it("proyecta un catálogo vacío sin inventar filas", () => {
    const empty = listPortfolioRows({ available: true, reason: null, projects: [] }, first);
    expect(empty).toEqual([]);
    expect(summarizePortfolio(empty)).toMatchObject({
      projects: 0,
      available: 0,
      evaluations: 0,
      costUsd: 0,
    });
  });

  it("usa el mes calendario completo y permite acotar sus extremos", () => {
    expect(portfolioRange({}, new Date(2024, 1, 15))).toEqual({
      desde: "2024-02-01",
      hasta: "2024-02-29",
    });
    expect(portfolioRange({ hasta: "2024-02-20" }, new Date(2024, 1, 15))).toEqual({
      desde: "2024-02-01",
      hasta: "2024-02-20",
    });
  });

  it("el endpoint respeta el rango solicitado y no lo aplica a las compuertas pendientes", async () => {
    const result = await handleApi(
      "GET",
      "/api/portafolio",
      {},
      context,
      new URLSearchParams({ desde: "2026-09-01", hasta: "2026-09-30" }),
    );
    expect(result.body).toMatchObject({
      summary: { evaluations: 1, costUsd: 0.25, gatesPending: 1 },
    });
  });

  it.each([
    { desde: "2026-02-30", hasta: "2026-03-01" },
    { desde: "2026-10-31", hasta: "2026-10-01" },
    { desde: "ayer", hasta: "hoy" },
  ])("rechaza rangos inválidos: %j", async (dates) => {
    expect(
      (await handleApi("GET", "/api/portafolio", {}, context, new URLSearchParams(dates)))
        .status,
    ).toBe(400);
  });
});
