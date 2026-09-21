/**
 * Punto de entrada del CLI `valmen`.
 *
 * El análisis de argumentos es propio y deliberadamente pequeño: el camino
 * crítico del harness no debe depender de un framework de CLI. Cada comando
 * devuelve un `CommandResult` en vez de escribir directamente, lo que hace que
 * todos los comandos sean testeables sin capturar la salida del proceso.
 */
import { resolve } from "node:path";

import { EXIT_SCHEMA, TicketError, toFailure } from "@valmen/core";

import {
  type CommandResult,
  buildIndex,
  listActive,
  showTicket,
  validateAll,
  validateOne,
} from "./commands.js";
import { type RegistryPaths, defaultPaths, legacyPaths } from "./discovery.js";

const USAGE = `valmen — harness agéntico

Uso: valmen <comando> [opciones]

Comandos:
  validate --all            Valida todos los tickets del registro.
  validate --id <ID>        Valida un ticket concreto.
  list                      Lista los tickets no cerrados.
  show <ID>                 Muestra el resumen de un ticket.
  index [--check]           Regenera el índice, o comprueba que esté al día.

Opciones globales:
  --root <ruta>             Raíz del proyecto (por defecto: el directorio actual).
  --tickets <ruta>          Directorio del registro, relativo a la raíz.
  --legacy-layout           Usa docs/tickets/ en vez de tickets/.
  -h, --help                Muestra esta ayuda.
  --version                 Muestra la versión.

Códigos de salida:
  0  éxito
  2  entrada inválida
  3  invariante de estado violada
  4  incoherencia del registro histórico
  5  referencia de artefacto inválida
  6  sujeto no identificable sin ambigüedad
`;

/** Opciones ya analizadas de la línea de comandos. */
interface Options {
  readonly root: string;
  readonly ticketsDir?: string;
  readonly legacyLayout: boolean;
  readonly help: boolean;
  readonly version: boolean;
  /** Palabras sueltas que no son opciones: el comando y sus argumentos. */
  readonly positionals: string[];
  /** Banderas y opciones reconocidas, normalizadas sin los guiones. */
  readonly flags: Readonly<Record<string, string | true>>;
}

/** Opciones que consumen un valor. */
const VALUE_OPTIONS = ["--root", "--tickets", "--id"] as const;

/** Error de uso: se reporta con el código de esquema, como el CLI de referencia. */
class UsageError extends Error {}

/**
 * Analiza los argumentos.
 *
 * Se admiten las dos formas de declarar una opción: `--clave valor` y
 * `--clave=valor`. Un valor que empieza por `--` se rechaza como valor para no
 * tragarse la opción siguiente por error.
 */
export function parseArgs(argv: readonly string[]): Options {
  const valueOptions = new Set<string>(VALUE_OPTIONS);

  let root = process.cwd();
  let ticketsDir: string | undefined;
  let legacyLayout = false;
  let help = false;
  let version = false;
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;

    if (arg === "-h" || arg === "--help") {
      help = true;
      continue;
    }

    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }

    const equals = arg.indexOf("=");
    const name = equals === -1 ? arg : arg.slice(0, equals);
    let inlineValue: string | undefined =
      equals === -1 ? undefined : arg.slice(equals + 1);

    // Opciones que consumen un valor: `--root X` o `--root=X`.
    if (valueOptions.has(name)) {
      if (inlineValue === undefined) {
        const next = argv[index + 1];
        if (next === undefined || next.startsWith("--")) {
          throw new UsageError(`La opción ${name} requiere un valor.`);
        }
        index += 1;
        inlineValue = next;
      }
      if (name === "--root") root = inlineValue;
      else if (name === "--tickets") ticketsDir = inlineValue;
      else flags[name.slice(2)] = inlineValue;
      continue;
    }

    if (equals !== -1) {
      throw new UsageError(`La opción ${name} no admite un valor.`);
    }
    if (name === "--legacy-layout") {
      legacyLayout = true;
      continue;
    }
    if (name === "--version") {
      version = true;
      continue;
    }

    // Bandera booleana de comando: `--all`, `--check`, …
    flags[name.slice(2)] = true;
  }

  return {
    root: resolve(root),
    ...(ticketsDir === undefined ? {} : { ticketsDir }),
    legacyLayout,
    help,
    version,
    positionals,
    flags,
  };
}

/** Resuelve las rutas del registro a partir de las opciones. */
export function resolvePaths(options: Options): RegistryPaths {
  const base = options.legacyLayout
    ? legacyPaths(options.root)
    : defaultPaths(options.root);
  return options.ticketsDir === undefined
    ? base
    : { root: options.root, ticketsDir: options.ticketsDir };
}

/**
 * Despacha un comando ya analizado.
 *
 * Se exporta para poder probar cada comando sin pasar por el proceso.
 */
export function dispatch(options: Options): CommandResult {
  const [command, ...rest] = options.positionals;

  if (options.version) return { stdout: "0.0.1\n", stderr: "", exitCode: 0 };
  if (options.help || command === undefined) {
    return {
      stdout: USAGE,
      stderr: "",
      exitCode: command === undefined && !options.help ? EXIT_SCHEMA : 0,
    };
  }

  const paths = resolvePaths(options);

  switch (command) {
    case "validate": {
      const all = options.flags["all"] === true;
      const rawId = options.flags["id"];
      const id = typeof rawId === "string" ? rawId : undefined;

      if (all && id !== undefined) {
        return {
          stdout: "",
          stderr: "validate admite --id o --all, no ambos.",
          exitCode: EXIT_SCHEMA,
        };
      }
      if (all) return validateAll(paths);
      if (id !== undefined) return validateOne(paths, id);
      return {
        stdout: "",
        stderr: "validate requiere --id o --all.",
        exitCode: EXIT_SCHEMA,
      };
    }

    case "list":
      return listActive(paths);

    case "show": {
      const id = rest[0];
      if (id === undefined) {
        return {
          stdout: "",
          stderr: "show requiere un ID.",
          exitCode: EXIT_SCHEMA,
        };
      }
      return showTicket(paths, id);
    }

    case "index":
      return buildIndex(paths, options.flags["check"] === true);

    default:
      return {
        stdout: "",
        stderr: `Comando desconocido: ${command}. Use --help para ver los disponibles.`,
        exitCode: EXIT_SCHEMA,
      };
  }
}

/** Ejecuta el CLI y devuelve el código de salida. */
export function run(argv: readonly string[]): number {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (caught) {
    if (caught instanceof UsageError) {
      process.stderr.write(`Error: ${caught.message}\n`);
      return EXIT_SCHEMA;
    }
    throw caught;
  }

  try {
    const result = dispatch(options);
    if (result.stdout !== "") process.stdout.write(result.stdout);
    if (result.stderr !== "") process.stderr.write(`${result.stderr}\n`);
    return result.exitCode;
  } catch (caught) {
    const failure = toFailure(caught);
    process.stderr.write(`Error: ${failure.message}\n`);
    return failure.exitCode;
  }
}

process.exitCode = run(process.argv.slice(2));
