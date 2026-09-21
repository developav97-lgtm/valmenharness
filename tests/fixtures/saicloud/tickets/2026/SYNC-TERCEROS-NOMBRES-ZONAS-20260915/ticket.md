---
schema_version: 1
id: SYNC-TERCEROS-NOMBRES-ZONAS-20260915
title: Sincronizar nombres alternos y zona de terceros
type: SYNC
module: TERCEROS
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: true
migration_impact: true
docker_impact: true
risk_level: high
created: 2026-09-15
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# SYNC-TERCEROS-NOMBRES-ZONAS-20260915

## Solicitud original

necesito que creemos un ticket para los siguientes puntos:

1. paso que un tercero se inactivo y en el modal de restaurante no salia y eso esta correcto, pero me indican que cuando fueron al modulo de pos comercial si salio, lo que me parece raro porque es el mismo modal, lo unico que se me ocurre es que alguien lo haya actualizado y se emito la notificacion websocket y al tener el modal lo cargo y lo mostro es lo unico que se me ocurre podrias validarlos
2. se requiere agregar dos campos al modelo de terceros AdmPartner que vendrian sincronizados desde saiopen de la tabla CUST que serian COMPANY_EXTENDIDO,COMPANY_FACT_ELECT en saiopen salen como nombre extendido y nombre largo
3. necesitamos que en la direccion de envio se enlace la zona AdmPartnerBranch ya cuenta con un id_zone que enlaza al modelo AdmZone y en saiopen vendria de SHIPTO campo ZONA
4. se necesita que en la tabla y en el modal de terceros en el mismo campo nombre permita buscar por COMPANY_EXTENDIDO,COMPANY_FACT_ELECT es decir los dos campos nuevos esto poque muchas veces el cliente configura ahi complementos o usa el COMPANY para la razon social y alguno de los otros dos como el nombre comercial entonces debe poder buscar por todos.
5. ninguno de los campos COMPANY_EXTENDIDO,COMPANY_FACT_ELECT,ZONA deben ser obligatorios en de zona en saicloud debe poder pasarse a sin zona y que mande null si estos campos se modifican de saicloud deben bajar a saiopen tambien, al igual que verificar que BackEnd/OfflineSync tambien queden en la sincronzacion de los multiples lados

## Descripción funcional

- Alcance: terceros y sus direcciones de envío en Administración, modal compartido de selección, POS Comercial y Restaurante; sincronización Saiopen/Firebird ↔ SaiCloud mediante LocalAgents, y replicación tenant cloud ↔ local mediante OfflineSync. Incluye el autocompletado DIAN de personas naturales.
- Usuario o rol afectado: usuarios operativos de POS y Restaurante que seleccionan terceros, y usuarios de Administración que crean, editan, buscan o sincronizan terceros y direcciones.
- Comportamiento actual: el filtro de activos es distinto por origen aunque el modal sea común; los nombres alternos de CUST no se preservan en AdmPartner; SHIPTO.ZONA no se vincula de forma bidireccional con AdmPartnerBranch.id_zone; la búsqueda local solo examina name; y el parseo DIAN invierte nombres/apellidos cuando la fuente entrega apellidos antes de nombres.
- Comportamiento esperado: reglas explícitas y probadas de visibilidad por módulo; datos opcionales de nombres alternos y zona preservados en todos los trayectos autorizados; búsqueda por los tres nombres; y autocompletado DIAN que interprete el contrato confirmado `apellidos + nombres` sin invertir campos.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/modals/Administration/select-partner-modal/` comparte el modal; Restaurante lo abre con `only_active_partners=true`, mientras POS lo abre sin esa opción. El modal recarga `Partners` en IndexedDB al recibir `dataChanges$`. `FrontEnd/src/app/administration/partners/` contiene el formulario operativo y la tabla. `BackEnd/ModAdmin/models/partners.py`, sus serializers y `views/utils.py` modelan y publican terceros cloud→agente. `views/functions.py:partners_sinc_sai` recibe la carga Saiopen→cloud. `LocalAgents/saiopensync/internal/mapping/assets/partner_sql.sql` solo obtiene `CUST.COMPANY`; `internal/worker/partners.go` fija CUST.ZONA y SHIPTO.ZONA a `1` y solo materializa SHIPTO principal. `BackEnd/OfflineSync/` ya sincroniza `admpartner` y `admpartnerbranch` por claves naturales y usa lookups de zona actualmente basados en nombre.
- Causa raíz o hipótesis: POINT-001 está explicado por una política existente distinta por origen, no por la recarga en sí: el refresh WebSocket vuelve a aplicar el filtro de cada apertura. POINT-002/003/005 provienen de contratos incompletos entre modelos, serializers, payload cloud→agente y consulta Saiopen→cloud. POINT-004 no es expresable con el filtro AND de un solo campo de IndexedDB. POINT-006 proviene de `GeneralService.splitFullName()`, que presupone nombres al inicio y apellidos al final, contrario al contrato DIAN confirmado por el PO: siempre dos apellidos primero y después uno o dos nombres.
- Riesgos y compatibilidad: se requiere migración aditiva y compatible para datos existentes; los payloads nuevos deben tolerar agentes/cloud previos y los reintentos no pueden duplicar `AdmPartner`, `AdmPartnerBranch`, CUST ni SHIPTO. La zona se identifica por una clave de negocio verificable —no por PK local— y una ausencia debe limpiar el vínculo sin convertirla en zona `1`. Falta confirmar, en una Firebird representativa autorizada, el tipo y semántica exacta de `SHIPTO.ZONA`, la correspondencia con `AdmZone.code` y si CUST.ZONA debe conservarse o queda fuera del alcance por ser distinto a la dirección.
- Impactos de sync, migración, Docker o despliegue: SYNC crítico, OfflineSync, LocalAgent, WebSocket, migración Django y un entorno Docker local efímero para Firebird 2.5. No se modifican Dockerfiles, Compose versionado ni `ALLOWED_HOSTS`. El orden previsto es nube compatible antes que agente compatible; no se actualiza ni instala un agente sin canario y aprobación del PO.

## Plan

- Alcance y exclusiones: se corrigen los seis puntos en las pantallas operativas localizadas, backend, OfflineSync y LocalAgent. Se excluyen cambios a Django Admin, migraciones/normalizaciones masivas de datos históricos sin respaldo aprobado, cambios a CUST.ZONA no solicitados para una dirección, y cualquier despliegue, instalación o publicación.
- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-09-15 para el alcance de los seis puntos, incluida la regla DIAN confirmada: dos apellidos primero y uno o dos nombres después. El PO aprobó explícitamente el 2026-09-15 el anexo de canario Firebird Docker local. Por ser SYNC con OfflineSync, LocalAgent, WebSocket y migración, cualquier cambio material exige renovar esta aprobación.
- Pasos ordenados:
  1. Confirmar el contrato Firebird en un entorno autorizado y documentar la clave de negocio de zona: tipo/nullable de `SHIPTO.ZONA`, correspondencia exacta con `AdmZone.code`, y la semántica de `CUST.ZONA`. Conservar `null` como ausencia; si no existe zona cloud con el código recibido, rechazar de forma trazable el ítem sin inventar una relación. (POINT-003, POINT-005)
  2. Añadir una migración Django aditiva para `company_extendido` y `company_fact_elect` nullable/blank en `AdmPartner`; exponerlos en serializers, interfaces y formulario Angular. Incluir `id_zone` opcional en la dirección de envío de la interfaz funcional y sus serializers, sin mover esta configuración a Django Admin. (POINT-002, POINT-003, POINT-005)
  3. Extender los contratos Saiopen→cloud: consulta de CUST y lectura de SHIPTO para ambos nombres y zona; `partners_sinc_sai` resolverá zona por `AdmZone.code`, conservará campos opcionales y usará identificación para el tercero y la clave natural vigente para la dirección. La sincronización cloud gana ante conflictos y los datos omitidos por clientes previos no borran valores existentes. (POINT-002, POINT-003, POINT-005)
  4. Extender cloud→LocalAgent de forma aditiva: `get_partner_id()` enviará ambos nombres y, por cada dirección, el código de zona o `null`; el agente usará UPSERT por `ID_N` y `(ID_N, SUCCLIENTE)`, tratará campos ausentes como contrato anterior y aplicará explícitamente la ausencia de zona. Implementar todas las sucursales del payload o limitar el contrato de forma explícita y probada; no fijar zona `1`. Publicar primero el backend compatible, luego el agente canario. (POINT-002, POINT-003, POINT-005)
  5. Ajustar OfflineSync para transportar los nuevos campos por el serializer de modelo y resolver/emitir `_zone_lookup` mediante el código de `AdmZone`, preservando `null`, señales `disable_sync_signals`, cola, ACK y claves naturales. Cubrir bootstrap y ambos sentidos sin PKs locales ni duplicados. (POINT-002, POINT-003, POINT-005)
  6. Extender a POS Comercial la política ya vigente de Restaurante: ambos orígenes abrirán el modal con solo terceros activos. La recarga WebSocket solo actualizará el snapshot y reaplicará esa política, sin alterar la selección ya confirmada. Esta decisión sigue la expectativa reportada de que el modal compartido no muestre un tercero inactivo en POS. (POINT-001)
  7. Reemplazar el filtro de nombre de la tabla y del modal por una coincidencia OR local, normalizada y segura, sobre `name`, `company_extendido` y `company_fact_elect`, manteniendo el filtro de identificación y de activos como condiciones AND. (POINT-004)
  8. Reemplazar el reparto DIAN implícito por un adaptador único al contrato confirmado: `name` llega siempre como `primer_apellido segundo_apellido primer_nombre [segundo_nombre]`. Con tres palabras se asignarán dos apellidos y un nombre; con cuatro, dos apellidos y dos nombres. Una longitud distinta no se repartirá automáticamente y se informará para corrección manual. Aplicar la misma regla al formulario completo y al alta rápida del modal, y verificar el payload final de ambos. (POINT-006)
  9. Añadir pruebas Django, Angular, OfflineSync y Go; ejecutar integración local cloud↔Firebird con reintento, ACK, reconexión, conflicto cloud-gana, zona nula, zona válida, zona desconocida y ausencia de duplicados. Preparar canario, backup verificable de los datos que se prueben y rollback de backend/agente/migración antes de cualquier operación.
- Compatibilidad, despliegue y rollback: la migración solo añade columnas nullable; el backend acepta payloads sin campos nuevos; el agente previo ignora extensiones y el agente nuevo tolera backend previo. Desplegar backend/migración compatible, validar canario de tenant autorizado y solo entonces actualizar agente; no actualizar clientes legacy sin confirmar su repositorio/instalación. Rollback: retirar el agente nuevo primero si falla su contrato, revertir código cloud compatible conservando columnas añadidas y restaurar datos de canario desde backup solo con autorización. No se elimina ni renombra una columna durante este ticket.
- Anexo de canario Firebird local — aprobado explícitamente por el PO el 2026-09-15: usar exclusivamente la base de pruebas existente en `<DATOS_LOCALES>/<DB_PRUEBAS>` (3.4 GB, comprobada solo por existencia y tamaño). Antes de iniciar el contenedor, crear una copia local con nombre y directorio temporal explícitos; montar únicamente la copia en modo lectura/escritura para el servidor Firebird 2.5 y mantener el archivo original sin tocar. La imagen exacta y el comando se determinarán mediante documentación del proveedor; las credenciales se inyectarán localmente, no se escribirán en el repositorio, ticket ni salida. Canario: consultar metadatos de CUST/SHIPTO/TRIBUTARIA, seleccionar o crear datos de prueba y validar zona válida, nula y desconocida, además del ciclo cloud↔agente. Rollback: detener y eliminar solo el contenedor efímero y la copia temporal validada, preservando la base original; no publicar puertos fuera de `127.0.0.1`.

## Criterios de aceptación

- [ ] POINT-001: Restaurante y POS Comercial nunca listan ni permiten seleccionar `state=false`; el refresh WebSocket reaplica el filtro de manera determinista.
- [ ] POINT-002: CUST.COMPANY_EXTENDIDO y CUST.COMPANY_FACT_ELECT se conservan como valores independientes, opcionales y bidireccionales, sin sobreescribir un valor existente cuando un cliente compatible no envía el campo.
- [ ] POINT-003: cada SHIPTO vincula su zona con `AdmPartnerBranch.id_zone` por una clave de negocio comprobada; una zona ausente se persiste y retorna como `null`, sin sustituirse por zona `1` ni crear referencias inválidas.
- [ ] POINT-004: la tabla de Administración y el modal encuentran por cualquier coincidencia parcial en razón social, nombre extendido o nombre largo; la identificación y el filtro activo conservan su comportamiento actual.
- [ ] POINT-005: sincronización Saiopen↔Cloud, Cloud↔OfflineSync y Cloud↔LocalAgent es aditiva, idempotente y libre de duplicados tras reintento/reconexión; respeta cloud-gana, ACK y guards de señales.
- [ ] POINT-006: `APELLIDO1 APELLIDO2 NOMBRE1` completa `first_last_name`, `second_last_name`, `first_name` y deja `second_name` vacío; `APELLIDO1 APELLIDO2 NOMBRE1 NOMBRE2` completa los cuatro campos correctos. Los dos flujos de creación generan el mismo payload y no intercambian nombres con apellidos.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "POS muestra un tercero inactivo tras una actualización en vivo",
    "status": "closed",
    "severity": "high",
    "actual": "Restaurante excluye terceros con state=false, pero se reporta que POS Comercial puede mostrar el mismo tercero inactivo, posiblemente después de una actualización por WebSocket mientras el modal está abierto.",
    "expected": "La política de visibilidad de terceros inactivos debe estar explícita por origen. Debe confirmarse que el refresco por WebSocket respeta dicha política y no introduce una regresión no intencional.",
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
    "title": "Sincronizar nombres alternos de CUST en AdmPartner",
    "status": "closed",
    "severity": "high",
    "actual": "AdmPartner no persiste COMPANY_EXTENDIDO ni COMPANY_FACT_ELECT recibidos desde CUST; COMPANY_EXTENDIDO se usa parcialmente en payloads sin representar ambos valores en el modelo cloud.",
    "expected": "AdmPartner debe conservar ambos campos opcionales, recibirlos desde Saiopen y enviarlos de vuelta sin pérdida ni sustituciones incorrectas.",
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
    "id": "POINT-003",
    "title": "Vincular SHIPTO.ZONA con AdmPartnerBranch.id_zone",
    "status": "closed",
    "severity": "high",
    "actual": "AdmPartnerBranch tiene id_zone opcional, pero el contrato revisado no mapea SHIPTO.ZONA de forma bidireccional.",
    "expected": "Cada dirección de envío debe resolver de forma segura la zona de SHIPTO, aceptar ausencia de zona y sincronizar el vínculo sin crear referencias inválidas.",
    "evidence": [
      "EVIDENCE-003",
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
    "id": "POINT-004",
    "title": "Buscar terceros por nombres alternos en tabla y modal",
    "status": "closed",
    "severity": "normal",
    "actual": "La búsqueda por nombre del listado y del modal usa name; no incluye COMPANY_EXTENDIDO ni COMPANY_FACT_ELECT.",
    "expected": "El campo de búsqueda por nombre debe encontrar terceros por razón social, nombre extendido o nombre largo, conservando filtros y paginación existentes.",
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
    "title": "Preservar opcionalidad y sincronización multivía de nombres y zona",
    "status": "closed",
    "severity": "high",
    "actual": "No está demostrado que los nuevos campos opcionales y la zona se conserven como null al sincronizar SaiCloud, Saiopen, OfflineSync y agente local, ni que las ediciones cloud→Saiopen tengan retorno compatible.",
    "expected": "Los tres valores deben ser opcionales; una zona ausente debe representarse como null en SaiCloud y con el contrato compatible acordado en Saiopen. Las actualizaciones deben ser idempotentes y bidireccionales en todos los componentes aplicables.",
    "evidence": [
      "EVIDENCE-008",
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
    "id": "POINT-006",
    "title": "La consulta DIAN invierte nombres y apellidos de persona natural",
    "status": "closed",
    "severity": "high",
    "actual": "Al completar una persona natural desde DIAN, los apellidos se cargan en first_name y second_name, y los nombres en first_last_name y second_last_name. El formulario administrativo y la creación rápida desde el modal aplican la misma heurística al texto de DIAN.",
    "expected": "Los campos de persona natural deben reflejar el orden informado por el contrato DIAN. La creación desde el formulario y desde el modal debe persistir y enviar first_name, second_name, first_last_name y second_last_name sin inversión. Si la respuesta de DIAN no ofrece estructura inequívoca, el flujo debe evitar una asignación automática errónea y permitir corrección explícita.",
    "evidence": [
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

- Archivos cambiados: modelo, migración, serializers, vistas de sincronización, OfflineSync, formulario/listado/modal Angular y LocalAgent Go para nombres alternos y zona; adaptador DIAN compartido; pruebas Django y Go asociadas.
- Decisiones técnicas: `COMPANY_EXTENDIDO` se limita a 80 caracteres y `COMPANY_FACT_ELECT` a 200, de acuerdo con el esquema Firebird confirmado. `SHIPTO.ZONA` se transporta como código de zona o `null`; el agente conserva payloads anteriores sin `BRANCHES` y escribe cada sucursal nueva por `(ID_N, SUCCLIENTE)`.
- Compatibilidad preservada: migración aditiva nullable; payloads ausentes mantienen el contrato previo; OfflineSync usa claves naturales para zona; no se modificaron Dockerfiles, Compose versionado ni `ALLOWED_HOSTS`.
- Commits atribuibles al ticket:
  - `5398b285994c94451822704e2febdcd59bb45e77` — sincroniza nombres y zonas de terceros entre Saiopen y SaiOpenCloud.

## Pruebas

- Comandos ejecutados: desde `BackEnd`, `docker compose run --rm backend python manage.py makemigrations --check --dry-run ModAdmin` y `docker compose run --rm backend python manage.py test --keepdb ModAdmin.tests.test_views_functions ModAdmin.tests.test_views_partners OfflineSync.tests`; desde `FrontEnd`, `npm run build`; desde `LocalAgents/saiopensync`, `go test ./...`.
- Resultado automatizado: migración sin cambios pendientes; 98 pruebas Django/OfflineSync correctas; compilación Angular correcta; suite Go correcta. El canario Firebird confirmó las columnas nullable `CUST.COMPANY_EXTENDIDO` (80), `CUST.COMPANY_FACT_ELECT` (200) y `SHIPTO.ZONA` (2), y verificó una escritura transaccional con zona `null` seguida de rollback sobre la copia temporal.
- Directorio de ejecución: raíz del repositorio para Django/OfflineSync; `FrontEnd` para Angular; `LocalAgents/saiopensync` para Go. Las pruebas Firebird/canario se ejecutan únicamente en el entorno y tenant autorizados por el PO.
- Resultado esperado: suites dirigidas y compilación exitosas; los ciclos de sincronización no duplican registros, conservan campos opcionales y respetan la política aprobada de activos.
- Validaciones manuales: crear/editar un tercero y dirección con y sin nombres alternos y zona; cambiar esos valores desde ambos lados; abrir los dos orígenes del modal durante una actualización WebSocket; buscar los tres nombres; consultar DIAN para una persona natural en orden apellidos→nombres y revisar los campos y payload antes de guardar.
- Requisitos de ambiente o datos: tenant canario autorizado, Firebird representativo, zona configurada cuyo código esté confirmado, tercero de prueba y copia/backup autorizado. No incluir identificaciones personales, DSN, tokens ni credenciales en el ticket.
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
    "date": "2026-09-15",
    "kind": "automated",
    "description": "Revisión estática: Restaurante abre select-partner con only_active_partners=true; POS usa el mismo componente sin ese flag. El modal recarga IndexedDB ante dataChanges$ de Partners mientras está abierto y luego reaplica filtros. Por diseño actual, una actualización WebSocket puede incorporar el tercero en POS, mientras Restaurante lo excluye por state=true.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-15",
    "kind": "automated",
    "description": "Revisión estática: AdmPartner solo define name y comercial_name; get_partner_id emite COMPANY_EXTENDIDO derivado de name; el worker local maneja COMPANY_EXTENDIDO pero no se localizó COMPANY_FACT_ELECT en el contrato revisado. Se requiere precisar mapeo y precedencia bidireccional.",
    "reference": null,
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-15",
    "kind": "automated",
    "description": "Revisión estática: AdmPartnerBranch.id_zone es nullable y OfflineSync posee mecanismos de lookup para la relación, pero get_partner_id no incluye ZONA en BRANCHES y el worker actual fija CUST.ZONA a 1. El mapeo concreto SHIPTO.ZONA todavía debe investigarse antes de diseño.",
    "reference": null,
    "point_id": "POINT-003"
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-09-15",
    "kind": "manual",
    "description": "Captura aportada por el PO evidencia que una consulta DIAN de persona natural cargó los apellidos en los campos de nombres y los nombres en los campos de apellidos. No se registran identificación ni nombres de la persona en el ticket.",
    "reference": null,
    "point_id": "POINT-006"
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-09-15",
    "kind": "automated",
    "description": "Revisión estática: adm-partner.component.ts y select-partner-modal.component.ts llaman GeneralService.splitFullName() para el resultado DIAN. Esa función asigna las últimas dos palabras a first_last_name y second_last_name. Para respuestas DIAN que llegan como apellidos seguidos de nombres, la asignación queda invertida. El modal crea el payload rápido con esos cuatro controles sin una normalización posterior.",
    "reference": null,
    "point_id": "POINT-006"
  },
  {
    "id": "EVIDENCE-006",
    "date": "2026-09-15",
    "kind": "manual",
    "description": "Confirmación del PO: el contrato del endpoint DIAN entrega name siempre en orden apellidos + nombres, con exactamente dos apellidos al inicio y uno o dos nombres al final.",
    "reference": null,
    "point_id": "POINT-006"
  },
  {
    "id": "EVIDENCE-007",
    "date": "2026-09-15",
    "kind": "automated",
    "description": "Canario Firebird local sobre una copia temporal: CUST.COMPANY_EXTENDIDO (80), CUST.COMPANY_FACT_ELECT (200) y SHIPTO.ZONA (2) son nullable; escritura transaccional con ZONA NULL confirmada y revertida.",
    "reference": null,
    "point_id": "POINT-003"
  },
  {
    "id": "EVIDENCE-008",
    "date": "2026-09-16",
    "kind": "automated",
    "description": "Revisión de compatibilidad contra el agente previo al commit 5398b285: su payload de terceros omite company_extendido y company_fact_elect, y su consulta de sucursales emite CODE_ZONE fijo 01. El endpoint cloud actual interpreta campos omitidos como None y resolvería la zona fija; no es seguro desplegar antes de preservar campos ausentes y distinguir el contrato legacy.",
    "reference": null,
    "point_id": "POINT-005"
  },
  {
    "id": "EVIDENCE-009",
    "date": "2026-09-16",
    "kind": "automated",
    "description": "Compatibilidad gradual cubierta por pruebas: un payload legado sin nombres alternos conserva los valores cloud; un payload legado con zona histórica 01 no sobrescribe id_zone; el agente nuevo anuncia partner_sync_contract_version=2. Suite Django/OfflineSync (100), Go completa y compilación Angular correctas.",
    "reference": null,
    "point_id": "POINT-005"
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
  },
  {
    "id": "RETEST-005",
    "date": "2026-09-16",
    "point_id": "POINT-005",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma que todos los puntos de este ticket fueron validados satisfactoriamente y autoriza su cierre."
  },
  {
    "id": "RETEST-006",
    "date": "2026-09-16",
    "point_id": "POINT-006",
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
    "date": "2026-09-15",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-15",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-15",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-15",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-15",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-15",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-15",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-15",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-15",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-15",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-15",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-15",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-15",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-006: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-15",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-007."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-16",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-008."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-16",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-009."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-037",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-038",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-006: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-039",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-006: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-040",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-041",
    "date": "2026-09-16",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-042",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-043",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-044",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-045",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-046",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-047",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-048",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-004 para POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-049",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-050",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-005 para POINT-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-051",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-052",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-006 para POINT-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-053",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-006: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-054",
    "date": "2026-09-16",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-055",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-056",
    "date": "2026-09-16",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-057",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-058",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-059",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
