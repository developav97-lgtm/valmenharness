---
schema_version: 1
id: BUGFIX-RESTAURANTE-ABRIR-ORDEN-20260917
title: Abrir una orden de restaurante falla con un mensaje genérico y sin causa registrada
type: BUGFIX
module: RESTAURANTE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-17
updated: 2026-09-17
related_ticket: null
target_release: null
released_in: null
---

# BUGFIX-RESTAURANTE-ABRIR-ORDEN-20260917

## Solicitud original

<TENANT> reporta que constantemente, al intentar abrir una orden de restaurante desde el mapa de mesas, aparece 'No se pudo cargar la orden de esta mesa. Vuelve a intentar desde el mapa de mesas'. La consulta en /admin/logs/errors no muestra registros, ni en produccion ni en dev. Evidencia de ALB logs de Ohio (2026-09-17 20:37-20:50 COT, estacion del usuario id 138, sucursal 2): res/get_order respondio HTTP 200 en todos los intentos (mesa 9/orden 10051, mesa 7/orden 10053, mesa 4/orden 10046, mesa 1/orden 10047), sin ningun 5xx en el tenant; el mensaje nace en el cliente tras recibir la orden y el carrito vuelve al mapa. La estacion se recupero sola a las 20:49:43 COT. El PO autoriza corregir tres puntos: (1) registrar la causa real del fallo de carga en el registro de errores operativos por tenant; (2) blindar la carga de la orden: si el tercero, el consecutivo o el menu referenciados por la orden no estan en IndexedDB, consultarlos directamente al backend por id en vez de fallar; (3) corregir el blindaje E144 que lee window.location.pathname y queda inerte con HashLocationStrategy.

## Descripción funcional

- Alcance: carga de una orden existente en el carrito de Restaurante (`restaurant/cart/:tableId/:orderId`) y su recuperación ante datos locales faltantes; registro de la causa real del fallo en el registro de errores operativos por tenant; y corrección del blindaje de identidad de mesa/orden (E144) que hoy queda inerte con `HashLocationStrategy`. No incluye guardado, facturación, comandas, OfflineSync, SincSaiCloud, WebSocket, Docker ni migraciones.
- Usuario o rol afectado: meseros y cajeros del tenant que abren una orden desde el mapa de mesas. Caso reportado: <TENANT>, estación del usuario id 138, sucursal 2, 2026-09-17 20:37–20:50 COT.
- Comportamiento actual: `processOrder()` en `FrontEnd/src/app/common/services/restaurant.service.ts` resuelve el tercero (`id_admpartner` → `AdmPartnerBranch`), el consecutivo y el menú directamente contra IndexedDB sin guardas. Si el registro no está en el caché local de esa estación, el `await` devuelve `undefined` y la línea siguiente lanza `TypeError`; el `.catch()` del `subscribe` de `getResOrder()` Ejecuta `handleOrderLoadError()`, que muestra “No se pudo cargar la orden de esta mesa. Vuelve a intentar desde el mapa de mesas.” y navega de vuelta al mapa. El backend respondió HTTP 200 en todos los intentos del caso reportado, por lo que no queda registro en `OperationalError` (el middleware solo captura respuestas ≥500) y el hecho es indistinguible de un error de red.
- Comportamiento esperado: si la orden referencia un tercero, un consecutivo o un menú que no está en IndexedDB, el carrito lo consulta al backend por id, lo guarda en IndexedDB y continúa la carga sin error. Si la consulta directa tampoco lo encuentra, el usuario recibe un mensaje específico (no el genérico) y el fallo queda registrado en el registro de errores operativos del tenant con la mesa, la orden y la causa, visible en `/admin/logs/errors`. Adicionalmente, el blindaje E144 de identidad de mesa/orden debe comparar contra la URL real de la pestaña (`#/restaurant/cart/...`), no contra un `pathname` que siempre es `/`.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/common/services/restaurant.service.ts` — `checkOrder()` (:806), `handleOrderLoadError()` (:815), `isOrderIdentityValid()` (:829), `reconcileOrderOnVisible()` (:861), `changeConsecutive()` (:1696), `funtionSelectMenu()` (:1015), `preloadIndexDbData()` (:306), `getResOrder()` (:3145) y `processOrder()` (:3188, con la resolución de tercero/consecutivo/menú en :3199–:3203, :3208 y :3287–:3290). Soporte: `FrontEnd/src/app/common/services/DataPreload.service.ts` (precarga condicionada a `hasAnyRecord`), `FrontEnd/src/app/common/services/app.module.ts:49` (`HashLocationStrategy`), `BackEnd/ModAdmin/operational_error_middleware.py:18-27` (solo 5xx) y `BackEnd/ModAdmin/views/operational_errors.py` (solo GET). Evidencia de ALB access logs de Ohio (`saiopencloud-alb-logs-ohio`): entre 01:37:48 y 01:49:43 UTC, cada `GET res/get_order/<id>` respondió 200 con payload válido (3.2–4.2 KB) y fue seguido en menos de un segundo por la re-inicialización del mapa (`res/get_commands` + `pos/get_cash_register_user`), firma del redirect de `handleOrderLoadError()`; no hubo ningún 5xx del tenant en la ventana ni en la noche. La misma estación falló con la mesa 9/orden 10051 y luego la cargó bien 12 minutos después, por lo que el fallo no depende de la orden sino del estado local de la estación; se recuperó tras refrescar el registro del usuario (`api/users/138/`).
- Causa raíz o hipótesis: el fallo es del cliente y ocurre después de recibir la orden: `processOrder()` referencia datos (tercero, sucursal del tercero, consecutivo, menú) que no están en IndexedDB de esa estación —catálogo local que se repuebla por WebSocket y por precarga condicionada a que el store esté vacío— y lanza una excepción no controlada. La hipótesis específica es una referencia local ausente (tercero o consecutivo) en el momento de la carga; se confirma o descarta con la telemetría del POINT-001. Hallazgo independiente verificado: `isOrderIdentityValid()` y `reconcileOrderOnVisible()` leen `window.location.pathname`, que con `HashLocationStrategy` es siempre `/`, por lo que el blindaje E144 nunca se ejecuta en producción (los specs lo prueban con `history.pushState`, que sí escribe el pathname).
- Riesgos y compatibilidad: el carrito es el flujo de trabajo principal del restaurante; la hidratación debe preservar los cálculos de precios, impuestos, consecutivos, menús y líneas existentes, y no debe duplicar registros ni disparar guardados. El endpoint de reporte es nuevo (POST sobre `api/operational-errors/`) y debe mantener el aislamiento por tenant, exigir JWT válido, truncar y sanear el contenido, no aceptar secretos ni datos personales, y no alterar la respuesta al usuario. No se cambian contratos existentes (`res/get_order`, guardado, payloads de IndexedDB ni modelos).
- Impactos de sync, migración, Docker o despliegue: no se modifica OfflineSync, SincSaiCloud, LocalAgents, WebSocket, autenticación, modelos ni migraciones (la tabla `OperationalError` ya existe desde ModAdmin/0053); no hay cambios de Docker ni de despliegue. El despliegue es un release normal de frontend y backend; el POST debe ser tolerante a que el backend aún no lo soporte (el frontend lo llama en modo “fire-and-forget” con captura de error).

## Plan

- Alcance y exclusiones: (a) telemetría de la causa real del fallo de carga con referencia en el registro operativo del tenant; (b) hidratación desde el backend de tercero, consecutivo y menú ausentes en IndexedDB, con mensaje específico si tampoco existen en el servidor; (c) corrección del blindaje E144 para leer la URL real (`hash`). Quedan fuera: reglas de guardado/facturación, comandas, sync, modelos, migraciones, Docker y cambios de autenticación.
- Gate de plan y aprobación del PO: exigible por cambio de comportamiento visible y por la nueva superficie `POST api/operational-errors/`. Aprobado explícitamente por el PO el 2026-09-17 (“si apruebo”), tras presentarle el plan de los tres puntos, sus pruebas y su rollback. Alcance aprobado: `POINT-001`, `POINT-002` y `POINT-003` tal como están descritos en este ticket; cualquier cambio material de alcance exige renovar la aprobación.
- Paso 1 — reporte de la causa real (`POINT-001`; `BackEnd/ModAdmin/views/operational_errors.py`, `BackEnd/ModAdmin/tests/test_operational_errors.py`, `FrontEnd/src/app/common/services/restaurant.service.ts`): extender `OperationalErrorListView` para aceptar `POST` en el mismo path con `module`, `action`, `cause` y `recommendation` saneados y truncados; genera la referencia en servidor si no viene una válida y responde `{reference}`. En el frontend, `handleOrderLoadError()` arma un contexto seguro (mesa, orden, hash y `name`/`message` truncados del error capturado), lo envía en modo fire-and-forget con captura de error y conserva el mensaje actual al usuario. Sin datos personales, tokens ni cuerpos de respuesta en el reporte.
- Paso 2 — hidratación de datos locales (`POINT-002`; `FrontEnd/src/app/common/services/restaurant.service.ts`): helper privado `resolveLocalOrFetch(store, url, id, etiqueta)` que consulta IndexedDB, y si no está, hace `GET` por id (`api/partners/<id>/`, `api/consecutives/<id>/`, `res/menu/<id>/`), guarda el registro en IndexedDB y lo devuelve. Se aplica en `processOrder()` al tercero, al consecutivo (`getConfiguredConsecutiveForOpenOrder` incluido) y al menú (`funtionSelectMenu`), y se blinda `AdmPartnerBranch` (sucursal activa o primera disponible). Si la consulta directa falla, se rechaza con un mensaje nombrando el dato faltante en lugar del mensaje genérico, y se reporta la causa real (Paso 1). Sin cambios a totales, impuestos, líneas, consecutivo asignado ni guardados automáticos.
- Paso 3 — blindaje E144 con URL real (`POINT-003`; `FrontEnd/src/app/common/services/restaurant.service.ts`, `FrontEnd/src/app/common/services/restaurant.service.spec.ts`): `isOrderIdentityValid()` y `reconcileOrderOnVisible()` deben interpretar la ruta desde `window.location.hash` (con fallback a `pathname` para rutas legacy). Actualizar los specs que hoy escriben con `history.pushState` para cubrir el caso hash y conservar el comportamiento en rutas sin parámetros.
- Paso 4 — pruebas (`POINT-001`, `POINT-002`, `POINT-003`; `BackEnd/ModAdmin/tests/test_operational_errors.py`, `FrontEnd/src/app/common/services/restaurant.service.spec.ts`, `FrontEnd/src/app/common/services/data-preload.service.spec.ts` si aplica): POST autenticado, truncado, con referencia generada y aislamiento por tenant, y GET intacto; hidratación de cada store con registro ausente (consulta, guarda y continúa) y con registro inexistente (mensaje específico + reporte); identidad de mesa/orden con hash correcto e incorrecto. Regresión de `checkOrder`, `getResOrder`, `saveOrder` y `backTo` sin cambios.
- Rollback, backup, canario u orden de despliegue cuando aplique: no hay migraciones, esquema ni infraestructura que respalde. El código nuevo es compatible con el backend anterior (el POST falla en silencio y el GET de la orden sigue igual) y con el frontend anterior (el backend solo agrega el verbo POST). Si aparece una regresión, revertir el commit funcional del ticket tras confirmar que no se mezcló con cambios ajenos; la verificación se hace primero en dev.

## Criterios de aceptación

- [ ] `POINT-001`: cuando la carga de una orden falla, queda un registro en `OperationalError` del tenant con módulo, acción y causa que incluye mesa y orden, consultable en `/admin/logs/errors`; el registro no contiene tokens, credenciales, contraseñas ni datos personales del tercero.
- [ ] `POINT-001`: el usuario sigue viendo un mensaje claro y el carrito regresa al mapa como hoy; la falla del reporte no altera ni bloquea esa respuesta.
- [ ] `POINT-002`: con el tercero, el consecutivo o el menú de la orden ausentes de IndexedDB, la orden abre normalmente porque el dato se consulta al backend por id y se guarda en el caché local.
- [ ] `POINT-002`: si el backend tampoco tiene el dato, el usuario recibe un mensaje que nombra el dato faltante (no el genérico) y la causa queda registrada; el carrito no queda en blanco ni bloqueado.
- [ ] `POINT-003`: en una URL `#/restaurant/cart/<mesa>/<orden>`, `isOrderIdentityValid()` detecta la discrepancia cuando la mesa u orden en memoria no coinciden, y `saveOrder()` bloquea el guardado en vez de continuar silenciosamente.
- [ ] `POINT-003`: al volver el foco a una pestaña en segundo plano con identidad válida, la reconciliación se ejecuta según el estado de cambios locales (aviso o refresco), y con identidad inválida devuelve al mapa.
- [ ] Regresión: crear orden, cargar orden existente, confirmar, guardar y facturar siguen funcionando sin cambios; las suites dirigidas de backend y frontend terminan sin fallos.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "La causa real del fallo de carga no queda registrada",
    "status": "closed",
    "severity": "normal",
    "actual": "Cuando la carga de una orden falla en el cliente, el mensaje generico no deja ningun rastro: el registro de errores operativos solo captura respuestas HTTP >=500 y el catch de processOrder descarta la excepcion. En el caso de <TENANT> no hubo ningun registro pese a ~30 intentos fallidos.",
    "expected": "Al fallar la carga, el frontend reporta la causa real (mesa, orden, hash y tipo de error, saneados y truncados) y queda un registro consultable en /admin/logs/errors del tenant, sin exponer secretos ni datos personales.",
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
    "title": "El carrito revienta si el tercero, el consecutivo o el menu no estan en IndexedDB",
    "status": "closed",
    "severity": "high",
    "actual": "processOrder() resuelve order.id_admpartner y el consecutivo con indexdb.getData() sin guardas y accede de inmediato a .AdmPartnerBranch / .id; si el registro no esta en el cache local de la estacion lanza TypeError, el catch muestra el mensaje generico y devuelve al mapa. Evidencia ALB: todos los get_order del caso respondieron 200 y el fallo se repitio 12 minutos hasta refrescar el usuario.",
    "expected": "Si el dato referenciado no esta en IndexedDB, se consulta al backend por id (api/partners/<id>/, api/consecutives/<id>/, res/menu/<id>/), se guarda localmente y la orden abre; si tampoco existe en el backend, se muestra un mensaje especifico que nombra el dato faltante y se registra la causa.",
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
    "title": "El blindaje E144 lee pathname y queda inerte con HashLocationStrategy",
    "status": "closed",
    "severity": "high",
    "actual": "isOrderIdentityValid() y reconcileOrderOnVisible() leen window.location.pathname, pero la aplicacion usa HashLocationStrategy (app.module.ts:49): el pathname siempre es /, la comparacion nunca coincide y el guard siempre devuelve true. La validacion de identidad antes de guardar y la reconciliacion al volver a la pestana no se ejecutan en produccion.",
    "expected": "Ambas funciones interpretan la ruta real desde window.location.hash (con fallback a pathname para rutas legacy), de modo que la identidad de mesa/orden se valida y la reconciliacion se ejecuta; los specs cubren el caso hash.",
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

- Archivos cambiados: `BackEnd/ModAdmin/views/operational_errors.py` (POST en `api/operational-errors/`), `BackEnd/ModAdmin/tests/test_operational_errors.py`, `FrontEnd/src/app/common/services/restaurant.service.ts` (reporte del fallo, hidratación y lectura de URL por hash) y `FrontEnd/src/app/common/services/restaurant.service.spec.ts`.
- Decisiones técnicas: la referencia del reporte la genera siempre el servidor (`CAR-XXXXXXXXXXXX`) para que el cliente no pueda falsificarla ni reutilizar una existente; el contenido se colapsa (espacios/saltos) y se trunca, y el reporte es best-effort (un fallo de red o un cliente HTTP incompleto nunca altera el aviso ni la navegación). La hidratación usa los endpoints existentes por id (`api/partners/<id>/`, `api/consecutives/<id>/`, `res/menu/<id>/`), guarda el registro en IndexedDB y, para la sucursal del tercero, reintenta con `api/partner-branch-list/?id_admpartner=` si el tercero no trae ninguna activa. El mensaje al usuario solo cambia a uno específico cuando el dato faltante tampoco existe en el backend; si no, la carga continúa igual. `currentRouteUrl()` lee el hash y conserva el fallback a pathname para rutas legacy.
- Compatibilidad preservada: contratos de `res/get_order`, guardado, IndexedDB y `OperationalError` intactos; el frontend tolera un backend sin el POST y el backend solo agrega el verbo POST sobre el mismo recurso. Sin migraciones, sin sync, sin Docker ni cambios de autenticación.
- Commits atribuibles al ticket:
  - `d3a654199b88df203aa6e14f6d62bc5d71569ca9` — commit funcional: hidratación de tercero/consecutivo/menú desde el backend, reporte de la causa real del fallo de carga (`POST api/operational-errors/`) y blindaje E144 leyendo la ruta desde el hash; incluye las pruebas backend y frontend del alcance.

## Pruebas

- Comandos para el PO: desde `BackEnd/`, `./.venv/bin/python manage.py test ModAdmin.tests.test_operational_errors --keepdb --verbosity 1`; desde `FrontEnd/`, `npx ng test FrontSaiOpenCloud --watch=false --browsers=ChromeHeadless --include='**/restaurant.service.spec.ts'` y `npm run build -- --configuration development`.
- Directorio de ejecución: `BackEnd/` para Django y `FrontEnd/` para Angular.
- Resultado esperado: las suites dirigidas terminan sin fallos y el build de desarrollo compila; las pruebas cubren POST de errores operativos (auth, truncado, referencia y aislamiento por tenant), hidratación con registro ausente y con registro inexistente, y la identidad de mesa/orden leída desde el hash.
- Validaciones manuales: en dev, abrir una orden existente desde el mapa de mesas con el caché local íntegro (comportamiento normal); luego limpiar únicamente `Partners` o `Consecutives` de IndexedDB del navegador y confirmar que la orden sigue abriendo y que el dato se repuebla; verificar en `/admin/logs/errors` que no aparecen registros falsos en el flujo normal. No se pide provocar el fallo en producción.
- Requisitos de ambiente o datos: tenant de pruebas (dev), usuario con sucursal, mesa con orden abierta, tercero con sucursal activa, consecutivo y menú configurados, y una caja abierta si el rol es cajero. No usar datos productivos ni registrar secretos.
- Resultado técnico local: `ModAdmin.tests.test_operational_errors` ejecutó 8 pruebas exitosas (POST autenticado, saneado/truncado, referencia `CAR-` generada, rechazo sin causa, GET intacto); `restaurant.service.spec.ts` ejecutó 46 pruebas exitosas (hidratación con registro ausente, mensaje específico con registro inexistente, identidad por `hash` e identidad por pathname legacy); `npm run build -- --configuration development` finalizó correctamente (hash `bfefb8783dc3ba67`).
- Resultado comunicado por el PO: el 2026-09-17 el PO confirmó que validó el flujo en dev (“ya validé en dev”) y ordenó cerrar el ticket con QA aprobada. Los pipelines de dev (`saiopencloud-back-dev-ohio` y `saiopencloud-front-dev`) habían terminado en `Succeeded` con el commit funcional del ticket.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-17",
    "build_reference": "commit:d3a654199b88df203aa6e14f6d62bc5d71569ca9",
    "environment": "dev validado por el PO",
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
    "po_confirmation": "El PO confirma que validó el flujo en dev y autoriza el cierre del ticket (2026-09-17)."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-17",
    "kind": "automated",
    "description": "Verificacion local: ModAdmin.tests.test_operational_errors 8/8 OK (POST autenticado, saneado y truncado, referencia CAR- generada por servidor, rechazo sin causa, GET intacto); restaurant.service.spec.ts 46/46 OK (hidratacion de tercero/consecutivo ausentes, mensaje especifico cuando el backend tampoco los tiene, identidad mesa/orden por hash y por pathname legacy); build Angular de desarrollo OK (hash bfefb8783dc3ba67).",
    "reference": null,
    "point_id": null
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-09-17",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma que validó el flujo en dev y autoriza el cierre del ticket (2026-09-17)."
  },
  {
    "id": "RETEST-002",
    "date": "2026-09-17",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma que validó el flujo en dev y autoriza el cierre del ticket (2026-09-17)."
  },
  {
    "id": "RETEST-003",
    "date": "2026-09-17",
    "point_id": "POINT-003",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma que validó el flujo en dev y autoriza el cierre del ticket (2026-09-17)."
  }
]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional: la carga de una orden dejó de depender de que el catálogo local de la estación estuviera completo: tercero, consecutivo y menú ausentes en IndexedDB se resuelven consultándolos al backend por id y guardándolos en el caché; la sucursal del tercero reintenta con `partner-branch-list` cuando no viene activa. Un fallo real de carga ahora deja un registro `CAR-` en el registro operativo del tenant con mesa, orden, ruta y tipo de error, y el blindaje E144 por fin compara contra la ruta real (`hash`) en vez de un `pathname` que siempre era `/`.
- Resultado comunicado por el PO: el 2026-09-17 confirmó que validó el flujo en dev y ordenó el cierre con QA aprobada.
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica): QA aprobada (QA-002); los tres puntos quedaron `closed` con retests aprobados y la confirmación explícita del PO.
- Riesgo residual e impacto de release: no se confirmó en producción la causa raíz que degradó la estación de <TENANT> durante 12 minutos (se recuperó sola); el POINT-001 ahora la captura con referencia de soporte si vuelve a ocurrir. El cambio es compatible con el backend anterior (el POST falla en silencio) y no toca guardado, facturación, sync ni esquema. Queda `unreleased` hasta su inclusión explícita en una versión.
- Texto visible al usuario cuando aplique: se conserva “No se pudo cargar la orden de esta mesa. Vuelve a intentar desde el mapa de mesas.”; si el dato faltante tampoco existe en el backend, el mensaje nombra el dato (“No se pudo cargar el tercero/consecutivo/menú de esta orden. Vuelve a intentar desde el mapa de mesas.”).

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-17",
    "technical_summary": "Se corrigió la carga de órdenes de restaurante: hidratación por id desde el backend de tercero/consecutivo/menú ausentes en IndexedDB, reporte de la causa real con referencia CAR- en el registro operativo por tenant y blindaje E144 leyendo la ruta desde window.location.hash. Pruebas: ModAdmin.tests.test_operational_errors 8/8, restaurant.service.spec.ts 46/46, build Angular de desarrollo OK. Dev desplegado y validado por el PO.",
    "functional_summary": "Abrir una orden con el caché local incompleto ya no falla: el dato se consulta directo al backend y la orden carga; si el dato tampoco existe, el mensaje nombra qué falta y la causa queda registrada para soporte en /admin/logs/errors.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirma que validó el flujo en dev y autoriza el cierre del ticket (2026-09-17).",
    "release_impact": "Cierre funcional; permanece unreleased hasta su inclusión explícita en una versión."
  }
]
```

## Consumo de IA

<!-- Registros append-only `ai-usage`: consumo conocido o estimado con fuente y confianza. No inventar tokens ni coste; usar null cuando Codex no lo reporte. -->

```json
[]
```

## Release

- Estado de release: unreleased.
- Versión objetivo: pendiente.
- Versión publicada: null.
- Tickets relacionados: ninguno.

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
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-17",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-17",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-17",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-17",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-17",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-17",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-17",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-17",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
