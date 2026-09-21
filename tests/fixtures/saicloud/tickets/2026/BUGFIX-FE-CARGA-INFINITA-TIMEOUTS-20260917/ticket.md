---
schema_version: 1
id: BUGFIX-FE-CARGA-INFINITA-TIMEOUTS-20260917
title: El listado de facturas y los preloads pueden quedar cargando para siempre ante backend lento o IndexedDB bloqueada
type: BUGFIX
module: FE
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: true
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

# BUGFIX-FE-CARGA-INFINITA-TIMEOUTS-20260917

## Solicitud original

Reporte del PO (2026-09-17, next.<DOMINIO_ALT>, tenant <TENANT>): tras login, al entrar a Restaurante > carrito > Facturas (/restaurant/posorders) el listado quedo 'Cargando documentos...' indefinidamente. Consola: TimeoutError de AuthService.refreshUserRecord al GET api/users/2/ (timeout 8s), mensaje CORS sin Access-Control-Allow-Origin para la misma URL cross-origin (next.<DOMINIO_ALT> -> <TENANT>.<DOMINIO>) y frames de IndexDBService.initDB/openDB. Al recargar la pagina cargo normal. Solicitud: endurecer los caminos de carga para que un backend lento/caido o una IndexedDB bloqueada produzcan error visible en tiempo acotado en vez de carga infinita.

## Descripción funcional

- Alcance: FrontEnd compartido. Caminos de carga que dependen de red e IndexedDB: `IndexDBService.initDB/ensureDBReady/hasAnyRecord/loadData/loadPaginatedData/loadPaginatedDataParallel`, `DataPreloadService.preloadCollections`, los resolvers de Restaurante/POS/Admin que los usan y el listado de facturas de Restaurante/POS (`pos-orders`). No se toca el motor OfflineSync, el contrato con el backend ni el esquema de la base local.
- Usuario o rol afectado: operadores de cualquier tenant (caso observado: `<TENANT>` desde `next.<DOMINIO_ALT>`, 2026-09-17). Aplica a Restaurante, POS y Administración porque comparten los mismos preloads.
- Comportamiento actual: si el backend del tenant no responde dentro del tiempo esperado, o si la conexión IndexedDB queda bloqueada (upgrade de versión pendiente con otra pestaña/ventana vieja abierta), la pantalla queda en carga indefinida. En Facturas: el spinner «Cargando documentos...» controlado por `general.load` no se apaga nunca; en los resolvers: el overlay global de `LoadingService` («Cargando colecciones...») permanece, y no hay error visible ni salida más que recargar la página completa.
- Comportamiento esperado: cada espera con dependencia de red o IndexedDB termina en tiempo acotado. Si falla, el overlay/spinner se apaga, aparece un aviso de error recuperable y la navegación sigue siendo posible; una IndexedDB bloqueada se detecta y se informa, sin borrar datos locales ni recrear la base. La carga normal (backend sano) conserva el comportamiento actual.

## Diagnóstico

- Archivos y flujo investigados:
  - `FrontEnd/src/app/common/services/auth.service.ts:261-272` — `refreshUserRecord()` hace `GET api/users/<id>/` con `timeout(8000)`; el error está capturado y no bloquea el login, pero deja el perfil cacheado sin refrescar.
  - `FrontEnd/src/app/common/services/general.service.ts:161-174` — `getDomain()` arma la URL con `localStorage.tenant`; desde `next.<DOMINIO_ALT>` toda la API es cross-origin hacia `{tenant}.<DOMINIO>`.
  - `FrontEnd/src/app/common/services/IndexDB.service.ts:37-183` — `initDB()` abre `openDB('SaiOpenCloudDB', 38, { upgrade })` sin manejadores `blocked`/`blocking`/`terminated`; si el upgrade queda bloqueado, la promesa nunca resuelve. `ensureDBReady()` no es single-flight: varias llamadas concurrentes pueden disparar `initDB()` en paralelo.
  - `FrontEnd/src/app/common/services/IndexDB.service.ts:415-471, 473-503` — `loadData`/`loadPaginatedData`/`loadPaginatedDataParallel` usan `toPromise()` sin timeout; en `loadPaginatedDataParallel` las páginas se piden con `http.get(...)` sin límite de espera. Un backend colgado suspende la promesa para siempre.
  - `FrontEnd/src/app/common/services/DataPreload.service.ts:11-52` — `preloadCollections()` espera esos loaders dentro de los resolvers; no propaga error ni libera el overlay de `LoadingService`.
  - `FrontEnd/src/app/mod-restaurant/layout/restaurant-layout.resolver.ts:7-23` y `FrontEnd/src/app/Compartidos/Pos/orders/pos-orders/pos-orders.resolver.ts:6-11` — resolvers de la ruta `/restaurant/posorders` (entrada a «Facturas»).
  - `FrontEnd/src/app/common/services/point-of-sale.service.ts:168-182` — `getOrders()` hace `POST pos/get_orders` con `responseType: 'text'` sin timeout.
  - `FrontEnd/src/app/Compartidos/Pos/orders/pos-orders/pos-orders.component.ts:131-154` — `subscribe((csv) => ...)` sin callback de error; `general.load` se pone en `true` antes de la llamada y solo se apaga en el `complete`/`error` de `parseCsv`. Ante error de red la pantalla queda «Cargando documentos...» para siempre.
  - `FrontEnd/src/app/app.component.html` — overlay global ligado a `LoadingService`; solo se apaga cuando el preload resuelve.
  - Precedente documentado: `docs/errors.md:859` (E135) describe exactamente el hueco de `initDB()` sin `blocked`/`blocking` y quedó como hallazgo no corregido; E184 documenta el mismo patrón para `logout()`.
- Causa raíz o hipótesis: dos condiciones de disparo reales —(a) backend del tenant lento/caído, evidenciado por `TimeoutError` a los 8 s en `api/users/2/` y por la respuesta sin `Access-Control-Allow-Origin` (con `CORS_ALLOW_ALL_ORIGINS = True` en `BackEnd/SaiOpenCloud/settings.py:386`, una respuesta sana de Django siempre trae esa cabecera; que falte apunta a una respuesta no emitida por Django: 502/503/504 del ALB/CloudFront, task ECS reiniciándose o corte de red), y (b) IndexedDB bloqueada durante un upgrade de versión con otra conexión vieja abierta— amplificadas por los huecos del FrontEnd: timeouts ausentes en los preloads y en `getOrders`, y ausencia de manejo de error en el subscribe del listado. Sin los huecos del FrontEnd, cualquiera de las dos condiciones se habría visto como error acotado en lugar de carga infinita. La consulta de logs AWS (ALB/CloudWatch de Ohio para `<TENANT>` en la hora del incidente) queda pendiente y no bloquea el endurecimiento.
- Riesgos y compatibilidad: `initDB()` es compartido por toda la app; un manejo incorrecto de `blocked`/`blocking` o un timeout demasiado agresivo puede romper la carga de datos de todos los tenants. El endurecimiento debe preservar: mismo nombre y versión de base (`SaiOpenCloudDB` v38), ninguna eliminación/recreación de stores, y compatibilidad con la carga lenta legítima (páginas de 200 registros en redes lentas). Los timeouts deben ser holgados (≥20 s) y solo cambiar el caso patológico por un error visible. No se modifica el contrato de datos con el backend ni el motor de sincronización; la base local sigue siendo la misma fuente para POS/Restaurante.
- Impactos de sync, migración, Docker o despliegue: sin migraciones, sin Docker y sin cambios en OfflineSync/SincSaiCloud/WebSocket/autenticación. Despliegue únicamente de FrontEnd. IndexedDB alimenta los flujos offline de POS/Restaurante, por lo que el cambio se limita a la apertura/espera de la base y a los loaders, sin alterar escrituras, natural keys ni colas.

## Plan

- Gate de plan y aprobación del PO: plan **aprobado explícitamente por el PO el 2026-09-17** en la sesión de opencode («Apruebo el plan tal como está»). El gate era exigible porque el paso sobre `initDB()` toca el arranque de datos compartido por todos los tenants y cambia comportamiento visible (deja de haber carga infinita y pasa a haber error con reintento).
- Paso 1 (POINT-001): `IndexDBService.initDB()` — agregar manejo de `blocked`/`blocking`/`terminated` y una espera acotada con error claro cuando el upgrade no puede completarse (sin borrar ni recrear la base). `ensureDBReady()` pasa a ser single-flight (una sola promesa de inicialización compartida) para evitar aperturas concurrentes. Ownership: `FrontEnd/src/app/common/services/IndexDB.service.ts`.
- Paso 2 (POINT-001): `loadData()`, `loadPaginatedData()` y `loadPaginatedDataParallel()` — agregar timeout holgado a las peticiones (valor a definir en implementación, ≥20 s) y propagar el fallo de forma explícita al llamador, conservando la tolerancia por página/registro ya existente. Ownership: `FrontEnd/src/app/common/services/IndexDB.service.ts`.
- Paso 3 (POINT-001): `DataPreloadService.preloadCollections()` — capturar el fallo de cada colección, registrar el motivo y liberar siempre el estado del overlay (`LoadingService`) para que ningún resolver deje la UI colgada. Ownership: `FrontEnd/src/app/common/services/DataPreload.service.ts`.
- Paso 4 (POINT-001): `PosOrdersComponent` — agregar callback de error al subscribe de `consultar$`: apagar `general.load` y mostrar `notificationError` con mensaje recuperable («No se pudo cargar el listado. Verifique la conexión e intente de nuevo.»). Ownership: `FrontEnd/src/app/Compartidos/Pos/orders/pos-orders/pos-orders.component.ts`.
- Paso 5 (POINT-001): pruebas unitarias dirigidas — inicialización de IndexedDB con apertura bloqueada (timeout/error, sin pérdida de datos), preload con fallo de red que no deja overlay pendiente y listado de facturas con error HTTP que apaga el spinner. Ownership: specs de los tres servicios/componente.
- Paso 6 (POINT-001): verificación manual reproducible con DevTools (offline y bloqueo simulado) y entrega al PO de comandos, resultado esperado y validaciones antes de QA.
- Fuera de alcance (explícito): el hallazgo de autenticación de `api/users/<id>/` se trata en `SECURITY-AUTH-USUARIOS-SIN-AUTENTICACION-20260917`; no se cambia aquí el contrato de `refreshUserRecord`.
- Rollback, backup, canario u orden de despliegue cuando aplique: sin datos persistentes ni migraciones, no requiere backup. Rollback = revertir el commit de FrontEnd; no hay cambio de infraestructura ni de orden de despliegue (el FrontEnd se publica por el pipeline de `dev`). Ninguna acción Git/despliegue se ejecuta sin orden explícita del PO.

## Criterios de aceptación

- [ ] POINT-001: con el backend del tenant caído (o DevTools en offline) al entrar a `/restaurant/posorders`, en un tiempo acotado se apaga el overlay/spinner y aparece un error visible; la navegación sigue operativa sin recargar la página.
- [ ] POINT-001: una apertura de IndexedDB bloqueada por otra conexión vieja no deja la app en carga infinita: la app informa y permite reintentar, sin borrar ni recrear datos locales.
- [ ] POINT-001: la carga normal (backend sano, IndexedDB libre) no cambia de comportamiento ni de tiempos perceptibles en Restaurante, POS y Administración.
- [ ] POINT-001: no se modifican el nombre ni la versión de la base local ni la forma de los datos almacenados.
- [ ] POINT-001: pruebas unitarias nuevas/actualizadas en verde y build de FrontEnd sin errores atribuibles al ticket.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Carga infinita en Facturas y en los preloads cuando el backend del tenant no responde o IndexedDB queda bloqueada",
    "status": "closed",
    "severity": "high",
    "actual": "Con backend del tenant lento/caido (evidencia: TimeoutError a los 8s en AuthService.refreshUserRecord y respuesta sin Access-Control-Allow-Origin para api/users/2/) o con IndexedDB bloqueada (initDB/openDB v38 sin manejadores blocked/blocking), los resolvers de Restaurante/POS/Admin y el listado de facturas quedan en carga indefinida: loadPaginatedDataParallel y getOrders usan toPromise() sin timeout, el subscribe de pos-orders no maneja error y deja general.load=true, y el overlay de LoadingService no se apaga. Solo un F5 recupera la pantalla.",
    "expected": "Toda carga con dependencia de red o IndexedDB termina en tiempo acotado: si falla, el overlay/spinner se apaga y se muestra un error visible con opcion de reintentar; una IndexedDB bloqueada se detecta y no cuelga la navegacion; la carga normal no cambia su comportamiento ni se borran datos locales.",
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
  }
]
```

## Implementación

- Archivos cambiados:
  - `FrontEnd/src/app/common/services/IndexDB.service.ts` — `initDB()` ahora es single-flight (`dbInitPromise`) y delega en `openDatabase()`, que envuelve `openDB` con manejadores `blocked`/`blocking`/`terminated` y un límite de espera (`DB_OPEN_TIMEOUT_MS = 15000`); si el upgrade no puede completarse, rechaza con un mensaje explícito en lugar de quedar pendiente. `blocking` cierra la conexión propia para permitir el upgrade de la pestaña nueva; `terminated` reinicia la conexión para el próximo uso. `ensureDBReady()` retorna `initDB()` y `db` pasa a `IDBPDatabase | null`. Los 4 loaders (`loadData`, `loadPaginatedData`, `loadPaginatedDataParallel` primera página y páginas en worker) usan `firstValueFrom(http.get(...).pipe(timeout(HTTP_LOAD_TIMEOUT_MS = 30000)))`. `clearStore()` usa la conexión obtenida de `ensureDBReady()` en lugar de `this.db`. El constructor ya no ignora el error de inicialización: lo registra.
  - `FrontEnd/src/app/common/services/DataPreload.service.ts` — `preloadCollections()` captura el fallo de `hasAnyRecord` por colección (registra y omite la carga) y el fallo de `loadPaginatedDataParallel` por colección (registra y continúa), garantizando que el preload termine y libere el overlay.
  - `FrontEnd/src/app/Compartidos/Pos/orders/pos-orders/pos-orders.component.ts` — `ngOnInit()` lee IndexedDB dentro de un `try/catch`, valida que el usuario exista y usa `setting?.`/`UserInvoice?.[0]`; si falta el perfil o falla la base local, apaga `general.load` y avisa con `notificationError` sin llamar al backend. El subscribe de `pos/get_orders` ahora tiene callback de error que apaga `general.load` y avisa al usuario.
  - `FrontEnd/src/app/common/services/IndexDB.service.spec.ts`, `FrontEnd/src/app/common/services/DataPreload.service.spec.ts`, `FrontEnd/src/app/Compartidos/Pos/orders/pos-orders/pos-orders.component.spec.ts` — pruebas nuevas.
- Decisiones técnicas: no se cambió el nombre ni la versión de `SaiOpenCloudDB` (sigue v38) ni la forma de los datos; no se elimina ni recrea ningún store. Los timeouts son holgados (15 s apertura, 30 s por request) para no afectar cargas lentas legítimas. `blocked` espera hasta el límite antes de rechazar (la pestaña vieja puede cerrarse sola); `blocking` sí cierra la conexión propia porque la pestaña que pide el upgrade es la que corre la versión nueva. Se usó `firstValueFrom` en lugar de `toPromise()` (deprecado) sin cambiar el manejo de errores existente por página/registro.
- Compatibilidad preservada: misma API pública del servicio (`initDB` ahora declara `Promise<IDBPDatabase>` y ningún llamador usaba el retorno), mismos stores/índices, mismos flujos de escritura y de OfflineSync sin tocar. No hay migraciones, Docker ni cambios de backend.
- Commits atribuibles al ticket:
  - `e86a038d1200dda2df001419f8746063190c3524` — commit funcional: `initDB` con `blocked`/timeout y single-flight, timeouts en los loaders HTTP de IndexedDB, captura por colección en `preloadCollections`, guardas y callback de error en el listado de facturas, y las tres specs nuevas.

## Pruebas

- Comandos para el PO:
  - `npx tsc --noEmit -p tsconfig.spec.json`
  - `CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/common/services/IndexDB.service.spec.ts'`
  - `CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/common/services/DataPreload.service.spec.ts'`
  - `CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/Compartidos/Pos/orders/pos-orders/pos-orders.component.spec.ts'`
  - `npm run build -- --configuration=development --progress=false`
- Directorio de ejecución: `FrontEnd`.
- Resultado esperado: `tsc` sin errores; 2/2 + 2/2 + 3/3 specs en verde (bloqueo de IndexedDB con mensaje explícito, preload que resuelve aunque falle una colección, listado que apaga el spinner y avisa ante error); build Angular con código 0. (Con varios `--include` a la vez el builder de Angular 14 emite un segundo pase con un mensaje conocido de patrón; por eso se ejecuta uno por comando.)
- Validaciones manuales:
  1. Con sesión válida en un tenant de pruebas, entrar a Restaurante > Facturas y confirmar que el listado carga igual que antes.
  2. En DevTools > Network > Offline, entrar a Restaurante > Facturas: en ≤30 s debe apagarse el spinner, verse el aviso de error y la app debe seguir navegable; volver a online y reintentar debe cargar normal.
  3. Reproducir el bloqueo de IndexedDB: abrir la app en dos pestañas del mismo origen con una versión anterior de la base (o dejar una pestaña vieja abierta mientras se publica una build con upgrade); la pestaña nueva no debe quedar cargando para siempre: debe informar el bloqueo y permitir reintentar al cerrar la pestaña vieja. Verificar que no se pierden datos locales (POS/Restaurante siguen viendo productos/usuarios).
  4. Confirmar que cerrar la pestaña nueva/recargar no deja avisos rojos ni errores de consola distintos a los esperados durante la prueba.
- Requisitos de ambiente o datos: navegador de escritorio con DevTools, una sesión de tenant de pruebas con permiso de ver facturas, y datos del día para el listado. No se requieren credenciales ni datos del cliente en el ticket.
- Resultado técnico (local, 2026-09-17): `tsc --noEmit -p tsconfig.spec.json` sin salida (0 errores). Specs: `IndexDB.service` 2/2, `DataPreload.service` 2/2, `pos-orders.component` 3/3, todos con código de salida 0. Build de desarrollo OK, hash `4a52ac0f0cc30531`, 38.4 s. Este resultado es verificación local y no sustituye la prueba del PO.
- Resultado comunicado por el PO: validado en dev el 2026-09-17: «listo pues ya no me pasa» — el listado de facturas ya no queda en carga indefinida y el aviso de error aparece cuando corresponde.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-17",
    "build_reference": "commit:e86a038d1200dda2df001419f8746063190c3524",
    "environment": "dev (nube)",
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
    "po_confirmation": "El PO confirmó el 2026-09-17 que el problema ya no ocurre tras publicar el fix en dev y pidió cerrar el ticket."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-17",
    "kind": "manual",
    "description": "Validacion del PO en dev el 2026-09-17 sobre el commit funcional — reporta que el cuelgue del listado de facturas ya no ocurre.",
    "reference": "commit:e86a038d1200dda2df001419f8746063190c3524",
    "point_id": "POINT-001"
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
    "po_confirmation": "El PO confirmó en dev que ya no le ocurre el cuelgue del listado de facturas."
  }
]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional: `initDB()` de IndexedDB maneja `blocked`/`blocking`/`terminated` con espera acotada y reapertura, los loaders usan timeouts holgados, `preloadCollections` captura fallos por colección y el listado de facturas valida el perfil local y maneja el error de la consulta. Con backend lento o IndexedDB bloqueada la pantalla ya no queda cargando sin fin: falla en tiempo acotado, avisa y permite reintentar; la carga normal no cambió.
- Resultado comunicado por el PO: validado en dev el 2026-09-17 («listo pues ya no me pasa») y pidió cerrar el ticket. Evidencia EVIDENCE-001 y retest RETEST-001.
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica): QA-002 aprobada con confirmación explícita del PO; no se usó exención.
- Riesgo residual e impacto de release: no se elimina la causa externa (backend del tenant lento o caído), pero deja de producirse el cuelgue; el cambio no toca datos, migraciones ni infraestructura y continúa `unreleased` hasta la promoción formal a producción.
- Texto visible al usuario cuando aplique: «No se pudo cargar el listado de facturas. Verifique la conexión e intente de nuevo.»; «No se pudo leer el perfil del usuario desde la base local. Recargue la página e intente de nuevo.»; «La base local está bloqueada por otra pestaña o ventana con una versión anterior de SaiOpenCloud. Cierre las demás pestañas e intente de nuevo.»

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-17",
    "technical_summary": "initDB de IndexedDB con manejo de blocked y timeout, single-flight y reapertura; timeouts en los loaders HTTP de preloads; captura por coleccion en preloadCollections; guardas por perfil ausente y callback de error en el listado de facturas. Pruebas locales 7 de 7 specs, tsc y build OK. Commit funcional e86a038d1200dda2df001419f8746063190c3524 publicado en dev.",
    "functional_summary": "Ante backend lento o IndexedDB bloqueada, el listado de facturas y los preloads ya no quedan cargando para siempre. La carga falla en tiempo acotado con aviso visible y reintento; la carga normal no cambia.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó en dev el 2026-09-17 que ya no le ocurre y pidió cerrar el ticket.",
    "release_impact": "Publicado en dev con el commit e86a038d1200dda2df001419f8746063190c3524; continúa unreleased hasta la promoción formal a producción."
  }
]
```

## Consumo de IA

<!-- Registros append-only `ai-usage`: consumo conocido o estimado con fuente y confianza. No inventar tokens ni coste; usar null cuando Codex no lo reporte. -->

```json
[]
```

## Release

- Estado de release: `unreleased` — publicado en `dev` (commits `e86a038d1200dda2df001419f8746063190c3524`, `a6f58cfe`, `743297c9`); pendiente de promoción formal a producción.
- Versión objetivo: sin asignar.
- Versión publicada: ninguna.
- Tickets relacionados: `SECURITY-AUTH-USUARIOS-SIN-AUTENTICACION-20260917` (hallazgo detectado en el mismo diagnóstico; deuda registrada sin remediar).

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
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-17",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-17",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-17",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-17",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-17",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
