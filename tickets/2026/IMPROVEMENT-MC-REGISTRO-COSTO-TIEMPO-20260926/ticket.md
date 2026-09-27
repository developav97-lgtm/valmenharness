---
schema_version: 2
id: IMPROVEMENT-MC-REGISTRO-COSTO-TIEMPO-20260926
title: Registrar el costo y el tiempo de un ticket cuando el harness se maneja desde Hermes o desde el CLI
type: IMPROVEMENT
module: MC
workflow_status: in_progress
qa_status: pending
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

- [ ] Una sesión de Hermes cuyas llamadas usaron el harness cuenta sus intervenciones, sin depender de la base de opencode.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [ ] Una llamada `mcp__valmen__…` y una llamada de shell que ejecuta `valmen` cuentan las dos como intervención sobre el registro, y una llamada ajena no.
      <!-- test: npx vitest run tests/timeline.test.ts -->
- [ ] El tramo de una sesión sin costo por mensaje se declara no atribuible, y su nota dice cuántos mensajes de cuántos tocaron el harness.
      <!-- test: npx vitest run tests/timeline.test.ts tests/cierre-consumo.test.ts -->
- [ ] Un ticket cuyas compuertas costaron no muestra la cantidad del harness en cero: las dos cantidades se nombran distinto.
      <!-- test: npx vitest run tests/value.test.ts -->
- [ ] Un evento nuevo lleva `at` con hora, y un ticket ya escrito sin `at` sigue validando.
      <!-- test: npx vitest run tests/transitions.test.ts -->
- [ ] La duración por etapa se calcula desde las marcas con hora, y un ticket sin ellas se declara no reconstruible en vez de estimarse.
      <!-- test: npx vitest run tests/timeline.test.ts -->

## Puntos

```json
[]
```

## Implementación

Pendiente.

## Pruebas

Pendiente de ejecución.

## QA

```json
[]
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
[]
```

## Consumo de IA

```json
[]
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
  }
]
```
