/** El despacho autónomo selecciona por política y no inventa etapas humanas. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  autonomousExecutorCommand,
  runAutonomous,
} from "../packages/engine/src/autonomous-run.js";
import { parseTicket } from "../packages/core/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const ID = "BUGFIX-POS-AUTONOMO-20261004";
let root: string;
const paths = () => ({ root, ticketsDir: "tickets" });
const criteria =
  '- [ ] El filtro devuelve una coincidencia.\n      <!-- test: node -e "process.exit(0)" -->';

function policy(extra = ""): void {
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    [
      "name: Laboratorio",
      "test-commands:",
      "  - node",
      "autonomous:",
      "  enabled: true",
      "  executor:",
      "    id: codex",
      "    model: gpt-6-sol",
      "    effort: high",
      "  eligible:",
      "    types:",
      "      - BUGFIX",
      "    max-risk: normal",
      "    require:",
      "      - plan-approved",
      "      - tests-declared",
      "      - no-critical-impacts",
      "    excluded-modules:",
      "      - auth",
      "  limits:",
      "    max-concurrent: 1",
      "    collision-policy: serialize",
      "    max-per-day: 1",
      "    budget-per-ticket: 1",
      "    stop-on:",
      "      - test-failure",
      extra,
    ]
      .filter(Boolean)
      .join("\n") + "\n",
    "utf8",
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-run-"));
  mkdirSync(join(root, "tickets"), { recursive: true });
  policy();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("run autónomo", () => {
  it("lleva un ticket aprobado a awaiting_user_tests después del gate mecánico", async () => {
    writeFixtureTicket(root, { id: ID, workflowStatus: "approved", criterios: criteria });
    const commands: string[] = [];

    const result = await runAutonomous({
      paths: paths(),
      ticketId: ID,
      execute: (command) => {
        commands.push(command.command);
        return { status: 0, stdout: "hecho", stderr: "" };
      },
    });

    expect(result.status).toBe("delivered");
    expect(commands).toEqual(["codex"]);
    const ticket = parseTicket(
      readFileSync(join(root, "tickets", "2026", ID, "ticket.md"), "utf8"),
    );
    expect(ticket.fields.workflow_status).toBe("awaiting_user_tests");
  });

  it("rechaza un ticket que no tiene plan aprobado sin tocarlo", async () => {
    writeFixtureTicket(root, { id: ID, workflowStatus: "analyzed", criterios: criteria });
    await expect(runAutonomous({ paths: paths(), ticketId: ID })).rejects.toThrow(
      "no está en approved",
    );
    const ticket = parseTicket(
      readFileSync(join(root, "tickets", "2026", ID, "ticket.md"), "utf8"),
    );
    expect(ticket.fields.workflow_status).toBe("analyzed");
  });

  it("toma el primer ticket elegible de la cola en orden estable", async () => {
    writeFixtureTicket(root, {
      id: "BUGFIX-POS-ZETA-20261004",
      workflowStatus: "approved",
      criterios: criteria,
    });
    writeFixtureTicket(root, {
      id: "BUGFIX-POS-ALFA-20261004",
      workflowStatus: "approved",
      criterios: criteria,
    });
    const result = await runAutonomous({
      paths: paths(),
      queue: true,
      execute: () => ({ status: 1, stdout: "", stderr: "detenido" }),
    });
    expect(result.ticketId).toBe("BUGFIX-POS-ALFA-20261004");
    expect(result.status).toBe("executor-failed");
  });

  it("no acepta comandos libres y construye argumentos específicos por adaptador", () => {
    const command = autonomousExecutorCommand(
      { id: "codex", model: "gpt-6-sol", effort: "high" },
      root,
      "instrucción",
    );
    expect(command).toEqual(expect.objectContaining({ command: "codex" }));
    expect(command.args).toContain('model_reasoning_effort="high"');
    expect(command.args).toContain("--sandbox");
    expect(command.args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  });
});
