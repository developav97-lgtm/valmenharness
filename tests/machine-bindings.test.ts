import { describe, expect, it } from "vitest";

import {
  machineBindingsPath,
  parseConfig,
  parseMachineBindings,
  readExecutionCapabilities,
  readSharedProjectPolicy,
} from "../packages/adapter/src/index.js";

describe("bindings por máquina", () => {
  it("mantiene project-id en la política compartible y bloquea bindings dentro de config.yaml", () => {
    expect(readSharedProjectPolicy(parseConfig("project-id: valmen-harness\n"))).toEqual({
      projectId: "valmen-harness",
    });

    expect(() =>
      parseConfig(
        [
          "project-id: valmen-harness",
          "machine-bindings:",
          "  root: /Users/juanandrade/Desktop/ValmenHarness",
          "",
        ].join("\n"),
      ),
    ).toThrow("bindings.local.yaml");
  });

  it("mantiene observación y despacho apagados hasta que el proyecto los declare", () => {
    expect(readExecutionCapabilities(parseConfig("project-id: valmen-harness\n"))).toEqual({
      observationSources: [],
      dispatchExecutors: [],
    });

    expect(readExecutionCapabilities(parseConfig([
      "project-id: valmen-harness",
      "execution:",
      "  observation-sources:",
      "    - hermes",
      "    - opencode",
      "  dispatch-executors:",
      "    - hermes",
      "",
    ].join("\n")))).toEqual({
      observationSources: ["hermes", "opencode"],
      dispatchExecutors: ["hermes"],
    });
  });

  it.each([
    ["observation-sources", "Hermes", "etiquetas"],
    ["dispatch-executors", "../hermes", "etiquetas"],
  ])("rechaza una capacidad no portable (%s: %s)", (key, value, message) => {
    expect(() => readExecutionCapabilities(parseConfig([
      "execution:",
      `  ${key}:`,
      `    - ${value}`,
      "",
    ].join("\n")))).toThrow(message);
  });

  it("rechaza una capacidad repetida", () => {
    expect(() => readExecutionCapabilities(parseConfig([
      "execution:",
      "  observation-sources:",
      "    - hermes",
      "    - hermes",
      "",
    ].join("\n")))).toThrow("no puede repetir");
  });

  it("permite que dos máquinas declaren raíces y perfiles distintos para el mismo proyecto", () => {
    const mac = parseMachineBindings(
      [
        "schema-version: 1",
        "machine-id: juan-macbook",
        "projects:",
        "  valmen-harness:",
        "    root: /Users/juanandrade/Desktop/ValmenHarness",
        "    hermes-profile: harness",
        "",
      ].join("\n"),
    );
    const rp = parseMachineBindings(
      [
        "schema-version: 1",
        "machine-id: rp-ci",
        "projects:",
        "  valmen-harness:",
        "    root: /srv/rp/ValmenHarness",
        "    hermes-profile: rp",
        "",
      ].join("\n"),
    );

    expect(mac.machineId).toBe("juan-macbook");
    expect(rp.machineId).toBe("rp-ci");
    expect(mac.projects["valmen-harness"]).toEqual({
      root: "/Users/juanandrade/Desktop/ValmenHarness",
      hermesProfile: "harness",
    });
    expect(rp.projects["valmen-harness"]?.root).toBe("/srv/rp/ValmenHarness");
    expect(machineBindingsPath("/Users/juanandrade")).toBe(
      "/Users/juanandrade/.valmen/bindings.local.yaml",
    );
  });

  it.each([
    ["root: proyecto", "root"],
    ["api-key: no-debe-ir-aqui # valmen:allow-secret ejemplo de campo prohibido", "api-key"],
    ["token: no-debe-ir-aqui # valmen:allow-secret ejemplo de campo prohibido", "token"],
  ])("rechaza %s en un binding local", (field, expected) => {
    expect(() =>
      parseMachineBindings(
        [
          "schema-version: 1",
          "machine-id: juan-macbook",
          "projects:",
          "  valmen-harness:",
          `    ${field}`,
          "",
        ].join("\n"),
      ),
    ).toThrow(expected);
  });
});
