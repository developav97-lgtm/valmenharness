---
schema_version: 1
id: IMPROVEMENT-RESTAURANTE-RESPUESTAS-ORDEN-20260908
title: Hacer claros y copiables los errores al guardar una orden
type: IMPROVEMENT
module: RESTAURANTE
workflow_status: closed
qa_status: approved
release_status: released
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: high
created: 2026-09-08
updated: 2026-09-17
related_ticket: null
target_release: 6.2.5
released_in: 6.2.5
---

# IMPROVEMENT-RESTAURANTE-RESPUESTAS-ORDEN-20260908

## Solicitud original

Necesito endurecer los mensajes de respuesta de la función res/create_update_order al guardar una orden en restaurante. Cuando ocurre un error, con frecuencia solo aparece 'Error al guardar, intente de nuevo', por lo que el cliente no puede distinguir una validación de un fallo no identificado ni comunicar el detalle. En un caso reciente el primer guardado mostró ese mensaje genérico; al repetirlo funcionó, sin que fuera posible identificar la causa. También las notificaciones desaparecen demasiado rápido y hacer clic sobre ellas las cierra, impidiendo copiar o conservar el mensaje.

## Descripción funcional

- Alcance: respuestas de error del POST `res/create_update_order` en los flujos operativos de guardar la orden y de guardar desde la división/facturación; incluye la notificación mostrada exclusivamente para esos fallos.
- Usuario o rol afectado: meseros, cajeros y demás usuarios del tenant que crean, actualizan o facturan órdenes de restaurante.
- Comportamiento actual: el guardado principal consume `response` o `detail`, pero hay respuestas no normalizadas y el modal de división sustituye todo fallo por el texto genérico. La notificación global de ngx-toastr usa su configuración por defecto, que se cierra al pulsarla y no asegura el tiempo ni la posibilidad de copiar el detalle.
- Comportamiento esperado: validaciones y conflictos conservan un mensaje de negocio claro; un fallo inesperado entrega un mensaje seguro, un identificador de referencia y deja el detalle técnico únicamente en logs. El aviso de este flujo permite leer y copiar el mensaje, y se cierra solo mediante una acción explícita.

## Diagnóstico

- Archivos y flujo investigados: `BackEnd/ModRestaurant/views/functions.py:create_update_order` valida varios casos conocidos, pero una captura de su primera fase responde `str(e)` sin código HTTP ni identificador. El resto de la vista puede elevar excepciones no estructuradas. `FrontEnd/src/app/common/services/restaurant.service.ts:processSaveOrder` muestra `response`/`detail` solo cuando la petición llega a su manejador de error; `FrontEnd/src/app/modals/restaurant/divider-order-modal/divider-order-modal.component.ts:generateInvoice` descarta el detalle y muestra el texto genérico. `FrontEnd/src/app/common/services/general.service.ts` delega los avisos en ngx-toastr y `FrontEnd/src/app/app.module.ts` no configura una política global de persistencia.
- Causa raíz o hipótesis: el contrato de errores de la vista mezcla respuestas HTTP, cuerpos con `code` tratados como éxito y una excepción convertida a texto técnico. Los dos consumidores Angular no comparten un normalizador de errores y el toast estándar se usa sin una variante apta para diagnóstico.
- Riesgos y compatibilidad: `create_update_order` es atómico, modifica órdenes, líneas, comandas y, al facturar, registra objetos que entran a sincronización. No se deben exponer excepciones, datos de modelos, rutas ni trazas al cliente; tampoco se debe alterar la semántica de éxito, los `response`/`code` ya consumidos, la idempotencia por `client_token` ni el rollback transaccional. El riesgo es alto por tratarse del guardado operativo de una orden.
- Impactos de sync, migración, Docker o despliegue: no se modifican contratos de OfflineSync/SincSaiCloud, modelos, migraciones, Docker ni despliegue. La ampliación aprobada sí ajusta el orden de tres notificaciones WebSocket existentes de esta vista: pasan a ejecutarse solo tras el commit. Los callbacks posteriores al commit deben registrar sus propios fallos y no cambiar la respuesta de una orden ya confirmada. Se preservan tenant, payload y destinatario existentes.

## Plan

- Alcance y exclusiones: endurecer el contrato de error y su presentación para `create_update_order`; no rediseñar todas las notificaciones de la aplicación, ni cambiar reglas de negocio, datos de la orden, sincronización o impresión. Se incluye, como corrección necesaria de consistencia transaccional, diferir al commit las notificaciones WebSocket ya emitidas por esta misma vista y blindar sus callbacks post-commit.
- Gate de plan: aprobado explícitamente por el PO el 2026-09-08 mediante “listo dale implementalo” para el alcance inicial. Ampliación que toca el orden de notificaciones WebSocket y los callbacks post-commit: aprobada explícitamente por el PO el 2026-09-08 mediante “si dale apruebo la ampliacion”. El cambio de comportamiento en un flujo transaccional de restaurante mantiene el riesgo alto.
- Paso 1 — Backend (`BackEnd/ModRestaurant/views/functions.py`; `POINT-001`, `POINT-002`): inventariar las salidas conocidas del endpoint y preservar sus campos compatibles. Definir un sobre de error seguro y estable para validación, conflicto y fallo inesperado, con estado HTTP coherente, `response` legible y un identificador de referencia solo para fallos internos. Registrar la excepción con ese identificador y el contexto mínimo seguro del tenant/operación; nunca devolver `str(e)`, traza ni datos sensibles. Asegurar que el manejo de excepción fuerza el rollback de la operación atómica antes de responder.
- Paso 2 — Frontend compartido y flujos de orden (`FrontEnd/src/app/common/services/general.service.ts`, `FrontEnd/src/app/common/services/restaurant.service.ts`, `FrontEnd/src/app/modals/restaurant/divider-order-modal/divider-order-modal.component.ts`; `POINT-001`, `POINT-002`, `POINT-003`): introducir un normalizador reutilizable de cuerpos de error del endpoint y una variante de notificación de diagnóstico para este flujo. Usarla tanto en el guardado principal como en división/facturación, sin cambiar el comportamiento de éxito ni los manejos existentes de 404/409. La variante debe permitir seleccionar/copiar el texto y no cerrar por pulsación; tendrá cierre visible y explícito, y mostrará la referencia segura cuando exista.
- Paso 3 — Configuración/estilos mínimos (`FrontEnd/src/app/app.module.ts` y/o estilos del componente que resulte necesario; `POINT-003`): aplicar las opciones de ngx-toastr de forma local a esta notificación, evitando cambiar los tiempos o la interacción de avisos ajenos. Verificar foco, teclado, contraste, contenido seleccionable y comportamiento en móvil/tablet.
- Paso 4 — Pruebas (`BackEnd/ModRestaurant/tests/test_create_update_order_errors.py` o extensión de la suite dirigida existente; `FrontEnd/src/app/common/services/restaurant.service.spec.ts` y prueba de la utilidad si se extrae; `POINT-001` a `POINT-003`): cubrir validación conocida, conflicto existente, excepción inesperada segura/correlacionable y rollback; comprobar que ambos clientes muestran el mismo detalle y que el aviso no se cierra con clic ni pierde la capacidad de copiarse.
- Paso 5 — Efectos posteriores al commit (`BackEnd/ModRestaurant/views/functions.py` y su prueba dirigida; `POINT-004`): encapsular publicaciones WebSocket y SNS ya existentes en callbacks seguros de `transaction.on_commit`. Un rollback no debe publicar; una excepción del callback se registra con contexto seguro y no reemplaza la respuesta de éxito de una operación confirmada. Se mantienen sin alteración tenant, modelos de payload, idempotencia, natural keys y consumidores.
- Paso 6 — Conflictos heredados del carrito (`FrontEnd/src/app/common/services/restaurant.service.ts` y su prueba; `POINT-005`): enrutar también los cuerpos HTTP 200 con `code` 404/409 por la notificación persistente, conservando sus acciones actuales de limpiar token/recargar la orden.
- Rollback, backup, canario u orden de despliegue cuando aplique: no hay migración ni cambio de infraestructura, por lo que no requiere backup ni canario de esquema. El rollback será revertir únicamente el commit del ticket si aparecen regresiones; antes de publicar para pruebas se verificará que los errores no dejan órdenes, líneas, pagos, impuestos, eventos de sync ni comandas parciales.

## Criterios de aceptación

- [ ] `POINT-001`: una validación o conflicto conocido de `create_update_order` llega al usuario con un mensaje de negocio entendible y conserva los campos que los consumidores actuales ya interpretan.
- [ ] `POINT-001`: un fallo inesperado responde como error HTTP, no como éxito, y nunca incluye el texto crudo de la excepción, traza, rutas o datos internos.
- [ ] `POINT-002`: cada fallo inesperado registra un identificador correlacionable en el log y muestra al usuario una referencia segura para soporte; si la transacción falla, no quedan cambios parciales ni publicaciones de sincronización.
- [ ] `POINT-003`: guardar desde el carrito y desde dividir/facturar presenta el mismo detalle normalizado; el aviso permanece disponible, permite seleccionar/copiar su contenido, no se cierra con pulsación y ofrece un cierre explícito accesible.
- [ ] `POINT-004`: si la transacción de la orden o factura falla después de preparar una notificación, no se publica WebSocket; cuando ya hay commit, un fallo de SNS/WebSocket se registra sin transformar la respuesta exitosa en 500 ni inducir un reintento duplicado.
- [ ] `POINT-005`: las respuestas heredadas del carrito con `code` 404 y 409 usan el mismo aviso persistente y copiable antes de ejecutar su recuperación específica.
- [ ] Los flujos de guardado exitoso, reintento idempotente por `client_token`, orden bloqueada y líneas obsoletas conservan su comportamiento actual.

## Puntos

<!-- Crear POINT-NNN es append-only: no eliminar, reordenar ni reutilizar. Las transiciones solo las realiza el CLI, actualizan el punto actual y anexan un ticket-event. -->

```json
[
  {
    "id": "POINT-001",
    "title": "Mensaje genérico oculta la causa al guardar",
    "status": "verified",
    "severity": "high",
    "actual": "create_update_order responde ante diversos fallos con un aviso genérico de guardado; el cliente no puede saber si el rechazo corresponde a una validación o a un error no identificado.",
    "expected": "Cada fallo muestra una explicación accionable y segura: validación de negocio cuando aplique, o un identificador/detalle técnico correlacionable para diagnóstico cuando no se identifique la causa.",
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
  },
  {
    "id": "POINT-002",
    "title": "Fallo transitorio no deja trazabilidad para diagnóstico",
    "status": "verified",
    "severity": "normal",
    "actual": "Se observó un error genérico en un primer intento de guardar y el segundo intento guardó correctamente, sin información suficiente para determinar la causa del fallo inicial.",
    "expected": "Los fallos transitorios preservan información segura y correlacionable para diagnóstico, sin exponer datos sensibles, y el comportamiento de reintento queda claramente comunicado.",
    "evidence": [
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
    "id": "POINT-003",
    "title": "Notificación de error no se puede leer ni copiar",
    "status": "verified",
    "severity": "normal",
    "actual": "La notificación desaparece rápido y hacer clic en ella la cierra, por lo que el usuario no puede terminar de leer ni copiar el mensaje para reportarlo.",
    "expected": "La notificación de error permanece el tiempo suficiente y permite seleccionar/copiar su contenido sin cerrarse accidentalmente.",
    "evidence": [
      "EVIDENCE-003",
      "EVIDENCE-006"
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
    "id": "POINT-004",
    "title": "Efectos externos pueden desalinearse con el commit de la orden",
    "status": "verified",
    "severity": "high",
    "actual": "La vista atómica publica WebSocket antes del commit y un callback post-commit de SNS puede propagar una excepción después de confirmar la orden, devolviendo 500 al cliente pese a que el guardado sí ocurrió.",
    "expected": "Las publicaciones se ejecutan únicamente después del commit y sus fallos se registran sin alterar la respuesta exitosa ni inducir reintentos duplicados.",
    "evidence": [
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
  },
  {
    "id": "POINT-005",
    "title": "Conflictos 404 y 409 del carrito siguen con alerta transitoria",
    "status": "verified",
    "severity": "normal",
    "actual": "El carrito trata los cuerpos heredados con code 404 o 409 como éxito HTTP y usa notificationError estándar, a diferencia de los errores HTTP y del modal de división.",
    "expected": "Los conflictos heredados muestran la misma alerta persistente, copiable y de cierre explícito antes de conservar sus recuperaciones actuales.",
    "evidence": [
      "EVIDENCE-005"
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

- Archivos cambiados: `BackEnd/ModRestaurant/views/functions.py`, `BackEnd/ModRestaurant/tests/test_create_update_order_errors.py`, `FrontEnd/src/app/common/services/general.service.ts`, `FrontEnd/src/app/common/services/restaurant.service.ts`, `FrontEnd/src/app/common/services/restaurant.service.spec.ts`, `FrontEnd/src/app/modals/restaurant/divider-order-modal/divider-order-modal.component.ts` y `FrontEnd/src/assets/css/StyleCloud.css`.
- Decisiones técnicas: un wrapper externo al `@transaction.atomic` captura fallos inesperados de `create_update_order` después del rollback de Django. Responde HTTP 500 con un mensaje seguro y una referencia aleatoria `ORD-XXXXXXXXXXXX`; el detalle y la traza se dejan exclusivamente en el log. Angular centraliza la presentación de errores de este endpoint, incluida la referencia, y solicita un toast persistente, seleccionable y de cierre explícito. La ruta de división/facturación deja de ocultar el cuerpo de error y evita procesar como éxito un `code >= 400` recibido en el cuerpo. Las tres publicaciones WebSocket y la publicación SNS de la vista se difieren mediante callbacks seguros de `transaction.on_commit`: un rollback no comunica cambios inexistentes y un fallo de entrega se registra sin modificar una respuesta exitosa ya confirmada.
- Compatibilidad preservada: las respuestas conocidas y sus campos `response`/`code` se mantienen; los flujos especiales de orden terminal y líneas obsoletas conservan su recarga. Las ramas heredadas 404/409 conservan la limpieza de token y la recarga, usando ahora el aviso de diagnóstico. No hay cambios en modelos, migraciones, Docker, OfflineSync, SincSaiCloud, formato de payload WebSocket, tenant, destinatarios ni `client_token`.
- Commits atribuibles al ticket: `e3dd8325f76633d07fcc0a834ce847eb897f621e` — implementación funcional de mensajes seguros, notificaciones persistentes y efectos WebSocket/SNS posteriores al commit; publicado selectivamente en `dev` para pruebas en nube.

## Pruebas

- Comandos para el PO: desde `BackEnd/`, `./.venv/bin/python manage.py test ModRestaurant.tests.test_create_update_order_errors ModRestaurant.tests.test_stale_order_lines ModRestaurant.tests.test_duplicate_order_prevention --keepdb --verbosity 1`; desde `FrontEnd/`, `npx ng test FrontSaiOpenCloud --watch=false --browsers=ChromeHeadless --include='**/restaurant.service.spec.ts'`; y `npm run build -- --configuration development`.
- Directorio de ejecución: `BackEnd/` para Django; `FrontEnd/` para Angular.
- Resultado esperado: todas las pruebas dirigidas y el build finalizan sin fallos; las pruebas de backend confirman el cuerpo seguro, estado HTTP, referencia en log y ausencia de escritura parcial ante excepción; las de frontend confirman el mensaje normalizado y persistente.
- Cobertura de la ampliación: las pruebas fuerzan un error de líneas después de preparar WebSocket y confirman que no se publica; también ejecutan explícitamente un callback post-commit que falla, conservando respuesta HTTP 200 y la orden confirmada. Las ramas heredadas 404/409 verifican las opciones persistentes y mantienen sus recuperaciones.
- Validaciones manuales: con un tenant de pruebas y una mesa abierta, provocar una validación conocida y un fallo controlado sin información sensible; comprobar mensaje, referencia, copia mediante ratón/teclado, cierre explícito, reintento y posterior guardado correcto. Repetir desde el modal de división/facturación y confirmar que no se duplica la orden ni la comanda.
- Requisitos de ambiente o datos: tenant de pruebas, usuario restaurante con acceso a una sucursal, mesa, consecutivo y caja de prueba cuando se valide facturación. No usar datos productivos ni registrar secretos en evidencia.
- Resultado técnico local: backend: 18 pruebas exitosas en 654.986 s; adicionalmente, la prueba que ejecuta un callback WebSocket post-commit fallido pasó en 34.673 s. Angular: 34 pruebas exitosas. `npm run build -- --configuration development`: exitosa (hash `d73aa23e54f8c408`). El entorno de Django emitió avisos esperados de `REDIS_URL no configurado`; la prueba post-commit usa un mock para verificar el aislamiento de la excepción.
- Resultado comunicado por el PO: en nube/dev, al facturar una orden ya cerrada, el mensaje de error permaneció visible hasta que el usuario lo cerró mediante la X. El PO autorizó considerar validados los cinco puntos y cerrar QA.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-09-09",
    "build_reference": "commit:e3dd8325f76633d07fcc0a834ce847eb897f621e",
    "environment": "Nube/dev; tenant no especificado",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-09-09",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó como validados POINT-001, POINT-002, POINT-003, POINT-004 y POINT-005 y autorizó cerrar QA."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-09-08",
    "kind": "automated",
    "description": "Las 16 pruebas Django dirigidas finalizaron correctamente; incluyen respuesta segura HTTP 500 y referencia sin exponer la excepción, líneas obsoletas e idempotencia por client_token.",
    "reference": null,
    "point_id": "POINT-001"
  },
  {
    "id": "EVIDENCE-002",
    "date": "2026-09-08",
    "kind": "automated",
    "description": "La prueba de excepción interna confirma rollback inicial sin crear ResOrder y una referencia ORD correlacionable en logs.",
    "reference": null,
    "point_id": "POINT-002"
  },
  {
    "id": "EVIDENCE-003",
    "date": "2026-09-08",
    "kind": "automated",
    "description": "Las 34 pruebas de RestaurantService y el build Angular de desarrollo finalizaron correctamente; cubren mensaje normalizado, referencia y configuración persistente del aviso.",
    "reference": null,
    "point_id": "POINT-003"
  },
  {
    "id": "EVIDENCE-004",
    "date": "2026-09-09",
    "kind": "automated",
    "description": "La suite Django dirigida (18 pruebas) verificó rollback sin publicacion WebSocket y que un fallo de WebSocket post-commit se registra sin cambiar la respuesta 200 ni la persistencia de la orden; la prueba del callback se ejecuto explicitamente.",
    "reference": null,
    "point_id": "POINT-004"
  },
  {
    "id": "EVIDENCE-005",
    "date": "2026-09-09",
    "kind": "automated",
    "description": "Las 34 pruebas Angular dirigidas verificaron que las ramas heredadas 404 y 409 del carrito usan el aviso persistente sin perder sus recuperaciones de token y recarga.",
    "reference": null,
    "point_id": "POINT-005"
  },
  {
    "id": "EVIDENCE-006",
    "date": "2026-09-09",
    "kind": "manual",
    "description": "El PO probó en nube/dev facturar una orden ya cerrada: el mensaje de error se mantuvo visible y solo se cerró al usar la X.",
    "reference": "commit:e3dd8325f76633d07fcc0a834ce847eb897f621e",
    "point_id": "POINT-003"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-09-09",
    "point_id": "POINT-003",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO confirmó que, al facturar una orden ya cerrada, el mensaje permaneció visible hasta cerrarlo con la X."
  },
  {
    "id": "RETEST-002",
    "date": "2026-09-09",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO autorizó considerar validado POINT-001 y confirmó el cierre de los puntos pendientes."
  },
  {
    "id": "RETEST-003",
    "date": "2026-09-09",
    "point_id": "POINT-002",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO autorizó considerar validado POINT-002 y confirmó el cierre de los puntos pendientes."
  },
  {
    "id": "RETEST-004",
    "date": "2026-09-09",
    "point_id": "POINT-004",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO autorizó considerar validado POINT-004 y confirmó el cierre de los puntos pendientes."
  },
  {
    "id": "RETEST-005",
    "date": "2026-09-09",
    "point_id": "POINT-005",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "El PO autorizó considerar validado POINT-005 y confirmó el cierre de los puntos pendientes."
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
    "date": "2026-09-09",
    "technical_summary": "Contrato seguro de errores en create_update_order, referencia ORD para fallos internos, notificaciones persistentes y efectos WebSocket/SNS posteriores al commit con callbacks aislados.",
    "functional_summary": "El PO validó los cinco puntos; en nube/dev confirmó que el aviso al facturar una orden cerrada permanece visible y se cierra explícitamente con la X.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO autorizó el cierre del ticket tras validar los cinco puntos y aprobar QA.",
    "release_impact": "Cerrado funcionalmente y publicado en dev; permanece unreleased para producción y requiere el proceso de release correspondiente."
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
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-09-08",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-09-08",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-09-08",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-09-08",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-002: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-09-08",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-003: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-09-08",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-09-08",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-023",
    "date": "2026-09-08",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-024",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-025",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-026",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-004: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-027",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-028",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-029",
    "date": "2026-09-09",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-005: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-030",
    "date": "2026-09-09",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-031",
    "date": "2026-09-09",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-032",
    "date": "2026-09-09",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-006."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-033",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-034",
    "date": "2026-09-09",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-035",
    "date": "2026-09-09",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-003."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-036",
    "date": "2026-09-09",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-002 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-037",
    "date": "2026-09-09",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-003 para POINT-002."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-038",
    "date": "2026-09-09",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-004 para POINT-004."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-039",
    "date": "2026-09-09",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-005 para POINT-005."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-040",
    "date": "2026-09-09",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-041",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-042",
    "date": "2026-09-09",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-043",
    "date": "2026-09-09",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-044",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: unreleased -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-045",
    "date": "2026-09-17",
    "action": "release-transition",
    "actor": "cli",
    "details": "Release: planned -> released."
  }
]
```
