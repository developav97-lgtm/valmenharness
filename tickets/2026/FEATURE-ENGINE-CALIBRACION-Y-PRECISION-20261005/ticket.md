---
schema_version: 2
id: FEATURE-ENGINE-CALIBRACION-Y-PRECISION-20261005
title: Calibrar umbrales con decisiones humanas y medir la precisión de forma continua
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

# FEATURE-ENGINE-CALIBRACION-Y-PRECISION-20261005

## Solicitud original

Parte del sprint: Compuertas precisas: proposiciones por tipo, evidencia funcional, contrato de proposiciones, plantilla, revisión previa en código y calibración por evaluador.
- R-CPRE-010: Los umbrales DEBEN poder fijarse por evaluador y por proposición, con calibración sobre decisiones humanas
- R-CPRE-011: El harness DEBE medir la precisión de las compuertas de forma continua
Depende de: FEATURE-GATE-UMBRALES-POR-EVALUADOR-20261005, BUGFIX-ENGINE-FIRMA-DE-COMPUERTA-20261004, FEATURE-GATE-MOTIVOS-RECIBO-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: (R-CPRE-010, segunda parte) proponer umbrales a partir de las decisiones humanas ya registradas en los recibos, sin aplicarlos; y (R-CPRE-011) medir la precisión de las compuertas de forma continua, con un informe y una suite de regresión sobre vectores de recibos reales. Fuera de alcance: aplicar un umbral (lo decide una persona, ticket anterior), la calibración que evalúa tickets con un modelo (ya existe como `simulate --calibrate`) y la cláusula opcional del veto de la cascada.
- Usuario o rol afectado: quien decide los umbrales de una compuerta y quien revisa semanalmente si las compuertas acertaron.
- Comportamiento actual: el registro guarda 517 recibos con 72 decisiones humanas sobre una banda de revisión o un bloqueo, pero nada las lee para proponer un umbral ni para medir; la única calibración existente cuesta una llamada al modelo por ticket y compara contra el resultado del QA, no contra las decisiones humanas sobre la propia compuerta.
- Comportamiento esperado: `valmen thresholds <compuerta> [--evaluator …]` y `calibrar_compuerta` con `umbrales: true` leen los recibos con decisión humana y proponen un `approve-at` por evaluador con su tasa de acierto simulada y los falsos aprobados, sin aplicarlo y sin gastar una llamada; si la evidencia no alcanza —pocos rechazos humanos— dicen que no proponen aflojar. `valmen precision` produce el informe por compuerta y por evaluador: tasa de banda, revisiones aprobadas sin cambios y bloqueos por tipo de ticket; y una suite de regresión con vectores de recibos reales fija esas cuentas en las pruebas del repositorio.

## Diagnóstico

- Archivos y flujo investigados: los recibos viven en `.valmen/receipts/<ticket>.jsonl` y se leen con `readReceipts` (`packages/engine/src/receipts.ts`); cada uno guarda `outcome`, `evaluator`, `propositions` con su valor y su banda, `modelAnswers`, `escalations` y, cuando una persona decidió, `humanDecision` con `approve` o `reject`. `packages/engine/src/calibration.ts` compara el veredicto del gate con el del QA registrado y necesita una simulación con modelo (`calibrateReport` en `packages/cli/src/commands.ts`, `simulate --calibrate` en `packages/cli/src/main.ts`); la herramienta `calibrar_compuerta` de `packages/mcp/src/tools.ts` llama a esa misma simulación y gasta una llamada por ticket. Los umbrales firmados que el proyecto puede aplicar los lee el ticket anterior desde `gate-thresholds`. Lo que este ticket agrega son archivos nuevos: dos módulos del motor (precision.ts y umbrales-propuestos.ts), la muestra de vectores reales tests/fixtures/recibos-reales.jsonl y la prueba tests/precision-y-umbrales.test.ts; y cambios pequeños en archivos que ya existen, los comandos de `packages/cli/src/main.ts` y `packages/cli/src/commands.ts`, las herramientas de `packages/mcp/src/tools.ts` y las listas de `packages/server/src/hermes.ts`.
- Causa raíz o hipótesis: las decisiones humanas sobre las compuertas, que son exactamente la verdad contra la que calibrar, no se aprovechan: la calibración existente mide contra otra señal y cuesta dinero, y no hay informe periódico. Datos medidos hoy: de 72 decisiones humanas, 70 aprobaron una banda de revisión o un bloqueo y solo 1 rechazó, así que cualquier propuesta de aflojar un umbral se apoyaría en un único rechazo.
- Riesgos y compatibilidad: proponer un umbral más laxo con pocos rechazos aprobaría trabajo que las personas devolverían, el falso aprobado que cuesta caro; por eso la propuesta exige una muestra mínima de decisiones y de rechazos y, si no la hay, dice que la evidencia es insuficiente en vez de inventar un número. Nada se aplica: la propuesta imprime la entrada para `gate-thresholds` sin `approved-by` ni `reason`, que son de la persona. Los recibos anteriores no traen `evaluator`; se infiere de la forma del recibo (comandos, escalamientos, modelo). Los vectores de la suite de regresión salen de recibos reales sin datos sensibles —guardan identificadores, valores y motivos, no el texto del ticket—. Sin recibos, los informes salen vacíos y no fallan.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: el informe de precisión, la propuesta de umbrales a partir de decisiones humanas (CLI y herramienta MCP) y la suite de regresión con vectores reales. Exclusiones: aplicar umbrales y la calibración con modelo.
- Pasos ordenados:
  1. Crear `precision.ts` en el motor con `readAllReceipts(paths)` (todos los recibos del registro), `inferEvaluator(recibo)` (el campo `evaluator` o su inferencia para recibos viejos) y `precisionReport(recibos, { desde, hasta })`, que agrupa por compuerta y evaluador y calcula las corridas, la tasa de banda (corridas que terminan en revisión sobre el total), la tasa de revisiones aprobadas sin cambios (de las corridas en revisión que una persona decidió, la proporción que aprobó) y los bloqueos por tipo de ticket; agregar `renderPrecision`, que **muestra** esas tres cuentas en el informe.
  2. Crear `umbrales-propuestos.ts` en el motor con `proposeThresholds(recibos, compuerta, evaluador)`: toma los recibos con decisión humana y valores de proposiciones, simula cada `approve-at` candidato (de 0,50 a 0,99), cuenta aciertos y falsos aprobados contra la decisión humana, y devuelve el valor más laxo sin falsos aprobados con su tasa de acierto simulada —o «evidencia insuficiente» si hay menos de 20 decisiones o menos de 5 rechazos—; agregar `renderProposal`, que imprime la entrada de `gate-thresholds` sin firma y dice que no se aplicó.
  3. En `main.ts` del CLI, agregar `valmen precision [--desde …] [--hasta …]` y `valmen thresholds <compuerta> [--evaluator …]`, con su ayuda; exportar ambos informes desde `commands.ts`.
  4. En `tools.ts` del MCP, agregar la herramienta de solo lectura `precision_compuertas` y el parámetro `umbrales` de `calibrar_compuerta`, que con `true` propone desde las decisiones humanas sin simular ni gastar; clasificar la herramienta nueva en las listas de Hermes y de las pruebas de anotaciones.
  5. Guardar en `tests/fixtures/recibos-reales.jsonl` una muestra estratificada de recibos reales del registro, y crear `tests/precision-y-umbrales.test.ts`: el informe sobre esos vectores fija sus cuentas, la propuesta con la muestra real dice «evidencia insuficiente» y con vectores sintéticos suficientes propone un valor sin falsos aprobados y nunca lo aplica, la inferencia del evaluador cubre recibos viejos, y los comandos imprimen sus informes. Correr la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; solo agrega informes de lectura y no cambia ningún umbral ni recibo.

## Criterios de aceptación

- [x] La propuesta de umbrales lee las decisiones humanas de los recibos y no llama a ningún modelo
      <!-- test: npx vitest run tests/precision-y-umbrales.test.ts -->
- [x] La propuesta informa la tasa de acierto simulada y los falsos aprobados del valor que propone
      <!-- test: npx vitest run tests/precision-y-umbrales.test.ts -->
- [x] La propuesta no aplica el umbral: imprime la entrada sin `approved-by` ni `reason`
      <!-- test: npx vitest run tests/precision-y-umbrales.test.ts -->
- [x] Con pocas decisiones o pocos rechazos humanos la propuesta dice que la evidencia es insuficiente
      <!-- test: npx vitest run tests/precision-y-umbrales.test.ts -->
- [x] El informe de precisión muestra la tasa de banda por compuerta y por evaluador
      <!-- test: npx vitest run tests/precision-y-umbrales.test.ts -->
- [x] El informe muestra la tasa de revisiones aprobadas sin cambios por una persona
      <!-- test: npx vitest run tests/precision-y-umbrales.test.ts -->
- [x] El informe muestra los bloqueos por tipo de ticket
      <!-- test: npx vitest run tests/precision-y-umbrales.test.ts -->
- [x] La inferencia del evaluador funciona con recibos anteriores que no traen el campo
      <!-- test: npx vitest run tests/precision-y-umbrales.test.ts -->
- [x] Una suite de regresión con vectores de recibos reales fija las cuentas del informe
      <!-- test: npx vitest run tests/precision-y-umbrales.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-ENGINE-CALIBRACION-Y-PRECISION-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/precision.ts",
      "packages/engine/src/umbrales-propuestos.ts",
      "packages/engine/src/index.ts",
      "packages/cli/src/commands.ts",
      "packages/cli/src/main.ts",
      "packages/mcp/src/tools.ts",
      "packages/server/src/hermes.ts",
      "tests/precision-y-umbrales.test.ts",
      "tests/fixtures/recibos-reales.jsonl",
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

`packages/engine/src/precision.ts` (nuevo): `readCurrentReceipts` (todos los recibos del registro en su versión vigente, con la decisión humana), `inferEvaluator` (el campo `evaluator` o, en recibos anteriores, su inferencia por escalamientos, comandos y modelo), `esDelegada`, y `precisionReport` / `renderPrecision`, que por compuerta y evaluador dicen las corridas, la **tasa de banda**, la **tasa de revisiones aprobadas sin cambios** (de las revisiones que decidió una persona) y los **bloqueos por tipo de ticket**. Las revisiones que decidió el agente por delegación (`channel: "delegation"`) se informan aparte y **no cuentan** como decisión humana, para no medir una compuerta contra las aprobaciones del propio agente que la usa. `packages/engine/src/umbrales-propuestos.ts` (nuevo): `proposeThresholds` simula cada `approve-at` de 0,50 a 0,99 contra las decisiones humanas y propone el más laxo sin falsos aprobados, con acierto simulado y falsos aprobados del propuesto y del actual; con menos de 20 decisiones o 5 rechazos dice «evidencia insuficiente»; `renderProposal` imprime la entrada de `gate-thresholds` **sin** `approved-by` ni `reason` y dice que no se aplicó. CLI: `valmen precision [--desde --hasta]` y `valmen thresholds <analysis|plan> [--evaluator]`; MCP: herramienta de solo lectura `precision_compuertas` y el parámetro `umbrales` de `calibrar_compuerta`, que propone sin simular ni gastar (clasificada en Hermes y en las listas de anotaciones). El plan nombraba `readAllReceipts`; ya existía uno con otra semántica en `usage.ts`, así que la función se llama `readCurrentReceipts`. Suite de regresión: `tests/fixtures/recibos-reales.jsonl` (39 vectores derivados de recibos reales del registro, sin el texto de los tickets) y `tests/precision-y-umbrales.test.ts` (14 pruebas) que fijan las cuentas. Medido hoy sobre el registro real: de las decisiones humanas casi todas aprueban y ninguna rechaza, así que `thresholds` dice «evidencia insuficiente» y no propone aflojar nada.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/precision-y-umbrales.test.ts` — esperado: 14 pruebas pasan.
2. `npx vitest run` — esperado: 159 archivos pasan y 1 omitido; 2407 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.
4. `valmen precision` y `valmen thresholds plan --evaluator jev` — esperado: el informe por compuerta y evaluador, y «evidencia insuficiente» con el registro actual.

Resultado de la ejecución del agente (2026-10-06): los cuatro comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run: 2407 pruebas pasan y 0 fallan

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:aaf69721eb980e66836e7cbd793d17312eeb32d1",
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
    "description": "npx vitest run: 2407 pruebas pasan y 0 fallan",
    "reference": "worktree:sha256:59b62ed3b24c9348ae1bc50e05de6795f8c11edba79d4e8b0d2641b775817107",
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
    "technical_summary": "precisionReport por compuerta y evaluador, proposeThresholds desde decisiones humanas sin aplicar, comandos precision y thresholds, precision_compuertas y calibrar_compuerta con umbrales, y 39 vectores reales de regresión; 14 pruebas nuevas",
    "functional_summary": "Se puede medir cuánto aciertan las compuertas con cada evaluador y proponer umbrales con evidencia, sin gastar una llamada y sin aplicar nada: lo firma una persona",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: informes de lectura del motor; no cambia ningún umbral ni recibo"
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
    "at": "2026-10-06T01:51:49.724Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T01:26:07.857Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T01:26:25.467Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Claude Code por delegación del PO (recibo GR-20261007-FEATURE-ENGINE-CALIBRACION-Y-PRECISION-20261005-analysis-1, canal delegation, decidida 2026-10-07T01:26:25.465Z): por delegación DEL-20261006-001 del PO Juan Andrade: El criterio dice que una proposición de contexto en banda de revisión no debe bloquear el avance — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T01:26:25.595Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T01:28:16.010Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T01:28:16.177Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T01:32:09.870Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T01:32:10.045Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T01:32:10.142Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T01:32:10.241Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T01:32:10.325Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T01:32:10.405Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T01:32:10.635Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T01:32:10.900Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T01:32:10.978Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T01:32:11.056Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T01:32:11.137Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T01:32:11.218Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T01:32:11.296Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T01:32:11.380Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T01:32:11.465Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
