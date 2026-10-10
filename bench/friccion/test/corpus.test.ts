/**
 * El corpus de recorridos y el comando `list`. Cada prueba lleva el identificador de su
 * criterio (`CO-Cnn`, de FEATURE-BENCH-FRICCION-CORPUS-20261010) para poder correrla con `-t`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { main } from "../src/cli.js";
import { RECORRIDOS } from "../src/recorridos.js";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Lo que `main` escribe en la salida estándar, como líneas no vacías, y su código. */
function listar(): { codigo: number; lineas: string[] } {
  const escrito: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((texto) => {
    escrito.push(String(texto));
    return true;
  });
  const codigo = main(["list"]);
  return {
    codigo,
    lineas: escrito
      .join("")
      .split("\n")
      .filter((linea) => linea.trim() !== ""),
  };
}

describe("el corpus", () => {
  it("CO-C01 RECORRIDOS declara los ocho recorridos del corpus mínimo en el orden de R-FRI-003", () => {
    expect(RECORRIDOS.map((recorrido) => recorrido.id)).toEqual([
      "salto-ilegal",
      "entrega-sin-recibo",
      "sync-desactualizado",
      "integracion-arbol-sucio",
      "resume-inexistente",
      "bandera-mal-escrita",
      "qa-sin-build",
      "cierre-sin-consumo",
    ]);
  });
});

describe("el comando list", () => {
  it("CO-C02 imprime una línea por recorrido del corpus y sale con 0", () => {
    const { codigo, lineas } = listar();

    expect(codigo).toBe(0);
    expect(lineas).toHaveLength(RECORRIDOS.length);
  });

  it("CO-C03 cada línea lleva el nombre de su recorrido", () => {
    const { lineas } = listar();

    RECORRIDOS.forEach((recorrido, indice) => {
      expect(lineas[indice]).toContain(recorrido.nombre);
    });
  });

  it("CO-C04 cada línea lleva la operación que bloquea su recorrido", () => {
    const { lineas } = listar();

    RECORRIDOS.forEach((recorrido, indice) => {
      expect(lineas[indice]).toContain(recorrido.bloquea);
    });
  });
});
