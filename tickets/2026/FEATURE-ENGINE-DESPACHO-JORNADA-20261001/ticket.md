---
schema_version: 2
id: FEATURE-ENGINE-DESPACHO-JORNADA-20261001
title: Despachar tickets elegibles con un único dueño
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

# FEATURE-ENGINE-DESPACHO-JORNADA-20261001

## Solicitud original

Parte del sprint: Integrar selección y capacidad con autonomía existente y despacho Hermes opcional.
- R-JOR-002: La selección DEBE permitir avanzar con un ticket independiente y autorizado cuando otro espera intervención.
- R-JOR-003: El siguiente ticket elegible DEBE poder iniciar por disponibilidad sin esperar una hora fija posterior.
- R-JOR-004: El fin de una ventana DEBE impedir nuevos despachos de esa ventana sin interrumpir automáticamente el trabajo activo.
- R-JOR-005: Las ejecuciones administradas DEBEN respetar una capacidad compartida y persistida por máquina.
- R-JOR-006: Observar o configurar jornadas NO DEBE ampliar la autorización de ejecución del proyecto.
Depende de: FEATURE-ENGINE-SELECCION-ELEGIBLE-20261001, FEATURE-ENGINE-CAPACIDAD-MAQUINA-20261001, FEATURE-ENGINE-RUN-AUTONOMO-20260926, SECURITY-ENGINE-PARADA-SEGURA-20260926, FEATURE-ENGINE-AUTORIZACION-JORNADAS-20261001, FEATURE-CONFIG-CAPACIDADES-EXPLICITAS-20261001.
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

- Alcance: exponer una única operación del motor que, para un proyecto ya autorizado y una jornada existente, reconcilie la capacidad local, elija el siguiente ticket de la jornada y lo entregue al `runAutonomous()` vigente solamente si la reserva, la ventana y las autorizaciones siguen siendo válidas. Registra la actividad de la ejecución y conserva la reserva para su reconciliación terminal.
- Usuario o rol afectado: la persona o integración autorizada que quiere que una jornada avance por disponibilidad, sin tener que esperar una hora posterior ni escoger manualmente entre tickets dependientes.
- Comportamiento actual: `selectJourneyTickets()` es una proyección pura: recibe una disponibilidad ya calculada y devuelve candidatos, pero no reclama un cupo ni inicia trabajo. `claimMachineCapacity()` reserva de forma atómica, pero no conoce jornadas ni invoca ejecutores. `runAutonomous()` decide la elegibilidad global y mueve un ticket a `in_progress`, pero desconoce la jornada, sus ventanas, el proyecto autorizado y la capacidad de máquina. Por tanto no existe aún una frontera que las conecte y sea dueña del inicio.
- Comportamiento esperado: una solicitud con proyecto autorizado, jornada, identidad de ejecución e intento solo inicia el candidato que la última revisión permite y que el ejecutor efectivo configurado tiene autorizado. Antes de invocar se reclama el cupo compartido; sin cupo, autorización o ventana no se inicia ningún ejecutor ni se altera el ticket. La actividad `started` y su término se anexan al historial de ejecución, y una nueva solicitud reconcilia únicamente finales verificables para habilitar el siguiente ticket sin un cron adicional.

## Diagnóstico

- Archivos y flujo investigados: `packages/engine/src/journey-selection.ts` determina en memoria el candidato manual y el de despacho a partir de `readJourneys()`, workflow, ventana, autorización y `availableSlots`, sin efectos laterales. `journey-windows.ts` confirma que el cierre solo prohíbe nuevos inicios; `journey-authorization.ts` relee exclusivamente la política de un `AuthorizedProject`. `machine-capacity.ts` ofrece reconciliación conservadora y reclamación atómica bajo el lock común de `~/.valmen/`, pero recibe una identidad ya construida. `autonomous-run.ts` es el único dueño existente de la transición a `in_progress`, el ejecutor seguro y las paradas de S5; no sabe de jornadas ni de bindings. `execution-activity.ts` persiste estados append-only separados del workflow y `execution-status.ts` usa `finished`/`failed` como los únicos finales para liberar capacidad durante reconciliación.
- Causa raíz confirmada: los contratos predecesores fueron deliberadamente separados para no adelantar un despachador: la selección no reserva, la capacidad no selecciona, y la autonomía no consume jornadas. Ningún símbolo reúne en una misma decisión la autorización del proyecto, el ejecutor efectivo, la reclamación de capacidad, la transición que concede un único dueño y los eventos de actividad. Conectarlos desde una CLI, un tablero o Hermes duplicaría la política y permitiría saltar la configuración explícita.
- Riesgos y compatibilidad: reclamar capacidad después de invocar permite dos trabajos sobre el último cupo; reclamarla sin tratar un fallo previo al inicio puede dejar una reserva falsa. Dos solicitudes concurrentes del mismo ticket deben delegar la posesión final a la transición existente y liberar solo la reserva creada por la solicitud que perdió la carrera. El flujo no debe aceptar un ejecutor, una ruta o una capacidad aportados libremente: deriva el ejecutor de la autonomía configurada, confirma `execution.dispatch-executors` y la autorización del ticket de jornada. Un resultado detenido o fallido conserva el ticket en su estado contractual, registra actividad terminal segura para la reconciliación y no reintenta, entrega, cierra ni cancela procesos. AP-007 fue consultado: la autorización humana se conserva en la política y en los recibos existentes; una observación o una jornada no la sustituye.
- Impactos de sync, migración, Docker o despliegue: ninguno. No se modifica `.valmen/config.yaml`, bindings, credenciales, hosts, contenedores ni despliegues. La persistencia se limita a las reservas locales, los eventos de ejecución y los recibos de parada que ya definen los contratos predecesores; no se añade un esquema ni un servicio nuevo.

## Plan

- Alcance y exclusiones: se implementa la frontera de despacho del motor y sus pruebas de integración en laboratorio. Reutiliza la selección, capacidad, actividad y autonomía ya cerradas; no agrega CLI, MCP, servidor, interfaz, Hermes, cron, configuración, bindings, cancelación de procesos, reintentos, cierre de tickets ni otro scheduler. `INTEGRATION-HERMES-DESPACHO-JORNADA-20261001` seguirá siendo el único ticket que conecte un dispatcher Hermes.
- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan). Confirmación del 2026-10-05: «dale si implementala».
- Pasos ordenados:
  1. Crear `packages/engine/src/journey-dispatch.ts` como único dueño del inicio de una jornada. Su solicitud recibirá un `AuthorizedProject`, `home` inyectable, `journeyId`, instante ISO, `executionId`, `attemptId` y un ejecutor de laboratorio opcional; derivará el ejecutor efectivo exclusivamente de `autonomousConfig(project.root)`, nunca de una ruta, comando o etiqueta libre aportada por el consumidor.
  2. En ese módulo, reconciliar primero `reconcileMachineCapacity({ home })`, leer la disponibilidad resultante y llamar `selectJourneyTickets()` con el ejecutor efectivo. Si no existe `dispatchCandidate`, devolver una decisión explícita de no inicio junto con la selección; no reclamar capacidad, no escribir actividad, no mutar el ticket ni invocar el ejecutor. Esto mantiene visible el candidato manual y cubre ventana cerrada, dependencia, plan/gate/QA, recurso y autorización.
  3. Para un candidato de despacho, construir la identidad con `createExecutionIdentity`, reclamar `claimMachineCapacity()` antes de iniciar y distinguir: cupo no otorgado (sin mutación del ticket), misma identidad ya reservada (idempotencia sin segundo ejecutor) y reserva nueva. Si una carrera pierde la transición interna de `runAutonomous()`, liberar solo la reserva creada por esa solicitud y no invocar un segundo proceso. Así la transición ya existente conserva la posesión final exclusiva del ticket.
  4. Registrar con `recordExecutionActivity()` un inicio y un término de intento con identificadores deterministas y seguros, sin guardar salida del ejecutor. Delegar la ejecución, elegibilidad global, `qa-mechanical` y paradas seguras a `runAutonomous()` para no duplicar sus políticas. Un resultado entregado anexa `finished`; uno fallido, detenido o que no llega a iniciar anexa `failed` cuando corresponda, de modo que la siguiente reconciliación pueda liberar únicamente capacidad terminal verificable. No se libera por tiempo, silencio ni cambio de ventana.
  5. Exportar el contrato desde `packages/engine/src/index.ts`. Crear `tests/journey-dispatch.test.ts` con proyectos y bindings temporales: A esperando persona, B dependiente y C independiente; cupo disputado y liberado por final persistido; ventana cerrada; autorización o autonomía ausente; repetición de la misma identidad; carrera perdida sin segundo ejecutor; y parada segura que conserva el ticket pero libera la capacidad solo tras evento terminal. Mantener las regresiones de selección, capacidad, autorización y autonomía.
  6. Ejecutar desde `/Users/juanandrade/Desktop/ValmenHarness`, sin paralelismo: `npx vitest run --maxWorkers 1 --no-file-parallelism tests/journey-dispatch.test.ts tests/journey-selection.test.ts tests/machine-capacity.test.ts tests/journey-authorization.test.ts tests/autonomous-run.test.ts`; después `npm run build`. La suite completa con esos mismos límites se ejecutará una sola vez durante QA, nunca en segundo plano ni junto con otra instancia de Vitest.
- Compatibilidad y rollback: es una API aditiva y sin superficie de transporte. Un proyecto sin autonomía, sin ejecutor declarado o sin autorización explícita conserva el comportamiento actual: se puede consultar la jornada, pero no se inicia trabajo. Revertir `journey-dispatch.ts`, su exportación y sus pruebas deja intactos los recibos, la actividad y las reservas ya persistidas; no libera cupos ni cancela procesos por inferencia.

## Criterios de aceptación

- [x] R-JOR-002: Con A esperando intervención, B dependiente y C independiente autorizado, el despachador inicia exclusivamente C y deja B con el bloqueo de dependencia que expone el selector.
      <!-- test: npx vitest run --maxWorkers 1 --no-file-parallelism tests/journey-dispatch.test.ts -->
- [x] R-JOR-003: Al registrar un término verificable de A y reconciliar la capacidad, una nueva solicitud inicia el siguiente candidato abierto sin esperar una hora posterior ni crear un cron.
      <!-- test: npx vitest run --maxWorkers 1 --no-file-parallelism tests/journey-dispatch.test.ts -->
- [x] R-JOR-004: Una ventana cerrada no reclama cupo, no escribe actividad ni invoca ejecutor; el trabajo ya activo no recibe una cancelación automática.
      <!-- test: npx vitest run --maxWorkers 1 --no-file-parallelism tests/journey-dispatch.test.ts tests/journey-windows.test.ts -->
- [x] R-JOR-005: La reclamación de cupo ocurre antes del ejecutor, una repetición de la identidad es idempotente y una carrera que pierde la transición no deja reserva ni inicia un segundo proceso.
      <!-- test: npx vitest run --maxWorkers 1 --no-file-parallelism tests/journey-dispatch.test.ts tests/machine-capacity.test.ts -->
- [x] R-JOR-006: El despacho usa solo el ejecutor configurado y autorizado; una observación, autorización ausente o política autónoma apagada deja la jornada sin iniciar y no altera ningún ticket.
      <!-- test: npx vitest run --maxWorkers 1 --no-file-parallelism tests/journey-dispatch.test.ts tests/journey-authorization.test.ts tests/autonomous-run.test.ts -->

## Puntos

```json
[]
```

## Implementación

- Se añadió `packages/engine/src/journey-dispatch.ts` como la frontera de inicio de una jornada: reconcilia capacidad, consulta selección y autorización, reclama un cupo antes del ejecutor y delega la ejecución y las paradas a `runAutonomous()`.
- Cada solicitud registra actividad append-only `started` y `finished` o `failed`, con identificadores derivados seguros. Una identidad previamente reservada no invoca un segundo ejecutor; una solicitud que falla antes de iniciar libera solo su propia reserva.
- El contrato se exportó desde `packages/engine/src/index.ts`. No se agregaron CLI, MCP, Hermes, cron, UI ni configuración nueva.

## Pruebas

- Directorio: `/Users/juanandrade/Desktop/ValmenHarness`.
- `npx vitest run --maxWorkers 1 --no-file-parallelism tests/journey-dispatch.test.ts tests/journey-selection.test.ts tests/machine-capacity.test.ts tests/journey-authorization.test.ts tests/autonomous-run.test.ts` — 5 archivos y 30 pruebas correctas.
- `npm run build` — pasó.
- `npx vitest run --maxWorkers 1 --no-file-parallelism` — 131 archivos pasaron; 1.969 pruebas pasaron y 48 equivalencias de referencia quedaron desactivadas por configuración.
- Resultado comunicado por el PO: autorizó el cierre condicionado a la prueba focal; `npx vitest run --maxWorkers 1 --no-file-parallelism tests/journey-dispatch.test.ts` pasó el 2026-10-05: 1 archivo y 6 pruebas correctas. El laboratorio inyecta el borde del ejecutor y no requiere Hermes, red ni credenciales.

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-05",
    "build_reference": "worktree:sha256:a193c9cb759e35296b09fb111cb70c14df62b8900fd8056d42b4ad494736d173",
    "environment": "macOS local; validación focal delegada por el PO",
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
    "po_confirmation": "PO autorizó el cierre el 2026-10-05 condicionado a la prueba focal; 6 de 6 pruebas correctas."
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
    "date": "2026-10-05",
    "technical_summary": "Se integraron selección de jornada, reserva atómica de capacidad, actividad append-only y ejecución autónoma existente en una única frontera de despacho.",
    "functional_summary": "Una jornada avanza por disponibilidad con un único dueño, sin iniciar trabajo fuera de ventana, sin autorización explícita ni sin cupo.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "No aplica: cambio local de motor sin publicación ni despliegue."
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
    "notes": "Sesión Codex compartida con varios tickets; no se atribuyen tokens ni costo por reparto estimado.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesion-codex-compartida-20261005",
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
    "at": "2026-10-01T19:10:45.433Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-05",
    "at": "2026-10-05T17:08:16.936Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-05",
    "at": "2026-10-05T17:09:50.704Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-05",
    "at": "2026-10-05T17:20:22.397Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-05",
    "at": "2026-10-05T17:20:22.894Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-05",
    "at": "2026-10-05T17:28:54.434Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-05",
    "at": "2026-10-05T17:31:51.269Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-05",
    "at": "2026-10-05T17:31:56.173Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-05",
    "at": "2026-10-05T17:32:00.983Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-05",
    "at": "2026-10-05T17:32:05.166Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-05",
    "at": "2026-10-05T17:32:10.880Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-05",
    "at": "2026-10-05T17:32:17.918Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-05",
    "at": "2026-10-05T17:32:23.013Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
