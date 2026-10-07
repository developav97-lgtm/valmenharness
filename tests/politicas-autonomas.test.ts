/**
 * El resumen de las políticas autónomas que la pantalla de Configuración muestra.
 *
 * Se calcula con los mismos lectores que usa el motor, así que lo que se afirma acá es
 * lo que la persona va a ver: el estado de cada política, el mensaje exacto de una que
 * no se entiende y —lo que más cuesta romper— que un error en una sección no esconda
 * las otras.
 */
import { describe, expect, it } from "vitest";

import { parseConfig } from "../packages/adapter/src/index.js";
import { checkConfig } from "../packages/server/src/config.js";
import { resumirPoliticas } from "../packages/server/src/politicas.js";

const AUTONOMIA = `autonomous:
  enabled: true
  eligible:
    types:
      - BUGFIX
    max-risk: normal
    require:
      - plan-approved
    excluded-modules:
      - auth
  limits:
    max-concurrent: 1
    collision-policy: serialize
    max-per-day: 3
    budget-per-ticket: 5.00
    stop-on:
      - test-failure
`;

function politicas(texto: string): Record<string, ReturnType<typeof resumirPoliticas>[number]> {
  return Object.fromEntries(
    resumirPoliticas(parseConfig(texto)).map((politica) => [politica.id, politica]),
  );
}

describe("el estado de cada política", () => {
  it("sin nada declarado, las cuatro están apagadas y ninguna da error", () => {
    const todas = politicas("name: Demo\n");
    expect(Object.keys(todas).sort()).toEqual([
      "autonomous",
      "gate-thresholds",
      "jev-propositions",
      "test-setup",
    ]);
    for (const politica of Object.values(todas)) {
      expect(politica.estado, politica.id).toBe("apagada");
      expect(politica.error, politica.id).toBeNull();
    }
  });

  it("la autonomía declarada queda activa y se resume en lenguaje de persona", () => {
    const autonomia = politicas(`name: Demo\n${AUTONOMIA}`)["autonomous"];
    expect(autonomia?.estado).toBe("activa");
    expect(autonomia?.resumen.join(" ")).toContain("BUGFIX");
  });

  it("las proposiciones por etapa se cuentan con su veredicto", () => {
    const texto = `name: Demo
jev-propositions:
  plan:
    - id: custom-rollback-probado
      description: El plan dice cómo se revierte
      instructions: Busca la reversión.
      criteria:
        yes: Hay un paso de reversión.
        no: No hay reversión.
      weight: 1
      approve-at: 0.9
      block-at: 0.1
      verdict: inform
`;
    const proposiciones = politicas(texto)["jev-propositions"];
    expect(proposiciones?.estado).toBe("activa");
    expect(proposiciones?.resumen.join("\n")).toContain("plan: 1 — custom-rollback-probado (inform)");
    expect(proposiciones?.resumen.join("\n")).toContain("analysis: ninguna");
  });

  it("una preparación fuera de allowed-schemas se avisa como rechazada", () => {
    const texto = "name: Demo\ntest-setup:\n  schema: prod\n  commands:\n    - echo hola\nallowed-schemas:\n  - test\n";
    const preparacion = politicas(texto)["test-setup"];
    expect(preparacion?.estado).toBe("activa");
    expect(preparacion?.resumen.join(" ")).toContain("se rechaza");
  });

  it("un umbral sin firma se dice sin firma y uno firmado nombra a quien lo firmó", () => {
    const texto = `name: Demo
gate-thresholds:
  - gate: plan
    approve-at: 0.85
    block-at: 0.1
  - gate: analysis
    approve-at: 0.8
    block-at: 0.1
    approved-by: Juan Andrade
    reason: medido en 40 recibos
`;
    const umbrales = politicas(texto)["gate-thresholds"];
    expect(umbrales?.soloLectura).toBe(true);
    expect(umbrales?.ejemplo).toBeNull();
    const lineas = umbrales?.resumen.join("\n") ?? "";
    expect(lineas).toContain("sin firma");
    expect(lineas).toContain("firmado por Juan Andrade");
  });
});

describe("una sección con error no esconde las demás", () => {
  it("informa el mensaje exacto del lector y deja las otras políticas legibles", () => {
    const texto = `name: Demo
${AUTONOMIA}test-setup:
  commands:
    - echo hola
`;
    const todas = politicas(texto);
    expect(todas["test-setup"]?.estado).toBe("error");
    expect(todas["test-setup"]?.error).toContain("test-setup.schema");
    expect(todas["autonomous"]?.estado).toBe("activa");
  });
});

describe("los ejemplos que la pantalla agrega", () => {
  it("están comentados: insertarlos no activa ninguna política", () => {
    for (const politica of Object.values(politicas("name: Demo\n"))) {
      if (politica.ejemplo === null) continue;
      for (const linea of politica.ejemplo.split("\n")) {
        expect(linea.startsWith("#"), `${politica.id}: ${linea}`).toBe(true);
      }
    }
    const conEjemplos = Object.values(politicas("name: Demo\n"))
      .map((politica) => politica.ejemplo ?? "")
      .join("\n");
    for (const politica of Object.values(politicas(`name: Demo\n${conEjemplos}\n`))) {
      expect(politica.estado, politica.id).toBe("apagada");
    }
  });

  it("descomentados son válidos: el lector los entiende sin error", () => {
    for (const politica of Object.values(politicas("name: Demo\n"))) {
      if (politica.ejemplo === null) continue;
      const descomentado = politica.ejemplo.replace(/^# ?/gm, "");
      const leida = politicas(`name: Demo\n${descomentado}\n`)[politica.id];
      expect(leida?.error, politica.id).toBeNull();
      expect(leida?.estado, politica.id).toBe("activa");
    }
  });
});

describe("el resumen viaja en la configuración", () => {
  it("checkConfig lo incluye en summary", () => {
    const estado = checkConfig("/tmp/valmen-sin-proyecto", "name: Demo\n");
    expect(estado.summary?.policies).toHaveLength(4);
  });
});
