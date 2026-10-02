import { describe, expect, it } from "vitest";

import {
  createExecutionIdentity,
  executionScopeKey,
} from "../packages/core/src/execution-identity.js";

const ticketId = "FEATURE-CORE-IDENTIDAD-EJECUCION-20261001";

describe("identidad de ejecución", () => {
  it("exige proyecto, ticket y ejecución, y devuelve una identidad inmutable", () => {
    const identity = createExecutionIdentity({
      projectId: "valmen-harness",
      ticketId,
      executionId: "exec-20261001-001",
    });

    expect(identity).toEqual({
      projectId: "valmen-harness",
      ticketId,
      executionId: "exec-20261001-001",
    });
    expect(Object.isFrozen(identity)).toBe(true);
    expect(() => {
      (identity as { projectId: string }).projectId = "otro-proyecto";
    }).toThrow();
  });

  it.each([
    [{ projectId: "", ticketId, executionId: "exec-1" }, "projectId"],
    [{ projectId: "../otro", ticketId, executionId: "exec-1" }, "projectId"],
    [{ projectId: "valmen-harness", ticketId: "TICKET-SUELTO", executionId: "exec-1" }, "ticketId"],
    [{ projectId: "valmen-harness", ticketId, executionId: "" }, "executionId"],
    [{ projectId: "valmen-harness", ticketId, executionId: "/tmp/ejecucion" }, "executionId"],
  ])("rechaza %s cuando no es una identidad portable válida", (input, field) => {
    expect(() => createExecutionIdentity(input)).toThrow(field);
  });

  it("aísla ejecuciones con el mismo ticket e identificador local en proyectos distintos", () => {
    const harness = createExecutionIdentity({
      projectId: "valmen-harness",
      ticketId,
      executionId: "exec-20261001-001",
    });
    const saicloud = createExecutionIdentity({
      projectId: "saiopencloud",
      ticketId,
      executionId: "exec-20261001-001",
    });

    expect(executionScopeKey(harness)).not.toBe(executionScopeKey(saicloud));
    expect(executionScopeKey(harness)).toBe("14:valmen-harness|17:exec-20261001-001");
  });
});
