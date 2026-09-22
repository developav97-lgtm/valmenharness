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
 * El bloque de un proveedor, como texto.
 *
 * Este paquete no depende de `@valmen/core` a propósito: lee un archivo de
 * secretos y no debe arrastrar el parser de configuración ni nada que pueda
 * acabar volcando un valor en un mensaje. Por eso la lectura vive aquí, y por eso
 * hay un test que comprueba que coincide con la de `core` sobre el mismo archivo:
 * dos implementaciones que tienen que dar lo mismo necesitan que algo lo afirme.
 *
 * Se cuentan columnas y no se usa una expresión regular, y las dos razones están
 * medidas. Con el ancla `^[ \t]*${id}:` a secas, buscar `opencode-go` encontraba
 * el bloque de `opencode` —la `o` final encajaba como un `[ \t]*` vacío y `-go:`
 * como el resto del nombre—, así que se leía la clave de otro proveedor. Y sin
 * fijar la indentación, el bloque seguía leyendo las claves hermanas de después:
 * el de `codex` se llevaba también `opencode` y `opencode-go`.
 */
export function blockOf(text: string, id: string): string | null {
  const lineas = text.split(/\r?\n/);
  const clave = new RegExp(`^([ \\t]*)${id}:[ \\t]*(?:#.*)?$`);
  for (let index = 0; index < lineas.length; index += 1) {
    const match = clave.exec(lineas[index] as string);
    if (match === null) continue;

    const indent = (match[1] as string).length;
    const cuerpo: string[] = [];
    for (let otra = index + 1; otra < lineas.length; otra += 1) {
      const linea = lineas[otra] as string;
      if (linea.trim() === "") break;
      if (linea.length - linea.trimStart().length <= indent) break;
      cuerpo.push(linea);
    }
    return cuerpo.length === 0 ? null : cuerpo.join("\n");
  }
  return null;
}

/**
 * El valor de un campo del bloque.
 *
 * `patron` es una expresión regular porque hay campos con dos nombres: `api-key`
 * es el correcto y `api-key-env` el de una plantilla anterior, con el valor
 * literal dentro. Rechazar el segundo rompería configuraciones válidas por un
 * detalle de nomenclatura ya corregido.
 */
export function fieldOf(block: string, patron: string): string | null {
  const match = new RegExp(
    `^[ \\t]+(?:${patron}):[ \\t]*["']?([^"'\\n]*)["']?[ \\t]*$`,
    "m",
  ).exec(block);
  const valor = match?.[1]?.trim();
  return valor === undefined || valor === "" ? null : valor;
}

/** Resuelve la API key de un proveedor.
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
  filePath?: string,
): string {
  const nombreVariable = `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
  const desdeEntorno = env[nombreVariable];
  if (typeof desdeEntorno === "string" && desdeEntorno.trim() !== "") {
    return desdeEntorno.trim();
  }

  // El archivo se puede indicar, y eso no es una comodidad de las pruebas: el
  // servidor tiene un archivo de credenciales en su contexto, y sin esta vía lo
  // ignoraba y leía el del `$HOME`. El efecto era que un harness apuntando a otro
  // archivo usaba la clave del usuario, y que ninguna prueba podía aislarse: el
  // chat funcionaba en la máquina del desarrollador —donde el archivo existe— y
  // fallaba en el CI, que es la peor forma de tener un test verde.
  const ruta =
    filePath ??
    credentialsPath(
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

  // El bloque se busca a cualquier profundidad: el archivo tiene los proveedores
  // bajo `providers:` y las suscripciones bajo `subscriptions:`, y las dos son
  // fuentes válidas de una credencial. Antes solo se leía `providers:` y una
  // suscripción con clave —`opencode-go`— quedaba invisible.
  const bloque = blockOf(texto, provider);
  if (bloque === null) {
    throw new CredentialError(
      `El archivo de credenciales no tiene un bloque \`${provider}\`.`,
    );
  }

  const valor = fieldOf(bloque, "api-key(?:-env)?");
  if (valor === null) {
    const tieneCampo = /^[ \t]+api-key(?:-env)?:/m.test(bloque);
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
