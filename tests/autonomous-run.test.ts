/** El despacho autónomo selecciona por política y no inventa etapas humanas. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  autonomousExecutorCommand,
  runAutonomous,
} from "../packages/engine/src/autonomous-run.js";
import { parseTicket } from "../packages/core/src/index.js";
import { appendReceipt } from "../packages/engine/src/receipts.js";
import { readAutonomousStops } from "../packages/engine/src/autonomous-stops.js";
import { type GateReceipt } from "../packages/gate/src/receipt.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const ID = "BUGFIX-POS-AUTONOMO-20261004";
let root: string;
const paths = () => ({ root, ticketsDir: "tickets" });
const PRUEBAS = "Contrato de entrega: ejecutar `node -e \"process.exit(0)\"` desde la raíz; esperado: código de salida 0.";
const criteria =
  '- [ ] El filtro devuelve una coincidencia.\n      <!-- test: node -e "process.exit(0)" -->';

function policy(stopOn: readonly string[] = ["test-failure"]): void {
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
      ...stopOn.map((item) => `      - ${item}`),
    ]
      .filter(Boolean)
      .join("\n") + "\n",
    "utf8",
  );
}

function ticket(): ReturnType<typeof parseTicket> {
  return parseTicket(readFileSync(join(root, "tickets", "2026", ID, "ticket.md"), "utf8"));
}

function initializeGit(): void {
  for (const args of [["init", "-q"], ["config", "user.email", "test@valmen.local"], ["config", "user.name", "Valmen test"], ["add", "."], ["commit", "-qm", "inicial"]]) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr);
  }
}

function blockedReceipt(id: string): GateReceipt {
  return {
    kind: "gate-receipt",
    receiptVersion: 1,
    schemaVersion: "2",
    id,
    gate: "analysis",
    gateHash: "sha256:test",
    subject: { type: "ticket", id: ID, revision: "1" },
    outcome: "block",
    reason: "bloqueado",
    actor: "model",
    decidedAt: "2026-10-05T12:00:00.000Z",
    stateHash: "sha256:test",
    policy: { approveAt: 0.9, blockAt: 0.1 },
    mechanicalChecks: [],
    modelAnswers: [],
    propositions: [],
    model: null,
    usage: null,
    latencyMs: null,
    escalatedTo: null,
    humanDecision: null,
  };
}

function closeForBudget(id: string, costUsd: number): void {
  writeFixtureTicket(root, {
    id,
    workflowStatus: "closed",
    qaStatus: "approved",
    criterios: criteria,
  });
  const path = join(root, "tickets", "2026", id, "ticket.md");
  const usage = [{
    kind: "ai-usage",
    id: "CONSUMO-001",
    date: "2026-10-05",
    session_reference: "manual:lab",
    model: "laboratorio",
    reasoning_effort: null,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: costUsd,
    source: "manual:prueba",
    confidence: "high",
    notes: null,
  }];
  const closure = [{
    kind: "ticket-close",
    id: "CLOSE-001",
    date: "2026-10-05",
    technical_summary: "Cierre de laboratorio.",
    functional_summary: "Cierre de laboratorio.",
    qa_status: "approved",
    qa_waiver_reason: null,
    po_confirmation: "probado y conforme",
    release_impact: "unreleased",
  }];
  const qa = [
    {
      id: "QA-001",
      date: "2026-10-05",
      build_reference: "worktree:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      environment: "laboratorio",
      result: "pending",
      findings: [],
      correction: null,
      po_confirmation: null,
    },
    {
      id: "QA-002",
      date: "2026-10-05",
      build_reference: null,
      environment: "laboratorio",
      result: "approved",
      findings: [],
      correction: null,
      po_confirmation: "probado y conforme",
    },
  ];
  writeFileSync(
    path,
    readFileSync(path, "utf8")
      .replace(/(## Consumo de IA\n\n```json\n)\[\]/, `$1${JSON.stringify(usage)}`)
      .replace(/(## Cierre\n\n```json\n)\[\]/, `$1${JSON.stringify(closure)}`)
      .replace(/(## QA\n\n```json\n)\[\]/, `$1${JSON.stringify(qa)}`)
      .replace("## Pruebas\n\nPendiente de ejecución.", "## Pruebas\n\n- Resultado del PO: probado y conforme."),
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
    writeFixtureTicket(root, { id: ID, workflowStatus: "approved", criterios: criteria , pruebas: PRUEBAS});
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
    expect(ticket().fields.workflow_status).toBe("awaiting_user_tests");
  });

  it("rechaza un ticket que no tiene plan aprobado sin tocarlo", async () => {
    writeFixtureTicket(root, { id: ID, workflowStatus: "analyzed", criterios: criteria , pruebas: PRUEBAS});
    await expect(runAutonomous({ paths: paths(), ticketId: ID })).rejects.toThrow(
      "no está en approved",
    );
    expect(ticket().fields.workflow_status).toBe("analyzed");
  });

  it("toma el primer ticket elegible de la cola en orden estable", async () => {
    writeFixtureTicket(root, {
      id: "BUGFIX-POS-ZETA-20261004",
      workflowStatus: "approved",
      criterios: criteria, pruebas: PRUEBAS,
    });
    writeFixtureTicket(root, {
      id: "BUGFIX-POS-ALFA-20261004",
      workflowStatus: "approved",
      criterios: criteria, pruebas: PRUEBAS,
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

  it("detiene ante un fallo de pruebas declarado, deja recibo y no entrega", async () => {
    const failing = '- [ ] El filtro falla.\n      <!-- test: node -e "process.exit(1)" -->';
    writeFixtureTicket(root, { id: ID, workflowStatus: "approved", criterios: failing , pruebas: PRUEBAS});

    const result = await runAutonomous({
      paths: paths(),
      ticketId: ID,
      execute: () => ({ status: 0, stdout: "hecho", stderr: "" }),
      now: () => new Date("2026-10-05T12:00:00.000Z"),
    });

    expect(result.status).toBe("stopped");
    expect(result.stop?.reason).toBe("test-failure");
    expect(ticket().fields.workflow_status).toBe("in_progress");
    expect(readAutonomousStops(paths())[0]?.detail).not.toContain("process.exit(1)");
  });

  it("no convierte un fallo de pruebas en parada cuando esa causa no fue declarada", async () => {
    policy(["secret-detected"]);
    const failing = '- [ ] El filtro falla.\n      <!-- test: node -e "process.exit(1)" -->';
    writeFixtureTicket(root, { id: ID, workflowStatus: "approved", criterios: failing , pruebas: PRUEBAS});

    const result = await runAutonomous({
      paths: paths(),
      ticketId: ID,
      execute: () => ({ status: 0, stdout: "hecho", stderr: "" }),
    });

    expect(result.status).toBe("verification-failed");
    expect(readAutonomousStops(paths())).toEqual([]);
  });

  it("detiene antes de invocar si conserva dos bloqueos vigentes de compuerta", async () => {
    policy(["gate-blocked-twice"]);
    writeFixtureTicket(root, { id: ID, workflowStatus: "approved", criterios: criteria , pruebas: PRUEBAS});
    appendReceipt(paths(), ID, blockedReceipt("GR-001"));
    appendReceipt(paths(), ID, blockedReceipt("GR-002"));
    const execute = vi.fn(() => ({ status: 0, stdout: "", stderr: "" }));

    const result = await runAutonomous({ paths: paths(), ticketId: ID, execute });

    expect(result.stop?.reason).toBe("gate-blocked-twice");
    expect(execute).not.toHaveBeenCalled();
    expect(ticket().fields.workflow_status).toBe("in_progress");
  });

  it("detiene antes de invocar cuando el costo acumulado alcanza el tope por ticket", async () => {
    policy(["budget-exceeded"]);
    writeFixtureTicket(root, { id: ID, workflowStatus: "approved", criterios: criteria , pruebas: PRUEBAS});
    appendReceipt(paths(), ID, {
      ...blockedReceipt("GR-PRESUPUESTO"),
      outcome: "approve",
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 1 },
    });
    const execute = vi.fn(() => ({ status: 0, stdout: "", stderr: "" }));

    const result = await runAutonomous({ paths: paths(), ticketId: ID, execute });

    expect(result.stop?.reason).toBe("budget-exceeded");
    expect(result.detail).toContain("límite por ticket");
    expect(execute).not.toHaveBeenCalled();
  });

  it("detiene por el corte adaptativo de pausa cuando existe una referencia suficiente", async () => {
    policy(["budget-exceeded"]);
    const config = join(root, ".valmen", "config.yaml");
    writeFileSync(
      config,
      readFileSync(config, "utf8").replace("    budget-per-ticket: 1", "    budget-per-ticket: 99") + `
budgets:
  adaptive:
    enabled: true
    min-samples: 3
    multipliers:
      notify: 1.5
      degrade: 2
      pause: 3
    degrade-preset: economy
`,
      "utf8",
    );
    closeForBudget("BUGFIX-POS-HISTORIAL-A-20261001", 1);
    closeForBudget("BUGFIX-POS-HISTORIAL-B-20261002", 1);
    closeForBudget("BUGFIX-POS-HISTORIAL-C-20261003", 1);
    writeFixtureTicket(root, { id: ID, workflowStatus: "approved", criterios: criteria , pruebas: PRUEBAS});
    appendReceipt(paths(), ID, {
      ...blockedReceipt("GR-PAUSA"),
      outcome: "approve",
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 3 },
    });
    const execute = vi.fn(() => ({ status: 0, stdout: "", stderr: "" }));

    const result = await runAutonomous({ paths: paths(), ticketId: ID, execute });

    expect(result.stop?.reason).toBe("budget-exceeded");
    expect(result.detail).toContain("corte de pausa");
    expect(execute).not.toHaveBeenCalled();
  });

  it("detiene por secreto sin guardar su valor", async () => {
    policy(["secret-detected"]);
    writeFixtureTicket(root, { id: ID, workflowStatus: "approved", criterios: criteria , pruebas: PRUEBAS});
    initializeGit();
    const secret = `sk-${"x".repeat(24)}`;

    const result = await runAutonomous({
      paths: paths(),
      ticketId: ID,
      execute: () => {
        writeFileSync(join(root, "nuevo.ts"), `const token = "${secret}";\n`, "utf8");
        return { status: 0, stdout: "hecho", stderr: "" };
      },
    });

    expect(result.stop?.reason).toBe("secret-detected");
    expect(result.detail).not.toContain(secret);
    expect(JSON.stringify(readAutonomousStops(paths()))).not.toContain(secret);
    expect(ticket().fields.workflow_status).toBe("in_progress");
  });
});
