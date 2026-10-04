import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createExecutionIdentity } from "../packages/core/src/execution-identity.js";
import {
  appendExecutionEvent,
  createJourney,
  recordExecutionActivity,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";
import {
  createMissionControl,
  handleApi,
  type ServerContext,
} from "../packages/server/src/server.js";

const projectId = "valmen-harness";
const otherProjectId = "saiopencloud";
const ticketId = "FEATURE-SERVER-EVENTOS-INCREMENTALES-20261001";
let home: string;
let root: string;
let otherRoot: string;

beforeEach(() => {
  home = join(tmpdir(), `valmen-incremental-events-${Date.now()}-${Math.random()}`);
  root = join(home, "harness");
  otherRoot = join(home, "saiopen");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  for (const [directory, id] of [[root, projectId], [otherRoot, otherProjectId]] as const) {
    mkdirSync(join(directory, ".valmen"), { recursive: true });
    writeFileSync(join(directory, ".valmen", "config.yaml"), `project-id: ${id}\n`);
  }
  writeFileSync(join(home, ".valmen", "bindings.local.yaml"), [
    "schema-version: 1",
    "machine-id: qa",
    "projects:",
    `  ${projectId}:`,
    `    root: ${root}`,
    `  ${otherProjectId}:`,
    `    root: ${otherRoot}`,
  ].join("\n"));
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

function project(id = projectId) {
  return resolveAuthorizedProject({ projectId: id, home });
}

function context(authorizedProject = project()): ServerContext {
  return {
    root: authorizedProject.root,
    paths: authorizedProject.paths,
    authorizedProject,
    bindingsFile: join(home, ".valmen", "bindings.local.yaml"),
    credentialsFile: join(home, "credentials"),
    env: {},
  };
}

function event(eventId: string, overrides: Partial<Parameters<typeof appendExecutionEvent>[1]> = {}) {
  return {
    eventId,
    identity: createExecutionIdentity({ projectId, ticketId, executionId: "exec-01" }),
    attemptId: "attempt-01",
    kind: "phase.changed",
    source: "hermes",
    occurredAt: "2026-10-03T10:00:00.000Z",
    ...overrides,
  };
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  expression: RegExp,
): Promise<string> {
  const deadline = Date.now() + 4_500;
  let text = "";
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    const result = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("SSE no entregó el evento esperado.")), remaining)),
    ]);
    if (result.done) throw new Error("SSE cerró antes de entregar el evento esperado.");
    text += new TextDecoder().decode(result.value);
    if (expression.test(text)) return text;
  }
  throw new Error("SSE no entregó el evento esperado.");
}

describe("API incremental de eventos de ejecución", () => {
  it("pagina solamente el proyecto autorizado y declara una frontera inválida", async () => {
    appendExecutionEvent(project(), event("evt-01"));
    appendExecutionEvent(project(), event("evt-02"));
    appendExecutionEvent(project(otherProjectId), event("evt-ajeno", {
      identity: createExecutionIdentity({ projectId: otherProjectId, ticketId, executionId: "exec-02" }),
    }));

    const page = await handleApi(
      "GET",
      "/api/execution-events",
      {},
      context(),
      new URLSearchParams({ after: "1", limit: "1" }),
    );
    expect(page).toMatchObject({
      status: 200,
      body: {
        after: 1,
        nextCursor: 2,
        latestCursor: 2,
        hasMore: false,
        cursorValid: true,
        events: [{ eventId: "evt-02", cursor: 2 }],
      },
    });
    expect(JSON.stringify(page.body)).not.toContain("messages");

    const stale = await handleApi(
      "GET", "/api/execution-events", {}, context(), new URLSearchParams({ after: "3" }),
    );
    expect(stale).toMatchObject({ status: 200, body: { cursorValid: false, latestCursor: 2, events: [] } });

    const invalidLimit = await handleApi(
      "GET", "/api/execution-events", {}, context(), new URLSearchParams({ limit: "101" }),
    );
    expect(invalidLimit).toMatchObject({ status: 400, body: { error: expect.stringContaining("entre 1 y 100") } });
  });

  it("reanuda SSE por cursor sin repetir y la jornada ya proyecta la actividad en menos de cinco segundos", async () => {
    const authorized = project();
    createJourney(authorized, {
      revisionId: "rev-sse", journeyId: "jornada-sse", occurredAt: "2026-10-03T09:00:00.000Z",
      tickets: [{ ticketId, order: 1, priority: 1, dependsOn: [], start: { condition: "manual" }, authorizationIds: [] }],
    });
    const startedAt = Date.now();
    recordExecutionActivity(authorized, {
      eventId: "evt-active",
      identity: createExecutionIdentity({ projectId, ticketId, executionId: "exec-01" }),
      attemptId: "attempt-01",
      state: "active",
      source: "hermes",
      occurredAt: "2026-10-03T10:00:00.000Z",
    });
    const server = createMissionControl(context(authorized));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("No se pudo abrir el servidor de prueba.");

    try {
      const first = await fetch(`http://127.0.0.1:${address.port}/api/events?project=${projectId}`);
      expect(first.status).toBe(200);
      const firstReader = first.body?.getReader();
      if (firstReader === undefined) throw new Error("SSE no devolvió un cuerpo legible.");
      const delivered = await readUntil(firstReader, /id: 1\nevent: execution/);
      expect(delivered).toContain("evt-active");
      expect(Date.now() - startedAt).toBeLessThan(5_000);
      const roadmap = await handleApi("GET", "/api/journeys", {}, context(authorized));
      expect(roadmap).toMatchObject({ status: 200, body: { journeys: [{ tickets: [{ activity: "active" }] }] } });
      await firstReader.cancel();

      appendExecutionEvent(authorized, event("evt-second"));
      const resumed = await fetch(`http://127.0.0.1:${address.port}/api/events?project=${projectId}`, {
        headers: { "Last-Event-ID": "1" },
      });
      const resumedReader = resumed.body?.getReader();
      if (resumedReader === undefined) throw new Error("SSE no devolvió un cuerpo legible.");
      const replayed = await readUntil(resumedReader, /id: 2\nevent: execution/);
      expect(replayed).toContain("evt-second");
      expect(replayed).not.toContain("evt-active");
      await resumedReader.cancel();
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
    }
  });
});
