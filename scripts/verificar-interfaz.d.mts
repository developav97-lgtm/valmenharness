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

/** Monta el entorno, importa el módulo de la interfaz y devuelve lo que pintó. */
export function ejecutarInterfaz(rutaHtml: string): Promise<ResultadoDeInterfaz>;

/** Comprueba que la vista se pintó y no un aviso de error. */
export function verificarInterfaz(
  texto: string,
  contenido: NodoFalso | undefined,
  fallos: readonly string[],
): { ok: boolean; detalle: string; nodos: number };
