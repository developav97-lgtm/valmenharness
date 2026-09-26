/**
 * Las herramientas que el harness le ofrece a un agente.
 *
 * Es la pieza que faltaba para que el flujo no empiece en una terminal: alguien
 * abre una sesión de opencode o de codex como siempre, describe un problema, y
 * el agente **llama a estas herramientas** en vez de dictarle comandos a una
 * persona.
 *
 * Tres reglas gobiernan este archivo:
 *
 * 1. **Cada herramienta llama a la misma función que el comando del CLI.** No
 *    hay una segunda implementación de nada: las de validar, listar, mostrar y
 *    reanudar son literalmente las de `@valmen/cli`. Si el agente creara un
 *    ticket de una forma y el comando de otra, el registro dejaría de ser el
 *    mismo registro — y ese es justo el problema que el harness existe para
 *    resolver.
 * 2. **Un agente no puede aprobarse a sí mismo.** No hay herramienta para
 *    aprobar una compuerta: eso es una decisión humana, vive en la pantalla y
 *    en `gate-decide`. Un agente puede evaluar y puede leer el veredicto; la
 *    aprobación no se la puede dar.
 * 3. **Los errores se devuelven tal cual los produjo el motor.** Dicen qué falta
 *    y con qué código de salida, y parafrasearlos aquí le quitaría al agente
 *    exactamente lo que necesita para corregir.
 */
import { existsSync } from "node:fs";

import {
  EVIDENCE_KINDS,
  POINT_STATES,
  SEVERITIES,
  TICKET_TYPES,
  WORKFLOW_STATES,
  parseTicket,
  toFailure,
} from "@valmen/core";
import {
  CAMPOS_ORDENABLES,
  type RegistryPaths,
  type TicketFilters,
  type TicketRow,
  addEvidence,
  attachTicketToFeature,
  detachTicketFromFeature,
  renderAttachedTicket,
  addPoint,
  addRetest,
  closeAttempt,
  createTicket,
  filterTickets,
  findTicket,
  AREAS,
  type EstandarPropuesto,
  decideProposal,
  listProposals,
  renderColorReport,
  scanPendingColors,
  listTickets,
  loadMemory,
  addAiUsage,
  proposeStandard,
  renderProposals,
  standardsFiles,
  qaClose,
  qaStart,
  scanSecrets,
  readReceipts,
  runGate,
  simulateGate,
  renderHits,
  renderUsage,
  renderValue,
  ticketValueReport,
  renderDrift,
  scanDrift,
  materializeFeature,
  renderMaterialization,
  DECISIONES_APRENDIZAJE,
  classifyLearning,
  listLearnings,
  renderLearnings,
  saveLearning,
  searchMemory,
  summarize,
  usageReport,
  ticketsPath,
  transition,
} from "@valmen/engine";
import { gateFor, gateById } from "@valmen/gate";
import { architectRoutingFor, gateRoutingFor } from "@valmen/adapter";
import { apiKeyWithPrecedence } from "@valmen/credentials";
import {
  buildIndex,
  guardarConsumoDeSesiones,
  calibrateReport,
  deliverManifest,
  featureDecompose,
  featureList,
  featureShow,
  listProcesses,
  listProcessRuns,
  reportClosed,
  resumeTicket,
  scanPendingSecretsCommand,
  runProcessCommand,
  showProcess,
  showProcessRun,
  showTicket,
  validateAll,
  validateOne,
} from "@valmen/cli";

import type { ToolAnnotations, ToolDefinition, ToolResult } from "./protocol.js";

/** Lo que necesita una herramienta para trabajar. */
export interface ToolContext {
  readonly paths: RegistryPaths;
  /**
   * El archivo de credenciales de este servidor.
   *
   * El servidor MCP lo recibe por argumento al arrancar. Sin esto, la
   * evaluación de compuertas leería el del `$HOME` del proceso que lo lanzó
   * —que en un agente de código es el del usuario, pero no necesariamente el
   * que el proyecto configuró— y usaría una clave distinta sin decirlo.
   */
  readonly credentialsFile?: string | undefined;
  /**
   * Costura de inyección para las pruebas.
   *
   * Evaluar una compuerta de verdad cuesta una llamada a un proveedor, así que
   * sin esto la mitad del camino —la que escribe el recibo— no se podría probar
   * jamás de forma determinista, y una herramienta que solo se prueba en su
   * camino de error es una herramienta sin probar. Es la misma costura que
   * `runGate` expone y que usa Mission Control, con los mismos nombres, para que
   * no haya dos maneras de sustituir al evaluador.
   */
  readonly jev?: Parameters<typeof runGate>[1]["jev"];
  readonly judge?: Parameters<typeof runGate>[1]["judge"];
  readonly now?: (() => Date) | undefined;
}

function bien(texto: string, data?: Record<string, unknown>): ToolResult {
  return {
    text: texto.trimEnd(),
    isError: false,
    // Con la forma que exige `exactOptionalPropertyTypes`: una propiedad
    // opcional no se asigna `undefined`, se omite. Un `data: undefined` explícito
    // y una ausencia no son lo mismo para el protocolo, que decide con la
    // presencia del campo si emite `structuredContent`.
    ...(data === undefined ? {} : { data }),
  };
}

function mal(texto: string): ToolResult {
  return { text: texto.trimEnd(), isError: true };
}

/** Un texto obligatorio, o deja pasar el `undefined` si no lo es. */
function texto(
  args: Record<string, unknown>,
  nombre: string,
  obligatorio = true,
): string | undefined {
  const valor = args[nombre];
  if (typeof valor === "string" && valor.trim() !== "") return valor.trim();
  if (obligatorio) throw new Error(`Falta \`${nombre}\`, y es obligatorio.`);
  return undefined;
}

/**
 * El argumento que permite apuntar a otro proyecto.
 *
 * Se declara aquí y se inyecta en los ocho esquemas con `conRoot`, en vez de
 * repetirlo ocho veces. La repetición no era solo ruido: el `root` se leía en
 * `main.ts` desde el principio y **no estaba declarado en ninguno de los ocho**,
 * así que un cliente que validara el esquema lo rechazaba antes de llamar y el
 * agente concluía que no podía trabajar sobre otro repositorio. Un texto copiado
 * ocho veces se desincroniza; una función que lo inyecta, no.
 */
const ROOT = {
  type: "string",
  description:
    "Raíz del proyecto sobre el que operar. Existe para la sesión que trabaja " +
    "sobre dos repositorios a la vez: gana sobre el directorio de trabajo con el " +
    "que se lanzó el servidor. En el caso normal no hace falta.",
} as const;

/**
 * Arma el esquema de entrada de una herramienta.
 *
 * `additionalProperties: false` y `root` viven aquí, en un solo sitio: una
 * herramienta no puede quedar sin admitir otro proyecto por olvido, porque no
 * hay forma de declararla sin pasar por esta función.
 */
function conRoot(esquema: {
  readonly properties: Record<string, unknown>;
  readonly required?: readonly string[];
}): Record<string, unknown> {
  return {
    type: "object",
    properties: { ...esquema.properties, root: ROOT },
    ...(esquema.required === undefined ? {} : { required: [...esquema.required] }),
    additionalProperties: false,
  };
}

/**
 * Las cuatro formas que tiene una herramienta de este catálogo.
 *
 * Son cuatro constantes con nombre y no un objeto escrito treinta y cinco veces
 * por la misma razón que `ROOT` se inyecta en vez de copiarse: un criterio
 * repetido se desincroniza, y el que se desincroniza es el que nadie revisa. Acá
 * el criterio se escribe una vez y las herramientas lo **eligen**, así que
 * discrepar de él exige escribir un objeto entero a mano, que es exactamente el
 * acto deliberado que se busca.
 *
 * El criterio, en una línea cada uno:
 *
 * - **`SOLO_LEE`** — no escribe y no gasta. Es la única que un cliente puede
 *   auto-aprobar sin mirar, y por eso la segunda condición importa tanto como la
 *   primera: `simular_compuerta` no toca un archivo y sin embargo cuesta una
 *   llamada por ticket.
 * - **`ANEXA`** — solo agrega: un archivo nuevo o un bloque append-only. Es el
 *   invariante 4 del harness visto desde afuera, y es la razón por la que
 *   `destructiveHint` puede ser `false` sin mentir.
 * - **`REESCRIBE`** — cambia algo que ya existía: mueve un estado, reescribe un
 *   índice, cierra una decisión.
 * - **`GASTA`** — no toca el registro y sale del proyecto: llama a un proveedor
 *   de modelo. Separada de `SOLO_LEE` justamente para que «de solo lectura» no
 *   signifique «gratis».
 *
 * Las tres que no encajan en ninguna —`descomponer_feature`, `ejecutar_proceso`
 * e `indexar_registro`— declaran su objeto completo, y eso también dice algo: son
 * las que combinan cosas que las otras separan.
 */
const SOLO_LEE: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const ANEXA: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

const REESCRIBE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

const GASTA: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

/** El catálogo de herramientas. */
export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "crear_ticket",
    annotations: ANEXA,
    title: "Crear un ticket",
    description:
      "Da de alta un ticket en el registro del proyecto, en estado `intake`, a partir " +
      "de lo que la persona acaba de contar. Úsala cuando el pedido sea un cambio de " +
      "comportamiento, un arreglo o una funcionalidad — no para preguntas ni para " +
      "explorar código, que no dejan registro. Devuelve la ruta del archivo, que hay " +
      "que rellenar con el diagnóstico antes de evaluar la compuerta de análisis. El " +
      "identificador no se inventa: `<TIPO>-<MODULO>-<DESC>-<YYYYMMDD>`.",
    inputSchema: conRoot({
      properties: {
        id: {
          type: "string",
          description:
            "Identificador completo, en mayúsculas y sin tildes: " +
            "BUGFIX-POS-FILTRO-PARCIAL-20260922.",
        },
        title: { type: "string", description: "Título en una línea." },
        type: {
          type: "string",
          description: "Tipo del ticket. Tiene que ser el primer segmento del id.",
          enum: [
            "FEATURE",
            "BUGFIX",
            "IMPROVEMENT",
            "SYNC",
            "INTEGRATION",
            "AGENT",
            "SECURITY",
            "CHORE",
            "DOCS",
          ],
        },
        module: {
          type: "string",
          description: "Módulo afectado. Tiene que ser el segundo segmento del id.",
        },
        request: {
          type: "string",
          description:
            "La solicitud **literal** de quien la hizo, con sus palabras. Es lo que " +
            "después se compara con la investigación: no la resumas ni la mejores.",
        },
      },
      required: ["id", "title", "type", "module", "request"],
    }),
  },
  {
    name: "ver_ticket",
    annotations: SOLO_LEE,
    title: "Ver un ticket",
    description:
      "Devuelve el resumen del ticket: frontmatter, secciones y bloques. Es lo que hay " +
      "que leer antes de escribir el diagnóstico o el plan, y lo que dice si la " +
      "compuerta ya se evaluó. No lo confundas con el archivo: para editar secciones " +
      "se abre la ruta que devuelve `crear_ticket`. El frontmatter va **además** como " +
      "dato, para ramificar por estado sin interpretar prosa.",
    inputSchema: conRoot({
      properties: { id: { type: "string", description: "Identificador del ticket." } },
      required: ["id"],
    }),
    // Esta es una de las dos herramientas con `outputSchema`, y la razón es la
    // del archivo entero: el frontmatter no se proyecta aquí, se lee con el
    // **mismo** `parseTicket` de `@valmen/core` que usa el motor. No hay una
    // segunda lectura del contrato que pueda discrepar de la primera.
    outputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Identificador del ticket." },
        ruta: {
          type: "string",
          description: "Ruta absoluta del `ticket.md`, para abrirlo y editarlo.",
        },
        campos: {
          type: "object",
          description:
            "Los campos del frontmatter, tal cual están en disco y sin normalizar.",
        },
      },
      required: ["id", "ruta", "campos"],
      additionalProperties: false,
    },
  },
  {
    name: "listar_tickets",
    annotations: SOLO_LEE,
    title: "Listar tickets",
    description:
      "Lista los tickets del registro con su estado, su módulo y su título. Sin filtros " +
      "devuelve los activos, que es lo que hay que mirar antes de crear uno para no " +
      "duplicar trabajo. Con filtros contesta lo que antes había que ir a ver a la " +
      "pantalla: qué está bloqueado, qué toca este módulo, qué tiene puntos abiertos, " +
      "qué se cerró en un rango de fechas. Los filtros se combinan entre sí.",
    inputSchema: conRoot({
      properties: {
        estado: {
          type: "string",
          enum: [...WORKFLOW_STATES],
          description:
            "Estado del flujo de trabajo. `closed` es «cerrado», no «publicado».",
        },
        tipo: { type: "string", enum: [...TICKET_TYPES], description: "Tipo del ticket." },
        modulo: {
          type: "string",
          description: "Módulo, tal como está escrito en el ticket.",
        },
        texto: {
          type: "string",
          description:
            "Busca en identificador, título y módulo. No busca dentro de los bloques " +
            "JSON: encontrar una palabra en un bloque no significa que el ticket trate " +
            "de eso.",
        },
        incluir_cerrados: {
          type: "boolean",
          description:
            "Incluye los cerrados. Por defecto no: una lista de trabajo que empieza por " +
            "lo terminado esconde lo que falta.",
        },
        solo_criticos: {
          type: "boolean",
          description: "Solo los que declaran algún impacto crítico.",
        },
        solo_con_puntos: {
          type: "boolean",
          description: "Solo los que tienen puntos abiertos o en curso.",
        },
        desde: {
          type: "string",
          description: "Fecha inicial `YYYY-MM-DD`, incluida. Se usa con `hasta`.",
        },
        hasta: { type: "string", description: "Fecha final `YYYY-MM-DD`, incluida." },
        fecha: {
          type: "string",
          enum: ["updated", "created", "closedOn"],
          description:
            "Qué fecha se compara contra el rango. `closedOn` es la del cierre y es la " +
            "que hay que usar para contar lo que se terminó; `updated`, para lo que se " +
            "tocó. Un ticket cerrado el lunes y retocado el jueves aparece en los dos " +
            "rangos distintos, y ninguno de los dos está mal.",
        },
        orden: {
          type: "string",
          enum: [...CAMPOS_ORDENABLES],
          description: "Columna por la que ordenar. Por defecto, lo tocado hace menos.",
        },
        sentido: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sentido del orden.",
        },
        limite: { type: "number", description: "Devuelve solo los primeros n." },
      },
    }),
    outputSchema: {
      type: "object",
      properties: {
        total: { type: "number", description: "Cuántos cumplen el filtro." },
        enElRegistro: { type: "number", description: "Cuántos hay en total." },
        resumen: { type: "object", description: "El desglose de los que se devuelven." },
        tickets: {
          type: "array",
          items: { type: "object" },
          description: "Las filas, tal como se leen del motor.",
        },
      },
      required: ["total", "enElRegistro", "resumen", "tickets"],
      additionalProperties: false,
    },
  },
  {
    name: "validar_ticket",
    annotations: SOLO_LEE,
    title: "Validar un ticket",
    description:
      "Comprueba el ticket contra el contrato y devuelve el error exacto si no lo " +
      "cumple. Es determinista y no cuesta nada, así que hay que llamarlo **antes** de " +
      "evaluar una compuerta: una compuerta sobre un ticket inválido gasta una llamada " +
      "y su veredicto no dice nada.",
    inputSchema: conRoot({
      properties: {
        id: {
          type: "string",
          description: "Identificador del ticket. Sin él se validan todos.",
        },
      },
    }),
  },
  {
    name: "mover_ticket",
    annotations: REESCRIBE,
    title: "Mover el estado de un ticket",
    description:
      "Mueve el estado de un ticket según la tabla del contrato. Los movimientos " +
      "legales los decide el motor, no quien llama: un salto que la máquina no permite " +
      "se rechaza con el motivo. Mover un ticket **no** lo aprueba: para entrar a " +
      "`approved` tiene que existir antes la aprobación de una persona registrada.",
    inputSchema: conRoot({
      properties: {
        id: { type: "string" },
        to: {
          type: "string",
          description:
            "Estado destino: intake → analyzed → planned → approved → in_progress → " +
            "awaiting_user_tests → in_qa → qa_approved → closed.",
        },
        motivo: {
          type: "string",
          description:
            "Por qué se reabre. **Obligatorio** para volver de `closed` a " +
            "`changes_requested` —la única arista hacia atrás, y solo mientras el ticket " +
            "siga `unreleased`: una release publicada no se despublica— y rechazado en " +
            "cualquier otro movimiento, donde no significa nada.",
        },
      },
      required: ["id", "to"],
    }),
  },
  {
    name: "anotar_punto",
    annotations: ANEXA,
    title: "Anotar un hallazgo en el ticket",
    description:
      "Registra un punto en el ticket: algo que no coincide con lo que debía pasar. Sirve " +
      "para dejar constancia **cuando se descubre**, sin esperar al informe final, y es lo " +
      "que después se retestea. `actual` y `expected` van separados a propósito: juntos en " +
      "una frase, nadie puede decidir más tarde si el arreglo distingue los dos casos. El " +
      "identificador lo asigna el motor y lo devuelve; no se inventa.",
    inputSchema: conRoot({
      properties: {
        id: { type: "string", description: "Identificador del ticket." },
        title: { type: "string", description: "El hallazgo en una línea." },
        severity: {
          type: "string",
          enum: [...SEVERITIES],
          description:
            "Gravedad. `critical` es lo que rompe producción o pierde datos, y es lo que " +
            "después dispara el aviso de impacto.",
        },
        actual: {
          type: "string",
          description:
            "Lo que pasa hoy, observado. El valor que salió, el error exacto, el archivo " +
            "y la línea. Un hallazgo sin el dato concreto no se puede reproducir.",
        },
        expected: { type: "string", description: "Lo que debía pasar." },
        archivos: {
          type: "array",
          items: { type: "string" },
          description:
            "Los archivos que este hallazgo toca, relativos a la raíz del proyecto " +
            "(`BackEnd/pos/filters.py`). No son decorativos: son los que entran en el " +
            "hash de `worktree` que la referencia de QA puede usar, así que sin ellos " +
            "una prueba sobre trabajo sin commitear no se puede referenciar. Se " +
            "declaran al anotar porque es cuando se sabe dónde está.",
        },
      },
      required: ["id", "title", "severity", "actual", "expected"],
    }),
  },
  {
    name: "mover_punto",
    annotations: REESCRIBE,
    title: "Mover un punto por su máquina de estados",
    description:
      "Un punto tiene su propio ciclo, independiente del ticket: `open → analyzed → " +
      "in_progress → awaiting_retest → verified → closed`. No se cierra porque se " +
      "corrigió, se cierra cuando el retest lo confirma — y por eso `verified` no se " +
      "puede forzar: el motor exige un retest aprobado y confirmado por el PO. Los tres " +
      "estados terminales —`not_reproducible`, `deferred`, `duplicate`— están para no " +
      "dejar un punto abierto para siempre, y exigen `motivo`: sin él el registro dice " +
      "que algo se descartó sin decir por qué.",
    inputSchema: conRoot({
      properties: {
        id: { type: "string", description: "Identificador del ticket." },
        punto: { type: "string", description: "Identificador del punto, `POINT-001`." },
        to: { type: "string", enum: [...POINT_STATES], description: "Estado destino." },
        motivo: {
          type: "string",
          description:
            "Por qué se descarta. **Obligatorio** en los estados terminales y rechazado " +
            "en el resto: un motivo en un punto que sigue vivo no significa nada.",
        },
      },
      required: ["id", "punto", "to"],
    }),
  },
  {
    name: "anotar_evidencia",
    annotations: ANEXA,
    title: "Anotar evidencia de algo ya hecho",
    description:
      "Registra la prueba de algo que se hizo: el resultado de una prueba, una inspección " +
      "de código, un build, un despliegue. Es lo que convierte una afirmación en algo " +
      "verificable meses después —sin evidencia, «ya está probado» es solo una frase— y lo " +
      "que la compuerta de QA mira. Con `punto`, la evidencia queda además enlazada al " +
      "hallazgo que la originó, que es lo que mantiene coherente el bloque.",
    inputSchema: conRoot({
      properties: {
        id: { type: "string", description: "Identificador del ticket." },
        kind: {
          type: "string",
          enum: [...EVIDENCE_KINDS],
          description:
            "De qué clase es la prueba. `user-report` es lo que contó una persona; " +
            "`code-inspection` es lo que se leyó, no lo que se ejecutó. La lista es la " +
            "canónica del contrato a propósito: el contrato admite además extensiones " +
            "con prefijo `x-`, y esas se registran por el CLI " +
            "(`valmen add-evidence --kind x-…`), porque una extensión se justifica una " +
            "vez y no cada vez que alguien escribe una prueba.",
        },
        description: {
          type: "string",
          description:
            "Qué se hizo y qué dio, con el comando y su resultado. «Funciona» no es una " +
            "descripción: dentro de seis meses no dice qué se comprobó.",
        },
        reference: {
          type: "string",
          description:
            "La referencia que respalda la evidencia, con la forma que exige el contrato: " +
            "`commit:<sha40>`, o `worktree:sha256:<sha256>` en minúsculas, o la palabra " +
            "`worktree` para que la calcule el motor sobre los archivos que declaren los " +
            "puntos —así que sola exige que haya puntos con archivos—. Una ruta suelta no " +
            "sirve: no dice qué estado del código se probó.",
        },
        punto: {
          type: "string",
          description:
            "Punto al que pertenece, `POINT-001`. Opcional: hay evidencia del " +
            "ticket entero que no es de ningún punto.",
        },
      },
      required: ["id", "kind", "description"],
    }),
  },
  {
    name: "registrar_consumo_ia",
    annotations: ANEXA,
    title: "Registrar el consumo de IA de un ticket",
    description:
      "Anota en `## Consumo de IA` lo que costó una sesión que trabajó el ticket: sus " +
      "tokens y su costo, con la referencia que permite verificarlos. **El cierre no se " +
      "prepara sin esto**, así que es el último dato que falta antes de cerrar y el " +
      "primero que se olvida. Una entrada por sesión: si el ticket lo trabajó el " +
      "ejecutor y además lo verificó otro agente, van dos.\n\n" +
      "La fuente dice de dónde salieron los números y tiene que apuntar de verdad ahí: " +
      "`opencode:<ruta de opencode.db>`, `hermes:<ruta de su state.db>`, " +
      "`codex:<identificador de la sesión>` o `manual:<motivo>`, que es el caso " +
      "declarado de una sesión que no expone agregado de tokens. Un `hermes:` que " +
      "apunta a la base de OpenCode se rechaza: diría una cosa y mostraría otra.\n\n" +
      "Si una sesión sirvió **varios** tickets, se registra con `manual:` y sin " +
      "números, diciendo en las notas cuáles y dónde quedó su costo completo: repartir " +
      "a ojo sería un número inventado con forma de medición.",
    inputSchema: conRoot({
      properties: {
        id: { type: "string", description: "Identificador del ticket." },
        source: {
          type: "string",
          description:
            "`<origen>:<referencia>` — por ejemplo " +
            "`opencode:/Users/quien/.local/share/opencode/opencode.db`.",
        },
        confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
          description:
            "`high` cuando el número sale de la contabilidad de la herramienta —es un " +
            "registro—, `medium` cuando es una estimación. Un dato de sesión no es " +
            "`low`: si no hay número, se deja fuera y se explica en las notas.",
        },
        session_reference: {
          type: "string",
          description: "El identificador de la sesión, tal como lo nombra su herramienta.",
        },
        model: { type: "string", description: "`<proveedor>/<modelo>`." },
        input_tokens: { type: "number", description: "Tokens de entrada." },
        output_tokens: { type: "number", description: "Tokens de salida." },
        total_tokens: {
          type: "number",
          description: "Entrada + salida + razonamiento.",
        },
        estimated_cost_usd: {
          type: "number",
          description:
            "El costo en dólares. Se omite —no se pone cero— cuando el proveedor es " +
            "por suscripción: un cero se leería como «gratis».",
        },
        notes: {
          type: "string",
          description:
            "De qué agente es la sesión, cuántas intervenciones hizo y cualquier cosa " +
            "que haga falta para leer el número dentro de seis meses.",
        },
      },
      required: ["id", "source", "confidence"],
    }),
  },
  {
    name: "reanudar_ticket",
    annotations: SOLO_LEE,
    title: "Reanudar un ticket",
    description:
      "Devuelve el contexto de un ticket para retomar trabajo ya empezado: estado, QA, " +
      "release, cuántos puntos hay y —si el ticket viene de una feature— de cuál, con su " +
      "sprint, sus dependencias y dónde está la spec que le da los requisitos. Es lo " +
      "primero que conviene llamar al empezar una sesión sobre algo en curso. Sin `id`, " +
      "si hay más de un ticket activo **no elige**: devuelve la lista y hay que decidir cuál.",
    inputSchema: conRoot({
      properties: { id: { type: "string" } },
    }),
  },
  {
    name: "evaluar_compuerta",
    annotations: GASTA,
    title: "Evaluar una compuerta",
    description:
      "Evalúa una compuerta contra un ticket y devuelve el veredicto con su recibo: " +
      "aprobado, bloqueado, o en revisión humana. **No mueve el estado del ticket** — " +
      "un gate no cambia estados, esa es la regla — y no sustituye a la decisión de una " +
      "persona cuando el veredicto cae en la banda de revisión. Cuesta una llamada al " +
      "evaluador configurado en el routing del proyecto. El recibo va **además** como " +
      "dato, así que el veredicto se puede leer sin interpretar el informe.\n\n" +
      "**El ticket tiene que estar ya en el estado que la compuerta protege**, porque " +
      "cada una evalúa un artefacto terminado: `analysis` exige el ticket en `analyzed` " +
      "(con el diagnóstico escrito) y `plan` lo exige en `planned` (con el plan escrito). " +
      "Si se evalúa antes, se rechaza y no se gasta nada. La secuencia es: escribir la " +
      "sección, `validar_ticket`, `mover_ticket` al estado, y entonces evaluar.",
    inputSchema: conRoot({
      properties: {
        gate: {
          type: "string",
          description:
            "Compuerta a evaluar. `analysis` valida el diagnóstico y protege " +
            "`analyzed → planned`; `plan` valida el plan y protege `planned → approved`.",
          enum: ["analysis", "plan", "qa-mechanical"],
        },
        id: { type: "string", description: "Identificador del ticket." },
        evaluator: {
          type: "string",
          description:
            "Evaluador. `auto` usa el del routing del proyecto, que es lo normal. " +
            "`command` no llama a ningún modelo y solo corre los checks mecánicos.",
          enum: ["auto", "command", "jev", "llm-judge"],
        },
      },
      required: ["gate", "id"],
    }),
    // El recibo ya está en disco: el motor lo acaba de anexar. Devolverlo es
    // leerlo, no construir una segunda forma del veredicto. `null` cuando no se
    // pudo leer, y entonces el texto dice por qué — una forma estable no puede
    // depender de que el archivo esté donde se espera.
    outputSchema: {
      type: "object",
      properties: {
        recibo: {
          type: ["object", "null"],
          description:
            "El recibo que el motor acaba de anexar a `.valmen/receipts/`, con su " +
            "veredicto, sus proposiciones y su coste. `null` si no se pudo leer.",
        },
      },
      required: ["recibo"],
      additionalProperties: false,
    },
  },
  {
    name: "simular_compuerta",
    annotations: GASTA,
    title: "Medir una compuerta sobre el histórico",
    description:
      "Corre una compuerta sobre los tickets del registro y devuelve la distribución de " +
      "sus proposiciones y el coste. Sirve para **calibrar** —ver si una proposición " +
      "discrimina o si el gate manda todo a revisión—, no para decidir sobre un ticket " +
      "concreto. Cuesta una llamada por ticket evaluado.",
    inputSchema: conRoot({
      properties: {
        gate: { type: "string", enum: ["analysis", "plan", "qa-mechanical"] },
        limit: {
          type: "number",
          description: "Evalúa solo los primeros n tickets. Sin él, todos.",
        },
      },
      required: ["gate"],
    }),
  },
  {
    name: "ver_features",
    annotations: SOLO_LEE,
    title: "Ver las features del proyecto",
    description:
      "Sin `slug`, lista las features con su estado y su progreso. Con uno, devuelve " +
      "el brief y los artefactos: spec, diseño y el grafo de tickets si ya se " +
      "descompuso. Una feature es el registro de lo que excede a un ticket, así que " +
      "mirarla antes de trabajar es lo que evita descomponer a mano algo que ya está " +
      "descompuesto, o duplicar un ticket que ya existe en el grafo.",
    inputSchema: conRoot({
      properties: {
        slug: { type: "string", description: "Identificador de la feature. Opcional." },
      },
    }),
  },
  {
    name: "descomponer_feature",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    title: "Descomponer una feature en tickets",
    description:
      "Propone el grafo de tickets de una feature con el modelo del rol `architect` y " +
      "escribe `tickets.yaml`. Es la única herramienta que le pide a un modelo que " +
      "**escriba** un artefacto del registro, así que comprueba de más: los requisitos " +
      "salen de la spec y no del modelo, la respuesta se reescribe desde la estructura " +
      "validada, y el archivo resultante se relee con el mismo parser que leería uno " +
      "escrito a mano. Si algo no cuadra, no escribe nada. Cuesta una llamada al modelo " +
      "del rol `architect` —distinto del que evalúa las compuertas, a propósito—, así " +
      "que `dry_run` sirve para ver la propuesta sin gastarla dos veces.",
    inputSchema: conRoot({
      properties: {
        slug: { type: "string", description: "Identificador de la feature." },
        dry_run: {
          type: "boolean",
          description: "Muestra la descomposición sin escribirla ni avanzar el estado.",
        },
      },
      required: ["slug"],
    }),
  },
  {
    name: "ver_procesos",
    annotations: SOLO_LEE,
    title: "Ver los procesos declarados",
    description:
      "Sin `proceso`, lista los procesos que el proyecto declara en " +
      "`.valmen/processes/`. Con uno, muestra sus pasos y sus parámetros. Un proceso " +
      "es trabajo repetible con sus gates: mirarlo antes de correrlo es lo que dice si " +
      "va a hacer falta una persona en el medio y en qué paso.",
    inputSchema: conRoot({
      properties: {
        proceso: { type: "string", description: "Identificador del proceso. Opcional." },
      },
    }),
  },
  {
    name: "estado_proceso",
    annotations: SOLO_LEE,
    title: "Ver las corridas de procesos",
    description:
      "Sin `corrida`, lista las últimas: las detenidas van primero, que son las únicas " +
      "sobre las que hay algo que hacer. Con una, muestra su detalle paso a paso, " +
      "incluido dónde se detuvo y qué gate está esperando. Una corrida detenida no " +
      "está fallando: está esperando una decisión.",
    inputSchema: conRoot({
      properties: {
        corrida: { type: "string", description: "Identificador de la corrida. Opcional." },
      },
    }),
  },
  {
    name: "ejecutar_proceso",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    title: "Ejecutar un proceso",
    description:
      "Corre un proceso con sus parámetros y **se detiene en el primer gate sin " +
      "aprobar**: desde acá no hay forma de saltearlo. Los pasos son los que el " +
      "proyecto declaró en `.valmen/processes/`, no los que decide el agente, y la " +
      "decisión del gate la registra una persona en la pantalla. Si el proceso tiene " +
      "pasos que despliegan, esto los prepara y se detiene antes de ejecutarlos.",
    inputSchema: conRoot({
      properties: {
        proceso: { type: "string", description: "Identificador del proceso." },
        parametros: {
          type: "object",
          description:
            "Los parámetros del proceso, por nombre. Los que declara y no vengan acá " +
            "usan su valor por defecto.",
        },
      },
      required: ["proceso"],
    }),
  },
  {
    name: "reporte_cierres",
    annotations: SOLO_LEE,
    title: "Reporte de los tickets cerrados",
    description:
      "El reporte Markdown de lo cerrado en un rango, con el problema, la solución y " +
      "el rol afectado de cada ticket. El rango se cuenta por **fecha de cierre**, no " +
      "por última edición: un ticket cerrado el lunes y retocado el jueves pertenece " +
      "al lunes, y contarlo por edición lo movería de semana. Sin fechas, los últimos " +
      "treinta días.",
    inputSchema: conRoot({
      properties: {
        desde: { type: "string", description: "Fecha inicial `YYYY-MM-DD`, incluida." },
        hasta: { type: "string", description: "Fecha final `YYYY-MM-DD`, incluida." },
        tipo: { type: "string", enum: [...TICKET_TYPES], description: "Filtra por tipo." },
        texto: {
          type: "string",
          description: "Busca en título, problema, solución y rol afectado.",
        },
      },
    }),
  },
  {
    name: "calibrar_compuerta",
    annotations: GASTA,
    title: "Calibrar una compuerta contra el histórico",
    description:
      "Mide una compuerta sobre el registro y la contrasta con lo que registraron las " +
      "personas: cuántas veces coincidió, cuántos falsos aprobados y cuántos falsos " +
      "bloqueos. Es lo que convierte «el umbral está mal» en un número, y por eso es " +
      "una herramienta de decisión, no de trabajo: sirve para promover un gate de " +
      "híbrido a automático con evidencia. Cuesta una llamada al modelo por ticket " +
      "evaluado, así que `limite` no es un detalle.",
    inputSchema: conRoot({
      properties: {
        gate: {
          type: "string",
          enum: ["analysis", "plan", "qa-mechanical"],
          description: "Compuerta a medir.",
        },
        limite: {
          type: "number",
          description: "Evalúa solo los primeros n tickets. Sin él, todo el registro.",
        },
      },
      required: ["gate"],
    }),
  },
  {
    name: "manifiesto_entrega",
    annotations: ANEXA,
    title: "Escribir el manifiesto de una entrega",
    description:
      "Registra la versión y los tickets que entran en una entrega. Cada ticket tiene " +
      "que estar cerrado, ser visible al usuario y **no estar publicado todavía**: el " +
      "manifiesto describe lo que se va a entregar, y un ticket ya publicado pertenece " +
      "a otra entrega. No publica nada — eso exige el tag anotado sobre producción y " +
      "una persona—, así que es la mitad preparable del despliegue.",
    inputSchema: conRoot({
      properties: {
        version: { type: "string", description: "Versión SemVer, sin la `v`." },
        tickets: {
          type: "array",
          items: { type: "string" },
          description:
            "Los identificadores que entran. La lista es explícita: no se adivina.",
        },
        fecha: {
          type: "string",
          description: "Fecha de entrega `YYYY-MM-DD`. Por defecto, hoy.",
        },
        dry_run: { type: "boolean", description: "Muestra el manifiesto sin escribirlo." },
      },
      required: ["version", "tickets"],
    }),
  },
  {
    name: "indexar_registro",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    title: "Regenerar el índice del registro",
    description:
      "Regenera `index.md`, o comprueba con `comprobar` si está al día. El motor " +
      "reescribe el índice en cada mutación, así que esto repara la deriva que no vino " +
      "de él: un archivo copiado a mano, una operación interrumpida, o el índice " +
      "editado por alguien. Un índice viejo se lee como si fuera el estado, que es peor " +
      "que no tenerlo; la fuente de verdad sigue siendo cada ticket.",
    inputSchema: conRoot({
      properties: {
        comprobar: {
          type: "boolean",
          description: "No escribe: dice si está al día y sale con error si no lo está.",
        },
      },
    }),
  },
  {
    name: "revisar_secretos",
    annotations: SOLO_LEE,
    title: "Revisar secretos antes de commitear",
    description:
      "Busca credenciales en lo que está por entrar al repositorio —las líneas que el " +
      "cambio agrega, más los archivos nuevos— y en el texto que se le pase. Corra esto " +
      "**antes de commitear**: un secreto commiteado no se descommitea, queda en el " +
      "historial aunque el commit siguiente lo borre. El reporte ubica el hallazgo por " +
      "archivo, línea y tipo, y **nunca imprime el valor**: un detector que lo copia lo " +
      "multiplica. Si el hallazgo es legítimo —una prueba, un ejemplo, la documentación " +
      "de un formato— la línea se marca con `valmen:allow-secret` y deja de aparecer.",
    inputSchema: conRoot({
      properties: {
        staged: {
          type: "boolean",
          description:
            "Mira solo lo que está en el índice (`git add`), en vez de todo lo pendiente.",
        },
        texto: {
          type: "string",
          description:
            "Revisa este texto en vez del repositorio. Sirve para lo que se está por " +
            "escribir en un ticket o en un plan: ese texto viaja al proveedor del modelo " +
            "en la próxima evaluación, así que un secreto ahí ya salió.",
        },
      },
    }),
  },
  {
    name: "reporte_consumo",
    annotations: SOLO_LEE,
    title: "Cuánto costó y cuánto se decidió en código",
    description:
      "Cuenta lo que el harness ya escribió en sus recibos: evaluaciones, coste, " +
      "latencia, veredicto por compuerta, modelo usado y —lo que importa de verdad— " +
      "**cuánto se decidió en código y cuánto preguntándole a un modelo**. También " +
      "compara lo que dijo cada compuerta con lo que terminó diciendo una persona, que " +
      "es el número que permite promover un gate de híbrido a automático con evidencia " +
      "y no con opinión. Sin fechas, cuenta todo el registro.",
    inputSchema: conRoot({
      properties: {
        desde: { type: "string", description: "Fecha inicial `YYYY-MM-DD`, incluida." },
        hasta: { type: "string", description: "Fecha final `YYYY-MM-DD`, incluida." },
      },
    }),
    outputSchema: {
      type: "object",
      properties: {
        evaluaciones: { type: "number" },
        tickets: { type: "number" },
        costeUsd: { type: "number" },
        decididasEnCodigo: { type: "number" },
        calibracion: {
          type: "array",
          items: { type: "object" },
          description: "Un informe por compuerta, con su coincidencia y sus falsos.",
        },
      },
      required: ["evaluaciones", "tickets", "costeUsd", "decididasEnCodigo", "calibracion"],
      additionalProperties: false,
    },
  },
  {
    name: "revisar_drift",
    annotations: SOLO_LEE,
    title: "Lo que el ticket dice del código, contra el código",
    description:
      "Contrasta lo que un ticket cita —archivos, símbolos como `Modelo.campo`, y otros " +
      "tickets— contra lo que hay en el proyecto. **Sin modelo y sin adivinar**: mira las " +
      "secciones donde el ticket habla del código y comprueba cada cita. Sirve para lo que " +
      "más caro sale: un plan que apunta a un archivo que no existe o a un campo que el " +
      "modelo no tiene produce el cambio equivocado, y el error aparece al implementarlo o, " +
      "peor, al probarlo. Corré esto **antes de implementar**, con el ticket delante. Por " +
      "defecto mira los tickets en curso; `todos` incluye el histórico. No bloquea: avisa.",
    inputSchema: conRoot({
      properties: {
        id: {
          type: "string",
          description:
            "Un ticket concreto. Sin `id`, se revisan todos los que estén en curso.",
        },
        todos: {
          type: "boolean",
          description:
            "Incluir los tickets cerrados. Ahí lo que aparece es historia —un archivo que " +
            "el plan citaba y que después se renombró—, que se quiere poder ver pero no en " +
            "cada corrida.",
        },
      },
    }),
    outputSchema: {
      type: "object",
      properties: {
        hallazgos: { type: "number" },
        tickets: { type: "number" },
        revisados: { type: "number" },
        detalle: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ticket: { type: "string" },
              clase: { type: "string" },
              cita: { type: "string" },
              seccion: { type: "string" },
            },
            required: ["ticket", "clase", "cita", "seccion"],
            additionalProperties: false,
          },
        },
      },
      required: ["hallazgos", "tickets", "revisados", "detalle"],
      additionalProperties: false,
    },
  },
  {
    name: "reporte_valor",
    annotations: SOLO_LEE,
    title: "Qué costó y qué dejó cada ticket cerrado",
    description:
      "El consumo agregado dice cuánto se gastó; esto dice **en qué**. Toma los tickets " +
      "cerrados en un rango y pone, ticket por ticket, lo que costó —los recibos de " +
      "compuerta más las sesiones que el ticket registró al cerrarse— junto a lo que " +
      "dejó: compuertas aprobadas, ciclos de QA, y **cuántas veces el trabajo volvió " +
      "atrás**, que es la señal más barata de que el análisis se hizo a las prisas. " +
      "Ordenado por coste: el de arriba es el que hay que mirar. Es el informe para " +
      "responder «¿esto está sirviendo?» con números en vez de con impresiones.",
    inputSchema: conRoot({
      properties: {
        desde: { type: "string", description: "Fecha inicial `YYYY-MM-DD`, incluida." },
        hasta: { type: "string", description: "Fecha final `YYYY-MM-DD`, incluida." },
        limite: { type: "number", description: "Cuántas filas mostrar. Por defecto, 20." },
      },
    }),
    outputSchema: {
      type: "object",
      properties: {
        tickets: { type: "number" },
        costeTotalUsd: { type: "number" },
        costeMedioUsd: { type: ["number", "null"] },
        conVueltasAtras: { type: "array", items: { type: "string" } },
        costeParcial: { type: "array", items: { type: "string" } },
        aprobadasEnCodigo: { type: "number" },
        revertidasPorPersona: { type: "number" },
      },
      required: [
        "tickets",
        "costeTotalUsd",
        "costeMedioUsd",
        "conVueltasAtras",
        "costeParcial",
        "aprobadasEnCodigo",
        "revertidasPorPersona",
      ],
      additionalProperties: false,
    },
  },
  {
    name: "buscar_memoria",
    annotations: SOLO_LEE,
    title: "Buscar en la memoria del proyecto",
    description:
      "Busca en lo que el proyecto ya decidió y ya falló: sus documentos de decisiones y " +
      "de errores, más lo que el harness haya aprendido. **Usala antes de diagnosticar** " +
      "un ticket, con el módulo y el síntoma: el problema que estás por investigar puede " +
      "estar resuelto desde hace meses, con la causa raíz escrita y el porqué de la " +
      "decisión. Buscar acá cuesta una llamada; no buscar cuesta rediagnosticar algo que " +
      "alguien ya pagó por entender. Devuelve candidatos con su archivo y su línea —el " +
      "identificador y el título pesan más que el cuerpo—, y no exige que aparezcan todas " +
      "las palabras: leé los que salgan y decidí.",
    inputSchema: conRoot({
      properties: {
        consulta: {
          type: "string",
          description:
            "Qué se busca, en las palabras del dominio: «bulk_create pierde registros en " +
            "la cola», «natural keys en sync». Una descripción del problema funciona mejor " +
            "que una sola palabra.",
        },
        limite: { type: "number", description: "Cuántos resultados. Por defecto, 5." },
      },
      required: ["consulta"],
    }),
  },
  {
    name: "guardar_aprendizaje",
    annotations: ANEXA,
    title: "Guardar un aprendizaje en la memoria",
    description:
      "Anexa un aprendizaje al registro del proyecto —lo que este trabajo enseñó y no " +
      "estaba escrito en ninguna parte: una causa raíz que costó encontrar, una decisión " +
      "con su porqué, un patrón que se repite—. Guardalo **cuando lo descubrís**, no al " +
      "final: lo que se escribe tres días después pierde el detalle que lo hacía útil. " +
      "No reemplaza al ticket: el ticket cuenta qué pasó con un pedido, y esto cuenta qué " +
      "hay que saber para el próximo.",
    inputSchema: conRoot({
      properties: {
        titulo: {
          type: "string",
          description: "El aprendizaje en una línea, como se busca después.",
        },
        cuerpo: {
          type: "string",
          description:
            "Qué se aprendió y por qué importa. Con las palabras del dominio —archivos, " +
            "síntomas, causas— porque es lo que después se busca.",
        },
        tickets: {
          type: "array",
          items: { type: "string" },
          description: "Los tickets donde se aprendió, si los hay.",
        },
      },
      required: ["titulo", "cuerpo"],
    }),
  },
  {
    name: "revisar_aprendizajes",
    annotations: REESCRIBE,
    title: "La cola de aprendizajes: qué hacer con lo aprendido",
    description:
      "La memoria tiene entrada y salida. **Entrada**: guardás lo que el trabajo te enseñó con " +
      "`guardar_aprendizaje`, cuando lo descubrís. **Salida**: esto. Sin id, devuelve la cola " +
      "de lo que espera clasificación; con id y decisión, la clasifica. Las tres salidas no " +
      "son lo mismo: `regla` convierte el aprendizaje en una **propuesta de estándar** —no " +
      "escribe ninguna regla: eso lo decide una persona con sus palabras, igual que " +
      "cualquier propuesta—; `caso` lo deja como documentación de algo que pasó; y " +
      "`descartar` lo marca y lo conserva, para que el próximo agente no vuelva a proponer " +
      "lo mismo. Clasificar es triaje, es reversible y no pone nada en vigor: podés hacerlo " +
      "vos. No lo dejes crecer: una cola que nadie mira es una memoria sin criterio.",
    inputSchema: conRoot({
      properties: {
        id: {
          type: "string",
          description: "El aprendizaje (`AP-001`). Sin `id`, se devuelve la cola.",
        },
        decision: {
          type: "string",
          enum: [...DECISIONES_APRENDIZAJE],
          description: "Qué se hace con él. Obligatoria cuando hay `id`.",
        },
        area: {
          type: "string",
          enum: [...AREAS],
          description:
            "Para `regla`: a qué área pertenece el estándar que sale. Por defecto, `proceso`.",
        },
      },
    }),
  },
  {
    name: "ver_estandares",
    annotations: SOLO_LEE,
    title: "Los estándares del proyecto",
    description:
      "Las reglas que el proyecto ya decidió sobre cómo se ve y cómo se escribe: " +
      "alineación, formato de montos, tema claro y oscuro, qué campo usa autocompletado, " +
      "convenciones de código. Están en el `AGENTS.md` que leés al empezar, así que esto " +
      "es para consultarlas enteras cuando el trabajo toque una pantalla o un modelo. " +
      "Devuelve además las propuestas pendientes: una regla sin aprobar no está en vigor.",
    inputSchema: conRoot({ properties: {} }),
  },
  {
    name: "proponer_estandar",
    annotations: ANEXA,
    title: "Proponer un estándar",
    description:
      "Propone una convención para que el proyecto la adopte. **Usala cuando el trabajo " +
      "enseñe algo que no está escrito**: porque hubo que aclararlo dos veces, porque una " +
      "corrección reveló que la regla existía solo en la cabeza de alguien, o porque " +
      "apareció un caso que ninguna regla cubre. Escribí la regla en imperativo y el " +
      "motivo con el caso concreto que la originó —el motivo es lo que permite discutirla " +
      "después— y pasá los tickets donde apareció. **La propuesta no está en vigor**: la " +
      "aprueba una persona —desde Mission Control, o pidiéndote que la aceptes, con " +
      "`decidir_estandar`— y al aprobarla entra al `AGENTS.md`. No la apliques como si ya " +
      "fuera una regla del proyecto.",
    inputSchema: conRoot({
      properties: {
        titulo: {
          type: "string",
          description: "La convención en una línea, como se busca después.",
        },
        regla: {
          type: "string",
          description:
            "La regla en imperativo y sin ambigüedad: «los montos llevan siempre dos " +
            "decimales», no «convendría revisar los montos».",
        },
        motivo: {
          type: "string",
          description:
            "El caso que la motivó. Es lo que permite decidir si sigue teniendo sentido " +
            "dentro de un año.",
        },
        area: {
          type: "string",
          enum: [...AREAS],
          description:
            "Dónde aplica: `presentacion` (cómo se ve), `backend` (cómo se escribe), " +
            "`datos` (modelos y migraciones), `proceso` (cómo se trabaja).",
        },
        tickets: {
          type: "array",
          items: { type: "string" },
          description: "Los tickets donde apareció la necesidad.",
        },
      },
      required: ["titulo", "regla", "motivo", "area"],
    }),
  },
  {
    name: "decidir_estandar",
    annotations: REESCRIBE,
    title: "Aceptar o descartar un estándar propuesto",
    description:
      "Cierra una propuesta de estándar: `aceptado` escribe la regla en " +
      "`.valmen/rules/estandares-<área>.md` y la **pone en vigor** —el próximo `valmen " +
      "sync` la lleva al `AGENTS.md`—; `descartado` la saca de la cola dejándola escrita " +
      "con su estado. **La decisión es de la persona, no tuya**: `instruccion` lleva sus " +
      "palabras literales, tal como las dijo («aceptá las que propusiste»), y queda " +
      "escrita junto a la decisión. Si no te dio una frase —porque no lo pidió, porque " +
      "no contestó, porque insinuó— no la escribas: pedile que lo decida. Un estándar " +
      "aceptado sin que nadie lo haya pedido es una regla que el proyecto nunca decidió. " +
      "Con `pendientes` como id se aplican todas las que estén sin decidir, que es lo que " +
      "quien dice «aceptalos» está pidiendo.",
    inputSchema: conRoot({
      properties: {
        id: {
          type: "string",
          description:
            "El identificador de la propuesta (`EST-001`), o `pendientes` para todas " +
            "las que falten decidir.",
        },
        decision: {
          type: "string",
          enum: ["aceptado", "descartado"],
          description: "`aceptado` la pone en vigor; `descartado` la deja sin efecto.",
        },
        instruccion: {
          type: "string",
          description:
            "Las palabras **literales** de quien decidió. Obligatoria en las dos " +
            "direcciones: sin la frase de la persona, la decisión no ocurrió.",
        },
      },
      required: ["id", "decision", "instruccion"],
    }),
  },
  {
    name: "revisar_presentacion",
    annotations: SOLO_LEE,
    title: "Colores fijos en lo que estás por entregar",
    description:
      "Revisa las líneas que el cambio agrega a los archivos de interfaz y avisa de los " +
      "colores escritos a mano —hexadecimales, `rgb()/hsl()`, nombres de color, clases de " +
      "paleta—. Existe porque un color fijo es lo que rompe el modo oscuro: la tarjeta " +
      "blanca se ve perfecta en claro y deja un rectángulo cegador en oscuro, y quien la " +
      "escribió no lo vio porque probó en claro. **No bloquea**: hay colores legítimos " +
      "(marca, impresión, el negro translúcido de una sombra). Los que lo sean se marcan " +
      "en la línea con `valmen:allow-color` y su motivo. Corré esto antes de entregar " +
      "cuando el cambio toque pantallas, no solo cuando alguien lo pida.",
    inputSchema: conRoot({
      properties: {
        staged: {
          type: "boolean",
          description:
            "Mirar solo lo que está en el índice (`git add`), no todo el cambio.",
        },
      },
    }),
  },
  {
    name: "materializar_feature",
    // No encaja en ningún preset: escribe, pero **solo agrega** —un ticket que ya
    // existe no se toca— y repetirla deja el mismo registro. Las tres cosas a la
    // vez no las declara ninguna de las cuatro constantes, y forzarla en `ANEXA`
    // diría que no es idempotente cuando sí lo es.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    title: "Escribir los tickets de una feature en el registro",
    description:
      "Descomponer una feature deja un **plan**: un `tickets.yaml` con sprints, " +
      "identificadores, dependencias y qué requisito cubre cada ticket. Un plan no es " +
      "trabajo. Esta herramienta escribe en el registro los tickets del grafo que falten, " +
      "para que existan, estén en `intake` y se puedan trabajar. **Un ticket que ya existe " +
      "no se toca** —volver a correrlo no pisa nada— y un grafo con requisitos sin cubrir " +
      "se rechaza: escribir esa descomposición dejaría tickets con la cobertura a medias. " +
      "La solicitud de cada ticket se arma con las palabras de la spec —los requisitos que " +
      "el grafo dice que cubre— y el objetivo de su sprint.",
    inputSchema: conRoot({
      properties: {
        slug: { type: "string", description: "El identificador de la feature." },
        dryRun: {
          type: "boolean",
          description: "Decir qué crearía, sin escribir nada.",
        },
      },
      required: ["slug"],
    }),
    outputSchema: {
      type: "object",
      properties: {
        creados: { type: "array", items: { type: "string" } },
        yaEstaban: { type: "array", items: { type: "string" } },
      },
      required: ["creados", "yaEstaban"],
      additionalProperties: false,
    },
  },
  {
    name: "anexar_ticket_a_feature",
    // Anexar y quitar son la misma operación sobre el mismo archivo y ninguna de
    // las dos es destructiva para el ticket: sacarlo del grafo no lo borra del
    // registro.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    title: "Anexar un ticket a una feature (o sacarlo)",
    description:
      "Mete en el grafo de una feature un ticket que **ya existe** en el registro, para que " +
      "cuente en su tablero, herede su spec y no quede suelto. Es lo que hace falta cuando " +
      "los hallazgos de una pantalla desbordan el tope de puntos de su ticket y hay que " +
      "abrir otro: el trabajo es de la misma funcionalidad y tiene que seguir viéndose " +
      "junto. **No toca el ticket**: el grafo dice qué tickets son de la feature y el " +
      "registro dice en qué estado está cada uno. Con `sprint` que no exista hace falta " +
      "`goal`: un sprint sin objetivo es una fila vacía en el tablero. Con `quitar: true` " +
      "lo saca del grafo —y falla si algún otro ticket declara depender de él—.",
    inputSchema: conRoot({
      properties: {
        slug: { type: "string", description: "El identificador de la feature." },
        ticket: { type: "string", description: "El identificador del ticket." },
        sprint: {
          type: "string",
          description:
            "El sprint al que entra, `S6`. Sin él va al último. Uno que no exista se " +
            "crea, y entonces `goal` es obligatorio.",
        },
        goal: {
          type: "string",
          description: "El objetivo del sprint, si hay que crearlo.",
        },
        depends_on: {
          type: "array",
          items: { type: "string" },
          description:
            "Los tickets de los que depende, que tienen que estar ya en el grafo.",
        },
        quitar: {
          type: "boolean",
          description: "Sacarlo del grafo en vez de anexarlo.",
        },
      },
      required: ["slug", "ticket"],
    }),
  },
  {
    name: "iniciar_qa",
    annotations: ANEXA,
    title: "Abrir un ciclo de QA",
    description:
      "Abre el ciclo de QA de un ticket que está `in_qa`, con el ambiente y la referencia " +
      "de lo que se va a probar. Los dos son obligatorios y trazables porque el ciclo no " +
      "se puede cerrar sin ellos: «lo probé en mi máquina» no es un ambiente, y una " +
      "prueba sin referencia no dice qué código se probó. Se abre una vez y se cierra una " +
      "vez, en ese orden.",
    inputSchema: conRoot({
      properties: {
        id: { type: "string", description: "Identificador del ticket." },
        ambiente: {
          type: "string",
          description: "Dónde se prueba: sistema, versión, datos. Concreto y repetible.",
        },
        referencia: {
          type: "string",
          description:
            "Qué se prueba, con la forma que exige el contrato: `commit:<sha40>`, o " +
            "`worktree:sha256:<sha256>`, o la palabra `worktree` para que la calcule el " +
            "motor sobre los archivos que declaren los puntos. Esa última es la " +
            "referencia del trabajo que todavía no es un commit, y exige dos cosas: que " +
            "algún punto declare `archivos`, y que git los conozca. Con el trabajo ya " +
            "commiteado, el commit es más directo.",
        },
      },
      required: ["id", "ambiente", "referencia"],
    }),
  },
  {
    name: "anotar_retest",
    annotations: ANEXA,
    title: "Anotar el resultado de un retest",
    description:
      "Registra el retest de un punto dentro del ciclo de QA abierto. El punto tiene que " +
      "estar `awaiting_retest`. Un resultado `approved` lo mueve a `verified` y exige la " +
      "confirmación literal de quien lo aprobó; un hallazgo lo devuelve a `in_progress`. " +
      "`pending` no mueve el punto: deja constancia de que se retestó sin veredicto " +
      "todavía, que es distinto de no haberlo probado.",
    inputSchema: conRoot({
      properties: {
        id: { type: "string", description: "Identificador del ticket." },
        punto: { type: "string", description: "Identificador del punto, `POINT-001`." },
        resultado: {
          type: "string",
          enum: ["pending", "approved", "changes_requested", "failed"],
          description: "Quién retestó no se declara aparte: va en la confirmación.",
        },
        confirmacion_po: {
          type: "string",
          description:
            "Las palabras literales de quien aprobó el retest. **Obligatoria** si el " +
            "resultado es `approved`, y no la escribas vos: si no la tenés, el retest " +
            "todavía no está aprobado.",
        },
      },
      required: ["id", "punto", "resultado"],
    }),
  },
  {
    name: "cerrar_qa",
    annotations: ANEXA,
    title: "Cerrar el ciclo de QA",
    description:
      "Cierra el ciclo abierto con su resultado. `changes_requested` y `failed` son " +
      "hallazgos, y lo que se encontró va **además** como punto con `anotar_punto`: el " +
      "ciclo registra el veredicto, el punto registra el defecto. `approved` es el " +
      "veredicto de que el ticket quedó bien y no lo emite un agente — exige " +
      "`confirmacion_po` con las palabras literales de quien aprobó. Si no tenés esa " +
      "frase, la aprobación no ocurrió: pedila, no la escribas.",
    inputSchema: conRoot({
      properties: {
        id: { type: "string", description: "Identificador del ticket." },
        resultado: {
          type: "string",
          enum: ["approved", "changes_requested", "failed"],
          description: "Veredicto del ciclo.",
        },
        confirmacion_po: {
          type: "string",
          description:
            "Las palabras literales de quien aprobó. **Obligatoria** con `approved`.",
        },
      },
      required: ["id", "resultado"],
    }),
  },
  {
    name: "preparar_cierre",
    annotations: ANEXA,
    title: "Registrar el intento de cierre",
    description:
      "Escribe el intento de cierre: los dos resúmenes, el estado de QA y el impacto de " +
      "release. Es lo que habilita `mover_ticket` a `closed`, y no lo sustituye — el " +
      "motor exige además que el cierre sea coherente con QA. Los resúmenes son para " +
      "quien lea el ticket dentro de un año: dicen qué cambió y qué gana quien lo usa, no " +
      "qué archivos se tocaron. `qa: waived` exime la prueba y por eso exige motivo y " +
      "confirmación literal del PO.",
    inputSchema: conRoot({
      properties: {
        id: { type: "string", description: "Identificador del ticket." },
        resumen_tecnico: {
          type: "string",
          description: "Qué se cambió y cómo, en términos de quien mantiene el código.",
        },
        resumen_funcional: {
          type: "string",
          description: "Qué gana quien usa el sistema, en sus términos.",
        },
        qa: {
          type: "string",
          enum: ["approved", "waived"],
          description:
            "`approved` cuando hay ciclo cerrado y confirmado; `waived` para eximir la " +
            "prueba, que es una decisión de la persona y no del agente.",
        },
        impacto_release: {
          type: "string",
          description:
            "Qué pasa con la release: si queda `unreleased` o entra en cuál. Es lo que " +
            "después decide si el ticket se puede reabrir.",
        },
        motivo_exencion: {
          type: "string",
          description: "Por qué se exime la prueba. **Obligatorio** con `qa: waived`.",
        },
        confirmacion_po: {
          type: "string",
          description:
            "Las palabras literales de quien autoriza. **Obligatoria** con `qa: waived`.",
        },
      },
      required: ["id", "resumen_tecnico", "resumen_funcional", "qa", "impacto_release"],
    }),
  },
];

/**
 * El `CommandResult` del motor, traducido a resultado de herramienta.
 *
 * Un código distinto de cero **no siempre es un fallo**, y confundirlos costó un
 * fallo real en producción: el gate de análisis devolvía `3` con el informe
 * completo en `stdout` y el `stderr` vacío —el 3 significa «bloquea», no «se
 * rompió»—, y esta función devolvía el `stderr` vacío como resultado. El agente
 * recibía un error sin texto y se quedaba sin el informe, sin el veredicto y sin
 * poder explicarle nada a quien preguntaba.
 *
 * La regla ahora es la del motor: **si hay algo que leer, se devuelve**. Un
 * `stderr` con contenido es un fallo de verdad —dice qué salió mal y con qué
 * código—; un `stderr` vacío con salida en `stdout` es un resultado que además
 * trae una señal en el código de salida, y esa señal se conserva por escrito para
 * que un agente que ramifique por ella la vea.
 */
function delMotor(resultado: {
  stdout: string;
  stderr: string;
  exitCode: number;
}): ToolResult {
  if (resultado.stderr.trim() !== "") return mal(resultado.stderr);

  const texto = resultado.stdout.trim();
  if (texto === "") {
    return mal(
      `La operación terminó con el código ${resultado.exitCode} y sin ningún mensaje. ` +
        "Es un fallo del harness: no hay nada que el agente pueda corregir por su cuenta.",
    );
  }

  if (resultado.exitCode === 0) return bien(texto);

  return bien(
    `${texto}\n\n[código de salida ${resultado.exitCode}: la operación no aprobó. ` +
      "El informe de arriba es el resultado, no un fallo del harness.]",
  );
}

/** El `CommandResult` del CLI, traducido a resultado de herramienta. */
function delCli(resultado: {
  stdout: string;
  stderr: string;
  exitCode: number;
}): ToolResult {
  return delMotor(resultado);
}

/** Un argumento de texto, o `undefined` si no vino. Sin obligatoriedad. */
function opcional(args: Record<string, unknown>, nombre: string): string | undefined {
  const valor = args[nombre];
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined;
}

/**
 * Los filtros de la lista, armados desde los argumentos.
 *
 * Los tres enumerados se validan aquí además de declararse en el esquema, y no
 * es redundante: un cliente que no valide el esquema —o un agente que escriba el
 * argumento a mano— produciría un filtro que no filtra. `estado: "cerrado"`
 * devuelve cero tickets y se lee como «no hay nada», que es la conclusión
 * contraria a la verdad. Un valor que no existe se contesta con los que sí.
 */
function filtrosDe(args: Record<string, unknown>): TicketFilters {
  const estado = opcional(args, "estado");
  const tipo = opcional(args, "tipo");
  const modulo = opcional(args, "modulo");
  const consulta = opcional(args, "texto");
  const desde = opcional(args, "desde");
  const hasta = opcional(args, "hasta");
  const fecha = opcional(args, "fecha");
  const orden = opcional(args, "orden");
  const sentido = opcional(args, "sentido");
  const limite = args["limite"];

  if (estado !== undefined && !(WORKFLOW_STATES as readonly string[]).includes(estado)) {
    throw new Error(
      `\`estado\` no admite "${estado}". Los estados son: ${WORKFLOW_STATES.join(", ")}.`,
    );
  }
  if (tipo !== undefined && !(TICKET_TYPES as readonly string[]).includes(tipo)) {
    throw new Error(
      `\`tipo\` no admite "${tipo}". Los tipos son: ${TICKET_TYPES.join(", ")}.`,
    );
  }
  if (
    fecha !== undefined &&
    !(["updated", "created", "closedOn"] as readonly string[]).includes(fecha)
  ) {
    throw new Error(
      `\`fecha\` no admite "${fecha}". Los valores son: updated, created, closedOn.`,
    );
  }
  if (orden !== undefined && !(CAMPOS_ORDENABLES as readonly string[]).includes(orden)) {
    throw new Error(
      `\`orden\` no admite "${orden}". Las columnas son: ${CAMPOS_ORDENABLES.join(", ")}.`,
    );
  }

  return {
    // El defecto es «activos», que es lo que esta herramienta devolvía antes de
    // tener filtros. Cambiarlo habría hecho que la misma llamada contestara otra
    // cosa, y eso rompe a quien ya la usaba.
    ...(args["incluir_cerrados"] === true ? {} : { onlyOpen: true }),
    ...(estado === undefined ? {} : { workflowStatus: estado }),
    ...(tipo === undefined ? {} : { type: tipo }),
    ...(modulo === undefined ? {} : { module: modulo }),
    ...(consulta === undefined ? {} : { query: consulta }),
    ...(args["solo_criticos"] === true ? { onlyCritical: true } : {}),
    ...(args["solo_con_puntos"] === true ? { onlyWithOpenPoints: true } : {}),
    ...(desde === undefined ? {} : { desde }),
    ...(hasta === undefined ? {} : { hasta }),
    ...(fecha === undefined
      ? {}
      : { dateField: fecha as NonNullable<TicketFilters["dateField"]> }),
    ...(orden === undefined
      ? {}
      : { sortBy: orden as NonNullable<TicketFilters["sortBy"]> }),
    ...(sentido === "asc" || sentido === "desc" ? { sortDir: sentido } : {}),
    ...(typeof limite === "number" ? { limit: limite } : {}),
  };
}

/** En palabras, qué se filtró. Se imprime para que la lista explique su propio tamaño. */
function describirFiltros(args: Record<string, unknown>): string {
  const partes: string[] = [];
  const campos: readonly (readonly [string, string])[] = [
    ["estado", "estado"],
    ["tipo", "tipo"],
    ["modulo", "módulo"],
    ["texto", "texto"],
  ];
  for (const [nombre, etiqueta] of campos) {
    const valor = opcional(args, nombre);
    if (valor !== undefined) partes.push(`${etiqueta}=${valor}`);
  }
  if (args["incluir_cerrados"] === true) partes.push("incluye cerrados");
  if (args["solo_criticos"] === true) partes.push("solo con impacto crítico");
  if (args["solo_con_puntos"] === true) partes.push("solo con puntos abiertos");
  const desde = opcional(args, "desde");
  const hasta = opcional(args, "hasta");
  if (desde !== undefined || hasta !== undefined) {
    const campo = opcional(args, "fecha") ?? "updated";
    partes.push(`${campo} entre ${desde ?? "el principio"} y ${hasta ?? "hoy"}`);
  }
  return partes.join(", ");
}

/**
 * La lista en texto, en el formato que esta herramienta ya devolvía.
 *
 * Las cuatro columnas —`id | estado | módulo | título`— no cambiaron: un agente
 * que ya las leía no debería tener que aprender otro formato para seguir
 * leyendo lo mismo. Lo que se añade es el encabezado, que es lo que faltaba: sin
 * él, una lista de tres y una de sesenta se ven iguales, y un filtro que no
 * encontró nada es indistinguible de un registro vacío.
 *
 * Detrás del título van solo las señales que cambian la decisión de por dónde
 * empezar: puntos abiertos, impacto crítico y un ticket que no valida. Esconderlas
 * obligaría a una segunda llamada para saber lo que ya se sabía al listar.
 */
function renderLista(
  visibles: readonly TicketRow[],
  enElRegistro: number,
  args: Record<string, unknown>,
): string {
  const filtros = describirFiltros(args);
  const encabezado =
    filtros === ""
      ? `${visibles.length} de ${enElRegistro} ticket(s).`
      : `${visibles.length} de ${enElRegistro} ticket(s) — ${filtros}.`;

  if (visibles.length === 0) {
    return filtros === ""
      ? `${encabezado}\nNo hay tickets activos.`
      : `${encabezado}\nNingún ticket cumple el filtro.`;
  }

  const lineas = visibles.map((fila) => {
    let linea = `${fila.id} | ${fila.workflowStatus} | ${fila.module} | ${fila.title}`;
    if (fila.openPoints > 0) linea += ` | ${fila.openPoints} punto(s) abierto(s)`;
    if (fila.criticalImpacts.length > 0) {
      linea += ` | impacto crítico: ${fila.criticalImpacts.join(", ")}`;
    }
    if (fila.invalid !== null) linea += ` | INVÁLIDO: ${fila.invalid}`;
    return linea;
  });

  return [encabezado, ...lineas].join("\n");
}

/** Ejecuta una herramienta por nombre. */
export async function callTool(
  contexto: ToolContext,
  nombre: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const { paths } = contexto;

  try {
    switch (nombre) {
      case "crear_ticket": {
        const alta = createTicket({
          paths,
          id: texto(args, "id") as string,
          title: texto(args, "title") as string,
          type: texto(args, "type") as string,
          module: texto(args, "module") as string,
          request: texto(args, "request") as string,
        });
        // La ruta se devuelve explícita y no solo la línea de alta: el paso que
        // sigue es escribir en ese archivo, y el agente no debería tener que
        // deducir dónde quedó.
        const destino = findTicket(paths, texto(args, "id") as string);
        return bien(
          `${alta}\narchivo: ${destino?.absolutePath ?? "(no se pudo localizar)"}\n\n` +
            "Siguiente paso, en este orden:\n" +
            "  1. Escribe el diagnóstico en `## Diagnóstico` **y los criterios de " +
            "aceptación con texto** en `## Criterios de aceptación`. La plantilla deja " +
            "la casilla vacía y sin criterios la compuerta no evalúa nada: los rechaza " +
            "el check mecánico, que es determinista y no cuesta.\n" +
            "  2. `validar_ticket`.\n" +
            "  3. `mover_ticket` a `analyzed`. La compuerta solo aplica en ese estado.\n" +
            "  4. `evaluar_compuerta` con `analysis`.",
        );
      }

      case "ver_ticket": {
        const id = texto(args, "id") as string;
        const informe = delCli(showTicket(paths, id));
        // Si el resumen falló, la herramienta es un error y el protocolo no pide
        // contenido estructurado. Devolver `data` igualmente obligaría a inventar
        // una forma para un ticket que no se pudo leer.
        if (informe.isError) return informe;

        const ubicado = findTicket(paths, id);
        if (ubicado === undefined) {
          return mal(
            `El ticket ${id} no está en el registro, aunque el resumen se pudo ` +
              "construir. Es una incoherencia del registro: revísalo antes de seguir.",
          );
        }

        // El mismo parser que usa el motor. Los valores van tal cual están en
        // disco: aquí no se normaliza ni se reinterpreta nada.
        const parseado = parseTicket(ubicado.text);
        return bien(informe.text, {
          id,
          ruta: ubicado.absolutePath,
          campos: { ...parseado.fields },
        });
      }

      case "listar_tickets": {
        // Un registro que todavía no existe no es un error: es un proyecto
        // recién adoptado, que es el caso normal la primera vez. El comando del
        // CLI sí falla ahí, y con razón —quien lo escribe a mano espera que le
        // digan que la ruta está mal—, pero a un agente eso le llega como un
        // fallo opaco y lo más probable es que concluya que el harness está
        // roto. Se distingue el caso y se contesta la verdad: no hay nada.
        if (!existsSync(ticketsPath(paths))) {
          return bien("No hay tickets: el registro todavía no existe.", {
            total: 0,
            enElRegistro: 0,
            resumen: summarize([]),
            tickets: [],
          });
        }

        // Se lee el registro entero y se filtra en memoria. El registro de un
        // proyecto son decenas de archivos, y el filtro sobre las filas ya
        // parseadas es el mismo que usa la pantalla: una segunda forma de
        // contar los tickets sería una segunda respuesta a la misma pregunta.
        const filas = listTickets(paths);
        const visibles = filterTickets(filas, filtrosDe(args));

        return bien(renderLista(visibles, filas.length, args), {
          total: visibles.length,
          enElRegistro: filas.length,
          resumen: { ...summarize(visibles) },
          tickets: visibles.map((fila) => ({ ...fila })),
        });
      }

      case "anotar_punto": {
        const crudos = args["archivos"];
        const salida = addPoint({
          paths,
          ticketId: texto(args, "id") as string,
          title: texto(args, "title") as string,
          severity: texto(args, "severity") as string,
          actual: texto(args, "actual") as string,
          expected: texto(args, "expected") as string,
          affectedFiles: Array.isArray(crudos)
            ? crudos.filter((ruta): ruta is string => typeof ruta === "string")
            : [],
          now: contexto.now,
        });
        return bien(
          `${salida}\nEl punto queda abierto y no se cierra con la corrección, sino con ` +
            "el retest. Anota lo que hagas con `anotar_evidencia`, pasando `punto`.",
        );
      }

      case "anotar_evidencia": {
        const salida = addEvidence({
          paths,
          ticketId: texto(args, "id") as string,
          kind: texto(args, "kind") as string,
          description: texto(args, "description") as string,
          reference: texto(args, "reference", false),
          pointId: texto(args, "punto", false),
          now: contexto.now,
        });
        return bien(salida);
      }

      case "mover_punto": {
        const movimiento = transition({
          paths,
          ticketId: texto(args, "id") as string,
          entity: "point",
          to: texto(args, "to") as string,
          pointId: texto(args, "punto") as string,
          reason: texto(args, "motivo", false),
        });
        return bien(movimiento.details);
      }

      case "ver_features": {
        const slug = texto(args, "slug", false);
        return delCli(
          slug === undefined ? featureList(paths.root) : featureShow(paths.root, slug),
        );
      }

      case "descomponer_feature": {
        // El modelo del rol `architect` es el que escribe, y la clave se resuelve
        // acá porque este proceso es el único que sabe con qué archivo de
        // credenciales se lo lanzó.
        const routing = architectRoutingFor(paths.root);
        const apiKey = apiKeyDe(contexto, routing.provider);
        return delCli(
          await featureDecompose(
            paths.root,
            texto(args, "slug") as string,
            args["dry_run"] === true ? { "dry-run": true } : {},
            apiKey === null ? undefined : apiKey,
          ),
        );
      }

      case "ver_procesos": {
        const proceso = texto(args, "proceso", false);
        return delCli(
          proceso === undefined
            ? listProcesses(paths.root)
            : showProcess(paths.root, proceso),
        );
      }

      case "estado_proceso": {
        const corrida = texto(args, "corrida", false);
        return delCli(
          corrida === undefined
            ? listProcessRuns(paths.root)
            : showProcessRun(paths.root, corrida),
        );
      }

      case "ejecutar_proceso": {
        // Los parámetros se pasan por `--set` y no como banderas sueltas: una
        // bandera del CLI que se llame como un parámetro del proceso se pisaría
        // con ella, y el proceso correría con otro valor sin decirlo.
        const crudos = args["parametros"];
        const partes =
          crudos !== null && typeof crudos === "object" && !Array.isArray(crudos)
            ? Object.entries(crudos as Record<string, unknown>).map(
                ([nombre, valor]) => `${nombre}=${String(valor)}`,
              )
            : [];
        // El avance de los pasos se recoge en vez de dejarlo salir: en el CLI va a
        // stdout, y acá stdout **es** el protocolo. Un renglón suelto entre dos
        // mensajes JSON-RPC rompe la sesión del agente, y el síntoma —«el servidor
        // MCP dejó de responder»— no dice nada de la causa.
        const pasos: string[] = [];
        const informe = delCli(
          runProcessCommand(
            paths.root,
            texto(args, "proceso") as string,
            partes.length === 0 ? {} : { set: partes.join(";") },
            (linea) => pasos.push(linea.trimEnd()),
          ),
        );
        return {
          ...informe,
          text: [pasos.join("\n"), informe.text]
            .filter((parte) => parte.trim() !== "")
            .join("\n"),
        };
      }

      case "reporte_cierres": {
        const tipo = texto(args, "tipo", false);
        const desde = texto(args, "desde", false);
        const hasta = texto(args, "hasta", false);
        const busqueda = texto(args, "texto", false);
        return delCli(
          reportClosed(
            paths,
            {
              ...(tipo === undefined ? {} : { type: tipo }),
              ...(desde === undefined ? {} : { desde }),
              ...(hasta === undefined ? {} : { hasta }),
              ...(busqueda === undefined ? {} : { q: busqueda }),
            },
            contexto.now?.() ?? new Date(),
          ),
        );
      }

      case "calibrar_compuerta": {
        const gateId = texto(args, "gate") as string;
        const limite = args["limite"];
        // Medir y contrastar son dos pasos del mismo acto: la simulación produce
        // el informe y la calibración lo lee contra lo que decidieron las
        // personas. Separarlos en dos herramientas dejaría el número a medias.
        const simulacion = await simulateGate(paths, {
          // El gate **sin expandir**: `simulateGate` lo expande por ticket, con
          // los criterios y los impactos de cada uno. Expandirlo aquí con listas
          // vacías daría el mismo objeto y sugeriría lo contrario.
          gate: gateFor(gateById(gateId), { criteria: [], impacts: [] }),
          ...(typeof limite === "number" ? { limit: limite } : {}),
        });
        return delCli(calibrateReport(paths, gateId, simulacion));
      }

      case "manifiesto_entrega": {
        const crudos = args["tickets"];
        const tickets = Array.isArray(crudos)
          ? crudos.filter((id): id is string => typeof id === "string" && id.trim() !== "")
          : [];
        if (tickets.length === 0) {
          throw new Error(
            "`tickets` no puede ir vacío: la lista de lo que entra en la entrega es " +
              "explícita y no se adivina.",
          );
        }
        const fecha = texto(args, "fecha", false);
        return delCli(
          deliverManifest(
            paths,
            {
              version: texto(args, "version") as string,
              tickets: tickets.join(","),
              ...(fecha === undefined ? {} : { "released-at": fecha }),
              ...(args["dry_run"] === true ? { "dry-run": true as const } : {}),
            },
            contexto.now?.() ?? new Date(),
          ),
        );
      }

      case "indexar_registro": {
        return delCli(buildIndex(paths, args["comprobar"] === true));
      }

      case "revisar_secretos": {
        const texto = opcional(args, "texto");
        if (texto !== undefined) {
          const hallazgos = scanSecrets(texto);
          if (hallazgos.length === 0) return bien("Sin secretos en el texto.");
          return bien(
            hallazgos
              .map(
                (hallazgo) =>
                  `línea ${hallazgo.line}: ${hallazgo.kind} — ${hallazgo.description}\n` +
                  `  ${hallazgo.preview}`,
              )
              .join("\n") +
              "\n\nEl valor no se imprime a propósito. Si es un ejemplo legítimo, " +
              "marque la línea con `valmen:allow-secret`.",
          );
        }
        // El mismo comando que el CLI: un hallazgo sale por stdout con código
        // distinto de cero, así que llega como resultado y no como error del
        // harness. `delMotor` ya sabe leer esa señal.
        return delCli(
          scanPendingSecretsCommand(
            paths.root,
            args["staged"] === true ? { staged: true } : {},
          ),
        );
      }

      case "reporte_consumo": {
        const desde = texto(args, "desde", false);
        const hasta = texto(args, "hasta", false);
        const informe = usageReport(paths, {
          ...(desde === undefined ? {} : { desde }),
          ...(hasta === undefined ? {} : { hasta }),
        });
        return bien(renderUsage(informe), {
          evaluaciones: informe.evaluations,
          tickets: informe.tickets,
          costeUsd: informe.costUsd,
          decididasEnCodigo: informe.byCode,
          calibracion: informe.calibration.map((fila) => ({ ...fila, rows: undefined })),
        });
      }

      case "revisar_drift": {
        const id = texto(args, "id", false);
        const informe = scanDrift(paths, {
          ...(id === undefined ? {} : { ticketId: id }),
          ...(args["todos"] === true ? { todos: true } : {}),
        });
        return bien(renderDrift(informe), {
          hallazgos: informe.findings.length,
          tickets: new Set(informe.findings.map((uno) => uno.ticketId)).size,
          revisados: informe.scanned,
          detalle: informe.findings.map((uno) => ({
            ticket: uno.ticketId,
            clase: uno.kind,
            cita: uno.cited,
            seccion: uno.section,
          })),
        });
      }

      case "reporte_valor": {
        const desde = texto(args, "desde", false);
        const hasta = texto(args, "hasta", false);
        const limite = args["limite"];
        const informe = ticketValueReport(paths, {
          ...(desde === undefined ? {} : { desde }),
          ...(hasta === undefined ? {} : { hasta }),
        });
        return bien(renderValue(informe, typeof limite === "number" ? { limite } : {}), {
          tickets: informe.tickets.length,
          costeTotalUsd: informe.totalUsd,
          costeMedioUsd: informe.meanUsd,
          conVueltasAtras: [...informe.withReturns],
          costeParcial: [...informe.partial],
          aprobadasEnCodigo: informe.byCode,
          revertidasPorPersona: informe.reversedByHuman,
        });
      }

      case "buscar_memoria": {
        const limite = args["limite"];
        return bien(
          renderHits(
            searchMemory(
              loadMemory(paths),
              texto(args, "consulta") as string,
              typeof limite === "number" ? limite : 5,
            ),
            texto(args, "consulta") as string,
          ),
        );
      }

      case "guardar_aprendizaje": {
        const crudos = args["tickets"];
        const guardado = saveLearning(paths, {
          title: texto(args, "titulo") as string,
          body: texto(args, "cuerpo") as string,
          tickets: Array.isArray(crudos)
            ? crudos.filter(
                (id): id is string => typeof id === "string" && id.trim() !== "",
              )
            : [],
          now: contexto.now,
        });
        return bien(
          `Aprendizaje guardado: ${guardado.id} en ${guardado.path}\n` +
            "Queda en la memoria del proyecto: la próxima búsqueda que toque este tema lo " +
            "va a encontrar.",
        );
      }

      case "revisar_aprendizajes": {
        const id = texto(args, "id", false);
        if (id === undefined) {
          return bien(renderLearnings(listLearnings(paths)));
        }
        const decision = texto(args, "decision");
        if (
          !DECISIONES_APRENDIZAJE.includes(
            decision as (typeof DECISIONES_APRENDIZAJE)[number],
          )
        ) {
          return mal(`\`decision\` debe ser una de: ${DECISIONES_APRENDIZAJE.join(", ")}.`);
        }
        const area = texto(args, "area", false);
        const resultado = classifyLearning(
          paths,
          id.toUpperCase(),
          decision as (typeof DECISIONES_APRENDIZAJE)[number],
          area === undefined ? {} : { area: area as (typeof AREAS)[number] },
        );
        if (resultado.propuestaId === null) {
          return bien(
            `${id.toUpperCase()} → ${resultado.aprendizaje.state}. Queda escrito en ` +
              "`.valmen/memory/aprendizajes.md` con su clasificación.",
          );
        }
        return bien(
          `${id.toUpperCase()} → regla. Se creó la propuesta ${resultado.propuestaId}, que ` +
            "**todavía no está en vigor**: la decide una persona. Decile que la acepte " +
            "—citando sus palabras— cuando quiera que entre.",
        );
      }

      case "ver_estandares": {
        const archivos = standardsFiles(paths.root);
        const propuestas = listProposals(paths);
        const lineas = [
          `Estándares en vigor — ${archivos.length} archivo(s)`,
          "",
          ...archivos.map((archivo) => `  ${archivo.path}`),
          "",
          renderProposals(propuestas).trimEnd(),
        ];
        return bien(lineas.join("\n"));
      }

      case "proponer_estandar": {
        const crudos = args["tickets"];
        const propuesta = proposeStandard(paths, {
          title: texto(args, "titulo") as string,
          rule: texto(args, "regla") as string,
          why: texto(args, "motivo") as string,
          area: texto(args, "area") as EstandarPropuesto["area"],
          tickets: Array.isArray(crudos)
            ? crudos.filter(
                (id): id is string => typeof id === "string" && id.trim() !== "",
              )
            : [],
          now: contexto.now,
        });
        return bien(
          `Estándar propuesto: ${propuesta.id} (${propuesta.area})\n` +
            "Queda pendiente de decisión: **no está en vigor** hasta que una persona lo " +
            "acepte —desde Mission Control, o pidiéndote que lo aceptes con " +
            "`decidir_estandar`— y al aceptarlo entra al `AGENTS.md`.",
        );
      }

      case "decidir_estandar": {
        const decision = texto(args, "decision") as "aceptado" | "descartado";
        if (decision !== "aceptado" && decision !== "descartado") {
          return mal("`decision` debe ser `aceptado` o `descartado`.");
        }

        // La frase se exige acá, en la puerta por la que habla un agente, y no en
        // el motor: la pantalla decide con un clic y no tiene palabras que citar.
        const instruccion = (texto(args, "instruccion", false) ?? "").trim();
        if (instruccion === "") {
          return mal(
            "Falta `instruccion`: las palabras literales de quien decidió.\n" +
              "Aceptar un estándar lo pone en vigor, y esa decisión es de la persona.\n" +
              "Si no te dio una frase, pedísela: no la escribas vos.",
          );
        }

        const objetivo = (texto(args, "id") as string).toUpperCase();
        const ids =
          objetivo === "PENDIENTES" || objetivo === "TODOS"
            ? listProposals(paths)
                .filter((propuesta) => propuesta.state === "propuesto")
                .map((propuesta) => propuesta.id)
            : [objetivo];

        if (ids.length === 0)
          return bien("No hay estándares pendientes: nada que decidir.");

        const lineas: string[] = [];
        for (const uno of ids) {
          const resultado = decideProposal(paths, uno, decision, {
            instruccion,
            now: contexto.now,
          });
          lineas.push(
            resultado.writtenTo === null
              ? `${uno} descartado. Queda escrito en las propuestas con su estado.`
              : `${uno} aceptado: la regla quedó en ${resultado.writtenTo}`,
          );
        }
        if (decision === "aceptado") {
          lineas.push(
            "",
            "Corré `valmen sync` para que entren al `AGENTS.md`: hasta entonces la regla",
            "está en vigor en `.valmen/rules/` pero el agente todavía no la lee al empezar.",
          );
        }
        lineas.push(`Decisión registrada con la frase: «${instruccion}»`);
        return bien(lineas.join("\n"));
      }

      case "revisar_presentacion": {
        const revision = scanPendingColors(paths.root, args["staged"] === true);
        // El informe ya está escrito para que lo lea una persona; el agente es
        // una más, y devolverle otra cosa sería tener dos verdades del mismo
        // chequeo. Si hay avisos, se dice qué hacer con cada uno: el de un color
        // legítimo se marca, y el otro se cambia.
        const informe = renderColorReport(revision);
        return bien(
          revision.findings.length === 0
            ? informe
            : `${informe}\nRevisá cada uno: si el color es legítimo, marcá la línea con ` +
                "`valmen:allow-color` y escribí por qué; si no, usá la variable del tema. " +
                "No es un gate: no impide entregar, avisa antes de que lo vea la persona.",
        );
      }

      case "materializar_feature": {
        const slug = texto(args, "slug") as string;
        const dryRun = args["dryRun"] === true;
        const resultado = materializeFeature(paths, slug, { write: !dryRun });
        return bien(renderMaterialization(slug, resultado, { dryRun }), {
          creados: [...resultado.created],
          yaEstaban: [...resultado.skipped],
        });
      }

      case "anexar_ticket_a_feature": {
        const slug = texto(args, "slug") as string;
        const ticket = texto(args, "ticket") as string;
        if (args["quitar"] === true) {
          const fuera = detachTicketFromFeature({ paths, slug, ticketId: ticket });
          return bien(
            `${fuera.ticketId} salió del grafo de ${fuera.slug} (estaba en ${fuera.sprint}). ` +
              "El ticket sigue en el registro: esto no lo toca.",
          );
        }
        const anexado = attachTicketToFeature({
          paths,
          slug,
          ticketId: ticket,
          sprint: texto(args, "sprint", false),
          goal: texto(args, "goal", false),
          ...(Array.isArray(args["depends_on"])
            ? { dependsOn: (args["depends_on"] as unknown[]).map(String) }
            : {}),
        });
        return bien(renderAttachedTicket(anexado));
      }

      case "iniciar_qa": {
        const salida = qaStart({
          paths,
          ticketId: texto(args, "id") as string,
          environment: texto(args, "ambiente") as string,
          buildReference: texto(args, "referencia") as string,
          now: contexto.now,
        });
        return bien(
          `${salida}\nEl ciclo queda abierto: se cierra con \`cerrar_qa\`, y un ciclo ` +
            "abierto impide mover el ticket o eximir la prueba.",
        );
      }

      case "anotar_retest": {
        const salida = addRetest({
          paths,
          ticketId: texto(args, "id") as string,
          pointId: texto(args, "punto") as string,
          result: texto(args, "resultado") as string,
          poConfirmation: texto(args, "confirmacion_po", false),
          now: contexto.now,
        });
        return bien(salida);
      }

      case "cerrar_qa": {
        const salida = qaClose({
          paths,
          ticketId: texto(args, "id") as string,
          result: texto(args, "resultado") as string,
          poConfirmation: texto(args, "confirmacion_po", false),
          now: contexto.now,
        });
        return bien(salida);
      }

      case "preparar_cierre": {
        const id = texto(args, "id") as string;
        // El consumo se guarda antes de preparar el cierre: el motor no prepara
        // un cierre sin él, y el guardado de la transición a `closed` llegaría
        // tarde. Es idempotente, así que no duplica lo ya registrado.
        const consumo = guardarConsumoDeSesiones(
          paths,
          id,
          contexto.now ? { now: contexto.now } : {},
        );
        const salida = closeAttempt({
          paths,
          ticketId: id,
          technicalSummary: texto(args, "resumen_tecnico") as string,
          functionalSummary: texto(args, "resumen_funcional") as string,
          qaStatus: texto(args, "qa") as string,
          releaseImpact: texto(args, "impacto_release") as string,
          qaWaiverReason: texto(args, "motivo_exencion", false),
          poConfirmation: texto(args, "confirmacion_po", false),
          now: contexto.now,
        });
        return bien(
          `${salida}\nEl cierre queda preparado. \`mover_ticket\` a \`closed\` lo aplica, ` +
            "y el motor va a exigir que sea coherente con QA." +
            (consumo === null ? "" : `\nConsumo guardado en el ticket: ${consumo}`),
        );
      }

      case "validar_ticket": {
        const id = texto(args, "id", false);
        return delCli(id === undefined ? validateAll(paths) : validateOne(paths, id));
      }

      case "registrar_consumo_ia": {
        // Los números llegan como número y el motor los quiere como texto decimal
        // sin notación exponencial: la conversión vive acá, en la puerta, para no
        // obligar al agente a escribir `1e3`, que el contrato rechaza.
        const numero = (nombre: string): string | undefined => {
          const valor = args[nombre];
          if (typeof valor !== "number" || !Number.isFinite(valor)) return undefined;
          return String(valor);
        };
        const salida = addAiUsage({
          paths,
          ticketId: texto(args, "id") as string,
          source: texto(args, "source") as string,
          confidence: texto(args, "confidence") as string,
          sessionReference: texto(args, "session_reference", false),
          model: texto(args, "model", false),
          reasoningEffort: texto(args, "reasoning_effort", false),
          inputTokens: numero("input_tokens"),
          outputTokens: numero("output_tokens"),
          totalTokens: numero("total_tokens"),
          estimatedCostUsd: numero("estimated_cost_usd"),
          notes: texto(args, "notes", false),
          now: contexto.now,
        });
        return bien(salida);
      }

      case "reanudar_ticket": {
        const resultado = resumeTicket(paths, texto(args, "id", false));
        // "Hay varios activos, indique uno" no es un fallo del comando: es una
        // pregunta, y el agente tiene que poder leerla como algo que puede
        // resolver llamando otra vez con `id`.
        return delCli(resultado);
      }

      case "mover_ticket": {
        const id = texto(args, "id") as string;
        const to = texto(args, "to") as string;
        const movimiento = transition({
          paths,
          ticketId: id,
          entity: "ticket",
          to,
          reason: texto(args, "motivo", false),
        });

        // Cerrar guarda el consumo en el ticket, igual que desde el CLI y desde la
        // pantalla: el ticket tiene que poder auditarse cuando la contabilidad del
        // agente ya no exista, y eso no puede depender de quién cerró.
        const consumo =
          to === "closed"
            ? guardarConsumoDeSesiones(paths, id, contexto.now ? { now: contexto.now } : {})
            : null;

        return bien(
          movimiento.details +
            (consumo === null ? "" : `\nConsumo registrado en el ticket: ${consumo}`),
        );
      }

      case "evaluar_compuerta": {
        const gateId = texto(args, "gate") as string;
        const id = texto(args, "id") as string;
        const bruto = texto(args, "evaluator", false);
        const evaluator =
          bruto === "auto" ||
          bruto === "command" ||
          bruto === "jev" ||
          bruto === "llm-judge"
            ? bruto
            : undefined;

        // El routing del proyecto decide el modelo del rol `gate-evaluator`. Es
        // la misma resolución que hace Mission Control, porque una compuerta
        // evaluada con otro modelo según quién la pida no sería la misma
        // compuerta.
        const routing = gateRoutingFor(paths.root);
        const apiKey = apiKeyDe(contexto, routing.evaluatorProvider);

        const resultado = await runGate(paths, {
          gateId,
          ticketId: id,
          ...(apiKey === null ? {} : { apiKey }),
          ...(evaluator === undefined ? {} : { evaluator }),
          ...(contexto.jev === undefined ? {} : { jev: contexto.jev }),
          ...(contexto.judge === undefined ? {} : { judge: contexto.judge }),
          ...(contexto.now === undefined ? {} : { now: contexto.now }),
          ...(routing.evaluatorModel === "" ? {} : { model: routing.evaluatorModel }),
          ...(routing.evaluatorProvider === ""
            ? {}
            : { provider: routing.evaluatorProvider }),
          ...(routing.probabilistic ? {} : { semantic: "llm-judge" as const }),
          ...(routing.evaluatorEffort === "auto"
            ? {}
            : { effort: routing.evaluatorEffort }),
          ...(routing.judgeModel === "" ? {} : { judgeModel: routing.judgeModel }),
        });

        // El veredicto no cambia el estado del ticket —esa es la regla—, así que
        // el informe se devuelve tal cual venga: aprobado, bloqueado o en
        // revisión. Un `review` no es un fallo de la herramienta.
        const informe = delMotor(resultado);
        if (informe.isError) return informe;

        // El recibo que se acaba de anexar, leído de donde el motor lo escribió.
        // Es la última línea del registro, que es append-only y cronológico: no
        // hay que adivinar cuál es el vigente.
        const recibos = readReceipts(paths, id);
        const ultimo = recibos[recibos.length - 1];

        return bien(
          informe.text +
            "\nLa compuerta **no** movió el ticket. Según el veredicto:\n" +
            "  · `APPROVE` → `mover_ticket` al estado siguiente. Si el estado siguiente " +
            "es `approved`, el motor lo va a rechazar aunque la compuerta haya aprobado: " +
            "esa transición exige además la **aprobación explícita de una persona** " +
            "registrada en `## Plan`. Una compuerta aprobada no es un ticket aprobado, y " +
            "ninguna herramienta sustituye esa firma. Pídela y regístrala con la frase " +
            "literal de quien aprueba.\n" +
            "  · `REVIEW` → la decisión es de una persona. Llévale el motivo del informe; " +
            "no hay herramienta que la sustituya.\n" +
            "  · `BLOCK` → hay algo que corregir. El motivo dice qué proposición y con " +
            "qué valor; corrige el artefacto y vuelve a evaluar.",
          { recibo: ultimo === undefined ? null : { ...ultimo } },
        );
      }

      case "simular_compuerta": {
        const gateId = texto(args, "gate") as string;
        const limite = args["limit"];
        const informe = await simulateGate(paths, {
          // El gate **sin expandir**: `simulateGate` lo expande por ticket, con
          // los criterios y los impactos de cada uno. Expandirlo aquí con listas
          // vacías daría el mismo objeto y sugeriría lo contrario.
          gate: gateFor(gateById(gateId), { criteria: [], impacts: [] }),
          ...(typeof limite === "number" ? { limit: limite } : {}),
        });
        return bien(
          `Compuerta ${informe.gate}: ${informe.evaluated} evaluado(s), ` +
            `${informe.failed} fallido(s), coste $${informe.totalCostUsd.toFixed(6)}, ` +
            `latencia media ${Math.round(informe.meanLatencyMs)} ms.\n` +
            `Veredictos: ${Object.entries(informe.outcomes)
              .map(([outcome, cuenta]) => `${outcome}=${cuenta}`)
              .join(", ")}\n` +
            "Proposiciones (las de menor discriminación primero: las que no separan " +
            "nada no aportan y solo cuestan):\n" +
            informe.propositions
              .map(
                (p) =>
                  `  ${p.id}: ${p.samples} muestra(s), media ${p.mean.toFixed(2)}, ` +
                  `discrimina ${p.discrimination.toFixed(2)}, aprueba ${p.approved}, ` +
                  `bloquea ${p.blocked}, banda ${p.inBand}`,
              )
              .join("\n") +
            (informe.errors.length === 0
              ? ""
              : `\nNo se pudieron evaluar: ${informe.errors
                  .map((e) => `${e.id} (${e.message})`)
                  .join("; ")}`),
        );
      }

      default:
        return mal(`Herramienta desconocida: "${nombre}".`);
    }
  } catch (caught) {
    return mal(toFailure(caught).message);
  }
}

/**
 * La clave del proveedor, resuelta en el borde.
 *
 * Se resuelve aquí y no dentro de los evaluadores porque el archivo de
 * credenciales lo tiene este proceso: es el mismo reparto que el CLI y Mission
 * Control, donde quien arranca resuelve y el motor recibe el valor ya resuelto.
 */
function apiKeyDe(contexto: ToolContext, provider: string): string | null {
  if (provider === "") return null;
  return apiKeyWithPrecedence(provider, contexto.credentialsFile);
}
