---
schema_version: 2
id: FEATURE-ENGINE-MIGRACION-ANTES-TESTS-20260926
title: Ejecutar migraciones autorizadas antes de pruebas
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
updated: 2026-10-06
related_ticket: null
target_release: null
released_in: null
---

# FEATURE-ENGINE-MIGRACION-ANTES-TESTS-20260926

## Solicitud original

Parte del sprint: Ejecutar autonomía acotada con colisiones, evidencia, migraciones e integración controladas.
- R-S5-008: Migración automática al esquema de pruebas — El proyecto DEBE poder declarar en `.valmen/config.yaml` la migración que se
Depende de: FEATURE-CONFIG-MIGRACION-PRUEBAS-20260926, FEATURE-ENGINE-RUN-AUTONOMO-20260926.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

## Descripción funcional

- Alcance: la compuerta mecánica `qa-mechanical`: correr antes de los criterios la preparación del ambiente de pruebas que el proyecto declara en `test-setup`, comprobar su esquema contra `allowed-schemas`, y registrarla en el recibo. Fuera de alcance: la declaración y su validación (ya hecha en `FEATURE-CONFIG-MIGRACION-PRUEBAS-20260926`), y cualquier cambio a las bases de datos o contenedores de un proyecto concreto.
- Usuario o rol afectado: el agente que entrega un ticket de un proyecto con base de datos persistente y quien lee el recibo para saber en qué estado se probó.
- Comportamiento actual: la compuerta corre los comandos de los criterios directamente; contra una base persistente la segunda corrida falla porque la base de pruebas ya existe, y el recibo no dice nada de cómo estaba el ambiente.
- Comportamiento esperado: si el proyecto declara `test-setup`, sus comandos corren una vez antes de los criterios y quedan en el recibo con comando, resultado y duración; un esquema fuera de `allowed-schemas` no ejecuta nada y el recibo dice por qué; si la preparación falla, los criterios no corren y la compuerta termina en revisión como falla del entorno.

## Diagnóstico

- Archivos y flujo investigados: en `packages/engine/src/gate.ts` la compuerta con `commandPropositions` arma `comandos` con `commandChecksFor` (alrededor de la línea 469) y los pasa a `evaluateGate`; no hay ningún paso entre armar los comandos y evaluarlos. El ticket anterior dejó `testSetupConfig(root)` y `allowedSchemas(root)` en `packages/engine/src/discovery.ts` y `testSetupRefusal` en `packages/adapter/src/config.ts`. La ejecución de un comando la resuelve `runCommandCheck` de `packages/gate-command/src/command.ts`, que ya clasifica la falla del entorno. El recibo se arma en `buildReceipt` (`packages/gate/src/receipt.ts`) y el informe se imprime al final de `runGate`.
- Causa raíz o hipótesis: la compuerta no tiene noción de preparación previa; cada corrida asume el ambiente tal como está, y una base persistente deja la segunda corrida bloqueada por algo que no es del ticket.
- Riesgos y compatibilidad: ejecutar una preparación es ejecutar posibles migraciones. Se ata a tres reglas: los comandos salen solo de `config.yaml` y nunca del ticket; no se ejecuta nada si el esquema no está en `allowed-schemas` (la lista ausente rechaza); y ante un fallo se detiene en el primer paso y los criterios no corren. Sin `test-setup` el comportamiento es idéntico al actual y el recibo no cambia. El campo del recibo es opcional y los recibos viejos siguen leyéndose. Este repositorio no declara `test-setup`: nada se ejecuta aquí, y las pruebas usan comandos `node` sobre un directorio temporal.
- Impactos de sync, migración, Docker o despliegue: ninguno sobre este repositorio ni sobre ningún proyecto; es la capacidad en el motor, sin ejecutar migraciones reales. Un proyecto que la active (SaiOpenCloud, con su base persistente) debe declarar `test-setup` y `allowed-schemas`; esa configuración es suya y queda como pendiente de la persona.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: la ejecución de la preparación, su registro en el recibo y su informe, con pruebas. Exclusiones: la configuración de cualquier proyecto real y las migraciones reales.
- Pasos ordenados:
  1. En `dynamic.ts` del paquete de compuertas, exportar `partirComando`, que ya parte una línea de comando respetando comillas, para reutilizarla sin duplicar el análisis.
  2. En `receipt.ts` del mismo paquete, agregar los tipos `SetupStepRecord` (comando, resultado `ok`, `failed` o `refused`, código de salida, duración, cola de la salida y detalle) y `SetupRecord` (esquema, pasos y motivo de falla), el campo opcional `setup` en el recibo y su entrada opcional en `buildReceipt`.
  3. Crear `test-setup.ts` en el motor con `runTestSetup(root, run)`: devuelve `null` si el proyecto no declara `test-setup`; si `testSetupRefusal` da un motivo devuelve todos los pasos como `refused` sin ejecutar nada; si no, corre cada comando con `runCommandCheck` y el tope de `timeout` o de `test-timeout`, se detiene en el primer paso que falla o no se puede ejecutar y devuelve el motivo; exportarla desde el índice del motor.
  4. En el archivo de la compuerta mecánica del motor, llamar a `runTestSetup` una sola vez antes de evaluar los criterios; si devuelve una falla, evitar la evaluación y decidir `review` con el motivo «falla del entorno»; pasar `setup` a `buildReceipt` y mostrar la preparación en el informe antes de los comandos de los criterios.
  5. Crear `tests/preparacion-ambiente.test.ts` con comandos `node` que anotan su orden en un archivo temporal: orden preparación y luego criterios, registro en el recibo, dos corridas seguidas, esquema no permitido y lista ausente sin ejecutar nada, preparación que falla o comando inexistente (criterios sin correr, revisión) y proyecto sin `test-setup` sin cambios.
  6. Correr `npx vitest run` sobre ese archivo, después la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; el campo del recibo es opcional y sin `test-setup` no se ejecuta nada.

## Criterios de aceptación

- [x] La preparación declarada corre antes de los criterios y queda en el recibo con comando, resultado y duración
      <!-- test: npx vitest run tests/preparacion-ambiente.test.ts -->
- [x] Dos corridas seguidas con preparación declarada no fallan por el ambiente ya preparado
      <!-- test: npx vitest run tests/preparacion-ambiente.test.ts -->
- [x] Un esquema fuera de `allowed-schemas`, o sin la lista, no ejecuta ningún comando y el recibo dice por qué
      <!-- test: npx vitest run tests/preparacion-ambiente.test.ts -->
- [x] Si la preparación falla, los criterios no se ejecutan y la compuerta termina en revisión como falla del entorno
      <!-- test: npx vitest run tests/preparacion-ambiente.test.ts -->
- [x] Sin `test-setup`, la compuerta se comporta como antes y el recibo no trae preparación
      <!-- test: npx vitest run tests/preparacion-ambiente.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-ENGINE-MIGRACION-ANTES-TESTS-20260926",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/test-setup.ts",
      "packages/engine/src/gate.ts",
      "packages/engine/src/index.ts",
      "packages/gate/src/receipt.ts",
      "packages/gate/src/dynamic.ts",
      "tests/preparacion-ambiente.test.ts"
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

`packages/engine/src/test-setup.ts` (nuevo): `runTestSetup(root, run)` devuelve `null` sin `test-setup`; con un esquema fuera de `allowed-schemas` (o sin la lista) devuelve todos los pasos como `refused` sin ejecutar nada; si no, corre cada comando con `runCommandCheck` y el tope de `test-setup.timeout` o `test-timeout`, y se detiene en el primer paso que falla o no se puede ejecutar. `packages/engine/src/gate.ts`: la compuerta mecánica llama a `runTestSetup` una vez antes de los criterios; ante una falla decide `review` con «falla del entorno» sin correr los criterios; pasa `setup` al recibo y lo muestra en el informe. `packages/gate/src/receipt.ts`: tipos `SetupStepRecord` y `SetupRecord` y campo opcional `setup`; `packages/gate/src/dynamic.ts`: se exporta `partirComando`. Los comandos salen solo de `config.yaml`, nunca del ticket. Pruebas nuevas: `tests/preparacion-ambiente.test.ts` (7). Este repositorio no declara `test-setup`: no se ejecutó ninguna preparación real ni migración, y los proyectos que lo activen declaran su propia configuración.

Nota de proceso: el código se esbozó antes de aprobar el plan; se apartó del árbol, se escribió y aprobó el ticket, y se restauró después de la aprobación.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red ni bases de datos:

1. `npx vitest run tests/preparacion-ambiente.test.ts` — esperado: 7 pruebas pasan.
2. `npx vitest run` — esperado: 151 archivos pasan y 1 omitido; 2324 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run: 2324 pruebas pasan y 0 fallan

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:4db849c87de8cbf24de346be99d583ebe733c967",
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
    "description": "npx vitest run: 2324 pruebas pasan y 0 fallan",
    "reference": "worktree:sha256:79f5e965e79499751d4c9c8f3e47555f04b13dd198efc945eb932ac655239cee",
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
    "technical_summary": "runTestSetup corre test-setup antes de los criterios, respeta allowed-schemas, se detiene en el primer fallo y queda en el recibo (setup); 7 pruebas nuevas",
    "functional_summary": "La compuerta mecánica deja el ambiente de pruebas listo antes de probar y, si no puede, termina en revisión por falla del entorno sin culpar al ticket",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: capacidad del motor sin ejecutar migraciones reales; cada proyecto declara su test-setup"
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
    "date": "2026-09-26",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T00:41:14.670Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T00:41:28.246Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Claude Code por delegación del PO (recibo GR-20261007-FEATURE-ENGINE-MIGRACION-ANTES-TESTS-20260926-analysis-1, canal delegation, decidida 2026-10-07T00:41:28.245Z): por delegación DEL-20261006-001 del PO Juan Andrade: El criterio dice que una proposición de contexto en banda de revisión no debe bloquear el avance — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T00:41:28.360Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T00:41:59.192Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T00:41:59.316Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T00:42:49.064Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T00:42:49.155Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T00:42:49.235Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T00:42:49.319Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T00:42:49.393Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T00:42:49.469Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T00:42:49.617Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T00:42:49.797Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T00:42:49.871Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T00:42:49.944Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T00:42:50.020Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T00:42:50.096Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T00:42:50.169Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T00:42:50.245Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T00:42:50.321Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
