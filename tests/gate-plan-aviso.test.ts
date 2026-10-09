/**
 * El aviso de forma del gate de plan.
 *
 * Un criterio de aceptación se despliega como una proposición atómica —el
 * enunciado interpola su texto y nada más—, así que un criterio que junta varias
 * afirmaciones se resuelve a favor de «cubierto en parte» y cae en 0.87–0.89
 * contra un umbral de 0.90. El recibo decía `criterio_04 en banda de revisión` y
 * nada más, y eso manda a mirar el contenido del plan: no es ahí donde está el
 * problema.
 *
 * Lo que se afirma acá es que ese caso se distingue del hueco real, que el aviso
 * queda en el recibo, y que distinguirlo **no** cambia el veredicto ni relaja la
 * política. Un aviso que aprobara lo que la banda revisa sería la puerta de atrás
 * que R-S5-007 prohíbe.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TICKET_TEMPLATE } from "../packages/core/src/template.js";
import { runGate } from "../packages/engine/src/gate.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import {
  DEFAULT_POLICY,
  analizarFormaDeCriterios,
  type CriterionSpec,
} from "../packages/gate/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "IMPROVEMENT-GATE-AVISO-20260926";

let lab: string;

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

/** Un criterio, con lo que declara sobre cómo se verifica. */
function criterion(text: string): CriterionSpec {
  return { text, command: null, manual: true };
}

/**
 * Un evaluador que responde siempre lo mismo.
 *
 * El aviso depende de la forma del criterio y de la banda, no del plan, así que
 * los números tienen que venir de afuera: dejarlos en manos del modelo convertiría
 * esta prueba en una medición del evaluador.
 */
function jevFijo(
  valores: Readonly<Record<string, number>>,
  clasificacion = "completo",
): NonNullable<Parameters<typeof runGate>[1]["jev"]> {
  return (async ({
    propositions,
  }: {
    propositions: readonly { id: string; kind: string }[];
  }) => ({
    answers: propositions.map((proposicion) =>
      proposicion.kind === "choice"
        ? { id: proposicion.id, kind: "choice" as const, choice: clasificacion }
        : proposicion.kind === "score"
          ? { id: proposicion.id, kind: "score" as const, score: 1 }
          : {
              id: proposicion.id,
              kind: "noul" as const,
              value: valores[proposicion.id] ?? 0.95,
            },
    ),
    model: { provider: "laboratorio", model: "jev-fijo", resolvedVersion: "jev-fijo" },
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    latencyMs: 1,
  })) as NonNullable<Parameters<typeof runGate>[1]["jev"]>;
}

/** El ticket del laboratorio, con los criterios que pida el test. */
function ticket(criterios: readonly string[]): void {
  const year = TICKET.slice(-8, -4);
  mkdirSync(join(lab, "tickets", year, TICKET), { recursive: true });
  writeFixtureTicket(lab, {
    id: TICKET,
    workflowStatus: "planned",
    plan: "- Pasos ordenados:\n  1. Tocar `packages/gate/src/criteria.ts`.\n- Rollback: revertir el commit del cambio.",
    criterios: criterios
      // `test:` y no `verify: manual`: un manual lo decide el código por su forma y su cita en el plan,
      // y este aviso explica la banda que deja el evaluador sobre lo que solo un modelo puede leer.
      .map((texto) => `- [ ] ${texto}\n      <!-- test: npx vitest run tests/gate-plan-aviso.test.ts -->`)
      .join("\n"),
  });
}

/** El último recibo escrito. */
function ultimoRecibo(): Record<string, unknown> {
  const recibos = readReceipts(PATHS(), TICKET) as unknown as Record<string, unknown>[];
  const ultimo = recibos[recibos.length - 1];
  if (ultimo === undefined) throw new Error("No se escribió ningún recibo.");
  return ultimo;
}

const ATOMICO = "analizarFormaDeCriterios cuenta las afirmaciones de un criterio";
const COMPUESTO = "El informe nombra el criterio y el recibo guarda el aviso";

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-aviso-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("la forma de un criterio, leída sin modelo", () => {
  it(ATOMICO, () => {
    const formas = analizarFormaDeCriterios([
      criterion("El endpoint rechaza cantidades negativas"),
      criterion("El endpoint guarda el saldo y el historial"),
      criterion("El informe sale con fecha; el recibo queda anexado"),
    ]);

    expect(formas[0]?.afirmaciones).toBe(1);
    expect(formas[0]?.compuesto).toBe(false);
    expect(formas[1]?.afirmaciones).toBe(2);
    expect(formas[1]?.compuesto).toBe(true);
    expect(formas[2]?.afirmaciones).toBe(2);
    expect(formas[2]?.compuesto).toBe(true);
  });

  it("numera los criterios como las proposiciones del gate", () => {
    const formas = analizarFormaDeCriterios([criterion("Uno"), criterion("Dos")]);
    expect(formas.map((forma: { index: number }) => forma.index)).toEqual([1, 2]);
  });

  it("marca compuesto un criterio que se pasa de largo aunque tenga una sola frase", () => {
    const formas = analizarFormaDeCriterios([
      criterion(`El plan ${"detalla ".repeat(50)}todo`),
    ]);
    expect(formas[0]?.compuesto).toBe(true);
  });
});

describe("el aviso, cuando la banda la causa la redacción", () => {
  it(COMPUESTO, async () => {
    ticket([
      "El endpoint rechaza cantidades negativas",
      "El endpoint guarda el saldo y el historial",
    ]);

    const resultado = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      evaluator: "jev",
      jev: jevFijo({ criterio_02: 0.6 }),
    });

    // El veredicto no se toca: el aviso explica la banda, no la despeja.
    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stdout).toContain("Forma de los criterios");
    expect(resultado.stdout).toContain("criterio_02");

    const recibo = ultimoRecibo();
    expect(recibo["outcome"]).toBe("review");
    const notas = recibo["notes"] as readonly string[];
    expect(notas.join(" ")).toContain("criterio_02");
    expect(notas.join(" ")).toContain("2 afirmaciones");
  });

  it("no avisa cuando el criterio en banda es atómico: ese hueco es real", async () => {
    ticket([
      "El endpoint rechaza cantidades negativas",
      "El endpoint guarda el saldo y el historial",
    ]);

    const resultado = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      evaluator: "jev",
      jev: jevFijo({ criterio_01: 0.6 }),
    });

    expect(resultado.stdout).not.toContain("Forma de los criterios");
    expect(ultimoRecibo()["notes"] ?? []).toEqual([]);
  });

  it("la compuerta no se relaja: la política conserva sus umbrales", async () => {
    expect(DEFAULT_POLICY.approveAt).toBe(0.9);
    expect(DEFAULT_POLICY.blockAt).toBe(0.1);

    ticket(["El endpoint guarda el saldo y el historial"]);

    const resultado = await runGate(PATHS(), {
      gateId: "plan",
      ticketId: TICKET,
      evaluator: "jev",
      jev: jevFijo({ criterio_01: 0.6 }),
    });

    const recibo = ultimoRecibo();
    expect(recibo["outcome"]).toBe("review");
    expect(recibo["policy"]).toEqual(DEFAULT_POLICY);
    expect(resultado.exitCode).not.toBe(0);
  });
});

describe("la plantilla, que es donde el criterio se escribe", () => {
  it("guía a un criterio por afirmación y a pasos que nombran archivo", () => {
    expect(TICKET_TEMPLATE).toContain("afirmación verificable por criterio");
    expect(TICKET_TEMPLATE).toContain("nombra archivo, símbolo o comando");
  });
});
