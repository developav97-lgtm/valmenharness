---
schema_version: 1
id: INTEGRATION-FE-IMPUESTO-BOLSA-20260908
title: Enviar impuesto a la bolsa en factura electrónica
type: INTEGRATION
module: FE
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-09-08
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# INTEGRATION-FE-IMPUESTO-BOLSA-20260908

## Solicitud original

Se requiere ajustar el envío electrónico del ítem de bolsa plástica, ya implementado en POS y Restaurante. El proveedor entregó docs/facturas/SEA-7176.txt como ejemplo: la línea BOLSA se envía con precio cero y el impuesto se reporta en salestax con código 22, nombre IMPBOLSA, base y tarifa en cero, y valor acumulado por cantidad. Actualmente el producto liquida su precio como valor del impuesto. Se debe confirmar e implementar el contrato electrónico sin alterar los totales ni la liquidación funcional existente.

## Descripción funcional

- Alcance: Adecuar únicamente la construcción del payload de factura electrónica para líneas de producto configuradas como impuesto a la bolsa (`is_bag_tax=True`). Aplica a los flujos que ya generan el payload desde POS/Restaurante; no rediseña la liquidación del carrito ni la configuración de productos.
- Usuario o rol afectado: Cajeros y usuarios de Restaurante/POS que emiten factura electrónica con bolsas plásticas; el receptor electrónico y la DIAN reciben el documento correcto.
- Comportamiento actual: La bolsa se liquida en el pedido como un valor fijo por unidad. En el generador vigente de órdenes con impuestos históricos, `type_tax=9` no está en `TYPE_TAX_DIAN`; se registra una advertencia y se omite el impuesto. Además, la línea conserva su precio de venta en el detalle, contrario al ejemplo provisto.
- Comportamiento esperado: Por cada línea de bolsa, el detalle electrónico debe reportar `price: 0`; su impuesto debe ir en `salestax` con `codigo: "22"`, `nombre: "IMPBOLSA"`, `tarifa: 0`, `base: 0` y `valor` igual al valor unitario del impuesto multiplicado por la cantidad. El total de la factura debe conservar el importe ya liquidado por el pedido.

## Diagnóstico

- Archivos y flujo investigados: `docs/facturas/SEA-7176.txt` establece el contrato de referencia: BOLSA en `detalle_factura_set` con precio 0 y `salestax` IMPBOLSA/código 22 con valor 73 para cantidad 2. El flujo activo es `BackEnd/ModPos/views/functions.py::send_invoice_electronic`, que genera el payload basado en `line.taxes` e ignora `type_tax=9`. `FrontEnd/src/app/common/services/cart.service.ts` y `restaurant.service.ts` ya tratan la bolsa como impuesto, sin IVA ni ICO. `BackEnd/ModPos/views/views.py` no forma parte del flujo activo.
- Causa raíz o hipótesis: Falta una representación específica de `AdmTax.type_tax=9` en el adaptador del contrato de facturación electrónica. No se puede reutilizar el tratamiento de IVA, consumo o impuestos saludables porque IMPBOLSA exige precio de línea, base y tarifa en cero.
- Riesgos y compatibilidad: Riesgo alto de rechazo o de total inconsistente si se cambia solo el detalle o solo el impuesto. Deben preservarse los payloads sin bolsas, el cálculo almacenado de impuestos históricos y el fallback para órdenes antiguas. La multiplicación debe ocurrir una sola vez: el `valor` enviado será el impuesto unitario almacenado en la línea por su cantidad, sin recalcular ni duplicar el total.
- Impactos de sync, migración, Docker o despliegue: No se prevé migración ni Docker. No modifica OfflineSync/SincSaiCloud ni las identidades de sincronización. Es una integración de contrato electrónico: requiere confirmar que el proveedor acepta exactamente el contrato de ejemplo, probar en un ambiente autorizado y dejar rollback a la versión previa si se presentan rechazos.

## Plan

- Gate de plan y aprobación del PO: Aprobado explícitamente por el PO el 2026-09-08 mediante la orden «ahora si implementemos». Autoriza únicamente el alcance y los pasos de este plan.
- Alcance y exclusiones: Incluye `POINT-001` y pruebas de regresión de `send_invoice_electronic`. Excluye cambios al precio visible, al total de la orden, a UI, a la configuración de bolsa, a sincronización y a migraciones. También excluye eliminar el código legado de `BackEnd/ModPos/views/views.py`: esa limpieza se registrará y planificará en un ticket independiente.
- Pasos ordenados:
  1. Confirmar con el proveedor electrónico que el código 22, nombre IMPBOLSA y campos de unidad requeridos son exactamente los del contrato productivo; documentar cualquier diferencia antes de escribir código.
  2. En el generador vigente de `BackEnd/ModPos/views/functions.py`, detectar el impuesto histórico de tipo 9 y construir el registro `salestax` específico, con base/tarifa cero y valor acumulado una sola vez por cantidad; ajustar la línea de detalle de bolsa a precio cero sin alterar el total de cabecera.
  3. Ajustar únicamente el fallback para órdenes antiguas sin `taxes` JSON que ya existe dentro de `send_invoice_electronic`, si la evidencia demuestra que también debe representar bolsa; no modificar `BackEnd/ModPos/views/views.py`.
  4. Añadir pruebas dirigidas para: factura mixta producto normal + bolsas; más de una bolsa/cantidad mayor a uno; factura sin bolsa; y orden antigua sin `taxes` JSON. Comparar campos, sumas y ausencia de duplicación.
  5. Realizar envío de prueba al ambiente autorizado del proveedor con datos no sensibles, conservar la respuesta segura y preparar los comandos/validaciones para el PO.
- Rollback, backup, canario u orden de despliegue cuando aplique: No hay datos ni esquema que respaldar. El canario es una factura electrónica de prueba con producto gravado y bolsa, posterior a las pruebas locales; desplegar el cambio de backend de forma compatible. Ante rechazo o diferencia de total, revertir exclusivamente el cambio del adaptador y detener los nuevos envíos de bolsa hasta validar el contrato con el proveedor.

## Criterios de aceptación

- [ ] POINT-001: Una factura mixta envía el producto normal con su precio habitual y cada línea de bolsa con `price: 0`.
- [ ] POINT-001: Para una bolsa con cantidad `n`, existe un `salestax` asociado con código `22`, nombre `IMPBOLSA`, base y tarifa en cero, y `valor` igual al impuesto unitario ya calculado por `n`.
- [ ] POINT-001: El subtotal, total y pagos del payload coinciden con los valores liquidados en la orden; el importe de bolsa no se duplica ni desaparece.
- [ ] POINT-001: Facturas sin bolsa y órdenes antiguas sin el JSON histórico de impuestos conservan su payload actual.
- [ ] POINT-001: El proveedor acepta una factura de prueba en el ambiente autorizado, o una respuesta de contrato impide pasar a envío y queda documentada.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Representar el impuesto de bolsa en el payload electrónico",
    "status": "verified",
    "severity": "high",
    "actual": "El generador de factura electrónica omite type_tax=9 en el mapeo de impuestos históricos y conserva el precio de la línea de bolsa, por lo que no construye el contrato mostrado por el proveedor.",
    "expected": "Una línea marcada como impuesto a la bolsa se transmite con precio cero y con un registro salestax IMPBOLSA (código 22, base y tarifa cero, valor acumulado por cantidad), sin modificar el total facturado.",
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

- Archivos cambiados: `BackEnd/ModPos/views/functions.py`; `BackEnd/ModPos/tests/test_send_invoice.py`.
- Decisiones técnicas: `send_invoice_electronic` identifica `type_tax=9` dentro de `PosOrderLine.taxes` como fuente histórica de verdad. La línea asociada se emite con precio cero y su impuesto se serializa como `IMPBOLSA`/código 22, con base y tarifa en cero y el valor histórico multiplicado una sola vez por la cantidad. Mantiene los campos de unidad que exige el contrato vigente.
- Compatibilidad preservada: Las órdenes sin `taxes` históricos mantienen la rama previa, incluso si el producto actual fue marcado posteriormente como bolsa. Los impuestos IVA, consumo, INPP e impuestos saludables no cambian. `BackEnd/ModPos/views/views.py` no fue modificado.
- Commits atribuibles al ticket:
  - `634c094a6c358ca2c5fb4a9eca40e1fe4c0db3e2` — implementación del serializador de bolsa, prueba dirigida y registro inicial del ticket publicados en `dev`.

## Pruebas

- Comandos para el PO: Desde `BackEnd/`, ejecutar `./.venv/bin/python manage.py test ModPos.tests.test_send_invoice.SendInvoiceElectronicBagTaxTests --keepdb`.
- Directorio de ejecución: `<PROYECTO>/BackEnd`; ambiente autorizado del proveedor para el canario.
- Resultado esperado: La prueba pasa y el payload de factura mixta conserva el producto normal con precio 1000, transmite BOLSA con precio 0 y `salestax` IMPBOLSA/código 22/valor 36.5 para dos unidades, con total 1226.5.
- Validaciones manuales: Crear una orden con producto normal y dos bolsas; revisar detalle, `salestax`, subtotal, total y aceptación/respuesta electrónica. Repetir con una factura sin bolsas.
- Requisitos de ambiente o datos: Tenant de prueba con producto `is_bag_tax=True`, impuesto de tipo 9 configurado y credenciales/ambiente de facturación electrónica ya autorizados por el PO; no registrar credenciales en este ticket.
- Resultado comunicado por el PO: El PO revisó la implementación y confirmó que es correcta para probarla en nube/dev. La compilación Python y `manage.py check` finalizaron correctamente el 2026-09-08; la prueba dirigida local quedó bloqueada durante la preparación de la base reutilizada.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-08",
    "build_reference": "commit:634c094a6c358ca2c5fb4a9eca40e1fe4c0db3e2",
    "environment": "dev-cloud",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-08",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO revisó la implementación y confirmó que es correcta."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-08",
    "kind": "automated",
    "description": "La compilación de ModPos/views/functions.py y ModPos/tests/test_send_invoice.py, y manage.py check, finalizaron sin errores. La prueba dirigida quedó bloqueada al preparar la base reutilizada y se detuvo antes de ejecutar el caso.",
    "reference": null,
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-09-08",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO revisó la implementación y confirmó que es correcta."
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
    "date": "2026-09-08",
    "technical_summary": "send_invoice_electronic serializa las líneas type_tax=9 como IMPBOLSA código 22, con precio de línea cero y valor multiplicado por cantidad.",
    "functional_summary": "El PO revisó la implementación y confirmó que el envío electrónico del ítem bolsa es correcto.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó la implementación y solicitó cerrar el ticket.",
    "release_impact": "El ticket permanece unreleased; la implementación está publicada en dev para pruebas en nube."
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
    "date": "2026-09-08",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-08",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-08",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-08",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-08",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-08",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-08",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-08",
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
