import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderFixtureTicket, writeFixtureTicket } from "./helpers/fixtures.js";
import {
  createJourney,
  readJourneyRevisions,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";
import { selectJourneyTickets } from "../packages/engine/src/journey-selection.js";

let home: string;
let root: string;

const projectId = "selection-lab";
const waiting = "FEATURE-JOURNEY-WAITING-20261005";
const dependent = "FEATURE-JOURNEY-DEPENDENT-20261005";
const independent = "FEATURE-JOURNEY-INDEPENDENT-20261005";

beforeEach(() => {
  home = join(tmpdir(), `valmen-selection-${Date.now()}-${Math.random()}`);
  root = join(home, "harness");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(
    join(home, ".valmen", "bindings.local.yaml"),
    `schema-version: 1\nmachine-id: qa\nprojects:\n  ${projectId}:\n    root: ${root}\n`,
  );
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    `project-id: ${projectId}\nexecution:\n  observation-sources:\n    - hermes\n  dispatch-executors:\n    - hermes\n`,
  );
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

function project() {
  return resolveAuthorizedProject({ projectId, home });
}

function writeTicket(id: string, workflowStatus: string): void {
  writeFixtureTicket(root, { id, workflowStatus, type: "FEATURE", module: "JOURNEY" });
}

function writeClosedTicket(id: string): void {
  const qa = [
    {
      id: "QA-001",
      date: "2026-10-05",
      build_reference: "worktree:sha256:0000000000000000000000000000000000000000000000000000000000000000",
      environment: "test",
      result: "pending",
      findings: [],
      correction: null,
      po_confirmation: null,
    },
    {
      id: "QA-002",
      date: "2026-10-05",
      build_reference: null,
      environment: null,
      result: "approved",
      findings: [],
      correction: null,
      po_confirmation: "aprobado por pruebas",
    },
  ];
  const cierre = [
    {
      kind: "ticket-close",
      id: "CLOSE-001",
      date: "2026-10-05",
      technical_summary: "Prueba cerrada.",
      functional_summary: "Prueba cerrada.",
      qa_status: "approved",
      qa_waiver_reason: null,
      po_confirmation: null,
      release_impact: "Sin publicación.",
    },
  ];
  const content = renderFixtureTicket({
    id,
    workflowStatus: "closed",
    qaStatus: "approved",
    type: "FEATURE",
    module: "JOURNEY",
  })
    .replace("Pendiente de ejecución.", "Resultado del PO: aprobado.")
    .replace("## QA\n\n```json\n[]\n```", `## QA\n\n\`\`\`json\n${JSON.stringify(qa, null, 2)}\n\`\`\``)
    .replace("## Cierre\n\n```json\n[]\n```", `## Cierre\n\n\`\`\`json\n${JSON.stringify(cierre, null, 2)}\n\`\`\``);
  const path = join(root, "tickets", "2026", id, "ticket.md");
  mkdirSync(join(root, "tickets", "2026", id), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function createSelectionJourney(options: {
  readonly window?: boolean;
  readonly authorization?: string;
  readonly missingIndependentWindow?: boolean;
} = {}) {
  const window = options.window === false ? [] : [{
    windowId: "morning",
    startsAt: "2026-10-05T12:00:00.000Z",
    endsAt: "2026-10-05T16:00:00.000Z",
    timeZone: "America/Bogota",
  }];
  createJourney(project(), {
    revisionId: "selection-rev-01",
    journeyId: "morning",
    occurredAt: "2026-10-05T12:00:00.000Z",
    windows: window,
    tickets: [
      {
        ticketId: waiting,
        order: 1,
        priority: 1,
        dependsOn: [],
        start: { condition: "manual" },
        authorizationIds: [options.authorization ?? "hermes"],
      },
      {
        ticketId: dependent,
        order: 2,
        priority: 2,
        dependsOn: [waiting],
        start: {
          condition: "dependencies-and-window",
          scheduledAt: "2026-10-05T20:00:00.000Z",
        },
        windowId: "morning",
        authorizationIds: [options.authorization ?? "hermes"],
      },
      {
        ticketId: independent,
        order: 3,
        priority: 3,
        dependsOn: [],
        start: { condition: "window" },
        ...(options.missingIndependentWindow ? {} : { windowId: "morning" }),
        authorizationIds: [options.authorization ?? "hermes"],
      },
    ],
  });
}

function select(overrides: Partial<Parameters<typeof selectJourneyTickets>[0]> = {}) {
  return selectJourneyTickets({
    project: project(),
    journeyId: "morning",
    at: "2026-10-05T13:00:00.000Z",
    executor: "hermes",
    availableSlots: 1,
    ...overrides,
  });
}

describe("selección elegible de jornadas", () => {
  it("ofrece el ticket independiente y mantiene explícita la dependencia bloqueada", () => {
    writeTicket(waiting, "awaiting_user_tests");
    writeTicket(dependent, "approved");
    writeTicket(independent, "approved");
    createSelectionJourney();

    const result = select();
    expect(result).toMatchObject({
      manualCandidate: { ticketId: independent },
      dispatchCandidate: { ticketId: independent },
    });
    expect(result.blocked).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticketId: waiting, reasons: ["qa"] }),
      expect.objectContaining({ ticketId: dependent, reasons: ["dependency"] }),
    ]));
  });

  it("solo libera una dependencia cuando su ticket está cerrado", () => {
    writeClosedTicket(waiting);
    writeTicket(dependent, "approved");
    writeTicket(independent, "planned");
    createSelectionJourney();

    expect(select()).toMatchObject({
      manualCandidate: { ticketId: dependent },
      dispatchCandidate: { ticketId: dependent },
    });
    expect(select().blocked).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticketId: independent, reasons: ["plan"] }),
    ]));
  });

  it("con capacidad agotada conserva la oferta manual y no altera jornada ni tickets", () => {
    writeTicket(waiting, "awaiting_user_tests");
    writeTicket(dependent, "approved");
    writeTicket(independent, "approved");
    createSelectionJourney();
    const before = readFileSync(join(root, "tickets", "2026", independent, "ticket.md"), "utf8");

    const result = select({ availableSlots: 0 });
    expect(result).toMatchObject({
      manualCandidate: { ticketId: independent },
      dispatchCandidate: null,
    });
    expect(result.blocked).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticketId: independent, reasons: ["resource"] }),
    ]));
    expect(readJourneyRevisions(project())).toHaveLength(1);
    expect(readFileSync(join(root, "tickets", "2026", independent, "ticket.md"), "utf8")).toBe(before);
  });

  it("no habilita despacho a un ejecutor no autorizado y no espera una hora posterior", () => {
    writeTicket(waiting, "awaiting_user_tests");
    writeTicket(dependent, "approved");
    writeTicket(independent, "approved");
    createSelectionJourney();

    const result = select({ executor: "codex", at: "2026-10-05T15:59:59.000Z" });
    expect(result).toMatchObject({
      manualCandidate: { ticketId: independent },
      dispatchCandidate: null,
    });
    expect(result.blocked).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticketId: independent, reasons: ["authorization"] }),
    ]));
  });

  it("declara gate y ventana como bloqueos verificables", () => {
    writeTicket(waiting, "blocked");
    writeTicket(dependent, "approved");
    writeTicket(independent, "approved");
    createSelectionJourney();

    const result = select({ at: "2026-10-05T16:00:00.000Z" });

    expect(result.manualCandidate).toBeNull();
    expect(result.dispatchCandidate).toBeNull();
    expect(result.blocked).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticketId: waiting, reasons: ["gate"] }),
      expect.objectContaining({ ticketId: dependent, reasons: ["dependency", "window"] }),
      expect.objectContaining({ ticketId: independent, reasons: ["window"] }),
    ]));
  });

  it("no salta una condición de ventana incompleta", () => {
    writeTicket(waiting, "awaiting_user_tests");
    writeTicket(dependent, "approved");
    writeTicket(independent, "approved");
    createSelectionJourney({ missingIndependentWindow: true });

    const result = select();

    expect(result.manualCandidate).toBeNull();
    expect(result.dispatchCandidate).toBeNull();
    expect(result.blocked).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticketId: independent, reasons: ["window"] }),
    ]));
  });

  it("prioriza por prioridad y orden sin esperar un scheduledAt futuro", () => {
    writeClosedTicket(waiting);
    writeTicket(dependent, "approved");
    writeTicket(independent, "approved");
    createSelectionJourney();

    expect(select()).toMatchObject({
      manualCandidate: { ticketId: dependent, priority: 2, order: 2 },
      dispatchCandidate: { ticketId: dependent, priority: 2, order: 2 },
    });
  });
});
