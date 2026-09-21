---
schema_version: 1
id: BUGFIX-RESTAURANTE-FACTURACION-DIRECTA-20260908
title: La facturación directa reutiliza una orden cerrada
type: BUGFIX
module: RESTAURANTE
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

# BUGFIX-RESTAURANTE-FACTURACION-DIRECTA-20260908

## Solicitud original

El tenant paneton, con operación tipo panadería, factura muchos productos directamente: agrega productos en una orden nueva de mesa y usa Pagar → Facturar sin Confirmar. Tras una facturación directa previa en la misma mesa y navegador, una nueva orden en /restaurant/cart/1/0 muestra «La Orden ya está Cerrada» en vez de crear y facturar la orden nueva. Se solicita corregir el flujo directo.

## Descripción funcional

- Alcance: flujo de Restaurante para crear y facturar una orden nueva desde Pagar → Facturar, sin pasar antes por Confirmar.
- Usuario o rol afectado: cajeros de paneton y cualquier operación que facture ventas rápidas directamente desde una mesa.
- Comportamiento actual: tras una facturación directa previa en la misma mesa y navegador, la siguiente orden nueva puede mostrar «La Orden ya está Cerrada» al facturar.
- Comportamiento esperado: una ruta con orden `0` representa una orden nueva; al facturarla directamente debe crearse y cerrarse una orden distinta, sin exigir el paso de Confirmar.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/common/services/restaurant.service.ts` genera y guarda un `pending_order_token` por mesa en `createResOrder()`. `confirmInvoice()` usa `saveOrder(true, ...)`, que llama a `create_update_order` con el token cuando la orden aún tiene id `0`. El endpoint `BackEnd/ModRestaurant/views/functions.py` reconoce el mismo token como un reenvío y rechaza la solicitud si la orden asociada ya está en estado terminal.
- Causa raíz o hipótesis: en una facturación directa, la respuesta cierra la orden y `handleInvoiceSuccess()` vuelve la pantalla a una orden nueva, pero no limpia el token. La limpieza actual solo ocurre en `processOrder()`, camino que sí se ejecuta al confirmar una orden abierta. Por ello, la nueva orden de la misma mesa reutiliza el token de la orden ya cerrada y recibe la respuesta «La Orden ya está Cerrada».
- Riesgos y compatibilidad: el arreglo debe conservar la idempotencia durante reintentos reales de una misma creación; no debe permitir órdenes duplicadas ni reabrir órdenes cerradas. Debe cubrir tanto éxito como rechazo terminal de la facturación directa y preservar el flujo Confirmar → Facturar.
- Impactos de sync, migración, Docker o despliegue: no se identifican cambios de contrato, OfflineSync, SincSaiCloud, WebSocket, migraciones, Docker ni infraestructura. Es una corrección local del ciclo de estado Angular.

## Plan

- Gate de plan y aprobación del PO: Gate no exigible: BUGFIX de riesgo normal y alcance local de frontend, sin impactos críticos. El PO solicitó la creación del ticket y ordenó continuar; no se requiere una aprobación de plan adicional para esta corrección acotada.
- Pasos ordenados:
  1. Ajustar `RestaurantService` para descartar el token temporal al terminar una facturación directa y al restablecer una orden nueva tras la respuesta de orden terminal, sin borrarlo durante un timeout o reintento pendiente.
  2. Añadir pruebas unitarias dirigidas para el ciclo Pagar → Facturar → orden nueva y para Confirmar → Facturar, verificando que cada nueva orden recibe un token diferente y que un reintento pendiente conserva el suyo.
  3. Ejecutar la suite dirigida y la compilación Angular; entregar al PO la prueba manual en paneton antes de cualquier commit o publicación.
- Rollback, backup, canario u orden de despliegue cuando aplique: no hay migración ni datos que respaldar. El rollback consiste en revertir exclusivamente el cambio de frontend si la prueba dirigida muestra regresión. La validación inicial se hará en un entorno no productivo con una mesa de prueba antes de solicitar publicación a `dev`.

## Criterios de aceptación

- [ ] POINT-001: después de facturar directamente una orden nueva de una mesa, una segunda orden nueva de esa misma mesa puede facturarse directamente sin mostrar «La Orden ya está Cerrada».
- [ ] POINT-001: Confirmar → Facturar sigue funcionando y no deja el token de una orden anterior asociado a la siguiente orden nueva.
- [ ] POINT-001: un reintento de red de la misma creación conserva la idempotencia: no crea una segunda orden ni reabre una orden cerrada.
- [ ] POINT-001: el mensaje «La Orden ya está Cerrada» continúa apareciendo únicamente cuando el usuario realmente intenta modificar o facturar una orden cerrada.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "La orden nueva no factura al usar el flujo directo",
    "status": "verified",
    "severity": "high",
    "actual": "Después de una facturación directa previa en la misma mesa y navegador, una nueva orden en la ruta con orden 0 reutiliza el identificador temporal de la orden anterior, ya cerrada, y muestra «La Orden ya está Cerrada».",
    "expected": "Cada nueva orden creada desde Pagar → Facturar debe generar o usar un identificador temporal vigente, crear la orden y facturarla sin requerir Confirmar previamente.",
    "evidence": [
      "EVIDENCE-001",
      "EVIDENCE-002",
      "EVIDENCE-003",
      "EVIDENCE-004"
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

- Archivos cambiados: `FrontEnd/src/app/common/services/restaurant.service.ts` y `FrontEnd/src/app/common/services/restaurant.service.spec.ts`.
- Decisiones técnicas: `handleInvoiceSuccess()` elimina el token temporal al finalizar Pagar → Facturar, porque ese flujo no pasa por `processOrder()`. La respuesta `code:404` de orden terminal también elimina el token antes de reiniciar una orden nueva, para recuperar sesiones que ya tenían un token obsoleto.
- Compatibilidad preservada: los reintentos de red antes de recibir un resultado terminal siguen usando el mismo token y mantienen la idempotencia. Confirmar → Facturar continúa limpiándolo en `processOrder()` como hasta ahora. No cambió el contrato REST ni el backend.
- Commits atribuibles al ticket:
  - `a9c4821152504d775d810fa8977320c8101327cd` — elimina el token temporal al finalizar o rechazar la facturación directa y agrega la regresión Angular.

## Pruebas

- Comandos para el PO:
  - `npx ng test FrontSaiOpenCloud --include=src/app/common/services/restaurant.service.spec.ts --watch=false --browsers=ChromeHeadless`
  - `npm run build`
- Directorio de ejecución: `FrontEnd/`.
- Resultado esperado: la prueba dirigida termina con 33 casos correctos y la compilación Angular termina con código 0.
- Resultado técnico: ambos comandos se ejecutaron correctamente el 2026-09-08. La compilación informó tres reglas CSS omitidas por selectores existentes, sin errores ni relación identificada con este ticket.
- Suite Angular completa: se detuvo con dos fallos ajenos en `PosBranchCategoryComponent` por stubs sin `indexdb.saveData/deleteData`, antes de completar 22 de 632 casos. El PO autorizó explícitamente el commit y push selectivos del ticket pese a esos fallos no relacionados.
- Validaciones manuales: en un tenant no productivo, con una mesa de prueba, facturar una orden nueva sin Confirmar; volver a crear otra orden en la misma mesa y facturarla directamente. Repetir Confirmar → Facturar. En ambos casos debe generarse la factura correspondiente sin el mensaje de orden cerrada. Como comprobación adicional, iniciar una orden nueva con un token obsoleto simulado y verificar que tras el primer aviso se puede crear y facturar una orden nueva.
- Requisitos de ambiente o datos: tenant no productivo con un cajero, caja abierta, mesa disponible, producto activo y un medio de pago válido. No se probará con datos productivos sin instrucción explícita del PO.
- Resultado comunicado por el PO: El PO confirma que, hasta ahora, el bug no se repite en paneton y ordena cerrar el ticket.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-08",
    "build_reference": "commit:a9c4821152504d775d810fa8977320c8101327cd",
    "environment": "Tenant paneton; validación funcional comunicada por el PO",
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
    "po_confirmation": "El PO confirma que hasta ahora no se repite el bug en paneton."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-08",
    "kind": "manual",
    "description": "Diagnóstico estático del flujo: createResOrder conserva un token por mesa; la facturación directa cierra la orden mediante create_update_order y vuelve a id 0 sin limpiar ese token. El siguiente envío con id 0 encuentra la misma orden en estado Cerrada y devuelve el mensaje reportado.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-08",
    "kind": "automated",
    "description": "Prueba Angular dirigida ejecutada en ChromeHeadless: 33 casos correctos. Cubre que la facturación directa y la respuesta terminal code:404 eliminan el token temporal antes de crear una nueva orden en la misma mesa.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-08",
    "kind": "automated",
    "description": "Compilación Angular ejecutada con npm run build: finalizó con código 0. Se reportaron tres reglas CSS omitidas por selectores existentes, sin errores de compilación ni relación identificada con el cambio.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-09-08",
    "kind": "manual",
    "description": "La suite Angular completa se detuvo con dos fallos ajenos en PosBranchCategoryComponent por stubs sin indexdb.saveData/deleteData, antes de completar 22 de 632 casos. El PO autorizó explícitamente el commit y push selectivos del ticket pese a esa falla no relacionada.",
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
    "po_confirmation": "El PO confirma que hasta ahora no se repite el bug en paneton."
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
    "technical_summary": "El frontend elimina el token temporal de una facturación directa concluida o rechazada por orden terminal, preservando la idempotencia de reintentos pendientes.",
    "functional_summary": "Las ventas rápidas de paneton pueden facturarse directamente desde Pagar sin que una orden nueva reutilice una orden cerrada.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO confirma que hasta ahora no se repite el bug en paneton y ordena cerrar el ticket.",
    "release_impact": "El ticket queda cerrado funcionalmente y continúa unreleased; no implica una nueva release."
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
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-08",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-08",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-08",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-08",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-08",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-08",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-08",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-08",
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
