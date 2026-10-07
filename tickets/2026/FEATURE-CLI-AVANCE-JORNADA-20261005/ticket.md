---
schema_version: 2
id: FEATURE-CLI-AVANCE-JORNADA-20261005
title: Avanzar la jornada sin modelo e instalar el disparador launchd
type: FEATURE
module: CLI
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

# FEATURE-CLI-AVANCE-JORNADA-20261005

## Solicitud original

Parte del sprint: Jornada autónoma sobre el motor de jornadas, después de la salida de S1 a S3: preparación hasta el plan, aprobación en lote, ejecución hasta las pruebas, topes, avisos y commit por ticket sin push.
- R-JORN-002: Un disparador sin modelo DEBE avanzar la jornada
Depende de: FEATURE-ENGINE-JORNADA-DIARIA-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: un comando de avance de la jornada, idempotente y sin llamadas a modelos, que despache lo que la jornada y la capacidad permitan (R-JORN-002), y la forma de instalarlo como tarea periódica de la máquina (launchd en macOS): `valmen journey advance` y `valmen journey install-trigger`. Fuera de alcance: el job de Hermes sin agente (R-JORN-011, es el ticket `INTEGRATION-HERMES-DESPACHO-JORNADA-20261001`), la fase de preparación y la de ejecución (tickets siguientes) y los topes y paradas.
- Usuario o rol afectado: el responsable que quiere que las tareas del día avancen solas sin crear un cron por ticket, y la máquina donde corre el disparador.
- Comportamiento actual: `dispatchJourney` sabe iniciar como máximo una ejecución de una jornada con reserva de capacidad, pero nada lo llama de forma periódica: se invoca desde pruebas o desde un prompt de Hermes por eslabón.
- Comportamiento esperado: `valmen journey advance --project <id> [--journey <id>]` resuelve la jornada del día (`JOR-<AAAAMMDD>`) o la indicada, llama al despacho con una identidad estable y reporta qué hizo (despachó un ticket, ya estaba despachado o no había candidato y por qué); correrlo dos veces seguidas no despacha un segundo ticket ni duplica el primero; sin jornada del día lo dice y sale bien. `valmen journey install-trigger --project <id> [--every <minutos>] [--write]` imprime el plist de launchd y los comandos exactos de `launchctl` para activarlo, y con `--write` escribe solo el archivo en `~/Library/LaunchAgents`; el harness nunca ejecuta `launchctl` por su cuenta.

## Diagnóstico

- Archivos y flujo investigados: `dispatchJourney` en `packages/engine/src/journey-dispatch.ts:60` concilia la capacidad de la máquina (`reconcileMachineCapacity`), selecciona con `selectJourneyTickets`, reserva con `claimMachineCapacity` y lanza `runAutonomous` con el ejecutor de la política, y ya devuelve `already-dispatched` si la misma identidad conserva su reserva; la identidad la forman proyecto, ticket y `executionId`/`attemptId` que aporta quien llama; `armarJornada` (ticket anterior, `packages/engine/src/journey-plan.ts`) escribe `JOR-<AAAAMMDD>`; los comandos de la CLI se registran en `packages/cli/src/main.ts` y se implementan en `packages/cli/src/commands.ts`.
- Causa raíz o hipótesis: falta el borde que invoca el despacho de forma segura y repetible; la idempotencia ya vive en la reserva y en la selección, así que basta con aportar una identidad estable y con no tener lógica propia de despacho. Comprobado: no hay referencia a `launchd` ni a plist en `packages/*/src`. El disparador no llama a ningún modelo: lo único que lanza es el ejecutor que la política del proyecto declara, a través del despacho existente.
- Riesgos y compatibilidad: instalar una tarea periódica es persistente en la máquina, por eso el comando solo **prepara** —imprime el plist y los comandos— y escribe el archivo únicamente con `--write`; activarlo (`launchctl bootstrap`) lo hace una persona. El disparador respeta la política: con la autonomía apagada o sin ejecutor autorizado no inicia nada. Consumidores de `dispatchJourney` comprobados con búsqueda: solo `tests/journey-dispatch.test.ts` y el módulo mismo; este ticket agrega un llamador y no cambia su contrato.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: el comando de avance, el generador del plist y sus pruebas. Exclusiones: job de Hermes, preparación, ejecución, topes y ejecutar `launchctl`.
- Pasos ordenados:
  1. Crear `packages/engine/src/journey-advance.ts` con `avanzarJornada({ project, home, journeyId?, ahora, execute? })`: resuelve `JOR-<AAAAMMDD>` si no se indica, devuelve `sin-jornada` con un mensaje que dice cómo armarla (`valmen journey plan`) si no existe, y si existe llama a `dispatchJourney` con `executionId` igual a la jornada y `attemptId` fijo, y traduce el resultado a un informe (despachado, ya despachado o sin candidato con el motivo de la selección).
  2. Crear `packages/cli/src/journey-trigger.ts` con `renderLaunchdPlist({ projectId, everyMinutes, programa, logDir })` y `triggerInstructions(...)`: el plist usa la etiqueta `com.valmen.jornada.<projectId>`, `StartInterval`, el intérprete y el `main.js` del CLI como `ProgramArguments`, y las instrucciones listan `launchctl bootstrap` y `bootout` con la ruta exacta; el escritor guarda solo el archivo en el directorio indicado.
  3. Registrar en `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` los subcomandos `journey advance` y `journey install-trigger` (banderas `--project`, `--journey`, `--every`, `--write`, `--dir`) con su ayuda; `advance` nunca instala nada e `install-trigger` nunca ejecuta `launchctl`.
  4. Crear `tests/avance-jornada.test.ts` con: despacha un ticket y lo informa, dos avances seguidos no despachan un segundo ticket ni duplican el primero, sin jornada del día lo dice y sale bien, el avance sin ejecutor autorizado no inicia nada, el ejecutor inyectado es lo único que se invoca (ningún modelo), el plist trae etiqueta, intervalo y argumentos, `--write` escribe solo el archivo y no ejecuta `launchctl`; correr esas pruebas, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket y, si se escribió un plist, descargarlo con `launchctl bootout` y borrarlo; sin plist instalado no queda nada que revertir.

## Criterios de aceptación

- [x] `journey advance` despacha lo que la jornada y la capacidad permiten e informa qué hizo
      <!-- test: npx vitest run tests/avance-jornada.test.ts -->
- [x] Dos avances seguidos no despachan un segundo ticket ni duplican el primero
      <!-- test: npx vitest run tests/avance-jornada.test.ts -->
- [x] Sin jornada del día el avance lo dice y explica cómo armarla, y sin ejecutor autorizado no inicia nada
      <!-- test: npx vitest run tests/avance-jornada.test.ts -->
- [x] El avance no llama a ningún modelo: lo único que lanza es el ejecutor de la política
      <!-- test: npx vitest run tests/avance-jornada.test.ts -->
- [x] `install-trigger` imprime el plist de launchd con etiqueta, intervalo y argumentos, y con `--write` escribe solo el archivo sin ejecutar `launchctl`
      <!-- test: npx vitest run tests/avance-jornada.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-CLI-AVANCE-JORNADA-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/journey-advance.ts",
      "packages/engine/src/journey-dispatch.ts",
      "packages/engine/src/index.ts",
      "packages/cli/src/journey-trigger.ts",
      "packages/cli/src/commands.ts",
      "packages/cli/src/main.ts",
      "tests/avance-jornada.test.ts"
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

- `packages/engine/src/journey-advance.ts` (nuevo): `avanzarJornada` resuelve `JOR-<AAAAMMDD>` (o la indicada), responde `sin-jornada` con el comando para armarla, y si existe llama a `dispatchJourney` con una identidad estable (la jornada como `executionId`, intento fijo); informa despachado, ya despachado o sin candidato con los motivos de la selección. No tiene lógica propia de despacho ni llama a un modelo: lo único que se lanza es el ejecutor de la política.
- `packages/engine/src/journey-dispatch.ts`: corrección encontrada al probar —el id de los eventos de actividad no incluía el ticket y el segundo ticket de una jornada chocaba con el del primero («el eventId ya existe con contenido distinto»); ahora el digest lleva el ticket.
- `packages/cli/src/journey-trigger.ts` (nuevo): plist de launchd (`com.valmen.jornada.<proyecto>`, `StartInterval`, argumentos del avance), instrucciones de `launchctl` para que las ejecute una persona y el escritor del archivo.
- `packages/cli/src/commands.ts` y `main.ts`: `journey advance` y `journey install-trigger` (banderas `--journey`, `--every`, `--dir`, `--write`) con ayuda; `install-trigger` nunca ejecuta `launchctl` y sin `--write` no escribe nada.
- `tests/avance-jornada.test.ts` (nuevo, 11 pruebas).

## Pruebas

Desde la raíz del repositorio, Node 24, sin red y sin tocar launchd:

1. `npx vitest run tests/avance-jornada.test.ts tests/journey-dispatch.test.ts` — esperado: 17 pruebas pasan.
2. `npx vitest run` — esperado: 174 archivos pasan y 1 omitido; 2546 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.
4. Manual (opcional, responsable): `valmen journey install-trigger --project <id>` imprime el plist; con `--write` lo escribe y la activación (`launchctl bootstrap …`) la ejecutas tú.

Resultado de la ejecución del agente (2026-10-06): 1–3 dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run (2546 pasan), tsc sin errores

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:d3fecdfa0a42ab11346d73d3182a809674ad59e8",
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
    "description": "npx vitest run (2546 pasan), tsc sin errores",
    "reference": "worktree:sha256:ad0d319a7d9755ce1c6884b8a9f5ec96361bc3532156a3611a64bc0d2061c530",
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
    "technical_summary": "avanzarJornada con identidad estable sobre dispatchJourney; plist de launchd preparado sin ejecutar launchctl; corregido el id de eventos de despacho entre tickets.",
    "functional_summary": "La jornada avanza sola con un comando repetible sin modelo, y el disparador periódico queda listo para activar por una persona.",
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
    "at": "2026-10-06T01:51:50.609Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T03:27:48.951Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T03:28:05.513Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T03:28:27.346Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"delegacion\",\"quote\":\"Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06\",\"planHash\":\"sha256:341b093abaf2dace41a2c5bc824e5faffe076789d1537420863577698dddc086\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T03:28:27.489Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente delegacion), plan sha256:341b093abaf2dace41a2c5bc824e5faffe076789d1537420863577698dddc086."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T03:28:27.489Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T03:28:27.584Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T03:30:53.662Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T03:30:53.760Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T03:30:53.850Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T03:30:53.935Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T03:30:54.015Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T03:30:54.098Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T03:30:54.272Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T03:30:54.471Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T03:30:54.551Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T03:30:54.635Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T03:30:54.720Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T03:30:54.804Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T03:30:54.888Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T03:30:54.971Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-06",
    "at": "2026-10-07T03:30:55.052Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
