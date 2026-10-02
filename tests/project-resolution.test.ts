import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAuthorizedProject, resolveProjectForHermesProfile } from "../packages/engine/src/project-resolution.js";

let home: string;
let harness: string;
let saicloud: string;

function binding(projectId: string, root: string, profile: string): string {
  return `  ${projectId}:\n    root: ${root}\n    hermes-profile: ${profile}\n`;
}
function setup(): void {
  mkdirSync(join(home, ".valmen"), { recursive: true });
  for (const [root, id] of [[harness, "valmen-harness"], [saicloud, "saiopencloud"]] as const) {
    mkdirSync(join(root, ".valmen"), { recursive: true });
    writeFileSync(join(root, ".valmen", "config.yaml"), `project-id: ${id}\n`, "utf8");
  }
  writeFileSync(join(home, ".valmen", "bindings.local.yaml"), ["schema-version: 1", "machine-id: qa-mac", "projects:", binding("valmen-harness", harness, "valmen-harness"), binding("saiopencloud", saicloud, "saiopencloud")].join("\n"), "utf8");
}
beforeEach(() => { home = join(tmpdir(), `valmen-resolution-${Date.now()}-${Math.random()}`); harness = join(home, "harness"); saicloud = join(home, "saicloud"); setup(); });
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("resolución autorizada de proyectos", () => {
  it("resuelve solo un proyecto declarado y cuya política confirma la identidad", () => {
    expect(resolveAuthorizedProject({ projectId: "saiopencloud", home })).toMatchObject({ projectId: "saiopencloud", root: saicloud, machineId: "qa-mac" });
    expect(() => resolveAuthorizedProject({ projectId: "ajeno", home })).toThrow("no está declarado");
  });
  it("rechaza un binding cuya raíz declara otro project-id", () => {
    writeFileSync(join(saicloud, ".valmen", "config.yaml"), "project-id: otro\n", "utf8");
    expect(() => resolveAuthorizedProject({ projectId: "saiopencloud", home })).toThrow("no coincide");
  });
  it("solo atribuye una sesión sin cwd por el perfil Hermes exacto del binding", () => {
    expect(resolveProjectForHermesProfile({ profile: "saiopencloud", home })?.projectId).toBe("saiopencloud");
    expect(resolveProjectForHermesProfile({ profile: "desconocido", home })).toBeNull();
  });
});
