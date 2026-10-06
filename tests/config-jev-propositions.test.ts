/** Contrato seguro de `jev-propositions` en la configuración del proyecto. */
import { describe, expect, it } from "vitest";

import { parseConfig, readJevPropositions } from "../packages/adapter/src/index.js";

function yaml(lines: readonly string[]): ReturnType<typeof parseConfig> {
  return parseConfig(lines.join("\n"));
}

function valid(
  stage = "plan",
  options: {
    readonly description?: string;
    readonly weight?: string;
    readonly verdict?: string;
    readonly extra?: readonly string[];
  } = {},
): ReturnType<typeof parseConfig> {
  return yaml([
    "jev-propositions:",
    `  ${stage}:`,
    "    - id: custom-alcance-aprobado",
    `      description: ${options.description ?? "El cambio respeta el alcance aprobado."}`,
    "      instructions: Compara la solicitud, el plan y el cambio entregado.",
    "      criteria:",
    "        yes: El cambio corresponde al plan aprobado.",
    "        no: El cambio agrega trabajo fuera del alcance declarado.",
    `      weight: ${options.weight ?? "2"}`,
    "      approve-at: 0.9",
    "      block-at: 0.1",
    `      verdict: ${options.verdict ?? "required"}`,
    ...(options.extra ?? []),
  ]);
}

describe("jev-propositions", () => {
  it("no habilita nada cuando la sección está ausente y devuelve colecciones inmutables", () => {
    const result = readJevPropositions(yaml(["name: Laboratorio"]));

    expect(result).toEqual({ analysis: [], plan: [], integration: [] });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.plan)).toBe(true);
  });

  it.each(["analysis", "plan", "integration"] as const)(
    "lee una proposición válida para la etapa %s",
    (stage) => {
      const result = readJevPropositions(valid(stage));
      expect(result[stage]).toEqual([
        {
          id: "custom-alcance-aprobado",
          description: "El cambio respeta el alcance aprobado.",
          instructions: "Compara la solicitud, el plan y el cambio entregado.",
          criteria: {
            yes: "El cambio corresponde al plan aprobado.",
            no: "El cambio agrega trabajo fuera del alcance declarado.",
          },
          weight: 2,
          approveAt: 0.9,
          blockAt: 0.1,
          verdict: "required",
        },
      ]);
      expect(Object.isFrozen(result[stage][0])).toBe(true);
      expect(Object.isFrozen(result[stage][0]?.criteria)).toBe(true);
    },
  );

  it("admite una proposición informativa sin concederle otro modo", () => {
    const result = readJevPropositions(
      yaml([
        "jev-propositions:",
        "  analysis:",
        "    - id: custom-contexto",
        "      description: El contexto permite entender el diagnóstico.",
        "      instructions: Describe si el contexto es suficiente.",
        "      criteria:",
        "        yes: El contexto es suficiente.",
        "        no: Falta contexto verificable.",
        "      weight: 1",
        "      approve-at: 0.9",
        "      block-at: 0.1",
        "      verdict: inform",
      ]),
    );

    expect(result.analysis[0]?.verdict).toBe("inform");
  });

  it.each([
    ["etapa desconocida", valid("qa-mechanical"), /jev-propositions.qa-mechanical/],
    [
      "clave sobrante",
      valid("plan", { extra: ["      effect: approve"] }),
      /jev-propositions.plan\[0\].effect/,
    ],
    [
      "identificador fuera del prefijo reservado",
      yaml([
        "jev-propositions:",
        "  plan:",
        "    - id: alcance",
        "      description: El cambio respeta el alcance aprobado.",
        "      instructions: Compara la solicitud, el plan y el cambio entregado.",
        "      criteria:",
        "        yes: El cambio corresponde al plan aprobado.",
        "        no: El cambio agrega trabajo fuera del alcance declarado.",
        "      weight: 2",
        "      approve-at: 0.9",
        "      block-at: 0.1",
        "      verdict: required",
      ]),
      /custom-/,
    ],
    [
      "umbral invertido",
      yaml([
        "jev-propositions:",
        "  plan:",
        "    - id: custom-umbral",
        "      description: El cambio respeta el alcance aprobado.",
        "      instructions: Compara la solicitud, el plan y el cambio entregado.",
        "      criteria:",
        "        yes: El cambio corresponde al plan aprobado.",
        "        no: El cambio agrega trabajo fuera del alcance declarado.",
        "      weight: 2",
        "      approve-at: 0.1",
        "      block-at: 0.9",
        "      verdict: required",
      ]),
      /block-at.*menor que approve-at/,
    ],
  ])("rechaza %s", (_name, config, message) => {
    expect(() => readJevPropositions(config)).toThrow(message);
  });

  it("rechaza IDs duplicados, textos vacíos, pesos inválidos y modos que ampliarían autoridad", () => {
    const duplicate = yaml([
      "jev-propositions:",
      "  plan:",
      "    - id: custom-duplicada",
      "      description: Primera pregunta.",
      "      instructions: Primera instrucción.",
      "      criteria:",
      "        yes: Sí.",
      "        no: No.",
      "      weight: 1",
      "      approve-at: 0.9",
      "      block-at: 0.1",
      "      verdict: required",
      "    - id: custom-duplicada",
      "      description: Segunda pregunta.",
      "      instructions: Segunda instrucción.",
      "      criteria:",
      "        yes: Sí.",
      "        no: No.",
      "      weight: 1",
      "      approve-at: 0.9",
      "      block-at: 0.1",
      "      verdict: required",
    ]);
    expect(() => readJevPropositions(duplicate)).toThrow(/está duplicado/);

    for (const [name, config, message] of [
      [
        "texto vacío",
        valid("plan", { description: "" }),
        /description.*no puede estar vacío/,
      ],
      ["peso cero", valid("plan", { weight: "0" }), /weight.*positivo/],
      ["modo promote", valid("plan", { verdict: "promote" }), /required o inform/],
    ] as const) {
      expect(() => readJevPropositions(config), name).toThrow(message);
    }
  });
});
