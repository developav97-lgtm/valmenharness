/**
 * El estado de CodeGraph en el diagnóstico y su registro como servidor MCP.
 *
 * Lo que se protege:
 *
 * 1. **Una salida que no se entiende nunca es «al día».**
 * 2. **El doctor no escribe y no cambia su código de salida**: CodeGraph es opcional.
 * 3. **La fusión de `codegraph` conserva `valmen` y es idempotente**, y sin
 *    CodeGraph instalado no se declara un servidor que no arrancaría.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type CodegraphState,
  readCodegraphStatus,
} from "../packages/adapter/src/index.js";
import { mcpCommand } from "../packages/cli/src/mcp.js";
import { doctorCommand } from "../packages/cli/src/setup.js";
import type { RegistryPaths } from "../packages/engine/src/discovery.js";

let lab: string;
let homeAnterior: string | undefined;

const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });
const ok = (stdout: string) => ({ status: 0, stdout });
const json = (o: unknown) => ok(JSON.stringify(o));

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-codegraph-"));
  homeAnterior = process.env["HOME"];
  // `codexConfigPath()` resuelve con homedir(): que no toque el de la persona.
  process.env["HOME"] = join(lab, "home");
  mkdirSync(process.env["HOME"], { recursive: true });
});

afterEach(() => {
  if (homeAnterior === undefined) delete process.env["HOME"];
  else process.env["HOME"] = homeAnterior;
  rmSync(lab, { recursive: true, force: true });
});

describe("readCodegraphStatus", () => {
  it("ENOENT es no instalado", () => {
    expect(readCodegraphStatus({ errorCode: "ENOENT", status: null, stdout: "" })).toEqual({
      estado: "no-instalado",
    });
  });

  it("initialized:false es sin índice", () => {
    expect(readCodegraphStatus(json({ initialized: false })).estado).toBe("sin-indice");
  });

  it("pendingChanges en cero es al día", () => {
    const r = readCodegraphStatus(
      json({ initialized: true, pendingChanges: { added: 0, modified: 0, removed: 0 } }),
    );
    expect(r.estado).toBe("al-dia");
  });

  it("con cambios pendientes trae los conteos", () => {
    const r = readCodegraphStatus(
      json({ initialized: true, pendingChanges: { added: 2, modified: 4, removed: 1 } }),
    );
    expect(r).toEqual({ estado: "desactualizado", added: 2, modified: 4, removed: 1 });
  });

  it("JSON inválido, salida distinta de 0, tope de tiempo y forma inesperada son ilegibles", () => {
    const casos = [
      ok("no es json"),
      { status: 1, stdout: '{"initialized":false}' },
      { errorCode: "ETIMEDOUT", status: null, stdout: "" },
      ok("[]"),
      json({ initialized: true }),
      json({ initialized: true, pendingChanges: { added: "x", modified: 0, removed: 0 } }),
    ];
    for (const caso of casos) {
      expect(readCodegraphStatus(caso).estado).toBe("ilegible");
    }
  });
});

describe("doctor", () => {
  const sonda = (estado: CodegraphState) => ({ env: {}, codegraph: () => estado });

  it("sin el binario, la línea CodeGraph es un aviso de no instalado y no hay líneas MCP", async () => {
    const r = await doctorCommand(PATHS(), sonda({ estado: "no-instalado" }));
    expect(r.stdout).toMatch(/· CodeGraph\s+no instalado/);
    expect(r.stdout).not.toContain("MCP codegraph");
  });

  it("sin índice dice que falta indexar y propone codegraph init", async () => {
    const r = await doctorCommand(PATHS(), sonda({ estado: "sin-indice" }));
    expect(r.stdout).toContain("falta indexar");
    expect(r.stdout).toContain("codegraph init");
  });

  it("al día sale en ok", async () => {
    const r = await doctorCommand(PATHS(), sonda({ estado: "al-dia" }));
    expect(r.stdout).toMatch(/✓ CodeGraph\s+instalado, indexado y al día/);
  });

  it("con cambios pendientes muestra los conteos y propone codegraph sync", async () => {
    const r = await doctorCommand(
      PATHS(),
      sonda({ estado: "desactualizado", added: 2, modified: 4, removed: 1 }),
    );
    expect(r.stdout).toContain("2 añadidos, 4 modificados, 1 eliminados");
    expect(r.stdout).toContain("codegraph sync");
  });

  it("un estado ilegible no se informa como al día", async () => {
    const r = await doctorCommand(PATHS(), sonda({ estado: "ilegible", motivo: "x" }));
    expect(r.stdout).toContain("estado ilegible");
    expect(r.stdout).not.toMatch(/✓ CodeGraph/);
  });

  it("no crea archivos y ningún estado cambia el código de salida", async () => {
    const antes = readdirSync(lab).sort();
    const estados: CodegraphState[] = [
      { estado: "no-instalado" },
      { estado: "sin-indice" },
      { estado: "al-dia" },
      { estado: "desactualizado", added: 1, modified: 0, removed: 0 },
      { estado: "ilegible", motivo: "x" },
    ];
    const salidas = new Set<number>();
    for (const estado of estados) {
      salidas.add((await doctorCommand(PATHS(), sonda(estado))).exitCode);
    }
    expect(salidas.size).toBe(1);
    expect(readdirSync(lab).sort()).toEqual(antes);
    expect(existsSync(join(lab, ".codegraph"))).toBe(false);
  });

  it("lee la clave codegraph del JSON y no una subcadena", async () => {
    writeFileSync(
      join(lab, ".mcp.json"),
      JSON.stringify({ mcpServers: { codegraph: { command: "codegraph" } } }),
      "utf8",
    );
    // Solo menciona «codegraph» en un valor, sin declarar el servidor.
    writeFileSync(
      join(lab, "opencode.json"),
      JSON.stringify({ mcp: { otro: { command: ["codegraph-no"] } } }),
      "utf8",
    );
    const r = await doctorCommand(PATHS(), sonda({ estado: "al-dia" }));
    expect(r.stdout).toMatch(/✓ MCP codegraph en Claude Code/);
    expect(r.stdout).toMatch(/· MCP codegraph en opencode/);
  });
});

describe("valmen mcp", () => {
  const pedir = (extra: Record<string, unknown>) =>
    mcpCommand({
      root: lab,
      cliEntry: "valmen",
      install: true,
      global: false,
      json: false,
      ...extra,
    });
  const leer = (nombre: string) => JSON.parse(readFileSync(join(lab, nombre), "utf8"));

  it("con CodeGraph instalado deja codegraph junto a valmen y es idempotente", () => {
    pedir({ codegraph: { estado: "al-dia" } });
    const claude = leer(".mcp.json");
    const opencode = leer("opencode.json");
    expect(claude.mcpServers.valmen).toBeDefined();
    expect(claude.mcpServers.codegraph).toMatchObject({
      command: "codegraph",
      args: ["serve", "--mcp"],
    });
    expect(opencode.mcp.valmen).toBeDefined();
    expect(opencode.mcp.codegraph.command).toEqual(["codegraph", "serve", "--mcp"]);

    const textos = [".mcp.json", "opencode.json"].map((n) =>
      readFileSync(join(lab, n), "utf8"),
    );
    const r = pedir({ codegraph: { estado: "al-dia" } });
    expect(
      [".mcp.json", "opencode.json"].map((n) => readFileSync(join(lab, n), "utf8")),
    ).toEqual(textos);
    expect(r.stdout).toContain("sin cambios");
  });

  it("conserva servidores ajenos al fusionar", () => {
    writeFileSync(
      join(lab, ".mcp.json"),
      JSON.stringify({ mcpServers: { ajeno: { command: "x" } } }),
      "utf8",
    );
    pedir({ codegraph: { estado: "sin-indice" } });
    expect(Object.keys(leer(".mcp.json").mcpServers).sort()).toEqual([
      "ajeno",
      "codegraph",
      "valmen",
    ]);
  });

  it("sin CodeGraph instalado no declara el servidor codegraph", () => {
    const r = pedir({ codegraph: { estado: "no-instalado" } });
    expect(leer(".mcp.json").mcpServers.codegraph).toBeUndefined();
    expect(leer("opencode.json").mcp.codegraph).toBeUndefined();
    expect(r.stdout).toContain("no se declara el servidor `codegraph`");
  });

  it("--global añade [mcp_servers.codegraph] al config.toml de codex (en un HOME temporal)", () => {
    mkdirSync(join(lab, "home", ".codex"), { recursive: true });
    pedir({ global: true, codegraph: { estado: "al-dia" } });
    const toml = readFileSync(join(lab, "home", ".codex", "config.toml"), "utf8");
    expect(toml).toContain("[mcp_servers.valmen]");
    expect(toml).toContain("[mcp_servers.codegraph]");
    expect(toml).toContain('args = ["serve", "--mcp"]');
  });

  it("--json incluye la entrada solo con CodeGraph instalado", () => {
    const con = JSON.parse(
      pedir({ install: false, json: true, codegraph: { estado: "al-dia" } }).stdout,
    );
    const sin = JSON.parse(pedir({ install: false, json: true }).stdout);
    expect(con.codegraph.args).toEqual(["serve", "--mcp"]);
    expect(sin.codegraph).toBeUndefined();
  });
});
