/**
 * El comando `compare`, con archivos de resultados sintéticos: ninguna prueba corre un
 * binario. Cada prueba lleva el identificador de su criterio (`CO-Cnn`, de
 * FEATURE-BENCH-FRICCION-CORPUS-20261010) para poder correrla con `-t`.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { main } from "../src/cli.js";
import { totalizar } from "../src/clasificador.js";
import type {
  ArchivoDeResultados,
  Clase,
  ResultadoDeRecorrido,
  Totales,
} from "../src/tipos.js";

const carpetas: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const carpeta of carpetas.splice(0))
    rmSync(carpeta, { recursive: true, force: true });
});

function carpetaTemporal(): string {
  const carpeta = realpathSync(mkdtempSync(join(tmpdir(), "friccion-compare-")));
  carpetas.push(carpeta);
  return carpeta;
}

function medido(id: string, clase: Clase | null): ResultadoDeRecorrido {
  return {
    id,
    nombre: `Recorrido ${id}`,
    estado: "medido",
    motivo: null,
    bloqueo:
      clase === null
        ? null
        : {
            codigo: 3,
            mensaje: "x",
            salidas: [],
            clase,
            motivo: "x",
            rechazoCorrecto: null,
          },
  };
}

function sinMedir(id: string, estado: "fallido" | "no_soportado"): ResultadoDeRecorrido {
  return { id, nombre: `Recorrido ${id}`, estado, motivo: "x", bloqueo: null };
}

function archivo(
  recorridos: ResultadoDeRecorrido[],
  corpusSha256 = "corpus-uno",
): ArchivoDeResultados {
  return {
    version: 1,
    fecha: "2026-10-10T00:00:00.000Z",
    binario: { ruta: "/tmp/valmen/main.js", sha256: "binario", etiqueta: null },
    corpus: { sha256: corpusSha256, recorridos: recorridos.map((r) => r.id) },
    recorridos,
    totales: totalizar(recorridos),
  };
}

function escribir(carpeta: string, nombre: string, contenido: unknown): string {
  const ruta = join(carpeta, nombre);
  writeFileSync(
    ruta,
    typeof contenido === "string" ? contenido : JSON.stringify(contenido, null, 2),
  );
  return ruta;
}

/** Corre `compare` y devuelve el código de salida con lo que escribió en cada flujo. */
function comparar(
  antes: string,
  despues: string,
): { codigo: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  vi.spyOn(process.stdout, "write").mockImplementation((texto) => {
    stdout += String(texto);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((texto) => {
    stderr += String(texto);
    return true;
  });
  const codigo = main(["compare", antes, despues]);
  return { codigo, stdout, stderr };
}

/** Dos corridas del mismo corpus: `a` y `b` cambian de clase, `c` sigue igual. */
function dosCorridas(): { antes: string; despues: string } {
  const carpeta = carpetaTemporal();
  return {
    antes: escribir(
      carpeta,
      "antes.json",
      archivo([
        medido("a", "en_banda"),
        medido("b", "fuera_de_banda"),
        medido("c", "callejon_sin_salida"),
      ]),
    ),
    despues: escribir(
      carpeta,
      "despues.json",
      archivo([
        medido("a", "fuera_de_banda"),
        medido("b", "fuera_de_banda"),
        medido("c", "callejon_sin_salida"),
      ]),
    ),
  };
}

function totalesEn(linea: string, texto: string): RegExpMatchArray | null {
  return texto.match(new RegExp(`^\\s*${linea}\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s*$`, "m"));
}

describe("compare por recorrido", () => {
  it("CO-C25 imprime una línea por recorrido con la clase de cada corrida", () => {
    const { antes, despues } = dosCorridas();
    const { codigo, stdout } = comparar(antes, despues);

    expect(codigo).toBe(0);
    expect(stdout).toMatch(/^a\s+en_banda\s+fuera_de_banda\s*$/m);
    expect(stdout).toMatch(/^b\s+fuera_de_banda\s+fuera_de_banda\s*$/m);
    expect(stdout).toMatch(/^c\s+callejon_sin_salida\s+callejon_sin_salida\s*$/m);
  });

  it("CO-C25 un recorrido sin bloqueo, fallido o no soportado lleva su estado en vez de una clase", () => {
    const carpeta = carpetaTemporal();
    const antes = escribir(
      carpeta,
      "antes.json",
      archivo([medido("a", null), sinMedir("b", "fallido"), sinMedir("c", "no_soportado")]),
    );
    const despues = escribir(
      carpeta,
      "despues.json",
      archivo([medido("a", null), sinMedir("b", "fallido"), sinMedir("c", "no_soportado")]),
    );
    const { stdout } = comparar(antes, despues);

    expect(stdout).toMatch(/^a\s+sin_bloqueo\s+sin_bloqueo\s*$/m);
    expect(stdout).toMatch(/^b\s+fallido\s+fallido\s*$/m);
    expect(stdout).toMatch(/^c\s+no_soportado\s+no_soportado\s*$/m);
  });
});

describe("compare en total", () => {
  it("CO-C26 imprime los totales de cada corrida por clase de bloqueo", () => {
    const { antes, despues } = dosCorridas();
    const { stdout } = comparar(antes, despues);

    expect(totalesEn("en_banda", stdout)?.slice(1, 3)).toEqual(["1", "0"]);
    expect(totalesEn("fuera_de_banda", stdout)?.slice(1, 3)).toEqual(["1", "2"]);
    expect(totalesEn("callejon_sin_salida", stdout)?.slice(1, 3)).toEqual(["1", "1"]);
  });

  it("CO-C27 imprime la diferencia de cada total entre las dos corridas", () => {
    const { antes, despues } = dosCorridas();
    const { stdout } = comparar(antes, despues);

    expect(totalesEn("en_banda", stdout)?.[3]).toBe("-1");
    expect(totalesEn("fuera_de_banda", stdout)?.[3]).toBe("+1");
    expect(totalesEn("callejon_sin_salida", stdout)?.[3]).toBe("0");
  });

  it("CO-C27 dos corridas iguales muestran diferencia 0 en cada total", () => {
    const carpeta = carpetaTemporal();
    const contenido = archivo([medido("a", "en_banda"), medido("b", "fuera_de_banda")]);
    const { stdout } = comparar(
      escribir(carpeta, "uno.json", contenido),
      escribir(carpeta, "dos.json", contenido),
    );

    for (const total of [
      "en_banda",
      "fuera_de_banda",
      "callejon_sin_salida",
      "rechazos_correctos",
      "fallidos",
      "no_soportados",
    ]) {
      expect(totalesEn(total, stdout)?.[3], total).toBe("0");
    }
  });
});

describe("compare ante corridas que no son comparables del todo", () => {
  it("CO-C28 avisa cuando los corpus.sha256 de los dos archivos difieren", () => {
    const carpeta = carpetaTemporal();
    const { stdout } = comparar(
      escribir(carpeta, "antes.json", archivo([medido("a", "en_banda")], "corpus-uno")),
      escribir(carpeta, "despues.json", archivo([medido("a", "en_banda")], "corpus-dos")),
    );

    expect(stdout).toMatch(/^Aviso: .*corpus/im);
    expect(stdout).toContain("corpus-uno");
    expect(stdout).toContain("corpus-dos");
  });

  it("CO-C28 no avisa cuando los corpus.sha256 coinciden", () => {
    const { antes, despues } = dosCorridas();
    const { stdout } = comparar(antes, despues);

    expect(stdout).not.toMatch(/aviso/i);
  });

  it("CO-C29 un recorrido que falta en una de las corridas aparece como ausente", () => {
    const carpeta = carpetaTemporal();
    const { stdout } = comparar(
      escribir(carpeta, "antes.json", archivo([medido("a", "en_banda")])),
      escribir(
        carpeta,
        "despues.json",
        archivo([medido("a", "en_banda"), medido("b", "fuera_de_banda")]),
      ),
    );

    expect(stdout).toMatch(/^b\s+ausente\s+fuera_de_banda\s*$/m);
    expect(stdout).toMatch(/^a\s+en_banda\s+en_banda\s*$/m);
  });
});

describe("compare ante un archivo que no sirve", () => {
  it("CO-C30 sale con 2 cuando uno de los archivos no existe", () => {
    const carpeta = carpetaTemporal();
    const existente = escribir(carpeta, "antes.json", archivo([medido("a", "en_banda")]));
    const { codigo, stderr } = comparar(existente, join(carpeta, "no-existe.json"));

    expect(codigo).toBe(2);
    expect(stderr).toContain("no-existe.json");
  });

  it("CO-C30 sale con 2 cuando falta un argumento", () => {
    let stderr = "";
    vi.spyOn(process.stderr, "write").mockImplementation((texto) => {
      stderr += String(texto);
      return true;
    });
    const carpeta = carpetaTemporal();
    const existente = escribir(carpeta, "antes.json", archivo([medido("a", "en_banda")]));

    expect(main(["compare", existente])).toBe(2);
    expect(stderr).toContain("compare");
  });

  it("CO-C31 sale con 2 cuando un archivo no es JSON", () => {
    const carpeta = carpetaTemporal();
    const bueno = escribir(carpeta, "antes.json", archivo([medido("a", "en_banda")]));
    const { codigo, stderr } = comparar(
      bueno,
      escribir(carpeta, "malo.json", "no es json"),
    );

    expect(codigo).toBe(2);
    expect(stderr).toContain("malo.json");
  });

  it("CO-C31 sale con 2 cuando un archivo no es de resultados con version 1", () => {
    const carpeta = carpetaTemporal();
    const bueno = escribir(carpeta, "antes.json", archivo([medido("a", "en_banda")]));
    const otraVersion = { ...archivo([medido("a", "en_banda")]), version: 2 };
    const { codigo, stderr } = comparar(bueno, escribir(carpeta, "v2.json", otraVersion));

    expect(codigo).toBe(2);
    expect(stderr).toContain("v2.json");
    expect(stderr).toContain("version");
  });

  it("CO-C32 lee un archivo de resultados que no trae totales.no_soportados", () => {
    const carpeta = carpetaTemporal();
    const recorridos = [medido("a", "en_banda"), medido("b", "fuera_de_banda")];
    const anterior = archivo(recorridos);
    const totalesAnteriores: Partial<Totales> = { ...anterior.totales };
    delete totalesAnteriores.no_soportados;
    const sinCampo = { ...anterior, totales: totalesAnteriores };
    const { codigo, stdout } = comparar(
      escribir(carpeta, "anterior.json", sinCampo),
      escribir(carpeta, "nuevo.json", archivo(recorridos)),
    );

    expect(codigo).toBe(0);
    expect(totalesEn("no_soportados", stdout)?.slice(1, 4)).toEqual(["0", "0", "0"]);
    expect(stdout).toMatch(/^a\s+en_banda\s+en_banda\s*$/m);
  });
});
