---
schema_version: 2
id: FEATURE-MCP-EJECUCION-DIRECTA-20261001
title: Exponer el mismo contrato de ejecución por MCP
type: FEATURE
module: MCP
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

# FEATURE-MCP-EJECUCION-DIRECTA-20261001

## Solicitud original

Parte del sprint: Contrato CLI/MCP portable con identidad, eventos, contexto autorizado y configuración opcional.
- R-ACT-006: Un ticket ejecutado directamente DEBE ser observable sin tablero ni jornada.
- R-CON-002: CLI y MCP DEBEN consumir el mismo contrato de ejecución del motor.
Depende de: FEATURE-ENGINE-CONTRATO-EJECUCION-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [actividad/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actividad/spec.md).
- Spec completa: [contrato/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/contrato/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: exponer el contrato de actividad directa mediante herramientas MCP.
- Usuario o rol afectado: cualquier arnés compatible con MCP.
- Comportamiento actual: MCP no tenía una puerta para declarar ni leer actividad directa.
- Comportamiento esperado: dos herramientas MCP registran y consultan actividad del proyecto autorizado, sin tocar el flujo del ticket.

## Diagnóstico

- Archivos y flujo investigados: `packages/mcp/src/tools.ts`, `execution-contract.ts` y `project-resolution.ts`; se aplicó AP-002 evitando importaciones internas del índice propio.
- Causa raíz o hipótesis: faltaba traducir argumentos MCP al contrato común; una implementación propia duplicaría identidad, idempotencia y aislamiento.
- Riesgos y compatibilidad: sólo se acepta `proyecto` declarado en el binding local; no se admite una raíz libre en estas herramientas.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: plan automático; **aprobado explícitamente por el PO** mediante la autorización previa de esta sesión.
- Pasos ordenados:
  1. Declarar `registrar_actividad_ejecucion` y `ver_actividad_ejecucion` en `packages/mcp/src/tools.ts` con sus esquemas y anotaciones.
  2. Resolver el proyecto autorizado, construir la identidad y delegar ambas operaciones a `createExecutionContract`.
  3. Añadir `tests/execution-mcp.test.ts` con bindings temporales y ejecutar Vitest y TypeScript.
- Rollback: retirar ambas entradas del catálogo y sus casos; no hay cambios de esquema ni de tickets.

## Criterios de aceptación

- [x] R-ACT-006.a: La herramienta MCP registra una actividad directa persistida.
      <!-- test: npx vitest run tests/execution-mcp.test.ts -->
- [x] R-ACT-006.b: La herramienta MCP consulta la actividad directa persistida.
      <!-- test: npx vitest run tests/execution-mcp.test.ts -->
- [x] R-CON-002: MCP delega registro y consulta en `createExecutionContract` del motor.
      <!-- test: npx vitest run tests/execution-mcp.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadieron las herramientas MCP `registrar_actividad_ejecucion` y `ver_actividad_ejecucion` en `packages/mcp/src/tools.ts`.
- Ambas resuelven el binding local y delegan exclusivamente en `createExecutionContract`.

## Pruebas

- `npx vitest run tests/execution-mcp.test.ts`: aprobada.
- `npx tsc -b --pretty false`: aprobada.
- Resultado del PO: pruebas por comando aprobadas automáticamente bajo su autorización explícita en esta sesión; no requiere validación manual adicional.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:952a8b2ea793c81b9d8482b29408ca05d62e3fd3e3bb1c3ba667fb7c9955d62b",
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
    "technical_summary": "Se expusieron dos herramientas MCP que resuelven el proyecto autorizado y delegan actividad al contrato del motor.",
    "functional_summary": "Un arnés MCP puede registrar y consultar una ejecución directa sin Hermes ni tablero.",
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
    "at": "2026-10-01T19:10:44.296Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-01",
    "at": "2026-10-02T04:53:12.252Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-01",
    "at": "2026-10-02T04:53:12.500Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-01",
    "at": "2026-10-02T04:53:59.048Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-01",
    "at": "2026-10-02T04:53:59.266Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-01",
    "at": "2026-10-02T04:54:05.459Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-01",
    "at": "2026-10-02T04:54:05.651Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-01",
    "at": "2026-10-02T04:54:18.400Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-01",
    "at": "2026-10-02T04:54:18.612Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-01",
    "at": "2026-10-02T04:54:18.774Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-01",
    "at": "2026-10-02T04:54:18.932Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-01",
    "at": "2026-10-02T04:54:25.588Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-01",
    "at": "2026-10-02T04:54:25.658Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
