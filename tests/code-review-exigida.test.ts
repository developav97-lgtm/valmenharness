/**
 * Exigir la revisión del diff al entregar (R-REV-004 y R-REV-005, FEATURE-GATE-CODE-REVIEW-EXIGENCIA).
 *
 * Con `code-review: exigida` en `.valmen/config.yaml`, entregar un ticket (`awaiting_user_tests`)
 * pide un recibo vigente de `code-review`. Una tabla por regla: la entrega, la lectura de la clave,
 * el siguiente paso y el brief. Los laboratorios son repositorios git temporales con base `main` y
 * los revisores son falsos inyectados por `reviewDiff`: ninguna prueba llama a un modelo real, y la
 * clave solo existe en los laboratorios, nunca en este repositorio.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseTicket } from "../packages/core/src/index.js";
import { codeReviewExigida } from "../packages/engine/src/discovery.js";
import { type GateRunOptions, runGate } from "../packages/engine/src/gate.js";
import { armarBriefDeSubagente } from "../packages/engine/src/index.js";
import { computeNextStep } from "../packages/engine/src/next-step.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import { transition } from "../packages/engine/src/transition.js";
import type { GateReceipt } from "../packages/gate/src/index.js";
import type {
  RespuestaDeDiff,
  ReviewDiffEvaluation,
  ReviewDiffOptions,
} from "../packages/gate-llm-judge/src/index.js";
import { recordHumanDecision } from "../packages/server/src/gates.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";
import { crearEntornoOla, ticketEn, type EntornoOla } from "./helpers/ola.js";

const ID = "FEATURE-GATE-REVISION-EXIGIDA-20261010";
const PASA = 'node -e "process.exit(0)"';
const CONFIG = "name: Laboratorio\ntest-commands:\n  - node\n";
const CLAVE = "code-review: exigida\n";

let lab: string;
const PATHS = () => ({ root: lab, ticketsDir: "tickets" });

// ── El laboratorio ──────────────────────────────────────────────────────────────────────────

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

/** Un archivo de `n` líneas numeradas. */
const lineas = (prefijo: string, n: number): string =>
  `${Array.from({ length: n }, (_, i) => `export const ${prefijo}${i + 1} = () => ${i + 1};`).join("\n")}\n`;

function cambiarLinea(ruta: string, numero: number, nueva: string): void {
  const todas = readFileSync(join(lab, ruta), "utf8").split("\n");
  todas[numero - 1] = nueva;
  escribir(ruta, todas.join("\n"));
}

/** Un ticket `in_progress` en un repositorio con base `main` y `trabajo` con un cambio de riesgo medio. */
function armar(config: string): void {
  git("init", "-q", "-b", "main");
  escribir(".valmen/config.yaml", config);
  escribir("src/app.ts", lineas("f", 60));
  escribir("src/otro.ts", lineas("g", 30));
  writeFixtureTicket(lab, {
    id: ID,
    workflowStatus: "in_progress",
    type: "FEATURE",
    module: "GATE",
    criterios: `- [ ] La suma funciona.\n      <!-- test: ${PASA} -->`,
    pruebas: `- Comando: \`${PASA}\`, directorio: la raíz del laboratorio.\n- Resultado esperado: sale con 0.`,
  });
  git("add", "-A");
  git("commit", "-qm", "base");
  git("checkout", "-q", "-b", "trabajo");
  cambiarLinea("src/app.ts", 50, "export const f50 = () => 5000;");
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-exigida-"));
});
afterEach(() => rmSync(lab, { recursive: true, force: true }));

// ── Los revisores falsos y las compuertas ───────────────────────────────────────────────────

const hallazgo = (ruta: string, linea: number): Partial<RespuestaDeDiff> => ({
  cumple: false,
  confianza: 0.95,
  motivo: "Hay un defecto severo.",
  hallazgos: [{ ruta, linea, motivo: "El cambio rompe a su consumidor." }],
});

/** Un revisor que cumple todo, o que no cumple `sin_hallazgo_severo` citando `src/app.ts:50`. */
function revisor(bloquea: boolean): NonNullable<GateRunOptions["reviewDiff"]> {
  return async (options: ReviewDiffOptions): Promise<ReviewDiffEvaluation> => ({
    respuestas: options.proposiciones.map((p) => ({
      proposicion: p.id,
      cumple: true,
      confianza: 0.95,
      motivo: "Sin hallazgo severo.",
      hallazgos: [],
      ...(bloquea && p.id === "sin_hallazgo_severo" ? hallazgo("src/app.ts", 50) : {}),
    })),
    model: { provider: "revisor-falso", model: "falso-1", resolvedVersion: "falso-1" },
    usage: { inputTokens: 1000, outputTokens: 100, costUsd: 0.01 },
    latencyMs: 7,
  });
}

const revisar = (bloquea = false) =>
  runGate(PATHS(), { gateId: "code-review", ticketId: ID, reviewDiff: revisor(bloquea) });

async function mecanica(): Promise<void> {
  const r = await runGate(PATHS(), {
    gateId: "qa-mechanical",
    ticketId: ID,
    evaluator: "command",
  });
  expect(r.exitCode, r.stderr).toBe(0);
}

/** La ronda 1 bloquea, se corrige la línea y la ronda 2 bloquea: queda un `review` sin firma. */
async function reviewDeLaSegundaRonda(): Promise<void> {
  await revisar(true);
  cambiarLinea("src/app.ts", 50, "export const f50 = () => 51;");
  await revisar(true);
}

function ultimoRecibo(): GateReceipt {
  const porId = new Map<string, GateReceipt>();
  for (const r of readReceipts(PATHS(), ID))
    if (r.gate === "code-review") porId.set(r.id, r);
  const todos = [...porId.values()];
  const ultimo = todos[todos.length - 1];
  if (ultimo === undefined) throw new Error("sin recibo de code-review");
  return ultimo;
}

function firmar(decision: "approve" | "reject"): void {
  const r = recordHumanDecision(PATHS(), ID, ultimoRecibo().id, {
    decision,
    actor: "PO",
    reason: "Revisado por una persona",
    channel: "cli",
  });
  expect(r.ok, r.error).toBe(true);
}

const entregar = () =>
  transition({ paths: PATHS(), ticketId: ID, entity: "ticket", to: "awaiting_user_tests" });
const estado = (): string =>
  parseTicket(readFileSync(join(lab, "tickets", "2026", ID, "ticket.md"), "utf8")).fields
    .workflow_status as string;
const siguientePaso = () =>
  computeNextStep(
    PATHS(),
    parseTicket(readFileSync(join(lab, "tickets", "2026", ID, "ticket.md"), "utf8")),
    readReceipts(PATHS(), ID),
  );

// ── La entrega (C1 a C8) ────────────────────────────────────────────────────────────────────

interface CasoDeEntrega {
  readonly criterio: string;
  readonly config: string;
  readonly preparar: () => Promise<void>;
  /** `null`: la entrega pasa; si no, lo que dice el rechazo. */
  readonly rechazo: RegExp | null;
}

const COMMIT_POSTERIOR = (): void => {
  cambiarLinea("src/otro.ts", 10, "export const g10 = () => 1000;");
  git("add", "-A");
  git("commit", "-qm", "después de la revisión");
};
const EDITAR_ARCHIVO = (): void =>
  cambiarLinea("src/otro.ts", 10, "export const g10 = () => 2000;");

const ENTREGA: readonly CasoDeEntrega[] = [
  {
    criterio: "C1: sin recibo de code-review se rechaza y dice qué correr",
    config: CONFIG + CLAVE,
    preparar: mecanica,
    rechazo: new RegExp(`valmen gate code-review --id ${ID}`),
  },
  {
    criterio: "C2: un approve sobre el árbol de ahora deja entregar",
    config: CONFIG + CLAVE,
    preparar: async () => {
      await revisar();
      expect(ultimoRecibo().outcome).toBe("approve");
      await mecanica();
    },
    rechazo: null,
  },
  {
    criterio: "C3: un commit posterior al approve pide revisar el árbol nuevo",
    config: CONFIG + CLAVE,
    preparar: async () => {
      await revisar();
      COMMIT_POSTERIOR();
      await mecanica();
    },
    rechazo: new RegExp(
      `cambió desde la revisión del código[^]*gate code-review --id ${ID}`,
    ),
  },
  {
    criterio: "C4: un review sin decisión humana se rechaza y dice quién lo firma",
    config: CONFIG + CLAVE,
    preparar: async () => {
      await reviewDeLaSegundaRonda();
      expect(ultimoRecibo().outcome).toBe("review");
      await mecanica();
    },
    rechazo: /gate-decide[^]*--receipt GR-/,
  },
  {
    criterio: "C5: un review aprobado por una persona deja entregar ese árbol",
    config: CONFIG + CLAVE,
    preparar: async () => {
      await reviewDeLaSegundaRonda();
      firmar("approve");
      await mecanica();
    },
    rechazo: null,
  },
  {
    criterio: "C6: un review aprobado deja de valer si cambia un archivo funcional",
    config: CONFIG + CLAVE,
    preparar: async () => {
      await reviewDeLaSegundaRonda();
      firmar("approve");
      EDITAR_ARCHIVO();
      await mecanica();
    },
    rechazo: /cambió desde la revisión del código/,
  },
  {
    criterio: "C7: un block de la ronda 1 se rechaza pidiendo una sola corrección acotada",
    config: CONFIG + CLAVE,
    preparar: async () => {
      await revisar(true);
      expect(ultimoRecibo().outcome).toBe("block");
      await mecanica();
    },
    rechazo: /una sola corrección acotada a los hallazgos/,
  },
  {
    criterio: "C7: un rechazo humano se rechaza nombrando a quien lo dio",
    config: CONFIG + CLAVE,
    preparar: async () => {
      await reviewDeLaSegundaRonda();
      firmar("reject");
      await mecanica();
    },
    rechazo: /PO[^]*rechaz/i,
  },
  {
    criterio: "C8: sin la clave la entrega sin recibo se acepta",
    config: CONFIG,
    preparar: mecanica,
    rechazo: null,
  },
];

describe("R-REV-004: la entrega exige la revisión del diff", () => {
  it.each(ENTREGA)("$criterio", async ({ config, preparar, rechazo }) => {
    armar(config);
    await preparar();

    if (rechazo === null) {
      entregar();
      expect(estado()).toBe("awaiting_user_tests");
    } else {
      expect(entregar).toThrow(rechazo);
      expect(estado()).toBe("in_progress");
    }
  });
});

// ── La lectura de la clave (C9, C10, C11) ───────────────────────────────────────────────────

interface CasoDeClave {
  readonly criterio: string;
  readonly preparar: () => void;
  /** La raíz del proyecto sobre la que se pregunta. */
  readonly raiz: () => string;
  readonly exigida: boolean;
}

const CLAVE_EN_SUBDIRECTORIO = (): void => {
  git("init", "-q", "-b", "main");
  escribir(".valmen/config.yaml", CONFIG);
  escribir("proyecto/.valmen/config.yaml", CONFIG + CLAVE);
  git("add", "-A");
  git("commit", "-qm", "base");
};

const CLAVES: readonly CasoDeClave[] = [
  {
    criterio: "C9: quitar la clave del árbol sin commitear mantiene la exigencia",
    preparar: () => {
      armar(CONFIG + CLAVE);
      escribir(".valmen/config.yaml", CONFIG);
    },
    raiz: () => lab,
    exigida: true,
  },
  {
    criterio: "C10: agregar la clave al árbol sin commitear ya exige la revisión",
    preparar: () => {
      armar(CONFIG);
      escribir(".valmen/config.yaml", CONFIG + CLAVE);
    },
    raiz: () => lab,
    exigida: true,
  },
  {
    criterio:
      "C11: un proyecto en un subdirectorio lee la clave de su propia raíz en el HEAD",
    preparar: () => {
      CLAVE_EN_SUBDIRECTORIO();
      escribir("proyecto/.valmen/config.yaml", CONFIG);
    },
    raiz: () => join(lab, "proyecto"),
    exigida: true,
  },
  {
    criterio: "C11: la clave de la raíz del repositorio no la hereda el subdirectorio",
    preparar: () => {
      git("init", "-q", "-b", "main");
      escribir(".valmen/config.yaml", CONFIG + CLAVE);
      escribir("proyecto/.valmen/config.yaml", CONFIG);
      git("add", "-A");
      git("commit", "-qm", "base");
    },
    raiz: () => join(lab, "proyecto"),
    exigida: false,
  },
  {
    criterio: "sin la clave, o con otro valor, no se exige",
    preparar: () => armar(CONFIG + "code-review: opcional\n"),
    raiz: () => lab,
    exigida: false,
  },
  {
    criterio: "un config.yaml que no parsea y fuera de git no se exige ni lanza",
    preparar: () => escribir(".valmen/config.yaml", "esto: [no cierra\n"),
    raiz: () => lab,
    exigida: false,
  },
];

describe("la clave `code-review: exigida` se lee del árbol de trabajo y del HEAD", () => {
  it.each(CLAVES)("$criterio", ({ preparar, raiz, exigida }) => {
    preparar();
    expect(codeReviewExigida(raiz())).toBe(exigida);
  });
});

// ── El siguiente paso (C12 a C15) ───────────────────────────────────────────────────────────

interface CasoDeSiguientePaso {
  readonly criterio: string;
  readonly config: string;
  readonly preparar: () => Promise<void>;
  readonly fase: string;
  readonly pasos: RegExp;
  readonly alto: RegExp | null;
}

const SIGUIENTE: readonly CasoDeSiguientePaso[] = [
  {
    criterio: "C12: con la mecánica vigente y sin recibo indica correr code-review",
    config: CONFIG + CLAVE,
    preparar: mecanica,
    fase: "revisión del diff",
    pasos: new RegExp(`valmen gate code-review --id ${ID}`),
    alto: null,
  },
  {
    criterio: "C13: con otro árbol que el revisado indica volver a correr code-review",
    config: CONFIG + CLAVE,
    preparar: async () => {
      await revisar();
      EDITAR_ARCHIVO();
      await mecanica();
    },
    fase: "revisión del diff",
    pasos: new RegExp(`cambió desde la revisión del código[^]*gate code-review --id ${ID}`),
    alto: null,
  },
  {
    criterio: "C14: tras un block de la ronda 1 indica una sola corrección acotada",
    config: CONFIG + CLAVE,
    preparar: async () => {
      await revisar(true);
      await mecanica();
    },
    fase: "revisión del diff",
    pasos: /una sola corrección acotada a los hallazgos del recibo GR-/,
    alto: null,
  },
  {
    criterio: "C15: con un review de la ronda 2 sin firma devuelve el alto de una persona",
    config: CONFIG + CLAVE,
    preparar: async () => {
      await reviewDeLaSegundaRonda();
      await mecanica();
    },
    fase: "revisión del diff",
    pasos: /code-review/,
    alto: /gate-decide/,
  },
  {
    criterio: "con un approve vigente el paso es la entrega",
    config: CONFIG + CLAVE,
    preparar: async () => {
      await revisar();
      await mecanica();
    },
    fase: "entrega",
    pasos: /La verificación mecánica pasó sobre el estado actual/,
    alto: null,
  },
  {
    criterio: "regresión: sin la clave el paso es la entrega de siempre",
    config: CONFIG,
    preparar: mecanica,
    fase: "entrega",
    pasos: /La verificación mecánica pasó sobre el estado actual/,
    alto: null,
  },
];

describe("R-REV-004: el siguiente paso en in_progress sabe de la revisión", () => {
  it.each(SIGUIENTE)("$criterio", async ({ config, preparar, fase, pasos, alto }) => {
    armar(config);
    await preparar();

    const paso = siguientePaso();

    expect(paso.fase).toBe(fase);
    expect(paso.pasos.join("\n")).toMatch(pasos);
    if (alto === null) expect(paso.alto).toBeNull();
    else expect(paso.alto).toMatch(alto);
  });
});

// ── El brief (C16) ──────────────────────────────────────────────────────────────────────────

describe("R-REV-004: el brief de un subagente", () => {
  let entorno: EntornoOla;
  beforeEach(() => {
    entorno = crearEntornoOla();
  });
  afterEach(() => entorno.limpiar());

  it.each([
    { criterio: "C16: con la revisión exigida lista valmen gate code-review", clave: true },
    { criterio: "regresión: sin la clave el brief no la lista", clave: false },
  ])("$criterio", ({ clave }) => {
    if (clave)
      writeFileSync(
        join(entorno.root, ".valmen", "config.yaml"),
        `project-id: ola-lab\n${CLAVE}`,
      );
    ticketEn(entorno.root, ID, "approved");

    const brief = armarBriefDeSubagente({ project: entorno.project(), ticketId: ID });

    const comandos = brief.compuertas
      .find((c) => c.fase === "implementación")
      ?.comandos.map((c) => c.comando);
    const revision = `valmen gate code-review --id ${ID}`;
    expect(comandos).toContain(`valmen gate qa-mechanical --id ${ID} --evaluator command`);
    if (clave) expect(comandos).toContain(revision);
    else expect(comandos).not.toContain(revision);
  });
});
