/**
 * Registro del servidor MCP del harness en los agentes del proyecto.
 *
 * El problema que resuelve es concreto: el servidor MCP existe y funciona, pero
 * para que un agente lo use hay que declararlo en **su** archivo de
 * configuración, y ese archivo tiene otro formato por cada runtime. Copiar y
 * pegar JSON de la documentación es exactamente el paso manual que hace que una
 * herramienta no se use: se copia mal una vez, no aparece, y se concluye que no
 * funciona.
 *
 * Aquí la declaración se **calcula** y se **fusiona** con lo que ya haya. Dos
 * reglas gobiernan la fusión:
 *
 * 1. **No se pisa lo que ya estaba.** Un `opencode.json` puede tener servidores
 *    MCP de otras herramientas y claves que este código no conoce. Se añade la
 *    entrada y se conserva todo lo demás, byte a byte en lo que respecta al
 *    resto del archivo.
 * 2. **Es idempotente.** Aplicarlo dos veces deja el mismo archivo. Sin eso, un
 *    `--install` repetido acumularía entradas y el archivo se volvería ilegible
 *    justo cuando alguien lo abra para entender qué pasó.
 */
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** La entrada del servidor, ya resuelta para un runtime. */
export interface McpEntry {
  /** El ejecutable. */
  readonly command: string;
  /** Sus argumentos. */
  readonly args: readonly string[];
}

/**
 * La entrada que arranca el servidor.
 *
 * **Sin `--root`**, y es deliberado. La raíz la resuelve el servidor por su
 * directorio de trabajo, y los dos runtimes lo fijan al proyecto cuando lanzan
 * el proceso. Grabar aquí la raíz de un proyecto concreto haría que la misma
 * configuración dejara de valer en cualquier otro: en un archivo de proyecto
 * —`opencode.json`— sería una contradicción, y en uno global —el `config.toml`
 * de codex, que es único para todos los proyectos— sería directamente un error,
 * porque todas las sesiones escribirían en el registro del primer proyecto que
 * se registró.
 *
 * El `--root` sigue existiendo y sigue siendo la salida para el caso raro: un
 * agente que trabaja sobre un repositorio distinto del que está abierto.
 */
export function mcpEntry(executable: string): McpEntry {
  return { command: executable, args: [] };
}

/** El identificador con el que se declara el servidor en todos los runtimes. */
export const MCP_SERVER_ID = "valmen";

/**
 * El ejecutable del servidor MCP que corresponde al CLI que está corriendo.
 *
 * `valmen` y `valmen-mcp` se publican juntos, y la respuesta correcta depende de
 * **cómo se invocó** el CLI:
 *
 * - Si se invocó por su **nombre** —`valmen`, porque está instalado o enlazado en
 *   el `PATH`—, el servidor está en el mismo directorio y se devuelve
 *   `valmen-mcp`. Es el caso bueno: la configuración que se escriba no lleva
 *   ninguna ruta absoluta y sirve en cualquier máquina.
 * - Si se invocó por su **ruta** —el repositorio de desarrollo, donde no hay nada
 *   instalado—, se devuelve la ruta del paquete hermano. Sin esto, la
 *   configuración del repositorio apuntaría a un ejecutable inexistente.
 *
 * Por eso el argumento es la ruta de **invocación** (`process.argv[1]`) y no la
 * del módulo (`import.meta.url`): la segunda es siempre una ruta real y no dice
 * nada sobre cómo se llamó al proceso. Usar la del módulo hacía que una
 * instalación por enlace acabara escribiendo la ruta absoluta del repositorio,
 * que es exactamente lo que no funciona en otra máquina.
 */
export function mcpExecutableFrom(invocation: string): string {
  // Un enlace simbólico significa que el binario está instalado: el nombre es lo
  // correcto, porque es lo que se teclea y lo que el agente puede repetir.
  try {
    if (lstatSync(invocation).isSymbolicLink()) return "valmen-mcp";
  } catch {
    // No existe como archivo: se trata como ruta directa y se deduce abajo.
  }

  const carpetaCli = dirname(invocation);
  const paquete = dirname(carpetaCli);
  if (basename(paquete) !== "cli") return "valmen-mcp";
  return join(dirname(paquete), "mcp", "dist", basename(invocation));
}

/**
 * El directorio de trabajo que se declara.
 *
 * Es **relativo** —`"."`, el directorio del archivo de configuración— y no la
 * ruta absoluta del proyecto, por una razón práctica: un archivo versionado con
 * la ruta de una máquina no arranca en ninguna otra, y el síntoma es que las
 * herramientas «no existen», sin ningún error que lo explique. Como el archivo
 * vive en la raíz del proyecto, `"."` significa ahí exactamente lo mismo y sirve
 * para todos.
 *
 * El servidor resuelve su registro por el directorio de trabajo, así que esto es
 * lo que decide sobre qué proyecto escribe.
 */
export const RELATIVE_CWD = ".";

/**
 * La entrada tal como la espera `opencode`, en su archivo JSON.
 *
 * `type: "local"` es obligatorio y `enabled` se escribe explícito: un servidor
 * declarado y no habilitado es la forma más común de creer que está puesto
 * cuando no lo está.
 */
export function opencodeServer(entry: McpEntry): Record<string, unknown> {
  return {
    type: "local",
    command: [entry.command, ...entry.args],
    enabled: true,
    cwd: RELATIVE_CWD,
  };
}

/**
 * La entrada tal como la espera Claude Code en su `.mcp.json`.
 *
 * Es el mismo objeto plano que usa la mayoría de los clientes MCP —`command` y
 * `args`—, sin envoltorios: Claude Code lo lee del archivo de proyecto, que se
 * versiona, así que la entrada tiene que ser portable. Se escribe `cwd` relativo
 * por el mismo motivo que en opencode: una ruta absoluta en un archivo
 * compartido no arranca en la máquina de nadie más.
 */
export function claudeServer(entry: McpEntry): Record<string, unknown> {
  return {
    command: entry.command,
    args: [...entry.args],
    cwd: RELATIVE_CWD,
  };
}

/** El texto de la entrada TOML, como la espera `codex`. */
export function codexToml(entry: McpEntry): string {
  return [
    `[mcp_servers.${MCP_SERVER_ID}]`,
    `command = ${tomlString(entry.command)}`,
    `args = [${entry.args.map(tomlString).join(", ")}]`,
    `cwd = ${tomlString(RELATIVE_CWD)}`,
    "enabled = true",
  ].join("\n");
}

/** Una cadena TOML, escapada como TOML y no como JSON. */
function tomlString(valor: string): string {
  // TOML y JSON comparten el escape de comillas y barras invertidas, y una ruta
  // de Windows es el único caso que aparece en la práctica.
  return `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Lo que produce una fusión: el texto nuevo y si cambió algo. */
export interface MergeResult {
  readonly content: string;
  readonly changed: boolean;
  /** Qué se hizo, en una línea, para poder informarlo. */
  readonly note: string;
}

/**
 * Fusiona la entrada en un `opencode.json`.
 *
 * Si el archivo no existe se crea con lo mínimo. Si existe pero no es JSON
 * válido **no se toca**: sobrescribir un archivo que no se pudo leer es la forma
 * más rápida de borrar la configuración de otra persona, y un error de sintaxis
 * es algo que su dueño tiene que ver y arreglar.
 */
export function mergeOpencodeConfig(texto: string | null, entry: McpEntry): MergeResult {
  if (texto === null) {
    const nuevo = {
      $schema: "https://opencode.ai/config.json",
      mcp: { [MCP_SERVER_ID]: opencodeServer(entry) },
    };
    return {
      content: JSON.stringify(nuevo, null, 2) + "\n",
      changed: true,
      note: "se creó opencode.json con el servidor declarado",
    };
  }

  let documento: Record<string, unknown>;
  try {
    const analizado: unknown = JSON.parse(texto);
    if (typeof analizado !== "object" || analizado === null || Array.isArray(analizado)) {
      return {
        content: texto,
        changed: false,
        note: "opencode.json no es un objeto JSON; no se tocó",
      };
    }
    documento = analizado as Record<string, unknown>;
  } catch {
    return {
      content: texto,
      changed: false,
      note: "opencode.json no es JSON válido; no se tocó",
    };
  }

  const mcp = documento["mcp"];
  const seccion =
    typeof mcp === "object" && mcp !== null && !Array.isArray(mcp)
      ? (mcp as Record<string, unknown>)
      : {};

  const deseado = opencodeServer(entry);
  const actual = seccion[MCP_SERVER_ID];
  if (actual !== undefined && JSON.stringify(actual) === JSON.stringify(deseado)) {
    return {
      content: texto,
      changed: false,
      note: "opencode.json ya declaraba el servidor como está",
    };
  }

  documento["mcp"] = { ...seccion, [MCP_SERVER_ID]: deseado };
  return {
    content: JSON.stringify(documento, null, 2) + "\n",
    changed: true,
    note:
      actual === undefined
        ? "se añadió el servidor a opencode.json"
        : "se actualizó la entrada del servidor en opencode.json",
  };
}

/**
 * Fusiona la entrada en un `.mcp.json` de Claude Code.
 *
 * La forma es la de opencode —un objeto JSON con un mapa de servidores— pero la
 * clave es otra: `mcpServers` en vez de `mcp`. Se conserva todo lo que ya
 * estuviera declarado, y un archivo ilegible no se toca: es la configuración de
 * otra persona, y probablemente la de sus otros servidores.
 */
export function mergeClaudeConfig(texto: string | null, entry: McpEntry): MergeResult {
  if (texto === null) {
    const nuevo = { mcpServers: { [MCP_SERVER_ID]: claudeServer(entry) } };
    return {
      content: JSON.stringify(nuevo, null, 2) + "\n",
      changed: true,
      note: "se creó .mcp.json con el servidor declarado",
    };
  }

  let documento: Record<string, unknown>;
  try {
    const analizado: unknown = JSON.parse(texto);
    if (typeof analizado !== "object" || analizado === null || Array.isArray(analizado)) {
      return {
        content: texto,
        changed: false,
        note: ".mcp.json no es un objeto JSON; no se tocó",
      };
    }
    documento = analizado as Record<string, unknown>;
  } catch {
    return {
      content: texto,
      changed: false,
      note: ".mcp.json no es JSON válido; no se tocó",
    };
  }

  const servidores = documento["mcpServers"];
  const seccion =
    typeof servidores === "object" && servidores !== null && !Array.isArray(servidores)
      ? (servidores as Record<string, unknown>)
      : {};

  const deseado = claudeServer(entry);
  const actual = seccion[MCP_SERVER_ID];
  if (actual !== undefined && JSON.stringify(actual) === JSON.stringify(deseado)) {
    return {
      content: texto,
      changed: false,
      note: ".mcp.json ya declaraba el servidor como está",
    };
  }

  documento["mcpServers"] = { ...seccion, [MCP_SERVER_ID]: deseado };
  return {
    content: JSON.stringify(documento, null, 2) + "\n",
    changed: true,
    note:
      actual === undefined
        ? "se añadió el servidor a .mcp.json"
        : "se actualizó la entrada del servidor en .mcp.json",
  };
}

/**
 * Fusiona la entrada en un `config.toml` de codex.
 *
 * Es una fusión de texto y no un análisis de TOML a propósito: el archivo de
 * codex tiene decenas de secciones ajenas —marketplaces, plugins, ajustes— y
 * reescribirlo entero desde una estructura perdería comentarios y orden. Aquí
 * solo se añade un bloque al final si no estaba.
 */
export function mergeCodexConfig(texto: string | null, entry: McpEntry): MergeResult {
  const bloque = codexToml(entry);
  if (texto === null) {
    return {
      content: `${bloque}\n`,
      changed: true,
      note: "se creó el archivo con el servidor declarado",
    };
  }

  // La comprobación es por cabecera de sección: si ya existe, se deja como está
  // aunque su contenido difiera. Cambiar la configuración de otro runtime sin
  // que nadie lo pida es peor que informar de que ya hay una.
  if (new RegExp(`^\\[mcp_servers\\.${MCP_SERVER_ID}\\]`, "m").test(texto)) {
    return {
      content: texto,
      changed: false,
      note: `ya había una entrada [mcp_servers.${MCP_SERVER_ID}]; no se tocó`,
    };
  }

  const separador = texto.endsWith("\n") ? "" : "\n";
  return {
    content: `${texto}${separador}\n${bloque}\n`,
    changed: true,
    note: "se añadió el servidor al final del archivo",
  };
}

/** Lee un archivo de configuración, o `null` si no existe. */
export function readIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
