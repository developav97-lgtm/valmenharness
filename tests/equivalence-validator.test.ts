/**
 * Suite de equivalencia del validador.
 *
 * Criterio de aceptación de la Fase 1: `valmen` produce el **mismo veredicto**
 * que `python3 tools/agentic/ticket.py validate --all`, que hoy responde
 * "Tickets válidos: 57" con código de salida 0.
 *
 * Ver docs/09-MIGRACION-SAICLOUD.md §3, Fase 1.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseTicket } from "../packages/core/src/parser.js";
import { validateDocument } from "../packages/core/src/validate.js";
import { TicketError } from "../packages/core/src/errors.js";

const FIXTURE_ROOT = join(
  import.meta.dirname,
  "fixtures",
  "saicloud",
  "tickets",
  "2026",
);

function ticketIds(): string[] {
  return readdirSync(FIXTURE_ROOT)
    .filter((name) => statSync(join(FIXTURE_ROOT, name)).isDirectory())
    .sort();
}

/** Valida un ticket del fixture y devuelve el error, o `null` si es válido. */
function validateFixture(id: string): TicketError | null {
  const text = readFileSync(join(FIXTURE_ROOT, id, "ticket.md"), "utf8");
  try {
    validateDocument(parseTicket(text), { expectedId: id });
    return null;
  } catch (error) {
    if (error instanceof TicketError) return error;
    throw error;
  }
}

describe("equivalencia del validador sobre los 57 tickets reales", () => {
  const ids = ticketIds();

  it("los 57 tickets de producción son válidos", () => {
    const failures = ids
      .map((id) => ({ id, error: validateFixture(id) }))
      .filter((result) => result.error !== null);

    // El mensaje agrupa los fallos para que un solo test informe de todos.
    const detail = failures
      .map((failure) => `  ${failure.id}\n    ${failure.error?.message ?? ""}`)
      .join("\n");

    expect(
      failures.length,
      failures.length === 0
        ? ""
        : `\n${failures.length} tickets rechazados:\n${detail}`,
    ).toBe(0);
  });

  it("el veredicto coincide con el CLI de referencia: 57 válidos", () => {
    const valid = ids.filter((id) => validateFixture(id) === null);
    expect(valid).toHaveLength(57);
  });
});
