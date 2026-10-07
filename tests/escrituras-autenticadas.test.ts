/**
 * Las escrituras exigen token cuando Mission Control escucha fuera de la máquina local
 * (R-CTRL-003).
 *
 * Se prueba por dos caminos: la función que decide, y el servidor real escuchando en una
 * dirección de red, para que la afirmación no dependa de cómo se llame a la función. Un
 * POST sin token a la aprobación de un gate de proceso debe responder 401 **y no registrar
 * nada** —el archivo de aprobaciones no aparece—.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createMissionControl,
  defaultContext,
  esAnfitrionLocal,
  exigirTokenEnEscritura,
} from "../packages/server/src/server.js";

// valmen:allow-secret — valor de prueba inventado.
const TOKEN = "t0ken-de-prueba-largo-y-aleatorio";
let lab: string;
let cerrar: (() => Promise<void>) | null = null;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-token-"));
  mkdirSync(join(lab, ".valmen", "gates"), { recursive: true });
  writeFileSync(join(lab, ".valmen", "config.yaml"), "name: Demo\n", "utf8");
  writeFileSync(join(lab, ".valmen", "gates", "manuales.yaml"), "id: manuales\ntitle: x\nmode: human\n");
});

afterEach(async () => {
  if (cerrar !== null) await cerrar();
  cerrar = null;
  rmSync(lab, { recursive: true, force: true });
});

/** Levanta el servidor real; `token` undefined imita la escucha local. */
async function levantar(token: string | undefined): Promise<string> {
  const servidor = createMissionControl({
    ...defaultContext(lab),
    ...(token === undefined ? {} : { writeToken: token }),
  });
  await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  cerrar = () => new Promise((resolve) => servidor.close(() => resolve()));
  return `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
}

const aprobar = (base: string, cabeceras: Record<string, string> = {}) =>
  fetch(`${base}/api/processes/gates/manuales/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cabeceras },
    body: JSON.stringify({ actor: "Juan Andrade", reason: "ok" }),
  });

const registro = (): string => join(lab, ".valmen", "gates", "approvals.json");

describe("la escritura sin token", () => {
  it("responde 401 y no registra nada", async () => {
    const base = await levantar(TOKEN);
    const respuesta = await aprobar(base);
    expect(respuesta.status).toBe(401);
    expect(existsSync(registro())).toBe(false);
  });

  it("un token incorrecto también responde 401 y la respuesta no revela el esperado", async () => {
    const base = await levantar(TOKEN);
    const respuesta = await aprobar(base, { Authorization: "Bearer otro-token" });
    expect(respuesta.status).toBe(401);
    expect(await respuesta.text()).not.toContain(TOKEN);
    expect(existsSync(registro())).toBe(false);
  });

  it("cubre también PUT y DELETE: no solo el POST", () => {
    for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(exigirTokenEnEscritura({ writeToken: TOKEN }, metodo, undefined)?.status, metodo).toBe(401);
    }
  });
});

describe("con el token correcto", () => {
  it("la escritura procede y queda registrada", async () => {
    const base = await levantar(TOKEN);
    const respuesta = await aprobar(base, { Authorization: `Bearer ${TOKEN}` });
    expect(respuesta.status).toBe(200);
    expect(existsSync(registro())).toBe(true);
  });

  it("las lecturas no exigen token", async () => {
    const base = await levantar(TOKEN);
    expect((await fetch(`${base}/api/config`)).status).toBe(200);
    expect(exigirTokenEnEscritura({ writeToken: TOKEN }, "GET", undefined)).toBeNull();
    expect(exigirTokenEnEscritura({ writeToken: TOKEN }, "HEAD", undefined)).toBeNull();
  });
});

describe("la escucha local no cambia", () => {
  it("sin token configurado las escrituras pasan sin él", async () => {
    const base = await levantar(undefined);
    expect((await aprobar(base)).status).toBe(200);
  });

  it("reconoce las direcciones locales y no las de red", () => {
    for (const local of ["127.0.0.1", "localhost", "::1", "127.0.0.2"]) {
      expect(esAnfitrionLocal(local), local).toBe(true);
    }
    for (const red of ["0.0.0.0", "192.168.1.20", "::", "10.0.0.5"]) {
      expect(esAnfitrionLocal(red), red).toBe(false);
    }
  });
});
