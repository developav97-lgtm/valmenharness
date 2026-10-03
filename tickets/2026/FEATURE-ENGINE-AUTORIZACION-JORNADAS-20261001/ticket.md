---
schema_version: 2
id: FEATURE-ENGINE-AUTORIZACION-JORNADAS-20261001
title: Observar y configurar jornadas sin ampliar autorización
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

# FEATURE-ENGINE-AUTORIZACION-JORNADAS-20261001

## Solicitud original

Parte del sprint: Persistir jornadas y mostrar su hoja de ruta sin habilitar despacho.
- R-JOR-006: Observar o configurar jornadas NO DEBE ampliar la autorización de ejecución del proyecto.
Depende de: FEATURE-ENGINE-JORNADA-PERSISTIDA-20261001, FEATURE-ENGINE-RESOLUCION-PROYECTO-20261001, FEATURE-CONFIG-CAPACIDADES-EXPLICITAS-20261001.
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

- Alcance: consulta pura de autorización de jornadas desde un proyecto ya autorizado y sus capacidades explícitas.
- Usuario o rol afectado: lectores, configuradores y el futuro despachador de jornadas.
- Comportamiento actual: las capacidades existen en configuración, pero jornadas no las consume como un contrato propio.
- Comportamiento esperado: observar o configurar no habilita despacho; este solo resulta permitido para un ejecutor declarado explícitamente.

## Diagnóstico

- Archivos y flujo investigados: `packages/adapter/src/config.ts` devuelve listas inmutables vacías cuando `execution` falta; `project-resolution.ts` verifica el proyecto contra un binding autorizado; jornadas no tiene aún una consulta de autorización.
- Causa raíz confirmada: hoy un consumidor de jornadas puede conocer que Hermes está instalado u observar su actividad, pero no recibe desde el contrato de jornadas un veredicto sobre si `hermes` puede despachar. Sin esa fachada tendría que inferir el permiso desde la instalación o las lecturas y podría iniciar trabajo sin aparecer en `execution.dispatch-executors`.
- Riesgos y compatibilidad: la consulta debe releer solo `.valmen/config.yaml` de la raíz ya autorizada, no rutas, bindings o perfiles aportados por el consumidor. La configuración ausente conserva despacho apagado.
- Aplicación de EST-004: los recibos `GR-20261003-analysis` de las dos corridas consecutivas bloquearon únicamente `diagnostico_explica_el_sintoma` (0.04 y 0.05) después de incorporar el efecto observable; ambos aprobaron causa y archivos. Por autorización explícita del PO y la regla vigente, se continúa sin una tercera corrida para posterior calibración.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). El PO autorizó continuar los tickets, aprobar planes que pasen y cerrar con pruebas aprobadas.
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. Crear `packages/engine/src/journey-authorization.ts` que lea capacidades solo desde el `AuthorizedProject` y exponga consultas puras de observación y despacho.
  2. Exportarlo desde `packages/engine/src/index.ts` sin crear comandos, workers o escrituras.
  3. Añadir `tests/journey-authorization.test.ts` para capacidades ausentes, permiso explícito y aislamiento ante proyecto no autorizado; ejecutar `npx vitest run tests/journey-authorization.test.ts tests/project-resolution.test.ts` y `npm run build`.
- Rollback: dejar de consumir la fachada; no se escribió ni se amplió ninguna política.

## Criterios de aceptación

- [x] R-JOR-006: Observar o configurar jornadas NO DEBE ampliar la autorización de ejecución del proyecto.
      <!-- test: npx vitest run tests/journey-authorization.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se agregó `readJourneyAuthorization(AuthorizedProject)` en `packages/engine/src/journey-authorization.ts`. Lee exclusivamente `.valmen/config.yaml` desde la raíz que ya resolvió y autorizó `resolveAuthorizedProject`.
- La fachada expone fuentes observables, ejecutores de despacho y consultas `canObserve`/`canDispatch`; la ausencia de capacidades conserva ambas listas vacías. No crea comandos, workers, escrituras ni permisos implícitos.
- Se reexportó el contrato desde `packages/engine/src/index.ts`.

## Pruebas

- Directorio: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/journey-authorization.test.ts tests/project-resolution.test.ts`: pasó, 2 archivos y 5 pruebas.
- `npm run build`: pasó.
- `npx vitest run && npm run build`: pasó, 112 archivos, 1849 pruebas aprobadas y 48 omitidas; compilación correcta.
- Validación manual: no aplica; el alcance es un contrato puro de motor sin interfaz ni servicio en ejecución.
- Resultado PO: autorizó cerrar, hacer commit y push si pasan las pruebas ejecutadas.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-03",
    "build_reference": "worktree:sha256:227276fefedb1c810e60c955eb8921abcc8449ac04b081b716b8bde541b1b9a6",
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
    "technical_summary": "Fachada pura de autorización de jornadas ligada a AuthorizedProject y a capacidades explícitas.",
    "functional_summary": "Observar o configurar jornadas no habilita despacho; solo un ejecutor declarado puede despachar.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO autorizó: si los tests que corras pasan se puede pasar a cerrar y hacer commit y push.",
    "release_impact": "Sin publicación; la release continúa unreleased."
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
    "notes": "Sesión Codex compartida entre tickets de control-jornadas-ejecucion; no se atribuyen tokens ni coste inventados.",
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
    "at": "2026-10-01T19:10:45.017Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-03",
    "at": "2026-10-03T21:56:40.287Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-03",
    "at": "2026-10-03T22:04:18.402Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-03",
    "at": "2026-10-03T22:05:36.805Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-03",
    "at": "2026-10-03T22:05:37.000Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-03",
    "at": "2026-10-03T22:47:08.814Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-03",
    "at": "2026-10-03T22:47:30.402Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-03",
    "at": "2026-10-03T22:47:30.601Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-03",
    "at": "2026-10-03T22:47:30.760Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-03",
    "at": "2026-10-03T22:47:30.917Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-03",
    "at": "2026-10-03T22:47:31.076Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-03",
    "at": "2026-10-03T22:47:31.842Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-03",
    "at": "2026-10-03T22:47:32.008Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
