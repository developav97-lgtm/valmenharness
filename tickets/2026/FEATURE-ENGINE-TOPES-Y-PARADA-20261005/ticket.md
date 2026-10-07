---
schema_version: 2
id: FEATURE-ENGINE-TOPES-Y-PARADA-20261005
title: Aplicar topes y detener con aviso cuando falla el ejecutor
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

# FEATURE-ENGINE-TOPES-Y-PARADA-20261005

## Solicitud original

Parte del sprint: Jornada autónoma sobre el motor de jornadas, después de la salida de S1 a S3: preparación hasta el plan, aprobación en lote, ejecución hasta las pruebas, topes, avisos y commit por ticket sin push.
- R-JORN-007: La jornada DEBE respetar sus topes y detenerse con aviso cuando falla el ejecutor
Depende de: FEATURE-ENGINE-JORNADA-EJECUCION-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: que la jornada respete sus topes y se detenga con aviso cuando algo falla (R-JORN-007): el máximo por día, el máximo concurrente y un tiempo máximo por ejecución; un fallo del ejecutor, un tiempo agotado o una verificación que no se cumple registran una parada con su motivo y la avisan; y una parada no se reintenta sola. Incluye `valmen journey clear-stop` para que una persona libere un ticket parado. Fuera de alcance: el parte diario y el aviso de pruebas listas (vigilante), el commit por ticket y las reglas de integración.
- Usuario o rol afectado: el responsable que deja correr la jornada sin mirar y necesita que se frene sola y le avise, y el agente ejecutor.
- Comportamiento actual: `autonomous.limits` declara `max-concurrent` y `max-per-day`, pero el despacho solo respeta la capacidad de la máquina; no hay tiempo máximo por ejecución; un fallo del ejecutor devuelve `executor-failed` sin dejar parada ni aviso; y la preparación vuelve a elegir en el siguiente avance un ticket cuyo ejecutor falló.
- Comportamiento esperado: el despacho no inicia una sesión si el proyecto ya inició el máximo por día o tiene tantas sesiones activas como el máximo concurrente, y lo dice; el ejecutor corre con un tiempo máximo (`autonomous.limits.max-minutes`, por defecto 60) y se corta al agotarse; un fallo del ejecutor, un tiempo agotado o una verificación fallida dejan una parada append-only con su motivo, avisan con las opciones y su efecto, y el ticket no se vuelve a elegir hasta que una persona libere la parada con `journey clear-stop`.

## Diagnóstico

- Archivos y flujo investigados: `runAutonomous` en `packages/engine/src/autonomous-run.ts` lanza el ejecutor con `spawnSync` sin tiempo máximo, deja paradas solo para las cuatro razones de `stop-on` (bloqueos repetidos, fallo de pruebas, secreto y presupuesto) y para un ejecutor que falla devuelve el estado sin registrar nada; las paradas viven en `packages/engine/src/autonomous-stops.ts` (append-only, `recordAutonomousStop`), y el vigilante de Hermes ya avisa las que encuentra y deja constancia con `autonomous-stop-notice` (`packages/engine/src/approval.ts`, `packages/cli/src/hermes.ts:754`); la política se lee con `readAutonomousConfig` en `packages/adapter/src/config.ts` (límites `max-concurrent`, `max-per-day`, `budget-per-ticket`) y llega al motor con `autonomousConfig`; `dispatchJourney`, `despacharPreparacion` y `siguienteAPreparar` están en `journey-dispatch.ts` y `journey-preparation.ts`; la actividad de cada sesión queda en el registro de ejecución con `recordExecutionActivity`.
- Causa raíz o hipótesis: los topes se declararon en la política pero el despacho solo consulta la capacidad de la máquina, y las paradas se pensaron para las condiciones que el operador listaba en `stop-on`, no para el fallo del propio ejecutor. Comprobado: ninguna referencia a `maxPerDay` ni a un tiempo límite en el motor. El conteo del día sale de la actividad `started` de las sesiones del proyecto, que ya es fuente de verdad y no se duplica.
- Riesgos y compatibilidad: `limits.max-minutes` es opcional, así que las políticas existentes siguen válidas y reciben el valor por defecto; las razones de parada nuevas (`executor-failed`, `executor-timeout`, `verification-failed`) son aditivas y siempre se registran, no dependen de `stop-on`, porque el requisito pide parar ante un fallo del ejecutor; la liberación de una parada es otro renglón append-only y no reescribe nada. Consumidores comprobados con búsqueda: `readAutonomousConfig` lo usan `packages/engine/src/discovery.ts` y `packages/server/src/politicas.ts`, que no leen el límite nuevo; `readAutonomousStops` lo usan el vigilante de Hermes y las pruebas, y seguirá devolviendo solo las paradas. Un ticket parado en `in_progress` no es elegible para otro despacho de ejecución por su estado; el de preparación se omite por el registro de paradas.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: el tiempo máximo y los topes por día y concurrentes en el despacho, las paradas por fallo del ejecutor, el aviso y la liberación manual. Exclusiones: parte diario, vigilante, commit por ticket e integración.
- Pasos ordenados:
  1. En `packages/adapter/src/config.ts` agregar `limits.max-minutes` (positivo, por defecto 60) a `readAutonomousConfig` y a `AutonomousConfig`, con su validación y mensaje.
  2. En `packages/engine/src/autonomous-stops.ts` agregar las razones `executor-failed`, `executor-timeout` y `verification-failed`, el renglón `autonomous-stop-cleared` y `paradasActivas(paths)` (las sin liberar); `readAutonomousStops` sigue devolviendo solo paradas.
  3. En `packages/engine/src/autonomous-run.ts` lanzar el ejecutor con el tiempo máximo de la política, tratar el corte como `executor-timeout`, y registrar siempre una parada ante un fallo del ejecutor, un tiempo agotado y una verificación fallida (incluida la falta del contrato de pruebas), devolviendo el estado `stopped` con su recibo.
  4. En `packages/engine/src/journey-dispatch.ts` y `packages/engine/src/journey-preparation.ts` aplicar el tope diario (sesiones `started` del proyecto en el día contra `max-per-day`) y el concurrente (reservas activas del proyecto contra `max-concurrent`) antes de reservar capacidad, omitir en `siguienteAPreparar` los tickets con parada activa y registrar la parada cuando la preparación falla o no se verifica.
  5. En `packages/engine/src/journey-advance.ts` avisar cada parada nueva por `notificar` con el formato `Decisión`, una línea `A) … → …` por salida y `Recomiendo`, y dejar constancia con el renglón `autonomous-stop-notice`; en `packages/cli/src/commands.ts` y `packages/cli/src/main.ts` agregar `journey clear-stop --id <ticket> --actor <nombre>` y su ayuda.
  6. Crear `tests/jornada-topes.test.ts` con: el tope diario y el concurrente impiden iniciar y lo dicen, un ejecutor que supera el tiempo máximo se corta y deja la parada con el motivo, un fallo del ejecutor y una verificación fallida dejan parada y aviso, un ticket parado no se reintenta solo y sí tras `clear-stop`, y la política sin `max-minutes` usa 60; correr esas pruebas, las de configuración autónoma, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; la clave nueva es opcional y los renglones de parada nuevos son aditivos, de modo que el despacho anterior los ignora.

## Criterios de aceptación

- [x] El despacho no inicia una sesión si el proyecto ya inició el máximo por día o tiene el máximo concurrente, y lo dice
      <!-- test: npx vitest run tests/jornada-topes.test.ts -->
- [x] Un ejecutor que supera el tiempo máximo se corta y deja una parada con el motivo
      <!-- test: npx vitest run tests/jornada-topes.test.ts -->
- [x] Un fallo del ejecutor o de la verificación registra una parada y la avisa en formato de opciones y efecto
      <!-- test: npx vitest run tests/jornada-topes.test.ts -->
- [x] Una parada no se reintenta sola: el ticket no se vuelve a elegir hasta que una persona la libera con `journey clear-stop`
      <!-- test: npx vitest run tests/jornada-topes.test.ts -->
- [x] La política sin `max-minutes` usa 60 minutos y un valor inválido se rechaza con el mensaje de la clave
      <!-- test: npx vitest run tests/jornada-topes.test.ts tests/config-autonomous.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-ENGINE-TOPES-Y-PARADA-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/adapter/src/config.ts",
      "packages/engine/src/autonomous-stops.ts",
      "packages/engine/src/autonomous-run.ts",
      "packages/engine/src/journey-limits.ts",
      "packages/engine/src/journey-dispatch.ts",
      "packages/engine/src/journey-preparation.ts",
      "packages/engine/src/journey-advance.ts",
      "packages/engine/src/index.ts",
      "packages/cli/src/commands.ts",
      "packages/cli/src/main.ts",
      "tests/jornada-topes.test.ts",
      "tests/autonomous-run.test.ts",
      "tests/config-autonomous.test.ts"
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

- `packages/adapter/src/config.ts`: `autonomous.limits.max-minutes` (positivo, por defecto 60) en `readAutonomousConfig` y `AutonomousConfig.limits.maxMinutes`.
- `packages/engine/src/autonomous-stops.ts`: razones `executor-failed`, `executor-timeout` y `verification-failed` (siempre se registran, no dependen de `stop-on`), `workflowStatus` como cadena, el renglón `autonomous-stop-cleared`, `paradasActivas` y `liberarParada`.
- `packages/engine/src/autonomous-run.ts`: el ejecutor se lanza con el tiempo máximo de la política (`timeout`, `SIGKILL`); el corte, el fallo del ejecutor, la verificación mecánica fallida y la falta del contrato de pruebas dejan una parada y devuelven `stopped`.
- `packages/engine/src/journey-limits.ts` (nuevo): `sesionesDelDia` (desde la actividad `started`) y `motivoDeTope` (máximo por día y concurrente); `journey-dispatch.ts` y `journey-preparation.ts` los aplican antes de reservar; la preparación omite tickets con parada activa, corta con el tiempo máximo y registra su parada al fallar.
- `packages/engine/src/journey-advance.ts`: `avisoDeParada` (formato `Decisión` / `A) … → …` / `B) … → …` / `Recomiendo`) y constancia `autonomous-stop-notice` para que el vigilante no repita. `packages/cli/src/commands.ts` y `main.ts`: `journey clear-stop` y `--to` en `journey advance`.
- Pruebas: `tests/jornada-topes.test.ts` (nuevo, 8, incluye un corte por tiempo real con un `codex` falso que duerme) y ajustes en `tests/autonomous-run.test.ts` y `tests/config-autonomous.test.ts`.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red y sin lanzar ningún agente real:

1. `npx vitest run tests/jornada-topes.test.ts tests/config-autonomous.test.ts` — esperado: todas pasan.
2. `npx vitest run tests/autonomous-run.test.ts tests/journey-dispatch.test.ts tests/jornada-ejecucion.test.ts tests/jornada-preparacion.test.ts` — esperado: todas pasan.
3. `npx vitest run` — esperado: 177 archivos pasan y 1 omitido; 2573 pruebas pasan, 0 fallan.
4. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los cuatro dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run (2573 pasan), tsc sin errores

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:4f789f1eb2cb65db0b57d4e422390fca9bcf6288",
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
    "description": "npx vitest run (2573 pasan), tsc sin errores",
    "reference": "worktree:sha256:d3bfe494f0e55e63cf434f47870129700750b492c52e5e220b9f20956c3db912",
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
    "technical_summary": "Topes diario y concurrente, tiempo máximo por ejecución, paradas por fallo con aviso y liberación manual con clear-stop.",
    "functional_summary": "La jornada se frena sola y avisa cuando algo falla, y no vuelve a intentarlo hasta que una persona lo decide.",
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
    "at": "2026-10-06T01:51:50.882Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T03:45:51.162Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T03:46:07.378Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T03:46:37.274Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"delegacion\",\"quote\":\"Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06\",\"planHash\":\"sha256:2952adaa0b1dd921fb9206ed673e0dcb0ad9266eed2e442d80a055043461ab83\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T03:46:37.410Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente delegacion), plan sha256:2952adaa0b1dd921fb9206ed673e0dcb0ad9266eed2e442d80a055043461ab83."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T03:46:37.410Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T03:46:37.494Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T03:50:44.286Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T03:50:44.421Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T03:50:44.511Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T03:50:44.597Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T03:50:44.685Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T03:50:44.771Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T03:50:45.013Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T03:50:45.292Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T03:50:45.372Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T03:50:45.460Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T03:50:45.545Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T03:50:45.628Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T03:50:45.714Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T03:50:45.798Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-06",
    "at": "2026-10-07T03:50:45.880Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
