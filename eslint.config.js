// @ts-check
import tseslint from "typescript-eslint";

/**
 * El lint del repositorio.
 *
 * Deliberadamente corto. TypeScript en modo estricto ya cubre la mayor parte de lo
 * que un lint aportaría —tipos, variables sin usar, código inalcanzable—, así que
 * aquí solo van las reglas que el compilador **no** puede ver y que en este
 * proyecto ya han sido un problema real:
 *
 * 1. **Promesas sin esperar.** Un `runGate` olvidado no falla: devuelve una promesa
 *    que nadie mira, y el gate no corre. Es el fallo más caro posible aquí.
 * 2. **`any` explícito.** El proyecto entero está tipado; un `any` colado lo
 *    desactiva en silencio para todo lo que toque.
 * 3. **Una `Promise` dentro de un `forEach`.** El bucle termina antes que las
 *    tareas, así que el resultado se lee a medias.
 *
 * No se activa `no-console`: los comandos del CLI escriben en la salida a
 * propósito, y una regla que hay que silenciar en veinte sitios es una regla que
 * se acaba silenciando entera.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "tests/fixtures/**",
      "packages/cli/dist/**",
      "packages/*/dist/**",
      // La configuración del propio lint y los guiones de `scripts/` no están en
      // ningún `tsconfig`: son JavaScript suelto, y el servicio del proyecto los
      // rechaza. Se revisan a ojo, que para dos archivos es suficiente.
      "eslint.config.js",
      "scripts/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
