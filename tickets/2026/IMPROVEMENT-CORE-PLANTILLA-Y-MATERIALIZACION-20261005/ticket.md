---
schema_version: 2
id: IMPROVEMENT-CORE-PLANTILLA-Y-MATERIALIZACION-20261005
title: Pedir en la plantilla lo que evalúan las compuertas y acotar los criterios materializados
type: IMPROVEMENT
module: CORE
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

# IMPROVEMENT-CORE-PLANTILLA-Y-MATERIALIZACION-20261005

## Solicitud original

Parte del sprint: Compuertas precisas: proposiciones por tipo, evidencia funcional, contrato de proposiciones, plantilla, revisión previa en código y calibración por evaluador.
- R-CPRE-006: La plantilla del ticket DEBE pedir lo que las compuertas evalúan
- R-CPRE-007: La materialización de una feature DEBE escribir criterios acotados a la porción de cada ticket
Depende de: IMPROVEMENT-GATE-CONTRATO-PROPOSICIONES-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: (R-CPRE-006) la plantilla canónica del ticket, para que pida lo que las compuertas evalúan; y (R-CPRE-007) la materialización de una feature, para que cada ticket reciba criterios acotados a su porción del requisito y una sección «Fuera de alcance». Fuera de alcance: cambiar qué valida el motor de un ticket (los tickets con la plantilla anterior siguen validando), las proposiciones de las compuertas y la descomposición que propone el arquitecto.
- Usuario o rol afectado: quien crea o materializa tickets y el agente que los analiza, planifica y evalúa con las compuertas.
- Comportamiento actual: la plantilla pide «Archivos y flujo», «Causa raíz o hipótesis» y «Riesgos», sin separar lo comprobado de lo supuesto ni preguntar por otros consumidores; los criterios llevan un comentario guía dentro de la sección; el plan no pide qué criterios cubre cada paso ni una línea por impacto. `materialize` copia a cada ticket el enunciado completo de cada requisito que el grafo le asigna, aunque otro ticket cubra otra parte, y no dice qué quedó en otros tickets.
- Comportamiento esperado: la plantilla pide, en el diagnóstico, «Causa comprobada» con `ruta:línea` aparte de «Hipótesis pendientes» y «Consumidores afectados»; en los criterios, identificadores `C1…Cn` con su anotación de verificación, y ningún comentario dentro de la sección (el ejemplo vive fuera); en el plan, cada paso con los criterios que cubre, una línea por impacto declarado con las palabras de su proposición, y Rollback obligatorio. Al materializar, un requisito repartido entre varios tickets se escribe en cada uno acotado a su porción —con el texto que el grafo declare para ese ticket— y cada ticket trae «Fuera de alcance» con lo que el grafo asignó a otros; la solicitud lleva el comportamiento esperado y el actual cuando la spec lo declara.

## Diagnóstico

- Archivos y flujo investigados: `packages/core/src/template.ts` define `TICKET_TEMPLATE` y `TEMPLATE_CRITERIOS_VACIOS` (regex con un comentario opcional antes de la casilla vacía, que `escribirCriterios` en `packages/engine/src/materialize.ts` usa para rellenar criterios); `packages/engine/src/create.ts` la usa para crear tickets. `solicitudDe` y `criteriosDe` de `materialize.ts` arman la solicitud y los criterios con el enunciado completo de cada requisito de `coverage`; el grafo (`packages/core/src/tickets-yaml.ts`, `CoverageEntry` en `packages/core/src/feature.ts`) solo dice qué tickets cubren cada requisito, no qué parte. `parseRequirements` de `packages/engine/src/spec.ts` guarda solo el enunciado del encabezado, no el cuerpo del requisito. `renderTicketsYaml` reescribe el grafo al anexar o quitar tickets, así que cualquier campo nuevo debe sobrevivir a ese ciclo.
- Causa raíz o hipótesis: la plantilla se escribió antes de que las compuertas evaluaran causa comprobada, consumidores e impactos por separado; y el grafo no tiene dónde declarar la porción de un ticket, así que la materialización no puede acotar sin inventar.
- Riesgos y compatibilidad: ningún validador lee las etiquetas del diagnóstico ni del plan, solo la línea de impactos (`Impactos de sync, migración, Docker o despliegue:`, que se conserva) y el bloque de aprobación del plan; por eso un ticket con la plantilla anterior sigue validando y la prueba lo fija. Los criterios de la plantilla deben seguir siendo una casilla vacía: un texto como «C1:» contaría como criterio real y dejaría pasar un ticket sin rellenar, el defecto que costó una aprobación vacía; los identificadores `C1…Cn` se piden en la guía, que sale de la sección. `TEMPLATE_CRITERIOS_VACIOS` ya admite la sección sin comentario. El campo `portions` del grafo es opcional: un grafo sin él se materializa de forma acotada con la anotación del ticket y la lista de los otros tickets; con él, con el texto declarado. No cambia ningún umbral ni el formato de los tickets ya escritos. Las pruebas de este ticket irán en un archivo nuevo, `tests/plantilla-y-materializacion.test.ts`, junto a las existentes `tests/materializar-feature.test.ts` y `tests/anexar-a-feature.test.ts`, que ya cubren la materialización y la reescritura del grafo.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: la plantilla del ticket, el campo opcional `portions` del grafo, y la materialización acotada con «Fuera de alcance», con pruebas. Exclusiones: los validadores, las proposiciones de compuertas y el prompt del arquitecto.
- Pasos ordenados:
  1. En `template.ts` del núcleo, reescribir `TICKET_TEMPLATE`: en el diagnóstico las etiquetas «Causa comprobada (con `ruta:línea`)», «Hipótesis pendientes» y «Consumidores afectados» además de las existentes (se conserva la línea de impactos); en el plan, la guía de que cada paso nombre los criterios que cubre, la guía de escribir **una línea por cada impacto declarado** con las palabras de su proposición (no una sola línea genérica) y la etiqueta «Rollback (obligatorio)»; en los criterios, solo la casilla vacía, con la guía de `C1…Cn` y de la anotación de verificación movida al final del plan, fuera de la sección y sin comentarios anidados.
  2. En `feature.ts` y `tickets-yaml.ts` del núcleo, agregar a `CoverageEntry` el campo opcional `portions` (lista de ticket y texto), leerlo en las dos rutas de lectura del grafo con validación (el ticket debe estar en `covered_by`, el texto no vacío) y escribirlo en `renderTicketsYaml` para que sobreviva a anexar y quitar tickets.
  3. En `spec.ts` del motor, guardar el cuerpo de cada requisito (`body`, opcional) además del enunciado.
  4. En `materialize.ts`, cambiar `criteriosDe` para que un requisito cubierto por más de un ticket se escriba con la porción declarada para ese ticket o, sin ella, con el enunciado anotado como parte de «<título del ticket>»; agregar `fueraDeAlcanceDe` que lista, por cada requisito repartido, los otros tickets que lo cubren con su título o su porción; escribir esa sección en la solicitud; y agregar a la solicitud el comportamiento esperado y el actual cuando el cuerpo del requisito lo declara con la etiqueta «Comportamiento actual:».
  5. Crear `tests/plantilla-y-materializacion.test.ts`: la plantilla nueva trae los marcadores pedidos y su sección de criterios no tiene comentarios; un ticket creado con ella valida, y uno escrito con la plantilla anterior también; el grafo con `portions` se lee, se reescribe sin perderlas y rechaza un ticket que no cubre el requisito; un requisito repartido entre un ticket de motor y uno de interfaz se materializa en el de motor con su porción y su «Fuera de alcance» nombra al de interfaz; y un requisito no repartido se materializa como antes. Correr la suite completa con `npx vitest run`, ajustar solo las pruebas que fijaban el texto anterior de la plantilla, y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; los tickets ya escritos y los grafos sin `portions` no cambian.

## Criterios de aceptación

- [x] La plantilla del ticket pide en el diagnóstico la causa comprobada con `ruta:línea`
      <!-- test: npx vitest run tests/plantilla-y-materializacion.test.ts -->
- [x] La plantilla pide en el diagnóstico las hipótesis pendientes separadas de la causa comprobada
      <!-- test: npx vitest run tests/plantilla-y-materializacion.test.ts -->
- [x] La plantilla pide en el diagnóstico los consumidores afectados
      <!-- test: npx vitest run tests/plantilla-y-materializacion.test.ts -->
- [x] La plantilla pide en el plan los criterios que cubre cada paso
      <!-- test: npx vitest run tests/plantilla-y-materializacion.test.ts -->
- [x] La plantilla pide en el plan una línea por cada impacto declarado
      <!-- test: npx vitest run tests/plantilla-y-materializacion.test.ts -->
- [x] La plantilla marca el Rollback del plan como obligatorio
      <!-- test: npx vitest run tests/plantilla-y-materializacion.test.ts -->
- [x] La sección de criterios de la plantilla no contiene comentarios
      <!-- test: npx vitest run tests/plantilla-y-materializacion.test.ts -->
- [x] La guía de los identificadores `C1…Cn` y de la anotación de verificación vive fuera de la sección de criterios
      <!-- test: npx vitest run tests/plantilla-y-materializacion.test.ts -->
- [x] Un ticket creado con la plantilla nueva valida
      <!-- test: npx vitest run tests/plantilla-y-materializacion.test.ts -->
- [x] Un ticket escrito con la plantilla anterior sigue validando
      <!-- test: npx vitest run tests/plantilla-y-materializacion.test.ts -->
- [x] El campo opcional `portions` del grafo se lee y se valida
      <!-- test: npx vitest run tests/plantilla-y-materializacion.test.ts -->
- [x] El campo `portions` sobrevive a reescribir el grafo
      <!-- test: npx vitest run tests/plantilla-y-materializacion.test.ts -->
- [x] Un requisito repartido entre dos tickets se materializa en cada uno acotado a su porción
      <!-- test: npx vitest run tests/plantilla-y-materializacion.test.ts -->
- [x] El ticket materializado trae una sección «Fuera de alcance» que nombra al ticket que cubre lo demás
      <!-- test: npx vitest run tests/plantilla-y-materializacion.test.ts -->
- [x] Un requisito cubierto por un solo ticket se materializa como antes
      <!-- test: npx vitest run tests/materializar-feature.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de IMPROVEMENT-CORE-PLANTILLA-Y-MATERIALIZACION-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/core/src/template.ts",
      "packages/core/src/feature.ts",
      "packages/core/src/tickets-yaml.ts",
      "packages/engine/src/spec.ts",
      "packages/engine/src/materialize.ts",
      "packages/engine/src/next-step.ts",
      "tests/plantilla-y-materializacion.test.ts"
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

`packages/core/src/template.ts`: la plantilla pide en el diagnóstico «Causa comprobada (con `ruta:línea`)», «Hipótesis pendientes» y «Consumidores afectados» (se conserva la línea de impactos que lee el motor); en el plan, los criterios que cubre cada paso, una línea por cada impacto declarado y «Rollback (obligatorio)»; la sección de criterios queda sin comentarios, con la casilla vacía, y la guía de `C1…Cn` y de la anotación de verificación sale al final del plan. `packages/engine/src/next-step.ts`: la guía del paso de análisis usa las etiquetas nuevas. `packages/core/src/feature.ts` y `tickets-yaml.ts`: `CoverageEntry.portions` opcional (ticket y texto; el ticket debe estar en `covered_by`), leído en las dos rutas de lectura del grafo y escrito por `renderTicketsYaml`, así que sobrevive a anexar y quitar tickets. `packages/engine/src/spec.ts`: cada requisito guarda su `body`. `packages/engine/src/materialize.ts`: `criteriosDe` escribe un requisito repartido con la porción declarada para el ticket o, sin ella, con el enunciado anotado como parte de «<título>» y los otros tickets nombrados; `fueraDeAlcanceDe` agrega la sección «Fuera de alcance»; la solicitud lleva el comportamiento esperado y el actual cuando el cuerpo del requisito declara «Comportamiento actual:» (si no, dice que lo establece el análisis). Un requisito de un solo ticket se escribe como antes. Prueba existente ajustada: `gate-plan-aviso` conserva la frase de la guía. Pruebas nuevas: `tests/plantilla-y-materializacion.test.ts` (12). Decisión: el «comportamiento actual» no se inventa cuando la spec no lo declara.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/plantilla-y-materializacion.test.ts` — esperado: 12 pruebas pasan.
2. `npx vitest run tests/materializar-feature.test.ts` — esperado: 16 pruebas pasan (el requisito de un solo ticket se materializa como antes).
3. `npx vitest run` — esperado: 156 archivos pasan y 1 omitido; 2367 pruebas pasan, 0 fallan.
4. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los cuatro comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run: 2367 pruebas pasan y 0 fallan

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:b3431df62ae2fa2e75d0769be597e0742515f510",
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
    "description": "npx vitest run: 2367 pruebas pasan y 0 fallan",
    "reference": "worktree:sha256:7778e04be01cd50433025c58d40434eb22ea8dbae7a7644c48756fd79634cf21",
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
    "technical_summary": "Plantilla con causa comprobada, hipótesis, consumidores, impactos y Rollback obligatorio; portions opcional en el grafo; criterios acotados y Fuera de alcance al materializar; 12 pruebas nuevas",
    "functional_summary": "Un ticket nuevo pide lo que las compuertas evalúan y un requisito repartido entre tickets se escribe en cada uno acotado a su porción, con lo que quedó fuera",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: cambia el texto de la plantilla de tickets nuevos; los tickets existentes siguen validando"
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
    "at": "2026-10-06T01:51:49.524Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T01:02:56.615Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T01:03:15.013Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T01:06:17.662Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T01:06:17.763Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T01:10:22.962Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T01:10:23.093Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T01:10:23.191Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T01:10:23.271Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T01:10:23.357Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T01:10:23.437Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T01:10:23.616Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T01:10:23.824Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T01:10:23.903Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T01:10:23.980Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T01:10:24.060Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T01:10:24.137Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T01:10:24.214Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T01:10:24.293Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T01:10:24.376Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
