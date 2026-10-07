---
schema_version: 2
id: IMPROVEMENT-GATE-DIAGNOSTICO-POR-TIPO-20261005
title: Evaluar el diagnóstico por tipo y enviar la descripción funcional al evaluador
type: IMPROVEMENT
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

# IMPROVEMENT-GATE-DIAGNOSTICO-POR-TIPO-20261005

## Solicitud original

Parte del sprint: Compuertas precisas: proposiciones por tipo, evidencia funcional, contrato de proposiciones, plantilla, revisión previa en código y calibración por evaluador.
- R-CPRE-002: El diagnóstico DEBE evaluarse con una proposición distinta para una corrección y para funcionalidad nueva
- R-CPRE-003: El estado que recibe el evaluador DEBE incluir la descripción funcional del ticket
Depende de: FEATURE-GATE-APLICABILIDAD-POR-TIPO-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la compuerta de análisis (`analysis`): qué pregunta sobre el diagnóstico según el tipo de ticket, y qué ve el evaluador del ticket. Fuera de alcance: las demás proposiciones del análisis, los umbrales, el contrato de redacción de las proposiciones (ticket `IMPROVEMENT-GATE-CONTRATO-PROPOSICIONES`) y la plantilla del ticket.
- Usuario o rol afectado: el agente que analiza una funcionalidad nueva o una mejora y recibe un BLOCK por «falta de síntoma», y quien lee el recibo.
- Comportamiento actual: toda proposición del análisis se envía a cualquier tipo de ticket, y `diagnostico_explica_el_sintoma` exige que la causa explique el síntoma reportado: una funcionalidad nueva no tiene síntoma y se evalúa contra una pregunta que no puede cumplir (`FEATURE-ADAPTER-CAPACIDADES-20261001` bloqueó cuatro veces por eso). Además el estado que recibe el evaluador no incluye la «Descripción funcional» del ticket: no sabe cuál es el comportamiento actual ni el esperado.
- Comportamiento esperado: en una corrección (BUGFIX o SECURITY) el diagnóstico se evalúa con la proposición del síntoma; en una funcionalidad nueva, una mejora o cualquier otro tipo, con una proposición que pregunta si la investigación nombra el archivo o símbolo donde falta el comportamiento esperado, sin exigir un síntoma. El estado del evaluador incluye la «Descripción funcional» del ticket, y su hash cambia si esa sección cambia.

## Diagnóstico

- Archivos y flujo investigados: `ANALYSIS_GATE` en `packages/gate/src/definitions.ts:187` declara `diagnostico_explica_el_sintoma` (peso 3) sin aplicabilidad; el ticket anterior dejó `appliesTo` y el filtro en código (`partitionByApplicability`, usado por `runGate` en `packages/engine/src/gate.ts`). La regla de degradación por contradicción (`IsolatedBlockReviewRule` en `packages/gate/src/decide.ts`, `isIsolatedBlockContradiction`) solo reconoce un `blockingId`. `buildGateState` en `packages/engine/src/state.ts:20` arma el estado con solicitud, investigación, plan y criterios pero no con `sections["Descripción funcional"]`.
- Causa raíz o hipótesis: la pregunta del síntoma se escribió para correcciones y se aplica a todo; y el estado omite la sección donde el ticket declara su comportamiento actual y esperado, justo lo que permite juzgar una funcionalidad sin síntoma.
- Riesgos y compatibilidad: agregar un campo a `buildGateState` cambia el `stateHash` de todos los tickets: un recibo `qa-mechanical` anterior a este cambio sobre un ticket que aún no avanzó se considerará anterior al último cambio y habrá que volver a correr la compuerta (una sola vez); los recibos ya escritos no se reescriben. La regla de contradicción debe cubrir también la proposición nueva para que un bloqueo aislado de ella se degrade igual que el del síntoma: se agrega un campo opcional que lista identificadores adicionales, sin cambiar la regla ni sus condiciones. Qué tipos cuentan como corrección es una decisión de este ticket: BUGFIX y SECURITY (una vulnerabilidad tiene un comportamiento defectuoso que explicar); el resto no tiene síntoma.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: las proposiciones del diagnóstico por tipo, el estado del evaluador y la extensión mínima de la regla de contradicción, con pruebas. Exclusiones: las otras proposiciones, los umbrales y la plantilla del ticket.
- Pasos ordenados:
  1. En `definitions.ts` del paquete de compuertas, declarar `appliesTo: ["BUGFIX", "SECURITY"]` en `diagnostico_explica_el_sintoma` y agregar `diagnostico_ubica_el_cambio` (peso 3, con descripción, instrucciones y criterios de sí y de no) aplicable a los demás tipos del contrato, que pregunta si la investigación nombra el archivo o símbolo donde falta el comportamiento esperado de la descripción funcional, sin exigir un síntoma.
  2. En `decide.ts` del mismo paquete, agregar a `IsolatedBlockReviewRule` el campo opcional `alsoBlockingIds`, y hacer que `isIsolatedBlockContradiction` acepte como bloqueo aislado el `blockingId` o cualquiera de esos; declararlo en la regla del análisis con la proposición nueva.
  3. En `state.ts` del motor, agregar `descripcion_funcional` (la sección «Descripción funcional» recortada) al resultado de `buildGateState`.
  4. Crear `tests/diagnostico-por-tipo.test.ts`: sobre un FEATURE el evaluador no recibe la proposición del síntoma y sí la nueva, y un bloqueo aislado de la nueva se degrada a revisión; sobre un BUGFIX ocurre lo contrario; el estado contiene la descripción funcional y su hash cambia al cambiarla; un caso de control con la causa baja sigue bloqueando.
  5. Correr la suite completa con `npx vitest run`, ajustar solo las pruebas que fijaban el estado anterior, y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; no hay datos que migrar, y los recibos ya escritos siguen siendo válidos.

## Criterios de aceptación

- [x] Sobre un ticket FEATURE el evaluador no recibe la proposición del síntoma y sí la que pide nombrar dónde falta el comportamiento esperado
      <!-- test: npx vitest run tests/diagnostico-por-tipo.test.ts -->
- [x] Sobre un ticket BUGFIX el evaluador recibe la proposición del síntoma y no la de funcionalidad nueva
      <!-- test: npx vitest run tests/diagnostico-por-tipo.test.ts -->
- [x] Un FEATURE con diagnóstico completo no bloquea por falta de síntoma
      <!-- test: npx vitest run tests/diagnostico-por-tipo.test.ts -->
- [x] El estado que recibe el evaluador incluye la «Descripción funcional» y su hash cambia si la sección cambia
      <!-- test: npx vitest run tests/diagnostico-por-tipo.test.ts -->
- [x] El bloqueo aislado de la proposición nueva se degrada a revisión igual que el del síntoma, y el caso de control con la causa baja sigue bloqueando
      <!-- test: npx vitest run tests/diagnostico-por-tipo.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de IMPROVEMENT-GATE-DIAGNOSTICO-POR-TIPO-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/gate/src/definitions.ts",
      "packages/gate/src/decide.ts",
      "packages/engine/src/state.ts",
      "packages/engine/src/gate.ts",
      "tests/diagnostico-por-tipo.test.ts",
      "tests/gate-decide.test.ts",
      "tests/gate-impacto-nulo.test.ts",
      "tests/aplicabilidad-por-tipo.test.ts"
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

`packages/gate/src/definitions.ts`: `diagnostico_explica_el_sintoma` pasa a `appliesTo: ["BUGFIX", "SECURITY"]` y se agrega `diagnostico_ubica_el_cambio` (peso 3, con descripción, instrucciones y criterios de sí y de no) para los demás tipos —FEATURE, IMPROVEMENT, SYNC, INTEGRATION, AGENT, CLAUDIO, CHORE y DOCS—, que pregunta si la investigación nombra el archivo o símbolo donde falta el comportamiento esperado sin exigir un síntoma. `packages/gate/src/decide.ts`: `IsolatedBlockReviewRule` gana `alsoBlockingIds` y `isIsolatedBlockContradiction` acepta como bloqueo aislado el `blockingId` o cualquiera de esos; la regla del análisis lo declara con la proposición nueva. `packages/engine/src/state.ts`: `buildGateState` incluye `descripcion_funcional`. `packages/engine/src/gate.ts`: el informe compara contra el total expandido antes del filtro por tipo (el filtro no es una expansión). Pruebas existentes que evaluaban todas las proposiciones del análisis ahora usan las que ve un BUGFIX (`partitionByApplicability`): `gate-decide`, `gate-impacto-nulo`, `aplicabilidad-por-tipo`. Pruebas nuevas: `tests/diagnostico-por-tipo.test.ts` (7). Compatibilidad: cambia el `stateHash` de todos los tickets, así que un recibo `qa-mechanical` anterior sobre un ticket que no avanzó debe repetirse una vez.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/diagnostico-por-tipo.test.ts` — esperado: 7 pruebas pasan.
2. `npx vitest run` — esperado: 154 archivos pasan y 1 omitido; 2345 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run: 2345 pruebas pasan y 0 fallan

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:0ccbf5f1e3dffdd5f06bbdf02c3d72215e95806f",
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
    "description": "npx vitest run: 2345 pruebas pasan y 0 fallan",
    "reference": "worktree:sha256:26e9679b381232504573f929a7a2f1aa3ae0d1a2e6f34e1465c5f54474a0f4fe",
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
    "technical_summary": "diagnostico_ubica_el_cambio para tipos que no son corrección, appliesTo en el síntoma, alsoBlockingIds en la regla de contradicción y descripcion_funcional en el estado del evaluador; 7 pruebas nuevas",
    "functional_summary": "Una funcionalidad nueva ya no se bloquea por falta de síntoma: se le pregunta dónde falta el comportamiento esperado, y el evaluador ve la descripción funcional del ticket",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: cambio interno del motor de compuertas; cambia el stateHash y un recibo mecánico anterior debe repetirse una vez"
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
    "at": "2026-10-06T01:51:49.392Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T00:52:02.695Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T00:52:17.629Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Claude Code por delegación del PO (recibo GR-20261007-IMPROVEMENT-GATE-DIAGNOSTICO-POR-TIPO-20261005-analysis-1, canal delegation, decidida 2026-10-07T00:52:17.627Z): por delegación DEL-20261006-001 del PO Juan Andrade: El criterio dice que una proposición de contexto en banda de revisión no debe bloquear el avance — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T00:52:17.753Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T00:52:52.394Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T00:52:52.535Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T00:56:13.032Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T00:56:13.123Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T00:56:13.204Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T00:56:13.284Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T00:56:13.360Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T00:56:13.446Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T00:56:13.622Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T00:56:13.824Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T00:56:13.899Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T00:56:13.973Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T00:56:14.051Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T00:56:14.129Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T00:56:14.199Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T00:56:14.274Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T00:56:14.352Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
