/** Tipos del mundo «Pastelería» de la vista Agentes (`pasteleria.js`). */

import type { Mundo, Punto } from "../motor.js";
import type { AgenteDeMundo } from "./index.js";
import type { OpcionesDePersonaje } from "./sprites.js";

/** Una comanda pinchada en el pase: el identificador de la cola y dónde se dibuja. */
export interface Comanda extends Punto {
  id: string;
}

/** El pase está a la izquierda, a la altura del suelo del obrador. */
export const PUESTO_PRINCIPAL: Punto;

/** Cuántos pasteles caben sobre el mostrador de un puesto: el máximo visual por estación. */
export const TOPE_POR_PUESTO: number;
/** Cuántos pasteles caben en la vitrina final. */
export const TOPE_VITRINA: number;

/** La etapa del pastel de un agente: la estación en que está. */
export function etapaDelPastel(agente: Pick<AgenteDeMundo, "estacion">): number;
/** Las comandas pinchadas en el pase: una por identificador de la cola. */
export function comandasDelPase(cola: readonly string[] | null | undefined): Comanda[];
/** Los tickets de cada estación, recortados al tope del puesto (las siete primeras) o de la vitrina (la última). */
export function repartoDeLaPasteleria<T extends { estado: string | null }>(
  tickets: readonly T[] | null | undefined,
): T[][];
/** Los tickets cerrados que se acumulan en la vitrina, hasta su tope. */
export function pastelesDeLaVitrina<T extends { estado: string | null }>(
  tickets: readonly T[] | null | undefined,
): T[];
/** Las posiciones de los `n` primeros pasteles de un puesto, hasta el tope. */
export function pastelesDelPuesto(indice: number, n: number): Punto[];
/** El horno está encendido si un agente trabaja, quieto, en la estación del horno. */
export function hornoEncendido(
  agentes: readonly Pick<AgenteDeMundo, "estado" | "moviendo" | "estacion">[] | null | undefined,
): boolean;
/**
 * Lo que el mostrador muestra: `lampara` encendida con una pregunta abierta en su puesto y
 * `ventanilla` con el PO asomado si alguien respondió hace menos de la ventana.
 */
export function senalDelMostrador(
  agentes: readonly Pick<AgenteDeMundo, "estacion" | "fila">[] | null | undefined,
  ahoraMs: number,
  ventanaMs?: number,
): { lampara: boolean; ventanilla: boolean };
/** Un pastelero quieto con una pregunta para una persona lleva el «?». */
export function llevaPregunta(agente: Pick<AgenteDeMundo, "estado" | "moviendo">): boolean;
/** Delantal, camisa y toque por estado visual. */
export function aparienciaDe(agente: Pick<AgenteDeMundo, "estado" | "carril">): OpcionesDePersonaje;

export const mundo: Mundo;
