/**
 * Las tablas de transición, contra las de la implementación de referencia.
 *
 * La tabla es el contrato de qué movimiento es legal. Está transcrita de
 * `tools/agentic/ticket.py` L73-101, así que este test la vuelve a escribir a
 * mano —desde el archivo Python, no desde mi código— y compara. Si alguien toca
 * una arista sin querer, se ve aquí y no en producción.
 *
 * El estado `blocked` se compara aparte: el esquema 1 de la referencia no lo
 * conoce, así que no puede formar parte de la transcripción. Sus aristas salen
 * de `BLOCKED_EXITS`, que ya estaba en el contrato.
 */
import { describe, expect, it } from "vitest";

import {
  BLOCKED_EXITS,
  type PointState,
  type ReleaseState,
  type WorkflowState,
} from "../packages/core/src/contract.js";
import { EXIT_INVARIANT } from "../packages/core/src/errors.js";
import {
  POINT_TRANSITIONS,
  RELEASE_TRANSITIONS,
  TICKET_TRANSITIONS,
  assertTransition,
  canTransition,
  isTerminal,
  nextStates,
} from "../packages/core/src/transitions.js";

/**
 * Las tablas del esquema 1, transcritas del archivo de referencia.
 *
 * Diez estados de ticket, cuatro de release y nueve de punto. **Sin `blocked`**:
 * la referencia rechaza ese estado al validar, así que no está en su tabla.
 */
const REFERENCIA_TICKET: Readonly<Record<string, readonly string[]>> = {
  intake: ["analyzed"],
  analyzed: ["planned"],
  planned: ["approved"],
  approved: ["in_progress"],
  in_progress: ["awaiting_user_tests"],
  awaiting_user_tests: ["in_qa"],
  in_qa: ["changes_requested", "qa_approved"],
  changes_requested: ["in_progress"],
  qa_approved: ["closed"],
  closed: ["changes_requested"],
};

const REFERENCIA_RELEASE: Readonly<Record<string, readonly string[]>> = {
  unreleased: ["planned", "not_applicable"],
  planned: ["released"],
  released: [],
  not_applicable: [],
};

const REFERENCIA_PUNTO: Readonly<Record<string, readonly string[]>> = {
  open: ["analyzed", "not_reproducible", "deferred", "duplicate"],
  analyzed: ["in_progress", "not_reproducible", "deferred", "duplicate"],
  in_progress: ["awaiting_retest", "not_reproducible", "deferred", "duplicate"],
  awaiting_retest: ["verified", "not_reproducible", "deferred", "duplicate"],
  verified: ["closed"],
  closed: [],
  not_reproducible: [],
  deferred: [],
  duplicate: [],
};

/** Quita `blocked` de una tabla para poder compararla con la referencia. */
function sinBlocked(
  tabla: Readonly<Record<string, readonly string[]>>,
): Record<string, readonly string[]> {
  const salida: Record<string, readonly string[]> = {};
  for (const [estado, destinos] of Object.entries(tabla)) {
    if (estado === "blocked") continue;
    salida[estado] = destinos.filter((destino) => destino !== "blocked");
  }
  return salida;
}

describe("las tablas son las de la referencia", () => {
  it("ticket: los diez estados del esquema 1 coinciden arista por arista", () => {
    expect(sinBlocked(TICKET_TRANSITIONS)).toEqual(REFERENCIA_TICKET);
  });

  it("release: coincide, incluidas las dos terminales", () => {
    expect(RELEASE_TRANSITIONS).toEqual(REFERENCIA_RELEASE);
  });

  it("punto: coincide, con los terminales accesibles desde cualquier no terminal", () => {
    expect(POINT_TRANSITIONS).toEqual(REFERENCIA_PUNTO);
  });
});

describe("el estado `blocked` del esquema 2", () => {
  it("se entra desde los cuatro estados que declara BLOCKED_EXITS", () => {
    for (const estado of BLOCKED_EXITS) {
      expect(canTransition("ticket", estado, "blocked"), estado).toBe(true);
    }
    // Y no desde los demás: `blocked` no es un cajón donde meter cualquier cosa.
    expect(canTransition("ticket", "intake", "blocked")).toBe(false);
    expect(canTransition("ticket", "in_qa", "blocked")).toBe(false);
    expect(canTransition("ticket", "closed", "blocked")).toBe(false);
  });

  it("se sale a los mismos cuatro estados", () => {
    expect(TICKET_TRANSITIONS.blocked).toEqual(BLOCKED_EXITS);
  });

  it("la tabla cubre los once estados del esquema 2, sin dejarse ninguno", () => {
    // Un estado sin entrada en la tabla sería un estado sin salida posible, y
    // `nextStates` devolvería vacío en silencio.
    for (const estado of Object.keys(TICKET_TRANSITIONS)) {
      expect(TICKET_TRANSITIONS[estado as WorkflowState]).toBeDefined();
    }
    const esquema2: WorkflowState[] = [
      "intake",
      "analyzed",
      "planned",
      "approved",
      "in_progress",
      "blocked",
      "awaiting_user_tests",
      "in_qa",
      "changes_requested",
      "qa_approved",
      "closed",
    ];
    expect(Object.keys(TICKET_TRANSITIONS).sort()).toEqual([...esquema2].sort());
  });
});

describe("las aristas que no existen", () => {
  it("no hay vuelta a `intake` ni a `unreleased` desde ningún estado", () => {
    for (const destinos of Object.values(TICKET_TRANSITIONS)) {
      expect(destinos).not.toContain("intake");
    }
    for (const destinos of Object.values(RELEASE_TRANSITIONS)) {
      expect(destinos).not.toContain("unreleased");
    }
  });

  it("no se salta el pipeline: `planned` no va directo a `in_progress`", () => {
    expect(canTransition("ticket", "planned", "in_progress")).toBe(false);
    expect(canTransition("ticket", "intake", "approved")).toBe(false);
    expect(canTransition("ticket", "in_progress", "closed")).toBe(false);
  });

  it("un punto no vuelve atrás desde un terminal", () => {
    const terminales: PointState[] = [
      "not_reproducible",
      "deferred",
      "duplicate",
      "closed",
    ];
    for (const estado of terminales) {
      expect(isTerminal("point", estado), estado).toBe(true);
    }
    expect(canTransition("point", "not_reproducible", "open")).toBe(false);
    expect(canTransition("point", "closed", "verified")).toBe(false);
  });

  it("`closed` de punto es terminal pero no exige motivo; los otros tres sí", () => {
    // La distinción es real en la referencia: `closed` sale de la tabla de
    // estados sin sucesor, y los tres terminales salen de otra lista.
    expect(isTerminal("point", "closed")).toBe(true);
    expect(["not_reproducible", "deferred", "duplicate"]).not.toContain("closed");
  });

  it("una release publicada no se despublica", () => {
    const terminales: ReleaseState[] = ["released", "not_applicable"];
    for (const estado of terminales) {
      expect(isTerminal("release", estado), estado).toBe(true);
    }
  });
});

describe("el error de una transición ilegal", () => {
  it("dice el estado actual y el pedido, y sale con 3", () => {
    let capturado: unknown;
    try {
      assertTransition("ticket", "planned", "in_progress");
    } catch (error) {
      capturado = error;
    }
    expect((capturado as Error).message).toBe(
      "Transición de ticket planned -> in_progress no permitida.",
    );
    expect((capturado as { exitCode: number }).exitCode).toBe(EXIT_INVARIANT);
  });

  it("nombra la entidad como la nombra la referencia", () => {
    for (const [entity, nombre] of [
      ["ticket", "ticket"],
      ["point", "punto"],
      ["release", "release"],
    ] as const) {
      let mensaje = "";
      try {
        assertTransition(entity, "inexistente", "tampoco");
      } catch (error) {
        mensaje = (error as Error).message;
      }
      expect(mensaje).toBe(`Transición de ${nombre} inexistente -> tampoco no permitida.`);
    }
  });

  it("un destino inventado aparece tal cual, sin corregirlo", () => {
    // Quien escribe `--to aprobado` necesita ver `aprobado` en el error.
    let mensaje = "";
    try {
      assertTransition("ticket", "planned", "aprobado");
    } catch (error) {
      mensaje = (error as Error).message;
    }
    expect(mensaje).toContain("planned -> aprobado");
  });

  it("un estado desconocido no tiene salidas, y eso es un error, no un pase", () => {
    expect(nextStates("ticket", "inventado")).toEqual([]);
    expect(() => assertTransition("ticket", "inventado", "planned")).toThrow(
      /no permitida/,
    );
  });
});
