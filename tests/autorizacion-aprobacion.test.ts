/**
 * La autorización persistida de aprobación automática (R-APRO-001).
 *
 * La seguridad no sale del texto sino de quién puede escribir el registro: el agente no tiene
 * herramienta, una sesión desatendida y una fuente no declarada se rechazan, SECURITY no se puede
 * autorizar, y lo que se guarda es la frase literal de la persona con un hash que delata una edición.
 */
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { approvalAuthorizeCommand } from "../packages/cli/src/commands.js";
import {
  approvalAuthorizationsPath,
  autorizacionDeAprobacionQueCubre,
  cupoRestanteDeAprobacion,
  crearAutorizacionDeAprobacion,
  leerAutorizacionesDeAprobacion,
  registrarUsoDeCupoDeAprobacion,
  revocarAutorizacionDeAprobacion,
} from "../packages/engine/src/index.js";
import { TOOLS } from "../packages/mcp/src/tools.js";

const AHORA = new Date("2026-10-07T08:00:00.000Z");
const FRASE = "Autorizo aprobar solos los planes de bajo riesgo de pos y de inventario";

let root: string;

function config(fuentes: string[] | null = null): void {
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    ["name: Demo", ...(fuentes === null ? [] : ["approval-authorization-sources:", ...fuentes.map((f) => `  - ${f}`)]), ""].join("\n"),
    "utf8",
  );
}

const crear = (extra: Partial<Parameters<typeof crearAutorizacionDeAprobacion>[0]> = {}) =>
  crearAutorizacionDeAprobacion({
    root,
    actor: "Juan Andrade",
    quote: FRASE,
    types: ["BUGFIX", "FEATURE"],
    modules: ["pos", "inventario"],
    maxRisk: "normal",
    dailyQuota: 3,
    validDays: 30,
    source: "cli",
    ahora: AHORA,
    env: {},
    ...extra,
  });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-apa-"));
  mkdirSync(join(root, ".valmen"), { recursive: true });
  config();
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("crear una autorización", () => {
  it("guarda todos sus términos con la frase literal y se lee vigente", () => {
    const a = crear({ impacts: ["sync_impact"], stages: ["plan"], mode: "reviewer" });
    expect(a.id).toMatch(/^APA-20261007-[0-9a-f]{6}$/);
    expect(a).toMatchObject({
      types: ["BUGFIX", "FEATURE"], modules: ["pos", "inventario"], maxRisk: "normal", impacts: ["sync_impact"],
      stages: ["plan"], mode: "reviewer", dailyQuota: 3, actor: "Juan Andrade", quote: FRASE, source: "cli",
    });
    const [leida] = leerAutorizacionesDeAprobacion(root, AHORA);
    expect(leida!.estado).toBe("vigente");
    expect(leida!.hash).toBe(a.hash);
  });

  it("por defecto cubre análisis y plan, en modo automático y sin impactos", () => {
    const a = crear();
    expect(a).toMatchObject({ stages: ["analysis", "plan"], mode: "on-approve", impacts: [] });
  });

  it("admite SYNC, INTEGRATION y AGENT, pero nunca SECURITY", () => {
    expect(crear({ types: ["SYNC", "INTEGRATION", "AGENT"] }).types).toEqual(["SYNC", "INTEGRATION", "AGENT"]);
    expect(() => crear({ types: ["BUGFIX", "SECURITY"] })).toThrow(/SECURITY.*nunca SECURITY|no se pueden autorizar/);
    expect(leerAutorizacionesDeAprobacion(root, AHORA)).toHaveLength(1);
  });

  it("un impacto solo se admite si la autorización lo lista", () => {
    const sinImpactos = crear();
    const conImpacto = crear({ impacts: ["migration_impact"] });
    const ticket = { type: "BUGFIX", module: "POS", riskLevel: "normal", impacts: ["migration_impact"] };
    expect(autorizacionDeAprobacionQueCubre(root, { ...ticket, impacts: [] }, AHORA)?.id).toBe(sinImpactos.id);
    revocarAutorizacionDeAprobacion({ root, id: sinImpactos.id, actor: "Juan Andrade", reason: "prueba", source: "cli", ahora: AHORA, env: {} });
    expect(autorizacionDeAprobacionQueCubre(root, ticket, AHORA)?.id).toBe(conImpacto.id);
    revocarAutorizacionDeAprobacion({ root, id: conImpacto.id, actor: "Juan Andrade", reason: "prueba", source: "cli", ahora: AHORA, env: {} });
    expect(autorizacionDeAprobacionQueCubre(root, ticket, AHORA)).toBeNull();
    expect(() => crear({ impacts: ["inventado"] })).toThrow(/no existen/);
  });

  it("rechaza lo mal formado: sin frase, módulos vacíos o con comodín, riesgo alto, etapa o modo inválidos", () => {
    expect(() => crear({ quote: "  " })).toThrow(/frase literal/);
    expect(() => crear({ actor: "" })).toThrow(/responsable/);
    expect(() => crear({ modules: [] })).toThrow(/módulos concretos/);
    expect(() => crear({ modules: ["*"] })).toThrow(/módulos concretos/);
    expect(() => crear({ maxRisk: "high" })).toThrow(/riesgo máximo/);
    expect(() => crear({ stages: ["deploy"] })).toThrow(/etapas/);
    expect(() => crear({ mode: "libre" })).toThrow(/modo/);
    expect(() => crear({ dailyQuota: 0 })).toThrow(/cupo/);
    expect(() => crear({ validDays: 400 })).toThrow(/vigencia/);
    expect(leerAutorizacionesDeAprobacion(root, AHORA)).toHaveLength(0);
  });

  it("cubre solo la etapa que declara", () => {
    crear({ stages: ["plan"] });
    const ticket = { type: "BUGFIX", module: "POS", riskLevel: "normal" };
    expect(autorizacionDeAprobacionQueCubre(root, { ...ticket, stage: "plan" }, AHORA)).not.toBeNull();
    expect(autorizacionDeAprobacionQueCubre(root, { ...ticket, stage: "analysis" }, AHORA)).toBeNull();
  });
});

describe("quién puede escribir el registro", () => {
  it("una sesión desatendida no puede crear ni revocar", () => {
    expect(() => crear({ env: { VALMEN_UNATTENDED: "1" } })).toThrow(/desatendida/);
    const a = crear();
    expect(() => revocarAutorizacionDeAprobacion({ root, id: a.id, actor: "x", reason: "y", source: "cli", env: { VALMEN_UNATTENDED: "1" } })).toThrow(/desatendida/);
    expect(leerAutorizacionesDeAprobacion(root, AHORA)[0]!.estado).toBe("vigente");
  });

  it("una fuente no declarada se rechaza y la lista de fuentes puede cambiarse en la configuración", () => {
    expect(() => crear({ source: "enlace" })).toThrow(/no está entre las que el proyecto acepta/);
    config(["cli", "enlace"]);
    expect(crear({ source: "enlace" }).source).toBe("enlace");
    config([]);
    expect(() => crear()).toThrow(/no puede estar vacía/);
  });

  it("el CLI las rechaza igual y lista las existentes", () => {
    const desatendido = approvalAuthorizeCommand(root, "create", { actor: "Juan", quote: FRASE, types: "BUGFIX", modules: "pos" }, { ahora: AHORA, env: { VALMEN_UNATTENDED: "1" } });
    expect(desatendido.exitCode).not.toBe(0);
    expect(desatendido.stderr).toContain("desatendida");
    const ok = approvalAuthorizeCommand(root, "create", { actor: "Juan Andrade", quote: FRASE, types: "BUGFIX,SYNC", modules: "pos", impacts: "sync_impact", mode: "reviewer" }, { ahora: AHORA, env: {} });
    expect(ok.exitCode).toBe(0);
    expect(ok.stdout).toContain("modo reviewer");
    const lista = approvalAuthorizeCommand(root, "list", {}, { ahora: AHORA });
    expect(lista.stdout).toContain(FRASE);
    expect(approvalAuthorizeCommand(root, "otra", {}).exitCode).not.toBe(0);
  });

  it("no existe herramienta MCP que cree, amplíe o revoque: solo una de lectura", () => {
    const relacionadas = TOOLS.filter((t) => /autoriz/i.test(t.name) && /aprobaci/i.test(t.name));
    expect(relacionadas.map((t) => t.name)).toEqual(["ver_autorizaciones_aprobacion"]);
    for (const t of relacionadas) expect(t.annotations.readOnlyHint).toBe(true);
    for (const t of TOOLS) expect(t.name).not.toMatch(/(crear|ampliar|revocar|otorgar)_autoriz/i);
  });
});

describe("revocar y detectar ediciones", () => {
  it("la revocación vale desde ese momento", () => {
    const a = crear();
    const ticket = { type: "BUGFIX", module: "POS", riskLevel: "normal" };
    expect(autorizacionDeAprobacionQueCubre(root, ticket, AHORA)?.id).toBe(a.id);
    revocarAutorizacionDeAprobacion({ root, id: a.id, actor: "Juan Andrade", reason: "ya no", source: "cli", ahora: AHORA, env: {} });
    expect(autorizacionDeAprobacionQueCubre(root, ticket, AHORA)).toBeNull();
    expect(leerAutorizacionesDeAprobacion(root, AHORA)[0]).toMatchObject({ estado: "revocada" });
    // Una autorización que no existe no se revoca.
    expect(() => revocarAutorizacionDeAprobacion({ root, id: "APA-1", actor: "x", reason: "y", source: "cli", env: {} })).toThrow(/No existe/);
    expect(() => revocarAutorizacionDeAprobacion({ root, id: a.id, actor: "x", reason: "  ", source: "cli", env: {} })).toThrow(/motivo/);
  });

  it("una edición a mano del registro se detecta por su hash y no se lista como vigente", () => {
    const a = crear();
    const ruta = approvalAuthorizationsPath(root);
    writeFileSync(ruta, readFileSync(ruta, "utf8").replace('"BUGFIX","FEATURE"', '"BUGFIX","FEATURE","AGENT"'), "utf8");
    expect(leerAutorizacionesDeAprobacion(root, AHORA).find((x) => x.id === a.id)!.estado).toBe("revocada");
    expect(autorizacionDeAprobacionQueCubre(root, { type: "AGENT", module: "pos", riskLevel: "low" }, AHORA)).toBeNull();
  });

  it("un renglón truncado no borra los anteriores y una autorización vence", () => {
    const a = crear({ validDays: 1 });
    appendFileSync(approvalAuthorizationsPath(root), '{"kind":"approval-authorization-cre', "utf8");
    expect(leerAutorizacionesDeAprobacion(root, AHORA)).toHaveLength(1);
    expect(leerAutorizacionesDeAprobacion(root, new Date(AHORA.getTime() + 2 * 86_400_000))[0]).toMatchObject({ id: a.id, estado: "vencida" });
  });
});

describe("el cupo diario", () => {
  it("se cuenta por autorización y se agota; al día siguiente vuelve", () => {
    const a = crear({ dailyQuota: 2 });
    const otra = crear({ dailyQuota: 2 });
    expect(cupoRestanteDeAprobacion(root, a, AHORA)).toBe(2);
    registrarUsoDeCupoDeAprobacion({ root, authorizationId: a.id, ticketId: "BUGFIX-POS-UNO-20261007", stage: "plan", ahora: AHORA });
    registrarUsoDeCupoDeAprobacion({ root, authorizationId: a.id, ticketId: "BUGFIX-POS-DOS-20261007", stage: "analysis", ahora: AHORA });
    expect(cupoRestanteDeAprobacion(root, a, AHORA)).toBe(0);
    expect(cupoRestanteDeAprobacion(root, otra, AHORA)).toBe(2);
    expect(cupoRestanteDeAprobacion(root, a, new Date("2026-10-08T08:00:00.000Z"))).toBe(2);
  });
});
