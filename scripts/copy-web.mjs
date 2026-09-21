/**
 * Copia la interfaz de Mission Control a `dist/web` del CLI.
 *
 * La interfaz se publica junto al código compilado porque el servidor la
 * resuelve desde la ubicación de su propio archivo, no desde una ruta absoluta
 * ni desde el directorio de trabajo: así `valmen serve` arranca igual desde
 * cualquier carpeta y desde un paquete instalado.
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
