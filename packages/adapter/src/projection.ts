/**
 * La proyección completa del proyecto, en un solo sitio.
 *
 * Estaba dentro del comando `sync`. Vive en su propio módulo, y no en
 * `project.ts` ni en `agents.ts`, porque necesita a los dos y crearía un ciclo
 * de importaciones: `agents.ts` ya toma la versión del adaptador de
 * `project.ts`.
 *
 * Mission Control regenera los mismos archivos desde la app. Dos
 * orquestaciones distintas podrían producir un `AGENTS.md` distinto según quién
 * lo genere, que es exactamente lo que una proyección determinista existe para
 * impedir.
 */
import { readAgents, renderAllAgents } from "./agents.js";
import { loadProjectModel, projectAgentsMd } from "./project.js";

/** Un archivo generado, con su ruta relativa a la raíz. */
export interface ProjectedFile {
  readonly path: string;
  readonly content: string;
}

/** La proyección completa del proyecto, calculada sin tocar el disco. */
export interface Projection {
  readonly files: readonly ProjectedFile[];
  /** Archivos que son fuente de la proyección, para el encabezado generado. */
  readonly sources: readonly string[];
  /** Cuántos archivos se generan por runtime de agente. */
  readonly byRuntime: {
    readonly codex: number;
    readonly opencode: number;
    readonly claude: number;
  };
  /** Cuántas reglas del proyecto entraron en `AGENTS.md`. */
  readonly ruleCount: number;
}

/**
 * Calcula todos los archivos generados del proyecto.
 *
 * Estaba dentro del comando `sync`. Vive aquí porque Mission Control regenera
 * los mismos archivos desde la app: dos orquestaciones distintas podrían
 * producir un `AGENTS.md` distinto según quién lo genere, que es exactamente lo
 * que la proyección determinista existe para impedir.
 *
 * `configText` permite proyectar un texto que todavía no está en disco.
 */
export function projectFiles(
  root: string,
  projectName: string,
  configText?: string,
): Projection {
  const model = loadProjectModel(root, projectName, configText);
  const agents = readAgents(root);

  // El documento y los agentes salen del mismo modelo, así que se proyectan
  // juntos: un `AGENTS.md` actualizado con agentes viejos sería incoherente.
  const sources = [
    ".valmen/config.yaml",
    ...model.rules.map((rule) => rule.source),
    ...agents.map((agent) => `.valmen/agents/${agent.id}.md`),
  ];

  const files: ProjectedFile[] = [
    { path: "AGENTS.md", content: projectAgentsMd(model) },
    ...renderAllAgents(agents, sources),
  ];

  return {
    files,
    sources,
    byRuntime: {
      codex: files.filter((file) => file.path.startsWith(".codex/")).length,
      opencode: files.filter((file) => file.path.startsWith(".opencode/")).length,
      claude: files.filter((file) => file.path.startsWith(".claude/")).length,
    },
    ruleCount: model.rules.length,
  };
}
