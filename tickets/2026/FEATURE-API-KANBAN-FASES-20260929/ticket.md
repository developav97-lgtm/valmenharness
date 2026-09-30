---
schema_version: 2
id: FEATURE-API-KANBAN-FASES-20260929
title: Integrar lector kanban en endpoint de fases
type: FEATURE
module: API
workflow_status: intake
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-29
updated: 2026-09-29
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-API-KANBAN-FASES-20260929

## Solicitud original

Parte del sprint: Fuente kanban complementaria.
- R-S1-001: Línea de fases por ticket — La API DEBE exponer, para cada ticket del registro, la secuencia de sus fases con hora de inicio, hora de fin y duración, derivada de las transiciones de estado del ticket.
- R-S1-004: Solo lectura y append-only — La línea de fases DEBE derivarse leyendo el registro: la feature no escribe en los
Depende de: FEATURE-API-FASES-20260929, INTEGRATION-ADAPTER-KANBAN-READER-20260929.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance:
- Usuario o rol afectado:
- Comportamiento actual:
- Comportamiento esperado:

## Diagnóstico

- Archivos y flujo investigados:
- Causa raíz o hipótesis:
- Riesgos y compatibilidad:
- Impactos de sync, migración, Docker o despliegue:

## Plan

- Gate de plan y aprobación:
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1.
  2.
- Rollback:

## Criterios de aceptación

- [ ] R-S1-001: Línea de fases por ticket — La API DEBE exponer, para cada ticket del registro, la secuencia de sus fases con hora de inicio, hora de fin y duración, derivada de las transiciones de estado del ticket.
- [ ] R-S1-004: Solo lectura y append-only — La línea de fases DEBE derivarse leyendo el registro: la feature no escribe en los

## Puntos

```json
[]
```

## Implementación

Pendiente.

## Pruebas

Pendiente de ejecución.

## QA

```json
[]
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
[]
```

## Consumo de IA

```json
[]
```

## Release

Sin publicar todavía.

## Eventos

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-09-29",
    "at": "2026-09-30T01:34:34.576Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
