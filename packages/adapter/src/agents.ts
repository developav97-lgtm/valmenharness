/**
 * Agentes del proyecto y su proyección a cada runtime.
 *
 * El dolor que resuelve: los mismos perfiles de agente existen en dos o tres
 * formatos y divergen en silencio. En el proyecto que originó este harness, el
 * agente `planner` ya había divergido en una frase entre su versión TOML y su
 * versión Markdown, sin que nadie lo notara.
 *
 * Aquí hay **una sola fuente** —`.valmen/agents/<id>.md`— y una proyección
 * determinista por runtime. Añadir un formato nuevo no obliga a tocar los
 * agentes.
 *
 * Ver docs/07-ADAPTADORES.md.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { fail } from "@valmen/core";

import { generatedHeader, generatedHeaderToml } from "./templates.js";
import { ADAPTER_VERSION } from "./project.js";

/** Permisos de un agente, en términos neutrales al runtime. */
export interface AgentPermissions {
  /** `true` si puede editar archivos. */
  readonly write: boolean;
  /** `true` si puede ejecutar comandos que mutan el sistema. */
  readonly execute: boolean;
}

/** Un agente del proyecto, ya analizado. */
export interface AgentDefinition {
  readonly id: string;
  readonly description: string;
  /** Rol de workflow, usado por el routing de modelos. */
  readonly role: string;
  readonly permissions: AgentPermissions;
  readonly tools: readonly string[];
  /** Cuerpo de instrucciones, sin el frontmatter. */
  readonly instructions: string;
}

/** Un archivo proyectado, listo para escribir. */
export interface RenderedFile {
  /** Ruta relativa a la raíz, con separadores POSIX. */
  readonly path: string;
  readonly content: string;
}

const AGENT_FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;
const AGENT_LINE_RE = /^([a-z_]+): (.*)$/;

/** Divide el frontmatter de un agente en campos y cuerpo. */
function splitAgentFrontmatter(text: string): {
  fields: Map<string, string>;
  body: string;
} {
  const match = AGENT_FRONTMATTER_RE.exec(text);
  if (match === null) {
    fail(
      "Un agente de .valmen/agents/ debe iniciar con frontmatter delimitado por ---.",
    );
  }

  const fields = new Map<string, string>();
  for (const line of (match[1] as string).split("\n")) {
    if (line.trim() === "") continue;
    const field = AGENT_LINE_RE.exec(line);
    if (field === null) {
      fail(
        "El frontmatter de un agente solo admite líneas clave: valor en una línea.",
      );
    }
    const key = field[1] as string;
    if (fields.has(key)) fail(`El campo ${key} del agente está duplicado.`);
    fields.set(key, (field[2] as string).trim());
  }

  return { fields, body: text.slice(match[0].length).trim() };
}

/** Interpreta un valor booleano del frontmatter. */
function readBoolean(
  fields: Map<string, string>,
  key: string,
  fallback: boolean,
): boolean {
  const value = fields.get(key);
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  fail(`El campo ${key} del agente debe ser true o false.`);
}

/** Interpreta una lista separada por comas. */
function readCsv(fields: Map<string, string>, key: string): string[] {
  const value = fields.get(key);
  if (value === undefined || value === "") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/**
 * Analiza un agente de `.valmen/agents/<id>.md`.
 *
 * El identificador sale del nombre del archivo, no del frontmatter: así no
 * puede haber un archivo que declare un id distinto del suyo.
 */
export function parseAgent(id: string, text: string): AgentDefinition {
  const { fields, body } = splitAgentFrontmatter(text);

  const description = fields.get("description") ?? "";
  if (description === "") {
    fail(`El agente ${id} no declara description.`);
  }
  if (body === "") {
    fail(`El agente ${id} no tiene instrucciones.`);
  }

  return {
    id,
    description,
    role: fields.get("role") ?? "implementer",
    permissions: {
      write: readBoolean(fields, "write", false),
      execute: readBoolean(fields, "execute", false),
    },
    tools: readCsv(fields, "tools"),
    instructions: body,
  };
}

/** Lee todos los agentes de `.valmen/agents/`. */
export function readAgents(root: string): AgentDefinition[] {
  const directory = join(root, ".valmen", "agents");
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return [];
  }

  return names
    .filter(
      (name) =>
        name.endsWith(".md") && statSync(join(directory, name)).isFile(),
    )
    .sort()
    .map((name) => {
      const id = name.replace(/\.md$/, "");
      return parseAgent(id, readFileSync(join(directory, name), "utf8"));
    });
}

// ── Proyecciones ────────────────────────────────────────────────────────────

/** Escapa un valor para un literal de cadena TOML básico. */
function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Proyecta un agente al formato de Codex (`TOML`).
 *
 * El cuerpo va en una cadena multilínea básica de TOML, que requiere que el
 * contenido no termine en una barra invertida. Se comprueba en vez de confiar:
 * un cuerpo que termine así rompería el archivo generado en silencio.
 */
export function renderCodexAgent(
  agent: AgentDefinition,
  sources: readonly string[],
): RenderedFile {
  if (agent.instructions.endsWith("\\")) {
    fail(
      `El agente ${agent.id} no puede terminar sus instrucciones con una barra invertida: ` +
        "rompería la cadena multilínea de TOML.",
    );
  }

  const lines = [
    generatedHeaderToml(ADAPTER_VERSION, sources),
    `name = ${tomlString(agent.id)}`,
    `description = ${tomlString(agent.description)}`,
    `sandbox_mode = ${tomlString(agent.permissions.write ? "workspace-write" : "read-only")}`,
    'developer_instructions = """',
    agent.instructions,
    '"""',
    "",
  ];

  return { path: `.codex/agents/${agent.id}.toml`, content: lines.join("\n") };
}

/**
 * Proyecta un agente al formato de opencode (`Markdown` con frontmatter YAML).
 */
export function renderOpencodeAgent(
  agent: AgentDefinition,
  sources: readonly string[],
): RenderedFile {
  const lines = [
    generatedHeader(ADAPTER_VERSION, sources),
    "---",
    `description: ${agent.description}`,
    "mode: subagent",
    "permission:",
    `  edit: ${agent.permissions.write ? "allow" : "deny"}`,
    `  bash: ${agent.permissions.execute ? "allow" : "ask"}`,
    "---",
    "",
    agent.instructions,
    "",
  ];

  return { path: `.opencode/agents/${agent.id}.md`, content: lines.join("\n") };
}

/**
 * Proyecta un agente al formato de Claude Code (`Markdown` con frontmatter).
 *
 * Comparte forma con opencode pero **no** el archivo: unificarlos ahorraría
 * unas líneas y ataría dos runtimes que evolucionan por separado. El coste de
 * mantener dos funciones pequeñas es menor que el de acoplarlos.
 */
export function renderClaudeAgent(
  agent: AgentDefinition,
  sources: readonly string[],
): RenderedFile {
  const lines = [
    generatedHeader(ADAPTER_VERSION, sources),
    "---",
    `name: ${agent.id}`,
    `description: ${agent.description}`,
    agent.tools.length > 0 ? `tools: ${agent.tools.join(", ")}` : "tools:",
    "---",
    "",
    agent.instructions,
    "",
  ];

  return { path: `.claude/agents/${agent.id}.md`, content: lines.join("\n") };
}

/** Runtime soportado por la proyección. */
export type AgentRuntime = "codex" | "opencode" | "claude";

/** Todos los runtimes soportados, en orden estable. */
export const AGENT_RUNTIMES: readonly AgentRuntime[] = [
  "codex",
  "opencode",
  "claude",
];

/**
 * Proyecta todos los agentes a todos los runtimes.
 *
 * El orden de salida es determinista —runtimes en orden fijo, agentes por id—
 * para que la comparación de frescura sea fiable.
 */
export function renderAllAgents(
  agents: readonly AgentDefinition[],
  sources: readonly string[],
): RenderedFile[] {
  const files: RenderedFile[] = [];
  for (const runtime of AGENT_RUNTIMES) {
    for (const agent of agents) {
      if (runtime === "codex") files.push(renderCodexAgent(agent, sources));
      else if (runtime === "opencode")
        files.push(renderOpencodeAgent(agent, sources));
      else files.push(renderClaudeAgent(agent, sources));
    }
  }
  return files;
}
