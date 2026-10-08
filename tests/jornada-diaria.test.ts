/**
 * Armar la jornada del día (R-JORN-001).
 *
 * Armar es escribir una intención —tickets, orden, dependencias y ejecutor autorizado— y
 * avisarla; no despacha ni reserva capacidad. Las pruebas fijan lo que sostiene la confianza:
 * la política manda (sin ejecutor autorizado no se arma nada), repetir el día no duplica, un
 * aviso perdido no deshace lo escrito y programar no crea tareas por ticket.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { journeyPlanCommand } from "../packages/cli/src/commands.js";
import {
  armarJornada,
  readJourneyRevisions,
  readJourneys,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";
import { callTool } from "../packages/mcp/src/tools.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const projectId = "jornada-lab";
const A = "FEATURE-INVENTARIO-MODELO-20261005";
const B = "FEATURE-INVENTARIO-API-20261005";
const C = "FEATURE-INVENTARIO-PANTALLA-20261005";
const CERRADO = "FEATURE-INVENTARIO-VIEJO-20261001";
const AHORA = new Date("2026-10-06T08:00:00.000Z");

let home: string;
let root: string;

function politica(autorizada: boolean): void {
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    [
      `project-id: ${projectId}`,
      "execution:",
      ...(autorizada ? ["  dispatch-executors:", "    - codex"] : ["  dispatch-executors: []"]),
      "autonomous:",
      `  enabled: ${autorizada}`,
      "  executor:",
      "    id: codex",
      "    model: gpt-6-sol",
      "    effort: high",
      "  eligible:",
      "    types:",
      "      - FEATURE",
      "    max-risk: normal",
      "    require:",
      "      - plan-approved",
      "    excluded-modules:",
      "      - auth",
      "  limits:",
      "    max-concurrent: 1",
      "    collision-policy: serialize",
      "    max-per-day: 3",
      "    budget-per-ticket: 1",
      "    stop-on:",
      "      - test-failure",
      "",
    ].join("\n"),
    "utf8",
  );
}

beforeEach(() => {
  home = join(tmpdir(), `valmen-jornada-${Date.now()}-${Math.random()}`);
  root = join(home, "proyecto");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen", "features", "kardex", "spec", "inventario"), { recursive: true });
  writeFileSync(
    join(home, ".valmen", "bindings.local.yaml"),
    `schema-version: 1\nmachine-id: qa\nprojects:\n  ${projectId}:\n    root: ${root}\n`,
  );
  politica(true);
  writeFileSync(
    join(root, ".valmen", "features", "kardex", "feature.md"),
    "---\nschema_version: 2\nid: kardex\ntitle: Kardex\nstate: decomposed\ncreated: 2026-10-05\nupdated: 2026-10-05\n---\n\n# Kardex\n",
    "utf8",
  );
  writeFileSync(
    join(root, ".valmen", "features", "kardex", "spec", "inventario", "spec.md"),
    "### Requirement: R-INV-001 — El sistema DEBE registrar movimientos\n\nTexto.\n",
    "utf8",
  );
  // El grafo declara la pantalla antes que el modelo a propósito: el orden sale de las dependencias.
  writeFileSync(
    join(root, ".valmen", "features", "kardex", "tickets.yaml"),
    [
      "feature: kardex",
      "sprints:",
      "  - id: S1",
      "    goal: Kardex",
      "    tickets:",
      `      - id: ${C}`,
      "        title: Pantalla",
      "        depends_on:",
      `          - ${B}`,
      `      - id: ${B}`,
      "        title: API",
      "        depends_on:",
      `          - ${A}`,
      `      - id: ${A}`,
      "        title: Modelo",
      "        depends_on: []",
      `      - id: ${CERRADO}`,
      "        title: Viejo",
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
  for (const id of [A, B, C]) {
    writeFixtureTicket(root, { id, workflowStatus: "approved", type: "FEATURE", module: "INVENTARIO" });
  }
  writeFixtureTicket(root, { id: CERRADO, workflowStatus: "intake", type: "FEATURE", module: "INVENTARIO" });
  // Cerrado de verdad: se reescribe el estado, que es lo único que mira el armado.
  const ruta = join(root, "tickets", "2026", CERRADO, "ticket.md");
  writeFileSync(ruta, readFileSync(ruta, "utf8").replace(/^workflow_status: .*$/m, "workflow_status: closed"), "utf8");
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const proyecto = () => resolveAuthorizedProject({ projectId, home });

describe("armar la jornada del día", () => {
  it("deja la jornada en el registro con su orden y avisa los tres tickets", () => {
    const avisos: string[] = [];
    const jornada = armarJornada({
      project: proyecto(),
      feature: "kardex",
      ahora: () => AHORA,
      notificar: (texto) => {
        avisos.push(texto);
        return { delivered: true, detail: "entregado" };
      },
    });

    expect(jornada.journeyId).toBe("JOR-20261006");
    expect(jornada.tickets.map((t) => t.ticketId)).toEqual([A, B, C]);
    expect(jornada.omitidos).toEqual([`${CERRADO} (ya cerrado)`]);
    const guardada = readJourneys(proyecto()).find((j) => j.journeyId === "JOR-20261006");
    expect(guardada?.tickets.map((t) => t.ticketId)).toEqual([A, B, C]);
    expect(guardada?.tickets.every((t) => t.authorizationIds.includes("codex"))).toBe(true);

    expect(avisos).toHaveLength(1);
    for (const id of [A, B, C]) expect(avisos[0]).toContain(id);
    expect(jornada.aviso).toEqual({ delivered: true, detail: "entregado" });
  });

  it("el orden respeta las dependencias y cada ticket declara las suyas dentro de la jornada", () => {
    armarJornada({ project: proyecto(), feature: "kardex", ahora: () => AHORA });
    const tickets = readJourneys(proyecto())[0]?.tickets ?? [];
    const dependencias = Object.fromEntries(tickets.map((t) => [t.ticketId, [...t.dependsOn]]));
    expect(dependencias).toEqual({ [A]: [], [B]: [A], [C]: [B] });
    expect(tickets.map((t) => t.order)).toEqual([1, 2, 3]);
  });

  it("repetirla el mismo día la revisa y no la duplica", () => {
    armarJornada({ project: proyecto(), feature: "kardex", ahora: () => AHORA });
    const otra = armarJornada({
      project: proyecto(),
      feature: "kardex",
      maximo: 2,
      ahora: () => new Date("2026-10-06T09:30:00.000Z"),
    });
    expect(otra.revisada).toBe(true);
    expect(readJourneys(proyecto())).toHaveLength(1);
    expect(readJourneys(proyecto())[0]?.tickets).toHaveLength(2);
    // El historial conserva las dos fotos: nada se reescribe.
    expect(readJourneyRevisions(proyecto())).toHaveLength(2);
  });

  it("una lista de tickets conserva el orden dado y omite lo que no existe", () => {
    const jornada = armarJornada({ project: proyecto(), tickets: [C, "FEATURE-NADA-X-20261005", A], ahora: () => AHORA });
    expect(jornada.tickets.map((t) => t.ticketId)).toEqual([C, A]);
    expect(jornada.omitidos[0]).toContain("no existe");
  });
});

describe("la política manda", () => {
  it("sin ejecutor autorizado no arma nada y el mensaje dice qué declarar", () => {
    politica(false);
    expect(() => armarJornada({ project: proyecto(), feature: "kardex", ahora: () => AHORA })).toThrow(
      /execution\.dispatch-executors.*autonomous\.executor/s,
    );
    expect(readJourneys(proyecto())).toEqual([]);
  });

  it("pedir feature y tickets a la vez, o ninguno, se rechaza", () => {
    expect(() => armarJornada({ project: proyecto(), ahora: () => AHORA })).toThrow(/feature o una lista/);
    expect(() =>
      armarJornada({ project: proyecto(), feature: "kardex", tickets: [A], ahora: () => AHORA }),
    ).toThrow(/feature o una lista/);
  });
});

describe("el aviso", () => {
  it("un fallo del envío no deshace la escritura y el comando lo dice", () => {
    const jornada = armarJornada({
      project: proyecto(),
      feature: "kardex",
      ahora: () => AHORA,
      notificar: () => ({ delivered: false, detail: "Hermes no está instalado" }),
    });
    expect(jornada.aviso?.delivered).toBe(false);
    expect(readJourneys(proyecto())).toHaveLength(1);
  });

  it("el comando journey plan escribe la jornada y, sin destino, dice que no envió nada", () => {
    const antes = process.env["HOME"];
    process.env["HOME"] = home;
    try {
      const resultado = journeyPlanCommand({ project: projectId, feature: "kardex" });
      expect(resultado.exitCode).toBe(0);
      expect(resultado.stdout).toContain("Plan del día JOR-");
      expect(resultado.stdout).toContain("no se envió nada");
      expect(readJourneys(proyecto())).toHaveLength(1);
    } finally {
      if (antes === undefined) delete process.env["HOME"];
      else process.env["HOME"] = antes;
    }
  });
});

describe("la herramienta MCP y la ausencia de cron por ticket", () => {
  it("armar_jornada arma la misma jornada y devuelve su dato", async () => {
    const resultado = await callTool(
      { paths: { root, ticketsDir: "tickets" }, credentialsFile: undefined, home, now: () => AHORA },
      "armar_jornada",
      { proyecto: projectId, feature: "kardex" },
    );
    expect(resultado.isError).toBe(false);
    expect(resultado.data?.["jornada"]).toBe("JOR-20261006");
    expect((resultado.data?.["tickets"] as unknown[]).length).toBe(3);
    expect(resultado.data?.["aviso"]).toBeNull();
    expect(typeof resultado.data?.["siguiente_paso"]).toBe("string");
  });

  it("programar el día no crea jobs de cron ni tareas por ticket", () => {
    armarJornada({ project: proyecto(), feature: "kardex", ahora: () => AHORA });
    const rastros = existsSync(join(root, ".valmen"))
      ? readdirSync(join(root, ".valmen")).filter((nombre) => /cron|schedule|launchd|jobs/i.test(nombre))
      : [];
    expect(rastros).toEqual([]);
  });
});

describe("armar la jornada de un día nuevo", () => {
  const AYER = new Date("2026-10-06T22:00:00.000Z");
  const HOY = new Date("2026-10-07T01:00:00.000Z");
  const fijarEstado = (id: string, estadoNuevo: string): void => {
    const ruta = join(root, "tickets", "2026", id, "ticket.md");
    writeFileSync(ruta, readFileSync(ruta, "utf8").replace(/^workflow_status: .*$/m, `workflow_status: ${estadoNuevo}`), "utf8");
  };

  it("incluye primero los pendientes de la jornada anterior sin duplicarlos", () => {
    armarJornada({ project: proyecto(), tickets: [A, B], ahora: () => AYER });
    fijarEstado(A, "closed");
    const nueva = armarJornada({ project: proyecto(), tickets: [B, C], ahora: () => HOY });

    expect(nueva.revisada).toBe(false);
    expect(nueva.tickets.map((t) => t.ticketId)).toEqual([B, C]);
    expect(nueva.heredados).toBeNull();

    const otra = armarJornada({ project: proyecto(), tickets: [C], ahora: () => new Date("2026-10-08T01:00:00.000Z") });
    // B y C siguen pendientes: C se pidió y no se duplica; B se hereda primero.
    expect(otra.tickets.map((t) => t.ticketId)).toEqual([B, C]);
    expect(otra.heredados).toEqual({ desde: nueva.journeyId, tickets: [B] });
  });

  it("el plan nombra los heredados y la jornada de la que vienen; revisar el día no hereda", () => {
    const ayer = armarJornada({ project: proyecto(), tickets: [A, B], ahora: () => AYER });
    const hoy = armarJornada({ project: proyecto(), tickets: [C], ahora: () => HOY });

    expect(hoy.tickets.map((t) => t.ticketId)).toEqual([A, B, C]);
    expect(hoy.heredados).toEqual({ desde: ayer.journeyId, tickets: [A, B] });
    expect(hoy.plan).toContain(`Heredados de ${ayer.journeyId}: ${A}, ${B}`);

    const revisada = armarJornada({ project: proyecto(), tickets: [C], ahora: () => HOY });
    expect(revisada.revisada).toBe(true);
    expect(revisada.heredados).toBeNull();
    expect(revisada.tickets.map((t) => t.ticketId)).toEqual([C]);
  });
});
