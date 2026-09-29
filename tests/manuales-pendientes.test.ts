/**
 * La detección de manuales pendientes.
 *
 * Lo que se prueba aquí no es que los `.md` se lean, sino el cruce que hoy no
 * existe en ninguna pieza: los archivos que declararon los tickets de la release
 * contra lo que cada manual declara como su fuente. El laboratorio es temporal y
 * nunca toca el registro vivo ni `.valmen/receipts/`.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { choosePaths, manualesPendientes, renderPendientes } from "@valmen/engine";

import { renderFixtureTicket } from "./helpers/fixtures.js";
import { dispatch, parseArgs } from "../packages/cli/src/main.js";

const TICKET = "FEATURE-PANTALLAS-POS-20260926";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-manuales-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Un punto con los archivos que tocó, con todas las claves del contrato. */
function punto(archivos: readonly string[]) {
  return {
    id: "POINT-001",
    title: "Pantallas tocadas por la release",
    status: "open",
    severity: "normal",
    actual: "Las pantallas cambiaron.",
    expected: "Los manuales que las documentan quedan marcados.",
    evidence: [],
    affected_files: archivos,
    diagnosis: null,
    solution: null,
    tests: [],
    qa_cycles: [],
    terminal_reason: null,
    related_ticket: null,
  };
}

/**
 * Escribe un ticket de laboratorio con archivos declarados.
 *
 * Se parte de `renderFixtureTicket` —para no reescribir el orden canónico de las
 * secciones— y se reemplaza el bloque vacío de `Puntos` por el que declara los
 * archivos. Un `replace` del bloque vacío es exacto y no toca nada más.
 */
function escribirTicket(id: string, archivos: readonly string[]): void {
  const texto = renderFixtureTicket({ id }).replace(
    "## Puntos\n\n```json\n[]\n```\n",
    `## Puntos\n\n\`\`\`json\n${JSON.stringify([punto(archivos)], null, 2)}\n\`\`\`\n`,
  );
  const directorio = join(lab, "tickets", id.slice(-8, -4), id);
  mkdirSync(directorio, { recursive: true });
  writeFileSync(join(directorio, "ticket.md"), texto, "utf8");
}

/** Escribe un manual en el laboratorio, con su ruta relativa POSIX. */
function escribirManual(ruta: string, contenido: string): void {
  const absoluta = join(lab, ...ruta.split("/"));
  mkdirSync(dirname(absoluta), { recursive: true });
  writeFileSync(absoluta, contenido, "utf8");
}

/** Un manual con la línea de fuentes del proyecto adoptado. */
function manualConFuentes(fuentes: readonly string[]): string {
  return [
    "# Órdenes del POS",
    "",
    `<!-- rutas-fuente: ${fuentes.join(", ")} -->`,
    "",
    "Texto del manual.",
    "",
  ].join("\n");
}

/** Corre el comando como lo haría el CLI, sin salir del laboratorio. */
function correr(...args: string[]) {
  return dispatch(parseArgs(["--root", lab, "manuales", ...args]));
}

describe("manuales pendientes: el cruce", () => {
  it("un manual cuya fuente declarada es un archivo tocado queda desactualizado, con el ticket y el archivo", () => {
    escribirTicket(TICKET, ["FrontEnd/src/app/pos/ordenes.component.ts"]);
    escribirManual(
      "docs/manuales/usuario-final/ordenes.md",
      manualConFuentes([
        "FrontEnd/src/app/pos/ordenes.component.ts",
        "FrontEnd/src/app/pos/ordenes.component.html",
      ]),
    );

    const resultado = manualesPendientes(choosePaths(lab), { tickets: [TICKET] });

    expect(resultado.desactualizados).toHaveLength(1);
    expect(resultado.desactualizados[0]).toMatchObject({
      manual: "docs/manuales/usuario-final/ordenes.md",
      titulo: "Órdenes del POS",
      ticket: TICKET,
      fuente: "FrontEnd/src/app/pos/ordenes.component.ts",
      motivo: "fuente-tocada",
    });

    const texto = renderPendientes(resultado);
    expect(texto).toContain(TICKET);
    expect(texto).toContain("FrontEnd/src/app/pos/ordenes.component.ts");
  });

  it("un manual cuyas fuentes nadie tocó no aparece entre los desactualizados", () => {
    escribirTicket(TICKET, ["FrontEnd/src/app/pos/ordenes.component.ts"]);
    escribirManual(
      "docs/manuales/usuario-final/clientes.md",
      manualConFuentes(["FrontEnd/src/app/clientes/clientes.component.ts"]),
    );

    const resultado = manualesPendientes(choosePaths(lab), { tickets: [TICKET] });

    expect(resultado.desactualizados).toEqual([]);
  });

  it("un manual que un ticket tocó directamente queda desactualizado aunque no declare fuentes", () => {
    escribirTicket(TICKET, ["docs/manuales/usuario-final/solo.md"]);
    escribirManual(
      "docs/manuales/usuario-final/solo.md",
      "# Manual sin fuentes\n\nTexto.\n",
    );

    const resultado = manualesPendientes(choosePaths(lab), { tickets: [TICKET] });

    expect(resultado.desactualizados).toHaveLength(1);
    expect(resultado.desactualizados[0]).toMatchObject({
      manual: "docs/manuales/usuario-final/solo.md",
      ticket: TICKET,
      fuente: "docs/manuales/usuario-final/solo.md",
      motivo: "manual-tocado",
    });
  });

  it("una pantalla tocada que ningún manual declara aparece como sin manual", () => {
    escribirTicket(TICKET, ["FrontEnd/src/app/nueva/nueva.component.ts"]);

    const resultado = manualesPendientes(choosePaths(lab), { tickets: [TICKET] });

    expect(resultado.sinManual).toHaveLength(1);
    expect(resultado.sinManual[0]).toEqual({
      ticket: TICKET,
      archivo: "FrontEnd/src/app/nueva/nueva.component.ts",
    });
  });

  it("una fuente con forma de ruta de aplicación se declara sin resolver", () => {
    escribirTicket(TICKET, ["FrontEnd/src/app/pos/ordenes.component.ts"]);
    escribirManual(
      "docs/manuales/usuario-final/plantillas.md",
      manualConFuentes(["/admin/plantillas"]),
    );

    const resultado = manualesPendientes(choosePaths(lab), { tickets: [TICKET] });

    expect(resultado.sinResolver).toEqual([
      { manual: "docs/manuales/usuario-final/plantillas.md", fuente: "/admin/plantillas" },
    ]);
  });

  it("un id que no está en el registro se declara ausente y no rompe la corrida", () => {
    escribirTicket(TICKET, ["FrontEnd/src/app/pos/ordenes.component.ts"]);

    const resultado = manualesPendientes(choosePaths(lab), {
      tickets: ["FEATURE-NO-EXISTE-20260926", TICKET],
    });

    expect(resultado.ausentes).toEqual(["FEATURE-NO-EXISTE-20260926"]);
    // El ticket que sí existe se procesó igual.
    expect(resultado.fecha).not.toBe("");
  });
});

describe("manuales pendientes: el listado", () => {
  it("con --escribir el listado queda en <manualesdir>/pendientes.md", () => {
    escribirTicket(TICKET, ["FrontEnd/src/app/pos/ordenes.component.ts"]);
    escribirManual(
      "docs/manuales/usuario-final/ordenes.md",
      manualConFuentes(["FrontEnd/src/app/pos/ordenes.component.ts"]),
    );

    const resultado = correr("pendientes", "--tickets", TICKET, "--escribir");

    expect(resultado.exitCode).toBe(0);
    expect(existsSync(join(lab, "docs/manuales/usuario-final/pendientes.md"))).toBe(true);
  });

  it("el listado escrito nombra la fecha de la corrida", () => {
    escribirTicket(TICKET, ["FrontEnd/src/app/pos/ordenes.component.ts"]);
    escribirManual("docs/manuales/usuario-final/ordenes.md", "# Órdenes\n");

    const hoy = new Date().toISOString().slice(0, 10);
    correr("pendientes", "--tickets", TICKET, "--escribir");

    const escrito = readFileSync(
      join(lab, "docs/manuales/usuario-final/pendientes.md"),
      "utf8",
    );
    expect(escrito).toContain(hoy);
  });

  it("el listado escrito nombra los tickets de la release", () => {
    escribirTicket(TICKET, ["FrontEnd/src/app/pos/ordenes.component.ts"]);
    escribirManual("docs/manuales/usuario-final/ordenes.md", "# Órdenes\n");

    correr("pendientes", "--tickets", TICKET, "--escribir");

    const escrito = readFileSync(
      join(lab, "docs/manuales/usuario-final/pendientes.md"),
      "utf8",
    );
    expect(escrito).toContain(TICKET);
  });

  it("sin --escribir no se escribe ningún archivo", () => {
    escribirTicket(TICKET, ["FrontEnd/src/app/pos/ordenes.component.ts"]);
    escribirManual("docs/manuales/usuario-final/ordenes.md", "# Órdenes\n");

    const resultado = correr("pendientes", "--tickets", TICKET);

    expect(resultado.exitCode).toBe(0);
    expect(existsSync(join(lab, "docs/manuales/usuario-final/pendientes.md"))).toBe(false);
    // El listado igual sale por stdout.
    expect(resultado.stdout).toContain(TICKET);
  });

  it("un directorio de manuales que no existe no se crea", () => {
    escribirTicket(TICKET, ["FrontEnd/src/app/pos/ordenes.component.ts"]);

    const resultado = correr(
      "pendientes",
      "--tickets",
      TICKET,
      "--manuales-dir",
      "docs/manuales/inexistente",
      "--escribir",
    );

    expect(resultado.exitCode).toBe(0);
    expect(existsSync(join(lab, "docs/manuales/inexistente"))).toBe(false);
    expect(resultado.stdout).toMatch(/no se escribió/i);
  });
});
