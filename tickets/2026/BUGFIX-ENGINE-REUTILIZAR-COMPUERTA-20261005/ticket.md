---
schema_version: 2
id: BUGFIX-ENGINE-REUTILIZAR-COMPUERTA-20261005
title: Rechazar una compuerta repetida sobre el mismo estado del ticket
type: BUGFIX
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

# BUGFIX-ENGINE-REUTILIZAR-COMPUERTA-20261005

## Solicitud original

Parte del sprint: Compuertas sin defectos: lector de criterios, contradicción descriptiva, firma, motivos, fallas del entorno, preparación del ambiente y no repetir sobre el mismo estado.
- R-CDEF-008: Una compuerta NO DEBE volver a evaluarse sobre el mismo estado del ticket
Depende de: FEATURE-GATE-MOTIVOS-RECIBO-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: `valmen gate` / `evaluar_compuerta` cuando se pide evaluar una compuerta que ya se evaluó con un modelo sobre el mismo estado del ticket y con la misma configuración del evaluador. Fuera de alcance: umbrales, el contenido de las proposiciones y las compuertas que decide el código sin modelo.
- Usuario o rol afectado: el agente que, tras un BLOCK o una REVIEW, vuelve a pedir la compuerta sin haber cambiado el ticket «a ver si sale otro número», y quien paga esas llamadas.
- Comportamiento actual: cada petición llama al modelo y anexa un recibo nuevo, aunque el estado del ticket y el evaluador sean idénticos al recibo anterior; un resultado cerca de un umbral se «persigue» repitiendo hasta que cae del lado deseado, y cada repetición cuesta una llamada.
- Comportamiento esperado: si el último recibo vigente de la compuerta tiene el mismo `stateHash` y la misma configuración de evaluador, la nueva corrida se rechaza sin llamar al modelo y remite a ese recibo, indicando que se cambie el ticket o se dé un motivo; con un motivo explícito se puede forzar, y el motivo queda escrito en el recibo nuevo.

## Diagnóstico

- Archivos y flujo investigados: `runGate` en `packages/engine/src/gate.ts` construye el estado (`buildGateState`), evalúa y escribe el recibo con `buildReceipt` (`packages/gate/src/receipt.ts`), que ya guarda `stateHash` pero no la configuración del evaluador; los recibos vigentes se leen con `readReceipts` y `currentReceipts` (`packages/engine/src/receipts.ts`). `transition` ya compara `stateHash` contra el ticket actual en `packages/engine/src/transition.ts` (`exigirVerificacionMecanica`). El CLI arma las opciones en `runGateFromFlags` (`packages/cli/src/main.ts`) y el MCP en `correrCompuerta` (`packages/mcp/src/tools.ts`).
- Causa raíz o hipótesis: nada impide repetir una evaluación idéntica; el motor no compara la petición con el recibo anterior ni registra con qué configuración de evaluador se produjo.
- Riesgos y compatibilidad: la regla solo se aplica cuando el recibo anterior lo produjo un modelo (`model` no nulo): una compuerta que decide el código —la mecánica— depende de un ambiente que el hash del ticket no ve, y volver a correrla tras arreglar el entorno es legítimo. Los recibos anteriores a este cambio no traen la configuración del evaluador y no bloquean ninguna repetición. El rechazo no es un veredicto: no escribe recibo ni cambia el estado. Forzar exige un motivo no vacío y lo deja en el recibo nuevo junto al recibo que se repite.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: la comprobación previa a evaluar, la huella de configuración del evaluador en el recibo, y el motivo de forzado en CLI, MCP y recibo, con pruebas. Exclusiones: umbrales, proposiciones y las compuertas decididas por código.
- Pasos ordenados:
  1. En `receipt.ts` del paquete de compuertas, agregar al recibo y a la entrada de `buildReceipt` los campos opcionales `evaluatorKey` (huella de la configuración del evaluador) y `forced` (motivo y recibo que se repite), y exportar una función que calcula la huella como sha256 de un JSON estable con evaluador, modelo, proveedor, esfuerzo, modelo del juez, evaluador semántico y los modelos de la cascada.
  2. En la compuerta del motor, antes de evaluar y sobre el estado ya construido, localizar el último recibo vigente de esa compuerta; si tiene el mismo `stateHash` y la misma huella y fue producido por un modelo, devolver un rechazo con código de invariante que cita el id del recibo y dice que hay que cambiar el ticket o pasar un motivo; no llamar al evaluador ni escribir recibo.
  3. Agregar la opción `forceReason` a las opciones de la compuerta: con un motivo no vacío se omite el rechazo, y el recibo nuevo guarda `forced` con el motivo y el id del recibo repetido; un motivo vacío o de solo espacios no fuerza.
  4. Guardar `evaluatorKey` en todos los recibos nuevos, y mostrar el motivo de forzado en el informe.
  5. En `main.ts` del CLI, agregar la bandera `--force-reason` a `valmen gate` (ayuda y lista de banderas con valor) y pasarla a la compuerta; en `tools.ts` del MCP agregar el parámetro `forzar` a `evaluar_compuerta` y pasarlo.
  6. Crear `tests/compuerta-repetida.test.ts` con un juez simulado que cuenta llamadas: la repetición idéntica se rechaza sin llamar al juez y cita el recibo; cambiar el ticket, cambiar la configuración del evaluador o usar la compuerta mecánica permiten evaluar; forzar con motivo evalúa y deja el motivo en el recibo; un motivo vacío no fuerza; un recibo anterior sin huella no bloquea. Correr `npx vitest run` sobre ese archivo, la suite completa y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; los campos del recibo son opcionales y sin ellos la compuerta se comporta como antes.

## Criterios de aceptación

- [x] Pedir una compuerta evaluada por un modelo sobre el mismo estado y con la misma configuración del evaluador se rechaza sin llamar al modelo y remite al recibo existente
      <!-- test: npx vitest run tests/compuerta-repetida.test.ts -->
- [x] El rechazo no escribe ningún recibo nuevo
      <!-- test: npx vitest run tests/compuerta-repetida.test.ts -->
- [x] Cambiar el ticket o cambiar la configuración del evaluador permite evaluar de nuevo
      <!-- test: npx vitest run tests/compuerta-repetida.test.ts -->
- [x] Con un motivo explícito se puede forzar, y el motivo y el recibo repetido quedan escritos en el recibo nuevo
      <!-- test: npx vitest run tests/compuerta-repetida.test.ts -->
- [x] Un motivo vacío no fuerza la repetición
      <!-- test: npx vitest run tests/compuerta-repetida.test.ts -->
- [x] La compuerta mecánica, que decide el código, puede volver a correrse sobre el mismo estado
      <!-- test: npx vitest run tests/compuerta-repetida.test.ts -->
- [x] Un recibo anterior sin huella de evaluador no bloquea una nueva evaluación
      <!-- test: npx vitest run tests/compuerta-repetida.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de BUGFIX-ENGINE-REUTILIZAR-COMPUERTA-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/gate/src/receipt.ts",
      "packages/engine/src/gate.ts",
      "packages/cli/src/main.ts",
      "packages/mcp/src/tools.ts",
      "packages/server/src/gates.ts",
      "tests/compuerta-repetida.test.ts",
      "tests/receipt-identity.test.ts",
      "tests/gate-command.test.ts",
      "tests/gate-view.test.ts"
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

`packages/gate/src/receipt.ts`: el recibo gana `evaluator`, `evaluatorKey` (huella sha256 de la configuración del evaluador: evaluador pedido, modelo, proveedor, esfuerzo, modelo del juez, semántico y cadena de la cascada, vía `hashEvaluatorConfig`) y `forced` (motivo y recibo repetido). `packages/engine/src/gate.ts`: antes de evaluar, `runGate` busca el último recibo vigente de la compuerta; si tiene el mismo `stateHash`, la misma huella y lo produjo un evaluador distinto de `command`, devuelve un rechazo (código 3) que cita el recibo y pide cambiar el ticket o dar un motivo, sin llamar al modelo ni escribir recibo; con `forceReason` no vacío evalúa y guarda `forced` en el recibo nuevo, y el informe lo muestra. CLI: bandera `--force-reason` en `valmen gate`; MCP: parámetro `forzar` de `evaluar_compuerta` (con `correrCompuerta` compartida); servidor: `GateRunRequest.forceReason` pasa al motor. La compuerta mecánica (decidida por código) y los recibos sin huella no se bloquean. Cuatro pruebas existentes que repetían una evaluación idéntica ahora pasan `forceReason` (`receipt-identity`, `gate-command`, `gate-view`). Pruebas nuevas: `tests/compuerta-repetida.test.ts` (7).

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/compuerta-repetida.test.ts` — esperado: 7 pruebas pasan.
2. `npx vitest run` — esperado: 152 archivos pasan y 1 omitido; 2331 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run: 2331 pruebas pasan y 0 fallan

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:fab75fe9e02bee0dce137032be105fb6698ea3a9",
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
    "description": "npx vitest run: 2331 pruebas pasan y 0 fallan",
    "reference": "worktree:sha256:c1740538d1440942dbcfb6715268ad09c453a884b00e77a1e1bf8630a748ad90",
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
    "technical_summary": "Huella del evaluador y rechazo de la repetición idéntica antes de llamar al modelo; --force-reason y forzar guardan el motivo en el recibo; 7 pruebas nuevas y 4 adaptadas",
    "functional_summary": "Pedir otra vez una compuerta sobre el mismo estado y con el mismo evaluador se rechaza sin gastar una llamada y remite al recibo; con un motivo explícito se puede forzar",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: cambio interno del motor de compuertas, sin migración ni despliegue"
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
    "at": "2026-10-06T01:51:49.263Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T00:43:47.749Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T00:44:04.506Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T00:44:24.190Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T00:44:24.308Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T00:47:53.764Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T00:47:53.894Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T00:47:53.974Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T00:47:54.051Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T00:47:54.126Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T00:47:54.200Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T00:47:54.383Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T00:47:54.601Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T00:47:54.677Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T00:47:54.751Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T00:47:54.827Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T00:47:54.902Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T00:47:54.976Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T00:47:55.053Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T00:47:55.127Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
