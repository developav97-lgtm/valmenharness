---
schema_version: 2
id: BUGFIX-GATECOMMAND-FALLOS-ENTORNO-20261005
title: Distinguir fallas del entorno de pruebas fallidas y guardar la cola de la salida
type: BUGFIX
module: GATECOMMAND
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

# BUGFIX-GATECOMMAND-FALLOS-ENTORNO-20261005

## Solicitud original

Parte del sprint: Compuertas sin defectos: lector de criterios, contradicción descriptiva, firma, motivos, fallas del entorno, preparación del ambiente y no repetir sobre el mismo estado.
- R-CDEF-006: La compuerta mecánica DEBE distinguir un comando que no llegó a probar de una prueba que falló
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

Vector real para el análisis (no es una decisión pendiente): BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004
(commit `a0ea22d`) hizo que `transition()` exija una decisión humana al entrar a `planned` y
`approved` con la compuerta en `block` o `review`, y dejó **fuera** a `qa-mechanical` a propósito:
un comando que falló es un hecho y no una opinión, así que `withHumanDecision` no admite decisión
sobre su `block`. Pero este ticket (R-CDEF-006) va a producir un `review` de `qa-mechanical` para la
falla del entorno, y hoy `exigirVerificacionMecanica` (`packages/engine/src/transition.ts`) solo
rechaza el `block`: un `review` sin firma dejaría pasar `in_progress → awaiting_user_tests`, es decir,
entregar a la persona trabajo que no llegó a probarse. Lo que el análisis tiene que decidir: que la
entrega con un `review` mecánico exija la decisión humana registrada (el recibo `review` ya admite
la decisión por `valmen gate-decide`, porque `buildReceipt` lo escala), con el mismo mensaje y la
misma constancia en el ticket que ya existen: `veredictoDeCompuerta` y `describirDecisionHumana`
(`packages/engine/src/receipts.ts`) y `eventosPrevios` (`packages/engine/src/mutate.ts`). La prueba
`R-CDEF-004 compuerta mecánica` (`tests/firma-de-compuerta.test.ts`) fija el límite actual.

## Descripción funcional

- Alcance: la verificación mecánica de criterios (`qa-mechanical`): cómo se clasifica el resultado de un comando de pruebas y qué guarda el recibo de su salida. Fuera de alcance: la preparación del ambiente de pruebas (otro ticket), los umbrales y los checks fijos de otras compuertas.
- Usuario o rol afectado: el agente que entrega un ticket y la persona que lee el recibo para saber si algo falló de verdad.
- Comportamiento actual: un comando que sale con código distinto del esperado cuenta como proposición falsa y bloquea, aunque no haya ejecutado ninguna prueba (base de datos de pruebas ya existente, conexión rechazada); un comando inexistente o con tiempo agotado lanza un error que detiene todo el gate; el recibo guarda los primeros 2000 caracteres de cada flujo, donde casi nunca está el resumen de la suite, y no guarda ningún hash de la salida completa.
- Comportamiento esperado: un comando de criterio que termina sin haber ejecutado pruebas se clasifica como falla del entorno y la compuerta devuelve `review` con un mensaje que lo dice; una prueba que corrió y falló sigue bloqueando; el recibo guarda la cola de la salida (donde está el resumen) y el sha256 de la salida completa.

## Diagnóstico

- Archivos y flujo investigados: `packages/gate-command/src/command.ts`: `runCommandCheck` traduce el código de salida a `passed` y corta la salida con `stdout.slice(0, MAX_CAPTURED_OUTPUT)` (el comienzo); lanza `CommandError` para ENOENT y tiempo agotado; `evaluateWithCommands` convierte `passed` en 1 o 0 y manda los `CommandError` a `failures`. `packages/engine/src/evaluators.ts:239` convierte cualquier `failures` en `NoEvaluatorError`. Los checks de criterios los genera `commandChecksFor` (`packages/gate/src/dynamic.ts:266`) con ids `criterio_NN`. El recibo copia `commandResults` (`packages/engine/src/gate.ts:662`, tipo `CommandResultRecord` en `packages/gate/src/receipt.ts:85`).
- Causa raíz o hipótesis: el evaluador no distingue «el comando probó y falló» de «el comando no llegó a probar»: ambos son exit distinto de cero. Además se guarda el comienzo de la salida, no el final.
- Riesgos y compatibilidad: la clasificación solo se aplica a checks cuyo id empieza por `criterio_`; los checks fijos de otras compuertas y sus pruebas actuales (comando inexistente → error) no cambian. Una prueba que corrió se reconoce por el resumen del runner conocido (vitest, jest, Django, pytest, Karma); un comando de otro programa no se clasifica por resumen, solo por los mensajes de entorno. Los campos nuevos del recibo son opcionales y los recibos viejos siguen siendo válidos. Una compuerta promovida a automática convierte `review` en `block` por su propia regla: no cambia.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: `command.ts` del evaluador por comando, `evaluators.ts` y el informe de la compuerta del motor, y el tipo del recibo. Exclusiones: preparación del ambiente, umbrales y checks fijos.
- Pasos ordenados:
  1. En `command.ts` del evaluador por comando, agregar `classifyEnvironmentFailure` (función pura que recibe la línea de comando, el código esperado y obtenido y la salida completa) con la tabla de runners conocidos y sus resúmenes, y los mensajes de entorno: base de datos ya existente, conexión rechazada y comando no encontrado.
  2. En `runCommandCheck`, calcular el sha256 de cada flujo completo, guardar la cola de 2000 caracteres en vez del comienzo y devolver `environmentFailure` cuando corresponda; agregar los campos opcionales a `CommandCheckResult`.
  3. En `evaluateWithCommands`, para ids `criterio_NN`: convertir un `CommandError` (comando inexistente o tiempo agotado) y un resultado con falla del entorno en una respuesta de valor 0.5 con su motivo, sin pasar por `failures`; los demás ids conservan el comportamiento actual.
  4. En el informe de la compuerta del motor, anteponer «falla del entorno» al motivo cuando hay fallas del entorno y el resultado es `review`, anotarlas en `notes` del recibo y mostrarlas junto a cada comando; agregar los campos opcionales a `CommandResultRecord` en `receipt.ts`.
  5. Crear `tests/comando-fallo-entorno.test.ts` con la base ya existente, comando inexistente, tiempo agotado, la prueba que corrió y falló (sigue bloqueando), el resumen al final de 40 KB con el sha256 de la salida completa, y la compatibilidad de un check fijo; correr `npx vitest run` completo y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; los campos nuevos son opcionales y no hay datos que migrar.

## Criterios de aceptación

- [x] Un comando de criterio que termina con «database already exists» sin ejecutar pruebas se clasifica como falla del entorno y responde con valor de banda de revisión, no de bloqueo
      <!-- test: npx vitest run tests/comando-fallo-entorno.test.ts -->
- [x] Un comando inexistente o con tiempo agotado en un criterio se clasifica como falla del entorno sin detener la compuerta
      <!-- test: npx vitest run tests/comando-fallo-entorno.test.ts -->
- [x] Una prueba que corrió y falló, con el resumen del runner en la salida, sigue respondiendo con valor de bloqueo
      <!-- test: npx vitest run tests/comando-fallo-entorno.test.ts -->
- [x] El recibo guarda la cola de la salida, con el resumen de una suite de 40 KB, y el sha256 de la salida completa
      <!-- test: npx vitest run tests/comando-fallo-entorno.test.ts -->
- [x] Un check de una proposición que no es un criterio conserva su comportamiento anterior
      <!-- test: npx vitest run tests/evaluators.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de BUGFIX-GATECOMMAND-FALLOS-ENTORNO-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/gate-command/src/command.ts",
      "packages/engine/src/gate.ts",
      "packages/gate/src/receipt.ts",
      "tests/comando-fallo-entorno.test.ts"
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

`packages/gate-command/src/command.ts`: `classifyEnvironmentFailure` (función pura) con la tabla de runners conocidos (vitest, jest, Django, pytest, Karma) y los mensajes de entorno (base de datos ya existente, conexión rechazada, comando no encontrado); `runCommandCheck` clasifica sobre la salida completa, guarda la **cola** de 2000 caracteres (`tailOf`) y el sha256 y los bytes de cada flujo completo; `evaluateWithCommands` responde con 0.5 —banda de revisión— a un criterio (`criterio_NN`) con falla del entorno, incluidos el comando inexistente y el tiempo agotado, sin pasar por `failures`; los checks que no son de criterios conservan su comportamiento. `packages/engine/src/gate.ts`: el motivo del `review` empieza por «falla del entorno», el recibo anota cada una en `notes` y el informe la muestra junto al comando. `packages/gate/src/receipt.ts`: campos opcionales en `CommandResultRecord`. Pruebas nuevas: `tests/comando-fallo-entorno.test.ts` (12).

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/comando-fallo-entorno.test.ts` — esperado: 12 pruebas pasan.
2. `npx vitest run tests/evaluators.test.ts` — esperado: 37 pruebas pasan (los checks que no son de criterios no cambian).
3. `npx vitest run` — esperado: 149 archivos pasan y 1 omitido; 2303 pruebas pasan, 0 fallan.
4. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los cuatro comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run: 2303 pruebas pasan y 0 fallan

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:d370947d6cbe906b7568ddca38a867a239e53c64",
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
    "description": "npx vitest run: 2303 pruebas pasan y 0 fallan",
    "reference": "worktree:sha256:3c37984d1ab8b7be85ecb6a45a29d4b2805e8baf561a6c065144406a94494070",
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
    "technical_summary": "classifyEnvironmentFailure en gate-command, cola de la salida con sha256, criterios con falla del entorno responden 0.5 y el informe lo dice; 12 pruebas nuevas",
    "functional_summary": "Un comando de pruebas que no llegó a ejecutar nada (base ya creada, conexión rechazada, comando inexistente, tiempo agotado, sin resumen del runner) deja la compuerta en revisión y no en bloqueo, y el recibo conserva el final de la salida",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: cambio interno del evaluador por comando, sin migración ni despliegue"
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
    "at": "2026-10-06T01:51:49.192Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T00:33:23.993Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T00:33:39.700Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Claude Code por delegación del PO (recibo GR-20261007-BUGFIX-GATECOMMAND-FALLOS-ENTORNO-20261005-analysis-1, canal delegation, decidida 2026-10-07T00:33:39.698Z): por delegación DEL-20261006-001 del PO Juan Andrade: El criterio dice que una banda de revisión por proposición de contexto no debe bloquear el avance — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T00:33:39.819Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T00:34:20.422Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T00:34:20.539Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T00:36:05.996Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T00:36:06.089Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T00:36:06.172Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T00:36:06.252Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T00:36:06.327Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T00:36:06.404Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T00:36:06.528Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T00:36:06.679Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T00:36:06.755Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T00:36:06.830Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T00:36:06.901Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T00:36:06.977Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T00:36:07.052Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T00:36:07.127Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T00:36:07.203Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
