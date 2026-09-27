---
schema_version: 2
id: IMPROVEMENT-MC-REGISTRO-COSTO-TIEMPO-20260926
title: Registrar el costo y el tiempo de un ticket cuando el harness se maneja desde Hermes o desde el CLI
type: IMPROVEMENT
module: MC
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-26
updated: 2026-09-26
related_ticket: IMPROVEMENT-GATE-CRITERIO-ATOMICO-20260926
target_release: null
released_in: null
---

# IMPROVEMENT-MC-REGISTRO-COSTO-TIEMPO-20260926

## Solicitud original

veo que por ejemplo en este ticket veo en linea de tiempo y costo solo un registro hermes:desktop y deepseek-v4.1-flash, cuando yo abria directamente Opencode y ejecutaba desde ahi si salia por ejemplo la ejecucion de las compuertas con Jev y salia ahi el registro ya eso no sale cuando estoy ejecutando desde aqui si se supone que tu abres opencode y llamas las herramientas no deberia quedar registrado tambien o que se rompe para que nos salga el detalle correcto. tambien quiero algo para validar el tiempo invertido ejemplo desde que se inicio el analisis, diagnistico, el plan y la implementacion y ya pase a estado de esperando pruebas para poder medir mejor el costo de Ia y el costo de tiempo.

## Descripción funcional

- Alcance: dos mitades, que el PO eligió juntas —«un ticket con las dos mitades: atribución
  del costo de las sesiones de Hermes y medición del tiempo por etapa»—. La primera hace que
  el registro diga quién gastó lo que gastó; la segunda agrega las marcas con hora que hoy no
  existen, para poder medir en qué etapa se fue el tiempo.
- Usuario o rol afectado: el PO, que decide con la línea de tiempo y el costo delante, y
  quien audite un ticket meses después sin la contabilidad del cliente a mano.
- Comportamiento actual: medido en `IMPROVEMENT-GATE-CRITERIO-ATOMICO-20260926`, cuyo
  `## Consumo de IA` dice a la vez «79 intervención(es) sobre el registro» y
  `harness $0.000000, exploración $0.229688`, mientras sus compuertas costaron $0.000505
  según los recibos. Tres causas, verificadas en el código: (a) el reparto se arma solo con
  la base de opencode —`session`/`message`/`part`—, así que las llamadas de Hermes nunca
  llegan al clasificador; (b) el clasificador busca `tool.startsWith("valmen_")`, y Hermes
  nombra `mcp__valmen__listar_tickets` y `mcp__valmen_<perfil>__<tool>`; (c) cuando el
  harness se maneja por la shell —65 llamadas `terminal` en esa sesión— no hay nombre de
  herramienta que buscar. Además, dos cantidades distintas se llaman «harness»: la de los
  recibos, que sí se registra, y la de la sesión del agente, que sale en cero desde Hermes.
- Comportamiento esperado: el registro dice cuántos mensajes de la sesión tocaron el harness
  —contados, no repartidos: el PO eligió «contar las intervenciones y no repartir el costo…
  sin número inventado»—, nombra distinto las dos cantidades que hoy comparten palabra, y
  cada evento del ticket lleva la hora en que ocurrió para poder medir la duración de cada
  etapa.

## Diagnóstico

- Archivos y flujo investigados: `packages/server/src/timeline.ts` (`leerLineaDeTiempo`,
  `delHarness`, `PREFIJO_HERRAMIENTA = "valmen_"`, `leerSesionesDeHermes`,
  `guardarFotoEnTicket`, `desglose.harnessUsd`); `packages/engine/src/value.ts` (`harnessUsd`
  desde los recibos y `sessionsUsd` desde el ticket); `packages/core/src/blocks.ts`
  (`validateEvents` con `requireExactKeys`); `packages/core/src/edit.ts` y
  `packages/engine/src/append.ts`, que son donde se escriben los eventos;
  `packages/gate/src/receipt.ts` (`decidedAt`, la única marca con hora que ya existe).
  Evidencia medida: `.valmen/receipts/IMPROVEMENT-GATE-CRITERIO-ATOMICO-20260926.jsonl` y la
  base `~/.hermes/state.db`, tablas `messages` (`tool_calls`, `tool_name`, `timestamp`) y
  `session_model_usage`.
- Causa raíz o hipótesis: el registro de costo y el de tiempo se escribieron para el camino
  de opencode, donde el agente llama al harness por MCP y cada mensaje trae su costo. Los
  otros dos caminos —Hermes, con otro nombre de herramienta, y el CLI, donde el harness se
  maneja por la shell sin nombre de herramienta— no se leyeron nunca, así que el reparto cae
  entero en «exploración». El tiempo no se perdió: nunca se escribió, porque los eventos
  llevan solo `date` y el validador exige claves exactas.
- Riesgos y compatibilidad: `at` es opcional, así que los tickets ya escritos siguen
  validando y no hace falta migración. Los recibos no se tocan. El recuento de intervenciones
  cambia números que la pantalla ya muestra —un ticket trabajado desde Hermes pasa de «0
  mensajes del harness» a los que de verdad hubo—, y eso es el objetivo, no una regresión.
  Renombrar la cantidad de las compuertas toca lo que hoy se lee en la ficha del ticket.
  Límite declarado: para un ticket ya cerrado la duración por etapa **no** se puede
  reconstruir, y el registro lo dice en vez de estimarla.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** con estas palabras:
  «y IMPROVEMENT-MC-REGISTRO-COSTO-TIEMPO-20260926 veo que el plan pasa las compuertas
  entonces apruebo para que cierres el uno e implementes el otro». El motor había dado
  APPROVE en la primera corrida —media 0.859, seis proposiciones decididas entre 0.96 y
  0.99, `$0.000141`—; la aprobación de la persona es la que habilita escribir código.
- Pasos ordenados:
  1. Leer en `packages/server/src/timeline.ts` las llamadas a herramientas de Hermes —tabla
     `messages` de `~/.hermes/state.db`, campos `tool_calls`, `tool_name` y `timestamp`— y
     meterlas en el mismo mapa por mensaje que hoy se arma solo con las partes de opencode,
     para que `delHarness` deje de depender de una sola base.
  2. Extraer la detección de «esto es el harness» a una función con sus casos en un solo
     lugar, que reconozca las dos convenciones de nombre —`valmen_*` de opencode y
     `mcp__valmen__*` / `mcp__valmen_<perfil>__*` de Hermes— y un comando `valmen` dentro de
     una llamada de shell, que es como se maneja el harness desde el CLI.
  3. No repartir el costo de una sesión que no trae costo por mensaje, según la decisión del
     PO: ese tramo se declara **no atribuible** y la nota dice cuántos mensajes de cuántos
     tocaron el harness. `harnessUsd` no estima para esas sesiones.
  4. Nombrar distinto las dos cantidades que hoy se llaman «harness» —la de las compuertas,
     que sale de los recibos y sí está registrada, y la de la sesión del agente— en el
     informe de `packages/engine/src/gate.ts` y en `packages/engine/src/value.ts`, para que
     un ticket con compuertas pagadas no muestre la del harness en cero.
  5. Agregar a los eventos del ticket un `at` opcional con hora ISO-8601, en
     `requireExactKeys` de `packages/core/src/blocks.ts`, en el escritor de eventos de
     `packages/core/src/edit.ts` y en los anexados de `packages/engine/src/append.ts`. Sin
     `at` el ticket sigue validando, así que no hay migración de esquema.
  6. Calcular la duración por etapa desde las marcas con hora —eventos más `decidedAt` de los
     recibos— y exponerla en la reanudación compacta de `packages/engine/src/resume.ts` y en
     la línea de tiempo. Para un ticket sin marcas con hora se declara no reconstruible, en
     vez de estimar.
  7. Cubrir con pruebas en `tests/timeline.test.ts` y `tests/cierre-consumo.test.ts`, con un
     caso nuevo para la duración por etapa, y correr `npm run build`, `npm run typecheck` y
     `npm test`.
- Rollback: revertir el commit. `at` es opcional y ningún recibo ni estado de ticket cambia,
  así que volver atrás deja el registro como estaba.

## Criterios de aceptación

- [x] Una sesión de Hermes que trabajó el ticket —por MCP o por el CLI, y tanto el comando instalado como el del propio repositorio— cuenta sus intervenciones y queda atribuida al ticket, sin depender de la base de opencode.
      <!-- test: npx vitest run tests/hermes.test.ts -->
- [x] Una llamada `mcp__valmen__…` y una llamada de shell que ejecuta el CLI cuentan las dos como intervención sobre el registro, y una llamada ajena no.
      <!-- test: npx vitest run tests/hermes.test.ts -->
- [x] El tramo de una sesión sin costo por mensaje se declara no atribuible, y su nota dice cuántos mensajes de cuántos tocaron el registro.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] El resumen de la foto no llama «harness» a lo que no lo es ni afirma un cero: lo que tocó el registro se nombra así, con sus mensajes, y el coste sin repartir se declara aparte.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [x] Un evento nuevo lleva `at` con hora, y un ticket ya escrito sin `at` sigue validando.
      <!-- test: npx vitest run tests/eventos-con-hora.test.ts -->
- [x] La duración por etapa se calcula desde las marcas con hora, y un ticket sin ellas se declara no reconstruible en vez de estimarse.
      <!-- test: npx vitest run tests/etapas.test.ts -->

## Puntos

```json
[]
```

## Implementación

### La mitad del costo: el reparto deja de mirar solo la base de opencode

- `packages/server/src/hermes.ts`: `esIntervencionDelHarness(llamadas)` reconoce las tres
  formas de tocar el registro —`valmen_*` de opencode, `mcp__valmen__*` y
  `mcp__valmen_<perfil>__*` de Hermes, y una llamada de shell con subcomando `valmen`—, y
  `intervencionesDeSesion(db, sessionId)` cuenta cuántos mensajes de la sesión lo hicieron.
  `SesionDeHermes` gana `mensajes` e `intervencionesDelHarness`.
- `packages/server/src/timeline.ts`: `DesgloseDeTrabajo` gana `costeNoAtribuibleUsd`; el
  coste de las sesiones de Hermes sale de `exploracionUsd` —no se puede repartir por
  mensaje— y sus intervenciones entran al conteo.
  `SesionDeAgente` gana `mensajes` y `mensajesDelRegistro`, y `mensajesDelRegistroEnTexto`
  escribe «N de M mensajes tocaron el registro» en la nota de la sesión.
- `packages/server/src/timeline.ts`: `renderDesglose(desglose, totalUsd)` reemplaza el
  «harness $X, exploración $Y» del resumen. `packages/engine/src/value.ts` renombra el campo
  `harnessUsd` —el de los recibos— a `compuertasUsd`, para que la palabra no nombre dos cosas.

### La mitad que faltaba: la sesión que trabaja por el CLI queda atribuida al ticket

Contar la intervención sin atribuir la sesión dejaba el arreglo a medias: el registro
sabía que un mensaje tocó el harness y la línea de tiempo del ticket seguía vacía.

- `packages/server/src/hermes.ts`: `subcomandoDeValmen` reconoce las **dos** formas de
  invocar el CLI —el comando instalado `valmen` y el del propio repositorio
  `…/packages/cli/dist/main.js`—, saltándose las banderas y las rutas que van antes del
  subcomando. `ticketsDeSesion` marca el ticket como **trabajado** cuando el mensaje lo
  escribió por el CLI (`escribePorCli`), no solo cuando llamó a una herramienta con nombre
  del harness.
- Se verificó contra el registro real: la sesión que implementó este ticket nombraba
  `IMPROVEMENT-MC-REGISTRO-COSTO-TIEMPO-20260926` **130 veces y ninguna contaba como
  escritura**, porque sus comandos eran `node packages/cli/dist/main.js … validate --id …`
  y la palabra `valmen` no aparecía en ninguna parte. Con el reconocedor extendido, la
  línea de tiempo del ticket muestra la sesión con sus 1.474 mensajes y 52 sobre el
  registro, donde antes no aparecía ninguna.

### La mitad del tiempo: los eventos estrenan hora

- `packages/core/src/contract.ts`: `DATE_TIME_RE`. `packages/core/src/validators.ts`:
  `validateIsoDateTime` y `requireExactKeys` con claves opcionales.
- `packages/core/src/blocks.ts`: `at` es opcional y, cuando está, se valida.
- `packages/core/src/edit.ts`: `newEvent` recibe el **instante** y escribe `date` y `at`.
  Las cuatro llamadas —`mutate.ts`, `create.ts` y `release.ts` ×2— pasan el instante que ya
  calculaban.
- `packages/engine/src/etapas.ts` (nuevo): `duracionesPorEtapa` resta las marcas del
  workflow y `duracionEnTexto` las escribe. Se expone en `packages/engine/src/index.ts` y en
  la reanudación compacta: `ResumeContext.etapas` y el bloque «Duración por etapa» de
  `RenderResumeContext`.

### Desvíos del plan aprobado

- **El paso 1 decía meter las llamadas de Hermes «en el mismo mapa por mensaje» de opencode.**
  Ese mapa existe para repartir el coste por mensaje, y Hermes no tiene coste por mensaje:
  meterlas ahí habría inventado un reparto. El conteo se hace aparte y el coste se declara no
  atribuible, que es el paso 3 del mismo plan.
- **Los criterios 4, 5 y 6 cambiaron de comando y dos de redacción.** El 4 hablaba de `value.ts`
  y de «las dos cantidades», y la que el PO veía en cero estaba en el resumen de la foto
  (`timeline.ts`): ahí está la prueba. El 5 y el 6 apuntaban a `tests/transitions.test.ts` y
  `tests/timeline.test.ts`, que son de tablas de estados y de la línea de tiempo; los suyos
  son `tests/eventos-con-hora.test.ts` y `tests/etapas.test.ts`.
- **Se extendió el reconocimiento del CLI, que el plan no pedía.** El plan daba por hecho
  que una sesión que trabaja el harness «ya entra por la vía de Hermes», y no entraba: sin
  reconocer el CLI del propio repositorio, trabajar el harness desde su código quedaba
  invisible. El arreglo del conteo no servía de nada sin el arreglo de la atribución, así
  que los dos van acá.
- **La duración por etapa vive en el motor, no en la línea de tiempo.** El plan nombraba los
  dos; `resume.ts` es donde el agente la necesita al retomar, y es determinista sin leer la
  base de nadie.

## Pruebas

- `npx vitest run tests/hermes.test.ts tests/timeline.test.ts tests/etapas.test.ts tests/eventos-con-hora.test.ts`
  — 40 pruebas pasan (19 + 12 + 4 + 5), las de este ticket entre ellas: el rojo se vio
  primero, y la de atribución falló con `expected [] to deeply equal [ '20260924_140000_ffffff' ]`
  antes del arreglo y la de reconocimiento con `expected false to be true`.
- `npm test` — 1.415 pruebas pasan, 48 omitidas, una suite omitida. Las que ya existían
  siguen pasando con `at` en los eventos: el campo es opcional, así que no hubo migración.
- Contra el **registro real**, con Mission Control reiniciado para que cargara el motor
  reconstruido: la línea de tiempo de este ticket muestra la sesión de Hermes que lo
  trabajó —`hermes:desktop`, `deepseek-v4.1-flash`, $0.229688, 1.474 mensajes, 52 sobre el
  registro— donde antes no aparecía ninguna.
- **La compuerta mecánica** (`gate qa-mechanical`) pasó 6/6 en 1.00 con $0 corriendo los seis
  comandos declarados, pero su recibo guarda el hash de estado del ticket **anterior** a este
  último cambio de texto, y esa compuerta sólo se puede correr con el ticket en `in_progress`
  —desde `awaiting_user_tests` el motor la rechaza a propósito, porque el veredicto no
  significaría nada—. Los seis comandos se volvieron a correr a mano contra el código final y
  las 40 pruebas pasan. Se dice acá para que nadie lea ese recibo como si cubriera este cambio.
- `npm run build` y `npm run typecheck` — pasan.
- `npx prettier --write` sobre los dieciocho archivos tocados; quedan tres avisos previos y
  ajenos a este ticket (`packages/engine/src/append.ts`, `packages/engine/src/features.ts`,
  `tests/anexar-a-feature.test.ts`).

### Resultado del PO

- Resultado del PO: «ya verifique las pruebas y esta bien todo pasa, podemos cerrar el ticket y
  sobre los archivos porfa realizales un commit aparte». Verificó las dos órdenes del contrato
  —`npx vitest run tests/hermes.test.ts tests/timeline.test.ts tests/etapas.test.ts
  tests/eventos-con-hora.test.ts` y `npm test`— y las miró en la pantalla.

### Contrato de pruebas para el responsable

Desde `/Users/juanandrade/Desktop/ValmenHarness`:

- `npx vitest run tests/hermes.test.ts tests/timeline.test.ts tests/etapas.test.ts tests/eventos-con-hora.test.ts`
  — las pruebas de lo que cambió.
- `npm test` — la suite entera.

Nada manual. Lo que hay que mirar, en cambio, no lo cubre una prueba: la línea de tiempo de
un ticket trabajado desde Hermes debe decir «N de M mensajes tocaron el registro» y declarar
el costo sin repartir, en vez de mostrar un cero con la palabra «harness».

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-27",
    "build_reference": "commit:070cda36d04d7af904d31414389c5c37276ef10d",
    "environment": "local: macOS 27.0, Node v22.16.0",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-27",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "ya verifique las pruebas y esta bien todo pasa, podemos cerrar el ticket y sobre los archivos porfa realizales un commit aparte"
  }
]
```

## Evidencia

```json
[]
```

## Retests

```json
[]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-27",
    "technical_summary": "En packages/server/src/hermes.ts, esIntervencionDelHarness reconoce las tres formas de tocar el registro —valmen_* de opencode, mcp__valmen__* y mcp__valmen_<perfil>__* de Hermes, y una llamada de shell que invoca el CLI, tanto el comando instalado como el del propio repositorio (INVOCACION_DEL_CLI_RE, subcomandoDeValmen)— y la sesion cuenta mensajes e intervencionesDelHarness. ticketsDeSesion marca el ticket como trabajado tambien por el CLI (escribePorCli), que es lo que faltaba para que la sesion se atribuyera al ticket. En packages/server/src/timeline.ts, DesgloseDeTrabajo gana costeNoAtribuibleUsd, parteDelDesglose y renderDesglose reemplazan el resumen «harness/exploracion», SesionDeAgente gana mensajes y mensajesDelRegistro, y mensajesDelRegistroEnTexto escribe «N de M mensajes tocaron el registro»; el campo harnessUsd de los recibos pasa a compuertasUsd (packages/engine/src/value.ts). En packages/core, DATE_TIME_RE y validateIsoDateTime validan la hora, requireExactKeys acepta claves opcionales y newEvent escribe at ademas de date; mutate.ts, create.ts y release.ts le pasan el instante. packages/engine/src/etapas.ts (nuevo) calcula duracionesPorEtapa y la reanudacion compacta la expone. Pruebas: tests/hermes.test.ts, tests/timeline.test.ts, tests/value.test.ts, tests/etapas.test.ts y tests/eventos-con-hora.test.ts (40 en los cuatro archivos). 1.415 pruebas pasan; build, typecheck y format:check en verde.",
    "functional_summary": "El PO ve lo que pidio: la linea de tiempo de un ticket trabajado desde Hermes nombra la sesion, dice cuantos de cuantos mensajes tocaron el registro y declara el costo que no se puede repartir en vez de mostrarlo como cero o llamarlo exploracion; y valmen resume y la reanudacion compacta traen la duracion de cada etapa —analisis, plan, implementacion—, con «no reconstruible» para los tickets cuyos eventos no tienen hora. Nada de esto afloja una compuerta.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin migraciones: at es opcional y los tickets ya escritos siguen validando. Los tickets anteriores a este cambio no se pueden medir por etapa —no tienen hora— y la medicion empieza en los eventos nuevos. Cambia el texto del resumen de consumo en la pantalla y agrega dos campos a la lectura de sesiones; el campo renombrado en el valor del ticket no se persiste. Las sesiones compartidas siguen fuera de los totales del ticket, ahora dichas como tales."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-09-27",
    "session_reference": null,
    "model": "typesafe/jev-1.13-20260917",
    "reasoning_effort": null,
    "notes": "Las compuertas de este ticket: una corrida del gate de plan a $0.000141036 y el gate mecanico con coste 0, sobre el commit 070cda3. Suma verificable en los recibos.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": 0.000141036,
    "source": "process:.valmen/receipts/IMPROVEMENT-MC-REGISTRO-COSTO-TIEMPO-20260926.jsonl",
    "confidence": "high",
    "id": "CONSUMO-001"
  },
  {
    "kind": "ai-usage",
    "date": "2026-09-27",
    "session_reference": "20260926_182737_425c0d",
    "model": null,
    "reasoning_effort": null,
    "notes": "La sesion que trabajo este ticket ya declaro su costo en FEATURE-ENGINE-REANUDAR-COMPACTO-20260926 (CONSUMO-001, $0.229688). Registrarla otra vez contaria dos veces el mismo gasto; la linea de tiempo de este ticket la muestra marcada como compartida, porque trabajo cinco tickets y su costo no se reparte entre ellos.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion 20260926_182737_425c0d",
    "confidence": "low",
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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-26",
    "at": "2026-09-27T02:00:58.226Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-26",
    "at": "2026-09-27T02:29:32.919Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-26",
    "at": "2026-09-27T02:29:33.043Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-26",
    "at": "2026-09-27T02:29:33.163Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-26",
    "at": "2026-09-27T02:29:33.284Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-26",
    "at": "2026-09-27T02:29:33.403Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-26",
    "at": "2026-09-27T02:29:33.525Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-26",
    "at": "2026-09-27T02:29:33.793Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-26",
    "at": "2026-09-27T02:29:33.911Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
