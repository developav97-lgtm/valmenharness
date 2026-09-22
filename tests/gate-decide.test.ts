/**
 * Motor de decisión de gates.
 *
 * La prueba que más importa es la primera: **reproducir con la lógica pura el
 * resultado que Jev devolvió en una llamada real**. Si el motor no reproduce ese
 * veredicto, el diseño de gates automáticos está roto por mucho que los tests
 * de las partes pasen.
 *
 * Datos reales de `scripts/verify-jev.mjs`, ejecutado el 2026-09-21:
 *
 *   cubre_todos_los_criterios   0.760
 *   covers_all_criteria_en      0.760
 *   plan_menciona_kubernetes    0.010
 *   clasificacion               completa (confianza 1.000)
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_POLICY,
  type GatePolicy,
  type Proposition,
  type PropositionAnswer,
  GateDefinitionError,
  buildReceipt,
  decide,
  hashGate,
  hashState,
  stableStringify,
  summarizeReceipt,
  validatePolicy,
  weightedMean,
  withHumanDecision,
} from "../packages/gate/src/index.js";

// ── Datos reales de la llamada a Jev ────────────────────────────────────────

const REAL_PROPOSITIONS: Proposition[] = [
  {
    id: "cubre_todos_los_criterios",
    kind: "noul",
    instructions:
      "`plan` describe pasos que, si se ejecutan, satisfacen todos los criterios listados en `criterios`.",
    weight: 3,
  },
  {
    id: "covers_all_criteria_en",
    kind: "noul",
    instructions:
      "`plan` describes steps that satisfy every criterion listed in `criterios`.",
  },
  {
    id: "plan_menciona_kubernetes",
    kind: "noul",
    instructions: "`plan` menciona Kubernetes o despliegue en contenedores.",
    // Descriptiva: comprueba que el modelo discrimina, no es un criterio de
    // aprobación. Sin `verdict: false`, un plan que —correctamente— no menciona
    // Kubernetes bloquearía el gate por decir la verdad.
    verdict: false,
  },
  {
    id: "clasificacion",
    kind: "choice",
    instructions: "¿Cuál es el estado de la investigación?",
    criteria: {
      completa: "Identifica causa, archivos, flujo y riesgos.",
      falta_causa: "Describe el síntoma sin identificar la causa.",
    },
    effects: {
      completa: { outcome: "approve" },
      falta_causa: {
        outcome: "block",
        reason: "la investigación no identifica la causa",
      },
    },
  },
];

const REAL_ANSWERS: PropositionAnswer[] = [
  { id: "cubre_todos_los_criterios", kind: "noul", value: 0.76 },
  { id: "covers_all_criteria_en", kind: "noul", value: 0.76 },
  { id: "plan_menciona_kubernetes", kind: "noul", value: 0.01 },
  { id: "clasificacion", kind: "choice", choice: "completa", confidence: 1.0 },
];

// ── La prueba de realidad ───────────────────────────────────────────────────

describe("reproduce la llamada real a Jev", () => {
  const decision = decide(REAL_PROPOSITIONS, REAL_ANSWERS, DEFAULT_POLICY);

  it("el gate va a revisión humana, no aprueba", () => {
    // 0.760 cae entre blockAt (0.10) y approveAt (0.90). El plan del ejemplo
    // efectivamente no cubre los cuatro criterios que declara, así que la
    // respuesta correcta es que una persona mire.
    expect(decision.outcome).toBe("review");
  });

  it("identifica las proposiciones responsables", () => {
    expect(decision.inBand).toContain("cubre_todos_los_criterios");
    expect(decision.inBand).toContain("covers_all_criteria_en");
  });

  it("no bloquea: 0.760 no es un incumplimiento claro", () => {
    // La asimetría importa: bloquear exige certeza en contra. 0.76 es duda, no
    // negación, y la duda va a una persona.
    expect(decision.blocking).toEqual([]);
  });

  it("una proposición descriptiva no veta aunque su respuesta sea falsa", () => {
    const kubernetes = decision.propositions.find(
      (item) => item.id === "plan_menciona_kubernetes",
    );
    // El plan no menciona Kubernetes y el modelo respondió 0.01, que es la
    // respuesta correcta. Una proposición descriptiva se registra pero no veta:
    // si vetara, un hecho verdadero bloquearía el gate.
    expect(kubernetes?.value).toBe(0.01);
    expect(kubernetes?.verdict).toBe(false);
    expect(decision.outcome).toBe("review");
    expect(decision.blocking).toEqual([]);
  });

  it("sin la marca de descriptiva, la misma respuesta sí bloquearía", () => {
    // El contraste explica por qué la distinción es necesaria.
    const sinMarca = REAL_PROPOSITIONS.map((proposition) =>
      proposition.id === "plan_menciona_kubernetes"
        ? { ...proposition, verdict: true }
        : proposition,
    );
    expect(decide(sinMarca, REAL_ANSWERS, DEFAULT_POLICY).outcome).toBe(
      "block",
    );
  });

  it("explica el motivo con las probabilidades, no con una opinión", () => {
    expect(decision.reason).toContain("0.76");
    expect(decision.reason).toContain("banda de revisión");
  });
});

// ── Umbrales ────────────────────────────────────────────────────────────────

describe("umbrales", () => {
  const noul = (value: number): PropositionAnswer[] => [
    { id: "p", kind: "noul", value },
  ];
  const unaProposicion: Proposition[] = [
    { id: "p", kind: "noul", instructions: "x" },
  ];

  it("aprueba en o por encima del umbral", () => {
    expect(decide(unaProposicion, noul(0.9)).outcome).toBe("approve");
    expect(decide(unaProposicion, noul(0.99)).outcome).toBe("approve");
  });

  it("bloquea en o por debajo del umbral de bloqueo", () => {
    expect(decide(unaProposicion, noul(0.1)).outcome).toBe("block");
    expect(decide(unaProposicion, noul(0.0)).outcome).toBe("block");
  });

  it("manda a revisión la banda intermedia", () => {
    for (const value of [0.11, 0.5, 0.75, 0.89]) {
      expect(decide(unaProposicion, noul(value)).outcome, String(value)).toBe(
        "review",
      );
    }
  });

  it("rechaza una política sin banda de revisión", () => {
    // Sin separación, todo caso ambiguo se resolvería por un margen arbitrario
    // en vez de llegar a una persona.
    expect(() => validatePolicy({ approveAt: 0.5, blockAt: 0.5 })).toThrow(
      GateDefinitionError,
    );
    expect(() => validatePolicy({ approveAt: 0.3, blockAt: 0.7 })).toThrow(
      "sin separación no hay banda de revisión",
    );
  });

  it("rechaza umbrales fuera de [0,1]", () => {
    expect(() => validatePolicy({ approveAt: 1.5, blockAt: 0.1 })).toThrow(
      GateDefinitionError,
    );
    expect(() => validatePolicy({ approveAt: 0.9, blockAt: -0.1 })).toThrow(
      GateDefinitionError,
    );
  });
});

// ── La asimetría: un criterio en contra basta ───────────────────────────────

describe("la asimetría de la decisión", () => {
  const dos: Proposition[] = [
    { id: "a", kind: "noul", instructions: "a" },
    { id: "b", kind: "noul", instructions: "b" },
  ];

  it("un solo bloqueo decide el gate aunque todo lo demás apruebe", () => {
    const decision = decide(dos, [
      { id: "a", kind: "noul", value: 0.99 },
      { id: "b", kind: "noul", value: 0.02 },
    ]);
    expect(decision.outcome).toBe("block");
    expect(decision.blocking).toEqual(["b"]);
  });

  it("promediar no salva un criterio incumplido", () => {
    // Solo una de dos proposiciones falla, pero es suficiente. Un promedio
    // aprobaría, y aprobar con un criterio en contra no es aceptable.
    const decision = decide(
      dos,
      [
        { id: "a", kind: "noul", value: 1.0 },
        { id: "b", kind: "noul", value: 0.0 },
      ],
      { approveAt: 0.6, blockAt: 0.1 },
    );
    expect(decision.outcome).toBe("block");
    expect(weightedMean(decision).mean).toBeCloseTo(0.5, 5);
  });

  it("aprobar exige que todo esté claro", () => {
    const decision = decide(dos, [
      { id: "a", kind: "noul", value: 0.95 },
      { id: "b", kind: "noul", value: 0.92 },
    ]);
    expect(decision.outcome).toBe("approve");
    expect(decision.reason).toBe("todas las proposiciones claras");
  });
});

// ── Elecciones y efectos ────────────────────────────────────────────────────

describe("proposiciones de elección", () => {
  const eleccion: Proposition[] = [
    {
      id: "clasificacion",
      kind: "choice",
      instructions: "¿qué falta?",
      criteria: {
        completo: "nada",
        falta_alcance: "el alcance",
        falta_pruebas: "las pruebas",
      },
      effects: {
        completo: { outcome: "approve" },
        falta_alcance: {
          outcome: "block",
          reason: "el plan no cubre el alcance",
        },
        falta_pruebas: { outcome: "review" },
      },
    },
  ];

  it("aplica el efecto declarado de la opción", () => {
    expect(
      decide(eleccion, [
        { id: "clasificacion", kind: "choice", choice: "completo" },
      ]).outcome,
    ).toBe("approve");
    expect(
      decide(eleccion, [
        { id: "clasificacion", kind: "choice", choice: "falta_alcance" },
      ]).outcome,
    ).toBe("block");
    expect(
      decide(eleccion, [
        { id: "clasificacion", kind: "choice", choice: "falta_pruebas" },
      ]).outcome,
    ).toBe("review");
  });

  it("una opción sin efecto declarado va a revisión, no aprueba por omisión", () => {
    // Si el olvido de declarar un efecto aprobara, un gate mal escrito sería un
    // gate que deja pasar todo.
    const sinEfecto: Proposition[] = [
      {
        id: "clasificacion",
        kind: "choice",
        instructions: "x",
        criteria: { a: "uno", b: "dos" },
        effects: { a: { outcome: "approve" } },
      },
    ];
    const decision = decide(sinEfecto, [
      { id: "clasificacion", kind: "choice", choice: "b" },
    ]);
    expect(decision.outcome).toBe("review");
    expect(decision.reason).toContain("no declara efecto");
  });

  it("rechaza una opción que el gate no declaró", () => {
    expect(() =>
      decide(eleccion, [
        { id: "clasificacion", kind: "choice", choice: "inventada" },
      ]),
    ).toThrow("no está entre las declaradas");
  });
});

// ── Escalas ─────────────────────────────────────────────────────────────────

describe("proposiciones de escala", () => {
  const escala: Proposition[] = [
    {
      id: "riesgo",
      kind: "score",
      instructions: "riesgo del cambio",
      criteria: ["trivial", "bajo", "medio", "alto", "crítico"],
      levels: {
        0: { outcome: "approve" },
        1: { outcome: "approve" },
        2: { outcome: "review", reason: "riesgo medio: requiere revisión" },
        3: { outcome: "block", reason: "riesgo alto" },
        4: { outcome: "block", reason: "riesgo crítico" },
      },
    },
  ];

  it("usa el nivel correspondiente a la posición", () => {
    expect(
      decide(escala, [{ id: "riesgo", kind: "score", score: 1 }]).outcome,
    ).toBe("approve");
    expect(
      decide(escala, [{ id: "riesgo", kind: "score", score: 2 }]).outcome,
    ).toBe("review");
    expect(
      decide(escala, [{ id: "riesgo", kind: "score", score: 4 }]).outcome,
    ).toBe("block");
  });

  it("una posición entre dos niveles se juzga por el nivel inferior", () => {
    // Jev devuelve un número, no un índice: 2.4 es posible. Se lee con las
    // reglas del nivel 2, que es la lectura conservadora.
    expect(
      decide(escala, [{ id: "riesgo", kind: "score", score: 2.4 }]).outcome,
    ).toBe("review");
    // 3.9 se juzga como nivel 3 (bloquea), no como 4.
    const decision = decide(escala, [
      { id: "riesgo", kind: "score", score: 3.9 },
    ]);
    expect(decision.outcome).toBe("block");
    expect(decision.reason).toContain("riesgo alto");
  });
});

// ── Información incompleta ──────────────────────────────────────────────────

describe("información incompleta", () => {
  it("falla si el evaluador no respondió una proposición", () => {
    const propositions: Proposition[] = [
      { id: "a", kind: "noul", instructions: "a" },
      { id: "b", kind: "noul", instructions: "b" },
    ];
    // Un gate no puede decidir con información parcial: si faltara una respuesta
    // y se ignorara, el gate aprobaría sin haber evaluado todo.
    expect(() =>
      decide(propositions, [{ id: "a", kind: "noul", value: 0.99 }]),
    ).toThrow('El evaluador no respondió la proposición "b"');
  });

  it("rechaza una probabilidad fuera de rango", () => {
    const propositions: Proposition[] = [
      { id: "a", kind: "noul", instructions: "a" },
    ];
    expect(() =>
      decide(propositions, [{ id: "a", kind: "noul", value: 1.5 }]),
    ).toThrow(GateDefinitionError);
    // Una respuesta sin `value` es lo que el caso representa, y el contrato la
    // prohíbe: se construye con el tipo declarado y sin el campo, en vez de
    // escribirlo como `undefined`, que con `exactOptionalPropertyTypes` ni
    // siquiera es la misma cosa.
    const sinValor = [{ id: "a", kind: "noul" }] as unknown as PropositionAnswer[];
    expect(() => decide(propositions, sinValor)).toThrow(GateDefinitionError);
  });
});

// ── Recibos ─────────────────────────────────────────────────────────────────

describe("recibos", () => {
  const decision = decide(REAL_PROPOSITIONS, REAL_ANSWERS, DEFAULT_POLICY);
  const state = { solicitud: "…", plan: "…", criterios: "…" };

  const receipt = buildReceipt({
    id: "GR-20260921-0001",
    gate: "plan",
    propositions: REAL_PROPOSITIONS,
    policy: DEFAULT_POLICY,
    subject: {
      type: "ticket",
      id: "BUGFIX-POS-FILTRO-ORDENES-20260921",
      revision: "4",
    },
    decision,
    state,
    answers: REAL_ANSWERS,
    mechanicalChecks: [
      {
        id: "criterios_presentes",
        description: "hay criterios",
        result: "pass",
      },
    ],
    model: {
      provider: "openrouter",
      model: "typesafe/jev-1.13",
      resolvedVersion: "typesafe/jev-1.13-20260917",
    },
    usage: { inputTokens: 751, outputTokens: 115, costUsd: 0.000031542 },
    latencyMs: 777,
    decidedAt: "2026-09-21T15:04:22Z",
  });

  it("congela el contexto con un hash", () => {
    expect(receipt.stateHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("el hash del estado es estable ante el orden de las claves", () => {
    // Dos objetos con el mismo contenido construidos en distinto orden deben
    // producir el mismo hash; si no, la comparación entre máquinas fallaría.
    const a = { x: 1, y: { p: [1, 2], q: "z" } };
    const b = { y: { q: "z", p: [1, 2] }, x: 1 };
    expect(hashState(a)).toBe(hashState(b));
  });

  it("el hash del estado cambia si cambia el artefacto", () => {
    expect(hashState(state)).not.toBe(
      hashState({ ...state, plan: "otro plan" }),
    );
  });

  it("el hash del gate detecta que cambió el gate, no el artefacto", () => {
    // Sin este campo, un cambio de resultados sería ambiguo: ¿cambió el ticket
    // o cambió la definición del gate?
    const otro: Proposition[] = [
      { id: "p", kind: "noul", instructions: "distinta" },
    ];
    expect(hashGate(REAL_PROPOSITIONS, DEFAULT_POLICY)).not.toBe(
      hashGate(otro, DEFAULT_POLICY),
    );
    expect(hashGate(REAL_PROPOSITIONS, DEFAULT_POLICY)).toBe(
      hashGate(REAL_PROPOSITIONS, DEFAULT_POLICY),
    );
  });

  it("registra la versión concreta del modelo, no el alias", () => {
    expect(receipt.model?.resolvedVersion).toBe("typesafe/jev-1.13-20260917");
  });

  it("registra el coste medido", () => {
    expect(receipt.usage?.costUsd).toBe(0.000031542);
  });

  it("marca el escalado a humano cuando el resultado es revisión", () => {
    expect(receipt.escalatedTo).toBe("human");
    expect(receipt.humanDecision).toBeNull();
  });

  it("no escala cuando aprueba o bloquea", () => {
    const aprobado = buildReceipt({
      ...receipt,
      // El recibo guarda el **hash** del estado, no el estado: al reconstruir uno
      // hay que volver a pasarlo.
      state,
      id: "GR-0002",
      decision: decide(
        [{ id: "a", kind: "noul", instructions: "a" }],
        [{ id: "a", kind: "noul", value: 0.99 }],
      ),
      propositions: [{ id: "a", kind: "noul", instructions: "a" }],
      answers: [{ id: "a", kind: "noul", value: 0.99 }],
    });
    expect(aprobado.escalatedTo).toBeNull();
  });

  it("anexa la decisión humana sin borrar el veredicto del modelo", () => {
    // Saber que el modelo dudó y una persona aprobó es información, no ruido.
    const conHumano = withHumanDecision(receipt, {
      actor: "juanandrade",
      decision: "approve",
      reason: "El criterio faltante es de otro sprint.",
      channel: "telegram",
      decidedAt: "2026-09-21T15:10:00Z",
    });
    expect(conHumano.humanDecision?.decision).toBe("approve");
    expect(conHumano.outcome).toBe("review");
    expect(conHumano.reason).toContain("banda de revisión");
  });

  it("no admite dos decisiones humanas sobre el mismo recibo", () => {
    const una = withHumanDecision(receipt, {
      actor: "a",
      decision: "approve",
      reason: "r",
      channel: "cli",
      decidedAt: "2026-09-21T15:10:00Z",
    });
    expect(() =>
      withHumanDecision(una, {
        actor: "b",
        decision: "reject",
        reason: "r",
        channel: "cli",
        decidedAt: "2026-09-21T15:11:00Z",
      }),
    ).toThrow("ya tiene una decisión humana");
  });

  it("no admite decisión humana en un recibo que no se escaló", () => {
    const aprobado = buildReceipt({
      ...receipt,
      state,
      id: "GR-0003",
      decision: decide(
        [{ id: "a", kind: "noul", instructions: "a" }],
        [{ id: "a", kind: "noul", value: 0.99 }],
      ),
      propositions: [{ id: "a", kind: "noul", instructions: "a" }],
      answers: [{ id: "a", kind: "noul", value: 0.99 }],
    });
    expect(() =>
      withHumanDecision(aprobado, {
        actor: "a",
        decision: "approve",
        reason: "r",
        channel: "cli",
        decidedAt: "2026-09-21T15:10:00Z",
      }),
    ).toThrow("no fue escalado");
  });

  it("resume el recibo en una línea para el registro de actividad", () => {
    const linea = summarizeReceipt(receipt);
    expect(linea).toContain("plan");
    expect(linea).toContain("review");
    expect(linea).toContain("typesafe/jev-1.13-20260917");
    expect(linea).toContain("→ humano");
  });
});

describe("serialización estable", () => {
  it("ordena las claves y conserva el orden de los arreglos", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    // El orden de un arreglo es parte del contrato: el orden de las
    // proposiciones no puede cambiar el hash.
    expect(stableStringify([2, 1])).toBe("[2,1]");
    expect(stableStringify({ z: [1, 2], a: 1 })).toBe('{"a":1,"z":[1,2]}');
  });

  it("omite las claves indefinidas para que un campo ausente no cambie el hash", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});
