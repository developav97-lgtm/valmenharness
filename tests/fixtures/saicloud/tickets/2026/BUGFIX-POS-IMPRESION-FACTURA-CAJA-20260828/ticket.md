---
schema_version: 1
id: BUGFIX-POS-IMPRESION-FACTURA-CAJA-20260828
title: Fijar caja, serial y turno de la factura a su cierre de caja
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
created: 2026-08-28
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# BUGFIX-POS-IMPRESION-FACTURA-CAJA-20260828

## Solicitud original

necesito que me ayudes con una correccion en el reporte de la factura, que pasa actualmente la factura se imprime basandose en el template BackEnd/ModAdmin/models/invoice_template.py actualmente se carga los siguientes campos caja_id, serial y turno . que pasa que al imprimir la misma factura el sistema esta imprimiendo esos campos segun el usuario que este logueado y dandole imprimir pero esto esta mal debe funcionar asi mira PosOrder tiene un campo id_cashControl que equivale a el id de PosCashRegister es decir la apertura o cierre de caja y este tiene id_possaleregister del que se debe llamar la caja y el serial y el turno seria el id de PosCashRegister, entonces la factura no deberia cambiar esos valores segun quien este mandando a imprimir si no del cierre amarrado a al factura.

## Descripción funcional

- Alcance: corregir el contexto de datos usado por la plantilla dinámica de factura POS (`caja_id`, `serial` y `turno`) tanto en la impresión inicial como en la reimpresión.
- Usuario o rol afectado: cajeros, administradores y demás usuarios autorizados que imprimen o reimprimen facturas POS.
- Comportamiento actual: al solicitar una reimpresión, los valores de caja/TPV se resuelven desde la sesión, configuración o caché del usuario que imprime. La misma factura puede mostrar datos de caja diferentes entre usuarios.
- Comportamiento esperado: para una factura con `PosOrder.id_cashControl`, sus valores impresos se obtienen exclusivamente del `PosCashRegister` con ese identificador: caja y serial desde su `id_possaleregister`; `turno` con el ID de ese `PosCashRegister` (el mismo valor de `id_cashControl`). No deben variar por el usuario que inicia la impresión.

## Diagnóstico

- Archivos y flujo investigados: `BackEnd/ModAdmin/models/invoice_template.py` define solo el modelo persistente del layout, no el origen de sus placeholders. `FrontEnd/src/app/common/services/invoice-template-renderer.service.ts` construye `caja_id`, `turno` y `serial`; `FrontEnd/src/app/common/services/point-of-sale.service.ts` obtiene la orden y dispara la plantilla. `BackEnd/ModPos/views/functions.py:get_pos_order` expone `id_cashControl`. `BackEnd/ModPos/models/orders.py` mantiene ese valor como el ID de `PosCashRegister`, cuyo modelo (`BackEnd/ModPos/models/settings.py`) referencia `id_possaleregister` e `id_posTurn`.
- Causa raíz o hipótesis: confirmada a nivel de contrato de datos: el renderer recibe datos derivados del usuario/sucursal de sesión y el mecanismo de resolución debe completar de forma consistente el cierre ligado a la factura. Existe una resolución parcial de la caja de venta en el servicio POS; falta completar `turno` con el ID de cierre/apertura de la orden y eliminar cualquier fallback que vuelva a sustituir datos históricos de una orden que sí tiene `id_cashControl`.
- Riesgos y compatibilidad: la corrección afecta la trazabilidad visible de documentos ya emitidos. Debe preservar el cajero/vendedor real de la orden, los datos de facturas históricas sin `id_cashControl`, la vista previa, las copias y el fallback procedural cuando no exista plantilla activa. No debe cambiar consecutivos, totales, impuestos, pagos ni la autorización de impresión.
- Impactos de sync, migración, Docker o despliegue: no aplica sincronización, migración, Docker ni despliegue especial. La consulta debe conservar el tenant activo y no permitir que una reimpresión exponga una caja de otro tenant.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-08-28 mediante “si dale apruebo”. Aunque es un `BUGFIX`, cambia datos impresos de factura y tiene riesgo alto de trazabilidad documental.
- Paso 1 (POINT-001): trazar los dos flujos de impresión (plantilla dinámica y fallback procedural) y el contrato de `get_pos_order`; identificar todos los campos de contexto que aún provengan de la sesión del usuario.
- Paso 2 (POINT-001): resolver el `PosCashRegister` perteneciente a `invoice.id_cashControl` en el tenant activo y formar un único contexto histórico: `caja_id` y `serial` desde `id_possaleregister`; `turno` con el ID de `PosCashRegister` (igual a `invoice.id_cashControl`). La ruta no debe aceptar un ID de caja enviado por el navegador distinto del que pertenece a la orden.
- Paso 3 (POINT-001): aplicar ese contexto a la plantilla dinámica y verificar que el fallback procedural no reintroduzca caja, serial o turno de la sesión. Para órdenes históricas sin `id_cashControl`, conservar el fallback actual documentado, sin inventar un cierre.
- Paso 4 (POINT-001): añadir pruebas dirigidas de renderer/servicio que reimpriman la misma orden desde dos usuarios con cajas predeterminadas distintas y comprueben valores idénticos de caja, serial y turno; ejecutar pruebas Angular y las pruebas backend afectadas si se modifica el contrato del endpoint.
- Paso 5 (POINT-001): entregar al PO una validación manual con una factura asociada a una caja y dos usuarios autorizados con cajas distintas, incluida vista previa e impresión directa.
- Rollback, backup, canario u orden de despliegue cuando aplique: revertir únicamente el cambio de resolución y sus pruebas si se detecta regresión. No hay migraciones ni datos persistentes que requieran backup/canario; el despliegue sigue el proceso ordinario y la validación del PO será previa al cierre.

## Criterios de aceptación

- [ ] POINT-001: al reimprimir una factura que tiene `id_cashControl`, `caja_id` y `serial` corresponden al `id_possaleregister` del `PosCashRegister` referenciado por la orden.
- [ ] POINT-001: el placeholder `turno` es el ID del `PosCashRegister` vinculado a la factura (`PosOrder.id_cashControl`) y no un valor de la sesión del usuario impresor.
- [ ] POINT-001: dos usuarios autorizados con configuraciones de caja distintas obtienen los mismos valores de caja, serial y turno al imprimir la misma factura.
- [ ] POINT-001: se conserva el cajero/vendedor histórico de la factura, así como totales, cliente, líneas, pagos, consecutivo y datos DIAN.
- [ ] POINT-001: una factura histórica sin `id_cashControl` conserva el comportamiento de fallback explícito y no falla la impresión; no se consulta ni muestra información de otro tenant.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "La reimpresión conserva caja, serial y turno de la factura original",
    "status": "closed",
    "severity": "high",
    "actual": "La plantilla de factura puede tomar caja_id, serial y turno de la sesión o configuración del usuario que solicita la impresión; por ello una misma factura muestra valores distintos al reimprimirla con otro usuario.",
    "expected": "La impresión toma los tres valores desde el PosCashRegister identificado por PosOrder.id_cashControl: caja y serial desde id_possaleregister, y turno desde el PosCashRegister vinculado, de forma independiente al usuario que imprime.",
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

- Archivos cambiados: `FrontEnd/src/app/common/services/point-of-sale.service.ts`, `FrontEnd/src/app/common/services/invoice-template-renderer.service.ts`, `FrontEnd/src/app/common/services/point-of-sale.service.spec.ts` y `FrontEnd/src/app/common/services/invoice-template-renderer.service.spec.ts`.
- Decisiones técnicas: `resolveSaleRegisterForInvoice()` incluye `Authorization` al consultar el `PosCashRegister` de `invoice.id_cashControl`. Cuando una factura sí tiene cierre pero este no se puede recuperar o no está disponible en caché, no sustituye sus datos por la caja predeterminada del usuario que reimprime. El renderer asigna `turno` con `String(invoice.id_cashControl)` y conserva caja/serial de la caja de venta asociada al cierre.
- Compatibilidad preservada: las facturas sin `id_cashControl` mantienen el fallback legado. No se modificaron modelos, migraciones, API pública, consecutivos, valores monetarios, pagos ni datos DIAN.
- Commits atribuibles al ticket:
  - `98c4dce989e688dc5d41cc824930c2b899a52f51` — corrige la resolución de caja/turno en la reimpresión y agrega pruebas de regresión.

## Pruebas

- Comandos para el PO:
  - `npx ng test FrontSaiOpenCloud --watch=false --browsers=ChromeHeadless --include=src/app/common/services/point-of-sale.service.spec.ts`
  - `npx ng test FrontSaiOpenCloud --watch=false --browsers=ChromeHeadless --include=src/app/common/services/invoice-template-renderer.service.spec.ts`
  - `npm run build -- --progress=false`
- Directorio de ejecución: `FrontEnd`.
- Resultado esperado: el primer comando ejecuta 5 specs exitosos, incluidos los casos de JWT y ausencia de fallback a la caja del usuario; el segundo ejecuta 1 spec exitoso que comprueba `turno = id_cashControl`; la compilación termina con código 0.
- Validaciones manuales: crear o localizar una factura cerrada en caja A, iniciar sesión con usuario A y usuario B (con caja predeterminada distinta), reimprimir la misma factura desde ambos y comparar los tres campos; repetir con vista previa e impresión directa.
- Requisitos de ambiente o datos: tenant de pruebas, dos usuarios autorizados con cajas de venta distintas, una orden/factura pagada con `id_cashControl` válido, una plantilla POS activa que muestre los tres placeholders y acceso a impresora o vista previa.
- Resultado técnico: pruebas dirigidas exitosas (5 y 1 specs) y build Angular exitoso el 2026-08-28, hash `eaf888a54d4dad2f`. El build conserva tres avisos preexistentes del procesador CSS sobre selectores Bootstrap; no impiden la compilación.
- Suite completa: `npx ng test FrontSaiOpenCloud --watch=false --browsers=ChromeHeadless` falló fuera del alcance en `PosBranchCategoryComponent`, por mocks sin `IndexDBService.saveData`/`deleteData`; no se modificaron esos archivos. El PO autorizó publicar este ticket el 2026-08-28 pese a dichos fallos ajenos.
- Resultado comunicado por el PO: el 2026-08-28 confirmó “listo perfecto” tras validar en dev y solicitó cerrar el ticket.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-08-28",
    "build_reference": "commit:1ea056f8af113dcac455675a03b8eac6d713b784",
    "environment": "Validación del PO en dev",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-08-28",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó: listo perfecto; solicitó cerrar el ticket."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-08-28",
    "kind": "manual",
    "description": "Captura aportada por el PO: al reimprimir la misma factura con los usuarios David y Cristian, los datos visibles de CAJA y TPV cambian aunque la factura, fecha, cliente e ítems son los mismos.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-08-28",
    "kind": "automated",
    "description": "Prueba dirigida PointOfSaleService: 5 specs exitosos. Cubre el JWT al obtener PosCashRegister, la resolución de la caja histórica y la prohibición de sustituirla por la caja del usuario si falla la consulta o falta el registro en caché.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-08-28",
    "kind": "build",
    "description": "Prueba dirigida InvoiceTemplateRendererService: 1 spec exitoso para turno=id_cashControl. npm run build -- --progress=false terminó con código 0 y hash eaf888a54d4dad2f; persisten tres avisos preexistentes de selectores CSS Bootstrap.",
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
    "date": "2026-08-28",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó: listo perfecto; solicitó cerrar el ticket."
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
    "date": "2026-08-28",
    "technical_summary": "La reimpresión consulta autenticadamente el PosCashRegister de PosOrder.id_cashControl; caja y serial se resuelven desde id_possaleregister y turno se imprime con el identificador del cierre.",
    "functional_summary": "El PO validó que la misma factura conserva los datos de caja vinculados al cierre original al reimprimirla.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó: listo perfecto; solicitó cerrar el ticket.",
    "release_impact": "Publicado en dev; continúa unreleased hasta la promoción formal a producción."
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
    "date": "2026-08-28",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-08-28",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-28",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-08-28",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-08-28",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-08-28",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-08-28",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-08-28",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-08-28",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
