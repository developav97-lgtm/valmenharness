---
schema_version: 2
id: FEATURE-CORE-IDENTIDAD-EJECUCION-20261001
title: Definir entidades e identidad de ejecución en core
type: FEATURE
module: CORE
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

# FEATURE-CORE-IDENTIDAD-EJECUCION-20261001

## Solicitud original

Parte del sprint: Contrato CLI/MCP portable con identidad, eventos, contexto autorizado y configuración opcional.
- R-CON-003: Cada ejecución DEBE tener identidad explícita de proyecto y un identificador propio.
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

- Alcance: contrato puro de identidad para una ejecución, exportado por `@valmen/core`.
- Usuario o rol afectado: cualquier cliente CLI, MCP, Mission Control o adaptador que registre o consulte ejecuciones en un proyecto declarado.
- Comportamiento actual: el núcleo solo dispone de identificadores aislados de tickets; no existe una entidad común que exija el proyecto ni una clave para distinguir ejecuciones de dos registros con el mismo ticket.
- Comportamiento esperado: cada operación futura recibe una identidad inmutable con proyecto explícito, ticket y ejecución propios; el núcleo puede validarla y construir una clave canónica sin leer disco ni depender de un adaptador.

## Diagnóstico

- Archivos y flujo investigados: `packages/core/src/contract.ts` centraliza constantes y patrones; `packages/core/src/index.ts` exporta el dominio puro. `packages/core/package.json` no tiene dependencias externas. `packages/engine`, CLI, MCP y servidor dependen de core, mientras que `FEATURE-ENGINE-EVENTOS-PERSISTIDOS-20261001` y `FEATURE-ENGINE-CONTRATO-EJECUCION-20261001` dependen de este ticket.
- Causa raíz confirmada: no hay tipo ni validador de identidad de ejecución. Un `ticketId` por sí solo no incluye el proyecto, por lo que dos registros con el mismo ID no se pueden separar de forma verificable antes de persistir o exponer actividad.
- Riesgos y compatibilidad: el contrato debe usar identificadores lógicos, no rutas locales, perfiles ni secretos. Debe validar campos no vacíos y generar una clave sin colisiones por concatenación ambigua. Se añade como API nueva y no modifica tickets históricos ni sus máquinas de estado.
- Impactos de sync, migración, Docker o despliegue: no hay. La persistencia, deduplicación, resolución de proyectos y transporte se implementan en tickets posteriores.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Autorización vigente: «Si apruebo» (2026-10-01).
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. Crear `packages/core/src/execution-identity.ts` con tipos inmutables para proyecto, ejecución y ticket, validación de sus identificadores y una clave canónica que incluya el proyecto y evite colisiones de delimitador.
  2. Exportar el contrato desde `packages/core/src/index.ts` sin añadir E/S ni dependencias a core.
  3. Crear `tests/execution-identity.test.ts` para cubrir aceptación, rechazo de identidades incompletas o de ámbito inválido y aislamiento de dos proyectos con el mismo ticket y ejecución.
  4. Ejecutar `npx vitest run tests/execution-identity.test.ts` y `npm run build` desde la raíz.
- Rollback: retirar el nuevo módulo y su exportación; como no persiste datos ni cambia contratos existentes, no requiere migración ni reversión operativa.

## Criterios de aceptación

- [x] R-CON-003: Cada ejecución DEBE tener identidad explícita de proyecto y un identificador propio.
      <!-- test: npx vitest run tests/execution-identity.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadió `packages/core/src/execution-identity.ts`, con `createExecutionIdentity` para validar y congelar `projectId`, `ticketId` y `executionId`, y `executionScopeKey` para indexar de forma canónica el ámbito proyecto-ejecución.
- `packages/core/src/index.ts` exporta el contrato para los consumidores futuros sin introducir E/S, red ni dependencias nuevas.
- `tests/execution-identity.test.ts` cubre identidad válida, inmutabilidad, entradas inválidas y aislamiento de proyectos con el mismo ticket e identificador local.

## Pruebas

- Directorio: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/execution-identity.test.ts` — pasó: 7 casos; comprueba validación, inmutabilidad y aislamiento entre proyectos.
- `npm run build` — pasó: TypeScript compila y la interfaz se copia al artefacto CLI.
- `npx vitest run` — pasó: 1.677 pruebas, 48 omitidas de equivalencia opcional.
- `valmen secrets` y `git diff --check` — pasaron.
- Validación manual propuesta: desde cualquier consumidor futuro, crear dos identidades con el mismo ticket e `executionId` y proyectos distintos; sus claves de ámbito deben diferir.
- Entorno: Node 24 y dependencias npm ya instaladas; no requiere Hermes, Mission Control, bases externas ni credenciales.
- Resultado comunicado por el PO: pruebas aprobadas («Si aprobadas»).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:f3161f35b525680de3491e8f4b171009537bd0f04fb6c89c44000fb897688edf",
    "environment": "local-node24",
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
    "po_confirmation": "Si aprobadas"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-02",
    "kind": "automated-test",
    "description": "La suite específica confirma validación, inmutabilidad y aislamiento de identidades de ejecución entre proyectos.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-02",
    "kind": "automated-test",
    "description": "Árbol exacto verificado para QA: contrato de identidad, su exportación y su prueba específica.",
    "reference": "worktree:sha256:f3161f35b525680de3491e8f4b171009537bd0f04fb6c89c44000fb897688edf",
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
    "technical_summary": "Core expone una identidad inmutable y validada de proyecto, ticket y ejecución, junto con una clave canónica de ámbito.",
    "functional_summary": "Los consumidores futuros pueden separar ejecuciones de proyectos distintos aunque reutilicen el mismo ticket e identificador local.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin despliegue ni migración; queda unreleased."
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
    "at": "2026-10-01T19:10:44.069Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-01",
    "at": "2026-10-02T00:13:12.973Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-01",
    "at": "2026-10-02T00:15:09.023Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-01",
    "at": "2026-10-02T00:15:32.673Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> blocked."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-01",
    "at": "2026-10-02T00:15:32.827Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: blocked -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-01",
    "at": "2026-10-02T00:16:38.241Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO: Si apruebo"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-01",
    "at": "2026-10-02T00:16:38.402Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-01",
    "at": "2026-10-02T00:17:19.476Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-01",
    "at": "2026-10-02T00:17:19.641Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-01",
    "at": "2026-10-02T00:18:51.582Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-01",
    "at": "2026-10-02T00:18:51.740Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-01",
    "at": "2026-10-02T00:20:02.513Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-01",
    "at": "2026-10-02T00:20:02.722Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-01",
    "at": "2026-10-02T00:20:02.870Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-01",
    "at": "2026-10-02T00:20:03.025Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-01",
    "at": "2026-10-02T00:20:03.179Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-01",
    "at": "2026-10-02T00:20:17.618Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-01",
    "at": "2026-10-02T00:20:17.780Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-01",
    "at": "2026-10-02T00:20:17.837Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
