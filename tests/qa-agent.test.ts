/**
 * La compuerta `qa-agent`: prueba en un worktree limpio, con la configuración del commit base.
 *
 * Usa repositorios git de verdad y comandos de verdad (`node`): lo que se afirma es justamente que
 * el árbol donde se prueba no es el del agente, así que un simulacro no probaría nada.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { qaAgentCommand } from "../packages/cli/src/commands.js";
import {
  correrQaAgent,
  crearAutorizacion,
  ejecutarGitDeQaAgent,
  leerRecibosQaAgent,
  reproducirReciboQaAgent,
} from "../packages/engine/src/index.js";
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

const autorizar = () =>
  crearAutorizacion({
    root, actor: "Juan Andrade", quote: "Autorizo el cierre por agente", types: ["BUGFIX", "IMPROVEMENT", "CHORE", "FEATURE"],
    modules: ["pos"], maxRisk: "normal", dailyQuota: 5, validDays: 30, source: "cli", ahora: AHORA, env: {},
  });

const correr = (base: string, delivered: string) => correrQaAgent({ paths: paths(), ticketId: ID, base, delivered, ahora: AHORA });
const worktrees = (): string[] => git("worktree", "list").split("\n").filter((l) => l !== "");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-qaagent-"));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("una verificación que aprueba", () => {
  it("aprueba un BUGFIX cuya prueba falla en el base y pasa en el entregado, y deja el recibo completo", () => {
    const { base, delivered } = repo();
    ticket();
    const a = autorizar();
    const r = correr(base, delivered);
    expect(r.reasons).toEqual([]);
    expect(r.verdict).toBe("approve");
    const recibo = r.recibo!;
    expect(recibo.base).toBe(base);
    expect(recibo.delivered).toBe(delivered);
    expect(recibo.treeHash).toBe(git("rev-parse", `${delivered}^{tree}`));
    expect(recibo.authorization).toEqual({ id: a.id, hash: a.hash });
    expect(recibo.resultadoContraBase).toBe("fallo-como-se-esperaba");
    const fases = recibo.commands.map((c) => c.fase);
    expect(fases).toEqual(["entregado", "regresion", "base"]);
    for (const c of recibo.commands) {
      expect(c.invocacion).toMatch(/^node /);
      expect(c.outputSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof c.durationMs).toBe("number");
      expect(typeof c.tail).toBe("string");
    }
    expect(recibo.commands.find((c) => c.fase === "base")!.exitCode).not.toBe(0);
    expect(leerRecibosQaAgent(root, ID)).toHaveLength(1);
  });

  it("repetir los comandos del recibo da los mismos códigos de salida", () => {
    const { base, delivered } = repo();
    ticket();
    autorizar();
    const primero = correr(base, delivered).recibo!;
    const segundo = correr(base, delivered).recibo!;
    expect(segundo.commands.map((c) => [c.fase, c.invocacion, c.exitCode])).toEqual(
      primero.commands.map((c) => [c.fase, c.invocacion, c.exitCode]),
    );
    const pasos = reproducirReciboQaAgent(primero).join("\n");
    expect(pasos).toContain(primero.delivered);
    expect(pasos).toContain(primero.base);
    expect(pasos).toContain("node tests/bug.test.mjs");
  });

  it("elimina los worktrees y deja intacto el árbol de trabajo", () => {
    const { base, delivered } = repo();
    ticket();
    autorizar();
    escribir("notas-del-agente.txt", "sin commitear\n");
    const antes = git("status", "--porcelain");
    correr(base, delivered);
    expect(worktrees()).toHaveLength(1);
    expect(git("status", "--porcelain")).toBe(antes);
    expect(readFileSync(join(root, "notas-del-agente.txt"), "utf8")).toBe("sin commitear\n");
  });
});

describe("el árbol que el agente no controla", () => {
  it("un script de pruebas editado sin commitear no cuenta: se usa el del commit", () => {
    const { base, delivered } = repo(CONFIG.replace("  - node\n", "  - node\n  - node scripts/ayuda.mjs\n"));
    // El script de ayuda del commit sale bien; el del árbol de trabajo, editado, saldría mal.
    escribir("scripts/regresion.mjs", "process.exit(7);\n");
    ticket();
    autorizar();
    const r = correr(base, delivered);
    expect(r.verdict, r.reasons.join("; ")).toBe("approve");
  });

  it("un diff que modifica el script que corre las pruebas no es elegible y nombra el archivo", () => {
    mkdirSync(root, { recursive: true });
    git("init", "-q", "-b", "main");
    escribir(".valmen/config.yaml", CONFIG.replace("  - node\n", "  - node scripts/regresion.mjs\n"));
    escribir("scripts/regresion.mjs", "process.exit(0);\n");
    citados();
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    const base = git("rev-parse", "HEAD");
    escribir("scripts/regresion.mjs", "process.exit(0); // trampa\n");
    git("add", "-A");
    git("commit", "-q", "-m", "entrega");
    ticket();
    autorizar();
    const r = correr(base, git("rev-parse", "HEAD"));
    expect(r.verdict).toBe("block");
    expect(r.reasons.join(" ")).toContain("scripts/regresion.mjs");
    expect(r.recibo!.commands).toEqual([]);
  });
});

describe("rechazos", () => {
  it("una prueba nueva que pasa también contra el base no aprueba y dice que no reproduce el defecto", () => {
    mkdirSync(root, { recursive: true });
    git("init", "-q", "-b", "main");
    escribir(".valmen/config.yaml", CONFIG);
    escribir("src/valor.txt", "nuevo\n");
    escribir("scripts/regresion.mjs", "process.exit(0);\n");
    citados();
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    const base = git("rev-parse", "HEAD");
    escribir("tests/bug.test.mjs", "process.exit(0);\n");
    git("add", "-A");
    git("commit", "-q", "-m", "entrega");
    ticket();
    autorizar();
    const r = correr(base, git("rev-parse", "HEAD"));
    expect(r.verdict).toBe("block");
    expect(r.reasons.join(" ")).toContain("no reproduce el defecto");
    expect(r.recibo!.resultadoContraBase).toBe("no-reproduce-el-defecto");
  });

  it("un comando que el proyecto no autoriza se rechaza sin correr nada", () => {
    const { base, delivered } = repo();
    ticket('- [ ] El valor corregido es el esperado en Python.\n      <!-- test: python3 tests/bug.test.py -->');
    autorizar();
    const r = correr(base, delivered);
    expect(r.verdict).toBe("block");
    expect(r.reasons.join(" ")).toContain("no autorizado");
    expect(r.recibo!.commands).toEqual([]);
    expect(worktrees()).toHaveLength(1);
  });

  it("un ticket no elegible no corre nada y dice qué regla falla", () => {
    const { base, delivered } = repo();
    ticket();
    const r = correr(base, delivered);
    expect(r.verdict).toBe("block");
    expect(r.reasons.join(" ")).toContain("autorizacion");
    expect(r.recibo!.commands).toEqual([]);
  });

  it("un BUGFIX sin regresión declarada no aprueba", () => {
    const { base, delivered } = repo(CONFIG.replace(/qa-agent:[\s\S]*$/, ""));
    ticket();
    autorizar();
    const r = correr(base, delivered);
    expect(r.verdict).toBe("block");
    expect(r.reasons.join(" ")).toContain("regresión");
  });

  it("un fallo a mitad de camino bloquea y aun así elimina los worktrees", () => {
    const { base, delivered } = repo();
    ticket();
    autorizar();
    const r = correrQaAgent({
      paths: paths(), ticketId: ID, base, delivered, ahora: AHORA,
      ejecutar: () => {
        throw new Error("se cayó el runner");
      },
    });
    expect(r.verdict).toBe("block");
    expect(r.reasons.join(" ")).toContain("se cayó el runner");
    expect(worktrees()).toHaveLength(1);
  });
});

describe("el git de la compuerta", () => {
  it("rechaza lo que no está en su lista cerrada antes de lanzar nada", () => {
    const lanzado: string[][] = [];
    const ejecutor = (a: readonly string[]) => {
      lanzado.push([...a]);
      return { status: 0, stdout: "", stderr: "" };
    };
    for (const malo of [["push"], ["fetch"], ["reset", "--hard"], ["tag", "x"], ["worktree", "add", "/x"], ["worktree", "prune"], ["show", "HEAD"], ["checkout", "-b", "x"]]) {
      expect(() => ejecutarGitDeQaAgent(malo, root, ejecutor), malo.join(" ")).toThrow();
    }
    expect(lanzado).toEqual([]);
    ejecutarGitDeQaAgent(["worktree", "add", "--detach", "/tmp/x", "abc1234"], root, ejecutor);
    expect(lanzado).toHaveLength(1);
  });
});

describe("el comando", () => {
  it("imprime el veredicto, sale con éxito si aprueba y no escribe en el ticket", () => {
    const { base, delivered } = repo();
    ticket();
    autorizar();
    const ticketMd = join(root, "tickets", "2026", ID, "ticket.md");
    const antes = readFileSync(ticketMd, "utf8");
    const r = qaAgentCommand(paths(), { id: ID, base, delivered });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("APRUEBA");
    expect(readFileSync(ticketMd, "utf8")).toBe(antes);
    expect(existsSync(join(root, ".valmen", "qa", "agent-receipts.jsonl"))).toBe(true);
  });

  it("sale con error si falta una bandera", () => {
    expect(qaAgentCommand(paths(), { id: ID }).exitCode).not.toBe(0);
  });
});
