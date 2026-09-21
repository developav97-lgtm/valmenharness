---
schema_version: 1
id: SYNC-OFFLINESYNC-COLA-20260902
title: Corrige fallos de cola POS y asignaciones de usuario
type: SYNC
module: OFFLINESYNC
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: true
migration_impact: false
docker_impact: false
risk_level: critical
created: 2026-09-02
updated: 2026-09-07
related_ticket: SYNC-OFFLINESYNC-REGRESIONES-20260901
target_release: 6.2.4
released_in: 6.2.4
---

# SYNC-OFFLINESYNC-COLA-20260902

## Solicitud original

Corregir eventos FAILED observados en el tenant dev: la sincronización del grafo PosOrder falla al procesar PosOrderSubLine con una FK inexistente, y admuserbranch puede llegar sin claves naturales. Publicar una corrección compatible y reintentar exclusivamente los eventos afectados tras validación.

## Descripción funcional

- Alcance: corregir el receptor cloud del grafo `PosOrder` y asegurar que el emisor local de `AdmUserBranch` complete sus claves naturales al reintentar eventos históricos. El reintento en Windows quedará limitado a los IDs 935, 944 y 1355 después de instalar la imagen compatible.
- Usuario o rol afectado: operación POS del tenant `dev` con OfflineSync local y usuarios/sucursales configurados entre local y nube.
- Comportamiento actual: dos eventos de `posorder` quedan `FAILED` al intentar asignar a `PosOrderSubLine` la FK inexistente `id_posorder_id`; el evento `admuserbranch` queda `FAILED` si el snapshot histórico no contiene `username` y `branch.code`. Los eventos hijos de la factura se conservan pendientes detrás del padre.
- Comportamiento esperado: la nube asocia cada sublínea con su `PosOrderLine` equivalente dentro del mismo grafo, el emisor reconstruye las claves naturales para los reintentos y únicamente los tres eventos señalados se reintentan de manera controlada, sin duplicados.

## Diagnóstico

- Archivos y flujo investigados: `BackEnd/OfflineSync/management/commands/run_sync.py` agrupa el grafo de una factura y añade las sublíneas por `id_posorderline`; `BackEnd/OfflineSync/views.py` recibe el grafo y usaba `_safe_upsert_line(..., 'id_posorder_id', ...)` también para `PosOrderSubLine`; `BackEnd/ModPos/models/orders.py` confirma que `PosOrderSubLine` solo posee `id_posorderline`. El emisor ya tiene enriquecimiento de `admuserbranch` en `send_sync_item`, pero debe validar que exista antes de publicar/reintentar snapshots históricos.
- Causa raíz o hipótesis: el receptor trató por igual a todos los hijos de `PosOrder`, ignorando que una sublínea depende de una línea y no del encabezado. El evento `admuserbranch` rechazado proviene de un snapshot sin lookups y requiere que el worker recargue usuario/sucursal del objeto local antes de reintentarlo.
- Riesgos y compatibilidad: los IDs de línea son locales y no son identidad portable. La corrección debe mapear la línea local contra la línea cloud creada durante el mismo grafo, conservando cloud-gana para colisiones y upsert idempotente. Se mantiene compatibilidad con payloads anteriores que no lleven un lookup explícito de sublínea. No se borran ni resetean colas, ni se cambian señales, migraciones, Docker, `ALLOWED_HOSTS` o credenciales.
- Impactos de sync, migración, Docker o despliegue: OfflineSync crítico, sin migración. Orden de despliegue: publicar primero nube compatible, después actualizar el worker local. Canario: tenant `dev`, preservando los eventos `FAILED`; rollback: restaurar las imágenes/commit anteriores sin eliminar `SyncQueue`, que conserva sus eventos para un reintento posterior.

## Plan

- Gate de plan y aprobación del PO: obligatorio por OfflineSync. Aprobado explícitamente por el PO el 2026-09-02 al autorizar la corrección y publicación de un nuevo tag de desarrollo para los errores 935, 944 y 1355.
- Alcance y exclusiones: se modifica solo el contrato POS graph y el enriquecimiento/reintento seguro de `admuserbranch`; se excluyen restablecimientos masivos, limpieza de colas, cambios a datos de otros tenants, migraciones y despliegue de producción.
- Pasos ordenados:
  1. En el receptor `SyncReceiveView`, preservar el ID local de cada línea POS únicamente como clave transitoria del lote, aplicar el upsert seguro de la línea y construir un mapa local→cloud. Aplicar cada `PosOrderSubLine` mediante `id_posorderline_id` resuelto desde ese mapa; si no puede resolverse, responder con error explícito y revertir la transacción sin marcar eventos hijos como completados.
  2. En `run_sync`, incluir para cada sublínea un lookup estable de su línea (posición/atributos de la línea dentro del mismo grafo) compatible con workers ya desplegados y asegurar que `admuserbranch` recargue `username` y `branch.code` al enviar/reintentar. Si la relación local ya no existe, no fabricar una identidad ni borrar el evento automáticamente.
  3. Añadir pruebas de regresión de `SYNC_GRAPH` con IDs local/cloud distintos, segunda entrega del mismo grafo sin duplicados, y reintento de `admuserbranch` desde snapshot sin lookups que el worker puede enriquecer.
  4. Ejecutar pruebas Django dirigidas y publicar una imagen dev únicamente cuando el PO solicite explícitamente commit/push. En Windows, verificar el tag nuevo y reintentar solo las tres filas tras comprobar sus datos y el tenant `dev`.
- Rollback, backup, canario u orden de despliegue cuando aplique: tomar respaldo verificable del volumen/base de datos del canario antes de actualizar la imagen. Desplegar el backend cloud compatible y después el worker local; comprobar primero el evento POS, luego usuario-sucursal. Rollback: volver a los tags previos sin `down -v`, sin borrar PostgreSQL/Redis ni `SyncQueue`; los eventos continúan disponibles para reintento.

## Criterios de aceptación

- [ ] POINT-001: un grafo PosOrder con líneas y sublíneas se aplica en nube cuando los IDs locales de líneas difieren; una segunda entrega no duplica encabezado, líneas ni sublíneas.
- [ ] POINT-001: si una sublínea no puede asociarse a una línea del mismo lote, el lote se revierte y el error identifica la relación faltante sin completar hijos.
- [ ] POINT-002: `admuserbranch` se publica y reintenta usando `username` y código de sucursal; IDs locales distintos no provocan el error de clave natural faltante.
- [ ] El canario `dev` procesa únicamente los eventos 935, 944 y 1355 tras verificar el payload, sin reset masivo ni afectación de otro tenant.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Sublineas POS bloquean la sincronización de factura",
    "status": "verified",
    "severity": "critical",
    "actual": "Los eventos posorder 935 y 944 fallan al aplicar PosOrderSubLine con el campo inexistente id_posorder_id, dejando pendientes sus líneas, pagos, impuestos y sublíneas.",
    "expected": "El grafo PosOrder debe resolver cada sublínea contra la línea POS creada o actualizada en nube, sin depender de IDs locales ni duplicar datos tras reintentos.",
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
    "title": "Asignación usuario-sucursal llega sin claves naturales",
    "status": "verified",
    "severity": "high",
    "actual": "El evento admuserbranch 1355 es rechazado con Missing user or branch natural key.",
    "expected": "Cada evento admuserbranch debe transportar username y código de sucursal para que nube aplique el upsert o la baja de forma idempotente pese a IDs distintos.",
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

- Archivos cambiados: `BackEnd/OfflineSync/views.py`, `BackEnd/OfflineSync/management/commands/run_sync.py`, `BackEnd/OfflineSync/signals.py` y `BackEnd/OfflineSync/tests.py`.
- Decisiones técnicas: el receptor construye un mapa transitorio ID de línea local→ID de línea cloud dentro de cada `SYNC_GRAPH`; las sublíneas usan exclusivamente `id_posorderline_id`. El worker ordena de forma determinista los eventos hijos y anexa una posición de origen por línea para que sublíneas idénticas no se dupliquen al reintentar. `admuserbranch` no requiere otra modificación: el worker ya reconstruye `_user_lookup` y `_branch_lookup` al reenviar; el evento 1355 fue marcado `FAILED` antes de ese reintento y debe volver a `PENDING` de forma selectiva una vez actualizado el worker.
- Compatibilidad preservada: un worker anterior puede seguir enviando sublíneas sin `_source_position`; el receptor usa el primer candidato equivalente como fallback. Ningún ID local se guarda como identidad cloud, la transacción revierte si falta la línea padre y no se alteran señales, migraciones ni la cola fuera de los eventos aprobados.
- Commits atribuibles al ticket:
  - `d862e20cbb0212ffd1d505105690cdca99409a4c` — corrige el enlace e idempotencia de sublíneas POS y añade su prueba de regresión.
  - `2a32f22a576b79ef9ce0bd8552cfbc1f511ec059` — conserva claves naturales al borrar asignaciones usuario–sucursal para que el worker pueda eliminarlas en nube.

## Pruebas

- Comandos para el PO: tras instalar la imagen dev entregada, usar el procedimiento selectivo indicado en la entrega para verificar el payload y reencolar únicamente 935, 944 y 1355; después ejecutar `docker compose --env-file .env -f docker-compose.client.yml -f docker-compose.client.dev.yml exec sync-worker python manage.py run_sync`.
- Directorio de ejecución: directorio de instalación del cliente en Windows, por ejemplo `C:\\SaicloudServer`.
- Resultado esperado: los tres eventos dejan de mostrar `FAILED`; la factura 13 y sus hijos quedan `COMPLETED` una vez, y la relación usuario-sucursal se aplica usando usuario/sucursal por clave natural.
- Validaciones manuales: en nube, comprobar que factura 13 conserva una sola cabecera, las líneas esperadas y cada sublínea asociada a su línea POS; verificar también la asignación del usuario a la sucursal. Ejecutar una segunda sincronización y confirmar que no aparecen duplicados.
- Requisitos de ambiente o datos: tenant `dev`, respaldo verificable previo del volumen/base del canario, imágenes cloud y worker con esta corrección desplegadas antes de reencolar. No usar `reset_sync_items`, `down -v` ni operaciones masivas de cola.
- Resultado comunicado por el PO: el 2026-09-03 revisó los escenarios en sucesión y confirma que están bien.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-03",
    "build_reference": "commit:2a32f22a576b79ef9ce0bd8552cfbc1f511ec059",
    "environment": "Windows canario y tenant dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-03",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-02",
    "kind": "source_diagnosis",
    "description": "El modelo PosOrderSubLine solo expone id_posorderline; SyncReceiveView intentaba usar id_posorder_id y el worker agrupaba las sublíneas por línea local.",
    "reference": "worktree:sha256:42bea503611294de14df6360fdccd101aa53e486b1c4affc1061dec502ef5c8c",
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-02",
    "kind": "runtime_log",
    "description": "El worker informó el evento FAILED 1355 con Missing user or branch natural key; el emisor vigente ya reconstruye los lookups antes de un nuevo envío.",
    "reference": "worktree:sha256:766e9175d68e1353771d929e8097f4a921b71694f3949d525dca4f778acf8e20",
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-02",
    "kind": "static_check",
    "description": "La compilación Python de views.py, run_sync.py y tests.py completó sin errores; la suite Django dirigida se canceló al depender de una base PostgreSQL remota durante la inicialización del esquema de pruebas.",
    "reference": "worktree:sha256:0b50914c0ed3208aae0defe10ec7c72c64cb6a4684be3b07ef47b19c3619ae50",
    "point_id": null
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-09-02",
    "kind": "workflow_run",
    "description": "GitHub Actions publicó correctamente las cuatro imágenes dev AMD64 para e45cb251ca0bcb3a8b97bf60f99d467ea2499f95.",
    "reference": "commit:e45cb251ca0bcb3a8b97bf60f99d467ea2499f95",
    "point_id": null
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-09-02",
    "kind": "workflow_run",
    "description": "GitHub Actions publicó correctamente backend, sync-worker, frontend y websocket dev para 2e97f040995ecd6adfed2811fb6016121690e4c0.",
    "reference": "commit:2e97f040995ecd6adfed2811fb6016121690e4c0",
    "point_id": null
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-09-03",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-002",
    "date": "2026-09-03",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
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
    "date": "2026-09-03",
    "technical_summary": "El enlace de sublíneas POS y las claves naturales de usuario-sucursal fueron validados por el PO.",
    "functional_summary": "PO confirma tras revisar los escenarios en sucesión que los resultados son correctos.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "PO confirma tras revisar los escenarios en sucesión que los resultados son correctos.",
    "release_impact": "El ticket permanece unreleased; no se autoriza promoción ni despliegue de producción."
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
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
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
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-02",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-02",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-02",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-02",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-02",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-03",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-03",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-03",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
