/**
 * El modo pregunta: el permiso de escritura que el motor no concede.
 *
 * El modo de fallo más caro de un agente es editar cuando se le pidió analizar, y
 * hasta acá la única barrera era la instrucción que recibía: el motor no tenía
 * noción de «esta sesión no escribe», así que cualquiera de sus cuarenta caminos
 * de mutación estaba disponible mientras el asistente decía que sólo consultaba.
 *
 * Lo que se afirma acá, y es lo que R-S1-004 pide:
 *
 * 1. **En modo pregunta no se escribe.** Crear un ticket, mover un estado y
 *    escribir un archivo fallan con el código de invariante, y el registro queda
 *    como estaba. El rechazo vive en las dos puertas de escritura del motor
 *    —`atomicWrite` y el lock de mutación—, no en la prosa de un prompt.
 * 2. **Fuera del modo pregunta nada cambió.** El permiso se niega sólo cuando se
 *    pide el modo: los mismos caminos siguen escribiendo igual que antes.
 * 3. **El modo es del proceso y se restaura.** `withAccessMode` devuelve el modo
 *    anterior aunque la acción lance, para que una consulta no deje al proceso
 *    sin poder escribir después.
 * 4. **El agente tampoco recibe el catálogo de escritura.** El servidor MCP en
 *    modo pregunta publica sólo las herramientas de sólo lectura.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EXIT_INVARIANT, EXIT_SCHEMA, TicketError } from "../packages/core/src/errors.js";
import { atomicWrite } from "../packages/core/src/fs.js";
import {
  accessMode,
  capabilitiesFor,
  withAccessMode,
} from "../packages/core/src/permissions.js";
import type { RegistryPaths } from "../packages/engine/src/discovery.js";
import { buildAskContext, renderAskContext } from "../packages/engine/src/ask.js";
import { createTicket } from "../packages/engine/src/create.js";
import { transition } from "../packages/engine/src/transition.js";
import { askCommand } from "../packages/cli/src/commands.js";
import { dispatch, parseArgs } from "../packages/cli/src/main.js";
import { TOOLS } from "../packages/mcp/src/tools.js";
import { toolsInMode } from "../packages/mcp/src/main.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

let lab: string;

const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });

/** El ticket que ya está en el registro de laboratorio. */
const EXISTENTE = "BUGFIX-POS-FILTRO-PARCIAL-20260922";

/** El ticket que el modo pregunta intenta crear y no debe poder. */
const NUEVO = "BUGFIX-POS-MODO-PREGUNTA-20260927";

const PREGUNTA = "¿el modo pregunta niega la escritura del registro?";

/** La ruta del ticket existente. */
const rutaDe = (id: string): string => join(lab, "tickets", "2026", id, "ticket.md");

/** Ejecuta una acción y devuelve el error del contrato, o `null` si no lanzó. */
function capturar(accion: () => unknown): TicketError | null {
  try {
    accion();
    return null;
  } catch (caught) {
    if (caught instanceof TicketError) return caught;
    throw caught;
  }
}

/** Ejecuta una acción y devuelve lo que haya lanzado, sea del contrato o no. */
function capturarCualquiera(accion: () => unknown): unknown {
  try {
    accion();
    return null;
  } catch (caught) {
    return caught;
  }
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-ask-"));
  writeFixtureTicket(lab, { id: EXISTENTE, workflowStatus: "planned" });
  mkdirSync(join(lab, ".valmen", "memory"), { recursive: true });
  writeFileSync(
    join(lab, ".valmen", "memory", "aprendizajes.md"),
    [
      "# Aprendizajes",
      "",
      "### [AP-900] El modo pregunta no concede la escritura del registro",
      "",
      "- **Fecha:** 2026-09-27",
      "- **Estado:** activa",
      "",
      "Una consulta no escribe: el permiso lo niega el motor y no la instrucción.",
      "",
    ].join("\n"),
    "utf8",
  );
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("en modo pregunta", () => {
  it("crear un ticket falla con el código de invariante", () => {
    const fallo = capturar(() =>
      withAccessMode("ask", () =>
        createTicket({
          paths: PATHS(),
          id: NUEVO,
          title: "El modo pregunta no debe poder crear tickets",
          type: "BUGFIX",
          module: "POS",
          request: "Alta que el modo pregunta tiene que rechazar.",
        }),
      ),
    );

    expect(fallo).not.toBeNull();
    expect(fallo?.exitCode).toBe(EXIT_INVARIANT);
    expect(fallo?.message).toContain("Modo pregunta");
  });

  it("el ticket rechazado no queda escrito en el registro", () => {
    capturar(() =>
      withAccessMode("ask", () =>
        createTicket({
          paths: PATHS(),
          id: NUEVO,
          title: "El modo pregunta no debe poder crear tickets",
          type: "BUGFIX",
          module: "POS",
          request: "Alta que el modo pregunta tiene que rechazar.",
        }),
      ),
    );

    expect(existsSync(join(lab, "tickets", "2026", NUEVO))).toBe(false);
  });

  it("mover el estado de un ticket falla con el código de invariante", () => {
    const fallo = capturar(() =>
      withAccessMode("ask", () =>
        transition({
          paths: PATHS(),
          ticketId: EXISTENTE,
          entity: "ticket",
          to: "approved",
        }),
      ),
    );

    expect(fallo).not.toBeNull();
    expect(fallo?.exitCode).toBe(EXIT_INVARIANT);
    expect(fallo?.message).toContain("Modo pregunta");
  });

  it("el frontmatter del ticket conserva su estado anterior tras el rechazo", () => {
    const antes = readFileSync(rutaDe(EXISTENTE), "utf8");

    capturar(() =>
      withAccessMode("ask", () =>
        transition({
          paths: PATHS(),
          ticketId: EXISTENTE,
          entity: "ticket",
          to: "approved",
        }),
      ),
    );

    const despues = readFileSync(rutaDe(EXISTENTE), "utf8");
    expect(despues).toBe(antes);
    expect(despues).toContain("workflow_status: planned");
  });

  it("`atomicWrite` falla con el código de invariante", () => {
    const destino = join(lab, "cualquiera.md");
    const fallo = capturar(() => withAccessMode("ask", () => atomicWrite(destino, "hola\n")));

    expect(fallo).not.toBeNull();
    expect(fallo?.exitCode).toBe(EXIT_INVARIANT);
    expect(fallo?.message).toContain("Modo pregunta");
  });

  it("el archivo que `atomicWrite` no escribió no existe en disco", () => {
    const destino = join(lab, "cualquiera.md");
    capturar(() => withAccessMode("ask", () => atomicWrite(destino, "hola\n")));

    expect(existsSync(destino)).toBe(false);
  });
});

describe("fuera del modo pregunta", () => {
  it("crear un ticket escribe su archivo en el registro", () => {
    createTicket({
      paths: PATHS(),
      id: NUEVO,
      title: "El alta normal sigue escribiendo el registro",
      type: "BUGFIX",
      module: "POS",
      request: "Alta de control, fuera del modo pregunta.",
    });

    expect(existsSync(rutaDe(NUEVO))).toBe(true);
  });

  it("mover un estado se aplica al frontmatter del ticket", () => {
    transition({ paths: PATHS(), ticketId: EXISTENTE, entity: "ticket", to: "approved" });

    expect(readFileSync(rutaDe(EXISTENTE), "utf8")).toContain("workflow_status: approved");
  });
});

describe("withAccessMode", () => {
  it("restaura el modo de acceso al salir", () => {
    expect(accessMode()).toBe("write");

    withAccessMode("ask", () => undefined);

    expect(accessMode()).toBe("write");
  });

  it("restaura el modo de acceso cuando la acción lanza", () => {
    const fallo = capturarCualquiera(() =>
      withAccessMode("ask", () => {
        throw new Error("la consulta falló");
      }),
    );

    expect(fallo).toBeInstanceOf(Error);
    expect((fallo as Error).message).toBe("la consulta falló");
    expect(accessMode()).toBe("write");
  });
});

describe("las capacidades declaradas", () => {
  it("el modo pregunta no concede permiso de escritura", () => {
    expect(capabilitiesFor("ask").write).toBe(false);
  });

  it("el modo pregunta no concede permiso de ejecución", () => {
    expect(capabilitiesFor("ask").execute).toBe(false);
  });
});

describe("el catálogo del servidor MCP", () => {
  it("en modo pregunta publica sólo las herramientas de sólo lectura", () => {
    const catalogo = toolsInMode(true);

    expect(catalogo.length).toBeGreaterThan(0);
    expect(catalogo.every((tool) => tool.annotations.readOnlyHint)).toBe(true);
  });

  it("en modo pregunta deja fuera las herramientas que escriben", () => {
    const escritura = TOOLS.filter((tool) => !tool.annotations.readOnlyHint).map((tool) => tool.name);
    const catalogo = toolsInMode(true).map((tool) => tool.name);

    expect(escritura.length).toBeGreaterThan(0);
    for (const nombre of escritura) {
      expect(catalogo).not.toContain(nombre);
    }
  });
});

describe("el contexto de consulta", () => {
  it("nombra la pregunta recibida en su salida", () => {
    const salida = renderAskContext(buildAskContext({ paths: PATHS(), question: PREGUNTA }));

    expect(salida).toContain(PREGUNTA);
  });

  it("lista los tickets activos del registro", () => {
    const salida = renderAskContext(buildAskContext({ paths: PATHS(), question: PREGUNTA }));

    expect(salida).toContain(EXISTENTE);
  });

  it("declara el permiso de escritura como no concedido", () => {
    const salida = renderAskContext(buildAskContext({ paths: PATHS(), question: PREGUNTA }));

    expect(salida).toContain("escritura");
    expect(salida).toContain("no concedida");
  });

  it("incluye el contexto compacto del ticket con --id", () => {
    const contexto = buildAskContext({
      paths: PATHS(),
      question: PREGUNTA,
      ticketId: EXISTENTE,
    });
    const salida = renderAskContext(contexto);

    expect(contexto.ticket?.id).toBe(EXISTENTE);
    // La marca del contexto compacto: el plan vigente del ticket reanudado.
    expect(salida).toContain("Plan vigente:");
  });

  it("incluye los aciertos de la memoria del proyecto", () => {
    const contexto = buildAskContext({
      paths: PATHS(),
      question: "modo pregunta escritura del registro",
    });
    const salida = renderAskContext(contexto);

    expect(contexto.memory.map((hit) => hit.id)).toContain("AP-900");
    expect(salida).toContain("AP-900");
  });

  it("sin pregunta falla con el código de esquema y no escribe nada", () => {
    const antes = readFileSync(rutaDe(EXISTENTE), "utf8");
    const resultado = dispatch(parseArgs(["ask", "--root", lab]));

    expect(resultado.exitCode).toBe(EXIT_SCHEMA);
    expect(resultado.stderr).toContain("pregunta");
    expect(readFileSync(rutaDe(EXISTENTE), "utf8")).toBe(antes);
    expect(existsSync(join(lab, "tickets", ".valmen.lock"))).toBe(false);
  });

  it("`valmen ask` sale en modo de escritura, sin dejar el proceso sin permiso", () => {
    askCommand(PATHS(), PREGUNTA, undefined);

    expect(accessMode()).toBe("write");
  });
});
