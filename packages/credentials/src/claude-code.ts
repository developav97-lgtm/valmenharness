/**
 * La credencial de Claude Code.
 *
 * No es una clave: es el token OAuth de la suscripción, y vive donde su CLI lo
 * guarda, que **no es el mismo sitio en todos los sistemas**:
 *
 * | Sistema | Dónde |
 * |---|---|
 * | macOS | llavero, entrada `Claude Code-credentials` |
 * | Linux y Windows | `~/.claude/.credentials.json` |
 *
 * Eso se descubrió mirando una máquina real: el archivo no existía y el token sí,
 * en el llavero. Un lector que solo mirara el archivo habría dicho «Claude Code no
 * está autenticado» con la sesión perfectamente viva, y el usuario habría ido a
 * buscar el problema donde no estaba.
 *
 * Dos reglas heredadas de la credencial de codex, y por la misma razón:
 *
 * 1. **Se lee en cada llamada, no se cachea.** El `access_token` caduca, y el CLI
 *    lo renueva por su cuenta; una copia en memoria sobreviviría al refresco y
 *    empezaría a dar 401 sin que nada hubiera cambiado.
 * 2. **El token nunca se registra ni se incluye en un mensaje.** Se devuelve para
 *    usarlo como cabecera y nada más.
 *
 * Y una diferencia que sí importa: el token caducado **no se puede renovar desde
 * acá**. Renovarlo exigiría el `refresh_token`, y usarlo sería pelearse por él con
 * la herramienta que es su dueña —el CLI lo rota, y dos clientes renovando a la vez
 * invalidan la sesión del otro—. Cuando caduca se dice, con el comando que lo
 * arregla.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Error de credencial de Claude Code ausente, caducada o ilegible. */
export class ClaudeCodeCredentialError extends Error {
  readonly code = "CREDENTIAL_MISSING";

  constructor(message: string) {
    super(message);
    this.name = "ClaudeCodeCredentialError";
  }
}

/** El nombre de la entrada del llavero en macOS. */
export const CLAUDE_KEYCHAIN_SERVICE = "Claude Code-credentials";

/** Ruta del archivo de credenciales, donde Claude Code lo usa. */
export function claudeCodeCredentialsPath(home: string = homedir()): string {
  return join(home, ".claude", ".credentials.json");
}

/** Lo que hace falta para hablar con la suscripción. */
export interface ClaudeCodeCredential {
  /**
   * El token, que va como `Bearer` y con la cabecera `anthropic-beta`, o una
   * clave de API si el archivo trae una.
   */
  readonly accessToken: string;
  /**
   * De qué clase es, deducido del propio valor.
   *
   * Los tokens de suscripción empiezan con `sk-ant-oat` y las claves de API con
   * `sk-ant-api`. Se distinguen porque **la cabecera es distinta**: el token va en
   * `Authorization: Bearer`, la clave en `x-api-key`. Mandar uno donde va el otro
   * responde 401 «invalid x-api-key», que no dice nada del problema real.
   */
  readonly kind: "oauth" | "api-key";
  /** Cuándo caduca, en milisegundos, o `null` si no lo declara. */
  readonly expiresAt: number | null;
  /** De dónde se leyó: sirve para poder decirlo en un diagnóstico. */
  readonly source: "archivo" | "llavero";
  /** El plan, cuando el dato viene: `pro`, `max`… */
  readonly subscriptionType: string | null;
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

/** Un texto no vacío, o `null`. */
function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

/**
 * Lee la entrada del llavero de macOS.
 *
 * `security` viene con el sistema y no pide nada especial para leer una entrada
 * que creó el propio usuario; la primera vez puede pedir permiso, y eso es del
 * sistema, no del harness. Si no está o falla, se devuelve `null` y el error lo
 * explica el llamador con las dos ubicaciones a la vista.
 */
export function desdeLlavero(): string | null {
  if (process.platform !== "darwin") return null;
  try {
    const salida = execFileSync(
      "security",
      ["find-generic-password", "-s", CLAUDE_KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] },
    );
    return salida.trim() === "" ? null : salida;
  } catch {
    return null;
  }
}

/** El JSON de credenciales, de donde esté. */
function leerCrudo(
  home: string,
  leerLlavero: () => string | null,
): { crudo: string; source: "archivo" | "llavero" } | null {
  try {
    const delArchivo = readFileSync(claudeCodeCredentialsPath(home), "utf8");
    if (delArchivo.trim() !== "") return { crudo: delArchivo, source: "archivo" };
  } catch {
    // Sin archivo: puede ser macOS, y ahí el token vive en el llavero.
  }

  const delLlavero = leerLlavero();
  return delLlavero === null ? null : { crudo: delLlavero, source: "llavero" };
}

/**
 * La credencial de Claude Code, o un error que dice qué hacer.
 *
 * `ahora` y el lector del llavero son inyectables por la misma razón: una prueba
 * no puede depender del reloj ni de la sesión de la máquina que la corre. Sin eso,
 * el resultado de la suite cambiaría según quién esté autenticado en su llavero.
 */
export function readClaudeCodeCredential(
  home: string = homedir(),
  ahora: number = Date.now(),
  leerLlavero: () => string | null = desdeLlavero,
): ClaudeCodeCredential {
  const leido = leerCrudo(home, leerLlavero);
  if (leido === null) {
    throw new ClaudeCodeCredentialError(
      "No se encontró la sesión de Claude Code. En macOS vive en el llavero " +
        `(entrada «${CLAUDE_KEYCHAIN_SERVICE}») y en Linux en ` +
        `\`${claudeCodeCredentialsPath(home)}\`. Ejecutá \`claude\` una vez, ` +
        "autenticate, y volvé a intentar.",
    );
  }

  let datos: unknown;
  try {
    datos = JSON.parse(leido.crudo) as unknown;
  } catch {
    throw new ClaudeCodeCredentialError(
      `Las credenciales de Claude Code no son JSON válido (${leido.source}). ` +
        "Ejecutá `claude` y autenticate de nuevo.",
    );
  }

  const oauth = campo(datos, "claudeAiOauth");
  const token = texto(campo(oauth, "accessToken")) ?? texto(campo(datos, "primaryApiKey"));
  if (token === null) {
    throw new ClaudeCodeCredentialError(
      "Las credenciales de Claude Code están, pero sin token. Ejecutá `claude` y " +
        "autenticate de nuevo.",
    );
  }

  const expira = campo(oauth, "expiresAt");
  const expiresAt = typeof expira === "number" && Number.isFinite(expira) ? expira : null;
  const esOauth = token.startsWith("sk-ant-oat");

  // El token de suscripción caduca en horas y **solo su CLI lo renueva**. Decirlo
  // acá, con el comando que lo arregla, evita el 401 del proveedor, que habla de
  // una clave inválida y manda a buscar el problema al sitio equivocado.
  if (esOauth && expiresAt !== null && expiresAt <= ahora) {
    const cuando = new Date(expiresAt).toISOString().slice(0, 16).replace("T", " ");
    throw new ClaudeCodeCredentialError(
      `La sesión de Claude Code caducó el ${cuando} (UTC). El harness no la renueva ` +
        "—el `refresh_token` es de su CLI y dos clientes renovando a la vez rompen la " +
        "sesión—. Ejecutá `claude` una vez y volvé a intentar.",
    );
  }

  return {
    accessToken: token,
    kind: esOauth ? "oauth" : "api-key",
    expiresAt,
    source: leido.source,
    subscriptionType: texto(campo(oauth, "subscriptionType")),
  };
}

/** `true` si hay una credencial legible, para un diagnóstico que no lance. */
export function hayCredencialDeClaudeCode(
  home: string = homedir(),
  leerLlavero: () => string | null = desdeLlavero,
): boolean {
  try {
    readClaudeCodeCredential(home, Date.now(), leerLlavero);
    return true;
  } catch {
    return false;
  }
}
