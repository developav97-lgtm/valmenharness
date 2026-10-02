---
schema_version: 2
id: BUGFIX-MC-REFRESCO-TABLERO-20261001
title: Corregir selección de tablero y refresco de fases actuales
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

# BUGFIX-MC-REFRESCO-TABLERO-20261001

## Solicitud original

Parte del sprint: Corregir regresiones de tablero, aislamiento de sesiones y sesiones abiertas.
- R-VIV-002: Un cambio persistido disponible DEBE aparecer en Mission Control en menos de cinco segundos bajo operación local normal.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [actualizacion/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actualizacion/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: el refresco SSE del detalle de un ticket en Mission Control.
- Usuario o rol afectado: responsable que sigue una ejecución en vivo.
- Comportamiento actual: al recibir un aviso del ticket visible, la interfaz actualiza únicamente la banda de fases. El estado, los gates y la actividad general quedan desactualizados.
- Comportamiento esperado: dentro de 300 ms del aviso, el detalle completo se vuelve a consultar conservando scroll y acordeones.

## Diagnóstico

- Archivos y flujo investigados: `packages/server/web/index.html` consume `/api/events`; `tests/interfaz-ejecutable.test.ts` ejecuta el flujo SSE real con un DOM mínimo.
- Causa raíz confirmada: la rama para `#/ticket/<id>` invocaba solo `bandaDeFasesActual.refrescar()` y retornaba. Esa consulta no actualiza el resto de datos del detalle.
- Riesgos y compatibilidad: el detalle completo hace consultas adicionales al aviso, pero ya existe agrupación de 300 ms y `navegar({ conservarVista: true })` preserva scroll y acordeones. Un fallo de fases conserva el detalle y muestra su estado vacío sin error global.
- Impactos de sync, migración, Docker o despliegue: no hay.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Autorización vigente: «Listo continua» (2026-10-01).
- Pasos ordenados:
  1. En `packages/server/web/index.html`, quitar la rama que limita el aviso SSE propio al refresco de fases y reutilizar la navegación con `conservarVista`.
  2. En `tests/interfaz-ejecutable.test.ts`, comprobar que el aviso vuelve a consultar el detalle completo tras 300 ms y que una falla de fases no convierte la pantalla en error.
  3. Ejecutar `npm run build` y `npx vitest run tests/interfaz-ejecutable.test.ts` desde la raíz.
- Rollback: restaurar el refresco exclusivo de la banda de fases si el redibujado completo causara una regresión de rendimiento.

## Criterios de aceptación

- [x] R-VIV-002: Un cambio persistido disponible DEBE aparecer en Mission Control en menos de cinco segundos bajo operación local normal.
      <!-- test: npx vitest run tests/interfaz-ejecutable.test.ts -->

## Puntos

```json
[]
```

## Implementación

- El aviso SSE de un ticket visible ahora rehace el detalle completo mediante `navegar({ conservarVista: true })`; el estado, gates y actividad se actualizan junto con las fases.

## Pruebas

- `npm run build` — pasó.
- `npx vitest run tests/interfaz-ejecutable.test.ts` — pasó: 13 pruebas; cubre el refresco del detalle completo tras 300 ms.
- Resultado comunicado por el PO: aprobado; autorizó cerrar el ticket.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:76d632472ac6ca7ed35d09dfeaa4c2e6e2b931c799919d01beae3a5eb8bd0086",
    "environment": "local-4175",
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
    "po_confirmation": "Listo pero entonces cierra el actual para que continues con ese"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-02",
    "kind": "test",
    "description": "La prueba ejecutable de interfaz confirma que un aviso SSE propio vuelve a consultar el detalle completo tras 300 ms.",
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
    "technical_summary": "El aviso SSE de un ticket visible vuelve a cargar el detalle completo y conserva la posición de lectura.",
    "functional_summary": "Mission Control actualiza estado, gates, actividad y fases pocos instantes después de un cambio persistido.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin despliegue ni cambio de datos; queda unreleased."
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
    "at": "2026-10-01T19:10:43.896Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-01",
    "at": "2026-10-02T00:02:25.537Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-01",
    "at": "2026-10-02T00:08:27.237Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO: Apruebo la compuerta de analisis"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-01",
    "at": "2026-10-02T00:08:27.414Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-01",
    "at": "2026-10-02T00:08:27.564Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-01",
    "at": "2026-10-02T00:08:27.714Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-01",
    "at": "2026-10-02T00:08:40.041Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-01",
    "at": "2026-10-02T00:08:40.194Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-01",
    "at": "2026-10-02T00:10:35.021Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-01",
    "at": "2026-10-02T00:10:35.185Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-01",
    "at": "2026-10-02T00:10:35.330Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-01",
    "at": "2026-10-02T00:10:35.484Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-01",
    "at": "2026-10-02T00:11:54.198Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-01",
    "at": "2026-10-02T00:12:02.089Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-01",
    "at": "2026-10-02T00:12:02.154Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
