---
schema_version: 1
id: IMPROVEMENT-DEPLOY-MIGRACIONES-PARALELAS-20260916
title: Automatizar migraciones paralelas en el despliegue
type: IMPROVEMENT
module: DEPLOY
workflow_status: closed
qa_status: approved
release_status: released
user_visible: false
sync_impact: false
migration_impact: true
docker_impact: false
risk_level: high
created: 2026-09-16
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# IMPROVEMENT-DEPLOY-MIGRACIONES-PARALELAS-20260916

## Solicitud original

Integrar la ejecución automática y paralela de las migraciones tenant en el flujo de despliegue, para que el PO solo apruebe la release. El proceso debe iniciar tras construir la imagen backend y ejecutarse en paralelo con el pipeline independiente del frontend, sin requerir que el PO ejecute manage.py manualmente.

## Descripción funcional

- Alcance: automatizar la migración de `public` y de todos los schemas tenant dentro del pipeline de producción; la tarea de migración debe usar la imagen backend recién construida y esperar su resultado antes de permitir el despliegue backend.
- Usuario o rol afectado: PO y equipo de operación de releases.
- Comportamiento actual: después del tag, el PO ejecuta manualmente `manage.py migrate`; el pipeline productivo `saiopencloud-back-next` conserva etapas secuenciales de backend, ECS y frontend.
- Comportamiento esperado: un tag aprobado inicia un runner único de ECS para migraciones; tras completar `public`, procesa tenants concurrentemente y entrega estado, logs y fallo explícito al pipeline. La compilación del frontend ocurre mientras migran los tenants. La publicación del frontend espera a que las migraciones y el backend terminen correctamente.

## Diagnóstico

- Archivos y flujo investigados: `buildspec-next.yml` construye y publica la imagen backend. La consulta de solo lectura a CodePipeline Ohio del 2026-09-16 confirmó `Source -> Build backend -> Deploy ECS -> DeployFrontend`; el CodeBuild frontend vigente compila y publica S3 en una sola acción. El servicio ECS productivo ejecuta dos tareas EC2 y usa la revisión 49 de la task definition, con `512 MiB` para el contenedor backend. `django-tenants 3.10.1` incluye el executor `multiprocessing`, con concurrencia predeterminada de dos procesos. `production` está en `e664f9b9c3aaf74e079f76fbe53f544f7a5fc4d6` (v6.2.4) y `dev` en `957a0bc763ca8e61792c5e68919757a6cab654da`; `v6.2.5` aún no existe localmente. El diff contiene cinco migraciones tenant aditivas (`ModAdmin/0050` a `0054`) y una migración shared (`SuperAdmin/0003`).
- Causa raíz o hipótesis: las migraciones se ejecutan fuera del pipeline y de forma serial/manual; además, el orden actual no deja solaparlas con el frontend.
- Riesgos y compatibilidad: no se puede correr un `migrate` dentro de cada task de servicio ni lanzar varios runners, porque competirían entre sí. El runner debe ser único, esperar finalización y registrar logs. Las migraciones que se ejecuten antes del backend deben ser expand/contract y compatibles con el código anterior; una migración no compatible exige una fase posterior aprobada y no puede solaparse con tráfico de la versión previa. El frontend no se publica hasta que el backend nuevo esté saludable. El CodeBuild backend actual usa una imagen mutable `:latest` para `imagedefinitions.json`; el runner y el despliegue deben referir el mismo digest inmutable de la release, conservando la imagen para rollback. La revisión ECS productiva limita el contenedor a 512 MiB, por lo que el runner con multiprocessing necesita memoria propia probada. La consulta IAM mostró que el rol CodeBuild vigente carece de permisos ECS para crear/ejecutar/consultar el runner; requieren ajuste de política de mínimo privilegio. La instancia RDS `saicloud-ohio` tiene backup automatizado de siete días y snapshot disponible del 2026-09-16; existencia no equivale a prueba de restauración.
- Impactos de sync, migración, Docker o despliegue: afecta migraciones y el flujo de release/ECS. No altera OfflineSync, SincSaiCloud, Dockerfile, datos de negocio ni `ALLOWED_HOSTS`.

## Plan

- Gate de plan: aprobado explícitamente por el PO el 2026-09-16 en esta conversación (`listo si apruebo`), después de presentar el orden corregido de migración, compilación frontend, deploy backend y publicación frontend. La aprobación cubre la implementación del plan; no autoriza tag ni deploy productivo.
- Pasos ordenados:
  1. Confirmar con personal AWS autorizado la definición ECS productiva, capacidad libre EC2, roles de ejecución y de tarea, y ajustar permisos mínimos del CodeBuild/pipeline para registrar/iniciar/esperar un runner; no se inventan permisos ni capacidad. Registrar el digest de la imagen de release y su retención para rollback.
  2. Incorporar una task definition de migración de uso único, equivalente al runtime backend y con comando explícito. El runner ejecutará primero `migrate_schemas --shared --noinput`, y después `migrate_schemas --tenant --executor=multiprocessing --noinput`; ambos comandos deben terminar con `--check` y devolver error no cero ante fallo.
  3. Parametrizar en settings la concurrencia de tenants exclusivamente por variable de entorno, con valor productivo inicial de dos procesos y sin aumentar a cuatro hasta que el canario pruebe CPU, memoria, conexiones RDS, locks y duración real. Nunca ejecutar más de un runner por release.
  4. Separar el CodeBuild frontend vigente en compilación (produce artefacto sin publicar) y publicación S3/CloudFront. Reordenar CodePipeline: `Source -> Build backend -> {migrar, compilar frontend} -> Deploy ECS backend -> publicar frontend`. El deploy ECS de backend queda bloqueado por el éxito del runner; la publicación frontend espera al backend saludable. El release falla de forma visible ante cualquier error.
  5. Añadir una verificación previa de migraciones y una salida de logs/identificador de task al pipeline. Para releases con migraciones no backward-compatible, el pipeline debe detenerse hasta que exista un plan expand/contract aprobado; no se automatiza un DDL riesgoso de forma ciega.
  6. Probar primero en `dev` con un tenant canario y una copia/backup verificable. Medir tiempo serial frente a dos procesos, conexiones RDS, locks, `migrate --check`, health check backend y flujo funcional del tenant. Promover a producción solo con el canario confirmado por el PO.
- Rollback, backup, canario u orden de despliegue cuando aplique: antes de cada release con migración, confirmar backup restaurable. Un fallo del runner bloquea el deploy de backend y requiere investigar o restaurar según el procedimiento aprobado; no usar `--fake` ni reversión automática. El rollback de aplicación vuelve al artefacto backend anterior solo cuando el DDL nuevo es compatible; una reversión de esquema requiere procedimiento específico, backup y aprobación del PO.

## Criterios de aceptación

- [ ] Un tag aprobado no requiere que el PO ejecute `manage.py` manualmente: el pipeline registra un único runner de migraciones y su resultado.
- [ ] El runner aplica `public` una sola vez y tenants con dos procesos concurrentes; no ejecuta dos migradores sobre el mismo schema.
- [ ] La compilación frontend se solapa con el runner; la publicación frontend espera a que el backend nuevo esté saludable, y el deploy backend no ocurre si el runner o su verificación final fallan.
- [ ] El runner usa la imagen exacta construida por el release y el runtime ECS autorizado para llegar a RDS; no depende del portátil del PO.
- [ ] Un canario en dev demuestra que no quedan migraciones pendientes, que el backend queda saludable y que la duración/conexiones RDS están dentro de los límites acordados.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[]
```

## Implementación

- Archivos cambiados: `BackEnd/SaiOpenCloud/settings.py`, `BackEnd/migrate_release.py`, `BackEnd/test_migrate_release.py`, `scripts/ci/run_release_migrations.py`, `scripts/ci/test_run_release_migrations.py`, `scripts/ci/configure_release_pipeline.py`, `buildspec-next.yml`, `buildspec-migrations-next.yml`, `buildspec-front-compile-next.yml`, `buildspec-front-publish-next.yml`, `docs/aws/manual-despliegue.md`.
- Decisiones técnicas: runner ECS único derivado de la task definition backend, lock advisory de PostgreSQL, migración `public` antes de tenants, executor multiprocessing con dos procesos y dos verificaciones `--check`; el pipeline mantiene la publicación frontend después de backend saludable. El script de configuración AWS opera en dry-run por defecto y exige `--apply` explícito.
- Compatibilidad preservada: la configuración de concurrencia solo afecta el executor de migraciones; la aplicación web conserva dos workers. La imagen backend se entrega al pipeline por digest ECR; se conserva el tag `latest` para compatibilidad operativa, sin usarlo como identidad del release.
- Commits atribuibles al ticket:
  - `5ecb6bda7ec611400c0338b0b8032df92d4c2906` — commit funcional: runner de migraciones con lock advisory, scripts CI, buildspecs de migración/compilación/publicación y digest inmutable en imagedefinitions.
  - `bcf052e65bd5582a8c0cd524daece2c2a703743e` — fix de build: digest vía `docker image inspect` (el rol CodeBuild carece de `ecr:DescribeImages`) y parametrización del runner por entorno para el canario dev.

## Pruebas

- Comandos para el PO: `BackEnd/.venv/bin/python -m unittest -v test_migrate_release` desde `BackEnd`; `PYTHONPATH=BackEnd BackEnd/.venv/bin/python -m unittest discover -s scripts/ci -p 'test_*.py' -v` desde la raíz; `BackEnd/.venv/bin/python scripts/ci/configure_release_pipeline.py --profile migracion` para dry-run AWS.
- Directorio de ejecución: raíz del repositorio para pruebas estáticas y dry-run; runner ECS de dev para el canario.
- Resultado esperado: las suites dirigidas pasan 6/6; el dry-run imprime la creación de tres proyectos CodeBuild, las políticas necesarias y el flujo nuevo sin cambiar AWS. Tras aplicar y publicar en dev, el pipeline expone el resultado de migración y bloquea el backend en caso de error; `--check` termina correctamente para `public` y tenants.
- Validaciones manuales: confirmar backup verificable, consultar estado del runner/logs, comprobar tareas ECS saludables y ejecutar una operación no destructiva en el tenant canario.
- Requisitos de ambiente o datos: evidencia vigente de configuración ECS/CodePipeline, backup restaurable y tenant no productivo representativo. El dry-run validó la cuenta AWS de Ohio, pipeline V2, servicio ECS activo y capacidad EC2 suficiente para una tarea adicional de 1536 MiB; la política de backup automatizado de RDS conserva siete días.
- Resultado comunicado por el PO: el PO confirmó el 2026-09-17 como válidas las pruebas dirigidas (test_migrate_release 3/3 OK, test_run_release_migrations 3/3 OK, reejecutadas en esta sesión con el mismo resultado) y el dry-run AWS registrado el 2026-09-16. Autorizó el commit y push selectivo a `dev` y eligió el canario como runner ECS manual en el cluster dev, sin parametrizar el pipeline de dev.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-17",
    "build_reference": "commit:5ecb6bda7ec611400c0338b0b8032df92d4c2906",
    "environment": "dev (cluster saiopencloud-back-dev-ohio)",
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
    "po_confirmation": "PO confirmo pruebas y autorizo commit+push a dev y canario manual acotado el 2026-09-17. QA-001: suites 6/6 OK, pipeline dev verde con digest (fix bcf052e6), canario schema dev exit 0, servicio dev saludable HTTP 200."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-16",
    "kind": "automated",
    "description": "Pruebas dirigidas 2026-09-16: unittest BackEnd/test_migrate_release.py 3/3 OK y scripts/ci/test_run_release_migrations.py 3/3 OK; py_compile de scripts y settings OK.",
    "reference": "worktree:sha256:f810bbdd2b9e66b6bc4713dfeefb0ec91ba47ec1bbfb8c068c982cf623431333",
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-16",
    "kind": "dry-run",
    "description": "Dry-run AWS 2026-09-16: pipeline saiopencloud-back-next V2 inspeccionada; etapa actual Source/Build/Deploy/DeployFrontend; servicio ECS activo con 2 tareas; proyectos nuevos y permisos propuestos calculados sin aplicar cambios. Flujo propuesto Source -> Build -> (RunMigrations || CompileFrontend) -> Deploy -> PublishFrontend.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-16",
    "kind": "review",
    "description": "Revisión final 2026-09-16: rutas atribuibles al ticket revisadas; no se detectaron secretos nuevos, schemas codificados, ejecución doble del migrador ni uso de --fake. Se verificaron py_compile, suites dirigidas y dry-run AWS sin mutaciones.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-09-16",
    "kind": "infrastructure-readonly",
    "description": "Consulta AWS de solo lectura 2026-09-16: entorno dev usa cluster saiopencloud-back-dev-ohio, servicio saiopencloud-back-dev-ohio-svc y CodePipeline saiopencloud-back-dev-ohio; se confirma que el canario requiere parametrización separada del pipeline productivo. No se modificó AWS.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-09-17",
    "kind": "canary",
    "description": "Canario 2026-09-17 aprobado por PO con alcance acotado al schema dev (base compartida dev/prod detectada y confirmada con task definitions). Tarea ECS unica c2135c0f en cluster saiopencloud-back-dev-ohio con imagen inmutable @sha256:7f857809: migrate_schemas --schema=dev reporto 'No migrations to apply' (la base ya tiene las migraciones de v6.2.5) y --check termino en exit 0. Servicio dev en steady state 1/1 y ping HTTP 200. Hallazgo de build: CodeBuild sin ecr:DescribeImages; corregido en bcf052e6 leyendo RepoDigests tras el push, pipeline dev posterior Succeeded con deploy anclado a digest.",
    "reference": "commit:bcf052e65bd5582a8c0cd524daece2c2a703743e",
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

- Cierre técnico y funcional: runner ECS único con lock advisory que migra `public` y tenants (2 procesos) y verifica con `--check`; pipeline reordenado con migraciones y compilación frontend en paralelo; deploy bloqueado ante fallo; imagedefinitions por digest inmutable.
- Resultado comunicado por el PO: pruebas 6/6 confirmadas, commit+push a dev autorizado y canario acotado al schema dev aprobado el 2026-09-17; canario exit 0 ("No migrations to apply", `--check` limpio, servicio dev saludable, ping HTTP 200).
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica): QA aprobada (QA-001/QA-002) con confirmación del PO registrada.
- Riesgo residual e impacto de release: antes del tag v6.2.5 se requiere merge `dev` → `production`, aplicar `configure_release_pipeline.py` (3 CodeBuild + políticas IAM mínimas + reorden de pipeline) y confirmar capacidad EC2 productiva para el runner de 1536 MiB. Las migraciones de la release ya están aplicadas en la base compartida; el runner productivo actuará como verificación. Hallazgo registrado: dev y prod comparten la misma base PostgreSQL — futuros canarios deben acotarse con `--schema` como este.
- Texto visible al usuario cuando aplique: no aplica (cambio de infraestructura de despliegue, sin interfaz de usuario).

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-17",
    "technical_summary": "Runner ECS unico derivado de la task definition backend (imagen por digest ECR) con lock advisory PostgreSQL; migra public, luego tenants con multiprocessing (2 procesos por env) y verifica con --check. Pipeline reordenado Source -> Build -> (RunMigrations || CompileFrontend) -> Deploy -> PublishFrontend; el fallo del runner bloquea el deploy. Digest via RepoDigests tras el push (sin permisos IAM extra). Script de configuracion AWS en dry-run por defecto.",
    "functional_summary": "El tag de release ya no requiere manage.py manual: el pipeline ejecuta las migraciones con la imagen exacta de la release y bloquea el despliegue ante cualquier fallo. Validado con canario acotado al schema dev (base compartida): 'No migrations to apply', --check en exit 0, servicio dev saludable y ping HTTP 200.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "PO confirmo pruebas (6/6), autorizo commit+push a dev y aprobo el canario acotado el 2026-09-17",
    "release_impact": "v6.2.5 requiere antes del tag: merge dev -> production, apply de configure_release_pipeline.py (3 CodeBuild + politicas IAM minimas + reorden de pipeline) y verificacion de capacidad EC2 productiva para el runner de 1536 MiB. Las migraciones de la release ya estan aplicadas en la base compartida, por lo que el runner productivo actuara como verificacion."
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
    "date": "2026-09-16",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-16",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-16",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-16",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-16",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-17",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-17",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-17",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-17",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
