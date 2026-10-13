/**
 * La revisión previa no corta por rutas que sí existen o que el ticket va a crear.
 *
 * En BUGFIX-RESTAURANTE-PAGO-BONIFICADO-RETROACTIVO-20261013 (SaiOpenCloud) cortó dos
 * veces sin un defecto real: por cuatro rutas citadas sin el prefijo `BackEnd/` y por
 * tres archivos nuevos que el diagnóstico nombraba. Lo que se afirma acá:
 *
 * 1. Una ruta que no está en la raíz pero sí, una sola vez, bajo una carpeta de primer
 *    nivel (`BackEnd/…`) existe, y su línea se comprueba contra ese archivo.
 * 2. Una ruta sin línea en una frase que dice que el archivo es nuevo o que se crea se
 *    omite con su motivo.
 * 3. Una ruta que no existe en ninguna parte y no se declara nueva sigue sin existir.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { citedFiles } from "../packages/engine/src/revision-previa.js";
import { renderFixtureTicket } from "./helpers/fixtures.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-rutas-"));
  mkdirSync(join(lab, ".git"));
  mkdirSync(join(lab, "BackEnd", "ModPos", "views"), { recursive: true });
  writeFileSync(join(lab, "BackEnd", "ModPos", "views", "utils.py"), "a\nb\nc\n");
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

function ticket(diagnostico: string): string {
  return renderFixtureTicket({ id: "BUGFIX-POS-RUTAS-20261013", diagnostico });
}

describe("rutas citadas en el diagnóstico", () => {
  it("encuentra una ruta bajo una carpeta de primer nivel y comprueba su línea", () => {
    const r = citedFiles(lab, ticket("- Causa: `ModPos/views/utils.py:2` y `ModPos/views/utils.py:9`."));
    expect(r.map((c) => [c.cita, c.resultado])).toEqual([
      ["ModPos/views/utils.py:2", "existe"],
      ["ModPos/views/utils.py:9", "linea_fuera"],
    ]);
  });

  it("omite un archivo que el diagnóstico declara nuevo", () => {
    const r = citedFiles(
      lab,
      ticket("- Archivos nuevos que entrega el ticket: `BackEnd/ModPos/services/bonus.py`."),
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.resultado).toBe("omitida");
    expect(r[0]?.detalle).toContain("nuevo");
  });

  it("una ruta inexistente que no se declara nueva sigue sin existir", () => {
    const r = citedFiles(lab, ticket("- Causa: `BackEnd/ModPos/views/otra.py:3`."));
    expect(r[0]?.resultado).toBe("no_existe");
  });
});
