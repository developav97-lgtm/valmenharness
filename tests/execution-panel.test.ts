import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createExecutionIdentity } from "../packages/core/src/execution-identity.js";
import {
  declareConfiguredExecutionModel,
  linkExecutionSession,
  observeEffectiveExecutionModel,
  recordExecutionActivity,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";
import { readExecutionPanel, readExecutionVisibleMessages } from "../packages/server/src/execution-panel.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const ticketId = "FEATURE-PANEL-HERRAMIENTAS-20261003";
let home: string;
let root: string;

beforeEach(() => {
  home = join(tmpdir(), `valmen-panel-${Date.now()}-${Math.random()}`);
  root = join(home, "project");
  mkdirSync(join(root, ".valmen"), { recursive: true });
  mkdirSync(join(home, ".valmen"), { recursive: true });
  writeFileSync(join(root, ".valmen", "config.yaml"), "project-id: panel\n");
  writeFileSync(join(home, ".valmen", "bindings.local.yaml"), `schema-version: 1\nmachine-id: qa\nprojects:\n  panel:\n    root: ${root}\n    hermes-profile: perfil\n`);
  writeFixtureTicket(root, { id: ticketId, workflowStatus: "in_progress" });
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function project() { return resolveAuthorizedProject({ projectId: "panel", home }); }
function identity() { return createExecutionIdentity({ projectId: "panel", ticketId, executionId: "exec-01" }); }

describe("panel de ejecución", () => {
  it("proyecta actividad, modelos y una sesión enlazada sin leer sus mensajes", () => {
    recordExecutionActivity(project(), { eventId: "active", identity: identity(), attemptId: "try-01", state: "active", source: "cli", occurredAt: "2026-10-03T10:00:00.000Z" });
    declareConfiguredExecutionModel(project(), { eventId: "configured", identity: identity(), attemptId: "try-01", model: { provider: "codex", model: "gpt-6.1-sol" }, source: "cli", occurredAt: "2026-10-03T10:00:00.000Z" });
    observeEffectiveExecutionModel(project(), { eventId: "effective", identity: identity(), attemptId: "try-01", model: { provider: "openai", model: "gpt-6.1" }, source: "hermes", occurredAt: "2026-10-03T10:01:00.000Z" });
    linkExecutionSession(project(), { eventId: "session", identity: identity(), attemptId: "try-01", executor: { adapter: "hermes", scope: "perfil", sessionId: "worker-01" }, source: "hermes", occurredAt: "2026-10-03T10:02:00.000Z" });

    const [panel] = readExecutionPanel(project(), ticketId);
    expect(panel?.status).toMatchObject({ validatedStatus: "in_progress", liveness: "active" });
    expect(panel?.attempts[0]).toMatchObject({ attemptId: "try-01", configuredModels: [{ model: { model: "gpt-6.1-sol" } }], effectiveModels: [{ model: { model: "gpt-6.1" } }] });
    expect(panel?.attempts[0]?.sessions[0]).toMatchObject({ executor: { sessionId: "worker-01" }, messages: { available: true } });
  });

  it("rechaza una sesión no enlazada en vez de abrir otra conversación", () => {
    linkExecutionSession(project(), { eventId: "session", identity: identity(), attemptId: "try-01", executor: { adapter: "hermes", scope: "perfil", sessionId: "worker-01" }, source: "hermes", occurredAt: "2026-10-03T10:02:00.000Z" });
    expect(() => readExecutionVisibleMessages({ project: project(), ticketId, executionId: "exec-01", attemptId: "try-01", sessionId: "otra" })).toThrow("no está enlazada");
  });
});
