/**
 * Proyección del modelo del proyecto a los archivos que leen los agentes.
 *
 * El problema que resuelve: hoy la configuración agéntica vive atada a un
 * runtime. Los mismos 12 perfiles de agente existen en dos o tres formatos y
 * divergen en silencio; migrar de herramienta obliga a copiar todo a mano.
 *
 * La solución: **una sola fuente** —`.valmen/`— y una proyección determinista
 * por cada agente. `AGENTS.md` es el caso base: lo leen tanto los agentes con
 * adaptador propio como los que solo entienden el formato genérico.
 *
 * Ver docs/07-ADAPTADORES.md.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { fail } from "@valmen/core";

import { type ConfigMap, parseConfig, readList, readString } from "./config.js";
import {
  DELIVERY_TEMPLATE,
  INVARIANTS_TEMPLATE,
  WORKFLOW_TEMPLATE,
  generatedHeader,
} from "./templates.js";

/** Versión que se declara en la cabecera de los archivos generados. */
export const ADAPTER_VERSION = "0.0.1";

/** Un archivo de reglas del proyecto, ya leído. */
export interface RuleFile {
  /** Nombre del archivo, sin extensión: es el orden de composición. */
  readonly name: string;
  /** Ruta relativa a la raíz, para la cabecera de procedencia. */
  readonly source: string;
  /** Contenido íntegro. */
  readonly content: string;
}

/** Todo lo que hace falta para proyectar, ya leído del disco. */
export interface ProjectModel {
  /** Nombre del proyecto, para el título. */
  readonly name: string;
  /** Descripción de una línea, si el proyecto la declara. */
  readonly description: string;
  /** Configuración del harness. */
  readonly config: ConfigMap;
  /** Reglas del proyecto, ordenadas por nombre de archivo. */
  readonly rules: readonly RuleFile[];
}

/** Lee el contenido de un archivo, o falla con un mensaje útil. */
function readRequired(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    fail(`No se pudo leer ${path}.`);
  }
}

/**
 * Lee las reglas del proyecto desde `.valmen/rules/`.
 *
 * El orden es por nombre de archivo, y eso es deliberado: el orden de las
 * secciones en el documento generado queda bajo control del proyecto —basta
 * renombrar los archivos— sin necesidad de un índice aparte que se desincronice.
 */
export function readRules(root: string): RuleFile[] {
  const directory = join(root, ".valmen", "rules");
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
    .map((name) => ({
      name: name.replace(/\.md$/, ""),
      source: `.valmen/rules/${name}`,
      content: readRequired(join(directory, name)),
    }));
}

/** Construye el modelo del proyecto leyendo `.valmen/`. */
export function loadProjectModel(
  root: string,
  projectName: string,
): ProjectModel {
  const configPath = join(root, ".valmen", "config.yaml");
  let config: ConfigMap = {};
  try {
    config = parseConfig(readFileSync(configPath, "utf8"));
  } catch (error) {
    // Un config inválido no debe degradarse a "sin configuración": el usuario
    // creería que su archivo se aplicó cuando no fue así.
    throw error;
  }

  return {
    name: readString(config, "name", projectName),
    description: readString(config, "description", ""),
    config,
    rules: readRules(root),
  };
}

/**
 * Ajusta el encabezado de un archivo de reglas al documento compuesto.
 *
 * El título de nivel 1 ya lo aporta el documento. En vez de eliminarlo —lo que
 * dejaría el contenido de cada archivo de reglas pegado al anterior sin
 * separación visible— se **degrada a nivel 2**. Así el índice del documento
 * refleja las reglas del proyecto, que es lo que un lector necesita para
 * navegarlo.
 *
 * Si el archivo no tiene título, su contenido se incluye tal cual: el proyecto
 * decide si quiere una sección con nombre o no.
 */
function demoteTitle(content: string): string {
  const trimmed = content.trim();
  const match = /^#\s+([^\n]*)\n+/.exec(trimmed);
  if (match === null) return trimmed;
  return `## ${(match[1] as string).trim()}\n\n${trimmed.slice(match[0].length).trim()}`;
}

/**
 * Proyecta el modelo a un `AGENTS.md`.
 *
 * Composición, en orden:
 *
 * 1. Cabecera de archivo generado, con la procedencia de cada fuente.
 * 2. Título e identidad del proyecto.
 * 3. Las reglas del proyecto, tal cual las escribió el equipo.
 * 4. El flujo de trabajo del harness.
 * 5. Los invariantes de operación.
 * 6. La entrega y la documentación.
 *
 * Las reglas del proyecto van **antes** que las del harness a propósito: quien
 * lee el archivo necesita saber de qué sistema se trata antes de leer cómo se
 * trabaja en él.
 *
 * La función es pura y determinista: el mismo modelo produce siempre el mismo
 * texto. Esa propiedad es la que hace posible `valmen sync --check`.
 */
export function projectAgentsMd(model: ProjectModel): string {
  const sources = [
    ".valmen/config.yaml",
    ...model.rules.map((rule) => rule.source),
  ];

  const parts: string[] = [generatedHeader(ADAPTER_VERSION, sources)];

  const title =
    model.description === ""
      ? model.name
      : `${model.name} — ${model.description}`;
  parts.push(`# ${title}\n`);

  if (model.rules.length === 0) {
    parts.push(
      "> Este proyecto no declara reglas propias en `.valmen/rules/`. Las secciones\n" +
        "> siguientes describen cómo se trabaja aquí; añada sus reglas de dominio en\n" +
        "> `.valmen/rules/` para que se incluyan en este documento.\n",
    );
  }

  for (const rule of model.rules) {
    const body = demoteTitle(rule.content);
    if (body === "") continue;
    parts.push(`${body}\n`);
  }

  parts.push(WORKFLOW_TEMPLATE);
  parts.push(INVARIANTS_TEMPLATE);
  parts.push(DELIVERY_TEMPLATE);

  const gates = readList(model.config, "gates", []);
  if (gates.length > 0) {
    const lines = gates.map((gate) => `- \`${gate}\``);
    parts.push(
      "## Gates configurados\n\n" +
        "Este proyecto declara los siguientes gates en `.valmen/config.yaml`:\n\n" +
        lines.join("\n") +
        "\n",
    );
  }

  const registration = readString(model.config, "tickets-dir", "");
  if (registration !== "") {
    parts.push(
      "## Registro de trabajo\n\n" +
        `El registro de tickets vive en \`${registration}/\`. ` +
        "Los comandos del harness lo usan por defecto.\n",
    );
  }

  // Un solo salto de línea final: un archivo generado debe terminar siempre
  // igual, o la comparación de frescura daría falsos positivos.
  return (
    parts
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n"
  );
}
