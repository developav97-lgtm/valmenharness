/**
 * El lector del tablero de kanban: `task_events` traducido a eventos de fase.
 *
 * El dispatcher de Hermes guarda lo que le pasa a una tarjeta en su propia base
 * `kanban.db`, en la tabla `task_events`, con la forma `kind` + `payload` +
 * `created_at`. La derivación de fases del engine (`packages/engine/src/fases.ts`)
 * consume eventos con la forma del registro —`action` + `details` con el
 * `Workflow:`— y el instante en ISO 8601. La distancia entre las dos formas no se
 * cierra con un `SELECT`, y son tres incompatibilidades independientes, cada una
 * suficiente para perder el dato:
 *
 * 1. **La forma.** `fasesPorTicket` reconoce `action: "created"` y
 *    `action: "ticket-transition"` con el destino en `details`; una fila del board
 *    no tiene ni `action` ni `details`, así que pasarla sin traducir no produce una
 *    fase mal formada sino ninguna fase.
 * 2. **El vocabulario.** Los ocho estados del board y los once del registro solo
 *    coinciden literalmente en dos nombres (`blocked` y `changes_requested`), de
 *    modo que traducir por parecido de nombres no alcanza: la equivalencia tiene
 *    que estar escrita (las dos tablas de abajo).
 * 3. **La unidad de hora.** `created_at` es epoch en **segundos** y el registro
 *    guarda ISO 8601, que es lo que `Date.parse` interpreta: pasar el entero tal
 *    cual deja todos los tramos en `null`, con la forma de un hueco de datos que
 *    nadie escribió.
 *
 * Este módulo es de solo lectura: abre el board en modo lectura (el dispatcher lo
 * escribe y R-S1-004 prohíbe tocarlo) y no escribe ni en el board ni en el
 * registro. La traducción de filas a eventos vive separada del I/O —`eventosDeFaseDeFilas`
 * es pura— para poder probarla en cualquier versión de Node y para que el único
 * lugar que toca el disco sea la carga de la base.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

import type { JsonObject } from "@valmen/core";

/** El nombre del board que resuelve a la ruta heredada bajo el home. */
const BOARD_HEREDADO = "default";

/**
 * La ruta de la base del board bajo un home.
 *
 * El board con nombre vive en su propia carpeta —`<home>/.hermes/kanban/boards/<slug>/kanban.db`—
 * y el board `default` en la ruta heredada —`<home>/.hermes/kanban.db`—, que es
 * donde el dispatcher de Hermes deja cada uno.
 */
export function kanbanDbPath(board: string, home: string = homedir()): string {
  if (board === "" || board === BOARD_HEREDADO) {
    return join(home, ".hermes", "kanban.db");
  }
  return join(home, ".hermes", "kanban", "boards", board, "kanban.db");
}

/**
 * `true` si hay una base del board que leer.
 *
 * Se comprueba antes de intentar abrirla para poder devolver `null` —«no hay
 * datos»— en vez de una lista vacía que la pantalla leería como «no hubo fases».
 */
export function hayBaseDeKanban(board: string, home?: string): boolean {
  return existsSync(kanbanDbPath(board, home));
}

/** Una fila de `task_events`, tal como sale de la consulta. */
export interface EventoDelBoard {
  readonly id: number | string;
  readonly kind: string;
  readonly payload: string | null;
  readonly created_at: number;
}

/** El payload de una fila, parseado, o `{}` si no es un objeto JSON. */
function payloadDe(texto: string | null): JsonObject {
  if (texto === null) return {};
  try {
    const dato = JSON.parse(texto) as unknown;
    if (dato === null || typeof dato !== "object" || Array.isArray(dato)) return {};
    return dato as JsonObject;
  } catch {
    // Un payload que no parsea no es un fallo del lector: la fila se lee como si
    // no trajera payload, y la tabla decide si eso alcanza para una fase.
    return {};
  }
}

/**
 * Tabla 1: tipo de evento del board → estado del board.
 *
 * Va escrita y no traducida por parecido porque los dos vocabularios solo
 * coinciden en dos nombres. Devuelve `null` cuando el tipo no está en la tabla: no
 * es fase y no corta la serie.
 */
function estadoDelBoard(kind: string, payload: JsonObject): string | null {
  switch (kind) {
    case "created":
    case "unblocked": {
      const status = payload["status"];
      return typeof status === "string" && status !== "" ? status : "ready";
    }
    case "promoted":
    case "promoted_manual":
    case "reclaimed":
      return "ready";
    case "dependency_wait":
      return "todo";
    case "scheduled":
      return "scheduled";
    case "claimed":
    case "spawned":
      return "running";
    case "blocked":
      return "blocked";
    case "review_requested":
      return "review";
    case "changes_requested":
      return "changes_requested";
    case "completed":
      return "done";
    default:
      return null;
  }
}

/**
 * Tabla 2: estado del board → fase del registro.
 *
 * Devuelve `null` cuando el estado no está en la tabla; un estado desconocido no
 * es fase.
 */
function faseDelRegistro(estado: string): string | null {
  switch (estado) {
    case "triage":
    case "todo":
    case "scheduled":
    case "ready":
      return "intake";
    case "running":
      return "in_progress";
    case "blocked":
      return "blocked";
    case "review":
      return "awaiting_user_tests";
    case "changes_requested":
      return "changes_requested";
    case "done":
      return "closed";
    default:
      return null;
  }
}

/** El `at` ISO de una fila, o `null` si su `created_at` no es una hora utilizable. */
function horaISO(createdAt: number): string | null {
  if (!Number.isFinite(createdAt)) return null;
  const fecha = new Date(createdAt * 1000);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

/**
 * El motivo que el payload anexa al `details`, o `null` si no corresponde.
 *
 * Solo `blocked` y `changes_requested` traen motivo, y solo cuando el payload
 * declara `reason` como texto no vacío. El tipo de bloqueo del board —`kind` del
 * payload— se antepone cuando está, para que el motivo diga qué clase de bloqueo
 * fue y no solo el texto.
 */
function motivoDelPayload(kind: string, payload: JsonObject): string | null {
  if (kind !== "blocked" && kind !== "changes_requested") return null;
  const reason = payload["reason"];
  if (typeof reason !== "string" || reason.trim() === "") return null;
  const tipo = payload["kind"];
  const prefijo = typeof tipo === "string" && tipo !== "" ? `Bloqueo ${tipo}: ` : "";
  return `${prefijo}${reason}`;
}

/**
 * La traducción pura: las filas de `task_events` en orden → eventos de fase.
 *
 * Recorre las filas en el orden recibido —la consulta las trae por
 * `created_at ASC, id ASC`— y emite **solo cuando la fase cambia** respecto de la
 * última emitida: dos filas seguidas que dan la misma fase (`claimed` y después
 * `spawned`) son una sola. Una fila sin tipo o sin estado reconocido no emite, no
 * corta la serie y no cambia la última fase vista.
 *
 * No importa `node:fs` ni `node:sqlite`: no toca el disco y no muta las filas.
 */
export function eventosDeFaseDeFilas(
  filas: readonly EventoDelBoard[],
): readonly JsonObject[] {
  const eventos: JsonObject[] = [];
  let ultimaFase: string | null = null;
  let yaEmitioCreacion = false;

  for (const fila of filas) {
    const payload = payloadDe(fila.payload);
    const estado = estadoDelBoard(fila.kind, payload);
    if (estado === null) continue;
    const fase = faseDelRegistro(estado);
    if (fase === null) continue;
    // Un evento que no mueve la fase no emite: la serie de fases no tiene
    // escalones de un segundo que nadie vivió.
    if (fase === ultimaFase) continue;

    const at = horaISO(fila.created_at);
    const esCreacion = fila.kind === "created" && !yaEmitioCreacion;
    if (fila.kind === "created") yaEmitioCreacion = true;

    let action: string;
    let details: string;
    if (esCreacion) {
      action = "created";
      details = `Tarjeta creada en el board, en estado ${estado}.`;
    } else {
      action = "ticket-transition";
      // El origen es la fase anterior de la serie que este lector armó, o
      // `desconocido` cuando la serie no arranca en una creación.
      const anterior = ultimaFase ?? "desconocido";
      const motivo = motivoDelPayload(fila.kind, payload);
      details = `Workflow: ${anterior} -> ${fase}.${motivo === null ? "" : ` ${motivo}`}`;
    }

    const actor = payload["actor"];
    eventos.push({
      kind: "ticket-event",
      id: `KANBAN-${fila.id}`,
      date: at === null ? "" : at.slice(0, 10),
      actor: typeof actor === "string" && actor !== "" ? actor : "kanban",
      action,
      details,
      // Sin hora el tramo queda declarado no reconstruible: se omite `at` en vez
      // de estimarlo.
      ...(at === null ? {} : { at }),
    });
    ultimaFase = fase;
  }

  return eventos;
}

/**
 * La base del board, cargada **de forma perezosa**.
 *
 * `node:sqlite` es un módulo del núcleo de Node 22+, y cargarlo en la cúpula del
 * archivo rompe el empaquetador de los tests, que intenta resolver `node:sqlite`
 * como un paquete y falla porque solo quita el prefijo `node:`. Con
 * `createRequire` la carga ocurre dentro de la función, ya en Node de verdad, y
 * quien importe el adapter no arrastra el módulo. Es el mismo patrón que
 * `packages/server/src/timeline.ts:34-59`.
 */
type BaseDeDatos = import("node:sqlite").DatabaseSync;
type ConstructorDeBase = typeof import("node:sqlite").DatabaseSync;

function cargarSqlite(): ConstructorDeBase | null {
  try {
    const requerir = createRequire(import.meta.url);
    const modulo = requerir("node:sqlite") as { DatabaseSync: ConstructorDeBase };
    return modulo.DatabaseSync;
  } catch {
    // Una versión de Node sin `node:sqlite` no es un fallo: la línea de fases del
    // board es una capacidad añadida, y sin ella el resto funciona igual.
    return null;
  }
}

/**
 * Los eventos de fase de una tarjeta del board, en la forma del registro.
 *
 * Devuelve `null` cuando no hay base que leer, cuando `node:sqlite` no está
 * disponible o cuando la consulta falla —tabla ausente, base ilegible—: es
 * distinto de `[]`, que dice que la base se leyó y esa tarjeta no tiene filas.
 * Así el consumidor puede declarar la ausencia y no disfrazarla de un cero.
 */
export function leerEventosDeFaseKanban(
  board: string,
  taskId: string,
  options: { readonly home?: string } = {},
): readonly JsonObject[] | null {
  const ruta = kanbanDbPath(board, options.home);
  if (!existsSync(ruta)) return null;
  const DatabaseSync = cargarSqlite();
  if (DatabaseSync === null) return null;

  let db: BaseDeDatos | null = null;
  try {
    // Solo lectura: el board lo escribe el dispatcher y el harness lo observa.
    db = new DatabaseSync(ruta, { readOnly: true });
    const filas = db
      .prepare(
        "SELECT id, kind, payload, created_at FROM task_events " +
          "WHERE task_id = ? ORDER BY created_at ASC, id ASC",
      )
      .all(taskId) as unknown as EventoDelBoard[];
    return eventosDeFaseDeFilas(filas);
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Las tarjetas del board que nombran un ticket, la más vieja primero.
 *
 * Devuelve **todas** las coincidencias y no elige una: un ticket trabajado en dos
 * jornadas tiene dos tarjetas, y quedarse con una parte la línea en dos. `null`
 * cuando no hay base legible; `[]` cuando la base se lee y ninguna tarjeta nombra
 * el ticket.
 */
export function tareasDeTicketKanban(
  board: string,
  ticketId: string,
  options: { readonly home?: string } = {},
): readonly string[] | null {
  const ruta = kanbanDbPath(board, options.home);
  if (!existsSync(ruta)) return null;
  const DatabaseSync = cargarSqlite();
  if (DatabaseSync === null) return null;

  let db: BaseDeDatos | null = null;
  try {
    db = new DatabaseSync(ruta, { readOnly: true });
    const filas = db
      .prepare(
        "SELECT id FROM tasks WHERE instr(title, ?) > 0 OR instr(body, ?) > 0 " +
          "ORDER BY created_at ASC, id ASC",
      )
      .all(ticketId, ticketId) as unknown as { id: number | string }[];
    return filas.map((fila) => String(fila.id));
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
