/**
 * Los tipos de la medición de fricción y del archivo de resultados que escribe.
 *
 * Solo datos: ninguna función ni acceso a disco. Los recorridos del corpus, el
 * clasificador y el ejecutor se entienden leyendo estos tipos primero.
 */

/** Un paso que deja el escenario en el estado donde la operación bloquea. */
export type PasoDeArmado =
  /** Corre el binario medido con estos argumentos (sin el `valmen` inicial). */
  | { binario: string[] }
  /** Corre `git` en el repositorio del escenario. */
  | { git: string[] }
  /** Escribe un archivo, con ruta relativa al repositorio del escenario. */
  | { archivo: { ruta: string; contenido: string } };

/** Una operación que el motor debería rechazar, y cómo dejar el escenario para pedirla. */
export interface Recorrido {
  id: string;
  nombre: string;
  /** Qué rechazo se espera, en una frase: lo que se lee al listar el corpus. */
  bloquea: string;
  armado: PasoDeArmado[];
  /** Argumentos del binario medido, sin el `valmen` inicial. */
  operacion: string[];
  /** Cómo se reintenta tras correr una salida. Por defecto, la misma `operacion`. */
  reintento?: string[];
  /** Valores para los marcadores `<X>` que cite una salida sugerida. */
  variables?: Record<string, string>;
  /** El diseño declara este rechazo como correcto: no cuenta como fricción. */
  rechazoCorrecto?: { motivo: string };
}

export type Clase = "en_banda" | "fuera_de_banda" | "callejon_sin_salida";

/** Lo que pasó al probar una salida que el mensaje de un bloqueo citaba. */
export interface IntentoDeSalida {
  /** El comando tal como lo citó el mensaje, con el `valmen` inicial. */
  comando: string;
  /** `false` si no se corrió: un marcador sin resolver o una ruta fuera del escenario. */
  ejecutada: boolean;
  /** Por qué la salida no destraba. `null` si no se anotó un motivo. */
  motivo: string | null;
  codigoSalida: number | null;
  codigoReintento: number | null;
}

export interface Bloqueo {
  /** Código de salida de la operación bloqueada. */
  codigo: number;
  /** El mensaje del bloqueo: lo que el binario escribió, sin el espacio de los bordes. */
  mensaje: string;
  salidas: IntentoDeSalida[];
  clase: Clase;
  motivo: string;
  rechazoCorrecto: { motivo: string } | null;
}

export interface ResultadoDeRecorrido {
  id: string;
  nombre: string;
  /** `fallido`: no se pudo medir (armado roto, tiempo agotado, llamó a un modelo). */
  estado: "medido" | "fallido";
  motivo: string | null;
  /** `null` si la operación salió con 0, o si el recorrido quedó fallido. */
  bloqueo: Bloqueo | null;
}

export interface Totales {
  en_banda: number;
  fuera_de_banda: number;
  callejon_sin_salida: number;
  rechazos_correctos: number;
  fallidos: number;
}

export interface ArchivoDeResultados {
  version: 1;
  fecha: string;
  binario: {
    /** Ruta real del archivo de entrada del binario medido. */
    ruta: string;
    sha256: string;
    /** Texto libre que pone quien mide, por ejemplo el commit. */
    etiqueta: string | null;
  };
  corpus: {
    /** Hash del corpus: dos corridas con el mismo valor midieron los mismos recorridos. */
    sha256: string;
    recorridos: string[];
  };
  recorridos: ResultadoDeRecorrido[];
  totales: Totales;
}
