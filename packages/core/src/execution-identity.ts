/**
 * Identidad portable de una ejecución.
 *
 * El ticket no basta para identificar trabajo entre registros: dos proyectos
 * pueden usar el mismo ID. Esta entidad exige el ámbito lógico del proyecto y
 * un ID propio de la ejecución, sin cargar rutas, perfiles, secretos ni I/O.
 */
import { ID_RE } from "./contract.js";

/** Identificador lógico y portable de un proyecto declarado. */
export const PROJECT_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Identificador opaco de una ejecución dentro de un proyecto.
 *
 * Se aceptan UUID, ULID y las convenciones de los adaptadores, pero no rutas ni
 * espacios. La unicidad se valida al persistir; core solo define la forma y el
 * ámbito que la hacen comprobable.
 */
export const EXECUTION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Campos que un cliente debe declarar antes de registrar una ejecución. */
export interface ExecutionIdentityInput {
  readonly projectId: string;
  readonly ticketId: string;
  readonly executionId: string;
}

/** Identidad validada e inmutable de una ejecución. */
export interface ExecutionIdentity extends Readonly<ExecutionIdentityInput> {}

/**
 * Construye una identidad que puede cruzar CLI, MCP, UI y adaptadores.
 *
 * No genera IDs ni consulta el registro: cada cliente aporta sus hechos y los
 * tickets posteriores deciden persistencia, deduplicación y autorización.
 */
export function createExecutionIdentity(input: ExecutionIdentityInput): ExecutionIdentity {
  assertProjectId(input.projectId);
  assertTicketId(input.ticketId);
  assertExecutionId(input.executionId);

  return Object.freeze({
    projectId: input.projectId,
    ticketId: input.ticketId,
    executionId: input.executionId,
  });
}

/** Devuelve una clave canónica de ámbito para indexar una ejecución. */
export function executionScopeKey(identity: ExecutionIdentity): string {
  return `${identity.projectId.length}:${identity.projectId}|${identity.executionId.length}:${identity.executionId}`;
}

function assertProjectId(projectId: string): void {
  if (!PROJECT_ID_RE.test(projectId)) {
    throw new Error(
      'projectId debe ser un identificador lógico en minúsculas (letras, números y guiones), sin rutas.',
    );
  }
}

function assertTicketId(ticketId: string): void {
  if (!ID_RE.test(ticketId)) {
    throw new Error("ticketId debe ser un identificador de ticket válido.");
  }
}

function assertExecutionId(executionId: string): void {
  if (!EXECUTION_ID_RE.test(executionId)) {
    throw new Error(
      "executionId debe ser un identificador portable no vacío, sin rutas ni espacios.",
    );
  }
}
