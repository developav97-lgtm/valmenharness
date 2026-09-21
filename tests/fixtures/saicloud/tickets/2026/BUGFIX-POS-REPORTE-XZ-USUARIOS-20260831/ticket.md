---
schema_version: 1
id: BUGFIX-POS-REPORTE-XZ-USUARIOS-20260831
title: Reporte X/Z debe mostrar el cajero de cada factura compartida
type: BUGFIX
module: POS
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: high
created: 2026-08-31
updated: 2026-09-07
related_ticket: BUGFIX-RESTAURANTE-CAJA-COMPARTIDA-20260831
target_release: 6.2.4
released_in: 6.2.4
---

# BUGFIX-POS-REPORTE-XZ-USUARIOS-20260831

## Solicitud original

En los reportes X y Z, cuando una caja abierta por Christian se comparte y Oscar factura documentos, el arreglo Users muestra a Christian en ambos registros. Se debe agrupar y mostrar el usuario propietario de cada PosOrder.id_admuser, conservando la caja, serial y totales correctos.

## Descripción funcional

- Alcance: únicamente el arreglo `Users` que construye `get_report_xz` para los reportes X y Z de POS. Se mantienen los cálculos de totales, consecutivos, serial, caja, pagos, impuestos y demás secciones del reporte.
- Usuario o rol afectado: cajeros que comparten caja y administradores que imprimen o consultan reportes X/Z.
- Comportamiento actual: la agrupación de órdenes no incluye `PosOrder.id_admuser`; cada fila toma `user_name` de `PosCashRegister.id_admuser`, que identifica al dueño que abrió la caja. Por ello, las facturas de Oscar aparecen a nombre de Christian aunque su `PosOrder.id_admuser` sea Oscar.
- Comportamiento esperado: cada fila de `Users` muestra el nombre del cajero persistido en las facturas agrupadas; si una misma caja tiene facturas de Christian y Oscar, se generan filas separadas por cajero con sus rangos, cantidades y totales respectivos.

## Diagnóstico

- Archivos y flujo investigados: `BackEnd/ModPos/views/functions.py::get_report_xz`. Primero se resuelven las cajas (`PosCashRegister`), luego se consulta `PosOrder` pagada y se llena `obj_report['Users']`.
- Causa raíz confirmada: `orders_qs.values()` agrupa por `id_cashControl`, `type_order` y prefijo, omitiendo `id_admuser`; el bucle usa `cc['id_admuser__name']`, tomado de la caja, en vez de la identidad de la factura. La captura QA evidencia dos renglones de la misma caja etiquetados Christian, aunque el segundo corresponde a Oscar.
- Riesgos y compatibilidad: agregar el cajero al agrupamiento separará correctamente los renglones cuando una caja tenga varios facturadores. Debe conservarse el tratamiento de ventas/devoluciones (`FV`/`DV`), filtros por segmento `alter`, y el dato de caja/serial, sin cambiar la persistencia de documentos ni sus totales globales.
- Impactos de sync, migración, Docker o despliegue: no hay cambios de modelos, sincronización, Docker ni migración. El cambio es de lectura y presentación del reporte; requiere validación funcional sobre una caja compartida en ambiente de prueba.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-08-31 para el alcance descrito en este ticket. El reporte es visible al usuario, por lo que se conservarán las pruebas automatizadas y el retest funcional en un tenant de prueba antes de cerrar.
- Alcance y exclusiones: corregir solamente la atribución mostrada en `Users`; no reatribuir `PosOrder` históricos, no cambiar la propiedad de `PosCashRegister`, ni modificar las secciones de pagos, impuestos, categorías o productos.
- Pasos ordenados:
  1. Ajustar la consulta agregada de `PosOrder` para incluir el identificador y nombre de `id_admuser` entre las claves de agrupación; asignar `user_name` desde esa misma fila y conservar `caja` y `serial_number` desde `PosCashRegister`. Responsable: Backend POS; `POINT-001`.
  2. Crear o ampliar prueba dirigida de `get_report_xz` con una caja abierta por Christian y compartida con Oscar; registrar facturas pagadas de ambos usuarios, verificando dos filas con usuario, cantidad, rango y total propios. Cubrir X y Z, una devolución si el fixture aplicable lo permite, y el filtro de segmento cuando exista.
  3. Ejecutar las pruebas dirigidas y validar manualmente en tenant de prueba que el PDF/vista del reporte X/Z conserva caja, serial y totales y distingue correctamente a ambos cajeros. Responsable: PO tras implementación.
- Rollback, backup, canario u orden de despliegue cuando aplique: no requiere backup ni migración. Si la validación identifica una regresión de agrupación o totales, revertir el cambio de la vista; los documentos persistidos y el estado de las cajas quedan intactos.

## Criterios de aceptación

- [ ] `POINT-001`: con una caja abierta por Christian y compartida con Oscar, el reporte X muestra una fila para las facturas de Christian y otra para las de Oscar; cada `user_name` coincide con `PosOrder.id_admuser`.
- [ ] `POINT-001`: el reporte Z aplica la misma atribución por cajero cuando consolida las cajas de la fecha.
- [ ] `POINT-001`: cada fila conserva caja, serial, prefijo, rango, cantidad y total correspondientes a sus documentos, sin alterar los totales generales ni los datos de pagos/impuestos.
- [ ] `POINT-001`: ventas, devoluciones y filtros `alter` continúan usando las reglas vigentes de signo y segmentación.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Reporte X/Z atribuye cada grupo al dueño de la caja y no al cajero facturador",
    "status": "closed",
    "severity": "high",
    "actual": "get_report_xz agrupa las facturas por caja, tipo y prefijo, y llena user_name desde PosCashRegister.id_admuser. En una caja compartida, las facturas de Oscar quedan mostradas bajo Christian, quien abrió la caja.",
    "expected": "Cada fila del arreglo Users debe representar el usuario persistido en PosOrder.id_admuser para las facturas incluidas en ella, aun si varios usuarios comparten la misma caja.",
    "evidence": [
      "EVIDENCE-001",
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

- Archivos cambiados: `BackEnd/ModPos/views/functions.py` y `BackEnd/ModPos/tests/test_cash_register_share.py`.
- Decisiones técnicas: `orders_qs` agrupa también por `id_admuser_id` y `id_admuser__name`; `user_name` toma el segundo valor desde `PosOrder`. La caja y el serial siguen tomándose desde `PosCashRegister`, por lo que una misma caja puede conservar esos datos comunes y presentar una fila por cajero facturador.
- Compatibilidad preservada: se mantienen filtros de estado, caja y segmento, y las reglas de signo para devoluciones. No se modifican órdenes, cajas, pagos, impuestos ni sincronización.
- Commits atribuibles al ticket:
  - `afd99b1a4d5d7f672574875569ffbf9e1fa99781` — corrige la agrupación y la atribución de usuarios en el reporte X/Z de caja compartida, con su prueba de regresión.

## Pruebas

- Comandos para el PO: `BackEnd/.venv/bin/python BackEnd/manage.py test ModPos.tests.test_cash_register_share.SharedCashRegisterConsolidationTest --keepdb`.
- Directorio de ejecución: `BackEnd/`.
- Resultado esperado: la suite termina `OK` con dos pruebas; demuestra que `Users` separa y nombra correctamente las facturas de cada cajero de una caja compartida, sin cambiar el total de cierre consolidado.
- Validaciones manuales: Christian abre y comparte caja con Oscar; ambos facturan; generar X y Z y confirmar que la segunda fila muestra Oscar, conserva "caja Christian" y refleja solo las transacciones de Oscar.
- Requisitos de ambiente o datos: tenant de prueba con dos cajeros activos, share de caja activo, caja abierta, dos facturas pagadas (una por cada usuario) y acceso a X/Z. No usar documentos fiscales reales.
- Resultado técnico local: la prueba dirigida pasó en verde (2 pruebas, 103.591 s) y `BackEnd/.venv/bin/python BackEnd/manage.py check` terminó sin incidencias. El entorno informó que `REDIS_URL` no está configurado y deshabilitó notificaciones WebSocket, efecto ajeno a este reporte de lectura.
- Resultado comunicado por el PO: el PO validó correctamente en la nube el 2026-08-31 los reportes X y Z con caja compartida; cada factura aparece con el usuario que la facturó.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-08-31",
    "build_reference": "commit:afd99b1a4d5d7f672574875569ffbf9e1fa99781",
    "environment": "dev en nube",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-08-31",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó el resultado funcional correcto en la nube el 2026-08-31."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-08-31",
    "kind": "automated",
    "description": "Prueba roja dirigida confirmó que el reporte X consolidaba dos facturas de una caja compartida en una sola fila de 80.000 atribuida al dueño de la caja.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-08-31",
    "kind": "automated",
    "description": "BackEnd/.venv/bin/python BackEnd/manage.py test ModPos.tests.test_cash_register_share.SharedCashRegisterConsolidationTest --keepdb pasó: 2 pruebas verdes; incluye separación por cajero y consolidación de cierre.",
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
    "date": "2026-08-31",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO validó en la nube que los reportes X y Z muestran correctamente el usuario que facturó en una caja compartida."
  }
]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional: cerrado tras incorporar el cajero de `PosOrder` a la agrupación de `Users` y tomar de esa orden el nombre mostrado, sin cambiar la caja ni el serial de cada renglón.
- Resultado comunicado por el PO: los reportes X y Z probados en la nube muestran correctamente el usuario que facturó en la caja compartida.
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica): QA-002 aprobada con confirmación explícita del PO el 2026-08-31.
- Riesgo residual e impacto de release: no se alteran facturas, cajas, pagos, impuestos ni documentos históricos; el cambio queda disponible en `dev` sin promoción automática a producción.
- Texto visible al usuario cuando aplique:

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-08-31",
    "technical_summary": "get_report_xz agrupa por cajero de PosOrder y muestra esa identidad en Users, conservando caja y serial.",
    "functional_summary": "Los reportes X y Z muestran el usuario que facturó incluso en caja compartida.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO validó en la nube el comportamiento correcto de X y Z el 2026-08-31.",
    "release_impact": "Disponible en dev; sin cambios de datos históricos ni promoción automática a producción."
  }
]
```

## Consumo de IA

<!-- Registros append-only `ai-usage`: consumo conocido o estimado con fuente y confianza. No inventar tokens ni coste; usar null cuando Codex no lo reporte. -->

```json
[]
```

## Release

- Estado de release: disponible en `dev`; sin promoción a producción por este cierre.
- Versión objetivo:
- Versión publicada:
- Tickets relacionados: BUGFIX-RESTAURANTE-CAJA-COMPARTIDA-20260831.

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
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-31",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-31",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-31",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-08-31",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-08-31",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-08-31",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
