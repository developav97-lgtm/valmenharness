/**
 * La pantalla de autorizaciones con casillas (FEATURE-MC-PANTALLA-AUTORIZACIONES-20261009).
 *
 * Todo corre en raíces temporales: ninguna prueba toca `.valmen/approval/` ni `.valmen/qa/` del
 * repositorio, y la última comprueba con sha256 que siguen igual.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { readAuthorizationModules } from "../packages/adapter/src/index.js";
import {
  approvalAuthorizationsPath,
  crearAutorizacion,
  crearAutorizacionDeAprobacion,
  elegibilidadDeAprobacion,
  hashDeAutorizacionDeAprobacion,
  opcionesDeAutorizacion,
  type RegistryPaths,
} from "../packages/engine/src/index.js";
import { createMissionControl, defaultContext } from "../packages/server/src/server.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AHORA = new Date("2026-10-07T08:00:00.000Z");
const FRASE = "Autorizo aprobar solos los planes de bajo riesgo de web";

const sha = (ruta: string): string => (existsSync(ruta) ? createHash("sha256").update(readFileSync(ruta)).digest("hex") : "ausente");
const RUTAS_DEL_REPO = [join(REPO, ".valmen", "approval", "authorizations.jsonl"), join(REPO, ".valmen", "qa", "authorizations.jsonl")];
let huellasIniciales: string[] = [];

let roots: string[] = [];
function raiz(config = "name: Demo\n"): string {
  const r = mkdtempSync(join(tmpdir(), "valmen-pant-aut-"));
  mkdirSync(join(r, ".valmen"), { recursive: true });
  writeFileSync(join(r, ".valmen", "config.yaml"), config, "utf8");
  roots.push(r);
  return r;
}
const rutas = (r: string): RegistryPaths => ({ root: r, ticketsDir: "tickets" });

let n = 0;
function ticket(r: string, modulo: string, tipo = "FEATURE"): void {
  n += 1;
  writeFixtureTicket(r, { id: `${tipo}-${modulo}-PA${n}-20261007`, workflowStatus: "analyzed", type: tipo, module: modulo });
}

beforeAll(() => {
  huellasIniciales = RUTAS_DEL_REPO.map(sha);
});
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots = [];
});

describe("opcionesDeAutorizacion", () => {
  it("C1 cuenta los módulos del registro y los ordena por tickets", () => {
    const r = raiz();
    ticket(r, "WEB");
    ticket(r, "ENGINE");
    ticket(r, "WEB");
    expect(opcionesDeAutorizacion(r, rutas(r)).modules).toEqual([
      { module: "WEB", tickets: 2 },
      { module: "ENGINE", tickets: 1 },
    ]);
  });

  it("C2 sin la clave, la fuente es el registro", () => {
    const r = raiz();
    ticket(r, "WEB");
    expect(opcionesDeAutorizacion(r, rutas(r)).source).toBe("registry");
  });

  it("C3 dos raíces no se mezclan", () => {
    const a = raiz();
    const b = raiz();
    ticket(a, "SOLOENA");
    ticket(b, "ENB");
    expect(opcionesDeAutorizacion(b, rutas(b)).modules.map((m) => m.module)).toEqual(["ENB"]);
  });

  it("C4 con la clave, la fuente es la configuración", () => {
    const r = raiz("name: Demo\nauthorization-modules:\n  - POS\n  - RESTAURANTE\n");
    expect(opcionesDeAutorizacion(r, rutas(r)).source).toBe("config");
  });

  it("C5 con la clave, la lista reemplaza al registro", () => {
    const r = raiz("name: Demo\nauthorization-modules:\n  - POS\n  - RESTAURANTE\n");
    ticket(r, "RELLENO");
    const modulos = opcionesDeAutorizacion(r, rutas(r)).modules.map((m) => m.module);
    expect(modulos).toEqual(["POS", "RESTAURANTE"]);
    expect(modulos).not.toContain("RELLENO");
  });

  it("C6 una lista vacía falla", () => {
    expect(() => readAuthorizationModules({ "authorization-modules": [] })).toThrow(/no puede estar vacía/);
    expect(readAuthorizationModules({})).toBeNull();
  });

  it("C8 a C12 las constantes del motor", () => {
    const o = opcionesDeAutorizacion(raiz(), rutas(raiz()));
    expect(o.approval.types).toEqual(["BUGFIX", "IMPROVEMENT", "CHORE", "FEATURE", "SYNC", "INTEGRATION", "AGENT"]);
    expect(o.qa.types).toEqual(["BUGFIX", "IMPROVEMENT", "CHORE", "FEATURE"]);
    expect(o.approval.stages).toEqual(["analysis", "plan"]);
    expect(o.approval.modes).toEqual(["on-approve", "reviewer"]);
    expect(o.approval.impacts).toEqual(["sync_impact", "migration_impact", "docker_impact"]);
  });
});

describe("GET /api/authorizations/options", () => {
  let cerrar: (() => Promise<void>) | null = null;
  afterEach(async () => {
    if (cerrar !== null) await cerrar();
    cerrar = null;
  });
  async function levantar(r: string): Promise<string> {
    const servidor = createMissionControl(defaultContext(r));
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    cerrar = () => new Promise((ok) => servidor.close(() => ok()));
    return `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  }

  it("C7 y C13 responde las opciones de la raíz y no escribe nada", async () => {
    const r = raiz();
    ticket(r, "WEB");
    const base = await levantar(r);
    const res = await fetch(`${base}/api/authorizations/options`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(JSON.parse(JSON.stringify(opcionesDeAutorizacion(r, rutas(r)))));
    expect(existsSync(join(r, ".valmen", "approval"))).toBe(false);
    expect(existsSync(join(r, ".valmen", "qa"))).toBe(false);
  });

  it("C20 el POST de aprobación con un arreglo de módulos responde 200", async () => {
    const r = raiz();
    const base = await levantar(r);
    const res = await fetch(`${base}/api/approval/authorizations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: "Juan Andrade", quote: FRASE, types: ["FEATURE"], modules: ["WEB", "ENGINE"], maxRisk: "normal", dailyQuota: 1, validDays: 30 }),
    });
    expect(res.status).toBe(200);
  });
});

const crearAprobacion = (r: string, modules: string[]) =>
  crearAutorizacionDeAprobacion({ root: r, actor: "Juan Andrade", quote: FRASE, types: ["FEATURE"], modules, maxRisk: "normal", dailyQuota: 2, validDays: 30, source: "cli", ahora: AHORA, env: {} });

describe("el motor rechaza todos y all", () => {
  it("C14 y C15 aprobación con todos o ALL", () => {
    const r = raiz();
    expect(() => crearAprobacion(r, ["todos"])).toThrow(/elige los módulos en la lista/);
    expect(() => crearAprobacion(r, ["ALL"])).toThrow(/elige los módulos en la lista/);
  });
  it("C16 aprobación con comodín", () => {
    expect(() => crearAprobacion(raiz(), ["*"])).toThrow(/ni vacía ni con comodín/);
  });
  const qa = (r: string, modules: string[]) =>
    crearAutorizacion({ root: r, actor: "Juan Andrade", quote: FRASE, types: ["BUGFIX"], modules, maxRisk: "normal", dailyQuota: 1, validDays: 30, source: "cli", ahora: AHORA, env: {} });
  it("C17 QA con Todos", () => {
    expect(() => qa(raiz(), ["Todos"])).toThrow(/elige los módulos en la lista/);
  });
  it("C18 QA con comodín", () => {
    expect(() => qa(raiz(), ["*"])).toThrow(/ni vacía ni con comodín/);
  });
});

describe("la elegibilidad con módulos concretos", () => {
  const regla = (r: string, id: string): string =>
    elegibilidadDeAprobacion({ paths: rutas(r), ticketId: id, etapa: "plan", ahora: AHORA }).reglas.find((x) => x.regla === "autorizacion")?.detalle ?? "";
  const crearTicket = (r: string, modulo: string): string => {
    n += 1;
    const id = `FEATURE-${modulo}-EL${n}-20261007`;
    writeFixtureTicket(r, { id, workflowStatus: "analyzed", type: "FEATURE", module: modulo });
    return id;
  };

  it("C19 minúsculas normalizadas", () => {
    expect(crearAprobacion(raiz(), ["WEB", "ENGINE"]).modules).toEqual(["web", "engine"]);
  });
  it("C21 cubre el módulo listado", () => {
    const r = raiz();
    crearAprobacion(r, ["WEB", "ENGINE"]);
    expect(regla(r, crearTicket(r, "WEB"))).not.toContain("no lista el módulo");
  });
  it("C22 control: no cubre un módulo no listado", () => {
    const r = raiz();
    crearAprobacion(r, ["WEB", "ENGINE"]);
    expect(regla(r, crearTicket(r, "GATE"))).toContain("no lista el módulo GATE");
  });
  it("C23 una autorización antigua con todos no cubre nada", () => {
    const r = raiz();
    const base = {
      kind: "approval-authorization-created" as const, version: 1 as const, id: "APA-20261007-bbbbbb", types: ["FEATURE"], modules: ["todos"],
      maxRisk: "normal", impacts: [], stages: ["analysis", "plan"], mode: "on-approve", dailyQuota: 5,
      validFrom: AHORA.toISOString(), validUntil: new Date(AHORA.getTime() + 30 * 86_400_000).toISOString(),
      actor: "Alguien", quote: "frase", source: "cli", createdAt: AHORA.toISOString(),
    };
    mkdirSync(join(r, ".valmen", "approval"), { recursive: true });
    appendFileSync(approvalAuthorizationsPath(r), `${JSON.stringify({ ...base, hash: hashDeAutorizacionDeAprobacion(base) })}\n`, "utf8");
    expect(regla(r, crearTicket(r, "WEB"))).toContain("no lista el módulo WEB");
  });
});

describe("index.html", () => {
  const html = readFileSync(join(REPO, "packages", "server", "web", "index.html"), "utf8");
  it("C25 ya no pide módulos separados por coma", () => {
    expect(html).not.toContain("Módulos (separados por coma)");
  });
  it("C26 pide las opciones al servidor", () => {
    expect(html).toContain("/api/authorizations/options");
  });
  it("C27 los impactos van sin Seleccionar todos", () => {
    expect(html).toMatch(/grupoDeCasillas\("Impactos admitidos"[^;]*conTodos: false/);
  });
  it("C28 el modo se pinta con radio", () => {
    expect(html).toContain('caja.type = "radio"');
  });
  it("C29 avisa que un módulo nuevo no queda cubierto", () => {
    expect(html).toContain("un módulo nuevo no queda cubierto");
  });
  it("C30 el CSS de las casillas no trae colores a mano", () => {
    const bloque = html.split("/* autorizacion-casillas:inicio */")[1]?.split("/* autorizacion-casillas:fin */")[0] ?? "";
    expect(bloque.length).toBeGreaterThan(200);
    expect(bloque).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(bloque).not.toMatch(/rgba?\(/);
  });
});

afterAll(() => {
  // C24: las autorizaciones del repositorio quedaron intactas.
  expect(RUTAS_DEL_REPO.map(sha)).toEqual(huellasIniciales);
});

describe("el repositorio", () => {
  it("C24 sus autorizaciones no cambiaron durante la suite", () => {
    expect(RUTAS_DEL_REPO.map(sha)).toEqual(huellasIniciales);
  });
});
