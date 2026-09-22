/**
 * Migración del registro al esquema 2.
 *
 * Las tres propiedades que hacen segura la migración de un registro en
 * producción, y que este test exige sobre los 57 tickets reales:
 *
 * 1. **Los bloques append-only no se tocan.** El historial es el activo del
 *    sistema; reescribirlo para adaptarlo a un vocabulario nuevo lo destruiría.
 * 2. **Es idempotente.** Migrar dos veces no cambia nada la segunda vez.
 * 3. **Se valida todo antes de escribir.** Un ticket inválido aborta la
 *    migración completa en vez de dejar el registro en dos esquemas a la vez.
 */
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrateRegistry, validateAll } from "../packages/cli/src/commands.js";
import {
  SCHEMA_VERSION,
  STRUCTURED_SECTIONS,
  parseTicket,
  validateDocument,
} from "../packages/core/src/index.js";

const FIXTURE = join(import.meta.dirname, "fixtures", "saicloud", "tickets");
const FIXED_TODAY = "2026-09-21";

let lab: string;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-migrate-"));
  cpSync(FIXTURE, join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

/** Todos los `ticket.md` del laboratorio, ordenados. */
function ticketFiles(): string[] {
  const base = join(lab, "tickets", "2026");
  return readdirSync(base)
    .sort()
    .map((id) => join(base, id, "ticket.md"));
}

/** El texto serializado de cada bloque estructurado, para comparar 1:1. */
function structuredBlocks(text: string): Record<string, unknown[]> {
  const { blocks } = parseTicket(text);
  const snapshot: Record<string, unknown[]> = {};
  for (const section of STRUCTURED_SECTIONS) {
    snapshot[section] = JSON.parse(JSON.stringify(blocks[section])) as unknown[];
  }
  return snapshot;
}

describe("migrate: propiedades", () => {
  it("migra los 57 tickets y los deja válidos en el esquema 2", () => {
    const result = migrateRegistry(PATHS(), { today: FIXED_TODAY });
    expect(result.exitCode).toBe(0);

    const validation = validateAll(PATHS());
    expect(validation.stdout).toBe("Tickets válidos: 57\n");

    for (const file of ticketFiles()) {
      const text = readFileSync(file, "utf8");
      expect(parseTicket(text).fields.schema_version).toBe(SCHEMA_VERSION);
      expect(() =>
        validateDocument(parseTicket(text), {
          expectedId: parseTicket(text).fields.id,
        }),
      ).not.toThrow();
    }
  });

  it("NO toca los bloques JSON append-only", () => {
    const before = new Map(
      ticketFiles().map((file) => [file, structuredBlocks(readFileSync(file, "utf8"))]),
    );

    migrateRegistry(PATHS(), { today: FIXED_TODAY });

    for (const file of ticketFiles()) {
      const after = structuredBlocks(readFileSync(file, "utf8"));
      // Comparación profunda: si un solo evento, punto o ciclo de QA cambiara,
      // la trazabilidad histórica estaría rota.
      expect(after, file).toEqual(before.get(file));
    }
  });

  it("NO toca nada más que el frontmatter", () => {
    const before = new Map(
      ticketFiles().map((file) => {
        const text = readFileSync(file, "utf8");
        const body = text.slice(text.indexOf("\n---\n") + 5);
        return [file, body];
      }),
    );

    migrateRegistry(PATHS(), { today: FIXED_TODAY });

    for (const file of ticketFiles()) {
      const text = readFileSync(file, "utf8");
      const body = text.slice(text.indexOf("\n---\n") + 5);
      expect(body, file).toBe(before.get(file));
    }
  });

  it("es idempotente: la segunda ejecución no cambia ningún byte", () => {
    migrateRegistry(PATHS(), { today: FIXED_TODAY });
    const afterFirst = new Map(
      ticketFiles().map((file) => [file, readFileSync(file, "utf8")]),
    );

    const second = migrateRegistry(PATHS(), { today: "2027-01-01" });
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain("tickets migrados:   0");
    expect(second.stdout).toContain("ya en el esquema:   57");

    for (const file of ticketFiles()) {
      // Ni siquiera `updated` cambia: si lo hiciera, el historial se ensuciaría
      // en cada ejecución de la migración.
      expect(readFileSync(file, "utf8"), file).toBe(afterFirst.get(file));
    }
  });

  it("con --dry-run informa pero no escribe", () => {
    const before = new Map(ticketFiles().map((file) => [file, readFileSync(file, "utf8")]));

    const result = migrateRegistry(PATHS(), {
      dryRun: true,
      today: FIXED_TODAY,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Migración (simulación)");
    expect(result.stdout).toContain("a migrar:           57");

    for (const file of ticketFiles()) {
      expect(readFileSync(file, "utf8"), file).toBe(before.get(file));
    }
  });

  it("aborta sin escribir si un solo ticket es inválido", () => {
    const files = ticketFiles();
    const victim = files[0] as string;
    writeFileSync(
      victim,
      readFileSync(victim, "utf8").replace(/^risk_level: .*$/m, "risk_level: gravisimo"),
      "utf8",
    );
    const snapshot = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));

    const result = migrateRegistry(PATHS(), { today: FIXED_TODAY });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("no se migró nada");
    expect(result.stderr).toContain("risk_level no pertenece al esquema");

    // Ni un solo archivo cambió, incluido el inválido.
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).toBe(snapshot.get(file));
    }
  });

  it("no reporta tipos de evidencia: los 30 históricos normalizan", () => {
    const result = migrateRegistry(PATHS(), {
      dryRun: true,
      today: FIXED_TODAY,
    });
    // La tabla de normalización cubre los 30 valores que la deriva produjo, así
    // que ninguno queda fuera y no hay nada que reportar. Que esto sea cierto
    // lo exige `tests/evidence-kinds.test.ts`; aquí se comprueba el efecto.
    expect(result.stdout).not.toContain("fuera del enum canónico");
  });

  it("reporta un tipo de evidencia genuinamente desconocido, sin reescribirlo", () => {
    const id = "BUGFIX-ADMIN-USERS-PRECARGA-20260826";
    const file = join(lab, "tickets", "2026", id, "ticket.md");
    // `x-inventado` no está en la tabla ni sigue el prefijo `x-` del enum: es
    // un valor que el motor no sabe clasificar y debe señalar.
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(/"kind": "automated"/, '"kind": "inventado"'),
      "utf8",
    );

    const result = migrateRegistry(PATHS(), {
      dryRun: true,
      today: FIXED_TODAY,
    });
    expect(result.stdout).toContain("fuera del enum canónico");
    expect(result.stdout).toContain("inventado");
    // Señalarlo es todo lo que se hace: el valor se conserva.
    expect(readFileSync(file, "utf8")).toContain('"kind": "inventado"');
  });
});

describe("migrate: contenido del frontmatter", () => {
  it("actualiza schema_version y updated, y nada más", () => {
    const file = ticketFiles()[0] as string;
    const before = parseTicket(readFileSync(file, "utf8")).fields;

    migrateRegistry(PATHS(), { today: FIXED_TODAY });

    const after = parseTicket(readFileSync(file, "utf8")).fields;
    expect(after.schema_version).toBe("2");
    expect(after.updated).toBe(FIXED_TODAY);

    // Todos los demás campos, idénticos.
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      if (key === "schema_version" || key === "updated") continue;
      expect(after[key], key).toBe(before[key]);
    }
  });
});
