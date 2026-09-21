---
schema_version: 1
id: SYNC-LOCALAGENT-ITEMACT-DEVOLUCION-20260902
title: Las devoluciones locales registran QTY negativo en ITEMACT
type: SYNC
module: LOCALAGENT
workflow_status: closed
qa_status: approved
release_status: released
user_visible: false
sync_impact: true
migration_impact: false
docker_impact: false
risk_level: high
created: 2026-09-02
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# SYNC-LOCALAGENT-ITEMACT-DEVOLUCION-20260902

## Solicitud original

En la sincronización local del servicio Go LocalAgents/saiopensync, una devolución proveniente de SaiCloud queda con QTY negativo en la tabla ITEMACT. Para una devolución, QTY debe ser positivo porque la unidad ingresa al inventario; en facturas debe conservarse negativo porque descuenta.

## Descripción funcional

- Alcance: sincronización cloud → Firebird de documentos POS en `LocalAgents/saiopensync`; abarca la cantidad, cantidad base y referencia de factura origen de los movimientos `ITEMACT` de devoluciones.
- Usuario o rol afectado: operadores POS con inventario sincronizado localmente y los procesos que calculan disponibilidad desde `SUM(ITEMACT.QTY)`.
- Comportamiento actual: una devolución detectada por `FATIPDOC.TIPODEV` puede recibir `Oedet.QTYSHIP` negativo desde SaiCloud. Los dos escritores de `ITEMACT` preservan ese signo, por lo que el retorno reduce existencias.
- Comportamiento esperado: para una devolución, `ITEMACT.QTY` debe ser positivo. Para una factura normal, debe seguir siendo negativo, pues representa salida de inventario.
- Ampliación POINT-002: `ITEMACT.QTYB` debe conservar exactamente el mismo valor y signo que `QTY`. En devoluciones, `CRUFAC` y `FACTIP` deben identificar la factura origen.

## Diagnóstico

- Archivos y flujo investigados: `LocalAgents/saiopensync/internal/worker/invoice.go`. `HandleInvoiceMessage` detecta devoluciones cuando el tipo existe en `FATIPDOC.TIPODEV` (líneas 189-212) y propaga `isDevolucion` a `insertOEDET`. Esta llama tanto a `insertITEMACTInventario` como a `insertITEMACTKit`.
- Causa raíz confirmada: ambos insertadores aplican el signo de salida solo cuando `qtyShip > 0 && !isDevolucion`; para una devolución cuyo `QTYSHIP` ya llega negativo, asignan ese mismo valor negativo a `ITEMACT.QTY`. El comportamiento incorrecto aparece en ítems inventariables directos y en componentes inventariables de kits.
- Riesgos y compatibilidad: la corrección debe modificar únicamente el signo del movimiento de devolución, sin alterar `OEDET.QTYSHIP`, totales, costo, pagos ni la idempotencia existente de borrar y reinsertar el documento dentro de la misma transacción. Los reintentos seguirán reemplazando el documento por su clave local `(sucursal, tipo, número)` sin duplicados.
- Impactos de sync, migración, Docker o despliegue: impacto `SYNC` y `LocalAgents`; no hay migración ni Docker. Requiere actualizar el binario del agente por el canal operativo vigente. El servicio debe continuar ligado a `127.0.0.1`; no se modifica red, configuración ni contratos cloud.
- Ampliación POINT-002 — flujo y causa raíz confirmados: `BackEnd/ModPos/views/utils.py:get_order_sai()` resuelve `PosOrder.origen_dv` y ya envía `DEV_FACTURA` (número) y `DEV_TIPOFAC` (prefijo/tipo) en el mensaje de devolución. `LocalAgents/saiopensync/internal/worker/invoice.go:buildOEHeader()` los conserva en `OE`, pero `insertITEMACTInventario()` e `insertITEMACTKit()` fijan `QTYB` a `0` y omiten `CRUFAC`/`FACTIP`. No hace falta modificar el contrato cloud ni el modelo Django.

## Plan

- Alcance y exclusiones: corregir solo `ITEMACT.QTY` y el `TOTPARCIAL` derivado en devoluciones de inventario y kits. Se excluyen cambios de esquema Firebird, API SaiCloud, UI, configuración de red, despliegue y corrección retroactiva de movimientos ya contabilizados.
- Gate de plan: aprobado explícitamente por el PO el 2026-09-02 en esta conversación para el alcance descrito.
- Pasos ordenados:
  1. En `LocalAgents/saiopensync/internal/worker/invoice.go`, centralizar la regla de signo del movimiento: factura normal → cantidad negativa; devolución → valor absoluto positivo. Aplicarla en los insertos `ITEMACT` de inventario y de componentes de kit, preservando los demás campos y el uso actual de la transacción.
  2. Añadir pruebas unitarias table-driven en el paquete `worker` que cubran factura y devolución con `QTYSHIP` positivo/negativo, además del multiplicador de componentes de kit; verificar `QTY` y `TOTPARCIAL`.
  3. Ejecutar `go test ./...` desde `LocalAgents/saiopensync`, revisar el diff y entregar el binario/diff para prueba del PO. No se hará commit, push ni actualización de agentes sin autorización posterior.
- Compatibilidad, orden de despliegue y rollback: el mensaje cloud no cambia y los clientes anteriores siguen enviando su misma polaridad. Distribuir primero el binario compatible a un canario con una devolución nueva y validar que `ITEMACT.QTY > 0`; después ampliar según el procedimiento vigente. Si hay regresión, reinstalar el binario anterior y reintentar el mensaje solo tras verificar la transacción local. Los movimientos históricos no se mutan automáticamente; cualquier ajuste de inventario requiere una decisión/ticket separado.
- Ampliación POINT-002 — gate de plan: aprobado explícitamente por el PO el 2026-09-03 para el alcance de `QTYB`, `CRUFAC` y `FACTIP`, las pruebas, el canario y rollback descritos a continuación.
  4. En `LocalAgents/saiopensync/internal/worker/invoice.go`, al construir las filas `ITEMACT` de inventario directo y componentes de kit, asignar `QTYB` al mismo valor calculado de `QTY`. Solo cuando `isDevolucion` sea verdadero, asignar `CRUFAC` desde `invoice["DEV_FACTURA"]` y `FACTIP` desde `invoice["DEV_TIPOFAC"]`; para facturas normales conservar los valores nulos/vacíos actuales. No modificar `OE`, `OEDET`, el payload ni la transacción de borrado/reinserción.
  5. Extraer una función pura y pruebas table-driven que cubran factura normal y devolución, ítem directo y componente de kit: `QTYB == QTY`; devolución con factura origen `4PO-45` transmite `CRUFAC=45` y `FACTIP="4PO"`; reintento no crea filas adicionales. Ejecutar `go test ./...` desde `LocalAgents/saiopensync`.
  6. Probar el binario solo en un canario autorizado después de distribuirlo por el procedimiento vigente: una devolución nueva debe dejar `QTY` y `QTYB` positivos e iguales, con `CRUFAC`/`FACTIP` de la factura origen; una factura normal de control mantiene ambos valores negativos y no rellena la referencia de devolución. Rollback: restaurar el binario anterior; no se corrigen automáticamente movimientos históricos.

## Criterios de aceptación

- [ ] POINT-001: una devolución detectada por `FATIPDOC.TIPODEV`, con `QTYSHIP` positivo o negativo, inserta `ITEMACT.QTY` estrictamente positivo para un ítem inventariable directo.
- [ ] POINT-001: una devolución de kit inserta `ITEMACT.QTY` positivo para cada componente inventariable, respetando el multiplicador de la receta.
- [ ] Una factura normal conserva `ITEMACT.QTY` negativo para el mismo producto y cantidad.
- [ ] Los valores derivados `TOTPARCIAL` conservan el signo coherente con `QTY`.
- [ ] La operación conserva el borrado/reinserción transaccional por documento y no duplica filas tras reintento.
- [ ] POINT-002: para cualquier fila `ITEMACT` generada por factura o devolución, `QTYB` es exactamente igual a `QTY`, incluidos signo y multiplicador de kit.
- [ ] POINT-002: una devolución cuyo origen sea `4PO-45` guarda `CRUFAC=45` y `FACTIP="4PO"` en `ITEMACT`; los valores provienen de `DEV_FACTURA` y `DEV_TIPOFAC` ya enviados por SaiCloud.
- [ ] POINT-002: una factura normal no rellena `CRUFAC` ni `FACTIP` y no se altera el contrato cloud ni la idempotencia de la transacción.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "QTY de devolución queda negativo en ITEMACT",
    "status": "closed",
    "severity": "high",
    "actual": "Al sincronizar una devolución desde SaiCloud, ITEMACT.QTY puede conservar el QTYSHIP negativo recibido y reduce el inventario local.",
    "expected": "Toda devolución debe insertar ITEMACT.QTY positivo, pues reincorpora unidades al inventario; una factura normal conserva un movimiento negativo.",
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
    "title": "ITEMACT de devoluciones no conserva QTYB ni referencia de factura origen",
    "status": "closed",
    "severity": "high",
    "actual": "Al sincronizar una devolución a Saiopen, la fila ITEMACT no llena QTYB con el mismo valor y signo de QTY, ni registra CRUFAC y FACTIP para identificar la factura de origen.",
    "expected": "Para una devolución, ITEMACT debe guardar QTYB igual a QTY; además debe persistir CRUFAC con el número y FACTIP con el tipo del documento de la factura origen. La fuente exacta de tipo y número entre OE/OEDET debe verificarse antes de implementar.",
    "evidence": [
      "EVIDENCE-003",
      "EVIDENCE-004"
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

- Archivos cambiados: `LocalAgents/saiopensync/internal/worker/invoice.go` y `LocalAgents/saiopensync/internal/worker/worker_test.go`.
- Decisiones técnicas: se incorporó `itemActQuantity`, una normalización pura y compartida. Para factura usa el valor absoluto con signo negativo; para devolución usa el valor absoluto positivo. La regla se aplica a ítems directos y componentes de kit, y `TOTPARCIAL` del kit usa la misma dirección del movimiento.
- Compatibilidad preservada: no cambian el payload, las natural keys ni la transacción de borrado/reinserción. La corrección acepta la polaridad anterior o actual de `QTYSHIP` desde cloud y no toca mensajes ya procesados.
- Artefacto de soporte: `LocalAgents/saiopensync/dist/saiopensync-1.0.0-windows.zip`, compilado para Windows AMD64. Contiene `saiopensync.exe`, `install.bat`, `uninstall.bat` y `README.md`.
- Commits atribuibles al ticket:
  - `c49edf7c400380467a0d040c329e9f7bfa70ec62` — corrige el signo de devoluciones en `ITEMACT` y agrega la prueba de regresión.
  - `805cd5e9578c5785a17dd0dbadf4b7683d645abe` — conserva `QTYB` y registra la factura origen en `ITEMACT` para devoluciones, con pruebas de regresión.
- Implementación POINT-002: ambos constructores de `ITEMACT` calculan `QTYB` desde el mismo `QTY` ya normalizado. En devoluciones copian `DEV_FACTURA` a `CRUFAC` y `DEV_TIPOFAC` a `FACTIP`; las facturas normales conservan ambas referencias nulas.

## Pruebas

- Comandos para el PO:
  ```bash
  go test ./...
  go build -o ./saiopensync ./cmd/saiopensync
  ```
- Directorio de ejecución: `LocalAgents/saiopensync` para pruebas Go; el canario debe usar una instalación autorizada por el PO con datos de prueba.
- Resultado esperado: ambos comandos terminan con código 0. Las pruebas automatizadas cubren factura/devolución y kits; la instalación canario debe mostrar una devolución nueva con `ITEMACT.QTY > 0`, sin duplicar registros al reintentar.
- Validaciones manuales: en un canario autorizado, sincronizar una devolución nueva de un producto inventariable y comprobar la fila de `ITEMACT` correspondiente: `QTY` positivo y existencia aumentada. Reintentar el mismo mensaje y comprobar que el documento se reemplaza sin filas duplicadas. Sincronizar después una factura normal de control y comprobar `QTY` negativo.
- Requisitos de ambiente o datos: una devolución de prueba asociada a un tipo configurado en `FATIPDOC.TIPODEV`, un producto inventariable y, para la variante kit, un kit con componente inventariable. No usar datos productivos sin autorización.
- Resultado comunicado por el PO: el 2026-09-03 el PO informó que realizó la prueba y solicitó el cierre del ticket; se registra como resultado satisfactorio, sin hallazgos comunicados.
- Pruebas pendientes POINT-002: agregar la prueba Go dirigida, ejecutar `go test ./...` y validar manualmente el canario descrito en el plan antes de solicitar QA.
- Resultado local POINT-002: `go test ./...` terminó correctamente en todos los paquetes de `LocalAgents/saiopensync`, incluida la nueva regresión de cantidad base y factura origen.
- Resultado comunicado por el PO POINT-002: el 2026-09-03, el PO aprobó la implementación y ordenó realizar commit, push y cierre del ticket.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-03",
    "build_reference": "commit:c49edf7c400380467a0d040c329e9f7bfa70ec62",
    "environment": "Validación manual reportada por el PO; entorno no especificado.",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-03",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO informó el 2026-09-03 que realizó la prueba satisfactoriamente y solicitó cerrar el ticket."
  },
  {
    "id": "QA-003",
    "date": "2026-09-03",
    "build_reference": "commit:c49edf7c400380467a0d040c329e9f7bfa70ec62",
    "environment": "Validación manual reportada por el PO; entorno no especificado.",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-004",
    "date": "2026-09-03",
    "build_reference": null,
    "environment": null,
    "result": "changes_requested",
    "findings": [
      "El PO reporta campos faltantes en ITEMACT para devoluciones antes de release."
    ],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-005",
    "date": "2026-09-03",
    "build_reference": "commit:805cd5e9578c5785a17dd0dbadf4b7683d645abe",
    "environment": "dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-006",
    "date": "2026-09-03",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "PO aprueba la implementación de QTYB, CRUFAC y FACTIP y ordena cerrar el ticket."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-02",
    "kind": "automated",
    "description": "TDD: la prueba TestItemActQuantityUsesInventoryDirection falló inicialmente por símbolo inexistente y, tras implementar la normalización, pasó junto con go test ./... desde LocalAgents/saiopensync.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-02",
    "kind": "build",
    "description": "Paquete Windows AMD64 generado con make package-windows; contiene saiopensync.exe, install.bat, uninstall.bat y README.md. SHA-256 del ZIP: 6116b93911ba4f8dbd1903f8f1f88c7fa9d00d8413b89bfd53af120159614c74.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-03",
    "kind": "automated",
    "description": "Revisión estática: get_order_sai envía DEV_FACTURA y DEV_TIPOFAC desde PosOrder.origen_dv; buildOEHeader los usa en OE; los dos insertos ITEMACT fijan QTYB=0 y no incluyen CRUFAC ni FACTIP.",
    "reference": null,
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-09-03",
    "kind": "automated",
    "description": "TDD: TestItemActReturnFieldsKeepQuantityAndOriginReference falló inicialmente por helper inexistente y, tras implementar el mapeo, pasó junto con go test ./... en LocalAgents/saiopensync.",
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
    "date": "2026-09-03",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO informó el 2026-09-03 que realizó la prueba satisfactoriamente y solicitó cerrar el ticket."
  },
  {
    "id": "RETEST-002",
    "date": "2026-09-03",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "PO aprueba la implementación de QTYB, CRUFAC y FACTIP y ordena cerrar el ticket."
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
    "date": "2026-09-03",
    "technical_summary": "Se normalizó ITEMACT.QTY: devoluciones positivas y facturas negativas para ítems y componentes de kit, con prueba de regresión.",
    "functional_summary": "El PO confirmó que la devolución probada registra correctamente el movimiento de ingreso y solicitó el cierre.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO informó el 2026-09-03 que realizó la prueba satisfactoriamente y solicitó cerrar el ticket.",
    "release_impact": "El ticket queda cerrado y unreleased; el paquete Windows se distribuye por el canal de soporte y no se realizó despliegue cloud."
  },
  {
    "kind": "ticket-close",
    "id": "CLOSE-002",
    "date": "2026-09-03",
    "technical_summary": "Los insertos ITEMACT conservan QTYB igual a QTY y, en devoluciones, registran CRUFAC y FACTIP desde DEV_FACTURA y DEV_TIPOFAC sin alterar el payload ni la transacción.",
    "functional_summary": "El PO aprobó la implementación de devoluciones con cantidad base y referencia de factura origen.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "PO aprueba la implementación y ordena cerrar el ticket.",
    "release_impact": "El ticket queda cerrado funcionalmente y unreleased; su binario debe validarse y distribuirse por el procedimiento de LocalAgents."
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
    "date": "2026-09-02",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-02",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-02",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-02",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-02",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-02",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-03",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-03",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-03",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: closed -> changes_requested. Reapertura por hallazgo: El PO reporta campos faltantes en ITEMACT para devoluciones antes de release."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-03",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-03",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: changes_requested -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-03",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-03",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-03",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-09-03",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-09-03",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-006 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-09-03",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-037",
    "date": "2026-09-03",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-038",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-039",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
