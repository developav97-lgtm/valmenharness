/**
 * Resolución de credenciales de proveedores.
 *
 * Un solo lugar, para que configurar una clave sea una sola operación. Antes
 * cada evaluador resolvía la suya y una clave puesta en el archivo funcionaba
 * con Jev pero no con el juez, que es exactamente el tipo de inconsistencia que
 * hace que la configuración parezca arbitraria.
 *
 * El valor **nunca** se registra, se imprime ni se incluye en un mensaje de
 * error. Un diagnóstico que filtra la credencial que intentaba leer es peor que
 * no tener diagnóstico.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Error de credencial ausente o mal formada. */
export class CredentialError extends Error {
  readonly code = "CREDENTIAL_MISSING";

  constructor(message: string) {
    super(message);
    this.name = "CredentialError";
  }
}

/** Ruta del archivo de credenciales del harness. */
export function credentialsPath(home: string = homedir()): string {
  return join(home, ".valmen", ".credentials.yaml");
}

/**
 * Resuelve la API key de un proveedor.
 *
 * Orden: la variable de entorno primero —permite una prueba puntual sin
 * escribir el secreto en disco— y si no está, el archivo de credenciales.
 *
 * El análisis del archivo es deliberadamente simple y **no** usa el parser de
 * configuración: este archivo contiene secretos y no debe pasar por estructuras
 * que puedan acabar en un mensaje de error.
 */
export function resolveApiKey(
  provider = "openrouter",
  env: NodeJS.ProcessEnv = process.env,
): string {
  const nombreVariable = `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
  const desdeEntorno = env[nombreVariable];
  if (typeof desdeEntorno === "string" && desdeEntorno.trim() !== "") {
    return desdeEntorno.trim();
  }

  const ruta = credentialsPath(
    typeof env["HOME"] === "string" ? env["HOME"] : homedir(),
  );
  let texto: string;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch {
    throw new CredentialError(
      `No hay API key de ${provider}. Exporte ${nombreVariable} o ponga la clave en ${ruta}.`,
    );
  }

  // El proveedor está indentado bajo `providers:`, así que el ancla admite
  // espacios iniciales. Exigir la columna cero haría que el bloque nunca se
  // encontrara en el archivo que genera la plantilla.
  const bloque = new RegExp(
    `^[ \\t]*${provider}:[ \\t]*\\n((?:[ \\t]+.*\\n)*)`,
    "m",
  ).exec(texto);
  if (bloque === null) {
    throw new CredentialError(
      `El archivo de credenciales no tiene un bloque \`${provider}\`.`,
    );
  }

  // Se aceptan los dos nombres de campo. `api-key` es el correcto, pero una
  // versión anterior de la plantilla se llamaba `api-key-env` y sugería una
  // indirección que no existía; hay archivos en uso con ese nombre y el valor
  // literal dentro, así que rechazarlos rompería una configuración válida por un
  // detalle de nomenclatura ya corregido.
  const campo = bloque[1] as string;
  const clave =
    /^[ \t]+api-key(?:-env)?:[ \t]*["']?([^"'\n]+)["']?[ \t]*$/m.exec(campo);
  const valor = clave?.[1]?.trim();

  if (valor === undefined || valor === "") {
    const tieneCampo = /^[ \t]+api-key(?:-env)?:/m.test(campo);
    throw new CredentialError(
      tieneCampo
        ? `El bloque \`${provider}\` del archivo de credenciales tiene el campo de clave vacío.`
        : `El bloque \`${provider}\` del archivo de credenciales no declara \`api-key\`.`,
    );
  }

  // Un nombre de variable de entorno pegado por descuido no es una clave: si el
  // valor parece un identificador en mayúsculas, se avisa en vez de enviarlo y
  // recibir un 401 confuso.
  if (/^[A-Z][A-Z0-9_]{6,}$/.test(valor)) {
    throw new CredentialError(
      `El campo de clave del bloque \`${provider}\` contiene "${valor}", que parece el ` +
        "NOMBRE de una variable de entorno y no una clave. Ponga el valor literal " +
        "o exporte esa variable.",
    );
  }

  return valor;
}

/** `true` si hay una credencial resoluble para el proveedor. */
export function hasApiKey(
  provider = "openrouter",
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  try {
    resolveApiKey(provider, env);
    return true;
  } catch {
    return false;
  }
}
