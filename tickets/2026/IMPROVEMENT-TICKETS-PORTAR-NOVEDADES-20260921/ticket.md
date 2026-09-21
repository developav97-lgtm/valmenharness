---
schema_version: 2
id: IMPROVEMENT-TICKETS-PORTAR-NOVEDADES-20260921
title: Portar el reporte Markdown del visor a Mission Control
type: IMPROVEMENT
module: TICKETS
workflow_status: approved
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
  1. Añadir en `packages/server/src/tickets.ts` una función que filtre los tickets cerrados por rango de fecha de cierre, **inclusivo en los dos extremos**, y proyecte los campos funcionales del último cierre. La fecha se compara como texto `YYYY-MM-DD`, que ordena igual que la fecha.
  2. Validar el rango antes de proyectar: si `from` es posterior a `to`, responder 400 con el motivo; si el rango no tiene tickets, devolver un reporte válido que lo dice, nunca un archivo vacío ni un error.
  3. Exponer `GET /api/tickets/report?from=&to=` que devuelva `text/markdown`, con el mismo formato de secciones que el visor anterior: un apartado por ticket, con «Se atendió» y «Se realizó».
  4. Añadir en la vista de tickets los dos campos de fecha, con el rango de los últimos 30 días por defecto, y el botón de descarga que apunta a esa ruta.
  5. Escribir el test que compara el reporte generado con el que producía el visor sobre los 57 tickets reales, y los tres casos de borde: rango vacío, extremos inclusivos y rango invertido.
- Rollback: quitar la ruta y el botón; no toca ningún dato y no hay migración que deshacer.

## Criterios de aceptación

- [ ] Elegir un rango de fechas de cierre y descargar un Markdown con un apartado por cada ticket cerrado dentro del rango.
- [ ] El reporte incluye «Se atendió» y «Se realizó», tomados del resumen funcional del último cierre de cada ticket.
- [ ] Un rango sin tickets devuelve un reporte válido que lo dice explícitamente, no un archivo vacío ni un error.
- [ ] El rango es inclusivo en los dos extremos: un ticket cerrado exactamente el día `from` y otro exactamente el día `to` aparecen los dos.
- [ ] Un rango con `from` posterior a `to` se rechaza con un mensaje que explica el motivo, sin generar archivo.

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
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-21",
    "action": "gate-rejected",
    "actor": "cli",
    "details": "Gate plan rechazado por Juan Andrade: El plan no dice nada del rango vacío ni de los límites inclusivos de la fecha."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-21",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  }
]
```
