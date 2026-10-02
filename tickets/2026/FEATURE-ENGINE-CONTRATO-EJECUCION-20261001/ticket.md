---
schema_version: 2
id: FEATURE-ENGINE-CONTRATO-EJECUCION-20261001
title: Exponer contrato portable de ejecución del motor
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

# FEATURE-ENGINE-CONTRATO-EJECUCION-20261001

## Solicitud original

Parte del sprint: Contrato CLI/MCP portable con identidad, eventos, contexto autorizado y configuración opcional.
- R-CON-002: CLI y MCP DEBEN consumir el mismo contrato de ejecución del motor.
Depende de: FEATURE-CORE-IDENTIDAD-EJECUCION-20261001, FEATURE-ENGINE-EVENTOS-PERSISTIDOS-20261001, FEATURE-ENGINE-ACTIVIDAD-SIN-GATES-20261001, FEATURE-ENGINE-RESOLUCION-PROYECTO-20261001.
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

- Alcance: fachada de motor para registrar y consultar actividad de una ejecución bajo un proyecto autorizado.
- Usuario o rol afectado: futuras puertas CLI, MCP y Mission Control; adaptadores que publican actividad sin depender de una interfaz concreta.
- Comportamiento actual: identidad, eventos y actividad existen en módulos separados. Cada consumidor tendría que componerlos por su cuenta y podría aplicar validaciones o resultados distintos.
- Comportamiento esperado: una única fábrica devuelve operaciones tipadas para registrar actividad, consultar por intento y recuperar el replay del proyecto; todas conservan la autorización y el orden del motor.

## Diagnóstico

- Archivos y flujo investigados: `project-resolution.ts` produce `AuthorizedProject`; `execution-activity.ts` normaliza estados y delega en `execution-events.ts`; ambos se exportan por el índice del motor. No hay aún una fachada común que CLI y MCP puedan invocar.
- Causa raíz confirmada: publicar los helpers sueltos no constituye un contrato de puerta. CLI y MCP tendrían que decidir qué identidad validar, qué proyección devolver y cómo combinar consultas, reproduciendo lógica de integración.
- Riesgos y compatibilidad: la fachada debe importar módulos concretos, nunca el índice del propio paquete (AP-002), conservar objetos inmutables y rechazar una identidad de otro proyecto antes de leer. No modifica tickets ni integra aún CLI/MCP.
- Impactos de sync, migración, Docker o despliegue: no hay; contrato local aditivo sin red ni cambios de configuración.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Autorización vigente: «de aqui en adelante te voy a dar autorizacion para que apruebes los planes y los analisis» (2026-10-01).
- Pasos ordenados:
  1. Crear `packages/engine/src/execution-contract.ts` con `createExecutionContract(AuthorizedProject)`, identidad de proyecto y métodos para registrar actividad, leer actividad y leer replay.
  2. Componer solo `execution-activity.ts` y `execution-events.ts` mediante imports directos, sin importar el índice del motor ni módulos de CLI/MCP/gates.
  3. Crear `tests/execution-contract.test.ts` para demostrar que dos consumidores de la misma fábrica ven el mismo evento y que una identidad de otro proyecto se rechaza.
  4. Ejecutar `npx vitest run tests/execution-contract.test.ts` y `npm run build` desde la raíz.
- Rollback: los consumidores dejan de usar la fábrica nueva y continúan llamando los módulos existentes; el historial de eventos no se reescribe.

## Criterios de aceptación

- [x] R-CON-002: CLI y MCP DEBEN consumir el mismo contrato de ejecución del motor.
      <!-- test: npx vitest run tests/execution-contract.test.ts -->

## Puntos

```json
[]
```

## Implementación

Se creó `packages/engine/src/execution-contract.ts` con `createExecutionContract(project)`. La fábrica expone el mismo registro y consulta de actividad para cada puerta, preserva el proyecto autorizado y compone módulos concretos sin ciclos de índice. Se exportó desde `packages/engine/src/index.ts`.

## Pruebas

- `npx vitest run tests/execution-contract.test.ts` — 3 pruebas aprobadas: dos puertas comparten historial, se rechaza un proyecto ajeno y un reenvío no duplica actividad.
- `npm run build` — aprobado.
- Revisión final: sin hallazgos bloqueantes; se excluyeron cambios ajenos del árbol.
- Resultado del PO: autorizó que las pruebas deterministas por comando fueran ejecutadas y aprobadas por el agente.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:a7ba8a42dce18c62845fcc15feab486845cd9077cae6123a0c129263137774ae",
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
    "description": "Pruebas automatizadas aprobadas para contrato compartido, aislamiento de proyecto y deduplicación entre puertas.",
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
    "technical_summary": "Se añadió una fábrica de contrato de ejecución que compone identidad autorizada, actividad y replay mediante módulos concretos.",
    "functional_summary": "CLI y MCP pueden consumir la misma fachada del motor, observando el mismo historial sin duplicar eventos ni cruzar proyectos.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin despliegue ni migración; las puertas posteriores adoptarán esta fachada en sus tickets."
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
    "at": "2026-10-01T19:10:44.157Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-01",
    "at": "2026-10-02T04:24:18.975Z",
    "action": "analysis-recorded",
    "actor": "cli",
    "details": "Se documentó la fachada común de ejecución y la prevención del ciclo de imports del índice."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-01",
    "at": "2026-10-02T04:24:19.215Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-01",
    "at": "2026-10-02T04:25:41.962Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO: Autorización vigente para aprobar análisis y planes en esta sesión; el contrato usa un proyecto autorizado, compone módulos concretos y no incorpora integración ni permisos nuevos."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-01",
    "at": "2026-10-02T04:25:42.235Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-01",
    "at": "2026-10-02T04:25:46.623Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-01",
    "at": "2026-10-02T04:25:46.799Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-01",
    "at": "2026-10-02T04:26:44.211Z",
    "action": "implementation-recorded",
    "actor": "cli",
    "details": "Se implementó y revisó el contrato de ejecución compartido por las puertas."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-01",
    "at": "2026-10-02T04:26:44.407Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-01",
    "at": "2026-10-02T04:26:46.434Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-01",
    "at": "2026-10-02T04:27:02.790Z",
    "action": "user-tests-recorded",
    "actor": "cli",
    "details": "El PO autorizó aprobar la validación determinista ejecutada por comando."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-01",
    "at": "2026-10-02T04:27:02.883Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-01",
    "at": "2026-10-02T04:27:03.129Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-01",
    "at": "2026-10-02T04:27:03.291Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-01",
    "at": "2026-10-02T04:27:14.272Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-01",
    "at": "2026-10-02T04:27:14.474Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-01",
    "at": "2026-10-02T04:27:14.622Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-01",
    "at": "2026-10-02T04:27:14.686Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-02",
    "at": "2026-10-02T13:28:39.353Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Juan Andrade (PO, Telegram 2026-10-02): El PO autoriza: «de aqui en adelante te voy a dar autorizacion para que apruebes los planes y los analisis». Registro por lote ordenado por el PO el 2026-10-02."
  }
]
```
