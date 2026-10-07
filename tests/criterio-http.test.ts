/**
 * Un criterio se verifica con una petición HTTP contra hosts permitidos (R-QAAG-007).
 *
 * Se usa un servidor HTTP local de verdad: lo que importa es lo que **no** pasa —ninguna
 * petición sale cuando el host, el esquema o el método no están permitidos, una redirección no
 * se sigue— y que el resultado no filtre la credencial.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseConfig, readQaHttpConfig } from "../packages/adapter/src/index.js";
import {
  SIN_QA_HTTP,
  parsearCriterioHttp,
  verificarCriterioHttp,
} from "../packages/engine/src/index.js";
import { extractCriteriaSpecs } from "../packages/gate/src/index.js";

const CREDENCIAL = "tok-secreto-de-prueba-1234567890";

let servidor: Server;
let base: string;
let recibidas: { metodo: string; url: string; autorizacion: string | undefined }[];

beforeEach(async () => {
  recibidas = [];
  servidor = createServer((req: IncomingMessage, res) => {
    recibidas.push({ metodo: req.method ?? "", url: req.url ?? "", autorizacion: req.headers["authorization"] });
    res.setHeader("Set-Cookie", "sesion=abc; HttpOnly");
    if (req.url?.startsWith("/redirige")) {
      res.statusCode = 302;
      res.setHeader("Location", "http://otro.example/api");
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    if (req.url?.startsWith("/api/v1/huecos")) {
      res.end(JSON.stringify({ results: [], count: 0, ok: true, nombre: "x", anidado: { a: { b: 7 } } }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ detalle: "no existe" }));
  });
  await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterEach(() => new Promise<void>((resolve) => servidor.close(() => resolve())));

const config = (extra = "") =>
  readQaHttpConfig(parseConfig(`qa-http:\n  hosts:\n    - ${base}\n  methods:\n    - GET\n${extra}`));
const verificar = (criterio: string, cfg = config(), entorno: Record<string, string> = {}) =>
  verificarCriterioHttp({ criterio, config: cfg, entorno });

describe("un criterio válido", () => {
  it("se verifica contra el host de la configuración y guarda status, latencia y hash del cuerpo", async () => {
    const r = await verificar("GET /api/v1/huecos/?sucursal=1 expect: status=200; json.results.length==0");
    expect(r.estado).toBe("cumplido");
    expect(r.respuesta?.status).toBe(200);
    expect(typeof r.respuesta?.latenciaMs).toBe("number");
    expect(r.respuesta?.bodySha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.respuesta?.bodyBytes).toBeGreaterThan(0);
    expect(r.peticion?.url).toBe(`${base}/api/v1/huecos/?sucursal=1`);
    expect(recibidas).toHaveLength(1);
  });

  it("evalúa toda la gramática cerrada", async () => {
    const r = await verificar(
      'GET /api/v1/huecos/ expect: status=200; json.count==0; json.ok!=false; json.nombre=="x"; json.anidado.a.b==7; json.results.length>=0; json.results.length<=5',
    );
    expect(r.estado).toBe("cumplido");
    expect(r.aserciones).toHaveLength(7);
  });

  it("una aserción que no se cumple da incumplido y muestra lo observado", async () => {
    const r = await verificar("GET /api/v1/huecos/ expect: status=201; json.count==5");
    expect(r.estado).toBe("incumplido");
    expect(r.aserciones.map((a) => a.cumplida)).toEqual([false, false]);
    expect(r.aserciones[1]?.observado).toBe("0");
  });
});

describe("lo que se rechaza sin hacer la petición", () => {
  const rutas: [string, string][] = [
    ["otro host con esquema", "GET https://otro.example/api expect: status=200"],
    ["host sin esquema con doble barra", "GET //otro.example/api expect: status=200"],
    ["credenciales en la ruta", "GET /api@otro.example expect: status=200"],
    ["esquema disfrazado", "GET javascript:alert(1) expect: status=200"],
    ["ruta sin barra inicial", "GET api/v1 expect: status=200"],
    ["barra invertida", "GET /\\\\otro.example expect: status=200"],
  ];
  it.each(rutas)("%s", async (_n, criterio) => {
    const r = await verificar(criterio);
    expect(r.estado).toBe("rechazado");
    expect(r.motivo).toBeTruthy();
    expect(recibidas).toEqual([]);
  });

  it("un método no declarado se rechaza", async () => {
    const r = await verificar("DELETE /api/v1/huecos/ expect: status=200");
    expect(r.estado).toBe("rechazado");
    expect(r.motivo).toContain("qa-http.methods");
    expect(recibidas).toEqual([]);
  });

  it("una aserción fuera de la gramática cerrada se rechaza", async () => {
    for (const mala of ["status>=200", "json.results.map(x=>x)==1", "body.contains=hola", "json..a==1", "header.x==1"]) {
      const r = await verificar(`GET /api/v1/huecos/ expect: ${mala}`);
      expect(r.estado, mala).toBe("rechazado");
      expect(r.motivo, mala).toContain("gramática cerrada");
    }
    expect(recibidas).toEqual([]);
  });

  it("un proyecto sin qa-http rechaza el criterio y dice qué declarar", async () => {
    const r = await verificar("GET /api/v1/huecos/ expect: status=200", null);
    expect(r.estado).toBe("rechazado");
    expect(r.motivo).toBe(SIN_QA_HTTP);
    expect(r.motivo).toContain("qa-http:");
    expect(recibidas).toEqual([]);
  });
});

describe("la red", () => {
  it("una redirección a otro host no se sigue", async () => {
    const r = await verificar("GET /redirige expect: status=302");
    expect(r.estado).toBe("cumplido");
    expect(r.respuesta?.status).toBe(302);
    expect(recibidas.map((x) => x.url)).toEqual(["/redirige"]);
  });

  it("un servidor que no responde da rechazado con el motivo, no una excepción", async () => {
    const cfg = readQaHttpConfig(parseConfig("qa-http:\n  hosts:\n    - http://127.0.0.1:1\n"));
    const r = await verificar("GET /x expect: status=200", cfg);
    expect(r.estado).toBe("rechazado");
    expect(r.motivo).toContain("La petición falló");
  });
});

describe("la credencial y las cabeceras", () => {
  it("la credencial sale de la variable que declara la configuración y no aparece en el resultado", async () => {
    const cfg = config("  credential-env: QA_HTTP_TOKEN\n");
    const r = await verificar("GET /api/v1/huecos/ expect: status=200", cfg, { QA_HTTP_TOKEN: CREDENCIAL });
    expect(r.estado).toBe("cumplido");
    expect(recibidas[0]?.autorizacion).toBe(`Bearer ${CREDENCIAL}`);
    const serializado = JSON.stringify(r);
    expect(serializado).not.toContain(CREDENCIAL);
    expect(serializado.toLowerCase()).not.toContain("authorization");
    expect(serializado.toLowerCase()).not.toContain("set-cookie");
    expect(serializado.toLowerCase()).not.toContain("cookie");
    expect(serializado).not.toContain("sesion=abc");
  });

  it("si la variable de la credencial falta, se rechaza sin hacer la petición", async () => {
    const r = await verificar("GET /api/v1/huecos/ expect: status=200", config("  credential-env: QA_HTTP_TOKEN\n"), {});
    expect(r.estado).toBe("rechazado");
    expect(r.motivo).toContain("QA_HTTP_TOKEN");
    expect(recibidas).toEqual([]);
  });

  it("el ticket no puede elegir el host ni la credencial: la configuración con credenciales en la URL se rechaza", () => {
    expect(() => readQaHttpConfig(parseConfig("qa-http:\n  hosts:\n    - http://usuario:clave@localhost:8000\n"))).toThrow(/credenciales/);
    expect(() => readQaHttpConfig(parseConfig("qa-http:\n  hosts:\n    - ftp://localhost\n"))).toThrow(/http o https/);
    expect(() => readQaHttpConfig(parseConfig("qa-http:\n  hosts: []\n"))).toThrow(/al menos una URL/);
    expect(() => readQaHttpConfig(parseConfig("qa-http:\n  hosts:\n    - http://x\n  credential-env: minuscula\n"))).toThrow(/credential-env/);
    expect(readQaHttpConfig(parseConfig("name: Demo\n"))).toBeNull();
  });
});

describe("el criterio dentro de un ticket", () => {
  it("la anotación http se reconoce y cuenta como declarada; test y verify no cambian", () => {
    const seccion = [
      "- [ ] La lista de huecos sale vacía para la sucursal 1",
      "      <!-- http: GET /api/v1/huecos/?sucursal=1 expect: status=200; json.results.length==0 -->",
      "- [ ] El filtro devuelve la orden 1042 al buscar 104",
      "      <!-- test: npx vitest run tests/uno.test.ts -->",
      "- [ ] La pantalla muestra el saldo actualizado",
      "      <!-- verify: manual -->",
    ].join("\n");
    const specs = extractCriteriaSpecs(seccion);
    expect(specs).toHaveLength(3);
    expect(specs[0]).toEqual({
      text: "La lista de huecos sale vacía para la sucursal 1",
      command: null,
      manual: false,
      dev: false,
      http: "GET /api/v1/huecos/?sucursal=1 expect: status=200; json.results.length==0",
    });
    // Los criterios sin `http:` conservan exactamente su forma de siempre.
    expect(specs[1]).toEqual({ text: "El filtro devuelve la orden 1042 al buscar 104", command: "npx vitest run tests/uno.test.ts", manual: false, dev: false });
    expect(specs[2]).toEqual({ text: "La pantalla muestra el saldo actualizado", command: null, manual: true, dev: false });
    expect(parsearCriterioHttp(specs[0]?.http ?? "").aserciones).toHaveLength(2);
  });
});
