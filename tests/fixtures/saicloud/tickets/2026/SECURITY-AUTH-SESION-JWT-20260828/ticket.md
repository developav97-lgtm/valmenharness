---
schema_version: 1
id: SECURITY-AUTH-SESION-JWT-20260828
title: Estandarizar autenticación HTTP y vigencia de token tenant
type: SECURITY
module: AUTH
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: high
created: 2026-08-28
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# SECURITY-AUTH-SESION-JWT-20260828

## Solicitud original

Configurar el token de usuarios tenant con vigencia de 72 horas en dev y producción, y crear un interceptor HTTP global que agregue el encabezado Authorization a las peticiones autenticadas y cierre la sesión local al recibir una expiración o invalidación de sesión. Evitar pantallas bloqueadas en carga, como Cierres de caja ante get_cash_registers.

## Descripción funcional

- Alcance: autenticación HTTP de usuarios tenant en Angular y emisión/validación de su JWT en Django. Incluye el flujo visible de cierre de sesión ante expiración; excluye SuperAdmin, renovación automática de token, cambios de roles, migraciones y despliegue.
- Usuario o rol afectado: cualquier usuario autenticado de un tenant que opere desde Angular, incluidos POS, Restaurante y Administración.
- Comportamiento actual: el token tenant tiene un valor por defecto de 10 horas, pero una variable de entorno puede cambiarlo. No hay interceptor HTTP global: varios servicios agregan el encabezado manualmente y otros no. Si una llamada protegida devuelve token expirado, por ejemplo `pos/get_cash_registers`, algunas pantallas no manejan el error y conservan el indicador de carga.
- Comportamiento esperado: todo JWT tenant nuevo vence 72 horas después de emitirse, tanto en dev como en producción; las llamadas HTTP al API del tenant agregan el token vigente de forma centralizada; una expiración, token inválido o sesión revocada limpia la sesión local y redirige al login una única vez, sin convertir un rechazo normal de permisos en cierre de sesión.

## Diagnóstico

- Archivos y flujo investigados: `BackEnd/SaiOpenCloud/settings.py` define `TENANT_JWT_ACCESS_TTL`; `BackEnd/ModAdmin/auth_jwt.py` incorpora su valor al claim `exp`; `BackEnd/ModAdmin/authentication.py` informa expiración, token inválido o sesión revocada. En Angular, `FrontEnd/src/app/app.module.ts` no registra `HTTP_INTERCEPTORS`; `GeneralService.authHeaders()` se invoca de manera selectiva. `CashRegistersComponent` solo desactiva `general.load` en la suscripción exitosa de `getCashRegisters`.
- Causa raíz o hipótesis: falta una política HTTP transversal y las respuestas de autenticación solo tienen un texto `detail`, por lo que cada consumidor debe recordar enviar el header y reaccionar al error. Eso produjo el cargador indefinido observado.
- Riesgos y compatibilidad: un interceptor aplicado sin exclusiones puede mandar un token vencido a login, a servicios externos o a APIs locales; y tratar todo 401/403 como expiración cerraría sesiones de usuarios que simplemente no tienen permiso. Se mantendrá el campo `detail` existente y se añadirá una señal estable solo para fallos de autenticación. No se tocarán secretos ni `ALLOWED_HOSTS`.
- Impactos de sync, migración, Docker o despliegue: no hay sync, migraciones ni cambios Docker. La autenticación es crítica: la configuración efectiva de `TENANT_JWT_ACCESS_TTL` deberá quedar en 259200 segundos en dev y producción por el mecanismo seguro de configuración de cada ambiente; no se registrarán valores sensibles ni se hará despliegue desde este ticket.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-08-28 mediante “dale implementa”. Es obligatorio porque cambia autenticación y la política de sesión.
- Pasos ordenados:
  1. POINT-001 — ajustar la configuración y las pruebas de JWT tenant para emitir un `exp` de 259200 segundos (72 horas); conservar sin cambios los TTL de SuperAdmin y confirmar que un valor de entorno no contradiga la política acordada.
  2. POINT-002 — normalizar los fallos de `JWTAuthentication` con un código de aplicación estable para expiración, token inválido y sesión revocada, conservando el texto `detail` para compatibilidad.
  3. POINT-002 — crear y registrar un interceptor Angular 14 que añada `Authorization: Bearer <auth_token>` únicamente a solicitudes del API del tenant con token disponible. Excluirá servicios externos/locales y los endpoints de inicio o validación de sesión para no bloquear el login ni crear ciclos de logout.
  4. POINT-002 — ante los códigos normalizados de autenticación, coordinará una sola salida local con `AuthService.logout(false)` y propagará el error; no cerrará sesión ante errores de autorización de negocio. Ajustar el componente de cierres para siempre finalizar su estado de carga en error como defensa local.
  5. Añadir pruebas unitarias backend y Angular para TTL, encabezado, exclusiones, respuesta de expiración, concurrencia de errores y apagado del cargador; ejecutar la compilación y las pruebas dirigidas.
- Rollback, backup, canario u orden de despliegue cuando aplique: no requiere backup ni migración. Publicar backend y frontend coordinadamente: el backend conserva `detail`, por lo que un frontend anterior sigue operando; el frontend debe tolerar temporalmente la respuesta previa sin código hasta que backend esté disponible. Para rollback, revertir ambos commits; si la variable del ambiente queda definida, restablecerla de forma segura al valor anterior documentado por operaciones. El canario y la configuración real de dev/producción quedan sujetos al procedimiento de despliegue y aprobación humana posterior.

## Criterios de aceptación

- [ ] POINT-001: un login tenant genera un JWT cuyo `exp - iat` es exactamente 259200 segundos; los tokens de SuperAdmin no cambian.
- [ ] POINT-001: dev y producción reciben `TENANT_JWT_ACCESS_TTL=259200` mediante su configuración segura, sin incluir secretos en el repositorio ni en el ticket.
- [ ] POINT-002: una solicitud al API del tenant desde Angular recibe un único `Authorization: Bearer <auth_token>` cuando hay sesión, sin requerir que el servicio agregue el header manualmente.
- [ ] POINT-002: login, validación de usuario, servicios externos y servicios locales no reciben el encabezado por el interceptor.
- [ ] POINT-002: al responder token expirado, inválido o sesión inactiva, el usuario ve el login y la interfaz no conserva un cargador activo; un 403 de permisos de negocio no cierra la sesión.
- [ ] POINT-002: Cierres de caja deja de cargar al fallar `get_cash_registers` y el flujo exitoso conserva la tabla actual.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Unificar vigencia del token tenant a 72 horas",
    "status": "verified",
    "severity": "high",
    "actual": "El token tenant usa TENANT_JWT_ACCESS_TTL con valor por defecto de 10 horas y el valor efectivo puede diferir por configuración de entorno.",
    "expected": "Los tokens tenant emitidos en dev y producción deben tener una vigencia de 72 horas, sin afectar el token de SuperAdmin.",
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
    "title": "Manejar centralmente autenticación y expiración en HTTP",
    "status": "verified",
    "severity": "high",
    "actual": "No existe interceptor HTTP global. Las llamadas deben agregar Authorization individualmente y CashRegistersComponent no maneja el error, por lo que el cargador queda activo al expirar el token.",
    "expected": "Toda solicitud autenticada debe recibir Authorization de forma uniforme y una respuesta que indique token expirado, inválido o sesión inactiva debe cerrar la sesión local y llevar al login sin dejar la interfaz cargando.",
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

- Archivos cambiados: `BackEnd/SaiOpenCloud/settings.py`, `BackEnd/ModAdmin/authentication.py`, `BackEnd/ModAdmin/tests/test_tenant_jwt_authentication.py`, `BackEnd/ModAdmin/tests/test_auth_sesion_security.py`, `FrontEnd/src/app/common/interceptors/auth-http.interceptor.ts`, su spec, `FrontEnd/src/app/app.module.ts` y el componente/spec de Cierres de caja.
- Decisiones técnicas: el TTL por defecto tenant es 259200 segundos. `JWTAuthentication` conserva `detail` y añade `code`; el interceptor usa esos códigos y, durante la transición, reconoce los tres textos previos de autenticación. Se inyectan `GeneralService` y `AuthService` de forma diferida mediante `Injector` para evitar dependencia circular con `HttpClient`.
- Compatibilidad preservada: SuperAdmin no cambia; las respuestas previas siguen mostrando `detail`; los servicios que aún agregan el header manualmente no reciben un duplicado porque el interceptor sobrescribe el mismo encabezado. No se cierra sesión ante un 403 de permisos de negocio.
- Commits atribuibles al ticket:
  - `2ec39788da71e8880ac7139d1a14f0c169b369f3` — estandariza autenticación HTTP, expiración JWT y pruebas de regresión.
  - `c2b2d07d674ee0a4b55e0940f7e8e8daa0060bda` — documenta la aprobación QA y el cierre funcional del ticket.

## Pruebas

- Comandos para el PO:
  - `./.venv/bin/python manage.py test ModAdmin.tests.test_tenant_jwt_authentication --keepdb`
  - `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/common/interceptors/auth-http.interceptor.spec.ts'`
  - `npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/Compartidos/Pos/cash-register/cash-registers/cash-registers.component.spec.ts'`
  - `npx ng build --configuration=production`
- Directorio de ejecución: `BackEnd` para Django y `FrontEnd` para Angular.
- Resultado esperado: 3 pruebas Django, 5 pruebas del interceptor y 1 prueba de Cierres exitosas; compilación productiva sin errores atribuibles al ticket. Angular 14 ejecuta los specs indicados correctamente pero al finalizar reporta un error conocido de coincidencia de `--include`; se conserva como limitación del runner, no como fallo de los 6 specs ejecutados.
- Validaciones manuales: iniciar sesión, verificar operación normal de Cierres; usar un token vencido o revocado en una llamada protegida y confirmar redirección a login sin cargador; validar que una respuesta de permiso insuficiente no cierre sesión. Confirmar en Network que el API tenant recibe un único `Authorization` y que login no recibe ese header por el interceptor.
- Requisitos de ambiente o datos: tenant de pruebas en dev y acceso autorizado al mecanismo de configuración de dev y producción para fijar `TENANT_JWT_ACCESS_TTL=259200` si ese entorno ya define la variable; no se requiere dato productivo.
- Resultado comunicado por el PO: validado en dev el 2026-08-29; el PO confirmó que el comportamiento quedó correcto y autorizó el cierre.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-08-29",
    "build_reference": "commit:2ec39788da71e8880ac7139d1a14f0c169b369f3",
    "environment": "dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-08-29",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "PO validó en dev el 2026-08-29 y autorizó el cierre."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-08-28",
    "kind": "test",
    "description": "Pruebas Django dirigidas: 3 pruebas exitosas para TTL de 72 horas y códigos de expiración/invalidez.",
    "reference": "worktree:sha256:0000000000000000000000000000000000000000000000000000000000000000",
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-08-28",
    "kind": "test",
    "description": "Specs Angular: interceptor 5/5 y Cierres 1/1 exitosos antes de la limitación conocida de --include; compilación productiva exitosa.",
    "reference": "worktree:sha256:0000000000000000000000000000000000000000000000000000000000000000",
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-08-28",
    "kind": "test",
    "description": "Referencia reproducible de los archivos del ticket al ejecutar las pruebas. Esta evidencia corrige la referencia provisional registrada sin alterar el historial append-only.",
    "reference": "worktree:sha256:b8672f6b6bcf9ac290daaed1c486d191068ad1c75a9aa2347dc4fb06f4297648",
    "point_id": null
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-08-29",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO validó en dev el 2026-08-29 y autorizó el cierre."
  },
  {
    "id": "RETEST-002",
    "date": "2026-08-29",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO validó en dev el 2026-08-29 y autorizó el cierre."
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
    "date": "2026-08-29",
    "technical_summary": "Se estandarizó el JWT tenant a 72 horas, se agregó el interceptor HTTP y códigos de autenticación compatibles.",
    "functional_summary": "El PO validó en dev que la sesión se cierra al expirar y las consultas autenticadas no quedan cargando.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "PO validó en dev el 2026-08-29 y ordenó cerrar el ticket.",
    "release_impact": "El ticket queda cerrado funcionalmente y continúa unreleased; no incluye despliegue productivo."
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
    "date": "2026-08-28",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-08-28",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-08-28",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-08-29",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-08-29",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-08-29",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-08-29",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-08-29",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-08-29",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-08-29",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-08-29",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
