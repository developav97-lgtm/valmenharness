import { type ParsedTicket } from "./parser.js";
/** Qué se le va a hacer a un ticket. */
export interface MigrationPlan {
    /** `true` si hay algo que cambiar. */
    readonly needed: boolean;
    /** Valores de frontmatter que se van a escribir. */
    readonly updates: Readonly<Record<string, string>>;
    /** Motivo legible, para el informe y el evento del registro. */
    readonly reason: string;
    /**
     * Tipos de evidencia del ticket que no pertenecen al enum canónico.
     *
     * Se informan, no se reescriben: el ticket conserva su `kind` original y la
     * normalización se aplica al agregar. Ver `LEGACY_EVIDENCE_KINDS`.
     */
    readonly nonCanonicalEvidenceKinds: readonly string[];
}
/**
 * Analiza qué necesita un ticket para estar en el esquema 2.
 *
 * No escribe nada. Permite mostrar el plan antes de aplicarlo y calcular el
 * informe sin tocar el registro.
 */
export declare function planMigration(ticket: ParsedTicket, today: string): MigrationPlan;
/** Resultado de migrar el texto de un ticket. */
export interface MigrationResult {
    /** Texto migrado. Idéntico al original si no hacía falta migrar. */
    readonly text: string;
    readonly plan: MigrationPlan;
}
/**
 * Migra el texto de un ticket al esquema 2.
 *
 * Revalida el resultado **antes** de devolverlo: si la migración produjera un
 * documento inválido, es un error del motor y no debe llegar al disco.
 */
export declare function migrateTicketText(text: string, today: string, options?: {
    expectedId?: string;
}): MigrationResult;
/**
 * Comprueba que un texto sigue siendo válido tras la migración.
 *
 * Se expone aparte porque el comando de migración lo usa para verificar el
 * archivo ya escrito, no solo el texto en memoria.
 */
export declare function assertValidAfterMigration(text: string, expectedId: string): void;
//# sourceMappingURL=migrate.d.ts.map