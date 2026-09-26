/**
 * El tope de puntos de un ticket.
 *
 * La referencia decía veinte, y el tope tenía una razón buena: los hallazgos de la
 * misma funcionalidad viven en un único ticket. Lo que se vio en el uso real es lo
 * contrario de lo que el tope suponía: una pantalla nueva, probada por el
 * responsable varias veces, devuelve doce hallazgos, después siete, después
 * seis —y una pantalla completa los pasa de veinte sin esfuerzo—. Con el tope en
 * veinte, el trabajo seguía existiendo y la única salida era abrir un ticket
 * nuevo, que quedaba **fuera de la feature**: sin grafo, sin dependencias y sin
 * la spec que le da los requisitos.
 *
 * Por eso el tope es cien: un techo que un ciclo de correcciones no alcanza, y
 * que sigue atajando al generador descontrolado. Es una divergencia deliberada de
 * `ticket.py`; ver docs/14-INVENTARIO-TICKETPY.md.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MAX_POINTS } from "../packages/core/src/contract.js";
import { addPoint } from "../packages/engine/src/append.js";
import type { RegistryPaths } from "../packages/engine/src/discovery.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const ID = "BUGFIX-POS-FILTRO-PARCIAL-20260922";

let lab: string;

const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });

/** Anota un punto, con el número que sea. */
function anotar(n: number): string {
  return addPoint({
    paths: PATHS(),
    ticketId: ID,
    title: `Hallazgo número ${n}`,
    severity: "low",
    actual: `Pasa esto (${n}).`,
    expected: `Debería pasar lo otro (${n}).`,
  });
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-puntos-"));
  writeFixtureTicket(lab, { id: ID, workflowStatus: "in_progress" });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("el tope de puntos", () => {
  it("el punto veintiuno entra: es el caso que obligaba a abrir otro ticket", () => {
    const veinte = Array.from({ length: 20 }, (_, i) => anotar(i + 1));
    expect(veinte[19]).toContain("POINT-020");

    // Con el tope en veinte esto fallaba, y el hallazgo de la misma pantalla tenía
    // que irse a un ticket nuevo.
    const veintiuno = anotar(21);
    expect(veintiuno).toContain("POINT-021");
  });

  it("corta en cien, que es el techo de cordura y no una meta", () => {
    for (let n = 1; n <= MAX_POINTS; n += 1) anotar(n);
    expect(MAX_POINTS).toBe(100);
    expect(() => anotar(MAX_POINTS + 1)).toThrowError(/máximo de 100 puntos/);
  });

  it("un ticket con cien puntos sigue siendo válido", async () => {
    // El tope del alta y el del validador son el mismo número: si se separaran, el
    // alta escribiría un ticket que el validador rechaza, y el registro quedaría
    // con un ticket inválido que nadie escribió a mano.
    for (let n = 1; n <= MAX_POINTS; n += 1) anotar(n);
    const { validateOne } = await import("../packages/cli/src/commands.js");
    expect(validateOne(PATHS(), ID).exitCode).toBe(0);
  });
});
