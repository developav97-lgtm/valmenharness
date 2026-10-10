/** Tipos de la capa de montaje del lienzo de la vista Agentes (`montaje.js`). */

import type { Escena, FilaDeAgente, Mundo } from "./motor.js";
import type { PreguntaDeFila } from "./mundos/index.js";

export const CLAVE_MUNDO: string;
/** Cuánto tiempo después de contestada se sigue mostrando que alguien respondió. */
export const VENTANA_RESPUESTA_MS: number;
/** Con movimiento reducido la escena se redibuja a cuatro cuadros por segundo. */
export const INTERVALO_REDUCIDO_MS: number;

/** El almacén de preferencias del navegador (`localStorage`): solo lo que el módulo usa. */
export interface AlmacenDeMundo {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

/** Un ticket de la corrida tal como lo dibujan los mundos: su identificador y su estado de registro. */
export interface TicketDeEscena {
  id: string;
  estado: string | null;
}

/** La fila de un agente con la que se arman los avisos de pregunta. */
export interface FilaConPregunta {
  readonly agente: string;
  readonly ticket?: string | null;
  readonly pregunta?: PreguntaDeFila | null;
}

/** Un aviso de pregunta: pendiente de una persona, o respondida hace menos de un minuto. */
export interface AvisoDePregunta {
  tipo: "pendiente" | "respondio";
  encabezado: string;
  /** Solo en el aviso pendiente. */
  quien?: string;
  ticket: string;
  hace: string;
  /** Solo en el aviso pendiente: cómo se expresa la pregunta en el mundo elegido. */
  expresion?: string;
  /** Solo en el aviso pendiente, y solo si la pregunta trae un texto con algo visible. */
  texto?: string;
  /** Solo en el aviso respondido, y solo si la respuesta trae un texto con algo visible. */
  respuesta?: string;
}

/** Un nodo del documento: lo único que `cajaDeAviso` le pide. */
export interface NodoDeAviso {
  className: string;
  textContent: string | null;
  append(...nodos: NodoDeAviso[]): void;
}

/** El documento llega inyectado para que el módulo no tenga `document` propio. */
export interface DocumentoDeAviso {
  createElement(etiqueta: string): NodoDeAviso;
}

/** Una fila del panel «Agentes»: la sesión principal primero y luego los agentes vivos. */
export interface FilaDePanel {
  agente: string;
  nombre: string;
  principal: boolean;
  estado: string;
  ticket: string | null;
  descripcion: string | null;
  modelo: string | null;
  esfuerzo: string | null;
  faseConfirmada: string | null;
  faseInferida: string | null;
  ultimaHerramientaEn: string | null;
  fase: string;
  inferida: boolean;
  ultimaHerramienta: string | null;
}

/** Un agente de la corrida tal como lo recibe el panel: `estado` es el de `AgenteDeCorrida`. */
export interface AgenteDePanel {
  readonly agente: string;
  readonly principal?: boolean;
  readonly estado: string;
  readonly ticket?: string | null;
  readonly descripcion?: string | null;
  readonly modelo?: string | null;
  readonly esfuerzo?: string | null;
  readonly faseConfirmada?: string | null;
  readonly faseInferida?: string | null;
  readonly ultimaHerramientaEn?: string | null;
  readonly ultimaHerramienta?: string | null;
}

/** El lienzo: el módulo solo le pide el contexto 2D. */
export interface Lienzo {
  getContext?(tipo: string): unknown;
}

/** Los datos de la corrida que acompañan a las filas de agentes. */
export interface DatosDelMontaje {
  cola?: readonly string[];
  entregados?: readonly string[];
  tickets?: readonly TicketDeEscena[];
}

/** Todo llega inyectado —el reloj, el cuadro de animación, el almacén y la visibilidad—: así se prueba sin navegador. */
export interface OpcionesDeMontaje {
  mundos?: readonly Mundo[];
  almacen?: AlmacenDeMundo | null;
  pedirCuadro: (cuadro: () => void) => number;
  cancelarCuadro: (id: number) => void;
  visible?: () => boolean;
  ahora?: () => number;
  reducirMovimiento?: () => boolean;
}

export interface Montaje {
  /** Idempotente: la primera vez crea la escena y el bucle de cuadros; las siguientes solo fusionan las filas. */
  montar(
    lienzo: Lienzo,
    filas: readonly FilaDeAgente[],
    ahoraMs: number,
    datos?: DatosDelMontaje | null,
  ): void;
  desmontar(): void;
  /** `false` si el identificador no es de un mundo registrado. */
  elegirMundo(id: string): boolean;
  mundoActual(): Mundo;
  /** `null` mientras no se haya montado. */
  escena(): Escena | null;
  mundos(): readonly Mundo[];
  /** Olvida la escena: otro proyecto no hereda las posiciones del anterior. */
  reiniciar(): void;
}

/** El mismo formato de «hace cuánto» que usa la vista, como función pura. */
export function haceCuanto(iso: string | null | undefined, ahoraMs: number): string;
/** El mundo guardado en este navegador, o la pastelería si no hay, no es válido o el almacén falla. */
export function leerMundoElegido(
  almacen: Pick<AlmacenDeMundo, "getItem"> | null | undefined,
  ids: readonly string[],
): string;
export function guardarMundoElegido(
  almacen: Pick<AlmacenDeMundo, "setItem"> | null | undefined,
  id: string,
): void;
/** Un aviso por fila con pregunta: abierta, o respondida hace menos de un minuto. */
export function avisosDePregunta(
  filas: readonly FilaConPregunta[] | null | undefined,
  ahoraMs: number,
  mundo: Pick<Mundo, "pregunta">,
): AvisoDePregunta[];
/** La caja de un aviso; el texto de la pregunta y la respuesta se asignan solo con `textContent`, nunca como HTML. */
export function cajaDeAviso(doc: DocumentoDeAviso, aviso: AvisoDePregunta): NodoDeAviso;
export function filasDePanelAgentes(agentes: readonly AgenteDePanel[] | null | undefined): FilaDePanel[];
export function crearMontaje(opciones: OpcionesDeMontaje): Montaje;
