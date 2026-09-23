/**
 * Copia la interfaz de Mission Control a `dist/web` del CLI.
 *
 * La interfaz se publica junto al código compilado porque el servidor la
 * resuelve desde la ubicación de su propio archivo, no desde una ruta absoluta
 * ni desde el directorio de trabajo: así `valmen serve` arranca igual desde
 * cualquier carpeta y desde un paquete instalado.
 *
 * **Este paso ya existía y la copia igual se quedó vieja**, que es la parte que
 * importa: estaba enganchado al build del paquete `@valmen/cli`
 * (`packages/cli/package.json`) y no al build del repositorio, así que solo corría
 * si alguien construía ese paquete solo. El servidor servía una interfaz de dos
 * días antes y **nada decía por qué**: los cambios simplemente no aparecían.
 *
 * Ahora el build de la raíz lo ejecuta, y `verificar-interfaz.mjs` compara la copia
 * con la fuente — un script que nadie llama no protege de nada.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "packages", "server", "web");
const destino = join(raiz, "packages", "cli", "dist", "web");

if (!existsSync(origen)) {
  console.error(`No se encontró la interfaz en ${origen}.`);
  process.exit(1);
}

mkdirSync(destino, { recursive: true });
cpSync(origen, destino, { recursive: true });
console.log(`interfaz copiada a ${destino.replace(`${raiz}/`, "")}`);
