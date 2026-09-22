/**
 * La credencial de la suscripción de codex.
 *
 * `~/.codex/auth.json` no guarda una clave: guarda tokens OAuth de ChatGPT. Dos
 * consecuencias que no son obvias y que costaron descubrir:
 *
 * 1. **El token caduca.** El `access_token` dura días, y el CLI lo refresca solo.
 *    Por eso se lee del disco **en cada llamada** y no se cachea: una copia en
 *    memoria sobreviviría al refresco del CLI y empezaría a dar 401 sin que nada
 *    hubiera cambiado.
 * 2. **Hay que mandar `chatgpt-account-id`.** El token sirve para varias cuentas y
 *    el backend necesita saber cuál. El identificador no está en un campo aparte:
 *    vive dentro del JWT, en el espacio de nombres de OpenAI.
 *
 * La primera versión del harness decía que «el token de suscripción no sirve
 * contra la API de OpenAI», y era una suposición: se comprobó que
 * `chatgpt.com/backend-api/codex/models` responde 200 con este token, y que
 * `/responses` contesta con el texto. La suposición dejaba sin desplegable a los
 * modelos que el usuario tiene contratados.
 *
 * El token **nunca** se registra ni se incluye en un mensaje: se devuelve para
 * usarlo como cabecera y nada más.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Error de credencial de codex ausente o ilegible. */
export class CodexCredentialError extends Error {
  readonly code = "CREDENTIAL_MISSING";

  constructor(message: string) {
    super(message);
    this.name = "CodexCredentialError";
  }
}

/** Ruta del archivo de autenticación del CLI de codex. */
export function codexAuthPath(home: string = homedir()): string {
  return join(home, ".codex", "auth.json");
}

/** Lo que hace falta para hablar con la suscripción. */
export interface CodexCredential {
  /** El `access_token`, que va como `Bearer`. No se registra nunca. */
  readonly accessToken: string;
  /** La cuenta de ChatGPT a la que pertenece, para la cabecera. */
  readonly accountId: string;
}

/** El valor de un campo anidado, sin lanzar si no está. */
function campo(objeto: unknown, ...ruta: readonly string[]): unknown {
  let actual: unknown = objeto;
  for (const parte of ruta) {
    if (typeof actual !== "object" || actual === null) return undefined;
    actual = (actual as Record<string, unknown>)[parte];
  }
  return actual;
}

/**
 * El identificador de cuenta que viaja **dentro** del token.
 *
 * Se lee del JWT sin verificar la firma, y eso está bien aquí: no se está
 * autenticando nada —el backend lo hará—, se está sacando un dato que el propio
 * token afirma sobre sí mismo. Verificar la firma sería comprobar que OpenAI es
 * quien dice ser, que no es asunto de este código.
 */
export function accountIdFromToken(token: string): string | null {
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const payload = partes[1] as string;
    const relleno = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const datos = JSON.parse(
      Buffer.from(relleno.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as unknown;
    const auth = campo(datos, "https://api.openai.com/auth");
    const id = campo(auth, "chatgpt_account_id");
    return typeof id === "string" && id !== "" ? id : null;
  } catch {
    return null;
  }
}

/**
 * Lee la credencial del CLI.
 *
 * Se lee del disco cada vez. Ver la nota de arriba: el CLI refresca el token por
 * su cuenta, y una copia en memoria quedaría obsoleta sin avisar.
 */
export function readCodexCredential(home: string = homedir()): CodexCredential {
  const ruta = codexAuthPath(home);
  let texto: string;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch {
    throw new CodexCredentialError(
      `No hay credencial de codex en ${ruta}. Inicia sesión con su CLI una vez y ` +
        "el harness la leerá de ahí; nunca la reescribe.",
    );
  }

  let datos: unknown;
  try {
    datos = JSON.parse(texto) as unknown;
  } catch {
    throw new CodexCredentialError(`El archivo de codex no es JSON: ${ruta}.`);
  }

  const modalidad = campo(datos, "auth_mode");
  if (modalidad === "apikey") {
    // Con una clave de API el archivo tiene `OPENAI_API_KEY` y no tokens. Se dice
    // en vez de fallar con un «no hay token» que no explica por qué.
    const clave = campo(datos, "OPENAI_API_KEY");
    if (typeof clave === "string" && clave !== "") {
      return { accessToken: clave, accountId: "" };
    }
  }

  const token = campo(datos, "tokens", "access_token");
  if (typeof token !== "string" || token === "") {
    throw new CodexCredentialError(
      `El archivo de codex (${ruta}) no tiene un token de sesión. ` +
        "Inicia sesión con su CLI.",
    );
  }

  const accountId = accountIdFromToken(token);
  if (accountId === null) {
    throw new CodexCredentialError(
      "El token de codex no declara la cuenta de ChatGPT a la que pertenece, y el " +
        "backend la pide en una cabecera. Vuelve a iniciar sesión con su CLI.",
    );
  }

  return { accessToken: token, accountId };
}
