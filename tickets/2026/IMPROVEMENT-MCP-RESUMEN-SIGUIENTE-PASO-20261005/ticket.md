---
schema_version: 2
id: IMPROVEMENT-MCP-RESUMEN-SIGUIENTE-PASO-20261005
title: Devolver resumen y siguiente paso en el dato estructurado de MCP
type: IMPROVEMENT
module: MCP
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

# IMPROVEMENT-MCP-RESUMEN-SIGUIENTE-PASO-20261005

## Solicitud original

Parte del sprint: Respuesta concisa en todos los clientes, independiente de los demás sprints.
- R-RESP-006: Las herramientas MCP DEBEN devolver un resumen con el siguiente paso dentro del dato estructurado
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: (1) `evaluar_compuerta` devuelve en `structuredContent` un resumen —resultado, motivo, proposiciones en banda, siguiente paso e id del recibo— de menos de un kilobyte en lugar del recibo completo; (2) el recibo completo se pide aparte con una herramienta de solo lectura nueva, `ver_recibo`; (3) toda herramienta que emite `structuredContent` lleva ahí el campo `siguiente_paso`. Fuera de alcance: el texto de las herramientas, el CLI y Mission Control.
- Usuario o rol afectado: el agente que usa el MCP desde clientes que solo le pasan al modelo el dato estructurado, y quien paga el contexto que consume un recibo completo en cada compuerta.
- Comportamiento actual: `evaluar_compuerta` devuelve `{ recibo }` con el recibo entero (proposiciones, respuestas del modelo, evidencia), varios kilobytes; las demás herramientas con dato no dicen qué sigue en el dato, solo en el texto.
- Comportamiento esperado: `evaluar_compuerta` devuelve `{ resultado, motivo, en_banda, siguiente_paso, recibo_id }` (menos de 1 KB, con las proposiciones en banda acotadas); `ver_recibo` entrega el recibo completo por id o el último del ticket; las demás herramientas con dato agregan `siguiente_paso`, calculado por una tabla de una línea por herramienta y, en las que dependen del resultado, por el resultado.

## Diagnóstico

- Archivos y flujo investigados: `packages/mcp/src/tools.ts:3090` (caso `evaluar_compuerta`) devuelve `bien(texto, { recibo: ultimo })`; su `outputSchema` (`tools.ts:887`) declara solo `recibo` con `additionalProperties: false`; `callTool` (`tools.ts:2222`) es el único punto por el que pasan todas las herramientas y `respuestaDeHerramienta` en `packages/mcp/src/protocol.ts:244` emite `structuredContent` cuando hay `data`; el recibo trae `outcome`, `reason`, `id` y `propositions` con `inBand` (`packages/gate/src/receipt.ts:148`, `packages/gate/src/decide.ts:348`). Hay 39 herramientas que emiten dato y 10 con `outputSchema`.
- Causa raíz o hipótesis: el dato estructurado se diseñó para que el agente ramifique sin leer prosa, y se llenó con el recibo entero porque ya estaba en disco; el siguiente paso solo vive en el texto, que algunos clientes no pasan al modelo. Comprobado: `data` de `evaluar_compuerta` no contiene el siguiente paso y las pruebas leen `data.recibo`. Como `callTool` es el punto común, el siguiente paso se agrega ahí con una tabla y no herramienta por herramienta; así una herramienta nueva sin entrada en la tabla falla una prueba y no queda sin paso.
- Riesgos y compatibilidad: quien lea `data.recibo` de `evaluar_compuerta` (las pruebas de `tests/mcp-server.test.ts` y el despacho de Hermes si lo usara) debe pedir `ver_recibo`; se busca con `grep` antes de cambiar. Las herramientas con `outputSchema` y `additionalProperties: false` rechazarían el campo nuevo, así que sus esquemas lo declaran. Una herramienta nueva cambia el conteo de herramientas en `tests/mcp-server.test.ts`, `tests/mcp-anotaciones.test.ts` y en la lista de solo lectura de `packages/server/src/hermes.ts`, que se ajustan. El resumen se acota: a lo sumo cinco proposiciones en banda, el motivo cortado a 240 caracteres y los ids por ellas; si el recibo no se pudo leer, el resumen lo dice y el texto conserva el motivo.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: el resumen de `evaluar_compuerta`, la herramienta `ver_recibo`, el campo `siguiente_paso` en todo dato estructurado y sus pruebas. Exclusiones: el texto de las herramientas, el CLI y la pantalla.
- Pasos ordenados:
  1. En `packages/mcp/src/tools.ts` agregar `resumenDeRecibo(recibo)` que devuelve `{ resultado, motivo, en_banda, siguiente_paso, recibo_id }` con las cotas descritas y el siguiente paso según `outcome` (`approve` pide `mover_ticket`; `review` lleva la decisión a la persona; `block` pide corregir y volver a evaluar), y usarla en el caso `evaluar_compuerta` en lugar de `{ recibo }`; actualizar su `outputSchema` y su descripción.
  2. Agregar la herramienta `ver_recibo` (solo lectura, parámetros `id` y `recibo` opcional) a `TOOLS` y a `callTool`: devuelve `{ recibo }` completo por id de recibo o el último del ticket, con su `outputSchema` y su anotación de lectura.
  3. Crear la tabla `SIGUIENTE_PASO` por herramienta y aplicarla en `callTool`: si el resultado trae `data` sin `siguiente_paso`, se agrega el de la tabla (o el que calcule su función); agregar `siguiente_paso` a las propiedades de cada `outputSchema` existente.
  4. Ajustar las listas y conteos: `packages/server/src/hermes.ts` (lectura), `tests/mcp-server.test.ts` y `tests/mcp-anotaciones.test.ts`; buscar con `grep` los consumidores de `data.recibo` de `evaluar_compuerta` y migrarlos.
  5. Crear `tests/mcp-resumen-siguiente-paso.test.ts`: el dato de `evaluar_compuerta` en `review` pesa menos de 1024 bytes y trae resultado, motivo, en banda, siguiente paso e id; `ver_recibo` devuelve el recibo completo; toda herramienta del catálogo que devuelve dato lo hace con `siguiente_paso` no vacío (recorriendo las que se pueden invocar sin servicios externos).
  6. Correr `npx vitest run tests/mcp-resumen-siguiente-paso.test.ts`, la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; el recibo en disco no cambia, así que no hay datos que migrar.

## Criterios de aceptación

- [x] R-RESP-006: el dato estructurado de `evaluar_compuerta` en revisión ocupa menos de un kilobyte y trae resultado, motivo, proposiciones en banda, siguiente paso e id del recibo
      <!-- test: npx vitest run tests/mcp-resumen-siguiente-paso.test.ts -->
- [x] R-RESP-006: el recibo completo se pide aparte con `ver_recibo`, por id o el último del ticket
      <!-- test: npx vitest run tests/mcp-resumen-siguiente-paso.test.ts -->
- [x] R-RESP-006: toda herramienta que emite dato estructurado lleva `siguiente_paso` en él
      <!-- test: npx vitest run tests/mcp-resumen-siguiente-paso.test.ts -->
- [x] El siguiente paso de `evaluar_compuerta` depende del veredicto: aprobar, revisión humana o corregir
      <!-- test: npx vitest run tests/mcp-resumen-siguiente-paso.test.ts -->
- [x] El catálogo de herramientas sigue consistente: anotaciones, conteos y lista de lectura de Hermes
      <!-- test: npx vitest run tests/mcp-server.test.ts tests/mcp-anotaciones.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de IMPROVEMENT-MCP-RESUMEN-SIGUIENTE-PASO-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/mcp/src/tools.ts",
      "packages/server/src/hermes.ts",
      "tests/mcp-resumen-siguiente-paso.test.ts",
      "tests/mcp-server.test.ts",
      "tests/mcp-anotaciones.test.ts"
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

- `packages/mcp/src/tools.ts`: `resumenDeRecibo` (resultado, motivo acotado a 240 caracteres, hasta cinco proposiciones en banda, `siguiente_paso` según el veredicto e id del recibo) en el caso `evaluar_compuerta`, con su `outputSchema` nuevo; herramienta `ver_recibo` (solo lectura) para pedir el recibo completo por id o el último del ticket; `callTool` ahora envuelve a `ejecutarHerramienta` y agrega `siguiente_paso` (tabla `SIGUIENTE_PASO` o paso genérico) a todo dato estructurado; `TOOLS` agrega `siguiente_paso` a cada `outputSchema`.
- `packages/server/src/hermes.ts`: `ver_recibo` en la lista de herramientas de lectura.
- `tests/mcp-resumen-siguiente-paso.test.ts` (nuevo, 6 pruebas); `tests/mcp-server.test.ts` y `tests/mcp-anotaciones.test.ts` ajustados a 51 herramientas, a la lista de solo lectura y al resumen.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/mcp-resumen-siguiente-paso.test.ts` — esperado: 6 pruebas pasan.
2. `npx vitest run tests/mcp-server.test.ts tests/mcp-anotaciones.test.ts` — esperado: todas pasan.
3. `npx vitest run` — esperado: 165 archivos pasan y 1 omitido; 2473 pruebas pasan, 0 fallan.
4. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los cuatro comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run (2473 pasan), tsc sin errores

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:1a918897984466a7fdc660bace86a6c1b3da4581",
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
    "description": "npx vitest run (2473 pasan), tsc sin errores",
    "reference": "worktree:sha256:d9fa28a30d4ba9e562605a6708969960392bd4bf2ac0dcd0f0398790ec818b61",
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
    "technical_summary": "resumenDeRecibo, ver_recibo y callTool que agrega siguiente_paso a todo dato estructurado.",
    "functional_summary": "Los clientes que solo leen el dato estructurado reciben un resumen corto con el siguiente paso, y el recibo completo se pide aparte.",
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
    "at": "2026-10-06T01:51:50.471Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T02:01:01.715Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T02:01:07.102Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Claude Code por delegación del PO (recibo GR-20261007-IMPROVEMENT-MCP-RESUMEN-SIGUIENTE-PASO-20261005-analysis-1, canal delegation, decidida 2026-10-07T02:01:07.101Z): por delegación DEL-20261006-001 del PO Juan Andrade: Todos los archivos citados existen (tools.ts, protocol.ts:244, receipt.ts:148, decide.ts:348, hermes.ts, las pruebas); solo la prueba nueva y el campo son del plan. La causa (el dato lleva el recibo entero y el siguiente paso solo vive en el texto) se comprobó en tools.ts:3090. — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T02:01:07.189Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T02:01:08.472Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate plan aprobado por Claude Code por delegación del PO (recibo GR-20261007-IMPROVEMENT-MCP-RESUMEN-SIGUIENTE-PASO-20261005-plan-1, canal delegation, decidida 2026-10-07T02:01:08.471Z): por delegación DEL-20261006-001 del PO Juan Andrade: Todos los archivos citados existen (tools.ts, protocol.ts:244, receipt.ts:148, decide.ts:348, hermes.ts, las pruebas); solo la prueba nueva y el campo son del plan. La causa (el dato lleva el recibo entero y el siguiente paso solo vive en el texto) se comprobó en tools.ts:3090. — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T02:01:08.581Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T02:01:08.670Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T02:03:55.708Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T02:03:55.855Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T02:03:55.941Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T02:03:56.030Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T02:03:56.112Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T02:03:56.202Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T02:03:56.357Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T02:03:56.535Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T02:03:56.616Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T02:03:56.695Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T02:03:56.777Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T02:03:56.857Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T02:03:56.935Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T02:03:57.018Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-06",
    "at": "2026-10-07T02:03:57.096Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
