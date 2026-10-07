---
schema_version: 2
id: FEATURE-GATE-MOTIVOS-RECIBO-20261005
title: Guardar en el recibo el motivo de cada respuesta del evaluador
type: FEATURE
module: GATE
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

# FEATURE-GATE-MOTIVOS-RECIBO-20261005

## Solicitud original

Parte del sprint: Compuertas sin defectos: lector de criterios, contradicción descriptiva, firma, motivos, fallas del entorno, preparación del ambiente y no repetir sobre el mismo estado.
- R-CDEF-005: El recibo de una compuerta DEBE guardar el motivo de cada respuesta del evaluador
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el recibo de una compuerta y la respuesta del juez de chat. Fuera de alcance: cambiar qué decide la compuerta, los umbrales o el formato del resto del recibo.
- Usuario o rol afectado: quien audita o calibra una compuerta leyendo `.valmen/receipts/` y necesita saber por qué el evaluador respondió lo que respondió.
- Comportamiento actual: el juez de chat pide un `reason` por proposición en su esquema de salida, pero `evaluateWithJudge` lo descarta al armar `PropositionAnswer`; `modelAnswers` del recibo guarda solo el valor y la confianza, así que un valor bajo en un recibo no dice por qué.
- Comportamiento esperado: cada entrada de `modelAnswers` conserva el `reason` que devolvió el evaluador; cuando no lo devuelve (evaluador determinista o por comando) el campo queda en `null`, para distinguir «no lo dio» de «se perdió».

## Diagnóstico

- Archivos y flujo investigados: `packages/gate-llm-judge/src/judge.ts:123` y `:143` declaran `reason` como obligatorio en el esquema; en `judge.ts` (construcción de `answers`, tras `faltantes`) la respuesta del modelo se tipa sin `reason` y `PropositionAnswer` (`packages/gate/src/decide.ts:268`) no tiene el campo. `buildReceipt` (`packages/gate/src/receipt.ts`, `modelAnswers: input.answers`) copia las respuestas tal cual. La cascada (`packages/engine/src/cascade.ts`) produce y escala con `evaluateWithJudge`, así que hereda el cambio sin tocarla.
- Causa raíz o hipótesis: el motivo se pide al modelo y se pierde en la conversión a `PropositionAnswer`; no hay donde guardarlo.
- Riesgos y compatibilidad: el campo es opcional en el tipo, así que los evaluadores existentes compilan; `buildReceipt` lo normaliza a `null` cuando falta. Los recibos ya escritos no se reescriben (append-only) y siguen leyéndose: un `modelAnswers` sin `reason` en un recibo viejo es válido. El motivo es texto del modelo y puede ser largo: se guarda recortado a 500 caracteres. No cambia ninguna decisión ni el hash de estado.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: tipo `PropositionAnswer`, `evaluateWithJudge` y `buildReceipt`, con sus pruebas. Exclusiones: umbrales, la decisión de las compuertas y los recibos ya emitidos.
- Pasos ordenados:
  1. En `decide.ts` del paquete de compuertas, agregar `readonly reason?: string | null` a la interfaz `PropositionAnswer`, con un comentario que diga que `null` significa «el evaluador no lo dio».
  2. En `judge.ts` del juez de chat, leer `reason` de cada respuesta del modelo, recortarlo a 500 caracteres y devolverlo en la respuesta `choice` y en la `noul`; si no es texto, devolver `null`.
  3. En `receipt.ts`, dentro de `buildReceipt`, mapear `modelAnswers` para que cada entrada lleve `reason` explícito: el recibido o `null`.
  4. Crear `tests/recibo-motivos.test.ts` con un juez simulado que devuelve motivos para una proposición `noul` y una `choice`, y una respuesta sin motivo: el recibo conserva los dos motivos y deja `null` en la que no lo trae.
  5. Correr `npx vitest run tests/recibo-motivos.test.ts`, después la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; el cambio agrega un campo opcional y no toca datos existentes.

## Criterios de aceptación

- [x] Cada entrada de `modelAnswers` del recibo conserva el `reason` que devolvió el juez de chat, tanto en proposiciones booleanas como de elección
      <!-- test: npx vitest run tests/recibo-motivos.test.ts -->
- [x] Cuando el evaluador no devuelve motivo, la entrada queda con `reason: null` y no sin el campo
      <!-- test: npx vitest run tests/recibo-motivos.test.ts -->
- [x] El motivo se recorta a 500 caracteres
      <!-- test: npx vitest run tests/recibo-motivos.test.ts -->
- [x] La decisión de la compuerta no cambia por guardar el motivo
      <!-- test: npx vitest run tests/gate-decide.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-GATE-MOTIVOS-RECIBO-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/gate/src/decide.ts",
      "packages/gate/src/receipt.ts",
      "packages/gate-llm-judge/src/judge.ts",
      "tests/recibo-motivos.test.ts",
      "tests/evaluators.test.ts"
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

`PropositionAnswer` (`packages/gate/src/decide.ts`) gana `reason?: string | null`. `evaluateWithJudge` (`packages/gate-llm-judge/src/judge.ts`) lee el `reason` de cada respuesta del modelo, lo recorta a `MOTIVO_MAX` (500 caracteres) y lo devuelve en las respuestas booleanas y de elección; si falta, está vacío o no es texto, devuelve `null`. `buildReceipt` (`packages/gate/src/receipt.ts`) normaliza `modelAnswers` para que cada entrada lleve `reason` explícito (`null` cuando el evaluador no lo dio). La cascada hereda el cambio sin tocarla porque produce y escala con `evaluateWithJudge`. Pruebas nuevas en `tests/recibo-motivos.test.ts` (5) y el valor esperado de `tests/evaluators.test.ts` ahora incluye el motivo.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/recibo-motivos.test.ts` — esperado: 5 pruebas pasan.
2. `npx vitest run` — esperado: 148 archivos pasan y 1 omitido; 2291 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run: 2291 pruebas pasan y 0 fallan

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:f420148621f79066bdad21799e4802d4ad63da3d",
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
    "description": "npx vitest run: 2291 pruebas pasan y 0 fallan",
    "reference": "worktree:sha256:c95ae615b6b76e6af2d424502bf8e2d48d14e79f77b970374eb2ac805a3f9bb3",
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
    "technical_summary": "PropositionAnswer.reason, evaluateWithJudge conserva y recorta el motivo, buildReceipt lo normaliza a null; 5 pruebas nuevas",
    "functional_summary": "El recibo de una compuerta dice por qué el evaluador respondió cada proposición, o deja null si no lo dio",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: cambio interno del recibo, sin migración ni despliegue"
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
    "at": "2026-10-06T01:51:49.123Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T00:29:43.642Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T00:30:00.520Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T00:30:25.414Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T00:30:25.543Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T00:31:52.852Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T00:31:52.944Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T00:31:53.023Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T00:31:53.104Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T00:31:53.180Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T00:31:53.256Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T00:31:53.390Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T00:31:53.556Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T00:31:53.630Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T00:31:53.701Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T00:31:53.775Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T00:31:53.849Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T00:31:53.922Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T00:31:53.994Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T00:31:54.067Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
