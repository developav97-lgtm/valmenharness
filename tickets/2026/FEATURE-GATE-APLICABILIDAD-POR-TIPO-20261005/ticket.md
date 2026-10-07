---
schema_version: 2
id: FEATURE-GATE-APLICABILIDAD-POR-TIPO-20261005
title: Declarar y filtrar en código las proposiciones por tipo de ticket
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

# FEATURE-GATE-APLICABILIDAD-POR-TIPO-20261005

## Solicitud original

Parte del sprint: Compuertas precisas: proposiciones por tipo, evidencia funcional, contrato de proposiciones, plantilla, revisión previa en código y calibración por evaluador.
- R-CPRE-001: Una proposición DEBE poder declarar los tipos de ticket a los que aplica
Depende de: BUGFIX-GATE-LECTOR-CRITERIOS-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: el contrato de las proposiciones de una compuerta: poder declarar a qué tipos de ticket aplican, filtrarlas en código antes de evaluar y dejar en el recibo las que no aplican como `no_aplica`. Fuera de alcance: decidir qué proposiciones concretas se declaran por tipo (tickets `IMPROVEMENT-GATE-DIAGNOSTICO-POR-TIPO` y siguientes), los umbrales y el resto del recibo.
- Usuario o rol afectado: quien lee el recibo de una compuerta y el agente cuyo ticket recibe preguntas que no le corresponden (por ejemplo exigir un síntoma a una funcionalidad nueva).
- Comportamiento actual: toda proposición fija de una compuerta se envía al evaluador para cualquier tipo de ticket; no existe forma de declarar que una pregunta es solo para correcciones, y la única «inaplicabilidad» que el código conoce es la de los impactos vacíos.
- Comportamiento esperado: una proposición puede declarar `appliesTo` con los tipos de ticket a los que aplica; la aplicabilidad la decide el código: la que no aplica no se envía al modelo y el recibo la registra como `no_aplica`, con el tipo del ticket y los tipos declarados. Sin `appliesTo` aplica a todos, como hasta ahora.

## Diagnóstico

- Archivos y flujo investigados: `packages/gate/src/decide.ts` define `NoulProposition`, `ChoiceProposition` y `ScoreProposition` sin ningún campo de aplicabilidad (solo `when`, que es una condición de texto sobre el sujeto que ningún código evalúa, y `verdict`); `packages/gate/src/dynamic.ts` (`expandGate`, `gateFor`) expande criterios, impactos e interfaz pero no filtra por tipo; `runGate` en `packages/engine/src/gate.ts` obtiene `gate` con `gateFor` y evalúa todas sus proposiciones; el recibo se arma en `buildReceipt` (`packages/gate/src/receipt.ts`). El tipo del ticket está en `parseTicket(...).fields.type`, ya leído en `runGate` para el estado.
- Causa raíz o hipótesis: no hay mecanismo de aplicabilidad por tipo; `when` es un comentario para el evaluador y no una decisión del código, así que una pregunta inaplicable se paga y se pondera como cualquier otra.
- Riesgos y compatibilidad: filtrar proposiciones antes de decidir puede dejar una compuerta sin ninguna, y `decide` sin proposiciones aprobaría por vacuidad, un defecto que este proyecto ya pagó; por eso si el filtro las deja todas fuera se devuelve un error de definición, no una aprobación. Un valor de `appliesTo` que no sea un tipo de ticket del contrato, o una lista vacía, es un error de definición que se dice en voz alta. Sin `appliesTo` el comportamiento es idéntico al actual y los recibos viejos siguen leyéndose; el campo del recibo es opcional.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: el campo `appliesTo` en las proposiciones, el filtro en código, su registro en el recibo y el informe, con pruebas. Exclusiones: declarar `appliesTo` en proposiciones reales y cambiar el contenido de cualquier proposición.
- Pasos ordenados:
  1. En `decide.ts` del paquete de compuertas, agregar `readonly appliesTo?: readonly string[]` a las tres interfaces de proposición, con un comentario que diga que la aplicabilidad la decide el código y que su ausencia significa «todos los tipos».
  2. En `dynamic.ts` del mismo paquete, agregar y exportar `partitionByApplicability(propositions, ticketType)`: valida que cada `appliesTo` sea una lista no vacía de tipos del contrato (error de definición en caso contrario) y devuelve `applicable` y `notApplicable`, donde cada entrada trae `id`, `status: "no_aplica"`, los tipos declarados y el tipo del ticket.
  3. En `receipt.ts`, agregar el campo opcional `notApplicable` al recibo y a la entrada de `buildReceipt`, escrito solo cuando hay entradas.
  4. En la compuerta del motor, después de expandir y antes de comprobar nada con el modelo, filtrar las proposiciones con el tipo del ticket; si no queda ninguna, devolver un error con código de invariante en vez de evaluar; pasar `notApplicable` al recibo y listarlas en el informe.
  5. Crear `tests/aplicabilidad-por-tipo.test.ts`: una proposición solo de BUGFIX sobre un ticket FEATURE no llega al evaluador y queda `no_aplica` en el recibo; sobre un BUGFIX sí llega; sin `appliesTo` aplica a todos; un tipo desconocido o una lista vacía fallan; si no queda ninguna proposición se rechaza sin aprobar. Correr `npx vitest run` sobre ese archivo, la suite completa y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; el campo es opcional y sin él nada cambia.

## Criterios de aceptación

- [x] Una proposición declarada solo para BUGFIX evaluada sobre un ticket FEATURE no se envía al evaluador
      <!-- test: npx vitest run tests/aplicabilidad-por-tipo.test.ts -->
- [x] El recibo registra la proposición que no aplica como `no_aplica`, con el tipo del ticket y los tipos declarados
      <!-- test: npx vitest run tests/aplicabilidad-por-tipo.test.ts -->
- [x] La misma proposición sobre un ticket BUGFIX sí se evalúa
      <!-- test: npx vitest run tests/aplicabilidad-por-tipo.test.ts -->
- [x] Una proposición sin `appliesTo` aplica a todos los tipos y el comportamiento no cambia
      <!-- test: npx vitest run tests/aplicabilidad-por-tipo.test.ts -->
- [x] Un `appliesTo` con un tipo que no existe o vacío falla como error de definición
      <!-- test: npx vitest run tests/aplicabilidad-por-tipo.test.ts -->
- [x] Si el filtro deja la compuerta sin proposiciones, se rechaza y no se aprueba por vacuidad
      <!-- test: npx vitest run tests/aplicabilidad-por-tipo.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-GATE-APLICABILIDAD-POR-TIPO-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/gate/src/decide.ts",
      "packages/gate/src/dynamic.ts",
      "packages/gate/src/receipt.ts",
      "packages/engine/src/gate.ts",
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

`packages/gate/src/decide.ts`: las tres interfaces de proposición ganan `appliesTo?: readonly string[]` (ausente = todos los tipos). `packages/gate/src/dynamic.ts`: `partitionByApplicability(propositions, ticketType)` separa las que aplican de las que no —cada una con `id`, `status: "no_aplica"`, los tipos declarados y el del ticket—, y falla como error de definición ante una lista vacía o un tipo que no está en `TICKET_TYPES`. `packages/gate/src/receipt.ts`: campo opcional `notApplicable`, escrito solo cuando hay entradas. `packages/engine/src/gate.ts`: tras expandir la compuerta, el código filtra por el tipo del ticket antes de evaluar —lo que no aplica no llega al evaluador—, se registra en el recibo y el informe lo lista; si el filtro no deja ninguna proposición se rechaza (código 3) en vez de aprobar por vacuidad. No se declaró `appliesTo` en ninguna proposición real: eso lo hacen los tickets siguientes. Pruebas nuevas: `tests/aplicabilidad-por-tipo.test.ts` (7).

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/aplicabilidad-por-tipo.test.ts` — esperado: 7 pruebas pasan.
2. `npx vitest run` — esperado: 153 archivos pasan y 1 omitido; 2338 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run: 2338 pruebas pasan y 0 fallan

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:cf4bacceeba2e76a132d81bc3fea9a456f9da0b0",
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
    "description": "npx vitest run: 2338 pruebas pasan y 0 fallan",
    "reference": "worktree:sha256:5858e35fab2f03952d6d66a9586ed624a4cec70b950fb710a00911e01a0dc4cd",
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
    "technical_summary": "appliesTo en las proposiciones, partitionByApplicability, filtro en la compuerta antes de evaluar y notApplicable en el recibo; 7 pruebas nuevas",
    "functional_summary": "Una pregunta que no corresponde al tipo del ticket ya no se envía al modelo y el recibo la deja como no_aplica",
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
    "at": "2026-10-06T01:51:49.328Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T00:48:46.049Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T00:49:08.020Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Claude Code por delegación del PO (recibo GR-20261007-FEATURE-GATE-APLICABILIDAD-POR-TIPO-20261005-analysis-1, canal delegation, decidida 2026-10-07T00:49:08.019Z): por delegación DEL-20261006-001 del PO Juan Andrade: El criterio dice que una proposición de contexto en banda de revisión no debe bloquear el avance — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T00:49:08.145Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T00:49:37.275Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T00:49:37.396Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T00:51:22.494Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T00:51:22.593Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T00:51:22.678Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T00:51:22.763Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T00:51:22.839Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T00:51:22.916Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T00:51:23.056Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T00:51:23.228Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T00:51:23.307Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T00:51:23.381Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T00:51:23.456Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T00:51:23.535Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T00:51:23.610Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T00:51:23.685Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T00:51:23.761Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
