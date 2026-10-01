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

- Archivos y flujo investigados: `packages/engine/src/fases.ts:100-119` — `marcaDe` reconoce solo `action: "created"` (abre `intake`) y `action: "ticket-transition"` cuyo `details` matchea `TRANSICION_RE` (`fases.ts:68`, `^Workflow: [a-z_]+ -> ([a-z_]+)\.$`); cualquier otra forma se ignora sin romper la serie (`fases.ts:135-136`), y el instante sale de `Date.parse` sobre `at` (`fases.ts:71-75`), con un tramo sin hora declarado no reconstruible. `packages/core/src/transitions.ts:54-67` — los once estados del registro; `packages/core/src/edit.ts:141` — el `at` ISO que escribe el motor desde 2026-09-26. `packages/adapter/package.json` — el paquete depende solo de `@valmen/core`, y `packages/server/package.json` ya depende de `@valmen/adapter`, así que el eslabón 5 lo consume sin dependencia nueva; `packages/adapter/src/hermes-relay.ts:52` — el adapter ya es el paquete que habla con el entorno de Hermes (escribe el gancho en `~/.hermes/hooks/`). `packages/server/src/timeline.ts:49-59` — la carga perezosa de `node:sqlite` con `createRequire` (en la cúpula rompía trece archivos de tests) y `timeline.ts:224-236` — la apertura en `{ readOnly: true }` con `existsSync` previo y `null` cuando no hay base; `timeline.ts:205-218` — el par `opencodeDbPath`/`hayDatosDeOpencode` es el patrón de la casa para una base ajena bajo el home. Del lado del tablero (fuente de Hermes, fuera del repositorio, en `~/.hermes/installs/<hash>/environments/<hash>/workspace/hermes_cli/`): `kanban_db.py:513` `kanban_db_path` → `kanban_db.py:476,508-510` deja la base en `<home>/.hermes/kanban/boards/<slug>/kanban.db` para un board con nombre y en `<home>/.hermes/kanban.db` para el board `default`; `kanban_db.py:992` — `CREATE TABLE task_events (task_id, run_id, kind, payload, created_at)`; `kanban_db.py:1943-1953` — `_append_event` escribe `created_at = int(time.time())`, o sea epoch en segundos, y `kanban_db.py:1930` — `list_events` ordena por `created_at ASC, id ASC`. La traducción que falta tiene su materia prima medida ahí: `kanban_db.py:103` — `VALID_STATUSES = {triage, todo, scheduled, ready, running, blocked, review, done, archived}`; `kanban_db.py:2348-2354` — `_RUN_OUTCOME_TERMINAL_STATUS` (desenlace del run → estado) y `kanban_db.py:2380-2385` — `goal_run_status` trata la tarjeta en `ready`/`todo` cuyo último evento es `changes_requested` como `changes_requested`. Los eventos que mueven el workflow, con su destino leído en la fuente: `created` (`kanban_db.py:1405-1412`, el estado nace del payload), `promoted` (`kanban_db.py:2186-2190`, `todo`→`ready`), `promoted_manual` (`kanban_db.py:3613-3615`), `dependency_wait` (`kanban_db.py:1678`, democión a `todo`), `claimed` (`kanban_db.py:2262-2265`, `ready`→`running`), `spawned` (`kanban_db_dispatch.py:1473`), `reclaimed` (`kanban_db.py:2527-2530`), `unblocked` (`kanban_db.py:3683-3691`, con el estado de destino en el payload y `ready` por defecto), `blocked` (`kanban_db.py:3294-3298`, con `reason` y `kind` en el payload), `review_requested` (`kanban_db.py:3461-3473`), `changes_requested` (`kanban_db.py:3528-3554`) y `completed` (`kanban_db.py:2805`, estado `done`). Y los que no son fase, contados sobre el board de este repositorio: `heartbeat` (618 de las 884 filas de `task_events`), y los de libro (`commented`, `linked`, `model_override_set`, `reprioritized`, `scheduled`, `specified`) más los de fallo del run (`gave_up`, `crashed`, `stale`, `timed_out`).
- Causa raíz o hipótesis: el síntoma de este eslabón es que la línea de fases de un ticket despachado por Hermes pierde los tramos que solo existen en el tablero —cuándo lo tomó el dispatcher, cuándo quedó esperando una decisión, cuándo lo mandó a revisión—, y la fuente complementaria que la spec declara para esa línea (`task_events`) no aporta nada. La causa es que falta la traducción entre el board y el registro, y son tres incompatibilidades independientes, cada una suficiente para perder el dato: (1) **la forma** — `fasesPorTicket` consume `action` + `details` en la forma del registro (`fases.ts:100-119`) y una fila de `task_events` es `kind` + `payload` + `created_at` (`kanban_db.py:992`), así que pasarlas sin traducir no produce una fase mal formada sino ninguna fase; (2) **el vocabulario** — los ocho estados del tablero (`kanban_db.py:103`) y los once del registro (`transitions.ts:54-67`) solo coinciden literalmente en dos nombres (`blocked` y `changes_requested`), de modo que traducir por parecido no alcanza y la equivalencia tiene que estar escrita; (3) **la unidad de hora** — `created_at` es epoch en segundos (`kanban_db.py:1952`) y el registro guarda ISO 8601, que es lo que `Date.parse` interpreta (`fases.ts:71-75`): pasar el entero tal cual deja todos los tramos en `null`, con la forma de un hueco de datos que nadie escribió. Por eso no alcanza con un `SELECT` sobre `task_events`: hace falta una traducción explícita, y su lugar es el paquete `adapter`, que es el que ya habla con el entorno de Hermes (`adapter/src/hermes-relay.ts:52`) y del que el servidor ya depende, sin agregar ninguna dependencia porque `node:sqlite` es del núcleo y su carga perezosa ya está resuelta en la casa (`server/src/timeline.ts:49-59`).
- Riesgos y compatibilidad: cambio de solo lectura sobre un paquete que nadie consume todavía en este camino — el `adapter` solo suma un módulo y su export en `packages/adapter/src/index.ts`, y ningún consumidor actual del adapter cambia. Riesgos acotados: (1) un ticket puede tener más de una tarjeta en el board, una por jornada —medido: `FEATURE-HERMES-PERFIL-PROYECTO-20260926` corrió en dos y tiene dos—, así que la resolución ticket→tarjeta devuelve **todas** las coincidencias y la unión queda del lado del consumidor, en vez de elegir una y perder la mitad de la línea; (2) una versión de Node sin `node:sqlite`, o una base ausente o ilegible, no puede convertirse en una lista vacía que se lea como «no hubo fases»: el lector devuelve `null` y el consumidor declara la ausencia, igual que `GET /api/timeline` con `disponible: false` (`server/src/server.ts:706`); (3) los eventos de fallo del run (`gave_up`, `crashed`, `stale`, `timed_out`) quedan sin traducir y se declara: la fuente no les da un estado de destino único y traducirlos a `blocked` sería inventar una tabla que el board no tiene; (4) lectura concurrente con el dispatcher: la base se abre en `{ readOnly: true }`, como `server/src/timeline.ts:232` con la de opencode, así que el lector no puede bloquear ni modificar el board (R-S1-004); (5) compatibilidad hacia atrás: sin cambios en la derivación ni en el registro, y sin dependencia nueva.
- Impactos de sync, migración, Docker o despliegue: ninguno — módulo nuevo de solo lectura en el paquete `adapter`: no escribe en `kanban.db` ni en el registro, no hay esquema nuevo, no hay migración, no toca contenedores ni despliegue y no toca el camino de sincronización, que este paquete no usa.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). La autorización anticipada del PO ya fue dada para la tanda de 7 de la feature timeline-fases: «Dale, abrí las 7 tarjetas kanban» (PO por Telegram, 2026-09-30), y el eslabón 4 (este) la replica con su nombre de tarjeta propia —kanban `t_be69706c`—, igual que los eslabones 1 a 3 de la misma tanda.
- Decisiones:
  1. La traducción vive en el paquete `adapter` (`packages/adapter/src/kanban.ts`), no en `server` ni en `engine`: el `engine` no toca el disco ni la red por invariante del proyecto, el `server` ya depende del `adapter` (`packages/server/package.json`) y el `adapter` es el paquete que ya habla con el entorno de Hermes (`packages/adapter/src/hermes-relay.ts:52` escribe el gancho en `~/.hermes/hooks/`). Alternativa descartada: leer la base desde el endpoint — dejaría el parser del board dentro del paquete que expone HTTP y el mismo encargo quedaría escrito dos veces, una por lector.
  2. **La equivalencia va en una tabla escrita**, de tipo de evento del board → estado del board → fase del registro, en vez de traducir por parecido de nombres: solo `blocked` y `changes_requested` coinciden literalmente entre los dos vocabularios, así que el parecido no alcanza. La tabla es ésta, y va citada en el código: (a) tipo → estado: `created` → el `status` del payload; `promoted` y `promoted_manual` → `ready`; `dependency_wait` → `todo`; `scheduled` → `scheduled`; `claimed` → `running`; `spawned` → `running`; `reclaimed` → `ready`; `unblocked` → el `status` del payload, o `ready`; `blocked` → `blocked`; `review_requested` → `review`; `changes_requested` → `changes_requested`; `completed` → `done`. (b) estado → fase: `triage`, `todo`, `scheduled` y `ready` → `intake`; `running` → `in_progress`; `blocked` → `blocked`; `review` → `awaiting_user_tests`; `changes_requested` → `changes_requested`; `done` → `closed`. Cualquier otro tipo o estado no es fase.
  3. Un evento que no mueve la fase no emite nada: `heartbeat` es la mayoría de las filas del board de este repositorio (618 de 884) y `claimed` seguido de `spawned` es la misma fase. Alternativa descartada: una fase por fila — dejaría tramos de un segundo que nadie vivió y la banda de la pantalla los pintaría como fases.
  4. El evento que sí mueve la fase se emite con la forma que la derivación ya reconoce: `action: "created"` para la creación y `action: "ticket-transition"` con `details` con la forma `Workflow: <fase-anterior> -> <fase-nueva>.` para el resto, con el motivo del payload (`reason` de `blocked` y de `changes_requested`) después del punto, que es lo que llena el `motivo` de `FaseDeTicket` (`packages/engine/src/fases.ts:49-54`); el origen es la fase anterior de la serie que el propio lector armó, y el token `desconocido` cuando la serie no arranca en un evento de creación. Alternativa descartada: devolver una forma propia del board y traducirla en el endpoint — dos formas para el mismo dato y el engine sin poder consumirlo.
  5. La hora se convierte en el lector: `created_at` llega en segundos epoch (`kanban_db.py:1952`) y sale como ISO 8601 (`new Date(created_at * 1000).toISOString()`), que es lo que interpreta `Date.parse` (`packages/engine/src/fases.ts:71-75`); una fila sin hora numérica utilizable sale sin `at`, y su tramo queda declarado no reconstruible. Alternativa descartada: estimar la hora de un tramo que no la trae — el motor no rellena huecos a propósito (`fases.ts:19-21`).
  6. La resolución ticket→tarjeta devuelve **todas** las tarjetas que nombran el ticket, la más vieja primero, y no una sola: un ticket trabajado en dos jornadas tiene dos tarjetas —medido: `FEATURE-HERMES-PERFIL-PROYECTO-20260926`— y elegir una parte la línea en dos. Alternativa descartada: devolver la más nueva — pierde la jornada anterior sin decirlo.
  7. La parte pura (filas → eventos) se separa del I/O: `eventosDeFaseDeFilas` no abre la base ni importa `node:sqlite`, así que la traducción —que es el valor del ticket— se prueba en cualquier versión de Node y el `skipIf(sqlite() === null)` queda solo para los casos que abren la base. La lección del eslabón 3: una prueba entera debajo del `skipIf` pasa en verde sin comprobar nada (`tests/readonly-fases.test.ts:359-365`).
  8. Sin base que leer, `null`; con base legible y sin filas de esa tarjeta, `[]`. Es la distinción que ya hace `GET /api/timeline` con `disponible: false` (`packages/server/src/server.ts:706`) y evita que la pantalla lea una ausencia como un cero.
  9. La base se abre en `{ readOnly: true }` y se resuelve bajo el home que el lector recibe como parámetro —el mismo encargo que `packages/server/src/timeline.ts:224-236` hace con la base de opencode—: el board lo escribe el dispatcher y R-S1-004 prohíbe tocarlo. La ruta es la del board: `<home>/.hermes/kanban/boards/<slug>/kanban.db` para un board con nombre y `<home>/.hermes/kanban.db` para el board `default` (`kanban_db.py:508-510`), que es la que ya planta la suite del eslabón 3 (`tests/readonly-fases.test.ts:92-94`).
- Pasos ordenados:
  1. `packages/adapter/src/kanban.ts` (nuevo) — exportar: (a) `kanbanDbPath(board, home?)` y `hayBaseDeKanban(board, home?)` con la resolución de la decisión 9; (b) el tipo `EventoDelBoard { id: number | string; kind: string; payload: string | null; created_at: number }`; (c) `eventosDeFaseDeFilas(filas)`, pura — recorre las filas en el orden recibido, traduce con las dos tablas de la decisión 2, salta las que no mueven fase y emite `kind: "ticket-event"`, `id: "KANBAN-<id de la fila>"`, `date` con los diez primeros caracteres del `at`, `actor` con el `actor` del payload o `"kanban"`, y `action`, `details` y `at` según las decisiones 3, 4 y 5; (d) `leerEventosDeFaseKanban(board, taskId, { home })`, que abre la base en sola lectura con la carga perezosa de `node:sqlite` (`createRequire` dentro de la función, nunca en la cúpula de `server/src/timeline.ts:34-45`), consulta `SELECT id, kind, payload, created_at FROM task_events WHERE task_id = ? ORDER BY created_at ASC, id ASC` y devuelve `null` si no hay base, no hay módulo o la tabla no existe; (e) `tareasDeTicketKanban(board, ticketId, { home })`, que consulta `SELECT id FROM tasks WHERE instr(title, ?) > 0 OR instr(body, ?) > 0 ORDER BY created_at ASC` y devuelve `null` si no hay base. Más `packages/adapter/src/index.ts:14` — `export * from "./kanban.js";` junto a los demás.
  2. `tests/eventos-fase-kanban.test.ts` (nuevo, el archivo que anotan los criterios): plantar la base del board del laboratorio en un `HOME` aislado —`<lab>/.hermes/kanban/boards/valmen-harness/kanban.db` con el esquema real (`tasks(id, title, body, created_at)` y `task_events(id INTEGER PRIMARY KEY AUTOINCREMENT, task_id, run_id, kind, payload, created_at)`) y `board.json`— y cubrir: (a) una tarjeta despachada (`created` en `ready`, `promoted`, `claimed`, `spawned`, `blocked` con `reason`, `unblocked`, `review_requested`, `completed`) cuyos eventos alimentan `fasesPorTicket` y producen la secuencia con inicio, fin, duración y `enCurso`; (b) `heartbeat`, `commented` y `model_override_set` no abren fase y `claimed` seguido de `spawned` es una sola; (c) `blocked` con `reason` da la fase `blocked` con su motivo y `changes_requested` su fase propia con el suyo; (d) sin base, `leerEventosDeFaseKanban` devuelve `null` y el board `default` se resuelve en la ruta heredada; (e) `tareasDeTicketKanban` encuentra la tarjeta por el título y por el cuerpo, y con dos coincidencias devuelve las dos, la más vieja primero; (f) el hash de `kanban.db` queda igual después de leer las fases y de resolver la tarjeta. Los casos (a), (b) y (c) van fuera del `skipIf` porque no abren la base: `eventosDeFaseDeFilas` es pura.
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

## Puntos

```json
[]
```

## Implementación

- Cambio: `packages/adapter/src/kanban.ts` (nuevo, 335 líneas) —el lector—, `packages/adapter/src/index.ts` (una línea: `export * from "./kanban.js";`) y `tests/eventos-fase-kanban.test.ts` (nuevo, 7 casos, 403 líneas). No se tocó `packages/engine/**` ni `packages/server/**`: `fasesPorTicket` ya consumía eventos con la forma del registro, y lo que faltaba era entregarle los del board en esa forma.
- Qué expone el módulo: `kanbanDbPath` —el board con nombre en `<home>/.hermes/kanban/boards/<slug>/kanban.db` y el `default` en la ruta heredada `<home>/.hermes/kanban.db`—, `hayBaseDeKanban`, `EventoDelBoard`, `eventosDeFaseDeFilas` (pura: filas → eventos de fase, sin tocar el disco), `leerEventosDeFaseKanban` (abre en `{ readOnly: true }`, cierra en `finally`, y devuelve `null` —no `[]`— cuando no hay base, no hay `node:sqlite` o la consulta falla) y `tareasDeTicketKanban` (todas las tarjetas que nombran el ticket, la más vieja primero).
- La traducción, que es lo que este ticket paga: las dos tablas escritas (tipo del board → estado del board; estado → fase del registro), el cambio de unidad de hora (segundos epoch → ISO 8601, sin estimar el tramo que no trae hora utilizable) y la emisión **solo cuando la fase cambia**, para que `claimed` seguido de `spawned` sea una sola fase y los `heartbeat` no abran escalones de un segundo. `node:sqlite` se carga con `createRequire(import.meta.url)` dentro de la función, como `packages/server/src/timeline.ts:34-59`, para no romper el empaquetador de los tests.
- Casos: 7, y solo los tres que abren la base van bajo `describe.skipIf(sqlite() === null)`; los de traducción pura corren en cualquier versión de Node. Es la lección del eslabón 3: un archivo entero bajo el `skipIf` pasa en verde sin comprobar nada.
- Corrección del verificador, nombrada acá porque el commit le atribuye a la sesión lo que escribió el verificador: `npx prettier --write tests/eventos-fase-kanban.test.ts` sobre la entrega del ejecutor —el archivo no pasaba `--check`— y la suite focal y la batería corridas de nuevo sobre el archivo ya formateado. No hubo corrección de contenido.
- La corrida contra el board real, que es lo que saca al lector del laboratorio: sobre `~/.hermes/kanban/boards/valmen-harness/kanban.db`, `tareasDeTicketKanban("valmen-harness", "INTEGRATION-ADAPTER-KANBAN-READER-20260929")` devuelve `["t_be69706c"]` y `leerEventosDeFaseKanban` sobre esa tarjeta devuelve sus dos eventos de fase; con `fasesPorTicket` sale `intake` (2026-09-30T20:25:22Z → 2026-10-01T03:39:24Z, 26 042 000 ms) y `in_progress` en curso. La leyó un `vite-node` sobre el módulo, con el home real de la máquina.

## Pruebas

- Comandos corridos por la sesión del eslabón, no reportados por el ejecutor:
  1. `npx vitest run tests/eventos-fase-kanban.test.ts` → `Test Files 1 passed (1)` · `Tests 7 passed (7)`, sobre el archivo ya formateado.
  2. `npx vitest run` → `Test Files 88 passed | 1 skipped (89)` · `Tests 1653 passed | 48 skipped (1701)` (51,86 s de duración).
  3. `npm run typecheck` (`tsc --build tsconfig.build.json` + `tsc --noEmit -p tsconfig.json`) → sin errores.
  4. `npx eslint packages/adapter/src/kanban.ts packages/adapter/src/index.ts tests/eventos-fase-kanban.test.ts` → exit 0. `npm run lint` sobre el repo entero da 4 errores **preexistentes** en archivos que este ticket no toca (`packages/engine/src/evaluators.ts` dos veces, `tests/eventos-con-hora.test.ts`, `tests/mcp-server.test.ts`): `git diff HEAD` sobre ellos está vacío, así que vienen de HEAD y no de este cambio.
  5. `npx prettier --check` sobre los tres archivos → `All matched files use Prettier code style!`.
- Sensibilidad de la suite —que no pase por vacía—: la corrida contra el board real (arriba) prueba el lector sobre datos que la suite no escribió —las dos fases que salen son las que el tablero registró para `t_be69706c`—, y en el laboratorio el caso `(a-bis)` lee la base plantada y compara la salida del lector con la de la traducción pura, así que una consulta rota o un orden cambiado lo dejan rojo.
- Ambiente: macOS, vitest 2.1.9, Node 22 con `node:sqlite`; el laboratorio es un `mkdtempSync` con el `HOME` aislado y restaurado en `afterEach`, así que las pruebas no tocan el board real de la máquina.
- Los 6 criterios declaran `test:` y quedan tildados; este ticket no tiene ningún `verify: manual`.

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
  }
]
```
