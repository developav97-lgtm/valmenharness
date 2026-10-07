/**
 * Lectura de `.valmen/config.yaml`.
 *
 * El parser es deliberadamente pequeño y estricto: admite un subconjunto de
 * YAML —comentarios, escalares, listas de bloques y mapas anidados por
 * indentación— y **falla de forma ruidosa** ante cualquier otra construcción.
 *
 * La razón es la misma que la del frontmatter de los tickets: un archivo de
 * configuración que se interpreta "casi bien" produce un comportamiento sutil y
 * equivocado. Es preferible que el harness no arranque a que arranque con una
 * configuración distinta de la que el usuario escribió.
 */
import {
  PROJECT_ID_RE,
  RISK_LEVELS,
  TICKET_TYPES,
  type YamlValue,
  fail,
  parseYamlSubset,
} from "@valmen/core";

/** Valor admitido en la configuración. */
export type ConfigValue = YamlValue;

/** Mapa anidado de configuración. */
export interface ConfigMap {
  readonly [key: string]: ConfigValue;
}

/**
 * Analiza el contenido de un `config.yaml`.
 *
 * El parser vive en `core` porque `tickets.yaml` y los procesos necesitan el
 * mismo subconjunto estricto, y la alternativa era un parser por documento. Lo
 * único propio de `config.yaml` son las dos restricciones que se le pasan: las
 * claves son minúsculas sin guiones bajos, y la raíz tiene que ser un mapa.
 */
export function parseConfig(text: string): ConfigMap {
  const value = parseYamlSubset(text, {
    fileName: "config.yaml",
    key: /^[a-z][a-z0-9-]*$/,
    keyMessage: "no es válida (minúsculas, dígitos y guiones).",
  });
  if (typeof value === "string" || Array.isArray(value)) {
    fail("config.yaml debe tener un mapa en la raíz.");
  }
  if (value["machine-bindings"] !== undefined) {
    fail(
      'config.yaml: "machine-bindings" pertenece a ~/.valmen/bindings.local.yaml y no se versiona con la política del proyecto.',
    );
  }
  if (value["managed-execution-capacity"] !== undefined) {
    fail(
      'config.yaml: "managed-execution-capacity" pertenece a ~/.valmen/bindings.local.yaml y no se versiona con la política del proyecto.',
    );
  }
  return value;
}

/** Lee un valor de texto de la configuración, o el valor por defecto. */
export function readString(config: ConfigMap, key: string, fallback: string): string {
  const value = config[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string") {
    fail(`config.yaml: "${key}" debe ser un texto.`);
  }
  return value === "" ? fallback : value;
}

/** Lee una lista de textos de la configuración, o la lista por defecto. */
export function readList(
  config: ConfigMap,
  key: string,
  fallback: readonly string[],
): string[] {
  const value = config[key];
  if (value === undefined) return [...fallback];
  if (typeof value === "string") return value === "" ? [] : [value];
  if (!Array.isArray(value)) {
    fail(`config.yaml: "${key}" debe ser una lista de textos.`);
  }
  // Cada elemento tiene que ser un texto. Antes no hacía falta comprobarlo
  // porque el tipo no admitía otra cosa; ahora `YamlValue` sí, y una lista con un
  // mapa dentro es un error que conviene decir en vez de propagar.
  if (!value.every((elemento): elemento is string => typeof elemento === "string")) {
    fail(`config.yaml: "${key}" debe ser una lista de textos.`);
  }
  return value;
}

/** Lee un submapa de la configuración. */
export function readMap(config: ConfigMap, key: string): ConfigMap {
  const value = config[key];
  if (value === undefined) return {};
  if (typeof value === "string" || Array.isArray(value)) {
    fail(`config.yaml: "${key}" debe ser un mapa.`);
  }
  return value;
}

/** Etapas semánticas que pueden recibir preguntas adicionales de Jev. */
export const JEV_STAGES = ["analysis", "plan", "integration"] as const;

/** Una etapa a la que un proyecto puede añadir validación semántica. */
export type JevStage = (typeof JEV_STAGES)[number];

/**
 * Pregunta adicional declarada por el proyecto.
 *
 * La configuración solo describe la pregunta y sus límites; no declara efectos
 * ni modos de gate. Así, añadirla puede sumar una condición o contexto, pero no
 * reemplazar lo que ya decide la compuerta ni promoverla a automática.
 */
export interface JevPropositionConfig {
  readonly id: string;
  readonly description: string;
  readonly instructions: string;
  readonly criteria: Readonly<{ yes: string; no: string }>;
  readonly weight: number;
  readonly approveAt: number;
  readonly blockAt: number;
  readonly verdict: "required" | "inform";
}

/** Las preguntas adicionales, agrupadas por etapa y siempre completas. */
export type JevPropositions = Readonly<
  Record<JevStage, readonly JevPropositionConfig[]>
>;

const JEV_PROPOSITION_ID_RE = /^custom-[a-z][a-z0-9-]{0,62}$/;

function jevMap(value: ConfigValue | undefined, path: string): ConfigMap {
  if (value === undefined || typeof value === "string" || Array.isArray(value)) {
    fail(`config.yaml: "${path}" debe ser un mapa.`);
  }
  return value;
}

function jevText(map: ConfigMap, key: string, path: string): string {
  const value = map[key];
  if (typeof value !== "string") {
    fail(`config.yaml: "${path}.${key}" debe ser un texto.`);
  }
  if (value.trim() === "") {
    fail(`config.yaml: "${path}.${key}" no puede estar vacío.`);
  }
  return value;
}

function jevNumber(map: ConfigMap, key: string, path: string): number {
  const value = Number(jevText(map, key, path));
  if (!Number.isFinite(value)) {
    fail(`config.yaml: "${path}.${key}" debe ser un número.`);
  }
  return value;
}

function jevProposition(value: ConfigValue, path: string): JevPropositionConfig {
  const item = jevMap(value, path);
  const allowed = new Set([
    "id",
    "description",
    "instructions",
    "criteria",
    "weight",
    "approve-at",
    "block-at",
    "verdict",
  ]);
  for (const key of Object.keys(item)) {
    if (!allowed.has(key)) fail(`config.yaml: "${path}.${key}" no es una clave válida.`);
  }

  const id = jevText(item, "id", path);
  if (!JEV_PROPOSITION_ID_RE.test(id)) {
    fail(
      `config.yaml: "${path}.id" debe usar el prefijo reservado custom- y minúsculas.`,
    );
  }

  const criteria = jevMap(item["criteria"], `${path}.criteria`);
  for (const key of Object.keys(criteria)) {
    if (key !== "yes" && key !== "no") {
      fail(`config.yaml: "${path}.criteria.${key}" no es una clave válida.`);
    }
  }

  const weight = jevNumber(item, "weight", path);
  if (weight <= 0) fail(`config.yaml: "${path}.weight" debe ser positivo.`);

  const approveAt = jevNumber(item, "approve-at", path);
  const blockAt = jevNumber(item, "block-at", path);
  if (approveAt < 0 || approveAt > 1) {
    fail(`config.yaml: "${path}.approve-at" debe estar entre 0 y 1.`);
  }
  if (blockAt < 0 || blockAt > 1) {
    fail(`config.yaml: "${path}.block-at" debe estar entre 0 y 1.`);
  }
  if (blockAt >= approveAt) {
    fail(
      `config.yaml: "${path}.block-at" debe ser menor que approve-at para conservar una banda de revisión.`,
    );
  }

  const verdict = jevText(item, "verdict", path);
  if (verdict !== "required" && verdict !== "inform") {
    fail(`config.yaml: "${path}.verdict" debe ser required o inform.`);
  }

  return Object.freeze({
    id,
    description: jevText(item, "description", path),
    instructions: jevText(item, "instructions", path),
    criteria: Object.freeze({
      yes: jevText(criteria, "yes", `${path}.criteria`),
      no: jevText(criteria, "no", `${path}.criteria`),
    }),
    weight,
    approveAt,
    blockAt,
    verdict,
  });
}

/**
 * Lee las preguntas semánticas adicionales declaradas por etapa.
 *
 * Ausencia significa que el proyecto no suma ninguna pregunta: las compuertas y
 * su autoridad actual siguen idénticas. El consumidor posterior debe añadir las
 * `required` por conjunción y conservar las `inform` como contexto del recibo.
 */
export function readJevPropositions(config: ConfigMap): JevPropositions {
  if (config["jev-propositions"] === undefined) {
    return Object.freeze({ analysis: Object.freeze([]), plan: Object.freeze([]), integration: Object.freeze([]) });
  }
  const declared = readMap(config, "jev-propositions");
  for (const stage of Object.keys(declared)) {
    if (!(JEV_STAGES as readonly string[]).includes(stage)) {
      fail(`config.yaml: "jev-propositions.${stage}" nombra una etapa desconocida.`);
    }
  }

  const result = {} as Record<JevStage, readonly JevPropositionConfig[]>;
  for (const stage of JEV_STAGES) {
    const raw = declared[stage];
    if (raw === undefined) {
      result[stage] = Object.freeze([]);
      continue;
    }
    if (!Array.isArray(raw)) {
      fail(`config.yaml: "jev-propositions.${stage}" debe ser una lista.`);
    }
    const ids = new Set<string>();
    const propositions = raw.map((item, index) => {
      const proposition = jevProposition(item, `jev-propositions.${stage}[${index}]`);
      if (ids.has(proposition.id)) {
        fail(`config.yaml: "jev-propositions.${stage}[${index}].id" está duplicado.`);
      }
      ids.add(proposition.id);
      return proposition;
    });
    result[stage] = Object.freeze(propositions);
  }
  return Object.freeze(result);
}

/** Solicitud declarativa para promover un gate híbrido a automático. */
export interface GatePromotionRequest {
  readonly mode: "auto";
  readonly minimumSample: number;
  readonly minimumAgreement: number;
}

/**
 * Lee las promociones que una persona solicita en la configuración del proyecto.
 *
 * La solicitud no cambia ningún gate por sí sola: el motor la cruza con la
 * evidencia append-only de calibración. Mantener esa separación evita que un
 * cambio de YAML se convierta en una aprobación sin números verificables.
 */
export function readGatePromotions(
  config: ConfigMap,
  knownGateIds: readonly string[],
): Readonly<Record<string, GatePromotionRequest>> {
  if (config["gate-promotions"] === undefined) return {};
  const promotions = readMap(config, "gate-promotions");
  const result: Record<string, GatePromotionRequest> = {};

  for (const [gateId, raw] of Object.entries(promotions)) {
    if (!knownGateIds.includes(gateId)) {
      fail(`config.yaml: "gate-promotions.${gateId}" nombra un gate desconocido.`);
    }
    if (typeof raw === "string" || Array.isArray(raw)) {
      fail(`config.yaml: "gate-promotions.${gateId}" debe ser un mapa.`);
    }
    const allowed = new Set(["mode", "minimum-sample", "minimum-agreement"]);
    for (const key of Object.keys(raw)) {
      if (!allowed.has(key)) {
        fail(`config.yaml: "gate-promotions.${gateId}.${key}" no es una clave válida.`);
      }
    }

    if (raw["mode"] !== "auto") {
      fail(`config.yaml: "gate-promotions.${gateId}.mode" debe ser auto.`);
    }
    const minimumSample = Number(raw["minimum-sample"]);
    if (!Number.isInteger(minimumSample) || minimumSample <= 0) {
      fail(
        `config.yaml: "gate-promotions.${gateId}.minimum-sample" debe ser un entero positivo.`,
      );
    }
    const minimumAgreement = Number(raw["minimum-agreement"]);
    if (
      !Number.isFinite(minimumAgreement) ||
      minimumAgreement < 0 ||
      minimumAgreement > 1
    ) {
      fail(
        `config.yaml: "gate-promotions.${gateId}.minimum-agreement" debe estar entre 0 y 1.`,
      );
    }
    result[gateId] = Object.freeze({ mode: "auto", minimumSample, minimumAgreement });
  }

  return Object.freeze(result);
}

/** Los evaluadores a los que un umbral puede apuntar. */
export const THRESHOLD_EVALUATORS = ["command", "jev", "llm-judge", "cascade"] as const;

/**
 * Un umbral que el proyecto declara para una compuerta, un evaluador o una proposición.
 *
 * `approvedBy` y `reason` son de la persona que decidió el umbral: el motor no los
 * escribe nunca, y una entrada sin ellos no se aplica (R-CPRE-010: aplicar un umbral
 * nuevo lo decide una persona).
 */
export interface ThresholdOverride {
  readonly gate: string;
  readonly evaluator: string | null;
  readonly proposition: string | null;
  readonly approveAt: number;
  readonly blockAt: number;
  readonly approvedBy: string | null;
  readonly reason: string | null;
}

/**
 * Lee la lista `gate-thresholds` de `.valmen/config.yaml`.
 *
 * Es opt-in: sin la lista no hay umbrales declarados. Una entrada con una forma inválida
 * falla nombrando la clave, igual que el resto del archivo: interpretar «casi bien» un
 * umbral es decidir con un número que nadie escribió.
 */
export function readGateThresholds(
  config: ConfigMap,
  knownGateIds: readonly string[],
): readonly ThresholdOverride[] {
  const crudo = config["gate-thresholds"];
  if (crudo === undefined) return [];
  if (typeof crudo === "string" || !Array.isArray(crudo)) {
    fail('config.yaml: "gate-thresholds" debe ser una lista de entradas.');
  }
  const permitidas = new Set([
    "gate",
    "evaluator",
    "proposition",
    "approve-at",
    "block-at",
    "approved-by",
    "reason",
  ]);
  return crudo.map((entrada, indice): ThresholdOverride => {
    const donde = `gate-thresholds[${indice}]`;
    if (typeof entrada === "string" || Array.isArray(entrada)) {
      fail(`config.yaml: "${donde}" debe ser un mapa.`);
    }
    for (const clave of Object.keys(entrada)) {
      if (!permitidas.has(clave)) fail(`config.yaml: "${donde}.${clave}" no es una clave válida.`);
    }
    const gate = readString(entrada, "gate", "");
    if (!knownGateIds.includes(gate)) {
      fail(`config.yaml: "${donde}.gate" nombra una compuerta desconocida: "${gate}".`);
    }
    const evaluator = readString(entrada, "evaluator", "");
    if (evaluator !== "" && !(THRESHOLD_EVALUATORS as readonly string[]).includes(evaluator)) {
      fail(
        `config.yaml: "${donde}.evaluator" nombra un evaluador desconocido: "${evaluator}". ` +
          `Los válidos son ${THRESHOLD_EVALUATORS.join(", ")}.`,
      );
    }
    const numero = (clave: string): number => {
      const valor = Number(readString(entrada, clave, ""));
      if (!Number.isFinite(valor) || valor < 0 || valor > 1) {
        fail(`config.yaml: "${donde}.${clave}" debe ser un número entre 0 y 1.`);
      }
      return valor;
    };
    const approveAt = numero("approve-at");
    const blockAt = numero("block-at");
    if (blockAt >= approveAt) {
      fail(
        `config.yaml: "${donde}.block-at" (${blockAt}) debe ser menor que "approve-at" ` +
          `(${approveAt}): sin separación no hay banda de revisión.`,
      );
    }
    const proposition = readString(entrada, "proposition", "");
    const approvedBy = readString(entrada, "approved-by", "");
    const reason = readString(entrada, "reason", "");
    return {
      gate,
      evaluator: evaluator === "" ? null : evaluator,
      proposition: proposition === "" ? null : proposition,
      approveAt,
      blockAt,
      approvedBy: approvedBy === "" ? null : approvedBy,
      reason: reason === "" ? null : reason,
    };
  });
}

/**
 * La configuración del puente con Hermes.
 *
 * Va anidada —`notify.gate`, `approval.token-hours`— y no en claves planas
 * porque el diseño anticipa más destinos que el gate: cuando existan los avisos
 * de proceso y de presupuesto, entran como una clave más bajo `notify` en vez de
 * como un nombre nuevo al lado, y nadie tiene que migrar el archivo.
 *
 * **Todo es opcional y el valor por defecto es el silencio.** Sin `enabled: true`
 * el harness no manda nada, y eso importa: una herramienta que empieza a mandar
 * mensajes al celular de alguien porque actualizó una versión es una herramienta
 * que se desinstala. El puente se enciende a propósito.
 */
export interface HermesConfig {
  /** Si está encendido. Por defecto, no. */
  readonly enabled: boolean;
  /** A dónde van los avisos de gate. Vacío significa que no se manda. */
  readonly gateTarget: string;
  /**
   * A dónde van los avisos de presupuesto, o vacío.
   *
   * Es un destino propio y no el del gate: un corte de presupuesto se lee mientras
   * se trabaja —para decidir si se sigue—, y el del gate llega cuando algo ya se
   * detuvo. Quien quiera los dos al mismo lugar repite el valor, y así el reparto se
   * ve en el archivo en vez de quedar decidido por el harness.
   */
  readonly budgetTarget: string;
  /** Cuántas horas vale un token de aprobación. */
  readonly tokenHours: number;
  /** El techo de riesgo que se puede aprobar a distancia. */
  readonly allowedRisk: readonly string[];
}

/** La configuración de Hermes, leída de `.valmen/config.yaml`. */
export function readHermesConfig(config: ConfigMap): HermesConfig {
  const hermes = readMap(config, "hermes");
  const notify = readMap(hermes, "notify");
  const approval = readMap(hermes, "approval");

  const horas = Number(readString(approval, "token-hours", "24"));
  if (!Number.isFinite(horas) || horas <= 0) {
    // Un token de cero horas o de infinitas no es una configuración: es un error
    // de tipeo con el mismo aspecto que un valor legítimo. Se dice.
    fail(
      'config.yaml: "hermes.approval.token-hours" debe ser un número de horas mayor que cero.',
    );
  }

  return {
    // El parser devuelve los escalares como texto, así que el booleano se compara
    // tal como está escrito. Cualquier otra cosa —`yes`, `1`, vacío— es `false`:
    // el default seguro, y el único que no manda mensajes sin que nadie lo pida.
    enabled: readString(hermes, "enabled", "false") === "true",
    gateTarget: readString(notify, "gate", ""),
    budgetTarget: readString(notify, "budget", ""),
    tokenHours: horas,
    allowedRisk: readList(approval, "allowed-risk", ["low", "normal"]),
  };
}

/**
 * La capacidad de pruebas de interfaz que el proyecto declara.
 *
 * Es opt-in y vive en una sección propia —`playwright:`— y no como un prefijo
 * más de `test-commands`: esa lista autoriza comandos arbitrarios del ticket, y
 * esta sección **describe** la capacidad —el programa, el navegador, su tope de
 * tiempo y el modelo que escribe los specs—. Sin la sección, el verbo
 * `playwright` no existe para el proyecto, y esa ausencia es una declaración.
 */
export interface PlaywrightConfig {
  /** El programa y sus argumentos fijos; su presencia no vacía enciende el verbo. */
  readonly command: string;
  /** El navegador que Playwright usa por defecto, que el check agrega como `--project`. */
  readonly project: string;
  /** El tope del check del verbo, en milisegundos. Distinto del de backend. */
  readonly timeoutMs: number;
  /** El proveedor del modelo recomendado para escribir y mantener los specs. */
  readonly provider: string;
  /** El modelo recomendado para escribir los specs; vacío cae al preset. */
  readonly model: string;
}

/** El navegador por defecto de una sección `playwright:` que no lo declara. */
const PLAYWRIGHT_PROJECT_DEFAULT = "chromium";

/** Los segundos por defecto del check del verbo, si la sección no declara tope. */
const PLAYWRIGHT_TIMEOUT_SEGUNDOS_DEFAULT = 30;

/** El proveedor por defecto del rol de specs, si la sección no lo declara. */
const PLAYWRIGHT_PROVIDER_DEFAULT = "openrouter";

/**
 * Lee la sección `playwright:` de `.valmen/config.yaml`.
 *
 * Devuelve `null` cuando el proyecto no la declara: la ausencia es la
 * declaración de que la capacidad está apagada, y por eso el verbo se rechaza en
 * vez de resolverse contra otro sitio. Una sección declarada con una forma
 * inválida —sin comando, con un tope que no es un número positivo— falla en voz
 * alta nombrando la clave, como el resto del archivo: es preferible que el
 * harness no arranque a que resuelva una capacidad distinta de la que se
 * escribió.
 */
export function readPlaywrightConfig(config: ConfigMap): PlaywrightConfig | null {
  if (config["playwright"] === undefined) return null;
  const playwright = readMap(config, "playwright");

  const command = readString(playwright, "command", "");
  if (command === "") {
    fail(
      'config.yaml: "playwright.command" es obligatorio: es lo que declara la capacidad de pruebas de interfaz.',
    );
  }

  const timeout = readString(
    playwright,
    "timeout",
    String(PLAYWRIGHT_TIMEOUT_SEGUNDOS_DEFAULT),
  );
  const segundos = Number(timeout);
  if (!Number.isFinite(segundos) || segundos <= 0) {
    fail(
      'config.yaml: "playwright.timeout" debe ser un número de segundos mayor que cero.',
    );
  }

  return {
    command,
    project: readString(playwright, "project", PLAYWRIGHT_PROJECT_DEFAULT),
    timeoutMs: Math.round(segundos * 1000),
    provider: readString(playwright, "provider", PLAYWRIGHT_PROVIDER_DEFAULT),
    model: readString(playwright, "model", ""),
  };
}

/** Ambiente desplegado que una persona usa al declarar `verify: dev`. */
export interface VerifyDevConfig {
  /** URL HTTP(S) del ambiente de desarrollo que se va a comprobar. */
  readonly url: string;
  /** Rama que alimenta el ambiente, si el proyecto necesita declararla. */
  readonly branch: string;
}

/**
 * Lee la declaración del ambiente que respalda `<!-- verify: dev -->`.
 *
 * La sección es opt-in: un proyecto que no declara criterios dev no necesita
 * conocerla. Pero cuando existe, `url` no admite una forma incompleta; prometer
 * una prueba contra un ambiente inexistente es peor que dejar el criterio manual.
 */
export function readVerifyDevConfig(config: ConfigMap): VerifyDevConfig | null {
  if (config["verify-dev"] === undefined) return null;
  const verifyDev = readMap(config, "verify-dev");
  const url = verifyDev["url"];
  if (typeof url !== "string" || url === "") {
    fail('config.yaml: "verify-dev.url" es obligatoria para criterios `verify: dev`.');
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      fail('config.yaml: "verify-dev.url" debe usar http o https.');
    }
  } catch (caught) {
    if (caught instanceof Error && caught.message.includes("verify-dev.url")) throw caught;
    fail('config.yaml: "verify-dev.url" debe ser una URL HTTP(S) válida.');
  }

  const branch = verifyDev["branch"];
  if (branch !== undefined && typeof branch !== "string") {
    fail('config.yaml: "verify-dev.branch" debe ser un texto.');
  }

  return {
    url,
    branch: branch ?? "",
  };
}

/**
 * La preparación del ambiente de pruebas que el proyecto declara.
 *
 * Son los comandos que dejan listo el ambiente antes de los criterios: migrar al
 * esquema de pruebas, reutilizar la base (`--keepdb`), levantar un servicio. Salen de
 * la configuración del proyecto y **nunca del ticket**: el ticket lo escribe quien la
 * compuerta controla, y una migración es un cambio de datos.
 */
export interface TestSetupConfig {
  /** El esquema de pruebas contra el que apunta la preparación. */
  readonly schema: string;
  /** Los comandos, en el orden en que se corren. */
  readonly commands: readonly string[];
  /** Tope por comando en milisegundos, o `null` para usar `test-timeout`. */
  readonly timeoutMs: number | null;
}

/**
 * Lee la sección `test-setup:` de `.valmen/config.yaml`.
 *
 * Es opt-in: sin la sección devuelve `null` y el proyecto no cambia. Declarada con una
 * forma inválida falla nombrando la clave, igual que el resto del archivo: interpretar
 * «casi bien» una preparación es migrar algo distinto de lo que se escribió.
 */
export function readTestSetupConfig(config: ConfigMap): TestSetupConfig | null {
  if (config["test-setup"] === undefined) return null;
  const setup = readMap(config, "test-setup");

  const schema = readString(setup, "schema", "");
  if (schema === "") {
    fail(
      'config.yaml: "test-setup.schema" es obligatorio: sin el esquema no se puede comprobar ' +
        "que la preparación apunta a uno permitido.",
    );
  }
  const commands = readList(setup, "commands", []);
  if (commands.length === 0 || commands.some((comando) => comando.trim() === "")) {
    fail('config.yaml: "test-setup.commands" debe ser una lista no vacía de comandos.');
  }

  let timeoutMs: number | null = null;
  if (setup["timeout"] !== undefined) {
    const segundos = Number(readString(setup, "timeout", ""));
    if (!Number.isFinite(segundos) || segundos <= 0) {
      fail('config.yaml: "test-setup.timeout" debe ser un número de segundos mayor que cero.');
    }
    timeoutMs = Math.round(segundos * 1000);
  }
  return { schema, commands, timeoutMs };
}

/** Lee `allowed-schemas`: los esquemas contra los que se permite migrar. Vacía si falta. */
export function readAllowedSchemas(config: ConfigMap): string[] {
  const lista = readList(config, "allowed-schemas", []);
  if (lista.some((esquema) => esquema.trim() === "")) {
    fail('config.yaml: "allowed-schemas" no admite elementos vacíos.');
  }
  return lista;
}

/**
 * ¿Se rechaza esta preparación? Devuelve el motivo, o `null` si se acepta.
 *
 * Sin `allowed-schemas` no hay nada permitido: la ausencia de la lista rechaza, no
 * habilita. Es la frontera que impide migrar contra un esquema que nadie autorizó.
 */
export function testSetupRefusal(
  setup: TestSetupConfig,
  allowedSchemas: readonly string[],
): string | null {
  if (allowedSchemas.includes(setup.schema)) return null;
  return allowedSchemas.length === 0
    ? `la preparación apunta al esquema «${setup.schema}» y el proyecto no declara allowed-schemas: no se ejecuta`
    : `el esquema «${setup.schema}» no está en allowed-schemas (${allowedSchemas.join(", ")}): no se ejecuta`;
}

/** Condiciones que un proyecto puede exigir antes de ofrecer trabajo autónomo. */
export const AUTONOMOUS_REQUIREMENTS = [
  "plan-approved",
  "tests-declared",
  "no-critical-impacts",
] as const;

/** Causas de parada que la política puede declarar. */
export const AUTONOMOUS_STOP_CONDITIONS = [
  "gate-blocked-twice",
  "test-failure",
  "secret-detected",
  "budget-exceeded",
] as const;

/** Ejecutores locales conocidos; el comando se construye en código, nunca en YAML. */
export const AUTONOMOUS_EXECUTORS = ["codex", "opencode", "claude"] as const;

/** Esfuerzos que los adaptadores pueden traducir a su propia invocación. */
export const AUTONOMOUS_EXECUTOR_EFFORTS = ["low", "medium", "high"] as const;

/** Decisiones disponibles cuando dos tickets declaran que escriben la misma ruta. */
export const AUTONOMOUS_COLLISION_POLICIES = ["warn", "serialize", "block"] as const;

/** Política de colisión, compartida por configuración y el planificador del motor. */
export type AutonomousCollisionPolicy = (typeof AUTONOMOUS_COLLISION_POLICIES)[number];

/** Un ejecutor opt-in para `valmen run`; no admite una cadena de shell libre. */
export interface AutonomousExecutorConfig {
  readonly id: (typeof AUTONOMOUS_EXECUTORS)[number];
  readonly model: string;
  readonly effort: (typeof AUTONOMOUS_EXECUTOR_EFFORTS)[number];
}

/** Política declarativa que los ejecutores autónomos posteriores consumirán. */
export interface AutonomousConfig {
  readonly enabled: boolean;
  /** Ausente hasta que el proyecto declare cómo despachar; la política sola no ejecuta nada. */
  readonly executor: AutonomousExecutorConfig | null;
  readonly eligible: {
    readonly types: readonly string[];
    readonly maxRisk: string;
    readonly require: readonly string[];
    readonly excludedModules: readonly string[];
  };
  readonly limits: {
    readonly maxConcurrent: number;
    /** Qué hacer antes de permitir que un futuro despachador ejecute rutas comunes. */
    readonly collisionPolicy: AutonomousCollisionPolicy;
    readonly maxPerDay: number;
    readonly budgetPerTicket: number;
    /** Tiempo máximo de una ejecución del agente, en minutos; una que lo supera se corta. */
    readonly maxMinutes: number;
    readonly stopOn: readonly string[];
  };
}

/** El tiempo máximo por ejecución cuando la política no lo declara. */
export const AUTONOMOUS_DEFAULT_MAX_MINUTES = 60;

const AUTONOMOUS_OFF: AutonomousConfig = Object.freeze({
  enabled: false,
  executor: null,
  eligible: Object.freeze({
    types: Object.freeze([]),
    maxRisk: "",
    require: Object.freeze([]),
    excludedModules: Object.freeze([]),
  }),
  limits: Object.freeze({
    maxConcurrent: 0,
    // La autonomía apagada no despacha nada; `block` conserva además el valor
    // más conservador para quien inspeccione el contrato sin activarlo.
    collisionPolicy: "block",
    maxPerDay: 0,
    budgetPerTicket: 0,
    maxMinutes: AUTONOMOUS_DEFAULT_MAX_MINUTES,
    stopOn: Object.freeze([]),
  }),
});

function autonomousMap(config: ConfigMap, key: string): ConfigMap {
  const value = config[key];
  if (typeof value === "string" || Array.isArray(value) || value === undefined) {
    fail(`config.yaml: "autonomous.${key}" debe ser un mapa.`);
  }
  return value;
}

function autonomousList(map: ConfigMap, key: string, path: string): string[] {
  const value = map[key];
  if (
    !Array.isArray(value) ||
    !value.every((item): item is string => typeof item === "string")
  ) {
    fail(`config.yaml: "autonomous.${path}" debe ser una lista de textos.`);
  }
  if (value.length === 0 || new Set(value).size !== value.length) {
    fail(`config.yaml: "autonomous.${path}" debe ser una lista no vacía sin duplicados.`);
  }
  return value;
}

function autonomousPositive(
  map: ConfigMap,
  key: string,
  path: string,
  integer: boolean,
): number {
  const value = map[key];
  const number = typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || number <= 0 || (integer && !Number.isInteger(number))) {
    fail(
      `config.yaml: "autonomous.${path}" debe ser un ${integer ? "entero" : "decimal"} mayor que cero.`,
    );
  }
  return number;
}

function autonomousExecutor(autonomous: ConfigMap): AutonomousExecutorConfig | null {
  if (autonomous["executor"] === undefined) return null;
  const executor = autonomousMap(autonomous, "executor");
  const id = executor["id"];
  const model = executor["model"];
  const effort = executor["effort"];
  if (typeof id !== "string" || !(AUTONOMOUS_EXECUTORS as readonly string[]).includes(id)) {
    fail('config.yaml: "autonomous.executor.id" debe ser un ejecutor conocido.');
  }
  if (typeof model !== "string" || model.trim() === "") {
    fail('config.yaml: "autonomous.executor.model" es obligatorio.');
  }
  if (
    typeof effort !== "string" ||
    !(AUTONOMOUS_EXECUTOR_EFFORTS as readonly string[]).includes(effort)
  ) {
    fail('config.yaml: "autonomous.executor.effort" debe ser low, medium o high.');
  }
  return Object.freeze({
    id: id as AutonomousExecutorConfig["id"],
    model,
    effort: effort as AutonomousExecutorConfig["effort"],
  });
}

/**
 * Lee la política de autonomía. La ausencia queda apagada: declarar una política
 * es una decisión humana, y el lector no selecciona ni ejecuta tickets.
 */
export function readAutonomousConfig(config: ConfigMap): AutonomousConfig {
  if (config["autonomous"] === undefined) return AUTONOMOUS_OFF;
  const autonomous = readMap(config, "autonomous");
  const enabledRaw = autonomous["enabled"];
  if (enabledRaw !== "true" && enabledRaw !== "false") {
    fail('config.yaml: "autonomous.enabled" debe ser true o false.');
  }
  if (enabledRaw === "false") return AUTONOMOUS_OFF;

  const eligible = autonomousMap(autonomous, "eligible");
  const limits = autonomousMap(autonomous, "limits");
  const types = autonomousList(eligible, "types", "eligible.types");
  const maxRisk = eligible["max-risk"];
  const requirements = autonomousList(eligible, "require", "eligible.require");
  const excludedModules = autonomousList(
    eligible,
    "excluded-modules",
    "eligible.excluded-modules",
  );
  const stopOn = autonomousList(limits, "stop-on", "limits.stop-on");
  const collisionPolicy = limits["collision-policy"];

  if (!types.every((type) => (TICKET_TYPES as readonly string[]).includes(type))) {
    fail(
      'config.yaml: "autonomous.eligible.types" contiene un tipo de ticket desconocido.',
    );
  }
  if (
    typeof maxRisk !== "string" ||
    !(RISK_LEVELS as readonly string[]).includes(maxRisk)
  ) {
    fail('config.yaml: "autonomous.eligible.max-risk" debe ser un riesgo conocido.');
  }
  if (
    !requirements.every((item) =>
      (AUTONOMOUS_REQUIREMENTS as readonly string[]).includes(item),
    )
  ) {
    fail('config.yaml: "autonomous.eligible.require" contiene una condición desconocida.');
  }
  if (!excludedModules.every((item) => /^[a-z][a-z0-9-]{0,63}$/.test(item))) {
    fail(
      'config.yaml: "autonomous.eligible.excluded-modules" contiene un módulo inválido.',
    );
  }
  if (
    !stopOn.every((item) =>
      (AUTONOMOUS_STOP_CONDITIONS as readonly string[]).includes(item),
    )
  ) {
    fail(
      'config.yaml: "autonomous.limits.stop-on" contiene una condición de parada desconocida.',
    );
  }
  if (
    typeof collisionPolicy !== "string" ||
    !(AUTONOMOUS_COLLISION_POLICIES as readonly string[]).includes(collisionPolicy)
  ) {
    fail(
      'config.yaml: "autonomous.limits.collision-policy" debe ser warn, serialize o block.',
    );
  }

  return Object.freeze({
    enabled: true,
    executor: autonomousExecutor(autonomous),
    eligible: Object.freeze({
      types: Object.freeze(types),
      maxRisk,
      require: Object.freeze(requirements),
      excludedModules: Object.freeze(excludedModules),
    }),
    limits: Object.freeze({
      maxConcurrent: autonomousPositive(
        limits,
        "max-concurrent",
        "limits.max-concurrent",
        true,
      ),
      collisionPolicy: collisionPolicy as AutonomousCollisionPolicy,
      maxPerDay: autonomousPositive(limits, "max-per-day", "limits.max-per-day", true),
      budgetPerTicket: autonomousPositive(
        limits,
        "budget-per-ticket",
        "limits.budget-per-ticket",
        false,
      ),
      maxMinutes:
        limits["max-minutes"] === undefined
          ? AUTONOMOUS_DEFAULT_MAX_MINUTES
          : autonomousPositive(limits, "max-minutes", "limits.max-minutes", false),
      stopOn: Object.freeze(stopOn),
    }),
  });
}

/** Identidad que viaja con la política compartible del proyecto. */
export interface SharedProjectPolicy {
  readonly projectId: string | null;
}

/**
 * Consentimiento compartible para observar actividad o despachar trabajo.
 *
 * Una integración instalada no concede estas capacidades. Cada lista declara
 * el alcance elegido por el equipo y una lista ausente significa que no hay
 * nada habilitado; rutas, perfiles y credenciales siguen perteneciendo al
 * binding de la máquina o a su almacén local.
 */
export interface ExecutionCapabilities {
  readonly observationSources: readonly string[];
  readonly dispatchExecutors: readonly string[];
}

const EXECUTION_CAPABILITY_RE = /^[a-z][a-z0-9-]{0,63}$/;

/**
 * Lee las capacidades operativas sin inferirlas de Hermes, MCP o bindings.
 *
 * Las etiquetas son deliberadamente extensibles: un equipo puede declarar un
 * adaptador futuro sin tener que cambiar el parser, y el adaptador que lo
 * consume decidirá después si conoce esa capacidad. Lo que no admite es una
 * etiqueta ambigua, duplicada o un valor que parezca ruta.
 */
export function readExecutionCapabilities(config: ConfigMap): ExecutionCapabilities {
  const execution = readMap(config, "execution");
  const observationSources = readCapabilityList(execution, "observation-sources");
  const dispatchExecutors = readCapabilityList(execution, "dispatch-executors");
  return Object.freeze({
    observationSources: Object.freeze(observationSources),
    dispatchExecutors: Object.freeze(dispatchExecutors),
  });
}

/**
 * Lee la identidad lógica compartible sin exigirla a configuraciones históricas.
 *
 * La resolución autorizada la requerirá cuando una operación abarque varios
 * proyectos; mantener `null` aquí evita que adoptar una versión nueva rompa un
 * proyecto que todavía solo usa el flujo local existente.
 */
export function readSharedProjectPolicy(config: ConfigMap): SharedProjectPolicy {
  const value = config["project-id"];
  if (value === undefined || value === "") return { projectId: null };
  if (typeof value !== "string" || !PROJECT_ID_RE.test(value)) {
    fail(
      'config.yaml: "project-id" debe ser un identificador lógico en minúsculas (letras, números y guiones).',
    );
  }
  return { projectId: value };
}

function readCapabilityList(config: ConfigMap, key: string): string[] {
  const values = readList(config, key, []);
  const seen = new Set<string>();
  for (const value of values) {
    if (!EXECUTION_CAPABILITY_RE.test(value)) {
      fail(
        `config.yaml: "execution.${key}" solo admite etiquetas en minúsculas, sin rutas ni espacios.`,
      );
    }
    if (seen.has(value)) {
      fail(`config.yaml: "execution.${key}" no puede repetir "${value}".`);
    }
    seen.add(value);
  }
  return values;
}

/** Las fuentes de aprobación del plan que rigen si el proyecto no declara `plan-approval-sources`. */
export const DEFAULT_PLAN_APPROVAL_SOURCES: readonly string[] = ["mission-control", "cli"];

/**
 * Lee `plan-approval-sources`: desde dónde se acepta que una persona apruebe un plan.
 *
 * Sin la clave rigen `mission-control` y `cli`. Una lista vacía o con un nombre inválido
 * **falla**: una lista de fuentes que se interpreta «casi bien» deja pasar una que nadie
 * autorizó, y la ausencia de fuentes aceptadas no puede significar «cualquiera».
 */
export function readPlanApprovalSources(config: ConfigMap): readonly string[] {
  if (config["plan-approval-sources"] === undefined) return DEFAULT_PLAN_APPROVAL_SOURCES;
  const fuentes = readList(config, "plan-approval-sources", []);
  if (fuentes.length === 0) {
    fail('config.yaml: "plan-approval-sources" no puede estar vacía; quite la clave para usar las de siempre.');
  }
  for (const fuente of fuentes) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(fuente)) {
      fail(`config.yaml: "plan-approval-sources" contiene una fuente inválida: «${fuente}».`);
    }
  }
  return fuentes;
}

/** Las ramas que nunca se aceptan como rama de trabajo si el proyecto no declara las suyas. */
export const DEFAULT_PROTECTED_BRANCHES: readonly string[] = ["main", "master", "production"];

/** La rama de trabajo si el proyecto no declara `execution.work-branch`. */
export const DEFAULT_WORK_BRANCH = "valmen/jornada-<AAAAMMDD>";

export interface IntegrationConfig {
  /** La plantilla de la rama de trabajo; `<AAAAMMDD>` se reemplaza por la fecha. */
  readonly workBranch: string;
  readonly protectedBranches: readonly string[];
}

const WORK_BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/<>-]*$/;

/** Reemplaza `<AAAAMMDD>` de una plantilla de rama por la fecha. */
export function resolveWorkBranch(workBranch: string, fecha: Date): string {
  return workBranch.replaceAll("<AAAAMMDD>", fecha.toISOString().slice(0, 10).replaceAll("-", ""));
}

/**
 * Lee `execution.work-branch` y `execution.protected-branches` (R-JORN-009).
 *
 * La rama de trabajo no puede ser una protegida: una jornada que commitea en `main` es justo lo
 * que estas reglas existen para impedir, y se rechaza al leer la configuración, no al commitear.
 */
export function readIntegrationConfig(config: ConfigMap): IntegrationConfig {
  const execution = config["execution"] === undefined ? {} : readMap(config, "execution");
  const protectedBranches =
    execution["protected-branches"] === undefined
      ? [...DEFAULT_PROTECTED_BRANCHES]
      : readList(execution, "protected-branches", []);
  if (protectedBranches.some((rama) => rama.trim() === "")) {
    fail('config.yaml: "execution.protected-branches" no admite elementos vacíos.');
  }
  const workBranch = readString(execution, "work-branch", DEFAULT_WORK_BRANCH);
  if (!WORK_BRANCH_RE.test(workBranch) || workBranch.includes("..") || workBranch.endsWith("/") || workBranch.endsWith(".lock")) {
    fail(
      `config.yaml: "execution.work-branch" no es un nombre de rama válido: «${workBranch}». ` +
        "Use letras, números, `.`, `_`, `-` y `/`, con `<AAAAMMDD>` opcional.",
    );
  }
  // Se compara la plantilla y también la rama resuelta de hoy: `main-<AAAAMMDD>` no es
  // protegida, pero una plantilla que se resuelve a `main` sí.
  const resueltaHoy = resolveWorkBranch(workBranch, new Date());
  const lista = new Set(protectedBranches);
  if (lista.has(workBranch) || lista.has(resueltaHoy)) {
    fail(
      `config.yaml: "execution.work-branch" apunta a una rama protegida («${workBranch}»). ` +
        `Las protegidas son: ${protectedBranches.join(", ")}.`,
    );
  }
  return { workBranch, protectedBranches };
}

/** La configuración de la compuerta `qa-agent` (R-QAAG-004). */
export interface QaAgentConfig {
  /** Comandos de la suite de regresión; cada uno debe estar también autorizado en `test-commands`. */
  readonly regressionCommands: readonly string[];
  /** `shadow` (por defecto): corre y registra sin cerrar; `close`: puede cerrar si hay una promoción registrada. */
  readonly mode: "shadow" | "close";
}

/** Lee `qa-agent.regression-commands`; sin la clave no hay regresión declarada. */
export function readQaAgentConfig(config: ConfigMap): QaAgentConfig {
  const qa = config["qa-agent"] === undefined ? {} : readMap(config, "qa-agent");
  const mode = readString(qa, "mode", "shadow");
  if (mode !== "shadow" && mode !== "close") {
    fail(`config.yaml: "qa-agent.mode" debe ser "shadow" o "close", no «${mode}».`);
  }
  return { regressionCommands: readList(qa, "regression-commands", []), mode };
}

/** Quién dispara el avance de la jornada (R-JORN-011). */
export type JourneyDispatcher = "machine" | "hermes";

/**
 * Lee `execution.dispatcher`: `machine` (el disparador de la máquina, por defecto) o `hermes`.
 *
 * Sin la clave la jornada corre con el disparador de la máquina. Cualquier otro valor falla: un
 * despachador mal escrito no puede caer a un defecto en silencio.
 */
export function readJourneyDispatcher(config: ConfigMap): JourneyDispatcher {
  const execution = config["execution"] === undefined ? {} : readMap(config, "execution");
  const valor = readString(execution, "dispatcher", "machine");
  if (valor !== "machine" && valor !== "hermes") {
    fail(`config.yaml: "execution.dispatcher" debe ser "machine" o "hermes", no «${valor}».`);
  }
  return valor;
}

/** Los canales desde los que se acepta crear o revocar una autorización de aprobación si el proyecto no declara los suyos. */
export const DEFAULT_APPROVAL_AUTHORIZATION_SOURCES: readonly string[] = ["cli", "mission-control"];

/**
 * Lee `approval-authorization-sources`: los canales que el agente no controla para crear o revocar
 * una autorización de aprobación automática (R-APRO-001).
 *
 * Una lista vacía o con un nombre inválido **falla**: la ausencia de canales aceptados no puede
 * significar «cualquiera».
 */
export function readApprovalAuthorizationSources(config: ConfigMap): readonly string[] {
  if (config["approval-authorization-sources"] === undefined) return DEFAULT_APPROVAL_AUTHORIZATION_SOURCES;
  const fuentes = readList(config, "approval-authorization-sources", []);
  if (fuentes.length === 0) {
    fail('config.yaml: "approval-authorization-sources" no puede estar vacía; quite la clave para usar las de siempre.');
  }
  for (const fuente of fuentes) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(fuente)) {
      fail(`config.yaml: "approval-authorization-sources" contiene una fuente inválida: «${fuente}».`);
    }
  }
  return fuentes;
}

/** Los canales desde los que se acepta crear o revocar una autorización de QA si el proyecto no declara los suyos. */
export const DEFAULT_QA_AUTHORIZATION_SOURCES: readonly string[] = ["cli", "mission-control"];

/**
 * Lee `qa-authorization-sources` (R-QAAG-001): los canales que el agente no controla.
 *
 * Una lista vacía o con un nombre inválido **falla**: la ausencia de canales aceptados no puede
 * significar «cualquiera».
 */
export function readQaAuthorizationSources(config: ConfigMap): readonly string[] {
  if (config["qa-authorization-sources"] === undefined) return DEFAULT_QA_AUTHORIZATION_SOURCES;
  const fuentes = readList(config, "qa-authorization-sources", []);
  if (fuentes.length === 0) {
    fail('config.yaml: "qa-authorization-sources" no puede estar vacía; quite la clave para usar las de siempre.');
  }
  for (const fuente of fuentes) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(fuente)) {
      fail(`config.yaml: "qa-authorization-sources" contiene una fuente inválida: «${fuente}».`);
    }
  }
  return fuentes;
}

/** La verificación de criterios por petición HTTP que el proyecto autoriza (R-QAAG-007). */
export interface QaHttpConfig {
  /** Las URL base permitidas, sin ruta ni credenciales (por ejemplo `http://localhost:8000`). */
  readonly hosts: readonly string[];
  /** Los métodos que un criterio puede declarar; por defecto solo `GET`. */
  readonly methods: readonly string[];
  readonly timeoutSeconds: number;
  /** El **nombre** de la variable de entorno que trae la credencial; nunca su valor. */
  readonly credentialEnv: string | null;
}

const METODOS_HTTP = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];

/**
 * Lee la sección `qa-http` de `.valmen/config.yaml`; ausente devuelve `null` y todo criterio
 * `http:` se rechaza con el mensaje de qué declarar.
 *
 * El host, la credencial y el plazo salen de aquí y **nunca** del ticket: quien escribe el
 * criterio no elige a qué servidor se le habla.
 */
export function readQaHttpConfig(config: ConfigMap): QaHttpConfig | null {
  if (config["qa-http"] === undefined) return null;
  const mapa = readMap(config, "qa-http");
  const hosts = readList(mapa, "hosts", []);
  if (hosts.length === 0) fail('config.yaml: "qa-http.hosts" debe listar al menos una URL base.');
  for (const host of hosts) {
    let url: URL;
    try {
      url = new URL(host);
    } catch {
      fail(`config.yaml: "qa-http.hosts" contiene una URL inválida: «${host}».`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      fail(`config.yaml: "qa-http.hosts" solo admite http o https: «${host}».`);
    }
    if (url.username !== "" || url.password !== "") {
      fail(`config.yaml: "qa-http.hosts" no admite credenciales dentro de la URL: «${host}».`);
    }
  }
  const methods = mapa["methods"] === undefined ? ["GET"] : readList(mapa, "methods", []).map((m) => m.toUpperCase());
  if (methods.length === 0 || methods.some((m) => !METODOS_HTTP.includes(m))) {
    fail(`config.yaml: "qa-http.methods" debe usar métodos entre ${METODOS_HTTP.join(", ")}.`);
  }
  const timeoutSeconds = mapa["timeout-seconds"] === undefined ? 10 : Number(readString(mapa, "timeout-seconds", ""));
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > 120) {
    fail('config.yaml: "qa-http.timeout-seconds" debe ser un número de segundos entre 0 y 120.');
  }
  const credencial = readString(mapa, "credential-env", "");
  if (credencial !== "" && !/^[A-Z_][A-Z0-9_]*$/.test(credencial)) {
    fail('config.yaml: "qa-http.credential-env" debe ser el nombre de una variable de entorno en mayúsculas.');
  }
  return { hosts, methods, timeoutSeconds, credentialEnv: credencial === "" ? null : credencial };
}
