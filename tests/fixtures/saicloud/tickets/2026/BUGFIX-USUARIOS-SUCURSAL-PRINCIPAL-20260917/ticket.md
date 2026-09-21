---
schema_version: 1
id: BUGFIX-USUARIOS-SUCURSAL-PRINCIPAL-20260917
title: Cambiar la sucursal principal no habilita la nueva sucursal en la pestaña Sucursales
type: BUGFIX
module: USUARIOS
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: true
sync_impact: true
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-17
updated: 2026-09-17
related_ticket: SYNC-USUARIOS-SUCURSALES-20260827
target_release: null
released_in: null
---

# BUGFIX-USUARIOS-SUCURSAL-PRINCIPAL-20260917

## Solicitud original

El PO tenía un usuario con sucursal principal la 5 y en la pestaña Sucursales también la 5 y la 8, y operaba normal. Cambió la sucursal principal a la 1, actualizó los consecutivos en Parámetros y guardó. Al entrar al restaurante empezó a salir error en Point y quedó bloqueado: la sucursal 1 no estaba habilitada en la pestaña Sucursales y tocó habilitarla y configurarla manualmente para poder operar. Solicita que el sistema siempre habilite la sucursal principal y que, al cambiarla, habilite la nueva tomando los parámetros ya configurados, para que el usuario no tenga que volver a la pestaña Sucursales.

## Descripción funcional

- Alcance: alta y edición de usuarios en el formulario Angular de administración y la resolución de la configuración de facturación por sucursal en Point/Restaurante. No incluye cambios de modelo ni de migraciones.
- Usuario o rol afectado: administradores que cambian la sucursal principal de un usuario con "Todas las sucursales" (`all_branch`) y cajeros que entran a operar después de ese cambio.
- Comportamiento actual: al guardar un usuario con `id_admbranch` nuevo, `_sync_home_branch_invoice_config()` solo actualiza la fila `AdmUserBranch` de esa sucursal si ya existe; no la crea ni la reactiva. La pestaña Sucursales tampoco la incluye al guardar (`buildUserBranchesPayload()` omite filas nunca asignadas) y `BranchContextService.availableBranches()` deja fuera la principal cuando `all_branch` es true y no tiene fila activa. En Point/Restaurante, `get_user_branch_config` responde `branch_configured: false` para esa sucursal y la validación dura de sucursal activa bloquea con "No fue posible validar el consecutivo y la caja de la sucursal activa".
- Comportamiento esperado: el sistema garantiza que la sucursal principal del usuario tenga siempre una fila `AdmUserBranch` habilitada (`state=true`) con los parámetros configurados en Parámetros (`AdmInvoiceParam`: consecutivo, devolución, bodega y terminal). Al cambiar la sucursal principal, la nueva queda habilitada automáticamente tomando esos parámetros, sin obligar al administrador a volver a la pestaña Sucursales; el switcher de sucursal siempre ofrece la principal.

## Diagnóstico

- Archivos y flujo investigados:
  - `BackEnd/ModAdmin/serializers/settings.py:458-490` — `_sync_home_branch_invoice_config()` usa `AdmUserBranch.objects.filter(...).update(...)`; no crea la fila y no toca `state`. Se invoca al final de `create()` (`:216`) y `update()` (`:445`).
  - `BackEnd/ModAdmin/serializers/settings.py:431-443` — upsert de `UserBranches` por `(id_admuser, id_admcompanybranch)` con el `state` que llegue del formulario.
  - `BackEnd/ModAdmin/models/params.py:127-148` — modelo `AdmUserBranch` (clave natural `id_admuser` + `id_admcompanybranch`).
  - `BackEnd/ModPos/views/functions.py:2536-2577` — `get_user_branch_config` responde `branch_configured: true` solo si existe fila `AdmUserBranch` con `state=True`; si no, cae al fallback de `AdmInvoiceParam` con `branch_configured: false`.
  - `FrontEnd/src/app/common/services/branch-context.service.ts:102-122` — `availableBranches()` con `all_branch=true` devuelve solo las filas activas de `UserBranches`; la principal queda fuera si no tiene fila.
  - `FrontEnd/src/app/mod-restaurant/restaurant/point/point.component.ts:639-654` — error duro cuando `branch_configured === false` o faltan consecutivo/terminal.
  - `FrontEnd/src/app/common/services/restaurant.service.ts:486-500` — mismo bloqueo al entrar al carrito con una sucursal activa distinta a la principal sin fila/config válida.
  - `FrontEnd/src/app/administration/users/user/adm-user.component.ts:521-537, 575-586, 641` — `buildBranchRows()`/`buildUserBranchesPayload()` no incluyen la principal nueva si nunca tuvo fila; además `buildBranchRows()` ignora filas con `state=false`.
- Causa raíz o hipótesis: confirmada. La sucursal principal solo se espeja en `AdmUserBranch` cuando la fila ya existe; cambiar `id_admbranch` deja la nueva principal sin fila habilitada. El frontend y `get_user_branch_config` tratan "sin fila" como "no configurada", y la sesión del operador conserva en `sessionStorage` una sucursal activa anterior que, con la fila vieja desactualizada o con parámetros incompletos, termina en el bloqueo duro de Point. Es una divergencia entre `AdmInvoiceParam` (fuente autoritativa declarada en el propio comentario de la función) y la pestaña Sucursales que el PO resolvió manualmente.
- Riesgos y compatibilidad: `AdmUserBranch` participa del pipeline de OfflineSync con clave natural `(id_admuser_id, id_admcompanybranch_id)` (`BackEnd/OfflineSync/natural_keys.py:20`, `signals.py:34`, `run_sync.py`), así que la fila creada/reactivada se propagará a los nodos locales por el canal existente; la operación debe ser idempotente. El formulario puede enviar `state=false` para la principal (desmarcarla) y el backend debe imponer `state=true`. Usuarios con `all_branch=false` no presentan el defecto (el frontend siempre resuelve su principal) y no requieren filas nuevas. Sin migración ni cambios de modelo; rollback = revertir el código (las filas creadas son inofensivas).
- Impactos de sync, migración, Docker o despliegue: sync sí (fila nueva/reactivada en modelo sincronizado, sin cambio de contrato); migración y Docker no. Requiere aprobación explícita del plan por el PO antes de implementar por el impacto de sync.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-09-17 mediante "si apruebo", cubriendo el gate humano por impacto de sync (`AdmUserBranch` es modelo de la cola de sincronización).
- Pasos ordenados:
  1. Backend: reescribir `_sync_home_branch_invoice_config()` para garantizar la fila de la sucursal principal con `update_or_create()` sobre `(id_admuser, id_admcompanybranch=id_admbranch)` y `state=True`, copiando consecutivo POS, devolución, bodega y terminal desde `AdmInvoiceParam`. Aplica al final de `create()` y `update()`, después del upsert de `UserBranches`, para que sea la última palabra sobre la principal.
  2. Decidir en implementación el caso sin `AdmInvoiceParam` (usuario sin módulo de facturación): mantener el comportamiento actual sin crear fila cuando no existe `AdmInvoiceParam`, porque no hay parámetros que espejar y ese perfil no presenta el defecto.
  3. Frontend: incluir la sucursal principal en `availableBranches()` (unión de filas activas más `user.id_admbranch`) para que el switcher nunca la pierda en usuarios existentes sin fila. Ajustar `buildBranchRows()` para reflejar la principal como habilitada y conservarla en `buildUserBranchesPayload()` cuando `id_admbranch` cambie en el formulario.
  4. Pruebas backend: `create()` y `update()` crean/reactivan la fila principal con los valores de `AdmInvoiceParam`; cambio de principal crea la nueva y no toca las demás; `state=false` entrante para la principal queda en `true`; usuario con `all_branch=false` o sin `AdmInvoiceParam` no genera filas nuevas.
  5. Pruebas frontend: `branch-context.service.spec.ts` (principal incluida siempre) y `adm-user.component.spec.ts` (principal marcada y enviada al cambiar de sucursal).
  6. Documentar la decisión en el ticket y, si el PO la ratifica, en `docs/errors.md`/`docs/decisions.md` al cierre.
- Rollback, backup, canario u orden de despliegue cuando aplique: sin migración ni backup. Rollback = revertir los commits del ticket; las filas `AdmUserBranch` creadas por el fix quedan válidas y sincronizadas. Despliegue normal dev→producción; no exige orden especial frente a nodos locales porque usa el pipeline de sync existente con clave natural idempotente.

## Criterios de aceptación

- [ ] Al cambiar la sucursal principal de un usuario con `all_branch=true` y guardar, existe una fila `AdmUserBranch` habilitada para la nueva sucursal con consecutivo, devolución, bodega y terminal tomados de `AdmInvoiceParam`, sin pasos manuales en la pestaña Sucursales.
- [ ] Un cajero puede entrar a Point/Restaurante después del cambio sin el bloqueo "No fue posible validar el consecutivo y la caja de la sucursal activa", incluso con `sessionStorage['active_branch']` de una sede anterior.
- [ ] Desmarcar la sucursal principal en la pestaña Sucursales y guardar no la deshabilita; el formulario la vuelve a mostrar habilitada.
- [ ] Las demás sucursales asignadas conservan sus valores y los usuarios con `all_branch=false` no cambian de comportamiento.
- [ ] Pruebas unitarias backend y frontend del alcance ejecutadas y en verde.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Cambiar la sucursal principal deja la nueva sede sin fila habilitada en AdmUserBranch",
    "status": "closed",
    "severity": "high",
    "actual": "Con la sucursal principal en la 5 y las filas 5 y 8 activas, el PO cambió la principal a la 1, actualizó los consecutivos en Parámetros y guardó. Al entrar al restaurante apareció el bloqueo de Point sobre el consecutivo/caja de la sucursal activa; la sucursal 1 no estaba habilitada en la pestaña Sucursales y hubo que habilitarla y configurarla a mano para poder operar. _sync_home_branch_invoice_config() solo actualiza una fila AdmUserBranch existente: no la crea ni reactiva, y el frontend/get_user_branch_config tratan la ausencia de fila como sucursal no configurada.",
    "expected": "Al guardar un usuario, el sistema garantiza la fila AdmUserBranch habilitada (state=true) de su sucursal principal con consecutivo, devolución, bodega y terminal copiados de AdmInvoiceParam. Al cambiar la principal, la nueva sede queda habilitada automáticamente con esos parámetros y el operador puede entrar a Point/Restaurante sin pasos manuales en la pestaña Sucursales; la principal siempre aparece disponible en el selector de sucursal.",
    "evidence": [
      "EVIDENCE-001",
      "EVIDENCE-002",
      "EVIDENCE-003"
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

- Archivos cambiados:
  - `BackEnd/ModAdmin/serializers/settings.py` — `_sync_home_branch_invoice_config()` ahora usa `update_or_create` sobre `(id_admuser, id_admcompanybranch=id_admbranch)` con `state=True` y copia consecutivo POS, devolución, bodega y terminal desde `AdmInvoiceParam`. Se mantiene la salida temprana cuando no hay `AdmInvoiceParam` o `id_admbranch`.
  - `FrontEnd/src/app/common/services/branch-context.service.ts` — `availableBranches()` incluye siempre la sucursal principal al inicio y evita duplicarla cuando ya tiene fila activa.
  - `FrontEnd/src/app/administration/users/user/adm-user.component.ts` — `buildBranchRows()` marca la principal como habilitada aunque no tenga fila (solo con módulos de facturación); `changeBranch()` la marca de inmediato al cambiar la principal; nuevo `markHomeBranchChecked()`/`invoiceModulesEnabled`.
  - Pruebas: `BackEnd/ModAdmin/tests/test_user_branch.py` (+4), `FrontEnd/.../branch-context.service.spec.ts` (+2), `FrontEnd/.../adm-user.component.spec.ts` (+4).
- Decisiones técnicas:
  - La sucursal principal queda garantizada por backend como espejo de la fuente autoritativa ya existente (`AdmInvoiceParam`), tal como aprobó el PO: no se crean filas nuevas para perfiles sin facturación (sin `AdmInvoiceParam`), que no presentan el defecto.
  - El formulario puede enviar `state=false` para la principal (desmarcarla); la corrida del serializer es la última palabra y la deja `True`.
  - La lista de sucursales del frontend no depende solo del dato: incluye la principal siempre, de modo que usuarios existentes sin fila siguen viendo su sede principal en el switcher.
- Compatibilidad preservada: sin migraciones ni cambios de modelo; `AdmUserBranch` conserva su clave natural `(id_admuser_id, id_admcompanybranch_id)` para OfflineSync y el `update_or_create` es idempotente. Sin cambios en `BackEnd/OfflineSync/`, WebSocket, Docker ni autenticación. Las demás sucursales asignadas no se tocan. Rollback: revertir el código; las filas creadas/reactivadas son válidas y sincronizables.
- Commits atribuibles al ticket:
  - `5c37e0f9da1373e1ff144d8842aa3a365078e574` — commit funcional: backend garantiza la fila de la sucursal principal con los parámetros de `AdmInvoiceParam`; frontend incluye la principal en el selector y la conserva habilitada en el formulario; pruebas backend y frontend del alcance.

## Pruebas

- Comandos para el PO:
  - Backend (PostgreSQL local; 27 pruebas del alcance): `cd BackEnd && DB_HOST=127.0.0.1 DB_USER=<usuario> DB_PASSWORD=<clave> DB_NAME=<bd> python3 manage.py test ModAdmin.tests.test_user_branch -v 1`
  - Backend (sync de relaciones de usuario): `cd BackEnd && DB_HOST=127.0.0.1 DB_USER=<usuario> DB_PASSWORD=<clave> DB_NAME=<bd> python3 manage.py test OfflineSync.tests.SyncUserRelationsTest -v 1`
  - Frontend: `cd FrontEnd && npx ng test --watch=false --browsers=ChromeHeadless` (suite completa; el entorno local de esta sesión reportó una desconexión de Chrome por peso de la suite) o ejecución acotada de los dos specs del alcance (41 pruebas).
- Directorio de ejecución: `BackEnd/` y `FrontEnd/` del repositorio.
- Resultado esperado:
  - Backend: `Ran 27 tests ... OK` en `test_user_branch` y `OK` en `SyncUserRelationsTest`.
  - Frontend: 41/41 en `branch-context.service.spec.ts` + `adm-user.component.spec.ts`.
  - Ejecutado en esta sesión: backend 27/27 OK y 4/4 OK; frontend 41/41 SUCCESS. `makemigrations --check` sin cambios y `tsc --noEmit` sin errores.
  - Nota: `ModAdmin.tests.test_serializers_settings.AdmUserSerializerTest.test_state_none_on_update_keeps_existing_value` falla también sin este cambio (verificado con stash del serializer): es un fallo preexistente en `dev` por la validación "solo un Administrador..." del punto 18 frente al test de E162, ajeno a este ticket.
- Validaciones manuales (tenant dev con al menos dos sucursales y cajas):
  1. Editar un usuario con "Todas las sucursales" activo, principal en la sucursal 5 y filas 5 y 8 habilitadas.
  2. Cambiar la principal a la 1, configurar sus consecutivos/terminal en Parámetros y guardar.
  3. En la pestaña Sucursales, verificar que la 1 aparece habilitada con los valores de Parámetros y que 5 y 8 conservan los suyos.
  4. Entrar con ese usuario a Point/Restaurante (incluso con una sesión previa de otra sede): no debe salir "No fue posible validar el consecutivo y la caja de la sucursal activa"; el selector de sucursal debe listar la principal.
  5. Desmarcar la principal en la pestaña Sucursales, guardar y confirmar que sigue habilitada.
- Requisitos de ambiente o datos: build del backend y frontend desplegados en dev; el usuario de prueba necesita `AdmInvoiceParam` (módulo POS o Restaurante) y al menos una caja/terminal por sede.
- Resultado comunicado por el PO: validado en la nube (dev) el 2026-09-17: "ya validé en la nube y funciona bien". El cambio de sucursal principal habilita la nueva sede con los parámetros configurados y ya no bloquea Point.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-17",
    "build_reference": "commit:5c37e0f9da1373e1ff144d8842aa3a365078e574",
    "environment": "dev (nube)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-17",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó en dev el 2026-09-17: 'ya validé en la nube y funciona bien'; pruebas automatizadas backend 27/27 + 4/4 y frontend 41/41."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-17",
    "kind": "automated",
    "description": "Pruebas backend del alcance: ModAdmin.tests.test_user_branch 27/27 OK (4 nuevas de este ticket) y OfflineSync.tests.SyncUserRelationsTest 4/4 OK; makemigrations --check sin cambios.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-17",
    "kind": "automated",
    "description": "Pruebas frontend del alcance: branch-context.service.spec.ts + adm-user.component.spec.ts 41/41 SUCCESS con ChromeHeadless; tsc --noEmit sin errores.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-17",
    "kind": "manual",
    "description": "Validación manual del PO en dev: cambiar la sucursal principal habilita la nueva sede con sus parámetros y no bloquea Point.",
    "reference": "commit:5c37e0f9da1373e1ff144d8842aa3a365078e574",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-09-17",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó en dev el 2026-09-17: 'ya validé en la nube y funciona bien'."
  }
]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional: `_sync_home_branch_invoice_config()` garantiza con `update_or_create` la fila `AdmUserBranch` de la sucursal principal (`state=True`) copiando consecutivo, devolución, bodega y terminal desde `AdmInvoiceParam`; `availableBranches()` incluye siempre la principal y el formulario la marca y conserva al cambiar de sede. Con esto, cambiar la principal habilita la nueva sede sin pasos manuales y Point/Restaurante ya no bloquea al operador. Sin migraciones ni cambios en OfflineSync, Docker ni autenticación.
- Resultado comunicado por el PO: validó en la nube (dev) el 2026-09-17: "ya validé en la nube y funciona bien".
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica): QA-001/QA-002 aprobados con confirmación del PO; `POINT-001` cerrado. Evidencia: backend `ModAdmin.tests.test_user_branch` 27/27 y `OfflineSync.tests.SyncUserRelationsTest` 4/4; frontend 41/41 (branch-context + adm-user); validación manual del PO en dev.
- Riesgo residual e impacto de release: riesgo bajo. La fila creada/reactivada se propaga por el canal de sync existente usando su clave natural (idempotente); las filas creadas son válidas e inofensivas, rollback = revertir el commit. `release_status: unreleased` hasta que entre en una versión productiva.
- Texto visible al usuario cuando aplique: se elimina el bloqueo "No fue posible validar el consecutivo y la caja de la sucursal activa" al entrar tras cambiar la principal; no se agrega texto nuevo.

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-17",
    "technical_summary": "La fila AdmUserBranch de la sucursal principal se crea/reactiva con update_or_create (state=True) copiando consecutivo, devolución, bodega y terminal desde AdmInvoiceParam; availableBranches() incluye siempre la principal y el formulario la marca/conserva al cambiar de sede.",
    "functional_summary": "Cambiar la sucursal principal habilita automáticamente la nueva sede con los parámetros configurados y evita el bloqueo de Point por consecutivo/caja; el administrador ya no debe habilitarla a mano en la pestaña Sucursales.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó en dev el 2026-09-17: 'ya validé en la nube y funciona bien', y ordenó cerrar el ticket el mismo día.",
    "release_impact": "Sin migración, Docker ni cambios en OfflineSync; release_status unreleased hasta su inclusión en una versión productiva. Rollback: revertir el commit funcional 5c37e0f9."
  }
]
```

## Consumo de IA

<!-- Registros append-only `ai-usage`: consumo conocido o estimado con fuente y confianza. No inventar tokens ni coste; usar null cuando Codex no lo reporte. -->

```json
[]
```

## Release

- Estado de release: unreleased
- Versión objetivo: null
- Versión publicada: null
- Tickets relacionados: `SYNC-USUARIOS-SUCURSALES-20260827` (sync de `AdmUserBranch`); `BUGFIX-ADMIN-USUARIOS-CAJAS-SUCURSAL-20260828` (formulario de usuario).

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
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-17",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-17",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-17",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-17",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-17",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-17",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-17",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
