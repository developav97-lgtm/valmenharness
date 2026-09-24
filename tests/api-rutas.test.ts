/**
 * Las rutas que la interfaz pide contra las que el servidor tiene.
 *
 * Existe por un 404 real: la pantalla mandaba
 * `/api/tickets/:id/gates/:gate/:recibo/decision` y el servidor solo conocía
 * `/api/tickets/:id/gates/:recibo/decision`. La interfaz **compilaba**, la prueba
 * de que «la interfaz se ejecuta» **pasaba**, y el error apareció cuando una
 * persona pulsó Aprobar en el primer ticket real.
 *
 * Ninguna prueba de unidad ve esto: las dos mitades son correctas por separado, y
 * el defecto vive en el medio. Lo que se afirma acá es el contrato entre las dos —
 * cada URL que la interfaz construye tiene que corresponder a una ruta declarada—,
 * y se lee del archivo, así que una URL nueva sin su ruta falla acá y no en la
 * pantalla de alguien.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { type ServerContext, handleApi } from "../packages/server/src/server.js";

const WEB = readFileSync(
  join(import.meta.dirname, "..", "packages", "server", "web", "index.html"),
  "utf8",
);

/**
 * Las rutas que el servidor atiende.
 *
 * Se declaran acá a propósito y no se derivan del código: derivarlas haría que la
 * prueba afirme lo que el servidor hace —incluido un error— en vez de lo que la
 * interfaz necesita. Una ruta nueva se agrega acá y en el servidor.
 */
const RUTAS = [
  "GET /api/health",
  "GET /api/tickets",
  "GET /api/tickets/:id",
  "GET /api/tickets/:id/gates",
  "POST /api/tickets/:id/gates/:receiptId/decision",
  "POST /api/tickets/:id/gates/:gate/run",
  "POST /api/tickets/:id/transition",
  "POST /api/tickets/:id/consumo",
  "GET /api/features/:slug",
  "POST /api/features/:slug/decompose",
  "POST /api/features/:slug/transition",
  "POST /api/processes/gates/:gate/approve",
  "PUT /api/providers/:id/credential",
  "DELETE /api/providers/:id/credential",
  "GET /api/providers/:id/models",
  "POST /api/providers/:id/probe",
  "POST /api/providers/:id/models/test",
  "GET /api/report",
  "GET /api/timeline",
  "GET /api/standards",
  "POST /api/standards/:id/decision",
] as const;

/** Normaliza una ruta: los valores dinámicos pasan a `:param` y se quita la consulta. */
function normalizar(url: string): string {
  return (
    url
      .replace(/\$\{[^}]*\}/g, ":param")
      // Los dos lados se normalizan al mismo marcador: la interfaz escribe
      // `${...}` y el servidor `:id`, y son la misma posición del camino.
      .replace(/:[a-zA-Z][a-zA-Z0-9]*/g, ":param")
      .replace(/\?.*$/, "")
      .replace(/\/+$/, "")
  );
}

/** Las mismas posiciones, con el nombre canónico de cada parámetro. */
function canonica(ruta: string): string {
  const [metodo, camino] = ruta.split(" ");
  return `${metodo} ${normalizar(camino ?? "")}`;
}

/**
 * Las llamadas de la interfaz, con su método.
 *
 * El método importa y la prueba de rutas lo ignoraba: comparaba solo caminos, así
 * que una URL declarada como `POST` y llamada como `PUT` pasaba en verde. Apareció
 * al llamar de verdad al despachador —`PUT /api/providers/:id/credential` era
 * `POST` en la lista— y ahora se afirma con el método incluido.
 */
function llamadasDeLaInterfaz(): string[] {
  const encontradas = new Set<string>();
  for (const match of WEB.matchAll(
    /api\(\s*"(GET|POST|PUT|DELETE)"\s*,\s*`(\/api\/[^`]*)`/g,
  )) {
    const metodo = match[1] as string;
    const camino = (match[2] as string).replace(/encodeURIComponent\([^)]*\)/g, ":param");
    encontradas.add(`${metodo} ${normalizar(camino)}`);
  }
  return [...encontradas].sort();
}

/** Las URLs de `/api/` que el módulo de la interfaz construye. */
function urlsDeLaInterfaz(): string[] {
  const encontradas = new Set<string>();
  for (const match of WEB.matchAll(/`(\/api\/[^`]*)`/g)) {
    const url = match[1] as string;
    // Los `encodeURIComponent(...)` son valores, no parte del camino.
    encontradas.add(normalizar(url.replace(/encodeURIComponent\([^)]*\)/g, ":param")));
  }
  return [...encontradas].sort();
}

describe("el contrato de rutas entre la interfaz y el servidor", () => {
  it("encuentra las URLs de la interfaz, para que la prueba no pase por vacío", () => {
    // Una prueba que no encuentra nada pasa siempre, y esta existe justamente
    // porque una prueba que pasaba no vio el defecto.
    expect(urlsDeLaInterfaz().length).toBeGreaterThan(10);
  });

  it("cada llamada de la interfaz corresponde a una ruta declarada, con su método", () => {
    const conocidas = new Set(RUTAS.map((ruta) => canonica(ruta)));
    const llamadas = llamadasDeLaInterfaz();
    expect(llamadas.length).toBeGreaterThan(5);
    expect(llamadas.filter((llamada) => !conocidas.has(llamada))).toEqual([]);
  });

  it("cada URL que la interfaz construye corresponde a una ruta declarada", () => {
    const conocidas = new Set(
      RUTAS.map((ruta) => normalizar(ruta.split(" ")[1] as string)),
    );
    const desconocidas = urlsDeLaInterfaz().filter((url) => !conocidas.has(url));

    expect(desconocidas).toEqual([]);
  });

  it("la ruta de la decisión de una compuerta no lleva la compuerta de más", () => {
    // El identificador del recibo ya nombra su compuerta (`GR-…-analysis`), así que
    // repetirla en la URL es redundancia que puede contradecir: una URL que dice
    // `plan` y un recibo que dice `analysis` no tienen una respuesta correcta.
    const compuertas = urlsDeLaInterfaz().filter(
      (url) => url.endsWith("/decision") && url.includes("/gates/"),
    );
    expect(compuertas).toEqual(["/api/tickets/:param/gates/:param/decision"]);
  });

  it("las rutas declaradas se pueden normalizar, o la comparación mentiría", () => {
    for (const ruta of RUTAS) {
      expect(canonica(ruta)).toMatch(/^(GET|POST|PUT|DELETE) \/api\//);
    }
  });
});

/**
 * Las rutas, contra el despachador de verdad.
 *
 * Esta suite existe porque la comparación de arriba **pasó en verde mientras la
 * pantalla devolvía 404**: la ruta de la decisión de un estándar pedía cinco
 * segmentos y la interfaz mandaba cuatro, y como la prueba comparaba cadenas
 * normalizadas —no el despachador— el defecto vivía justo en el medio que decía
 * cubrir. Comparar textos puede afirmar que dos listas coinciden; no puede
 * afirmar que el servidor reconozca el camino.
 *
 * Así que aquí se llama a `handleApi` con cada ruta declarada, con un `:param`
 * sustituido por un valor real. Lo que se afirma es una sola cosa: que la
 * respuesta **no** sea «Ruta no encontrada». Que después falle por falta de
 * datos, de credenciales o de ticket es lo esperado —el proyecto de prueba está
 * vacío—, y es la diferencia exacta entre «esta ruta no existe» y «esta ruta
 * existe y le faltan cosas».
 */
describe("las rutas declaradas, contra el despachador", () => {
  const lab = mkdtempSync(join(tmpdir(), "valmen-rutas-"));
  const contexto = (): ServerContext => ({
    root: lab,
    paths: { root: lab, ticketsDir: "tickets" },
  });

  afterAll(() => {
    rmSync(lab, { recursive: true, force: true });
  });

  it("ninguna ruta declarada termina en «Ruta no encontrada»", async () => {
    const noEncontradas: string[] = [];

    for (const ruta of RUTAS) {
      const [metodo, camino] = ruta.split(" ") as [string, string];
      const concreto = camino.replace(/:([a-zA-Z]+)/g, "de-prueba");
      const respuesta = await handleApi(metodo, concreto, {}, contexto());
      const cuerpo = JSON.stringify(respuesta.body);

      // El 404 legítimo es el de un recurso que no existe; el que delata un
      // contrato roto es el del camino, y dice «Ruta no encontrada».
      if (respuesta.status === 404 && cuerpo.includes("Ruta no encontrada")) {
        noEncontradas.push(`${metodo} ${camino} → ${concreto}`);
      }
    }

    expect(noEncontradas).toEqual([]);
  });
});
