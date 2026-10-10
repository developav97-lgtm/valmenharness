/** Tipos del registro de mundos de la vista Agentes (`index.js`) y de lo que los tres mundos leen de la escena. */

import type { Mundo } from "../motor.js";

/** La pregunta de una fila, como la leen los mundos y los avisos de la vista. */
export interface PreguntaDeFila {
  readonly desde?: string | null;
  readonly respondidaEn?: string | null;
  readonly texto?: string | null;
  readonly respuesta?: string | null;
}

/** La fila de un agente tal como llega a un mundo: solo lo que los mundos consultan. */
export interface FilaDeMundo {
  readonly agente?: string;
  readonly ticket?: string | null;
  readonly pregunta?: PreguntaDeFila | null;
  readonly ultimaHerramienta?: string | null;
}

/**
 * Un agente de la escena tal como lo leen los mundos. Cada función declara con `Pick` los campos que
 * lee. `estado` es un `EstadoVisual` de `motor.d.ts`, pero los mundos solo lo comparan.
 */
export interface AgenteDeMundo {
  readonly id?: string;
  readonly estado: string;
  readonly estacion: number;
  readonly carril?: number;
  readonly paso?: number;
  readonly moviendo?: boolean;
  readonly principal?: boolean;
  readonly saleEn?: number | null;
  readonly x?: number;
  readonly y?: number;
  readonly fila?: FilaDeMundo;
}

/** Los tres mundos, en el orden del selector: pastelería, centro de control e invernadero. */
export const MUNDOS: readonly [Mundo, Mundo, Mundo];

export const MUNDO_POR_DEFECTO: "pasteleria";
