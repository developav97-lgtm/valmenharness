/**
 * El tamaño del `AGENTS.md` proyectado, y el presupuesto que el proyecto le pone.
 *
 * `AGENTS.md` se carga entero en cada sesión. Un documento que crece sin tope se
 * paga en cada conversación, y crece por acumulación —una regla más, un «Por qué»
 * más largo— sin que nadie decida que pese 54 KB. El presupuesto vuelve ese número
 * una decisión: el proyecto declara cuánto está dispuesto a cargar y `sync` avisa
 * cuando se pasa.
 *
 * Avisa y **no** bloquea: un documento pasado de tamaño sigue siendo el que el
 * proyecto declaró, y negarse a escribirlo dejaría a los agentes con el anterior.
 */
import { fail } from "@valmen/core";

import { type ConfigMap, readString } from "./config.js";

/** El menor presupuesto que se acepta, en bytes. */
export const AGENTS_MD_BUDGET_MIN = 1000;

/** El tamaño de un `AGENTS.md` proyectado. */
export interface AgentsMdSize {
  /** Bytes en UTF-8: lo que ocupa el archivo en disco. */
  readonly bytes: number;
  /**
   * Tokens estimados, `ceil(bytes / 4)`.
   *
   * Es una estimación y se muestra con `~`: no hay un tokenizador sin red, y lo que
   * importa es comparar un documento con él mismo antes y después, no el número
   * absoluto.
   */
  readonly estimatedTokens: number;
  /** El presupuesto declarado en bytes, o `null` si el proyecto no declara ninguno. */
  readonly budget: number | null;
  /** `true` si hay presupuesto y el documento lo supera. */
  readonly exceeded: boolean;
}

/**
 * Lee `agents-md-budget` de la configuración, en bytes.
 *
 * Sin la clave no hay presupuesto y no hay aviso. Un valor que no sea un entero de al
 * menos `AGENTS_MD_BUDGET_MIN` **falla**: un presupuesto mal escrito que se ignora
 * deja al proyecto creyendo que lo vigila.
 */
export function readAgentsMdBudget(config: ConfigMap): number | null {
  const crudo = readString(config, "agents-md-budget", "");
  if (crudo === "") return null;

  const valor = /^\d+$/.test(crudo) ? Number(crudo) : Number.NaN;
  if (!Number.isSafeInteger(valor) || valor < AGENTS_MD_BUDGET_MIN) {
    fail(
      `config.yaml: "agents-md-budget" debe ser un entero de bytes de al menos ` +
        `${AGENTS_MD_BUDGET_MIN} (por ejemplo 24000); recibí «${crudo}».`,
    );
  }
  return valor;
}

/** Mide un `AGENTS.md` ya proyectado contra el presupuesto, si lo hay. */
export function measureAgentsMd(content: string, budget: number | null): AgentsMdSize {
  const bytes = Buffer.byteLength(content, "utf8");
  return {
    bytes,
    estimatedTokens: Math.ceil(bytes / 4),
    budget,
    exceeded: budget !== null && bytes > budget,
  };
}

/** Un entero con espacios entre miles: 54425 → «54 425». */
function conMiles(valor: number): string {
  return String(valor).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** La línea que dice cuánto pesa el documento. */
export function describeAgentsMdSize(size: AgentsMdSize): string {
  const base = `${conMiles(size.bytes)} B (~${conMiles(size.estimatedTokens)} tokens)`;
  return size.budget === null ? base : `${base}, presupuesto ${conMiles(size.budget)} B`;
}

/**
 * El aviso cuando el documento pasa del presupuesto, o `null` si no lo pasa.
 *
 * Dice **cuánto** se pasa y **qué hacer**: un aviso que solo dijera «es grande»
 * obligaría a adivinar por dónde empezar a recortar.
 */
export function agentsMdWarning(size: AgentsMdSize): string | null {
  if (!size.exceeded || size.budget === null) return null;
  const sobra = size.bytes - size.budget;
  return (
    `AGENTS.md pasa del presupuesto: ${conMiles(size.bytes)} B (~${conMiles(size.estimatedTokens)} ` +
    `tokens) contra ${conMiles(size.budget)} B, ${conMiles(sobra)} B de más. ` +
    "Para bajarlo: encamina las reglas que solo aplican a un tipo de trabajo a sus skills " +
    "con `rules-to-skills` en .valmen/config.yaml, o acorta el texto de .valmen/rules/."
  );
}
