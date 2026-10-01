/**
 * La línea de fases es de solo lectura: derivarla y consultarla no deja rastro.
 *
 * `fasesPorTicket` declara en su docstring que es pura y read-only y el endpoint
 * `GET /api/ticket/fases` declara lo mismo, pero ninguna de las dos suites de la
 * feature mira el árbol antes y después: `tests/derivacion-fases.test.ts` afirma
 * las fases que salen y `tests/api-fases-api.test.ts` afirma la respuesta del
 * endpoint. Eso deja un incumplimiento sin lugar donde manifestarse —una
 * escritura hecha desde el camino de lectura pasa en verde—.
 *
 * Esta suite existe para cerrar ese hueco: hashea el registro y las bases antes
 * y después, y falla si el camino de lectura escribe. El riesgo no es
 * hipotético: el sprint 2 lee `task_events` de `kanban.db` y lo integra en este
 * mismo endpoint, y ahí escribir —marcar la fase en curso con un `UPDATE`,
 * normalizar el bloque `Eventos` al leerlo, cachear la derivación en el
 * ticket— es el cambio natural. Lo que se rompería es la auditoría: el registro
 * dejaría de ser la fuente que solo se lee.
 *
 * Se hashea **contenido** y no `mtime`: la marca de tiempo depende del sistema
 * de archivos y podría no moverse aunque los bytes cambien, que es el falso
 * verde que hay que evitar. La parte que usa `node:sqlite` —plantar el board y
 * leer la contabilidad v2— va bajo `skipIf` porque el módulo es experimental y
 * no está en toda versión de Node; la pureza de la derivación no: un archivo
 * entero salteado sale en verde sin comprobar nada, que es justo el falso verde
 * que este ticket cierra.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fasesPorTicket } from "../packages/engine/src/fases.js";
import { readTicket } from "../packages/engine/src/tickets.js";
import { type ServerContext, handleApi } from "../packages/server/src/server.js";
import { writeFixtureTicket } from "./helpers/fixtures.js";

/** La acción con la que el motor escribe una transición de ticket. */
const ACCION_TRANSICION = "ticket-transition";

let lab: string;
let homeOriginal: string | undefined;

beforeEach(() => {
  lab = mkdtempSync(join(tmpdir(), "valmen-readonly-fases-"));
  mkdirSync(join(lab, "tickets"), { recursive: true });

  // El endpoint lee la contabilidad del home de la persona; se aísla para que la
  // prueba no dependa de la base real de la máquina. La derivación no usa el
  // home, pero el mismo encuadre sirve a los dos casos.
  homeOriginal = process.env["HOME"];
  process.env["HOME"] = lab;
});

afterEach(() => {
  if (homeOriginal === undefined) delete process.env["HOME"];
  else process.env["HOME"] = homeOriginal;
  rmSync(lab, { recursive: true, force: true });
});

/** El contexto del laboratorio, con el registro en su carpeta `tickets/`. */
function contexto(): ServerContext {
  return {
    root: lab,
    paths: { root: lab, ticketsDir: "tickets" },
    credentialsFile: join(lab, ".valmen", ".credentials.yaml"),
    env: {},
  };
}

/** Las rutas del registro del laboratorio. */
function paths(): { root: string; ticketsDir: string } {
  return { root: lab, ticketsDir: "tickets" };
}

/** La ruta del `ticket.md` de un fixture, tomando el año de los dígitos del id. */
function rutaTicket(id: string): string {
  return join(lab, "tickets", id.slice(-8, -4), id, "ticket.md");
}

/** La ruta de la base del board que se planta en el laboratorio. */
function rutaBoard(): string {
  return join(lab, ".hermes", "kanban.db");
}

/** La ruta de la base de contabilidad v2 del home aislado. */
function rutaBaseV2(): string {
  return join(lab, ".local", "share", "opencode", "opencode.db");
}

/**
 * Lista los archivos del laboratorio en orden determinista.
 *
 * Se ordena por ruta porque el orden de `readdir` depende del sistema de
 * archivos: hashear en el orden que devuelva el disco daría un hash distinto
 * entre corridas sin que nada haya cambiado.
 */
function listarArchivos(raiz: string, prefijo = ""): string[] {
  const dir = prefijo === "" ? raiz : join(raiz, prefijo);
  const entradas = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );

  const archivos: string[] = [];
  for (const entrada of entradas) {
    const relativa = prefijo === "" ? entrada.name : `${prefijo}/${entrada.name}`;
    if (entrada.isDirectory()) archivos.push(...listarArchivos(raiz, relativa));
    else archivos.push(relativa);
  }
  return archivos;
}

/**
 * Enmarca un valor con su largo antes de hashearlo.
 *
 * Sin el largo, `"ab" + "c"` y `"a" + "bc"` dan los mismos bytes y el hash deja
 * de distinguir dos árboles distintos: el mismo defecto que la evidencia
 * `worktree:sha256` evita.
 */
function enmarcar(valor: string | Buffer): Buffer {
  const bytes = Buffer.isBuffer(valor) ? valor : Buffer.from(valor, "utf8");
  const largo = Buffer.alloc(8);
  largo.writeBigUInt64BE(BigInt(bytes.length));
  return Buffer.concat([largo, bytes]);
}

/**
 * El hash del laboratorio completo: cada archivo, por su ruta relativa y su
 * contenido.
 *
 * Es la señal que distingue «el camino de lectura no tocó nada» de «escribió un
 * archivo, borró otro o reescribió un bloque append-only»: un `mtime` no lo
 * diría.
 */
function hashArbol(raiz: string): string {
  const hash = createHash("sha256");
  for (const relativa of listarArchivos(raiz)) {
    hash.update(enmarcar(relativa));
    hash.update(enmarcar(readFileSync(join(raiz, relativa))));
  }
  return hash.digest("hex");
}

/**
 * El hash del contenido de un archivo, sin abrirlo con SQLite.
 *
 * Sirve para la base del board: un lector que solo la abre no la cambia, pero un
 * `UPDATE` de más sí, y el hash del contenido lo ve aunque el motor nunca
 * vuelva a leerla en este caso.
 */
function hashArchivo(ruta: string): string {
  return createHash("sha256").update(readFileSync(ruta)).digest("hex");
}

const requerir = createRequire(import.meta.url);

/** Lo mínimo de la interfaz de la base que usan estas pruebas. */
interface SqliteSentencia {
  run(...valores: unknown[]): void;
  all(): Record<string, unknown>[];
}

interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteSentencia;
  close(): void;
}

interface SqliteModulo {
  DatabaseSync: new (ruta: string, opciones?: { readOnly?: boolean }) => SqliteDb;
}

/** El módulo del núcleo, o `null` si esta versión de Node no lo trae. */
function sqlite(): SqliteModulo | null {
  try {
    return requerir("node:sqlite") as SqliteModulo;
  } catch {
    return null;
  }
}

/** Abre la base y cierra al salir, para no dejar el archivo tomado. */
function conBase<T>(
  ruta: string,
  opciones: { readOnly?: boolean },
  cuerpo: (db: SqliteDb) => T,
): T {
  const modulo = sqlite();
  if (modulo === null) throw new Error("node:sqlite no está disponible.");
  const db = new modulo.DatabaseSync(ruta, opciones);
  try {
    return cuerpo(db);
  } finally {
    db.close();
  }
}

/**
 * El hash de la contabilidad v2: `session_v2` y `session_message` ordenadas por
 * `id`.
 *
 * Es lo que un endpoint que «consulta» no debería mover: si el camino de lectura
 * anotara una sesión, marcara un mensaje o normalizara una fila, el hash dejaría
 * de coincidir.
 */
function hashBaseV2(home: string): string {
  const hash = createHash("sha256");
  conBase(
    join(home, ".local", "share", "opencode", "opencode.db"),
    { readOnly: true },
    (db) => {
      for (const tabla of ["session_v2", "session_message"]) {
        hash.update(enmarcar(tabla));
        for (const fila of db.prepare(`SELECT * FROM ${tabla} ORDER BY id`).all()) {
          hash.update(enmarcar(JSON.stringify(fila)));
        }
      }
    },
  );
  return hash.digest("hex");
}

/**
 * Planta la base del board —`kanban.db` con su tabla `task_events`— en el
 * laboratorio.
 *
 * El sprint 2 lee `task_events` de acá y lo integra en el mismo endpoint
 * (`INTEGRATION-ADAPTER-KANBAN-READER-20260929`); es el archivo que un `UPDATE`
 * de más cambiaría, así que la prueba tiene que plantar una base real y no una
 * vacía: sobre un archivo inexistente el hash no cambia nunca y el caso pasa en
 * falso verde.
 */
function plantarBoard(home: string): void {
  mkdirSync(join(home, ".hermes"), { recursive: true });
  conBase(join(home, ".hermes", "kanban.db"), {}, (db) => {
    db.exec(
      "CREATE TABLE task_events (id text PRIMARY KEY, task_id text, kind text, at integer);",
    );
    db.prepare("INSERT INTO task_events VALUES (?,?,?,?)").run("EV-1", "t-1", "created", 0);
  });
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

/**
 * Escribe un ticket de prueba válido y reemplaza su bloque `Eventos`.
 *
 * `writeFixtureTicket` no acepta eventos y la garantía se juega justamente en
 * cómo se leen: reemplazar el bloque JSON conserva la estructura canónica que el
 * parser exige, y la forma de los eventos es la real del motor.
 */
function escribirTicket(
  id: string,
  eventos: readonly Record<string, unknown>[],
  workflowStatus = "in_progress",
): void {
  writeFixtureTicket(lab, { id, workflowStatus });
  const texto = readFileSync(rutaTicket(id), "utf8");
  const bloque = `## Eventos\n\n\`\`\`json\n${JSON.stringify(eventos, null, 2)}\n\`\`\`\n`;
  writeFileSync(
    rutaTicket(id),
    texto.replace(/## Eventos\n\n```json\n[\s\S]*?\n```\n/, bloque),
    "utf8",
  );
}

/** Llama al endpoint de fases para un ticket del laboratorio. */
async function pedirFases(ticket: string): Promise<{ status: number; body: unknown }> {
  return await handleApi(
    "GET",
    "/api/ticket/fases",
    {},
    contexto(),
    new URLSearchParams({ ticket, directory: lab }),
  );
}

/**
 * Escribe una base falsa de opencode v2 en el home aislado.
 *
 * Es la técnica de `escribirBaseV2` de `tests/api-fases-api.test.ts` reducida a
 * lo que este caso necesita: la sesión en `session_v2`, de donde sale el
 * `startedAt`, con el identificador del ticket en el título para que el lector la
 * atribuya.
 */
function escribirBaseV2(
  sesiones: readonly {
    readonly id: string;
    readonly title: string;
    readonly timeCreated: number;
  }[],
): void {
  mkdirSync(join(lab, ".local", "share", "opencode"), { recursive: true });
  conBase(rutaBaseV2(), {}, (db) => {
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
  });
}

describe("la línea de fases es de solo lectura", () => {
  // El caso (a) no va bajo `skipIf` a propósito: es el que comprueba la pureza de
  // la derivación, y dejarlo adentro hacía que una máquina sin `node:sqlite`
  // corriera el archivo entero en verde sin comprobar nada —el falso verde que
  // este ticket existe para cerrar—. Los que sí necesitan el módulo experimental
  // —plantar la base del board y leer la contabilidad— van en el `describe` de
  // abajo.
  it("(a) derivar las fases no muta la lista de eventos ni escribe el registro", () => {
    const id = "FEATURE-PRUEBA-READONLY-DERIVA-20260929";
    escribirTicket(id, [
      creado("2026-09-29T07:00:00.000Z"),
      transicion("intake", "analyzed", "2026-09-29T08:00:00.000Z"),
      transicion("analyzed", "planned", "2026-09-29T08:30:00.000Z"),
      transicion("planned", "in_progress", "2026-09-29T09:00:00.000Z"),
    ]);

    // El archivo que se hashea tiene que existir: sobre un archivo ausente el
    // hash no cambia y el caso pasaría sin comprobar nada.
    expect(existsSync(rutaTicket(id))).toBe(true);

    const arbolAntes = hashArbol(lab);

    const detalle = readTicket(paths(), id);
    if (detalle === null) throw new Error(`El fixture "${id}" no se pudo leer.`);
    const entrada = detalle.events;

    // La foto de la lista tal como se pasa: si la derivación reemplaza o
    // reordena un elemento, la referencia deja de coincidir.
    const foto = [...entrada];
    const fases = fasesPorTicket(entrada);
    expect(fases.length).toBeGreaterThan(0);

    // Misma longitud, mismo orden y cada elemento la MISMA referencia de objeto:
    // una derivación que mutara la entrada seguiría devolviendo las mismas fases,
    // pero el registro habría cambiado en memoria y esta comprobación lo vería.
    expect(entrada).toHaveLength(foto.length);
    for (let i = 0; i < foto.length; i += 1) {
      expect(entrada[i]).toBe(foto[i]);
    }

    // El registro queda byte a byte igual: el camino de derivación no tiene por
    // dónde escribir y esta es la prueba de que sigue así.
    expect(hashArbol(lab)).toBe(arbolAntes);
  });

  describe.skipIf(sqlite() === null)("las bases del laboratorio", () => {
    it("(b) derivar las fases no deja distinto el board", () => {
      const id = "FEATURE-PRUEBA-READONLY-BOARD-20260929";
      escribirTicket(id, [
        creado("2026-09-29T07:00:00.000Z"),
        transicion("intake", "analyzed", "2026-09-29T08:00:00.000Z"),
      ]);

      plantarBoard(lab);
      expect(existsSync(rutaBoard())).toBe(true);

      const boardAntes = hashArchivo(rutaBoard());

      const detalle = readTicket(paths(), id);
      if (detalle === null) throw new Error(`El fixture "${id}" no se pudo leer.`);
      expect(fasesPorTicket(detalle.events).length).toBeGreaterThan(0);

      // El board —`kanban.db` con `task_events`— es el archivo que un `UPDATE` de
      // más cambiaría: el sprint 2 lo lee desde este mismo camino.
      expect(hashArchivo(rutaBoard())).toBe(boardAntes);
    });

    it("(c) consultar el endpoint no deja distinto el registro, el board ni la contabilidad, ni tras repetir", async () => {
      const id = "FEATURE-PRUEBA-READONLY-ENDPOINT-20260929";
      escribirTicket(id, [
        creado("2026-09-29T07:00:00.000Z"),
        transicion("intake", "analyzed", "2026-09-29T08:00:00.000Z"),
        transicion("analyzed", "in_progress", "2026-09-29T09:00:00.000Z"),
      ]);

      escribirBaseV2([
        {
          id: "ses_readonly_a",
          title: `TICKET: ${id}`,
          timeCreated: Date.parse("2026-09-29T09:07:30.000Z"),
        },
      ]);
      plantarBoard(lab);

      expect(existsSync(rutaTicket(id))).toBe(true);
      expect(existsSync(rutaBoard())).toBe(true);
      expect(existsSync(rutaBaseV2())).toBe(true);

      const arbolAntes = hashArbol(lab);
      const boardAntes = hashArchivo(rutaBoard());
      const contabilidadAntes = hashBaseV2(lab);

      const r = await pedirFases(id);
      expect(r.status).toBe(200);

      // Los tres hashes idénticos: el endpoint leyó el ticket, derivó las fases y
      // agrupó las sesiones sin tocar el registro, el board ni la contabilidad.
      expect(hashArbol(lab)).toBe(arbolAntes);
      expect(hashArchivo(rutaBoard())).toBe(boardAntes);
      expect(hashBaseV2(lab)).toBe(contabilidadAntes);

      // Una segunda consulta de inmediato: dos lecturas no dejan nada distinto de
      // una. Si la primera hubiera cacheado, normalizado o marcado algo, acá
      // aparece.
      const repetida = await pedirFases(id);
      expect(repetida.status).toBe(200);

      expect(hashArbol(lab)).toBe(arbolAntes);
      expect(hashArchivo(rutaBoard())).toBe(boardAntes);
      expect(hashBaseV2(lab)).toBe(contabilidadAntes);
    });
  });
});
