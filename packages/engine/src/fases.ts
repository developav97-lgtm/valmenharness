/**
 * La línea de fases de un ticket, a partir de sus propias transiciones.
 *
 * `duracionesPorEtapa` ya convertía las marcas del bloque `Eventos` en una lista
 * de estados con su hora y su duración, pero dejaba la serie abierta: cada marca
 * era un punto suelto, sin hora de fin, sin decir cuál fase corre ahora y sin el
 * motivo de la reapertura. Mission Control necesita las fases como tramos —con su
 * inicio, su fin y su duración—, y eso es lo que este módulo deriva.
 *
 * Se construye sobre las **mismas reglas** que `etapas.ts` para no tener dos
 * parsers del `details`: la creación (`action: "created"`) abre la serie en
 * `intake`, cada `ticket-transition` reconocida por la regex del `Workflow`
 * aporta el estado destino, y un evento que no mueve el workflow no es fase —ni
 * abre, ni cierra, ni corta la serie—. Cada marca cierra la fase anterior y abre
 * la siguiente, así que las fases quedan encadenadas por dos marcas consecutivas.
 *
 * Dos reglas que lo mantienen honesto, heredadas de `etapas.ts`:
 *
 * 1. **Un hueco no se rellena.** Un tramo sin hora en alguna de sus dos puntas
 *    queda con `inicio`, `fin` y `ms` en `null`, declarado no reconstruible. Un
 *    cero, o una hora estimada, se leería como un dato que nadie midió.
 * 2. **La reapertura es una fase nueva.** Un `Workflow: closed -> changes_requested.`
 *    no vuelve a la fase vieja: emite la fase `changes_requested` aparte, con el
 *    motivo que el `details` anexa después del punto.
 *
 * La función es pura y read-only: solo mira la lista de eventos que recibe, no
 * toca el disco ni la red y no reescribe el registro.
 */
import type { JsonObject } from "@valmen/core";

/** Una fase del ticket: el tramo entre dos marcas del workflow. */
export interface FaseDeTicket {
  /** El estado al que se llegó vía transición, o `intake` en la creación. */
  readonly estado: string;
  /** El `at` del evento que abrió la fase, o `null` si el evento no lo traía. */
  readonly inicio: string | null;
  /**
   * El `at` del evento que cerró la fase, o `null` si la fase sigue en curso o
   * si la marca que debía cerrarla no existe.
   */
  readonly fin: string | null;
  /**
   * La duración `fin - inicio` en milisegundos, o `null` si falta cualquiera de
   * las dos marcas o la fase está en curso.
   */
  readonly ms: number | null;
  /** `true` si es la última fase y su estado no es `closed`. */
  readonly enCurso: boolean;
  /**
   * El motivo que el `details` de la transición anexa después del punto, para
   * la fase que llega por una reapertura; `null` si no hay nada después del
   * punto.
   */
  readonly motivo: string | null;
}

/**
 * La acción con la que el motor escribe una transición de ticket.
 *
 * No es `transition`: el motor escribe `` `${entity}-transition` ``
 * (`packages/engine/src/transition.ts`), o sea `ticket-transition`. Es la misma
 * forma que usa `etapas.ts` —una sola definición de la acción evita que dos
 * parsers convivan con formas distintas sin que nada falle.
 */
const ACCION_TRANSICION = "ticket-transition";

/** `Workflow: intake -> analyzed.` → `analyzed`. */
const TRANSICION_RE = /^Workflow: [a-z_]+ -> ([a-z_]+)\.$/;

/** El instante de un evento, o `null` si no trae una hora utilizable. */
function instanteDe(at: string | null): number | null {
  if (at === null) return null;
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? null : ms;
}

/** El `at` de un evento como texto, o `null` si no lo trae. */
function atDe(evento: JsonObject): string | null {
  const at = evento["at"];
  return typeof at === "string" ? at : null;
}

/** La marca que un evento aporta a la serie: su estado destino y su motivo. */
interface Marca {
  readonly estado: string;
  readonly motivo: string | null;
}

/**
 * La marca de una fase a partir de un evento, o `null` si el evento no mueve el
 * workflow.
 *
 * La creación abre en `intake`. Una transición se reconoce sobre su **primera
 * frase** —todo hasta el primer punto— porque la reapertura anexa el motivo en
 * la misma cadena: `Workflow: closed -> changes_requested. Reapertura por
 * hallazgo: …`. Lo que queda después del punto es el motivo, o `null` si no hay
 * nada. Una transición que la regex no reconoce no es marca y se ignora sin
 * romper la serie.
 */
function marcaDe(evento: JsonObject): Marca | null {
  const action = evento["action"];
  const details = typeof evento["details"] === "string" ? evento["details"] : "";

  if (action === "created") {
    return { estado: "intake", motivo: null };
  }
  if (action !== ACCION_TRANSICION) return null;

  const corte = details.indexOf(".");
  const frase = corte === -1 ? details : details.slice(0, corte + 1);
  const match = TRANSICION_RE.exec(frase);
  if (match === null) return null;

  const resto = corte === -1 ? "" : details.slice(corte + 1).trim();
  return {
    estado: match[1] as string,
    motivo: resto === "" ? null : resto,
  };
}

/**
 * La serie de fases del ticket, en orden.
 *
 * Cada evento reconocido cierra la fase anterior —que toma `fin` del evento
 * actual y `ms` de la resta, si ambas marcas tienen hora— y abre la siguiente.
 * Al terminar, la última fase queda sin `fin` ni `ms`: es la que corre ahora,
 * salvo que su estado sea `closed`, que es el ticket cerrado y no una fase viva.
 */
export function fasesPorTicket(
  eventos: readonly JsonObject[],
): readonly FaseDeTicket[] {
  const fases: FaseDeTicket[] = [];

  for (const evento of eventos) {
    const marca = marcaDe(evento);
    if (marca === null) continue;

    const at = atDe(evento);
    const instante = instanteDe(at);

    const anterior = fases[fases.length - 1];
    if (anterior !== undefined) {
      // Cerrar la fase abierta: el evento actual es su fin. La duración necesita
      // las dos horas; si falta una, el tramo se declara no reconstruible.
      const inicioInstante = instanteDe(anterior.inicio);
      fases[fases.length - 1] = {
        ...anterior,
        fin: at,
        ms:
          instante === null || inicioInstante === null
            ? null
            : instante - inicioInstante,
      };
    }

    fases.push({
      estado: marca.estado,
      inicio: at,
      fin: null,
      ms: null,
      enCurso: false,
      motivo: marca.motivo,
    });
  }

  const ultima = fases[fases.length - 1];
  if (ultima !== undefined && ultima.estado !== "closed") {
    fases[fases.length - 1] = { ...ultima, enCurso: true };
  }

  return fases;
}
