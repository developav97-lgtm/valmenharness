---
schema_version: 2
id: INTEGRATION-HERMES-DESPACHO-JORNADA-20261001
title: Integrar jornadas con el despachador opcional de Hermes
type: INTEGRATION
module: HERMES
workflow_status: closed
qa_status: approved
release_status: unreleased
user_visible: false
sync_impact: false
migration_impact: false
docker_impact: false
risk_level: normal
created: 2026-10-01
updated: 2026-10-06
related_ticket: null
target_release: null
released_in: null
---

# INTEGRATION-HERMES-DESPACHO-JORNADA-20261001

## Solicitud original

Parte del sprint: Integrar selección y capacidad con autonomía existente y despacho Hermes opcional.
- R-CON-005: Los adaptadores DEBEN declarar sus capacidades disponibles y sus límites.
- R-JOR-002: La selección DEBE permitir avanzar con un ticket independiente y autorizado cuando otro espera intervención.
- R-JOR-003: El siguiente ticket elegible DEBE poder iniciar por disponibilidad sin esperar una hora fija posterior.
- R-JOR-005: Las ejecuciones administradas DEBEN respetar una capacidad compartida y persistida por máquina.
- R-JOR-006: Observar o configurar jornadas NO DEBE ampliar la autorización de ejecución del proyecto.
Depende de: FEATURE-ENGINE-DESPACHO-JORNADA-20261001, FEATURE-ADAPTER-HERMES-LECTURA-20261001, FEATURE-CONFIG-CAPACIDADES-EXPLICITAS-20261001.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Referencias de la feature

- Feature: [control-jornadas-ejecucion](../../../.valmen/features/control-jornadas-ejecucion/feature.md).
- Grafo aprobado para materializar: [tickets.yaml](../../../.valmen/features/control-jornadas-ejecucion/tickets.yaml).
- Límites y reparto del alcance: [revisión de descomposición](../../../.valmen/features/control-jornadas-ejecucion/revision-descomposicion.md).
- Spec completa: [contrato/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/contrato/spec.md).
- Spec completa: [jornadas/spec.md](../../../.valmen/features/control-jornadas-ejecucion/spec/jornadas/spec.md).

La cobertura indica la parte del requisito asignada por el grafo; sus otros
tickets colaboran en el resultado completo. Las anotaciones de verificación
se definirán al planificar; esta alta no aprueba el plan ni comprueba criterios.

## Descripción funcional

- Alcance: que un proyecto pueda declarar a Hermes como despachador de la jornada (R-JORN-011): `execution.dispatcher: hermes` en `.valmen/config.yaml`, y que `valmen journey install-trigger` prepare entonces el job de Hermes sin agente que corre `journey advance`, en lugar del plist de launchd. Sin la declaración (o con `machine`) todo sigue igual con el disparador de la máquina. Los requisitos R-CON-005, R-JOR-002, R-JOR-003, R-JOR-005 y R-JOR-006 de la feature de jornadas ya los cumplen módulos existentes y se verifican con sus pruebas; este ticket no los reescribe. Fuera de alcance: ejecutar `hermes cron create` (lo ejecuta una persona), cualquier agente en el job y cambiar quién lanza los ejecutores (siguen saliendo del motor por `dispatchJourney`).
- Usuario o rol afectado: el responsable del proyecto que ya usa Hermes y prefiere que sea Hermes —no launchd— quien dispare el avance cada N minutos.
- Comportamiento actual: `journey install-trigger` (`packages/cli/src/commands.ts:2985`) solo sabe preparar el plist de launchd (`packages/cli/src/journey-trigger.ts:34`); no existe forma de declarar a Hermes como despachador.
- Comportamiento esperado: con `execution.dispatcher: hermes`, `install-trigger` imprime el script de job (`valmen-jornada-<proyecto>.sh`, que ejecuta solo `journey advance --project <id>`, sin modelo) y el comando exacto `hermes cron create --no-agent --script ... "every <N>m"`; con `--write` escribe solo el script en `~/.hermes/scripts/`; nunca ejecuta `hermes`. Un valor distinto de `machine` o `hermes` falla con un mensaje claro, y la bandera `--via machine|hermes` fuerza uno de los dos para esa llamada.

## Diagnóstico

- Archivos y flujo investigados: el avance lo hace `journey advance` (`packages/cli/src/commands.ts`, módulo `journey-advance.ts` del motor) y el disparador de la máquina lo prepara `renderLaunchdPlist` en `packages/cli/src/journey-trigger.ts:34`; la configuración de ejecución se lee en `packages/adapter/src/config.ts:1042` (`readIntegrationConfig`); el puente de Hermes y su `enabled` se leen en `packages/adapter/src/config.ts:456`; los jobs sin agente de Hermes existen ya como patrón (`templates/programar/aviso-eslabon.sh`, `hermes cron create --no-agent --script`, comprobado con `hermes cron create --help`); los ejecutores se lanzan desde `dispatchJourney` (`packages/engine/src/journey-dispatch.ts:67`) y no cambian.
- Causa raíz o hipótesis: el requisito R-JORN-011 no tiene implementación porque `install-trigger` está atado a launchd. Comprobado con búsqueda: ningún código lee una declaración de despachador. La capacidad compartida por máquina (`machine-capacity.ts`), la selección independiente (`journey-selection.ts`) y la no ampliación de autorización (`journey-authorization.test.ts`) ya existen y cubren R-JOR-002/003/005/006; las capacidades declaradas de los adaptadores las cubre `adapter-capabilities.test.ts` (R-CON-005).
- Riesgos y compatibilidad: el script del job no lleva credenciales ni agente y solo llama a `journey advance`, que conserva todos sus topes, paradas y autorización; el defecto sigue siendo launchd, así que un proyecto sin la clave no cambia. Una declaración inválida falla en vez de caer a un defecto silencioso. Consumidores comprobados con búsqueda: `journeyInstallTriggerCommand` solo lo llaman `main.ts` y sus pruebas (`tests/avance-jornada.test.ts`); la clave nueva no la lee ningún otro código. Instalar un job de Hermes es persistente en la máquina: lo ejecuta una persona.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: la declaración del despachador, el script del job de Hermes y su salida en `install-trigger`. Exclusiones: ejecutar `hermes`, jobs con agente y cambios al despacho de ejecutores.
- Pasos ordenados:
  1. En `packages/adapter/src/config.ts` agregar `readJourneyDispatcher(config)` que lee `execution.dispatcher` (`machine` por defecto, `hermes`) y falla con un mensaje claro ante cualquier otro valor; exportarla desde el índice del adaptador.
  2. En `packages/cli/src/journey-trigger.ts` agregar `renderHermesJobScript(request)` (script bash que ejecuta `node <cli> journey advance --project <id>` y nada más), `comandoDeJobHermes(projectId, everyMinutes, rutaScript)` (el `hermes cron create --no-agent` exacto) y `escribirScriptHermes(directorio, request)` que escribe solo el archivo con permiso de ejecución.
  3. En `packages/cli/src/commands.ts` hacer que `journeyInstallTriggerCommand` elija el despachador con `--via` o, sin ella, con `readJourneyDispatcher` del proyecto resuelto (si el proyecto no se resuelve, usa `machine`), imprima el script y el comando de Hermes cuando corresponda y, con `--write`, escriba el script en `~/.hermes/scripts/`; nunca ejecuta `hermes` ni `launchctl`. Declarar `--via` en `packages/cli/src/main.ts` y en su ayuda.
  4. Crear `tests/despachador-hermes.test.ts` con un caso por criterio y correr esas pruebas, `npx vitest run tests/journey-selection.test.ts tests/machine-capacity.test.ts tests/adapter-capabilities.test.ts tests/journey-authorization.test.ts`, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; sin la clave nueva el comportamiento es el de antes.

## Criterios de aceptación

- [x] Un proyecto sin despachador declarado, o con `machine`, prepara el plist de launchd como antes
      <!-- test: npx vitest run tests/despachador-hermes.test.ts -->
- [x] Con `execution.dispatcher: hermes` el comando imprime el script del job sin agente y el `hermes cron create --no-agent` exacto, y con `--write` escribe solo el script sin ejecutar `hermes`
      <!-- test: npx vitest run tests/despachador-hermes.test.ts -->
- [x] Un valor de despachador distinto de `machine` o `hermes` falla con un mensaje claro
      <!-- test: npx vitest run tests/despachador-hermes.test.ts -->
- [x] R-CON-005: los adaptadores declaran sus capacidades y límites
      <!-- test: npx vitest run tests/adapter-capabilities.test.ts -->
- [x] R-JOR-002 y R-JOR-003: la selección avanza con un ticket independiente y sin esperar una hora fija
      <!-- test: npx vitest run tests/journey-selection.test.ts -->
- [x] R-JOR-005: las ejecuciones respetan una capacidad compartida y persistida por máquina
      <!-- test: npx vitest run tests/machine-capacity.test.ts -->
- [x] R-JOR-006: observar o configurar jornadas no amplía la autorización de ejecución
      <!-- test: npx vitest run tests/journey-authorization.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de INTEGRATION-HERMES-DESPACHO-JORNADA-20261001",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/adapter/src/config.ts",
      "packages/cli/src/journey-trigger.ts",
      "packages/cli/src/commands.ts",
      "packages/cli/src/main.ts",
      "tests/despachador-hermes.test.ts"
    ],
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

- `packages/adapter/src/config.ts`: `readJourneyDispatcher` lee `execution.dispatcher` (`machine` por defecto, `hermes`); cualquier otro valor falla con mensaje claro.
- `packages/cli/src/journey-trigger.ts`: `renderHermesJobScript` (solo `journey advance`, sin agente ni credenciales), `comandoDeJobHermes` (el `hermes cron create --no-agent` exacto) y `escribirScriptHermes` (solo el archivo, ejecutable).
- `packages/cli/src/commands.ts` y `main.ts`: `journey install-trigger` elige despachador con `--via` o con la declaración del proyecto (sin proyecto resoluble rige `machine`); nunca ejecuta `launchctl` ni `hermes`.
- `tests/despachador-hermes.test.ts`: proyecto sin Hermes, con Hermes (imprimir y `--write`), `--via` y declaración inválida.
- R-CON-005, R-JOR-002/003/005/006 ya los cumplen `adapter-capabilities`, `journey-selection`, `machine-capacity` y `journey-authorization`; se verifican con sus pruebas, sin reescribirlas.

## Pruebas

- Directorio: raíz del repositorio. `npx vitest run tests/despachador-hermes.test.ts` → 8 pruebas pasan.
- `npx vitest run tests/adapter-capabilities.test.ts tests/journey-selection.test.ts tests/machine-capacity.test.ts tests/journey-authorization.test.ts` → 18 pruebas pasan.
- Suite completa: `npx vitest run` → 186 archivos, 2714 pruebas pasan, 48 omitidas. `npx tsc --noEmit -p tsconfig.json` y `npx eslint` sin errores; `valmen secrets` sin hallazgos.
<!-- verify: manual -->

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:313ab7a4e83a08286c4df832b3db86b6651ab226",
    "environment": "local (Node 24, vitest)",
    "result": "pending",
    "findings": [],
    "correction": null,
    "po_confirmation": null
  },
  {
    "id": "QA-002",
    "date": "2026-10-07",
    "build_reference": null,
    "environment": null,
    "result": "approved",
    "findings": [],
    "correction": null,
    "po_confirmation": "«Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade"
  }
]
```

## Evidencia

```json
[
  {
    "id": "EVIDENCE-001",
    "date": "2026-10-07",
    "kind": "automated-test",
    "description": "npx vitest run",
    "reference": "worktree:sha256:aa2d3ed2749c9d3056b5ecde198cdeb3417dc9ae94b37169e023aa99e234ff43",
    "point_id": "POINT-001"
  }
]
```

## Retests

```json
[
  {
    "id": "RETEST-001",
    "date": "2026-10-07",
    "point_id": "POINT-001",
    "result": "approved",
    "evidence": [],
    "po_confirmation": "«Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade"
  }
]
```

## Cierre

```json
[
  {
    "kind": "ticket-close",
    "id": "CLOSE-001",
    "date": "2026-10-07",
    "technical_summary": "Despachador declarable (execution.dispatcher) y job de Hermes sin agente preparado por install-trigger.",
    "functional_summary": "Un proyecto puede usar Hermes en vez de launchd para disparar la jornada; sin declararlo nada cambia.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "Ninguno"
  }
]
```

## Consumo de IA

```json
[
  {
    "kind": "ai-usage",
    "date": "2026-10-07",
    "session_reference": null,
    "model": null,
    "reasoning_effort": null,
    "notes": "Sesión que atendió varios tickets de la delegación; sin números por ticket para no repartir a ojo un costo que no se midió por ticket.",
    "input_tokens": null,
    "output_tokens": null,
    "total_tokens": null,
    "estimated_cost_usd": null,
    "source": "manual:sesión de Claude Code por delegación DEL-20261006-001",
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
    "at": "2026-10-01T19:10:45.483Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T04:31:44.129Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T04:32:09.139Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T04:32:40.840Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"delegacion\",\"quote\":\"Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06\",\"planHash\":\"sha256:eecbc89b2c966e43e27cb7b57497596d01c61b8d9c5c7539a9da6517e13245d6\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T04:32:40.973Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente delegacion), plan sha256:eecbc89b2c966e43e27cb7b57497596d01c61b8d9c5c7539a9da6517e13245d6."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T04:32:40.973Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T04:32:41.079Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T04:34:42.379Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T04:34:42.482Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T04:34:42.572Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T04:34:42.668Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T04:34:42.753Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T04:34:42.845Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T04:34:43.002Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T04:34:43.187Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T04:34:43.268Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T04:34:43.354Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T04:34:43.440Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T04:34:43.526Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T04:34:43.610Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T04:34:43.698Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-06",
    "at": "2026-10-07T04:34:43.779Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
