---
schema_version: 1
id: SYNC-LOCAL-INSTALACION-20260827
title: Estandarizar despliegue local y diagnóstico de sincronización
type: SYNC
module: LOCAL
workflow_status: closed
qa_status: approved
release_status: released
user_visible: false
sync_impact: true
migration_impact: true
docker_impact: true
risk_level: high
created: 2026-08-27
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# SYNC-LOCAL-INSTALACION-20260827

## Solicitud original

Organizar la documentación y el flujo para instalar SaiOpenCloud desde cero en el servidor local del cliente, actualizar imágenes Docker Hub y diagnosticar los errores de sincronización. Revisar y aprovechar LocalTools/saisetup. El compose de la raíz no descargó imágenes; el compose antiguo sí descargó. El objetivo es llegar con un proceso claro y validable para la instalación del martes.

## Descripción funcional

- Alcance: unificar el artefacto Compose de cliente, la guía de instalación/actualización y la operación de SaiSetup para entornos locales Windows con WSL2. Diagnosticar, sin alterar datos remotos, los fallos observados de OfflineSync.
- Usuario o rol afectado: implementador de SaiOpenCloud y operador del servidor local del cliente.
- Comportamiento actual: el `docker-compose.yml` de la raíz se interpreta como archivo de despliegue aunque es un Compose de desarrollo con `build:`; el archivo de cliente que sí funciona fija tags antiguos. SaiSetup descarga una URL configurable pero no verifica que el Compose descargado use imágenes ni que corresponda a la versión esperada.
- Comportamiento esperado: un único Compose de cliente, versionado y apto para `docker compose pull`; guía breve y reproducible para instalación inicial, configuración de tenant, actualización y rollback; SaiSetup debe guiar esos mismos pasos y detectar un Compose no desplegable antes de continuar.

## Diagnóstico

- Archivos y flujo investigados: `docker-compose.yml` de raíz, el Compose adjunto de cliente, `docs/deploy/MANUAL_AMBIENTE_LOCAL_CLIENTE.md`, `docs/deploy/DEPLOY_CLIENTE_WINDOWS.md`, `LocalTools/saisetup/README.md`, `internal/server/server.go`, `internal/dockercli/dockercli.go`, `internal/cloudcheck/client.go` y `OfflineSync/management/commands/run_sync.py`.
- Causa raíz o hipótesis: el Compose raíz está diseñado para construir y montar el código local, por lo que `docker compose pull` solo descarga dependencias con `image:`. El Compose de cliente adjunto sí usa imágenes, pero fija `1.0.0`; el origen S3 consumido por SaiSetup no tiene validación de contenido/versión. El comando de diagnóstico falló porque `<tenant>` se dejó literal: el worker construye su destino real con el schema configurado. Los registros además muestran un 403 HTML previo a Django y una dependencia `resorder` ausente para un hijo de pedido; ambos requieren evidencia del tenant y del artefacto instalado antes de una corrección de cola.
- Riesgos y compatibilidad: cambiar Docker o OfflineSync exige gate humano; no se borrarán volúmenes, colas ni datos de tenant. Debe preservarse cloud-gana, claves naturales, idempotencia y los guards vigentes. No se introducirán secretos en archivos ni documentación.
- Impactos de sync, migración, Docker o despliegue: Sync y Docker afectados; sin migraciones previstas; no se autoriza despliegue productivo por este ticket.

## Plan

- Gate de plan y aprobación del PO: obligatorio antes de modificar, por impacto Docker, OfflineSync y migración. Aprobado explícitamente por el PO el 2026-08-27 en esta conversación ("s apruebo") para el alcance inicial y nuevamente para el ajuste de bootstrap cada 72 horas, estado persistente, migración, `REDIS_URL` del worker y diagnóstico seguro de `admsetting`.
- Alcance y exclusiones: se entregará el flujo local Windows/WSL2 y su herramienta SaiSetup; se excluirán cambios de infraestructura cloud, credenciales, `ALLOWED_HOSTS`, migraciones, borrados de cola y despliegue productivo.
- Pasos ordenados:
  1. Crear y versionar un Compose de cliente separado del Compose raíz, sin `build:` ni montajes de código, con imágenes por tag explícito o variable de versión. Mantener el Compose raíz como desarrollo local y documentar su propósito.
  2. Establecer el artefacto de cliente como fuente única para la URL que descarga SaiSetup; añadir comprobación previa que rechace `build:` o servicios sin imagen antes de `pull`, y mostrar las imágenes/tags resueltos en el asistente.
  3. Consolidar en `docs/local/` una guía operativa corta y segura: prerrequisitos Windows/WSL2, instalación nueva, obtención del schema real, comandos de diagnóstico de conectividad, actualización de tags, validación posterior y rollback al Compose/tag anterior. Enlazar la guía detallada existente sin duplicar secretos.
  4. Revisar/ajustar la documentación de SaiSetup y, si la herramienta requiere cambios, conservar escucha en `127.0.0.1`, no persistir tokens y verificar sus pruebas Go. Documentar cómo compilar y ejecutar el paquete Windows, además de su checklist de campo.
  5. Instrumentar de forma segura el diagnóstico de sync para distinguir respuesta HTTP del proxy/cloud, schema local y orden de dependencia padre-hijo, sin reintentos destructivos. Mantener el contrato actual y no modificar la nube hasta tener evidencia reproducible.
  6. Ejecutar pruebas unitarias/configuración de Compose y entregar un canario en un servidor de prueba: pull del nuevo tag, arranque, bootstrap de un tenant de prueba, sincronización incremental y revisión de logs. Solo tras confirmar el PO se podrá actualizar el entorno objetivo.
- Ajuste aprobado el 2026-08-27 por el PO: persistir por tenant la fecha del bootstrap completo mediante una migración tenant-scoped. El worker no disparará bootstrap al arrancar; la instalación lo hará explícitamente con `bootstrap_tenant_from_cloud` y ese comando registrará la marca. Después, `run_sync` hará reconciliación completa cada 72 horas; si falla, registrará el intento y aplicará enfriamiento para impedir bucles de reintento. Agregar `REDIS_URL` al `sync_worker` del Compose de cliente. Mantener sync incremental cada minuto, cloud-gana, claves naturales, guards de señales y no borrar SyncQueue. Diagnosticar el 403 de `admsetting` con metadatos seguros de respuesta sin registrar el payload sensible.
- Compatibilidad, orden de despliegue y rollback: publicar primero imágenes por tags inmutables compatibles; descargar el Compose nuevo; ejecutar `docker compose config`, `pull` y `up -d`; verificar servicios, tenant y sync antes de operar. Conservar copia del Compose anterior y tags previamente activos; si falla el canario, restaurar ese Compose y ejecutar `docker compose up -d` sin borrar volúmenes.

## Criterios de aceptación

- [ ] El Compose de cliente resuelto presenta `image:` para backend, frontend, websocket y sync_worker; `docker compose pull` descarga dichas imágenes y no intenta construir código.
- [ ] La guía distingue de forma visible el Compose raíz de desarrollo del artefacto del cliente, con comandos verificables de instalación, actualización, diagnóstico y rollback.
- [ ] SaiSetup consume el artefacto oficial y detiene el flujo con un mensaje accionable cuando el Compose descargado no es apto para pull.
- [ ] El instalador mantiene la escucha exclusiva de SaiSetup en `127.0.0.1`, no persiste secretos y sus pruebas Go relevantes pasan.
- [ ] Para un schema real validado, el diagnóstico de `sync_worker` identifica si el 403 procede de la capa cloud/proxy o de la aplicación; no se borran ni duplican elementos de SyncQueue.
- [ ] La dependencia `parent_missing` se conserva y solo se reprocesa después de verificar que el padre se sincronizó o de un bootstrap controlado.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Compose de cliente no es fuente oficial versionada",
    "status": "closed",
    "severity": "high",
    "actual": "El compose raíz de desarrollo usa build y el archivo cliente que logra pull fija imágenes antiguas; SaiSetup descarga una URL sin validar su contenido.",
    "expected": "Un artefacto Compose de cliente versionado usa solo images y es el origen verificado de instalación y actualización.",
    "evidence": [],
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
    "title": "Flujo de instalación y actualización local disperso",
    "status": "closed",
    "severity": "high",
    "actual": "La documentación mezcla Docker Desktop y WSL2, y el operador no tiene un recorrido único para instalar, validar, actualizar y revertir.",
    "expected": "Una guía operativa en docs/local y SaiSetup exponen el mismo proceso seguro y verificable.",
    "evidence": [],
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
    "id": "POINT-003",
    "title": "Fallos de sincronización sin diagnóstico reproducible",
    "status": "closed",
    "severity": "high",
    "actual": "Se registran 403 HTML al enviar configuración y un parent_missing de pedido; el comando inicial usó el marcador literal tenant.",
    "expected": "El proceso identifica el schema real, diferencia proxy/cloud de aplicación y conserva la cola hasta resolver el orden de dependencias.",
    "evidence": [],
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
    "id": "POINT-004",
    "title": "Bootstrap completo se repite al reiniciar el worker",
    "status": "closed",
    "severity": "high",
    "actual": "run_sync inicializa last_full_pull_times en memoria a cero; al arrancar ejecuta run_pull completo y lo repite cada hora. Tras apagar el equipo, vuelve a cero y repite el bootstrap al día siguiente.",
    "expected": "El arranque diario usa sincronización incremental; el bootstrap completo se ejecuta solo durante aprovisionamiento o una acción explícita y controlada.",
    "evidence": [
      "EVIDENCE-003",
      "EVIDENCE-004"
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

- Archivos cambiados: `docs/local/docker-compose.client.yml`, `docs/local/saiopen-client.env.example`, `docs/local/INSTALACION_Y_ACTUALIZACION.md`, documentación de despliegue y SaiSetup, `LocalTools/saisetup/internal/dockercli/dockercli.go`, `LocalTools/saisetup/internal/server/server.go`, `OfflineSync/models.py`, `OfflineSync/migrations/0002_syncruntimestate.py`, `run_sync.py` y `bootstrap_tenant_from_cloud.py`.
- Decisiones técnicas: se preserva el Compose raíz como entorno de desarrollo; el artefacto de cliente utiliza únicamente `image:` y fija el mismo tag en las cuatro imágenes para simplificar la operación de soporte. El nombre de base y el usuario local se fijan como `saiopencloud` y `postgres`; la contraseña sigue fuera del repositorio en `.env`. Se mantiene PostgreSQL 13 en el artefacto de cliente para no provocar una actualización mayor sobre volúmenes existentes. SaiSetup valida los cuatro servicios obligatorios y rechaza `build:` antes de ejecutar `pull` o una actualización.
- Compatibilidad preservada: no se tocan volúmenes, datos de tenant, SyncQueue, contratos de sincronización, `ALLOWED_HOSTS` ni credenciales. La marca de bootstrap es tenant-scoped, no viaja por SyncQueue y el comando explícito la actualiza solo después de una carga completa exitosa. SaiSetup continúa atendiendo en `127.0.0.1`.
- Commits atribuibles al ticket:
  - `e30ce12e1dca3ea1e25cca03630c5ddc13e83141` — estandariza Compose y operación local, valida SaiSetup y persiste la frecuencia de bootstrap.

## Pruebas

- Comandos para el PO:
  1. En el repositorio: `cd LocalTools/saisetup && go test ./... && GOOS=windows GOARCH=amd64 go build -o /tmp/saisetup.exe ./cmd/saisetup`.
  2. En el servidor de pruebas, dentro de la carpeta de trabajo: `docker compose config`, `docker compose pull`, `docker compose up -d`, `docker compose ps`, `docker compose images` y `docker compose logs sync_worker --tail=200`.
  3. Para sync: consultar el schema con `AdminClient.objects.filter(is_offline_sync_enabled=True)` y ejecutar el GET contra `https://SCHEMA_REAL.saiopen.cloud/api/sync/receive/` como está descrito en `docs/local/INSTALACION_Y_ACTUALIZACION.md`.
- Directorio de ejecución: `LocalTools/saisetup` para pruebas Go; carpeta de trabajo del servidor local para Compose/SaiSetup.
- Resultado esperado: las pruebas Go pasan; el build Windows termina sin error; el Compose muestra cuatro imágenes de Docker Hub, las descarga con `pull`, los seis servicios quedan `running` y el GET de diagnóstico devuelve `405` JSON desde gunicorn. La cola se conserva sin borrados.
- Validaciones manuales: instalación limpia en entorno de prueba, conectividad LAN, bootstrap de tenant de prueba, actualización cambiando solo `SAIOPEN_VERSION` y rollback restaurando Compose/.env sin eliminar volúmenes.
- Requisitos de ambiente o datos: Windows 10/11 o Windows Server 2022+, WSL2 con Docker Engine y Compose plugin, tenant de pruebas real y tags publicados conocidos. No registrar credenciales.
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
    "kind": "manual",
    "description": "Comparación local: docker-compose.yml raíz contiene build para los cuatro servicios; compose de cliente adjunto contiene image pero tags 1.0.0. El comando con el marcador literal tenant produjo NameResolutionError, no un error de Docker.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-08-27",
    "kind": "test",
    "description": "Validación local: go test ./... de SaiSetup pasó; build cruzado GOOS=windows GOARCH=amd64 completó; docker compose config del artefacto cliente resolvió las cuatro imágenes 1.0.0 sin build, mientras el Compose raíz mostró cuatro bloques build.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-08-27",
    "kind": "manual",
    "description": "Log de servidor de pruebas 2026-08-27: el worker procesa tenant dev, inicia descarga incremental y luego Full Bootstrap en el primer ciclo. Muestra 11 fallos: 403 HTML recurrente de admsetting y parent_missing de rescommand; también informa REDIS_URL no configurado durante el bootstrap.",
    "reference": null,
    "point_id": "POINT-004"
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-08-27",
    "kind": "test",
    "description": "Validación local del ajuste: py_compile de OfflineSync pasó; manage.py makemigrations OfflineSync --check --dry-run no detectó cambios; docker compose config del artefacto cliente incluye REDIS_URL para sync_worker.",
    "reference": null,
    "point_id": "POINT-004"
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
  },
  {
    "id": "RETEST-003",
    "date": "2026-09-16",
    "point_id": "POINT-003",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma que todos los puntos de este ticket fueron validados satisfactoriamente y autoriza su cierre."
  },
  {
    "id": "RETEST-004",
    "date": "2026-09-16",
    "point_id": "POINT-004",
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
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-08-27",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-27",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-27",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-27",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
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
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-08-27",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-08-27",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-08-27",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-08-27",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-08-27",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-08-27",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-16",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-004 para POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-037",
    "date": "2026-09-16",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-038",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-039",
    "date": "2026-09-16",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-040",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-041",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-042",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
