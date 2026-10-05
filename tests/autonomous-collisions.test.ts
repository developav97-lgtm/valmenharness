/** La decisión de paralelismo usa solo las rutas estructuradas de cada ticket. */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { planAutonomousCollisions } from "../packages/engine/src/autonomous-collisions.js";
import { parseTicket } from "../packages/core/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

let root: string;

function ticketPath(id: string): string {
  return join(root, "tickets", "2026", id, "ticket.md");
}

function writeTicket(id: string, files: readonly string[], plan = ""): void {
  writeFixtureTicket(root, { id, workflowStatus: "approved", ...(plan === "" ? {} : { plan }) });
  const path = ticketPath(id);
  const text = readFileSync(path, "utf8");
  const points =
    files.length === 0
      ? "[]"
      : JSON.stringify(
          [
            {
              id: "POINT-001",
              title: "Rutas que el plan declara tocar",
              status: "analyzed",
              severity: "normal",
              actual: "El ticket todavía no se ha ejecutado.",
              expected: "Las rutas estructuradas permiten decidir el despacho.",
              evidence: [],
              affected_files: files,
              diagnosis: null,
              solution: null,
              tests: [],
              qa_cycles: [],
              terminal_reason: null,
              related_ticket: null,
            },
          ],
          null,
          2,
        );
  writeFileSync(
    path,
    text.replace(
      "```json\n[]\n```\n\n## Implementación",
      `\`\`\`json\n${points}\n\`\`\`\n\n## Implementación`,
    ),
    "utf8",
  );
}

function candidates(...ids: readonly string[]) {
  return ids.map((id) => {
    const path = ticketPath(id);
    return { id, ticketPath: path, document: parseTicket(readFileSync(path, "utf8")) };
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-collisions-"));
  mkdirSync(join(root, "tickets"), { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("colisiones de escritura autónoma", () => {
  it("informa las rutas declaradas compartidas sin leer la prosa del plan", () => {
    writeTicket(
      "BUGFIX-ALFA-20261004",
      ["packages/engine/src/run.ts"],
      "- Menciona `packages/engine/src/no-declarado.ts`.",
    );
    writeTicket("BUGFIX-BETA-20261004", ["packages/engine/src/run.ts"]);

    const result = planAutonomousCollisions({
      root,
      policy: "warn",
      tickets: candidates("BUGFIX-BETA-20261004", "BUGFIX-ALFA-20261004"),
    });

    expect(result.collisions).toEqual([
      {
        path: "packages/engine/src/run.ts",
        ticketIds: ["BUGFIX-ALFA-20261004", "BUGFIX-BETA-20261004"],
      },
    ]);
    expect(result.selected).toEqual(["BUGFIX-ALFA-20261004", "BUGFIX-BETA-20261004"]);
    expect(result.collisions.map((collision) => collision.path)).not.toContain(
      "packages/engine/src/no-declarado.ts",
    );
  });

  it("no permite paralelizar un ticket que no declaró rutas", () => {
    writeTicket("BUGFIX-ALFA-20261004", []);
    writeTicket("BUGFIX-BETA-20261004", ["packages/engine/src/run.ts"]);

    const result = planAutonomousCollisions({
      root,
      policy: "warn",
      tickets: candidates("BUGFIX-ALFA-20261004", "BUGFIX-BETA-20261004"),
    });

    expect(result.withoutDeclarations).toEqual(["BUGFIX-ALFA-20261004"]);
    expect(result.selected).toEqual(["BUGFIX-BETA-20261004"]);
    expect(result.deferred).toEqual([
      { ticketId: "BUGFIX-ALFA-20261004", reason: "no declara affected_files" },
    ]);
  });

  it("aplica warn, serialize y block de forma estable", () => {
    writeTicket("BUGFIX-ZETA-20261004", ["packages/engine/src/run.ts"]);
    writeTicket("BUGFIX-ALFA-20261004", ["packages/engine/src/run.ts"]);
    writeTicket("BUGFIX-BETA-20261004", ["packages/engine/src/other.ts"]);
    const tickets = candidates(
      "BUGFIX-ZETA-20261004",
      "BUGFIX-ALFA-20261004",
      "BUGFIX-BETA-20261004",
    );

    expect(planAutonomousCollisions({ root, policy: "warn", tickets }).selected).toEqual([
      "BUGFIX-ALFA-20261004",
      "BUGFIX-BETA-20261004",
      "BUGFIX-ZETA-20261004",
    ]);
    expect(
      planAutonomousCollisions({ root, policy: "serialize", tickets }).selected,
    ).toEqual(["BUGFIX-ALFA-20261004", "BUGFIX-BETA-20261004"]);
    expect(planAutonomousCollisions({ root, policy: "block", tickets }).selected).toEqual([
      "BUGFIX-BETA-20261004",
    ]);
  });
});
