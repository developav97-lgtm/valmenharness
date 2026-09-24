/**
 * Los estándares: cómo crecen, quién los decide y por dónde se decide.
 *
 * El estándar es una regla **en vigor**, así que la propiedad que se afirma acá
 * no es qué archivo se escribe: es que la decisión sea de una persona y que el
 * registro conserve **sus palabras**. Da igual por dónde llegue —los botones de
 * Mission Control, el CLI de cualquier agente, la herramienta MCP—: el veredicto
 * tiene la misma forma y deja el mismo rastro.
 *
 * Y la otra mitad, que es la que hace que esto sirva de verdad: un agente sin la
 * frase de la persona no puede aceptar un estándar. La puerta que lo obliga es la
 * de cada agente —el CLI y el MCP—, no el motor, porque la pantalla decide con un
 * clic y no tiene palabras que citar.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  decideProposal,
  listProposals,
  proposeStandard,
} from "../packages/engine/src/standards.js";
import { standardsCommand } from "../packages/cli/src/commands.js";
import { callTool, type ToolContext } from "../packages/mcp/src/tools.js";

let lab: string;

/** El `RegistryPaths` mínimo: la raíz manda. */
const paths = (): { root: string } => ({ root: lab });

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-estandares-"));
  mkdirSync(join(lab, ".valmen"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Propone un estándar de trabajo, para no repetirlo en cada caso. */
function proponer(titulo = "Los montos van a la derecha"): string {
  return proposeStandard(paths(), {
    title: titulo,
    rule: "Los montos se alinean a la derecha, con dos decimales.",
    why: "Hubo que pedirlo dos veces, en dos tickets distintos.",
    area: "presentacion",
    tickets: ["TICKET-UNO"],
    now: () => new Date("2026-09-24T12:00:00Z"),
  }).id;
}

describe("la decisión", () => {
  it("aceptar escribe la regla en el archivo del área y la deja en vigor", () => {
    const id = proponer();
    const resultado = decideProposal(paths(), id, "aceptado", {
      instruccion: "aceptá las que propusiste",
    });

    expect(resultado.writtenTo).toBe(".valmen/rules/estandares-presentacion.md");
    const archivo = readFileSync(
      join(lab, ".valmen", "rules", "estandares-presentacion.md"),
      "utf8",
    );
    expect(archivo).toContain("Los montos se alinean a la derecha");
    expect(archivo).toContain("Hubo que pedirlo dos veces");
    expect(archivo).toContain("TICKET-UNO");
  });

  it("deja escrito quién lo decidió y con qué palabras", () => {
    // Es la misma regla que en el resto del registro: el veredicto se guarda con
    // la frase que lo autorizó, no con un resumen que alguien escribió después.
    const id = proponer();
    decideProposal(paths(), id, "aceptado", { instruccion: "aceptalos" });

    const propuesta = listProposals(paths())[0];
    expect(propuesta?.state).toBe("aceptado");
    expect(propuesta?.decidedOn).toBe(new Date().toISOString().slice(0, 10));
    expect(propuesta?.instruction).toBe("aceptalos");
    expect(
      readFileSync(join(lab, ".valmen", "estandares-propuestos.md"), "utf8"),
    ).toContain("«aceptalos»");
  });

  it("descartar no escribe la regla, y también queda con su frase", () => {
    const id = proponer();
    const resultado = decideProposal(paths(), id, "descartado", {
      instruccion: "esa no, la del tema sí",
    });
    expect(resultado.writtenTo).toBeNull();
    expect(listProposals(paths())[0]?.state).toBe("descartado");
  });

  it("no deja decidir dos veces la misma propuesta", () => {
    const id = proponer();
    decideProposal(paths(), id, "aceptado", { instruccion: "dale" });
    expect(() => decideProposal(paths(), id, "descartado", { instruccion: "no" })).toThrow(
      /ya está aceptado/,
    );
  });

  it("acepta sin frase cuando decide la pantalla, que no tiene ninguna que citar", () => {
    // El motor no la exige a propósito: quien pulsa el botón es quien decide, y
    // transcribir su clic sería inventar unas palabras que nadie dijo.
    const id = proponer();
    const resultado = decideProposal(paths(), id, "aceptado");
    expect(resultado.propuesta.instruction).toBe("");
    expect(listProposals(paths())[0]?.decidedOn).not.toBe("");
  });
});

describe("el CLI, que es la puerta de cualquier agente", () => {
  it("sin la frase de la persona no acepta, y dice cómo pedirla", () => {
    const id = proponer();
    const resultado = standardsCommand(paths(), "aceptar", id, {});
    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stderr).toContain("--instruccion");
    expect(resultado.stderr).toContain("pedila");
    // Y no escribió nada: la negativa tiene que ser real, no un aviso.
    expect(listProposals(paths())[0]?.state).toBe("propuesto");
  });

  it("con la frase la acepta y la registra", () => {
    const id = proponer();
    const resultado = standardsCommand(paths(), "aceptar", id, {
      instruccion: "aceptá el estándar de montos",
    });
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("aceptado");
    expect(resultado.stdout).toContain("«aceptá el estándar de montos»");
    expect(listProposals(paths())[0]?.state).toBe("aceptado");
  });

  it("`pendientes` decide sobre todas, que es lo que pide quien dice «aceptalos»", () => {
    proponer("Primero");
    proponer("Segundo");
    proponer("Tercero");
    const resultado = standardsCommand(paths(), "aceptar", "pendientes", {
      instruccion: "aceptalos todos",
    });

    expect(resultado.exitCode).toBe(0);
    expect(listProposals(paths()).map((p) => p.state)).toEqual([
      "aceptado",
      "aceptado",
      "aceptado",
    ]);
    // Una sola frase para las tres: repetirla por identificador sería fabricar
    // trabajo para que el registro quede igual.
    expect(resultado.stdout).toContain("3 estándares aceptados");
    expect(resultado.stdout).toContain("«aceptalos todos»");
  });

  it("sin pendientes lo dice, en vez de fallar", () => {
    const resultado = standardsCommand(paths(), "aceptar", "pendientes", {
      instruccion: "aceptalos",
    });
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("No hay estándares pendientes");
  });

  it("un identificador que no existe no inventa una decisión", () => {
    proponer();
    const resultado = standardsCommand(paths(), "aceptar", "EST-099", {
      instruccion: "aceptalos",
    });
    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stderr).toContain("EST-099");
  });

  it("revisar avisa de los colores fijos del cambio pendiente", () => {
    execFileSync("git", ["init", "-q"], { cwd: lab, stdio: "ignore" });
    writeFileSync(join(lab, "pantalla.css"), ".modal { background: #fff; }\n", "utf8");
    const resultado = standardsCommand(paths(), "revisar", undefined, {});
    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain("#fff");
    expect(resultado.stdout).toContain("pantalla.css");
  });
});

describe("la herramienta MCP", () => {
  const contexto = (): ToolContext => ({ paths: paths() });

  it("no acepta sin la instrucción, y no la inventa", async () => {
    const id = proponer();
    const resultado = await callTool(contexto(), "decidir_estandar", {
      id,
      decision: "aceptado",
    });
    expect(resultado.isError).toBe(true);
    expect(resultado.text).toContain("instruccion");
    expect(listProposals(paths())[0]?.state).toBe("propuesto");
  });

  it("acepta con las palabras de la persona y las deja escritas", async () => {
    const id = proponer();
    const resultado = await callTool(contexto(), "decidir_estandar", {
      id,
      decision: "aceptado",
      instruccion: "aplica el estándar",
    });
    expect(resultado.isError).toBe(false);
    expect(resultado.text).toContain("«aplica el estándar»");
    expect(listProposals(paths())[0]?.instruction).toBe("aplica el estándar");
    expect(listProposals(paths())[0]?.state).toBe("aceptado");
  });

  it("decide todas cuando la persona dijo «aceptalos»", async () => {
    proponer("Uno");
    proponer("Dos");
    const resultado = await callTool(contexto(), "decidir_estandar", {
      id: "pendientes",
      decision: "aceptado",
      instruccion: "aceptalos",
    });
    expect(resultado.isError).toBe(false);
    expect(listProposals(paths()).every((p) => p.state === "aceptado")).toBe(true);
  });

  it("avisa de los colores fijos sin bloquear la entrega", async () => {
    execFileSync("git", ["init", "-q"], { cwd: lab, stdio: "ignore" });
    writeFileSync(join(lab, "modal.html"), '<div style="background: white">\n', "utf8");
    const resultado = await callTool(contexto(), "revisar_presentacion", {});
    expect(resultado.isError).toBe(false);
    expect(resultado.text).toContain("white");
    expect(resultado.text).toContain("No bloquea");
    // El aviso dice cómo callarlo cuando el color es legítimo: si no, la única
    // salida sería apagar el chequeo.
    expect(resultado.text).toContain("valmen:allow-color");
  });
});
