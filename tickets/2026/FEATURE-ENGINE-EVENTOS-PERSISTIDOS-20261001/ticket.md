---
schema_version: 2
id: FEATURE-ENGINE-EVENTOS-PERSISTIDOS-20261001
title: Persistir eventos de ejecución con orden y deduplicación
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

# FEATURE-ENGINE-EVENTOS-PERSISTIDOS-20261001

## Solicitud original

Parte del sprint: Contrato CLI/MCP portable con identidad, eventos, contexto autorizado y configuración opcional.
- R-VIV-003: La reconexión DEBE reconciliar los eventos pendientes sin perderlos ni duplicarlos.
- R-CON-004: Los eventos de ejecución DEBEN persistirse con orden y deduplicación verificables.
Depende de: FEATURE-CORE-IDENTIDAD-EJECUCION-20261001, FEATURE-ENGINE-RESOLUCION-PROYECTO-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [actualizacion/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actualizacion/spec.md).
- Spec completa: [contrato/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/contrato/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: historial append-only de eventos de ejecución por proyecto, con identidad de reenvío, cursor de recepción y replay determinista.
- Usuario o rol afectado: clientes CLI, MCP, Mission Control y adaptadores que publicarán o consultarán actividad de una ejecución.
- Comportamiento actual: los eventos de workflow viven dentro de cada `ticket.md` y las fases de Hermes se leen de su fuente. No existe un registro común de ejecuciones, intento, procedencia y cursor que sobreviva a una reconexión.
- Comportamiento esperado: cada evento se anexa bajo `.valmen/executions/events.jsonl` con `eventId`, identidad de ejecución, intento, clase, fuente, instante ocurrido, instante recibido y cursor monótono. Reenviar el mismo hecho no agrega otra línea; reconstruir la serie siempre devuelve el mismo orden de recepción.

## Diagnóstico

- Archivos y flujo investigados: `packages/engine/src/receipts.ts` ya usa JSONL append-only bajo `.valmen`; `packages/core/src/execution-identity.ts` aporta proyecto, ticket y ejecución; `packages/engine/src/project-resolution.ts` impide elegir raíces no declaradas. Los eventos de `ticket.md` y las fases de tablero se conservan como fuentes distintas y no deben reescribirse.
- Causa raíz confirmada: la telemetría no tiene almacenamiento propio ni una clave idempotente transversal. Reusar el bloque `Eventos` del ticket mezclaría actividad con workflow/QA/release, reescribiría su historial y no distinguiría reintentos ni origen.
- Riesgos y compatibilidad: el archivo debe añadirse bajo el registro del proyecto y escribirse atómicamente; un ID repetido con contenido distinto es corrupción y se rechaza. El cursor se asigna al recibir para que un evento tardío no haga retroceder la proyección. No se interpreta ni aprueba gates; los históricos sin telemetría siguen válidos.
- Impactos de sync, migración, Docker o despliegue: no hay. Es persistencia local append-only sin migrar tickets ni conectar fuentes remotas.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Autorización vigente: «de aqui en adelante te voy a dar autorizacion para que apruebes los planes y los analisis» (2026-10-01).
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. Crear `packages/engine/src/execution-events.ts` con el contrato de evento, ruta JSONL, validación y escritura atómica bajo el lock del registro.
  2. Implementar anexado idempotente por `eventId`: un reenvío idéntico devuelve el evento existente y uno distinto con el mismo ID falla sin escribir. El cursor se deriva de la secuencia persistida.
  3. Implementar lectura y replay ordenado por cursor, agrupado por identidad de proyecto y ejecución, sin tocar las máquinas de estado del ticket.
  4. Exportar el contrato desde `packages/engine/src/index.ts`.
  5. Crear `tests/execution-events.test.ts` para verificar aislamiento de ejecución, deduplicación, conflicto de ID, orden estable ante tiempo ocurrido tardío y replay tras reconstruir desde disco.
  6. Ejecutar `npx vitest run tests/execution-events.test.ts` y `npm run build` desde la raíz.
- Rollback: dejar de consultar el JSONL nuevo y conservarlo intacto como evidencia; no se borra ni se reescribe un historial append-only.

## Criterios de aceptación

- [x] R-VIV-003: La reconexión DEBE reconciliar los eventos pendientes sin perderlos ni duplicarlos.
      <!-- test: npx vitest run tests/execution-events.test.ts -->
- [x] R-CON-004: Los eventos de ejecución DEBEN persistirse con orden y deduplicación verificables.
      <!-- test: npx vitest run tests/execution-events.test.ts -->

## Puntos

```json
[]
```

## Implementación

Se creó `packages/engine/src/execution-events.ts`: persiste el JSONL append-only por proyecto autorizado, valida la identidad, toma el lock del registro, asigna cursores consecutivos y sincroniza cada anexado antes de soltarlo. La lectura rechaza corrupción y el replay agrupa por proyecto y ejecución sin alterar el workflow del ticket.

Se exportó el contrato desde `packages/engine/src/index.ts`.

## Pruebas

- `npx vitest run tests/execution-events.test.ts` — 5 pruebas aprobadas: reenvío idempotente, conflicto de ID, cursor ante llegada tardía, replay desde disco y aislamiento del proyecto.
- `npm run build` — aprobado.
- El gate mecánico se volverá a ejecutar sobre este estado actualizado antes de la entrega.
- Resultado del PO: autorización explícita del 2026-10-01 para que el agente ejecute y apruebe estas pruebas deterministas por comando.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-02",
    "build_reference": "worktree:sha256:aa34d1af6ffd995907877a84532581a359794146e2669822992f4974a9d2243d",
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
    "description": "Pruebas automatizadas aprobadas: deduplicación, conflicto, orden de recepción, replay y aislamiento.",
    "reference": "worktree:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-10-02",
    "kind": "note",
    "description": "Corrección de EVIDENCE-001: su referencia tenía formato válido, pero no representa archivos funcionales aún sin versionar; no se usa como referencia de build. La evidencia verificable es el recibo qa-mechanical GR-20261002-qa-mechanical, que ejecutó los criterios declarados.",
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
    "technical_summary": "Se añadió un log JSONL append-only por proyecto autorizado, con cursor consecutivo, deduplicación por eventId y replay por ejecución.",
    "functional_summary": "Las capas posteriores pueden reconciliar actividad persistida sin duplicar reenvíos ni retroceder por eventos tardíos.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin despliegue ni migración; el log se activa cuando un cliente publica eventos."
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
    "at": "2026-10-01T19:10:44.112Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-01",
    "at": "2026-10-02T01:09:03.030Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-01",
    "at": "2026-10-02T01:10:15.553Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO: Autorización vigente para aprobar análisis y planes en esta sesión; el diagnóstico y plan cubren identidad, deduplicación, orden y rollback."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-01",
    "at": "2026-10-02T01:10:15.751Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-01",
    "at": "2026-10-02T01:10:15.908Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-01",
    "at": "2026-10-02T01:10:16.063Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-01",
    "at": "2026-10-02T01:14:41.181Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-01",
    "at": "2026-10-02T01:15:12.709Z",
    "action": "implementation-recorded",
    "actor": "cli",
    "details": "Se registró la implementación y las pruebas automatizadas de eventos persistidos."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-01",
    "at": "2026-10-02T01:16:08.529Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-01",
    "at": "2026-10-02T01:16:43.526Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-01",
    "at": "2026-10-02T01:46:09.310Z",
    "action": "user-tests-recorded",
    "actor": "cli",
    "details": "El PO autorizó aprobar la validación determinista ejecutada por comando."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-01",
    "at": "2026-10-02T01:46:09.578Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-01",
    "at": "2026-10-02T01:46:09.735Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-01",
    "at": "2026-10-02T01:46:09.888Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-01",
    "at": "2026-10-02T01:46:10.041Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-01",
    "at": "2026-10-02T01:46:22.519Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-01",
    "at": "2026-10-02T01:46:49.369Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-01",
    "at": "2026-10-02T01:46:49.649Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
