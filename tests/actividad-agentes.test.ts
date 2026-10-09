/**
 * El lector de actividad de los subagentes de la corrida y su ruta
 * `GET /api/corrida/agentes` (FEATURE-SERVER-ACTIVIDAD-AGENTES-20261008).
 *
 * Todo con carpetas temporales y transcripts sintéticos: ningún test lee el HOME
 * real. El reloj se inyecta para que `esperando` (más de 60 s) sea determinista.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createExecutionIdentity } from "../packages/core/src/execution-identity.js";
import { recordExecutionActivity, resolveAuthorizedProject } from "../packages/engine/src/index.js";
import { leerAgentesDeCorrida, recortar } from "../packages/server/src/agentes.js";
import { type ServerContext, handleApi } from "../packages/server/src/server.js";
import { carpetaDeClaude, escribirSesionDeClaude } from "./helpers/claude.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

const TICKET = "FEATURE-SERVER-PRUEBA-AGENTES-20261008";
const SECRETO = "TEXTO-SENSIBLE-NO-DEBE-SALIR";
const T0 = Date.parse("2026-10-08T12:00:00.000Z");
const iso = (segundos: number): string => new Date(T0 + segundos * 1000).toISOString();

let home: string;
let root: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "valmen-agentes-"));
  root = join(home, "proyecto");
  mkdirSync(join(root, ".valmen"), { recursive: true });
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

interface Ev {
  readonly t: number;
  readonly tipo: "user" | "assistant";
  readonly texto?: string;
  readonly herramienta?: { id: string; name: string };
  readonly resultadoDe?: string;
  readonly error?: boolean;
  readonly stop?: string;
  readonly modelo?: string;
  readonly esfuerzo?: string;
  readonly cwd?: string;
  /** Preguntas de una AskUserQuestion con la forma real (question, header, options). */
  readonly preguntas?: readonly string[];
  /** `toolUseResult.answers` del resultado: pregunta → respuesta. */
  readonly respuestas?: Readonly<Record<string, string>>;
  /** Sustituye `input.command` del tool_use (para sembrar centinelas). */
  readonly comando?: string;
  /** Sustituye el `content` del tool_result. */
  readonly contenido?: string;
}

const FUERA_HEADER = "TP-HEADER";
const FUERA_LABEL = "TP-LABEL";
const FUERA_DESCRIPCION = "TP-DESCRIPCION";
const FUERA_CONTENT = "TP-CONTENT";

function linea(e: Ev): string {
  const base = {
    type: e.tipo,
    timestamp: iso(e.t),
    cwd: e.cwd ?? "/work/ticket-a",
    gitBranch: "valmen/ticket-a",
    sessionId: "x",
  };
  if (e.tipo === "user") {
    const content =
      e.resultadoDe !== undefined
        ? [{ type: "tool_result", tool_use_id: e.resultadoDe, content: e.contenido ?? SECRETO, ...(e.error === true ? { is_error: true } : {}) }]
        : (e.texto ?? "");
    return JSON.stringify({
      ...base,
      message: { role: "user", content },
      ...(e.respuestas === undefined
        ? {}
        : { toolUseResult: { questions: [], answers: e.respuestas } }),
    });
  }
  const content = [
    ...(e.texto !== undefined ? [{ type: "text", text: e.texto }] : []),
    ...(e.herramienta !== undefined
      ? [
          {
            type: "tool_use",
            id: e.herramienta.id,
            name: e.herramienta.name,
            input:
              e.preguntas === undefined
                ? { command: e.comando ?? SECRETO }
                : {
                    questions: e.preguntas.map((question) => ({
                      question,
                      header: FUERA_HEADER,
                      multiSelect: false,
                      options: [{ label: FUERA_LABEL, description: FUERA_DESCRIPCION }],
                    })),
                  },
          },
        ]
      : []),
  ];
  return JSON.stringify({
    ...base,
    ...(e.esfuerzo === undefined ? {} : { effort: e.esfuerzo }),
    message: {
      id: `m-${e.t}`,
      role: "assistant",
      model: e.modelo ?? "claude-sonnet-5-5",
      content,
      stop_reason: e.stop ?? "tool_use",
    },
  });
}

/** Escribe la sesión orquestadora con los transcripts dados y ajusta los meta. */
function sesion(
  agentes: readonly (readonly string[])[],
  descripciones: readonly string[] = [],
  id = "orquestadora-1",
  modificado: Date = new Date(T0),
  principal: readonly string[] = [linea({ t: 0, tipo: "user", texto: "orquesta" })],
): void {
  const ruta = escribirSesionDeClaude(home, {
    root,
    id,
    lineas: principal,
    subagentes: agentes,
    modificado,
  });
  const directorio = join(ruta.replace(/\.jsonl$/, ""), "subagents");
  descripciones.forEach((descripcion, i) => {
    writeFileSync(
      join(directorio, `agent-a${i}.meta.json`),
      JSON.stringify({ agentType: "general-purpose", description: descripcion, toolUseId: `tu-${i}` }),
      "utf8",
    );
  });
}

const leerTodo = (extra: { ahora?: number; sesion?: string } = {}) =>
  leerAgentesDeCorrida(root, { home, ahora: T0 + 10_000, ...extra });

/** Solo los subagentes: la fila de la sesión principal se prueba aparte (SP-C1…SP-C8). */
const leer = (extra: { ahora?: number; sesion?: string; conTexto?: boolean } = {}) =>
  leerTodo(extra).filter((a) => !a.principal);

/** Un agente típico que lleva trabajo reciente y una herramienta ya resuelta. */
const activo = [
  linea({ t: 1, tipo: "user", texto: `Implementa ${TICKET} siguiendo el plan` }),
  linea({ t: 2, tipo: "assistant", modelo: "claude-opus-5-5", esfuerzo: "high", herramienta: { id: "h1", name: "Edit" } }),
  linea({ t: 3, tipo: "user", resultadoDe: "h1" }),
];

describe("lector de actividad de subagentes", () => {
  it("C1: devuelve una fila por cada agent-<id>.jsonl de la sesión orquestadora", () => {
    sesion([activo, activo, activo]);
    expect(leer().map((a) => a.agente)).toEqual(["a0", "a1", "a2"]);
  });

  it("C2: trae la descripción del meta.json", () => {
    sesion([activo, activo], ["Implementar A", "Implementar B"]);
    expect(leer().map((a) => a.descripcion)).toEqual(["Implementar A", "Implementar B"]);
  });

  it("C3: trae el ticket del primer mensaje, o null si no lo nombra", () => {
    sesion([activo, [linea({ t: 1, tipo: "user", texto: "haz algo sin ticket" }), ...activo.slice(1)]]);
    expect(leer().map((a) => a.ticket)).toEqual([TICKET, null]);
  });

  it("C4: trae modelo, esfuerzo, rama y carpeta del transcript", () => {
    sesion([activo]);
    expect(leer()[0]).toMatchObject({
      modelo: "claude-opus-5-5",
      esfuerzo: "high",
      rama: "valmen/ticket-a",
      carpeta: "/work/ticket-a",
    });
  });

  it("C4: el esfuerzo es null si el transcript no lo trae", () => {
    sesion([[activo[0] as string, linea({ t: 2, tipo: "assistant", stop: "end_turn", texto: "ok" })]]);
    expect(leer()[0]?.esfuerzo).toBeNull();
  });

  it("C5: trae el nombre de la última herramienta con su hora", () => {
    sesion([activo]);
    expect(leer()[0]).toMatchObject({ ultimaHerramienta: "Edit", ultimaHerramientaEn: iso(2) });
  });

  it("C6: una línea cortada al final no impide leer el resto", () => {
    sesion([[...activo, '{"type":"assistant","timestamp":"2026-10-08T12:00:0']]);
    const [fila] = leer();
    expect(fila).toMatchObject({ ticket: TICKET, ultimaHerramienta: "Edit", estado: "trabajando" });
  });

  it("C7: último evento reciente y sin permiso pendiente está trabajando", () => {
    sesion([activo]);
    expect(leer({ ahora: T0 + 30_000 })[0]?.estado).toBe("trabajando");
  });

  it("C8: más de 60 s sin eventos está esperando", () => {
    sesion([activo]);
    expect(leer({ ahora: T0 + 3 * 1000 + 61_000 })[0]?.estado).toBe("esperando");
  });

  it("C8: una herramienta sin resultado está esperando aunque sea reciente", () => {
    sesion([[activo[0] as string, linea({ t: 2, tipo: "assistant", herramienta: { id: "h9", name: "Bash" } })]]);
    expect(leer({ ahora: T0 + 5_000 })[0]?.estado).toBe("esperando");
  });

  it("C9: un último mensaje con end_turn está termino, incluso pasado el minuto", () => {
    sesion([[...activo, linea({ t: 4, tipo: "assistant", texto: "listo", stop: "end_turn" })]]);
    expect(leer({ ahora: T0 + 600_000 })[0]?.estado).toBe("termino");
  });

  it("elige la sesión con subagentes más reciente y ?sesion= la fuerza", () => {
    sesion([activo], ["vieja"], "vieja", new Date(T0 - 3600_000));
    sesion([activo], ["nueva"], "nueva", new Date(T0));
    expect(leer().map((a) => a.descripcion)).toEqual(["nueva"]);
    expect(leer({ sesion: "vieja" }).map((a) => a.descripcion)).toEqual(["vieja"]);
  });

  it("ignora sesiones con subagentes de más de 24 h", () => {
    sesion([activo], [], "antigua", new Date(T0 - 25 * 3600_000));
    expect(leer()).toEqual([]);
  });
});

describe("sesión principal", () => {
  const PRINCIPAL = [
    linea({ t: 0, tipo: "user", texto: `orquesta ${TICKET}` }),
    linea({ t: 1, tipo: "assistant", modelo: "claude-opus-5-5", esfuerzo: "high", herramienta: { id: "p1", name: "Agent" } }),
    linea({ t: 2, tipo: "user", resultadoDe: "p1" }),
  ];
  const ctx = (): ServerContext => ({
    root,
    credentialsFile: join(home, "credentials"),
    bindingsFile: join(home, "bindings-inexistente.yaml"),
    env: {},
    home,
  });

  it("SP-C1: la primera fila es la sesión principal, con principal true y ticket null", () => {
    sesion([activo, activo], [], "orquestadora-1", new Date(T0), PRINCIPAL);
    const [primera] = leerTodo();
    expect(primera).toMatchObject({ agente: "orquestadora-1", principal: true, ticket: null, descripcion: null });
  });

  it("SP-C2: las filas que siguen a la principal son los subagentes con principal false", () => {
    sesion([activo, activo], [], "orquestadora-1", new Date(T0), PRINCIPAL);
    const resto = leerTodo().slice(1);
    expect(resto.map((a) => a.agente)).toEqual(["a0", "a1"]);
    expect(resto.every((a) => a.principal === false)).toBe(true);
  });

  it("SP-C3: la principal trae su última herramienta y su hora en ISO", () => {
    sesion([activo], [], "orquestadora-1", new Date(T0), PRINCIPAL);
    expect(leerTodo()[0]).toMatchObject({
      ultimaHerramienta: "Agent",
      ultimaHerramientaEn: iso(1),
      modelo: "claude-opus-5-5",
      ticketEstado: null,
      faseConfirmada: null,
      faseInferida: null,
    });
  });

  it("SP-C4: la principal está termino si su último mensaje cerró con end_turn", () => {
    sesion([activo], [], "orquestadora-1", new Date(T0), [
      ...PRINCIPAL,
      linea({ t: 3, tipo: "assistant", texto: "listo", stop: "end_turn" }),
    ]);
    expect(leerTodo({ ahora: T0 + 600_000 })[0]?.estado).toBe("termino");
  });

  it("SP-C5: la principal está esperando con herramienta sin resultado o más de 60 s, y trabajando si no", () => {
    sesion([activo], [], "orquestadora-1", new Date(T0), PRINCIPAL);
    expect(leerTodo({ ahora: T0 + 5_000 })[0]?.estado).toBe("trabajando");
    expect(leerTodo({ ahora: T0 + 2_000 + 61_000 })[0]?.estado).toBe("esperando");
    sesion([activo], [], "orquestadora-1", new Date(T0), [
      PRINCIPAL[0] as string,
      linea({ t: 1, tipo: "assistant", herramienta: { id: "p9", name: "Bash" } }),
    ]);
    expect(leerTodo({ ahora: T0 + 5_000 })[0]?.estado).toBe("esperando");
  });

  it("SP-C6: una sesión reciente sin carpeta subagents produce la lista vacía", () => {
    escribirSesionDeClaude(home, { root, id: "sola", lineas: PRINCIPAL, modificado: new Date(T0) });
    expect(leerTodo()).toEqual([]);
  });

  it("SP-C7: el endpoint responde 200 con la principal en primera posición", async () => {
    sesion([activo], [], "orquestadora-1", new Date(T0), PRINCIPAL);
    const respuesta = await handleApi("GET", "/api/corrida/agentes", {}, ctx());
    expect(respuesta.status).toBe(200);
    const agentes = (respuesta.body as { agentes: { agente: string; principal: boolean }[] }).agentes;
    expect(agentes[0]).toMatchObject({ agente: "orquestadora-1", principal: true });
    expect(agentes[1]).toMatchObject({ agente: "a0", principal: false });
  });

  it("SP-C8: la respuesta con la principal no contiene texto de prompts, entradas ni resultados", async () => {
    sesion([activo], [], "orquestadora-1", new Date(T0), [
      linea({ t: 0, tipo: "user", texto: `Prompt privado ${SECRETO}` }),
      linea({ t: 1, tipo: "assistant", texto: SECRETO, herramienta: { id: "p1", name: "Bash" } }),
      linea({ t: 2, tipo: "user", resultadoDe: "p1" }),
    ]);
    const respuesta = await handleApi("GET", "/api/corrida/agentes", {}, ctx());
    const texto = JSON.stringify(respuesta.body);
    expect(texto).not.toContain(SECRETO);
    expect(texto).not.toContain("Prompt privado");
    expect(Object.keys((respuesta.body as { agentes: object[] }).agentes[0] ?? {}).sort()).toEqual(
      [
        "agente", "carpeta", "descripcion", "esfuerzo", "estado", "faseConfirmada", "faseInferida",
        "modelo", "pregunta", "principal", "rama", "ticket", "ticketEstado", "ultimaHerramienta", "ultimaHerramientaEn",
      ].sort(),
    );
  });
});

describe("unión con el registro", () => {
  function contexto(): { context: ServerContext; project: ReturnType<typeof resolveAuthorizedProject> } {
    writeFileSync(join(root, ".valmen", "config.yaml"), "project-id: prueba-agentes\n", "utf8");
    mkdirSync(join(home, ".valmen"), { recursive: true });
    writeFileSync(
      join(home, ".valmen", "bindings.local.yaml"),
      `schema-version: 1\nmachine-id: qa\nprojects:\n  prueba-agentes:\n    root: ${root}\n`,
      "utf8",
    );
    const project = resolveAuthorizedProject({ projectId: "prueba-agentes", home });
    return {
      project,
      context: {
        root,
        paths: project.paths,
        authorizedProject: project,
        bindingsFile: join(home, ".valmen", "bindings.local.yaml"),
        credentialsFile: join(home, "credentials"),
        env: {},
        home,
      },
    };
  }

  it("C11: la fila lleva el estado real del ticket y null si no existe en el registro", () => {
    const { context } = contexto();
    writeFixtureTicket(root, { id: TICKET, workflowStatus: "in_progress" });
    sesion([activo, [linea({ t: 1, tipo: "user", texto: "Trabaja FEATURE-SERVER-FANTASMA-20261008" }), ...activo.slice(1)]]);
    const filas = leerAgentesDeCorrida(root, { home, ahora: T0 + 10_000, paths: context.paths! }).filter(
      (a) => !a.principal,
    );
    expect(filas.map((a) => [a.ticket, a.ticketEstado])).toEqual([
      [TICKET, "in_progress"],
      ["FEATURE-SERVER-FANTASMA-20261008", null],
    ]);
  });

  it("C12: la fase confirmada sale del registro y la inferida solo aparece sin ella", () => {
    const { context, project } = contexto();
    writeFixtureTicket(root, { id: TICKET, workflowStatus: "in_progress" });
    sesion([activo]);
    const opciones = { home, ahora: T0 + 10_000, paths: context.paths!, project };

    const sin = leerAgentesDeCorrida(root, opciones).filter((a) => !a.principal)[0];
    expect(sin).toMatchObject({ faseConfirmada: null, faseInferida: "implementando" });

    recordExecutionActivity(project, {
      eventId: "act-1",
      identity: createExecutionIdentity({ projectId: "prueba-agentes", ticketId: TICKET, executionId: "exec-1" }),
      attemptId: "attempt-1",
      state: "waiting",
      source: "cli",
      occurredAt: iso(5),
    });
    expect(leerAgentesDeCorrida(root, opciones).filter((a) => !a.principal)[0]).toMatchObject({
      faseConfirmada: "waiting",
      faseInferida: null,
    });
  });

  it("sin proyecto autorizado la fase confirmada es null y no falla", () => {
    sesion([activo]);
    const [fila] = leer();
    expect(fila).toMatchObject({ faseConfirmada: null, ticketEstado: null });
  });
});

describe("GET /api/corrida/agentes", () => {
  const ctx = (): ServerContext => ({
    root,
    credentialsFile: join(home, "credentials"),
    bindingsFile: join(home, "bindings-inexistente.yaml"),
    env: {},
    home,
  });

  it("C13: responde 200 con la lista de agentes", async () => {
    sesion([activo], ["Implementar A"]);
    const respuesta = await handleApi("GET", "/api/corrida/agentes", {}, ctx());
    expect(respuesta.status).toBe(200);
    const cuerpo = respuesta.body as { agentes: { agente: string; estado: string; principal: boolean }[] };
    const subagentes = cuerpo.agentes.filter((a) => !a.principal);
    expect(subagentes).toHaveLength(1);
    expect(subagentes[0]).toMatchObject({ agente: "a0", ticket: TICKET });
  });

  it("C13: responde 200 con lista vacía si no hay sesión orquestadora", async () => {
    const respuesta = await handleApi("GET", "/api/corrida/agentes", {}, ctx());
    expect(respuesta).toMatchObject({ status: 200, body: { agentes: [] } });
  });

  it("C14: la respuesta no contiene texto de prompts, entradas ni resultados", async () => {
    sesion([[...activo, linea({ t: 4, tipo: "assistant", texto: SECRETO, herramienta: { id: "h2", name: "Bash" } })]]);
    const respuesta = await handleApi("GET", "/api/corrida/agentes", {}, ctx());
    const texto = JSON.stringify(respuesta.body);
    expect(texto).not.toContain(SECRETO);
    expect(texto).not.toContain("Implementa");
    expect(Object.keys((respuesta.body as { agentes: object[] }).agentes[0] ?? {}).sort()).toEqual(
      [
        "agente", "carpeta", "descripcion", "esfuerzo", "estado", "faseConfirmada", "faseInferida",
        "modelo", "pregunta", "principal", "rama", "ticket", "ticketEstado", "ultimaHerramienta", "ultimaHerramientaEn",
      ].sort(),
    );
  });

  it("C15: un parámetro sesion con separadores de ruta se rechaza con 400", async () => {
    sesion([activo]);
    for (const malo of ["../x", "a/b", "..", "a\\b", "a%2Fb"]) {
      const r = await handleApi("GET", "/api/corrida/agentes", {}, ctx(), new URLSearchParams({ sesion: malo }));
      expect(r.status, malo).toBe(400);
    }
    const bueno = await handleApi("GET", "/api/corrida/agentes", {}, ctx(), new URLSearchParams({ sesion: "orquestadora-1" }));
    expect(bueno.status).toBe(200);
  });
});

describe("pregunta pendiente", () => {
  const ctx = (): ServerContext => ({
    root,
    credentialsFile: join(home, "credentials"),
    bindingsFile: join(home, "bindings-inexistente.yaml"),
    env: {},
    home,
  });
  const inicio = linea({ t: 1, tipo: "user", texto: `Implementa ${TICKET}` });
  const pregunta = (id = "q1", t = 2): string =>
    linea({ t, tipo: "assistant", herramienta: { id, name: "AskUserQuestion" } });
  const una = (_: readonly string[]) => leer()[0];

  it("PP-C1: una AskUserQuestion sin resultado declara desde y respondidaEn null", () => {
    sesion([[inicio, pregunta()]]);
    expect(una([])?.pregunta).toEqual({ desde: iso(2), respondidaEn: null });
  });

  it("PP-C2: una AskUserQuestion sin resultado deja la fila esperando", () => {
    sesion([[inicio, pregunta()]]);
    expect(una([])?.estado).toBe("esperando");
  });

  it("PP-C3: respondida hace 20 s declara respondidaEn con la hora del resultado", () => {
    sesion([[inicio, pregunta(), linea({ t: 3, tipo: "user", resultadoDe: "q1" })]]);
    const fila = leer({ ahora: T0 + 23_000 })[0];
    expect(fila?.pregunta).toEqual({ desde: iso(2), respondidaEn: iso(3) });
  });

  it("PP-C4: respondida hace 20 s deja la fila trabajando", () => {
    sesion([[inicio, pregunta(), linea({ t: 3, tipo: "user", resultadoDe: "q1" })]]);
    expect(leer({ ahora: T0 + 23_000 })[0]?.estado).toBe("trabajando");
  });

  it("PP-C5: respondida hace más de 60 s la pregunta es null", () => {
    sesion([[inicio, pregunta(), linea({ t: 3, tipo: "user", resultadoDe: "q1" })]]);
    expect(leer({ ahora: T0 + 3_000 + 61_000 })[0]?.pregunta).toBeNull();
  });

  it("PP-C6: un Bash abierto sin pregunta deja pregunta null", () => {
    sesion([[inicio, linea({ t: 2, tipo: "assistant", herramienta: { id: "b1", name: "Bash" } })]]);
    expect(leer()[0]?.pregunta).toBeNull();
  });

  it("PP-C7: un Bash abierto sin resultado sigue esperando", () => {
    sesion([[inicio, linea({ t: 2, tipo: "assistant", herramienta: { id: "b1", name: "Bash" } })]]);
    expect(leer()[0]?.estado).toBe("esperando");
  });

  it("PP-C8: la sesión principal declara su AskUserQuestion abierta", () => {
    sesion([activo], [], "orquestadora-1", new Date(T0), [
      linea({ t: 0, tipo: "user", texto: "orquesta" }),
      pregunta("p1", 1),
    ]);
    expect(leerTodo()[0]).toMatchObject({ principal: true, pregunta: { desde: iso(1), respondidaEn: null } });
  });

  it("PP-C9: un tool_result con is_error true cuenta como respondida", () => {
    sesion([[inicio, pregunta(), linea({ t: 3, tipo: "user", resultadoDe: "q1", error: true })]]);
    expect(leer({ ahora: T0 + 10_000 })[0]?.pregunta).toEqual({ desde: iso(2), respondidaEn: iso(3) });
  });

  it("PP-C10: la respuesta del endpoint no contiene el header, el label ni la description de la entrada de la pregunta", async () => {
    sesion([[inicio, linea({ t: 2, tipo: "assistant", herramienta: { id: "q1", name: "AskUserQuestion" }, preguntas: ["¿Seguimos?"] })]]);
    const r = await handleApi("GET", "/api/corrida/agentes", {}, ctx());
    const cuerpo = JSON.stringify(r.body);
    expect(cuerpo).toContain("¿Seguimos?");
    for (const fuera of [FUERA_HEADER, FUERA_LABEL, FUERA_DESCRIPCION, SECRETO]) expect(cuerpo).not.toContain(fuera);
  });

  it("PP-C11: la respuesta del endpoint no contiene el content del resultado de la pregunta", async () => {
    sesion([[
      inicio,
      linea({ t: 2, tipo: "assistant", herramienta: { id: "q1", name: "AskUserQuestion" }, preguntas: ["¿Seguimos?"] }),
      linea({ t: 3, tipo: "user", resultadoDe: "q1", contenido: FUERA_CONTENT, respuestas: { "¿Seguimos?": "Sí" } }),
    ]]);
    const r = await handleApi("GET", "/api/corrida/agentes", {}, ctx(), undefined);
    const cuerpo = JSON.stringify(r.body);
    expect(cuerpo).not.toContain(FUERA_CONTENT);
  });

  it("PP-C12: en loopback las claves de pregunta son exactamente desde, respondidaEn, texto y respuesta", async () => {
    sesion([[inicio, linea({ t: 2, tipo: "assistant", herramienta: { id: "q1", name: "AskUserQuestion" }, preguntas: ["¿Seguimos?"] })]]);
    const r = await handleApi("GET", "/api/corrida/agentes", {}, ctx());
    const fila = (r.body as { agentes: { principal: boolean; pregunta: object | null }[] }).agentes.find((f) => !f.principal);
    expect(Object.keys(fila?.pregunta ?? {}).sort()).toEqual(["desde", "respondidaEn", "respuesta", "texto"]);
  });

  it("PP-extra: con varias preguntas manda la abierta más reciente; sin abiertas, la última respondida", () => {
    sesion([[
      inicio,
      pregunta("q1", 2),
      linea({ t: 3, tipo: "user", resultadoDe: "q1" }),
      pregunta("q2", 4),
    ]]);
    expect(leer()[0]?.pregunta).toEqual({ desde: iso(4), respondidaEn: null });
    sesion([[
      inicio,
      pregunta("q1", 2),
      linea({ t: 3, tipo: "user", resultadoDe: "q1" }),
      pregunta("q2", 4),
      linea({ t: 5, tipo: "user", resultadoDe: "q2" }),
    ]]);
    expect(leer({ ahora: T0 + 10_000 })[0]?.pregunta).toEqual({ desde: iso(4), respondidaEn: iso(5) });
  });
});

describe("texto de pregunta y respuesta (R-DAT-004)", () => {
  const ctx = (): ServerContext => ({
    root,
    credentialsFile: join(home, "credentials"),
    bindingsFile: join(home, "bindings-inexistente.yaml"),
    env: {},
    home,
  });
  const ctxAbierto = (): ServerContext => ({ ...ctx(), writeToken: "token-de-prueba" });
  // El endpoint usa el reloj real: se fija la fecha para que la pregunta caiga dentro de la ventana.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0 + 10_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const inicio = linea({ t: 1, tipo: "user", texto: `Implementa ${TICKET}` });
  const ask = (preguntas: readonly string[], id = "q1", t = 2): string =>
    linea({ t, tipo: "assistant", herramienta: { id, name: "AskUserQuestion" }, preguntas });
  const resp = (respuestas: Record<string, string>, extra: Partial<Ev> = {}): string =>
    linea({ t: 3, tipo: "user", resultadoDe: "q1", respuestas, ...extra });
  const pregunta = async (c: ServerContext = ctx()) => {
    const r = await handleApi("GET", "/api/corrida/agentes", {}, c);
    const filas = (r.body as { agentes: { principal: boolean; pregunta: Record<string, unknown> | null }[] }).agentes;
    return filas.find((fila) => !fila.principal)?.pregunta ?? null;
  };
  const conTexto = (extra: { ahora?: number } = {}) => leer({ conTexto: true, ...extra })[0]?.pregunta;

  it("TP-C01: la pregunta abierta lleva texto igual a la question", async () => {
    sesion([[inicio, ask(["¿Usamos la opción B?"])]]);
    expect((await pregunta())?.["texto"]).toBe("¿Usamos la opción B?");
  });

  it("TP-C02: la pregunta abierta lleva respuesta null", async () => {
    sesion([[inicio, ask(["¿Usamos la opción B?"])]]);
    expect((await pregunta())?.["respuesta"]).toBeNull();
  });

  it("TP-C03: respondida hace 20 s, respuesta es el valor de answers", () => {
    sesion([[inicio, ask(["¿Opción?"]), resp({ "¿Opción?": "B" })]]);
    expect(conTexto({ ahora: T0 + 23_000 })?.respuesta).toBe("B");
  });

  it("TP-C04: con dos questions, texto es la primera, un salto de línea y la segunda", () => {
    sesion([[inicio, ask(["Primera", "Segunda"])]]);
    expect(conTexto()?.texto).toBe("Primera\nSegunda");
  });

  it("TP-C05: con dos respuestas, se unen con salto de línea en el orden de las questions", () => {
    sesion([[inicio, ask(["Primera", "Segunda"]), resp({ Segunda: "dos", Primera: "uno" })]]);
    expect(conTexto({ ahora: T0 + 23_000 })?.respuesta).toBe("uno\ndos");
  });

  it("TP-C06: la sesión principal con una AskUserQuestion abierta lleva texto", () => {
    sesion([activo], [], "orquestadora-1", new Date(T0), [linea({ t: 0, tipo: "user", texto: "orquesta" }), ask(["¿Principal?"], "p1", 1)]);
    const fila = leerAgentesDeCorrida(root, { home, ahora: T0 + 10_000, conTexto: true })[0];
    expect(fila).toMatchObject({ principal: true, pregunta: { texto: "¿Principal?" } });
  });

  it("TP-C07: una question de 600 caracteres produce un texto de 500", () => {
    sesion([[inicio, ask(["a".repeat(600)])]]);
    expect(conTexto()?.texto).toHaveLength(500);
  });

  it("TP-C08: un texto recortado termina en puntos suspensivos y uno de 500 no se toca", () => {
    sesion([[inicio, ask(["a".repeat(600)])]]);
    expect(conTexto()?.texto?.endsWith("…")).toBe(true);
    expect(recortar("b".repeat(500))).toBe("b".repeat(500));
    expect(recortar("b".repeat(501))).toBe(`${"b".repeat(499)}…`);
  });

  it("TP-C09: una respuesta de 600 caracteres produce una respuesta de 500", () => {
    sesion([[inicio, ask(["¿X?"]), resp({ "¿X?": "r".repeat(600) })]]);
    expect(conTexto({ ahora: T0 + 23_000 })?.respuesta).toHaveLength(500);
  });

  it("TP-C10: un tool_result con is_error deja respuesta null", () => {
    sesion([[inicio, ask(["¿X?"]), resp({ "¿X?": "no" }, { error: true })]]);
    expect(conTexto({ ahora: T0 + 23_000 })?.respuesta).toBeNull();
  });

  it("TP-C11: un resultado sin answers deja respuesta null", () => {
    sesion([[inicio, ask(["¿X?"]), linea({ t: 3, tipo: "user", resultadoDe: "q1" })]]);
    expect(conTexto({ ahora: T0 + 23_000 })?.respuesta).toBeNull();
  });

  it("TP-C12: con writeToken las claves de pregunta son exactamente desde y respondidaEn", async () => {
    sesion([[inicio, ask(["¿X?"])]]);
    expect(Object.keys((await pregunta(ctxAbierto())) ?? {}).sort()).toEqual(["desde", "respondidaEn"]);
  });

  it("TP-C13: con writeToken la respuesta serializada no contiene la question ni la respuesta", async () => {
    sesion([[inicio, ask(["TP-QUESTION"]), resp({ "TP-QUESTION": "TP-ANSWER" })]]);
    const r = await handleApi("GET", "/api/corrida/agentes", {}, ctxAbierto());
    const cuerpo = JSON.stringify(r.body);
    expect(cuerpo).not.toContain("TP-QUESTION");
    expect(cuerpo).not.toContain("TP-ANSWER");
  });

  it("TP-C14: sin conTexto la pregunta tiene exactamente desde y respondidaEn", () => {
    sesion([[inicio, ask(["TP-QUESTION"])]]);
    const p = leer()[0]?.pregunta;
    expect(Object.keys(p ?? {}).sort()).toEqual(["desde", "respondidaEn"]);
    expect(JSON.stringify(p)).not.toContain("TP-QUESTION");
  });

  /** Una sesión con la lista blanca ampliada activa: pregunta respondida más los centinelas. */
  const conCentinelas = (extra: readonly string[], inicioTexto = `Implementa ${TICKET}`): void => {
    sesion([[
      linea({ t: 1, tipo: "user", texto: inicioTexto }),
      ask(["¿Seguimos?"]),
      resp({ "¿Seguimos?": "Sí" }),
      ...extra,
    ]]);
  };

  it("TP-C15: el primer mensaje del usuario no aparece en la respuesta", async () => {
    conCentinelas([], `Implementa ${TICKET} TP-PROMPT`);
    const r = await handleApi("GET", "/api/corrida/agentes", {}, ctx());
    const cuerpo = JSON.stringify(r.body);
    expect(cuerpo).toContain("¿Seguimos?");
    expect(cuerpo).not.toContain("TP-PROMPT");
  });

  it("TP-C16: la entrada de otra herramienta no aparece en la respuesta", async () => {
    conCentinelas([linea({ t: 4, tipo: "assistant", herramienta: { id: "b1", name: "Bash" }, comando: "TP-BASH-IN" })]);
    const r = await handleApi("GET", "/api/corrida/agentes", {}, ctx());
    const cuerpo = JSON.stringify(r.body);
    expect(cuerpo).toContain("¿Seguimos?");
    expect(cuerpo).not.toContain("TP-BASH-IN");
  });

  it("TP-C17: el resultado de otra herramienta no aparece en la respuesta", async () => {
    conCentinelas([
      linea({ t: 4, tipo: "assistant", herramienta: { id: "b1", name: "Bash" } }),
      linea({ t: 5, tipo: "user", resultadoDe: "b1", contenido: "TP-BASH-OUT" }),
    ]);
    const r = await handleApi("GET", "/api/corrida/agentes", {}, ctx());
    const cuerpo = JSON.stringify(r.body);
    expect(cuerpo).toContain("¿Seguimos?");
    expect(cuerpo).not.toContain("TP-BASH-OUT");
  });

  it("TP-C18: respondida en T0 + 3 s con el reloj en T0 + 64 s la pregunta es null", async () => {
    sesion([[inicio, ask(["¿X?"]), resp({ "¿X?": "B" })]]);
    const lectura = leerAgentesDeCorrida(root, { home, ahora: T0 + 64_000, conTexto: true });
    expect(lectura[0]?.pregunta).toBeNull();
  });
});

it("la carpeta del proyecto usa el mismo nombre que Claude Code", () => {
  expect(carpetaDeClaude("/a/b.c")).toBe("-a-b-c");
});
