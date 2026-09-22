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

import { toFailure } from "@valmen/core";
import {
  type RegistryPaths,
  createTicket,
  findTicket,
  runGate,
  simulateGate,
  ticketsPath,
  transition,
} from "@valmen/engine";
import { gateFor, gateById } from "@valmen/gate";
import { gateRoutingFor } from "@valmen/adapter";
import { apiKeyWithPrecedence } from "@valmen/credentials";
import {
  listActive,
  resumeTicket,
  showTicket,
  validateAll,
  validateOne,
} from "@valmen/cli";

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

function bien(texto: string): ToolResult {
  return { text: texto.trimEnd(), isError: false };
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
    inputSchema: {
      type: "object",
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
      additionalProperties: false,
    },
  },
  {
    name: "ver_ticket",
    title: "Ver un ticket",
    description:
      "Devuelve el resumen del ticket: frontmatter, secciones y bloques. Es lo que hay " +
      "que leer antes de escribir el diagnóstico o el plan, y lo que dice si la " +
      "compuerta ya se evaluó. No lo confundas con el archivo: para editar secciones " +
      "se abre la ruta que devuelve `crear_ticket`.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Identificador del ticket." } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "listar_tickets",
    title: "Listar tickets activos",
    description:
      "Lista los tickets no cerrados, con su estado, su módulo y su título. Sirve para " +
      "saber qué hay en curso antes de crear uno nuevo y para no duplicar trabajo.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "validar_ticket",
    title: "Validar un ticket",
    description:
      "Comprueba el ticket contra el contrato y devuelve el error exacto si no lo " +
      "cumple. Es determinista y no cuesta nada, así que hay que llamarlo **antes** de " +
      "evaluar una compuerta: una compuerta sobre un ticket inválido gasta una llamada " +
      "y su veredicto no dice nada.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Identificador del ticket. Sin él se validan todos.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "evaluar_compuerta",
    title: "Evaluar una compuerta",
    description:
      "Evalúa una compuerta contra un ticket y devuelve el veredicto con su recibo: " +
      "aprobado, bloqueado, o en revisión humana. **No mueve el estado del ticket** — " +
      "un gate no cambia estados, esa es la regla — y no sustituye a la decisión de una " +
      "persona cuando el veredicto cae en la banda de revisión. Cuesta una llamada al " +
      "evaluador configurado en el routing del proyecto.\n\n" +
      "**El ticket tiene que estar ya en el estado que la compuerta protege**, porque " +
      "cada una evalúa un artefacto terminado: `analysis` exige el ticket en `analyzed` " +
      "(con el diagnóstico escrito) y `plan` lo exige en `planned` (con el plan escrito). " +
      "Si se evalúa antes, se rechaza y no se gasta nada. La secuencia es: escribir la " +
      "sección, `validar_ticket`, `mover_ticket` al estado, y entonces evaluar.",
    inputSchema: {
      type: "object",
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
    inputSchema: {
      type: "object",
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
      additionalProperties: false,
    },
  },
  {
    name: "reanudar_ticket",
    title: "Reanudar un ticket",
    description:
      "Devuelve el contexto de un ticket para retomar trabajo ya empezado: estado, QA, " +
      "release y cuántos puntos hay. Es lo primero que conviene llamar al empezar una " +
      "sesión sobre algo en curso. Sin `id`, si hay más de un ticket activo **no " +
      "elige**: devuelve la lista y hay que decidir cuál.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "simular_compuerta",
    title: "Medir una compuerta sobre el histórico",
    description:
      "Corre una compuerta sobre los tickets del registro y devuelve la distribución de " +
      "sus proposiciones y el coste. Sirve para **calibrar** —ver si una proposición " +
      "discrimina o si el gate manda todo a revisión—, no para decidir sobre un ticket " +
      "concreto. Cuesta una llamada por ticket evaluado.",
    inputSchema: {
      type: "object",
      properties: {
        gate: { type: "string", enum: ["analysis", "plan"] },
        limit: {
          type: "number",
          description: "Evalúa solo los primeros n tickets. Sin él, todos.",
        },
      },
      required: ["gate"],
      additionalProperties: false,
    },
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
            "Siguiente paso: escribe el diagnóstico en `## Diagnóstico`, llama a " +
            "`validar_ticket` y después a `evaluar_compuerta` con `analysis`.",
        );
      }

      case "ver_ticket":
        return delCli(showTicket(paths, texto(args, "id") as string));

      case "listar_tickets": {
        // Un registro que todavía no existe no es un error: es un proyecto
        // recién adoptado, que es el caso normal la primera vez. El comando del
        // CLI sí falla ahí, y con razón —quien lo escribe a mano espera que le
        // digan que la ruta está mal—, pero a un agente eso le llega como un
        // fallo opaco y lo más probable es que concluya que el harness está
        // roto. Se distingue el caso y se contesta la verdad: no hay nada.
        if (!existsSync(ticketsPath(paths))) {
          return bien("No hay tickets activos: el registro todavía no existe.");
        }
        return delCli(listActive(paths));
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
        return bien(
          informe.text +
            "\nLa compuerta **no** movió el ticket. Si el veredicto es de aprobación, el " +
            "paso siguiente es `mover_ticket`; si quedó en revisión, la decisión es de " +
            "una persona y no hay herramienta que la sustituya.",
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
