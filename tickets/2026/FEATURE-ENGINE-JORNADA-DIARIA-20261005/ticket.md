---
schema_version: 2
id: FEATURE-ENGINE-JORNADA-DIARIA-20261005
title: Configurar la jornada apagada y armarla desde el motor existente
type: FEATURE
module: ENGINE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-05
updated: 2026-10-06
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-JORNADA-DIARIA-20261005

## Solicitud original

Parte del sprint: Jornada autónoma sobre el motor de jornadas, después de la salida de S1 a S3: preparación hasta el plan, aprobación en lote, ejecución hasta las pruebas, topes, avisos y commit por ticket sin push.
- R-JORN-001: El harness DEBE armar la jornada del día desde el motor de jornadas
Depende de: CHORE-ENGINE-SALIDA-COMPUERTAS-CONTROL-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: armar la jornada del día desde el motor de jornadas (R-JORN-001): una función del motor, el comando `valmen journey plan` y la herramienta MCP `armar_jornada` eligen los tickets por dependencias y autorización, escriben la jornada en el registro de jornadas y envían el plan del día por el canal de avisos (Telegram vía Hermes). Programar trabajo no crea jobs de cron por ticket. Fuera de alcance: despachar la jornada (disparador, preparación, ejecución y topes son los tickets siguientes), la elegibilidad por ventana y capacidad, que ya aplica `selectJourneyTickets` al despachar, y aprobar nada.
- Usuario o rol afectado: el responsable que programa el día de trabajo y quien recibe el aviso en el celular.
- Comportamiento actual: el motor sabe guardar jornadas (`createJourney`, `reviseJourney`) y seleccionar candidatos de una jornada ya escrita, pero nada las arma desde el registro ni avisa del plan: una persona o un prompt de Hermes las compone a mano y la programación vive en cron por eslabón.
- Comportamiento esperado: `valmen journey plan --project <id> [--feature <slug> | --tickets <a,b,c>] [--max <n>] [--to telegram]` arma una jornada `JOR-<AAAAMMDD>`: toma los tickets pedidos o los del grafo de la feature, descarta los cerrados, ordena por dependencias, declara en cada uno sus dependencias dentro de la jornada, el ejecutor autorizado por la política del proyecto y la condición `dependencies`, y la escribe como `journey.created` (o `journey.revised` si ya existe la del día, de modo que repetir el comando no duplica nada). Con destino configurado, envía un aviso con los tickets en orden; si el envío falla, la jornada igual queda escrita y el comando lo dice. Sin autorización vigente en la política, no arma nada y explica qué declarar.

## Diagnóstico

- Archivos y flujo investigados: el historial append-only de jornadas está en `packages/engine/src/journeys.ts` (`createJourney`, `reviseJourney`, `readJourneys`, con `JourneyTicketInput`: orden, prioridad, dependencias, inicio, ventana y `authorizationIds`); `selectJourneyTickets` en `packages/engine/src/journey-selection.ts:59` decide después qué ticket sale (workflow `approved`, dependencias cerradas, ventana, autorización con `authorizationIds` y capacidad); la autorización se lee de la política con `readJourneyAuthorization` (`packages/engine/src/journey-authorization.ts`) y el ejecutor declarado en `readAutonomousConfig`; el orden por dependencias del grafo de una feature ya lo calcula `delegationProgress` (`packages/engine/src/delegation.ts`) a partir de `readDecomposition`; el aviso por el celular usa `hermesSendChannel(...).notify(...)` en `packages/cli/src/hermes.ts:1187`; la herramienta de lectura equivalente es `ver_jornadas` en `packages/mcp/src/tools.ts:2408`.
- Causa raíz o hipótesis: las piezas existen separadas —historial, selección, política, canal— y falta la que las une al armar el día. Comprobado: no hay ninguna función que llame a `createJourney` desde el registro de tickets. El motor resuelve el proyecto por su binding de la máquina (`resolveAuthorizedProject`), así que el comando y la herramienta reciben el id lógico del proyecto, como `ver_jornadas`.
- Riesgos y compatibilidad: armar una jornada no cambia workflows, no reserva capacidad ni inicia trabajo (lo declara el propio módulo de jornadas); no concede permisos: si la política no autoriza al ejecutor, el ticket queda sin autorización y la jornada no se arma. Repetir el comando el mismo día revisa la jornada (foto completa nueva), nunca la duplica. El aviso es opcional y su fallo no deshace la escritura. El orden por dependencias solo cubre tickets del grafo de una feature; para una lista suelta rige el orden dado. Los archivos que el cambio toca o crea son: el módulo nuevo del motor para armar la jornada, el registro de comandos en `packages/cli/src/commands.ts` y `packages/cli/src/main.ts`, la herramienta en `packages/mcp/src/tools.ts`, la lista de lectura y escritura en `packages/server/src/hermes.ts` y las pruebas de catálogo `tests/mcp-server.test.ts` y `tests/mcp-anotaciones.test.ts`. La programación por tarea periódica es del ticket del disparador. Consumidores comprobados con búsqueda: `createJourney` y `reviseJourney` solo los llaman `packages/engine/src/journeys.ts` y las pruebas; los lectores del historial son `packages/engine/src/journey-selection.ts`, `packages/engine/src/journey-roadmap.ts` y el propio `journeys.ts`, y todos leen revisiones completas con la forma que este ticket ya respeta, de modo que anexar una revisión nueva no afecta a ninguno.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: armar y escribir la jornada del día, su comando, su herramienta MCP y el aviso del plan. Exclusiones: despachar, preparación, ejecución, topes, ventanas y capacidad.
- Pasos ordenados:
  1. Crear `packages/engine/src/journey-plan.ts` con `armarJornada({ project, fecha, tickets | feature, maximo, ahora })`: lee los tickets (los pedidos o los del grafo de la feature en orden de dependencias), descarta los cerrados, limita a `maximo`, arma cada `JourneyTicketInput` (orden, prioridad, dependencias dentro de la jornada, condición `dependencies`, `authorizationIds` con el ejecutor autorizado por `readJourneyAuthorization`), rechaza si la política no autoriza ningún ejecutor con un mensaje que dice qué declarar —`execution.dispatch-executors` y `autonomous.executor` en `.valmen/config.yaml`— y escribe con `createJourney` o `reviseJourney` según exista `JOR-<AAAAMMDD>`; devuelve la jornada y el texto del plan del día.
  2. Agregar a `packages/cli/src/commands.ts` el comando `journeyPlanCommand` y registrarlo en `packages/cli/src/main.ts` como `journey plan` con las banderas `--project`, `--feature`, `--tickets`, `--max` y `--to`, y su ayuda; el envío usa `hermesSendChannel` y, si falla, imprime el plan y el motivo sin deshacer la escritura.
  3. Agregar la herramienta `armar_jornada` a `packages/mcp/src/tools.ts` (anotada como escritura no destructiva, con `outputSchema` y dato con la jornada y el siguiente paso) y ajustar las listas de `packages/server/src/hermes.ts` y los conteos de `tests/mcp-server.test.ts` y `tests/mcp-anotaciones.test.ts`.
  4. Crear `tests/jornada-diaria.test.ts` con: tres tickets listos y autorización vigente dejan la jornada en el registro con su orden y dependencias y un aviso con los tres, repetir el comando revisa y no duplica, un ticket cerrado se descarta, sin autorización no se arma y el mensaje nombra `execution.dispatch-executors` y `autonomous.executor`, un fallo del envío no deshace la escritura, y ningún cron por ticket; correr esas pruebas, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; las revisiones de jornada son un historial aditivo que el resto del motor ya lee, y quitar el comando no deja nada que migrar.

## Criterios de aceptación

- [x] Con tres tickets listos y una autorización vigente, la jornada queda en el registro con su orden y llega un aviso con los tres tickets
      <!-- test: npx vitest run tests/jornada-diaria.test.ts -->
- [x] El orden respeta las dependencias del grafo de la feature y cada ticket declara sus dependencias dentro de la jornada
      <!-- test: npx vitest run tests/jornada-diaria.test.ts -->
- [x] Repetir el comando el mismo día revisa la jornada y no la duplica
      <!-- test: npx vitest run tests/jornada-diaria.test.ts -->
- [x] Sin autorización vigente en la política no se arma la jornada y el mensaje dice qué declarar
      <!-- test: npx vitest run tests/jornada-diaria.test.ts -->
- [x] Un fallo del envío del aviso no deshace la escritura de la jornada
      <!-- test: npx vitest run tests/jornada-diaria.test.ts -->
- [x] La herramienta MCP `armar_jornada` arma la misma jornada y programar no crea jobs de cron por ticket
      <!-- test: npx vitest run tests/jornada-diaria.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-ENGINE-JORNADA-DIARIA-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/journey-plan.ts",
      "packages/engine/src/delegation.ts",
      "packages/engine/src/index.ts",
      "packages/cli/src/commands.ts",
      "packages/cli/src/main.ts",
      "packages/mcp/src/tools.ts",
      "packages/server/src/hermes.ts",
      "tests/jornada-diaria.test.ts",
      "tests/mcp-server.test.ts",
      "tests/mcp-anotaciones.test.ts"
    ],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- `packages/engine/src/journey-plan.ts` (nuevo): `armarJornada` elige los tickets (los de una feature en orden de dependencias, o una lista en el orden dado), descarta cerrados e inexistentes, limita al máximo, declara por ticket su orden, sus dependencias dentro de la jornada, la condición `dependencies` y el ejecutor autorizado, y escribe `JOR-<AAAAMMDD>` con `createJourney` o, si ya existe, con `reviseJourney`. La política manda: sin ejecutor autorizado falla con un mensaje que nombra `execution.dispatch-executors` y `autonomous.executor`. El aviso va después de escribir y su fallo no deshace nada.
- `packages/engine/src/delegation.ts`: `ordenDelGrafo` extraída de `delegatedTickets` para reutilizar el orden por dependencias.
- `packages/cli/src/commands.ts` y `main.ts`: comando `journey plan --project --feature|--tickets [--max] [--to]` con su ayuda y la bandera `--max`.
- `packages/mcp/src/tools.ts`: herramienta `armar_jornada` (anexa, no idempotente, con `outputSchema` y siguiente paso); `packages/server/src/hermes.ts` la lista como escritura.
- Pruebas: `tests/jornada-diaria.test.ts` (nuevo, 10) y ajustes de catálogo en `tests/mcp-server.test.ts` y `tests/mcp-anotaciones.test.ts` (52 herramientas).
- Hallazgo para tickets siguientes: `autonomous-run` sigue comprobando la aprobación del plan con `hasPlanGate` (la línea del plan); debe pasar a exigir la aprobación registrada de R-CTRL-001.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/jornada-diaria.test.ts` — esperado: 10 pruebas pasan.
2. `npx vitest run tests/mcp-server.test.ts tests/mcp-anotaciones.test.ts` — esperado: todas pasan.
3. `npx vitest run` — esperado: 173 archivos pasan y 1 omitido; 2535 pruebas pasan, 0 fallan.
4. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los cuatro dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run (2535 pasan), tsc sin errores

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:387fac32fd360c17ffdae282acdcfa11efbe70d9",
    "environment": "local (Node 24, vitest)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-07",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-07",
    "kind": "automated-test",
    "description": "npx vitest run (2535 pasan), tsc sin errores",
    "reference": "worktree:sha256:1f62f332893afe63a59a52f4d00d22026ad9e90901a2e57d49b9119ba1b959dc",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-07",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-07",
    "technical_summary": "armarJornada escribe la jornada del día por dependencias y autorización; comando journey plan y herramienta armar_jornada.",
    "functional_summary": "Se puede armar el plan del día en un comando, con aviso por Telegram, sin crear tareas por ticket.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "ninguno"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-07",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión que atendió varios tickets de la delegación; sin números por ticket para no repartir a ojo un costo que no se midió por ticket.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code por delegación DEL-20261006-001",
    "confidence": "medium",
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
    "date": "2026-10-05",
    "at": "2026-10-06T01:51:50.542Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T03:20:48.361Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T03:21:41.403Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T03:22:59.586Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"delegacion\",\"quote\":\"Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06\",\"planHash\":\"sha256:912342ddc8ffaf50c98be3d0042c0f2487fdcf54f12502348c6c98c1f4271d44\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T03:22:59.751Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente delegacion), plan sha256:912342ddc8ffaf50c98be3d0042c0f2487fdcf54f12502348c6c98c1f4271d44."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T03:22:59.751Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T03:22:59.852Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T03:26:48.987Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T03:26:49.110Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T03:26:49.194Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T03:26:49.278Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T03:26:49.362Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T03:26:49.449Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T03:26:49.661Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T03:26:49.903Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T03:26:49.984Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T03:26:50.072Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T03:26:50.163Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T03:26:50.250Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T03:26:50.339Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T03:26:50.425Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-06",
    "at": "2026-10-07T03:26:50.513Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
