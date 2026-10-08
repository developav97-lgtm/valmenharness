/**
 * `valmen journey handoff --id <jornada> [--project <id>] [--to <destino>] [--saved]`.
 *
 * El parte final de la corrida: qué probar y cómo en cada ticket de la jornada. No mueve ni cierra
 * ningún ticket. Guarda el parte en `.valmen/journeys/handoffs.jsonl` y solo con `--to` lo envía
 * por el canal de avisos; `--saved` imprime el último guardado sin recalcular ni escribir.
 */
import {
  type CommandRunner,
  armarParteDeJornada,
  guardarParteDeJornada,
  leerPartesDeJornada,
  renderJourneyHandoffNotification,
} from "@valmen/engine";
import { EXIT_INVARIANT, EXIT_OK, EXIT_SCHEMA, toFailure, withAccessMode } from "@valmen/core";

import { type CommandResult, proyectoDeLaOla } from "./commands.js";
import { avisarParteDeJornada } from "./hermes.js";

export const USO_DE_HANDOFF = "journey handoff --id <jornada> [--project <id>] [--to <destino>] [--saved]";

/** Solo ids de jornada (`JOR-…`): una delegación no tiene jornada donde guardar el parte. */
const ID_DE_JORNADA = /^JOR-[A-Za-z0-9][A-Za-z0-9._:-]{0,123}$/;

export interface OpcionesDeHandoff {
  readonly home?: string;
  readonly root?: string;
  readonly ahora?: () => Date;
  /** Costura de prueba: el canal de Hermes nunca sale a la red en las pruebas. */
  readonly runner?: CommandRunner;
}

const falla = (stderr: string, exitCode: number): CommandResult => ({ stdout: "", stderr: `${stderr}\n`, exitCode });

const SIN_TOPE = { maxCaracteres: Number.POSITIVE_INFINITY } as const;

export function journeyHandoffCommand(
  flags: Readonly<Record<string, string | true>>,
  opciones: OpcionesDeHandoff = {},
): CommandResult {
  const id = flags["id"];
  if (typeof id !== "string" || !ID_DE_JORNADA.test(id)) {
    return falla(
      `journey handoff requiere --id con el id de una jornada (JOR-…).\nUso: ${USO_DE_HANDOFF}`,
      EXIT_SCHEMA,
    );
  }
  const saved = flags["saved"] === true;
  const to = flags["to"];
  if (to !== undefined && (typeof to !== "string" || to.trim() === "")) {
    return falla(`--to requiere un destino (por ejemplo telegram:<id>).\nUso: ${USO_DE_HANDOFF}`, EXIT_SCHEMA);
  }
  if (saved && to !== undefined) {
    return falla("--saved no se combina con --to: --saved solo imprime y no envía ni escribe.", EXIT_SCHEMA);
  }
  const ahora = opciones.ahora ?? (() => new Date());

  try {
    const project = proyectoDeLaOla(flags, opciones);

    if (saved) {
      return withAccessMode("ask", () => {
        const ultimo = leerPartesDeJornada(project.root, id).at(-1);
        if (ultimo === undefined) {
          return falla(`No hay un parte guardado de la jornada ${id}: córrelo sin --saved para armarlo.`, EXIT_INVARIANT);
        }
        const cuerpo = renderJourneyHandoffNotification(ultimo.parte, SIN_TOPE).body;
        return { stdout: `${cuerpo}\n\n(Parte guardado el ${ultimo.generadoEn}; no se escribió nada.)\n`, stderr: "", exitCode: EXIT_OK };
      });
    }

    const parte = armarParteDeJornada({ project, journeyId: id, ahora });
    const guardado = guardarParteDeJornada({ project, parte });
    const lineas = [
      renderJourneyHandoffNotification(parte, SIN_TOPE).body,
      "",
      guardado.guardado
        ? "Parte guardado en .valmen/journeys/handoffs.jsonl."
        : "El parte no cambió desde el último guardado: no se añadió otra línea.",
    ];
    if (to !== undefined) {
      const envio = avisarParteDeJornada({
        paths: project.paths,
        parte,
        to: to as string,
        now: ahora(),
        ...(opciones.runner === undefined ? {} : { runner: opciones.runner }),
      });
      lineas.push(
        envio.estado === "enviado"
          ? `Parte enviado a ${to}: ${envio.detalle}.`
          : envio.estado === "ya-enviado"
            ? `El parte con este contenido ya estaba enviado a ${to}: no se reenvió.`
            : `El parte NO se envió a ${to}: ${envio.detalle}. Quedó guardado; repetir el comando lo reintenta.`,
      );
    }
    return { stdout: `${lineas.join("\n")}\n`, stderr: "", exitCode: EXIT_OK };
  } catch (caught) {
    const failure = toFailure(caught);
    return falla(failure.message, failure.exitCode);
  }
}
