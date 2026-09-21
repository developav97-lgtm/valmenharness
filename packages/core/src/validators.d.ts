import { EXIT_SCHEMA } from "./errors.js";
/**
 * Texto de una sola línea, seguro y no vacío.
 *
 * Espeja `validate_text`. Devuelve el valor recortado.
 */
export declare function validateText(value: string | null | undefined, label: string, options?: {
    allowEmpty?: boolean;
}): string;
/**
 * `true` si todos los caracteres son imprimibles, como `str.isprintable()`.
 *
 * La cadena vacía es imprimible, igual que en Python.
 */
export declare function isPrintable(value: string): boolean;
/**
 * Título del ticket: una línea, sin `|` (rompe las tablas Markdown del CLI) y
 * como escalar plain seguro.
 */
export declare function validateTitle(value: string | null | undefined): string;
/**
 * Solicitud original: se conserva **literalmente**, con sus saltos y espacios.
 *
 * Es el único campo de texto que no se recorta: la solicitud es evidencia y
 * reescribirla rompería la trazabilidad.
 */
export declare function validateRequest(value: string | null | undefined): string;
/** Fecha ISO `YYYY-MM-DD` que además debe existir en el calendario. */
export declare function validateIsoDate(value: unknown, label: string): void;
/** `null` o texto no vacío. */
export declare function validateNullableText(value: unknown, label: string): void;
/** `null` o entero no negativo. Rechaza booleanos y flotantes. */
export declare function validateNullableNonNegativeInteger(value: unknown, label: string): void;
/** `null` o número no negativo y finito. */
export declare function validateNullableNonNegativeNumber(value: unknown, label: string): void;
/**
 * Referencia inmutable a un artefacto probado.
 *
 * Solo admite `commit:<sha40>` o `worktree:sha256:<sha256>`, ambos en
 * minúsculas. La cadena literal `worktree` no es válida aquí: la expande antes
 * `resolveReference`.
 */
export declare function validateReference(value: string | null | undefined, label?: string): void;
/**
 * Igualdad exacta de las claves de un objeto JSON contra el conjunto del
 * esquema: ni una de menos, ni una de más.
 */
export declare function requireExactKeys(item: Record<string, unknown>, keys: readonly string[], label: string): void;
/** El valor debe ser un arreglo JSON. */
export declare function requireList(value: unknown, label: string): unknown[];
/**
 * Identificadores monótonos, únicos y en orden.
 *
 * La comparación es lista contra lista: exige el valor **y la posición**
 * exactos. `POINT-002` seguido de `POINT-001` falla aunque ambos existan.
 */
export declare function validateSequential(entries: readonly Record<string, unknown>[], prefix: string, label: string): void;
/**
 * Recorta al final cualquier combinación de los caracteres dados.
 *
 * Espeja `str.rstrip(". ;:")` de Python, que elimina **cualquier** combinación
 * final de esos caracteres, no la subcadena completa.
 */
export declare function rstripChars(value: string, chars: string): string;
/** Marcadores de que un campo está sin completar. */
export declare const PLACEHOLDERS_WITH_DASH: readonly ["-", "tbd", "todo", "pendiente", "por definir", "a definir", "por completar", "n/a", "na", "no aplica", "placeholder"];
/** Igual que `PLACEHOLDERS_WITH_DASH` pero sin el guion suelto. */
export declare const PLACEHOLDERS: readonly ["tbd", "todo", "pendiente", "por definir", "a definir", "por completar", "n/a", "na", "no aplica", "placeholder"];
/** Prefijos que indican que el contenido sigue pendiente. */
export declare const PENDING_PREFIXES: readonly ["pendiente", "por definir", "a definir", "por completar"];
/** `true` si el texto normalizado es un marcador de pendiente. */
export declare function isPlaceholder(normalized: string, placeholders: readonly string[]): boolean;
export { EXIT_SCHEMA };
//# sourceMappingURL=validators.d.ts.map