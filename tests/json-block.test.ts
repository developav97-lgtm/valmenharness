/**
 * La serialización de bloques, contra la implementación de referencia.
 *
 * Un bloque de ticket no se edita: se **re-serializa entero** cada vez que se
 * anexa algo. Si el serializador no reproduce exactamente el formato anterior,
 * añadir una línea al final del historial reformatea todas las demás. Eso no es
 * un cambio de estilo: es tocar un historial que nadie tocó.
 *
 * La prueba que importa es la última: los 399 bloques JSON de los 57 tickets
 * reales, parseados y vueltos a serializar, tienen que dar **el mismo texto byte
 * a byte**. Es la misma técnica que usa la suite de equivalencia del parser.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { STRUCTURED_SECTIONS } from "../packages/core/src/contract.js";
import { formatJsonBlock, formatPythonNumber } from "../packages/core/src/json.js";

const FIXTURE = join(import.meta.dirname, "fixtures", "saicloud", "tickets");

// ── Números ─────────────────────────────────────────────────────────────────

describe("números como los escribe Python", () => {
  /**
   * Los pares están tomados del intérprete real, no de la documentación:
   * `python3 -c "import json; print(json.dumps(v))"`.
   *
   * La columna que importa es la tercera: lo que habría escrito JavaScript.
   */
  const CASOS: readonly [number, string, string][] = [
    [0.0001, "0.0001", "0.0001"],
    [0.00001, "1e-05", "0.00001"],
    [0.0000315, "3.15e-05", "0.0000315"],
    [0.000031542, "3.1542e-05", "0.000031542"],
    [0.5, "0.5", "0.5"],
    [0.1, "0.1", "0.1"],
    [0.3333333333333333, "0.3333333333333333", "0.3333333333333333"],
    [0.30000000000000004, "0.30000000000000004", "0.30000000000000004"],
    [5e-324, "5e-324", "5e-324"],
    [1.7976931348623157e308, "1.7976931348623157e+308", "1.7976931348623157e+308"],
  ];

  for (const [valor, python, javascript] of CASOS) {
    it(`${valor} → ${python} (JavaScript diría ${javascript})`, () => {
      expect(formatPythonNumber(valor)).toBe(python);
    });
  }

  it("distingue el límite de la notación científica", () => {
    // 1e-4 se escribe en posición; 1e-5 ya no. Es el borde exacto de la regla.
    expect(formatPythonNumber(0.0001)).toBe("0.0001");
    expect(formatPythonNumber(0.00009999)).toBe("9.999e-05");
  });

  it("los enteros se escriben sin parte decimal", () => {
    // Aquí está la única diferencia que no se puede eliminar: Python escribe
    // `1.0` para un flotante y `1` para un entero, y JavaScript no distingue
    // los dos después de `JSON.parse`. Se elige la forma entera.
    expect(formatPythonNumber(751)).toBe("751");
    expect(formatPythonNumber(0)).toBe("0");
    expect(formatPythonNumber(-3)).toBe("-3");
  });

  it("rechaza un número no finito en vez de escribir algo inválido", () => {
    // `Infinity` produciría un bloque que el propio validador rechaza. Fallar
    // aquí convierte un dato imposible en un error que se ve.
    expect(() => formatPythonNumber(Number.POSITIVE_INFINITY)).toThrow(/no finito/);
    expect(() => formatPythonNumber(Number.NaN)).toThrow(/no finito/);
  });
});

// ── Bloques ─────────────────────────────────────────────────────────────────

describe("la forma de un bloque", () => {
  it("usa dos espacios de indentación y `: ` como separador", () => {
    expect(formatJsonBlock([{ a: 1, b: "x" }])).toBe(
      '[\n  {\n    "a": 1,\n    "b": "x"\n  }\n]',
    );
  });

  it("los contenedores vacíos van en una línea", () => {
    expect(formatJsonBlock([])).toBe("[]");
    expect(formatJsonBlock([{}])).toBe("[\n  {}\n]");
  });

  it("conserva el orden de inserción de las claves", () => {
    // El orden es parte del contrato: `json.dumps` respeta el del diccionario y
    // el recibo de la referencia depende de él.
    expect(formatJsonBlock([{ z: 1, a: 2, m: 3 }])).toBe(
      '[\n  {\n    "z": 1,\n    "a": 2,\n    "m": 3\n  }\n]',
    );
  });

  it("no escapa los acentos, porque el archivo es UTF-8", () => {
    expect(formatJsonBlock([{ details: "Se agregó el punto." }])).toBe(
      '[\n  {\n    "details": "Se agregó el punto."\n  }\n]',
    );
  });

  it("omite una clave con valor indefinido, que no existe en JSON", () => {
    expect(formatJsonBlock([{ a: 1, b: undefined }])).toBe('[\n  {\n    "a": 1\n  }\n]');
  });

  it("rechaza un valor que no existe en JSON", () => {
    expect(() => formatJsonBlock([{ a: () => 1 }])).toThrow(/no existe en JSON/);
  });
});

// ── Los bloques reales ──────────────────────────────────────────────────────

/** Recorre el fixture y devuelve cada bloque JSON con su texto original. */
function bloquesReales(): { id: string; seccion: string; texto: string }[] {
  const encontrados: { id: string; seccion: string; texto: string }[] = [];

  const anios = readdirSync(FIXTURE).filter((nombre) =>
    statSync(join(FIXTURE, nombre)).isDirectory(),
  );

  for (const anio of anios) {
    for (const id of readdirSync(join(FIXTURE, anio))) {
      const ruta = join(FIXTURE, anio, id, "ticket.md");
      let texto: string;
      try {
        texto = readFileSync(ruta, "utf8");
      } catch {
        continue;
      }

      for (const seccion of STRUCTURED_SECTIONS) {
        const encabezado = new RegExp(`^## ${seccion}$`, "m").exec(texto);
        if (encabezado === null) continue;
        const cuerpo = texto.slice(encabezado.index);
        const bloque = /^```json\n([\s\S]*?)\n```[ \t]*$/m.exec(cuerpo);
        if (bloque === null) continue;
        encontrados.push({ id, seccion, texto: bloque[1] as string });
      }
    }
  }

  return encontrados;
}

describe("los bloques del registro real", () => {
  const bloques = bloquesReales();

  it("el fixture tiene los 57 tickets y sus bloques", () => {
    expect(bloques.length).toBeGreaterThan(300);
    expect(new Set(bloques.map((bloque) => bloque.id)).size).toBe(57);
  });

  it("re-serializar cada bloque reproduce el texto original byte a byte", () => {
    const divergentes: string[] = [];

    for (const bloque of bloques) {
      const datos = JSON.parse(bloque.texto) as unknown;
      const mio = formatJsonBlock(datos);
      if (mio !== bloque.texto) {
        divergentes.push(`${bloque.id} · ${bloque.seccion}`);
      }
    }

    // Si esto falla, escribir en un ticket reformatearía bloques que nadie
    // tocó. El mensaje dice cuáles, para poder mirarlos.
    expect(divergentes).toEqual([]);
  });

  it("no hay ningún flotante en el registro, y por eso la equivalencia es total", () => {
    // Dato, no suposición: se comprueba. Si algún día entra un flotante, este
    // test lo dice antes de que el problema aparezca como un diff inexplicable.
    const flotantes: string[] = [];

    const recorrer = (valor: unknown, ruta: string): void => {
      if (typeof valor === "number" && !Number.isInteger(valor)) {
        flotantes.push(`${ruta}=${String(valor)}`);
        return;
      }
      if (Array.isArray(valor)) {
        valor.forEach((item, indice) => recorrer(item, `${ruta}[${indice}]`));
        return;
      }
      if (typeof valor === "object" && valor !== null) {
        for (const [clave, item] of Object.entries(valor)) {
          recorrer(item, `${ruta}.${clave}`);
        }
      }
    };

    for (const bloque of bloques) {
      recorrer(JSON.parse(bloque.texto), `${bloque.id}/${bloque.seccion}`);
    }

    expect(flotantes).toEqual([]);
  });
});
