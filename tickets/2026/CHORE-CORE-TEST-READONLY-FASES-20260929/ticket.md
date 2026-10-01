---
schema_version: 2
id: CHORE-CORE-TEST-READONLY-FASES-20260929
title: Tests de solo lectura para derivación y API de fases
type: CHORE
module: CORE
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

# CHORE-CORE-TEST-READONLY-FASES-20260929

## Solicitud original

Parte del sprint: Núcleo de datos y API.
- R-S1-004: Solo lectura y append-only — La línea de fases DEBE derivarse leyendo el registro: la feature no escribe en los
Depende de: FEATURE-CORE-DERIVAR-FASES-20260929, FEATURE-API-FASES-20260929.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: las pruebas de solo lectura del núcleo de la feature `timeline-fases` — la derivación de fases (`packages/engine/src/fases.ts`) y el endpoint `GET /api/ticket/fases` (`packages/server/src/server.ts`), que es lo que cubre R-S1-004 en esta línea del sprint 1. No toca la derivación ni el endpoint: agrega el archivo de pruebas que fija su garantía.
- Usuario o rol afectado: nadie ve la pantalla —el ticket nace `user_visible: false`—; quien consume esta garantía es el registro y quien lo audita. La feature no debe escribir en el registro ni en `task_events`, y hoy nada lo comprueba.
- Comportamiento actual: la garantía está **declarada** y no **verificada**. `fasesPorTicket` dice en su docstring que es pura y read-only (`packages/engine/src/fases.ts:26-27`) y el endpoint dice lo mismo (`packages/server/src/server.ts:701-702`), pero ninguna de las dos suites existentes mira el árbol antes y después: `tests/derivacion-fases.test.ts` (6 pruebas) afirma el resultado de la derivación y `tests/api-fases-api.test.ts` (5 pruebas) afirma el contrato de la respuesta. Ninguna falla si el camino de lectura escribe.
- Comportamiento esperado: una suite que se ponga roja si la derivación muta la lista de eventos que recibe, si el endpoint deja el registro distinto de como lo encontró —bloques append-only incluidos—, si agrega archivos al registro o si escribe en `task_events` del board.

## Diagnóstico

- Archivos y flujo investigados:
  - `packages/engine/src/fases.ts:129-171` — `fasesPorTicket` recorre los eventos, reconoce la marca de cada uno (`marcaDe`, `fases.ts:100-119`) y arma los tramos en un arreglo local: **no importa `node:fs` ni recibe una ruta**, así que no tiene por dónde escribir. La pureza es hoy una propiedad del código y no una prueba.
  - `packages/server/src/server.ts:707-736` — el endpoint lee el ticket (`readTicket(paths, ticket)`, `server.ts:715`), deriva (`fasesPorTicket(detalle.events)`, `server.ts:721`) y agrupa las sesiones en una vista (`sesionesPorTramo`, `server.ts:230-251` y su uso en `server.ts:733`). Los tres pasos son de lectura, y el comentario del endpoint (`server.ts:701-702`) lo declara: «Es solo lectura: no escribe nada del registro ni de la contabilidad».
  - `packages/core/src/blocks.ts:424-460` — el bloque `Eventos` es append-only y el validador exige `kind: ticket-event`, `date`, `action`, `actor` y `details`; es el bloque que R-S1-004 prohíbe reescribir.
  - `packages/core/src/edit.ts:141` — `newEvent` es el único punto que anexa eventos; el camino de lectura del endpoint no pasa por ahí, y eso es lo que hay que fijar para que siga siendo cierto.
  - `tests/derivacion-fases.test.ts:69-218` y `tests/api-fases-api.test.ts:208-363` — las dos suites de la feature: cubren la derivación y el contrato del endpoint, ninguna hashea el árbol ni comprueba que `task_events` quede intacto.
- Causa raíz o hipótesis: lo que la solicitud pide —que la línea de fases se derive leyendo el registro y que la feature no escriba en él ni en `task_events`— hoy se cumple en el código y no se puede comprobar: ninguna prueba lee el árbol antes y después, así que un incumplimiento no tendría por dónde manifestarse. Ese es el defecto que este ticket cierra, y su causa está en la forma de las dos suites de la feature: `tests/derivacion-fases.test.ts:69-218` afirma las fases que salen y `tests/api-fases-api.test.ts:208-363` afirma la respuesta del endpoint, y ninguna compara el registro consigo mismo —el árbol no se mira, así que una escritura hecha desde el camino de lectura pasa en verde—. El riesgo no es hipotético: el sprint 2 lee `task_events` de `kanban.db` y lo integra en este mismo endpoint (`INTEGRATION-ADAPTER-KANBAN-READER-20260929` y `FEATURE-API-KANBAN-FASES-20260929`), y ahí escribir —marcar la fase en curso con un `UPDATE task_events`, normalizar el bloque `Eventos` al leerlo, cachear la derivación en el ticket— es el cambio natural. Lo que se rompe es la auditoría: el registro dejaría de ser la fuente que solo se lee. La prueba que falta es la comparación del árbol antes y después.
- Riesgos y compatibilidad: el cambio es un archivo de pruebas nuevo; no toca código de producción ni el registro. Dos riesgos de la prueba misma: (1) comparar `mtime` en vez de contenido daría un falso rojo —o un falso verde, si el sistema no actualiza la marca—, así que se hashea el contenido con `createHash("sha256")` como en `tests/qa-commit-referencia.test.ts:33-46`; (2) leer la base real de la máquina haría que el resultado dependiera del equipo, así que la prueba aísla el `HOME` en un laboratorio, con el mismo encuadre de `tests/api-fases-api.test.ts:81-96`. La mitad de `task_events` usa `node:sqlite`, que es experimental, y se saltea si el módulo no está (`skipIf`), igual que `tests/api-fases-api.test.ts:304`.
- Impactos de sync, migración, Docker o despliegue: ninguno — es un archivo de pruebas nuevo bajo `tests/`, sin esquema nuevo, sin tocar el camino de sincronización ni la infraestructura.
- Requisitos cubiertos: R-S1-004 (solo lectura y append-only) en su parte de núcleo — derivación y API. El mismo requisito lo cubren `FEATURE-CORE-DERIVAR-FASES-20260929`, `FEATURE-API-FASES-20260929` y los dos tickets del sprint 2, según el `coverage` de `.valmen/features/timeline-fases/tickets.yaml:57-63`.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** —autorización anticipada citada literal: «Dale, abrí las 7 tarjetas kanban» (Telegram, 2026-09-30), que ampara el avance de este eslabón con la compuerta `analysis` en revisión (unblock del PO 2026-09-30 ~21:25 y orden de continuar 21:45)—.
- Compuerta de plan: se corrió con el evaluador que pide el estándar para un artefacto con sustancia —`--evaluator cascade`, recibo `GR-20261001-plan`—, que devolvió **REVIEW** con `criterio_03` en banda por agrupar dos afirmaciones (el resto en verde; media ponderada 0.957). Se partieron los criterios compuestos en atómicos y, como el plan no cambió —solo la redacción de los criterios—, se corrió el evaluador de siempre: **APPROVE** (`GR-20261001-plan`, `jev`), con 7 de 15 proposiciones decidiendo y las descriptivas entre 0.87 y 0.95.
- Criterios de aceptación: se reescribieron atómicos —una afirmación verificable cada uno— porque la materialización dejó en la sección la frase cortada del requisito («…la feature no escribe en los»), sin anotación de verificación, que es la que detiene la compuerta mecánica. La frase completa del requisito (spec `s1-linea-fases/spec.md:32-35`) queda cubierta por los seis criterios con test.
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. Crear `tests/readonly-fases.test.ts` con una utilidad `hashArbol(lab)` que recorra el laboratorio en orden determinista (archivos, rutas relativas y contenidos hasheados con `createHash("sha256")`) y una utilidad `hashBaseV2(lab)` que lea `~/.local/share/opencode/opencode.db` del `HOME` aislado con `node:sqlite` (`skipIf(sqlite() === null)`, igual que `tests/api-fases-api.test.ts:304`) y hashee `session_v2` y `session_message` ordenadas por `id`. Se suman `hashArchivo(ruta)` —hashea el contenido de un archivo, sin abrirlo con SQLite— y `plantarBoard(lab)`, que crea `lab/.hermes/kanban.db` con una tabla `task_events` y una fila: es la base del tablero donde el sprint 2 va a leer (`INTEGRATION-ADAPTER-KANBAN-READER-20260929`), y el archivo que un `UPDATE` de más cambiaría.
  2. Caso de derivación sobre `fasesPorTicket` (`packages/engine/src/fases.ts`): escribir el ticket con `writeFixtureTicket` (`tests/helpers/fixtures.ts`), reemplazar su bloque `Eventos` con la misma técnica de `tests/api-fases-api.test.ts:115-125`, hashear el árbol del laboratorio y la base del board antes, correr `fasesPorTicket(detalle.events)` con los eventos de `readTicket` (`packages/engine/src/tickets.ts:214`), y afirmar además que la entrada quedó inalterada: mismo hash de árbol, mismo hash de la base del board y cada evento el mismo objeto (misma referencia) que la lista de entrada.
  3. Caso de endpoint sobre `GET /api/ticket/fases` (`packages/server/src/server.ts` vía `handleApi`) con el `HOME` aislado, la base v2 falsa de `escribirBaseV2` y la base del board de `plantarBoard`: hash del árbol, de la base del board y de `session_v2`/`session_message` antes; llamada al endpoint; y los tres hashes idénticos después. El mismo caso repite la consulta de inmediato —segunda llamada— y vuelve a hashear el árbol y la base de contabilidad, que siguen idénticos: dos consultas no dejan nada distinto de una.
  4. Correr la suite enfocada `npx vitest run tests/readonly-fases.test.ts` y luego la batería `npx vitest run`, y correr `npm run typecheck` en limpio.
- Rollback: borrar `tests/readonly-fases.test.ts`. El cambio queda revertido por completo: el rollback es una eliminación, no una reversión de ediciones en archivos de producción.

## Criterios de aceptación

- [x] R-S1-004: la derivación `fasesPorTicket` no muta la lista de eventos que recibe — misma longitud, mismo orden y las mismas referencias de objeto
      <!-- test: npx vitest run tests/readonly-fases.test.ts -->
- [x] R-S1-004: el árbol del laboratorio queda byte a byte igual después de derivar las fases
      <!-- test: npx vitest run tests/readonly-fases.test.ts -->
- [x] R-S1-004: la base del board —`kanban.db` con su tabla `task_events`— queda con el mismo hash después de derivar las fases
      <!-- test: npx vitest run tests/readonly-fases.test.ts -->
- [x] R-S1-004: el árbol del laboratorio queda byte a byte igual después de consultar el endpoint
      <!-- test: npx vitest run tests/readonly-fases.test.ts -->
- [x] R-S1-004: la base del board —`kanban.db` con su tabla `task_events`— queda con el mismo hash después de consultar el endpoint
      <!-- test: npx vitest run tests/readonly-fases.test.ts -->
- [x] R-S1-004: la base de contabilidad `session_v2`/`session_message` queda con el mismo hash después de consultar el endpoint
      <!-- test: npx vitest run tests/readonly-fases.test.ts -->
- [ ] La batería completa sigue en verde y el typecheck no registra errores
      <!-- verify: manual -->

## Puntos

```json
[]
```

## Implementación

- Cambio: `tests/readonly-fases.test.ts`, archivo nuevo de 471 líneas — el único archivo que toca este ticket. No se modificó código de producción: la suite fija la garantía de R-S1-004 sobre `fasesPorTicket` (`packages/engine/src/fases.ts`) y `GET /api/ticket/fases` (`packages/server/src/server.ts`), que ya eran de solo lectura.
- Utilidades del archivo: `hashArbol` (recorrido determinista por ruta, con ruta y contenido enmarcados con su largo en 8 bytes big-endian y `createHash("sha256")`), `hashArchivo`, `hashBaseV2` (`session_v2` y `session_message` ordenadas por `id`, abiertas en `readOnly: true`) y `plantarBoard` (`<HOME>/.hermes/kanban.db` con `task_events` y una fila). El fixture del ticket lo escribe `writeFixtureTicket` y el bloque `Eventos` se reemplaza con la técnica de `tests/api-fases-api.test.ts:115-125`; los tres archivos que se hashean se afirman existentes antes de hashearlos.
- Tres casos: `(a)` derivación —la lista de entrada queda con su longitud, su orden y sus referencias, y el hash del registro no cambia—; `(b)` derivación contra la base del board; `(c)` endpoint —registro, board y contabilidad antes y después, con la segunda consulta inmediata—. Los casos `(b)` y `(c)` van bajo `skipIf(sqlite() === null)`, porque el módulo es experimental.
- Corrección del verificador, nombrada acá porque el commit le atribuye a la sesión lo que escribió el verificador: la versión entregada por OpenCode ponía los tres casos bajo `describe.skipIf(sqlite() === null)` y, en un Node sin `node:sqlite`, el archivo entero corría en verde sin comprobar nada —el falso verde que este ticket cierra—. Se separó el caso de derivación: `(a)` sin `node:sqlite` (pureza de la derivación y hash del registro) y `(b)`/`(c)` bajo el `skipIf`. Se corrió `npx prettier --write` sobre el archivo. Casos: 3 (la entrega del ejecutor traía 2).

## Pruebas

- Comandos corridos por la sesión del eslabón, no reportados por el ejecutor:
  1. `npx vitest run tests/readonly-fases.test.ts` → `Test Files 1 passed (1)` · `Tests 3 passed (3)` (44 ms).
  2. `npx vitest run` → `Test Files 87 passed | 1 skipped (88)` · `Tests 1646 passed | 48 skipped (1694)` (64 s de duración).
  3. `npm run typecheck` (`tsc --build tsconfig.build.json` + `tsc --noEmit -p tsconfig.json`) → sin errores.
- Sensibilidad de la suite —que no pase por vacía—: con una escritura inyectada **temporalmente** en el camino de lectura del endpoint (`packages/server/src/server.ts`, una línea después de `readTicket(paths, ticket)`, revertida con `git checkout --`), el caso `(c)` se puso rojo con hashes distintos; con una escritura inyectada **temporalmente** dentro del caso `(a)` del propio archivo de pruebas (revertida desde su respaldo, que quedó en `sha256 a5b3c3488c22…`), el caso `(a)` se puso rojo. `git status --short` confirma que las dos mutaciones quedaron revertidas y que lo ajeno sigue intacto.
- Ambiente: macOS, vitest 2.1.8, Node con `node:sqlite`; el laboratorio es un `mkdtempSync` y el `HOME` de las pruebas se aísla, así que no toca la base real de la máquina ni el board real.
- Criterio `verify: manual` (batería completa y typecheck): queda **sin tildar** hasta que lo confirme quien prueba. Su resultado está arriba, corrido por la sesión, y no por eso deja de ser una declaración de quien prueba.

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
    "description": "Suite de solo lectura: npx vitest run tests/readonly-fases.test.ts -> 3/3 en 44 ms; npx vitest run -> 87 archivos en verde (1646 pruebas pasadas, 48 omitidas); npm run typecheck -> sin errores. Sensibilidad verificada: con una escritura inyectada y revertida en el camino de lectura del endpoint (server.ts) el caso (c) se puso rojo, y con una inyectada y revertida dentro del caso (a) el (a) se puso rojo. El arbol hasheado es tests/readonly-fases.test.ts, unico archivo del ticket, en orden alfabetico.",
    "reference": "worktree:sha256:4f05d755b4ee6a928d22272d6219e6b9a301b8bdf009f291cd13d6b179e01aa1",
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
    "session_reference": "20260930_192126_3de0c3",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion Hermes del eslabon 3 de 7, kanban t_09cc7c45: diagnostico del ticket y compuerta analysis corrida dos veces, REVIEW en ambas con diagnostico_explica_el_sintoma en banda, 0.54 y 0.57; la cascada que pide el estandar se cayo dos veces por tiempo del juez y se corrio el evaluador de siempre. Ticket bloqueado en needs_input esperando la decision del PO. Lectura al momento de registrar con el turno todavia en curso: la fila crece hasta que termina. Proveedor opencode-go por suscripcion, la base no calculo el costo. No hubo sesion OpenCode: la implementacion no comenzo.",
    "input_tokens": 205426,
    "output_tokens": 30160,
    "total_tokens": 258400,
    "estimated_cost_usd": null,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-01",
    "session_reference": "20260930_221051_436845",
    "model": "deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion Hermes del eslabon 3 (kanban t_09cc7c45, run 49): retomo el ticket en planned, partio los criterios compuestos que la compuerta de plan marco en banda, corrio gate plan (cascade -> REVIEW, jev -> APPROVE), aprobo y abrio la implementacion, lanzo y verifico la sesion de OpenCode, corrigio el archivo de pruebas (sacó la pureza de la derivacion de debajo del skipIf) y corrio las pruebas. Proveedor opencode-go por suscripcion: coste no calculado (0). Lectura de session_model_usage al momento de registrar: la fila crece hasta que el turno termina.",
    "input_tokens": 182015,
    "output_tokens": 54678,
    "total_tokens": 274099,
    "estimated_cost_usd": 0,
    "source": "hermes:/Users/juanandrade/.hermes/profiles/valmen-harness/state.db",
    "confidence": "high",
    "id": "CONSUMO-002"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-01",
    "session_reference": "ses_f0a83e8e2ffeToRUEeJ3dkxUVs",
    "model": "opencode-go/deepseek-v4.1-flash",
    "reasoning_effort": null,
    "notes": "Sesion OpenCode de implementacion del eslabon 3: escribio tests/readonly-fases.test.ts (el unico archivo del ticket) con las utilidades y los dos casos del plan, y corrio la suite enfocada, la bateria y el typecheck. 11383 tokens de razonamiento, que entran en el total de 93920.",
    "input_tokens": 75183,
    "output_tokens": 7354,
    "total_tokens": 93920,
    "estimated_cost_usd": 0.024893154,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-003"
  },
  {
    "kind": "ai-usage",
    "date": "2026-10-01",
    "session_reference": "ses_f0a85e75fffeeaPLg3hLMMCBRT",
    "model": "openai/gpt-6.1-sol",
    "reasoning_effort": null,
    "notes": "Primer lanzamiento del ejecutor: se lanzo opencode run sin --model y tomo el modelo por defecto del CLI en vez del declarado (opencode-go/deepseek-v4.1-flash). Se detuvo a los ~3 minutos, se borro el archivo a medias y se relanzo con el modelo del ticket. La base de OpenCode deja el campo model vacio en esta sesion: el modelo sale del log del lanzamiento. Se registra para que el coste real quede a la vista y no se pierda.",
    "input_tokens": 24,
    "output_tokens": 4099,
    "total_tokens": 4507,
    "estimated_cost_usd": 0.1795239,
    "source": "opencode:/Users/juanandrade/.local/share/opencode/opencode.db",
    "confidence": "high",
    "id": "CONSUMO-004"
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
    "at": "2026-09-30T01:34:34.455Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-30",
    "at": "2026-10-01T00:26:19.757Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-30",
    "at": "2026-10-01T00:36:34.880Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-30",
    "at": "2026-10-01T02:58:41.282Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-30",
    "at": "2026-10-01T03:19:22.870Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-30",
    "at": "2026-10-01T03:19:26.546Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-30",
    "at": "2026-10-01T03:32:40.078Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-30",
    "at": "2026-10-01T03:32:46.080Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-30",
    "at": "2026-10-01T03:32:51.830Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-30",
    "at": "2026-10-01T03:32:52.464Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-30",
    "at": "2026-10-01T03:34:05.643Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
