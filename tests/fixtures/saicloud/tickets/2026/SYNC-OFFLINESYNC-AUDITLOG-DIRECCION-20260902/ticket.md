---
schema_version: 1
id: SYNC-OFFLINESYNC-AUDITLOG-DIRECCION-20260902
title: Evitar cola de auditoría creada en nube
type: SYNC
module: OFFLINESYNC
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: true
migration_impact: false
docker_impact: true
risk_level: critical
created: 2026-09-02
updated: 2026-09-07
related_ticket: SYNC-OFFLINESYNC-REGRESIONES-20260901
target_release: 6.2.4
released_in: 6.2.4
---

# SYNC-OFFLINESYNC-AUDITLOG-DIRECCION-20260902

## Solicitud original

Mantener AuditLog exclusivamente local a nube. Evitar que las escrituras administrativas hechas en nube creen eventos PENDING de auditlog, sin afectar la auditoría centralizada de sedes locales ni los modelos bidireccionales.

## Descripción funcional

- Alcance: separar el origen de `AuditLog` por runtime, manteniendo la auditoría producida en el servidor local hacia nube y suprimiendo solo los eventos creados directamente en nube.
- Usuario o rol afectado: administradores que editan configuración en nube y operadores de sedes con servidor local OfflineSync.
- Comportamiento actual: una edición administrativa en nube crea su `AuditLog` y la señal común lo agrega a `SyncQueue` como `PENDING`; como `auditlog` es PUSH-only, esos eventos no se consumen en nube y se acumulan.
- Comportamiento esperado: nube no crea eventos `SyncQueue` de `auditlog`; el servidor local sí los encola y el `sync_worker` los publica idempotentemente a nube. Los modelos administrativos bidireccionales conservan su pull/ACK actual.

## Diagnóstico

- Archivos y flujo investigados: `BackEnd/OfflineSync/signals.py` incluye `auditlog` en `PUSH_MODELS`; `run_sync.py` publica esos eventos exclusivamente local→nube; `views.py` lo omite de `PULL_MODELS`. Los Compose locales ejecutan backend y worker desde la misma imagen y las task definitions ECS de dev/producción contienen los entornos de backend de nube.
- Causa raíz: las señales se ejecutan tanto en nube como local y no tenían una noción explícita de runtime. Por eso la escritura de auditoría originada en nube tomaba el mismo camino PUSH-only previsto para el servidor local.
- Riesgos y compatibilidad: retirar `auditlog` de `PUSH_MODELS` eliminaría la auditoría centralizada requerida por ADR-023. La corrección debe ser aditiva, no alterar payloads ni `sync_uuid`, no duplicar auditoría local y no bloquear `PULL_MODELS`, ACK, claves naturales o colas existentes.
- Impactos de sync, migración, Docker o despliegue: OfflineSync y manifests Docker/ECS críticos; no hay migración. El rol se inyecta por entorno: valor seguro por defecto `cloud`, Compose local explícito `local`, task definitions ECS explícitas `cloud`. La publicación Docker Hub reutiliza la misma imagen y toma `local` desde Compose.

## Plan

- Gate de plan y aprobación del PO: obligatorio por OfflineSync y Docker. Aprobado explícitamente por el PO el 2026-09-02 al pedir implementar la dirección local→nube de AuditLog y dejar configurados automáticamente los despliegues de nube y Docker Hub.
- Alcance y exclusiones: se modifica solo el gate de captura de `auditlog` y los manifests que definen su runtime. Se excluyen migraciones, datos de negocio, borrado adicional de `SyncQueue`, cambios a `ALLOWED_HOSTS`, secretos, roles IAM y parámetros funcionales por tenant.
- Pasos ordenados:
  1. Añadir un helper de runtime en señales: `auditlog` se captura solo con `OFFLINE_SYNC_RUNTIME=local`; los demás modelos conservan la misma evaluación de sincronización vigente. Un valor ausente o inválido se comporta como `cloud`.
  2. Declarar `OFFLINE_SYNC_RUNTIME=local` en backend y worker de los Compose locales, incluido el artefacto cliente Docker Hub; declarar `OFFLINE_SYNC_RUNTIME=cloud` en las task definitions ECS de dev y producción.
  3. Añadir pruebas de rol local/cloud para `auditlog` y regresión de un modelo bidireccional, preservando deduplicación y `sync_uuid`.
  4. Validar sintaxis, manifests Compose y ticket. Publicar únicamente cuando el PO solicite commit/push; el pipeline dev despliega nube con rol `cloud` y la acción Docker Hub publica la misma imagen que el Compose local ejecuta con rol `local`.
- Rollback, backup, canario u orden de despliegue cuando aplique: antes del canario, respaldar verificablemente la base/volumen local autorizado. Desplegar primero nube con rol `cloud`, validar que editar una configuración no agrega `auditlog PENDING`; después publicar/actualizar el cliente local, validar que una operación local sí crea y entrega un `auditlog` por `sync_uuid`. Rollback: volver al commit/artefacto anterior sin borrar `SyncQueue`; los eventos locales pendientes permanecen reintentables.

## Criterios de aceptación

- [ ] POINT-001: una edición administrativa hecha en nube no deja filas `auditlog PENDING` en el schema del tenant; los eventos directos de configuración sí se descargan y reciben ACK.
- [ ] POINT-001: una operación hecha en el servidor local crea exactamente un evento `auditlog` PUSH-only y nube lo aplica idempotentemente por `sync_uuid`.
- [ ] POINT-001: `admpartner` y `admsetting` conservan su encolado cloud→local en ambos roles, sin duplicados ni impacto en otro tenant.
- [ ] Los manifiestos de cliente y ECS fijan el rol correcto sin que el operador deba editar variables manualmente al actualizar una versión.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "AuditLog creado en nube queda pendiente sin consumidor",
    "status": "verified",
    "severity": "high",
    "actual": "Las escrituras administrativas en nube generan AuditLog y la señal común lo agrega a SyncQueue como PENDING, aunque auditlog es PUSH-only.",
    "expected": "AuditLog se encola solo en runtime local para publicación idempotente a nube; nube no acumula eventos auditlog pendientes.",
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

- Archivos cambiados: `BackEnd/SaiOpenCloud/settings.py`, `BackEnd/OfflineSync/signals.py`, `BackEnd/OfflineSync/tests.py`, `BackEnd/taskdef-dev.json`, `BackEnd/taskdef.json`, `docker-compose.yml` y `docs/local/docker-compose.client.yml`.
- Decisiones técnicas: `OFFLINE_SYNC_RUNTIME` toma `cloud` como default seguro. El guard de señales permite capturar `auditlog` solo si el runtime es `local`; `PUSH_MODELS`, `sync_uuid`, el consumidor `run_sync` y todos los modelos administrativos permanecen sin cambios de contrato. Los manifests inyectan el rol, no la imagen, de modo que Docker Hub usa el mismo artefacto backend/worker para cualquier canal.
- Compatibilidad preservada: un runtime sin variable se comporta como nube y evita acumular auditoría sin consumidor; los Compose locales versionados declaran `local`, por lo que una instalación del cliente actualizada mantiene auditoría local→nube. No hay migración, cambio de payload, colisión de ID, ACK adicional ni datos eliminados por código.
- Commits atribuibles al ticket:
  - `30bcabc9ebe8fd18feae2d1833b9f8ceeb0233ca` — separa la captura de AuditLog por runtime, configura ECS/Compose y añade pruebas de rol local/cloud.

## Pruebas

- Comandos ejecutados: `python3 -m json.tool BackEnd/taskdef-dev.json`; `python3 -m json.tool BackEnd/taskdef.json`; `BackEnd/.venv/bin/python -m py_compile BackEnd/SaiOpenCloud/settings.py BackEnd/OfflineSync/signals.py BackEnd/OfflineSync/tests.py`; `docker compose ... config -q` para Compose raíz y cliente dev/production; inicialización aislada de Django con `OFFLINE_SYNC_RUNTIME=cloud` y `local` (ambas OK).
- Directorio de ejecución: raíz de SaiOpenCloud para las validaciones de manifests; servidor Windows para el canario de cliente.
- Resultado esperado: la edición de compañía o tercero en nube crea/ACK el evento de su modelo, pero no agrega `auditlog PENDING`; una operación local crea un `auditlog PENDING` y el worker lo completa en nube por `sync_uuid`.
- Validaciones manuales: tras desplegar nube, editar una configuración y consultar `dev.\"OfflineSync_syncqueue\"` unido a `dev.django_content_type`, esperando cero `auditlog PENDING`. Tras actualizar el cliente local, realizar una operación local y comprobar que su `auditlog` se publica una sola vez. Confirmar que los cambios de tercero/configuración siguen bajando al local.
- Requisitos de ambiente o datos: tenant no productivo `dev`, `is_offline_sync_enabled=true`, backend ECS con task definition nueva y cliente Windows con Compose versionado. No borrar cola durante el canario.
- Resultado comunicado por el PO: 2026-09-02, pruebas exitosas en el canario `dev`; la nube no acumula `auditlog PENDING`, la sincronización administrativa continúa y el PO solicitó cerrar el ticket.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-02",
    "build_reference": "commit:df3cc0672fb874430005eed0535890f542aa823d",
    "environment": "Canario dev: nube ECS y servidor local Docker",
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
    "po_confirmation": "PO confirmó pruebas exitosas y solicitó cierre el 2026-09-02."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-02",
    "kind": "verification",
    "description": "La inicialización aislada de Django confirmó cloud: auditlog no se captura y admpartner sí; local: ambos se capturan. JSON de task definitions, sintaxis Python y Compose raíz/cliente dev/production validaron correctamente.",
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
    "date": "2026-09-02",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirmó pruebas exitosas y solicitó cierre el 2026-09-02."
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
    "technical_summary": "El runtime cloud no encola AuditLog y el runtime local conserva su publicación idempotente hacia nube.",
    "functional_summary": "El PO validó que no quedan auditlog pendientes en nube y la sincronización funcional continúa.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "PO confirmó pruebas exitosas y solicitó cierre el 2026-09-02.",
    "release_impact": "El ticket queda cerrado funcionalmente y unreleased; la promoción a producción sigue el proceso independiente."
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
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-02",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-02",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-02",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-02",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-02",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
