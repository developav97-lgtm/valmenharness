/**
 * Los comandos que anexan datos a un ticket.
 *
 * Todos comparten la misma mecánica, y por eso viven juntos: leen el ticket,
 * construyen el objeto con la forma exacta del contrato, lo añaden al bloque que
 * corresponda, y dejan que `finalizeMutation` anexe el evento, revalide y
 * escriba. Ninguno escribe por su cuenta.
 *
 * Tres reglas que se repiten y conviene leer una vez:
 *
 * 1. **Las claves no se omiten.** Un campo opcional que no se pasó se escribe
 *    como `null` explícito, no se deja fuera. La diferencia importa: el contrato
 *    exige el conjunto exacto de claves, así que omitir una produciría un ticket
 *    inválido en vez de un campo vacío.
 * 2. **El orden de las claves es el del contrato.** El bloque se re-serializa
 *    entero al anexar, así que el orden es parte del formato que se conserva.
 * 3. **Las precondiciones de estado se comprueban antes de tocar nada**, con el
 *    mensaje de la referencia. Un comando que escribe y después descubre que no
 *    podía deja el registro peor que antes.
 *
 * Transcrito de `ticket.py` L1327-1903. Verificado contra la referencia.
 */
import {
  type JsonObject,
  type ParsedTicket,
  EXIT_INVARIANT,
  MAX_POINTS,
  EXIT_SCHEMA,
  fail,
  MutationLock,
  RISK_LEVELS,
  hasApprovedQaCycle,
  replaceBlock,
  replaceFrontmatterField,
  validateText,
  validateTitle,
} from "@valmen/core";

import { type RegistryPaths, findTicket } from "./discovery.js";
import { finalizeMutation, readAndValidate } from "./mutate.js";
import { resolveReference, validateFunctionalFile } from "./references.js";

/** El estado de un ticket, tal como lo ve un comando de anexado. */
interface Contexto {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly document: ParsedTicket;
  readonly ticketPath: string;
  readonly date: string;
}

/**
 * Prepara el contexto de una mutación.
 *
 * El lock se toma **antes** de leer: sin eso, dos comandos concurrentes leerían
 * el mismo estado y escribirían dos historias distintas.
 */
function conTicket(
  paths: RegistryPaths,
  ticketId: string,
  now: (() => Date) | undefined,
  cuerpo: (contexto: Contexto) => {
    texto: string;
    accion: string;
    detalles: string;
    salida: string;
  },
): string {
  return MutationLock.run(paths.root, () => {
    const located = findTicket(paths, ticketId);
    if (located === undefined) {
      fail("La ruta canónica solicitada no existe.", EXIT_SCHEMA);
    }
    const document = readAndValidate(paths, located);
    const date = (now?.() ?? new Date()).toISOString().slice(0, 10);

    const plan = cuerpo({
      paths,
      ticketId,
      document,
      ticketPath: located.absolutePath,
      date,
    });

    finalizeMutation({
      paths,
      located,
      document,
      text: plan.texto,
      action: plan.accion,
      details: plan.detalles,
      ...(now === undefined ? {} : { now }),
    });

    return plan.salida;
  });
}

/** El siguiente identificador de una serie, por longitud. */
function nextId(entries: readonly JsonObject[], prefix: string): string {
  return `${prefix}-${String(entries.length + 1).padStart(3, "0")}`;
}

/** El siguiente número de punto: el mayor registrado más uno. */
function nextPointId(document: ParsedTicket): string {
  const registrados = (document.blocks.Eventos ?? [])
    .filter((evento) => evento.action === "point-added")
    .map((evento) => /^Se agregó (POINT-\d{3})\.$/.exec(String(evento.details))?.[1])
    .filter((id): id is string => id !== undefined);
  const actuales = (document.blocks.Puntos ?? []).map((punto) => String(punto.id));

  const numeros = [...registrados, ...actuales]
    .map((id) => Number.parseInt(id.replace("POINT-", ""), 10))
    .filter((numero) => Number.isInteger(numero));

  const mayor = numeros.length === 0 ? 0 : Math.max(...numeros);
  return `POINT-${String(mayor + 1).padStart(3, "0")}`;
}

// ── add-point ───────────────────────────────────────────────────────────────

export interface AddPointRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly title: string;
  readonly severity: string;
  readonly actual: string;
  readonly expected: string;
  /**
   * Los archivos que este punto toca, relativos a la raíz del proyecto.
   *
   * No son decorativos: son los que entran en el hash de `worktree`, y por eso
   * sin ellos una referencia sin commitear no se puede calcular. Se declaran al
   * anotar el hallazgo porque es cuando se sabe dónde está.
   */
  readonly affectedFiles?: readonly string[] | undefined;
  readonly now?: (() => Date) | undefined;
}

export function addPoint(request: AddPointRequest): string {
  const title = validateTitle(request.title);
  const actual = validateText(request.actual, "actual");
  const expected = validateText(request.expected, "expected");
  const severity = validateText(request.severity, "severity");
  if (!RISK_LEVELS.includes(severity as (typeof RISK_LEVELS)[number])) {
    fail("severity no pertenece al esquema.");
  }

  return conTicket(request.paths, request.ticketId, request.now, (contexto) => {
    const puntos = (contexto.document.blocks.Puntos ?? []).map((punto) => ({
      ...punto,
    }));
    const pointId = nextPointId(contexto.document);

    if (puntos.length >= MAX_POINTS || pointId === `POINT-${String(MAX_POINTS + 1).padStart(3, "0")}`) {
      fail(`El ticket ya alcanzó el máximo de ${MAX_POINTS} puntos.`, EXIT_INVARIANT);
    }

    // El orden de las claves es el del contrato: `id` primero, y los cuatro
    // campos que el comando no puede llenar, vacíos explícitos.
    // Las rutas se validan aquí y no en el borde: la regla es del contrato, y un
    // archivo mal declarado no rompe el alta —rompe el hash de `worktree`, mucho
    // después y en otro comando—.
    const afectados = [
      ...new Set(
        (request.affectedFiles ?? []).map((crudo) =>
          validateFunctionalFile(crudo, contexto.ticketPath, contexto.paths.root),
        ),
      ),
    ];

    puntos.push({
      id: pointId,
      title,
      status: "open",
      severity,
      actual,
      expected,
      evidence: [],
      affected_files: afectados,
      diagnosis: null,
      solution: null,
      tests: [],
      qa_cycles: [],
      terminal_reason: null,
      related_ticket: null,
    });

    return {
      texto: replaceBlock(contexto.document.text, "Puntos", puntos),
      accion: "point-added",
      detalles: `Se agregó ${pointId}.`,
      salida: `Punto agregado: ${pointId}`,
    };
  });
}

// ── add-evidence ────────────────────────────────────────────────────────────

export interface AddEvidenceRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly kind: string;
  readonly description: string;
  readonly reference?: string | undefined;
  readonly pointId?: string | undefined;
  readonly now?: (() => Date) | undefined;
}

export function addEvidence(request: AddEvidenceRequest): string {
  const kind = validateText(request.kind, "kind");
  const description = validateText(request.description, "description");

  return conTicket(request.paths, request.ticketId, request.now, (contexto) => {
    const evidencia = (contexto.document.blocks.Evidencia ?? []).map((entrada) => ({
      ...entrada,
    }));
    const evidenceId = nextId(evidencia, "EVIDENCE");

    const puntos = (contexto.document.blocks.Puntos ?? []).map((punto) => ({
      ...punto,
    }));

    // `--point-id ""` no es «sin punto»: es un punto que no existe. La
    // diferencia importa porque el contrato del bloque lo exige.
    if (request.pointId !== undefined) {
      const punto = puntos.find((candidato) => candidato.id === request.pointId);
      if (punto === undefined) {
        fail("La evidencia referencia un punto inexistente.", EXIT_INVARIANT);
      }
    }

    const reference = resolveReference(
      request.reference,
      contexto.document,
      contexto.ticketPath,
      contexto.paths.root,
      "La referencia",
    );

    evidencia.push({
      id: evidenceId,
      date: contexto.date,
      kind,
      description,
      reference,
      point_id: request.pointId ?? null,
    });

    let texto = replaceBlock(contexto.document.text, "Evidencia", evidencia);

    // La coherencia exige que `Puntos[].evidence` sea exactamente la lista de
    // evidencias que apuntan a ese punto, en orden. Anexar la evidencia sin
    // anotarla en el punto dejaría el ticket inválido.
    if (request.pointId !== undefined) {
      const punto = puntos.find((candidato) => candidato.id === request.pointId);
      const suyas = (punto?.evidence ?? []) as string[];
      punto!.evidence = [...suyas, evidenceId];
      texto = replaceBlock(texto, "Puntos", puntos);
    }

    return {
      texto,
      accion: "evidence-added",
      detalles: `Se agregó ${evidenceId}.`,
      salida: `Evidencia agregada: ${evidenceId}`,
    };
  });
}

// ── add-ai-usage ────────────────────────────────────────────────────────────

export interface AddAiUsageRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly source: string;
  readonly confidence: string;
  readonly sessionReference?: string | undefined;
  readonly model?: string | undefined;
  readonly reasoningEffort?: string | undefined;
  readonly inputTokens?: string | undefined;
  readonly outputTokens?: string | undefined;
  readonly totalTokens?: string | undefined;
  readonly estimatedCostUsd?: string | undefined;
  readonly notes?: string | undefined;
  readonly now?: (() => Date) | undefined;
}

/** Un entero no negativo escrito sin signo, sin ceros a la izquierda. */
function enteroOpcional(valor: string | undefined, label: string): number | null {
  if (valor === undefined) return null;
  if (!/^(?:0|[1-9]\d*)$/.test(valor)) {
    fail(`${label} debe ser un entero no negativo.`);
  }
  return Number.parseInt(valor, 10);
}

/** Un decimal no negativo sin notación exponencial. */
function costoOpcional(valor: string | undefined): number | null {
  if (valor === undefined) return null;
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(valor)) {
    fail("estimated-cost-usd debe ser un decimal no negativo sin notación exponencial.");
  }
  return Number.parseFloat(valor);
}

export function addAiUsage(request: AddAiUsageRequest): string {
  const source = validateText(request.source, "source");
  const confidence = validateText(request.confidence, "confidence");
  if (!["high", "medium", "low"].includes(confidence)) {
    fail("confidence debe ser high, medium o low.");
  }

  // Los textos opcionales se validan con la etiqueta derivada del nombre de la
  // bandera, para que el error diga `reasoning-effort` y no `reasoningEffort`.
  const opcional = (valor: string | undefined, label: string): string | null =>
    valor === undefined ? null : validateText(valor, label);

  const sessionReference = opcional(request.sessionReference, "session-reference");
  const model = opcional(request.model, "model");
  const reasoningEffort = opcional(request.reasoningEffort, "reasoning-effort");
  const notes = opcional(request.notes, "notes");
  const inputTokens = enteroOpcional(request.inputTokens, "input-tokens");
  const outputTokens = enteroOpcional(request.outputTokens, "output-tokens");
  const totalTokens = enteroOpcional(request.totalTokens, "total-tokens");
  const estimatedCostUsd = costoOpcional(request.estimatedCostUsd);

  // La fuente se comprueba al escribir y no solo al cerrar: un `hermes:` que
  // apunta a la base de OpenCode se corrige en el momento, y no cuando el ticket
  // ya no puede cerrarse. Va **después** de las comprobaciones de la referencia
  // —confianza, enteros, decimal— para que un caso que la referencia rechaza se
  // siga rechazando con su mismo motivo: esta regla es un agregado, no un cambio
  // de las que ya estaban.
  const problema = problemaDeFuente(source);
  if (problema !== null) {
    fail(`source: ${problema}`);
  }

  return conTicket(request.paths, request.ticketId, request.now, (contexto) => {
    const consumo = (contexto.document.blocks["Consumo de IA"] ?? []).map((entrada) => ({
      ...entrada,
    }));
    const id = nextId(consumo, "CONSUMO");

    // El orden es el de la referencia, con `id` **al final**: el bloque se
    // re-serializa entero, así que una clave fuera de sitio reformatearía todas
    // las entradas anteriores de este bloque.
    consumo.push({
      kind: "ai-usage",
      date: contexto.date,
      session_reference: sessionReference,
      model,
      reasoning_effort: reasoningEffort,
      notes,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCostUsd,
      source,
      confidence,
      id,
    });

    return {
      texto: replaceBlock(contexto.document.text, "Consumo de IA", consumo),
      accion: "ai-usage-added",
      detalles: `Se agregó ${id}.`,
      salida: `Consumo de IA agregado: ${id}`,
    };
  });
}

// ── qa-start ────────────────────────────────────────────────────────────────

export interface QaStartRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly environment?: string | undefined;
  readonly buildReference?: string | undefined;
  readonly now?: (() => Date) | undefined;
}

export function qaStart(request: QaStartRequest): string {
  if (request.environment === undefined || request.buildReference === undefined) {
    fail("qa-start requiere --environment y --build-reference trazables.", EXIT_INVARIANT);
  }
  const environment = validateText(request.environment, "environment");

  return conTicket(request.paths, request.ticketId, request.now, (contexto) => {
    if (contexto.document.fields.workflow_status !== "in_qa") {
      fail("qa-start solo se permite cuando el ticket está in_qa.", EXIT_INVARIANT);
    }

    const qa = (contexto.document.blocks.QA ?? []).map((entrada) => ({ ...entrada }));
    if (qa.length % 2 !== 0) {
      fail("Ya existe un ciclo QA pendiente de cierre.", EXIT_INVARIANT);
    }

    const buildReference = resolveReference(
      request.buildReference,
      contexto.document,
      contexto.ticketPath,
      contexto.paths.root,
      "build_reference",
    );

    const id = nextId(qa, "QA");
    qa.push({
      id,
      date: contexto.date,
      build_reference: buildReference,
      environment,
      result: "pending",
      findings: [],
      correction: null,
      po_confirmation: null,
    });

    let texto = replaceBlock(contexto.document.text, "QA", qa);
    texto = replaceFrontmatterField(texto, "qa_status", "in_qa");

    return {
      texto,
      accion: "qa-started",
      detalles: `Se inició ${id}.`,
      salida: `Ciclo QA iniciado: ${id}`,
    };
  });
}

// ── qa-close ────────────────────────────────────────────────────────────────

export interface QaCloseRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly result: string;
  readonly poConfirmation?: string | undefined;
  readonly now?: (() => Date) | undefined;
}

export function qaClose(request: QaCloseRequest): string {
  const result = validateText(request.result, "result");
  if (!["approved", "changes_requested", "failed"].includes(result)) {
    fail("qa-close requiere result approved, changes_requested o failed.");
  }
  const poConfirmation =
    request.poConfirmation === undefined
      ? null
      : validateText(request.poConfirmation, "po-confirmation");
  if (result === "approved" && poConfirmation === null) {
    fail("La aprobación QA requiere confirmación explícita del PO.", EXIT_INVARIANT);
  }

  return conTicket(request.paths, request.ticketId, request.now, (contexto) => {
    if (contexto.document.fields.workflow_status !== "in_qa") {
      fail("qa-close solo se permite cuando el ticket está in_qa.", EXIT_INVARIANT);
    }

    const qa = (contexto.document.blocks.QA ?? []).map((entrada) => ({ ...entrada }));
    if (qa.length === 0 || qa.length % 2 === 0) {
      fail("No existe un ciclo QA iniciado para cerrar.", EXIT_INVARIANT);
    }

    const abierto = qa[qa.length - 1];
    if (
      abierto?.build_reference === null ||
      abierto?.build_reference === undefined ||
      abierto.environment === null ||
      abierto.environment === undefined
    ) {
      // El mensaje habla de «aprobación» pero la comprobación aplica a cualquier
      // resultado. Se conserva literal: es el texto que la referencia produce.
      fail(
        "La aprobación QA requiere un ciclo con build y ambiente trazables.",
        EXIT_INVARIANT,
      );
    }

    const id = nextId(qa, "QA");
    qa.push({
      id,
      date: contexto.date,
      build_reference: null,
      environment: null,
      result,
      findings: [],
      correction: null,
      po_confirmation: poConfirmation,
    });

    let texto = replaceBlock(contexto.document.text, "QA", qa);
    texto = replaceFrontmatterField(
      texto,
      "qa_status",
      result === "approved" ? "approved" : "pending",
    );

    return {
      texto,
      accion: "qa-closed",
      detalles: `Se registró ${id} con resultado ${result}.`,
      salida: `Resultado QA registrado: ${id}`,
    };
  });
}

// ── add-retest ──────────────────────────────────────────────────────────────

export interface AddRetestRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly pointId: string;
  readonly result: string;
  readonly poConfirmation?: string | undefined;
  readonly now?: (() => Date) | undefined;
}

export function addRetest(request: AddRetestRequest): string {
  const pointId = validateText(request.pointId, "point-id");
  const result = validateText(request.result, "result");
  if (!["pending", "approved", "changes_requested", "failed"].includes(result)) {
    fail("result no pertenece al esquema de retest.");
  }
  const poConfirmation =
    request.poConfirmation === undefined
      ? null
      : validateText(request.poConfirmation, "po-confirmation");
  if (result === "approved" && poConfirmation === null) {
    fail("Un retest aprobado requiere confirmación explícita del PO.", EXIT_INVARIANT);
  }

  return conTicket(request.paths, request.ticketId, request.now, (contexto) => {
    if (contexto.document.fields.workflow_status !== "in_qa") {
      fail("add-retest solo se permite cuando el ticket está in_qa.", EXIT_INVARIANT);
    }

    const qa = contexto.document.blocks.QA ?? [];
    const ciclo = qa[qa.length - 1];
    if (qa.length === 0 || ciclo?.result !== "pending") {
      fail("add-retest requiere un ciclo QA abierto.", EXIT_INVARIANT);
    }

    const puntos = (contexto.document.blocks.Puntos ?? []).map((punto) => ({
      ...punto,
    }));
    const punto = puntos.find((candidato) => candidato.id === pointId);
    if (punto === undefined) {
      fail("El retest referencia un punto inexistente.", EXIT_INVARIANT);
    }
    if (punto.status !== "awaiting_retest") {
      fail("El punto debe estar awaiting_retest para registrar un retest.", EXIT_INVARIANT);
    }

    const retests = (contexto.document.blocks.Retests ?? []).map((entrada) => ({
      ...entrada,
    }));
    const id = nextId(retests, "RETEST");
    retests.push({
      id,
      date: contexto.date,
      point_id: pointId,
      result,
      evidence: [],
      po_confirmation: poConfirmation,
    });

    // El punto registra el ciclo QA que lo verificó, sin duplicarlo, y cambia de
    // estado: aprobado pasa a verificado, un hallazgo vuelve a trabajo. Un
    // retest `pending` consume identificador y no mueve el punto.
    const ciclos = (punto.qa_cycles ?? []) as string[];
    if (!ciclos.includes(String(ciclo.id))) {
      punto.qa_cycles = [...ciclos, String(ciclo.id)];
    }
    if (result === "approved") punto.status = "verified";
    else if (result === "changes_requested" || result === "failed") {
      punto.status = "in_progress";
    }

    let texto = replaceBlock(contexto.document.text, "Retests", retests);
    texto = replaceBlock(texto, "Puntos", puntos);

    return {
      texto,
      accion: "retest-added",
      detalles: `Se agregó ${id} para ${pointId}.`,
      salida: `Retest agregado: ${id}`,
    };
  });
}

// ── close-attempt ───────────────────────────────────────────────────────────

/**
 * Los orígenes que el registro admite en `source`, y qué referencia espera cada
 * uno.
 *
 * El prefijo dice de dónde salieron los números, y la referencia tiene que
 * permitir llegar ahí: un `hermes:` que apunta a la base de OpenCode dice una
 * cosa y muestra otra, y el costo deja de ser verificable. No se admite un
 * prefijo desconocido —eso es como pasa un `opencodes:` mal escrito, que se lee
 * bien y no verifica nada—; `manual` es el caso declarado de una sesión que no
 * expone agregado, y `process` el de una corrida del propio harness, que reporta
 * su gasto sin base de sesión de por medio. En los dos, el motivo va en `notes`.
 */
const FUENTES_DE_CONSUMO: Readonly<Record<string, string | null>> = {
  opencode: "espera la ruta de su base (`…/opencode/opencode.db`)",
  hermes:
    "espera la ruta de la base de Hermes (`~/.hermes/state.db` o `~/.hermes/profiles/<perfil>/state.db`)",
  codex: null,
  manual: null,
  process: null,
};

/** Qué le falta a una fuente, o `null` si está bien formada. */
function problemaDeFuente(fuente: string): string | null {
  const corte = fuente.indexOf(":");
  const prefijo = corte === -1 ? "" : fuente.slice(0, corte);
  const referencia = corte === -1 ? "" : fuente.slice(corte + 1).trim();

  const lista = Object.keys(FUENTES_DE_CONSUMO).join(", ");
  if (corte === -1 || !(prefijo in FUENTES_DE_CONSUMO)) {
    return `tiene que empezar con uno de los orígenes conocidos —${lista}— seguido de dos puntos y la referencia de la sesión.`;
  }
  if (referencia === "") {
    return `\`${prefijo}:\` necesita una referencia: la ruta de la base o el identificador de la sesión.`;
  }

  const espera = FUENTES_DE_CONSUMO[prefijo] ?? null;
  if (prefijo === "opencode" && !referencia.includes("opencode")) {
    return `\`opencode:\` ${espera}, y esta apunta a otra cosa: \`${referencia}\`.`;
  }
  if (prefijo === "hermes" && !referencia.includes(".hermes")) {
    return `\`hermes:\` ${espera}, y esta apunta a otra cosa: \`${referencia}\`.`;
  }
  return null;
}

export interface CloseAttemptRequest {
  readonly paths: RegistryPaths;
  readonly ticketId: string;
  readonly technicalSummary: string;
  readonly functionalSummary: string;
  readonly qaStatus: string;
  readonly releaseImpact: string;
  readonly qaWaiverReason?: string | undefined;
  readonly poConfirmation?: string | undefined;
  readonly now?: (() => Date) | undefined;
}

export function closeAttempt(request: CloseAttemptRequest): string {
  const technicalSummary = validateText(request.technicalSummary, "technical-summary");
  const functionalSummary = validateText(request.functionalSummary, "functional-summary");
  const releaseImpact = validateText(request.releaseImpact, "release-impact");
  const qaStatus = validateText(request.qaStatus, "qa-status");
  if (qaStatus !== "approved" && qaStatus !== "waived") {
    fail("qa-status debe ser approved o waived.");
  }

  const qaWaiverReason =
    request.qaWaiverReason === undefined
      ? null
      : validateText(request.qaWaiverReason, "qa-waiver-reason");
  const poConfirmation =
    request.poConfirmation === undefined
      ? null
      : validateText(request.poConfirmation, "po-confirmation");

  if (qaStatus === "waived" && (qaWaiverReason === null || poConfirmation === null)) {
    fail("La exención QA requiere motivo y confirmación explícita del PO.", EXIT_INVARIANT);
  }

  return conTicket(request.paths, request.ticketId, request.now, (contexto) => {
    const workflow = contexto.document.fields.workflow_status;
    const qa = contexto.document.blocks.QA ?? [];

    if (qaStatus === "approved") {
      if (workflow !== "qa_approved" || !hasApprovedQaCycle(qa)) {
        fail(
          "El cierre aprobado requiere workflow qa_approved y un ciclo QA confirmado.",
          EXIT_INVARIANT,
        );
      }
    } else {
      if (workflow !== "in_qa" && workflow !== "qa_approved") {
        fail("La exención QA solo se registra desde in_qa o qa_approved.", EXIT_INVARIANT);
      }
      if (qa.length % 2 !== 0) {
        fail("No se puede eximir QA mientras exista un ciclo abierto.", EXIT_INVARIANT);
      }
    }

    // El consumo de IA se declara obligatorio en las reglas del proyecto, y una
    // regla que nadie comprueba es una recomendación. Acá se comprueba: sin
    // entradas no hay cierre, y cada entrada tiene que decir de dónde salieron
    // sus números —una fuente que no se puede verificar convierte el costo en
    // una afirmación, y el registro no afirma lo que no puede mostrar—.
    const consumo = contexto.document.blocks["Consumo de IA"] ?? [];
    if (consumo.length === 0) {
      fail(
        "El cierre exige el consumo de IA. Registralo con " +
          "`valmen add-ai-usage --id " +
          contexto.document.fields.id +
          ' --source "<opencode|hermes|codex|manual>:<referencia>" --confidence high …` ' +
          "antes de preparar el cierre.",
        EXIT_INVARIANT,
      );
    }
    for (const entrada of consumo) {
      const fuente = entrada["source"];
      const id = typeof entrada["id"] === "string" ? entrada["id"] : "CONSUMO";
      if (typeof fuente !== "string") {
        fail(`${id}.source tiene que decir de dónde salieron los números.`, EXIT_INVARIANT);
      }
      const problema = problemaDeFuente(fuente);
      if (problema !== null) {
        fail(`${id}.source: ${problema}`, EXIT_INVARIANT);
      }
    }

    const cierres = (contexto.document.blocks.Cierre ?? []).map((entrada) => ({
      ...entrada,
    }));
    const id = nextId(cierres, "CLOSE");
    cierres.push({
      kind: "ticket-close",
      id,
      date: contexto.date,
      technical_summary: technicalSummary,
      functional_summary: functionalSummary,
      qa_status: qaStatus,
      qa_waiver_reason: qaWaiverReason,
      po_confirmation: poConfirmation,
      release_impact: releaseImpact,
    });

    return {
      texto: replaceBlock(contexto.document.text, "Cierre", cierres),
      accion: "close-attempted",
      detalles: `Se agregó ${id}.`,
      salida: `Intento de cierre agregado: ${id}`,
    };
  });
}
