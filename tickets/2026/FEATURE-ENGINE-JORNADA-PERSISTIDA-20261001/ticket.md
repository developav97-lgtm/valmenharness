---
schema_version: 2
id: FEATURE-ENGINE-JORNADA-PERSISTIDA-20261001
title: Persistir jornada con tickets y condiciones de inicio
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
updated: 2026-10-03
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-JORNADA-PERSISTIDA-20261001

## Solicitud original

Parte del sprint: Persistir jornadas y mostrar su hoja de ruta sin habilitar despacho.
- R-JOR-001: Una jornada DEBE conservar su lista de tickets y las condiciones de inicio de cada uno.
Depende de: FEATURE-CORE-IDENTIDAD-EJECUCION-20261001, FEATURE-ENGINE-EVENTOS-PERSISTIDOS-20261001, FEATURE-ENGINE-RESOLUCION-PROYECTO-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [jornadas/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/jornadas/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: contrato persistido de `@valmen/engine` para crear, revisar y consultar jornadas por proyecto autorizado. Cada revisión conservará la lista ordenada de tickets, prioridad, dependencias, condición de inicio, ventana y referencias de autorización aplicables; también podrá conservar un inicio real solo cuando se declare explícitamente. No selecciona, despacha ni instala workers.
- Usuario o rol afectado: los adaptadores, CLI, MCP y Mission Control que luego creen o presenten una hoja de ruta sin tener que inventar condiciones de inicio.
- Comportamiento actual: el motor ya persiste eventos e intentos de ejecución en `.valmen/executions/events.jsonl`, pero no existe una entidad de jornada ni un historial que agrupe tickets y sus condiciones. Una vista futura tendría que recomponer esa intención desde ticket individuales o crear cron por ticket.
- Comportamiento esperado: el proyecto autorizado conserva revisiones append-only de una jornada bajo su propio registro. Consultarla devuelve sus tickets en orden y todas las condiciones declaradas; una dependencia pendiente no recibe un inicio real por inferencia y un ticket puede pertenecer a otra jornada sin alterar sus ejecuciones.

## Diagnóstico

- Archivos y flujo investigados: `packages/engine/src/execution-events.ts` es el precedente de persistencia JSONL append-only, con `MutationLock`, `ensureSecurePath`, cursores e idempotencia. `packages/engine/src/project-resolution.ts` entrega el proyecto autorizado que delimita toda escritura. `packages/core/src/execution-identity.ts` valida IDs de proyecto, ticket y ejecución; no hay todavía un módulo ni una ruta de jornadas. La memoria consultada no contiene un antecedente de dominio para jornadas; sus resultados AP-001 a AP-005 tratan gates y paquetes, no el modelo solicitado.
- Causa raíz confirmada: la intención de una jornada no tiene entidad ni historial propios. Reutilizar eventos de ejecución mezclaría hechos reales con programación, y reescribir un JSON único borraría revisiones que R-JOR-001 exige conservar.
- Riesgos y compatibilidad: el registro debe quedar aislado por proyecto, validar identificadores y tiempos portables, conservar orden de recepción y rechazar una revisión repetida con contenido distinto. La base no debe deducir ni generar `start.actualAt`: un valor ausente seguirá ausente aunque haya dependencias declaradas. Ventanas, autorización y selección solo se conservarán como condiciones; su semántica de cierre, permisos y despacho queda para sus tickets dependientes.
- Supuestos y decisiones pendientes: una revisión es una foto completa e inmutable de la lista de tickets de una jornada; los consumidores leen la última sin perder las anteriores. Las referencias de ventana y autorización serán identificadores portables, no rutas ni credenciales. La forma de habilitar o denegar despacho corresponde a `FEATURE-ENGINE-AUTORIZACION-JORNADAS-20261001` y no se anticipa aquí.
- Impactos de sync, migración, Docker o despliegue: ninguno. Es persistencia local nueva bajo `.valmen` y no altera tickets, eventos de ejecución existentes ni perfiles de adaptador.

## Plan

- Alcance y exclusiones: agregar solo el repositorio de jornadas y su lectura desde `@valmen/engine`. Quedan fuera CLI/MCP/UI, scheduler, cron, selección de elegibles, reservas de capacidad, interpretación de ventanas y verificación de autorizaciones.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). El PO autorizó continuar los tickets en orden, corregir y reintentar gates que quedaran en revisión, y aprobar el plan cuando pase.
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. Crear `packages/engine/src/journeys.ts` con los tipos de entrada y lectura para una jornada, sus tickets ordenados y sus condiciones (`priority`, dependencias, inicio programado o condicionado, ventana, autorizaciones e inicio real explícito). Validar IDs, órdenes, listas y fechas ISO sin resolver políticas ni consultar fuentes externas.
  2. Persistir revisiones completas en `.valmen/journeys/events.jsonl` mediante `MutationLock`, `ensureSecurePath`, `O_APPEND` y `fsync`; implementar creación, revisión idempotente, lectura del historial y proyección de la revisión vigente por jornada. Rechazar cambios bajo el mismo `revisionId` y mantener aislado el `projectId` autorizado.
  3. Reexportar el contrato desde `packages/engine/src/index.ts`, sin añadir comandos, rutas HTTP ni llamadas a adaptadores.
  4. Crear `tests/journeys.test.ts` para cubrir cinco tickets antes de una ventana, orden y condiciones preservados, ausencia de inicio real inventado, revisiones append-only, reutilización de un ticket en otra jornada y rechazos de proyecto o revisión inconsistentes. Ejecutar `npx vitest run tests/journeys.test.ts tests/execution-events.test.ts` y `npm run build` desde la raíz.
- Compatibilidad: no se modifica `.valmen/executions/events.jsonl`; la ausencia de un archivo de jornadas equivale a ninguna jornada y los consumidores futuros podrán leerlo sin migrar tickets existentes.
- Rollback: dejar de consumir el módulo nuevo y preservar `.valmen/journeys/events.jsonl` como historial. No se borra ni reescribe una revisión append-only ya creada.

## Criterios de aceptación

- [x] R-JOR-001: Una jornada conserva en orden cada ticket, su prioridad, dependencias, condición de inicio, ventana y autorizaciones aplicables dentro del proyecto autorizado.
      <!-- test: npx vitest run tests/journeys.test.ts -->
- [x] R-JOR-001: Las revisiones se anexan sin sustituir el historial; reenviar la misma revisión es idempotente y una revisión con el mismo ID y contenido distinto se rechaza.
      <!-- test: npx vitest run tests/journeys.test.ts -->
- [x] R-JOR-001: El inicio programado, condicionado y real se representan por separado; una condición por dependencias no crea un inicio real y el mismo ticket puede aparecer en otra jornada sin tocar sus ejecuciones.
      <!-- test: npx vitest run tests/journeys.test.ts tests/execution-events.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadió `packages/engine/src/journeys.ts`, con una foto inmutable por revisión de la jornada, sus tickets ordenados, prioridad, dependencias, condición e instantes de inicio, ventana y autorizaciones declaradas.
- Las revisiones se persisten en `.valmen/journeys/events.jsonl` con el mismo aislamiento de proyecto, lock, `O_APPEND` y `fsync` que los eventos de ejecución. La creación, revisión y reenvío son verificables; el lector rechaza cursores, IDs y secuencias de revisión corruptos.
- Se exportó el contrato desde `packages/engine/src/index.ts`. No se agregaron workers, cron, selección, permisos de despacho, UI, CLI ni MCP.

## Pruebas

- Directorio: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/journeys.test.ts tests/execution-events.test.ts` — pasó: 2 archivos y 9 pruebas. Cubre cinco tickets y sus condiciones antes de una ventana, revisiones append-only e idempotentes, inicio real solamente explícito, reutilización entre jornadas y preservación de eventos de ejecución.
- `npm run build` — pasó: TypeScript compila y la interfaz se copia al artefacto CLI.
- `npx vitest run` — pasó: 110 archivos y 1843 pruebas; 1 archivo y 48 pruebas de equivalencia quedaron omitidos por configuración predeterminada.
- Validación manual: no aplica; el ticket solo añade una API de motor sin interfaz, servidor ni servicio externo.
- Resultado del PO: autorizó ejecutar las pruebas y cerrar con este resultado esperado: «si los tests que corras pasan se puede pasar a cerrar y hacer commit y push».

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-03",
    "build_reference": "worktree:sha256:dc1f2c0d74f541c8273bb8bcb3ef8adc336b754ae4c41e2ddb132d846a175d13",
    "environment": "local-node-24",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-03",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO autorizó: si los tests que corras pasan se puede pasar a cerrar y hacer commit y push."
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
    "date": "2026-10-03",
    "technical_summary": "Se agregó el historial append-only de jornadas por proyecto, con revisiones idempotentes, validación e inmutabilidad de las fotos.",
    "functional_summary": "La jornada conserva tickets ordenados y sus condiciones sin activar despacho ni alterar ejecuciones existentes.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO autorizó: si los tests que corras pasan se puede pasar a cerrar y hacer commit y push.",
    "release_impact": "Sin publicación: cambio local de motor, release continúa unreleased."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-03",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión Codex compartida entre tickets de control-jornadas-ejecucion; no se atribuyen tokens ni coste inventados. El gasto agregado permanece en la sesión.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-compartida-20261003",
    "confidence": "high",
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
    "at": "2026-10-01T19:10:44.918Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-03",
    "at": "2026-10-03T21:25:58.894Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-03",
    "at": "2026-10-03T21:26:27.909Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-03",
    "at": "2026-10-03T21:27:42.917Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-03",
    "at": "2026-10-03T21:27:43.099Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-03",
    "at": "2026-10-03T21:33:10.506Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-03",
    "at": "2026-10-03T21:33:23.659Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-03",
    "at": "2026-10-03T21:33:23.853Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-03",
    "at": "2026-10-03T21:33:24.020Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-03",
    "at": "2026-10-03T21:33:24.176Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-03",
    "at": "2026-10-03T21:33:33.993Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-03",
    "at": "2026-10-03T21:33:34.747Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-03",
    "at": "2026-10-03T21:33:34.909Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
