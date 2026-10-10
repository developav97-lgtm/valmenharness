import { defineConfig } from "vitest/config";

/**
 * Las pruebas de la medición de fricción.
 *
 * Viven aparte del producto: el `vitest.config.ts` de la raíz solo mira los `test` de cada
 * paquete y `tests/`, así que `npm test` no las ve. `pool: "forks"` porque algunas pruebas cambian
 * `process.chdir` y `process.env.HOME`, y eso no se puede hacer desde un hilo.
 */
export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ["test/**/*.test.ts"],
    pool: "forks",
    testTimeout: 120_000,
  },
});
