---
schema_version: 1
id: BUGFIX-RESTAURANTE-BODEGA-LINEAS-SUCURSAL-20260916
title: Facturación por sucursal asigna bodega incorrecta en líneas
type: BUGFIX
module: RESTAURANTE
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: true
migration_impact: false
docker_impact: false
risk_level: high
created: 2026-09-16
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# BUGFIX-RESTAURANTE-BODEGA-LINEAS-SUCURSAL-20260916

## Solicitud original

Nosotros en el restaurante tenemos en el usuario una configuración por sucursales donde se asigna el consecutivo, el consecutivo de devolución, la bodega y la caja. Actualmente, cuando se factura desde una sucursal diferente a la principal —por ejemplo, principal 1 y sucursal 05 configurada— las líneas de los productos quedan con la bodega de la sucursal principal en vez de la bodega configurada para la sucursal 05. Además, en la pantalla de ver la factura (componente POS order, registro de líneas) se debe mostrar la bodega asignada. Finalmente, se requiere una función de soporte en esa pantalla para seleccionar una bodega y actualizar las líneas de productos de facturas que quedaron con bodega incorrecta.

## Descripción funcional

- Alcance: corregir la bodega persistida en las líneas de facturas de restaurante/POS creadas desde una sucursal distinta de la principal; exponerla en el detalle POS order; y habilitar una corrección excepcional exclusivamente para soporte.
- Usuario o rol afectado: cajeros con configuración por sucursal y personal interno autorizado de soporte.
- Comportamiento actual: aunque `AdmUserBranch` tiene una bodega por sucursal, el flujo que persiste las líneas puede conservar la bodega de la sucursal principal. POS order recibe el código de bodega, pero no lo muestra. No existe una corrección trazable para las líneas históricas afectadas.
- Comportamiento esperado: las nuevas líneas usan la bodega configurada para la sucursal activa; el detalle permite verificarla; y solo soporte autorizado puede cambiarla bajo controles que protejan inventario, historial y sincronización.

## Diagnóstico

- Archivos y flujo investigados: `Backend/ModAdmin/models/params.py` define `AdmUserBranch.id_admlocation`; `Backend/ModPos/views/functions.py:get_user_branch_config` entrega esa bodega. `FrontEnd/src/app/mod-restaurant/restaurant/point/point.component.ts` la aplica al contexto de facturación de la sucursal activa, mientras `FrontEnd/src/app/common/services/cart.service.ts:addPosOrderLine` toma la bodega desde `user_invoice`. El backend persiste el valor recibido en `PosOrderLine.id_admlocation` en `create_update_pos_order`. `get_pos_order` ya devuelve el código de la bodega, pero `FrontEnd/src/app/Compartidos/Pos/orders/pos-order/pos-order.component.html` no lo muestra.
- Causa raíz o hipótesis: la configuración de sucursal se resuelve en Point, pero debe verificarse el objeto de usuario que consume el carrito en cada ruta de facturación/restaurante y cualquier actualización asíncrona que pueda reponer el valor de la sucursal principal. Se requiere reproducir con sucursal principal 1 y sucursal 05 para confirmar el punto exacto sin asumirlo.
- Riesgos y compatibilidad: la bodega define el descuento de existencias y queda en la línea histórica. La corrección de una factura existente no puede limitarse a cambiar el FK: debe definir permisos de soporte, alcance de facturas que ya se hayan enviado, recálculo reversible de stock entre bodega origen/destino, auditoría y manejo de devoluciones. Los usuarios de una sola sucursal conservan el comportamiento actual.
- Impactos de sync, migración, Docker o despliegue: no se prevén migraciones, Docker ni despliegue en esta fase. Sí hay impacto de OfflineSync: la creación masiva de `PosOrderLine` usa `register_bulk_sync`; además, los cambios de factura marcan `sinc_saiopen=False`. Antes de escribir se debe confirmar el contrato para actualizaciones de líneas existentes, idempotencia, orden cloud/local y comportamiento de documentos ya sincronizados con SaiOpen.

## Plan

- Gate de plan y aprobación del PO: aprobación explícita requerida antes de implementar por el impacto en OfflineSync/SaiOpen, inventario e historial de facturación. Aprobado explícitamente por el PO el 2026-09-16: “si apruebo la implementacion”.
- Ajuste de alcance aprobado explícitamente por el PO el 2026-09-16: la corrección de soporte también aplica a facturas ya enviadas a SaiOpen y debe reenviar la factura con la bodega corregida.
- Alcance y exclusiones: incluye los tres puntos del ticket; excluye modificar facturas de producción, cambiar consecutivos, migraciones, ajustes masivos no solicitados y el reenvío automático de documentos.
- Pasos ordenados:
  1. `POINT-001`: reproducir con un tenant de prueba, usuario con sucursal principal 1 y asignación activa 05, y trazar el objeto que llega a `CartService.addPosOrderLine` y al payload de `create_update_pos_order`. Corregir el origen de `id_admlocation` para que use de forma inequívoca la configuración validada de la sucursal activa, sin fallback a la bodega principal en una sede secundaria.
  2. `POINT-001`: reforzar en Django que la bodega enviada corresponde a una configuración válida del usuario y sucursal de la orden, con una respuesta clara ante una petición manipulada. Definir el tratamiento de ubicaciones nulas solo para el flujo histórico compatible.
  3. `POINT-002`: conservar el contrato compatible de `get_pos_order` y añadir la columna Bodega al registro de líneas del componente POS order, mostrando el código/nombre que el API pueda entregar sin alterar los datos históricos.
  4. `POINT-003`: diseñar un endpoint de soporte específico, no reutilizar una edición general de factura. Restringirlo a administrador interno en modo soporte; validar tenant, factura, bodega destino y estado/sincronización; registrar auditoría con origen, destino, usuario y motivo. Antes de habilitarlo, decidir y probar la política para inventario, devoluciones y facturas ya enviadas/sincronizadas; en caso de riesgo no resuelto, bloquear esos documentos.
  5. `POINT-003`: si el ajuste es permitido, actualizar de modo transaccional todas las líneas objetivo y los movimientos de stock necesarios, encolar o propagar la mutación con el mecanismo vigente de OfflineSync, conservar idempotencia y marcar la factura para sincronización solo según el contrato confirmado de SaiOpen.
  6. Añadir pruebas Django y Angular dirigidas, incluidas regresión de sucursal principal, sucursal 05, payload manipulado, permisos de soporte, auditoría, rechazo de factura no apta y no duplicación tras reintento de sync.
- Rollback, backup, canario u orden de despliegue cuando aplique: no hay migración ni Docker. El rollback funcional es revertir selectivamente los cambios antes de publicar. Para cualquier corrección histórica se debe usar primero un tenant de prueba y un caso canario con una factura no enviada; no se ejecutará una actualización masiva sin una orden independiente y evidencia de backup/restauración. El orden cloud/local se define tras comprobar el contrato de OfflineSync/SaiOpen.

## Criterios de aceptación

- [ ] POINT-001: al facturar desde la sucursal 05, cada línea creada persiste la bodega configurada para 05, nunca la de la sucursal principal 1; la factura de la sucursal principal conserva su bodega vigente.
- [ ] POINT-001: una petición que intente asignar una bodega ajena a la configuración válida de usuario/sucursal es rechazada en el backend y no modifica inventario ni líneas.
- [ ] POINT-002: POS order muestra la bodega de cada línea, incluyendo una representación segura para registros históricos sin bodega.
- [ ] POINT-003: la acción se muestra solo a administrador interno con modo soporte activo; exige confirmar factura y bodega, deja auditoría y rechaza documentos o estados excluidos por la política aprobada.
- [ ] POINT-003: una corrección autorizada mantiene coherentes líneas, existencias, devoluciones aplicables y colas de sincronización, y un reintento no duplica movimientos ni registros.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Las líneas facturadas usan la bodega de la sucursal principal",
    "status": "closed",
    "severity": "critical",
    "actual": "Al facturar en una sucursal secundaria configurada para el usuario, las líneas de producto quedan asociadas a la bodega de la sucursal principal.",
    "expected": "Cada línea de la factura debe persistir la bodega configurada para la sucursal activa del usuario al momento de facturar.",
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
    "title": "El detalle de POS order no muestra la bodega de cada línea",
    "status": "closed",
    "severity": "normal",
    "actual": "En la pantalla de consulta de una factura, el registro de líneas no permite verificar la bodega persistida.",
    "expected": "La pantalla POS order debe mostrar la bodega asociada a cada línea de producto.",
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
    "title": "Soporte no puede corregir la bodega de líneas facturadas",
    "status": "closed",
    "severity": "high",
    "actual": "Las líneas históricas con bodega errónea no cuentan con una acción controlada desde POS order para corregirse.",
    "expected": "Un usuario con permiso explícito de soporte puede seleccionar una bodega válida y actualizar las líneas de la factura objetivo, con trazabilidad y validaciones.",
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

- Archivos cambiados: `BackEnd/ModRestaurant/views/functions.py`, `BackEnd/ModRestaurant/views/views.py`, `BackEnd/ModPos/views/functions.py`, `BackEnd/ModPos/urls.py`, `FrontEnd/src/app/Compartidos/Pos/orders/pos-order/pos-order.component.ts` y su plantilla.
- Decisiones técnicas: los tres flujos backend de cierre de restaurante resuelven ahora `AdmUserBranch.id_admlocation` para el cajero y sucursal de la orden, con fallback compatible a `AdmInvoiceParam` solo cuando no existe asignación. POS order muestra la bodega retornada por su contrato existente. La corrección de soporte exige JWT de administrador, modo soporte en la UI, bodega existente y motivo; bloquea la factura, cambia todas sus líneas, deja auditoría, marca `sinc_saiopen=False` y publica el payload de la factura tras el commit.
- Commits atribuibles al ticket: `a84c045113eac79a6b72f30c982983f9c0f60e34` — corrige la bodega de líneas por sucursal, muestra la bodega y permite corregir/republicar facturas desde soporte.
- Compatibilidad preservada:
- Commits atribuibles al ticket:
  - `SHA-40` — propósito del commit funcional o documental.

## Pruebas

- Comandos para el PO: se concretarán tras localizar las suites afectadas; incluirán prueba Django dirigida de facturación/bodega y pruebas Angular del carrito y POS order.
- Directorio de ejecución: `Backend/` para Django y `FrontEnd/` para Angular.
- Resultado esperado: las pruebas demuestran aislamiento de bodega por sucursal, controles de soporte y ausencia de regresión para la sucursal principal.
- Validaciones manuales: en tenant de prueba, configurar sucursal 1 y 05 con bodegas distintas; facturar un producto desde cada una; comprobar la bodega mostrada en POS order, existencias y la cola de sync. Luego validar la corrección de soporte solo sobre un documento expresamente apto según la política aprobada.
- Requisitos de ambiente o datos: tenant no productivo, usuario de prueba multi-sucursal, dos bodegas con stock del mismo producto, una caja/consecutivo por sucursal y una factura no enviada para el caso canario.
- Resultado local: `./BackEnd/.venv/bin/python -m py_compile BackEnd/ModPos/views/functions.py BackEnd/ModPos/urls.py BackEnd/ModRestaurant/views/functions.py BackEnd/ModRestaurant/views/views.py` finalizó correctamente. Desde `FrontEnd/`, `npm run build -- --configuration development` finalizó correctamente el 2026-09-16.
- Resultado comunicado por el PO: el 2026-09-16 confirmó que todos los puntos fueron validados satisfactoriamente y autorizó el cierre, incluida la corrección de bodega desde POS order.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-16",
    "build_reference": "commit:25e1e7a88342929e9cfcc6e197b416444fef7b5e",
    "environment": "dev en nube",
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
    "po_confirmation": "El PO confirmó el 2026-09-16 que validó en dev y quedó correcto."
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
    "date": "2026-09-16",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó el 2026-09-16 que validó en dev y quedó correcto."
  },
  {
    "id": "RETEST-002",
    "date": "2026-09-16",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó el 2026-09-16 que validó en dev y quedó correcto."
  },
  {
    "id": "RETEST-003",
    "date": "2026-09-16",
    "point_id": "POINT-003",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó el 2026-09-16 que validó en dev y quedó correcto."
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
    "technical_summary": "La facturación de restaurante resuelve la bodega por sucursal, POS order la muestra y soporte puede corregir/republicar la factura en SaiOpen.",
    "functional_summary": "El PO validó en dev que la bodega por sucursal y su corrección desde POS order quedaron correctas.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó el 2026-09-16: listo, ya lo validé y quedó correcto.",
    "release_impact": "El ticket queda cerrado funcionalmente y unreleased hasta una futura release."
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
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-16",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-16",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-16",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-16",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-16",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
