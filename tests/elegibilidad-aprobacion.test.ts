/**
 * La elegibilidad para aprobar un análisis o un plan por autorización, decidida en código
 * (R-APRO-004 y R-APRO-005).
 *
 * Un caso por barrera, y un caso de control que sí es elegible: una prueba de «no elegible» solo
 * dice algo si el mismo ticket, sin la barrera, pasa. Cada barrera se prueba con una autorización
 * vigente que cubre al ticket, porque lo que importa es que la autorización no la levante.
 */
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { approvalEligibilityCommand } from "../packages/cli/src/commands.js";
import { USAGE, parseArgs } from "../packages/cli/src/main.js";
import {
  DEFAULT_POLICY,
  type GateReceipt,
  type Proposition,
  type PropositionAnswer,
  buildReceipt,
  decide,
  withHumanDecision,
} from "../packages/gate/src/index.js";
import {
  appendReceipt,
  approvalAuthorizationsPath,
  autorizacionDeAprobacionQueCubre,
  crearAutorizacionDeAprobacion,
  elegibilidadDeAprobacion,
  hashDeAutorizacionDeAprobacion,
  registrarUsoDeCupoDeAprobacion,
  revocarAutorizacionDeAprobacion,
  type RegistryPaths,
  type ResultadoDeElegibilidadDeAprobacion,
} from "../packages/engine/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const AHORA = new Date("2026-10-07T08:00:00.000Z");
const SUFIJO = "POS-ELEG-APRO-20261007";
const ID = `BUGFIX-${SUFIJO}`;

let root: string;
const paths = (): RegistryPaths => ({ root, ticketsDir: "tickets" });

function ticket(
  opciones: { tipo?: string; riesgo?: string; impactos?: string[]; modulo?: string; diagnostico?: string } = {},
): string {
  const tipo = opciones.tipo ?? "BUGFIX";
  return writeFixtureTicket(root, {
    id: `${tipo}-${SUFIJO}`,
    workflowStatus: "analyzed",
    type: tipo,
    module: opciones.modulo ?? "POS",
    ...(opciones.riesgo === undefined ? {} : { riskLevel: opciones.riesgo }),
    ...(opciones.impactos === undefined ? {} : { impacts: opciones.impactos }),
    ...(opciones.diagnostico === undefined ? {} : { diagnostico: opciones.diagnostico }),
  });
}

/** Un diagnóstico con la línea de impactos que se pide. */
const diagnosticoCon = (impactos: string): string =>
  [
    "- Archivos y flujo investigados: `BackEnd/pos/filters.py` define `OrderFilter.number` con `lookup_expr='exact'`.",
    "- Causa raíz o hipótesis: el `lookup_expr` es exacto cuando la pantalla documenta búsqueda parcial.",
    "- Riesgos y compatibilidad: cambiar el lookup a `icontains` amplía el conjunto de resultados.",
    `- Impactos de sync, migración, Docker o despliegue: ${impactos}`,
  ].join("\n");

const PROPOSICIONES: Proposition[] = [{ id: "cubre_todos_los_criterios", kind: "noul", instructions: "cubre", weight: 3 }];
const APPROVE = 0.99;
const REVIEW = 0.5;
const BLOCK = 0.01;

/** Un recibo de la compuerta con el veredicto que da el valor: approve, review o block. */
function recibo(gate: string, valor: number, ticketId = ID, intento = 1): GateReceipt {
  const respuestas: PropositionAnswer[] = [{ id: "cubre_todos_los_criterios", kind: "noul", value: valor }];
  return buildReceipt({
    id: `GR-20261007-${ticketId}-${gate}-${intento}`,
    gate,
    propositions: PROPOSICIONES,
    policy: DEFAULT_POLICY,
    subject: { type: "ticket", id: ticketId, revision: String(intento) },
    decision: decide(PROPOSICIONES, respuestas, DEFAULT_POLICY),
    state: { ticket: ticketId },
    answers: respuestas,
    mechanicalChecks: [],
    model: null,
    usage: null,
    latencyMs: 1,
    decidedAt: `2026-10-07T0${intento}:00:00.000Z`,
  });
}

const guardar = (gate: string, valor: number, ticketId = ID, intento = 1): GateReceipt => {
  const r = recibo(gate, valor, ticketId, intento);
  appendReceipt(paths(), ticketId, r);
  return r;
};

function autorizar(extra: Partial<Parameters<typeof crearAutorizacionDeAprobacion>[0]> = {}) {
  return crearAutorizacionDeAprobacion({
    root,
    actor: "Juan Andrade",
    quote: "Autorizo aprobar solos los planes de bajo riesgo de pos",
    types: ["BUGFIX"],
    modules: ["pos"],
    maxRisk: "normal",
    dailyQuota: 2,
    validDays: 30,
    source: "cli",
    ahora: AHORA,
    env: {},
    ...extra,
  });
}

const evaluar = (opciones: { id?: string; etapa?: string; ahora?: Date } = {}): ResultadoDeElegibilidadDeAprobacion =>
  elegibilidadDeAprobacion({ paths: paths(), ticketId: opciones.id ?? ID, etapa: opciones.etapa ?? "plan", ahora: opciones.ahora ?? AHORA });

const incumplidas = (r: ResultadoDeElegibilidadDeAprobacion): string[] => r.reglas.filter((x) => !x.cumple).map((x) => x.regla);
const detalle = (r: ResultadoDeElegibilidadDeAprobacion, regla: string): string => r.reglas.find((x) => x.regla === regla)?.detalle ?? "";

/** El contenido de todos los archivos del registro, para comprobar que una lectura no escribe. */
function fotografia(dir: string = root, base: string = root): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) Object.assign(salida, fotografia(ruta, base));
    else salida[ruta.slice(base.length)] = readFileSync(ruta, "utf8");
  }
  return salida;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-eleg-apro-"));
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(root, ".valmen", "config.yaml"), "name: Demo\n", "utf8");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("un ticket que cumple todo (control)", () => {
  it("es elegible, cita la autorización con su id y su hash y no deriva a nadie", () => {
    ticket();
    guardar("plan", APPROVE);
    const a = autorizar();
    const r = evaluar();
    expect(r.elegible).toBe(true);
    expect(incumplidas(r)).toEqual([]);
    expect(r.reglas.map((x) => x.regla)).toEqual(["etapa", "tipo", "despliegue", "qa-mechanical", "compuerta", "autorizacion", "cupo"]);
    expect(r.autorizacion).toEqual({ id: a.id, hash: a.hash });
    expect(r.derivableAlRevisor).toBe(false);
  });

  it("es una función pura: la misma entrada da el mismo resultado y no escribe nada en el registro", () => {
    ticket();
    guardar("plan", APPROVE);
    autorizar();
    const antes = fotografia();
    const primera = evaluar();
    expect(evaluar()).toEqual(primera);
    expect(fotografia()).toEqual(antes);
  });

  it("también lo es en la etapa de análisis, con el recibo de esa compuerta", () => {
    ticket();
    guardar("analysis", APPROVE);
    autorizar();
    expect(evaluar({ etapa: "analysis" }).elegible).toBe(true);
  });

  it("un recibo de otra etapa no cuenta: un plan en block no impide aprobar el análisis, ni al revés", () => {
    ticket();
    guardar("analysis", APPROVE);
    guardar("plan", BLOCK);
    autorizar();
    expect(evaluar({ etapa: "analysis" }).elegible).toBe(true);
    expect(incumplidas(evaluar({ etapa: "plan" }))).toEqual(["compuerta"]);
  });
});

describe("C1. SECURITY no es elegible nunca", () => {
  it("aunque una autorización vigente listara SECURITY, su módulo y su riesgo", () => {
    const id = ticket({ tipo: "SECURITY" });
    guardar("plan", APPROVE, id);
    // `crear` rechaza SECURITY; se escribe a mano un renglón con el hash correcto para probar que
    // la barrera no depende de que el registro esté bien formado.
    const base = {
      kind: "approval-authorization-created" as const,
      version: 1 as const,
      id: "APA-20261007-aaaaaa",
      types: ["SECURITY"],
      modules: ["pos"],
      maxRisk: "normal",
      impacts: [],
      stages: ["analysis", "plan"],
      mode: "on-approve",
      dailyQuota: 5,
      validFrom: AHORA.toISOString(),
      validUntil: new Date(AHORA.getTime() + 30 * 86_400_000).toISOString(),
      actor: "Alguien",
      quote: "frase",
      source: "cli",
      createdAt: AHORA.toISOString(),
    };
    mkdirSync(join(root, ".valmen", "approval"), { recursive: true });
    appendFileSync(approvalAuthorizationsPath(root), `${JSON.stringify({ ...base, hash: hashDeAutorizacionDeAprobacion(base) })}\n`, "utf8");
    // La consulta de siempre sí lo cubriría: lo que lo frena es la regla `tipo`.
    expect(autorizacionDeAprobacionQueCubre(root, { type: "SECURITY", module: "POS", riskLevel: "normal", stage: "plan" }, AHORA)).not.toBeNull();

    const r = evaluar({ id });
    expect(r.elegible).toBe(false);
    expect(incumplidas(r)).toContain("tipo");
    expect(detalle(r, "tipo")).toMatch(/SECURITY.*nunca/);
    expect(r.autorizacion).toBeNull();
    expect(r.derivableAlRevisor).toBe(false);
  });

  it("con una autorización común tampoco, y el mismo ticket como BUGFIX sí lo es", () => {
    const id = ticket({ tipo: "SECURITY" });
    guardar("plan", APPROVE, id);
    autorizar({ types: ["BUGFIX", "FEATURE"] });
    expect(evaluar({ id }).elegible).toBe(false);
    ticket();
    guardar("plan", APPROVE);
    expect(evaluar().elegible).toBe(true);
  });
});

describe("C2. un block de la compuerta de la etapa no se aprueba sin una persona", () => {
  it("un recibo block deja el ticket no elegible aunque una autorización vigente lo cubra", () => {
    ticket();
    autorizar();
    const bloqueo = guardar("plan", BLOCK);
    const r = evaluar();
    expect(r.elegible).toBe(false);
    expect(incumplidas(r)).toEqual(["compuerta"]);
    expect(detalle(r, "compuerta")).toContain(bloqueo.id);
    expect(detalle(r, "compuerta")).toMatch(/block/);
    expect(r.autorizacion).toBeNull();
    expect(r.derivableAlRevisor).toBe(false);
  });

  it("un block que una persona aprobó ya no espera a nadie, y lo dice", () => {
    ticket();
    autorizar();
    const bloqueo = recibo("plan", BLOCK);
    appendReceipt(paths(), ID, bloqueo);
    appendReceipt(paths(), ID, withHumanDecision(bloqueo, { actor: "Juan Andrade", decision: "approve", reason: "sigo pese al bloqueo", channel: "cli", decidedAt: AHORA.toISOString() }));
    const r = evaluar();
    expect(r.elegible).toBe(true);
    expect(detalle(r, "compuerta")).toMatch(/Juan Andrade.*no necesita la autorización/);
  });

  it("un review que una persona rechazó queda como un block", () => {
    ticket();
    autorizar();
    const revision = recibo("plan", REVIEW);
    appendReceipt(paths(), ID, revision);
    appendReceipt(paths(), ID, withHumanDecision(revision, { actor: "Juan Andrade", decision: "reject", reason: "falta un criterio", channel: "cli", decidedAt: AHORA.toISOString() }));
    const r = evaluar();
    expect(r.elegible).toBe(false);
    expect(detalle(r, "compuerta")).toMatch(/rechazó/);
    expect(r.derivableAlRevisor).toBe(false);
  });

  it("sin recibo de la compuerta no es elegible: hay que correrla antes", () => {
    ticket();
    autorizar();
    const r = evaluar();
    expect(incumplidas(r)).toEqual(["compuerta"]);
    expect(detalle(r, "compuerta")).toMatch(/no tiene recibo/);
  });

  it("vale el último recibo vigente: un block corregido y vuelto a evaluar en approve es elegible", () => {
    ticket();
    autorizar();
    guardar("plan", BLOCK, ID, 1);
    expect(evaluar().elegible).toBe(false);
    guardar("plan", APPROVE, ID, 2);
    expect(evaluar().elegible).toBe(true);
  });
});

describe("C3. un block de qa-mechanical no se aprueba", () => {
  it("un último recibo block de qa-mechanical deja el ticket no elegible", () => {
    ticket();
    guardar("plan", APPROVE);
    autorizar();
    const fallo = guardar("qa-mechanical", BLOCK);
    const r = evaluar();
    expect(r.elegible).toBe(false);
    expect(incumplidas(r)).toEqual(["qa-mechanical"]);
    expect(detalle(r, "qa-mechanical")).toContain(fallo.id);
  });

  it("si la compuerta mecánica se corrigió y pasó, el ticket vuelve a ser elegible", () => {
    ticket();
    guardar("plan", APPROVE);
    autorizar();
    guardar("qa-mechanical", BLOCK, ID, 1);
    expect(evaluar().elegible).toBe(false);
    guardar("qa-mechanical", APPROVE, ID, 2);
    expect(evaluar().elegible).toBe(true);
  });
});

describe("C4. un diagnóstico que declara despliegue es de una persona", () => {
  it.each([
    "Despliegue a producción del servicio de órdenes.",
    "Requiere un deploy coordinado con el cliente.",
    "Sync y despliegue de la imagen.",
  ])("no es elegible bajo ninguna autorización: %s", (impactos) => {
    ticket({ diagnostico: diagnosticoCon(impactos) });
    guardar("plan", APPROVE);
    autorizar({ types: ["BUGFIX", "FEATURE", "SYNC"], impacts: ["sync_impact", "migration_impact", "docker_impact"] });
    const r = evaluar();
    expect(r.elegible).toBe(false);
    expect(incumplidas(r)).toEqual(["despliegue"]);
    expect(detalle(r, "despliegue")).toMatch(/despliegue es de una persona/);
  });

  it("«ninguno» no es un despliegue aunque la etiqueta de la línea nombre la palabra", () => {
    ticket({ diagnostico: diagnosticoCon("ninguno.") });
    guardar("plan", APPROVE);
    autorizar();
    const r = evaluar();
    expect(r.elegible).toBe(true);
    expect(detalle(r, "despliegue")).toMatch(/no declara despliegue/);
  });
});

describe("C5. un tipo que la autorización no lista es de una persona", () => {
  it("un ticket INTEGRATION con una autorización que solo cubre BUGFIX no es elegible y el motivo nombra el tipo", () => {
    const id = ticket({ tipo: "INTEGRATION" });
    guardar("plan", APPROVE, id);
    const a = autorizar({ types: ["BUGFIX"] });
    const r = evaluar({ id });
    expect(r.elegible).toBe(false);
    expect(incumplidas(r)).toEqual(["autorizacion", "cupo"]);
    expect(detalle(r, "autorizacion")).toContain("INTEGRATION");
    expect(detalle(r, "autorizacion")).toContain(a.id);
    expect(r.autorizacion).toBeNull();
  });

  it("sin ninguna autorización vigente lo dice, y una revocada o vencida no cuenta", () => {
    ticket();
    guardar("plan", APPROVE);
    expect(detalle(evaluar(), "autorizacion")).toMatch(/no hay ninguna autorización de aprobación vigente/);
    const a = autorizar();
    revocarAutorizacionDeAprobacion({ root, id: a.id, actor: "Juan Andrade", reason: "prueba", source: "cli", ahora: AHORA, env: {} });
    expect(evaluar().elegible).toBe(false);
    autorizar({ validDays: 1 });
    expect(evaluar({ ahora: new Date(AHORA.getTime() + 3 * 86_400_000) }).elegible).toBe(false);
  });
});

describe("C6. SYNC, INTEGRATION y AGENT son elegibles si la autorización los lista", () => {
  it.each(["SYNC", "INTEGRATION", "AGENT"])("%s con la compuerta en approve", (tipo) => {
    const id = ticket({ tipo });
    guardar("plan", APPROVE, id);
    const sinTipo = autorizar({ types: ["BUGFIX", "FEATURE"] });
    expect(evaluar({ id }).elegible).toBe(false);
    revocarAutorizacionDeAprobacion({ root, id: sinTipo.id, actor: "Juan Andrade", reason: "prueba", source: "cli", ahora: AHORA, env: {} });
    const conTipo = autorizar({ types: [tipo] });
    const r = evaluar({ id });
    expect(r.elegible).toBe(true);
    expect(r.autorizacion).toEqual({ id: conTipo.id, hash: conTipo.hash });
  });

  it("listar el tipo no basta si la compuerta no está en approve", () => {
    const id = ticket({ tipo: "AGENT" });
    guardar("plan", REVIEW, id);
    autorizar({ types: ["AGENT"] });
    expect(evaluar({ id }).elegible).toBe(false);
  });
});

describe("C7. un impacto solo se admite si la autorización lo lista", () => {
  it.each(["migration_impact", "docker_impact", "sync_impact"])("%s", (impacto) => {
    ticket({ impactos: [impacto] });
    guardar("plan", APPROVE);
    const sinImpacto = autorizar();
    const r = evaluar();
    expect(r.elegible).toBe(false);
    expect(detalle(r, "autorizacion")).toContain(impacto);

    // Una autorización que lista otro impacto tampoco lo cubre.
    const otro = impacto === "docker_impact" ? "migration_impact" : "docker_impact";
    revocarAutorizacionDeAprobacion({ root, id: sinImpacto.id, actor: "Juan Andrade", reason: "prueba", source: "cli", ahora: AHORA, env: {} });
    const conOtro = autorizar({ impacts: [otro] });
    expect(evaluar().elegible).toBe(false);

    revocarAutorizacionDeAprobacion({ root, id: conOtro.id, actor: "Juan Andrade", reason: "prueba", source: "cli", ahora: AHORA, env: {} });
    const conImpacto = autorizar({ impacts: [impacto] });
    const aprobado = evaluar();
    expect(aprobado.elegible).toBe(true);
    expect(aprobado.autorizacion?.id).toBe(conImpacto.id);
  });

  it("con varios impactos declarados hay que listar todos", () => {
    ticket({ impactos: ["migration_impact", "docker_impact"] });
    guardar("plan", APPROVE);
    autorizar({ impacts: ["migration_impact"] });
    expect(evaluar().elegible).toBe(false);
    autorizar({ impacts: ["migration_impact", "docker_impact"] });
    expect(evaluar().elegible).toBe(true);
  });
});

describe("el resto de lo que la autorización declara: módulo, riesgo y etapa", () => {
  it("un módulo que la autorización no lista deja el ticket para una persona, con el motivo", () => {
    ticket({ modulo: "INVENTARIO" });
    guardar("plan", APPROVE);
    autorizar();
    expect(detalle(evaluar(), "autorizacion")).toMatch(/no lista el módulo INVENTARIO/);
    autorizar({ modules: ["inventario"] });
    expect(evaluar().elegible).toBe(true);
  });

  it("un riesgo mayor que el máximo de la autorización también", () => {
    ticket({ riesgo: "high" });
    guardar("plan", APPROVE);
    autorizar();
    expect(detalle(evaluar(), "autorizacion")).toMatch(/riesgo máximo es normal y el ticket es high/);
  });

  it("una etapa que la autorización no cubre también, y la que sí cubre es elegible", () => {
    ticket();
    guardar("plan", APPROVE);
    guardar("analysis", APPROVE);
    autorizar({ stages: ["analysis"] });
    expect(detalle(evaluar({ etapa: "plan" }), "autorizacion")).toMatch(/no cubre la etapa plan/);
    expect(evaluar({ etapa: "analysis" }).elegible).toBe(true);
  });

  it("un riesgo desconocido no se asume cubierto", () => {
    ticket({ riesgo: "inventado" });
    guardar("plan", APPROVE);
    autorizar();
    const r = evaluar();
    expect(r.elegible).toBe(false);
    expect(detalle(r, "autorizacion")).toMatch(/inventado/);
  });

  it("una etapa que no es analysis ni plan falla con su motivo y las demás reglas se evalúan igual", () => {
    ticket();
    guardar("plan", APPROVE);
    autorizar();
    const r = evaluar({ etapa: "qa" });
    expect(r.elegible).toBe(false);
    expect(incumplidas(r)).toContain("etapa");
    expect(detalle(r, "etapa")).toContain("«qa»");
    expect(r.reglas).toHaveLength(7);
  });

  it("un ticket que no existe falla en voz alta", () => {
    expect(() => evaluar({ id: "BUGFIX-POS-NO-EXISTE-20261007" })).toThrow(/No existe el ticket/);
  });
});

describe("C8. un recibo en review no es elegible; solo se deriva al revisor si la autorización es de modo reviewer", () => {
  it("con una autorización on-approve no es elegible ni derivable", () => {
    ticket();
    const revision = guardar("plan", REVIEW);
    autorizar({ mode: "on-approve" });
    const r = evaluar();
    expect(r.elegible).toBe(false);
    expect(incumplidas(r)).toEqual(["compuerta"]);
    expect(detalle(r, "compuerta")).toContain(revision.id);
    expect(detalle(r, "compuerta")).toMatch(/review/);
    expect(r.autorizacion).toBeNull();
    expect(r.derivableAlRevisor).toBe(false);
  });

  it("con una autorización reviewer no es elegible pero sí derivable al revisor", () => {
    ticket();
    guardar("plan", REVIEW);
    autorizar({ mode: "reviewer" });
    const r = evaluar();
    expect(r.elegible).toBe(false);
    expect(r.autorizacion).toBeNull();
    expect(r.derivableAlRevisor).toBe(true);
  });

  it("derivable exige que todo lo demás cumpla: un block, SECURITY, un qa-mechanical en block o un cupo agotado no se derivan", () => {
    autorizar({ mode: "reviewer", types: ["BUGFIX", "FEATURE"], dailyQuota: 1 });

    ticket();
    guardar("plan", BLOCK);
    expect(evaluar().derivableAlRevisor).toBe(false);

    guardar("plan", REVIEW, ID, 2);
    expect(evaluar().derivableAlRevisor).toBe(true);
    guardar("qa-mechanical", BLOCK);
    expect(evaluar().derivableAlRevisor).toBe(false);
    guardar("qa-mechanical", APPROVE, ID, 2);
    expect(evaluar().derivableAlRevisor).toBe(true);

    const seguridad = ticket({ tipo: "SECURITY" });
    guardar("plan", REVIEW, seguridad);
    expect(evaluar({ id: seguridad }).derivableAlRevisor).toBe(false);

    registrarUsoDeCupoDeAprobacion({ root, authorizationId: leerIdDeLaUnica(), ticketId: "OTRO-POS-X-20261007", stage: "plan", ahora: AHORA });
    expect(evaluar().derivableAlRevisor).toBe(false);
  });

  it("un review que una persona ya firmó como approve no necesita la autorización", () => {
    ticket();
    autorizar();
    const revision = recibo("plan", REVIEW);
    appendReceipt(paths(), ID, revision);
    appendReceipt(paths(), ID, withHumanDecision(revision, { actor: "Juan Andrade", decision: "approve", reason: "de acuerdo", channel: "cli", decidedAt: AHORA.toISOString() }));
    const r = evaluar();
    expect(r.elegible).toBe(true);
    expect(detalle(r, "compuerta")).toMatch(/Juan Andrade.*no necesita la autorización/);
    expect(r.derivableAlRevisor).toBe(false);
  });
});

function leerIdDeLaUnica(): string {
  const [linea] = readFileSync(approvalAuthorizationsPath(root), "utf8").split("\n");
  return (JSON.parse(linea ?? "{}") as { id: string }).id;
}

describe("C9. una autorización con el cupo del día agotado deja el ticket no elegible", () => {
  it("con el cupo gastado hoy no es elegible, y el cupo de ayer no cuenta", () => {
    ticket();
    guardar("plan", APPROVE);
    const a = autorizar({ dailyQuota: 1 });
    expect(evaluar().elegible).toBe(true);

    registrarUsoDeCupoDeAprobacion({ root, authorizationId: a.id, ticketId: "OTRO-POS-X-20261007", stage: "plan", ahora: AHORA });
    const r = evaluar();
    expect(r.elegible).toBe(false);
    expect(incumplidas(r)).toEqual(["cupo"]);
    expect(detalle(r, "cupo")).toMatch(/agotó su cupo diario \(1\)/);
    expect(r.autorizacion).toBeNull();

    // Mañana el cupo vuelve.
    expect(evaluar({ ahora: new Date(AHORA.getTime() + 86_400_000) }).elegible).toBe(true);
  });

  it("el uso de otra autorización no gasta este cupo", () => {
    ticket();
    guardar("plan", APPROVE);
    const a = autorizar({ dailyQuota: 1 });
    registrarUsoDeCupoDeAprobacion({ root, authorizationId: "APA-20261007-ffffff", ticketId: "OTRO-POS-X-20261007", stage: "plan", ahora: AHORA });
    expect(evaluar().autorizacion?.id).toBe(a.id);
  });
});

describe("C10. el resultado devuelve todas las reglas que fallan con su motivo", () => {
  it("un ticket que incumple varias barreras las lista todas, no solo la primera", () => {
    const id = ticket({ tipo: "SECURITY", diagnostico: diagnosticoCon("Despliegue a producción.") });
    guardar("plan", BLOCK, id);
    guardar("qa-mechanical", BLOCK, id);
    autorizar();
    const r = evaluar({ id });
    expect(r.elegible).toBe(false);
    expect(incumplidas(r)).toEqual(["tipo", "despliegue", "qa-mechanical", "compuerta", "autorizacion", "cupo"]);
    for (const x of r.reglas) expect(x.detalle.length).toBeGreaterThan(10);
    expect(r.autorizacion).toBeNull();
  });

  it("si es elegible, devuelve el id y el hash de la autorización que lo cubre, y el hash es el del registro", () => {
    ticket();
    guardar("plan", APPROVE);
    autorizar({ types: ["FEATURE"] });
    const buena = autorizar({ types: ["BUGFIX"] });
    const r = evaluar();
    expect(r.elegible).toBe(true);
    expect(r.autorizacion).toEqual({ id: buena.id, hash: buena.hash });
    expect(r.autorizacion?.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(r.reglas.every((x) => x.cumple)).toBe(true);
  });
});

describe("C11. valmen approval-eligibility muestra la decisión y sus reglas sin escribir", () => {
  it("un ticket elegible: lo dice, lista una línea por regla y cita la autorización, con salida 0", () => {
    ticket();
    guardar("plan", APPROVE);
    const a = autorizar();
    const antes = fotografia();
    const r = approvalEligibilityCommand(paths(), { id: ID, stage: "plan" }, { ahora: AHORA });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(`${ID} (plan): ELEGIBLE`);
    expect(r.stdout.split("\n").filter((l) => /^ {2}[✓✗] /.test(l))).toHaveLength(7);
    expect(r.stdout).toContain(`Respaldada por la autorización ${a.id} (${a.hash})`);
    expect(fotografia()).toEqual(antes);
  });

  it("uno que no lo es: sale con el código de invariante y muestra el motivo de cada regla que falla", () => {
    ticket();
    guardar("plan", BLOCK);
    autorizar();
    const antes = fotografia();
    const r = approvalEligibilityCommand(paths(), { id: ID, stage: "plan" }, { ahora: AHORA });
    expect(r.exitCode).toBe(3);
    expect(r.stdout).toContain("NO ELEGIBLE");
    expect(r.stdout).toMatch(/✗ compuerta: .*block/);
    expect(r.stdout).not.toContain("Respaldada por");
    expect(fotografia()).toEqual(antes);
  });

  it("derivable al revisor lo dice", () => {
    ticket();
    guardar("plan", REVIEW);
    autorizar({ mode: "reviewer" });
    const r = approvalEligibilityCommand(paths(), { id: ID, stage: "plan" }, { ahora: AHORA });
    expect(r.exitCode).toBe(3);
    expect(r.stdout).toContain("Derivable al revisor");
  });

  it("--json imprime el resultado completo", () => {
    ticket();
    guardar("plan", APPROVE);
    const a = autorizar();
    const r = approvalEligibilityCommand(paths(), { id: ID, stage: "plan", json: true }, { ahora: AHORA });
    const json = JSON.parse(r.stdout) as ResultadoDeElegibilidadDeAprobacion;
    expect(json).toMatchObject({ ticketId: ID, etapa: "plan", elegible: true, derivableAlRevisor: false, autorizacion: { id: a.id, hash: a.hash } });
    expect(json.reglas).toHaveLength(7);
    expect(r.exitCode).toBe(0);
  });

  it("pide --id y --stage, y un ticket inexistente falla sin escribir", () => {
    expect(approvalEligibilityCommand(paths(), { stage: "plan" }).exitCode).toBe(2);
    expect(approvalEligibilityCommand(paths(), { id: ID }).stderr).toMatch(/--stage analysis\|plan/);
    const antes = fotografia();
    const r = approvalEligibilityCommand(paths(), { id: "BUGFIX-POS-NO-EXISTE-20261007", stage: "plan" });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/No existe el ticket/);
    expect(fotografia()).toEqual(antes);
  });

  it("el CLI lee --stage como valor y la ayuda lo documenta", () => {
    const opciones = parseArgs(["approval-eligibility", "--id", ID, "--stage", "analysis", "--json"]);
    expect(opciones.positionals).toEqual(["approval-eligibility"]);
    expect(opciones.flags).toEqual({ id: ID, stage: "analysis", json: true });
    expect(USAGE).toContain("approval-eligibility --id <ID> --stage analysis|plan [--json]");
  });
});
