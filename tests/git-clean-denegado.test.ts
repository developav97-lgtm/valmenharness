/**
 * La regla deny de `git clean` cierra las formas que destruyen archivos y sigue admitiendo el
 * simulacro (modo directo, EST-008). Una tabla de casos, probada en cada cliente con el comparador
 * de `helpers/git-clean-denegado.ts` y la proyección real: antes del arreglo `git clean -xdf`,
 * `-df`, `env git clean -f` y `command git clean -f` quedaban permitidos.
 */
import { describe, expect, it } from "vitest";

import {
  CLAUDE_CLEAN_LIMIT,
  claudeDenyRules,
  codexRulesText,
  denyNotApplied,
  opencodeDenyPermission,
} from "../packages/adapter/src/index.js";
import {
  CASOS_CLEAN,
  LIMITES_CONOCIDOS,
  veredictoCodex,
  veredictoPorPatrones,
  type Veredicto,
} from "./helpers/git-clean-denegado.js";

const CLIENTES: ReadonlyArray<{
  nombre: "claude" | "opencode" | "codex";
  veredicto: (linea: string) => Veredicto;
}> = [
  {
    nombre: "claude",
    veredicto: (linea) =>
      veredictoPorPatrones(
        claudeDenyRules()
          .filter((regla) => regla.startsWith("Bash("))
          .map((regla) => regla.slice(5, -1)),
        linea,
      ),
  },
  {
    nombre: "opencode",
    veredicto: (linea) =>
      veredictoPorPatrones(Object.keys(opencodeDenyPermission().bash), linea),
  },
  { nombre: "codex", veredicto: (linea) => veredictoCodex(codexRulesText(), linea) },
];

describe("git clean: lo que destruye se niega y el simulacro se admite", () => {
  describe.each(CLIENTES)("$nombre", ({ nombre, veredicto }) => {
    it.each(CASOS_CLEAN.map((caso) => [caso.comando, caso[nombre]] as const))(
      "«%s» queda %s",
      (comando, esperado) => {
        expect(veredicto(comando)).toBe(esperado);
      },
    );
  });

  describe.each(CLIENTES)(
    "límite conocido: tras env o command ($nombre)",
    ({ veredicto }) => {
      it.each(LIMITES_CONOCIDOS)(
        "«%s» queda permitido, y se reporta como no aplicado",
        (comando) => {
          expect(veredicto(comando)).toBe("permitido");
        },
      );
    },
  );

  it("Claude Code lo dice como límite conocido, aparte de lo no aplicado de Codex y OpenCode", () => {
    expect(CLAUDE_CLEAN_LIMIT).toMatch(/git clean tras env o command sigue permitido/);
    expect(denyNotApplied(["claude"], null, false)).toEqual([]);
  });

  it.each(["codex", "opencode"] as const)(
    "%s reporta git clean tras env o command como no aplicado",
    (cliente) => {
      const aviso = denyNotApplied([cliente], null, false).filter((n) =>
        /git clean/.test(n.regla),
      );
      expect(aviso.length).toBeGreaterThan(0);
      expect(aviso.every((n) => n.cliente === cliente)).toBe(true);
      expect(aviso.map((n) => n.motivo).join(" ")).toMatch(/env|envoltorio/);
    },
  );

  it("Codex reporta como no aplicado lo que su prefijo no puede expresar de git clean", () => {
    const codex = denyNotApplied(["codex"], null, false).filter((n) =>
      n.regla.startsWith("git clean"),
    );
    expect(codex).toHaveLength(1);
    expect(codex[0]?.motivo).toMatch(/opciones globales|envoltorio/);
  });
});
