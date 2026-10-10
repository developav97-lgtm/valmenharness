/**
 * El clasificador de bloqueos: funciones puras, sin disco ni procesos.
 *
 * Cada prueba lleva el identificador de su criterio (`FR-Cnn`, de C1 a C31 del ticket
 * FEATURE-BENCH-FRICCION-RUNNER-20261010) para poder correrla con `-t`.
 */
import { describe, expect, it } from "vitest";

import {
  clasificar,
  esComandoDesconocido,
  extraerSalidas,
  fueraDelEscenario,
  resolverMarcadores,
  totalizar,
} from "../src/clasificador.js";
import type {
  Bloqueo,
  Clase,
  IntentoDeSalida,
  ResultadoDeRecorrido,
} from "../src/tipos.js";

function intento(parcial: Partial<IntentoDeSalida>): IntentoDeSalida {
  return {
    comando: "valmen arreglar",
    ejecutada: true,
    motivo: null,
    codigoSalida: 0,
    codigoReintento: 0,
    ...parcial,
  };
}

describe("extraer las salidas que cita un mensaje", () => {
  it("FR-C15 devuelve cada comando citado como `valmen <cmd> …`", () => {
    const mensaje =
      "Falta el recibo. Corre `valmen gate plan --id X-1` y luego `valmen resume --id X-1`.";
    expect(extraerSalidas(mensaje)).toEqual([
      { comando: "valmen gate plan --id X-1", argv: ["gate", "plan", "--id", "X-1"] },
      { comando: "valmen resume --id X-1", argv: ["resume", "--id", "X-1"] },
    ]);
  });

  it("FR-C15 tokeniza las comillas simples y dobles de un comando citado", () => {
    const mensaje =
      "Usa `valmen create --title \"Un título largo\" --request 'otra cosa'`.";
    expect(extraerSalidas(mensaje)).toEqual([
      {
        comando: "valmen create --title \"Un título largo\" --request 'otra cosa'",
        argv: ["create", "--title", "Un título largo", "--request", "otra cosa"],
      },
    ]);
  });

  it("FR-C16 ignora un `valmen <cmd>` escrito fuera de comillas invertidas", () => {
    expect(
      extraerSalidas("Corre valmen gate plan --id X-1 y revisa `git status`."),
    ).toEqual([]);
    expect(extraerSalidas("Sin ninguna salida citada.")).toEqual([]);
  });
});

describe("clasificar un bloqueo según sus intentos de salida", () => {
  it("FR-C17 un bloqueo sin salida citada es fuera_de_banda", () => {
    expect(clasificar([]).clase).toBe<Clase>("fuera_de_banda");
  });

  it("FR-C18 es en_banda si la salida sale con 0 y el reintento también", () => {
    const { clase } = clasificar([intento({ codigoSalida: 0, codigoReintento: 0 })]);
    expect(clase).toBe<Clase>("en_banda");
  });

  it("FR-C18 basta una salida que destraba aunque otra falle", () => {
    const { clase } = clasificar([
      intento({
        comando: "valmen nada",
        codigoSalida: 2,
        codigoReintento: null,
        motivo: "no existe",
      }),
      intento({ codigoSalida: 0, codigoReintento: 0 }),
    ]);
    expect(clase).toBe<Clase>("en_banda");
  });

  it("FR-C19 un comando que el binario rechaza como desconocido es callejón", () => {
    expect(
      esComandoDesconocido(
        "Error: Comando desconocido: x. Use --help para ver los disponibles.",
      ),
    ).toBe(true);
    expect(esComandoDesconocido("Error: Comando de escritura desconocido: x.")).toBe(true);
    expect(
      esComandoDesconocido("Error: Transición de ticket intake -> approved no permitida."),
    ).toBe(false);

    const resultado = clasificar([
      intento({ codigoSalida: 2, codigoReintento: null, motivo: "no existe" }),
    ]);
    expect(resultado).toEqual({ clase: "callejon_sin_salida", motivo: "no existe" });
  });

  it("FR-C20 es callejón si la salida sale con 0 pero el reintento sigue bloqueado", () => {
    const resultado = clasificar([intento({ codigoSalida: 0, codigoReintento: 3 })]);
    expect(resultado).toEqual({
      clase: "callejon_sin_salida",
      motivo: "tras la salida la operación sigue bloqueada con 3",
    });
  });

  it("FR-C20 es callejón, con su motivo, si la propia salida falla", () => {
    const resultado = clasificar([intento({ codigoSalida: 1, codigoReintento: null })]);
    expect(resultado).toEqual({
      clase: "callejon_sin_salida",
      motivo: "la salida falla con 1",
    });
  });

  it("FR-C21 un marcador sin variable en el recorrido es callejón", () => {
    const resuelto = resolverMarcadores(["resume", "--id", "<ID>"], {});
    expect(resuelto.sinResolver).toEqual(["ID"]);

    const resultado = clasificar([
      intento({
        ejecutada: false,
        motivo: "marcador sin resolver: <ID>",
        codigoSalida: null,
        codigoReintento: null,
      }),
    ]);
    expect(resultado).toEqual({
      clase: "callejon_sin_salida",
      motivo: "marcador sin resolver: <ID>",
    });
  });
});

describe("resolver los marcadores de una salida", () => {
  it("FR-C22 reemplaza `<ID>` por la variable `ID` del recorrido", () => {
    const resuelto = resolverMarcadores(["resume", "--id", "<ID>", "--to=<ESTADO>"], {
      ID: "T-1",
      ESTADO: "approved",
    });
    expect(resuelto).toEqual({
      argv: ["resume", "--id", "T-1", "--to=approved"],
      sinResolver: [],
    });
  });
});

describe("el escenario donde una salida puede correr", () => {
  it("FR-C12 señala una ruta absoluta fuera del escenario, también tras `--bandera=`", () => {
    const raiz = "/tmp/escenario";
    expect(fueraDelEscenario(["limpiar", "/etc/hosts"], raiz)).toBe("/etc/hosts");
    expect(fueraDelEscenario(["limpiar", "--root=/etc"], raiz)).toBe("/etc");
    expect(fueraDelEscenario(["limpiar", "/tmp/escenario/../otro"], raiz)).toBe(
      "/tmp/escenario/../otro",
    );
    expect(
      fueraDelEscenario(["limpiar", "/tmp/escenario/proyecto/x", "relativa"], raiz),
    ).toBeNull();
  });
});

describe("totalizar los resultados", () => {
  function bloqueo(
    clase: Clase,
    rechazoCorrecto: Bloqueo["rechazoCorrecto"] = null,
  ): Bloqueo {
    return { codigo: 3, mensaje: "x", salidas: [], clase, motivo: "x", rechazoCorrecto };
  }
  function resultado(
    id: string,
    estado: ResultadoDeRecorrido["estado"],
    bloqueoMedido: Bloqueo | null,
  ): ResultadoDeRecorrido {
    return { id, nombre: id, estado, motivo: null, bloqueo: bloqueoMedido };
  }

  it("FR-C25 un rechazo correcto no suma en los totales de fricción", () => {
    const totales = totalizar([
      resultado("a", "medido", bloqueo("en_banda")),
      resultado("b", "medido", bloqueo("fuera_de_banda")),
      resultado("c", "medido", bloqueo("callejon_sin_salida")),
      resultado(
        "d",
        "medido",
        bloqueo("fuera_de_banda", { motivo: "el diseño lo rechaza" }),
      ),
      resultado("e", "medido", null),
      resultado("f", "fallido", null),
    ]);
    expect(totales).toEqual({
      en_banda: 1,
      fuera_de_banda: 1,
      callejon_sin_salida: 1,
      rechazos_correctos: 1,
      fallidos: 1,
    });
  });
});
