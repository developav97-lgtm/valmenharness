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
import { BLOCKED_EXITS, TERMINAL_POINT_STATES, } from "./contract.js";
import { EXIT_INVARIANT, fail } from "./errors.js";
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
export const TICKET_TRANSITIONS = {
    intake: ["analyzed"],
    analyzed: ["planned", "blocked"],
    planned: ["approved", "blocked"],
    approved: ["in_progress", "blocked"],
    in_progress: ["awaiting_user_tests", "blocked"],
    blocked: BLOCKED_EXITS,
    awaiting_user_tests: ["in_qa"],
    in_qa: ["changes_requested", "qa_approved"],
    changes_requested: ["in_progress"],
    qa_approved: ["closed"],
    closed: ["changes_requested"],
};
/**
 * Transiciones de release.
 *
 * `released` y `not_applicable` son terminales: una release publicada no se
 * despublica, y un ticket que no se publica no se arrepiente.
 */
export const RELEASE_TRANSITIONS = {
    unreleased: ["planned", "not_applicable"],
    planned: ["released"],
    released: [],
    not_applicable: [],
};
/**
 * Transiciones de punto.
 *
 * Cualquier estado no terminal puede declararse terminal con un motivo, y
 * `verified` es el único camino a `closed`. Nótese que `closed` **no** está en
 * `TERMINAL_POINT_STATES`: es terminal en la máquina y no exige motivo.
 */
export const POINT_TRANSITIONS = {
    open: ["analyzed", ...TERMINAL_POINT_STATES],
    analyzed: ["in_progress", ...TERMINAL_POINT_STATES],
    in_progress: ["awaiting_retest", ...TERMINAL_POINT_STATES],
    awaiting_retest: ["verified", ...TERMINAL_POINT_STATES],
    verified: ["closed"],
    closed: [],
    not_reproducible: [],
    deferred: [],
    duplicate: [],
};
/** Los estados de cada entidad, en el orden de sus tablas. */
export const TRANSITIONS = {
    ticket: TICKET_TRANSITIONS,
    point: POINT_TRANSITIONS,
    release: RELEASE_TRANSITIONS,
};
/** Los destinos legales desde un estado. Vacío si el estado es terminal. */
export function nextStates(entity, from) {
    return TRANSITIONS[entity][from] ?? [];
}
/** `true` si el movimiento es legal según la tabla. */
export function canTransition(entity, from, to) {
    return nextStates(entity, from).includes(to);
}
/** `true` si el estado no tiene ninguna salida. */
export function isTerminal(entity, state) {
    return nextStates(entity, state).length === 0;
}
/** El nombre de la entidad tal como aparece en los mensajes. */
const NOMBRE = {
    ticket: "ticket",
    point: "punto",
    release: "release",
};
/**
 * Comprueba la legalidad y falla con el mensaje de la referencia.
 *
 * El mensaje se transcribe literal, incluido el valor crudo de destino: si
 * alguien escribe `--to aprobado`, el error dice `aprobado`, que es lo que
 * necesita ver para corregirlo.
 */
export function assertTransition(entity, from, to) {
    if (canTransition(entity, from, to))
        return;
    fail(`Transición de ${NOMBRE[entity]} ${from} -> ${to} no permitida.`, EXIT_INVARIANT);
}
//# sourceMappingURL=transitions.js.map