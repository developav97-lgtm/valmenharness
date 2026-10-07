/**
 * Comando `gate`: evalúa un gate contra un ticket.
 *
 * Flujo completo de una evaluación:
 *
 * 1. Se lee el ticket y se extrae el contexto que la evaluación necesita.
 * 2. Se **congela** ese contexto y se calcula su hash. Lo que se envió al
 *    evaluador queda determinado y reproducible.
 * 3. Se envían todas las proposiciones en **una sola llamada**.
 * 4. La decisión la toma el código, comparando probabilidades contra umbrales.
 * 5. Se emite un recibo con el estado, las respuestas, la versión exacta del
 *    modelo y el coste.
 *
 * En modo `human` o cuando la decisión es `review`, el comando **no avanza el
 * ticket**: entrega el recibo y deja la decisión pendiente. Un gate no cambia
 * estados por su cuenta.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  EXIT_INVARIANT,
  TicketError,
  declaredImpactIds,
  parseTicket,
  toFailure,
} from "@valmen/core";
import {
  MAX_CRITERIA_PROPOSITIONS,
  type CommandCheckSpec,
  type CriterionSpec,
  type GateDecision,
  type GatePolicy,
  type MechanicalCheck,
  type PropositionAnswer,
  type FormaDeCriterio,
  analizarFormaDeCriterios,
  buildReceipt,
  commandChecksFor,
  criterionPropositionId,
  decide,
  extractCriteriaSpecs,
  gateById,
  gateFor,
  hashEvaluatorConfig,
  hashState,
  partitionByApplicability,
  type NotApplicableRecord,
  summarizeReceipt,
  weightedMean,
} from "@valmen/gate";
import { parseConfig, readJevPropositions, type JevStage } from "@valmen/adapter";
import { evaluateWithJev } from "@valmen/gate-jev";
import { type CommandCheck } from "@valmen/gate-command";
import { type CascadeOptions, type EvaluatorId, evaluateGate } from "./evaluators.js";

import type { RunnerResult } from "./result.js";
import {
  type RegistryPaths,
  configList,
  findTicket,
  gateThresholds,
  playwrightConfig,
  testTimeout,
  verifyDevConfig,
} from "./discovery.js";
import { buildGateState, runMechanicalChecks } from "./state.js";
import { appendReceipt, currentReceipts, readReceipts } from "./receipts.js";
import { interfazDelTicket } from "./interfaz.js";
import { resolveGateMode } from "./gate-promotion.js";
import { runTestSetup } from "./test-setup.js";
import { decideInCode, renderPreReview, reviewBeforeGate } from "./revision-previa.js";
import { type ThresholdOutcome, applyThresholds, validateThresholdTargets } from "./thresholds.js";

/** Convierte preguntas ya validadas en proposiciones que el motor puro decide. */
function configuredPropositions(
  root: string,
  stage: JevStage,
): import("@valmen/gate").NoulProposition[] {
  let text: string;
  try {
    text = readFileSync(join(root, ".valmen", "config.yaml"), "utf8");
  } catch {
    return [];
  }
  return readJevPropositions(parseConfig(text))[stage].map((proposition) => ({
    id: proposition.id,
    kind: "noul" as const,
    description: proposition.description,
    instructions: proposition.instructions,
    criteria: proposition.criteria,
    weight: proposition.weight,
    policy: { approveAt: proposition.approveAt, blockAt: proposition.blockAt },
    verdict: proposition.verdict === "required",
  }));
}

function stageForGate(id: string): JevStage | null {
  return id === "analysis" || id === "plan" ? id : null;
}

/** Material que la integración futura debe decidir antes de invocar Git. */
export interface IntegrationValidation {
  readonly state: Readonly<Record<string, string>>;
  readonly propositions: readonly import("@valmen/gate").NoulProposition[];
}

export function buildIntegrationValidation(paths: RegistryPaths, ticketId: string): IntegrationValidation {
  const ticket = findTicket(paths, ticketId);
  if (ticket === undefined) throw new TicketError("La ruta canónica solicitada no existe.");
  const parsed = parseTicket(ticket.text);
  return {
    state: Object.freeze({
      ...buildGateState(ticket.text),
      solicitudOriginal: parsed.sections["Solicitud original"].trim(),
      planAprobado: parsed.sections.Plan.trim(),
      alcanceDeclarado: parsed.sections["Descripción funcional"].trim(),
    }),
    propositions: Object.freeze(configuredPropositions(paths.root, "integration")),
  };
}

/** Opciones de una evaluación de gate. */
export interface GateRunOptions {
  readonly gateId: string;
  readonly ticketId: string;
  /** Solo evalúa e informa; no escribe el recibo. */
  readonly dryRun?: boolean;
  /** Evaluador a usar. `auto` elige por las capacidades del gate. */
  readonly evaluator?: EvaluatorId;
  /** Comandos asociados a proposiciones, para el evaluador determinista. */
  readonly checks?: readonly CommandCheck[];
  /**
   * Modelos resueltos por el routing del proyecto.
   *
   * Vienen de fuera y no se leen aquí: el motor no sabe de configuración. Quien
   * llama —el CLI o Mission Control— resuelve el rol y pasa el modelo, así que
   * el recibo registra exactamente el que se usó.
   */
  readonly model?: string;
  /** Proveedor por el que hablar. Sin él, OpenRouter. */
  readonly provider?: string;
  /**
   * La clave ya resuelta por quien llama.
   *
   * Se acepta y se **reenvía** al evaluador porque el motor no lee credenciales:
   * quien tiene el archivo es el proceso que arranca —el CLI, Mission Control,
   * el servidor MCP—, y sin esta vía cada evaluador resolvía por su cuenta
   * contra el `$HOME`, que puede ser el de otro usuario.
   */
  readonly apiKey?: string;
  /** Resuelve la credencial de cada proveedor usado por una cascada. */
  readonly credentialForProvider?: (provider: string) => string | undefined;
  readonly effort?: "auto" | "low" | "medium" | "high";
  readonly judgeModel?: string;
  /** Evaluador semántico preferido por el routing del proyecto. */
  readonly semantic?: "jev" | "llm-judge";
  /**
   * Evaluador semántico inyectable, para pruebas.
   *
   * El nombre coincide con el del orquestador para que un mock se pueda pasar
   * tal cual: un parámetro con otro nombre que el orquestador ignora
   * silenciosamente convierte un test en una ilusión.
   */
  readonly jev?: typeof evaluateWithJev;
  /** Juez de chat inyectable, por la misma razón que `jev`. */
  readonly judge?: typeof import("@valmen/gate-llm-judge").evaluateWithJudge;
  /**
   * La cadena de la cascada, resuelta por el routing del proyecto.
   *
   * Viaja resuelta desde el borde por el mismo motivo que el modelo del
   * evaluador: el motor no lee configuración, y el recibo tiene que registrar
   * exactamente los modelos que se usaron.
   */
  readonly cascade?: CascadeOptions;
  /**
   * Notas que quien llama quiere dejar en el recibo.
   *
   * Existen porque hay decisiones que no cambian el veredicto y sí explican el
   * recibo: el corte de presupuesto degrada el preset de esta evaluación (R-S1-003),
   * y sin la nota el recibo mostraría otro modelo sin decir por qué. Se anexan a las
   * del análisis de forma de los criterios, que las calcula el gate.
   */
  readonly notes?: readonly string[];
  readonly now?: () => Date;
  readonly receiptId?: string;
  /**
   * El motivo para repetir una compuerta ya evaluada sobre el mismo estado.
   *
   * Sin él, pedir otra vez lo mismo se rechaza antes de llamar al modelo (R-CDEF-008).
   * Un motivo vacío no fuerza nada; el no vacío queda escrito en el recibo nuevo.
   */
  readonly forceReason?: string;
}

/** Ejecuta un gate y devuelve el recibo con el informe. */
/**
 * Los prefijos de comando que el proyecto autoriza a correr como verificación.
 *
 * Vive en `.valmen/config.yaml` y no en el ticket, y esa es la decisión que hace
 * segura la función: **el comando sale del ticket, y el ticket lo escribe quien el
 * gate tiene que controlar**. Sin una lista de prefijos, escribir un criterio
 * sería escribir una orden arbitraria que el gate ejecuta después, y un agente
 * podría ampliar su propia autoridad a través del artefacto que se le pide
 * evaluar. Con la lista, lo máximo que consigue es apuntar a un test que falla.
 *
 * Cuando el proyecto declara la sección `playwright:`, su comando **también** se
 * autoriza: la comprobación previa rechaza un ticket cuya única verificación sea
 * el verbo si el programa no figura entre los prefijos, y la sección es una
 * declaración legítima del proyecto. La disponibilidad del verbo la decide la
 * sección, no esta lista: que el comando esté acá solo evita el falso rechazo.
 */
export function testCommands(root: string): string[] {
  const declarados = configList(root, "test-commands");
  const playwright = playwrightConfig(root);
  if (playwright === null || declarados.includes(playwright.command)) return declarados;
  return [...declarados, playwright.command];
}

/**
 * Comprueba que cada criterio diga cómo se verifica.
 *
 * Devuelve el mensaje del problema, o `null` si se puede correr. Se hace acá y no
 * como check mecánico general porque el requisito es de **este** gate: los
 * criterios de un ticket en `analyzed` no tienen por qué declarar todavía cómo se
 * prueban, y exigírselo ahí frenaría el trabajo por algo que corresponde más
 * adelante.
 */
function revisarCriteriosVerificables(
  criteria: readonly CriterionSpec[],
  root: string,
  verifyDev: ReturnType<typeof verifyDevConfig>,
): string | null {
  const sinDeclarar = criteria.filter(
    (criterio) => criterio.command === null && !criterio.manual,
  );
  if (sinDeclarar.length > 0) {
    return (
      `${sinDeclarar.length} criterio(s) no declaran cómo se verifican:\n` +
      sinDeclarar.map((criterio) => `  · ${criterio.text}`).join("\n") +
      "\nAgregue debajo de cada uno `<!-- test: <comando> -->` o " +
      "`<!-- verify: manual -->`. Un criterio sin ninguna de las dos cosas deja la " +
      "verificación a la interpretación de quien lo lea, y se resuelve a favor de " +
      "«seguramente está bien».\n"
    );
  }

  if (criteria.some((criterio) => criterio.dev) && verifyDev === null) {
    return (
      "Un criterio declara `<!-- verify: dev -->`, pero el proyecto no declara el ambiente de desarrollo.\n" +
      "Agregue a `.valmen/config.yaml`:\n\n" +
      "  verify-dev:\n" +
      "    url: https://dev.ejemplo.test\n" +
      "    branch: dev  # opcional\n\n" +
      "La validación dev es una promesa explícita a la persona: sin URL no se puede " +
      "saber qué ambiente debe comprobar.\n"
    );
  }

  // Todos manuales: no hay nada que correr. **No es un fallo** —una pantalla que
  // hay que mirar no se automatiza— y el gate lo dice con un `review` en vez de
  // aprobar por vacuidad, que es lo que haría un gate sin proposiciones.
  const conTest = criteria.filter((criterio) => criterio.command !== null);
  if (conTest.length === 0) return null;

  if (testCommands(root).length === 0) {
    return (
      "El proyecto no declara qué comandos puede correr como verificación.\n" +
      "Agregue a `.valmen/config.yaml`:\n\n" +
      "  test-commands:\n" +
      "    - npx vitest run\n\n" +
      "Sin esa lista no se ejecuta nada desde un ticket, y es a propósito: el comando " +
      "sale del ticket, y el ticket lo escribe quien el gate controla.\n"
    );
  }

  return null;
}

/**
 * El aviso de forma: por qué un artefacto completo queda en banda de revisión.
 *
 * Un criterio se despliega como una proposición atómica, así que uno que agrupa
 * varias afirmaciones cae en 0.87–0.89 contra un umbral de 0.90 y el recibo
 * termina diciendo `criterio_04 en banda de revisión`: eso manda a mirar el
 * contenido del plan, y el problema está en cómo está escrito el criterio.
 *
 * Es una regla sobre números que ya existen —no evalúa nada, no llama a nadie y no
 * toca la política— y **no cambia el veredicto**: si además hay un hueco real, o
 * algo que no es un criterio quedó en banda, calla. Un aviso que despejara la banda
 * sería la puerta de atrás que R-S5-007 prohíbe.
 */
function avisoDeForma(
  decision: GateDecision,
  criteria: readonly CriterionSpec[],
  policy: GatePolicy,
): string[] {
  if (decision.outcome !== "review") return [];

  const porId = new Map(
    analizarFormaDeCriterios(criteria).map((forma) => [
      criterionPropositionId(forma.index),
      forma,
    ]),
  );

  // Solo cuentan las que emiten veredicto. Una descriptiva es contexto: puede
  // estar por debajo del umbral sin pedir nada, y no puede frenar el aviso.
  const enBanda = decision.propositions.filter(
    (proposicion) => proposicion.verdict && proposicion.inBand,
  );
  if (enBanda.length === 0) return [];

  // Si algo que no es un criterio quedó en banda, el artefacto tiene un problema
  // que partir un criterio no arregla.
  if (!enBanda.every((proposicion) => porId.has(proposicion.id))) return [];

  const compuestos = enBanda
    .map((proposicion) => porId.get(proposicion.id))
    .filter((forma): forma is FormaDeCriterio => forma !== undefined && forma.compuesto);
  if (compuestos.length === 0) return [];

  return [
    `Nada más quedó en banda: el umbral de aprobación es ${policy.approveAt} y lo único por ` +
      "debajo son criterios que agrupan varias afirmaciones.",
    ...compuestos.map(
      (forma) =>
        `· ${criterionPropositionId(forma.index)} — ${forma.motivos.join(", ")}: ${forma.text}`,
    ),
    "Una proposición compuesta puntúa por debajo del umbral aunque el plan la cubra entera, " +
      "así que lo que hay que replantear puede ser cómo está escrito el criterio y no lo que " +
      "el plan cubre. Partilo en criterios atómicos —una afirmación verificable cada uno— y " +
      "volvé a evaluar. El veredicto no cambia: sigue en revisión hasta que la banda se despeje.",
  ];
}

/**
 * El identificador por defecto de un recibo:
 * `GR-<fecha>-<ticket>-<compuerta>-<intento>`.
 *
 * Antes era `GR-<fecha>-<compuerta>`, sin ticket ni intento, y eso era un
 * identificador de día donde hacía falta uno de corrida: dos corridas del mismo
 * gate del mismo ticket el mismo día —un reintento tras un bloqueo— o dos
 * tickets distintos que corrían el mismo gate el mismo día compartían
 * identificador, y el colapso que existe para que la decisión humana no borre el
 * veredicto del modelo terminaba borrando corridas enteras y cruzando tickets.
 * El ticket va en el identificador porque dos tickets distintos que corren el
 * mismo gate el mismo día no pueden compartirlo: el número de intento es por
 * ticket y compuerta, así que sin el ticket en la clave los dos empezarían en 1.
 *
 * El intento es el próximo número libre para ese ticket y esa compuerta, leído de
 * los recibos ya escritos. Se toman los números de todos los ids —viejos y
 * nuevos— para no reutilizar uno: un recibo nuevo que repitiera el id de uno
 * viejo lo pisaría en el colapso, que es justo el defecto que se arregla. El
 * `receiptId` explícito sigue siendo el camino para forzar un identificador.
 */
function defaultReceiptId(
  paths: RegistryPaths,
  ticketId: string,
  gateId: string,
  now: () => Date,
): string {
  const fecha = now().toISOString().slice(0, 10).replace(/-/g, "");
  const prefijo = `GR-${fecha}-${ticketId}-${gateId}`;
  const patron = new RegExp(`^${prefijo}-(\\d+)$`);
  let mayor = 0;
  for (const recibo of readReceipts(paths, ticketId)) {
    const coincidencia = patron.exec(recibo.id);
    if (coincidencia !== null) mayor = Math.max(mayor, Number(coincidencia[1]));
  }
  return `${prefijo}-${mayor + 1}`;
}

export async function runGate(
  paths: RegistryPaths,
  options: GateRunOptions,
): Promise<RunnerResult> {
  const now = options.now ?? (() => new Date());

  let definition;
  try {
    definition = gateById(options.gateId);
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: failure.message, exitCode: 2 };
  }

  let effectiveMode;
  try {
    effectiveMode = resolveGateMode(paths, definition.id);
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: failure.message, exitCode: failure.exitCode };
  }

  const ticket = findTicket(paths, options.ticketId);
  if (ticket === undefined) {
    return {
      stdout: "",
      stderr: "La ruta canónica solicitada no existe.",
      exitCode: 2,
    };
  }

  // El gate solo aplica a ciertos estados. Comprobarlo antes de gastar una
  // llamada evita dos problemas: pagar por un veredicto sin significado, y
  // presentar ese veredicto como si dijera algo sobre el ticket.
  let workflow: string;
  try {
    workflow = parseTicket(ticket.text).fields.workflow_status;
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: failure.message, exitCode: failure.exitCode };
  }

  if (!definition.appliesTo.includes(workflow)) {
    return {
      stdout: "",
      stderr:
        `El gate ${definition.id} protege la transición ${definition.transition} y solo ` +
        `aplica a un ticket en ${definition.appliesTo.map((estado) => `\`${estado}\``).join(" o ")}. ` +
        `El ticket ${options.ticketId} está en \`${workflow}\`. ` +
        "Evaluarlo aquí produciría un veredicto sin significado.",
      exitCode: EXIT_INVARIANT,
    };
  }

  let state: Record<string, string>;
  let checks: MechanicalCheck[];
  let impacts: string[];
  try {
    state = buildGateState(ticket.text);
    checks = runMechanicalChecks(ticket.text);
    impacts = declaredImpactIds(parseTicket(ticket.text));
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: failure.message, exitCode: failure.exitCode };
  }

  // Una compuerta no se vuelve a evaluar sobre el mismo estado con el mismo evaluador:
  // repetirla solo busca otro número y cada repetición cuesta una llamada. Se comprueba
  // **antes** de llamar a nadie y no escribe recibo: un rechazo no es un veredicto. Solo
  // cuenta lo que produjo un modelo; lo que decide el código depende de un ambiente que
  // el hash del ticket no ve, y volver a correrlo tras arreglar el entorno es legítimo.
  const huellaDelEvaluador = hashEvaluatorConfig({
    evaluator: options.evaluator ?? null,
    model: options.model ?? null,
    provider: options.provider ?? null,
    effort: options.effort ?? null,
    judgeModel: options.judgeModel ?? null,
    semantic: options.semantic ?? null,
    cascade: options.cascade === undefined ? null : JSON.parse(JSON.stringify(options.cascade)),
  });
  const hashDelEstado = hashState(state);
  const previo = currentReceipts(readReceipts(paths, options.ticketId)).find(
    (recibo) => recibo.gate === definition.id,
  );
  const esRepeticion =
    previo !== undefined &&
    previo.stateHash === hashDelEstado &&
    previo.evaluatorKey === huellaDelEvaluador &&
    previo.evaluator !== undefined &&
    previo.evaluator !== "command";
  const motivoDeForzado = options.forceReason?.trim() ?? "";
  if (esRepeticion && motivoDeForzado === "") {
    return {
      stdout: "",
      stderr:
        `La compuerta ${definition.id} ya se evaluó sobre este mismo estado del ticket con la ` +
        `misma configuración del evaluador (recibo ${previo.id}: ${previo.outcome}). Repetirla ` +
        "solo busca otro número y cuesta una llamada. Cambie el ticket para que cambie lo que " +
        "se evalúa, o dé un motivo explícito con --force-reason «…» y quedará escrito en el " +
        "recibo nuevo.\n",
      exitCode: EXIT_INVARIANT,
    };
  }
  const forzado =
    esRepeticion && previo !== undefined
      ? { reason: motivoDeForzado, receiptId: previo.id }
      : undefined;

  // El gate mecánico no le pregunta nada a nadie: corre lo que los criterios
  // declaran. Antes de correr nada se comprueba que se pueda —cada criterio tiene
  // que decir cómo se verifica, y el comando tiene que estar entre los que el
  // proyecto autoriza—, porque un gate que corre lo que le escriben en el ticket
  // sería un gate que obedece al artefacto que evalúa.
  if (definition.commandPropositions === true) {
    const dev = verifyDevConfig(paths.root);
    const problema = revisarCriteriosVerificables(
      extractCriteriaSpecs(state["criterios"] ?? ""),
      paths.root,
      dev,
    );
    if (problema !== null) {
      return { stdout: "", stderr: problema, exitCode: EXIT_INVARIANT };
    }
  }

  // El gate se expande con el sujeto: una proposición por criterio de aceptación
  // y una por impacto declarado, en vez de preguntas compuestas que el evaluador
  // no sabe responder. Medido: la compuesta acierta el 7%, las atómicas el 62%.
  const criteria = extractCriteriaSpecs(state["criterios"] ?? "");
  let gate;
  try {
    const stage = stageForGate(definition.id);
    gate = gateFor(definition, {
      criteria,
      impacts,
      interfaz: interfazDelTicket({
        texto: ticket.text,
        comandos: testCommands(paths.root),
        playwright: playwrightConfig(paths.root),
      }),
      ...(stage === null ? {} : { additional: configuredPropositions(paths.root, stage) }),
    });
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: failure.message, exitCode: failure.exitCode };
  }

  // La aplicabilidad por tipo la decide el código, antes de preguntar nada: una
  // proposición que no aplica al tipo del ticket no se envía al evaluador y queda en el
  // recibo como `no_aplica` (R-CPRE-001). Si el filtro no deja ninguna no se evalúa:
  // decidir sin proposiciones aprobaría por vacuidad.
  let noAplican: NotApplicableRecord[] = [];
  const respuestasDeCodigo: PropositionAnswer[] = [];
  // Cuántas proposiciones tenía la compuerta ya expandida, antes de filtrar por tipo: el
  // informe dice si hubo expansión comparando contra la definición, y filtrar no es expandir.
  const totalExpandido = gate.propositions.length;
  try {
    const tipo = parseTicket(ticket.text).fields.type;
    const partido = partitionByApplicability(gate.propositions, tipo);
    if (gate.propositions.length > 0 && partido.applicable.length === 0) {
      return {
        stdout: "",
        stderr:
          `Ninguna proposición de la compuerta ${definition.id} aplica a un ticket ${tipo}: ` +
          "evaluarla aprobaría por vacuidad. Revise `appliesTo` de sus proposiciones.\n",
        exitCode: EXIT_INVARIANT,
      };
    }
    noAplican = partido.notApplicable;
    gate = { ...gate, propositions: partido.applicable };
    // Lo que el código decide no se le pregunta al modelo y vota igual (R-CPRE-009).
    for (const proposicion of partido.applicable) {
      if (proposicion.decidedInCode !== true) continue;
      const valor = decideInCode(proposicion.id, ticket.text);
      if (valor === null) {
        return {
          stdout: "",
          stderr: `La proposición ${proposicion.id} se declara decidida en código y no hay quien la decida.\n`,
          exitCode: EXIT_INVARIANT,
        };
      }
      respuestasDeCodigo.push({ id: proposicion.id, kind: "noul", value: valor });
    }
  } catch (caught) {
    const failure = toFailure(caught);
    return { stdout: "", stderr: failure.message, exitCode: failure.exitCode };
  }

  // Los comandos que responden las proposiciones del gate mecánico. Se arman
  // después de la comprobación previa, así que acá ya se sabe que hay al menos uno
  // y que todos están autorizados.
  let comandos: readonly CommandCheckSpec[] = [];
  if (definition.commandPropositions === true) {
    const { checks: generados, refused } = commandChecksFor(
      criteria,
      testCommands(paths.root),
      testTimeout(paths.root),
      playwrightConfig(paths.root),
      {
        root: paths.root,
        esArchivo: (ruta) => {
          try {
            return statSync(ruta).isFile();
          } catch {
            return false;
          }
        },
      },
    );
    if (refused.length > 0) {
      return {
        stdout: "",
        stderr:
          "Criterios rechazados: el comando debe estar autorizado y el spec de Playwright " +
          "debe ser un archivo del repositorio.\n" +
          refused.map((linea) => `  ${linea}`).join("\n") +
          "\nSi el proyecto no autoriza el comando, revise el prefijo en `test-commands` " +
          "o la sección `playwright:` de `.valmen/config.yaml`. " +
          "Si el rechazo nombra el spec, corrija su ruta en el criterio. " +
          "No se ejecutó ningún comando ni se llamó al evaluador.\n",
        exitCode: EXIT_INVARIANT,
      };
    }
    comandos = generados;
  }

  // Un check mecánico fallido bloquea sin gastar una llamada al modelo.
  const fallidos = checks.filter((check) => check.result === "fail");
  if (fallidos.length > 0) {
    return {
      stdout: "",
      stderr:
        `Checks mecánicos fallidos: ${fallidos.map((check) => check.id).join(", ")}. ` +
        "No se llamó al evaluador.",
      exitCode: EXIT_INVARIANT,
    };
  }

  // La revisión previa corre en código, sin modelo, antes de gastar una llamada: un
  // análisis o un plan con el Rollback vacío, un marcador de plantilla sin llenar, un
  // archivo citado que no existe o un paso sin ruta ni comando no necesita que un modelo lo
  // descubra (R-CPRE-008). Si algo falla no se llama al evaluador ni se escribe recibo.
  if (definition.commandPropositions !== true) {
    const revision = reviewBeforeGate({
      root: paths.root,
      ticketText: ticket.text,
      gateId: definition.id,
    });
    if (revision.findings.length > 0) {
      return {
        stdout: "",
        stderr:
          renderPreReview(definition.id, options.ticketId, revision) +
          "No se llamó al evaluador. Corregí lo que falta y volvé a pedir la compuerta; " +
          `la misma revisión se corre a mano con «valmen precheck ${definition.id} --id ${options.ticketId}».\n`,
        exitCode: EXIT_INVARIANT,
      };
    }
  }

  // Un gate mecánico cuyos criterios se verifican todos a mano no tiene nada que
  // correr. No se llama a nadie —preguntarle a un modelo por un gate sin
  // proposiciones sería gastar una llamada para que conteste nada— y tampoco se
  // aprueba: **un gate sin proposiciones que aprueba es el defecto que este
  // proyecto ya pagó una vez**, cuando una sección de criterios vacía pasaba como
  // «1 criterio(s)» y la compuerta aprobaba sin evaluar nada. El veredicto es
  // `review`, que es la verdad: lo verifican las personas, en el estado siguiente.
  const soloManual = definition.commandPropositions === true && comandos.length === 0;

  // La preparación del ambiente de pruebas que el proyecto declara corre **antes** de
  // los criterios, una sola vez, y queda en el recibo. Si falla —o si su esquema no
  // está permitido— los criterios no corren: no probarían nada, y la compuerta termina
  // como falla del entorno (R-CDEF-007).
  const preparacion =
    definition.commandPropositions === true && !soloManual ? runTestSetup(paths.root) : null;

  let decision: GateDecision;
  let evaluation;
  // Los umbrales que el proyecto declaró y una persona firmó, aplicados a esta evaluación.
  let umbrales: ThresholdOutcome = { propositions: [], applied: [], ignored: [] };

  if (preparacion !== null && preparacion.failure !== null) {
    evaluation = {
      evaluator: "command" as const,
      answers: [],
      model: null,
      usage: null,
      latencyMs: preparacion.steps.reduce((total, paso) => total + paso.durationMs, 0),
    };
    decision = {
      outcome: "review",
      reason:
        `falla del entorno: ${preparacion.failure}. Los criterios no se ejecutaron: no es una ` +
        "prueba fallida",
      actor: "engine",
      propositions: [],
      blocking: [],
      inBand: [],
    };
  } else if (soloManual) {
    evaluation = {
      evaluator: "command" as const,
      answers: [],
      model: null,
      usage: null,
      latencyMs: 0,
    };
    decision = {
      outcome: "review",
      reason:
        `los ${criteria.length} criterio(s) se verifican a mano: ` +
        "los prueba el responsable en el estado siguiente",
      actor: "engine",
      propositions: [],
      blocking: [],
      inBand: [],
    };
  } else {
    // El evaluador se elige por capacidades: si todas las proposiciones tienen un
    // comando, se resuelve sin llamar a ningún modelo.
    try {
      evaluation = await evaluateGate({
        gate,
        state,
        root: paths.root,
        ...(respuestasDeCodigo.length === 0 ? {} : { precomputed: respuestasDeCodigo }),
        ...(options.checks !== undefined
          ? { checks: options.checks }
          : comandos.length === 0
            ? {}
            : { checks: comandos }),
        ...(options.evaluator === undefined ? {} : { evaluator: options.evaluator }),
        ...(options.jev === undefined ? {} : { jev: options.jev }),
        ...(options.judge === undefined ? {} : { judge: options.judge }),
        ...(options.model === undefined ? {} : { model: options.model }),
        ...(options.provider === undefined ? {} : { provider: options.provider }),
        ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
        ...(options.credentialForProvider === undefined
          ? {}
          : { credentialForProvider: options.credentialForProvider }),
        ...(options.effort === undefined ? {} : { effort: options.effort }),
        ...(options.judgeModel === undefined ? {} : { judgeModel: options.judgeModel }),
        ...(options.semantic === undefined ? {} : { semantic: options.semantic }),
        ...(options.cascade === undefined ? {} : { cascade: options.cascade }),
        sessionId: `${options.ticketId}:${options.gateId}`,
      });
    } catch (caught) {
      const failure = toFailure(caught);
      return {
        stdout: "",
        stderr: `El evaluador no pudo completar la evaluación: ${failure.message}`,
        exitCode: failure.exitCode,
      };
    }

    // `decide` lanza si el evaluador no respondió alguna proposición o si una
    // respuesta no cumple el contrato. Se captura aquí para devolver un error
    // presentable: una excepción sin capturar en la capa de comando revienta el
    // proceso y deja al usuario sin saber qué pasó.
    try {
      // Los umbrales por evaluador y proposición se aplican con el evaluador que
      // respondió, y solo los que una persona firmó (R-CPRE-010).
      const declarados = gateThresholds(paths.root);
      validateThresholdTargets(declarados);
      umbrales = applyThresholds(gate.propositions, declarados, definition.id, evaluation.evaluator);
      decision = decide(
        umbrales.propositions,
        evaluation.answers,
        gate.policy as GatePolicy,
        gate.isolatedBlockReview,
      );
    } catch (caught) {
      const failure = toFailure(caught);
      return {
        stdout: "",
        stderr: `La evaluación no cumple el contrato del gate: ${failure.message}`,
        exitCode: failure.exitCode,
      };
    }
  }

  // Un comando que no llegó a probar no es una prueba fallida: el resultado es una
  // revisión y el motivo lo dice, para que nadie lea «bloqueó» donde el entorno falló.
  const fallasDeEntorno = (evaluation.commandResults ?? []).filter(
    (resultado) => resultado.environmentFailure !== undefined,
  );
  if (fallasDeEntorno.length > 0 && decision.outcome === "review") {
    decision = {
      ...decision,
      reason:
        `falla del entorno en ${fallasDeEntorno.map((r) => r.propositionId).join(", ")}: ` +
        `el comando no llegó a probar, no es una prueba fallida; ${decision.reason}`,
    };
  }

  // Un gate promovido a automático no puede escalar una banda a una persona: su
  // garantía es fallar cerrado. Sin esta conversión `auto` sería una etiqueta de
  // pantalla y seguiría dejando pasar la misma rama híbrida a revisión humana.
  if (
    effectiveMode.mode === "auto" &&
    effectiveMode.evidence !== null &&
    decision.outcome === "review"
  ) {
    decision = {
      ...decision,
      outcome: "block",
      actor: "engine",
      reason: `${decision.reason}; el gate automático bloquea la banda de revisión hasta una nueva calibración`,
    };
  }

  // La causa probable de una banda de revisión, cuando la banda la causan los
  // criterios y no el plan. Se calcula acá y no dentro de `decide`: decidir es del
  // gate, y esto no decide — explica por qué el número salió así.
  const notas = [
    ...(options.notes ?? []),
    ...(effectiveMode.evidence === null
      ? []
      : [
          `Modo efectivo ${effectiveMode.mode}: ${effectiveMode.reason}; evidencia ${effectiveMode.evidence.id}; ` +
            `referencia humana ${effectiveMode.evidence.humanReference} (${effectiveMode.evidence.humanTickets.join(", ") || "sin tickets comparables"}).`,
        ]),
    ...avisoDeForma(decision, criteria, gate.policy as GatePolicy),
    ...fallasDeEntorno.map(
      (resultado) =>
        `${resultado.propositionId}: falla del entorno — ${resultado.environmentFailure}. ` +
        "No es una prueba fallida: corrija el entorno y vuelva a correr.",
    ),
    // Más criterios que una tanda: se evaluaron todos, repartidos. Sin esta nota el
    // recibo no diría que el evaluador respondió en más de una llamada.
    ...((evaluation.tandas ?? 1) > 1
      ? [
          `${criteria.length} criterios evaluados en ${evaluation.tandas} tandas de hasta ` +
            `${MAX_CRITERIA_PROPOSITIONS}.`,
        ]
      : []),
  ];

  const receipt = buildReceipt({
    id: options.receiptId ?? defaultReceiptId(paths, options.ticketId, options.gateId, now),
    gate: definition.id,
    propositions: definition.propositions,
    policy: definition.policy,
    subject: {
      type: "ticket",
      id: options.ticketId,
      revision: ticket.text.length.toString(),
    },
    decision,
    state,
    answers: evaluation.answers as PropositionAnswer[],
    mechanicalChecks: checks,
    model: evaluation.model,
    usage: evaluation.usage,
    latencyMs: evaluation.latencyMs,
    decidedAt: now().toISOString(),
    notes: notas,
    ...(evaluation.escalations === undefined
      ? {}
      : { escalations: evaluation.escalations }),
    ...(evaluation.commandResults === undefined
      ? {}
      : { commandResults: evaluation.commandResults }),
    ...(preparacion === null ? {} : { setup: preparacion }),
    evaluator: evaluation.evaluator,
    notApplicable: noAplican,
    thresholds: umbrales.applied,
    evaluatorKey: huellaDelEvaluador,
    ...(forzado === undefined ? {} : { forced: forzado }),
  });

  // Se informa de lo que de verdad se evaluó. Antes decía «N criterio(s)
  // desplegados» siempre que el ticket declarara criterios, aunque el gate no
  // los desplegara: el informe afirmaba algo que el recibo contradecía, y el
  // recibo es el que tiene la evidencia.
  const expandido = totalExpandido !== definition.propositions.length;
  const lines: string[] = [
    `Gate ${definition.id} — ${options.ticketId}`,
    `  Modo efectivo: ${effectiveMode.mode} — ${effectiveMode.reason}`,
    !expandido
      ? definition.criteriaPropositions === true || criteria.length === 0
        ? "  El ticket no declara criterios; el gate se evalúa sin expansión"
        : `  Los ${criteria.length} criterio(s) no se despliegan en esta compuerta ` +
          `(${definition.title.toLowerCase()}), sino en la que evalúa el plan`
      : `  ${criteria.length} criterio(s) desplegados como proposiciones atómicas`,
    "",
    "  Checks mecánicos (código, sin coste)",
  ];
  for (const check of checks) {
    const marca = { pass: "✓", fail: "✗", warn: "!", skip: "·" }[check.result];
    lines.push(`    ${marca}  ${check.id.padEnd(22)} ${check.detail ?? ""}`.trimEnd());
  }

  const etiquetaEvaluador = {
    command: "checks deterministas, sin coste",
    jev: "Jev, probabilidades tipadas",
    "llm-judge": "modelo de chat con salida estructurada",
    cascade:
      "cascada verificada: produce el modelo barato y el verificador escala lo no respaldado",
  }[evaluation.evaluator];
  lines.push("", `  Evaluación (${etiquetaEvaluador})`);
  for (const item of decision.propositions) {
    // El orden de las marcas importa y estaba al revés. Se elegía por `inBand`
    // primero, así que una proposición de **contexto** con el valor en la banda
    // salía con `⚠` —la marca de «esto pide revisión»— cuando no puede pedir nada:
    // no emite veredicto. Eso es lo que hizo leer un `compatibilidad_hacia_atras`
    // a 0.59 en un ticket de sincronización como un problema señalado por el gate.
    // Una descriptiva se marca como descriptiva, con su valor, y nada más.
    const marca = !item.verdict
      ? "·"
      : item.inBand
        ? "⚠"
        : item.effect?.outcome === "approve"
          ? "✓"
          : "✗";
    const peso = item.kind === "noul" && item.weight !== 1 ? `  (peso ${item.weight})` : "";
    // La descripción va al final y **además** del identificador, no en su lugar:
    // el recibo tiene que poder leerse sin el ticket delante —`criterio_03=0.00` no
    // dice nada, y «Buscar "999" no devuelve resultados» sí—, y el identificador es
    // lo que se cita después, en una conversación o en otro recibo.
    const descripcion = item.description === undefined ? "" : `  ${item.description}`;
    lines.push(
      `    ${marca}  ${item.label.padEnd(38)} ${item.verdict ? "" : "descriptiva"}${peso}${descripcion}`.trimEnd(),
    );
  }

  // Los umbrales del proyecto: los aplicados dicen quién los decidió; los que no traen
  // firma no se aplicaron y se dice, para que nadie crea que una entrada sin firma rige.
  if (umbrales.applied.length > 0 || umbrales.ignored.length > 0) {
    lines.push("", "  Umbrales del proyecto");
    for (const u of umbrales.applied) {
      lines.push(
        `    ✓  ${u.proposition}: aprueba desde ${u.approveAt}, bloquea hasta ${u.blockAt}` +
          `${u.evaluator === null ? "" : ` (${u.evaluator})`} — decidido por ${u.approvedBy}: ${u.reason}`,
      );
    }
    for (const nota of umbrales.ignored) lines.push(`    ✗  ${nota}`);
  }

  // Las proposiciones que no aplican a este tipo de ticket: el código las separó y el
  // evaluador no las vio.
  if (noAplican.length > 0) {
    lines.push(
      "",
      `  No aplican a un ticket ${noAplican[0]?.ticketType ?? ""} (no se enviaron al evaluador): ` +
        noAplican.map((registro) => registro.id).join(", "),
    );
  }

  // La preparación del ambiente, antes de los criterios: en qué estado se encontró.
  if (preparacion !== null) {
    lines.push("", `  Preparación del ambiente (esquema ${preparacion.schema})`);
    for (const paso of preparacion.steps) {
      lines.push(
        `    ${paso.outcome === "ok" ? "✓" : "✗"}  ${paso.command}  ` +
          `${paso.outcome === "refused" ? `no se ejecutó: ${paso.detail ?? ""}` : `salida ${paso.exitCode ?? "—"}  ${paso.durationMs} ms`}`,
      );
    }
  }

  // El resultado de cada comando corrido, con la evidencia que dejó. Sin esto la
  // salida muestra el veredicto del criterio pero no lo que lo produjo, y un
  // criterio de interfaz queda probado por un número sin su traza.
  if (evaluation.commandResults !== undefined && evaluation.commandResults.length > 0) {
    for (const resultado of evaluation.commandResults) {
      const evidencia =
        resultado.artifacts === undefined || resultado.artifacts.length === 0
          ? ""
          : `  →  ${resultado.artifacts.map((artifact) => artifact.path).join(", ")}`;
      lines.push(
        `    ·  ${resultado.invocation}  ` +
          `salida ${resultado.exitCode} (esperado ${resultado.expectedExitCode})  ` +
          `${resultado.durationMs} ms${evidencia}`,
      );
      if (resultado.environmentFailure !== undefined) {
        lines.push(`       falla del entorno: ${resultado.environmentFailure}`);
      }
    }
  }

  if (decision.propositions.some((item) => !item.verdict && item.inBand)) {
    lines.push(
      "",
      "  Las marcadas como descriptivas no emitieron veredicto: su valor es contexto " +
        "del recibo y no una señal del gate.",
    );
  }

  // El escalamiento se informa aparte de la escalada a una persona: la cascada
  // sube de modelo, y quien lee tiene que poder saber por qué se pagó el caro. El
  // detalle por proposición está también en el recibo, que es lo que se audita.
  if (evaluation.escalations !== undefined && evaluation.escalations.length > 0) {
    lines.push("", "  Escalamiento (cascada verificada)");
    for (const escalamiento of evaluation.escalations) {
      lines.push(
        `    ⤴  ${escalamiento.proposition.padEnd(34)} ` +
          `verificado ${escalamiento.verified.toFixed(2)} < ${escalamiento.threshold}  ` +
          `→ ${escalamiento.to.model}`,
      );
    }
    lines.push(
      "",
      `  ${evaluation.escalations.length} de ${decision.propositions.length} proposición(es) ` +
        "se volvieron a preguntar al modelo del rol `escalation`: lo demás quedó como lo " +
        "respondió el productor y no pagó el modelo caro.",
    );
  }

  const { mean } = weightedMean(decision);
  lines.push(
    "",
    `  Media ponderada:  ${mean.toFixed(3)}  (informativa: la decisión no la usa)`,
  );

  lines.push("", `  RESULTADO: ${decision.outcome.toUpperCase()}`);
  lines.push(`  Motivo:    ${decision.reason}`);

  if (decision.outcome === "review") {
    lines.push(
      "",
      "  Va a revisión humana. El ticket NO avanza: el gate no cambia estados.",
    );
  }

  if (forzado !== undefined) {
    lines.push(
      "",
      `  Repetición forzada del recibo ${forzado.receiptId}: ${forzado.reason}`,
    );
  }

  if (notas.length > 0) {
    lines.push("", "  Forma de los criterios");
    for (const nota of notas) lines.push(`    ${nota}`);
  }

  lines.push(
    "",
    "  Recibo",
    `    evaluador          ${evaluation.evaluator}`,
    `    estado congelado   ${receipt.stateHash.slice(0, 23)}…`,
    `    gate               ${receipt.gateHash.slice(0, 23)}…`,
    `    modelo             ${evaluation.model?.resolvedVersion ?? "— (decisión en código)"}`,
    `    coste              $${(evaluation.usage?.costUsd ?? 0).toFixed(6)}`,
    `    latencia           ${evaluation.latencyMs} ms`,
  );

  if (options.dryRun !== true) {
    let receiptPath: string;
    try {
      // Append-only: un recibo emitido no se modifica nunca. La decisión humana
      // se anexa como una línea nueva, no reescribiendo la anterior.
      receiptPath = appendReceipt(paths, options.ticketId, receipt);
      lines.push("", `  Recibo anexado: ${receiptPath.replace(`${paths.root}/`, "")}`);
      lines.push(`  ${summarizeReceipt(receipt)}`);
    } catch (caught) {
      const failure = toFailure(caught);
      return {
        stdout: lines.join("\n") + "\n",
        stderr: `No se pudo escribir el recibo: ${failure.message}`,
        exitCode: 2,
      };
    }
  } else {
    lines.push("", "  (simulación: el recibo no se escribió)");
  }

  // El código de salida refleja la decisión, para que un script pueda ramificar:
  // 0 aprueba, 3 bloquea. Revisión es un caso distinto que exige intervención.
  const exitCode = decision.outcome === "approve" ? 0 : EXIT_INVARIANT;

  return { stdout: lines.join("\n") + "\n", stderr: "", exitCode };
}

export { TicketError };
