---
schema_version: 2
id: IMPROVEMENT-ENGINE-VIGILANTE-JORNADA-20261005
title: Avisar pruebas pendientes, fallos y parte diario por Telegram
type: IMPROVEMENT
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

# IMPROVEMENT-ENGINE-VIGILANTE-JORNADA-20261005

## Solicitud original

Parte del sprint: Jornada autónoma sobre el motor de jornadas, después de la salida de S1 a S3: preparación hasta el plan, aprobación en lote, ejecución hasta las pruebas, topes, avisos y commit por ticket sin push.
- R-JORN-008: El vigilante DEBE avisar cada ticket que llega a las pruebas del responsable y el parte diario
Depende de: FEATURE-ENGINE-TOPES-Y-PARADA-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que el vigilante de avisos (R-JORN-008) avise por Telegram cada ticket que llega a `awaiting_user_tests`, con su contrato de pruebas, y envíe un parte diario de la jornada con lo hecho, la actividad por fase y los altos pendientes. Fuera de alcance: aprobar nada desde el aviso, las paradas (ya las avisa el vigilante) y medir un costo que el cliente no reporta.
- Usuario o rol afectado: el responsable que prueba lo que el agente entrega y quiere enterarse en el celular de que hay algo listo y del panorama del día.
- Comportamiento actual: `pendientesDeAvisar` y `hermesNotifyPendientes` (`packages/cli/src/hermes.ts`) avisan compuertas que esperan decisión, procesos detenidos y paradas autónomas, y `armarParte` arma un parte semanal de gates, procesos, tickets en curso y consumo; no hay aviso cuando un ticket queda listo para sus pruebas, y el parte no muestra la actividad de la jornada.
- Comportamiento esperado: un ticket en `awaiting_user_tests` sin aviso previo genera un aviso con su título, los comandos del contrato de pruebas y la ruta del contrato; el aviso se anota solo si salió, para que un canal caído no lo dé por avisado y se reintente; y el parte incluye una sección «Jornada» con las sesiones del día por fase —cuántas, modelo y duración, con el costo solo si el cliente lo reportó—, los tickets que esperan pruebas, los planes que esperan aprobación y las paradas activas.

## Diagnóstico

- Archivos y flujo investigados: `pendientesDeAvisar` en `packages/cli/src/hermes.ts:706` arma la lista de pendientes de tres clases (`gate`, `proceso` y `autonomous-stop`) y `hermesNotifyPendientes` la recorre, envía por `hermesSendChannel` y anota la entrega con `appendApproval` solo después de que salió; el registro de avisos es el archivo de aprobaciones del proyecto (`approvals.jsonl`, que se crea al emitir el primer aviso) con las entradas de `ApprovalLogEntry` en `packages/engine/src/approval.ts:91`; `armarParte` (`packages/cli/src/hermes.ts:1084`) arma el parte y `renderBrief` (`packages/engine/src/notify.ts:520`) lo escribe; el registro por fase de las sesiones está en `packages/engine/src/journey-phases.ts` (`leerFases`) y las paradas en `packages/engine/src/autonomous-stops.ts` (`paradasActivas`).
- Causa raíz o hipótesis: el vigilante se escribió para decisiones y detenciones, que son lo que bloquea; un ticket que llega a las pruebas del responsable es la otra mitad de lo que espera a una persona y no estaba. Comprobado: ningún código lee `awaiting_user_tests` para avisar. El costo por sesión de Codex no existe —va por suscripción, como dice `packages/server/src/codex.ts`—, de modo que el parte muestra el costo por fase solo cuando el registro lo trae y, si no, dice que no hay dato en vez de inventar un número.
- Riesgos y compatibilidad: la entrada nueva `tests-ready-notice` es aditiva en el registro de avisos y los lectores existentes la ignoran; un ticket que sale de `awaiting_user_tests` y vuelve (reapertura) se vuelve a avisar solo si cambió su ciclo de pruebas, que se detecta por el último ciclo de QA. Consumidores comprobados con búsqueda: `pendientesDeAvisar` y `armarParte` los usan `packages/cli/src/hermes.ts` y `tests/hermes-notify.test.ts`; `renderBrief` lo usan `packages/engine/src/notify.ts`, `packages/cli/src/hermes.ts` y `tests/notify.test.ts`; los campos nuevos del parte son opcionales, así que sus llamadas actuales no cambian. El aviso no incluye códigos de aprobación: llevar a las pruebas no concede nada.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: el aviso de pruebas listas, su constancia, la sección de jornada del parte y sus pruebas. Exclusiones: aprobaciones, paradas, y medir costos que el cliente no reporta.
- Pasos ordenados:
  1. En `packages/engine/src/approval.ts` agregar la entrada `tests-ready-notice` (ticket, ciclo y fecha) a `ApprovalLogEntry` y la función `pruebasListasAvisadas(paths)`; en `packages/engine/src/notify.ts` agregar `renderTestsReadyNotification` (título, comandos entre comillas invertidas del contrato de pruebas, ruta del contrato y la sección `## Pruebas`) y los campos opcionales de la sección «Jornada» en `BriefInput` con su escritura en `renderBrief`.
  2. En `packages/cli/src/hermes.ts` agregar a `pendientesDeAvisar` la clase `pruebas-listas` para cada ticket en `awaiting_user_tests` sin aviso del ciclo actual, y a `hermesNotifyPendientes` su envío con la anotación posterior a la entrega y el reintento si el canal falló.
  3. En el mismo archivo hacer que `armarParte` reúna la sección de jornada: sesiones del día por fase desde `leerFases` (cantidad, modelo, duración total y costo si lo trae), tickets en `awaiting_user_tests`, tickets en `planned` esperando la aprobación del plan y `paradasActivas`.
  4. Crear `tests/vigilante-jornada.test.ts` con: un ticket que llega a `awaiting_user_tests` se avisa con su título y sus comandos y no se repite, un canal caído no lo anota y se reintenta, el parte muestra las sesiones por fase con el costo ausente dicho como tal, los planes por aprobar, las pruebas pendientes y las paradas activas, y el parte sin jornada no cambia; correr esas pruebas, las de `tests/hermes-notify.test.ts` y `tests/notify.test.ts`, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; las entradas nuevas del registro de avisos y los campos del parte son aditivos y se ignoran.

## Criterios de aceptación

- [x] Un ticket que llega a `awaiting_user_tests` se avisa con su título, los comandos del contrato de pruebas y la ruta del contrato, y no se vuelve a avisar
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts -->
- [x] Si el canal falla, el aviso no se anota como enviado y se reintenta en la siguiente corrida
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts -->
- [x] El parte diario incluye las sesiones del día por fase con modelo y duración, y dice cuando el costo no se reportó
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts -->
- [x] El parte lista los planes que esperan aprobación, los tickets que esperan pruebas y las paradas activas
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts -->
- [x] Sin actividad de jornada el parte conserva su texto de siempre
      <!-- test: npx vitest run tests/vigilante-jornada.test.ts tests/notify.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de IMPROVEMENT-ENGINE-VIGILANTE-JORNADA-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/approval.ts",
      "packages/engine/src/notify.ts",
      "packages/engine/src/autonomous-run.ts",
      "packages/cli/src/hermes.ts",
      "tests/vigilante-jornada.test.ts"
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

- `packages/engine/src/approval.ts`: entrada `tests-ready-notice` (ticket, ciclo de QA y fecha) en `ApprovalLogEntry`, reconocida al leer el registro, y `pruebasListasAvisadas`; el aviso nuevo no entra en el cálculo de intentos de las compuertas.
- `packages/engine/src/notify.ts`: `renderTestsReadyNotification` (título, comandos del contrato, ruta del contrato y la aclaración de que avisar no aprueba nada) y la sección opcional «Jornada» de `BriefInput`/`renderBrief` (sesiones por fase con modelo y duración, costo «sin reportar por el cliente» cuando no hay dato, pruebas pendientes, planes por aprobar y paradas activas).
- `packages/engine/src/autonomous-run.ts`: `comandosDelContrato` (lo que va entre comillas invertidas en `## Pruebas`).
- `packages/cli/src/hermes.ts`: `pendientesDeAvisar` agrega la clase `pruebas-listas` (un aviso por ciclo de QA), `hermesNotifyPendientes` la envía y la anota solo tras la entrega (un canal caído se reintenta), y `armarParte` arma la sección de jornada solo si el proyecto usa jornadas (sin ellas el parte no cambia).
- `tests/vigilante-jornada.test.ts` (nuevo, 6 pruebas); las de `hermes-notify` y `notify` siguen verdes. La primera versión de la prueba descubrió que el registro descartaba el tipo de entrada nuevo y el aviso se repetía: corregido.
- El costo por fase no se inventa: codex va por suscripción y el cliente no lo reporta; el parte lo dice.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red y sin enviar mensajes reales:

1. `npx vitest run tests/vigilante-jornada.test.ts tests/hermes-notify.test.ts tests/notify.test.ts` — esperado: 67 pruebas pasan.
2. `npx vitest run` — esperado: 178 archivos pasan y 1 omitido; 2579 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run (2579 pasan), tsc sin errores

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:a3af3bd747ad39e07c4549e67bd3d193a087297c",
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
    "description": "npx vitest run (2579 pasan), tsc sin errores",
    "reference": "worktree:sha256:77173a4abc5103eec5fc609ed805b4142eb93489a59c0a67d106950f39631443",
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
    "technical_summary": "Aviso de pruebas listas por ciclo con su contrato y sección de jornada en el parte diario con la actividad por fase.",
    "functional_summary": "El responsable se entera en el celular de lo que está listo para probar y recibe el panorama del día.",
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
    "at": "2026-10-06T01:51:50.952Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T03:51:43.220Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T03:52:04.703Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T03:52:35.162Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"delegacion\",\"quote\":\"Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06\",\"planHash\":\"sha256:0546e4283a0f056fd4395b0c2dcb9fd9d8d51ed5aed475b15110d0a965fc7790\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T03:52:35.306Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente delegacion), plan sha256:0546e4283a0f056fd4395b0c2dcb9fd9d8d51ed5aed475b15110d0a965fc7790."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T03:52:35.306Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T03:52:35.401Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T03:55:13.546Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T03:55:13.651Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T03:55:13.740Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T03:55:13.828Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T03:55:13.911Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T03:55:13.997Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T03:55:14.148Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T03:55:14.321Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T03:55:14.405Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T03:55:14.491Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T03:55:14.575Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T03:55:14.660Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T03:55:14.747Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T03:55:14.840Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-06",
    "at": "2026-10-07T03:55:14.927Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
