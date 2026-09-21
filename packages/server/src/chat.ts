/**
 * El chat de configuración.
 *
 * Es el único sitio de Mission Control donde se le pide algo a un modelo, y la
 * regla que lo gobierna es una sola:
 *
 * > **El modelo propone, el humano dispone.**
 *
 * El modelo no escribe configuración: devuelve textos candidatos. El código hace
 * todo lo demás, y lo hace porque es código:
 *
 * - **Valida cada propuesta con el parser real.** Una propuesta que no parsea se
 *   muestra como inválida y no se puede aplicar. Un modelo puede inventar una
 *   clave que no existe; el parser no se lo cree.
 * - **Calcula el diff.** El modelo no describe sus cambios: los hace, y el diff
 *   se calcula comparando textos. Una descripción puede ser convincente y falsa.
 * - **Decide qué es sensible.** No se le pregunta al modelo qué cambio es
 *   peligroso: se compara el antes y el después. Cambiar el evaluador de gates,
 *   por ejemplo, es sensible porque hace que el gate deje de ser reproducible, y
 *   eso lo detecta el código comparando la resolución del rol.
 *
 * Un cambio sensible exige una segunda confirmación escrita, además de haber
 * aprobado el diff. Es la regla 2 de docs/06-CONTROL-APP.md §3.1, y existe porque
 * un agente que amplía su propia autoridad con un clic es un agente que la
 * amplía por accidente.
 *
 * La regla 3 —todo cambio de configuración es un ticket `CHORE` con su recibo—
 * llega con la escritura de tickets, que todavía no existe. Hasta entonces, el
 * cambio queda en el diff y en la respuesta del modelo, y la pantalla lo dice.
 */
import { basename } from "node:path";

import {
  type Routing,
  EFFORTS,
  ROLES,
  parseRouting,
  resolveRouting,
} from "@valmen/adapter";
import { CredentialError, resolveApiKey } from "@valmen/credentials";

import {
  type ConfigDiffLine,
  checkConfig,
  configPath,
  diffLines,
  readConfigText,
  writeConfig,
} from "./config.js";
import {
  checkRouting,
  readRoutingText,
  routingPath,
  writeRouting,
} from "./routing.js";

/** Endpoint de chat de OpenRouter. */
const CHAT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** Tiempo máximo de una propuesta. */
const DEFAULT_TIMEOUT_MS = 60_000;

/** Modelo con salida estructurada estricta y coste bajo. */
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

/** Error del chat de configuración. */
export class ConfigChatError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ConfigChatError";
    this.code = code;
  }
}

/** Un archivo que el chat puede proponer cambiar. */
export type EditableFile = "config" | "routing";

/** La etiqueta legible de un archivo editable. */
const ETIQUETA: Record<EditableFile, string> = {
  config: ".valmen/config.yaml",
  routing: ".valmen/routing.yaml",
};

/** Un cambio propuesto, ya validado y con su diff. */
export interface ChatChange {
  readonly file: EditableFile;
  readonly label: string;
  /** El texto propuesto, completo. */
  readonly text: string;
  /** Por qué el modelo propone el cambio. Es una explicación, no una prueba. */
  readonly reason: string;
  /** `true` si el texto parsea con el parser real. */
  readonly ok: boolean;
  readonly error: string;
  readonly diff: readonly ConfigDiffLine[];
  /** `true` si el texto es idéntico al que ya está guardado. */
  readonly unchanged: boolean;
  /** `true` si el cambio amplía la autoridad automática del sistema. */
  readonly sensitive: boolean;
  readonly sensitiveReason: string;
  /** La frase exacta que hay que escribir para confirmarlo. */
  readonly confirmation: string;
}

/** La respuesta del chat: una propuesta, nunca una escritura. */
export interface ChatProposal {
  readonly ok: boolean;
  readonly error: string;
  /** Qué entendió el modelo del pedido, en una línea. */
  readonly summary: string;
  readonly changes: readonly ChatChange[];
  readonly model: string;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly costUsd: number;
  } | null;
  readonly latencyMs: number;
}

/** Frases de confirmación por tipo de cambio sensible. */
const CONFIRMACION = {
  evaluador: "CONFIRMO CAMBIAR EL EVALUADOR DE GATES",
  gate: "CONFIRMO CAMBIAR EL MODO DE UN GATE",
  presupuesto: "CONFIRMO CAMBIAR EL PRESUPUESTO",
} as const;

/**
 * Decide si un cambio es sensible comparando el antes y el después.
 *
 * No se le pregunta al modelo: un modelo al que se le pide clasificar su propio
 * cambio como peligroso tiene un incentivo estructural a decir que no.
 */
function sensibilidad(
  file: EditableFile,
  antes: string,
  despues: string,
  root: string,
): { sensitive: boolean; reason: string; confirmation: string } {
  const nada = { sensitive: false, reason: "", confirmation: "" };

  if (file === "routing") {
    let antesRouting: Routing;
    let despuesRouting: Routing;
    try {
      antesRouting = antes.trim() === "" ? { preset: "balanced", roles: {} } : parseRouting(antes);
      despuesRouting = parseRouting(despues);
    } catch {
      return nada;
    }

    const antesRutas = resolveRouting(antesRouting);
    const despuesRutas = resolveRouting(despuesRouting);

    const evaluadorAntes = antesRutas.find((ruta) => ruta.role === "gate-evaluator");
    const evaluadorDespues = despuesRutas.find((ruta) => ruta.role === "gate-evaluator");

    if (evaluadorAntes?.model !== evaluadorDespues?.model) {
      return {
        sensitive: true,
        reason:
          `El evaluador de gates pasa de \`${evaluadorAntes?.model}\` a \`${evaluadorDespues?.model}\`` +
          (evaluadorDespues?.probabilistic === false
            ? ", que no emite probabilidades calibradas: el gate deja de ser reproducible."
            : "."),
        confirmation: CONFIRMACION.evaluador,
      };
    }

    // Un cambio de preset mueve los trece roles a la vez, incluido el coste.
    if (antesRouting.preset !== despuesRouting.preset) {
      return {
        sensitive: true,
        reason: `El preset pasa de \`${antesRouting.preset}\` a \`${despuesRouting.preset}\`: cambia el modelo de todos los roles.`,
        confirmation: CONFIRMACION.presupuesto,
      };
    }

    return nada;
  }

  // La configuración no tiene gates todavía, pero sí presupuestos y modos en
  // cuanto existan: se compara por claves para no depender de que hoy no estén.
  const clavesSensibles = ["budgets", "budget", "gates"];
  for (const clave of clavesSensibles) {
    const antesTiene = new RegExp(`^\\s*${clave}:`, "m").test(antes);
    const despuesTiene = new RegExp(`^\\s*${clave}:`, "m").test(despues);
    if (!antesTiene && !despuesTiene) continue;
    const antesValor = new RegExp(`^\\s*${clave}:.*$`, "gm").exec(antes)?.[0] ?? "";
    const despuesValor = new RegExp(`^\\s*${clave}:.*$`, "gm").exec(despues)?.[0] ?? "";
    if (antesValor === despuesValor) continue;
    return {
      sensitive: true,
      reason: `Cambia \`${clave}\`, que es una decisión de autoridad o de gasto, no de forma.`,
      confirmation:
        clave === "gates" ? CONFIRMACION.gate : CONFIRMACION.presupuesto,
    };
  }
  void root;
  return nada;
}

/** El esquema de salida. Estricto: una propuesta es texto completo, no un parche. */
const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string", enum: ["config", "routing"] },
          text: { type: "string" },
          reason: { type: "string" },
        },
        required: ["file", "text", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "changes"],
  additionalProperties: false,
} as const;

/** El prompt del sistema, con el estado real de los dos archivos. */
function systemPrompt(root: string): string {
  const config = readConfigText(root);
  const routing = readRoutingText(root);

  return [
    "Eres el configurador del harness ValmenHarness en este proyecto.",
    "",
    "Devuelves el **texto completo** de los archivos que haya que cambiar, no parches.",
    "Solo puedes tocar dos archivos, y solo estos dos:",
    "",
    "1. `.valmen/config.yaml` — YAML de un subconjunto estricto: escalares, listas de",
    "   bloque (`- elemento`), mapas por indentación de espacios, `[]` y `{}` para vacío.",
    "   NO se admiten colecciones en línea como `[a, b]`. Claves en minúsculas con guiones.",
    "2. `.valmen/routing.yaml` — mismo subconjunto. Forma:",
    "   `preset: quality|balanced|economy` y, opcionalmente, un mapa `roles:` con",
    "   `model:` y `effort: auto|low|medium|high` por rol.",
    "",
    "Los roles son: " + ROLES.map((rol) => rol.id).join(", ") + ".",
    "",
    `Presets disponibles: quality, balanced, economy. Esfuerzos: ${EFFORTS.join(", ")}.`,
    "",
    "Reglas duras:",
    "- Si no hace falta cambiar un archivo, no lo incluyas en `changes`.",
    "- Conserva los comentarios existentes: son parte del archivo.",
    "- No inventes claves nuevas: el parser rechaza lo que no conoce y la propuesta",
    "  aparecerá como inválida.",
    "- El rol `gate-evaluator` usa `typesafe/jev-1.13` por defecto porque emite",
    "  probabilidades calibradas. Cambiarlo es posible y la aplicación pedirá una",
    "  confirmación escrita aparte.",
    "",
    "--- Estado actual de `.valmen/config.yaml` ---",
    config.trim() === "" ? "(no existe)" : config,
    "",
    "--- Estado actual de `.valmen/routing.yaml` ---",
    routing.trim() === "" ? "(no existe: se usa el preset balanced)" : routing,
    "",
    `La raíz del proyecto es ${basename(root)}.`,
  ].join("\n");
}

/** Opciones de una propuesta. */
export interface ProposeOptions {
  readonly message: string;
  /** Modelo del rol `orchestrator`, resuelto por el routing. */
  readonly model?: string;
  readonly effort?: "auto" | "low" | "medium" | "high";
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  /** Inyectable para las pruebas. */
  readonly propose?: typeof proposeConfigChange;
}

/** Extrae el texto de una respuesta de chat con salida estructurada. */
function readContent(payload: unknown): { content: string; usage: ChatProposal["usage"] } {
  const data = payload as {
    choices?: readonly { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };
  const contenido = data.choices?.[0]?.message?.content;
  if (typeof contenido !== "string" || contenido.trim() === "") {
    throw new ConfigChatError(
      "El modelo no devolvió ninguna propuesta.",
      "EMPTY",
    );
  }
  return {
    content: contenido,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      costUsd: data.usage?.cost ?? 0,
    },
  };
}

/**
 * Pide una propuesta de cambio.
 *
 * No escribe nada. Devuelve los textos candidatos con su diff, su validez y si
 * el código considera que el cambio es sensible.
 */
export async function proposeConfigChange(
  root: string,
  options: ProposeOptions,
): Promise<ChatProposal> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model ?? DEFAULT_MODEL;

  let apiKey = options.apiKey;
  if (apiKey === undefined) {
    try {
      apiKey = resolveApiKey("openrouter");
    } catch (caught) {
      if (caught instanceof CredentialError) {
        throw new ConfigChatError(caught.message, "CREDENTIAL_MISSING");
      }
      throw caught;
    }
  }

  const started = Date.now();
  let response: Response;
  try {
    response = await fetchImpl(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        // Una propuesta de configuración es un texto corto: no necesita
        // razonamiento largo, y con el esfuerzo por defecto un modelo que razona
        // puede tardar más que el límite entero.
        ...(options.effort === undefined || options.effort === "auto"
          ? { reasoning: { effort: "low" } }
          : { reasoning: { effort: options.effort } }),
        messages: [
          { role: "system", content: systemPrompt(root) },
          { role: "user", content: options.message },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "config_proposal", strict: true, schema: SCHEMA },
        },
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      }),
    });
  } catch (caught) {
    const detalle = caught instanceof Error ? caught.message : String(caught);
    const esTimeout = /abort|timeout/i.test(detalle);
    throw new ConfigChatError(
      esTimeout
        ? `El configurador superó el tiempo máximo de ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms.`
        : `Fallo de transporte: ${detalle}`,
      esTimeout ? "TIMEOUT" : "TRANSPORT",
    );
  }

  let texto: string;
  try {
    texto = await response.text();
  } catch (caught) {
    throw new ConfigChatError(
      `Fallo al leer la respuesta: ${caught instanceof Error ? caught.message : String(caught)}`,
      "TRANSPORT",
    );
  }
  const latencyMs = Date.now() - started;

  if (!response.ok) {
    throw new ConfigChatError(
      `El configurador respondió HTTP ${response.status}: ${texto.slice(0, 300)}`,
      response.status === 401 || response.status === 403 ? "AUTH" : "HTTP",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(texto) as unknown;
  } catch {
    throw new ConfigChatError("La respuesta no es JSON.", "MALFORMED");
  }

  const { content, usage } = readContent(payload);

  let propuesta: { summary?: unknown; changes?: unknown };
  try {
    propuesta = JSON.parse(content) as { summary?: unknown; changes?: unknown };
  } catch {
    throw new ConfigChatError(
      "La propuesta del modelo no es JSON válido.",
      "MALFORMED",
    );
  }

  return {
    ok: true,
    error: "",
    summary: typeof propuesta.summary === "string" ? propuesta.summary : "",
    changes: normalizar(root, propuesta.changes),
    model,
    usage,
    latencyMs,
  };
}

/**
 * Valida y clasifica lo que propuso el modelo.
 *
 * Todo lo que el modelo afirma se recalcula: si dice que un archivo cambia, el
 * diff lo demuestra; si el texto no parsea, la propuesta queda inválida y no se
 * puede aplicar.
 */
function normalizar(root: string, changes: unknown): ChatChange[] {
  if (!Array.isArray(changes)) return [];

  const salida: ChatChange[] = [];
  for (const crudo of changes) {
    const item = crudo as { file?: unknown; text?: unknown; reason?: unknown };
    if (item.file !== "config" && item.file !== "routing") continue;
    if (typeof item.text !== "string") continue;

    const file = item.file;
    const antes = file === "config" ? readConfigText(root) : readRoutingText(root);
    const estado =
      file === "config"
        ? checkConfig(root, item.text)
        : checkRouting(root, item.text);

    const sens = sensibilidad(file, antes, item.text, root);

    salida.push({
      file,
      label: ETIQUETA[file],
      text: item.text,
      reason: typeof item.reason === "string" ? item.reason : "",
      ok: estado.ok,
      error: estado.error,
      diff: estado.diff,
      unchanged: item.text === antes,
      sensitive: sens.sensitive,
      sensitiveReason: sens.reason,
      confirmation: sens.confirmation,
    });
  }
  return salida;
}

/** Un cambio que el usuario aprobó y quiere aplicar. */
export interface ApplyRequest {
  readonly file: EditableFile;
  readonly text: string;
  /** La frase escrita por el usuario, si el cambio es sensible. */
  readonly confirm?: string;
}

/** El resultado de aplicar cambios. */
export interface ApplyOutcome {
  readonly ok: boolean;
  readonly error: string;
  readonly written: readonly string[];
  /** Los cambios que quedaron pendientes de confirmación. */
  readonly pending: readonly {
    readonly file: EditableFile;
    readonly reason: string;
    readonly confirmation: string;
  }[];
}

/**
 * Aplica los cambios aprobados.
 *
 * Se vuelve a validar cada texto y se vuelve a comprobar la sensibilidad: entre
 * la propuesta y el clic puede haber pasado tiempo, y el estado de referencia
 * puede ser otro. La confirmación se comprueba contra la frase exacta, no contra
 * un booleano: un `confirm: true` es un clic, y un clic no es una decisión
 * deliberada.
 */
export function applyChanges(root: string, cambios: readonly ApplyRequest[]): ApplyOutcome {
  const pendientes: {
    file: EditableFile;
    reason: string;
    confirmation: string;
  }[] = [];
  const preparados: { file: EditableFile; text: string }[] = [];

  for (const cambio of cambios) {
    const antes = cambio.file === "config" ? readConfigText(root) : readRoutingText(root);
    const estado =
      cambio.file === "config"
        ? checkConfig(root, cambio.text)
        : checkRouting(root, cambio.text);

    if (!estado.ok) {
      return {
        ok: false,
        error: `${ETIQUETA[cambio.file]}: ${estado.error}`,
        written: [],
        pending: [],
      };
    }
    if (cambio.text === antes) continue;

    const sens = sensibilidad(cambio.file, antes, cambio.text, root);
    if (sens.sensitive && cambio.confirm !== sens.confirmation) {
      pendientes.push({
        file: cambio.file,
        reason: sens.reason,
        confirmation: sens.confirmation,
      });
      continue;
    }

    preparados.push({ file: cambio.file, text: cambio.text });
  }

  const escritos: string[] = [];
  for (const cambio of preparados) {
    const resultado =
      cambio.file === "config"
        ? writeConfig(root, cambio.text)
        : writeRouting(root, cambio.text);
    if (!resultado.written) {
      return {
        ok: false,
        error: `${ETIQUETA[cambio.file]}: ${resultado.error}`,
        written: escritos,
        pending: pendientes,
      };
    }
    escritos.push(ETIQUETA[cambio.file]);
  }

  return {
    ok: pendientes.length === 0,
    error:
      pendientes.length === 0
        ? ""
        : "Hay cambios que necesitan una confirmación escrita y no se aplicaron.",
    written: escritos,
    pending: pendientes,
  };
}

export { configPath, diffLines, routingPath };
