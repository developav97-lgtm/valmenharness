---
schema_version: 1
id: BUGFIX-ADMIN-USERS-PRECARGA-20260826
title: Usuarios carga solo el perfil de sesión
type: BUGFIX
module: ADMIN
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-08-26
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# BUGFIX-ADMIN-USERS-PRECARGA-20260826

## Solicitud original

Al entrar a Usuarios solo carga uno. refreshUserRecord en FrontEnd/src/app/common/services/auth.service.ts guarda el usuario del login en IndexedDB; después el resolver de Users detecta ese registro y no carga los demás.

## Descripción funcional

- Alcance: carga del catálogo `Users` al iniciar o cambiar sesión, que abastece Administración, Restaurante y POS mediante sus resolvers existentes.
- Usuario o rol afectado: usuarios con permiso para abrir la ruta `admin/users` en el tenant activo.
- Comportamiento actual: tras iniciar o cambiar sesión, `refreshUserRecord()` persiste solamente el perfil activo. Cualquier resolver posterior que incluya `Users` delega en `preloadCollections()`, detecta ese registro y no solicita `api/users/`.
- Comportamiento esperado: antes de navegar a módulos que dependen de `Users`, IndexedDB contiene el catálogo completo autorizado por `api/users/`, incluidos los datos actualizados del usuario activo.

## Diagnóstico

- Archivos y flujo investigados: `auth.service.ts` invoca `refreshUserRecord()` después de login y cambio de sesión; además, `restaurant-layout.resolver.ts` lo invoca al entrar a Restaurante. Los resolvers de layout de Restaurante/POS y el carrito incluyen `Users` en `preloadCollections()`, cuyo guard `hasAnyRecord()` considera suficiente el perfil aislado. El endpoint paginado `api/users/` usa el mismo `AdmUserSerializer` que el retrieve y aplica el contexto del tenant autenticado.
- Causa raíz o hipótesis: confirmada. El refresco puntual del perfil activo fue diseñado para conservar permisos actuales, pero altera el sentinel de caché compartido de `Users`. Por eso bloquea la primera precarga del catálogo para todos los consumidores, no solo Administración.
- Riesgos y compatibilidad: la corrección debe cargar el catálogo completo solo al completar login o cambio real de usuario; conservar el refresco puntual al entrar a Restaurante para detectar cambios posteriores de permisos. No se debe cambiar `DataPreloadService` ni forzar descargas en cada resolver. La API y sus permisos tenant-scoped se conservan como fuente de datos.
- Impactos de sync, migración, Docker o despliegue: no aplica para sync, migración, Docker o despliegue. Sí impacta el flujo de autenticación del frontend, por lo que requiere aprobación explícita del PO antes de implementar.

## Plan

- Plan anterior — gate no exigible: BUGFIX localizado de riesgo normal en el resolver Angular. Fue rechazado en el retest del PO y se revirtió.
- Gate de plan: aprobado explícitamente por el PO el 2026-08-26 mediante "listo si".
- Paso 1: en `auth.service.ts`, cargar el catálogo paginado de `Users` después de login exitoso y después de cambio real de usuario, preservando primero el refresco puntual que protege permisos actuales y la decisión de sucursal.
- Paso 2: mantener los resolvers de Administración, Restaurante y POS en la precarga común y no cambiar `DataPreloadService`.
- Paso 3: añadir pruebas de login y ejecutar pruebas dirigidas y compilación Angular.
- Rollback del plan revisado: restaurar el refresco puntual anterior y el resolver original; no requiere backup, canario ni orden especial de despliegue.

## Criterios de aceptación

- [ ] POINT-001: un login exitoso y un cambio real de usuario cargan el catálogo completo de `api/users/` en IndexedDB antes de que los resolvers de módulo dependan de `Users`.
- [ ] POINT-001: Administración, Restaurante y POS conservan `preloadCollections()` en sus resolvers; tras login no quedan bloqueados por un único perfil cacheado.
- [ ] POINT-001: el usuario activo sigue recibiendo su perfil actualizado para permisos y decisión de sucursal; no cambian los contratos API, tenant ni permisos.
- [ ] POINT-001: las pruebas unitarias de autenticación y resolver, y la compilación Angular, finalizan correctamente.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "El listado de Usuarios omite usuarios distintos al de sesión",
    "status": "closed",
    "severity": "high",
    "actual": "Al iniciar sesión, refreshUserRecord almacena el perfil activo en Users. Al navegar a admin/users, el resolver delega en preloadCollections, que detecta ese único registro y no solicita api/users/.",
    "expected": "Al navegar a Usuarios, el catálogo Users se carga desde api/users/ aunque el perfil de la sesión ya esté almacenado; la pantalla presenta el conjunto completo permitido por el tenant y permisos.",
    "evidence": [
      "EVIDENCE-001",
      "EVIDENCE-002",
      "EVIDENCE-004",
      "EVIDENCE-005",
      "EVIDENCE-006"
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

- Implementación anterior rechazada en retest y revertida: cargar solo desde `adm-users.resolver.ts` no cubre los resolvers de Restaurante, POS y carrito. El resolver y su prueba se mantienen con la precarga común.
- Implementación aprobada: `AuthService` conserva `refreshUserRecord()` para permisos del usuario activo y, después, carga el catálogo paginado de `Users` tras login y cambio real de usuario. Así los resolvers existentes encuentran un catálogo completo sin cambios de contrato ni de `DataPreloadService`.
- Archivos cambiados: `FrontEnd/src/app/common/services/auth.service.ts` y `FrontEnd/src/app/common/services/auth.service.spec.ts`.

## Pruebas

- Comandos para el PO: `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/common/services/auth.service.spec.ts` y `npm run build`.
- Directorio de ejecución: `FrontEnd`.
- Resultado esperado: el spec de `AuthService` completa con 22 pruebas correctas; el build termina con código 0. El runner Angular 14 vuelve a emitir después un error espurio al reevaluar `--include`, aun cuando los 22 specs ya terminaron correctamente.
- Validaciones manuales: con un tenant de al menos dos usuarios, iniciar sesión y confirmar que Administración > Usuarios, Restaurante > carrito y POS muestran/consumen el catálogo completo sin una recarga manual. Cambiar a otro usuario y repetir, verificando que permisos y la decisión de sucursal siguen siendo correctos.
- Requisitos de ambiente o datos: tenant de pruebas con al menos dos usuarios visibles para el rol actual.
- Resultado comunicado por el PO: validado correcto el flujo revisado de carga completa tras login y cambio de usuario.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-08-26",
    "build_reference": "worktree:sha256:e2bde54f39f435572ed28ef0bdd7be8a61bc77da2a7d8d4a6a8f3c3e7ad13d80",
    "environment": "Tenant de pruebas validado por PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-08-26",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó: ya validé, está correcto."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-08-26",
    "kind": "automated",
    "description": "El spec adm-users.resolver.spec.ts ejecutó 1 SUCCESS con la implementación final; el runner Angular 14 emitió después un error espurio al reevaluar --include.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-08-26",
    "kind": "build",
    "description": "npm run build en FrontEnd finalizó con código 0; hash ab25317cb89650b2.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-08-26",
    "kind": "automated",
    "description": "La suite Angular completa no constituye aprobación: falló por una promesa no controlada preexistente en adm-partner.component.ts:563 y desconexión posterior de ChromeHeadless, ajenas a los archivos de este ticket.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-08-26",
    "kind": "manual",
    "description": "El PO reportó que la corrección localizada en adm-users.resolver.ts no cubre los resolvers de Restaurante/POS; solicitó trasladar la carga completa de Users a login y cambio de sesión. La implementación rechazada fue revertida.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-08-26",
    "kind": "automated",
    "description": "La regresión auth.service.spec.ts ejecutó 22 specs correctos con la implementación final; el runner Angular 14 emitió después un error espurio de --include.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-006",
    "date": "2026-08-26",
    "kind": "build",
    "description": "npm run build en FrontEnd finalizó con código 0; hash 83f621b0e1c8a764.",
    "reference": null,
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-08-26",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó: ya validé, está correcto."
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
    "date": "2026-08-26",
    "technical_summary": "AuthService carga el catálogo Users tras login y cambio real de usuario, preservando el refresco puntual de permisos.",
    "functional_summary": "El PO validó que Usuarios, Restaurante/POS y carrito reciben el catálogo completo sin recarga manual.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó: ya validé, está correcto.",
    "release_impact": "Cambio funcional cerrado y permanece unreleased; no se creó commit ni despliegue."
  }
]
```

## Consumo de IA

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
    "date": "2026-08-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-08-26",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-08-26",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-26",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-08-26",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-26",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-26",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-26",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-26",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-08-26",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-08-26",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-08-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-08-26",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-08-26",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-08-26",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-08-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-08-26",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-08-26",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-08-26",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
