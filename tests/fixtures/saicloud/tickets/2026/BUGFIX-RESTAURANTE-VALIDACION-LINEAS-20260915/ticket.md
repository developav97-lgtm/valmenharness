---
schema_version: 1
id: BUGFIX-RESTAURANTE-VALIDACION-LINEAS-20260915
title: Impedir descuentos inválidos y facturación de productos no habilitados
type: BUGFIX
module: RESTAURANTE
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: high
created: 2026-09-15
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# BUGFIX-RESTAURANTE-VALIDACION-LINEAS-20260915

## Solicitud original

Validar que una línea de restaurante nunca propague NaN en descuento o totales, y bloquear el guardado/facturación cuando la categoría de su producto ya no esté habilitada para la sucursal.

## Descripción funcional

- Alcance: creación, actualización, confirmación y facturación de órdenes de Restaurante mediante `res/create_update_order`; cubre la validez numérica de descuentos/totales y la disponibilidad de cada línea según el modo configurado en `AdmCompanyBranchRestaurant.restaurant_menu`.
- Usuario o rol afectado: meseros y cajeros que mantienen o facturan órdenes abiertas de Restaurante.
- Comportamiento actual: un descuento no numérico puede llegar a la línea y mostrar `NaN%`, contaminando el total y terminando en un fallo de guardado. Si se retira de la sucursal la categoría de una línea ya agregada, la interfaz puede marcarla visualmente, pero aún permite facturarla y el backend la acepta.
- Comportamiento esperado: una orden solo se guarda o factura con importes finitos y líneas disponibles para su sucursal: por categoría cuando no opera por menú, o por ítem activo del menú seleccionado cuando `restaurant_menu` está activo. El usuario recibe una explicación concreta para corregir la línea, sin crear ni facturar datos inválidos.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/common/services/restaurant.service.ts` convierte el descuento con `Number(...)` en `saveLine`, `changePriceSelectOptions` y el totalizador sin comprobar si el resultado es finito. `proccessLines` detecta que un producto ya no está en `all_products` tras filtrar `BranchCategory`, pero no copia `err` al objeto renderizado; `showPayment` busca precisamente ese flag. Cuando `restaurant_menu` está activo, el mismo servicio omite el filtro de `BranchCategory`, exige/selecciona un menú y construye el catálogo desde `ResMenuItem.active`. `BackEnd/ModRestaurant/views/functions.py:create_update_order` persiste las líneas recibidas sin verificar ninguna de esas fuentes de disponibilidad.
- Causa raíz o hipótesis: un valor de descuento ausente o no numérico produce `NaN` al pasar por `Number`, y los cálculos posteriores lo propagan. La retirada de categoría solo impacta el catálogo de cliente; la defensa de pago no recibe el flag de inconsistencia y no hay defensa autoritativa en backend. El modo menú existe y funciona en el flujo de interfaz, pero la API todavía no obliga que el menú ni sus ítems correspondan a la sucursal.
- Riesgos y compatibilidad: el endpoint es transaccional e interviene órdenes, pagos, consecutivos y facturación. La corrección debe preservar líneas históricas para consulta, pero rechazar de forma atómica nuevos guardados/facturaciones inválidos con HTTP 400/409 y mensajes seguros; nunca convertir silenciosamente un descuento inválido en cero ni exponer datos internos.
- Impactos de sync, migración, Docker o despliegue: no requiere migración, Docker ni cambios de OfflineSync. Sí modifica la validación transaccional de Restaurante y requiere prueba de regresión para órdenes válidas, guardado, comando y factura.

## Plan

- Gate de plan y aprobación del PO: BUGFIX de riesgo alto que modifica el guardado/facturación transaccional; aprobado explícitamente por el PO el 2026-09-15 mediante “llisto dale apruebo”. La ampliación de `POINT-004` requiere aprobación explícita antes de implementarse.
- Paso 1 — validación numérica de cliente (`restaurant.service.ts`; `POINT-001`): centralizar la lectura del descuento y de los importes de línea; rechazar valores no finitos o fuera de 0–100 antes de recalcular, guardar o facturar. Para una orden ya cargada con un valor inválido, marcar la línea y explicar que debe eliminarse y agregarse de nuevo.
- Paso 2 — validación de disponibilidad de cliente (`restaurant.service.ts`; `POINT-002`, `POINT-003`): conservar la marca `err` al reconstruir una línea cuyo producto ya no está disponible en la fuente configurada y bloquear la ventana de pago con la lista correcta de productos a corregir. En modo categorías la fuente es `ResBranchCategory`; en modo menú es el menú seleccionado y sus `ResMenuItem` activos. Corregir además la lectura del nombre de producto usada en el mensaje de bloqueo.
- Paso 3 — defensa autoritativa de backend (`functions.py`; `POINT-001`, `POINT-002`, `POINT-003`): antes de modificar la cabecera o líneas, validar números finitos de cabecera/líneas y el modo de la sucursal. Si `restaurant_menu` es falso, comprobar producto activo y categoría `ResBranchCategory`. Si es verdadero, exigir que `menu` sea un `ResMenu` activo de la misma sucursal y que cada producto sea un `ResMenuItem` activo de ese menú; no aplicar el filtro de categorías. Responder con mensajes de negocio y rollback total. Las adiciones/toppings conservan su contrato actual salvo que se persistan como líneas principales.
- Paso 4 — pruebas (`BackEnd/ModRestaurant/tests/`, pruebas Angular de servicio): cubrir descuento `NaN`/nulo/no numérico, rechazo de categoría retirada por frontend y backend, mensaje al usuario, no creación de factura/orden parcial, regresión de orden válida por categorías y las dos rutas de menú (ítem activo permitido e ítem ajeno/inactivo rechazado).
- Paso 5 — reconciliación de productos por WebSocket (`restaurant.service.ts`; `POINT-004`): al recibir un producto nuevo o actualizado, aplicar la misma elegibilidad que la carga inicial antes de incorporarlo al catálogo operativo. En modo categorías, solo agregarlo si su categoría está asociada a la sucursal activa; en modo menú, conservar el catálogo regido por el menú seleccionado. Inicializar los valores de presentación requeridos únicamente para productos elegibles. Agregar prueba de servicio que reproduzca la actualización WebSocket de una categoría no asignada y confirme que no se muestra ni se puede seleccionar.
- Rollback, backup, canario u orden de despliegue cuando aplique: no hay cambio de esquema. Publicar primero en Dev, probar una orden válida y ambos rechazos en tenant no productivo; si bloquea una operación válida, revertir únicamente el commit funcional tras confirmar que no está mezclado con cambios ajenos.

## Criterios de aceptación

- [ ] `POINT-001`: ningún descuento, precio, impuesto o total no finito llega a persistirse; el usuario recibe una explicación accionable y no se genera orden, pago, factura ni comanda parcial.
- [ ] `POINT-002`: al retirar una categoría de sucursal, toda línea abierta afectada queda claramente inválida y no puede confirmarse, guardarse ni facturarse hasta corregirse.
- [ ] `POINT-002`: el backend rechaza la misma operación aunque el cliente esté desactualizado o se invoque la API directamente.
- [ ] `POINT-003`: una sucursal con `restaurant_menu=true` conserva la operación con productos activos del menú seleccionado; una línea de otro menú, un ítem inactivo o un menú ajeno/inactivo se rechaza de forma atómica.
- [ ] `POINT-004`: una actualización WebSocket de un producto no habilitado para la sucursal no lo muestra ni lo hace seleccionable; no se presenta un mensaje de descuento por ese producto.
- [ ] Las órdenes válidas de categorías habilitadas conservan guardado, comandas, facturación y reintentos actuales.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "El descuento no numérico contamina la orden",
    "status": "closed",
    "severity": "high",
    "actual": "Una orden de prueba con una sola línea mostró Desc.: NaN% y no pudo guardarse; el error anterior expuso una referencia ORD.",
    "expected": "El descuento de toda línea debe ser un número finito dentro del rango permitido; si es inválido, el usuario recibe una validación clara y no se intenta guardar una orden con totales inválidos.",
    "evidence": [
      "EVIDENCE-001"
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
    "title": "Se factura un producto cuya categoría fue retirada de la sucursal",
    "status": "closed",
    "severity": "high",
    "actual": "Una línea existente se marca visualmente como inconsistente al quitar la categoría de la sucursal, pero el usuario aún puede facturarla.",
    "expected": "El frontend y el backend rechazan la operación hasta eliminar o reemplazar la línea cuyo producto ya no está habilitado para la sucursal.",
    "evidence": [
      "EVIDENCE-002"
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
    "title": "La validación debe respetar sucursales configuradas por menú",
    "status": "closed",
    "severity": "high",
    "actual": "La solución propuesta por categorías podría bloquear productos válidos cuando AdmCompanyBranchRestaurant.restaurant_menu está activo, porque en ese modo la disponibilidad depende del menú seleccionado y de sus ítems activos.",
    "expected": "Con restaurant_menu activo, la orden exige un menú activo de la misma sucursal y cada línea debe pertenecer a un ResMenuItem activo de ese menú; no se usa ResBranchCategory como criterio de disponibilidad.",
    "evidence": [
      "EVIDENCE-003"
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
    "id": "POINT-004",
    "title": "WebSocket reintroduce productos no habilitados por categoría",
    "status": "closed",
    "severity": "high",
    "actual": "Al editar un producto en Administración, la actualización WebSocket lo inserta en el catálogo de Restaurante aunque su categoría no esté asignada a la sucursal; al seleccionarlo aparece una validación de descuento que no explica la disponibilidad real.",
    "expected": "Una actualización WebSocket no puede volver seleccionable un producto cuya categoría no está habilitada para la sucursal. Si el producto no es elegible, el usuario no debe verlo ni recibir un error de descuento al intentar usarlo.",
    "evidence": [
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
  }
]
```

## Implementación

- Archivos cambiados: `BackEnd/ModRestaurant/views/functions.py`, `BackEnd/ModRestaurant/tests/test_create_update_order_errors.py`, `FrontEnd/src/app/common/services/restaurant.service.ts` y `FrontEnd/src/app/common/services/restaurant.service.spec.ts`.
- Decisiones técnicas: el backend valida antes de crear o actualizar la cabecera de orden. Rechaza números no finitos y descuentos fuera de 0–100. Según `AdmCompanyBranchRestaurant.restaurant_menu`, resuelve disponibilidad contra `ResBranchCategory` o contra un `ResMenu` activo de la misma sucursal y sus `ResMenuItem` activos. La interfaz conserva el flag de línea no disponible, bloquea cualquier guardado/pago y muestra los productos afectados. Para `POINT-004`, la reconciliación WebSocket reutiliza la elegibilidad por sucursal antes de insertar o conservar un producto en el catálogo operativo; los descartados no abren modal ni generan una validación de descuento.
- Compatibilidad preservada: una sucursal sin configuración Restaurant conserva la regla por categorías; una sucursal con menú no usa categorías y acepta únicamente productos activos del menú seleccionado. No hay migraciones ni cambio de contratos de payload.
- Commits atribuibles al ticket:
  - `aa0a594affb7a57747be007569ccb2687989c7b9` — valida descuentos e ítems de Restaurante en frontend/backend y agrega pruebas dirigidas.
  - `e7d92a7ef204fa93bf8c6665c10a084af20ed7b4` — evita que WebSocket incorpore al catálogo productos no elegibles para la sucursal.

## Pruebas

- Comandos para el PO:
  - Desde `FrontEnd/`: `npm test -- --watch=false --browsers=ChromeHeadless`.
  - Desde `BackEnd/`, con la base tenant de pruebas local configurada: `./.venv/bin/python manage.py test ModRestaurant.tests.test_create_update_order_errors --keepdb`.
- Directorio de ejecución: `BackEnd/` y `FrontEnd/`.
- Resultado esperado: TypeScript compila sin errores; las pruebas cubren descuento no finito, categoría retirada, producto de menú permitido, producto ajeno al menú rechazado y alta WebSocket de categoría no asignada. La interfaz no permite abrir pagos ni guardar una línea marcada como inconsistente.
- Validaciones manuales: en tenant no productivo, crear una orden válida; retirar una categoría de sucursal con una orden abierta que la use, recargarla e intentar guardar/facturar: debe aparecer el nombre del producto y no crearse factura. Sin recargar, editar desde Administración un producto cuya categoría no está asignada y esperar la actualización: no debe aparecer al buscarlo ni abrirse su modal. En una sucursal de prueba con `restaurant_menu=true`, seleccionar un menú activo y facturar una línea propia aun sin categoría de sucursal; después intentar con una línea de otro menú o desactivar el ítem y confirmar el rechazo. Repetir con un descuento inválido solo mediante prueba automatizada, no editando datos productivos.
- Requisitos de ambiente o datos: tenant Dev/no productivo, usuario de Restaurante, caja/consecutivo/medio de pago, una categoría de prueba asignable/removible y, para la regresión de menú, una sucursal de prueba con dos menús activos y productos distintos.
- Resultado comunicado por el PO: pruebas funcionales aprobadas; el PO solicitó explícitamente el cierre del ticket el 2026-09-15.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-15",
    "build_reference": "commit:e7d92a7ef204fa93bf8c6665c10a084af20ed7b4",
    "environment": "dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-15",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "PO aprobó las pruebas funcionales y solicitó cerrar el ticket el 2026-09-15."
  },
  {
    "id": "QA-003",
    "date": "2026-09-15",
    "build_reference": "commit:e7d92a7ef204fa93bf8c6665c10a084af20ed7b4",
    "environment": "dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-004",
    "date": "2026-09-15",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "PO aprobó las pruebas funcionales y solicitó cerrar el ticket el 2026-09-15."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-15",
    "kind": "user-report",
    "description": "Captura aportada por el PO: línea de orden de prueba muestra Desc.: NaN% y total no calculado; se asocia a la referencia ORD-673F8A8650ED.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-15",
    "kind": "user-report",
    "description": "El PO retiró una categoría de sucursal con una orden abierta que contenía su producto; la línea apareció con borde rojo, pero la facturación se permitió.",
    "reference": null,
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-15",
    "kind": "code-inspection",
    "description": "Se confirmó que restaurant_menu activa un flujo alterno en la interfaz: omite BranchCategory, exige un menú y toma solo ResMenuItem activos. La API create_update_order aún no valida ni el menú ni sus ítems.",
    "reference": null,
    "point_id": "POINT-003"
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-09-15",
    "kind": "code-inspection",
    "description": "El listener de IndexDB para Products inserta cualquier producto activo recibido por WebSocket en all_products sin consultar BranchCategory ni inicializar discount; el catálogo inicial sí se filtra por categoría.",
    "reference": null,
    "point_id": "POINT-004"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-09-15",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO aprobó el retest funcional y solicitó cerrar el ticket el 2026-09-15."
  },
  {
    "id": "RETEST-002",
    "date": "2026-09-15",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO aprobó el retest funcional y solicitó cerrar el ticket el 2026-09-15."
  },
  {
    "id": "RETEST-003",
    "date": "2026-09-15",
    "point_id": "POINT-003",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO aprobó el retest funcional y solicitó cerrar el ticket el 2026-09-15."
  },
  {
    "id": "RETEST-004",
    "date": "2026-09-15",
    "point_id": "POINT-004",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO aprobó el retest funcional y solicitó cerrar el ticket el 2026-09-15."
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
    "date": "2026-09-15",
    "technical_summary": "Se validaron importes finitos, disponibilidad por categoría o menú y reconciliación de productos recibidos por WebSocket.",
    "functional_summary": "Restaurante no permite guardar o facturar líneas inválidas ni mostrar productos no habilitados para la sucursal.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "PO aprobó las pruebas funcionales y solicitó cerrar el ticket el 2026-09-15.",
    "release_impact": "Sin migraciones ni despliegue de producción; permanece unreleased hasta una futura promoción de dev."
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
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-15",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-15",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-15",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-15",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-15",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-15",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-15",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-15",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-15",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-09-15",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-09-15",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-09-15",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-004 para POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-037",
    "date": "2026-09-15",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-038",
    "date": "2026-09-15",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-004 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-039",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-040",
    "date": "2026-09-15",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-041",
    "date": "2026-09-15",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-042",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-043",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
