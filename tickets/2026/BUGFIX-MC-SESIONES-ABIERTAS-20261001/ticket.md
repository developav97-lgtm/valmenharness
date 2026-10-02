---
schema_version: 2
id: BUGFIX-MC-SESIONES-ABIERTAS-20261001
title: Evitar marcar sesiones abiertas como fallidas por falta de fin
type: BUGFIX
module: MC
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-01
updated: 2026-10-01
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-MC-SESIONES-ABIERTAS-20261001

## Solicitud original

Parte del sprint: Corregir regresiones de tablero, aislamiento de sesiones y sesiones abiertas.
- R-ACT-005: Una sesión abierta NO DEBE clasificarse como fallida solo porque carece de finalización.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [actividad/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actividad/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: la clasificación de error de sesiones de Hermes que alimenta la
  actividad de Mission Control.
- Usuario o rol afectado: responsable que observa una ejecución en curso.
- Comportamiento actual: una sesión sin `ended_at` se marca como fallida aunque
  Hermes todavía la esté ejecutando y no haya informado un error.
- Comportamiento esperado: solo un motivo de fin que indique error marca una
  sesión como fallida; una sesión abierta continúa visible sin estado de fallo.

## Diagnóstico

- Archivos y flujo investigados: `packages/server/src/hermes.ts` entrega el
  booleano `failed` a la línea de tiempo y `tests/hermes.test.ts` fabrica el
  esquema SQLite real para probar el lector.
- Causa raíz confirmada: `leerSesionesDeHermes` calcula `failed` como
  `ended_at === null || end_reason contiene "error"`; el primer término confunde
  una ejecución abierta con un fallo.
- Riesgos y compatibilidad: una sesión que termina normalmente sigue sin fallo y
  una que finaliza con error se conserva como fallida. El modelo aún no expone un
  estado visual distinto de "abierta", por lo que este cambio no inventa uno.
- Impactos de sync, migración, Docker o despliegue: no hay.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de
  plan). Autorización vigente para ejecutar los tickets en orden recibida el
  2026-10-01: «dale listo empieza».
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. En `packages/server/src/hermes.ts`, dejar que `failed` dependa únicamente
     de un `end_reason` que indique error, sin inferir fallo de `ended_at` nulo.
  2. En `tests/hermes.test.ts`, cubrir una sesión abierta y una terminada con
     error, y ejecutar `npx vitest run tests/hermes.test.ts`.
- Rollback: revertir la condición de `failed`; no hay escritura en SQLite ni
  cambio de contrato HTTP.

## Criterios de aceptación

- [x] R-ACT-005: Una sesión abierta NO DEBE clasificarse como fallida solo porque carece de finalización.
      <!-- test: npx vitest run tests/hermes.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `failed` ahora depende solo de un motivo de fin que contenga `error`; `ended_at` nulo representa una sesión abierta, no un fallo.

## Pruebas

- `npx vitest run tests/hermes.test.ts` — pasó: 25 pruebas.
- `npm run build` — pasó.
- Resultado del PO: autorizó que las pruebas deterministas por comando fueran ejecutadas y aprobadas por el agente.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:155867aae4f961dd79d603e3d628ba00220a7ebf0027fe8b6a0a3ebf31350b54",
    "environment": "local-node-24",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-02",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO autorizó que las pruebas por comando las ejecute y apruebe el agente."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-01",
    "kind": "test",
    "description": "La compuerta qa-mechanical ejecutó tests/hermes.test.ts con salida 0; la compilación pasó.",
    "reference": null,
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
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-02",
    "technical_summary": "Hermes solo marca fallida una sesión cuando end_reason contiene error; ended_at nulo ya no implica fallo.",
    "functional_summary": "Mission Control conserva las sesiones abiertas como activas/no fallidas y distingue las terminadas con error.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin despliegue ni migración; cambio local de lectura de sesiones."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-02",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión compartida con otros tickets; el gasto no se reparte porque no hay agregado fiable por ticket.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-compartida",
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
    "date": "2026-10-01",
    "at": "2026-10-01T19:10:44.017Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-01",
    "at": "2026-10-01T23:33:43.008Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-01",
    "at": "2026-10-01T23:34:22.575Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-01",
    "at": "2026-10-01T23:34:22.720Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-01",
    "at": "2026-10-01T23:34:22.862Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-01",
    "at": "2026-10-01T23:35:09.402Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-01",
    "at": "2026-10-01T23:35:09.568Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-01",
    "at": "2026-10-02T02:04:03.717Z",
    "action": "user-tests-recorded",
    "actor": "cli",
    "details": "El PO autorizó aprobar la prueba automatizada y el build ejecutados por el agente."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-01",
    "at": "2026-10-02T02:04:03.798Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-01",
    "at": "2026-10-02T02:04:04.030Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-01",
    "at": "2026-10-02T02:04:04.220Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-01",
    "at": "2026-10-02T02:04:04.385Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-01",
    "at": "2026-10-02T02:04:04.557Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-01",
    "at": "2026-10-02T02:04:04.701Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-01",
    "at": "2026-10-02T02:04:04.768Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
