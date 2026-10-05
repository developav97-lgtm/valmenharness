/** El diario de paradas conserva evidencia segura y no reescribe su historia. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  autonomousStopsPath,
  readAutonomousStops,
  recordAutonomousStop,
} from "../packages/engine/src/autonomous-stops.js";

let root: string;
const paths = () => ({ root, ticketsDir: "tickets" });
const NOW = new Date("2026-10-05T12:00:00.000Z");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-autonomous-stops-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("recibos de parada autónoma", () => {
  it("anexa la causa y un detalle seguro sin reemplazar una parada anterior", () => {
    const first = recordAutonomousStop(paths(), {
      ticketId: "BUGFIX-POS-PARADA-20261005",
      reason: "secret-detected",
      detail: "Se detectó un secreto; el valor no se registró.",
      workflowStatus: "in_progress",
      now: NOW,
    });
    const second = recordAutonomousStop(paths(), {
      ticketId: "BUGFIX-POS-PARADA-20261005",
      reason: "test-failure",
      detail: "La verificación mecánica falló.",
      workflowStatus: "in_progress",
      now: NOW,
    });

    expect(first.id).not.toBe(second.id);
    expect(readAutonomousStops(paths())).toEqual([first, second]);
    expect(autonomousStopsPath(paths())).toContain(".valmen/autonomous-stops.jsonl");
  });
});
