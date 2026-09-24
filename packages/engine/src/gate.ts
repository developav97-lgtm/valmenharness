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
import {
  EXIT_INVARIANT,
  TicketError,
  declaredImpactIds,
  parseTicket,
  toFailure,
} from "@valmen/core";
import {
  type CommandCheckSpec,
  type CriterionSpec,
  type GateDecision,
  type GatePolicy,
  type MechanicalCheck,
  type PropositionAnswer,
  buildReceipt,
  commandChecksFor,
  decide,
  extractCriteriaSpecs,
  gateById,
  gateFor,
  summarizeReceipt,
  weightedMean,
} from "@valmen/gate";
import { evaluateWithJev } from "@valmen/gate-jev";
import { type CommandCheck } from "@valmen/gate-command";
import { type EvaluatorId, evaluateGate } from "./evaluators.js";

import type { RunnerResult } from "./result.js";
import { type RegistryPaths, configList, findTicket, testTimeout } from "./discovery.js";
import { buildGateState, runMechanicalChecks } from "./state.js";
import { appendReceipt } from "./receipts.js";

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
  readonly now?: () => Date;
  readonly receiptId?: string;
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
 */
export function testCommands(root: string): string[] {
  return configList(root, "test-commands");
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

  // El gate mecánico no le pregunta nada a nadie: corre lo que los criterios
  // declaran. Antes de correr nada se comprueba que se pueda —cada criterio tiene
  // que decir cómo se verifica, y el comando tiene que estar entre los que el
  // proyecto autoriza—, porque un gate que corre lo que le escriben en el ticket
  // sería un gate que obedece al artefacto que evalúa.
  if (definition.commandPropositions === true) {
    const problema = revisarCriteriosVerificables(
      extractCriteriaSpecs(state["criterios"] ?? ""),
      paths.root,
    );
    if (problema !== null) {
      return { stdout: "", stderr: problema, exitCode: EXIT_INVARIANT };
    }
  }

  // El gate se expande con el sujeto: una proposición por criterio de aceptación
  // y una por impacto declarado, en vez de preguntas compuestas que el evaluador
  // no sabe responder. Medido: la compuesta acierta el 7%, las atómicas el 62%.
  const criteria = extractCriteriaSpecs(state["criterios"] ?? "");
  const gate = gateFor(definition, { criteria, impacts });

  // Los comandos que responden las proposiciones del gate mecánico. Se arman
  // después de la comprobación previa, así que acá ya se sabe que hay al menos uno
  // y que todos están autorizados.
  let comandos: readonly CommandCheckSpec[] = [];
  if (definition.commandPropositions === true) {
    const { checks: generados, refused } = commandChecksFor(
      criteria,
      testCommands(paths.root),
      testTimeout(paths.root),
    );
    if (refused.length > 0) {
      return {
        stdout: "",
        stderr:
          `El proyecto no autoriza ${refused.length === 1 ? "este comando" : "estos comandos"}:\n` +
          refused.map((linea) => `  ${linea}`).join("\n") +
          "\nAgregue el prefijo a `test-commands` en `.valmen/config.yaml`, o cambie el " +
          "criterio. Un comando que el proyecto no declaró no se ejecuta desde un ticket: " +
          "el ticket lo escribe quien el gate controla.\n",
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

  // Un gate mecánico cuyos criterios se verifican todos a mano no tiene nada que
  // correr. No se llama a nadie —preguntarle a un modelo por un gate sin
  // proposiciones sería gastar una llamada para que conteste nada— y tampoco se
  // aprueba: **un gate sin proposiciones que aprueba es el defecto que este
  // proyecto ya pagó una vez**, cuando una sección de criterios vacía pasaba como
  // «1 criterio(s)» y la compuerta aprobaba sin evaluar nada. El veredicto es
  // `review`, que es la verdad: lo verifican las personas, en el estado siguiente.
  const soloManual = definition.commandPropositions === true && comandos.length === 0;

  let decision: GateDecision;
  let evaluation;

  if (soloManual) {
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
        ...(options.effort === undefined ? {} : { effort: options.effort }),
        ...(options.judgeModel === undefined ? {} : { judgeModel: options.judgeModel }),
        ...(options.semantic === undefined ? {} : { semantic: options.semantic }),
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
      decision = decide(gate.propositions, evaluation.answers, gate.policy as GatePolicy);
    } catch (caught) {
      const failure = toFailure(caught);
      return {
        stdout: "",
        stderr: `La evaluación no cumple el contrato del gate: ${failure.message}`,
        exitCode: failure.exitCode,
      };
    }
  }

  const receipt = buildReceipt({
    id:
      options.receiptId ??
      `GR-${now().toISOString().slice(0, 10).replace(/-/g, "")}-${options.gateId}`,
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
  });

  // Se informa de lo que de verdad se evaluó. Antes decía «N criterio(s)
  // desplegados» siempre que el ticket declarara criterios, aunque el gate no
  // los desplegara: el informe afirmaba algo que el recibo contradecía, y el
  // recibo es el que tiene la evidencia.
  const expandido = gate.propositions.length !== definition.propositions.length;
  const lines: string[] = [
    `Gate ${definition.id} — ${options.ticketId}`,
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

  if (decision.propositions.some((item) => !item.verdict && item.inBand)) {
    lines.push(
      "",
      "  Las marcadas como descriptivas no emitieron veredicto: su valor es contexto " +
        "del recibo y no una señal del gate.",
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
