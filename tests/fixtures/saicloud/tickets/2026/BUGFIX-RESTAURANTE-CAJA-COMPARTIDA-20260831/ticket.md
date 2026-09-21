---
schema_version: 1
id: BUGFIX-RESTAURANTE-CAJA-COMPARTIDA-20260831
title: Facturas de caja compartida deben registrar al cajero que factura
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
created: 2026-08-31
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# BUGFIX-RESTAURANTE-CAJA-COMPARTIDA-20260831

## Solicitud original

Necesito que revisemos, validemos y solucionemos un inconveniente en restaurante con la opción de compartir caja. Escenario reportado por QA: 1. Christian abre la caja y la comparte con David. 2. David inicia sesión, toma una orden y aparece seleccionado como usuario, pero al facturar todas las facturas quedan a nombre de Christian. 3. En cierres y reportes X todos los documentos aparecen con Christian, quien abrió la caja. Se requiere validar que, al facturar en restaurante, cada factura quede a nombre del cajero que la genera para que compartir caja no asigne todos los documentos al usuario principal.

## Descripción funcional

- Alcance: facturación de órdenes de Restaurante contra una caja POS abierta y compartida, incluida la ruta actual y la ruta heredada que usa el divisor de órdenes.
- Usuario o rol afectado: cajeros con acceso activo a una caja compartida y quienes consultan cierres o reportes X.
- Comportamiento actual: la factura `PosOrder` puede conservar en `id_admuser` al dueño que abrió la caja, aunque otro cajero compartido genere el cobro. En consecuencia, cierres y reportes atribuyen el documento al usuario incorrecto.
- Comportamiento esperado: `PosOrder.id_admuser` representa al cajero que ejecuta la facturación; `id_cashControl` continúa identificando la misma caja compartida para consolidar su cierre.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/common/services/restaurant.service.ts` envía el cierre por `res/close_res_order`; `BackEnd/ModRestaurant/views/functions.py::close_res_order` valida la caja y crea la factura. La ruta heredada `BackEnd/ModRestaurant/views/views.py::CloseResOrder` permanece expuesta y es usada por el divisor de órdenes (`FrontEnd/src/app/mod-restaurant/Utils/divider-order/divider-order.component.ts`).
- Causa raíz confirmada: en `close_res_order`, después de cargar la caja, se asigna `PosOrder.id_admuser_id=cash_register.id_admuser_id`. Ese campo es el dueño/aperturador de la caja, no necesariamente el cajero activo que factura. La ruta heredada también asigna el usuario desde la orden, sin resolver de forma uniforme el cajero facturador.
- Riesgos y compatibilidad: la corrección no debe cambiar el `id_cashControl` ni la consolidación monetaria de la caja compartida. La identidad usada para asignar la factura debe provenir de un contexto autenticado o validado contra la caja compartida; no se aceptará un identificador de usuario arbitrario. Deben preservarse documentos históricos y los flujos de caja no compartida, orden dividida, factura electrónica y reportes.
- Impactos de sync, migración, Docker o despliegue: no requiere migración ni Docker. La creación de `PosOrder` en Restaurante publica la factura y actualiza la cola de sincronización; se validará que el cambio preserve esos efectos y que no cree duplicados ni altere el contrato de sincronización.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-08-31 para el alcance descrito en este ticket.
- Alcance y exclusiones: corregir únicamente la identidad del cajero en facturas nuevas de Restaurante; no se reatribuyen documentos históricos ni se cambia la propiedad de la caja, sus totales o permisos de compartirla.
- Pasos ordenados:
  1. Confirmar el origen autenticado del cajero en los dos endpoints de facturación y definir una resolución única que acepte al dueño o a un usuario con share activo en la caja indicada, rechazando identidad ausente o no autorizada. Responsable: Backend Restaurante; `POINT-001`.
  2. Actualizar la creación de `ResOrder.id_admuser_cashier` y `PosOrder.id_admuser` para usar el cajero facturador autorizado, manteniendo `id_cashControl` ligado a la caja abierta. Aplicar la misma regla a la ruta heredada de órdenes divididas o retirarla del alcance solo si se demuestra que no puede emitir facturas en producción. Responsable: Backend Restaurante y Frontend Restaurante si el contrato requiere propagar un dato autenticado verificable.
  3. Añadir pruebas de regresión que creen Christian como dueño, David como share activo y una orden facturada por David; comprobar que `PosOrder.id_admuser == David`, que la caja permanece siendo la de Christian y que el cierre consolida ventas de ambos. Cubrir también dueño, caja sin share, usuario no autorizado y ruta de división aplicable. Responsable: Backend Restaurante.
  4. Ejecutar la suite dirigida y validar manualmente en un tenant de prueba los reportes X/cierre para ambas facturas. Responsable: PO con evidencia QA posterior a la implementación.
- Corrección adicional aprobada por el PO el 2026-08-31: cubrir el bloque `closing` de `create_update_order`, que recibe `id_admuser_cashier` desde `processSaveOrder` pero lo sobrescribía con el dueño de la caja. Se conserva la misma validación de dueño/share activo y el fallback para clientes antiguos sin ese campo.
- Rollback, backup, canario u orden de despliegue cuando aplique: no hay migración. El rollback es revertir el cambio de aplicación si las pruebas funcionales detectan regresión; no se modifican facturas históricas. Antes de publicar se realizará prueba dirigida en tenant no productivo con dos cajeros y una caja compartida.

## Criterios de aceptación

- [ ] `POINT-001`: con Christian como dueño de una caja abierta y David como usuario compartido activo, una factura de Restaurante facturada por David guarda `PosOrder.id_admuser = David` e `id_cashControl` de la caja de Christian.
- [ ] `POINT-001`: una factura generada por Christian conserva a Christian como cajero y ambas facturas se incluyen en el mismo cierre de caja.
- [ ] `POINT-001`: el reporte X y el cierre muestran cada documento bajo el cajero que lo facturó, sin alterar los totales consolidados de la caja.
- [ ] `POINT-001`: se rechaza de forma controlada facturar indicando un usuario que no sea dueño ni compartido activo de la caja; no se crea `PosOrder`.
- [ ] `POINT-001`: los flujos no compartidos y las facturas electrónicas/regulares conservan su comportamiento y no se duplican eventos de sincronización.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "La factura registra al abridor y no al cajero que la genera",
    "status": "closed",
    "severity": "high",
    "actual": "Con una caja abierta por Christian y compartida con David, David puede tomar una orden como usuario seleccionado, pero al facturar el documento se registra a nombre de Christian. Los cierres y reportes X atribuyen los documentos al usuario que abrió la caja.",
    "expected": "Cada factura generada desde Restaurante debe registrar al cajero autenticado que ejecuta la facturación, incluso cuando la caja fue abierta por otro usuario y está compartida. Los cierres y reportes X deben reflejar esa misma atribución.",
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
  },
  {
    "id": "POINT-002",
    "title": "El cierre embebido de create_update_order sobrescribe al cajero compartido",
    "status": "closed",
    "severity": "high",
    "actual": "processSaveOrder envía id_admuser_cashier a create_update_order y el endpoint lo guarda inicialmente en ResOrder. Sin embargo, al procesar closing reemplaza ResOrder.id_admuser_cashier y PosOrder.id_admuser con el dueño de PosCashRegister, por lo que David queda atribuido como Christian.",
    "expected": "Al facturar mediante processSaveOrder/create_update_order, el cajero autenticado y autorizado que ejecuta el cierre debe conservarse en ResOrder.id_admuser_cashier y PosOrder.id_admuser, mientras id_cashControl continúa identificando la caja compartida.",
    "evidence": [
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

- Archivos cambiados: `BackEnd/ModRestaurant/views/functions.py`, `BackEnd/ModRestaurant/views/views.py` y `BackEnd/ModRestaurant/tests/test_close_res_order_total_recompute.py`.
- Decisiones técnicas: los endpoints de facturación directa resuelven el cajero autenticado y el cierre embebido de `create_update_order` utiliza `id_admuser_cashier` enviado por `processSaveOrder`, validándolo como dueño o share activo de la caja. `ResOrder.id_admuser_cashier` y `PosOrder.id_admuser` toman esa identidad. El identificador `id_cashControl` no cambia.
- Compatibilidad preservada: la factura continúa usando la misma caja, consecutivo, publicación y cola de sincronización. No se modifican documentos históricos ni el modelo de datos.
- Commits atribuibles al ticket:
  - `1952eddcd035ae71ca9b632127a4a6cb793b4cf2` — corrige la asignación del cajero en las rutas directa y heredada de facturación de Restaurante.
  - `9d0a1ce6b5d506e3afda4019026e9ccd822e1212` — corrige el cierre embebido de `create_update_order` para conservar al cajero compartido autorizado.

## Pruebas

- Comandos para el PO: tras la implementación, `python manage.py test ModRestaurant.tests.test_close_res_order_cashier` y la suite dirigida que cubra el endpoint heredado si sigue activo.
- Directorio de ejecución: `BackEnd/`.
- Resultado esperado: pruebas verdes que acrediten la atribución individual del cajero y la consolidación única de la caja.
- Validaciones manuales: en un tenant de prueba, Christian abre/compartir caja con David; ambos facturan una orden propia; confirmar en el detalle de `PosOrder`, reporte X y cierre que la autoría de cada factura coincide con quien la facturó y que el total de caja combina ambas ventas.
- Requisitos de ambiente o datos: dos usuarios cajeros activos, permiso y share activo de caja, una caja abierta, mesa/producto/medio de pago/configuración de facturación disponibles. No usar datos productivos ni documentos fiscales reales.
- Resultado técnico local: `BackEnd/.venv/bin/python BackEnd/manage.py check` y la compilación de los archivos modificados terminaron sin errores. La prueba Django dirigida no pudo completar en este host: el runner reutiliza la base `test_saiopencloud`, inicia el aprovisionamiento tenant y el proceso se interrumpe antes de entregar resultado; no se eliminó ni alteró esa base compartida.
- Resultado comunicado por el PO: las pruebas en la nube fueron validadas correctamente el 2026-08-31; las facturas quedan a nombre del usuario que las facturó, también con caja compartida.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-08-31",
    "build_reference": "commit:9d0a1ce6b5d506e3afda4019026e9ccd822e1212",
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
    "po_confirmation": "El PO confirmó el resultado funcional en la nube el 2026-08-31."
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
    "description": "BackEnd/.venv/bin/python BackEnd/manage.py check y compilación py_compile de las rutas y prueba modificadas finalizaron sin errores.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-08-31",
    "kind": "manual",
    "description": "PO confirmó el 2026-08-31 que la prueba dirigida pasó correctamente y autorizó un único commit y push selectivos a dev para prueba en la nube.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-08-31",
    "kind": "automated",
    "description": "La corrección de create_update_order fue compilada con py_compile y BackEnd/manage.py check finalizó sin errores.",
    "reference": null,
    "point_id": "POINT-002"
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
    "po_confirmation": "El PO validó que, con caja compartida, las facturas quedan a nombre del usuario que las facturó."
  },
  {
    "id": "RETEST-002",
    "date": "2026-08-31",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO validó que processSaveOrder/create_update_order conserva el cajero que factura en la caja compartida."
  }
]
```

## Cierre

<!-- Bloque JSON append-only de objetos con `kind: "ticket-close"`; el esquema completo está en ticket-schema.md. -->

- Cierre técnico y funcional: cerrado tras corregir las tres rutas de facturación que sobrescribían el cajero por el dueño de la caja y después de la validación funcional en la nube.
- Resultado comunicado por el PO: las facturas de caja compartida ya se atribuyen correctamente al usuario que las facturó.
- QA aprobada o eximida (motivo y confirmación explícita del PO si aplica): QA-002 aprobada con confirmación explícita del PO el 2026-08-31.
- Riesgo residual e impacto de release: no se reatribuyen documentos históricos. El reporte X/Z conserva un defecto independiente de presentación de usuarios, registrado en un ticket nuevo relacionado; no altera la autoría persistida de `PosOrder` ya validada.
- Texto visible al usuario cuando aplique:

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-08-31",
    "technical_summary": "Las rutas directa, heredada y de cierre embebido conservan el cajero autorizado al facturar con caja compartida.",
    "functional_summary": "Las facturas validadas en la nube quedan a nombre del usuario que las facturó.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó en la nube el 2026-08-31 que las facturas salen con el usuario correcto.",
    "release_impact": "Disponible en dev; no reatribuye documentos históricos ni promueve a producción."
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
- Tickets relacionados: BUGFIX-POS-REPORTE-XZ-USUARIOS-20260831.

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
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-31",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-31",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-08-31",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-08-31",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-08-31",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-08-31",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-08-31",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-08-31",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-08-31",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
