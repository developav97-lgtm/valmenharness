/**
 * Suite de equivalencia: el parser debe aceptar exactamente los mismos 57
 * tickets que el CLI de referencia acepta hoy.
 *
 * La línea base está verificada: `python3 tools/agentic/ticket.py validate --all`
 * responde "Tickets válidos: 57" con código de salida 0.
 *
 * Ver docs/09-MIGRACION-SAICLOUD.md §2bis para el contrato completo.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseTicket } from "../packages/core/src/parser.js";
import { TicketError } from "../packages/core/src/errors.js";
import {
  FRONTMATTER_FIELDS,
  SECTIONS,
  STRUCTURED_SECTIONS,
} from "../packages/core/src/contract.js";

const FIXTURE_ROOT = join(
  import.meta.dirname,
  "fixtures",
  "saicloud",
  "tickets",
  "2026",
);

/** Los 57 directorios de ticket del fixture, ordenados. */
function ticketIds(): string[] {
  return readdirSync(FIXTURE_ROOT)
    .filter((name) => statSync(join(FIXTURE_ROOT, name)).isDirectory())
    .sort();
}

function readTicket(id: string): string {
  return readFileSync(join(FIXTURE_ROOT, id, "ticket.md"), "utf8");
}

describe("equivalencia del parser sobre los 57 tickets reales", () => {
  const ids = ticketIds();

  it("el fixture contiene los 57 tickets esperados", () => {
    expect(ids).toHaveLength(57);
  });

  it("todos los tickets se analizan sin error", () => {
    const failures: { id: string; message: string }[] = [];
    for (const id of ids) {
      try {
        parseTicket(readTicket(id));
      } catch (error) {
        failures.push({
          id,
          message: error instanceof TicketError ? error.message : String(error),
        });
      }
    }
    expect(failures).toEqual([]);
  });

  it("el id del frontmatter coincide con el nombre del directorio", () => {
    const mismatches = ids.filter((id) => {
      try {
        return parseTicket(readTicket(id)).fields.id !== id;
      } catch {
        return true;
      }
    });
    expect(mismatches).toEqual([]);
  });

  it("todos los tickets exponen las 15 secciones y los 18 campos", () => {
    for (const id of ids) {
      const parsed = parseTicket(readTicket(id));
      expect(Object.keys(parsed.fields), id).toEqual([...FRONTMATTER_FIELDS]);
      expect(Object.keys(parsed.sections), id).toEqual([...SECTIONS]);
      expect(Object.keys(parsed.blocks), id).toEqual([...STRUCTURED_SECTIONS]);
    }
  });

  it("reproduce la volumetría verificada del fixture", () => {
    let events = 0;
    let points = 0;
    let qa = 0;
    let evidence = 0;
    let retests = 0;
    let closures = 0;
    let usage = 0;

    for (const id of ids) {
      const { blocks } = parseTicket(readTicket(id));
      events += blocks.Eventos.length;
      points += blocks.Puntos.length;
      qa += blocks.QA.length;
      evidence += blocks.Evidencia.length;
      retests += blocks.Retests.length;
      closures += blocks.Cierre.length;
      usage += blocks["Consumo de IA"].length;
    }

    // Cifras extraídas de los tickets de producción; ver §2bis.1.
    expect(events).toBe(1851);
    expect(points).toBe(137);
    expect(qa).toBe(166);
    expect(evidence).toBe(177);
    expect(retests).toBe(137);
    expect(closures).toBe(61);
    expect(usage).toBe(1);
  });
});
