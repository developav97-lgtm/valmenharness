/**
 * Las skills del proyecto y su proyección a cada runtime.
 *
 * Una skill es **conocimiento procedimental** que el agente carga cuando lo
 * necesita: cómo se planifica en este proyecto, cómo se valida una interfaz, qué
 * se revisa antes de entregar. El harness ya proyectaba los **agentes** —quién
 * hace qué— desde `.valmen/agents/`; esto proyecta el **cómo**, desde
 * `.valmen/skills/`.
 *
 * Por qué importa tenerlas aquí y no repartidas por proyecto: en el proyecto que
 * originó el harness había diecisiete skills, y las de proceso —planificación,
 * pruebas, validación, revisión— eran genéricas de verdad, con el stack escrito
 * dentro. Copiarlas a cada proyecto significa que la misma tabla de «qué debe
 * quedar resuelto antes de implementar según el impacto» vive en cinco sitios y
 * diverge en cuatro. Aquí hay una sola fuente y una proyección por runtime.
 *
 * Lo que **no** es genérico no entra: las rutas, los servicios y las versiones
 * del stack salen de `.valmen/rules/stack.md` del proyecto, no de la skill. Una
 * skill del harness que dijera «Django 5.2.1» sería una skill que miente en el
 * siguiente proyecto.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { fail } from "@valmen/core";

import { ADAPTER_VERSION } from "./project.js";

/** Una skill del proyecto, ya analizada. */
export interface SkillDefinition {
  /** Identificador. Sale del nombre del directorio, no del frontmatter. */
  readonly id: string;
  readonly description: string;
  /** Cuerpo de la skill, con las instrucciones. */
  readonly instructions: string;
}

/** El nombre de una skill, tal como lo valida el estándar. */
const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** El frontmatter tiene que ser lo primero del archivo. */
const SKILL_FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const SKILL_LINE_RE = /^([A-Za-z0-9_-]+):\s*(.*)$/;

/**
 * Los runtimes a los que se proyectan las skills, con su directorio.
 *
 * `.agents/` no está: un directorio propio del harness sería un cuarto formato
 * que mantener y ningún cliente lo lee por ese nombre. Los tres de la tabla son
 * los que los clientes buscan de verdad, y `opencode` lee además los dos
 * últimos, así que la misma skill sirve en los tres sin duplicar el contenido.
 */
export const SKILL_RUNTIMES = {
  opencode: ".opencode/skills",
  claude: ".claude/skills",
  codex: ".codex/skills",
} as const;

/** Un runtime de proyección de skills. */
export type SkillRuntime = keyof typeof SKILL_RUNTIMES;

/** Todos los runtimes, en orden estable. */
export const SKILL_RUNTIME_IDS: readonly SkillRuntime[] = ["opencode", "claude", "codex"];

/** Separa el frontmatter del cuerpo. */
function splitSkillFrontmatter(text: string): {
  fields: Map<string, string>;
  body: string;
} {
  const match = SKILL_FRONTMATTER_RE.exec(text);
  if (match === null) {
    fail("Una skill de .valmen/skills/ debe iniciar con frontmatter delimitado por ---.");
  }

  const fields = new Map<string, string>();
  for (const line of (match[1] as string).split("\n")) {
    if (line.trim() === "") continue;
    const field = SKILL_LINE_RE.exec(line);
    if (field === null) {
      fail("El frontmatter de una skill solo admite líneas clave: valor en una línea.");
    }
    const key = field[1] as string;
    if (fields.has(key)) fail(`El campo ${key} de la skill está duplicado.`);
    fields.set(key, (field[2] as string).trim());
  }

  return { fields, body: text.slice(match[0].length).trim() };
}

/**
 * Interpreta una skill.
 *
 * El `name` del frontmatter se comprueba contra el nombre del directorio en vez
 * de confiar en él: los tres clientes exigen que coincidan, y si no coinciden la
 * skill **no se carga**, sin ningún error que lo explique. Es exactamente el tipo
 * de fallo silencioso que conviene detectar al proyectar y no al usar.
 */
export function parseSkill(id: string, text: string): SkillDefinition {
  const { fields, body } = splitSkillFrontmatter(text);

  const name = fields.get("name") ?? "";
  if (name === "") fail(`La skill ${id} no declara name.`);
  if (name !== id) {
    fail(
      `La skill ${id} declara name: ${name}. Tienen que coincidir: los clientes ` +
        "cargan la skill por el nombre del directorio y descartan la que no coincide.",
    );
  }
  if (!SKILL_NAME_RE.test(name)) {
    fail(
      `El nombre de la skill ${id} no cumple el formato: minúsculas, números y ` +
        "guiones simples, sin empezar ni terminar por guion.",
    );
  }

  const description = fields.get("description") ?? "";
  if (description === "") fail(`La skill ${id} no declara description.`);
  if (description.length > 1024) {
    fail(`La descripción de la skill ${id} pasa de 1024 caracteres.`);
  }

  if (body === "") fail(`La skill ${id} no tiene instrucciones.`);

  return { id, description, instructions: body };
}

/**
 * Lee las skills de `.valmen/skills/<id>/SKILL.md`.
 *
 * El formato es el del estándar —un directorio por skill con un `SKILL.md`
 * dentro— y no uno propio, para que la misma carpeta se pueda leer tal cual desde
 * el cliente sin pasar por la proyección.
 */
export function readSkills(root: string): SkillDefinition[] {
  const directory = join(root, ".valmen", "skills");
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return [];
  }

  return names
    .filter((name) => {
      try {
        return statSync(join(directory, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort()
    .map((name) => {
      const path = join(directory, name, "SKILL.md");
      let text: string;
      try {
        text = readFileSync(path, "utf8");
      } catch {
        fail(`La skill ${name} no tiene SKILL.md.`);
      }
      return parseSkill(name, text);
    });
}

/** Un archivo proyectado, listo para escribir. */
export interface RenderedSkill {
  /** Ruta relativa a la raíz, con separadores POSIX. */
  readonly path: string;
  readonly content: string;
}

/**
 * Proyecta una skill a un runtime.
 *
 * El archivo que se escribe es **la skill tal cual**, con su frontmatter intacto.
 * No se le añade un encabezado de «generado» delante porque el estándar exige que
 * el frontmatter sea lo primero del archivo, y un comentario antes lo rompería:
 * la skill dejaría de cargarse y el motivo estaría en el generador, no en el
 * cliente. La marca va **al final**, que es legal y se ve al abrirla.
 */
export function renderSkill(skill: SkillDefinition, runtime: SkillRuntime): RenderedSkill {
  const aviso = [
    "",
    "---",
    "",
    `<!-- GENERADO POR valmen v${ADAPTER_VERSION} — NO EDITAR A MANO -->`,
    `<!-- fuente:   .valmen/skills/${skill.id}/SKILL.md -->`,
    "<!-- regenerar: valmen sync -->",
    "<!-- verificar:  valmen sync --check -->",
    "",
  ].join("\n");

  return {
    path: `${SKILL_RUNTIMES[runtime]}/${skill.id}/SKILL.md`,
    content: `---\nname: ${skill.id}\ndescription: ${skill.description}\n---\n\n${skill.instructions}\n${aviso}`,
  };
}

/**
 * Proyecta todas las skills a todos los runtimes.
 *
 * El orden es determinista —runtimes en orden fijo, skills por id— para que la
 * comparación de frescura de `sync --check` sea fiable.
 */
export function renderAllSkills(skills: readonly SkillDefinition[]): RenderedSkill[] {
  const files: RenderedSkill[] = [];
  for (const runtime of SKILL_RUNTIME_IDS) {
    for (const skill of skills) {
      files.push(renderSkill(skill, runtime));
    }
  }
  return files;
}
