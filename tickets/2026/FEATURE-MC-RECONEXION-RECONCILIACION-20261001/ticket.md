---
schema_version: 2
id: FEATURE-MC-RECONEXION-RECONCILIACION-20261001
title: Reconciliar eventos pendientes tras reconexión
type: FEATURE
module: MC
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: true
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-01
updated: 2026-10-03
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-MC-RECONEXION-RECONCILIACION-20261001

## Solicitud original

Parte del sprint: Actualizar la vista en vivo con reconexión, frescura y lecturas acotadas.
- R-VIV-002: Un cambio persistido disponible DEBE aparecer en Mission Control en menos de cinco segundos bajo operación local normal.
- R-VIV-003: La reconexión DEBE reconciliar los eventos pendientes sin perderlos ni duplicarlos.
Depende de: FEATURE-SERVER-EVENTOS-INCREMENTALES-20261001, FEATURE-MC-HOJA-RUTA-20261001, FEATURE-MC-SELECTOR-PROYECTOS-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [actualizacion/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actualizacion/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: reconciliación en el navegador de los eventos de ejecución por proyecto seleccionado, con cursor durable en la sesión, lectura de páginas pendientes y protección de la vista de jornadas ante respuestas fuera de orden. No cambia el almacenamiento de eventos ni la autorización del servidor.
- Usuario o rol afectado: quien observa una jornada en Mission Control mientras la conexión SSE se corta, el navegador recupera foco o cambia entre proyectos disponibles.
- Comportamiento actual: el canal SSE por proyecto puede emitir `execution` y `reconcile`, pero `conectarEventos` solo agenda un refresco completo. No conserva el último cursor aplicado, no consulta las páginas pendientes de `/api/execution-events` y dos solicitudes de `/api/journeys` del mismo proyecto pueden terminar en orden inverso.
- Comportamiento esperado: Mission Control conserva una frontera por proyecto, ignora eventos ya aplicados, recupera las páginas que falten o una foto actual cuando el cursor ya no es válido, y solo pinta la respuesta más reciente de la hoja de ruta sin perder el contexto de lectura.

## Diagnóstico

- Archivos y flujo investigados: `packages/server/web/index.html` abre el EventSource del proyecto y llama `programarRefrescoPorEvento([])` para `execution` y `reconcile`; `vistaJornadas` consulta `/api/journeys` sin una revisión local. El ticket anterior añadió `GET /api/execution-events?after=&limit=`, cursores persistidos y `Last-Event-ID` en `packages/server/src/server.ts`; `tests/incremental-events-api.test.ts` confirma su replay, pero no hay una prueba de la decisión de la interfaz ante páginas repetidas o una respuesta tardía.
- Causa raíz confirmada: el transporte conoce la frontera de cada proyecto, pero la interfaz la trata como un simple aviso. Después de una reconexión no sabe qué eventos ya reflejó ni cuándo debe pedir páginas; y una petición anterior de la misma jornada puede terminar después de otra más nueva y volver a pintar datos anteriores. Por eso la convergencia al último estado persistido no es verificable desde el cliente.
- Riesgos y compatibilidad: el cursor no puede mezclarse entre proyectos ni disminuir por una respuesta tardía. La reconciliación no interpreta workflow ni mensajes, solo consume metadatos paginados y obtiene la foto de `/api/journeys` ya autorizada. Se conserva la señal genérica, el selector, las protecciones contra diálogo/foco y el scroll; cambiar de proyecto cancela la conexión anterior y descarta sus respuestas. AP-006 no aplica al comportamiento, pero conserva la política vigente para una eventual revisión semántica repetida.
- Impactos de sync, migración, Docker o despliegue: el impacto es visible en Mission Control: tras recuperar conexión, una fila puede actualizarse sin recargar y conserva la selección actual. No hay sync, migración, Docker ni despliegue; es estado efímero del navegador y lecturas locales de las APIs ya existentes, sin escribir bindings, eventos, credenciales ni fuentes externas.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Autorización vigente: «si pasa se aprueba el plan directamente» (2026-10-03).
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. Extender `packages/server/web/index.html` con un cursor monotónico por `projectId`, persistido en `sessionStorage`, y helpers que solo avancen esa frontera al observar un `id` SSE o una página válida de `GET /api/execution-events`.
  2. En `conectarEventos`, interpretar `execution` y `reconcile`: deduplicar IDs ya aplicados, pedir sucesivamente páginas de hasta el límite del servidor cuando existan pendientes y, si la respuesta marca `cursorValid: false`, solicitar la foto vigente y reanudar desde la frontera que entrega el servidor. El mismo evento agenda una sola actualización de `#/jornadas` con el debounce existente de 300 ms; tras la respuesta vigente de `/api/journeys` se pinta la fila, por lo que la prueba mide desde el evento persistido disponible hasta ese DOM sin recarga manual y exige menos de cinco segundos. No abrir mensajes ni iniciar polling de adaptadores.
  3. Proteger `vistaJornadas` en `packages/server/web/index.html` con una revisión de carga por proyecto: una respuesta que ya no sea la última solicitada, o pertenezca a otro selector, no modifica el DOM; la actualización válida usa el recorrido actual de conservación de vista.
  4. Crear `tests/reconexion-mc.test.ts` con un navegador simulado o el patrón ejecutable existente para demostrar: evento repetido no vuelve a refrescar, reconexión consume solo páginas posteriores, cursor inválido toma foto y frontera, y una respuesta tardía no regresa la fila al estado anterior. Mantener `tests/incremental-events-api.test.ts` como contrato del servidor.
  5. Crear en `tests/reconexion-mc.test.ts` un recorrido de latencia que persista actividad, entregue su SSE y espere la actualización de la fila de `#/jornadas`; debe fallar a los 4.5 segundos y afirmar una entrega menor a 5 segundos. Ejecutar `npx vitest run tests/reconexion-mc.test.ts tests/incremental-events-api.test.ts tests/journeys-api.test.ts`, `npx vitest run` y `npm run build`; validar en navegador una jornada de prueba tras cerrar y recuperar la conexión, comprobando que se conserva la selección y el estado más reciente.
- Rollback: retirar el consumidor de cursores y volver al aviso SSE genérico que ya refresca la vista; el log append-only, el endpoint paginado y los cursores del servidor quedan intactos y la sesión del navegador no contiene información sensible.

## Criterios de aceptación

- [x] R-VIV-002: Un cambio persistido disponible DEBE aparecer en Mission Control en menos de cinco segundos bajo operación local normal.
      <!-- test: npx vitest run tests/reconexion-mc.test.ts tests/incremental-events-api.test.ts -->
- [x] R-VIV-003: La reconexión DEBE reconciliar los eventos pendientes sin perderlos ni duplicarlos.
      <!-- test: npx vitest run tests/reconexion-mc.test.ts tests/incremental-events-api.test.ts -->

## Puntos

```json
[]
```

## Implementación

Mission Control conserva un cursor de ejecución por proyecto en `sessionStorage` (con respaldo en memoria), ignora reenvíos SSE ya aplicados y pagina `GET /api/execution-events` al recibir `reconcile`. Si el servidor declara una frontera inválida, toma una foto vigente de jornadas y se reancla en el cursor declarado, sin interpretar mensajes ni alterar el registro.

`vistaJornadas` identifica cada carga y descarta respuestas que lleguen después de otra carga, de un cambio de proyecto o de salir de la vista. El refresco válido reutiliza el debounce existente de 300 ms y preserva las protecciones de foco, diálogo y navegación.

## Pruebas

- `npx vitest run tests/reconexion-mc.test.ts tests/incremental-events-api.test.ts tests/api-rutas.test.ts` — 10 pruebas aprobadas: paginación, reenvío deduplicado, cursor inválido con foto vigente, respuesta tardía descartada y contrato de la ruta nueva.
- `npx vitest run` — 116 archivos aprobados y 1 omitido (`equivalence-ticketpy`, requiere la referencia externa); 1.860 pruebas aprobadas y 48 omitidas.
- `npm run build` y `node scripts/verificar-interfaz.mjs packages/server/web/index.html` — aprobados; el artefacto servido quedó sincronizado y las 11 vistas ejecutables se verificaron.
- `valmen estandar revisar packages/server/web/index.html` — sin colores fijos añadidos.
- Validación visual en `http://127.0.0.1:4175/#/jornadas`: ValmenHarness seleccionado, conexión «en vivo» y estado vacío «No hay jornadas registradas para este proyecto.». No había jornada real en ese entorno para forzar una reconexión; ese recorrido se ejecutó de forma reproducible en `tests/reconexion-mc.test.ts`.
- Revisión final: no se detectaron hallazgos bloqueantes ni cambios ajenos; se revisaron aislamiento por proyecto, deduplicación, frontera inválida, estados asíncronos y el contrato cliente-servidor.
- Resultado del PO: autorización vigente para ejecutar, aprobar las pruebas deterministas y cerrar/confirmar/enviar si pasan: «si los test que corras pasan se puede pasar a cerrar y hacer commit y push» (2026-10-03).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-04",
    "build_reference": "worktree:sha256:3f2aa9d58b6426f8548351a8fcb1544c1f188a863051410b549d594cbe23f76a",
    "environment": "local-node-24",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-04",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO autorizó: si los test que corras pasan se puede pasar a cerrar y hacer commit y push."
  }
]
```

## Evidencia

```json
[]
```

## Retests

```json
[]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-04",
    "technical_summary": "Mission Control persiste por proyecto el cursor de ejecución, reconcilia páginas pendientes, toma una foto vigente ante una frontera inválida y descarta respuestas tardías de Jornadas.",
    "functional_summary": "La hoja de ruta conserva la selección y converge al estado persistido tras una reconexión, sin duplicar eventos ni pintar información obsoleta.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin migración ni despliegue; el cambio se entrega con el artefacto web compilado y usa las APIs locales existentes."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-04",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión compartida con varios tickets de control-jornadas-ejecucion; no existe un agregado fiable por ticket y no se reparte el gasto.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-compartida-20261003",
    "confidence": "low",
    "id": "CONSUMO-001"
  }
]
```

## Release

Sin publicar todavía.

## Eventos

```json
[
  {
    "kind": "ticket-event",
    "id": "EVENT-001",
    "date": "2026-10-01",
    "at": "2026-10-01T19:10:45.175Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-03",
    "at": "2026-10-04T00:05:22.883Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-03",
    "at": "2026-10-04T00:07:14.696Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO: Tras dos revisiones equivalentes del análisis, el PO autorizó continuar cuando el artefacto incorpora la corrección comprobable. El ticket ya declara user_visible: true e impacto visible; el check mecánico impactos_declarados aprobó en ambos recibos."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-03",
    "at": "2026-10-04T00:07:14.890Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-03",
    "at": "2026-10-04T00:10:15.670Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-03",
    "at": "2026-10-04T00:10:15.851Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-03",
    "at": "2026-10-04T00:20:56.011Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-03",
    "at": "2026-10-04T00:20:56.179Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-03",
    "at": "2026-10-04T00:20:56.412Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-03",
    "at": "2026-10-04T00:20:56.575Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-03",
    "at": "2026-10-04T00:20:56.735Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-03",
    "at": "2026-10-04T00:21:04.168Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-03",
    "at": "2026-10-04T00:21:04.970Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-03",
    "at": "2026-10-04T00:21:05.138Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
