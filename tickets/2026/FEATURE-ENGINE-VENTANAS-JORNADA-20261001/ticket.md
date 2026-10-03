---
schema_version: 2
id: FEATURE-ENGINE-VENTANAS-JORNADA-20261001
title: Cerrar ventanas sin interrumpir el trabajo activo
type: FEATURE
module: ENGINE
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

# FEATURE-ENGINE-VENTANAS-JORNADA-20261001

## Solicitud original

Parte del sprint: Persistir jornadas y mostrar su hoja de ruta sin habilitar despacho.
- R-JOR-004: El fin de una ventana DEBE impedir nuevos despachos de esa ventana sin interrumpir automáticamente el trabajo activo.
Depende de: FEATURE-ENGINE-JORNADA-PERSISTIDA-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [jornadas/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/jornadas/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: contrato puro de ventana de jornada con inicio, fin y zona horaria explícitos, incluso cuando cruza medianoche. Determina si se permite iniciar trabajo nuevo en un instante dado; no programa ni detiene procesos.
- Usuario o rol afectado: la futura selección de elegibles, adaptadores y hoja de ruta que necesitan explicar por qué no se inicia trabajo nuevo.
- Comportamiento actual: `JourneyTicketInput` conserva un `windowId` como condición declarada, pero el motor no tiene una definición temporal ni una proyección que distinga una ventana próxima, abierta o cerrada.
- Comportamiento esperado: una ventana validada reporta de forma determinista si admite un nuevo despacho; al vencer pasa a cerrada, conserva su zona horaria como metadato y no cambia la actividad de un intento que ya existe.

## Diagnóstico

- Archivos y flujo investigados: `packages/engine/src/journeys.ts` persiste condiciones de jornada e identifica una ventana por `windowId`, sin interpretar su tiempo. `packages/engine/src/execution-activity.ts` y `execution-status.ts` separan actividad y workflow de las decisiones de programación. No existe una utilidad de zona horaria ni una ventana persistida en el motor. La búsqueda de memoria no devolvió resultados para este dominio.
- Causa raíz confirmada: hoy, ante un ticket con `windowId`, cualquier consumidor solo recibe una cadena y no puede decidir si un inicio nuevo cae antes, dentro o después de la ventana; tendría que asumir que está abierta o implementar su propio horario. Un identificador sin límites temporales tampoco permite informar el motivo de espera. Usar el estado de actividad como sustituto confundiría la elegibilidad de un inicio nuevo con una orden de detener el intento activo.
- Riesgos y compatibilidad: las fechas deben ser instantes ISO canónicos y el IANA time zone debe ser reconocido por el runtime. Una ventana que cruza medianoche se modelará con dos instantes absolutos ordenados, sin aritmética local ambigua. La evaluación será pura: no escribe eventos, no mata workers y no amplía autorización o capacidad.
- Supuestos y decisiones pendientes: este ticket añade el contrato temporal y una proyección de permiso de inicio; la futura selección decide qué ticket consumirlo, y la capacidad determina si puede ejecutarse cuando se abra otra ventana. La persistencia de la jornada seguirá siendo compatible con fotos anteriores que no declaran definiciones de ventana.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Alcance y exclusiones: definir y consultar ventanas por jornada en `@valmen/engine`; se excluyen cron, dispatcher, reserva de capacidad, selección de tickets, permisos y terminación de procesos.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan) cuando pase la compuerta, conforme a su autorización de continuar los tickets ordenados y aprobar planes aprobados.
- Pasos ordenados:
  <!-- Cada paso nombra archivo, símbolo o comando. Un paso que no dice dónde ni
       con qué se toca no se puede ejecutar ni revisar, y la compuerta lo lee así. -->
  1. Extender `packages/engine/src/journeys.ts` con definiciones inmutables de ventana por revisión (`windowId`, inicio, fin y zona IANA), manteniéndolas opcionales al rehidratar fotos anteriores y validando que los límites estén ordenados.
  2. Crear `packages/engine/src/journey-windows.ts` con una proyección pura de estado (`upcoming`, `open`, `closed`) y permiso para iniciar trabajo nuevo, sin escribir actividad ni hacer despacho. Reexportarla desde `packages/engine/src/index.ts`.
  3. Añadir `tests/journey-windows.test.ts` para ventana abierta, cerrada, cruce de medianoche con zona explícita, zona/límites inválidos y un intento activo que permanece sin alterarse. Ejecutar `npx vitest run tests/journey-windows.test.ts tests/journeys.test.ts tests/execution-activity.test.ts` y `npm run build` desde la raíz.
- Compatibilidad: las fotos JSONL previas no incluyen `windows` y se leerán con una lista vacía; no se reescribe historial ni se asigna una ventana a tickets existentes.
- Rollback: dejar de consumir la proyección y conservar intactas las revisiones append-only; no se borra ni se modifica la actividad de ejecuciones.

## Criterios de aceptación

- [x] R-JOR-004: Una ventana con inicio, fin y zona horaria explícitos permite nuevos inicios solo durante su intervalo, incluido un intervalo que cruza medianoche.
      <!-- test: npx vitest run tests/journey-windows.test.ts -->
- [x] R-JOR-004: Al cerrar la ventana, la proyección impide un nuevo despacho y conserva explícitamente que no ordena detener el trabajo activo.
      <!-- test: npx vitest run tests/journey-windows.test.ts tests/execution-activity.test.ts -->
- [x] R-JOR-004: Las revisiones previas de jornada sin definiciones de ventana siguen leyéndose sin migración ni ventana inventada.
      <!-- test: npx vitest run tests/journey-windows.test.ts tests/journeys.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se ampliaron las revisiones de jornada con `windows` opcionales, cada una con límites ISO absolutos y zona IANA; las revisiones históricas sin ese campo se rehidratan con una lista vacía.
- Se añadió `packages/engine/src/journey-windows.ts`: su proyección indica `upcoming`, `open` o `closed`, permite nuevos despachos solo cuando está abierta y declara siempre `interruptsActiveWork: false`.
- No se añadió cron, dispatcher, reserva de capacidad ni orden de detener procesos.

## Pruebas

- Directorio: raíz del repositorio (`/Users/juanandrade/Desktop/ValmenHarness`).
- `npx vitest run tests/journey-windows.test.ts tests/journeys.test.ts tests/execution-activity.test.ts` — pasó: 3 archivos y 13 pruebas.
- `npm run build` — pasó.
- `npx vitest run` — pasó: 111 archivos y 1847 pruebas; 1 archivo y 48 equivalencias omitidos por configuración.
- Validación manual: no aplica; no hay interfaz, servidor ni servicio externo modificado.
- Resultado del PO: autorizó continuar, ejecutar pruebas y cerrar si pasan: «si los tests que corras pasan se puede pasar a cerrar y hacer commit y push».

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-03",
    "build_reference": "worktree:sha256:2c3177ede4bec00f47f8f3cd3a4cf8a03854496d4299554e7128c4041bf126b2",
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
    "technical_summary": "Se añadieron ventanas IANA compatibles y una proyección pura de apertura/cierre sin efectos sobre actividad.",
    "functional_summary": "Al cerrar una ventana se bloquean nuevos inicios sin interrumpir el trabajo activo.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": "El PO autorizó: si los tests que corras pasan se puede pasar a cerrar y hacer commit y push.",
    "release_impact": "Sin publicación; release continúa unreleased."
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
    "at": "2026-10-01T19:10:44.968Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-03",
    "at": "2026-10-03T21:35:01.234Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-03",
    "at": "2026-10-03T21:38:26.753Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-03",
    "at": "2026-10-03T21:39:25.871Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-03",
    "at": "2026-10-03T21:39:26.064Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-03",
    "at": "2026-10-03T21:42:30.713Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-03",
    "at": "2026-10-03T21:42:30.876Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-03",
    "at": "2026-10-03T21:42:31.079Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-03",
    "at": "2026-10-03T21:42:31.242Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-03",
    "at": "2026-10-03T21:42:31.401Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-03",
    "at": "2026-10-03T21:42:45.974Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-03",
    "at": "2026-10-03T21:42:46.696Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-03",
    "at": "2026-10-03T21:42:46.855Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
