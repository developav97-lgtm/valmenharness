/**
 * La documentación de la cascada verificada, atada al código.
 *
 * R-S1-002 pide **documentar** el patrón —qué modelo produce, cómo se verifica su
 * respuesta contra el contexto, cuándo se escala y cómo queda el motivo del
 * escalamiento en el recibo—, y una documentación sin quien la compare con el
 * código se queda vieja el día que un rol se renombra o el recibo gana un campo.
 * Lo que estas pruebas protegen es esa atadura: la referencia se lee contra las
 * fuentes que ya son la verdad —`EVALUATOR_IDS`, los roles que declaran a la
 * cascada como consumidor y los campos que el motor escribe de verdad en un
 * escalamiento— y no contra una lista escrita a mano acá, que sería una tercera
 * copia del mismo dato esperando a discrepar de las otras dos.
 *
 * Los dos evaluadores entran inyectados, así que nada de esto sale a la red ni
 * toca el registro de un proyecto.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ROLES } from "../packages/adapter/src/routing.js";
import { USAGE } from "../packages/cli/src/main.js";
import { EVALUATOR_IDS, evaluateGate } from "../packages/engine/src/evaluators.js";
import type {
  GateDefinition,
  Proposition,
  PropositionAnswer,
} from "../packages/gate/src/index.js";

const REPO = process.cwd();
const REFERENCIA = "docs/03-GATES.md";
const MANUAL = "docs/02-MOTOR.md";

/** El consumidor que declaran los tres eslabones de la cadena. */
const CONSUMIDOR = "valmen gate --evaluator cascade";

const referencia = readFileSync(join(REPO, REFERENCIA), "utf8");
const manual = readFileSync(join(REPO, MANUAL), "utf8");

/** Los evaluadores que el motor implementa. `auto` no es uno: es el enrutado. */
const EVALUADORES = EVALUATOR_IDS.filter((id) => id !== "auto");

/** Los tres roles de la cascada, tal como los declara el catálogo del routing. */
const ROLES_DE_LA_CASCADA = ROLES.filter((rol) => rol.consumer === CONSUMIDOR).map(
  (rol) => rol.id,
);

/**
 * Una línea de `texto` que documenta `--evaluator` con todos los evaluadores.
 *
 * Se busca la línea entera y no una mención suelta a propósito: el hueco que este
 * ticket cierra es una enumeración a mano a la que le faltaba el último evaluador,
 * así que lo que hay que exigir es que la línea los nombre a **todos**, no que la
 * palabra «cascade» aparezca en algún lado del documento.
 */
function lineaQueEnumera(texto: string): string | undefined {
  return texto
    .split("\n")
    .find(
      (linea) =>
        linea.includes("--evaluator") &&
        EVALUADORES.every((id) => linea.includes(id)),
    );
}

/** Un juez de chat simulado: responde por modelo, que es lo que distingue al escalado. */
function juezFalso() {
  return (async (options: {
    readonly propositions: readonly Proposition[];
    readonly model?: string;
  }) => {
    const modelo = options.model ?? "";
    return {
      answers: options.propositions.map(
        (proposicion): PropositionAnswer => ({
          id: proposicion.id,
          kind: proposicion.kind,
          value: 0.95,
          confidence: 0.95,
        }),
      ),
      model: { provider: "openrouter", model: modelo, resolvedVersion: `${modelo}-v1` },
      usage: { inputTokens: 10, outputTokens: 2, costUsd: 0.0001 },
      latencyMs: 10,
    };
  }) as unknown as NonNullable<Parameters<typeof evaluateGate>[0]["judge"]>;
}

/** Un verificador simulado que respalda una proposición y no la otra. */
function verificadorFalso() {
  return (async (options: {
    readonly propositions: readonly Proposition[];
    readonly model?: string;
  }) => {
    return {
      answers: options.propositions.map(
        (proposicion): PropositionAnswer => ({
          id: proposicion.id,
          kind: "noul",
          value: proposicion.id === "respaldada_b" ? 0.2 : 0.99,
        }),
      ),
      model: {
        provider: "openrouter",
        model: options.model ?? "typesafe/jev-1.13",
        resolvedVersion: "jev-1.13-20260917",
      },
      usage: { inputTokens: 300, outputTokens: 0, costUsd: 0.00001 },
      latencyMs: 700,
    };
  }) as unknown as NonNullable<Parameters<typeof evaluateGate>[0]["jev"]>;
}

function gateDePrueba(): GateDefinition {
  return {
    id: "prueba",
    title: "Gate de prueba",
    transition: "planned → approved",
    mode: "hybrid",
    appliesTo: ["planned"],
    policy: { approveAt: 0.9, blockAt: 0.1 },
    mechanicalChecks: [],
    propositions: [
      {
        id: "a",
        kind: "noul",
        description: "La primera proposición",
        instructions: "El estado cumple la primera proposición.",
      },
      {
        id: "b",
        kind: "noul",
        description: "La segunda proposición",
        instructions: "El estado cumple la segunda proposición.",
      },
    ],
  };
}

/** Un escalamiento escrito por el motor, con la cadena declarada a mano. */
async function escalamientoReal(): Promise<Record<string, unknown>> {
  const resultado = await evaluateGate({
    gate: gateDePrueba(),
    state: { solicitud: "algo" },
    root: REPO,
    evaluator: "cascade",
    cascade: {
      producer: { provider: "openrouter", model: "proveedor/modelo-barato", effort: "auto" },
      verifier: { provider: "openrouter", model: "typesafe/jev-1.13", effort: "auto" },
      escalation: { provider: "openrouter", model: "proveedor/modelo-superior", effort: "high" },
      reason: null,
    },
    judge: juezFalso(),
    jev: verificadorFalso(),
  });

  const escalamiento = resultado.escalations?.[0];
  if (escalamiento === undefined) {
    throw new Error("la corrida de prueba no escaló nada: no hay campos que comparar");
  }
  return escalamiento as unknown as Record<string, unknown>;
}

describe("la referencia de compuertas y los evaluadores que el motor implementa", () => {
  it("nombra cada uno de ellos, `cascade` incluido", () => {
    // Cuando entre un evaluador nuevo, esta prueba falla hasta que la referencia
    // lo nombre. Es lo que impide que su lista vuelva a nacer incompleta, que es
    // exactamente como quedó `cascade`.
    expect(EVALUADORES.length).toBeGreaterThan(3);
    for (const id of EVALUADORES) {
      expect(referencia, `la referencia no nombra el evaluador ${id}`).toContain(`\`${id}\``);
    }
  });

  it("nombra los tres roles de la cascada que el routing declara con ese consumidor", () => {
    expect(ROLES_DE_LA_CASCADA).toEqual(["producer", "verifier", "escalation"]);
    for (const rol of ROLES_DE_LA_CASCADA) {
      expect(referencia, `la referencia no nombra el rol ${rol}`).toContain(`\`${rol}\``);
    }
  });
});

describe("la referencia del recibo y lo que el motor escribe en un escalamiento", () => {
  it("el ejemplo de la referencia lleva los mismos campos que el escalamiento real", async () => {
    const campos = Object.keys(await escalamientoReal()).sort();
    expect(campos).toEqual([
      "from",
      "proposition",
      "reason",
      "role",
      "threshold",
      "to",
      "verified",
    ]);

    // De la referencia se toman los bloques JSON que publican escalamientos —el
    // ejemplo del patrón y el del recibo— y se comparan campo por campo con el
    // que el motor acaba de escribir: si el registro gana un campo, el ejemplo
    // deja de describirlo y esta prueba lo dice.
    const bloques = [...referencia.matchAll(/```json\n([\s\S]*?)```/g)]
      .map((bloque) => JSON.parse(bloque[1] as string) as Record<string, unknown>)
      .filter((bloque) => Array.isArray(bloque["escalations"]));

    expect(bloques.length, "la referencia no publica ningún ejemplo de escalamiento").toBeGreaterThan(0);
    for (const bloque of bloques) {
      const ejemplo = (bloque["escalations"] as Record<string, unknown>[])[0];
      expect(ejemplo).toBeDefined();
      expect(Object.keys(ejemplo as object).sort()).toEqual(campos);
    }
  });
});

describe("las superficies que enumeran evaluadores", () => {
  it("la ayuda del CLI declara la cascada en `--evaluator`", () => {
    expect(lineaQueEnumera(USAGE)).toBeDefined();
  });

  it("la referencia de comandos del manual declara la cascada en `valmen gate --evaluator`", () => {
    expect(lineaQueEnumera(manual)).toBeDefined();
  });
});
