---
schema_version: 1
id: INTEGRATION-POS-OTROS-CARGOS-ELECTRONICA-20260910
title: Enviar propina y domicilio como otros cargos en facturación electrónica
type: INTEGRATION
module: POS
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: high
created: 2026-09-10
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# INTEGRATION-POS-OTROS-CARGOS-ELECTRONICA-20260910

## Solicitud original

Cambiar send_invoice_electronic para reportar la propina (order.other) y el domicilio (order.domicile) como otros cargos del payload fiscal, en vez de líneas de producto y base sin impuesto. El valor debe sumar los conceptos presentes y additional_comment debe describir Propina, Domicilio o Propina + Domicilio según corresponda. Verificar el contrato del proveedor/binario para el caso combinado antes de implementar.

## Descripción funcional

- Alcance: el payload que `send_invoice_electronic` remite al binario/proveedor de facturación electrónica para facturas POS de restaurante. No modifica el cálculo ni la persistencia de la orden, pagos, impresión POS, sincronización o UI.
- Usuario o rol afectado: cajeros y administradores de restaurantes que expiden facturas electrónicas con propina, domicilio o ambos; el adquirente recibe la representación fiscal corregida.
- Comportamiento actual: `order.other` y `order.domicile` se suman a `subtotal`, se serializan como líneas `Propina` y `Domicilio`, se incorporan a `base_excluida` y generan entradas `salestax` de IVA 0%.
- Comportamiento esperado: los dos valores se suman únicamente en `otroscargos`; no aparecen como ítems ni como base o impuesto. `additional_comment` identifica los conceptos presentes: `Propina`, `Domicilio` o `Propina + Domicilio`. `total` conserva el total de la orden.

## Diagnóstico

- Archivos y flujo investigados: `BackEnd/ModPos/views/functions.py`, función `send_invoice_electronic`. Construye el diccionario `invoice`, serializa con `simplejson.dumps` y lo envía al binario configurado. `PosOrder.other` almacena la propina y `PosOrder.domicile` el domicilio.
- Causa raíz o hipótesis: la función usa ambos conceptos como líneas de venta no gravadas. El ejemplo de contrato aportado define un único `otroscargos` y usa `additional_comment` como descripción, con subtotal y base tributaria limitados a los ítems gravables/no gravables reales.
- Riesgos y compatibilidad: es un contrato fiscal externo. Cambiar los campos sin confirmación del proveedor puede causar rechazo o una representación XML distinta. La suma preserva el valor total, pero el contrato visible solo permite una descripción agregada cuando coexistieran ambos conceptos. Debe verificarse en habilitación que el binario traduzca estos campos a cargos UBL válidos y aceptar facturas con ninguno, uno o ambos valores.
- Impactos de sync, migración, Docker o despliegue: no hay migración ni Docker. No se modifica OfflineSync/SincSaiCloud. Requiere despliegue compatible: el binario/proveedor debe soportar ya los campos antes de publicar el backend; rollback es restaurar la construcción previa del payload si la validación del proveedor falla.

## Plan

- Gate de plan: aprobado explícitamente por el PO el 2026-09-10. El PO confirmó que el proveedor/binario acepta `otroscargos` agregado y `additional_comment: Propina + Domicilio` cuando están presentes ambos conceptos.
- Pasos ordenados:
  1. Confirmar en habilitación o documentación del proveedor que `otroscargos` admite la suma y que `additional_comment` es la descripción aceptada para cargos combinados.
  2. En `BackEnd/ModPos/views/functions.py`, centralizar la determinación de los conceptos positivos y construir `otroscargos` y `additional_comment` solo cuando exista al menos uno.
  3. Ajustar el payload para que `subtotal` sea `order.sub_total`; retirar las líneas artificiales, las bases excluidas y los `salestax` de IVA 0% correspondientes a propina y domicilio; conservar `total`, líneas de productos y tributos reales.
  4. Añadir pruebas dirigidas en `BackEnd/ModPos/tests/test_send_invoice.py` para propina sola, domicilio solo, ambos y ausencia de cargos, verificando serialización, subtotal, total, detalle, bases y tributos.
  5. Ejecutar pruebas locales y validar en el ambiente de habilitación del proveedor los cuatro escenarios, incluido el documento/XML o representación devuelto; entregar el resultado para pruebas del PO.
- Rollback, backup, canario u orden de despliegue cuando aplique: no requiere backup ni migración. Primero confirmar contrato y ejecutar habilitación/canario con facturas de prueba no productivas; después publicar backend. Ante rechazo o representación incorrecta, revertir únicamente la construcción del payload a líneas actuales y detener facturación electrónica de prueba hasta corregir el contrato.

## Criterios de aceptación

- [ ] `POINT-001`: una factura con solo propina contiene `otroscargos` igual a `order.other`, `additional_comment` igual a `Propina`, no incluye una línea de propina ni un IVA 0% asociado, y no incrementa subtotal o bases.
- [ ] `POINT-001`: una factura con solo domicilio aplica las mismas reglas con descripción `Domicilio`.
- [ ] `POINT-001`: una factura con ambos cargos contiene la suma en `otroscargos`, `additional_comment` igual a `Propina + Domicilio`, y conserva el total exacto de la orden.
- [ ] `POINT-001`: sin cargos, el payload conserva el comportamiento previo de productos, impuestos y total, sin emitir comentarios o cargos artificiales.
- [ ] `POINT-001`: el proveedor/binario acepta en habilitación los cuatro escenarios y la representación fiscal evidencia que los cargos no se tratan como ítems gravados o bases tributarias.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Propina y domicilio se reportan como ítems fiscales",
    "status": "closed",
    "severity": "high",
    "actual": "send_invoice_electronic agrega order.other y order.domicile al subtotal, los serializa como líneas Propina y Domicilio, los incluye en base_excluida y crea registros salestax con IVA 0%.",
    "expected": "Los conceptos se reportan como otroscargos, sin líneas de producto, sin base tributaria ni impuesto; additional_comment identifica los conceptos presentes y total conserva el valor completo de la orden.",
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

- Archivos cambiados: `BackEnd/ModPos/views/functions.py`; `BackEnd/ModPos/tests/test_send_invoice.py`.
- Decisiones técnicas: `subtotal` se obtiene de `order.sub_total`; los valores positivos de `order.other` y `order.domicile` se agregan en `otroscargos`; `additional_comment` se forma en el orden Propina, Domicilio. No se generan líneas, base excluida ni IVA 0% para estos valores.
- Compatibilidad preservada: una orden sin cargos mantiene `additional_comment` vacío y no incluye `otroscargos`; `total`, ítems reales, impuestos históricos y pagos no cambian.
- Commits atribuibles al ticket:
  - `af1ab8ae972a5dec9c729a5ea7cbb6e372868149` — ajusta propina y domicilio como cargos adicionales del payload fiscal y agrega sus pruebas de regresión.

## Pruebas

- Comandos para el PO: desde `BackEnd/`, `./.venv/bin/python manage.py test ModPos.tests.test_send_invoice.SendInvoiceElectronicBagTaxTests --keepdb --verbosity 1` y `./.venv/bin/python manage.py check`.
- Directorio de ejecución: `<PROYECTO>/BackEnd`.
- Resultado esperado: las cuatro pruebas dirigidas pasan; los payloads cumplen los criterios y `check` termina sin errores.
- Validaciones manuales: en habilitación del proveedor, emitir una factura de prueba para cada escenario (sin cargos, propina, domicilio, ambos), revisar payload registrado, respuesta de aceptación y XML/PDF resultante.
- Requisitos de ambiente o datos: tenant de habilitación, resolución y certificado de pruebas operativos, cliente de prueba y autorización del proveedor para usar los cuatro documentos no productivos.
- Resultado local: el 2026-09-10, `SendInvoiceElectronicBagTaxTests` finalizó con 4 pruebas exitosas en 175.348 s; `manage.py check` terminó sin errores. El runner informó que `REDIS_URL` no está configurado y deshabilitó notificaciones WebSocket, sin afectar estos payloads.
- Resultado comunicado por el PO: el 2026-09-10, el PO confirmó que la validación en habilitación fue correcta y que el resultado coincide con el ejemplo de `otroscargos` y `additional_comment` acordado.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-10",
    "build_reference": "commit:af1ab8ae972a5dec9c729a5ea7cbb6e372868149",
    "environment": "Habilitación del proveedor de facturación electrónica",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-10",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO aprobó QA tras validar en habilitación el resultado correcto de la factura electrónica."
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
    "date": "2026-09-10",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó que la validación en habilitación fue correcta y coincide con el ejemplo de otroscargos y additional_comment."
  }
]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional: pendiente de registrar por CLI al cerrar el ticket.
- Resultado comunicado por el PO: validación en habilitación correcta el 2026-09-10.
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica): pendiente de registrar por CLI.
- Riesgo residual e impacto de release: el ticket continúa `unreleased`; la promoción a producción se gestiona mediante release independiente.
- Texto visible al usuario cuando aplique: la factura electrónica muestra propina y domicilio como cargos adicionales, no como productos ni bases de IVA.

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-09-10",
    "technical_summary": "send_invoice_electronic envía propina y domicilio como otroscargos, sin ítems artificiales, base excluida ni IVA 0%; se añadieron pruebas de regresión para los cuatro escenarios.",
    "functional_summary": "El PO validó en habilitación que la factura se genera correctamente como el ejemplo acordado.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO solicitó cerrar el ticket después de confirmar la validación correcta en habilitación.",
    "release_impact": "El cambio está publicado en dev mediante af1ab8ae972a5dec9c729a5ea7cbb6e372868149 y permanece unreleased; requiere el flujo de release separado para producción."
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
    "date": "2026-09-10",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-10",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-10",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-10",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-10",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-10",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-10",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-10",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-10",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-10",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-10",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-10",
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
