/**
 * Un comando que no llegó a probar no es una prueba fallida (R-CDEF-006).
 *
 * La compuerta mecánica contaba como falso todo comando que salía con un código
 * distinto del esperado, aunque no hubiera ejecutado ni una prueba: una base de
 * datos de pruebas ya creada bloqueaba el ticket como si el código estuviera roto.
 * Lo que se afirma acá:
 *
 * 1. Sin pruebas ejecutadas —base ya existente, conexión rechazada, comando
 *    inexistente, tiempo agotado, o salida sin el resumen del runner— el criterio
 *    queda en la banda de revisión y dice por qué.
 * 2. Una prueba que corrió y falló sigue bloqueando.
 * 3. El recibo guarda la **cola** de la salida y el sha256 de la salida completa.
 * 4. Los checks que no son de criterios no cambian.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MAX_CAPTURED_OUTPUT,
  classifyEnvironmentFailure,
  evaluateWithCommands,
  runCommandCheck,
} from "../packages/gate-command/src/index.js";
import type { Proposition } from "../packages/gate/src/index.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-entorno-"));
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

const CRITERIO: Proposition = { id: "criterio_01", kind: "noul", instructions: "se cumple" };
const FIJA: Proposition = { id: "fija_01", kind: "noul", instructions: "se cumple" };

/** Un «comando de pruebas» que imprime lo dado y sale con el código dado. */
function comando(propositionId: string, salida: string, codigo: number, extra: string[] = []) {
  return {
    propositionId,
    command: "node",
    args: [
      "-e",
      `process.stdout.write(${JSON.stringify(salida)}); process.exit(${codigo})`,
      ...extra,
    ],
    description: "prueba",
  };
}

describe("clasificar una falla del entorno", () => {
  const base = { expectedExitCode: 0 } as const;

  it("reconoce la base de datos de pruebas que ya existía", () => {
    expect(
      classifyEnvironmentFailure({
        ...base,
        line: "python manage.py test inventario",
        exitCode: 1,
        output: "Got an error creating the test database: database \"test_x\" already exists",
      }),
    ).toContain("base de datos de pruebas ya existía");
  });

  it("reconoce una conexión rechazada", () => {
    expect(
      classifyEnvironmentFailure({ ...base, line: "node x.js", exitCode: 1, output: "connect ECONNREFUSED 127.0.0.1:5432" }),
    ).toContain("conexión rechazada");
  });

  it("un runner conocido sin su resumen no llegó a ejecutar la suite", () => {
    expect(
      classifyEnvironmentFailure({ ...base, line: "npx vitest run", exitCode: 0, output: "hola" }),
    ).toContain("no trae el resumen de pruebas de vitest");
  });

  it("con el resumen del runner la suite corrió: un fallo es una prueba fallida", () => {
    expect(
      classifyEnvironmentFailure({
        ...base,
        line: "python manage.py test inventario",
        exitCode: 1,
        // Menciona la base de datos, pero hay resumen: las pruebas corrieron.
        output: "FAIL: test_db (database already exists in fixture)\nRan 3 tests in 0.2s\nFAILED (failures=1)",
      }),
    ).toBeNull();
  });

  it("un programa que no es un runner conocido y sale bien no se clasifica", () => {
    expect(classifyEnvironmentFailure({ ...base, line: "node script.js", exitCode: 0, output: "" })).toBeNull();
  });
});

describe("la compuerta de criterios ante una falla del entorno", () => {
  it("una base ya existente responde con la banda de revisión, no con bloqueo", () => {
    const { answers, results, failures } = evaluateWithCommands(
      [CRITERIO],
      [comando("criterio_01", 'database "test_x" already exists', 1)],
      { root: lab },
    );
    expect(failures).toEqual([]);
    expect(answers).toEqual([{ id: "criterio_01", kind: "noul", value: 0.5 }]);
    expect(results[0]?.environmentFailure).toContain("base de datos de pruebas ya existía");
  });

  it("un comando inexistente en un criterio se revisa sin detener la compuerta", () => {
    const { answers, results, failures } = evaluateWithCommands(
      [CRITERIO],
      [{ propositionId: "criterio_01", command: "no-existe-xyz", args: [], description: "x" }],
      { root: lab },
    );
    expect(failures).toEqual([]);
    expect(answers[0]?.value).toBe(0.5);
    expect(results[0]?.environmentFailure).toContain("no-existe-xyz");
  });

  it("un tiempo agotado en un criterio también se revisa", () => {
    const { answers, results } = evaluateWithCommands(
      [CRITERIO],
      [{ propositionId: "criterio_01", command: "sleep", args: ["5"], description: "x", timeoutMs: 200 }],
      { root: lab },
    );
    expect(answers[0]?.value).toBe(0.5);
    expect(results[0]?.environmentFailure).toContain("tiempo máximo");
  });

  it("una prueba que corrió y falló sigue bloqueando", () => {
    const { answers, results } = evaluateWithCommands(
      [CRITERIO],
      // La línea contiene `manage.py test` (runner Django) y la salida su resumen.
      [comando("criterio_01", "Ran 3 tests in 0.2s\nFAILED (failures=1)", 1, ["manage.py", "test"])],
      { root: lab },
    );
    expect(answers).toEqual([{ id: "criterio_01", kind: "noul", value: 0 }]);
    expect(results[0]?.environmentFailure).toBeUndefined();
  });

  it("una prueba que pasa con su resumen sigue aprobando", () => {
    const { answers } = evaluateWithCommands(
      [CRITERIO],
      [comando("criterio_01", "Test Files  1 passed (1)\n      Tests  3 passed (3)", 0, ["vitest"])],
      { root: lab },
    );
    expect(answers[0]?.value).toBe(1);
  });

  it("un check que no es de criterio conserva el comportamiento anterior", () => {
    const { answers, failures } = evaluateWithCommands(
      [FIJA],
      [{ propositionId: "fija_01", command: "no-existe-xyz", args: [], description: "x" }],
      { root: lab },
    );
    expect(answers).toEqual([]);
    expect(failures).toHaveLength(1);
  });
});

describe("la salida que guarda el recibo", () => {
  it("conserva la cola con el resumen de una suite de 40 KB y el sha256 de la completa", () => {
    const ruido = "x".repeat(40_000);
    const resumen = "\nTest Files  1 passed (1)\n      Tests  7 passed (7)\n";
    const completa = ruido + resumen;

    const resultado = runCommandCheck(comando("criterio_01", completa, 0, ["vitest"]), { root: lab });

    expect(resultado.stdout.length).toBeLessThanOrEqual(MAX_CAPTURED_OUTPUT);
    expect(resultado.stdout.endsWith(resumen)).toBe(true);
    expect(resultado.stdoutSha256).toBe(createHash("sha256").update(completa, "utf8").digest("hex"));
    expect(resultado.stdoutBytes).toBe(40_000 + resumen.length);
    // El resumen estaba al final: con el comienzo del texto no se habría visto.
    expect(completa.slice(0, MAX_CAPTURED_OUTPUT)).not.toContain("Tests  7 passed");
    expect(resultado.environmentFailure).toBeUndefined();
  });
});
