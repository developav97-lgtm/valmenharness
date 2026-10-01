/**
 * El lector de `task_events` del board de kanban.
 *
 * El tablero de Hermes es una fuente complementaria de la línea de fases: ahí
 * quedan los tramos que el registro no tiene —cuándo lo tomó el dispatcher,
 * cuándo esperó una decisión, cuándo lo mandó a revisión—, pero sus filas tienen
 * otra forma (`kind` + `payload` + `created_at` en segundos epoch) que la
 * derivación del engine no reconoce. Lo que se afirma acá es la traducción que
 * cierra esa distancia: que `eventosDeFaseDeFilas` produce eventos de la forma
 * del registro, que `fasesPorTicket` deriva con ellos la secuencia de fases con
 * inicio, fin, duración y fase en curso, y que el lector del board resuelve su
 * ruta, lee sin escribir y distingue «no hay base» (`null`) de «no hay filas»
 * (`[]`).
 *
 * La traducción va **separada del I/O** a propósito: `eventosDeFaseDeFilas` es
 * pura, así que los casos que prueban la equivalencia de vocabularios y unidades
 * corren en cualquier versión de Node y no quedan detrás del `skipIf` que
 * necesita `node:sqlite`. Un archivo entero salteado pasa en verde sin comprobar
 * nada: es el falso verde que la feature ya encontró (`tests/readonly-fases.test.ts:359-365`).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  eventosDeFaseDeFilas,
  hayBaseDeKanban,
  kanbanDbPath,
  leerEventosDeFaseKanban,
  tareasDeTicketKanban,
  type EventoDelBoard,
} from "../packages/adapter/src/kanban.js";
import { fasesPorTicket } from "../packages/engine/src/fases.js";

/** El ticket del laboratorio. */
const TICKET = "INTEGRATION-ADAPTER-KANBAN-READER-20260929";

/** La tarjeta del laboratorio. */
const TARJETA = "t_despachada";

/** El board del laboratorio, con nombre. */
const BOARD = "valmen-harness";

/** El instante base: 2026-09-29T07:00:00Z en milisegundos. */
const T0 = Date.UTC(2026, 8, 29, 7, 0, 0);

/** Un `created_at` en segundos epoch, a `horas` del instante base. */
function enHoras(horas: number): number {
  return Math.round(T0 / 1000 + horas * 3600);
}

/** El ISO del instante base más `horas`. */
function iso(horas: number): string {
  return new Date(T0 + horas * 3600 * 1000).toISOString();
}

/** La secuencia que produce una tarjeta creada, despachada, bloqueada y cerrada. */
const SECUENCIA_DESPACHADA = [
  "intake",
  "in_progress",
  "blocked",
  "intake",
  "awaiting_user_tests",
  "closed",
];

/**
 * Las filas reales de una tarjeta despachada, en orden de `created_at`.
 *
 * Ocho filas con hora creciente: dos de ellas —`promoted` y `spawned`— no mueven
 * la fase, así que la serie de seis tramos sale de ocho filas. Es el caso que ata
 * la traducción a la derivación: sin vocabulario ni unidad de hora, `fasesPorTicket`
 * no vería ninguna fase.
 */
function filasDespachada(): EventoDelBoard[] {
  return [
    {
      id: 1,
      kind: "created",
      payload: JSON.stringify({ status: "ready" }),
      created_at: enHoras(0),
    },
    { id: 2, kind: "promoted", payload: null, created_at: enHoras(0.5) },
    { id: 3, kind: "claimed", payload: null, created_at: enHoras(1) },
    { id: 4, kind: "spawned", payload: null, created_at: enHoras(1.5) },
    {
      id: 5,
      kind: "blocked",
      payload: JSON.stringify({ reason: "El PO tiene que decidir.", kind: "needs_input" }),
      created_at: enHoras(2),
    },
    {
      id: 6,
      kind: "unblocked",
      payload: JSON.stringify({ status: "ready" }),
      created_at: enHoras(3),
    },
    { id: 7, kind: "review_requested", payload: null, created_at: enHoras(4) },
    { id: 8, kind: "completed", payload: null, created_at: enHoras(5) },
  ];
}

let lab: string;
let homeOriginal: string | undefined;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-kanban-"));

  // El board se resuelve bajo el home de la persona —no bajo el `directory` del
  // proyecto—, así que la prueba lo aísla: un home real con un board suyo haría
  // que el caso dependiera de la máquina que corre los tests.
  homeOriginal = process.env["HOME"];
  process.env["HOME"] = lab;
});

afterEach(() => {
  if (homeOriginal === undefined) delete process.env["HOME"];
  else process.env["HOME"] = homeOriginal;
  rmSync(lab, { recursive: true, force: true });
});

/** La ruta de la base del board que se planta en el laboratorio. */
function rutaBoard(): string {
  return kanbanDbPath(BOARD, lab);
}

const requerir = createRequire(import.meta.url);

/** Lo mínimo de la interfaz de la base que usan estas pruebas. */
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): { run(...valores: unknown[]): void };
  close(): void;
}

/** El módulo del núcleo, o `null` si esta versión de Node no lo trae. */
function sqlite(): { DatabaseSync: new (ruta: string) => SqliteDb } | null {
  try {
    return requerir("node:sqlite") as {
      DatabaseSync: new (ruta: string) => SqliteDb;
    };
  } catch {
    return null;
  }
}

/** Una tarjeta del board, tal como la inserta la prueba. */
interface Tarjeta {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly created_at: number;
}

/** Una fila de `task_events`, sin el `id` que asigna la base. */
interface FilaDeEvento {
  readonly task_id: string;
  readonly kind: string;
  readonly payload: string | null;
  readonly created_at: number;
}

/**
 * Planta el board del laboratorio con el esquema real.
 *
 * Se usa el esquema de verdad —`tasks(id, title, body, created_at)` y
 * `task_events(id, task_id, run_id, kind, payload, created_at)`— y no uno
 * reducido: la consulta lee esas columnas, y una tabla que no las tuviera dejaría
 * los casos en verde sin probar la consulta real.
 */
function plantarBoard(
  tarjetas: readonly Tarjeta[],
  eventos: readonly FilaDeEvento[],
): void {
  const modulo = sqlite();
  if (modulo === null) throw new Error("node:sqlite no está disponible.");

  mkdirSync(join(lab, ".hermes", "kanban", "boards", BOARD), { recursive: true });
  const db = new modulo.DatabaseSync(rutaBoard());
  db.exec(`
    CREATE TABLE tasks (id text primary key, title text, body text, created_at integer);
    CREATE TABLE task_events (
      id integer primary key autoincrement, task_id text, run_id integer,
      kind text, payload text, created_at integer
    );
  `);

  const insertarTarjeta = db.prepare(
    "INSERT INTO tasks (id, title, body, created_at) VALUES (?,?,?,?)",
  );
  for (const tarjeta of tarjetas) {
    insertarTarjeta.run(tarjeta.id, tarjeta.title, tarjeta.body, tarjeta.created_at);
  }

  const insertarEvento = db.prepare(
    "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?,?,?,?,?)",
  );
  for (const evento of eventos) {
    insertarEvento.run(
      evento.task_id,
      null,
      evento.kind,
      evento.payload,
      evento.created_at,
    );
  }
  db.close();
}

/** Convierte las filas puras de la tarjeta en filas de `task_events` de la base. */
function filasDeBase(filas: readonly EventoDelBoard[]): FilaDeEvento[] {
  return filas.map((fila) => ({
    task_id: TARJETA,
    kind: fila.kind,
    payload: fila.payload,
    created_at: fila.created_at,
  }));
}

/** El hash del contenido de un archivo. */
function hashArchivo(ruta: string): string {
  return createHash("sha256").update(readFileSync(ruta)).digest("hex");
}

describe("eventosDeFaseDeFilas: la traducción del board", () => {
  it("(a) una tarjeta despachada rinde las seis fases con su tramo", () => {
    const eventos = eventosDeFaseDeFilas(filasDespachada());
    const fases = fasesPorTicket(eventos);

    expect(fases.map((fase) => fase.estado)).toEqual([...SECUENCIA_DESPACHADA]);

    // Cada tramo cerrado toma su fin del evento siguiente y su duración de la
    // resta de las dos horas sembradas; el último queda cerrado, no en curso.
    const [intake, enProgreso, bloqueada, reintake, revision, cerrada] = fases;
    expect(intake?.inicio).toBe(iso(0));
    expect(intake?.fin).toBe(iso(1));
    expect(intake?.ms).toBe(3600000);
    expect(enProgreso?.inicio).toBe(iso(1));
    expect(enProgreso?.fin).toBe(iso(2));
    expect(enProgreso?.ms).toBe(3600000);
    expect(bloqueada?.inicio).toBe(iso(2));
    expect(bloqueada?.fin).toBe(iso(3));
    expect(bloqueada?.ms).toBe(3600000);
    expect(reintake?.inicio).toBe(iso(3));
    expect(reintake?.fin).toBe(iso(4));
    expect(reintake?.ms).toBe(3600000);
    expect(revision?.inicio).toBe(iso(4));
    expect(revision?.fin).toBe(iso(5));
    expect(revision?.ms).toBe(3600000);
    expect(cerrada?.inicio).toBe(iso(5));
    expect(cerrada?.fin).toBeNull();
    expect(cerrada?.ms).toBeNull();
    expect(cerrada?.enCurso).toBe(false);

    // La creación abre la serie con la acción que el engine reconoce, y el
    // bloqueo lleva el motivo en el `details` para que la fase lo declare.
    const creacion = eventos[0];
    expect(creacion?.["kind"]).toBe("ticket-event");
    expect(creacion?.["id"]).toBe("KANBAN-1");
    expect(creacion?.["date"]).toBe("2026-09-29");
    expect(creacion?.["actor"]).toBe("kanban");
    expect(creacion?.["action"]).toBe("created");
    expect(creacion?.["details"]).toBe("Tarjeta creada en el board, en estado ready.");
    expect(creacion?.["at"]).toBe(iso(0));

    const bloqueo = eventos.find((evento) => String(evento["details"]).includes("Bloqueo"));
    expect(bloqueo?.["details"]).toBe(
      "Workflow: in_progress -> blocked. Bloqueo needs_input: El PO tiene que decidir.",
    );
  });

  it("(b) un evento que no mueve la fase no abre ni cierra tramo", () => {
    // `heartbeat` es la mayoría de las filas del board, y `commented` o
    // `model_override_set` tampoco cambian de estado. Si cada fila abriera fase,
    // la banda pintaría escalones de segundos que nadie vivió.
    const filas: EventoDelBoard[] = [
      {
        id: 1,
        kind: "created",
        payload: JSON.stringify({ status: "ready" }),
        created_at: enHoras(0),
      },
      { id: 2, kind: "heartbeat", payload: null, created_at: enHoras(0.25) },
      { id: 3, kind: "promoted", payload: null, created_at: enHoras(0.5) },
      {
        id: 4,
        kind: "commented",
        payload: JSON.stringify({ text: "hola" }),
        created_at: enHoras(0.75),
      },
      { id: 5, kind: "claimed", payload: null, created_at: enHoras(1) },
      { id: 6, kind: "model_override_set", payload: null, created_at: enHoras(1.25) },
      { id: 7, kind: "spawned", payload: null, created_at: enHoras(1.5) },
      {
        id: 8,
        kind: "blocked",
        payload: JSON.stringify({
          reason: "El PO tiene que decidir.",
          kind: "needs_input",
        }),
        created_at: enHoras(2),
      },
      {
        id: 9,
        kind: "unblocked",
        payload: JSON.stringify({ status: "ready" }),
        created_at: enHoras(3),
      },
      { id: 10, kind: "review_requested", payload: null, created_at: enHoras(4) },
      { id: 11, kind: "completed", payload: null, created_at: enHoras(5) },
    ];

    const fases = fasesPorTicket(eventosDeFaseDeFilas(filas));

    expect(fases.map((fase) => fase.estado)).toEqual([...SECUENCIA_DESPACHADA]);
    expect(fases).toHaveLength(SECUENCIA_DESPACHADA.length);
    // `claimed` seguido de `spawned` es la misma fase: una sola `in_progress`.
    expect(fases.filter((fase) => fase.estado === "in_progress")).toHaveLength(1);
  });

  it("(c) un bloqueo y un changes_requested con reason dejan su motivo en la fase", () => {
    const filas: EventoDelBoard[] = [
      {
        id: 1,
        kind: "created",
        payload: JSON.stringify({ status: "ready" }),
        created_at: enHoras(0),
      },
      { id: 2, kind: "claimed", payload: null, created_at: enHoras(1) },
      {
        id: 3,
        kind: "blocked",
        payload: JSON.stringify({
          reason: "El PO tiene que decidir.",
          kind: "needs_input",
        }),
        created_at: enHoras(2),
      },
      {
        id: 4,
        kind: "unblocked",
        payload: JSON.stringify({ status: "ready" }),
        created_at: enHoras(3),
      },
      {
        id: 5,
        kind: "changes_requested",
        payload: JSON.stringify({ reason: "Falta el caso borde." }),
        created_at: enHoras(4),
      },
    ];

    const fases = fasesPorTicket(eventosDeFaseDeFilas(filas));

    // El motivo con tipo de bloqueo del board delante cuando el payload lo trae,
    // y el texto solo cuando no: es lo que llena `motivo` en `FaseDeTicket`.
    const bloqueada = fases.find((fase) => fase.estado === "blocked");
    expect(bloqueada?.motivo).toBe("Bloqueo needs_input: El PO tiene que decidir.");

    const cambios = fases.find((fase) => fase.estado === "changes_requested");
    expect(cambios?.motivo).toBe("Falta el caso borde.");
  });

  it("(d) sin base el lector devuelve null y la ruta del board se resuelve por su nombre", () => {
    // `null` es «no hay base», distinto de `[]` que diría «la base no tiene
    // filas»: la pantalla tiene que poder declarar la ausencia, no un cero.
    expect(hayBaseDeKanban(BOARD, lab)).toBe(false);
    expect(leerEventosDeFaseKanban(BOARD, TARJETA, { home: lab })).toBeNull();

    // El board `default` vive en la ruta heredada; uno con nombre, en su carpeta.
    expect(kanbanDbPath("default", lab).endsWith(join(".hermes", "kanban.db"))).toBe(true);
    expect(kanbanDbPath("", lab).endsWith(join(".hermes", "kanban.db"))).toBe(true);
    expect(
      kanbanDbPath(BOARD, lab).endsWith(
        join(".hermes", "kanban", "boards", BOARD, "kanban.db"),
      ),
    ).toBe(true);
  });
});

describe.skipIf(sqlite() === null)("leerEventosDeFaseKanban contra una base real", () => {
  it("(a-bis) leer la base reproduce la traducción pura y su secuencia de fases", () => {
    // El caso une las dos mitades: la filas plantadas son las mismas que el caso
    // (a), así que si la consulta o el orden cambiaran —o el `id` de la base no
    // viajara al evento— la serie de fases dejaría de salir.
    const filas = filasDespachada();
    plantarBoard([], filasDeBase(filas));

    const leidos = leerEventosDeFaseKanban(BOARD, TARJETA, { home: lab });
    expect(leidos).not.toBeNull();
    expect(leidos).toEqual(eventosDeFaseDeFilas(filas));

    const fases = fasesPorTicket(leidos ?? []);
    expect(fases.map((fase) => fase.estado)).toEqual([...SECUENCIA_DESPACHADA]);
  });

  it("(e) tareasDeTicketKanban encuentra la tarjeta por título y por cuerpo, todas y la más vieja primero", () => {
    plantarBoard(
      [
        {
          id: "t_cuerpo",
          title: "Cierre de jornada",
          body: `Se trabajó ${TICKET} en dos jornadas.`,
          created_at: enHoras(0),
        },
        {
          id: "t_titulo",
          title: `Tarjeta ${TICKET}`,
          body: "sin más.",
          created_at: enHoras(1),
        },
        {
          id: "t_ajena",
          title: "Otra tarea",
          body: "nada que ver.",
          created_at: enHoras(2),
        },
      ],
      [],
    );

    // Las dos coincidencias y en orden de creación: elegir una sola partiría en
    // dos la línea de un ticket trabajado en dos jornadas.
    expect(tareasDeTicketKanban(BOARD, TICKET, { home: lab })).toEqual([
      "t_cuerpo",
      "t_titulo",
    ]);

    // Con la base legible y ninguna coincidencia, la respuesta es `[]`—no `null`—:
    // la base se leyó y ninguna tarjeta nombra el ticket.
    expect(
      tareasDeTicketKanban(BOARD, "FEATURE-QUE-NO-EXISTE-20260101", { home: lab }),
    ).toEqual([]);
  });

  it("(f) leer el board no lo modifica", () => {
    // R-S1-004: el lector abre en solo lectura y no deja rastro. El hash del
    // contenido lo ve aunque el motor no vuelva a leer la base en este caso.
    plantarBoard(
      [{ id: TARJETA, title: "Tarjeta del board", body: TICKET, created_at: enHoras(0) }],
      filasDeBase(filasDespachada()),
    );
    expect(existsSync(rutaBoard())).toBe(true);

    const antes = hashArchivo(rutaBoard());
    leerEventosDeFaseKanban(BOARD, TARJETA, { home: lab });
    tareasDeTicketKanban(BOARD, TICKET, { home: lab });
    const despues = hashArchivo(rutaBoard());

    expect(despues).toBe(antes);
  });
});
