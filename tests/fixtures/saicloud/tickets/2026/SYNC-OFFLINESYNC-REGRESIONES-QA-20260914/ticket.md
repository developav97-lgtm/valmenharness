---
schema_version: 1
id: SYNC-OFFLINESYNC-REGRESIONES-QA-20260914
title: Validar regresiones QA de OfflineSync y arranque local con Docker
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
created: 2026-09-14
updated: 2026-09-17
related_ticket: SYNC-OFFLINESYNC-REGRESIONES-20260901
target_release: 6.2.5
released_in: 6.2.5
---

# SYNC-OFFLINESYNC-REGRESIONES-QA-20260914

## Solicitud original

Después de las revisiones de QA se reportan los siguientes puntos relacionados con la ejecución de la sucursal local con Docker y se solicita crear un ticket nuevo para verificarlos:

**Pruebas base de datos local**

1. Al ingresar a Terceros, no está borrando el tercero en la base nube cuando se borra en la local.
2. Al ingresar a Formas de Pago, no está llegando la sucursal asignada.
3. Al entrar a las pestañas de tráfico de comandas no se muestran las comandas ni se carga el reporte de comandas.
4. Verificar la carga de las comandas de local a nube al momento en el que se factura.

**Base de datos local sin internet**

5. Al ingresar a Terceros, no está borrando el tercero en la base nube cuando se borra en la local.
6. Al ingresar a Consecutivos, se presenta error al eliminar.
7. Al entrar a las pestañas de tráfico de comandas no se muestran las comandas ni se carga el reporte de comandas.
8. Al ingresar a Creación de cajas, las cajas no llegan con las sucursales configuradas.
9. Al ingresar a Generar QR, sincroniza a la nube, pero no baja a SAI Cloud.

**Base de datos nube**

10. Al ingresar a Productos, cuando se crea el producto desde SaiOpen no baja a la base local.
11. Al ingresar a Terceros, cuando se crea el tercero desde SAI no baja a la base local.
12. Al ingresar a Formas de Pago, no bajan las formas de pago; validar que bajen también cuando se migran de SAI.
13. Entradas y salidas de dinero no se deben permitir desde la nube cuando la sucursal tiene configurado el parámetro del servidor local.
14. Al ingresar a Generar QR, al bajar el tercero quedan dobles las direcciones de envío.

También se necesita validar cómo hacer que, al iniciar el computador, Docker y los servicios del sistema local arranquen automáticamente.

## Descripción funcional

- Alcance: verificar quince hallazgos del nuevo ciclo de QA en una sucursal Docker local: cuatro escenarios con conexión, cinco escenarios locales sin internet, cinco escenarios originados en nube/SAI y el arranque automático del stack después de reiniciar Windows. La corrección se limitará a las causas reproducidas y a sus pruebas de regresión.
- Usuario o rol afectado: administradores que configuran terceros, formas de pago, consecutivos y cajas; operadores de POS/restaurante que facturan, consultan comandas o realizan movimientos de dinero; y soporte que instala el servidor local.
- Comportamiento actual: QA informa divergencias local↔nube, relaciones de sucursal ausentes, pantallas/reportes sin datos, operaciones cloud indebidamente habilitadas y duplicación de direcciones. No hay evidencia E2E vigente del arranque automático después de reiniciar el computador.
- Comportamiento esperado: los dos extremos convergen por claves naturales y sin duplicados, el runtime local conserva la operación permitida sin internet, la nube bloquea las mutaciones reservadas al servidor local y el stack Docker se recupera automáticamente de un reinicio mediante un procedimiento instalable y reversible.

## Diagnóstico

- Archivos y flujo investigados preliminarmente: `BackEnd/OfflineSync/signals.py`, `views.py`, `management/commands/run_sync.py` y `bootstrap_tenant_from_cloud.py`; modelos y serializers de terceros, formas de pago, consecutivos, cajas y productos en `BackEnd/ModAdmin/` y `BackEnd/ModPos/`; comandas/facturación en `BackEnd/ModRestaurant/`; bloqueo cloud por sucursal en `BackEnd/ModAdmin/services/branch_operational_access.py`; consumidores Angular de consecutivos, Generar QR, Tráfico de comandas y Reporte de Comandas; `docs/local/docker-compose.client.yml`, `docs/deploy/DEPLOY_CLIENTE_AUTOSTART_WSL.bat`, `docs/deploy/DEPLOY_CLIENTE_WINDOWS.md` y `LocalTools/saisetup/`.
- Antecedente: `SYNC-OFFLINESYNC-REGRESIONES-20260901` corrigió y cerró una ronda anterior relacionada, aprobada por QA y publicada en `6.2.4`. Al tratarse de hallazgos posteriores a una release, este ticket nuevo conserva la relación sin reabrir ni sobrescribir el historial anterior.
- Causas confirmadas en sincronización: `SyncReceiveView` interceptaba `AdmPartner` sin respetar `DELETE`; los CREATE/UPDATE/DELETE incrementales dependían de PK cloud/local en varios modelos; los snapshots genéricos no incluían la relación M2M de sucursales de `AdmPayment`; y `products_sinc_sai`, `partners_sinc_sai` y `payments_sinc_sai` deshabilitaban señales durante la mutación sin registrar después el objeto para el pull local.
- Causas confirmadas en relaciones: consecutivos, cajas, niveles, productos y direcciones necesitaban resolver sucursal, catálogos y padres por códigos, identificación o nombre. En direcciones provenientes de SAI existían IDs opcionales hardcodeados, valores numéricos vacíos y `create()` directo cuando un reintento aún llegaba con `id=0`; esa combinación podía fallar o duplicar la dirección.
- Causas confirmadas en comandas/UI: `ApiGeneralService.CheckDominio()` cambiaba siempre a nube aunque el frontend estuviera servido por Docker local, por lo que tráfico y reporte podían dejar de consultar la API local sin internet. El backend de tráfico y el CSV sí devolvieron datos en las pruebas dirigidas; sus pruebas de rango necesitaban consumir correctamente `StreamingHttpResponse`. La suite completa descubrió además que el reintento de una sublínea de factura reasignaba el PK local y generaba un segundo registro.
- Arranque local: el script WSL2 existente creaba la tarea como `SYSTEM`, aunque las distros WSL pertenecen al usuario; no reiniciaba WSL después de habilitar systemd, reemplazaba la tarea sin backup, no conservaba el overlay Compose y el Compose de cliente no declaraba política `restart`. Estas condiciones se corrigieron de forma instalable y reversible. La ejecución real después de reiniciar Windows sigue siendo un gate de canario, no sustituible por revisión estática en macOS.
- Riesgos y compatibilidad: una baja mal resuelta puede borrar otra entidad; un ACK anticipado puede perder eventos; un reintento puede duplicar direcciones; una relación incompleta puede cruzar sucursales; y cambiar la inicialización de Windows/WSL2 puede dejar el servicio indisponible. Se preservarán cloud-gana, aislamiento por tenant, natural keys, compatibilidad con workers previos, `disable_sync_signals`, `skip_sync_queue`, volúmenes y cola.
- Impactos de sync, migración, Docker o despliegue: impacto crítico en OfflineSync y LocalAgents/operación local, con impacto Docker. No se prevé migración al crear el ticket; si la reproducción exige esquema, Compose, imágenes o contrato nuevo, se actualizará el plan y se renovará el gate antes de modificar.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-09-14 mediante la confirmación “Sí, dale”, para ejecutar el plan de `POINT-001` a `POINT-015`. La aprobación autoriza diagnóstico e implementación en el checkout; no autoriza operar un host de cliente, publicar imágenes, hacer push ni desplegar.
- Alcance y exclusiones: se reproducirán y corregirán únicamente `POINT-001` a `POINT-015`. No se usarán tenants productivos como datos de prueba, no se borrarán volúmenes ni `SyncQueue`, no se modificarán credenciales o `ALLOWED_HOSTS`, y no se asumirá la distro WSL, ruta, versión instalada, imagen o tag del equipo reportado.
- Pasos ordenados:
  1. Preparar una matriz reproducible por punto con tenant no productivo autorizado, sucursal con `is_offline_sync_enabled` y `local_server_enabled` conocidos, versión/tag/commit de nube y local, sistema operativo, distro WSL2 y datos descartables. Capturar de forma segura petición, respuesta, `SyncQueue`, ACK, logs y estado antes/después, sin payloads sensibles.
  2. Reproducir con conexión `POINT-001` a `POINT-004`: baja de tercero, sucursal de forma de pago, consultas de tráfico/reporte y secuencia `ResOrder` → `ResCommand` → factura. Verificar identidades y relaciones en ambos schemas después de cada ACK y reintento.
  3. Reproducir sin internet `POINT-005` a `POINT-009`: desconectar antes de mutar/consultar, comprobar la operación exclusivamente local y la cola pendiente, reiniciar si aplica, reconectar y verificar publicación/descarga una sola vez. Separar fallos de API, IndexedDB, filtros UI y sincronización.
  4. Reproducir desde nube/SAI `POINT-010` a `POINT-014`: identificar si el origen es SaiOpen/Firebird, API cloud o migración; seguir producto, tercero, forma de pago y direcciones durante pull/ACK; y comprobar que entradas/salidas de dinero reciben HTTP 409 en nube para la sucursal local sin bloquear su publicación por OfflineSync.
  5. Trazar los modelos reproducidos en `PULL_MODELS`, `PUSH_MODELS`, serializers, señales, M2M y grafo padre/hijos. Corregir por causa confirmada con upserts idempotentes, listas completas de relaciones y `.set()` también para vacío; nunca usar el ID local como identidad de negocio. Si el flujo pertenece al cliente legacy SincSaiCloud, confirmar repositorio e instalación antes de proponer cambios fuera de este checkout.
  6. Añadir pruebas backend, frontend e integración para alta, edición, baja, operación offline, reconexión, ACK posterior, colisión de IDs, relación de sucursal, orden de comandas/factura, bloqueo cloud y ausencia de duplicados. Mantener pantallas funcionales en Angular.
  7. Para `POINT-015`, validar primero el script WSL2 existente en Windows 10/11 o Windows Server 2022+ autorizado: creación idempotente de la tarea, arranque de WSL/Docker, `docker compose up -d`, estado saludable tras reinicio y acceso LAN esperado. Ajustar script, instalador o documentación solo si la evidencia lo exige; SaiSetup y cualquier agente local conservan escucha exclusiva en `127.0.0.1`.
  8. Ejecutar canario con respaldo verificable de Compose, `.env` y base del tenant de prueba. Publicar primero la nube compatible y después el artefacto local; validar una ventana con conexión, desconexión/reconexión y reinicio de Windows antes de entregar al PO.
- Rollback, backup, canario u orden de despliegue: volver a los tags/Compose y tarea programada previamente registrados, sin `docker compose down -v`, sin borrar PostgreSQL/Redis ni reprocesar manualmente la cola. Si el canario falla, detener el worker nuevo, restaurar el artefacto previo y conservar eventos pendientes para reintento con el contrato cloud compatible.

## Criterios de aceptación

- [ ] `POINT-001` y `POINT-005`: la baja local del tercero converge en nube por clave natural, tanto en línea como después de reconectar, sin borrar otro tercero ni emitir duplicados.
- [ ] `POINT-002`, `POINT-008` y `POINT-012`: formas de pago y cajas conservan exactamente sus sucursales; las formas migradas desde SAI siguen el mismo contrato.
- [ ] `POINT-003`, `POINT-004` y `POINT-007`: comandas y líneas quedan vinculadas a su orden/factura y aparecen en tráfico y reporte con y sin internet, según los datos locales disponibles.
- [ ] `POINT-006`: eliminar un consecutivo sin internet produce el resultado funcional permitido y un mensaje accionable, sin corrupción de referencias.
- [ ] `POINT-009` a `POINT-011` y `POINT-014`: productos y terceros originados en nube/SAI/QR bajan al tenant local correcto; cada tercero conserva una única dirección principal y no duplica direcciones al reintentar.
- [ ] `POINT-013`: entradas y salidas de dinero devuelven bloqueo 409 desde nube para una sucursal con servidor local, pero el servidor local puede operar y publicar esos movimientos.
- [ ] Todos los flujos respetan tenant y sucursal, cloud-gana, ACK posterior a aplicar, compatibilidad con el worker anterior y ausencia de duplicados tras dos reintentos.
- [ ] `POINT-015`: después de un reinicio completo del Windows autorizado, WSL2, Docker Engine y los seis servicios del Compose quedan activos sin intervención; existe evidencia de consulta/ejecución de la tarea y un rollback probado que no elimina volúmenes.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Eliminación local de tercero no se refleja en nube con conexión",
    "status": "closed",
    "severity": "high",
    "actual": "Al borrar un tercero en la base local con conexión, el registro no se elimina en la base nube.",
    "expected": "La eliminación local autorizada se publica una sola vez y elimina o inactiva la contraparte correcta en nube por su clave natural.",
    "evidence": [
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
  },
  {
    "id": "POINT-002",
    "title": "Formas de pago llegan sin la sucursal asignada",
    "status": "closed",
    "severity": "high",
    "actual": "Al consultar Formas de Pago en la base local, no llega la sucursal asignada.",
    "expected": "La descarga conserva exactamente las sucursales configuradas para cada forma de pago, sin ampliar ni perder relaciones.",
    "evidence": [
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
  },
  {
    "id": "POINT-003",
    "title": "Tráfico y reporte de comandas no cargan con conexión",
    "status": "closed",
    "severity": "high",
    "actual": "En las pestañas de tráfico de comandas no se muestran las comandas y el reporte de comandas no carga.",
    "expected": "Las vistas de tráfico y el reporte cargan las comandas del tenant y sucursal correctos después de sincronizar.",
    "evidence": [
      "EVIDENCE-005"
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
    "id": "POINT-004",
    "title": "Comandas facturadas no se verifican de local a nube",
    "status": "closed",
    "severity": "critical",
    "actual": "No está confirmado que las comandas creadas localmente se carguen a nube en el momento de facturar.",
    "expected": "Al facturar, la orden padre, sus comandas y la factura se publican en orden, quedan relacionadas y no se duplican tras reintentos.",
    "evidence": [
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
  },
  {
    "id": "POINT-005",
    "title": "Eliminación local de tercero no converge tras operar sin internet",
    "status": "closed",
    "severity": "high",
    "actual": "Al borrar un tercero en la base local mientras no hay internet, la eliminación no se refleja en nube.",
    "expected": "La baja queda aplicada y encolada localmente; al reconectar se publica una sola vez y converge en nube por clave natural.",
    "evidence": [
      "EVIDENCE-007"
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
    "id": "POINT-006",
    "title": "Error al eliminar consecutivos sin internet",
    "status": "closed",
    "severity": "high",
    "actual": "En la base local sin internet, la pantalla de Consecutivos presenta un error al eliminar.",
    "expected": "La eliminación permitida se aplica o se rechaza con una regla funcional clara, sin depender de internet ni dejar datos inconsistentes.",
    "evidence": [
      "EVIDENCE-008"
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
    "id": "POINT-007",
    "title": "Tráfico y reporte de comandas no cargan sin internet",
    "status": "closed",
    "severity": "high",
    "actual": "Sin internet, las pestañas de tráfico de comandas no muestran las comandas y el reporte no carga.",
    "expected": "El runtime local consulta los datos disponibles localmente y muestra tráfico y reporte sin depender de la nube.",
    "evidence": [
      "EVIDENCE-009"
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
    "id": "POINT-008",
    "title": "Cajas llegan sin las sucursales configuradas",
    "status": "closed",
    "severity": "high",
    "actual": "En Creación de cajas de la base local, las cajas no llegan con las sucursales configuradas.",
    "expected": "Cada caja descargada conserva la relación exacta con sus sucursales y referencias dependientes.",
    "evidence": [
      "EVIDENCE-010"
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
    "id": "POINT-009",
    "title": "Generar QR sincroniza a nube pero no retorna al entorno local",
    "status": "closed",
    "severity": "high",
    "actual": "El flujo Generar QR sincroniza a la nube, pero el resultado no baja al entorno SAI Cloud local.",
    "expected": "El dato generado por QR se aplica en nube y retorna al entorno local autorizado mediante un pull idempotente y con ACK posterior.",
    "evidence": [
      "EVIDENCE-011"
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
    "id": "POINT-010",
    "title": "Productos creados desde SaiOpen no bajan a la base local",
    "status": "closed",
    "severity": "high",
    "actual": "Un producto creado desde SaiOpen queda en nube pero no se descarga a la base local.",
    "expected": "El producto y sus dependencias se descargan a la base local por claves naturales, sin duplicados ni referencias faltantes.",
    "evidence": [
      "EVIDENCE-012"
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
    "id": "POINT-011",
    "title": "Terceros creados desde SAI no bajan a la base local",
    "status": "closed",
    "severity": "high",
    "actual": "Un tercero creado desde SAI queda en nube pero no se descarga a la base local.",
    "expected": "El tercero y sus datos dependientes se descargan al tenant local correcto, sin duplicados.",
    "evidence": [
      "EVIDENCE-013"
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
    "id": "POINT-012",
    "title": "Formas de pago de nube o migradas desde SAI no bajan a local",
    "status": "closed",
    "severity": "high",
    "actual": "Las formas de pago creadas en nube no bajan a local y tampoco está validada su descarga cuando se migran desde SAI.",
    "expected": "Las formas de pago, incluidas las migradas desde SAI, bajan a local con sus sucursales y relaciones exactas.",
    "evidence": [
      "EVIDENCE-014"
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
    "id": "POINT-013",
    "title": "Nube permite entradas y salidas de dinero en sucursal con servidor local",
    "status": "closed",
    "severity": "critical",
    "actual": "La nube permite realizar entradas y salidas de dinero aunque la sucursal tiene configurado el parámetro de servidor local.",
    "expected": "La nube bloquea esas mutaciones operativas para la sucursal local, mientras OfflineSync conserva la publicación desde el servidor local.",
    "evidence": [
      "EVIDENCE-015"
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
    "id": "POINT-014",
    "title": "Generar QR duplica direcciones de envío al bajar el tercero",
    "status": "closed",
    "severity": "high",
    "actual": "Al bajar el tercero generado mediante QR quedan duplicadas las direcciones de envío.",
    "expected": "El pull hace upsert por la clave natural de la dirección y conserva una única dirección principal sin duplicados tras reintentos.",
    "evidence": [
      "EVIDENCE-016",
      "EVIDENCE-018"
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
    "id": "POINT-015",
    "title": "Docker y servicios locales no tienen arranque automático validado",
    "status": "closed",
    "severity": "high",
    "actual": "No existe evidencia en este ciclo de que Docker y los servicios de SaiOpenCloud arranquen automáticamente al iniciar el computador.",
    "expected": "En el sistema operativo objetivo, Docker y el stack local arrancan de forma controlada, verificable y recuperable, sin exponer servicios fuera de lo permitido.",
    "evidence": [
      "EVIDENCE-017"
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
  - Contrato OfflineSync: `BackEnd/OfflineSync/natural_keys.py`, `views.py`, `signals.py`, `management/commands/run_sync.py`, `management/commands/bootstrap_tenant_from_cloud.py` y `tests.py`.
  - Entradas SAI y guarda operacional: `BackEnd/ModAdmin/views/functions.py` y `BackEnd/ModAdmin/tests/test_branch_operational_access.py`.
  - Comandas/reporte: `BackEnd/ModRestaurant/tests/test_report_commands_date_range.py`.
  - Frontend local: `FrontEnd/src/app/Services/General/api-general.service.ts`, `FrontEnd/src/app/common/utils/deployment-target.util.ts` y su spec.
  - Docker/instalación: `docs/local/docker-compose.client.yml`, `docs/deploy/DEPLOY_CLIENTE_AUTOSTART_WSL.bat`, `docs/deploy/DEPLOY_CLIENTE_AUTOSTART_WSL_ROLLBACK.bat`, `docs/deploy/DEPLOY_CLIENTE_WINDOWS.md` y la validación de Compose en `LocalTools/saisetup/internal/dockercli/`.
- Decisiones técnicas:
  - Se centralizaron las claves naturales y se agregaron metadatos portables para sucursal, tercero, país, departamento, ciudad, forma de pago, categoría e impuestos; los IDs se conservan solo como fallback compatible, no como identidad cuando existe la clave de negocio.
  - `AdmPayment` transmite la lista completa de códigos de sucursal y aplica `.set()`, incluida la lista vacía. Las mutaciones originadas desde SAI registran explícitamente el objeto final después de liberar `disable_sync_signals`.
  - Los reintentos de productos, terceros, direcciones y sublíneas actualizan el registro existente sin reasignar el PK local. Una dirección SAI con `id=0` hace upsert por tercero + dirección + teléfono y mantiene una sola principal.
  - El frontend resuelve una sola vez el destino local/cloud de forma coherente para `localhost`, `{tenant}.localhost` e IP LAN. El bloqueo IPOS/EPOS se validó en la ruta HTTP cloud antes de cualquier mutación.
  - Los seis servicios del Compose usan `restart: unless-stopped`; el instalador valida distro/ruta/overlay, reinicia WSL para activar systemd, usa la cuenta propietaria de WSL y respalda la tarea previa. El rollback no ejecuta `down` ni elimina volúmenes.
- Compatibilidad preservada: el receptor acepta payloads anteriores sin metadatos y conserva fallback por PK cuando no existe colisión; los payloads nuevos usan claves naturales. No hay migraciones, cambios de `ALLOWED_HOSTS`, credenciales, imágenes publicadas, operaciones sobre hosts ni cambios de volúmenes/colas.
- Commits atribuibles al ticket:
  - `60380e8b2d26e0f7df9ad47793f5a3f43f63c073`: corrige regresiones OfflineSync, contrato cloud↔local, cliente Angular local, arranque Docker/WSL y su evidencia de pruebas.
  - `529b6453a85bd53e4627b594a02bfe6821f49cdd`: documenta la implementación, pruebas y evidencia inicial del ticket.

## Pruebas

- Pruebas automatizadas ejecutadas:
  1. Desde la raíz, con PostgreSQL local descartable: `DB_HOST= DB_USER=juanandrade DB_PASSWORD= DB_NAME=codex_offlinesync_20260914 BackEnd/.venv/bin/python BackEnd/manage.py test OfflineSync ModAdmin.tests.test_views_functions.PartnersSincSaiViewTest ModAdmin.tests.test_views_functions.ProductsSincSaiViewTest ModAdmin.tests.test_branch_operational_access ModRestaurant.tests.test_get_commands_raw_state ModRestaurant.tests.test_report_commands_date_range ModRestaurant.tests.test_split_order.SplitOrderTest.test_split_registers_sync_queue --verbosity 1 --noinput` — 68 pruebas, `OK`.
  2. Desde la raíz: `DB_HOST= DB_USER=juanandrade DB_PASSWORD= DB_NAME=codex_offlinesync_20260914 BackEnd/.venv/bin/python BackEnd/manage.py makemigrations --check --dry-run`, `DB_HOST= DB_USER=juanandrade DB_PASSWORD= DB_NAME=codex_offlinesync_20260914 BackEnd/.venv/bin/python BackEnd/manage.py check` y `BackEnd/.venv/bin/python -m compileall -q BackEnd/OfflineSync BackEnd/ModAdmin BackEnd/ModPos BackEnd/ModRestaurant` — sin migraciones, errores del sistema ni errores de compilación.
  3. Desde `FrontEnd/`: `npm test -- FrontSaiOpenCloud --watch=false --browsers=ChromeHeadless --include=src/app/common/utils/deployment-target.util.spec.ts --include=src/app/administration/consecutives/consecutives/adm-consecutives.component.spec.ts` — 13 pruebas, `TOTAL: 13 SUCCESS`.
  4. Desde `FrontEnd/`: `npm run build -- --configuration development` — build exitoso.
  5. Desde `LocalTools/saisetup/`: `go test ./...` — paquetes con pruebas en estado `ok`.
  6. Desde la raíz: `POSTGRES_PASSWORD=compose-validation-only docker compose -f docs/local/docker-compose.client.yml config --format json | jq -e '(.services | length == 6) and ([.services[].restart] | all(. == "unless-stopped"))'` — `true`.
  7. Validación estática del instalador/rollback: reinicio de WSL, `docker compose config`, backup de la tarea, ejecución con el usuario propietario de WSL, ausencia de `/ru SYSTEM` y rollback sin tocar contenedores ni volúmenes. También pasaron `git diff --check` y `python3 tools/agentic/ticket.py validate --id SYNC-OFFLINESYNC-REGRESIONES-QA-20260914`.
- Pruebas manuales pendientes del PO/canario:
  8. En el Windows canario, después de confirmar distro y ruta: ejecutar como administrador `docs\deploy\DEPLOY_CLIENTE_AUTOSTART_WSL.bat`; luego `schtasks /Query /TN "SaiOpenCloud - Iniciar stack" /V /FO LIST`, `schtasks /Run /TN "SaiOpenCloud - Iniciar stack"` y, para la instalación documentada por defecto, `wsl -d Ubuntu -- bash -lc "cd /mnt/c/SaicloudServer && docker compose ps"`.
- Directorio de ejecución: raíz del repositorio para Django/Compose; `FrontEnd/` para Angular; `LocalTools/saisetup/` para Go; carpeta autorizada del servidor Windows para el canario.
- Resultado esperado: cada punto converge sin duplicados ni ACK prematuro; el bloqueo cloud no afecta OfflineSync; Compose resuelve seis servicios y el reinicio deja todos los contenedores esperados activos.
- Validaciones manuales: repetir la matriz QA exactamente en los tres contextos, inspeccionar ambos extremos y filtros de tenant/sucursal, desconectar y reconectar WAN, reintentar dos veces, facturar una orden con comandas y reiniciar Windows por completo.
- Requisitos de ambiente o datos: tenant no productivo autorizado, sucursal marcada para servidor local, usuario con permisos, productos/terceros/formas/cajas/consecutivos descartables, Windows 10/11 o Server 2022+ con WSL2 y Docker Engine, y tags/Compose efectivamente instalados aportados por el PO o soporte.
- Resultado comunicado por el PO: el 2026-09-16 el PO confirmó que probó la incidencia por su parte y solicitó cerrarla.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-16",
    "build_reference": "commit:529b6453a85bd53e4627b594a02bfe6821f49cdd",
    "environment": "Ambiente de pruebas del PO en dev; host no especificado",
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
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-14",
    "kind": "manual_report",
    "description": "El PO aporta una nueva devolución de QA con catorce escenarios funcionales y solicita además verificar el arranque automático del stack Docker al iniciar el computador.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-14",
    "kind": "source_review",
    "description": "La revisión del checkout confirma un antecedente cerrado y publicado en 6.2.4, contratos PUSH/PULL vigentes, el guard de operaciones cloud por sucursal y un script WSL2 de tarea programada todavía pendiente de evidencia E2E en Windows.",
    "reference": null,
    "point_id": null
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-14",
    "kind": "automated_test",
    "description": "DELETE de AdmPartner aplicado por identification aunque object_id difiera; incluido en la suite consolidada de 67 pruebas.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-09-14",
    "kind": "automated_test",
    "description": "AdmPayment transmite y aplica la lista completa de sucursales por code, incluida la relación M2M y el caso vacío.",
    "reference": null,
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-09-14",
    "kind": "automated_test",
    "description": "Tráfico y reporte de comandas devuelven datos; el frontend conserva la API Docker local y las pruebas de CSV streaming pasan.",
    "reference": null,
    "point_id": "POINT-003"
  },
  {
    "id": "EVIDENCE-006",
    "date": "2026-09-14",
    "kind": "automated_test",
    "description": "El grafo de facturación/encolado conserva comandas y la sublínea POS es idempotente tras dos reintentos.",
    "reference": null,
    "point_id": "POINT-004"
  },
  {
    "id": "EVIDENCE-007",
    "date": "2026-09-14",
    "kind": "automated_test",
    "description": "La baja de tercero conserva snapshot y clave natural en SyncQueue para publicarse después de reconectar.",
    "reference": null,
    "point_id": "POINT-005"
  },
  {
    "id": "EVIDENCE-008",
    "date": "2026-09-14",
    "kind": "automated_test",
    "description": "El consecutivo se elimina por prefijo, tipo y código de sucursal; 9 pruebas Angular de consecutivos pasan.",
    "reference": null,
    "point_id": "POINT-006"
  },
  {
    "id": "EVIDENCE-009",
    "date": "2026-09-14",
    "kind": "automated_test",
    "description": "La resolución de dominio mantiene localhost/IP contra la API local sin depender de nube; reporte y tráfico backend pasan.",
    "reference": null,
    "point_id": "POINT-007"
  },
  {
    "id": "EVIDENCE-010",
    "date": "2026-09-14",
    "kind": "automated_test",
    "description": "PosSalesRegister reemplaza el ID cloud de sucursal por su code local durante el pull incremental.",
    "reference": null,
    "point_id": "POINT-008"
  },
  {
    "id": "EVIDENCE-011",
    "date": "2026-09-14",
    "kind": "automated_test",
    "description": "Tercero y dirección originados por SAI/QR quedan encolados para pull con ACK posterior a aplicar.",
    "reference": null,
    "point_id": "POINT-009"
  },
  {
    "id": "EVIDENCE-012",
    "date": "2026-09-14",
    "kind": "automated_test",
    "description": "Producto originado en SAI se encola y actualiza localmente por code con categoría e impuestos portables.",
    "reference": null,
    "point_id": "POINT-010"
  },
  {
    "id": "EVIDENCE-013",
    "date": "2026-09-14",
    "kind": "automated_test",
    "description": "Tercero originado en SAI se registra explícitamente en SyncQueue y baja por identification.",
    "reference": null,
    "point_id": "POINT-011"
  },
  {
    "id": "EVIDENCE-014",
    "date": "2026-09-14",
    "kind": "automated_test",
    "description": "Forma de pago migrada desde SAI se encola con códigos exactos de todas sus sucursales.",
    "reference": null,
    "point_id": "POINT-012"
  },
  {
    "id": "EVIDENCE-015",
    "date": "2026-09-14",
    "kind": "automated_test",
    "description": "La ruta HTTP create_update_pos_order devuelve 409 para IPOS y EPOS en nube cuando la sucursal usa servidor local.",
    "reference": null,
    "point_id": "POINT-013"
  },
  {
    "id": "EVIDENCE-016",
    "date": "2026-09-14",
    "kind": "automated_test",
    "description": "Dos reintentos de una dirección SAI con id=0 conservan una sola fila y una sola principal por clave natural.",
    "reference": null,
    "point_id": "POINT-014"
  },
  {
    "id": "EVIDENCE-017",
    "date": "2026-09-14",
    "kind": "static_validation",
    "description": "Compose resuelve seis servicios con restart unless-stopped; Go valida el contrato. El reinicio real de Windows permanece pendiente de canario.",
    "reference": null,
    "point_id": "POINT-015"
  },
  {
    "id": "EVIDENCE-018",
    "date": "2026-09-14",
    "kind": "automated_test",
    "description": "La prueba de regresión confirma que una nueva dirección principal recibida desde SAI desmarca la principal anterior, registra su UPDATE en SyncQueue con is_main=false y mantiene una sola principal; incluida en la suite consolidada de 68 pruebas.",
    "reference": null,
    "point_id": "POINT-014"
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
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket."
  },
  {
    "id": "RETEST-002",
    "date": "2026-09-16",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket."
  },
  {
    "id": "RETEST-003",
    "date": "2026-09-16",
    "point_id": "POINT-003",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket."
  },
  {
    "id": "RETEST-004",
    "date": "2026-09-16",
    "point_id": "POINT-004",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket."
  },
  {
    "id": "RETEST-005",
    "date": "2026-09-16",
    "point_id": "POINT-005",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket."
  },
  {
    "id": "RETEST-006",
    "date": "2026-09-16",
    "point_id": "POINT-006",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket."
  },
  {
    "id": "RETEST-007",
    "date": "2026-09-16",
    "point_id": "POINT-007",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket."
  },
  {
    "id": "RETEST-008",
    "date": "2026-09-16",
    "point_id": "POINT-008",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket."
  },
  {
    "id": "RETEST-009",
    "date": "2026-09-16",
    "point_id": "POINT-009",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket."
  },
  {
    "id": "RETEST-010",
    "date": "2026-09-16",
    "point_id": "POINT-010",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket."
  },
  {
    "id": "RETEST-011",
    "date": "2026-09-16",
    "point_id": "POINT-011",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket."
  },
  {
    "id": "RETEST-012",
    "date": "2026-09-16",
    "point_id": "POINT-012",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket."
  },
  {
    "id": "RETEST-013",
    "date": "2026-09-16",
    "point_id": "POINT-013",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket."
  },
  {
    "id": "RETEST-014",
    "date": "2026-09-16",
    "point_id": "POINT-014",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket."
  },
  {
    "id": "RETEST-015",
    "date": "2026-09-16",
    "point_id": "POINT-015",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket."
  }
]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional:
  - Se aplicaron correcciones idempotentes de OfflineSync, relaciones portables, resolución del destino local Angular y recuperación controlada del stack Docker/WSL; las pruebas automatizadas registradas permanecen verdes.
- Resultado comunicado por el PO:
  - El 2026-09-16 el PO confirmó que probó la incidencia por su parte y solicitó su cierre.
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica):
  - QA aprobada a partir de la confirmación explícita del PO; cada POINT-NNN conserva su retest aprobado en el ciclo QA.
- Riesgo residual e impacto de release:
  - El ticket se cierra funcionalmente y continúa `unreleased`; no autoriza PR, tag, publicación de imágenes ni despliegue. Cualquier regresión posterior se tratará en un ticket nuevo relacionado.
- Texto visible al usuario cuando aplique:
  - Corregidas las regresiones de sincronización local/nube y la configuración de arranque local reportadas en este ciclo de QA.

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-16",
    "technical_summary": "Se corrigieron las regresiones OfflineSync, relaciones de sucursal, idempotencia, destino API local y arranque Docker/WSL; la suite automatizada registrada sigue verde.",
    "functional_summary": "El PO confirmó el 2026-09-16 que probó la incidencia por su parte y solicitó cerrar los quince puntos.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirma el 2026-09-16 que probó la incidencia por su parte y solicita cerrar el ticket.",
    "release_impact": "El ticket se cierra funcionalmente y permanece unreleased; no se crea PR, tag ni despliegue."
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
    "date": "2026-09-14",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-14",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-14",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-14",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-14",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-14",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-14",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-14",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-007."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-14",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-008."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-14",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-009."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-14",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-010."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-14",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-011."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-14",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-012."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-14",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-013."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-14",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-014."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-14",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-015."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-14",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-14",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-14",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-14",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-007."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-008."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-009."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-010."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-011."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-012."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-013."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-014."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-015."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-016."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-037",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-017."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-038",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-039",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-040",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-041",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-042",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-043",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-006: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-044",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-007: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-045",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-008: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-046",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-009: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-047",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-010: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-048",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-011: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-049",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-012: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-050",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-013: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-051",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-014: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-052",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-015: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-053",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-054",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-055",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-056",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-057",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-058",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-006: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-059",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-007: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-060",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-008: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-061",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-009: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-062",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-010: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-063",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-011: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-064",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-012: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-065",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-013: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-066",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-014: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-067",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-015: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-068",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-069",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-070",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-071",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-072",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-073",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-006: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-074",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-007: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-075",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-008: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-076",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-009: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-077",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-010: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-078",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-011: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-079",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-012: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-080",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-013: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-081",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-014: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-082",
    "date": "2026-09-14",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-015: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-083",
    "date": "2026-09-14",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-084",
    "date": "2026-09-14",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-018."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-085",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-086",
    "date": "2026-09-16",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-087",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-088",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-089",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-090",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-004 para POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-091",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-005 para POINT-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-092",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-006 para POINT-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-093",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-007 para POINT-007."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-094",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-008 para POINT-008."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-095",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-009 para POINT-009."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-096",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-010 para POINT-010."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-097",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-011 para POINT-011."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-098",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-012 para POINT-012."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-099",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-013 para POINT-013."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-100",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-014 para POINT-014."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-101",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-015 para POINT-015."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-102",
    "date": "2026-09-16",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-103",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-104",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-105",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-106",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-107",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-108",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-109",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-006: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-110",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-007: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-111",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-008: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-112",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-009: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-113",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-010: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-114",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-011: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-115",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-012: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-116",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-013: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-117",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-014: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-118",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-015: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-119",
    "date": "2026-09-16",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-120",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-121",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-122",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
