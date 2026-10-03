/**
 * Referencia portable a un modelo declarado u observado por un adaptador.
 *
 * El proveedor y el identificador se conservan separados: el primero ubica la
 * fuente del catálogo y el segundo admite el slash habitual de algunos
 * catálogos sin convertirse en una ruta de disco.
 */

/** Proveedor lógico de un modelo, con la misma forma que una etiqueta de adaptador. */
export const MODEL_PROVIDER_RE = /^[a-z][a-z0-9._-]{0,63}$/;

/**
 * Identificador portable de catálogo. Puede contener segmentos separados por
 * un slash (`openai/gpt-6.1`), pero nunca inicia, termina ni duplica ese slash.
 */
export const MODEL_ID_RE =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}(?:\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127})*$/;

/** Identidad de modelo que puede persistirse en un hecho de ejecución. */
export interface ModelReference {
  readonly provider: string;
  readonly model: string;
}

/** Valida y congela la identidad de modelo, sin resolverla ni contactar proveedores. */
export function createModelReference(input: ModelReference): ModelReference {
  if (!MODEL_PROVIDER_RE.test(input.provider)) {
    throw new Error(
      "provider debe ser una etiqueta de proveedor en minúsculas, sin espacios.",
    );
  }
  if (!MODEL_ID_RE.test(input.model)) {
    throw new Error("model debe ser un identificador portable, sin rutas ni espacios.");
  }
  return Object.freeze({ provider: input.provider, model: input.model });
}
