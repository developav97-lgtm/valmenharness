import { type FrontmatterField, type SectionName, type StructuredSectionName } from "./contract.js";
import { EXIT_SCHEMA } from "./errors.js";
/**
 * Un objeto JSON parseado de una sección estructurada.
 *
 * Los valores son `unknown` a propósito: el shape lo determina cada validador
 * de sección, no el parser.
 */
export type JsonObject = Record<string, unknown>;
/**
 * Resultado del análisis sintáctico de un `ticket.md`.
 *
 * No implica que el ticket sea válido: solo que su forma es la del contrato.
 * La validación de reglas vive en `validate.ts`.
 */
export interface ParsedTicket {
    /** Texto crudo, tal cual está en disco. Nunca se normaliza. */
    readonly text: string;
    /** Los 18 campos de frontmatter, ya en el orden canónico. */
    readonly fields: Readonly<Record<FrontmatterField, string>>;
    /** Cuerpo de cada una de las 15 secciones, sin el encabezado. */
    readonly sections: Readonly<Record<SectionName, string>>;
    /** Arreglo de objetos de cada sección estructurada. */
    readonly blocks: Readonly<Record<StructuredSectionName, readonly JsonObject[]>>;
}
/**
 * Subconjunto conservador de escalares YAML *plain* de una sola línea.
 *
 * Espeja `is_safe_plain_scalar` del CLI de referencia. Rechaza valores que un
 * parser YAML interpretaría como otra cosa (listas, mapas, anclas, comillas,
 * comentarios), porque el frontmatter se lee sin una librería YAML.
 */
export declare function isSafePlainScalar(value: string): boolean;
/**
 * Analiza el frontmatter restringido.
 *
 * Contrato: apertura `---`, una línea `clave: valor` por campo, cierre `---`.
 * Las claves deben ser **exactamente** las 18 del esquema y estar **en orden**.
 * No se admiten mapas, listas, multilínea, anclas ni etiquetas.
 *
 * Devuelve los campos y el índice donde empieza el cuerpo.
 */
export declare function parseFrontmatter(text: string): {
    fields: Record<FrontmatterField, string>;
    bodyStart: number;
};
/**
 * Analiza las 15 secciones Markdown.
 *
 * La lógica replica la del CLI de referencia y tiene una particularidad que no
 * es obvia: `Solicitud original` se busca primero, y después se busca una
 * ocurrencia de `Descripción funcional` tal que **todos** los encabezados que
 * siguen sean exactamente `SECTIONS[1:]`. Eso tolera que el texto de la
 * solicitud contenga encabezados `## ` ocasionales, pero rechaza cualquier
 * sección extra, faltante o fuera de orden en el cuerpo canónico.
 */
export declare function parseSections(text: string, bodyStart: number): Record<SectionName, string>;
/**
 * Analiza el bloque JSON de cada sección estructurada.
 *
 * Cada una de las 7 secciones debe contener **exactamente un** bloque `json`
 * delimitado por vallas, y su contenido debe ser un arreglo de objetos.
 */
export declare function parseBlocks(sections: Record<SectionName, string>): Record<StructuredSectionName, readonly JsonObject[]>;
/** `true` si el valor es un objeto JSON y no un arreglo ni `null`. */
export declare function isPlainObject(value: unknown): value is JsonObject;
/**
 * Analiza un `ticket.md` completo: frontmatter, secciones y bloques.
 *
 * Solo verifica la **forma**. Las reglas de negocio las aplica `validateTicket`.
 * El texto se lee sin normalizar: un archivo con CRLF no abre el frontmatter,
 * que es el comportamiento del contrato.
 */
export declare function parseTicket(text: string): ParsedTicket;
export { EXIT_SCHEMA };
//# sourceMappingURL=parser.d.ts.map