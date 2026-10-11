/**
 * El aviso «Necesita tu decisión» del vigilante (R-EPU-003).
 *
 * Un ticket que entra a bloqueado, cambios pedidos o plan por aprobar espera a una persona
 * igual que una compuerta escalada; el aviso sale una vez por entrada. Todo el envío usa un
 * transporte falso: ninguna prueba manda un mensaje real.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseConfig, readHermesConfig } from "../packages/adapter/src/config.js";
import { hermesNotifyPendientes, pendientesDeAvisar } from "../packages/cli/src/hermes.js";
import {
  appendReceipt,
  crearAutorizacionDeAprobacion,
  type CommandRunner,
  decisionesAvisadas,
  renderDecisionNeededNotification,
  type RegistryPaths,
} from "../packages/engine/src/index.js";
import {
  DEFAULT_POLICY,
  buildReceipt,
  decide,
  type GateReceipt,
  type Proposition,
  type PropositionAnswer,
} from "../packages/gate/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const AHORA = new Date("2026-10-11T12:00:00.000Z");
const ID = "FEATURE-CLI-AVISO-DEC-PRUEBA-20261011";
const URL_PANTALLA = "http://localhost:4173";

let root: string;
const paths = (): RegistryPaths => ({ root, ticketsDir: "tickets" });

const CONFIG = {
  enabled: true,
  gateTarget: "telegram",
  budgetTarget: "",
  tokenHours: 24,
  allowedRisk: ["low", "normal"],
};

/** El ticket con una transición de `desde` a `hacia` en `## Eventos`, con el id de evento dado. */
function ticketCon(
  estado: string,
  transiciones: readonly { id: string; hacia: string }[] = [],
): void {
  writeFixtureTicket(root, { id: ID, workflowStatus: estado, module: "POS" });
  const ruta = join(root, "tickets", "2026", ID, "ticket.md");
  const texto = readFileSync(ruta, "utf8");
  const extra = transiciones
    .map(
      (t) => `,
  {
    "kind": "ticket-event",
    "id": "${t.id}",
    "date": "2026-10-11",
    "at": "2026-10-11T10:00:00.000Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> ${t.hacia}."
  }`,
    )
    .join("");
  const marca = "\n]\n```";
  const i = texto.lastIndexOf(marca);
  writeFileSync(ruta, texto.slice(0, i) + extra + texto.slice(i), "utf8");
}

function runnerOk(): { runner: CommandRunner; cuerpos: string[] } {
  const cuerpos: string[] = [];
  const runner: CommandRunner = (_command, _args, input) => {
    cuerpos.push(input);
    return { status: 0, stdout: "{}", stderr: "", failed: false };
  };
  return { runner, cuerpos };
}

const runnerCaido: CommandRunner = () => ({
  status: 1,
  stdout: "",
  stderr: "sin conexión",
  failed: true,
});

const decisiones = () =>
  pendientesDeAvisar(paths(), AHORA).filter((p) => p.kind === "necesita-decision");

function avisar(extra: Partial<Parameters<typeof hermesNotifyPendientes>[0]> = {}) {
  return hermesNotifyPendientes({
    paths: paths(),
    config: CONFIG,
    secret: "secreto-de-prueba", // valmen:allow-secret valor de prueba
    now: AHORA,
    runner: runnerOk().runner,
    ...extra,
  });
}

const PROPOSICIONES: Proposition[] = [
  { id: "cubre_todos_los_criterios", kind: "noul", instructions: "cubre", weight: 3 },
];

function reciboDePlan(): GateReceipt {
  const respuestas: PropositionAnswer[] = [
    { id: "cubre_todos_los_criterios", kind: "noul", value: 0.99 },
  ];
  return buildReceipt({
    id: `GR-20261011-${ID}-plan-1`,
    gate: "plan",
    propositions: PROPOSICIONES,
    policy: DEFAULT_POLICY,
    subject: { type: "ticket", id: ID, revision: "1" },
    decision: decide(PROPOSICIONES, respuestas, DEFAULT_POLICY),
    state: { ticket: ID },
    answers: respuestas,
    mechanicalChecks: [],
    model: null,
    usage: null,
    latencyMs: 1,
    decidedAt: "2026-10-11T09:00:00.000Z",
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-aviso-decision-"));
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(root, ".valmen", "config.yaml"), "name: Demo\n", "utf8");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("qué tickets entran al aviso", () => {
  it("C1 un ticket que pasó a blocked produce el pendiente con motivo «bloqueado»", () => {
    ticketCon("blocked", [{ id: "EVENT-002", hacia: "blocked" }]);
    expect(decisiones()).toMatchObject([
      { kind: "necesita-decision", ticket: ID, reason: "blocked", entryEvent: "EVENT-002" },
    ]);
  });

  it("C2 una entrada ya avisada no vuelve a salir en la corrida siguiente", () => {
    ticketCon("blocked", [{ id: "EVENT-002", hacia: "blocked" }]);
    avisar();
    expect(decisiones()).toEqual([]);
  });

  it("C3 una nueva entrada a blocked, con otro evento, produce un aviso nuevo", () => {
    ticketCon("blocked", [{ id: "EVENT-002", hacia: "blocked" }]);
    avisar();
    ticketCon("blocked", [
      { id: "EVENT-002", hacia: "blocked" },
      { id: "EVENT-003", hacia: "in_progress" },
      { id: "EVENT-004", hacia: "blocked" },
    ]);
    expect(decisiones()).toMatchObject([{ ticket: ID, entryEvent: "EVENT-004" }]);
  });

  it("C4 un ticket que pasó a changes_requested produce el motivo «changes-requested»", () => {
    ticketCon("changes_requested", [{ id: "EVENT-002", hacia: "changes_requested" }]);
    expect(decisiones()).toMatchObject([{ ticket: ID, reason: "changes-requested" }]);
  });

  it("C5 un ticket que pasó a planned sin autorización vigente produce «plan-approval»", () => {
    ticketCon("planned", [{ id: "EVENT-002", hacia: "planned" }]);
    expect(decisiones()).toMatchObject([{ ticket: ID, reason: "plan-approval" }]);
  });

  it("C6 un ticket en planned cubierto por una autorización vigente no produce el aviso", () => {
    ticketCon("planned", [{ id: "EVENT-002", hacia: "planned" }]);
    appendReceipt(paths(), ID, reciboDePlan());
    crearAutorizacionDeAprobacion({
      root,
      actor: "Juan Andrade",
      quote: "Autorizo aprobar solos los planes de bajo riesgo de pos",
      types: ["BUGFIX", "FEATURE"],
      modules: ["pos"],
      maxRisk: "normal",
      dailyQuota: 2,
      validDays: 30,
      source: "cli",
      ahora: AHORA,
      env: {},
    });
    expect(decisiones()).toEqual([]);
  });

  it("C7 un ticket en awaiting_user_tests no produce el aviso necesita-decision", () => {
    ticketCon("awaiting_user_tests", [{ id: "EVENT-002", hacia: "awaiting_user_tests" }]);
    expect(decisiones()).toEqual([]);
  });

  it("C8 un ticket en in_progress con una compuerta escalada no produce el aviso", () => {
    ticketCon("in_progress", [{ id: "EVENT-002", hacia: "in_progress" }]);
    const base = reciboDePlan();
    appendReceipt(paths(), ID, { ...base, escalatedTo: "human", humanDecision: null });
    expect(decisiones()).toEqual([]);
  });

  it("C9 un ticket en blocked sin evento de transición hacia blocked no produce el aviso", () => {
    ticketCon("blocked", []);
    expect(decisiones()).toEqual([]);
  });
});

describe("el texto del aviso", () => {
  const base = {
    ticketId: ID,
    title: "Un ticket de prueba",
    reason: "blocked" as const,
    entryEvent: "EVENT-002",
    ticketPath: `tickets/2026/${ID}/ticket.md`,
  };

  it("C10 el cuerpo nombra el id del ticket", () => {
    const aviso = renderDecisionNeededNotification({ ...base, screenUrl: URL_PANTALLA });
    expect(aviso.body).toContain(ID);
    expect(aviso.key).toBe(`decision-needed:${ID}:EVENT-002`);
  });

  it("C11 el cuerpo nombra el motivo en palabras del PO", () => {
    const motivos = {
      blocked: "bloqueado",
      "changes-requested": "cambios pedidos",
      "plan-approval": "plan por aprobar",
    } as const;
    for (const [reason, palabra] of Object.entries(motivos)) {
      const aviso = renderDecisionNeededNotification({
        ...base,
        reason: reason as keyof typeof motivos,
        screenUrl: URL_PANTALLA,
      });
      expect(aviso.body).toContain(palabra);
    }
  });

  it("C12 con screenUrl declarado, el cuerpo lleva el enlace <screenUrl>/#/ticket/<ID>", () => {
    const aviso = renderDecisionNeededNotification({
      ...base,
      screenUrl: `${URL_PANTALLA}/`,
    });
    expect(aviso.body).toContain(`${URL_PANTALLA}/#/ticket/${ID}`);
  });

  it("C13 sin screenUrl, el cuerpo dice «sin enlace» con la ruta del ticket", () => {
    const aviso = renderDecisionNeededNotification({ ...base, screenUrl: "" });
    expect(aviso.body).toContain("sin enlace");
    expect(aviso.body).toContain(base.ticketPath);
    expect(aviso.body).toContain("hermes.notify.screen-url");
  });
});

describe("la clave de configuración", () => {
  it("C14 readHermesConfig devuelve en screenUrl el valor de hermes.notify.screen-url", () => {
    const cfg = readHermesConfig(
      parseConfig(`hermes:\n  notify:\n    screen-url: ${URL_PANTALLA}\n`),
    );
    expect(cfg.screenUrl).toBe(URL_PANTALLA);
  });

  it("C15 sin la clave, screenUrl queda vacío", () => {
    const cfg = readHermesConfig(parseConfig("name: Demo\n"));
    expect(cfg.screenUrl ?? "").toBe("");
  });
});

describe("la entrega", () => {
  beforeEach(() => ticketCon("blocked", [{ id: "EVENT-002", hacia: "blocked" }]));

  it("C16 un envío que el transporte falso no entrega deja el aviso pendiente", () => {
    avisar({ runner: runnerCaido });
    expect(decisiones()).toHaveLength(1);
  });

  it("C17 una entrega anota en el diario una línea decision-needed-notice con ticket:evento", () => {
    avisar();
    const diario = readFileSync(join(root, ".valmen", "approvals.jsonl"), "utf8");
    expect(diario).toContain('"kind":"decision-needed-notice"');
    expect(decisionesAvisadas(paths()).has(`${ID}:EVENT-002`)).toBe(true);
  });

  it("C18 hermesNotifyPendientes con json cuenta el aviso entregado en notificados", () => {
    const r = avisar({ json: true });
    const salida = JSON.parse(r.stdout) as { notificados: string[] };
    expect(salida.notificados).toContain(`${ID} · necesita tu decisión (bloqueado)`);
  });
});
