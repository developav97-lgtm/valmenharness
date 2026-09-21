/**
 * Punto de entrada del CLI `valmen`.
 *
 * El análisis de argumentos es propio y deliberadamente pequeño: el camino
 * crítico del harness no debe depender de un framework de CLI. Cada comando
 * devuelve un `CommandResult` en vez de escribir directamente, lo que hace que
 * todos los comandos sean testeables sin capturar la salida del proceso.
 */
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { EXIT_SCHEMA, TicketError, toFailure } from "@valmen/core";
import { gateById } from "@valmen/gate";
import { gateRoutingFor } from "@valmen/adapter";

import {
  type CommandResult,
  buildIndex,
  listActive,
  adoptProject,
  migrateRegistry,
  showTicket,
  syncProject,
  validateAll,
  resumeTicket,
  validateOne,
} from "./commands.js";
import {
  type RegistryPaths,
  defaultPaths,
  legacyPaths,
  renderSimulation,
  runGate,
  simulateGate,
} from "@valmen/engine";
import { type ServerContext, createMissionControl, defaultContext, loadStatics } from "@valmen/server";
import { type Entity, transition } from "@valmen/engine";

const USAGE = `valmen — harness agéntico

Uso: valmen <comando> [opciones]

Comandos:
  validate --all            Valida todos los tickets del registro.
  validate --id <ID>        Valida un ticket concreto.
  active                    Lista los tickets no cerrados (alias: list).
  resume [--id <ID>]        Imprime el contexto para retomar un ticket.
                            Sin --id y con varios activos, no elige: pide uno.
  show <ID>                 Muestra el resumen de un ticket.
  index [--check]           Regenera el índice, o comprueba que esté al día.
  migrate [--dry-run]       Lleva el registro al esquema vigente.
  sync [--check]            Proyecta .valmen/ a AGENTS.md.
  adopt [--dry-run]         Incorpora el harness a un proyecto existente.
  gate <gate> --id <ID>     Evalúa un gate contra un ticket.
      --evaluator <id>      auto (por defecto) · command · jev · llm-judge
  transition --id <ID> --entity <entidad> --to <estado>
                            Mueve el estado de un ticket, un punto o una release.
      --point-id <POINT>    Obligatorio con --entity point.
      --reason <texto>      Solo al reabrir un ticket no publicado, o al
                            declarar terminal un punto.
      --version <SemVer>    Solo con --entity release.
  serve [--port <n>]        Mission Control en 127.0.0.1.
  simulate <gate>           Calibra un gate sobre el registro histórico.
      --limit <n>           Evalúa solo los primeros n sujetos.
      --json                Informe en JSON en vez de tabla.

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
const VALUE_OPTIONS = [
  "--root",
  "--tickets",
  "--id",
  "--limit",
  "--evaluator",
  "--port",
  // `transition` mueve el estado de una entidad, y sus banderas llevan valor.
  "--entity",
  "--to",
  "--point-id",
  "--reason",
  "--version",
] as const;

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
/** El valor de texto de una bandera, si la hay. */
function flag(flags: Readonly<Record<string, string | true>>, name: string): string | undefined {
  const valor = flags[name];
  return typeof valor === "string" ? valor : undefined;
}

/**
 * `transition`: traduce banderas a una petición del motor.
 *
 * La validación de las banderas obligatorias vive aquí y no en el motor porque
 * es de la superficie: el motor recibe una petición bien formada. Los mensajes
 * son los de la referencia, para que un script que hoy los compare siga
 * funcionando.
 */
export function runTransition(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const ticketId = flag(flags, "id");
  const entity = flag(flags, "entity");
  const to = flag(flags, "to");

  if (ticketId === undefined) {
    return { stdout: "", stderr: "transition requiere --id.", exitCode: EXIT_SCHEMA };
  }
  if (entity !== "ticket" && entity !== "point" && entity !== "release") {
    return {
      stdout: "",
      stderr: `--entity debe ser ticket, point o release, no "${entity ?? ""}".`,
      exitCode: EXIT_SCHEMA,
    };
  }
  if (to === undefined) {
    return { stdout: "", stderr: "transition requiere --to.", exitCode: EXIT_SCHEMA };
  }

  try {
    const outcome = transition({
      paths,
      ticketId,
      entity: entity as Entity,
      to,
      pointId: flag(flags, "point-id"),
      reason: flag(flags, "reason"),
      version: flag(flags, "version"),
    });
    return { stdout: `${outcome.details}\n`, stderr: "", exitCode: 0 };
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: failure.message, exitCode: failure.exitCode };
  }
}

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

  // `gate` es el único comando que habla con un proveedor externo, así que es
  // asíncrono. Se detecta aquí para dar un error claro en vez de devolver un
  // resultado vacío si alguien lo invoca por esta vía síncrona.
  if (command === "gate") {
    return {
      stdout: "",
      stderr:
        "El comando gate es asíncrono; use `runGate` o la línea de comandos.",
      exitCode: EXIT_SCHEMA,
    };
  }

  if (command === "transition") {
    return {
      stdout: "",
      stderr:
        "El comando transition escribe en el registro; use `runTransition` o la línea de comandos.",
      exitCode: EXIT_SCHEMA,
    };
  }
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

    case "active":
    case "list":
      // `active` es el nombre que usan las skills del proyecto; `list` es el que
      // el harness publicó primero. La salida es la misma, así que mantener los
      // dos no cuesta nada y evita romper a quien ya lo usaba.
      return listActive(paths);

    case "resume": {
      const rawId = options.flags["id"];
      const id = typeof rawId === "string" ? rawId : undefined;
      return resumeTicket(paths, id);
    }

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

    case "migrate":
      return migrateRegistry(paths, {
        dryRun: options.flags["dry-run"] === true,
      });

    case "adopt":
      return adoptProject(options.root, basename(options.root), {
        dryRun: options.flags["dry-run"] === true,
      });

    case "sync":
      return syncProject(
        options.root,
        basename(options.root),
        options.flags["check"] === true,
      );

    default:
      return {
        stdout: "",
        stderr: `Comando desconocido: ${command}. Use --help para ver los disponibles.`,
        exitCode: EXIT_SCHEMA,
      };
  }
}

/**
 * Ejecuta el CLI y devuelve el código de salida.
 *
 * Es asíncrono porque `gate` consulta a un proveedor externo. Los demás
 * comandos son síncronos por ser puramente locales, así que se despachan sin
 * `await` y el coste es nulo.
 */
export async function run(argv: readonly string[]): Promise<number> {
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
    const [command, ...rest] = options.positionals;
    let result: CommandResult | undefined;

    if (command === "serve") {
      const rawPort = options.flags["port"];
      const puerto = typeof rawPort === "string" ? Number.parseInt(rawPort, 10) : 4173;
      // La interfaz se publica junto al código compilado, en `dist/web`. Se
      // resuelve desde la ubicación de este archivo y no desde el directorio de
      // trabajo: el servidor debe arrancar igual desde cualquier carpeta.
      const raizWeb = join(dirname(fileURLToPath(import.meta.url)), "web");
      let statics: ServerContext["statics"];
      try {
        statics = loadStatics(raizWeb, ["index.html"]);
      } catch (caught) {
        const failure = toFailure(caught);
        result = {
          stdout: "",
          stderr:
            `No se encontró la interfaz en ${raizWeb}. ` +
            "Ejecute `npm run build` para generarla.",
          exitCode: EXIT_SCHEMA,
        };
        process.stderr.write(`${result.stderr}\n`);
        return result.exitCode;
      }

      const contexto: ServerContext = { ...defaultContext(options.root), statics };
      const servidor = createMissionControl(contexto);
      const puertoFinal = Number.isNaN(puerto) ? 4173 : puerto;

      await new Promise<void>((resolve, reject) => {
        servidor.once("error", reject);
        // Solo en la interfaz de loopback: la frontera de confianza es la
        // máquina, igual que en cualquier herramienta que maneja credenciales.
        servidor.listen(puertoFinal, "127.0.0.1", resolve);
      });

      process.stdout.write(
        [
          "Mission Control",
          `  http://127.0.0.1:${puertoFinal}`,
          `  raíz del proyecto   ${options.root}`,
          "",
          "  Escucha solo en 127.0.0.1. Detenlo con Ctrl-C.",
          "",
        ].join("\n"),
      );

      await new Promise<void>((resolve) => {
        process.once("SIGINT", resolve);
        process.once("SIGTERM", resolve);
      });
      servidor.close();
      return 0;
    }

    if (command === "simulate") {
      const gateId = rest[0];
      if (gateId === undefined) {
        result = {
          stdout: "",
          stderr: "simulate requiere un identificador de gate.",
          exitCode: EXIT_SCHEMA,
        };
      } else {
        let definition;
        try {
          definition = gateById(gateId);
        } catch (caught) {
          const failure = toFailure(caught);
          result = {
            stdout: "",
            stderr: failure.message,
            exitCode: EXIT_SCHEMA,
          };
          definition = null;
        }
        if (definition !== null && definition !== undefined) {
          const rawLimit = options.flags["limit"];
          const limit =
            typeof rawLimit === "string"
              ? Number.parseInt(rawLimit, 10)
              : undefined;
          const report = await simulateGate(resolvePaths(options), {
            gate: definition,
            ...(limit === undefined || Number.isNaN(limit) ? {} : { limit }),
            onProgress: (done, total) => {
              if (done % 5 === 0) process.stderr.write(`  ${done}/${total}\r`);
            },
          });
          process.stderr.write("            \r");
          result = {
            stdout:
              options.flags["json"] === true
                ? JSON.stringify(report, null, 2) + "\n"
                : renderSimulation(report, definition.policy),
            stderr: "",
            exitCode: 0,
          };
        } else if (result === undefined) {
          result = { stdout: "", stderr: "", exitCode: 0 };
        }
      }
    } else if (command === "transition") {
      result = runTransition(resolvePaths(options), options.flags);
    } else if (command === "gate") {
      const gateId = rest[0];
      const rawId = options.flags["id"];
      const ticketId = typeof rawId === "string" ? rawId : undefined;

      if (gateId === undefined) {
        result = {
          stdout: "",
          stderr: "gate requiere un identificador de gate.",
          exitCode: EXIT_SCHEMA,
        };
      } else if (ticketId === undefined) {
        result = {
          stdout: "",
          stderr: "gate requiere --id <TICKET-ID>.",
          exitCode: EXIT_SCHEMA,
        };
      } else {
        const rawEvaluator = options.flags["evaluator"];
        const evaluator =
          typeof rawEvaluator === "string" &&
          ["auto", "command", "jev", "llm-judge"].includes(rawEvaluator)
            ? (rawEvaluator as "auto" | "command" | "jev" | "llm-judge")
            : undefined;
        if (typeof rawEvaluator === "string" && evaluator === undefined) {
          result = {
            stdout: "",
            stderr: `Evaluador desconocido: "${rawEvaluator}". Use auto, command, jev o llm-judge.`,
            exitCode: EXIT_SCHEMA,
          };
          throw new Error("__handled__");
        }
        // El modelo lo decide el routing del proyecto, igual que en la app: si
        // el botón y el comando usaran modelos distintos, el recibo de una
        // aprobación no describiría la otra.
        const rutas = resolvePaths(options);
        const routing = gateRoutingFor(rutas.root);

        result = await runGate(rutas, {
          gateId,
          ticketId,
          dryRun: options.flags["dry-run"] === true,
          ...(evaluator === undefined ? {} : { evaluator }),
          ...(routing.evaluatorModel === ""
            ? {}
            : { model: routing.evaluatorModel }),
          ...(routing.probabilistic ? {} : { semantic: "llm-judge" as const }),
          ...(routing.evaluatorEffort === "auto"
            ? {}
            : { effort: routing.evaluatorEffort }),
          ...(routing.judgeModel === "" ? {} : { judgeModel: routing.judgeModel }),
        });
      }
    } else {
      result = dispatch(options);
    }

    const final = result ?? { stdout: "", stderr: "", exitCode: EXIT_SCHEMA };
    if (final.stdout !== "") process.stdout.write(final.stdout);
    // El prefijo `Error: ` se añade **aquí**, en el borde del proceso, y no en
    // cada comando. Es donde lo añade la implementación de referencia
    // (`main`, L2162), y tenerlo en un solo sitio evita la incoherencia que
    // había: una excepción salía con prefijo y un fallo devuelto, sin él.
    if (final.stderr !== "") process.stderr.write(`Error: ${final.stderr}\n`);
    return final.exitCode;
  } catch (caught) {
    const failure = toFailure(caught);
    process.stderr.write(`Error: ${failure.message}\n`);
    return failure.exitCode;
  }
}

/**
 * `true` si este módulo se está ejecutando como programa principal.
 *
 * Importar `main.ts` para probar `parseArgs` no debe ejecutar el CLI. Sin esta
 * guarda, un test que solo quiere analizar argumentos lanza el comando entero,
 * imprime la ayuda y fija un código de salida: el módulo se vuelve intestable.
 */
function isMainModule(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  // El código de salida se fija cuando la promesa se resuelve. Asignarlo de
  // forma síncrona con una promesa pendiente haría que el proceso terminara con
  // 0 sin haber evaluado nada.
  void run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`Error inesperado: ${String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
