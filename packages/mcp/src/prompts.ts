/**
 * Las skills del proyecto, ofrecidas como *prompts* del protocolo.
 *
 * Una skill del harness es un procedimiento escrito: cómo planificar un ticket,
 * cómo revisarlo, cómo validar la interfaz. Hoy se **proyectan** a
 * `.opencode/skills/`, `.claude/skills/` y `.codex/skills/`, y eso funciona con
 * esos tres clientes y con ningún otro: cada agente nuevo exige escribir un
 * adaptador, y el adaptador es una copia que se desincroniza.
 *
 * Como prompt MCP, la skill la recibe cualquier cliente que hable el protocolo
 * —presente o futuro— sin escribir una línea más. Y se lee de
 * `.valmen/skills/`, que es la fuente: no hay una segunda copia que pueda quedar
 * vieja, que es el problema que la proyección tiene y esta puerta no.
 *
 * Sin argumentos, a propósito. Las skills del harness resuelven por sí solas qué
 * leer —el ticket, las reglas, el registro—, y declarar argumentos que no usan
 * sería inventar un contrato que nadie escribió.
 */
import { readSkills } from "@valmen/adapter";

import type { PromptDefinition, PromptResult } from "./protocol.js";

/**
 * El título de una skill.
 *
 * Sale de su primer encabezado, que es como la escribió quien la escribió; el
 * nombre del directorio es el respaldo para una skill que todavía no tiene
 * cuerpo. Es presentación, no una segunda fuente: si el encabezado cambia, el
 * título cambia con él.
 */
function tituloDe(id: string, instructions: string): string {
  for (const linea of instructions.split("\n")) {
    const limpia = linea.trim();
    if (limpia.startsWith("# ")) return limpia.slice(2).trim();
  }
  return id;
}

/** El catálogo de prompts de un proyecto. */
export function promptsFor(root: string): readonly PromptDefinition[] {
  return readSkills(root).map((skill) => ({
    name: skill.id,
    title: tituloDe(skill.id, skill.instructions),
    description: skill.description,
  }));
}

/**
 * El contenido de un prompt.
 *
 * Va como mensaje de la persona y no del asistente: es exactamente lo que alguien
 * escribiría para pedir ese procedimiento, y el protocolo espera que un prompt se
 * pueda invocar como un comando.
 */
export function getPromptFor(root: string, name: string): PromptResult {
  const skill = readSkills(root).find((candidata) => candidata.id === name);
  if (skill === undefined) {
    const disponibles = promptsFor(root).map((prompt) => prompt.name);
    throw new Error(
      `Prompt desconocido: "${name}". Los que hay: ` +
        `${disponibles.length === 0 ? "(ninguno: el proyecto no declara skills)" : disponibles.join(", ")}.`,
    );
  }

  return {
    description: skill.description,
    messages: [
      {
        role: "user",
        content: { type: "text", text: skill.instructions.trimEnd() },
      },
    ],
  };
}
