---
schema_version: 1
id: BUGFIX-ADMIN-USUARIOS-CAJAS-SUCURSAL-20260828
title: Actualizar cajas al seleccionar sucursal en el formulario de usuario
type: BUGFIX
module: ADMIN
workflow_status: closed
qa_status: approved
release_status: released
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-08-28
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# BUGFIX-ADMIN-USUARIOS-CAJAS-SUCURSAL-20260828

## Solicitud original

En el formulario de usuarios se filtraron las cajas por sucursal en Parámetros POS, Restaurante y Sucursales. Al crear un usuario no hay cajas hasta que se selecciona o cambia una sucursal; el selector debe actualizarse al seleccionar/cambiar sucursal, igual que los consecutivos.

## Descripción funcional

- Alcance: recalcular las cajas disponibles al seleccionar o cambiar la sucursal principal en creación y edición de usuarios; conservar el filtro de las filas del tab Sucursales.
- Usuario o rol afectado: administradores que crean o editan usuarios con parámetros POS o Restaurante.
- Comportamiento actual: `changeBranch()` filtra consecutivos y limpia la caja inválida, pero el formulario de creación puede iniciar con las listas visibles sin recalcular tras escoger la primera sucursal.
- Comportamiento esperado: el selector de cajas usa `saleRegistersForBranch()` al cambio de sucursal, igual que los consecutivos, y muestra las cajas globales o de la sucursal elegida.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/administration/users/user/adm-user.component.ts` carga `SaleRegisters`, tiene `changeBranch()` y `saleRegistersForBranch()`. La primera ya filtra consecutivos y limpia `id_pos_sale_register`; el selector de caja depende de ese flujo. Las filas de Sucursales conservan su propio valor por sucursal.
- Causa raíz o hipótesis: confirmada. La inicialización del formulario de creación no dispara o no refleja el mismo recálculo de cajas que sí aplica a consecutivos después de seleccionar la sucursal.
- Riesgos y compatibilidad: no cambian API, modelos ni payload. Debe conservar cajas sin sucursal como globales, no borrar una caja compatible y no mezclar el parámetro POS compartido con configuraciones por fila.
- Impactos de sync, migración, Docker o despliegue: no aplica.
- Retest de nube del 2026-08-28: falló. El selector Caja queda sin valor visible en Parámetros POS y Restaurante después de seleccionar o cambiar la sucursal, aunque los consecutivos se recalculan. La causa confirmada es que `changeBranch()` invalida la caja anterior asignándole `0`, mientras ambos selects omiten una opción con valor `0`; el control queda en blanco y no ofrece un estado explícito para seleccionar una caja compatible.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-08-28 mediante “si implementalo”.
- Paso 1: reproducir creación y edición con sucursales y cajas globales/asignadas; ubicar el binding de cada selector POS, Restaurante y Sucursales.
- Paso 2: reutilizar `changeBranch()` o extraer el mínimo helper para recalcular al primer cambio y a cambios posteriores, preservando la limpieza de selección inválida.
- Paso 3: añadir una prueba de regresión para creación y cambio de sucursal; ejecutar spec y build Angular.
- Rollback: revertir el componente y spec; no requiere migración ni backup.
- Ajuste aprobado explícitamente por el PO el 2026-08-28 mediante “si dale apruebo”: agregar una opción explícita de selección vacía en ambos selects compartidos, mantener la invalidación a `0` y ampliar la prueba para comprobar la lista compatible y el valor limpiado al cambiar de sucursal.

## Criterios de aceptación

- [x] POINT-001: al elegir una sucursal al crear un usuario, se muestran las cajas globales y las de dicha sucursal.
- [x] POINT-001: al cambiar sucursal, se actualiza el selector y se limpia únicamente una caja incompatible.
- [x] POINT-001: los consecutivos y la configuración por filas de Sucursales conservan su comportamiento actual.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "El selector de cajas se actualiza al elegir o cambiar sucursal",
    "status": "closed",
    "severity": "normal",
    "actual": "En creación de usuario, las cajas filtradas pueden iniciar vacías aunque se seleccione una sucursal; el filtro no se recalcula en el mismo flujo que los consecutivos.",
    "expected": "Al seleccionar o cambiar la sucursal principal, el selector de caja de POS y Restaurante muestra las cajas compatibles y limpia una selección que ya no pertenezca a la sucursal.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-002",
    "title": "El valor sin opción visible deja la caja en blanco al cambiar sucursal",
    "status": "closed",
    "severity": "normal",
    "actual": "Tras elegir o cambiar la sucursal, changeBranch() establece id_pos_sale_register en 0 si la caja previa no es compatible. Los selects POS y Restaurante no incluyen opción para 0, por lo que quedan visualmente vacíos y no comunican al usuario que debe elegir una caja compatible.",
    "expected": "Los selects deben mostrar un estado seleccionable Ninguna/Seleccione una caja cuando se invalida la selección y conservar visibles todas las cajas compatibles para la sucursal elegida.",
    "evidence": [],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- Archivos cambiados:
  - `FrontEnd/src/app/administration/users/user/adm-user.component.html`
  - `FrontEnd/src/app/administration/users/user/adm-user.component.spec.ts`
- Decisiones técnicas: `changeBranch()` conserva la invalidación de una caja incompatible a `0`; los selects de Parámetros POS y Restaurante ahora representan ese estado con “Seleccione una caja”, antes de las cajas filtradas por sucursal.
- Compatibilidad preservada: no cambia API, modelo, IndexedDB ni payload; el usuario debe elegir una caja compatible antes de guardar, como exige la validación actual.
- Commits atribuibles al ticket:
  - `e2be139faab96ef304ed13ed298c57bc54090752` — normaliza el identificador de sucursal al filtrar cajas.
  - `42f821fbda3d2067d346fac8539aab90dd7ab324` — hace visible el estado sin caja y añade su regresión.

## Pruebas

- Comandos para el PO:
  - `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/administration/users/user/adm-user.component.spec.ts`
  - `npx ng build --configuration=production`
- Directorio de ejecución: `FrontEnd/`.
- Resultado esperado: la spec registra 20 pruebas exitosas y la compilación finaliza sin errores. El runner de Angular emite al cierre un aviso conocido de patrón `--include` aunque las pruebas ya finalizaron en éxito.
- Validaciones manuales: crear un usuario, seleccionar una sucursal con caja configurada y abrir Parámetros POS y Parámetros Restaurante; ambas listas deben mostrar las cajas compatibles. Cambiar a otra sucursal: el campo debe mostrar “Seleccione una caja” en vez de quedar en blanco, y debe permitir seleccionar una caja compatible.
- Requisitos de ambiente o datos: tenant de prueba con al menos una caja asignada a cada una de dos sucursales; administrador con acceso a Usuarios.
- Resultado comunicado por el PO: Retest de nube aprobado el 2026-08-28 mediante “ya quedo funcionando correcto”.
- Revisión final: no se detectaron hallazgos bloqueantes en el diff de `42f821fbda3d2067d346fac8539aab90dd7ab324`; no altera contratos, autenticación ni datos tenant. `npm test -- --watch=false --browsers=ChromeHeadless` no completó por un fallo ajeno en `FrontEnd/src/app/administration/partners/partner/adm-partner.component.ts:563` durante `afterAll` (`Cannot read properties of undefined (reading 'id')`); la spec del ticket y el build de producción sí finalizaron correctamente.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-08-28",
    "build_reference": "commit:e2be139faab96ef304ed13ed298c57bc54090752",
    "environment": "nube",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-08-28",
    "build_reference": null,
    "environment": null,
    "result": "changes_requested",
    "findings": [],
    "correction": null,
    "po_confirmation": "PO reporta que al cambiar sucursal el selector Caja queda vacío; consecutivos sí se actualizan."
  },
  {
    "id": "QA-003",
    "date": "2026-08-28",
    "build_reference": "commit:42f821fbda3d2067d346fac8539aab90dd7ab324",
    "environment": "nube",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-004",
    "date": "2026-08-28",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "PO confirma que la corrección funciona en nube y solicita cerrar el ticket."
  }
]
```

## Evidencia

```json
[]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-08-28",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO validó en nube: ya quedó funcionando correcto."
  },
  {
    "id": "RETEST-002",
    "date": "2026-08-28",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO validó en nube: ya quedó funcionando correcto."
  }
]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional: cerrado tras representar el valor sin caja y mantener el filtro por sucursal en ambos tabs que comparten el parámetro.
- Resultado comunicado por el PO: validación en nube aprobada el 2026-08-28.
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica): aprobada en QA-004 con confirmación explícita del PO.
- Riesgo residual e impacto de release: sin impacto de API, migración o sincronización; el ticket permanece unreleased hasta una promoción posterior de `dev` a `production`.
- Texto visible al usuario cuando aplique: “Seleccione una caja” cuando se cambia a una sucursal sin caja previamente seleccionada.

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-08-28",
    "technical_summary": "Se mantuvo el filtro de cajas por sucursal y se representó explícitamente el valor 0 con Seleccione una caja en POS y Restaurante.",
    "functional_summary": "El PO validó en nube que la caja se muestra y se puede seleccionar correctamente tras cambiar sucursal.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "PO confirma que la corrección funciona en nube y solicita cerrar el ticket.",
    "release_impact": "Sin migración ni API; queda cerrado funcionalmente y unreleased hasta la próxima promoción dev a production."
  }
]
```

## Consumo de IA

<!-- Registros append-only `ai-usage`: consumo conocido o estimado con fuente y confianza. No inventar tokens ni coste; usar null cuando Codex no lo reporte. -->

```json
[]
```

## Release

- Estado de release: unreleased.
- Versión objetivo: pendiente de la próxima release.
- Versión publicada: no aplica.
- Tickets relacionados:

## Eventos

<!-- Bloque JSON append-only final de objetos con `kind: "ticket-event"`; el CLI agrega uno por cada mutación propia. -->

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-08-28",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-08-28",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-28",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-28",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-08-28",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-08-28",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-08-28",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-08-28",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-08-28",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-004 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-08-28",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
