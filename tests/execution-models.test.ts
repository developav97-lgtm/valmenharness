import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createExecutionIdentity } from "../packages/core/src/execution-identity.js";
import {
  declareConfiguredExecutionModel,
  observeEffectiveExecutionModel,
  readConfiguredExecutionModels,
  readEffectiveExecutionModels,
  resolveAuthorizedProject,
} from "../packages/engine/src/index.js";

const ticketId = "FEATURE-ENGINE-MODELO-INTENTO-20261001";
let home: string;
let root: string;

beforeEach(() => {
  home = join(tmpdir(), `valmen-models-${Date.now()}-${Math.random()}`);
  root = join(home, "harness");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    "project-id: valmen-harness\n",
    "utf8",
  );
  writeFileSync(
    join(home, ".valmen", "bindings.local.yaml"),
    [
      "schema-version: 1",
      "machine-id: qa-mac",
      "projects:",
      "  valmen-harness:",
      `    root: ${root}`,
    ].join("\n"),
    "utf8",
  );
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

function configured(eventId: string, attemptId = "attempt-01", model = "gpt-6.1-sol") {
  return {
    eventId,
    identity: identity(),
    attemptId,
    model: { provider: "codex", model },
    source: "routing",
    occurredAt: "2026-10-03T10:00:00.000Z",
  };
}

function observed(eventId: string, attemptId = "attempt-01", model = "gpt-6.1-sol") {
  return {
    eventId,
    identity: identity(),
    attemptId,
    model: { provider: "codex", model },
    source: "codex",
    occurredAt: "2026-10-03T10:01:00.000Z",
  };
}

describe("modelos por intento", () => {
  it("conserva por separado el modelo configurado y el efectivo con su fuente", () => {
    declareConfiguredExecutionModel(
      project(),
      configured("configured-01", "attempt-01", "gpt-6.1-sol"),
    );
    observeEffectiveExecutionModel(
      project(),
      observed("observed-01", "attempt-01", "gpt-6.1-pro"),
    );

    expect(readConfiguredExecutionModels(project(), identity())).toEqual([
      expect.objectContaining({
        attemptId: "attempt-01",
        model: { provider: "codex", model: "gpt-6.1-sol" },
        source: "routing",
        cursor: 1,
      }),
    ]);
    expect(readEffectiveExecutionModels(project(), identity())).toEqual([
      expect.objectContaining({
        attemptId: "attempt-01",
        model: { provider: "codex", model: "gpt-6.1-pro" },
        source: "codex",
        cursor: 2,
      }),
    ]);
  });

  it("conserva cada tramo efectivo de compactaciones y reintentos en orden", () => {
    observeEffectiveExecutionModel(
      project(),
      observed("observed-01", "attempt-01", "gpt-6.1-sol"),
    );
    observeEffectiveExecutionModel(
      project(),
      observed("observed-02", "attempt-01", "gpt-6.1-pro"),
    );
    observeEffectiveExecutionModel(
      project(),
      observed("observed-03", "attempt-02", "openai/gpt-6.1"),
    );

    expect(
      readEffectiveExecutionModels(project(), identity()).map((entry) => [
        entry.attemptId,
        entry.model.model,
        entry.cursor,
      ]),
    ).toEqual([
      ["attempt-01", "gpt-6.1-sol", 1],
      ["attempt-01", "gpt-6.1-pro", 2],
      ["attempt-02", "openai/gpt-6.1", 3],
    ]);
  });

  it("declara la ausencia efectiva sin inferirla desde la configuración", () => {
    declareConfiguredExecutionModel(project(), configured("configured-01"));

    expect(readConfiguredExecutionModels(project(), identity())).toHaveLength(1);
    expect(readEffectiveExecutionModels(project(), identity())).toEqual([]);
  });

  it("rechaza modelos que parecen rutas, pero acepta el slash habitual del proveedor", () => {
    expect(() =>
      declareConfiguredExecutionModel(
        project(),
        configured("configured-01", "attempt-01", "/tmp/model"),
      ),
    ).toThrow("model");
    expect(() =>
      observeEffectiveExecutionModel(
        project(),
        observed("observed-01", "attempt-01", "openai//gpt-6.1"),
      ),
    ).toThrow("model");
    expect(() =>
      observeEffectiveExecutionModel(
        project(),
        observed("observed-02", "attempt-01", "openai/gpt-6.1"),
      ),
    ).not.toThrow();
  });
});
