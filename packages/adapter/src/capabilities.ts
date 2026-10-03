/**
 * Perfil declarado de lo que un adaptador puede ofrecer.
 *
 * Describe compatibilidad, no consentimiento ni salud de una instalación. La
 * configuración del proyecto decide qué fuentes se pueden usar; este contrato
 * permite que cada lector declare qué operaciones soporta sin abrir conexiones.
 */

/** Las operaciones que todo adaptador declara, incluso cuando no las soporta. */
export const ADAPTER_CAPABILITIES = [
  "observe-states",
  "read-activity",
  "read-messages",
  "dispatch",
] as const;

export type AdapterCapability = (typeof ADAPTER_CAPABILITIES)[number];

/** La disponibilidad y restricción pública de una operación del adaptador. */
export interface AdapterCapabilityDeclaration {
  readonly capability: AdapterCapability;
  readonly available: boolean;
  /** `null` declara que no hay límite adicional; si no está disponible, explica por qué. */
  readonly limitation: string | null;
}

/** Perfil inmutable que un adaptador publica para sus consumidores. */
export interface AdapterCapabilities {
  readonly adapter: string;
  readonly capabilities: readonly AdapterCapabilityDeclaration[];
}

/** Forma de entrada, separada para que la salida nunca comparta colecciones mutables. */
export interface AdapterCapabilitiesInput {
  readonly adapter: string;
  readonly capabilities: readonly AdapterCapabilityDeclaration[];
}

const ADAPTER_ID_RE = /^[a-z][a-z0-9-]{0,63}$/;
const LIMITATION_RE = /^[^\r\n]*\S[^\r\n]*$/;

/**
 * Valida y congela un perfil completo.
 *
 * Exigir las cuatro entradas evita que la ausencia de una operación se confunda
 * con un dato todavía no declarado. No consulta configuración, bindings ni red.
 */
export function createAdapterCapabilities(input: AdapterCapabilitiesInput): AdapterCapabilities {
  if (!ADAPTER_ID_RE.test(input.adapter)) {
    throw new Error("adapter debe ser un identificador portable en minúsculas, sin rutas ni espacios.");
  }

  const seen = new Set<AdapterCapability>();
  const capabilities = input.capabilities.map((entry) => {
    if (!ADAPTER_CAPABILITIES.includes(entry.capability)) {
      throw new Error("capability debe ser una capacidad de adaptador conocida.");
    }
    if (seen.has(entry.capability)) {
      throw new Error(`capability no puede repetir \"${entry.capability}\".`);
    }
    seen.add(entry.capability);

    if (typeof entry.available !== "boolean") {
      throw new Error("available debe declarar true o false.");
    }
    if (entry.limitation !== null && !LIMITATION_RE.test(entry.limitation)) {
      throw new Error("limitación debe ser texto visible de una sola línea o null.");
    }
    if (!entry.available && entry.limitation === null) {
      throw new Error("Una capacidad no disponible requiere una limitación explícita.");
    }

    return Object.freeze({
      capability: entry.capability,
      available: entry.available,
      limitation: entry.limitation,
    });
  });

  if (seen.size !== ADAPTER_CAPABILITIES.length) {
    throw new Error("El perfil debe declarar las cuatro capacidades de adaptador.");
  }

  return Object.freeze({
    adapter: input.adapter,
    capabilities: Object.freeze(capabilities),
  });
}
