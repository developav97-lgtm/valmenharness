/**
 * Los presupuestos adaptativos (R-S1-003).
 *
 * Lo que estas pruebas afirman es que el típico sale de los cierres del registro y
 * no de un número escrito a mano, que los tres cortes son los que el requisito pide
 * —avisar a 1.5×, degradar a 2×, pausar a 3×— y que los multiplicadores los declara
 * el proyecto en su configuración. Y afirman lo que hace que un presupuesto sirva
 * para algo: que **cambie algo**. El corte de degradación tiene que mover el modelo
 * con el que el harness evalúa, y el de pausa tiene que dejar la decisión en manos
 * de una persona en vez de tomarla por ella.
 *
 * Todo corre contra un registro de laboratorio: sin red, sin modelos y sin tocar el
 * registro del proyecto.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { gateRoutingFor } from "../packages/adapter/src/routing.js";
import { parseConfig, readHermesConfig } from "../packages/adapter/src/config.js";
import { dispatch, parseArgs, resolvePaths } from "../packages/cli/src/main.js";
import { budgetCommand } from "../packages/cli/src/commands.js";
import { EXIT_INVARIANT } from "../packages/core/src/errors.js";
import {
  DEFAULT_BUDGET_POLICY,
  budgetForTicket,
  classifyRunCost,
  learnTypicalCosts,
  presetForDegradation,
  readBudgetPolicy,
  typicalFor,
} from "../packages/engine/src/budget.js";
import { runGate } from "../packages/engine/src/gate.js";
import { renderBudgetNotification } from "../packages/engine/src/notify.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

let lab: string;

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

/** La fecha en la que corren estas pruebas: los cierres son de días anteriores. */
const HOY = new Date("2026-09-27T12:00:00.000Z");

/** La configuración del proyecto, con lo que el test quiera declarar. */
function configurar(extra = ""): void {
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(
    join(lab, ".valmen", "config.yaml"),
    `name: Laboratorio\ntest-commands:\n  - npx vitest run\n${extra}`,
    "utf8",
  );
}

/** Los presupuestos con las acciones encendidas, para los tests que las usan. */
const ADAPTATIVO = `budgets:
  adaptive:
    enabled: true
    min-samples: 3
    multipliers:
      notify: 1.5
      degrade: 2
      pause: 3
    degrade-preset: economy
`;

/** Una política con las acciones encendidas, para no repetir el archivo. */
function politicaAdaptativa(extra = ""): ReturnType<typeof readBudgetPolicy> {
  configurar(ADAPTATIVO + extra);
  return readBudgetPolicy(lab);
}

/** Una entrada de consumo del ticket, con el costo que el test pida. */
function consumo(costo: number | null, indice: number, fecha = "2026-09-20"): unknown {
  return {
    kind: "ai-usage",
    id: `CONSUMO-00${indice + 1}`,
    date: fecha,
    session_reference: `hermes:lab-${indice}`,
    model: "deepseek-v4.1-flash",
    reasoning_effort: null,
    input_tokens: 1000,
    output_tokens: 100,
    total_tokens: 1100,
    estimated_cost_usd: costo,
    source: "hermes:state.db",
    confidence: "high",
    notes: null,
  };
}

/** Un cierre registrado, con sus consumos. */
function cierre(
  id: string,
  tipo: string,
  costos: readonly (number | null)[],
  fecha = "2026-09-20",
): string {
  writeFixtureTicket(lab, {
    id,
    type: tipo,
    workflowStatus: "closed",
    qaStatus: "approved",
    ...(tipo === "FEATURE" ? {} : {}),
  });

  const ruta = join(lab, "tickets", "2026", id, "ticket.md");
  const usos = costos.map((costo, indice) => consumo(costo, indice, fecha));
  const cierres = [
    {
      kind: "ticket-close",
      id: "CLOSE-001",
      date: fecha,
      technical_summary: "Se hizo el cambio.",
      functional_summary: "Ya funciona.",
      qa_status: "approved",
      qa_waiver_reason: null,
      po_confirmation: "probado y conforme",
      release_impact: "not_applicable",
    },
  ];

  // Dos ciclos, como en un ticket de verdad: el primero abre en `pending` —es la
  // regla del contrato, y sin ella un ticket cerrado no valida— y el segundo es el
  // que aprueba.
  const qa = [
    {
      id: "QA-001",
      date: fecha,
      build_reference: `worktree:sha256:${"a".repeat(64)}`,
      environment: "laboratorio",
      result: "pending",
      findings: [],
      correction: null,
      po_confirmation: null,
    },
    {
      id: "QA-002",
      date: fecha,
      build_reference: null,
      environment: "laboratorio",
      result: "approved",
      findings: [],
      correction: null,
      po_confirmation: "probado y conforme (laboratorio)",
    },
  ];

  writeFileSync(
    ruta,
    readFileSync(ruta, "utf8")
      .replace(/(## Consumo de IA\n\n```json\n)\[\]/, `$1${JSON.stringify(usos, null, 2)}`)
      .replace(/(## Cierre\n\n```json\n)\[\]/, `$1${JSON.stringify(cierres, null, 2)}`)
      .replace(/(## QA\n\n```json\n)\[\]/, `$1${JSON.stringify(qa, null, 2)}`)
      // Un ticket cerrado sin el resultado del PO en `## Pruebas` no valida, y los
      // cierres que no validan no entran al informe: el laboratorio tiene que tener
      // cierres de verdad o el típico aprendería de la nada.
      .replace(
        /## Pruebas\n\nPendiente de ejecución\./,
        "## Pruebas\n\n- Resultado del PO: probado y conforme (laboratorio).",
      ),
    "utf8",
  );
  return id;
}

/** Un ticket en curso, con el gasto que el test quiera darle. */
function enCurso(
  id: string,
  tipo: string,
  costos: readonly (number | null)[],
  estado = "in_progress",
): string {
  writeFixtureTicket(lab, { id, type: tipo, workflowStatus: estado });
  const ruta = join(lab, "tickets", "2026", id, "ticket.md");
  const usos = costos.map((costo, indice) => consumo(costo, indice, "2026-09-27"));
  writeFileSync(
    ruta,
    readFileSync(ruta, "utf8").replace(
      /(## Consumo de IA\n\n```json\n)\[\]/,
      `$1${JSON.stringify(usos, null, 2)}`,
    ),
    "utf8",
  );
  return id;
}

/** Un recibo de compuerta con su costo, para el gasto del harness. */
function recibo(ticketId: string, costUsd: number): void {
  mkdirSync(join(lab, ".valmen", "receipts"), { recursive: true });
  writeFileSync(
    join(lab, ".valmen", "receipts", `${ticketId}.jsonl`),
    `${JSON.stringify({
      kind: "gate-receipt",
      receiptVersion: 1,
      schemaVersion: "2",
      id: `GR-20260927-analysis`,
      gate: "analysis",
      gateHash: "sha256:aaaa",
      subject: { type: "ticket", id: ticketId, revision: "100" },
      outcome: "review",
      reason: "en banda",
      actor: "model",
      decidedAt: "2026-09-27T10:00:00.000Z",
      stateHash: "sha256:bbbb",
      policy: { approveAt: 0.9, blockAt: 0.1 },
      mechanicalChecks: [],
      modelAnswers: [],
      propositions: [],
      model: { provider: "openrouter", model: "jev-1.13", resolvedVersion: "jev@1" },
      usage: { inputTokens: 1000, outputTokens: 100, costUsd },
      latencyMs: 500,
      escalatedTo: null,
      humanDecision: null,
    })}\n`,
    "utf8",
  );
}

/** El último recibo anexado de un ticket. */
function ultimoRecibo(ticketId: string): Record<string, unknown> | null {
  const recibos = readReceipts(PATHS(), ticketId);
  const ultimo = recibos[recibos.length - 1];
  return ultimo === undefined ? null : (ultimo as unknown as Record<string, unknown>);
}

/**
 * Un evaluador simulado: nada de esto sale a la red.
 *
 * Responde por el tipo de proposición y no con una forma fija: el gate de análisis
 * despliega una proposición de opción, y contestarla con un valor numérico la
 * rechaza el contrato —`La proposición "clasificacion" esperaba una opción`—, así que
 * una prueba que respondiera todo igual no llegaría nunca al recibo.
 */
function evaluador(): typeof import("../packages/gate-jev/src/index.js").evaluateWithJev {
  return (async (options: {
    propositions?: readonly { id: string; kind: string; criteria?: Record<string, string> }[];
  }) => ({
    answers: (options?.propositions ?? []).map((proposition) =>
      proposition.kind === "choice"
        ? {
            id: proposition.id,
            kind: "choice" as const,
            choice: Object.keys(proposition.criteria ?? {})[0] ?? "si",
            confidence: 0.95,
          }
        : {
            id: proposition.id,
            kind: proposition.kind as "noul",
            value: 0.95,
            confidence: 0.95,
          },
    ),
    model: {
      provider: "openrouter",
      model: "typesafe/jev-1.13",
      resolvedVersion: "typesafe/jev-1.13-20260917",
    },
    usage: { inputTokens: 751, outputTokens: 115, costUsd: 0.000031542 },
    latencyMs: 777,
  })) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-presupuesto-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

describe("el costo típico por tipo de ticket", () => {
  it("es la mediana de los cierres del tipo y no la media", () => {
    cierre("BUGFIX-POS-A-20260920", "BUGFIX", [0.2]);
    cierre("BUGFIX-POS-B-20260920", "BUGFIX", [0.4]);
    // Un ticket que se fue a 20× lo habitual es justo el caso que hay que detectar:
    // con la media, ese mismo ticket subiría la referencia y taparía al próximo.
    cierre("BUGFIX-POS-C-20260920", "BUGFIX", [8.0]);

    const informe = learnTypicalCosts(PATHS(), DEFAULT_BUDGET_POLICY, { now: HOY });
    expect(typicalFor(informe, "BUGFIX")?.typicalUsd).toBeCloseTo(0.4, 6);
    expect(typicalFor(informe, "BUGFIX")?.samples).toBe(3);
  });

  it("declara cuántos cierres sostienen cada típico", () => {
    cierre("BUGFIX-POS-A-20260920", "BUGFIX", [0.4]);
    cierre("BUGFIX-POS-B-20260920", "BUGFIX", [0.6]);
    configurar(ADAPTATIVO);

    const salida = budgetCommand(PATHS(), { tipo: "BUGFIX" }, { now: () => HOY });
    expect(salida.exitCode).toBe(0);
    expect(salida.stdout).toContain("BUGFIX");
    expect(salida.stdout).toMatch(/\$0\.5000\b/);
    expect(salida.stdout).toMatch(/2 cierre\(s\)/);
  });

  it("un tipo sin cierres se declara sin típico, no con un típico de cero", () => {
    cierre("BUGFIX-POS-A-20260920", "BUGFIX", [0.4]);
    configurar(ADAPTATIVO);

    const informe = learnTypicalCosts(PATHS(), DEFAULT_BUDGET_POLICY, { now: HOY });
    expect(typicalFor(informe, "SYNC")).toBeNull();

    const salida = budgetCommand(PATHS(), { tipo: "SYNC" }, { now: () => HOY });
    expect(salida.stdout).toMatch(/sin cierres/i);
    expect(salida.stdout).not.toMatch(/\$0\.0000/);
  });

  it("deja fuera del típico los cierres con costo parcial", () => {
    cierre("BUGFIX-POS-A-20260920", "BUGFIX", [0.4]);
    cierre("BUGFIX-POS-B-20260920", "BUGFIX", [0.4]);
    cierre("BUGFIX-POS-C-20260920", "BUGFIX", [0.4]);
    // Una sesión por suscripción no declara costo: contarla como cero haría parecer
    // barato lo que no se midió.
    cierre("BUGFIX-POS-D-20260920", "BUGFIX", [0.4, null]);

    const informe = learnTypicalCosts(PATHS(), DEFAULT_BUDGET_POLICY, { now: HOY });
    expect(typicalFor(informe, "BUGFIX")?.typicalUsd).toBeCloseTo(0.4, 6);
    expect(typicalFor(informe, "BUGFIX")?.samples).toBe(3);
  });

  it("dice aparte cuántos cierres quedaron fuera por costo parcial", () => {
    cierre("BUGFIX-POS-A-20260920", "BUGFIX", [0.4]);
    cierre("BUGFIX-POS-D-20260920", "BUGFIX", [null]);
    configurar(ADAPTATIVO);

    const salida = budgetCommand(PATHS(), {}, { now: () => HOY });
    expect(salida.stdout).toMatch(/1 cierre\(s\) sin costo completo/);
  });

  it("marca como referencia el típico sostenido por menos cierres que min-samples", () => {
    cierre("FEATURE-POS-A-20260920", "FEATURE", [3.0]);
    configurar(ADAPTATIVO);

    const informe = learnTypicalCosts(PATHS(), readBudgetPolicy(lab), { now: HOY });
    expect(typicalFor(informe, "FEATURE")?.reference).toBe(true);

    const salida = budgetCommand(PATHS(), { tipo: "FEATURE" }, { now: () => HOY });
    expect(salida.stdout).toMatch(/referencia/);
  });

  it("no aplica ningún corte cuando el típico es solo una referencia", () => {
    cierre("FEATURE-POS-A-20260920", "FEATURE", [3.0]);
    const politica = politicaAdaptativa();
    // Treinta veces el típico, y aun así no hay corte: un típico sostenido por un
    // cierre es una anécdota, no un presupuesto.
    const id = enCurso("FEATURE-POS-CARO-20260927", "FEATURE", [90.0]);

    const salida = budgetCommand(PATHS(), { id }, { now: () => HOY });
    expect(salida.stdout).toMatch(/referencia/i);
    expect(salida.stdout).toMatch(/no hay corte aplicable|cumple/i);
    expect(politica.minSamples).toBe(3);
  });

  it("suma el gasto del ticket con los recibos de sus compuertas", () => {
    const id = enCurso("BUGFIX-POS-CARO-20260927", "BUGFIX", [1.0]);
    recibo(id, 0.5);
    configurar(ADAPTATIVO);

    const salida = budgetCommand(PATHS(), { id }, { now: () => HOY });
    expect(salida.stdout).toMatch(/\$1\.5000\b/);
  });
});

describe("los tres cortes", () => {
  const politica = DEFAULT_BUDGET_POLICY;

  it("por debajo de 1.5× la corrida cumple", () => {
    const veredicto = classifyRunCost({ costUsd: 1.39, typicalUsd: 1, policy: politica });
    expect(veredicto.tier).toBe("within");
  });

  it("a 1.5× la corrida avisa", () => {
    const veredicto = classifyRunCost({ costUsd: 1.5, typicalUsd: 1, policy: politica });
    expect(veredicto.tier).toBe("notify");
    expect(veredicto.multiple).toBeCloseTo(1.5, 6);
    expect(veredicto.thresholds.notifyUsd).toBeCloseTo(1.5, 6);
  });

  it("a 2× la corrida degrada el enrutado", () => {
    const veredicto = classifyRunCost({ costUsd: 2, typicalUsd: 1, policy: politica });
    expect(veredicto.tier).toBe("degrade");
    expect(veredicto.thresholds.degradeUsd).toBeCloseTo(2, 6);
  });

  it("a 3× la corrida pausa y consulta", () => {
    const veredicto = classifyRunCost({ costUsd: 3, typicalUsd: 1, policy: politica });
    expect(veredicto.tier).toBe("pause");
    expect(veredicto.thresholds.pauseUsd).toBeCloseTo(3, 6);
  });

  it("sin típico no hay corte que aplicar", () => {
    const veredicto = classifyRunCost({ costUsd: 99, typicalUsd: null, policy: politica });
    expect(veredicto.tier).toBe("within");
    expect(veredicto.thresholds.pauseUsd).toBeNull();
  });
});

describe("los multiplicadores del proyecto", () => {
  it("reemplazan los valores por defecto", () => {
    expect(DEFAULT_BUDGET_POLICY.multipliers).toEqual({ notify: 1.5, degrade: 2, pause: 3 });

    const politica = politicaAdaptativa(`    multipliers:
      notify: 1.2
      degrade: 1.4
      pause: 1.6
`);
    // La primera declaración gana, y la de abajo del todo no puede pisarla: el
    // archivo se lee de arriba abajo y repetir una clave es un error del archivo.
    expect(politica.multipliers.notify).toBe(1.5);

    configurar(`budgets:
  adaptive:
    enabled: true
    multipliers:
      notify: 1.2
      degrade: 1.4
      pause: 1.6
`);
    const otra = readBudgetPolicy(lab);
    expect(otra.multipliers).toEqual({ notify: 1.2, degrade: 1.4, pause: 1.6 });
    expect(
      classifyRunCost({ costUsd: 1.2, typicalUsd: 1, policy: otra }).tier,
    ).toBe("notify");
  });

  it("un multiplicador que no es un número se rechaza nombrando su clave", () => {
    configurar(`budgets:
  adaptive:
    multipliers:
      notify: muchisimo
      degrade: 2
      pause: 3
`);
    expect(() => readBudgetPolicy(lab)).toThrow(/notify/);
  });

  it("unos multiplicadores que no suben de notify a pause se rechazan con su motivo", () => {
    configurar(`budgets:
  adaptive:
    multipliers:
      notify: 3
      degrade: 2
      pause: 1.5
`);
    expect(() => readBudgetPolicy(lab)).toThrow(/subir de notify/);
  });

  it("con las acciones apagadas el informe declara los típicos igual", () => {
    cierre("BUGFIX-POS-A-20260920", "BUGFIX", [0.4]);
    configurar("");

    const politica = readBudgetPolicy(lab);
    expect(politica.enabled).toBe(false);

    const salida = budgetCommand(PATHS(), { tipo: "BUGFIX" }, { now: () => HOY });
    expect(salida.stdout).toMatch(/\$0\.4000\b/);
    expect(salida.stdout).toMatch(/acciones apagadas/i);
  });

  it("con las acciones apagadas ninguna corrida degrada el enrutado", () => {
    configurar("");
    const politica = readBudgetPolicy(lab);
    expect(presetForDegradation("degrade", politica)).toBeNull();
    expect(presetForDegradation("pause", politica)).toBeNull();
    expect(presetForDegradation("notify", politica)).toBeNull();
  });
});

describe("la degradación del enrutado", () => {
  it("resuelve la compuerta con el preset que declara degrade-preset", () => {
    // El proyecto arranca en el preset caro, para que el cambio se vea.
    mkdirSync(join(lab, ".valmen"), { recursive: true });
    writeFileSync(join(lab, ".valmen", "routing.yaml"), "preset: quality\n", "utf8");
    cierre("BUGFIX-POS-A-20260920", "BUGFIX", [1.0]);
    cierre("BUGFIX-POS-B-20260920", "BUGFIX", [1.0]);
    cierre("BUGFIX-POS-C-20260920", "BUGFIX", [1.0]);
    const politica = politicaAdaptativa();
    const id = enCurso("BUGFIX-POS-CARO-20260927", "BUGFIX", [2.5]);

    const sinDegradar = gateRoutingFor(lab);
    const decision = budgetForTicket(PATHS(), id, politica, { now: HOY });
    expect(decision.tier).toBe("degrade");
    expect(decision.preset).toBe("economy");

    const salida = budgetCommand(PATHS(), { id }, { now: () => HOY, policy: politica });
    expect(salida.stdout).toMatch(/degradado a economy/);

    const degradado = gateRoutingFor(lab, { preset: decision.preset ?? "" });
    expect(degradado.source).toBe("preset");
    expect(degradado.judgeModel).not.toBe(sinDegradar.judgeModel);
    expect(degradado.judgeModel).toBe(gateRoutingFor(lab, { preset: "economy" }).judgeModel);
  });

  it("deja la nota que lo explica escrita en el recibo de la compuerta", async () => {
    cierre("BUGFIX-POS-A-20260920", "BUGFIX", [1.0]);
    // El gate de análisis exige el ticket en `analyzed`: fuera de ese estado se
    // rechaza sin escribir recibo, y la nota no tendría dónde quedar.
    const id = enCurso("BUGFIX-POS-NOTA-20260927", "BUGFIX", [4.0], "analyzed");

    const nota =
      "Routing degradado por presupuesto: el ticket lleva 4.0× el costo típico de su tipo (degrade).";
    await runGate(PATHS(), {
      gateId: "analysis",
      ticketId: id,
      jev: evaluador(),
      notes: [nota],
    });

    expect(ultimoRecibo(id)?.notes).toContain(nota);
  });
});

describe("el aviso del corte", () => {
  const aviso = {
    ticketId: "BUGFIX-POS-CARO-20260927",
    title: "El filtro de órdenes no encuentra por número parcial",
    type: "BUGFIX",
    costUsd: 2.5,
    typicalUsd: 1.0,
    multiple: 2.5,
    tier: "degrade" as const,
    preset: "economy",
  };

  it("lleva el ticket, el costo, el típico y el múltiplo alcanzado", () => {
    const payload = renderBudgetNotification(aviso);
    expect(payload.subject).toContain("BUGFIX-POS-CARO-20260927");
    expect(payload.body).toContain("$2.5000");
    expect(payload.body).toContain("$1.0000");
    expect(payload.body).toContain("2.5×");
    expect(payload.body).toMatch(/economy/);
  });

  it("cuando el corte es la pausa pide la decisión de una persona", () => {
    const payload = renderBudgetNotification({ ...aviso, tier: "pause", multiple: 3.2 });
    expect(payload.body).toMatch(/La decisión es tuya/);
    expect(payload.body).toMatch(/3.2×/);
  });
});

describe("el comando", () => {
  it("--check sale con el código de invariante cuando el corte es la pausa", () => {
    cierre("BUGFIX-POS-A-20260920", "BUGFIX", [1.0]);
    cierre("BUGFIX-POS-B-20260920", "BUGFIX", [1.0]);
    cierre("BUGFIX-POS-C-20260920", "BUGFIX", [1.0]);
    politicaAdaptativa();
    const id = enCurso("BUGFIX-POS-CARISIMO-20260927", "BUGFIX", [3.5]);

    const salida = budgetCommand(PATHS(), { id, check: true }, { now: () => HOY });
    expect(salida.exitCode).toBe(EXIT_INVARIANT);
  });

  it("--check sale con cero cuando el corte es menor que la pausa", () => {
    cierre("BUGFIX-POS-A-20260920", "BUGFIX", [1.0]);
    cierre("BUGFIX-POS-B-20260920", "BUGFIX", [1.0]);
    cierre("BUGFIX-POS-C-20260920", "BUGFIX", [1.0]);
    politicaAdaptativa();
    const id = enCurso("BUGFIX-POS-CARO-20260927", "BUGFIX", [1.6]);

    const salida = budgetCommand(PATHS(), { id, check: true }, { now: () => HOY });
    expect(salida.exitCode).toBe(0);

    // Y el mismo comando por el CLI, que es como lo corre una persona.
    const porCli = dispatch(
      parseArgs(["budget", "--id", id, "--check", "--root", lab, "--tickets-dir", "tickets"]),
    );
    expect(porCli.exitCode).toBe(0);
    expect(resolvePaths(parseArgs(["budget", "--id", id, "--root", lab])).root).toBe(lab);
  });
});

describe("el destino del aviso", () => {
  it("se declara en la clave hermes.notify.budget", () => {
    const config = parseConfig(
      [
        "name: Laboratorio",
        "hermes:",
        "  enabled: true",
        "  notify:",
        "    gate: telegram",
        "    budget: telegram",
      ].join("\n"),
    );
    expect(readHermesConfig(config).budgetTarget).toBe("telegram");
  });

  it("se manda al destino declarado por el canal de Hermes", () => {
    cierre("BUGFIX-POS-A-20260920", "BUGFIX", [1.0]);
    cierre("BUGFIX-POS-B-20260920", "BUGFIX", [1.0]);
    cierre("BUGFIX-POS-C-20260920", "BUGFIX", [1.0]);
    configurar(
      `${ADAPTATIVO}hermes:
  enabled: true
  notify:
    budget: telegram
`,
    );
    const id = enCurso("BUGFIX-POS-CARO-20260927", "BUGFIX", [2.5]);

    const enviados: { target: string; cuerpo: string }[] = [];
    const salida = budgetCommand(
      PATHS(),
      { id, avisar: true },
      {
        now: () => HOY,
        runner: (_command: string, args: readonly string[], input: string) => {
          enviados.push({ target: String(args[args.indexOf("--to") + 1]), cuerpo: input });
          return { status: 0, stdout: "", stderr: "", failed: false };
        },
      },
    );

    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.target).toBe("telegram");
    expect(enviados[0]?.cuerpo).toContain(id);
    expect(salida.stdout).toMatch(/avisado a telegram/i);
  });

  it("sin destino declarado no se manda nada y se dice por qué", () => {
    cierre("BUGFIX-POS-A-20260920", "BUGFIX", [1.0]);
    cierre("BUGFIX-POS-B-20260920", "BUGFIX", [1.0]);
    cierre("BUGFIX-POS-C-20260920", "BUGFIX", [1.0]);
    politicaAdaptativa();
    const id = enCurso("BUGFIX-POS-CARO-20260927", "BUGFIX", [2.5]);

    let enviados = 0;
    const salida = budgetCommand(
      PATHS(),
      { id, avisar: true },
      {
        now: () => HOY,
        runner: () => {
          enviados += 1;
          return { status: 0, stdout: "", stderr: "", failed: false };
        },
      },
    );

    expect(enviados).toBe(0);
    expect(salida.stdout).toMatch(/no se avisó/i);
    expect(salida.stdout).toMatch(/hermes\.notify\.budget/);
  });
});
