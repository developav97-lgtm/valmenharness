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
 */
import { describe, expect, it } from "vitest";

import { duracionesPorEtapa } from "../packages/engine/src/etapas.js";

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
  return evento(`EVENT-${de}`, "transition", `Workflow: ${de} -> ${a}.`, at);
}

/** El evento de creación, que abre la serie. */
function creado(at: string | null): Record<string, unknown> {
  return evento("EVENT-000", "created", "Ticket creado sin sobrescribir historial.", at);
}

describe("la duración por etapa", () => {
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
});
