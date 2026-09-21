import { existsSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Los tests corren sobre `src`, nunca sobre `dist`.
 *
 * Los paquetes se importan con la extensión `.js` —la exige `NodeNext` para que
 * el `dist` funcione—, y en tiempo de tests esa ruta acababa en el `dist` que
 * hubiera en disco. El resultado era silencioso y engañoso: con `dist` al día,
 * todo verde; sin reconstruir, los tests probaban una versión anterior del código
 * **sin decirlo**, porque el archivo existe y responde. Se descubrió con
 * `parseTicketsYaml`, que en `src` existía y en `dist` no.
 *
 * La regla es una sola: si un import termina en `.js` y a su lado hay un `.ts`,
 * gana el `.ts`. Cubre los dos caminos por los que se colaba el `dist`:
 *
 * - Un test que importa `../packages/core/src/errors.js`.
 * - Un módulo de `src` que importa `./errors.js`, donde el nombre del import **no
 *   dice `src`**: la ruta se resuelve contra quien importa, y por eso mirar solo
 *   el texto del import dejaba pasar el caso más común.
 *
 * Se devuelve la ruta **real**, y eso no es un detalle: el mismo archivo
 * alcanzado por dos rutas distintas —una con symlink, otra sin él— son dos
 * módulos distintos para el grafo de módulos, y entonces `instanceof` falla entre
 * dos copias de la misma clase. Costó encontrarlo: el validador lanzaba un
 * `TicketError` que no era `instanceof TicketError`.
 *
 * Redirigir es lo correcto, y no reconstruir antes de cada corrida: un test que
 * solo pasa después de compilar no puede fallar por lo que acabas de escribir,
 * que es justo lo que un test tiene que hacer.
 *
 * El suite entero pasa con `packages/core/dist` borrado, y esa es la comprobación
 * que vale: si algún día hace falta el `dist` para correr los tests, esto se ha
 * vuelto a romper.
 */
const sourceInsteadOfBuild = {
  name: "valmen-src-sobre-dist",
  enforce: "pre" as const,
  resolveId(source: string, importer: string | undefined) {
    if (!source.endsWith(".js")) return null;
    if (!source.startsWith(".") && !isAbsolute(source)) return null;

    const base = importer === undefined ? process.cwd() : dirname(importer);
    const candidato = resolve(base, source.replace(/\.js$/, ".ts"));
    return existsSync(candidato) ? realpathSync(candidato) : null;
  },
};

/**
 * Los paquetes del monorepo, por su `src`.
 *
 * Sin esto, un `import ... from "@valmen/core"` dentro de `src` no resuelve: el
 * symlink del workspace apunta al `dist`, que puede no existir —y cuando existe,
 * es la copia vieja—. El alias hace que el grafo de módulos sea uno solo: el
 * mismo `core` para el test, para `adapter` y para `engine`.
 *
 * Con el alias puesto, `instanceof` funciona entre paquetes, que es lo que
 * rompía el día que el validador y el test cargaban dos copias de `TicketError`.
 */
function aliasDePaquetes(): { find: string; replacement: string }[] {
  const base = join(process.cwd(), "packages");
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .sort()
    .map((nombre) => ({
      find: `@valmen/${nombre}`,
      replacement: realpathSync(join(base, nombre, "src", "index.ts")),
    }))
    .filter((alias) => existsSync(alias.replacement));
}

export default defineConfig({
  plugins: [sourceInsteadOfBuild],
  resolve: { alias: aliasDePaquetes() },
  test: {
    include: ["packages/*/test/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/fixtures/**"],
    testTimeout: 30_000,
  },
});
