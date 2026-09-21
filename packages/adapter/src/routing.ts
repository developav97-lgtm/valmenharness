/**
 * Routing: qué modelo usa cada rol, y por qué.
 *
 * El problema que resuelve: un harness que siempre usa el mismo modelo es caro
 * donde no hace falta y barato donde no se puede permitir. Explorar código no
 * necesita un modelo de razonamiento fuerte; aprobar un plan sí.
 *
 * Cuatro decisiones que hacen que esto no sea un adorno:
 *
 * 1. **Los roles se declaran con su consumidor.** Un rol sin consumidor se
 *    muestra como declarado y no como configurado: prometer que un modelo se usa
 *    para algo que el harness todavía no ejecuta sería una mentira cómoda.
 * 2. **La resolución dice de dónde salió cada modelo.** Proyecto, preset o
 *    sistema. Sin esa columna, cambiar un preset y no ver efecto es
 *    indistinguible de un override olvidado en el proyecto.
 * 3. **Los identificadores de modelo de los presets están verificados** contra
 *    el catálogo real de OpenRouter. Un preset con un modelo que no existe es un
 *    error que solo aparece en producción.
 * 4. **Jev no está en el catálogo.** Vive en el endpoint de Decisions, no en el
 *    de chat, así que no aparece al listar modelos: se añade explícitamente. Es
 *    el evaluador por defecto porque emite probabilidades en vez de texto.
 *
 * Ver docs/04-PROVEEDORES.md §4.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fail } from "@valmen/core";

import { type ConfigMap, parseConfig, readMap, readString } from "./config.js";

/** Esfuerzo de razonamiento de un rol. */
export type Effort = "auto" | "low" | "medium" | "high";

/** Los esfuerzos admitidos, en orden de coste. */
export const EFFORTS: readonly Effort[] = ["auto", "low", "medium", "high"];

/** Modelo que usa el evaluador de gates por defecto. */
export const DEFAULT_GATE_EVALUATOR = "typesafe/jev-1.13";

/** Proveedor por defecto del evaluador: el mismo que usa el harness por defecto. */
const DEFAULT_PROVIDER = "openrouter";

/** Modelo que usa el juez de chat por defecto. */
export const DEFAULT_GATE_JUDGE = "deepseek/deepseek-v4-flash";

/** Un rol del workflow. */
export interface RoleSpec {
  readonly id: string;
  readonly description: string;
  /**
   * Qué parte del harness lo ejecuta hoy.
   *
   * `null` significa que el rol está declarado y el modelo se guarda, pero
   * todavía no hay nada que lo use. La interfaz lo dice: es la diferencia entre
   * configurar y creer que se ha configurado.
   */
  readonly consumer: string | null;
}

/**
 * Los roles del workflow.
 *
 * El orden es el de docs/04-PROVEEDORES.md §4.1: razonamiento, ejecución,
 * verificación y mecánicos.
 */
export const ROLES: readonly RoleSpec[] = [
  { id: "orchestrator", description: "Coordina, clasifica y decide a quién delegar", consumer: null },
  { id: "spec-author", description: "Escribe specs y briefs de feature", consumer: null },
  { id: "architect", description: "Diseño técnico y descomposición en tickets", consumer: null },
  { id: "critic", description: "Revisión adversarial de un candidato congelado", consumer: null },
  { id: "explorer", description: "Exploración de código en solo lectura", consumer: null },
  { id: "implementer", description: "Escribe el código según el plan aprobado", consumer: null },
  { id: "test-author", description: "Escribe y actualiza pruebas", consumer: null },
  { id: "doc-writer", description: "Documentación y manuales", consumer: null },
  {
    id: "gate-evaluator",
    description: "Responde las proposiciones de un gate",
    consumer: "valmen gate",
  },
  {
    id: "gate-judge",
    description: "Resuelve un gate cuando Jev no está disponible",
    consumer: "valmen gate --evaluator llm-judge",
  },
  { id: "verifier", description: "Verifica la implementación contra los criterios", consumer: null },
  { id: "classifier", description: "Clasifica tipo, módulo y riesgo de una solicitud", consumer: null },
  { id: "summarizer", description: "Resume para el reporte diario o semanal", consumer: null },
];

/** Un modelo asignado a un rol. */
export interface RoleRoute {
  readonly provider: string;
  readonly model: string;
  readonly effort: Effort;
}

/** Un preset: un conjunto coherente de decisiones de coste y calidad. */
export interface Preset {
  readonly id: string;
  readonly description: string;
  readonly roles: Readonly<Record<string, RoleRoute>>;
}

/**
 * Los presets incorporados.
 *
 * Los identificadores están verificados contra el catálogo de OpenRouter. Jev es
 * el evaluador en los tres a propósito: es el único que emite probabilidades
 * calibradas, y cambiarlo por un modelo de chat hace que el gate deje de ser
 * reproducible. Se puede cambiar, y la interfaz dice qué se pierde.
 */
export const PRESETS: readonly Preset[] = [
  {
    id: "quality",
    description: "Máxima calidad. Para trabajo crítico o cuando el coste no importa.",
    roles: {
      orchestrator: { provider: "openrouter", model: "openai/gpt-5.6-luna-pro", effort: "high" },
      "spec-author": { provider: "openrouter", model: "anthropic/claude-opus-4.6", effort: "high" },
      architect: { provider: "openrouter", model: "anthropic/claude-opus-4.6", effort: "high" },
      critic: { provider: "openrouter", model: "anthropic/claude-opus-4.6", effort: "high" },
      explorer: { provider: "openrouter", model: "anthropic/claude-sonnet-5", effort: "medium" },
      implementer: { provider: "openrouter", model: "anthropic/claude-sonnet-5", effort: "high" },
      "test-author": { provider: "openrouter", model: "anthropic/claude-sonnet-5", effort: "medium" },
      "doc-writer": { provider: "openrouter", model: "anthropic/claude-sonnet-5", effort: "medium" },
      "gate-evaluator": { provider: "openrouter", model: DEFAULT_GATE_EVALUATOR, effort: "auto" },
      "gate-judge": { provider: "openrouter", model: "anthropic/claude-opus-4.6", effort: "high" },
      verifier: { provider: "openrouter", model: "anthropic/claude-opus-4.6", effort: "high" },
      classifier: { provider: "openrouter", model: "z-ai/glm-5.3-flash", effort: "auto" },
      summarizer: { provider: "openrouter", model: "z-ai/glm-5.3-flash", effort: "auto" },
    },
  },
  {
    id: "balanced",
    description: "El equilibrio por defecto: razonamiento caro donde decide, ejecución barata donde repite.",
    roles: {
      orchestrator: { provider: "openrouter", model: "anthropic/claude-sonnet-5", effort: "medium" },
      "spec-author": { provider: "openrouter", model: "anthropic/claude-sonnet-5", effort: "medium" },
      architect: { provider: "openrouter", model: "anthropic/claude-sonnet-5", effort: "high" },
      critic: { provider: "openrouter", model: "anthropic/claude-sonnet-5", effort: "high" },
      explorer: { provider: "openrouter", model: "z-ai/glm-5.3-flash", effort: "auto" },
      implementer: { provider: "openrouter", model: "deepseek/deepseek-v4-flash", effort: "auto" },
      "test-author": { provider: "openrouter", model: "deepseek/deepseek-v4-flash", effort: "auto" },
      "doc-writer": { provider: "openrouter", model: "deepseek/deepseek-v4-flash", effort: "auto" },
      "gate-evaluator": { provider: "openrouter", model: DEFAULT_GATE_EVALUATOR, effort: "auto" },
      "gate-judge": { provider: "openrouter", model: DEFAULT_GATE_JUDGE, effort: "medium" },
      verifier: { provider: "openrouter", model: "moonshotai/kimi-k3", effort: "medium" },
      classifier: { provider: "openrouter", model: "z-ai/glm-5.3-flash", effort: "auto" },
      summarizer: { provider: "openrouter", model: "z-ai/glm-5.3-flash", effort: "auto" },
    },
  },
  {
    id: "economy",
    description: "Lo más barato que sigue funcionando. Para volumen alto y trabajo repetitivo.",
    roles: {
      orchestrator: { provider: "openrouter", model: "deepseek/deepseek-v4-flash", effort: "medium" },
      "spec-author": { provider: "openrouter", model: "deepseek/deepseek-v4-flash", effort: "medium" },
      architect: { provider: "openrouter", model: "deepseek/deepseek-v4-flash", effort: "medium" },
      critic: { provider: "openrouter", model: "moonshotai/kimi-k3", effort: "medium" },
      explorer: { provider: "openrouter", model: "z-ai/glm-5.3-flash", effort: "auto" },
      implementer: { provider: "openrouter", model: "z-ai/glm-5.3-flash", effort: "auto" },
      "test-author": { provider: "openrouter", model: "z-ai/glm-5.3-flash", effort: "auto" },
      "doc-writer": { provider: "openrouter", model: "z-ai/glm-5.3-flash", effort: "auto" },
      "gate-evaluator": { provider: "openrouter", model: DEFAULT_GATE_EVALUATOR, effort: "auto" },
      "gate-judge": { provider: "openrouter", model: DEFAULT_GATE_JUDGE, effort: "medium" },
      verifier: { provider: "openrouter", model: "deepseek/deepseek-v4-flash", effort: "medium" },
      classifier: { provider: "openrouter", model: "deepseek/deepseek-v4-flash", effort: "auto" },
      summarizer: { provider: "openrouter", model: "deepseek/deepseek-v4-flash", effort: "auto" },
    },
  },
];

/** El preset que se usa si el proyecto no elige ninguno. */
export const DEFAULT_PRESET = "balanced";

/** Obtiene un preset por identificador. */
export function presetById(id: string): Preset {
  const preset = PRESETS.find((candidato) => candidato.id === id);
  if (preset === undefined) {
    fail(
      `Preset desconocido: "${id}". Disponibles: ${PRESETS.map((p) => p.id).join(", ")}.`,
    );
  }
  return preset;
}

/** El routing declarado por un proyecto. */
export interface Routing {
  readonly preset: string;
  /** Solo los roles con override: el resto se resuelve por preset. */
  readonly roles: Readonly<Record<string, Partial<RoleRoute>>>;
}

/** De dónde salió el modelo de un rol. */
export type RouteSource = "proyecto" | "preset" | "sistema" | "sin-asignar";

/** Un rol con su modelo resuelto. */
export interface ResolvedRoute {
  readonly role: string;
  readonly description: string;
  readonly consumer: string | null;
  readonly provider: string;
  readonly model: string;
  readonly effort: Effort;
  readonly source: RouteSource;
  /**
   * `true` si el modelo de este rol es el único que emite probabilidades.
   *
   * Cambiarlo no rompe nada: cambia el evaluador de `jev` a un juez de chat, y
   * el gate pierde reproducibilidad. La interfaz lo advierte.
   */
  readonly probabilistic: boolean;
}

/** Analiza `.valmen/routing.yaml`. */
export function parseRouting(text: string): Routing {
  const config: ConfigMap = parseConfig(text);
  const preset = readString(config, "preset", DEFAULT_PRESET);
  // Se valida aquí y no al usarlo: un preset inexistente es un error del
  // archivo, y decirlo al leerlo señala la línea que hay que corregir.
  presetById(preset);

  const rolesConfig = readMap(config, "roles");
  const roles: Record<string, Partial<RoleRoute>> = {};

  for (const [role, valor] of Object.entries(rolesConfig)) {
    if (!ROLES.some((spec) => spec.id === role)) {
      fail(
        `routing.yaml: "${role}" no es un rol conocido. ` +
          `Los roles son: ${ROLES.map((spec) => spec.id).join(", ")}.`,
      );
    }
    if (typeof valor === "string") {
      // Forma corta: `architect: anthropic/claude-opus-4.6`.
      roles[role] = { provider: "openrouter", model: valor, effort: "auto" };
      continue;
    }
    if (Array.isArray(valor)) {
      fail(`routing.yaml: "${role}" debe ser un texto o un mapa, no una lista.`);
    }
    const effort = readString(valor, "effort", "auto");
    if (!EFFORTS.includes(effort as Effort)) {
      fail(
        `routing.yaml: el esfuerzo de "${role}" es "${effort}" y debe ser uno de: ` +
          `${EFFORTS.join(", ")}.`,
      );
    }
    roles[role] = {
      provider: readString(valor, "provider", "openrouter"),
      model: readString(valor, "model", ""),
      effort: effort as Effort,
    };
  }

  return { preset, roles };
}

/**
 * Resuelve el modelo de cada rol.
 *
 * La precedencia es la del diseño: el override del proyecto gana sobre el
 * preset, y el valor del sistema es el último recurso. La columna `source` es la
 * que hace visible esa precedencia en la pantalla: sin ella, un override
 * olvidado en el proyecto explicaría un cambio de preset que "no hace nada".
 */
export function resolveRouting(routing: Routing): ResolvedRoute[] {
  const preset = presetById(routing.preset);

  return ROLES.map((spec) => {
    const override = routing.roles[spec.id];
    const delPreset = preset.roles[spec.id];

    // El valor del sistema existe para los dos roles que el harness ya ejecuta:
    // sin él, un preset sin ese rol dejaría el gate sin modelo.
    const delSistema =
      spec.id === "gate-evaluator"
        ? { provider: "openrouter", model: DEFAULT_GATE_EVALUATOR, effort: "auto" as Effort }
        : spec.id === "gate-judge"
          ? { provider: "openrouter", model: DEFAULT_GATE_JUDGE, effort: "auto" as Effort }
          : undefined;

    const elegido = override ?? delPreset ?? delSistema;
    const source: RouteSource =
      override !== undefined
        ? "proyecto"
        : delPreset !== undefined
          ? "preset"
          : delSistema !== undefined
            ? "sistema"
            : "sin-asignar";

    return {
      role: spec.id,
      description: spec.description,
      consumer: spec.consumer,
      provider: elegido?.provider ?? "",
      model: elegido?.model ?? "",
      effort: elegido?.effort ?? "auto",
      source,
      probabilistic:
        spec.id === "gate-evaluator" &&
        (elegido?.model ?? "").startsWith("typesafe/"),
    };
  });
}

/** El modelo resuelto de un rol, o `null` si no tiene ninguno. */
export function routeFor(
  routes: readonly ResolvedRoute[],
  role: string,
): ResolvedRoute | null {
  return routes.find((ruta) => ruta.role === role) ?? null;
}

/** Ruta de `.valmen/routing.yaml`. */
export function routingPath(root: string): string {
  return join(root, ".valmen", "routing.yaml");
}

/**
 * El routing del proyecto.
 *
 * Un proyecto sin archivo usa el preset por defecto: no tener routing no es un
 * error, es no haber cambiado nada.
 */
export function readProjectRouting(root: string): Routing {
  let texto: string;
  try {
    texto = readFileSync(routingPath(root), "utf8");
  } catch {
    return { preset: DEFAULT_PRESET, roles: {} };
  }
  if (texto.trim() === "") return { preset: DEFAULT_PRESET, roles: {} };
  return parseRouting(texto);
}

/**
 * Los modelos que usará un gate en este proyecto.
 *
 * Es lo que convierte la pantalla de modelos en algo que hace algo: el modelo
 * del rol `gate-evaluator` viaja hasta la llamada real. Vive aquí, y no en el
 * servidor, porque el CLI ejecuta el mismo gate y tiene que resolver el mismo
 * modelo: si el botón y el comando usaran modelos distintos, el recibo de una
 * aprobación no describiría la otra.
 */
export interface GateRouting {
  readonly evaluatorModel: string;
  /** Por dónde hablar: el `provider` del rol, no solo el modelo. */
  readonly evaluatorProvider: string;
  readonly evaluatorEffort: Effort;
  /** Modelo del rol `gate-judge`, para la caída desde Jev. */
  readonly judgeModel: string;
  /** `true` si el evaluador configurado emite probabilidades. */
  readonly probabilistic: boolean;
  /** De dónde salió el modelo del evaluador. */
  readonly source: RouteSource;
}

/** Resuelve el routing que usará un gate en este proyecto. */
export function gateRoutingFor(root: string): GateRouting {
  const rutas = resolveRouting(readProjectRouting(root));
  const evaluador = rutas.find((ruta) => ruta.role === "gate-evaluator");
  const juez = rutas.find((ruta) => ruta.role === "gate-judge");

  return {
    evaluatorModel: evaluador?.model ?? DEFAULT_GATE_EVALUATOR,
    evaluatorProvider: evaluador?.provider ?? DEFAULT_PROVIDER,
    evaluatorEffort: evaluador?.effort ?? "auto",
    judgeModel: juez?.model ?? "",
    probabilistic: evaluador?.probabilistic ?? true,
    source: evaluador?.source ?? "sistema",
  };
}

/**
 * El modelo que descompone una feature en tickets.
 *
 * Es el rol `architect`, y se resuelve aparte del evaluador porque **no puede ser
 * el mismo modelo**: la compuerta de descomposición existe para revisar lo que
 * escribió el descomponedor, y un modelo revisándose a sí mismo no revisa nada.
 * Ver `docs/02-MOTOR.md` §5.
 */
export interface ArchitectRouting {
  readonly provider: string;
  readonly model: string;
  readonly effort: Effort;
  /** De dónde salió el modelo. */
  readonly source: RouteSource;
}

/** Resuelve el modelo que usará la descomposición en este proyecto. */
export function architectRoutingFor(root: string): ArchitectRouting {
  const rutas = resolveRouting(readProjectRouting(root));
  const arquitecto = rutas.find((ruta) => ruta.role === "architect");
  return {
    provider: arquitecto?.provider ?? DEFAULT_PROVIDER,
    model: arquitecto?.model ?? "",
    effort: arquitecto?.effort ?? "auto",
    source: arquitecto?.source ?? "sistema",
  };
}

/**
 * Genera el contenido de `.valmen/routing.yaml`.
 *
 * Lo que escribe la interfaz es exactamente esto, así que el archivo queda
 * legible y con la misma forma que el que escribiría una persona. Los
 * comentarios que hubiera antes se pierden: el archivo se regenera desde el
 * formulario, y la pantalla lo dice antes de guardar.
 */
export function renderRouting(routing: Routing): string {
  const preset = presetById(routing.preset);
  const lineas = [
    "# Routing de modelos por rol de workflow.",
    "#",
    "# Generado desde Mission Control. Los comentarios escritos a mano en este",
    "# archivo se pierden al guardarlo desde la aplicación: para conservarlos,",
    "# edítalo con un editor de texto y no desde la interfaz.",
    "",
    `preset: ${routing.preset}`,
    `# ${preset.description}`,
    "",
    "roles:",
  ];

  for (const role of Object.keys(routing.roles).sort()) {
    const ruta = routing.roles[role] as Partial<RoleRoute>;
    lineas.push(
      `  ${role}:`,
      `    provider: ${ruta.provider ?? "openrouter"}`,
      `    model: ${ruta.model ?? ""}`,
      `    effort: ${ruta.effort ?? "auto"}`,
    );
  }

  if (Object.keys(routing.roles).length === 0) {
    // Una lista vacía se escribe como `{}` para que el archivo sea YAML válido
    // para este parser: `roles:` sin nada debajo sería un mapa vacío, y el
    // parser lo admite, pero `{}` lo dice explícitamente.
    lineas[lineas.length - 1] = "roles: {}";
  }

  return lineas.join("\n") + "\n";
}
