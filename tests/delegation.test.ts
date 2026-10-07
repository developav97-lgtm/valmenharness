/**
 * El modo de delegación del PO.
 *
 * Lo que se afirma acá es lo que hace que se pueda confiar en un agente que decide
 * solo en nombre de una persona:
 *
 * 1. **La delegación es un registro con las palabras del PO**, y solo recibe líneas.
 * 2. **El orden lo dice el grafo**: un ticket no sale antes de lo que lo precede, y
 *    uno que espera al PO no frena a los que dependen de él.
 * 3. **Una REVIEW se aprueba solo con un motivo**, y el recibo guarda las palabras
 *    del PO. Un BLOCK nunca se aprueba. Un impacto de gate humano duro detiene la
 *    corrida aunque la compuerta diera REVIEW.
 * 4. **El cierre parte del HEAD vigente** y anota los archivos del punto.
 * 5. **Nada fuera del alcance**.
 */
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type DelegationDeps,
  REAL_GIT,
  advanceDelegated,
  closeDelegated,
  runDelegation,
} from "../packages/cli/src/delegation.js";
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
  delegationProgress,
  grantDelegation,
  hardGateStop,
  readDelegation,
  readReceipts,
  resolveDelegation,
  type RegistryPaths,
} from "../packages/engine/src/index.js";
import { materializeFeature } from "../packages/engine/src/materialize.js";
import { buildGateState } from "../packages/engine/src/state.js";
import { recordHumanDecision } from "../packages/server/src/gates.js";
import { renderFixtureTicket, writeFixtureTicket } from "./helpers/fixtures.js";

let lab: string;
const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });
const FEATURE = join(".valmen", "features", "kardex");
const A = "FEATURE-INVENTARIO-MODELO-20260924";
const B = "FEATURE-INVENTARIO-API-20260924";
const PALABRAS = "Corre la feature completa y decide tú según tu recomendación";

const GRAFO = [
  "feature: kardex",
  "sprints:",
  "  - id: S1",
  "    goal: Modelo y API",
  "    tickets:",
  // Declarados al revés a propósito: el orden sale de las dependencias.
  `      - id: ${B}`,
  "        title: API de consulta",
  "        depends_on:",
  `          - ${A}`,
  `      - id: ${A}`,
  "        title: Modelo de datos",
  "        depends_on: []",
  "coverage:",
  "  - requirement: R-INV-001",
  "    covered_by:",
  `      - ${A}`,
  `      - ${B}`,
  "gaps: []",
  "",
].join("\n");

function ponerEstado(id: string, estado: string): void {
  const ruta = join(lab, "tickets", "2026", id, "ticket.md");
  writeFileSync(
    ruta,
    readFileSync(ruta, "utf8").replace(/^workflow_status: .*$/m, `workflow_status: ${estado}`),
    "utf8",
  );
}

function recibo(ticket: string, gate: string, valor: number): GateReceipt {
  const proposiciones: Proposition[] = [
    { id: "cubre_todos_los_criterios", kind: "noul", instructions: "cubre", weight: 3 },
  ];
  const respuestas: PropositionAnswer[] = [
    { id: "cubre_todos_los_criterios", kind: "noul", value: valor },
  ];
  return buildReceipt({
    id: `GR-20261006-${ticket}-${gate}-${readReceipts(PATHS(), ticket).length + 1}`,
    gate,
    propositions: proposiciones,
    policy: DEFAULT_POLICY,
    subject: { type: "ticket", id: ticket, revision: "1" },
    decision: decide(proposiciones, respuestas, DEFAULT_POLICY),
    // El recibo congela el estado real del ticket: el motor compara ese hash al entregar.
    state: buildGateState(readFileSync(join(lab, "tickets", "2026", ticket, "ticket.md"), "utf8")),
    answers: respuestas,
    mechanicalChecks: [],
    model: null,
    usage: null,
    latencyMs: 1,
    decidedAt: new Date().toISOString(),
  });
}

/** Un evaluador falso: cada corrida de compuerta deja el recibo del valor dado. */
function deps(valores: Record<string, number>): DelegationDeps & { corridas: string[] } {
  const corridas: string[] = [];
  return {
    corridas,
    runGate: async (gate, ticket) => {
      corridas.push(`${ticket}:${gate}`);
      appendReceipt(PATHS(), ticket, recibo(ticket, gate, valores[gate] ?? 0.99));
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    decide: recordHumanDecision,
    ...REAL_GIT,
  };
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: lab, encoding: "utf8" }).trim();
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-deleg-"));
  mkdirSync(join(lab, FEATURE, "spec", "inventario"), { recursive: true });
  writeFileSync(
    join(lab, FEATURE, "feature.md"),
    [
      "---",
      "schema_version: 2",
      "id: kardex",
      "title: Kardex de inventario",
      "state: decomposed",
      "created: 2026-09-24",
      "updated: 2026-09-24",
      "---",
      "",
      "# Kardex de inventario",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(lab, FEATURE, "spec", "inventario", "spec.md"),
    "### Requirement: R-INV-001 — El sistema DEBE registrar cada movimiento\n\nEl kardex lista entradas y salidas.\n",
    "utf8",
  );
  writeFileSync(join(lab, FEATURE, "tickets.yaml"), GRAFO, "utf8");
  materializeFeature(PATHS(), "kardex");
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("registrar la delegación", () => {
  it("guarda el alcance y las palabras literales del PO en un archivo que solo recibe líneas", () => {
    const d = grantDelegation({ paths: PATHS(), feature: "kardex", quote: PALABRAS, actor: "Juan" });
    expect(d.id).toMatch(/^DEL-\d{8}-001$/);
    const leida = readDelegation(lab, d.id);
    expect(leida?.quote).toBe(PALABRAS);
    expect(leida?.scope).toEqual({ feature: "kardex", tickets: [] });
    expect(readFileSync(join(lab, ".valmen", "delegations", `${d.id}.jsonl`), "utf8").split("\n").filter(Boolean)).toHaveLength(1);
    // Una segunda delegación del mismo día no pisa la primera.
    expect(grantDelegation({ paths: PATHS(), feature: "kardex", quote: PALABRAS }).id).toMatch(/-002$/);
  });

  it("rechaza una delegación sin palabras del PO o con un alcance ambiguo", () => {
    expect(() => grantDelegation({ paths: PATHS(), feature: "kardex", quote: "  " })).toThrow(/palabras del PO/);
    expect(() => grantDelegation({ paths: PATHS(), quote: PALABRAS })).toThrow(/una de las dos/);
    expect(() =>
      grantDelegation({ paths: PATHS(), feature: "kardex", tickets: [A], quote: PALABRAS }),
    ).toThrow(/una de las dos/);
    expect(() => grantDelegation({ paths: PATHS(), tickets: ["FEATURE-NADA-X-20260924"], quote: PALABRAS })).toThrow(/no existe/);
  });
});

describe("qué ticket sigue", () => {
  it("sigue el orden de las dependencias aunque el grafo las declare al revés", () => {
    const d = grantDelegation({ paths: PATHS(), feature: "kardex", quote: PALABRAS });
    expect(delegationProgress(PATHS(), d).next?.id).toBe(A);
  });

  it("salta los cerrados y no vuelve sobre los que esperan al PO", () => {
    const d = grantDelegation({ paths: PATHS(), feature: "kardex", quote: PALABRAS });
    ponerEstado(A, "closed");
    expect(delegationProgress(PATHS(), d).next?.id).toBe(B);
    ponerEstado(B, "awaiting_user_tests");
    const p = delegationProgress(PATHS(), d);
    expect(p.next).toBeNull();
    expect(p.waitingPo).toEqual([B]);
    expect(p.done).toBe(true);
  });

  it("un ticket que espera al PO no frena a los que dependen de él", () => {
    const d = grantDelegation({ paths: PATHS(), feature: "kardex", quote: PALABRAS });
    ponerEstado(A, "awaiting_user_tests");
    expect(delegationProgress(PATHS(), d).next?.id).toBe(B);
  });

  it("una dependencia en otro estado se dice y detiene al dependiente", () => {
    const d = grantDelegation({ paths: PATHS(), feature: "kardex", quote: PALABRAS });
    ponerEstado(A, "blocked");
    const p = delegationProgress(PATHS(), d);
    expect(p.next).toBeNull();
    expect(p.stopped.map((s) => s.id)).toEqual([A, B]);
  });
});

/** El ticket A tal como lo deja el agente al terminar de escribir análisis y plan. */
function escribirA(estado: string, opciones: { impacts?: string[]; criterios?: string } = {}): void {
  const base = renderFixtureTicket({
    id: A,
    workflowStatus: estado,
    type: "FEATURE",
    module: "INVENTARIO",
    plan: [
      "- Gate de plan y aprobación: pendiente",
      "- Pasos ordenados:",
      "  1. Cambiar `BackEnd/pos/filters.py`.",
      "- Rollback: revertir.",
    ].join("\n"),
    ...(opciones.impacts === undefined ? {} : { impacts: opciones.impacts }),
    ...(opciones.criterios === undefined ? {} : { criterios: opciones.criterios }),
  });
  writeFileSync(join(lab, "tickets", "2026", A, "ticket.md"), base, "utf8");
}

function estadoDe(id: string): string {
  return /^workflow_status: (.*)$/m.exec(
    readFileSync(join(lab, "tickets", "2026", id, "ticket.md"), "utf8"),
  )?.[1] as string;
}

describe("compuertas por delegación", () => {
  async function avanzar(valores: Record<string, number>, reason?: string, id = A) {
    const d = resolveDelegation(lab, undefined);
    const dep = deps(valores);
    const r = await advanceDelegated(PATHS(), d, id, { reason }, dep);
    return { r, dep };
  }

  beforeEach(() => {
    grantDelegation({ paths: PATHS(), feature: "kardex", quote: PALABRAS, actor: "Juan" });
    escribirA("intake");
  });

  it("con las dos compuertas en APPROVE llega a in_progress y el plan cita la delegación", async () => {
    const { r } = await avanzar({});
    expect(r.exitCode).toBe(0);
    expect(estadoDe(A)).toBe("in_progress");
    const ticket = readFileSync(join(lab, "tickets", "2026", A, "ticket.md"), "utf8");
    expect(ticket).toContain("aprobado explícitamente por el PO");
    expect(ticket).toMatch(/delegación DEL-\d{8}-001/);
    expect(ticket).toContain(PALABRAS);
    // Y la aprobación queda **registrada** (R-CTRL-001): evento con la fuente `delegacion` y
    // las palabras del PO, que es lo que el motor exige para entrar a `approved`.
    const aprobacion = /"action": "plan-approved"[\s\S]*?"details": "((?:[^"\\]|\\.)*)"/.exec(ticket)?.[1] ?? "";
    expect(aprobacion).toContain("delegacion");
    expect(aprobacion).toContain("Corre la feature completa");
  });

  it("una REVIEW sin motivo detiene la corrida y no decide nada", async () => {
    const { r } = await avanzar({ analysis: 0.72 });
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("--reason");
    expect(estadoDe(A)).toBe("analyzed");
    const recibos = readReceipts(PATHS(), A);
    expect(recibos.every((x) => x.humanDecision === null)).toBe(true);
  });

  it("una REVIEW con motivo se aprueba y el recibo guarda el motivo y las palabras del PO", async () => {
    const { r } = await avanzar({ analysis: 0.72 }, "el criterio faltante es de otro ticket");
    expect(r.exitCode).toBe(0);
    const decidido = readReceipts(PATHS(), A).find((x) => x.humanDecision !== null);
    expect(decidido?.humanDecision?.actor).toBe("Claude Code por delegación del PO");
    expect(decidido?.humanDecision?.reason).toContain("el criterio faltante es de otro ticket");
    expect(decidido?.humanDecision?.reason).toContain(PALABRAS);
    expect(decidido?.humanDecision?.decision).toBe("approve");
  });

  it("un BLOCK nunca se aprueba, ni con motivo", async () => {
    const { r } = await avanzar({ plan: 0.02 }, "ya está bien");
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("BLOCK");
    expect(estadoDe(A)).toBe("planned");
    expect(readReceipts(PATHS(), A).every((x) => x.humanDecision === null)).toBe(true);
  });

  it("un impacto de gate humano duro detiene la corrida antes de correr compuerta alguna", async () => {
    escribirA("intake", { impacts: ["migration_impact"] });
    expect(hardGateStop(readFileSync(join(lab, "tickets", "2026", A, "ticket.md"), "utf8"))).toContain("migration_impact");
    const { r, dep } = await avanzar({ analysis: 0.72 }, "motivo cualquiera");
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("gate humano duro");
    expect(dep.corridas).toEqual([]);
    expect(estadoDe(A)).toBe("intake");
  });

  it("rechaza un ticket fuera del alcance en todos los comandos", async () => {
    writeFixtureTicket(lab, { id: "FEATURE-OTRO-COSA-20260924", workflowStatus: "intake", type: "FEATURE", module: "OTRO" });
    const dep = deps({});
    for (const sub of ["advance", "close"]) {
      const r = await runDelegation(PATHS(), [sub], { id: "FEATURE-OTRO-COSA-20260924" }, dep);
      expect(r.exitCode).toBe(3);
      expect(r.stderr).toContain("fuera del alcance");
    }
    expect(dep.corridas).toEqual([]);
  });
});

describe("cierre delegado", () => {
  const CIERRE = {
    environment: "local",
    tests: "npx vitest run: 12 de 12 en verde",
    testsPassed: true,
    technicalSummary: "Se agregó el modelo.",
    functionalSummary: "El kardex registra movimientos.",
    releaseImpact: "unreleased: sin migración.",
    visual: false,
    poConfirmation: undefined,
    usageSource: undefined,
    confidence: undefined,
    model: undefined,
    notes: undefined,
  } as const;

  function ticketEnProgreso(criterios: string): void {
    const base = renderFixtureTicket({
      id: A,
      workflowStatus: "in_progress",
      type: "FEATURE",
      module: "INVENTARIO",
      criterios,
    })
      .replace("## Implementación\n\nPendiente.", "## Implementación\n\nSe agregó `src/a.ts` con el modelo del kardex.")
      .replace(
        "## Pruebas\n\nPendiente de ejecución.",
        "## Pruebas\n\nComando: `npx vitest run` en la raíz; resultado esperado: todo en verde.",
      );
    writeFileSync(join(lab, "tickets", "2026", A, "ticket.md"), base, "utf8");
  }

  beforeEach(() => {
    grantDelegation({ paths: PATHS(), feature: "kardex", quote: PALABRAS, actor: "Juan" });
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "T");
    mkdirSync(join(lab, "src"), { recursive: true });
    writeFileSync(join(lab, "src", "a.ts"), "export const a = 1;\n");
    git("add", "src/a.ts");
    git("commit", "-q", "-m", "implementación");
    ticketEnProgreso("- [ ] El modelo registra movimientos\n      <!-- test: npx vitest run -->");
  });

  it("anota el punto con --files, arranca el QA con el HEAD vigente y cierra el ticket", async () => {
    // Los archivos del punto cambian DESPUÉS del commit de la implementación: es la
    // fricción de la corrida real. El QA tiene que anclarse al HEAD de ahora.
    writeFileSync(join(lab, "src", "a.ts"), "export const a = 2;\n");
    git("add", "src/a.ts");
    git("commit", "-q", "-m", "corrección posterior");
    const head = git("rev-parse", "HEAD");

    const r = await closeDelegated(PATHS(), resolveDelegation(lab, undefined), A, { ...CIERRE, files: ["src/a.ts"] }, deps({}));
    expect(r.exitCode, r.stderr).toBe(0);
    expect(estadoDe(A)).toBe("closed");

    const ticket = readFileSync(join(lab, "tickets", "2026", A, "ticket.md"), "utf8");
    expect(ticket).toContain('"src/a.ts"');
    expect(ticket).toContain(`commit:${head}`);
    expect(ticket).toContain("- [x] El modelo registra movimientos");
    expect(ticket).toContain(PALABRAS);
    expect(ticket).toContain("manual:sesión de Claude Code por delegación");
  });

  it("detiene el cierre si hay cambios sin commitear en los archivos del punto", async () => {
    writeFileSync(join(lab, "src", "a.ts"), "export const a = 3;\n");
    const r = await closeDelegated(PATHS(), resolveDelegation(lab, undefined), A, { ...CIERRE, files: ["src/a.ts"] }, deps({}));
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("sin commitear");
    expect(estadoDe(A)).toBe("in_progress");
  });

  it("sin --tests-passed no cierra nada", async () => {
    const r = await closeDelegated(PATHS(), resolveDelegation(lab, undefined), A, { ...CIERRE, testsPassed: false, files: ["src/a.ts"] }, deps({}));
    expect(r.exitCode).toBe(2);
    expect(estadoDe(A)).toBe("in_progress");
  });

  it("un ticket visual queda en awaiting_user_tests y no se cierra", async () => {
    const r = await closeDelegated(PATHS(), resolveDelegation(lab, undefined), A, { ...CIERRE, visual: true, files: ["src/a.ts"] }, deps({}));
    expect(r.exitCode, r.stderr).toBe(0);
    expect(estadoDe(A)).toBe("awaiting_user_tests");
    expect(r.stdout).toContain("awaiting_user_tests");
  });

  it("un criterio manual del PO sin marcar deja el ticket esperándolo", async () => {
    ticketEnProgreso(
      "- [ ] El modelo registra movimientos\n      <!-- test: npx vitest run -->\n- [ ] La pantalla se ve como el prototipo\n      <!-- verify: manual -->",
    );
    const r = await closeDelegated(PATHS(), resolveDelegation(lab, undefined), A, { ...CIERRE, files: ["src/a.ts"] }, deps({}));
    expect(r.exitCode, r.stderr).toBe(0);
    expect(estadoDe(A)).toBe("awaiting_user_tests");
    expect(r.stdout).toContain("La pantalla se ve como el prototipo");

    // Cuando el PO confirma con sus palabras, el criterio manual se marca y el ticket cierra
    // (R-CTRL-004); el agente no lo marcó antes.
    expect(readFileSync(join(lab, "tickets", "2026", A, "ticket.md"), "utf8")).toContain(
      "- [ ] La pantalla se ve como el prototipo",
    );
    const palabrasPo = "«Lo vi y es igual al prototipo» — Juan, 2026-10-06";
    const cierre = await closeDelegated(
      PATHS(),
      resolveDelegation(lab, undefined),
      A,
      { ...CIERRE, files: ["src/a.ts"], poConfirmation: palabrasPo },
      deps({}),
    );
    expect(cierre.exitCode, cierre.stderr).toBe(0);
    expect(estadoDe(A)).toBe("closed");
    const ticket = readFileSync(join(lab, "tickets", "2026", A, "ticket.md"), "utf8");
    expect(ticket).toContain("- [x] La pantalla se ve como el prototipo");
    expect(ticket).toContain(palabrasPo);
  });

  it("desde awaiting_user_tests exige las palabras literales del PO y cierra con el HEAD", async () => {
    await closeDelegated(PATHS(), resolveDelegation(lab, undefined), A, { ...CIERRE, visual: true, files: ["src/a.ts"] }, deps({}));
    const sin = await closeDelegated(PATHS(), resolveDelegation(lab, undefined), A, { ...CIERRE, files: ["src/a.ts"] }, deps({}));
    expect(sin.exitCode).toBe(2);
    expect(sin.stderr).toContain("--po-confirmation");

    // Siguen llegando correcciones tras awaiting_user_tests: el HEAD cambia.
    writeFileSync(join(lab, "src", "a.ts"), "export const a = 4;\n");
    git("add", "src/a.ts");
    git("commit", "-q", "-m", "correcciones del PO");
    const head = git("rev-parse", "HEAD");

    const palabrasPo = "«si confirmo» — Juan, 2026-10-06";
    const r = await closeDelegated(PATHS(), resolveDelegation(lab, undefined), A, { ...CIERRE, files: ["src/a.ts"], poConfirmation: palabrasPo }, deps({}));
    expect(r.exitCode, r.stderr).toBe(0);
    expect(estadoDe(A)).toBe("closed");
    const ticket = readFileSync(join(lab, "tickets", "2026", A, "ticket.md"), "utf8");
    expect(ticket).toContain(palabrasPo);
    expect(ticket).toContain(`commit:${head}`);
  });
});
