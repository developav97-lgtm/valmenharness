/** Tipos de los sprites compartidos de los mundos de la vista Agentes (`sprites.js`). */

/**
 * El contexto 2D del lienzo. Estos módulos no usan los tipos del DOM: en el navegador llega el de
 * `<canvas>` y en las pruebas un contexto falso que registra las llamadas.
 */
export type ContextoDeLienzo = Record<string, unknown>;

/** Escala del bitmap: cada píxel del sprite mide tres del lienzo. */
export const ESCALA: number;
export const ANCHO_SPRITE: number;
export const ALTO_SPRITE: number;

/** El cuerpo: doce filas de doce caracteres (`.` es transparente). */
export const BASE: readonly string[];
/** Los tres cuadros de piernas: el 0 en reposo, el 1 y el 2 al caminar. */
export const PIERNAS: readonly (readonly string[])[];

export type NombreDeSombrero = "toque" | "auricular" | "gorra" | "paja" | "gafas";

export interface Sombrero {
  readonly dy: number;
  readonly filas: readonly string[];
}

export const SOMBREROS: Readonly<Record<NombreDeSombrero, Sombrero>>;

/** Lo que el sprite lee de un agente de escena: todo es opcional, un dato que falta se toma como 0 o falso. */
export interface AgenteDibujable {
  readonly moviendo?: boolean;
  readonly paso?: number;
  readonly carril?: number;
  readonly principal?: boolean;
}

/** Color de camisa, pelo y piel de un carril. */
export interface Rasgos {
  color: string;
  pelo: string;
  piel: string;
}

/** Los adornos con que un mundo viste al personaje; los que faltan salen de los rasgos del carril. */
export interface OpcionesDePersonaje {
  camisa?: string;
  delantal?: string;
  pantalon?: string;
  pelo?: string;
  piel?: string;
  sombrero?: NombreDeSombrero;
  sombreroColor?: string;
  bandaColor?: string;
  sentado?: boolean;
}

/** El cuadro de marcha: 0, 1, 0, 2 al caminar y 0 en reposo. */
export function cuadroDeMarcha(agente?: Pick<AgenteDibujable, "moviendo" | "paso"> | null): number;
/** Siempre los mismos rasgos para el mismo carril, sin azar. */
export function rasgosDe(carril: number): Rasgos;
/** Dibuja un personaje con los pies en (`cx`, `pies`) y devuelve la `y` de la cabeza. */
export function dibujarPersonaje(
  ctx: ContextoDeLienzo,
  agente: AgenteDibujable | null | undefined,
  cx: number,
  pies: number,
  opciones?: OpcionesDePersonaje,
): number;
