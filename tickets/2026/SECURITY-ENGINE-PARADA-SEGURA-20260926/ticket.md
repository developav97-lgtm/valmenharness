---
schema_version: 2
id: SECURITY-ENGINE-PARADA-SEGURA-20260926
title: Detener ejecuciones ante secretos o exceso de presupuesto
type: SECURITY
module: ENGINE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-26
updated: 2026-10-05
related_ticket: null
target_release: null
released_in: null
---

# SECURITY-ENGINE-PARADA-SEGURA-20260926

## Solicitud original

Parte del sprint: Ejecutar autonomía acotada con colisiones, evidencia, migraciones e integración controladas.
- R-S5-005: Parada segura — secreto detectado, presupuesto superado), la ejecución DEBE detenerse dejando
Depende de: FEATURE-ENGINE-RUN-AUTONOMO-20260926, IMPROVEMENT-ENGINE-PRESUPUESTOS-ADAPTATIVOS-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: detener de forma verificable una corrida de `valmen run` cuando alcance una condición de parada declarada, conservando el ticket en un estado válido, un recibo sin datos sensibles y un aviso pendiente para el vigilante de Hermes/Telegram. No incluye cancelar a la fuerza un proceso externo que ya está corriendo, integrar cambios ni modificar la política del proyecto.
- Usuario o rol afectado: quien habilita autonomía y necesita saber por qué una ejecución se detuvo sin que el motor reintente o continúe gastando por sí solo.
- Comportamiento actual: `runAutonomous()` mueve un ticket elegible a `in_progress`, invoca al ejecutor y solo después corre `qa-mechanical`. Aunque `autonomous.limits.stop-on` admite las cuatro causas de parada, no se consume; tampoco se revisan cambios pendientes por secretos, el costo acumulado del ticket ni los bloqueos repetidos de compuertas. Un fallo devuelve texto, pero no deja recibo de parada ni entra en el vigilante de avisos.
- Comportamiento esperado: antes de un nuevo despacho y tras el retorno del ejecutor, el motor evalúa únicamente las causas declaradas; si una aplica, no continúa a QA ni entrega, deja el ticket en `in_progress`, anexa un recibo de parada con motivo seguro y permite que el vigilante existente lo notifique sin duplicarlo. Una corrida detenida no se reintenta automáticamente.

## Diagnóstico

- Archivos y flujo investigados: `packages/adapter/src/config.ts` valida y expone `autonomous.limits.stop-on`, `budget-per-ticket` y las cuatro causas posibles; `packages/engine/src/autonomous-run.ts` es el único dueño actual de la selección, transición a `in_progress`, invocación y `qa-mechanical`, pero no consulta ninguno de esos límites. `packages/engine/src/secrets.ts` ya detecta cambios pendientes y redacta sus hallazgos sin exponer el valor; `packages/engine/src/budget.ts` calcula el gasto acumulado y el corte adaptativo `pause`; `packages/engine/src/receipts.ts` solo modela recibos de compuertas. `packages/cli/src/hermes.ts` centraliza el vigilante de gates y procesos pendientes, por lo que un aviso nuevo debe entrar allí y no invocar Telegram desde `runAutonomous()`.
- Causa raíz o hipótesis: la política de parada se agregó como contrato declarativo antes de existir el consumidor de ejecuciones autónomas. El primer `runAutonomous()` resolvió elegibilidad e invocación, pero no conectó ese contrato con los detectores de secretos/presupuesto ni con un registro append-only de la corrida. Por ello un límite configurado no cambia el flujo y un fallo no deja evidencia que el vigilante pueda notificar.
- Riesgos y compatibilidad: no se debe imprimir ni persistir el valor de un secreto, ni cancelar arbitrariamente un ejecutor externo ya iniciado. La decisión se limita a fronteras seguras de la corrida, usa solo condiciones declaradas, deja el ticket en `in_progress` —estado válido y no elegible para un nuevo `run`— y no transforma una parada en QA, cierre, commit, push o autorización humana. Configuraciones sin la causa correspondiente conservan el comportamiento actual.
- Impactos de sync, migración, Docker o despliegue: ninguno. El cambio será local al motor y al vigilante; no modifica `valmen sync`, esquemas de datos externos, contenedores, migraciones, credenciales ni despliegues. El registro append-only nuevo se crea bajo `.valmen/` únicamente al detener una corrida.

## Plan

- Alcance y exclusiones: se implementa la decisión de parada en el motor, su recibo append-only y su aviso por el vigilante central. Quedan fuera matar procesos externos en curso, reiniciar automáticamente, cambiar `.valmen/config.yaml`, promover gates, integrar Git, cerrar tickets o enviar mensajes desde una llamada aislada de `run`.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirmación del 2026-10-05: «si».
- Pasos ordenados:
  1. Crear `packages/engine/src/autonomous-stops.ts` con el contrato de las causas de parada, el recibo append-only por corrida bajo `.valmen/`, una lectura de pendientes y una marca de aviso entregado. El recibo conservará identificador, ticket, instante, causa, estado resultante y detalle redactado; nunca el valor de un secreto ni la salida completa del ejecutor.
  2. Extender `packages/engine/src/autonomous-run.ts` para evaluar únicamente las causas presentes en `policy.limits.stopOn`: antes de invocar, dos bloqueos vigentes de un gate y presupuesto agotado; después de que el ejecutor retorne, secretos en los cambios pendientes, presupuesto actualizado y fallo de `qa-mechanical`. Ante una parada, anexar el recibo, conservar `in_progress`, no transicionar a entrega y devolver un resultado explícito sin volver a invocar el ejecutor. El costo comparará el tope declarado `budget-per-ticket` y el corte adaptativo `pause` cuando exista referencia válida.
  3. Exportar el contrato desde `packages/engine/src/index.ts` y extender `packages/cli/src/hermes.ts`/`packages/engine/src/notify.ts` para que el vigilante de avisos lea las paradas pendientes, redacte un aviso seguro para el destino Telegram configurado y solo marque el aviso tras una entrega satisfactoria. Un error del canal conserva el aviso pendiente; una segunda pasada no duplica uno ya entregado.
  4. Ampliar `tests/autonomous-run.test.ts` y crear `tests/autonomous-stops.test.ts` con laboratorio e inyecciones sin red: condición declarada/no declarada, dos bloqueos, tope por ticket, corte adaptativo, secreto redactado, fallo de QA, estado válido y ausencia de reintento. Ampliar `tests/hermes-notify.test.ts` para aviso pendiente, entrega, reintento tras fallo y deduplicación. Mantener verdes las regresiones de `tests/config-autonomous.test.ts`, `tests/secrets.test.ts` y `tests/presupuestos.test.ts`.
  5. Ejecutar desde la raíz, siempre con un único proceso de Vitest: `npx vitest run --maxWorkers 1 --no-file-parallelism tests/autonomous-stops.test.ts tests/autonomous-run.test.ts tests/hermes-notify.test.ts tests/config-autonomous.test.ts tests/secrets.test.ts tests/presupuestos.test.ts`; después `npm run build`. La suite completa con esos mismos límites solo se correrá una vez durante QA, no en paralelo ni en segundo plano.
- Rollback: revertir conjuntamente el contrato de paradas, su consumo en `runAutonomous`, el vigilante y sus pruebas. Los recibos que ya existan se conservan como evidencia; sin el consumidor, no ejecutan, reintentan ni modifican tickets.

## Criterios de aceptación

- [x] R-S5-005a: Con una causa incluida en `autonomous.limits.stop-on`, `valmen run` detiene la corrida antes de entregar, conserva el ticket en un estado válido y no la reintenta automáticamente.
      <!-- test: npx vitest run --maxWorkers 1 --no-file-parallelism tests/autonomous-stops.test.ts tests/autonomous-run.test.ts -->
- [x] R-S5-005b: Dos bloqueos vigentes de compuerta, un fallo de pruebas y una causa no declarada se distinguen: solo la causa configurada produce la parada y el recibo correspondiente.
      <!-- test: npx vitest run --maxWorkers 1 --no-file-parallelism tests/autonomous-stops.test.ts tests/autonomous-run.test.ts -->
- [x] R-S5-005c: Un secreto en los cambios pendientes detiene antes de QA sin persistir su valor; un gasto que supera `budget-per-ticket` o el corte adaptativo `pause` detiene sin iniciar más trabajo.
      <!-- test: npx vitest run --maxWorkers 1 --no-file-parallelism tests/autonomous-stops.test.ts tests/autonomous-run.test.ts tests/secrets.test.ts tests/presupuestos.test.ts -->
- [x] R-S5-005d: Cada parada deja un recibo append-only con motivo seguro, estado y corrida, y el vigilante de Hermes/Telegram lo avisa una vez; si el canal falla, queda pendiente para reintento del vigilante.
      <!-- test: npx vitest run --maxWorkers 1 --no-file-parallelism tests/autonomous-stops.test.ts tests/hermes-notify.test.ts -->
- [x] La configuración autónoma existente, el detector de secretos y los presupuestos adaptativos mantienen sus contratos de lectura y sus valores seguros por defecto.
      <!-- test: npx vitest run --maxWorkers 1 --no-file-parallelism tests/config-autonomous.test.ts tests/secrets.test.ts tests/presupuestos.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadió `packages/engine/src/autonomous-stops.ts`: recibos append-only de parada para las cuatro causas permitidas (`gate-blocked-twice`, `test-failure`, `secret-detected` y `budget-exceeded`), con detalle seguro y sin valores de secretos.
- `runAutonomous()` evalúa las causas configuradas antes de invocar al ejecutor (dos bloqueos y presupuesto) y tras su retorno (secreto, presupuesto y QA). Una parada conserva el ticket en `in_progress`, evita entrega/reintento y devuelve el motivo explícito.
- El vigilante central de Hermes incorpora las paradas pendientes: envía la notificación Telegram segura una vez, la marca solo tras entrega exitosa y conserva el pendiente si el canal falla.

## Pruebas

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness`.
- `npx vitest run --maxWorkers 1 --no-file-parallelism tests/autonomous-stops.test.ts tests/autonomous-run.test.ts tests/hermes-notify.test.ts tests/config-autonomous.test.ts tests/secrets.test.ts tests/presupuestos.test.ts` — 6 archivos y 108 pruebas pasaron.
- `npm run build` — pasó.
- `npx vitest run --maxWorkers 1 --no-file-parallelism` — 129 archivos pasaron; 1.938 pruebas pasaron y 48 quedaron desactivadas por ser equivalencias de referencia.
- Resultado comunicado por el PO: `npx vitest run --maxWorkers 1 --no-file-parallelism tests/autonomous-stops.test.ts tests/autonomous-run.test.ts tests/hermes-notify.test.ts` pasó el 2026-10-05: 3 archivos y 55 pruebas correctas.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-05",
    "build_reference": "worktree:sha256:5c41abc5559f2388dcaf3c8951dc33cfdc55bff6e493425572c89ad1c31e86a7",
    "environment": "macOS local; validación del PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-05",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "PO confirmó el 2026-10-05: listo; las 55 pruebas focalizadas pasaron."
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
    "date": "2026-10-05",
    "technical_summary": "Se añadieron paradas autónomas por secretos, presupuesto, bloqueos repetidos y fallo de QA, con recibos append-only y avisos centralizados.",
    "functional_summary": "Una corrida autónoma configurada se detiene de forma segura, conserva evidencia y no se reintenta ni entrega sola.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "No aplica: cambio local sin publicación ni despliegue."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-05",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión Codex compartida con varios tickets; no se atribuyen tokens ni costo por reparto estimado.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-compartida-20261005",
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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-05",
    "at": "2026-10-05T16:29:24.814Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-05",
    "at": "2026-10-05T16:31:37.728Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-05",
    "at": "2026-10-05T16:39:21.848Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-05T16:39:22.073Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-05T16:53:02.820Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-05T17:00:17.698Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-05T17:00:26.481Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-05",
    "at": "2026-10-05T17:00:35.723Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-05",
    "at": "2026-10-05T17:00:46.339Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-05",
    "at": "2026-10-05T17:01:27.115Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-05",
    "at": "2026-10-05T17:01:34.088Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-05",
    "at": "2026-10-05T17:01:39.293Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
