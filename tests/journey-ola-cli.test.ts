/**
 * `valmen journey next --wave` y `valmen journey brief`: banderas, errores y solo lectura (C12, C17, C18, C31–C35).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_OK, EXIT_SCHEMA } from "../packages/core/src/index.js";
import { journeyBriefCommand, journeyNextCommand } from "../packages/cli/src/commands.js";
import { USAGE, VALUE_OPTIONS, parseArgs, run } from "../packages/cli/src/main.js";
import {
  crearEntornoOla,
  crearJornada,
  enJornada,
  fotoDelArbol,
  ticketEn,
  type EntornoOla,
} from "./helpers/ola.js";

const A = "FEATURE-JOURNEY-ALFA-20261008";
const B = "FEATURE-JOURNEY-BETA-20261008";

let entorno: EntornoOla;

beforeEach(() => {
  entorno = crearEntornoOla();
});
afterEach(() => entorno.limpiar());

function armar(): void {
  ticketEn(entorno.root, A, "intake");
  ticketEn(entorno.root, B, "approved");
  crearJornada(entorno, [enJornada(A, 1), enJornada(B, 2)]);
}

const AHORA = () => new Date("2026-10-08T13:00:00.000Z");
const conProyecto = { project: "ola-lab", wave: true as const };

describe("journey next --wave", () => {
  it("imprime la ola de la jornada con los listos en orden", () => {
    armar();
    const resultado = journeyNextCommand(conProyecto, { home: entorno.home, ahora: AHORA });
    expect(resultado.exitCode).toBe(EXIT_OK);
    expect(resultado.stdout).toContain("Ola de la jornada dia");
    expect(resultado.stdout).toContain(`${A} [intake]`);
    expect(resultado.stdout).toContain(`${B} [approved]`);
    expect(resultado.stdout).toContain("tope de 3 simultáneos");
  });

  it("C12: un --concurrency que no es un entero de al menos 1 se rechaza con el código de esquema", () => {
    armar();
    for (const malo of ["0", "-1", "1.5", "abc", "", "2x"]) {
      const resultado = journeyNextCommand({ ...conProyecto, concurrency: malo }, { home: entorno.home, ahora: AHORA });
      expect(resultado.exitCode, malo).toBe(EXIT_SCHEMA);
      expect(resultado.stderr, malo).toContain("--concurrency");
    }
    // `--concurrency` sin valor (booleana) también se rechaza.
    expect(journeyNextCommand({ ...conProyecto, concurrency: true }, { home: entorno.home }).exitCode).toBe(EXIT_SCHEMA);
    // Control: un entero válido cambia el tope.
    const bueno = journeyNextCommand({ ...conProyecto, concurrency: "1" }, { home: entorno.home, ahora: AHORA });
    expect(bueno.exitCode).toBe(EXIT_OK);
    expect(bueno.stdout).toContain("tope de 1 simultáneos");
    expect(bueno.stdout).toMatch(/cupo/);
  });

  it("C17: sin jornada vigente, o con un --journey inexistente, falla y manda a valmen journey plan", () => {
    const sinJornada = journeyNextCommand(conProyecto, { home: entorno.home, ahora: AHORA });
    expect(sinJornada.exitCode).not.toBe(EXIT_OK);
    expect(sinJornada.stderr).toContain("valmen journey plan");

    armar();
    const inexistente = journeyNextCommand({ ...conProyecto, journey: "no-existe" }, { home: entorno.home, ahora: AHORA });
    expect(inexistente.exitCode).not.toBe(EXIT_OK);
    expect(inexistente.stderr).toContain("no-existe");
    expect(inexistente.stderr).toContain("valmen journey plan");
    // Control: el --journey que existe funciona.
    expect(journeyNextCommand({ ...conProyecto, journey: "dia" }, { home: entorno.home, ahora: AHORA }).exitCode).toBe(EXIT_OK);
  });

  it("C18: deja idéntico todo el árbol del registro", () => {
    armar();
    const antes = fotoDelArbol(entorno.root);
    const resultado = journeyNextCommand(conProyecto, { home: entorno.home, ahora: AHORA });
    expect(resultado.exitCode).toBe(EXIT_OK);
    expect(fotoDelArbol(entorno.root)).toEqual(antes);
    // La ayuda de la bandera es honesta: sin --wave no hace nada.
    expect(journeyNextCommand({ project: "ola-lab" }, { home: entorno.home }).exitCode).toBe(EXIT_SCHEMA);
  });
});

describe("journey brief", () => {
  it("imprime el brief del ticket", () => {
    armar();
    const resultado = journeyBriefCommand({ project: "ola-lab", id: B }, { home: entorno.home });
    expect(resultado.exitCode).toBe(EXIT_OK);
    expect(resultado.stdout).toContain(`Brief de subagente — ${B}`);
    expect(resultado.stdout).toContain("Lanzable: sí.");
  });

  it("C31: un ticket inexistente falla con un mensaje que nombra el id", () => {
    armar();
    const resultado = journeyBriefCommand({ project: "ola-lab", id: "FEATURE-JOURNEY-FANTASMA-20261008" }, { home: entorno.home });
    expect(resultado.exitCode).not.toBe(EXIT_OK);
    expect(resultado.stderr).toContain("FEATURE-JOURNEY-FANTASMA-20261008");
    expect(journeyBriefCommand({ project: "ola-lab" }, { home: entorno.home }).exitCode).toBe(EXIT_SCHEMA);
  });

  it("C32: deja idéntico todo el árbol del registro", () => {
    armar();
    const antes = fotoDelArbol(entorno.root);
    const resultado = journeyBriefCommand({ project: "ola-lab", id: A, cliente: "claude" }, { home: entorno.home });
    expect(resultado.exitCode).toBe(EXIT_OK);
    expect(fotoDelArbol(entorno.root)).toEqual(antes);
  });

  it("rechaza un cliente que no existe", () => {
    armar();
    const resultado = journeyBriefCommand({ project: "ola-lab", id: A, cliente: "inventado" }, { home: entorno.home });
    expect(resultado.exitCode).toBe(EXIT_SCHEMA);
    expect(resultado.stderr).toContain("inventado");
  });
});

describe("proyecto y ayuda", () => {
  it("C34: sin --project resuelve el proyecto por el project-id de la configuración de la raíz", () => {
    armar();
    const siguiente = journeyNextCommand({ wave: true }, { home: entorno.home, root: entorno.root, ahora: AHORA });
    expect(siguiente.exitCode).toBe(EXIT_OK);
    expect(siguiente.stdout).toContain("proyecto ola-lab");
    const brief = journeyBriefCommand({ id: A }, { home: entorno.home, root: entorno.root });
    expect(brief.exitCode).toBe(EXIT_OK);
    expect(brief.stdout).toContain(`Brief de subagente — ${A}`);
  });

  it("C34 (control): sin --project y sin project-id en la raíz, falla pidiendo --project", () => {
    const vacia = `${entorno.root}-sin-config`;
    const resultado = journeyNextCommand({ wave: true }, { home: entorno.home, root: vacia });
    expect(resultado.exitCode).toBe(EXIT_SCHEMA);
    expect(resultado.stderr).toContain("--project");
  });

  it("C33: --concurrency consume su valor en parseArgs y la ayuda documenta los dos subcomandos", () => {
    const opciones = parseArgs(["journey", "next", "--wave", "--concurrency", "2"]);
    expect(opciones.flags["concurrency"]).toBe("2");
    expect(opciones.flags["wave"]).toBe(true);
    expect(opciones.positionals).toEqual(["journey", "next"]);
    expect(VALUE_OPTIONS).toContain("--concurrency");
    expect(USAGE).toContain("journey next --wave [--concurrency <n>]");
    expect(USAGE).toContain("journey brief --id <ID>");
  });

  it("C35: un subcomando de journey desconocido responde con la lista que incluye next y brief", async () => {
    const escrituras: string[] = [];
    const escribir = (chunk: unknown): boolean => {
      escrituras.push(String(chunk));
      return true;
    };
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(escribir);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(escribir);
    let codigo = 0;
    try {
      codigo = await run(["journey", "inventado"]);
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
    expect(codigo).toBe(EXIT_SCHEMA);
    expect(escrituras.join("")).toContain("journey admite: plan, advance, next, brief, install-trigger, notify-plans, clear-stop y worktree.");
  });
});
