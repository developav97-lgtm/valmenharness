/**
 * El periodo en sombra de la QA por agente (R-QAAG-008).
 *
 * La promoción la decide una persona y solo con evidencia: 20 tickets en los que el veredicto del
 * agente coincide con lo que el responsable decidió, sin una sola discrepancia. En sombra el cierre
 * por política se niega; volver a sombra es un cambio de configuración.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { qaPromoteCommand, qaShadowCommand } from "../packages/cli/src/commands.js";
import {
  cerrarQaPorPolitica,
  concordanciaEnSombra,
  leerPromociones,
  modoEfectivoDeQaAgent,
  promoverQaAgent,
  qaPromotionsPath,
  registrarReciboQaAgent,
  type ReciboQaAgent,
} from "../packages/engine/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const AHORA = new Date("2026-10-07T08:00:00.000Z");
const HASH = `sha256:${"a".repeat(64)}`;

let root: string;
const paths = () => ({ root, ticketsDir: "tickets" });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-sombra-"));
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(root, ".valmen", "config.yaml"), "name: Demo\n", "utf8");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const id = (n: number): string => `BUGFIX-POS-SOMBRA${String(n).padStart(2, "0")}-20261005`;

/** Un ticket con un recibo de qa-agent y, si se pide, un ciclo de QA cerrado por una persona (o por política). */
function ticketEnSombra(n: number, agente: "approve" | "block", responsable: "approved" | "changes_requested" | "ninguno", porPolitica = false): void {
  const ticketId = id(n);
  writeFixtureTicket(root, { id: ticketId, workflowStatus: "awaiting_user_tests", type: "BUGFIX", module: "POS" });
  if (responsable !== "ninguno") {
    const ruta = join(root, "tickets", "2026", ticketId, "ticket.md");
    const confirmacion = porPolitica ? `policy:QAA-20261007-abc123:${HASH}|recibo:.valmen/qa/agent-receipts.jsonl:1` : "Resultado del PO: lo probé";
    const ciclo = [
      { id: "QA-001", date: "2026-10-07", build_reference: `commit:${"b".repeat(40)}`, environment: "local", result: "pending", findings: [], correction: null, po_confirmation: null },
      { id: "QA-002", date: "2026-10-07", build_reference: null, environment: null, result: responsable, findings: [], correction: null, po_confirmation: confirmacion },
    ];
    const texto = readFileSync(ruta, "utf8").replace("## QA\n\n```json\n[]\n```", `## QA\n\n\`\`\`json\n${JSON.stringify(ciclo, null, 2)}\n\`\`\``);
    writeFileSync(ruta, texto, "utf8");
  }
  const recibo: ReciboQaAgent = {
    kind: "qa-agent-receipt", ticketId, base: "c".repeat(40), delivered: "d".repeat(40), treeHash: "e".repeat(40), verdict: agente,
    reasons: [], commands: [], resultadoContraBase: "no-aplica", authorization: null, at: AHORA.toISOString(),
  };
  registrarReciboQaAgent(root, recibo);
}

const concordantes = (cuantos: number, desde = 1): void => {
  for (let i = 0; i < cuantos; i++) {
    const n = desde + i;
    // Mezcla: la mayoría aprueba y algunos son devueltos por el responsable, y el agente también los bloqueó.
    if (n % 7 === 0) ticketEnSombra(n, "block", "changes_requested");
    else ticketEnSombra(n, "approve", "approved");
  }
};

const promover = (extra: Record<string, unknown> = {}) =>
  promoverQaAgent({ paths: paths(), actor: "Juan Andrade", quote: "Promuevo la QA por agente: coincidió 20 veces", ahora: AHORA, env: {}, ...extra });

describe("la promoción", () => {
  it("con 20 tickets concordantes se registra con la lista de tickets como evidencia", () => {
    concordantes(20);
    const p = promover();
    expect(p.evidence.total).toBe(20);
    expect(p.evidence.tickets).toHaveLength(20);
    expect(p.evidence.tickets).toContain(id(7));
    expect(leerPromociones(root)).toHaveLength(1);
    expect(leerPromociones(root)[0]).toMatchObject({ actor: "Juan Andrade", quote: "Promuevo la QA por agente: coincidió 20 veces" });
  });

  it("con 19 concordantes y uno donde el responsable pidió cambios y el agente aprobó, se rechaza y lo muestra", () => {
    concordantes(19);
    ticketEnSombra(20, "approve", "changes_requested");
    expect(() => promover()).toThrow(new RegExp(`${id(20)}.*agente approve, responsable changes_requested`));
    expect(leerPromociones(root)).toHaveLength(0);
  });

  it("al revés también es discrepancia: el agente bloqueó y el responsable aprobó", () => {
    concordantes(19);
    ticketEnSombra(20, "block", "approved");
    expect(concordanciaEnSombra(paths()).discordantes.map((d) => d.ticketId)).toEqual([id(20)]);
  });

  it("con menos de 20 se rechaza diciendo cuántos faltan", () => {
    concordantes(5);
    expect(() => promover()).toThrow(/hay 5 ticket\(s\) comparados y hacen falta 20 \(faltan 15\)/);
  });

  it("un ticket sin decisión del responsable, o cerrado por política, no cuenta", () => {
    concordantes(18);
    ticketEnSombra(19, "approve", "ninguno");
    ticketEnSombra(20, "approve", "approved", true);
    const { comparaciones } = concordanciaEnSombra(paths());
    expect(comparaciones).toHaveLength(18);
    expect(() => promover()).toThrow(/faltan 2/);
  });

  it("solo la registra una persona: una sesión desatendida no puede, ni sin frase", () => {
    concordantes(20);
    expect(() => promover({ env: { VALMEN_UNATTENDED: "1" } })).toThrow(/desatendida/);
    expect(() => promover({ quote: "  " })).toThrow(/frase literal/);
    expect(() => promover({ actor: "" })).toThrow(/responsable/);
    expect(leerPromociones(root)).toHaveLength(0);
  });
});

describe("el modo efectivo", () => {
  const config = (modo: string | null): void =>
    writeFileSync(join(root, ".valmen", "config.yaml"), ["name: Demo", ...(modo === null ? [] : ["qa-agent:", `  mode: ${modo}`]), ""].join("\n"), "utf8");

  it("sin la clave está en sombra, y con `close` pero sin promoción también, diciendo qué falta", () => {
    expect(modoEfectivoDeQaAgent(paths())).toEqual({ modo: "shadow", motivo: "qa-agent.mode no es close y no hay una promoción registrada" });
    config("close");
    expect(modoEfectivoDeQaAgent(paths())).toEqual({ modo: "shadow", motivo: "no hay una promoción registrada" });
  });

  it("con `close` y una promoción puede cerrar; volver a `shadow` en la configuración lo detiene sin tocar el registro", () => {
    concordantes(20);
    promover();
    config("close");
    expect(modoEfectivoDeQaAgent(paths())).toEqual({ modo: "close", motivo: null });
    const antes = readFileSync(qaPromotionsPath(root), "utf8");
    config("shadow");
    expect(modoEfectivoDeQaAgent(paths()).modo).toBe("shadow");
    expect(readFileSync(qaPromotionsPath(root), "utf8")).toBe(antes);
  });

  it("un valor inválido se trata como sombra (el defecto seguro)", () => {
    config("abierto");
    expect(modoEfectivoDeQaAgent(paths()).modo).toBe("shadow");
  });

  it("en sombra el cierre por política se rechaza antes de escribir nada", () => {
    ticketEnSombra(1, "approve", "ninguno");
    expect(() => cerrarQaPorPolitica({ paths: paths(), ticketId: id(1), ahora: AHORA })).toThrow(/está en sombra/);
  });
});

describe("los comandos", () => {
  it("qa-shadow muestra el modo, el avance y cada ticket", () => {
    concordantes(3);
    ticketEnSombra(4, "approve", "changes_requested");
    const r = qaShadowCommand(paths());
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("modo efectivo: shadow");
    expect(r.stdout).toContain("Comparados: 4 de 20 · discrepancias: 1");
    expect(r.stdout).toContain(`✗ ${id(4)}`);
  });

  it("qa-promote rechaza sin evidencia y con frase vacía, y promueve con evidencia", () => {
    const sin = qaPromoteCommand(paths(), { actor: "Juan Andrade", quote: "Promuevo" });
    expect(sin.exitCode).not.toBe(0);
    expect(sin.stderr).toContain("faltan 20");
    concordantes(20);
    const con = qaPromoteCommand(paths(), { actor: "Juan Andrade", quote: "Promuevo con 20 coincidencias" });
    expect(con.exitCode).toBe(0);
    expect(con.stdout).toContain("qa-agent.mode: close");
  });
});
