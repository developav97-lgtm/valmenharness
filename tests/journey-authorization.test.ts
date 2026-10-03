import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { readJourneyAuthorization, resolveAuthorizedProject } from "../packages/engine/src/index.js";

let home: string; let root: string;
beforeEach(() => { home = join(tmpdir(), `valmen-auth-${Date.now()}`); root = join(home, "harness"); mkdirSync(join(home, ".valmen"), { recursive: true }); mkdirSync(join(root, ".valmen"), { recursive: true }); writeFileSync(join(home, ".valmen", "bindings.local.yaml"), `schema-version: 1\nmachine-id: qa\nprojects:\n  valmen-harness:\n    root: ${root}\n`); writeFileSync(join(root, ".valmen", "config.yaml"), "project-id: valmen-harness\n"); });
afterEach(() => rmSync(home, { recursive: true, force: true }));
const project = () => resolveAuthorizedProject({ projectId: "valmen-harness", home });

it("no habilita despacho por observar o configurar una jornada", () => {
  const authorization = readJourneyAuthorization(project());
  expect(authorization.canObserve("hermes")).toBe(false);
  expect(authorization.canDispatch("hermes")).toBe(false);
});
it("permite solo el ejecutor declarado explícitamente", () => {
  writeFileSync(join(root, ".valmen", "config.yaml"), "project-id: valmen-harness\nexecution:\n  observation-sources:\n    - hermes\n  dispatch-executors:\n    - hermes\n");
  const authorization = readJourneyAuthorization(project());
  expect(authorization.canObserve("hermes")).toBe(true);
  expect(authorization.canDispatch("hermes")).toBe(true);
  expect(authorization.canDispatch("opencode")).toBe(false);
});
