import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createExecutionIdentity } from "@valmen/core";
import {
  createExecutionContract,
  createJourney,
  faseDelTicket,
  readJourneyRoadmap,
  recordAutonomousStop,
  registrarPasada,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

let home: string;
let root: string;
const projectId = "valmen-harness";

beforeEach(() => {
  home = join(tmpdir(), `valmen-roadmap-${Date.now()}-${Math.random()}`);
  root = join(home, "harness");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(home, ".valmen", "bindings.local.yaml"), `schema-version: 1\nmachine-id: qa\nprojects:\n  ${projectId}:\n    root: ${root}\n`);
  writeFileSync(join(root, ".valmen", "config.yaml"), `project-id: ${projectId}\nexecution:\n  observation-sources:\n    - hermes\n  dispatch-executors:\n    - hermes\n`);
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function project() {
  return resolveAuthorizedProject({ projectId, home });
}

it("proyecta orden, espera, ventana y último hecho sin conceder despacho", () => {
  const authorized = project();
  createJourney(authorized, {
    revisionId: "rev-01", journeyId: "morning", occurredAt: "2026-10-03T08:00:00.000Z",
    windows: [{ windowId: "am", startsAt: "2026-10-03T08:00:00.000Z", endsAt: "2026-10-03T10:00:00.000Z", timeZone: "America/Bogota" }],
    tickets: [
      { ticketId: "FEATURE-UNO-PRUEBA-20261003", order: 2, priority: 2, dependsOn: ["FEATURE-CERO-PRUEBA-20261003"], start: { condition: "dependencies", scheduledAt: "2026-10-03T08:30:00.000Z" }, windowId: "am", authorizationIds: ["hermes"] },
      { ticketId: "FEATURE-CERO-PRUEBA-20261003", order: 1, priority: 1, dependsOn: [], start: { condition: "manual" }, authorizationIds: [] },
    ],
  }, { receivedAt: "2026-10-03T08:00:01.000Z" });
  createExecutionContract(authorized).recordActivity({
    eventId: "waiting-01", identity: createExecutionIdentity({ projectId, ticketId: "FEATURE-UNO-PRUEBA-20261003", executionId: "run-01" }),
    attemptId: "attempt-01", state: "waiting", source: "test", occurredAt: "2026-10-03T08:31:00.000Z",
  }, { receivedAt: "2026-10-03T08:31:01.000Z" });

  const roadmap = readJourneyRoadmap(authorized, { at: "2026-10-03T09:00:00.000Z" });
  expect(roadmap.authorization).toEqual({ observationSources: ["hermes"], dispatchExecutors: ["hermes"] });
  expect(roadmap.journeys[0]?.tickets.map((ticket) => ticket.ticketId)).toEqual(["FEATURE-CERO-PRUEBA-20261003", "FEATURE-UNO-PRUEBA-20261003"]);
  expect(roadmap.journeys[0]?.tickets[1]).toMatchObject({
    activity: "waiting", waitingFor: ["FEATURE-CERO-PRUEBA-20261003"], lastReceivedAt: "2026-10-03T08:31:01.000Z",
    window: { windowId: "am", status: { state: "open", interruptsActiveWork: false } },
  });
});

it("declara una hoja de ruta vacía sin leer otro proyecto", () => {
  expect(readJourneyRoadmap(project()).journeys).toEqual([]);
});

describe("la fase de cada ticket y la pasada de la jornada", () => {
  const ids = {
    espera: "FEATURE-FASE-ESPERA-20261007",
    prepara: "FEATURE-FASE-PREPARA-20261007",
    plan: "FEATURE-FASE-PLAN-20261007",
    implementa: "FEATURE-FASE-IMPLEMENTA-20261007",
    verifica: "FEATURE-FASE-VERIFICA-20261007",
    entregado: "FEATURE-FASE-ENTREGADO-20261007",
    parado: "FEATURE-FASE-PARADO-20261007",
  };
  const estados: Record<string, string> = {
    [ids.espera]: "intake", [ids.prepara]: "intake", [ids.plan]: "planned", [ids.implementa]: "approved",
    [ids.verifica]: "awaiting_user_tests", [ids.entregado]: "closed", [ids.parado]: "in_progress",
  };

  function armar() {
    const authorized = project();
    for (const [id, workflowStatus] of Object.entries(estados)) {
      writeFixtureTicket(root, {
        id, workflowStatus, type: "FEATURE", module: "FASE",
        ...(workflowStatus === "closed" ? { qaStatus: "approved", releaseStatus: "unreleased" } : {}),
        ...(workflowStatus === "awaiting_user_tests" ? { qaStatus: "pending" } : {}),
      });
    }
    createJourney(authorized, {
      revisionId: "rev-01", journeyId: "JOR-20261007", occurredAt: "2026-10-07T08:00:00.000Z",
      tickets: Object.values(ids).map((ticketId, i) => ({
        ticketId, order: i + 1, priority: 1, dependsOn: [], start: { condition: "manual" as const }, authorizationIds: [],
      })),
    }, { receivedAt: "2026-10-07T08:00:01.000Z" });
    const actividad = (ticketId: string, source: string, state: "started" | "finished") =>
      createExecutionContract(authorized).recordActivity({
        eventId: `${source}-${ticketId}`, identity: createExecutionIdentity({ projectId, ticketId, executionId: "run-01" }),
        attemptId: "a-1", state, source, occurredAt: "2026-10-07T08:05:00.000Z",
      }, { receivedAt: "2026-10-07T08:05:01.000Z" });
    actividad(ids.prepara, "journey-preparation", "started");
    actividad(ids.implementa, "journey-dispatch", "started");
    return authorized;
  }
  const fase = (roadmap: ReturnType<typeof readJourneyRoadmap>, id: string) =>
    roadmap.journeys[0]?.tickets.find((t) => t.ticketId === id);

  it("proyecta la fase de cada ticket a partir de su estado y su actividad", () => {
    const roadmap = readJourneyRoadmap(armar(), { at: "2026-10-07T09:00:00.000Z" });
    expect(fase(roadmap, ids.espera)).toMatchObject({ phase: "waiting", stopReason: null, activity: "unknown" });
    expect(fase(roadmap, ids.prepara)?.phase).toBe("preparing");
    expect(fase(roadmap, ids.plan)?.phase).toBe("plan-ready");
    expect(fase(roadmap, ids.implementa)?.phase).toBe("implementing");
    expect(fase(roadmap, ids.verifica)?.phase).toBe("verifying");
    expect(fase(roadmap, ids.entregado)?.phase).toBe("delivered");
  });

  it("un ticket con parada autónoma activa sale detenido con el detalle de la parada", () => {
    const authorized = armar();
    recordAutonomousStop(authorized.paths, {
      ticketId: ids.parado, reason: "executor-failed", detail: "El ejecutor salió con código 2.", workflowStatus: "in_progress",
    });
    const roadmap = readJourneyRoadmap(authorized, { at: "2026-10-07T09:00:00.000Z" });
    expect(fase(roadmap, ids.parado)).toMatchObject({ phase: "stopped", stopReason: "El ejecutor salió con código 2." });
  });

  it("cada jornada trae la última pasada, la cadencia y la próxima", () => {
    const authorized = armar();
    expect(readJourneyRoadmap(authorized).journeys[0]?.passes).toEqual({ last: null, cadenceMs: null, next: null });
    for (const at of ["2026-10-07T08:00:00.000Z", "2026-10-07T08:15:00.000Z"]) {
      registrarPasada(root, { journeyId: "JOR-20261007", estado: "sin-candidato", ticketId: null, detalle: "nada", at });
    }
    const passes = readJourneyRoadmap(authorized).journeys[0]?.passes;
    expect(passes?.last?.at).toBe("2026-10-07T08:15:00.000Z");
    expect(passes?.cadenceMs).toBe(15 * 60_000);
    expect(passes?.next).toBe("2026-10-07T08:30:00.000Z");
  });

  it("faseDelTicket: una actividad fallida o un ticket bloqueado se detienen", () => {
    const fallo = { state: "failed" as const, source: "journey-dispatch", occurredAt: "2026-10-07T08:00:00.000Z" };
    expect(faseDelTicket("in_progress", fallo, null)).toEqual({
      phase: "stopped", stopReason: "Falló journey-dispatch el 2026-10-07T08:00:00.000Z.",
    });
    expect(faseDelTicket("blocked", null, null).phase).toBe("stopped");
    expect(faseDelTicket("approved", null, null).phase).toBe("waiting");
  });
});
