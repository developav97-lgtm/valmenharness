---
schema_version: 1
id: BUGFIX-POS-REPORTE-Z-SUCURSAL-20260907
title: El reporte Z mezcla cierres de sucursales
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
created: 2026-09-07
updated: 2026-09-17
related_ticket: BUGFIX-POS-REPORTE-XZ-USUARIOS-20260831
target_release: 6.2.5
released_in: 6.2.5
---

# BUGFIX-POS-REPORTE-Z-SUCURSAL-20260907

## Solicitud original

En el schema dev, el 2026-09-07 el usuario cristian abrió caja en las sucursales 5 y 8. Los reportes X de cada caja muestran datos correctos. Al generar el reporte Z de la sucursal 8, este aparece vacío, sin facturas y con valores en cero; al generar el reporte Z de la sucursal 5, incluye la información de ambas sucursales. Se solicita revisar y validar el comportamiento.

## Descripción funcional

- Alcance: reporte Z de los cierres de caja de POS, consolidado por fecha y sucursal. No se modifica la persistencia de cajas, facturas ni sus sucursales.
- Usuario o rol afectado: cajeros y administradores que consultan o imprimen el reporte Z desde Cierres de caja.
- Comportamiento actual: al imprimir Z desde una fila de sucursal 8, el reporte puede quedar en cero; desde una fila de sucursal 5, puede incluir cajas abiertas por el mismo usuario en ambas sucursales.
- Comportamiento esperado: el reporte Z debe consolidar exclusivamente las cajas cuya sucursal persistida coincide con la sucursal de la fila seleccionada; las cajas históricas sin sucursal conservan el fallback legado a la sucursal base de su usuario.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/Compartidos/Pos/cash-register/cash-registers/cash-registers.component.ts::get_report_z` envía `company_branch_id` de la fila al endpoint `BackEnd/ModPos/views/functions.py::get_report_xz`. El listado `get_cash_registers` ya filtra con `PosCashRegister.id_admcompanybranch` y fallback histórico.
- Causa raíz confirmada: para Z, `get_report_xz` filtra por `id_admuser__id_admbranch`, la sucursal base del cajero, en lugar de `PosCashRegister.id_admcompanybranch`. Dos cajas de Cristian abiertas en sucursales distintas quedan agrupadas según su sucursal base, reproduciendo la evidencia aportada.
- Riesgos y compatibilidad: el cambio debe aislar el reporte por la sucursal efectiva de cada apertura sin alterar el modo `Todas las Sucursales`, el reporte X, la agrupación por cajero, los filtros de facturas alternas ni cajas históricas sin sucursal.
- Impactos de sync, migración, Docker o despliegue: no hay cambios de modelo, migración, sincronización, Docker, WebSocket ni despliegue. El alcance es una consulta de lectura tenant-scoped; se probará en el esquema de prueba aislado de Django.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-09-07 mediante la instrucción “si planifica y ejecuta el plan”. Se trata de un BUGFIX de lectura sin impactos críticos de sync, migración, Docker, autenticación, WebSocket o despliegue.
- Alcance y exclusiones: ajustar solo la selección de `PosCashRegister` del reporte Z y añadir regresión automatizada. No se modificarán datos existentes, modelos, migraciones, órdenes, pagos ni frontend.
- Pasos ordenados:
  1. Añadir una prueba dirigida para dos cajas del mismo usuario con sucursales persistidas distintas y facturas pagadas en ambas; el Z solicitado para cada sucursal debe incluir solamente su caja. Archivo: `BackEnd/ModPos/tests/test_cash_register_share.py`; `POINT-001`.
  2. Ejecutar la prueba en rojo para demostrar que la selección actual usa la sucursal base del usuario, no la sucursal de la apertura.
  3. Cambiar el filtro Z de `get_report_xz` para aplicar el mismo criterio de sucursal efectiva del listado: `id_admcompanybranch` y fallback de compatibilidad únicamente cuando el valor sea nulo. Archivo: `BackEnd/ModPos/views/functions.py`; `POINT-001`.
  4. Ejecutar la prueba dirigida, la suite de cajas compartidas y `manage.py check`; preparar validación funcional en dev con las dos sucursales del caso.
- Rollback, backup, canario u orden de despliegue cuando aplique: no requiere backup, canario ni migración porque no modifica datos. Si una regresión altera la consolidación, revertir únicamente el cambio de filtro y conservar intactas cajas y facturas.

## Criterios de aceptación

- [ ] `POINT-001`: con un mismo cajero y dos cajas abiertas el mismo día en sucursales distintas, el Z de cada sucursal contiene únicamente los rangos, totales, pagos e impuestos de su propia caja.
- [ ] `POINT-001`: el Z con “Todas las Sucursales” conserva la consolidación de todas las cajas de la fecha.
- [ ] `POINT-001`: una caja histórica sin `id_admcompanybranch` continúa apareciendo al pedir Z para la sucursal base de su usuario.
- [ ] `POINT-001`: reporte X, segmentación de documentos alternos y datos persistidos no cambian.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "El reporte Z no queda aislado por sucursal",
    "status": "closed",
    "severity": "high",
    "actual": "Con cierres del usuario cristian en sucursales 5 y 8 del schema dev el 2026-09-07, el reporte Z de sucursal 8 se imprime vacío y en cero, mientras el de sucursal 5 incorpora facturas y totales de ambos cierres.",
    "expected": "Cada reporte Z debe incluir únicamente las facturas, totales y formas de pago del cierre de caja seleccionado y de su propia sucursal.",
    "evidence": [
      "EVIDENCE-001",
      "EVIDENCE-002",
      "EVIDENCE-003"
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
- Decisiones técnicas: el reporte Z filtra `PosCashRegister` por `id_admcompanybranch`; para filas históricas con ese campo nulo conserva el fallback a `id_admuser__id_admbranch`, igual que el listado de cierres.
- Compatibilidad preservada: “Todas las Sucursales” continúa sin filtro de sucursal; reporte X, órdenes, pagos, impuestos, segmentación de documentos alternos y datos históricos no se modifican.
- Commits atribuibles al ticket:
  - `42c4aa2f37f76effd8f873dccc2a54b88b8009fe` — corrige el aislamiento del reporte Z por la sucursal de apertura y añade su prueba de regresión.

## Pruebas

- Comandos para el PO: `BackEnd/.venv/bin/python BackEnd/manage.py test ModPos.tests.test_cash_register_share.SharedCashRegisterConsolidationTest --keepdb` y `BackEnd/.venv/bin/python BackEnd/manage.py check` con una configuración de base de pruebas local aislada; para la validación funcional, imprimir Z desde los dos cierres en dev.
- Directorio de ejecución: raíz del repositorio.
- Resultado esperado: la prueba de aislamiento del reporte Z y la suite dirigida terminan `OK`; `check` no reporta incidencias. En dev, cada Z contiene solo los datos de su sucursal.
- Validaciones manuales: en dev, con cajas cerradas el mismo día para el mismo usuario en sucursales 5 y 8, imprimir Z desde cada fila. Cada informe debe mostrar solo su sede y sus documentos; “Todas las Sucursales” debe consolidar ambas.
- Requisitos de ambiente o datos: tenant dev con dos cierres del mismo día, cada uno con `id_admcompanybranch` persistido y al menos una factura pagada propia. No crear ni modificar documentos fiscales reales para validar.
- Resultado técnico local: la prueba nueva falló inicialmente con `200000.0 != 100000.0`, confirmando que el Z de la sucursal base sumaba dos cajas. Tras el ajuste, la prueba dirigida y `SharedCashRegisterConsolidationTest` (3 pruebas) terminaron `OK`; `manage.py check` no reportó incidencias. El entorno informó que `REDIS_URL` no está configurado y deshabilitó notificaciones WebSocket, sin relación con este reporte de lectura.
- Resultado comunicado por el PO: el 2026-09-16 confirmó que todos los puntos fueron validados satisfactoriamente y autorizó el cierre.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-16",
    "build_reference": "commit:9617b3789e105203d1f7d81fe7ec6632a38885ca",
    "environment": "dev validado por el PO",
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
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirma que todos los puntos de este ticket fueron validados satisfactoriamente y autoriza su cierre."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-07",
    "kind": "manual",
    "description": "Capturas aportadas por el PO: listado de dos cierres del 2026-09-07 para cristian leon (sucursales 8 y 5); reporte Z de sucursal 8 en cero; reporte Z de sucursal 5 con transacciones de ambas cajas.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-07",
    "kind": "automated",
    "description": "La prueba dirigida de aislamiento del reporte Z fue creada, pero no se ejecutó: el runner no pudo inicializar una base de pruebas aislada. La configuración por defecto apunta a una base remota y la instancia PostgreSQL local activa rechaza el rol configurado; se detuvieron las ejecuciones antes de alterar datos o volúmenes locales.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-07",
    "kind": "automated",
    "description": "TDD local: la nueva prueba falló inicialmente con 200000.0 != 100000.0, reproduciendo la mezcla de dos cajas por sucursal base. Tras el ajuste, la prueba dirigida y SharedCashRegisterConsolidationTest (3 pruebas) terminaron OK; manage.py check no reportó incidencias.",
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
    "date": "2026-09-16",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirma que todos los puntos de este ticket fueron validados satisfactoriamente y autoriza su cierre."
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
    "date": "2026-09-16",
    "technical_summary": "La implementación, pruebas y retests trazables permanecen registrados en este ticket; todos sus puntos quedaron cerrados.",
    "functional_summary": "El PO confirmó la validación satisfactoria de todos los puntos y autorizó el cierre.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirma que todos los puntos de este ticket fueron validados satisfactoriamente y autoriza su cierre.",
    "release_impact": "Cierre funcional sin publicación de release; permanece unreleased hasta su inclusión explícita en una versión."
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
    "date": "2026-09-07",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-07",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-07",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-07",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-07",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-07",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-07",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-16",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-16",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-16",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
