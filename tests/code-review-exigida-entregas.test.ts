/**
 * Quienes entregan con la revisión exigida (R-REV-004 y R-REV-005, FEATURE-GATE-CODE-REVIEW-EXIGENCIA):
 * la jornada autónoma y la corrida delegada corren `code-review` antes de entregar y ninguna aprueba
 * un `review` por su cuenta. Los laboratorios son repositorios git temporales; el revisor de la
 * jornada es falso (`reviewDiff`) y los recibos de la delegación los deja un evaluador falso.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolverCompuerta } from "../packages/cli/src/ceremony.js";
import {
  type DelegationDeps,
  REAL_GIT,
  closeDelegated,
} from "../packages/cli/src/delegation.js";
import { parseTicket } from "../packages/core/src/index.js";
import { calcularArbolProbado } from "../packages/engine/src/arbol-probado.js";
import { runAutonomous } from "../packages/engine/src/autonomous-run.js";
import {
  appendReceipt,
  grantDelegation,
  readReceipts,
  resolveDelegation,
  type RegistryPaths,
} from "../packages/engine/src/index.js";
import { materializeFeature } from "../packages/engine/src/materialize.js";
import { buildGateState } from "../packages/engine/src/state.js";
import {
  DEFAULT_POLICY,
  buildReceipt,
  decide,
  type GateReceipt,
  type Proposition,
  type PropositionAnswer,
} from "../packages/gate/src/index.js";
import type {
  ReviewDiffEvaluation,
  ReviewDiffOptions,
} from "../packages/gate-llm-judge/src/index.js";
import { recordHumanDecision } from "../packages/server/src/gates.js";
import { renderFixtureTicket, writeFixtureTicket } from "./helpers/fixtures.js";

const CLAVE = "code-review: exigida\n";
let lab: string;
const PATHS = (): RegistryPaths => ({ root: lab, ticketsDir: "tickets" });

function git(...argumentos: string[]): string {
  const r = spawnSync(
    "git",
    [
      "-c",
      "user.email=prueba@valmen.local",
      "-c",
      "user.name=Prueba Valmen",
      "-c",
      "commit.gpgsign=false",
      ...argumentos,
    ],
    { cwd: lab, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`git ${argumentos.join(" ")} falló: ${r.stderr}`);
  return r.stdout.trim();
}

function escribir(ruta: string, contenido: string): void {
  mkdirSync(dirname(join(lab, ruta)), { recursive: true });
  writeFileSync(join(lab, ruta), contenido);
}

const estadoDe = (id: string): string =>
  parseTicket(readFileSync(join(lab, "tickets", "2026", id, "ticket.md"), "utf8")).fields
    .workflow_status as string;

const compuertasCorridas = (id: string): string[] =>
  [...new Set(readReceipts(PATHS(), id).map((r) => r.gate))].sort();

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-exigida-entregas-"));
});
afterEach(() => rmSync(lab, { recursive: true, force: true }));

// ── La jornada autónoma (C17, C18) ──────────────────────────────────────────────────────────

const JORNADA_ID = "BUGFIX-POS-EXIGIDA-20261010";
const PASA = 'node -e "process.exit(0)"';

function armarJornada(clave: boolean): void {
  git("init", "-q", "-b", "main");
  escribir(
    ".valmen/config.yaml",
    [
      "name: Laboratorio",
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
      "      - BUGFIX",
      "    max-risk: normal",
      "    require:",
      "      - plan-approved",
      "      - tests-declared",
      "      - no-critical-impacts",
      "    excluded-modules:",
      "      - auth",
      "  limits:",
      "    max-concurrent: 1",
      "    collision-policy: serialize",
      "    max-per-day: 1",
      "    budget-per-ticket: 1",
      "    stop-on:",
      "      - test-failure",
      "",
    ].join("\n") + (clave ? CLAVE : ""),
  );
  escribir(
    "src/app.ts",
    Array.from({ length: 60 }, (_, i) => `export const f${i + 1} = () => ${i + 1};`).join(
      "\n",
    ) + "\n",
  );
  writeFixtureTicket(lab, {
    id: JORNADA_ID,
    workflowStatus: "approved",
    criterios: `- [ ] El filtro devuelve una coincidencia.\n      <!-- test: ${PASA} -->`,
    pruebas: `Contrato de entrega: ejecutar \`${PASA}\` desde la raíz; esperado: código de salida 0.`,
  });
  git("add", "-A");
  git("commit", "-qm", "base");
  git("checkout", "-q", "-b", "trabajo");
}

function revisor(cumple: boolean) {
  const llamadas: string[] = [];
  const reviewDiff = async (options: ReviewDiffOptions): Promise<ReviewDiffEvaluation> => {
    llamadas.push(options.entrada);
    return {
      respuestas: options.proposiciones.map((p) => ({
        proposicion: p.id,
        cumple: cumple || p.id !== "sin_hallazgo_severo",
        confianza: 0.95,
        motivo: "Sin hallazgo severo.",
        hallazgos:
          cumple || p.id !== "sin_hallazgo_severo"
            ? []
            : [
                {
                  ruta: "src/app.ts",
                  linea: 50,
                  motivo: "El cambio rompe a su consumidor.",
                },
              ],
      })),
      model: { provider: "revisor-falso", model: "falso-1", resolvedVersion: "falso-1" },
      usage: { inputTokens: 1000, outputTokens: 100, costUsd: 0.01 },
      latencyMs: 7,
    };
  };
  return { llamadas, reviewDiff };
}

interface CasoDeJornada {
  readonly criterio: string;
  readonly clave: boolean;
  readonly cumple: boolean;
  readonly estado: "awaiting_user_tests" | "in_progress";
  readonly parada: "verification-failed" | null;
  readonly revisores: "con-llamadas" | "sin-llamadas";
  readonly gates: readonly string[];
}

const JORNADA: readonly CasoDeJornada[] = [
  {
    criterio: "C17: con la revisión exigida corre code-review antes de entregar",
    clave: true,
    cumple: true,
    estado: "awaiting_user_tests",
    parada: null,
    revisores: "con-llamadas",
    gates: ["code-review", "qa-mechanical"],
  },
  {
    criterio:
      "C18: un code-review que no aprueba detiene con verification-failed sin entregar",
    clave: true,
    cumple: false,
    estado: "in_progress",
    parada: "verification-failed",
    revisores: "con-llamadas",
    gates: ["code-review", "qa-mechanical"],
  },
  {
    criterio: "regresión: sin la clave la jornada entrega sin correr code-review",
    clave: false,
    cumple: true,
    estado: "awaiting_user_tests",
    parada: null,
    revisores: "sin-llamadas",
    gates: ["qa-mechanical"],
  },
];

describe("la jornada autónoma con la revisión exigida", () => {
  it.each(JORNADA)(
    "$criterio",
    async ({ clave, cumple, estado, parada, revisores, gates }) => {
      armarJornada(clave);
      const { llamadas, reviewDiff } = revisor(cumple);

      const resultado = await runAutonomous({
        paths: PATHS(),
        ticketId: JORNADA_ID,
        reviewDiff,
        execute: () => {
          escribir(
            "src/app.ts",
            readFileSync(join(lab, "src/app.ts"), "utf8") + "export const nuevo = 1;\n",
          );
          return { status: 0, stdout: "hecho", stderr: "" };
        },
      });

      expect(estadoDe(JORNADA_ID)).toBe(estado);
      expect(resultado.stop?.reason ?? null).toBe(parada);
      expect(resultado.status).toBe(parada === null ? "delivered" : "stopped");
      expect(llamadas.length > 0).toBe(revisores === "con-llamadas");
      expect(compuertasCorridas(JORNADA_ID)).toEqual(gates);
    },
  );
});

// ── La corrida delegada (C19, C20) ──────────────────────────────────────────────────────────

const A = "FEATURE-INVENTARIO-MODELO-20261010";
const FEATURE = join(".valmen", "features", "kardex");
const PALABRAS = "Corre la feature completa y decide tú según tu recomendación";
const CIERRE = {
  environment: "local",
  tests: "npx vitest run: 12 de 12 en verde",
  testsPassed: true,
  technicalSummary: "Se agregó el modelo.",
  functionalSummary: "El kardex registra movimientos.",
  releaseImpact: "unreleased: sin migración.",
  visual: true,
  poConfirmation: undefined,
  usageSource: undefined,
  confidence: undefined,
  model: undefined,
  notes: undefined,
  files: ["src/a.ts"],
} as const;

function armarDelegacion(clave: boolean): void {
  escribir(
    join(FEATURE, "feature.md"),
    "---\nschema_version: 2\nid: kardex\ntitle: Kardex\nstate: decomposed\ncreated: 2026-10-10\nupdated: 2026-10-10\n---\n\n# Kardex\n",
  );
  escribir(
    join(FEATURE, "spec", "inventario", "spec.md"),
    "### Requirement: R-INV-001 — El sistema DEBE registrar cada movimiento\n\nEl kardex lista entradas y salidas.\n",
  );
  escribir(
    join(FEATURE, "tickets.yaml"),
    `feature: kardex\nsprints:\n  - id: S1\n    goal: Modelo\n    tickets:\n      - id: ${A}\n        title: Modelo de datos\n        depends_on: []\ncoverage:\n  - requirement: R-INV-001\n    covered_by:\n      - ${A}\ngaps: []\n`,
  );
  if (clave) escribir(".valmen/config.yaml", `name: Laboratorio\n${CLAVE}`);
  materializeFeature(PATHS(), "kardex");
  grantDelegation({ paths: PATHS(), feature: "kardex", quote: PALABRAS, actor: "Juan" });
  git("init", "-q", "-b", "main");
  escribir("src/a.ts", "export const a = 1;\n");
  git("add", "src/a.ts");
  git("commit", "-qm", "implementación");
  const base = renderFixtureTicket({
    id: A,
    workflowStatus: "in_progress",
    type: "FEATURE",
    module: "INVENTARIO",
    criterios: "- [ ] El modelo registra movimientos\n      <!-- test: npx vitest run -->",
  })
    .replace(
      "## Implementación\n\nPendiente.",
      "## Implementación\n\nSe agregó `src/a.ts`.",
    )
    .replace(
      "## Pruebas\n\nPendiente de ejecución.",
      "## Pruebas\n\nComando: `npx vitest run` en la raíz; resultado esperado: todo en verde.",
    );
  writeFileSync(join(lab, "tickets", "2026", A, "ticket.md"), base, "utf8");
}

/** Un recibo como lo deja una compuerta de verdad: con el estado del ticket y el árbol que probó. */
function recibo(ticket: string, gate: string, valor: number): GateReceipt {
  const proposiciones: Proposition[] = [
    { id: "cubre_todos_los_criterios", kind: "noul", instructions: "cubre", weight: 3 },
  ];
  const respuestas: PropositionAnswer[] = [
    { id: "cubre_todos_los_criterios", kind: "noul", value: valor },
  ];
  const arbol = calcularArbolProbado(PATHS());
  return buildReceipt({
    id: `GR-20261010-${ticket}-${gate}-${readReceipts(PATHS(), ticket).length + 1}`,
    gate,
    propositions: proposiciones,
    policy: DEFAULT_POLICY,
    subject: { type: "ticket", id: ticket, revision: "1" },
    decision: decide(proposiciones, respuestas, DEFAULT_POLICY),
    state: buildGateState(
      readFileSync(join(lab, "tickets", "2026", ticket, "ticket.md"), "utf8"),
    ),
    answers: respuestas,
    mechanicalChecks: [],
    model: null,
    usage: null,
    latencyMs: 1,
    decidedAt: new Date().toISOString(),
    ...(arbol === null ? {} : { testedTree: arbol.registro }),
  });
}

/** Un evaluador falso: cada compuerta deja el recibo del valor dado y se anota en `corridas`. */
function dependencias(
  valores: Record<string, number>,
): DelegationDeps & { corridas: string[] } {
  const corridas: string[] = [];
  return {
    corridas,
    runGate: async (gate, ticket) => {
      corridas.push(gate);
      appendReceipt(PATHS(), ticket, recibo(ticket, gate, valores[gate] ?? 0.99));
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    decide: recordHumanDecision,
    ...REAL_GIT,
  };
}

interface CasoDeDelegacion {
  readonly criterio: string;
  readonly clave: boolean;
  readonly valores: Record<string, number>;
  readonly corridas: readonly string[];
  readonly exitCode: number;
  readonly estado: string;
}

const DELEGACION: readonly CasoDeDelegacion[] = [
  {
    criterio: "C19: con la revisión exigida corre code-review antes de entregar",
    clave: true,
    valores: {},
    corridas: ["qa-mechanical", "code-review"],
    exitCode: 0,
    estado: "awaiting_user_tests",
  },
  {
    criterio: "C19: un code-review en REVIEW detiene la entrega, la decide una persona",
    clave: true,
    valores: { "code-review": 0.5 },
    corridas: ["qa-mechanical", "code-review"],
    exitCode: 3,
    estado: "in_progress",
  },
  {
    criterio: "regresión: sin la clave la entrega delegada no corre code-review",
    clave: false,
    valores: {},
    corridas: ["qa-mechanical"],
    exitCode: 0,
    estado: "awaiting_user_tests",
  },
];

describe("la corrida delegada con la revisión exigida", () => {
  it.each(DELEGACION)(
    "$criterio",
    async ({ clave, valores, corridas, exitCode, estado }) => {
      armarDelegacion(clave);
      const deps = dependencias(valores);

      const r = await closeDelegated(
        PATHS(),
        resolveDelegation(lab, undefined),
        A,
        CIERRE,
        deps,
      );

      expect(r.exitCode, r.stderr).toBe(exitCode);
      expect(deps.corridas).toEqual(corridas);
      expect(estadoDe(A)).toBe(estado);
    },
  );
});

interface CasoDeResolver {
  readonly criterio: string;
  readonly gateId: string;
  readonly resultado: RegExp | null;
  readonly decisiones: number;
}

const RESOLVER: readonly CasoDeResolver[] = [
  {
    criterio:
      "C20: un review de code-review con motivo no se aprueba, lo decide una persona",
    gateId: "code-review",
    resultado: /la revisión del diff en REVIEW la decide una persona/,
    decisiones: 0,
  },
  {
    criterio: "regresión: un review de otra compuerta con motivo se aprueba como siempre",
    gateId: "analysis",
    resultado: null,
    decisiones: 1,
  },
];

describe("resolverCompuerta ante un review", () => {
  it.each(RESOLVER)("$criterio", async ({ gateId, resultado, decisiones }) => {
    armarDelegacion(false);
    const decidir = vi.fn(() => ({ ok: true, error: "", receipt: null }));

    const stop = await resolverCompuerta(
      PATHS(),
      A,
      gateId,
      "no debe bloquear",
      {
        runGate: async (gate, ticket) => {
          appendReceipt(PATHS(), ticket, recibo(ticket, gate, 0.5));
          return { stdout: "", stderr: "", exitCode: 0 };
        },
        decide: decidir as unknown as typeof recordHumanDecision,
      },
      {
        via: "delegación",
        actor: "agente",
        canal: "delegation",
        descripcion: "por delegación",
        frase: PALABRAS,
        anotar: () => undefined,
      },
    );

    if (resultado === null) expect(stop).toBeNull();
    else expect(stop).toMatch(resultado);
    expect(decidir).toHaveBeenCalledTimes(decisiones);
  });
});
