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
  loadProjectModel,
  profileProject,
  projectFiles,
  proposeConfig,
} from "@valmen/adapter";

import {
  type LocatedTicket,
  type RegistryPaths,
  type RunnerResult,
  chooseTicketsDir,
  findAllTickets,
  findTicket,
  indexPath,
  ticketsPath,
} from "@valmen/engine";
import { isIndexCurrent, renderIndex } from "@valmen/engine";

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
    return error(
      `Se encontraron ${count} ticket(s) inválidos: ${failures.join("; ")}`,
    );
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
export function resumeTicket(
  paths: RegistryPaths,
  id: string | undefined,
): CommandResult {
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
  const blocking = parsed.blocks.Puntos.filter(
    (point: Record<string, unknown>) =>
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
export function buildIndex(
  paths: RegistryPaths,
  check: boolean,
): CommandResult {
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
        atomicWrite(
          indexPath(paths),
          renderIndex(paths, findAllTickets(paths)),
        );
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

    if (dryRun && pending.length > 0) {
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

  const agentesProyectados = projected.length - 1;

  const lines = [
    "Sincronización",
    `  AGENTS.md                (${proyeccion.ruleCount} archivo(s) de reglas del proyecto)`,
  ];

  if (agentesProyectados > 0) {
    lines.push(
      `  agentes proyectados      ${agentesProyectados}`,
      `    .codex/agents/         ${byRuntime.codex} archivos TOML`,
      `    .opencode/agents/      ${byRuntime.opencode} archivos Markdown`,
      `    .claude/agents/        ${byRuntime.claude} archivos Markdown`,
    );
  } else {
    lines.push(
      "  agentes                  ninguno",
      "    Añada definiciones en .valmen/agents/<id>.md para proyectarlas.",
    );
  }

  if (proyeccion.ruleCount === 0) {
    lines.push(
      "  Añada reglas en .valmen/rules/ para que se incluyan en AGENTS.md.",
    );
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
    lines.push(
      "",
      `  Manifiestos detectados (${profile.detectedFiles.length}):`,
    );
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
      const note = legacy.selfDeclaredLegacy
        ? "  [ya marcada como legado]"
        : "";
      lines.push(`    ${legacy.path}  — ${legacy.kind}${note}`);
    }
    lines.push(
      "",
      "  La adopción no borra ni reordena nada de esto. Si alguna de sus reglas",
      "  describe el dominio del proyecto, cópiela a .valmen/rules/ y quedará",
      "  incluida en AGENTS.md.",
    );
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
