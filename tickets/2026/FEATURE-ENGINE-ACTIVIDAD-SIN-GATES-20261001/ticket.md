---
schema_version: 2
id: FEATURE-ENGINE-ACTIVIDAD-SIN-GATES-20261001
title: Registrar actividad sin tocar gates ni máquinas de estado
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
updated: 2026-10-01
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-ACTIVIDAD-SIN-GATES-20261001

## Solicitud original

Parte del sprint: Contrato CLI/MCP portable con identidad, eventos, contexto autorizado y configuración opcional.
- R-CON-006: Registrar actividad NO DEBE aprobar gates ni alterar las máquinas de estados existentes.
Depende de: FEATURE-ENGINE-EVENTOS-PERSISTIDOS-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [contrato/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/contrato/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: fachada de actividad explícita sobre el historial de ejecuciones, sin mutar el ticket.
- Usuario o rol afectado: CLI, MCP y adaptadores que reportarán inicio, actividad, espera o fin de un intento.
- Comportamiento actual: el log genérico admite etiquetas, pero no ofrece un vocabulario de actividad ni una proyección que comunique que es telemetría separada del workflow.
- Comportamiento esperado: el motor registra estados de actividad en el JSONL de ejecución y los consulta por intento; terminar un intento no mueve el ticket ni aprueba QA.

## Diagnóstico

- Archivos y flujo investigados: `packages/engine/src/execution-events.ts` recibe un `AuthorizedProject` y solo anexa a `.valmen/executions/events.jsonl`; no importa `transition.ts`, `append.ts` ni `gate.ts`. En cambio, `packages/engine/src/transition.ts` es quien llama `replaceFrontmatterField(..., "workflow_status")`, y `append.ts` es quien escribe los ciclos QA.
- Causa raíz confirmada: el log genérico admite etiquetas, pero no define qué hechos representan actividad. Cada puerta tendría que reinterpretarlas. Reutilizar `transition` para registrar inicio o fin llamaría justamente al código que cambia `workflow_status`, contrario a R-CON-006.
- Riesgos y compatibilidad: el contrato nuevo se limitará a estados de actividad conocidos y delegará la persistencia idempotente en `appendExecutionEvent`; no recibirá un ticket mutable ni importará módulos de gates, QA o transiciones. Sin eventos, `readExecutionEvents` ya devuelve un arreglo vacío, así que los historiales anteriores permanecen válidos.
- Impactos de sync, migración, Docker o despliegue: no hay; es una proyección local sobre el JSONL ya creado, sin cambiar contratos HTTP ni iniciar procesos.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Autorización vigente: «de aqui en adelante te voy a dar autorizacion para que apruebes los planes y los analisis» (2026-10-01).
- Pasos ordenados:
  1. Crear `packages/engine/src/execution-activity.ts` con el vocabulario validado, registro idempotente sobre `appendExecutionEvent` y lectura por intento.
  2. Exportarlo en `packages/engine/src/index.ts` sin importar gates, append ni transition.
  3. Crear `tests/execution-activity.test.ts` que compruebe inicio/espera/fin, aislamiento por intento y que la operación no crea recibos ni muta tickets.
  4. Ejecutar `npx vitest run tests/execution-activity.test.ts` y `npm run build`.
- Rollback: los consumidores dejan de llamar la fachada y el historial append-only se conserva.

## Criterios de aceptación

- [x] R-CON-006: Registrar actividad NO DEBE aprobar gates ni alterar las máquinas de estados existentes.
      <!-- test: npx vitest run tests/execution-activity.test.ts -->

## Puntos

```json
[]
```

## Implementación

Se creó `packages/engine/src/execution-activity.ts`. El contrato admite únicamente `started`, `active`, `waiting`, `finished` y `failed`, y delega la persistencia idempotente en `appendExecutionEvent`. No importa ni llama los módulos de transición, QA o gates. Se exportó desde `packages/engine/src/index.ts`.

## Pruebas

- `npx vitest run tests/execution-activity.test.ts` — 5 pruebas aprobadas: estados, reintentos, reenvío idempotente, ausencia de recibos/tickets y estado inválido.
- `npm run build` — aprobado.
- Revisión final: sin hallazgos bloqueantes; los cambios ajenos del árbol se excluyeron de esta revisión.
- Resultado del PO: autorizó que las pruebas deterministas por comando fueran ejecutadas y aprobadas por el agente.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:e65b0176d0530928b7eda9bf0fd4af28a9d36520e2367a9b78ba71c7c058b53f",
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
    "date": "2026-10-02",
    "kind": "test",
    "description": "Pruebas automatizadas aprobadas para actividad aislada, reintentos, idempotencia y ausencia de mutaciones de tickets o recibos.",
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
    "technical_summary": "Se añadió una fachada de actividad con estados limitados, persistida de forma idempotente sobre el log de ejecución.",
    "functional_summary": "CLI, MCP y adaptadores pueden informar inicio, actividad, espera, fin o fallo sin alterar el workflow ni la QA del ticket.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin despliegue ni migración; el contrato se activa al ser consumido por las puertas posteriores."
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
    "at": "2026-10-01T19:10:44.200Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-01",
    "at": "2026-10-02T01:47:47.281Z",
    "action": "analysis-recorded",
    "actor": "cli",
    "details": "Se documentó la separación entre telemetría de ejecución y máquinas de estado del ticket."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-01",
    "at": "2026-10-02T01:47:47.566Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-01",
    "at": "2026-10-02T04:20:21.664Z",
    "action": "analysis-reinforced",
    "actor": "cli",
    "details": "Se precisó la separación verificable entre persistencia de actividad y módulos que mutan workflow o QA."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-01",
    "at": "2026-10-02T04:20:52.302Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO: Autorización vigente para aprobar análisis y planes en esta sesión; el diagnóstico reforzado demuestra que la actividad solo escribe el log de ejecución y no llama a módulos de workflow, QA o gates."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-01",
    "at": "2026-10-02T04:20:52.552Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-01",
    "at": "2026-10-02T04:20:52.736Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-01",
    "at": "2026-10-02T04:20:52.909Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-01",
    "at": "2026-10-02T04:22:16.678Z",
    "action": "implementation-recorded",
    "actor": "cli",
    "details": "Se implementó y revisó la actividad de ejecución aislada de workflow, QA y gates."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-01",
    "at": "2026-10-02T04:22:16.860Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-01",
    "at": "2026-10-02T04:22:19.302Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-01",
    "at": "2026-10-02T04:22:43.423Z",
    "action": "user-tests-recorded",
    "actor": "cli",
    "details": "El PO autorizó aprobar la validación determinista ejecutada por comando."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-01",
    "at": "2026-10-02T04:22:43.499Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-01",
    "at": "2026-10-02T04:22:43.747Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-01",
    "at": "2026-10-02T04:22:43.908Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-01",
    "at": "2026-10-02T04:22:44.053Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-01",
    "at": "2026-10-02T04:22:44.219Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-01",
    "at": "2026-10-02T04:22:44.354Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-01",
    "at": "2026-10-02T04:22:44.414Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
