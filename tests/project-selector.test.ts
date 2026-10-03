/** El selector de Mission Control solo cambia entre proyectos declarados. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { machineBindingsPath } from "@valmen/adapter";
import { createMissionControl, type ServerContext } from "../packages/server/src/server.js";

let home: string;
let first: string;
let second: string;
let context: ServerContext;

function writeTicket(root: string, id: string) {
  const path = join(root, "tickets", "2026", id, "ticket.md");
  mkdirSync(join(root, "tickets", "2026", id), { recursive: true });
  writeFileSync(path, `---
schema_version: 2
id: ${id}
title: ${id}
type: FEATURE
module: MC
workflow_status: intake
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-01
updated: 2026-10-01
related_ticket: null
target_release: null
released_in: null
---
\n# ${id}\n`);
}

async function api(server: ReturnType<typeof createMissionControl>, path: string, project?: string) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No se obtuvo puerto.");
  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`, {
      headers: project === undefined ? {} : { "X-Valmen-Project": project },
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "valmen-selector-"));
  first = join(home, "uno");
  second = join(home, "dos");
  for (const [root, id] of [[first, "uno"], [second, "dos"]] as const) {
    mkdirSync(join(root, ".valmen"), { recursive: true });
    writeFileSync(join(root, ".valmen", "config.yaml"), `project-id: ${id}\n`);
  }
  writeTicket(first, "FEATURE-UNO-20261001");
  writeTicket(second, "FEATURE-DOS-20261001");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  const bindingsFile = machineBindingsPath(home);
  writeFileSync(bindingsFile, `schema-version: 1
machine-id: pruebas
projects:
  uno:
    root: ${first}
  dos:
    root: ${second}
`);
  context = { root: first, bindingsFile, credentialsFile: join(home, "credentials"), env: {} };
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("selector de proyectos", () => {
  it("resuelve el encabezado contra el binding autorizado y aísla los tickets", async () => {
    const response = await api(createMissionControl(context), "/api/tickets", "dos");

    expect(response.status).toBe(200);
    expect((await response.json()).tickets.map((ticket: { id: string }) => ticket.id)).toEqual([
      "FEATURE-DOS-20261001",
    ]);
  });

  it("rechaza un identificador de proyecto no declarado en vez de volver a la raíz actual", async () => {
    const response = await api(createMissionControl(context), "/api/tickets", "ajeno");

    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("no está declarado");
  });
});
