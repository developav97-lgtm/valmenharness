/** Tipos del motor de escena de la vista Agentes (`motor.js`). */

export interface Estacion {
  readonly id: string;
  readonly humano?: boolean;
}

export type EstadoVisual = "trabajando" | "esperando" | "termino" | "principal";

export interface Punto {
  x: number;
  y: number;
}

/** Lo que un mundo debe aportar; el motor no conoce ninguno por nombre. */
export interface Mundo {
  id: string;
  nombre: string;
  lema: string;
  pregunta: string;
  estaciones: readonly string[];
  puestoPrincipal: Punto;
  posicion(indice: number, carril: number): Punto;
  dibujar(estado: unknown, t: number): void;
}

/** La forma mínima de una fila de `AgenteDeCorrida` que el motor consume. */
export interface FilaDeAgente {
  readonly agente: string;
  readonly principal: boolean;
  readonly estado: "trabajando" | "esperando" | "termino";
  readonly ticketEstado: string | null;
  readonly faseConfirmada: string | null;
  readonly faseInferida: string | null;
  readonly ultimaHerramienta: string | null;
}

export interface AgenteEnEscena {
  id: string;
  fila: FilaDeAgente;
  x: number;
  y: number;
  objetivoX: number;
  objetivoY: number;
  carril: number;
  paso: number;
  moviendo: boolean;
  estacion: number;
  desvio: boolean;
  ultimaValida: number | null;
  rotulo: string;
  estado: EstadoVisual;
  principal: boolean;
  saleEn: number | null;
}

export interface Escena {
  mundo: Mundo;
  t: number;
  agentes: Map<string, AgenteEnEscena>;
  orden: string[];
  siguienteCarril: number;
}

export const ESTACIONES: readonly Estacion[];
export const ESTADOS_VISUALES: readonly EstadoVisual[];
export const VELOCIDAD_PX_S: number;
export const SALIDA_MS: number;

export function estacionDe(
  fila: Pick<FilaDeAgente, "ticketEstado">,
  ultimaValida?: number | null,
): { indice: number; desvio: boolean };
export function rotuloDe(
  fila: Pick<FilaDeAgente, "faseConfirmada" | "faseInferida" | "ultimaHerramienta">,
): string;
export function estadoVisualDe(fila: Pick<FilaDeAgente, "principal" | "estado">): EstadoVisual;
export function validarMundo(mundo: unknown): string[];
export function crearEscena(mundo: Mundo): Escena;
export function objetivoDe(mundo: Mundo, agente: Pick<AgenteEnEscena, "principal" | "saleEn" | "estacion" | "carril">): Punto;
export function actualizar(escena: Escena, filas: readonly FilaDeAgente[], ahoraMs: number): void;
export function avanzar(escena: Escena, dtSegundos: number, ahoraMs: number): void;
export function carrilLibre(escena: Escena): number;
/** Los tickets `{ id, estado }` repartidos por estación (índice de `ESTACIONES`) y recortados al tope. */
export function ticketsPorEstacion<T extends { estado: string | null }>(
  tickets: readonly T[] | null | undefined,
  topes: number | readonly number[],
): T[][];
