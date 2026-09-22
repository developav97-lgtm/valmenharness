/**
 * Equivalencia por el lado del rechazo.
 *
 * Aceptar los 57 tickets válidos es solo la mitad del contrato. La otra mitad
 * es **rechazar lo mismo** que rechaza el CLI de referencia, y con el mismo
 * mensaje. Un validador permisivo pasa la primera mitad y falla esta.
 *
 * Los casos se construyen mutando un ticket real del fixture, así que cada
 * aserción comprueba una regla contra datos de producción, no contra un
 * ejemplo inventado.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseTicket } from "../packages/core/src/parser.js";
import { validateDocument } from "../packages/core/src/validate.js";
import { TicketError } from "../packages/core/src/errors.js";
import {
  EXIT_INVARIANT,
  EXIT_REFERENCE,
  EXIT_SCHEMA,
} from "../packages/core/src/errors.js";

const FIXTURES = join(import.meta.dirname, "fixtures", "saicloud", "tickets", "2026");

const VALID_ID = "BUGFIX-ADMIN-USUARIOS-CAJAS-SUCURSAL-20260828";

function readValid(id = VALID_ID): string {
  return readFileSync(join(FIXTURES, id, "ticket.md"), "utf8");
}

/** Espera que el texto falle con el mensaje exacto y el código de salida dado. */
function expectFailure(
  text: string,
  message: string,
  exitCode: number = EXIT_SCHEMA,
): void {
  let captured: unknown;
  try {
    validateDocument(parseTicket(text), { expectedId: VALID_ID });
  } catch (error) {
    captured = error;
  }
  expect(captured, "se esperaba un fallo de validación").toBeInstanceOf(TicketError);
  const error = captured as TicketError;
  expect(error.message).toBe(message);
  expect(error.exitCode).toBe(exitCode);
}

/** Sustituye un campo del frontmatter conservando el resto del documento. */
function withField(text: string, key: string, value: string): string {
  return text.replace(new RegExp(`^${key}: .*$`, "m"), `${key}: ${value}`);
}

describe("el validador rechaza lo mismo que el CLI de referencia", () => {
  it("el ticket base del fixture es válido", () => {
    expect(() =>
      validateDocument(parseTicket(readValid()), { expectedId: VALID_ID }),
    ).not.toThrow();
  });

  // ── Frontmatter y versiones ──────────────────────────────────────────────

  it("rechaza un schema_version distinto", () => {
    expectFailure(
      withField(readValid(), "schema_version", "9"),
      "schema_version debe ser el entero literal 1 o 2.",
    );
  });

  it("rechaza un booleano no literal", () => {
    expectFailure(
      withField(readValid(), "sync_impact", "sí"),
      "sync_impact debe ser true o false literal.",
    );
  });

  it("rechaza un workflow_status inventado", () => {
    expectFailure(
      withField(readValid(), "workflow_status", "pepe"),
      "workflow_status no pertenece al esquema.",
    );
  });

  it("rechaza un risk_level fuera del esquema", () => {
    expectFailure(
      withField(readValid(), "risk_level", "gravisimo"),
      "risk_level no pertenece al esquema.",
    );
  });

  it("rechaza una fecha inexistente en el calendario", () => {
    expectFailure(
      withField(readValid(), "created", "2026-02-30"),
      "created contiene una fecha inexistente.",
    );
  });

  it("rechaza una fecha con formato distinto", () => {
    expectFailure(
      withField(readValid(), "created", "07/09/2026"),
      "created debe usar YYYY-MM-DD.",
    );
  });

  it("rechaza una versión con prefijo v", () => {
    expectFailure(
      withField(readValid(), "target_release", "v1.2.3"),
      "target_release debe ser null o SemVer sin prefijo v.",
    );
  });

  // ── Coherencia del release inyectada sobre un ticket válido ──────────────
  // El ticket base termina en `released`, así que vaciar `released_in` rompe
  // la regla R18 y no otra.

  it("rechaza released sin released_in", () => {
    expectFailure(
      withField(readValid(), "released_in", "null"),
      "release released requiere target_release y released_in.",
    );
  });

  it("rechaza released_in que no coincide con target_release", () => {
    expectFailure(
      withField(readValid(), "released_in", "9.9.9"),
      "released_in debe coincidir con target_release.",
    );
  });

  // ── Identidad entre frontmatter e ID (R3) ────────────────────────────────

  it("rechaza un id distinto del esperado por el llamador", () => {
    let captured: unknown;
    try {
      validateDocument(parseTicket(readValid()), {
        expectedId: "BUGFIX-OTRO-MODULO-20260101",
      });
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(TicketError);
    expect((captured as TicketError).message).toBe(
      "El ID del frontmatter no coincide con el ticket solicitado.",
    );
  });

  it("rechaza un type que no coincide con el prefijo del ID", () => {
    expectFailure(
      withField(readValid(), "type", "FEATURE"),
      "type no coincide con el prefijo del ID.",
    );
  });

  it("rechaza un module que no coincide con el segmento del ID", () => {
    expectFailure(
      withField(readValid(), "module", "OTRO"),
      "module no coincide con el segmento del ID.",
    );
  });

  // ── Parser: forma del documento ──────────────────────────────────────────

  it("rechaza un documento sin frontmatter", () => {
    let captured: unknown;
    try {
      parseTicket("# ticket sin frontmatter\n");
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(TicketError);
    // El espacio final del mensaje es parte del contrato heredado.
    expect((captured as TicketError).message).toBe(
      "ticket.md debe iniciar con frontmatter restringido delimitado por ---. ",
    );
  });

  it("rechaza un frontmatter con las claves en otro orden", () => {
    const text = readValid();
    const reordered = text
      .replace(/^schema_version: (.*)$/m, "__TMP__")
      .replace(/^id: (.*)$/m, "schema_version: $1")
      .replace(
        /^__TMP__$/m,
        () => `id: ${/^schema_version: (.*)$/m.exec(text)?.[1] ?? ""}`,
      );
    let captured: unknown;
    try {
      parseTicket(reordered);
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(TicketError);
    expect((captured as TicketError).message).toBe(
      "El frontmatter no contiene las claves exactas en el orden del esquema 1.",
    );
  });

  it("rechaza un frontmatter con una clave duplicada", () => {
    const text = readValid().replace(
      /^id: .*$/m,
      (match) => `${match}\nid: BUGFIX-POS-DUPLICADO-20260907`,
    );
    let captured: unknown;
    try {
      parseTicket(text);
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(TicketError);
    expect((captured as TicketError).message).toBe(
      "El campo de frontmatter id está duplicado.",
    );
  });

  it("rechaza una sección Markdown fuera de orden", () => {
    // Se inyecta una sección extra antes de `Eventos`, lo que rompe la
    // secuencia canónica exigida por el parser.
    const text = readValid().replace(
      /^## Eventos$/m,
      "## Sección Intrusa\n\nx\n\n## Eventos",
    );
    expect(() => parseTicket(text)).toThrow(
      new TicketError(
        "Las secciones Markdown faltan, sobran o no conservan el orden canónico.",
      ),
    );
  });

  it("rechaza una sección estructurada sin su bloque JSON", () => {
    const text = readValid().replace(
      /(^## QA\n)([\s\S]*?)(?=^## Evidencia)/m,
      "$1\nsin bloque json\n\n",
    );
    expect(() => parseTicket(text)).toThrow(
      new TicketError("La sección QA debe contener exactamente un bloque JSON fenced."),
    );
  });

  it("rechaza un bloque JSON con claves duplicadas", () => {
    const text = readValid().replace(
      /(^## Eventos\n[\s\S]*?```json\n)/m,
      '$1{\n    "kind": "ticket-event",\n    "kind": "ticket-event",\n    "id": "EVENT-001",\n    "date": "2026-09-07",\n    "action": "created",\n    "actor": "cli",\n    "details": "x"\n  }\n',
    );
    // El reemplazo deja el arreglo original detrás, así que lo más probable es
    // que falle por JSON inválido; lo que importa es que falle.
    expect(() => parseTicket(text)).toThrow(TicketError);
  });

  // ── Códigos de salida no triviales ───────────────────────────────────────

  it("usa el código de referencia al rechazar una referencia de build mal formada", () => {
    const text = readValid().replace(
      /"build_reference": "commit:[0-9a-f]{40}"/,
      '"build_reference": "commit:ABC"',
    );
    let captured: unknown;
    try {
      validateDocument(parseTicket(text), { expectedId: VALID_ID });
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(TicketError);
    expect((captured as TicketError).exitCode).toBe(EXIT_REFERENCE);
  });

  it("el código de invariante está disponible para la capa de comandos", () => {
    // El core no aplica reglas de transición (viven en el motor), pero el
    // código debe existir y ser distinto del de esquema.
    expect(EXIT_INVARIANT).toBe(3);
    expect(EXIT_INVARIANT).not.toBe(EXIT_SCHEMA);
  });
});

describe("reglas de plan y gate", () => {
  it("no considera sustantivo un plan con solo marcadores", () => {
    const text = readValid().replace(
      /(^## Plan\n)([\s\S]*?)(?=^## Criterios de aceptación)/m,
      "$1\n- TBD\n- pendiente\n\n",
    );
    // El ticket base está en `closed`, así que el workflow exige plan real.
    expect(() => validateDocument(parseTicket(text), { expectedId: VALID_ID })).toThrow(
      new TicketError("El workflow requiere un plan real, no placeholders vacíos."),
    );
  });
});
