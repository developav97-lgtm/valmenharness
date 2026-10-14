/**
 * El turno de cada ticket y el resultado de las pruebas del responsable desde la web
 * (FEATURE-WEB-TRABAJO-TICKETS-20261014: R-TRA-001, R-TRA-002).
 *
 * Todo pasa por `handleApi` sobre un registro temporal escrito con el motor: la tabla de turno
 * del plan (C1), el filtro por turno y sus cuentas (C2, C3), el contrato de pruebas que lee
 * «Te toca» (C9) y la ruta `POST /api/tickets/:id/pruebas-del-responsable` con sus rechazos y
 * lo que deja en el ticket (C13, C14, C15). Nunca toca `tickets/` del repositorio.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hasRecordedUserTestOutcome, parseTicket } from "../packages/core/src/index.js";
import { findTicket } from "../packages/engine/src/discovery.js";
import { appendReceipt, type RegistryPaths } from "../packages/engine/src/index.js";
import type { GateReceipt } from "../packages/gate/src/index.js";
import { handleApi } from "../packages/server/src/server.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

let root: string;
const paths = (): RegistryPaths => ({ root, ticketsDir: "tickets" });
const contexto = () => ({
  root,
  credentialsFile: join(root, ".valmen", ".credentials.yaml"),
  env: {},
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-turno-"));
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(root, ".valmen", "config.yaml"), "name: Demo\n", "utf8");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function texto(id: string): string {
  const ubicado = findTicket(paths(), id);
  if (ubicado === undefined) throw new Error(`no existe ${id}`);
  return readFileSync(ubicado.absolutePath, "utf8");
}

function reescribir(id: string, cambio: (t: string) => string): void {
  const ubicado = findTicket(paths(), id);
  if (ubicado === undefined) throw new Error(`no existe ${id}`);
  writeFileSync(ubicado.absolutePath, cambio(ubicado.text), "utf8");
}

let siguienteEvento = 10;
/** Anexa un evento al bloque de eventos tal como lo deja el motor. */
function evento(id: string, accion: string, detalles: string): void {
  siguienteEvento += 1;
  reescribir(id, (t) =>
    t.replace(
      /\n\]\n```\n$/,
      `,\n  {\n    "kind": "ticket-event",\n    "id": "EVENT-0${siguienteEvento}",\n` +
        `    "date": "2026-09-21",\n    "action": "${accion}",\n    "actor": "cli",\n` +
        `    "details": ${JSON.stringify(detalles)}\n  }\n]\n\`\`\`\n`,
    ),
  );
}

function reciboReview(id: string, gate: string): GateReceipt {
  return {
    kind: "gate-receipt",
    receiptVersion: 1,
    schemaVersion: "2",
    id: `GR-20260921-${id}-${gate}-1`,
    gate,
    gateHash: "sha256:test",
    subject: { type: "ticket", id, revision: "1" },
    outcome: "review",
    reason: "una proposición en la banda media",
    actor: "model",
    decidedAt: "2026-09-21T09:00:00.000Z",
    stateHash: "sha256:estado",
    policy: { approveAt: 0.9, blockAt: 0.1 },
    mechanicalChecks: [],
    modelAnswers: [],
    propositions: [],
    model: null,
    usage: null,
    latencyMs: null,
    escalatedTo: "human",
    humanDecision: null,
  } as unknown as GateReceipt;
}

interface Turno {
  quien: string;
  paso: number;
  rotulo: string;
}
interface Fila {
  id: string;
  workflowStatus: string;
  turno: Turno | null;
}

async function lista(query?: Record<string, string>) {
  const r = await handleApi(
    "GET",
    "/api/tickets",
    {},
    contexto(),
    query === undefined ? undefined : new URLSearchParams(query),
  );
  expect(r.status).toBe(200);
  return r.body as {
    summary: { porTurno?: Record<string, number> };
    tickets: Fila[];
  };
}

const ID = (nombre: string) => `FEATURE-WEB-${nombre}-20260921`;

/** Un ticket de cada caso de la tabla de turno del plan. */
function registro(): void {
  const t = (nombre: string, estado: string, extra: Record<string, unknown> = {}) =>
    writeFixtureTicket(root, { id: ID(nombre), type: "FEATURE", module: "WEB", workflowStatus: estado, ...extra });
  t("ALTA", "intake");
  t("ANALIZADO", "analyzed");
  t("PLAN", "planned");
  t("CURSO", "in_progress");
  t("CAMBIOS", "changes_requested");
  t("PRUEBAS", "awaiting_user_tests");
  t("QA", "in_qa");
  t("QAOK", "qa_approved", { qaStatus: "approved" });
  t("RATIFICAR", "qa_approved", { qaStatus: "approved" });
  evento(
    ID("RATIFICAR"),
    "agent-decision",
    JSON.stringify({ id: "D-001", pregunta: "¿p?", eleccion: "e", alternativas: [], criterio: "c", fuente: "f", reversion: "r" }),
  );
  t("BLOQUEADO", "blocked");
  evento(ID("BLOQUEADO"), "ticket-transition", "Workflow: planned -> blocked.");
  t("REVIEW", "analyzed");
  appendReceipt(paths(), ID("REVIEW"), reciboReview(ID("REVIEW"), "analysis"));
  t("CERRADO", "closed", { qaStatus: "approved" });
}

describe("GET /api/tickets: el turno de cada ticket", () => {
  it.each([
    ["ALTA", "agente", 2, "intake"],
    ["ANALIZADO", "agente", 3, "analyzed"],
    ["PLAN", "persona", 4, "planned"],
    ["CURSO", "agente", 5, "in_progress"],
    ["CAMBIOS", "persona", 5, "changes_requested"],
    ["PRUEBAS", "persona", 6, "awaiting_user_tests"],
    ["QA", "persona", 7, "in_qa"],
    ["QAOK", "agente", 8, "qa_approved"],
    ["RATIFICAR", "persona", 8, "ratificar antes de cerrar"],
    ["BLOQUEADO", "persona", 4, "blocked"],
    ["REVIEW", "persona", 3, "analyzed · REVIEW"],
    ["CERRADO", "nadie", 9, "closed"],
  ])("C1: %s → %s, paso %i, «%s»", async (nombre, quien, paso, rotulo) => {
    registro();
    const fila = (await lista()).tickets.find((f) => f.id === ID(nombre));
    expect(fila?.turno).toMatchObject({ quien, paso, rotulo });
  });

  it("C2: ?turno=persona devuelve solo los tickets cuyo turno es de la persona", async () => {
    registro();
    const { tickets } = await lista({ turno: "persona" });
    expect(tickets.map((f) => f.id).sort()).toEqual(
      ["PLAN", "CAMBIOS", "PRUEBAS", "QA", "RATIFICAR", "BLOQUEADO", "REVIEW"].map(ID).sort(),
    );
  });

  it("C3: summary.porTurno trae las cuentas de las cuatro pestañas", async () => {
    registro();
    const { summary } = await lista();
    expect(summary.porTurno).toEqual({ activos: 11, persona: 7, agente: 4, cerrados: 1 });
  });

  it("sin el parámetro turno la lista es la de siempre: todos los tickets", async () => {
    registro();
    expect((await lista()).tickets).toHaveLength(12);
  });
});

describe("GET /api/tickets/:id: el contrato de pruebas de «Te toca»", () => {
  it("C9: lee directorio, ambiente, los comandos numerados y las validaciones manuales de ## Pruebas", async () => {
    writeFixtureTicket(root, {
      id: ID("PRUEBAS"),
      workflowStatus: "awaiting_user_tests",
      pruebas: [
        "- Directorio: la raíz del repositorio.",
        "- Requisitos de ambiente: Node 24.",
        "- Comandos y resultado esperado:",
        "  1. `npx vitest run packages/server` → todo en verde.",
        "  2. `npx tsc -p packages/server` → sin errores.",
        "- Validaciones manuales:",
        "  - Abrir un ticket en la vista y comprobar la etiqueta.",
      ].join("\n"),
    });
    const r = await handleApi("GET", `/api/tickets/${ID("PRUEBAS")}`, {}, contexto());
    expect((r.body as { contratoDePruebas: unknown }).contratoDePruebas).toEqual({
      directorio: "la raíz del repositorio.",
      ambiente: "Node 24.",
      comandos: [
        { comando: "npx vitest run packages/server", esperado: "todo en verde." },
        { comando: "npx tsc -p packages/server", esperado: "sin errores." },
      ],
      manuales: ["Abrir un ticket en la vista y comprobar la etiqueta."],
    });
    expect((r.body as { turno: Turno }).turno).toMatchObject({ quien: "persona", paso: 6 });
  });
});

describe("POST /api/tickets/:id/pruebas-del-responsable", () => {
  const RUTA = () => `/api/tickets/${ID("PRUEBAS")}/pruebas-del-responsable`;
  const enPruebas = () =>
    writeFixtureTicket(root, { id: ID("PRUEBAS"), type: "FEATURE", module: "WEB", workflowStatus: "awaiting_user_tests" });

  it.each([
    ["pasaron", "- Resultado del PO: pasaron — «Probé los tres comandos, todo bien» (Ana Pérez, Mission Control,"],
    ["fallo", "- Resultado del PO: falló — «Probé los tres comandos, todo bien» (Ana Pérez, Mission Control,"],
    ["omitir", "- Omisión explícita documentada del PO: «Probé los tres comandos, todo bien» (Ana Pérez, Mission Control,"],
  ])("C13: con %s deja en ## Pruebas la línea que in_qa reconoce", async (resultado, linea) => {
    enPruebas();
    const r = await handleApi(
      "POST",
      RUTA(),
      { resultado, actor: "Ana Pérez", frase: "Probé los tres comandos, todo bien" },
      contexto(),
    );
    expect(r.status).toBe(200);
    const doc = parseTicket(texto(ID("PRUEBAS")));
    expect(doc.sections.Pruebas).toContain(linea);
    expect(hasRecordedUserTestOutcome(doc)).toBe(true);
  });

  it("C14: con pasaron deja el ticket en in_qa sin aprobar la QA", async () => {
    enPruebas();
    await handleApi("POST", RUTA(), { resultado: "pasaron", actor: "Ana", frase: "Todo bien" }, contexto());
    const doc = parseTicket(texto(ID("PRUEBAS")));
    expect(doc.fields.workflow_status).toBe("in_qa");
    expect(doc.fields.qa_status).toBe("pending");
  });

  it.each([
    ["C15: sin frase literal", { resultado: "pasaron", actor: "Ana", frase: "   " }],
    ["sin actor", { resultado: "pasaron", actor: "", frase: "Todo bien" }],
    ["con un resultado que no es de los tres", { resultado: "aprobar", actor: "Ana", frase: "Todo bien" }],
  ])("%s responde 400 sin escribir el ticket", async (_caso, cuerpo) => {
    enPruebas();
    const antes = texto(ID("PRUEBAS"));
    const r = await handleApi("POST", RUTA(), cuerpo, contexto());
    expect(r.status).toBe(400);
    expect(texto(ID("PRUEBAS"))).toBe(antes);
  });

  it("un ticket que no está en awaiting_user_tests responde 409 sin escribir el ticket", async () => {
    writeFixtureTicket(root, { id: ID("PRUEBAS"), workflowStatus: "in_progress" });
    const antes = texto(ID("PRUEBAS"));
    const r = await handleApi("POST", RUTA(), { resultado: "pasaron", actor: "Ana", frase: "Todo bien" }, contexto());
    expect(r.status).toBe(409);
    expect(texto(ID("PRUEBAS"))).toBe(antes);
  });

  it("un ticket que no existe responde 404", async () => {
    const r = await handleApi("POST", RUTA(), { resultado: "pasaron", actor: "Ana", frase: "Todo bien" }, contexto());
    expect(r.status).toBe(404);
  });
});
