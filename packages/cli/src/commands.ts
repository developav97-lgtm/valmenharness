/**
 * Comandos de solo lectura y de índice.
 *
 * Los mensajes y los códigos de salida replican los del CLI de referencia
 * porque son parte del contrato: un script que hoy hace
 * `ticket.py validate --all` debe seguir funcionando con `valmen validate --all`
 * sin cambios. Ver docs/09-MIGRACION-SAICLOUD.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import {
  type ParsedTicket,
  EXIT_AMBIGUOUS,
  EXIT_INVARIANT,
  EXIT_SCHEMA,
  MutationLock,
  SCHEMA_VERSION,
  TicketError,
  atomicWrite,
  migrateTicketText,
  parseTicket,
  readIfExists,
  toFailure,
  today as todayIso,
  validateDocument,
} from "@valmen/core";
import {
  type Projection,
  adoptPlan,
  applyBlueprint,
  blueprintsDir,
  listBlueprints,
  parseRoutingTolerante,
  profileProject,
  projectFiles,
  proposeConfig,
  readBlueprint,
  renderBlueprintOutcome,
  renderRouting,
  routingPath,
} from "@valmen/adapter";

import {
  type LocatedTicket,
  type RegistryPaths,
  type ProcessRunState,
  type RunnerResult,
  type SimulationReport,
  abandonRun,
  approveGate,
  buildManifest,
  calibrate,
  humanReferences,
  listRuns,
  loadProcesses,
  readRun,
  renderCalibration,
  renderRun,
  waitingRuns,
  requireProcess,
  runProcess,
  chooseTicketsDir,
  closedTickets,
  defaultReportRange,
  findAllTickets,
  filterReport,
  findTicket,
  indexPath,
  parseReportDate,
  parseTicketList,
  renderManifest,
  renderReport,
  ticketsPath,
} from "@valmen/engine";
import { guardarFotoEnTicket } from "@valmen/server";

import {
  AREAS,
  decideProposal,
  listProposals,
  proposeStandard,
  renderProposals,
  standardsFiles,
  isIndexCurrent,
  loadMemory,
  memoryFiles,
  renderHits,
  saveLearning,
  searchMemory,
  renderIndex,
  renderUsage,
  renderValue,
  ticketValueReport,
  renderDrift,
  scanDrift,
  DECISIONES_APRENDIZAJE,
  classifyLearning,
  listLearnings,
  renderLearnings,
  renderColorReport,
  scanPendingChanges,
  scanPendingColors,
  usageReport,
} from "@valmen/engine";

/**
 * Resultado de un comando: qué escribir y con qué código salir.
 *
 * Es el mismo tipo que devuelve el motor de gates. Tener dos definiciones
 * idénticas permitiría que una cambiara sin la otra y que el servidor dejara de
 * entender lo que el CLI produce.
 */
export type CommandResult = RunnerResult;

/** Escribe en stdout y termina con éxito. */
function ok(stdout: string): CommandResult {
  return { stdout, stderr: "", exitCode: 0 };
}

/** Escribe en stderr y termina con el código dado. */
function error(stderr: string, exitCode: number = EXIT_SCHEMA): CommandResult {
  return { stdout: "", stderr, exitCode };
}

/**
 * Valida un ticket y devuelve su error, o `undefined` si es válido.
 *
 * `expectedId` solo se pasa cuando el ticket se localizó por identificador: al
 * recorrer el registro completo el nombre del directorio no es autoridad, lo
 * es el `id` del frontmatter.
 */
function validationError(
  ticket: LocatedTicket,
  expectedId?: string,
): TicketError | undefined {
  try {
    const parsed = parseTicket(ticket.text);
    validateDocument(parsed, expectedId === undefined ? {} : { expectedId });
    return undefined;
  } catch (caught) {
    if (caught instanceof TicketError) return caught;
    throw caught;
  }
}

/**
 * `validate --all`: recorre el registro y acumula **todos** los errores.
 *
 * Acumular en vez de abortar en el primero es deliberado: al arreglar un
 * registro migrado conviene ver todo lo que falta de una vez.
 */
export function validateAll(paths: RegistryPaths): CommandResult {
  let tickets: LocatedTicket[];
  try {
    tickets = findAllTickets(paths);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }

  const failures: string[] = [];
  for (const ticket of tickets) {
    const failure = validationError(ticket);
    if (failure !== undefined) {
      failures.push(`${ticket.relativePath}: ${failure.message}`);
    }
  }

  if (failures.length > 0) {
    const count = failures.length;
    return error(`Se encontraron ${count} ticket(s) inválidos: ${failures.join("; ")}`);
  }

  return ok(`Tickets válidos: ${tickets.length}\n`);
}

/** `validate --id <ID>`: valida un ticket concreto. */
export function validateOne(paths: RegistryPaths, id: string): CommandResult {
  const ticket = findTicket(paths, id);
  if (ticket === undefined) {
    return error("La ruta canónica solicitada no existe.");
  }
  const failure = validationError(ticket, id);
  if (failure !== undefined) {
    return error(failure.message, failure.exitCode);
  }
  return ok(`Ticket válido: ${id}\n`);
}

/** `list`: imprime los tickets no cerrados, ordenados por fecha e id. */
export function listActive(paths: RegistryPaths): CommandResult {
  let tickets: LocatedTicket[];
  try {
    tickets = findAllTickets(paths);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }

  const rows = tickets
    .map((ticket) => {
      const parsed = parseTicket(ticket.text);
      return {
        created: parsed.fields.created,
        id: parsed.fields.id,
        workflow: parsed.fields.workflow_status,
        module: parsed.fields.module,
        title: parsed.fields.title,
      };
    })
    .filter((row) => row.workflow !== "closed")
    .sort((a, b) => {
      if (a.created !== b.created) return a.created < b.created ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  if (rows.length === 0) return ok("No hay tickets activos.\n");

  const lines = rows.map(
    (row) => `${row.id} | ${row.workflow} | ${row.module} | ${row.title}`,
  );
  return ok(lines.join("\n") + "\n");
}

/**
 * `resume`: imprime el contexto de un ticket para retomar el trabajo.
 *
 * Está portado de la referencia (`cmd_resume` + `_print_resume`) porque los
 * agentes lo invocan: la skill del orquestador lo usa para retomar sin leer el
 * ticket entero. El formato de siete líneas se conserva literal, y también la
 * decisión de diseño que lo hace interesante: **sin `--id` y con más de un
 * ticket activo no elige**. Devuelve `EXIT_AMBIGUOUS` y pide que se indique uno.
 * Un comando que adivina cuál querías es peor que uno que pregunta.
 */
export function resumeTicket(paths: RegistryPaths, id: string | undefined): CommandResult {
  if (id !== undefined) {
    const ticket = findTicket(paths, id);
    if (ticket === undefined) {
      return error("La ruta canónica solicitada no existe.");
    }
    const failure = validationError(ticket, id);
    if (failure !== undefined) return error(failure.message, failure.exitCode);
    return ok(renderResume(parseTicket(ticket.text)));
  }

  const activos = activosOrdenados(paths);
  if ("error" in activos) return activos.error;

  if (activos.rows.length === 0) {
    return ok("No hay tickets activos para reanudar.\n");
  }
  if (activos.rows.length > 1) {
    return {
      stdout: "",
      stderr:
        `Hay varios tickets activos (${activos.rows.map((fila) => fila.id).join(", ")}); ` +
        "indique uno con --id.",
      exitCode: EXIT_AMBIGUOUS,
    };
  }
  return ok(renderResume(activos.rows[0]?.document as ParsedTicket));
}

/** El bloque de siete líneas de `resume`. */
function renderResume(document: ParsedTicket): string {
  const { fields } = document;
  return (
    [
      `Ticket: ${fields.id}`,
      `Título: ${fields.title}`,
      `Tipo/Módulo: ${fields.type} / ${fields.module}`,
      `Workflow: ${fields.workflow_status}`,
      `QA: ${fields.qa_status}`,
      `Release: ${fields.release_status}`,
      `Puntos: ${(document.blocks.Puntos ?? []).length}`,
    ].join("\n") + "\n"
  );
}

/** Los tickets activos, ordenados por `created` y luego por `id`. */
function activosOrdenados(
  paths: RegistryPaths,
): { rows: { id: string; document: ParsedTicket }[] } | { error: CommandResult } {
  let tickets: LocatedTicket[];
  try {
    tickets = findAllTickets(paths);
  } catch (caught) {
    const failure = toFailure(caught);
    return { error: error(failure.message, failure.exitCode) };
  }

  const rows: { id: string; document: ParsedTicket; created: string }[] = [];
  for (const ticket of tickets) {
    const failure = validationError(ticket, ticket.id);
    if (failure !== undefined) {
      return { error: error(failure.message, failure.exitCode) };
    }
    const document = parseTicket(ticket.text);
    if (document.fields.workflow_status === "closed") continue;
    rows.push({ id: document.fields.id, document, created: document.fields.created });
  }

  rows.sort((a, b) => {
    if (a.created !== b.created) return a.created < b.created ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return { rows };
}

/** `show`: imprime un resumen legible de un ticket. */
export function showTicket(paths: RegistryPaths, id: string): CommandResult {
  const ticket = findTicket(paths, id);
  if (ticket === undefined) {
    return error("La ruta canónica solicitada no existe.");
  }
  const failure = validationError(ticket, id);
  if (failure !== undefined) {
    return error(failure.message, failure.exitCode);
  }

  const parsed = parseTicket(ticket.text);
  const { fields } = parsed;
  const blocking = parsed.blocks.Puntos.filter((point: Record<string, unknown>) =>
    ["open", "analyzed", "in_progress", "awaiting_retest"].includes(
      String(point["status"]),
    ),
  );

  const lines = [
    `Ticket:   ${fields.id}`,
    `Título:   ${fields.title}`,
    `Tipo:     ${fields.type} · Módulo: ${fields.module}`,
    `Workflow: ${fields.workflow_status}`,
    `QA:       ${fields.qa_status}`,
    `Release:  ${fields.release_status}`,
    `Riesgo:   ${fields.risk_level}`,
    `Creado:   ${fields.created} · Actualizado: ${fields.updated}`,
    `Puntos:   ${parsed.blocks.Puntos.length} (${blocking.length} bloqueantes)`,
    `Ruta:     ${ticket.relativePath}`,
  ];
  return ok(lines.join("\n") + "\n");
}

/**
 * `index`: regenera el índice derivado, o comprueba que esté al día.
 *
 * Con `--check` no escribe: es el modo que conviene usar en integración
 * continua, porque detecta un índice que alguien olvidó regenerar sin
 * modificar el repositorio.
 */
export function buildIndex(paths: RegistryPaths, check: boolean): CommandResult {
  let tickets: LocatedTicket[];
  try {
    tickets = findAllTickets(paths);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }

  const target = indexPath(paths);
  const onDisk = existsSync(target) ? readFileSync(target, "utf8") : null;

  if (check) {
    if (onDisk === null) {
      return error("No se pudo leer el índice de tickets.");
    }
    if (!isIndexCurrent(paths, tickets, onDisk)) {
      return error("El índice está desactualizado; ejecute el comando index.");
    }
    return ok("Índice actualizado.\n");
  }

  const content = renderIndex(paths, tickets);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
  return ok("Índice reconstruido.\n");
}

/** Una línea del informe de migración. */
interface MigrationOutcome {
  readonly id: string;
  readonly relativePath: string;
  readonly migrated: boolean;
  readonly reason: string;
  readonly text: string;
}

/**
 * `migrate`: lleva el registro al esquema vigente.
 *
 * Tres garantías, en este orden:
 *
 * 1. **Se valida todo antes de escribir nada.** Si un solo ticket del registro
 *    es inválido, no se migra ninguno. Una migración a medias dejaría el
 *    registro en dos esquemas a la vez.
 * 2. **Solo se reescribe el frontmatter.** Los bloques JSON append-only —los
 *    1.851 eventos, los 137 puntos, los ciclos de QA— se conservan byte a byte.
 *    Reescribir el historial para adaptarlo a un vocabulario nuevo destruiría
 *    la trazabilidad, que es el activo del sistema.
 * 3. **Es idempotente.** Migrar dos veces no cambia nada la segunda vez, ni
 *    reescribe `updated`: eso ensuciaría el historial en cada ejecución.
 *
 * Con `dryRun` no escribe y devuelve el mismo informe.
 */
/**
 * El archivo de routing, al vocabulario vigente de roles.
 *
 * Existe porque el registro de tickets tenía migración desde el principio y la
 * configuración del proyecto no tenía ninguna, y el vocabulario de roles se
 * encogió una vez —de trece a tres— sin que nada reescribiera los archivos ya
 * escritos. El resultado era un `routing.yaml` con una clave retirada que detenía
 * **todas** las compuertas del proyecto, con un error que señalaba el rol y no el
 * archivo viejo.
 *
 * Se reescribe con `renderRouting`, que es el escritor canónico: el archivo queda
 * en la forma que produce el propio harness, no en una inventada aquí. Y no se
 * toca si no hay nada retirado, porque reescribir un archivo sano perdería los
 * comentarios de quien lo editó a mano sin ganar nada.
 */
function migrateRouting(
  root: string,
  dryRun: boolean,
): { readonly retirados: readonly string[]; readonly escrito: boolean } {
  const ruta = routingPath(root);
  if (!existsSync(ruta)) return { retirados: [], escrito: false };

  let texto: string;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch {
    // Un archivo que no se puede leer no es una migración fallida: es un archivo
    // que no está. El error bueno lo dará quien lo use para evaluar.
    return { retirados: [], escrito: false };
  }
  if (texto.trim() === "") return { retirados: [], escrito: false };

  const { routing, retirados } = parseRoutingTolerante(texto);
  if (retirados.length === 0) return { retirados: [], escrito: false };

  if (!dryRun) atomicWrite(ruta, renderRouting(routing));
  return { retirados, escrito: !dryRun };
}

export function migrateRegistry(
  paths: RegistryPaths,
  options: { dryRun?: boolean; today?: string } = {},
): CommandResult {
  const referenceDate = options.today ?? todayIso();
  const dryRun = options.dryRun === true;

  return MutationLock.run(ticketsPath(paths), () => {
    let tickets: LocatedTicket[];
    try {
      tickets = findAllTickets(paths);
    } catch (caught) {
      const failure = toFailure(caught);
      return error(failure.message, failure.exitCode);
    }

    // Paso 1: validar la colección completa antes de tocar el disco.
    const invalid: string[] = [];
    for (const ticket of tickets) {
      const failure = validationError(ticket);
      if (failure !== undefined) {
        invalid.push(`${ticket.relativePath}: ${failure.message}`);
      }
    }
    if (invalid.length > 0) {
      return error(
        `Se encontraron ${invalid.length} ticket(s) inválidos; no se migró nada: ` +
          invalid.join("; "),
      );
    }

    // Paso 2: planificar. Nada se escribe todavía.
    const outcomes: MigrationOutcome[] = [];
    const kindsSeen = new Set<string>();
    for (const ticket of tickets) {
      const { text, plan } = migrateTicketText(ticket.text, referenceDate, {
        expectedId: ticket.id,
      });
      for (const kind of plan.nonCanonicalEvidenceKinds) kindsSeen.add(kind);
      outcomes.push({
        id: ticket.id,
        relativePath: ticket.relativePath,
        migrated: plan.needed,
        reason: plan.reason,
        text,
      });
    }

    const pending = outcomes.filter((outcome) => outcome.migrated);

    // Paso 3: escribir solo si se pidió y hay algo que hacer.
    if (!dryRun) {
      for (const outcome of pending) {
        atomicWrite(join(paths.root, outcome.relativePath), outcome.text);
      }
      if (pending.length > 0) {
        atomicWrite(indexPath(paths), renderIndex(paths, findAllTickets(paths)));
      }
    }

    const lines: string[] = [
      dryRun ? "Migración (simulación)" : "Migración",
      `  tickets revisados:  ${outcomes.length}`,
      `  ${dryRun ? "a migrar:" : "tickets migrados:"}${" ".repeat(dryRun ? 11 : 3)}${pending.length}`,
      `  ya en el esquema:   ${outcomes.length - pending.length}`,
    ];

    if (kindsSeen.size > 0) {
      lines.push(
        "",
        `  Tipos de evidencia fuera del enum canónico: ${kindsSeen.size}`,
        `    ${[...kindsSeen].sort().join(", ")}`,
        "    No se reescriben: el ticket conserva su valor original y la",
        "    normalización se aplica al agregar. Ver LEGACY_EVIDENCE_KINDS.",
      );
    }

    if (pending.length > 0) {
      lines.push("", "  Detalle:");
      for (const outcome of pending) {
        lines.push(`    ${outcome.id}  (${outcome.reason})`);
      }
    }

    // El routing se revisa siempre, incluso cuando no hay un solo ticket que
    // migrar: el vocabulario de roles es otra cosa que también envejece, y una
    // clave retirada ahí detiene las compuertas del proyecto entero.
    const routing = migrateRouting(paths.root, dryRun);

    if (routing.retirados.length > 0) {
      lines.push(
        "",
        `  Roles retirados en .valmen/routing.yaml: ${routing.retirados.length}`,
        `    ${routing.retirados.join(", ")}`,
        routing.escrito
          ? "    El archivo se reescribió sin ellos."
          : "    Sin escribir todavía: quedan fuera cuando se aplique la migración.",
      );
    }

    if (dryRun && (pending.length > 0 || routing.retirados.length > 0)) {
      lines.push("", "  Ejecute sin --dry-run para aplicarlo.");
    }

    return ok(lines.join("\n") + "\n");
  });
}

export { SCHEMA_VERSION };

/**
 * `sync`: proyecta `.valmen/` a los archivos que leen los agentes.
 *
 * El valor está en la **fuente única**: `AGENTS.md` deja de ser un archivo que
 * alguien edita a mano y pasa a ser una proyección. Cuando el harness evoluciona
 * —una regla nueva, un estado nuevo— el documento mejora sin que el proyecto
 * toque nada.
 *
 * Con `--check` no escribe: compara lo que hay en disco con lo que se generaría
 * y falla si difieren. Es el modo para integración continua, porque detecta una
 * edición a mano del archivo generado sin modificar el repositorio.
 */
export function syncProject(
  root: string,
  projectName: string,
  check: boolean,
): CommandResult {
  // La proyección se calcula con la misma función que usa Mission Control: si el
  // botón y el comando generaran archivos distintos, la comparación de frescura
  // daría un resultado distinto según quién la ejecute.
  let proyeccion: Projection;
  try {
    proyeccion = projectFiles(root, projectName);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }

  const { files: projected, byRuntime } = proyeccion;

  if (check) {
    const stale: string[] = [];
    for (const file of projected) {
      const onDisk = readIfExists(join(root, file.path));
      if (onDisk === null) stale.push(`${file.path} (falta)`);
      else if (onDisk !== file.content) stale.push(file.path);
    }

    if (stale.length > 0) {
      return error(
        `Hay ${stale.length} archivo(s) generados desactualizados o editados a mano; ` +
          `ejecute \`valmen sync\`: ${stale.join(", ")}`,
      );
    }
    return ok("Archivos generados al día.\n");
  }

  for (const file of projected) {
    atomicWrite(join(root, file.path), file.content);
  }

  const lines = [
    "Sincronización",
    `  AGENTS.md                (${proyeccion.ruleCount} archivo(s) de reglas del proyecto)`,
  ];

  if (proyeccion.agentCount > 0) {
    lines.push(`  agentes proyectados      ${proyeccion.agentCount}`);
  } else {
    lines.push(
      "  agentes                  ninguno",
      "    Añada definiciones en .valmen/agents/<id>.md para proyectarlas.",
    );
  }

  if (proyeccion.skillCount > 0) {
    lines.push(`  skills proyectadas       ${proyeccion.skillCount}`);
  } else {
    lines.push(
      "  skills                   ninguna",
      "    Añada definiciones en .valmen/skills/<id>/SKILL.md para proyectarlas.",
    );
  }

  lines.push(
    `    .codex/                ${byRuntime.codex} archivo(s)`,
    `    .opencode/             ${byRuntime.opencode} archivo(s)`,
    `    .claude/               ${byRuntime.claude} archivo(s)`,
  );

  if (proyeccion.ruleCount === 0) {
    lines.push("  Añada reglas en .valmen/rules/ para que se incluyan en AGENTS.md.");
  }

  return ok(lines.join("\n") + "\n");
}

/**
 * `adopt`: incorpora el harness a un proyecto que ya existe.
 *
 * Regla dura: **nada se borra y nada se mueve sin que el usuario lo vea**. La
 * adopción crea `.valmen/` y reporta lo que encuentra; todo lo demás queda
 * intacto.
 *
 * No llama a ningún modelo. El perfil del proyecto se deriva de los manifiestos
 * y de la estructura de directorios, porque es información que el código puede
 * leer con exactitud. Clasificar reglas en prosa es un paso posterior y
 * explícito del usuario.
 *
 * Con `--dry-run` informa sin escribir.
 */
/**
 * `template`: las plantillas por stack disponibles.
 *
 * Existe porque a una plantilla que no se sabe que existe no se le puede pedir
 * nada. `list` las enumera, `show` imprime el contenido —**se lee antes de
 * aplicarse**: aplicar reglas a ciegas no es más rápido, es aplicar reglas a
 * ciegas— y `apply` las escribe.
 */
export function templateCommand(
  root: string,
  verbo: string,
  nombre: string | undefined,
  options: { dryRun?: boolean } = {},
): CommandResult {
  const directorio = blueprintsDir();
  if (directorio === null) {
    return error(
      "No se encontraron las plantillas del harness. Se buscan en `templates/` de " +
        "la instalación, junto a `packages/`.",
      EXIT_SCHEMA,
    );
  }

  if (verbo === "list" || verbo === "") {
    const plantillas = listBlueprints(directorio);
    if (plantillas.length === 0) return ok("No hay plantillas instaladas.\n");
    return ok(
      [
        `Plantillas disponibles — ${plantillas.length}`,
        "",
        ...plantillas.flatMap((plantilla) => [
          `  ${plantilla.name}`,
          `    ${plantilla.title}`,
          `    ${plantilla.description}`,
          `    Aplíquela con: valmen template apply ${plantilla.name}`,
          "",
        ]),
      ].join("\n"),
    );
  }

  if (nombre === undefined || nombre === "") {
    return error(`template ${verbo} requiere el nombre de una plantilla.`, EXIT_SCHEMA);
  }

  let plantilla;
  try {
    plantilla = readBlueprint(directorio, nombre);
  } catch {
    return error(
      `No existe la plantilla "${nombre}". Las que hay: ` +
        `${
          listBlueprints(directorio)
            .map((candidata) => candidata.name)
            .join(", ") || "(ninguna)"
        }.`,
      EXIT_SCHEMA,
    );
  }

  if (verbo === "show") {
    const lineas = [
      `Plantilla ${plantilla.name} — ${plantilla.title}`,
      "",
      plantilla.description,
      "",
      `Detecta: ${plantilla.detects.join(", ") || "(nada en particular)"}`,
      `Escribe: ${plantilla.files.map((archivo) => `.valmen/${archivo.path}`).join(", ")}`,
      "",
    ];
    for (const archivo of plantilla.files) {
      lineas.push(
        `── .valmen/${archivo.path} ${"─".repeat(Math.max(0, 50 - archivo.path.length))}`,
      );
      lineas.push(archivo.content.trimEnd());
      lineas.push("");
    }
    if (plantilla.configFragment !== null) {
      lineas.push("── configuración que aporta ──────────────────────────────");
      lineas.push(plantilla.configFragment.trimEnd());
      lineas.push("");
    }
    return ok(lineas.join("\n"));
  }

  if (verbo === "apply") {
    const resultado = applyBlueprint(root, plantilla, options);
    return ok(renderBlueprintOutcome(plantilla, resultado, options.dryRun === true));
  }

  return error(`template no conoce el verbo "${verbo}".`, EXIT_SCHEMA);
}

export function adoptProject(
  root: string,
  projectName: string,
  options: { dryRun?: boolean } = {},
): CommandResult {
  const dryRun = options.dryRun === true;

  let profile;
  try {
    profile = profileProject(root, projectName);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }

  const ticketsDir = chooseTicketsDir(root);
  const plan = adoptPlan(root);
  const config = proposeConfig(profile, ticketsDir);
  const alreadyAdopted = existsSync(plan.configPath);

  const lines: string[] = [
    dryRun ? "Adopción (simulación)" : "Adopción",
    "",
    "Perfil del proyecto",
    `  nombre            ${profile.name}`,
    `  registro          ${ticketsDir}`,
  ];

  if (profile.detectedFiles.length > 0) {
    lines.push("", `  Manifiestos detectados (${profile.detectedFiles.length}):`);
    for (const file of profile.detectedFiles) {
      lines.push(`    ${file.path}  — ${file.kind}`);
    }
  }

  if (profile.dependencies.length > 0) {
    lines.push("", `  Dependencias clave (${profile.dependencies.length}):`);
    for (const dependency of profile.dependencies.slice(0, 12)) {
      lines.push(`    ${dependency.name} ${dependency.version}`);
    }
    if (profile.dependencies.length > 12) {
      lines.push(`    … y ${profile.dependencies.length - 12} más`);
    }
  }

  if (profile.capabilities.length > 0) {
    lines.push("", `  Capacidades: ${profile.capabilities.join(", ")}`);
  }

  if (profile.legacyConfigs.length > 0) {
    lines.push("", "Configuración agéntica preexistente (NO se toca):");
    for (const legacy of profile.legacyConfigs) {
      const note = legacy.selfDeclaredLegacy ? "  [ya marcada como legado]" : "";
      lines.push(`    ${legacy.path}  — ${legacy.kind}${note}`);
    }
    lines.push(
      "",
      "  La adopción no borra ni reordena nada de esto. Si alguna de sus reglas",
      "  describe el dominio del proyecto, cópiela a .valmen/rules/ y quedará",
      "  incluida en AGENTS.md.",
    );
  }

  // Una plantilla que no se sabe que existe no se usa. Se sugiere por lo que el
  // proyecto tiene en disco, y no se aplica sola: escribir reglas que nadie pidió
  // es exactamente lo que el harness no hace.
  const directorio = blueprintsDir();
  const sugeridas =
    directorio === null
      ? []
      : listBlueprints(directorio).filter((plantilla) =>
          plantilla.detects.some((manifiesto) => existsSync(join(root, manifiesto))),
        );

  if (sugeridas.length > 0) {
    lines.push("", "Plantillas que le sirven a este stack:");
    for (const plantilla of sugeridas) {
      lines.push(
        `  ${plantilla.name} — ${plantilla.title}`,
        `    valmen template show ${plantilla.name}   (leerla antes de aplicarla)`,
        `    valmen template apply ${plantilla.name}`,
      );
    }
  }

  lines.push("", "Se creará:", `  ${relative(root, plan.configPath)}`);

  if (alreadyAdopted) {
    lines.push(
      "",
      "  Ya existe una configuración. La adopción NO la sobrescribe:",
      "  revise el contenido propuesto y fusiónelo a mano si le sirve.",
      "",
      "Configuración propuesta (extracto):",
      ...config
        .split("\n")
        .slice(0, 12)
        .map((line) => `  ${line}`),
    );
    return ok(lines.join("\n") + "\n");
  }

  if (dryRun) {
    lines.push(
      "",
      "Configuración propuesta:",
      ...config.split("\n").map((line) => `  ${line}`),
      "",
      "  Ejecute sin --dry-run para aplicarlo.",
    );
    return ok(lines.join("\n") + "\n");
  }

  atomicWrite(plan.configPath, config);
  mkdirSync(plan.rulesDir, { recursive: true });
  mkdirSync(join(root, ".valmen", "agents"), { recursive: true });

  lines.push(
    `  ${relative(root, plan.rulesDir)}/`,
    `  .valmen/agents/`,
    "",
    "Reglas y agentes del proyecto",
    "  El harness no puede separar por sí solo lo que es regla de dominio de lo",
    "  que es flujo de trabajo. Cree archivos en .valmen/rules/ con lo que",
    "  describa ESTE sistema —stack, invariantes de negocio, políticas— y",
    "  definiciones en .valmen/agents/ para sus agentes.",
    "  Después, `valmen sync` los proyecta a AGENTS.md y a cada runtime.",
  );

  if (existsSync(plan.agentsPath)) {
    lines.push(
      "",
      "  Existe un AGENTS.md previo. `valmen sync` lo reemplazará por el generado,",
      "  así que conserve su contenido en .valmen/rules/ antes de sincronizar.",
    );
  }

  return ok(lines.join("\n") + "\n");
}

/**
 * `report`: el reporte Markdown de tickets cerrados.
 *
 * Es lo único del visor de Python que Mission Control no cubría, y no es
 * cosmético: la pantalla muestra una lista, y el reporte es lo que se pega en un
 * correo. Se escribe en stdout y no en un archivo a propósito: quien lo quiere
 * guardar redirige, y así el comando no decide por nadie dónde va.
 *
 * El rango por defecto son los últimos treinta días, como el visor. Las fechas
 * son **de cierre**, no de creación ni de última edición: el informe agrupa por
 * cuándo se terminó el trabajo.
 */
export function reportClosed(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
  now: Date = new Date(),
): CommandResult {
  try {
    const porDefecto = defaultReportRange(now);
    const rawDesde = flags["desde"];
    const rawHasta = flags["hasta"];
    const desde =
      typeof rawDesde === "string"
        ? parseReportDate(rawDesde, "--desde")
        : porDefecto.desde;
    const hasta =
      typeof rawHasta === "string"
        ? parseReportDate(rawHasta, "--hasta")
        : porDefecto.hasta;

    if (desde > hasta) {
      return error("--desde no puede ser posterior a --hasta.", EXIT_SCHEMA);
    }

    const rawType = flags["type"];
    const rawQuery = flags["q"];
    const entradas = filterReport(closedTickets(paths), {
      desde,
      hasta,
      ...(typeof rawType === "string" && rawType !== "" ? { type: rawType } : {}),
      ...(typeof rawQuery === "string" && rawQuery !== "" ? { query: rawQuery } : {}),
    });

    return ok(renderReport(entradas, desde, hasta));
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `deliver-manifest`: el manifiesto de entrega de una versión.
 *
 * La parte genérica de lo que hacía `release_notes.py`: qué versión, cuándo y qué
 * cambios, con el resumen funcional de cada cierre. **No escribe el artefacto del
 * proyecto** —el JSON del menú, el changelog, lo que sea—: eso lo declara el
 * proyecto como proceso, porque la presentación de un cliente no pertenece al
 * harness. Ver `docs/02-MOTOR.md` §7 y la decisión 4 del inventario.
 */
export function deliverManifest(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
  now: Date = new Date(),
): CommandResult {
  const rawVersion = flags["version"];
  const rawTickets = flags["tickets"];
  if (typeof rawVersion !== "string") {
    return error("deliver-manifest requiere --version.", EXIT_SCHEMA);
  }
  if (typeof rawTickets !== "string") {
    return error(
      "deliver-manifest requiere --tickets con la lista explícita.",
      EXIT_SCHEMA,
    );
  }

  try {
    const rawFecha = flags["released-at"];
    const releasedAt =
      typeof rawFecha === "string" ? rawFecha : now.toISOString().slice(0, 10);

    const resultado = buildManifest({
      paths,
      version: rawVersion,
      tickets: parseTicketList(rawTickets),
      releasedAt,
      write: flags["dry-run"] !== true,
    });
    return ok(renderManifest(resultado));
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `process list`: los procesos declarados por el proyecto.
 *
 * Un proceso que no se puede leer **se lista con su error**, igual que un ticket
 * o una feature: un archivo con un error de tipeo que desaparece de la lista hace
 * creer que el proceso no existe, y entonces alguien lo escribe otra vez.
 */
/**
 * `memory`: la memoria del proyecto —lo ya decidido y lo ya fallado—.
 *
 * Tres verbos y ninguno mueve un archivo: `search` consulta, `save` anexa un
 * aprendizaje al archivo del harness, y `list` dice qué se está indexando. Los
 * documentos del proyecto se leen donde están.
 */
export function memoryCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
  verbo: string,
): CommandResult {
  try {
    if (verbo === "search") {
      const consulta = flags["_"];
      if (typeof consulta !== "string" || consulta.trim() === "") {
        return error("memory search requiere una consulta.", EXIT_SCHEMA);
      }
      const bruto = flags["limite"];
      const limite = typeof bruto === "string" ? Number.parseInt(bruto, 10) : 5;
      return ok(renderHits(searchMemory(loadMemory(paths), consulta, limite), consulta));
    }

    if (verbo === "save") {
      const title = flags["title"];
      const body = flags["body"];
      if (typeof title !== "string" || title.trim() === "") {
        return error("memory save requiere --title.", EXIT_SCHEMA);
      }
      if (typeof body !== "string" || body.trim() === "") {
        return error("memory save requiere --body.", EXIT_SCHEMA);
      }
      const crudos = flags["tickets"];
      const tickets =
        typeof crudos === "string"
          ? crudos
              .split(",")
              .map((id) => id.trim())
              .filter((id) => id !== "")
          : [];
      const guardado = saveLearning(paths, { title, body, tickets });
      return ok(`Aprendizaje guardado: ${guardado.id} en ${guardado.path}\n`);
    }

    if (verbo === "list") {
      const archivos = memoryFiles(paths.root);
      const entradas = loadMemory(paths);
      const porTipo = new Map<string, number>();
      for (const entrada of entradas) {
        porTipo.set(entrada.kind, (porTipo.get(entrada.kind) ?? 0) + 1);
      }
      if (archivos.length === 0) {
        return ok(
          "La memoria está vacía: declare `memory-sources` en `.valmen/config.yaml` " +
            "con los documentos del proyecto, o guarde un aprendizaje.\n",
        );
      }
      return ok(
        `Memoria del proyecto — ${entradas.length} entrada(s)\n\n` +
          archivos.map((archivo) => `  ${archivo}`).join("\n") +
          "\n\n" +
          [...porTipo.entries()]
            .sort()
            .map(([tipo, cuantas]) => `  ${tipo.padEnd(14)} ${cuantas}`)
            .join("\n") +
          "\n",
      );
    }

    return error(`memory no conoce el verbo "${verbo}".`, EXIT_SCHEMA);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `estandar`: las reglas del proyecto y las que están por aprobar.
 *
 * Un estándar que se puede agregar sin abrir un editor de texto es un estándar que
 * se agrega. El agente propone con su motivo y sus tickets; aceptar lo pone en
 * vigor —lo escribe en `.valmen/rules/estandares-<área>.md`, que es lo que llega al
 * `AGENTS.md`— y descartar lo deja escrito con su porqué.
 */
export function standardsCommand(
  paths: RegistryPaths,
  verbo: string,
  id: string | undefined,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const texto = (nombre: string): string =>
    typeof flags[nombre] === "string" ? (flags[nombre] as string).trim() : "";

  try {
    if (verbo === "listar" || verbo === "") {
      const archivos = standardsFiles(paths.root);
      const propuestas = listProposals(paths);
      const lineas = [
        `Estándares en vigor — ${archivos.length} archivo(s)`,
        "",
        ...(archivos.length === 0
          ? [
              "  (ninguno todavía)",
              "",
              "  Se escriben en .valmen/rules/estandares-<área>.md y entran al AGENTS.md",
              "  en el próximo `valmen sync`.",
            ]
          : archivos.map(
              // El área y el archivo, no el archivo dos veces: la primera versión
              // componía `.valmen/rules/<área>.md` —sin el prefijo `estandares-`—
              // y lo imprimía al lado de la ruta real, que dice otra cosa.
              (archivo) => `  ${archivo.area.padEnd(14)} →  ${archivo.path}`,
            )),
        "",
        renderProposals(propuestas).trimEnd(),
      ];
      return ok(`${lineas.join("\n")}\n`);
    }

    if (verbo === "proponer") {
      const area = texto("area");
      if (!AREAS.includes(area as (typeof AREAS)[number])) {
        return error(
          `--area debe ser una de: ${AREAS.join(", ")}. Llegó "${area}".`,
          EXIT_SCHEMA,
        );
      }
      const tickets = texto("tickets");
      const propuesta = proposeStandard(paths, {
        title: texto("title"),
        rule: texto("rule"),
        why: texto("why"),
        area: area as (typeof AREAS)[number],
        tickets:
          tickets === ""
            ? []
            : tickets
                .split(",")
                .map((uno) => uno.trim())
                .filter((uno) => uno !== ""),
      });
      return ok(
        `Estándar propuesto: ${propuesta.id} (${propuesta.area})\n` +
          "  Queda pendiente de aprobación: no está en vigor hasta que se acepte.\n",
      );
    }

    if (verbo === "aceptar" || verbo === "descartar") {
      const decision = verbo === "aceptar" ? "aceptado" : "descartado";

      // Las palabras de quien lo decidió. Aceptar **pone una regla en vigor**, y
      // eso no lo decide un agente: la regla que vale para el plan vale para el
      // estándar. Un agente que no tenga la frase pide la decisión; no la escribe
      // él. El motor no la exige —la pantalla no tiene frase que citar—, pero la
      // puerta por la que habla un agente sí.
      const instruccion = texto("instruccion");
      if (instruccion === "") {
        return error(
          `estandar ${verbo} exige --instruccion con las palabras de quien lo decidió.\n` +
            `  Aceptar un estándar lo pone en vigor y descartarlo lo saca de la cola:\n` +
            `  las dos son decisiones de la persona. Si no tenés su frase, pedila.\n` +
            `  Ejemplo: valmen estandar ${verbo} ${id === undefined || id === "" ? "pendientes" : id} ` +
            `--instruccion "aceptá las que propusiste"`,
          EXIT_SCHEMA,
        );
      }

      // `pendientes` aplica a todas: una persona que dice «aceptalos» está
      // decidiendo sobre el conjunto, y obligarla a repetir la frase por cada
      // identificador sería fabricar trabajo para que el registro quede igual.
      const objetivo = (id ?? "").toUpperCase();
      const ids =
        objetivo === "PENDIENTES" || objetivo === "TODOS"
          ? listProposals(paths)
              .filter((propuesta) => propuesta.state === "propuesto")
              .map((propuesta) => propuesta.id)
          : [objetivo];

      if (ids.length === 0) {
        return ok(`No hay estándares pendientes: nada que ${verbo}.\n`);
      }

      const lineas: string[] = [];
      for (const uno of ids) {
        const resultado = decideProposal(paths, uno, decision, { instruccion });
        lineas.push(
          resultado.writtenTo === null
            ? `${uno} descartado. Queda escrito en las propuestas con su estado.`
            : `${uno} aceptado: la regla quedó en ${resultado.writtenTo}`,
        );
      }

      if (ids.length > 1) {
        // El participio, no el verbo: `aceptars` no es una palabra, y la primera
        // versión de esta línea la escribía así.
        lineas.unshift(
          `${ids.length} estándares ${decision === "aceptado" ? "aceptados" : "descartados"}:`,
        );
      }
      if (decision === "aceptado") {
        lineas.push(
          "",
          "  Ejecute `valmen sync` para que entren al AGENTS.md del proyecto.",
        );
      }
      lineas.push(`  Decisión registrada con la frase: «${instruccion}»`);
      return ok(`${lineas.join("\n")}\n`);
    }

    if (verbo === "revisar") {
      const revision = scanPendingColors(paths.root, flags["staged"] === true);
      const limite = texto("limite");
      const cuantos = limite === "" ? Number.NaN : Number.parseInt(limite, 10);
      return ok(
        renderColorReport(
          revision,
          Number.isFinite(cuantos) && cuantos > 0 ? { limite: cuantos } : {},
        ),
      );
    }

    return error(`estandar no conoce el verbo "${verbo}".`, EXIT_SCHEMA);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `memory review` y `memory clasificar`: la cola de aprendizajes.
 *
 * La memoria tenía entrada y no tenía salida: el agente guardaba lo que aprendía
 * y nadie decidía qué era. Sin eso, el conocimiento se acumula sin criterio y la
 * búsqueda devuelve lo mismo que una nota suelta.
 *
 * Clasificar es triaje —y por eso lo puede hacer un agente—: `regla` crea una
 * propuesta de estándar que una persona decide después, y no escribe ninguna
 * regla en vigor.
 */
export function learningsCommand(
  paths: RegistryPaths,
  verbo: string,
  id: string | undefined,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  try {
    if (verbo === "" || verbo === "review" || verbo === "pendientes") {
      return ok(renderLearnings(listLearnings(paths)));
    }

    if (verbo === "clasificar" || verbo === "clasifica") {
      if (id === undefined || id === "") {
        return error(
          "memory clasificar requiere el identificador: AP-001. Vea los pendientes con `valmen memory review`.",
          EXIT_SCHEMA,
        );
      }
      const decision = flags["decision"];
      if (
        typeof decision !== "string" ||
        !DECISIONES_APRENDIZAJE.includes(
          decision as (typeof DECISIONES_APRENDIZAJE)[number],
        )
      ) {
        return error(
          `--decision debe ser una de: ${DECISIONES_APRENDIZAJE.join(", ")}.`,
          EXIT_SCHEMA,
        );
      }
      const area = flags["area"];
      const resultado = classifyLearning(
        paths,
        id.toUpperCase(),
        decision as (typeof DECISIONES_APRENDIZAJE)[number],
        typeof area === "string" ? { area: area as (typeof AREAS)[number] } : {},
      );

      if (resultado.propuestaId === null) {
        return ok(
          `${id.toUpperCase()} → ${resultado.aprendizaje.state}. ` +
            "Queda escrito en .valmen/memory/aprendizajes.md con su clasificación.\n",
        );
      }
      return ok(
        `${id.toUpperCase()} → regla. Se creó la propuesta ${resultado.propuestaId}, que ` +
          "todavía **no está en vigor**: la decide una persona.\n" +
          "  · Aceptarla: `valmen estandar aceptar " +
          `${resultado.propuestaId} --instruccion "<sus palabras>"\`\n`,
      );
    }

    return error(`memory no conoce el verbo "${verbo}".`, EXIT_SCHEMA);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `drift`: lo que los tickets dicen del código, contra el código.
 *
 * Es un chequeo de lectura y no bloquea: un plan que cita un archivo que no existe
 * se corrige en una línea, y quien decide si eso importa es quien lo va a
 * implementar. `--strict` existe para el caso en que sí se quiera frenar —una
 * compuerta de CI, una entrega— y sale con el código de bloqueo.
 */
export function driftCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const id = flags["id"];
  try {
    const informe = scanDrift(paths, {
      ...(typeof id === "string" ? { ticketId: id } : {}),
      ...(flags["todos"] === true ? { todos: true } : {}),
    });
    const texto = renderDrift(informe);
    if (flags["strict"] === true && informe.findings.length > 0) {
      // El mismo código que usa una compuerta que bloquea: 3 no es «falló», es
      // «hay algo que impide seguir», y es lo que un `--strict` quiere decir.
      return { stdout: texto, stderr: "", exitCode: EXIT_INVARIANT };
    }
    return ok(texto);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `usage value`: el consumo del harness, ticket por ticket.
 *
 * El agregado dice cuánto se gastó; esto dice en qué, y con qué resultado. Es la
 * mitad que responde «¿esto está sirviendo?» sin abrir un tablero: la tabla
 * ordenada por coste pone arriba el ticket que hay que mirar, y las vueltas atrás
 * dicen si el problema fue el análisis o la ejecución.
 */
export function valueCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const desde = flags["desde"];
  const hasta = flags["hasta"];
  const limite = flags["limite"];

  try {
    const informe = ticketValueReport(paths, {
      ...(typeof desde === "string" ? { desde } : {}),
      ...(typeof hasta === "string" ? { hasta } : {}),
    });
    const cuantos = typeof limite === "string" ? Number.parseInt(limite, 10) : Number.NaN;
    return ok(
      renderValue(
        informe,
        Number.isFinite(cuantos) && cuantos > 0 ? { limite: cuantos } : {},
      ),
    );
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * Guarda el consumo de las sesiones que trabajaron un ticket.
 *
 * Es la mitad automática de la línea de tiempo: la pantalla la muestra en vivo y
 * el ticket tiene que poder auditarse meses después, cuando la contabilidad del
 * cliente ya no esté. El disparador natural es el cierre, y por eso esto se llama
 * desde ahí —en el CLI, en Mission Control y en el MCP— en vez de depender de que
 * alguien pulse un botón.
 *
 * Devuelve el resumen de lo guardado, o `null` si no había nada que guardar: un
 * ticket que se trabajó a mano no tiene sesiones, y eso no es un fallo.
 *
 * Vive en el CLI —y no en cada puerta— porque las tres ya dependen de él: una
 * implementación por puerta sería tres formas de guardar lo mismo.
 */
export function guardarConsumoDeSesiones(
  paths: RegistryPaths,
  ticketId: string,
  options: { readonly home?: string; readonly now?: () => Date } = {},
): string | null {
  const guardado = guardarFotoEnTicket(paths, ticketId, options);
  return guardado === null ? null : guardado.detalle;
}

/**
 * `usage`: el consumo del harness, contado de sus propios recibos.
 *
 * No mide nada nuevo: junta lo que cada evaluación ya escribió —veredicto, coste,
 * modelo, latencia— y lo cuenta. Lo que agrega es la única cifra que dice si el
 * harness está cumpliendo lo que promete: **cuánto decidió el código y cuánto un
 * modelo**.
 */
export function usageCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const desde = flags["desde"];
  const hasta = flags["hasta"];

  try {
    const informe = usageReport(paths, {
      ...(typeof desde === "string" ? { desde } : {}),
      ...(typeof hasta === "string" ? { hasta } : {}),
    });
    return ok(renderUsage(informe));
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `secrets`: revisa los cambios pendientes en busca de secretos.
 *
 * Existe porque un secreto commiteado no se descommitea: queda en el historial
 * aunque el commit siguiente lo borre. El reporte sale por **stdout** con código
 * distinto de cero —igual que una compuerta bloqueada— porque un hallazgo es un
 * resultado que hay que leer, no un fallo del harness.
 *
 * La salida no repite nunca el valor encontrado: lo ubica por archivo, línea y
 * tipo, y lo tapa. Un detector que imprime el secreto lo multiplica.
 */
export function scanPendingSecretsCommand(
  root: string,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const staged = flags["staged"] === true;

  try {
    const { findings, scanned } = scanPendingChanges(root, staged);

    if (findings.length === 0) {
      return ok(`Sin secretos en ${scanned} archivo(s) con cambios.\n`);
    }

    const lineas = findings.map(
      (hallazgo) =>
        `  ${hallazgo.path}:${hallazgo.line}  ${hallazgo.kind}\n` +
        `    ${hallazgo.description}\n` +
        `    ${hallazgo.preview}`,
    );

    return {
      stdout:
        `${findings.length} hallazgo(s) en ${scanned} archivo(s) con cambios:\n\n` +
        lineas.join("\n") +
        "\n\nSi el hallazgo es legítimo —una prueba, un ejemplo, un formato— marque la " +
        "línea con `valmen:allow-secret`. Si no lo es, quítelo antes de commitear: en el " +
        "historial se queda.\n",
      stderr: "",
      exitCode: EXIT_INVARIANT,
    };
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

export function listProcesses(root: string): CommandResult {
  const cargados = loadProcesses(root);
  if (cargados.length === 0) {
    return ok("No hay procesos declarados. Viven en .valmen/processes/<id>.yaml\n");
  }

  const ancho = Math.max(...cargados.map((c) => c.definition.id.length), 2);
  const lineas = cargados.map((cargado) => {
    if (cargado.invalid !== null) {
      return `${cargado.definition.id.padEnd(ancho)} | inválido | ${cargado.invalid}`;
    }
    const { definition } = cargado;
    const params = definition.params.map((param) => param.name).join(", ");
    return (
      `${definition.id.padEnd(ancho)} | ${definition.steps.length} paso(s) | ` +
      `${definition.title}${params === "" ? "" : `  [${params}]`}`
    );
  });
  return ok(lineas.join("\n") + "\n");
}

/** `process show`: los pasos de un proceso, con lo que hace cada uno. */
export function showProcess(root: string, id: string | undefined): CommandResult {
  if (id === undefined) {
    return error("process show requiere un identificador.", EXIT_SCHEMA);
  }

  let cargado;
  try {
    cargado = requireProcess(root, id);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }

  const { definition, path } = cargado;
  const lineas = [
    `${definition.id} — ${definition.title}`,
    ...(definition.description === "" ? [] : [definition.description]),
    `archivo: ${path}`,
  ];

  if (definition.params.length > 0) {
    lineas.push("", "Parámetros:");
    for (const param of definition.params) {
      const obligatorio = param.required ? "obligatorio" : "opcional";
      const extra = [
        param.pattern === null ? null : `patrón ${param.pattern}`,
        param.default === null ? null : `por defecto ${param.default}`,
      ].filter((parte): parte is string => parte !== null);
      lineas.push(
        `  ${param.name} (${param.type}, ${obligatorio})` +
          (extra.length === 0 ? "" : ` — ${extra.join(" · ")}`),
      );
    }
  }

  lineas.push("", "Pasos:");
  for (const paso of definition.steps) {
    lineas.push(`  ${paso.id} — ${paso.title}  [${paso.kind}]`);
    if (paso.run !== null) lineas.push(`      ${paso.run}`);
    if (paso.target !== null) lineas.push(`      → ${paso.target}`);
    if (paso.when !== null) lineas.push(`      solo si ${paso.when}`);
    if (paso.continueOnFailure) {
      lineas.push("      un fallo aquí no detiene el proceso");
    }
  }

  if (definition.produces.length > 0) {
    lineas.push("", `Produce: ${definition.produces.join(", ")}`);
  }
  if (definition.onSuccess.length > 0) {
    lineas.push(`Al terminar bien: ${definition.onSuccess.join(", ")}`);
  }

  return ok(lineas.join("\n") + "\n");
}

/**
 * Las banderas que son del comando y no del proceso.
 *
 * `--set` es la forma sin colisión; las demás son del CLI y llegarían aquí
 * heredadas. Todo lo que no esté en esta lista tiene que ser un parámetro que el
 * proceso declare, o se rechaza: una bandera aceptada y descartada en silencio es
 * exactamente lo que hace que un proceso publique lo que no era.
 */
const BANDERAS_PROPIAS = new Set([
  "set",
  "root",
  "tickets-dir",
  "legacy-layout",
  "help",
  "dry-run",
  "skip-gates",
  "actor",
  "reason",
  "run",
]);

/**
 * `process run`: ejecuta un proceso.
 *
 * Los parámetros llegan como `--param nombre=valor` o `--nombre valor`. La
 * segunda forma es la cómoda y la que se escribe en la terminal; la primera
 * existe porque un proceso puede declarar un parámetro que choque con una bandera
 * del CLI —`--version` es la queja obvia— y sin una forma sin colisión ese proceso
 * sería inejecutable.
 *
 * Los pasos se imprimen **mientras corren**, no al final: un proceso que actualiza
 * manuales tarda minutos, y no ver nada durante ese rato hace pensar que se colgó.
 */
export function runProcessCommand(
  root: string,
  id: string | undefined,
  flags: Readonly<Record<string, string | true>>,
  /**
   * Dónde va el avance de cada paso.
   *
   * Es un parámetro y no un `process.stdout.write` fijo porque hay dos clases de
   * quien llama: una persona que mira la terminal —donde el avance se ve al
   * vuelo y no sirve para nada al final— y un cliente de protocolo, donde stdout
   * **es** el canal de mensajes y un renglón suelto entre dos respuestas JSON-RPC
   * rompe la sesión de una forma que después nadie sabe explicar.
   */
  avance: (linea: string) => void = (linea) => process.stdout.write(linea),
): CommandResult {
  if (id === undefined) {
    return error("process run requiere un identificador.", EXIT_SCHEMA);
  }

  const params: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(flags)) {
    // `--set nombre=valor` es la forma sin colisión; el resto de banderas del CLI
    // se ignoran aquí y se recuperan abajo por nombre de parámetro.
    if (clave === "set") {
      // Se separa por `;` si lo hay, y si no por `,`. El `;` es el que hace falta
      // cuando el valor lleva comas —una lista de tickets, sin ir más lejos—:
      // partir siempre por coma convertiría `tickets=A,B` en un parámetro llamado
      // `B` sin valor, que es un error legítimo y a la vez imposible de adivinar
      // desde el mensaje.
      const crudo = String(valor);
      const trozos = crudo.includes(";") ? crudo.split(";") : crudo.split(",");
      for (const trozo of trozos) {
        if (trozo.trim() === "") continue;
        const igual = trozo.indexOf("=");
        if (igual <= 0) {
          return error(
            `--set espera nombre=valor, y llegó "${trozo}". ` +
              "Para un valor con comas, separa los parámetros con `;`: " +
              '--set "a=1;b=x,y".',
            EXIT_SCHEMA,
          );
        }
        params[trozo.slice(0, igual).trim()] = trozo.slice(igual + 1);
      }
    }
  }

  // Y los parámetros que el proceso declara, tomados de las banderas del CLI.
  let definicion;
  try {
    definicion = requireProcess(root, id).definition;
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }

  const declarados = new Set(definicion.params.map((param) => param.name));
  for (const param of definicion.params) {
    if (Object.hasOwn(params, param.name)) continue;
    const bruto = flags[param.name];
    if (typeof bruto === "string") params[param.name] = bruto;
  }

  // Y una bandera que no es del comando ni un parámetro del proceso se rechaza.
  // Aceptarla en silencio era el fallo clásico: `--veersión 1.2.3` con una tilde
  // de más arrancaba el proceso **sin** la versión, y como el proceso podía tener
  // un valor por defecto, seguía adelante y publicaba lo que no era.
  for (const clave of Object.keys(flags)) {
    if (BANDERAS_PROPIAS.has(clave)) continue;
    if (declarados.has(clave)) continue;
    return error(
      `El proceso "${id}" no declara el parámetro "--${clave}". Los suyos son: ` +
        `${[...declarados].sort().join(", ") || "(ninguno)"}.`,
      EXIT_SCHEMA,
    );
  }

  try {
    const corrida = runProcess({
      root,
      id,
      params,
      // `--skip-gates` saltea los gates sin aprobar. Es para ensayar un proceso
      // sin aprobaciones, y se declara explícitamente: un gate que se saltea en
      // silencio no es un gate.
      onGate: flags["skip-gates"] === true ? "skip" : "wait",
      // La salida se escribe al vuelo: el proceso puede tardar, y el resultado
      // final no sirve para saber por dónde va.
      onStep: (paso) => {
        const marca = paso.status === "ok" ? "✓" : paso.status === "failed" ? "✗" : "·";
        const extra =
          paso.status === "skipped"
            ? ` — ${paso.reason ?? "salteado"}`
            : paso.latencyMs > 0
              ? ` (${paso.latencyMs} ms)`
              : "";
        avance(`${marca} ${paso.id} — ${paso.title}${extra}\n`);
      },
    });

    // Un proceso detenido en un gate **no es un fallo**: es un proceso a medias a
    // propósito, y confundirlos haría que nadie supiera si hay algo que hacer.
    //
    // El informe sale por stdout y no por stderr, que es como lo hace una
    // compuerta bloqueada: es un resultado —«quedó esperando una decisión»— y no
    // un diagnóstico de lo que se rompió. La diferencia no es cosmética: quien
    // lee stdout lo recibe como resultado y quien lee stderr lo reporta como
    // error, y un proceso esperando no es un error del harness.
    if (corrida.waiting) {
      return {
        stdout:
          `El proceso "${id}" se detuvo esperando: ` +
          `${corrida.state?.reason ?? "un gate sin aprobar"}\n` +
          `Corrida: ${corrida.state?.runId ?? "(sin identificar)"}\n`,
        stderr: "",
        exitCode: EXIT_INVARIANT,
      };
    }

    if (!corrida.ok) {
      const fallidos = corrida.steps.filter((paso) => paso.status === "failed");
      const detalle = fallidos
        .map((paso) => {
          const salida = [paso.stdout.trim(), paso.stderr.trim()]
            .filter((parte) => parte !== "")
            .join("\n");
          return `✗ ${paso.id} (${paso.detail}) salió con ${paso.exitCode}\n${salida}`;
        })
        .join("\n");
      return {
        stdout: "",
        stderr:
          `El proceso "${id}" se detuvo en ${fallidos.map((paso) => paso.id).join(", ")}.\n` +
          detalle,
        exitCode: EXIT_INVARIANT,
      };
    }

    return ok(
      `Proceso ${corrida.id}: ${corrida.steps.length} paso(s) en ${corrida.durationMs} ms.\n`,
    );
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `process approve`: registra que un gate de proceso se aprobó.
 *
 * El responsable es obligatorio por la misma razón que en un gate de ticket:
 * aprobar sin nombre no es auditable. Y la aprobación **no** retoma el proceso:
 * son dos actos distintos —decidir y continuar—, y juntarlos haría que aprobar
 * tuviera efectos que quien aprueba no ve.
 */
export function approveProcessGate(
  root: string,
  gate: string | undefined,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  if (gate === undefined) {
    return error("process approve requiere el nombre del gate.", EXIT_SCHEMA);
  }
  try {
    const rawActor = flags["actor"];
    const rawReason = flags["reason"];
    const aprobacion = approveGate(
      root,
      gate,
      typeof rawActor === "string" ? rawActor : "",
      typeof rawReason === "string" ? rawReason : "",
    );
    return ok(
      `Gate "${gate}" aprobado por ${aprobacion.actor} el ${aprobacion.at}.\n` +
        "Los procesos detenidos en él se pueden retomar con: valmen process resume <corrida>\n",
    );
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/** `process runs`: las corridas del proyecto, con las detenidas primero. */
export function listProcessRuns(root: string): CommandResult {
  const corridas = listRuns(root);
  if (corridas.length === 0) {
    return ok("No hay corridas registradas.\n");
  }

  // Las detenidas primero: son las únicas sobre las que hay algo que hacer.
  const ordenadas = [
    ...corridas.filter((corrida) => corrida.status === "waiting"),
    ...corridas.filter((corrida) => corrida.status !== "waiting"),
  ];
  const lineas = ordenadas.map((corrida) => {
    const pendiente =
      corrida.pendingStep === null ? "" : ` · esperando en ${corrida.pendingStep}`;
    const hechos = corrida.steps.filter((paso) => paso.status === "ok").length;
    return (
      `${corrida.runId} | ${corrida.status} | ${corrida.processId} | ` +
      `${hechos}/${corrida.steps.length} paso(s)${pendiente}`
    );
  });
  return ok(lineas.join("\n") + "\n");
}

/** `process show-run`: el detalle de una corrida. */
export function showProcessRun(root: string, runId: string | undefined): CommandResult {
  if (runId === undefined) {
    return error("process show-run requiere el identificador de la corrida.", EXIT_SCHEMA);
  }
  const corrida = readRun(root, runId);
  if (corrida === null) {
    return error(`No existe la corrida "${runId}".`, EXIT_SCHEMA);
  }
  return ok(renderRun(corrida));
}

/**
 * `process resume`: retoma una corrida detenida.
 *
 * **No repite los pasos que ya constan**: sigue desde el pendiente. Es la
 * diferencia entre retomar un despliegue y volver a desplegarlo, y por eso el
 * estado se guarda antes de detenerse.
 */
export function resumeProcessRun(
  root: string,
  runId: string | undefined,
  flags: Readonly<Record<string, string | true>>,
  avance: (linea: string) => void = (linea) => process.stdout.write(linea),
): CommandResult {
  // Sin identificador se retoma la única detenida, y si hay varias se pide cuál:
  // elegir por alguien es cómo se retoma el proceso equivocado.
  let estado: ProcessRunState | null;
  if (runId === undefined) {
    const detenidas = waitingRuns(root);
    if (detenidas.length === 0) {
      // Se distingue «no hay ninguna» de «la que pediste no se retoma»: sin esta
      // comprobación, retomar una abandonada por su identificador daba un error
      // que hablaba de otra cosa.
      return error("No hay ninguna corrida detenida que retomar.", EXIT_SCHEMA);
    }
    if (detenidas.length > 1) {
      return error(
        `Hay ${detenidas.length} corridas detenidas (${detenidas
          .map((corrida) => corrida.runId)
          .join(", ")}); indica cuál con un identificador.`,
        EXIT_AMBIGUOUS,
      );
    }
    estado = detenidas[0] ?? null;
    if (estado === null) {
      return error("No hay ninguna corrida detenida que retomar.", EXIT_SCHEMA);
    }
  } else {
    estado = readRun(root, runId);
    if (estado === null) {
      return error(`No existe la corrida "${runId}".`, EXIT_SCHEMA);
    }
  }
  if (estado.status !== "waiting" && estado.status !== "failed") {
    return error(
      `La corrida "${estado.runId}" está en ${estado.status} y no se retoma.`,
      EXIT_INVARIANT,
    );
  }

  try {
    const corridaEjecutada = runProcess({
      root,
      id: estado.processId,
      params: estado.params,
      resume: estado,
      onGate: flags["skip-gates"] === true ? "skip" : "wait",
      onStep: (paso) => {
        const marca =
          paso.status === "ok"
            ? "✓"
            : paso.status === "failed"
              ? "✗"
              : paso.status === "waiting"
                ? "⏸"
                : "·";
        const extra =
          paso.status === "skipped" || paso.status === "waiting"
            ? ` — ${paso.reason ?? ""}`
            : paso.latencyMs > 0
              ? ` (${paso.latencyMs} ms)`
              : "";
        avance(`${marca} ${paso.id} — ${paso.title}${extra}\n`);
      },
    });

    if (corridaEjecutada.waiting) {
      return {
        stdout:
          `El proceso "${estado.processId}" volvió a detenerse: ` +
          `${corridaEjecutada.state?.reason ?? "esperando un gate"}\n`,
        stderr: "",
        exitCode: EXIT_INVARIANT,
      };
    }
    if (!corridaEjecutada.ok) {
      return error(`El proceso "${estado.processId}" se detuvo otra vez.`, EXIT_INVARIANT);
    }
    return ok(`Corrida ${estado.runId} terminada en ${corridaEjecutada.durationMs} ms.\n`);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/** `process abandon`: una corrida detenida deja de poder retomarse. */
export function abandonProcessRun(root: string, runId: string | undefined): CommandResult {
  if (runId === undefined) {
    return error("process abandon requiere el identificador de la corrida.", EXIT_SCHEMA);
  }
  try {
    const corrida = abandonRun(root, runId);
    return ok(
      `Corrida ${corrida.runId} abandonada. Sus pasos ya ejecutados no se deshacen: ` +
        "lo que hizo, hecho está.\n",
    );
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `simulate --calibrate`: compara el gate con lo que decidieron las personas.
 *
 * El criterio de aceptación de la Fase 3 pide una coincidencia medida, y hasta
 * ahora no había forma de calcularla. Se pide con una bandera y no por defecto: la
 * comparación necesita evaluar los 57 tickets, y eso cuesta una llamada por
 * proposición y por ticket. Quien quiera el número lo pide a sabiendas.
 */
export function calibrateReport(
  paths: RegistryPaths,
  gate: string,
  simulación: SimulationReport,
): CommandResult {
  const referencias = humanReferences(paths);
  const informe = calibrate(
    gate,
    simulación.tickets.map((ticket) => ({
      id: ticket.id,
      outcome: ticket.decision.outcome,
    })),
    referencias,
  );
  return ok(renderCalibration(informe));
}
