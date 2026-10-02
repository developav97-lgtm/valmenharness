/**
 * Los roles de ejecución de la cascada verificada.
 *
 * R-S1-002 pide «un modelo barato produce, un evaluador verifica contra el
 * contexto y solo si falla se escala». Los tres eslabones necesitan un rol en el
 * routing —es donde un proyecto declara con qué modelo paga cada paso— y lo que
 * estos tests protegen es que esos roles **tengan quién los ejecute**: la regla
 * que este repositorio aprendió a golpes es que un rol declarado sin consumidor
 * es peor que un rol ausente, porque parece configuración activa.
 *
 * La otra mitad es la cadena: un productor y un escalado con el mismo modelo no
 * escalan a ninguna parte, y un verificador que no emite probabilidades es tan
 * débil como el productor. Las dos cosas se rechazan con motivo, no se aceptan en
 * silencio.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  EFFORTS,
  PRESETS,
  ROLES,
  cascadeRoutingFor,
  parseRouting,
  resolveRouting,
} from "../packages/adapter/src/index.js";

/** Los tres eslabones, en el orden en que trabajan. */
const ESLABONES = ["producer", "verifier", "escalation"] as const;

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-roles-"));
  mkdirSync(join(lab, ".valmen"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Escribe el routing del laboratorio, tal como lo escribiría una persona. */
function routing(text: string): void {
  writeFileSync(join(lab, ".valmen", "routing.yaml"), text, "utf8");
}

describe("el catálogo de roles de ejecución", () => {
  it("declara los tres eslabones con su consumidor y su descripción", () => {
    for (const id of ESLABONES) {
      const rol = ROLES.find((candidato) => candidato.id === id);
      expect(rol, `falta el rol ${id}`).toBeDefined();
      expect(rol?.description).not.toBe("");
      // El consumidor tiene que nombrar de verdad dónde corre: es lo que
      // distingue «configurado» de «declarado».
      expect(rol?.consumer).toContain("--evaluator cascade");
    }
  });

  it("declara el rol ui-specs, que se resuelve desde la sección playwright", () => {
    const rol = ROLES.find((candidato) => candidato.id === "ui-specs");
    expect(rol, "falta el rol ui-specs").toBeDefined();
    expect(rol?.description).not.toBe("");
    expect(rol?.consumer).not.toBeNull();
    // Aditivo: los tres eslabones siguen declarados, con su consumidor.
    for (const id of ESLABONES) {
      expect(ROLES.some((candidato) => candidato.id === id)).toBe(true);
    }
  });

  it("los cuatro presets dan modelo y esfuerzo a los tres eslabones y al rol de specs", () => {
    for (const preset of PRESETS) {
      const rutas = resolveRouting({ preset: preset.id, roles: {} });
      for (const id of [...ESLABONES, "ui-specs"]) {
        const ruta = rutas.find((candidato) => candidato.role === id);
        expect(ruta, `${preset.id}/${id}`).toBeDefined();
        expect(ruta?.model, `${preset.id}/${id}`).not.toBe("");
        expect(EFFORTS).toContain(ruta?.effort);
      }
    }
  });

  it("el archivo de routing admite las tres claves nuevas", () => {
    const routingAnalizado = parseRouting(
      [
        "preset: balanced",
        "roles:",
        "  producer:",
        "    model: z-ai/glm-5.3-flash",
        "    effort: low",
        "  verifier:",
        "    model: typesafe/jev-1.13",
        "  escalation:",
        "    model: moonshotai/kimi-k3",
        "    effort: high",
      ].join("\n"),
    );

    expect(Object.keys(routingAnalizado.roles).sort()).toEqual([
      "escalation",
      "producer",
      "verifier",
    ]);
    expect(routingAnalizado.roles["producer"]?.effort).toBe("low");
  });
});

describe("la cadena de la cascada", () => {
  it("se resuelve del preset y dice de dónde salió cada eslabón", () => {
    const cadena = cascadeRoutingFor(lab);

    expect([cadena.producer.role, cadena.verifier.role, cadena.escalation.role]).toEqual([
      ...ESLABONES,
    ]);
    for (const paso of [cadena.producer, cadena.verifier, cadena.escalation]) {
      expect(paso.source).toBe("preset");
      expect(paso.model).not.toBe("");
      expect(paso.provider).not.toBe("");
    }
    // El verificador es el que emite probabilidades: sin eso la cascada no se
    // puede ejecutar y la cadena lo dice.
    expect(cadena.verifier.probabilistic).toBe(true);
    expect(cadena.reason).toBeNull();
  });

  it("el override del proyecto gana y se ve en la columna de origen", () => {
    routing(
      [
        "preset: balanced",
        "roles:",
        "  producer:",
        "    provider: openrouter",
        "    model: z-ai/glm-5.3-flash",
        "    effort: low",
        "  escalation:",
        "    provider: openrouter",
        "    model: anthropic/claude-opus-4.6",
        "    effort: high",
      ].join("\n"),
    );

    const cadena = cascadeRoutingFor(lab);
    expect(cadena.producer.model).toBe("z-ai/glm-5.3-flash");
    expect(cadena.producer.source).toBe("proyecto");
    expect(cadena.producer.effort).toBe("low");
    expect(cadena.escalation.model).toBe("anthropic/claude-opus-4.6");
    expect(cadena.escalation.source).toBe("proyecto");
    // El verificador no se tocó: sigue saliendo del preset.
    expect(cadena.verifier.source).toBe("preset");
    expect(cadena.reason).toBeNull();
  });

  it("rechaza un productor y un escalado que son el mismo modelo", () => {
    // Escalar al modelo que ya respondió no escala a ninguna parte: sería pagar
    // dos veces la misma respuesta y anotar un escalamiento que no ocurrió.
    routing(
      [
        "preset: balanced",
        "roles:",
        "  producer:",
        "    model: z-ai/glm-5.3-flash",
        "  escalation:",
        "    model: z-ai/glm-5.3-flash",
      ].join("\n"),
    );

    const cadena = cascadeRoutingFor(lab);
    expect(cadena.reason).toContain("mismo modelo");
    expect(cadena.reason).toContain("producer");
    expect(cadena.reason).toContain("escalation");
  });

  it("rechaza un verificador que no emite probabilidades", () => {
    // El preset de suscripción manda los cuatro roles a Claude, y Claude no
    // responde proposiciones con probabilidad calibrada: verificar con él sería
    // verificar con un modelo tan flojo como el productor.
    routing(["preset: suscripcion", "roles: {}", ""].join("\n"));

    const cadena = cascadeRoutingFor(lab);
    expect(cadena.verifier.probabilistic).toBe(false);
    expect(cadena.reason).toContain("probabilidad");
    expect(cadena.reason).toContain("verifier");
  });
});
