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

import { getPromptFor, promptsFor } from "../packages/mcp/src/prompts.js";
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
  it("publica las skills del proyecto con su descripción y su título", () => {
    escribirSkill(
      "planificacion",
      "Usar antes de implementar un ticket.",
      "# Planificación\n\nProducir un plan verificable.\n",
    );
    escribirSkill("revision-final", "Revisar antes de entregar.", "Sin encabezado.\n");

    const prompts = promptsFor(lab);
    expect(prompts.map((prompt) => prompt.name)).toEqual([
      "planificacion",
      "revision-final",
    ]);
    expect(prompts[0]?.description).toBe("Usar antes de implementar un ticket.");
    // El título sale del encabezado que escribió quien escribió la skill.
    expect(prompts[0]?.title).toBe("Planificación");
    // Y si no hay encabezado, el nombre del directorio: nunca un título vacío.
    expect(prompts[1]?.title).toBe("revision-final");
  });

  it("un proyecto sin skills no falla: devuelve una lista vacía", () => {
    expect(promptsFor(lab)).toEqual([]);
    expect(() => getPromptFor(lab, "cualquiera")).toThrow(/no declara skills/);
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

    expect(respuesta.prompts).toHaveLength(1);
    expect(respuesta.prompts[0]).toEqual({
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
