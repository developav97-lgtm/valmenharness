/**
 * R-GUI-002 a R-GUI-004: `valmen gate` con la cascada completa, de punta a punta, contra un modelo
 * guionado local.
 *
 * La prueba lanza el binario compilado (`packages/cli/dist/main.js`) como lo usa una persona: un
 * subproceso con un registro temporal, un `routing.yaml` y un entorno armado desde cero. El modelo
 * es un servidor HTTP en `127.0.0.1` con puerto 0 —el mismo para los tres caminos: el chat de
 * OpenRouter, `/decisions` de jev y el `claude` falso de `VALMEN_CLAUDE_BIN`— que responde en el
 * orden que fija un guion. Ninguna prueba sale a la red ni usa una clave real, y lo comprueba una
 * guarda que se precarga en el subproceso (`NODE_OPTIONS=--import`): reemplaza `fetch`, anota cada
 * intento (destino, si es loopback, si lleva credencial) y rechaza todo host que no sea local. La
 * guarda no es una costura del CLI: su código no cambia, solo se observa y se corta la red.
 *
 * El binario se exige compilado (`npm run build`): con uno viejo la prueba mediría código anterior
 * sin decirlo, y el CI ya compila antes de `npm test` (`npm run typecheck`).
 *
 * La segunda mitad cierra el hallazgo H1 de la URL base de prueba: con una `VALMEN_BASE_URL_*`
 * activa la cadena va completa o la compuerta falla nombrando la variable que falta, y ni la
 * cascada ni jev degradan a otro evaluador.
 */
import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { requireTestRoutes } from "../packages/credentials/src/endpoints.js";
import { verifiedCascade } from "../packages/engine/src/cascade.js";
import type { CascadeOptions } from "../packages/engine/src/evaluators.js";
import { runGate } from "../packages/engine/src/gate.js";
import { readReceipts } from "../packages/engine/src/receipts.js";
import type {
  GateReceipt,
  Proposition,
  PropositionAnswer,
} from "../packages/gate/src/index.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const RAIZ = join(import.meta.dirname, "..");
const BINARIO = join(RAIZ, "packages", "cli", "dist", "main.js");
const TICKET = "BUGFIX-POS-FILTRO-ORDENES-20260921";
const CLAVE_FALSA = "clave-falsa-de-prueba";
const LIMITE_DE_UN_PROCESO_MS = 25_000;

/** Las proposiciones de `analysis` que aplican a un ticket BUGFIX, en el orden del gate. */
const PROPOSICIONES_DE_ANALISIS = [
  "diagnostico_explica_el_sintoma",
  "causa_especifica",
  "nombra_archivos_reales",
  "riesgos_cubren_impactos",
  "clasificacion",
] as const;

// ── El binario, exigido ─────────────────────────────────────────────────────

/** Falla pidiendo el build si el binario no está: no se salta, porque entonces no mediría nada. */
function exigirBinario(ruta: string): void {
  if (!existsSync(ruta)) {
    throw new Error(
      "Falta packages/cli/dist/main.js: corre `npm run build` antes de `npm test`.",
    );
  }
}

beforeAll(() => {
  exigirBinario(BINARIO);
});

// ── El servidor guionado ────────────────────────────────────────────────────

/**
 * Un paso del guion: cómo responder al pedido que le toque, en orden.
 *
 * `base` es la confianza (chat y `claude` falso) o la probabilidad `noul` (jev) de toda
 * proposición; `por` la cambia para una; `opciones` fija la opción de una proposición `choice`.
 */
interface Paso {
  readonly base: number;
  readonly por?: Readonly<Record<string, number>>;
  readonly opciones?: Readonly<Record<string, string>>;
}

/** Lo que el servidor guardó de un pedido. */
interface Pedido {
  /** El número de llamada, desde 1. */
  readonly n: number;
  readonly ruta: string;
  readonly modelo: string;
  /** Las proposiciones que el pedido hace: las de su esquema (chat, `claude`) o `questions` (jev). */
  readonly proposiciones: readonly string[];
  readonly credencial: boolean;
  /** `true` si el guion no tenía un paso para este pedido. */
  readonly sinGuion: boolean;
}

type FalloDelServidor = "500" | "307" | "no-json";

interface ServidorGuionado {
  /** `http://127.0.0.1:<puerto>`, sin barra final. */
  readonly base: string;
  readonly pedidos: Pedido[];
  cerrar(): Promise<void>;
}

interface EsquemaDeJuez {
  readonly properties?: Record<
    string,
    { readonly properties?: Record<string, { readonly enum?: readonly string[] }> }
  >;
}

/** El esquema que el juez manda: en `response_format` (chat), en `tools` o en `schema` (claude). */
function esquemaDe(cuerpo: Record<string, unknown>): EsquemaDeJuez | null {
  const formato = cuerpo["response_format"] as
    { json_schema?: { schema?: EsquemaDeJuez } } | undefined;
  const herramientas = cuerpo["tools"] as
    { function?: { parameters?: EsquemaDeJuez } }[] | undefined;
  return (
    formato?.json_schema?.schema ??
    herramientas?.[0]?.function?.parameters ??
    (cuerpo["schema"] as EsquemaDeJuez | undefined) ??
    null
  );
}

/** La respuesta del juez: una propiedad por proposición, `holds` o `choice` según su tipo. */
function respuestaDeJuez(esquema: EsquemaDeJuez, paso: Paso): Record<string, unknown> {
  const respuesta: Record<string, unknown> = {};
  for (const [id, propiedad] of Object.entries(esquema.properties ?? {})) {
    const confianza = paso.por?.[id] ?? paso.base;
    const opciones = propiedad.properties?.["choice"]?.enum;
    respuesta[id] =
      opciones === undefined
        ? { holds: true, confidence: confianza, reason: `guion: ${id}` }
        : {
            choice: paso.opciones?.[id] ?? opciones[0],
            confidence: confianza,
            reason: `guion: ${id}`,
          };
  }
  return respuesta;
}

/** La respuesta de jev: un `noul` por pregunta (una `choice` lleva su opción). */
function respuestaDeJev(
  preguntas: Record<string, { type?: string; criteria?: Record<string, string> }>,
  paso: Paso,
): Record<string, unknown> {
  const respuestas: Record<string, unknown> = {};
  for (const [id, pregunta] of Object.entries(preguntas)) {
    respuestas[id] =
      pregunta.type === "choice"
        ? {
            type: "choice",
            choice: paso.opciones?.[id] ?? Object.keys(pregunta.criteria ?? {})[0],
            confidence: paso.por?.[id] ?? paso.base,
          }
        : { type: "noul", noul: paso.por?.[id] ?? paso.base };
  }
  return {
    id: "gen-dec-guion",
    model: "typesafe/jev-guion",
    provider: "TypeSafe",
    answers: respuestas,
    usage: { input_tokens: 10, output_tokens: 5, cost: 0 },
  };
}

let servidores: Server[] = [];

/**
 * Un servidor local con un guion. Sin `fallo` responde cada pedido con el paso que le toca y, si
 * ya no hay pasos, con un 500 que nombra la llamada sin guion. Con `fallo` responde siempre
 * eso: un 500, un 307 hacia `destino` o un 200 que no es JSON.
 */
async function servidorGuionado(
  guion: readonly Paso[],
  opciones: { readonly fallo?: FalloDelServidor; readonly destino?: string } = {},
): Promise<ServidorGuionado> {
  const pedidos: Pedido[] = [];
  const servidor = createServer((peticion, respuesta) => {
    const trozos: Buffer[] = [];
    peticion.on("data", (trozo: Buffer) => trozos.push(trozo));
    peticion.on("end", () => {
      const ruta = peticion.url ?? "";
      let cuerpo: Record<string, unknown> = {};
      try {
        cuerpo = JSON.parse(Buffer.concat(trozos).toString("utf8")) as Record<
          string,
          unknown
        >;
      } catch {
        // Un cuerpo ilegible queda como objeto vacío: el pedido igual se anota.
      }
      const preguntas = cuerpo["questions"] as
        Record<string, { type?: string; criteria?: Record<string, string> }> | undefined;
      const esquema = esquemaDe(cuerpo);
      const n = pedidos.length + 1;
      const modelo = typeof cuerpo["model"] === "string" ? cuerpo["model"] : "";
      const paso = guion[n - 1];
      const sinGuion = opciones.fallo === undefined && paso === undefined;
      pedidos.push({
        n,
        ruta,
        modelo,
        proposiciones:
          preguntas === undefined
            ? Object.keys(esquema?.properties ?? {})
            : Object.keys(preguntas),
        credencial:
          peticion.headers["authorization"] !== undefined ||
          peticion.headers["x-api-key"] !== undefined,
        sinGuion,
      });

      if (opciones.fallo === "500") {
        respuesta.writeHead(500, { "Content-Type": "application/json" });
        respuesta.end(JSON.stringify({ error: "fallo guionado del servidor" }));
        return;
      }
      if (opciones.fallo === "307") {
        respuesta.writeHead(307, { Location: `${opciones.destino ?? ""}${ruta}` });
        respuesta.end();
        return;
      }
      if (opciones.fallo === "no-json") {
        respuesta.writeHead(200, { "Content-Type": "text/plain" });
        respuesta.end("esto no es JSON");
        return;
      }
      if (paso === undefined) {
        respuesta.writeHead(500, { "Content-Type": "application/json" });
        respuesta.end(
          JSON.stringify({
            error: `llamada sin guion: n.º ${n} (${ruta}, modelo ${modelo})`,
          }),
        );
        return;
      }

      respuesta.writeHead(200, { "Content-Type": "application/json" });
      if (preguntas !== undefined) {
        respuesta.end(JSON.stringify(respuestaDeJev(preguntas, paso)));
        return;
      }
      const juicio = respuestaDeJuez(esquema ?? {}, paso);
      respuesta.end(
        JSON.stringify(
          ruta === "/claude"
            ? {
                structured_output: juicio,
                model: modelo,
                usage: { input_tokens: 7, output_tokens: 3 },
              }
            : {
                model: `${modelo}-guion`,
                choices: [{ message: { content: JSON.stringify(juicio) } }],
                usage: { prompt_tokens: 7, completion_tokens: 3 },
              },
        ),
      );
    });
  });
  servidores.push(servidor);
  await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
  const { port } = servidor.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    pedidos,
    cerrar: async () => {
      servidor.closeAllConnections();
      await new Promise<void>((listo) => servidor.close(() => listo()));
    },
  };
}

/** Una URL local en la que no escucha nadie: se abre un servidor, se anota el puerto y se cierra. */
async function urlCaida(): Promise<string> {
  const servidor = await servidorGuionado([]);
  await servidor.cerrar();
  return servidor.base;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const servidor of servidores) {
    servidor.closeAllConnections();
    await new Promise<void>((listo) => servidor.close(() => listo()));
  }
  servidores = [];
});

// ── El laboratorio: registro, routing, guarda de red y `claude` falso ───────

interface Laboratorio {
  readonly raiz: string;
  /** El módulo que se precarga con `--import`: anota y corta la red. */
  readonly guarda: string;
  /** Un intento de red por línea. */
  readonly red: string;
  /** El `claude` falso, listo para `VALMEN_CLAUDE_BIN`. */
  readonly claude: string;
  /** Un directorio con solo `node`: el `PATH` del subproceso no encuentra ningún `claude` real. */
  readonly bin: string;
  readonly home: string;
}

interface Eslabon {
  readonly provider: string;
  readonly model: string;
  readonly effort?: string;
}

const PRODUCTOR: Eslabon = {
  provider: "openrouter",
  model: "productor/uno",
  effort: "auto",
};
const ESCALADO: Eslabon = {
  provider: "openrouter",
  model: "escalado/dos",
  effort: "medium",
};

let laboratorios: string[] = [];

afterAll(() => {
  for (const laboratorio of laboratorios)
    rmSync(laboratorio, { recursive: true, force: true });
  laboratorios = [];
});

/** Productor y escalado en el proveedor que se pida; verificador y evaluador con un modelo de TypeSafe. */
function routingYaml(productor: Eslabon, escalado: Eslabon): string {
  const rol = (id: string, eslabon: Eslabon): string =>
    `  ${id}:\n    provider: ${eslabon.provider}\n    model: ${eslabon.model}\n    effort: ${eslabon.effort ?? "auto"}\n`;
  const typesafe: Eslabon = { provider: "openrouter", model: "typesafe/jev-1.13" };
  return (
    "preset: quality\n\nroles:\n" +
    rol("producer", productor) +
    rol("escalation", escalado) +
    rol("verifier", typesafe) +
    rol("gate-evaluator", typesafe)
  );
}

/** La guarda: anota cada intento de `fetch` y rechaza todo host que no sea `127.0.0.1` o `localhost`. */
function textoDeLaGuarda(archivoDeRed: string): string {
  return `import { appendFileSync } from "node:fs";
const original = globalThis.fetch;
globalThis.fetch = async function (entrada, init) {
  const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
  const cabeceras = new Headers(init?.headers ?? (entrada instanceof Request ? entrada.headers : {}));
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  appendFileSync(${JSON.stringify(archivoDeRed)}, JSON.stringify({
    destino: url.origin + url.pathname,
    loopback,
    credencial: cabeceras.has("authorization") || cabeceras.has("x-api-key"),
  }) + "\\n");
  if (!loopback) throw new TypeError("La guarda de la prueba bloquea la red: " + url.origin);
  return original(entrada, init);
};
`;
}

/** El `claude` falso: manda el modelo, el esquema y el prompt al servidor y imprime su respuesta. */
function textoDelClaudeFalso(base: string): string {
  return `const argumentos = process.argv.slice(2);
const valor = (nombre) => argumentos[argumentos.indexOf(nombre) + 1];
let prompt = "";
for await (const trozo of process.stdin) prompt += trozo;
const respuesta = await fetch(${JSON.stringify(`${base}/claude`)}, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ model: valor("--model"), schema: JSON.parse(valor("--json-schema") ?? "null"), prompt }),
});
const texto = await respuesta.text();
if (!respuesta.ok) {
  process.stdout.write(JSON.stringify({ is_error: true, api_error_status: respuesta.status, result: texto }));
  process.exit(1);
}
const { structured_output, model, usage } = JSON.parse(texto);
process.stdout.write(JSON.stringify({ is_error: false, structured_output, usage, modelUsage: { [model]: {} } }));
`;
}

function nuevoLaboratorio(
  base: string,
  productor: Eslabon = PRODUCTOR,
  escalado: Eslabon = ESCALADO,
): Laboratorio {
  const raiz = mkdtempSync(join(tmpdir(), "valmen-cascada-guionada-"));
  laboratorios.push(raiz);
  const lab: Laboratorio = {
    raiz,
    guarda: join(raiz, "guarda-red.mjs"),
    red: join(raiz, "red.jsonl"),
    claude: join(raiz, "claude-falso"),
    bin: join(raiz, "bin"),
    home: join(raiz, "home"),
  };
  mkdirSync(join(raiz, ".valmen"), { recursive: true });
  mkdirSync(lab.bin, { recursive: true });
  mkdirSync(lab.home, { recursive: true });
  symlinkSync(process.execPath, join(lab.bin, "node"));
  writeFileSync(
    join(raiz, ".valmen", "routing.yaml"),
    routingYaml(productor, escalado),
    "utf8",
  );
  writeFixtureTicket(raiz, { id: TICKET, workflowStatus: "analyzed" });
  writeFileSync(lab.red, "", "utf8");
  writeFileSync(lab.guarda, textoDeLaGuarda(lab.red), "utf8");
  // Un script de shell que lanza el de Node con su ruta absoluta: no depende del `PATH`.
  writeFileSync(join(raiz, "claude-falso.mjs"), textoDelClaudeFalso(base), "utf8");
  writeFileSync(
    lab.claude,
    `#!/bin/sh\nexec "${process.execPath}" "${join(raiz, "claude-falso.mjs")}" "$@"\n`,
    "utf8",
  );
  chmodSync(lab.claude, 0o755);
  return lab;
}

// ── Una corrida del binario ─────────────────────────────────────────────────

interface Intento {
  readonly destino: string;
  readonly loopback: boolean;
  readonly credencial: boolean;
}

interface Salida {
  readonly codigo: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** El entorno del subproceso, armado desde cero: nada del que corre la prueba pasa. */
function entornoDe(
  lab: Laboratorio,
  extra: Readonly<Record<string, string>>,
): NodeJS.ProcessEnv {
  return {
    PATH: [lab.bin, "/usr/bin", "/bin"].join(":"),
    HOME: lab.home,
    NODE_OPTIONS: `--import ${pathToFileURL(lab.guarda).href}`,
    ...extra,
  };
}

function correrBinario(
  lab: Laboratorio,
  argumentos: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<Salida> {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(process.execPath, [BINARIO, "--root", lab.raiz, ...argumentos], {
      env,
      cwd: lab.raiz,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    hijo.stdout.on("data", (trozo: Buffer) => (stdout += trozo.toString("utf8")));
    hijo.stderr.on("data", (trozo: Buffer) => (stderr += trozo.toString("utf8")));
    const reloj = setTimeout(() => hijo.kill("SIGKILL"), LIMITE_DE_UN_PROCESO_MS);
    hijo.on("error", rechazar);
    hijo.on("close", (codigo) => {
      clearTimeout(reloj);
      resolver({ codigo, stdout, stderr });
    });
  });
}

function intentosDeRed(lab: Laboratorio): Intento[] {
  return readFileSync(lab.red, "utf8")
    .split("\n")
    .filter((linea) => linea !== "")
    .map((linea) => JSON.parse(linea) as Intento);
}

function recibosDe(lab: Laboratorio): GateReceipt[] {
  return readReceipts({ root: lab.raiz, ticketsDir: "tickets" }, TICKET);
}

interface OpcionesDeEscenario {
  readonly guion?: readonly Paso[];
  readonly fallo?: FalloDelServidor | "caido";
  readonly productor?: Eslabon;
  readonly escalado?: Eslabon;
  /** El evaluador de la compuerta; `cascade` por defecto. */
  readonly evaluador?: "cascade" | "jev";
  /** Las variables de URL de prueba que se definen, hacia el servidor guionado. */
  readonly variables?: {
    readonly openrouter?: boolean;
    readonly jev?: boolean;
    readonly anthropic?: boolean;
    readonly claudeBin?: boolean;
  };
  /** Claves falsas en el entorno: el control de que ninguna sale de loopback. */
  readonly clavesFalsas?: boolean;
}

interface Escenario {
  readonly salida: Salida;
  /** Lo que recibió el servidor guionado, en orden. */
  readonly pedidos: readonly Pedido[];
  /** Lo que recibió el segundo servidor, el destino del 307. */
  readonly destino: readonly Pedido[];
  readonly red: readonly Intento[];
  readonly recibos: readonly GateReceipt[];
}

/** Corre `valmen gate analysis` sobre un laboratorio nuevo, contra un servidor guionado. */
async function correrEscenario(opciones: OpcionesDeEscenario = {}): Promise<Escenario> {
  const productor = opciones.productor ?? PRODUCTOR;
  const variables = {
    openrouter: true,
    jev: true,
    anthropic: false,
    claudeBin: productor.provider === "claude-code",
    ...opciones.variables,
  };
  const destino = await servidorGuionado([]);
  const servidor =
    opciones.fallo === "caido"
      ? null
      : await servidorGuionado(opciones.guion ?? [], {
          ...(opciones.fallo === undefined ? {} : { fallo: opciones.fallo }),
          destino: destino.base,
        });
  const base = servidor?.base ?? (await urlCaida());
  const lab = nuevoLaboratorio(base, productor, opciones.escalado ?? ESCALADO);

  const extra: Record<string, string> = {
    ...(variables.openrouter ? { VALMEN_BASE_URL_OPENROUTER: `${base}/v1` } : {}),
    ...(variables.jev ? { VALMEN_BASE_URL_JEV: base } : {}),
    ...(variables.anthropic ? { VALMEN_BASE_URL_ANTHROPIC: `${base}/v1` } : {}),
    ...(variables.claudeBin ? { VALMEN_CLAUDE_BIN: lab.claude } : {}),
    ...(opciones.clavesFalsas === true
      ? { OPENROUTER_API_KEY: CLAVE_FALSA, ANTHROPIC_API_KEY: CLAVE_FALSA }
      : {}),
  };
  const salida = await correrBinario(
    lab,
    ["gate", "analysis", "--id", TICKET, "--evaluator", opciones.evaluador ?? "cascade"],
    entornoDe(lab, extra),
  );
  await servidor?.cerrar();
  await destino.cerrar();
  return {
    salida,
    pedidos: servidor?.pedidos ?? [],
    destino: destino.pedidos,
    red: intentosDeRed(lab),
    recibos: recibosDe(lab),
  };
}

// ── El guion del recorrido completo ─────────────────────────────────────────

/**
 * Tres pasos: el productor responde que todo se cumple con confianza 0.95 y la investigación
 * `completa`; el verificador da 0.97 a todo salvo 0.10 a `respaldada_causa_especifica`; y el
 * escalado responde con confianza 0.99.
 */
const GUION_DE_TRES_PASOS: readonly Paso[] = [
  { base: 0.95, opciones: { clasificacion: "completa" } },
  { base: 0.97, por: { respaldada_causa_especifica: 0.1 } },
  { base: 0.99 },
];

/** La probabilidad con la que el juez traduce «se cumple» con esa confianza. */
const probabilidadDe = (confianza: number): number => 0.3 + 0.7 * confianza;

function respuestaDelRecibo(
  recibo: GateReceipt | undefined,
  id: string,
): PropositionAnswer {
  const respuesta = recibo?.modelAnswers.find((candidata) => candidata.id === id);
  if (respuesta === undefined)
    throw new Error(`El recibo no guarda la respuesta de ${id}.`);
  return respuesta;
}

describe("el binario compilado", () => {
  it("C12. sin packages/cli/dist/main.js, la prueba falla pidiendo npm run build", () => {
    expect(() => exigirBinario(join(tmpdir(), "no-existe", "main.js"))).toThrow(
      /npm run build/,
    );
  });
});

describe("valmen gate con la cascada completa contra un modelo guionado", () => {
  let corrida: Escenario;

  beforeAll(async () => {
    corrida = await correrEscenario({ guion: GUION_DE_TRES_PASOS });
  });

  it("C2. el servidor guionado recibe tres peticiones: productor, verificador (/decisions) y escalado", () => {
    expect(corrida.salida.codigo, corrida.salida.stderr).toBe(0);
    expect(corrida.pedidos.map((pedido) => [pedido.ruta, pedido.modelo])).toEqual([
      ["/v1/chat/completions", "productor/uno"],
      ["/decisions", "typesafe/jev-1.13"],
      ["/v1/chat/completions", "escalado/dos"],
    ]);
    // El verificador pregunta por lo que respondió el productor, y el escalado solo por lo dudoso.
    expect(corrida.pedidos[1]?.proposiciones).toEqual(
      PROPOSICIONES_DE_ANALISIS.map((id) => `respaldada_${id}`),
    );
    expect(corrida.pedidos[2]?.proposiciones).toEqual(["causa_especifica"]);
    expect(corrida.pedidos.some((pedido) => pedido.sinGuion)).toBe(false);
  });

  it("C3. el recibo declara el evaluador cascade", () => {
    expect(corrida.recibos).toHaveLength(1);
    expect(corrida.recibos[0]?.evaluator).toBe("cascade");
  });

  it("C4. el recibo no declara requestedEvaluator", () => {
    expect(corrida.recibos[0]).toBeDefined();
    expect(corrida.recibos[0]?.requestedEvaluator).toBeUndefined();
  });

  it("C5. el recibo lista las proposiciones de analysis que aplican a un ticket BUGFIX", () => {
    expect(corrida.recibos[0]?.propositions.map((proposicion) => proposicion.id)).toEqual(
      PROPOSICIONES_DE_ANALISIS,
    );
  });

  it("C6. modelAnswers guarda, de lo que el verificador respaldó, el valor que dio el productor", () => {
    const recibo = corrida.recibos[0];
    for (const id of PROPOSICIONES_DE_ANALISIS) {
      if (id === "causa_especifica") continue;
      const respuesta = respuestaDelRecibo(recibo, id);
      if (id === "clasificacion") {
        expect(respuesta.choice).toBe("completa");
        expect(respuesta.confidence).toBe(0.95);
      } else {
        expect(respuesta.value).toBeCloseTo(probabilidadDe(0.95), 6);
      }
    }
  });

  it("C7. escalations guarda causa_especifica con la probabilidad 0.10 del verificador", () => {
    const escalamientos = corrida.recibos[0]?.escalations ?? [];
    expect(escalamientos).toHaveLength(1);
    expect(escalamientos[0]?.proposition).toBe("causa_especifica");
    expect(escalamientos[0]?.verified).toBeCloseTo(0.1, 6);
    expect(escalamientos[0]?.from.model).toBe("productor/uno");
    expect(escalamientos[0]?.to.model).toBe("escalado/dos");
  });

  it("C8. modelAnswers guarda, para causa_especifica, el valor que dio el escalado", () => {
    expect(respuestaDelRecibo(corrida.recibos[0], "causa_especifica").value).toBeCloseTo(
      probabilidadDe(0.99),
      6,
    );
  });

  it("C9. el resultado del recibo es approve", () => {
    expect(corrida.recibos[0]?.outcome).toBe("approve");
  });

  it("C11. la guarda de red no registra ningún intento fuera de loopback ni con credencial", () => {
    expect(corrida.red).toHaveLength(3);
    expect(corrida.red.filter((intento) => !intento.loopback)).toEqual([]);
    expect(corrida.red.filter((intento) => intento.credencial)).toEqual([]);
    expect(corrida.pedidos.filter((pedido) => pedido.credencial)).toEqual([]);
  });
});

describe("el productor en claude-code, con un claude falso", () => {
  let corrida: Escenario;

  beforeAll(async () => {
    corrida = await correrEscenario({
      guion: GUION_DE_TRES_PASOS,
      productor: { provider: "claude-code", model: "claude-productor", effort: "auto" },
    });
  });

  it("C10. el claude falso de VALMEN_CLAUDE_BIN recibe el pedido del productor", () => {
    expect(corrida.salida.codigo, corrida.salida.stderr).toBe(0);
    expect(corrida.pedidos.map((pedido) => [pedido.ruta, pedido.modelo])).toEqual([
      ["/claude", "claude-productor"],
      ["/decisions", "typesafe/jev-1.13"],
      ["/v1/chat/completions", "escalado/dos"],
    ]);
    expect(corrida.pedidos[0]?.proposiciones).toEqual(PROPOSICIONES_DE_ANALISIS);
    expect(corrida.recibos[0]?.evaluator).toBe("cascade");
    expect(corrida.recibos[0]?.outcome).toBe("approve");
  });

  it("C11. la guarda de red no registra ningún intento fuera de loopback ni con credencial", () => {
    // Los tres pasos hablan por `fetch`, también el del `claude` falso, que hereda la guarda.
    expect(corrida.red).toHaveLength(3);
    expect(corrida.red.filter((intento) => !intento.loopback)).toEqual([]);
    expect(corrida.red.filter((intento) => intento.credencial)).toEqual([]);
  });
});

describe("el CI compila el binario antes de npm test y no usa secretos (R-GUI-003)", () => {
  const flujo = readFileSync(
    join(RAIZ, ".github", "workflows", "verificacion.yml"),
    "utf8",
  );

  it("C13. verificacion.yml corre npm run typecheck, que compila el binario, antes de npm test", () => {
    const tipos = flujo.search(/^\s*run: npm run typecheck$/m);
    const pruebas = flujo.search(/^\s*run: npm test$/m);
    expect(tipos).toBeGreaterThanOrEqual(0);
    expect(pruebas).toBeGreaterThan(tipos);

    const paquete = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(paquete.scripts["typecheck"]).toMatch(/^npm run build\b/);
    expect(paquete.scripts["build"]).toMatch(/tsc --build tsconfig\.build\.json/);
  });

  it("C14. verificacion.yml no usa ningún secreto", () => {
    expect(flujo).not.toMatch(/\bsecrets\./);
    expect(flujo).not.toMatch(/^\s*secrets:/m);
    expect(flujo).not.toMatch(/^\s*[A-Z_]*(API_KEY|TOKEN)\s*:/m);
  });
});

describe("un guion que se agota no produce un recibo aprobado (R-GUI-004)", () => {
  let corrida: Escenario;

  beforeAll(async () => {
    // La cascada hace tres llamadas y el guion trae dos: la del escalado se queda sin paso.
    corrida = await correrEscenario({ guion: GUION_DE_TRES_PASOS.slice(0, 2) });
  });

  it("C16. no queda ningún recibo approve del ticket", () => {
    expect(corrida.salida.codigo).not.toBe(0);
    expect(corrida.recibos.filter((recibo) => recibo.outcome === "approve")).toEqual([]);
    expect(corrida.recibos).toEqual([]);
  });

  it("C17. la salida de error nombra la llamada sin guion", () => {
    expect(corrida.salida.stderr).toContain("llamada sin guion: n.º 3");
    expect(corrida.salida.stderr).toContain("modelo escalado/dos");
  });

  it("C18. el servidor guionado recibe exactamente tres peticiones", () => {
    expect(corrida.pedidos.map((pedido) => [pedido.n, pedido.sinGuion])).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ]);
  });
});

// ── Con una URL de prueba activa, la cascada y jev no degradan ──────────────

const FALLOS_DEL_SERVIDOR: readonly {
  readonly nombre: string;
  readonly fallo: FalloDelServidor | "caido";
}[] = [
  { nombre: "(a) un 500", fallo: "500" },
  { nombre: "(b) un 307 hacia un segundo servidor local", fallo: "307" },
  { nombre: "(c) un 200 con un cuerpo que no es JSON", fallo: "no-json" },
  { nombre: "(d) el puerto cerrado", fallo: "caido" },
];

describe.each(FALLOS_DEL_SERVIDOR)(
  "con las variables de la cadena activas y claves falsas en el entorno: $nombre",
  ({ fallo }) => {
    let corrida: Escenario;

    beforeAll(async () => {
      corrida = await correrEscenario({ fallo, clavesFalsas: true });
    });

    it("C19. la compuerta sale con un código distinto de 0", () => {
      expect(corrida.salida.codigo).not.toBe(0);
    });

    it("C20. la guarda de red registra un solo intento: la cascada no degrada a otro evaluador", () => {
      expect(corrida.red).toHaveLength(1);
    });

    it("C21. no queda recibo del ticket", () => {
      expect(corrida.recibos).toEqual([]);
    });

    it("C15. ningún intento sale de loopback ni lleva credencial", () => {
      expect(corrida.red.filter((intento) => !intento.loopback)).toEqual([]);
      expect(corrida.red.filter((intento) => intento.credencial)).toEqual([]);
    });

    if (fallo === "307") {
      it("C22. el destino del 307 no recibe ninguna petición", () => {
        expect(corrida.destino).toEqual([]);
      });
    }
  },
);

describe("el evaluador jev con VALMEN_BASE_URL_JEV activa", () => {
  it("C23. con jev respondiendo 500, la guarda de red registra un solo intento", async () => {
    const corrida = await correrEscenario({
      evaluador: "jev",
      fallo: "500",
      variables: { openrouter: false },
      clavesFalsas: true,
    });
    expect(corrida.salida.codigo).not.toBe(0);
    expect(corrida.red).toHaveLength(1);
    expect(corrida.red.filter((intento) => !intento.loopback)).toEqual([]);
    expect(corrida.recibos).toEqual([]);
  });
});

const CADENAS_INCOMPLETAS: readonly {
  readonly nombre: string;
  readonly opciones: OpcionesDeEscenario;
  readonly falta: string;
}[] = [
  {
    nombre: "(i) sin VALMEN_BASE_URL_JEV",
    opciones: { variables: { jev: false } },
    falta: "VALMEN_BASE_URL_JEV",
  },
  {
    nombre: "(ii) el escalado en anthropic sin VALMEN_BASE_URL_ANTHROPIC",
    opciones: {
      escalado: { provider: "anthropic", model: "claude-escalado", effort: "medium" },
    },
    falta: "VALMEN_BASE_URL_ANTHROPIC",
  },
  {
    nombre: "(iii) el productor en claude-code sin VALMEN_CLAUDE_BIN",
    opciones: {
      productor: { provider: "claude-code", model: "claude-productor", effort: "auto" },
      variables: { claudeBin: false },
    },
    falta: "VALMEN_CLAUDE_BIN",
  },
];

describe.each(CADENAS_INCOMPLETAS)(
  "con VALMEN_BASE_URL_OPENROUTER activa y la cadena incompleta: $nombre",
  ({ opciones, falta }) => {
    let corrida: Escenario;

    beforeAll(async () => {
      corrida = await correrEscenario({
        guion: GUION_DE_TRES_PASOS,
        clavesFalsas: true,
        ...opciones,
      });
    });

    it("C24. la compuerta falla sin ningún intento de petición", () => {
      expect(corrida.salida.codigo).not.toBe(0);
      expect(corrida.red).toEqual([]);
      expect(corrida.pedidos).toEqual([]);
      expect(corrida.recibos).toEqual([]);
    });

    it("C25. la salida de error nombra la variable que falta", () => {
      expect(corrida.salida.stderr).toMatch(new RegExp(`le falta[^\\n]*${falta}`));
    });
  },
);

// ── Sin ninguna VALMEN_BASE_URL_* nada cambia ───────────────────────────────

describe("sin ninguna VALMEN_BASE_URL_* la cadena no se exige y la compuerta se comporta como siempre", () => {
  it("el binario con la cadena de (iii) llega a pedir la credencial, sin pedir variables de prueba", async () => {
    const corrida = await correrEscenario({
      guion: GUION_DE_TRES_PASOS,
      productor: { provider: "claude-code", model: "claude-productor", effort: "auto" },
      variables: { openrouter: false, jev: false, claudeBin: false },
    });
    expect(corrida.salida.codigo).not.toBe(0);
    expect(corrida.salida.stderr).not.toMatch(/URL de prueba|le falta/);
    // Sin variables el `claude` real sería el del `PATH`, que aquí no existe: es el fallo de siempre.
    expect(corrida.salida.stderr).toMatch(/No se encontró el CLI/);
    expect(corrida.red).toEqual([]);
    expect(corrida.recibos).toEqual([]);
  });

  it("requireTestRoutes devuelve false con el entorno vacío, con valores en blanco y sin leer otras variables", () => {
    expect(requireTestRoutes(["openrouter", "jev"], {})).toBe(false);
    expect(
      requireTestRoutes(["openrouter", "jev"], {
        VALMEN_BASE_URL_OPENROUTER: "",
        VALMEN_BASE_URL_JEV: "   ",
      }),
    ).toBe(false);
    expect(
      requireTestRoutes(["claude-code"], { VALMEN_CLAUDE_BIN: "/ruta/a/claude" }),
    ).toBe(false);
  });
});

// ── runGate con dobles: ningún código del motor degrada con una URL de prueba ───

const cadena = (): CascadeOptions => ({
  producer: { provider: "openrouter", model: "productor/uno", effort: "auto" },
  verifier: { provider: "openrouter", model: "typesafe/jev-1.13", effort: "auto" },
  escalation: { provider: "openrouter", model: "escalado/dos", effort: "medium" },
  reason: null,
});

/** Los códigos con los que el motor distingue un fallo del juez o de jev. */
const CODIGOS_DEL_MOTOR = [
  "SERVER",
  "TRANSPORT",
  "TIMEOUT",
  "RATE_LIMIT",
  "INVALID_REQUEST",
  "MALFORMED_RESPONSE",
  "MISSING_ANSWER",
] as const;

type OpcionesDeGate = Parameters<typeof runGate>[1];

function respuestasDe(propositions: readonly Proposition[]): PropositionAnswer[] {
  return propositions.map((p): PropositionAnswer =>
    p.kind === "choice"
      ? {
          id: p.id,
          kind: "choice",
          choice: Object.keys(p.criteria)[0] as string,
          confidence: 0.95,
        }
      : { id: p.id, kind: p.kind, value: 0.95, confidence: 0.95 },
  );
}

/** Un juez y un jev que cuentan sus llamadas; el que se indique lanza un error con ese código. */
function dobles(lanza: { readonly juez?: string; readonly jev?: string } = {}) {
  const cuenta = { juez: 0, jev: 0 };
  const falla = (codigo: string): Error =>
    Object.assign(new Error(`fallo guionado ${codigo}`), { code: codigo });
  const respuesta = (o: { propositions: readonly Proposition[] }, modelo: string) => ({
    answers: respuestasDe(o.propositions),
    model: { provider: "openrouter", model: modelo, resolvedVersion: `${modelo}-1` },
    usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
    latencyMs: 1,
  });
  const juez = (async (o: { propositions: readonly Proposition[] }) => {
    cuenta.juez += 1;
    if (lanza.juez !== undefined) throw falla(lanza.juez);
    return respuesta(o, "juez");
  }) as unknown as NonNullable<OpcionesDeGate["judge"]>;
  const jev = (async (o: { propositions: readonly Proposition[] }) => {
    cuenta.jev += 1;
    if (lanza.jev !== undefined) throw falla(lanza.jev);
    return respuesta(o, "jev");
  }) as unknown as NonNullable<OpcionesDeGate["jev"]>;
  return { cuenta, juez, jev };
}

const VARIABLES_DE_URL = [
  "VALMEN_BASE_URL_OPENROUTER",
  "VALMEN_BASE_URL_ANTHROPIC",
  "VALMEN_BASE_URL_CODEX",
  "VALMEN_BASE_URL_OPENCODE_GO",
  "VALMEN_BASE_URL_OPENCODE_ZEN",
  "VALMEN_BASE_URL_JEV",
] as const;

/** Fija una variable en el proceso; `null` la deja ausente. `unstubAllEnvs` restaura. */
function fijarEntorno(nombre: string, valor: string | null): void {
  vi.stubEnv(nombre, valor ?? "");
  if (valor === null) delete process.env[nombre];
}

/** Un directorio temporal que `afterAll` borra. */
function directorioTemporal(prefijo: string): string {
  const directorio = mkdtempSync(join(tmpdir(), prefijo));
  laboratorios.push(directorio);
  return directorio;
}

function laboratorioSimple(): string {
  const lab = directorioTemporal("valmen-cascada-guionada-dobles-");
  mkdirSync(join(lab, ".valmen"), { recursive: true });
  mkdirSync(join(lab, "tickets"), { recursive: true });
  writeFixtureTicket(lab, { id: TICKET, workflowStatus: "analyzed" });
  return lab;
}

async function correrGate(lab: string, opciones: Partial<OpcionesDeGate>) {
  const resultado = await runGate({ root: lab, ticketsDir: "tickets" }, {
    gateId: "analysis",
    ticketId: TICKET,
    apiKey: CLAVE_FALSA,
    now: () => new Date("2026-10-10T10:00:00.000Z"),
    ...opciones,
  } as OpcionesDeGate);
  return { resultado, recibos: readReceipts({ root: lab, ticketsDir: "tickets" }, TICKET) };
}

describe("runGate con una URL de prueba activa: ningún código del motor degrada", () => {
  beforeEach(() => {
    for (const nombre of VARIABLES_DE_URL) fijarEntorno(nombre, null);
    fijarEntorno("HOME", directorioTemporal("valmen-cascada-guionada-home-"));
    // La cadena completa, hacia un puerto local en el que no escucha nadie: los dobles no llaman.
    fijarEntorno("VALMEN_BASE_URL_OPENROUTER", "http://127.0.0.1:9/v1");
    fijarEntorno("VALMEN_BASE_URL_JEV", "http://127.0.0.1:9");
  });

  it.each(CODIGOS_DEL_MOTOR)(
    "C26. el productor lanza %s: la cascada no llama al doble de jev",
    async (codigo) => {
      const d = dobles({ juez: codigo });
      const { resultado, recibos } = await correrGate(laboratorioSimple(), {
        evaluator: "cascade",
        cascade: cadena(),
        judge: d.juez,
        jev: d.jev,
      });
      expect(d.cuenta.jev).toBe(0);
      expect(resultado.exitCode).not.toBe(0);
      expect(resultado.stderr).toContain(`fallo guionado ${codigo}`);
      expect(recibos).toEqual([]);
    },
  );

  it.each(CODIGOS_DEL_MOTOR)(
    "C27. jev lanza %s: el evaluador jev no llama al doble del juez",
    async (codigo) => {
      const d = dobles({ jev: codigo });
      const { resultado, recibos } = await correrGate(laboratorioSimple(), {
        evaluator: "jev",
        judge: d.juez,
        jev: d.jev,
      });
      expect(d.cuenta.juez).toBe(0);
      expect(resultado.exitCode).not.toBe(0);
      expect(resultado.stderr).toContain(`fallo guionado ${codigo}`);
      expect(recibos).toEqual([]);
    },
  );
});

describe("las tareas de la cascada con una URL de prueba activa", () => {
  const proposicion: Proposition = {
    id: "prueba",
    kind: "noul",
    description: "Una proposición cualquiera",
    instructions: "El estado dice algo.",
    criteria: { yes: "Lo dice.", no: "No lo dice." },
  };

  it("verifiedCascade con la cadena incompleta falla nombrando la variable, antes de llamar al juez o a jev", async () => {
    for (const nombre of VARIABLES_DE_URL) fijarEntorno(nombre, null);
    fijarEntorno("VALMEN_BASE_URL_OPENROUTER", "http://127.0.0.1:9/v1");
    const d = dobles();

    await expect(
      verifiedCascade({
        propositions: [proposicion],
        state: { plan: "…" },
        chain: cadena(),
        threshold: 0.9,
        judge: d.juez,
        jev: d.jev,
      }),
    ).rejects.toMatchObject({
      code: "TEST_URL_INCOMPLETE",
      message: expect.stringContaining("VALMEN_BASE_URL_JEV") as string,
    });
    expect(d.cuenta).toEqual({ juez: 0, jev: 0 });
  });
});

describe("runGate sin ninguna VALMEN_BASE_URL_*: las degradaciones de siempre", () => {
  beforeEach(() => {
    for (const nombre of VARIABLES_DE_URL) fijarEntorno(nombre, null);
  });

  it("C28. la cascada degrada a jev ante un fallo del productor y el recibo lo cuenta", async () => {
    const d = dobles({ juez: "SERVER" });
    const { resultado, recibos } = await correrGate(laboratorioSimple(), {
      evaluator: "cascade",
      cascade: cadena(),
      judge: d.juez,
      jev: d.jev,
    });
    expect(resultado.exitCode, resultado.stderr).toBe(0);
    expect(d.cuenta.jev).toBe(1);
    expect(recibos[0]?.evaluator).toBe("jev");
    expect(recibos[0]?.requestedEvaluator).toBe("cascade");
  });

  it("C28. jev degrada al juez ante SERVER y TRANSPORT", async () => {
    for (const codigo of ["SERVER", "TRANSPORT"]) {
      const d = dobles({ jev: codigo });
      const { resultado, recibos } = await correrGate(laboratorioSimple(), {
        evaluator: "jev",
        judge: d.juez,
        jev: d.jev,
      });
      expect(resultado.exitCode, resultado.stderr).toBe(0);
      expect(d.cuenta.juez).toBe(1);
      expect(recibos[0]?.evaluator).toBe("llm-judge");
    }
  });
});

// ── La documentación ────────────────────────────────────────────────────────

/** El texto de la sección «1.4 URL base de prueba» de la documentación de proveedores. */
function seccionDeUrlBase(): string {
  const documento = readFileSync(join(RAIZ, "docs", "04-PROVEEDORES.md"), "utf8");
  const inicio = documento.search(/^### 1\.4 URL base de prueba$/m);
  if (inicio === -1) return "";
  const resto = documento.slice(documento.indexOf("\n", inicio));
  const fin = resto.search(/^#{2,3} /m);
  return fin === -1 ? resto : resto.slice(0, fin);
}

describe("docs/04-PROVEEDORES.md, sección 1.4", () => {
  it("C29. dice que con una variable activa la compuerta no degrada a otro evaluador", () => {
    expect(seccionDeUrlBase()).toMatch(
      /con una variable activa[^.]*no degrada a otro evaluador/i,
    );
  });

  it("C30. dice que con una variable activa la compuerta falla si a un eslabón le falta su variable", () => {
    const seccion = seccionDeUrlBase();
    expect(seccion).toMatch(
      /con una variable activa[^]*le falta su\s+variable[^]*TEST_URL_INCOMPLETE/i,
    );
    expect(seccion).toContain("VALMEN_BASE_URL_JEV");
    expect(seccion).toContain("VALMEN_CLAUDE_BIN");
  });

  it("C31. ya no contiene el «Límite conocido»", () => {
    const seccion = seccionDeUrlBase();
    expect(seccion).not.toBe("");
    expect(seccion).not.toMatch(/Límite conocido/);
  });
});
