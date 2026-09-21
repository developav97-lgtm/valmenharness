---
schema_version: 1
id: BUGFIX-RESTAURANTE-VENTANA-PRECUENTA-20260830
title: Aislar la ventana de impresión de la pre-cuenta por solicitud
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
created: 2026-08-30
updated: 2026-09-07
related_ticket: null
target_release: 6.2.4
released_in: 6.2.4
---

# BUGFIX-RESTAURANTE-VENTANA-PRECUENTA-20260830

## Solicitud original

Abramos un ticket para evitar que, con varias pestañas de Restaurante abiertas, una pre-cuenta pueda reemplazar la ventana PDF de otra orden antes de imprimirse.

## Descripción funcional

- Alcance: aislar el documento de impresión de cada solicitud de **Cuenta** o pre-cuenta del carrito de Restaurante. El cambio queda limitado al popup/PDF de pre-cuenta; no modifica órdenes, facturación, comandas ni la impresión de facturas POS.
- Usuario o rol afectado: meseros, cajeros y administradores que operan varias órdenes en pestañas del mismo navegador.
- Comportamiento actual: el carrito genera correctamente un PDF a partir de la orden activa, pero lo abre mediante una ventana con el nombre fijo `ventanaImpresion`. Solicitudes cercanas pueden reutilizar esa ventana y sustituir el PDF que la persona estaba a punto de imprimir.
- Comportamiento esperado: cada cuenta abre un documento aislado. El ID de orden, productos y mesa mostrados en el PDF deben pertenecer a la misma orden visible en la pestaña desde la que se solicitó.

## Diagnóstico

- Archivos y flujo investigados: los tres botones **Cuenta** del carrito y pagos invocan `RestaurantService.printPreOrder()`. Ese método guarda primero y llama `generatePdfPreOrder(..., this.res_order)`; el PDF toma `order.id` y `order.lines` de esa misma orden. Al final, `generatePdfPreOrder()` entrega el blob a `GeneralService.print_pdf()`, que usa `window.open(url, 'ventanaImpresion', ...)`.
- Causa raíz o hipótesis: confirmada a nivel de fuente. El target fijo es un estado compartible del navegador para la previsualización. Si una segunda generación llega mientras la primera ventana sigue disponible, puede reemplazar su documento. La generación contiene esperas asíncronas de IndexedDB, por lo que dos solicitudes no necesariamente terminan en el orden de sus clics.
- Riesgos y compatibilidad: un cambio genérico de `print_pdf()` podría alterar vistas previas y otros documentos. El arreglo debe limitar el nombre único a la pre-cuenta, conservar el comportamiento actual de impresión móvil y no enviar datos de la orden fuera del navegador. No se afirma reproducción en el tenant del cliente: queda como validación manual obligatoria.
- Impactos de sync, migración, Docker o despliegue: no aplica OfflineSync, SincSaiCloud, WebSocket, migraciones ni Docker. No hay cambio de API ni de modelo; se conserva el tenant/sesión ya cargado en la pestaña.

## Plan

- Gate de plan y aprobación del PO: aprobado explícitamente por el PO el 2026-08-30 mediante “Dale apruebo”. Aunque es `BUGFIX`, cambia el flujo visible de impresión y previene la entrega de una cuenta de otra orden; su riesgo operativo es alto.
- Paso 1 (POINT-001): extender `GeneralService.print_pdf()` con un nombre de ventana opcional, manteniendo `ventanaImpresion` como compatibilidad para sus demás consumidores. Ownership: `FrontEnd/src/app/common/services/general.service.ts`.
- Paso 2 (POINT-001): en `RestaurantService.generatePdfPreOrder()`, construir un nombre único por solicitud de pre-cuenta (sin exponer datos de cliente) y entregarlo a `print_pdf()`. Dos solicitudes, incluso para la misma orden, no podrán reutilizar el mismo popup. Ownership: `FrontEnd/src/app/common/services/restaurant.service.ts`.
- Paso 3 (POINT-001): agregar pruebas unitarias dirigidas que comprueben que dos solicitudes de pre-cuenta producen targets distintos y que los demás llamadores de `print_pdf()` conservan el target legado cuando no lo especifican. Ownership: specs de los servicios afectados.
- Paso 4 (POINT-001): ejecutar prueba Angular dirigida y entregar al PO una validación manual con dos pestañas y dos órdenes distinguibles antes de pasar a QA.
- Pseudocódigo de aislamiento: `preCuenta -> guardar -> generar PDF de order -> nombre único por solicitud -> print_pdf(url, 600, 800, nombreUnico)`. El nombre se crea solo para el popup; no cambia `order.id`, URL del carrito ni el payload de guardado.
- Rollback, backup, canario u orden de despliegue cuando aplique: no hay datos persistentes ni migraciones, por lo que no requiere backup. Si aparece una regresión, se revierte únicamente la sobrecarga de nombre de ventana y sus pruebas. La publicación y validación en dev siguen el proceso ordinario, sin desplegar por este plan.

## Criterios de aceptación

- [ ] POINT-001: dos solicitudes de Cuenta para órdenes distintas desde pestañas abiertas generan documentos en ventanas/targets distintos.
- [ ] POINT-001: el PDF de cada solicitud conserva el ID, mesa y líneas de la orden desde la que se generó, aun cuando otra pestaña solicite una cuenta antes de imprimir.
- [ ] POINT-001: la generación de Cuenta continúa guardando los cambios pendientes antes de formar el PDF y no imprime si el guardado falla.
- [ ] POINT-001: la impresión móvil y los otros consumidores de `GeneralService.print_pdf()` mantienen su comportamiento actual.
- [ ] POINT-001: no se modifican API, modelos, tenant activo, comandas, facturación ni datos persistidos de la orden.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "La pre-cuenta conserva la orden que la originó entre pestañas",
    "status": "verified",
    "severity": "high",
    "actual": "La pre-cuenta abre el PDF en una ventana con nombre fijo, por lo que solicitudes cercanas desde pestañas distintas pueden reutilizar y reemplazar el contenido antes de que el usuario imprima.",
    "expected": "Cada solicitud de pre-cuenta mantiene un documento de impresión aislado y el ID, productos y mesa del PDF coinciden con la orden visible en la pestaña que lo generó.",
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
      "QA-003"
    ],
    "terminal_reason": null,
    "related_ticket": null
  }
]
```

## Implementación

- Archivos cambiados: `FrontEnd/src/app/common/services/general.service.ts`, `FrontEnd/src/app/common/services/restaurant.service.ts`, `FrontEnd/src/app/common/services/general.service.spec.ts` y `FrontEnd/src/app/common/services/restaurant.service.spec.ts`.
- Decisiones técnicas: `GeneralService.print_pdf()` acepta un destino opcional y conserva `ventanaImpresion` como valor por defecto para todos sus consumidores existentes. La pre-cuenta crea un destino por solicitud con el ID de orden y un UUID aleatorio (con fallback compatible) y se lo pasa solo a su propio PDF.
- Compatibilidad preservada: no cambian API, rutas, órdenes, guardado previo a la impresión, impresión móvil, factura POS ni otros consumidores de `print_pdf()` que no envían el nuevo argumento.
- Commits atribuibles al ticket:
  - `796a991019e9b65ec6e9f323b2e8b25c51414f43` — corrige el aislamiento de ventanas de pre-cuenta y agrega pruebas de regresión.

## Pruebas

- Comandos para el PO:
  - `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/common/services/general.service.spec.ts'`
  - `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/common/services/restaurant.service.spec.ts'`
  - `npm run build -- --configuration=development --progress=false`
- Directorio de ejecución: `FrontEnd`.
- Resultado esperado: las pruebas dirigidas comprueban que el target solicitado se entrega al navegador y que dos solicitudes de pre-cuenta producen destinos distintos; el build termina sin errores atribuibles al ticket.
- Validaciones manuales: en un tenant de pruebas, abrir dos órdenes distintas en dos pestañas, solicitar Cuenta en la primera y en la segunda antes de imprimir la primera; verificar en cada PDF el ID de orden, mesa y productos antes de presionar imprimir. Repetir invirtiendo el orden de los clics.
- Requisitos de ambiente o datos: dos órdenes abiertas con productos claramente diferentes, un usuario con permiso `print_order`, navegador de escritorio y acceso a la vista previa PDF. No se requieren credenciales ni datos del cliente en el ticket.
- Resultado técnico: las suites dirigidas informaron 6/6 y 24/24 specs exitosos respectivamente. Tras cada resumen, Angular emitió un mensaje conocido sobre el patrón `--include` que no corresponde a un fallo de spec; el proceso devolvió código 0. El build Angular finalizó con código 0, hash `96397b75b5459ce5`.
- Suite completa: `npm test -- --watch=false --browsers=ChromeHeadless` quedó bloqueada fuera del alcance en `PosBranchCategoryComponent`: dos expectativas fallan y sus mocks carecen de `IndexDBService.saveData`/`deleteData`. No se modificaron esos archivos ni se incluyeron en este ticket.
- Resultado comunicado por el PO: el 2026-08-31 confirmó “ya QA quedo bien autorizo a cerrar”, tras la publicación en dev.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-08-31",
    "build_reference": "commit:796a991019e9b65ec6e9f323b2e8b25c51414f43",
    "environment": "Validación del PO en dev",
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
    "po_confirmation": "El PO confirmó: ya QA quedo bien autorizo a cerrar."
  },
  {
    "id": "QA-003",
    "date": "2026-08-31",
    "build_reference": "commit:796a991019e9b65ec6e9f323b2e8b25c51414f43",
    "environment": "Retest del PO en dev",
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
    "po_confirmation": "El PO confirmó: ya QA quedo bien autorizo a cerrar."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-08-30",
    "kind": "source-review",
    "description": "Revisión estática: RestaurantService.generatePdfPreOrder imprime el ID y las líneas del objeto order recibido; GeneralService.print_pdf abre el PDF con el target fijo ventanaImpresion. Dos solicitudes concurrentes pueden reutilizar ese contexto de navegación.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-08-30",
    "kind": "automated",
    "description": "Pruebas dirigidas Angular: GeneralService ejecutó 6 specs exitosos y RestaurantService ejecutó 24 specs exitosos, incluidos los nuevos casos de destino único de pre-cuenta.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-08-30",
    "kind": "build",
    "description": "npm run build -- --configuration=development --progress=false terminó con código 0; hash 96397b75b5459ce5.",
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
    "po_confirmation": "El PO confirmó: ya QA quedo bien autorizo a cerrar."
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
    "technical_summary": "La pre-cuenta asigna un destino de ventana único por solicitud y conserva el destino histórico para los demás documentos PDF.",
    "functional_summary": "Al generar cuentas desde pestañas distintas, cada PDF conserva la orden que lo originó y evita que otra solicitud reemplace su documento.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirmó: ya QA quedo bien autorizo a cerrar.",
    "release_impact": "El cambio ya está publicado en dev mediante commit 796a991019e9b65ec6e9f323b2e8b25c51414f43 y continúa unreleased hasta la promoción formal a producción."
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
    "date": "2026-08-30",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-08-30",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-08-30",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-08-30",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-08-30",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-08-30",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-08-30",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-08-30",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-08-30",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-08-30",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-08-30",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-08-30",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-08-30",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-08-31",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-08-31",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-08-31",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-08-31",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-08-31",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-004 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-08-31",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-08-31",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-07",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
