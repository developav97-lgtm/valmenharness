import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createJourney, resolveAuthorizedProject } from "../packages/engine/src/index.js";
import { createMissionControl, handleApi, type ServerContext } from "../packages/server/src/server.js";

let home: string;
let root: string;
const projectId = "valmen-harness";

beforeEach(() => {
  home = join(tmpdir(), `valmen-journeys-api-${Date.now()}-${Math.random()}`);
  root = join(home, "harness");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(home, ".valmen", "bindings.local.yaml"), `schema-version: 1\nmachine-id: qa\nprojects:\n  ${projectId}:\n    root: ${root}\n`);
  writeFileSync(join(root, ".valmen", "config.yaml"), `project-id: ${projectId}\n`);
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

it("sirve la misma hoja de ruta del motor para el proyecto ya autorizado", async () => {
  const authorizedProject = resolveAuthorizedProject({ projectId, home });
  createJourney(authorizedProject, {
    revisionId: "rev-api", journeyId: "api", occurredAt: "2026-10-03T08:00:00.000Z",
    tickets: [{ ticketId: "FEATURE-API-PRUEBA-20261003", order: 1, priority: 1, dependsOn: [], start: { condition: "manual" }, authorizationIds: [] }],
  });
  const context: ServerContext = {
    root, paths: authorizedProject.paths, authorizedProject,
    bindingsFile: join(home, ".valmen", "bindings.local.yaml"), credentialsFile: join(home, "credentials"), env: {},
  };
  const response = await handleApi("GET", "/api/journeys", {}, context);
  expect(response).toMatchObject({ status: 200, body: { projectId, journeys: [{ journeyId: "api", tickets: [{ ticketId: "FEATURE-API-PRUEBA-20261003", activity: "unknown" }] }] } });
});

it("publica un cambio de jornada por SSE en menos de cinco segundos", async () => {
  const authorizedProject = resolveAuthorizedProject({ projectId, home });
  const context: ServerContext = {
    root, paths: authorizedProject.paths, authorizedProject,
    bindingsFile: join(home, ".valmen", "bindings.local.yaml"), credentialsFile: join(home, "credentials"), env: {},
  };
  const server = createMissionControl(context);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No se pudo abrir el servidor de prueba.");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/events`);
    const reader = response.body?.getReader();
    if (reader === undefined) throw new Error("SSE no devolvió un cuerpo legible.");
    await reader.read(); // retry inicial: la suscripción ya está registrada.
    const startedAt = Date.now();
    createJourney(authorizedProject, {
      revisionId: "rev-sse", journeyId: "sse", occurredAt: "2026-10-03T09:00:00.000Z",
      tickets: [{ ticketId: "FEATURE-SSE-PRUEBA-20261003", order: 1, priority: 1, dependsOn: [], start: { condition: "manual" }, authorizationIds: [] }],
    });
    const event = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("SSE no avisó del cambio.")), 4_500)),
    ]);
    expect(new TextDecoder().decode(event.value)).toContain("changed");
    expect(Date.now() - startedAt).toBeLessThan(5_000);
    await reader.cancel();
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
});
