---
schema_version: 2
id: BUGFIX-GATE-STATEHASH-ARCHIVOS-CITADOS-20261009
title: El recibo guarda el estado con archivos citados y la aprobación lo recalcula sin ellos
type: BUGFIX
module: GATE
workflow_status: awaiting_user_tests
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-09
updated: 2026-10-09
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-GATE-STATEHASH-ARCHIVOS-CITADOS-20261009

## Solicitud original

El PO dijo el 2026-10-09, al cerrar IMPROVEMENT-GATE-PRECHECK-CITAS-WORKTREE-20261009 sin corrida real: «si hay un error con esas dos yo te abro un bugfix», y al aparecer el error eligió por AskUserQuestion «Abrirlo y hacerlo ya (Recomendado)». Síntoma: `valmen approve-by-authorization` rechaza dos veces el plan de IMPROVEMENT-ENGINE-CONSUMO-SUBAGENTES-POR-TICKET-20261009 con «El recibo … de la compuerta plan evaluó otro texto del ticket (cambió después de la compuerta)» aunque el texto no cambió entre la compuerta y la aprobación. Causa observada por el orquestador: desde f031e65 la compuerta añade `archivos_citados` al estado antes de calcular el stateHash del recibo (packages/engine/src/gate.ts:469-480), y quien lo compara lo recalcula con `buildGateState(texto)` sin las citas: packages/engine/src/approval-eligibility.ts:364, packages/engine/src/reviewer.ts:224 y :438, packages/engine/src/next-step.ts:411, packages/server/src/gates.ts:256, :559 y :687, packages/cli/src/hermes.ts:622. Mientras no se arregle, ningún plan con citas en el diagnóstico se aprueba por autorización y las aprobaciones van por persona.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
- Este ticket modifica la compuerta que lo evalúa (el cálculo del `stateHash` de los recibos de `analysis` y `plan`). Por la regla «un gate no amplía su propia autoridad» (AGENTS.md, «Acciones que nunca se automatizan»), **sus compuertas las decide una persona**: no se aprueba por autorización (`approve-by-authorization`) ni por el revisor, aunque el recibo salga en `approve`. Pregunta al PO: ninguna; queda declarado.
- Recibos ya escritos desde f031e65 con `archivos_citados` en su hash (8 recibos de análisis y plan, en FEATURE-MC-PANTALLA-AUTORIZACIONES-20261009 e IMPROVEMENT-ENGINE-CONSUMO-SUBAGENTES-POR-TICKET-20261009): con la opción que elija el plan quedan obsoletos y se vuelve a correr su compuerta o los aprueba una persona. Pregunta al PO, si quiere otra cosa: ¿hace falta una compatibilidad que los siga aceptando? Supuesto del análisis: no, porque hoy ya fallan.
- Decisión del PO, 2026-10-09 (AskUserQuestion, ante el REVIEW del recibo `GR-20261009-BUGFIX-GATE-STATEHASH-ARCHIVOS-CITADOS-20261009-plan-1`): «Partir C7-C9 y repetir (Recomendado)». Se parten C7, C8 y C9 en criterios de una sola afirmación y se repite la compuerta `plan`; la opción (b), citas fuera del `stateHash`, queda como plan.

## Descripción funcional

- Alcance: que el hash del estado de un recibo de `analysis` o `plan` se calcule igual en la compuerta que la escribe y en todo lo que después lo compara, tenga o no el diagnóstico rutas citadas.
- Usuario o rol afectado: el PO y el orquestador que aprueban por autorización; el revisor; la pantalla de compuertas del servidor y la aprobación por código de Telegram (hermes).
- Comportamiento actual: un ticket cuyo diagnóstico cita rutas existentes recibe un recibo cuyo `stateHash` incluye `archivos_citados`; `valmen approve-by-authorization` lo rechaza con «evaluó otro texto del ticket (cambió después de la compuerta)» aunque el texto no cambió, la pantalla lo marca obsoleto y el revisor no lo acepta. Ningún plan con citas se aprueba por autorización.
- Comportamiento esperado: con el texto sin cambios, la aprobación por autorización, el revisor, la pantalla y hermes reconocen el recibo como vigente; un cambio real del texto del ticket sigue dejándolo obsoleto (AP-007).

## Diagnóstico

- Causa comprobada (con `ruta:línea`): `packages/engine/src/gate.ts:469` arma el estado con `buildGateState(ticket.text)` y en `packages/engine/src/gate.ts:476-480`, solo para `analysis` y `plan` y solo si hay citas, le añade `archivos_citados` (salida de `citedFiles`, `packages/engine/src/revision-previa.ts:181`). Ese mismo objeto se hashea en `packages/engine/src/gate.ts:502` para la guarda de repetición y llega a `buildReceipt` (`packages/engine/src/gate.ts:871`), que guarda `stateHash: hashState(input.state)` (`packages/gate/src/receipt.ts:364`). Quien compara recalcula `hashState(buildGateState(texto))` (`packages/engine/src/state.ts:20`) sin las citas, así que los hashes nunca coinciden cuando hay al menos una cita. Comprobado en el ticket afectado con un script de solo lectura sobre `dist`: sin citas `sha256:5d264f28…`, con sus 10 citas `sha256:e6fbd843…`.
- Hipótesis pendientes: ninguna sobre la causa. Pendiente de decidir en el plan: (a) un único cálculo del estado con citas compartido por la compuerta y por los comparadores, o (b) que `archivos_citados` vaya al evaluador pero quede fuera del `stateHash`.
- Consumidores afectados (comparan un recibo de `analysis`/`plan` contra el hash sin citas): `packages/engine/src/approval-eligibility.ts:364` (`aprobarPorAutorizacion`, el síntoma); `packages/engine/src/reviewer.ts:224` (`prepararRevision`) y `packages/engine/src/reviewer.ts:438` (`barrerasDelRegistro`); `packages/server/src/gates.ts:256` (`currentStateHash`, usado por `runTicketGate` en `packages/server/src/gates.ts:465`), `packages/server/src/gates.ts:559` (`listGateDecisions`, marca `stale`) y `packages/server/src/gates.ts:687` (`recordHumanDecision`); `packages/cli/src/hermes.ts:622` (`decideByCode`, rechaza el código de Telegram). No afectados aunque recalculan igual: `packages/engine/src/next-step.ts:411` y `packages/engine/src/transition.ts:210`, que comparan el recibo de `qa-mechanical`, cuyo estado no lleva citas. `elegibilidadDeAprobacion` (`packages/engine/src/approval-eligibility.ts:93`) no compara hashes: dice «elegible» y la aprobación falla después.
- Archivos y flujo investigados: `packages/engine/src/gate.ts:465-510` (estado, citas, guarda de repetición), `packages/engine/src/gate.ts:138` (`chequeoDeArchivosCitados`, que deja el resultado de las citas en `mechanicalChecks` del recibo), `packages/engine/src/gate.ts:745` (estado que recibe el evaluador), `packages/engine/src/simulate.ts:177` (el simulador arma el estado sin citas), `tests/revision-previa.test.ts:400` (C11 de f031e65, que comprueba las citas en el estado del evaluador) y `tests/elegibilidad-aprobacion.test.ts` (fija recibos con `state: { ticket }`, por eso no detectó el desacuerdo). Memoria: `buscar_memoria` no devuelve este fallo; AP-007 (`.valmen/memory/aprendizajes.md:60`) es la razón de la comparación.
- Riesgos y compatibilidad: las citas dependen del disco y de la raíz (`citedFiles` resuelve contra `paths.root`): un archivo citado que se borra, una línea que deja de existir o correr la compuerta en un worktree y aprobar desde el checkout principal cambian el resultado sin que cambie el texto; meterlas en el hash vuelve frágil la comparación. Sacarlas del hash debilita la guarda de repetición (`packages/engine/src/gate.ts:508`): reevaluar tras restaurar un archivo citado, con el texto igual, pediría `--force-reason`. Los 8 recibos de `analysis`/`plan` escritos desde f031e65 con citas quedan obsoletos (ya lo están hoy para los comparadores). El simulador (`packages/engine/src/simulate.ts:177`) evalúa un estado sin citas: diferencia distinta de este síntoma.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Decisión del PO el 2026-10-09 por AskUserQuestion: «Aprobar el plan (Recomendado)».
- Decisión de diseño: **(b) `archivos_citados` va al evaluador y queda fuera del `stateHash`**. Motivo: el `stateHash` responde «¿cambió el texto del ticket?» (AP-007), y el texto del diagnóstico, de donde salen las citas, ya está en el hash por `investigacion`. La opción (a) haría depender el hash del disco y de la raíz: un recibo escrito en un worktree y aprobado desde el checkout principal, o un archivo citado que pierde líneas al integrar otro ticket, quedaría obsoleto sin que cambie el texto; además obliga a pasar `root` y el id de la compuerta a ocho comparadores, dos de los cuales (`next-step.ts:411`, `transition.ts:210`) ni siquiera comparan recibos con citas. La auditoría de las citas no se pierde: el recibo conserva su resultado en el check mecánico `archivos_existen` (`packages/engine/src/gate.ts:138`).
- Alcance: el cálculo del estado en `runGate`; una prueba nueva que reproduce el fallo y su control.
- Exclusiones: el simulador (`packages/engine/src/simulate.ts:177`), que evalúa un estado sin citas, queda para otro ticket si el PO lo pide; no se reescriben ni migran recibos ya escritos (append-only).
- Pasos ordenados:
  1. Crear `tests/statehash-archivos-citados.test.ts`, un `it` por criterio con el nombre que empieza por su número («C1.», «C2.»…). Montaje común: laboratorio temporal con carpeta `.git` y `packages/x/y.ts` de 3 líneas; ticket fijo con `writeFixtureTicket` en `analyzed` cuyo diagnóstico cita `` `packages/x/y.ts:2` `` (o ninguna ruta, para C2); `runGate(paths, { gateId: "plan", ticketId, jev })` con un `jev` falso que responde 0.95 a todo (patrón de `tests/revision-previa.test.ts:358-378`), o 0.5 a todo para obtener el recibo `review` de C9; una autorización de aprobación creada con `crearAutorizacionDeAprobacion` (patrón `autorizar` de `tests/elegibilidad-aprobacion.test.ts:113`). Cada caso: C1, C2 y C6 llaman `aprobarPorAutorizacion` y comprueban `registrada`; C5 añade una línea al «Diagnóstico» con `writeFileSync` y espera el error; C3 compara `readReceipts(...)[0].stateHash` con `hashState(buildGateState(texto))`; C7 y C8 llaman `listGateDecisions(paths, ticketId)` de `packages/server/src/gates.ts` antes y después de editar; C9 llama `barrerasDelRegistro` con el id del recibo `review` y filtra los motivos que empiezan por «estado:»; C10 y C11 corren `runGate` dos veces y leen `stderr` y `readReceipts`; C12 lee `mechanicalChecks` del recibo. Correrla antes del arreglo: C1, C3, C6, C7 y C9 deben fallar con el síntoma; C2, C5, C8, C10, C11 y C12 pasar. (C1, C2, C3, C5, C6, C7, C8, C9, C10, C11, C12)
  2. En `packages/engine/src/gate.ts`, `runGate` (líneas 465-510): conservar `state = buildGateState(ticket.text)` como el estado que se hashea y construir aparte `estadoDelEvaluador = { ...state, archivos_citados }` solo cuando hay citas; `hashDelEstado` (línea 502) y `buildReceipt` (línea 871) usan `state`, y `evaluateGate` (línea 745) usa `estadoDelEvaluador`. El check `archivos_existen` no cambia. (C1, C3, C4, C6, C7, C9, C10, C11, C12)
  3. En `packages/engine/src/state.ts:1-19`, ampliar el comentario de `buildGateState`: es la definición del hash del recibo, y lo que se deriva del disco va al evaluador, no al hash. Sin cambio de comportamiento. (C3)
  4. No tocar los comparadores (`approval-eligibility.ts:364`, `reviewer.ts:224` y `:438`, `server/src/gates.ts:256`, `:559` y `:687`, `cli/src/hermes.ts:622`): con el paso 2 vuelven a coincidir con el recibo, y siguen detectando un cambio real del texto. (C1, C5, C7, C8, C9)
  5. Correr la prueba nueva, `tests/elegibilidad-aprobacion.test.ts`, `tests/revision-previa.test.ts` (incluye su C11, que verifica C4), `tests/compuerta-repetida.test.ts` y `npx tsc --build tsconfig.build.json`. (C4, C13, C14, C15, C16)
- Compatibilidad: los 8 recibos de `analysis`/`plan` escritos desde f031e65 con citas siguen sin coincidir (ya fallan hoy): se vuelve a correr su compuerta o los aprueba una persona. Tras restaurar un archivo citado con el texto igual, repetir la compuerta pide `--force-reason`; la revisión previa (`valmen precheck`) detecta antes la cita inexistente.
- Impactos declarados: ninguno (sin sincronización, migración ni contenedores).
- Rollback (obligatorio): revertir el commit del ticket. Los recibos escritos con el arreglo tienen el hash sin citas, el mismo que ya calculan los comparadores del código anterior, así que siguen valiendo tras revertir.

<!-- Los criterios de la sección siguiente se numeran C1…Cn, con una afirmación verificable por criterio
     —una frase con «y» son dos criterios—, y cada uno lleva debajo su anotación de
     verificación: un comentario HTML que dice «test:» y el comando, o «verify: manual». La
     sección no lleva comentarios dentro: un comentario con anotación se leería como la de un
     criterio. Ejemplo en la skill planificacion. -->
## Criterios de aceptación

- [x] C1. En un ticket temporal cuyo diagnóstico cita `packages/x/y.ts:2` (existente), tras la compuerta `plan` en `approve` con evaluador falso, `aprobarPorAutorizacion` devuelve `registrada: true`.
      <!-- test: npx vitest run tests/statehash-archivos-citados.test.ts -t "C1\." -->
- [x] C2. Control: en un ticket temporal cuyo diagnóstico no cita rutas, tras la compuerta `plan` en `approve` con evaluador falso, `aprobarPorAutorizacion` devuelve `registrada: true`.
      <!-- test: npx vitest run tests/statehash-archivos-citados.test.ts -t "C2\." -->
- [x] C3. El `stateHash` del recibo `plan` de un ticket con citas es igual a `hashState(buildGateState(texto))` del mismo texto.
      <!-- test: npx vitest run tests/statehash-archivos-citados.test.ts -t "C3\." -->
- [x] C4. Con la cita `packages/x/y.ts:2`, el estado que recibe el evaluador contiene `archivos_citados` con el texto `packages/x/y.ts:2: existe`.
      <!-- test: npx vitest run tests/revision-previa.test.ts -t "C11" -->
- [x] C5. Si se añade una línea al «Diagnóstico» después de la compuerta `plan`, `aprobarPorAutorizacion` lanza un error que contiene «evaluó otro texto».
      <!-- test: npx vitest run tests/statehash-archivos-citados.test.ts -t "C5\." -->
- [x] C6. Si se borra `packages/x/y.ts` del laboratorio después de la compuerta `plan`, con el texto del ticket intacto, `aprobarPorAutorizacion` devuelve `registrada: true`.
      <!-- test: npx vitest run tests/statehash-archivos-citados.test.ts -t "C6\." -->
- [x] C7. Tras la compuerta `plan` sobre un ticket con citas, sin editar el ticket, `listGateDecisions` devuelve `stale: false` para ese recibo.
      <!-- test: npx vitest run tests/statehash-archivos-citados.test.ts -t "C7\." -->
- [x] C8. Tras añadir una línea al «Diagnóstico» de ese ticket, `listGateDecisions` devuelve `stale: true` para el mismo recibo.
      <!-- test: npx vitest run tests/statehash-archivos-citados.test.ts -t "C8\." -->
- [x] C9. Con un recibo `plan` en `review` de un ticket con citas, sin editar el ticket, ninguno de los motivos que devuelve `barrerasDelRegistro` empieza por «estado:».
      <!-- test: npx vitest run tests/statehash-archivos-citados.test.ts -t "C9\." -->
- [x] C10. Una segunda corrida de `runGate` para `plan` sobre el mismo ticket con citas, con el mismo evaluador falso, termina con un `stderr` que contiene «ya se evaluó sobre este mismo estado».
      <!-- test: npx vitest run tests/statehash-archivos-citados.test.ts -t "C10\." -->
- [x] C11. Tras esa segunda corrida, el archivo de recibos del ticket sigue con exactamente 1 recibo `plan`.
      <!-- test: npx vitest run tests/statehash-archivos-citados.test.ts -t "C11\." -->
- [x] C12. El recibo `plan` de un ticket con la cita `packages/x/y.ts:2` contiene el check mecánico `archivos_existen` con `result: "pass"` y el detalle «1 ruta(s) citada(s) existen».
      <!-- test: npx vitest run tests/statehash-archivos-citados.test.ts -t "C12\." -->
- [x] C13. Las pruebas existentes de aprobación por autorización siguen pasando.
      <!-- test: npx vitest run tests/elegibilidad-aprobacion.test.ts -->
- [x] C14. Las pruebas existentes de la revisión previa siguen pasando.
      <!-- test: npx vitest run tests/revision-previa.test.ts -->
- [x] C15. Las pruebas existentes de la compuerta repetida siguen pasando.
      <!-- test: npx vitest run tests/compuerta-repetida.test.ts -->
- [x] C16. El monorepo compila sin errores.
      <!-- test: npx tsc --build tsconfig.build.json -->

## Puntos

```json
[]
```

## Implementación

- `packages/engine/src/gate.ts` (`runGate`): el estado que se hashea y se guarda en el recibo es `buildGateState(ticket.text)`; aparte se arma `estadoDelEvaluador`, que añade `archivos_citados` solo cuando hay citas, y es el que recibe `evaluateGate`. El check `archivos_existen` no cambia.
- `packages/engine/src/state.ts`: el comentario de `buildGateState` declara que es la definición del hash del recibo y que lo derivado del disco va al evaluador, no al hash. Sin cambio de comportamiento.
- `tests/statehash-archivos-citados.test.ts`: prueba nueva, un `it` por criterio C1-C3 y C5-C12. Antes del arreglo fallaron C1, C3, C6, C7 y C9 (el síntoma); C2, C5, C8, C10, C11 y C12 pasaron (controles).
- Los ocho comparadores no se tocaron.

## Pruebas

Directorio de ejecución: raíz del worktree/repositorio. Sin requisitos de ambiente (raíces temporales, reloj fijo, evaluador falso). Validaciones manuales: ninguna.

- `npx vitest run tests/statehash-archivos-citados.test.ts` — esperado: 11 pruebas pasan (C1-C3, C5-C12).
- `npx vitest run tests/elegibilidad-aprobacion.test.ts tests/revision-previa.test.ts tests/compuerta-repetida.test.ts` — esperado: pasan (incluye C11 de revisión previa = criterio C4).
- `npx vitest run tests/gate-*.test.ts tests/agente-revisor.test.ts tests/aprobacion-*.test.ts tests/autorizacion-aprobacion*.test.ts tests/firma-de-compuerta.test.ts tests/mission-control.test.ts tests/recibo-motivos.test.ts tests/process-gates.test.ts` — esperado: pasan.
- `npx tsc --build tsconfig.build.json` — esperado: sin errores.

Resultado medido por el implementador: 119 pruebas (nueva + elegibilidad + revisión previa + compuerta repetida) y 555 pruebas de gates/recibos/revisor/Mission Control pasaron; tsc sin errores. La suite completa queda al orquestador.

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
[
  {
    "kind": "ai-usage",
    "date": "2026-10-09",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión de subagente sin acceso a los números de la sesión; sin cifras.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:subagente-implementacion",
    "confidence": "low",
    "id": "CONSUMO-001"
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
    "date": "2026-10-09",
    "at": "2026-10-09T15:03:55.881Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-09",
    "at": "2026-10-09T15:08:02.757Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-09",
    "at": "2026-10-09T15:10:19.453Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-09",
    "at": "2026-10-09T15:22:54.366Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por PO (recibo GR-20261009-BUGFIX-GATE-STATEHASH-ARCHIVOS-CITADOS-20261009-plan-2, canal cli, decidida 2026-10-09T15:22:54.349Z): PO por AskUserQuestion: \"Aprobar el plan (Recomendado)\" (solo C4 en banda, 0.895)"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-09",
    "at": "2026-10-09T15:22:56.164Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"PO\",\"source\":\"cli\",\"quote\":\"Aprobar el plan (Recomendado)\",\"planHash\":\"sha256:2ad93e152cfb1cffd8cc58e8d56b5f27a10e26dd5b838d3799aed2a22a64420d\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-09",
    "at": "2026-10-09T15:22:57.716Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: PO (fuente cli), plan sha256:2ad93e152cfb1cffd8cc58e8d56b5f27a10e26dd5b838d3799aed2a22a64420d."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-09",
    "at": "2026-10-09T15:22:57.716Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-09",
    "at": "2026-10-09T15:23:34.987Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-09",
    "at": "2026-10-09T15:25:52.732Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-09",
    "at": "2026-10-09T15:28:32.444Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  }
]
```
