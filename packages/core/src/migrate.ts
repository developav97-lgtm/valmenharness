/**
 * Migración del registro al esquema 2.
 *
 * El esquema 2 amplía el vocabulario: añade los tipos `CHORE` y `DOCS`, el
 * estado `blocked` y un enum cerrado de tipos de evidencia. Migrar es un cambio
 * de frontmatter y **nada más**.
 *
 * La regla que gobierna este archivo:
 *
 * > Los bloques JSON append-only de un ticket nunca se reescriben.
 *
 * Reescribir el historial para adaptarlo a un vocabulario nuevo destruiría la
 * trazabilidad, que es el activo del sistema. Los hechos históricos se
 * conservan y se normalizan al **agregar y reportar**, no al almacenar.
 *
 * Ver Q16 en docs/11-OPEN-QUESTIONS.md y docs/09-MIGRACION-SAICLOUD.md §2ter.
 */
import {
  LEGACY_SCHEMA_VERSION,
  SCHEMA_VERSION,
  normalizeEvidenceKind,
} from "./contract.js";
import { replaceFrontmatterFields } from "./edit.js";
import { fail } from "./errors.js";
import { type ParsedTicket, parseTicket } from "./parser.js";
import { validateDocument } from "./validate.js";

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

/** Aplana los valores de un campo de lista de evidencia. */
function evidenceKinds(ticket: ParsedTicket): string[] {
  return ticket.blocks.Evidencia.map((entry) => String(entry["kind"] ?? ""));
}

/**
 * Analiza qué necesita un ticket para estar en el esquema 2.
 *
 * No escribe nada. Permite mostrar el plan antes de aplicarlo y calcular el
 * informe sin tocar el registro.
 */
export function planMigration(
  ticket: ParsedTicket,
  today: string,
): MigrationPlan {
  const updates: Record<string, string> = {};
  const reasons: string[] = [];

  if (ticket.fields.schema_version === LEGACY_SCHEMA_VERSION) {
    updates["schema_version"] = SCHEMA_VERSION;
    reasons.push(`esquema ${LEGACY_SCHEMA_VERSION} → ${SCHEMA_VERSION}`);
  }

  // Solo se toca `updated` si hay algo más que cambiar. Migrar un ticket ya
  // migrado no debe reescribir su fecha: eso haría que la migración no fuera
  // idempotente y ensuciaría el historial en cada ejecución.
  if (Object.keys(updates).length > 0) {
    updates["updated"] = today;
  }

  const kinds = evidenceKinds(ticket).filter(
    (kind) => kind !== "" && normalizeEvidenceKind(kind) === undefined,
  );

  return {
    needed: Object.keys(updates).length > 0,
    updates,
    reason: reasons.length > 0 ? reasons.join("; ") : "sin cambios",
    nonCanonicalEvidenceKinds: [...new Set(kinds)].sort(),
  };
}

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
export function migrateTicketText(
  text: string,
  today: string,
  options: { expectedId?: string } = {},
): MigrationResult {
  const ticket = parseTicket(text);
  const plan = planMigration(ticket, today);

  if (!plan.needed) {
    return { text, plan };
  }

  const migrated = replaceFrontmatterFields(text, plan.updates);

  const reparsed = parseTicket(migrated);
  validateDocument(
    reparsed,
    options.expectedId === undefined ? {} : { expectedId: options.expectedId },
  );

  return { text: migrated, plan };
}

/**
 * Comprueba que un texto sigue siendo válido tras la migración.
 *
 * Se expone aparte porque el comando de migración lo usa para verificar el
 * archivo ya escrito, no solo el texto en memoria.
 */
export function assertValidAfterMigration(
  text: string,
  expectedId: string,
): void {
  const parsed = parseTicket(text);
  validateDocument(parsed, { expectedId });
  if (parsed.fields.schema_version !== SCHEMA_VERSION) {
    fail(`El ticket ${expectedId} no quedó en el esquema ${SCHEMA_VERSION}.`);
  }
}
