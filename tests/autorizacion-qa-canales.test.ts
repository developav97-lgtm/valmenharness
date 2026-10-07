/**
 * Los canales humanos de la autorización de QA por agente (R-QAAG-001): Mission Control y el
 * código firmado de un solo uso.
 *
 * Lo que se afirma es quién puede escribir: una escritura HTTP sin token no deja nada, una sesión
 * desatendida no crea ni revoca, un código sirve una sola vez y solo con los términos que se
 * firmaron, y el agente sigue sin tener herramienta MCP de escritura.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { qaAuthorizeCommand } from "../packages/cli/src/commands.js";
import {
  autorizacionQueCubre,
  canjearCodigoDeAutorizacion,
  emitirCodigoDeAutorizacion,
  leerAutorizaciones,
  qaAuthorizationsPath,
  qaLinksPath,
  revocarAutorizacion,
  revocarCodigoDeAutorizacion,
} from "../packages/engine/src/index.js";
import { TOOLS } from "../packages/mcp/src/tools.js";
import { createMissionControl, defaultContext } from "../packages/server/src/server.js";

const AHORA = new Date("2026-10-06T08:00:00.000Z");
// valmen:allow-secret — valores de prueba inventados.
const TOKEN = "t0ken-de-prueba-largo-y-aleatorio";
// valmen:allow-secret
const SECRETO = "secreto-de-prueba-para-firmar-codigos";
const FRASE = "Autorizo cerrar por agente los BUGFIX de bajo riesgo";
const TERMINOS = { types: ["BUGFIX"], modules: ["pos"], maxRisk: "normal", dailyQuota: 2, validDays: 30 };

let root: string;
let cerrar: (() => Promise<void>) | null = null;

function config(fuentes: string[] | null = null): void {
  writeFileSync(
    join(root, ".valmen", "config.yaml"),
    ["name: Demo", ...(fuentes === null ? [] : ["qa-authorization-sources:", ...fuentes.map((f) => `  - ${f}`)]), ""].join("\n"),
    "utf8",
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "valmen-qa-canales-"));
  mkdirSync(join(root, ".valmen"), { recursive: true });
  config();
});

afterEach(async () => {
  if (cerrar !== null) await cerrar();
  cerrar = null;
  rmSync(root, { recursive: true, force: true });
});

async function levantar(opciones: { token?: string; env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  const servidor = createMissionControl({
    ...defaultContext(root),
    ...(opciones.token === undefined ? {} : { writeToken: opciones.token }),
    ...(opciones.env === undefined ? {} : { env: opciones.env }),
  });
  await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  cerrar = () => new Promise((resolve) => servidor.close(() => resolve()));
  return `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
}

const cuerpoDeCrear = (extra: Record<string, unknown> = {}) => ({
  actor: "Juan Andrade", quote: FRASE, types: ["BUGFIX", "CHORE"], modules: ["pos", "inventario"], maxRisk: "normal",
  dailyQuota: 3, validDays: 30, ...extra,
});

const post = (base: string, ruta: string, cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
  fetch(`${base}${ruta}`, { method: "POST", headers: { "Content-Type": "application/json", ...cabeceras }, body: JSON.stringify(cuerpo) });

describe("Mission Control crea y lista", () => {
  it("una persona crea una autorización con todos sus términos y la ve listada vigente", async () => {
    const base = await levantar();
    const r = await post(base, "/api/qa/authorizations", cuerpoDeCrear());
    expect(r.status).toBe(200);
    const creada = ((await r.json()) as { authorization: { id: string } }).authorization;
    const lista = (await (await fetch(`${base}/api/qa/authorizations`)).json()) as {
      authorizations: { id: string; estado: string; types: string[]; modules: string[]; dailyQuota: number; quote: string; source: string }[];
    };
    expect(lista.authorizations).toHaveLength(1);
    const a = lista.authorizations[0]!;
    expect(a).toMatchObject({ id: creada.id, estado: "vigente", types: ["BUGFIX", "CHORE"], modules: ["pos", "inventario"], dailyQuota: 3, quote: FRASE, source: "mission-control" });
  });

  it("el panel de la pantalla existe y no usa colores escritos a mano", () => {
    const html = readFileSync(join(__dirname, "..", "packages", "server", "web", "index.html"), "utf8");
    expect(html).toContain("Autorización de QA por agente");
    expect(html).toContain("/api/qa/authorizations/revoke");
    const bloque = html.slice(html.indexOf(".qa-agente {"), html.indexOf(".politicas {"));
    expect(bloque).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
  });
});

describe("la escritura HTTP", () => {
  it("sin token fuera de la máquina local responde 401 y no deja nada; con token funciona", async () => {
    const base = await levantar({ token: TOKEN });
    const sin = await post(base, "/api/qa/authorizations", cuerpoDeCrear());
    expect(sin.status).toBe(401);
    expect(existsSync(qaAuthorizationsPath(root))).toBe(false);
    const mal = await post(base, "/api/qa/authorizations/revoke", { id: "QAA-1", actor: "x", quote: "y" }, { Authorization: "Bearer otro" });
    expect(mal.status).toBe(401);
    const con = await post(base, "/api/qa/authorizations", cuerpoDeCrear(), { Authorization: `Bearer ${TOKEN}` });
    expect(con.status).toBe(200);
  });

  it("una sesión desatendida no crea ni revoca", async () => {
    const base = await levantar({ env: { ...process.env, VALMEN_UNATTENDED: "1" } });
    const r = await post(base, "/api/qa/authorizations", cuerpoDeCrear());
    expect(r.status).toBe(400);
    expect(JSON.stringify(await r.json())).toContain("desatendida");
    expect(existsSync(qaAuthorizationsPath(root))).toBe(false);
  });

  it("sin la frase literal se rechaza al crear y al revocar", async () => {
    const base = await levantar();
    const crea = await post(base, "/api/qa/authorizations", cuerpoDeCrear({ quote: "   " }));
    expect(crea.status).toBe(400);
    expect(JSON.stringify(await crea.json())).toContain("frase literal");
    expect(existsSync(qaAuthorizationsPath(root))).toBe(false);
    const ok = (await (await post(base, "/api/qa/authorizations", cuerpoDeCrear())).json()) as { authorization: { id: string } };
    const revoca = await post(base, "/api/qa/authorizations/revoke", { id: ok.authorization.id, actor: "Juan Andrade", quote: "" });
    expect(revoca.status).toBe(400);
    expect(JSON.stringify(await revoca.json())).toContain("frase literal");
    expect(leerAutorizaciones(root)[0]!.estado).toBe("vigente");
  });

  it("revocar vale desde ese momento", async () => {
    const base = await levantar();
    const creada = (await (await post(base, "/api/qa/authorizations", cuerpoDeCrear())).json()) as { authorization: { id: string } };
    const ticket = { type: "BUGFIX", module: "POS", riskLevel: "normal" };
    expect(autorizacionQueCubre(root, ticket)).not.toBeNull();
    const r = await post(base, "/api/qa/authorizations/revoke", { id: creada.authorization.id, actor: "Juan Andrade", quote: "Revoco: ya no quiero cierres por agente" });
    expect(r.status).toBe(200);
    expect(autorizacionQueCubre(root, ticket)).toBeNull();
    expect(leerAutorizaciones(root)[0]!.estado).toBe("revocada");
  });
});

describe("el código firmado", () => {
  const emitir = (ahora = AHORA) => emitirCodigoDeAutorizacion({ root, secret: SECRETO, terminos: TERMINOS, ahora });
  const canjear = (codigo: string, ahora = AHORA, extra: Record<string, unknown> = {}) =>
    canjearCodigoDeAutorizacion({ root, secret: SECRETO, codigo, actor: "Juan Andrade", quote: FRASE, ahora, env: {}, ...extra });

  it("se canjea una sola vez y crea la autorización con los términos firmados", () => {
    config(["cli", "mission-control", "enlace-firmado"]);
    const { code } = emitir();
    const a = canjear(code);
    expect(a).toMatchObject({ types: ["BUGFIX"], modules: ["pos"], dailyQuota: 2, source: "enlace-firmado", quote: FRASE });
    expect(() => canjear(code)).toThrow(/ya se usó/);
    expect(leerAutorizaciones(root)).toHaveLength(1);
  });

  it("solo sirve si la fuente enlace-firmado está declarada, y entonces el código sigue sin usar", () => {
    const { code } = emitir();
    expect(() => canjear(code)).toThrow(/enlace-firmado/);
    expect(existsSync(qaAuthorizationsPath(root))).toBe(false);
    config(["cli", "enlace-firmado"]);
    expect(canjear(code).source).toBe("enlace-firmado");
  });

  it("vale 24 horas", () => {
    config(["enlace-firmado"]);
    const { code } = emitir();
    expect(() => canjear(code, new Date(AHORA.getTime() + 25 * 3_600_000))).toThrow(/no sirve/);
    expect(existsSync(qaAuthorizationsPath(root))).toBe(false);
  });

  it("si cambia un término, la firma no corresponde y no sirve", () => {
    config(["enlace-firmado"]);
    const { code } = emitir();
    const ruta = qaLinksPath(root);
    const linea = JSON.parse(readFileSync(ruta, "utf8").trim()) as { token: string };
    const [cuerpo, firma] = linea.token.split(".") as [string, string];
    const claims = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as { receipt: string };
    claims.receipt = claims.receipt.replace('"BUGFIX"', '"BUGFIX","FEATURE"');
    const alterado = { ...linea, token: `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${firma}` };
    writeFileSync(ruta, readFileSync(ruta, "utf8").replace(JSON.stringify(linea), JSON.stringify(alterado)), "utf8");
    expect(() => canjear(code)).toThrow(/no sirve/);
    expect(existsSync(qaAuthorizationsPath(root))).toBe(false);
  });

  it("un código revocado antes de canjearse deja de servir", () => {
    config(["enlace-firmado"]);
    const { code } = emitir();
    revocarCodigoDeAutorizacion({ root, codigo: code, actor: "Juan Andrade", ahora: AHORA, env: {} });
    expect(() => canjear(code)).toThrow(/revocado/);
    expect(existsSync(qaAuthorizationsPath(root))).toBe(false);
  });

  it("un código de otro secreto no sirve", () => {
    config(["enlace-firmado"]);
    const { code } = emitir();
    expect(() => canjear(code, AHORA, { secret: "otro-secreto-distinto" })).toThrow(/no sirve/); // valmen:allow-secret — valor de prueba inventado.
  });

  it("una sesión desatendida no puede canjearlo ni revocarlo", () => {
    config(["enlace-firmado"]);
    const { code } = emitir();
    expect(() => canjear(code, AHORA, { env: { VALMEN_UNATTENDED: "1" } })).toThrow(/desatendida/);
    expect(() => revocarCodigoDeAutorizacion({ root, codigo: code, actor: "x", env: { VALMEN_UNATTENDED: "1" } })).toThrow(/desatendida/);
  });
});

describe("el CLI y el agente", () => {
  it("link y redeem funcionan por el comando, y link se rechaza desatendido", () => {
    config(["cli", "enlace-firmado"]);
    const link = qaAuthorizeCommand(root, "link", { types: "BUGFIX", modules: "pos", "daily-quota": "2" }, { ahora: AHORA, secret: SECRETO, env: {} });
    expect(link.exitCode).toBe(0);
    const codigo = /Código (\S+) /.exec(link.stdout)![1]!;
    const redeem = qaAuthorizeCommand(root, "redeem", { code: codigo, actor: "Juan Andrade", quote: FRASE }, { ahora: AHORA, secret: SECRETO, env: {} });
    expect(redeem.exitCode).toBe(0);
    expect(redeem.stdout).toContain("creada por Juan Andrade");
    const desatendido = qaAuthorizeCommand(root, "link", { types: "BUGFIX", modules: "pos" }, { ahora: AHORA, secret: SECRETO, env: { VALMEN_UNATTENDED: "1" } });
    expect(desatendido.exitCode).not.toBe(0);
    expect(desatendido.stderr).toContain("desatendida");
  });

  it("ninguna herramienta MCP crea, amplía, revoca ni canjea: solo hay una de lectura", () => {
    const relacionadas = TOOLS.filter((t) => /autoriz/i.test(t.name) || /autorizaci[oó]n (de QA|persistida)|c[oó]digo (firmado|de autorizaci)/i.test(t.description));
    expect(relacionadas.map((t) => t.name)).toEqual(["ver_autorizaciones_qa"]);
    for (const t of relacionadas) expect(t.annotations.readOnlyHint).toBe(true);
    for (const t of TOOLS) expect(t.name).not.toMatch(/(canjear|emitir|revocar|crear|ampliar)_(codigo|autoriz)/i);
  });

  it("revocar una autorización del registro sigue valiendo desde ese instante", () => {
    config(["cli"]);
    const linea = qaAuthorizeCommand(root, "create", { actor: "Juan Andrade", quote: FRASE, types: "BUGFIX", modules: "pos" }, { ahora: AHORA, env: {} });
    expect(linea.exitCode).toBe(0);
    const id = leerAutorizaciones(root, AHORA)[0]!.id;
    revocarAutorizacion({ root, id, actor: "Juan Andrade", reason: "ya no", source: "cli", ahora: AHORA, env: {} });
    expect(autorizacionQueCubre(root, { type: "BUGFIX", module: "POS", riskLevel: "normal" }, AHORA)).toBeNull();
  });
});
