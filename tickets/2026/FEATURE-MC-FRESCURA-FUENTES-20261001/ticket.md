---
schema_version: 2
id: FEATURE-MC-FRESCURA-FUENTES-20261001
title: Declarar frescura y fallos de cada fuente por separado
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

# FEATURE-MC-FRESCURA-FUENTES-20261001

## Solicitud original

Parte del sprint: Actualizar la vista en vivo con reconexión, frescura y lecturas acotadas.
- R-VIV-004: La pantalla DEBE declarar la frescura y los fallos de cada fuente por separado.
Depende de: FEATURE-SERVER-EVENTOS-INCREMENTALES-20261001, FEATURE-ENGINE-ESTADO-ACTIVIDAD-20261001, FEATURE-MC-DISPONIBILIDAD-FUENTES-20261001.
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

- Alcance: exponer en Jornadas, por proyecto seleccionado, la conexión del panel y la frescura de cada fuente de observación declarada. Para Hermes se consulta únicamente su lectura incremental acotada; para cualquier fuente sin lector integrado se declara ese límite. El último dato persistido se conserva cuando la lectura falla.
- Usuario o rol afectado: responsable que observa una jornada en Mission Control y necesita distinguir un panel conectado de una fuente de actividad temporalmente inaccesible.
- Comportamiento actual: la barra lateral muestra «en vivo» o «sin conexión» para el EventSource del panel, mientras `vistaJornadas` solo enumera los nombres de `authorization.observationSources`. No comunica cuándo se comprobó una fuente, si Hermes está inaccesible ni cuál fue su último evento válido.
- Comportamiento esperado: el panel declara su conexión por separado y Jornadas lista cada fuente configurada con estado legible, última lectura/dato válido y razón cuando no puede observarse. Una falla de Hermes no borra la hoja de ruta ni se presenta como falla del SSE.

## Diagnóstico

- Archivos y flujo investigados: `packages/server/web/index.html` cambia el texto global `#actualizado` según el SSE y `vistaJornadas` recibe solamente `authorization.observationSources` desde `packages/engine/src/journey-roadmap.ts`. `packages/engine/src/execution-events.ts` persiste por evento `source` y `receivedAt`, pero no lo proyecta por fuente. `packages/adapter/src/hermes.ts` ofrece `readHermesChanges` con lectura paginada y estados `available`, `unavailable` e `incompatible`, sin abrir mensajes; `packages/server/src/execution-panel.ts` solo lo usa para mensajes visibles, no para frescura.
- Causa raíz confirmada: las tres señales viven aisladas —SSE en el navegador, último hecho en el JSONL y disponibilidad del lector Hermes— y ningún DTO las presenta juntas. Por eso una fuente sin cambio, una fuente inaccesible y un panel desconectado terminan sin una explicación diferenciada en la jornada.
- Riesgos y compatibilidad: no se infiere actividad a partir de un reloj ni se convierte «sin eventos» en un fallo. La consulta Hermes se acota a su página mínima, no toca mensajes, rutas no autorizadas ni credenciales. Una fuente declarada sin lector integrado queda explícitamente limitada, y un error conserva el último `receivedAt` del registro del proyecto. La ruta de jornadas y su autorización actual se mantienen; el DTO nuevo es aditivo y está limitado al proyecto ya resuelto por `X-Valmen-Project`.
- Impactos de sync, migración, Docker o despliegue: impacto visible en Mission Control: el responsable puede diferenciar panel, fuente y liveness sin recargar. No hay migración, Docker, bindings ni despliegue; son lecturas locales acotadas sobre el proyecto autorizado y no se escriben eventos, sesiones ni configuración.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Autorización vigente: «si pasa se aprueba el plan directamente» (2026-10-03); el recibo `GR-20261004-plan` aprobó el plan.
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. Crear una proyección de frescura por fuente en `packages/server/src/` que reciba el proyecto autorizado, use las fuentes de `readJourneyAuthorization`, calcule el último evento persistido por `source` desde el contrato de ejecución y consulte Hermes con su límite incremental mínimo. Debe devolver estado, última lectura/dato y motivo sin incluir mensajes, rutas ni credenciales.
  2. Exponer la proyección mediante un `GET` nuevo del servidor, sin aceptar proyecto por query y conservando el encabezado `X-Valmen-Project` como única selección. Registrar la ruta en `tests/api-rutas.test.ts`.
  3. En `packages/server/web/index.html`, distinguir el estado del EventSource como «Panel: …» y hacer que `vistaJornadas` muestre los estados de fuente junto a la autorización existente. Si una fuente falla, conservar la hoja de ruta y declarar la última fecha válida y el motivo; no iniciar polling ni leer conversaciones.
  4. Crear `tests/frescura-fuentes.test.ts` para fuente Hermes disponible, inaccesible con último dato preservado y fuente sin lector integrado; extender el verificador ejecutable de interfaz para confirmar que panel y fuente aparecen como señales separadas.
  5. Ejecutar `npx vitest run tests/frescura-fuentes.test.ts tests/api-rutas.test.ts tests/interfaz-ejecutable.test.ts`, `npx vitest run` y `npm run build`; validar en navegador Jornadas con una fuente declarada, verificando los textos de conexión, frescura y fallo sin perder la selección.
- Rollback:

## Criterios de aceptación

- [x] R-VIV-004: La pantalla DEBE declarar la frescura y los fallos de cada fuente por separado.
      <!-- test: npx vitest run tests/frescura-fuentes.test.ts tests/api-rutas.test.ts tests/interfaz-ejecutable.test.ts -->

## Puntos

```json
[]
```

## Implementación

Se añadió `source-freshness.ts`: proyecta por fuente el último dato persistido, la comprobación actual acotada de Hermes y un motivo explícito ante incompatibilidad, inaccesibilidad o ausencia de lector integrado. El endpoint nuevo conserva el proyecto autorizado por encabezado.

Jornadas muestra «Panel: …» separado de cada fuente, conserva la hoja de ruta cuando una fuente falla y no lee mensajes ni inicia polling.

## Pruebas

- `npx vitest run tests/frescura-fuentes.test.ts tests/api-rutas.test.ts tests/interfaz-ejecutable.test.ts` — 22 pruebas aprobadas.
- `npx vitest run` — 117 archivos aprobados, 1 omitido; 1.862 pruebas aprobadas y 48 omitidas.
- `npm run build` — aprobado; la interfaz compilada se sincronizó.
- Resultado del PO: autorización vigente para ejecutar, aprobar las pruebas deterministas y cerrar/confirmar/enviar si pasan: «si los test que corras pasan se puede pasar a cerrar y hacer commit y push» (2026-10-03).

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-04",
    "build_reference": "worktree:sha256:6cfae89979509780900b076331c40a99d3edb44c0cdf7773c3bcd08491be9c9d",
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
    "technical_summary": "Se proyectaron estados de frescura por fuente con lectura Hermes acotada, último dato persistido y motivos explícitos de indisponibilidad.",
    "functional_summary": "Jornadas distingue la conexión del panel de cada fuente y conserva la hoja de ruta cuando una fuente queda inaccesible.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin migración ni despliegue; se entrega con el artefacto web compilado y el endpoint local aditivo."
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
    "at": "2026-10-01T19:10:45.231Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-03",
    "at": "2026-10-04T00:23:32.251Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-03",
    "at": "2026-10-04T00:24:13.259Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-03",
    "at": "2026-10-04T00:26:44.571Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-03",
    "at": "2026-10-04T00:26:44.751Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-03",
    "at": "2026-10-04T00:34:45.907Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-03",
    "at": "2026-10-04T00:34:46.070Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-03",
    "at": "2026-10-04T00:34:46.308Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-03",
    "at": "2026-10-04T00:34:46.465Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-03",
    "at": "2026-10-04T00:34:46.621Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-03",
    "at": "2026-10-04T00:34:55.407Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-03",
    "at": "2026-10-04T00:34:55.985Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-03",
    "at": "2026-10-04T00:34:56.139Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
