/**
 * Avanzar con la compuerta en `block` o `review` exige una decisión humana
 * registrada (R-CDEF-004, feature autonomia-confiable).
 *
 * El defecto que estas pruebas fijan son dos que se esconden entre sí. El primero:
 * `transition()` no leía ningún recibo para entrar a `planned` ni a `approved`, así
 * que un ticket con el último recibo de `analysis` o `plan` en `block` o `review`
 * avanzaba igual —10 veces en el registro real, dos de ellas el 2026-10-05, después
 * del informe—. El segundo: un recibo `block` ni siquiera admitía una decisión
 * humana, porque solo se firma lo escalado y solo `review` escala; para un bloqueo
 * que el PO autorizó seguir no había dónde dejar su frase.
 *
 * Qué se afirma:
 *
 * 1. **Sin firma no se avanza**, ni con `review` ni con `block`, y el rechazo no
 *    toca el ticket. Tampoco con una decisión humana de rechazo, ni por el rodeo de
 *    `blocked`, que no recuerda de dónde vino.
 * 2. **Con firma se avanza y el ticket guarda quién firmó**, en un evento aparte y
 *    anterior a la transición: el `details` de la transición no cambia, porque
 *    `etapas.ts` lo reconoce solo si es exactamente `Workflow: a -> b.`.
 * 3. **Un `block` se puede firmar con la frase literal**, sin reescribir su
 *    veredicto; sin frase no, y el `block` de `qa-mechanical` —un comando que
 *    falló, que es un hecho y no una opinión— tampoco.
 * 4. **Lo que hoy es legal sigue siéndolo**: un último recibo `approve` tras varios
 *    bloqueos avanza sin firma, y sin ningún recibo también.
 *
 * Los recibos se construyen con `buildReceipt` en las dos formas reales —`block`
 * con `escalatedTo: null` y `review` con `escalatedTo: "human"`—, y los eventos los
 * escribe el motor, no la prueba: es el error que dejó a `etapas.ts` sin funcionar
 * con una suite en verde.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EXIT_INVARIANT, TicketError, parseTicket } from "../packages/core/src/index.js";
import {
  appendReceipt,
  currentReceipts,
  duracionesPorEtapa,
  fasesPorTicket,
  readReceipts,
  receiptsPath,
  transition,
  type RegistryPaths,
} from "../packages/engine/src/index.js";
import {
  DEFAULT_POLICY,
  buildReceipt,
  decide,
  withHumanDecision,
  type GateReceipt,
  type Proposition,
  type PropositionAnswer,
} from "../packages/gate/src/index.js";
import { recordHumanDecision } from "../packages/server/src/gates.js";
import { aprobarPlanEnPrueba } from "./helpers/aprobacion.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";

const PROPOSICIONES: Proposition[] = [
  { id: "cubre_todos_los_criterios", kind: "noul", instructions: "cubre", weight: 3 },
];

/** Un valor por veredicto: con la política por defecto, 0.02 bloquea y 0.72 escala. */
const VALOR: Record<"approve" | "block" | "review", number> = {
  approve: 0.99,
  block: 0.02,
  review: 0.72,
};

let lab: string;
let contador: number;

const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-firma-compuerta-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
  contador = 0;
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/** Un ticket del laboratorio en el estado de partida. */
function ticketEn(estado: string): void {
  writeFixtureTicket(lab, { id: TICKET, workflowStatus: estado });
}

/**
 * Un recibo del veredicto pedido, con el id de una corrida nueva.
 *
 * El veredicto sale de `decide` y no se escribe a mano: así `escalatedTo` es el que
 * el motor de verdad produce —`human` solo con `review`—, que es justo lo que
 * decide quién puede firmar.
 */
function recibo(gate: string, outcome: "approve" | "block" | "review"): GateReceipt {
  contador += 1;
  const respuestas: PropositionAnswer[] = [
    { id: "cubre_todos_los_criterios", kind: "noul", value: VALOR[outcome] },
  ];
  const decision = decide(PROPOSICIONES, respuestas, DEFAULT_POLICY);
  expect(decision.outcome).toBe(outcome);
  return buildReceipt({
    id: `GR-20261005-${TICKET}-${gate}-${contador}`,
    gate,
    propositions: PROPOSICIONES,
    policy: DEFAULT_POLICY,
    subject: { type: "ticket", id: TICKET, revision: "1" },
    decision,
    state: { ticket: TICKET, corrida: contador },
    answers: respuestas,
    mechanicalChecks: [],
    model: null,
    usage: null,
    latencyMs: 10,
    decidedAt: `2026-10-05T10:0${contador}:00.000Z`,
  });
}

/** Escribe un recibo en el registro del laboratorio y lo devuelve. */
function emitir(gate: string, outcome: "approve" | "block" | "review"): GateReceipt {
  const emitido = recibo(gate, outcome);
  appendReceipt(PATHS(), TICKET, emitido);
  return emitido;
}

/** Mueve el ticket del laboratorio. */
function mover(to: string, now?: string): void {
  if (to === "approved") aprobarPlanEnPrueba(PATHS(), TICKET);
  transition({
    paths: PATHS(),
    ticketId: TICKET,
    entity: "ticket",
    to,
    ...(now === undefined ? {} : { now: () => new Date(now) }),
  });
}

/** El error que lanza un movimiento, o `undefined` si procedió. */
function rechazo(to: string): TicketError | undefined {
  try {
    mover(to);
  } catch (caught) {
    if (caught instanceof TicketError) return caught;
    throw caught;
  }
  return undefined;
}

function rutaTicket(): string {
  return join(lab, "tickets", "2026", TICKET, "ticket.md");
}

function textoTicket(): string {
  return readFileSync(rutaTicket(), "utf8");
}

function eventos(): Record<string, unknown>[] {
  return (parseTicket(textoTicket()).blocks.Eventos ?? []) as Record<string, unknown>[];
}

function estado(): string {
  return parseTicket(textoTicket()).fields.workflow_status;
}

function detalles(accion: string): string[] {
  return eventos()
    .filter((evento) => evento["action"] === accion)
    .map((evento) => String(evento["details"]));
}

/** El comando que el mensaje de rechazo tiene que dar completo. */
function comandoDeDecision(receiptId: string): string {
  return `valmen gate-decide --id ${TICKET} --receipt ${receiptId} --decision approve`;
}

describe("R-CDEF-004: el avance exige la decisión humana", () => {
  it("R-CDEF-004 avance sin firma review", () => {
    ticketEn("analyzed");
    const emitido = emitir("analysis", "review");
    expect(emitido.escalatedTo).toBe("human");

    const error = rechazo("planned");

    expect(error).toBeInstanceOf(TicketError);
    expect(error?.exitCode).toBe(EXIT_INVARIANT);
    expect(error?.message).toContain(emitido.id);
    expect(error?.message).toContain("review");
    expect(error?.message).toContain(comandoDeDecision(emitido.id));
    expect(error?.message).toContain("--actor");
    expect(error?.message).toContain("--reason");
    expect(estado()).toBe("analyzed");
  });

  it("R-CDEF-004 avance sin firma block", () => {
    ticketEn("planned");
    const emitido = emitir("plan", "block");
    expect(emitido.escalatedTo).toBeNull();

    const error = rechazo("approved");

    expect(error).toBeInstanceOf(TicketError);
    expect(error?.exitCode).toBe(EXIT_INVARIANT);
    expect(error?.message).toContain(emitido.id);
    expect(error?.message).toContain("block");
    expect(error?.message).toContain(comandoDeDecision(emitido.id));
    expect(error?.message).toContain("--actor");
    expect(error?.message).toContain("--reason");
    expect(estado()).toBe("planned");
  });

  it("R-CDEF-004 rechazo sin efectos", () => {
    ticketEn("analyzed");
    emitir("analysis", "block");
    const antes = textoTicket();
    const recibosAntes = readFileSync(receiptsPath(PATHS(), TICKET), "utf8");

    expect(rechazo("planned")).toBeInstanceOf(TicketError);

    expect(textoTicket()).toBe(antes);
    expect(readFileSync(receiptsPath(PATHS(), TICKET), "utf8")).toBe(recibosAntes);
  });

  it("R-CDEF-004 decisión de rechazo", () => {
    ticketEn("analyzed");
    const emitido = emitir("analysis", "review");
    const decision = recordHumanDecision(PATHS(), TICKET, emitido.id, {
      decision: "reject",
      actor: "Juan Andrade",
      reason: "falta cubrir el caso de la colisión",
    });
    expect(decision.ok).toBe(true);

    const error = rechazo("planned");

    expect(error).toBeInstanceOf(TicketError);
    expect(error?.exitCode).toBe(EXIT_INVARIANT);
    expect(error?.message).toContain("Juan Andrade");
    expect(error?.message).toContain("falta cubrir el caso de la colisión");
    expect(estado()).toBe("analyzed");
  });

  it("R-CDEF-004 rodeo por blocked", () => {
    // `blocked` sale hacia `planned` desde cualquier origen: una regla atada al par
    // `analyzed → planned` se esquiva pasando por ahí, y el registro real lo tiene.
    ticketEn("analyzed");
    const emitido = emitir("analysis", "block");
    mover("blocked");
    expect(estado()).toBe("blocked");

    const error = rechazo("planned");

    expect(error).toBeInstanceOf(TicketError);
    expect(error?.message).toContain(emitido.id);
    expect(estado()).toBe("blocked");
  });
});

describe("R-CDEF-004: el avance firmado deja la firma en el ticket", () => {
  it("R-CDEF-004 avance firmado", () => {
    ticketEn("analyzed");
    const emitido = emitir("analysis", "review");
    const decision = recordHumanDecision(PATHS(), TICKET, emitido.id, {
      decision: "approve",
      actor: "Juan Andrade",
      reason: "dale, el análisis alcanza",
    });
    expect(decision.ok).toBe(true);

    mover("planned");

    expect(estado()).toBe("planned");
    // Exactamente uno: el que escribe `recordHumanDecision` al decidir. El avance
    // no agrega un duplicado cuando el evento ya cita ese recibo.
    const firmas = detalles("gate-approved");
    expect(firmas).toHaveLength(1);
    expect(firmas[0]).toContain("Juan Andrade");
    expect(firmas[0]).toContain("dale, el análisis alcanza");
    expect(firmas[0]).toContain(emitido.id);
  });

  it("R-CDEF-004 constancia al avanzar", () => {
    ticketEn("analyzed");
    const emitido = emitir("analysis", "review");
    // La decisión queda solo en el recibo: es lo que pasa si anotar el evento
    // falló después de escribir el recibo, o con una decisión anterior al evento.
    appendReceipt(
      PATHS(),
      TICKET,
      withHumanDecision(emitido, {
        actor: "Juan Andrade",
        decision: "approve",
        reason: "dale, el análisis alcanza",
        channel: "cli",
        decidedAt: "2026-10-05T12:00:00.000Z",
      }),
    );

    mover("planned", "2026-10-05T12:05:00.000Z");

    const lista = eventos();
    expect(lista.map((evento) => evento["action"])).toEqual([
      "created",
      "gate-approved",
      "ticket-transition",
    ]);
    expect(lista.map((evento) => evento["id"])).toEqual([
      "EVENT-001",
      "EVENT-002",
      "EVENT-003",
    ]);
    const firma = String(lista[1]?.["details"]);
    expect(firma).toContain("Juan Andrade");
    expect(firma).toContain("dale, el análisis alcanza");
    expect(firma).toContain(emitido.id);
    expect(firma).toContain("2026-10-05T12:00:00.000Z");
    // La transición no cambia de forma: lo que `etapas.ts` reconoce es exactamente
    // esta frase, sin nada detrás del punto.
    expect(lista[2]?.["details"]).toBe("Workflow: analyzed -> planned.");
  });
});

describe("R-CDEF-004: la firma sobre un bloqueo", () => {
  it("R-CDEF-004 firma de un bloqueo", () => {
    ticketEn("planned");
    const emitido = emitir("plan", "block");

    const decision = recordHumanDecision(PATHS(), TICKET, emitido.id, {
      decision: "approve",
      actor: "Juan Andrade",
      reason: "autorizo seguir: el artefacto ya incorpora la corrección",
    });

    expect(decision.ok).toBe(true);
    const vigente = currentReceipts(readReceipts(PATHS(), TICKET)).find(
      (candidato) => candidato.id === emitido.id,
    );
    // El veredicto del evaluador no se reescribe: la persona lo anula, no lo borra.
    expect(vigente?.outcome).toBe("block");
    expect(vigente?.escalatedTo).toBeNull();
    expect(vigente?.actor).toBe("human");
    expect(vigente?.humanDecision?.decision).toBe("approve");
    expect(vigente?.humanDecision?.reason).toBe(
      "autorizo seguir: el artefacto ya incorpora la corrección",
    );

    mover("approved");
    expect(estado()).toBe("approved");
    expect(detalles("gate-approved")).toHaveLength(1);
  });

  it("R-CDEF-004 bloqueo sin frase", () => {
    ticketEn("planned");
    const emitido = emitir("plan", "block");
    const recibosAntes = readFileSync(receiptsPath(PATHS(), TICKET), "utf8");
    const textoAntes = textoTicket();

    for (const reason of ["", "   "]) {
      const decision = recordHumanDecision(PATHS(), TICKET, emitido.id, {
        decision: "approve",
        actor: "Juan Andrade",
        reason,
      });
      expect(decision.ok).toBe(false);
      expect(decision.error).toContain("frase");
    }

    expect(readFileSync(receiptsPath(PATHS(), TICKET), "utf8")).toBe(recibosAntes);
    expect(textoTicket()).toBe(textoAntes);
  });

  it("R-CDEF-004 compuerta mecánica", () => {
    ticketEn("in_progress");
    const emitido = emitir("qa-mechanical", "block");

    const decision = recordHumanDecision(PATHS(), TICKET, emitido.id, {
      decision: "approve",
      actor: "Juan Andrade",
      reason: "autorizo entregar con la prueba rota",
    });

    expect(decision.ok).toBe(false);
    // El id del recibo ya contiene «qa-mechanical»: lo que se comprueba es que el
    // motor diga por qué, no que repita el nombre.
    expect(decision.error).toContain("un comando que falló");
    const vigente = currentReceipts(readReceipts(PATHS(), TICKET)).find(
      (candidato) => candidato.id === emitido.id,
    );
    expect(vigente?.humanDecision).toBeNull();
  });
});

describe("R-CDEF-004: lo que hoy es legal sigue siéndolo", () => {
  it("R-CDEF-004 último recibo aprobado", () => {
    // Seis de los 14 tickets del informe: bloquearon, corrigieron, volvieron a
    // evaluar y avanzaron sobre un `approve`. La regla mira el último recibo.
    ticketEn("analyzed");
    emitir("analysis", "block");
    emitir("analysis", "block");
    emitir("analysis", "approve");

    mover("planned");

    expect(estado()).toBe("planned");
    expect(detalles("gate-approved")).toHaveLength(0);
    expect(eventos().map((evento) => evento["action"])).toEqual([
      "created",
      "ticket-transition",
    ]);
  });

  it("R-CDEF-004 sin recibo", () => {
    // 36 avances del registro real no tienen recibo de la compuerta. Cerrar ese
    // hueco es de SECURITY-CORE-TRANSICION-APPROVED-20261005, no de este ticket.
    ticketEn("analyzed");
    mover("planned");
    expect(estado()).toBe("planned");

    mover("approved");
    expect(estado()).toBe("approved");
    expect(detalles("gate-approved")).toHaveLength(0);
  });

  it("R-CDEF-004 etapas y fases", () => {
    ticketEn("analyzed");
    const emitido = emitir("analysis", "review");
    appendReceipt(
      PATHS(),
      TICKET,
      withHumanDecision(emitido, {
        actor: "Juan Andrade",
        decision: "approve",
        reason: "dale",
        channel: "cli",
        decidedAt: "2026-10-05T12:00:00.000Z",
      }),
    );
    mover("planned", "2026-10-05T12:05:00.000Z");
    mover("approved", "2026-10-05T12:30:00.000Z");
    mover("in_progress", "2026-10-05T13:00:00.000Z");

    const todos = eventos();
    const sinFirma = todos.filter((evento) => evento["action"] !== "gate-approved");
    // Que la firma esté, o la comparación de abajo no prueba nada.
    expect(sinFirma).toHaveLength(todos.length - 1);

    expect(duracionesPorEtapa(todos)).toEqual(duracionesPorEtapa(sinFirma));
    expect(fasesPorTicket(todos)).toEqual(fasesPorTicket(sinFirma));
    expect(duracionesPorEtapa(todos).map((etapa) => etapa.estado)).toEqual([
      "intake",
      "planned",
      "approved",
      "in_progress",
    ]);
  });
});
