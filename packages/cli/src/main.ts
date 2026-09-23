#!/usr/bin/env node
/**
 * Punto de entrada del CLI `valmen`.
 *
 * Lleva shebang porque es el ejecutable que se publica como `valmen`: sin él, el
 * archivo solo se puede lanzar con `node main.js` y un enlace en el `PATH` —que
 * es como se instala un binario— no arranca. TypeScript lo elimina al compilar
 * salvo que se le pida conservarlo, y esa diferencia no se nota hasta que
 * alguien intenta usarlo desde otra carpeta.
 *
 * El análisis de argumentos es propio y deliberadamente pequeño: el camino
 * crítico del harness no debe depender de un framework de CLI. Cada comando
 * devuelve un `CommandResult` en vez de escribir directamente, lo que hace que
 * todos los comandos sean testeables sin capturar la salida del proceso.
 */
import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EXIT_INVARIANT, EXIT_SCHEMA, toFailure } from "@valmen/core";
import { resolveApiKeyWithFile } from "@valmen/credentials";
import { gateById } from "@valmen/gate";
import { gateRoutingFor } from "@valmen/adapter";

import {
  type CommandResult,
  buildIndex,
  calibrateReport,
  deliverManifest,
  listActive,
  adoptProject,
  migrateRegistry,
  reportClosed,
  showTicket,
  syncProject,
  validateAll,
  resumeTicket,
  validateOne,
} from "./commands.js";
import { runFeature } from "./features.js";
import { mcpCommand } from "./mcp.js";
import { runProcess } from "./process.js";
import {
  type RegistryPaths,
  choosePaths,
  legacyPaths,
  declaredParamNames,
  renderSimulation,
  runGate,
  simulateGate,
} from "@valmen/engine";
import {
  type ServerContext,
  createMissionControl,
  defaultContext,
  loadStatics,
  recordHumanDecision,
} from "@valmen/server";
import {
  type Entity,
  addAiUsage,
  addEvidence,
  addPoint,
  addRetest,
  closeAttempt,
  createTicket,
  releasePublish,
  qaClose,
  qaStart,
  transition,
} from "@valmen/engine";

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
  migrate [--dry-run]       Lleva el registro al esquema vigente y limpia del
                            routing los roles que el harness ya no ejecuta.
  sync [--check]            Proyecta .valmen/ a AGENTS.md.
  adopt [--dry-run]         Incorpora el harness a un proyecto existente.
  gate <gate> --id <ID>     Evalúa un gate contra un ticket.
      --evaluator <id>      auto (por defecto) · command · jev · llm-judge
  create --id <ID> --title <t> --type <TIPO> --module <MODULO> --request <texto>
                            Crea un ticket desde la plantilla, en intake.
  release-publish --version <SemVer> --tickets <ID1,ID2>
                            Registra la publicación. Exige el tag anotado sobre
                            production y que cada ticket esté cerrado.
  add-point --id <ID> --title <t> --severity <s> --actual <a> --expected <e>
                            Anexa el siguiente POINT-NNN, en estado abierto.
      --files <a,b>         Archivos que el punto toca, relativos a la raíz.
  qa-start --id <ID> --environment <e> --build-reference <ref>
                            Abre un ciclo QA. Exige el ticket en in_qa.
  qa-close --id <ID> --result <r>
                            Cierra el ciclo abierto. --po-confirmation si aprueba.
  add-evidence --id <ID> --kind <k> --description <d>
                            Anexa evidencia. --reference y --point-id opcionales.
  add-retest --id <ID> --point-id <P> --result <r>
                            Anexa un retest y mueve el punto según el resultado.
  close-attempt --id <ID> --technical-summary <t> --functional-summary <f>
                --qa-status <approved|waived> --release-impact <r>
                            Anexa un intento de cierre. No cierra el ticket.
  add-ai-usage --id <ID> --source <s> --confidence <high|medium|low>
                            Anexa consumo de IA. El resto de campos son opcionales.
  gate-decide --id <ID> --receipt <GR-…> --decision <approve|reject> --actor <nombre>
                            Registra la decisión humana sobre un gate escalado.
      --reason <texto>      Queda en el recibo y en el historial del ticket.
  transition --id <ID> --entity <entidad> --to <estado>
                            Mueve el estado de un ticket, un punto o una release.
      --point-id <POINT>    Obligatorio con --entity point.
      --reason <texto>      Solo al reabrir un ticket no publicado, o al
                            declarar terminal un punto.
      --version <SemVer>    Solo con --entity release.
  feature list              Lista las features del proyecto.
  feature show <slug>       Muestra el brief y los artefactos de una feature.
  feature new <slug> --title <t>
                            Crea una feature en draft, en .valmen/features/.
  feature decompose <slug>  Propone el grafo de tickets con el modelo del rol
                            architect y escribe tickets.yaml. Pasa a decomposed.
      --dry-run             Muestra la descomposición sin escribirla.
      --model <id>          Sobrescribe el modelo del rol architect.
      --provider <id>       Sobrescribe el proveedor.
  report                    Reporte Markdown de los tickets cerrados.
      --desde <YYYY-MM-DD>  Por defecto, hace 30 días.
      --hasta <YYYY-MM-DD>  Por defecto, hoy. El rango es por fecha de CIERRE.
      --type <TIPO>         Filtra por tipo de ticket.
      --q <texto>           Busca en título, problema, solución y rol afectado.
  deliver-manifest --version <SemVer> --tickets <ID1,ID2>
                            Escribe el manifiesto de entrega en
                            .valmen/deliveries/<versión>.json. Exige cada ticket
                            cerrado, visible al usuario y sin publicar.
      --released-at <fecha> Por defecto, hoy.
      --dry-run             Muestra el manifiesto sin escribirlo.
  process list              Lista los procesos declarados en .valmen/processes/.
  process show <id>         Muestra los pasos y los parámetros de un proceso.
  process run <id>          Ejecuta un proceso. Se detiene en un gate sin aprobar.
      --set n=v[,n=v]       Parámetros del proceso. También --<nombre> <valor>,
                            salvo que choque con una bandera del CLI.
      --skip-gates          No espera en los gates: los saltea. Para ensayar.
  process approve <gate> --actor <nombre>
                            Aprueba un gate de proceso. No retoma nada por sí solo.
      --reason <texto>      Queda registrado con la aprobación.
  process runs              Las corridas, con las detenidas primero.
  process show-run <corrida>
                            El detalle de una corrida.
  process resume [corrida]  Retoma una corrida detenida **desde donde quedó**: los
                            pasos ya ejecutados no se repiten.
      --skip-gates          Saltea los gates que sigan sin aprobar.
  process abandon <corrida> Deja de poder retomarla. No deshace lo ya ejecutado.
  serve [--port <n>]        Mission Control en 127.0.0.1.
  simulate <gate>           Mide un gate sobre el registro histórico.
      --limit <n>           Evalúa solo los primeros n sujetos.
      --json                Informe en JSON en vez de tabla.
      --calibrate           Compara el veredicto del gate con el que registraron
                            las personas en los ciclos de QA. Cuesta una
                            evaluación completa: se pide a sabiendas.

Opciones globales:
  --root <ruta>             Raíz del proyecto (por defecto: el directorio actual).
  --tickets-dir <ruta>      Directorio del registro, relativo a la raíz.
                            (Se llamaba --tickets; el nombre cambió porque
                            release-publish usa --tickets para la lista de IDs.)
  --legacy-layout           Usa docs/tickets/ en vez de tickets/.
  --credentials <ruta>      Archivo de credenciales. Por defecto, el del $HOME.
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
  "--tickets-dir",
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
  // Comandos de anexado.
  "--title",
  "--severity",
  "--actual",
  "--expected",
  "--kind",
  "--description",
  "--reference",
  "--source",
  "--confidence",
  "--session-reference",
  "--model",
  "--reasoning-effort",
  "--input-tokens",
  "--output-tokens",
  "--total-tokens",
  "--estimated-cost-usd",
  "--notes",
  "--environment",
  "--build-reference",
  "--result",
  "--po-confirmation",
  "--technical-summary",
  "--functional-summary",
  "--qa-status",
  "--release-impact",
  "--qa-waiver-reason",
  "--receipt",
  "--decision",
  "--actor",
  "--tickets",
  "--desde",
  "--hasta",
  "--q",
  "--set",
  "--actor",
  "--run",
  "--credentials",
  "--released-at",
  "--provider",
  "--type",
  "--module",
  "--request",
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
export function parseArgs(
  argv: readonly string[],
  /**
   * Opciones que consumen un valor además de las del CLI.
   *
   * Las usa `process run`: los parámetros de un proceso no están en la lista fija,
   * así que `--modulo inventario` se leería como una bandera booleana y el valor
   * quedaría suelto.
   */
  extraValueOptions: readonly string[] = [],
): Options {
  const valueOptions = new Set<string>([...VALUE_OPTIONS, ...extraValueOptions]);

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
    let inlineValue: string | undefined = equals === -1 ? undefined : arg.slice(equals + 1);

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
      else if (name === "--tickets-dir") ticketsDir = inlineValue;
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
/**
 * `gate decide`: registra la decisión de una persona sobre un gate escalado.
 *
 * Faltaba, y su ausencia dejaba el trabajo a medias en las dos direcciones: la
 * decisión humana solo se podía tomar en la app y la transición solo en el CLI.
 * Quien trabaja en la terminal no podía cerrar un gate.
 */
export function runGateDecide(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const ticketId = flag(flags, "id");
  const receiptId = flag(flags, "receipt");
  const decision = flag(flags, "decision");
  const actor = flag(flags, "actor");

  const falta = (nombre: string): CommandResult => ({
    stdout: "",
    stderr:
      `gate decide requiere --${nombre}. ` +
      "Una decisión humana sin ese dato no es auditable.",
    exitCode: EXIT_SCHEMA,
  });

  if (ticketId === undefined) return falta("id");
  if (receiptId === undefined) return falta("receipt");
  if (decision !== "approve" && decision !== "reject") {
    return {
      stdout: "",
      stderr: "gate decide requiere --decision approve o --decision reject.",
      exitCode: EXIT_SCHEMA,
    };
  }
  if (actor === undefined || actor.trim() === "") return falta("actor");

  const resultado = recordHumanDecision(paths, ticketId, receiptId, {
    decision,
    actor,
    reason: flag(flags, "reason") ?? "",
  });

  if (!resultado.ok) {
    return { stdout: "", stderr: resultado.error, exitCode: EXIT_INVARIANT };
  }
  return {
    stdout: `Decisión registrada en ${receiptId}: ${decision} por ${actor.trim()}.
`,
    stderr: resultado.error === "" ? "" : resultado.error,
    exitCode: 0,
  };
}

/**
 * Qué banderas consumen un valor para el `process run` de esta línea de comandos.
 *
 * Se mira el `--root` crudo —el único que decide dónde está el proceso— y se leen
 * sus parámetros declarados. Sin esto, `--modulo inventario` se analiza como una
 * bandera booleana porque `--modulo` no está en la lista fija del CLI, el valor
 * queda suelto y el motor se queja de que falta un parámetro que sí se pasó.
 */
function valorDeParametrosDeProceso(argv: readonly string[]): string[] {
  const posicion = argv.findIndex((arg) => arg === "process");
  if (posicion === -1 || argv[posicion + 1] !== "run") return [];
  const id = argv[posicion + 2];
  if (id === undefined || id.startsWith("--")) return [];

  const raizCruda = argv.findIndex((arg) => arg === "--root");
  const raiz = raizCruda === -1 ? process.cwd() : (argv[raizCruda + 1] ?? process.cwd());
  try {
    // Con los guiones: `parseArgs` compara el nombre tal como se escribe —`--modulo`—,
    // no el nombre del parámetro.
    return declaredParamNames(raiz, id).map((nombre) => `--${nombre}`);
  } catch {
    // Un proceso que no se puede leer no impide analizar los argumentos: el error
    // bueno lo da el motor, con el catálogo delante.
    return [];
  }
}

/** Los comandos que anexan datos a un ticket. */
const ESCRITURA = new Set([
  "create",
  "release-publish",
  "add-point",
  "qa-start",
  "qa-close",
  "add-evidence",
  "add-retest",
  "close-attempt",
  "add-ai-usage",
]);

/**
 * Los comandos de anexado, traducidos a peticiones del motor.
 *
 * La validación de las banderas obligatorias vive aquí, en la superficie: el
 * motor recibe una petición bien formada y sus errores son del contrato. La
 * separación importa porque el servidor llama al mismo motor sin pasar por aquí.
 */
export function runAppend(
  command: string,
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  // `release-publish` es el único que no opera sobre un ticket: recibe una lista
  // con `--tickets`, y exigirle `--id` lo haría inalcanzable.
  const ticketId = flag(flags, "id");
  if (ticketId === undefined && command !== "release-publish") {
    return {
      stdout: "",
      stderr: `${command} requiere --id.`,
      exitCode: EXIT_SCHEMA,
    };
  }

  /**
   * El identificador, ya comprobado.
   *
   * `release-publish` no lo lleva, así que el compilador no puede garantizar que
   * exista; los comandos que sí lo llevan lo piden por aquí.
   */
  const identificador = (): string => {
    if (ticketId === undefined) {
      throw Object.assign(new Error(`${command} requiere --id.`), {
        exitCode: EXIT_SCHEMA,
      });
    }
    return ticketId;
  };

  const obligatoria = (nombre: string): string => {
    const valor = flag(flags, nombre);
    if (valor === undefined) {
      throw Object.assign(new Error(`${command} requiere --${nombre}.`), {
        exitCode: EXIT_SCHEMA,
      });
    }
    return valor;
  };

  try {
    let salida: string;

    switch (command) {
      case "create":
        salida = createTicket({
          paths,
          id: identificador(),
          title: obligatoria("title"),
          type: obligatoria("type"),
          module: obligatoria("module"),
          request: obligatoria("request"),
        });
        break;

      case "release-publish":
        salida = releasePublish({
          paths,
          version: obligatoria("version"),
          tickets: obligatoria("tickets"),
        });
        break;

      case "add-point": {
        // Los archivos van separados por comas y son opcionales, pero no
        // decorativos: son los que entran en el hash de `worktree`.
        const archivos = flag(flags, "files");
        salida = addPoint({
          paths,
          ticketId: identificador(),
          title: obligatoria("title"),
          severity: obligatoria("severity"),
          actual: obligatoria("actual"),
          expected: obligatoria("expected"),
          affectedFiles:
            archivos === undefined
              ? []
              : archivos
                  .split(",")
                  .map((ruta) => ruta.trim())
                  .filter((ruta) => ruta !== ""),
        });
        break;
      }

      case "qa-start":
        salida = qaStart({
          paths,
          ticketId: identificador(),
          environment: flag(flags, "environment"),
          buildReference: flag(flags, "build-reference"),
        });
        break;

      case "qa-close":
        salida = qaClose({
          paths,
          ticketId: identificador(),
          result: obligatoria("result"),
          poConfirmation: flag(flags, "po-confirmation"),
        });
        break;

      case "add-evidence":
        salida = addEvidence({
          paths,
          ticketId: identificador(),
          kind: obligatoria("kind"),
          description: obligatoria("description"),
          reference: flag(flags, "reference"),
          pointId: flag(flags, "point-id"),
        });
        break;

      case "add-retest":
        salida = addRetest({
          paths,
          ticketId: identificador(),
          pointId: obligatoria("point-id"),
          result: obligatoria("result"),
          poConfirmation: flag(flags, "po-confirmation"),
        });
        break;

      case "close-attempt":
        salida = closeAttempt({
          paths,
          ticketId: identificador(),
          technicalSummary: obligatoria("technical-summary"),
          functionalSummary: obligatoria("functional-summary"),
          qaStatus: obligatoria("qa-status"),
          releaseImpact: obligatoria("release-impact"),
          qaWaiverReason: flag(flags, "qa-waiver-reason"),
          poConfirmation: flag(flags, "po-confirmation"),
        });
        break;

      case "add-ai-usage":
        salida = addAiUsage({
          paths,
          ticketId: identificador(),
          source: obligatoria("source"),
          confidence: obligatoria("confidence"),
          sessionReference: flag(flags, "session-reference"),
          model: flag(flags, "model"),
          reasoningEffort: flag(flags, "reasoning-effort"),
          inputTokens: flag(flags, "input-tokens"),
          outputTokens: flag(flags, "output-tokens"),
          totalTokens: flag(flags, "total-tokens"),
          estimatedCostUsd: flag(flags, "estimated-cost-usd"),
          notes: flag(flags, "notes"),
        });
        break;

      default:
        return {
          stdout: "",
          stderr: `Comando de escritura desconocido: ${command}.`,
          exitCode: EXIT_SCHEMA,
        };
    }

    return { stdout: `${salida}\n`, stderr: "", exitCode: 0 };
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: failure.message, exitCode: failure.exitCode };
  }
}

/** El valor de texto de una bandera, si la hay. */
function flag(
  flags: Readonly<Record<string, string | true>>,
  name: string,
): string | undefined {
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

/**
 * Resuelve el registro sobre el que va a trabajar el comando.
 *
 * El orden es: `--tickets-dir` explícito gana; si no, `--legacy-layout` fuerza el
 * layout anterior; si no, se **detecta** dónde hay tickets.
 *
 * La detección es la parte que importa y la que faltaba. Mission Control y el
 * servidor MCP la usaban desde el principio —`choosePaths`—, pero el CLI se
 * quedó en `defaultPaths`, así que sobre un proyecto adoptado con el registro en
 * `docs/tickets` **todos** los comandos fallaban con «No se encontró el
 * directorio de tickets: tickets» hasta que alguien recordara la bandera. En un
 * proyecto real eso es fricción en cada comando, y peor: la app y el CLI
 * discreparem sobre dónde está el registro.
 */
export function resolvePaths(options: Options): RegistryPaths {
  if (options.ticketsDir !== undefined) {
    return { root: options.root, ticketsDir: options.ticketsDir };
  }
  return options.legacyLayout ? legacyPaths(options.root) : choosePaths(options.root);
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
      stderr: "El comando gate es asíncrono; use `runGate` o la línea de comandos.",
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

    case "report":
      return reportClosed(paths, options.flags);

    case "deliver-manifest":
      return deliverManifest(paths, options.flags);

    case "process":
      // `process <sub> [args]`: su propio módulo, como `feature`.
      return runProcess(options.root, rest, options.flags);

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

    case "feature":
      // `feature <sub> [args]` es asíncrono —`decompose` habla con un
      // proveedor—, así que se despacha en `run` y no aquí. Los subcomandos de
      // solo lectura siguen entrando por esta vía.
      return {
        stdout: "",
        stderr: "El comando feature es asíncrono; use la línea de comandos.",
        exitCode: EXIT_SCHEMA,
      };

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
    options = parseArgs(argv, valorDeParametrosDeProceso(argv));
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
      } catch {
        // El error crudo de `loadStatics` habla de rutas; este dice qué hacer. Se
        // descarta a propósito, y por eso el `catch` no liga la excepción.
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

    if (command === "mcp") {
      // El ejecutable del servidor se deduce del que está corriendo: en una
      // instalación global y en el repositorio de desarrollo las rutas no tienen
      // nada que ver, y escribir una a mano deja la otra rota.
      result = mcpCommand({
        root: options.root,
        // La ruta de **invocación**, no la del módulo: con un binario
        // enlazado en el `PATH`, la del módulo es la del repositorio y
        // escribirla en la configuración la ataría a esta máquina.
        cliEntry: process.argv[1] ?? fileURLToPath(import.meta.url),
        install: options.flags["install"] === true,
        global: options.flags["global"] === true,
        json: options.flags["json"] === true,
      });
    } else if (command === "simulate") {
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
            typeof rawLimit === "string" ? Number.parseInt(rawLimit, 10) : undefined;
          const report = await simulateGate(resolvePaths(options), {
            gate: definition,
            ...(limit === undefined || Number.isNaN(limit) ? {} : { limit }),
            onProgress: (done, total) => {
              if (done % 5 === 0) process.stderr.write(`  ${done}/${total}\r`);
            },
          });
          process.stderr.write("            \r");

          // `--calibrate` compara lo que decidió el gate con lo que decidieron
          // las personas. Se pide a sabiendas porque evalúa todo el registro.
          if (options.flags["calibrate"] === true) {
            result = calibrateReport(resolvePaths(options), gateId, report);
          } else {
            result = {
              stdout:
                options.flags["json"] === true
                  ? JSON.stringify(report, null, 2) + "\n"
                  : renderSimulation(report, definition.policy),
              stderr: "",
              exitCode: 0,
            };
          }
        } else if (result === undefined) {
          result = { stdout: "", stderr: "", exitCode: 0 };
        }
      }
    } else if (command === "feature") {
      result = await runFeature(options.root, rest, options.flags);
    } else if (command === "gate-decide") {
      result = runGateDecide(resolvePaths(options), options.flags);
    } else if (command === "transition") {
      result = runTransition(resolvePaths(options), options.flags);
    } else if (command !== undefined && ESCRITURA.has(command)) {
      result = runAppend(command, resolvePaths(options), options.flags);
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

        // La credencial se resuelve aquí, en el borde, con el archivo que el
        // usuario indique. Sin `--credentials` es el del `$HOME`, que es lo normal
        // para un CLI; con él, un proyecto puede tener el suyo y el comando y la
        // app dejan de poder discrepar.
        const archivoCredenciales =
          typeof options.flags["credentials"] === "string"
            ? options.flags["credentials"]
            : undefined;
        let apiKey: string | undefined;
        try {
          apiKey = resolveApiKeyWithFile(
            routing.evaluatorProvider === "" ? "openrouter" : routing.evaluatorProvider,
            archivoCredenciales,
          );
        } catch (caught) {
          // Un fallo de credencial no se silencia: el evaluador daría el mismo
          // error más tarde y con menos contexto.
          const failure = toFailure(caught);
          result = { stdout: "", stderr: failure.message, exitCode: failure.exitCode };
        }

        result ??= await runGate(rutas, {
          gateId,
          ticketId,
          dryRun: options.flags["dry-run"] === true,
          ...(apiKey === undefined ? {} : { apiKey }),
          ...(evaluator === undefined ? {} : { evaluator }),
          ...(routing.evaluatorModel === "" ? {} : { model: routing.evaluatorModel }),
          ...(routing.evaluatorProvider === ""
            ? {}
            : { provider: routing.evaluatorProvider }),
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
 *
 * La comparación se hace sobre rutas **reales**, no sobre el texto. Un binario
 * instalado en el `PATH` se alcanza por un enlace simbólico: `import.meta.url`
 * trae la ruta resuelta y `process.argv[1]` la del enlace, así que compararlas
 * en crudo da `false` y el proceso termina con éxito **sin hacer nada**. Es un
 * fallo silencioso y por eso conviene que la comparación sea la correcta.
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
