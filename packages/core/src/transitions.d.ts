/**
 * Las tablas de transición del registro.
 *
 * Son el contrato de qué movimiento es legal, y están **transcritas de la
 * implementación de referencia** (`tools/agentic/ticket.py` L73-101) porque son
 * parte del comportamiento que el harness reemplaza: un script que hoy depende
 * de que `planned` solo pueda ir a `approved` tiene que seguir dependiendo de
 * eso.
 *
 * Lo que se añade respecto de la referencia es el estado `blocked`, que el
 * esquema 2 introdujo. No es una transición nueva inventada: es la única lectura
 * coherente de `BLOCKED_EXITS`, que ya declara los cuatro estados desde los que
 * se entra y se sale de `blocked`. Sin esta tabla, `blocked` existiría en el
 * contrato y sería inalcanzable.
 *
 * Consecuencia para la prueba diferencial: un ticket en `blocked` **no** puede
 * compararse contra la referencia, porque su `WORKFLOW_STATES` no conoce el
 * estado y lo rechaza al validar. La comparación se hace sobre los diez estados
 * del esquema 1.
 */
import { type PointState, type ReleaseState, type WorkflowState } from "./contract.js";
/** Las entidades que tienen máquina de estados. */
export type TransitionEntity = "ticket" | "point" | "release";
/**
 * Transiciones de ticket.
 *
 * Diez estados del esquema 1, transcritos literalmente, más `blocked`:
 *
 * ```
 * intake → analyzed → planned → approved → in_progress → awaiting_user_tests
 *                       ↑          ↑          ↑                        ↓
 *                       └──────────┴──────────┴────── blocked        in_qa
 *                                                                   ↙    ↘
 *                                                    changes_requested  qa_approved
 *                                                             ↓              ↓
 *                                                        in_progress      closed
 *                                                                            ↓
 *                                                              changes_requested
 * ```
 *
 * `closed` no es terminal: se reabre a `changes_requested` con motivo, y solo si
 * el ticket sigue sin publicarse. Es la única arista que vuelve hacia atrás, y
 * existe porque un hallazgo posterior al cierre es un caso real y frecuente.
 */
export declare const TICKET_TRANSITIONS: Readonly<Record<WorkflowState, readonly WorkflowState[]>>;
/**
 * Transiciones de release.
 *
 * `released` y `not_applicable` son terminales: una release publicada no se
 * despublica, y un ticket que no se publica no se arrepiente.
 */
export declare const RELEASE_TRANSITIONS: Readonly<Record<ReleaseState, readonly ReleaseState[]>>;
/**
 * Transiciones de punto.
 *
 * Cualquier estado no terminal puede declararse terminal con un motivo, y
 * `verified` es el único camino a `closed`. Nótese que `closed` **no** está en
 * `TERMINAL_POINT_STATES`: es terminal en la máquina y no exige motivo.
 */
export declare const POINT_TRANSITIONS: Readonly<Record<PointState, readonly PointState[]>>;
/** Los estados de cada entidad, en el orden de sus tablas. */
export declare const TRANSITIONS: Readonly<Record<TransitionEntity, Readonly<Record<string, readonly string[]>>>>;
/** Los destinos legales desde un estado. Vacío si el estado es terminal. */
export declare function nextStates(entity: TransitionEntity, from: string): readonly string[];
/** `true` si el movimiento es legal según la tabla. */
export declare function canTransition(entity: TransitionEntity, from: string, to: string): boolean;
/** `true` si el estado no tiene ninguna salida. */
export declare function isTerminal(entity: TransitionEntity, state: string): boolean;
/**
 * Comprueba la legalidad y falla con el mensaje de la referencia.
 *
 * El mensaje se transcribe literal, incluido el valor crudo de destino: si
 * alguien escribe `--to aprobado`, el error dice `aprobado`, que es lo que
 * necesita ver para corregirlo.
 */
export declare function assertTransition(entity: TransitionEntity, from: string, to: string): void;
//# sourceMappingURL=transitions.d.ts.map