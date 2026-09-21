---
schema_version: 1
id: IMPROVEMENT-RESTAURANTE-CONFIRMACION-CONSUMO-20260916
title: Confirmar cambio de tipo Consumo antes de recalcular la orden
type: IMPROVEMENT
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

# IMPROVEMENT-RESTAURANTE-CONFIRMACION-CONSUMO-20260916

## Solicitud original

hola necesito que creemos un ticket para una implementacion sencilla en el restaurante, en la pantalla de pagos tenemos el boton de consumo, esto que hace que interna mente el sistema cambie su liquidacion y que cuando se envie a saiopen se envie como tipo Venta o Consumo necesitamos que cuando el usuario le de para cambiar salga un modal de confirmacion si de la confirma aplique el cambio y el recalculo y si le da cancelar que deje como estaba esto para poder evitar que por error lo cambien ya que nos ha pasado que el usuario lo cambia y ya cuando la factura sale con lo que no es toco hacer notas para anular la factura en la DIAN entonces es para evitar que por error lo hagan y deban confirmar debe ser un modal, como estilo el de eliminar un producto confirmado que indica confirmar y cancelar pero no es necesario comentario ni nada solo la confirmacion

## Descripción funcional

- Alcance: agregar una confirmación modal al cambiar el checkbox `Consumo` de la pantalla de pagos del restaurante. La confirmación debe preceder cualquier cambio de liquidación, recálculo o guardado de la orden.
- Usuario o rol afectado: usuarios operativos del restaurante que cobran o facturan órdenes desde la pantalla de pagos.
- Comportamiento actual: el cambio del checkbox ejecuta inmediatamente `RestaurantService.changeInTake()`, cambia la liquidación de la orden, recalcula impuestos/totales y guarda; el valor termina determinando el tipo `VENTA` o `CONSUMO` enviado a SaiOpen.
- Comportamiento esperado: al intentar cambiar `Consumo`, se muestra un modal de confirmación con botones `Cancelar` y `Continuar`, visualmente consistente con el modal de eliminación de producto confirmado. `Continuar` aplica el cambio y el recálculo una sola vez; `Cancelar`, cerrar el modal o cualquier salida equivalente conserva el valor y los totales anteriores, sin guardar ni emitir efectos secundarios. No se solicita comentario.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/mod-restaurant/restaurant/cart/payment/payment.component.html` enlaza el checkbox `flexCheckTake` mediante `[(ngModel)]="restaurantService.in_take"` y `(change)="restaurantService.changeInTake()"`. `FrontEnd/src/app/common/services/restaurant.service.ts:changeInTake()` valida la orden bloqueada y el costo, recalcula con `totales()` y persiste mediante `saveOrder()`. El mismo servicio calcula el tipo fiscal para SaiOpen con `res_order.ico`; `BackEnd/ModPos/views/views.py` y `BackEnd/ModPos/views/utils.py` traducen ese estado a `TIPOCONSUMO` `VENTA`/`CONSUMO`. El patrón visual solicitado existe en `FrontEnd/src/app/mod-restaurant/restaurant/cart/cart-view/cart-view.component.html`, modal `ConfirmDeleteProductConfirm`, y su lógica en `cart-view.component.ts`.
- Causa raíz o hipótesis: el binding de cambio del checkbox muta el estado antes de una confirmación humana; el modal debe interceptar la intención antes de mutar `in_take`, o restaurar de forma segura el estado sin disparar otro cambio accidental.
- Riesgos y compatibilidad: cancelar no debe recalcular, limpiar medios de pago, modificar domicilio, marcar cambios ni guardar. Confirmar debe conservar las validaciones actuales de costo/orden bloqueada y evitar doble ejecución por clics repetidos. Debe mantenerse el mapeo existente a `VENTA`/`CONSUMO` y el comportamiento de órdenes nuevas, órdenes cargadas y configuración `default_ico`.
- Impactos de sync, migración, Docker o despliegue: no se prevén cambios de backend, contrato de SaiOpen, OfflineSync, migraciones ni Docker. El guardado existente solo debe ocurrir después de confirmar; se requiere regresión del payload generado para no alterar el tipo enviado.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-09-16: “dale apruebo”. La aprobación cubre el alcance descrito: modal de confirmación para cambiar `Consumo`, aplicación del recálculo y guardado solo al confirmar, conservación del estado al cancelar y pruebas de regresión del mapeo `VENTA`/`CONSUMO`. No incluye cambios de backend, contrato SaiOpen, migraciones, Docker ni despliegue.
- Alcance y exclusiones: incluye el modal de confirmación en la pantalla de pagos, la integración con `changeInTake()` y pruebas unitarias/componentes del flujo. Excluye cambios en tasas, reglas de liquidación, contratos de SaiOpen, permisos, auditoría, migraciones, backend y rediseño general de modales.
- Pasos ordenados:
  1. `POINT-001`: separar la intención de cambiar el checkbox de la aplicación del cambio en `payment.component.html`/`.ts` y `RestaurantService`, conservando el estado previo hasta la respuesta del modal.
  2. `POINT-001`: reutilizar el patrón visual y de cierre del modal `ConfirmDeleteProductConfirm` o un componente modal equivalente ya registrado; mostrar un mensaje explícito sobre cambiar entre `Venta` y `Consumo`, con `Cancelar` y `Continuar`, sin campo de comentario.
  3. `POINT-001`: al confirmar, ejecutar el flujo actual una sola vez, incluyendo validaciones, recálculo, actualización de totales y guardado. Si la validación existente rechaza el cambio, restaurar el estado previo y no dejar una orden parcialmente modificada.
  4. `POINT-001`: al cancelar o cerrar, restaurar el checkbox al valor anterior sin invocar `changeInTake()`, preservar líneas, impuestos, totales, pagos y domicilio, y no llamar a `saveOrder()`.
  5. Añadir pruebas Angular para confirmar, cancelar/cerrar, doble clic, orden bloqueada, validación de costo y regresión del valor `res_order.ico`; ejecutar una comprobación dirigida del mapeo backend `VENTA`/`CONSUMO` sin modificarlo.
- Rollback, backup, canario u orden de despliegue cuando aplique: no requiere backup, canario, migración ni orden cloud/local. El rollback funcional es revertir los cambios frontend atribuibles al ticket antes de publicar. La validación manual debe hacerse primero en un tenant no productivo con una orden de prueba no enviada a SaiOpen.

## Criterios de aceptación

- [ ] POINT-001: al intentar cambiar el checkbox `Consumo`, aparece un modal de confirmación con opciones `Cancelar` y `Continuar`, sin solicitar comentario.
- [ ] POINT-001: `Continuar` aplica el nuevo valor una sola vez, recalcula la liquidación/totales y guarda la orden; el tipo resultante conserva el mapeo correcto entre `VENTA` y `CONSUMO` al preparar el envío a SaiOpen.
- [ ] POINT-001: `Cancelar`, cerrar el modal o hacer clic fuera cuando el modal lo permita deja el checkbox, `res_order.ico`, líneas, impuestos, totales, pagos y domicilio exactamente como estaban, sin guardar ni recalcular.
- [ ] POINT-001: la protección no altera las validaciones actuales para orden bloqueada ni para productos cuyo precio quedaría por debajo del costo; ante rechazo, la orden queda en el estado anterior.
- [ ] POINT-001: clics repetidos no ejecutan dos recálculos ni dos guardados, y las órdenes nuevas y cargadas conservan su comportamiento actual salvo la confirmación solicitada.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "El cambio de Consumo se aplica sin confirmación",
    "status": "closed",
    "severity": "high",
    "actual": "El checkbox de la pantalla de pagos muta inmediatamente la liquidación, recalcula la orden y la guarda, lo que puede producir un tipo VENTA o CONSUMO incorrecto antes de que el usuario advierta el cambio.",
    "expected": "El sistema debe solicitar confirmación explícita antes de cambiar la liquidación; cancelar o cerrar debe conservar íntegramente el estado previo y continuar debe aplicar el cambio una sola vez.",
    "evidence": [
      "EVIDENCE-001",
      "EVIDENCE-002",
      "EVIDENCE-003",
      "EVIDENCE-004"
    ],
    "affected_files": [
      "FrontEnd/src/app/mod-restaurant/restaurant/cart/payment/payment.component.html",
      "FrontEnd/src/app/mod-restaurant/restaurant/cart/payment/payment.component.ts",
      "FrontEnd/src/app/mod-restaurant/restaurant/cart/payment/payment.component.css",
      "FrontEnd/src/app/mod-restaurant/restaurant/cart/payment/payment.component.spec.ts"
    ],
    "diagnosis": "El binding change actual ejecutaba directamente el método mutador; faltaba una barrera de confirmación antes de cambiar in_take/res_order.ico.",
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

- Archivos cambiados: `FrontEnd/src/app/mod-restaurant/restaurant/cart/payment/payment.component.html`, `.ts`, `.css` y nueva spec `payment.component.spec.ts`.
- Decisiones técnicas: se reemplazó el binding bidireccional por `[checked]` + `(change)` para conservar el valor hasta la confirmación. Al detectar el clic, el componente restaura inmediatamente el `checked` nativo al valor anterior mientras el modal espera la decisión. El modal se implementó dentro de la pantalla de pagos con el patrón visual local; confirmar asigna el nuevo valor y delega una sola vez en `RestaurantService.changeInTake()`, mientras cancelar/cerrar solo descarta la intención.
- Compatibilidad preservada: no se cambió el contrato backend ni el mapeo `TIPOCONSUMO` de SaiOpen; se conservaron las validaciones, recálculo y guardado existentes, ejecutándolos solo después de confirmar.
- Commits atribuibles al ticket:
  - `983464d657389f82ab10c7e35752bb73390c629d` — agrega el modal de confirmación de Consumo/Venta y las pruebas iniciales.
  - `ff728549298ac6887376e09fffd91c8c1a80778b` — corrige la restauración visual del checkbox al cancelar.
  - `6cb5441531c9967ff839ba101a7aee556aad1d6d` — registra el ticket, sus pruebas y el ciclo de QA.

## Pruebas

- Comandos para el PO: `cd FrontEnd && npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/mod-restaurant/restaurant/cart/payment/payment.component.spec.ts'`; `cd FrontEnd && npm run build -- --configuration development`. No se agregó prueba backend porque no se modificó el contrato ni la lógica de SaiOpen.
- Directorio de ejecución: `FrontEnd/` para pruebas y build Angular; raíz del repositorio para pytest si se agrega una regresión backend.
- Resultado esperado: 2 pruebas unitarias/componentes verdes y build de desarrollo exitoso; no se esperan cambios de contrato backend.
- Validaciones manuales: en tenant no productivo, abrir una orden con impuestos/pagos, cambiar `Consumo`, verificar el modal; cancelar y cerrar comprobando que no cambien checkbox, totales, impuestos, pagos ni guardado; repetir y confirmar comprobando recálculo y guardado único; validar tanto `VENTA` como `CONSUMO`, orden bloqueada y rechazo por costo.
- Requisitos de ambiente o datos: tenant no productivo, usuario operativo, una orden nueva y una existente, productos con y sin impuesto al consumo, medios de pago cargados y acceso a consola/red de desarrollo para comprobar que solo se guarda después de confirmar.
- Resultado comunicado por el PO: el 2026-09-16 confirmó que al cancelar tanto el marcado como el desmarcado el checkbox conserva el estado anterior, y que al confirmar la liquidación se aplica correctamente.
- Resultado local: después de corregir el estado visual, la spec dirigida ejecutó 3 pruebas y terminó con `3 SUCCESS`. `npm run build -- --configuration development` terminó correctamente. La suite completa alcanzó 658 pruebas y reportó 2 fallos preexistentes en `PosBranchCategoryComponent unassignCategory()` por mocks incompletos de IndexedDB (`saveData`/`deleteData`), fuera del alcance de este ticket.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-16",
    "build_reference": "worktree:sha256:1be5816f7e3bad790ce6b630a7627e11183a0e55a00cd3132430f7cb51adbf79",
    "environment": "tenant no productivo; validación manual del PO",
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
    "po_confirmation": "El PO confirmó el 2026-09-16 que la operación quedó correcta."
  },
  {
    "id": "QA-003",
    "date": "2026-09-16",
    "build_reference": "worktree:sha256:1be5816f7e3bad790ce6b630a7627e11183a0e55a00cd3132430f7cb51adbf79",
    "environment": "tenant no productivo; retest manual del PO",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-004",
    "date": "2026-09-16",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó el 2026-09-16 que la operación quedó correcta."
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
    "description": "El checkbox flexCheckTake de la pantalla de pagos estaba enlazado directamente a RestaurantService.changeInTake().",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-16",
    "kind": "code",
    "description": "changeInTake() actualiza res_order.ico, recalcula impuestos y totales, y guarda la orden.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-16",
    "kind": "manual",
    "description": "La spec dirigida pasó 2 casos: cancelar conserva el estado y confirmar ejecuta el recálculo una sola vez.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-09-16",
    "kind": "manual",
    "description": "El PO confirmó que al cancelar la confirmación la liquidación no se aplicaba, pero el checkbox quedaba visualmente en el valor clicado en lugar del estado anterior.",
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
    "po_confirmation": "El PO confirmó el 2026-09-16 que confirmó y canceló el cambio, y el checkbox conserva el estado anterior correctamente."
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
    "technical_summary": "Se implementó la confirmación previa del cambio Consumo/Venta y se corrigió la restauración visual del checkbox al cancelar.",
    "functional_summary": "El PO validó que confirmar aplica la liquidación y que cancelar conserva el estado anterior del checkbox sin aplicar cambios.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó el 2026-09-16: listo, ya quedó todo validado.",
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
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-16",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-16",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-16",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-16",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-16",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-16",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-16",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-003."
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
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-004 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-16",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
