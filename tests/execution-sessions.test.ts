import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createExecutionIdentity } from "../packages/core/src/execution-identity.js";
import {
  linkExecutionSession,
  readExecutionSessionLinks,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";

const ticketId = "FEATURE-ENGINE-ENLACE-SESION-EJECUTORA-20261001";
let home: string;
let root: string;

beforeEach(() => {
  home = join(tmpdir(), `valmen-sessions-${Date.now()}-${Math.random()}`);
  root = join(home, "harness");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(root, ".valmen", "config.yaml"), "project-id: valmen-harness\n", "utf8");
  writeFileSync(join(home, ".valmen", "bindings.local.yaml"), [
    "schema-version: 1",
    "machine-id: qa-mac",
    "projects:",
    "  valmen-harness:",
    `    root: ${root}`,
  ].join("\n"), "utf8");
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

function project() {
  return resolveAuthorizedProject({ projectId: "valmen-harness", home });
}

function identity() {
  return createExecutionIdentity({
    projectId: "valmen-harness",
    ticketId,
    executionId: "exec-01",
  });
}

function link(eventId: string, attemptId: string, sessionId: string) {
  return {
    eventId,
    identity: identity(),
    attemptId,
    executor: { adapter: "hermes", scope: "perfil-local", sessionId },
    source: "hermes",
    occurredAt: "2026-10-03T10:00:00.000Z",
  };
}

describe("enlaces de sesión ejecutora", () => {
  it("conserva separadas la sesión ejecutora y la sesión de origen", () => {
    linkExecutionSession(project(), {
      ...link("link-01", "attempt-01", "worker-01"),
      origin: { adapter: "hermes", scope: "perfil-local", sessionId: "origen-01" },
    });

    expect(readExecutionSessionLinks(project(), identity())).toEqual([
      expect.objectContaining({
        attemptId: "attempt-01",
        executor: { adapter: "hermes", scope: "perfil-local", sessionId: "worker-01" },
        origin: { adapter: "hermes", scope: "perfil-local", sessionId: "origen-01" },
        cursor: 1,
      }),
    ]);
  });

  it("conserva los enlaces de reintentos y compactaciones en orden", () => {
    linkExecutionSession(project(), link("link-01", "attempt-01", "worker-01"));
    linkExecutionSession(project(), link("link-02", "attempt-01", "worker-02"));
    linkExecutionSession(project(), link("link-03", "attempt-02", "worker-03"));

    expect(readExecutionSessionLinks(project(), identity()).map((entry) => [
      entry.attemptId,
      entry.executor.sessionId,
      entry.cursor,
    ])).toEqual([
      ["attempt-01", "worker-01", 1],
      ["attempt-01", "worker-02", 2],
      ["attempt-02", "worker-03", 3],
    ]);
    expect(
      readExecutionSessionLinks(project(), identity(), "attempt-01")
        .map((entry) => entry.executor.sessionId),
    ).toEqual(["worker-01", "worker-02"]);
  });

  it("rechaza referencias de sesión que no son portables", () => {
    expect(() => linkExecutionSession(project(), {
      ...link("link-01", "attempt-01", "/tmp/worker"),
    })).toThrow("sessionId");
  });
});
