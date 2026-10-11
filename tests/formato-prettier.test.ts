/**
 * `npm run format:check` (`prettier --check .`) sale con 0: el código propio está formateado y los
 * registros y archivos que otras pruebas miden al byte quedan fuera, con su motivo en
 * `.prettierignore`. Antes del arreglo, `main` tenía 293 archivos distintos de lo que Prettier
 * escribe y el CI de formato no podía pasar.
 *
 * La muestra es fija y cubre cada familia: el CLI (`main.ts`), el motor, un módulo que Prettier
 * solo estabiliza en dos pasadas (`blocks.ts`), una prueba, un script `.mjs` y una configuración
 * `.json`.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "..");

const MUESTRA = [
  "packages/cli/src/main.ts",
  "packages/engine/src/tickets.ts",
  "packages/core/src/blocks.ts",
  "packages/server/src/index.ts",
  "tests/worktree-git.test.ts",
  "scripts/programar-tickets.mjs",
  "packages/engine/tsconfig.json",
] as const;

const NO_SE_REFORMATEAN = [
  ".valmen/receipts/",
  ".valmen/qa/",
  ".valmen/features/",
  ".valmen/memory/",
  ".valmen/skills/",
  "skills/",
  "tickets/",
  "tests/fixtures/",
] as const;

describe("formato con Prettier", () => {
  it.each(MUESTRA)("%s ya está formateado", (archivo) => {
    const salida = spawnSync("npx", ["prettier", "--check", archivo], {
      cwd: RAIZ,
      encoding: "utf8",
    });
    expect(salida.stdout + salida.stderr).toContain(
      "All matched files use Prettier code style",
    );
    expect(salida.status).toBe(0);
  });

  it.each(NO_SE_REFORMATEAN)("%s no se reformatea (.prettierignore)", (ruta) => {
    const lineas = readFileSync(join(RAIZ, ".prettierignore"), "utf8")
      .split("\n")
      .map((linea) => linea.trim());
    expect(lineas).toContain(ruta);
  });
});
