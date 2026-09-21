---
schema_version: 2
id: IMPROVEMENT-TICKETS-PORTAR-NOVEDADES-20260921
title: Portar el reporte Markdown del visor a Mission Control
type: IMPROVEMENT
module: TICKETS
workflow_status: planned
qa_status: pending
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-21
updated: 2026-09-21
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-TICKETS-PORTAR-NOVEDADES-20260921

## Solicitud original

El visor anterior ofrecía un reporte Markdown descargable de los tickets cerrados en un rango de fechas, con los campos funcionales de cada cierre. Mission Control no lo tiene. Necesito poder sacar ese reporte desde la app antes de borrar el visor de Python.

## Descripción funcional

- Alcance: la vista de tickets de Mission Control, con un reporte descargable.
- Usuario o rol afectado: quien comunica lo entregado a otras áreas.
- Comportamiento actual: no hay forma de sacar un reporte desde la app.
- Comportamiento esperado: elegir un rango de fechas de cierre y descargar el reporte en Markdown.

## Diagnóstico

- Archivos y flujo investigados: `packages/server/web/index.html` (vista de tickets), `packages/server/src/tickets.ts` (proyección) y `tools/agentic/ticket_viewer.py` del proyecto migrado, que es lo que se reemplaza.
- Causa raíz o hipótesis: el reporte no se portó al reemplazar el visor. No es un fallo: es una capacidad que quedó fuera del alcance de la Fase 4 y hay que decidir si se recupera.
- Riesgos y compatibilidad: ninguno. Es una vista nueva sobre datos que la proyección ya lee.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate no exigible: es una capacidad acotada de la interfaz, sin impacto de sincronización, migración ni despliegue, y el registro ya expone los campos que el reporte necesita.
- Pasos ordenados:
  1. Añadir a `packages/server/src/tickets.ts` una función que filtre por rango de fecha de cierre y proyecte los campos funcionales del último cierre.
  2. Exponer `GET /api/tickets/report?from=&to=` que devuelva `text/markdown`.
  3. Añadir el botón de descarga y los dos campos de fecha en la vista de tickets.
  4. Escribir el test que compara el reporte con el que producía el visor sobre los 57 tickets reales.
- Rollback: quitar la ruta y el botón; no toca ningún dato.

## Criterios de aceptación

- [ ] Elegir un rango de fechas y descargar un Markdown con un apartado por ticket cerrado.
- [ ] El reporte incluye «Se atendió» y «Se realizó», tomados del último cierre.
- [ ] Un rango sin tickets produce un reporte válido que lo dice, no un archivo vacío.
- [ ] El rango es inclusivo en los dos extremos y se rechaza si el inicio es posterior al fin.

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
    "date": "2026-09-21",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-21",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-21",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  }
]
```
