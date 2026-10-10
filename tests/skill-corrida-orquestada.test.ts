/**
 * La skill `corrida-orquestada`: el recorrido que sigue la sesión que reparte los
 * tickets de una jornada en subagentes, cada uno en su worktree.
 *
 * La skill es texto que un agente obedece, así que lo que se protege es lo que ese
 * texto manda y lo que prohíbe: pedir la ola, un subagente por ticket con el brief
 * del motor, aprobar por política, integrar de a uno, la suite completa una sola vez,
 * y las reglas que nunca se relajan (SECURITY, BLOCK, un solo escritor del checkout
 * principal). La prueba no ejecuta ningún comando de la skill.
 *
 * Que los comandos que la skill cita existen lo comprueba
 * `tests/cli-mensajes-coherencia.test.ts`, contra la tabla de comandos del CLI.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { publicadas } from "../packages/adapter/src/skills.js";
import { adoptProject, syncProject } from "../packages/cli/src/commands.js";

const REPO = process.cwd();
const ID = "corrida-orquestada";
const CATALOGO = join(REPO, "skills", ID, "SKILL.md");
const TOPE_BYTES = 6500;

/** Comandos que la skill cita y que aún no están en el CLI, con el ticket que los entrega. */
const PENDIENTES: Readonly<Record<string, string>> = {
};

const texto = readFileSync(CATALOGO, "utf8");
const plano = (t: string): string => t.replace(/\s+/g, " ");

let lab: string;
beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-corrida-orquestada-"));
  delete process.env["HERMES_HOME"];
});
afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("la skill en el catálogo", () => {
  it("C1: declara nombre, versión y origen", () => {
    expect(texto).toMatch(/^name:\s*corrida-orquestada$/m);
    expect(texto).toMatch(/^version:\s*1\.3\.0$/m);
    expect(texto).toMatch(/^origen:\s*valmen$/m);
  });

  it("C2: `publicadas()` la incluye y no incluye las del stack", () => {
    const ids = publicadas().map((skill) => skill.id);
    expect(ids).toContain(ID);
    expect(ids).not.toContain("desarrollo-backend");
  });

  it("C3: pesa 6 500 B o menos", () => {
    expect(Buffer.byteLength(texto, "utf8")).toBeLessThanOrEqual(TOPE_BYTES);
  });
});

describe("lo que manda", () => {
  const t = plano(texto);

  it("C4: pide la ola con `journey next --wave`", () => {
    expect(t).toContain("`valmen journey next --wave");
  });

  it("C5: 3 simultáneos por defecto, cambiable al pedirlo o con --concurrency", () => {
    expect(t).toMatch(/3 simultáneos por defecto/);
    expect(t).toContain("--concurrency N");
    expect(t).toMatch(/el PO los cambia al pedir la corrida/);
  });

  it("C6: un subagente por ticket, en segundo plano y en su propio worktree", () => {
    expect(t).toMatch(/Un subagente por ticket, \*\*en segundo plano\*\* y en su \*\*propio worktree\*\*/);
    expect(t).toContain("`valmen journey worktree create --id <ID>`");
    expect(t).toContain("isolation: worktree");
  });

  it("C7: el texto de `journey brief` es el único contexto del subagente", () => {
    expect(t).toContain("`valmen journey brief --id <ID>`");
    expect(t).toMatch(/único contexto/);
  });

  it("C8: aprueba por autorización con `journey approve-eligible`, o en lote al PO", () => {
    expect(t).toContain("`valmen journey approve-eligible --journey <id>`");
    expect(t).toContain("`valmen approval-authorize list`");
    expect(t).toMatch(/atribuidos a la autorización, nunca al modelo/);
    expect(t).toMatch(/en lote al PO/);
    expect(t).toContain("`valmen approve-plan");
    expect(t).toMatch(/Sin frase literal no hay aprobación/);
  });

  it("C9: SECURITY, despliegue y un block nunca se aprueban solos", () => {
    expect(t).toMatch(/SECURITY, despliegue y un `block` nunca se aprueban solos/);
  });

  it("C10: integra de a uno y retira el worktree", () => {
    expect(t).toContain("`valmen journey worktree integrate --id <ID>`");
    expect(t).toContain("`valmen journey worktree remove --id <ID>`");
    expect(t).toMatch(/de a uno/);
    expect(t).toMatch(/lo devuelves al subagente con el diff/);
  });

  it("C11: la suite completa corre una sola vez, tras integrar", () => {
    expect(t).toMatch(/Tras integrar la ola/);
    expect(t).toContain("`npx vitest run`");
    expect(t).toMatch(/una sola vez/);
  });

  it("C12: cierra con `journey handoff`", () => {
    expect(t).toContain("`valmen journey handoff --id <JORNADA>`");
  });

  it("cierra por comandos lo verificable y deja al PO lo de pantalla y entorno", () => {
    expect(t).toMatch(/## QA por comandos/);
    expect(t).toMatch(/se cierra aquí mismo con su ciclo de QA/);
    expect(t).toMatch(/de pantalla, de un entorno que no tienes/);
    expect(t).toMatch(/Un SECURITY solo se cierra con la frase del PO/);
  });

  it("arma la jornada desde un feature o desde una lista de tickets", () => {
    expect(t).toContain("`valmen journey plan --project <id> --feature <slug>`");
    expect(t).toContain("`--tickets a,b,c`");
  });

  it("C13: solo el orquestador toca el checkout principal", () => {
    expect(t).toMatch(/Solo el orquestador toca el checkout principal/);
  });

  it("C14: nombra el ticket hermano de cada comando que aún no existe", () => {
    for (const ticket of Object.values(PENDIENTES)) {
      expect(texto, `la skill no nombra ${ticket}`).toContain(ticket);
    }
  });

  it("C16: se detiene ante un BLOCK, una compuerta humana dura y lo que queda fuera del alcance", () => {
    expect(t).toMatch(/Un \*\*BLOCK\*\*, una compuerta humana dura/);
    expect(t).toMatch(/fuera del alcance/);
    expect(t).toMatch(/no se fuerzan ni se esquivan/);
  });
});

describe("lo que prohíbe (C15)", () => {
  it("no autoriza push, force ni saltar hooks como acción", () => {
    // Aparecen solo dentro de la prohibición «Nunca …».
    const lineas = texto.split("\n").filter((l) => /git push|--force|--no-verify/.test(l));
    expect(lineas.length).toBeGreaterThan(0);
    for (const linea of lineas) expect(linea).toMatch(/Nunca/);
    // Ningún comando citado (`valmen …`) los lleva como parte de lo que se ejecuta.
    for (const m of texto.matchAll(/`(valmen [^`]+)`/g)) {
      expect(m[1]).not.toMatch(/git push|--force|--no-verify/);
    }
  });

  it("no manda a un subagente a integrar ni a aprobar", () => {
    const t = plano(texto);
    expect(t).toMatch(/Los subagentes implementan; \*\*no integran ni aprueban\*\*/);
    expect(t).toMatch(/Solo el orquestador, \*\*de a uno\*\*/);
    expect(t).not.toMatch(/subagente[^.]*\b(integra|aprueba) (la|el|su)/i);
  });

  it("control: una copia sin la regla de SECURITY no pasa la afirmación", () => {
    const regla = /SECURITY, despliegue y un `block` nunca se aprueban solos/;
    const sinRegla = plano(texto).replace(regla, "");
    expect(sinRegla).not.toMatch(regla);
    expect(plano(texto)).toMatch(regla);
  });
});

describe("la instalación (C17)", () => {
  it("`adopt` y `sync` la dejan idéntica al catálogo en .valmen/skills", () => {
    adoptProject(lab, "proyecto-de-prueba", {});
    syncProject(lab, "proyecto-de-prueba", false);

    const copia = join(lab, ".valmen", "skills", ID, "SKILL.md");
    expect(readFileSync(copia, "utf8")).toBe(texto);
  });
});
