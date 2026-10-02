import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { executionCommand } from "../packages/cli/src/execution.js";

let home: string;
let root: string;
const project = "valmen-harness";
const ticket = "FEATURE-CLI-EJECUCION-DIRECTA-20261001";

beforeEach(() => {
  home = join(tmpdir(), `valmen-cli-execution-${Date.now()}-${Math.random()}`);
  root = join(home, "harness");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(root, ".valmen", "config.yaml"), `project-id: ${project}\n`, "utf8");
  writeFileSync(join(home, ".valmen", "bindings.local.yaml"), [
    "schema-version: 1",
    "machine-id: qa-mac",
    "projects:",
    `  ${project}:`,
    `    root: ${root}`,
    "",
  ].join("\n"), "utf8");
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function command(args: readonly string[], flags: Record<string, string | true>) {
  return executionCommand(args, flags, { home });
}

const identity = { project, ticket, execution: "direct-01" };

describe("execution por CLI", () => {
  it("registra y consulta actividad directa sin Hermes ni Mission Control", () => {
    const registered = command(["record"], {
      ...identity,
      attempt: "attempt-01",
      "event-id": "direct-activity-01",
      state: "started",
      source: "cli",
      "occurred-at": "2026-10-01T10:00:00.000Z",
    });
    const listed = command(["list"], identity);

    expect(registered).toMatchObject({ exitCode: 0, stdout: "Actividad registrada: started (cursor 1).\n" });
    expect(listed).toMatchObject({ exitCode: 0 });
    expect(listed.stdout).toContain("started\tattempt-01\tcli");
  });

  it("reutiliza el contrato del motor y conserva idempotencia entre reintentos", () => {
    const flags = {
      ...identity,
      attempt: "attempt-01",
      "event-id": "direct-activity-01",
      state: "active",
      source: "cli",
      "occurred-at": "2026-10-01T10:01:00.000Z",
    };
    expect(command(["record"], flags).stdout).toContain("Actividad registrada");
    expect(command(["record"], flags).stdout).toContain("Actividad ya registrada");
    expect(command(["list"], { ...identity, json: true }).stdout).toContain('"state": "active"');
  });

  it("no incorpora Hermes ni Mission Control en el camino directo", () => {
    const source = readFileSync(new URL("../packages/cli/src/execution.ts", import.meta.url), "utf8");
    expect(source).not.toContain("./hermes.js");
    expect(source).not.toContain("@valmen/server");
  });

  it("no permite usar una raíz o perfil implícito fuera de un proyecto autorizado", () => {
    const outcome = command(["list"], { ...identity, project: "saiopencloud" });
    expect(outcome.exitCode).not.toBe(0);
    expect(outcome.stderr).toContain('no está declarado');
  });
});
