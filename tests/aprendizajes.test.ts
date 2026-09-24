/**
 * La cola de aprendizajes.
 *
 * La memoria tenía entrada y no tenía salida: el agente guardaba lo que aprendía
 * y nadie decidía qué era eso. Lo que se afirma acá es esa salida, y sobre todo
 * la frontera que la hace segura:
 *
 * **Clasificar no pone nada en vigor.** `regla` crea una propuesta de estándar, y
 * aceptarla sigue exigiendo las palabras de una persona. Es la misma división del
 * resto del harness —el agente hace el triaje, la persona decide— y por eso la
 * puede hacer un agente sin pedir permiso.
 *
 * Y lo que se conserva: un aprendizaje descartado **no se borra**. Borrarlo
 * destruiría el registro de que alguien ya lo evaluó, y el próximo agente
 * volvería a proponer lo mismo.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RegistryPaths } from "../packages/engine/src/discovery.js";
import {
  classifyLearning,
  listLearnings,
  renderLearnings,
} from "../packages/engine/src/learnings.js";
import { saveLearning } from "../packages/engine/src/memory.js";
import { listProposals } from "../packages/engine/src/standards.js";
import { callTool, type ToolContext } from "../packages/mcp/src/tools.js";
import { dispatch, parseArgs } from "../packages/cli/src/main.js";

let lab: string;

const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });

/** Guarda un aprendizaje de trabajo. */
function guardar(
  title = "bulk_create no dispara señales",
  body = "En Django, `bulk_create` no dispara `post_save`: el sync pierde los registros.",
): string {
  return saveLearning(PATHS(), { title, body, tickets: ["SYNC-COLA-20260920"] }).id;
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-cola-"));
  mkdirSync(join(lab, ".valmen"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("guardar deja el aprendizaje en la cola", () => {
  it("nace pendiente, y se lee con su estado", () => {
    const id = guardar();
    const [aprendizaje] = listLearnings(PATHS());
    expect(aprendizaje?.id).toBe(id);
    expect(aprendizaje?.state).toBe("pendiente");
    expect(aprendizaje?.tickets).toEqual(["SYNC-COLA-20260920"]);
  });

  it("el pendiente sigue siendo consultable: se guarda cuando se descubre", () => {
    // Lo que se espera a la clasificación es la decisión, no el conocimiento.
    const id = guardar();
    const texto = readFileSync(join(lab, ".valmen", "memory", "aprendizajes.md"), "utf8");
    expect(texto).toContain(`### [${id}]`);
    expect(texto).toContain("bulk_create");
  });

  it("un archivo sin la línea de estado se lee como pendiente", () => {
    // Los archivos guardados antes de que existiera la cola tienen que entrar
    // igual: el formato viejo no puede volverse invisible.
    mkdirSync(join(lab, ".valmen", "memory"), { recursive: true });
    writeFileSync(
      join(lab, ".valmen", "memory", "aprendizajes.md"),
      "# Aprendizajes\n\n### [AP-001] Uno viejo\n\n**Fecha:** 2026-01-01\n\nEl cuerpo.\n",
      "utf8",
    );
    expect(listLearnings(PATHS())[0]?.state).toBe("pendiente");
  });
});

describe("clasificar", () => {
  it("`caso` lo deja como documentación, sin tocar ninguna regla", () => {
    const id = guardar();
    const resultado = classifyLearning(PATHS(), id, "caso");
    expect(resultado.aprendizaje.state).toBe("caso");
    expect(resultado.propuestaId).toBeNull();
    expect(listProposals(PATHS())).toEqual([]);
  });

  it("`regla` crea la propuesta, no la regla", () => {
    // Es la frontera: la regla no entra en vigor acá. Entra cuando una persona
    // acepta la propuesta, con sus palabras.
    const id = guardar();
    const resultado = classifyLearning(PATHS(), id, "regla", { area: "datos" });

    expect(resultado.propuestaId).toBe("EST-001");
    const propuesta = listProposals(PATHS())[0];
    expect(propuesta?.state).toBe("propuesto");
    expect(propuesta?.area).toBe("datos");
    expect(propuesta?.rule).toContain("bulk_create");
    expect(propuesta?.tickets).toEqual(["SYNC-COLA-20260920"]);
    // Y no se escribió ningún archivo de estándares en vigor.
    expect(() =>
      readFileSync(join(lab, ".valmen", "rules", "estandares-datos.md")),
    ).toThrow();
  });

  it("la regla no se lleva las etiquetas del aprendizaje", () => {
    const id = guardar("Título", "El cuerpo de la regla, en una frase.");
    classifyLearning(PATHS(), id, "regla");
    const regla = listProposals(PATHS())[0]?.rule ?? "";
    expect(regla).toContain("El cuerpo de la regla");
    expect(regla).not.toContain("Fecha:");
    expect(regla).not.toContain("Estado:");
    expect(regla).not.toContain("Tickets:");
  });

  it("`descartar` lo marca y lo conserva", () => {
    const id = guardar();
    classifyLearning(PATHS(), id, "descartar");
    expect(listLearnings(PATHS())[0]?.state).toBe("descartado");
    // Conservado: el archivo sigue teniendo el cuerpo, para que el próximo
    // agente no vuelva a proponer lo mismo desde cero.
    expect(
      readFileSync(join(lab, ".valmen", "memory", "aprendizajes.md"), "utf8"),
    ).toContain("bulk_create");
  });

  it("deja la fecha de la clasificación, no solo la del descubrimiento", () => {
    const id = guardar();
    classifyLearning(PATHS(), id, "caso", {
      now: () => new Date("2026-10-01T12:00:00Z"),
    });
    const texto = readFileSync(join(lab, ".valmen", "memory", "aprendizajes.md"), "utf8");
    expect(texto).toContain("- **Clasificado:** 2026-10-01");
  });

  it("no deja clasificar dos veces el mismo aprendizaje", () => {
    const id = guardar();
    classifyLearning(PATHS(), id, "caso");
    expect(() => classifyLearning(PATHS(), id, "descartar")).toThrow(/ya está caso/);
  });

  it("un identificador que no existe no inventa una decisión", () => {
    guardar();
    expect(() => classifyLearning(PATHS(), "AP-099", "caso")).toThrow(/AP-099/);
  });
});

describe("el informe", () => {
  it("dice cuántos esperan y cómo se clasifican", () => {
    guardar("Uno");
    guardar("Dos");
    const texto = renderLearnings(listLearnings(PATHS()));
    expect(texto).toContain("2 pendiente(s) de 2");
    expect(texto).toContain("valmen memory clasificar AP-001 --decision caso");
  });

  it("sin ninguno explica de dónde salen, en vez de no decir nada", () => {
    const texto = renderLearnings(listLearnings(PATHS()));
    expect(texto).toContain("ninguno todavía");
    expect(texto).toContain("guardar_aprendizaje");
  });
});

describe("las puertas", () => {
  const contexto = (): ToolContext => ({ paths: PATHS() });

  it("el comando lista la cola y clasifica", async () => {
    const id = guardar();
    const cola = await dispatch(parseArgs(["memory", "review", "--root", lab]));
    expect(cola.exitCode).toBe(0);
    expect(cola.stdout).toContain("1 pendiente(s)");

    const clase = await dispatch(
      parseArgs([
        "memory",
        "clasificar",
        id,
        "--decision",
        "regla",
        "--area",
        "datos",
        "--root",
        lab,
      ]),
    );
    expect(clase.exitCode).toBe(0);
    expect(clase.stdout).toContain("EST-001");
    // Y dice cómo se acepta, que es el paso que falta y no es de quien clasifica.
    expect(clase.stdout).toContain("--instruccion");
  });

  it("una decisión que no existe se rechaza", async () => {
    const id = guardar();
    const resultado = await dispatch(
      parseArgs(["memory", "clasificar", id, "--decision", "inventada", "--root", lab]),
    );
    expect(resultado.exitCode).not.toBe(0);
    expect(resultado.stderr).toContain("regla");
  });

  it("la herramienta MCP devuelve la cola y clasifica", async () => {
    const id = guardar();
    const cola = await callTool(contexto(), "revisar_aprendizajes", {});
    expect(cola.isError).toBe(false);
    expect(cola.text).toContain(id);

    const clasificado = await callTool(contexto(), "revisar_aprendizajes", {
      id,
      decision: "regla",
      area: "proceso",
    });
    expect(clasificado.isError).toBe(false);
    expect(clasificado.text).toContain("EST-001");
    expect(clasificado.text).toContain("no está en vigor");
  });

  it("la herramienta MCP exige la decisión cuando hay identificador", async () => {
    const id = guardar();
    const resultado = await callTool(contexto(), "revisar_aprendizajes", { id });
    expect(resultado.isError).toBe(true);
  });
});
