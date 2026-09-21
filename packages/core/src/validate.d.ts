/**
 * Validador del documento completo.
 *
 * Espeja `validate_document` del CLI de referencia. **El orden de las
 * comprobaciones es parte del contrato**: el primer fallo aborta y enmascara
 * los posteriores, así que una reimplementación que valide en otro orden
 * produce mensajes distintos para el mismo archivo inválido.
 *
 * Ver docs/09-MIGRACION-SAICLOUD.md §2bis.2ter para el contrato autoritativo.
 */
import { MAX_POINTS } from "./contract.js";
import { EXIT_SCHEMA } from "./errors.js";
import type { JsonObject, ParsedTicket } from "./parser.js";
import { nextPointId, pointIdsRecordedInEvents } from "./blocks.js";
/** Contexto que el core necesita del proyecto, sin tocar el sistema de archivos. */
export interface ValidationContext {
    /** Identificador que se espera encontrar, si el llamador lo conoce. */
    readonly expectedId?: string;
    /** Comprueba que un ticket referenciado existe en el registro. */
    readonly ticketExists?: (id: string) => boolean;
}
/** Quita los comentarios HTML de un fragmento. */
export declare function stripHtmlComments(value: string): string;
/** Texto Markdown significativo: sin comentarios HTML y recortado. */
export declare function meaningfulMarkdown(value: string): string;
/** Quita el prefijo de viñeta o numeración de una línea. */
export declare function stripListMarker(line: string): string;
/**
 * Líneas del plan, sin viñetas ni líneas vacías.
 *
 * No aplica `casefold` ni filtra marcadores de pendiente: es la base que usan
 * las tres comprobaciones del plan.
 */
export declare function planLines(planSection: string): string[];
/**
 * `true` si el plan tiene contenido real, no solo marcadores.
 *
 * Es la comprobación que impide que un agente marque un ticket como `planned`
 * con la plantilla sin rellenar.
 */
export declare function hasSubstantivePlan(planSection: string): boolean;
/**
 * `true` si el plan es proporcional y estructurado: al menos dos pasos reales
 * que no sean cabeceras de gate ni marcadores de pendiente.
 */
export declare function hasStructuredPlan(planSection: string): boolean;
/** `true` si el tipo o los impactos exigen aprobación explícita del PO. */
export declare function isCriticalPlanGate(ticket: ParsedTicket): boolean;
/**
 * `true` si el plan declara el gate de aprobación.
 *
 * Dos vías, y la primera es la única válida para los tickets críticos:
 *
 * 1. Una línea que contenga **a la vez** `aprobado explícitamente por el po` y
 *    (`gate` o `aprobación`).
 * 2. Para los tickets no críticos, una línea `gate no exigible: <razón>` con
 *    una razón real, no un marcador de pendiente.
 */
export declare function hasPlanGate(ticket: ParsedTicket): boolean;
/**
 * `true` si la sección `Pruebas` registra el resultado del PO o una omisión
 * explícita y documentada.
 */
export declare function hasRecordedUserTestOutcome(ticket: ParsedTicket): boolean;
/**
 * `true` si el historial QA cierra con un ciclo aprobado y confirmado.
 *
 * Un ciclo es una pareja: la entrada par lo abre (`pending`) y la impar lo
 * cierra con un resultado.
 */
export declare function hasApprovedQaCycle(qa: readonly JsonObject[]): boolean;
/** `true` si existe una exención de QA válida y confirmada por el PO. */
export declare function hasValidQaWaiver(ticket: ParsedTicket): boolean;
/**
 * Coherencia entre los bloques: puntos, evidencia, retests y ciclos de QA.
 *
 * Es el control que detecta ediciones manuales inconsistentes: el CLI nunca
 * autocorrige, rechaza.
 */
export declare function validateHistoryCoherence(ticket: ParsedTicket): void;
/**
 * Coherencia entre `qa_status` del frontmatter y el último ciclo del historial.
 *
 * Tabla resultante: QA vacío ⇒ `pending` · último `pending` ⇒ `in_qa` · último
 * `approved` ⇒ `approved` · último `changes_requested` o `failed` ⇒ `pending`.
 */
export declare function validateQaStateCoherence(ticket: ParsedTicket): void;
/**
 * Valida un ticket completo en el orden exacto del contrato.
 *
 * El orden importa: R1–R22 (frontmatter y release) siempre preceden a las
 * reglas de workflow, y la validación de bloques precede a la coherencia.
 */
export declare function validateDocument(ticket: ParsedTicket, context?: ValidationContext): void;
export { nextPointId, pointIdsRecordedInEvents, MAX_POINTS, EXIT_SCHEMA };
//# sourceMappingURL=validate.d.ts.map