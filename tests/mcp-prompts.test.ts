/**
 * Las skills del proyecto, por el protocolo.
 *
 * Lo que se afirma aquí es lo que **recibe el cliente**: el despacho de verdad, no
 * una función intermedia. Es la misma decisión que en `respuestaDeHerramienta` y
 * por el mismo motivo —una prueba que mira `stdout` mide el canal, no el
 * resultado—.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { REGLAS_PROMPT, getPromptFor, promptsFor } from "../packages/mcp/src/prompts.js";
import {
  atender,
  type Peticion,
  type ServerCatalog,
} from "../packages/mcp/src/protocol.js";
import { TOOLS } from "../packages/mcp/src/tools.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-prompts-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Escribe una skill en el proyecto, como la escribiría una persona. */
function escribirSkill(id: string, description: string, cuerpo: string): void {
  const directorio = join(lab, ".valmen", "skills", id);
  mkdirSync(directorio, { recursive: true });
  writeFileSync(
    join(directorio, "SKILL.md"),
    `---\nname: ${id}\ndescription: ${description}\n---\n\n${cuerpo}\n`,
    "utf8",
  );
}

/**
 * El catálogo de un servidor apuntando al laboratorio.
 *
 * `call` no se usa en estos métodos —los prompts no tocan el registro—, así que se
 * deja una función que falla si alguien la llama: si un día el despacho de prompts
 * intentara ejecutar una herramienta, esta prueba lo diría en vez de esconderlo.
 */
function catalogo(): ServerCatalog {
  return {
    name: "valmen",
    version: "0.0.1",
    tools: TOOLS,
    prompts: promptsFor(lab),
    call: () => Promise.reject(new Error("estos métodos no llaman a ninguna herramienta")),
    getPrompt: (nombre) => getPromptFor(lab, nombre),
  };
}

const pedir = (method: string, params?: Record<string, unknown>): Peticion => ({
  jsonrpc: "2.0",
  id: 1,
  method,
  ...(params === undefined ? {} : { params }),
});

describe("el catálogo de prompts", () => {
  it("publica las reglas del proyecto primero, y después las skills", () => {
    // Las reglas van primero por la misma razón por la que el `AGENTS.md` las pone
    // antes: quien lee necesita saber de qué sistema se trata y cómo se trabaja en
    // él antes de leer un procedimiento suelto.
    escribirSkill(
      "planificacion",
      "Usar antes de implementar un ticket.",
      "# Planificación\n\nProducir un plan verificable.\n",
    );
    escribirSkill("revision-final", "Revisar antes de entregar.", "Sin encabezado.\n");

    const prompts = promptsFor(lab);
    expect(prompts.map((prompt) => prompt.name)).toEqual([
      REGLAS_PROMPT,
      "planificacion",
      "revision-final",
    ]);
    expect(prompts[1]?.description).toBe("Usar antes de implementar un ticket.");
    // El título sale del encabezado que escribió quien escribió la skill.
    expect(prompts[1]?.title).toBe("Planificación");
    // Y si no hay encabezado, el nombre del directorio: nunca un título vacío.
    expect(prompts[2]?.title).toBe("revision-final");
  });

  it("un proyecto sin skills igual ofrece sus reglas", () => {
    // Las reglas no dependen de que el proyecto declare skills: son el documento
    // que `valmen sync` ya escribe, y un proyecto sin skills también tiene flujo,
    // estados y gates que un agente tiene que conocer.
    const prompts = promptsFor(lab);
    expect(prompts.map((prompt) => prompt.name)).toEqual([REGLAS_PROMPT]);
    // Y la lista de los que sí hay sirve para corregir sin adivinar: antes decía
    // «el proyecto no declara skills», que ahora sería falso.
    expect(() => getPromptFor(lab, "cualquiera")).toThrow(/reglas-del-proyecto/);
  });

  it("las reglas son el mismo documento que se proyecta a AGENTS.md", () => {
    // No es una segunda versión de las reglas: es la misma, generada por la misma
    // función pura y leída de `.valmen/`. Servir una copia dejaría que el agente
    // del celular siguiera una versión y el de la máquina otra.
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(
      join(lab, ".valmen", "config.yaml"),
      "name: Proyecto de prueba\ntickets-dir: tickets\n",
      "utf8",
    );
    mkdirSync(join(lab, ".valmen", "rules"), { recursive: true });
    writeFileSync(
      join(lab, ".valmen", "rules", "proyecto.md"),
      "# Cómo se trabaja\n\nSe trabaja en modo directo.\n",
      "utf8",
    );

    const texto = getPromptFor(lab, REGLAS_PROMPT).messages[0]?.content as {
      type: string;
      text: string;
    };
    expect(texto.text).toContain("Proyecto de prueba");
    expect(texto.text).toContain("Se trabaja en modo directo.");
    // Y es exactamente lo que se proyecta, sin una marca de archivo generado que
    // no aporta nada en una conversación.
    expect(texto.text).not.toContain("NO EDITAR A MANO");
  });

  it("el nombre del prompt de reglas está reservado: una skill no lo tapa", () => {
    // El mecanismo que existe para que un agente lea las reglas no puede quedar
    // tapado por una skill con el mismo nombre.
    escribirSkill(REGLAS_PROMPT, "Una skill con el nombre reservado.", "# Otra cosa\n");
    const prompts = promptsFor(lab);
    expect(prompts.map((prompt) => prompt.name)).toEqual([REGLAS_PROMPT]);
    expect(prompts[0]?.title).toBe("Las reglas de este proyecto");
  });

  it("el contenido sale de la fuente, sin la marca de archivo generado", () => {
    // La skill se proyecta a `.opencode/skills/` con una marca al final. Servir esa
    // copia metería la marca en la conversación y, peor, ataría los prompts a que
    // alguien haya corrido `valmen sync`. Se sirve `.valmen/skills/`, que es la
    // fuente y no puede estar vieja.
    escribirSkill(
      "revision-final",
      "Revisar antes de entregar.",
      "# Revisión final\n\nPaso 1.\n",
    );
    mkdirSync(join(lab, ".opencode", "skills", "revision-final"), { recursive: true });
    writeFileSync(
      join(lab, ".opencode", "skills", "revision-final", "SKILL.md"),
      "copia proyectada, no la fuente\n",
      "utf8",
    );

    const resultado = getPromptFor(lab, "revision-final");
    const texto = resultado.messages[0]?.content.text ?? "";
    expect(texto).toContain("# Revisión final");
    expect(texto).not.toContain("GENERADO POR valmen");
    expect(texto).not.toContain("copia proyectada");
  });
});

describe("el protocolo de prompts", () => {
  it("declara la capacidad, para que el cliente sepa que puede pedirlos", async () => {
    const respuesta = (await atender(pedir("initialize"), catalogo())) as {
      capabilities: Record<string, unknown>;
    };
    expect(respuesta.capabilities["prompts"]).toEqual({ listChanged: false });
    // Y sigue declarando las herramientas: agregar una capacidad no puede quitar
    // la otra.
    expect(respuesta.capabilities["tools"]).toEqual({ listChanged: false });
  });

  it("`prompts/list` devuelve lo que el cliente muestra en su menú", async () => {
    escribirSkill("planificacion", "Antes de implementar.", "# Planificación\n\nCuerpo.\n");
    const respuesta = (await atender(pedir("prompts/list"), catalogo())) as {
      prompts: readonly Record<string, unknown>[];
    };

    // Dos: las reglas del proyecto y la skill. Las reglas siempre están.
    expect(respuesta.prompts).toHaveLength(2);
    expect(respuesta.prompts[1]).toEqual({
      name: "planificacion",
      title: "Planificación",
      description: "Antes de implementar.",
    });
  });

  it("`prompts/get` devuelve el procedimiento como mensaje de la persona", async () => {
    escribirSkill("planificacion", "Antes de implementar.", "# Planificación\n\nCuerpo.\n");
    const respuesta = (await atender(
      pedir("prompts/get", { name: "planificacion" }),
      catalogo(),
    )) as {
      description: string;
      messages: readonly { role: string; content: { type: string; text: string } }[];
    };

    // Rol `user` y no `assistant`: es lo que alguien escribiría para pedir ese
    // procedimiento, y es lo que el cliente espera poder invocar como un comando.
    expect(respuesta.messages).toHaveLength(1);
    expect(respuesta.messages[0]?.role).toBe("user");
    expect(respuesta.messages[0]?.content.type).toBe("text");
    expect(respuesta.messages[0]?.content.text).toContain("Cuerpo.");
    expect(respuesta.description).toBe("Antes de implementar.");
  });

  it("un prompt que no existe se contesta con los que sí", async () => {
    escribirSkill("planificacion", "Antes de implementar.", "# Planificación\n");
    await expect(
      atender(pedir("prompts/get", { name: "no-existe" }), catalogo()),
    ).rejects.toThrow(/planificacion/);
  });

  it("un método que no existe sigue siendo un error de protocolo", async () => {
    await expect(atender(pedir("resources/list"), catalogo())).rejects.toThrow(
      /no soportado/,
    );
  });
});
