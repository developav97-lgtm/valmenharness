/**
 * La duración de cada etapa de un ticket, a partir de sus propias marcas.
 *
 * Los eventos del ticket llevaban solo `date` —el día—, así que el tiempo
 * invertido no se podía medir: no había nada que restar. No se perdió, nunca se
 * escribió. Con la hora en los eventos (`at`) la duración de cada etapa se calcula
 * sin modelo, sin reloj y sin estado externo: dos marcas de la misma lista.
 *
 * Dos reglas que lo hacen honesto:
 *
 * 1. **Un hueco no se rellena.** Si una de las dos puntas de un tramo no tiene
 *    hora, ese tramo queda en `null` y se declara no reconstruible. Un tiempo
 *    estimado con aspecto de dato es peor que un hueco declarado.
 * 2. **La primera marca no tiene duración.** Un cero ahí se leería como «esta
 *    etapa no tardó nada», y lo que pasa es que no hay contra qué restar.
 */
import type { JsonObject } from "@valmen/core";

/** Una etapa del ticket, con su marca y lo que tardó. */
export interface EtapaDeTicket {
  /** El estado del workflow al que llegó, o `intake` en la creación. */
  readonly estado: string;
  /** El instante en que llegó, o `null` si el evento no lo traía. */
  readonly at: string | null;
  /** Lo que tardó desde la marca anterior, en milisegundos, o `null` si no se sabe. */
  readonly ms: number | null;
}

/**
 * La acción con la que el motor escribe una transición de ticket.
 *
 * No es `transition`: el motor escribe `` `${entity}-transition` ``
 * (`packages/engine/src/transition.ts`), o sea `ticket-transition`. Buscar la
 * forma corta dejaba la función reconociendo solo el evento de creación, así que
 * la duración por etapa no existía en ningún ticket y nada fallaba.
 */
const ACCION_TRANSICION = "ticket-transition";

/** `Workflow: intake -> analyzed.` → `analyzed`. */
const TRANSICION_RE = /^Workflow: [a-z_]+ -> ([a-z_]+)\.$/;

/** El instante de un evento, o `null` si no trae una hora utilizable. */
function instanteDe(evento: JsonObject): number | null {
  const at = evento["at"];
  if (typeof at !== "string") return null;
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * La serie de etapas del ticket, en orden.
 *
 * Se leen los eventos que mueven el workflow: la creación abre la serie en
 * `intake` y cada transición añade el estado al que llegó. Un evento que no mueve
 * el workflow —una evidencia, un consumo, un punto— no es una etapa y no entra:
 * contarlo como marca diría que el ticket pasó por un estado que nunca visitó.
 */
export function duracionesPorEtapa(
  eventos: readonly JsonObject[],
): readonly EtapaDeTicket[] {
  const etapas: EtapaDeTicket[] = [];
  let anterior: number | null = null;

  for (const evento of eventos) {
    const action = evento["action"];
    const details = typeof evento["details"] === "string" ? evento["details"] : "";

    let estado: string | null = null;
    if (action === "created") {
      estado = "intake";
    } else if (action === ACCION_TRANSICION) {
      const match = TRANSICION_RE.exec(details);
      estado = match === null ? null : (match[1] as string);
    }
    if (estado === null) continue;

    const instante = instanteDe(evento);
    const at = typeof evento["at"] === "string" ? evento["at"] : null;
    etapas.push({
      estado,
      at,
      // La duración es la resta de dos marcas, y necesita las dos.
      ms: instante === null || anterior === null ? null : instante - anterior,
    });
    anterior = instante;
  }

  return etapas;
}

/**
 * La duración en texto, para el informe: `2 h 5 min`, o `no reconstruible`.
 *
 * Por debajo del minuto se dice `<1 min` y no `0 min`: redondear medio segundo a
 * cero se lee como «no tardó nada», que es la misma mentira que el cero que este
 * ticket vino a sacar del reparto.
 */
export function duracionEnTexto(ms: number | null): string {
  if (ms === null) return "no reconstruible";
  if (ms < 60000) return "<1 min";
  const minutos = Math.round(ms / 60000);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}
