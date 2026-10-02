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
import { PROJECT_ID_RE, type YamlValue, fail, parseYamlSubset } from "@valmen/core";

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
