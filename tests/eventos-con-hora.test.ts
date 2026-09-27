/**
 * La hora de un evento del ticket.
 *
 * Los eventos llevaban solo `date` —el día—, así que la duración de un ticket no
 * se podía calcular: no había nada que restar. El tiempo no se perdió, nunca se
 * escribió. Acá se prueba que se escriba, que un ticket ya escrito siga validando
 * —`at` es opcional, y por eso no hay migración— y que una hora inventada no pase
 * por una hora.
 */
import { describe, expect, it } from "vitest";

import { validateEvents } from "../packages/core/src/blocks.js";
import { newEvent } from "../packages/core/src/edit.js";

/** Un evento con la forma vieja, la que ya está escrita en los tickets del registro. */
function sinHora(): Record<string, unknown> {
  return {
    kind: "ticket-event",
    id: "EVENT-001",
    date: "2026-09-01",
    action: "created",
    actor: "cli",
    details: "Ticket creado sin sobrescribir historial.",
  };
}

describe("la hora de los eventos del ticket", () => {
  it("un evento nuevo lleva el día y la hora, en ISO-8601", () => {
    const momento = new Date("2026-09-26T14:33:05.000Z");
    const evento = newEvent(
      [],
      "created",
      "Ticket creado sin sobrescribir historial.",
      "cli",
      momento,
    );

    expect(evento["date"]).toBe("2026-09-26");
    expect(evento["at"]).toBe("2026-09-26T14:33:05.000Z");
    expect(() => validateEvents([evento])).not.toThrow();
  });

  it("un ticket ya escrito, sin hora, sigue validando", () => {
    // Sin esto, agregar `at` obligaría a migrar el registro entero para poder
    // cerrar un ticket viejo.
    expect(() => validateEvents([sinHora()])).not.toThrow();
  });

  it("una hora que no es una hora se rechaza", () => {
    for (const inventada of [
      "26/09/2026 14:33",
      "2026-09-26",
      "ayer",
      "2026-13-45T99:99:99Z",
    ]) {
      expect(() => validateEvents([{ ...sinHora(), at: inventada }])).toThrow();
    }
  });

  it("una clave que no es del esquema se sigue rechazando", () => {
    // La hora es una clave más del esquema, no una puerta abierta: el bloque se
    // reescribe entero, y una clave fuera de sitio reformatearía las demás.
    expect(() => validateEvents([{ ...sinHora(), hora: "14:33" }])).toThrow();
  });

  it("el orden de la serie y las claves obligatorias no se relajan", () => {
    const momento = new Date("2026-09-26T14:33:05.000Z");
    const uno = newEvent(
      [],
      "created",
      "Ticket creado sin sobrescribir historial.",
      "cli",
      momento,
    );
    const dos = newEvent(
      [uno],
      "transition",
      "Workflow: intake -> analyzed.",
      "cli",
      momento,
    );

    expect(dos["id"]).toBe("EVENT-002");
    expect(() => validateEvents([uno, dos])).not.toThrow();
    // Un evento sin hora sigue exigiendo todo lo demás.
    const { details: _detalles, ...sinDetalles } = sinHora();
    expect(() => validateEvents([sinDetalles])).toThrow();
  });
});
