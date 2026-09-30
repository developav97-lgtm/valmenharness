/**
 * El endpoint de fases de un ticket, contra el despachador real.
 *
 * Lo que se afirma acá es el contrato de `GET /api/ticket/fases`: que el server
 * derive la secuencia de fases del bloque `Eventos` con `fasesPorTicket` del
 * engine (`FEATURE-CORE-DERIVAR-FASES-20260929`), que un ticket sin transiciones
 * aparezca con su fase única desde el `at` de la creación, que la falta de base
 * de contabilidad se declare con `timeline.disponible: false` —y no se disfrace
 * con una lista vacía— y que un ticket inexistente responda 404 con el recurso,
 * no con «Ruta no encontrada».
 *
 * Se construye un registro de prueba con `writeFixtureTicket` y se le reescribe
 * el bloque `Eventos` con la forma real del motor (`action: "ticket-transition"`,
 * `details: "Workflow: <de> -> <a>."`), que es la misma que declaran
 * `tests/etapas.test.ts` y `tests/derivacion-fases.test.ts`: inventar la forma
 * dejaría la suite en verde con el endpoint devolviendo una sola fase en un
 * ticket real.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ServerContext, handleApi } from "../packages/server/src/server.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

/** La acción con la que el motor escribe una transición de ticket. */
const ACCION_TRANSICION = "ticket-transition";

/** Una fase, con la forma que devuelve el endpoint. */
interface Fase {
  readonly estado: string;
  readonly inicio: string | null;
  readonly fin: string | null;
  readonly ms: number | null;
  readonly enCurso: boolean;
}

/** Un evento del registro, con la forma real del motor. */
function evento(
  id: string,
  action: string,
  details: string,
  at: string | null,
): Record<string, unknown> {
  return {
    kind: "ticket-event",
    id,
    date: at === null ? "2026-09-29" : at.slice(0, 10),
    action,
    actor: "cli",
    details,
    ...(at === null ? {} : { at }),
  };
}

/** La transición de un estado a otro. */
function transicion(de: string, a: string, at: string | null): Record<string, unknown> {
  return evento(`EVENT-${de}`, ACCION_TRANSICION, `Workflow: ${de} -> ${a}.`, at);
}

/** El evento de creación, que abre la serie en `intake`. */
function creado(at: string | null): Record<string, unknown> {
  return evento("EVENT-000", "created", "Ticket creado sin sobrescribir historial.", at);
}

let lab: string;
let homeOriginal: string | undefined;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-fases-api-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });

  // La línea de tiempo se lee del home de la persona —no del `directory` del
  // proyecto—, así que la prueba lo aísla: un home real con opencode haría que
  // `disponible` dependiera de la máquina que corre los tests.
  homeOriginal = process.env["HOME"];
  process.env["HOME"] = lab;
});

afterEach(() => {
  if (homeOriginal === undefined) delete process.env["HOME"];
  else process.env["HOME"] = homeOriginal;
  rmSync(lab, { recursive: true, force: true });
});

/** El contexto del laboratorio. */
function contexto(): ServerContext {
  return {
    root: lab,
    paths: { root: lab, ticketsDir: "tickets" },
    credentialsFile: join(lab, ".valmen", ".credentials.yaml"),
    env: {},
  };
}

/**
 * Escribe un ticket de prueba válido y reemplaza su bloque `Eventos`.
 *
 * `writeFixtureTicket` no acepta eventos, y el caso que hay que probar es
 * justamente la derivación sobre ellos; reemplazar el bloque JSON conserva el
 * resto de la estructura canónica que el parser exige.
 */
function escribirTicket(
  id: string,
  eventos: readonly Record<string, unknown>[],
  workflowStatus = "planned",
): void {
  writeFixtureTicket(lab, { id, workflowStatus });
  const ruta = join(lab, "tickets", id.slice(-8, -4), id, "ticket.md");
  const texto = readFileSync(ruta, "utf8");
  const bloque = `## Eventos\n\n\`\`\`json\n${JSON.stringify(eventos, null, 2)}\n\`\`\`\n`;
  writeFileSync(ruta, texto.replace(/## Eventos\n\n```json\n[\s\S]*?\n```\n/, bloque), "utf8");
}

/** Llama al endpoint para un ticket del laboratorio. */
async function pedirFases(ticket: string): Promise<{ status: number; body: unknown }> {
  return await handleApi(
    "GET",
    "/api/ticket/fases",
    {},
    contexto(),
    new URLSearchParams({ ticket, directory: lab }),
  );
}

describe("GET /api/ticket/fases", () => {
  it("(a) deriva las fases de las transiciones del bloque Eventos", async () => {
    const id = "FEATURE-PRUEBA-FASES-20260929";
    escribirTicket(
      id,
      [
        creado("2026-09-29T07:00:00.000Z"),
        transicion("intake", "analyzed", "2026-09-29T08:00:00.000Z"),
        transicion("analyzed", "planned", "2026-09-29T08:30:00.000Z"),
        transicion("planned", "in_progress", "2026-09-29T09:00:00.000Z"),
      ],
      "in_progress",
    );

    const r = await pedirFases(id);
    expect(r.status).toBe(200);
    const cuerpo = r.body as { ticket: string; fases: Fase[] };

    expect(cuerpo.ticket).toBe(id);
    expect(cuerpo.fases.map((fase) => fase.estado)).toEqual([
      "intake",
      "analyzed",
      "planned",
      "in_progress",
    ]);

    // Cada tramo cerrado toma su fin del evento siguiente y su duración de la
    // resta de los dos `at`.
    const [intake, analyzed, planned, enCurso] = cuerpo.fases;
    expect(intake?.inicio).toBe("2026-09-29T07:00:00.000Z");
    expect(intake?.fin).toBe("2026-09-29T08:00:00.000Z");
    expect(intake?.ms).toBe(60 * 60 * 1000);
    expect(analyzed?.inicio).toBe("2026-09-29T08:00:00.000Z");
    expect(analyzed?.fin).toBe("2026-09-29T08:30:00.000Z");
    expect(analyzed?.ms).toBe(30 * 60 * 1000);
    expect(planned?.inicio).toBe("2026-09-29T08:30:00.000Z");
    expect(planned?.fin).toBe("2026-09-29T09:00:00.000Z");
    expect(planned?.ms).toBe(30 * 60 * 1000);

    // La última corre ahora.
    expect(enCurso?.inicio).toBe("2026-09-29T09:00:00.000Z");
    expect(enCurso?.fin).toBeNull();
    expect(enCurso?.ms).toBeNull();
    expect(enCurso?.enCurso).toBe(true);
    for (const fase of cuerpo.fases.slice(0, -1)) {
      expect(fase.enCurso).toBe(false);
    }
  });

  it("(b) un ticket sin transiciones responde su fase única desde el at de la creación", async () => {
    const id = "FEATURE-PRUEBA-SIN-TRANSICIONES-20260929";
    escribirTicket(id, [creado("2026-09-29T06:15:00.000Z")], "intake");

    const r = await pedirFases(id);
    expect(r.status).toBe(200);
    const cuerpo = r.body as { fases: Fase[] };

    expect(cuerpo.fases).toHaveLength(1);
    const [intake] = cuerpo.fases;
    expect(intake?.estado).toBe("intake");
    expect(intake?.inicio).toBe("2026-09-29T06:15:00.000Z");
    expect(intake?.fin).toBeNull();
    expect(intake?.ms).toBeNull();
    expect(intake?.enCurso).toBe(true);
  });

  it("(c) sin base de contabilidad declara timeline.disponible en false", async () => {
    const id = "FEATURE-PRUEBA-SIN-CONTABILIDAD-20260929";
    escribirTicket(id, [creado("2026-09-29T06:15:00.000Z")], "intake");

    const r = await pedirFases(id);
    expect(r.status).toBe(200);
    const cuerpo = r.body as { timeline: { disponible: boolean } };

    // `false` es distinto de una línea vacía: la pantalla tiene que poder decir
    // «no hay datos» en vez de mostrar un cero que se lee como «no costó nada».
    expect(cuerpo.timeline.disponible).toBe(false);
  });

  it("(d) un ticket inexistente responde 404 con el identificador", async () => {
    const r = await pedirFases("FEATURE-PRUEBA-NO-EXISTE-20260101");

    expect(r.status).toBe(404);
    expect((r.body as { error: string }).error).toContain("NO-EXISTE");
  });
});
