/** La política declarativa de elegibilidad autónoma. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseConfig, readAutonomousConfig } from "../packages/adapter/src/index.js";
import { autonomousConfig } from "../packages/engine/src/discovery.js";

let root: string;

const complete = [
  "autonomous:",
  "  enabled: true",
  "  eligible:",
  "    types:",
  "      - BUGFIX",
  "      - DOCS",
  "    max-risk: normal",
  "    require:",
  "      - plan-approved",
  "      - tests-declared",
  "      - no-critical-impacts",
  "    excluded-modules:",
  "      - auth",
  "      - deploy",
  "  limits:",
  "    max-concurrent: 2",
  "    collision-policy: serialize",
  "    max-per-day: 8",
  "    budget-per-ticket: 5.00",
  "    stop-on:",
  "      - gate-blocked-twice",
  "      - test-failure",
  "      - secret-detected",
].join("\n");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-autonomous-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("autonomous", () => {
  it("queda apagada cuando la sección no existe", () => {
    expect(readAutonomousConfig(parseConfig("name: Laboratorio\n"))).toMatchObject({
      enabled: false,
      executor: null,
      eligible: { types: [], require: [] },
      limits: { maxConcurrent: 0, collisionPolicy: "block", stopOn: [] },
    });
    expect(autonomousConfig(root).enabled).toBe(false);
  });

  it("lee una política completa desde el mismo parser que usará el motor", () => {
    mkdirSync(join(root, ".valmen"), { recursive: true });
    writeFileSync(join(root, ".valmen", "config.yaml"), complete, "utf8");

    expect(autonomousConfig(root)).toEqual({
      enabled: true,
      executor: null,
      eligible: {
        types: ["BUGFIX", "DOCS"],
        maxRisk: "normal",
        require: ["plan-approved", "tests-declared", "no-critical-impacts"],
        excludedModules: ["auth", "deploy"],
      },
      limits: {
        maxConcurrent: 2,
        collisionPolicy: "serialize",
        maxPerDay: 8,
        budgetPerTicket: 5,
        // Sin `max-minutes` declarado rige el tiempo máximo por defecto (R-JORN-007).
        maxMinutes: 60,
        stopOn: ["gate-blocked-twice", "test-failure", "secret-detected"],
      },
    });
  });

  it("rechaza valores que ampliarían o debilitarían la política sin declararlo", () => {
    const cases: readonly [string, RegExp][] = [
      [complete.replace("- BUGFIX", "- INVENTADO"), /eligible.types/],
      [complete.replace("max-risk: normal", "max-risk: extremo"), /max-risk/],
      [complete.replace("- tests-declared", "- todo-vale"), /eligible.require/],
      [complete.replace("max-concurrent: 2", "max-concurrent: 0"), /max-concurrent/],
      [
        complete.replace("collision-policy: serialize", "collision-policy: seguir"),
        /collision-policy/,
      ],
      [
        complete.replace("budget-per-ticket: 5.00", "budget-per-ticket: cero"),
        /budget-per-ticket/,
      ],
      [complete.replace("- test-failure", "- continuar-siempre"), /limits.stop-on/],
    ];
    for (const [yaml, message] of cases) {
      expect(() => readAutonomousConfig(parseConfig(yaml))).toThrow(message);
    }
  });

  it("rechaza las claves históricas con guion bajo antes de interpretar la política", () => {
    expect(() =>
      readAutonomousConfig(parseConfig(complete.replace("max-risk", "max_risk"))),
    ).toThrow(/max_risk.*no es válida/);
  });

  it("acepta solo ejecutores conocidos y nunca una orden de shell en la política", () => {
    const configured = complete.replace(
      "  eligible:",
      "  executor:\n    id: codex\n    model: gpt-6-sol\n    effort: high\n  eligible:",
    );
    expect(readAutonomousConfig(parseConfig(configured)).executor).toEqual({
      id: "codex",
      model: "gpt-6-sol",
      effort: "high",
    });
    expect(() =>
      readAutonomousConfig(parseConfig(configured.replace("id: codex", "id: sh -c"))),
    ).toThrow(/executor.id/);
  });
});
