---
schema_version: 1
id: IMPROVEMENT-FRONTEND-ORTOGRAFIA-TILDES-20260917
title: Corregir ortografía y tildes en los textos visibles del frontend
type: IMPROVEMENT
module: FRONTEND
workflow_status: closed
qa_status: waived
release_status: unreleased
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: low
created: 2026-09-17
updated: 2026-09-17
related_ticket: null
target_release: null
released_in: null
---

# IMPROVEMENT-FRONTEND-ORTOGRAFIA-TILDES-20260917

## Solicitud original

Revisar todas las pantallas de la aplicación, componente por componente, para validar que la ortografía sea correcta teniendo en cuenta el contexto de cada pantalla, sobre todo las tildes, y aplicar los cambios en español de Latinoamérica (Colombia) sin hacer commit hasta autorización del PO. Posteriormente, documentar el trabajo en un ticket, pasarlo a cerrado y hacer commit y push para dejar trazabilidad.

## Descripción funcional

- Alcance: textos visibles al usuario (etiquetas, placeholders, títulos, encabezados de tabla, `aria-label` y notificaciones) de las pantallas del frontend Angular, sin alterar funcionalidad.
- Usuario o rol afectado: todos los usuarios operativos del producto (POS, restaurante, logística, cartera, factoring y administración).
- Comportamiento actual: varias cadenas visibles presentaban tildes faltantes y erratas (por ejemplo "codigo", "direccion", "telefono", "esta en uso", "Se Perdio la Conexion", "Nueva Contaseña"), lo que afectaba la presentación del producto.
- Comportamiento esperado: las cadenas visibles usan ortografía correcta en español de Latinoamérica (Colombia), con tildes y concordancia adecuadas al contexto de cada pantalla, sin cambios de comportamiento.

## Diagnóstico

- Archivos y flujo investigados: 115 archivos de `FrontEnd/src/app/` entre plantillas HTML y cadenas visibles en componentes TypeScript de los módulos administración, POS, restaurante, cartera, factoring, logística, ayuda, general, modales y componentes compartidos.
- Causa raíz o hipótesis: correcciones pendientes de acentuación y tipeo en textos de presentación acumuladas durante el desarrollo.
- Riesgos y compatibilidad: bajo; el cambio es exclusivamente de contenido textual y no toca contratos, lógica, estilos ni configuración funcional.
- Impactos de sync, migración, Docker o despliegue: ninguno; no se modifican OfflineSync, SincSaiCloud, LocalAgents, WebSocket, autenticación, migraciones, Docker ni despliegue.

## Plan

- Gate de plan y aprobación del PO: Gate no exigible: es un IMPROVEMENT sin impacto en sync, migración, Docker, autenticación, WebSocket, agentes locales ni despliegue; no altera contratos ni lógica, solo cadenas de texto visibles.
- Pasos ordenados:
  1. Inventariar las pantallas y componentes del frontend (plantillas HTML y cadenas visibles en TypeScript) y corregir tildes, erratas y concordancia según el contexto de cada pantalla, en español de Latinoamérica (Colombia).
  2. Verificar la compilación con `npx ng build` y revisar el diff para confirmar que solo cambian cadenas visibles, sin afectar identificadores, valores de contrato, rutas, comentarios ni lógica.
  3. Registrar el ticket, su evidencia y cierre, y entregar el commit y push selectivos a `dev` con trazabilidad.
- Rollback, backup, canario u orden de despliegue cuando aplique: No aplica backup, migración ni canario porque no hay cambios de esquema ni de infraestructura. El rollback consiste en revertir el commit del ticket si apareciera una regresión; el despliegue es un push selectivo a `dev`.

## Criterios de aceptación

- [ ] Las cadenas visibles afectadas usan tildes y ortografía correctas en español de Latinoamérica (Colombia) según el contexto de cada pantalla.
- [ ] `npx ng build` finaliza sin errores de compilación después de los cambios.
- [ ] El diff contiene únicamente cambios 1:1 de texto visible, sin modificaciones de lógica, contratos, rutas ni estilos.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[]
```

## Implementación

- Archivos cambiados: 115 archivos bajo `FrontEnd/src/app/` en los módulos administration, Compartidos/Pos, modals, mod-general, mod-help, mod-logisty, mod-pos, mod-receivables, mod-restaurant y mod-factoring.
- Decisiones técnicas: se corrigieron únicamente cadenas visibles al usuario en español de Latinoamérica (Colombia); no se tocaron identificadores, `formControlName`, `[value]`, rutas, contratos REST, comentarios ni lógica. Se preservaron cambios previos de tildes ya presentes en el árbol de trabajo.
- Compatibilidad preservada: sin cambios de payload, contrato ni comportamiento; la compilación de Angular finaliza sin errores.
- Commits atribuibles al ticket:
  - `457ff96c46f7c8b639357188d8e9257f5b437857` — commit funcional: corrección ortográfica y de tildes en 115 archivos de `FrontEnd/src/app`.

## Pruebas

- Comandos para el PO: desde `FrontEnd/`, `npx ng build`; para revisar el diff, desde la raíz, `git diff -- FrontEnd/src/app`.
- Directorio de ejecución: `FrontEnd/` para la compilación; raíz del repositorio para el diff.
- Resultado esperado: `npx ng build` finaliza con éxito (exit 0) y el diff muestra solo cambios de cadenas visibles.
- Validaciones manuales: recorrido visual de las pantallas intervenidas para confirmar tildes y textos; no ejecutado en este ciclo.
- Requisitos de ambiente o datos: Node y dependencias del frontend instaladas (`node_modules`); no requiere datos ni tenant.
- Omisión explícita y documentada del PO: el PO autorizó cerrar el ticket sin ejecutar pruebas manuales de pantalla, por tratarse de un cambio exclusivamente de texto visible validado con compilación, y ordenó en el mismo pedido el commit y push selectivos a dev.

## QA

```json
[]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-17",
    "kind": "automated",
    "description": "npx ng build finalizó sin errores (exit 0) sobre el árbol con los 115 archivos corregidos.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-17",
    "kind": "automated",
    "description": "git diff --check sin hallazgos y diff 1:1 (330 inserciones / 330 eliminaciones) restringido a cadenas visibles de FrontEnd/src/app.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-17",
    "kind": "manual",
    "description": "Solicitud del PO de registrar, cerrar y publicar el cambio a dev para trazabilidad, eximiendo pruebas manuales por ser cambio de solo texto.",
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

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional: corrección ortográfica de cadenas visibles en 115 archivos del frontend, sin cambios funcionales.
- Resultado comunicado por el PO: el PO solicitó crear el ticket, cerrarlo y publicar el cambio a dev para dejar trazabilidad.
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica): eximida; el PO autorizó cerrar sin pruebas manuales de pantalla por tratarse de un cambio de solo texto validado con compilación.
- Riesgo residual e impacto de release: riesgo residual bajo; queda en dev sin release a producción hasta el proceso de release correspondiente.
- Texto visible al usuario cuando aplique: múltiples etiquetas, mensajes y encabezados corregidos en las pantallas del producto.

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-17",
    "technical_summary": "Corrección ortográfica y de tildes en cadenas visibles de 115 archivos de FrontEnd/src/app, sin cambios de lógica, contratos, rutas ni estilos; compilación Angular exitosa.",
    "functional_summary": "El PO solicitó registrar, cerrar y publicar el cambio a dev para dejar trazabilidad, eximiendo las pruebas manuales por tratarse de un cambio de solo texto visible.",
    "qa_status": "waived",
    "qa_waiver_reason": "Cambio exclusivamente de texto visible (etiquetas, placeholders, mensajes y encabezados) sin impacto funcional, validado con compilación exitosa; el PO eximió las pruebas manuales de pantalla.",
    "po_confirmation": "El PO ordenó: crear y documentar el ticket, pasarlo a cerrado y hacer commit y push para dejar trazabilidad.",
    "release_impact": "Cerrado funcionalmente y publicado en dev; permanece unreleased respecto a producción y requiere el proceso de release correspondiente."
  }
]
```

## Consumo de IA

<!-- Registros append-only `ai-usage`: consumo conocido o estimado con fuente y confianza. No inventar tokens ni coste; usar null cuando Codex no lo reporte. -->

```json
[]
```

## Release

- Estado de release: unreleased (publicado en dev para trazabilidad).
- Versión objetivo: null
- Versión publicada: null
- Tickets relacionados: null

## Eventos

<!-- Bloque JSON append-only final de objetos con `kind: "ticket-event"`; el CLI agrega uno por cada mutación propia. -->

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-09-17",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-17",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-17",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-17",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-17",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
