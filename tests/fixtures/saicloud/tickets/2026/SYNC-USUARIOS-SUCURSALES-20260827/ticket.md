---
schema_version: 1
id: SYNC-USUARIOS-SUCURSALES-20260827
title: Sincronizar asignaciones de sucursal y consecutivos alternos de usuarios
type: SYNC
module: USUARIOS
workflow_status: closed
qa_status: approved
release_status: released
user_visible: false
sync_impact: true
migration_impact: false
docker_impact: false
risk_level: high
created: 2026-08-27
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# SYNC-USUARIOS-SUCURSALES-20260827

## Solicitud original

En la base local faltan las asignaciones de sucursal del usuario y los consecutivos alternos asociados. Deben descargarse en el bootstrap y sincronizarse en ambos sentidos cuando se edite el usuario. Se prioriza este trabajo; el ajuste WAF queda pendiente.

## Descripción funcional

- Alcance: descarga completa e incremental de las asignaciones de sucursal y los consecutivos alternos de cada usuario entre nube y local.
- Usuario o rol afectado: administradores que configuran usuarios, cajeros y meseros cuyo acceso depende de sucursal o consecutivo.
- Comportamiento actual: el bootstrap local omite `UserBranches`; los consecutivos alternos no se aplican con el formato del endpoint ni se encolan al cambiar su relación M2M.
- Comportamiento esperado: una instalación nueva refleja exactamente la configuración cloud y una edición posterior en cualquiera de los dos lados llega al otro sin duplicados ni IDs locales como identidad.

## Diagnóstico

- Archivos y flujo investigados: `bootstrap_users()` solo procesa `UserInvoice`, `UserRestaurant` y `UserLogisty`; `AdmUserSyncSerializer` sí expone `UserBranches`. `serialize_instance()` excluye todos los M2M y no existe receptor `m2m_changed` que reencole `AdmInvoiceParam` cuando cambian sus alternos.
- Causa raíz o hipótesis: el bootstrap nunca materializa `AdmUserBranch`; la lista M2M que entrega `AdmInvoiceParamSyncSerializer` usa IDs y el bootstrap actual solo acepta objetos. La edición posterior puede guardar la relación sin generar un evento sincronizable.
- Riesgos y compatibilidad: las relaciones tienen FKs cuyo ID puede diferir entre local y cloud. La corrección debe usar claves naturales, preservar cloud-gana ante conflicto, ser idempotente y no crear filas duplicadas ni borrar asignaciones por payloads de clientes antiguos.
- Impactos de sync, migración, Docker o despliegue: OfflineSync crítico; sin migración ni cambio Docker previstos. El orden de publicación requiere publicar cloud antes de distribuir el worker local compatible y conservar rollback al artefacto anterior.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-08-27 para implementar bootstrap y sincronización bidireccional de asignaciones de sucursal y consecutivos alternos de usuarios; es un cambio crítico de OfflineSync.
- Alcance y exclusiones: se corrigen `AdmUserBranch` y `AdmInvoiceParam.alternate_consecutives`. WAF, credenciales, SaiSetup y otros permisos de usuario quedan fuera de este ticket.
- Pasos ordenados:
  1. Ajustar el contrato de `sync-users` y el bootstrap para aceptar listas de IDs u objetos y aplicar `UserBranches` solo después de usuarios, sucursales, consecutivos y bodegas; usar `update_or_create` por usuario+sucursal y `.set()` incluso para lista vacía.
  2. Registrar cambios M2M de consecutivos alternos sin duplicar eventos, construir payloads con claves naturales y resolverlos en el receptor cloud/local antes del upsert. Extender las asignaciones de sucursal con lookups naturales para usuario, sucursal, consecutivos y bodega; cubrir alta, edición y baja segura.
  3. Añadir pruebas unitarias e integración con schemas tenant separados: bootstrap, actualización cloud→local, local→cloud, reintento idempotente, relación vacía y colisión de IDs. Confirmar que `disable_sync_signals` y `skip_sync_queue` suprimen eco durante bootstrap/pull.
  4. Publicar primero la nube compatible; ejecutar canario sobre un tenant de prueba y solo después crear/publicar la imagen del worker. Verificar cola y datos locales antes de actualizar los clientes. Rollback: detener la nueva imagen y volver al tag anterior; no revertir datos ni borrar colas sin evidencia.
- Rollback, backup, canario u orden de despliegue cuando aplique: antes del canario, respaldo verificable de las bases cloud y local del entorno de prueba. Mantener intacta la cola; la idempotencia permite reintentos después del rollback.

## Criterios de aceptación

- [ ] `POINT-001`: un bootstrap nuevo crea o actualiza todas las filas `AdmUserBranch` de la nube y conserva sus FKs funcionales.
- [ ] `POINT-002`: el bootstrap refleja la lista completa de alternos, incluida una lista vacía, y no depende del formato interno de IDs.
- [ ] Una edición de sucursal o alternos se propaga en ambos sentidos por claves naturales, no duplica filas ni cruza tenants; ante conflicto prevalece cloud.
- [ ] Las señales de bootstrap/pull no generan eco y un reintento de la misma cola no cambia el resultado.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "El bootstrap omite las asignaciones de sucursal del usuario",
    "status": "closed",
    "severity": "high",
    "actual": "La respuesta sync-users contiene UserBranches, pero bootstrap_users no la procesa ni crea AdmUserBranch en la base local.",
    "expected": "El bootstrap crea o actualiza cada AdmUserBranch por usuario y sucursal después de disponer de sus referencias.",
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
  },
  {
    "id": "POINT-002",
    "title": "Los consecutivos alternos no se aplican ni se encolan al editar",
    "status": "closed",
    "severity": "high",
    "actual": "El serializer de sync devuelve IDs M2M, el bootstrap solo acepta objetos y las señales no registran cambios M2M en AdmInvoiceParam.",
    "expected": "El bootstrap refleja listas vacías o pobladas y una edición local de alternos genera un envío idempotente con claves naturales.",
    "evidence": [
      "EVIDENCE-002"
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

- Archivos cambiados: `BackEnd/ModAdmin/serializers/sync.py`, `BackEnd/ModAdmin/views/sync.py`, `BackEnd/OfflineSync/signals.py`, `BackEnd/OfflineSync/views.py`, `BackEnd/OfflineSync/management/commands/run_sync.py`, `BackEnd/OfflineSync/management/commands/bootstrap_tenant_from_cloud.py` y `BackEnd/OfflineSync/tests.py`.
- Decisiones técnicas: `sync-users` explicita los IDs de alternos y precarga las relaciones. Bootstrap aplica `UserBranches` por la clave `(usuario, sucursal)` y reemplaza los alternos incluso cuando la lista es vacía. Las señales M2M reencolan el padre `AdmInvoiceParam`; el worker envía claves naturales y el receptor las resuelve antes del upsert o delete de `AdmUserBranch`.
- Compatibilidad preservada: bootstrap acepta tanto listas antiguas de objetos como listas actuales de IDs; el receptor conserva fallback controlado a IDs existentes para workers anteriores. Los guards `disable_sync_signals` evitan eco durante pull/bootstrap.
- Commits atribuibles al ticket:
  - `569ead658bbef8d944bdc1b1c8716487f99506f5` — sincroniza bootstrap, relaciones M2M y asignaciones de sucursal por claves naturales.

## Pruebas

- Comandos para el PO:
  - `docker compose exec backend python manage.py test OfflineSync.tests.SyncUserRelationsTest --keepdb -v 1`
  - `docker compose exec backend python manage.py shell -c "from ModAdmin.models.params import AdmUserBranch; print(list(AdmUserBranch.objects.values('id_admuser_id','id_admcompanybranch_id','id_admconsecutive_pos_id')))"`
- Directorio de ejecución: carpeta de instalación del cliente que contiene el compose desplegado.
- Resultado esperado: los tres tests pasan; tras un bootstrap se observan filas de `AdmUserBranch` y los alternos configurados en cloud. Al editar un usuario y guardar, la cola contiene `adminvoiceparam` y/o `admuserbranch`; después de sincronizar, cloud y local coinciden.
- Validaciones manuales: en nube crear o editar un usuario con dos sucursales y alternos, ejecutar bootstrap en un cliente de prueba y revisar la base local. Repetir el cambio desde local, esperar el ciclo y confirmar el resultado en nube; retirar un alterno y confirmar que ambos lados quedan sin esa relación.
- Requisitos de ambiente o datos: probar primero en un tenant canario con backup verificable de nube y base local. Publicar la imagen cloud antes de la imagen del worker, sin limpiar `SyncQueue`.
- Resultado automatizado: `BackEnd/.venv/bin/python BackEnd/manage.py test OfflineSync.tests.SyncUserRelationsTest --keepdb -v 1` ejecutó 3 pruebas en 72.311s: OK. `manage.py check`, `makemigrations --check --dry-run` y `git diff --check`: OK.
- Resultado comunicado por el PO: el 2026-09-16 confirmó que todos los puntos fueron validados satisfactoriamente y autorizó el cierre.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-16",
    "build_reference": "commit:9617b3789e105203d1f7d81fe7ec6632a38885ca",
    "environment": "dev validado por el PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-16",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirma que todos los puntos de este ticket fueron validados satisfactoriamente y autoriza su cierre."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-08-27",
    "kind": "code-inspection",
    "description": "bootstrap_users obtiene UserInvoice, UserRestaurant y UserLogisty, pero no lee ni aplica UserBranches, aunque el endpoint sync-users lo serializa.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-08-27",
    "kind": "code-inspection",
    "description": "alternate_consecutives es M2M: serialize_instance lo excluye y no hay receptor m2m_changed; además bootstrap solo reconoce elementos objeto, mientras el serializer sync devuelve IDs.",
    "reference": null,
    "point_id": "POINT-002"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-09-16",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma que todos los puntos de este ticket fueron validados satisfactoriamente y autoriza su cierre."
  },
  {
    "id": "RETEST-002",
    "date": "2026-09-16",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma que todos los puntos de este ticket fueron validados satisfactoriamente y autoriza su cierre."
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
    "date": "2026-09-16",
    "technical_summary": "La implementación, pruebas y retests trazables permanecen registrados en este ticket; todos sus puntos quedaron cerrados.",
    "functional_summary": "El PO confirmó la validación satisfactoria de todos los puntos y autorizó el cierre.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirma que todos los puntos de este ticket fueron validados satisfactoriamente y autoriza su cierre.",
    "release_impact": "Cierre funcional sin publicación de release; permanece unreleased hasta su inclusión explícita en una versión."
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
    "date": "2026-08-27",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-08-27",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-08-27",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-27",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-27",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-16",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-16",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-16",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
