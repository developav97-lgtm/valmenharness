/** Tipos del mundo «Centro de control» de la vista Agentes (`control.js`). */

import type { Mundo, Punto } from "../motor.js";
import type { AgenteDeMundo } from "./index.js";
import type { ContextoDeLienzo, OpcionesDePersonaje } from "./sprites.js";

/** Un punto por operador: su x sobre la pista y si va en camino a otra pantalla. */
export interface PuntoDeTicket {
  x: number;
  moviendo: boolean;
}

/** La memoria de los puntos: el último `t` visto y un punto por operador. */
export interface MemoriaDePuntos {
  puntos: Map<string, PuntoDeTicket>;
  t: number | null;
}

/** La franja de turno: `alerta` con una pregunta abierta. */
export interface Franja {
  alerta: boolean;
  texto: string;
}

/** El monitor de la consola de un operador. */
export interface Monitor {
  color: string;
  rotulo: string;
}

export const PUESTO_PRINCIPAL: Punto;

/** El identificador corto de un ticket: sus dos primeros segmentos. */
export function corto(id: unknown): string;
/** La x de la pantalla de una estación, y la del punto de un ticket en esa estación. */
export function xDePantalla(i: number): number;
/** El ancho de la barra de un ticket: crece con la estación. */
export function anchoDeBarra(i: number): number;
/** Los identificadores que muestra la pantalla `i`: como mucho tres. */
export function ticketsEnPantalla(
  agentes: readonly Pick<AgenteDeMundo, "principal" | "fila" | "estacion" | "estado" | "carril">[] | null | undefined,
  entregados: readonly string[] | null | undefined,
  i: number,
): string[];
export function monitorDe(
  agente: Pick<AgenteDeMundo, "estado" | "saleEn" | "carril" | "fila">,
  t?: number,
): Monitor;
export function franja(
  agentes: readonly Pick<AgenteDeMundo, "principal" | "fila" | "estacion" | "estado">[] | null | undefined,
): Franja;
/** El texto, o su prefijo más largo que con «…» cabe en `anchoPx`; sin medida disponible, el texto. */
export function ajustarAlAncho(ctx: ContextoDeLienzo, texto: string, anchoPx: number): string;
export function colorDeFranja(alerta: boolean, t?: number): string;
export function telefono(
  agentes: readonly Pick<AgenteDeMundo, "fila">[] | null | undefined,
  ahoraMs: number,
  ventanaMs?: number,
): { encendido: boolean; poEnLinea: boolean };
export function aparienciaDelDirector(): OpcionesDePersonaje;
export function aparienciaDelOperador(agente: Pick<AgenteDeMundo, "moviendo">): OpcionesDePersonaje;
export function crearMemoria(): MemoriaDePuntos;
/** Mueve el punto de cada operador hacia la pantalla de su estación y devuelve la misma memoria. */
export function avanzarPuntos(
  memoria: MemoriaDePuntos,
  agentes: readonly Pick<AgenteDeMundo, "id" | "principal" | "fila" | "estacion">[] | null | undefined,
  t: number,
): MemoriaDePuntos;
/** La memoria del módulo: solo la usa el dibujo con `miniatura: false`. */
export const memoriaDePuntos: MemoriaDePuntos;

export const mundo: Mundo;
