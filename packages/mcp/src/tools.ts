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
  addPoint,
  createTicket,
  filterTickets,
  findTicket,
  listTickets,
  readReceipts,
  runGate,
  simulateGate,
  summarize,
  ticketsPath,
  transition,
} from "@valmen/engine";
import { gateFor, gateById } from "@valmen/gate";
import { gateRoutingFor } from "@valmen/adapter";
import { apiKeyWithPrecedence } from "@valmen/credentials";
import { resumeTicket, showTicket, validateAll, validateOne } from "@valmen/cli";

import type { ToolDefinition, ToolResult } from "./protocol.js";

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

/** El catálogo de herramientas. */
export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "crear_ticket",
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
    name: "anotar_punto",
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
      },
      required: ["id", "title", "severity", "actual", "expected"],
    }),
  },
  {
    name: "anotar_evidencia",
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
    name: "validar_ticket",
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
    name: "evaluar_compuerta",
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
          enum: ["analysis", "plan"],
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
    name: "mover_ticket",
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
      },
      required: ["id", "to"],
    }),
  },
  {
    name: "reanudar_ticket",
    title: "Reanudar un ticket",
    description:
      "Devuelve el contexto de un ticket para retomar trabajo ya empezado: estado, QA, " +
      "release y cuántos puntos hay. Es lo primero que conviene llamar al empezar una " +
      "sesión sobre algo en curso. Sin `id`, si hay más de un ticket activo **no " +
      "elige**: devuelve la lista y hay que decidir cuál.",
    inputSchema: conRoot({
      properties: { id: { type: "string" } },
    }),
  },
  {
    name: "simular_compuerta",
    title: "Medir una compuerta sobre el histórico",
    description:
      "Corre una compuerta sobre los tickets del registro y devuelve la distribución de " +
      "sus proposiciones y el coste. Sirve para **calibrar** —ver si una proposición " +
      "discrimina o si el gate manda todo a revisión—, no para decidir sobre un ticket " +
      "concreto. Cuesta una llamada por ticket evaluado.",
    inputSchema: conRoot({
      properties: {
        gate: { type: "string", enum: ["analysis", "plan"] },
        limit: {
          type: "number",
          description: "Evalúa solo los primeros n tickets. Sin él, todos.",
        },
      },
      required: ["gate"],
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
        const salida = addPoint({
          paths,
          ticketId: texto(args, "id") as string,
          title: texto(args, "title") as string,
          severity: texto(args, "severity") as string,
          actual: texto(args, "actual") as string,
          expected: texto(args, "expected") as string,
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

      case "validar_ticket": {
        const id = texto(args, "id", false);
        return delCli(id === undefined ? validateAll(paths) : validateOne(paths, id));
      }

      case "reanudar_ticket": {
        const resultado = resumeTicket(paths, texto(args, "id", false));
        // "Hay varios activos, indique uno" no es un fallo del comando: es una
        // pregunta, y el agente tiene que poder leerla como algo que puede
        // resolver llamando otra vez con `id`.
        return delCli(resultado);
      }

      case "mover_ticket": {
        const movimiento = transition({
          paths,
          ticketId: texto(args, "id") as string,
          entity: "ticket",
          to: texto(args, "to") as string,
        });
        return bien(movimiento.details);
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
          gate: gateFor(gateById(gateId), { criteria: [] }),
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
