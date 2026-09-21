---
schema_version: 1
id: FEATURE-POS-TRASLADO-FACTURA-CIERRE-20260829
title: Trasladar factura a un cierre de caja desde POS Order
type: FEATURE
module: POS
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: true
migration_impact: false
docker_impact: false
risk_level: high
created: 2026-08-29
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# FEATURE-POS-TRASLADO-FACTURA-CIERRE-20260829

## Solicitud original

En FrontEnd/src/app/Compartidos/Pos/orders/pos-order, al habilitar el modo soporte o desarrollador existente mediante comandos de teclas, permitir trasladar la factura visualizada a un cierre de caja elegido. El usuario debe poder filtrar cierres por sucursal, fecha y usuario, identificar el cierre correcto y seleccionarlo. La operación debe actualizar POS Order.id_cash_control, actualmente asociado con POS Cash Register, para que la factura se incluya en el cierre correcto. Hoy el traslado se realiza directamente en tablas.

## Descripción funcional

- Alcance: desde la vista de una factura en `POS Order`, exponer en modo soporte una acción para trasladar esa única factura a un cierre de caja seleccionado. La sucursal queda fijada obligatoriamente a la de la factura y no será un filtro editable; el selector permitirá filtrar por rango de fechas y usuario.
- Usuario o rol afectado: únicamente un usuario autenticado con rol `ADMIN` y modo soporte activo (`Ctrl+Shift+D`); el backend debe imponer ese mismo permiso sin confiar en el estado del navegador.
- Comportamiento actual: `PosOrder.id_cashControl` determina el cierre que consolida la factura. Una factura asociada a otra caja no se incluye en el cierre esperado; la corrección requiere modificar tablas directamente.
- Comportamiento esperado: el administrador puede consultar cierres candidatos, elegir uno compatible y confirmar el traslado. El sistema actualiza la asociación, deja auditoría y refleja el cambio en los totales que se calculan por `id_cashControl`, sin alterar datos contables de la factura.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/Compartidos/Pos/orders/pos-order/pos-order.component.ts` activa el modo soporte con `Ctrl+Shift+D` para `ADMIN`; su plantilla contiene las acciones de soporte. `PointOfSaleService.getCashRegisters()` y `BackEnd/ModPos/views/functions.py:get_cash_registers()` ya filtran cierres por fecha, sucursal, usuario y estado. Los cálculos de cierre agrupan las facturas por `PosOrder.id_cashControl` en `_compute_cash_totals()`.
- Causa raíz o hipótesis: una factura creada usando la caja de otro usuario conserva ese ID de caja, aunque operacionalmente deba consolidarse en un cierre distinto. No existe endpoint ni UI con validaciones para reasignarlo; el ajuste manual evade permisos, auditoría y sincronización.
- Riesgos y compatibilidad: el traslado cambia reportes de ambos cierres y puede afectar un cierre que ya esté cerrado. Debe usar JWT y rol real del solicitante, validar tenant, que el cierre destino corresponda obligatoriamente a la sucursal efectiva de la factura, existencia de caja, y serializar la operación en transacción. La operación debe usar `order.save(update_fields=['id_cashControl'])`, no `QuerySet.update()`, para que OfflineSync encole la actualización. Se registrará el ID anterior/nuevo y el actor en `AuditLog`; no cambia el modelo ni las facturas existentes fuera de la seleccionada.
- Impactos de sync, migración, Docker o despliegue: OfflineSync sí aplica porque `posorder` es `PUSH_MODEL`; el guard `disable_sync_signals` debe seguir respetándose y no se usa `skip_sync_queue`. No requiere migración ni Docker. El contrato nuevo se desplegará backend antes que frontend; rollback consiste en retirar la acción de interfaz y conservar el endpoint compatible sin invocarlo, sin reversión automática de traslados ya auditados.
- Decisión del PO (2026-08-29): la sucursal no es un filtro; el backend y el selector solo mostrarán y aceptarán cierres de la misma sucursal de `PosOrder`. Se habilitan como destino tanto cierres `Open` como `Close`, mostrando el estado en la tabla. Los reportes se recalculan con la asociación vigente; no se modifica `PosCashRegister.total_close` persistido porque la fuente operativa de detalle ya agrega las facturas por `id_cashControl`.

## Plan

- Gate de plan y aprobación del PO: `FEATURE` con impacto OfflineSync. Gate de plan: aprobado explícitamente por el PO el 2026-08-29, con los ajustes: sucursal fija de la factura, filtros solo por fecha y usuario, y cierres `Open`/`Close` como destinos visibles con su estado.
- Alcance y exclusiones: una factura por operación desde POS Order; el selector recibe la sucursal de la factura y no permite alterarla; no crea cierres, no mueve pagos/líneas, no edita fecha/usuario/consecutivo, no cambia permisos funcionales existentes ni usa Django Admin. Se reutiliza la pantalla Angular del cliente y no se admite actualización directa por tablas.
- Pasos ordenados:
  1. Backend (`BackEnd/ModPos/views/functions.py`, `urls.py`): incorporar un endpoint autenticado con JWT para trasladar una `PosOrder`, bloqueando la orden y el cierre destino con `select_for_update()`. Validar que el actor JWT sea `ADMIN`, que el modo soporte solo sea una condición de UI y no una autorización del servidor, y que la caja destino exista y pertenezca a la misma sucursal efectiva de la factura. Aceptar destinos `Open` y `Close`, guardar exclusivamente `id_cashControl`, invalidar las cachés de sincronización/reportes afectadas y crear `AuditLog` con valor anterior, nuevo, caja, sucursal, estado y actor.
  2. Sincronización (`BackEnd/ModPos/views/functions.py`, mecanismo existente `BackEnd/OfflineSync/signals.py`): persistir con `model.save(update_fields=...)` dentro de la transacción para generar una actualización `PUSH` de `PosOrder` cuando el tenant tenga OfflineSync habilitado. Verificar que el reintento de la misma solicitud sea seguro: si el destino ya coincide, responder éxito sin crear un segundo cambio funcional; si cambió concurrentemente, rechazar con un conflicto explícito. No introducir identidad por IDs locales fuera del tenant ni alterar el contrato de sync existente.
  3. Frontend (`FrontEnd/src/app/Compartidos/Pos/orders/pos-order/*`, `common/services/point-of-sale.service.ts`): añadir una acción visible solo con `supportMode`, diálogo accesible que muestre la sucursal fija de la factura y filtre el listado solo por fecha y usuario. La tabla exhibe caja, responsable, fechas y estado `Open`/`Close`; muestra la caja actual y destino, exige confirmación y refresca la factura tras éxito. Mostrar errores de autorización, caja inválida, sucursal no coincidente, conflicto o falla de red sin cambiar el estado visible.
  4. Pruebas: crear pruebas Django de autorización, aislamiento tenant, filtro de sucursal, caja inexistente, política Open/Close, no-op idempotente, concurrencia y cola OfflineSync; ampliar pruebas Angular del componente/servicio para visibilidad, filtros, confirmación y errores. Ejecutar compilación Angular y regresiones de cierres.
- Rollback, backup, canario u orden de despliegue cuando aplique: no hay migración ni datos masivos, por tanto no requiere backup/canario de esquema. Desplegar primero backend compatible y luego frontend; probar en un tenant de prueba con una factura y dos cajas de la misma sucursal. El rollback de código retira la UI y endpoint de la versión siguiente; un traslado aplicado se revierte únicamente mediante una nueva operación trazable autorizada, nunca restaurando tablas ni borrando auditoría.

## Criterios de aceptación

- [ ] `POINT-001`: una factura visualizada permite abrir la acción solo si el usuario es `ADMIN` y el modo soporte está activo; sin cualquiera de esas condiciones no se muestra ni se puede ejecutar por API.
- [ ] `POINT-001`: el selector fija y muestra la sucursal de la factura, filtra cierres por fecha y usuario, identifica caja, responsable, estado y fechas, y no permite seleccionar un cierre ajeno a esa sucursal.
- [ ] `POINT-001`: al confirmar, solo se modifica `PosOrder.id_cashControl`; la factura aparece en los totales/reportes del nuevo cierre y deja de aparecer en los del anterior según el cálculo vigente.
- [ ] `POINT-001`: el endpoint acepta cierres `Open` y `Close`, y rechaza sin mutar los casos no autenticado, no administrador, orden/caja inexistente, sucursal distinta o conflicto concurrente; el servidor no confía en IDs de usuario ni flags enviados por el cliente.
- [ ] `POINT-001`: el traslado crea evidencia de auditoría con actor y valores anterior/nuevo y, con OfflineSync activo, encola una única actualización idempotente de `PosOrder`; con sync desactivado no crea cola.
- [ ] `POINT-001`: el comportamiento de cierres existentes, facturación normal, reportes y modo soporte actual no presenta regresión.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Traslado controlado de factura al cierre de caja correcto",
    "status": "closed",
    "severity": "high",
    "actual": "Las facturas creadas con otro usuario o caja no aparecen en el cierre operativo correcto; corregir id_cashControl exige intervenir tablas directamente.",
    "expected": "Un administrador en modo soporte puede buscar y seleccionar un cierre compatible para la factura visualizada, con validación de servidor, trazabilidad y sincronización segura.",
    "evidence": [],
    "affected_files": [
      "BackEnd/ModPos/views/functions.py",
      "BackEnd/ModPos/urls.py",
      "BackEnd/ModPos/tests/test_transfer_pos_order_cash_control.py",
      "FrontEnd/src/app/common/services/point-of-sale.service.ts",
      "FrontEnd/src/app/Compartidos/Pos/orders/pos-order/pos-order.component.ts",
      "FrontEnd/src/app/Compartidos/Pos/orders/pos-order/pos-order.component.html"
    ],
    "diagnosis": null,
    "solution": null,
    "tests": [],
    "qa_cycles": [
      "QA-005"
    ],
    "terminal_reason": null,
    "related_ticket": null
  },
  {
    "id": "POINT-002",
    "title": "Resumen del cierre actual muestra solo el identificador",
    "status": "closed",
    "severity": "normal",
    "actual": "El diálogo muestra únicamente el ID del cierre actual, mientras los cierres candidatos incluyen caja, usuario, fechas y estado.",
    "expected": "El diálogo presenta el cierre actual con caja, usuario, fecha/hora de apertura, fecha/hora de cierre y estado, usando el mismo formato visual de la tabla de cierres candidatos.",
    "evidence": [],
    "affected_files": [
      "FrontEnd/src/app/Compartidos/Pos/orders/pos-order/pos-order.component.ts",
      "FrontEnd/src/app/Compartidos/Pos/orders/pos-order/pos-order.component.html",
      "FrontEnd/src/app/Compartidos/Pos/orders/pos-order/pos-order.component.spec.ts"
    ],
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

- Archivos cambiados: `BackEnd/ModPos/views/functions.py`, `BackEnd/ModPos/urls.py`, `BackEnd/ModPos/tests/test_transfer_pos_order_cash_control.py`, `FrontEnd/src/app/common/services/point-of-sale.service.ts` y `FrontEnd/src/app/Compartidos/Pos/orders/pos-order/pos-order.component.{ts,html}`.
- Decisiones técnicas: endpoint `POST pos/transfer_pos_order_cash_control` protegido por JWT y rol `ADMIN`; bloquea factura y cierre con transacción, valida sucursal efectiva de ambos, acepta estados `Open` y `Close`, persiste solo `id_cashControl`, invalida las cachés de estado de sincronización y registra auditoría estricta con actor, sucursal, origen, destino y estado. El cliente envía el cierre origen esperado; una vista obsoleta recibe `409` y no sobrescribe un traslado concurrente. Se eliminó `select_related()` de las consultas bloqueadas porque PostgreSQL no admite `FOR UPDATE` en el lado nullable de un outer join. El selector Angular fija la sucursal de la factura, muestra el cierre actual, consulta por fecha/usuario y limita candidatos a estados válidos.
- Compatibilidad preservada: no hay migración ni cambio de payload existente. `PosOrder.save(update_fields=['id_cashControl'])` mantiene la cola `PUSH` de OfflineSync y respeta sus guards. El endpoint nuevo es aditivo; solo está disponible visualmente en modo soporte y se defiende nuevamente en backend.
- Ajuste `POINT-002` (2026-08-30): `PosOrderComponent` consulta el detalle del cierre actual con el servicio existente `getCashRegister()` al abrir el diálogo y lo normaliza a las mismas columnas de los cierres candidatos: caja, usuario, apertura, cierre y estado. Se conserva el ID como referencia interna para el control de concurrencia, sin mostrarlo como único dato operativo.
- Ajuste visual final (2026-08-31): la tabla exclusiva del resumen de cierre actual usa `table-borderless`; la tabla de cierres candidatos conserva sus bordes y comportamiento existentes.
- Commits atribuibles al ticket:
  - `c8619a07265dc82ebed87f4ed0692b74b930c70b` — implementación inicial del traslado controlado de factura a cierre.
  - `12b9a3bf4ff5e6918154f7705729c4f0c7e61bed` — detalle operativo del cierre actual en el diálogo.
  - `f68d2581ddde9cd0975fbec4c6f007110cac1b54` — tabla sin bordes del cierre actual y cierre del ticket.

## Pruebas

- Comandos para el PO: `python manage.py test ModPos.tests.test_transfer_pos_order_cash_control ModPos.tests.test_cash_register_totals --keepdb --verbosity 1`; `npm run build`.
- Directorio de ejecución: `BackEnd/` para Django; `FrontEnd/` para Angular.
- Resultado esperado: pruebas Django y build Angular verdes. Evidencia local: `ModPos.tests.test_transfer_pos_order_cash_control` ejecutó 3 pruebas en 63.917 s, `OK`; la prueba nueva del resumen actual en `pos-order.component.spec.ts` pasó (1 de 1); `python manage.py check` no reportó incidencias; `npm run build` completó el 2026-08-30 con hash `b285e511b48494f2` y nuevamente el 2026-08-31 con hash `8239f4c5e30eaf25`. La suite Angular completa tiene 2 fallos preexistentes en Administración y un `afterAll` no relacionado; la prueba específica nueva sí pasó.
- Validaciones manuales: con un `ADMIN`, activar `Ctrl+Shift+D`, abrir una factura de prueba y confirmar que el resumen superior del cierre actual muestra caja, usuario, fecha/hora de apertura, fecha/hora de cierre y estado. Después, filtrar cierres por fecha y usuario, revisar el estado abierto/cerrado, seleccionar y confirmar el destino; comprobar el detalle de ambos cierres, el log de auditoría y, cuando el tenant lo tenga habilitado, la cola de OfflineSync. Repetir con usuario no administrador, otra sucursal y caja inexistente.
- Requisitos de ambiente o datos: tenant de pruebas con cierres `Open` y `Close` de la misma sucursal, una factura pagada en la caja origen, una caja de otra sucursal, usuarios ADMIN/no ADMIN y OfflineSync habilitable.
- Resultado comunicado por el PO: en la validación manual del 2026-08-30, el selector muestra correctamente los cierres candidatos, pero el resumen superior del cierre actual solo presenta su ID. Se solicita mostrar caja, usuario, fechas y estado con el mismo formato de la tabla.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-08-30",
    "build_reference": "commit:c8619a07265dc82ebed87f4ed0692b74b930c70b",
    "environment": "Validación funcional del PO en dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-08-30",
    "build_reference": null,
    "environment": null,
    "result": "failed",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO reportó que el cierre actual solo muestra su ID; requiere el mismo detalle visible de los cierres candidatos."
  },
  {
    "id": "QA-003",
    "date": "2026-08-31",
    "build_reference": "worktree:sha256:8e49c08f91e1d7c4269165f6162cda0bf521746980ec66f4a524ade651ea4112",
    "environment": "Validación final en dev solicitada por el PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-004",
    "date": "2026-08-31",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO indicó: con este cambio visual solamente puedes cerrar el ticket y hacer commit y push."
  },
  {
    "id": "QA-005",
    "date": "2026-08-31",
    "build_reference": "worktree:sha256:8e49c08f91e1d7c4269165f6162cda0bf521746980ec66f4a524ade651ea4112",
    "environment": "Retest final en dev solicitado por el PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-006",
    "date": "2026-08-31",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO indicó: con este cambio visual solamente puedes cerrar el ticket y hacer commit y push."
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
    "date": "2026-08-31",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO solicita el cierre del ticket tras el ajuste visual final."
  },
  {
    "id": "RETEST-002",
    "date": "2026-08-31",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO solicita el cierre del ticket tras el ajuste visual final sin bordes."
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
    "date": "2026-08-31",
    "technical_summary": "El resumen del cierre actual usa una tabla Bootstrap sin bordes; la compilación Angular finalizó correctamente.",
    "functional_summary": "El PO solicitó cerrar el ticket después del ajuste visual final del resumen del cierre.",
    "qa_status": "waived",
    "qa_waiver_reason": "El PO pidió el cierre explícito tras validar la funcionalidad y solicitar únicamente este ajuste cosmético final.",
    "po_confirmation": "El PO indicó: con este cambio visual solamente puedes cerrar el ticket y hacer commit y push.",
    "release_impact": "El ticket queda cerrado funcionalmente y permanece unreleased; los cambios están en dev y no implican despliegue ni migración."
  },
  {
    "kind": "ticket-close",
    "id": "CLOSE-002",
    "date": "2026-08-31",
    "technical_summary": "El resumen del cierre actual usa una tabla Bootstrap sin bordes; la compilación Angular finalizó correctamente.",
    "functional_summary": "El PO solicitó cerrar el ticket después del ajuste visual final del resumen del cierre.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "El ticket queda cerrado funcionalmente y permanece unreleased; los cambios están en dev y no implican despliegue ni migración."
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
    "date": "2026-08-29",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-08-29",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-08-29",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-29",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-29",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-29",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-29",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-29",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-08-29",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-29",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-30",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-30",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-30",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-30",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-08-30",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado failed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-08-30",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> changes_requested."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-08-30",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-08-30",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-08-30",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-08-30",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-08-31",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-08-31",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-08-31",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-004 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-08-31",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-08-31",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-08-31",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-08-31",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-006 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-08-31",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
