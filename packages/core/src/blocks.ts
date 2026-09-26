/**
 * Validadores de los bloques JSON estructurados.
 *
 * Espejan `_validate_points`, `_validate_qa`, `_validate_evidence`,
 * `_validate_retests`, `_validate_closures`, `_validate_ai_usage` y
 * `_validate_events` del CLI de referencia, con los mismos mensajes y la misma
 * **secuencia de comprobaciones**: el primer fallo aborta y enmascara los
 * posteriores, así que el orden es parte del contrato.
 */
import {
  MAX_POINTS,
  POINT_STATES,
  RISK_LEVELS,
  TERMINAL_POINT_STATES,
} from "./contract.js";
import { fail } from "./errors.js";
import type { JsonObject } from "./parser.js";
import {
  requireExactKeys,
  requireList,
  validateIsoDate,
  validateNullableText,
  validateNullableNonNegativeInteger,
  validateNullableNonNegativeNumber,
  validateReference,
  validateSequential,
} from "./validators.js";

/** Resultados admitidos por un ciclo de QA, un retest o una evidencia. */
const CYCLE_RESULTS = ["pending", "approved", "changes_requested", "failed"];

/** Niveles de confianza de un registro de consumo de IA. */
const CONFIDENCE_LEVELS = ["high", "medium", "low"];

/** El identificador de una entrada, o el literal del esquema si falta. */
function entryId(entry: JsonObject, fallback: string): string {
  return typeof entry["id"] === "string" ? entry["id"] : fallback;
}

/**
 * Comprueba que un campo sea una lista de textos no vacíos.
 *
 * Se usa para `evidence`, `affected_files`, `tests`, `qa_cycles`, `findings`
 * y campos análogos.
 */
function requireStringList(value: unknown, label: string): void {
  const list = requireList(value, label);
  for (const item of list) {
    if (typeof item !== "string" || item === "") {
      fail(`${label} solo admite textos no vacíos.`);
    }
  }
}

/**
 * Valida el bloque `Puntos`.
 *
 * El límite de veinte y la secuencialidad se comprueban **antes** de recorrer
 * los puntos, igual que en el CLI de referencia.
 */
export function validatePoints(points: readonly JsonObject[]): void {
  if (points.length > MAX_POINTS) {
    fail(`Un ticket admite como máximo ${MAX_POINTS} puntos.`);
  }
  validateSequential(points, "POINT", "Puntos");

  for (const point of points) {
    const id = entryId(point, "punto");
    requireExactKeys(
      point,
      [
        "id",
        "title",
        "status",
        "severity",
        "actual",
        "expected",
        "evidence",
        "affected_files",
        "diagnosis",
        "solution",
        "tests",
        "qa_cycles",
        "terminal_reason",
        "related_ticket",
      ],
      id,
    );

    for (const key of ["title", "actual", "expected"] as const) {
      const value = point[key];
      if (typeof value !== "string" || value.trim() === "") {
        fail(`${id}.${key} debe ser texto no vacío.`);
      }
    }

    const status = point["status"];
    if (
      typeof status !== "string" ||
      !(POINT_STATES as readonly string[]).includes(status)
    ) {
      fail(`${id} usa un estado no permitido.`);
    }

    const severity = point["severity"];
    if (
      typeof severity !== "string" ||
      !(RISK_LEVELS as readonly string[]).includes(severity)
    ) {
      fail(`${id} usa una severidad no permitida.`);
    }

    for (const key of ["evidence", "affected_files", "tests", "qa_cycles"] as const) {
      requireStringList(point[key], `${id}.${key}`);
    }

    const affected = point["affected_files"] as string[];
    for (const raw of affected) {
      if (!isCanonicalRelativePath(raw)) {
        fail(`${id}.affected_files contiene una ruta no canónica.`);
      }
    }

    for (const key of ["diagnosis", "solution"] as const) {
      validateNullableText(point[key], `${id}.${key}`);
    }

    const terminalReason = point["terminal_reason"];
    const isTerminal = (TERMINAL_POINT_STATES as readonly string[]).includes(status);
    if (isTerminal) {
      if (typeof terminalReason !== "string" || terminalReason.trim() === "") {
        fail(`${id} requiere terminal_reason.`);
      }
    } else if (terminalReason !== null) {
      fail(`${id} no puede conservar terminal_reason fuera de un estado terminal.`);
    }

    const related = point["related_ticket"];
    if (related !== null) {
      validateRelatedTicketId(related, `${id}.related_ticket`);
    }
  }
}

/**
 * Ruta relativa canónica dentro del repositorio.
 *
 * Rechaza rutas absolutas, escapes con `..`, referencias al directorio `.git` y
 * separadores de Windows. Espeja la comprobación de `affected_files`.
 */
export function isCanonicalRelativePath(raw: string): boolean {
  if (raw === "" || raw.includes("\\")) return false;
  if (raw.startsWith("/")) return false;
  const parts = raw.split("/").filter((part) => part !== "");
  if (parts.length === 0) return false;
  if (parts.includes("..") || parts.includes(".git")) return false;
  return true;
}

/**
 * Comprueba la **forma** de un id de ticket referenciado.
 *
 * La existencia del ticket referenciado la resuelve el motor, no esta capa: el
 * core no toca el sistema de archivos.
 */
export function validateRelatedTicketId(value: unknown, label: string): void {
  if (typeof value !== "string") {
    fail(`${label} debe ser null o un ID.`);
  }
}

/** Valida el bloque `QA`. */
export function validateQa(entries: readonly JsonObject[]): void {
  validateSequential(entries, "QA", "QA");

  entries.forEach((entry, index) => {
    const id = entryId(entry, "QA");
    requireExactKeys(
      entry,
      [
        "id",
        "date",
        "build_reference",
        "environment",
        "result",
        "findings",
        "correction",
        "po_confirmation",
      ],
      id,
    );

    validateIsoDate(entry["date"], `${id}.date`);

    const buildReference = entry["build_reference"];
    if (buildReference !== null) {
      if (typeof buildReference !== "string") {
        fail(`${id}.build_reference debe ser null o texto.`);
      }
      validateReference(buildReference, `${id}.build_reference`);
    }

    for (const key of ["environment", "correction", "po_confirmation"] as const) {
      validateNullableText(entry[key], `${id}.${key}`);
    }

    const result = entry["result"];
    if (typeof result !== "string" || !CYCLE_RESULTS.includes(result)) {
      fail(`${id}.result no es válido.`);
    }
    if (result === "approved" && entry["po_confirmation"] === null) {
      fail(`${id} aprobado requiere confirmación explícita del PO.`);
    }

    requireStringList(entry["findings"], `${id}.findings`);

    // QA es un historial por parejas: una entrada par abre el ciclo y la impar
    // lo cierra. El índice es 0-based, así que "par" es el inicio.
    const isCycleStart = index % 2 === 0;
    if (isCycleStart) {
      if (result !== "pending") {
        fail(`${id} debe iniciar un ciclo QA con result pending.`);
      }
      if (entry["build_reference"] === null || entry["environment"] === null) {
        fail(`${id} requiere build_reference y environment trazables.`);
      }
    } else if (result === "pending") {
      fail(`${id} debe cerrar el ciclo QA anterior con un resultado.`);
    }
  });
}

/** Valida el bloque `Evidencia`. */
export function validateEvidence(
  entries: readonly JsonObject[],
  pointIds: ReadonlySet<string>,
): void {
  validateSequential(entries, "EVIDENCE", "Evidencia");

  for (const entry of entries) {
    const id = entryId(entry, "EVIDENCE");
    requireExactKeys(
      entry,
      ["id", "date", "kind", "description", "reference", "point_id"],
      id,
    );

    validateIsoDate(entry["date"], `${id}.date`);

    for (const key of ["kind", "description"] as const) {
      const value = entry[key];
      if (typeof value !== "string" || value.trim() === "") {
        fail(`${id}.${key} debe ser texto no vacío.`);
      }
    }

    const reference = entry["reference"];
    if (reference !== null) {
      if (typeof reference !== "string") {
        fail(`${id}.reference debe ser null o texto.`);
      }
      validateReference(reference, `${id}.reference`);
    }

    const pointId = entry["point_id"];
    if (pointId !== null && !pointIds.has(String(pointId))) {
      fail(`${id} referencia un punto inexistente.`);
    }
  }
}

/** Valida el bloque `Retests`. */
export function validateRetests(
  entries: readonly JsonObject[],
  pointIds: ReadonlySet<string>,
): void {
  validateSequential(entries, "RETEST", "Retests");

  for (const entry of entries) {
    const id = entryId(entry, "RETEST");
    requireExactKeys(
      entry,
      ["id", "date", "point_id", "result", "evidence", "po_confirmation"],
      id,
    );

    validateIsoDate(entry["date"], `${id}.date`);

    // A diferencia de la evidencia, aquí `point_id` es obligatorio y debe
    // existir: un retest sin punto no tiene sujeto.
    if (!pointIds.has(String(entry["point_id"]))) {
      fail(`${id} referencia un punto inexistente.`);
    }

    const result = entry["result"];
    if (typeof result !== "string" || !CYCLE_RESULTS.includes(result)) {
      fail(`${id}.result no es válido.`);
    }
    if (result === "approved" && entry["po_confirmation"] === null) {
      fail(`${id} aprobado requiere confirmación explícita del PO.`);
    }

    requireStringList(entry["evidence"], `${id}.evidence`);
    validateNullableText(entry["po_confirmation"], `${id}.po_confirmation`);
  }
}

/** Valida el bloque `Cierre`. */
export function validateClosures(entries: readonly JsonObject[]): void {
  validateSequential(entries, "CLOSE", "Cierre");

  for (const entry of entries) {
    const id = entryId(entry, "CLOSE");
    requireExactKeys(
      entry,
      [
        "kind",
        "id",
        "date",
        "technical_summary",
        "functional_summary",
        "qa_status",
        "qa_waiver_reason",
        "po_confirmation",
        "release_impact",
      ],
      id,
    );

    if (entry["kind"] !== "ticket-close") {
      fail(`${id}.kind debe ser ticket-close.`);
    }

    validateIsoDate(entry["date"], `${id}.date`);

    for (const key of [
      "technical_summary",
      "functional_summary",
      "release_impact",
    ] as const) {
      const value = entry[key];
      if (typeof value !== "string" || value.trim() === "") {
        fail(`${id}.${key} debe ser texto no vacío.`);
      }
    }

    const qaStatus = entry["qa_status"];
    if (qaStatus !== "approved" && qaStatus !== "waived") {
      fail(`${id}.qa_status debe ser approved o waived.`);
    }

    validateNullableText(entry["qa_waiver_reason"], `${id}.qa_waiver_reason`);
    validateNullableText(entry["po_confirmation"], `${id}.po_confirmation`);

    if (
      qaStatus === "waived" &&
      (entry["qa_waiver_reason"] === null || entry["po_confirmation"] === null)
    ) {
      fail(`${id} requiere motivo de exención y confirmación del PO.`);
    }
  }
}

/** Valida el bloque `Consumo de IA`. */
export function validateAiUsage(entries: readonly JsonObject[]): void {
  validateSequential(entries, "CONSUMO", "Consumo de IA");

  for (const entry of entries) {
    const id = entryId(entry, "CONSUMO");
    requireExactKeys(
      entry,
      [
        "kind",
        "id",
        "date",
        "session_reference",
        "model",
        "reasoning_effort",
        "input_tokens",
        "output_tokens",
        "total_tokens",
        "estimated_cost_usd",
        "source",
        "confidence",
        "notes",
      ],
      id,
    );

    if (entry["kind"] !== "ai-usage") {
      fail(`${id}.kind debe ser ai-usage.`);
    }

    validateIsoDate(entry["date"], `${id}.date`);

    for (const key of [
      "session_reference",
      "model",
      "reasoning_effort",
      "notes",
    ] as const) {
      validateNullableText(entry[key], `${id}.${key}`);
    }

    for (const key of ["input_tokens", "output_tokens", "total_tokens"] as const) {
      validateNullableNonNegativeInteger(entry[key], `${id}.${key}`);
    }

    validateNullableNonNegativeNumber(
      entry["estimated_cost_usd"],
      `${id}.estimated_cost_usd`,
    );

    const source = entry["source"];
    if (typeof source !== "string" || source.trim() === "") {
      fail(`${id}.source debe ser texto no vacío.`);
    }

    const confidence = entry["confidence"];
    if (typeof confidence !== "string" || !CONFIDENCE_LEVELS.includes(confidence)) {
      fail(`${id}.confidence debe ser high, medium o low.`);
    }
  }
}

/** Valida el bloque `Eventos`. */
export function validateEvents(entries: readonly JsonObject[]): void {
  validateSequential(entries, "EVENT", "Eventos");

  for (const entry of entries) {
    const id = entryId(entry, "EVENT");
    requireExactKeys(entry, ["kind", "id", "date", "action", "actor", "details"], id);

    if (entry["kind"] !== "ticket-event") {
      fail(`${id}.kind debe ser ticket-event.`);
    }

    validateIsoDate(entry["date"], `${id}.date`);

    for (const key of ["action", "actor", "details"] as const) {
      const value = entry[key];
      if (typeof value !== "string" || value.trim() === "") {
        fail(`${id}.${key} debe ser texto no vacío.`);
      }
    }
  }
}

/**
 * Identificadores de punto registrados en los eventos de creación.
 *
 * Es la fuente de verdad de cuántos puntos existen y en qué orden se crearon.
 * El evento `point-added` debe identificar el punto con el formato exacto
 * `Se agregó POINT-NNN.`, incluido el punto final.
 */
export function pointIdsRecordedInEvents(events: readonly JsonObject[]): string[] {
  const ids: string[] = [];
  for (const event of events) {
    if (event["action"] !== "point-added") continue;
    const details = String(event["details"] ?? "");
    const match = /^Se agregó (POINT-\d{3})\.$/.exec(details);
    if (match === null) {
      fail("Un evento point-added no identifica exactamente el punto creado.");
    }
    ids.push(match[1] as string);
  }
  return ids;
}

/** Siguiente identificador de punto disponible, derivado de eventos y puntos. */
export function nextPointId(
  events: readonly JsonObject[],
  points: readonly JsonObject[],
): string {
  const identifiers = [
    ...pointIdsRecordedInEvents(events),
    ...points.map((point) => String(point["id"])),
  ];
  if (identifiers.length === 0) return "POINT-001";
  const highest = Math.max(
    ...identifiers.map((identifier) => {
      const suffix = identifier.slice(identifier.lastIndexOf("-") + 1);
      return Number.parseInt(suffix, 10);
    }),
  );
  return `POINT-${String(highest + 1).padStart(3, "0")}`;
}
