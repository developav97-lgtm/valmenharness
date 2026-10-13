/**
 * La compuerta mecánica corre en una sola invocación los criterios que solo
 * difieren en la etiqueta de la prueba.
 *
 * BUGFIX-RESTAURANTE-PAGO-BONIFICADO-RETROACTIVO-20261013 (SaiOpenCloud) declaró 19
 * criterios con `docker compose run --rm backend python manage.py test <etiqueta>`:
 * la compuerta arrancó 19 contenedores y tardó 364 s, contra unos 22 s de las mismas
 * 19 pruebas en una corrida. Lo que se afirma acá:
 *
 * 1. Los checks de criterios con el mismo comando, salvo la última etiqueta, de un
 *    runner que acepta varias (Django, pytest), corren una sola vez y todos se cumplen.
 * 2. Si la corrida agrupada falla, cada criterio se vuelve a correr solo, para que el
 *    recibo diga cuál falló.
 * 3. Un comando que no es de un runner conocido, o un check suelto, corre como antes.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { evaluateWithCommands } from "../packages/gate-command/src/index.js";
import type { Proposition } from "../packages/gate/src/index.js";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-agrupada-"));
  // Un `manage.py` falso: anota cada invocación y falla si alguna etiqueta dice «falla».
  writeFileSync(
    join(lab, "manage.py"),
    [
      "const fs = require('node:fs');",
      "const etiquetas = process.argv.slice(3);",
      "fs.appendFileSync('invocaciones.log', etiquetas.join(' ') + '\\n');",
      "const falla = etiquetas.some((e) => e.includes('falla'));",
      "console.error(`Ran ${etiquetas.length} tests\\n\\n${falla ? 'FAILED (failures=1)' : 'OK'}`);",
      "process.exit(falla ? 1 : 0);",
    ].join("\n"),
  );
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

function criterio(n: number): Proposition {
  return { id: `criterio_${String(n).padStart(2, "0")}`, kind: "noul", instructions: "se cumple" };
}

function django(n: number, etiqueta: string) {
  return {
    propositionId: criterio(n).id,
    command: "node",
    args: ["manage.py", "test", etiqueta],
    description: `C${n}`,
  };
}

function invocaciones(): string[] {
  return readFileSync(join(lab, "invocaciones.log"), "utf8").trim().split("\n");
}

describe("corrida agrupada de criterios", () => {
  it("corre una vez los criterios que solo difieren en la etiqueta y los da por cumplidos", () => {
    const checks = [django(1, "app.T.a"), django(2, "app.T.b"), django(3, "app.T.c")];
    const r = evaluateWithCommands([criterio(1), criterio(2), criterio(3)], checks, {
      root: lab,
    });

    expect(invocaciones()).toEqual(["app.T.a app.T.b app.T.c"]);
    expect(r.answers.map((a) => (a.kind === "noul" ? a.value : null))).toEqual([1, 1, 1]);
    expect(r.results).toHaveLength(3);
    expect(r.results.every((x) => x.invocation === "node manage.py test app.T.a app.T.b app.T.c")).toBe(true);
    // La duración se cuenta una sola vez: la suma de los resultados es la de la corrida.
    expect(r.results.filter((x) => x.durationMs > 0).length).toBeLessThanOrEqual(1);
  });

  it("si la corrida agrupada falla, corre cada criterio solo y dice cuál falló", () => {
    const checks = [django(1, "app.T.a"), django(2, "app.T.falla"), django(3, "app.T.c")];
    const r = evaluateWithCommands([criterio(1), criterio(2), criterio(3)], checks, {
      root: lab,
    });

    expect(invocaciones()).toEqual([
      "app.T.a app.T.falla app.T.c",
      "app.T.a",
      "app.T.falla",
      "app.T.c",
    ]);
    expect(r.answers.map((a) => (a.kind === "noul" ? a.value : null))).toEqual([1, 0, 1]);
    expect(r.results.map((x) => x.invocation)).toEqual([
      "node manage.py test app.T.a",
      "node manage.py test app.T.falla",
      "node manage.py test app.T.c",
    ]);
  });

  it("un check suelto o de un comando que no es runner corre como antes", () => {
    const otro = {
      propositionId: criterio(2).id,
      command: "node",
      args: ["-e", "require('node:fs').appendFileSync('invocaciones.log', 'otro\\n')"],
      description: "C2",
    };
    const r = evaluateWithCommands([criterio(1), criterio(2)], [django(1, "app.T.a"), otro], {
      root: lab,
    });

    expect(invocaciones()).toEqual(["app.T.a", "otro"]);
    expect(r.answers.map((a) => (a.kind === "noul" ? a.value : null))).toEqual([1, 1]);
  });
});
