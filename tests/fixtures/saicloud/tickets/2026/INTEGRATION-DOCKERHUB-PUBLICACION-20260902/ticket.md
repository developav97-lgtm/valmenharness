---
schema_version: 1
id: INTEGRATION-DOCKERHUB-PUBLICACION-20260902
title: Publicar imágenes de cliente desde GitHub Actions
type: INTEGRATION
module: DOCKERHUB
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: true
risk_level: high
created: 2026-09-02
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# INTEGRATION-DOCKERHUB-PUBLICACION-20260902

## Solicitud original

Implementar publicación manual y versionada de imágenes Docker Hub desde GitHub Actions para los artefactos locales de cliente. Separar tags dev y producción, asociar las imágenes de producción con el tag Git de la release, mantener compose de cliente diferenciado por ambiente y documentar el proceso en docs/local.

## Descripción funcional

- Alcance: publicación de imágenes para el servidor local de cliente (backend, sync-worker, frontend y websocket), manifiestos Compose por canal y documentación de uso. No cambia las imágenes ni los pipelines AWS/ECR existentes.
- Usuario o rol afectado: equipo de soporte y desarrollo que prepara o actualiza el servidor Docker local del cliente.
- Comportamiento actual: un Mac Apple Silicon compila bajo emulación AMD64 y publica manualmente; backend y sync-worker se reconstruyen por separado y no existe una convención inmutable que separe pruebas de producción.
- Comportamiento esperado: GitHub Actions construye en runner Linux AMD64 y publica tags inmutables. Los tags de dev se asocian al SHA de `dev`; los de producción se asocian al tag Git `vMAJOR.MINOR.PATCH` creado sobre `production` después del gate de release.

## Diagnóstico

- Archivos y flujo investigados: `docs/deploy/DEPLOY_DOCKERHUB.md` usa cuatro `docker buildx build --platform linux/amd64` desde Mac. `docs/local/docker-compose.client.yml` consume cuatro tags fijos de Docker Hub. `BackEnd/Dockerfile` sirve tanto Gunicorn como `run_sync`; `FrontEnd/Dockerfile` y `WebSocket/Dockerfile` son independientes. No existe workflow bajo `.github/workflows/`.
- Causa raíz o hipótesis: la emulación QEMU de AMD64 sobre M1 vuelve lenta la compilación; compilar el mismo Dockerfile dos veces duplica el trabajo. Los tags actuales no expresan canal, versión Git ni trazabilidad de origen.
- Riesgos y compatibilidad: un tag mutable o un Compose no fijado puede actualizar clientes sin control. El workflow debe publicar por SHA/tag inmutable, no incluir credenciales, y conservar la posibilidad de volver a un tag anterior sin tocar volúmenes, PostgreSQL, Redis ni `SyncQueue`. Los manifests nuevos no reemplazarán silenciosamente el Compose actual hasta el canario.
- Impactos de sync, migración, Docker o despliegue: impacto Docker y distribución de artefactos locales; no hay migraciones ni modificación de contratos OfflineSync. La publicación de producción seguirá dependiendo del tag Git creado únicamente tras la aprobación literal de release; este ticket no crea tags, despliega ni publica una imagen durante la implementación.

## Plan

- Gate de plan y aprobación del PO: obligatorio por Docker e integración CI. Aprobado explícitamente por el PO el 2026-09-02 para crear el workflow, manifests y documentación operativa de este plan; no autoriza tags de producción, publicación real ni despliegue productivo.
- Extensión material aprobada explícitamente por el PO el 2026-09-02: cambiar en GitHub la rama predeterminada de `main` a `dev` para hacer visible y ejecutable el workflow manual desde Actions. Impacto conocido: los nuevos PRs y enlaces de GitHub usarán `dev` por defecto. No se modifica el contenido, protección, historial, nombre ni existencia de ninguna rama. Rollback: restaurar `main` como rama predeterminada desde la configuración del repositorio.
- Extensión material aprobada explícitamente por el PO el 2026-09-02: añadir `docs/local/ACTUALIZAR_CLIENTE_DEV.bat` para que soporte abra el archivo con doble clic, pegue un SHA corto dev y actualice el servidor local sin editar `.env` ni ejecutar Compose manualmente. El script validará siete caracteres hexadecimales en minúscula, descargará primero las imágenes, respaldará `.env` con fecha y hora, actualizará solo `SAICLOUD_IMAGE_VERSION`, ejecutará `up -d` y mostrará `ps`. No ejecutará migraciones, `down`, `down -v`, limpieza de volúmenes ni publicación de imágenes. Canario: Windows `dev` con un tag inmutable ya publicado. Rollback: ejecutar el mismo script con el SHA previo o restaurar el respaldo creado; los volúmenes, PostgreSQL, Redis y `SyncQueue` permanecen intactos.
- Alcance y exclusiones: se implementa un workflow de GitHub Actions y manifiestos/documentación bajo `docs/local/`. Se excluyen cambios a AWS/ECR, task definitions, `ALLOWED_HOSTS`, secretos, Docker Hub real, tags Git y despliegues. Las credenciales expuestas históricamente en documentación requieren un ticket SECURITY separado para su revocación y saneamiento.
- Pasos ordenados:
  1. Crear `.github/workflows/publish-client-images.yml` con ejecución manual para `dev` y ejecución por tags `v*.*.*` de producción. El workflow validará la referencia fuente: `dev` solo desde la rama `dev`; producción solo desde un tag SemVer `vMAJOR.MINOR.PATCH` cuyo commit pertenezca a `production` según la política de release.
  2. Autenticar Docker Hub exclusivamente con secretos de GitHub preconfigurados (sin valores en repositorio), construir en runner Linux AMD64 y usar caché GitHub Actions por componente. Construir backend una vez y publicar en el mismo build los dos tags equivalentes: `backend-<canal>-<identificador>` y `sync-worker-<canal>-<identificador>`.
  3. Publicar frontend y websocket en jobs independientes. Convención inmutable: dev usa `<componente>-dev-<sha-corto>`; producción usa `<componente>-vMAJOR.MINOR.PATCH`. Los punteros opcionales `*-dev-latest` solo podrán servir de referencia humana y nunca se usarán en Compose de cliente.
  4. Mantener `docs/local/docker-compose.client.yml` como compatibilidad y añadir manifiestos explícitos `docker-compose.client.dev.yml` y `docker-compose.client.production.yml`, ambos con tags requeridos por variables y sin secretos. Añadir ejemplos de variables no sensibles y un manual en `docs/local/` para seleccionar, verificar y actualizar una versión inmutable.
  5. Añadir validación estática YAML, comprobar que los cuatro tags se forman correctamente en ambos canales, ejecutar builds locales dirigidos cuando proceda y revisar el workflow con `actionlint` si está disponible. La prueba de publicación real queda para un dispatch dev autorizado posterior, usando un SHA de `dev` y un servidor Windows canario.
  6. Añadir un actualizador interactivo exclusivo para el canal dev y documentar su uso. Debe detenerse antes de alterar `.env` si el formato es inválido, Docker/Compose no está disponible o el `pull` falla; después de un `pull` exitoso conserva un respaldo único y aplica el mismo override Compose existente.
- Rollback, backup, canario u orden de despliegue cuando aplique: no se borran artefactos ni se sobrescriben tags de producción. Antes del canario se conserva el tag actualmente usado por cada servicio y se verifica backup de los volúmenes del servidor Windows. Canario: publicar un SHA de `dev`, actualizar solo el manifiesto dev del servidor de prueba y ejecutar `docker compose pull` seguido de `docker compose up -d`; validar backend, worker, frontend y websocket. Rollback: restaurar las cuatro referencias exactas previas y ejecutar `docker compose up -d`, sin `down -v`, sin borrar PostgreSQL/Redis ni cola de sincronización. Después de pruebas dev aprobadas, la primera producción se publica únicamente con `APROBAR DEPLOY vX.Y.Z`, tag Git y manifest production con esa misma versión.

## Criterios de aceptación

- [ ] Un dispatch dev construye en Linux AMD64, publica cuatro tags inmutables ligados al SHA de `dev` y evita recompilar backend para sync-worker.
- [ ] Un tag Git válido `vMAJOR.MINOR.PATCH` de producción publica cuatro imágenes con esa misma versión y no publica desde una rama no autorizada.
- [ ] Ningún secreto de Docker Hub se guarda en workflow, manifests, ejemplos ni manuales.
- [ ] Los manifests dev y producción fijan tags inmutables, mantienen nombres, puertos, variables y volúmenes de los servicios existentes y no usan `latest`.
- [ ] El manual de `docs/local/` permite a soporte actualizar y revertir un cliente sin tocar sus volúmenes ni inferir tags.
- [ ] POINT-001: con doble clic en Windows, el script solicita un SHA dev válido, actualiza solo `SAICLOUD_IMAGE_VERSION` tras descargar los cuatro artefactos y muestra el estado de los servicios; una versión inválida o un `pull` fallido deja `.env` intacto.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Actualización interactiva del cliente dev en Windows",
    "status": "verified",
    "severity": "normal",
    "actual": "Actualizar una versión dev exige editar manualmente el archivo .env y ejecutar varios comandos Compose en Windows.",
    "expected": "Un archivo .bat abierto con doble clic solicita un SHA corto dev, valida y actualiza el cliente sin borrar volúmenes ni requerir comandos manuales.",
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

- Archivos cambiados: `.github/workflows/publish-client-images.yml`, `docs/local/docker-compose.client.dev.yml`, `docs/local/docker-compose.client.production.yml`, ejemplos `.env` por canal, `docs/local/MANUAL_IMAGENES_CLIENTE.md` y `docs/local/ACTUALIZAR_CLIENTE_DEV.bat`.
- Decisiones técnicas: GitHub Actions publica sobre runner Ubuntu `linux/amd64`; backend y sync-worker salen de un único build con dos tags. Dev solo permite `dev` y publica `<componente>-dev-<sha-corto>`; producción exige tag `vMAJOR.MINOR.PATCH`, resuelve su commit y verifica pertenencia a `production` antes de publicar `<componente>-vMAJOR.MINOR.PATCH`.
- Compatibilidad preservada: el Compose base, puertos, redes, volúmenes, base PostgreSQL y Redis se conservan. Los overrides solo sustituyen tags de imágenes y nunca usan `latest`; no se toca AWS/ECR, `SyncQueue`, task definitions ni credenciales reales. El actualizador dev valida la entrada con PowerShell, hace `pull` antes de editar `.env`, conserva un respaldo fechado y no ejecuta migraciones ni comandos destructivos.
- Commits atribuibles al ticket:
  - `b6925324d3cafcb11b20b9287eb85b9418e19e3e` — workflow de publicación Docker Hub, manifests dev/producción, ejemplos y manual de actualización/rollback.
  - `eb4c70f42619e230fcebb7899c7c9457411386f5` — registro documental del commit funcional y de su trazabilidad en el ticket.

## Pruebas

- Comandos para el PO: lanzar `Publicar imágenes de cliente en Docker Hub` desde GitHub Actions sobre `dev`; después, en el servidor canario, abrir `ACTUALIZAR_CLIENTE_DEV.bat` con doble clic e ingresar el SHA corto publicado.
- Directorio de ejecución: raíz del repositorio para validaciones del workflow; directorio de artefacto local del cliente en Windows para canario.
- Resultado esperado: imágenes AMD64 publicadas con tags inmutables por canal y cliente actualizado de forma reversible. Antes de publication real, las validaciones locales confirman que el workflow es YAML válido y que ambos Compose renderizan los cuatro tags exactos esperados.
- Validaciones manuales: comprobar que los secretos `DOCKERHUB_USERNAME` y `DOCKERHUB_TOKEN` están configurados en GitHub; inspeccionar los cuatro tags publicados, probar un SHA válido y uno inválido en el actualizador, levantar dev canario, verificar la sincronización local↔nube y confirmar que production no se modifica durante el ciclo dev.
- Requisitos de ambiente o datos: repositorio GitHub con permisos de Actions, secretos de Docker Hub configurados por un administrador, tenant no productivo `dev`, servidor Windows canario y tags/imágenes previas identificados por el PO.
- Resultado comunicado por el PO: el 2026-09-03 revisó los escenarios en sucesión y confirma que están bien.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-03",
    "build_reference": "commit:b6925324d3cafcb11b20b9287eb85b9418e19e3e",
    "environment": "GitHub Actions, Docker Hub y Windows canario",
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
    "kind": "workflow_run",
    "description": "GitHub Actions completó la publicación dev correctamente para el commit 93c74491e4fd490e3d333a85394ffdfa2e9ee563. Se verificaron en Docker Hub backend, sync-worker, frontend y websocket con el sufijo dev-93c7449.",
    "reference": "commit:93c74491e4fd490e3d333a85394ffdfa2e9ee563",
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-02",
    "kind": "static_check",
    "description": "Se verificó estáticamente el actualizador interactivo: valida Docker, Compose, PowerShell y SHA dev; ejecuta pull antes de editar .env y no contiene comandos down, down -v ni migraciones.",
    "reference": "worktree:sha256:1c7b619c7d0286706b873d33113316b68d82fb0c17bc5fb76a7d5160700bf8cd",
    "point_id": "POINT-001"
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
    "technical_summary": "La publicación de imágenes AMD64 y la actualización interactiva dev de Windows fueron verificadas por el PO.",
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
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
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
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
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
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-03",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-03",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-03",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
