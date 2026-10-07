---
schema_version: 2
id: BUGFIX-ENGINE-CIERRE-CRITERIOS-20261005
title: Exigir criterios marcados al cerrar y marcarlos desde el recibo mecánico
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

# BUGFIX-ENGINE-CIERRE-CRITERIOS-20261005

## Solicitud original

Parte del sprint: Control en el código: aprobación del plan registrada, despliegue con frase consumible, escrituras autenticadas, cierre con criterios marcados y consumo fiable. Cierra con la medición de salida de S1 a S3.
- R-CTRL-004: El cierre DEBE exigir que los criterios verificados estén marcados
Depende de: BUGFIX-GATE-LECTOR-CRITERIOS-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: (R-CTRL-004) el cierre de un ticket: que `closed` exija que cada criterio de aceptación esté marcado con `[x]` o declarado «no aplica» con su motivo, y que los criterios con `test:` que el último recibo de `qa-mechanical` pasó se marquen al preparar el cierre, citando el recibo. Fuera de alcance: marcar por el agente un criterio `verify: manual` sin la confirmación de quien lo probó, y las compuertas.
- Usuario o rol afectado: quien cierra un ticket y quien lo lee meses después para saber qué se comprobó.
- Comportamiento actual: `closed` solo exige QA aprobada o eximida, un ciclo confirmado y un intento de cierre coherente; un ticket con criterios sin marcar se cierra igual, y el registro afirma a la vez que el ticket está aprobado y que hay criterios que nadie miró. Marcar cada criterio es una convención que cada agente cumple a mano.
- Comportamiento esperado: mover un ticket a `closed` se rechaza nombrando el primer criterio sin `[x]` que no declare «no aplica» con motivo; al preparar el cierre, los criterios con `test:` que el último recibo de `qa-mechanical` pasó quedan marcados y el evento cita el recibo; un criterio `verify: manual` solo se marca con la confirmación literal de quien lo probó.

## Diagnóstico

- Archivos y flujo investigados: `transition` en `packages/engine/src/transition.ts` valida el movimiento a `closed` (QA aprobada o eximida, ciclo confirmado, cierre coherente) sin mirar los criterios; `closeAttempt` en `packages/engine/src/append.ts` escribe el intento de cierre dentro de una mutación (`conTicket` y `finalizeMutation` de `packages/engine/src/mutate.ts`), que es el momento donde el ticket ya tiene el último recibo mecánico y todavía no se cerró. El recibo de `qa-mechanical` guarda por criterio una proposición `criterio_NN` con su descripción —el texto del criterio— y su efecto. `extractCriteriaSpecs` de `packages/gate/src/dynamic.ts` lee el texto, el comando y el carácter manual de cada criterio, pero no su casilla. La skill de entrega ya pide marcar los criterios: ningún código lo hace cumplir.
- Causa raíz o hipótesis: la regla de marcar los criterios vive solo en una skill; el motor no la comprueba ni ayuda a cumplirla, de modo que depende de que cada agente lo recuerde.
- Riesgos y compatibilidad: la exigencia solo se aplica al **movimiento** a `closed`, no a validar: un ticket ya cerrado no se invalida. Un ticket de la plantilla anterior sin casillas (viñetas sin `[ ]`) no tiene qué marcar y queda exento. Marcar desde el recibo exige que la descripción de la proposición coincida con el texto del criterio, de modo que un criterio cambiado después del recibo no se marca; si el recibo no existe o no lo pasó, el criterio queda sin marcar y el cierre lo dice. Marcar un criterio manual no lo decide el agente: solo con las palabras literales de quien lo probó, que quedan en el evento. «No aplica» exige un motivo de al menos ocho caracteres en el propio criterio.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: la lectura de las casillas de los criterios, su marcado desde el recibo mecánico y por confirmación, y la exigencia en el cierre, con pruebas. Exclusiones: las compuertas y la plantilla del ticket.
- Pasos ordenados:
  1. Crear `criteria-marks.ts` en el motor con `unmarkedCriteria(texto)`, que lista los criterios con casilla `[ ]` sin la declaración «no aplica: motivo», y `markFromReceipt(texto, recibo)`, que marca `[x]` los criterios con `test:` cuya proposición `criterio_NN` aprobó en el recibo y cuya descripción coincide con su texto, y devuelve el texto nuevo y los criterios marcados.
  2. En `append.ts`, dentro de `closeAttempt` con QA aprobada, leer el último recibo vigente de `qa-mechanical`, aplicar `markFromReceipt` en la misma mutación y citar el recibo y los criterios marcados en el detalle del evento.
  3. En `transition.ts`, al mover a `closed`, fallar con `unmarkedCriteria` nombrando el primer criterio sin marcar y cuántos más faltan, y cómo declarar «no aplica» con su motivo.
  4. En `criteria-marks.ts`, agregar `markManualCriteria(paths, ticketId, confirmacion)`, que marca los criterios manuales con las palabras literales de quien los probó y las anota en el evento; y usarla en `delegation.ts` del CLI cuando el cierre llega con la confirmación literal del PO.
  5. Crear `tests/cierre-criterios.test.ts`: un ticket en `qa_approved` con un criterio sin marcar no cierra y el error nombra el criterio; «no aplica» con motivo sí cierra; sin motivo suficiente no; un criterio con `test:` aprobado por el recibo se marca al preparar el cierre y el evento cita el recibo; uno cuyo texto cambió después del recibo no se marca; un manual no se marca sin confirmación y con ella queda marcado con sus palabras; y un ticket de la plantilla anterior sin casillas cierra. Ajustar las pruebas existentes que cierran tickets con criterios sin marcar, y correr `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; no hay datos que migrar y los tickets ya cerrados no cambian.

## Criterios de aceptación

- [x] Mover a `closed` un ticket con un criterio sin marcar se rechaza nombrando ese criterio
      <!-- test: npx vitest run tests/cierre-criterios.test.ts -->
- [x] Un criterio sin marcar que declara «no aplica» con su motivo no impide cerrar
      <!-- test: npx vitest run tests/cierre-criterios.test.ts -->
- [x] Un «no aplica» sin motivo suficiente no basta para cerrar
      <!-- test: npx vitest run tests/cierre-criterios.test.ts -->
- [x] Al preparar el cierre queda marcado un criterio con `test:` que el último recibo de `qa-mechanical` pasó, y el evento cita el recibo
      <!-- test: npx vitest run tests/cierre-criterios.test.ts -->
- [x] Un criterio cuyo texto cambió después del recibo no se marca desde él
      <!-- test: npx vitest run tests/cierre-criterios.test.ts -->
- [x] Un criterio `verify: manual` no se marca sin la confirmación literal de quien lo probó
      <!-- test: npx vitest run tests/cierre-criterios.test.ts -->
- [x] Con la confirmación literal, el criterio manual queda marcado y el evento guarda esas palabras
      <!-- test: npx vitest run tests/cierre-criterios.test.ts -->
- [x] Un ticket con la plantilla anterior, sin casillas, se cierra como antes
      <!-- test: npx vitest run tests/cierre-criterios.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de BUGFIX-ENGINE-CIERRE-CRITERIOS-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/engine/src/criteria-marks.ts",
      "packages/engine/src/append.ts",
      "packages/engine/src/transition.ts",
      "packages/engine/src/index.ts",
      "packages/cli/src/delegation.ts",
      "tests/cierre-criterios.test.ts",
      "tests/fixtures/ticket-cerrado-con-criterios.md",
      "tests/mcp-server.test.ts",
      "tests/delegation.test.ts"
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

`packages/engine/src/criteria-marks.ts` (nuevo): `criterionBoxes` lee las casillas de la sección de criterios (texto, estado y continuación), `unmarkedCriteria` lista las que no están marcadas ni declaran «no aplica: <motivo>» (motivo de al menos ocho caracteres, hasta el cierre del paréntesis o el punto), `markFromReceipt` marca `[x]` los criterios con `test:` cuya proposición `criterio_NN` aprobó en el último recibo de `qa-mechanical` **y** cuya descripción coincide con el texto del criterio, y `markManualCriteria` marca los `verify: manual` solo con las palabras literales de quien los probó, que quedan en el evento `criteria-marked`. `packages/engine/src/append.ts`: `closeAttempt` con QA aprobada marca desde el recibo en la misma mutación y el evento cita el recibo y los criterios (`C1, C3…`). `packages/engine/src/transition.ts`: mover a `closed` falla nombrando el primer criterio sin marcar y cuántos más faltan; no valida tickets ya cerrados y un ticket de la plantilla anterior sin casillas queda exento. `packages/cli/src/delegation.ts`: el cierre con la confirmación literal del PO marca los criterios manuales con esas palabras. Pruebas existentes ajustadas al comportamiento nuevo, no al revés: `mcp-server` marca los criterios que el PO verificó antes de cerrar y comprueba que el motor marcó el de `test:` desde el recibo; `delegation` cierra un ticket con un criterio manual desde la confirmación del PO. Pruebas nuevas: `tests/cierre-criterios.test.ts` (15) sobre un ticket real cerrado devuelto a `qa_approved` (`tests/fixtures/ticket-cerrado-con-criterios.md`).

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/cierre-criterios.test.ts` — esperado: 15 pruebas pasan.
2. `npx vitest run` — esperado: 160 archivos pasan y 1 omitido; 2422 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run: 2422 pruebas pasan y 0 fallan

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:fe335ebdd7a5ec81c08705ef648b0806d7232064",
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
    "description": "npx vitest run: 2422 pruebas pasan y 0 fallan",
    "reference": "worktree:sha256:b504fbbd1a4d00337bf3378acb36ff4f251069a7d844bc4eb0a09ba68cb6a7d6",
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
    "technical_summary": "criteria-marks: unmarkedCriteria exige [x] o «no aplica» con motivo al cerrar, markFromReceipt marca desde qa-mechanical y markManualCriteria solo con las palabras de quien probó; 15 pruebas nuevas",
    "functional_summary": "Un ticket ya no se cierra con criterios que nadie marcó: los de test: se marcan solos desde el recibo y los manuales con la confirmación literal de quien los probó",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: cambia el motor de cierre; los tickets abiertos deben tener sus criterios marcados al cerrar"
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
    "at": "2026-10-06T01:51:50.064Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T01:33:34.875Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T01:33:54.830Z",
    "action": "gate-approved",
    "actor": "cli",
    "details": "Gate analysis aprobado por Claude Code por delegación del PO (recibo GR-20261007-BUGFIX-ENGINE-CIERRE-CRITERIOS-20261005-analysis-1, canal delegation, decidida 2026-10-07T01:33:54.829Z): por delegación DEL-20261006-001 del PO Juan Andrade: El criterio dice que una proposición de contexto en banda de revisión no debe bloquear el avance — palabras del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»"
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T01:33:54.948Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T01:34:14.762Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T01:34:14.906Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T01:38:55.235Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T01:38:55.328Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T01:38:55.410Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T01:38:55.491Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T01:38:55.575Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T01:38:55.652Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T01:38:55.844Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T01:38:56.063Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T01:38:56.141Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T01:38:56.217Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T01:38:56.298Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T01:38:56.377Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T01:38:56.455Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T01:38:56.532Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T01:38:56.613Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
