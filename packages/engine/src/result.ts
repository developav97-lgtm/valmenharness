/**
 * El resultado de ejecutar un gate.
 *
 * El motor no escribe en la salida ni termina el proceso: devuelve qué decir y
 * con qué código salir. Eso es lo que permite que el mismo gate se ejecute desde
 * el CLI y desde Mission Control sin dos implementaciones que puedan discrepar.
 */
export interface RunnerResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}
