/**
 * El agente revisor de un `review` (R-APRO-003, FEATURE-ADAPTER-AGENTE-REVISOR-20261007).
 *
 * Lo que se afirma es lo que cambia de confianza: que el revisor sea un modelo **distinto**
 * del que produjo el artefacto (y que, si no se puede garantizar, no se llame al modelo), que
 * solo vea lo que quedó en duda, que una respuesta fuera del esquema no se lea como aprobación
 * y que todo el camino sea de solo lectura. La red y el CLI de Claude son los únicos límites
 * externos que se simulan: el registro, los recibos y el enrutado son los reales.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PERFILES_INCORPORADOS,
  PRESETS,
  modeloDelRevisor,
  normalizarModelo,
  resolveRouting,
  rutasDelProyecto,
} from "../packages/adapter/src/index.js";
import { reviewAgentCommand, run } from "../packages/cli/src/index.js";
import { buildGateState } from "../packages/engine/src/state.js";
import { findTicket } from "../packages/engine/src/discovery.js";
import { appendReceipt } from "../packages/engine/src/receipts.js";
import { registrarFase } from "../packages/engine/src/journey-phases.js";
import {
  type PreparacionDeRevision,
  type ResultadoDeRevision,
  type RevisionPreparada,
  ejecutarRevisor,
  prepararRevision,
  registrarDecisionDelRevisor,
} from "../packages/engine/src/reviewer.js";
import {
  approvalAuthorizationsPath,
  approvalQuotaUsesPath,
  crearAutorizacionDeAprobacion,
  readReceipts,
  registrarUsoDeCupoDeAprobacion,
  revocarAutorizacionDeAprobacion,
  transition,
} from "../packages/engine/src/index.js";
import { parseTicket } from "../packages/core/src/index.js";
import { type GateReceipt, hashState } from "../packages/gate/src/index.js";
import {
  JudgeError,
  MOTIVO_MAX,
  promptDelRevisor,
  reviewWithModel,
} from "../packages/gate-llm-judge/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const ID = "FEATURE-ENGINE-PRUEBA-REVISOR-20261007";
/** El modelo que el rol `reviewer` resuelve por defecto (preset `balanced`). */
const REVISOR_POR_DEFECTO = "openai/gpt-5.6-luna-pro";

let lab: string;
const PATHS = (): { root: string; ticketsDir: string } => ({ root: lab, ticketsDir: "tickets" });

// ── El registro de prueba ────────────────────────────────────────────────────

/** Una proposición evaluada, tal como el recibo la guarda. */
function proposicion(
  id: string,
  opciones: { readonly valor: number; readonly enBanda: boolean; readonly descripcion?: string; readonly motivo?: string },
): GateReceipt["propositions"][number] {
  return {
    id,
    kind: "noul",
    weight: 1,
    value: opciones.valor,
    label: "p",
    inBand: opciones.enBanda,
    effect: { outcome: opciones.enBanda ? "review" : "approve" },
    reason: opciones.motivo ?? "",
    verdict: true,
    ...(opciones.descripcion === undefined ? {} : { description: opciones.descripcion }),
  } as GateReceipt["propositions"][number];
}

/** Dos proposiciones en banda media y una que aprobó: lo que deja un `review` típico. */
const PROPOSICIONES_DE_UN_REVIEW = [
  proposicion("causa_especifica", { valor: 0.97, enBanda: false, descripcion: "La causa es específica", motivo: "nombra la causa" }),
  proposicion("riesgos_cubren_impactos", {
    valor: 0.55,
    enBanda: true,
    descripcion: "Los riesgos cubren los impactos declarados",
    motivo: "menciona la compatibilidad pero no el rollback",
  }),
  proposicion("plan_nombra_archivos", {
    valor: 0.62,
    enBanda: true,
    descripcion: "El plan nombra los archivos que cambia",
    motivo: "nombra dos de tres",
  }),
];

/** El `stateHash` que la compuerta le daría hoy al ticket: el del texto que hay en el laboratorio. */
function hashActual(ticketId: string = ID): string {
  const ubicado = findTicket({ root: lab, ticketsDir: "tickets" }, ticketId);
  if (ubicado === undefined) throw new Error(`no existe ${ticketId}`);
  return hashState(buildGateState(ubicado.text));
}

interface OpcionesDeRecibo {
  readonly ticketId?: string;
  readonly gate?: string;
  readonly id?: string;
  readonly outcome?: "approve" | "review" | "block";
  readonly escalado?: boolean;
  readonly decision?: "approve" | "reject";
  readonly propositions?: GateReceipt["propositions"];
}

function recibo(opciones: OpcionesDeRecibo = {}): GateReceipt {
  const { ticketId = ID, gate = "plan", id = `GR-2026-10-07-${ticketId}-${gate}-1`, outcome = "review" } = opciones;
  return {
    kind: "gate-receipt",
    receiptVersion: 1,
    schemaVersion: "2",
    id,
    gate,
    gateHash: "sha256:test",
    subject: { type: "ticket", id: ticketId, revision: "1" },
    outcome,
    reason: "motivo de prueba",
    actor: "model",
    decidedAt: "2026-10-07T12:00:00.000Z",
    stateHash: hashActual(ticketId),
    policy: { approveAt: 0.9, blockAt: 0.1 },
    mechanicalChecks: [],
    modelAnswers: [],
    propositions: opciones.propositions ?? PROPOSICIONES_DE_UN_REVIEW,
    model: null,
    usage: null,
    latencyMs: null,
    escalatedTo: (opciones.escalado ?? outcome === "review") ? "human" : null,
    humanDecision:
      opciones.decision === undefined
        ? null
        : {
            actor: "Persona de prueba",
            decision: opciones.decision,
            reason: "decidido en la prueba",
            channel: "cli",
            decidedAt: "2026-10-07T13:00:00.000Z",
          },
  };
}

function conRecibos(...recibos: GateReceipt[]): void {
  for (const r of recibos) appendReceipt(PATHS(), ID, r);
}

/** Registra que una sesión de la jornada produjo una fase del ticket con ese modelo. */
function productor(
  fase: "analysis" | "plan" | "implementation",
  modelo: string,
  ticketId: string = ID,
): void {
  registrarFase(lab, {
    ticketId,
    fase,
    ejecutor: "claude",
    modelo,
    esfuerzo: "high",
    origenDelModelo: `rol agent-${fase} (preset)`,
    duracionMs: 1000,
    resultado: "ok",
  });
}

/** El rol `reviewer` del proyecto, declarado a mano en `routing.yaml`. */
function revisorDelProyecto(provider: string, model: string): void {
  writeFileSync(
    join(lab, ".valmen", "routing.yaml"),
    `preset: balanced\n\nroles:\n  reviewer:\n    provider: ${provider}\n    model: ${model}\n    effort: high\n`,
    "utf8",
  );
}

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-revisor-"));
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  writeFileSync(join(lab, ".valmen", "config.yaml"), "name: Demo\n", "utf8");
  writeFixtureTicket(lab, { id: ID, workflowStatus: "planned", type: "FEATURE", module: "ENGINE" });
});

afterEach(() => {
  rmSync(lab, { recursive: true, force: true });
});

// ── Los modelos de la red ────────────────────────────────────────────────────

interface Llamada {
  readonly url: string;
  readonly body: Record<string, unknown>;
}

/** Una respuesta de chat con el contenido que se diga. */
function respuestaDeChat(contenido: unknown, modelo = "openai/gpt-5.6-luna-pro-20261001"): Response {
  return new Response(
    JSON.stringify({
      model: modelo,
      choices: [{ message: { content: typeof contenido === "string" ? contenido : JSON.stringify(contenido) } }],
      usage: { prompt_tokens: 900, completion_tokens: 80, cost: 0.0012 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** El `fetch` simulado: guarda lo que se le pidió y responde lo que se le diga. */
function red(responder: () => Response): { readonly llamadas: Llamada[]; readonly fetchImpl: typeof fetch } {
  const llamadas: Llamada[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    return responder();
  }) as unknown as typeof fetch;
  return { llamadas, fetchImpl };
}

/** La decisión de un revisor conforme al esquema. */
function decision(
  valor: "approve" | "reject",
  ids: readonly string[],
  respaldadas: boolean | readonly boolean[] = valor === "approve",
): Record<string, unknown> {
  return {
    decision: valor,
    reason: valor === "approve" ? "El plan respalda cada proposición." : "Falta el rollback.",
    porProposicion: ids.map((id, i) => ({
      id,
      respaldada: Array.isArray(respaldadas) ? respaldadas[i] : respaldadas,
      motivo: `motivo de ${id}`,
    })),
  };
}

const IDS_EN_DUDA = ["riesgos_cubren_impactos", "plan_nombra_archivos"];

function preparada(etapa: "analysis" | "plan" = "plan"): RevisionPreparada {
  const preparacion = prepararRevision({ paths: PATHS(), ticketId: ID, etapa });
  if (!preparacion.ok) throw new Error(`no se preparó: ${preparacion.motivo}`);
  return preparacion;
}

/** Todo el contenido del laboratorio: ruta relativa y bytes, para comprobar que nada cambió. */
function instantanea(dir: string = lab, base: string = ""): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const nombre of readdirSync(dir).sort()) {
    const ruta = join(dir, nombre);
    const relativa = base === "" ? nombre : `${base}/${nombre}`;
    if (statSync(ruta).isDirectory()) Object.assign(resultado, instantanea(ruta, relativa));
    else resultado[relativa] = readFileSync(ruta, "utf8");
  }
  return resultado;
}

/** Ejecuta el CLI de punta a punta y devuelve el código y lo que escribió. */
async function correrCli(argv: readonly string[]): Promise<{ readonly codigo: number; readonly salida: string }> {
  const escrituras: string[] = [];
  const escribir = (chunk: unknown): boolean => {
    escrituras.push(String(chunk));
    return true;
  };
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(escribir);
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(escribir);
  try {
    const codigo = await run(argv);
    return { codigo, salida: escrituras.join("") };
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
}

// ── El rol en el enrutado ────────────────────────────────────────────────────

describe("el rol reviewer en el enrutado", () => {
  it("C2: cada preset resuelve reviewer a un modelo distinto, normalizado, de sus agent-analysis y agent-plan", () => {
    for (const preset of PRESETS) {
      const rutas = resolveRouting({ preset: preset.id, roles: {} });
      const revisor = rutas.find((r) => r.role === "reviewer");
      expect(revisor, preset.id).toBeDefined();
      expect(revisor?.model, preset.id).not.toBe("");
      const normalizado = normalizarModelo(revisor?.model ?? "");
      for (const fase of ["agent-analysis", "agent-plan"]) {
        const ruta = rutas.find((r) => r.role === fase);
        expect(normalizado, `${preset.id}: reviewer contra ${fase}`).not.toBe(normalizarModelo(ruta?.model ?? ""));
      }
    }
  });

  it("C2: cada perfil incorporado resuelve reviewer a un modelo distinto, normalizado, de sus agent-analysis y agent-plan", () => {
    for (const perfil of PERFILES_INCORPORADOS) {
      const rutas = resolveRouting({ preset: "balanced", roles: {} }, null, { perfil, alcance: "proyecto" });
      const revisor = rutas.find((r) => r.role === "reviewer");
      // Lo hereda de `balanced` por `ROLES_DE_EVALUACION`: sale del perfil, no del preset.
      expect(revisor?.source, perfil.id).toBe("perfil");
      expect(revisor?.model, perfil.id).not.toBe("");
      const normalizado = normalizarModelo(revisor?.model ?? "");
      for (const fase of ["agent-analysis", "agent-plan"]) {
        const ruta = rutas.find((r) => r.role === fase);
        expect(normalizado, `${perfil.id}: reviewer contra ${fase}`).not.toBe(normalizarModelo(ruta?.model ?? ""));
      }
    }
  });

  it("C3: normalizarModelo trata como el mismo modelo anthropic/claude-sonnet-5 y claude-sonnet-5", () => {
    expect(normalizarModelo("anthropic/claude-sonnet-5")).toBe(normalizarModelo("claude-sonnet-5"));
    // Mayúsculas y los separadores que cada catálogo escribe a su manera.
    expect(normalizarModelo("Claude-Opus-4.6")).toBe(normalizarModelo("anthropic/claude-opus-4-6"));
    expect(normalizarModelo("openai/gpt_5.6-luna-pro")).toBe(normalizarModelo("gpt-5-6-luna-pro"));
    // Y no confunde modelos distintos.
    expect(normalizarModelo("claude-sonnet-5")).not.toBe(normalizarModelo("claude-sonnet-5-5"));
    expect(normalizarModelo("claude-opus-5-5")).not.toBe(normalizarModelo("claude-sonnet-5-5"));
  });

  it("C4/C5: modeloDelRevisor elige solo si hay productor conocido y es otro modelo", () => {
    const rutas = resolveRouting({ preset: "balanced", roles: {} });

    const mismo = modeloDelRevisor(rutas, ["claude-opus-5-5", "gpt-5.6-luna-pro"]);
    expect(mismo.ok).toBe(false);
    if (!mismo.ok) expect(mismo.motivo).toMatch(/mismo modelo que produjo el artefacto.*elegí otro en el rol reviewer/);

    const desconocido = modeloDelRevisor(rutas, []);
    expect(desconocido.ok).toBe(false);
    if (!desconocido.ok) expect(desconocido.motivo).toMatch(/productor desconocido/);
    // Un productor en blanco tampoco es un productor.
    expect(modeloDelRevisor(rutas, ["  "]).ok).toBe(false);

    const otro = modeloDelRevisor(rutas, ["claude-opus-5-5"]);
    expect(otro.ok).toBe(true);
    if (otro.ok) expect(otro.route.model).toBe(REVISOR_POR_DEFECTO);

    const sinRol = modeloDelRevisor(rutas.filter((r) => r.role !== "reviewer"), ["claude-opus-5-5"]);
    expect(sinRol.ok).toBe(false);
    if (!sinRol.ok) expect(sinRol.motivo).toMatch(/reviewer no tiene modelo/);
  });
});

// ── Elegir al revisor: separación de modelos ─────────────────────────────────

describe("el revisor es otro modelo", () => {
  it("C4: con el rol reviewer en el mismo modelo que produjo el plan, no llama al modelo y pide otro", async () => {
    conRecibos(recibo());
    revisorDelProyecto("claude-code", "claude-opus-5-5");
    productor("plan", "claude-opus-5-5");
    const cli = vi.fn();

    const preparacion = prepararRevision({ paths: PATHS(), ticketId: ID, etapa: "plan" });
    expect(preparacion.ok).toBe(false);
    if (!preparacion.ok) expect(preparacion.motivo).toMatch(/mismo modelo que produjo.*elegí otro en el rol reviewer/);

    const r = await reviewAgentCommand(PATHS(), { id: ID, stage: "plan" }, { cliRunner: cli });
    expect(cli).not.toHaveBeenCalled();
    expect(r.exitCode).toBe(3);
    expect(r.stdout).toContain("elegí otro en el rol reviewer");
  });

  it("C4: el mismo modelo con otro prefijo de proveedor sigue siendo el mismo modelo", () => {
    conRecibos(recibo());
    // El rol resuelve `openai/gpt-5.6-luna-pro`; la jornada lo registró sin prefijo.
    productor("plan", "gpt-5.6-luna-pro");
    const preparacion = prepararRevision({ paths: PATHS(), ticketId: ID, etapa: "plan" });
    expect(preparacion.ok).toBe(false);
  });

  it("C5: sin ningún registro de fase del ticket, no llama al modelo y dice «productor desconocido»", async () => {
    conRecibos(recibo());
    // Las fases de otro ticket no son las de este.
    productor("analysis", "claude-opus-5-5", "FEATURE-ENGINE-OTRO-TICKET-20261007");
    const { llamadas, fetchImpl } = red(() => respuestaDeChat(decision("approve", IDS_EN_DUDA)));

    const preparacion = prepararRevision({ paths: PATHS(), ticketId: ID, etapa: "plan" });
    expect(preparacion.ok).toBe(false);
    if (!preparacion.ok) {
      expect(preparacion.motivo).toMatch(/productor desconocido/);
      expect(preparacion.productores).toEqual([]);
    }

    const r = await reviewAgentCommand(PATHS(), { id: ID, stage: "plan" }, { apiKey: "k", fetchImpl });
    expect(llamadas).toHaveLength(0);
    expect(r.exitCode).toBe(3);
    expect(r.stdout).toContain("productor desconocido");
  });

  it("C5: una fase que no produce análisis ni plan no cuenta como productor", () => {
    conRecibos(recibo());
    productor("implementation", "claude-sonnet-5-5");
    const preparacion = prepararRevision({ paths: PATHS(), ticketId: ID, etapa: "plan" });
    expect(preparacion.ok).toBe(false);
    if (!preparacion.ok) expect(preparacion.motivo).toMatch(/productor desconocido/);
  });

  it("C10: un plan preparado por la jornada, registrado con fase analysis, cuenta su modelo como productor del plan", () => {
    conRecibos(recibo());
    revisorDelProyecto("claude-code", "claude-opus-5-5");
    // La preparación de la jornada es una sola sesión y la registra como `analysis`.
    productor("analysis", "claude-opus-5-5");

    const preparacion = prepararRevision({ paths: PATHS(), ticketId: ID, etapa: "plan" });
    expect(preparacion.ok).toBe(false);
    if (!preparacion.ok) {
      expect(preparacion.motivo).toMatch(/mismo modelo que produjo/);
      expect(preparacion.productores).toEqual([{ fase: "analysis", ejecutor: "claude", modelo: "claude-opus-5-5" }]);
    }
  });

  it("control: con un productor conocido y otro revisor, la revisión queda lista", () => {
    conRecibos(recibo());
    productor("analysis", "claude-opus-5-5");
    productor("plan", "claude-sonnet-5-5");

    const preparacion = preparada("plan");
    expect(preparacion.revisor).toMatchObject({ provider: "openrouter", model: REVISOR_POR_DEFECTO, source: "preset" });
    expect(preparacion.productores.map((p) => p.modelo)).toEqual(["claude-opus-5-5", "claude-sonnet-5-5"]);
  });
});

// ── Qué recibos llegan al revisor ────────────────────────────────────────────

describe("solo llega al revisor un último recibo vigente en review sin decisión humana", () => {
  const CASOS: readonly {
    readonly nombre: string;
    readonly recibos: () => GateReceipt[];
    readonly motivo: RegExp;
  }[] = [
    { nombre: "sin recibo", recibos: () => [], motivo: /ningún recibo de la compuerta plan/ },
    { nombre: "un recibo de otra compuerta", recibos: () => [recibo({ gate: "analysis" })], motivo: /ningún recibo de la compuerta plan/ },
    { nombre: "en block", recibos: () => [recibo({ outcome: "block" })], motivo: /está en block.*lo decide una persona/ },
    { nombre: "en approve", recibos: () => [recibo({ outcome: "approve", escalado: false })], motivo: /está en approve y no en review/ },
    {
      nombre: "en approve escalado a una persona",
      recibos: () => [recibo({ outcome: "approve", escalado: true })],
      motivo: /está en approve y no en review/,
    },
    {
      nombre: "en review con una decisión humana que aprueba",
      recibos: () => [recibo({ decision: "approve" })],
      motivo: /ya tiene una decisión humana \(approve\)/,
    },
    {
      nombre: "en review con una decisión humana que rechaza",
      recibos: () => [recibo({ decision: "reject" })],
      motivo: /ya tiene una decisión humana \(reject\)/,
    },
    {
      nombre: "en review sin ninguna proposición en banda media",
      recibos: () => [recibo({ propositions: [PROPOSICIONES_DE_UN_REVIEW[0] as GateReceipt["propositions"][number]] })],
      motivo: /ninguna proposición quedó en banda media/,
    },
    {
      nombre: "un review viejo y un approve después",
      recibos: () => [recibo({ id: "GR-1" }), recibo({ id: "GR-2", outcome: "approve", escalado: false })],
      motivo: /está en approve y no en review/,
    },
    {
      nombre: "un review y una decisión humana anexada con el mismo id",
      recibos: () => [recibo({ id: "GR-1" }), recibo({ id: "GR-1", decision: "approve" })],
      motivo: /ya tiene una decisión humana/,
    },
  ];

  for (const caso of CASOS) {
    it(`C9: ${caso.nombre}: no llega al revisor y devuelve su motivo`, async () => {
      conRecibos(...caso.recibos());
      productor("analysis", "claude-opus-5-5");
      const { llamadas, fetchImpl } = red(() => respuestaDeChat(decision("approve", IDS_EN_DUDA)));

      const preparacion = prepararRevision({ paths: PATHS(), ticketId: ID, etapa: "plan" });
      expect(preparacion.ok).toBe(false);
      if (!preparacion.ok) expect(preparacion.motivo).toMatch(caso.motivo);

      const r = await reviewAgentCommand(PATHS(), { id: ID, stage: "plan" }, { apiKey: "k", fetchImpl });
      expect(llamadas).toHaveLength(0);
      expect(r.exitCode).toBe(3);
      expect(r.stdout).toMatch(caso.motivo);
    });
  }

  it("C9: un block viejo seguido de un review nuevo sí llega: manda el último recibo", () => {
    conRecibos(recibo({ id: "GR-1", outcome: "block" }), recibo({ id: "GR-2" }));
    productor("analysis", "claude-opus-5-5");
    const preparacion = preparada("plan");
    expect(preparacion.reciboId).toBe("GR-2");
  });

  it("solo se revisan las etapas analysis y plan", () => {
    expect(() =>
      prepararRevision({ paths: PATHS(), ticketId: ID, etapa: "qa-mechanical" as unknown as "plan" }),
    ).toThrow(/analysis y plan/);
  });
});

// ── Lo que se le envía al revisor ────────────────────────────────────────────

describe("reviewWithModel envía solo lo que corresponde", () => {
  const ARTEFACTO = "## Plan\n- Cambiar `src/filtro.ts` y probarlo.\n\n## Criterios de aceptación\n- [ ] C1. Busca por número parcial.";
  const EN_DUDA = [
    { id: "riesgos_cubren_impactos", descripcion: "Los riesgos cubren los impactos", valor: 0.55, motivo: "no menciona el rollback" },
    { id: "plan_nombra_archivos", valor: 0.62, motivo: null },
  ];

  it("C6: envía el prompt del rol revisor, el artefacto y las proposiciones en banda media", async () => {
    const { llamadas, fetchImpl } = red(() => respuestaDeChat(decision("approve", EN_DUDA.map((p) => p.id))));

    await reviewWithModel({
      provider: "openrouter",
      model: REVISOR_POR_DEFECTO,
      effort: "medium",
      etapa: "plan",
      artefacto: ARTEFACTO,
      proposiciones: EN_DUDA,
      apiKey: "k",
      fetchImpl,
    });

    expect(llamadas).toHaveLength(1);
    const cuerpo = llamadas[0]?.body as {
      model: string;
      messages: { role: string; content: string }[];
      response_format: { json_schema: { name: string; schema: { required: string[] } } };
    };
    expect(cuerpo.model).toBe(REVISOR_POR_DEFECTO);
    // El rol: revisa, no reescribe, no evalúa otras y aprueba solo si todo está respaldado.
    expect(cuerpo.messages[0]).toEqual({ role: "system", content: promptDelRevisor() });
    expect(promptDelRevisor()).toMatch(/no reescribas/i);
    expect(promptDelRevisor()).toMatch(/únicamente si el artefacto respalda \*\*cada\*\* proposición/);
    // El artefacto y la etapa, y las proposiciones con su valor y su motivo.
    const usuario = cuerpo.messages[1]?.content ?? "";
    expect(usuario).toContain("ETAPA: plan");
    expect(usuario).toContain(ARTEFACTO);
    expect(usuario).toContain("riesgos_cubren_impactos");
    expect(usuario).toContain("0.55");
    expect(usuario).toContain("no menciona el rollback");
    expect(usuario).toContain("plan_nombra_archivos");
    // La salida es estructurada, con el esquema de la decisión.
    expect(cuerpo.response_format.json_schema.name).toBe("review_decision");
    expect(cuerpo.response_format.json_schema.schema.required).toEqual(["decision", "reason", "porProposicion"]);
  });

  it("C6: desde un recibo real, el revisor no ve las proposiciones que aprobaron", async () => {
    conRecibos(recibo());
    productor("analysis", "claude-opus-5-5");
    const { llamadas, fetchImpl } = red(() => respuestaDeChat(decision("approve", IDS_EN_DUDA)));

    await ejecutarRevisor(preparada("plan"), { apiKey: "k", fetchImpl });

    const enviado = JSON.stringify(llamadas[0]?.body);
    for (const id of IDS_EN_DUDA) expect(enviado).toContain(id);
    // `causa_especifica` aprobó con 0,97: no está en duda y no viaja.
    expect(enviado).not.toContain("causa_especifica");
    // El artefacto de un plan es el Plan y los Criterios, no el diagnóstico.
    expect(enviado).toContain("Rollback: revertir el cambio de una línea");
    expect(enviado).not.toContain("Archivos y flujo investigados");
  });

  it("C6: el artefacto de un análisis es la Descripción funcional y el Diagnóstico", async () => {
    conRecibos(recibo({ gate: "analysis" }));
    productor("analysis", "claude-opus-5-5");
    const { llamadas, fetchImpl } = red(() => respuestaDeChat(decision("approve", IDS_EN_DUDA)));

    await ejecutarRevisor(preparada("analysis"), { apiKey: "k", fetchImpl });

    const enviado = JSON.stringify(llamadas[0]?.body);
    expect(enviado).toContain("Comportamiento esperado: encuentra por número parcial");
    expect(enviado).toContain("Archivos y flujo investigados");
    expect(enviado).not.toContain("Rollback: revertir el cambio de una línea");
  });

  it("C6: un artefacto con una credencial no se envía a un modelo", async () => {
    productor("analysis", "claude-opus-5-5");
    const ruta = join(lab, "tickets", "2026", ID, "ticket.md");
    // La clave se arma en la prueba: un literal con su forma sería un hallazgo de `valmen secrets`.
    const clave = ["sk", "ant", "api03", "A".repeat(40)].join("-");
    const texto = readFileSync(ruta, "utf8").replace(
      "- Rollback: revertir el cambio de una línea",
      `- Rollback: usar la clave ${clave}`,
    );
    writeFileSync(ruta, texto, "utf8");
    // El recibo evalúa el texto que ya tiene la credencial: si no, sería un recibo viejo (C11).
    conRecibos(recibo());

    const preparacion = prepararRevision({ paths: PATHS(), ticketId: ID, etapa: "plan" });
    expect(preparacion.ok).toBe(false);
    if (!preparacion.ok) {
      expect(preparacion.motivo).toMatch(/expone una credencial/);
      // El motivo ubica el hallazgo y no lo repite.
      expect(preparacion.motivo).not.toContain("AAAAAAAA");
    }
  });

  it("una revisión sin proposiciones en duda no se hace", async () => {
    await expect(
      reviewWithModel({
        provider: "openrouter",
        model: REVISOR_POR_DEFECTO,
        effort: "auto",
        etapa: "plan",
        artefacto: ARTEFACTO,
        proposiciones: [],
        apiKey: "k",
        fetchImpl: red(() => respuestaDeChat({})).fetchImpl,
      }),
    ).rejects.toBeInstanceOf(JudgeError);
  });
});

// ── La decisión ──────────────────────────────────────────────────────────────

describe("la decisión del revisor", () => {
  const BASE = {
    provider: "openrouter",
    model: REVISOR_POR_DEFECTO,
    effort: "high" as const,
    etapa: "plan" as const,
    artefacto: "## Plan\n- Algo.",
    proposiciones: [
      { id: "p1", valor: 0.5, motivo: null },
      { id: "p2", valor: 0.6, motivo: "dudó" },
    ],
    apiKey: "k",
  };
  const IDS = ["p1", "p2"];

  it("C7: devuelve approve con su razón, el modelo que la tomó, el uso y la latencia", async () => {
    const { fetchImpl } = red(() => respuestaDeChat(decision("approve", IDS)));

    const r = await reviewWithModel({ ...BASE, fetchImpl });

    expect(r.decision).toBe("approve");
    expect(r.reason).toBe("El plan respalda cada proposición.");
    expect(r.porProposicion).toEqual([
      { id: "p1", respaldada: true, motivo: "motivo de p1" },
      { id: "p2", respaldada: true, motivo: "motivo de p2" },
    ]);
    expect(r.model).toEqual({
      provider: "openrouter",
      model: REVISOR_POR_DEFECTO,
      resolvedVersion: "openai/gpt-5.6-luna-pro-20261001",
    });
    expect(r.usage).toEqual({ inputTokens: 900, outputTokens: 80, costUsd: 0.0012 });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("C7: devuelve reject cuando alguna proposición no está respaldada", async () => {
    const { fetchImpl } = red(() => respuestaDeChat(decision("reject", IDS, [true, false])));

    const r = await reviewWithModel({ ...BASE, fetchImpl });

    expect(r.decision).toBe("reject");
    expect(r.reason).toBe("Falta el rollback.");
    expect(r.porProposicion.map((p) => p.respaldada)).toEqual([true, false]);
  });

  it("C7: la razón se recorta a MOTIVO_MAX", async () => {
    const larga = { ...decision("reject", IDS, false), reason: "x".repeat(MOTIVO_MAX + 300) };
    const { fetchImpl } = red(() => respuestaDeChat(larga));

    const r = await reviewWithModel({ ...BASE, fetchImpl });

    expect(r.reason).toHaveLength(MOTIVO_MAX);
  });

  it("C7: habla por el CLI de Claude cuando el proveedor del rol es claude-code", async () => {
    const ejecuciones: { args: readonly string[]; stdin: string }[] = [];
    const cliRunner = async (corrida: { args: readonly string[]; stdin: string }) => {
      ejecuciones.push(corrida);
      return {
        status: 0,
        stdout: JSON.stringify({
          type: "result",
          structured_output: decision("approve", IDS),
          usage: { input_tokens: 700, output_tokens: 60 },
          modelUsage: { "claude-opus-5-5": {} },
        }),
        stderr: "",
        timedOut: false,
        spawnError: null,
      };
    };

    const r = await reviewWithModel({ ...BASE, provider: "claude-code", model: "claude-opus-5-5", cliRunner });

    expect(r.decision).toBe("approve");
    expect(r.model.model).toBe("claude-opus-5-5");
    expect(ejecuciones).toHaveLength(1);
    expect(ejecuciones[0]?.args).toContain(promptDelRevisor());
    expect(ejecuciones[0]?.stdin).toContain("## Plan");
  });

  const FUERA_DEL_ESQUEMA: readonly { readonly nombre: string; readonly contenido: unknown; readonly code: string }[] = [
    { nombre: "texto que no es JSON", contenido: "Apruebo, el plan está bien.", code: "MALFORMED_RESPONSE" },
    { nombre: "un JSON que no es un objeto", contenido: "[1, 2]", code: "MALFORMED_RESPONSE" },
    { nombre: "una decisión inventada", contenido: { ...decision("approve", IDS), decision: "maybe" }, code: "INVALID_DECISION" },
    { nombre: "una decisión en otro idioma", contenido: { ...decision("approve", IDS), decision: "aprobado" }, code: "INVALID_DECISION" },
    { nombre: "sin decisión", contenido: { reason: "ok", porProposicion: [] }, code: "INVALID_DECISION" },
    { nombre: "sin razón", contenido: { ...decision("approve", IDS), reason: "  " }, code: "MISSING_REASON" },
    { nombre: "sin porProposicion", contenido: { decision: "approve", reason: "ok" }, code: "MALFORMED_RESPONSE" },
    {
      nombre: "una entrada de porProposicion sin respaldada",
      contenido: { decision: "approve", reason: "ok", porProposicion: [{ id: "p1", motivo: "x" }] },
      code: "MALFORMED_RESPONSE",
    },
    { nombre: "sin responder una proposición", contenido: decision("approve", ["p1"]), code: "MISSING_ANSWER" },
    {
      nombre: "approve con una proposición sin respaldo",
      contenido: decision("approve", IDS, [true, false]),
      code: "INCONSISTENT_DECISION",
    },
  ];

  for (const caso of FUERA_DEL_ESQUEMA) {
    it(`C8: ${caso.nombre} lanza JudgeError y no se lee como aprobación`, async () => {
      const { fetchImpl } = red(() => respuestaDeChat(caso.contenido));

      const intento = reviewWithModel({ ...BASE, fetchImpl });

      await expect(intento).rejects.toBeInstanceOf(JudgeError);
      await expect(intento).rejects.toMatchObject({ code: caso.code });
    });
  }

  it("C8: un fallo del proveedor es un JudgeError, no una decisión", async () => {
    const { fetchImpl } = red(() => new Response("caído", { status: 503 }));

    await expect(reviewWithModel({ ...BASE, fetchImpl })).rejects.toMatchObject({
      name: "JudgeError",
      code: "SERVER",
    });
  });
});

// ── Solo lectura ─────────────────────────────────────────────────────────────

describe("el revisor no escribe en el registro", () => {
  it("C11: ejecutarRevisor deja iguales recibos, ticket, eventos, fases y cupo", async () => {
    conRecibos(recibo());
    productor("analysis", "claude-opus-5-5");
    // Con una autorización de aprobación y su cupo en el registro: no se toca.
    mkdirSync(join(lab, ".valmen", "authorizations"), { recursive: true });
    writeFileSync(join(lab, ".valmen", "authorizations", "approval.jsonl"), '{"id":"APA-001","dailyQuota":3}\n', "utf8");
    const { fetchImpl } = red(() => respuestaDeChat(decision("approve", IDS_EN_DUDA)));

    const antes = instantanea();
    const resultado = await ejecutarRevisor(preparada("plan"), { apiKey: "k", fetchImpl });
    const despues = instantanea();

    expect(resultado.decision).toBe("approve");
    expect(despues).toEqual(antes);
    // Y lo que se comparó incluye de verdad el ticket, los recibos y las fases.
    expect(Object.keys(antes)).toEqual(
      expect.arrayContaining([
        `tickets/2026/${ID}/ticket.md`,
        `.valmen/receipts/${ID}.jsonl`,
        ".valmen/journeys/fases.jsonl",
      ]),
    );
  });

  it("C11: el comando tampoco escribe, con o sin --dry-run", async () => {
    conRecibos(recibo());
    productor("analysis", "claude-opus-5-5");
    const { fetchImpl } = red(() => respuestaDeChat(decision("reject", IDS_EN_DUDA, false)));

    const antes = instantanea();
    await reviewAgentCommand(PATHS(), { id: ID, stage: "plan", "dry-run": true }, { apiKey: "k", fetchImpl });
    const real = await reviewAgentCommand(PATHS(), { id: ID, stage: "plan" }, { apiKey: "k", fetchImpl });

    expect(real.exitCode).toBe(0);
    expect(instantanea()).toEqual(antes);
  });
});

// ── El comando ───────────────────────────────────────────────────────────────

describe("valmen review-agent", () => {
  it("C12: --dry-run muestra productor, revisor y proposiciones sin llamar al modelo", async () => {
    conRecibos(recibo());
    productor("analysis", "claude-opus-5-5");
    const { llamadas, fetchImpl } = red(() => respuestaDeChat(decision("approve", IDS_EN_DUDA)));

    const r = await reviewAgentCommand(PATHS(), { id: ID, stage: "plan", "dry-run": true }, { apiKey: "k", fetchImpl });

    expect(llamadas).toHaveLength(0);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("dry-run: no se llamó al modelo");
    // El productor, el revisor y las proposiciones en duda, con su valor y su motivo.
    expect(r.stdout).toContain("claude-opus-5-5 (claude, fase analysis)");
    expect(r.stdout).toContain(`openrouter ${REVISOR_POR_DEFECTO}`);
    expect(r.stdout).toContain("riesgos_cubren_impactos (valor 0.55)");
    expect(r.stdout).toContain("menciona la compatibilidad pero no el rollback");
    expect(r.stdout).toContain("plan_nombra_archivos (valor 0.62)");
    expect(r.stdout).not.toContain("causa_especifica");
  });

  it("C12: --dry-run --json es una salida legible por una máquina", async () => {
    conRecibos(recibo());
    productor("analysis", "claude-opus-5-5");

    const r = await reviewAgentCommand(PATHS(), { id: ID, stage: "plan", "dry-run": true, json: true });

    const datos = JSON.parse(r.stdout) as {
      modo: string;
      ejecutado: boolean;
      revisor: { model: string };
      productores: { modelo: string }[];
      proposiciones: { id: string }[];
    };
    expect(datos.modo).toBe("dry-run");
    expect(datos.ejecutado).toBe(false);
    expect(datos.revisor.model).toBe(REVISOR_POR_DEFECTO);
    expect(datos.productores.map((p) => p.modelo)).toEqual(["claude-opus-5-5"]);
    expect(datos.proposiciones.map((p) => p.id)).toEqual(IDS_EN_DUDA);
  });

  it("C12: se despacha desde la línea de comandos con --stage", async () => {
    conRecibos(recibo());
    productor("analysis", "claude-opus-5-5");

    const { codigo, salida } = await correrCli([
      "review-agent",
      "--id",
      ID,
      "--stage",
      "plan",
      "--dry-run",
      "--root",
      lab,
    ]);

    expect(codigo).toBe(0);
    expect(salida).toContain("dry-run: no se llamó al modelo");
    expect(salida).toContain("riesgos_cubren_impactos");
  });

  it("sin --id o con una etapa que no se revisa, falla por entrada inválida", async () => {
    expect((await reviewAgentCommand(PATHS(), { stage: "plan" })).exitCode).toBe(2);
    const etapa = await reviewAgentCommand(PATHS(), { id: ID, stage: "release" });
    expect(etapa.exitCode).toBe(2);
    expect(etapa.stderr).toContain("analysis|plan");
    const ticket = await reviewAgentCommand(PATHS(), { id: "FEATURE-ENGINE-NO-EXISTE-20261007", stage: "plan" });
    expect(ticket.exitCode).toBe(2);
    expect(ticket.stderr).toContain("No existe el ticket");
  });

  it("control: con un revisor distinto del productor imprime su decisión y aclara que no la registró", async () => {
    conRecibos(recibo());
    productor("analysis", "claude-opus-5-5");
    const { llamadas, fetchImpl } = red(() => respuestaDeChat(decision("approve", IDS_EN_DUDA)));

    const r = await reviewAgentCommand(PATHS(), { id: ID, stage: "plan" }, { apiKey: "k", fetchImpl });

    expect(llamadas).toHaveLength(1);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Decisión del revisor: approve");
    expect(r.stdout).toContain("Razón: El plan respalda cada proposición.");
    expect(r.stdout).toContain("respaldada  riesgos_cubren_impactos");
    expect(r.stdout).toContain("No se registró");
    expect(r.stdout).toContain("openai/gpt-5.6-luna-pro-20261001");
  });

  it("una respuesta del modelo fuera del esquema sale con 3 y no imprime una aprobación", async () => {
    conRecibos(recibo());
    productor("analysis", "claude-opus-5-5");
    const { fetchImpl } = red(() => respuestaDeChat("Todo bien, apruebo."));

    const r = await reviewAgentCommand(PATHS(), { id: ID, stage: "plan" }, { apiKey: "k", fetchImpl });

    expect(r.exitCode).toBe(3);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("El revisor no devolvió una decisión válida");
    expect(r.stderr).not.toContain("Decisión del revisor: approve");
  });
});

// ── El enrutado del proyecto de prueba ───────────────────────────────────────

describe("el enrutado que usa la preparación", () => {
  it("el rol reviewer del proyecto gana al preset y la preparación lo dice", () => {
    conRecibos(recibo());
    productor("analysis", "claude-opus-5-5");
    revisorDelProyecto("claude-code", "claude-sonnet-5-5");

    const preparacion: PreparacionDeRevision = prepararRevision({ paths: PATHS(), ticketId: ID, etapa: "plan" });

    expect(preparacion.ok).toBe(true);
    expect(preparacion.revisor).toMatchObject({ provider: "claude-code", model: "claude-sonnet-5-5", source: "proyecto" });
    expect(rutasDelProyecto(lab).find((r) => r.role === "reviewer")?.source).toBe("proyecto");
  });
});

describe("los productores registrados (R-PERF-006)", () => {
  it("C15: productoresDelTicket usa el modelo usado cuando el registro lo trae, y el declarado si no", async () => {
    const { productoresDelTicket } = await import("../packages/engine/src/reviewer.js");
    registrarFase(lab, {
      ticketId: ID, fase: "plan", ejecutor: "claude", modelo: "claude-opus-5-5", modeloUsado: "claude-sonnet-5-5",
      esfuerzo: "high", origenDelModelo: "rol", duracionMs: 1, resultado: "ok",
    });
    registrarFase(lab, {
      ticketId: ID, fase: "analysis", ejecutor: "claude", modelo: "claude-opus-5-5",
      esfuerzo: "high", origenDelModelo: "rol", duracionMs: 1, resultado: "ok",
    });
    expect(productoresDelTicket(lab, ID).map((p) => p.modelo)).toEqual(["claude-sonnet-5-5", "claude-opus-5-5"]);
  });
});


// ── Registrar la decisión del revisor como suya (SECURITY-ENGINE-APROBACION-POR-REVISOR-20261007) ──

describe("la decisión del revisor se registra", () => {
  const AHORA = new Date();
  const ID_ANALISIS = "BUGFIX-ENGINE-PRUEBA-REVISOR-ANALISIS-20261007";
  const ID_BUG = "BUGFIX-ENGINE-PRUEBA-REVISOR-20261007";
  const ID_SECURITY = "SECURITY-ENGINE-PRUEBA-REVISOR-20261007";

  const autorizar = (extra: Partial<Parameters<typeof crearAutorizacionDeAprobacion>[0]> = {}) =>
    crearAutorizacionDeAprobacion({
      root: lab,
      actor: "Juan Andrade",
      quote: "Autorizo que un revisor decida los review de engine",
      types: ["FEATURE", "BUGFIX"],
      modules: ["engine"],
      maxRisk: "normal",
      mode: "reviewer",
      dailyQuota: 3,
      validDays: 30,
      source: "cli",
      ahora: AHORA,
      env: {},
      ...extra,
    });

  /** El resultado de un revisor armado sin red: sirve para probar las barreras del motor. */
  function manual(
    sobre: Partial<ResultadoDeRevision> = {},
    ticketId: string = ID,
    etapa: "plan" | "analysis" = "plan",
  ): ResultadoDeRevision {
    return {
      ticketId,
      etapa,
      reciboId: `GR-2026-10-07-${ticketId}-${etapa}-1`,
      decision: "approve",
      reason: "El plan respalda cada proposición.",
      porProposicion: IDS_EN_DUDA.map((id) => ({ id, respaldada: true, motivo: "ok" })),
      revisor: { provider: "openrouter", model: REVISOR_POR_DEFECTO, resolvedVersion: "openai/gpt-5.6-luna-pro-20261001", effort: "high" },
      productores: [],
      proposiciones: [],
      usage: { inputTokens: 900, outputTokens: 80, costUsd: 0.0012 },
      latencyMs: 5,
      ...sobre,
    };
  }

  /** Lo que cuesta de verdad: prepara, ejecuta con la red simulada y devuelve la decisión del modelo. */
  async function decidir(
    valor: "approve" | "reject",
    ticketId: string = ID,
    etapa: "plan" | "analysis" = "plan",
  ): Promise<ResultadoDeRevision> {
    const preparacion = prepararRevision({ paths: PATHS(), ticketId, etapa });
    if (!preparacion.ok) throw new Error(`no se preparó: ${preparacion.motivo}`);
    const { fetchImpl } = red(() => respuestaDeChat(decision(valor, IDS_EN_DUDA, valor === "approve")));
    return ejecutarRevisor(preparacion, { apiKey: "k", fetchImpl });
  }

  const registrar = (resultado: ResultadoDeRevision, env: Record<string, string | undefined> = {}, ticketId: string = ID) =>
    registrarDecisionDelRevisor({ paths: PATHS(), ticketId, resultado, ahora: AHORA, env });
  const usos = (): number => {
    try {
      return readFileSync(approvalQuotaUsesPath(lab), "utf8").split("\n").filter((l) => l.trim() !== "").length;
    } catch {
      return 0;
    }
  };
  const documento = (id: string = ID) => {
    const u = findTicket(PATHS(), id);
    return parseTicket(u?.text ?? "");
  };
  const eventos = (accion: string, id: string = ID) => (documento(id).blocks.Eventos ?? []).filter((e) => e["action"] === accion);
  const versiones = (id: string = ID): number => readReceipts(PATHS(), id).length;
  const ultimoRecibo = (id: string = ID) => readReceipts(PATHS(), id).at(-1) as GateReceipt & {
    reviewerDecision?: { decision: string; revisor: { model: string }; authorizationId: string; receiptStateHash: string };
  };
  const mover = (to: string, id: string = ID, ms = 1000) =>
    transition({ paths: PATHS(), ticketId: id, entity: "ticket", to, now: () => new Date(AHORA.getTime() + ms) });

  /** El caso de control: recibo de plan en review con dos proposiciones en banda, autorización con cupo, otro modelo. */
  function preparar(id: string = ID): void {
    appendReceipt(PATHS(), id, recibo({ ticketId: id }));
    productor("plan", "claude-opus-5-5", id);
    autorizar();
  }
  const bugfix = (): void => {
    writeFixtureTicket(lab, { id: ID_BUG, workflowStatus: "planned", type: "BUGFIX", module: "ENGINE" });
  };

  it("control, C1, C2, C3: el approve queda como del revisor, con su evento y un cupo consumido", async () => {
    preparar();
    const resultado = await decidir("approve");

    const guardada = registrar(resultado);

    expect(guardada.decision).toBe("approve");
    expect(guardada.cupoRestante).toBe(2);
    expect(versiones()).toBe(2);
    const r = ultimoRecibo();
    expect(r.id).toBe(resultado.reciboId);
    expect(r.reviewerDecision?.decision).toBe("approve");
    expect(r.reviewerDecision?.revisor.model).toBe(REVISOR_POR_DEFECTO);
    expect(r.reviewerDecision?.receiptStateHash).toBe(r.stateHash);
    // No es una persona ni un veredicto nuevo del evaluador.
    expect(r.humanDecision).toBeNull();
    expect(r.outcome).toBe("review");
    const evento = eventos("plan-approved").at(-1);
    const datos = JSON.parse(String(evento?.["details"])) as Record<string, string>;
    expect(datos["source"]).toBe("revisor");
    expect(datos["actor"]).toContain(REVISOR_POR_DEFECTO);
    expect(datos["actor"]).toContain(datos["authorizationId"] as string);
    expect(datos["actor"]).not.toContain("Juan Andrade");
    expect(usos()).toBe(1);
  });

  it("C4: un BUGFIX con el approve registrado sobre el plan entra a approved", async () => {
    bugfix();
    preparar(ID_BUG);
    // Control de la barrera: sin la decisión, el review sigue esperando a una persona.
    expect(() => mover("approved", ID_BUG)).toThrow(/gate-decide/);

    registrar(await decidir("approve", ID_BUG), {}, ID_BUG);
    mover("approved", ID_BUG);

    expect(documento(ID_BUG).fields.workflow_status).toBe("approved");
    const verificado = eventos("plan-approval-verified", ID_BUG).at(-1);
    expect(String(verificado?.["details"])).toContain("revisor");
  });

  it("C5: el approve del revisor sobre el análisis deja pasar a planned", async () => {
    writeFixtureTicket(lab, { id: ID_ANALISIS, workflowStatus: "analyzed", type: "BUGFIX", module: "ENGINE" });
    appendReceipt(PATHS(), ID_ANALISIS, recibo({ ticketId: ID_ANALISIS, gate: "analysis" }));
    productor("analysis", "claude-opus-5-5", ID_ANALISIS);
    autorizar();
    expect(() => mover("planned", ID_ANALISIS)).toThrow(/gate-decide/);

    registrar(await decidir("approve", ID_ANALISIS, "analysis"), {}, ID_ANALISIS);
    mover("planned", ID_ANALISIS);

    expect(documento(ID_ANALISIS).fields.workflow_status).toBe("planned");
    expect(eventos("analysis-approved", ID_ANALISIS)).toHaveLength(1);
  });

  it("C6, C7: un reject queda en el recibo, no consume cupo y transition sigue pidiendo a una persona", async () => {
    preparar();
    const guardada = registrar(await decidir("reject"));

    expect(guardada.decision).toBe("reject");
    expect(ultimoRecibo().reviewerDecision?.decision).toBe("reject");
    expect(ultimoRecibo().humanDecision).toBeNull();
    expect(usos()).toBe(0);
    expect(guardada.cupoRestante).toBe(3);
    expect(eventos("plan-approved")).toHaveLength(0);
    expect(() => mover("approved")).toThrow(/gate-decide/);
  });

  describe("cada barrera rechaza sin escribir ni consumir cupo", () => {
    function noEscribe(fn: () => unknown, patron: RegExp): void {
      const antes = instantanea();
      expect(fn).toThrow(patron);
      expect(instantanea()).toEqual(antes);
      expect(usos()).toBe(0);
    }

    it("C8: el mismo modelo que produjo el plan, aun con otro prefijo de proveedor", () => {
      preparar();
      noEscribe(
        () => registrar(manual({ revisor: { provider: "openrouter", model: "anthropic/claude-opus-5-5", resolvedVersion: "claude-opus-5-5", effort: "high" } })),
        /mismo modelo que produjo/,
      );
    });

    it("C8: la versión que sirvió el proveedor también cuenta contra los productores", () => {
      preparar();
      noEscribe(
        () => registrar(manual({ revisor: { provider: "openrouter", model: REVISOR_POR_DEFECTO, resolvedVersion: "claude-opus-5-5", effort: "high" } })),
        /mismo modelo que produjo/,
      );
    });

    it("C9: sin productor registrado", () => {
      conRecibos(recibo());
      autorizar();
      noEscribe(() => registrar(manual()), /sin productor|no tiene productor registrado/);
    });

    it("C10: el ticket cambió después del recibo", () => {
      preparar();
      const ruta = join(lab, "tickets", "2026", ID, "ticket.md");
      writeFileSync(ruta, readFileSync(ruta, "utf8").replace("- Rollback: revertir", "- Rollback: no revertir"), "utf8");
      noEscribe(() => registrar(manual()), /otro texto del ticket/);
    });

    it("C11: prepararRevision rechaza el recibo desactualizado sin elegir revisor", () => {
      conRecibos(recibo());
      productor("plan", "claude-opus-5-5");
      const ruta = join(lab, "tickets", "2026", ID, "ticket.md");
      writeFileSync(ruta, readFileSync(ruta, "utf8").replace("- Rollback: revertir", "- Rollback: no revertir"), "utf8");
      const preparacion = prepararRevision({ paths: PATHS(), ticketId: ID, etapa: "plan" });
      expect(preparacion.ok).toBe(false);
      if (!preparacion.ok) {
        expect(preparacion.motivo).toMatch(/otro texto del ticket/);
        expect(preparacion.revisor).toBeNull();
      }
    });

    it("C12: un block no admite el registro, ni aunque la autorización lo cubra", () => {
      conRecibos(recibo({ outcome: "block", escalado: false }));
      productor("plan", "claude-opus-5-5");
      autorizar();
      noEscribe(() => registrar(manual()), /block/);
    });

    it("C13: un review sin proposiciones en banda media no admite el registro", () => {
      conRecibos(recibo({ propositions: [PROPOSICIONES_DE_UN_REVIEW[0] as GateReceipt["propositions"][number]] }));
      productor("plan", "claude-opus-5-5");
      autorizar();
      noEscribe(() => registrar(manual({ porProposicion: [] })), /ninguna quedó en banda media/);
    });

    it("C13: otra proposición fuera de banda que no aprobó no admite el registro", () => {
      const noAprobada = { ...(proposicion("otra", { valor: 0.2, enBanda: false }) as object), effect: { outcome: "block" } } as GateReceipt["propositions"][number];
      conRecibos(recibo({ propositions: [...PROPOSICIONES_DE_UN_REVIEW, noAprobada] }));
      productor("plan", "claude-opus-5-5");
      autorizar();
      noEscribe(() => registrar(manual()), /otra no aprobó/);
    });

    it("C14: una decisión que no cubre exactamente la banda media", () => {
      preparar();
      noEscribe(() => registrar(manual({ porProposicion: [{ id: "riesgos_cubren_impactos", respaldada: true, motivo: "ok" }] })), /la decisión cubre/);
      noEscribe(
        () => registrar(manual({ porProposicion: [...IDS_EN_DUDA, "inventada"].map((id) => ({ id, respaldada: true, motivo: "ok" })) })),
        /la decisión cubre/,
      );
    });

    it("C14: un approve con una proposición sin respaldo se rechaza", () => {
      preparar();
      noEscribe(
        () => registrar(manual({ porProposicion: [{ id: IDS_EN_DUDA[0] as string, respaldada: false, motivo: "no" }, { id: IDS_EN_DUDA[1] as string, respaldada: true, motivo: "ok" }] })),
        /exige que cada proposición esté respaldada/,
      );
    });

    it("C15: un SECURITY no admite el registro del revisor", () => {
      writeFixtureTicket(lab, { id: ID_SECURITY, workflowStatus: "planned", type: "SECURITY", module: "ENGINE" });
      appendReceipt(PATHS(), ID_SECURITY, recibo({ ticketId: ID_SECURITY }));
      productor("plan", "claude-opus-5-5", ID_SECURITY);
      autorizar();
      noEscribe(() => registrar(manual({}, ID_SECURITY), {}, ID_SECURITY), /SECURITY/);
    });

    it("C16: una autorización de modo on-approve no habilita el registro", () => {
      conRecibos(recibo());
      productor("plan", "claude-opus-5-5");
      autorizar({ mode: "on-approve" });
      noEscribe(() => registrar(manual()), /modo reviewer/);
    });

    it("C17: con el cupo del día agotado no se registra", () => {
      preparar();
      const otra = autorizar({ dailyQuota: 1 });
      registrarUsoDeCupoDeAprobacion({ root: lab, authorizationId: otra.id, ticketId: "BUGFIX-ENGINE-OTRO-20261007", stage: "plan", ahora: AHORA });
      // Las dos autorizaciones cubren al ticket: la primera con cupo decide, así que se revoca para aislar la barrera.
      const todas = readFileSync(approvalAuthorizationsPath(lab), "utf8");
      const primera = (JSON.parse(todas.split("\n")[0] as string) as { id: string }).id;
      revocarAutorizacionDeAprobacion({ root: lab, id: primera, actor: "Juan Andrade", reason: "aislar", source: "cli", ahora: AHORA, env: {} });
      const antes = usos();
      const fotos = instantanea();
      expect(() => registrar(manual())).toThrow(/cupo/);
      expect(instantanea()).toEqual(fotos);
      expect(usos()).toBe(antes);
    });

    it("C18: una sesión desatendida no puede registrar", () => {
      preparar();
      noEscribe(() => registrar(manual(), { VALMEN_UNATTENDED: "1" }), /desatendida/);
    });
  });

  it("C19: revocar la autorización después del registro hace que transition rechace el avance", async () => {
    bugfix();
    appendReceipt(PATHS(), ID_BUG, recibo({ ticketId: ID_BUG }));
    productor("plan", "claude-opus-5-5", ID_BUG);
    const a = autorizar();
    registrar(await decidir("approve", ID_BUG), {}, ID_BUG);
    // Control: antes de revocar, el mismo avance sí procede (se prueba en C4); aquí se revoca primero.
    revocarAutorizacionDeAprobacion({ root: lab, id: a.id, actor: "Juan Andrade", reason: "ya no", source: "cli", ahora: new Date(AHORA.getTime() + 500), env: {} });

    expect(() => mover("approved", ID_BUG, 2000)).toThrow(/ya no está vigente/);
    expect(documento(ID_BUG).fields.workflow_status).toBe("planned");
  });

  it("C19: si el productor registrado pasa a ser el revisor, transition rechaza el avance", async () => {
    bugfix();
    preparar(ID_BUG);
    registrar(await decidir("approve", ID_BUG), {}, ID_BUG);
    productor("plan", REVISOR_POR_DEFECTO, ID_BUG);

    expect(() => mover("approved", ID_BUG)).toThrow(/mismo modelo que produjo/);
  });

  it("C19: una línea de recibo con reviewerDecision forjada sobre un block no deja avanzar", () => {
    bugfix();
    const bloqueado = recibo({ ticketId: ID_BUG, outcome: "block", escalado: false });
    productor("plan", "claude-opus-5-5", ID_BUG);
    const a = autorizar();
    appendReceipt(PATHS(), ID_BUG, {
      ...bloqueado,
      reviewerDecision: { decision: "approve", reason: "forjada", porProposicion: [], revisor: manual().revisor, productores: [], authorizationId: a.id, authorizationHash: a.hash, receiptStateHash: bloqueado.stateHash, usage: manual().usage, decidedAt: AHORA.toISOString() },
    } as GateReceipt);
    expect(() => mover("approved", ID_BUG)).toThrow(/block|Ni el modelo/);
  });

  it("C21: registrar dos veces sobre el mismo recibo no escribe otra versión ni consume otro cupo", async () => {
    preparar();
    const resultado = await decidir("approve");
    registrar(resultado);
    const antes = instantanea();

    expect(() => registrar(resultado)).toThrow(/ya tiene la decisión del revisor/);

    expect(instantanea()).toEqual(antes);
    expect(versiones()).toBe(2);
    expect(usos()).toBe(1);
  });

  it("C24: valmen review-agent --record imprime la decisión registrada con la autorización y el cupo restante", async () => {
    preparar();
    const { fetchImpl } = red(() => respuestaDeChat(decision("approve", IDS_EN_DUDA)));

    const r = await reviewAgentCommand(PATHS(), { id: ID, stage: "plan", record: true }, { apiKey: "k", fetchImpl });

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Decisión del revisor: approve");
    expect(r.stdout).toContain("Registrada como decisión del revisor");
    expect(r.stdout).toMatch(/autorización APA-/);
    expect(r.stdout).toContain("quedan 2 hoy");
    expect(r.stdout).not.toContain("No se registró");
    expect(ultimoRecibo().reviewerDecision?.decision).toBe("approve");
    expect(usos()).toBe(1);
  });

  it("C24: sin --record el comando sigue sin escribir", async () => {
    preparar();
    const { fetchImpl } = red(() => respuestaDeChat(decision("approve", IDS_EN_DUDA)));
    const antes = instantanea();
    const r = await reviewAgentCommand(PATHS(), { id: ID, stage: "plan" }, { apiKey: "k", fetchImpl });
    expect(r.stdout).toContain("No se registró");
    expect(instantanea()).toEqual(antes);
  });

  it("C24: --record sobre un block sale con error y no escribe", async () => {
    conRecibos(recibo({ outcome: "block", escalado: false }));
    productor("plan", "claude-opus-5-5");
    autorizar();
    const antes = instantanea();
    const r = await reviewAgentCommand(PATHS(), { id: ID, stage: "plan", record: true }, { apiKey: "k", fetchImpl: red(() => respuestaDeChat(decision("approve", IDS_EN_DUDA))).fetchImpl });
    expect(r.exitCode).toBe(3);
    expect(instantanea()).toEqual(antes);
  });
});
