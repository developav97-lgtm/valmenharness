---
schema_version: 2
id: FEATURE-MC-HOJA-RUTA-20261001
title: Presentar hoja de ruta de las jornadas seleccionadas
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

# FEATURE-MC-HOJA-RUTA-20261001

## Solicitud original

Parte del sprint: Persistir jornadas y mostrar su hoja de ruta sin habilitar despacho.
- R-VIV-001: Mission Control DEBE presentar la hoja de ruta completa de las jornadas seleccionadas.
- R-VIV-002: Un cambio persistido disponible DEBE aparecer en Mission Control en menos de cinco segundos bajo operación local normal.
- R-CON-002: CLI y MCP DEBEN consumir el mismo contrato de ejecución del motor.
Depende de: FEATURE-ENGINE-JORNADA-PERSISTIDA-20261001, FEATURE-MC-SELECTOR-PROYECTOS-20261001, FEATURE-ENGINE-ESTADO-ACTIVIDAD-20261001, FEATURE-ENGINE-VENTANAS-JORNADA-20261001, FEATURE-ENGINE-AUTORIZACION-JORNADAS-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [actualizacion/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/actualizacion/spec.md).
- Spec completa: [contrato/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/contrato/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: una vista de solo lectura de la jornada vigente del proyecto seleccionado, con una fila por ticket y sus condiciones, ventana, tiempos declarados y autorización de observación/despacho.
- Usuario o rol afectado: responsable que supervisa una jornada desde Mission Control.
- Comportamiento actual: el selector ya cambia el contexto autorizado y el motor persiste jornadas, ventanas y autorización, pero Mission Control no los proyecta juntos ni permite reconstruir el orden sin abrir ticket por ticket.
- Comportamiento esperado: la vista muestra la hoja de ruta completa desde el contrato del motor; un cambio en `.valmen/journeys/` activa el SSE existente y se repinta localmente dentro de cinco segundos, sin iniciar ni autorizar despachos.

## Diagnóstico

- Archivos y flujo investigados: `packages/engine/src/journeys.ts` conserva la última revisión completa de cada jornada; `journey-windows.ts` calcula el estado temporal sin efectos laterales; `journey-authorization.ts` parte de `AuthorizedProject`. El selector de `packages/server/web/index.html` envía `X-Valmen-Project`; `server.ts` lo resuelve antes de servir la API y ya vigila `.valmen/`, agrupa eventos a 250 ms y la interfaz repinta a 300 ms por SSE.
- Causa raíz confirmada: las tres proyecciones del motor existen por separado, pero no hay una lectura del servidor ni una ruta de interfaz que las una en una fila por ticket. Por eso una persona debe inferir orden, esperas, ventanas y permisos leyendo archivos o el detalle de cada ticket.
- Riesgos y compatibilidad: la proyección debe requerir un proyecto seleccionado y autorizado, no aceptar raíces desde la query ni deducir permiso de una fuente instalada. Solo se lee el motor; una jornada ausente se declara como estado vacío y una ventana cerrada no interrumpe actividad.
- Efecto sobre consumidores: se añade una respuesta HTTP de solo lectura para Mission Control, construida con el contrato público de `@valmen/engine`; no se cambian las entradas de CLI/MCP ni se duplica lógica de jornadas fuera del motor.
- Supuestos y decisiones pendientes: R-VIV-002 se mide desde la escritura disponible en `.valmen/journeys/` hasta el repintado con la pestaña conectada. El transporte SSE y la reconciliación de caídas siguen en tickets posteriores; este ticket comprueba el recorrido local normal, no promete recuperación tras desconexión.
- Memoria consultada: AP-006 documenta cómo registrar dos bloqueos semánticos equivalentes sin repetir una tercera llamada; se aplicará solo si ocurre esa condición con recibos y autorización vigente.
- Aplicación de EST-004: `GR-20261003-analysis` recibió dos revisiones consecutivas por la misma proposición semántica tras corregir la clasificación visible; ambas respaldaron causa, archivos y riesgos. El PO aprobó continuar por la política vigente, decisión atribuida a humano y sin tercera llamada.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). La cascada aprobó el plan y el PO autorizó previamente aprobar los planes que pasen y continuar los tickets en orden.
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. Crear `packages/engine/src/journey-roadmap.ts` y exportarlo por `index.ts`: una proyección pura que combina `readJourneys`, `createExecutionContract`, `evaluateJourneyWindow` y `readJourneyAuthorization` desde un `AuthorizedProject`, con orden, inicio programado o condición, inicio real, actividad, duración, espera, dependencia, último dato recibido y permisos; no despacha ni escribe.
  2. Hacer que `packages/cli/src/execution.ts` exponga `valmen execution journeys --project <id>` y que `packages/mcp/src/tools.ts` añada `ver_jornadas`; ambos deben resolver el proyecto autorizado y llamar exactamente a `readJourneyRoadmap`, igual que `GET /api/journeys` en `packages/server/src/server.ts`.
  3. Añadir pruebas de contrato en `tests/journey-roadmap.test.ts` y de superficies en `tests/journeys-api.test.ts`, `tests/execution-cli.test.ts` y `tests/mcp-tools.test.ts`: misma identidad/revisión/fila por las tres puertas, proyecto no autorizado rechazado, vacío explícito, ventana sin interrupción y una medición determinista del aviso SSE más repintado menor de cinco segundos.
  4. Incorporar en `packages/server/web/index.html` la ruta «Jornadas», su enlace lateral y estados de selección, carga, vacío y error; consumir únicamente `GET /api/journeys` y el SSE vigente para refrescar conservando la selección. Validar en Mission Control local con una jornada de prueba y revisar colores agregados.
- Rollback: retirar la ruta y la vista; no hay datos migrados, políticas cambiadas ni procesos iniciados.

## Criterios de aceptación

- [x] R-VIV-001: Mission Control DEBE presentar la hoja de ruta completa de las jornadas seleccionadas.
      <!-- test: npx vitest run tests/journey-roadmap.test.ts tests/journeys-api.test.ts tests/execution-cli.test.ts tests/execution-mcp.test.ts tests/api-rutas.test.ts -->
- [x] R-VIV-002: Un cambio persistido disponible DEBE aparecer en Mission Control en menos de cinco segundos bajo operación local normal.
      <!-- test: npx vitest run tests/journey-roadmap.test.ts tests/journeys-api.test.ts tests/execution-cli.test.ts tests/execution-mcp.test.ts tests/api-rutas.test.ts -->
- [x] R-CON-002: CLI y MCP DEBEN consumir el mismo contrato de ejecución del motor.
      <!-- test: npx vitest run tests/journey-roadmap.test.ts tests/journeys-api.test.ts tests/execution-cli.test.ts tests/execution-mcp.test.ts tests/api-rutas.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se agregó `readJourneyRoadmap` al motor: compone las revisiones persistidas, actividad, ventanas y autorización a partir de un `AuthorizedProject`, sin escrituras ni despacho.
- CLI (`execution journeys`), MCP (`ver_jornadas`) y `GET /api/journeys` consumen esa misma proyección. El endpoint no acepta rutas, perfiles ni identidades aportadas por query.
- Mission Control incorpora la ruta «Jornadas» con selección obligatoria de proyecto y estados de carga, vacío y error; la hoja usa el SSE existente para actualizarse.
- El catálogo MCP y Hermes se actualizó para declarar la nueva operación de solo lectura y mantener sus anotaciones como contrato.

## Pruebas

- Directorio: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/journey-roadmap.test.ts tests/journeys-api.test.ts tests/execution-cli.test.ts tests/execution-mcp.test.ts tests/api-rutas.test.ts`: pasó; cubre la proyección, API, CLI, MCP y la ruta de interfaz.
- `npx vitest run tests/journeys-api.test.ts`: pasó; el SSE real publicó una jornada persistida en 329 ms, por debajo de cinco segundos.
- `npx vitest run && npm run build`: pasó antes del ajuste final de latencia, con 114 archivos y 1854 pruebas aprobadas (48 omitidas); se volverá a ejecutar completa en la revisión final.
- `npm run build`: pasó tras la prueba de latencia.
- Validación visual local: `http://127.0.0.1:4176/#/jornadas`, proyecto ValmenHarness seleccionado; la ruta, navegación lateral y estado vacío «No hay jornadas registradas para este proyecto» se mostraron correctamente. Para poblar filas se requiere una jornada real registrada, sin crear datos de prueba en el proyecto.
- Resultado PO: autorizó cerrar, hacer commit y push si pasan las pruebas ejecutadas.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-03",
    "build_reference": "worktree:sha256:f783256bc90696e2ecb8ef1e6257b890853336873a37b48d548a9b7479785941",
    "environment": "local-node-24",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-03",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO autorizó: si los tests que corras pasan se puede pasar a cerrar y hacer commit y push."
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
    "date": "2026-10-03",
    "technical_summary": "Proyección única de jornadas consumida por motor, CLI, MCP, API y Mission Control.",
    "functional_summary": "Mission Control muestra la hoja de ruta del proyecto seleccionado y actualiza sus cambios locales mediante SSE sin habilitar despacho.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO autorizó: si los tests que corras pasan se puede pasar a cerrar y hacer commit y push.",
    "release_impact": "Sin publicación; la release continúa unreleased."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-03",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión Codex compartida entre tickets de control-jornadas-ejecucion; no se atribuyen tokens ni coste inventados.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-compartida-20261003",
    "confidence": "high",
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
    "at": "2026-10-01T19:10:45.079Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-03",
    "at": "2026-10-03T22:49:11.185Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-03",
    "at": "2026-10-03T22:50:39.856Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO: Aplicación de EST-004 autorizada por el PO: tras dos revisiones equivalentes del mismo diagnóstico, con la corrección comprobable incorporada y evidencia en ambos recibos, continuar sin una tercera llamada."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-03",
    "at": "2026-10-03T22:50:52.628Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-03",
    "at": "2026-10-03T22:55:42.124Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-03",
    "at": "2026-10-03T22:55:42.288Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-03",
    "at": "2026-10-03T23:02:52.374Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-03",
    "at": "2026-10-03T23:02:52.541Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-03",
    "at": "2026-10-03T23:02:52.848Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-03",
    "at": "2026-10-03T23:02:53.017Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-03",
    "at": "2026-10-03T23:02:53.183Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-03",
    "at": "2026-10-03T23:02:53.375Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-03",
    "at": "2026-10-03T23:02:54.152Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-03",
    "at": "2026-10-03T23:02:54.318Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
