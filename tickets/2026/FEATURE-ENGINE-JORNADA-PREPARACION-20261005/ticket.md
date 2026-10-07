---
schema_version: 2
id: FEATURE-ENGINE-JORNADA-PREPARACION-20261005
title: Llevar intake a planned y parar en la aprobación del plan
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

# FEATURE-ENGINE-JORNADA-PREPARACION-20261005

## Solicitud original

Parte del sprint: Jornada autónoma sobre el motor de jornadas, después de la salida de S1 a S3: preparación hasta el plan, aprobación en lote, ejecución hasta las pruebas, topes, avisos y commit por ticket sin push.
- R-JORN-003: La fase de preparación DEBE llevar tickets de intake a planned y detenerse en la aprobación del plan
Depende de: FEATURE-ENGINE-JORNADA-DIARIA-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la fase de preparación de la jornada (R-JORN-003): llevar un ticket de `intake` a `planned` con sus recibos de `analysis` y `plan`, en una sesión por ticket, y **detenerse** con el plan listo para aprobar sin que nadie lo apruebe; si una compuerta queda en `review` o `block`, avisar la decisión pendiente en formato de opciones y efecto. Se invoca con `journey advance --fase preparacion`. Fuera de alcance: aprobar planes en lote (`FEATURE-ENGINE-APROBACION-LOTE-20261005`), la fase de ejecución, el modelo por fase, los topes y las paradas, y el aviso de plan listo.
- Usuario o rol afectado: el responsable, que recibe planes listos para decidir en vez de escribirlos, y el agente que prepara tickets sin poder aprobarlos.
- Comportamiento actual: el despacho existente solo lanza el ejecutor sobre tickets `approved` (`runAutonomous`) y la selección de la jornada trata `intake` como «falta el plan»; nada prepara tickets desde cero.
- Comportamiento esperado: el avance de preparación toma el primer ticket de la jornada en `intake` cuyas dependencias dentro de la jornada ya fueron preparadas, lanza el ejecutor de la política con un prompt de preparación (análisis, plan, validación y compuertas con la cascada; sin aprobar, sin tocar código de la aplicación), y comprueba **en código** al terminar: el ticket está en `planned`, hay recibos vigentes de `analysis` y `plan`, ninguna aprobación del plan está registrada y no se modificó nada fuera del registro. Si una compuerta quedó en `review` o `block` envía un aviso `Decisión / A) opción → efecto / Recomiendo` y deja el ticket como está.

## Diagnóstico

- Archivos y flujo investigados: `runAutonomous` en `packages/engine/src/autonomous-run.ts` construye el comando del ejecutor con `autonomousExecutorCommand`, mueve `approved → in_progress`, corre `qa-mechanical` y entrega; su elegibilidad exige `approved` y comprueba el plan con `hasPlanGate`; `dispatchJourney` en `packages/engine/src/journey-dispatch.ts:60` reserva capacidad, registra actividad y llama a `runAutonomous`; `selectJourneyTickets` (`packages/engine/src/journey-selection.ts:59`) devuelve razón `plan` para tickets en `intake`; el avance de la jornada es `avanzarJornada` en `packages/engine/src/journey-advance.ts` (ticket anterior); `recordHumanDecision` y los recibos viven en `packages/engine/src/receipts.ts`; la aprobación registrada del plan está en `packages/engine/src/plan-approval.ts`, cuya barrera `VALMEN_UNATTENDED` solo funciona si el proceso del ejecutor la hereda.
- Causa raíz o hipótesis: el motor de ejecución se escribió para tickets ya aprobados; la preparación es una fase distinta (de `intake` a `planned`) con otro prompt, otras condiciones de verificación y la prohibición de aprobar. Comprobado: ningún módulo lanza un ejecutor sobre un ticket en `intake`. La verificación posterior no puede depender de lo que el ejecutor diga: se lee del registro (estado, recibos, eventos) y del árbol de trabajo.
- Riesgos y compatibilidad: el ejecutor corre con `VALMEN_UNATTENDED=1` en su entorno, de modo que no puede registrar la aprobación del plan aunque lo intente; es una barrera de proceso y no criptográfica, y la verificación en código la respalda. Un fallo del ejecutor o una verificación que no se cumple deja el ticket donde esté y lo informa; no se reintenta solo. Los consumidores de `autonomousExecutorCommand` son `runAutonomous` y su prueba; esta fase lo reutiliza sin cambiarlo. El prompt de preparación no ordena aprobar nada (lo exige R-JORN-010, que se prueba en el ticket de seguridad siguiente).
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: el prompt y la ejecución de la fase de preparación, su verificación en código, el aviso de decisión y el avance con `--fase preparacion`. Exclusiones: aprobación en lote, ejecución, modelo por fase, topes y paradas.
- Pasos ordenados:
  1. Crear `packages/engine/src/journey-preparation.ts` con `promptDePreparacion(ticketId)` (análisis, plan, validación y compuertas con cascada; sin aprobar y sin tocar código de la aplicación), `siguienteAPreparar(project, journeyId)` (primer ticket de la jornada en `intake` con las dependencias de la jornada ya preparadas) y `prepararTicket({ paths, ticketId, execute?, notificar?, ahora? })`: valida que la política autorice y el ticket esté en `intake` y sea elegible por tipo, riesgo y módulo, lanza el ejecutor con `VALMEN_UNATTENDED=1` en su entorno y devuelve `plan-listo`, `decision-pendiente`, `ejecutor-fallo` o `verificacion-fallo`.
  2. En el mismo archivo hacer la verificación posterior en código: el ticket está en `planned`, los recibos vigentes de `analysis` y `plan` existen, `aprobacionDePlanVigente` no da `vigente` y, si el proyecto es un repositorio git, ningún archivo cambió fuera del registro de tickets y de `.valmen/`; si una compuerta quedó en `review` o `block` arma el aviso con `Decisión`, una línea `A) opción → efecto` por salida posible y `Recomiendo`, lo envía por `notificar` y devuelve `decision-pendiente`.
  3. En `packages/engine/src/journey-advance.ts` agregar la opción `fase` (`preparacion` o `ejecucion`, por defecto `ejecucion`); en preparación reserva capacidad, registra la actividad y llama a `prepararTicket` con la misma identidad estable; exportar el módulo desde `packages/engine/src/index.ts`.
  4. En `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` agregar la bandera `--fase` a `journey advance` y su ayuda.
  5. Crear `tests/jornada-preparacion.test.ts` con: un ticket en `intake` llega a `planned` con recibos de `analysis` y `plan` y nadie aprobó el plan, el ejecutor recibe `VALMEN_UNATTENDED` y no puede registrar la aprobación, un ejecutor que aprueba o que toca código fuera del registro falla la verificación, una compuerta en `review` o `block` avisa en formato de decisión y deja el ticket, el prompt no ordena aprobar ni mover a `approved`, y un ticket cuya dependencia sigue en `intake` no se prepara todavía; correr esas pruebas, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; la fase es opt-in por bandera y no cambia el avance de ejecución ni los tickets ya preparados.

## Criterios de aceptación

- [x] Un ticket en `intake` dentro de la jornada llega a `planned` con recibos de `analysis` y `plan`, y nadie aprobó el plan
      <!-- test: npx vitest run tests/jornada-preparacion.test.ts -->
- [x] El ejecutor corre con `VALMEN_UNATTENDED` y no puede registrar la aprobación del plan
      <!-- test: npx vitest run tests/jornada-preparacion.test.ts -->
- [x] Si el ejecutor aprueba el plan o modifica archivos fuera del registro, la verificación falla y se informa
      <!-- test: npx vitest run tests/jornada-preparacion.test.ts -->
- [x] Una compuerta en `review` o `block` avisa la decisión pendiente en formato de opciones y efecto y deja el ticket como está
      <!-- test: npx vitest run tests/jornada-preparacion.test.ts -->
- [x] El prompt de preparación no ordena aprobar compuertas ni el plan ni mover un ticket a `approved`
      <!-- test: npx vitest run tests/jornada-preparacion.test.ts -->
- [x] Un ticket cuya dependencia dentro de la jornada sigue en `intake` no se prepara todavía
      <!-- test: npx vitest run tests/jornada-preparacion.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-ENGINE-JORNADA-PREPARACION-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/journey-preparation.ts",
      "packages/engine/src/journey-advance.ts",
      "packages/engine/src/journey-dispatch.ts",
      "packages/engine/src/index.ts",
      "packages/cli/src/commands.ts",
      "packages/cli/src/main.ts",
      "tests/jornada-preparacion.test.ts"
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

- `packages/engine/src/journey-preparation.ts` (nuevo): `promptDePreparacion` (sin ordenar aprobar nada), `prepararTicket` (valida política y elegibilidad por tipo, riesgo y módulo, lanza el ejecutor con `VALMEN_UNATTENDED=1` y verifica **en código**: sin aprobación del plan registrada, sin archivos modificados fuera del registro, recibos de `analysis` y `plan` y estado `planned`), `avisoDeDecision` (formato `Decisión` / `A) … → …` / `B) … → …` / `Recomiendo`), `siguienteAPreparar` (primer ticket en `intake` con las dependencias de la jornada ya preparadas) y `despacharPreparacion` (reserva capacidad y registra actividad con la misma identidad estable).
- `packages/engine/src/journey-advance.ts`: opción `fase` (`preparacion` o `ejecucion`, por defecto la de siempre). `packages/engine/src/journey-dispatch.ts`: `dispatchEventId` exportada para reutilizar el id de eventos por ticket.
- `packages/cli/src/commands.ts` y `main.ts`: bandera `--fase` en `journey advance`.
- `tests/jornada-preparacion.test.ts` (nuevo, 11 pruebas con un ejecutor simulado que hace, o no hace, cada cosa).

## Pruebas

Desde la raíz del repositorio, Node 24, sin red y sin lanzar ningún agente:

1. `npx vitest run tests/jornada-preparacion.test.ts` — esperado: 11 pruebas pasan.
2. `npx vitest run` — esperado: 175 archivos pasan y 1 omitido; 2557 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run (2557 pasan), tsc sin errores

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:1d5b625158ee551d5f4a37934f75fb42d107ac81",
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
    "description": "npx vitest run (2557 pasan), tsc sin errores",
    "reference": "worktree:sha256:f1a2fde916046adeccda100fb26da78a0ca3bcad5dc482b6af6fe1a416e745ec",
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
    "technical_summary": "prepararTicket con verificación en código, avisos de decisión y avance con fase de preparación.",
    "functional_summary": "La jornada deja los planes listos para que una persona los apruebe, sin que el agente pueda aprobar nada.",
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
    "at": "2026-10-06T01:51:50.676Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T03:31:58.912Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T03:32:14.594Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T03:32:36.105Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"delegacion\",\"quote\":\"Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06\",\"planHash\":\"sha256:7d7d5e4e4e1edf7f036775f4ef0e52b0f94f2b588c8481bf7b899c1cca8e0f1b\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T03:32:36.247Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente delegacion), plan sha256:7d7d5e4e4e1edf7f036775f4ef0e52b0f94f2b588c8481bf7b899c1cca8e0f1b."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T03:32:36.247Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T03:32:36.333Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T03:35:34.195Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T03:35:34.326Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T03:35:34.413Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T03:35:34.496Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T03:35:34.580Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T03:35:34.663Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T03:35:34.831Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T03:35:35.031Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T03:35:35.111Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T03:35:35.193Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T03:35:35.275Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T03:35:35.362Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T03:35:35.447Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T03:35:35.533Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-06",
    "at": "2026-10-07T03:35:35.614Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
