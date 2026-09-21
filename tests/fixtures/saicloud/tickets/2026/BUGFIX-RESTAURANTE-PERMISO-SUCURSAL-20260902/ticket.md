---
schema_version: 1
id: BUGFIX-RESTAURANTE-PERMISO-SUCURSAL-20260902
title: Restringir Point a la sucursal principal al retirar todas las sucursales
type: BUGFIX
module: RESTAURANTE
workflow_status: closed
qa_status: approved
release_status: released
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-02
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# BUGFIX-RESTAURANTE-PERMISO-SUCURSAL-20260902

## Solicitud original

Al cambiar en un usuario el parámetro 'Todas las sucursales' a No, la pestaña Sucursales se oculta correctamente, pero Restaurante > Point aún muestra y permite seleccionar las sucursales que quedaron asignadas previamente. Debe validar primero all_branch: si es No, solo puede operar la sucursal principal; si es Sí, aplica las asignaciones activas de UserBranches.

## Descripción funcional

- Alcance: selector de sucursal y sucursal operativa en Restaurante > Point.
- Usuario o rol afectado: usuarios que antes tuvieron acceso a todas las sucursales y conservan filas activas en `UserBranches` después de desactivar ese permiso.
- Comportamiento actual: Point conserva visibles y seleccionables las filas activas previas de `UserBranches`, incluso con `all_branch=false`.
- Comportamiento esperado: sin acceso global, Point usa solamente la sucursal principal (`id_admbranch`); con acceso global, usa las asignaciones activas configuradas.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/mod-restaurant/restaurant/point/point.component.ts` inicializa `BranchContextService` al entrar a Point; `FrontEnd/src/app/common/services/branch-context.service.ts` construye las sucursales disponibles; `FrontEnd/src/app/mod-restaurant/layout/restaurant-layout.resolver.ts` refresca el usuario autenticado antes de mostrar Restaurante.
- Causa raíz o hipótesis: `availableBranches()` filtra por estado de `UserBranches`, pero no verifica primero `user.all_branch`. Las filas antiguas se conservan intencionalmente en el backend al ocultarse la pestaña, por lo que el perfil fresco aún contiene esas filas y el selector las trata indebidamente como autorización vigente.
- Riesgos y compatibilidad: el cambio debe limitarse al cálculo centralizado de sucursales disponibles. Conserva el comportamiento para usuarios con `all_branch=true` y para usuarios sin filas `UserBranches`, que siguen en su sucursal principal. Se invalidará una sucursal persistida en `sessionStorage` si ya no está permitida y se volverá a la sucursal principal.
- Impactos de sync, migración, Docker o despliegue: no aplica. No cambia contrato API, esquema, sincronización, Docker ni autenticación; consume el flag existente en el perfil ya refrescado.

## Plan

- Gate de plan: aprobado explícitamente por el PO el 2026-09-02 en esta conversación. BUGFIX localizado de riesgo normal en una regla de autorización de interfaz, sin impactos críticos definidos en PHASE-MAP.
- Pasos ordenados:
  1. Añadir en `branch-context.service.spec.ts` una regresión con `all_branch=false` y filas activas previas en `UserBranches`; debe fallar porque hoy devuelve más de la sucursal principal.
  2. Ajustar `BranchContextService.availableBranches()` para retornar exclusivamente la sucursal principal cuando `all_branch` es falso; mantener el filtro actual de filas activas solo para `all_branch=true`.
  3. Ejecutar el spec dirigido y la compilación Angular; revisar manualmente que un valor de `active_branch` previo ya no permite acceder a una sucursal retirada.
- Rollback, backup, canario u orden de despliegue cuando aplique: sin migración ni cambio de datos. El rollback es revertir el cambio frontend si el selector limita indebidamente a un usuario con `all_branch=true`; se despliega con el flujo ordinario de `dev` solo después de las pruebas y confirmación del PO.

## Criterios de aceptación

- [ ] POINT-001: con `all_branch=false` y una o más filas activas heredadas en `UserBranches`, `availableBranches()` y Point exponen exclusivamente `id_admbranch`.
- [ ] POINT-001: con `all_branch=true`, Point mantiene disponibles únicamente las filas activas de `UserBranches`.
- [ ] POINT-001: un `active_branch` guardado que ya no está autorizado vuelve a la sucursal principal.
- [ ] Usuarios sin `UserBranches` conservan el comportamiento actual de sucursal principal.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Point conserva sucursales asignadas tras retirar acceso global",
    "status": "closed",
    "severity": "high",
    "actual": "Restaurante > Point muestra las sucursales activas de UserBranches aunque el usuario tenga all_branch=false, por lo que puede seleccionar y operar una sucursal previamente configurada.",
    "expected": "Con all_branch=false, Restaurante > Point muestra y utiliza exclusivamente id_admbranch. Las UserBranches activas solo se consideran cuando all_branch=true.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- Archivos cambiados: `FrontEnd/src/app/common/services/branch-context.service.ts` y `FrontEnd/src/app/common/services/branch-context.service.spec.ts`.
- Decisiones técnicas: `availableBranches()` prioriza el valor explícito `all_branch === false` y retorna únicamente `id_admbranch` antes de examinar `UserBranches`. La comparación estricta preserva la compatibilidad con perfiles antiguos sin ese campo.
- Compatibilidad preservada: los usuarios con `all_branch=true` mantienen las filas activas configuradas; quienes no tienen filas o tienen perfiles antiguos continúan en su sucursal principal. La inicialización existente descarta `active_branch` de `sessionStorage` cuando ya no pertenece a las sucursales disponibles.
- Commits atribuibles al ticket:
  - `5a1ad2a59c31ca47633f28f7feb4100aedfe04e8` — prioriza `all_branch=false` en el contexto de sucursales de Point y agrega la regresión de asignaciones heredadas.

## Pruebas

- Comandos para el PO: `npm test -- --watch=false --include src/app/common/services/branch-context.service.spec.ts` y `npm run build`.
- Directorio de ejecución: `FrontEnd/`.
- Resultado esperado: el spec dirigido cubre la revocación con `UserBranches` heredadas y la compilación Angular termina correctamente.
- Validaciones manuales: editar un usuario que tenga filas activas previas, desactivar “Todas las sucursales”, entrar o volver a entrar a Restaurante > Point y comprobar que solo aparece su sucursal principal.
- Requisitos de ambiente o datos: usuario con sucursal principal definida, al menos una fila activa previa en `UserBranches` y acceso a Restaurante.
- Resultado local: la prueba dirigida ejecutó 14 casos exitosos y `npm run build` terminó correctamente. La suite Angular integral presentó dos fallos y errores de promesas no manejadas en `PosBranchCategoryComponent` por mocks incompletos de IndexedDB (`saveData`/`deleteData`); el PO confirmó explícitamente el 2026-09-02 que son ajenos a este ticket y autorizó publicar el BUGFIX para probarlo.
- Resultado comunicado por el PO: aprobado en dev el 2026-09-02; al desactivar “Todas las sucursales”, Restaurante > Point muestra únicamente la sucursal principal.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-02",
    "build_reference": "commit:5a1ad2a59c31ca47633f28f7feb4100aedfe04e8",
    "environment": "dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-02",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "PO confirma en dev que, al desactivar Todas las sucursales, Restaurante > Point muestra únicamente la sucursal principal."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-02",
    "kind": "automated",
    "description": "TDD dirigido: la nueva regresión falló antes del cambio al devolver dos sucursales; después del ajuste, el spec ejecutó 14 pruebas exitosas, incluida la revocación de all_branch con UserBranches heredadas.",
    "reference": "worktree:sha256:da385360d4c739c39eac2a8b33480d8ce4c7ed10ed4219a64e39cd14ab118490",
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-02",
    "kind": "automated",
    "description": "Compilación Angular npm run build finalizada correctamente el 2026-09-02.",
    "reference": "worktree:sha256:da385360d4c739c39eac2a8b33480d8ce4c7ed10ed4219a64e39cd14ab118490",
    "point_id": null
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-09-02",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma en dev que, al desactivar Todas las sucursales, Restaurante > Point muestra únicamente la sucursal principal."
  }
]
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
    "date": "2026-09-02",
    "technical_summary": "BranchContextService prioriza all_branch=false sobre las filas persistentes de UserBranches y la regresión protege esa precedencia.",
    "functional_summary": "El PO confirmó en dev que Point ya restringe al usuario a su sucursal principal al retirar el acceso a todas las sucursales.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "PO confirma en dev que, al desactivar Todas las sucursales, Restaurante > Point muestra únicamente la sucursal principal.",
    "release_impact": "Ticket cerrado funcionalmente y pendiente de una release futura; no se crea PR, tag ni despliegue productivo."
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
    "date": "2026-09-02",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-02",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-02",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-02",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-02",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-02",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-02",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-02",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
