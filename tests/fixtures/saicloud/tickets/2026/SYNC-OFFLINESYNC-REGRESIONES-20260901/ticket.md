---
schema_version: 1
id: SYNC-OFFLINESYNC-REGRESIONES-20260901
title: Corregir regresiones de OfflineSync detectadas en Docker local
type: SYNC
module: OFFLINESYNC
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: true
migration_impact: true
docker_impact: false
risk_level: critical
created: 2026-09-01
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# SYNC-OFFLINESYNC-REGRESIONES-20260901

## Solicitud original

Revisar y resolver catorce incidencias detectadas durante pruebas de OfflineSync en Docker local: terceros, usuarios, formas de pago, plantilla de factura, vendedores, zonas, factura y caja, comandas y sus reportes, QR, y preparación de combos. La solicitud abarca sincronización local↔nube, altas, ediciones, eliminaciones, estados de caja, consecutivos y consistencia de datos.

## Descripción funcional

- Alcance: catorce regresiones observadas en el ciclo local↔nube de OfflineSync, incluidas configuraciones, terceros, usuarios, documentos de venta, caja y comandas.
- Usuario o rol afectado: administradores y operadores de POS/restaurante que prueban el entorno Docker local de un tenant autorizado.
- Comportamiento actual: los datos divergen, algunas ediciones producen duplicados, las bajas no convergen, y eventos de caja, facturas y comandas no llegan al otro extremo.
- Comportamiento esperado: cada operación debe converger de manera idempotente, aislada por tenant y sin sustituir registros no relacionados; en conflicto aplica la regla cloud-gana.

## Diagnóstico

- Archivos y flujo investigados: `BackEnd/OfflineSync/signals.py`, `views.py`, `management/commands/run_sync.py`, `management/commands/bootstrap_tenant_from_cloud.py`, los endpoints de sync de ModAdmin y los tests actuales. El receptor filtra las descargas cloud→local por `PULL_MODELS`; los eventos locales se capturan mediante `SyncQueue` y el worker los publica en `/api/sync/receive/`.
- Causa raíz o hipótesis: (1) `admpayment` asigna deliberadamente todas las sucursales al crear una forma de pago, lo que explica POINT-003; (2) `poscashregister`, facturas y comandas están en el conjunto local→nube, no en `PULL_MODELS`, por lo que no existe aún un contrato de descarga cloud→local para POINT-007 y POINT-013; (3) el DELETE genérico usa el PK local salvo `AdmUserBranch`, por lo que las bajas de usuarios y vendedores pueden no encontrar la contraparte con IDs divergentes (POINT-002 y POINT-005); (4) hay que reproducir con payload y cola los puntos de terceros, plantilla, zonas, QR y combos antes de afirmar causa. El antecedente `fad4975` documentó como pendientes precisamente el error de edición de usuarios y Reporte de Comandas.
- Precisión del PO (2026-09-01): POINT-001 reproduce una dirección adicional con el nombre del tercero; se debe garantizar una sola dirección principal por tercero. POINT-004 se orienta a verificar la captura de señales local→nube. POINT-006 es un desborde visual del menú de Administración, reproducible en local y nube. Para POINT-007/013 no se deben descargar facturas ni cierres de otras sedes: se requiere impedir de forma segura la operación de Restaurante en nube para la sede que opere mediante servidor local. POINT-008/009/010 requieren subida local→nube de comandas, vinculadas a `ResOrder` y, cuando facture, a `PosOrder.id_origin`.
- Ampliación sin internet (2026-09-02): POINT-015 parece excluir `AdmProductMakingCopyZone` de `PULL_MODELS`, aunque su modelo sí existe en catálogo; POINT-016 requiere comprobar que la baja local queda aplicada antes de la publicación diferida; POINT-017 requiere separar el guard de conectividad de nube del runtime local y cargar mesas desde IndexedDB; POINT-018 requiere auditar el ciclo `run_sync` → `run_incremental_pull` → `pull/ack`, sus errores y el orden de FKs. Son hipótesis de código, no evidencia de ejecución en Windows.
- Riesgos y compatibilidad: cambiar un modelo de unidireccional a bidireccional puede repetir operaciones, invertir el orden de padre/hijos o reemplazar datos. Las correcciones deben conservar natural keys, ACK posterior a la aplicación, guards `disable_sync_signals`, cloud-gana, aislamiento por schema y compatibilidad con workers anteriores.
- Impactos de sync, migración, Docker o despliegue: el alcance crítico incluye OfflineSync, WebSocket, una migración aditiva para el parámetro de sucursal y la optimización de imágenes Docker. En esta copia, `docker compose ps -a` no muestra servicios de SaiOpenCloud; los contenedores activos corresponden a otro proyecto, por lo que falta confirmar el Compose/tenant usado en la prueba reportada.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-09-01 para implementar los POINT-001 a POINT-014, reproducir en Docker local y preparar validación posterior en el tenant `dev` del servidor Windows. Es obligatorio por ser un ticket `SYNC` que modifica OfflineSync y potencialmente WebSocket.
- Alcance y exclusiones: se investigan y corrigen exclusivamente los POINT-001 a POINT-014. No se limpian datos históricos, no se modifican credenciales ni `ALLOWED_HOSTS`, y no se ejecuta bootstrap, reset ni operación sobre tenants reales sin una autorización y objetivo aportados por el PO.
- Pasos ordenados:
  1. Reproducir cada punto en un tenant Docker de prueba identificado por el PO, preservando payloads seguros, `SyncQueue`, respuestas HTTP y eventos WebSocket; agrupar únicamente causas que compartan contrato y marcar los puntos no reproducibles con evidencia.
  2. Corregir la sincronización de configuraciones y relaciones: sucursales de formas de pago, bajas por clave natural, edición de usuarios, terceros/QR, plantillas y preparación de combos. Cada M2M debe transportar una lista completa de claves naturales y aplicar `.set()` también cuando quede vacía.
  3. Diseñar y aplicar el contrato bidireccional de caja, facturas y comandas: ordenar padres antes que hijos, resolver referencias por clave natural, conservar un único estado de apertura/cierre y evitar reemplazos de consecutivos. Confirmar el modelo de conflicto cloud-gana antes de incorporar operaciones cloud→local.
  4. Ajustar los consumidores Angular y notificaciones WebSocket que correspondan a Zonas, Por mesas, Tráfico por zonas y reportes, sin sustituir la configuración funcional por Django Admin.
  5. Añadir pruebas unitarias, de integración y E2E local↔nube para CREATE/UPDATE/DELETE, reintento, ACK, reconexión, colisión de ID y sincronización de relaciones vacías; ejecutar regresión de los módulos afectados.
  6. Validar en canario con un tenant de prueba. Desplegar primero nube compatible y después el cliente/local; conservar el artefacto previo para rollback. Si se detecta necesidad de migración o Docker, detenerse y presentar backup, canario y rollback específicos para nueva aprobación.
- Cambio material para POINT-007/013 — aprobado explícitamente por el PO el 2026-09-01: añadir un parámetro booleano de Restaurante por sucursal, visible en la pantalla Angular existente de configuración de sucursal. En nube, el backend rechazará las mutaciones operativas de Restaurante/POS para esa sucursal cuando el parámetro esté activo; no bloqueará los endpoints de OfflineSync, para que el servidor local continúe subiendo caja, pedidos, comandas y facturas. Angular mostrará un estado no operativo al acceder a dicha sucursal desde nube. Requiere migración, compatibilidad del payload de sucursal, pruebas backend/Angular y canario/rollback.
- Plan ampliado pendiente de aprobación del PO para POINT-015 a POINT-018: (1) incluir zona de copias y sus dependencias en la cola/pull incremental, con upsert por producto+zona y pruebas offline; (2) aplicar y encolar la baja de vendedor en local sin bloquear por conectividad, validando el reintento al reconectar; (3) distinguir local y nube en el guard de apertura, cargar mesas desde la caché local y encolar caja/órdenes para publicación posterior, sin relajar la restricción de nube; (4) corregir el pull incremental de administración, observando ACK solo tras aplicar el lote y resolviendo FKs/identidades naturales. Se probarán reconexión, ACK, reintento, colisión de ID, tenant aislado y ausencia de duplicados. Orden de despliegue: nube compatible primero, luego servidor local; rollback: volver a artefacto previo sin borrar `SyncQueue`, preservando cola para reintento. En canario se realiza respaldo verificable del tenant `dev` antes de aplicar migraciones o cambios de worker.
- Ampliación de POINT-018 — Gate de plan aprobado explícitamente por el PO el 2026-09-02: endurecer el guard común de señales para que, solo cuando el objeto de tenant asociado a la conexión indique OfflineSync desactivado, compruebe el `AdminClient` vigente desde el schema `public` antes de descartar la escritura. Se preservan `disable_sync_signals`, `skip_sync_queue`, los modelos permitidos y la deduplicación existente de `SyncQueue`; no se introduce migración, cambio de payload ni alteración de ACK. Se prueban `AdmSetting` y `AdmPartner`, tenant realmente desactivado, reintento sin duplicados y aislamiento de schema. Orden: desplegar primero backend nube compatible; el servidor local existente continúa siendo compatible. Rollback: regresar solo el backend de nube al artefacto previo, sin borrar ni reprocesar filas de `SyncQueue`.
- Plan Docker aprobado explícitamente por el PO el 2026-09-02 para POINT-019/020: (1) crear `BackEnd/.dockerignore` que excluya entornos virtuales, caches, archivos de prueba locales, `.git`, artefactos y logs; (2) convertir el Dockerfile backend en construcción por etapas o eliminar después de `pip install` las herramientas de compilación, verificando que Gunicorn, migraciones y `run_sync` funcionan con la misma imagen; (3) conservar el Dockerfile multi-stage del frontend y ajustar su `.dockerignore` solo si la inspección de capas muestra archivos fuera de `dist`; (4) medir tamaños antes/después y ejecutar build, migraciones y smoke test. Canario: publicar tags nuevos y probar primero el servidor Windows `dev`; rollback: volver explícitamente a los tags de backend, sync-worker y frontend anteriores sin borrar volúmenes, base de datos ni `SyncQueue`.
- Rollback, backup, canario u orden de despliegue cuando aplique: rollback mediante retorno al artefacto y commit cloud compatible anterior, sin reemitir ni borrar `SyncQueue`; antes del canario se toma respaldo verificable del tenant de prueba. La corrección debe ser aditiva mientras convivan workers antiguos y nuevos.

## Criterios de aceptación

- [ ] POINT-001 a POINT-006: altas, ediciones y bajas de configuración/terceros convergen sin duplicados y con las sucursales y opciones exactas.
- [ ] POINT-007 y POINT-013: una apertura de caja y sus facturas/consecutivos convergen a un único estado desde ambos extremos, sin sobrescribir la factura existente.
- [ ] POINT-008 a POINT-010: las comandas aparecen consistentes en Por mesas, Tráfico por zonas y Reporte de Comandas tras ACK y reconexión.
- [ ] POINT-011: el porcentaje de propina conserva el valor liquidado y el mismo redondeo en local y nube.
- [ ] POINT-012 y POINT-014: terceros creados mediante QR y combos editados llegan al otro extremo sin duplicación.
- [ ] Todas las pruebas cubren tenant correcto, reintentos, ACK, colisiones de ID y ausencia de eventos de eco.
- [ ] POINT-015: una zona de copias configurada en nube llega a local y puede usarse sin conexión.
- [ ] POINT-016: borrar un vendedor sin internet lo elimina localmente y lo elimina en nube al reconectar, una sola vez.
- [ ] POINT-017: sin internet, el servidor local carga mesas cacheadas, abre caja y crea órdenes; nube mantiene el requisito de conectividad.
- [ ] POINT-018: cambios administrativos en nube aparecen incrementalmente en local sin ejecutar bootstrap completo y sin afectar otro tenant.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Edición de terceros duplica dirección de envío en nube",
    "status": "verified",
    "severity": "high",
    "actual": "Al editar un tercero en el equipo local, la dirección de envío queda duplicada al revisarla en la nube.",
    "expected": "La edición del tercero debe actualizar idempotentemente la dirección de envío correspondiente sin duplicados.",
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
    "title": "Usuarios no permite editar y no libera al eliminar",
    "status": "verified",
    "severity": "high",
    "actual": "La edición de un usuario muestra “Error al procesar la solicitud”; además, eliminarlo no lo libera en la base nube.",
    "expected": "Se debe poder editar el usuario y su eliminación debe reflejarse correctamente en nube según el contrato vigente.",
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
    "title": "Formas de pago amplía indebidamente sucursales en nube",
    "status": "verified",
    "severity": "high",
    "actual": "Una forma de pago creada localmente con una o dos sucursales llega a nube con todas las sucursales seleccionadas.",
    "expected": "La selección de sucursales debe conservarse exactamente entre local y nube.",
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
    "title": "Plantilla de factura no desmarca opciones en nube",
    "status": "verified",
    "severity": "high",
    "actual": "Al desmarcar una opción de plantilla en local, en nube permanecen todas las opciones marcadas.",
    "expected": "Las opciones marcadas y desmarcadas deben reflejar el estado local conforme a las reglas de conflicto.",
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
    "id": "POINT-005",
    "title": "Eliminación de vendedores no libera registros",
    "status": "verified",
    "severity": "high",
    "actual": "Al eliminar un vendedor no se libera el registro en ninguna de las dos bases.",
    "expected": "La eliminación debe aplicarse de forma coherente y verificable en los dos extremos definidos por el contrato.",
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
    "id": "POINT-006",
    "title": "Zonas ya no aparece en la interfaz",
    "status": "verified",
    "severity": "normal",
    "actual": "El módulo o la información de Zonas ya no aparece durante la operación.",
    "expected": "Zonas debe estar disponible y mostrar los datos correspondientes según permisos y sincronización.",
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
    "id": "POINT-007",
    "title": "Caja y facturas no sincronizan estado ni consecutivos",
    "status": "verified",
    "severity": "critical",
    "actual": "Abrir caja en nube no la abre localmente, quedan cierres separados; el consecutivo no refresca; facturas de nube no bajan a local; una factura nube con consecutivo 605 puede ser reemplazada localmente sin cambiar el consecutivo.",
    "expected": "Caja, cierres, facturas y consecutivos deben conservar consistencia bidireccional, sin reemplazos ni duplicados, bajo el contrato cloud-gana.",
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
  },
  {
    "id": "POINT-008",
    "title": "Comandas no sincronizan en operación por mesas",
    "status": "verified",
    "severity": "critical",
    "actual": "Las comandas no sincronizan al operar Por mesas.",
    "expected": "Las comandas creadas o actualizadas deben sincronizarse y conservar su relación con la mesa.",
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
    "id": "POINT-009",
    "title": "Comandas no sincronizan en tráfico por zonas",
    "status": "verified",
    "severity": "critical",
    "actual": "Las comandas no sincronizan al consultar u operar Tráfico por zonas.",
    "expected": "Tráfico por zonas debe reflejar comandas sincronizadas y actualizadas.",
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
    "id": "POINT-010",
    "title": "Reporte de comandas no recibe comandas sincronizadas",
    "status": "verified",
    "severity": "high",
    "actual": "Reporte de Comandas no muestra comandas sincronizadas.",
    "expected": "El reporte debe incluir las comandas sincronizadas que correspondan al tenant y filtros aplicados.",
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
    "id": "POINT-011",
    "title": "Reporte de propina difiere entre local y nube",
    "status": "verified",
    "severity": "high",
    "actual": "El campo % Propina muestra 9,09% en local y 10% en nube.",
    "expected": "El porcentaje de propina debe conservar el mismo valor y criterio de redondeo en ambos extremos.",
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
    "id": "POINT-012",
    "title": "Tercero creado desde QR no llega a local",
    "status": "verified",
    "severity": "high",
    "actual": "Al crear un tercero mediante QR se crea en una base nueva pero no se refleja en la base local.",
    "expected": "El tercero creado por QR debe propagarse al extremo local autorizado sin duplicados.",
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
    "id": "POINT-013",
    "title": "Caja abierta en nube no sincroniza y permite doble apertura",
    "status": "verified",
    "severity": "critical",
    "actual": "Si la caja se abre primero en nube no se sincroniza en local; abrirla manualmente en local deja dos cajas abiertas.",
    "expected": "Una caja abierta desde cualquiera de los extremos debe converger a una sola apertura válida.",
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
    "id": "POINT-014",
    "title": "Edición de preparación de combos duplica combos",
    "status": "verified",
    "severity": "high",
    "actual": "Editar en Preparación de Combos duplica los combos.",
    "expected": "Editar un combo debe actualizar la entidad existente sin crear duplicados.",
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
    "id": "POINT-015",
    "title": "Zona de copias no llega a local sin internet",
    "status": "verified",
    "severity": "high",
    "actual": "La configuración de zona de copias de Productos no está disponible en la base local cuando el equipo opera sin internet.",
    "expected": "La zona de copias previamente sincronizada debe persistir y estar disponible localmente sin internet.",
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
    "id": "POINT-016",
    "title": "Baja de vendedores no se aplica localmente sin internet",
    "status": "verified",
    "severity": "high",
    "actual": "Al eliminar vendedores sin internet, la base local no refleja o no deja preparada correctamente la baja.",
    "expected": "La baja debe aplicarse localmente de inmediato y quedar en cola idempotente para nube al reconectar.",
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
    "id": "POINT-017",
    "title": "Factura local sin internet no carga mesas ni abre órdenes/caja",
    "status": "verified",
    "severity": "critical",
    "actual": "Sin internet, las mesas no cargan hasta actualizar y al abrir caja aparece “Se requiere conexión a internet para abrir una caja”, impidiendo crear órdenes aunque la operación es local.",
    "expected": "En runtime local sin internet deben cargar las mesas cacheadas y poder abrir caja/crear órdenes locales; nube conserva su requisito de conexión.",
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
    "id": "POINT-018",
    "title": "Cambios administrativos de nube no bajan incrementalmente a local",
    "status": "verified",
    "severity": "critical",
    "actual": "Las actualizaciones administrativas realizadas en nube no aparecen en local fuera del bootstrap inicial; parece operar solo local→nube.",
    "expected": "Cada cambio administrativo autorizado en nube debe llegar incrementalmente a local, por tenant, aun sin depender del bootstrap completo.",
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
    "id": "POINT-019",
    "title": "Imagen backend incluye entorno virtual y herramientas de compilación innecesarias",
    "status": "verified",
    "severity": "normal",
    "actual": "BackEnd no tiene .dockerignore; COPY . . incorpora .venv local de 368 MB y la imagen conserva compiladores usados solo durante la instalación.",
    "expected": "Las imágenes backend y sync_worker deben excluir artefactos locales y conservar solo dependencias runtime necesarias.",
    "evidence": [
      "EVIDENCE-004"
    ],
    "affected_files": [
      "BackEnd/Dockerfile",
      "BackEnd/.dockerignore"
    ],
    "diagnosis": "La instrucción COPY . . incluía el entorno virtual local y la imagen final retenía herramientas de compilación usadas únicamente durante pip install.",
    "solution": "Se añadió .dockerignore y Dockerfile multi-stage: las dependencias se construyen en /opt/venv y solo ese entorno se copia al runtime slim.",
    "tests": [
      "Buildx AMD64 exitoso; contexto 1.23 MB.",
      "Imports runtime y ayuda de run_sync exitosos.",
      "Imagen 156,466,343 bytes frente a 515,138,812 bytes previa."
    ],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-020",
    "title": "Verificar y optimizar contexto de construcción de frontend",
    "status": "verified",
    "severity": "normal",
    "actual": "El proyecto FrontEnd pesa aproximadamente 15 GB localmente por .angular y node_modules; se debe verificar que la imagen final no los incluya.",
    "expected": "La imagen final de frontend debe contener únicamente el build estático requerido por Nginx y conservar su comportamiento actual.",
    "evidence": [
      "EVIDENCE-005"
    ],
    "affected_files": [
      "FrontEnd/.dockerignore"
    ],
    "diagnosis": "El Dockerfile ya era multi-stage y la imagen final no contenía Node; el contexto debía proteger además archivos .env locales.",
    "solution": "Se conservaron las etapas build/Nginx y se excluyeron .env y .env.* del contexto de construcción.",
    "tests": [
      "Buildx AMD64 exitoso; contexto 68.30 MB.",
      "nginx -t exitoso con host backend resuelto.",
      "Imagen final Nginx de 86,294,221 bytes."
    ],
    "qa_cycles": [
      "QA-001"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- Archivos cambiados: `OfflineSync/signals.py`, `OfflineSync/views.py`, `OfflineSync/management/commands/run_sync.py` y `bootstrap_tenant_from_cloud.py`; configuración de sucursal en `ModAdmin`; límites operativos de POS/Restaurante; serializers de combos y plantillas; menú y reporte de propina Angular.
- Decisiones técnicas: los upserts y bajas de sincronización resuelven la identidad por claves naturales y conservan el PK solo como fallback compatible. Los nuevos payloads de formas de pago transportan códigos de sucursal y reemplazan exactamente el M2M. Las comandas suben su `ResOrder` padre antes del hijo. Las facturas y cierres siguen siendo local→nube: una sucursal marcada con servidor local queda bloqueada para operaciones POS/Restaurante desde nube, sin bloquear OfflineSync.
- Compatibilidad preservada: los workers anteriores que no envían sucursales en la forma de pago mantienen el comportamiento histórico al crear; los reportes de propina históricos calculan sobre el total sin propina cuando no existe porcentaje persistido; no se limpian datos históricos ni se descargan facturas/cierres de otras sedes.
- Cobertura por punto: POINT-001 dirección de envío por tercero+nombre y una sola principal; POINT-002/005 baja por clave natural y edición validada; POINT-003 M2M exacto; POINT-004 señal de desmarcado por `save()`; POINT-006 menú con scroll; POINT-007/013 flag de sucursal local y bloqueo cloud; POINT-008/009/010 grafo `ResOrder`→`ResCommand`; POINT-011 porcentaje persistido/cálculo correcto; POINT-012 pull por tercero/dirección natural; POINT-014 mezcla por producto+subcategoría.
- Docker: POINT-019 separa la instalación de dependencias de la imagen final; `.venv` local, compiladores, cachés y artefactos ya no se copian. La misma imagen queda apta para Gunicorn y `run_sync`, por lo que backend y sync-worker pueden usar el mismo tag. POINT-020 conserva el build multi-stage de Angular, que publica solo `dist` sobre Nginx, y excluye también archivos `.env` del contexto.
- Compatibilidad AWS: los buildspecs activos de dev y producción ejecutan `cd BackEnd && docker build ... .`; por tanto consumen este mismo Dockerfile y contexto. La verificación AMD64 confirmó el comando Gunicorn/WSGI, dependencias runtime y `run_sync`. No se modificaron task definitions, puertos, variables, imagen base ni el proceso de despliegue.
- POINT-018: el guard de señales conserva el camino rápido cuando el tenant de conexión ya está habilitado; si lo ve deshabilitado, consulta el `AdminClient` vigente en `public` antes de omitir el evento. Así una instancia cacheada anterior no silencia cambios de `AdmSetting`, `AdmPartner` ni otros modelos sincronizables. No cambia payloads, claves naturales, ACK ni deduplicación de `SyncQueue`.
- Commits atribuibles al ticket:
  - `6c9cdf71e46413c64b98908c5fdab9d958ce5043` — correcciones de OfflineSync, operación local, migración y pruebas de regresión.
  - `46ff205cb4e3ca4e0c59d5df2b2bcd142bba75af` — optimización de imágenes Docker de backend/sync-worker y contexto de frontend, compatible con los buildspecs AWS.
  - `265b3811c943317608626228218528a0fd2e63fb` — fallback al tenant vigente para que el caché no suprima eventos cloud→local, con pruebas de `AdmSetting`, `AdmPartner` y tenant deshabilitado.

## Pruebas

- Comandos ejecutados desde la raíz: `BackEnd/.venv/bin/python BackEnd/manage.py test OfflineSync.tests.SyncReceiveViewPartnerBranchIdentityTest OfflineSync.tests.SyncReceiveViewNaturalKeyDeleteTest OfflineSync.tests.SyncReceiveViewAdmPaymentBranchTest ModAdmin.tests.test_serializers_invoice_template.AdmInvoiceTemplateDefaultSyncTest ModAdmin.tests.test_branch_operational_access ModPos.tests.test_cash_register_share.OpenCashRegisterSharedUsersTest.test_local_server_branch_cannot_open_cash_register_in_cloud --keepdb --verbosity 1` (10 pruebas OK); `BackEnd/.venv/bin/python BackEnd/manage.py test ModAdmin.tests.test_serializers_inventory.AdmProductPreloadSerializerTest.test_update_mix_without_local_line_id_does_not_duplicate_subcategory ModRestaurant.tests.test_alternate_docs_reports.ResumeTipAlternateDocsTest.test_uses_persisted_tip_percent_instead_of_total_including_tip ModAdmin.tests.test_serializers_settings.AdmUserSerializerTest --keepdb --verbosity 1` (8 pruebas OK); `BackEnd/.venv/bin/python -m compileall -q BackEnd/OfflineSync BackEnd/ModAdmin BackEnd/ModRestaurant`; `BackEnd/.venv/bin/python BackEnd/manage.py makemigrations ModAdmin --check --dry-run`; y desde `FrontEnd/`, `npm run build -- --configuration development` (OK).
- Docker AMD64: `docker buildx build --platform linux/amd64 --load -t saiopencloud-backend:docker-optimized-test -f BackEnd/Dockerfile ./BackEnd` (OK; contexto 1.23 MB); imports runtime y `python manage.py help run_sync` (OK); tamaño backend anterior 515,138,812 bytes y optimizado 156,466,343 bytes. `docker buildx build --platform linux/amd64 --load -t saiopencloud-frontend:docker-optimized-test -f FrontEnd/Dockerfile ./FrontEnd` (OK; contexto 68.30 MB, imagen final 86,294,221 bytes) y `nginx -t` (OK con resolución del host `backend` de Compose).
- Directorio de ejecución: raíz de SaiOpenCloud para backend; `FrontEnd/` para build Angular. En Windows, usar el directorio del artefacto Docker autorizado, sin ejecutar `docker compose down -v`.
- Resultado esperado: pruebas automatizadas verdes y convergencia verificable de cada POINT sin datos duplicados ni eventos pendientes/fallidos.
- Validaciones manuales: repetir los catorce escenarios desde local y nube, incluyendo cierre/reapertura, actualización de pantalla e inspección controlada de ambos extremos; para POINT-007/013, activar “Sucursal con servidor local”, verificar que nube responde 409 a operación POS/Restaurante y que el agente local sí publica los eventos.
- Requisitos de ambiente o datos: tenant no productivo `dev`, `is_offline_sync_enabled=true`, migración `0048` aplicada en nube/local, usuario con permisos pertinentes, servidor Windows con el agente y muestras descartables.
- Resultado comunicado por el PO: el 2026-09-03 revisó los escenarios en sucesión y confirma que están bien.
- POINT-018 (pendiente de prueba Django dirigida): `BackEnd/.venv/bin/python -m py_compile BackEnd/OfflineSync/signals.py BackEnd/OfflineSync/tests.py` (OK); `BackEnd/.venv/bin/python BackEnd/manage.py test OfflineSync.tests.OfflineSyncTenantFlagFallbackTest --keepdb --verbosity 2` quedó bloqueada durante la inicialización de la base de pruebas compartida y no produjo resultado de aserciones en este equipo. Se requiere ejecutar esa clase en un entorno con base de pruebas disponible, además del canario nube→local.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-03",
    "build_reference": "commit:265b3811c943317608626228218528a0fd2e63fb",
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
    "date": "2026-09-01",
    "kind": "source_review",
    "description": "El commit fad4975 documenta que la edición de Usuarios y Reporte de Comandas quedaron pendientes tras una ronda anterior de QA Docker.",
    "reference": "commit:fad49751ff7c661b03306c880c80d7b47235beb4",
    "point_id": null
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-01",
    "kind": "test",
    "description": "Prueba automatizada: una sucursal marcada con servidor local devuelve HTTP 409 al intentar abrir caja en runtime cloud; el helper no bloquea runtime local.",
    "reference": null,
    "point_id": "POINT-007"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-01",
    "kind": "implementation",
    "description": "Se añade el parámetro local_server_enabled por sucursal, su serializer y formulario Angular; los endpoints operativos POS/Restaurante bloquean nube sin afectar OfflineSync.",
    "reference": null,
    "point_id": "POINT-013"
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-09-02",
    "kind": "build_verification",
    "description": "Build AMD64 del backend completado. El contexto fue 1.23 MB; la imagen pasó de 515,138,812 a 156,466,343 bytes. Imports Django/pandas/lxml/cryptography/psycopg2 y ayuda de run_sync verificados.",
    "reference": "worktree:sha256:f362e89eeda23294d45fe48cff0d9a65ed66c05d7e233ff7b4a2a4b1fef1ade3",
    "point_id": "POINT-019"
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-09-02",
    "kind": "build_verification",
    "description": "Build AMD64 del frontend completado. El contexto fue 68.30 MB pese a .angular local de 14 GB; la imagen final Nginx mide 86,294,221 bytes y nginx -t fue válido con host backend resuelto.",
    "reference": "worktree:sha256:f362e89eeda23294d45fe48cff0d9a65ed66c05d7e233ff7b4a2a4b1fef1ade3",
    "point_id": "POINT-020"
  },
  {
    "id": "EVIDENCE-006",
    "date": "2026-09-02",
    "kind": "manual_diagnosis",
    "description": "En tenant dev, AdminClient.is_offline_sync_enabled figura activo en public, pero ediciones nube de AdmSetting y AdmPartner no crean filas SyncQueue; el pull responde sin items. El hallazgo apunta al guard de señales que usa el tenant de conexión potencialmente cacheado.",
    "reference": null,
    "point_id": "POINT-018"
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
  },
  {
    "id": "RETEST-003",
    "date": "2026-09-03",
    "point_id": "POINT-003",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-004",
    "date": "2026-09-03",
    "point_id": "POINT-004",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-005",
    "date": "2026-09-03",
    "point_id": "POINT-005",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-006",
    "date": "2026-09-03",
    "point_id": "POINT-006",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-007",
    "date": "2026-09-03",
    "point_id": "POINT-007",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-008",
    "date": "2026-09-03",
    "point_id": "POINT-008",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-009",
    "date": "2026-09-03",
    "point_id": "POINT-009",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-010",
    "date": "2026-09-03",
    "point_id": "POINT-010",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-011",
    "date": "2026-09-03",
    "point_id": "POINT-011",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-012",
    "date": "2026-09-03",
    "point_id": "POINT-012",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-013",
    "date": "2026-09-03",
    "point_id": "POINT-013",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-014",
    "date": "2026-09-03",
    "point_id": "POINT-014",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-015",
    "date": "2026-09-03",
    "point_id": "POINT-015",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-016",
    "date": "2026-09-03",
    "point_id": "POINT-016",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-017",
    "date": "2026-09-03",
    "point_id": "POINT-017",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-018",
    "date": "2026-09-03",
    "point_id": "POINT-018",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-019",
    "date": "2026-09-03",
    "point_id": "POINT-019",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO confirma: revisó los escenarios en sucesión y están bien."
  },
  {
    "id": "RETEST-020",
    "date": "2026-09-03",
    "point_id": "POINT-020",
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
    "technical_summary": "Correcciones de OfflineSync, operación local y pull incremental verificadas por el PO.",
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
    "date": "2026-09-01",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-01",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-01",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-01",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-01",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-01",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-01",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-01",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-007."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-01",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-008."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-01",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-009."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-01",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-010."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-01",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-011."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-01",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-012."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-01",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-013."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-01",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-014."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-01",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-01",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-01",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-01",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-01",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-01",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-01",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-01",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-006: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-01",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-007: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-01",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-008: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-01",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-009: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-01",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-010: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-01",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-011: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-01",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-012: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-01",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-013: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-01",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-014: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-09-01",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-09-01",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-09-01",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-09-01",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-09-01",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-037",
    "date": "2026-09-01",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-038",
    "date": "2026-09-01",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-039",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-040",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-041",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-042",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-006: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-043",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-007: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-044",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-008: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-045",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-009: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-046",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-010: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-047",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-011: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-048",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-012: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-049",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-013: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-050",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-014: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-051",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-052",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-053",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-054",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-055",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-056",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-006: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-057",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-007: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-058",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-008: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-059",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-009: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-060",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-010: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-061",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-011: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-062",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-012: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-063",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-013: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-064",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-014: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-065",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-066",
    "date": "2026-09-02",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-015."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-067",
    "date": "2026-09-02",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-016."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-068",
    "date": "2026-09-02",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-017."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-069",
    "date": "2026-09-02",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-018."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-070",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-015: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-071",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-016: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-072",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-017: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-073",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-018: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-074",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-015: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-075",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-016: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-076",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-017: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-077",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-018: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-078",
    "date": "2026-09-02",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-019."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-079",
    "date": "2026-09-02",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-020."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-080",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-019: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-081",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-020: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-082",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-019: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-083",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-020: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-084",
    "date": "2026-09-02",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-085",
    "date": "2026-09-02",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-086",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-019: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-087",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-020: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-088",
    "date": "2026-09-02",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-089",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-090",
    "date": "2026-09-03",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-091",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-015: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-092",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-016: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-093",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-017: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-094",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-018: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-095",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-096",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-097",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-098",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-004 para POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-099",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-005 para POINT-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-100",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-006 para POINT-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-101",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-007 para POINT-007."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-102",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-008 para POINT-008."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-103",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-009 para POINT-009."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-104",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-010 para POINT-010."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-105",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-011 para POINT-011."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-106",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-012 para POINT-012."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-107",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-013 para POINT-013."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-108",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-014 para POINT-014."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-109",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-015 para POINT-015."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-110",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-016 para POINT-016."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-111",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-017 para POINT-017."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-112",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-018 para POINT-018."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-113",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-019 para POINT-019."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-114",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-020 para POINT-020."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-115",
    "date": "2026-09-03",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-116",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-117",
    "date": "2026-09-03",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-118",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-119",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-120",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
