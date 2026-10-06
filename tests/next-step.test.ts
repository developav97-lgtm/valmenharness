/**
 * El siguiente paso de un ticket, calculado por el motor.
 *
 * Lo que protege, medido el 2026-10-05: una sesión que solo recibió «continúa con el
 * ticket X» fue directa a editar el código desde `intake` en una corrida, escribió el
 * diagnóstico y ofreció «avanzar los gates» en otra, y en ninguna cargó una skill ni
 * supo que el plan lo aprueba una persona. El proceso vivía en los prompts y no en el
 * harness. Estas pruebas fijan que `resume` lo dice: qué escribir, qué skill cargar,
 * qué compuerta correr y dónde detenerse.
 *
 * El texto no se compara entero —sería frágil y diría poco—: se comprueba lo que un
 * agente necesita encontrar en cada estado, y lo que **no** puede aparecer.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseTicket } from "../packages/core/src/index.js";
import {
  type NextStep,
  computeNextStep,
  renderNextStep,
} from "../packages/engine/src/next-step.js";
import { appendReceipt } from "../packages/engine/src/receipts.js";
import { buildResumeContext, renderResumeContext } from "../packages/engine/src/resume.js";
import { buildGateState } from "../packages/engine/src/state.js";
import { type GateReceipt, hashState } from "../packages/gate/src/receipt.js";
import { type FixtureTicketOptions, renderFixtureTicket } from "./helpers/fixtures.js";

const ID = "BUGFIX-POS-SIGUIENTE-20261005";

let root: string;
const paths = () => ({ root, ticketsDir: "tickets" });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-next-step-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Un ticket del fixture, ya analizado. */
function ticket(
  opciones: Partial<FixtureTicketOptions> = {},
): ReturnType<typeof parseTicket> {
  return parseTicket(renderFixtureTicket({ id: ID, ...opciones }));
}

/** El diagnóstico tal como lo deja la plantilla: solo rótulos, sin contenido. */
const DIAGNOSTICO_VACIO = [
  "- Archivos y flujo investigados:",
  "- Causa raíz o hipótesis:",
  "- Riesgos y compatibilidad:",
  "- Impactos de sync, migración, Docker o despliegue:",
].join("\n");

/** Un plan sin la línea de aprobación: lo que existe antes de que una persona apruebe. */
const PLAN_SIN_APROBACION = [
  "- Pasos ordenados:",
  "  1. Cambiar en `BackEnd/pos/filters.py` el `lookup_expr` de `exact` a `icontains`.",
  "  2. Añadir en `BackEnd/pos/tests/test_filters.py` una prueba de búsqueda parcial.",
  "- Rollback: revertir el cambio de una línea.",
].join("\n");

/** Criterios que sí declaran cómo se verifican. */
const CRITERIOS_CON_TEST =
  '- [ ] Buscar "104" devuelve la orden "1042".\n      <!-- test: node -e "process.exit(0)" -->';

interface OpcionesDeRecibo {
  readonly gate: string;
  readonly id?: string;
  readonly outcome?: "approve" | "review" | "block";
  readonly escalado?: boolean;
  readonly decision?: "approve" | "reject";
  readonly reason?: string;
  readonly stateHash?: string;
}

/** Un recibo de compuerta con lo mínimo que `next-step` mira. */
function recibo(opciones: OpcionesDeRecibo): GateReceipt {
  const { gate, id = `GR-2026-10-05-${ID}-${gate}-1`, outcome = "approve" } = opciones;
  return {
    kind: "gate-receipt",
    receiptVersion: 1,
    schemaVersion: "2",
    id,
    gate,
    gateHash: "sha256:test",
    subject: { type: "ticket", id: ID, revision: "1" },
    outcome,
    reason: opciones.reason ?? "motivo de prueba",
    actor: "model",
    decidedAt: "2026-10-05T12:00:00.000Z",
    stateHash: opciones.stateHash ?? "sha256:test",
    policy: { approveAt: 0.9, blockAt: 0.1 },
    mechanicalChecks: [],
    modelAnswers: [],
    propositions: [],
    model: null,
    usage: null,
    latencyMs: null,
    escalatedTo: opciones.escalado === true ? "human" : null,
    humanDecision:
      opciones.decision === undefined
        ? null
        : {
            actor: "Persona de prueba",
            decision: opciones.decision,
            reason: "decidido en la prueba",
            channel: "cli",
            decidedAt: "2026-10-05T13:00:00.000Z",
          },
  };
}

/** Todo el texto del paso, para buscar en él. */
function texto(paso: NextStep): string {
  return renderNextStep(paso).join("\n");
}

function siguiente(
  opciones: Partial<FixtureTicketOptions>,
  recibos: readonly GateReceipt[] = [],
): NextStep {
  return computeNextStep(paths(), ticket(opciones), recibos);
}

describe("intake: análisis, y nada de código", () => {
  it("sin diagnóstico: busca en la memoria, lee el código y escribe el diagnóstico en el ticket", () => {
    const paso = siguiente({ workflowStatus: "intake", diagnostico: DIAGNOSTICO_VACIO });
    const t = texto(paso);

    expect(paso.fase).toBe("análisis");
    expect(t).toContain("buscar_memoria");
    expect(t).toContain("Lee el código real");
    expect(t).toContain("`## Diagnóstico`");
    expect(t).toContain("ruta:línea");
    expect(t).toContain("`valmen validate --id " + ID + "`");
    // Escribir y mover van en llamadas separadas.
    expect(t).toContain("en una llamada aparte de la escritura");
    expect(t).toContain("`analyzed`");
  });

  it("no hay un alto: el análisis lo hace el agente", () => {
    const paso = siguiente({ workflowStatus: "intake", diagnostico: DIAGNOSTICO_VACIO });

    expect(paso.alto).toBeNull();
  });

  it("dice que no se toca el código de la aplicación mientras el ticket no esté aprobado", () => {
    const paso = siguiente({ workflowStatus: "intake", diagnostico: DIAGNOSTICO_VACIO });
    const t = texto(paso);

    expect(t).toMatch(/No hagas: editar el código de la aplicación/);
    expect(t).toContain("todavía no está aprobado");
    expect(t).toContain("no existe para el registro");
  });

  it("con el diagnóstico ya escrito, solo falta validar y mover a `analyzed`", () => {
    const paso = siguiente({ workflowStatus: "intake" });
    const t = texto(paso);

    expect(t).toContain("El diagnóstico ya está escrito");
    expect(t).toContain("`analyzed`");
    expect(t).not.toContain("Lee el código real");
  });
});

describe("analyzed: la compuerta de análisis", () => {
  it("sin recibo: evalúa `analysis`, sin elegir evaluador", () => {
    const t = texto(siguiente({ workflowStatus: "analyzed" }));

    expect(t).toContain("compuerta `analysis`");
    expect(t).toContain("valmen gate analysis --id " + ID);
    expect(t).toContain("sin elegir evaluador");
  });

  it("bloqueada: una sola pasada de mejora, sin perseguir el número", () => {
    const paso = siguiente({ workflowStatus: "analyzed" }, [
      recibo({
        gate: "analysis",
        outcome: "block",
        reason: "el diagnóstico no nombra archivos reales",
      }),
    ]);
    const t = texto(paso);

    expect(t).toContain("no pasó");
    expect(t).toContain("el diagnóstico no nombra archivos reales");
    expect(t).toContain("una sola pasada");
    expect(t).toContain("sin perseguir el número");
    expect(paso.alto).toBeNull();
  });

  it("bloqueada: dice cómo se autoriza seguir, porque el motor no deja avanzar sin esa decisión (R-CDEF-004)", () => {
    const sinDecision = texto(
      siguiente({ workflowStatus: "analyzed" }, [
        recibo({ gate: "analysis", outcome: "block" }),
      ]),
    );
    const rechazada = texto(
      siguiente({ workflowStatus: "analyzed" }, [
        recibo({ gate: "analysis", outcome: "approve", decision: "reject" }),
      ]),
    );

    expect(sinDecision).toContain("autoriza seguir pese al bloqueo");
    expect(sinDecision).toContain(
      "valmen gate-decide --id " + ID + " --receipt GR-2026-10-05-",
    );
    expect(sinDecision).toContain("`mover_ticket` a `planned`");
    expect(sinDecision).toContain("te delegó esa aprobación por escrito");
    // Con una decisión ya registrada no hay nada que autorizar: el comando fallaría.
    expect(rechazada).not.toContain("autoriza seguir pese al bloqueo");
  });

  it("escalada a una persona: se detiene, con el comando que registra la decisión", () => {
    const paso = siguiente({ workflowStatus: "analyzed" }, [
      recibo({ gate: "analysis", outcome: "approve", escalado: true }),
    ]);

    expect(paso.alto).not.toBeNull();
    expect(paso.pasos).toHaveLength(0);
    const t = texto(paso);
    expect(t).toContain("DETENTE AQUÍ");
    expect(t).toContain("valmen gate-decide --id " + ID + " --receipt GR-2026-10-05-");
    expect(t).toContain("--decision approve|reject");
    // La salvedad: solo una delegación escrita permite registrarla por su cuenta.
    expect(t).toContain("te delegó esa aprobación por escrito");
    expect(t).toContain("nunca se escribe como palabras suyas algo que no dijo");
  });

  it("un `review` sin escalar también espera a una persona", () => {
    const paso = siguiente({ workflowStatus: "analyzed" }, [
      recibo({ gate: "analysis", outcome: "review" }),
    ]);

    expect(paso.alto).not.toBeNull();
  });

  it("la decisión humana manda: aprobada, sigue al plan; rechazada, queda bloqueada", () => {
    const aprobada = siguiente({ workflowStatus: "analyzed" }, [
      recibo({ gate: "analysis", outcome: "review", escalado: true, decision: "approve" }),
    ]);
    const rechazada = siguiente({ workflowStatus: "analyzed" }, [
      recibo({ gate: "analysis", outcome: "approve", decision: "reject" }),
    ]);

    expect(aprobada.fase).toBe("plan");
    expect(rechazada.fase).toBe("compuerta de análisis");
    expect(texto(rechazada)).toContain("no pasó");
  });

  it("la decisión se anexa al registro como una línea nueva con el mismo id: gana la última", () => {
    // El registro es append-only: la decisión humana no reescribe el recibo, se anexa.
    const escalado = recibo({ gate: "analysis", outcome: "review", escalado: true });
    const decidido = {
      ...escalado,
      humanDecision: recibo({ gate: "analysis", decision: "approve" }).humanDecision,
    };

    const paso = siguiente({ workflowStatus: "analyzed" }, [escalado, decidido]);

    expect(paso.fase).toBe("plan");
  });

  it("aprobada: toca escribir el plan y los criterios con su comando de prueba", () => {
    const paso = siguiente({ workflowStatus: "analyzed" }, [
      recibo({ gate: "analysis", outcome: "approve" }),
    ]);
    const t = texto(paso);

    expect(paso.fase).toBe("plan");
    expect(t).toContain("`## Plan`");
    expect(t).toContain("`## Criterios de aceptación`");
    expect(t).toContain("<!-- test: <comando> -->");
    expect(t).toContain("<!-- verify: manual -->");
    expect(t).toContain(".valmen/config.yaml");
    expect(t).toContain("`planned`");
    expect(t).toContain("compuerta `plan`");
  });
});

describe("planned: la compuerta del plan y la aprobación de una persona", () => {
  it("sin recibo y con criterios sin verificación: primero los criterios", () => {
    // Los criterios por defecto del fixture no declaran test.
    const paso = siguiente({ workflowStatus: "planned" });
    const t = texto(paso);

    expect(t).toContain("Antes de evaluar: 4 criterio(s) no declaran cómo se verifican");
    expect(t).toContain("valmen gate plan --id " + ID);
  });

  it("sin recibo y sin criterios: lo dice", () => {
    const t = texto(siguiente({ workflowStatus: "planned", criterios: "" }));

    expect(t).toContain("no tiene criterios");
  });

  it("sin recibo y con los criterios en orden: solo evaluar", () => {
    const paso = siguiente({ workflowStatus: "planned", criterios: CRITERIOS_CON_TEST });

    expect(paso.pasos).toHaveLength(1);
    expect(texto(paso)).toContain("valmen gate plan --id " + ID);
  });

  it("bloqueada: corregir el plan en una pasada", () => {
    const t = texto(
      siguiente({ workflowStatus: "planned" }, [
        recibo({ gate: "plan", outcome: "block", reason: "el rollback no alcanza" }),
      ]),
    );

    expect(t).toContain("no pasó");
    expect(t).toContain("el rollback no alcanza");
    expect(t).toContain("una sola pasada");
  });

  it("bloqueada: dice cómo se autoriza seguir antes de pasar a approved (R-CDEF-004)", () => {
    const t = texto(
      siguiente({ workflowStatus: "planned" }, [
        recibo({ gate: "plan", outcome: "block" }),
      ]),
    );

    expect(t).toContain("autoriza seguir pese al bloqueo");
    expect(t).toContain("valmen gate-decide --id " + ID + " --receipt GR-2026-10-05-");
    expect(t).toContain("`mover_ticket` a `approved`");
  });

  it("escalada y sin la línea de aprobación: se detiene y dice la línea exacta, sin escribirla", () => {
    const paso = siguiente({ workflowStatus: "planned", plan: PLAN_SIN_APROBACION }, [
      recibo({ gate: "plan", outcome: "approve", escalado: true }),
    ]);
    const t = texto(paso);

    expect(paso.alto).not.toBeNull();
    expect(t).toContain("DETENTE AQUÍ");
    expect(t).toContain("la aprobación del plan es de una persona");
    expect(t).toContain(
      "- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan).",
    );
    expect(t).toContain("valmen gate-decide --id " + ID);
    expect(t).toContain("`approved`");
    expect(t).toContain("te delegó esa aprobación por escrito");
  });

  it("un ticket crítico dice que no admite «gate no exigible»", () => {
    const t = texto(
      siguiente({ workflowStatus: "planned", type: "FEATURE", plan: PLAN_SIN_APROBACION }, [
        recibo({ gate: "plan", outcome: "approve", escalado: true }),
      ]),
    );

    expect(t).toContain("exige esa aprobación explícita");
    expect(t).toContain("no admite");
  });

  it("uno que no es crítico no lleva esa advertencia", () => {
    const t = texto(
      siguiente({ workflowStatus: "planned", plan: PLAN_SIN_APROBACION }, [
        recibo({ gate: "plan", outcome: "approve", escalado: true }),
      ]),
    );

    expect(t).not.toContain("exige esa aprobación explícita");
  });

  it("la línea ya está pero falta registrar la decisión: lo dice, no la reescribe", () => {
    // El plan por defecto del fixture ya trae la línea de aprobación.
    const paso = siguiente({ workflowStatus: "planned" }, [
      recibo({ gate: "plan", outcome: "approve", escalado: true }),
    ]);
    const t = texto(paso);

    expect(paso.alto).not.toBeNull();
    expect(t).toContain("la línea de aprobación ya está en el plan");
    expect(t).toContain("no quedó registrada");
    expect(t).toContain("valmen gate-decide");
  });

  it("aprobada por una persona y con la línea puesta: solo mover a `approved`", () => {
    const paso = siguiente({ workflowStatus: "planned" }, [
      recibo({ gate: "plan", outcome: "review", escalado: true, decision: "approve" }),
    ]);

    expect(paso.alto).toBeNull();
    expect(texto(paso)).toContain("La aprobación del plan está registrada");
    expect(texto(paso)).toContain("`approved`");
  });

  it("aprobada pero sin la línea: se escribe solo si una persona la dio", () => {
    const t = texto(
      siguiente({ workflowStatus: "planned", plan: PLAN_SIN_APROBACION }, [
        recibo({ gate: "plan", outcome: "review", escalado: true, decision: "approve" }),
      ]),
    );

    expect(t).toContain("solo si una persona la dio");
    expect(t).toContain("aprobado explícitamente por el PO");
  });

  it("también aquí el código de la aplicación queda fuera", () => {
    const paso = siguiente({ workflowStatus: "planned" });

    expect(texto(paso)).toContain("No hagas: editar el código de la aplicación");
  });
});

describe("approved e in_progress: implementar el plan y verificarlo", () => {
  it("approved: mover a `in_progress` y trabajar solo el plan", () => {
    const paso = siguiente({ workflowStatus: "approved" });
    const t = texto(paso);

    expect(paso.fase).toBe("implementación");
    expect(t).toContain("`in_progress`");
    expect(t).toContain("solo el plan aprobado");
    expect(t).toContain("ampliar el alcance es una decisión de una persona");
    // Ya se puede tocar código: lo que no se hace es git ni salirse del alcance.
    expect(t).not.toContain("editar el código de la aplicación");
    expect(t).toContain("No hagas: commit, push, PR, tag ni despliegue");
  });

  it("in_progress sin verificación mecánica: implementar, correrla y entregar", () => {
    const t = texto(siguiente({ workflowStatus: "in_progress" }));

    expect(t).toContain("valmen gate qa-mechanical --id " + ID + " --evaluator command");
    expect(t).toContain("registrar_consumo_ia");
    expect(t).toContain("`awaiting_user_tests`");
  });

  it("una verificación que bloqueó: corregir y volver a correrla", () => {
    const t = texto(
      siguiente({ workflowStatus: "in_progress" }, [
        recibo({ gate: "qa-mechanical", outcome: "block", reason: "el criterio 2 falla" }),
      ]),
    );

    expect(t).toContain("bloqueó");
    expect(t).toContain("el criterio 2 falla");
  });

  it("un recibo anterior al último cambio no vale: lo que se probó no es lo que se entrega", () => {
    const t = texto(
      siguiente({ workflowStatus: "in_progress" }, [
        recibo({
          gate: "qa-mechanical",
          outcome: "approve",
          stateHash: "sha256:de-otro-momento",
        }),
      ]),
    );

    expect(t).toContain("anterior al último cambio");
    expect(t).toContain("lo que se probó no es lo que se entrega");
  });

  it("un recibo vigente que pasó: entregar", () => {
    const actual = ticket({ workflowStatus: "in_progress" });
    const vigente = recibo({
      gate: "qa-mechanical",
      outcome: "approve",
      stateHash: hashState(buildGateState(actual.text)),
    });

    const paso = computeNextStep(paths(), actual, [vigente]);

    expect(paso.fase).toBe("entrega");
    expect(texto(paso)).toContain("pasó sobre el estado actual");
    expect(texto(paso)).toContain("`awaiting_user_tests`");
  });

  it("changes_requested: atender el ciclo de QA y volver a `in_progress`", () => {
    const t = texto(siguiente({ workflowStatus: "changes_requested" }));

    expect(t).toContain("ciclo de QA cerrado");
    expect(t).toContain("`in_progress`");
  });
});

describe("los altos: lo que decide una persona no se supera", () => {
  it.each([
    ["awaiting_user_tests", "las pruebas y el QA son de una persona"],
    ["in_qa", "el QA está en manos de una persona"],
    ["closed", "reabrirlo"],
    ["blocked", "el ticket está bloqueado"],
  ])("%s se detiene", (estado, frase) => {
    const paso = siguiente({ workflowStatus: estado });

    expect(paso.alto).not.toBeNull();
    expect(texto(paso)).toContain("DETENTE AQUÍ");
    expect(texto(paso)).toContain(frase);
  });

  it("awaiting_user_tests pide entregar la evidencia y no mover el ticket", () => {
    const t = texto(siguiente({ workflowStatus: "awaiting_user_tests" }));

    expect(t).toContain("resumen de lo hecho");
    expect(t).toContain("no muevas el ticket");
  });

  it("qa_approved cierra, pero no publica la release", () => {
    const paso = siguiente({ workflowStatus: "qa_approved" });
    const t = texto(paso);

    expect(paso.alto).toBeNull();
    expect(t).toContain("preparar_cierre");
    expect(t).toContain("`closed`");
    expect(t).toContain("cerrar no es publicar");
  });

  it("los estados donde el agente trabaja no declaran un alto", () => {
    for (const estado of ["intake", "approved", "in_progress", "changes_requested"]) {
      expect(
        siguiente({ workflowStatus: estado, diagnostico: DIAGNOSTICO_VACIO }).alto,
        estado,
      ).toBeNull();
    }
  });
});

describe("las skills: las del harness que el proyecto tiene, y las de dominio", () => {
  function skill(id: string): void {
    const directorio = join(root, ".valmen", "skills", id);
    mkdirSync(directorio, { recursive: true });
    writeFileSync(join(directorio, "SKILL.md"), `---\nname: ${id}\n---\n`, "utf8");
  }

  it("sin skills en el proyecto no se nombra ninguna", () => {
    const paso = siguiente({ workflowStatus: "intake", diagnostico: DIAGNOSTICO_VACIO });

    expect(paso.skills).toEqual([]);
    expect(paso.skillsDeDominio).toBe(false);
    expect(texto(paso)).not.toContain("Carga antes");
  });

  it("el análisis y el plan cargan `planificacion`", () => {
    skill("planificacion");

    expect(
      siguiente({ workflowStatus: "intake", diagnostico: DIAGNOSTICO_VACIO }).skills,
    ).toEqual(["planificacion"]);
    expect(
      siguiente({ workflowStatus: "analyzed" }, [recibo({ gate: "analysis" })]).skills,
    ).toEqual(["planificacion"]);
  });

  it("la implementación carga `pruebas-unitarias` y la entrega suma `revision-final`", () => {
    skill("pruebas-unitarias");
    skill("revision-final");

    expect(siguiente({ workflowStatus: "approved" }).skills).toEqual(["pruebas-unitarias"]);
    expect(siguiente({ workflowStatus: "in_progress" }).skills).toEqual([
      "revision-final",
      "pruebas-unitarias",
    ]);
  });

  it("una skill propia del proyecto se ofrece como de dominio, sin nombrarla", () => {
    skill("planificacion");
    skill("desarrollo-de-algo");

    const paso = siguiente({ workflowStatus: "intake", diagnostico: DIAGNOSTICO_VACIO });
    const t = texto(paso);

    expect(paso.skillsDeDominio).toBe(true);
    expect(t).toContain("`planificacion`");
    expect(t).toContain("las skills de dominio del proyecto");
    // El harness no sabe cuál aplica a este ticket: la elige el agente.
    expect(t).not.toContain("desarrollo-de-algo");
  });

  it("un estado de espera no pide cargar nada", () => {
    skill("planificacion");
    skill("desarrollo-de-algo");

    expect(texto(siguiente({ workflowStatus: "awaiting_user_tests" }))).not.toContain(
      "Carga antes",
    );
  });
});

describe("la forma del texto", () => {
  it("empieza con la fase y numera los pasos", () => {
    const lineas = renderNextStep(
      siguiente({ workflowStatus: "intake", diagnostico: DIAGNOSTICO_VACIO }),
    );

    expect(lineas[0]).toBe("Siguiente paso — análisis:");
    expect(lineas[1]).toMatch(/^ {2}1\. /);
    expect(lineas[2]).toMatch(/^ {2}2\. /);
  });

  it("es determinista: el mismo ticket da el mismo texto", () => {
    const a = texto(siguiente({ workflowStatus: "planned" }));
    const b = texto(siguiente({ workflowStatus: "planned" }));

    expect(a).toBe(b);
  });

  it("no nombra ninguna tecnología ni ruta del proyecto en ningún estado", () => {
    // Es del harness y sirve a cualquier proyecto: el stack sale de las reglas del
    // proyecto, no de aquí. Mismo criterio que las skills publicadas.
    const prohibidas =
      /django|angular|react|python|typescript|postgres|node\.js|kubernetes/i;
    const estados = [
      "intake",
      "analyzed",
      "planned",
      "approved",
      "in_progress",
      "awaiting_user_tests",
      "in_qa",
      "changes_requested",
      "qa_approved",
      "closed",
      "blocked",
    ];

    for (const estado of estados) {
      expect(texto(siguiente({ workflowStatus: estado })), estado).not.toMatch(prohibidas);
    }
  });
});

describe("integrado en `resume`", () => {
  it("el contexto trae el siguiente paso, también para el MCP", () => {
    const actual = ticket({ workflowStatus: "intake", diagnostico: DIAGNOSTICO_VACIO });

    const contexto = buildResumeContext(paths(), actual);

    expect(contexto.nextStep.fase).toBe("análisis");
    expect(contexto.nextStep.pasos.length).toBeGreaterThan(0);
  });

  it("se imprime debajo del estado y antes del plan, que puede ser largo", () => {
    const actual = ticket({ workflowStatus: "intake", diagnostico: DIAGNOSTICO_VACIO });

    const salida = renderResumeContext(buildResumeContext(paths(), actual));

    const estado = salida.indexOf("Estado: intake");
    const paso = salida.indexOf("Siguiente paso — análisis:");
    const plan = salida.indexOf("Plan vigente:");
    expect(estado).toBeGreaterThanOrEqual(0);
    expect(paso).toBeGreaterThan(estado);
    expect(plan).toBeGreaterThan(paso);
  });

  it("lee los recibos del disco: un plan escalado a una persona detiene el resumen", () => {
    const actual = ticket({ workflowStatus: "planned", plan: PLAN_SIN_APROBACION });
    appendReceipt(
      paths(),
      ID,
      recibo({ gate: "plan", outcome: "approve", escalado: true }),
    );

    const salida = renderResumeContext(buildResumeContext(paths(), actual));

    expect(salida).toContain("DETENTE AQUÍ: la aprobación del plan es de una persona");
  });

  it("el modo completo conserva el documento y el siguiente paso viaja en los datos", () => {
    const actual = ticket({ workflowStatus: "approved" });

    const contexto = buildResumeContext(paths(), actual, "completo");

    expect(renderResumeContext(contexto)).toBe(actual.text);
    expect(contexto.nextStep.fase).toBe("implementación");
  });
});
