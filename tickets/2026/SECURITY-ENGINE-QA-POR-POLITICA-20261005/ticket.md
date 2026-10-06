---
schema_version: 2
id: SECURITY-ENGINE-QA-POR-POLITICA-20261005
title: Conectar qa-agent al flujo y atribuir el ciclo de QA a la autorización
type: SECURITY
module: ENGINE
workflow_status: intake
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-05
updated: 2026-10-05
related_ticket: null
target_release: null
released_in: null
---

# SECURITY-ENGINE-QA-POR-POLITICA-20261005

## Solicitud original

Parte del sprint: QA por agente en backend bajo autorización firmada, apagada por defecto, en worktree limpio, con criterio HTTP y promoción tras veinte coincidencias en sombra.
- R-QAAG-006: Un ciclo de QA aprobado por política DEBE atribuirse a la autorización, no al agente
Depende de: SECURITY-ENGINE-COMPUERTA-QA-AGENT-20261005, SECURITY-GATEHTTP-CRITERIO-HTTP-20261005, SECURITY-MC-AUTORIZACION-QA-20261005, FEATURE-ENGINE-JORNADA-EJECUCION-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

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

- [ ] R-QAAG-006: Un ciclo de QA aprobado por política DEBE atribuirse a la autorización, no al agente

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
    "date": "2026-10-05",
    "at": "2026-10-06T01:51:51.368Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  }
]
```
