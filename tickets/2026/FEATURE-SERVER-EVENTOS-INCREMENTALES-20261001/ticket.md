---
schema_version: 2
id: FEATURE-SERVER-EVENTOS-INCREMENTALES-20261001
title: Propagar cambios con cursores y lecturas acotadas
type: FEATURE
module: SERVER
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
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

# FEATURE-SERVER-EVENTOS-INCREMENTALES-20261001

## Solicitud original

Parte del sprint: Actualizar la vista en vivo con reconexión, frescura y lecturas acotadas.
- R-VIV-002: Un cambio persistido disponible DEBE aparecer en Mission Control en menos de cinco segundos bajo operación local normal.
- R-VIV-003: La reconexión DEBE reconciliar los eventos pendientes sin perderlos ni duplicarlos.
- R-VIV-005: La actualización DEBE usar lecturas acotadas sin releer todas las conversaciones en cada cambio.
Depende de: FEATURE-ENGINE-EVENTOS-PERSISTIDOS-20261001, FEATURE-ADAPTER-CAPACIDADES-20261001, FEATURE-ENGINE-RESOLUCION-PROYECTO-20261001.
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

- Alcance: transporte local de eventos de ejecución por proyecto autorizado: lectura paginada desde cursor y señal SSE con frontera verificable. No incorpora el estado de reconexión ni cambia la interfaz; esos consumidores pertenecen a los tickets posteriores de Mission Control.
- Usuario o rol afectado: Mission Control y otros clientes locales que consultan la actividad persistida de un proyecto ya declarado en los bindings de la máquina.
- Comportamiento actual: `/api/events` emite avisos efímeros `changed` de cualquier archivo vigilado. No tiene identificador persistente, no acepta cursor ni permite que un cliente distinga los eventos pendientes de los ya aplicados. Las proyecciones de ejecución reconstruyen el replay entero del JSONL cuando necesitan actividad.
- Comportamiento esperado: una API acotada entrega eventos persistidos posteriores a un cursor, con límite validado y frontera actual; el SSE del proyecto identificado emite cursores persistidos y pide reconciliación cuando una reconexión requiere una foto. La ruta genérica existente se conserva para no romper las vistas actuales.

## Diagnóstico

- Archivos y flujo investigados: `packages/engine/src/execution-events.ts` conserva cursores consecutivos y deduplicación, pero expone solo `readExecutionEvents` y `replayExecutionEvents`, que leen todo el JSONL. `packages/server/src/server.ts` vigila `tickets/` y `.valmen/` y publica `changed` sin `id`, cursor, proyecto ni replay. `packages/adapter/src/{hermes,opencode,codex}.ts` ya limita sus lecturas por cursor y no lee mensajes al observar actividad; el servidor no propagaba aún esa frontera a los clientes.
- Causa raíz confirmada: el aviso de filesystem comunica que algo cambió, no cuál hecho persistido falta. Así, cuando el panel se reconecta después de un bloqueo y desbloqueo, no puede pedir «desde el último cursor aplicado»: o vuelve a pedir una proyección completa —que puede exceder la lectura acotada— o continúa desde una frontera desconocida, donde no puede verificar si perdió o repitió hechos. Ese hueco también impide al cliente convertir un evento disponible en una actualización de su fila dentro del límite medible de cinco segundos.
- Riesgos y compatibilidad: el cursor pertenece al proyecto autorizado y no puede aceptar raíces ni perfiles desde HTTP. Un cursor adelantado o inválido no se interpreta como historial vacío: devuelve una frontera que obliga a la foto actual del consumidor. Cada página se limita, no incluye conversaciones ni inicia lectores/polling de fuentes deshabilitadas. Se conserva el SSE genérico y sus rutas para las pantallas actuales; la futura interfaz será quien aplique los eventos y conserve su revisión local.
- Impactos de sync, migración, Docker o despliegue: no hay. Se lee el JSONL append-only ya existente y se añaden endpoints locales de solo lectura; no se cambian credenciales, bindings, fuentes remotas ni máquinas de estado.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Autorización vigente: «si pasa se aprueba el plan directamente» (2026-10-03).
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. Extender `packages/engine/src/execution-events.ts` y `packages/engine/src/execution-contract.ts` con una lectura paginada posterior a cursor, validando cursores y límite, que devuelva eventos ordenados, frontera actual, `hasMore` y la señal explícita de cursor inválido sin reescribir el JSONL.
  2. Añadir en `packages/server/src/server.ts` el endpoint de solo lectura `GET /api/execution-events` para un `X-Valmen-Project` ya resuelto, y una variante de `/api/events` identificada por `project` que acepte `Last-Event-ID`/`after`, emita `id` persistente para cada evento nuevo y anuncie la frontera de reconciliación al conectar o detectar un cursor inválido. Mantener el flujo `changed` existente para compatibilidad.
  3. Ajustar la vigilancia SSE para que, al cambiar el log de ejecuciones del proyecto suscrito, publique solamente la página posterior al cursor que conserva ese suscriptor; un lote de archivos no relacionados seguirá emitiendo el aviso genérico sin releer conversaciones ni abrir adaptadores.
  4. Modificar `packages/server/web/index.html` en `conectarEventos` y `seleccionarProyecto` para cerrar la suscripción anterior al cambiar de proyecto, abrir `/api/events?project=<id>` solo para un proyecto disponible y, ante `execution` o `reconcile`, refrescar de forma segura la vista actual conservando su contexto. El aviso genérico se mantiene cuando no hay proyecto seleccionado. Con esto la fila de `#/jornadas` vuelve a pedir la hoja de ruta tras recibir el evento, sin recarga manual ni duplicar conexiones.
  5. Crear `tests/incremental-events-api.test.ts` y ampliar `tests/execution-events.test.ts` para probar aislamiento entre proyectos, paginación y límite, cursor adelantado, reanudación SSE sin duplicar, y entrega local en menos de cinco segundos. La prueba de latencia persistirá actividad, esperará el evento en la suscripción y comprobará que `/api/journeys` ya proyecta esa actividad de la fila; las pruebas comprobarán que el contrato transporta metadatos de eventos, nunca mensajes de conversaciones.
  6. Ejecutar `npx vitest run tests/execution-events.test.ts tests/incremental-events-api.test.ts tests/journeys-api.test.ts` y `npm run build` desde la raíz; validar manualmente `#/jornadas` con una actividad recién persistida y la suscripción activa.
- Rollback: dejar de usar la API incremental y conservar `/api/events` genérico; el historial `.valmen/executions/events.jsonl` no se modifica ni se elimina, por lo que un cliente puede volver a reconstruirlo con el contrato anterior.

## Criterios de aceptación

- [x] R-VIV-002: Un cambio persistido disponible DEBE aparecer en Mission Control en menos de cinco segundos bajo operación local normal.
      <!-- test: npx vitest run tests/incremental-events-api.test.ts -->
- [x] R-VIV-003: La reconexión DEBE reconciliar los eventos pendientes sin perderlos ni duplicarlos.
      <!-- test: npx vitest run tests/execution-events.test.ts tests/incremental-events-api.test.ts -->
- [x] R-VIV-005: La actualización DEBE usar lecturas acotadas sin releer todas las conversaciones en cada cambio.
      <!-- test: npx vitest run tests/incremental-events-api.test.ts -->

## Puntos

```json
[]
```

## Implementación

Se añadió `readExecutionEventPage` al motor y se expuso desde `ExecutionContract`: valida `after` y `limit`, devuelve una página ordenada de hasta 100 eventos, la frontera actual y una señal explícita cuando el cursor solicitado está por delante del historial.

Mission Control ahora ofrece `GET /api/execution-events` para el proyecto ya autorizado y un SSE opcionalmente acotado por `project`. El SSE emite `id` con el cursor persistido, reanuda desde `Last-Event-ID` o `after`, y publica `reconcile` cuando necesita una foto actual. El canal `changed` anterior se conserva. Los vigías cubren todos los proyectos disponibles declarados en los bindings y la creación inicial de `executions/`.

La interfaz cierra su EventSource anterior al cambiar de proyecto, abre el flujo acotado del proyecto activo y refresca la vista actual conservando contexto ante `execution` o `reconcile`. No abre conversaciones ni lectores de adaptadores.

## Pruebas

- `npx vitest run tests/execution-events.test.ts tests/incremental-events-api.test.ts tests/journeys-api.test.ts` — 10 pruebas aprobadas: paginación, cursor adelantado, aislamiento de proyectos, reanudación SSE sin repetir y proyección de actividad de jornada en menos de cinco segundos.
- `npx vitest run` — 115 archivos aprobados, 1 omitido (`equivalence-ticketpy`, requiere referencia externa); 1858 pruebas aprobadas y 48 omitidas.
- `npm run build` — aprobado.
- Validación visual temporal en `http://127.0.0.1:4176/#/jornadas`: selector de proyecto disponible, conexión en vivo y estado vacío «No hay jornadas registradas para este proyecto.» para ValmenHarness. La instancia temporal se detuvo; el servicio del PO en `4175` no se modificó.
- Revisión final: no se detectaron hallazgos bloqueantes ni cambios ajenos. El contrato mantiene el canal SSE genérico y no expone rutas, credenciales ni mensajes de sesiones.
- Resultado del PO: autorización vigente para ejecutar, aprobar las pruebas deterministas y cerrar/confirmar/enviar si pasan: «si los test que corras pasan se puede pasar a cerrar y hacer commit y push» (2026-10-03).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-04",
    "build_reference": "worktree:sha256:ce3b8106356e5b870c01103911ae2f643d21448ffd3d5dba278cb7e2986ff014",
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
    "technical_summary": "Se añadió lectura paginada de eventos por cursor, SSE por proyecto con reanudación y reconciliación, y renovación segura de la suscripción de Mission Control.",
    "functional_summary": "La vista de jornadas recibe actividad persistida en vivo, puede recuperar una frontera tras reconexión y conserva el contexto seleccionado.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin despliegue ni migración; los endpoints locales nuevos se activan al consultar eventos de un proyecto declarado."
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
    "notes": "Sesión compartida con otros tickets; el gasto no se reparte porque no hay agregado fiable por ticket.",
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
    "at": "2026-10-01T19:10:45.129Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-03",
    "at": "2026-10-03T23:45:55.777Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-03",
    "at": "2026-10-03T23:47:14.637Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-03",
    "at": "2026-10-03T23:49:39.256Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-03",
    "at": "2026-10-03T23:49:39.421Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-03",
    "at": "2026-10-04T00:03:42.366Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-03",
    "at": "2026-10-04T00:03:42.561Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-03",
    "at": "2026-10-04T00:03:42.828Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-03",
    "at": "2026-10-04T00:03:43.005Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-03",
    "at": "2026-10-04T00:03:43.169Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-03",
    "at": "2026-10-04T00:03:43.334Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-03",
    "at": "2026-10-04T00:03:50.938Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-03",
    "at": "2026-10-04T00:03:51.108Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
