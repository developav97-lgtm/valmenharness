/**
 * Equivalencia de la superficie de comandos.
 *
 * El contrato no es solo el del validador: un script que hoy hace
 * `ticket.py validate --all` debe poder cambiar a `valmen validate --all` sin
 * tocar nada más. Eso significa **mismo texto en stdout y mismo código de
 * salida**, no solo mismo veredicto.
 *
 * Referencia capturada del CLI de Python sobre el proyecto real:
 *
 *   $ python3 tools/agentic/ticket.py validate --all
 *   Tickets válidos: 57                       (exit 0)
 *   $ python3 tools/agentic/ticket.py active
 *   No hay tickets activos.                   (exit 0)
 *   $ python3 tools/agentic/ticket.py index --check
 *   Índice actualizado.                       (exit 0)
 */
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { dispatch, parseArgs } from "../packages/cli/src/main.js";
import {
  buildIndex,
  listActive,
  showTicket,
  validateAll,
  validateOne,
} from "../packages/cli/src/commands.js";
import { EXIT_SCHEMA } from "../packages/core/src/errors.js";

const ROOT = join(import.meta.dirname, "fixtures", "saicloud");
const PATHS = { root: ROOT, ticketsDir: "tickets" };

describe("validate --all", () => {
  it("acepta los 57 tickets y replica el mensaje de referencia", () => {
    const result = validateAll(PATHS);
    expect(result.stdout).toBe("Tickets válidos: 57\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });
});

describe("list", () => {
  it("replica el mensaje de referencia cuando no hay tickets activos", () => {
    // Los 57 tickets del fixture están cerrados.
    const result = listActive(PATHS);
    expect(result.stdout).toBe("No hay tickets activos.\n");
    expect(result.exitCode).toBe(0);
  });
});

describe("validate --id", () => {
  it("acepta un ticket concreto y lo anuncia", () => {
    const result = validateOne(PATHS, "BUGFIX-POS-REPORTE-Z-SUCURSAL-20260907");
    expect(result.stdout).toBe("Ticket válido: BUGFIX-POS-REPORTE-Z-SUCURSAL-20260907\n");
    expect(result.exitCode).toBe(0);
  });

  it("falla con el código de esquema si el ticket no existe", () => {
    const result = validateOne(PATHS, "BUGFIX-POS-NO-EXISTE-20260101");
    expect(result.stderr).toBe("La ruta canónica solicitada no existe.");
    expect(result.exitCode).toBe(EXIT_SCHEMA);
  });
});

describe("show", () => {
  it("imprime el resumen de un ticket real", () => {
    const result = showTicket(PATHS, "BUGFIX-POS-REPORTE-Z-SUCURSAL-20260907");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Ticket:   BUGFIX-POS-REPORTE-Z-SUCURSAL-20260907");
    expect(result.stdout).toContain("Workflow: closed");
    expect(result.stdout).toContain("QA:       approved");
    expect(result.stdout).toContain("Release:  released");
  });

  it("falla si el ticket no existe", () => {
    const result = showTicket(PATHS, "BUGFIX-POS-NO-EXISTE-20260101");
    expect(result.exitCode).toBe(EXIT_SCHEMA);
  });
});

describe("index", () => {
  it("encuentra el índice al día", () => {
    const result = buildIndex(PATHS, true);
    expect(result.stdout).toBe("Índice actualizado.\n");
    expect(result.exitCode).toBe(0);
  });
});

describe("análisis de argumentos", () => {
  it("reconoce las banderas de comando aunque no consuman valor", () => {
    const options = parseArgs(["validate", "--all", "--root", "/tmp/x"]);
    expect(options.flags["all"]).toBe(true);
    expect(options.positionals).toEqual(["validate"]);
    expect(options.root).toBe("/tmp/x");
  });

  it("consume el valor de --id y no lo deja como posicional", () => {
    const options = parseArgs(["validate", "--id", "BUGFIX-POS-UNO-20260101"]);
    expect(options.flags["id"]).toBe("BUGFIX-POS-UNO-20260101");
    expect(options.positionals).toEqual(["validate"]);
  });

  it("admite la forma --clave=valor", () => {
    const options = parseArgs(["validate", "--id=BUGFIX-POS-DOS-20260101"]);
    expect(options.flags["id"]).toBe("BUGFIX-POS-DOS-20260101");
  });

  it("rechaza un valor que parece una opción", () => {
    expect(() => parseArgs(["validate", "--id", "--all"])).toThrow(
      "La opción --id requiere un valor.",
    );
  });
});

describe("dispatch", () => {
  it("informa del uso cuando falta el comando", () => {
    const result = dispatch(parseArgs([]));
    expect(result.exitCode).toBe(EXIT_SCHEMA);
    // Se comprueba la forma del texto, no su contenido completo: volcar la
    // ayuda entera en la salida del test solo añade ruido.
    expect(result.stdout.split("\n")[0]).toBe("valmen — harness agéntico");
  });

  it("rechaza un comando desconocido", () => {
    const result = dispatch(parseArgs(["pepe"]));
    expect(result.exitCode).toBe(EXIT_SCHEMA);
    expect(result.stderr).toContain("Comando desconocido: pepe");
  });

  it("exige --id o --all en validate", () => {
    const result = dispatch(parseArgs(["validate"]));
    expect(result.stderr).toBe("validate requiere --id o --all.");
    expect(result.exitCode).toBe(EXIT_SCHEMA);
  });

  it("no admite --id y --all a la vez", () => {
    const result = dispatch(
      parseArgs(["validate", "--all", "--id", "BUGFIX-POS-UNO-20260101"]),
    );
    expect(result.exitCode).toBe(EXIT_SCHEMA);
    expect(result.stderr).toContain("no ambos");
  });

  it("resuelve el registro por defecto en tickets/ y el heredado en docs/tickets/", () => {
    const modern = parseArgs(["list", "--root", "/tmp/p"]);
    const legacy = parseArgs(["list", "--root", "/tmp/p", "--legacy-layout"]);
    expect(dispatch(modern).stderr).toContain(
      "No se encontró el directorio de tickets: tickets",
    );
    expect(dispatch(legacy).stderr).toContain(
      "No se encontró el directorio de tickets: docs/tickets",
    );
  });
});
