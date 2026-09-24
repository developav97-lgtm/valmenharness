/**
 * El comando `mcp`: deja el harness al alcance de un agente.
 *
 * Existe porque el servidor MCP, por sí solo, no sirve de nada. Para que un
 * agente lo use hay que **declararlo en su archivo de configuración**, y ahí es
 * donde este trabajo se pierde: son formatos distintos por runtime, hay que
 * acertar con la ruta del ejecutable, y el resultado de equivocarse es que las
 * herramientas simplemente no aparecen, sin ningún error que explique por qué.
 *
 * Por eso el comando tiene dos mitades:
 *
 * - **Sin argumentos muestra.** El fragmento exacto de cada runtime y el estado
 *   del registro del proyecto, para poder pegarlo a mano si se prefiere.
 * - **Con `--install` escribe.** Las entradas **de proyecto** —`opencode.json` y
 *   `.mcp.json` de Claude Code— se fusionan conservando lo que ya hubiera, porque
 *   un proyecto tiene otros servidores MCP y pisarlos sería un destrozo
 *   silencioso.
 *
 * Lo **global** no se escribe solo, y son dos casos distintos:
 *
 * - **codex** vive en `~/.codex/config.toml`, y se añade con `--global`.
 * - **DSH** vive en el perfil (`~/.dsh/profiles/<perfil>/cordis.patch.yml`) y
 *   además necesita el paquete `@deepseek-ai/dsh-mcp-client` instalado en ese
 *   perfil. Eso no es un archivo que se fusiona: es una dependencia que hay que
 *   añadir e instalar, así que se imprime el fragmento con los pasos exactos en
 *   vez de tocar el entorno de la persona a medias.
 *
 * La raíz del proyecto no se graba en ninguna de las entradas: sale del
 * directorio de trabajo de cada sesión, así que la misma declaración sirve para
 * todos los proyectos. Un archivo con la ruta de una máquina no arranca en
 * ninguna otra, y el síntoma —«las herramientas no existen»— no explica nada.
 */
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  type McpEntry,
  MCP_SERVER_ID,
  buildHermesEntry,
  claudeServer,
  codexToml,
  hermesAddCommand,
  hermesBlock,
  hermesConfigPath,
  hermesDeepLink,
  mergeClaudeConfig,
  mergeCodexConfig,
  mergeOpencodeConfig,
  mcpEntry,
  mcpExecutableFrom,
  opencodeServer,
  readIfExists,
} from "@valmen/adapter";

import type { CommandResult } from "./commands.js";

/** Lo que se descubrió del entorno. */
export interface McpRequest {
  readonly root: string;
  /** El ejecutable del CLI, para deducir el del servidor MCP. */
  readonly cliEntry: string;
  readonly install: boolean;
  readonly global: boolean;
  readonly json: boolean;
}

function ok(stdout: string): CommandResult {
  return { stdout, stderr: "", exitCode: 0 };
}

/** El archivo de configuración de opencode en el proyecto. */
export function opencodeConfigPath(root: string): string {
  return join(root, "opencode.json");
}

/** El archivo de configuración de codex. Es global, no del proyecto. */
export function codexConfigPath(home: string = homedir()): string {
  return join(home, ".codex", "config.toml");
}

/**
 * El archivo de Claude Code en el proyecto: `.mcp.json`.
 *
 * Es el alcance «project» de Claude Code y el único que se versiona: los otros
 * dos —`local` y `user`— viven en `~/.claude.json`, que es de la persona y no
 * del proyecto. Registrar ahí el servidor de un proyecto concreto lo dejaría
 * disponible en todos, que es exactamente el error que este comando existe para
 * evitar.
 */
export function claudeConfigPath(root: string): string {
  return join(root, ".mcp.json");
}

/**
 * El perfil de DSH, donde se declaran los servidores MCP.
 *
 * DSH compone su configuración por capas: los paquetes base, después
 * `cordis.patch.yml`. El servidor MCP del harness se declara ahí, y el paquete
 * `@deepseek-ai/dsh-mcp-client` tiene que estar instalado en el perfil —no viene
 * con el harness—, así que el fragmento se imprime con ese paso escrito.
 */
export function dshProfilePath(home: string = homedir()): string {
  return join(home, ".dsh", "profiles", "web", "cordis.patch.yml");
}

/**
 * El fragmento que declara el servidor en el perfil de DSH.
 *
 * La forma es la de una lista de inserción de la capa de parches de DSH
 * (`- insert:` con las entradas debajo), que es como se compone su árbol de
 * plugins. No se escribe `cwd`: el servidor hereda el directorio desde el que se
 * lanzó DSH, que es el espacio de trabajo de la sesión, y ahí es donde el
 * harness busca su registro. Fijarlo a un proyecto concreto en un archivo de
 * perfil haría que todas las sesiones escribieran en ese registro.
 */
export function dshSnippet(entry: McpEntry): string {
  return [
    "- insert:",
    "    - id: mcp-valmen",
    "      name: '@deepseek-ai/dsh-mcp-client'",
    "      config:",
    "        serverName: valmen",
    "        transport: stdio",
    `        command: ${entry.command}`,
    `        args: [${entry.args.map((arg) => `'${arg}'`).join(", ")}]`,
  ].join("\n");
}

/** La entrada del servidor para este proyecto. */
export function entryFor(request: McpRequest): McpEntry {
  return mcpEntry(mcpExecutableFrom(request.cliEntry));
}

/** El fragmento de opencode, tal como queda en el archivo. */
function opencodeSnippet(entry: McpEntry): string {
  return JSON.stringify({ mcp: { valmen: opencodeServer(entry) } }, null, 2);
}

/**
 * Ejecuta el comando.
 *
 * La salida es deliberadamente explícita sobre **dónde** queda cada cosa: la
 * diferencia entre una configuración de proyecto y una global es justo lo que
 * hace que un servidor "no aparezca" en la sesión de otra carpeta.
 */
export function mcpCommand(request: McpRequest): CommandResult {
  const entry = entryFor(request);
  const rutaOpencode = opencodeConfigPath(request.root);
  const rutaClaude = claudeConfigPath(request.root);
  const rutaCodex = codexConfigPath();
  const rutaDsh = dshProfilePath();

  const lineas: string[] = [
    "Servidor MCP del harness",
    `  ejecutable   ${entry.command}`,
    // Sin argumentos no se imprime una línea vacía: la ausencia de `--root` es
    // una decisión —la raíz sale del directorio de trabajo— y se explica más
    // abajo, no con un hueco que parece un dato que falta.
    ...(entry.args.length === 0 ? [] : [`  argumentos   ${entry.args.join(" ")}`]),
    "",
    `  registro     ${request.root}`,
    "",
  ];

  if (request.json) {
    const opencode = mergeOpencodeConfig(readIfExists(rutaOpencode), entry);
    return ok(
      JSON.stringify(
        {
          executable: entry.command,
          args: entry.args,
          opencode: { path: rutaOpencode, content: opencode.content },
          claude: {
            path: rutaClaude,
            content: mergeClaudeConfig(readIfExists(rutaClaude), entry).content,
          },
          codex: { path: rutaCodex, snippet: codexToml(entry) },
          dsh: { path: rutaDsh, snippet: dshSnippet(entry) },
        },
        null,
        2,
      ) + "\n",
    );
  }

  // ---- opencode: configuración del proyecto ----
  lineas.push("opencode — configuración del proyecto", `  archivo      ${rutaOpencode}`);

  if (!request.install) {
    lineas.push(
      "",
      indent(opencodeSnippet(entry)),
      "",
      "  Aplícalo con `valmen mcp --install`, que además conserva los servidores",
      "  MCP que ya estuvieran declarados.",
    );
  } else {
    const fusion = mergeOpencodeConfig(readIfExists(rutaOpencode), entry);
    if (fusion.changed) {
      writeFileSync(rutaOpencode, fusion.content, "utf8");
      lineas.push(`  ${fusion.note}`);
    } else {
      lineas.push(`  sin cambios: ${fusion.note}`);
    }
  }

  lineas.push("");

  // ---- Claude Code: configuración del proyecto ----
  lineas.push(
    "Claude Code — configuración del proyecto",
    `  archivo      ${rutaClaude}`,
    "  Es el alcance «project» de Claude Code y el único que se versiona; los",
    "  otros dos viven en ~/.claude.json, que es de la persona y no del proyecto.",
  );

  if (!request.install) {
    lineas.push(
      "",
      indent(
        JSON.stringify({ mcpServers: { [MCP_SERVER_ID]: claudeServer(entry) } }, null, 2),
      ),
      "",
      "  Aplícalo con `valmen mcp --install`, que además conserva los servidores",
      "  MCP que ya estuvieran declarados.",
    );
  } else {
    const fusion = mergeClaudeConfig(readIfExists(rutaClaude), entry);
    if (fusion.changed) {
      writeFileSync(rutaClaude, fusion.content, "utf8");
      lineas.push(`  ${fusion.note}`);
    } else {
      lineas.push(`  sin cambios: ${fusion.note}`);
    }
  }

  lineas.push("");

  // ---- codex: configuración global ----
  lineas.push(
    "codex — configuración global",
    `  archivo      ${rutaCodex}`,
    "  Es global: una sola entrada sirve para todos los proyectos. La raíz sale",
    "  del directorio de trabajo de cada sesión, así que declarar aquí la de un",
    "  proyecto concreto haría que todos escribieran en su registro.",
  );

  if (!request.global) {
    lineas.push(
      "",
      indent(codexToml(entry)),
      "",
      "  Añádelo a ese archivo, o vuelve a ejecutar con `--global` para que se",
      "  añada al final. Es tu configuración de usuario: no se toca sin pedirlo.",
    );
  } else {
    const fusion = mergeCodexConfig(readIfExists(rutaCodex), entry);
    if (fusion.changed) {
      writeFileSync(rutaCodex, fusion.content, "utf8");
      lineas.push(`  ${fusion.note}`);
    } else {
      lineas.push(`  sin cambios: ${fusion.note}`);
    }
  }

  lineas.push("");

  // ---- DSH: configuración del perfil ----
  lineas.push(
    "DSH — configuración del perfil",
    `  archivo      ${rutaDsh}`,
    "  Es global y no es solo un archivo: DSH compone su árbol de plugins por",
    "  capas y el puente MCP es un paquete que hay que tener instalado en el",
    "  perfil. Por eso se imprime en vez de escribirse.",
    "",
    indent(dshSnippet(entry)),
    "",
    "  Los dos pasos, en orden:",
    `    dsh plugin --profile web add @deepseek-ai/dsh-mcp-client`,
    `    y añadir el bloque de arriba a ${rutaDsh}`,
    "",
    "  El puente de DSH publica **herramientas**, no prompts: las herramientas del",
    "  harness aparecen como `mcp__valmen__<nombre>`, y los prompts del harness no",
    "  están ahí (siguen disponibles por el CLI).",
  );

  lineas.push("");
  lineas.push(...hermesSnippet(request));

  lineas.push(
    "",
    "Comprueba que el servidor arranca antes de culpar al agente:",
    `  ${[entry.command, ...entry.args, "--check"].join(" ")}`,
    "",
    "Y recuerda que ninguna de estas puertas hace falta para trabajar: el CLI",
    "—`valmen …`— funciona en cualquier agente que tenga una shell, incluidos",
    "todos los de arriba. El MCP es la puerta cómoda, no la única.",
    "",
  );

  return ok(lineas.join("\n"));
}

/** Indenta un bloque, para que se lea como parte de la salida. */
function indent(texto: string): string {
  return texto
    .split("\n")
    .map((linea) => `    ${linea}`)
    .join("\n");
}

/**
 * La sección de Hermes.
 *
 * Se **imprime** y no se escribe, aunque Hermes sea un destino más. La razón es
 * que su configuración no es del proyecto: es `~/.hermes/config.yaml`, una sola
 * para todos, y escribirla desde `valmen mcp --install` haría que instalar el
 * servidor en un proyecto tocara la configuración global de la máquina. Eso es
 * una decisión aparte, con su propio comando —`valmen hermes connect`—, que
 * además dice qué escribió y dónde.
 *
 * Lo que sí se imprime entero es el bloque, para quien prefiera pegarlo, y el
 * comando de su CLI para quien prefiera su asistente.
 */
function hermesSnippet(request: McpRequest): readonly string[] {
  const entry = buildHermesEntry({
    root: request.root,
    invocation: request.cliEntry,
  });
  return [
    "Hermes — configuración global del usuario",
    `  archivo      ${hermesConfigPath()}`,
    "  No vive en el proyecto: una sola config para todos, y por eso la entrada",
    "  lleva la raíz de este proyecto. Conectar un segundo proyecto son dos",
    "  entradas con nombres distintos.",
    "",
    indent(hermesBlock(entry).trimEnd()),
    "",
    "  Se escribe con:",
    "    valmen hermes connect",
    "",
    "  O con el asistente de Hermes, que además deja elegir qué herramientas ve:",
    `    ${hermesAddCommand(entry)}`,
    "",
    "  Y si tienes la app de escritorio abierta, el enlace de un clic:",
    `    ${hermesDeepLink(entry)}`,
  ];
}
