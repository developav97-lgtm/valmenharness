---
schema_version: 2
id: FEATURE-ENGINE-ENLACE-SESION-EJECUTORA-20261001
title: Enlazar sesión ejecutora verificable por intento
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

# FEATURE-ENGINE-ENLACE-SESION-EJECUTORA-20261001

## Solicitud original

Parte del sprint: Observar fases, sesiones, modelos y mensajes mediante adaptadores opcionales.
- R-ACT-002: Cada intento DEBE enlazar su sesión ejecutora sin confundirla con la sesión que pidió el trabajo.
Depende de: FEATURE-CORE-IDENTIDAD-EJECUCION-20261001, FEATURE-ENGINE-ESTADO-ACTIVIDAD-20261001.
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

- Alcance: el contrato persistido del motor para asociar, por intento, una sesión ejecutora y, cuando se declare, la sesión de origen que solicitó el trabajo. Incluye lectura determinista del vínculo y su exposición desde el contrato de ejecución; no lee todavía Hermes, OpenCode ni Codex.
- Usuario o rol afectado: adaptadores, CLI, MCP y las vistas que necesiten inspeccionar un intento sin atribuirle una conversación incorrecta.
- Comportamiento actual: los eventos en `.valmen/executions/events.jsonl` conservan identidad de ejecución, `attemptId`, actividad y fuente, pero no tienen una referencia de sesión. La actividad no puede distinguir la conversación que creó tarjetas de la sesión propia del worker.
- Comportamiento esperado: un emisor autorizado puede anexar un vínculo verificable con adaptador, ámbito e identificador de sesión; cada intento se consulta con su sesión ejecutora y la sesión de origen queda separada. Un reintento o continuación por compactación añade su propio hecho, sin sobrescribir ni inferir vínculos previos.

## Diagnóstico

- Archivos y flujo investigados: `packages/core/src/execution-identity.ts` define el ámbito portable proyecto/ticket/ejecución; `packages/engine/src/execution-events.ts` persiste y rehidrata el JSONL append-only con `attemptId`; `packages/engine/src/execution-activity.ts` proyecta solo `activity.*`; `packages/engine/src/execution-contract.ts` expone la fachada común. `tests/execution-activity.test.ts` confirma hoy el aislamiento por intento, pero no hay enlace de sesión.
- Causa raíz o hipótesis: `ExecutionEvent` no declara una referencia de sesión ni el rol de esa referencia. Por eso el motor no puede publicar una identidad cierta para la sesión ejecutora ni separar una sesión origen; cualquier consumidor tendría que adivinarla por título, hora o fuente, conducta que R-ACT-002 prohíbe.
- Riesgos y compatibilidad: el esquema JSONL existente debe seguir leyendo eventos antiguos sin sesión. El enlace se anexa como un evento nuevo y valida etiquetas e identificadores portables, de modo que reintentos y compactaciones queden auditables y un adaptador no pueda cruzar proyecto, ejecución o rol. La lectura conservará orden de recepción y no tocará workflow, QA ni datos de adaptadores.
- Supuestos y decisiones pendientes: se implementará la referencia como dato explícito del motor (adaptador, ámbito lógico e identificador de sesión), no como ruta ni como texto de conversación. La asociación con Hermes/OpenCode/Codex y la elección de sus ámbitos concretos quedan para los tickets de adaptador dependientes.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Alcance y exclusiones: persistir y consultar vínculos de sesión por intento dentro de `@valmen/engine`. Quedan fuera los lectores de Hermes/OpenCode/Codex, el modelo efectivo, mensajes visibles, UI, CLI y MCP; los tickets dependientes consumirán este contrato.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). La compuerta `GR-20261003-plan` aprobó el 2026-10-03 y el PO autorizó: «si pasa se aprueba el plan directamente».
- Pasos ordenados:
  1. Crear `packages/engine/src/execution-sessions.ts` con referencias portables de sesión (`adapter`, `scope`, `sessionId`), un enlace explícito de sesión ejecutora y sesión de origen opcional, y operaciones para anexar y consultar enlaces por identidad e intento. Las continuaciones por compactación se agregarán como nuevos eventos en orden de recepción, sin reemplazar el enlace anterior.
  2. Extender `packages/engine/src/execution-events.ts` para serializar y validar opcionalmente el enlace en un evento `session.linked`, preservando la lectura de los eventos de actividad previos; reexportar el contrato desde `packages/engine/src/index.ts` para que los adaptadores futuros lo consuman sin leer archivos propios.
  3. Añadir `tests/execution-sessions.test.ts` con una sesión ejecutora y una origen distintas, reintentos y continuación por compactación, el orden append-only y el rechazo de referencias no portables. Ejecutar `npx vitest run tests/execution-sessions.test.ts tests/execution-events.test.ts tests/execution-activity.test.ts` desde la raíz.
- Compatibilidad: la propiedad del enlace será opcional al leer eventos persistidos, por lo que los historiales existentes siguen siendo válidos y se reportan sin asociación en vez de inventar una.
- Rollback: revertir el módulo nuevo y la extensión opcional de `ExecutionEvent`; los eventos `session.linked` ya guardados continuarán como JSONL legible por versiones nuevas, por lo que no se reescribe ni elimina historial.

## Criterios de aceptación

- [x] R-ACT-002: Un intento registra y consulta una referencia explícita de sesión ejecutora con adaptador, ámbito e identificador portable.
      <!-- test: npx vitest run tests/execution-sessions.test.ts -->
- [x] R-ACT-002: La sesión de origen se conserva en un campo distinto y opcional, sin inferirse por título ni por hora.
      <!-- test: npx vitest run tests/execution-sessions.test.ts -->
- [x] R-ACT-002: Un reintento o compactación anexa su vínculo en orden y conserva los anteriores; eventos de actividad previos siguen leyéndose sin asociación inventada.
      <!-- test: npx vitest run tests/execution-sessions.test.ts tests/execution-events.test.ts tests/execution-activity.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadió `packages/core/src/session-reference.ts`: valida y congela referencias portables de sesión (`adapter`, `scope`, `sessionId`) sin rutas ni contenido de conversación.
- Se extendió `packages/engine/src/execution-events.ts` con el hecho append-only `session.linked`; sus referencias son opcionales al rehidratar eventos antiguos y se validan cuando se anexan hechos nuevos.
- Se añadió `packages/engine/src/execution-sessions.ts`, exportado desde `packages/engine/src/index.ts`, para anexar y consultar enlaces por ejecución e intento. La sesión ejecutora y la de origen son campos separados; las compactaciones y reintentos agregan nuevas entradas, sin sobrescribir historial.

## Pruebas

- Directorio: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/execution-sessions.test.ts tests/execution-events.test.ts tests/execution-activity.test.ts` — pasó: 3 archivos y 13 pruebas. Cubre separación entre sesión ejecutora y origen, orden de reintentos/compactaciones, filtro por intento, referencias inválidas y regresión de actividad.
- `npm run build` — pasó: TypeScript compila y la interfaz se copia al artefacto CLI.
- Validación solicitada al responsable: ejecutar el comando de Vitest anterior desde la raíz; se espera `Test Files 3 passed` y que no aparezcan fallos. No requiere servicios, credenciales ni navegador.
- Resultado del PO: autorizó ejecutar la verificación y, si daba el resultado esperado, documentarla y cerrar el ticket el 2026-10-03. La verificación específica, la compilación y la suite completa pasaron.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-03",
    "build_reference": "worktree:sha256:932f93ebf00fd2e7c7d83e3327b569edd206e38af0a41ccc8d80c22b8920fd2d",
    "environment": "local",
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
    "po_confirmation": "El PO autorizó ejecutar la verificación y, si daba el resultado esperado, documentarla y cerrar el ticket."
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
    "technical_summary": "Se incorporó el contrato append-only session.linked con referencias portables, sesión ejecutora y origen separadas, y lectura por intento.",
    "functional_summary": "Los adaptadores futuros pueden identificar la sesión que ejecutó un intento sin confundirla con la conversación que originó el trabajo.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicación ni cambio de configuración; queda disponible para los tickets dependientes."
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
    "notes": "Sesión de Codex compartida con FEATURE-MC-DISPONIBILIDAD-FUENTES-20261001; no se reparten tokens ni coste entre tickets. El consumo completo queda registrado de forma manual en ambos cierres.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:codex-01a0ff0b-dbfa-75a0-8f55-887bda09fe84",
    "confidence": "medium",
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
    "at": "2026-10-01T19:10:44.628Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-03",
    "at": "2026-10-03T05:35:26.288Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-03",
    "at": "2026-10-03T05:36:30.441Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-03",
    "at": "2026-10-03T05:37:24.414Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-03",
    "at": "2026-10-03T05:37:24.598Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-03",
    "at": "2026-10-03T05:40:21.751Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-03",
    "at": "2026-10-03T05:44:22.929Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-03",
    "at": "2026-10-03T05:44:23.171Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-03",
    "at": "2026-10-03T05:44:27.582Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-03",
    "at": "2026-10-03T05:44:27.746Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-03",
    "at": "2026-10-03T05:44:53.357Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-03",
    "at": "2026-10-03T05:44:54.060Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-03",
    "at": "2026-10-03T05:44:54.222Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
