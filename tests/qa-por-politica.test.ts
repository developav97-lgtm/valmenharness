/**
 * La compuerta `qa-agent`: prueba en un worktree limpio, con la configuración del commit base.
 *
 * Usa repositorios git de verdad y comandos de verdad (`node`): lo que se afirma es justamente que
 * el árbol donde se prueba no es el del agente, así que un simulacro no probaría nada.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pendientesDeAvisar } from "../packages/cli/src/hermes.js";
import { qaPolicyCloseCommand } from "../packages/cli/src/commands.js";
import {
  cerrarQaPorPolitica,
  correrQaAgent,
  cupoRestante,
  leerAutorizaciones,
  motivoDeCierrePorPoliticaInvalido,
  qaClose,
  registrarUsoDeCupo,
  renderPolicyCloseNotification,
  revocarAutorizacion,
  crearAutorizacion,
} from "../packages/engine/src/index.js";
import { parsePolicyConfirmation, parseTicket } from "../packages/core/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const AHORA = new Date("2026-10-06T08:00:00.000Z");
const ID = "BUGFIX-POS-QAAGENT-20261005";
const CRITERIO = '- [ ] El valor corregido es el esperado.\n      <!-- test: node tests/bug.test.mjs -->';

let root: string;
const paths = () => ({ root, ticketsDir: "tickets" });

const git = (...args: string[]): string =>
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root, encoding: "utf8" }).trim();

function escribir(ruta: string, contenido: string): void {
  mkdirSync(dirname(join(root, ruta)), { recursive: true });
  writeFileSync(join(root, ruta), contenido, "utf8");
}

const CONFIG = [
  "name: Demo",
  "test-commands:",
  "  - node",
  "test-timeout: 20",
  "qa-agent:",
  "  mode: close",
  "  regression-commands:",
  "    - node scripts/regresion.mjs",
  "",
].join("\n");

/** Los archivos que cita el ticket de ejemplo: `valmen drift` exige que existan. */
function citados(): void {
  escribir("BackEnd/pos/filters.py", "class OrderFilter:\n    number = None\n");
  escribir("BackEnd/pos/tests/test_filters.py", "x = 1\n");
}

/** Un repositorio con un defecto (`valor.txt` = viejo) y una regresión que pasa. */
function repo(config = CONFIG): { base: string; delivered: string } {
  mkdirSync(root, { recursive: true });
  git("init", "-q", "-b", "main");
  escribir(".valmen/config.yaml", config);
  escribir("src/valor.txt", "viejo\n");
  escribir("scripts/regresion.mjs", "process.exit(0);\n");
  citados();
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD");
  // La corrección y la prueba nueva que la reproduce.
  escribir("src/valor.txt", "nuevo\n");
  escribir(
    "tests/bug.test.mjs",
    'import { readFileSync } from "node:fs";\nprocess.exit(readFileSync("src/valor.txt", "utf8").trim() === "nuevo" ? 0 : 1);\n',
  );
  git("add", "-A");
  git("commit", "-q", "-m", "entrega");
  return { base, delivered: git("rev-parse", "HEAD") };
}

function ticket(criterios = CRITERIO, tipo = "BUGFIX"): string {
  return writeFixtureTicket(root, {
    id: tipo === "BUGFIX" ? ID : `${tipo}-POS-QAAGENT-20261005`,
    workflowStatus: "awaiting_user_tests",
    type: tipo,
    module: "POS",
    criterios,
  });
}


beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-qaagent-"));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));


const ticketMd = () => join(root, "tickets", "2026", ID, "ticket.md");
const estado = (): string => parseTicket(readFileSync(ticketMd(), "utf8")).fields.workflow_status;
const cerrar = (extra: Record<string, unknown> = {}) => cerrarQaPorPolitica({ paths: paths(), ticketId: ID, ahora: AHORA, ...extra });

/** La política ya fue promovida (R-QAAG-008): sin eso se queda en sombra. */
function promover(): void {
  mkdirSync(join(root, ".valmen", "qa"), { recursive: true });
  writeFileSync(join(root, ".valmen", "qa", "promotions.jsonl"), `${JSON.stringify({ kind: "qa-agent-promotion", actor: "Juan Andrade", quote: "Promuevo", at: AHORA.toISOString(), evidence: { total: 20, tickets: [] } })}\n`, "utf8");
}

/** Un ticket elegible con `qa-agent` aprobado: lo que el cierre por política exige. */
function preparar(dailyQuota = 5) {
  const { base, delivered } = repo();
  promover();
  ticket();
  const a = crearAutorizacion({
    root, actor: "Juan Andrade", quote: "Autorizo el cierre por agente", types: ["BUGFIX"], modules: ["pos"], maxRisk: "normal",
    dailyQuota, validDays: 30, source: "cli", ahora: AHORA, env: {},
  });
  const r = correrQaAgent({ paths: paths(), ticketId: ID, base, delivered, ahora: AHORA });
  expect(r.verdict, r.reasons.join("; ")).toBe("approve");
  return { a, base, delivered };
}

describe("el cierre por política", () => {
  it("cierra el ciclo atribuido a la autorización y al recibo, y deja el ticket en qa_approved", () => {
    const { a, delivered } = preparar();
    const antes = cupoRestante(root, a, AHORA);
    const r = cerrar();
    expect(estado()).toBe("qa_approved");
    expect(r.authorization).toEqual({ id: a.id, hash: a.hash });
    const qa = parseTicket(readFileSync(ticketMd(), "utf8")).blocks.QA!;
    expect(qa).toHaveLength(2);
    expect(qa[0]).toMatchObject({ result: "pending", build_reference: `commit:${delivered}` });
    expect(qa[1]!["result"]).toBe("approved");
    const politica = parsePolicyConfirmation(qa[1]!["po_confirmation"] as string);
    expect(politica).toEqual({ authorizationId: a.id, authorizationHash: a.hash, receipt: ".valmen/qa/agent-receipts.jsonl:1" });
    expect(JSON.stringify(qa)).not.toMatch(/agente escribi/i);
    // Consume un cupo y la validación del ticket lo acepta (transition ya validó el documento).
    expect(cupoRestante(root, a, AHORA)).toBe(antes - 1);
    expect(motivoDeCierrePorPoliticaInvalido(root, ID, parseTicket(readFileSync(ticketMd(), "utf8")))).toBeNull();
  });

  it("deja un aviso «QA aprobada por política» con el recibo y la forma de reabrir, una sola vez", () => {
    const { a } = preparar();
    cerrar();
    const pendientes = pendientesDeAvisar(paths(), AHORA).filter((p) => p.kind === "cierre-por-politica");
    expect(pendientes).toHaveLength(1);
    const p = pendientes[0]! as { ticket: string; title: string; cycle: number; authorizationId: string; receipt: string };
    expect(p.authorizationId).toBe(a.id);
    const aviso = renderPolicyCloseNotification({ ticketId: p.ticket, title: p.title, authorizationId: p.authorizationId, receipt: p.receipt, cycle: p.cycle });
    expect(aviso.body).toContain("QA APROBADA POR POLÍTICA");
    expect(aviso.body).toContain(p.receipt);
    expect(aviso.body).toContain("--to changes_requested");
  });
});

describe("lo que impide cerrar, sin dejar un ciclo a medias", () => {
  const sinCiclo = (): void => {
    expect(parseTicket(readFileSync(ticketMd(), "utf8")).blocks.QA ?? []).toHaveLength(0);
    expect(estado()).toBe("awaiting_user_tests");
  };

  it("sin recibo de qa-agent", () => {
    repo();
    promover();
    ticket();
    expect(() => cerrar()).toThrow(/No hay recibo de qa-agent/);
    sinCiclo();
  });

  it("si el HEAD cambió después de la verificación", () => {
    preparar();
    escribir("src/otro.txt", "otro\n");
    git("add", "-A");
    git("commit", "-q", "-m", "cambio posterior");
    expect(() => cerrar()).toThrow(/cambió después de la verificación/);
    sinCiclo();
  });

  it("con la autorización revocada o sin cupo", () => {
    const { a } = preparar(1);
    registrarUsoDeCupo({ root, authorizationId: a.id, ticketId: "BUGFIX-POS-OTRO-20261005", ahora: AHORA });
    expect(() => cerrar()).toThrow(/cupo/);
    sinCiclo();
    revocarAutorizacion({ root, id: a.id, actor: "Juan Andrade", reason: "ya no", source: "cli", ahora: AHORA, env: {} });
    expect(leerAutorizaciones(root, AHORA)[0]!.estado).toBe("revocada");
    expect(() => cerrar()).toThrow(/ya no es elegible|ya no está vigente/);
    sinCiclo();
  });

  it("si el ticket dejó de ser elegible (un criterio manual)", () => {
    preparar();
    ticket(`${CRITERIO}\n- [ ] La pantalla muestra el valor corregido al operador.\n      <!-- verify: manual -->`);
    expect(() => cerrar()).toThrow(/ya no es elegible/);
    sinCiclo();
  });

  it("si el último recibo no aprobó", () => {
    const { base, delivered } = preparar();
    // Un segundo recibo, posterior y bloqueado: el que manda es el último.
    escribir(".valmen/config.yaml", "name: Demo\nqa-agent:\n  mode: close\n");
    git("add", "-A");
    git("commit", "-q", "-m", "config sin comandos");
    const r = correrQaAgent({ paths: paths(), ticketId: ID, base, delivered: git("rev-parse", "HEAD"), ahora: AHORA });
    expect(r.verdict).toBe("block");
    expect(() => cerrar()).toThrow(/no aprobó/);
    sinCiclo();
    expect(delivered).toBeTruthy();
  });
});

describe("la atribución no se puede falsificar", () => {
  it("qaClose no acepta una confirmación «policy:», ni siquiera de una persona", () => {
    expect(() => qaClose({ paths: paths(), ticketId: ID, result: "approved", poConfirmation: `policy:QAA-1:sha256:${"a".repeat(64)}|recibo:x:1` })).toThrow(/policy/);
  });

  it("un cierre que cita una autorización o un recibo inexistentes no es creíble", () => {
    preparar();
    cerrar();
    const texto = readFileSync(ticketMd(), "utf8");
    expect(motivoDeCierrePorPoliticaInvalido(root, ID, parseTicket(texto))).toBeNull();
    const rota = texto.replaceAll("agent-receipts.jsonl:1", "agent-receipts.jsonl:9");
    expect(motivoDeCierrePorPoliticaInvalido(root, ID, parseTicket(rota))).toMatch(/recibo/);
    const falsa = texto.replace(/policy:QAA-[A-Za-z0-9-]+:/g, "policy:QAA-inventada:");
    expect(motivoDeCierrePorPoliticaInvalido(root, ID, parseTicket(falsa))).toMatch(/no existe/);
  });

  it("una sesión desatendida puede cerrar por política, pero qa-close sigue rechazándola", () => {
    preparar();
    process.env["VALMEN_UNATTENDED"] = "1";
    try {
      expect(() => qaClose({ paths: paths(), ticketId: ID, result: "approved", poConfirmation: "Apruebo" })).toThrow(/desatendida/);
      expect(qaPolicyCloseCommand(paths(), { id: ID }).exitCode).toBe(0);
    } finally {
      delete process.env["VALMEN_UNATTENDED"];
    }
    expect(estado()).toBe("qa_approved");
  });
});
