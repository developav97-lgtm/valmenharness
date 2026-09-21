---
schema_version: 1
id: SECURITY-AUTH-USUARIOS-SIN-AUTENTICACION-20260917
title: AdmUserView responde sin sesion y expone permisos de usuario con AllowAny y JWT opcional
type: SECURITY
module: AUTH
workflow_status: closed
qa_status: waived
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: high
created: 2026-09-17
updated: 2026-09-17
related_ticket: null
target_release: null
released_in: null
---

# SECURITY-AUTH-USUARIOS-SIN-AUTENTICACION-20260917

## Solicitud original

Hallazgo del PO (2026-09-17) durante el diagnostico del incidente de carga infinita en next.<DOMINIO_ALT>: el GET que hace AuthService.refreshUserRecord a api/users/2/ viaja sin Authorization y el backend respondio con datos; AdmUserView (BackEnd/ModAdmin/views/settings.py) no declara permission_classes y el default de DRF es AllowAny, con JWTAuthentication que retorna None cuando falta el header. Solicitud: registrar como deuda de seguridad con diagnostico, alcance, plan y aprobacion del PO; no implementar sin gate.

## Descripción funcional

- Alcance: deuda de seguridad de la API tenant, acotada inicialmente a `GET api/users/<id>/` (`AdmUserView`) y a las vistas que compartan el mismo patrón de permisos. El alcance definitivo se fija en el inventario del Paso 1; no se modifican datos, modelos ni migraciones.
- Usuario o rol afectado: cualquier cliente que alcance el dominio del tenant. El dato servido incluye usuarios con sus permisos y parámetros de facturación.
- Comportamiento actual: `AdmUserView` no declara `permission_classes`; rige el default de DRF `AllowAny` con `JWTAuthentication` opcional (retorna `None` sin header). Un `GET` sin `Authorization` responde 200 con el perfil y sus relaciones precargadas. El propio FrontEnd lo consume así: `AuthService.refreshUserRecord()` llama `general.get('api/users/<id>/', {})` sin token y funciona; el resto del cliente sí usa `authHeaders()`.
- Comportamiento esperado: las lecturas de datos de usuario exigen JWT válido y sesión activa (mismo contrato que ya usan otras vistas endurecidas). Sin token debe responder 401 y el cliente debe enviar el `Authorization` que ya tiene en `localStorage`. Cualquier endpoint que deba seguir siendo público queda eximido de forma explícita y documentada.

## Diagnóstico

- Archivos y flujo investigados:
  - `BackEnd/ModAdmin/views/settings.py:18-26` — `AdmUserView(viewsets.ModelViewSet)` sin `permission_classes`; queryset con `prefetch_related` de `UserInvoice` (permisos y consecutivos), `UserRestaurant`, `UserFactoring`, `UserLogisty`.
  - `BackEnd/SaiOpenCloud/settings.py:324-341` — `REST_FRAMEWORK` con `DEFAULT_PERMISSION_CLASSES = ['rest_framework.permissions.AllowAny']` y `DEFAULT_AUTHENTICATION_CLASSES = ('ModAdmin.authentication.JWTAuthentication',)`.
  - `BackEnd/ModAdmin/authentication.py:10-51` — `JWTAuthentication.authenticate()` retorna `None` cuando no hay header: la vista queda `AllowAny` y responde sin sesión. Con header inválido/expirado/revocado sí lanza `AuthenticationFailed` y añade códigos estables.
  - `FrontEnd/src/app/common/services/auth.service.ts:261-272` — `refreshUserRecord()` no envía `Authorization`; `FrontEnd/src/app/common/services/general.service.ts:348-350, 362-366` — `get()` solo adjunta headers si el llamador los pasa; `authHeaders()` existe y se usa en los preloads y en las vistas endurecidas.
  - Vistas endurecidas de referencia: las que sí exigen usuario autenticado en ModPos/ModRestaurant (patrón citado en los comentarios de `general.service.ts`), y `SECURITY-AUTH-SESION-JWT-20260828` como antecedente de remediación de autenticación.
- Hallazgos del inventario (Paso 1, análisis estático, evidencia EVIDENCE-001/EVIDENCE-002, sin verificación en runtime):
  - El alcance real es mucho mayor que `AdmUserView`: de 202 vistas DRF en las 7 apps tenant, **181 están ruteadas sin exigir sesión** (184 sin protección de 202; 18 tienen protección real) y 5 son código muerto sin URL. No existe middleware ni router global que exija JWT.
  - Prioridad crítica, sin sesión: `GET/POST/PUT/DELETE /api/users/` (usuarios con `password` escribible), `/api/security/` (matriz de permisos), `/api/copy-tenant-data`, `/api/reset-tenant-sequences`, `/api/fix_passwords`, `/api/print-agents/` y su `regenerate-token`, `/api/settings/`, `/api/invoice-params/`, `/api/audit-records` y `/api/general-audit-records`; en receivables `receipts` (todo menos `anular`), `GetCustomerStatement`, `GetCashClosingReport`, `GetAgingDetail`; `GET /api/DeleteRecord/<id>/<model>` (no-DRF) borra registros incluido `AdmUser`.
  - Exposición de secretos sin sesión: `/api/sync-settings/` sirve `smtp_password` y `password_binario` (`fields = '__all__'` de `AdmSettingSyncSerializer`) y `/api/sync-users/` sirve el hash de contraseña. `AdmPrintAgentViewSet.regenerate-token` entrega un token válido de agente.
  - Sincronización machine-to-machine sin credencial: `SyncReceiveView`, `SyncPullView` y `SyncAcknowledgeView` (`OfflineSync/views.py`) aceptan `tenant` en payload/query, lo que permite lectura y escritura cross-tenant sin token. Los 58 endpoints `sync-*` (SincSaiCloud) y los 7 `*_sinc_sai` también responden sin credencial.
  - Endpoints que deben seguir siendo públicos por diseño (login/validación/versión/healthcheck) y los que son M2M requieren una credencial de servicio, no un JWT de usuario; migrarlos a un permiso de usuario rompería SincSaiCloud/OfflineSync/agentes (gates críticos).
- Causa raíz o hipótesis: el default global `AllowAny` es deliberado para endpoints públicos (login, sincronización, agentes), pero ninguna capa exige sesión en el resto; el `JWTAuthentication` opcional no aporta autorización por sí solo. El FrontEnd no falla porque las lecturas funcionan sin token; el hueco quedó oculto por esa comodidad. El fix de la carga infinita de `refreshUserRecord` se atendió en `BUGFIX-FE-CARGA-INFINITA-TIMEOUTS-20260917`; aquí queda el endurecimiento de la API.
- Riesgos y compatibilidad: cerrar el endpoint sin inventariar consumidores puede romper llamadas legítimas sin token (POS/Restaurante, pantallas que hoy usan `general.get` sin headers, posibles clientes legacy). El cambio toca autenticación (gate crítico): exige plan aprobado, inventario, compatibilidad y orden de despliegue. No hay migraciones ni Docker. La remoción del default `AllowAny` no es el único camino; puede endurecerse por vista o por prefijo manteniendo una allowlist explícita de endpoints públicos.
- Impactos de sync, migración, Docker o despliegue: **autenticación** (gate crítico con aprobación explícita del PO). Sin OfflineSync, SincSaiCloud, LocalAgents, WebSocket, migraciones ni Docker. Si el endurecimiento cambia el contrato del endpoint, debe desplegarse backend y frontend de forma coordinada para que `refreshUserRecord` siga enviando el token y no se degrade el login en clientes ya publicados.

## Plan

- Gate de plan y aprobación del PO: plan **aprobado explícitamente por el PO el 2026-09-17** en la sesión de opencode («Apruebo el plan tal como está», con la condición de detenerse antes de tocar código para confirmar la remediación concreta). El gate era exigible: `SECURITY` y autenticación exigen aprobación antes de escribir o divulgar cambios operativos.
- Paso 1 (POINT-001): inventario de vistas tenant sin `permission_classes` (ModAdmin y demás apps del schema) con su clasificación: (a) pública por diseño, (b) debe exigir sesión, (c) requiere análisis adicional. Entregable: lista con archivo, ruta y decisión propuesta; sin cambios de código.
- Paso 2 (POINT-001): verificación en ambiente de desarrollo de que `GET api/users/<id>/` responde sin `Authorization` (evidencia segura, sin datos de cliente) y comprobación de qué consumidores del FrontEnd llaman sin token (`refreshUserRecord` y cualquier otro `general.get/post` sin `authHeaders`).
- Paso 3 (POINT-001): diseño de la remediación aprobada — preferencia por declarar el permiso por vista (JWT válido + sesión activa) con allowlist explícita de endpoints públicos, en lugar de cambiar el default global, para acotar el riesgo de regresión; incluir el ajuste del FrontEnd para enviar `authHeaders()` en las llamadas afectadas.
- Paso 4 (POINT-001): pruebas dirigidas — sin token 401; token válido y sesión activa 200; token revocado/expirado 401; regresión de pantallas que consumen `AdmUser` (Administración > Usuarios, Restaurante, POS) y de los endpoints que permanecen públicos; verificación de login y `refreshUserRecord`.
- Paso 5 (POINT-001): orden de despliegue coordinado backend+frontend en `dev` y validación funcional con el PO antes de QA; sin producción.
- Resultado del Paso 1-2 y decisión del PO (2026-09-17): el inventario (arriba) confirma que la remediación excede un endpoint y no puede hacerse en un solo cambio sin romper M2M (SincSaiCloud/OfflineSync/agentes) y sin inventariar qué llamadas del FrontEnd van sin token. **Decisión del PO: por ahora solo registrar la deuda**; no se implementa remediación ni contención de infraestructura en esta sesión. El ticket queda como el registro canónico del hallazgo para planificar las fases A/B/C cuando el PO lo retome; sigue `in_progress` como estado conservado, sin trabajo en curso.
- Fases propuestas (a confirmar por el PO, cada una con su propio plan y gate de autenticación):
  - Fase A — cerrar los destructivos/cross-tenant y de secretos: `/api/copy-tenant-data`, `/api/reset-tenant-sequences`, `/api/fix_passwords`, `/api/DeleteRecord/...`, `/api/sync-settings` (dejar de servir secretos), `/api/sync-users` (dejar de servir hash), `/api/print-agents/regenerate-token`, `/api/sync/receive|pull|acknowledge` con credencial de agente. Requiere diseño de credencial M2M y compatibilidad con agentes/SincSaiCloud.
  - Fase B — lecturas humanas sensibles: `/api/users/`, `/api/security/`, `/api/audit-records`, `/api/general-audit-records`, `/api/settings/`, `/api/invoice-params/`, receivables y factoring; con el FrontEnd enviando `Authorization` en todas sus llamadas.
  - Fase C — resto de CRUD de catálogos y reportes (grupo b completo) y revisión de las vistas no-DRF del anexo.
- Rollback, backup, canario u orden de despliegue cuando aplique: sin migraciones ni datos persistidos; rollback = revertir los permisos declarados y el envío del token. El despliegue es coordinado (si el backend exige token antes que el frontend lo envíe, las lecturas fallarían): publicar primero el FrontEnd que envía `Authorization` y luego el backend que lo exige, o ambos en el mismo release. Ninguna acción Git/despliegue sin orden explícita del PO.

## Criterios de aceptación

- [ ] POINT-001: inventario completo y clasificado de vistas sin permiso, con decisión documentada por vista (proteger o eximir con motivo).
- [ ] POINT-001: `GET api/users/<id>/` sin token responde 401; con token válido y sesión activa responde 200; con token revocado o expirado responde 401 con el código estable correspondiente.
- [ ] POINT-001: el FrontEnd envía `Authorization` en las llamadas que dependen de sesión y el flujo login → `refreshUserRecord` → navegación no presenta regresiones.
- [ ] POINT-001: los endpoints que deban permanecer públicos quedan eximidos explícitamente y siguen funcionando (login, sincronización y agentes, según el inventario).
- [ ] POINT-001: sin cambios de modelos, migraciones, datos ni esquema; evidencia sin datos de cliente ni secretos en el ticket.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "AdmUserView responde sin JWT y expone usuarios y sus permisos",
    "status": "deferred",
    "severity": "high",
    "actual": "GET api/users/<id>/ se sirve con DRF AllowAny y JWTAuthentication opcional (retorna None sin header). El frontend lo consume sin Authorization (AuthService.refreshUserRecord) y obtiene el perfil completo, incluidos permisos y parametros de facturacion; no se valida sesion activa ni tenant mas alla del resuelto por el dominio.",
    "expected": "El endpoint (y las vistas ModAdmin con el mismo patron, si las hay) exige JWT valido y sesion activa para leer datos de usuario; el frontend envia el Authorization que ya usa el resto de llamadas autenticadas; sin token responde 401 y el cliente lo trata como error recuperable. La remediacion requiere plan aprobado por el PO por tratarse de un cambio de autenticacion.",
    "evidence": [
      "EVIDENCE-001",
      "EVIDENCE-002"
    ],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [],
    "terminal_reason": "El PO decidio el 2026-09-17 registrar el hallazgo como deuda conocida y no remediar por ahora; la remediacion se tratara en un ticket nuevo con plan aprobado por el gate de autenticacion.",
    "related_ticket": null
  }
]
```

## Implementación

- Archivos cambiados: ninguno. Este ticket no modificó código, API ni cliente; documenta el hallazgo y el inventario para planificar la remediación futura.
- Decisiones técnicas: no se intervino la API porque el alcance real (181 vistas sin sesión, endpoints M2M y secretos expuestos) exige fases con plan y gate de autenticación. El incidente reportado se resolvió en `BUGFIX-FE-CARGA-INFINITA-TIMEOUTS-20260917`.
- Compatibilidad preservada: no aplica; no hubo cambios desplegables.
- Commits atribuibles al ticket: ninguno funcional. El registro documental del ticket quedó en el commit de su registración (`a6f58cfe`) y en el commit de cierre.

## Pruebas

- Comandos para el PO: no aplica; no hubo implementación ni cambio funcional que probar.
- Directorio de ejecución: no aplica.
- Resultado esperado: no aplica.
- Validaciones manuales: no aplica.
- Requisitos de ambiente o datos: no aplica.
- Omisión explícita y documentada de pruebas del PO: el PO pidió el 2026-09-17 registrar el hallazgo como deuda y cerrar el ticket sin remediación; no hay prueba funcional posible porque no se tocó código.

## QA

```json
[]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-17",
    "kind": "analysis",
    "description": "Inventario estatico de las 7 apps tenant (ModAdmin, ModPos, ModRestaurant, ModLogisty, ModFactoring, ModReceivables, OfflineSync) — 202 vistas DRF, 18 con proteccion real, 181 ruteadas sin exigir sesion y 5 sin URL registrada. No hubo verificacion en runtime ni en produccion.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-17",
    "kind": "analysis",
    "description": "Criticos sin sesion detectados en analisis estatico — operaciones destructivas o cross-tenant (copy-tenant-data, reset-tenant-sequences, fix_passwords, DeleteRecord no-DRF), datos de usuarios y permisos (/api/users CRUD, /api/security, /api/sync-users con hash de password), configuracion con secretos (/api/sync-settings con smtp_password y password_binario), tokens de agentes de impresion (/api/print-agents y regenerate-token), auditoria (/api/audit-records, /api/general-audit-records), financiero (receivables receipts, GetCustomerStatement, GetCashClosingReport) y sync OfflineSync (sync/receive, sync/pull, sync/acknowledge) que aceptan tenant arbitrario.",
    "reference": null,
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional: sin intervención de código. El ticket conserva el diagnóstico, el inventario de 181 vistas tenant sin sesión (con críticos y endpoints M2M) y las fases A/B/C propuestas; `POINT-001` queda `deferred` para la remediación futura con plan propio.
- Resultado comunicado por el PO: el 2026-09-17 pidió cerrar el ticket como deuda registrada, sin remediación ni contención por ahora.
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica): eximida (`waived`) — no hubo implementación ni prueba funcional posible; el PO confirmó explícitamente cerrar como deuda registrada.
- Riesgo residual e impacto de release: la deuda sigue vigente en producción (prioridad alta en los críticos listados: destructivos/cross-tenant, secretos y usuarios/permisos). No hay cambios desplegables ni impacto de release; cualquier remediación requiere ticket nuevo con plan aprobado por el gate de autenticación.
- Texto visible al usuario cuando aplique: no aplica (sin cambio de comportamiento).

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-17",
    "technical_summary": "Inventario estatico documentado en el ticket y en EVIDENCE-001/002, con fases A, B y C propuestas. Sin cambios de codigo, API ni cliente.",
    "functional_summary": "Sin cambio funcional. El hallazgo de autenticacion queda documentado como deuda para planificar su remediacion futura; el incidente de carga infinita se resolvio en BUGFIX-FE-CARGA-INFINITA-TIMEOUTS-20260917.",
    "qa_status": "waived",
    "qa_waiver_reason": "No hubo implementacion ni prueba funcional posible; el PO decidio registrar el hallazgo como deuda y cerrar sin remediacion por ahora.",
    "po_confirmation": "El PO confirmo el 2026-09-17 cerrar el ticket como deuda registrada, sin remediacion por ahora.",
    "release_impact": "Sin cambios de codigo ni release. El inventario queda documentado como deuda conocida; una remediacion futura requiere ticket nuevo con plan aprobado por el gate de autenticacion."
  }
]
```

## Consumo de IA

<!-- Registros append-only `ai-usage`: consumo conocido o estimado con fuente y confianza. No inventar tokens ni coste; usar null cuando Codex no lo reporte. -->

```json
[]
```

## Release

- Estado de release: `unreleased` — sin cambios de código ni artefactos desplegables.
- Versión objetivo: sin asignar.
- Versión publicada: ninguna.
- Tickets relacionados: `BUGFIX-FE-CARGA-INFINITA-TIMEOUTS-20260917` (incidente del mismo diagnóstico, resuelto y publicado en `dev`).

## Eventos

<!-- Bloque JSON append-only final de objetos con `kind: "ticket-event"`; el CLI agrega uno por cada mutación propia. -->

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-09-17",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-17",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-17",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-17",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-17",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> deferred."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
