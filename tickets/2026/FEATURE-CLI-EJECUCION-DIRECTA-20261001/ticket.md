---
schema_version: 2
id: FEATURE-CLI-EJECUCION-DIRECTA-20261001
title: Registrar y consultar actividad por CLI sin Hermes ni tablero
type: FEATURE
module: CLI
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

# FEATURE-CLI-EJECUCION-DIRECTA-20261001

## Solicitud original

Parte del sprint: Contrato CLI/MCP portable con identidad, eventos, contexto autorizado y configuración opcional.
- R-ACT-006: Un ticket ejecutado directamente DEBE ser observable sin tablero ni jornada.
- R-CON-001: El flujo directo DEBE funcionar mediante CLI sin instalar Hermes ni abrir Mission Control.
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

- Alcance: exponer por CLI el registro y la consulta de actividad ya definidos por el contrato del motor.
- Usuario o rol afectado: quien ejecuta un ticket desde la terminal, un agente CLI o una automatización sin Hermes.
- Comportamiento actual: la actividad persistida sólo tenía fachada de motor; la CLI no podía declararla ni leerla.
- Comportamiento esperado: `valmen execution record` y `valmen execution list` observan una ejecución de un proyecto autorizado sin tablero, jornada ni configuración Hermes.

## Diagnóstico

- Archivos y flujo investigados: `packages/engine/src/execution-contract.ts`, `execution-activity.ts`, `project-resolution.ts`, el parser y despacho de `packages/cli/src/main.ts`, y las pruebas del contrato. Memoria AP-002: se evita importar el índice del propio paquete; la CLI consume el índice público de engine y su módulo propio usa importaciones externas.
- Causa raíz o hipótesis: faltaba la traducción de argumentos de terminal al contrato común; añadir otro almacenamiento o resolver rutas desde el directorio actual duplicaría el aislamiento y divergiría de MCP.
- Riesgos y compatibilidad: el subcomando exige `--project`, `--ticket` y `--execution`; el proyecto se resuelve únicamente desde `bindings.local.yaml`. Los reintentos conservan la idempotencia del `event-id` en engine.
- Impactos de sync, migración, Docker o despliegue: ninguno; sólo se agrega una superficie local a datos ya versionados en `.valmen/executions`.

## Plan

- Gate de plan y aprobación: plan automático evaluado con cascada; **aprobado explícitamente por el PO** mediante la autorización previa de esta sesión, registrada en GR-20261002-plan.
- Pasos ordenados:
  1. Crear `packages/cli/src/execution.ts` para validar el subcomando `execution record|list`, resolver el proyecto autorizado y llamar exclusivamente a `createExecutionContract`.
  2. Conectar `execution` al parser, ayuda, despacho síncrono y entrada asíncrona de `packages/cli/src/main.ts`, y reexportarlo desde `packages/cli/src/index.ts`.
  3. Crear `tests/execution-cli.test.ts` con un binding temporal para comprobar registro, consulta, idempotencia, rechazo de un proyecto no autorizado y que el módulo directo no importa Hermes ni Mission Control; ejecutar Vitest y la compilación TypeScript.
- Rollback: retirar el módulo y sus conexiones al despacho; los eventos de prueba viven en un directorio temporal y el subcomando no muta tickets, gates ni configuración.

## Criterios de aceptación

- [x] R-ACT-006.a: `execution record` persiste una actividad para la identidad declarada.
      <!-- test: npx vitest run tests/execution-cli.test.ts -->
- [x] R-ACT-006.b: `execution list` devuelve la actividad persistida por el contrato de ejecución.
      <!-- test: npx vitest run tests/execution-cli.test.ts -->
- [x] R-CON-001.a: `execution record|list` resuelve el proyecto desde el binding local autorizado.
      <!-- test: npx vitest run tests/execution-cli.test.ts -->
- [x] R-CON-001.b: El módulo `execution` no importa Hermes ni Mission Control.
      <!-- test: npx vitest run tests/execution-cli.test.ts -->
- [x] R-CON-002: La CLI resuelve el proyecto autorizado y delega el registro y la consulta en `createExecutionContract`.
      <!-- test: npx vitest run tests/execution-cli.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadió `packages/cli/src/execution.ts`: traduce `execution record|list` al contrato `createExecutionContract` de un proyecto resuelto desde el binding local.
- `packages/cli/src/main.ts` reconoce sus argumentos, lo despacha en ambas rutas del CLI y `packages/cli/src/index.ts` publica la superficie.
- La actividad directa no lee configuración Hermes ni importa Mission Control.

## Pruebas

- `npx vitest run tests/execution-cli.test.ts tests/cascada-verificada.test.ts`: 13 pruebas aprobadas.
- `npx tsc -b --pretty false`: compilación aprobada.
- `git diff --check`: sin errores de espacio.
- Resultado del PO: pruebas por comando aprobadas automáticamente bajo su autorización explícita en esta sesión; no hay validación manual adicional requerida.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:c91484672fde23fcf65f0391acfcd0f5d5752eebcc7682e5aa5efcc2c522c252",
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
    "technical_summary": "Se agregó la superficie CLI de actividad directa, vinculada al contrato de ejecución autorizado e idempotente.",
    "functional_summary": "Un agente o persona puede registrar y consultar la actividad de un ticket sin Hermes ni Mission Control.",
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
    "at": "2026-10-01T19:10:44.249Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-01",
    "at": "2026-10-02T04:38:43.636Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-01",
    "at": "2026-10-02T04:38:43.854Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-01",
    "at": "2026-10-02T04:45:31.077Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Juan Andrade: Autorización previa de la persona responsable en esta sesión: aprobar automáticamente análisis y planes cuando la evidencia sea suficiente; la prueba directa confirma el aislamiento."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-01",
    "at": "2026-10-02T04:45:46.200Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-01",
    "at": "2026-10-02T04:45:46.404Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-01",
    "at": "2026-10-02T04:46:03.520Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-01",
    "at": "2026-10-02T04:46:14.799Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-01",
    "at": "2026-10-02T04:46:56.418Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-01",
    "at": "2026-10-02T04:46:56.601Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-01",
    "at": "2026-10-02T04:47:10.801Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-01",
    "at": "2026-10-02T04:47:11.015Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-01",
    "at": "2026-10-02T04:47:19.837Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-01",
    "at": "2026-10-02T04:47:19.898Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
