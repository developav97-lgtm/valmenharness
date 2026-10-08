/**
 * El revisor de un `review` (R-APRO-003).
 *
 * `evaluateWithJudge` responde proposiciones sobre un estado: es lo que hace un gate
 * antes de decidir. Este módulo hace otra cosa, y por eso no lo reutiliza: el gate ya
 * decidió, dejó un recibo en `review` con las proposiciones que cayeron en la banda
 * media, y el revisor es un **segundo modelo** que lee el artefacto contra *solo esas*
 * proposiciones y contesta si lo respaldan. No reescribe el artefacto, no evalúa otras
 * proposiciones y no escribe nada: devuelve una decisión estructurada que otro código
 * decidirá si guarda.
 *
 * Tres decisiones lo gobiernan:
 *
 * 1. **Una respuesta fuera del esquema no es una aprobación.** Un modelo que contesta
 *    en prosa, que inventa una decisión o que no da razón lanza `JudgeError`. Leer un
 *    `approve` donde no lo hay es el único error de este módulo que no se puede
 *    permitir, así que el lector es estricto.
 * 2. **`approve` exige que cada proposición esté respaldada.** Una decisión `approve`
 *    con una proposición marcada como no respaldada se contradice a sí misma, y
 *    tampoco se lee como aprobación: se rechaza con su propio código.
 * 3. **El modelo viaja con la decisión.** Quien la guarde tiene que poder auditar qué
 *    modelo la tomó y compararlo con el que produjo el artefacto; elegir ese modelo no
 *    es cosa de este módulo —lo hace `modeloDelRevisor`, en el enrutado—.
 */
import { callChat, ChatError, type ClaudeCliRunner, DEFAULT_PROVIDER } from "@valmen/credentials";

import { JudgeError, MOTIVO_MAX, TIMEOUT_JUEZ_MS } from "./judge.js";

/** Las etapas cuyo `review` puede revisar un modelo. */
export type EtapaRevisable = "analysis" | "plan";

/** Una proposición que quedó en la banda media, tal como el recibo la guardó. */
export interface ProposicionEnDuda {
  readonly id: string;
  /** Qué juzgaba, cuando la proposición lo declara. */
  readonly descripcion?: string;
  /** El valor que dio el evaluador, entre 0 y 1. */
  readonly valor: number;
  /** Por qué respondió así el evaluador, o `null` si no lo dijo. */
  readonly motivo: string | null;
}

/** La decisión del revisor. */
export type DecisionDelRevisor = "approve" | "reject";

/** Lo que el revisor dijo de una proposición. */
export interface RevisionPorProposicion {
  readonly id: string;
  readonly respaldada: boolean;
  readonly motivo: string;
}

/** Lo que devuelve una revisión. */
export interface ReviewEvaluation {
  readonly decision: DecisionDelRevisor;
  /** La razón de la decisión, recortada a `MOTIVO_MAX`. */
  readonly reason: string;
  readonly porProposicion: readonly RevisionPorProposicion[];
  /** El modelo que tomó la decisión. */
  readonly model: {
    readonly provider: string;
    readonly model: string;
    readonly resolvedVersion: string;
  };
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly costUsd: number;
  };
  readonly latencyMs: number;
}

/** Opciones de una revisión. */
export interface ReviewOptions {
  readonly provider: string;
  readonly model: string;
  readonly effort: "auto" | "low" | "medium" | "high";
  readonly etapa: EtapaRevisable;
  /** El artefacto que el gate evaluó, ya armado como texto. */
  readonly artefacto: string;
  /** Solo las proposiciones en banda media: no se agrega ninguna otra. */
  readonly proposiciones: readonly ProposicionEnDuda[];
  readonly apiKey?: string;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
  /** Quien ejecuta el CLI de los proveedores que se hablan por él. Para pruebas. */
  readonly cliRunner?: ClaudeCliRunner;
  readonly timeoutMs?: number;
}

/** El nombre de la forma de salida estructurada. */
const NOMBRE_DE_LA_FORMA = "review_decision";

/**
 * El prompt de sistema del revisor.
 *
 * Insiste en lo mismo que el del juez —no inventar, no inflar—, pero con el rol
 * cambiado: acá no se responde una pregunta sobre un estado sino que se **decide si
 * un artefacto respalda lo que otro evaluador dejó en duda**. Un modelo al que se le
 * pide revisar sin límites tiende a reescribir o a opinar de todo, así que el prompt
 * le dice qué no hacer.
 */
export function promptDelRevisor(): string {
  return [
    "Eres el revisor de un artefacto de ingeniería. Otro evaluador ya lo juzgó y dejó",
    "en duda unas proposiciones: no pudo aprobarlas ni bloquearlas. Tu trabajo es",
    "decidir si el artefacto respalda esas proposiciones, y solo esas.",
    "",
    "Reglas:",
    "1. Revisa el artefacto contra cada proposición en duda, por separado. Para cada",
    "   una responde si el artefacto la respalda (`respaldada`) y por qué, en una frase.",
    "2. No reescribas el artefacto, no propongas mejoras y no evalúes proposiciones",
    "   que no se te pidieron.",
    "3. La ausencia de evidencia no es evidencia: si el artefacto no contiene lo que la",
    "   proposición pide, no está respaldada. El valor y el motivo del evaluador anterior",
    "   son contexto, no evidencia; no los tomes como respuesta.",
    "4. Decide `approve` únicamente si el artefacto respalda **cada** proposición. Con",
    "   una sola no respaldada, o con duda, decide `reject`.",
    "5. Da en `reason` la razón de tu decisión, en pocas frases.",
    "",
    "Responde solo con el JSON del esquema.",
  ].join("\n");
}

/** El mensaje de usuario: la etapa, el artefacto y las proposiciones en duda. */
function mensajeDelRevisor(options: ReviewOptions): string {
  const preguntas = options.proposiciones.map((proposicion) => {
    const partes = [`- id: ${proposicion.id}`];
    if (proposicion.descripcion !== undefined && proposicion.descripcion.trim() !== "") {
      partes.push(`  qué se juzgaba: ${proposicion.descripcion.trim()}`);
    }
    partes.push(`  valor del evaluador: ${proposicion.valor.toFixed(2)}`);
    partes.push(
      `  motivo del evaluador: ${
        proposicion.motivo === null || proposicion.motivo.trim() === ""
          ? "no lo dio"
          : proposicion.motivo.trim()
      }`,
    );
    return partes.join("\n");
  });
  return [
    `ETAPA: ${options.etapa}`,
    "",
    "ARTEFACTO:",
    "```",
    options.artefacto,
    "```",
    "",
    "PROPOSICIONES EN DUDA:",
    preguntas.join("\n"),
  ].join("\n");
}

/** El esquema de la respuesta: la decisión, su razón y una entrada por proposición. */
function esquemaDelRevisor(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      decision: {
        type: "string",
        enum: ["approve", "reject"],
        description: "`approve` solo si el artefacto respalda cada proposición en duda.",
      },
      reason: { type: "string", description: "La razón de la decisión, en pocas frases." },
      porProposicion: {
        type: "array",
        description: "Una entrada por cada proposición en duda.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "El id de la proposición." },
            respaldada: { type: "boolean", description: "El artefacto la respalda." },
            motivo: { type: "string", description: "Por qué, en una frase." },
          },
          required: ["id", "respaldada", "motivo"],
          additionalProperties: false,
        },
      },
    },
    required: ["decision", "reason", "porProposicion"],
    additionalProperties: false,
  };
}

/** El texto recortado a `MOTIVO_MAX`, o `null` si no es texto o está vacío. */
function textoRecortado(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (texto === "") return null;
  return texto.length > MOTIVO_MAX ? texto.slice(0, MOTIVO_MAX) : texto;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Valida lo que devolvió el modelo y lo convierte en una decisión.
 *
 * Cualquier cosa fuera del esquema lanza `JudgeError`: nada de lo que no se entienda
 * se lee como `approve`.
 */
function leerDecision(
  contenido: string,
  proposiciones: readonly ProposicionEnDuda[],
): Pick<ReviewEvaluation, "decision" | "reason" | "porProposicion"> {
  let valor: unknown;
  try {
    valor = JSON.parse(contenido);
  } catch {
    throw new JudgeError(
      `El revisor no respetó el esquema: el contenido no es JSON y era ` +
        `${JSON.stringify(contenido).slice(0, 120)}. ` +
        "Una respuesta que no respeta el formato no puede decidir un review.",
      "MALFORMED_RESPONSE",
    );
  }
  if (!esObjeto(valor)) {
    throw new JudgeError(
      "El revisor no respetó el esquema: la respuesta no es un objeto.",
      "MALFORMED_RESPONSE",
    );
  }

  const decision = valor["decision"];
  if (decision !== "approve" && decision !== "reject") {
    throw new JudgeError(
      `El revisor no respetó el esquema: la decisión es ${JSON.stringify(decision)} y debe ser ` +
        '"approve" o "reject". Una decisión que no se entiende no es una aprobación.',
      "INVALID_DECISION",
    );
  }

  const reason = textoRecortado(valor["reason"]);
  if (reason === null) {
    throw new JudgeError(
      "El revisor no dio la razón de su decisión: una decisión sin razón no se puede auditar.",
      "MISSING_REASON",
    );
  }

  const entradas = valor["porProposicion"];
  if (!Array.isArray(entradas)) {
    throw new JudgeError(
      "El revisor no respetó el esquema: falta `porProposicion`, la respuesta por cada proposición en duda.",
      "MALFORMED_RESPONSE",
    );
  }
  const porId = new Map<string, RevisionPorProposicion>();
  for (const entrada of entradas) {
    if (
      !esObjeto(entrada) ||
      typeof entrada["id"] !== "string" ||
      typeof entrada["respaldada"] !== "boolean"
    ) {
      throw new JudgeError(
        "El revisor no respetó el esquema: una entrada de `porProposicion` no trae `id` y `respaldada`.",
        "MALFORMED_RESPONSE",
      );
    }
    porId.set(entrada["id"], {
      id: entrada["id"],
      respaldada: entrada["respaldada"],
      motivo: textoRecortado(entrada["motivo"]) ?? "",
    });
  }

  // Una respuesta por cada proposición que se preguntó, y solo esas: lo que el modelo
  // agregue por su cuenta no es una proposición del recibo.
  const faltantes = proposiciones.map((p) => p.id).filter((id) => !porId.has(id));
  if (faltantes.length > 0) {
    throw new JudgeError(
      `El revisor no respondió por cada proposición en duda: faltan ${faltantes.join(", ")}.`,
      "MISSING_ANSWER",
    );
  }
  const porProposicion = proposiciones.map((p) => porId.get(p.id) as RevisionPorProposicion);

  // `approve` y una proposición no respaldada se contradicen: ninguna de las dos lecturas
  // es la del modelo, y la salida segura no es elegir una por él sino no decidir.
  const sinRespaldo = porProposicion.filter((p) => !p.respaldada).map((p) => p.id);
  if (decision === "approve" && sinRespaldo.length > 0) {
    throw new JudgeError(
      `El revisor decidió approve y marcó sin respaldo ${sinRespaldo.join(", ")}: se contradice, ` +
        "y una decisión contradictoria no se lee como aprobación.",
      "INCONSISTENT_DECISION",
    );
  }

  return { decision, reason, porProposicion };
}

/**
 * Revisa un artefacto contra las proposiciones que quedaron en duda.
 *
 * No elige el modelo ni comprueba que sea distinto del productor: eso es del enrutado
 * (`modeloDelRevisor`). Tampoco escribe nada: devuelve la decisión.
 */
export async function reviewWithModel(options: ReviewOptions): Promise<ReviewEvaluation> {
  if (options.proposiciones.length === 0) {
    throw new JudgeError(
      "Una revisión necesita al menos una proposición en duda que decidir.",
      "NO_PROPOSITIONS",
    );
  }
  const proveedor = options.provider === "" ? DEFAULT_PROVIDER : options.provider;

  let respuesta;
  try {
    respuesta = await callChat({
      provider: proveedor,
      model: options.model,
      temperature: 0,
      timeoutMs: options.timeoutMs ?? TIMEOUT_JUEZ_MS,
      effort: options.effort,
      ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      ...(options.cliRunner === undefined ? {} : { cliRunner: options.cliRunner }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      messages: [
        { role: "system", content: promptDelRevisor() },
        { role: "user", content: mensajeDelRevisor(options) },
      ],
      structured: {
        name: NOMBRE_DE_LA_FORMA,
        description: "La decisión del revisor sobre las proposiciones en duda.",
        schema: esquemaDelRevisor(),
      },
    });
  } catch (caught) {
    if (caught instanceof ChatError) {
      throw new JudgeError(caught.message, caught.code);
    }
    throw caught;
  }

  const decidido = leerDecision(respuesta.content, options.proposiciones);
  return {
    ...decidido,
    model: {
      provider: proveedor,
      model: options.model,
      resolvedVersion: respuesta.model,
    },
    usage: {
      inputTokens: respuesta.usage.inputTokens,
      outputTokens: respuesta.usage.outputTokens,
      costUsd: respuesta.usage.costUsd ?? 0,
    },
    latencyMs: respuesta.latencyMs,
  };
}
