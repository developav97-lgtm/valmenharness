/**
 * La autorización persistida de QA por agente (R-QAAG-001).
 *
 * La seguridad no sale del texto sino de quién puede escribir el registro: el agente no tiene
 * herramienta, una sesión desatendida y una fuente no declarada se rechazan, y lo que se guarda
 * es la frase literal de la persona, con un hash que delata una edición a mano.
 */
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { qaAuthorizeCommand } from "../packages/cli/src/commands.js";
import {
  autorizacionQueCubre,
  autorizacionesVigentes,
  crearAutorizacion,
  hashDeAutorizacion,
  leerAutorizaciones,
  qaAuthorizationsPath,
  revocarAutorizacion,
} from "../packages/engine/src/index.js";
import { TOOLS } from "../packages/mcp/src/tools.js";

const AHORA = new Date("2026-10-06T08:00:00.000Z");
const FRASE = "Autorizo cerrar por agente los BUGFIX de backend de bajo riesgo";

let root: string;

function config(fuentes: string[] | null = null): void {
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    ["name: Demo", ...(fuentes === null ? [] : ["qa-authorization-sources:", ...fuentes.map((f) => `  - ${f}`)]), ""].join("\n"),
    "utf8",
  );
}

const crear = (extra: Partial<Parameters<typeof crearAutorizacion>[0]> = {}) =>
  crearAutorizacion({
    root,
    actor: "Juan Andrade",
    quote: FRASE,
    types: ["BUGFIX", "IMPROVEMENT"],
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
  root = mkdtempSync(join(tmpdir(), "valmen-qaauth-"));
  mkdirSync(join(root, ".valmen"), { recursive: true });
  config();
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("crear", () => {
  it("guarda tipos, módulos, riesgo máximo, cupo, vigencia y la frase literal, con su id y su hash", () => {
    const a = crear();
    expect(a.id).toMatch(/^QAA-20261006-[0-9a-f]{6}$/);
    expect(a).toMatchObject({
      types: ["BUGFIX", "IMPROVEMENT"],
      modules: ["pos", "inventario"],
      maxRisk: "normal",
      dailyQuota: 3,
      actor: "Juan Andrade",
      quote: FRASE,
      source: "cli",
    });
    expect(a.validUntil).toBe("2026-11-05T08:00:00.000Z");
    const { hash, ...resto } = a;
    expect(hash).toBe(hashDeAutorizacion(resto));
    expect(readFileSync(qaAuthorizationsPath(root), "utf8")).toContain(FRASE);
  });

  it.each(["SECURITY", "SYNC", "INTEGRATION", "AGENT"])("el tipo %s se rechaza", (tipo) => {
    expect(() => crear({ types: ["BUGFIX", tipo] })).toThrow(/no se pueden autorizar/);
  });

  it("el riesgo alto, el cupo y la vigencia inválidos y los módulos con comodín se rechazan", () => {
    expect(() => crear({ maxRisk: "high" })).toThrow(/riesgo máximo/);
    expect(() => crear({ dailyQuota: 0 })).toThrow(/cupo/);
    expect(() => crear({ validDays: 400 })).toThrow(/vigencia/);
    expect(() => crear({ modules: ["*"] })).toThrow(/módulos concretos/);
    expect(() => crear({ modules: [] })).toThrow(/módulos concretos/);
  });

  it("exige responsable y frase", () => {
    expect(() => crear({ actor: " " })).toThrow(/responsable/);
    expect(() => crear({ quote: "" })).toThrow(/frase literal/);
  });

  it("ampliar es crear otra autorización con su propia frase: nada se reescribe", () => {
    const primera = crear();
    const segunda = crear({ types: ["BUGFIX", "IMPROVEMENT", "CHORE"], quote: "Amplío a CHORE", ahora: new Date(AHORA.getTime() + 1000) });
    expect(segunda.id).not.toBe(primera.id);
    expect(leerAutorizaciones(root, AHORA)).toHaveLength(2);
    expect(readFileSync(qaAuthorizationsPath(root), "utf8").trim().split("\n")).toHaveLength(2);
  });
});

describe("el canal que el agente no controla", () => {
  it("una sesión desatendida no puede crear ni revocar", () => {
    expect(() => crear({ env: { VALMEN_UNATTENDED: "1" } })).toThrow(/desatendida/);
    const a = crear();
    expect(() => revocarAutorizacion({ root, id: a.id, actor: "agente", reason: "x", source: "cli", env: { VALMEN_UNATTENDED: "1" } })).toThrow(/desatendida/);
    expect(autorizacionesVigentes(root, AHORA)).toHaveLength(1);
  });

  it("una fuente no declarada no puede crear ni revocar", () => {
    expect(() => crear({ source: "hermes" })).toThrow(/no está entre las que el proyecto acepta/);
    const a = crear();
    expect(() => revocarAutorizacion({ root, id: a.id, actor: "x", reason: "y", source: "hermes", env: {} })).toThrow(/no está entre las que el proyecto acepta/);
  });

  it("las fuentes las declara el proyecto y la lista manda", () => {
    config(["mission-control"]);
    expect(() => crear({ source: "cli" })).toThrow(/mission-control/);
    expect(() => crear({ source: "mission-control" })).not.toThrow();
  });

  it("el comando rechaza en una sesión desatendida y aprueba en una atendida", () => {
    const bloqueado = qaAuthorizeCommand(root, "create", { actor: "agente", quote: "x", types: "BUGFIX", modules: "pos" }, { env: { VALMEN_UNATTENDED: "1" } });
    expect(bloqueado.exitCode).not.toBe(0);
    const bien = qaAuthorizeCommand(root, "create", { actor: "Juan Andrade", quote: FRASE, types: "BUGFIX", modules: "pos" }, { ahora: AHORA, env: {} });
    expect(bien.exitCode).toBe(0);
    expect(bien.stdout).toContain("qa-authorize revoke");
  });
});

describe("vigencia y revocación", () => {
  it("la revocación vale desde su instante: antes la autorización cubre, después no", () => {
    const a = crear();
    const ticket = { type: "BUGFIX", module: "POS", riskLevel: "normal" };
    expect(autorizacionQueCubre(root, ticket, AHORA)?.id).toBe(a.id);
    const instante = new Date(AHORA.getTime() + 3_600_000);
    revocarAutorizacion({ root, id: a.id, actor: "Juan Andrade", reason: "ya no", source: "cli", ahora: instante, env: {} });
    expect(autorizacionQueCubre(root, ticket, new Date(instante.getTime() - 1))?.id).toBe(a.id);
    expect(autorizacionQueCubre(root, ticket, instante)).toBeNull();
    expect(leerAutorizaciones(root, instante)[0]?.estado).toBe("revocada");
  });

  it("una autorización vencida no cubre ningún ticket", () => {
    crear({ validDays: 1 });
    const ticket = { type: "BUGFIX", module: "pos", riskLevel: "low" };
    expect(autorizacionQueCubre(root, ticket, new Date(AHORA.getTime() + 2 * 86_400_000))).toBeNull();
  });

  it("no cubre un tipo, un módulo ni un riesgo fuera de lo autorizado", () => {
    crear({ maxRisk: "low", types: ["BUGFIX"], modules: ["pos"] });
    expect(autorizacionQueCubre(root, { type: "FEATURE", module: "pos", riskLevel: "low" }, AHORA)).toBeNull();
    expect(autorizacionQueCubre(root, { type: "BUGFIX", module: "otro", riskLevel: "low" }, AHORA)).toBeNull();
    expect(autorizacionQueCubre(root, { type: "BUGFIX", module: "pos", riskLevel: "normal" }, AHORA)).toBeNull();
    expect(autorizacionQueCubre(root, { type: "BUGFIX", module: "pos", riskLevel: "low" }, AHORA)).not.toBeNull();
  });

  it("una edición a mano del registro rompe el hash y la autorización deja de valer", () => {
    crear();
    const ruta = qaAuthorizationsPath(root);
    writeFileSync(ruta, readFileSync(ruta, "utf8").replace('"dailyQuota":3', '"dailyQuota":3000'), "utf8");
    expect(autorizacionesVigentes(root, AHORA)).toHaveLength(0);
  });

  it("un renglón truncado al final no borra los anteriores", () => {
    crear();
    appendFileSync(qaAuthorizationsPath(root), '{"kind":"qa-authorization-cre', "utf8");
    expect(autorizacionesVigentes(root, AHORA)).toHaveLength(1);
  });

  it("revocar una autorización que no existe se rechaza", () => {
    expect(() => revocarAutorizacion({ root, id: "QAA-x", actor: "Juan", reason: "y", source: "cli", env: {} })).toThrow(/No existe la autorización/);
  });
});

describe("el agente no tiene herramienta para esto", () => {
  it("ninguna herramienta MCP crea, amplía ni revoca una autorización; solo hay una de lectura", () => {
    const relacionadas = TOOLS.filter((t) => /autoriz/i.test(t.name) || /autorizaci[oó]n (de QA|persistida)/i.test(t.description));
    expect(relacionadas.map((t) => t.name)).toEqual(["ver_autorizaciones_qa", "ver_autorizaciones_aprobacion"]);
    for (const t of relacionadas) expect(t.annotations.readOnlyHint).toBe(true);
    for (const t of TOOLS) {
      expect(t.name, "una herramienta que escriba autorizaciones").not.toMatch(/(crear|ampliar|revocar|otorgar)_autoriz/i);
    }
  });
});
