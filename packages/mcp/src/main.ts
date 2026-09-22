#!/usr/bin/env node
/**
 * El arranque del servidor MCP: `valmen-mcp`.
 *
 * Lleva shebang porque lo que se publica es un ejecutable: un cliente MCP lanza
 * un proceso, y sin ella el archivo solo se puede lanzar con `node main.js`.
 * TypeScript lo elimina al compilar salvo que se le pida conservarlo.
 *
 * Un servidor MCP no se ejecuta a mano. Lo arranca el agente —opencode, codex,
 * Claude Code— como un proceso hijo y habla con él por stdin y stdout. Eso
 * impone dos cosas que este archivo resuelve y que son la causa habitual de que
 * un servidor MCP "no aparezca":
 *
 * 1. **Nada más puede escribir en stdout.** El protocolo es una línea de JSON
 *    por mensaje, así que un `console.log` perdido, un aviso de dependencia o
 *    un `deprecation warning` de Node rompen la sesión de forma difícil de
 *    diagnosticar. Aquí no se escribe en stdout en ningún camino: los
 *    diagnósticos van a stderr, que el cliente sí muestra.
 * 2. **La raíz del proyecto hay que decidirla.** El agente lanza el proceso con
 *    el directorio de trabajo del proyecto, pero eso no siempre es así, y un
 *    servidor que adivina mal escribe el registro en el sitio equivocado. Se
 *    acepta `--root`, y sin él se usa el directorio de trabajo. Además cada
 *    herramienta admite `root` en sus argumentos, que gana sobre los dos.
 */
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type RegistryPaths, choosePaths } from "@valmen/engine";

import { serveStdio } from "./protocol.js";
import { TOOLS, callTool, type ToolContext } from "./tools.js";

/** El nombre con el que se declara el servidor. */
export const SERVER_NAME = "valmen";

/** La versión que se anuncia en `initialize`. */
export const SERVER_VERSION = "0.0.1";

/** Lo que se leyó de la línea de comandos. */
export interface Options {
  readonly root: string;
  readonly credentialsFile: string | undefined;
  readonly check: boolean;
}

/**
 * El archivo de credenciales del proyecto, si existe.
 *
 * Se prefiere el del proyecto —`.valmen/.credentials.yaml`— sobre el del
 * `$HOME`, porque es el que el proyecto declaró. No se falla si no existe: la
 * evaluación de compuertas resuelve por variable de entorno y, si tampoco hay,
 * el error que devuelve el evaluador es el correcto y dice qué falta.
 */
export function credentialsFor(root: string): string | undefined {
  const propio = join(root, ".valmen", ".credentials.yaml");
  if (existsSync(propio)) return propio;
  const casa = join(homedir(), ".valmen", ".credentials.yaml");
  return existsSync(casa) ? casa : undefined;
}

/** Interpreta los argumentos del proceso. */
export function parseOptions(argv: readonly string[], cwd: string): Options {
  let root = cwd;
  let credentialsFile: string | undefined;
  let check = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") {
      const valor = argv[i + 1];
      if (valor === undefined) throw new Error("`--root` necesita un valor.");
      root = resolve(cwd, valor);
      i += 1;
    } else if (arg === "--credentials") {
      const valor = argv[i + 1];
      if (valor === undefined) throw new Error("`--credentials` necesita un valor.");
      credentialsFile = resolve(cwd, valor);
      i += 1;
    } else if (arg === "--check") {
      check = true;
    } else if (arg === "--help" || arg === "-h") {
      check = true;
    }
  }

  return { root, credentialsFile, check };
}

/** Las rutas del registro para una raíz. */
export function pathsFor(root: string): RegistryPaths {
  return choosePaths(root);
}

/**
 * La autocomprobación.
 *
 * Existe porque el primer fallo de un servidor MCP es que el cliente no lo
 * encuentra o no lo puede arrancar, y desde dentro del agente eso se ve como
 * "la herramienta no existe". `valmen-mcp --check` responde sin hablar el
 * protocolo: dice qué raíz va a usar, cuántos tickets ve y qué herramientas
 * expone, para que ese diagnóstico se pueda hacer desde una terminal cuando
 * algo no aparece.
 */
export function describe(options: Options): string {
  const paths = pathsFor(options.root);
  const credenciales = options.credentialsFile ?? credentialsFor(options.root);
  return [
    `servidor:    ${SERVER_NAME} ${SERVER_VERSION}`,
    `raíz:        ${paths.root}`,
    `registro:    ${paths.ticketsDir}`,
    `credenciales: ${credenciales ?? "(ninguna: se resolverá por variable de entorno)"}`,
    `herramientas: ${TOOLS.length}`,
    ...TOOLS.map((tool) => `  - ${tool.name}: ${tool.title}`),
  ].join("\n");
}

/** Arranca el servidor sobre stdin y stdout. */
export async function main(
  argv: readonly string[] = process.argv.slice(2),
  cwd: string = process.cwd(),
): Promise<number> {
  let options: Options;
  try {
    options = parseOptions(argv, cwd);
  } catch (caught) {
    process.stderr.write(`${caught instanceof Error ? caught.message : String(caught)}\n`);
    return 2;
  }

  if (options.check) {
    process.stdout.write(describe(options) + "\n");
    return 0;
  }

  const contexto: ToolContext = {
    paths: pathsFor(options.root),
    credentialsFile: options.credentialsFile ?? credentialsFor(options.root),
  };

  await serveStdio({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    tools: TOOLS,
    call: (nombre, args) =>
      callTool(
        contextoConRoot(contexto, args, options.credentialsFile !== undefined),
        nombre,
        args,
      ),
  });
  return 0;
}

/**
 * Aplica el `root` que venga en los argumentos de la herramienta.
 *
 * El agente puede trabajar sobre un proyecto distinto del que arrancó el
 * servidor —una sesión que abre dos repositorios— y en ese caso la raíz del
 * argumento es la única información correcta. Se acepta a propósito y no se
 * ignora en silencio, que sería lo peor: el ticket se escribiría en el registro
 * equivocado y el agente creería haber hecho su trabajo.
 *
 * Las credenciales se vuelven a resolver contra la raíz nueva. Reusar las del
 * proyecto original sería peor que no tener ninguna: se evaluaría el gate Contra
 * el archivo de otro proyecto y el recibo registraría una decisión tomada con
 * una clave que ese proyecto no declaró. Solo se respeta la ruta si vino
 * **explícita** por `--credentials`, porque entonces es una decisión tomada a
 * propósito por quien arrancó el servidor.
 */
function contextoConRoot(
  contexto: ToolContext,
  args: Record<string, unknown>,
  credencialesExplicitas: boolean,
): ToolContext {
  const root = args["root"];
  if (typeof root !== "string" || root.trim() === "") return contexto;
  const absoluta = resolve(root.trim());
  return {
    paths: pathsFor(absoluta),
    credentialsFile: credencialesExplicitas
      ? contexto.credentialsFile
      : credentialsFor(absoluta),
  };
}

/**
 * `true` si este módulo es el programa principal.
 *
 * Importar `main.ts` para probar `parseOptions` no debe arrancar el servidor:
 * sin esta guarda, un test que solo quiere analizar argumentos se queda
 * escuchando en stdin y no termina nunca.
 *
 * La comparación se hace sobre rutas **reales** y no sobre el texto, porque
 * cuando el ejecutable se alcanza por un enlace simbólico —que es exactamente
 * como se instala un binario en el `PATH`— `import.meta.url` trae la ruta
 * resuelta y `process.argv[1]` la del enlace. Compararlas en crudo da `false`, y
 * el síntoma es de los peores: el proceso termina con éxito sin hacer nada.
 */
function isMainModule(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  void main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      // A stderr, nunca a stdout: stdout es el canal del protocolo y una línea
      // suelta ahí dentro rompe la sesión del agente de una forma que después
      // nadie sabe explicar.
      process.stderr.write(`Error inesperado: ${String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
