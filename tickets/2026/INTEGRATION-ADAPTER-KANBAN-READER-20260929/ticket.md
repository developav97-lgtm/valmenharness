---
schema_version: 2
id: INTEGRATION-ADAPTER-KANBAN-READER-20260929
title: Leer task_events de kanban.db como eventos de fase
type: INTEGRATION
module: ADAPTER
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-29
updated: 2026-09-30
related_ticket: null
target_release: null
released_in: null
---

# INTEGRATION-ADAPTER-KANBAN-READER-20260929

## Solicitud original

Parte del sprint: Fuente kanban complementaria.
- R-S1-001: Línea de fases por ticket — La API DEBE exponer, para cada ticket del registro, la secuencia de sus fases con hora de inicio, hora de fin y duración, derivada de las transiciones de estado del ticket.
- R-S1-004: Solo lectura y append-only — La línea de fases DEBE derivarse leyendo el registro: la feature no escribe en los
Depende de: FEATURE-CORE-DERIVAR-FASES-20260929.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: el lector de `task_events` del tablero de kanban, en el paquete `adapter` (`packages/adapter/src/kanban.ts`): resuelve la base del board bajo el home, lee las filas de una tarjeta y las traduce a eventos con la forma del bloque `Eventos` del registro (`kind`, `id`, `date`, `actor`, `action`, `details`, `at`) para que los consuma la derivación de fases del engine. No expone ninguna ruta HTTP: el endpoint es `FEATURE-API-KANBAN-FASES-20260929`.
- Usuario o rol afectado: la línea de fases de la pantalla de ticket de Mission Control (feature timeline-fases), para los tickets que corrieron bajo el dispatcher de Hermes; el consumidor directo del lector es el endpoint de fases del eslabón 5.
- Comportamiento actual: `task_events` no tiene lector en el repositorio —`grep -rn kanban packages/*/src` no devuelve ninguna coincidencia— y la derivación de fases (`packages/engine/src/fases.ts`, commit 004932f) reconoce únicamente la forma de los eventos del registro, así que lo que el tablero registra de un ticket despachado no llega a ninguna fase.
- Comportamiento esperado: `leerEventosDeFaseKanban(board, taskId, {home})` devuelve los eventos de fase de la tarjeta en la forma del registro, con los que `fasesPorTicket` produce la secuencia con inicio, fin, duración y fase en curso; `eventosDeFaseDeFilas(filas)` hace la traducción sin tocar el disco; `tareasDeTicketKanban(board, ticketId)` devuelve las tarjetas del board que nombran el ticket; sin base que leer, `null` y no una lista vacía.

## Diagnóstico

- Archivos y flujo investigados: `packages/engine/src/fases.ts:100-119` — `marcaDe` reconoce solo `action: "created"` (abre `intake`) y `action: "ticket-transition"` cuyo `details` matchea `TRANSICION_RE` (`fases.ts:68`, `^Workflow: [a-z_]+ -> ([a-z_]+)\.$`); cualquier otra forma se ignora sin romper la serie (`fases.ts:135-136`), y el instante sale de `Date.parse` sobre `at` (`fases.ts:71-75`), con un tramo sin hora declarado no reconstruible. `packages/core/src/transitions.ts:54-67` — los once estados del registro; `packages/core/src/edit.ts:141` — el `at` ISO que escribe el motor desde 2026-09-26. `packages/adapter/package.json` — el paquete depende solo de `@valmen/core`, y `packages/server/package.json` ya depende de `@valmen/adapter`, así que el eslabón 5 lo consume sin dependencia nueva; `packages/adapter/src/hermes-relay.ts:52` — el adapter ya es el paquete que habla con el entorno de Hermes (escribe el gancho en `~/.hermes/hooks/`). `packages/server/src/timeline.ts:49-59` — la carga perezosa de `node:sqlite` con `createRequire` (en la cúpula rompía trece archivos de tests) y `timeline.ts:224-236` — la apertura en `{ readOnly: true }` con `existsSync` previo y `null` cuando no hay base; `timeline.ts:205-218` — el par `opencodeDbPath`/`hayDatosDeOpencode` es el patrón de la casa para una base ajena bajo el home. Del lado del tablero (fuente de Hermes, fuera del repositorio, en `~/.hermes/installs/<hash>/environments/<hash>/workspace/hermes_cli/`): `kanban_db.py:513` `kanban_db_path` → `kanban_db.py:476,508-510` deja la base en `<home>/.hermes/kanban/boards/<slug>/kanban.db` para un board con nombre y en `<home>/.hermes/kanban.db` para el board `default`; `kanban_db.py:992` — `CREATE TABLE task_events (task_id, run_id, kind, payload, created_at)`; `kanban_db.py:1943-1953` — `_append_event` escribe `created_at = int(time.time())`, o sea epoch en segundos, y `kanban_db.py:1930` — `list_events` ordena por `created_at ASC, id ASC`. La traducción que falta tiene su materia prima medida ahí: `kanban_db.py:103` — `VALID_STATUSES = {triage, todo, scheduled, ready, running, blocked, review, done, archived}`; `kanban_db.py:2348-2354` — `_RUN_OUTCOME_TERMINAL_STATUS` (desenlace del run → estado) y `kanban_db.py:2380-2385` — `goal_run_status` trata la tarjeta en `ready`/`todo` cuyo último evento es `changes_requested` como `changes_requested`. Los eventos que mueven el workflow, con su destino leído en la fuente: `created` (`kanban_db.py:1405-1412`, el estado nace del payload), `promoted` (`kanban_db.py:2186-2190`, `todo`→`ready`), `promoted_manual` (`kanban_db.py:3613-3615`), `dependency_wait` (`kanban_db.py:1678`, democión a `todo`), `claimed` (`kanban_db.py:2262-2265`, `ready`→`running`), `spawned` (`kanban_db_dispatch.py:1473`), `reclaimed` (`kanban_db.py:2527-2530`), `unblocked` (`kanban_db.py:3683-3691`, con el estado de destino en el payload y `ready` por defecto), `blocked` (`kanban_db.py:3294-3298`, con `reason` y `kind` en el payload), `review_requested` (`kanban_db.py:3461-3473`), `changes_requested` (`kanban_db.py:3528-3554`) y `completed` (`kanban_db.py:2805`, estado `done`). Y los que mueven el workflow con el destino escrito en la fuente o en el payload, que la tabla tiene que cubrir y que la ronda 1 de revisión encontró fuera: `specified` (`kanban_db.py:3843`, sale de `triage` hacia `todo`), `block_loop_detected` (`kanban_db.py:3333`, → `triage`), `gave_up` (`kanban_db_dispatch.py:1421`, la tarjeta queda `blocked` y recién ahí se escribe la fila), `archived` (`kanban_db.py:3906`, → `archived`), el descendiente invalidado (`kanban_db.py:3797`) y la fila de feed `status` (`kanban_db.py:3804`), más los finales de run que devuelven la tarjeta a su fase de origen y dejan cuál en `retry_status` (`reclaimed`, `crashed`, `stale`, `timed_out`, `spawn_failed`, `rate_limited`). Y los que no son fase, contados sobre el board de este repositorio: `heartbeat` (618 de las 884 filas de `task_events` al medir) y los de libro (`commented`, `linked`, `model_override_set`, `reprioritized`, `edited`, `assigned`, `terminal_worker_reaped`, `protocol_violation`), que no mueven la tarjeta.
- Causa raíz o hipótesis: el síntoma de este eslabón es que la línea de fases de un ticket despachado por Hermes pierde los tramos que solo existen en el tablero —cuándo lo tomó el dispatcher, cuándo quedó esperando una decisión, cuándo lo mandó a revisión—, y la fuente complementaria que la spec declara para esa línea (`task_events`) no aporta nada. La causa es que falta la traducción entre el board y el registro, y son tres incompatibilidades independientes, cada una suficiente para perder el dato: (1) **la forma** — `fasesPorTicket` consume `action` + `details` en la forma del registro (`fases.ts:100-119`) y una fila de `task_events` es `kind` + `payload` + `created_at` (`kanban_db.py:992`), así que pasarlas sin traducir no produce una fase mal formada sino ninguna fase; (2) **el vocabulario** — los nueve estados del tablero (`kanban_db.py:103`, `archived` incluido) y los once del registro (`transitions.ts:54-67`) solo coinciden literalmente en dos nombres (`blocked` y `changes_requested`), de modo que traducir por parecido no alcanza y la equivalencia tiene que estar escrita; (3) **la unidad de hora** — `created_at` es epoch en segundos (`kanban_db.py:1952`) y el registro guarda ISO 8601, que es lo que `Date.parse` interpreta (`fases.ts:71-75`): pasar el entero tal cual deja todos los tramos en `null`, con la forma de un hueco de datos que nadie escribió. Por eso no alcanza con un `SELECT` sobre `task_events`: hace falta una traducción explícita, y su lugar es el paquete `adapter`, que es el que ya habla con el entorno de Hermes (`adapter/src/hermes-relay.ts:52`) y del que el servidor ya depende, sin agregar ninguna dependencia porque `node:sqlite` es del núcleo y su carga perezosa ya está resuelta en la casa (`server/src/timeline.ts:49-59`).
- Riesgos y compatibilidad: cambio de solo lectura sobre un paquete que nadie consume todavía en este camino — el `adapter` solo suma un módulo y su export en `packages/adapter/src/index.ts`, y ningún consumidor actual del adapter cambia. Riesgos acotados: (1) un ticket puede tener más de una tarjeta en el board, una por jornada —medido: `FEATURE-HERMES-PERFIL-PROYECTO-20260926` corrió en dos y tiene dos—, así que la resolución ticket→tarjeta devuelve **todas** las coincidencias y la unión queda del lado del consumidor, en vez de elegir una y perder la mitad de la línea; (2) una versión de Node sin `node:sqlite`, o una base ausente o ilegible, no puede convertirse en una lista vacía que se lea como «no hubo fases»: el lector devuelve `null` y el consumidor declara la ausencia, igual que `GET /api/timeline` con `disponible: false` (`server/src/server.ts:706`); (3) de los eventos de fallo del run se traduce el destino que la fuente sí declara —`gave_up` deja la tarjeta `blocked` y recién ahí se escribe la fila (`kanban_db_dispatch.py:1421`), y los finales que devuelven la tarjeta a la fase de donde salió lo dicen en `retry_status` (`reclaimed`, `crashed`, `stale`, `timed_out`, `spawn_failed`, `rate_limited`)—: una fila de esa familia **sin** `retry_status` no se traduce, porque no dice a dónde volvió la tarjeta y ponerle un `ready` pondría una fase que no pasó. Lo que queda sin traducir, y se declara, son los marcadores de run que no mueven la tarjeta (`protocol_violation`, `terminal_worker_reaped`, `heartbeat`, `commented`, `linked`, `model_override_set`, `reprioritized`, `edited`, `assigned`); (4) lectura concurrente con el dispatcher: la base se abre en `{ readOnly: true }`, como `server/src/timeline.ts:232` con la de opencode, así que el lector no puede bloquear ni modificar el board (R-S1-004); (5) compatibilidad hacia atrás: sin cambios en la derivación ni en el registro, y sin dependencia nueva; (6) la tarjeta archivada cierra su línea con la fase `closed` —el board no deja salir de `archived` (`kanban_db.py:3906`), así que es su estado terminal—, y el precio queda declarado: una tarjeta archivada sin haber pasado por `done` muestra su línea cerrada en vez de una fase en curso que ya nadie vive. Alternativa descartada: dejar `archived` fuera de las tablas, que es lo que la ronda 1 midió como defecto —5 de las 28 tarjetas de las dos bases quedaban con una fase abierta sobre un estado que la traducción no podía alcanzar—.
- Impactos de sync, migración, Docker o despliegue: ninguno — módulo nuevo de solo lectura en el paquete `adapter`: no escribe en `kanban.db` ni en el registro, no hay esquema nuevo, no hay migración, no toca contenedores ni despliegue y no toca el camino de sincronización, que este paquete no usa.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). La autorización anticipada del PO ya fue dada para la tanda de 7 de la feature timeline-fases: «Dale, abrí las 7 tarjetas kanban» (PO por Telegram, 2026-09-30), y el eslabón 4 (este) la replica con su nombre de tarjeta propia —kanban `t_be69706c`—, igual que los eslabones 1 a 3 de la misma tanda.
- Decisiones:
  1. La traducción vive en el paquete `adapter` (`packages/adapter/src/kanban.ts`), no en `server` ni en `engine`: el `engine` no toca el disco ni la red por invariante del proyecto, el `server` ya depende del `adapter` (`packages/server/package.json`) y el `adapter` es el paquete que ya habla con el entorno de Hermes (`packages/adapter/src/hermes-relay.ts:52` escribe el gancho en `~/.hermes/hooks/`). Alternativa descartada: leer la base desde el endpoint — dejaría el parser del board dentro del paquete que expone HTTP y el mismo encargo quedaría escrito dos veces, una por lector.
  2. **La equivalencia va en una tabla escrita**, de tipo de evento del board → estado del board → fase del registro, en vez de traducir por parecido de nombres: solo `blocked` y `changes_requested` coinciden literalmente entre los dos vocabularios, así que el parecido no alcanza. La tabla es ésta, y va citada en el código: (a) tipo → estado: `created` → el `status` del payload; `promoted` y `promoted_manual` → `ready`; `dependency_wait` → `todo`; `specified` → `todo`; `scheduled` → `scheduled`; `claimed` → `running`; `spawned` → `running`; `reclaimed`, `crashed`, `stale`, `timed_out`, `spawn_failed` y `rate_limited` → el `retry_status` del payload, y no es fase si esa clave falta; `unblocked`, `review_reopened` y `status` → el `status` del payload, o `ready`; `descendant_invalidated` → el `new_status` del payload, o `todo`; `blocked` → `blocked`; `block_loop_detected` → `triage`; `gave_up` → `blocked`; `review_requested` → `review`; `changes_requested` → `changes_requested`; `completed` → `done`; `archived` → `archived`. (b) estado → fase: `triage`, `todo`, `scheduled` y `ready` → `intake`; `running` → `in_progress`; `blocked` → `blocked`; `review` → `awaiting_user_tests`; `changes_requested` → `changes_requested`; `done` y `archived` → `closed`. Cualquier otro tipo o estado no es fase. Corrección de la ronda 1 de revisión: el conteo decía ocho estados y son **nueve** (`archived` incluido, `kanban_db.py:103`), y faltaban los tipos que mueven la tarjeta con el destino escrito en la fuente o en el payload (`status`, `review_reopened`, `descendant_invalidated` y los de la familia de `retry_status`, más `specified`, `block_loop_detected`, `gave_up` y `archived`), que la revisión encontró midiendo las dos bases reales: 5 de las 28 tarjetas terminaban con una fase abierta que la traducción no podía cerrar.
  3. Un evento que no mueve la fase no emite nada: `heartbeat` es la mayoría de las filas del board de este repositorio (618 de 884) y `claimed` seguido de `spawned` es la misma fase. Alternativa descartada: una fase por fila — dejaría tramos de un segundo que nadie vivió y la banda de la pantalla los pintaría como fases.
  4. El evento que sí mueve la fase se emite con la forma que la derivación ya reconoce: `action: "created"` para la creación y `action: "ticket-transition"` con `details` con la forma `Workflow: <fase-anterior> -> <fase-nueva>.` para el resto, con el motivo del payload (`reason` de `blocked` y de `changes_requested`) después del punto, que es lo que llena el `motivo` de `FaseDeTicket` (`packages/engine/src/fases.ts:49-54`); el origen es la fase anterior de la serie que el propio lector armó, y el token `desconocido` cuando la serie no arranca en un evento de creación. Alternativa descartada: devolver una forma propia del board y traducirla en el endpoint — dos formas para el mismo dato y el engine sin poder consumirlo. Corrección de la ronda 1 de revisión: la creación abre la serie en `intake` —es lo que `marcaDe` deriva de `action: "created"` sin mirar el estado del payload (`fases.ts:104-106`)— y el estado con el que la tarjeta nació, cuando no es `intake` (`running` y `blocked` son los dos estados iniciales que el board admite, `kanban_db.py:104`), lo emite la transición que le sigue, así que el par puede salir de una misma fila y no comparte clave: `KANBAN-<id>` para la creación y `KANBAN-<id>-<fase>` para esa transición. Antes, una tarjeta creada en `blocked` conservaba esa fase como «última vista» y la transición siguiente decía `Workflow: blocked -> intake.` sobre una serie que nunca había tenido un `blocked`.
  5. La hora se convierte en el lector: `created_at` llega en segundos epoch (`kanban_db.py:1952`) y sale como ISO 8601 (`new Date(created_at * 1000).toISOString()`), que es lo que interpreta `Date.parse` (`packages/engine/src/fases.ts:71-75`); una fila sin hora numérica utilizable sale sin `at`, y su tramo queda declarado no reconstruible. Alternativa descartada: estimar la hora de un tramo que no la trae — el motor no rellena huecos a propósito (`fases.ts:19-21`).
  6. La resolución ticket→tarjeta devuelve **todas** las tarjetas que nombran el ticket, la más vieja primero, y no una sola: un ticket trabajado en dos jornadas tiene dos tarjetas —medido: `FEATURE-HERMES-PERFIL-PROYECTO-20260926`— y elegir una parte la línea en dos. Alternativa descartada: devolver la más nueva — pierde la jornada anterior sin decirlo.
  7. La parte pura (filas → eventos) se separa del I/O: `eventosDeFaseDeFilas` no abre la base ni importa `node:sqlite`, así que la traducción —que es el valor del ticket— se prueba en cualquier versión de Node y el `skipIf(sqlite() === null)` queda solo para los casos que abren la base. La lección del eslabón 3: una prueba entera debajo del `skipIf` pasa en verde sin comprobar nada (`tests/readonly-fases.test.ts:359-365`).
  8. Sin base que leer, `null`; con base legible y sin filas de esa tarjeta, `[]`. Es la distinción que ya hace `GET /api/timeline` con `disponible: false` (`packages/server/src/server.ts:706`) y evita que la pantalla lea una ausencia como un cero.
  9. La base se abre en `{ readOnly: true }` y se resuelve bajo el home que el lector recibe como parámetro —el mismo encargo que `packages/server/src/timeline.ts:224-236` hace con la base de opencode—: el board lo escribe el dispatcher y R-S1-004 prohíbe tocarlo. La ruta es la del board: `<home>/.hermes/kanban/boards/<slug>/kanban.db` para un board con nombre y `<home>/.hermes/kanban.db` para el board `default` (`kanban_db.py:508-510`), que es la que ya planta la suite del eslabón 3 (`tests/readonly-fases.test.ts:92-94`).
- Pasos ordenados:
  1. `packages/adapter/src/kanban.ts` (nuevo) — exportar: (a) `kanbanDbPath(board, home?)` y `hayBaseDeKanban(board, home?)` con la resolución de la decisión 9; (b) el tipo `EventoDelBoard { id: number | string; kind: string; payload: string | null; created_at: number }`; (c) `eventosDeFaseDeFilas(filas)`, pura — recorre las filas en el orden recibido, traduce con las dos tablas de la decisión 2, salta las que no mueven fase y emite `kind: "ticket-event"`, `id: "KANBAN-<id de la fila>"` —salvo la transición que sale de la misma fila que la creación, que lleva `KANBAN-<id>-<fase>` por la decisión 4—, `date` con los diez primeros caracteres del `at`, `actor` con el `actor` del payload o `"kanban"`, y `action`, `details` y `at` según las decisiones 3, 4 y 5; (d) `leerEventosDeFaseKanban(board, taskId, { home })`, que abre la base en sola lectura con la carga perezosa de `node:sqlite` (`createRequire` dentro de la función, nunca en la cúpula de `server/src/timeline.ts:34-45`), consulta `SELECT id, kind, payload, created_at FROM task_events WHERE task_id = ? ORDER BY created_at ASC, id ASC` y devuelve `null` si no hay base, no hay módulo o la tabla no existe; (e) `tareasDeTicketKanban(board, ticketId, { home })`, que consulta `SELECT id FROM tasks WHERE instr(title, ?) > 0 OR instr(body, ?) > 0 ORDER BY created_at ASC` y devuelve `null` si no hay base. Más `packages/adapter/src/index.ts:14` — `export * from "./kanban.js";` junto a los demás.
  2. `tests/eventos-fase-kanban.test.ts` (nuevo, el archivo que anotan los criterios): plantar la base del board del laboratorio en un `HOME` aislado —`<lab>/.hermes/kanban/boards/valmen-harness/kanban.db` con el esquema real (`tasks(id, title, body, created_at)` y `task_events(id INTEGER PRIMARY KEY AUTOINCREMENT, task_id, run_id, kind, payload, created_at)`); el laboratorio planta **solo la base**, porque el lector no necesita el archivo de metadatos que el tablero guarda al lado— y cubrir: (a) una tarjeta despachada (`created` en `ready`, `promoted`, `claimed`, `spawned`, `blocked` con `reason`, `unblocked`, `review_requested`, `completed`) cuyos eventos alimentan `fasesPorTicket` y producen la secuencia con inicio, fin, duración y `enCurso`; (b) `heartbeat`, `commented` y `model_override_set` no abren fase y `claimed` seguido de `spawned` es una sola; (c) `blocked` con `reason` da la fase `blocked` con su motivo y `changes_requested` su fase propia con el suyo; (d) sin base, `leerEventosDeFaseKanban` devuelve `null` y el board `default` se resuelve en la ruta heredada; (e) `tareasDeTicketKanban` encuentra la tarjeta por el título y por el cuerpo, y con dos coincidencias devuelve las dos, la más vieja primero; (f) el hash de `kanban.db` queda igual después de leer las fases y de resolver la tarjeta; (g) una tarjeta archivada cierra su línea —y ninguna tarjeta con un estado final que la tabla alcanza queda con una fase abierta— y una creada en `blocked` no inventa el origen de su primera transición; (h) los tipos que traen su destino en el payload (`gave_up`, `unblocked`, `specified`, `block_loop_detected`, `review_reopened`, `descendant_invalidated`, `status`) producen su fase y las filas repetidas no la duplican. Los casos (a), (b), (c), (g) y (h) van fuera del `skipIf` porque no abren la base: `eventosDeFaseDeFilas` es pura. Los casos (g) y (h) son la corrección de la ronda 1 de revisión.
  3. `npx vitest run tests/eventos-fase-kanban.test.ts`, y después `npx vitest run`, `npm run typecheck` y `npm run lint` sobre el árbol final: los tres tienen que quedar en verde antes de la entrega.
- Rollback: revertir los commits del ticket saca el módulo nuevo, su export y su suite de una sola vez; no hay estado que restaurar porque el lector no escribe —ni el board ni el registro— y el `dist` del `adapter` se regenera con `npm run build`. Ningún consumidor actual del `adapter` cambia, la derivación del engine queda intacta y no hay nada que volver a migrar.
- Cobertura de requisitos (la parte kanban): R-S1-001 — la secuencia de fases con hora de inicio, hora de fin, duración y fase en curso, derivada de las transiciones de estado registradas en `task_events` (la fuente primaria del registro la cubre el eslabón 1 y el endpoint que expone la línea, los eslabones 2 y 5). R-S1-004 — solo lectura y append-only: el lector abre `kanban.db` en modo lectura y no escribe ni en el board ni en el registro.
- Evaluador de esta compuerta: se corrió primero la cascada verificada —el artefacto tiene sustancia, es un cambio de código y su veredicto cierra la transición— y el juez superó su tiempo máximo de 180 s sin producir veredicto ni recibo; como el estado del artefacto no cambió desde esa corrida, se evaluó con el evaluador de siempre, que es la excepción que el propio estándar del proyecto declara (`.valmen/rules/estandares-proceso.md`). El recibo guarda el evaluador que resolvió.

## Criterios de aceptación

- [x] R-S1-001: `leerEventosDeFaseKanban` traduce `task_events` a eventos con la forma del registro y `fasesPorTicket` produce con ellos la secuencia de fases de la tarjeta —inicio, fin, duración y fase en curso—, con `tests/eventos-fase-kanban.test.ts` afirmando los tramos de una tarjeta creada, despachada y cerrada.
  <!-- test: npx vitest run tests/eventos-fase-kanban.test.ts -->
- [x] R-S1-001: Un evento del board que no mueve el workflow —`heartbeat`, `commented`, `model_override_set`— no abre ni cierra fase, y `claimed` seguido de `spawned` produce una sola fase, en `tests/eventos-fase-kanban.test.ts`.
  <!-- test: npx vitest run tests/eventos-fase-kanban.test.ts -->
- [x] R-S1-001: Un `blocked` con `reason` en el payload produce la fase `blocked` con ese motivo, y un `changes_requested` produce su fase propia con el suyo, en `tests/eventos-fase-kanban.test.ts`.
  <!-- test: npx vitest run tests/eventos-fase-kanban.test.ts -->
- [x] R-S1-001: Sin base que leer el lector devuelve `null` y no una lista vacía, y el board con slug se resuelve en su carpeta mientras el board `default` se resuelve en la ruta heredada, en `tests/eventos-fase-kanban.test.ts`.
  <!-- test: npx vitest run tests/eventos-fase-kanban.test.ts -->
- [x] R-S1-001: `tareasDeTicketKanban` devuelve las tarjetas que nombran el ticket en el título o en el cuerpo, todas las coincidencias y la más vieja primero, en `tests/eventos-fase-kanban.test.ts`.
  <!-- test: npx vitest run tests/eventos-fase-kanban.test.ts -->
- [x] R-S1-004: Leer el board es solo lectura —la base se abre en modo lectura— y el hash de `kanban.db` queda igual después de derivar las fases y de resolver la tarjeta, en `tests/eventos-fase-kanban.test.ts`.
  <!-- test: npx vitest run tests/eventos-fase-kanban.test.ts -->
- [x] R-S1-001: Una tarjeta archivada cierra su línea con la fase `closed`, una tarjeta creada en `blocked` no inventa el origen de su primera transición, y ninguna tarjeta cuyo estado final ya alcanza la tabla queda con una fase abierta —medido sobre las 28 tarjetas de las dos bases reales—, en `tests/eventos-fase-kanban.test.ts`.
  <!-- test: npx vitest run tests/eventos-fase-kanban.test.ts -->
- [x] R-S1-001: Los tipos del board que traen su destino en el payload o en la fuente —`gave_up`, `unblocked`, `specified`, `block_loop_detected`, `review_reopened`, `descendant_invalidated`, `status`— producen la fase que declaran, y las filas repetidas no duplican la fase, en `tests/eventos-fase-kanban.test.ts`.
  <!-- test: npx vitest run tests/eventos-fase-kanban.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Cambio: `packages/adapter/src/kanban.ts` (nuevo, 335 líneas) —el lector—, `packages/adapter/src/index.ts` (una línea: `export * from "./kanban.js";`) y `tests/eventos-fase-kanban.test.ts` (nuevo, 7 casos, 456 líneas —el conteo de 403 líneas que este registro declaraba era del archivo previo al `--write` del verificador—). No se tocó `packages/engine/**` ni `packages/server/**`: `fasesPorTicket` ya consumía eventos con la forma del registro, y lo que faltaba era entregarle los del board en esa forma.
- Qué expone el módulo: `kanbanDbPath` —el board con nombre en `<home>/.hermes/kanban/boards/<slug>/kanban.db` y el `default` en la ruta heredada `<home>/.hermes/kanban.db`—, `hayBaseDeKanban`, `EventoDelBoard`, `eventosDeFaseDeFilas` (pura: filas → eventos de fase, sin tocar el disco), `leerEventosDeFaseKanban` (abre en `{ readOnly: true }`, cierra en `finally`, y devuelve `null` —no `[]`— cuando no hay base, no hay `node:sqlite` o la consulta falla) y `tareasDeTicketKanban` (todas las tarjetas que nombran el ticket, la más vieja primero).
- La traducción, que es lo que este ticket paga: las dos tablas escritas (tipo del board → estado del board; estado → fase del registro), el cambio de unidad de hora (segundos epoch → ISO 8601, sin estimar el tramo que no trae hora utilizable) y la emisión **solo cuando la fase cambia**, para que `claimed` seguido de `spawned` sea una sola fase y los `heartbeat` no abran escalones de un segundo. `node:sqlite` se carga con `createRequire(import.meta.url)` dentro de la función, como `packages/server/src/timeline.ts:34-59`, para no romper el empaquetador de los tests.
- Casos: 9 —los 7 de la entrega más los dos de la ronda 1 de revisión, que corren fuera del `skipIf`—, y solo los tres que abren la base van bajo `describe.skipIf(sqlite() === null)`; los de traducción pura corren en cualquier versión de Node. Es la lección del eslabón 3: un archivo entero bajo el `skipIf` pasa en verde sin comprobar nada.
- Corrección del verificador, nombrada acá porque el commit le atribuye a la sesión lo que escribió el verificador: `npx prettier --write tests/eventos-fase-kanban.test.ts` sobre la entrega del ejecutor —el archivo no pasaba `--check`— y la suite focal y la batería corridas de nuevo sobre el archivo ya formateado. No hubo corrección de contenido.
- La corrida contra el board real, que es lo que saca al lector del laboratorio: sobre `~/.hermes/kanban/boards/valmen-harness/kanban.db`, `tareasDeTicketKanban("valmen-harness", "INTEGRATION-ADAPTER-KANBAN-READER-20260929")` devuelve `["t_be69706c"]` y `leerEventosDeFaseKanban` sobre esa tarjeta devuelve sus dos eventos de fase; con `fasesPorTicket` sale `intake` (2026-09-30T20:25:22Z → 2026-10-01T03:39:24Z, 26 042 000 ms) y `in_progress` en curso. La leyó un `vite-node` sobre el módulo, con el home real de la máquina. Hoy la misma tarjeta da **seis** eventos de fase —los dos de la entrega más `awaiting_user_tests`, la vuelta a `in_progress` del claim de la revisión, `changes_requested` y el `in_progress` de esta corrida—, que es lo que la ronda 1 midió como cuatro y el flujo sumó después.
- Corrección de la ronda 1 de revisión (el retrabajo lo escribió OpenCode `ses_f0a4aa790ffeZgAVjgMtQzHimg` sobre el alcance cerrado que le pasó esta sesión, y la verificación es la de `## Pruebas`): (a) `archived` entra en las dos tablas —los estados del board son **nueve**, no ocho— y cierra la línea con la fase `closed`, que es el estado del que el board no deja volver (`kanban_db.py:3906`); (b) entran los tipos que mueven la tarjeta y traen el destino en el payload (`status`, `review_reopened`, `descendant_invalidated`) y los que lo traen en la fuente (`specified`, `block_loop_detected`, `gave_up`, `archived`, más los finales de run que dejan en `retry_status` la fase de origen: `reclaimed`, `crashed`, `stale`, `timed_out`, `spawn_failed`, `rate_limited`); (c) la creación abre la serie en `intake` y el estado con el que la tarjeta nació, cuando no es `intake`, lo emite la transición que le sigue, con `KANBAN-<id>-<fase>` para no compartir clave con la creación —antes, una tarjeta creada en `blocked` emitía un `Workflow: blocked -> intake.` sobre una serie que nunca había tenido un `blocked`, que es la observación menor de la revisión—; y (d) el laboratorio queda declarado como lo que es: planta **solo la base**, sin el archivo de metadatos que el tablero guarda al lado, que era el aviso de `valmen drift` sobre el `## Plan`.
- La medición que cierra el hallazgo 1, hecha por esta sesión sobre las dos bases reales de la máquina: de las 28 tarjetas, **5** tenían un estado final que la traducción no podía alcanzar y quedaban con una fase abierta para siempre (todas `archived`, todas del board `saiopencloud`); con el lector corregido son **0**. La reproducción del revisor —`leerEventosDeFaseKanban("saiopencloud","t_637b7bed")` + `fasesPorTicket` → `intake -> intake (en curso)`— hoy devuelve `intake -> blocked -> intake -> closed`, sin ninguna fase en curso, para una tarjeta creada directamente en `blocked`, programada y archivada.

## Pruebas

- Comandos corridos por la sesión del eslabón, no reportados por el ejecutor:
  1. `npx vitest run tests/eventos-fase-kanban.test.ts` → `Test Files 1 passed (1)` · `Tests 7 passed (7)`, sobre el archivo ya formateado.
  2. `npx vitest run` → `Test Files 88 passed | 1 skipped (89)` · `Tests 1653 passed | 48 skipped (1701)` (51,86 s de duración).
  3. `npm run typecheck` (`tsc --build tsconfig.build.json` + `tsc --noEmit -p tsconfig.json`) → sin errores.
  4. `npx eslint packages/adapter/src/kanban.ts packages/adapter/src/index.ts tests/eventos-fase-kanban.test.ts` → exit 0. `npm run lint` sobre el repo entero da 4 errores **preexistentes** en archivos que este ticket no toca (`packages/engine/src/evaluators.ts` dos veces, `tests/eventos-con-hora.test.ts`, `tests/mcp-server.test.ts`): `git diff HEAD` sobre ellos está vacío, así que vienen de HEAD y no de este cambio.
  5. `npx prettier --check` sobre los tres archivos → `All matched files use Prettier code style!`.
- Sensibilidad de la suite —que no pase por vacía—: la corrida contra el board real (arriba) prueba el lector sobre datos que la suite no escribió —las dos fases que salen son las que el tablero registró para `t_be69706c`—, y en el laboratorio el caso `(a-bis)` lee la base plantada y compara la salida del lector con la de la traducción pura, así que una consulta rota o un orden cambiado lo dejan rojo.
- Ambiente: macOS, vitest 2.1.9, Node 22 con `node:sqlite`; el laboratorio es un `mkdtempSync` con el `HOME` aislado y restaurado en `afterEach`, así que las pruebas no tocan el board real de la máquina.
- Los 8 criterios declaran `test:` y quedan tildados; este ticket no tiene ningún `verify: manual`.
- Ronda 1 de retrabajo — comandos corridos de nuevo por esta sesión sobre el árbol corregido, no reportados por el ejecutor:
  1. `npx vitest run tests/eventos-fase-kanban.test.ts` → `Test Files 1 passed (1)` · `Tests 9 passed (9)`.
  2. `npx vitest run` → `Test Files 88 passed | 1 skipped (89)` · `Tests 1655 passed | 48 skipped (1703)`, dos más que la entrega, que son los casos nuevos.
  3. `npm run typecheck` (`tsc --build tsconfig.build.json` + `tsc --noEmit -p tsconfig.json`) → sin errores.
  4. `npx eslint packages/adapter/src/kanban.ts packages/adapter/src/index.ts tests/eventos-fase-kanban.test.ts` → exit 0; `npm run lint` sobre el repo entero sigue dando los mismos 4 errores preexistentes en archivos que `git diff HEAD~` no toca.
  5. `npx prettier --check` sobre los tres archivos → `All matched files use Prettier code style!`.
- La medición contra las dos bases reales que cierra el hallazgo 1, con su antes: con el lector de `HEAD` —el entregado— 5 de las 28 tarjetas quedaban con una fase abierta sobre un estado final que la tabla no alcanzaba, y las 5 eran `archived`; con el corregido son 0. La reproducción del revisor —`t_637b7bed`, archivada, creada directamente en `blocked`— pasa de `intake -> intake (en curso)` a `intake -> blocked -> intake -> closed`, sin ninguna fase abierta. Los dos `vite-node` que la miden viven en el scratch de la sesión, no en el repo, y la corrida del «antes» usó una copia del módulo de `HEAD` en `node_modules/.tmp-revision/`, ya borrada.
- El gate mecánico no se puede volver a correr sobre este árbol, y el intento queda escrito con lo que el motor contestó, no con una suposición: `valmen gate qa-mechanical --id INTEGRATION-ADAPTER-KANBAN-READER-20260929` → «El gate qa-mechanical protege la transición in_progress → awaiting_user_tests y solo aplica a un ticket en `in_progress`. El ticket INTEGRATION-ADAPTER-KANBAN-READER-20260929 está en `awaiting_user_tests`. Evaluarlo aquí produciría un veredicto sin significado.» Los 8 criterios quedan tildados por el resultado de los comandos de arriba, que es lo que ese gate corre, así que la ronda 2 de revisión los puede verificar por recibo cuando el estado vuelva a `in_progress`.

## QA

```json
[]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-01",
    "kind": "automated-test",
    "description": "Lector de task_events del board: npx vitest run tests/eventos-fase-kanban.test.ts -> 7/7 (28 ms); npx vitest run -> 88 archivos en verde, 1653 pruebas pasadas y 48 omitidas; npm run typecheck -> sin errores; npx eslint de los tres archivos del ticket -> exit 0; npx prettier --check -> sin diferencias. Sensibilidad sobre el board real de la maquina, que la suite no escribio: tareasDeTicketKanban(\"valmen-harness\", \"INTEGRATION-ADAPTER-KANBAN-READER-20260929\") devuelve [\"t_be69706c\"] y leerEventosDeFaseKanban sobre esa tarjeta da sus dos fases (intake 2026-09-30T20:25:22Z -> 2026-10-01T03:39:24Z, 26042000 ms, e in_progress en curso). El arbol hasheado son los tres archivos del ticket en orden alfabetico: packages/adapter/src/index.ts, packages/adapter/src/kanban.ts y tests/eventos-fase-kanban.test.ts.",
    "reference": "worktree:sha256:eb447ab50034750bc4e53253816431632e02ba0325531e8c9d1ed821ce4ae44a",
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-01",
    "kind": "automated-test",
    "description": "Retrabajo de la ronda 1 del lector de task_events del board: npx vitest run tests/eventos-fase-kanban.test.ts -> 9/9; npx vitest run -> 88 archivos en verde, 1655 pruebas pasadas y 48 omitidas; npm run typecheck -> sin errores; npx eslint de los tres archivos del ticket -> exit 0; npx prettier --check -> sin diferencias. Medicion sobre los dos boards reales de la maquina, que la suite no escribio: con el lector de HEAD 5 de las 28 tarjetas quedaban con una fase abierta sobre un estado final que la tabla no alcanzaba (las 5 archived, del board saiopencloud) y con el corregido son 0; la tarjeta archivada t_637b7bed, creada directamente en blocked, pasa de intake -> intake (en curso) a intake -> blocked -> intake -> closed. El arbol hasheado son los tres archivos del ticket en orden alfabetico: packages/adapter/src/index.ts, packages/adapter/src/kanban.ts y tests/eventos-fase-kanban.test.ts.",
    "reference": "worktree:sha256:959b7d85d5cfbd158d55010dfcb92d844cf824a6cef6ba55ad2bf8c937493ae8",
    "point_id": null
  }
]
```

## Retests

```json
[]
```

## Cierre

```json
[]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-01",
    "session_reference": "ses_f0a645922ffe8bJLNOsf3SDOou",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion OpenCode de implementacion del eslabon 4: escribio packages/adapter/src/kanban.ts (el lector), el export de packages/adapter/src/index.ts y los 7 casos de tests/eventos-fase-kanban.test.ts, y corrio la suite focal, la bateria, el typecheck y el lint. 20620 tokens de razonamiento, que entran en el total de 133501. El costo y los tokens salen de la fila de session_v2 de opencode.db.",
    "input_tokens": 101265,
    "output_tokens": 11616,
    "total_tokens": 133501,
    "estimated_cost_usd": 0.038222742,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-01",
    "session_reference": "20260930_223926_1cc0ad",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion Hermes del eslabon 4, kanban t_be69706c: diagnostico del ticket, compuertas analysis (cascade) y plan, lanzamiento y verificacion de la sesion de OpenCode, formato del archivo de pruebas, corrida contra el board real y entrega. Lectura de session_model_usage al momento de registrar: la fila crece hasta que el turno termina. Proveedor opencode-go por suscripcion, la base no calcula el costo (0).",
    "input_tokens": 323480,
    "output_tokens": 77363,
    "total_tokens": 454536,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-01",
    "session_reference": "ses_f0a4bfc2affe7pXmBHZHJzIoMT",
    "model": "openai/gpt-6.1-sol",
    "reasoning_effort": null,
    "notes": "Primera corrida del ejecutor de esta ronda: arranco con el modelo por defecto del CLI (openai/gpt-6.1-sol, el log la muestra asi) y no con el del brief (opencode-go/deepseek-v4.1-flash), asi que se detuvo a los pocos minutos. Dejo escrito un bloque de casos en tests/eventos-fase-kanban.test.ts, que se revirtio con git checkout antes de relanzar: de esa corrida no quedo ningun archivo. El total son entrada + salida + razonamiento.",
    "input_tokens": 24,
    "output_tokens": 3211,
    "total_tokens": 3484,
    "estimated_cost_usd": 0.1750737,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-003"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-01",
    "session_reference": "ses_f0a4aa790ffeZgAVjgMtQzHimg",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion de OpenCode del retrabajo de la ronda 1, con el modelo del brief: escribio la correccion del lector (archived en las dos tablas, los tipos que traen el destino en el payload o en la fuente, la creacion que abre intake y la clave del par) y los dos casos nuevos de la suite; corrio la focal, la bateria y el typecheck. Esta sesion de Hermes corrio todo de nuevo sobre el mismo arbol. El total son entrada + salida + razonamiento.",
    "input_tokens": 139005,
    "output_tokens": 15544,
    "total_tokens": 213272,
    "estimated_cost_usd": 0.077279136,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-004"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-01",
    "session_reference": "20260930_231430_ab1012",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion de Hermes del retrabajo de la ronda 1: cerro el alcance, lanzo y vigilo el ejecutor, verifico el arbol corregido por comando, midio los dos boards reales y escribio el registro. Numeros leidos de session_model_usage al cerrar la corrida (100 llamadas del turno + 1 de compresion, con el razonamiento incluido en el total); la fila crece hasta que el turno termina, asi que el numero lo cierra quien cierre. Proveedor por suscripcion: costo 0.",
    "input_tokens": 357906,
    "output_tokens": 108250,
    "total_tokens": 537224,
    "estimated_cost_usd": 0,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-005"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-01",
    "session_reference": "20260930_230829_c89d8c",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion de Hermes de la revision de la ronda 1 de este eslabon (run 52 del tablero, lente de artefacto): leyo el diff en frio, reprodujo los defectos sobre los dos boards reales y pidio los cambios. Numeros leidos de session_model_usage, con el razonamiento incluido en el total; proveedor por suscripcion: costo 0.",
    "input_tokens": 158737,
    "output_tokens": 43779,
    "total_tokens": 235335,
    "estimated_cost_usd": 0,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-006"
  }
]
```

## Release

Sin publicar todavía.

## Eventos

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-09-29",
    "at": "2026-09-30T01:34:34.518Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-30",
    "at": "2026-10-01T03:48:57.835Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-30",
    "at": "2026-10-01T03:52:05.676Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-30",
    "at": "2026-10-01T03:55:37.547Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-30",
    "at": "2026-10-01T03:55:37.702Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-30",
    "at": "2026-10-01T04:06:41.020Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-30",
    "at": "2026-10-01T04:06:49.095Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-30",
    "at": "2026-10-01T04:06:54.308Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-30",
    "at": "2026-10-01T04:07:15.834Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-30",
    "at": "2026-10-01T04:45:16.505Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-30",
    "at": "2026-10-01T04:45:16.683Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-30",
    "at": "2026-10-01T04:45:16.832Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-30",
    "at": "2026-10-01T04:45:16.980Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-30",
    "at": "2026-10-01T04:45:17.123Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-006."
  }
]
```
