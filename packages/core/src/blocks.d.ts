import type { JsonObject } from "./parser.js";
/**
 * Valida el bloque `Puntos`.
 *
 * El límite de veinte y la secuencialidad se comprueban **antes** de recorrer
 * los puntos, igual que en el CLI de referencia.
 */
export declare function validatePoints(points: readonly JsonObject[]): void;
/**
 * Ruta relativa canónica dentro del repositorio.
 *
 * Rechaza rutas absolutas, escapes con `..`, referencias al directorio `.git` y
 * separadores de Windows. Espeja la comprobación de `affected_files`.
 */
export declare function isCanonicalRelativePath(raw: string): boolean;
/**
 * Comprueba la **forma** de un id de ticket referenciado.
 *
 * La existencia del ticket referenciado la resuelve el motor, no esta capa: el
 * core no toca el sistema de archivos.
 */
export declare function validateRelatedTicketId(value: unknown, label: string): void;
/** Valida el bloque `QA`. */
export declare function validateQa(entries: readonly JsonObject[]): void;
/** Valida el bloque `Evidencia`. */
export declare function validateEvidence(entries: readonly JsonObject[], pointIds: ReadonlySet<string>): void;
/** Valida el bloque `Retests`. */
export declare function validateRetests(entries: readonly JsonObject[], pointIds: ReadonlySet<string>): void;
/** Valida el bloque `Cierre`. */
export declare function validateClosures(entries: readonly JsonObject[]): void;
/** Valida el bloque `Consumo de IA`. */
export declare function validateAiUsage(entries: readonly JsonObject[]): void;
/** Valida el bloque `Eventos`. */
export declare function validateEvents(entries: readonly JsonObject[]): void;
/**
 * Identificadores de punto registrados en los eventos de creación.
 *
 * Es la fuente de verdad de cuántos puntos existen y en qué orden se crearon.
 * El evento `point-added` debe identificar el punto con el formato exacto
 * `Se agregó POINT-NNN.`, incluido el punto final.
 */
export declare function pointIdsRecordedInEvents(events: readonly JsonObject[]): string[];
/** Siguiente identificador de punto disponible, derivado de eventos y puntos. */
export declare function nextPointId(events: readonly JsonObject[], points: readonly JsonObject[]): string;
//# sourceMappingURL=blocks.d.ts.map