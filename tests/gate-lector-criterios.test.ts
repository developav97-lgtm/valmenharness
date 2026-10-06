/**
 * El lector de criterios: solo un ítem de lista es un criterio, y ninguno se pierde.
 *
 * R-CDEF-001 y R-CDEF-002 de la feature autonomia-confiable. El lector tomaba como
 * criterio toda línea de 12 caracteres o más —el comentario de la plantilla
 * incluido— y después cortaba en 12, así que los criterios falsos consumían el
 * cupo de los reales. Los vectores son recibos que ocurrieron: la sección que
 * evaluaron, no una reconstrucción de lo que podría haber pasado.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runGate } from "../packages/engine/src/gate.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import { MAX_CRITERIA_PROPOSITIONS, extractCriteriaSpecs } from "../packages/gate/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

interface VectorDeRecibo {
  readonly ticket: string;
  readonly comentario: readonly string[];
  readonly criterios: readonly string[];
  readonly seccion: string;
}

const VECTORES = JSON.parse(
  readFileSync(new URL("./fixtures/lector-criterios-recibos.json", import.meta.url), "utf8"),
) as {
  readonly recibos: readonly VectorDeRecibo[];
  readonly skills: { readonly ticket: string; readonly seccion: string };
};

/** El comentario de la plantilla tal como lo evaluó el recibo de BUGFIX-GATE-CONTRADICCION-ANALYSIS. */
const PLANTILLA = (VECTORES.recibos[0] as VectorDeRecibo).comentario.join("\n");

const TICKET = "BUGFIX-GATE-LECTOR-LAB-20261005";

let lab: string;

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-lector-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** `n` viñetas distintas, con la anotación que las declara verificadas a mano. */
function viñetas(n: number): string {
  return Array.from(
    { length: n },
    (_, i) =>
      `- [ ] El criterio número ${String(i + 1).padStart(2, "0")} describe un resultado observable\n` +
      "      <!-- verify: manual -->",
  ).join("\n");
}

/**
 * Un juez de Jev que cuenta sus llamadas y responde siempre bien.
 *
 * Los números vienen de afuera: lo que se mide es qué proposiciones llegan y en
 * cuántas llamadas, no la calidad del plan.
 */
function jevContador(llamadas: string[][]): NonNullable<Parameters<typeof runGate>[1]["jev"]> {
  return (async ({ propositions }: { propositions: readonly { id: string; kind: string }[] }) => {
    llamadas.push(propositions.map((proposicion) => proposicion.id));
    return {
      answers: propositions.map((proposicion) =>
        proposicion.kind === "choice"
          ? { id: proposicion.id, kind: "choice" as const, choice: "completo" }
          : proposicion.kind === "score"
            ? { id: proposicion.id, kind: "score" as const, score: 1 }
            : { id: proposicion.id, kind: "noul" as const, value: 0.95 },
      ),
      model: { provider: "laboratorio", model: "jev-fijo", resolvedVersion: "jev-fijo" },
      usage: { inputTokens: 10, outputTokens: 1, costUsd: 0.5 },
      latencyMs: 1,
    };
  }) as NonNullable<Parameters<typeof runGate>[1]["jev"]>;
}

function ultimoRecibo(): Record<string, unknown> {
  const recibos = readReceipts(PATHS(), TICKET) as unknown as Record<string, unknown>[];
  const ultimo = recibos[recibos.length - 1];
  if (ultimo === undefined) throw new Error("No se escribió ningún recibo.");
  return ultimo;
}

function idsDeCriterio(recibo: Record<string, unknown>): string[] {
  return (recibo["propositions"] as readonly { id: string }[])
    .map((proposicion) => proposicion.id)
    .filter((id) => id.startsWith("criterio_"));
}

describe("lector de criterios (R-CDEF-001)", () => {
  it("R-CDEF-001 plantilla: un comentario de varias líneas no es criterio", () => {
    const specs = extractCriteriaSpecs(
      `${PLANTILLA}\n\n- [ ] El primer criterio declarado con viñeta\n- [ ] El segundo criterio declarado con viñeta`,
    );

    expect(specs.map((spec) => spec.text)).toEqual([
      "El primer criterio declarado con viñeta",
      "El segundo criterio declarado con viñeta",
    ]);
  });

  it("R-CDEF-001 recibos reales: ninguna línea del comentario entra y cada viñeta sí", () => {
    expect(VECTORES.recibos).toHaveLength(6);
    for (const vector of VECTORES.recibos) {
      const textos = extractCriteriaSpecs(vector.seccion).map((spec) => spec.text);

      expect(textos, vector.ticket).toEqual(vector.criterios);
      for (const linea of vector.comentario) {
        expect(textos, `${vector.ticket}: «${linea}»`).not.toContain(linea);
      }
    }
  });

  it("R-CDEF-001 continuación: lo pegado a una viñeta se une a ella; tras una línea en blanco no es criterio", () => {
    const specs = extractCriteriaSpecs(
      [
        "- [ ] El visor se inicia localmente con doble clic y escucha solo en",
        "  `127.0.0.1`.",
        "- [ ] Permite filtrar tickets cerrados por fecha, tipo y texto, tomando la",
        "  fecha del último cierre.",
        "",
        "Un párrafo suelto que sigue a una línea en blanco no es un criterio.",
      ].join("\n"),
    );

    expect(specs.map((spec) => spec.text)).toEqual([
      "El visor se inicia localmente con doble clic y escucha solo en `127.0.0.1`.",
      "Permite filtrar tickets cerrados por fecha, tipo y texto, tomando la fecha del último cierre.",
    ]);
  });

  it("R-CDEF-001 anotaciones: se asocian en la misma línea, en la de abajo y repartidas en dos", () => {
    const specs = extractCriteriaSpecs(
      [
        '- [ ] Un criterio con su comando en la misma línea <!-- test: node -e "process.exit(0)" -->',
        "- [ ] Un criterio con su anotación en la línea de abajo",
        "      <!-- verify: manual -->",
        "- [ ] Un criterio con su comando repartido en dos líneas",
        '      <!-- test: node -e',
        '            "process.exit(0)" -->',
        "- [ ] Un criterio sin ninguna anotación declarada",
      ].join("\n"),
    );

    expect(specs).toHaveLength(4);
    expect(specs[0]).toMatchObject({
      text: "Un criterio con su comando en la misma línea",
      command: 'node -e "process.exit(0)"',
    });
    expect(specs[1]).toMatchObject({ manual: true, command: null });
    expect(specs[2]).toMatchObject({
      text: "Un criterio con su comando repartido en dos líneas",
      command: 'node -e "process.exit(0)"',
    });
    expect(specs[3]).toMatchObject({ manual: false, command: null });
  });

  it("R-CDEF-001 recibo del plan: la plantilla y dos viñetas dan solo criterio_01 y criterio_02", async () => {
    writeFixtureTicket(lab, {
      id: TICKET,
      workflowStatus: "planned",
      plan: "- Pasos ordenados:\n  1. Tocar `packages/gate/src/dynamic.ts`.",
      criterios: `${PLANTILLA}\n\n${viñetas(2)}`,
    });
    const llamadas: string[][] = [];

    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      evaluator: "jev",
      jev: jevContador(llamadas),
    });

    expect(idsDeCriterio(ultimoRecibo())).toEqual(["criterio_01", "criterio_02"]);
  });
});

describe("más criterios que el tope (R-CDEF-002)", () => {
  it("R-CDEF-002 sin recorte: 31 viñetas son 31 criterios, y las 13 de IMPROVEMENT-SKILLS-PUBLICADAS también", () => {
    expect(extractCriteriaSpecs(viñetas(31))).toHaveLength(31);

    // El recibo real evaluó 12 (3 falsos y 9 reales) de los 13 que el ticket declara.
    expect(VECTORES.skills.ticket).toBe("IMPROVEMENT-SKILLS-PUBLICADAS-20260926");
    expect(extractCriteriaSpecs(VECTORES.skills.seccion)).toHaveLength(13);
  });

  it("R-CDEF-002 nota de tandas: con 31 criterios el plan los evalúa todos y el recibo lo dice", async () => {
    writeFixtureTicket(lab, {
      id: TICKET,
      workflowStatus: "planned",
      plan: "- Pasos ordenados:\n  1. Tocar `packages/gate/src/dynamic.ts`.",
      criterios: viñetas(31),
    });
    const llamadas: string[][] = [];

    await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      evaluator: "jev",
      jev: jevContador(llamadas),
    });

    const recibo = ultimoRecibo();
    const ids = idsDeCriterio(recibo);
    expect(ids).toHaveLength(31);
    expect(ids[30]).toBe("criterio_31");
    expect(llamadas).toHaveLength(3);
    for (const llamada of llamadas) {
      expect(llamada.filter((id) => id.startsWith("criterio_")).length).toBeLessThanOrEqual(
        MAX_CRITERIA_PROPOSITIONS,
      );
    }
    expect((recibo["notes"] as readonly string[]).join(" ")).toContain(
      `31 criterios evaluados en 3 tandas de hasta ${MAX_CRITERIA_PROPOSITIONS}`,
    );
  });
});
