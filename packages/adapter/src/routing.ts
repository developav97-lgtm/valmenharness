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

import { type ConfigMap, type PlaywrightConfig, parseConfig, readMap, readPlaywrightConfig, readString } from "./config.js";

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
 * Los roles que el harness **ejecuta**.
 *
 * Solo están los que tienen quién los consuma. Los otros nueve —`spec-author`,
 * `architect`, `critic`, `explorer`, `implementer`, `test-author`, `doc-writer`,
 * `verifier`, `classifier` y `summarizer`— se retiraron de aquí y de los presets
 * después de comprobar que **nadie los leía**: el harness los declaraba, la
 * pantalla los mostraba con selectores y botón de probar, y el trabajo real lo
 * ejecutaba el agente con su propio modelo. Una lista de doce roles donde nueve no
 * hacen nada es peor que una de tres: parece configuración activa.
 *
 * La razón de fondo es estructural y conviene tenerla escrita: **el harness no es
 * un runtime de agentes**. Declara el proceso, guarda el estado y evalúa
 * compuertas, y solo puede elegir el modelo de lo que él mismo ejecuta. El modelo
 * con el que trabaja opencode se configura en opencode.
 */
export const ROLES: readonly RoleSpec[] = [
  {
    id: "gate-evaluator",
    description: "Responde las proposiciones de un gate",
    consumer: "valmen gate",
  },
  {
    id: "gate-judge",
    description: "Resuelve un gate cuando Jev no puede decidir",
    consumer: "valmen gate --evaluator llm-judge",
  },
  {
    id: "orchestrator",
    description: "Propone cambios de configuración en el chat de Mission Control",
    consumer: "POST /api/chat/config",
  },
  {
    // El rol que **descompone una feature en tickets**. Estaba en el formato del
    // archivo y lo consumía `valmen feature decompose`, pero no estaba acá: ni la
    // pantalla lo ofrecía ni ningún preset le daba un modelo, así que descomponer
    // fallaba con «no hay modelo para el rol architect» en un proyecto recién
    // adoptado —y la pantalla que lo pide es la misma que no dejaba configurarlo—.
    id: "architect",
    description: "Descompone una feature en tickets, con su grafo y su cobertura",
    consumer: "valmen feature decompose",
  },
  // Los tres eslabones de la cascada verificada (R-S1-002). Son roles de
  // **ejecución** y no de evaluación, y por eso no existían: el harness declaraba
  // con qué modelo juzga, pero no con cuál produce ni a cuál escala. Los tres
  // tienen consumidor real —el evaluador `cascade` de `valmen gate`—, que es la
  // condición para figurar acá: un rol que nadie ejecuta parece configuración
  // activa y no lo es.
  {
    id: "producer",
    description: "Responde primero, con el modelo barato, lo que el verificador va a comprobar",
    consumer: "valmen gate --evaluator cascade",
  },
  {
    id: "verifier",
    description: "Comprueba contra el contexto la respuesta del productor, con probabilidades",
    consumer: "valmen gate --evaluator cascade",
  },
  {
    id: "escalation",
    description: "Responde otra vez lo que la verificación no respaldó",
    consumer: "valmen gate --evaluator cascade",
  },
  {
    // El rol que **escribe y mantiene los specs de interfaz**. Su modelo no sale
    // de un preset fijo sino de la sección `playwright:` de `.valmen/config.yaml`:
    // cada proyecto declara el suyo, y el rol existe para que ese modelo llegue al
    // enrutado con su origen `proyecto`. El consumidor es la resolución que viaja
    // al agente que trabaja un ticket de pruebas de interfaz.
    id: "ui-specs",
    description: "Escribe y mantiene los specs de interfaz del proyecto",
    consumer: "valmen routing show --role ui-specs",
  },
  // Los cuatro roles de **fase** del agente que ejecuta la jornada (R-JORN-006): análisis,
  // plan, implementación y verificación. Su proveedor es el del **ejecutor** (`codex`,
  // `claude-code`…) y su modelo el que ese cliente entiende; el despacho los lee con
  // `modeloDeFase` y los registra por sesión. Preparar un ticket no tiene por qué costar
  // como implementarlo: el modelo barato analiza y verifica, el fuerte planea e implementa.
  {
    id: "agent-analysis",
    description: "Modelo del agente que analiza un ticket en la fase de preparación",
    consumer: "valmen journey advance",
  },
  {
    id: "agent-plan",
    description: "Modelo del agente que escribe el plan en la fase de preparación",
    consumer: "valmen journey advance",
  },
  {
    id: "agent-implementation",
    description: "Modelo del agente que implementa un ticket aprobado en la fase de ejecución",
    consumer: "valmen journey advance",
  },
  {
    id: "agent-verification",
    description: "Modelo del agente que verifica y corrige las pruebas antes de entregar",
    consumer: "valmen journey advance",
  },
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
      orchestrator: {
        provider: "openrouter",
        model: "openai/gpt-5.6-luna-pro",
        effort: "high",
      },
      "gate-evaluator": {
        provider: "openrouter",
        model: DEFAULT_GATE_EVALUATOR,
        effort: "auto",
      },
      "gate-judge": {
        provider: "openrouter",
        model: "anthropic/claude-opus-4.6",
        effort: "high",
      },
      // Distinto del `gate-judge` a propósito, y no por gusto: si algún día la
      // cobertura se revisa con un modelo, el que revisa no puede ser el que
      // escribió el grafo. Hoy esa comprobación es de código, y la separación se
      // deja puesta igual.
      architect: {
        provider: "openrouter",
        model: "openai/gpt-5.6-luna-pro",
        effort: "high",
      },
      // La cascada del preset de máxima calidad: el productor sigue siendo barato
      // —es el punto del patrón— y el escalado es el modelo más fuerte del
      // catálogo.
      producer: { provider: "openrouter", model: DEFAULT_GATE_JUDGE, effort: "auto" },
      verifier: {
        provider: "openrouter",
        model: DEFAULT_GATE_EVALUATOR,
        effort: "auto",
      },
      escalation: {
        provider: "openrouter",
        model: "anthropic/claude-opus-4.6",
        effort: "high",
      },
      "ui-specs": {
        provider: "openrouter",
        model: "openai/gpt-5.6-luna-pro",
        effort: "high",
      },
      // Los roles de fase del agente de la jornada: barato donde repite, fuerte donde decide.
      "agent-analysis": { provider: "codex", model: "gpt-6-luna", effort: "medium" },
      "agent-plan": { provider: "codex", model: "gpt-6-sol", effort: "high" },
      "agent-implementation": { provider: "codex", model: "gpt-6-sol", effort: "high" },
      "agent-verification": { provider: "codex", model: "gpt-6-luna", effort: "medium" },
    },
  },
  {
    id: "balanced",
    description:
      "El equilibrio por defecto: razonamiento caro donde decide, ejecución barata donde repite.",
    roles: {
      orchestrator: {
        provider: "openrouter",
        model: "moonshotai/kimi-k3",
        effort: "medium",
      },
      "gate-evaluator": {
        provider: "openrouter",
        model: DEFAULT_GATE_EVALUATOR,
        effort: "auto",
      },
      "gate-judge": { provider: "openrouter", model: DEFAULT_GATE_JUDGE, effort: "medium" },
      architect: {
        provider: "openrouter",
        model: "moonshotai/kimi-k3",
        effort: "medium",
      },
      // El equilibrio, aplicado a la cascada: el productor es el modelo barato de
      // volumen y el escalado el equilibrado —el mismo que el arquitecto, que es
      // donde este preset pone el razonamiento de coste medio—.
      producer: {
        provider: "openrouter",
        model: "deepseek/deepseek-v4-flash",
        effort: "auto",
      },
      verifier: {
        provider: "openrouter",
        model: DEFAULT_GATE_EVALUATOR,
        effort: "auto",
      },
      escalation: {
        provider: "openrouter",
        model: "moonshotai/kimi-k3",
        effort: "medium",
      },
      "ui-specs": {
        provider: "openrouter",
        model: "moonshotai/kimi-k3",
        effort: "medium",
      },
      // Los roles de fase del agente de la jornada: barato donde repite, fuerte donde decide.
      "agent-analysis": { provider: "codex", model: "gpt-6-luna", effort: "medium" },
      "agent-plan": { provider: "codex", model: "gpt-6-sol", effort: "medium" },
      "agent-implementation": { provider: "codex", model: "gpt-6-sol", effort: "high" },
      "agent-verification": { provider: "codex", model: "gpt-6-luna", effort: "medium" },
    },
  },
  {
    id: "economy",
    description:
      "Lo más barato que sigue funcionando. Para volumen alto y trabajo repetitivo.",
    roles: {
      orchestrator: { provider: "openrouter", model: "z-ai/glm-5.3-flash", effort: "auto" },
      "gate-evaluator": {
        provider: "openrouter",
        model: DEFAULT_GATE_EVALUATOR,
        effort: "auto",
      },
      "gate-judge": { provider: "openrouter", model: DEFAULT_GATE_JUDGE, effort: "medium" },
      architect: {
        provider: "openrouter",
        model: "z-ai/glm-5.3-flash",
        effort: "auto",
      },
      // Lo más barato que sigue funcionando, en la cascada también: producir con
      // el modelo de volumen y escalar al que ya usa el juicio de reserva.
      producer: { provider: "openrouter", model: "z-ai/glm-5.3-flash", effort: "auto" },
      verifier: {
        provider: "openrouter",
        model: DEFAULT_GATE_EVALUATOR,
        effort: "auto",
      },
      escalation: {
        provider: "openrouter",
        model: "deepseek/deepseek-v4-flash",
        effort: "auto",
      },
      "ui-specs": {
        provider: "openrouter",
        model: "z-ai/glm-5.3-flash",
        effort: "auto",
      },
      // Los roles de fase del agente de la jornada: barato donde repite, fuerte donde decide.
      "agent-analysis": { provider: "codex", model: "gpt-6-luna", effort: "medium" },
      "agent-plan": { provider: "codex", model: "gpt-6-luna", effort: "medium" },
      "agent-implementation": { provider: "codex", model: "gpt-6-luna", effort: "high" },
      "agent-verification": { provider: "codex", model: "gpt-6-luna", effort: "medium" },
    },
  },
  {
    // Para un equipo que trabaja con la suscripción de Claude Code y no tiene
    // claves de API. Los cuatro roles van a Claude, incluido el evaluador: eso
    // **cambia el evaluador de `jev` a un juez de chat**, y el gate pierde
    // reproducibilidad —es el precio de no tener una clave de OpenRouter—. El
    // aviso lo da la interfaz sola, porque sale del modelo declarado y no de una
    // bandera escrita a mano.
    //
    // **No es ejecutable tal como está**: medido el 2026-10-05, por el camino directo
    // de `claude-code` solo `claude-haiku-4-5-20251001` responde, y los modelos de
    // abajo dan HTTP 429 «Error» aunque la sesión esté vigente. Se deja declarado
    // hasta que el PO decida (docs/04-PROVEEDORES.md, §1.1 y §4.3).
    id: "suscripcion",
    description:
      "Los planes que ya se pagan: Claude Code para todo. El gate pasa a juicio de un modelo.",
    roles: {
      orchestrator: {
        provider: "claude-code",
        model: "claude-sonnet-5",
        effort: "auto",
      },
      "gate-evaluator": {
        provider: "claude-code",
        model: "claude-sonnet-5",
        effort: "auto",
      },
      "gate-judge": {
        provider: "claude-code",
        model: "claude-sonnet-5",
        effort: "medium",
      },
      architect: {
        provider: "claude-code",
        model: "claude-opus-4-8",
        effort: "high",
      },
      // La cascada de este preset **no se puede ejecutar**, y se declara igual: el
      // verificador es Claude, que no emite probabilidades calibradas, así que
      // `cascadeRoutingFor` la rechaza con su motivo en vez de verificar con un
      // modelo tan flojo como el productor. Es la misma pérdida que ya declara el
      // evaluador de gates de este preset, dicha donde se usa.
      producer: { provider: "claude-code", model: "claude-sonnet-5", effort: "auto" },
      verifier: { provider: "claude-code", model: "claude-sonnet-5", effort: "auto" },
      escalation: { provider: "claude-code", model: "claude-opus-4-8", effort: "high" },
      "ui-specs": { provider: "claude-code", model: "claude-sonnet-5", effort: "auto" },
      // Los roles de fase del agente de la jornada: barato donde repite, fuerte donde decide.
      "agent-analysis": { provider: "claude-code", model: "claude-haiku-4-5-20251001", effort: "auto" },
      "agent-plan": { provider: "claude-code", model: "claude-sonnet-5", effort: "auto" },
      "agent-implementation": { provider: "claude-code", model: "claude-sonnet-5", effort: "high" },
      "agent-verification": { provider: "claude-code", model: "claude-haiku-4-5-20251001", effort: "auto" },
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

/** Lo que sale de analizar el archivo, con o sin tolerancia. */
export interface RoutingAnalizado {
  readonly routing: Routing;
  /**
   * Los roles que el archivo declara y el harness ya no ejecuta.
   *
   * Solo se llena en la lectura tolerante. En la estricta, el primero de ellos
   * detiene el análisis: no hay nada que devolver.
   */
  readonly retirados: readonly string[];
}

/**
 * Analiza `.valmen/routing.yaml`.
 *
 * **Rechaza un rol que no existe, y eso es deliberado**: guardarlo en silencio
 * haría creer que el proyecto configuró algo que nadie lee. Pero el mensaje tiene
 * que decir **qué hacer** —el caso que lo motivó es un archivo escrito cuando el
 * harness declaraba doce roles, con una clave que después se retiró, y el rechazo
 * detiene *todas* las compuertas del proyecto—.
 */
export function parseRouting(text: string): Routing {
  return analizarRouting(text, false).routing;
}

/**
 * La misma lectura, pero devolviendo los roles retirados en vez de fallar.
 *
 * Existe por una razón concreta y no para relajar el rechazo: **el error que se
 * quiere corregir es el que impide leer el archivo**. Una migración que tuviera
 * que arreglar un `routing.yaml` viejo no podría ni abrirlo con `parseRouting`,
 * así que necesita una lectura que tolere para poder reescribirlo. Quien lea el
 * archivo para *usarlo* sigue pasando por `parseRouting` y sigue recibiendo el
 * rechazo.
 */
export function parseRoutingTolerante(text: string): RoutingAnalizado {
  return analizarRouting(text, true);
}

/** El análisis, en los dos modos. Uno solo, para que no puedan discrepar. */
function analizarRouting(text: string, tolerante: boolean): RoutingAnalizado {
  const config: ConfigMap = parseConfig(text);
  const preset = readString(config, "preset", DEFAULT_PRESET);
  // Se valida aquí y no al usarlo: un preset inexistente es un error del
  // archivo, y decirlo al leerlo señala la línea que hay que corregir. Un preset
  // retirado no se tolera ni migrando: sin preset no hay de dónde resolver los
  // roles, y adivinar uno sería peor que decirlo.
  presetById(preset);

  const rolesConfig = readMap(config, "roles");
  const roles: Record<string, Partial<RoleRoute>> = {};
  const retirados: string[] = [];

  for (const [role, valor] of Object.entries(rolesConfig)) {
    if (!ROLES.some((spec) => spec.id === role)) {
      if (tolerante) {
        retirados.push(role);
        continue;
      }
      fail(
        `routing.yaml: "${role}" no es un rol del harness. ` +
          `Los roles vigentes son: ${ROLES.map((spec) => spec.id).join(", ")}. ` +
          `Comprueba que esté bien escrito; y si viene de una versión anterior, ` +
          `bórralo de .valmen/routing.yaml — los roles retirados no se ejecutan, ` +
          `así que la clave no hace nada y solo impide leer el resto del archivo.`,
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

  return { routing: { preset, roles }, retirados };
}

/**
 * Resuelve el modelo de cada rol.
 *
 * La precedencia es la del diseño: el override del proyecto gana sobre el
 * preset, y el valor del sistema es el último recurso. La columna `source` es la
 * que hace visible esa precedencia en la pantalla: sin ella, un override
 * olvidado en el proyecto explicaría un cambio de preset que "no hace nada".
 *
 * La sección `playwright:` de `config.yaml` entra como una declaración del
 * proyecto más: para el rol `ui-specs` gana a lo que venga del preset, pierde
 * contra el override de `routing.yaml` —el mismo rango que las otras dos— y se
 * resuelve con origen `proyecto` cuando es la fuente elegida.
 */
export function resolveRouting(
  routing: Routing,
  playwright: PlaywrightConfig | null = null,
): ResolvedRoute[] {
  const preset = presetById(routing.preset);

  return ROLES.map((spec) => {
    const override = routing.roles[spec.id];
    const delPreset = preset.roles[spec.id];

    // El valor del sistema existe para los dos roles que el harness ya ejecuta:
    // sin él, un preset sin ese rol dejaría el gate sin modelo.
    const delSistema =
      spec.id === "gate-evaluator"
        ? {
            provider: "openrouter",
            model: DEFAULT_GATE_EVALUATOR,
            effort: "auto" as Effort,
          }
        : spec.id === "gate-judge"
          ? { provider: "openrouter", model: DEFAULT_GATE_JUDGE, effort: "auto" as Effort }
          : undefined;

    // La declaración del proyecto para el rol de specs, solo si nombra un modelo.
    // El esfuerzo no se declara en la sección y queda `auto`.
    const dePlaywright =
      spec.id === "ui-specs" && playwright !== null && playwright.model !== ""
        ? { provider: playwright.provider, model: playwright.model, effort: "auto" as Effort }
        : undefined;

    const elegido = override ?? dePlaywright ?? delPreset ?? delSistema;
    const source: RouteSource =
      override !== undefined
        ? "proyecto"
        : dePlaywright !== undefined
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
      // Los dos roles que **verifican** —el evaluador de un gate y el verificador
      // de la cascada— son los únicos de los que importa que emitan
      // probabilidades. Cambiarlos por un modelo de chat no rompe nada, pero la
      // decisión deja de ser reproducible, y quien lee la advertencia tiene que
      // poder saberlo.
      probabilistic:
        (spec.id === "gate-evaluator" || spec.id === "verifier") &&
        (elegido?.model ?? "").startsWith("typesafe/"),
    };
  });
}

/** Las fases del agente de la jornada y el rol de enrutamiento de cada una. */
export const FASES_DEL_AGENTE = ["analysis", "plan", "implementation", "verification"] as const;
export type FaseDelAgente = (typeof FASES_DEL_AGENTE)[number];

/** El modelo con el que se lanza el ejecutor de una fase y de dónde salió. */
export interface ModeloDeFase {
  readonly model: string;
  readonly effort: string;
  /** `rol` si salió del enrutamiento; `politica` si cayó al modelo del ejecutor, con el motivo. */
  readonly origen: "rol" | "politica";
  readonly motivo: string;
}

/** El proveedor del enrutamiento que corresponde a cada ejecutor de la política. */
const PROVEEDOR_DEL_EJECUTOR: Readonly<Record<string, string>> = {
  codex: "codex",
  claude: "claude-code",
  opencode: "opencode",
};

/**
 * El modelo y el esfuerzo con los que se lanza el ejecutor de una fase (R-JORN-006).
 *
 * Se usa el del rol de la fase solo si su proveedor es el del ejecutor: un identificador de
 * otro proveedor no lo entiende el cliente. Si no coincide o el rol no tiene modelo, cae al
 * de la política y **lo dice**, porque un modelo que no es el declarado sin decirlo es
 * justo lo que impide auditar el costo.
 */
export function modeloDeFase(
  rutas: readonly ResolvedRoute[],
  fase: FaseDelAgente,
  ejecutor: { readonly id: string; readonly model: string; readonly effort: string },
): ModeloDeFase {
  const ruta = routeFor(rutas, `agent-${fase}`);
  const proveedor = PROVEEDOR_DEL_EJECUTOR[ejecutor.id] ?? ejecutor.id;
  if (ruta === null || ruta.model === "") {
    return { model: ejecutor.model, effort: ejecutor.effort, origen: "politica", motivo: `el rol agent-${fase} no tiene modelo` };
  }
  if (ruta.provider !== proveedor) {
    return {
      model: ejecutor.model,
      effort: ejecutor.effort,
      origen: "politica",
      motivo: `el rol agent-${fase} es del proveedor ${ruta.provider} y el ejecutor es ${ejecutor.id}`,
    };
  }
  return { model: ruta.model, effort: ruta.effort === "auto" ? ejecutor.effort : ruta.effort, origen: "rol", motivo: `rol agent-${fase} (${ruta.source})` };
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

/**
 * El enrutado del proyecto con otro preset.
 *
 * Existe para que el presupuesto pueda degradar el enrutado de **una** corrida sin
 * escribir configuración: el preset se sustituye en memoria y los roles que el
 * proyecto declaró a mano siguen ganando, porque degradar no es reescribir la
 * configuración de nadie —es elegir un preset para esta evaluación—.
 */
function routingConPreset(routing: Routing, preset: string | undefined): Routing {
  if (preset === undefined || preset === routing.preset) return routing;
  return { preset, roles: routing.roles };
}

export function gateRoutingFor(
  root: string,
  options: { readonly preset?: string } = {},
): GateRouting {
  const rutas = resolveRouting(
    routingConPreset(readProjectRouting(root), options.preset),
    playwrightConfigOf(root),
  );
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

/** El modelo resuelto del rol `ui-specs`. */
export interface UiSpecsRouting {
  readonly provider: string;
  readonly model: string;
  readonly effort: Effort;
  /** De dónde salió el modelo. */
  readonly source: RouteSource;
}

/**
 * El modelo que escribe y mantiene los specs de interfaz.
 *
 * Se resuelve leyendo la sección `playwright:` de `.valmen/config.yaml`, que es
 * donde el proyecto declara el modelo recomendado para los specs (R-S4-003), y
 * pasándola a `resolveRouting`: el override de `routing.yaml` sigue ganando, y la
 * sección da el valor del proyecto cuando no lo hay. Ver `docs/03-GATES.md`.
 */
export function uiSpecsRoutingFor(root: string): UiSpecsRouting {
  const rutas = resolveRouting(readProjectRouting(root), playwrightConfigOf(root));
  const specs = rutas.find((ruta) => ruta.role === "ui-specs");
  return {
    provider: specs?.provider ?? DEFAULT_PROVIDER,
    model: specs?.model ?? "",
    effort: specs?.effort ?? "auto",
    source: specs?.source ?? "sin-asignar",
  };
}

/**
 * La sección `playwright:` de `.valmen/config.yaml`, o `null`.
 *
 * Es la vía por la que el adaptador conoce la declaración sin depender del motor
 * —la lectura del archivo la hace el motor, que es su capa—. Un archivo ausente o
 * ilegible devuelve `null`: no tener sección no es un error, es no haber
 * declarado la capacidad.
 */
export function playwrightConfigOf(root: string): PlaywrightConfig | null {
  let texto: string;
  try {
    texto = readFileSync(join(root, ".valmen", "config.yaml"), "utf8");
  } catch {
    return null;
  }
  if (texto.trim() === "") return null;
  try {
    return readPlaywrightConfig(parseConfig(texto));
  } catch {
    // El archivo lo valida el motor en su camino; acá un error de forma no debe
    // romper la resolución de los demás roles.
    return null;
  }
}

/**
 * Un eslabón de la cascada, ya resuelto.
 *
 * `probabilistic` solo importa en el verificador, y se arrastra igual en los tres
 * para que quien lea la cadena no tenga que saber cuál de los tres roles tiene esa
 * propiedad.
 */
export interface CascadeStep {
  readonly role: string;
  readonly provider: string;
  readonly model: string;
  readonly effort: Effort;
  readonly source: RouteSource;
  readonly probabilistic: boolean;
}

/**
 * La cadena de la cascada verificada (R-S1-002).
 *
 * `reason` es `null` cuando la cadena se puede ejecutar, y el motivo cuando no. Se
 * devuelve el motivo en vez de fallar porque quien resuelve la cadena no siempre
 * puede decidir: la pantalla de modelos tiene que poder decir *por qué* esa
 * configuración no sirve para la cascada, y un error sin salida obliga a
 * adivinar. Quien la va a ejecutar —`valmen gate --evaluator cascade`— sí falla,
 * con este mismo texto.
 *
 * Las dos cadenas que se rechazan son las que harían del escalamiento una
 * ceremonia: escalar al modelo que ya respondió, y verificar con un modelo que no
 * emite probabilidades —tan flojo como el productor, así que su respaldo no
 * significa nada—.
 */
export interface CascadeRouting {
  readonly producer: CascadeStep;
  readonly verifier: CascadeStep;
  readonly escalation: CascadeStep;
  readonly reason: string | null;
}

/** Resuelve la cadena de la cascada, con el motivo cuando no se puede ejecutar. */
export function cascadeRoutingFor(
  root: string,
  options: { readonly preset?: string } = {},
): CascadeRouting {
  const rutas = resolveRouting(
    routingConPreset(readProjectRouting(root), options.preset),
    playwrightConfigOf(root),
  );
  const eslabon = (role: string): CascadeStep => {
    const ruta = rutas.find((candidato) => candidato.role === role);
    return {
      role,
      provider: ruta?.provider ?? DEFAULT_PROVIDER,
      model: ruta?.model ?? "",
      effort: ruta?.effort ?? "auto",
      source: ruta?.source ?? "sin-asignar",
      probabilistic: ruta?.probabilistic ?? false,
    };
  };

  const producer = eslabon("producer");
  const verifier = eslabon("verifier");
  const escalation = eslabon("escalation");

  return {
    producer,
    verifier,
    escalation,
    reason: motivoDeCadenaInutil(producer, verifier, escalation),
  };
}

/** El motivo por el que la cadena no se puede ejecutar, o `null` si se puede. */
function motivoDeCadenaInutil(
  producer: CascadeStep,
  verifier: CascadeStep,
  escalation: CascadeStep,
): string | null {
  for (const paso of [producer, verifier, escalation]) {
    if (paso.model === "") {
      return (
        `el rol ${paso.role} no tiene modelo: sin los tres eslabones la cascada no ` +
        `puede producir, verificar y escalar. Asígnalo en .valmen/routing.yaml o ` +
        `vuelve al preset con \`valmen routing set --preset <id>\`.`
      );
    }
  }

  if (producer.model === escalation.model) {
    return (
      `el rol producer y el rol escalation son el mismo modelo (${producer.model}): ` +
      `escalar a donde ya se preguntó no cambia la respuesta, y el recibo anotaría ` +
      `un escalamiento que no ocurrió. Declara en .valmen/routing.yaml un escalado ` +
      `distinto del productor.`
    );
  }

  if (!verifier.probabilistic) {
    return (
      `el rol verifier apunta a ${verifier.provider}/${verifier.model} y la ` +
      `verificación necesita probabilidades: un verificador que responde booleanos ` +
      `con confianza autoinformada es tan flojo como el productor, así que su ` +
      `respaldo no significaría nada. Apunta el rol verifier a un modelo de ` +
      `probabilidades —\`${DEFAULT_GATE_EVALUATOR}\`— o usa los evaluadores ` +
      `\`jev\` y \`llm-judge\` sin cascada.`
    );
  }

  return null;
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
