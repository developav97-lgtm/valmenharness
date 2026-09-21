import type { JsonObject } from "./parser.js";
/**
 * Reemplaza el valor de una clave del frontmatter.
 *
 * Solo actúa dentro del bloque de frontmatter, no en el cuerpo: una sección de
 * Markdown puede contener legítimamente una línea que empiece por `updated: `.
 */
export declare function replaceFrontmatterField(text: string, key: string, value: string): string;
/**
 * Reemplaza varios campos del frontmatter en una sola pasada.
 *
 * Aplicar los reemplazos de uno en uno exige reanalizar el bloque en cada paso
 * y deja el documento en un estado intermedio si alguno falla. En una pasada,
 * o se aplican todos o no se cambia nada.
 */
export declare function replaceFrontmatterFields(text: string, updates: Readonly<Record<string, string>>): string;
/**
 * Reemplaza el bloque JSON de una sección estructurada.
 *
 * La sustitución es textual y el resultado **no se valida aquí**: quien muta
 * revalida el documento completo antes de escribirlo. Así una mutación que
 * produciría un estado inválido nunca llega al disco.
 */
export declare function replaceBlock(text: string, section: string, entries: readonly JsonObject[]): string;
/** Siguiente identificador monótono de una sección: `POINT-001`, `EVENT-002`. */
export declare function nextId(entries: readonly JsonObject[], prefix: string): string;
/**
 * Construye un evento del registro.
 *
 * El registro de eventos es append-only: cada mutación añade exactamente uno.
 * Es la razón por la que un ticket se puede auditar sin depender de que alguien
 * haya documentado lo que hizo.
 */
export declare function newEvent(entries: readonly JsonObject[], action: string, details: string, actor: string, today: string): JsonObject;
/** Fecha local en `YYYY-MM-DD`, el formato que exige el contrato. */
export declare function today(now?: Date): string;
//# sourceMappingURL=edit.d.ts.map