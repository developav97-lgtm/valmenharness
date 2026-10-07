---
schema_version: 2
id: FEATURE-ENGINE-JORNADA-EJECUCION-20261005
title: Llevar approved hasta las pruebas con el modelo de cada fase
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
created: 2026-10-05
updated: 2026-10-06
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-JORNADA-EJECUCION-20261005

## Solicitud original

Parte del sprint: Jornada autónoma sobre el motor de jornadas, después de la salida de S1 a S3: preparación hasta el plan, aprobación en lote, ejecución hasta las pruebas, topes, avisos y commit por ticket sin push.
- R-JORN-005: La fase de ejecución DEBE llevar tickets approved hasta las pruebas del responsable
- R-JORN-006: El despacho DEBE elegir el modelo del agente según la fase
Depende de: FEATURE-ENGINE-JORNADA-DIARIA-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la fase de ejecución de la jornada (R-JORN-005) y la elección del modelo del agente según la fase (R-JORN-006): llevar un ticket `approved` hasta las pruebas del responsable en su propia sesión, con el ejecutor marcado como desatendido, y comprobar que dejó escrito el contrato de pruebas; declarar en el enrutamiento un rol por fase —análisis, plan, implementación y verificación— y lanzar cada ejecutor con el modelo de su fase; y registrar por fase el modelo, el esfuerzo, la duración y el resultado. Fuera de alcance: cerrar por política (S6), los topes y las paradas, el commit por ticket, y el parte diario que lee los registros por fase.
- Usuario o rol afectado: el responsable que paga el consumo y quiere un modelo barato en preparación y uno fuerte en implementación, y el agente ejecutor.
- Comportamiento actual: `runAutonomous` (`packages/engine/src/autonomous-run.ts`) ya mueve `approved → in_progress`, lanza el ejecutor, corre `qa-mechanical` y deja el ticket en `awaiting_user_tests`, pero con el único modelo de `autonomous.executor`, sin marcar al ejecutor como desatendido, sin comprobar que el contrato de pruebas quedó escrito y sin registro por fase; el enrutamiento (`packages/adapter/src/routing.ts`) no tiene roles de fase.
- Comportamiento esperado: cuatro roles nuevos en el enrutamiento (`agent-analysis`, `agent-plan`, `agent-implementation`, `agent-verification`) con modelo y esfuerzo por preset; el despacho resuelve el rol de la fase, usa su modelo si su proveedor coincide con el ejecutor de la política y, si no, el de la política, y lo dice; el ejecutor corre con `VALMEN_UNATTENDED=1`; al terminar, además de `qa-mechanical`, el código comprueba que `## Pruebas` trae el contrato de entrega; y cada sesión deja un registro por fase en `.valmen/journeys/fases.jsonl` con ticket, fase, ejecutor, modelo, esfuerzo, duración y resultado.

## Diagnóstico

- Archivos y flujo investigados: `runAutonomous` y `autonomousExecutorCommand` en `packages/engine/src/autonomous-run.ts` arman el comando del ejecutor desde `autonomous.executor` (id, modelo y esfuerzo) y lo lanzan sin entorno propio; `dispatchJourney` (`packages/engine/src/journey-dispatch.ts`) lo llama con la identidad y la reserva de capacidad; `prepararTicket` (`packages/engine/src/journey-preparation.ts`, ticket anterior) ya lanza con `VALMEN_UNATTENDED=1`; el catálogo de roles `ROLES` y los cuatro presets (`quality`, `balanced`, `economy`, `suscripcion`) están en `packages/adapter/src/routing.ts`, con `resolveRouting` y `routeFor`; el consumo manual se registra con `addAiUsage`; el avance de la jornada que resuelve la fase es `packages/engine/src/journey-advance.ts` (`packages/engine/src/append.ts`).
- Causa raíz o hipótesis: el motor se escribió con un solo modelo por ejecutor y sin distinguir fases; por eso preparar un ticket cuesta como implementarlo. Comprobado: `ROLES` no tiene roles de fase y `runAutonomous` no lee el enrutamiento. El costo en dólares de una sesión no lo mide el harness: lo reportan los clientes (Hermes y Codex) y el ticket de consumo fiable ya registra las sesiones; aquí se guarda lo que el motor sabe —fase, modelo, esfuerzo, duración y resultado— y el costo se une después por la referencia de sesión, de modo que el parte diario podrá mostrarlo por fase sin que este ticket invente un número.
- Riesgos y compatibilidad: agregar roles al catálogo cambia lo que muestra y valida la pantalla de enrutamiento y las pruebas que cuentan roles (`tests/routing.test.ts` y las de la interfaz); los proyectos con un `.valmen/routing.yaml` sin esos roles resuelven por el preset, así que no se rompen. El ejecutor sigue siendo el de la política: el modelo de la fase solo se usa si el proveedor del rol coincide con el id del ejecutor (por ejemplo `codex`), porque un identificador de otro proveedor no lo entiende el cliente; cuando no coincide se usa el de la política y el registro por fase lo guarda en su campo de origen del modelo. Consumidores comprobados con búsqueda: `autonomousExecutorCommand` y `runAutonomous` los llaman `packages/engine/src/journey-dispatch.ts`, `packages/engine/src/journey-preparation.ts`, `packages/cli/src/run.ts` y `tests/autonomous-run.test.ts`; la firma nueva es aditiva y las llamadas actuales siguen valiendo.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: los roles de fase en el enrutamiento, la resolución del modelo por fase, el entorno desatendido y la comprobación del contrato de pruebas en la ejecución, y el registro por fase. Exclusiones: cierre por política, topes, commit por ticket y parte diario.
- Pasos ordenados:
  1. En `packages/adapter/src/routing.ts` agregar a `ROLES` los cuatro roles de fase con consumidor `valmen journey advance` y, en cada preset, su proveedor, modelo y esfuerzo (modelo económico en análisis y verificación, fuerte en plan e implementación); agregar `modeloDeFase(rutas, fase, ejecutor)` que devuelve el modelo y esfuerzo del rol si su proveedor coincide con el id del ejecutor y, si no, el de la política con el motivo.
  2. Crear `packages/engine/src/journey-phases.ts` con las fases, `registrarFase({ root, ticket, fase, ejecutor, modelo, esfuerzo, origenDelModelo, duracionMs, resultado })`, donde `origenDelModelo` dice si el modelo salió del rol de la fase o cayó al de la política y por qué (anexo a `.valmen/journeys/fases.jsonl`, un renglón por sesión) y `leerFases(root)`.
  3. En `packages/engine/src/autonomous-run.ts` aceptar la fase y el modelo resueltos en `runAutonomous`, lanzar el ejecutor con `VALMEN_UNATTENDED=1` en su entorno, comprobar tras `qa-mechanical` que `## Pruebas` trae el contrato de entrega antes de pasar a `awaiting_user_tests` y registrar la fase con su duración y resultado; hacer lo mismo con la fase de análisis y plan en `packages/engine/src/journey-preparation.ts`.
  4. En `packages/engine/src/journey-dispatch.ts` y `packages/engine/src/journey-advance.ts` resolver el modelo de la fase con `modeloDeFase` y pasarlo al ejecutor; actualizar la ayuda de `journey advance`.
  5. Crear `tests/jornada-ejecucion.test.ts` con: un ticket `approved` llega a `awaiting_user_tests` con el recibo de `qa-mechanical` y el contrato de pruebas escrito, un ejecutor que no lo escribe falla la verificación, el ejecutor corre con `VALMEN_UNATTENDED`, cada fase usa su modelo (barato en preparación y fuerte en implementación) y queda su registro, un rol de otro proveedor cae al modelo de la política y el registro por fase lo guarda en `origenDelModelo` con el motivo, y los presets traen los cuatro roles; ajustar las pruebas de enrutamiento e interfaz que cuentan roles; correr esas pruebas, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; los roles nuevos son aditivos, un `routing.yaml` sin ellos resuelve por preset y el registro por fase es un archivo que nada más lee todavía.

## Criterios de aceptación

- [x] Un ticket `approved` dentro de la jornada llega a `awaiting_user_tests` con el recibo de `qa-mechanical` y el contrato de pruebas escrito
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -->
- [x] Si el ejecutor no deja escrito el contrato de pruebas, la verificación falla y el ticket no pasa a `awaiting_user_tests`
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -->
- [x] El ejecutor de cada fase corre con `VALMEN_UNATTENDED`
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -->
- [x] El enrutamiento declara roles para análisis, plan, implementación y verificación y cada sesión usa el modelo de su fase
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -->
- [x] Un rol de otro proveedor que el ejecutor cae al modelo de la política y el registro por fase lo guarda en su campo de origen del modelo
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -->
- [x] Cada sesión deja un registro por fase con ticket, modelo, esfuerzo, duración y resultado
      <!-- test: npx vitest run tests/jornada-ejecucion.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-ENGINE-JORNADA-EJECUCION-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/adapter/src/routing.ts",
      "packages/engine/src/journey-phases.ts",
      "packages/engine/src/autonomous-run.ts",
      "packages/engine/src/journey-dispatch.ts",
      "packages/engine/src/journey-preparation.ts",
      "packages/engine/src/index.ts",
      "tests/jornada-ejecucion.test.ts",
      "tests/routing.test.ts",
      "tests/autonomous-run.test.ts",
      "tests/journey-dispatch.test.ts",
      "tests/avance-jornada.test.ts",
      "tests/helpers/fixtures.ts"
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

- `packages/adapter/src/routing.ts`: cuatro roles de fase (`agent-analysis`, `agent-plan`, `agent-implementation`, `agent-verification`) en `ROLES` y en los cuatro presets (modelo económico donde repite, fuerte donde decide); `FASES_DEL_AGENTE` y `modeloDeFase`, que usa el modelo del rol solo si su proveedor es el del ejecutor y, si no, cae al de la política con el motivo.
- `packages/engine/src/journey-phases.ts` (nuevo): `registrarFase` / `leerFases` sobre `.valmen/journeys/fases.jsonl` (ticket, fase, ejecutor, modelo, esfuerzo, `origenDelModelo`, duración y resultado) y `resolverModeloDeFase`.
- `packages/engine/src/autonomous-run.ts`: `runAutonomous` acepta la fase y el modelo, lanza el ejecutor con `VALMEN_UNATTENDED=1`, comprueba en código que `## Pruebas` trae el contrato de entrega (`contratoDePruebasEscrito`) antes de pasar a `awaiting_user_tests` y registra la sesión por fase. `journey-dispatch.ts` resuelve el modelo de implementación; `journey-preparation.ts` el de análisis y registra su sesión.
- Pruebas: `tests/jornada-ejecucion.test.ts` (nuevo, 8); fixtures con la opción `pruebas`; `tests/routing.test.ts` con los roles nuevos; los fixtures de `autonomous-run`, `journey-dispatch` y `avance-jornada` llevan el contrato de pruebas, como debe entregarlo un ejecutor real.
- Alcance real, dicho sin adornos: el despacho usa hoy `agent-analysis` (preparación) y `agent-implementation` (ejecución). `agent-plan` y `agent-verification` están declarados en el enrutamiento y en los presets pero todavía no tienen sesión propia: la preparación es una sola sesión por ticket (R-JORN-003); se usarán cuando esas fases se separen. El costo en dólares por fase lo une el parte diario por la referencia de sesión; aquí no se inventa un número.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red y sin lanzar ningún agente:

1. `npx vitest run tests/jornada-ejecucion.test.ts` — esperado: 8 pruebas pasan.
2. `npx vitest run tests/routing.test.ts tests/autonomous-run.test.ts tests/journey-dispatch.test.ts tests/avance-jornada.test.ts` — esperado: todas pasan.
3. `npx vitest run` — esperado: 176 archivos pasan y 1 omitido; 2565 pruebas pasan, 0 fallan.
4. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los cuatro dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run (2565 pasan), tsc sin errores

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:4356bbe499cb0a7fb63e29f0c8807542507c1e7c",
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
    "description": "npx vitest run (2565 pasan), tsc sin errores",
    "reference": "worktree:sha256:0624d57a5ccd6e5551595be5793d739e52a40419af15eb081193f0b14fa9a5dc",
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
    "technical_summary": "Roles de fase en el enrutamiento, modelo por fase en el despacho, ejecutor desatendido, contrato de pruebas verificado y registro por fase.",
    "functional_summary": "Cada ticket llega a las pruebas con su contrato escrito y cada sesión usa el modelo de su fase, con su registro.",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "ninguno"
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
    "date": "2026-10-05",
    "at": "2026-10-06T01:51:50.813Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T03:38:13.886Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T03:38:27.328Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T03:40:08.495Z",
    "action": "plan-approved",
    "actor": "cli",
    "details": "{\"actor\":\"Juan Andrade\",\"source\":\"delegacion\",\"quote\":\"Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06\",\"planHash\":\"sha256:84ee272a2794da4388d57b11e725495f3fda78e479d8b62717014ed939a7bb92\"}"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T03:40:08.631Z",
    "action": "plan-approval-verified",
    "actor": "cli",
    "details": "Aprobación del plan vigente: Juan Andrade (fuente delegacion), plan sha256:84ee272a2794da4388d57b11e725495f3fda78e479d8b62717014ed939a7bb92."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T03:40:08.631Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T03:40:08.716Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T03:44:46.448Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T03:44:46.589Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T03:44:46.680Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T03:44:46.769Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T03:44:46.854Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T03:44:46.940Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T03:44:47.171Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T03:44:47.441Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T03:44:47.524Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T03:44:47.606Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T03:44:47.690Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T03:44:47.776Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T03:44:47.857Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T03:44:47.940Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-06",
    "at": "2026-10-07T03:44:48.021Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
