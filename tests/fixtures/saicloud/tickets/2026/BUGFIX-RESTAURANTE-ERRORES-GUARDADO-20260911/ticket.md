---
schema_version: 1
id: BUGFIX-RESTAURANTE-ERRORES-GUARDADO-20260911
title: Explicar y orientar errores al guardar órdenes
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
created: 2026-09-11
updated: 2026-09-17
related_ticket: IMPROVEMENT-RESTAURANTE-RESPUESTAS-ORDEN-20260908
target_release: 6.2.5
released_in: 6.2.5
---

# BUGFIX-RESTAURANTE-ERRORES-GUARDADO-20260911

## Solicitud original

Corregir la experiencia de error al guardar una orden de restaurante: el cliente debe recibir una explicación inicial clara y una acción de corrección cuando la causa sea conocida. Solo cuando no pueda determinarse una causa segura debe recibir una referencia para escalar a soporte. Este ticket es independiente y toma como antecedente el mecanismo de referencia entregado en IMPROVEMENT-RESTAURANTE-RESPUESTAS-ORDEN-20260908.

## Descripción funcional

- Alcance: guardado y facturación de órdenes desde el carrito de Restaurante y desde dividir/facturar, exclusivamente en las respuestas de error de `res/create_update_order`.
- Usuario o rol afectado: meseros, cajeros y demás usuarios del tenant que guardan o facturan una orden.
- Comportamiento actual: ante un fallo no controlado, la interfaz muestra “No fue posible guardar la orden. Intenta de nuevo.” y una referencia `ORD-XXXXXXXXXXXX`. La referencia no es un catálogo ni describe la acción que el cliente debe realizar; solo puede correlacionarse con un log interno. La captura aportada muestra el caso `ORD-673F8A8650ED` en dev.
- Comportamiento esperado: antes de guardar, y al responder una validación conocida, el cliente recibe un mensaje claro que explica qué debe revisar o corregir. Si el sistema no puede clasificar la causa sin exponer información interna, comunica pasos iniciales seguros y presenta una “Referencia para soporte” solo como mecanismo de escalamiento.

## Diagnóstico

- Archivos y flujo investigados: `FrontEnd/src/app/common/services/restaurant.service.ts` valida productos, tercero, caja, medios de pago, documentos de aprobación y totales antes de enviar; tanto este flujo como `FrontEnd/src/app/modals/restaurant/divider-order-modal/divider-order-modal.component.ts` consumen `res/create_update_order`. En `BackEnd/ModRestaurant/views/functions.py`, el endpoint valida JSON, orden, sucursal, consecutivo y líneas obsoletas, pero el wrapper externo captura cualquier excepción restante y responde únicamente con la referencia segura.
- Causa raíz o hipótesis: el contrato actual diferencia errores conocidos solo cuando cada rama los valida explícitamente. Datos incompletos o inconsistentes en el cierre, pagos, factura o dependencias que eleven una excepción fuera de esas ramas terminan en el fallback interno, por lo que el usuario no recibe una orientación accionable. La referencia sí permite diagnóstico en logs, pero no es interpretable por el cliente.
- Riesgos y compatibilidad: el endpoint es transaccional y puede crear o actualizar orden, pagos, consecutivos, factura y comandas. La corrección no debe cambiar reglas de cobro, estados de éxito, reintentos por `client_token`, aislamiento por tenant, rollback ni exponer excepciones, trazas, rutas, IDs internos o datos de otros tenants. Los contratos existentes `response` y `code` se preservan.
- Impactos de sync, migración, Docker o despliegue: no se modifica OfflineSync, SincSaiCloud, WebSocket, modelos, migraciones, Docker, autenticación ni despliegue. Se verifica que una validación rechazada no cree datos ni eventos parciales.

## Plan

- Alcance y exclusiones: añadir mensajes de corrección para errores previsibles del guardado y una contingencia orientada para errores inesperados. No se crea un catálogo público de excepciones, no se revela el log técnico ni se rediseñan reglas de pagos, facturación, sincronización o notificaciones ajenas.
- Gate de plan y aprobación del PO: requerido antes de implementar por el riesgo alto y por modificar el comportamiento de error del guardado transaccional de órdenes. Aprobado explícitamente por el PO el 2026-09-11 mediante “aprebo”, en respuesta a la presentación de este plan y del ID del ticket.
- Paso 1 — contrato de validación del backend (`BackEnd/ModRestaurant/views/functions.py`; `POINT-001`): inventariar las entradas de cierre y pago usadas por el endpoint y transformar las ausencias o inconsistencias previsibles en respuestas HTTP 400/409 con `response` accionable y compatible. Mantener el wrapper actual únicamente para errores no esperados, con rollback completo, detalle técnico solo en log y una referencia marcada como soporte.
- Paso 2 — orientación previa y presentación unificada (`FrontEnd/src/app/common/services/restaurant.service.ts`, `FrontEnd/src/app/modals/restaurant/divider-order-modal/divider-order-modal.component.ts`; `POINT-001`): completar las validaciones que puedan conocerse antes del envío y normalizar los dos consumidores para presentar el mensaje de corrección recibido. Para el fallback no clasificable, mostrar un texto visible que indique revisar los datos de la orden, intentar de nuevo una vez y escalar con la referencia si persiste; conservar el aviso persistente, copiable y de cierre explícito.
- Paso 3 — pruebas de regresión (`BackEnd/ModRestaurant/tests/test_create_update_order_errors.py`, `FrontEnd/src/app/common/services/restaurant.service.spec.ts` y la prueba del modal si el flujo lo requiere; `POINT-001`): cubrir cada nueva validación, el fallback seguro, la misma presentación en carrito y división/facturación, estado HTTP, rollback y ausencia de publicación o persistencia parcial.
- Rollback, backup, canario u orden de despliegue cuando aplique: no hay esquema ni infraestructura que respalde o migre. Si aparece una regresión, revertir únicamente el commit funcional del ticket después de confirmar que no se mezcló con cambios ajenos. Antes de publicar para pruebas, ejecutar pruebas dirigidas; la prueba manual será en un tenant no productivo y no requiere canario de base de datos.

## Criterios de aceptación

- [ ] `POINT-001`: cuando falta o es inconsistente un dato conocido de pago, cierre, tercero, caja, consecutivo o líneas, el usuario recibe un mensaje de negocio que indica qué revisar, sin referencia `ORD` como única explicación.
- [ ] `POINT-001`: el carrito y dividir/facturar presentan el mismo mensaje para la misma respuesta del endpoint y conservan sus flujos de recuperación actuales.
- [ ] `POINT-001`: un fallo no clasificable conserva HTTP de error, rollback, un texto seguro de contingencia y una “Referencia para soporte”; nunca expone excepción, traza, rutas, datos internos ni de otro tenant.
- [ ] `POINT-001`: una respuesta de error no crea una orden, pago, factura, consecutivo, comanda ni evento parcial; los éxitos y el reintento idempotente actual no cambian.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "La referencia técnica no orienta al cliente",
    "status": "closed",
    "severity": "high",
    "actual": "Ante un fallo inesperado al guardar, el cliente ve un mensaje genérico y una referencia ORD aleatoria, sin saber qué revisar ni cuándo escalar.",
    "expected": "Los errores conocidos muestran explicación y acción segura; los no clasificables indican pasos iniciales y conservan una referencia solo para escalamiento.",
    "evidence": [
      "EVIDENCE-001"
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

- Archivos cambiados: `BackEnd/ModRestaurant/views/functions.py`, `BackEnd/ModRestaurant/tests/test_create_update_order_errors.py`, `FrontEnd/src/app/common/services/restaurant.service.ts` y `FrontEnd/src/app/common/services/restaurant.service.spec.ts`.
- Decisiones técnicas: los rechazos de negocio que ya conoce el cliente conservan su mensaje específico. El fallback no clasificable conserva HTTP 500, rollback y el registro técnico correlacionable, pero ahora orienta a revisar los datos de la orden y reintentar antes de escalar. El frontend transforma también la respuesta genérica de servidores con la versión anterior, por lo que el despliegue frontend/backend no exige una ventana coordinada. La referencia se denomina “Referencia para soporte”, no “Código de referencia”.
- Compatibilidad preservada: se conservan `response`, `error_reference`, el formato `ORD-XXXXXXXXXXXX`, la notificación persistente y los flujos existentes de validación, éxito, reintento idempotente y recuperación. No se exponen datos técnicos.
- Commits atribuibles al ticket:
  - `9597e83f1f60ab6a3abbe5b9a693df2ef52beaea` — orienta el fallback de guardado de órdenes y etiqueta la referencia para soporte.

## Pruebas

- Comandos para el PO: desde `BackEnd/`, `./.venv/bin/python manage.py test ModRestaurant.tests.test_create_update_order_errors ModRestaurant.tests.test_stale_order_lines ModRestaurant.tests.test_duplicate_order_prevention --keepdb --verbosity 1`; desde `FrontEnd/`, `npx ng test FrontSaiOpenCloud --watch=false --browsers=ChromeHeadless --include='**/restaurant.service.spec.ts'`; y `npm run build -- --configuration development`.
- Directorio de ejecución: `BackEnd/` para Django y `FrontEnd/` para Angular.
- Resultado esperado: las pruebas y el build terminan sin fallos; las pruebas dirigidas confirman cada mensaje de corrección, el fallback seguro, rollback y que los flujos exitosos no se alteran.
- Validaciones manuales: en un tenant de pruebas, confirmar que las validaciones conocidas del cliente (por ejemplo, datos de facturación incompletos) conservan su explicación y no cambian el guardado. No se pide al PO provocar un fallo inesperado: no existe una acción operativa segura y determinista que lo reproduzca. Ese fallback se valida mediante la prueba automatizada que inyecta una excepción antes del commit; si ocurre naturalmente en dev, conservar la referencia y consultar el log interno. Confirmar que no se duplica la orden ni la comanda al reintentar.
- Requisitos de ambiente o datos: tenant de pruebas, usuario con acceso a una sucursal, mesa, caja, consecutivo, tercero y medios de pago de prueba. No usar datos productivos ni registrar secretos.
- Resultado técnico local: TDD verificado: las pruebas Django y Angular fallaron inicialmente porque esperaban el mensaje anterior; tras la implementación, `ModRestaurant.tests.test_create_update_order_errors` finalizó con 3 pruebas exitosas, `restaurant.service.spec.ts` con 34 exitosas y `npm run build -- --configuration development` finalizó correctamente (hash `2b10fb4bffa5a7b5`). Los avisos de `REDIS_URL no configurado` y las trazas de excepciones son esperados en esta suite, que los provoca para comprobar rollback y aislamiento post-commit.
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
    "date": "2026-09-11",
    "kind": "automated",
    "description": "TDD: la prueba Django del fallback falló con el mensaje anterior y pasó tras el ajuste. La suite ModRestaurant.tests.test_create_update_order_errors ejecutó 3 pruebas exitosas, verificando respuesta segura, rollback y aislamiento post-commit; RestaurantService ejecutó 34 pruebas exitosas y el build Angular de desarrollo finalizó correctamente.",
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

- Estado de release: unreleased.
- Versión objetivo: pendiente.
- Versión publicada: null.
- Tickets relacionados: IMPROVEMENT-RESTAURANTE-RESPUESTAS-ORDEN-20260908.

## Eventos

<!-- Bloque JSON append-only final de objetos con `kind: "ticket-event"`; el CLI agrega uno por cada mutación propia. -->

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-09-11",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-09-11",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-11",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-11",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-11",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-11",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-11",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
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
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-16",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-16",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-16",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-16",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
