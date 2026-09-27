/**
 * La duración de cada etapa de un ticket.
 *
 * El PO pidió poder medir el tiempo invertido «desde que se inició el análisis,
 * diagnóstico, el plan y la implementación y ya pasó a estado de esperando
 * pruebas». No se podía: los eventos llevaban solo el día, así que no había nada
 * que restar. Ahora llevan hora, y esto la convierte en duración.
 *
 * Y cuando no la llevan —todo el registro escrito antes— se dice que no se puede
 * reconstruir en vez de estimarlo: un tiempo estimado con aspecto de dato es peor
 * que un hueco declarado.
 *
 * **De dónde sale la forma del evento, que es lo que este archivo aprendió a
 * hacer bien.** La primera versión de estas pruebas escribía los eventos a mano
 * con `action: "transition"`, un valor que el motor **no escribe**: el motor
 * escribe `${entity}-transition` (`packages/engine/src/transition.ts`), o sea
 * `ticket-transition`. El código y su prueba compartían el mismo error y la suite
 * quedaba en verde con la duración por etapa sin funcionar en ningún ticket real.
 * Por eso la prueba principal ya no inventa los eventos: los hace escribir al
 * motor —una transición de verdad sobre un ticket de verdad— y después los lee
 * del archivo. Las de reglas siguen con eventos armados, pero con la acción real
 * y declarada una sola vez, y con una afirmación que la ata a la del motor.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseTicket } from "../packages/core/src/index.js";
import { duracionEnTexto, duracionesPorEtapa } from "../packages/engine/src/etapas.js";
import { transition } from "../packages/engine/src/transition.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

/** La acción con la que el motor escribe una transición de ticket. */
const ACCION_TRANSICION = "ticket-transition";

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";

let lab: string;

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-etapas-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Los eventos que quedaron escritos en el ticket del laboratorio. */
function eventosDelTicket(): Record<string, unknown>[] {
  const texto = readFileSync(join(lab, "tickets", "2026", TICKET, "ticket.md"), "utf8");
  return (parseTicket(texto).blocks.Eventos ?? []) as Record<string, unknown>[];
}

/** Mueve el ticket en el laboratorio, con la hora que se le pida. */
function mover(to: string, at: string): void {
  transition({
    paths: PATHS(),
    ticketId: TICKET,
    entity: "ticket",
    to,
    now: () => new Date(at),
  });
}

/** Un evento del registro, con la hora que se le pase. */
function evento(
  id: string,
  action: string,
  details: string,
  at: string | null,
): Record<string, unknown> {
  return {
    kind: "ticket-event",
    id,
    date: at === null ? "2026-09-01" : at.slice(0, 10),
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

/** El evento de creación, que abre la serie. */
function creado(at: string | null): Record<string, unknown> {
  return evento("EVENT-000", "created", "Ticket creado sin sobrescribir historial.", at);
}

describe("la duración por etapa", () => {
  it("lee las transiciones que escribe el motor, no una forma inventada", () => {
    // El caso que dejó la función inservible sin que nada fallara: la lista de
    // etapas salía con un solo elemento —la creación— porque la acción del
    // evento no era la que el código esperaba.
    writeFixtureTicket(lab, { id: TICKET, workflowStatus: "planned" });
    mover("approved", "2026-09-21T08:00:00.000Z");
    mover("in_progress", "2026-09-21T08:20:00.000Z");

    const eventos = eventosDelTicket();
    // Primero, que la acción sea la del motor: si esto cambia, las pruebas de
    // abajo están armadas con una forma vieja y hay que enterarse acá.
    expect(eventos[1]?.["action"]).toBe(ACCION_TRANSICION);

    const etapas = duracionesPorEtapa(eventos);
    expect(etapas.map((e) => e.estado)).toEqual(["intake", "approved", "in_progress"]);
    // La creación del generador no trae hora, así que el primer tramo no se
    // puede medir; el segundo sí, y son veinte minutos.
    expect(etapas[0]?.ms).toBeNull();
    expect(etapas[1]?.ms).toBeNull();
    expect(etapas[2]?.ms).toBe(20 * 60 * 1000);
  });

  it("resta las marcas con hora, de la creación al final", () => {
    const etapas = duracionesPorEtapa([
      creado("2026-09-01T07:30:00.000Z"),
      transicion("intake", "analyzed", "2026-09-01T08:00:00.000Z"),
      transicion("analyzed", "planned", "2026-09-01T08:30:00.000Z"),
      transicion("planned", "approved", "2026-09-01T09:00:00.000Z"),
      transicion("approved", "in_progress", "2026-09-01T09:05:00.000Z"),
      transicion("in_progress", "awaiting_user_tests", "2026-09-01T11:05:00.000Z"),
    ]);

    expect(etapas.map((e) => e.estado)).toEqual([
      "intake",
      "analyzed",
      "planned",
      "approved",
      "in_progress",
      "awaiting_user_tests",
    ]);
    // La primera marca no tiene contra qué restar: no se inventa un cero.
    expect(etapas[0]?.ms).toBeNull();
    expect(etapas[1]?.ms).toBe(30 * 60 * 1000);
    expect(etapas[2]?.ms).toBe(30 * 60 * 1000);
    expect(etapas[3]?.ms).toBe(30 * 60 * 1000);
    expect(etapas[4]?.ms).toBe(5 * 60 * 1000);
    expect(etapas[5]?.ms).toBe(120 * 60 * 1000);
  });

  it("un ticket escrito antes, sin horas, se declara no reconstruible", () => {
    const etapas = duracionesPorEtapa([
      creado(null),
      transicion("intake", "analyzed", null),
      transicion("analyzed", "planned", null),
      transicion("planned", "approved", null),
    ]);

    expect(etapas).toHaveLength(4);
    for (const etapa of etapas) {
      expect(etapa.at).toBeNull();
      expect(etapa.ms).toBeNull();
    }
  });

  it("una etapa sin hora corta la medida, no la falsea", () => {
    // Los tickets reales son una mezcla: los eventos viejos no traen hora. El
    // tramo que sí la trae en sus dos puntas se mide; el que la cruza queda en
    // blanco, en vez de medir de más.
    const etapas = duracionesPorEtapa([
      creado(null),
      transicion("intake", "analyzed", "2026-09-01T08:00:00.000Z"),
      transicion("analyzed", "planned", "2026-09-01T08:45:00.000Z"),
    ]);

    expect(etapas[0]?.ms).toBeNull();
    expect(etapas[1]?.ms).toBeNull();
    expect(etapas[2]?.ms).toBe(45 * 60 * 1000);
  });

  it("solo mira lo que mueve el workflow", () => {
    const etapas = duracionesPorEtapa([
      evento(
        "EVENT-001",
        "ai-usage-added",
        "Se agregó CONSUMO-001.",
        "2026-09-01T07:00:00.000Z",
      ),
      transicion("intake", "analyzed", "2026-09-01T08:00:00.000Z"),
      evento(
        "EVENT-003",
        "point-added",
        "Se agregó POINT-001.",
        "2026-09-01T08:10:00.000Z",
      ),
    ]);

    expect(etapas.map((e) => e.estado)).toEqual(["analyzed"]);
  });

  it("la duración se escribe en unidades que se leen", () => {
    expect(duracionEnTexto(null)).toBe("no reconstruible");
    // Medio segundo no es «0 min»: es menos de un minuto.
    expect(duracionEnTexto(600)).toBe("<1 min");
    expect(duracionEnTexto(90 * 1000)).toBe("2 min");
    expect(duracionEnTexto(45 * 60 * 1000)).toBe("45 min");
    expect(duracionEnTexto(120 * 60 * 1000)).toBe("2 h");
    expect(duracionEnTexto(125 * 60 * 1000)).toBe("2 h 5 min");
  });
});
