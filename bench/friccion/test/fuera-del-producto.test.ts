/**
 * La medición vive fuera del producto: no entra a su typecheck, a `npm test` ni a sus
 * paquetes, y la CI la verifica aparte.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "..", "..", "..");
const FUENTE = join(import.meta.dirname, "..", "src");

function archivosTs(carpeta: string): string[] {
  return readdirSync(carpeta, { recursive: true, encoding: "utf8" })
    .filter((ruta) => ruta.endsWith(".ts"))
    .map((ruta) => join(carpeta, ruta));
}

describe("fuera del producto", () => {
  it("FR-C28 tsc --showConfig del tsconfig de la raíz no lista archivos de bench/", () => {
    const salida = execFileSync(
      process.execPath,
      [
        join(RAIZ, "node_modules", "typescript", "bin", "tsc"),
        "--showConfig",
        "-p",
        "tsconfig.json",
      ],
      { cwd: RAIZ, encoding: "utf8" },
    );
    const { files } = JSON.parse(salida) as { files: string[] };

    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((archivo) => archivo.includes("bench/"))).toEqual([]);
  });

  it("FR-C29 vitest list --filesOnly de la raíz no lista archivos de bench/", () => {
    const salida = execFileSync(
      process.execPath,
      [join(RAIZ, "node_modules", "vitest", "vitest.mjs"), "list", "--filesOnly"],
      { cwd: RAIZ, encoding: "utf8" },
    );
    const archivos = salida.split("\n").filter((linea) => linea.trim() !== "");

    expect(archivos.length).toBeGreaterThan(0);
    expect(archivos.filter((archivo) => archivo.includes("bench/"))).toEqual([]);
  });

  it("FR-C30 ningún archivo de bench/friccion/src importa de packages/ ni de @valmen/", () => {
    const archivos = archivosTs(FUENTE);
    expect(archivos.length).toBeGreaterThan(0);

    const importaciones = archivos.flatMap((archivo) =>
      [
        ...readFileSync(archivo, "utf8").matchAll(
          /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g,
        ),
      ].map((coincidencia) => ({ archivo, especificador: coincidencia[1] ?? "" })),
    );
    const prohibidas = importaciones.filter(
      ({ especificador }) =>
        especificador.includes("packages/") || especificador.startsWith("@valmen/"),
    );

    expect(importaciones.length).toBeGreaterThan(0);
    expect(prohibidas).toEqual([]);
  });

  it("FR-C31 la CI declara un paso que corre la prueba de la medición", () => {
    const flujo = readFileSync(
      join(RAIZ, ".github", "workflows", "verificacion.yml"),
      "utf8",
    );

    expect(flujo).toMatch(
      /^\s+(?:run:\s+)?npx vitest run --config bench\/friccion\/vitest\.config\.ts\s*$/m,
    );
  });
});
