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
 * Los comandos que la skill cita deben existir en la ayuda del CLI o figurar en la
 * lista de pendientes de un ticket hermano: así un cambio de nombre falla a la vista.
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
  "journey worktree integrate": "FEATURE-ENGINE-INTEGRACION-RAMA-20261008",
  "journey handoff": "FEATURE-ENGINE-JORNADA-HANDOFF-20261008",
};

const texto = readFileSync(CATALOGO, "utf8");
const plano = (t: string): string => t.replace(/\s+/g, " ");

/** Los `valmen <comando>` entre comillas invertidas, sin banderas ni marcadores. */
function comandosCitados(t: string): string[] {
  const citados = new Set<string>();
  for (const m of t.matchAll(/`valmen ([^`]+)`/g)) {
    const palabras: string[] = [];
    for (const palabra of (m[1] as string).split(/\s+/)) {
      if (/^[-<\[(]/.test(palabra)) break;
      palabras.push(palabra);
    }
    if (palabras.length > 0) citados.add(palabras.join(" "));
  }
  return [...citados];
}

/** Una cita como «journey worktree create|remove» en la ayuda cubre cada alternativa. */
function enLaAyuda(ayuda: string, comando: string): boolean {
  if (ayuda.includes(comando)) return true;
  const palabras = comando.split(" ");
  const ultima = palabras.pop() as string;
  const patron = new RegExp(
    `(^|\\n)\\s*${palabras.join("\\s+")}\\s+(\\w+\\|)*${ultima}(\\|\\w+)*(\\s|$)`,
  );
  return patron.test(ayuda);
}

/** La ayuda del CLI: el texto de `USAGE` en `main.ts`, sin ejecutar nada. */
function ayudaDelCli(): string {
  const fuente = readFileSync(join(REPO, "packages/cli/src/main.ts"), "utf8");
  const inicio = fuente.indexOf("export const USAGE = `");
  const fin = fuente.indexOf("`;", inicio);
  return fuente.slice(inicio, fin);
}

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
    expect(texto).toMatch(/^version:\s*1\.0\.0$/m);
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

  it("C8: aprueba por `approval-eligibility` y autorizaciones vigentes, o en lote al PO", () => {
    expect(t).toContain("`valmen approval-eligibility --id <ID> --stage plan`");
    expect(t).toContain("`valmen approval-authorize list`");
    expect(t).toContain("`valmen qa-authorize list`");
    expect(t).toMatch(/Elegible y con autorización vigente/);
    expect(t).toMatch(/en lote al PO/);
    expect(t).toContain("`valmen approve-plan");
    expect(t).toMatch(/Sin frase literal no hay aprobación/);
  });

  it("C9: SECURITY y despliegue nunca se aprueban solos", () => {
    expect(t).toMatch(/SECURITY y despliegue nunca se aprueban solos/);
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

  it("C13: solo el orquestador toca el checkout principal", () => {
    expect(t).toMatch(/Solo el orquestador toca el checkout principal/);
  });

  it("C14: nombra el ticket hermano de cada comando que aún no existe", () => {
    for (const ticket of Object.values(PENDIENTES)) {
      expect(texto, `la skill no nombra ${ticket}`).toContain(ticket);
    }
    expect(texto).toContain("SECURITY-ENGINE-APROBACION-POR-AUTORIZACION-20261007");
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
    const sinRegla = plano(texto).replace(/SECURITY y despliegue nunca se aprueban solos/, "");
    expect(sinRegla).not.toMatch(/SECURITY y despliegue nunca se aprueban solos/);
    expect(plano(texto)).toMatch(/SECURITY y despliegue nunca se aprueban solos/);
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

describe("los comandos citados (C20)", () => {
  const ayuda = ayudaDelCli();

  it("extrae comandos de la skill", () => {
    const citados = comandosCitados(texto);
    expect(citados).toContain("journey next --wave".split(" --")[0]);
    expect(citados).toContain("approval-eligibility");
    expect(citados.length).toBeGreaterThanOrEqual(8);
  });

  it("cada uno está en la ayuda del CLI o es pendiente de un ticket hermano", () => {
    for (const comando of comandosCitados(texto)) {
      const conocido = enLaAyuda(ayuda, comando) || comando in PENDIENTES;
      expect(conocido, `«valmen ${comando}» no está en la ayuda ni entre los pendientes`).toBe(true);
    }
  });

  it("los pendientes que la skill cita siguen sin estar en la ayuda; al llegar, se pasan a existentes", () => {
    for (const comando of Object.keys(PENDIENTES)) {
      expect(
        enLaAyuda(ayuda, comando),
        `«${comando}» ya existe: quítalo de PENDIENTES y de la sección Dependencias`,
      ).toBe(false);
    }
  });

  it("control: un comando inventado no pasa", () => {
    expect(enLaAyuda(ayuda, "journey inventado")).toBe(false);
  });
});
