/**
 * Lo que `valmen sync` proyecta para Claude Code: el estilo de salida, su
 * activación en `settings.json` y el bloque gestionado de `CLAUDE.md`
 * (R-RESP-002 y R-RESP-003).
 *
 * `settings.json` y `CLAUDE.md` también los escribe la persona, así que lo que
 * importa es lo que **no** se toca: los permisos, las notas y el formato. La otra
 * propiedad es la idempotencia, porque `--check` compara con el disco el texto ya
 * fusionado.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CLAUDE_MD_BEGIN,
  CLAUDE_MD_END,
  RESPONSE_CONTRACT_RULES,
  mergeClaudeMdBlock,
  mergeOutputStyleSetting,
  renderClaudeMdBlock,
  renderOutputStyle,
} from "../packages/adapter/src/index.js";
import { syncProject } from "../packages/cli/src/commands.js";

let lab: string;

function scaffold(config = "name: Demo\n"): void {
  mkdirSync(join(lab, ".valmen", "rules"), { recursive: true });
  writeFileSync(join(lab, ".valmen", "config.yaml"), config, "utf8");
}

function leer(ruta: string): string {
  return readFileSync(join(lab, ruta), "utf8");
}

function escribir(ruta: string, texto: string): void {
  mkdirSync(join(lab, ruta, ".."), { recursive: true });
  writeFileSync(join(lab, ruta), texto, "utf8");
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-claude-"));
  scaffold();
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("R-RESP-002: el estilo de salida", () => {
  it("sync escribe .claude/output-styles/valmen.md con el contrato", () => {
    expect(syncProject(lab, "Demo", false).exitCode).toBe(0);
    const estilo = leer(".claude/output-styles/valmen.md");
    expect(estilo).toContain("name: valmen");
    for (const regla of RESPONSE_CONTRACT_RULES) expect(estilo).toContain(regla);
    expect(estilo).toBe(renderOutputStyle());
  });

  it("activa outputStyle y conserva los permisos y demás claves", () => {
    const propio = { permissions: { allow: ["Bash(npm test)"] }, model: "opus" };
    escribir(".claude/settings.json", JSON.stringify(propio, null, 2));
    syncProject(lab, "Demo", false);

    const despues = JSON.parse(leer(".claude/settings.json")) as Record<string, unknown>;
    expect(despues["outputStyle"]).toBe("valmen");
    expect(despues["permissions"]).toEqual(propio.permissions);
    expect(despues["model"]).toBe("opus");
  });

  it("sin settings.json lo crea con solo outputStyle", () => {
    syncProject(lab, "Demo", false);
    expect(JSON.parse(leer(".claude/settings.json"))).toEqual({ outputStyle: "valmen" });
  });

  it("si ya vale valmen devuelve el texto tal cual, sin reformatear", () => {
    const texto = '{"outputStyle":"valmen",   "permissions": {}}';
    expect(mergeOutputStyleSetting(texto)).toBe(texto);
  });

  it("un outputStyle ajeno se cambia a valmen", () => {
    const fusion = mergeOutputStyleSetting('{"outputStyle":"Explanatory","x":1}');
    expect(JSON.parse(fusion)).toEqual({ outputStyle: "valmen", x: 1 });
  });

  it("un settings.json inválido no se sobrescribe y el error lo nombra", () => {
    escribir(".claude/settings.json", "{ esto no es json");
    const resultado = syncProject(lab, "Demo", false);
    expect(resultado.exitCode).not.toBe(0);
    expect(JSON.stringify(resultado)).toContain(".claude/settings.json");
    expect(leer(".claude/settings.json")).toBe("{ esto no es json");
  });

  it("sync --check marca desactualizado un proyecto sin la clave y pasa tras sync", () => {
    escribir(".claude/settings.json", '{"permissions":{"allow":[]}}');
    const antes = syncProject(lab, "Demo", true);
    expect(antes.exitCode).not.toBe(0);
    expect(JSON.stringify(antes)).toContain(".claude/settings.json");

    syncProject(lab, "Demo", false);
    expect(syncProject(lab, "Demo", true).exitCode).toBe(0);
  });

  it("--check no se queja de otras claves que la persona cambie después", () => {
    syncProject(lab, "Demo", false);
    const datos = JSON.parse(leer(".claude/settings.json")) as Record<string, unknown>;
    escribir(".claude/settings.json", JSON.stringify({ ...datos, model: "sonnet" }, null, 2));
    expect(syncProject(lab, "Demo", true).exitCode).toBe(0);
  });
});

describe("R-RESP-003: el bloque gestionado de CLAUDE.md", () => {
  it("tiene diez líneas o menos e importa AGENTS.md", () => {
    const bloque = renderClaudeMdBlock();
    expect(bloque.split("\n").length).toBeLessThanOrEqual(10);
    expect(bloque).toContain("@AGENTS.md");
    expect(bloque).toContain("prevalece");
  });

  it("deja las notas de la persona intactas y agrega el bloque una sola vez", () => {
    const notas = "# Mis notas\n\nNo usar tabs.\n";
    escribir("CLAUDE.md", notas);
    syncProject(lab, "Demo", false);
    syncProject(lab, "Demo", false);

    const texto = leer("CLAUDE.md");
    expect(texto.startsWith(notas.trimEnd())).toBe(true);
    expect(texto.split(CLAUDE_MD_BEGIN)).toHaveLength(2);
    expect(texto.split(CLAUDE_MD_END)).toHaveLength(2);
  });

  it("reemplaza el bloque viejo sin tocar lo de antes ni lo de después", () => {
    const viejo = `antes\n${CLAUDE_MD_BEGIN}\nobsoleto\n${CLAUDE_MD_END}\ndespués\n`;
    const nuevo = mergeClaudeMdBlock(viejo);
    expect(nuevo).toContain("antes\n");
    expect(nuevo).toContain("\ndespués\n");
    expect(nuevo).not.toContain("obsoleto");
    expect(mergeClaudeMdBlock(nuevo)).toBe(nuevo);
  });

  it("un marcador sin su pareja falla y no se escribe", () => {
    escribir("CLAUDE.md", `notas\n${CLAUDE_MD_BEGIN}\nmedio\n`);
    const resultado = syncProject(lab, "Demo", false);
    expect(resultado.exitCode).not.toBe(0);
    expect(leer("CLAUDE.md")).toBe(`notas\n${CLAUDE_MD_BEGIN}\nmedio\n`);
  });

  it("sync --check queda al día tras sync", () => {
    syncProject(lab, "Demo", false);
    expect(syncProject(lab, "Demo", true).exitCode).toBe(0);
  });
});

describe("el runtime claude fuera de alcance", () => {
  it("no proyecta estilo, settings ni CLAUDE.md", () => {
    scaffold("name: Demo\nruntimes:\n  - codex\n");
    syncProject(lab, "Demo", false);
    for (const ruta of [".claude/output-styles/valmen.md", ".claude/settings.json", "CLAUDE.md"]) {
      expect(() => leer(ruta)).toThrow();
    }
  });
});
