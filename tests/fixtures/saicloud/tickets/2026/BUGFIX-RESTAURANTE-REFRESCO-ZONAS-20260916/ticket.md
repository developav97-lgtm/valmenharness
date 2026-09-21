---
schema_version: 1
id: BUGFIX-RESTAURANTE-REFRESCO-ZONAS-20260916
title: Las zonas y mesas titilan al pulsar repetidamente Actualizar
type: BUGFIX
module: RESTAURANTE
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-16
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# BUGFIX-RESTAURANTE-REFRESCO-ZONAS-20260916

## Solicitud original

En la pantalla del restaurante tenemos un boton de actualizar que refresca las zonas y mesas, y tenemos como los colores rojos y verdes para identificar si estan ocupadas o no. El cliente llega y le da click varias veces seguidas, entonces la parte de las zonas empieza como a titilar intentando refrescarse. A nivel de funcionalidad no hay problema cuando le dan click asi, pero visualmente se ve feo. Se pide revisar el tema del refresco de los colores y si se esta manejando alguna parte de websocket para actualizar esto.

## Descripción funcional

- Alcance: corregir el parpadeo (titileo) de la lista de zonas y de la grilla de mesas de la pantalla Restaurante (`PointComponent`) cuando el usuario pulsa varias veces seguidas el botón `Actualizar`. Incluye la revisión del refresco de colores rojo/verde (ocupada/libre) y del uso de WebSocket en ese flujo. No cambia la funcionalidad de refresco ni el protocolo de WebSocket.
- Usuario o rol afectado: usuarios operativos del restaurante (cajeros, meseros, administradores de sede) que refrescan manualmente el salón.
- Comportamiento actual: cada clic en `Actualizar` ejecuta `reloadData()`, que vuelve a descargar por HTTP `res/levels/` y `res/tables/` a IndexedDB, y llama a `getLevels()` sin guard de concurrencia ni estado deshabilitado del botón. Los guardados de `loadPaginatedData` emiten `dataChanges$` por cada registro, y el componente está suscrito a ese stream con `debounceTime(300)` para volver a llamar `getLevels()`. `getLevels()`/`selectLevel()` leen IndexedDB y reasignan `all_lavels`/`all_tables` con objetos nuevos, y los `*ngFor` de zonas y mesas no tienen `trackBy`; por tanto cada pasada destruye y recrea todo el DOM. Un clic produce al menos dos renderizados completos y varios clics encadenan refrescos solapados: eso se percibe como titileo. Los colores rojo/verde se calculan desde `ResTable.state` (`Busy`/`Free`) y también se actualizan en tiempo real por WebSocket (`model: "Tables"`, `type=sinc`), no solo con el botón.
- Comportamiento esperado: con clics rápidos y repetidos en `Actualizar`, las zonas y mesas se refrescan sin parpadeo perceptible, sin recrear visualmente toda la lista, con el estado final de colores correcto (rojo para `Busy`, verde para `Free`, amarillo para `Reserved`) y sin lanzar cadenas de refresco simultáneas. El WebSocket sigue actualizando la ocupación en tiempo real sin cambios de protocolo, y el resto de la operación (selección de zona, abrir orden, mover mesa, alerta de comandas) conserva su comportamiento.

## Diagnóstico

- Archivos y flujo investigados:
  - `FrontEnd/src/app/mod-restaurant/restaurant/point/point.component.ts:234-243` — `reloadData()` descarga `Levels` y `Tables` con `loadPaginatedData`, llama `getLevels()` sin `await` (línea 241) y `fetchOpenCommands()`; no hay guard de concurrencia, ni botón deshabilitado, ni cancelación de peticiones previas.
  - `FrontEnd/src/app/mod-restaurant/restaurant/point/point.component.ts:209-214` — suscripción a `indexdb.dataChanges$` con `debounceTime(300)` que vuelve a llamar `getLevels()` ante cambios de `Levels` o `Tables`.
  - `FrontEnd/src/app/common/services/IndexDB.service.ts:185-192` — `saveData()` emite `dataChanges$` por cada registro; `:433-472` — `loadPaginatedData()` guarda registro por registro con `saveData`, por lo que un refresco emite una ráfaga de eventos. En contraste, `:473-553` (`loadPaginatedDataParallel`, usado por el resolver de la ruta) guarda en bulk con `saveBulkData` (`:195-210`), que no emite eventos.
  - `FrontEnd/src/app/mod-restaurant/restaurant/point/point.component.ts:386-416` — `getLevels()` lee `getAllData('Levels')` y reasigna `all_lavels`; `:639-684` — `selectLevel()` lee `getAllData('Tables')`, reasigna `all_tables` y calcula clases.
  - `FrontEnd/src/app/mod-restaurant/restaurant/point/point.component.html:34` — `*ngFor="let level of all_lavels"` sin `trackBy`; `:104` — `*ngFor="let table of all_tables"` sin `trackBy` (solo la alerta de comandas usa `trackBy`, `:648`/`:658`).
  - Colores: `point.component.ts:659-675` — zona ocupada si alguna mesa tiene `state == 'Busy'` (`addSelectOcupada`/`bg-ocupada`); `:676-683` — mesa `Free`→`free`, `Busy`→`occupied`, `Reserved`→`reserved`; estilos en `point.component.css:823-844`; modo moderno `table-visual.component.ts:20-25`.
  - WebSocket: `FrontEnd/src/app/common/services/websocket.service.ts:40-49` conexión `wss://services-next.saiopencloud.co/?tenant=...&type=sinc`; los mensajes `{action, model, data}` escriben en IndexedDB y desembocan en `dataChanges$`; el `PointComponent` no se suscribe directo al WS de sync, sino a `dataChanges$` (`:209-214`). Emisión backend: `BackEnd/ModRestaurant/signals.py:13-36` (`post_save` de `ResTable`/`ResLevel` con `model: "Tables"`/`"Levels"`) y `BackEnd/SaiOpenCloud/views.py:132-146` (`sendNotificationWebsocket`). Además, los endpoints de operación de mesas emiten `Tables` al anular, mover, unificar, cambiar usuario/estado y crear/cerrar órdenes (`BackEnd/ModRestaurant/views/functions.py`).
  - Antecedente relacionado: E112 (`docs/errors.md`) — parpadeo de semáforo `Busy↔Free` por carrera de estado; corregido en `BackEnd/ModRestaurant/serializers/settings.py:21-42` con `select_for_update()`.
- Causa raíz o hipótesis: el titileo no es un cambio real de color errático del backend; es consecuencia de recrear el DOM completo en cada pasada (`*ngFor` sin `trackBy` + reasignación de arreglos con referencias nuevas) multiplicado por al menos dos renderizados por clic (el directo de `reloadData` y el debounced del stream `dataChanges$`) y por cadenas de refresco solapadas cuando el usuario hace clics repetidos (sin guard ni cancelación). Los mensajes WebSocket concurrentes de `Tables`/`Levels` añaden llamadas adicionales a `getLevels()`. Los colores finales deberían converger una vez cesan los clics.
- Riesgos y compatibilidad: el cambio propuesto es exclusivamente frontend del componente y sus pruebas. No debe alterar el contrato de WebSocket, la emisión de `dataChanges$`, la carga por sucursal, el filtro de mesas activas, el modo clásico/moderno, el drag&drop de zonas (`cdkDrag`) ni la alerta de comandas atascadas. Si se opta por usar la ruta de guardado en bulk en `reloadData`, hay que preservar la paginación y el manejo de registros malformados. Rollback funcional: revertir los cambios frontend atribuibles al ticket.
- Impactos de sync, migración, Docker o despliegue: `sync_impact: false`, `migration_impact: false`, `docker_impact: false`. WebSocket se consume pero no se modifica (ni cliente, ni servidor, ni contrato), por lo que no aplica el gate crítico de WebSocket. Sin migraciones, sin Docker y sin cambios de despliegue.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-09-16 ("si apruebo"). La aprobación cubre el alcance descrito: guard de concurrencia en el refresco manual, eliminación de la tormenta de eventos y del render duplicado, `trackBy` en zonas y mesas, verificación de que el WebSocket sigue sin cambios y pruebas del componente. No incluye cambios de backend, contrato de WebSocket, OfflineSync, migraciones, Docker, PR, tag ni despliegue.
- Pasos ordenados:
  1. `POINT-001`: añadir un guard de concurrencia en `reloadData()` (por ejemplo `isRefreshing`) que ignore clics repetidos mientras hay un refresco en curso, y deshabilitar visualmente el botón `Actualizar` durante ese lapso breve.
  2. `POINT-001`: eliminar la tormenta de eventos por registro al refrescar manualmente, usando la ruta de guardado en bulk ya existente (`loadPaginatedDataParallel`/`saveBulkData`) para `Levels` y `Tables`, o bien coalesciendo el render para que un clic no produzca dos pasadas completas (directa + debounced).
  3. `POINT-001`: agregar `trackBy` por `id` en los `*ngFor` de zonas (`point.component.html:34`) y mesas (`:104`) para que Angular reutilice los nodos DOM cuando el registro no cambió y actualice solo clases/estado (colores) en sitio.
  4. `POINT-001`: verificar que el refresco por WebSocket (`model: "Tables"`/`"Levels"` → `dataChanges$`) sigue funcionando sin cambios de protocolo y que los colores finales corresponden a `ResTable.state`.
  5. `POINT-001`: agregar/actualizar pruebas Angular del componente (`point.component.spec.ts`): clics repetidos no encadenan refrescos simultáneos, no se rompe la selección de zona ni el filtro de mesas, y el render conserva los nodos cuando los ids no cambian; ejecutar build de desarrollo y la spec dirigida.
- Rollback, backup, canario u orden de despliegue cuando aplique: no requiere backup, canario, migración ni orden cloud/local. El rollback funcional es revertir los cambios frontend atribuibles al ticket antes de publicar. Validación manual primero en un tenant no productivo con varias zonas y mesas.

## Criterios de aceptación

- [ ] POINT-001: con clics rápidos y repetidos en `Actualizar`, las zonas y la grilla de mesas no titilan ni recrean visualmente toda la lista; el estado final de colores es correcto (`Busy` rojo, `Free` verde, `Reserved` amarillo).
- [ ] POINT-001: los clics repetidos no lanzan cadenas de refresco simultáneas ni más de un ciclo de descarga de `Levels`/`Tables` a la vez.
- [ ] POINT-001: el refresco en tiempo real por WebSocket sigue actualizando zonas/mesas sin cambios de protocolo ni del contrato de mensajes.
- [ ] POINT-001: se conserva el comportamiento actual de selección de zona, filtro por sucursal, mesas activas, drag&drop de zonas, modo clásico/moderno, apertura de órdenes y alerta de comandas atascadas.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Las zonas y mesas titilan al pulsar repetidamente Actualizar",
    "status": "closed",
    "severity": "normal",
    "actual": "Cada clic en Actualizar lanza una descarga HTTP de Levels/Tables que emite dataChanges$ por registro y provoca al menos dos renderizados completos (el directo de reloadData y el debounced del stream), sin guard de concurrencia; los *ngFor de zonas y mesas no tienen trackBy, por lo que cada pasada destruye y recrea el DOM y se percibe titileo con clics repetidos. Los colores rojo/verde dependen de ResTable.state y tambien se refrescan por WebSocket (model Tables, type sinc).",
    "expected": "Con clics rapidos y repetidos, zonas y mesas se refrescan sin parpadeo perceptible ni renderizados solapados, con el estado final de colores correcto (Busy rojo, Free verde, Reserved amarillo) y sin cambios de protocolo de WebSocket ni del comportamiento funcional existente.",
    "evidence": [
      "EVIDENCE-001",
      "EVIDENCE-002",
      "EVIDENCE-003",
      "EVIDENCE-004"
    ],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-002",
    "title": "Las zonas hacen un medio movimiento al refrescar aunque no cambie el estado",
    "status": "closed",
    "severity": "normal",
    "actual": "Al pulsar Actualizar (o al llegar un mensaje WebSocket de Tables/Levels), getLevels() asigna all_lavels con state='' y calcula los estados despues de un await en selectLevel(), por lo que Angular renderiza un estado intermedio sin clases de estado; ademas el borde de la zona seleccionada mide 2px y el de las demas 1px o ninguno, asi que cada cambio de estado altera el tamano del boton y desplaza las zonas siguientes. Con transition: all 0.2s el desplazamiento se percibe como un medio movimiento.",
    "expected": "Las zonas deben mantener su tamano y posicion en cada refresco; el estado (seleccionada, ocupada, libre) debe actualizarse en un unico render y sin que el cambio de borde o clases desplace la lista, salvo que exista un cambio real de datos.",
    "evidence": [
      "EVIDENCE-005",
      "EVIDENCE-006",
      "EVIDENCE-007",
      "EVIDENCE-008"
    ],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-003",
    "title": "El boton Actualizar no muestra indicador de carga visible",
    "status": "closed",
    "severity": "low",
    "actual": "Mientras reloadData() corre, el boton Actualizar queda disabled pero visualmente casi no cambia; el usuario no percibe que el refresco esta en curso.",
    "expected": "Mientras el refresco esta en curso, el boton debe mostrar un indicador visible (spinner y/o texto Actualizando) sin desplazar el resto de la barra, y volver a su estado normal al terminar.",
    "evidence": [
      "EVIDENCE-009",
      "EVIDENCE-010",
      "EVIDENCE-011"
    ],
    "affected_files": [],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-005"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- Archivos cambiados: `FrontEnd/src/app/mod-restaurant/restaurant/point/point.component.ts`, `point.component.html`, `point.component.css` y `point.component.spec.ts`.
- Decisiones técnicas: `reloadData()` incorpora el guard `isRefreshing` (un solo refresco a la vez, botón `Actualizar` deshabilitado mientras corre) y usa `loadPaginatedDataParallel` para `Levels`/`Tables`, la misma ruta de guardado en bulk que el resto de pantallas, que no emite `dataChanges$` por registro; así se elimina la ráfaga de eventos que volvía a disparar `getLevels()` por el stream. `getLevels()` ahora se espera dentro del refresco. Los `*ngFor` de zonas y mesas usan `trackByLevelId`/`trackByTableId` por `id`, de modo que Angular reutiliza los nodos DOM cuando el registro no cambió y solo actualiza las clases de color en sitio. Para POINT-002, `getLevels()` y `selectLevel()` ahora construyen y calculan estados de zonas y clases de mesas antes de asignar `all_lavels`/`all_tables` (helpers `loadActiveTables`, `buildLevels`, `buildTablesForLevel` y `applyLevelView`), de modo que cada refresco produce un único render con los estados ya resueltos, sin el estado intermedio sin clases. En CSS, `.addSelect`, `.addSelectOcupada` y `.bg-ocupada` marcan su estado con `outline` (no afecta layout) en vez de `border`, porque el borde de 2px de la zona seleccionada frente al 1px/none del resto cambiaba el alto del botón y desplazaba la lista. Para POINT-003, mientras `isRefreshing` está activo el botón muestra el icono girando (`[class.spin]` con `@keyframes refresh-spin`) y el texto `Actualizando...`, con `min-width: 150px` en `.reload-btn` para reservar el ancho del texto y no desplazar la barra de filtros, más `cursor: progress`.
- Compatibilidad preservada: no se tocó el WebSocket (ni cliente, ni servidor, ni contrato), ni `IndexDB.service.ts`, ni el backend. La suscripción a `dataChanges$` sigue refrescando la vista con los mensajes `Tables`/`Levels` en tiempo real; el refresco manual ya no emite eventos por registro, pero la información escrita en IndexedDB es la misma y el render directo la refleja. La lógica de fallback de sucursal/zona y el comportamiento de `filterTable()` se conservan.
- Commits atribuibles al ticket:
  - `63347ddd5c75b954eed143dc28896c674acba4cb` — evita el titileo de zonas y mesas al refrescar: guard de concurrencia, carga bulk sin tormenta de eventos y trackBy por id.
  - `9bff7ea71d3e6daa7471f3ecb8cf973b3d5d301a` — evita el medio movimiento de las zonas: un solo render con estados calculados y outline en vez de border sin afectar layout.
  - `694f0e4eb1d7aed61ada92f56ac3e44847b8ab98` — indicador de carga en el botón `Actualizar` (POINT-003), publicado a `dev` por el PO junto con la documentación del avance.

## Pruebas

- Comandos para el PO: `cd FrontEnd && npx ng test FrontSaiOpenCloud --watch=false --browsers=ChromeHeadless --include='src/app/mod-restaurant/restaurant/point/point.component.spec.ts'`; `cd FrontEnd && npm run build -- --configuration development`.
- Directorio de ejecución: `FrontEnd/`.
- Resultado esperado: 44 pruebas SUCCESS en la spec dirigida y build de desarrollo con EXIT=0 (verificado localmente el 2026-09-16).
- Validaciones manuales: en un tenant no productivo con varias zonas y mesas ocupadas/libres, pulsar `Actualizar` repetidamente y verificar que las zonas no cambian de tamaño ni de posición y que los colores finales corresponden al estado real (`Busy` rojo, `Free` verde, `Reserved` amarillo); seleccionar distintas zonas y confirmar que la lista no se desplaza; comprobar que durante el refresco el botón muestra `Actualizando...` con el icono girando y sin desplazar la barra, y vuelve a `Actualizar` al terminar; con dos terminales, verificar que un cambio de mesa en una se refleja en la otra por WebSocket sin pulsar `Actualizar`; validar modo clásico/moderno, apertura de órdenes y alerta de comandas atascadas.
- Requisitos de ambiente o datos: tenant no productivo, usuario operativo de restaurante, sucursal con zonas y mesas configuradas y, para la prueba de WebSocket, una segunda terminal o sesión.
- Resultado comunicado por el PO: el 2026-09-16 confirmó que los colores ya no parpadean y que las zonas ya no hacen el medio movimiento; pidió como mejora ver el indicador de carga en el botón `Actualizar` (POINT-003). El 2026-09-17 autorizó el commit y push de ese cambio y pidió cerrar el ticket.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-16",
    "build_reference": "commit:63347ddd5c75b954eed143dc28896c674acba4cb",
    "environment": "despliegue dev; validacion manual del PO",
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
    "result": "changes_requested",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmo el 2026-09-16 que los colores ya no parpadean, pero las zonas siguen haciendo un medio movimiento al refrescar; pide que no se muevan salvo que haya un cambio."
  },
  {
    "id": "QA-003",
    "date": "2026-09-17",
    "build_reference": "commit:9bff7ea71d3e6daa7471f3ecb8cf973b3d5d301a",
    "environment": "despliegue dev; retest manual del PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-004",
    "date": "2026-09-17",
    "build_reference": null,
    "environment": null,
    "result": "changes_requested",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmo que los dos arreglos anteriores quedaron bien y pidio como mejora un indicador de carga visible en el boton Actualizar."
  },
  {
    "id": "QA-005",
    "date": "2026-09-17",
    "build_reference": "commit:694f0e4eb1d7aed61ada92f56ac3e44847b8ab98",
    "environment": "cierre por orden explicita del PO; validacion local registrada",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-006",
    "date": "2026-09-17",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO pidio cerrar el ticket el 2026-09-17 tras autorizar la publicacion del indicador de carga; los arreglos previos fueron confirmados por el en el despliegue."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-16",
    "kind": "code",
    "description": "reloadData() ahora tiene guard isRefreshing, usa loadPaginatedDataParallel (guardado bulk sin emision de dataChanges$ por registro) y espera getLevels(); el boton Actualizar queda disabled mientras refresca.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-16",
    "kind": "code",
    "description": "Los ngFor de zonas y mesas usan trackByLevelId/trackByTableId por id, por lo que Angular reutiliza los nodos DOM al reasignar los arreglos y solo actualiza clases/estado de color.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-16",
    "kind": "test",
    "description": "Spec dirigida de point.component.spec.ts: 42/42 SUCCESS (3 pruebas nuevas: guard de clics repetidos, refresco bulk sin loadPaginatedData por registro y claves estables de trackBy).",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-09-16",
    "kind": "build",
    "description": "npm run build -- --configuration development termino con EXIT=0 (AOT y templates compilan con trackBy).",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-09-16",
    "kind": "code",
    "description": "getLevels()/selectLevel() construyen el estado completo (loadActiveTables, buildLevels, buildTablesForLevel, applyLevelView) y asignan all_lavels/all_tables una sola vez con estados y clases ya calculados, sin el render intermedio con state=''.",
    "reference": null,
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-006",
    "date": "2026-09-16",
    "kind": "code",
    "description": "CSS: .addSelect, .addSelectOcupada y .bg-ocupada marcan estado con outline/outline-offset en vez de border, eliminando la diferencia de tamano (2px vs 1px/none) que desplazaba la lista de zonas.",
    "reference": null,
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-007",
    "date": "2026-09-16",
    "kind": "test",
    "description": "Spec dirigida: 44/44 SUCCESS; 2 pruebas nuevas verifican que getLevels() y selectLevel() asignan zonas/mesas una sola vez con estados finales (captura de asignaciones).",
    "reference": null,
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-008",
    "date": "2026-09-16",
    "kind": "build",
    "description": "npm run build -- --configuration development termino con EXIT=0 tras el refactor y el ajuste CSS.",
    "reference": null,
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-009",
    "date": "2026-09-17",
    "kind": "code",
    "description": "El boton Actualizar muestra icono girando ([class.spin] con @keyframes refresh-spin) y texto 'Actualizando...' mientras isRefreshing esta activo; min-width 150px reserva el ancho para no desplazar la barra.",
    "reference": null,
    "point_id": "POINT-003"
  },
  {
    "id": "EVIDENCE-010",
    "date": "2026-09-17",
    "kind": "test",
    "description": "Spec dirigida: 44/44 SUCCESS; la prueba del guard ahora verifica que isRefreshing queda activo durante el refresco (estado que pinta el indicador).",
    "reference": null,
    "point_id": "POINT-003"
  },
  {
    "id": "EVIDENCE-011",
    "date": "2026-09-17",
    "kind": "build",
    "description": "npm run build -- --configuration development termino con EXIT=0 con el indicador de carga.",
    "reference": null,
    "point_id": "POINT-003"
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
    "po_confirmation": "El PO confirmo el 2026-09-16 que los colores ya no parpadean al refrescar."
  },
  {
    "id": "RETEST-002",
    "date": "2026-09-17",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmo el 2026-09-16 que mejoro: las zonas ya no hacen el medio movimiento al refrescar."
  },
  {
    "id": "RETEST-003",
    "date": "2026-09-17",
    "point_id": "POINT-003",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO autorizo el commit y push del indicador de carga y pidio cerrar el ticket el 2026-09-17; acepta el cierre con las validaciones locales (44/44 y build EXIT=0) y sin retest desplegado de esta mejora visual."
  }
]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional: se eliminó el titileo del refresco manual (guard de concurrencia, carga en bulk sin tormenta de eventos y `trackBy` por id), el medio movimiento de las zonas (estados calculados antes de asignar los arreglos y `outline` en vez de `border`) y se agregó el indicador de carga del botón `Actualizar`. Commits `63347ddd`, `9bff7ea7` y `694f0e4e` publicados en `dev`.
- Resultado comunicado por el PO: el 2026-09-16 confirmó en el despliegue que los colores ya no parpadean y que las zonas ya no se mueven; pidió el indicador de carga y el 2026-09-17 autorizó su commit y push y pidió cerrar el ticket.
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica): QA aprobada por orden explícita de cierre del PO. El retest desplegado de POINT-003 (mejora visual) no se ejecutó: quedó validado localmente con 44/44 pruebas y build EXIT=0, y el PO ordenó cerrar; por ser `unreleased`, puede reabrirse con un hallazgo si algo no se ve bien en producción.
- Riesgo residual e impacto de release: cambio exclusivamente frontend del componente `PointComponent`; sin impacto de sync, migración, Docker, WebSocket ni backend. Riesgo residual bajo: la mejora visual del botón depende de CSS del componente. Impacto de release: el ticket queda cerrado funcionalmente y `unreleased` hasta una futura versión.
- Texto visible al usuario cuando aplique: el botón `Actualizar` muestra `Actualizando...` con el icono girando mientras refresca, y vuelve a `Actualizar` al terminar.

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-17",
    "technical_summary": "Refresco manual de PointComponent sin titileo ni desplazamientos: guard de concurrencia, carga en bulk sin tormenta de eventos, trackBy por id, render unico con estados calculados, outline en vez de border en zonas e indicador de carga en el boton Actualizar.",
    "functional_summary": "El PO confirmo en el despliegue que los colores ya no parpadean y que las zonas ya no se mueven; pidio el indicador de carga, autorizo su publicacion y ordeno cerrar el ticket.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO pidio cerrar el ticket el 2026-09-17 tras autorizar el commit y push del indicador de carga.",
    "release_impact": "El ticket queda cerrado funcionalmente y unreleased hasta una futura version productiva."
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
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
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
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-16",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-16",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-16",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-16",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-16",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-16",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-16",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-16",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-16",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-007."
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
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-17",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-17",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-09-17",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-09-17",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-09-17",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-004 con resultado changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-037",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-038",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-039",
    "date": "2026-09-17",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-009."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-040",
    "date": "2026-09-17",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-010."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-041",
    "date": "2026-09-17",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-011."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-042",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-043",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-044",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-045",
    "date": "2026-09-17",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-046",
    "date": "2026-09-17",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-047",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-048",
    "date": "2026-09-17",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-006 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-049",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-050",
    "date": "2026-09-17",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-051",
    "date": "2026-09-17",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-052",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-053",
    "date": "2026-09-17",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-054",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-055",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
