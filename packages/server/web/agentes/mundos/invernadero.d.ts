/** Tipos del mundo «Invernadero» de la vista Agentes (`invernadero.js`). */

import type { Mundo, Punto } from "../motor.js";
import type { AgenteDeMundo } from "./index.js";
import type { OpcionesDePersonaje } from "./sprites.js";

/** Un sobre del semillero o un fruto de la cosecha: el identificador del ticket y dónde se dibuja. */
export interface ObjetoConId extends Punto {
  id: string;
}

/** El semillero queda a la izquierda, a la altura del camino de grava. */
export const PUESTO_PRINCIPAL: Punto;

/** Cuántas plantas caben en la tierra de un cantero: el máximo visual por estación. */
export const TOPE_POR_CANTERO: number;

/** Las posiciones de las `n` primeras plantas de un cantero, hasta el tope. */
export function plantasDelCantero(indice: number, n: number): Punto[];
/** La x del centro del cantero de una estación. */
export function xDeCantero(indice: number): number;
/** El jardinero se arrodilla junto a su planta: quieto, con ticket y sin haber terminado. */
export function arrodillado(
  agente: Pick<AgenteDeMundo, "principal" | "fila" | "moviendo" | "estado">,
): boolean;
/** La `y` de los pies al dibujarlo: 26 px más abajo si está arrodillado. */
export function piesDibujados(
  agente: Pick<AgenteDeMundo, "principal" | "fila" | "moviendo" | "estado"> & { readonly y: number },
): number;
/** La etapa de la planta que lleva en la maceta al caminar con su ticket, o `null`. */
export function macetaEnMano(
  agente: Pick<AgenteDeMundo, "principal" | "fila" | "moviendo" | "estacion">,
): number | null;
export function aparienciaDe(
  agente: Pick<AgenteDeMundo, "principal" | "fila" | "moviendo" | "estado">,
): OpcionesDePersonaje;
/** Un jardinero quieto con una pregunta para una persona lleva el «?». */
export function llevaPregunta(agente: Pick<AgenteDeMundo, "estado" | "moviendo">): boolean;
/** La regadera de un cantero flota con un jardinero `esperando` en su estación. */
export function regadera(
  agentes: readonly Pick<AgenteDeMundo, "estado" | "estacion">[] | null | undefined,
  indice: number,
  t: number,
): { flota: boolean; y: number };
/** La lluvia sobre el cantero de quien recibió respuesta hace menos que la ventana. */
export function gotas(
  agentes: readonly (Pick<AgenteDeMundo, "fila"> & { readonly x: number })[] | null | undefined,
  ahoraMs: number,
  ventanaMs?: number,
  t?: number,
): Punto[];
/** Los tres primeros sobres de la cola. */
export function sobresDelSemillero(cola: readonly string[] | null | undefined): ObjetoConId[];
/** Los nueve últimos entregados, los que caben en el cajón. */
export function cosecha(entregados: readonly string[] | null | undefined): ObjetoConId[];

export const mundo: Mundo;
