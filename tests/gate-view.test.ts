/**
 * La pantalla de gates de Mission Control.
 *
 * Es la parte de la interfaz donde el harness deja de registrar y empieza a
 * decidir, así que es donde una mentira cuesta más. Lo que estos tests
 * protegen:
 *
 * 1. **Lo que se muestra es lo que decidió el motor.** El informe que devuelve
 *    la API tiene que ser el mismo texto que imprime `valmen gate`, y el recibo
 *    tiene que ser el mismo que se anexa a disco. Si el botón y el comando
 *    pudieran divergir, la pantalla sería una comodidad y no una interfaz.
 * 2. **Una aprobación de otro artefacto se marca.** El recibo guarda el hash de
 *    lo que vio el evaluador; si el ticket cambió, la decisión es de otro
 *    ticket. Mostrarla como vigente es el error más caro posible aquí.
 * 3. **La decisión humana se anexa, no reescribe.** Que el modelo dudara y una
 *    persona aprobara es el dato que permite calibrar el gate; perderlo
 *    eliminaría la razón de tener recibos.
 * 4. **Aprobar no avanza el ticket.** Un gate no cambia estados.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { JevEvaluation } from "../packages/gate-jev/src/index.js";
import {
  listGateCards,
  listGateDecisions,
  recordHumanDecision,
  runTicketGate,
} from "../packages/server/src/gates.js";
import { handleApi } from "../packages/server/src/server.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";

let lab: string;

const PATHS = (): { root: string; ticketsDir: string } => ({
  root: lab,
  ticketsDir: "tickets",
});

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-gate-view-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });
  writeFixtureTicket(lab, { id: TICKET });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

/**
 * Un evaluador simulado: sin red y con probabilidades decididas por el test.
 *
 * Respeta el tipo de cada proposición. Un mock que respondiera todo como `noul`
 * haría fallar el gate por contrato —una proposición de elección exige una
 * opción— y el test estaría midiendo el mock, no el flujo.
 */
function evaluator(
  criteriaValue: number,
): typeof import("../packages/gate-jev/src/index.js").evaluateWithJev {
  return (async (options: {
    propositions?: readonly {
      id: string;
      kind?: string;
      criteria?: Readonly<Record<string, string>> | readonly string[];
    }[];
  }) => {
    const answers = (options?.propositions ?? []).map((proposition) => {
      if (proposition.kind === "choice") {
        const opciones = Object.keys(proposition.criteria ?? {});
        return {
          id: proposition.id,
          kind: "choice" as const,
          choice: opciones[0] as string,
          confidence: 0.95,
        };
      }
      if (proposition.kind === "score") {
        return { id: proposition.id, kind: "score" as const, score: 0 };
      }
      return {
        id: proposition.id,
        kind: "noul" as const,
        value: criteriaValue,
      };
    });
    return {
      answers,
      model: {
        provider: "openrouter",
        model: "typesafe/jev-1.13",
        resolvedVersion: "typesafe/jev-1.13-20260917",
      },
      usage: { inputTokens: 751, outputTokens: 115, costUsd: 0.000031542 },
      latencyMs: 777,
    } as JevEvaluation;
  }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;
}

/** El contexto que usan los handlers de la API. */
function context() {
  return {
    root: lab,
    paths: PATHS(),
    credentialsFile: join(lab, ".valmen", ".credentials.yaml"),
    env: {},
  };
}

// ── Disponibilidad ──────────────────────────────────────────────────────────

describe("qué gates aplican a un ticket", () => {
  it("solo marca como aplicable el que corresponde al estado", () => {
    const tarjetas = listGateCards(PATHS(), TICKET);
    expect(tarjetas).not.toBeNull();

    const plan = tarjetas?.find((tarjeta) => tarjeta.id === "plan");
    const analisis = tarjetas?.find((tarjeta) => tarjeta.id === "analysis");

    // El ticket del laboratorio está en `planned`.
    expect(plan?.applies).toBe(true);
    expect(analisis?.applies).toBe(false);
    expect(analisis?.workflowStatus).toBe("planned");
    expect(analisis?.appliesTo).toEqual(["analyzed"]);
  });

  it("muestra los checks mecánicos antes de gastar una llamada", () => {
    const tarjetas = listGateCards(PATHS(), TICKET);
    const plan = tarjetas?.find((tarjeta) => tarjeta.id === "plan");

    // El ticket del laboratorio declara cuatro criterios y es de riesgo normal.
    expect(plan?.blockedByCode).toBe(false);
    expect(
      plan?.mechanicalChecks.find((check) => check.id === "criterios_presentes")?.result,
    ).toBe("pass");
  });

  it("avisa cuando el código ya sabe que el gate va a bloquear", () => {
    writeFixtureTicket(lab, { id: TICKET, riskLevel: "critical" });
    const ticketPath = join(lab, "tickets", "2026", TICKET, "ticket.md");
    // Se quitan las dos palabras que el check reconoce como rollback declarado.
    writeFileSync(
      ticketPath,
      readFileSync(ticketPath, "utf8").replace(/rollback|revertir/gi, "deshacer"),
      "utf8",
    );

    const plan = listGateCards(PATHS(), TICKET)?.find((tarjeta) => tarjeta.id === "plan");
    expect(plan?.blockedByCode).toBe(true);
  });

  it("cuenta las proposiciones contando la expansión por criterio", () => {
    const plan = listGateCards(PATHS(), TICKET)?.find((tarjeta) => tarjeta.id === "plan");
    // Cuatro criterios de aceptación en el ticket del laboratorio, más las
    // proposiciones fijas del gate.
    expect(plan?.propositionCount).toBeGreaterThan(4);
  });

  it("devuelve null si el ticket no existe", () => {
    expect(listGateCards(PATHS(), "NO-EXISTE-20260921")).toBeNull();
  });
});

// ── Ejecución ───────────────────────────────────────────────────────────────

describe("ejecutar un gate desde la interfaz", () => {
  it("devuelve el mismo informe que imprime el CLI", async () => {
    const resultado = await runTicketGate(PATHS(), TICKET, "plan", {
      jev: evaluator(0.95),
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.exitCode).toBe(0);
    // El informe es literalmente el del comando, no una segunda versión.
    expect(resultado.report).toContain("Gate plan — " + TICKET);
    expect(resultado.report).toContain("RESULTADO: APPROVE");
    expect(resultado.report).toContain("Checks mecánicos (código, sin coste)");
  });

  it("anexa el recibo y lo proyecta con sus probabilidades", async () => {
    const resultado = await runTicketGate(PATHS(), TICKET, "plan", {
      jev: evaluator(0.95),
    });

    const recibo = resultado.receipt;
    expect(recibo?.outcome).toBe("approve");
    expect(recibo?.propositions.length).toBeGreaterThan(4);
    // Cada proposición llega con el número que se comparó contra los umbrales y
    // con la marca que la interfaz muestra, decidida aquí.
    for (const proposicion of recibo?.propositions ?? []) {
      expect(typeof proposicion.value).toBe("number");
      expect(["approve", "block", "review", "descriptive"]).toContain(proposicion.mark);
    }
    expect(recibo?.model?.resolvedVersion).toBe("typesafe/jev-1.13-20260917");
    expect(recibo?.usage?.costUsd).toBeCloseTo(0.000031542, 9);
    expect(recibo?.stale).toBe(false);
  });

  it("deja el recibo en disco, en el mismo sitio que el CLI", async () => {
    await runTicketGate(PATHS(), TICKET, "plan", { jev: evaluator(0.95) });
    const path = join(lab, ".valmen", "receipts", `${TICKET}.jsonl`);
    const lineas = readFileSync(path, "utf8").trim().split("\n");
    expect(lineas).toHaveLength(1);
    expect(JSON.parse(lineas[0] as string).gate).toBe("plan");
  });

  it("marca el recibo como obsoleto cuando el ticket cambia", async () => {
    await runTicketGate(PATHS(), TICKET, "plan", { jev: evaluator(0.95) });
    expect(listGateDecisions(PATHS(), TICKET)[0]?.stale).toBe(false);

    const ticketPath = join(lab, "tickets", "2026", TICKET, "ticket.md");
    writeFileSync(
      ticketPath,
      readFileSync(ticketPath, "utf8").replace(
        "El filtro de órdenes del POS no encuentra",
        "El filtro de órdenes del POS tampoco encuentra",
      ),
      "utf8",
    );

    const vigente = listGateDecisions(PATHS(), TICKET)[0];
    expect(vigente?.stale).toBe(true);
    // El hash guardado no se toca: sigue siendo el de lo que vio el evaluador.
    expect(vigente?.stateHash).not.toBe("");
  });

  it("un bloqueo por checks mecánicos no emite recibo y explica el motivo", async () => {
    writeFixtureTicket(lab, { id: TICKET, riskLevel: "critical" });
    const ticketPath = join(lab, "tickets", "2026", TICKET, "ticket.md");
    writeFileSync(
      ticketPath,
      readFileSync(ticketPath, "utf8").replace(/rollback|revertir/gi, "deshacer"),
      "utf8",
    );

    const resultado = await runTicketGate(PATHS(), TICKET, "plan", {
      jev: evaluator(0.95),
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.receipt).toBeNull();
    expect(resultado.error).toContain("rollback_si_critico");
    expect(resultado.error).toContain("No se llamó al evaluador");
  });

  it("un fallo del evaluador no devuelve el recibo anterior como si fuera nuevo", async () => {
    // Primero una evaluación que sí decide y escribe recibo.
    const primera = await runTicketGate(PATHS(), TICKET, "plan", {
      jev: evaluator(0.95),
    });
    expect(primera.ok).toBe(true);
    expect(primera.receipt?.outcome).toBe("approve");

    // Después una que falla. El identificador de un recibo es determinista por
    // día y gate, así que "el último recibo del gate" es el de antes: devolverlo
    // mostraría una aprobación vieja como recién emitida.
    const fallida = await runTicketGate(PATHS(), TICKET, "plan", {
      jev: (async () => {
        throw new Error("el proveedor no responde");
      }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev,
    });

    expect(fallida.ok).toBe(false);
    expect(fallida.receipt).toBeNull();
    expect(fallida.error).toContain("no pudo completar");
  });

  it("no evalúa un gate que no aplica al estado del ticket", async () => {
    const resultado = await runTicketGate(PATHS(), TICKET, "analysis", {
      jev: evaluator(0.95),
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toContain("veredicto sin significado");
  });

  it("el evaluador determinista no gasta una llamada", async () => {
    let llamado = false;
    const espia = (async () => {
      llamado = true;
      throw new Error("no debería llamarse");
    }) as unknown as typeof import("../packages/gate-jev/src/index.js").evaluateWithJev;

    await runTicketGate(PATHS(), TICKET, "plan", {
      evaluator: "command",
      jev: espia,
    });
    expect(llamado).toBe(false);
  });
});

// ── Decisión humana ─────────────────────────────────────────────────────────

describe("la decisión humana", () => {
  /** Ejecuta el gate con un evaluador que duda, para forzar la revisión. */
  async function enRevision(): Promise<string> {
    const resultado = await runTicketGate(PATHS(), TICKET, "plan", {
      jev: evaluator(0.5),
    });
    expect(resultado.receipt?.outcome).toBe("review");
    expect(resultado.receipt?.escalatedTo).toBe("human");
    return resultado.receipt?.receiptId as string;
  }

  it("se anexa como línea nueva y no reescribe el veredicto del modelo", async () => {
    const receiptId = await enRevision();
    const antes = readFileSync(join(lab, ".valmen", "receipts", `${TICKET}.jsonl`), "utf8")
      .trim()
      .split("\n");
    expect(antes).toHaveLength(1);

    const resultado = recordHumanDecision(PATHS(), TICKET, receiptId, {
      decision: "approve",
      actor: "Juan Andrade",
      reason: "El plan cubre los cuatro criterios y el rollback es de una línea.",
    });
    expect(resultado.ok).toBe(true);
    expect(resultado.receipt?.humanDecision?.actor).toBe("Juan Andrade");

    const despues = readFileSync(
      join(lab, ".valmen", "receipts", `${TICKET}.jsonl`),
      "utf8",
    )
      .trim()
      .split("\n");
    // Dos líneas: el veredicto del evaluador intacto y la decisión encima.
    expect(despues).toHaveLength(2);
    expect(JSON.parse(despues[0] as string).humanDecision).toBeNull();
    expect(JSON.parse(despues[0] as string).outcome).toBe("review");
    expect(JSON.parse(despues[1] as string).humanDecision.decision).toBe("approve");
  });

  it("la versión vigente del recibo es la que tiene la decisión", async () => {
    const receiptId = await enRevision();
    recordHumanDecision(PATHS(), TICKET, receiptId, {
      decision: "reject",
      actor: "Juan Andrade",
      reason: "Falta el criterio de compatibilidad hacia atrás.",
    });

    const vigentes = listGateDecisions(PATHS(), TICKET);
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0]?.receiptId).toBe(receiptId);
    expect(vigentes[0]?.humanDecision?.decision).toBe("reject");
    // El veredicto del modelo sigue visible: se anexa, no se sustituye.
    expect(vigentes[0]?.outcome).toBe("review");
  });

  it("no admite una segunda decisión sobre el mismo recibo", async () => {
    const receiptId = await enRevision();
    recordHumanDecision(PATHS(), TICKET, receiptId, {
      decision: "approve",
      actor: "Juan Andrade",
      reason: "Primera.",
    });

    const segunda = recordHumanDecision(PATHS(), TICKET, receiptId, {
      decision: "reject",
      actor: "Otra persona",
      reason: "Segunda.",
    });
    expect(segunda.ok).toBe(false);
    expect(segunda.error).toContain("ya tiene una decisión humana");
  });

  it("no admite una decisión sobre un gate que no fue escalado", async () => {
    const resultado = await runTicketGate(PATHS(), TICKET, "plan", {
      jev: evaluator(0.95),
    });
    const receiptId = resultado.receipt?.receiptId as string;

    const decision = recordHumanDecision(PATHS(), TICKET, receiptId, {
      decision: "reject",
      actor: "Juan Andrade",
      reason: "No.",
    });
    expect(decision.ok).toBe(false);
    expect(decision.error).toContain("no fue escalado");
  });

  it("exige un responsable", async () => {
    const receiptId = await enRevision();
    const decision = recordHumanDecision(PATHS(), TICKET, receiptId, {
      decision: "approve",
      actor: "   ",
      reason: "Sin responsable.",
    });
    expect(decision.ok).toBe(false);
    expect(decision.error).toContain("responsable");
  });

  it("aprobar no avanza el ticket: el estado sigue siendo el mismo", async () => {
    const receiptId = await enRevision();
    recordHumanDecision(PATHS(), TICKET, receiptId, {
      decision: "approve",
      actor: "Juan Andrade",
      reason: "Aprobado.",
    });

    const ticket = readFileSync(join(lab, "tickets", "2026", TICKET, "ticket.md"), "utf8");
    expect(ticket).toContain("workflow_status: planned");
  });

  it("no admite una decisión sobre un recibo inexistente", () => {
    const decision = recordHumanDecision(PATHS(), TICKET, "GR-INVENTADO", {
      decision: "approve",
      actor: "Juan Andrade",
      reason: "No existe.",
    });
    expect(decision.ok).toBe(false);
    expect(decision.error).toContain("No existe el recibo");
  });
});

// ── API ─────────────────────────────────────────────────────────────────────

describe("la API de gates", () => {
  it("lista los gates y los recibos del ticket", async () => {
    const respuesta = await handleApi("GET", `/api/tickets/${TICKET}/gates`, {}, context());
    expect(respuesta.status).toBe(200);
    const cuerpo = respuesta.body as {
      gates: { id: string }[];
      decisions: unknown[];
    };
    expect(cuerpo.gates.map((gate) => gate.id).sort()).toEqual(["analysis", "plan"]);
    expect(cuerpo.decisions).toEqual([]);
  });

  it("devuelve 404 si el ticket no existe", async () => {
    const respuesta = await handleApi(
      "GET",
      "/api/tickets/NO-EXISTE-20260921/gates",
      {},
      context(),
    );
    expect(respuesta.status).toBe(404);
  });

  it("ejecuta un gate con el evaluador inyectado", async () => {
    const respuesta = await handleApi(
      "POST",
      `/api/tickets/${TICKET}/gates/plan/run`,
      { evaluator: "auto" },
      { ...context(), jev: evaluator(0.95) },
    );
    expect(respuesta.status).toBe(200);
    const cuerpo = respuesta.body as {
      ok: boolean;
      report: string;
      receipt: { outcome: string };
    };
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.receipt.outcome).toBe("approve");
    expect(cuerpo.report).toContain("RESULTADO: APPROVE");
  });

  it("rechaza un evaluador desconocido", async () => {
    const respuesta = await handleApi(
      "POST",
      `/api/tickets/${TICKET}/gates/plan/run`,
      { evaluator: "adivino" },
      context(),
    );
    expect(respuesta.status).toBe(400);
  });

  it("registra una decisión humana y la deja en el recibo", async () => {
    const ejecucion = await handleApi(
      "POST",
      `/api/tickets/${TICKET}/gates/plan/run`,
      {},
      { ...context(), jev: evaluator(0.5) },
    );
    const recibo = (ejecucion.body as { receipt: { receiptId: string; outcome: string } })
      .receipt;
    expect(recibo.outcome).toBe("review");

    const decision = await handleApi(
      "POST",
      `/api/tickets/${TICKET}/gates/${recibo.receiptId}/decision`,
      {
        decision: "approve",
        actor: "Juan Andrade",
        reason: "Revisado a mano.",
      },
      context(),
    );
    expect(decision.status).toBe(200);
    expect(
      (decision.body as { receipt: { humanDecision: { actor: string } } }).receipt
        .humanDecision.actor,
    ).toBe("Juan Andrade");
  });

  it("rechaza una decisión sin responsable", async () => {
    const respuesta = await handleApi(
      "POST",
      `/api/tickets/${TICKET}/gates/GR-1/decision`,
      { decision: "approve" },
      context(),
    );
    expect(respuesta.status).toBe(400);
  });

  it("rechaza una decisión que no es aprobar ni rechazar", async () => {
    const respuesta = await handleApi(
      "POST",
      `/api/tickets/${TICKET}/gates/GR-1/decision`,
      { decision: "quizá", actor: "Juan Andrade" },
      context(),
    );
    expect(respuesta.status).toBe(400);
  });

  it("devuelve 409 cuando el motor no admite la decisión", async () => {
    const respuesta = await handleApi(
      "POST",
      `/api/tickets/${TICKET}/gates/GR-INVENTADO/decision`,
      { decision: "approve", actor: "Juan Andrade", reason: "" },
      context(),
    );
    expect(respuesta.status).toBe(409);
  });
});

// ── El registro adoptado ────────────────────────────────────────────────────

describe("un proyecto con el registro en docs/tickets", () => {
  it("la interfaz encuentra el registro sin que nadie pase una bandera", async () => {
    // Un proyecto adoptado no migra su registro para usar el harness. Si la
    // interfaz asumiera `tickets/`, mostraría el registro vacío —la peor forma
    // de fallar, porque parece que no hay nada que hacer.
    const adoptado = mkdtempSync(join(tmpdir(), "valmen-adoptado-"));
    mkdirSync(join(adoptado, "tickets"), { recursive: true });
    writeFixtureTicket(adoptado, { id: TICKET });
    mkdirSync(join(adoptado, "docs"), { recursive: true });
    // El registro se mueve a la ubicación del layout anterior.
    const { renameSync } = await import("node:fs");
    renameSync(join(adoptado, "tickets"), join(adoptado, "docs", "tickets"));

    try {
      const respuesta = await handleApi(
        "GET",
        "/api/tickets",
        {},
        {
          root: adoptado,
          credentialsFile: join(adoptado, ".valmen", ".credentials.yaml"),
          env: {},
        },
      );
      expect(respuesta.status).toBe(200);
      expect((respuesta.body as { summary: { total: number } }).summary.total).toBe(1);

      const tarjetas = await handleApi(
        "GET",
        `/api/tickets/${TICKET}/gates`,
        {},
        {
          root: adoptado,
          credentialsFile: join(adoptado, ".valmen", ".credentials.yaml"),
          env: {},
        },
      );
      expect(tarjetas.status).toBe(200);
      const plan = (
        tarjetas.body as { gates: { id: string; applies: boolean }[] }
      ).gates.find((gate) => gate.id === "plan");
      expect(plan?.applies).toBe(true);
    } finally {
      rmSync(adoptado, { recursive: true, force: true });
    }
  });
});

describe("la credencial de un gate sale del archivo del servidor", () => {
  /**
   * El fallo que esto fija: la evaluación de un gate resolvía la clave del
   * `$HOME`, no del archivo que el servidor tiene configurado. Un harness
   * apuntando a otro archivo evaluaba con **la clave del usuario que corriera el
   * servidor**, y sin decirlo.
   *
   * Es el mismo fallo que tenía el chat, y se arregla en el mismo sitio: en el
   * borde, donde el archivo se conoce.
   */
  it("usa la clave del archivo indicado", async () => {
    const dir = mkdtempSync(join(tmpdir(), "valmen-cred-gate-"));
    const archivo = join(dir, ".credentials.yaml");
    writeFileSync(
      archivo,
      [
        "version: 1",
        "providers:",
        "  openrouter:",
        '    api-key: "sk-or-v1-la-del-servidor"',
        "",
      ].join("\n"),
      { mode: 0o600 },
    );

    const { apiKeyWithPrecedence } =
      await import("../packages/credentials/src/credentials.js");
    // El archivo del servidor gana sobre el del `$HOME`, que es el fallo.
    expect(apiKeyWithPrecedence("openrouter", archivo, {})).toBe(
      "sk-or-v1-la-del-servidor",
    );
    // Y la variable de entorno sigue ganando sobre el archivo, como siempre.
    expect(
      apiKeyWithPrecedence("openrouter", archivo, { OPENROUTER_API_KEY: "sk-de-entorno" }),
    ).toBe("sk-de-entorno");
    // Sin archivo, no hay clave: quien llama decide qué hacer.
    expect(apiKeyWithPrecedence("openrouter", undefined, {})).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it("no inventa una clave para un proveedor que no está en el archivo", async () => {
    const { apiKeyFromText } = await import("../packages/credentials/src/credentials.js");
    expect(
      apiKeyFromText("providers:\n  deepseek:\n    api-key: sk-otra\n", "openrouter"),
    ).toBeNull();
  });

  it("rechaza un nombre de variable pegado por descuido", async () => {
    // Mandarlo daría un 401 que no explica que el problema es el valor.
    const { apiKeyFromText } = await import("../packages/credentials/src/credentials.js");
    expect(
      apiKeyFromText(
        "providers:\n  openrouter:\n    api-key: OPENROUTER_API_KEY\n",
        "openrouter",
      ),
    ).toBeNull();
  });
});
