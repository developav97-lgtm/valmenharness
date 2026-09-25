/**
 * El valor por ticket.
 *
 * Lo que se afirma acá no es el formato de una tabla: es que las cuentas digan la
 * verdad cuando el dato es incómodo.
 *
 * 1. **Un coste desconocido no es un cero.** Un proveedor por suscripción no tiene
 *    coste por token. Sumarlo como cero haría que el ticket más trabajado
 *    pareciera el más barato, así que se cuenta aparte y la fila lo dice.
 * 2. **Las vueltas atrás se leen de los eventos**, no del estado: el estado dice
 *    dónde está el ticket, no cuántas veces volvió.
 * 3. **El rango es por fecha de cierre**, no por última edición —la misma
 *    discusión que en el reporte de cierres—.
 *
 * Se corre sobre los 57 tickets cerrados del fixture, que son tickets reales con
 * sus ciclos, sus eventos y sus cierres, más los recibos y el consumo que este
 * test escribe con las funciones del motor.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addAiUsage } from "../packages/engine/src/append.js";
import type { RegistryPaths } from "../packages/engine/src/discovery.js";
import { ticketValueReport, renderValue } from "../packages/engine/src/value.js";
import { dispatch, parseArgs } from "../packages/cli/src/main.js";

let lab: string;

const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });

/** Un ticket cerrado del fixture, con dos ciclos de QA y una vuelta atrás. */
const CON_VUELTAS = "BUGFIX-RESTAURANTE-CAJA-USUARIOS-CONSECUTIVOS-20260903";
/** Un ticket cerrado y publicado. */
const PUBLICADO = "BUGFIX-ADMIN-USERS-PERMISOS-TERCEROS-POS-20260828";

/** El rango que cubre todo el fixture: del 26 de agosto al 18 de septiembre. */
const TODO = { desde: "2026-08-01", hasta: "2026-09-30" };

/**
 * Escribe un recibo de compuerta.
 *
 * Se escribe a mano y no evaluando una compuerta de verdad: lo que este informe
 * lee de un recibo es su veredicto, su coste y su decisión humana, y evaluar de
 * verdad costaría una llamada a un proveedor para probar una suma.
 */
function recibo(
  id: string,
  ticketId: string,
  opciones: {
    readonly gate?: string;
    readonly outcome?: string;
    readonly costUsd?: number;
    readonly byCode?: boolean;
    readonly humanDecision?: "approve" | "reject";
    readonly decidedAt?: string;
  } = {},
): void {
  const directorio = join(lab, ".valmen", "receipts");
  mkdirSync(directorio, { recursive: true });
  const linea = {
    kind: "gate-receipt",
    receiptVersion: 1,
    schemaVersion: "1",
    id,
    gate: opciones.gate ?? "analysis",
    gateHash: "hash",
    subject: { kind: "ticket", id: ticketId },
    outcome: opciones.outcome ?? "approve",
    reason: "prueba",
    actor: opciones.byCode === true ? "code" : "model",
    decidedAt: opciones.decidedAt ?? "2026-09-03T10:00:00Z",
    stateHash: "hash",
    policy: {},
    mechanicalChecks: [],
    modelAnswers: [],
    propositions: [],
    model:
      opciones.byCode === true
        ? null
        : { provider: "falso", model: "falso", resolvedVersion: "falso@1" },
    usage: { inputTokens: 10, outputTokens: 5, costUsd: opciones.costUsd ?? 0 },
    latencyMs: 10,
    escalatedTo: opciones.humanDecision === undefined ? null : "human",
    humanDecision:
      opciones.humanDecision === undefined
        ? null
        : {
            actor: "el responsable",
            decision: opciones.humanDecision,
            reason: "prueba",
            channel: "panel",
            decidedAt: "2026-09-03T11:00:00Z",
          },
  };
  writeFileSync(join(directorio, `${ticketId}.jsonl`), `${JSON.stringify(linea)}\n`, {
    flag: "a",
  });
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-valor-"));
  cpSync(
    join(import.meta.dirname, "fixtures", "saicloud", "tickets"),
    join(lab, "tickets"),
    {
      recursive: true,
    },
  );
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("el valor de cada ticket", () => {
  it("toma los tickets cerrados en el rango, por fecha de cierre", () => {
    const informe = ticketValueReport(PATHS(), TODO);
    expect(informe.tickets).toHaveLength(57);

    // Un rango de un solo día deja solo los cerrados ese día, y el total no se
    // queda con el coste de los de fuera.
    const unDia = ticketValueReport(PATHS(), { desde: "2026-08-28", hasta: "2026-08-28" });
    expect(unDia.tickets.length).toBeGreaterThan(0);
    expect(unDia.tickets.every((t) => t.closedOn === "2026-08-28")).toBe(true);
    expect(unDia.totalUsd).toBeLessThanOrEqual(informe.totalUsd);
  });

  it("suma los recibos de compuerta y el consumo que el ticket registró", () => {
    recibo("GR-1", CON_VUELTAS, { costUsd: 0.25, decidedAt: "2026-09-03T10:00:00Z" });
    addAiUsage({
      paths: PATHS(),
      ticketId: CON_VUELTAS,
      source: "opencode:/tmp/home/.local/share/opencode/opencode.db",
      confidence: "high",
      sessionReference: "sesion-1",
      estimatedCostUsd: "1.50",
      now: () => new Date("2026-09-03T12:00:00Z"),
    });

    const ticket = ticketValueReport(PATHS(), TODO).tickets.find(
      (fila) => fila.ticketId === CON_VUELTAS,
    );
    expect(ticket?.harnessUsd).toBeCloseTo(0.25, 6);
    expect(ticket?.sessionsUsd).toBeCloseTo(1.5, 6);
    expect(ticket?.knownUsd).toBeCloseTo(1.75, 6);
    expect(ticket?.partial).toBe(false);
  });

  it("un coste desconocido no se suma como cero: la fila lo marca", () => {
    // Es el caso del proveedor por suscripción: hay sesión y hay tokens, pero no
    // hay coste. Contarlo como cero dejaría el ticket más trabajado como el más
    // barato, que es exactamente el dato que el informe existe para dar.
    addAiUsage({
      paths: PATHS(),
      ticketId: PUBLICADO,
      source: "codex:sesion-suscripcion",
      confidence: "high",
      sessionReference: "sesion-suscripcion",
      inputTokens: "1000",
      now: () => new Date("2026-08-28T12:00:00Z"),
    });

    const informe = ticketValueReport(PATHS(), TODO);
    const ticket = informe.tickets.find((fila) => fila.ticketId === PUBLICADO);
    expect(ticket?.sessionsUnknown).toBe(1);
    expect(ticket?.partial).toBe(true);
    expect(ticket?.knownUsd).toBe(0);
    expect(informe.partial).toContain(PUBLICADO);
    expect(renderValue(informe)).toContain("coste parcial");
  });

  it("cuenta las aprobaciones en código y las que una persona revirtió", () => {
    // El único número que mide si el gate automático se equivoca a favor.
    recibo("GR-2", CON_VUELTAS, { byCode: true, outcome: "approve" });
    recibo("GR-3", PUBLICADO, {
      byCode: true,
      outcome: "approve",
      humanDecision: "reject",
    });

    const informe = ticketValueReport(PATHS(), TODO);
    expect(informe.byCode).toBe(2);
    expect(informe.reversedByHuman).toBe(1);
    expect(renderValue(informe)).toContain("1 revertida(s) por una persona ⚠");
  });

  it("cuenta las vueltas atrás de los eventos, no del estado", () => {
    const ticket = ticketValueReport(PATHS(), TODO).tickets.find(
      (fila) => fila.ticketId === CON_VUELTAS,
    );
    // El fixture trae este ticket con una devolución de QA y una reapertura.
    expect(ticket?.returns).toBeGreaterThanOrEqual(2);
    expect(ticket?.qaCycles).toBeGreaterThanOrEqual(2);
  });

  it("el ticket que volvió atrás más de una vez se destaca", () => {
    const informe = ticketValueReport(PATHS(), TODO);
    expect(informe.withReturns.length).toBeGreaterThan(0);
    const texto = renderValue(informe);
    expect(texto).toContain("Vueltas atrás");
    expect(texto).toContain("revisar la calidad del análisis");
    expect(texto).toContain("⚠");
  });

  it("ordena por coste: arriba queda el que hay que mirar", () => {
    recibo("GR-4", CON_VUELTAS, { costUsd: 9 });
    const informe = ticketValueReport(PATHS(), TODO);
    expect(informe.tickets[0]?.ticketId).toBe(CON_VUELTAS);
  });

  it("sin tickets cerrados lo dice, en vez de devolver una tabla vacía", () => {
    const informe = ticketValueReport(PATHS(), { desde: "2030-01-01" });
    expect(informe.tickets).toEqual([]);
    expect(informe.meanUsd).toBeNull();
    expect(renderValue(informe)).toContain("No hay tickets cerrados en este rango");
  });

  it("el corte de filas se dice, para que nadie crea que hay veinte tickets", () => {
    const texto = renderValue(ticketValueReport(PATHS(), TODO), { limite: 5 });
    expect(texto).toContain("y 52 ticket(s) más");
  });
});

describe("el comando", () => {
  it("`usage value` imprime el informe y sale con cero", async () => {
    recibo("GR-5", CON_VUELTAS, { costUsd: 1 });
    const opciones = parseArgs(["usage", "value", "--root", lab, "--limite", "5"]);
    const resultado = await dispatch(opciones);

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("Valor por ticket");
    expect(resultado.stdout).toContain(CON_VUELTAS);
    expect(resultado.stdout).toContain("y 52 ticket(s) más");
  });

  it("`usage` sin verbo sigue siendo el consumo agregado", async () => {
    const resultado = await dispatch(parseArgs(["usage", "--root", lab]));
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("Consumo del harness");
  });

  it("un verbo que no existe se rechaza con su código, no con silencio", async () => {
    const resultado = await dispatch(parseArgs(["usage", "inventado", "--root", lab]));
    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stderr).toContain("value");
  });
});
