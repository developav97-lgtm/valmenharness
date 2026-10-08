/**
 * Comandos de solo lectura y de índice.
 *
 * Los mensajes y los códigos de salida replican los del CLI de referencia
 * porque son parte del contrato: un script que hoy hace
 * `ticket.py validate --all` debe seguir funcionando con `valmen validate --all`
 * sin cambios. Ver docs/09-MIGRACION-SAICLOUD.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import {
  type ParsedTicket,
  EXIT_AMBIGUOUS,
  EXIT_INVARIANT,
  EXIT_OK,
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
  withAccessMode,
} from "@valmen/core";
import {
  type Projection,
  adoptPlan,
  applyBlueprint,
  blueprintsDir,
  extractRules,
  listBlueprints,
  renderRuleExtraction,
  parseConfig,
  machineBindingsPath,
  prepareMachineProjectBinding,
  parseRoutingTolerante,
  readSharedProjectPolicy,
  readHermesConfig,
  profileProject,
  projectFiles,
  proposeConfig,
  readBlueprint,
  renderBlueprintOutcome,
  renderRouting,
  routingPath,
  SKILL_RUNTIME_IDS,
  RUNTIME_DIRS,
  EJECUTORES_CON_PERFIL,
  type ClienteDeSesion,
  derivaPublicada,
  describeAgentsMdSize,
  descripcionDeDeriva,
  instalarPublicadas,
  publicadas,
  publicadasDelProyecto,
} from "@valmen/adapter";

import {
  type CodegraphIndexResult,
  type CodegraphState,
  codegraphIndexCommand,
  probeCodegraph,
  runCodegraphIndex,
} from "./codegraph.js";
import {
  type BudgetPolicy,
  aprobarPorCodigo,
  archivosDelDiff,
  aprobarPorAutorizacion,
  elegibilidadDeAprobacion,
  elegibilidadQa,
  correrQaAgent,
  TICKETS_PARA_PROMOVER,
  cerrarQaPorPolitica,
  concordanciaEnSombra,
  modoEfectivoDeQaAgent,
  promoverQaAgent,
  crearAutorizacion,
  estadoDeSkillsExternas,
  registrarRevisionDeSkill,
  crearAutorizacionDeAprobacion,
  FUENTE_ENLACE_FIRMADO_APROBACION,
  canjearCodigoDeAutorizacionDeAprobacion,
  emitirCodigoDeAutorizacionDeAprobacion,
  revocarCodigoDeAutorizacionDeAprobacion,
  comandoDeRevocacionDeAprobacion,
  leerAutorizacionesDeAprobacion,
  listarAprobacionesAutomaticas,
  revocarAutorizacionDeAprobacion,
  FUENTE_ENLACE_FIRMADO,
  canjearCodigoDeAutorizacion,
  emitirCodigoDeAutorizacion,
  revocarCodigoDeAutorizacion,
  leerAutorizaciones,
  revocarAutorizacion,
  armarJornada,
  emitirAprobacionesDeJornada,
  advertenciaDeArbolSucio,
  avanzarJornada,
  readJourneys,
  rutasPropiasDeLaJornada,
  jornadaDelDia,
  jornadaVigente,
  registrarPasada,
  liberarParada,
  registrarAprobacionDePlan,
  resolveAuthorizedProject,
  type CommandRunner,
  type LocatedTicket,
  type RegistryPaths,
  type ProcessRunState,
  type RunnerResult,
  type SimulationReport,
  type ResumeMode,
  type TicketBudget,
  abandonRun,
  renderPreReview,
  reviewBeforeGate,
  precisionReport,
  proposeThresholds,
  readCurrentReceipts,
  renderPrecision,
  renderProposal,
  appendPromotionEvidence,
  approveGate,
  buildManifest,
  calibrate,
  evidenceFromCalibration,
  humanReferences,
  listRuns,
  loadProcesses,
  readRun,
  renderCalibration,
  renderRun,
  waitingRuns,
  requireProcess,
  runProcess,
  budgetForTicket,
  choosePaths,
  chooseTicketsDir,
  closedTickets,
  hermesSendChannel,
  learnTypicalCosts,
  readBudgetPolicy,
  renderBudgetNotification,
  renderBudgetReport,
  MANUALES_POR_DEFECTO,
  manualesPendientes,
  renderPendientes,
  PLANTILLA_PANTALLA,
  renderPlantilla,
  appendReceipt,
  auditarManuales,
  renderAuditoria,
  reciboDeAuditoria,
  SUJETO_MANUALES,
  INDEXADORES_CORPUS,
  publicarCorpus,
  renderCorpus,
  defaultReportRange,
  findAllTickets,
  filterReport,
  findTicket,
  indexPath,
  parseReportDate,
  parseTicketList,
  renderManifest,
  renderReport,
  unreadableTickets,
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
  buildAskContext,
  buildResumeContext,
  renderAskContext,
  renderResumeContext,
  DECISIONES_APRENDIZAJE,
  materializeFeature,
  renderMaterialization,
  classifyLearning,
  listLearnings,
  renderLearnings,
  renderColorReport,
  scanPendingChanges,
  revisarUx,
  scanPendingColors,
  usageReport,
  ETAPAS_REVISABLES,
  type EtapaRevisable,
  type PreparacionDeRevision,
  type ResultadoDeRevision,
  ejecutarRevisor,
  registrarDecisionDelRevisor,
  prepararRevision,
} from "@valmen/engine";
import {
  armarBriefDeSubagente,
  calcularOlaDeJornada,
  renderBriefDeSubagente,
  renderOlaDeJornada,
} from "@valmen/engine";

/**
 * Resultado de un comando: qué escribir y con qué código salir.
 *
 * Es el mismo tipo que devuelve el motor de gates. Tener dos definiciones
 * idénticas permitiría que una cambiara sin la otra y que el servidor dejara de
 * entender lo que el CLI produce.
 */

import { approvalSecret } from "./hermes.js";

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

/**
 * `approve-plan --id <ID> --actor <nombre> --source <fuente> --quote "<frase>"`.
 *
 * Registra la aprobación del plan vigente como un evento con actor, fuente, frase literal
 * y el hash del plan (R-CTRL-001). La frase es de quien aprueba: el agente no la inventa.
 */
export function approvePlanCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const texto = (nombre: string): string => (typeof flags[nombre] === "string" ? (flags[nombre] as string) : "");
  const id = texto("id");
  if (id === "") return error("approve-plan requiere --id <TICKET-ID>.", EXIT_SCHEMA);
  try {
    registrarAprobacionDePlan({
      paths,
      ticketId: id,
      actor: texto("actor"),
      source: texto("source") === "" ? "cli" : texto("source"),
      quote: texto("quote"),
    });
    return ok(`Aprobación del plan de ${id} registrada por ${texto("actor").trim()}.\n`);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/** `validate --id <ID>`: valida un ticket concreto. */
/**
 * `precheck <compuerta> --id <ID>`: la revisión previa a mano.
 *
 * Es **la misma** que corre la compuerta antes de llamar al evaluador (R-CPRE-008): lo que
 * dice aquí es lo que la compuerta dirá, sin gastar una llamada. Sale con 3 si falta algo.
 */
export function precheckCommand(
  paths: RegistryPaths,
  gateId: string | undefined,
  id: string | undefined,
): CommandResult {
  if (gateId !== "analysis" && gateId !== "plan") {
    return error("precheck requiere la compuerta: analysis o plan.", EXIT_SCHEMA);
  }
  if (id === undefined) return error("precheck requiere --id <TICKET-ID>.", EXIT_SCHEMA);
  const ticket = findTicket(paths, id);
  if (ticket === undefined) return error("La ruta canónica solicitada no existe.");
  try {
    const revision = reviewBeforeGate({ root: paths.root, ticketText: ticket.text, gateId });
    const informe = renderPreReview(gateId, id, revision);
    return revision.findings.length === 0
      ? ok(informe)
      : { stdout: informe, stderr: "", exitCode: EXIT_INVARIANT };
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `precision [--desde <fecha>] [--hasta <fecha>]`: la precisión de las compuertas.
 *
 * Lee los recibos del registro —no llama a ningún modelo ni cuesta nada— y dice, por
 * compuerta y por evaluador, la tasa de banda, las revisiones que una persona aprobó sin
 * cambios y los bloqueos por tipo de ticket (R-CPRE-011).
 */
export function precisionCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const texto = (nombre: string): string | undefined =>
    typeof flags[nombre] === "string" ? (flags[nombre] as string) : undefined;
  const opciones = { desde: texto("desde"), hasta: texto("hasta") };
  for (const [nombre, valor] of Object.entries(opciones)) {
    if (valor !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      return error(`--${nombre} debe ser una fecha YYYY-MM-DD.`, EXIT_SCHEMA);
    }
  }
  try {
    return ok(renderPrecision(precisionReport(readCurrentReceipts(paths), opciones), opciones));
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `thresholds <compuerta> [--evaluator <id>]`: propone umbrales desde las decisiones humanas.
 *
 * No aplica nada y no cuesta una llamada: lee las decisiones que las personas ya dejaron en
 * los recibos y dice qué `approve-at` habría acertado, con la entrada de configuración sin
 * firma. Aplicarlo lo decide una persona (R-CPRE-010).
 */
export function thresholdsCommand(
  paths: RegistryPaths,
  gateId: string | undefined,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  if (gateId !== "analysis" && gateId !== "plan") {
    return error("thresholds requiere la compuerta: analysis o plan.", EXIT_SCHEMA);
  }
  const evaluator = typeof flags["evaluator"] === "string" ? (flags["evaluator"] as string) : undefined;
  try {
    return ok(renderProposal(proposeThresholds(readCurrentReceipts(paths), gateId, evaluator)));
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

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
  modo: ResumeMode = "compacto",
  cliente?: string,
): CommandResult & { readonly data?: Record<string, unknown> } {
  if (cliente !== undefined && !(EJECUTORES_CON_PERFIL as readonly string[]).includes(cliente)) {
    return error(`El cliente "${cliente}" no es válido. Valores admitidos: ${EJECUTORES_CON_PERFIL.join(", ")}.`);
  }
  const cliente_ = cliente as ClienteDeSesion | undefined;
  if (id !== undefined) {
    const ticket = findTicket(paths, id);
    if (ticket === undefined) {
      return error("La ruta canónica solicitada no existe.");
    }
    const failure = validationError(ticket, id);
    if (failure !== undefined) return error(failure.message, failure.exitCode);
    return resultadoReanudacion(paths, parseTicket(ticket.text), modo, cliente_);
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
  return resultadoReanudacion(paths, activos.rows[0]?.document as ParsedTicket, modo, cliente_);
}

function resultadoReanudacion(
  paths: RegistryPaths,
  document: ParsedTicket,
  modo: ResumeMode,
  cliente?: ClienteDeSesion,
): CommandResult & { readonly data?: Record<string, unknown> } {
  const context = buildResumeContext(paths, document, modo, cliente);
  return {
    stdout: renderResumeContext(context),
    stderr: "",
    exitCode: 0,
    data: context as unknown as Record<string, unknown>,
  };
}

/**
 * `ask`: el contexto de una consulta, en modo pregunta.
 *
 * El modo lo pone acá el CLI y no el motor, y es la única forma de pedirlo: el
 * permiso de escritura se niega dentro de `withAccessMode`, así que todo lo que
 * corra dentro de este comando —incluido lo que un agente decida llamar después
 * mientras dure la consulta— falla con invariante antes de tocar el disco.
 *
 * No lanza un agente ni consulta a un modelo: arma el contexto —registro activo,
 * el ticket si se pidió uno, y lo que la memoria del proyecto sabe del tema— y lo
 * imprime con el permiso declarado. La respuesta la produce quien lo lea.
 */
export function askCommand(
  paths: RegistryPaths,
  question: string,
  ticketId: string | undefined,
): CommandResult & { readonly data?: Record<string, unknown> } {
  try {
    const context = withAccessMode("ask", () =>
      buildAskContext({
        paths,
        question,
        ...(ticketId === undefined ? {} : { ticketId }),
      }),
    );

    return {
      stdout: renderAskContext(context),
      stderr: "",
      exitCode: 0,
      data: context as unknown as Record<string, unknown>,
    };
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
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
 * Qué skills publicadas se compararon, para que el check diga sobre qué habló.
 *
 * Una lista vacía es informativa, no un fallo: un proyecto adoptado antes de que
 * existiera el catálogo no tiene ninguna copia, y `valmen sync` se las instala.
 */
function lineaDeComparadas(root: string): string {
  const ids = publicadasDelProyecto(root);
  if (ids.length === 0) {
    return `Skills publicadas comparadas: ninguna (el harness publica ${publicadas().length}; \`valmen sync\` las instala)`;
  }
  return `Skills publicadas comparadas: ${ids.join(", ")}`;
}

/**
 * Cuánto pesa el `AGENTS.md` proyectado y, si pasa del presupuesto del proyecto, el
 * aviso. Es lo que dice `sync` para que el tamaño sea una decisión y no algo que
 * crece sin que nadie lo vea.
 *
 * El aviso **no** cambia el código de salida: un documento pasado de tamaño sigue
 * siendo el que el proyecto declaró, y negarse a escribirlo dejaría a los agentes
 * con el anterior.
 */
function lineasDeTamano(proyeccion: Projection): string[] {
  return [
    `AGENTS.md: ${describeAgentsMdSize(proyeccion.agentsMd)}`,
    ...proyeccion.warnings.map((aviso) => `Aviso: ${aviso}`),
  ];
}

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
  // Las publicadas se instalan **antes** de proyectar, y el orden importa: la
  // proyección se calcula desde la copia del proyecto, así que proyectar primero
  // escribiría la versión que se acaba de actualizar. Con `--check` no se toca
  // nada: la diferencia se informa y la resuelve quien ejecute `sync` sin `--check`.
  const instaladas = check ? [] : instalarPublicadas(root);

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

    // Dos cosas distintas y las dos importan: la proyección puede estar fresca
    // —porque nadie tocó el archivo generado— y la copia del proyecto estar en una
    // versión anterior del catálogo. Antes de esto, esa segunda nada la veía.
    const deriva = derivaPublicada(root);

    if (stale.length > 0 || deriva.length > 0) {
      const partes: string[] = [];
      if (stale.length > 0) {
        partes.push(
          `Hay ${stale.length} archivo(s) generados desactualizados o editados a mano; ` +
            `ejecute \`valmen sync\`: ${stale.join(", ")}`,
        );
      }
      if (deriva.length > 0) partes.push(descripcionDeDeriva(deriva));
      // El aviso de tamaño también cuenta cuando hay otra cosa que arreglar: es lo
      // que se vería de todos modos tras el próximo `sync`.
      partes.push(...proyeccion.warnings.map((aviso) => `Aviso: ${aviso}`));
      return error(partes.join("\n"));
    }

    return ok(
      `Archivos generados al día.\n${lineaDeComparadas(root)}\n` +
        `${lineasDeTamano(proyeccion).join("\n")}\n`,
    );
  }

  for (const file of projected) {
    atomicWrite(join(root, file.path), file.content);
  }

  const lines = [
    "Sincronización",
    `  AGENTS.md                (${proyeccion.ruleCount} archivo(s) de reglas del proyecto)`,
    `  tamaño de AGENTS.md      ${describeAgentsMdSize(proyeccion.agentsMd)}`,
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

  // Los runtimes se listan desde la tabla del adaptador y no a mano: escritos a
  // mano se desincronizaron en cuanto se agregó `.agents/`, y el informe decía
  // que se habían proyectado tres cuando eran cuatro.
  for (const runtime of SKILL_RUNTIME_IDS) {
    lines.push(`    ${RUNTIME_DIRS[runtime].padEnd(23)}${byRuntime[runtime]} archivo(s)`);
  }

  const instaladasTexto =
    instaladas.length === 0
      ? `al día (${publicadasDelProyecto(root).length})`
      : `${instaladas.length} actualizada(s): ${instaladas.join(", ")}`;
  lines.push(`  skills publicadas        ${instaladasTexto}`);

  if (proyeccion.ruleCount === 0) {
    lines.push("  Añada reglas en .valmen/rules/ para que se incluyan en AGENTS.md.");
  }

  for (const aviso of proyeccion.warnings) lines.push(`  Aviso: ${aviso}`);

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

/** El comando con el que el paquete de CodeGraph se instala; lo corre la persona, no el harness. */
const CODEGRAPH_INSTALL_COMMAND = "npm install -g @colbymchenry/codegraph";

/**
 * La sección «CodeGraph» de `valmen adopt`: el estado y lo que corresponde
 * ofrecer, sin ejecutar nada.
 *
 * Es pura: recibe el estado ya sondeado y, si la persona confirmó con
 * `--codegraph` y no es una simulación, el resultado de indexar. CodeGraph es
 * opcional, así que ninguna rama cambia el código de salida de `adopt`.
 */
function codegraphOfferLines(
  estado: CodegraphState,
  contexto: {
    readonly root: string;
    readonly confirmado: boolean;
    readonly dryRun: boolean;
    readonly resultado: CodegraphIndexResult | null;
  },
): string[] {
  const { confirmado, dryRun, resultado } = contexto;
  const comando = codegraphIndexCommand(contexto.root, estado);
  const lines: string[] = ["", "CodeGraph (opcional)"];

  switch (estado.estado) {
    case "no-instalado":
      lines.push(
        "  estado            no instalado",
        "  El harness no instala software global: instálelo usted con",
        `    ${CODEGRAPH_INSTALL_COMMAND}`,
        "  y después, para indexar este proyecto:",
        "    valmen adopt --codegraph",
      );
      if (confirmado) {
        lines.push("", "  Se pidió --codegraph, pero CodeGraph no está instalado: no se indexó nada.");
      }
      return lines;

    case "al-dia":
      lines.push(
        "  estado            instalado, indexado y al día",
        "  Nada que hacer: el índice está al día.",
      );
      if (confirmado) lines.push("  Se pidió --codegraph: no hubo nada que indexar.");
      return lines;

    case "ilegible":
      lines.push(
        `  estado            no se pudo leer (${estado.motivo})`,
        "  Revise el estado a mano con `codegraph status`; mientras no se lea, no se indexa nada.",
      );
      if (confirmado) lines.push("", "  Se pidió --codegraph, pero sin saber el estado no se indexó nada.");
      return lines;

    case "sin-indice":
    case "desactualizado": {
      lines.push(
        estado.estado === "sin-indice"
          ? "  estado            instalado, sin índice"
          : `  estado            instalado, índice desactualizado (${estado.added} nuevos, ${estado.modified} modificados, ${estado.removed} borrados)`,
      );
      if (!confirmado) {
        lines.push(
          `  Para ${estado.estado === "sin-indice" ? "indexar" : "actualizar el índice de"} este proyecto (ejecuta \`${comando}\`):`,
          "    valmen adopt --codegraph",
        );
        return lines;
      }
      if (dryRun) {
        lines.push(`  Se ejecutaría: ${comando}`, "  (simulación: no se lanzó nada)");
        return lines;
      }
      if (resultado === null) return lines;
      if (resultado.error === null) {
        lines.push(
          `  Indexado: ${resultado.comando}`,
          "  Para registrar el servidor MCP de CodeGraph en los clientes del proyecto:",
          "    valmen mcp --install",
        );
        return lines;
      }
      lines.push(
        resultado.exitCode === null
          ? `  Falló \`${resultado.comando}\`: ${resultado.error}`
          : `  Falló \`${resultado.comando}\` con código ${resultado.exitCode}: ${resultado.error}`,
        "  La adopción siguió: nada de lo escrito se deshizo. Revise con `codegraph status` y repita `valmen adopt --codegraph`.",
      );
      return lines;
    }
  }
}

export function adoptProject(
  root: string,
  projectName: string,
  options: {
    dryRun?: boolean;
    home?: string | undefined;
    machineId?: string | undefined;
    /** La confirmación de la persona (`--codegraph`): indexar el proyecto con CodeGraph. */
    codegraph?: boolean;
    /** El sondeo de CodeGraph; inyectable para no depender del binario de la máquina. */
    probeCodegraph?: () => CodegraphState;
    /** Quien indexa; inyectable para que las pruebas nunca lancen el binario real. */
    runCodegraph?: (root: string, estado: CodegraphState) => CodegraphIndexResult | null;
  } = {},
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
  const extraccion = extractRules(root);

  let binding:
    | ReturnType<typeof prepareMachineProjectBinding>
    | undefined;
  let bindingPath: string | undefined;
  if (alreadyAdopted) {
    try {
      const sharedPolicy = readSharedProjectPolicy(
        parseConfig(readFileSync(plan.configPath, "utf8")),
      );
      if (sharedPolicy.projectId !== null) {
        bindingPath = machineBindingsPath(options.home ?? homedir());
        binding = prepareMachineProjectBinding(readIfExists(bindingPath), {
          projectId: sharedPolicy.projectId,
          root: resolve(root),
          ...(options.machineId === undefined ? {} : { machineId: options.machineId }),
        });
      }
    } catch (caught) {
      const failure = toFailure(caught);
      return error(failure.message, failure.exitCode);
    }
  }

  if (binding?.status === "conflict") {
    return error(`Binding local en conflicto: ${binding.message}\n`, EXIT_INVARIANT);
  }
  if (binding?.status === "missing-machine-id") {
    return error(
      "No se creó binding local: el primer alta requiere --machine-id <identidad>.\n",
      EXIT_INVARIANT,
    );
  }

  // La oferta de CodeGraph se arma al final de cada salida —ya adoptado, simulación
  // y adopción nueva—, cuando lo demás ya está escrito: un proyecto ya montado
  // también la recibe y puede confirmarla. Sin `--codegraph` solo se sondea
  // (`codegraph status`, de solo lectura); indexar exige la bandera y que no sea una
  // simulación, y ocurre una sola vez porque cada camino de salida llama esto una vez.
  const seccionCodegraph = (): string[] => {
    const estado = (options.probeCodegraph ?? (() => probeCodegraph(root)))();
    const confirmado = options.codegraph === true;
    // Solo `sin-indice` y `desactualizado` tienen algo que indexar: en los demás
    // estados no se llama al ejecutor, así que no hay forma de lanzar nada.
    const hayQueIndexar = codegraphIndexCommand(root, estado) !== null;
    const resultado =
      confirmado && !dryRun && hayQueIndexar
        ? (options.runCodegraph ?? runCodegraphIndex)(root, estado)
        : null;
    return codegraphOfferLines(estado, { root, confirmado, dryRun, resultado });
  };

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

  // Una fuente de memoria que el disco tiene y la configuración no declara deja
  // la primera consulta con una instrucción en vez de con las entradas. Se nombra
  // lo detectado, y cuando no hay nada se dice qué se revisó: callar se leería
  // como que el proyecto no tiene memoria.
  if (profile.memorySources.length > 0) {
    lines.push("", `  Documentos de memoria (${profile.memorySources.length}):`);
    for (const source of profile.memorySources) {
      lines.push(`    ${source.path}  — ${source.kind}`);
    }
  } else {
    lines.push(
      "",
      "  Documentos de memoria: no se detectó ninguno. Se buscó `DECISIONS.md`",
      "  y `ERRORS.md` en la raíz y en `docs/`; sin declarar una fuente, la",
      "  memoria del proyecto queda vacía hasta que se agregue una a mano.",
    );
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

  if (bindingPath !== undefined && binding !== undefined) {
    if (binding.status === "created") {
      lines.push(
        "",
        dryRun ? "Binding local propuesto:" : "Binding local creado:",
        `  ${bindingPath}`,
      );
    } else if (binding.status === "already-declared") {
      lines.push("", "Binding local ya declarado; no se reescribió.");
    }
  }

  // Las reglas del AGENTS.md previo se extraen antes de decidir si se escribe la
  // configuración: es el paso que evita que `valmen sync` —el que el propio
  // `adopt` indica como siguiente— recomponga el documento sin las reglas que el
  // proyecto ya tenía escritas.
  if (extraccion.source !== null || extraccion.note !== null) {
    lines.push("", ...renderRuleExtraction(extraccion));
  }

  if (!dryRun) {
    for (const file of extraccion.files) {
      const destino = join(root, file.path);
      mkdirSync(dirname(destino), { recursive: true });
      atomicWrite(destino, file.content);
    }
  }

  if (!dryRun && binding?.status === "created" && bindingPath !== undefined) {
    atomicWrite(bindingPath, binding.text);
  }

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
      ...seccionCodegraph(),
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
      ...seccionCodegraph(),
    );
    return ok(lines.join("\n") + "\n");
  }

  atomicWrite(plan.configPath, config);
  mkdirSync(plan.rulesDir, { recursive: true });
  mkdirSync(join(root, ".valmen", "agents"), { recursive: true });

  // Las skills de proceso que publica el harness llegan con la adopción, para que
  // el proyecto arranque con las mismas que cualquier otro. Las del stack las
  // escribe el proyecto: esto no las toca.
  const publicadasInstaladas = instalarPublicadas(root);

  lines.push(
    `  ${relative(root, plan.rulesDir)}/`,
    `  .valmen/agents/`,
    `  .valmen/skills/  (${publicadasInstaladas.length} skill(s) de proceso publicadas por el harness)`,
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
      "  Existe un AGENTS.md previo. `valmen sync` lo reemplazará por el generado:",
      extraccion.files.length > 0
        ? "  su contenido ya quedó en .valmen/rules/, así que el documento nuevo lo vuelve"
        : "  no había reglas propias que preservar de él, así que el documento nuevo lo",
    );
    lines.push(
      extraccion.files.length > 0
        ? "  a incluir."
        : "  reemplaza sin perder nada.",
    );
  }

  lines.push(...seccionCodegraph());

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

    // Un ticket que no se pudo leer **no se saltea en silencio**. El informe
    // sigue saliendo —es lo que se pidió, y negarse por un renglón roto deja sin
    // el panorama a quien lo estaba mirando—, pero dice qué quedó afuera. Un
    // informe con aspecto completo y un dato de menos es peor que uno incompleto
    // que lo declara.
    const ilegibles = unreadableTickets(paths);
    const aviso =
      ilegibles.length === 0
        ? ""
        : `\n---\n\n⚠ ${ilegibles.length} ticket(s) no se pudieron leer y quedaron fuera del informe:\n` +
          ilegibles.map((t) => `  · ${t.id} — ${t.error}`).join("\n") +
          "\n";

    return ok(renderReport(entradas, desde, hasta) + aviso);
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
 * `feature materialize`: escribe en el registro los tickets del grafo.
 *
 * Descomponer deja un plan; un plan no es trabajo. Hasta ahora el paso de uno al
 * otro se hacía a mano y ticket por ticket, y por eso una feature descompuesta
 * podía quedarse semanas con sus tickets «planeados» sin que nadie los escribiera.
 * `--dry-run` dice qué crearía, que es lo que hace falta para decidir.
 */
export function materializeCommand(
  paths: RegistryPaths,
  slug: string,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  try {
    const dryRun = flags["dry-run"] === true;
    const resultado = materializeFeature(paths, slug, {
      write: !dryRun,
      allowExternalLinks: flags["allow-external-links"] === true,
    });
    return ok(renderMaterialization(slug, resultado, { dryRun }));
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

    // Lo que se hizo con el consumo se dice **siempre** que haya algo que decir,
    // incluso cuando no se pudo cargar a ningún ticket: un gasto que no aparece en
    // ningún informe es un gasto que nadie va a buscar.
    const consumo =
      corrida.attribution.length === 0
        ? []
        : ["", "Consumo:", ...corrida.attribution.map((linea) => `  ${linea}`)];

    return ok(
      [
        `Proceso ${corrida.id}: ${corrida.steps.length} paso(s) en ${corrida.durationMs} ms.`,
        ...consumo,
        "",
      ].join("\n"),
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
    const rawRun = flags["run"];
    const rawPhrase = flags["phrase"];
    const aprobacion = approveGate(
      root,
      gate,
      typeof rawActor === "string" ? rawActor : "",
      typeof rawReason === "string" ? rawReason : "",
      new Date(),
      {
        ...(typeof rawRun === "string" ? { runId: rawRun } : {}),
        ...(typeof rawPhrase === "string" ? { phrase: rawPhrase } : {}),
      },
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
 * `manuales pendientes`: el cruce entre los tickets de la release y los manuales.
 *
 * El listado sale **siempre** por salida estándar. Sin `--escribir` no se escribe
 * ningún archivo; con `--escribir` va a `<manuales-dir>/pendientes.md`, y si el
 * directorio de manuales no existe **no** se crea: inventar la ruta dejaría en el
 * repositorio un lugar que no significa nada. En ese caso se informa por salida
 * estándar que no había dónde escribir.
 */
export function manualesPendientesCommand(
  root: string,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const crudos = typeof flags["tickets"] === "string" ? flags["tickets"] : "";
  const tickets = [
    ...new Set(
      crudos
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id !== ""),
    ),
  ];
  if (tickets.length === 0) {
    return error(
      "manuales pendientes requiere --tickets con los ids de la release, " +
        "separados por coma.",
      EXIT_SCHEMA,
    );
  }

  const manualesDir =
    typeof flags["manuales-dir"] === "string"
      ? flags["manuales-dir"]
      : MANUALES_POR_DEFECTO;
  const pantallasCrudas = typeof flags["pantallas"] === "string" ? flags["pantallas"] : "";
  const pantallas = pantallasCrudas
    .split(",")
    .map((patron) => patron.trim())
    .filter((patron) => patron !== "");

  try {
    const resultado = manualesPendientes(choosePaths(root), {
      tickets,
      manualesDir,
      ...(pantallas.length === 0 ? {} : { pantallas }),
    });
    const texto = renderPendientes(resultado);
    const avisos: string[] = [];

    if (flags["escribir"] === true) {
      const directorio = join(root, ...manualesDir.split("/"));
      if (!existsSync(directorio)) {
        avisos.push(
          `No se escribió el listado: no existe el directorio de manuales ` +
            `${manualesDir}, y no se creó.\n`,
        );
      } else {
        writeFileSync(join(directorio, "pendientes.md"), texto, "utf8");
        avisos.push(`Listado escrito en ${manualesDir}/pendientes.md\n`);
      }
    }

    return ok([texto, ...avisos].join(""));
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `manuales plantilla`: el esqueleto del manual de usuario final.
 *
 * Imprime el esqueleto **siempre** por salida estándar, con o sin `--escribir`:
 * el comando existe para que el agente no tenga que recordar la forma del
 * manual. Con `--escribir` escribe el `.md`, y entonces **exige** `--destino`
 * con una ruta relativa a la raíz: adivinar dónde va —componiendo un módulo que
 * el harness no conoce— dejaría el archivo en un lugar que nadie declaró. Se
 * niega a pisar un manual existente salvo `--forzar`, porque el `.md` es la
 * fuente de verdad y lo que se pisaría es el trabajo de alguien.
 */
export function manualesPlantillaCommand(
  root: string,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const pantalla =
    typeof flags["pantalla"] === "string" && flags["pantalla"].trim() !== ""
      ? flags["pantalla"].trim()
      : PLANTILLA_PANTALLA;
  const texto = renderPlantilla({ pantalla });

  if (flags["escribir"] !== true) {
    return ok(texto);
  }

  const destino = typeof flags["destino"] === "string" ? flags["destino"].trim() : "";
  if (destino === "") {
    return error(
      "manuales plantilla --escribir requiere --destino con la ruta relativa del " +
        "manual. El comando no inventa dónde escribir.",
      EXIT_SCHEMA,
    );
  }

  if (isAbsolute(destino)) {
    return error(
      `--destino tiene que ser una ruta relativa a la raíz, y "${destino}" es ` +
        "absoluta.",
      EXIT_SCHEMA,
    );
  }

  const absoluta = resolve(root, destino);
  const dentro = relative(root, absoluta);
  // `relative` devuelve "" para la raíz misma y algo que empieza por `..` o es
  // absoluto cuando el destino se sale: las tres cosas se rechazan.
  if (dentro === "" || dentro.startsWith("..") || isAbsolute(dentro)) {
    return error(`--destino se sale de la raíz del proyecto: "${destino}".`, EXIT_SCHEMA);
  }

  if (existsSync(absoluta) && flags["forzar"] !== true) {
    return error(
      `El manual ${destino} ya existe. No se pisó: un manual es la fuente de ` +
        "verdad. Use --forzar para reescribirlo con el esqueleto nuevo.",
      EXIT_SCHEMA,
    );
  }

  try {
    mkdirSync(dirname(absoluta), { recursive: true });
    writeFileSync(absoluta, texto, "utf8");
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }

  return ok(`${texto}Manual escrito en ${destino}\n`);
}

/**
 * `manuales auditar`: la auditoría con citas contra el código.
 *
 * Imprime el veredicto de cada manual y deja el recibo en
 * `.valmen/receipts/actualizar-manuales.jsonl`, con sujeto de proceso. El código
 * de salida es el del veredicto: `approve` sale 0, `review` sale con el código de
 * «hay algo que decidir» y `block` con el de «el contrato no se cumple», para que
 * el proceso distinga lo que hay que mirar de lo que hay que arreglar.
 */
export function manualesAuditarCommand(
  root: string,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const manualesDir =
    typeof flags["manuales-dir"] === "string"
      ? flags["manuales-dir"]
      : MANUALES_POR_DEFECTO;

  try {
    const paths = choosePaths(root);
    const resultado = auditarManuales(paths, { manualesDir });
    const recibo = reciboDeAuditoria(resultado, {});
    const ruta = appendReceipt(paths, SUJETO_MANUALES, recibo);

    const texto = [
      renderAuditoria(resultado),
      `Recibo: ${relative(root, ruta)}\n`,
    ].join("");

    const exitCode =
      resultado.veredicto === "approve"
        ? EXIT_OK
        : resultado.veredicto === "review"
          ? EXIT_AMBIGUOUS
          : EXIT_INVARIANT;

    return { ...ok(texto), exitCode };
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/** `corpus publicar`: entrega el delta al destino elegido, sin dependencias de índice. */
export function corpusPublicarCommand(
  root: string,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const nombre = typeof flags["indexador"] === "string" ? flags["indexador"] : undefined;
  if (nombre !== undefined && !Object.hasOwn(INDEXADORES_CORPUS, nombre)) {
    return error(
      `Indexador de corpus desconocido: ${nombre}. Válidos: ${Object.keys(INDEXADORES_CORPUS).join(", ")}.`,
      EXIT_SCHEMA,
    );
  }
  try {
    const resultado = publicarCorpus(choosePaths(root), {
      ...(typeof flags["corpus-dir"] === "string" ? { corpusDir: flags["corpus-dir"] } : {}),
      ...(typeof flags["manuales-dir"] === "string" ? { manualesDir: flags["manuales-dir"] } : {}),
      ...(nombre === undefined ? {} : { indexador: INDEXADORES_CORPUS[nombre]! }),
      completo: flags["completo"] === true,
    });
    return ok(renderCorpus(resultado));
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

/**
 * `promote-gate`: conserva la calibración que respalda una solicitud de modo
 * automático. El comando registra evidencia; la resolución posterior sigue
 * siendo la que decide si los umbrales del YAML permiten activar el modo.
 */
export function recordGatePromotion(
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
  const evidencia = evidenceFromCalibration(informe, "ciclos QA del registro");
  const ruta = appendPromotionEvidence(paths, evidencia);
  return ok(
    `${renderCalibration(informe)}Evidencia de promoción anexada: ${ruta.replace(`${paths.root}/`, "")}\n`,
  );
}

/**
 * `budget`: el costo típico por tipo de ticket y dónde está esta corrida.
 *
 * Es de solo lectura salvo por `--avisar`, que es el único efecto: manda el aviso
 * del corte por el canal de Hermes. Y existe `--check` porque el corte de pausa
 * tiene que servir en una corrida desatendida: sale con el código de invariante para
 * que quien lo invoque tenga de dónde parar, sin inventar un estado nuevo.
 */
export interface BudgetCommandOptions {
  readonly now?: () => Date;
  readonly policy?: BudgetPolicy;
  readonly runner?: CommandRunner;
}

/** El destino del aviso, leído del archivo del proyecto. `null` si no hay ninguno. */
function destinoDelAviso(root: string): { target: string; enabled: boolean } | null {
  let texto: string;
  try {
    texto = readFileSync(join(root, ".valmen", "config.yaml"), "utf8");
  } catch {
    return null;
  }
  try {
    const config = readHermesConfig(parseConfig(texto));
    return { target: config.budgetTarget.trim(), enabled: config.enabled };
  } catch {
    // Un archivo ilegible no es un destino: no se manda, y el comando dice qué
    // clave falta en vez de fallar entero por el puente.
    return null;
  }
}

/** El aviso del corte, si hay a dónde mandarlo. */
function avisarCorte(
  paths: RegistryPaths,
  presupuesto: TicketBudget,
  runner: CommandRunner | undefined,
): string {
  if (presupuesto.typicalUsd === null || presupuesto.tier === "within") {
    return "\nNo se avisó: la corrida no alcanzó ningún corte del presupuesto.\n";
  }

  const destino = destinoDelAviso(paths.root);
  if (destino === null || !destino.enabled || destino.target === "") {
    return (
      "\nNo se avisó: no hay destino declarado en hermes.notify.budget de " +
      ".valmen/config.yaml, o el puente con Hermes está apagado.\n" +
      "  Para que llegue al celular:\n" +
      "    hermes:\n      enabled: true\n      notify:\n        budget: telegram\n"
    );
  }

  const canal = hermesSendChannel({
    target: destino.target,
    ...(runner === undefined ? {} : { runner }),
  });
  const entrega = canal.notify(
    renderBudgetNotification({
      ticketId: presupuesto.ticketId,
      title: presupuesto.title,
      type: presupuesto.type,
      costUsd: presupuesto.costUsd,
      typicalUsd: presupuesto.typicalUsd,
      multiple: presupuesto.multiple ?? 0,
      tier: presupuesto.tier,
      preset: presupuesto.preset,
    }),
  );

  return entrega.delivered
    ? `\nAvisado a ${destino.target}.\n  ${entrega.detail}\n`
    : `\nNo se pudo avisar a ${destino.target}.\n  ${entrega.detail}\n`;
}

/** `budget`: el informe de típicos, o el de una corrida concreta. */
export function budgetCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
  options: BudgetCommandOptions = {},
): CommandResult {
  const ahora = options.now?.() ?? new Date();

  let policy: BudgetPolicy;
  try {
    policy = options.policy ?? readBudgetPolicy(paths.root);
  } catch (caught) {
    return error(caught instanceof Error ? caught.message : String(caught));
  }

  const id = typeof flags["id"] === "string" ? flags["id"] : "";
  const tipo = (typeof flags["tipo"] === "string" ? flags["tipo"] : "").toUpperCase();

  let presupuesto: TicketBudget | null = null;
  try {
    if (id !== "") presupuesto = budgetForTicket(paths, id, policy, { now: ahora });
  } catch (caught) {
    return error(caught instanceof Error ? caught.message : String(caught));
  }

  const informe = learnTypicalCosts(paths, policy, { now: ahora });
  const tipos =
    tipo === ""
      ? informe.types
      : [
          informe.types.find((entrada: { type: string }) => entrada.type === tipo) ?? {
            type: tipo,
            typicalUsd: null,
            samples: 0,
            reference: true,
            minUsd: null,
            maxUsd: null,
          },
        ];

  let stdout = renderBudgetReport({
    report: { ...informe, types: tipos },
    policy,
    assessment: presupuesto,
  });
  let exitCode = 0;

  if (flags["check"] === true && presupuesto?.tier === "pause") {
    exitCode = EXIT_INVARIANT;
    stdout +=
      "\nEl corte de pausa exige la decisión de una persona: esta corrida no sigue sin respuesta.\n";
  }

  if (flags["avisar"] === true) {
    stdout +=
      presupuesto === null
        ? "\nNo se avisó: --avisar necesita --id para saber de qué ticket habla.\n"
        : avisarCorte(paths, presupuesto, options.runner);
  }

  return { stdout, stderr: "", exitCode };
}

/** La respuesta fija de lo retirado con el disparador: no escribe nada y dice qué usar. */
function retiroDelDisparador(que: string): CommandResult {
  return error(
    `${que} se retiró: la jornada ya no se ejecuta con un disparador periódico ni con un avance desatendido. ` +
      "Se ejecuta desde una sesión orquestadora: `valmen journey next --wave` lista la ola, " +
      "`valmen journey brief --id <ID>` entrega el encargo de cada ticket y la skill `corrida-orquestada` " +
      "describe el recorrido. La preparación manual de planes sigue: `valmen journey advance --project <id> --fase preparacion`. " +
      "No se escribió nada. Si una tarea de launchd o un job de Hermes sigue disparando este comando, " +
      "desinstálalo: `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.valmen.jornada.<proyecto>.plist` " +
      "y `hermes cron remove valmen-jornada-<proyecto>`.",
    EXIT_SCHEMA,
  );
}

/**
 * `journey advance --project <id> --fase preparacion [--journey <id>]`: la preparación manual de planes.
 *
 * Solo la preparación sigue viva: lleva los tickets en `intake` hasta `planned` sin aprobar nada.
 * Sin fase y con `--fase ejecucion` responde con el aviso de retiro y no escribe nada.
 */
export async function journeyAdvanceCommand(
  flags: Readonly<Record<string, string | true>>,
  opciones: {
    readonly home?: string;
    readonly ejecutarPreparacion?: Parameters<typeof avanzarJornada>[0]["ejecutarPreparacion"];
    readonly ahora?: () => Date;
  } = {},
): Promise<CommandResult> {
  const proyecto = typeof flags["project"] === "string" ? flags["project"] : undefined;
  if (proyecto === undefined) return error("journey advance requiere --project <id>.", EXIT_SCHEMA);
  if (typeof flags["fase"] === "string" && flags["fase"] !== "preparacion" && flags["fase"] !== "ejecucion") {
    return error("--fase admite: preparacion (la ejecución se retiró).", EXIT_SCHEMA);
  }
  if (flags["fase"] !== "preparacion") return retiroDelDisparador("`journey advance` sin fase y con `--fase ejecucion`");
  try {
    const home = opciones.home ?? homedir();
    const project = resolveAuthorizedProject({ projectId: proyecto, home });
    const destino = typeof flags["to"] === "string" ? flags["to"] : "";
    const journeyId = typeof flags["journey"] === "string" ? flags["journey"] : (jornadaVigente(project, (opciones.ahora ?? (() => new Date()))()) ?? jornadaDelDia((opciones.ahora ?? (() => new Date()))()));
    let avance: Awaited<ReturnType<typeof avanzarJornada>>;
    try {
      avance = await avanzarJornada({
        project,
        home,
        ...(destino === ""
          ? {}
          : {
              notificar: (cuerpo: string) => {
                const entrega = hermesSendChannel({ target: destino }).notify({
                  subject: "Jornada detenida",
                  body: cuerpo,
                  key: `journey-stop:${cuerpo.split(" — ")[0] ?? ""}`,
                });
                return { delivered: entrega.delivered, detail: entrega.detail };
              },
            }),
        ...(typeof flags["journey"] === "string" ? { journeyId: flags["journey"] } : {}),
        ...(opciones.ejecutarPreparacion === undefined ? {} : { ejecutarPreparacion: opciones.ejecutarPreparacion }),
        ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
        fase: "preparacion",
      });
    } catch (caught) {
      // Un avance que falla también deja su pasada, para que la pantalla no lo confunda con silencio.
      const mensaje = caught instanceof Error ? caught.message : String(caught);
      const falla = toFailure(caught);
      const aviso = anexarPasada(project.root, { journeyId, estado: "error", ticketId: null, detalle: mensaje });
      return error(aviso === "" ? falla.message : `${falla.message}\n${aviso}`, falla.exitCode);
    }
    const aviso = anexarPasada(project.root, {
      journeyId: avance.journeyId,
      estado: avance.estado,
      ticketId: avance.ticketId,
      detalle: avance.detalle,
      ...(avance.fases.length > 0 ? { fases: avance.fases } : {}),
    });
    const resultado = avanceComoResultado(avance);
    return aviso === "" ? resultado : { ...resultado, stderr: `${aviso}\n` };
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/** Anexa la pasada; un fallo al escribirla se informa y nunca cambia el resultado del avance. */
function anexarPasada(root: string, pasada: Parameters<typeof registrarPasada>[1]): string {
  try {
    registrarPasada(root, pasada);
    return "";
  } catch (caught) {
    return `No se pudo registrar la pasada: ${caught instanceof Error ? caught.message : String(caught)}`;
  }
}

function avanceComoResultado(avance: Awaited<ReturnType<typeof avanzarJornada>>): CommandResult {
  return ok(`${avance.journeyId}: ${avance.estado}${avance.ticketId === null ? "" : ` (${avance.ticketId})`}. ${avance.detalle}\n`);
}

/**
 * `journey notify-plans --project <id> --journey <id> [--to <destino>]`.
 *
 * Emite un código por plan listo de la jornada y uno de lote, y los envía por el canal de avisos
 * (R-JORN-004). Si el envío falla los códigos siguen valiendo y se dice.
 */
export function journeyNotifyPlansCommand(
  flags: Readonly<Record<string, string | true>>,
  opciones: { readonly home?: string; readonly secret?: string | null; readonly ahora?: () => Date; readonly runner?: CommandRunner } = {},
): CommandResult {
  const proyecto = typeof flags["project"] === "string" ? flags["project"] : undefined;
  const jornada = typeof flags["journey"] === "string" ? flags["journey"] : undefined;
  if (proyecto === undefined || jornada === undefined) {
    return error("journey notify-plans requiere --project <id> y --journey <id>.", EXIT_SCHEMA);
  }
  const secret = opciones.secret === undefined ? approvalSecret() : opciones.secret;
  if (secret === null) {
    return error(
      "No hay secreto para firmar los códigos: se declara en el almacén de credenciales (aprobacion.secret) " +
        "o con VALMEN_APPROVAL_SECRET. El harness nunca lo genera ni lo guarda en el repositorio.",
      EXIT_SCHEMA,
    );
  }
  try {
    const project = resolveAuthorizedProject({ projectId: proyecto, home: opciones.home ?? homedir() });
    const ahora = opciones.ahora?.() ?? new Date();
    const emision = emitirAprobacionesDeJornada({ project, journeyId: jornada, secret, ahora });
    const destino = typeof flags["to"] === "string" ? flags["to"] : "";
    if (destino === "" || emision.planes.length === 0) {
      return ok(`${emision.mensaje}\n${destino === "" ? "Sin destino: no se envió nada (--to telegram).\n" : ""}`);
    }
    const entrega = hermesSendChannel({
      target: destino,
      ...(opciones.runner === undefined ? {} : { runner: opciones.runner }),
    }).notify({ subject: "Planes para aprobar", body: emision.mensaje, key: `plan-codes:${jornada}:${ahora.toISOString()}` });
    return ok(
      `${emision.mensaje}\n${entrega.delivered ? `Enviado a ${destino}.` : `Los códigos valen, pero el envío a ${destino} falló: ${entrega.detail}`}\n`,
    );
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `plan-approve --code <código> --actor <nombre> --quote "<frase>"`: aprueba por código.
 *
 * El código de un plan aprueba ese plan; el de un lote aprueba cada uno de sus planes. Registra la
 * aprobación con fuente `token` y la frase de quien aprueba. Una sesión desatendida no puede.
 */
export function planApproveCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
  opciones: { readonly secret?: string | null; readonly ahora?: () => Date; readonly env?: Readonly<Record<string, string | undefined>> } = {},
): CommandResult {
  const texto = (n: string): string => (typeof flags[n] === "string" ? (flags[n] as string) : "");
  if (texto("code") === "") return error("plan-approve requiere --code <código>.", EXIT_SCHEMA);
  const secret = opciones.secret === undefined ? approvalSecret() : opciones.secret;
  if (secret === null) return error("No hay secreto para verificar los códigos (aprobacion.secret o VALMEN_APPROVAL_SECRET).", EXIT_SCHEMA);
  const resultados = aprobarPorCodigo({
    paths,
    secret,
    codigo: texto("code"),
    actor: texto("actor"),
    quote: texto("quote"),
    ahora: opciones.ahora?.() ?? new Date(),
    ...(opciones.env === undefined ? {} : { env: opciones.env }),
  });
  const lineas = resultados.map((r) => `${r.ok ? "✓" : "✗"} ${r.ticket}: ${r.detalle}`);
  const fallo = resultados.some((r) => !r.ok);
  return fallo
    ? { stdout: "", stderr: `${lineas.join("\n")}\n`, exitCode: EXIT_INVARIANT }
    : ok(`${lineas.join("\n")}\n`);
}

/**
 * `qa-authorize create|revoke|list`: la autorización persistida de QA por agente (R-QAAG-001).
 *
 * Solo la crea o revoca una persona, por el CLI o Mission Control; una sesión desatendida y una
 * fuente no declarada se rechazan. No existe una herramienta MCP que lo haga.
 */
export function qaAuthorizeCommand(
  root: string,
  accion: string | undefined,
  flags: Readonly<Record<string, string | true>>,
  opciones: { readonly ahora?: Date; readonly env?: Readonly<Record<string, string | undefined>>; readonly secret?: string | null } = {},
): CommandResult {
  const t = (n: string): string => (typeof flags[n] === "string" ? (flags[n] as string) : "");
  const lista = (n: string): string[] => t(n).split(",").map((x) => x.trim()).filter((x) => x !== "");
  try {
    if (accion === "create") {
      const a = crearAutorizacion({
        root,
        actor: t("actor"),
        quote: t("quote"),
        types: lista("types"),
        modules: lista("modules"),
        maxRisk: t("max-risk") === "" ? "normal" : t("max-risk"),
        dailyQuota: Number(t("daily-quota") === "" ? "1" : t("daily-quota")),
        validDays: Number(t("valid-days") === "" ? "30" : t("valid-days")),
        source: t("source") === "" ? "cli" : t("source"),
        ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
        ...(opciones.env === undefined ? {} : { env: opciones.env }),
      });
      return ok(
        `Autorización ${a.id} creada por ${a.actor}: tipos ${a.types.join(", ")}; módulos ${a.modules.join(", ")}; ` +
          `riesgo hasta ${a.maxRisk}; cupo ${a.dailyQuota}/día; vigente hasta ${a.validUntil.slice(0, 10)}.\n` +
          `Revocarla: valmen qa-authorize revoke --id ${a.id} --actor <tú> --reason "<motivo>"\n`,
      );
    }
    if (accion === "revoke") {
      const r = revocarAutorizacion({
        root,
        id: t("id"),
        actor: t("actor"),
        reason: t("reason"),
        source: t("source") === "" ? "cli" : t("source"),
        ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
        ...(opciones.env === undefined ? {} : { env: opciones.env }),
      });
      return ok(`Autorización ${r.id} revocada por ${r.actor}: ninguna política posterior cierra tickets con ella.\n`);
    }
    if (accion === "list") {
      const todas = leerAutorizaciones(root, opciones.ahora ?? new Date());
      if (todas.length === 0) return ok("No hay autorizaciones de QA por agente.\n");
      return ok(
        todas
          .map((a) => `${a.id} · ${a.estado} · ${a.types.join(",")} · ${a.modules.join(",")} · ${a.actor}: «${a.quote}»`)
          .join("\n") + "\n",
      );
    }
    if (accion === "link") {
      const secret = opciones.secret === undefined ? approvalSecret() : opciones.secret;
      if (secret === null) return error("No hay secreto para firmar el código (aprobacion.secret o VALMEN_APPROVAL_SECRET).", EXIT_SCHEMA);
      if ((opciones.env ?? process.env)["VALMEN_UNATTENDED"] === "1") {
        return error("Una sesión desatendida no puede emitir un código de autorización de QA: esa autoridad es de una persona.", EXIT_INVARIANT);
      }
      const e = emitirCodigoDeAutorizacion({
        root,
        secret,
        terminos: {
          types: lista("types"),
          modules: lista("modules"),
          maxRisk: t("max-risk") === "" ? "normal" : t("max-risk"),
          dailyQuota: Number(t("daily-quota") === "" ? "1" : t("daily-quota")),
          validDays: Number(t("valid-days") === "" ? "30" : t("valid-days")),
        },
        ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
      });
      return ok(
        `Código ${e.code} (un solo uso, vale hasta ${e.expiresAt}): tipos ${e.terminos.types.join(", ")}; módulos ${e.terminos.modules.join(", ")}; ` +
          `riesgo hasta ${e.terminos.maxRisk}; cupo ${e.terminos.dailyQuota}/día; ${e.terminos.validDays} días.\n` +
          `Canjearlo: valmen qa-authorize redeem --code ${e.code} --actor <tú> --quote "<tu frase>" (exige la fuente ${FUENTE_ENLACE_FIRMADO} en qa-authorization-sources).\n`,
      );
    }
    if (accion === "redeem") {
      const secret = opciones.secret === undefined ? approvalSecret() : opciones.secret;
      if (secret === null) return error("No hay secreto para verificar el código (aprobacion.secret o VALMEN_APPROVAL_SECRET).", EXIT_SCHEMA);
      const a = canjearCodigoDeAutorizacion({
        root,
        secret,
        codigo: t("code"),
        actor: t("actor"),
        quote: t("quote"),
        ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
        ...(opciones.env === undefined ? {} : { env: opciones.env }),
      });
      return ok(`Autorización ${a.id} creada por ${a.actor} con el código firmado; vigente hasta ${a.validUntil.slice(0, 10)}.\n`);
    }
    if (accion === "revoke-code") {
      revocarCodigoDeAutorizacion({
        root,
        codigo: t("code"),
        actor: t("actor"),
        ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
        ...(opciones.env === undefined ? {} : { env: opciones.env }),
      });
      return ok(`Código ${t("code")} revocado: ya no se puede canjear.\n`);
    }
    return error("qa-authorize admite: create, revoke, list, link, redeem o revoke-code.", EXIT_SCHEMA);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `ux review --id <ID> [--report <ruta>] [--staged]`: anexa al ticket la revisión de UX del cambio.
 *
 * Es evidencia, no un gate: sale con 0 con o sin hallazgos.
 */
export function uxReviewCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  try {
    const id = flags["id"];
    if (typeof id !== "string" || id === "") return error("ux review requiere --id <TICKET-ID>.", EXIT_SCHEMA);
    const informe = flags["report"];
    const revision = revisarUx({
      paths,
      ticketId: id,
      informe: typeof informe === "string" && informe !== "" ? informe : undefined,
      staged: flags["staged"] === true,
    });
    return ok(`${revision.descripcion}\n${revision.evidencia ?? "No se anexó evidencia."}\n`);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `skills external`: lista las skills de terceros declaradas en `external-skills`.
 *
 * Solo lee: no descarga, no instala y no actualiza nada.
 */
export function skillsExternalCommand(root: string): CommandResult {
  try {
    const skills = estadoDeSkillsExternas(root);
    if (skills.length === 0) return ok("No hay skills de terceros declaradas (clave external-skills).\n");
    return ok(
      skills.map((k) => `${k.id} · ${k.estado} · versión ${k.version} · ${k.source} · sha256:${k.sha256.slice(0, 12)}…\n    ${k.motivo}`).join("\n") +
        "\nDeclarar no instala ni habilita nada: la habilitación exige una revisión registrada sobre el hash del contenido.\n",
    );
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `skills review <id> --actor <nombre> --quote "<frase>" --permissions "<permisos>"`.
 *
 * Registra la revisión de una persona sobre el contenido actual de una skill de terceros; se rechaza
 * en una sesión desatendida y si el contenido no coincide con el hash declarado.
 */
export function skillsReviewCommand(
  root: string,
  id: string | undefined,
  flags: Readonly<Record<string, string | true>>,
  opciones: { readonly ahora?: Date; readonly env?: Readonly<Record<string, string | undefined>> } = {},
): CommandResult {
  const t = (n: string): string => (typeof flags[n] === "string" ? (flags[n] as string) : "");
  if (id === undefined || id === "") return error("skills review requiere el identificador de la skill.", EXIT_SCHEMA);
  try {
    const r = registrarRevisionDeSkill({
      root,
      id,
      actor: t("actor"),
      quote: t("quote"),
      permissions: t("permissions"),
      ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
      ...(opciones.env === undefined ? {} : { env: opciones.env }),
    });
    return ok(`Revisión de ${r.id} registrada por ${r.actor} sobre sha256:${r.sha256.slice(0, 12)}… (versión ${r.skillVersion}). Permisos: ${r.permissions}.\n`);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `approval-authorize create|revoke|list`: la autorización de aprobación automática (R-APRO-001).
 *
 * La crea o revoca una persona: se rechaza en una sesión desatendida y desde una fuente que el
 * proyecto no declara en `approval-authorization-sources`.
 */
export function approvalAuthorizeCommand(
  root: string,
  accion: string | undefined,
  flags: Readonly<Record<string, string | true>>,
  opciones: { readonly ahora?: Date; readonly env?: Readonly<Record<string, string | undefined>>; readonly secret?: string | null } = {},
): CommandResult {
  const t = (n: string): string => (typeof flags[n] === "string" ? (flags[n] as string) : "");
  const lista = (n: string): string[] => t(n).split(",").map((x) => x.trim()).filter((x) => x !== "");
  try {
    if (accion === "link") {
      const secret = opciones.secret === undefined ? approvalSecret() : opciones.secret;
      if (secret === null) return error("No hay secreto para firmar el código (aprobacion.secret o VALMEN_APPROVAL_SECRET).", EXIT_SCHEMA);
      if ((opciones.env ?? process.env)["VALMEN_UNATTENDED"] === "1") {
        return error("Una sesión desatendida no puede emitir un código de autorización de aprobación: esa autoridad es de una persona.", EXIT_INVARIANT);
      }
      const e = emitirCodigoDeAutorizacionDeAprobacion({
        root,
        secret,
        terminos: {
          types: lista("types"),
          modules: lista("modules"),
          maxRisk: t("max-risk") === "" ? "normal" : t("max-risk"),
          impacts: lista("impacts"),
          stages: t("stages") === "" ? ["analysis", "plan"] : lista("stages"),
          mode: t("mode") === "" ? "on-approve" : t("mode"),
          dailyQuota: Number(t("daily-quota") === "" ? "1" : t("daily-quota")),
          validDays: Number(t("valid-days") === "" ? "30" : t("valid-days")),
        },
        ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
      });
      return ok(
        `Código ${e.code} (un solo uso, vale hasta ${e.expiresAt}): tipos ${e.terminos.types.join(", ")}; módulos ${e.terminos.modules.join(", ")}; ` +
          `riesgo hasta ${e.terminos.maxRisk}; impactos: ${e.terminos.impacts.length === 0 ? "ninguno" : e.terminos.impacts.join(", ")}; ` +
          `etapas ${e.terminos.stages.join(", ")}; modo ${e.terminos.mode}; cupo ${e.terminos.dailyQuota}/día; ${e.terminos.validDays} días.\n` +
          `Canjearlo: valmen approval-authorize redeem --code ${e.code} --actor <tú> --quote "<tu frase>" (exige la fuente ${FUENTE_ENLACE_FIRMADO_APROBACION} en approval-authorization-sources).\n`,
      );
    }
    if (accion === "redeem") {
      const secret = opciones.secret === undefined ? approvalSecret() : opciones.secret;
      if (secret === null) return error("No hay secreto para verificar el código (aprobacion.secret o VALMEN_APPROVAL_SECRET).", EXIT_SCHEMA);
      const a = canjearCodigoDeAutorizacionDeAprobacion({
        root,
        secret,
        codigo: t("code"),
        actor: t("actor"),
        quote: t("quote"),
        ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
        ...(opciones.env === undefined ? {} : { env: opciones.env }),
      });
      return ok(`Autorización ${a.id} creada por ${a.actor} con el código firmado; vigente hasta ${a.validUntil.slice(0, 10)}.\n`);
    }
    if (accion === "revoke-code") {
      revocarCodigoDeAutorizacionDeAprobacion({
        root,
        codigo: t("code"),
        actor: t("actor"),
        ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
        ...(opciones.env === undefined ? {} : { env: opciones.env }),
      });
      return ok(`Código ${t("code")} revocado: ya no se puede canjear.\n`);
    }
    if (accion === "create") {
      const a = crearAutorizacionDeAprobacion({
        root,
        actor: t("actor"),
        quote: t("quote"),
        types: lista("types"),
        modules: lista("modules"),
        maxRisk: t("max-risk") === "" ? "normal" : t("max-risk"),
        impacts: lista("impacts"),
        stages: t("stages") === "" ? ["analysis", "plan"] : lista("stages"),
        mode: t("mode") === "" ? "on-approve" : t("mode"),
        dailyQuota: Number(t("daily-quota") === "" ? "1" : t("daily-quota")),
        validDays: Number(t("valid-days") === "" ? "30" : t("valid-days")),
        source: t("source") === "" ? "cli" : t("source"),
        ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
        ...(opciones.env === undefined ? {} : { env: opciones.env }),
      });
      return ok(
        `Autorización ${a.id} creada por ${a.actor}: tipos ${a.types.join(", ")}; módulos ${a.modules.join(", ")}; ` +
          `riesgo hasta ${a.maxRisk}; impactos admitidos: ${a.impacts.length === 0 ? "ninguno" : a.impacts.join(", ")}; ` +
          `etapas ${a.stages.join(", ")}; modo ${a.mode}; cupo ${a.dailyQuota}/día; vigente hasta ${a.validUntil.slice(0, 10)}.\n` +
          `Revocarla: valmen approval-authorize revoke --id ${a.id} --actor <tú> --reason "<motivo>"\n`,
      );
    }
    if (accion === "revoke") {
      const r = revocarAutorizacionDeAprobacion({
        root,
        id: t("id"),
        actor: t("actor"),
        reason: t("reason"),
        source: t("source") === "" ? "cli" : t("source"),
        ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
        ...(opciones.env === undefined ? {} : { env: opciones.env }),
      });
      return ok(`Autorización ${r.id} revocada por ${r.actor}: ninguna aprobación posterior se hace con ella.\n`);
    }
    if (accion === "list") {
      const todas = leerAutorizacionesDeAprobacion(root, opciones.ahora ?? new Date());
      if (todas.length === 0) return ok("No hay autorizaciones de aprobación automática.\n");
      return ok(
        todas
          .map(
            (a) =>
              `${a.id} · ${a.estado} · ${a.types.join(",")} · ${a.modules.join(",")} · modo ${a.mode} · ${a.actor}: «${a.quote}»` +
              (a.estado === "vigente" ? `\n    revertir: ${comandoDeRevocacionDeAprobacion(a.id)}` : ""),
          )
          .join("\n") + "\n",
      );
    }
    return error("approval-authorize admite: create, revoke, list, link, redeem o revoke-code.", EXIT_SCHEMA);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/** `approval-authorize approvals`: las aprobaciones automáticas registradas, con su autorización (R-APRO-007). */
export function approvalAuthorizationApprovalsCommand(paths: RegistryPaths): CommandResult {
  try {
    const { aprobaciones, omitidos } = listarAprobacionesAutomaticas(paths);
    const lineas = aprobaciones.map(
      (a) =>
        `${a.ticket} · ${a.etapa} · ${a.autorizacion} (${a.hash.slice(0, 19)}…) · recibo ${a.recibo === "" ? "(sin recibo)" : a.recibo} · modo ${a.modo} · ${a.en} · autorización ${a.estado}`,
    );
    if (lineas.length === 0) lineas.push("No hay aprobaciones automáticas registradas.");
    if (omitidos.length > 0) lineas.push(`Se omitieron ${omitidos.length} ticket(s) ilegibles: ${omitidos.join(", ")}.`);
    return ok(lineas.join("\n") + "\n");
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `qa-eligibility --id <ID> [--base <commit>]`: muestra si un ticket es elegible para QA por agente.
 *
 * Decide en código —sin modelo— las seis reglas de R-QAAG-002 y sale con el código de invariante si
 * el ticket no es elegible. Sin `--base` el diff se toma como vacío.
 */
export function qaEligibilityCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const id = typeof flags["id"] === "string" ? flags["id"] : "";
  if (id === "") return error("qa-eligibility requiere --id <TICKET-ID>.", EXIT_SCHEMA);
  try {
    const base = typeof flags["base"] === "string" ? flags["base"] : null;
    const resultado = elegibilidadQa({
      paths,
      ticketId: id,
      archivosDelDiff: base === null ? [] : archivosDelDiff(paths.root, base),
    });
    const lineas = [
      `Elegibilidad para QA por agente — ${id}: ${resultado.elegible ? "ELEGIBLE" : "NO ELEGIBLE"}`,
      ...resultado.reglas.map((r) => `  ${r.cumple ? "✓" : "✗"} ${r.regla}: ${r.detalle}`),
      ...(resultado.autorizacion === null ? [] : [`Respaldada por la autorización ${resultado.autorizacion.id}.`]),
    ];
    return resultado.elegible
      ? ok(`${lineas.join("\n")}\n`)
      : { stdout: `${lineas.join("\n")}\n`, stderr: "", exitCode: EXIT_INVARIANT };
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/** El revisor y los productores de una revisión, en una línea cada uno. */
function lineasDeRevision(
  preparacion: PreparacionDeRevision | ResultadoDeRevision,
): string[] {
  const productores =
    preparacion.productores.length === 0
      ? "ninguno registrado"
      : preparacion.productores.map((p) => `${p.modelo} (${p.ejecutor}, fase ${p.fase})`).join(", ");
  const revisor =
    preparacion.revisor === null
      ? "sin resolver"
      : "source" in preparacion.revisor
        ? `${preparacion.revisor.provider} ${preparacion.revisor.model} (esfuerzo ${preparacion.revisor.effort}, origen ${preparacion.revisor.source})`
        : `${preparacion.revisor.provider} ${preparacion.revisor.model} (esfuerzo ${preparacion.revisor.effort}, versión ${preparacion.revisor.resolvedVersion})`;
  return [
    `Recibo:       ${preparacion.reciboId ?? "ninguno"}`,
    `Productores:  ${productores}`,
    `Revisor:      ${revisor}`,
    `Proposiciones en banda media: ${preparacion.proposiciones.length}`,
    ...preparacion.proposiciones.map(
      (p) =>
        `  - ${p.id} (valor ${p.valor.toFixed(2)})` +
        `${p.descripcion === undefined ? "" : `: ${p.descripcion}`}` +
        `${p.motivo === null ? "" : ` — ${p.motivo}`}`,
    ),
  ];
}

/**
 * `review-agent --id <ID> --stage analysis|plan [--dry-run] [--json]`: el revisor de un `review`.
 *
 * Es de solo lectura (R-APRO-003): elige al revisor —un modelo distinto del que produjo el
 * artefacto—, le pasa el artefacto y las proposiciones en banda media, e imprime su decisión.
 * No la guarda ni mueve el ticket, salvo con `--record` (SECURITY-ENGINE-APROBACION-POR-REVISOR), que
 * la registra como decisión del revisor tras las barreras del motor. Con `--dry-run` muestra productor, revisor y proposiciones
 * sin llamar al modelo. Sale con 3 si la revisión no procede (el recibo no está en `review`,
 * el productor se desconoce o coincide con el revisor) o si el modelo no contesta en el esquema.
 */
export async function reviewAgentCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
  opciones: Parameters<typeof ejecutarRevisor>[1] = {},
): Promise<CommandResult> {
  const id = typeof flags["id"] === "string" ? flags["id"] : "";
  if (id === "") return error("review-agent requiere --id <TICKET-ID>.", EXIT_SCHEMA);
  const etapa = typeof flags["stage"] === "string" ? flags["stage"] : "";
  if (!(ETAPAS_REVISABLES as readonly string[]).includes(etapa)) {
    return error(
      `review-agent requiere --stage ${ETAPAS_REVISABLES.join("|")}.`,
      EXIT_SCHEMA,
    );
  }
  const json = flags["json"] === true;
  const dryRun = flags["dry-run"] === true;

  try {
    const preparacion = prepararRevision({ paths, ticketId: id, etapa: etapa as EtapaRevisable });

    if (!preparacion.ok) {
      const cuerpo = json
        ? `${JSON.stringify({ modo: dryRun ? "dry-run" : "ejecucion", ejecutado: false, ...preparacion }, null, 2)}\n`
        : `Revisión de ${id} — etapa ${etapa}: NO PROCEDE\n${lineasDeRevision(preparacion).join("\n")}\n` +
          `Motivo: ${preparacion.motivo}\nNo se llamó al modelo.\n`;
      return { stdout: cuerpo, stderr: "", exitCode: EXIT_INVARIANT };
    }

    if (dryRun) {
      return ok(
        json
          ? `${JSON.stringify({ modo: "dry-run", ejecutado: false, ...preparacion }, null, 2)}\n`
          : `Revisión de ${id} — etapa ${etapa} (dry-run: no se llamó al modelo)\n` +
              `${lineasDeRevision(preparacion).join("\n")}\n` +
              `Artefacto a enviar: ${preparacion.artefacto.length} caracteres.\n`,
      );
    }

    const resultado = await ejecutarRevisor(preparacion, opciones);
    const guardada =
      flags["record"] === true
        ? registrarDecisionDelRevisor({ paths, ticketId: id, resultado })
        : null;
    if (json) {
      return ok(
        `${JSON.stringify({ modo: "ejecucion", ejecutado: true, registrado: guardada !== null, ...resultado, ...(guardada === null ? {} : { registro: guardada }) }, null, 2)}\n`,
      );
    }
    return ok(
      [
        `Revisión de ${id} — etapa ${etapa}`,
        ...lineasDeRevision(resultado),
        `Decisión del revisor: ${resultado.decision}`,
        `Razón: ${resultado.reason}`,
        ...resultado.porProposicion.map(
          (p) => `  ${p.respaldada ? "respaldada " : "SIN respaldo"} ${p.id}: ${p.motivo}`,
        ),
        `Consumo: ${resultado.usage.inputTokens} tokens de entrada, ${resultado.usage.outputTokens} de salida, ` +
          `${resultado.usage.costUsd} USD, ${resultado.latencyMs} ms.`,
        ...(guardada === null
          ? ["No se registró: la decisión no se guardó en el recibo ni en el ticket, no movió el estado y no consumió cupo."]
          : [
              `Registrada como decisión del revisor en el recibo ${guardada.receiptId} (autorización ${guardada.authorizationId}).`,
              guardada.decision === "approve"
                ? `Consumió un cupo; quedan ${guardada.cupoRestante} hoy. Evento: ${guardada.accion}.`
                : `No consumió cupo (quedan ${guardada.cupoRestante} hoy): el recibo sigue esperando a una persona.`,
            ]),
        "",
      ].join("\n"),
    );
  } catch (caught) {
    const failure = toFailure(caught);
    const delModelo = caught instanceof Error && caught.name === "JudgeError";
    return error(
      delModelo
        ? `El revisor no devolvió una decisión válida: ${failure.message}\nNo se registró nada.`
        : failure.message,
      delModelo ? EXIT_INVARIANT : failure.exitCode,
    );
  }
}

/**
 * `approval-eligibility --id <ID> --stage analysis|plan [--json]`: muestra si el análisis o el plan de
 * un ticket puede aprobarse por una autorización (R-APRO-004 y R-APRO-005).
 *
 * Decide en código —sin modelo— y es de solo lectura: no registra la aprobación, no consume cupo ni
 * mueve el ticket. Sale con el código de invariante si el ticket no es elegible.
 */
export function approvalEligibilityCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
  opciones: { readonly ahora?: Date } = {},
): CommandResult {
  const id = typeof flags["id"] === "string" ? flags["id"] : "";
  if (id === "") return error("approval-eligibility requiere --id <TICKET-ID>.", EXIT_SCHEMA);
  const etapa = typeof flags["stage"] === "string" ? flags["stage"] : "";
  if (etapa === "") return error("approval-eligibility requiere --stage analysis|plan.", EXIT_SCHEMA);
  try {
    const resultado = elegibilidadDeAprobacion({
      paths,
      ticketId: id,
      etapa,
      ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
    });
    const salida = resultado.elegible ? EXIT_OK : EXIT_INVARIANT;
    if (flags["json"] === true) {
      return { stdout: `${JSON.stringify(resultado, null, 2)}\n`, stderr: "", exitCode: salida };
    }
    const lineas = [
      `Elegibilidad para aprobar por autorización — ${id} (${etapa}): ${resultado.elegible ? "ELEGIBLE" : "NO ELEGIBLE"}`,
      ...resultado.reglas.map((r) => `  ${r.cumple ? "✓" : "✗"} ${r.regla}: ${r.detalle}`),
      ...(resultado.autorizacion === null ? [] : [`Respaldada por la autorización ${resultado.autorizacion.id} (${resultado.autorizacion.hash}).`]),
      ...(resultado.derivableAlRevisor ? ["Derivable al revisor: solo la compuerta en review impide la aprobación y la autorización es de modo reviewer."] : []),
    ];
    return { stdout: `${lineas.join("\n")}\n`, stderr: "", exitCode: salida };
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `approve-by-authorization`: registra la aprobación del análisis o del plan atribuida a la
 * autorización vigente que cubre al ticket y consume un cupo (R-APRO-002). Dice qué autorización
 * usó y cuánto cupo queda, o las reglas que fallan.
 */
export function approveByAuthorizationCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
  opciones: { readonly ahora?: Date; readonly env?: Readonly<Record<string, string | undefined>> } = {},
): CommandResult {
  const id = typeof flags["id"] === "string" ? flags["id"] : "";
  if (id === "") return error("approve-by-authorization requiere --id <TICKET-ID>.", EXIT_SCHEMA);
  const etapa = typeof flags["stage"] === "string" ? flags["stage"] : "";
  if (etapa === "") return error("approve-by-authorization requiere --stage analysis|plan.", EXIT_SCHEMA);
  try {
    const r = aprobarPorAutorizacion({
      paths,
      ticketId: id,
      etapa,
      ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
      ...(opciones.env === undefined ? {} : { env: opciones.env }),
    });
    const lineas = [
      r.registrada
        ? `Aprobación de ${etapa} registrada para ${id}, atribuida a la autorización ${r.autorizacion.id} (${r.autorizacion.hash}).`
        : `${id} ya tenía una aprobación de ${etapa} vigente de la autorización ${r.autorizacion.id}; no se escribió nada ni se consumió cupo.`,
      `Recibo ${r.receiptId}. Cupo que queda hoy en la autorización: ${r.cupoRestante}.`,
    ];
    return { stdout: `${lineas.join("\n")}\n`, stderr: "", exitCode: EXIT_OK };
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `qa-shadow`: la concordancia del periodo en sombra (R-QAAG-008), por ticket, con el modo efectivo.
 */
export function qaShadowCommand(paths: RegistryPaths): CommandResult {
  try {
    const { comparaciones, discordantes } = concordanciaEnSombra(paths);
    const modo = modoEfectivoDeQaAgent(paths);
    const lineas = [
      `QA por agente — modo efectivo: ${modo.modo}${modo.motivo === null ? "" : ` (${modo.motivo})`}`,
      `Comparados: ${comparaciones.length} de ${TICKETS_PARA_PROMOVER} · discrepancias: ${discordantes.length}`,
      ...comparaciones.map((c) => `  ${c.concordante ? "✓" : "✗"} ${c.ticketId}: agente ${c.agente}, responsable ${c.responsable}`),
    ];
    return ok(`${lineas.join("\n")}\n`);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/** `qa-promote --actor <nombre> --quote "<frase>"`: promueve la política a cerrar tickets. */
export function qaPromoteCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const texto = (n: string): string => (typeof flags[n] === "string" ? (flags[n] as string) : "");
  try {
    const p = promoverQaAgent({ paths, actor: texto("actor"), quote: texto("quote") });
    return ok(
      `Promoción registrada por ${p.actor} con ${p.evidence.total} ticket(s) concordantes. ` +
        "Para que cierre, declara `qa-agent.mode: close` en .valmen/config.yaml; volver a sombra es poner `shadow`.\n",
    );
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `qa-policy-close --id <ID>`: cierra el ciclo de QA por política (R-QAAG-006).
 *
 * Exige el recibo de `qa-agent` aprobado del commit actual, la elegibilidad y la autorización
 * vigente con cupo. Lo puede ejecutar una sesión desatendida: es su razón de ser, y la barrera son
 * esas condiciones, no la presencia de una persona.
 */
export function qaPolicyCloseCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const id = typeof flags["id"] === "string" ? flags["id"] : "";
  if (id === "") return error("qa-policy-close requiere --id <TICKET-ID>.", EXIT_SCHEMA);
  try {
    const r = cerrarQaPorPolitica({ paths, ticketId: id });
    return ok(
      `QA de ${id} aprobada por política: autorización ${r.authorization.id}, recibo ${r.receipt}, commit ${r.delivered.slice(0, 12)}.\n` +
        `Para reabrirlo: valmen transition --id ${id} --entity ticket --to changes_requested\n`,
    );
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `qa-agent --id <ID> --base <commit> --delivered <commit>`: la compuerta de QA por agente.
 *
 * Prueba en un worktree limpio con la configuración del commit base (R-QAAG-003/004/005), anexa el
 * recibo y sale con el código de invariante si no aprueba. No escribe en el ticket.
 */
export function qaAgentCommand(
  paths: RegistryPaths,
  flags: Readonly<Record<string, string | true>>,
): CommandResult {
  const texto = (n: string): string => (typeof flags[n] === "string" ? (flags[n] as string) : "");
  const id = texto("id");
  if (id === "" || texto("base") === "" || texto("delivered") === "") {
    return error("qa-agent requiere --id <TICKET-ID>, --base <commit> y --delivered <commit>.", EXIT_SCHEMA);
  }
  try {
    const r = correrQaAgent({ paths, ticketId: id, base: texto("base"), delivered: texto("delivered") });
    const lineas = [
      `qa-agent — ${id}: ${r.verdict === "approve" ? "APRUEBA" : "NO APRUEBA"}`,
      ...r.reasons.map((m) => `  ✗ ${m}`),
      ...(r.recibo === null ? [] : [`Contra el código base: ${r.recibo.resultadoContraBase}. Comandos: ${r.recibo.commands.length}.`]),
      ...(r.reciboPath === null ? [] : [`Recibo anexado en ${r.reciboPath}`]),
    ];
    return r.verdict === "approve"
      ? ok(`${lineas.join("\n")}\n`)
      : { stdout: `${lineas.join("\n")}\n`, stderr: "", exitCode: EXIT_INVARIANT };
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `journey clear-stop --project <id> --id <ticket> --actor <nombre>`: libera una parada.
 *
 * Una parada no se reintenta sola; esta es la decisión de una persona de que el despacho
 * pueda volver a elegir el ticket. Queda como un renglón más, nada se reescribe.
 */
export function journeyClearStopCommand(
  flags: Readonly<Record<string, string | true>>,
  opciones: { readonly home?: string } = {},
): CommandResult {
  const proyecto = typeof flags["project"] === "string" ? flags["project"] : undefined;
  const ticket = typeof flags["id"] === "string" ? flags["id"] : undefined;
  const actor = typeof flags["actor"] === "string" ? flags["actor"] : "";
  if (proyecto === undefined || ticket === undefined) {
    return error("journey clear-stop requiere --project <id> y --id <ticket>.", EXIT_SCHEMA);
  }
  try {
    const project = resolveAuthorizedProject({ projectId: proyecto, home: opciones.home ?? homedir() });
    liberarParada(project.paths, ticket, actor);
    return ok(`Parada de ${ticket} liberada por ${actor.trim()}: el despacho puede volver a elegirlo.\n`);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * El proyecto de `journey next` y `journey brief`: `--project`, o el `project-id` de la
 * configuración de la raíz. Falla con un mensaje si no hay ninguno de los dos.
 */
export function proyectoDeLaOla(
  flags: Readonly<Record<string, string | true>>,
  opciones: { readonly home?: string; readonly root?: string },
): ReturnType<typeof resolveAuthorizedProject> {
  const home = opciones.home ?? homedir();
  const explicito = typeof flags["project"] === "string" ? flags["project"] : undefined;
  if (explicito !== undefined) return resolveAuthorizedProject({ projectId: explicito, home });
  const configPath = join(opciones.root ?? process.cwd(), ".valmen", "config.yaml");
  const derivado = existsSync(configPath)
    ? readSharedProjectPolicy(parseConfig(readFileSync(configPath, "utf8"))).projectId
    : null;
  if (derivado === null) {
    throw new TicketError("Falta --project <id>: la raíz no declara un project-id en .valmen/config.yaml.", EXIT_SCHEMA);
  }
  return resolveAuthorizedProject({ projectId: derivado, home });
}

/** El aviso de árbol sucio para la salida de la ola y del brief: se calcula al consultar y no escribe nada. */
function avisoDeArbolSucio(root: string, propias?: Parameters<typeof advertenciaDeArbolSucio>[1]): string {
  try {
    const aviso = advertenciaDeArbolSucio(root, propias);
    return aviso === null ? "" : `\n${aviso}\n`;
  } catch {
    return "";
  }
}

/**
 * `journey next --wave [--concurrency <n>] [--journey <id>] [--project <id>]`: los tickets de la
 * jornada que se pueden despachar ahora a subagentes. Solo lectura: no escribe en el registro.
 */
export function journeyNextCommand(
  flags: Readonly<Record<string, string | true>>,
  opciones: { readonly home?: string; readonly root?: string; readonly ahora?: () => Date } = {},
): CommandResult {
  if (flags["wave"] !== true) return error("journey next requiere --wave.", EXIT_SCHEMA);
  let concurrency: number | undefined;
  if (flags["concurrency"] !== undefined) {
    const crudo = flags["concurrency"];
    concurrency = typeof crudo === "string" && /^\d+$/.test(crudo) ? Number(crudo) : Number.NaN;
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
      return error("--concurrency debe ser un entero de al menos 1.", EXIT_SCHEMA);
    }
  }
  try {
    return withAccessMode("ask", () => {
      const project = proyectoDeLaOla(flags, opciones);
      const ola = calcularOlaDeJornada({
        project,
        ...(typeof flags["journey"] === "string" ? { journeyId: flags["journey"] } : {}),
        ...(concurrency === undefined ? {} : { concurrency }),
        ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
      });
      const jornada = readJourneys(project).find((j) => j.journeyId === ola.journeyId);
      const propias = rutasPropiasDeLaJornada(project.paths, jornada?.tickets.map((t) => t.ticketId) ?? [], null);
      return ok(renderOlaDeJornada(ola) + avisoDeArbolSucio(project.root, propias));
    });
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `journey brief --id <ID> [--cliente <c>] [--project <id>]`: el brief autocontenido de un ticket
 * para un subagente. Solo lectura: no crea el worktree ni lanza nada.
 */
export function journeyBriefCommand(
  flags: Readonly<Record<string, string | true>>,
  opciones: { readonly home?: string; readonly root?: string } = {},
): CommandResult {
  const ticketId = typeof flags["id"] === "string" ? flags["id"] : undefined;
  if (ticketId === undefined) return error("journey brief requiere --id <ID>.", EXIT_SCHEMA);
  const cliente = flags["cliente"];
  if (cliente !== undefined && (typeof cliente !== "string" || !(EJECUTORES_CON_PERFIL as readonly string[]).includes(cliente))) {
    return error(`El cliente "${String(cliente)}" no es válido. Valores admitidos: ${EJECUTORES_CON_PERFIL.join(", ")}.`, EXIT_SCHEMA);
  }
  try {
    return withAccessMode("ask", () => {
      const project = proyectoDeLaOla(flags, opciones);
      const brief = armarBriefDeSubagente({
        project,
        ticketId,
        ...(cliente === undefined ? {} : { cliente: cliente as ClienteDeSesion }),
      });
      return ok(renderBriefDeSubagente(brief) + avisoDeArbolSucio(project.root));
    });
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}

/**
 * `journey install-trigger`: retirado. Responde con el aviso de retiro y no escribe nada, ni el
 * plist de launchd ni el script del job de Hermes.
 */
export function journeyInstallTriggerCommand(flags: Readonly<Record<string, string | true>> = {}): CommandResult {
  void flags; // ninguna bandera cambia la respuesta: no se escribe nada
  return retiroDelDisparador("`journey install-trigger`");
}

/**
 * `journey plan --project <id> (--feature <slug> | --tickets <a,b,c>) [--max <n>] [--to <destino>]`.
 *
 * Arma la jornada del día en el registro de jornadas del proyecto y envía el plan por el
 * canal de avisos (R-JORN-001). El proyecto se resuelve por su binding de la máquina, como
 * en `ver_jornadas`. Si el aviso falla, la jornada igual queda escrita y se dice.
 */
export function journeyPlanCommand(
  flags: Readonly<Record<string, string | true>>,
  runner?: CommandRunner,
): CommandResult {
  const texto = (nombre: string): string | undefined =>
    typeof flags[nombre] === "string" ? (flags[nombre] as string) : undefined;
  const proyecto = texto("project");
  if (proyecto === undefined) return error("journey plan requiere --project <id>.", EXIT_SCHEMA);
  try {
    const project = resolveAuthorizedProject({ projectId: proyecto });
    const destino = texto("to") ?? "";
    const tickets = texto("tickets");
    const maximo = texto("max");
    const jornada = armarJornada({
      project,
      ...(texto("feature") === undefined ? {} : { feature: texto("feature") as string }),
      ...(tickets === undefined
        ? {}
        : { tickets: tickets.split(",").map((id) => id.trim()).filter((id) => id !== "") }),
      ...(maximo === undefined ? {} : { maximo: Number(maximo) }),
      ...(destino === ""
        ? {}
        : {
            notificar: (cuerpo: string) => {
              const entrega = hermesSendChannel({
                target: destino,
                ...(runner === undefined ? {} : { runner }),
              }).notify({ subject: "Plan del día", body: cuerpo, key: `journey-plan:${cuerpo.split(":")[0] ?? ""}` });
              return { delivered: entrega.delivered, detail: entrega.detail };
            },
          }),
    });
    const lineas = [jornada.plan];
    if (jornada.omitidos.length > 0) lineas.push(`Omitidos: ${jornada.omitidos.join("; ")}.`);
    if (jornada.aviso === null) {
      lineas.push("Sin destino de aviso: la jornada quedó escrita y no se envió nada (--to telegram).");
    } else if (jornada.aviso.delivered) {
      lineas.push(`Aviso enviado a ${destino}. ${jornada.aviso.detail}`);
    } else {
      lineas.push(
        `La jornada quedó escrita, pero el aviso no se pudo enviar a ${destino}: ${jornada.aviso.detail}`,
      );
    }
    return ok(`${lineas.join("\n")}\n`);
  } catch (caught) {
    const failure = toFailure(caught);
    return error(failure.message, failure.exitCode);
  }
}
