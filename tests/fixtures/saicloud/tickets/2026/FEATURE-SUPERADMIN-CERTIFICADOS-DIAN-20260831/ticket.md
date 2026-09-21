---
schema_version: 1
id: FEATURE-SUPERADMIN-CERTIFICADOS-DIAN-20260831
title: Administración centralizada de certificados DIAN por tenant
type: FEATURE
module: SUPERADMIN
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: high
created: 2026-08-31
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# FEATURE-SUPERADMIN-CERTIFICADOS-DIAN-20260831

## Solicitud original

Actualmente, en Compañía > Integración DIAN, los clientes pueden visualizar, cargar, actualizar y eliminar su certificado de facturación electrónica. Se requiere que los clientes solo puedan visualizar su certificado. La carga, actualización y eliminación deben realizarse exclusivamente desde la aplicación SuperAdmin. En el listado de tenants se debe mostrar una columna con el vencimiento del certificado y, al entrar al detalle de un tenant, se debe mostrar la tarjeta de certificado actualmente visible en Compañía, con todas las opciones de administración para el equipo interno.

## Descripción funcional

- Alcance: trasladar la administración del certificado digital DIAN (.pfx/.p12) del área operativa de Compañía al detalle del tenant en la aplicación Angular SuperAdmin. Añadir en la vista de tabla de tenants la fecha de vencimiento, o un estado explícito de ausencia, del certificado.
- Usuario o rol afectado: los usuarios autenticados de cada tenant mantienen solo la consulta de metadatos seguros; los superusuarios autenticados del schema `public` administran el certificado del tenant seleccionado.
- Comportamiento actual: `GET /api/dian/certificate/` devuelve metadatos del certificado en el schema del tenant; `POST` y `DELETE` permiten a un usuario con rol `ADMIN` del tenant cargar, reemplazar o eliminarlo. La tarjeta de Compañía expone esas tres acciones. SuperAdmin solo consulta `AdminClient` y métricas; no expone certificado ni vencimiento.
- Comportamiento esperado: Compañía conserva la tarjeta y sus estados, pero exclusivamente informativa, sin formulario ni acciones de adjuntar, actualizar o eliminar. SuperAdmin lista el vencimiento por tenant y, en el detalle, muestra la misma información y estados con el formulario/acciones de administración. Las mutaciones se autorizan solo con JWT de superusuario, actúan dentro del `schema_context` del tenant de la URL y dejan auditoría sin guardar contraseña ni material del certificado.

## Diagnóstico

- Archivos y flujo investigados:
  - `FrontEnd/src/app/administration/company/adm-setting.component.{ts,html}` carga la tarjeta, llama a `GeneralService` y ofrece carga/reemplazo/eliminación.
  - `BackEnd/ModAdmin/views/dian.py` entrega el endpoint tenant-scoped y hoy delega `POST`/`DELETE` a `IsAdminAdmUser`.
  - `BackEnd/ModAdmin/services/dian_certificate_service.py` valida PFX/P12, conserva el secreto cifrado y usa la conexión/schema actual para ubicar el objeto S3; acepta `admuser`, que puede ser `null`.
  - `FrontEnd/projects/superadmin/src/app/features/clients-list` y `client-detail` son las vistas objetivo. `BackEnd/SuperAdmin/views.py` ya fuerza `public`, autentica con `IsSuperUser`, recupera el `AdminClient` y emplea `schema_context` mediante `tenant_service` para operaciones por tenant.
- Causa raíz o hipótesis: la primera entrega ubicó la administración junto a la configuración de la empresa y otorgó mutaciones a administradores de tenant. La arquitectura existente de SuperAdmin ya tiene el límite de confianza apropiado, pero no tenía un contrato para leer/mutar este recurso tenant-scoped.
- Riesgos y compatibilidad:
  - El corte debe retirar realmente los métodos mutantes de la ruta tenant; ocultar botones sin cambiar la autorización conservaría una vía de administración del cliente.
  - El endpoint de SuperAdmin no puede reutilizar el JWT/rol del tenant. Debe permanecer bajo `SuperAdminJWTAuthentication` + `IsSuperUser`, obtener el tenant por `schema_name` y entrar al schema únicamente dentro de un bloque acotado.
  - La metadata pública para usuarios autenticados del tenant no puede incluir archivo, contraseña cifrada, bucket ni llave S3. La nueva API debe devolver el mismo contrato seguro.
  - La auditoría SuperAdmin debe registrar actor, tenant y operación, sin contraseña, contenido, nombre de objeto S3 ni otros secretos. Como el actor existe en `public`, no debe forzarse como `AdmUser` tenant-scoped; el campo `id_admuser` se conserva nulo para estas cargas y la trazabilidad queda en `SuperAdminAuditLog`.
  - La fecha de la lista debe distinguir `sin certificado`, vigente, próximo a vencer y vencido, y no debe convertir un error aislado de un schema en una caída de todo el listado.
- Impactos de sync, migración, Docker o despliegue: no se identificó participación de OfflineSync, SincSaiCloud, LocalAgents, WebSocket, Docker ni migraciones. El modelo ya persiste `valid_until`; el cambio modifica API, autorización y dos aplicaciones Angular. Se requiere gate de plan por ser `FEATURE` y por el límite de autorización.

## Plan

- Alcance y exclusiones: incluye lectura y administración centralizada de certificados DIAN y el vencimiento en la tabla SuperAdmin. Excluye descargar certificados, revelar contraseñas/almacenamiento S3, cambios al proceso de firma DIAN, sincronización, migraciones y cambios de dominios.
- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-08-31 para implementar el alcance completo descrito en este ticket: lectura tenant, administración exclusiva desde SuperAdmin, columna de vencimiento, auditoría y pruebas. Se exige conservar el aislamiento por schema y no exponer secretos.
- Pasos ordenados:
  1. Backend — ownership `BackEnd/SuperAdmin/`: definir serializers y rutas específicas para consultar, cargar/reemplazar y eliminar el certificado de `clients/<schema_name>/`, protegidas por la base de SuperAdmin. Implementar un servicio que entre con `schema_context(tenant.schema_name)`, obtenga `AdmSetting` y reutilice el servicio de certificados; validar multipart y devolver únicamente `AdmDianCertificateSerializer`. Registrar `CERTIFICATE_UPLOAD`, `CERTIFICATE_REPLACE` o `CERTIFICATE_DELETE` con actor/schema y sin secretos.
  2. Backend — ownership `BackEnd/ModAdmin/`: dejar `GET /api/dian/certificate/` disponible a usuarios autenticados del tenant para la tarjeta informativa y eliminar las rutas mutantes para dicho contexto (respuesta compatible y explícita de método no permitido). Ajustar pruebas de permisos y metadatos seguros; no cambiar el servicio de firma ni el modelo salvo evidencia nueva.
  3. Backend — ownership `BackEnd/SuperAdmin/`: extender el contrato de overview/listado con `certificate_valid_until` nullable y un estado derivado seguro, calculado en el schema correcto. Aislar errores por tenant y conservar la respuesta de los demás tenants; evitar incluir campos sensibles o credenciales en caché/respuesta.
  4. Frontend tenant — ownership `FrontEnd/src/app/administration/company/`: conservar carga y visualización de la tarjeta, estados y mensajes de error, pero remover los controles mutantes, formularios y llamadas de carga/eliminación. Mantener fechas `es-CO` y accesibilidad.
  5. Frontend SuperAdmin — ownership `FrontEnd/projects/superadmin/`: declarar contratos tipados y métodos HTTP; añadir columna ordenable de vencimiento/estado a la tabla de tenants; agregar al detalle la tarjeta con los cuatro estados existentes y controles de adjuntar, actualizar, eliminar y cancelar, accesibles y protegidos por el flujo de superadmin.
  6. Pruebas y verificación: ampliar pruebas Django para autorización de SuperAdmin, selección correcta de schema, ausencia de filtración de secretos, auditoría, errores de PFX/S3 y aislamiento entre dos tenants. Actualizar las pruebas Angular del componente de Compañía y crear/ajustar las de SuperAdmin para contrato, estado y acciones. Compilar cada aplicación afectada.
- Rollback, backup, canario u orden de despliegue cuando aplique: sin migración ni cambio de datos, no requiere backup ni canario de esquema. Desplegar primero backend compatible (nuevas rutas SuperAdmin y tenant `GET`; sin mutaciones en tenant), después SuperAdmin y finalmente el frontend tenant que remueve controles. Si se requiere rollback, restaurar los frontends a sus builds previos y, solo si es indispensable y aprobado, reabrir temporalmente las mutaciones tenant mediante un cambio reverso; nunca borrar ni alterar certificados existentes como mecanismo de rollback.

## Criterios de aceptación

- [ ] POINT-001: un usuario autenticado, incluso con rol `ADMIN` del tenant, puede consultar solo metadatos seguros del certificado desde Compañía y no visualiza ni puede invocar acciones de carga, actualización o eliminación.
- [ ] POINT-001: las mutaciones tenant-scoped de certificado rechazan al administrador del tenant; ninguna contraseña, contenido PFX/P12, bucket ni llave S3 se expone en respuesta, error, interfaz o auditoría.
- [ ] POINT-001: SuperAdmin muestra por tenant un vencimiento formateado o el estado `Sin certificado`, y permite ordenar la columna sin romper los filtros/vistas existentes.
- [ ] POINT-001: en el detalle del tenant, un superusuario puede cargar/reemplazar un PFX/P12 válido o eliminar el certificado; los estados sin certificado, vigente, por vencer (<=30 días) y vencido son correctos y las operaciones se ejecutan solo sobre el schema seleccionado.
- [ ] POINT-001: una carga/eliminación desde SuperAdmin deja auditoría con actor, tenant y operación, sin secretos; fallos de archivo/contraseña/almacenamiento son manejados y no afectan certificados de otros tenants.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Centralizar la administración del certificado DIAN en SuperAdmin",
    "status": "closed",
    "severity": "high",
    "actual": "Un usuario administrador del tenant puede cargar, reemplazar o eliminar el certificado DIAN desde Compañía; SuperAdmin no muestra su vencimiento ni lo administra.",
    "expected": "Cualquier usuario del tenant solo ve metadatos seguros del certificado; únicamente un superadministrador autenticado puede consultar, cargar, reemplazar o eliminar el certificado del tenant seleccionado desde SuperAdmin, con auditoría.",
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
  }
]
```

## Implementación

- Archivos cambiados:
- Decisiones técnicas:
- Compatibilidad preservada:
- Commits atribuibles al ticket:
  - `5213237d46c5ce40a773922197faef0628d39978` — centraliza la administración del certificado DIAN por tenant en SuperAdmin, con auditoría y Compañía del tenant en solo lectura.

## Pruebas

- Comandos para el PO: se completarán tras implementación y build. Previstos: `python manage.py test SuperAdmin.tests.test_api ModAdmin.tests.test_dian`; `npx ng test FrontSaiOpenCloud --watch=false --browsers=ChromeHeadless`; `npx ng test superadmin --watch=false --browsers=ChromeHeadless`; `npx ng build FrontSaiOpenCloud`; y `npx ng build superadmin`.
- Directorio de ejecución: `BackEnd/` para Django; `FrontEnd/` para Angular.
- Resultado esperado: pruebas verdes; ninguna respuesta o auditoría contiene secretos; los endpoints de SuperAdmin actúan únicamente sobre el tenant solicitado y los clientes no pueden mutar el recurso.
- Validaciones manuales: con dos tenants de prueba y un superusuario, comparar la tarjeta de Compañía (solo lectura) con la de SuperAdmin (administrable), verificar las cuatro variantes visuales y confirmar que la fecha/estado de cada tenant no se cruza. Probar archivo inválido, contraseña inválida, cancelación y eliminación.
- Requisitos de ambiente o datos: dos schemas tenant no productivos con `AdmSetting`, un certificado de prueba PFX/P12 con contraseña conocida solo por el ejecutor y un superusuario de pruebas. No registrar el archivo ni la contraseña en el ticket.
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
[]
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
    "date": "2026-08-31",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-08-31",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-16",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-16",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-16",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
