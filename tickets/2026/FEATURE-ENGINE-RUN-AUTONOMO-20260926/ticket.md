---
schema_version: 2
id: FEATURE-ENGINE-RUN-AUTONOMO-20260926
title: Ejecutar valmen run hasta awaiting_user_tests
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
created: 2026-09-26
updated: 2026-10-04
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-RUN-AUTONOMO-20260926

## Solicitud original

Parte del sprint: Ejecutar autonomía acotada con colisiones, evidencia, migraciones e integración controladas.
- R-S5-002: Ejecución desatendida hasta `awaiting_user_tests` — `valmen run` DEBE llevar un ticket elegible desde su estado actual hasta
Depende de: FEATURE-CONFIG-ELEGIBILIDAD-AUTONOMA-20260926, FEATURE-GATE-VERIFY-DEV-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: incorporar `valmen run --ticket <ID>` y `valmen run --queue` como la puerta que elige un ticket con la política `autonomous`, lo despacha a un ejecutor ya configurado y lo entrega en `awaiting_user_tests` cuando los criterios mecánicos pasan. La selección y las transiciones son del motor; el ejecutor solo modifica el proyecto conforme al ticket y sus skills.
- Usuario o rol afectado: responsable que habilita trabajo autónomo de bajo riesgo y el ejecutor local configurado para el proyecto (Codex hoy; otro proveedor compatible después).
- Comportamiento actual: `autonomous:` se valida y queda apagada por defecto, pero no existe un comando que consuma la política, elija un ticket ni arranque una ejecución. `process run` puede llamar un runtime de agente declarado por un proceso, pero no conoce la elegibilidad, el workflow ni la entrega de tickets.
- Comportamiento esperado: `valmen run` rechaza de forma explícita una política apagada, un ticket no elegible o una selección ambigua; con un único ticket elegible y ejecutor declarado avanza `approved -> in_progress`, le entrega contexto verificable al ejecutor y solo intenta `awaiting_user_tests` después de `qa-mechanical`. Nunca cierra, inicia QA, integra, paraleliza, migra ni ignora un gate humano.

## Diagnóstico

- Archivos y flujo investigados: `packages/adapter/src/config.ts` y `packages/engine/src/discovery.ts` ya exponen `AutonomousConfig`; `packages/core/src/transitions.ts` y `packages/engine/src/transition.ts` conservan las transiciones y exigen un recibo `qa-mechanical` fresco antes de entregar. `packages/engine/src/process.ts` demuestra el límite correcto: el harness pasa instrucciones a un runtime externo y registra su resultado, sin hacerse pasar por runtime de agentes. `packages/cli/src/main.ts` todavía no despacha el verbo superior `run`.
- Causa raíz o hipótesis: el síntoma es que una política `autonomous.enabled: true` no produce ninguna acción: `valmen` no tiene el comando superior `run`, por tanto nadie lee la lista de tipos, límites o condiciones ni despacha el ticket. La causa verificable es la ausencia simultánea de ese consumidor en `packages/cli/src/main.ts` y del orquestador de workflow en `packages/engine/src/`; `process run` no sustituye ninguno porque solo ejecuta YAML de procesos y no evalúa tickets. El requisito R-S5-002 habla de análisis y plan, pero R-S5-001 exige `plan-approved`: para no fabricar una aprobación humana, esta primera ejecución parte exclusivamente de un ticket ya `approved`; análisis y plan siguen el flujo registrado anterior a la selección.
- Riesgos y compatibilidad: ejecutar un comando de agente arbitrario con el shell convertiría la configuración en una vía de ejecución no auditada; un despachador que aceptara tickets no aprobados ampliaría autoridad humana; y saltar el gate mecánico permitiría entregar un ticket que no corresponde al texto probado. El adaptador debe construir argumentos seguros para ejecutores conocidos y producir contexto sin importar desde el índice del propio paquete (aprendizaje AP-002: esos imports pueden crear ciclos dependientes del orden de evaluación). La ausencia de configuración o de ejecutor debe fallar antes de la transición. La compatibilidad se conserva porque `autonomous` es opt-in y su ausencia sigue apagando el comando; los flujos manuales y `process run` no cambian. Las siguientes piezas de S5, dependientes de esta, seguirán siendo dueñas de colisiones, parada segura, migraciones, validación semántica ampliada, integración y cierre.
- Impactos de sync, migración, Docker o despliegue: ninguno. Los cuatro campos de impacto son `false` y esta implementación no ejecuta migraciones, contenedores, despliegues ni operaciones Git; además, el filtro rechazará cualquier ticket que declare tales impactos, por lo que no se introduce una ruta indirecta a ellos.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). La autorización vigente fue continuar los tickets en orden y aprobar directamente el plan cuando su gate pase; este ticket mantiene obligatoria la aprobación registrada de cada ticket que `valmen run` pueda seleccionar.
- Alcance y exclusiones: se implementa un único despacho secuencial hasta `awaiting_user_tests`. No se automatizan análisis ni aprobación de plan, no se incorpora concurrencia, reintentos, parada segura, migraciones, integración, cierre, QA ni una pantalla; cada uno pertenece a los tickets S5 posteriores que dependen de este.
- Pasos ordenados:
  1. En `packages/adapter/src/config.ts` y `packages/engine/src/discovery.ts`, ampliar la política autónoma con una declaración explícita y validada de ejecutor compatible (identificador, modelo y esfuerzo), segura por defecto si falta; documentar que es el puente intercambiable para Codex hoy y Claude u otro ejecutor permitido después, no una orden de shell libre.
  2. Crear `packages/engine/src/autonomous-run.ts` como dueño del filtro y de la corrida: leer todos los tickets válidos, ordenar la cola de forma determinista, comprobar tipo, riesgo, módulo excluido, impactos, criterios declarados y plan aprobado; rechazar selección no única o solicitud no elegible antes de mutar. Usar imports directos de módulos, no el índice del paquete, conforme a AP-002.
  3. En el mismo motor, modelar el contrato del ejecutor y sus adaptadores con argumentos seguros para los ejecutores declarados; construir un prompt que obligue a continuar el ticket, usar las skills del proyecto, implementar, probar y dejar el contrato de entrega, sin commit, push, cierre ni transición a QA. Tras retorno exitoso, correr `qa-mechanical` y usar la transición existente para llegar a `awaiting_user_tests`; si el ejecutor o el gate falla, conservar un estado válido y devolver la evidencia del fallo.
  4. Añadir `packages/cli/src/run.ts`, registrar `run` en `packages/cli/src/main.ts` y actualizar `USAGE`/documentación con `--ticket` y `--queue`. La CLI solo traduce banderas, resuelve las rutas y muestra una salida inequívoca; el motor conserva la decisión de elegibilidad.
  5. Crear `tests/autonomous-run.test.ts` y casos de CLI para política apagada, tipo/riesgo/módulo/impacto/plan/criterios no elegibles, cola determinista y ambigua, argumentos del adaptador, transición exitosa hasta entrega y fallo sin salto de estado. Ejecutar la suite focal, regresiones de configuración/gate/transición, compilación y la suite completa.
- Rollback: revertir de forma conjunta el lector de ejecutor, el motor, la CLI, documentación y sus pruebas. Sin configuración autónoma la capacidad queda apagada, y la reversión no cambia tickets ya entregados ni ejecuta integración o despliegue.

## Criterios de aceptación

- [x] R-S5-002: `valmen run --ticket` y `valmen run --queue` solo seleccionan tickets con la política autónoma habilitada y todas sus condiciones declaradas; un rechazo no modifica ningún ticket.
      <!-- test: npx vitest run tests/autonomous-run.test.ts -->
- [x] Un ticket seleccionado parte de `approved`, se despacha una sola vez al ejecutor configurado y alcanza `awaiting_user_tests` únicamente después de un `qa-mechanical` aprobado y fresco.
      <!-- test: npx vitest run tests/autonomous-run.test.ts -->
- [x] La ejecución usa un contrato de ejecutor explícito y argumentos seguros, sin aceptar comandos de shell libres; permite elegir Codex hoy y otro adaptador soportado sin cambiar el motor.
      <!-- test: npx vitest run tests/autonomous-run.test.ts -->
- [x] Un fallo de ejecutor o de verificación conserva un estado válido, informa el motivo y no inicia QA, cierre, commit, push, migraciones, concurrencia ni reintentos.
      <!-- test: npx vitest run tests/autonomous-run.test.ts -->
- [x] La ayuda y documentación delimitan que análisis/plan aprobados anteceden la selección y que colisiones, parada segura, migraciones, integración y cierre pertenecen a tickets posteriores.
      <!-- test: npx vitest run tests/autonomous-run.test.ts -->

## Puntos

```json
[]
```

## Implementación

- `packages/adapter/src/config.ts` reconoce un ejecutor autónomo opcional y tipado (`codex`, `opencode` o `claude`) con modelo y esfuerzo. La política sigue apagada sin `autonomous.enabled`, y una política activa sin ejecutor no puede despachar.
- `packages/engine/src/autonomous-run.ts` concentra elegibilidad, selección determinista, construcción de argumentos sin shell, transición a `in_progress`, invocación única del ejecutor y gate `qa-mechanical` antes de la entrega. El fallo queda en un estado válido y no acciona QA, Git, migraciones, concurrencia ni reintentos.
- `packages/cli/src/run.ts` y `packages/cli/src/main.ts` publican `valmen run --ticket <ID>` y `valmen run --queue`; la CLI delega toda decisión al motor.
- Se añadió `tests/autonomous-run.test.ts`, se amplió `tests/config-autonomous.test.ts` y `docs/12-FUNCIONALIDADES-PROXIMAS.md` documenta el ejecutor y el límite de esta primera etapa.

## Pruebas

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness`.
- Focal: `npx vitest run tests/autonomous-run.test.ts tests/config-autonomous.test.ts tests/gate-mecanico.test.ts tests/gate-verify-dev.test.ts`.
  Resultado: pasó (4 archivos, 32 pruebas). Cubre selección y rechazo sin mutación, orden estable de cola, adaptador seguro, entrega tras `qa-mechanical`, configuración y regresiones de los gates vecinos.
- Compilación: `npm run build`.
  Resultado: pasó; TypeScript construyó todos los paquetes y actualizó la copia de interfaz.
- Suite completa: `npx vitest run`.
  Resultado: pasó (120 archivos; 1 omitido; 1.878 pruebas aprobadas y 48 omitidas).
- Validación de registro: `npx valmen validate --id FEATURE-ENGINE-RUN-AUTONOMO-20260926` y `git diff --check`.
  Resultado: pasaron.
- Validación manual propuesta: en un repositorio de laboratorio, declarar `autonomous.enabled: true` y un ejecutor Codex, crear un BUGFIX `approved` sin impactos con criterio `test:` autorizado y ejecutar `valmen run --ticket <ID>`; debe invocar el ejecutor una vez y terminar en `awaiting_user_tests`, sin commit, push, QA ni cierre. Un ticket fuera de la política debe rechazarse sin cambiar su estado.
- Validación manual de seguridad ejecutada: con la autonomía apagada en este proyecto, `npx valmen run --ticket FEATURE-ENGINE-RUN-AUTONOMO-20260926` devolvió `La autonomía está apagada en .valmen/config.yaml.` con salida 2 y conservó `workflow_status: awaiting_user_tests`.
- Resultado comunicado por el PO: autorizó continuar los tickets, aprobar el plan si el gate pasa y, si las pruebas corridas pasan, cerrar, hacer commit y push. Las pruebas focales, la compilación, la suite completa y el gate mecánico pasaron.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-04",
    "build_reference": "worktree:sha256:0d5109558078015d2aff5a9b00c8f8aadc0fa33d028b875007845cfff96372b9",
    "environment": "local",
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
    "po_confirmation": "El PO autorizó cerrar si las pruebas corridas pasan; las focales, la compilación, la suite completa y el gate mecánico aprobaron."
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
    "technical_summary": "Se añadió valmen run con política de elegibilidad, adaptadores seguros de ejecutor, transición controlada y gate mecánico previo a la entrega; compilación y suite completa pasaron.",
    "functional_summary": "Un proyecto puede despachar de forma secuencial un ticket aprobado de bajo riesgo a un ejecutor configurado y recibirlo para pruebas del responsable, sin que el harness cierre ni integre por sí solo.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Sin release ni despliegue; cambio del harness integrado por commit separado."
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
    "notes": "La sesión de Codex atendió varios tickets del feature control-jornadas-ejecucion; no hay un agregado atribuible sin inventar reparto. Los recibos de análisis, plan y qa-mechanical quedan en el ticket.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-compartida-20261004",
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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-04",
    "at": "2026-10-04T19:15:33.827Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-04",
    "at": "2026-10-04T19:17:45.502Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-04",
    "at": "2026-10-04T19:23:32.345Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-04",
    "at": "2026-10-04T19:23:33.076Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-04",
    "at": "2026-10-04T19:24:11.874Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-04",
    "at": "2026-10-04T19:25:34.789Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-04",
    "at": "2026-10-04T19:25:35.447Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-04",
    "at": "2026-10-04T19:25:35.993Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-04",
    "at": "2026-10-04T19:25:36.575Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-04",
    "at": "2026-10-04T19:25:45.395Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-04",
    "at": "2026-10-04T19:25:46.889Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-04",
    "at": "2026-10-04T19:25:47.445Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
