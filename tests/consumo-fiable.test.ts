/**
 * El consumo de una sesión no se cuenta dos veces (R-CTRL-005, R-CTRL-006).
 *
 * Una sesión con números es de un ticket; cargarla completa a dos suma su costo dos
 * veces, y el informe de valor lo repetiría. Lo que se afirma:
 *
 * 1. Registrar con números una sesión que otro ticket ya tiene se rechaza y dice cómo
 *    declarar una sesión compartida. Sin números, o con `manual:`, se acepta.
 * 2. El informe de valor cuenta una vez cada sesión con números y señala la duplicación del
 *    histórico, sin reescribirlo.
 * 3. Una sesión sin costo lleva la marca de suscripción o de desconocido y nunca suma cero.
 *
 * (La foto automática del cierre declara compartida una sesión ajena: `timeline.test.ts`.)
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addAiUsage, sessionNumbersOwner } from "../packages/engine/src/append.js";
import { renderValue, ticketValueReport } from "../packages/engine/src/value.js";
import { marcaDeCosto } from "../packages/server/src/timeline.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const BASE = readFileSync(new URL("./fixtures/ticket-cerrado-con-criterios.md", import.meta.url), "utf8");
const ID_BASE = "BUGFIX-GATE-CONTRADICCION-DESCRIPTIVA-20261005";
const UNO = "BUGFIX-POS-UNO-20260921";
const DOS = "BUGFIX-POS-DOS-20260921";
const SESION = "9d55ce3b-5c13-4e93-af45-77a4977bd5c6";

let lab: string;
const PATHS = (): { root: string; ticketsDir: string } => ({ root: lab, ticketsDir: "tickets" });

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-consumo-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});
afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

const conNumeros = (ticketId: string, referencia: string = SESION) =>
  addAiUsage({
    paths: PATHS(),
    ticketId,
    source: `claude:${referencia}`,
    confidence: "high",
    sessionReference: referencia,
    model: "anthropic/claude-sonnet-5-5",
    inputTokens: "3030",
    outputTokens: "1000",
    totalTokens: "4030",
    estimatedCostUsd: "2.500000",
  });

describe("registrar consumo con una sesión que ya tiene números", () => {
  beforeEach(() => {
    writeFixtureTicket(lab, { id: UNO });
    writeFixtureTicket(lab, { id: DOS });
  });

  it("se rechaza en otro ticket nombrando al dueño y diciendo cómo declararla compartida", () => {
    conNumeros(UNO);
    expect(sessionNumbersOwner(PATHS(), SESION, DOS)).toBe(UNO);
    expect(() => conNumeros(DOS)).toThrow(UNO);
    expect(() => conNumeros(DOS)).toThrow("`manual:` y sin números");
    // El segundo ticket no recibió nada.
    expect(readFileSync(join(lab, "tickets", "2026", DOS, "ticket.md"), "utf8")).not.toContain(SESION);
  });

  it("la misma sesión declarada sin números se acepta en el segundo ticket", () => {
    conNumeros(UNO);
    expect(() =>
      addAiUsage({
        paths: PATHS(),
        ticketId: DOS,
        source: `manual:${SESION}`,
        confidence: "medium",
        sessionReference: SESION,
        notes: "Sesión compartida con otro ticket; sus números están allí.",
      }),
    ).not.toThrow();
    expect(sessionNumbersOwner(PATHS(), SESION, UNO)).toBeNull();
  });

  it("cargarla otra vez al mismo ticket no la rechaza esta regla", () => {
    conNumeros(UNO);
    expect(sessionNumbersOwner(PATHS(), SESION, UNO)).toBeNull();
  });

  it("una corrida de proceso reparte su gasto entre tickets a propósito y no se rechaza", () => {
    const repartida = (ticketId: string) =>
      addAiUsage({
        paths: PATHS(),
        ticketId,
        source: "process:revision",
        confidence: "high",
        sessionReference: "RUN-1",
        totalTokens: "500",
        estimatedCostUsd: "0.100000",
        notes: "Imputado en partes iguales entre 2 ticket(s).",
      });
    repartida(UNO);
    expect(() => repartida(DOS)).not.toThrow();
  });
});

describe("el informe de valor cuenta una vez cada sesión", () => {
  /** Un ticket ya cerrado, copiado del real y con otro identificador. */
  function cerrado(id: string): void {
    mkdirSync(join(lab, "tickets", "2026", id), { recursive: true });
    writeFileSync(
      join(lab, "tickets", "2026", id, "ticket.md"),
      BASE.replaceAll(ID_BASE, id),
      "utf8",
    );
  }
  const IDS = ["BUGFIX-GATE-AAA-20261005", "BUGFIX-GATE-BBB-20261005"] as const;

  /** Escribe el consumo duplicado a mano, como lo dejó el histórico antes de la regla. */
  function cargarDirecto(id: string, costo: string, referencia: string): void {
    const ruta = join(lab, "tickets", "2026", id, "ticket.md");
    const texto = readFileSync(ruta, "utf8");
    writeFileSync(
      ruta,
      texto.replace(
        /(## Consumo de IA\n\n```json\n)([\s\S]*?)(\n```)/,
        (_todo, abre: string, cuerpo: string, cierra: string) => {
          const entradas = JSON.parse(cuerpo) as Record<string, unknown>[];
          entradas.push({
            kind: "ai-usage",
            date: "2026-10-06",
            session_reference: referencia,
            model: "anthropic/claude-sonnet-5-5",
            reasoning_effort: null,
            notes: "x",
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
            estimated_cost_usd: Number(costo),
            source: `claude:${referencia}`,
            confidence: "high",
            id: `CONSUMO-${String(entradas.length + 1).padStart(3, "0")}`,
          });
          return `${abre}${JSON.stringify(entradas, null, 2)}${cierra}`;
        },
      ),
      "utf8",
    );
  }

  beforeEach(() => {
    for (const id of IDS) cerrado(id);
  });

  it("suma una sola vez la sesión duplicada y la señala con sus tickets", () => {
    for (const id of IDS) cargarDirecto(id, "2.5", SESION);

    const informe = ticketValueReport(PATHS());

    // La sesión valió $2.50 y estaba en dos tickets: suma $2.50, no $5.
    expect(informe.totalUsd).toBeCloseTo(2.5, 6);
    expect(informe.duplicatedSessions).toEqual([{ session: SESION, tickets: [...IDS] }]);
    const texto = renderValue(informe);
    expect(texto).toContain("1 sesión(es) con números cargadas a más de un ticket");
    expect(texto).toContain(`${SESION}: ${IDS.join(", ")}`);
  });

  it("sin duplicados no señala nada y suma cada sesión", () => {
    cargarDirecto(IDS[0], "2.5", SESION);
    cargarDirecto(IDS[1], "1.5", "otra-sesion");

    const informe = ticketValueReport(PATHS());

    expect(informe.totalUsd).toBeCloseTo(4.0, 6);
    expect(informe.duplicatedSessions).toEqual([]);
    expect(renderValue(informe)).not.toContain("más de un ticket");
  });
});

describe("el costo que el origen no declara", () => {
  it("marca suscripción para Codex y Claude Code, y desconocido para lo demás", () => {
    expect(marcaDeCosto({ source: "codex" })).toBe("suscripción");
    expect(marcaDeCosto({ source: "claude" })).toBe("suscripción");
    expect(marcaDeCosto({ source: "hermes" })).toBe("desconocido");
    expect(marcaDeCosto({ source: "opencode" })).toBe("desconocido");
  });

  it("una entrada sin costo queda con el campo en null y no suma cero en el informe", () => {
    const id = "BUGFIX-GATE-CCC-20261005";
    mkdirSync(join(lab, "tickets", "2026", id), { recursive: true });
    writeFileSync(join(lab, "tickets", "2026", id, "ticket.md"), BASE.replaceAll(ID_BASE, id), "utf8");
    addAiUsage({
      paths: PATHS(),
      ticketId: id,
      source: "codex:sesion-sin-costo",
      confidence: "high",
      sessionReference: "sesion-sin-costo",
      totalTokens: "100",
      notes: "Costo: suscripción; no es cero.",
    });

    const informe = ticketValueReport(PATHS());
    const fila = informe.tickets.find((t) => t.ticketId === id);

    // El costo ausente no suma, y el ticket se marca como parcial (`?`) en vez de «gratis».
    expect(fila?.partial).toBe(true);
    expect(fila?.sessionsUnknown).toBeGreaterThan(0);
    expect(informe.partial).toContain(id);
  });
});
