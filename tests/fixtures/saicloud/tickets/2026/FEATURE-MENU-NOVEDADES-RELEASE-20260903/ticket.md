---
schema_version: 1
id: FEATURE-MENU-NOVEDADES-RELEASE-20260903
title: Mostrar novedades de la versión actual en el menú
type: FEATURE
module: MENU
workflow_status: closed
qa_status: approved
release_status: released
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-03
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# FEATURE-MENU-NOVEDADES-RELEASE-20260903

## Solicitud original

Implementar en el menú Angular una vista de novedades de la versión desplegada. Solo incluir tickets cerrados, visibles al cliente y seleccionados explícitamente para la release; excluir cambios internos. Conservar archivos estáticos por versión para habilitar un historial futuro.

## Descripción funcional

- Alcance: novedades funcionales de la versión actual en el menú Angular.
- Usuario o rol afectado: usuarios clientes de SaiOpenCloud.
- Comportamiento actual: el menú muestra la versión, pero no sus novedades.
- Comportamiento esperado: una vista local muestra solo novedades seleccionadas para esa versión.

## Diagnóstico

- Archivos y flujo investigados: `menu.component.*`, `environment*.ts` y tickets canónicos.
- Causa raíz o hipótesis: falta un artefacto de release que transforme cierres funcionales en novedades.
- Riesgos y compatibilidad: `user_visible` hace elegible, pero no incluye automáticamente un ticket.
- Impactos de sync, migración, Docker o despliegue: sin sync ni migración; se integra al dry-run de release.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el
  2026-09-03 para el JSON estático por versión, la vista Angular del menú y la
  selección explícita de tickets visibles al cliente.
- Pasos ordenados: definir JSON estático por versión; servicio y vista Angular; generación seleccionada durante dry-run; pruebas y manual.
- Rollback, backup, canario u orden de despliegue cuando aplique: retirar el JSON o revertir el commit, sin datos ni API.

## Criterios de aceptación

- [ ] El menú muestra novedades solo si existe archivo para la versión actual.
- [ ] Solo incluye tickets cerrados, `user_visible: true` y seleccionados explícitamente.
- [ ] No expone IDs de tickets, commits ni detalles internos.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[]
```

## Implementación

- Archivos cambiados: menú Angular, servicio y modal de novedades, JSON
  `assets/releases/6.2.4.json`, generador `tools/agentic/release_notes.py` y
  pruebas dirigidas.
- Decisiones técnicas: el menú consume solo el JSON de
  `environment.version`; el generador requiere lista explícita y valida cierre,
  visibilidad y estado de release antes de publicar contenido funcional.
- Compatibilidad preservada: ausencia o error del JSON oculta la opción sin
  afectar el menú; no se expone API ni campos internos del ticket.
- Commits atribuibles al ticket:
  - `1d342776f32d8a675e147459b28b74383d506603` — agrega novedades de versión,
    generador validado y contenido seleccionado de 6.2.4.

## Pruebas

- Comandos para el PO: `cd FrontEnd && npm run build -- --configuration development`.
- Directorio de ejecución: raíz del repositorio y `FrontEnd`.
- Resultado esperado: build correcto y opción Novedades visible en versión 6.2.4.
- Validaciones manuales: abrir Novedades, confirmar los 17 cambios funcionales y verificar que no aparecen datos internos.
- Requisitos de ambiente o datos: build dev actualizado con `environment.version` 6.2.4.
- Resultado comunicado por el PO: revisó en dev las novedades de 6.2.4,
  confirmó que quedaron correctas y autorizó el cierre.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-04",
    "build_reference": "commit:e772e62f4864285d17c8f1f9b89afd14f4624ec9",
    "environment": "dev validado por PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-04",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO revisó las novedades en dev y confirmó que quedaron correctas."
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

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional:
- Resultado comunicado por el PO:
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica):
- Riesgo residual e impacto de release:
- Texto visible al usuario cuando aplique:

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-04",
    "technical_summary": "Se agregó un modal Angular de novedades por versión, un contrato JSON estático y un generador que exige selección explícita de tickets visibles.",
    "functional_summary": "Los clientes pueden consultar desde el menú las novedades funcionales de la versión instalada.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO revisó las novedades en dev y confirmó que quedaron correctas.",
    "release_impact": "El ticket permanece unreleased y será candidato de la release 6.2.4."
  }
]
```

## Consumo de IA

<!-- Registros append-only `ai-usage`: consumo conocido o estimado con fuente y confianza. No inventar tokens ni coste; usar null cuando Codex no lo reporte. -->

```json
[]
```

## Release

- Estado de release:
- Versión objetivo:
- Versión publicada:
- Tickets relacionados:

## Eventos

<!-- Bloque JSON append-only final de objetos con `kind: "ticket-event"`; el CLI agrega uno por cada mutación propia. -->

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-09-03",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-04",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-04",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-04",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-04",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
