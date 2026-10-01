/**
 * El endpoint de fases de un ticket, contra el despachador real.
 *
 * Lo que se afirma acá es el contrato de `GET /api/ticket/fases`: que el server
 * derive la secuencia de fases del bloque `Eventos` con `fasesPorTicket` del
 * engine (`FEATURE-CORE-DERIVAR-FASES-20260929`), que un ticket sin transiciones
 * aparezca con su fase única desde el `at` de la creación, que la falta de base
 * de contabilidad se declare con `timeline.disponible: false` —y no se disfrace
 * con una lista vacía— y que un ticket inexistente responda 404 con el recurso,
 * no con «Ruta no encontrada». También que las sesiones se agrupen por el tramo
 * de cada fase en `sesionesPorFase` —alineada con `fases` y como una vista, sin
 * recortar `timeline.sessions`— y que sin base la estructura vacía por fase siga
 * existiendo.
 *
 * Se construye un registro de prueba con `writeFixtureTicket` y se le reescribe
 * el bloque `Eventos` con la forma real del motor (`action: "ticket-transition"`,
 * `details: "Workflow: <de> -> <a>."`), que es la misma que declaran
 * `tests/etapas.test.ts` y `tests/derivacion-fases.test.ts`: inventar la forma
 * dejaría la suite en verde con el endpoint devolviendo una sola fase en un
 * ticket real.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ServerContext, handleApi } from "../packages/server/src/server.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

/** La acción con la que el motor escribe una transición de ticket. */
const ACCION_TRANSICION = "ticket-transition";

/** Una fase, con la forma que devuelve el endpoint. */
interface Fase {
  readonly estado: string;
  readonly inicio: string | null;
  readonly fin: string | null;
  readonly ms: number | null;
  readonly enCurso: boolean;
  readonly motivo: string | null;
}

/** El campo complementario del board, separado de la línea del registro. */
interface FasesDeBoard {
  readonly disponible: boolean;
  readonly board: string;
  readonly tarjetas: string[];
  readonly fases: Fase[];
  readonly motivo: string | null;
}

/** Una sesión de la línea de tiempo, con lo que estas pruebas afirman de ella. */
interface Sesion {
  readonly id: string;
  readonly startedAt: number;
}

/** Un evento del registro, con la forma real del motor. */
function evento(
  id: string,
  action: string,
  details: string,
  at: string | null,
): Record<string, unknown> {
  return {
    kind: "ticket-event",
    id,
    date: at === null ? "2026-09-29" : at.slice(0, 10),
    action,
    actor: "cli",
    details,
    ...(at === null ? {} : { at }),
  };
}

/** La transición de un estado a otro. */
function transicion(de: string, a: string, at: string | null): Record<string, unknown> {
  return evento(`EVENT-${de}`, ACCION_TRANSICION, `Workflow: ${de} -> ${a}.`, at);
}

/** El evento de creación, que abre la serie en `intake`. */
function creado(at: string | null): Record<string, unknown> {
  return evento("EVENT-000", "created", "Ticket creado sin sobrescribir historial.", at);
}

let lab: string;
let homeOriginal: string | undefined;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-fases-api-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });

  // La línea de tiempo se lee del home de la persona —no del `directory` del
  // proyecto—, así que la prueba lo aísla: un home real con opencode haría que
  // `disponible` dependiera de la máquina que corre los tests.
  homeOriginal = process.env["HOME"];
  process.env["HOME"] = lab;
});

afterEach(() => {
  if (homeOriginal === undefined) delete process.env["HOME"];
  else process.env["HOME"] = homeOriginal;
  rmSync(lab, { recursive: true, force: true });
});

/** El contexto del laboratorio. */
function contexto(): ServerContext {
  return {
    root: lab,
    paths: { root: lab, ticketsDir: "tickets" },
    credentialsFile: join(lab, ".valmen", ".credentials.yaml"),
    env: {},
  };
}

/**
 * Escribe un ticket de prueba válido y reemplaza su bloque `Eventos`.
 *
 * `writeFixtureTicket` no acepta eventos, y el caso que hay que probar es
 * justamente la derivación sobre ellos; reemplazar el bloque JSON conserva el
 * resto de la estructura canónica que el parser exige.
 */
function escribirTicket(
  id: string,
  eventos: readonly Record<string, unknown>[],
  workflowStatus = "planned",
): void {
  writeFixtureTicket(lab, { id, workflowStatus });
  const ruta = join(lab, "tickets", id.slice(-8, -4), id, "ticket.md");
  const texto = readFileSync(ruta, "utf8");
  const bloque = `## Eventos\n\n\`\`\`json\n${JSON.stringify(eventos, null, 2)}\n\`\`\`\n`;
  writeFileSync(ruta, texto.replace(/## Eventos\n\n```json\n[\s\S]*?\n```\n/, bloque), "utf8");
}

/** Llama al endpoint para un ticket del laboratorio. */
async function pedirFases(
  ticket: string,
  board?: string,
): Promise<{ status: number; body: unknown }> {
  return await handleApi(
    "GET",
    "/api/ticket/fases",
    {},
    contexto(),
    new URLSearchParams({
      ticket,
      directory: lab,
      ...(board === undefined ? {} : { board }),
    }),
  );
}

const requerir = createRequire(import.meta.url);

/** El módulo del núcleo, o `null` si esta versión de Node no lo trae. */
function sqlite(): { DatabaseSync: new (ruta: string) => SqliteDb } | null {
  try {
    return requerir("node:sqlite") as { DatabaseSync: new (ruta: string) => SqliteDb };
  } catch {
    return null;
  }
}

/** Lo mínimo de la interfaz de la base que usan estas pruebas. */
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): { run(...valores: unknown[]): void };
  close(): void;
}

/**
 * Escribe una base falsa de opencode v2 en el HOME aislado del `beforeEach`.
 *
 * Es la técnica de `escribirBaseV2` de `tests/timeline.test.ts` reducida a lo que
 * este caso necesita: la sesión en `session_v2` con su `time_created`, de donde
 * sale el `startedAt`. El título lleva el identificador del ticket porque, sin
 * llamadas al registro, el lector v2 atribuye la sesión por mención del título o
 * del primer mensaje del usuario. El `directory` es el laboratorio, que es el que
 * pide el endpoint.
 */
function escribirBaseV2(
  sesiones: readonly {
    readonly id: string;
    readonly title: string;
    readonly timeCreated: number;
  }[],
): void {
  const modulo = sqlite();
  if (modulo === null) return;

  mkdirSync(join(lab, ".local", "share", "opencode"), { recursive: true });
  const db = new modulo.DatabaseSync(join(lab, ".local", "share", "opencode", "opencode.db"));

  db.exec(`
    CREATE TABLE session_v2 (
      id text PRIMARY KEY, title text, cost real, tokens_input integer,
      tokens_output integer, tokens_reasoning integer, tokens_cache_read integer,
      agent text, model text, directory text, time_created integer
    );
    CREATE TABLE session_message (
      id text PRIMARY KEY, session_id text, type text, data text, time_created integer
    );
  `);

  for (const sesion of sesiones) {
    db.prepare("INSERT INTO session_v2 VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
      sesion.id,
      sesion.title,
      0,
      0,
      0,
      0,
      0,
      "build",
      "deepseek-v4.1-flash",
      lab,
      sesion.timeCreated,
    );
  }
  db.close();
}

const BOARD = "valmen-harness";
const TICKET_BOARD = "FEATURE-PRUEBA-BOARD-20260929";

/** El board con nombre y el default viven en rutas distintas del HOME aislado. */
function rutaBoard(board = BOARD): string {
  return board === "default"
    ? join(lab, ".hermes", "kanban.db")
    : join(lab, ".hermes", "kanban", "boards", board, "kanban.db");
}

/** Planta tarjetas y task_events reales, sin reemplazar el lector por un doble. */
function plantarBoard(
  tarjetas: readonly { id: string; title: string; body: string; created_at: number }[],
  eventos: readonly {
    task_id: string;
    kind: string;
    payload: string | null;
    created_at: number;
  }[],
  board = BOARD,
): void {
  const modulo = sqlite();
  if (modulo === null) throw new Error("node:sqlite no está disponible.");
  const ruta = rutaBoard(board);
  mkdirSync(dirname(ruta), { recursive: true });
  const db = new modulo.DatabaseSync(ruta);
  try {
    db.exec(`
      CREATE TABLE tasks (id text primary key, title text, body text, created_at integer);
      CREATE TABLE task_events (
        id integer primary key autoincrement, task_id text, run_id integer,
        kind text, payload text, created_at integer
      );
    `);
    for (const tarjeta of tarjetas) {
      db.prepare("INSERT INTO tasks VALUES (?,?,?,?)").run(
        tarjeta.id,
        tarjeta.title,
        tarjeta.body,
        tarjeta.created_at,
      );
    }
    for (const evento of eventos) {
      db.prepare(
        "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?,?,?,?,?)",
      ).run(evento.task_id, null, evento.kind, evento.payload, evento.created_at);
    }
  } finally {
    db.close();
  }
}

/** Una jornada creada, tomada, bloqueada y enviada a revisión, en segundos epoch. */
function eventosDeBoard(taskId = "t_primera", desde = "2026-09-29T07:00:00.000Z") {
  const inicio = Date.parse(desde) / 1000;
  return [
    { kind: "created", payload: JSON.stringify({ status: "ready" }) },
    { kind: "claimed", payload: null },
    {
      kind: "blocked",
      payload: JSON.stringify({ reason: "El PO tiene que decidir.", kind: "needs_input" }),
    },
    { kind: "review_requested", payload: null },
  ].map((evento, i) => ({ ...evento, task_id: taskId, created_at: inicio + i * 3600 }));
}

/** El contenido de ambos artefactos tiene que quedar byte por byte intacto. */
function hashArchivo(ruta: string): string {
  return createHash("sha256").update(readFileSync(ruta)).digest("hex");
}

describe("GET /api/ticket/fases", () => {
  it("(a) deriva las fases de las transiciones del bloque Eventos", async () => {
    const id = "FEATURE-PRUEBA-FASES-20260929";
    escribirTicket(
      id,
      [
        creado("2026-09-29T07:00:00.000Z"),
        transicion("intake", "analyzed", "2026-09-29T08:00:00.000Z"),
        transicion("analyzed", "planned", "2026-09-29T08:30:00.000Z"),
        transicion("planned", "in_progress", "2026-09-29T09:00:00.000Z"),
      ],
      "in_progress",
    );

    const r = await pedirFases(id);
    expect(r.status).toBe(200);
    const cuerpo = r.body as { ticket: string; fases: Fase[] };

    expect(cuerpo.ticket).toBe(id);
    expect(cuerpo.fases.map((fase) => fase.estado)).toEqual([
      "intake",
      "analyzed",
      "planned",
      "in_progress",
    ]);

    // Cada tramo cerrado toma su fin del evento siguiente y su duración de la
    // resta de los dos `at`.
    const [intake, analyzed, planned, enCurso] = cuerpo.fases;
    expect(intake?.inicio).toBe("2026-09-29T07:00:00.000Z");
    expect(intake?.fin).toBe("2026-09-29T08:00:00.000Z");
    expect(intake?.ms).toBe(60 * 60 * 1000);
    expect(analyzed?.inicio).toBe("2026-09-29T08:00:00.000Z");
    expect(analyzed?.fin).toBe("2026-09-29T08:30:00.000Z");
    expect(analyzed?.ms).toBe(30 * 60 * 1000);
    expect(planned?.inicio).toBe("2026-09-29T08:30:00.000Z");
    expect(planned?.fin).toBe("2026-09-29T09:00:00.000Z");
    expect(planned?.ms).toBe(30 * 60 * 1000);

    // La última corre ahora.
    expect(enCurso?.inicio).toBe("2026-09-29T09:00:00.000Z");
    expect(enCurso?.fin).toBeNull();
    expect(enCurso?.ms).toBeNull();
    expect(enCurso?.enCurso).toBe(true);
    for (const fase of cuerpo.fases.slice(0, -1)) {
      expect(fase.enCurso).toBe(false);
    }
  });

  it("(b) un ticket sin transiciones responde su fase única desde el at de la creación", async () => {
    const id = "FEATURE-PRUEBA-SIN-TRANSICIONES-20260929";
    escribirTicket(id, [creado("2026-09-29T06:15:00.000Z")], "intake");

    const r = await pedirFases(id);
    expect(r.status).toBe(200);
    const cuerpo = r.body as { fases: Fase[] };

    expect(cuerpo.fases).toHaveLength(1);
    const [intake] = cuerpo.fases;
    expect(intake?.estado).toBe("intake");
    expect(intake?.inicio).toBe("2026-09-29T06:15:00.000Z");
    expect(intake?.fin).toBeNull();
    expect(intake?.ms).toBeNull();
    expect(intake?.enCurso).toBe(true);
  });

  it("(c) sin base de contabilidad declara timeline.disponible en false", async () => {
    const id = "FEATURE-PRUEBA-SIN-CONTABILIDAD-20260929";
    escribirTicket(id, [creado("2026-09-29T06:15:00.000Z")], "intake");

    const r = await pedirFases(id);
    expect(r.status).toBe(200);
    const cuerpo = r.body as {
      fases: Fase[];
      timeline: { disponible: boolean };
      sesionesPorFase: unknown[][];
    };

    // `false` es distinto de una línea vacía: la pantalla tiene que poder decir
    // «no hay datos» en vez de mostrar un cero que se lee como «no costó nada».
    expect(cuerpo.timeline.disponible).toBe(false);

    // La falta de datos es una estructura vacía —un tramo por fase—, no una
    // lista recortada que oculte las fases que sí existen.
    expect(cuerpo.sesionesPorFase).toHaveLength(cuerpo.fases.length);
    expect(cuerpo.sesionesPorFase).toEqual(cuerpo.fases.map(() => []));
  });

  it("(d) un ticket inexistente responde 404 con el identificador", async () => {
    const r = await pedirFases("FEATURE-PRUEBA-NO-EXISTE-20260101");

    expect(r.status).toBe(404);
    expect((r.body as { error: string }).error).toContain("NO-EXISTE");
  });

  it("(g) sin base del board declara su ausencia sin alterar el contrato existente", async () => {
    escribirTicket(TICKET_BOARD, [creado("2026-09-29T06:15:00.000Z")], "intake");
    const anterior = await pedirFases(TICKET_BOARD);
    const r = await pedirFases(TICKET_BOARD, BOARD);
    expect(r.status).toBe(200);
    const cuerpo = r.body as {
      kanban: FasesDeBoard;
      fases: Fase[];
      timeline: unknown;
      sesionesPorFase: unknown[][];
    };
    expect(cuerpo.kanban).toMatchObject({
      disponible: false,
      board: BOARD,
      tarjetas: [],
      fases: [],
    });
    expect(cuerpo.kanban.motivo).toEqual(expect.any(String));
    expect(cuerpo.kanban.motivo?.length).toBeGreaterThan(0);
    const previo = anterior.body as typeof cuerpo;
    expect(cuerpo.fases).toEqual(previo.fases);
    expect(cuerpo.timeline).toEqual(previo.timeline);
    expect(cuerpo.sesionesPorFase).toEqual(previo.sesionesPorFase);
    expect(cuerpo.fases.map((fase) => fase.estado)).toEqual(["intake"]);
    expect(cuerpo.timeline).toEqual({ disponible: false });
    expect(cuerpo.sesionesPorFase).toEqual([[]]);
  });
});

describe.skipIf(sqlite() === null)("GET /api/ticket/fases: sesiones por fase", () => {
  it("(e) agrupa cada sesión en el tramo de la fase en la que corrió", async () => {
    const id = "FEATURE-PRUEBA-FASES-SESIONES-20260929";
    escribirTicket(
      id,
      [
        creado("2026-09-29T07:00:00.000Z"),
        transicion("intake", "analyzed", "2026-09-29T08:00:00.000Z"),
        transicion("analyzed", "planned", "2026-09-29T08:30:00.000Z"),
        transicion("planned", "in_progress", "2026-09-29T09:00:00.000Z"),
      ],
      "in_progress",
    );

    // Dos sesiones con `startedAt` controlado: una dentro del tramo de `planned`
    // (08:30–09:00) y otra dentro del de `in_progress` (abierto a las 09:00).
    escribirBaseV2([
      {
        id: "ses_fases_a",
        title: `TICKET: ${id}`,
        timeCreated: Date.parse("2026-09-29T08:34:30.000Z"),
      },
      {
        id: "ses_fases_b",
        title: `TICKET: ${id}`,
        timeCreated: Date.parse("2026-09-29T09:07:30.000Z"),
      },
    ]);

    const r = await pedirFases(id);
    expect(r.status).toBe(200);
    const cuerpo = r.body as {
      fases: Fase[];
      timeline: { disponible: boolean; sessions: Sesion[] };
      sesionesPorFase: Sesion[][];
    };

    expect(cuerpo.timeline.disponible).toBe(true);
    expect(cuerpo.sesionesPorFase).toHaveLength(cuerpo.fases.length);

    const indiceDe = (estado: string): number => {
      const indice = cuerpo.fases.findIndex((fase) => fase.estado === estado);
      expect(indice).toBeGreaterThanOrEqual(0);
      return indice;
    };
    const tramoDe = (estado: string): Sesion[] => cuerpo.sesionesPorFase[indiceDe(estado)] ?? [];

    expect(tramoDe("planned").map((s) => s.id)).toEqual(["ses_fases_a"]);
    expect(tramoDe("in_progress").map((s) => s.id)).toEqual(["ses_fases_b"]);
    expect(tramoDe("intake")).toEqual([]);
    expect(tramoDe("analyzed")).toEqual([]);

    // La agrupación es una vista, no un recorte: las sesiones siguen completas en
    // la lista plana y son el mismo objeto que aparece en su tramo.
    const plana = new Map(cuerpo.timeline.sessions.map((sesion) => [sesion.id, sesion]));
    expect([...plana.keys()].sort()).toEqual(["ses_fases_a", "ses_fases_b"]);
    expect(tramoDe("planned")[0]).toBe(plana.get("ses_fases_a"));
    expect(tramoDe("in_progress")[0]).toBe(plana.get("ses_fases_b"));
  });
});

describe.skipIf(sqlite() === null)("GET /api/ticket/fases: fuente kanban", () => {
  beforeEach(() => {
    escribirTicket(TICKET_BOARD, [creado("2026-09-29T06:15:00.000Z")], "intake");
  });

  it("(f) publica los tramos del board y el bloqueo sin mezclarlos con el registro", async () => {
    plantarBoard(
      [{ id: "t_primera", title: TICKET_BOARD, body: "", created_at: 1 }],
      eventosDeBoard(),
    );
    escribirBaseV2([
      {
        id: "ses_board",
        title: TICKET_BOARD,
        timeCreated: Date.parse("2026-09-29T09:30:00.000Z"),
      },
    ]);
    const r = await pedirFases(TICKET_BOARD, BOARD);
    expect(r.status).toBe(200);
    const cuerpo = r.body as {
      ticket: string;
      kanban: FasesDeBoard;
      fases: Fase[];
      timeline: { disponible: boolean; sessions: Sesion[] };
      sesionesPorFase: Sesion[][];
    };
    expect(cuerpo.ticket).toBe(TICKET_BOARD);
    expect(cuerpo.kanban).toMatchObject({
      disponible: true,
      board: BOARD,
      tarjetas: ["t_primera"],
      motivo: null,
    });
    expect(cuerpo.kanban.fases).toEqual([
      {
        estado: "intake",
        inicio: "2026-09-29T07:00:00.000Z",
        fin: "2026-09-29T08:00:00.000Z",
        ms: 3600000,
        enCurso: false,
        motivo: null,
      },
      {
        estado: "in_progress",
        inicio: "2026-09-29T08:00:00.000Z",
        fin: "2026-09-29T09:00:00.000Z",
        ms: 3600000,
        enCurso: false,
        motivo: null,
      },
      {
        estado: "blocked",
        inicio: "2026-09-29T09:00:00.000Z",
        fin: "2026-09-29T10:00:00.000Z",
        ms: 3600000,
        enCurso: false,
        motivo: "Bloqueo needs_input: El PO tiene que decidir.",
      },
      {
        estado: "awaiting_user_tests",
        inicio: "2026-09-29T10:00:00.000Z",
        fin: null,
        ms: null,
        enCurso: true,
        motivo: null,
      },
    ]);
    expect(cuerpo.fases).toEqual([
      {
        estado: "intake",
        inicio: "2026-09-29T06:15:00.000Z",
        fin: null,
        ms: null,
        enCurso: true,
        motivo: null,
      },
    ]);
    expect(cuerpo.timeline.disponible).toBe(true);
    expect(cuerpo.timeline.sessions.map((sesion) => sesion.id)).toEqual(["ses_board"]);
    expect(cuerpo.sesionesPorFase).toEqual([cuerpo.timeline.sessions]);
  });

  it("(h) una base legible sin tarjetas del ticket devuelve una línea vacía disponible", async () => {
    plantarBoard(
      [{ id: "t_ajena", title: "Otra tarea", body: "Sin este ticket", created_at: 1 }],
      eventosDeBoard("t_ajena"),
    );
    const r = await pedirFases(TICKET_BOARD, BOARD);
    expect(r.status).toBe(200);
    expect((r.body as { kanban: FasesDeBoard }).kanban).toEqual({
      disponible: true,
      board: BOARD,
      tarjetas: [],
      fases: [],
      motivo: null,
    });
  });

  it("(i) encadena todas las tarjetas con la más vieja primero", async () => {
    plantarBoard(
      [
        { id: "t_segunda", title: "Otra jornada", body: TICKET_BOARD, created_at: 2 },
        { id: "t_primera", title: TICKET_BOARD, body: "", created_at: 1 },
      ],
      [...eventosDeBoard("t_segunda", "2026-09-30T07:00:00.000Z"), ...eventosDeBoard()],
    );
    const r = await pedirFases(TICKET_BOARD, BOARD);
    expect(r.status).toBe(200);
    const kanban = (r.body as { kanban: FasesDeBoard }).kanban;
    expect(kanban.disponible).toBe(true);
    expect(kanban.tarjetas).toEqual(["t_primera", "t_segunda"]);
    expect(kanban.fases.map((fase) => fase.estado)).toEqual([
      "intake",
      "in_progress",
      "blocked",
      "awaiting_user_tests",
      "intake",
      "in_progress",
      "blocked",
      "awaiting_user_tests",
    ]);
    expect(kanban.fases[3]).toMatchObject({
      inicio: "2026-09-29T10:00:00.000Z",
      fin: "2026-09-30T07:00:00.000Z",
      ms: 21 * 3600000,
      enCurso: false,
    });
    expect(kanban.fases[4]?.inicio).toBe("2026-09-30T07:00:00.000Z");
    expect(kanban.fases.filter((fase) => fase.enCurso)).toEqual([kanban.fases[7]]);
  });

  it("(j) pedir fases no modifica el board ni el ticket", async () => {
    plantarBoard(
      [{ id: "t_primera", title: TICKET_BOARD, body: "", created_at: 1 }],
      eventosDeBoard(),
    );
    const rutaTicket = join(lab, "tickets", "2026", TICKET_BOARD, "ticket.md");
    const antes = [hashArchivo(rutaBoard()), hashArchivo(rutaTicket)];
    const r = await pedirFases(TICKET_BOARD, BOARD);
    expect(r.status).toBe(200);
    expect((r.body as { kanban: FasesDeBoard }).kanban.disponible).toBe(true);
    expect([hashArchivo(rutaBoard()), hashArchivo(rutaTicket)]).toEqual(antes);
  });

  it("(k) sin parámetro board lee el default de la ruta heredada y lo declara", async () => {
    plantarBoard(
      [{ id: "t_default", title: TICKET_BOARD, body: "", created_at: 1 }],
      eventosDeBoard("t_default"),
      "default",
    );
    const r = await pedirFases(TICKET_BOARD);
    expect(r.status).toBe(200);
    const kanban = (r.body as { kanban: FasesDeBoard }).kanban;
    expect(kanban).toMatchObject({
      disponible: true,
      board: "default",
      tarjetas: ["t_default"],
      motivo: null,
    });
    expect(kanban.fases.map((fase) => fase.estado)).toEqual([
      "intake",
      "in_progress",
      "blocked",
      "awaiting_user_tests",
    ]);
  });
});
