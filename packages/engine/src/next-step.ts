/**
 * El siguiente paso de un ticket, calculado por el motor.
 *
 * **Por qué existe.** El harness sabía en qué estado estaba un ticket y qué exigía
 * cada transición, pero no se lo decía a quien lo retomaba. `reanudar_ticket`
 * devolvía el estado y el plan y dejaba al agente adivinar qué venía: medido el
 * 2026-10-05 con una sesión que solo recibió «continúa con el ticket X», una corrida
 * fue directa a editar el código desde `intake`, otra escribió el diagnóstico y
 * ofreció «avanzar los gates» sin saber que el plan lo aprueba una persona, y
 * ninguna cargó una skill. El proceso vivía escrito en los prompts —los que genera el
 * propio harness para sus corridas programadas miden unas 2 100 palabras— y no en el
 * harness, así que cada pedido corto era una apuesta.
 *
 * Esto lo mueve al motor. El siguiente paso sale **del estado, de lo escrito en el
 * ticket y de los recibos de las compuertas**, con las mismas comprobaciones que el
 * motor usa para permitir o negar cada transición: lo que se le dice al agente es
 * lo que `transition` le va a exigir, no una opinión paralela que pueda divergir.
 *
 * Tres decisiones:
 *
 * 1. **Es determinista y no interviene un modelo.** Es una proyección del ticket,
 *    como el resto del contexto de `resume`.
 * 2. **Dice dónde detenerse.** Un paso que termina en una decisión humana lo declara
 *    como `alto`, con el comando que la registra. Seguir de largo en una compuerta
 *    humana es el error que el flujo existe para evitar, y un agente que no sabe
 *    que la hay no puede respetarla.
 * 3. **No nombra tecnologías ni rutas del proyecto.** Las skills que cita son las de
 *    proceso que el harness publica (`planificacion`, `pruebas-unitarias`,
 *    `revision-final`) y solo si el proyecto las tiene; las de dominio las elige el
 *    agente de entre las del proyecto.
 *
 * No automatiza nada: no mueve el ticket ni corre compuertas. Dice qué toca.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  type ParsedTicket,
  hasPlanGate,
  hasSubstantivePlan,
  isCriticalPlanGate,
} from "@valmen/core";
import { type GateReceipt, extractCriteriaSpecs, hashState } from "@valmen/gate";

import type { RegistryPaths } from "./discovery.js";
import { currentReceipts, veredictoDeCompuerta } from "./receipts.js";
import { buildGateState } from "./state.js";

/** Lo que toca hacer ahora con un ticket. */
export interface NextStep {
  /** En qué fase del ciclo está, en pocas palabras. */
  readonly fase: string;
  /** Lo que hay que hacer, en orden. Vacío cuando lo único que toca es esperar. */
  readonly pasos: readonly string[];
  /** Skills de proceso a cargar antes de empezar, solo las que el proyecto tiene. */
  readonly skills: readonly string[];
  /** `true` si el proyecto tiene skills de dominio entre las que elegir. */
  readonly skillsDeDominio: boolean;
  /**
   * Dónde se detiene este recorrido y quién decide, o `null` si no hay un alto.
   *
   * Es una decisión humana o el trabajo de una persona. No es una sugerencia.
   */
  readonly alto: string | null;
  /** Lo que **no** se hace en esta fase. */
  readonly noHacer: readonly string[];
}

/** Las skills de proceso del harness, por fase. Los ids son los del catálogo publicado. */
const SKILLS_DE_PROCESO: Readonly<Record<string, readonly string[]>> = {
  analisis: ["planificacion"],
  plan: ["planificacion"],
  implementacion: ["pruebas-unitarias"],
  entrega: ["revision-final", "pruebas-unitarias"],
};

/** Las skills que el harness publica: el resto de las del proyecto son de dominio. */
const SKILLS_PUBLICADAS = new Set([
  "planificacion",
  "pruebas-unitarias",
  "revision-final",
  "feature",
  "descomposicion",
  "programar-trabajo-de-tickets",
  "manuales-usuario-final",
  "corrida-delegada",
]);

/** Lo que no se hace mientras el ticket no esté aprobado. */
const NO_CODIGO_SIN_APROBAR =
  "editar el código de la aplicación, crear migraciones, hacer commit o push: el ticket " +
  "todavía no está aprobado, y en esta fase solo se escribe el ticket. Un diagnóstico o un " +
  "plan que se queda en la conversación no existe para el registro";

/** Lo que no se hace durante la implementación. */
const NO_GIT_NI_ALCANCE =
  "commit, push, PR, tag ni despliegue, salvo que te lo pidan; ni tocar nada fuera del " +
  "alcance del plan aprobado";

/** La salvedad de las decisiones humanas: quién puede registrarlas. */
const SALVEDAD_DE_DELEGACION =
  "Solo si quien pidió el trabajo te delegó esa aprobación por escrito la registras tú, " +
  "citando su frase en `--reason`; nunca se escribe como palabras suyas algo que no dijo.";

/** Estados de punto que cuentan como abiertos. */
const PUNTOS_ABIERTOS = new Set(["open", "analyzed", "in_progress", "awaiting_retest"]);

/** Las skills de una fase que este proyecto realmente tiene. */
function skillsDe(root: string, fase: keyof typeof SKILLS_DE_PROCESO): readonly string[] {
  return (SKILLS_DE_PROCESO[fase] ?? []).filter((id) =>
    existsSync(join(root, ".valmen", "skills", id, "SKILL.md")),
  );
}

/** `true` si el proyecto tiene skills propias, de dominio, además de las del harness. */
function hayDominio(root: string): boolean {
  try {
    return readdirSync(join(root, ".valmen", "skills"), { withFileTypes: true }).some(
      (entrada) => entrada.isDirectory() && !SKILLS_PUBLICADAS.has(entrada.name),
    );
  } catch {
    return false;
  }
}

/** Un paso que nombra un recibo y su motivo, para que se pueda ir a leerlo. */
function citar(recibo: GateReceipt): string {
  const motivo = recibo.reason.replace(/\s+/g, " ").trim();
  return `recibo ${recibo.id}${motivo === "" ? "" : `: ${motivo.slice(0, 160)}`}`;
}

/** Los criterios de aceptación que no declaran cómo se verifican. */
function criteriosSinVerificacion(ticket: ParsedTicket): number {
  const criterios = extractCriteriaSpecs(ticket.sections["Criterios de aceptación"] ?? "");
  if (criterios.length === 0) return -1;
  return criterios.filter((criterio) => criterio.command === null && !criterio.manual)
    .length;
}

/**
 * Calcula el siguiente paso de un ticket.
 *
 * `recibos` es el registro completo del ticket, tal como lo lee `readReceipts`.
 */
export function computeNextStep(
  paths: RegistryPaths,
  ticket: ParsedTicket,
  recibos: readonly GateReceipt[],
): NextStep {
  const id = ticket.fields.id;
  const estado = ticket.fields.workflow_status;
  const conDominio = hayDominio(paths.root);

  const paso = (
    fase: string,
    pasos: readonly string[],
    opciones: {
      readonly skills?: readonly string[];
      readonly dominio?: boolean;
      readonly alto?: string;
      readonly noHacer?: readonly string[];
    } = {},
  ): NextStep => ({
    fase,
    pasos,
    skills: opciones.skills ?? [],
    skillsDeDominio: opciones.dominio === true && conDominio,
    alto: opciones.alto ?? null,
    noHacer: opciones.noHacer ?? [],
  });

  const evaluar = (compuerta: string, extra = ""): string =>
    `Evalúa la compuerta \`${compuerta}\`${extra} (\`evaluar_compuerta\` o ` +
    `\`valmen gate ${compuerta} --id ${id}\`).`;
  const mover = (a: string): string =>
    `\`mover_ticket\` a \`${a}\` (o \`valmen transition --id ${id} --entity ticket --to ${a}\`)`;
  const decidir = (recibo: GateReceipt): string =>
    `\`valmen gate-decide --id ${id} --receipt ${recibo.id} --decision approve|reject ` +
    `--actor <nombre> --reason <texto>\``;
  // El avance a `planned` y a `approved` con la compuerta en `block` sin decisión humana lo
  // rechaza `transition` (R-CDEF-004): este paso dice cómo se autoriza, para que quien se
  // topa con el rechazo no tenga que adivinarlo. Con una decisión ya registrada no hay
  // nada que autorizar.
  const autorizarBloqueo = (recibo: GateReceipt, destino: string): readonly string[] =>
    recibo.humanDecision !== null
      ? []
      : [
          "Si una persona autoriza seguir pese al bloqueo, el motor no deja avanzar sin su " +
            `decisión registrada: ${decidir(recibo)} con su frase literal en \`--reason\`, y ` +
            `después ${mover(destino)}. ${SALVEDAD_DE_DELEGACION}`,
        ];

  switch (estado) {
    case "intake": {
      if (!hasSubstantivePlan(ticket.sections["Diagnóstico"] ?? "")) {
        return paso(
          "análisis",
          [
            "Busca en la memoria (`buscar_memoria`) el módulo y el síntoma antes de diagnosticar: " +
              "puede estar resuelto, con su causa raíz escrita.",
            "Lee el código real por donde pasa el flujo; no asumas ni diagnostiques de memoria.",
            "Escribe en el ticket `## Descripción funcional` y `## Diagnóstico`: archivos y flujo " +
              "con `ruta:línea`, la causa comprobada, las hipótesis pendientes, los consumidores afectados, riesgos y compatibilidad, y la línea " +
              "`- Impactos de sync, migración, Docker o despliegue: <valor>`.",
            `Valida (\`valmen validate --id ${id}\`) y, en una llamada aparte de la escritura, ` +
              `${mover("analyzed")}.`,
          ],
          {
            skills: skillsDe(paths.root, "analisis"),
            dominio: true,
            noHacer: [NO_CODIGO_SIN_APROBAR],
          },
        );
      }
      return paso(
        "análisis",
        [
          `El diagnóstico ya está escrito: valida (\`valmen validate --id ${id}\`) y ` +
            `${mover("analyzed")}.`,
        ],
        { noHacer: [NO_CODIGO_SIN_APROBAR] },
      );
    }

    case "analyzed": {
      const veredicto = veredictoDeCompuerta(recibos, "analysis");
      if (veredicto.tipo === "sin-recibo") {
        return paso(
          "compuerta de análisis",
          [evaluar("analysis", " sin elegir evaluador")],
          {
            noHacer: [NO_CODIGO_SIN_APROBAR],
          },
        );
      }
      if (veredicto.tipo === "bloqueada") {
        return paso(
          "compuerta de análisis",
          [
            `La compuerta \`analysis\` no pasó (${citar(veredicto.recibo)}).`,
            "Mejora el diagnóstico en una sola pasada —sin perseguir el número reescribiendo el " +
              "artefacto— y vuelve a evaluarla. Si sigue sin pasar, deja el ticket en `analyzed` y " +
              "pide la decisión de una persona.",
            ...autorizarBloqueo(veredicto.recibo, "planned"),
          ],
          { skills: skillsDe(paths.root, "analisis"), noHacer: [NO_CODIGO_SIN_APROBAR] },
        );
      }
      if (veredicto.tipo === "espera-persona") {
        return paso("compuerta de análisis", [], {
          alto:
            `la decisión sobre el análisis es de una persona (${citar(veredicto.recibo)}). ` +
            "Preséntale el veredicto y la proposición más floja, y espera. Se registra con " +
            `${decidir(veredicto.recibo)}. ${SALVEDAD_DE_DELEGACION}`,
          noHacer: [NO_CODIGO_SIN_APROBAR],
        });
      }
      return paso(
        "plan",
        [
          "Escribe `## Plan`: alcance y exclusiones, pasos ordenados —cada uno con archivo y " +
            "símbolo— y rollback.",
          "Escribe `## Criterios de aceptación`: uno por línea, cada uno con " +
            "`<!-- test: <comando> -->` debajo (solo comandos que `.valmen/config.yaml` permita) " +
            "o `<!-- verify: manual -->`.",
          `Valida, ${mover("planned")} en una llamada aparte, y evalúa la compuerta \`plan\`.`,
        ],
        {
          skills: skillsDe(paths.root, "plan"),
          dominio: true,
          noHacer: [NO_CODIGO_SIN_APROBAR],
        },
      );
    }

    case "planned": {
      const veredicto = veredictoDeCompuerta(recibos, "plan");
      const sinVerificar = criteriosSinVerificacion(ticket);
      const aprobadoEnPlan = hasPlanGate(ticket);
      const critico = isCriticalPlanGate(ticket)
        ? ` Este ticket (${ticket.fields.type}) exige esa aprobación explícita: no admite "gate no exigible".`
        : "";
      const lineaAprobacion =
        "`- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).`";

      if (veredicto.tipo === "sin-recibo") {
        const pasos = [evaluar("plan", " sin elegir evaluador")];
        if (sinVerificar !== 0) {
          pasos.unshift(
            sinVerificar < 0
              ? "Antes de evaluar: `## Criterios de aceptación` no tiene criterios."
              : `Antes de evaluar: ${sinVerificar} criterio(s) no declaran cómo se verifican.`,
            "Cada criterio lleva `<!-- test: <comando> -->` debajo (solo comandos que " +
              "`.valmen/config.yaml` permita) o `<!-- verify: manual -->`.",
          );
        }
        return paso("compuerta del plan", pasos, {
          skills: skillsDe(paths.root, "plan"),
          noHacer: [NO_CODIGO_SIN_APROBAR],
        });
      }
      if (veredicto.tipo === "bloqueada") {
        return paso(
          "compuerta del plan",
          [
            `La compuerta \`plan\` no pasó (${citar(veredicto.recibo)}).`,
            "Corrige el plan en una sola pasada y vuelve a evaluarla. Si sigue sin pasar, deja el " +
              "ticket en `planned` y pide la decisión de una persona.",
            ...autorizarBloqueo(veredicto.recibo, "approved"),
          ],
          { skills: skillsDe(paths.root, "plan"), noHacer: [NO_CODIGO_SIN_APROBAR] },
        );
      }
      if (veredicto.tipo === "espera-persona") {
        if (aprobadoEnPlan) {
          return paso("aprobación del plan", [], {
            alto:
              "la línea de aprobación ya está en el plan, pero la decisión no quedó registrada " +
              `en el recibo ${veredicto.recibo.id}: la registra quien aprobó con ` +
              `${decidir(veredicto.recibo)}. Después, ${mover("approved")}.`,
            noHacer: [NO_CODIGO_SIN_APROBAR],
          });
        }
        return paso("aprobación del plan", [], {
          alto:
            `la aprobación del plan es de una persona (${citar(veredicto.recibo)}). Preséntale ` +
            "el plan y el veredicto, y espera su respuesta. Cuando la dé: escribe en `## Plan` la " +
            `línea ${lineaAprobacion}, regístrala con ${decidir(veredicto.recibo)} y ` +
            `${mover("approved")}.${critico} ${SALVEDAD_DE_DELEGACION}`,
          noHacer: [NO_CODIGO_SIN_APROBAR],
        });
      }
      return paso(
        "aprobación del plan",
        aprobadoEnPlan
          ? [`La aprobación del plan está registrada: ${mover("approved")}.`]
          : [
              `El plan pasó la compuerta (${citar(veredicto.recibo)}). Escribe en \`## Plan\` la ` +
                `línea ${lineaAprobacion} —solo si una persona la dio; si no, el ticket no puede ` +
                `pasar a \`approved\` y hay que pedirla—, y ${mover("approved")} en una llamada aparte.${critico}`,
            ],
        { noHacer: [NO_CODIGO_SIN_APROBAR] },
      );
    }

    case "approved":
      return paso(
        "implementación",
        [
          `${mover("in_progress")}.`,
          "Trabaja solo el plan aprobado, paso por paso. Si aparece algo fuera del plan, detente y " +
            "consúltalo: ampliar el alcance es una decisión de una persona.",
          "Agrega o actualiza las pruebas y córrelas con los comandos que declaran los criterios.",
        ],
        {
          skills: skillsDe(paths.root, "implementacion"),
          dominio: true,
          noHacer: [NO_GIT_NI_ALCANCE],
        },
      );

    case "in_progress": {
      const mecanica = currentReceipts(recibos).find(
        (recibo) => recibo.gate === "qa-mechanical",
      );
      const comando =
        "`evaluar_compuerta` `qa-mechanical` con evaluador `command` (o " +
        `\`valmen gate qa-mechanical --id ${id} --evaluator command\`)`;
      const entregar = `registra el consumo de IA (\`registrar_consumo_ia\`) y ${mover("awaiting_user_tests")}`;
      const base = {
        skills: skillsDe(paths.root, "entrega"),
        dominio: true,
        noHacer: [NO_GIT_NI_ALCANCE],
      };

      if (mecanica === undefined) {
        return paso(
          "implementación y verificación",
          [
            "Implementa el plan aprobado paso por paso y corre las pruebas de los criterios.",
            `Deja el ticket terminado (criterios, \`## Pruebas\` e \`## Implementación\` al día) y corre ${comando}.`,
            `Si pasa, ${entregar}.`,
          ],
          base,
        );
      }
      // Lo que el motor exige para entregar: que el recibo exista, que sea del estado
      // actual y que no haya bloqueado. Un recibo viejo prueba lo que se probó, no lo
      // que se entrega.
      if (mecanica.outcome === "block") {
        return paso(
          "verificación",
          [
            `La verificación mecánica bloqueó (${citar(mecanica)}).`,
            `Corrige lo que falla y vuelve a correr ${comando}.`,
          ],
          base,
        );
      }
      if (mecanica.stateHash !== hashState(buildGateState(ticket.text))) {
        return paso(
          "verificación",
          [
            `La verificación mecánica (recibo ${mecanica.id}) es anterior al último cambio del ` +
              `ticket: lo que se probó no es lo que se entrega. Vuelve a correr ${comando}.`,
          ],
          base,
        );
      }
      return paso(
        "entrega",
        [`La verificación mecánica pasó sobre el estado actual: ${entregar}.`],
        base,
      );
    }

    case "awaiting_user_tests":
      return paso(
        "pruebas del responsable",
        ["Entrégale a la persona un resumen de lo hecho, la evidencia y cómo probarlo."],
        {
          alto:
            "las pruebas y el QA son de una persona. Espera su resultado; no muevas el ticket " +
            "ni cambies el código por tu cuenta.",
        },
      );

    case "in_qa":
      return paso("QA", [], {
        alto:
          "el QA está en manos de una persona (`iniciar_qa`, `anotar_retest`, `cerrar_qa`). " +
          "Espera su resultado.",
      });

    case "changes_requested": {
      const abiertos = ticket.blocks.Puntos.filter((punto) =>
        PUNTOS_ABIERTOS.has(String(punto["status"])),
      ).map((punto) => String(punto["id"]));
      return paso(
        "correcciones",
        [
          abiertos.length === 0
            ? "Lee el ciclo de QA cerrado (`ver_ticket`) para saber qué se pidió cambiar."
            : `Atiende los puntos abiertos (${abiertos.join(", ")}) dentro del plan vigente.`,
          `${mover("in_progress")}, y al terminar repite la verificación mecánica y la entrega.`,
        ],
        {
          skills: skillsDe(paths.root, "implementacion"),
          dominio: true,
          noHacer: [NO_GIT_NI_ALCANCE],
        },
      );
    }

    case "qa_approved":
      return paso(
        "cierre",
        [
          "Registra el intento de cierre (`preparar_cierre`) y el consumo de IA " +
            `(\`registrar_consumo_ia\`), y ${mover("closed")}.`,
        ],
        {
          noHacer: [
            "publicar ni etiquetar la release: cerrar no es publicar, y publicar es una decisión humana",
          ],
        },
      );

    case "closed":
      return paso("cerrado", ["No hay nada que continuar en este ticket."], {
        alto:
          "reabrirlo (`changes_requested`) exige un motivo de una persona y que siga sin " +
          "publicarse.",
      });

    case "blocked":
      return paso("bloqueado", [], {
        alto:
          "el ticket está bloqueado. Lee el motivo en su historial (`ver_ticket`) y consulta a " +
          "una persona; no lo muevas por tu cuenta.",
      });

    default:
      return paso(estado, [
        `Estado no reconocido: consulta el ticket completo con \`ver_ticket\`.`,
      ]);
  }
}

/** El siguiente paso, en las líneas que `resume` imprime. */
export function renderNextStep(step: NextStep): string[] {
  const lines = [`Siguiente paso — ${step.fase}:`];
  step.pasos.forEach((texto, indice) => lines.push(`  ${indice + 1}. ${texto}`));

  if (step.skills.length > 0 || step.skillsDeDominio) {
    const partes: string[] = [];
    if (step.skills.length > 0) {
      partes.push(step.skills.map((skill) => `\`${skill}\``).join(", "));
    }
    if (step.skillsDeDominio) {
      partes.push(
        "las skills de dominio del proyecto que apliquen a este ticket (`.valmen/skills/`)",
      );
    }
    lines.push(
      `  Carga antes: ${partes.join(" y ")} —con la herramienta Skill o el prompt del MCP \`valmen\`—.`,
    );
  }
  if (step.alto !== null) lines.push(`  DETENTE AQUÍ: ${step.alto}`);
  for (const texto of step.noHacer) lines.push(`  No hagas: ${texto}.`);
  return lines;
}
