/**
 * Códigos de salida del CLI.
 *
 * Distinguir estos códigos no es cosmético: permite que un script sepa si el
 * usuario escribió mal, si el motor rechazó la operación por contrato, si falló
 * una referencia, o si el estado histórico es incoherente.
 *
 * Verificados contra `tools/agentic/ticket.py`; ver
 * docs/09-MIGRACION-SAICLOUD.md §2bis.2ter.
 */
export const EXIT_OK = 0;
/** Entrada inválida: el usuario escribió mal. */
export const EXIT_SCHEMA = 2;
/** Invariante de estado violada: el motor rechaza la operación por contrato. */
export const EXIT_INVARIANT = 3;
/** Incoherencia histórica o del registro de eventos. */
export const EXIT_HISTORY = 4;
/** Referencia a un artefacto (commit o worktree) mal formada o inexistente. */
export const EXIT_REFERENCE = 5;
/** El sujeto no es identificable sin ambigüedad. */
export const EXIT_AMBIGUOUS = 6;

/**
 * Error esperado y apto para presentar sin traza de pila.
 *
 * Espeja `TicketError` del CLI de referencia: lleva el código de salida
 * adherido para que la capa de presentación no tenga que decidirlo.
 */
export class TicketError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number = EXIT_SCHEMA) {
    super(message);
    this.name = "TicketError";
    this.exitCode = exitCode;
  }
}

/**
 * Construye un error de esquema (entrada inválida) y lo lanza.
 *
 * El tipo de retorno `never` permite usarlo en posiciones donde el
 * compilador exige un valor, igual que `fail()` en Python.
 */
export function fail(message: string, exitCode: number = EXIT_SCHEMA): never {
  throw new TicketError(message, exitCode);
}

/**
 * Extrae el mensaje y el código de salida de un valor capturado.
 *
 * Con `useUnknownInCatchVariables` activado, todo `catch` recibe `unknown`. En
 * vez de dispersar conversiones por el código, los llamadores usan esto y
 * obtienen un mensaje presentable y un código correcto para cualquier cosa que
 * se haya lanzado.
 */
export function toFailure(caught: unknown): {
  message: string;
  exitCode: number;
} {
  if (caught instanceof TicketError) {
    return { message: caught.message, exitCode: caught.exitCode };
  }
  if (caught instanceof Error) {
    return { message: caught.message, exitCode: EXIT_SCHEMA };
  }
  return { message: String(caught), exitCode: EXIT_SCHEMA };
}
