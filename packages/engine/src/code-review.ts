/**
 * La compuerta `code-review`: la revisión del diff entregado (R-REV-003, R-REV-004 y R-REV-005).
 *
 * Cuatro decisiones la gobiernan:
 *
 * 1. **El modelo responde hechos; el código decide.** Los revisores contestan proposiciones —«el
 *    cambio no introduce un defecto severo»— y citan `ruta:línea`; el código comprueba cada cita
 *    contra las líneas que el cambio agrega o modifica y convierte las respuestas en probabilidades
 *    que `decide` compara con los umbrales. Nadie le pregunta a un modelo si aprueba.
 * 2. **La profundidad la decide el riesgo**, que calcula `riesgoDeRevision`: sin revisores, uno, uno
 *    con cuatro lentes, o dos a la vez en un ticket SECURITY. `--evaluator` no se elige.
 * 3. **El recibo queda atado al árbol revisado.** Se congela la entrada y se comprueba que el árbol no
 *    cambie mientras se arma (T0, T1) ni mientras responden los revisores (T2).
 * 4. **Una sola corrección.** Tras un bloqueo hay una segunda ronda, acotada a lo que cambió; si no
 *    aprueba, decide una persona y una tercera corrida se rechaza.
 *
 * La entrega la exige si `.valmen/config.yaml` declara `code-review: exigida`.
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { normalizarModelo, routeFor, rutasDelProyecto } from "@valmen/adapter";
import { EXIT_INVARIANT, EXIT_SCHEMA, parseTicket, toFailure } from "@valmen/core";
import {
  type CodeReviewRecord,
  type GateDecision,
  type GateDefinition,
  type GateReceipt,
  type MechanicalCheck,
  type NotApplicableRecord,
  type ProfundidadDeRevision,
  type PropositionAnswer,
  buildReceipt,
  decide,
  hashEvaluatorConfig,
  hashState,
  summarizeReceipt,
} from "@valmen/gate";
import {
  type ReviewDiffEvaluation,
  confidenceToProbability,
  reviewDiffWithModel,
} from "@valmen/gate-llm-judge";

import { calcularArbolProbado, rutasQueCambiaron } from "./arbol-probado.js";
import { type ArchivoDelDiff, cambiosContraBase, git } from "./diff.js";
import { type LocatedTicket, type RegistryPaths, configList } from "./discovery.js";
import { type GateRunOptions, defaultReceiptId } from "./gate.js";
import { motivoDeArchivoProhibido } from "./integration-rules.js";
import { isUiFile, scanFixedColors } from "./presentation.js";
import { scriptsDeComandos } from "./qa-eligibility.js";
import { ramaBaseDelProyecto } from "./rama-base.js";
import { appendReceipt, currentReceipts, readReceipts } from "./receipts.js";
import type { RunnerResult } from "./result.js";
import { riesgoDeRevision } from "./review-risk.js";
import { scanSecrets } from "./secrets.js";

/** Lo máximo que viaja a un revisor, en bytes: unos 60 000 a 80 000 tokens. */
export const TOPE_DE_ENTRADA = 240_000;

/**
 * Los archivos de la propia compuerta: un diff que los toca se juzgaría con las reglas que él mismo
 * cambia, así que la compuerta queda como máximo en `review`.
 */
const ARCHIVOS_DE_LA_COMPUERTA: readonly string[] = [
  "packages/gate/src/definitions.ts",
  "packages/gate/src/decide.ts",
  "packages/gate/src/receipt.ts",
  "packages/gate-llm-judge/src/revisor-diff.ts",
  "packages/engine/src/code-review.ts",
  "packages/engine/src/review-risk.ts",
  "packages/engine/src/path-categories.ts",
  "packages/engine/src/arbol-probado.ts",
  "packages/engine/src/diff.ts",
  "packages/engine/src/secrets.ts",
  "packages/engine/src/presentation.ts",
  "packages/engine/src/integration-rules.ts",
  "packages/engine/src/transition.ts",
  ".valmen/config.yaml",
  ".valmen/routing.yaml",
];

/** Cuántas rutas se nombran en la nota de un árbol que cambió mientras respondían los revisores. */
const RUTAS_EN_LA_NOTA = 10;

const LENTES = [
  "sin_hallazgo_severo_riesgo",
  "sin_hallazgo_severo_resiliencia",
  "sin_hallazgo_severo_legibilidad",
  "sin_hallazgo_severo_fiabilidad",
];

const PROFUNDIDADES: readonly ProfundidadDeRevision[] = [
  "sin-revisores",
  "un-revisor",
  "un-revisor-cuatro-lentes",
  "dos-revisores",
];

const error = (mensaje: string, exitCode: number): RunnerResult => ({
  stdout: "",
  stderr: mensaje.endsWith("\n") ? mensaje : `${mensaje}\n`,
  exitCode,
});

/** Los recibos de esta compuerta posteriores a la última decisión humana, del más viejo al más nuevo. */
function cicloVigente(paths: RegistryPaths, ticketId: string): GateReceipt[] {
  const ciclo: GateReceipt[] = [];
  for (const recibo of currentReceipts(readReceipts(paths, ticketId))) {
    if (recibo.gate !== "code-review") continue;
    if (recibo.humanDecision !== null) break;
    ciclo.push(recibo);
  }
  return ciclo.reverse();
}

function sha256Del(ruta: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(ruta)).digest("hex");
  } catch {
    return null;
  }
}

/** Una respuesta con sus hallazgos ya comprobados contra las líneas cambiadas. */
type RespuestaVerificada = CodeReviewRecord["revisores"][number]["respuestas"][number];

const verificados = (r: RespuestaVerificada) =>
  r.cumple ? [] : r.hallazgos.filter((h) => h.verificado);

/** La probabilidad de una proposición según un revisor: el código decide qué vale su respuesta. */
function valorDe(r: RespuestaVerificada): number {
  if (r.cumple) return confidenceToProbability(true, r.confianza);
  // Sin un hallazgo citado en lo que el cambio toca no se bloquea, y tampoco se aprueba en silencio.
  return verificados(r).length > 0 ? confidenceToProbability(false, r.confianza) : 0.5;
}

/** El valor de una proposición con dos revisores: bloquea solo lo que confirman los dos. */
function combinar(a: RespuestaVerificada, b: RespuestaVerificada): number {
  const [va, vb] = [valorDe(a), valorDe(b)];
  const [ha, hb] = [verificados(a), verificados(b)];
  if (ha.length === 0 && hb.length === 0) return Math.min(va, vb);
  const confirmado = ha.some((x) =>
    hb.some((y) => x.ruta === y.ruta && Math.abs(x.linea - y.linea) <= 3),
  );
  return confirmado ? Math.min(va, vb) : 0.5;
}

interface ParteDeEntrada {
  readonly ticketId: string;
  readonly tipo: string;
  readonly titulo: string;
  readonly descripcion: string;
  readonly plan: string;
  readonly ref: string;
  readonly commit: string;
  readonly ronda: 1 | 2;
  readonly previos: readonly string[];
  readonly acotada: boolean;
  readonly enviados: readonly ArchivoDelDiff[];
}

/** El texto congelado que ven los revisores. Con `conArchivos`, el contenido completo de cada archivo. */
function armarEntrada(
  root: string,
  p: ParteDeEntrada,
  conArchivos: boolean,
): string | null {
  const partes = [
    "ENTRADA CONGELADA PARA LA REVISIÓN DEL DIFF",
    "",
    "## Contexto del ticket (contexto, no evidencia de que el cambio esté bien)",
    `Ticket: ${p.ticketId} · ${p.tipo} · ${p.titulo}`,
    "### Descripción funcional",
    p.descripcion.trim(),
    "### Plan",
    p.plan.trim(),
    "",
    "## Base y ronda",
    `Base: ${p.ref} (commit ${p.commit})`,
    `Ronda: ${p.ronda}`,
  ];
  if (p.previos.length > 0) {
    partes.push(
      "",
      "## Hallazgos de la ronda anterior (¿los atiende el cambio de ahora?)",
      ...p.previos,
    );
  }
  if (p.acotada) {
    partes.push("", "Solo se envían los archivos que cambiaron desde la ronda anterior.");
  }
  partes.push(
    "",
    "## Parche contra la base (las líneas con + son lo que el cambio agrega)",
  );
  for (const archivo of p.enviados) partes.push(archivo.parche.trimEnd());

  if (conArchivos) {
    partes.push("", "## Archivos completos después del cambio (con su número de línea)");
    let acumulado = 0;
    for (const archivo of p.enviados) {
      if (archivo.estado === "D") {
        partes.push(`=== ${archivo.ruta} (eliminado) ===`);
        continue;
      }
      if (archivo.binario) {
        partes.push(`=== ${archivo.ruta} (binario: solo el nombre) ===`);
        continue;
      }
      const ruta = join(root, ...archivo.ruta.split("/"));
      try {
        acumulado += statSync(ruta).size;
        if (acumulado > TOPE_DE_ENTRADA) return null;
        const texto = readFileSync(ruta, "utf8");
        const lineas = texto.split("\n");
        if (texto.endsWith("\n")) lineas.pop();
        partes.push(
          `=== ${archivo.ruta} ===`,
          ...lineas.map((linea, i) => `${i + 1}: ${linea}`),
        );
      } catch {
        partes.push(`=== ${archivo.ruta} (no se pudo leer) ===`);
      }
    }
  }
  return partes.join("\n");
}

/** Corre la compuerta `code-review` sobre el diff de un ticket en `in_progress`. */
export async function runCodeReview(
  paths: RegistryPaths,
  options: GateRunOptions,
  contexto: { readonly definition: GateDefinition; readonly ticket: LocatedTicket },
): Promise<RunnerResult> {
  const { definition } = contexto;
  const { ticketId } = options;
  const now = options.now ?? (() => new Date());
  const parsed = parseTicket(contexto.ticket.text);
  const tipo = parsed.fields.type;

  // ── La ronda ─────────────────────────────────────────────────────────────────────────────
  const ciclo = cicloVigente(paths, ticketId);
  const ultimo = ciclo[ciclo.length - 1];
  let ronda: 1 | 2 = 1;
  let anterior: GateReceipt | null = null;
  if (ultimo !== undefined && ultimo.outcome !== "approve") {
    if ((ultimo.codeReview?.ronda ?? 1) >= 2) {
      const [r1, r2] = [ciclo[ciclo.length - 2]?.id ?? "?", ultimo.id];
      return error(
        `La compuerta code-review ya corrió dos rondas sin aprobar (recibos ${r1} y ${r2}): no se abre ` +
          `una tercera. Lo decide una persona con \`valmen gate-decide --id ${ticketId} --receipt ${r2} ` +
          "--decision approve|reject --actor <nombre>`; un rechazo abre un ciclo nuevo.",
        EXIT_INVARIANT,
      );
    }
    ronda = 2;
    anterior = ultimo;
  }
  const reciboId =
    options.receiptId ?? defaultReceiptId(paths, ticketId, definition.id, now);

  // ── El árbol y el diff ───────────────────────────────────────────────────────────────────
  let t0;
  try {
    t0 = calcularArbolProbado(paths);
  } catch (caught) {
    return error(
      `No se pudo calcular el árbol de trabajo: ${toFailure(caught).message}`,
      EXIT_INVARIANT,
    );
  }
  if (t0 === null) {
    return error(
      "La compuerta code-review revisa un diff y necesita que el proyecto sea un repositorio git.",
      EXIT_INVARIANT,
    );
  }

  // Sin `--base`, la rama base del proyecto (`execution.base-branch`, `main` si no se declara), o
  // `HEAD` si esa rama no existe.
  let ref = options.base;
  if (ref === undefined) {
    let ramaBase: string;
    try {
      ramaBase = ramaBaseDelProyecto(paths.root);
    } catch (caught) {
      return error(
        `No se pudo resolver la rama base del proyecto: ${toFailure(caught).message}`,
        EXIT_INVARIANT,
      );
    }
    ref =
      git(paths.root, ["rev-parse", "--verify", "-q", `${ramaBase}^{commit}`]) === null
        ? "HEAD"
        : ramaBase;
  }
  let cambios;
  try {
    cambios = cambiosContraBase(paths.root, ref, ticketId, paths.ticketsDir);
  } catch (caught) {
    return error(
      `No se pudo leer el diff contra la base: ${toFailure(caught).message}`,
      EXIT_INVARIANT,
    );
  }
  const { archivos, commit } = cambios;

  const riesgo = riesgoDeRevision({
    ticket: parsed,
    cambios: archivos.map((a) => ({ estado: a.estado, ruta: a.ruta })),
    ticketsDir: paths.ticketsDir,
    scriptsDePrueba: scriptsDeComandos(configList(paths.root, "test-commands")),
  });

  // ── La profundidad ───────────────────────────────────────────────────────────────────────
  const delRiesgo: ProfundidadDeRevision =
    riesgo.nivel === "bajo"
      ? "sin-revisores"
      : tipo === "SECURITY"
        ? "dos-revisores"
        : riesgo.nivel === "alto"
          ? "un-revisor-cuatro-lentes"
          : "un-revisor";
  const profundidad = PROFUNDIDADES[
    Math.max(
      PROFUNDIDADES.indexOf(delRiesgo),
      anterior?.codeReview === undefined
        ? 0
        : PROFUNDIDADES.indexOf(anterior.codeReview.profundidad),
    )
  ] as ProfundidadDeRevision;
  const ids =
    profundidad === "sin-revisores"
      ? []
      : profundidad === "un-revisor"
        ? ["sin_hallazgo_severo"]
        : LENTES;
  const cuantos =
    profundidad === "sin-revisores" ? 0 : profundidad === "dos-revisores" ? 2 : 1;

  // ── Las comprobaciones estructurales, en código ──────────────────────────────────────────
  const secretos = cambios.bloques.flatMap((b) =>
    scanSecrets(b.lines.join("\n")).map(
      (h) => `${b.path}:${b.startLine + h.line - 1} (${h.kind})`,
    ),
  );
  const colores = cambios.bloques
    .filter((b) => isUiFile(b.path))
    .flatMap((b) =>
      scanFixedColors(b.lines.join("\n")).map(
        (h) => `${b.path}:${b.startLine + h.line - 1} ${h.value}`,
      ),
    );
  const prohibidos = archivos
    .filter((a) => a.estado !== "D")
    .map((a) => motivoDeArchivoProhibido(a.ruta))
    .filter((m): m is string => m !== null);
  const propiaCompuerta = archivos
    .map((a) => a.ruta)
    .filter((r) => ARCHIVOS_DE_LA_COMPUERTA.includes(r));

  // ── Lo que cambió desde la primera ronda ─────────────────────────────────────────────────
  const shaActual = new Map(
    archivos.map(
      (a) =>
        [
          a.ruta,
          a.estado === "D" ? null : sha256Del(join(paths.root, ...a.ruta.split("/"))),
        ] as const,
    ),
  );
  const previoEntrada = new Map(
    (anterior?.codeReview?.entrada.archivos ?? []).map((a) => [a.ruta, a.sha256] as const),
  );
  const cambiados = new Set(
    [...new Set([...shaActual.keys(), ...previoEntrada.keys()])].filter(
      (ruta) =>
        (shaActual.has(ruta) ? shaActual.get(ruta) : undefined) !==
        (previoEntrada.has(ruta) ? previoEntrada.get(ruta) : undefined),
    ),
  );
  const previos = (anterior?.codeReview?.revisores ?? []).flatMap((r) =>
    r.respuestas.flatMap((x) => verificados(x).map((h) => h)),
  );
  const acotar =
    anterior?.codeReview !== undefined && anterior.codeReview.revisores.length > 0;
  const enviados = acotar ? archivos.filter((a) => cambiados.has(a.ruta)) : archivos;
  const sinAtender = acotar
    ? previos.filter((h) => !cambiados.has(h.ruta) && shaActual.has(h.ruta))
    : [];

  // ── La entrada congelada ─────────────────────────────────────────────────────────────────
  const parte: ParteDeEntrada = {
    ticketId,
    tipo,
    titulo: parsed.fields.title,
    descripcion: parsed.sections["Descripción funcional"] ?? "",
    plan: parsed.sections["Plan"] ?? "",
    ref,
    commit,
    ronda,
    previos: previos.map((h) => `- ${h.ruta}:${h.linea} — ${h.motivo}`),
    acotada: acotar,
    enviados,
  };
  let soloParche = false;
  let texto = armarEntrada(paths.root, parte, true);
  if (texto === null || Buffer.byteLength(texto) > TOPE_DE_ENTRADA) {
    soloParche = true;
    texto = armarEntrada(paths.root, parte, false) ?? "";
  }
  const bytes = Buffer.byteLength(texto);

  // T1: si el árbol cambió mientras se armaba la entrada, no se llama a nadie ni se escribe recibo.
  const t1 = calcularArbolProbado(paths);
  if (t1 === null || t1.registro.hash !== t0.registro.hash) {
    return error(
      "El árbol de trabajo cambió mientras se armaba la entrada de la revisión: no se llamó a ningún revisor " +
        `ni se escribió recibo. Vuelve a correr \`valmen gate code-review --id ${ticketId}\` con el árbol quieto.`,
      EXIT_INVARIANT,
    );
  }

  // ── El revisor y su identidad ────────────────────────────────────────────────────────────
  const rutas = rutasDelProyecto(paths.root);
  const ruta = routeFor(rutas, "reviewer");
  const notas: string[] = [...(options.notes ?? [])];
  const implementacion = routeFor(rutas, "agent-implementation");
  if (
    cuantos > 0 &&
    ruta !== null &&
    implementacion !== null &&
    normalizarModelo(ruta.model) === normalizarModelo(implementacion.model)
  ) {
    notas.push(
      `El revisor usa el mismo modelo que el rol agent-implementation (${ruta.model}): puede compartir los ` +
        "puntos ciegos de quien implementó el cambio.",
    );
  }
  if (colores.length > 0) {
    notas.push(`Colores fijos agregados en interfaz (no vetan): ${colores.join("; ")}.`);
  }

  // ── Lo que el código decide antes de llamar a nadie ──────────────────────────────────────
  const bloqueos: string[] = [];
  if (secretos.length > 0)
    bloqueos.push(
      `hay una credencial en lo agregado: ${secretos.join(", ")} (el valor no se registra)`,
    );
  if (sinAtender.length > 0) {
    bloqueos.push(
      `hallazgo de la ronda 1 sin atender: ${sinAtender.map((h) => `${h.ruta}:${h.linea}`).join(", ")} ` +
        "(la corrección no tocó ese archivo)",
    );
  }
  const revisiones: string[] = [];
  if (prohibidos.length > 0) revisiones.push(prohibidos.join("; "));
  if (archivos.length === 0) {
    revisiones.push(
      "el diff contra la base no cambia ningún archivo funcional: no hay nada que revisar",
    );
  }
  if (cuantos > 0 && bytes > TOPE_DE_ENTRADA) {
    revisiones.push(
      `el diff pasa el tope de entrada (${bytes} de ${TOPE_DE_ENTRADA} bytes): no se envía a ningún revisor`,
    );
  }
  if (
    cuantos > 0 &&
    bloqueos.length === 0 &&
    revisiones.length === 0 &&
    scanSecrets(texto).length > 0
  ) {
    revisiones.push(
      "la entrada trae una credencial fuera de las líneas agregadas: no se envía a ningún modelo",
    );
  }

  const checks: MechanicalCheck[] = [
    {
      id: "sin_secretos",
      description: "Lo agregado no expone credenciales.",
      result: secretos.length > 0 ? "fail" : "pass",
      ...(secretos.length > 0 ? { detail: secretos.join(", ") } : {}),
    },
    {
      id: "sin_archivos_prohibidos",
      description: "El diff no toca archivos que una jornada no commitea.",
      result: prohibidos.length > 0 ? "warn" : "pass",
      ...(prohibidos.length > 0 ? { detail: prohibidos.join("; ") } : {}),
    },
    {
      id: "colores_fijos",
      description: "Lo agregado en interfaz no trae colores fijos.",
      result: colores.length > 0 ? "warn" : "pass",
      ...(colores.length > 0 ? { detail: colores.join("; ") } : {}),
    },
    ...(ronda === 2
      ? [
          {
            id: "hallazgo_sin_atender",
            description: "La corrección toca los archivos de los hallazgos de la ronda 1.",
            result: sinAtender.length > 0 ? ("fail" as const) : ("pass" as const),
          },
        ]
      : []),
  ];

  const estado = { entrada: texto, base: commit, riesgo: riesgo.nivel, ronda };
  let decision: GateDecision | null = null;
  if (bloqueos.length > 0) {
    decision = {
      outcome: "block",
      reason: bloqueos.join("; "),
      actor: "engine",
      propositions: [],
      blocking: ["estructural"],
      inBand: [],
    };
  } else if (revisiones.length > 0) {
    decision = {
      outcome: "review",
      reason: revisiones.join("; "),
      actor: "engine",
      propositions: [],
      blocking: [],
      inBand: ["estructural"],
    };
  } else if (cuantos === 0) {
    decision = {
      outcome: "approve",
      reason: `riesgo bajo (${riesgo.motivos.join("; ")}): solo comprobaciones estructurales, sin revisores`,
      actor: "engine",
      propositions: [],
      blocking: [],
      inBand: [],
    };
  }

  // ── La repetición, antes de gastar una llamada ───────────────────────────────────────────
  const rutaDelRol = ruta;
  const evaluatorKey = hashEvaluatorConfig({
    evaluator: decision === null ? "llm-judge" : "command",
    provider: rutaDelRol?.provider ?? null,
    model: rutaDelRol?.model ?? null,
    effort: rutaDelRol?.effort ?? null,
    profundidad,
  });
  let forzado: { reason: string; receiptId: string } | undefined;
  if (decision === null) {
    const previo = currentReceipts(readReceipts(paths, ticketId)).find(
      (r) => r.gate === definition.id,
    );
    if (
      previo !== undefined &&
      previo.stateHash === hashState(estado) &&
      previo.evaluatorKey === evaluatorKey &&
      previo.evaluator === "llm-judge"
    ) {
      const motivo = options.forceReason?.trim() ?? "";
      if (motivo === "") {
        return error(
          `La compuerta code-review ya revisó este mismo diff con la misma configuración (recibo ${previo.id}: ` +
            `${previo.outcome}). Repetirla solo busca otra respuesta y cuesta una llamada: cambia el árbol o ` +
            "da un motivo con --force-reason «…», que quedará escrito en el recibo nuevo.",
          EXIT_INVARIANT,
        );
      }
      forzado = { reason: motivo, receiptId: previo.id };
    }
  }

  // ── Los revisores ────────────────────────────────────────────────────────────────────────
  let revisores: CodeReviewRecord["revisores"][number][] = [];
  let evaluaciones: ReviewDiffEvaluation[] = [];
  let answers: PropositionAnswer[] = [];
  const inicio = Date.now();
  if (decision === null) {
    if (ruta === null)
      return error(
        "El enrutado no resuelve el rol reviewer: no hay quien revise el diff.",
        EXIT_INVARIANT,
      );
    const usadas = definition.propositions.filter((p) => ids.includes(p.id));
    const revisar = options.reviewDiff ?? reviewDiffWithModel;
    const apiKey = options.credentialForProvider?.(ruta.provider);
    const llamar = (): Promise<ReviewDiffEvaluation> =>
      revisar({
        provider: ruta.provider,
        model: ruta.model,
        effort: ruta.effort,
        entrada: texto as string,
        proposiciones: usadas.map((p) => ({ id: p.id, instrucciones: p.instructions })),
        ...(apiKey === undefined ? {} : { apiKey }),
      });
    try {
      // En SECURITY las dos llamadas salen a la vez y ninguna recibe la respuesta de la otra.
      evaluaciones = await Promise.all(Array.from({ length: cuantos }, llamar));
    } catch (caught) {
      const failure = toFailure(caught);
      return error(
        `El revisor no pudo completar la revisión: ${failure.message}\nNo se escribió recibo.`,
        failure.exitCode,
      );
    }

    const porRuta = new Map(archivos.map((a) => [a.ruta, a] as const));
    const verifica = (rutaCitada: string, linea: number): boolean =>
      (porRuta.get(rutaCitada)?.tramos ?? []).some(
        (t) => linea >= t.desde && linea <= t.hasta,
      );
    revisores = evaluaciones.map((ev) => ({
      rol: "reviewer",
      provider: ev.model.provider,
      model: ev.model.model,
      resolvedVersion: ev.model.resolvedVersion,
      effort: ruta.effort,
      respuestas: ev.respuestas.map((r) => ({
        proposicion: r.proposicion,
        cumple: r.cumple,
        confianza: r.confianza,
        motivo: r.motivo,
        hallazgos: r.hallazgos.map((h) => {
          const citada = h.ruta.replace(/^\.\//, "");
          return {
            ruta: citada,
            linea: h.linea,
            motivo: h.motivo,
            verificado: verifica(citada, h.linea),
          };
        }),
      })),
      usage: ev.usage,
      latencyMs: ev.latencyMs,
    }));

    answers = usadas.map((p): PropositionAnswer => {
      const respuestas = revisores.map(
        (r) => r.respuestas.find((x) => x.proposicion === p.id) as RespuestaVerificada,
      );
      const [a, b] = respuestas;
      const value = a === undefined ? 0 : b === undefined ? valorDe(a) : combinar(a, b);
      return {
        id: p.id,
        kind: "noul",
        value,
        reason: respuestas.map((x) => x.motivo).join(" | "),
      };
    });
    decision = decide(usadas, answers, definition.policy);
    if (propiaCompuerta.length > 0 && decision.outcome === "approve") {
      decision = {
        ...decision,
        outcome: "review",
        actor: "engine",
        reason: `el diff toca la propia compuerta (${propiaCompuerta.join(", ")}): como máximo review; ${decision.reason}`,
      };
    }
  } else if (propiaCompuerta.length > 0 && decision.outcome === "approve") {
    decision = {
      ...decision,
      outcome: "review",
      actor: "engine",
      reason: `el diff toca la propia compuerta (${propiaCompuerta.join(", ")}): como máximo review`,
    };
  }
  const latencyMs = Date.now() - inicio;

  // Una segunda ronda que no aprueba la decide una persona: no se abre una tercera.
  if (ronda === 2 && decision.outcome !== "approve") {
    decision = {
      ...decision,
      outcome: "review",
      actor: "engine",
      reason: `segunda ronda: lo decide una persona; recibos ${anterior?.id ?? "?"} y ${reciboId}; no se abre una tercera — ${decision.reason}`,
    };
  }

  // T2: si el árbol cambió mientras respondían los revisores, el recibo conserva el revisado.
  if (evaluaciones.length > 0) {
    try {
      const t2 = calcularArbolProbado(paths);
      if (t2 !== null && t2.registro.hash !== t0.registro.hash) {
        const quePaso = rutasQueCambiaron(t0.archivos, t2.archivos);
        notas.push(
          `El árbol de trabajo cambió mientras respondían los revisores (${quePaso.length} ruta(s): ` +
            `${quePaso.slice(0, RUTAS_EN_LA_NOTA).join(", ")}${quePaso.length > RUTAS_EN_LA_NOTA ? ` y ${quePaso.length - RUTAS_EN_LA_NOTA} más` : ""}): ` +
            "el recibo guarda el árbol que se revisó, así que esos cambios no están cubiertos.",
        );
      }
    } catch (caught) {
      notas.push(
        `No se pudo volver a calcular el árbol al terminar la revisión (${toFailure(caught).message}).`,
      );
    }
  }

  // ── El recibo ────────────────────────────────────────────────────────────────────────────
  const preguntadas = new Set(answers.map((a) => a.id));
  const noAplican: NotApplicableRecord[] = definition.propositions
    .filter((p) => !preguntadas.has(p.id))
    .map((p) => ({
      id: p.id,
      status: "no_aplica",
      appliesTo: [],
      ticketType: tipo,
      reason: ids.includes(p.id)
        ? "no se llamó a ningún revisor: el código decidió antes"
        : `no la usa la profundidad ${profundidad} (riesgo ${riesgo.nivel})`,
    }));
  const usage =
    evaluaciones.length === 0
      ? null
      : {
          inputTokens: evaluaciones.reduce((t, e) => t + e.usage.inputTokens, 0),
          outputTokens: evaluaciones.reduce((t, e) => t + e.usage.outputTokens, 0),
          costUsd: evaluaciones.reduce((t, e) => t + e.usage.costUsd, 0),
        };
  const primero = evaluaciones[0];
  const registro: CodeReviewRecord = {
    base: { ref, commit },
    riesgo: { nivel: riesgo.nivel, motivos: riesgo.motivos },
    profundidad,
    ronda,
    reciboAnterior: anterior?.id ?? null,
    entrada: {
      sha256: createHash("sha256").update(texto).digest("hex"),
      bytes,
      soloParche,
      archivos: archivos.map((a) => ({
        ruta: a.ruta,
        estado: a.estado,
        sha256: shaActual.get(a.ruta) ?? null,
      })),
      ...(acotar ? { acotadaA: enviados.map((a) => a.ruta) } : {}),
    },
    revisores,
    propiaCompuerta,
  };
  const receipt = buildReceipt({
    id: reciboId,
    gate: definition.id,
    propositions: definition.propositions,
    policy: definition.policy,
    subject: {
      type: "ticket",
      id: ticketId,
      revision: contexto.ticket.text.length.toString(),
    },
    decision,
    state: estado,
    answers,
    mechanicalChecks: checks,
    model: primero === undefined ? null : primero.model,
    usage,
    latencyMs: evaluaciones.length === 0 ? 0 : latencyMs,
    decidedAt: now().toISOString(),
    notes: notas,
    testedTree: t0.registro,
    codeReview: registro,
    evaluator: evaluaciones.length === 0 ? "command" : "llm-judge",
    notApplicable: noAplican,
    evaluatorKey,
    ...(forzado === undefined ? {} : { forced: forzado }),
  });

  // ── El informe ───────────────────────────────────────────────────────────────────────────
  const lineas = [
    `Gate ${definition.id} — ${ticketId}`,
    `  Base: ${ref} (commit ${commit.slice(0, 12)}) · ronda ${ronda}${anterior === null ? "" : ` (tras ${anterior.id})`}`,
    `  Riesgo: ${riesgo.nivel} — ${riesgo.motivos.join("; ")}`,
    `  Profundidad: ${profundidad}${ronda === 2 && acotar ? ` · acotada a ${enviados.length} archivo(s)` : ""}`,
    `  Entrada: ${bytes} bytes${soloParche ? " (solo el parche)" : ""}, ${archivos.length} archivo(s)`,
    "",
    "  Checks mecánicos (código, sin coste)",
    ...checks.map((c) =>
      `    ${{ pass: "✓", fail: "✗", warn: "!", skip: "·" }[c.result]}  ${c.id.padEnd(24)} ${c.detail ?? ""}`.trimEnd(),
    ),
  ];
  for (const [i, r] of revisores.entries()) {
    lineas.push("", `  Revisor ${i + 1}: ${r.provider} ${r.model} (${r.resolvedVersion})`);
    for (const x of r.respuestas) {
      lineas.push(
        `    ${x.cumple ? "✓" : "✗"}  ${x.proposicion}  confianza ${x.confianza.toFixed(2)}  ${x.motivo}`,
      );
      for (const h of x.hallazgos)
        lineas.push(
          `       ${h.verificado ? "·" : "(fuera de lo cambiado)"} ${h.ruta}:${h.linea} ${h.motivo}`,
        );
    }
  }
  for (const p of decision.propositions) {
    lineas.push(
      `    ${p.inBand ? "⚠" : p.effect?.outcome === "approve" ? "✓" : "✗"}  ${p.label}`,
    );
  }
  lineas.push(
    "",
    `  RESULTADO: ${decision.outcome.toUpperCase()}`,
    `  Motivo:    ${decision.reason}`,
    ...(decision.outcome === "review"
      ? ["", "  Va a revisión humana. El ticket NO avanza: el gate no cambia estados."]
      : []),
    ...(notas.length > 0 ? ["", "  Notas", ...notas.map((n) => `    ${n}`)] : []),
    "",
    "  Recibo",
    `    evaluador          ${receipt.evaluator ?? ""}`,
    `    árbol revisado     ${t0.registro.hash.slice(0, 23)}…  ${t0.registro.files} archivo(s)`,
    `    coste              $${(usage?.costUsd ?? 0).toFixed(6)}`,
  );
  if (options.dryRun === true) {
    lineas.push("", "  (simulación: el recibo no se escribió)");
  } else {
    try {
      const donde = appendReceipt(paths, ticketId, receipt);
      lineas.push(
        "",
        `  Recibo anexado: ${donde.replace(`${paths.root}/`, "")}`,
        `  ${summarizeReceipt(receipt)}`,
      );
    } catch (caught) {
      return {
        stdout: `${lineas.join("\n")}\n`,
        stderr: `No se pudo escribir el recibo: ${toFailure(caught).message}`,
        exitCode: EXIT_SCHEMA,
      };
    }
  }
  return {
    stdout: `${lineas.join("\n")}\n`,
    stderr: "",
    exitCode: decision.outcome === "approve" ? 0 : EXIT_INVARIANT,
  };
}
