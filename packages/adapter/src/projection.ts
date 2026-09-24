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
import { fail } from "@valmen/core";

import { type ConfigMap, readList } from "./config.js";
import { readAgents, renderAllAgents } from "./agents.js";
import { loadProjectModel, projectAgentsMd } from "./project.js";
import {
  type SkillRuntime,
  RUNTIME_DIRS,
  SKILL_RUNTIME_IDS,
  readSkills,
  renderAllSkills,
} from "./skills.js";

/**
 * Los runtimes a los que este proyecto quiere proyectar.
 *
 * Sin declararlos, se proyecta a todos: es lo que espera quien adopta el harness
 * sin saber todavía con qué agentes va a trabajar, y no rompe nada. Un valor que
 * no corresponda a un runtime conocido **falla** en vez de ignorarse: un nombre
 * mal escrito que se descarta en silencio deja al usuario sin los archivos que
 * pidió y sin ninguna señal de por qué.
 */
function readRuntimes(config: ConfigMap): readonly SkillRuntime[] {
  const declarados = readList(config, "runtimes", SKILL_RUNTIME_IDS);
  if (declarados.length === 0) {
    fail(
      'config.yaml: "runtimes" no puede estar vacío; quite la clave para proyectar a todos.',
    );
  }

  return declarados.map((nombre) => {
    if (!SKILL_RUNTIME_IDS.includes(nombre as SkillRuntime)) {
      fail(
        `config.yaml: "${nombre}" no es un runtime conocido. ` +
          `Los que hay: ${SKILL_RUNTIME_IDS.join(", ")}.`,
      );
    }
    return nombre as SkillRuntime;
  });
}

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
  readonly byRuntime: Readonly<Record<SkillRuntime, number>>;
  /** Cuántas reglas del proyecto entraron en `AGENTS.md`. */
  readonly ruleCount: number;
  /**
   * Los conteos, por separado.
   *
   * `byRuntime` cuenta por prefijo de ruta y por eso mezcla agentes con skills:
   * los dos viven bajo `.codex/`, `.opencode/` y `.claude/`. Sirve para saber
   * cuántos archivos toca cada runtime, pero **no** para informar de cuántos
   * agentes se proyectaron, que es lo que se muestra. Confundirlos dio un
   * «agentes proyectados» que incluía las skills.
   */
  readonly agentCount: number;
  readonly skillCount: number;
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
  const skills = readSkills(root);

  // A qué runtimes se proyecta. Un proyecto que trabaja con un solo agente puede
  // declararlo y no recibir los archivos de los otros tres: mantener
  // configuraciones que nadie lee es ruido que se revisa en cada `git status`, y
  // en el caso de `.claude/` puede llegar a ser mucho ruido —el proyecto que
  // originó el harness tenía 235 MB de legado ahí dentro.
  const runtimes = readRuntimes(model.config);
  const enAlcance = (path: string): boolean =>
    runtimes.some((runtime) => path.startsWith(RUNTIME_DIRS[runtime]));

  // El documento, los agentes y las skills salen del mismo modelo, así que se
  // proyectan juntos: un `AGENTS.md` actualizado con agentes viejos sería
  // incoherente, y una skill que contradijera la regla del proyecto también.
  const sources = [
    ".valmen/config.yaml",
    ...model.rules.map((rule) => rule.source),
    ...agents.map((agent) => `.valmen/agents/${agent.id}.md`),
    ...skills.map((skill) => `.valmen/skills/${skill.id}/SKILL.md`),
  ];

  const files: ProjectedFile[] = [
    { path: "AGENTS.md", content: projectAgentsMd(model) },
    ...renderAllAgents(agents, sources).filter((file) => enAlcance(file.path)),
    ...renderAllSkills(skills).filter((file) => enAlcance(file.path)),
  ];

  return {
    files,
    sources,
    // Los conteos se **derivan** de la lista de runtimes y no se escriben a mano.
    // Escritos a mano se desincronizaron en cuanto se agregó `.agents/`: los
    // archivos se proyectaban bien y el informe no los nombraba, que es la peor
    // combinación —el trabajo hecho y el informe diciendo que no—.
    byRuntime: Object.fromEntries(
      SKILL_RUNTIME_IDS.map((runtime) => [
        runtime,
        files.filter((file) => file.path.startsWith(RUNTIME_DIRS[runtime])).length,
      ]),
    ) as Record<SkillRuntime, number>,
    ruleCount: model.rules.length,
    agentCount: agents.length,
    skillCount: skills.length,
  };
}
