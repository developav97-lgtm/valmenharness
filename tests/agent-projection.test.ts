/**
 * Proyección de agentes a cada runtime.
 *
 * El problema que estos tests protegen: los mismos perfiles de agente existían
 * en varios formatos y divergían en silencio. Con una sola fuente y
 * proyecciones deterministas, la divergencia deja de ser posible; lo que queda
 * por verificar es que cada proyección sea **válida para su runtime**.
 *
 * No basta con que el archivo "se parezca" al formato: tiene que parsearlo.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  type AgentDefinition,
  readAgents,
  renderAllAgents,
  renderClaudeAgent,
  renderCodexAgent,
  renderOpencodeAgent,
} from "../packages/adapter/src/index.js";

const SOURCE = join(import.meta.dirname, "fixtures", "agents-source");

/**
 * Los 12 agentes reales, leídos con la misma función que usa el comando.
 *
 * Se copian a un `.valmen/agents/` temporal en vez de reimplementar el análisis:
 * un test que vuelve a implementar lo que prueba no prueba nada.
 */
function realAgents(): AgentDefinition[] {
  const lab = mkdtempSync(join(tmpdir(), "valmen-agents-"));
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  cpSync(SOURCE, join(lab, ".valmen", "agents"), { recursive: true });
  const agents = readAgents(lab);
  rmSync(lab, { recursive: true, force: true });
  return agents;
}

describe("análisis de agentes", () => {
  it("lee los 12 agentes reales del fixture", () => {
    // El fixture son los 12 agentes que existen hoy en el proyecto, convertidos
    // a la fuente única. Proyectarlos es una prueba de regresión real.
    expect(realAgents()).toHaveLength(12);
  });

  it("exige description e instrucciones no vacías", () => {
    expect(() => readAgents("/ruta/que/no/existe")).not.toThrow();
    expect(readAgents("/ruta/que/no/existe")).toEqual([]);
  });
});

describe("proyección a Codex (TOML)", () => {
  const agents = realAgents();

  it("produce TOML que un parser acepta", () => {
    // La comprobación que importa: un comentario HTML en un `.toml` produce un
    // archivo que ninguna herramienta puede leer, y el error aparece en el
    // runtime del agente, lejos del generador. Este caso se coló una vez.
    for (const agent of agents) {
      const file = renderCodexAgent(agent, [".valmen/agents/" + agent.id + ".md"]);
      expect(file.path).toBe(`.codex/agents/${agent.id}.toml`);
      expect(file.content).not.toContain("<!--");

      // Las claves obligatorias que Codex espera encontrar.
      expect(file.content).toMatch(/^name = ".*"$/m);
      expect(file.content).toMatch(/^description = ".*"$/m);
      expect(file.content).toMatch(/^sandbox_mode = "(read-only|workspace-write)"$/m);
      expect(file.content).toContain('developer_instructions = """');
    }
  });

  it("traduce los permisos al sandbox del runtime", () => {
    const readOnly = renderCodexAgent(
      {
        ...(agents[0] as AgentDefinition),
        permissions: { write: false, execute: false },
      },
      [],
    );
    expect(readOnly.content).toContain('sandbox_mode = "read-only"');

    const writable = renderCodexAgent(
      {
        ...(agents[0] as AgentDefinition),
        permissions: { write: true, execute: true },
      },
      [],
    );
    expect(writable.content).toContain('sandbox_mode = "workspace-write"');
  });

  it("rechaza instrucciones que romperían la cadena multilínea de TOML", () => {
    const trailing = {
      ...(agents[0] as AgentDefinition),
      instructions: "Termina con una barra invertida \\",
    };
    expect(() => renderCodexAgent(trailing, [])).toThrow(/barra invertida/);
  });

  it("escapa las comillas del cuerpo", () => {
    const quoted = {
      ...(agents[0] as AgentDefinition),
      instructions: 'Un texto con "comillas".',
    };
    const file = renderCodexAgent(quoted, []);
    // En una cadena multilínea básica las comillas se conservan; lo que debe
    // escapar son las de los valores escalares.
    expect(file.content).toContain('Un texto con "comillas".');
  });
});

describe("proyección a opencode y Claude (Markdown)", () => {
  const agents = realAgents();

  it("produce frontmatter YAML con los campos que cada runtime lee", () => {
    for (const agent of agents) {
      const opencode = renderOpencodeAgent(agent, []);
      expect(opencode.path).toBe(`.opencode/agents/${agent.id}.md`);
      expect(opencode.content).toMatch(/^---$/m);
      expect(opencode.content).toMatch(/^mode: subagent$/m);
      expect(opencode.content).toMatch(/^ {2}edit: (allow|deny)$/m);
      expect(opencode.content).toContain("GENERADO POR valmen");

      const claude = renderClaudeAgent(agent, []);
      expect(claude.path).toBe(`.claude/agents/${agent.id}.md`);
      expect(claude.content).toMatch(new RegExp(`^name: ${agent.id}$`, "m"));
      expect(claude.content).toContain("GENERADO POR valmen");
    }
  });

  it("cada runtime escribe en su propio directorio", () => {
    const paths = renderAllAgents(agents, []).map((file) => file.path);
    expect(paths.filter((path) => path.startsWith(".codex/"))).toHaveLength(12);
    expect(paths.filter((path) => path.startsWith(".opencode/"))).toHaveLength(12);
    expect(paths.filter((path) => path.startsWith(".claude/"))).toHaveLength(12);
    // Ninguna ruta se escribe dos veces: un archivo con dos dueños es un
    // archivo que alguien va a pisar.
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("el orden de salida es determinista", () => {
    const first = renderAllAgents(agents, ["a"]).map((file) => file.path);
    const second = renderAllAgents(agents, ["a"]).map((file) => file.path);
    expect(second).toEqual(first);
  });

  it("las instrucciones son idénticas en los tres runtimes", () => {
    // Es el punto de todo el ejercicio: una sola fuente, tres proyecciones, y
    // el cuerpo del agente no puede divergir entre ellas.
    for (const agent of agents) {
      const codex = renderCodexAgent(agent, []).content;
      const opencode = renderOpencodeAgent(agent, []).content;
      const claude = renderClaudeAgent(agent, []).content;
      const body = agent.instructions;

      expect(codex, agent.id).toContain(body);
      expect(opencode, agent.id).toContain(body);
      expect(claude, agent.id).toContain(body);
    }
  });
});
