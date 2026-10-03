import { describe, expect, it } from "vitest";

import {
  ADAPTER_CAPABILITIES,
  createAdapterCapabilities,
} from "../packages/adapter/src/index.js";

function profile(overrides: Partial<Parameters<typeof createAdapterCapabilities>[0]> = {}) {
  return {
    adapter: "hermes",
    capabilities: [
      { capability: "observe-states" as const, available: true, limitation: "solo lectura" },
      { capability: "read-activity" as const, available: true, limitation: null },
      { capability: "read-messages" as const, available: false, limitation: "mensajes no expuestos" },
      { capability: "dispatch" as const, available: false, limitation: "despacho no habilitado" },
    ],
    ...overrides,
  };
}

describe("perfil de capacidades de adaptador", () => {
  it("declara de forma inmutable las cuatro capacidades y sus límites", () => {
    const declared = createAdapterCapabilities(profile());

    expect(ADAPTER_CAPABILITIES).toEqual([
      "observe-states",
      "read-activity",
      "read-messages",
      "dispatch",
    ]);
    expect(declared).toEqual(profile());
    expect(Object.isFrozen(declared)).toBe(true);
    expect(Object.isFrozen(declared.capabilities)).toBe(true);
    expect(Object.isFrozen(declared.capabilities[0])).toBe(true);
  });

  it("declara mensajes ausentes sin ocultar estados ni actividad disponibles", () => {
    const declared = createAdapterCapabilities(profile());
    const byCapability = Object.fromEntries(
      declared.capabilities.map((entry) => [entry.capability, entry]),
    );

    expect(byCapability["observe-states"]).toMatchObject({ available: true });
    expect(byCapability["read-activity"]).toMatchObject({ available: true });
    expect(byCapability["read-messages"]).toEqual({
      capability: "read-messages",
      available: false,
      limitation: "mensajes no expuestos",
    });
  });

  it("rechaza perfiles incompletos o con capacidades repetidas", () => {
    expect(() => createAdapterCapabilities(profile({
      capabilities: profile().capabilities.slice(0, 3),
    }))).toThrow("cuatro capacidades");

    expect(() => createAdapterCapabilities(profile({
      capabilities: [
        ...profile().capabilities.slice(0, 3),
        { capability: "read-messages", available: false, limitation: "mensajes no expuestos" },
      ],
    }))).toThrow("repetir");
  });

  it("rechaza identificadores y límites ambiguos sin consultar configuración o servicios", () => {
    expect(() => createAdapterCapabilities(profile({ adapter: "Hermes" }))).toThrow("adapter");
    expect(() => createAdapterCapabilities(profile({
      capabilities: profile().capabilities.map((entry) =>
        entry.capability === "dispatch"
          ? { ...entry, limitation: null }
          : entry,
      ),
    }))).toThrow("limitación");
    expect(() => createAdapterCapabilities(profile({
      capabilities: profile().capabilities.map((entry) =>
        entry.capability === "read-messages"
          ? { ...entry, limitation: "   " }
          : entry,
      ),
    }))).toThrow("limitación");
  });
});
