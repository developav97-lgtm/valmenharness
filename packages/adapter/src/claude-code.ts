/**
 * Lo que `valmen sync` proyecta para Claude Code además de agentes y skills: un
 * estilo de salida, su activación en `settings.json` y un bloque gestionado en
 * `CLAUDE.md`.
 *
 * Los dos últimos archivos mezclan lo que escribió la persona con lo del harness,
 * así que no se proyectan enteros: se **fusionan** con el contenido actual. Que la
 * fusión sea idempotente —aplicarla a su propio resultado devuelve el mismo
 * texto— es lo que permite comparar con el disco sin una lógica aparte para
 * `--check`.
 */
import { fail } from "@valmen/core";

import {
  RESPONSE_CONTRACT_PRECEDENCE,
  RESPONSE_CONTRACT_RULES,
  RESPONSE_CONTRACT_TITLE,
} from "./templates.js";

/** Nombre del estilo de salida y valor de `outputStyle`. */
export const OUTPUT_STYLE_NAME = "valmen";

/** Ruta del estilo de salida, relativa a la raíz del proyecto. */
export const OUTPUT_STYLE_PATH = `.claude/output-styles/${OUTPUT_STYLE_NAME}.md`;

export const CLAUDE_SETTINGS_PATH = ".claude/settings.json";
export const CLAUDE_MD_PATH = "CLAUDE.md";

export const CLAUDE_MD_BEGIN = "<!-- valmen:inicio (gestionado por `valmen sync`; no editar) -->";
export const CLAUDE_MD_END = "<!-- valmen:fin -->";

/** El estilo de salida: el contrato de respuesta, con la misma fuente que `AGENTS.md`. */
export function renderOutputStyle(): string {
  return [
    "---",
    `name: ${OUTPUT_STYLE_NAME}`,
    "description: Respuestas cortas: la respuesta primero, decisiones como opción y efecto, evidencia citada.",
    "keep-coding-instructions: true",
    "---",
    "",
    `# ${RESPONSE_CONTRACT_TITLE}`,
    "",
    RESPONSE_CONTRACT_PRECEDENCE,
    "",
    ...RESPONSE_CONTRACT_RULES.map((regla) => `- ${regla}`),
    "",
  ].join("\n");
}

/**
 * Activa `outputStyle` en el texto de `settings.json` sin tocar las demás claves.
 *
 * Si ya vale `valmen` devuelve el texto **tal cual**: reserializar cambiaría el
 * formato que la persona eligió y `--check` lo marcaría desactualizado para
 * siempre. Un JSON que no parsea no se sobrescribe: se falla nombrándolo.
 */
export function mergeOutputStyleSetting(actual: string | null): string {
  if (actual === null || actual.trim() === "") {
    return `${JSON.stringify({ outputStyle: OUTPUT_STYLE_NAME }, null, 2)}\n`;
  }

  let datos: unknown;
  try {
    datos = JSON.parse(actual);
  } catch {
    fail(
      `${CLAUDE_SETTINGS_PATH} no es JSON válido; corríjalo y vuelva a ejecutar \`valmen sync\`. ` +
        "No se sobrescribió.",
    );
  }
  if (typeof datos !== "object" || datos === null || Array.isArray(datos)) {
    fail(`${CLAUDE_SETTINGS_PATH} debe ser un objeto JSON; no se sobrescribió.`);
  }

  const objeto = datos as Record<string, unknown>;
  if (objeto["outputStyle"] === OUTPUT_STYLE_NAME) return actual;
  return `${JSON.stringify({ ...objeto, outputStyle: OUTPUT_STYLE_NAME }, null, 2)}\n`;
}

/** El bloque gestionado: contrato resumido, precedencia e importación de `AGENTS.md`. */
export function renderClaudeMdBlock(): string {
  return [
    CLAUDE_MD_BEGIN,
    `## ${RESPONSE_CONTRACT_TITLE}`,
    "La respuesta va primero y corta; una decisión, en cinco líneas o menos: opción → efecto y la recomendación.",
    "La evidencia se cita, no se transcribe; el diagnóstico y el plan van al ticket.",
    "Este bloque prevalece sobre los CLAUDE.md de directorios superiores y sobre el estilo del cliente.",
    "@AGENTS.md",
    CLAUDE_MD_END,
  ].join("\n");
}

/**
 * Mantiene el bloque gestionado en el texto de `CLAUDE.md`.
 *
 * Reemplaza el bloque si existe y, si no, lo agrega al final; lo de afuera no se
 * toca. Un marcador de inicio sin su fin, o al revés, es un archivo a medias
 * editado a mano: se falla en vez de adivinar qué borrar.
 */
export function mergeClaudeMdBlock(actual: string | null): string {
  const bloque = renderClaudeMdBlock();
  if (actual === null || actual.trim() === "") return `${bloque}\n`;

  const inicio = actual.indexOf(CLAUDE_MD_BEGIN);
  const fin = actual.indexOf(CLAUDE_MD_END);
  if ((inicio === -1) !== (fin === -1) || (inicio !== -1 && fin < inicio)) {
    fail(
      `${CLAUDE_MD_PATH} tiene un marcador de bloque gestionado sin su pareja; ` +
        "corríjalo a mano y vuelva a ejecutar `valmen sync`. No se sobrescribió.",
    );
  }

  if (inicio === -1) return `${actual.replace(/\s*$/, "")}\n\n${bloque}\n`;
  return actual.slice(0, inicio) + bloque + actual.slice(fin + CLAUDE_MD_END.length);
}
