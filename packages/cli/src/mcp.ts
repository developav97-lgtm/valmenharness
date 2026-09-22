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
 * - **Con `--install` escribe.** La entrada del proyecto —`opencode.json`— se
 *   fusiona conservando lo que ya hubiera, porque un proyecto tiene otros
 *   servidores MCP y pisarlos sería un destrozo silencioso.
 *
 * La configuración de codex es **global** —vive en `~/.codex/config.toml`— y por
 * eso no se escribe sola: modificar el entorno de todos los proyectos de una
 * persona es una decisión suya. Se imprime la sección para pegar, y el `--root`
 * que lleva dentro es lo que hace que cada sesión hable de su proyecto.
 */
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  type McpEntry,
  codexToml,
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
  const rutaCodex = codexConfigPath();

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
          codex: { path: rutaCodex, snippet: codexToml(entry) },
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

  lineas.push(
    "",
    "Comprueba que el servidor arranca antes de culpar al agente:",
    `  ${entry.command} ${entry.args.join(" ")} --check`,
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
