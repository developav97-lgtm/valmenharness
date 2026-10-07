---
schema_version: 2
id: FEATURE-GATE-UMBRALES-POR-EVALUADOR-20261005
title: Configurar y aplicar umbrales por evaluador y por proposición
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

# FEATURE-GATE-UMBRALES-POR-EVALUADOR-20261005

## Solicitud original

Parte del sprint: Compuertas precisas: proposiciones por tipo, evidencia funcional, contrato de proposiciones, plantilla, revisión previa en código y calibración por evaluador.
- R-CPRE-010: Los umbrales DEBEN poder fijarse por evaluador y por proposición, con calibración sobre decisiones humanas
Depende de: FEATURE-GATE-APLICABILIDAD-POR-TIPO-20261005.
Viene de una feature descompuesta en sprints; su plan completo está en el tickets.yaml de la feature.

### Supuestos y decisiones pendientes

<!-- Si el pedido nombra algo que el código no tiene —parámetro, permiso,
campo, bandera, columna, migración— y no lo especifica, listá cada elemento
con su pregunta antes de avanzar a análisis; el análisis no planifica sobre
la adivinanza. Si no hay ninguno, escribí «Ninguno» y seguí. -->
Ninguno.

## Descripción funcional

- Alcance: (R-CPRE-010, primera parte) la configuración y la aplicación de umbrales de decisión por evaluador y por proposición, con una condición dura: un umbral solo se aplica si una persona lo decidió y lo firma en la configuración. Fuera de alcance: proponer umbrales a partir de decisiones humanas (ticket `FEATURE-ENGINE-CALIBRACION-Y-PRECISION-20261005`), la cláusula opcional sobre el veto de una respuesta binaria del juez en la cascada, y cualquier cambio a los umbrales por defecto.
- Usuario o rol afectado: la persona que mantiene la configuración del proyecto y decide qué tan estricta es una compuerta con cada evaluador; y quien lee un recibo y necesita saber con qué umbral se decidió.
- Comportamiento actual: toda proposición se decide con la política de su compuerta (`approveAt` 0,9 y `blockAt` 0,1); solo una pregunta adicional de Jev puede traer umbrales propios, declarados por el adaptador. Un evaluador distinto (juez de chat, cascada) se decide con los mismos números, aunque su escala de confianza sea otra, y no hay forma de ajustar una proposición sin editar el código.
- Comportamiento esperado: `.valmen/config.yaml` acepta una lista `gate-thresholds` con entradas que nombran la compuerta y, opcionalmente, el evaluador y la proposición, con `approve-at` y `block-at`; la más específica gana. Una entrada solo se aplica si trae `approved-by` y `reason`: sin la firma de una persona se ignora y el informe lo dice. El recibo registra cada umbral aplicado, con quién lo decidió y por qué; sin `gate-thresholds` nada cambia.

## Diagnóstico

- Archivos y flujo investigados: `decide` en `packages/gate/src/decide.ts` decide cada proposición booleana con `proposition.policy ?? policy`, de modo que un umbral por proposición ya es posible si la proposición lo trae; la política de la compuerta (`DEFAULT_POLICY` en `packages/gate/src/definitions.ts`) es única. `runGate` en `packages/engine/src/gate.ts` conoce la compuerta expandida y, después de `evaluateGate`, el evaluador que respondió (`evaluation.evaluator`), pero no tiene dónde leer umbrales. El adaptador ya lee secciones de `config.yaml` con el mismo molde (`readGatePromotions` y `readPlaywrightConfig` en `packages/adapter/src/config.ts`), y `packages/engine/src/gate-promotion.ts` es el precedente de una solicitud declarativa que el motor cruza con evidencia antes de aplicarla.
- Causa raíz o hipótesis: los umbrales son una constante de la compuerta; no hay una capa declarativa que el proyecto controle ni un registro de con cuál se decidió.
- Riesgos y compatibilidad: subir o bajar un umbral cambia qué aprueba una compuerta, así que aplicar uno es una decisión de autoridad y debe ser de una persona: un agente que edita la configuración no puede relajar la compuerta que lo evalúa. Por eso la aplicación exige `approved-by` y `reason` escritos en la entrada, y el motor nunca los genera. Un umbral inválido (`block-at` no menor que `approve-at`, o fuera de 0 a 1) o una compuerta, evaluador o proposición desconocidos falla en voz alta nombrando la clave. Aplica solo a proposiciones booleanas; las de elección no tienen umbral. Con la cascada, el evaluador que decide es el que el recibo registra. Sin la sección el comportamiento y los recibos son los de hoy; el campo del recibo es opcional.
- Impactos de sync, migración, Docker o despliegue: ninguno.

## Plan

- Gate de plan y aprobación: **aprobado explícitamente por el PO** (gate de plan), por delegación DEL-20261006-001 del 2026-10-07 («Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06»); compuerta `plan` decidida y registrada en su recibo.
- Alcance: la sección de configuración, su validación, la aplicación por proposición y evaluador con el requisito de firma, y el registro en el recibo, con pruebas. Exclusiones: la calibración, la cláusula de la cascada y los umbrales por defecto.
- Pasos ordenados:
  1. En `config.ts` del adaptador, agregar `ThresholdOverride` y `readGateThresholds(config, gates)`: lee la lista `gate-thresholds`, valida cada entrada (compuerta conocida, evaluador entre `command`, `jev`, `llm-judge` y `cascade`, `approve-at` y `block-at` entre 0 y 1 con `block-at` menor, claves permitidas) y conserva `approved-by` y `reason` cuando existen.
  2. En `discovery.ts` del motor, exponer `gateThresholds(root)` con el patrón de lectura de las otras secciones.
  3. Crear `thresholds.ts` en el motor con `applyThresholds(propositions, overrides, gateId, evaluatorId)`: elige para cada proposición booleana la entrada más específica —proposición y evaluador, proposición, evaluador, compuerta—, ignora las que no traen `approved-by` y `reason`, devuelve las proposiciones con su `policy` y la lista de umbrales aplicados y de ignorados.
  4. En la compuerta del motor, aplicar los umbrales después de evaluar y antes de decidir, con el evaluador que respondió; anotar en el informe los ignorados por falta de firma, y guardar los aplicados en un campo opcional `thresholds` del recibo (en `receipt.ts` del paquete de compuertas), con quién los decidió y por qué.
  5. Crear `tests/umbrales-por-evaluador.test.ts`: sin sección nada cambia; una entrada firmada por evaluador cambia la decisión de una proposición en banda y queda en el recibo; la proposición gana al evaluador y este a la compuerta; una entrada sin firma se ignora y se dice; los valores inválidos y los nombres desconocidos fallan nombrando la clave; y los umbrales por defecto no se tocan. Correr la suite completa con `npx vitest run` y `npx tsc --noEmit -p tsconfig.json`.
- Rollback: revertir el commit del ticket; la sección es opt-in y sin ella no se aplica nada.

## Criterios de aceptación

- [x] Sin la sección `gate-thresholds` la decisión de las compuertas no cambia
      <!-- test: npx vitest run tests/umbrales-por-evaluador.test.ts -->
- [x] Una entrada firmada para un evaluador cambia el umbral con el que se decide una proposición booleana
      <!-- test: npx vitest run tests/umbrales-por-evaluador.test.ts -->
- [x] Una entrada por proposición gana a una por evaluador, y esta a una de toda la compuerta
      <!-- test: npx vitest run tests/umbrales-por-evaluador.test.ts -->
- [x] Una entrada sin `approved-by` o sin `reason` no se aplica y el informe lo dice
      <!-- test: npx vitest run tests/umbrales-por-evaluador.test.ts -->
- [x] El recibo registra cada umbral aplicado con quién lo decidió y por qué
      <!-- test: npx vitest run tests/umbrales-por-evaluador.test.ts -->
- [x] Un `block-at` que no es menor que `approve-at`, o un valor fuera de 0 a 1, falla nombrando la clave
      <!-- test: npx vitest run tests/umbrales-por-evaluador.test.ts -->
- [x] Una compuerta, un evaluador o una proposición desconocidos fallan nombrando la clave
      <!-- test: npx vitest run tests/umbrales-por-evaluador.test.ts -->
- [x] Los umbrales por defecto de las compuertas no cambian
      <!-- test: npx vitest run tests/gate-decide.test.ts -->

## Puntos

```json
[
  {
    "id": "POINT-001",
    "title": "Verificación delegada de FEATURE-GATE-UMBRALES-POR-EVALUADOR-20261005",
    "status": "closed",
    "severity": "normal",
    "actual": "La implementación está entregada y falta verificar sus criterios.",
    "expected": "Los criterios del ticket se cumplen y sus pruebas dan el resultado esperado.",
    "evidence": [
      "EVIDENCE-001"
    ],
    "affected_files": [
      "packages/adapter/src/config.ts",
      "packages/engine/src/discovery.ts",
      "packages/engine/src/thresholds.ts",
      "packages/engine/src/index.ts",
      "packages/engine/src/gate.ts",
      "packages/gate/src/receipt.ts",
      "tests/umbrales-por-evaluador.test.ts"
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

`packages/adapter/src/config.ts`: `ThresholdOverride` y `readGateThresholds` leen la lista opcional `gate-thresholds` de `.valmen/config.yaml` (compuerta, evaluador y proposición opcionales, `approve-at`, `block-at`, `approved-by`, `reason`) y validan la forma con errores que nombran la clave. `packages/engine/src/discovery.ts`: `gateThresholds(root)`. `packages/engine/src/thresholds.ts` (nuevo): `applyThresholds` elige, para cada proposición booleana, la entrada firmada más específica —proposición y evaluador, proposición, evaluador, compuerta— y la pone como política propia; **una entrada sin `approved-by` y `reason` no se aplica** y se informa; `validateThresholdTargets` rechaza una proposición desconocida. `packages/engine/src/gate.ts`: aplica los umbrales con el evaluador que respondió, antes de `decide`; el informe muestra los aplicados con su firma y los ignorados por falta de ella. `packages/gate/src/receipt.ts`: campo opcional `thresholds` con cada umbral aplicado, quién lo decidió y por qué. No se tocó ningún umbral por defecto y este repositorio no declara `gate-thresholds`. Pruebas nuevas: `tests/umbrales-por-evaluador.test.ts` (12). Queda fuera, a propósito, la cláusula opcional del veto de la cascada y la propuesta de umbrales (ticket de calibración).

## Pruebas

Desde la raíz del repositorio, Node 24, sin red:

1. `npx vitest run tests/umbrales-por-evaluador.test.ts` — esperado: 12 pruebas pasan.
2. `npx vitest run tests/gate-decide.test.ts` — esperado: 42 pruebas pasan (los umbrales por defecto no cambian).
3. `npx vitest run` — esperado: 158 archivos pasan y 1 omitido; 2393 pruebas pasan, 0 fallan.
4. `npx tsc --noEmit -p tsconfig.json` — sin salida.

Resultado de la ejecución del agente (2026-10-06): los cuatro comandos dieron lo esperado.

- Resultado del PO: «Cuando el ticket de la parte 1 esté cerrado, retoma el feature autonomia-confiable (hoy en decomposed) con el modo de corrida autónoma que acabas de construir. Recorre los tickets del grafo en orden de dependencias. Planes y decisiones: decide tú según tu recomendación, sin consultarme, salvo los gates humanos duros. Las pruebas por consola o Docker las ejecutas tú; si dan el resultado esperado, aprueba el QA, documéntalo y cierra el ticket. Los tickets de revisión visual o con criterios que solo yo puedo verificar quedan en awaiting_user_tests y pasas al siguiente. Commit local por ticket; push solo cuando yo lo ordene — Juan Andrade, 2026-10-06» — delegación DEL-20261006-001 del PO Juan Andrade. Las pruebas del ticket las ejecutó el agente y dieron el resultado esperado: npx vitest run: 2393 pruebas pasan y 0 fallan

## QA

```json
[
  {
    "id": "QA-001",
    "date": "2026-10-07",
    "build_reference": "commit:454a7e9b246310401cfd34c33d61884f96693e51",
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
    "description": "npx vitest run: 2393 pruebas pasan y 0 fallan",
    "reference": "worktree:sha256:e4c8c15d4e1c439934d2b4b53fdfaa90de06c1d85cdcbde0bb470282735f69a2",
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
    "technical_summary": "gate-thresholds en config.yaml, applyThresholds por proposición y evaluador con la entrada más específica, firma obligatoria (approved-by y reason) y registro en el recibo; 12 pruebas nuevas",
    "functional_summary": "El proyecto puede ajustar qué tan estricta es una compuerta con cada evaluador, pero solo un umbral firmado por una persona se aplica y el recibo dice quién lo decidió",
    "qa_status": "approved",
    "qa_waiver_reason": null,
    "po_confirmation": null,
    "release_impact": "unreleased: capacidad opt-in del motor; sin gate-thresholds nada cambia"
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
    "at": "2026-10-06T01:51:49.661Z",
    "action": "created",
    "actor": "cli",
    "details": "Ticket creado sin sobrescribir historial."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-002",
    "date": "2026-10-06",
    "at": "2026-10-07T01:21:34.671Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: intake -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-003",
    "date": "2026-10-06",
    "at": "2026-10-07T01:21:48.434Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: analyzed -> planned."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-004",
    "date": "2026-10-06",
    "at": "2026-10-07T01:22:25.740Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: planned -> approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-005",
    "date": "2026-10-06",
    "at": "2026-10-07T01:22:25.878Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: approved -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-006",
    "date": "2026-10-06",
    "at": "2026-10-07T01:24:53.484Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_progress -> awaiting_user_tests."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-007",
    "date": "2026-10-06",
    "at": "2026-10-07T01:24:53.618Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: awaiting_user_tests -> in_qa."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-008",
    "date": "2026-10-06",
    "at": "2026-10-07T01:24:53.700Z",
    "action": "point-added",
    "actor": "cli",
    "details": "Se agregó POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-009",
    "date": "2026-10-06",
    "at": "2026-10-07T01:24:53.786Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: open -> analyzed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-010",
    "date": "2026-10-06",
    "at": "2026-10-07T01:24:53.867Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: analyzed -> in_progress."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-011",
    "date": "2026-10-06",
    "at": "2026-10-07T01:24:53.944Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: in_progress -> awaiting_retest."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-012",
    "date": "2026-10-06",
    "at": "2026-10-07T01:24:54.111Z",
    "action": "evidence-added",
    "actor": "cli",
    "details": "Se agregó EVIDENCE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-013",
    "date": "2026-10-06",
    "at": "2026-10-07T01:24:54.308Z",
    "action": "qa-started",
    "actor": "cli",
    "details": "Se inició QA-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-014",
    "date": "2026-10-06",
    "at": "2026-10-07T01:24:54.386Z",
    "action": "retest-added",
    "actor": "cli",
    "details": "Se agregó RETEST-001 para POINT-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-015",
    "date": "2026-10-06",
    "at": "2026-10-07T01:24:54.461Z",
    "action": "point-transition",
    "actor": "cli",
    "details": "POINT-001: verified -> closed."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-016",
    "date": "2026-10-06",
    "at": "2026-10-07T01:24:54.538Z",
    "action": "qa-closed",
    "actor": "cli",
    "details": "Se registró QA-002 con resultado approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-017",
    "date": "2026-10-06",
    "at": "2026-10-07T01:24:54.619Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: in_qa -> qa_approved."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-018",
    "date": "2026-10-06",
    "at": "2026-10-07T01:24:54.695Z",
    "action": "ai-usage-added",
    "actor": "cli",
    "details": "Se agregó CONSUMO-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-019",
    "date": "2026-10-06",
    "at": "2026-10-07T01:24:54.774Z",
    "action": "close-attempted",
    "actor": "cli",
    "details": "Se agregó CLOSE-001."
  },
  {
    "kind": "ticket-event",
    "id": "EVENT-020",
    "date": "2026-10-06",
    "at": "2026-10-07T01:24:54.852Z",
    "action": "ticket-transition",
    "actor": "cli",
    "details": "Workflow: qa_approved -> closed."
  }
]
```
