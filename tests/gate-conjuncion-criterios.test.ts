/**
 * Una conjunción dentro de un nombre o de la condición inicial no hace compuesto a un criterio.
 *
 * `afirmacionesDe` cuenta una afirmación por cada conjunción de la cláusula principal; un literal
 * (acentos graves, comillas angulares o dobles) es un nombre, y la condición inicial —desde una
 * palabra de condición hasta la primera coma— no es cláusula principal. Una conjunción que une dos
 * verbos sigue contando 2. Cada fila lleva el criterio del ticket
 * BUGFIX-GATE-CONJUNCION-CRITERIOS-20261010 que verifica.
 */
import { describe, expect, it } from "vitest";

import { decidirCriterioEnCodigo } from "../packages/engine/src/revision-previa.js";
import { afirmacionesDe, extractCriteriaSpecs } from "../packages/gate/src/index.js";
import { renderFixtureTicket } from "./helpers/fixtures.js";

const C13_REAL =
  "Con OpenCode 2.0.16 y `--auto`, un agente proyectado no puede leer `.env`";
const C14_REAL =
  "Con OpenCode 2.0.16 y `--auto`, un agente proyectado no puede ejecutar `git -C . reset --hard`";

describe("afirmacionesDe: la conjunción cuenta solo en la cláusula principal", () => {
  it.each<[string, string, number]>([
    ["C1 C13 real del recibo plan-1", C13_REAL, 1],
    ["C2 C14 real del recibo plan-1", C14_REAL, 1],
    ["C3 dos verbos con «y»", "El sistema valida el monto y envía el aviso", 2],
    ["C4 dos verbos con «e»", "El sistema valida el monto e informa el resultado", 2],
    ["C5 dos verbos con «o»", "El sistema valida el monto o rechaza el pago", 2],
    ["C6 «o» en la condición", "Si hay saldo o crédito, el sistema envía el aviso", 1],
    ["C7 «e» en la condición", "Con saldo e historial, el sistema envía el aviso", 1],
    [
      "C8 «u» en la condición",
      "Cuando falta una cuenta u otra, el sistema envía el aviso",
      1,
    ],
    [
      "C9 literal entre acentos graves",
      "El sistema ejecuta `git reset y clean` sin error",
      1,
    ],
    [
      "C10 literal entre comillas angulares",
      "El sistema muestra «guardar y salir» en el menú",
      1,
    ],
    [
      "C11 condición y dos verbos",
      "Con saldo, el sistema valida el monto y envía el aviso",
      2,
    ],
    [
      "C12 condición sin coma se cuenta entera",
      "Sin jornada del día el avance lo dice y explica",
      2,
    ],
    ["C13 etiqueta con regla", `C13. (R-PER-002) ${C13_REAL}`, 1],
  ])("%s", (_nombre, texto, esperado) => {
    expect(afirmacionesDe(texto)).toBe(esperado);
  });

  it("C14 decidirCriterioEnCodigo vota 0.99 al C13 real como manual citado por un paso", () => {
    const [criterio] = extractCriteriaSpecs(
      `- [ ] ${C13_REAL}\n      <!-- verify: manual -->`,
    );
    const ticket = renderFixtureTicket({
      id: "BUGFIX-GATE-CONJUNCION-CRITERIOS-20261010",
      plan: [
        "- Pasos ordenados:",
        "  1. Cambiar `packages/gate/src/criteria.ts` (C1).",
        "- Rollback: revertir el commit del cambio en su rama.",
      ].join("\n"),
    });
    expect(
      decidirCriterioEnCodigo(1, criterio as NonNullable<typeof criterio>, ticket).valor,
    ).toBe(0.99);
  });
});
