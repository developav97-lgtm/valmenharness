---
schema_version: 2
id: FEATURE-CONFIG-CAPACIDADES-EXPLICITAS-20261001
title: Habilitar observación y despacho por elección explícita
type: FEATURE
module: CONFIG
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

# FEATURE-CONFIG-CAPACIDADES-EXPLICITAS-20261001

## Solicitud original

Parte del sprint: Contrato CLI/MCP portable con identidad, eventos, contexto autorizado y configuración opcional.
- R-ADO-005: Observación y despacho DEBEN habilitarse por elección explícita de configuración.
Depende de: FEATURE-CONFIG-BINDINGS-MAQUINA-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [adopcion/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/adopcion/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: política compartible que declara qué fuentes puede observar un proyecto y qué ejecutores puede despachar.
- Usuario o rol afectado: equipos que adoptan el CLI/MCP con Hermes, OpenCode, Codex u otro adaptador; Mission Control y el despachador futuro.
- Comportamiento actual: la configuración conoce identidad compartible y bindings locales, pero no expresa si observar conversaciones o despachar trabajo está permitido. Cada integración podría inferirlo por estar instalada.
- Comportamiento esperado: `execution.observation-sources` y `execution.dispatch-executors` son listas vacías por defecto; solo una entrada explícita habilita la capacidad correspondiente y su alcance queda disponible para los adaptadores posteriores.

## Diagnóstico

- Archivos y flujo investigados: `packages/adapter/src/config.ts` concentra el parser estricto y los lectores de política compartible; `machine-bindings.ts` mantiene rutas y perfiles locales fuera del repositorio. La spec R-ADO-005 exige habilitación explícita y prohíbe que adopción o instalación inicien observación o despacho.
- Causa raíz confirmada: falta una representación única de consentimiento operativo. Inferir capacidad desde la presencia de Hermes, MCP o un archivo local mezclaría instalación con autorización y habilitaría actividad sin que el equipo la declarara.
- Riesgos y compatibilidad: las listas deben validar etiquetas portables, rechazar duplicados y dejar vacía la capacidad ausente; no llevan secretos, hosts, rutas ni modifican gates. La configuración histórica sin `execution` conserva ambas capacidades apagadas.
- Impactos de sync, migración, Docker o despliegue: no hay. Se amplía el parser de política compartible sin reescribir configuraciones ni iniciar procesos.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Autorización vigente: «de aqui en adelante te voy a dar autorizacion para que apruebes los planes y los analisis» (2026-10-01).
- Pasos ordenados:
  1. Añadir en `packages/adapter/src/config.ts` el contrato `ExecutionCapabilities` y el lector de `execution.observation-sources` / `execution.dispatch-executors`, con listas vacías por defecto y validación de etiquetas únicas y portables.
  2. Exportar el lector por `packages/adapter/src/index.ts` para que CLI, MCP, Mission Control y adaptadores consulten la misma decisión.
  3. Extender `tests/machine-bindings.test.ts` con configuración ausente, elección explícita, duplicados y valores no portables; comprobar que los bindings locales no participan en la política.
  4. Ejecutar `npx vitest run tests/machine-bindings.test.ts` y `npm run build` desde la raíz.
- Rollback: dejar de consultar las dos listas nuevas; una configuración que las omite sigue representando capacidades deshabilitadas.

## Criterios de aceptación

- [x] R-ADO-005: Observación y despacho DEBEN habilitarse por elección explícita de configuración.
      <!-- test: npx vitest run tests/machine-bindings.test.ts -->

## Puntos

```json
[]
```

## Implementación

Se añadió `readExecutionCapabilities` en `packages/adapter/src/config.ts`. Lee `execution.observation-sources` y `execution.dispatch-executors`, devuelve listas inmutables vacías cuando faltan y rechaza rutas, mayúsculas o duplicados. No consulta bindings locales ni inicia integraciones. El lector se exporta mediante el índice del adaptador.

## Pruebas

- `npx vitest run tests/machine-bindings.test.ts` — 9 pruebas aprobadas, incluidas capacidades ausentes, elección explícita, etiquetas no portables y duplicados.
- `npm run build` — aprobado.
- Resultado del PO: autorización explícita del 2026-10-01 para que el agente ejecute y apruebe estas pruebas deterministas por comando.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:0aa82611ca7c7ec86e14350366e63d4d71ba14955c8b9ccc182de94efe6d3154",
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
    "description": "Pruebas automatizadas aprobadas para consentimiento explícito, valores por defecto, etiquetas inválidas y duplicados.",
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
    "technical_summary": "La política compartible declara fuentes observables y ejecutores despachables con listas vacías por defecto y validación estricta.",
    "functional_summary": "Un equipo instala el harness sin habilitar observación ni despacho hasta declararlo explícitamente.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin despliegue ni migración; las configuraciones que omiten execution conservan las capacidades apagadas."
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
    "at": "2026-10-01T19:10:44.441Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-01",
    "at": "2026-10-02T01:17:29.633Z",
    "action": "analysis-recorded",
    "actor": "cli",
    "details": "Se registró diagnóstico y plan para capacidades explícitas, sin inferir autorización desde integraciones instaladas."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-01",
    "at": "2026-10-02T01:17:30.121Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-01",
    "at": "2026-10-02T01:17:53.200Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO: Autorización vigente para aprobar análisis y planes en esta sesión; el diagnóstico identifica la ausencia de consentimiento explícito, compatibilidad y límites de configuración."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-01",
    "at": "2026-10-02T01:17:53.375Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-01",
    "at": "2026-10-02T01:17:53.528Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-01",
    "at": "2026-10-02T01:17:53.677Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-01",
    "at": "2026-10-02T01:18:52.125Z",
    "action": "implementation-recorded",
    "actor": "cli",
    "details": "Se implementó la política explícita de observación y despacho con pruebas dirigidas."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-01",
    "at": "2026-10-02T01:18:52.340Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-01",
    "at": "2026-10-02T01:18:53.868Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-01",
    "at": "2026-10-02T01:46:09.399Z",
    "action": "user-tests-recorded",
    "actor": "cli",
    "details": "El PO autorizó aprobar la validación determinista ejecutada por comando."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-01",
    "at": "2026-10-02T01:46:10.193Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-01",
    "at": "2026-10-02T01:46:10.345Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-01",
    "at": "2026-10-02T01:46:10.503Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-01",
    "at": "2026-10-02T01:46:10.674Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-01",
    "at": "2026-10-02T01:46:22.679Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-01",
    "at": "2026-10-02T01:46:49.478Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-01",
    "at": "2026-10-02T01:46:49.976Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
