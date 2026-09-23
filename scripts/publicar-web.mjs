/**
 * Publica la interfaz junto al código compilado.
 *
 * El servidor sirve `index.html` desde `packages/cli/dist/web/`, y no desde
 * `packages/server/web/`: la interfaz tiene que viajar con lo compilado para que
 * `valmen serve` arranque igual desde cualquier carpeta de trabajo.
 *
 * Esa copia se desincronizaba, y el síntoma es de los peores: **la pantalla
 * muestra la versión vieja y nada dice por qué**. Ya pasó dos veces —una con dos
 * servidores abiertos sobre el mismo proyecto—, así que ahora la copia es parte
 * del build y no un paso que alguien recuerda hacer.
 *
 * `scripts/verificar-interfaz.mjs` comprueba además que las dos coincidan: un
 * build que no copia se ve ahí.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "packages", "server", "web", "index.html");
const destino = join(raiz, "packages", "cli", "dist", "web", "index.html");

if (!existsSync(origen)) {
  process.stderr.write(`No existe la interfaz en ${origen}.\n`);
  process.exit(2);
}

mkdirSync(dirname(destino), { recursive: true });
copyFileSync(origen, destino);
process.stdout.write(`Interfaz publicada en ${destino}\n`);
