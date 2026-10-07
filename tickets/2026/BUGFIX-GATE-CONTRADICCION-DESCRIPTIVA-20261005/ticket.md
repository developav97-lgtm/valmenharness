---
schema_version: 2
id: BUGFIX-GATE-CONTRADICCION-DESCRIPTIVA-20261005
title: Ignorar proposiciones descriptivas en la excepción por contradicción
type: BUGFIX
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

# BUGFIX-GATE-CONTRADICCION-DESCRIPTIVA-20261005

## Solicitud original

Parte del sprint: Compuertas sin defectos: lector de criterios, contradicción descriptiva, firma, motivos, fallas del entorno, preparación del ambiente y no repetir sobre el mismo estado.
- R-CDEF-003: La excepción por contradicción interna NO DEBE exigir umbral a una proposición descriptiva
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: la regla de degradación por contradicción interna del gate de análisis (`isIsolatedBlockContradiction`, packages/gate/src/decide.ts). Fuera de alcance: umbrales, otros gates y el resto de la política de decisión.
- Usuario o rol afectado: quien recibe un BLOCK del gate `analysis` y el agente que lo corrige.
- Comportamiento actual: la regla exige que cada proposición de `requiredApprovedIds` supere `approveAt`, incluidas las descriptivas (`verdict: false`). Si el ticket no declara impactos, `riesgos_cubren_impactos` es descriptiva y su valor no es una medida de nada: un valor bajo impide la degradación y el gate conserva un BLOCK que el propio recibo contradice.
- Comportamiento esperado: una proposición requerida en modo descriptivo se ignora en esa regla; el resto de condiciones no cambia, y el resultado sigue siendo `review`, nunca `approve`.

## Diagnóstico

- Archivos y flujo investigados: `packages/gate/src/decide.ts:405` llama a `isIsolatedBlockContradiction` cuando hay un único bloqueo; esa función (`decide.ts:470`) recorre `rule.requiredApprovedIds` y exige `item.value >= policy.approveAt` y `item.effect?.outcome === "approve"` sin mirar `item.verdict`, que es `false` para las descriptivas (`decide.ts:303`, `:551`). La regla la declara `ANALYSIS_GATE.isolatedBlockReview` en `packages/gate/src/definitions.ts:204`. Cubre el caso AP-004 en `tests/gate-decide.test.ts:226`.
- Causa raíz o hipótesis: la comprobación por valor y por efecto no distingue las proposiciones que no votan; una descriptiva con valor bajo hace fallar el `every` y la regla no se aplica.
- Riesgos y compatibilidad: el cambio solo afecta cuando una proposición requerida es descriptiva; las que votan siguen exigiendo `approveAt`, y el caso de control (falla `causa_especifica` o `nombra_archivos_reales`) sigue en BLOCK. Los recibos ya emitidos no se reescriben (append-only). No cambia ningún umbral ni amplía la autoridad del gate: el resultado máximo de la regla es `review`.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: solo `isIsolatedBlockContradiction` y sus pruebas. Exclusiones: umbrales, definiciones de gates y cualquier otra regla de decisión.
- Pasos ordenados:
  1. En `decide.ts` del paquete de compuertas, función `isIsolatedBlockContradiction`: dentro del `every` sobre `rule.requiredApprovedIds`, devolver `true` cuando el item existe y `item.verdict === false` (descriptiva), y mantener la comprobación de valor y efecto para las que votan; un item ausente sigue devolviendo `false`.
  2. En la prueba de decisión de compuertas (`tests/`), describe «la contradicción aislada de la compuerta de análisis»: agregar la prueba del vector histórico con `riesgos_cubren_impactos` descriptiva y valor bajo, que debe devolver `review`; y el caso de control con `causa_especifica` bajo `approveAt` y la misma descriptiva, que debe seguir devolviendo `block`.
  3. Correr la prueba de decisión con `npx vitest run` sobre ese archivo y luego la suite completa con `npx vitest run`.
- Rollback: revertir el commit del ticket; el cambio es una condición en una función y sus pruebas, sin datos ni migraciones.

## Criterios de aceptación

- [x] Con clasificación completa, `causa_especifica` y `nombra_archivos_reales` sobre `approveAt`, un solo bloqueo semántico y `riesgos_cubren_impactos` descriptiva con valor bajo, la compuerta devuelve `review`
      <!-- test: npx vitest run tests/gate-decide.test.ts -->
- [x] El mismo recibo con `causa_especifica` bajo `approveAt` sigue devolviendo `block`
      <!-- test: npx vitest run tests/gate-decide.test.ts -->
- [x] Una proposición requerida que vota y no supera `approveAt` sigue impidiendo la degradación a `review`
      <!-- test: npx vitest run tests/gate-decide.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de BUGFIX-GATE-CONTRADICCION-DESCRIPTIVA-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/gate/src/decide.ts",
      "tests/gate-decide.test.ts"
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

`isIsolatedBlockContradiction` (`packages/gate/src/decide.ts`) ignora ahora las proposiciones requeridas que no votan (`verdict: false`): un item ausente sigue devolviendo `false`, y las que votan siguen exigiendo `approveAt` y efecto `approve`. El resultado de la regla sigue siendo `review`, nunca `approve`. Pruebas nuevas en `tests/gate-decide.test.ts`: el vector histórico con `riesgos_cubren_impactos` descriptiva y valor bajo devuelve `review`; el caso de control con `causa_especifica` baja sigue en `block`; y una requerida que vota por debajo de `approveAt` sigue impidiendo la degradación. La prueba del vector falla sin el cambio y pasa con él.

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/gate-decide.test.ts` — esperado: 42 pruebas pasan, incluidas las tres nuevas de la contradicción descriptiva.
2. `npx vitest run` — esperado: 147 archivos pasan y 1 omitido; 2286 pruebas pasan, 0 fallan.
3. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los tres comandos dieron lo esperado; además la prueba del vector histórico falla con el `decide.ts` anterior y pasa con el nuevo.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run: 2286 pruebas pasan y 0 fallan; la prueba del vector falla sin el cambio

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:85205ea78dd029c2ff44365cb1d8099cb657e7c6",
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
    "description": "npx vitest run: 2286 pruebas pasan y 0 fallan; la prueba del vector falla sin el cambio",
    "reference": "worktree:sha256:c3ac8aab8cc67c32efe4371dc726b5e375c400dd641bcca25680794a8488a4f5",
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
    "technical_summary": "isIsolatedBlockContradiction ignora las proposiciones requeridas descriptivas (verdict false); tres pruebas nuevas en tests/gate-decide.test.ts",
    "functional_summary": "Un BLOCK del gate de análisis que el propio recibo contradice, por una proposición descriptiva con valor bajo, pasa a revisión humana en vez de bloquear; el caso de control sigue bloqueando",
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
    "at": "2026-10-06T01:51:49.055Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T00:25:46.169Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T00:26:04.674Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T00:26:59.242Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> blocked."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T00:27:04.344Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: blocked -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T00:27:36.885Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T00:27:37.001Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T00:28:46.682Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T00:28:46.772Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T00:28:46.850Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T00:28:46.927Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T00:28:47.003Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T00:28:47.079Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T00:28:47.177Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T00:28:47.305Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T00:28:47.381Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T00:28:47.455Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T00:28:47.536Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T00:28:47.609Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T00:28:47.690Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-021",
    "date": "2026-10-06",
    "at": "2026-10-07T00:28:47.788Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-022",
    "date": "2026-10-06",
    "at": "2026-10-07T00:28:47.870Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
