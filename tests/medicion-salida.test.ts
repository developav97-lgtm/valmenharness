/**
 * La medición de salida de S1 a S3 (R-CPRE-011).
 *
 * Se prueba con un ejecutor simulado para fijar la forma del informe y el código de salida,
 * y con una corrida real sobre el registro de este repositorio —que es la afirmación que
 * importa: el código nuevo sigue validando el registro histórico—. El segundo registro
 * (SaiOpenCloud) vive en otra ruta de la máquina y se mide con el mismo script; el informe
 * de la feature deja constancia de ambos.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderFeatureVerify } from "../packages/engine/src/feature-verify.js";
import { medirRegistro, medirSalida } from "../scripts/medir-salida-s1-s3.mjs";
import type { Ejecutor } from "../scripts/medir-salida-s1-s3.mjs";

const RAIZ = join(import.meta.dirname, "..");

const PRECISION = "Precisión de las compuertas — todo el registro\n\nplan · jev: 5 corrida(s) — aprueba 4, revisa 1, bloquea 0\n  tasa de banda: 20 %";

function ejecutor(validacion: { status: number; stdout: string }): Ejecutor {
  return (_root, argumentos) =>
    argumentos[0] === "validate"
      ? { status: validacion.status, stdout: validacion.stdout, stderr: "" }
      : { status: 0, stdout: PRECISION, stderr: "" };
}

describe("medir un registro", () => {
  it("cuenta los tickets válidos y trae la precisión por compuerta y evaluador", () => {
    const m = medirRegistro("/x/proyecto", ejecutor({ status: 0, stdout: "Tickets válidos: 12\n" }));
    expect(m.valida).toBe(true);
    expect(m.ticketsValidos).toBe(12);
    expect(m.precision).toContain("plan · jev");
    const { informe } = medirSalida(["/x/proyecto"], ejecutor({ status: 0, stdout: "Tickets válidos: 12\n" }), "2026-10-06");
    expect(informe).toContain("# Salida de S1 a S3 — medición del 2026-10-06");
    expect(informe).toContain("12 tickets válidos");
    expect(informe).toContain("tasa de banda: 20 %");
  });

  it("si un registro no valida, sale con código 3 y el informe lo dice con la raíz y la salida", () => {
    const falla = ejecutor({ status: 3, stdout: "SECURITY-X-20260101: type no coincide" });
    const { informe, exitCode } = medirSalida(["/x/roto", "/x/sano"], (root, a) =>
      root === "/x/roto" ? falla(root, a) : ejecutor({ status: 0, stdout: "Tickets válidos: 3\n" })(root, a),
    );
    expect(exitCode).toBe(3);
    expect(informe).toContain("**FALLÓ** en el registro `/x/roto`");
    expect(informe).toContain("type no coincide");
    expect(informe).toContain("3 tickets válidos");
  });
});

describe("el registro de este repositorio", () => {
  it("valida con el código nuevo", () => {
    const m = medirRegistro(RAIZ);
    expect(m.salidaDeValidacion).toMatch(/Tickets válidos: \d+/);
    expect(m.valida).toBe(true);
    expect(m.ticketsValidos).toBeGreaterThan(100);
  });

  it("el informe de la feature trae los dos registros históricos, ambos válidos", () => {
    const informe = readFileSync(
      join(RAIZ, ".valmen", "features", "autonomia-confiable", "salida-s1-s3.md"),
      "utf8",
    );
    expect(informe).toContain("Registro `ValmenHarness`");
    expect(informe).toContain("Registro `SaiOpenCloud`");
    expect(informe.match(/Validación: \*\*correcta\*\*/g)).toHaveLength(2);
    expect(informe).not.toContain("**FALLÓ**");
  });
});

describe("verify.md con anexos", () => {
  let lab: string;
  beforeEach(() => {
    lab = mkdtempSync(join(tmpdir(), "valmen-anexos-"));
  });
  afterEach(() => rmSync(lab, { recursive: true, force: true }));

  it("sin anexos el texto es el de siempre", () => {
    const sin = renderFeatureVerify("kardex", "Kardex", [], "2026-10-06");
    expect(sin).not.toContain("## Anexos");
    expect(renderFeatureVerify("kardex", "Kardex", [], "2026-10-06", [])).toBe(sin);
  });

  it("incluye cada anexo bajo «Anexos»", () => {
    const con = renderFeatureVerify("kardex", "Kardex", [], "2026-10-06", [
      { nombre: "salida-s1-s3.md", texto: "# Medición\n\nTodo bien\n" },
    ]);
    expect(con).toContain("## Anexos");
    expect(con).toContain("### salida-s1-s3.md");
    expect(con).toContain("Todo bien");
  });
});
