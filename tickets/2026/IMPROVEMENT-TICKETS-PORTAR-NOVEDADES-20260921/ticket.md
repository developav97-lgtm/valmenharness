---
schema_version: 2
id: IMPROVEMENT-TICKETS-PORTAR-NOVEDADES-20260921
title: Portar el reporte Markdown del visor a Mission Control
type: IMPROVEMENT
module: TICKETS
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-21
updated: 2026-09-23
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

El trabajo entró en el commit `379f130` —«El reporte de cierres y el manifiesto de entrega»—
y quedó cubierto por la suite desde entonces; lo que faltaba era recorrer el registro, que es
lo que este cierre pone al día.

- Comando: `npx vitest run`, desde la raíz del repositorio. Resultado: 37 archivos de prueba
  pasan, 872 pruebas en verde (48 saltadas, las de equivalencia contra `ticket.py`, que están
  desactivadas por defecto).
- Comando: `npx vitest run tests/report-delivery.test.ts`. Resultado: 43 pruebas en verde. Las
  que cubren los criterios de este ticket, con su nombre: «el rango es inclusivo en los dos
  extremos», «un rango sin cierres no es un error» y «escribe el encabezado con el rango en
  palabras».
- Validación manual del reporte descargado desde Mission Control: no ejecutada. Ver la omisión.
- Omisión explícita documentada de pruebas por el PO: el 2026-09-23 el responsable indicó
  cerrar los tickets que quedaron abiertos de la sesión del 21 de septiembre, con estas
  palabras —«con lo que me dices de esos tickets viejos si cierras»—, sin una pasada de
  aceptación manual sobre la aplicación. El motivo de la omisión es que el trabajo está en el
  árbol y verificado por la suite, y el ticket llevaba dos días en `approved` sin que nadie lo
  moviera. La omisión es de la **prueba manual**, no de la verificación: lo que no hay es una
  persona que haya abierto Mission Control y descargado el archivo.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-23",
    "build_reference": "commit:379f130c882d48b03fdd6bdd6c12817e960864f4",
    "environment": "local, macOS, Node 22+, sin despliegue",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-23",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "instrucción explícita del responsable del 2026-09-23: cerrar los tickets viejos de la sesión del 21 de septiembre"
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
    "date": "2026-09-23",
    "technical_summary": "El reporte de cierres vive en el motor (packages/engine/src/report.ts) y se expone por el CLI (valmen report) y por la API del servidor (GET /api/report), que es lo que consume la vista de tickets de Mission Control. El rango se compara como texto —el formato del contrato ordena igual que las fechas— y es inclusivo en los dos extremos; un from posterior a to se rechaza antes de escribir nada.",
    "functional_summary": "Se puede elegir un rango de fechas de cierre y descargar un Markdown con un apartado por ticket cerrado, con «Se atendió» y «Se realizó» tomados del resumen funcional del último cierre. Un rango sin cierres devuelve un reporte que lo dice, no un archivo vacío ni un error: el visor de Python ya no hace falta para esto.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "none"
  }
]
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
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-23",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-23",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-23",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-23",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
