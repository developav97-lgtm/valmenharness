/**
 * Tipos del verificador de la interfaz.
 *
 * El script es `.mjs` —tiene que poder ejecutarse con `node` sin compilar, porque
 * también es un comando—, y sin esta declaración el test que lo importa ve un
 * `any` implícito. El typecheck no debe depender de que un archivo de herramienta
 * esté compilado para poder leerlo.
 */

/** Un nodo del DOM mínimo que usa el verificador. */
export interface NodoFalso {
  readonly tagName: string;
  readonly nodeName: string;
  readonly children: NodoFalso[];
  readonly parentNode?: NodoFalso;
  /** El texto del nodo. Los de texto lo llevan; los elementos, no. */
  readonly _texto?: string;
  readonly className?: string;
  /** El valor de un campo de texto: una prueba lo escribe antes de disparar `input`. */
  value?: string;
  readonly placeholder?: string;
  /** Un botón deshabilitado no se debería poder pulsar. */
  disabled?: boolean;
  /** Los oyentes que la interfaz registró, por tipo de evento. */
  readonly _oyentes?: Record<string, ((evento: unknown) => unknown)[]>;
}

/** Lo que devuelve ejecutar la interfaz. */
export interface ResultadoDeInterfaz {
  /** El nodo `#contenido`, con todo lo que la vista pintó. */
  readonly contenido: NodoFalso | undefined;
  /** Todo el texto y las clases del contenido, para poder buscar dentro. */
  readonly texto: string;
  /** Rechazos y fallos recogidos durante la ejecución. */
  readonly fallos: string[];
  /**
   * El intérprete de Markdown, expuesto para poder ejercitarlo con el texto real
   * de un plan.
   */
  readonly render?: (texto: string) => NodoFalso;
}

/** Las opciones del montaje, para ejercitar otra vista con otros datos. */
export interface OpcionesDeInterfaz {
  /** El `location.hash` que decide qué vista se ejecuta. */
  readonly hash?: string;
  /** Qué responde cada ruta. Sin esto, la vista del ticket. */
  readonly respuesta?: (ruta: string, init?: RequestInit) => unknown;
  /** Estado inicial del proyecto que la persona tiene seleccionado. */
  readonly localStorage?: Record<string, string>;
  /** Cursor de eventos que sobrevive una reconexión dentro de la pestaña. */
  readonly sessionStorage?: Record<string, string>;
}

/** Monta el entorno, importa el módulo de la interfaz y devuelve lo que pintó. */
export function ejecutarInterfaz(
  rutaHtml: string,
  opciones?: OpcionesDeInterfaz,
): Promise<ResultadoDeInterfaz>;

/** Dispara un evento sobre un nodo, llamando a sus oyentes, y espera a que terminen. */
export function disparar(nodo: NodoFalso, tipo: string, evento?: Record<string, unknown>): Promise<void>;

/** Todos los nodos del árbol que cumplen el predicado. */
export function buscarNodos(raiz: NodoFalso | undefined, predicado: (nodo: NodoFalso) => boolean): NodoFalso[];

/** Las vistas que la interfaz sabe pintar, con el hash que las abre. */
export const VISTAS: readonly (readonly [string, string])[];

/** Una vista que falló al ejecutarse. */
export interface VistaFallida {
  readonly vista: string;
  readonly hash: string;
  readonly problemas: readonly string[];
}

/** Ejecuta cada vista y devuelve las que fallaron, con lo que dijo cada una. */
export function ejecutarTodasLasVistas(
  rutaHtml: string,
): Promise<{ fallidas: VistaFallida[]; texto: Map<string, string> }>;

/** Comprueba que la vista se pintó y no un aviso de error. */
export function verificarInterfaz(
  texto: string,
  contenido: NodoFalso | undefined,
  fallos: readonly string[],
): { ok: boolean; detalle: string; nodos: number };
