/**
 * La línea de fases de un ticket, derivada de sus transiciones.
 *
 * `duracionesPorEtapa` ya medía cada estado por separado, pero la serie quedaba
 * abierta: sin hora de fin, sin fase en curso y sin el motivo de la reapertura.
 * Este archivo fija las reglas de la derivación de fases sobre el bloque
 * `Eventos`, con eventos armados a mano.
 *
 * La forma del evento no se inventa: la acción con la que el motor escribe una
 * transición (`` `${entity}-transition` ``, `packages/engine/src/transition.ts`)
 * es `ticket-transition`, y va declarada una sola vez. Un `action` inventado
 * dejaría el parser reconociendo solo la creación y la suite en verde sin que la
 * derivación funcione en ningún ticket real.
 */
import { describe, expect, it } from "vitest";

import { fasesPorTicket, type FaseDeTicket } from "../packages/engine/src/fases.js";

/** La acción con la que el motor escribe una transición de ticket. */
const ACCION_TRANSICION = "ticket-transition";

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

/** La transición de reapertura, que anexa el motivo después del punto. */
function reapertura(
  de: string,
  a: string,
  motivo: string | null,
  at: string | null,
): Record<string, unknown> {
  const details =
    motivo === null
      ? `Workflow: ${de} -> ${a}.`
      : `Workflow: ${de} -> ${a}. ${motivo}`;
  return evento(`EVENT-${de}`, ACCION_TRANSICION, details, at);
}

/** Los estados de una serie de fases, para afirmar sobre ellos de un tirón. */
function estados(fases: readonly FaseDeTicket[]): string[] {
  return fases.map((fase) => fase.estado);
}

describe("la derivación de fases", () => {
  it("(a) un ticket recién creado tiene una sola fase en curso", () => {
    const fases = fasesPorTicket([creado("2026-09-01T07:00:00.000Z")]);

    expect(estados(fases)).toEqual(["intake"]);
    const [intake] = fases;
    expect(intake?.inicio).toBe("2026-09-01T07:00:00.000Z");
    expect(intake?.fin).toBeNull();
    expect(intake?.ms).toBeNull();
    expect(intake?.enCurso).toBe(true);
    expect(intake?.motivo).toBeNull();
  });

  it("(b) cada transición cierra la fase anterior y abre la siguiente", () => {
    const fases = fasesPorTicket([
      creado("2026-09-01T07:00:00.000Z"),
      transicion("intake", "analyzed", "2026-09-01T08:00:00.000Z"),
      transicion("analyzed", "planned", "2026-09-01T08:30:00.000Z"),
      transicion("planned", "in_progress", "2026-09-01T09:00:00.000Z"),
    ]);

    expect(estados(fases)).toEqual(["intake", "analyzed", "planned", "in_progress"]);
    // La fase cerrada toma su fin del evento siguiente y su duración de la resta.
    expect(fases[0]?.inicio).toBe("2026-09-01T07:00:00.000Z");
    expect(fases[0]?.fin).toBe("2026-09-01T08:00:00.000Z");
    expect(fases[0]?.ms).toBe(60 * 60 * 1000);
    expect(fases[1]?.inicio).toBe("2026-09-01T08:00:00.000Z");
    expect(fases[1]?.fin).toBe("2026-09-01T08:30:00.000Z");
    expect(fases[1]?.ms).toBe(30 * 60 * 1000);
    expect(fases[2]?.inicio).toBe("2026-09-01T08:30:00.000Z");
    expect(fases[2]?.fin).toBe("2026-09-01T09:00:00.000Z");
    expect(fases[2]?.ms).toBe(30 * 60 * 1000);
    // La última corre ahora.
    expect(fases[3]?.inicio).toBe("2026-09-01T09:00:00.000Z");
    expect(fases[3]?.fin).toBeNull();
    expect(fases[3]?.ms).toBeNull();
    expect(fases[3]?.enCurso).toBe(true);
    for (const fase of fases.slice(0, 3)) {
      expect(fase.enCurso).toBe(false);
    }
  });

  it("(c) un tramo sin hora en alguna punta queda no reconstruible", () => {
    const sinHoras = fasesPorTicket([
      creado(null),
      transicion("intake", "analyzed", null),
      transicion("analyzed", "planned", null),
    ]);

    expect(estados(sinHoras)).toEqual(["intake", "analyzed", "planned"]);
    for (const fase of sinHoras) {
      expect(fase.inicio).toBeNull();
      expect(fase.fin).toBeNull();
      expect(fase.ms).toBeNull();
    }

    // La mezcla tampoco se estima: el tramo que cruza una marca sin hora queda
    // en blanco, aunque la otra punta sí la traiga.
    const mezcla = fasesPorTicket([
      creado(null),
      transicion("intake", "analyzed", "2026-09-01T08:00:00.000Z"),
      transicion("analyzed", "planned", "2026-09-01T08:45:00.000Z"),
    ]);
    expect(mezcla[0]?.inicio).toBeNull();
    expect(mezcla[0]?.fin).toBe("2026-09-01T08:00:00.000Z");
    expect(mezcla[0]?.ms).toBeNull();
    expect(mezcla[1]?.inicio).toBe("2026-09-01T08:00:00.000Z");
    expect(mezcla[1]?.fin).toBe("2026-09-01T08:45:00.000Z");
    expect(mezcla[1]?.ms).toBe(45 * 60 * 1000);
  });

  it("(d) la reapertura emite una fase nueva con su motivo", () => {
    const fases = fasesPorTicket([
      creado("2026-09-01T07:00:00.000Z"),
      transicion("intake", "analyzed", "2026-09-01T08:00:00.000Z"),
      transicion("analyzed", "qa_approved", "2026-09-01T09:00:00.000Z"),
      transicion("qa_approved", "closed", "2026-09-01T10:00:00.000Z"),
      reapertura(
        "closed",
        "changes_requested",
        "Reapertura por hallazgo: algo.",
        "2026-09-01T11:00:00.000Z",
      ),
    ]);

    expect(estados(fases)).toEqual([
      "intake",
      "analyzed",
      "qa_approved",
      "closed",
      "changes_requested",
    ]);
    // `closed` quedó cerrada por la reapertura: no corre.
    const cerrada = fases[3];
    expect(cerrada?.estado).toBe("closed");
    expect(cerrada?.fin).toBe("2026-09-01T11:00:00.000Z");
    expect(cerrada?.ms).toBe(60 * 60 * 1000);
    expect(cerrada?.enCurso).toBe(false);
    // La reapertura es una fase aparte, con el motivo que sigue al punto.
    const reabierta = fases[4];
    expect(reabierta?.estado).toBe("changes_requested");
    expect(reabierta?.inicio).toBe("2026-09-01T11:00:00.000Z");
    expect(reabierta?.fin).toBeNull();
    expect(reabierta?.ms).toBeNull();
    expect(reabierta?.motivo).toBe("Reapertura por hallazgo: algo.");
    expect(reabierta?.enCurso).toBe(true);
    // El resto no lleva motivo.
    for (const fase of fases.slice(0, 4)) {
      expect(fase.motivo).toBeNull();
    }
  });

  it("(e) los eventos ajenos no son fase ni cortan la serie", () => {
    const fases = fasesPorTicket([
      creado("2026-09-01T07:00:00.000Z"),
      evento("EVENT-usage", "ai-usage-added", "Se agregó CONSUMO-001.", "2026-09-01T07:30:00.000Z"),
      transicion("intake", "analyzed", "2026-09-01T08:00:00.000Z"),
      evento("EVENT-point", "point-added", "Se agregó POINT-001.", "2026-09-01T08:10:00.000Z"),
      evento("EVENT-gate", "gate-approved", "Gate analysis aprobado.", "2026-09-01T08:20:00.000Z"),
      transicion("analyzed", "planned", "2026-09-01T09:00:00.000Z"),
      evento("EVENT-evi", "evidence-added", "Se agregó EVIDENCE-001.", "2026-09-01T09:10:00.000Z"),
    ]);

    expect(estados(fases)).toEqual(["intake", "analyzed", "planned"]);
    // Los eventos ajenos no cerraron la fase `analyzed`: su fin es la transición.
    expect(fases[1]?.fin).toBe("2026-09-01T09:00:00.000Z");
    expect(fases[1]?.ms).toBe(60 * 60 * 1000);
    expect(fases[2]?.inicio).toBe("2026-09-01T09:00:00.000Z");
    expect(fases[2]?.enCurso).toBe(true);
  });

  it("(f) un ticket cerrado no tiene fase en curso", () => {
    const fases = fasesPorTicket([
      creado("2026-09-01T07:00:00.000Z"),
      transicion("intake", "analyzed", "2026-09-01T08:00:00.000Z"),
      transicion("analyzed", "qa_approved", "2026-09-01T09:00:00.000Z"),
      transicion("qa_approved", "closed", "2026-09-01T10:00:00.000Z"),
    ]);

    expect(estados(fases)).toEqual(["intake", "analyzed", "qa_approved", "closed"]);
    // La última es `closed`: cerró el ticket, así que ninguna fase corre.
    expect(fases[3]?.enCurso).toBe(false);
    expect(fases[3]?.fin).toBeNull();
    expect(fases[3]?.ms).toBeNull();
    for (const fase of fases.slice(0, 3)) {
      expect(fase.enCurso).toBe(false);
      expect(fase.fin).not.toBeNull();
      expect(fase.ms).not.toBeNull();
    }
  });
});
