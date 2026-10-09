/**
 * Los atajos `valmen approve` y `valmen close`.
 *
 * Lo que estas pruebas fijan: la frase literal del PO es obligatoria y viaja al ticket tal cual;
 * un BLOCK y un ticket SECURITY no se deciden por el atajo; una REVIEW solo con motivo; y una
 * parada dice el paso y el estado, y al repetir el comando se retoma sin duplicar nada.
 * Todo corre sobre una raíz temporal, con la compuerta y el HEAD inyectados: sin red ni git.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { approveCommand, closeCommand } from "../packages/cli/src/ceremony.js";
import {
  DEFAULT_POLICY,
  buildReceipt,
  decide,
  type GateReceipt,
  type Proposition,
  type PropositionAnswer,
} from "../packages/gate/src/index.js";
import { appendReceipt, readReceipts, type RegistryPaths } from "../packages/engine/src/index.js";
import { buildGateState } from "../packages/engine/src/state.js";
import { recordHumanDecision } from "../packages/server/src/gates.js";
import { renderFixtureTicket } from "./helpers/fixtures.js";

const ID = "IMPROVEMENT-CLI-ATAJO-20261009";
const FRASE = "Apruebo el plan tal como está";
const PALABRAS_PO = "«Lo probé en la terminal y funciona» — Juan, 2026-10-09";
const AHORA = "2026-10-09T12:00:00.000Z";

let lab: string;
const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });
const RUTA = (): string => join(lab, "tickets", "2026", ID, "ticket.md");
const leerTicket = (): string => readFileSync(RUTA(), "utf8");
const estadoDe = (): string => /^workflow_status: (.*)$/m.exec(leerTicket())?.[1] as string;

function recibo(gate: string, valor: number): GateReceipt {
  const proposiciones: Proposition[] = [
    { id: "cubre_todos_los_criterios", kind: "noul", instructions: "cubre", weight: 3 },
  ];
  const respuestas: PropositionAnswer[] = [{ id: "cubre_todos_los_criterios", kind: "noul", value: valor }];
  return buildReceipt({
    id: `GR-20261009-${ID}-${gate}-${readReceipts(PATHS(), ID).length + 1}`,
    gate,
    propositions: proposiciones,
    policy: DEFAULT_POLICY,
    subject: { type: "ticket", id: ID, revision: "1" },
    decision: decide(proposiciones, respuestas, DEFAULT_POLICY),
    state: buildGateState(leerTicket()),
    answers: respuestas,
    mechanicalChecks: [],
    model: null,
    usage: null,
    latencyMs: 1,
    decidedAt: AHORA,
  });
}

/** Un evaluador falso: cada corrida deja el recibo del valor dado. */
function deps(valor = 0.99): {
  runGate: (g: string, t: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  decide: typeof recordHumanDecision;
  corridas: string[];
} {
  const corridas: string[] = [];
  return {
    corridas,
    runGate: async (gate, ticket) => {
      corridas.push(`${ticket}:${gate}`);
      appendReceipt(PATHS(), ticket, recibo(gate, valor));
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    decide: recordHumanDecision,
  };
}

const PLAN = [
  "- Gate de plan y aprobación: pendiente",
  "- Pasos ordenados:",
  "  1. Cambiar `BackEnd/pos/filters.py`.",
  "- Rollback: revertir.",
].join("\n");

function escribir(estado: string, extra: { type?: string; criterios?: string } = {}): void {
  const base = renderFixtureTicket({
    id: ID,
    workflowStatus: estado,
    type: extra.type ?? "IMPROVEMENT",
    module: "CLI",
    plan: estado === "planned" ? PLAN : PLAN.replace("pendiente", "**aprobado explícitamente por el PO** (gate de plan)"),
    aprobacionRegistrada: estado !== "planned",
    ...(estado === "awaiting_user_tests" || estado === "in_qa" ? { qaStatus: "pending" } : {}),
    ...(extra.criterios === undefined ? {} : { criterios: extra.criterios }),
  })
    .replace("## Implementación\n\nPendiente.", "## Implementación\n\nSe agregó `src/a.ts` con el atajo.")
    .replace("## Pruebas\n\nPendiente de ejecución.", "## Pruebas\n\nComando: `npx vitest run` en la raíz; resultado esperado: todo en verde.");
  writeFileSync(RUTA(), base, "utf8");
}

const A_MANO = "- [x] El atajo escribe la línea del plan\n      <!-- test: npx vitest run -->";

const CIERRE = {
  id: ID,
  "po-confirmation": PALABRAS_PO,
  environment: "local",
  tests: "npx vitest run: 12 de 12 en verde",
  "technical-summary": "Se agregó el atajo.",
  "functional-summary": "El PO cierra en un paso.",
  "release-impact": "unreleased: sin migración.",
  files: "src/a.ts",
  source: "manual:sesión de Claude Code",
} as const;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-ceremonia-"));
  mkdirSync(join(lab, "tickets", "2026", ID), { recursive: true });
  // La referencia `worktree` de la evidencia resume los archivos del punto: tienen que existir.
  mkdirSync(join(lab, "src"), { recursive: true });
  writeFileSync(join(lab, "src", "a.ts"), "export const a = 1;\n", "utf8");
  // …y estar versionados: el motor lo comprueba con git. El repositorio es el de la raíz temporal.
  for (const args of [["init", "-q"], ["config", "user.email", "t@example.com"], ["config", "user.name", "T"], ["add", "src/a.ts"], ["commit", "-q", "-m", "a"]]) {
    execFileSync("git", args, { cwd: lab });
  }
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("valmen approve", () => {
  const FLAGS = { id: ID, actor: "Juan", quote: FRASE } as const;

  beforeEach(() => escribir("planned"));

  it("C1: sin --quote sale con error y no escribe el ticket", async () => {
    const antes = leerTicket();
    const d = deps();
    const r = await approveCommand(PATHS(), { id: ID, actor: "Juan" }, d);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("--quote");
    expect(leerTicket()).toBe(antes);
    expect(d.corridas).toEqual([]);
  });

  it("C2, C3 y C4: con la compuerta en APPROVE deja approved, el evento con la frase y la línea del plan", async () => {
    const r = await approveCommand(PATHS(), FLAGS, deps());
    expect(r.exitCode, r.stderr).toBe(0);
    expect(estadoDe()).toBe("approved");
    const ticket = leerTicket();
    const evento = /"action": "plan-approved"[\s\S]*?"details": "((?:[^"\\]|\\.)*)"/.exec(ticket)?.[1] ?? "";
    expect(evento).toContain(FRASE);
    expect(evento).toContain("cli");
    expect(ticket).toMatch(/- Gate de plan y aprobación: \*\*aprobado explícitamente por el PO\*\*.*Apruebo el plan tal como está/);
  });

  it("C5: una REVIEW sin --reason se detiene en planned y no decide nada", async () => {
    const r = await approveCommand(PATHS(), FLAGS, deps(0.72));
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("--reason");
    expect(estadoDe()).toBe("planned");
    expect(readReceipts(PATHS(), ID).every((x) => x.humanDecision === null)).toBe(true);
  });

  it("C6: una REVIEW con --reason registra la decisión humana en el recibo, con el motivo y la frase", async () => {
    const r = await approveCommand(PATHS(), { ...FLAGS, reason: "el criterio faltante es de otro ticket" }, deps(0.72));
    expect(r.exitCode, r.stderr).toBe(0);
    expect(estadoDe()).toBe("approved");
    const decidido = readReceipts(PATHS(), ID).find((x) => x.humanDecision !== null);
    expect(decidido?.humanDecision?.decision).toBe("approve");
    expect(decidido?.humanDecision?.actor).toBe("Juan");
    expect(decidido?.humanDecision?.reason).toContain("el criterio faltante es de otro ticket");
    expect(decidido?.humanDecision?.reason).toContain(FRASE);
  });

  it("C7: un BLOCK se detiene en planned y nombra el recibo, ni con --reason", async () => {
    const r = await approveCommand(PATHS(), { ...FLAGS, reason: "ya está bien" }, deps(0.02));
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("BLOCK");
    expect(r.stderr).toContain("plan");
    expect(estadoDe()).toBe("planned");
    expect(readReceipts(PATHS(), ID).every((x) => x.humanDecision === null)).toBe(true);
  });

  it("C8: rechaza un ticket SECURITY sin escribirlo ni correr la compuerta", async () => {
    escribir("planned", { type: "SECURITY" });
    const antes = leerTicket();
    const d = deps();
    const r = await approveCommand(PATHS(), FLAGS, d);
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("seguridad");
    expect(leerTicket()).toBe(antes);
    expect(d.corridas).toEqual([]);
  });

  it("C19 y C20: la parada nombra el paso que falló y el estado en que quedó", async () => {
    const r = await approveCommand(PATHS(), FLAGS, deps(0.02));
    expect(r.stderr).toMatch(/paso «compuerta plan»/);
    expect(r.stderr).toContain("quedó en planned");
  });

  it("repetido con --reason tras la parada por REVIEW retoma y aprueba", async () => {
    const d = deps(0.72);
    await approveCommand(PATHS(), FLAGS, d); // REVIEW sin motivo: se detiene
    const e = deps(0.72);
    const r = await approveCommand(PATHS(), { ...FLAGS, reason: "motivo" }, e);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(estadoDe()).toBe("approved");
  });
});

describe("valmen close", () => {
  // El commit lo resuelve el motor contra el repositorio de la raíz temporal: es su HEAD real.
  const HEAD = (): string => execFileSync("git", ["rev-parse", "HEAD"], { cwd: lab, encoding: "utf8" }).trim();
  const head = { head: () => HEAD() };

  beforeEach(() => escribir("awaiting_user_tests", { criterios: A_MANO }));

  it("C9: sin --po-confirmation sale con error y no escribe el ticket", () => {
    const antes = leerTicket();
    const { "po-confirmation": _omitida, ...sin } = CIERRE;
    void _omitida;
    const r = closeCommand(PATHS(), sin, head);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("--po-confirmation");
    expect(leerTicket()).toBe(antes);
  });

  it("C10, C11, C12 y C13: cierra desde awaiting_user_tests con la frase, los archivos y el HEAD", () => {
    const r = closeCommand(PATHS(), CIERRE, head);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(estadoDe()).toBe("closed");
    const ticket = leerTicket();
    expect(ticket).toContain(`- Resultado del PO: ${PALABRAS_PO}.`);
    expect(ticket).toContain('"src/a.ts"');
    expect(ticket).toContain(`commit:${HEAD()}`);
    expect(ticket).toContain("manual:sesión de Claude Code");
  });

  it("marca el criterio manual del PO con sus palabras antes de cerrar", () => {
    escribir("awaiting_user_tests", {
      criterios: `${A_MANO}\n- [ ] La salida se lee bien en la terminal\n      <!-- verify: manual -->`,
    });
    const r = closeCommand(PATHS(), CIERRE, head);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(leerTicket()).toContain("- [x] La salida se lee bien en la terminal");
    expect(estadoDe()).toBe("closed");
  });

  it("C14 y C15: un criterio sin marcar ni «no aplica» deja el ticket fuera de closed y lo cita", () => {
    escribir("awaiting_user_tests", {
      criterios: `${A_MANO}\n- [ ] El atajo cubre el caso que nadie probó\n      <!-- test: npx vitest run -->`,
    });
    const r = closeCommand(PATHS(), CIERRE, head);
    expect(r.exitCode).toBe(3);
    expect(estadoDe()).toBe("awaiting_user_tests");
    expect(r.stderr).toContain("El atajo cubre el caso que nadie probó");
    expect(leerTicket()).not.toContain("- Resultado del PO:");
  });

  it("C16: sin --source y sin consumo registrado se detiene antes de closed sin escribir", () => {
    const antes = leerTicket();
    const { source: _omitida, ...sin } = CIERRE;
    void _omitida;
    const r = closeCommand(PATHS(), sin, head);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("--source");
    expect(estadoDe()).not.toBe("closed");
    expect(leerTicket()).toBe(antes);
  });

  it("C17: desde in_progress sale con error sin escribir el ticket", () => {
    escribir("in_progress", { criterios: A_MANO });
    const antes = leerTicket();
    const r = closeCommand(PATHS(), CIERRE, head);
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("in_progress");
    expect(leerTicket()).toBe(antes);
  });

  it("C18, C19 y C20: repetido tras una parada retoma desde el estado en que quedó, sin duplicar", () => {
    const falla = closeCommand(PATHS(), CIERRE, {
      head: () => {
        throw new Error("git no responde");
      },
    });
    expect(falla.exitCode).toBe(3);
    expect(falla.stderr).toMatch(/paso «inicio del ciclo de QA»/);
    expect(falla.stderr).toContain("git no responde");
    expect(falla.stderr).toContain("quedó en in_qa");
    expect(estadoDe()).toBe("in_qa");

    const r = closeCommand(PATHS(), CIERRE, head);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(estadoDe()).toBe("closed");
    const ticket = leerTicket();
    expect(ticket.match(/Resultado del PO:/g)).toHaveLength(1);
    expect(ticket.match(/"id": "POINT-001"/g)).toHaveLength(1);
  });
});
