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
import { homedir } from "node:os";
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

// ─────────────────────────────────────────────────────────────────────────────
// Hermes
//
// Hermes es el único destino que **no** vive en el proyecto. Su configuración es
// `~/.hermes/config.yaml`, una sola para todos los proyectos de la máquina, y eso
// cambia las dos decisiones que el resto de este archivo resuelve igual para
// todos: dónde se declara el servidor y cómo se le dice cuál es la raíz.
//
// Las dos se responden con lo mismo: `cwd`. El servidor del harness resuelve su
// registro por el directorio de trabajo, y el de Hermes —que arranca desde donde
// viva la pasarela, no desde el proyecto— no lo tiene. Por eso aquí sí se graba
// una ruta absoluta, que es justo lo que `mcpEntry()` evita para los runtimes de
// proyecto: en un archivo global y no versionado, la ruta es la única forma de
// que el servidor sepa sobre qué proyecto escribe.
//
// La consecuencia hay que decirla: **un proyecto, una entrada**. Conectar dos
// proyectos a la misma instalación de Hermes son dos entradas con nombres
// distintos, y por eso el nombre es un parámetro y no una constante.
// ─────────────────────────────────────────────────────────────────────────────

/** El nombre con el que se declara el harness en Hermes por defecto. */
export const HERMES_SERVER_ID = "valmen";

/**
 * El home de Hermes.
 *
 * `HERMES_HOME` lo mueve, y respetarlo importa: hay instalaciones con el home en
 * otro sitio —el propio Hermes genera servicios por `HERMES_HOME`— y escribir en
 * `~/.hermes` cuando la instalación vive en otro lado deja archivos que nadie lee
 * y un diagnóstico que dice que todo está bien.
 */
export function hermesHome(home: string = homedir()): string {
  const propio = process.env["HERMES_HOME"];
  return propio !== undefined && propio.trim() !== "" ? propio : join(home, ".hermes");
}

/** El archivo de configuración de Hermes. */
export function hermesConfigPath(home: string = homedir()): string {
  return join(hermesHome(home), "config.yaml");
}

/** El directorio de skills de Hermes: el global del usuario, no el del proyecto. */
export function hermesSkillsDir(home: string = homedir()): string {
  return join(hermesHome(home), "skills");
}

/**
 * Un escalar YAML entre comillas dobles.
 *
 * Se cita **siempre** y no solo cuando hace falta: decidir cuándo un valor
 * necesita comillas es exactamente el tipo de regla que se implementa mal para el
 * caso raro —una ruta con dos puntos, un `#`, un espacio al final— y el síntoma
 * es un archivo que el otro programa rechaza al arrancar. Citar de más nunca
 * rompe; citar de menos, sí.
 */
function yamlEscalar(valor: string): string {
  return `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Lo que se declara en Hermes para un proyecto. */
export interface HermesEntry {
  readonly name: string;
  /** La raíz absoluta del proyecto. Es lo que el servidor usa como registro. */
  readonly root: string;
  readonly command: string;
  readonly credentialsFile?: string | undefined;
  /** `trust: untrusted`: Hermes pide permiso humano antes de cada escritura. */
  readonly untrusted: boolean;
  /**
   * Reciclar el proceso tras este tiempo sin llamadas.
   *
   * Sin esto, la pasarela de Hermes —que vive meses— deja un servidor del harness
   * colgado por cada entrada declarada. El servidor es barato, pero uno por
   * proyecto y para siempre no lo es, y el precio se paga en la máquina de quien
   * instaló esto para probarlo.
   */
  readonly idleTimeoutSeconds: number;
}

/** Cómo se arma la entrada de Hermes. */
export interface HermesEntryOptions {
  /** La raíz del proyecto que se declara. */
  readonly root: string;
  /** Cómo se invocó el CLI: de ahí sale el ejecutable del servidor. */
  readonly invocation: string;
  readonly name?: string | undefined;
  readonly credentialsFile?: string | undefined;
  readonly untrusted?: boolean | undefined;
  readonly idleTimeoutSeconds?: number | undefined;
}

/**
 * La entrada de Hermes, armada desde lo que el CLI ya sabe de sí mismo.
 *
 * Vive acá y no en el CLI porque la usan dos comandos —`valmen mcp`, que la
 * imprime, y `valmen hermes connect`, que la escribe— y dos construcciones de la
 * misma entrada se desincronizan: el que imprime diría una cosa y el que escribe
 * otra, y el que imprime es justo el que la persona copia a mano. Un solo
 * constructor hace que lo que se ve sea exactamente lo que se escribe.
 *
 * El ejecutable se deduce de la **invocación** y no de la ruta del módulo, por lo
 * mismo que en el resto del archivo: con un binario enlazado en el `PATH`, la
 * ruta del módulo es la del repositorio de desarrollo y quedaría grabada en la
 * configuración de una máquina.
 */
export function buildHermesEntry(opciones: HermesEntryOptions): HermesEntry {
  const base = mcpEntry(mcpExecutableFrom(opciones.invocation));
  return {
    name: opciones.name ?? HERMES_SERVER_ID,
    root: opciones.root,
    command: base.command,
    ...(opciones.credentialsFile === undefined
      ? {}
      : { credentialsFile: opciones.credentialsFile }),
    untrusted: opciones.untrusted ?? false,
    idleTimeoutSeconds: opciones.idleTimeoutSeconds ?? 900,
  };
}

/**
 * El bloque `valmen:` tal como va dentro de `mcp_servers:`.
 *
 * Devuelve solo el bloque indentado, sin la cabecera `mcp_servers:`, porque quien
 * lo inserta decide dónde: si la cabecera ya estaba, el bloque va debajo; si no
 * estaba, se añade con ella. Separar las dos cosas es lo que permite insertar sin
 * reescribir el archivo, que es la única forma de no perderle los comentarios a
 * una configuración que no es nuestra.
 */
export function hermesBlock(entry: HermesEntry): string {
  const lineas = [
    `  ${entry.name}:`,
    `    command: ${yamlEscalar(entry.command)}`,
    `    cwd: ${yamlEscalar(entry.root)}`,
    "    enabled: true",
    `    idle_timeout_seconds: ${entry.idleTimeoutSeconds}`,
  ];

  if (entry.credentialsFile !== undefined) {
    lineas.push(`    args: ["--credentials", ${yamlEscalar(entry.credentialsFile)}]`);
  }

  if (entry.untrusted) {
    lineas.push("    trust: untrusted");
  }

  return lineas.join("\n") + "\n";
}

/**
 * Fusiona el bloque en el `config.yaml` de Hermes.
 *
 * Es una fusión de **inserción**, no de reescritura, y la diferencia importa más
 * acá que en ningún otro archivo de este módulo: el `config.yaml` de Hermes lo
 * escribe una persona a mano —plataformas, modelos, rutas de proveedor— y tiene
 * comentarios que explican por qué cada cosa está como está. Reescribirlo desde
 * una estructura los perdería todos, y el usuario descubriría el daño la próxima
 * vez que abriera el archivo.
 *
 * Tres casos, y ninguno toca una línea que ya estaba:
 *
 * 1. **La entrada ya existe** → no se toca, aunque su contenido difiera. Es la
 *    misma regla que la fusión de codex: cambiar la configuración de otro
 *    programa sin que nadie lo pida es peor que informar de que ya hay una.
 * 2. **La cabecera `mcp_servers:` existe** → el bloque se inserta justo debajo.
 *    Vale porque YAML no depende del orden: las líneas indentadas que siguen a la
 *    cabecera son sus entradas, y una más en esa posición es una entrada más.
 * 3. **No existe** → se añade al final, con su cabecera.
 *
 * El cuarto caso es el que hay que rechazar en vez de adivinar: `mcp_servers: {}`
 * es un mapa vacío **en la misma línea**, y meter debajo un bloque indentado
 * produciría un archivo inválido. Ahí se devuelve `changed: false` con el motivo,
 * y la persona lo cambia a mano.
 */
export function mergeHermesConfig(
  texto: string | null,
  bloque: string,
  nombre: string = HERMES_SERVER_ID,
): MergeResult {
  return mergeHermesBlock(texto, bloque, {
    clave: "mcp_servers",
    // La indentación a dos espacios bajo cualquier cabecera es una entrada de
    // `mcp_servers`: no hay otra cosa que pueda estar a esa profundidad en la raíz
    // del archivo de Hermes.
    yaEsta: new RegExp(`^ {2}${nombre}:\\s*$`, "m"),
    queEs: "la entrada `" + nombre + "`",
    alInsertar: "se añadió el servidor a la lista mcp_servers que ya existía",
    alCrear: "se creó el archivo con el servidor declarado",
    alFinal: "se añadió mcp_servers al final del archivo, que no lo declaraba",
  });
}

/**
 * Fusiona un bloque de primer nivel en el `config.yaml` de Hermes.
 *
 * Es la misma inserción que la del servidor MCP, extraída porque el gancho del
 * relé necesita exactamente lo mismo sobre otra clave. Escribirla dos veces sería
 * dos sitios donde equivocarse con el YAML de otro programa —y el segundo se
 * olvidaría de uno de los tres casos—.
 */
export function mergeHermesBlock(
  texto: string | null,
  bloque: string,
  opciones: {
    readonly clave: string;
    readonly yaEsta: RegExp | null;
    readonly queEs: string;
    readonly alInsertar: string;
    readonly alCrear: string;
    readonly alFinal: string;
  },
): MergeResult {
  const { clave } = opciones;

  if (texto === null || texto.trim() === "") {
    return { content: `${clave}:\n${bloque}`, changed: true, note: opciones.alCrear };
  }

  if (opciones.yaEsta !== null && opciones.yaEsta.test(texto)) {
    return {
      content: texto,
      changed: false,
      note: `ya estaba ${opciones.queEs}; no se tocó`,
    };
  }

  const cabecera = new RegExp(`^${clave}:[ \\t]*$`, "m").exec(texto);
  if (cabecera !== null) {
    const corte = cabecera.index + cabecera[0].length;
    return {
      content: `${texto.slice(0, corte)}\n${bloque.trimEnd()}${texto.slice(corte)}`,
      changed: true,
      note: opciones.alInsertar,
    };
  }

  // La clave existe pero no como cabecera suelta: `clave: {}`, o con un valor en
  // la misma línea. Insertar debajo daría un YAML inválido, así que se dice en vez
  // de adivinar.
  if (new RegExp(`^${clave}:[ \\t]*\\S`, "m").test(texto)) {
    return {
      content: texto,
      changed: false,
      note:
        `\`${clave}\` no está vacío en una línea propia, así que no se insertó nada: ` +
        "añadilo a mano o dejá la clave sola y volvé a intentarlo",
    };
  }

  const separador = texto.endsWith("\n") ? "" : "\n";
  return {
    content: `${texto}${separador}\n${clave}:\n${bloque}`,
    changed: true,
    note: opciones.alFinal,
  };
}

/**
 * El enlace de un clic que ofrece la propia documentación de Hermes.
 *
 * `hermes://mcp/install?name=…&config=<base64url>` abre la app de escritorio con
 * la configuración precargada. No instala nada por sí solo —muestra un diálogo
 * con el comando completo y pide confirmación—, y por eso es una alternativa y no
 * el camino principal: sirve para quien prefiere ver antes de aceptar, y para
 * quien tiene la app abierta y no quiere volver a la terminal.
 *
 * El `cwd` viaja en el enlace igual que en el archivo. Sin él, la app declararía
 * un servidor que no sabe sobre qué proyecto escribe.
 */
export function hermesDeepLink(entry: HermesEntry): string {
  const config: Record<string, unknown> = {
    command: entry.command,
    cwd: entry.root,
  };
  if (entry.credentialsFile !== undefined) {
    config["args"] = ["--credentials", entry.credentialsFile];
  }
  if (entry.untrusted) config["trust"] = "untrusted";

  const base64 = Buffer.from(JSON.stringify(config), "utf8").toString("base64url");
  return `hermes://mcp/install?name=${encodeURIComponent(entry.name)}&config=${base64}`;
}

/** El comando de Hermes que declararía lo mismo, para quien prefiera su CLI. */
export function hermesAddCommand(entry: HermesEntry): string {
  const partes = ["hermes", "mcp", "add", entry.name, "--command", entry.command];
  if (entry.credentialsFile !== undefined) {
    // `--args` usa REMAINDER en el parser de Hermes: tiene que ir último.
    partes.push("--args", "--credentials", entry.credentialsFile);
  }
  return partes.join(" ");
}

/**
 * La skill que le enseña a Hermes cómo se trabaja con el harness.
 *
 * Va al directorio **global** de skills —`~/.hermes/skills/`— y no al del
 * proyecto, y la diferencia importa: las skills del proyecto describen cómo se
 * trabaja en ese proyecto —`desarrollo-backend`, `planificacion`— y se proyectan
 * a `.agents/skills/`; esta describe cómo se usa **el harness**, que es el mismo
 * en todos. Ponerla por proyecto la duplicaría en cada uno y las copias se
 * desincronizarían.
 *
 * Existe porque las herramientas solas no alcanzan. Un agente con el MCP
 * conectado ve treinta y cinco herramientas y no sabe cuál usar primero: la regla
 * de «antes de diagnosticar, buscar en la memoria» vive en el `AGENTS.md` del
 * proyecto, y **la sesión del celular no lee ese archivo**. Sin esto, lo que llega
 * por el celular es un agente con las capacidades del harness y ninguno de sus
 * criterios.
 *
 * El texto está escrito como instrucciones para un agente y no como código: no
 * nombra herramientas por su identificador prefixado —`mcp__valmen__…`, cuyo
 * separador las dos páginas de Hermes escriben distinto— sino que dice qué pedir.
 * Un nombre mal escrito sería una instrucción que el agente no puede seguir, y
 * fallaría en silencio.
 */
export const HERMES_SKILL_ID = "valmen";

/** El contenido de la skill, tal como se escribe en `SKILL.md`. */
export function hermesSkill(): string {
  return `---
name: ${HERMES_SKILL_ID}
description: Consultar y operar el registro de trabajo del harness ValmenHarness
version: 1.0.0
metadata:
  hermes:
    tags: [valmen, tickets, compuertas, registro]
    category: devops
---

# ValmenHarness desde el celular

El servidor MCP \`valmen\` da acceso al registro de trabajo de un proyecto: sus
tickets, sus compuertas, sus procesos y su memoria. Esta skill dice **cómo se usa**,
que no es lo mismo que qué se puede hacer.

## Cuándo usarla

Cuando la conversación trate sobre el trabajo de un proyecto que usa el harness:
qué hay pendiente, en qué va algo, qué se rompió, o cuando alguien pida registrar
algo. Si el servidor MCP \`valmen\` no está conectado, no hay nada que hacer y se
dice: no se inventan estados.

## Procedimiento

**1. Antes de nada, leé las reglas del proyecto.** Pedile al servidor MCP \`valmen\`
el prompt \`reglas-del-proyecto\`. Ahí están el flujo, los estados, los invariantes y
las convenciones que ese proyecto ya decidió. Trabajar sin eso es contestar con las
reglas de otro proyecto.

**2. Antes de diagnosticar, buscá en la memoria.** Usá \`buscar_memoria\` con el
módulo y el síntoma, en las palabras del dominio. El problema que te están
contando puede estar resuelto desde hace meses, con su causa raíz escrita. Si la
búsqueda devuelve algo, **citalo**: un diagnóstico que repite un error conocido se
explica mucho mejor diciendo cuál es y por qué volvió.

**3. Si alguien reporta un problema, creá el ticket — no lo arregles.** Usá
\`crear_ticket\` con la solicitud **literal** de quien la hizo: sus palabras, sin
resumir ni mejorar. Es lo que después se compara con la investigación, y una
solicitud embellecida hace que esa comparación no diga nada. El identificador no se
inventa: \`<TIPO>-<MÓDULO>-<DESC>-<YYYYMMDD>\`.

**4. Para saber en qué va algo**, \`listar_tickets\` con los filtros que hagan falta,
o \`reanudar_ticket\` para el contexto de uno en curso. Para el panorama de un
módulo entero, \`ver_features\`.

**5. Para seguir trabajando en algo**, \`reanudar_ticket\`. Sin identificador y con
más de un ticket activo **no elige**: devuelve la lista y hay que decidir cuál.

**6. Lo que aprendas, guardalo cuando lo aprendas.** \`guardar_aprendizaje\` con la
causa raíz, el porqué de una decisión o el patrón que se repite. No al final de la
conversación: lo que se escribe tres días después pierde el detalle que lo hacía
útil.

## Qué NO hacer

- **No apruebes ni rechaces una compuerta.** No existe herramienta para eso y no es
  un olvido: aprobar es una decisión de una persona. Se hace en la máquina, y el
  mensaje que llega al celular trae el código para las de riesgo bajo.
- **No escribas la confirmación de nadie.** \`cerrar_qa\`, \`anotar_retest\` y
  \`preparar_cierre\` piden las palabras literales de quien aprobó. Si no las tenés
  —porque no te las dieron, porque no contestaron, porque lo insinuaron—, pedilas.
  Escribirlas vos convierte una aprobación en un trámite.
- **No muevas un ticket a un estado que su máquina no permite.** \`mover_ticket\`
  aplica la tabla del contrato; un salto ilegal se rechaza con el motivo, y el
  motivo es la respuesta.
- **No inventes un estado ni un identificador.** Si algo no está en el registro, se
  dice que no está.
- **No trabajes sobre un proyecto que no declaró sus reglas.** Si el prompt
  \`reglas-del-proyecto\` no existe, el proyecto no está adoptado: decilo antes de
  tocar nada.

## Verificación

Después de crear un ticket, \`ver_ticket\` con su identificador tiene que devolverlo.
Después de moverlo, el estado que devuelve \`reanudar_ticket\` tiene que ser el que
pediste. Si no coincide, el movimiento no ocurrió, y decirlo es mejor que suponer
que sí.
`;
}

/** La ruta donde va la skill. */
export function hermesSkillPath(home: string = homedir()): string {
  return join(hermesSkillsDir(home), HERMES_SKILL_ID, "SKILL.md");
}
