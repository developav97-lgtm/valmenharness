/**
 * La elegibilidad para QA por agente, decidida en código (R-QAAG-002).
 *
 * Un caso por regla, y los que importan más: que cada categoría de ruta prohibida se pruebe una
 * por una, que ningún tipo prohibido sea elegible aunque la autorización lo listara, y que la
 * decisión sea una función pura —sin modelo y estable entre corridas—.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { qaEligibilityCommand } from "../packages/cli/src/commands.js";
import {
  crearAutorizacion,
  elegibilidadQa,
  registrarUsoDeCupo,
  rutaProhibidaParaQaAgente,
  type ResultadoDeElegibilidad,
} from "../packages/engine/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const AHORA = new Date("2026-10-06T08:00:00.000Z");
const ID = "BUGFIX-POS-FILTRO-ELEG-20261005";
const BUENOS = '- [ ] El filtro devuelve la orden 1042 al buscar 104.\n      <!-- test: npx vitest run tests/uno.test.ts -->';

let root: string;
const paths = () => ({ root, ticketsDir: "tickets" });

function ticket(opciones: { tipo?: string; riesgo?: string; impactos?: string[]; criterios?: string; modulo?: string; estado?: string } = {}): void {
  writeFixtureTicket(root, {
    id: opciones.tipo === undefined || opciones.tipo === "BUGFIX" ? ID : `${opciones.tipo}-POS-FILTRO-ELEG-20261005`,
    workflowStatus: opciones.estado ?? "awaiting_user_tests",
    type: opciones.tipo ?? "BUGFIX",
    module: opciones.modulo ?? "POS",
    ...(opciones.riesgo === undefined ? {} : { riskLevel: opciones.riesgo }),
    ...(opciones.impactos === undefined ? {} : { impacts: opciones.impactos }),
    criterios: opciones.criterios ?? BUENOS,
  });
}

function autorizar(tipos = ["BUGFIX", "IMPROVEMENT", "CHORE", "FEATURE"], extra: Partial<Parameters<typeof crearAutorizacion>[0]> = {}) {
  return crearAutorizacion({
    root, actor: "Juan Andrade", quote: "Autorizo el cierre por agente", types: tipos, modules: ["pos"], maxRisk: "normal",
    dailyQuota: 2, validDays: 30, source: "cli", ahora: AHORA, env: {}, ...extra,
  });
}

const evaluar = (opciones: { id?: string; diff?: string[]; secretos?: number; drift?: number } = {}): ResultadoDeElegibilidad =>
  elegibilidadQa({
    paths: paths(),
    ticketId: opciones.id ?? ID,
    ahora: AHORA,
    archivosDelDiff: opciones.diff ?? ["BackEnd/pos/filters.py", "BackEnd/pos/tests/test_filters.py"],
    secretos: () => opciones.secretos ?? 0,
    drift: () => opciones.drift ?? 0,
  });

const incumplidas = (r: ResultadoDeElegibilidad): string[] => r.reglas.filter((x) => !x.cumple).map((x) => x.regla);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-eleg-"));
  mkdirSync(join(root, ".valmen"), { recursive: true });
  writeFileSync(join(root, ".valmen", "config.yaml"), "name: Demo\ntest-commands:\n  - npx vitest run\n  - bash .valmen/scripts/ng-test.sh\n", "utf8");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("un ticket que cumple todo", () => {
  it("es elegible, cita la autorización que lo respalda y no depende de ningún modelo", () => {
    ticket();
    const a = autorizar();
    const r = evaluar();
    expect(r.elegible).toBe(true);
    expect(r.reglas.every((x) => x.cumple)).toBe(true);
    expect(r.autorizacion).toEqual({ id: a.id, hash: a.hash });
    // Una función pura: la misma entrada, el mismo resultado.
    expect(evaluar()).toEqual(r);
  });
});

describe("regla 1: autorización y cupo", () => {
  it("sin autorización no es elegible y dice qué falta", () => {
    ticket();
    const r = evaluar();
    expect(r.elegible).toBe(false);
    expect(r.reglas.find((x) => x.regla === "autorizacion")?.detalle).toContain("ninguna autorización vigente");
    expect(r.autorizacion).toBeNull();
  });

  it("una autorización que no cubre el módulo no alcanza", () => {
    ticket({ modulo: "INVENTARIO" });
    autorizar();
    expect(incumplidas(evaluar())).toContain("autorizacion");
  });

  it("sin cupo diario no es elegible, y al día siguiente vuelve a haber", () => {
    ticket();
    const a = autorizar(undefined, { dailyQuota: 1 });
    registrarUsoDeCupo({ root, authorizationId: a.id, ticketId: "BUGFIX-POS-OTRO-20261005", ahora: AHORA });
    const sin = evaluar();
    expect(incumplidas(sin)).toContain("autorizacion");
    expect(sin.reglas.find((x) => x.regla === "autorizacion")?.detalle).toContain("agotó su cupo");
    const manana = elegibilidadQa({ paths: paths(), ticketId: ID, ahora: new Date("2026-10-07T08:00:00.000Z"), archivosDelDiff: [], secretos: () => 0, drift: () => 0 });
    expect(manana.reglas.find((x) => x.regla === "autorizacion")?.cumple).toBe(true);
  });
});

describe("regla 2: el tipo", () => {
  it.each(["SECURITY", "SYNC", "INTEGRATION", "AGENT"])("%s no es elegible aunque la autorización lo cubriera", (tipo) => {
    ticket({ tipo });
    // El registro no deja crear una autorización con estos tipos: se escribe a mano, como lo haría un atacante.
    const a = autorizar(["BUGFIX"]);
    const ruta = join(root, ".valmen", "qa", "authorizations.jsonl");
    writeFileSync(ruta, readFileSync(ruta, "utf8").replace('"BUGFIX"', `"BUGFIX","${tipo}"`), "utf8");
    const r = evaluar({ id: `${tipo}-POS-FILTRO-ELEG-20261005` });
    expect(r.elegible).toBe(false);
    expect(incumplidas(r)).toContain("tipo");
    expect(a.id).toBeTruthy();
  });
});

describe("regla 3: riesgo e impactos", () => {
  it("el riesgo alto no es elegible", () => {
    ticket({ riesgo: "high" });
    autorizar();
    const r = evaluar();
    expect(incumplidas(r)).toContain("riesgo-e-impactos");
    expect(r.reglas.find((x) => x.regla === "riesgo-e-impactos")?.detalle).toContain("high");
  });

  it.each(["sync_impact", "migration_impact", "docker_impact"])("el impacto %s no es elegible", (impacto) => {
    ticket({ impactos: [impacto] });
    autorizar();
    expect(incumplidas(evaluar())).toContain("riesgo-e-impactos");
  });
});

describe("regla 4: los criterios", () => {
  it("un criterio manual lo vuelve no elegible y el motivo lo nombra", () => {
    ticket({ criterios: `${BUENOS}\n- [ ] La pantalla muestra el saldo actualizado correctamente.\n      <!-- verify: manual -->` });
    autorizar();
    const r = evaluar();
    expect(incumplidas(r)).toContain("criterios");
    expect(r.reglas.find((x) => x.regla === "criterios")?.detalle).toContain("La pantalla muestra el saldo actualizado correctamente.");
  });

  it("un criterio dev también, y uno por petición http sí cuenta como automático", () => {
    ticket({ criterios: '- [ ] El ambiente dev responde con la versión nueva.\n      <!-- verify: dev -->' });
    autorizar();
    expect(incumplidas(evaluar())).toContain("criterios");
    ticket({ criterios: "- [ ] El listado de huecos sale vacío para la sucursal 1.\n      <!-- http: GET /api/v1/huecos/?sucursal=1 expect: status=200 -->" });
    expect(incumplidas(evaluar())).not.toContain("criterios");
  });
});

describe("regla 5: el diff", () => {
  const prohibidas: [string, string][] = [
    ["FrontEnd/src/pages/Ordenes.tsx", "pantallas"],
    ["templates/orden.html", "pantallas"],
    ["BackEnd/pos/migrations/0042_orden.py", "migraciones"],
    ["db/cambio.sql", "migraciones"],
    ["Dockerfile", "configuración de despliegue"],
    ["docker-compose.prod.yml", "configuración de despliegue"],
    ["BackEnd/auth/views.py", "autenticación"],
    ["BackEnd/core/permissions.py", "autenticación"],
    [".github/workflows/ci.yml", "CI"],
    [".gitlab-ci.yml", "CI"],
    [".valmen/config.yaml", "el registro y la configuración del harness"],
    [".valmen/scripts/ng-test.sh", "los scripts que corren las pruebas"],
  ];
  it.each(prohibidas)("tocar %s lo vuelve no elegible (%s) y el motivo nombra el archivo", (archivo, categoria) => {
    ticket();
    autorizar();
    const r = evaluar({ diff: ["BackEnd/pos/filters.py", archivo] });
    expect(incumplidas(r)).toContain("diff");
    const detalle = r.reglas.find((x) => x.regla === "diff")?.detalle ?? "";
    expect(detalle).toContain(archivo);
    expect(detalle).toContain(categoria);
  });

  it("el script que corren las pruebas, tomado de test-commands, no se puede tocar", () => {
    writeFileSync(join(root, ".valmen", "config.yaml"), "name: Demo\ntest-commands:\n  - bash scripts/correr-pruebas.sh\n", "utf8");
    ticket();
    autorizar();
    const r = evaluar({ diff: ["scripts/correr-pruebas.sh"] });
    expect(incumplidas(r)).toContain("diff");
    expect(r.reglas.find((x) => x.regla === "diff")?.detalle).toContain("los scripts que corren las pruebas");
  });

  it("rutas normales de backend y sus pruebas no se prohíben", () => {
    for (const ruta of ["BackEnd/pos/filters.py", "BackEnd/pos/tests/test_filters.py", "docs/nota.md", "packages/engine/src/a.ts"]) {
      expect(rutaProhibidaParaQaAgente(ruta), ruta).toBeNull();
    }
  });
});

describe("regla 6: puntos, reapertura, secretos y drift", () => {
  it("un punto abierto lo vuelve no elegible", () => {
    ticket();
    autorizar();
    const ruta = join(root, "tickets", "2026", ID, "ticket.md");
    const punto = {
      kind: "ticket-point", id: "POINT-001", date: "2026-09-21", title: "Falta algo", severity: "normal", status: "open",
      actual: "x", expected: "y", affected_files: [], created: "2026-09-21", updated: "2026-09-21",
    };
    const texto = readFileSync(ruta, "utf8").replace("## Puntos\n\n```json\n[]\n```", `## Puntos\n\n\`\`\`json\n${JSON.stringify([punto], null, 2)}\n\`\`\``);
    writeFileSync(ruta, texto, "utf8");
    const r = evaluar();
    expect(incumplidas(r)).toContain("puntos");
    expect(r.reglas.find((x) => x.regla === "puntos")?.detalle).toContain("POINT-001");
  });

  it("un secreto y un drift lo vuelven no elegible", () => {
    ticket();
    autorizar();
    expect(incumplidas(evaluar({ secretos: 1 }))).toContain("secretos");
    expect(incumplidas(evaluar({ drift: 2 }))).toContain("drift");
  });

  it("si no se puede comprobar el escáner, se trata como no limpio", () => {
    ticket();
    autorizar();
    const r = elegibilidadQa({
      paths: paths(), ticketId: ID, ahora: AHORA, archivosDelDiff: [],
      secretos: () => { throw new Error("sin git"); }, drift: () => 0,
    });
    expect(incumplidas(r)).toContain("secretos");
  });
});

describe("el comando", () => {
  it("muestra cada regla y sale con error si no es elegible", () => {
    ticket();
    const sin = qaEligibilityCommand(paths(), { id: ID });
    expect(sin.exitCode).not.toBe(0);
    expect(sin.stdout).toContain("NO ELEGIBLE");
    expect(sin.stdout).toContain("✗ autorizacion");
  });

  it("evalúa de verdad un ticket sin diff conocido y lo explica", () => {
    ticket();
    expect(qaEligibilityCommand(paths(), {}).exitCode).not.toBe(0);
  });
});
