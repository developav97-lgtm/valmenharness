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
 * 2. **El vocabulario.** Los nueve estados del board —`triage`, `todo`,
 *    `scheduled`, `ready`, `running`, `blocked`, `review`, `done`, `archived`— y
 *    los once del registro solo coinciden literalmente en dos nombres (`blocked`
 *    y `changes_requested`), de modo que traducir por parecido de nombres no
 *    alcanza: la equivalencia tiene que estar escrita (las dos tablas de abajo).
 *    La creación abre la serie en `intake` —es lo que el consumidor deriva de
 *    `action: "created"`— y el estado con el que la tarjeta nació, cuando no es
 *    `intake`, lo emite la transición que le sigue: el `details` de la creación
 *    no puede ser el único lugar donde ese estado queda dicho.
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
 * El texto de una clave del payload, o `null` si no es un texto no vacío.
 *
 * Las tablas que traducen por payload —el estado que el board dejó en `status`,
 * `new_status` o `retry_status`— separan «la clave viene con un texto» de «la
 * clave falta o no es un texto», que es cuando el default o el descarte aplican.
 */
function textoDelPayload(payload: JsonObject, clave: string): string | null {
  const valor = payload[clave];
  return typeof valor === "string" && valor !== "" ? valor : null;
}

/**
 * Tabla 1: tipo de evento del board → estado del board.
 *
 * Va escrita y no traducida por parecido porque los dos vocabularios solo
 * coinciden en dos nombres. Devuelve `null` cuando el tipo no está en la tabla —o
 * cuando el tipo trae su destino en el payload y no lo trae—: no es fase y no
 * corta la serie.
 */
function estadoDelBoard(kind: string, payload: JsonObject): string | null {
  switch (kind) {
    // La creación de la tarjeta y las filas que la devuelven al pool traen su
    // destino en `status` (`kanban_db.py:1389`, `:3684`, `:3725`, `:3804`); en
    // `unblocked` la fuente omite el payload cuando el destino ES `ready`
    // (`kanban_db.py:3684`), así que el default `ready` no es un invento.
    case "created":
    case "unblocked":
    case "review_reopened":
    case "status":
      return textoDelPayload(payload, "status") ?? "ready";
    // El descendiente invalidado al reabrir un ancestro trae su destino en
    // `new_status` (`kanban_db.py:3797`); la misma fuente anexa además la fila
    // `status` con el mismo destino, que entonces no agrega fase.
    case "descendant_invalidated":
      return textoDelPayload(payload, "new_status") ?? "todo";
    case "promoted":
    case "promoted_manual":
      return "ready";
    case "dependency_wait":
      return "todo";
    // La tarjeta especificada sale de `triage` hacia `todo` (`kanban_db.py:3843`).
    case "specified":
      return "todo";
    case "scheduled":
      return "scheduled";
    case "claimed":
    case "spawned":
      return "running";
    case "blocked":
      return "blocked";
    // El ciclo de bloqueos agotado manda la tarjeta a `triage` (`kanban_db.py:3333`).
    case "block_loop_detected":
      return "triage";
    // El breaker del dispatcher deja la tarjeta bloqueada cuando suelta el run
    // —`UPDATE tasks SET status = 'blocked'` (`kanban_db_dispatch.py:1421`)— y
    // recién ahí escribe la fila `gave_up` (`kanban_db_dispatch.py:1455`).
    case "gave_up":
      return "blocked";
    case "review_requested":
      return "review";
    case "changes_requested":
      return "changes_requested";
    case "completed":
      return "done";
    // La tarjeta archivada salió del tablero y el board no la deja volver
    // (`WHERE id = ? AND status != 'archived'`, `kanban_db.py:3906`), así que es
    // el estado terminal suyo.
    case "archived":
      return "archived";
    // Finales de un run que devuelven la tarjeta a la fase de donde salió y el
    // payload dice cuál —`reclaimed` (`kanban_db.py:2498`), `timed_out`
    // (`kanban_db_dispatch.py:720`), `stale` (`:825`)—; una fila de esa familia
    // sin `retry_status` no dice a dónde volvió la tarjeta, así que no se
    // traduce: inventarle un `ready` pondría una fase que no pasó.
    case "reclaimed":
    case "crashed":
    case "stale":
    case "timed_out":
    case "spawn_failed":
    case "rate_limited":
      return textoDelPayload(payload, "retry_status");
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
    // `done` y `archived` son los terminales del board: la tarjeta archivada
    // salió del tablero y no puede volver (`WHERE id = ? AND status != 'archived'`,
    // `kanban_db.py:3906`), así que no puede quedar con una fase en curso que
    // nadie vive (R-S1-001).
    case "done":
    case "archived":
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
 * Un evento con la forma del registro, o sea lo que `fasesPorTicket` consume.
 *
 * La construcción va en un solo lugar porque la creación y la transición que le
 * sigue salen de la misma fila: dos copias de la forma —el `kind`, el `actor` con
 * su default, el `at` que se omite cuando no hay hora— divergirían a la primera
 * corrección. El `id` llega del llamador porque el par de la creación no puede
 * compartir clave.
 */
function eventoDeFase(
  fila: EventoDelBoard,
  payload: JsonObject,
  id: string,
  action: string,
  details: string,
): JsonObject {
  const at = horaISO(fila.created_at);
  const actor = payload["actor"];
  return {
    kind: "ticket-event",
    id,
    date: at === null ? "" : at.slice(0, 10),
    actor: typeof actor === "string" && actor !== "" ? actor : "kanban",
    action,
    details,
    // Sin hora el tramo queda declarado no reconstruible: se omite `at` en vez
    // de estimarlo.
    ...(at === null ? {} : { at }),
  };
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
 * La creación abre la serie en `intake`, que es lo que el consumidor deriva de
 * `action: "created"` sin mirar el estado del payload; si la tarjeta nació en
 * otra fase, la misma fila emite además la transición `intake -> <fase>`, de
 * modo que el estado inicial no queda solo en el `details` de la creación.
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

    if (fila.kind === "created" && !yaEmitioCreacion) {
      yaEmitioCreacion = true;
      eventos.push(
        eventoDeFase(
          fila,
          payload,
          `KANBAN-${fila.id}`,
          "created",
          `Tarjeta creada en el board, en estado ${estado}.`,
        ),
      );
      // La creación deja la última fase vista en `intake`, la que el consumidor
      // va a derivar de esa acción. Con eso, el estado con el que la tarjeta
      // nació —`running` y `blocked` son los dos estados iniciales que el board
      // admite— no se pierde: lo emite la transición que le sigue.
      ultimaFase = "intake";
      if (fase !== "intake") {
        // La segunda emisión de la misma fila lleva su propio `id`: el `id` de
        // un evento identifica un dato, no una fila del board.
        eventos.push(
          eventoDeFase(
            fila,
            payload,
            `KANBAN-${fila.id}-${fase}`,
            "ticket-transition",
            `Workflow: intake -> ${fase}.`,
          ),
        );
        ultimaFase = fase;
      }
      continue;
    }

    // Un evento que no mueve la fase no emite: la serie de fases no tiene
    // escalones de un segundo que nadie vivió.
    if (fase === ultimaFase) continue;

    // El origen es la fase anterior de la serie que este lector armó, o
    // `desconocido` cuando la serie no arranca en una creación.
    const anterior = ultimaFase ?? "desconocido";
    const motivo = motivoDelPayload(fila.kind, payload);
    const details = `Workflow: ${anterior} -> ${fase}.${motivo === null ? "" : ` ${motivo}`}`;
    eventos.push(
      eventoDeFase(fila, payload, `KANBAN-${fila.id}`, "ticket-transition", details),
    );
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
