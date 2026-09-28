/**
 * La cascada verificada como corrida, y las dos tareas que la usan.
 *
 * El patrón —un modelo barato produce, un verificador comprueba cada respuesta
 * contra el mismo estado, y solo lo no respaldado se vuelve a preguntar a un
 * modelo superior— entró con `FEATURE-ENGINE-ROLES-ENRUTAMIENTO-20260926` como
 * **evaluador de una compuerta**, y ahí quedó: `runCascade` vivía dentro de
 * `evaluators.ts` recibiendo las proposiciones, el umbral y la política de un
 * `GateDefinition`, así que sin compuerta de por medio no había corrida.
 *
 * Este archivo lo saca de ahí. Tres decisiones lo gobiernan:
 *
 * 1. **Una sola implementación del patrón.** La corrida de una compuerta y la de
 *    una tarea son la misma: `verifiedCascade` hace los tres pasos y devuelve las
 *    respuestas con sus escalamientos. La compuerta la usa con el umbral de su
 *    política; las tareas, con el que declaran. Dos copias divergen, y lo que no
 *    puede divergir es el motivo del escalamiento, que es lo que hace auditable el
 *    gasto.
 * 2. **Lo decidible en código se decide en código** (invariante 1). Cada tarea
 *    declara qué proposiciones puede refutar o confirmar sin gastar una llamada
 *    —el módulo propuesto tiene que existir en el registro; el ticket, también—, y
 *    esas no se le mandan al verificador. La verificación semántica puede
 *    **respaldar por parecido** un módulo que no existe, que es justo el error que
 *    el alta del ticket rechaza después.
 * 3. **El motivo queda escrito.** Cada escalamiento viaja con la proposición, los
 *    dos modelos, el valor que dio la verificación —o el cero del código— y la
 *    frase que lo explica, y la corrida deja su recibo en `.valmen/cascada/`. Un
 *    stdout que nadie guardó no es un recibo.
 *
 * Las dos tareas son las que nombra R-S1-002: **clasificar** una solicitud (su
 * tipo, su módulo y su riesgo) y **explorar** el registro para responder una
 * pregunta (dónde buscar, qué ticket ya habla del tema, qué módulo toca). Ninguna
 * escribe el registro ni concede permisos: devuelven una propuesta con lo que la
 * respalda, y por eso no pueden saltarse ninguna compuerta.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { EXIT_SCHEMA, RISK_LEVELS, TICKET_TYPES, fail } from "@valmen/core";
import type {
  EscalationRecord,
  Proposition,
  PropositionAnswer,
} from "@valmen/gate";
import { evaluateWithJev } from "@valmen/gate-jev";
import { evaluateWithJudge } from "@valmen/gate-llm-judge";

import { type RegistryPaths } from "./discovery.js";
import { listTickets } from "./tickets.js";

// ── El error de selección ────────────────────────────────────────────────────

/** Error de selección: no hay ninguna corrida capaz de resolver lo que se pidió. */
export class NoEvaluatorError extends Error {
  readonly code = "NO_EVALUATOR";

  constructor(message: string) {
    super(message);
    this.name = "NoEvaluatorError";
  }
}

// ── La cadena, tal como la resolvió el routing ───────────────────────────────

/** Un eslabón de la cascada, tal como lo resolvió el routing del proyecto. */
export interface CascadeStepOption {
  readonly provider: string;
  readonly model: string;
  readonly effort?: "auto" | "low" | "medium" | "high";
}

/**
 * La cadena de la cascada, resuelta por quien llama.
 *
 * `reason` viaja resuelto desde el routing —que es quien sabe si la cadena sirve—
 * para que el motor no tenga que volver a juzgarla y para que el rechazo diga lo
 * mismo en el CLI, en la pantalla y en el servidor MCP.
 */
export interface CascadeOptions {
  readonly producer: CascadeStepOption;
  readonly verifier: CascadeStepOption;
  readonly escalation: CascadeStepOption;
  /** Por debajo de esto, la respuesta del productor se vuelve a preguntar. */
  readonly threshold?: number;
  /** El motivo por el que la cadena no se puede ejecutar, o `null` si se puede. */
  readonly reason?: string | null;
}

/**
 * Comprueba que la cadena se pueda ejecutar.
 *
 * Un fallo acá es un error de configuración, no algo que se pueda degradar en
 * silencio a otro evaluador: pedir la cascada y recibir un juez de chat sin
 * decirlo sería cobrar como cascada lo que no lo es.
 */
export function exigirCadena(
  cadena: CascadeOptions | null | undefined,
): asserts cadena is CascadeOptions {
  if (cadena === undefined || cadena === null) {
    throw new NoEvaluatorError(
      "Se pidió la cascada —el evaluador `cascade` o una tarea que la corre— y no se " +
        "resolvió la cadena. El routing del proyecto tiene que declarar los roles " +
        "producer, verifier y escalation —los traen los presets incorporados—, y quien " +
        "llama tiene que pasarlos.",
    );
  }
  if (cadena.reason !== undefined && cadena.reason !== null) {
    throw new NoEvaluatorError(`La cascada no se puede ejecutar: ${cadena.reason}`);
  }
}

// ── La corrida ───────────────────────────────────────────────────────────────

/** Lo que el código puede decir de una respuesta, sin gastar una llamada. */
export interface CodeVerdict {
  readonly respaldada: boolean;
  /** Por qué, en una frase: es el motivo del escalamiento cuando refuta. */
  readonly motivo: string;
}

/** Con qué quedó verificada una respuesta. */
export interface VerificacionDeRespuesta {
  /** La probabilidad: 1 o 0 si la decidió el código. */
  readonly respaldada: number;
  /** Quién la decidió: el código o el verificador semántico. */
  readonly por: "codigo" | "verifier";
  readonly motivo: string;
}

/** Las opciones de una corrida. */
export interface CascadeRunOptions {
  readonly propositions: readonly Proposition[];
  readonly state: unknown;
  readonly chain: CascadeOptions;
  /** Por debajo de esto, la respuesta se vuelve a preguntar al modelo superior. */
  readonly threshold: number;
  /**
   * La verificación que el código puede hacer.
   *
   * Devuelve `null` cuando no puede decidir, y entonces decide el verificador
   * semántico. Lo que devuelve un veredicto **no se le manda**: es la resta que
   * hace que esta corrida gaste menos que la de la compuerta.
   */
  readonly verificarEnCodigo?: (
    proposicion: Proposition,
    respuesta: PropositionAnswer | undefined,
    estado: unknown,
  ) => CodeVerdict | null;
  readonly apiKey?: string;
  readonly sessionId?: string;
  /** Inyectables para pruebas. */
  readonly judge?: typeof evaluateWithJudge;
  readonly jev?: typeof evaluateWithJev;
}

/** Lo que devuelve una corrida, con el motivo de cada escalamiento. */
export interface CascadeRun {
  readonly answers: readonly PropositionAnswer[];
  readonly verificaciones: ReadonlyMap<string, VerificacionDeRespuesta>;
  readonly escalations: readonly EscalationRecord[];
  readonly model: {
    readonly provider: string;
    readonly model: string;
    readonly resolvedVersion: string;
  } | null;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly costUsd: number;
  };
  readonly latencyMs: number;
}

/** El identificador de la proposición con la que se verifica una respuesta. */
function verificacionId(id: string): string {
  return `respaldada_${id}`;
}

/**
 * Traduce una respuesta producida a la proposición que la verifica.
 *
 * Se pregunta por lo que el productor **respondió**, con sus palabras: verificar
 * la proposición original otra vez sería pedir la misma respuesta dos veces y
 * comparar dos opiniones, que es justo lo que la cascada no hace.
 */
function preguntaDeVerificacion(
  proposition: Proposition,
  respuesta: PropositionAnswer | undefined,
): Proposition {
  const afirmacion =
    respuesta === undefined
      ? "no respondió nada"
      : respuesta.kind === "choice"
        ? `eligió la opción «${respuesta.choice ?? ""}»`
        : respuesta.kind === "score"
          ? `eligió el nivel ${respuesta.score ?? 0}`
          : `respondió que ${(respuesta.value ?? 0) >= 0.5 ? "se cumple" : "no se cumple"}`;

  return {
    id: verificacionId(proposition.id),
    kind: "noul",
    description: `La respuesta del productor para «${proposition.id}» está respaldada por el estado`,
    instructions:
      `La respuesta que se dio a la proposición «${proposition.instructions}» —${afirmacion}— ` +
      "está respaldada por el estado. Lo que el estado no contenga, o contradiga, no la respalda.",
    criteria: {
      yes: "El estado contiene lo que la respuesta afirma.",
      no: "El estado no lo contiene, o lo contradice.",
    },
  };
}

/**
 * Los tres pasos, una sola vez.
 *
 * 1. **El productor responde** todas las proposiciones con su modelo —el barato—.
 * 2. **Se verifica cada respuesta contra el mismo estado.** Lo que el código
 *    puede decidir se decide ahí y no se manda al verificador; el resto va al rol
 *    `verifier`, que tiene que emitir probabilidades.
 * 3. **Se escala lo que no quedó respaldado**, y sólo eso: lo respaldado no se
 *    vuelve a preguntar, así que el modelo caro se paga por lo dudoso y no por el
 *    volumen.
 */
export async function verifiedCascade(options: CascadeRunOptions): Promise<CascadeRun> {
  exigirCadena(options.chain);
  const cadena = options.chain;
  const judge = options.judge ?? evaluateWithJudge;
  const verificar = options.jev ?? evaluateWithJev;
  const umbral = options.threshold;

  // Paso 1: producir.
  const produccion = await judge({
    propositions: options.propositions,
    state: options.state,
    model: cadena.producer.model,
    provider: cadena.producer.provider,
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    ...(cadena.producer.effort === undefined || cadena.producer.effort === "auto"
      ? {}
      : { effort: cadena.producer.effort }),
  });

  const producidas = new Map(produccion.answers.map((respuesta) => [respuesta.id, respuesta]));

  // Paso 2: verificar. Primero el código, y sólo lo que el código no puede
  // decidir se le pregunta al verificador.
  const verificaciones = new Map<string, VerificacionDeRespuesta>();
  const pendientes: Proposition[] = [];
  const porVerificacion = new Map<string, string>();

  for (const proposicion of options.propositions) {
    const respuesta = producidas.get(proposicion.id);
    const codigo =
      options.verificarEnCodigo?.(proposicion, respuesta, options.state) ?? null;

    if (codigo !== null) {
      verificaciones.set(proposicion.id, {
        respaldada: codigo.respaldada ? 1 : 0,
        por: "codigo",
        motivo: codigo.motivo,
      });
      continue;
    }

    pendientes.push(preguntaDeVerificacion(proposicion, respuesta));
    porVerificacion.set(verificacionId(proposicion.id), proposicion.id);
  }

  const verificacion =
    pendientes.length === 0
      ? null
      : await verificar({
          propositions: pendientes,
          state: options.state,
          model: cadena.verifier.model,
          ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
          sessionId: `${options.sessionId ?? "cascada"}:cascada`,
        });

  for (const respuesta of verificacion?.answers ?? []) {
    const id = porVerificacion.get(respuesta.id) ?? respuesta.id;
    verificaciones.set(id, {
      respaldada: respuesta.value ?? 0,
      por: "verifier",
      motivo: "",
    });
  }

  // Paso 3: escalar sólo lo que la verificación no respaldó.
  const escaladas = options.propositions.filter(
    (proposicion) => (verificaciones.get(proposicion.id)?.respaldada ?? 0) < umbral,
  );

  const escalamiento =
    escaladas.length === 0
      ? null
      : await judge({
          propositions: escaladas,
          state: options.state,
          model: cadena.escalation.model,
          provider: cadena.escalation.provider,
          ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
          ...(cadena.escalation.effort === undefined || cadena.escalation.effort === "auto"
            ? {}
            : { effort: cadena.escalation.effort }),
        });

  // La respuesta final, proposición por proposición: la del productor, salvo las
  // escaladas, que son las que respondió el escalado.
  const respuestasEscaladas = new Map(
    (escalamiento?.answers ?? []).map((respuesta) => [respuesta.id, respuesta]),
  );
  const answers = options.propositions.map((proposicion, indice) => {
    const escalada = respuestasEscaladas.get(proposicion.id);
    return escalada ?? (produccion.answers[indice] as PropositionAnswer);
  });

  /**
   * El motivo de un escalamiento, con su número.
   *
   * Cuando lo refutó el código, el motivo es el del código: decir «el verificador
   * dio 0.00» describiría una comparación de probabilidades que no ocurrió.
   */
  const motivoDe = (proposicion: Proposition): string => {
    const verificacionDe = verificaciones.get(proposicion.id);
    const valor = (verificacionDe?.respaldada ?? 0).toFixed(2);

    if (verificacionDe?.por === "codigo") {
      return (
        `el código refutó la respuesta de «${proposicion.id}» —verificado 0.00 por ` +
        `comparación con el estado, umbral ${umbral}—: ${verificacionDe.motivo}, así ` +
        `que se volvió a preguntar a ${cadena.escalation.model}`
      );
    }

    return (
      `el verificador dio ${valor} a la respuesta de «${proposicion.id}» y el umbral ` +
      `es ${umbral}: el estado no la respalda, así que se volvió a preguntar a ` +
      `${cadena.escalation.model}`
    );
  };

  const escalations: EscalationRecord[] = escaladas.map((proposicion) => ({
    role: "escalation",
    proposition: proposicion.id,
    from: { provider: cadena.producer.provider, model: cadena.producer.model },
    to: { provider: cadena.escalation.provider, model: cadena.escalation.model },
    verified: verificaciones.get(proposicion.id)?.respaldada ?? 0,
    threshold: umbral,
    reason: motivoDe(proposicion),
  }));

  // El consumo es el de los tres pasos: si se informara sólo el del último, el
  // recibo diría que la cascada cuesta lo que cuesta el escalado, que es
  // exactamente lo contrario de lo que hace.
  const usage = {
    inputTokens:
      produccion.usage.inputTokens +
      (verificacion?.usage.inputTokens ?? 0) +
      (escalamiento?.usage.inputTokens ?? 0),
    outputTokens:
      produccion.usage.outputTokens +
      (verificacion?.usage.outputTokens ?? 0) +
      (escalamiento?.usage.outputTokens ?? 0),
    costUsd:
      produccion.usage.costUsd +
      (verificacion?.usage.costUsd ?? 0) +
      (escalamiento?.usage.costUsd ?? 0),
  };

  return {
    answers,
    verificaciones,
    escalations,
    // El modelo que se informa es el que respondió lo dudoso: si algo se escaló,
    // la propuesta no la decidió el modelo barato. El detalle por proposición está
    // en `escalations`, que es donde se puede leer por qué.
    model: escalamiento?.model ?? produccion.model,
    usage,
    latencyMs:
      produccion.latencyMs +
      (verificacion?.latencyMs ?? 0) +
      (escalamiento?.latencyMs ?? 0),
  };
}

// ── Las tareas ───────────────────────────────────────────────────────────────

/** El estado que ve el productor y contra el que se verifica. */
export type CascadeState = Readonly<Record<string, unknown>>;

/** Una tarea de la cascada: sus proposiciones y lo que el código decide. */
export interface CascadeTask {
  readonly id: CascadeTaskId;
  readonly title: string;
  readonly description: string;
  /** Por debajo de esto, la respuesta se vuelve a preguntar. */
  readonly threshold: number;
  /** El estado de la corrida, armado del registro. */
  estado(paths: RegistryPaths, entrada: CascadeTaskEntrada): CascadeState;
  /** Las proposiciones, sobre ese estado. */
  proposiciones(estado: CascadeState): readonly Proposition[];
  /** La verificación que el código puede hacer, o `null` si no puede decidir. */
  verificarEnCodigo(
    proposicion: Proposition,
    respuesta: PropositionAnswer | undefined,
    estado: CascadeState,
  ): CodeVerdict | null;
}

/** La entrada de una tarea: la solicitud que se clasifica, o la pregunta. */
export interface CascadeTaskEntrada {
  readonly solicitud?: string;
  readonly pregunta?: string;
}

/** El umbral con el que se decide si una respuesta está clara. */
const UMBRAL = 0.9;

/** Una descripción corta de cada tipo, para que la opción se pueda leer. */
const TIPO_DESCRIPCION: Readonly<Record<string, string>> = {
  FEATURE: "una funcionalidad nueva que excede un ticket",
  BUGFIX: "un defecto con un síntoma observable que hay que corregir",
  IMPROVEMENT: "una mejora sobre algo que ya funciona",
  SYNC: "un cambio del camino de sincronización",
  INTEGRATION: "una integración con otro sistema",
  AGENT: "trabajo de agentes, skills o prompts",
  SECURITY: "un cambio de seguridad, permisos o credenciales",
  CHORE: "mantenimiento sin cambio de comportamiento",
  DOCS: "documentación",
};

/** Una descripción corta de cada nivel de riesgo. */
const RIESGO_DESCRIPCION: Readonly<Record<string, string>> = {
  low: "no toca nada que otro consuma",
  normal: "toca código propio, con pruebas que lo cubren",
  high: "toca un camino compartido o datos de clientes",
  critical: "toca migraciones, autenticación, sincronización o despliegue",
};

/** Los módulos que el registro ya declara, sin repetir y en orden. */
function modulosDelRegistro(paths: RegistryPaths): readonly string[] {
  const modulos = new Set<string>();
  for (const fila of listTickets(paths)) {
    const modulo = fila.module.trim();
    if (modulo !== "") modulos.add(modulo);
  }
  return [...modulos].sort();
}

/** Las opciones de una elección, con la descripción de cada una. */
function opciones(
  valores: readonly string[],
  descripcion: (valor: string) => string,
): Record<string, string> {
  return Object.fromEntries(valores.map((valor) => [valor, descripcion(valor)]));
}

/** Los tickets del registro, con lo que la exploración necesita ver. */
function ticketsDelRegistro(paths: RegistryPaths): readonly CascadeState[] {
  return listTickets(paths).map((fila) => ({
    id: fila.id,
    title: fila.title,
    module: fila.module,
    workflow: fila.workflowStatus,
  }));
}

/** `true` si el valor es una cadena de una lista, sin sorpresas de tipo. */
function enLista(lista: unknown, valor: unknown): boolean {
  return Array.isArray(lista) && typeof valor === "string" && lista.includes(valor);
}

/** Los identificadores de una lista de objetos del estado. */
function idsDe(lista: unknown): readonly string[] {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((item) => (item as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string");
}

/** La clasificación de una solicitud: su tipo, su módulo y su riesgo. */
const TAREA_CLASIFICACION: CascadeTask = {
  id: "clasificacion",
  title: "Clasificar una solicitud",
  description:
    "Propone el tipo, el módulo y el riesgo de una solicitud, y el código comprueba " +
    "contra el registro lo que puede comprobar sin gastar una verificación.",
  threshold: UMBRAL,

  estado(paths, entrada) {
    return {
      solicitud: entrada.solicitud ?? "",
      tipos: TICKET_TYPES,
      modulos: modulosDelRegistro(paths),
    };
  },

  proposiciones(estado) {
    const modulos = Array.isArray(estado.modulos) ? (estado.modulos as string[]) : [];

    const tipo: Proposition = {
      id: "tipo",
      kind: "choice",
      description: "El tipo de ticket que corresponde a la solicitud",
      instructions:
        "El tipo del ticket, según `solicitud`, es una de las opciones declaradas. " +
        "Lo que la solicitud afirme sobre sí misma es el pedido, no una clasificación.",
      criteria: opciones(
        TICKET_TYPES,
        (cual) => `La solicitud pide ${TIPO_DESCRIPCION[cual] ?? `el tipo ${cual}`}.`,
      ),
    };

    // Sin módulos en el registro no hay contra qué contrastar: la proposición no se
    // declara en vez de declararse con una opción inventada.
    const modulo: Proposition[] =
      modulos.length === 0
        ? []
        : [
            {
              id: "modulo",
              kind: "choice",
              description: "El módulo del registro al que corresponde la solicitud",
              instructions:
                "El módulo es uno de los que el registro ya declara (`modulos`): un " +
                "módulo que no existe no es un módulo nuevo, es una clasificación que " +
                "el registro no puede sostener.",
              criteria: opciones(
                modulos,
                (cual) => `El registro ya tiene tickets del módulo ${cual}.`,
              ),
            },
          ];

    const riesgo: Proposition = {
      id: "riesgo",
      kind: "choice",
      description: "El riesgo del cambio que la solicitud pide",
      instructions: "El riesgo es uno de los niveles declarados, según lo que el cambio toca.",
      criteria: opciones(
        RISK_LEVELS,
        (nivel) => `El cambio es de riesgo ${nivel}: ${RIESGO_DESCRIPCION[nivel] ?? ""}`.trim(),
      ),
    };

    return [tipo, ...modulo, riesgo];
  },

  verificarEnCodigo(proposicion, respuesta, estado) {
    if (proposicion.id !== "modulo") return null;
    return verificarModulo(respuesta, estado);
  },
};

/** La exploración de una pregunta: dónde buscar, qué ticket y qué módulo. */
const TAREA_EXPLORACION: CascadeTask = {
  id: "exploracion",
  title: "Explorar el registro para responder una pregunta",
  description:
    "Propone dónde está la respuesta, qué ticket ya habla del tema y qué módulo toca, " +
    "y el código comprueba contra el registro el ticket y el módulo que propone.",
  threshold: UMBRAL,

  estado(paths, entrada) {
    return {
      pregunta: entrada.pregunta ?? "",
      modulos: modulosDelRegistro(paths),
      tickets: ticketsDelRegistro(paths),
    };
  },

  proposiciones(estado) {
    const modulos = Array.isArray(estado.modulos) ? (estado.modulos as string[]) : [];
    const ids = idsDe(estado.tickets);

    const dondeBuscar: Proposition = {
      id: "donde_buscar",
      kind: "choice",
      description: "Dónde está la respuesta a la pregunta",
      instructions:
        "La respuesta a `pregunta` está donde el estado la puede sostener: en el " +
        "código del proyecto, en los tickets del registro, en cómo trabaja el " +
        "harness o en lo que el proyecto ya aprendió.",
      criteria: {
        codigo: "La respuesta está en el código que la pregunta menciona.",
        registro: "La respuesta está en los tickets o en su índice.",
        proceso: "La respuesta está en cómo trabaja el harness, no en el producto.",
        memoria: "La respuesta está en lo que el proyecto ya aprendió y guardó.",
      },
    };

    const ticketRelacionado: Proposition = {
      id: "ticket_relacionado",
      kind: "choice",
      description: "El ticket del registro que ya habla del tema",
      instructions:
        "El ticket que `pregunta` menciona es uno de los que el registro declara " +
        "(`tickets`), o `ninguno` si el tema no tiene ticket.",
      criteria: {
        ...opciones(ids, (id) => `El registro declara el ticket ${id}.`),
        ninguno: "Ningún ticket del registro trata el tema.",
      },
    };

    const moduloAfectado: Proposition = {
      id: "modulo_afectado",
      kind: "choice",
      description: "El módulo del registro que el tema afecta",
      instructions:
        "El módulo que el tema afecta es uno de los que el registro declara " +
        "(`modulos`), o `ninguno` si el tema no toca ningún módulo.",
      criteria: {
        ...opciones(modulos, (cual) => `El registro declara el módulo ${cual}.`),
        ninguno: "Ningún módulo del registro trata el tema.",
      },
    };

    return [dondeBuscar, ticketRelacionado, moduloAfectado];
  },

  verificarEnCodigo(proposicion, respuesta, estado) {
    if (proposicion.id === "ticket_relacionado") {
      const elegido = respuesta?.choice ?? "";
      if (elegido === "" || elegido === "ninguno") {
        return {
          respaldada: true,
          motivo: "no se propuso ningún ticket, y el registro no tiene por qué tener uno",
        };
      }
      const ids = idsDe(estado.tickets);
      if (ids.includes(elegido)) {
        return { respaldada: true, motivo: `el registro declara el ticket «${elegido}»` };
      }
      return {
        respaldada: false,
        motivo:
          `el ticket «${elegido}» no está entre los ${ids.length} que el registro ` +
          "declara",
      };
    }

    if (proposicion.id === "modulo_afectado") return verificarModulo(respuesta, estado);
    return null;
  },
};

/** La verificación en código de un módulo propuesto contra el registro. */
function verificarModulo(
  respuesta: PropositionAnswer | undefined,
  estado: CascadeState,
): CodeVerdict {
  const elegido = respuesta?.choice ?? "";
  const modulos = Array.isArray(estado.modulos) ? (estado.modulos as string[]) : [];

  if (enLista(modulos, elegido)) {
    return { respaldada: true, motivo: `el registro declara el módulo «${elegido}»` };
  }
  return {
    respaldada: false,
    motivo:
      `el módulo «${elegido}» no está entre los ${modulos.length} que el registro ` +
      `declara (${modulos.join(", ")})`,
  };
}

/** Las tareas declaradas, en el orden en que se listan. */
export const CASCADE_TASKS: readonly CascadeTask[] = [TAREA_CLASIFICACION, TAREA_EXPLORACION];

/**
 * Los identificadores de las tareas.
 *
 * Existe para que los bordes —el CLI y el servidor MCP— no mantengan cada uno su
 * lista escrita a mano: dos listas que crecen por separado es cómo una tarea queda
 * admitida en un sitio y rechazada en el otro según por dónde se pidió.
 */
export const CASCADE_TASK_IDS = ["clasificacion", "exploracion"] as const;

export type CascadeTaskId = (typeof CASCADE_TASK_IDS)[number];

/** `true` si el valor es una tarea declarada. */
export function isCascadeTaskId(value: unknown): value is CascadeTaskId {
  return typeof value === "string" && (CASCADE_TASK_IDS as readonly string[]).includes(value);
}

/** La tarea pedida, o un fallo que nombra las declaradas. */
export function cascadeTask(id: CascadeTaskId): CascadeTask {
  const tarea = CASCADE_TASKS.find((una) => una.id === id);
  if (tarea === undefined) {
    fail(
      `Tarea de cascada desconocida: "${String(id)}". Use ${CASCADE_TASK_IDS.join(", ")}.`,
      EXIT_SCHEMA,
    );
  }
  return tarea;
}

// ── La corrida de una tarea y su recibo ──────────────────────────────────────

/** El directorio donde quedan los recibos de las corridas. */
export const CASCADA_DIR = ".valmen/cascada";

/** Lo que hace falta para correr una tarea. */
export interface CascadeTaskRequest {
  readonly paths: RegistryPaths;
  readonly task: CascadeTaskId;
  readonly entrada: CascadeTaskEntrada;
  /** La cadena, resuelta por el routing del proyecto. */
  readonly chain: CascadeOptions;
  readonly apiKey?: string;
  readonly sessionId?: string;
  readonly judge?: typeof evaluateWithJudge;
  readonly jev?: typeof evaluateWithJev;
  /** Inyectable para pruebas: fija el nombre del recibo. */
  readonly now?: () => Date;
}

/** El resultado de una corrida de tarea, con la ruta de su recibo. */
export interface CascadeTaskOutcome extends CascadeRun {
  readonly task: CascadeTaskId;
  readonly title: string;
  readonly description: string;
  readonly estado: CascadeState;
  /** La ruta del recibo, relativa a la raíz. */
  readonly recibo: string;
}

/** El instante, en la forma que usa el nombre del recibo. */
function marca(ahora: Date): string {
  return ahora.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
}

/**
 * Escribe el recibo de la corrida.
 *
 * Un archivo por corrida y no uno que se reescribe: el recibo es la evidencia de
 * en qué se gastó, y un bloque append-only no se edita (invariante 4). El nombre
 * lleva la marca y la tarea para que dos corridas del mismo día no se pisen.
 */
function escribirRecibo(
  paths: RegistryPaths,
  tarea: CascadeTask,
  estado: CascadeState,
  corrida: CascadeRun,
  ahora: Date,
): string {
  const relativa = `${CASCADA_DIR}/${marca(ahora)}-${tarea.id}.json`;
  mkdirSync(join(paths.root, CASCADA_DIR), { recursive: true });
  writeFileSync(
    join(paths.root, relativa),
    `${JSON.stringify(
      {
        kind: "cascade-run",
        task: tarea.id,
        title: tarea.title,
        at: ahora.toISOString(),
        threshold: tarea.threshold,
        state: estado,
        answers: corrida.answers,
        verificaciones: Object.fromEntries(corrida.verificaciones),
        escalations: corrida.escalations,
        model: corrida.model,
        usage: corrida.usage,
        latencyMs: corrida.latencyMs,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return relativa;
}

/**
 * Corre una tarea de la cascada.
 *
 * No escribe el registro ni concede permisos: devuelve la propuesta con lo que la
 * respalda —y lo que se escaló, con su motivo— y deja su recibo en
 * `.valmen/cascada/`.
 */
export async function runCascadeTask(
  request: CascadeTaskRequest,
): Promise<CascadeTaskOutcome> {
  const tarea = cascadeTask(request.task);
  const estado = tarea.estado(request.paths, request.entrada);

  const corrida = await verifiedCascade({
    propositions: tarea.proposiciones(estado),
    state: estado,
    chain: request.chain,
    threshold: tarea.threshold,
    verificarEnCodigo: (proposicion, respuesta, visto) =>
      tarea.verificarEnCodigo(proposicion, respuesta, visto as CascadeState),
    ...(request.apiKey === undefined ? {} : { apiKey: request.apiKey }),
    sessionId: `cascada:${tarea.id}`,
    ...(request.judge === undefined ? {} : { judge: request.judge }),
    ...(request.jev === undefined ? {} : { jev: request.jev }),
  });

  const ahora = request.now?.() ?? new Date();
  const recibo = escribirRecibo(request.paths, tarea, estado, corrida, ahora);

  return {
    ...corrida,
    task: tarea.id,
    title: tarea.title,
    description: tarea.description,
    estado,
    recibo,
  };
}

/** La respuesta de una proposición, como se lee en la salida. */
function respuestaEnTexto(respuesta: PropositionAnswer | undefined): string {
  if (respuesta === undefined) return "sin respuesta";
  if (respuesta.kind === "choice") return respuesta.choice ?? "sin elección";
  if (respuesta.kind === "score") return `nivel ${respuesta.score ?? 0}`;
  return (respuesta.value ?? 0) >= 0.5 ? "se cumple" : "no se cumple";
}

/**
 * El informe de una corrida, tal como lo imprime el CLI.
 *
 * Dice las tres cosas que hacen falta para auditar el gasto: la propuesta, con qué
 * quedó verificada cada respuesta, y qué se escaló y por qué.
 */
export function renderCascadeTask(outcome: CascadeTaskOutcome): string {
  const lineas: string[] = [
    `Cascada verificada — ${outcome.title}`,
    `  ${outcome.description}`,
    "",
    "  Propuesta (rol producer)",
  ];

  for (const respuesta of outcome.answers) {
    lineas.push(`    ·  ${respuesta.id}=${respuestaEnTexto(respuesta)}`);
  }

  lineas.push("", "  Verificación");
  for (const [id, verificacion] of outcome.verificaciones) {
    const como =
      verificacion.por === "codigo"
        ? `por el código: ${verificacion.motivo}`
        : `por el verificador: ${verificacion.respaldada.toFixed(2)}`;
    lineas.push(
      `    ${verificacion.respaldada >= 0.9 ? "✓" : "⚠"}  ${id}  ${como}`,
    );
  }

  if (outcome.escalations.length === 0) {
    lineas.push("", "  El modelo superior no se llamó: la verificación respaldó todo.");
  } else {
    lineas.push("", "  Escalamiento (cascada verificada)");
    for (const escalamiento of outcome.escalations) {
      lineas.push(
        `    ⤴  ${escalamiento.proposition}     verificado ` +
          `${escalamiento.verified.toFixed(2)} < ${escalamiento.threshold}  → ` +
          escalamiento.to.model,
      );
      lineas.push(`         ${escalamiento.reason}`);
    }
  }

  lineas.push(
    "",
    `  Recibo: ${outcome.recibo}`,
    `  Coste:  $${outcome.usage.costUsd.toFixed(6)}   Latencia: ${outcome.latencyMs} ms`,
  );
  return `${lineas.join("\n")}\n`;
}
