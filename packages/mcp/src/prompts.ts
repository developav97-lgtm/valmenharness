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
import { basename } from "node:path";

import { loadProjectModel, projectAgentsMd, readSkills } from "@valmen/adapter";

import type { PromptDefinition, PromptResult } from "./protocol.js";

/**
 * El nombre reservado del prompt que sirve las reglas del proyecto.
 *
 * Va con guiones igual que los ids de las skills, y es **reservado**: si un
 * proyecto declara una skill con este nombre, gana este prompt. La alternativa
 * —que gane la skill— haría que el mecanismo que existe para que un agente lea
 * las reglas pudiera quedar tapado por una skill, que es justo lo que no puede
 * pasar. Está escrito acá y hay un test que lo afirma.
 */
export const REGLAS_PROMPT = "reglas-del-proyecto";

/**
 * Las reglas del proyecto, como texto.
 *
 * Es el mismo documento que `valmen sync` escribe en `AGENTS.md`, generado por la
 * misma función pura. No es una segunda versión de las reglas: es la misma, leída
 * de `.valmen/` en vez del archivo proyectado.
 *
 * Existe porque un agente MCP lee las convenciones del proyecto del `AGENTS.md`
 * que encuentra en su directorio de trabajo, y **la sesión del celular no tiene
 * ese directorio**. Hermes corre desde donde viva la pasarela, no desde el
 * proyecto, así que su prompt de sistema no incluye nada de esto: sin esta puerta,
 * la conversación del celular contesta sin saber cómo se trabaja acá, y el agente
 * parece ignorar reglas que el de la máquina sí leyó.
 */
export function reglasDelProyecto(root: string): string {
  return sinEncabezado(
    projectAgentsMd(loadProjectModel(root, basename(root) || "proyecto")),
  );
}

/**
 * El documento sin su encabezado de archivo generado.
 *
 * El encabezado dice «no editar a mano» y nombra el comando que lo regenera: es
 * una advertencia para quien abre el archivo, y en una conversación no hay archivo
 * que abrir. Dejarlo metería seis líneas de metacomentario delante de las reglas,
 * que es justo lo primero que lee el agente. Es la misma decisión que con las
 * skills, que se sirven de `.valmen/skills/` y no de la copia proyectada.
 */
function sinEncabezado(texto: string): string {
  return texto.replace(/^(?:<!--[^\n]*-->[ \t]*\n)+/, "").replace(/^\n+/, "");
}

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

/** El catálogo de prompts de un proyecto: sus reglas, y después sus skills. */
export function promptsFor(root: string): readonly PromptDefinition[] {
  const reglas: PromptDefinition = {
    name: REGLAS_PROMPT,
    title: "Las reglas de este proyecto",
    description:
      "Cómo se trabaja acá: el flujo, los estados, los gates, los invariantes y las " +
      "convenciones que el proyecto ya decidió. Leelo antes de proponer un cambio.",
  };

  const skills = readSkills(root)
    .filter((skill) => skill.id !== REGLAS_PROMPT)
    .map((skill) => ({
      name: skill.id,
      title: tituloDe(skill.id, skill.instructions),
      description: skill.description,
    }));

  return [reglas, ...skills];
}

/**
 * El contenido de un prompt.
 *
 * Va como mensaje de la persona y no del asistente: es exactamente lo que alguien
 * escribiría para pedir ese procedimiento, y el protocolo espera que un prompt se
 * pueda invocar como un comando.
 */
export function getPromptFor(root: string, name: string): PromptResult {
  if (name === REGLAS_PROMPT) {
    return {
      description: "Las reglas y convenciones de este proyecto.",
      messages: [
        {
          role: "user",
          content: { type: "text", text: reglasDelProyecto(root).trimEnd() },
        },
      ],
    };
  }

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
