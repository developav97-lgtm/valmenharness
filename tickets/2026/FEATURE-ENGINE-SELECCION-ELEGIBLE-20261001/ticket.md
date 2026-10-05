---
schema_version: 2
id: FEATURE-ENGINE-SELECCION-ELEGIBLE-20261001
title: Elegir el siguiente ticket independiente y autorizado
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
updated: 2026-10-05
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-SELECCION-ELEGIBLE-20261001

## Solicitud original

Parte del sprint: Integrar selección y capacidad con autonomía existente y despacho Hermes opcional.
- R-JOR-002: La selección DEBE permitir avanzar con un ticket independiente y autorizado cuando otro espera intervención.
- R-JOR-003: El siguiente ticket elegible DEBE poder iniciar por disponibilidad sin esperar una hora fija posterior.
Depende de: FEATURE-ENGINE-JORNADA-PERSISTIDA-20261001, FEATURE-ENGINE-VENTANAS-JORNADA-20261001, FEATURE-ENGINE-RUN-AUTONOMO-20260926, FEATURE-ENGINE-AUTORIZACION-JORNADAS-20261001.
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

- Alcance: una proyección pura de selección en `@valmen/engine` para las jornadas de un proyecto ya autorizado. Ordena candidatos por prioridad y orden declarado, y expone tanto el siguiente ticket manual como los motivos verificables por los que un despacho no puede iniciarse. No escribe registros, no reserva capacidad y no invoca ejecutores.
- Usuario o rol afectado: el responsable que programa una jornada y el futuro despachador único que necesita saber cuál ticket puede ofrecerse sin inferir permisos ni estados desde el tablero.
- Comportamiento actual: `readJourneyRoadmap()` únicamente presenta la última revisión y `runAutonomous()` elige la primera entrada del registro ordenada alfabéticamente. Ninguno cruza tickets de una jornada con sus dependencias cerradas, ventanas, autorización del ejecutor ni disponibilidad; por eso no puede explicar que B espera a A mientras C independiente podría avanzar.
- Comportamiento esperado: dada una jornada, su proyecto autorizado, el instante y una disponibilidad declarada, el motor devuelve candidatos deterministas. Un ticket dependiente solo queda listo cuando cada dependencia está `closed`; un ticket que espera plan, gate o QA informa ese motivo; la ventana cerrada impide despacho nuevo; la ausencia de capacidad o de ejecutor autorizado no oculta el siguiente candidato manual ni inicia trabajo.

## Diagnóstico

- Archivos y flujo investigados: `packages/engine/src/journeys.ts` conserva la foto append-only, con prioridad, orden, dependencias, ventana y autorizaciones por ticket; `journey-windows.ts` ya decide sin efectos laterales si una ventana permite un inicio; `journey-authorization.ts` solo confirma ejecutores declarados por el proyecto autorizado. `autonomous-run.ts` contiene criterios de autonomía para una cola global, pero ignora jornadas, depende de orden alfabético y ejecuta inmediatamente. `journey-roadmap.ts` es solo lectura y no determina elegibilidad. La spec `jornadas/spec.md` asigna aquí R-JOR-002 y R-JOR-003, mientras que la reserva atómica se asigna a FEATURE-ENGINE-CAPACIDAD-MAQUINA-20261001 y el inicio real a FEATURE-ENGINE-DESPACHO-JORNADA-20261001.
- Causa raíz o hipótesis: la intención de la jornada ya está persistida, pero no existe una frontera que la contraste contra el estado verificable del ticket, su autorización y una señal de disponibilidad. Reutilizar `runAutonomous()` mezclaría selección con transición e invocación, y permitiría que la cola global saltase el orden y las dependencias declaradas.
- Riesgos y compatibilidad: confundir un estado de tablero o actividad con un `workflow_status` verificable permitiría adelantar dependientes; asumir que observar Hermes autoriza despacho ampliaría permisos; tratar la falta de recurso como fracaso ocultaría el siguiente trabajo manual. La selección se mantendrá pura, sin tocar historiales append-only, estados de ticket ni configuración; el futuro ticket de capacidad aporta reservas atómicas y el de despacho es el único que podrá iniciar procesos.
- Impactos de sync, migración, Docker o despliegue: ninguno. No hay migración, sincronización, contenedores, credenciales, hosts ni despliegue.
- Memoria consultada: AP-003 delimita la cobertura al selector de motor asignado por el grafo; no se adelanta la vista ni el despachador. AP-007 refuerza que una futura integración debe conservar la autorización humana en sus recibos, pero este ticket no mueve estados ni evalúa gates.

## Plan

- Alcance y exclusiones: se implementa el selector de lectura del motor y sus pruebas. Quedan fuera la reserva/persistencia de capacidad, la transición a `in_progress`, los reintentos, los comandos CLI/MCP, la vista, Hermes y cualquier modificación de `.valmen/config.yaml`.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirmación del 2026-10-05: «si dale apruebo el diagnostico y el plan».
- Pasos ordenados:
  1. Crear `packages/engine/src/journey-selection.ts` con tipos congelados para la solicitud de selección, el siguiente candidato manual y los bloqueos. Leer solo `readJourneys()`, el estado validado de los tickets del proyecto, `evaluateJourneyWindow()` y `readJourneyAuthorization()`; validar el proyecto, instante, ejecutor y disponibilidad aportados sin rutas ni ejecutores libres.
  2. Evaluar cada ticket de la última revisión con motivos exclusivos y estables: dependencia no cerrada, workflow que exige plan/gate/QA, ventana que no permite inicio, autorización de despacho ausente y disponibilidad de recurso agotada. Priorizar por `priority` ascendente y luego `order`; exponer un candidato manual si cumple estado, dependencias y ventana aunque no pueda despacharse por recurso o ejecutor.
  3. Exportar el contrato en `packages/engine/src/index.ts` sin modificar `runAutonomous()` ni las superficies CLI, MCP o servidor; el ticket de despacho consumirá el selector posteriormente y será el único que inicie trabajo.
  4. Crear `tests/journey-selection.test.ts` con un laboratorio de proyecto autorizado y jornadas: A esperando intervención, B dependiente de A y C independiente aprobado; dependencia satisfecha solo con ticket cerrado; prioridad/orden deterministas; ventana cerrada; ejecutor no autorizado; capacidad agotada que conserva el candidato manual; y ausencia de hora fija después de liberar disponibilidad.
  5. Ejecutar `npx vitest run tests/journey-selection.test.ts`, `npm run build`, `npx vitest run` y `valmen gate qa-mechanical` antes de entregar. No se crea capacidad real, no se solicita promoción de gates y no se inicia ningún proceso.
- Compatibilidad y rollback: la API será aditiva y pura; no cambia los lectores actuales ni genera archivos. Revertir el módulo, su exportación y su prueba elimina la proyección sin requerir reversión de datos.

## Criterios de aceptación

- [x] R-JOR-002a: Ante A esperando intervención, B dependiente de A y C independiente con workflow autorizado, el selector ofrece C y conserva B con motivo de dependencia verificable.
      <!-- test: npx vitest run tests/journey-selection.test.ts -->
- [x] R-JOR-002b: La selección exige dependencias con `workflow_status: closed` y distingue bloqueos de plan, gate, QA, ventana, autorización, recurso y dependencia sin usar estados de tablero como prueba.
      <!-- test: npx vitest run tests/journey-selection.test.ts -->
- [x] R-JOR-003a: Con ventana abierta y disponibilidad declarada, el selector ordena por prioridad y orden de jornada; al liberar disponibilidad habilita el siguiente candidato sin esperar una hora programada posterior.
      <!-- test: npx vitest run tests/journey-selection.test.ts -->
- [x] R-JOR-003b: Sin ejecutor autorizado o sin capacidad, el selector no permite despacho pero informa el siguiente candidato para ejecución manual y no inicia ningún proceso.
      <!-- test: npx vitest run tests/journey-selection.test.ts -->

## Puntos

```json
[]
```

## Implementación

Se agregó `selectJourneyTickets()` en `packages/engine/src/journey-selection.ts` y se exportó desde `@valmen/engine`. La función es una proyección pura: ordena por prioridad y orden de jornada, separa el candidato manual del candidato despachable y reporta bloqueos estables por dependencia, plan, gate, QA, ventana, autorización, recurso, ticket inexistente o ticket ya cerrado. No escribe registros, no reserva capacidad, no cambia estados y no invoca ejecutores.

La selección falla cerrada si una condición de inicio exige ventana pero la revisión persistida no declara `windowId`.

## Pruebas

Directorio de ejecución: `/Users/juanandrade/Desktop/ValmenHarness`.

- `npx vitest run tests/journey-selection.test.ts` — pasó: 7 pruebas. Cubre independencia frente a espera de QA, dependencias cerradas, razones de bloqueo, prioridad/orden, ventana, autorización, capacidad y ausencia de efectos laterales.
- `npx eslint packages/engine/src/journey-selection.ts packages/engine/src/index.ts tests/journey-selection.test.ts` — pasó.
- `npm run build` — pasó.
- `npx vitest run` — el cambio pasó y el total fue 1 fallo, 126 archivos aprobados y 1 omitido; el único fallo externo fue `tests/dogfooding-registro.test.ts`, porque `.valmen/rules/estandares-proceso.md` contiene una regla añadida cuya proyección en `AGENTS.md` todavía no fue regenerada. Esos dos archivos no pertenecen a este ticket y no se modificaron para ocultar el fallo.

Validación manual para el responsable: en un proyecto autorizado de prueba, cree A en `awaiting_user_tests`, B dependiente de A y C independiente en `approved`, con ventana abierta y Hermes autorizado. Al consultar el selector debe devolver C como candidato manual y despachable, dejando B bloqueado por dependencia. Con capacidad cero, debe conservar C como candidato manual y devolver `dispatchCandidate: null` con motivo `resource`. No requiere servicio ni proceso externo; Node 24 y las dependencias instaladas bastan.

- Resultado del PO: todas las pruebas pasaron el 2026-10-05; se autoriza cerrar el ticket, crear el commit y enviarlo al remoto.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-05",
    "build_reference": "worktree:sha256:a1368b4f098e37e1869990659da12e1da7e6d97bbc78e06250debd7b3250cd29",
    "environment": "local",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-05",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "El PO confirmó que todas las pruebas pasaron y autorizó el cierre, commit y push."
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-05",
    "kind": "test",
    "description": "Pruebas focalizadas, lint y compilación aprobados; resultado del PO conforme.",
    "reference": "worktree:sha256:a1368b4f098e37e1869990659da12e1da7e6d97bbc78e06250debd7b3250cd29",
    "point_id": null
  }
]
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
    "date": "2026-10-05",
    "technical_summary": "Se agregó un selector puro de jornadas que ordena candidatos, distingue ejecución manual de despacho y falla cerrada ante ventanas incompletas.",
    "functional_summary": "Una jornada puede ofrecer un ticket independiente y autorizado mientras otro espera QA o dependencias, sin iniciar procesos ni reservar capacidad.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin publicación: el cambio queda cerrado y no modifica una release."
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-05",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Esta conversación también atendió FEATURE-GATE-CALIBRACION-EVIDENCIA-20260926; no existe un desglose verificable por ticket. El consumo completo está en la sesión Codex de la conversación del 2026-10-05.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:conversacion-codex-20261005",
    "confidence": "medium",
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
    "at": "2026-10-01T19:10:45.327Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-05",
    "at": "2026-10-05T13:33:26.437Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-05",
    "at": "2026-10-05T13:33:49.207Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-05",
    "at": "2026-10-05T14:11:12.373Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por PO: El PO aprobó explícitamente el diagnóstico y el plan: si dale apruebo el diagnostico y el plan"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-05T14:11:25.808Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-05T14:11:25.984Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-05T14:24:05.767Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-05T14:26:59.469Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-05",
    "at": "2026-10-05T14:27:09.759Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-05",
    "at": "2026-10-05T14:27:09.996Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-05",
    "at": "2026-10-05T14:27:10.186Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-05",
    "at": "2026-10-05T14:27:10.377Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-05",
    "at": "2026-10-05T14:27:35.373Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-05",
    "at": "2026-10-05T14:27:36.088Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-05",
    "at": "2026-10-05T14:27:36.282Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
