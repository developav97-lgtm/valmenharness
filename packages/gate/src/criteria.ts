/**
 * La forma de un criterio de aceptación, leída sin modelo.
 *
 * Un criterio se despliega como una proposición **atómica**: el enunciado
 * interpola su texto y nada más —`criterionProposition` en `dynamic.ts`—. Por eso
 * un criterio que junta varias afirmaciones produce una proposición que se
 * resuelve a favor de «cubierto en parte» y cae en 0.87–0.89 contra un umbral de
 * 0.90: en banda de revisión, aunque el plan lo cubra entero.
 *
 * Medido sobre `FEATURE-ENGINE-REANUDAR-COMPACTO-20260926`: la media subió de
 * 0.743 a 0.890 —y el veredicto pasó a `approve`— partiendo un criterio compuesto
 * en atómicos, sin tocar el plan. El bloqueo se corría de criterio en criterio
 * mientras cada uno siguiera siendo compuesto.
 *
 * Esto cuenta afirmaciones y nada más: no opina sobre el plan, no evalúa y no
 * cambia ningún umbral. Lo que produce alimenta un **aviso**, y un aviso no puede
 * desbloquear lo que otra proposición bloqueó: es el límite que R-S5-007 le pone a
 * toda validación nueva.
 */
import type { CriterionSpec } from "./dynamic.js";

/** La forma de un criterio, con lo que se contó para decidirla. */
export interface FormaDeCriterio {
  /** El número del criterio, 1-based, igual que la proposición `criterio_NN`. */
  readonly index: number;
  /** El texto del criterio, sin sus anotaciones. */
  readonly text: string;
  /** Cuántas afirmaciones se contaron. */
  readonly afirmaciones: number;
  /** `true` si agrupa dos o más, o si se pasa de largo. */
  readonly compuesto: boolean;
  /** Por qué se marcó así, para que el aviso lo pueda decir. */
  readonly motivos: readonly string[];
}

/**
 * A partir de cuántos caracteres un criterio es sospechoso aunque tenga una sola
 * frase.
 *
 * Un criterio largo suele ser varios criterios pegados con comas, que es la forma
 * de unirlos sin que la conjunción lo delate. El tope es deliberadamente alto:
 * marca los casos evidentes y no discute con un criterio que solo es detallado.
 */
const LONGITUD_SOSPECHOSA = 320;

/** Las conjunciones que unen dos afirmaciones dentro de la misma frase. */
const CONJUNCIONES = /(?:^|\s)(?:as[íi] como|y|e|o|u)(?=\s)/giu;

/**
 * Cuántas afirmaciones tiene un texto.
 *
 * Se cuentan separadores, no se interpreta: `;` separa afirmaciones de forma
 * explícita, y una conjunción con espacios alrededor une dos dentro de la misma
 * frase. Los espacios son lo que evita que «apoyo» o «otro» cuenten como
 * conjunción, y por eso el patrón no es una simple búsqueda de la letra.
 */
export function afirmacionesDe(texto: string): number {
  const limpio = texto.trim();
  if (limpio === "") return 0;

  return limpio
    .split(";")
    .filter((parte) => parte.trim() !== "")
    .reduce((total, parte) => total + 1 + (parte.match(CONJUNCIONES)?.length ?? 0), 0);
}

/**
 * Analiza la forma de cada criterio.
 *
 * Devuelve una entrada por criterio, en el mismo orden en que el gate los
 * despliega, así que `index` es exactamente el `NN` de `criterio_NN`.
 */
export function analizarFormaDeCriterios(
  criteria: readonly CriterionSpec[],
): readonly FormaDeCriterio[] {
  return criteria.map((criterion, posicion) => {
    const afirmaciones = afirmacionesDe(criterion.text);
    const motivos: string[] = [];

    if (afirmaciones >= 2) {
      motivos.push(`agrupa ${afirmaciones} afirmaciones`);
    }
    if (criterion.text.trim().length > LONGITUD_SOSPECHOSA) {
      motivos.push(`tiene ${criterion.text.trim().length} caracteres`);
    }

    return {
      index: posicion + 1,
      text: criterion.text,
      afirmaciones,
      compuesto: motivos.length > 0,
      motivos,
    };
  });
}

/** El identificador de la proposición de un criterio, como lo escribe el gate. */
export function criterionPropositionId(index: number): string {
  return `criterio_${String(index).padStart(2, "0")}`;
}

/** Las palabras con que un criterio `test:` afirma que una prueba pasa o que el monorepo compila. */
const VERBO_DE_PRUEBA = /(?:^|[^\p{L}])(?:pasa|pasan|compila)(?![\p{L}])/iu;

/**
 * ¿Es un criterio «la prueba pasa» o «el monorepo compila»?
 *
 * Declara un comando, afirma una sola cosa y esa cosa es que la prueba pasa o que compila:
 * lo que el gate mecánico ya ejecuta y el plan solo tiene que citar. Un `test:` que describe
 * un comportamiento no entra: sigue yendo al evaluador.
 */
export function esCriterioDePrueba(criterio: CriterionSpec): boolean {
  return (
    criterio.command !== null &&
    afirmacionesDe(criterio.text) === 1 &&
    VERBO_DE_PRUEBA.test(criterio.text)
  );
}

/** ¿Se decide su proposición en código? Un manual (`dev` incluido) o un criterio de prueba. */
export function seDecideEnCodigo(criterio: CriterionSpec): boolean {
  return criterio.manual || esCriterioDePrueba(criterio);
}
