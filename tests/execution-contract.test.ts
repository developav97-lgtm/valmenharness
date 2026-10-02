import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createExecutionIdentity } from "../packages/core/src/execution-identity.js";
import { createExecutionContract, resolveAuthorizedProject } from "../packages/engine/src/index.js";

const ticketId = "FEATURE-ENGINE-CONTRATO-EJECUCION-20261001";
let home: string;
let root: string;

beforeEach(() => {
  home = join(tmpdir(), `valmen-contract-${Date.now()}-${Math.random()}`);
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
function identity(projectId = "valmen-harness") {
  return createExecutionIdentity({ projectId, ticketId, executionId: "exec-01" });
}

describe("contrato portable de ejecución", () => {
  it("entrega a dos puertas el mismo historial de actividad", () => {
    const cli = createExecutionContract(project());
    const mcp = createExecutionContract(project());
    cli.recordActivity({
      eventId: "contract-01",
      identity: identity(),
      attemptId: "attempt-01",
      state: "started",
      source: "cli",
      occurredAt: "2026-10-01T10:00:00.000Z",
    });

    expect(mcp.projectId).toBe("valmen-harness");
    expect(mcp.readActivity(identity()).map((event) => event.state)).toEqual(["started"]);
    expect(mcp.replay()).toHaveLength(1);
  });

  it("mantiene la validación del proyecto autorizado en cada puerta", () => {
    const contract = createExecutionContract(project());
    expect(() => contract.readActivity(identity("saiopencloud"))).toThrow("no pertenece al proyecto autorizado");
  });

  it("reconcilia el mismo reenvío sin que cada puerta duplique el evento", () => {
    const first = createExecutionContract(project());
    const second = createExecutionContract(project());
    const input = {
      eventId: "contract-01",
      identity: identity(),
      attemptId: "attempt-01",
      state: "active" as const,
      source: "mcp",
      occurredAt: "2026-10-01T10:00:00.000Z",
    };

    expect(first.recordActivity(input).appended).toBe(true);
    expect(second.recordActivity(input).appended).toBe(false);
    expect(second.readActivity(identity())).toHaveLength(1);
  });
});
