/**
 * La fase de preparación de la jornada (R-JORN-003).
 *
 * El ejecutor es un modelo y puede equivocarse o excederse; por eso lo que se prueba es lo que
 * el **código** comprueba al terminar —estado, recibos, aprobación y árbol de trabajo— con un
 * ejecutor simulado que hace, o no hace, cada cosa. Y que el prompt no ordene aprobar nada.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseTicket } from "../packages/core/src/index.js";
import {
  DEFAULT_POLICY,
  buildReceipt,
  decide,
  type GateReceipt,
  type Proposition,
  type PropositionAnswer,
} from "../packages/gate/src/index.js";
import {
  appendReceipt,
  armarJornada,
  avanzarJornada,
  createJourney,
  prepararTicket,
  promptDePreparacion,
  readReceipts,
  registrarAprobacionDePlan,
  resolveAuthorizedProject,
  siguienteAPreparar,
  type EjecutorDePreparacion,
} from "../packages/engine/src/index.js";
import { buildGateState } from "../packages/engine/src/state.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const projectId = "prep-lab";
const A = "FEATURE-PREP-UNO-20261005";
const B = "FEATURE-PREP-DOS-20261005";
const AHORA = new Date("2026-10-06T08:00:00.000Z");
const CRITERIO = '- [ ] El laboratorio termina correctamente.\n      <!-- test: node -e "process.exit(0)" -->';

let home: string;
let root: string;
const PATHS = (): { root: string; ticketsDir: string } => ({ root, ticketsDir: "tickets" });
const proyecto = () => resolveAuthorizedProject({ projectId, home });

function politica(): void {
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    [
      `project-id: ${projectId}`,
      "test-commands:",
      "  - node",
      "execution:",
      "  dispatch-executors:",
      "    - codex",
      "autonomous:",
      "  enabled: true",
      "  executor:",
      "    id: codex",
      "    model: gpt-6-sol",
      "    effort: high",
      "  eligible:",
      "    types:",
      "      - FEATURE",
      "    max-risk: normal",
      "    require:",
      "      - tests-declared",
      "    excluded-modules:",
      "      - auth",
      "  limits:",
      "    max-concurrent: 1",
      "    collision-policy: serialize",
      "    max-per-day: 3",
      "    budget-per-ticket: 1",
      "    stop-on:",
      "      - test-failure",
      "",
    ].join("\n"),
    "utf8",
  );
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function estado(id: string): string {
  return parseTicket(readFileSync(join(root, "tickets", "2026", id, "ticket.md"), "utf8")).fields.workflow_status;
}

function recibo(ticket: string, gate: string, valor: number): GateReceipt {
  const proposiciones: Proposition[] = [{ id: "cubre_todos_los_criterios", kind: "noul", instructions: "cubre", weight: 3 }];
  const respuestas: PropositionAnswer[] = [{ id: "cubre_todos_los_criterios", kind: "noul", value: valor }];
  return buildReceipt({
    id: `GR-20261006-${ticket}-${gate}-${readReceipts(PATHS(), ticket).length + 1}`,
    gate,
    propositions: proposiciones,
    policy: DEFAULT_POLICY,
    subject: { type: "ticket", id: ticket, revision: "1" },
    decision: decide(proposiciones, respuestas, DEFAULT_POLICY),
    state: buildGateState(readFileSync(join(root, "tickets", "2026", ticket, "ticket.md"), "utf8")),
    answers: respuestas,
    mechanicalChecks: [],
    model: null,
    usage: null,
    latencyMs: 1,
    decidedAt: new Date().toISOString(),
  });
}

/** Un «modelo» que prepara el ticket del prompt: lo deja en planned y corre las dos compuertas. */
function modelo(opciones: {
  valorDePlan?: number;
  aprobarElPlan?: boolean;
  tocarCodigo?: boolean;
  entornos?: Record<string, string>[];
  salida?: number;
} = {}): EjecutorDePreparacion {
  return (comando, entorno) => {
    opciones.entornos?.push({ ...entorno });
    if (opciones.salida !== undefined && opciones.salida !== 0) return { status: opciones.salida, stdout: "", stderr: "falló" };
    const id = /ticket (\S+) en el registro/.exec(comando.args.join(" "))?.[1] ?? "";
    writeFixtureTicket(root, { id, workflowStatus: "planned", type: "FEATURE", module: "PREP", criterios: CRITERIO });
    appendReceipt(PATHS(), id, recibo(id, "analysis", 0.99));
    appendReceipt(PATHS(), id, recibo(id, "plan", opciones.valorDePlan ?? 0.99));
    if (opciones.aprobarElPlan === true) {
      registrarAprobacionDePlan({ paths: PATHS(), ticketId: id, actor: "agente", source: "cli", quote: "me apruebo", env: {} });
    }
    if (opciones.tocarCodigo === true) {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(join(root, "src", "app.ts"), "export const x = 1;\n", "utf8");
    }
    return { status: 0, stdout: "preparado", stderr: "" };
  };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "valmen-prep-"));
  root = join(home, "proyecto");
  mkdirSync(join(home, ".valmen"), { recursive: true });
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(
    join(home, ".valmen", "bindings.local.yaml"),
    `schema-version: 1\nmachine-id: prep\nmanaged-execution-capacity: 1\nprojects:\n  ${projectId}:\n    root: ${root}\n`,
  );
  politica();
  for (const id of [A, B]) writeFixtureTicket(root, { id, workflowStatus: "intake", type: "FEATURE", module: "PREP" });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "T");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("preparar un ticket", () => {
  it("lo deja en planned con los recibos de analysis y plan, y nadie aprobó el plan", () => {
    const resultado = prepararTicket({ paths: PATHS(), ticketId: A, execute: modelo() });
    expect(resultado.estado).toBe("plan-listo");
    expect(estado(A)).toBe("planned");
    const gates = readReceipts(PATHS(), A).map((r) => r.gate);
    expect(gates).toEqual(expect.arrayContaining(["analysis", "plan"]));
    expect(parseTicket(readFileSync(join(root, "tickets", "2026", A, "ticket.md"), "utf8")).blocks.Eventos?.some((e) => e["action"] === "plan-approved")).toBe(false);
  });

  it("el ejecutor corre con VALMEN_UNATTENDED y no puede registrar la aprobación", () => {
    const entornos: Record<string, string>[] = [];
    prepararTicket({ paths: PATHS(), ticketId: A, execute: modelo({ entornos }) });
    expect(entornos[0]?.["VALMEN_UNATTENDED"]).toBe("1");
    expect(() =>
      registrarAprobacionDePlan({ paths: PATHS(), ticketId: A, actor: "agente", source: "cli", quote: "x", env: entornos[0] ?? {} }),
    ).toThrow(/desatendida/);
  });

  it("si el ejecutor deja la aprobación del plan registrada, la verificación falla", () => {
    const resultado = prepararTicket({ paths: PATHS(), ticketId: A, execute: modelo({ aprobarElPlan: true }) });
    expect(resultado.estado).toBe("verificacion-fallo");
    expect(resultado.detalle).toContain("aprobación del plan");
  });

  it("si el ejecutor modifica archivos fuera del registro, la verificación falla y los nombra", () => {
    const resultado = prepararTicket({ paths: PATHS(), ticketId: A, execute: modelo({ tocarCodigo: true }) });
    expect(resultado.estado).toBe("verificacion-fallo");
    expect(resultado.detalle).toContain("src/app.ts");
  });

  it("un fallo del ejecutor se informa y no se reintenta solo", () => {
    const resultado = prepararTicket({ paths: PATHS(), ticketId: A, execute: modelo({ salida: 2 }) });
    expect(resultado.estado).toBe("ejecutor-fallo");
    expect(estado(A)).toBe("intake");
  });

  it("un ticket que no está en intake no es elegible", () => {
    writeFixtureTicket(root, { id: A, workflowStatus: "planned", type: "FEATURE", module: "PREP" });
    expect(prepararTicket({ paths: PATHS(), ticketId: A, execute: modelo() }).estado).toBe("no-elegible");
  });
});

describe("una compuerta que no pasó", () => {
  it("avisa la decisión pendiente en formato de opciones y efecto y deja el ticket como está", () => {
    const avisos: string[] = [];
    const resultado = prepararTicket({
      paths: PATHS(),
      ticketId: A,
      execute: modelo({ valorDePlan: 0.5 }),
      notificar: (texto) => {
        avisos.push(texto);
        return { delivered: true, detail: "ok" };
      },
    });
    expect(resultado.estado).toBe("decision-pendiente");
    expect(avisos).toHaveLength(1);
    const lineas = (avisos[0] ?? "").split("\n");
    expect(lineas[0]).toMatch(/^Decisión: FEATURE-PREP-UNO-20261005 — la compuerta plan quedó en review/);
    expect(lineas.some((l) => /^A\) .* → /.test(l))).toBe(true);
    expect(lineas.some((l) => /^B\) .* → /.test(l))).toBe(true);
    expect(lineas.some((l) => l.startsWith("Recomiendo"))).toBe(true);
    expect(lineas.length).toBeLessThanOrEqual(5);
    expect(estado(A)).toBe("planned");
  });
});

describe("el prompt", () => {
  it("no ordena aprobar compuertas ni el plan, ni mover un ticket a approved", () => {
    const prompt = promptDePreparacion(A).toLowerCase();
    expect(prompt).not.toMatch(/aprueba|aprobar la compuerta|como delegado|move .*approved|a `approved`|in_qa/);
    expect(prompt).toContain("no modifiques código");
    expect(prompt).toContain("detente cuando el ticket esté en `planned`");
  });
});

describe("el avance de preparación", () => {
  const armar = (tickets = [A, B]) => armarJornada({ project: proyecto(), tickets, ahora: () => AHORA });

  it("un ticket cuya dependencia sigue en intake no se prepara todavía", () => {
    // B declara depender de A y la jornada lista a B primero: el orden sale de la dependencia.
    createJourney(proyecto(), {
      revisionId: "dep-01",
      journeyId: "JOR-20261006",
      occurredAt: AHORA.toISOString(),
      tickets: [
        { ticketId: B, order: 1, priority: 1, dependsOn: [A], start: { condition: "dependencies" }, authorizationIds: ["codex"] },
        { ticketId: A, order: 2, priority: 2, dependsOn: [], start: { condition: "dependencies" }, authorizationIds: ["codex"] },
      ],
    });
    expect(siguienteAPreparar(proyecto(), "JOR-20261006")).toBe(A);
    // Con A solo en analyzed (a medio preparar) B sigue esperando; con A en planned, B puede.
    writeFixtureTicket(root, { id: A, workflowStatus: "analyzed", type: "FEATURE", module: "PREP" });
    expect(siguienteAPreparar(proyecto(), "JOR-20261006")).toBeNull();
    writeFixtureTicket(root, { id: A, workflowStatus: "planned", type: "FEATURE", module: "PREP" });
    expect(siguienteAPreparar(proyecto(), "JOR-20261006")).toBe(B);
  });

  it("prepara el primer ticket y el siguiente avance toma el otro, una vez cada uno", async () => {
    armar();
    const primero = await avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, fase: "preparacion", ejecutarPreparacion: modelo() });
    expect(primero.estado).toBe("despachado");
    expect(primero.ticketId).toBe(A);
    expect(estado(A)).toBe("planned");
    expect(estado(B)).toBe("intake");
    // El primer avance dejó cambios sin commitear (el ticket): el árbol de trabajo se
    // reconcilia con un commit antes del siguiente, como hará la jornada.
    git("add", "-A");
    git("commit", "-q", "-m", "ticket preparado");
    const segundo = await avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, fase: "preparacion", ejecutarPreparacion: modelo() });
    expect(segundo.ticketId).toBe(B);
    expect(estado(B)).toBe("planned");
  });

  it("sin tickets en intake no hay candidato", async () => {
    armar();
    writeFixtureTicket(root, { id: A, workflowStatus: "planned", type: "FEATURE", module: "PREP" });
    writeFixtureTicket(root, { id: B, workflowStatus: "planned", type: "FEATURE", module: "PREP" });
    const avance = await avanzarJornada({ project: proyecto(), home, ahora: () => AHORA, fase: "preparacion", ejecutarPreparacion: modelo() });
    expect(avance.estado).toBe("sin-candidato");
  });
});
