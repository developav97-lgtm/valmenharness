/**
 * `hasStructuredPlan` descarta solo cabeceras de compuerta, no pasos que nombran «gate».
 *
 * Caso real: BUGFIX-GATE-CONTRADICCION-DESCRIPTIVA-20261005, cuyos pasos citaban
 * `packages/gate/` y el motor rechazó `approved` por «menos de dos pasos reales».
 */
import { describe, expect, it } from "vitest";

import { hasStructuredPlan } from "../packages/core/src/index.js";

const PLANTILLA = `
- Gate de plan y aprobación:
- Pasos ordenados:
- Impactos declarados:
- Rollback (obligatorio):
`;

describe("hasStructuredPlan", () => {
  it("cuenta como pasos los que citan packages/gate/ y tests/gate-decide.test.ts", () => {
    const plan = `
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).
- Pasos ordenados:
  1. En packages/gate/src/decide.ts, corregir la decisión de contradicción (C1).
  2. En tests/gate-decide.test.ts, fijar el caso de contradicción descriptiva (C2).
  3. Correr npx vitest run tests/gate-decide.test.ts (C3).
- Rollback (obligatorio): revertir el commit.
`;
    expect(hasStructuredPlan(plan)).toBe(true);
  });

  it("no cuenta la plantilla sin rellenar, con solo cabeceras", () => {
    expect(hasStructuredPlan(PLANTILLA)).toBe(false);
  });

  it("no cuenta una cabecera de compuerta o de aprobación del PO con valor en la línea", () => {
    const plan = `
- Gate de plan y aprobación: pendiente
- Gate de análisis: aprobado
- Aprobación del PO: pendiente
- Gate no exigible: cambio de texto
`;
    expect(hasStructuredPlan(plan)).toBe(false);
  });

  it("un solo paso real sigue sin alcanzar", () => {
    const plan = `
- Gate de plan y aprobación: pendiente
1. En packages/gate/src/decide.ts, corregir la decisión.
`;
    expect(hasStructuredPlan(plan)).toBe(false);
  });
});
