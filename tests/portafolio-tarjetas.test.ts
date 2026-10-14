/**
 * FEATURE-WEB-TRABAJO-PORTAFOLIO-20261014 (R-TRA-004): cada fila del portafolio trae lo
 * que espera decisión, los agentes vivos y el perfil de su raíz. Raíces de laboratorio,
 * HOME y reloj inyectados: ninguna prueba lee el HOME real.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { machineBindingsPath } from "@valmen/adapter";
import { listAuthorizedProjects } from "@valmen/engine";
import { listPortfolioRows } from "../packages/server/src/portafolio.js";
import { escribirSesionDeClaude } from "./helpers/claude.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const T0 = Date.parse("2026-10-14T12:00:00.000Z");
const iso = (segundos: number): string => new Date(T0 + segundos * 1000).toISOString();
const range = { desde: "2026-10-01", hasta: "2026-10-31" };

let home: string;
let uno: string;
let dos: string;

/** Un subagente con su último evento en `t` segundos; `fin` lo cierra con end_turn. */
function subagente(t: number, fin = false): string[] {
  const base = { cwd: "/work/a", gitBranch: "main", sessionId: "x" };
  return [
    JSON.stringify({
      ...base,
      type: "user",
      timestamp: iso(t - 2),
      message: { role: "user", content: "Implementa FEATURE-LAB-UNO-20261014" },
    }),
    JSON.stringify({
      ...base,
      type: "assistant",
      timestamp: iso(t - 1),
      message: {
        id: `m-${t}`,
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [{ type: "tool_use", id: `h${t}`, name: "Edit", input: {} }],
        stop_reason: "tool_use",
      },
    }),
    JSON.stringify({
      ...base,
      type: "user",
      timestamp: iso(t),
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: `h${t}`, content: "ok" }] },
    }),
    ...(fin
      ? [
          JSON.stringify({
            ...base,
            type: "assistant",
            timestamp: iso(t + 1),
            message: {
              id: `f-${t}`,
              role: "assistant",
              model: "claude-sonnet-5-5",
              content: [{ type: "text", text: "listo" }],
              stop_reason: "end_turn",
            },
          }),
        ]
      : []),
  ];
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "valmen-portafolio-tarjetas-"));
  uno = join(home, "uno");
  dos = join(home, "dos");
  mkdirSync(join(home, ".valmen"));
  for (const [root, id] of [
    [uno, "uno"],
    [dos, "dos"],
  ] as const) {
    mkdirSync(join(root, ".valmen"), { recursive: true });
    mkdirSync(join(root, "tickets"));
    writeFileSync(join(root, ".valmen", "config.yaml"), `project-id: ${id}\n`);
  }
  writeFixtureTicket(uno, { id: "FEATURE-LAB-UNO-20261014", workflowStatus: "awaiting_user_tests" });
  writeFixtureTicket(uno, { id: "FEATURE-LAB-DOS-20261014", workflowStatus: "intake" });
  writeFileSync(
    join(uno, ".valmen", "profiles.yaml"),
    "seleccion:\n  proyecto: claude-code-completo\n\nperfiles: {}\n",
  );
  escribirSesionDeClaude(home, {
    root: uno,
    id: "orquestadora",
    lineas: [JSON.stringify({ type: "user", timestamp: iso(0), message: { role: "user", content: "orquesta" } })],
    subagentes: [subagente(5), subagente(6), subagente(4, true)],
    modificado: new Date(T0),
  });
  writeFileSync(
    machineBindingsPath(home),
    `schema-version: 1\nmachine-id: laboratorio\nprojects:\n  uno:\n    root: ${uno}\n  dos:\n    root: ${dos}\n  ausente:\n    root: ${join(home, "ausente")}\n`,
  );
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const filas = () =>
  listPortfolioRows(listAuthorizedProjects({ home }), uno, range, { home, ahora: T0 + 10_000 });

describe("tarjetas del portafolio (R-TRA-004)", () => {
  it.each([
    ["uno", { decisionsPending: 1, agentsWorking: 2, profile: "claude-code-completo" }],
    ["dos", { decisionsPending: 0, agentsWorking: 0, profile: null }],
    ["ausente", { decisionsPending: null, agentsWorking: null, profile: null, available: false }],
  ] as const)("%s trae lo que espera decisión, los agentes vivos y su perfil", (id, esperado) => {
    expect(filas().find((fila) => fila.projectId === id)).toMatchObject(esperado);
  });
});
