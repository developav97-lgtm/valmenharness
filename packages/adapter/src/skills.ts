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
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { fail } from "@valmen/core";

import { ADAPTER_VERSION, type ProjectModel, demoteTitle } from "./project.js";
import { compactPorQue, isStandardRule, routedRules } from "./rule-projection.js";

/** Una skill del proyecto, ya analizada. */
export interface SkillDefinition {
  /** Identificador. Sale del nombre del directorio, no del frontmatter. */
  readonly id: string;
  readonly description: string;
  /** Cuerpo de la skill, con las instrucciones. */
  readonly instructions: string;
  /**
   * La versión que declara el frontmatter, si la declara.
   *
   * Solo las skills publicadas por el harness la llevan; una del proyecto no
   * tiene por qué versionarse, y `null` es «no declara» y no «versión cero».
   */
  readonly version: string | null;
  /** `valmen` cuando la publicó el harness; `null` en una del proyecto. */
  readonly origen: string | null;
  /**
   * Lo que el proyecto agrega a una skill publicada, de `.valmen/skills/<id>/local.md`.
   *
   * Existe para que extender una skill no exija bifurcarla: el archivo publicado
   * se puede actualizar sin pisar lo propio, porque lo propio vive en otro archivo
   * y la proyección lo concatena al final.
   */
  readonly local: string | null;
  /**
   * Las reglas del proyecto que `rules-to-skills` encamina a esta skill, ya
   * proyectadas.
   *
   * Opcional a propósito: una skill que nadie encamina no las lleva, y se proyecta
   * byte a byte como antes de que existiera el mecanismo. Se cargan con
   * `withRoutedRules`, no con `readSkills`, porque necesitan el modelo del proyecto.
   */
  readonly rules?: readonly SkillRule[];
}

/** Una regla del proyecto proyectada dentro de una skill. */
export interface SkillRule {
  /** Ruta de la regla, relativa a la raíz: de dónde sale el texto. */
  readonly source: string;
  /** El texto ya proyectado: título degradado a nivel 2 y «Por qué» en una línea. */
  readonly text: string;
}

/** El nombre de una skill, tal como lo valida el estándar. */
const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** El frontmatter tiene que ser lo primero del archivo. */
const SKILL_FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const SKILL_LINE_RE = /^([A-Za-z0-9_-]+):\s*(.*)$/;

/**
 * Los runtimes a los que se proyectan las skills, con su directorio.
 *
 * Los tres primeros son los que los clientes buscan de verdad, y `opencode` lee
 * además los dos últimos, así que la misma skill sirve en los tres sin duplicar
 * el contenido.
 *
 * **`.agents/` se sumó después, y el motivo por el que no estaba era correcto y
 * dejó de serlo.** El comentario decía que un directorio propio del harness sería
 * un cuarto formato que nadie lee por ese nombre; pero `.agents/skills/` no es
 * nuestro: es la convención cross-tool que varios CLIs de agentes comparten, y
 * Hermes la lee como skills **project-local** de máxima precedencia. La
 * diferencia con el MCP, que ya sirve estas mismas skills como prompts, no es
 * cosmética: por el protocolo el agente tiene que saber que puede pedirlas,
 * mientras que proyectadas aparecen en su índice, se cargan solas cuando vienen
 * al caso y quedan como `/comando`. Es la diferencia entre que estén disponibles y
 * que el agente las use.
 *
 * La proyección **solo escribe**: nunca borra el directorio ni lo vacía, así que
 * compartirlo con otras herramientas no les toca nada.
 */
export const SKILL_RUNTIMES = {
  opencode: ".opencode/skills",
  claude: ".claude/skills",
  codex: ".codex/skills",
  agents: ".agents/skills",
} as const;

/**
 * El directorio raíz de cada runtime.
 *
 * Es lo que decide si un archivo entra en la proyección, y por eso es el
 * directorio y no el subdirectorio: bajo `.opencode/` viven los agentes y las
 * skills, así que filtrar por `.opencode/skills` dejaba a los agentes fuera. El
 * fallo era silencioso —la proyección salía sin agentes y sin ningún error— y por
 * eso el prefijo se declara aparte de la ruta de las skills.
 */
export const RUNTIME_DIRS = {
  opencode: ".opencode/",
  claude: ".claude/",
  codex: ".codex/",
  agents: ".agents/",
} as const;

/** Un runtime de proyección de skills. */
export type SkillRuntime = keyof typeof SKILL_RUNTIMES;

/** Todos los runtimes, en orden estable. */
export const SKILL_RUNTIME_IDS: readonly SkillRuntime[] = [
  "opencode",
  "claude",
  "codex",
  "agents",
];

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

  return {
    id,
    description,
    instructions: body,
    version: fields.get("version") ?? null,
    origen: fields.get("origen") ?? null,
    local: null,
  };
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
      // `local.md` es del proyecto y no se versiona: se concatena al proyectar y
      // nunca lo escribe el harness.
      let local: string | null = null;
      try {
        local = readFileSync(join(directory, name, "local.md"), "utf8");
      } catch {
        local = null;
      }

      return { ...parseSkill(name, text), local };
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
  const reglas = skill.rules ?? [];
  const aviso = [
    "",
    "---",
    "",
    `<!-- GENERADO POR valmen v${ADAPTER_VERSION} — NO EDITAR A MANO -->`,
    `<!-- fuente:   .valmen/skills/${skill.id}/SKILL.md -->`,
    ...reglas.map((regla) => `<!-- reglas proyectadas: ${regla.source} -->`),
    "<!-- regenerar: valmen sync -->",
    "<!-- verificar:  valmen sync --check -->",
    "",
  ].join("\n");

  // Lo del proyecto va **después** del aviso de generado, y no antes: la marca
  // señala dónde termina lo que el harness reescribe, y `local.md` es lo único
  // que el harness no toca. Con la marca en medio, un archivo sin `local.md`
  // sigue terminando igual que siempre.
  // Las reglas encaminadas son parte de lo que el harness genera, así que van antes
  // de la marca y no después de ella con lo que es del proyecto.
  const cuerpo = [skill.instructions, ...reglas.map((regla) => regla.text)].join("\n\n");
  const partes = [
    `---\nname: ${skill.id}\ndescription: ${skill.description}\n---\n\n${cuerpo}\n${aviso}`,
  ];
  if (skill.local !== null && skill.local.trim() !== "") partes.push(skill.local.trim());

  return {
    path: `${SKILL_RUNTIMES[runtime]}/${skill.id}/SKILL.md`,
    content: partes.join("\n"),
  };
}

/**
 * Suma a cada skill las reglas del proyecto que `rules-to-skills` le encamina.
 *
 * Es el otro lado del puntero que `projectAgentsMd` deja en `AGENTS.md`: la regla
 * sale de ahí y entra aquí, con el mismo tratamiento (título degradado, «Por qué» en
 * una línea). Es una función aparte de `readSkills` porque necesita el modelo del
 * proyecto, y la comparten la proyección a archivos y el prompt MCP de cada skill: si
 * cada una armara su copia, el cliente MCP leería unas reglas y el archivo otras.
 *
 * Falla si una regla o una skill nombradas no existen: una regla que el proyecto
 * creyó mover y que no llegó a ninguna skill dejó de estar vigente para quien la
 * necesita, y no avisa.
 */
export function withRoutedRules(
  skills: readonly SkillDefinition[],
  model: Pick<ProjectModel, "config" | "rules">,
): SkillDefinition[] {
  const encaminadas = routedRules(model.config);
  const nombres = Object.keys(encaminadas);
  if (nombres.length === 0) return [...skills];

  const reglasPorNombre = new Map(model.rules.map((regla) => [regla.name, regla]));
  const idsDeSkills = new Set(skills.map((skill) => skill.id));

  for (const nombre of nombres) {
    if (!reglasPorNombre.has(nombre)) {
      const hay = model.rules.map((regla) => regla.name).join(", ") || "ninguna";
      fail(
        `config.yaml: "rules-to-skills.${nombre}" nombra una regla que no existe en ` +
          `.valmen/rules/. Las que hay: ${hay}.`,
      );
    }
    for (const id of encaminadas[nombre] as readonly string[]) {
      if (!idsDeSkills.has(id)) {
        const hay = [...idsDeSkills].join(", ") || "ninguna";
        fail(
          `config.yaml: "rules-to-skills.${nombre}" nombra la skill "${id}", que no existe ` +
            `en .valmen/skills/. Las que hay: ${hay}.`,
        );
      }
    }
  }

  return skills.map((skill) => {
    const reglas: SkillRule[] = [];
    // Siguen el orden de los archivos de reglas, como en `AGENTS.md`.
    for (const regla of model.rules) {
      if (!(encaminadas[regla.name] ?? []).includes(skill.id)) continue;
      // La misma regla de compactación que en `AGENTS.md`: solo los estándares.
      const contenido = isStandardRule(regla)
        ? compactPorQue(regla.content).text
        : regla.content;
      reglas.push({ source: regla.source, text: demoteTitle(contenido) });
    }
    return reglas.length === 0 ? skill : { ...skill, rules: reglas };
  });
}

/**
 * Todo lo que una skill dice, en el orden en que se lee: sus instrucciones, las
 * reglas que se le encaminaron y lo propio del proyecto (`local.md`).
 *
 * Es lo que sirve el prompt MCP de la skill. Una skill sin reglas encaminadas ni
 * `local.md` devuelve exactamente sus instrucciones.
 */
export function skillText(skill: SkillDefinition): string {
  const partes = [skill.instructions, ...(skill.rules ?? []).map((regla) => regla.text)];
  if (skill.local !== null && skill.local.trim() !== "") partes.push(skill.local.trim());
  return partes.join("\n\n").trimEnd();
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

/**
 * El catálogo de skills que publica el harness.
 *
 * Es la respuesta a un problema medido, no a una idea: la misma skill de proceso
 * vivía en una copia por proyecto y las copias divergieron —`planificacion` con 81
 * líneas en el harness y 77 en SaiOpenCloud, y a la segunda le faltaba justo el
 * bloque que el motor reconoce para el gate de plan—, sin nada que lo detectara.
 * Aquí hay **una** fuente, con versión, y una copia por proyecto que se compara
 * contra ella.
 *
 * Qué entra y qué no: entra lo que describe **cómo cualquier proyecto planifica,
 * prueba, revisa o entrega**; no entra lo que nombra un archivo, un servicio, una
 * versión o una convención de un stack concreto. Eso último es del proyecto, vive
 * en su `.valmen/skills/` y este catálogo no lo mira ni lo pisa.
 *
 * La ruta se resuelve desde este módulo y no desde el directorio de trabajo, para
 * que la misma llamada funcione desde el repositorio, desde `dist/` y desde un
 * proyecto adoptado en cualquier parte del disco.
 */
export const CATALOGO_DIR = fileURLToPath(new URL("../../../skills/", import.meta.url));

/** Una skill publicada por el harness, con su versión y su huella. */
export interface Publicada {
  readonly id: string;
  readonly description: string;
  readonly instructions: string;
  readonly version: string;
  readonly origen: string;
  /** sha256 del archivo publicado, para detectar una edición a mano. */
  readonly hash: string;
  /** El archivo tal cual, que es lo que se instala en el proyecto. */
  readonly texto: string;
}

/** Por qué una copia del proyecto no coincide con la publicada. */
export type MotivoDeDeriva = "falta" | "version" | "editada";

/** Una diferencia entre la copia del proyecto y el catálogo. */
export interface DerivaPublicada {
  readonly id: string;
  readonly motivo: MotivoDeDeriva;
  /** La versión que declara la copia del proyecto, o `null` si no declara. */
  readonly versionProyecto: string | null;
  readonly versionPublicada: string;
}

/** El sha256 de un texto. */
function hashDeTexto(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/** Lee la versión del frontmatter de un texto, o `null` si no la declara. */
function versionDeTexto(texto: string): string | null {
  return /^version:\s*(\S+)\s*$/m.exec(texto)?.[1] ?? null;
}

/**
 * Las skills que publica el harness, por id.
 *
 * Una skill del catálogo sin `version:` o sin `origen: valmen` se rechaza: es lo
 * que distingue una publicada de una del proyecto, y sin eso la comparación no
 * tiene con qué comparar.
 */
export function publicadas(dir: string = CATALOGO_DIR): Publicada[] {
  let nombres: string[];
  try {
    nombres = readdirSync(dir);
  } catch {
    return [];
  }

  return nombres
    .filter((nombre) => {
      try {
        return statSync(join(dir, nombre)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort()
    .map((id) => {
      const ruta = join(dir, id, "SKILL.md");
      let texto: string;
      try {
        texto = readFileSync(ruta, "utf8");
      } catch {
        fail(`La skill publicada ${id} no tiene SKILL.md en ${ruta}.`);
      }

      const skill = parseSkill(id, texto);
      const version = skill.version;
      if (version === null) {
        fail(`La skill publicada ${id} no declara version en su frontmatter.`);
      }
      if (skill.origen !== "valmen") {
        fail(
          `La skill publicada ${id} declara origen: ${skill.origen ?? "nada"}. ` +
            "Tiene que ser `valmen`: es lo que la distingue de una skill del proyecto.",
        );
      }

      return {
        id,
        description: skill.description,
        instructions: skill.instructions,
        version,
        origen: "valmen",
        hash: hashDeTexto(texto),
        texto,
      };
    });
}

/** Una skill publicada, o `null` si el harness no publica ese id. */
export function publicada(id: string, dir: string = CATALOGO_DIR): Publicada | null {
  return publicadas(dir).find((skill) => skill.id === id) ?? null;
}

/** La versión publicada de una skill. Falla si el harness no la publica. */
export function versionPublicada(id: string, dir: string = CATALOGO_DIR): string {
  const skill = publicada(id, dir);
  if (skill === null) fail(`El harness no publica la skill ${id}.`);
  return skill.version;
}

/** El sha256 del archivo publicado de una skill. */
export function hashPublicado(id: string, dir: string = CATALOGO_DIR): string {
  const skill = publicada(id, dir);
  if (skill === null) fail(`El harness no publica la skill ${id}.`);
  return skill.hash;
}

/** Los ids publicados que el proyecto tiene copiados en `.valmen/skills/`. */
export function publicadasDelProyecto(root: string, dir: string = CATALOGO_DIR): string[] {
  return publicadas(dir)
    .filter((skill) => exists(join(root, ".valmen", "skills", skill.id, "SKILL.md")))
    .map((skill) => skill.id);
}

/** Si un archivo existe. */
function exists(ruta: string): boolean {
  try {
    return statSync(ruta).isFile();
  } catch {
    return false;
  }
}

/** La ruta de la copia del proyecto de una skill publicada. */
function copiaDelProyecto(root: string, id: string): string {
  return join(root, ".valmen", "skills", id, "SKILL.md");
}

/**
 * En qué se diferencia lo que el proyecto tiene de lo que el harness publica.
 *
 * Tres motivos, y se informan distinto porque se arreglan distinto: `falta` es una
 * instalación pendiente, `version` es una copia anterior —se actualiza sin
 * discusión—, y `editada` es contenido cambiado a mano, que se actualiza
 * **pisándolo**: por eso el aviso dice qué archivo es y ofrece `local.md` como el
 * sitio donde eso debería vivir.
 */
export function derivaPublicada(
  root: string,
  dir: string = CATALOGO_DIR,
): DerivaPublicada[] {
  const deriva: DerivaPublicada[] = [];

  for (const skill of publicadas(dir)) {
    const ruta = copiaDelProyecto(root, skill.id);
    if (!exists(ruta)) {
      deriva.push({
        id: skill.id,
        motivo: "falta",
        versionProyecto: null,
        versionPublicada: skill.version,
      });
      continue;
    }

    const texto = readFileSync(ruta, "utf8");
    const versionProyecto = versionDeTexto(texto);
    if (versionProyecto !== skill.version) {
      deriva.push({
        id: skill.id,
        motivo: "version",
        versionProyecto,
        versionPublicada: skill.version,
      });
      continue;
    }

    if (hashDeTexto(texto) !== skill.hash) {
      deriva.push({
        id: skill.id,
        motivo: "editada",
        versionProyecto,
        versionPublicada: skill.version,
      });
    }
  }

  return deriva;
}

/**
 * El texto con el que un informe explica la deriva.
 *
 * Dice el id, el motivo y las dos versiones: un aviso que solo dijera «hay
 * diferencias» obligaría a abrir dos repositorios para saber cuáles.
 */
export function descripcionDeDeriva(deriva: readonly DerivaPublicada[]): string {
  const lineas = deriva.map((diferencia) => {
    if (diferencia.motivo === "falta") {
      return `  · ${diferencia.id} — no está instalada (el harness publica ${diferencia.versionPublicada})`;
    }
    if (diferencia.motivo === "version") {
      return (
        `  · ${diferencia.id} — versión ${diferencia.versionProyecto ?? "sin declarar"} en el ` +
        `proyecto, ${diferencia.versionPublicada} en el harness`
      );
    }
    return `  · ${diferencia.id} — copia editada a mano sobre la versión ${diferencia.versionPublicada}`;
  });

  return [
    `Hay ${deriva.length} skill(s) publicadas que no coinciden con el catálogo del harness:`,
    ...lineas,
    "Ejecute `valmen sync` para actualizarlas. Si la edición fue deliberada, eso va en",
    "`.valmen/skills/<id>/local.md`: se concatena al proyectar y `sync` no lo toca.",
  ].join("\n");
}

/**
 * Instala en el proyecto las skills publicadas, y devuelve los ids que escribió.
 *
 * Idempotente: lo que ya coincide no se reescribe, para no cambiar la fecha de un
 * archivo que nadie modificó. Nunca toca una skill del proyecto —solo recorre los
 * ids publicados— ni `local.md`.
 *
 * **Pisa una copia editada a mano.** Es deliberado y es el otro lado del check: la
 * compuerta nombra la edición, y quien ejecuta `sync` acepta el reemplazo. Por eso
 * `sync --check` la nombra antes, en vez de dejar que la actualización la borre sin
 * aviso.
 */
export function instalarPublicadas(root: string, dir: string = CATALOGO_DIR): string[] {
  const escritas: string[] = [];

  for (const skill of publicadas(dir)) {
    const ruta = copiaDelProyecto(root, skill.id);
    if (exists(ruta) && readFileSync(ruta, "utf8") === skill.texto) continue;

    mkdirSync(join(root, ".valmen", "skills", skill.id), { recursive: true });
    writeFileSync(ruta, skill.texto, "utf8");
    escritas.push(skill.id);
  }

  return escritas;
}
