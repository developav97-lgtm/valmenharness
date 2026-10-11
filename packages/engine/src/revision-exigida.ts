/**
 * Lo que falta de la revisión del diff para entregar un ticket (R-REV-004 y R-REV-005).
 *
 * Con `code-review: exigida` en `.valmen/config.yaml` (`codeReviewExigida`), pasar a
 * `awaiting_user_tests` pide un recibo vigente de la compuerta `code-review`. Esta es la única
 * lectura de ese recibo: la impone `transition` y la dice `computeNextStep`, para que lo que se le
 * indica al agente y lo que el motor le exige no puedan divergir.
 *
 * Solo se compara el árbol de trabajo, no el hash del texto del ticket: el recibo de `code-review`
 * guarda el de su entrada congelada, no el del ticket (mover el ticket no lo caduca; un commit o un
 * archivo funcional editado, sí).
 */
import type { GateReceipt } from "@valmen/gate";

import { motivoDeArbolNoVigente } from "./arbol-probado.js";
import type { RegistryPaths } from "./discovery.js";
import { veredictoDeCompuerta } from "./receipts.js";

/** Lo que impide entregar, o `null` si la revisión está al día. */
export interface RevisionPendiente {
  /** Qué hacer y por qué, con el comando exacto; es el mensaje del rechazo y el paso que se indica. */
  readonly motivo: string;
  /** `true` si lo que falta es la decisión de una persona (no se corre otra vez ni se sustituye). */
  readonly persona: boolean;
  /** El recibo del que sale, o `null` si no hay ninguno. */
  readonly recibo: GateReceipt | null;
}

function resumir(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > 200 ? `${limpio.slice(0, 197)}...` : limpio;
}

/**
 * Evalúa el último recibo de `code-review` y dice qué falta para entregar.
 *
 * `sin-recibo`, un `block` de la ronda 1 y un rechazo humano se corrigen y se vuelven a correr; un
 * `review` (la segunda ronda que no aprueba, o cualquier escalada sin firma) lo decide una persona
 * con `gate-decide`; un `approve` o un `review` aprobado por una persona valen mientras el árbol
 * de trabajo sea el revisado.
 */
export function revisionPendiente(
  paths: RegistryPaths,
  ticketId: string,
  recibos: readonly GateReceipt[],
): RevisionPendiente | null {
  const correr = `valmen gate code-review --id ${ticketId}`;
  const veredicto = veredictoDeCompuerta(recibos, "code-review");

  if (veredicto.tipo === "sin-recibo") {
    return {
      motivo: `La entrega requiere la revisión del diff:\n  ${correr}`,
      persona: false,
      recibo: null,
    };
  }

  const { recibo } = veredicto;
  const razon = recibo.reason.trim() === "" ? "" : `: ${resumir(recibo.reason)}`;

  if (veredicto.tipo === "aprobada") {
    const motivo = motivoDeArbolNoVigente(recibo, paths, ticketId, "code-review");
    return motivo === null ? null : { motivo, persona: false, recibo };
  }

  const decision = recibo.humanDecision;
  if (veredicto.tipo === "bloqueada" && decision !== null) {
    return {
      motivo:
        `${decision.actor} rechazó la revisión del diff (recibo ${recibo.id})` +
        `${decision.reason.trim() === "" ? "" : `: ${resumir(decision.reason)}`}. ` +
        `Corrige lo que pidió y vuelve a correrla: ${correr}`,
      persona: false,
      recibo,
    };
  }
  if (veredicto.tipo === "bloqueada" && (recibo.codeReview?.ronda ?? 1) < 2) {
    return {
      motivo:
        `La revisión del diff bloqueó (recibo ${recibo.id}${razon}). Haz una sola corrección ` +
        `acotada a los hallazgos del recibo ${recibo.id} y vuelve a correrla: ${correr}`,
      persona: false,
      recibo,
    };
  }

  return {
    motivo:
      `La revisión del diff (recibo ${recibo.id}) está en \`${recibo.outcome}\` y no tiene una ` +
      `decisión humana registrada${razon}. La decide una persona: ni el modelo ni quien mueve el ` +
      "ticket la sustituyen. Preséntale el veredicto y, con su frase literal, que la registre:\n" +
      `  valmen gate-decide --id ${ticketId} --receipt ${recibo.id} --decision approve ` +
      '--actor <nombre> --reason "<frase literal>"\n' +
      "Si se rechaza o el código cambia, se corrige y se vuelve a correr: " +
      correr,
    persona: true,
    recibo,
  };
}
