/**
 * El límite del informe de los agentes y la verbosidad de Codex
 * (R-RESP-004 y R-RESP-007).
 *
 * Lo que importa de la verbosidad es lo que no se toca: el `config.toml` de Codex lo
 * comparte la persona, y una clave que ya escribió es una decisión suya.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AGENT_REPORT_RULE,
  AGENT_REPORT_TITLE,
  mergeCodexVerbosity,
  withReportLimit,
} from "../packages/adapter/src/index.js";
import { syncProject } from "../packages/cli/src/commands.js";

let lab: string;

function scaffold(config = "name: Demo\n"): void {
  mkdirSync(join(lab, ".valmen", "agents"), { recursive: true });
  writeFileSync(join(lab, ".valmen", "config.yaml"), config, "utf8");
  writeFileSync(
    join(lab, ".valmen", "agents", "planner.md"),
    "---\ndescription: Planea.\n---\n\nPlanea esto.\n",
    "utf8",
  );
}

function leer(ruta: string): string {
  return readFileSync(join(lab, ruta), "utf8");
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-agentes-"));
  scaffold();
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("R-RESP-004: el informe de los agentes", () => {
  it("el agente de Claude Code, el de Codex y el de OpenCode piden diez líneas como máximo", () => {
    syncProject(lab, "Demo", false);
    for (const ruta of [
      ".claude/agents/planner.md",
      ".codex/agents/planner.toml",
      ".opencode/agents/planner.md",
    ]) {
      const texto = leer(ruta);
      expect(texto, ruta).toContain(`## ${AGENT_REPORT_TITLE}`);
      expect(texto, ruta).toContain("diez líneas como máximo");
      expect(texto.split(`## ${AGENT_REPORT_TITLE}`), ruta).toHaveLength(2);
    }
  });

  it("no repite la sección si la definición ya la trae", () => {
    const propia = `Haz esto.\n\n## ${AGENT_REPORT_TITLE}\n\nCinco líneas.`;
    expect(withReportLimit(propia)).toBe(propia);
  });

  it("agrega la regla al final de las instrucciones", () => {
    const texto = withReportLimit("Planea esto.\n");
    expect(texto.startsWith("Planea esto.")).toBe(true);
    expect(texto.endsWith(AGENT_REPORT_RULE)).toBe(true);
  });
});

describe("R-RESP-007: la verbosidad de Codex", () => {
  it("sync declara model_verbosity baja en el config.toml de Codex", () => {
    syncProject(lab, "Demo", false);
    expect(leer(".codex/config.toml")).toContain('model_verbosity = "low"');
  });

  it("conserva las claves y secciones de la persona y deja la clave antes de la primera sección", () => {
    const propio = '# mía\nmodel = "gpt-5"\n\n[mcp_servers.x]\ncommand = "x"\n';
    const fusion = mergeCodexVerbosity(propio, "low");
    expect(fusion).toContain('model = "gpt-5"');
    expect(fusion).toContain('[mcp_servers.x]\ncommand = "x"');
    expect(fusion.indexOf("model_verbosity")).toBeLessThan(fusion.indexOf("[mcp_servers.x]"));
    expect(mergeCodexVerbosity(fusion, "low")).toBe(fusion);
  });

  it("respeta una clave model_verbosity ya escrita, aunque valga otra cosa", () => {
    const propio = 'model_verbosity = "high"\n[x]\ny = 1\n';
    expect(mergeCodexVerbosity(propio, "low")).toBe(propio);
  });

  it("una clave del mismo nombre dentro de una sección no cuenta como la de nivel superior", () => {
    const fusion = mergeCodexVerbosity('[perfil]\nmodel_verbosity = "high"\n', "low");
    expect(fusion.split("model_verbosity")).toHaveLength(3);
    expect(fusion.indexOf('model_verbosity = "low"')).toBeLessThan(fusion.indexOf("[perfil]"));
  });

  it("sync es idempotente y --check queda al día", () => {
    syncProject(lab, "Demo", false);
    expect(syncProject(lab, "Demo", true).exitCode).toBe(0);
  });

  it("codex-verbosity: off no proyecta el archivo", () => {
    scaffold("name: Demo\ncodex-verbosity: off\n");
    syncProject(lab, "Demo", false);
    expect(() => leer(".codex/config.toml")).toThrow();
  });

  it("un valor inválido falla con mensaje", () => {
    scaffold("name: Demo\ncodex-verbosity: mucha\n");
    const resultado = syncProject(lab, "Demo", false);
    expect(resultado.exitCode).not.toBe(0);
    expect(JSON.stringify(resultado)).toContain("codex-verbosity");
  });

  it("sin el runtime codex en alcance no se proyecta", () => {
    scaffold("name: Demo\nruntimes:\n  - claude\n");
    syncProject(lab, "Demo", false);
    expect(() => leer(".codex/config.toml")).toThrow();
  });

  it("OpenCode no recibe clave de verbosidad", () => {
    syncProject(lab, "Demo", false);
    const opencode = leer(".opencode/agents/planner.md");
    expect(opencode).not.toMatch(/verbosity/i);
  });
});
