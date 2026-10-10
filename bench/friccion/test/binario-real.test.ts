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
import type { ArchivoDeResultados } from "../src/tipos.js";

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

  it("FR-C27 el recorrido salto-ilegal se clasifica fuera_de_banda", () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const archivo = medir({ binario: BINARIO, recorridos: RECORRIDOS, timeoutMs: 60_000 });

    const resultado = archivo.recorridos.find((r) => r.id === "salto-ilegal");
    expect(resultado).toBeDefined();
    expect(resultado!.estado).toBe("medido");
    expect(resultado!.bloqueo?.clase).toBe("fuera_de_banda");
    expect(resultado!.bloqueo?.codigo).toBe(3);
    expect(resultado!.bloqueo?.mensaje).toContain("intake -> approved");
  });
});
