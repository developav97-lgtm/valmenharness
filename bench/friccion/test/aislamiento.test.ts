/**
 * El aislamiento y la medición de un recorrido, con un binario falso guionado.
 *
 * El binario falso anota con qué `HOME`, `cwd` y entorno lo lanzaron: es lo que permite
 * afirmar desde fuera que la medición no hereda nada del proceso que mide. Cada prueba lleva
 * el identificador de su criterio (`FR-Cnn`) para poder correrla con `-t`.
 */
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, sep } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { crearEscenario, entornoAislado, limpiarEscenario } from "../src/aislamiento.js";
import { main } from "../src/cli.js";
import { medirRecorrido } from "../src/medicion.js";
import type { ArchivoDeResultados, Recorrido } from "../src/tipos.js";
import { crearBinarioFalso } from "./binario-falso.js";
import type { BinarioFalso, Regla } from "./binario-falso.js";

const TIMEOUT_MS = 20_000;

function recorrido(parcial: Partial<Recorrido> & Pick<Recorrido, "operacion">): Recorrido {
  return {
    id: "r",
    nombre: "recorrido de prueba",
    bloquea: "algo",
    armado: [],
    ...parcial,
  };
}

const falsos: BinarioFalso[] = [];
const carpetas: string[] = [];

function falso(reglas: Regla[]): BinarioFalso {
  const binario = crearBinarioFalso(reglas);
  falsos.push(binario);
  return binario;
}

afterEach(() => {
  for (const binario of falsos.splice(0)) binario.limpiar();
  for (const carpeta of carpetas.splice(0))
    rmSync(carpeta, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("el comando run", () => {
  it("FR-C04 sin --binary sale con código 2 sin escribir el archivo de resultados", () => {
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const carpeta = mkdtempSync(join(tmpdir(), "friccion-prueba-"));
    carpetas.push(carpeta);
    const salida = join(carpeta, "resultados.json");

    expect(main(["run", "--out", salida])).toBe(2);
    expect(existsSync(salida)).toBe(false);
  });
});

/** Corre `run` con un corpus propio contra el binario falso y lee el archivo que escribió. */
function correrRun(
  binario: BinarioFalso,
  recorridos: Recorrido[],
): { codigo: number; salida: string; archivo: ArchivoDeResultados | null } {
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const carpeta = mkdtempSync(join(tmpdir(), "friccion-prueba-"));
  carpetas.push(carpeta);
  const salida = join(carpeta, "resultados.json");
  const codigo = main(
    ["run", "--binary", binario.ruta, "--out", salida, "--timeout-ms", String(TIMEOUT_MS)],
    recorridos,
  );
  return {
    codigo,
    salida,
    archivo: existsSync(salida)
      ? (JSON.parse(readFileSync(salida, "utf8")) as ArchivoDeResultados)
      : null,
  };
}

describe("el código de salida de run", () => {
  const roto = (id: string): Recorrido =>
    recorrido({ id, armado: [{ binario: ["romper"] }], operacion: ["op"] });
  const reglas: Regla[] = [{ cuando: "^op$" }, { cuando: "^romper", salida: 3 }];

  it("CO-C17 sale con 1 cuando un recorrido queda fallido", () => {
    const { codigo } = correrRun(falso(reglas), [
      recorrido({ id: "ok", operacion: ["op"] }),
      roto("roto"),
    ]);

    expect(codigo).toBe(1);
  });

  it("CO-C18 con un recorrido fallido, run escribe el archivo de resultados", () => {
    const { archivo } = correrRun(falso(reglas), [roto("roto")]);

    expect(archivo).not.toBeNull();
    expect(archivo?.totales.fallidos).toBe(1);
  });

  it("CO-C19 el archivo de resultados marca como fallido el recorrido que no se pudo armar", () => {
    const { archivo } = correrRun(falso(reglas), [
      recorrido({ id: "ok", operacion: ["op"] }),
      roto("roto"),
    ]);

    expect(archivo?.recorridos.map((r) => [r.id, r.estado])).toEqual([
      ["ok", "medido"],
      ["roto", "fallido"],
    ]);
    expect(archivo?.recorridos[1]?.motivo).toContain("paso 1");
  });

  it("CO-C23 sale con 0 cuando el único recorrido sin medir está no_soportado", () => {
    const { codigo, archivo } = correrRun(falso(reglas), [
      recorrido({ id: "ok", operacion: ["op"] }),
      recorrido({ id: "nuevo", armado: [{ binario: ["inexistente"] }], operacion: ["op"] }),
    ]);

    expect(archivo?.recorridos.map((r) => [r.id, r.estado])).toEqual([
      ["ok", "medido"],
      ["nuevo", "no_soportado"],
    ]);
    expect(archivo?.totales.no_soportados).toBe(1);
    expect(codigo).toBe(0);
  });
});

describe("el escenario aislado", () => {
  it("FR-C05 el binario corre con un HOME dentro del directorio temporal del escenario", () => {
    const binario = falso([{ cuando: "^op$" }]);
    medirRecorrido(binario.ruta, recorrido({ operacion: ["op"] }), TIMEOUT_MS);

    const llamada = binario.llamadas()[0];
    expect(llamada).toBeDefined();
    const raiz = dirname(llamada!.cwd);
    expect(raiz.startsWith(realpathSync(tmpdir()) + sep)).toBe(true);
    expect(llamada!.home).toBe(join(raiz, "home"));
    expect(llamada!.home).not.toBe(process.env["HOME"]);
  });

  it("FR-C06 el binario corre con su directorio de trabajo dentro del escenario", () => {
    const binario = falso([{ cuando: "^op$" }]);
    medirRecorrido(binario.ruta, recorrido({ operacion: ["op"] }), TIMEOUT_MS);

    const llamada = binario.llamadas()[0];
    expect(llamada).toBeDefined();
    expect(basename(llamada!.cwd)).toBe("proyecto");
    expect(llamada!.cwd.startsWith(realpathSync(tmpdir()) + sep)).toBe(true);
    expect(llamada!.cwd).not.toBe(process.cwd());
  });

  it("FR-C07 el entorno no lleva variables *_API_KEY aunque el proceso que mide las tenga", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "clave-que-no-debe-llegar");
    vi.stubEnv("OPENROUTER_API_KEY", "otra-clave-que-no-debe-llegar");
    const binario = falso([{ cuando: "^op$" }]);
    medirRecorrido(binario.ruta, recorrido({ operacion: ["op"] }), TIMEOUT_MS);

    const llamada = binario.llamadas()[0];
    expect(llamada).toBeDefined();
    expect(llamada!.entorno).toContain("HOME");
    expect(llamada!.entorno.filter((nombre) => nombre.endsWith("_API_KEY"))).toEqual([]);
  });

  it("FR-C08 VALMEN_CLAUDE_BIN apunta a la trampa del escenario", () => {
    const binario = falso([{ cuando: "^op$" }]);
    medirRecorrido(binario.ruta, recorrido({ operacion: ["op"] }), TIMEOUT_MS);

    const llamada = binario.llamadas()[0];
    expect(llamada).toBeDefined();
    expect(llamada!.valmenClaudeBin).toBe(join(dirname(llamada!.cwd), "trampa", "claude"));
    expect(llamada!.claudeBinExiste).toBe(true);
  });

  it("FR-C09 un binario que invoca claude desde el PATH deja el recorrido fallido", () => {
    const binario = falso([{ cuando: "^op$", llamar: "claude", salida: 3 }]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({ operacion: ["op"] }),
      TIMEOUT_MS,
    );

    expect(resultado.estado).toBe("fallido");
    expect(resultado.motivo).toContain("llamó a un CLI de modelo");
    expect(resultado.motivo).toContain("claude");
    expect(resultado.bloqueo).toBeNull();
  });

  it("FR-C13 un subproceso que excede --timeout-ms deja el recorrido fallido", () => {
    const binario = falso([{ cuando: "^op$", esperarMs: 15_000 }]);
    const resultado = medirRecorrido(binario.ruta, recorrido({ operacion: ["op"] }), 500);

    expect(resultado.estado).toBe("fallido");
    expect(resultado.motivo).toContain("tiempo agotado");
  });

  it("FR-C14 un armado que falla deja el recorrido fallido con el paso que falló", () => {
    const binario = falso([{ cuando: "^preparar$" }, { cuando: "^romper", salida: 3 }]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({
        armado: [{ binario: ["preparar"] }, { binario: ["romper", "--ahora"] }],
        operacion: ["op"],
      }),
      TIMEOUT_MS,
    );

    expect(resultado.estado).toBe("fallido");
    expect(resultado.motivo).toContain("paso 2");
    expect(resultado.motivo).toContain("romper --ahora");
    expect(binario.llamadas().map((llamada) => llamada.argv[0])).toEqual([
      "preparar",
      "romper",
    ]);
  });
});

describe("el entorno del escenario", () => {
  it("CO-C16 entornoAislado lleva npm_config_offline con el valor true", () => {
    const escenario = crearEscenario();
    try {
      expect(entornoAislado(escenario)["npm_config_offline"]).toBe("true");
    } finally {
      limpiarEscenario(escenario);
    }
  });
});

describe("un paso de armado que escribe un archivo", () => {
  it("FR-C14 una ruta que sale del escenario deja el recorrido fallido y no escribe nada", () => {
    const binario = falso([{ cuando: "^op$" }]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({
        armado: [{ archivo: { ruta: "../fuera-del-escenario.txt", contenido: "x" } }],
        operacion: ["op"],
      }),
      TIMEOUT_MS,
    );

    expect(resultado.estado).toBe("fallido");
    expect(resultado.motivo).toContain("paso 1");
    expect(resultado.motivo).toContain("la ruta sale del escenario");
    expect(binario.llamadas()).toEqual([]);
  });

  it("FR-C14 un archivo dentro del escenario queda escrito antes de la operación", () => {
    const binario = falso([{ cuando: "^op$", conArchivo: "notas/dato.txt" }]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({
        armado: [{ archivo: { ruta: "notas/dato.txt", contenido: "hola" } }],
        operacion: ["op"],
      }),
      TIMEOUT_MS,
    );

    expect(resultado.estado).toBe("medido");
    expect(resultado.bloqueo).toBeNull();
  });
});

describe("la medición de un bloqueo", () => {
  it("FR-C26 una operación que sale con 0 deja el recorrido sin bloqueo", () => {
    const binario = falso([{ cuando: "^op$" }]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({ operacion: ["op"] }),
      TIMEOUT_MS,
    );

    expect(resultado.estado).toBe("medido");
    expect(resultado.bloqueo).toBeNull();
  });

  it("FR-C18 una salida que destraba la operación deja el bloqueo en_banda", () => {
    const binario = falso([
      {
        cuando: "^op$",
        sinArchivo: "destrabado",
        salida: 3,
        stderr: "Error: bloqueado. Corre `valmen arreglar`.\n",
      },
      { cuando: "^op$" },
      { cuando: "^arreglar$", crear: ["destrabado"] },
    ]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({ operacion: ["op"] }),
      TIMEOUT_MS,
    );

    expect(resultado.estado).toBe("medido");
    expect(resultado.bloqueo?.codigo).toBe(3);
    expect(resultado.bloqueo?.clase).toBe("en_banda");
    expect(resultado.bloqueo?.salidas).toHaveLength(1);
    expect(resultado.bloqueo?.salidas[0]).toMatchObject({
      comando: "valmen arreglar",
      ejecutada: true,
      codigoSalida: 0,
      codigoReintento: 0,
    });
  });

  it("FR-C17 un bloqueo que no cita una salida queda fuera_de_banda y no corre nada más", () => {
    const binario = falso([{ cuando: "^op$", salida: 3, stderr: "Error: no se puede.\n" }]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({ operacion: ["op"] }),
      TIMEOUT_MS,
    );

    expect(resultado.bloqueo?.clase).toBe("fuera_de_banda");
    expect(resultado.bloqueo?.mensaje).toContain("no se puede");
    expect(binario.llamadas().map((llamada) => llamada.argv[0])).toEqual(["op"]);
  });

  it("FR-C19 una salida que el binario rechaza como comando desconocido es callejón", () => {
    const binario = falso([
      {
        cuando: "^op$",
        salida: 3,
        stderr: "Error: bloqueado. Corre `valmen inexistente`.\n",
      },
    ]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({ operacion: ["op"] }),
      TIMEOUT_MS,
    );

    expect(resultado.bloqueo?.clase).toBe("callejon_sin_salida");
    expect(resultado.bloqueo?.motivo).toBe("no existe");
  });

  it("FR-C20 una salida que sale con 0 pero deja la operación bloqueada es callejón", () => {
    const binario = falso([
      { cuando: "^op$", salida: 3, stderr: "Error: bloqueado. Corre `valmen nada`.\n" },
      { cuando: "^nada$" },
    ]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({ operacion: ["op"] }),
      TIMEOUT_MS,
    );

    expect(resultado.bloqueo?.clase).toBe("callejon_sin_salida");
    expect(resultado.bloqueo?.motivo).toBe(
      "tras la salida la operación sigue bloqueada con 3",
    );
  });

  it("FR-C20 el reintento es la operación, salvo que el recorrido declare otro", () => {
    const binario = falso([
      { cuando: "^op$", salida: 3, stderr: "Error: bloqueado. Corre `valmen arreglar`.\n" },
      { cuando: "^arreglar$", crear: ["destrabado"] },
      { cuando: "^reintento$", conArchivo: "destrabado" },
      { cuando: "^reintento$", salida: 3 },
    ]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({ operacion: ["op"], reintento: ["reintento"] }),
      TIMEOUT_MS,
    );

    expect(resultado.bloqueo?.clase).toBe("en_banda");
  });

  it("FR-C21 una salida con un marcador sin variable es callejón y no se corre", () => {
    const binario = falso([
      {
        cuando: "^op$",
        salida: 3,
        stderr: "Error: bloqueado. Corre `valmen resume --id <ID>`.\n",
      },
    ]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({ operacion: ["op"] }),
      TIMEOUT_MS,
    );

    expect(resultado.bloqueo?.clase).toBe("callejon_sin_salida");
    expect(resultado.bloqueo?.motivo).toBe("marcador sin resolver: <ID>");
    expect(resultado.bloqueo?.salidas[0]?.ejecutada).toBe(false);
    expect(binario.llamadas().some((llamada) => llamada.argv[0] === "resume")).toBe(false);
  });

  it("FR-C22 el marcador se reemplaza por la variable del recorrido antes de correr la salida", () => {
    const binario = falso([
      {
        cuando: "^op$",
        sinArchivo: "destrabado",
        salida: 3,
        stderr: "Error: bloqueado. Corre `valmen resume --id <ID>`.\n",
      },
      { cuando: "^op$" },
      { cuando: "^resume --id T-9$", crear: ["destrabado"] },
    ]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({ operacion: ["op"], variables: { ID: "T-9" } }),
      TIMEOUT_MS,
    );

    expect(resultado.bloqueo?.clase).toBe("en_banda");
    expect(
      binario.llamadas().some((llamada) => llamada.argv.join(" ") === "resume --id T-9"),
    ).toBe(true);
  });

  it("FR-C12 una salida que cita una ruta absoluta fuera del escenario no se ejecuta", () => {
    const binario = falso([
      {
        cuando: "^op$",
        salida: 3,
        stderr: "Error: bloqueado. Corre `valmen limpiar /var/ruta-ajena`.\n",
      },
      { cuando: "^limpiar", crear: ["se-ejecuto"] },
    ]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({ operacion: ["op"] }),
      TIMEOUT_MS,
    );

    expect(resultado.bloqueo?.clase).toBe("callejon_sin_salida");
    expect(resultado.bloqueo?.motivo).toBe("fuera del escenario: /var/ruta-ajena");
    expect(resultado.bloqueo?.salidas[0]?.ejecutada).toBe(false);
    expect(binario.llamadas().some((llamada) => llamada.argv[0] === "limpiar")).toBe(false);
  });

  it("FR-C23 cada salida candidata se prueba en un escenario recién armado", () => {
    const binario = falso([
      {
        cuando: "^op$",
        salida: 3,
        stderr: "Error: bloqueado. Corre `valmen ensuciar` o `valmen mirar`.\n",
      },
      { cuando: "^ensuciar$", crear: ["marca"] },
      { cuando: "^mirar$" },
    ]);
    medirRecorrido(binario.ruta, recorrido({ operacion: ["op"] }), TIMEOUT_MS);

    const llamadas = binario.llamadas();
    const ensuciar = llamadas.find((llamada) => llamada.argv[0] === "ensuciar");
    const mirar = llamadas.find((llamada) => llamada.argv[0] === "mirar");
    expect(ensuciar).toBeDefined();
    expect(mirar).toBeDefined();
    expect(ensuciar!.archivos).not.toContain("marca");
    expect(mirar!.archivos).not.toContain("marca");
    // `ensuciar` corre antes que `mirar` y deja la marca: sin un escenario nuevo, `mirar` la vería.
    expect(llamadas.indexOf(ensuciar!)).toBeLessThan(llamadas.indexOf(mirar!));
  });

  it("FR-C24 el bloqueo de un recorrido con rechazoCorrecto lleva ese motivo", () => {
    const binario = falso([{ cuando: "^op$", salida: 3, stderr: "Error: no se puede.\n" }]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({
        operacion: ["op"],
        rechazoCorrecto: { motivo: "el diseño lo rechaza a propósito" },
      }),
      TIMEOUT_MS,
    );

    expect(resultado.bloqueo?.rechazoCorrecto).toEqual({
      motivo: "el diseño lo rechaza a propósito",
    });
  });
});

describe("un recorrido que el binario no soporta", () => {
  it("CO-C20 un paso del armado rechazado como comando desconocido deja el recorrido no_soportado", () => {
    const binario = falso([{ cuando: "^preparar$" }]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({
        armado: [{ binario: ["preparar"] }, { binario: ["nuevo", "--ya"] }],
        operacion: ["op"],
      }),
      TIMEOUT_MS,
    );

    expect(resultado.estado).toBe("no_soportado");
    expect(resultado.motivo).toContain("paso 2");
    expect(resultado.motivo).toContain("nuevo --ya");
    expect(resultado.motivo).toContain("Comando desconocido");
    expect(resultado.bloqueo).toBeNull();
    expect(binario.llamadas().map((llamada) => llamada.argv[0])).toEqual([
      "preparar",
      "nuevo",
    ]);
  });

  it("CO-C21 un paso del armado con una bandera que el binario no declara deja el recorrido no_soportado", () => {
    const binario = falso([
      {
        cuando: "^armar --nueva$",
        salida: 2,
        stderr: "Error: La bandera --nueva no existe para armar. Las que acepta: --id.\n",
      },
    ]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({ armado: [{ binario: ["armar", "--nueva"] }], operacion: ["op"] }),
      TIMEOUT_MS,
    );

    expect(resultado.estado).toBe("no_soportado");
    expect(resultado.motivo).toContain("paso 1");
    expect(resultado.motivo).toContain("La bandera --nueva no existe para armar");
    expect(resultado.bloqueo).toBeNull();
  });

  it("CO-C21 una operación con una bandera que el binario no declara sigue siendo un bloqueo", () => {
    const binario = falso([
      {
        cuando: "^op --idd$",
        salida: 2,
        stderr: "Error: La bandera --idd no existe para op. Las que acepta: --id.\n",
      },
    ]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({ operacion: ["op", "--idd"] }),
      TIMEOUT_MS,
    );

    expect(resultado.estado).toBe("medido");
    expect(resultado.bloqueo?.codigo).toBe(2);
    expect(resultado.bloqueo?.clase).toBe("fuera_de_banda");
  });

  it("CO-C22 una operación que el binario rechaza como comando desconocido deja el recorrido no_soportado", () => {
    const binario = falso([{ cuando: "^preparar$" }]);
    const resultado = medirRecorrido(
      binario.ruta,
      recorrido({ armado: [{ binario: ["preparar"] }], operacion: ["inexistente"] }),
      TIMEOUT_MS,
    );

    expect(resultado.estado).toBe("no_soportado");
    expect(resultado.motivo).toContain("la operación");
    expect(resultado.motivo).toContain("Comando desconocido");
    expect(resultado.bloqueo).toBeNull();
  });
});
