/**
 * La medición contra el binario real de este árbol (`packages/cli/dist/main.js`).
 *
 * Es la prueba de que el código nuevo maneja el CLI como caja negra de verdad, y no solo un
 * binario falso. Pide el build previo: sin `dist` no hay binario que medir.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { main } from "../src/cli.js";
import { medir } from "../src/medicion.js";
import { RECORRIDOS } from "../src/recorridos.js";
import type { ArchivoDeResultados, ResultadoDeRecorrido } from "../src/tipos.js";

const RAIZ = join(import.meta.dirname, "..", "..", "..");
const BINARIO = join(RAIZ, "packages", "cli", "dist", "main.js");

const carpetas: string[] = [];

function carpetaTemporal(): string {
  const carpeta = realpathSync(mkdtempSync(join(tmpdir(), "friccion-real-")));
  carpetas.push(carpeta);
  return carpeta;
}

function correr(salida: string): ArchivoDeResultados {
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  expect(main(["run", "--binary", BINARIO, "--out", salida])).toBe(0);
  return JSON.parse(readFileSync(salida, "utf8")) as ArchivoDeResultados;
}

beforeAll(() => {
  if (!existsSync(BINARIO)) throw new Error("corre npm run build");
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const carpeta of carpetas.splice(0))
    rmSync(carpeta, { recursive: true, force: true });
});

describe("run contra el binario real", () => {
  it("FR-C01 escribe un JSON con un resultado por cada recorrido del corpus", () => {
    const archivo = correr(join(carpetaTemporal(), "resultados.json"));

    expect(archivo.version).toBe(1);
    expect(archivo.recorridos.map((resultado) => resultado.id)).toEqual(
      RECORRIDOS.map((recorrido) => recorrido.id),
    );
    expect(archivo.corpus.recorridos).toEqual(RECORRIDOS.map((recorrido) => recorrido.id));
    expect(archivo.recorridos.every((resultado) => resultado.estado === "medido")).toBe(
      true,
    );
  });

  it("FR-C02 registra el sha256 del binario medido", () => {
    const archivo = correr(join(carpetaTemporal(), "resultados.json"));

    expect(archivo.binario.sha256).toBe(
      createHash("sha256").update(readFileSync(BINARIO)).digest("hex"),
    );
    expect(archivo.binario.ruta).toBe(realpathSync(BINARIO));
  });

  it("FR-C03 dos corridas con el mismo corpus escriben el mismo corpus.sha256", () => {
    const carpeta = carpetaTemporal();
    const primera = correr(join(carpeta, "uno.json"));
    const segunda = correr(join(carpeta, "dos.json"));

    expect(primera.corpus.sha256).toBe(segunda.corpus.sha256);
    expect(primera.corpus.sha256).toBe(
      createHash("sha256").update(JSON.stringify(RECORRIDOS)).digest("hex"),
    );
  });

  it("FR-C10 tras una corrida, el HOME del proceso que mide sigue sin .valmen/", () => {
    const home = carpetaTemporal();
    vi.stubEnv("HOME", home);
    correr(join(carpetaTemporal(), "resultados.json"));
    vi.unstubAllEnvs();

    expect(existsSync(join(home, ".valmen"))).toBe(false);
  });

  it("FR-C11 tras una corrida, git status del repositorio desde el que se mide queda vacío", () => {
    const repositorio = carpetaTemporal();
    const git = (...argumentos: string[]): string =>
      execFileSync("git", ["-C", repositorio, ...argumentos], { encoding: "utf8" });
    git("init", "-q", "-b", "main");
    git(
      "-c",
      "user.name=prueba",
      "-c",
      "user.email=prueba@example.test",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "base",
    );

    const antes = process.cwd();
    process.chdir(repositorio);
    try {
      correr(join(carpetaTemporal(), "resultados.json"));
    } finally {
      process.chdir(antes);
    }

    expect(git("status", "--porcelain")).toBe("");
  });
});

describe("el corpus completo contra el binario real", () => {
  // Una sola corrida del corpus alimenta todas las pruebas de este bloque. Al ir en un
  // describe aparte, `-t FR-C01` y las demás de arriba no la disparan.
  let archivo: ArchivoDeResultados;

  beforeAll(() => {
    archivo = medir({ binario: BINARIO, recorridos: RECORRIDOS, timeoutMs: 60_000 });
  }, 300_000);

  function resultadoDe(id: string): ResultadoDeRecorrido {
    const resultado = archivo.recorridos.find((r) => r.id === id);
    expect(resultado, `el recorrido ${id} no está en el archivo`).toBeDefined();
    return resultado as ResultadoDeRecorrido;
  }

  it("FR-C27 el recorrido salto-ilegal se clasifica fuera_de_banda", () => {
    const resultado = resultadoDe("salto-ilegal");
    expect(resultado.estado).toBe("medido");
    expect(resultado.bloqueo?.clase).toBe("fuera_de_banda");
    expect(resultado.bloqueo?.codigo).toBe(3);
    expect(resultado.bloqueo?.mensaje).toContain("intake -> approved");
  });

  it("CO-C05 los ocho recorridos quedan en estado medido", () => {
    expect(archivo.recorridos).toHaveLength(8);
    expect(
      archivo.recorridos.map((r) => ({ id: r.id, estado: r.estado, motivo: r.motivo })),
    ).toEqual(RECORRIDOS.map((r) => ({ id: r.id, estado: "medido", motivo: null })));
  });

  it("CO-C06 el recorrido entrega-sin-recibo se clasifica en_banda", () => {
    expect(resultadoDe("entrega-sin-recibo").bloqueo?.clase).toBe("en_banda");
  });

  it("CO-C07 el recorrido sync-desactualizado se clasifica en_banda", () => {
    expect(resultadoDe("sync-desactualizado").bloqueo?.clase).toBe("en_banda");
  });

  it("CO-C08 el recorrido integracion-arbol-sucio se clasifica fuera_de_banda", () => {
    expect(resultadoDe("integracion-arbol-sucio").bloqueo?.clase).toBe("fuera_de_banda");
  });

  it("CO-C09 el recorrido resume-inexistente se clasifica fuera_de_banda", () => {
    expect(resultadoDe("resume-inexistente").bloqueo?.clase).toBe("fuera_de_banda");
  });

  it("CO-C10 el bloqueo del recorrido bandera-mal-escrita lleva rechazoCorrecto", () => {
    const bloqueo = resultadoDe("bandera-mal-escrita").bloqueo;
    expect(bloqueo?.mensaje).toContain("--idd");
    expect(bloqueo?.rechazoCorrecto).not.toBeNull();
    expect(bloqueo?.rechazoCorrecto?.motivo).toContain("R-MSG-003");
  });

  it("CO-C11 el recorrido qa-sin-build se clasifica fuera_de_banda", () => {
    expect(resultadoDe("qa-sin-build").bloqueo?.clase).toBe("fuera_de_banda");
  });

  it("CO-C12 el recorrido cierre-sin-consumo se clasifica callejon_sin_salida", () => {
    expect(resultadoDe("cierre-sin-consumo").bloqueo?.clase).toBe("callejon_sin_salida");
  });

  it("CO-C13 la salida que cita el bloqueo de cierre-sin-consumo queda registrada como ejecutada", () => {
    const salidas = resultadoDe("cierre-sin-consumo").bloqueo?.salidas ?? [];
    const citada = salidas.find((salida) =>
      salida.comando.startsWith("valmen add-ai-usage"),
    );

    expect(citada).toBeDefined();
    expect(citada?.ejecutada).toBe(true);
    expect(citada?.codigoSalida).not.toBeNull();
  });
});
