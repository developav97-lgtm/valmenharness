---
schema_version: 2
id: FEATURE-ENGINE-ESTADO-ACTIVIDAD-20261001
title: Separar estado validado, actividad actual y liveness
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
created: 2026-10-01
updated: 2026-10-02
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-ESTADO-ACTIVIDAD-20261001

## Solicitud original

Parte del sprint: Observar fases, sesiones, modelos y mensajes mediante adaptadores opcionales.
- R-ACT-001: La consulta DEBE distinguir estado validado, actividad actual y estado de ejecución.
- R-ACT-005: Una sesión abierta NO DEBE clasificarse como fallida solo porque carece de finalización.
Depende de: FEATURE-ENGINE-EVENTOS-PERSISTIDOS-20261001, FEATURE-ENGINE-ACTIVIDAD-SIN-GATES-20261001.
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

- Alcance: proyectar consulta de estado de una ejecución sin alterar su workflow.
- Usuario o rol afectado: adaptadores y Mission Control.
- Comportamiento actual: el historial guarda actividad, pero no una lectura separada del estado validado y liveness.
- Comportamiento esperado: la consulta retorna workflow, última actividad y liveness independiente.

## Diagnóstico

- Archivos y flujo investigados: eventos, actividad persistida, contrato e identidad de ejecución. La última señal basta para liveness; silencio no aporta evidencia de fallo.
- Causa raíz o hipótesis: faltaba la proyección conservadora, por lo que cada consumidor podría inferir estados distintos.
- Riesgos y compatibilidad: la función es sólo lectura; un ticket no localizado se expresa como estado validado nulo.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** mediante la autorización previa de esta sesión.
- Pasos ordenados:
  1. Crear `packages/engine/src/execution-status.ts` con la proyección separada de workflow, actividad y liveness.
  2. Exportarla desde `packages/engine/src/index.ts`.
  3. Añadir `tests/execution-status.test.ts` para actividad abierta y ausencia de finalización.
- Rollback: retirar la proyección y su exportación; no existen migraciones ni mutaciones.

## Criterios de aceptación

- [x] R-ACT-001.a: La consulta devuelve el estado validado.
      <!-- test: npx vitest run tests/execution-status.test.ts -->
- [x] R-ACT-001.b: La consulta devuelve la última actividad como campo separado.
      <!-- test: npx vitest run tests/execution-status.test.ts -->
- [x] R-ACT-001.c: Una actividad `active` produce liveness `active`.
      <!-- test: npx vitest run tests/execution-status.test.ts -->
- [x] R-ACT-001.d: Una actividad `active` no cambia el workflow validado.
      <!-- test: npx vitest run tests/execution-status.test.ts -->
- [x] R-ACT-005.a: Sin actividad de finalización, el liveness es `unknown`.
      <!-- test: npx vitest run tests/execution-status.test.ts -->
- [x] R-ACT-005.b: Sin actividad de finalización, el liveness no es `failed`.
      <!-- test: npx vitest run tests/execution-status.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadió `packages/engine/src/execution-status.ts`, una proyección de lectura que separa el workflow validado, la última actividad y el liveness de una ejecución.
- La proyección no modifica tickets ni eventos; sólo interpreta la última señal persistida. Una ejecución sin señal queda `unknown`, no `failed`.
- Se exportó desde `packages/engine/src/index.ts` para que adaptadores y Mission Control reutilicen el mismo criterio.

## Pruebas

- `npx vitest run tests/execution-status.test.ts`: 2 pruebas aprobadas.
- `npx tsc -b --pretty false`: compilación aprobada.
- Resultado del PO: pruebas por comando aprobadas automáticamente bajo su autorización explícita en esta sesión; no requiere validación manual adicional.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:749d6dfc7fffa96f76f1b43f460e796f803950ecb062b91e3c80960a49ccdce0",
    "environment": "local",
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
    "po_confirmation": "Autorización previa de la persona responsable: ejecutar y aprobar automáticamente pruebas por comando en esta sesión."
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
    "date": "2026-10-02",
    "technical_summary": "Se añadió una proyección de estado de ejecución que separa workflow validado, actividad actual y liveness conservador.",
    "functional_summary": "Las vistas pueden mostrar una ejecución activa o desconocida sin confundirla con el estado del ticket ni marcarla fallida por ausencia de finalización.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicación: cambio local pendiente de commit y release."
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
    "notes": "Sesión Codex compartida entre varios tickets; no existe reparto fiable de tokens para este ticket.",
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
    "at": "2026-10-01T19:10:44.584Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-02",
    "at": "2026-10-02T05:03:46.925Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-02",
    "at": "2026-10-02T05:03:47.157Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-02",
    "at": "2026-10-02T05:05:21.163Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Juan Andrade: Autorización previa de la persona responsable en esta sesión: aprobar automáticamente planes con evidencia suficiente; la proyección y sus pruebas separan workflow, actividad y liveness."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-02",
    "at": "2026-10-02T05:05:21.344Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-02",
    "at": "2026-10-02T05:05:21.509Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-02",
    "at": "2026-10-02T05:21:52.046Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-02",
    "at": "2026-10-02T05:21:52.212Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-02",
    "at": "2026-10-02T05:22:06.193Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-02",
    "at": "2026-10-02T05:22:06.539Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-02",
    "at": "2026-10-02T05:22:06.702Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-02",
    "at": "2026-10-02T05:22:06.865Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-02",
    "at": "2026-10-02T05:22:14.371Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-02",
    "at": "2026-10-02T05:22:14.439Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
