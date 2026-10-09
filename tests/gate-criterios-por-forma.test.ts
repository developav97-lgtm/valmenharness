/**
 * Los criterios manuales y «la prueba pasa» se deciden en código; el tope cuenta afirmaciones.
 *
 * Un criterio `verify: manual` y un criterio `test:` que solo afirma que la prueba pasa o que el
 * monorepo compila se leen en el texto del plan: el código los decide y no se le preguntan al
 * modelo. Lo que no se puede bajar es la exigencia: un manual que ningún paso cita como «Cn» sigue
 * detectándose (C02), y un compuesto vota 0 (C03). El resto de criterios sigue yendo al evaluador
 * (C12, C13) y ninguna política, gate ni recibo ya escrito cambia (C18–C20).
 *
 * Cada `it` lleva en su nombre el identificador del criterio del ticket
 * IMPROVEMENT-GATE-CRITERIOS-MANUALES-POR-FORMA-20261009 que verifica.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runGate } from "../packages/engine/src/gate.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import {
  TOPE_DE_CRITERIOS,
  criteriosCitados,
  decidirCriterioEnCodigo,
  reviewBeforeGate,
} from "../packages/engine/src/revision-previa.js";
import {
  ANALYSIS_GATE,
  DEFAULT_POLICY,
  GATES,
  PLAN_GATE,
  QA_MECHANICAL_GATE,
  SIN_INTERFAZ,
  type CriterionSpec,
  criterionProposition,
  expandGate,
  extractCriteriaSpecs,
  seDecideEnCodigo,
} from "../packages/gate/src/index.js";
import { renderFixtureTicket, writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "IMPROVEMENT-GATE-CRITERIOS-FORMA-20261009";

let lab: string;
const PATHS = (): { root: string; ticketsDir: string } => ({ root: lab, ticketsDir: "tickets" });

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-criterios-forma-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
});
afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

const ROLLBACK = "- Rollback: revertir el commit del cambio en su rama.";

/** Un plan válido para el gate: pasos con archivo, más las líneas extra que pida la prueba. */
function plan(pasos: readonly string[]): string {
  return [
    "- Pasos ordenados:",
    ...pasos.map((paso, i) => `  ${i + 1}. ${paso}`),
    ROLLBACK,
  ].join("\n");
}

const manual = (texto: string): string => `- [ ] ${texto}\n      <!-- verify: manual -->`;
const conTest = (texto: string, comando: string): string => `- [ ] ${texto}\n      <!-- test: ${comando} -->`;

/** Escribe el ticket del laboratorio. */
function ticket(pasos: readonly string[], criterios: readonly string[]): void {
  writeFixtureTicket(lab, {
    id: TICKET,
    workflowStatus: "planned",
    plan: plan(pasos),
    criterios: criterios.join("\n"),
  });
}

/** Un evaluador que anota cada proposición que recibe y responde 0.95 a las de probabilidad. */
function espia(): {
  jev: NonNullable<Parameters<typeof runGate>[1]["jev"]>;
  recibidas: () => string[];
  llamadas: () => number;
} {
  const ids: string[] = [];
  let n = 0;
  const jev = (async ({ propositions }: { propositions: readonly { id: string; kind: string }[] }) => {
    n += 1;
    ids.push(...propositions.map((p) => p.id));
    return {
      answers: propositions.map((p) =>
        p.kind === "choice"
          ? { id: p.id, kind: "choice" as const, choice: "completo", confidence: 0.95 }
          : p.kind === "score"
            ? { id: p.id, kind: "score" as const, score: 1 }
            : { id: p.id, kind: "noul" as const, value: 0.95 },
      ),
      model: { provider: "laboratorio", model: "espia", resolvedVersion: "espia" },
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      latencyMs: 1,
    };
  }) as unknown as NonNullable<Parameters<typeof runGate>[1]["jev"]>;
  return { jev, recibidas: () => [...ids], llamadas: () => n };
}

async function correrPlan(e = espia()): Promise<{ e: ReturnType<typeof espia>; stdout: string }> {
  const r = await runGate(PATHS(), { gateId: "plan", ticketId: TICKET, evaluator: "jev", jev: e.jev });
  return { e, stdout: r.stdout };
}

/** El último recibo del ticket. */
function recibo(): { modelAnswers: { id: string; value?: number }[]; notes?: string[]; policy: unknown } {
  const todos = readReceipts(PATHS(), TICKET) as unknown as ReturnType<typeof recibo>[];
  const ultimo = todos[todos.length - 1];
  if (ultimo === undefined) throw new Error("No se escribió ningún recibo.");
  return ultimo;
}

const voto = (id: string): number | undefined => recibo().modelAnswers.find((a) => a.id === id)?.value;
const notas = (): string => (recibo().notes ?? []).join(" | ");

const ARCHIVO = "Tocar `packages/gate/src/criteria.ts`";

describe("criterios manuales", () => {
  it("C01 un manual de una afirmación citado como «Cn» vota 0.99 decidido en código", async () => {
    ticket([`${ARCHIVO} (C1).`], [manual("La skill dice que el criterio se cita en el paso")]);
    const { e } = await correrPlan();
    expect(voto("criterio_01")).toBe(0.99);
    expect(e.recibidas()).not.toContain("criterio_01");
  });

  it("C02 un manual de una afirmación que ningún paso cita vota 0 decidido en código", async () => {
    ticket([`${ARCHIVO}.`], [manual("La skill dice que el criterio se cita en el paso")]);
    const { e } = await correrPlan();
    expect(voto("criterio_01")).toBe(0);
    expect(e.recibidas()).not.toContain("criterio_01");
  });

  it("C03 un manual compuesto vota 0 decidido en código aunque un paso lo cite", async () => {
    ticket([`${ARCHIVO} (C1).`], [manual("La skill nombra el paso y el motivo del cambio")]);
    const { e } = await correrPlan();
    expect(voto("criterio_01")).toBe(0);
    expect(e.recibidas()).not.toContain("criterio_01");
    expect(notas()).toContain("agrupa 2 afirmaciones; partilo");
  });

  it("C04 el recibo nombra el motivo del 0 de cada criterio decidido en código", async () => {
    ticket(
      [`${ARCHIVO} (C2).`],
      [manual("El primer criterio queda sin cita en el plan"), manual("El segundo criterio queda citado en el plan"), manual("El tercero agrupa una cosa y otra cosa")],
    );
    await correrPlan();
    expect(notas()).toContain("criterio_01 decidido en código: ningún paso cita C1");
    expect(notas()).toContain("criterio_03 decidido en código: agrupa 2 afirmaciones; partilo");
    expect(notas()).not.toContain("criterio_02 decidido en código");
  });

  it("C05 un paso que cita el rango «C1–C24» cita a cada criterio del rango", () => {
    for (const rango of ["C1–C24", "C1-C24", "C1 a C24"]) {
      const citados = criteriosCitados(plan([`${ARCHIVO} (${rango}).`]));
      expect([...citados].sort((a, b) => a - b)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
      expect(citados.has(25)).toBe(false);
    }
  });

  it("C06 un paso que cita «C10» no cuenta como cita de C1", () => {
    const citados = criteriosCitados(plan([`${ARCHIVO} (C10).`, "Revisar `x.ts` con el plan de C100 y de AC1."]));
    expect(citados.has(10)).toBe(true);
    expect(citados.has(1)).toBe(false);
    expect(citados.has(100)).toBe(true);
  });

  it("C07 un criterio `verify: dev` sigue la regla de los criterios manuales", () => {
    const [dev] = extractCriteriaSpecs("- [ ] La pantalla conserva el flujo de pago en desarrollo\n      <!-- verify: dev -->");
    expect(dev?.dev).toBe(true);
    expect(seDecideEnCodigo(dev as CriterionSpec)).toBe(true);
    const sinCita = renderFixtureTicket({ id: TICKET, plan: plan([`${ARCHIVO}.`]) });
    const conCita = renderFixtureTicket({ id: TICKET, plan: plan([`${ARCHIVO} (C1).`]) });
    expect(decidirCriterioEnCodigo(1, dev as CriterionSpec, sinCita).valor).toBe(0);
    expect(decidirCriterioEnCodigo(1, dev as CriterionSpec, conCita).valor).toBe(0.99);
  });
});

describe("criterios «la prueba pasa»", () => {
  const PRUEBA = "`tests/a.test.ts` pasa.";
  const COMANDO = "npx vitest run tests/a.test.ts";

  it("C08 un `test:` que afirma que pasa vota 0.99 cuando un paso lo cita con su archivo", async () => {
    ticket([`${ARCHIVO} (C1).`, "Añadir `tests/a.test.ts` con el caso."], [conTest(PRUEBA, COMANDO)]);
    const { e } = await correrPlan();
    expect(voto("criterio_01")).toBe(0.99);
    expect(e.recibidas()).not.toContain("criterio_01");
  });

  it("C09 un `test:` que afirma que pasa vota 0 cuando ningún paso lo cita", async () => {
    ticket([`${ARCHIVO}.`, "Añadir `tests/a.test.ts` con el caso."], [conTest(PRUEBA, COMANDO)]);
    const { e } = await correrPlan();
    expect(voto("criterio_01")).toBe(0);
    expect(e.recibidas()).not.toContain("criterio_01");
    expect(notas()).toContain("ningún paso cita C1");
  });

  it("C10 un `test:` que afirma que pasa vota 0 cuando el plan no nombra su archivo de prueba", async () => {
    ticket([`${ARCHIVO} (C1).`], [conTest(PRUEBA, COMANDO)]);
    const { e } = await correrPlan();
    expect(voto("criterio_01")).toBe(0);
    expect(e.recibidas()).not.toContain("criterio_01");
    expect(notas()).toContain("el plan no nombra `tests/a.test.ts`");
  });

  it("C11 un `test:` que afirma que el monorepo compila vota 0.99 cuando un paso lo cita", async () => {
    ticket([`${ARCHIVO} (C1).`], [conTest("El monorepo compila sin errores.", "npx tsc --build tsconfig.build.json")]);
    const { e } = await correrPlan();
    expect(voto("criterio_01")).toBe(0.99);
    expect(e.recibidas()).not.toContain("criterio_01");
  });

  it("C12 un `test:` que describe un comportamiento sigue preguntándose al evaluador", async () => {
    const comportamiento = conTest("El filtro encuentra la orden por número parcial.", COMANDO);
    ticket([`${ARCHIVO} (C1).`], [comportamiento]);
    const [spec] = extractCriteriaSpecs(comportamiento);
    expect(seDecideEnCodigo(spec as CriterionSpec)).toBe(false);
    const { e } = await correrPlan();
    expect(e.recibidas()).toContain("criterio_01");
    expect(voto("criterio_01")).toBe(0.95);
  });

  it("C13 un criterio `http:` sigue preguntándose al evaluador", () => {
    const http: CriterionSpec = {
      text: "El endpoint responde 200 para la orden existente",
      command: null,
      manual: false,
      http: "GET /api/ordenes/1 expect: 200",
    };
    expect(seDecideEnCodigo(http)).toBe(false);
    const gate = expandGate(PLAN_GATE, { criteria: [http], impacts: [], interfaz: SIN_INTERFAZ });
    const proposicion = gate.propositions.find((p) => p.id === "criterio_01");
    expect(proposicion).toBeDefined();
    expect(proposicion?.decidedInCode).not.toBe(true);
  });
});

describe("el reparto entre el código y el evaluador", () => {
  it("C14 las proposiciones de criterio decididas en código no viajan al evaluador", async () => {
    ticket(
      [`${ARCHIVO} (C1–C3).`],
      [
        manual("El primer criterio manual queda citado por el plan"),
        conTest("El segundo criterio describe un comportamiento observable.", "npx vitest run tests/a.test.ts"),
        conTest("`tests/a.test.ts` pasa.", "npx vitest run tests/a.test.ts"),
      ],
    );
    const { e } = await correrPlan();
    expect(e.recibidas()).toContain("criterio_02");
    expect(e.recibidas()).not.toContain("criterio_01");
    expect(e.recibidas()).not.toContain("criterio_03");
  });

  it("C15 un plan cuyos criterios se deciden todos en código no hace ninguna llamada por criterios", async () => {
    ticket(
      [`${ARCHIVO} (C1–C2).`, "Añadir `tests/a.test.ts` con el caso."],
      [manual("El primer criterio manual queda citado por el plan"), conTest("`tests/a.test.ts` pasa.", "npx vitest run tests/a.test.ts")],
    );
    const { e } = await correrPlan();
    expect(e.recibidas().filter((id) => id.startsWith("criterio_"))).toEqual([]);
    expect(voto("criterio_01")).toBe(0.99);
    expect(voto("criterio_02")).toBe(0.99);
  });
});

describe("el caso medido de la pantalla de autorizaciones", () => {
  const COMANDOS = [
    ["autorizacion-qa-canales", "C31"],
    ["autorizacion-aprobacion", "C32"],
    ["elegibilidad-aprobacion", "C33"],
    ["autorizacion-qa", "C34"],
  ] as const;
  const criterios = COMANDOS.map(([nombre]) =>
    conTest(`\`tests/${nombre}.test.ts\` pasa.`, `npx vitest run tests/${nombre}.test.ts`),
  );
  // Los primeros 30 criterios del ticket no se reproducen: la prueba numera a los cuatro como C1–C4
  // y el paso 8 cita los suyos con el mismo texto.
  const PASO_8 = "Comprobación: `npx tsc --build tsconfig.build.json` y `npx vitest run` con los archivos de C24 y C31–C34. (C1, C2, C3, C4)";
  const PASO_ARCHIVOS =
    "Tocar `tests/autorizacion-qa-canales.test.ts`, `tests/autorizacion-aprobacion.test.ts`, `tests/elegibilidad-aprobacion.test.ts` y `tests/autorizacion-qa.test.ts`.";

  it("C16 con el texto de C31 a C34 y el paso 8 del plan, los cuatro votan cumplido decididos en código", async () => {
    ticket([PASO_ARCHIVOS, PASO_8], criterios);
    const { e } = await correrPlan();
    for (const id of ["criterio_01", "criterio_02", "criterio_03", "criterio_04"]) {
      expect(voto(id), id).toBe(0.99);
      expect(e.recibidas()).not.toContain(id);
    }
  });

  it("C17 el control de C16 sin el paso 8 deja los cuatro en 0", async () => {
    ticket([PASO_ARCHIVOS], criterios);
    const { e } = await correrPlan();
    for (const id of ["criterio_01", "criterio_02", "criterio_03", "criterio_04"]) {
      expect(voto(id), id).toBe(0);
      expect(e.recibidas()).not.toContain(id);
    }
  });
});

describe("lo que no cambia", () => {
  it("C18 la política de umbrales del gate de plan queda igual", async () => {
    expect(DEFAULT_POLICY).toEqual({ approveAt: 0.9, blockAt: 0.1 });
    expect(PLAN_GATE.policy).toEqual({ approveAt: 0.9, blockAt: 0.1 });
    ticket([`${ARCHIVO} (C1).`], [manual("El criterio manual queda citado por el plan")]);
    await correrPlan();
    expect(recibo().policy).toEqual(DEFAULT_POLICY);
  });

  it("C19 el gate de análisis sigue sin desplegar criterios", () => {
    const criteria: CriterionSpec[] = [
      { text: "Un criterio manual cualquiera del ticket", command: null, manual: true },
      { text: "`tests/a.test.ts` pasa.", command: "npx vitest run tests/a.test.ts", manual: false },
    ];
    expect(ANALYSIS_GATE.criteriaPropositions).not.toBe(true);
    const gate = expandGate(ANALYSIS_GATE, { criteria, impacts: [], interfaz: SIN_INTERFAZ });
    expect(gate.propositions.map((p) => p.id).filter((id) => id.startsWith("criterio_"))).toEqual([]);
    expect(gate.propositions.some((p) => p.decidedInCode === true && p.id.startsWith("criterio_"))).toBe(false);
  });

  it("C20 las proposiciones del gate `qa-mechanical` quedan iguales", () => {
    const criteria: CriterionSpec[] = [
      { text: "Un criterio manual cualquiera del ticket", command: null, manual: true },
      { text: "`tests/a.test.ts` pasa.", command: "npx vitest run tests/a.test.ts", manual: false },
      { text: "El filtro encuentra la orden parcial.", command: "npx vitest run tests/b.test.ts", manual: false },
    ];
    expect(GATES["qa-mechanical"]).toBe(QA_MECHANICAL_GATE);
    const gate = expandGate(QA_MECHANICAL_GATE, { criteria, impacts: [], interfaz: SIN_INTERFAZ });
    const esperadas = [criterionProposition(1, criteria[1] as CriterionSpec), criterionProposition(2, criteria[2] as CriterionSpec)];
    const propias = gate.propositions.filter((p) => p.id.startsWith("criterio_"));
    // Las mismas, en el mismo orden y sin la marca de decididas en código: las contesta el comando.
    expect(propias).toEqual(esperadas);
    expect(propias.some((p) => p.decidedInCode === true)).toBe(false);
  });
});

describe("el tope cuenta afirmaciones", () => {
  const atomico = (n: number): string => manual(`El criterio número ${n} se cumple en la pantalla.`);
  const compuesto = (n: number): string => manual(`El criterio número ${n} se cumple en la pantalla y en el informe.`);

  function revisar(criterios: readonly string[]): { id: string; message: string }[] {
    const texto = renderFixtureTicket({ id: TICKET, workflowStatus: "planned", plan: plan([`${ARCHIVO}.`]), criterios: criterios.join("\n") });
    return reviewBeforeGate({ root: lab, ticketText: texto, gateId: "plan" }).findings.filter(
      (h) => h.id === "mas_criterios_que_el_tope",
    );
  }

  it("C21 el precheck compara contra el tope de 40 la suma de afirmaciones de los criterios", () => {
    expect(TOPE_DE_CRITERIOS).toBe(40);
    // 21 criterios son menos que 40 líneas, pero 42 afirmaciones.
    expect(revisar(Array.from({ length: 21 }, (_, i) => compuesto(i + 1)))).toHaveLength(1);
    // 20 de dos afirmaciones son exactamente 40: no pasan el tope.
    expect(revisar(Array.from({ length: 20 }, (_, i) => compuesto(i + 1)))).toHaveLength(0);
  });

  it("C22 un ticket de 38 criterios con tres compuestos de dos afirmaciones da `mas_criterios_que_el_tope`", () => {
    const criterios = Array.from({ length: 38 }, (_, i) => (i < 3 ? compuesto(i + 1) : atomico(i + 1)));
    const hallazgos = revisar(criterios);
    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0]?.message).toContain("41 afirmaciones en 38 criterio(s)");
  });

  it("C23 un ticket de 40 criterios atómicos pasa el precheck sin `mas_criterios_que_el_tope`", () => {
    expect(revisar(Array.from({ length: 40 }, (_, i) => atomico(i + 1)))).toHaveLength(0);
  });

  it("C24 partir un criterio compuesto en atómicos deja igual el conteo del tope", () => {
    const junto = [compuesto(1), ...Array.from({ length: 39 }, (_, i) => atomico(i + 2))];
    const partido = [
      manual("El criterio número 1 se cumple en la pantalla."),
      manual("El criterio número 1 se cumple en el informe."),
      ...Array.from({ length: 39 }, (_, i) => atomico(i + 2)),
    ];
    const antes = revisar(junto);
    const despues = revisar(partido);
    expect(antes[0]?.message).toContain("41 afirmaciones");
    expect(despues[0]?.message).toContain("41 afirmaciones");
  });

  it("C25 el mensaje de `mas_criterios_que_el_tope` dice cuántas afirmaciones contó", () => {
    const [hallazgo] = revisar(Array.from({ length: 45 }, (_, i) => atomico(i + 1)));
    expect(hallazgo?.message).toContain("45 afirmaciones en 45 criterio(s)");
    expect(hallazgo?.message).toContain(`el tope de ${TOPE_DE_CRITERIOS}`);
  });
});
